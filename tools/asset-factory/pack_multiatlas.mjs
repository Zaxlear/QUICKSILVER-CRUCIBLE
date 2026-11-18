#!/usr/bin/env node
/**
 * Tight-trims RGBA sprite frames, assigns foot-center pivots, and packs paired
 * Diffuse + OpenGL Normal Map (*_n.png) textures into a Phaser 3.88 Light2D MultiAtlas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePngFile, encodePngFile } from './png_codec.mjs';

function parseArgs(argv) {
  const args = {
    src: '',
    out: '',
    pivotX: 0.5,
    pivotY: 1.0,
    padding: 2,
    noTrim: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--src') args.src = argv[++i] ?? '';
    else if (k === '--out') args.out = argv[++i] ?? '';
    else if (k === '--pivot-x') args.pivotX = Number(argv[++i] ?? 0.5);
    else if (k === '--pivot-y') args.pivotY = Number(argv[++i] ?? 1.0);
    else if (k === '--padding') args.padding = Number(argv[++i] ?? 2);
    else if (k === '--no-trim') args.noTrim = true;
  }
  if (!args.src || !args.out) {
    throw new Error('Usage: node pack_multiatlas.mjs --src <dir> --out <out_base_path>');
  }
  return args;
}

function naturalFrameCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function computeOpaqueBounds(width, height, rgba, noTrim) {
  if (noTrim) {
    return { trimmed: false, x: 0, y: 0, w: width, h: height };
  }
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { trimmed: true, x: Math.floor(width / 2), y: height - 1, w: 1, h: 1 };
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const trimmed = minX > 0 || minY > 0 || w < width || h < height;
  return { trimmed, x: minX, y: minY, w, h };
}

function nextPow2(v) {
  let p = 32;
  while (p < v) p *= 2;
  return p;
}

function shelfPackFrames(items, padding) {
  const totalArea = items.reduce((acc, it) => acc + (it.bounds.w + padding * 2) * (it.bounds.h + padding * 2), 0);
  let targetWidth = nextPow2(Math.max(128, Math.ceil(Math.sqrt(totalArea * 1.25))));

  const sorted = [...items].sort((a, b) => b.bounds.h - a.bounds.h || naturalFrameCompare(a.name, b.name));

  while (true) {
    let curX = padding;
    let curY = padding;
    let rowH = 0;
    let fitsWidth = true;

    for (const item of sorted) {
      const bw = item.bounds.w;
      const bh = item.bounds.h;
      if (bw + padding * 2 > targetWidth) {
        fitsWidth = false;
        break;
      }
      if (curX + bw + padding > targetWidth) {
        curX = padding;
        curY += rowH + padding;
        rowH = 0;
      }
      item.atlasX = curX;
      item.atlasY = curY;
      curX += bw + padding;
      if (bh > rowH) rowH = bh;
    }

    const usedHeight = curY + rowH + padding;
    if (fitsWidth && usedHeight <= targetWidth * 2) {
      return { atlasW: targetWidth, atlasH: nextPow2(usedHeight) };
    }
    targetWidth *= 2;
  }
}

function main() {
  const cfg = parseArgs(process.argv);
  const srcDir = path.resolve(cfg.src);
  const outBase = path.resolve(cfg.out.replace(/\.(json|png)$/i, ''));
  const outDir = path.dirname(outBase);
  const atlasStem = path.basename(outBase);

  fs.mkdirSync(outDir, { recursive: true });

  const frameFiles = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith('.png') && !f.endsWith('_n.png'))
    .sort(naturalFrameCompare);

  if (frameFiles.length === 0) {
    throw new Error(`No diffuse frame PNGs found in ${srcDir}`);
  }

  const items = frameFiles.map((file) => {
    const name = file.replace(/\.png$/, '');
    const diffPath = path.join(srcDir, file);
    const normPath = path.join(srcDir, `${name}_n.png`);
    if (!fs.existsSync(normPath)) {
      throw new Error(`Missing paired normal map frame: ${normPath}`);
    }
    const diff = decodePngFile(diffPath);
    const norm = decodePngFile(normPath);
    if (diff.width !== norm.width || diff.height !== norm.height) {
      throw new Error(`Dimension mismatch between ${file} and ${name}_n.png`);
    }
    const bounds = computeOpaqueBounds(diff.width, diff.height, diff.data, cfg.noTrim);
    return {
      name,
      sourceW: diff.width,
      sourceH: diff.height,
      diffData: diff.data,
      normData: norm.data,
      bounds,
      atlasX: 0,
      atlasY: 0,
    };
  });

  const { atlasW, atlasH } = shelfPackFrames(items, cfg.padding);
  const atlasDiffuse = new Uint8Array(atlasW * atlasH * 4);
  const atlasNormal = new Uint8Array(atlasW * atlasH * 4);

  // Fill entire normal atlas canvas with flat OpenGL neutral normal #8080FF (128, 128, 255, 255)
  for (let px = 0; px < atlasW * atlasH; px++) {
    const idx = px * 4;
    atlasNormal[idx] = 128;
    atlasNormal[idx + 1] = 128;
    atlasNormal[idx + 2] = 255;
    atlasNormal[idx + 3] = 255;
  }

  for (const item of items) {
    const { x: sx, y: sy, w: bw, h: bh } = item.bounds;
    for (let dy = 0; dy < bh; dy++) {
      for (let dx = 0; dx < bw; dx++) {
        const srcIdx = ((sy + dy) * item.sourceW + (sx + dx)) * 4;
        const dstIdx = ((item.atlasY + dy) * atlasW + (item.atlasX + dx)) * 4;

        atlasDiffuse[dstIdx] = item.diffData[srcIdx];
        atlasDiffuse[dstIdx + 1] = item.diffData[srcIdx + 1];
        atlasDiffuse[dstIdx + 2] = item.diffData[srcIdx + 2];
        atlasDiffuse[dstIdx + 3] = item.diffData[srcIdx + 3];

        atlasNormal[dstIdx] = item.normData[srcIdx];
        atlasNormal[dstIdx + 1] = item.normData[srcIdx + 1];
        atlasNormal[dstIdx + 2] = item.normData[srcIdx + 2];
        atlasNormal[dstIdx + 3] = 255;
      }
    }
  }

  const imageFile = `${atlasStem}.png`;
  const normalFile = `${atlasStem}_n.png`;
  const jsonFile = `${atlasStem}.json`;

  encodePngFile(path.join(outDir, imageFile), atlasW, atlasH, atlasDiffuse);
  encodePngFile(path.join(outDir, normalFile), atlasW, atlasH, atlasNormal);

  // Restore deterministic natural order in JSON frames array
  const orderedFrames = [...items]
    .sort((a, b) => naturalFrameCompare(a.name, b.name))
    .map((item) => ({
      filename: item.name,
      rotated: false,
      trimmed: item.bounds.trimmed,
      sourceSize: { w: item.sourceW, h: item.sourceH },
      spriteSourceSize: {
        x: item.bounds.x,
        y: item.bounds.y,
        w: item.bounds.w,
        h: item.bounds.h,
      },
      frame: {
        x: item.atlasX,
        y: item.atlasY,
        w: item.bounds.w,
        h: item.bounds.h,
      },
      pivot: { x: cfg.pivotX, y: cfg.pivotY },
    }));

  const multiAtlasJson = {
    textures: [
      {
        image: imageFile,
        normalMap: normalFile,
        format: 'RGBA8888',
        size: { w: atlasW, h: atlasH },
        scale: 1,
        frames: orderedFrames,
      },
    ],
    meta: {
      app: 'quicksilver-crucible-asset-factory',
      version: '1.0.0',
      frameCount: orderedFrames.length,
    },
  };

  fs.writeFileSync(path.join(outDir, jsonFile), JSON.stringify(multiAtlasJson, null, 2) + '\n');
  console.log(
    `✅ Packed MultiAtlas ${atlasStem}: ${orderedFrames.length} frames -> ${atlasW}x${atlasH} (${imageFile} + ${normalFile})`
  );
}

main();
