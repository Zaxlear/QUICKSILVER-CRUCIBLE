import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCKED_PALETTE_SET } from '../../src/data/palette.data';
import { decodePngFile, encodePngFile } from '../../tools/asset-factory/png_codec.mjs';

describe('Asset Factory & Audio Mastering Pipelines End-to-End', () => {
  let tmpDir = '';

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-m2-pipeline-'));
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('purges semi-transparent fringes, locks to 48-palette, generates #8080FF normal maps, and packs MultiAtlas', () => {
    const rawPng = path.join(tmpDir, 'raw_test.png');
    const quantDir = path.join(tmpDir, 'quant');
    fs.mkdirSync(quantDir, { recursive: true });
    const quantPng = path.join(quantDir, 'test_frame_0.png');
    const outAtlasBase = path.join(tmpDir, 'packed_test');

    // Construct synthetic 32x32 image with #FF00FF background, semi-transparent fringe, and off-palette neon RGB
    const w = 32;
    const h = 32;
    const buf = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (x >= 10 && x <= 21 && y >= 8 && y <= 27) {
          buf[idx] = 201;
          buf[idx + 1] = 211;
          buf[idx + 2] = 223;
          buf[idx + 3] = x === 10 ? 95 : 255; // Semi-transparent fringe at x=10 (<140 -> purged to 0)
        } else {
          buf[idx] = 255;
          buf[idx + 1] = 0;
          buf[idx + 2] = 255;
          buf[idx + 3] = 255;
        }
      }
    }
    encodePngFile(rawPng, w, h, buf);

    execFileSync('python3', [
      'tools/asset-factory/quantize_palette.py',
      '--input',
      rawPng,
      '--output',
      quantPng,
    ]);

    execFileSync('python3', [
      'tools/asset-factory/normal_map_sobel.py',
      '--diffuse',
      quantPng,
    ]);

    const decodedQuant = decodePngFile(quantPng);
    const decodedNorm = decodePngFile(path.join(quantDir, 'test_frame_0_n.png'));

    for (let px = 0; px < w * h; px++) {
      const idx = px * 4;
      const a = decodedQuant.data[idx + 3]!;
      expect(a === 0 || a === 255).toBe(true);
      if (a === 255) {
        const hex =
          '#' +
          [decodedQuant.data[idx]!, decodedQuant.data[idx + 1]!, decodedQuant.data[idx + 2]!]
            .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
            .join('');
        expect(LOCKED_PALETTE_SET.has(hex)).toBe(true);
      } else {
        // Transparent pixels in normal map must equal neutral flat OpenGL normal (128, 128, 255, 255)
        expect(decodedNorm.data[idx]).toBe(128);
        expect(decodedNorm.data[idx + 1]).toBe(128);
        expect(decodedNorm.data[idx + 2]).toBe(255);
        expect(decodedNorm.data[idx + 3]).toBe(255);
      }
    }

    execFileSync(process.execPath, [
      'tools/asset-factory/pack_multiatlas.mjs',
      '--src',
      quantDir,
      '--out',
      outAtlasBase,
    ]);

    expect(fs.existsSync(`${outAtlasBase}.json`)).toBe(true);
    expect(fs.existsSync(`${outAtlasBase}.png`)).toBe(true);
    expect(fs.existsSync(`${outAtlasBase}_n.png`)).toBe(true);
  });

  it('cuts 1-sample-identical dual-stem zero-crossing loops and normalizes loudness to -14 LUFS', () => {
    const exploreRaw = path.join(tmpDir, 'explore_raw.wav');
    const combatRaw = path.join(tmpDir, 'combat_raw.wav');
    const exploreLoop = path.join(tmpDir, 'explore_loop.wav');
    const combatLoop = path.join(tmpDir, 'combat_loop.wav');
    const exploreNorm = path.join(tmpDir, 'explore_norm.wav');

    const synthScript = path.join(tmpDir, 'synth_stems.py');
    fs.writeFileSync(
      synthScript,
      `import sys
sys.path.insert(0, 'tools/audio-pipeline')
from zero_cross_loop import write_wav_pcm24
import numpy as np

sr = 48000
t1 = np.arange(int(sr * 4.2)) / sr
t2 = np.arange(int(sr * 4.5)) / sr
sig1 = np.column_stack([0.05 * np.sin(2 * np.pi * 220 * t1), 0.05 * np.sin(2 * np.pi * 330 * t1)])
sig2 = np.column_stack([0.08 * np.sin(2 * np.pi * 110 * t2), 0.08 * np.sin(2 * np.pi * 440 * t2)])
write_wav_pcm24(${JSON.stringify(exploreRaw)}, sig1, sr)
write_wav_pcm24(${JSON.stringify(combatRaw)}, sig2, sr)
`
    );
    execFileSync('python3', [synthScript]);

    execFileSync('python3', [
      'tools/audio-pipeline/zero_cross_loop.py',
      '--input',
      exploreRaw,
      '--output',
      exploreLoop,
      '--bpm',
      '136',
      '--bars',
      '2',
    ]);
    execFileSync('python3', [
      'tools/audio-pipeline/zero_cross_loop.py',
      '--input',
      combatRaw,
      '--output',
      combatLoop,
      '--bpm',
      '136',
      '--bars',
      '2',
    ]);

    execFileSync('python3', [
      'tools/audio-pipeline/normalize_lufs.py',
      '--input',
      exploreLoop,
      '--output',
      exploreNorm,
      '--target-lufs',
      '-14.0',
    ]);

    const probeScript = path.join(tmpDir, 'probe_stems.py');
    fs.writeFileSync(
      probeScript,
      `import json, sys
sys.path.insert(0, 'tools/audio-pipeline')
from zero_cross_loop import read_wav_float64
from normalize_lufs import measure_integrated_lufs

e_loop, sr1 = read_wav_float64(${JSON.stringify(exploreLoop)})
c_loop, sr2 = read_wav_float64(${JSON.stringify(combatLoop)})
e_norm, sr3 = read_wav_float64(${JSON.stringify(exploreNorm)})
lufs = measure_integrated_lufs(e_norm, sr3)
peak = float(abs(e_norm).max())
print(json.dumps({
  "exploreSamples": int(e_loop.shape[0]),
  "combatSamples": int(c_loop.shape[0]),
  "lufs": lufs,
  "peak": peak
}))
`
    );
    const probeJson = execFileSync('python3', [probeScript], { encoding: 'utf8' });

    const metrics = JSON.parse(probeJson.trim());
    // Exact 1-sample lock between Exploration Stem and Combat Stem (2 bars @ 136 BPM, 4/4, 48kHz = 169412 samples)
    expect(metrics.exploreSamples).toBe(metrics.combatSamples);
    expect(metrics.exploreSamples).toBe(Math.round(((2 * 4 * 60) / 136) * 48000));
    expect(metrics.lufs).toBeGreaterThan(-14.6);
    expect(metrics.lufs).toBeLessThan(-13.4);
    expect(metrics.peak).toBeLessThanOrEqual(Math.pow(10, -1.0 / 20.0) + 1e-3);
  });
});
