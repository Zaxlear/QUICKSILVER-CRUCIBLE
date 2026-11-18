#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePngFile } from '../../../../tools/asset-factory/png_codec.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const SRC_DIR = path.join(ROOT, 'src');
const ATLAS_DIRS = [
  path.join(ROOT, 'public/assets/atlases'),
  path.join(ROOT, 'public/assets/tilemaps'),
];
const AUDIO_DIR = path.join(ROOT, 'public/assets/audio');

// 与 src/data/palette.data.ts 100% 锁定的 48 色主色板
const LOCKED_PALETTE_48_SET = new Set([
  '#0B0C10', '#11131C', '#161824', '#1E2233', '#272C42', '#323954', '#414A6B', '#556085',
  '#7C8599', '#9AA5B8', '#B8C4D4', '#D4DEE8', '#E8EFF5', '#F8FAFC',
  '#291A0E', '#3D2817', '#593A1E', '#7A5128', '#9E6B34', '#C28B42', '#E0AE53', '#FBBF24',
  '#240B12', '#3B121E', '#591B2B', '#7D2438', '#A62B44', '#CF3650', '#E11D48', '#FB7185',
  '#0B1F1D', '#12332F', '#1B4D46', '#266B60', '#328F7D', '#22C55E', '#3CE682', '#A3E635',
  '#431407', '#7C2D12', '#C2410C', '#EA580C', '#FF5E2B', '#FDBA74',
  '#3B0764', '#6D28D9', '#A855F7', '#38BDF8',
]);

const FORBIDDEN_PATTERNS = [
  { regex: /\.fillRect\s*\(/, reason: '严禁使用 fillRect 充当角色/瓦片/特效占位符' },
  { regex: /createOscillator\s*\(/, reason: '严禁使用原生 OscillatorNode 蜂鸣音代替商业音频' },
  { regex: /Math\.random\s*\(/, reason: '逻辑层严禁使用 Math.random()，必须使用 DeterministicRng' },
];

const errors = [];
let auditedPngPairs = 0;

function byteHex(n) {
  return n.toString(16).padStart(2, '0').toUpperCase();
}

function walkCode(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkCode(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const rel = path.relative(ROOT, full).split(path.sep).join('/');
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split('\n').length;
      if (!rel.startsWith('src/data/') && lines > 250) {
        errors.push(`[行数越界] ${rel} 共 ${lines} 行（最高上限 250 行）`);
      }
      for (const rule of FORBIDDEN_PATTERNS) {
        if (rule.regex.test(content) && !rel.includes('VisualFxRng')) {
          errors.push(`[红线违禁] ${rel}: ${rule.reason}`);
        }
      }
    }
  }
}

function auditDiffuseAndNormalPair(diffusePath, normalPath) {
  const relDiff = path.relative(ROOT, diffusePath).split(path.sep).join('/');
  const relNorm = path.relative(ROOT, normalPath).split(path.sep).join('/');

  const diff = decodePngFile(diffusePath);
  const norm = decodePngFile(normalPath);

  if (diff.width !== norm.width || diff.height !== norm.height) {
    errors.push(
      `[法线尺寸失配] ${relDiff} (${diff.width}x${diff.height}) !== ${relNorm} (${norm.width}x${norm.height})`
    );
    return;
  }

  let semiTransparentCount = 0;
  const illegalColors = new Set();
  const totalPixels = diff.width * diff.height;

  for (let px = 0; px < totalPixels; px++) {
    const idx = px * 4;
    const a = diff.data[idx + 3];
    if (a !== 0 && a !== 255) {
      semiTransparentCount++;
    } else if (a === 255) {
      const hex = `#${byteHex(diff.data[idx])}${byteHex(diff.data[idx + 1])}${byteHex(diff.data[idx + 2])}`;
      if (!LOCKED_PALETTE_48_SET.has(hex)) {
        illegalColors.add(hex);
      }
    }
  }

  if (semiTransparentCount > 0) {
    errors.push(
      `[半透明白边违禁] ${relDiff} 检测到 ${semiTransparentCount} 个非二值 Alpha 像素（仅允许 0 或 255）`
    );
  }
  if (illegalColors.size > 0) {
    const sample = Array.from(illegalColors).slice(0, 6).join(', ');
    errors.push(
      `[色板越界] ${relDiff} 含 ${illegalColors.size} 种非 48 色锁定色板颜色（示例: ${sample}）`
    );
  }

  // 核验法线图非全平坦退化且 Alpha 为 255
  let nonFlatNormals = 0;
  let invalidNormalAlpha = 0;
  for (let px = 0; px < totalPixels; px++) {
    const idx = px * 4;
    if (norm.data[idx + 3] !== 255) invalidNormalAlpha++;
    if (norm.data[idx] !== 128 || norm.data[idx + 1] !== 128 || norm.data[idx + 2] !== 255) {
      nonFlatNormals++;
    }
  }
  if (invalidNormalAlpha > 0) {
    errors.push(`[法线Alpha异常] ${relNorm} 含 ${invalidNormalAlpha} 个非不透明像素`);
  }
  if (nonFlatNormals === 0) {
    errors.push(`[退化空壳法线图] ${relNorm} 全部像素均为平坦 #8080FF，缺失真实凹凸梯度`);
  }

  auditedPngPairs++;
}

function verifyNormalPairs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      verifyNormalPairs(full);
    } else if (entry.isFile() && entry.name.endsWith('.png') && !entry.name.endsWith('_n.png')) {
      const normalPath = path.join(dir, entry.name.replace(/\.png$/, '_n.png'));
      if (!fs.existsSync(normalPath)) {
        errors.push(`[缺失法线图] ${path.relative(ROOT, full)} 缺少配套 *_n.png`);
      } else {
        auditDiffuseAndNormalPair(full, normalPath);
      }
    }
  }
}

let auditedAudioPairs = 0;

function verifyAudioCodecPairs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      verifyAudioCodecPairs(full);
    } else if (entry.isFile() && entry.name.endsWith('.webm')) {
      const m4aPath = path.join(dir, entry.name.replace(/\.webm$/, '.m4a'));
      if (!fs.existsSync(m4aPath)) {
        errors.push(`[缺失双编码音频] ${path.relative(ROOT, full)} 缺少姊妹文件 *.m4a`);
      } else {
        const wSize = fs.statSync(full).size;
        const mSize = fs.statSync(m4aPath).size;
        if (wSize < 256 || mSize < 256) {
          errors.push(`[损坏音频容器] ${path.relative(ROOT, full)} 体积异常 (${wSize}B / ${mSize}B)`);
        } else {
          auditedAudioPairs++;
        }
      }
    } else if (entry.isFile() && entry.name.endsWith('.m4a')) {
      const webmPath = path.join(dir, entry.name.replace(/\.m4a$/, '.webm'));
      if (!fs.existsSync(webmPath)) {
        errors.push(`[缺失双编码音频] ${path.relative(ROOT, full)} 缺少姊妹文件 *.webm`);
      }
    }
  }
}

walkCode(SRC_DIR);
ATLAS_DIRS.forEach(verifyNormalPairs);
verifyAudioCodecPairs(AUDIO_DIR);

if (errors.length > 0) {
  console.error(
    '❌ QUICKSILVER CRUCIBLE 零占位符与架构审计未通过：\n' + errors.map((e) => `  - ${e}`).join('\n')
  );
  process.exit(1);
}
console.log(
  `✅ 零占位符、48 色锁定色板、二值 Alpha、${auditedPngPairs} 组法线对、${auditedAudioPairs} 组双编码音频与单文件 <=250 行审计 100% 通过！`
);
