---
trigger: always_on
description: Prohibits geometric fillRect/SVG visual placeholders and OscillatorNode bleep audio. Enforces Phaser Light2D normal-mapped atlases, custom GLSL PostFX shaders, locked dark-alchemy color palettes, and LUFS-normalized dual-stem interactive audio across all assets and rendering code.
---

# 零占位符红线与商业级视听管线硬性验收标准

本规则拥有一票否决权。任何提交或里程碑一旦违反本规则中的任一条款，视为**未完成交付（Failed Gate）**，严禁标记任务完成或进入下一里程碑。

---

## 1. 视觉渲染绝对禁令（Zero Visual Placeholders）

1. **严禁几何色块充当游戏资产**：
   - 严禁在主角、普通怪物、精英怪、Boss、武器、投射物、机关陷阱、背景建筑或瓦片渲染中使用 `ctx.fillRect`、`Graphics.fillRect`、`Graphics.fillCircle`、`Phaser.GameObjects.Rectangle` 或纯色纹理块代替像素美术精灵。
   - 严禁使用简陋手拼内联 `<svg>` 几何图形（三角、方块、圆环拼接）冒充武器图标、角色头像或技能图标。
   - *唯一合法例外*：半透明全屏黑场转场遮罩、碰撞调试框（仅在 `import.meta.env.DEV && debugHitboxEnabled === true` 时允许渲染，默认必须关闭）。
2. **全局色板锁定约束**：
   - 所有通过 `.agents/skills/asset-factory/SKILL.md` 产出的像素原画、瓦片与图标，必须经过 `quantize_palette.py` 映射至 `src/data/palette.data.ts` 定义的暗黑炼金全局锁定 HEX 色板，严禁出现未量化的高饱和塑料感渐变或半透明脏白边（Alpha 阈值必须二值化裁剪干净，发光特效统一交由 WebGL 加法混合与 Bloom 着色器实现）。

---

## 2. 法线动态光照（Normal Map + Light2D）强制标准

1. **1:1 漫反射与法线贴图成对交付**：
   - `public/assets/atlases/` 与 `public/assets/tilemaps/` 下的每一张漫反射图集 `<name>.png`，必须在同目录提供严格像素对齐的法线贴图 `<name>_n.png`（标准切线空间 OpenGL 法线编码：平坦朝向摄像机表面 RGB 为 `(128, 128, 255)` / `#8080FF`）。
   - 在 `PreloadScene.ts` 中加载纹理时，必须使用数组或双路径形式同时传入漫反射图与法线图：`this.load.multiatlas(key, jsonUrl, path)`（图集 JSON 内含 `normalMap` 字段）或 `this.load.image(key, [diffuseUrl, normalUrl])`。
2. **强制开启 `Light2D` 渲染管线**：
   - 场景初始化必须调用 `this.lights.enable().setAmbientColor(...)`；
   - 所有瓦片层、建筑装饰物、主角与怪物精灵必须显式执行 `.setPipeline('Light2D')`；
   - 主角体内的「贤者水银核」常驻点光源、墙面摇曳炼金火炬、挥刀金属火花、燃烧/感电/酸液投射物必须通过 `LightingDirector.ts` 实时驱动动态点光源照亮周围墙面与角色法线凹凸细节。

---

## 3. 自定义 WebGL GLSL 着色器与 GPU 粒子强制标准

1. **必须实装的 5 大自定义 GLSL 着色器**（源码存放于 `src/render/shaders/*.frag`，严禁空壳 Pass-through 着色器）：
   - `chromatic_impact.frag`：暴击、重武器砸地、成功盾反与玩家受重创瞬间，触发屏幕边缘 RGB 通道径向偏移撕裂（Chromatic Aberration）与冲击中心径向模糊，随 `uIntensity` 指数衰减至 0。
   - `vignette_bloom.frag`：提取高亮度水银核、火光与元素刀光阈值进行辉光叠加，并压暗视口四角营造深邃炼金地牢氛围。
   - `hit_flash.frag`：受击瞬间 `60ms` 内将精灵漫反射与纯白 `#FFFFFF`（或对应元素高亮色）按 `uFlashAmount` 插值混合，同时保留原始 Alpha 轮廓。
   - `ash_dissolve.frag`：怪物死亡时基于 2D 噪声纹理采样与 `uProgress (0.0 -> 1.0)` 裁剪片元，并在溶解切口边缘渲染炽热余烬发光带（`#FF5E2B` → `#FBBF24`）。
   - `shield_refract.frag`：招架力场与司铎护盾激活时采样背景帧缓冲产生法线波纹扭曲。
2. **物理感 GPU 粒子反馈**：
   - 近战砍中肉体或机械躯壳时，飞溅的水银血珠与黄铜火花必须具备重力下落与当前房间地面瓦片的碰撞反弹衰减，并在地面留下短暂渐隐痕迹；二段跳、翻滚与落地必须配套尘雾或气浪粒子。

---

## 4. 商业级交互音乐与音效绝对禁令（Zero Bleep Audio）

1. **严禁原生振荡器蜂鸣音**：
   - 代码库全局禁止调用 `AudioContext.prototype.createOscillator` 或手写正弦波/方波/锯齿波合成器冒充打击音效或 BGM。`audit_zero_placeholder.mjs` 扫描到 `createOscillator` 关键字将直接阻断构建。
2. **双编码与响度工业标准**：
   - 所有音频资源必须经由 `.agents/skills/audio-pipeline/SKILL.md` 处理为 `-14 LUFS` 集成响度（真峰值 `≤ -1.0 dBTP`），同时输出 `.webm (Opus)` 与 `.m4a (AAC)` 双格式，在 `Howler` 中按 `['xxx.webm', 'xxx.m4a']` 顺序声明以完美兼容桌面端与 iOS Safari。
3. **动态分层与防听觉疲劳规则**：
   - 每个生态群落必须同时加载严格同 BPM、同小节长度、零交叉点无缝循环的 `Exploration Stem` 与 `Combat Stem`，根据屏幕内处于仇恨状态的敌人数量在 `800ms ~ 1500ms` 内平滑交叉混音；
   - 玩家生命值 `< 25%` 或打开暂停菜单时，必须通过 `WebAudioFilterRack.ts` 动态平滑拉低 `BiquadFilterNode (lowpass)` 截止频率至 `420Hz`；
   - 所有高频触发音效（脚步、挥砍、命中、受击、拾取灵液）必须具备至少 `3` 个采样变体，并在播放时叠加 `±8%`（`rate: 0.92 ~ 1.08`）随机音高微扰与最大并发数限流。
