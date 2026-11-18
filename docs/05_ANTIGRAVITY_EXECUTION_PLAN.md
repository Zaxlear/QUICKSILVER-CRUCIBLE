# 《水银坩埚（QUICKSILVER CRUCIBLE）》Antigravity 10 阶段里程碑原子实施与视觉巡检路线图

> **文档编号**：`docs/05_ANTIGRAVITY_EXECUTION_PLAN.md`  
> **版本**：`v1.0.0-commercial`  
> **推荐执行工作流**：在 Antigravity 中开启每一阶段前，建议配合 `/plan` 命令载入对应里程碑上下文，并在里程碑收尾时激活 [visual-qa-inspector](file:///Users/karl/Documents/GitHub/QUICKSILVER%20CRUCIBLE/.agents/skills/visual-qa-inspector/SKILL.md) 调起内置 `browser` Subagent 完成实机截图验收。

---

## 全局里程碑通用门禁（Universal Milestone Gates）

任何一个里程碑在标记 `[DONE]` 进入下一阶段前，必须同时满足以下三条硬性门禁：
1. **架构与零占位符红线门禁**：`npm run typecheck && node .agents/skills/visual-qa-inspector/scripts/audit_zero_placeholder.mjs` 退出码为 `0`（所有逻辑文件 `≤ 250 行`，零 `fillRect` 伪精灵，零 `createOscillator` 蜂鸣音，零裸 `Math.random`，漫反射与 `*_n.png` 法线图 `100%` 成对）。
2. **确定性单测门禁**：`npm run test`（Vitest）全绿通过。
3. **内置 Browser Subagent 实机视觉巡检（Live Browser Visual QA）**：启动本地 Vite 服务并在浏览器子代理中打开实机页面，采集桌面 `1920×1080` 与移动端 `852×393 (iPhone Pro 横屏)` 双视口截图，逐条勾稽当期视觉检查表且浏览器 Console 零 `WebGL Warning / Uncaught Error`。

---

## Milestone 1：工程底座、双摄像机视口矩阵与 120Hz 固定步长内核

- **交付文件范围**：
  - `package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`public/manifest.webmanifest`
  - `src/main.ts`、`src/core/GameApp.ts`、`src/core/Constants.ts`、`src/core/ClockController.ts`、`src/core/DeterministicRng.ts`、`src/core/EventBus.ts`、`src/core/ObjectPool.ts`
  - `src/render/ViewportScaler.ts`、`src/render/CameraRig.ts`、`src/ui/UiOverlayRoot.tsx`
  - `.agents/skills/visual-qa-inspector/scripts/audit_zero_placeholder.mjs`
  - `tests/unit/DeterministicRng.test.ts`
- **编译与单测门禁**：
  - `DeterministicRng` 使用相同种子在序列化/反序列化前后连续生成 `10,000` 个浮点数与整数，断言 `100%` 比特级相等；
  - `ViewportScaler` 单测覆盖 `1920×1080 (3×)`、`2560×1440 (4×)`、`852×393 DPR 3 (780×360 EXPAND)`、`1194×834 (640×448 EXPAND)` 四组典型视口。
- **Browser Visual QA 巡检检查项**：
  - [ ] 打开 `http://localhost:5173`，确认 `Phaser.Game` 以 `Phaser.WEBGL` 模式初始化成功（`renderer.type === 2`）；
  - [ ] 在 `1920×1080` 与 `852×393` 两个窗口尺寸下截图，确认无黑边且 `#ui-root` Preact 调试角标严格内缩于 `safe-area` 之内；
  - [ ] 模拟 `852×393 -> 393×852` 竖屏旋转，确认自动弹出暗黑炼金星盘“请横向握持设备”暂停遮罩，切回横屏后 `0ms` 自动恢复。

---

## Milestone 2：自动化资产工厂、5 大 GLSL 着色器与首批法线图集落盘

- **交付文件范围**：
  - `tools/asset-factory/generate_sprite.py`、`quantize_palette.py`、`normal_map_sobel.py`、`pack_multiatlas.mjs`
  - `tools/audio-pipeline/zero_cross_loop.py`、`normalize_lufs.py`、`export_dual_codec.sh`
  - `src/data/palette.data.ts`、`src/render/LightingDirector.ts`
  - `src/render/shaders/*.frag`（5 大片元着色器全集）与 `src/render/pipelines/*.ts`（5 大管线类）
  - 产出主角 `Vessel-09` 全 10 状态 MultiAtlas（含 `hero_atlas.png` + `hero_atlas_n.png`）与第一层矿渣蒸馏厂 47-Tile 法线瓦片集及 5 层视差图。
- **编译与单测门禁**：
  - 运行 `audit_zero_placeholder.mjs` 校验生成的 PNG 不含半透明白边杂色（Alpha 仅含 `0` 或 `255`），且所有像素色值属于 48 色锁定色板子集。
- **Browser Visual QA 巡检检查项**：
  - [ ] 在 `PreloadScene` -> 测试展示台中，驱动一盏动态琥珀色火把点光源绕主角与矿渣砖墙做圆周运动，截图确认角色白瓷胸甲与砖块边缘呈现出清晰的法线凹凸明暗过渡；
  - [ ] 依次触发 `HitFlash`、`AshDissolve`、`ShieldRefract`、`ChromaticImpact`、`VignetteBloom` 五项着色器开关，截图核对辉光、灰烬橙金余烬边与边缘色差撕裂效果正常，且 `TelegraphOverlayCam` 上的测试伤害字完全不被色差模糊。

---

## Milestone 3：多端热切换输入总线与主角 10 状态节点化 FSM

- **交付文件范围**：
  - `src/input/ActionMap.ts`、`KeyboardMouseProvider.ts`、`GamepadProvider.ts`、`TouchVirtualPadProvider.ts`、`HapticsManager.ts`
  - `src/entities/player/PlayerEntity.ts`、`PlayerPhysics.ts`、`src/render/GhostTrailRenderer.ts`
  - `src/entities/player/states/` 全部 **10 个独立状态类文件** + `IPlayerState.ts` + `PlayerStateMachine.ts`
  - `src/ui/TouchControlsOverlay.tsx`
- **编译与单测门禁**：
  - 状态机单测验证：地面走出平台 `11 ticks` 内起跳成功（土狼时间生效）、第 `13 ticks` 转为二段跳；落地前 `13 ticks` 按跳跃在触地第 `1 tick` 自动起跳（输入缓冲生效）；`DodgeRollState` 第 `1~32 ticks` `isInvulnerable === true`，第 `34 tick` 可被跳跃提前取消。
- **Browser Visual QA 巡检检查项**：
  - [ ] 在桌面浏览器实机操控主角完成：疾跑急停尘雾、可变跳高（轻点小跳 vs 长按大跳）、二段跳水银气浪、贴墙滑落蹬墙反跳、翻滚青蓝残影及下蹲穿透单向木平台；
  - [ ] 切换至移动端触控视口（`852×393`），测试左半屏任意点按下动态唤出浮动虚拟摇杆，右侧弧形动作键按下高亮反馈且底部留足防误触净空。

---

## Milestone 4：手工 `RoomChunk` 切片库、DAG 拓扑拼接器与四大探索符文机关

- **交付文件范围**：
  - `src/world/RoomChunkSchema.ts`、`DagBiomeGenerator.ts`、`DoorSocketStitcher.ts`、`ParallaxComposer.ts`、`TrapController.ts`、`TeleporterNetwork.ts`
  - `public/assets/tilemaps/chunks/`（首批第一层完整切片库：起点、6 种战斗变体、精英房、商店、剧情房、传送枢纽、藤蔓隐藏房、出口）
  - `src/data/runes.data.ts`、`tests/topology/DagReachability.test.ts`
- **编译与单测门禁**：
  - `DagReachability.test.ts` 随机遍历 `500` 个不同 `runSeed` 生成全图，断言 `100%` 种子无 AABB 房间重叠、主干路径无未解锁符文阻断、所有 `DoorSocket` 拼接处地面 Y 坐标零像素落差。
- **Browser Visual QA 巡检检查项**：
  - [ ] 实机从 `ENTRANCE` 一路跑图至 `EXIT`，观察 5 层视差背景平滑错位滚动、走廊桥接处无缝过渡、酸液间歇泉与蒸汽火焰喷口周期预警正常；
  - [ ] 打开右上角小地图点击已激活的传送石碑，验证水银流光秒传动画与镜头平滑归位。

---

## Milestone 5：核心战斗判定、分级顿帧、创伤震动、橙血挽回与首批 6 把武器

- **交付文件范围**：
  - `src/combat/DamageCalculator.ts`、`HitStopController.ts`、`HitboxManager.ts`、`ProjectilePool.ts`
  - `src/entities/player/PlayerStats.ts`、`PlayerInventory.ts`
  - `src/render/vfx/ParticleDirector.ts`、`BloodSparkEmitter.ts`
  - 实装首批 **6 把标志性武器**（锈蚀解剖刃、水银刺剑、锻炉断头重刃、曲颈瓶速射猎弓、星盘电弧法杖、矿渣反冲圆盾）及其图标刀光图集
  - `src/ui/HudBar.tsx`、`WeaponCompareModal.tsx`、`ScrollPickModal.tsx`
- **编译与单测门禁**：
  - 单测验证背刺角度判定、翻滚后 `1,800ms` 刺剑必暴窗口、断头重刃 `220~380ms` 律动连击必暴、远距猎弓必暴及黄金招架 `0ms` 冷却重置逻辑。
- **Browser Visual QA 巡检检查项**：
  - [ ] 实机挥砍测试靶怪与持盾卫兵：核对受击 `60ms` 纯白闪白、重刃暴击 `111ms` 冻结顿帧、屏幕边缘色差撕裂脉冲，以及飙出的水银血珠/黄铜火花在地面瓦片上真实弹跳落定；
  - [ ] 故意受击观察左上角 Preact 血条生成琥珀色橙血槽，立即反击敌人核对橙血实时吸回红血；拾取地上新武器核对 `WeaponCompareModal` 词条对比卡清晰弹出。

---

## Milestone 6：6 元素状态机、20 词条化学反应矩阵与全量武器/技能/变异闭环

- **交付文件范围**：
  - `src/combat/StatusEffectMachine.ts`、`AffixSynergyEngine.ts`、`src/render/vfx/ElementalAuraEmitter.ts`
  - `src/data/weapons.data.ts`（补齐后 **6 把武器**：辰砂双刃、坩埚震地重锤、骸骨钟摆战戟、发条连发重弩、矾酸蒸馏投掷瓶、水银镜面圣盾，达成 12/12 满编）
  - `src/data/skills.data.ts`（全部 **6 种主动技能/陷阱**）、`src/data/mutations.data.ts`（全部 **12 种变异**）、`src/data/affixes.data.ts`（全部 **20 条词条**）
  - `src/ui/MutationForgeModal.tsx`、`tests/unit/DamageAndSynergy.test.ts`
- **编译与单测门禁**：
  - 单测逐一验证全部 6 大跨元素化学反应（`油+火=双倍伤紫火`、`火+冰=180%热震爆裂`、`5层流血=135%大动脉崩裂`、`重击破冰=+40%脆性碎裂`、`潮湿/油/毒+电=双倍半径超导必暴`、`毒+紫火=矾毒爆燃`）及全部 20 条词条增伤乘区。
- **Browser Visual QA 巡检检查项**：
  - [ ] 实机投掷「黑火油雾罐」触发大片紫色炼金火焰点亮房间法线墙面，部署「特斯拉哨塔」走近观察角色与炮台间拉出蓝色电弧绊线；
  - [ ] 使用「水银镜面圣盾」黄金招架敌方远程酸弹，截图验证 `ShieldRefractPipeline` 波纹折射与 `3` 道追踪水银反击光束。

---

## Milestone 7：四大生态群落全量铺开与 12 种普通/精英怪物 AI 家族

- **交付文件范围**：
  - 经 `asset-factory` 产出的第二、三、四层全套法线瓦片集、5 层视差图集、全部 `RoomChunk` 切片库与全部 **12 种怪物**法线精灵图集
  - `src/entities/enemies/BaseEnemy.ts`、`PerceptionSensor.ts`、`TelegraphRenderer.ts`、`EnemyDirector.ts`
  - `src/entities/enemies/roster/*.ts`（6 个模块文件完整覆盖 12 种普通怪 + 4 种精英词缀）
  - `src/data/biomes.data.ts`
- **编译与单测门禁**：
  - 校验全部 4 个生态群落图集法线对 `100%` 齐全，所有怪物状态文件严格 `≤ 250 行`。
- **Browser Visual QA 巡检检查项**：
  - [ ] 依次进入四大群落（矿渣蒸馏厂 → 矾酸暗渠 → 发条骸骨堂 → 星界熔炉之巅）各截取一张全屏实机战斗图，核对四关色调差异鲜明又统一于 48 色暗黑炼金美学；
  - [ ] 核对「骸骨堂司铎」给友军套盾时的金色引导线清晰可见、怪物出招前黄色 `[!]`（可招架）与红色 `[!]`（不可招架）在 `TelegraphOverlayCam` 上锐利醒目、怪物死亡时触发 `AshDissolve` 余烬化灰溶解。

---

## Milestone 8：双多阶段 Boss 战、永恒锻炉圣所、全量台词与真结局叙事闭环

- **交付文件范围**：
  - Boss 图集（萨尔弗 P1/P2 + 帕拉塞尔苏斯 P1/P2/P3）与 NPC/圣所悬吊瓶装饰图集
  - `src/entities/enemies/bosses/FurnaceWardenBoss.ts`、`GrandAlchemistBoss.ts`
  - `src/scenes/SanctumHubScene.ts`、`BiomeRunScene.ts`、`BossArenaScene.ts`
  - `src/world/LoreRoomSpawner.ts`、`src/data/dialogue.data.ts`（序章 + 34 段 NPC 台词 + 10 剧情房文本 + 12 武器铭文）
  - `src/ui/BossHealthBar.tsx`、`DialogueBanner.tsx`
- **编译与单测门禁**：
  - 单测验证常规结局（未集齐三封印击败 P2）与真结局（持有 `flag_seal_conduit` + `flag_seal_ram` + `flag_seal_claws` 注入万能溶剂解锁隐藏 P3）状态分支流转。
- **Browser Visual QA 巡检检查项**：
  - [ ] 实机挑战 Boss 1 萨尔弗压血至 `55%`，截图验证扒开胸口香炉转阶段演出与地面 4 组刑炉格栅交替喷火；
  - [ ] 实机挑战 Boss 2 帕拉塞尔苏斯，验证 P2 巨型机械神躯天顶星盘扫射激光，以及触发真结局 P3 后场地化为镜面水银海的宿命剑士对决；
  - [ ] 在圣所与科尔维斯、伊索尔德对话，验证半途直接翻滚走开时对话框平滑收起为底部不挡视野的轻字幕。

---

## Milestone 9：商业级双轨交互音乐、濒死低通滤波与多变体音效全实装

- **交付文件范围**：
  - 经 `audio-pipeline` 标准化为 `-14 LUFS` 的全部双格式（`.webm` + `.m4a`）音轨与 24 组多变体音效池资源
  - `src/audio/AudioDirector.ts`、`AdaptiveStemMixer.ts`、`SfxPoolPlayer.ts`、`WebAudioFilterRack.ts`、`IosAudioUnlocker.ts`
  - `src/ui/PauseAudioMenu.tsx`
- **编译与单测门禁**：
  - `audit_zero_placeholder.mjs` 扫描确认零 `createOscillator`，且 `public/assets/audio/` 下每一个 `.webm` 均存在同名 `.m4a` 姊妹文件。
- **Browser Visual QA 巡检检查项**：
  - [ ] 在浏览器实机进出仇恨怪房间，通过音频分析器与听感验证 `Exploration Stem` 与 `Combat Stem` 同节拍零爆音交叉混音；
  - [ ] 将角色血量压至 `< 25%` 或按下 `ESC` 打开暂停菜单，验证 `WebAudioFilterRack` 实时将背景音乐平滑闷化至 `420Hz` 低通滤波状态，恢复血量或关闭菜单后瞬间恢复通透高频。

---

## Milestone 10：Local-First 防篡改存储、Supabase 双轨云存档冲突框与 PWA 终验

- **交付文件范围**：
  - `src/storage/SaveSchema.ts`、`LocalVault.ts`、`SupabaseClient.ts`、`CrdtMetaMerger.ts`、`SnapshotConflictMachine.ts`、`CloudSyncCoordinator.ts`
  - `src/ui/SaveConflictModal.tsx`、`AuthSyncDrawer.tsx`
  - `tests/unit/CrdtMetaMerger.test.ts`、`tests/unit/SnapshotConflictMachine.test.ts`
  - `vite-plugin-pwa` Service Worker 预缓存策略与生产构建包优化
- **编译与单测门禁**：
  - `CrdtMetaMerger.test.ts` 验证双端离线各自解锁不同符文、不同武器蓝图与不同铁匠铺投入进度后，执行双向合并满足交换律与幂等律且零数据丢失；
  - `SnapshotConflictMachine.test.ts` 验证同局线性推进自动快进、双端离线分叉精准触发 `CONFLICT_MODAL_OPEN`、篡改 IndexedDB 字段被 `SHA-256` 校验拦截回退备份槽；
  - 执行 `npm run build` 零警告产出生产级 PWA 静态包。
- **Browser Visual QA 终极验收检查项**：
  - [ ] 模拟双设备分叉快照注入，在浏览器实机触发并截图核验 `SaveConflictModal.tsx`：左右并排清晰展示设备名、保存时间、游玩时长、所在群落横幅、血量卷轴数与双武器双技能像素图标，点击任一卡片可立即无刷新热切换局内进度；
  - [ ] 断网离线状态下刷新页面（验证 Service Worker 离线秒开与 `Dexie.js` 本地存档毫秒级恢复至当前房间）；
  - [ ] 全流程实机跑通一次「圣所 → 四大群落 → 双 Boss → 结算回流圣所投入灵液」，帧率稳定 60/120 FPS，零内存泄漏，正式达成商业成品级交付标准！
