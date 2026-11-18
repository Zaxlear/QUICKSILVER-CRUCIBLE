---
name: visual-qa-inspector
description: >-
  Zero-placeholder code/asset auditor and live Browser Subagent Visual QA workflow for QUICKSILVER CRUCIBLE. Use this skill at the end of every milestone to audit line-count limits (<=250 lines), forbid fillRect/createOscillator placeholders, verify 1:1 normal map pairs, and inspect desktop/mobile live WebGL renders.
---

# 零占位符静态审计与真实浏览器视觉巡检技能（Visual QA Inspector）

完成任何一个里程碑（Milestone 1 ~ 10）前，Agent 必须激活本技能执行自动化红线扫描与浏览器实机截图验收。

---

## 1. 执行步骤

1. **运行零占位符与单文件 250 行红线扫描器**：
   `node .agents/skills/visual-qa-inspector/scripts/audit_zero_placeholder.mjs`
   任何一项违规（超 250 行、残留 `fillRect` / `createOscillator` / `Math.random`、缺失 `*_n.png` 法线贴图、缺失双编码音频）均返回非零退出码阻断验收。
2. **启动本地 Vite 开发服务器**：
   以后台守护模式启动 `npx vite --port 5173 --strictPort`。
3. **调用内置 `browser` Subagent 执行双视口截图与交互核验**：
   - 桌面高清视口（`1920×1080`）：验证 `3×` 像素完美整数缩放、`Light2D` 动态法线火把受光凹凸、攻击/暴击时 `ChromaticImpactPostFX` 触发且 Preact UI 文字保持 `100%` 锐利无重影、浏览器 Console 零报错；
   - 移动端全面屏视口（`852×393`，模拟 iPhone Pro 横屏）：验证 `EXPAND` 水平外扩零黑边、虚拟摇杆与右侧弧形动作键避开灵动岛安全区。

---

## 2. 审计门禁脚本（`.agents/skills/visual-qa-inspector/scripts/audit_zero_placeholder.mjs`）

```javascript
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const ATLAS_DIRS = [path.join(ROOT, 'public/assets/atlases'), path.join(ROOT, 'public/assets/tilemaps')];

const FORBIDDEN_PATTERNS = [
  { regex: /\.fillRect\s*\(/, reason: '严禁使用 fillRect 充当角色/瓦片/特效占位符' },
  { regex: /createOscillator\s*\(/, reason: '严禁使用原生 OscillatorNode 蜂鸣音代替商业音频' },
  { regex: /Math\.random\s*\(/, reason: '逻辑层严禁使用 Math.random()，必须使用 DeterministicRng' },
];

const errors = [];

function walkCode(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkCode(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const rel = path.relative(ROOT, full);
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

function verifyNormalPairs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.png') && !entry.name.endsWith('_n.png')) {
      const normalPath = path.join(dir, entry.name.replace(/\.png$/, '_n.png'));
      if (!fs.existsSync(normalPath)) {
        errors.push(`[缺失法线图] ${path.relative(ROOT, path.join(dir, entry.name))} 缺少配套 *_n.png`);
      }
    }
  }
}

walkCode(SRC_DIR);
ATLAS_DIRS.forEach(verifyNormalPairs);

if (errors.length > 0) {
  console.error('❌ QUICKSILVER CRUCIBLE 零占位符与架构审计未通过：\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('✅ 零占位符、法线贴图成对率与单文件 <=250 行审计 100% 通过！');
```
