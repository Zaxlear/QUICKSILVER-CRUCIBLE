# QUICKSILVER CRUCIBLE（《水银坩埚》）— Antigravity 项目最高工程宪法

本文件是《水银坩埚（QUICKSILVER CRUCIBLE）》仓库的最高工程准则。所有在本仓库中运行的 Agent（主 Agent、Subagent 与自动化测试脚本）在规划、编码、生成资产与执行视觉巡检时，必须无条件服从以下铁律。

---

## 1. 产品北极星与零 Demo 红线（Zero-Demo Tolerance）

本项目是对标《死亡细胞（Dead Cells）》的**商业成品级 2D 横版动作肉鸽（Action Roguelite）跨平台网页游戏**，世界观设定为**「暗黑炼金与腐化机械奇幻（Dark Alchemy & Corrupted Clockwork Fantasy）」**。

1. **严禁廉价占位符进入代码库**：
   - 严禁在任何正式场景、角色、怪物、武器、掉落物或瓦片中使用 `ctx.fillRect`、`Phaser.GameObjects.Graphics.fillRect` 纯色矩形、圆球或简陋内联几何 SVG 充当视觉表现。
   - 严禁使用原生 `AudioContext.createOscillator()` 单频电子蜂鸣音代替音效或背景音乐。
2. **强制商业级视听管线**：
   - 所有世界精灵与瓦片图层必须启用 Phaser `Light2D` 管线，并绑定配套的 `*_n.png` 法线贴图（Normal Map）。
   - 主世界摄像机必须挂载自定义 WebGL GLSL `PostFXPipeline`（含暗角辉光 `VignetteBloomPostFX` 与重击/暴击色差冲击 `ChromaticImpactPostFX`）。
   - 音频系统必须采用 `Howler.js` + Web Audio API 双轨同 BPM 自适应交叉混音（`Exploration Stem` + `Combat Stem`），并提供 `-14 LUFS` 标准化的 `.webm` 与 `.m4a` 双格式资源。
3. **强制完整内容闭环**：
   - 完整交付 4 个生态群落（矿渣蒸馏厂、矾酸暗渠、发条骸骨堂、星界熔炉之巅）、2 个多阶段大型 Boss、12 把机制迥异的武器、6 种主动技能、12 种变异、20 条元素联动词条、4 大跑图符文、碎片化环境叙事及 Local-First + Supabase 跨端云存档。

---

## 2. 锁定技术栈与运行环境约束

- **游戏引擎与语言**：`Phaser 3.80+`（强制 `Phaser.WEBGL` 模式，`render.maxLights: 24`，严禁回退 `Phaser.CANVAS`）+ `TypeScript 5.x`（`strict: true`, `noImplicitAny: true`, `noUncheckedIndexedAccess: true`）+ `Vite 6`。
- **UI 隔离覆盖层**：`Preact` + `Tailwind CSS` 挂载于独立 `#ui-root` DOM 层，配合无后处理的副摄像机 `TelegraphOverlayCam` 渲染世界空间飘字与 `[!]` 招架提示，确保全屏屏幕震动与色差着色器绝不模糊任何 UI 文字或战斗预警。
- **多端自适应输入与视口**：
  - 统一通过 `src/input/ActionMap.ts` 消费动作信号，严禁在实体或状态机内直接读取 `Keyboard`、`Gamepad` 或 `Touch` 原始事件。
  - 全面适配桌面键鼠、Xbox/DualSense/手机拉伸手柄（含双马达震动）与移动端虚拟摇杆（严格内缩 `env(safe-area-inset-*)` 避开 iOS 灵动岛与底部横条）。
  - 支持 60Hz 与 120Hz ProMotion 自适应渲染，内部物理与战斗帧采用固定 `1 / 120s` 累加器步进。
