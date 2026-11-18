import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ELEMENT_STATUS_GLOW,
  LOCKED_PALETTE_48_HEX,
  LOCKED_PALETTE_48_RGB,
  LOCKED_PALETTE_SET,
} from '../../src/data/palette.data';
import { deriveDeterministicPhase, evaluateTorchFlicker } from '../../src/render/LightMath';
import {
  AUTOTILE_BIT_E,
  AUTOTILE_BIT_N,
  AUTOTILE_BIT_NE,
  AUTOTILE_BIT_NW,
  AUTOTILE_BIT_S,
  AUTOTILE_BIT_SE,
  AUTOTILE_BIT_SW,
  AUTOTILE_BIT_W,
  CANONICAL_BLOB_47_MASKS,
  computeGridAutotileIndex,
  gateBlobBitmask,
  resolveAutotile47Index,
} from '../../src/world/AutotileBitmask47';

describe('Global Locked 48-Color Dark Alchemy Palette', () => {
  it('contains exactly 48 unique valid uppercase #RRGGBB colors and 6 element status anchors', () => {
    expect(LOCKED_PALETTE_48_HEX).toHaveLength(48);
    expect(LOCKED_PALETTE_SET.size).toBe(48);
    expect(LOCKED_PALETTE_48_RGB).toHaveLength(48);

    for (const hex of LOCKED_PALETTE_48_HEX) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }

    const statuses = Object.keys(ELEMENT_STATUS_GLOW);
    expect(statuses).toEqual([
      'oiled',
      'ignited',
      'bleeding',
      'frozen',
      'electrified',
      'poisoned',
    ]);
    for (const spec of Object.values(ELEMENT_STATUS_GLOW)) {
      expect(spec.coreHex).toMatch(/^#[0-9A-F]{6}$/);
      expect(spec.lightHex).toMatch(/^#[0-9A-F]{6}$/);
      expect(spec.bloomEdgeHex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('47-Tile Blob Autotile Bitmask Solver', () => {
  it('converges all 256 raw 8-neighbor bitmasks into exactly 47 canonical states', () => {
    expect(CANONICAL_BLOB_47_MASKS).toHaveLength(47);

    const seenIndices = new Set<number>();
    for (let raw = 0; raw < 256; raw++) {
      const idx = resolveAutotile47Index(raw);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(47);
      seenIndices.add(idx);

      // Idempotence: gating an already-gated mask must return itself
      const gated = gateBlobBitmask(raw);
      expect(gateBlobBitmask(gated)).toBe(gated);
    }
    expect(seenIndices.size).toBe(47);
  });

  it('ignores isolated diagonal neighbors unless both adjacent cardinals are solid', () => {
    const isolatedDiagonals = AUTOTILE_BIT_NE | AUTOTILE_BIT_SE | AUTOTILE_BIT_SW | AUTOTILE_BIT_NW;
    expect(gateBlobBitmask(isolatedDiagonals)).toBe(0);
    expect(resolveAutotile47Index(isolatedDiagonals)).toBe(0);

    const fullInterior =
      AUTOTILE_BIT_N |
      AUTOTILE_BIT_NE |
      AUTOTILE_BIT_E |
      AUTOTILE_BIT_SE |
      AUTOTILE_BIT_S |
      AUTOTILE_BIT_SW |
      AUTOTILE_BIT_W |
      AUTOTILE_BIT_NW;
    expect(resolveAutotile47Index(fullInterior)).toBe(46);

    const gridSolid = (x: number, y: number) => x >= 0 && x <= 2 && y >= 0 && y <= 2;
    expect(computeGridAutotileIndex(gridSolid, 1, 1)).toBe(46);
  });
});

describe('LightingDirector Pure Math & 5 Custom GLSL Shaders + Hero MultiAtlas', () => {
  it('evaluates dual-sine torch flicker deterministically within expected amplitude bounds', () => {
    const phaseA = deriveDeterministicPhase(120, -48, 1);
    const phaseB = deriveDeterministicPhase(120, -48, 1);
    expect(phaseA).toBe(phaseB);

    for (let step = 0; step < 60; step++) {
      const res = evaluateTorchFlicker(2.0, 160, 0.15, step * 0.05, phaseA);
      expect(res.intensity).toBeGreaterThanOrEqual(2.0 * (1 - 0.15) - 1e-6);
      expect(res.intensity).toBeLessThanOrEqual(2.0 * (1 + 0.15) + 1e-6);
      expect(res.radiusPx).toBeGreaterThanOrEqual(160 * 0.95 - 1e-6);
      expect(res.radiusPx).toBeLessThanOrEqual(160 * 1.05 + 1e-6);
    }
  });

  it('verifies all 5 required GLSL fragment shaders and Vessel-09 10-state MultiAtlas', () => {
    const shaderDir = path.resolve(process.cwd(), 'src/render/shaders');
    const requiredUniforms: Record<string, string[]> = {
      'hit_flash.frag': ['uMainSampler', 'uFlashAmount', 'uFlashColor'],
      'ash_dissolve.frag': ['uMainSampler', 'uProgress', 'uNoiseScale'],
      'shield_refract.frag': ['uMainSampler', 'uTime', 'uShieldCenter', 'uShieldRadius', 'uAspect'],
      'chromatic_impact.frag': ['uMainSampler', 'uIntensity', 'uImpactCenter'],
      'vignette_bloom.frag': ['uMainSampler', 'uResolution', 'uBloomStrength', 'uBloomThreshold', 'uVignetteDarkness'],
    };

    for (const [fileName, uniforms] of Object.entries(requiredUniforms)) {
      const content = fs.readFileSync(path.join(shaderDir, fileName), 'utf8');
      for (const u of uniforms) {
        expect(content).toContain(`uniform`);
        expect(content).toContain(u);
      }
    }

    const atlasJsonPath = path.resolve(process.cwd(), 'public/assets/atlases/hero_atlas.json');
    const atlas = JSON.parse(fs.readFileSync(atlasJsonPath, 'utf8'));
    expect(atlas.textures).toHaveLength(1);
    expect(atlas.textures[0].image).toBe('hero_atlas.png');
    expect(atlas.textures[0].normalMap).toBe('hero_atlas_n.png');
    expect(atlas.textures[0].frames).toHaveLength(59);

    const expectedStateCounts: Record<string, number> = {
      hero_idle: 6,
      hero_run: 8,
      hero_jump_fall: 4,
      hero_djump: 4,
      hero_wall_slide: 3,
      hero_dodge_roll: 6,
      hero_parry: 5,
      hero_atk_slash: 12,
      hero_hurt: 3,
      hero_collapse: 8,
    };
    const frameSet = new Set<string>(atlas.textures[0].frames.map((f: { filename: string }) => f.filename));
    for (const [prefix, count] of Object.entries(expectedStateCounts)) {
      for (let i = 0; i < count; i++) {
        expect(frameSet.has(`${prefix}_${i}`)).toBe(true);
      }
    }
  });
});