- **离线优先与双轨云存档**：
  - 本地存储：`Dexie.js (IndexedDB)` + Web Crypto `SHA-256` 规范化签名校验，监听 `visibilitychange` 与 `pagehide` 毫秒级落盘（严禁依赖 iOS 不触发的 `beforeunload`）。
  - 云端同步：`Supabase`（PostgreSQL + RLS + 匿名账号无损转正）。`meta_progressions` 强制执行 CRDT 集合并集（Set-Union）零丢失合并；`active_run_snapshots` 强制执行乐观锁修订号校验与可视化双端冲突选择框。

---

## 3. Antigravity 目录治理与上下文规范

1. **禁止废弃目录**：**严禁创建 `.agents/workflows/` 目录**。所有多步可执行流水线（AI 美术生图切图、法线图生成、音频响度标准化、浏览器视觉巡检）必须封装为 `.agents/skills/<skill-name>/SKILL.md` 及其配套 `scripts/`。
2. **规则文件体积与格式约束**：
   - 根级 `AGENTS.md` 不包含 YAML Frontmatter，文件体积必须永久保持在 **24,000 Bytes（24KB）以内**。
   - `.agents/rules/*.md` 下的所有模块化规则文件必须以合法的 YAML Frontmatter（包含 `trigger` 与 `description`）开头。
3. **权威工程设计文档索引**（编码前必须按需查阅对应分卷规格书）：
   - 架构、视口、iOS PWA 与云存档 SQL：`docs/01_ARCHITECTURE_AND_SYNC.md`
   - 帧数据、关卡切片拓扑、12 武器与 20 词条配表：`docs/02_COMBAT_AND_ROGUELITE_SPEC.md`
   - 世界观、NPC 台词、4 群落与 12 怪 + 2 Boss 行为树：`docs/03_WORLD_LORE_AND_ENEMIES.md`
   - 全局 HEX 色板、GLSL 着色器、资产/音频管线：`docs/04_ART_VFX_AUDIO_PIPELINE.md`
   - 10 阶段里程碑实施与视觉验收清单：`docs/05_ANTIGRAVITY_EXECUTION_PLAN.md`

---

## 4. 代码架构四大硬性红线

1. **单文件行数上限**：任何 `.ts` 或 `.tsx` 源码文件（纯静态配表 `src/data/*.data.ts` 除外）**严禁超过 250 行**。一旦逼近上限，必须立即按单一职责拆分子模块或状态节点。
2. **节点化角色有限状态机（FSM）**：主角动作严禁写成巨型 `switch/if-else` 文件，必须拆分为 `src/entities/player/states/` 下的 10 个独立状态类（`Idle`, `Run`, `Jump`, `DoubleJump`, `WallSlide`, `DodgeRoll`, `Parry`, `AttackCombo`, `Hurt`, `Dead`）。
3. **手工切片 + DAG 拓扑关卡**：严禁用柏林噪点（Perlin/Simplex Noise）或纯随机细胞自动机拼凑地形。所有房间必须源自经过跳跃高低差可达性校验的手工 `RoomChunk` JSON 模板，经由 `DagBiomeGenerator.ts` 与 `DoorSocketStitcher.ts` 拼接。
4. **全局确定性随机**：除纯视觉粒子微扰外，一切影响关卡结构、刷怪、暴击或掉落词条的随机调用，**严禁使用 `Math.random()`**，必须统一调用可快照序列化的 `DeterministicRng`（`Mulberry32`）。

---

## 5. 交付验收门禁（Definition of Done）

完成任何一个里程碑（Milestone）前，Agent 必须依次通过以下全部门禁，缺一不可：
1. **静态类型与行数检查**：执行 `npm run typecheck` 与行数/占位符审计脚本 `npm run audit:zero-placeholder` 零报错通过。
2. **确定性与合并单测**：执行 `npm run test` 确保 PRNG 跨端一致性、CRDT 并集幂等性、伤害联动公式与房间门锚点可达性测试 100% 通过。
3. **真实浏览器视觉巡检（Visual QA）**：启动本地开发服并在内置 Browser Subagent 中实际打开页面，截取桌面 `1920×1080` 与移动端 `iPhone Pro 横屏 (852×393)` 实机画面，逐项核对法线动态光照、后处理着色器、Preact UI 清晰度与控制台零异常。
