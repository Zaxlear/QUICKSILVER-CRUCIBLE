# 《水银坩埚（QUICKSILVER CRUCIBLE）》美术圣经、GLSL 着色器管线、AI 资产工厂与动态交互音乐工程规范

> **文档编号**：`docs/04_ART_VFX_AUDIO_PIPELINE.md`  
> **版本**：`v1.0.0-commercial`  
> **配套自动化技能**：[asset-factory](file:///Users/karl/Documents/GitHub/QUICKSILVER%20CRUCIBLE/.agents/skills/asset-factory/SKILL.md)、[audio-pipeline](file:///Users/karl/Documents/GitHub/QUICKSILVER%20CRUCIBLE/.agents/skills/audio-pipeline/SKILL.md)、[visual-qa-inspector](file:///Users/karl/Documents/GitHub/QUICKSILVER%20CRUCIBLE/.agents/skills/visual-qa-inspector/SKILL.md)

---

## 1. 视觉美术圣经与全局锁定 48 色 HEX 色板（`src/data/palette.data.ts`）

为彻底消除多模态 AI 生成像素资产时常见的“塑料脏色、饱和度失控与跨关卡色调割裂”，全游戏所有精灵、瓦片集与图标必须经 `quantize_palette.py` 强制锁定在以下 **48 色暗黑炼金主色板** 之内（阴影冷蓝紫偏色，高光白瓷暖金对比，发光效果交由 WebGL `ADD` 混合与 `VignetteBloomPostFX` 着色器叠加）。

### 1.1 全局主色板阶梯定义

| 色阶分组 | 色彩用途说明 | 锁定 HEX 色阶序列（由暗至亮） |
| :--- | :--- | :--- |
| **深渊冷灰阶 (8 色)** | 背景暗部、铸铁阴影、石墙背光面（严禁纯灰，统一注入冷靛蓝偏色） | `#0B0C10` → `#11131C` → `#161824` → `#1E2233` → `#272C42` → `#323954` → `#414A6B` → `#556085` |
| **白瓷与活态水银阶 (6 色)** | 主角白瓷骨甲、水银核高光、刀刃锋口、圣堂石雕亮面 | `#7C8599` → `#9AA5B8` → `#B8C4D4` → `#D4DEE8` → `#E8EFF5` → `#F8FAFC` |
| **腐化黄铜与星盘金阶 (8 色)** | 发条齿轮、香炉、镀金颅骨、门框铆钉、传说级装备描边 | `#291A0E` → `#3D2817` → `#593A1E` → `#7A5128` → `#9E6B34` → `#C28B42` → `#E0AE53` → `#FBBF24` |
| **矿渣赤铁与腐肉阶 (8 色)** | 赤化系武器、铁锈、畸变血肉组织、红丝绒帷幔、受击飙血 | `#240B12` → `#3B121E` → `#591B2B` → `#7D2438` → `#A62B44` → `#CF3650` → `#E11D48` → `#FB7185` |
| **铜绿与矾酸毒阶 (8 色)** | 暗渠腐蚀铜管、苔藓、藤蔓符文、白化系护盾底色、酸液高光 | `#0B1F1D` → `#12332F` → `#1B4D46` → `#266B60` → `#328F7D` → `#22C55E` → `#3CE682` → `#A3E635` |
| **熔炉余烬与以太阶 (10 色)** | 锻炉火光、炼金紫火、高压电弧、诅咒黑雾与卷轴 UI 强调色 | `#431407` → `#7C2D12` → `#C2410C` → `#EA580C` → `#FF5E2B` → `#FDBA74` / `#3B0764` → `#6D28D9` → `#A855F7` / `#38BDF8` |

### 1.2 六大元素异常状态标准发光色锚点（着色器与动态光源统一引用）

| 元素异常状态 | 核心漫反射色 (`Core HEX`) | `Light2D` 点光源色 (`Light HEX`) | Bloom 外焰边缘色 | UI 状态徽标缩写 |
| :--- | :---: | :---: | :---: | :---: |
| **`Oiled`（炼金黑油 / 紫火）** | `#4C1D95` | `#A855F7` (紫火引燃时) | `#C084FC` | `OIL / NPLM` |
| **`Ignited`（炽热燃烧）** | `#FF5E2B` | `#FB923C` | `#FBBF24` | `BRN` |
| **`Bleeding`（锯齿流血）** | `#E11D48` | `#F43F5E` | `#881337` | `BLD` |
| **`Frozen`（液氮冰冻）** | `#67E8F9` | `#22D3EE` | `#ECFEFF` | `FRZ` |
| **`Electrified`（发条感电）** | `#38BDF8` | `#60A5FA` | `#E0F2FE` | `SHK` |
| **`Poisoned`（矾酸毒蚀）** | `#3CE682` | `#4ADE80` | `#BEF264` | `PSN` |

---

## 2. WebGL 动态法线光照、5 大自定义 GLSL 着色器与 GPU 粒子规格书

### 2.1 Phaser `Light2D` 24 点光源动态调度器（`src/render/LightingDirector.ts`）

Phaser WebGL 配置中显式声明 `render: { pixelArt: true, maxLights: 24 }`。由于移动端片元着色器逐光源循环开销敏感，`LightingDirector` 严格按优先级分配 24 盏硬件点光源：
1. **常驻高优槽（1 盏）**：主角胸腔「贤者水银核」随呼吸脉动的银青色贴身点光源（半径 `135 px`，色值 `0xB8C4D4`，强度 `1.35`），确保无论走到多暗的角落，主角与脚下法线砖块始终清晰立体。
2. **瞬态战斗槽（最多 9 盏，对象池循环复用）**：挥刀碰撞金属火花（寿命 `90ms`，强度 `2.4 -> 0`）、成功盾反闪光（半径 `220 px`，寿命 `140ms`）、飞行中的火瓶/电弧/水银光束实时跟随光源。
3. **环境静态/摇曳槽（最多 14 盏，按距摄像机中心欧氏距离每帧排序激活）**：房间 `lightAnchors` 定义的炼金火把与酸液池光源。火把摇曳采用双频正弦加微噪公式：
   $$I(t) = I_0 \cdot \Big(1 + A \cdot \big[0.6 \sin(7.3 t + \phi) + 0.4 \sin(17.9 t + 2\phi)\big]\Big), \quad R(t) = R_0 \cdot \big(1 + 0.05 \sin(11.1 t + \phi)\big)$$

---

### 2.2 五大核心 GLSL 片元着色器完整源码（`src/render/shaders/*.frag`）

以下着色器严格适配 Phaser 3.80+ `SinglePipeline`（实体级）与 `PostFXPipeline`（主摄像机全屏级）WebGL GLSL 规范：

#### 1. 实体受击纯白/元素色闪白着色器（`src/render/shaders/hit_flash.frag`）
```glsl
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uFlashAmount;   // 0.0 ~ 1.0 (受击前 60ms 为 1.0，随后 40ms 线性归零)
uniform vec3 uFlashColor;     // 默认纯白 vec3(1.0, 1.0, 1.0)，末段过渡元素色

varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;

void main() {
    vec4 texel = texture2D(uMainSampler, outTexCoord);
    if (texel.a <= 0.001) {
        discard;
    }
    // 严格保持原始硬边缘 Alpha，仅插值 RGB 至高亮闪白颜色
    vec3 flashedRgb = mix(texel.rgb, uFlashColor * texel.a, clamp(uFlashAmount, 0.0, 1.0));
    gl_FragColor = vec4(flashedRgb, texel.a);
}
```

#### 2. 怪物死亡灰烬边缘余烬溶解着色器（`src/render/shaders/ash_dissolve.frag`）
```glsl
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uProgress;      // 0.0 (完好) -> 1.0 (彻底化灰)
uniform vec2 uNoiseScale;     // 默认 vec2(24.0, 24.0) 贴合像素颗粒感

varying vec2 outTexCoord;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float pixelValueNoise(vec2 uv) {
    vec2 grid = floor(uv * uNoiseScale);
    return 0.65 * hash21(grid) + 0.35 * hash21(floor(grid * 0.5));
}

void main() {
    vec4 texel = texture2D(uMainSampler, outTexCoord);
    if (texel.a <= 0.001) {
        discard;
    }

    // 自上而下叠加噪声权重，使怪物从头肩开始崩解化灰
    float n = pixelValueNoise(outTexCoord) * 0.8 + (1.0 - outTexCoord.y) * 0.2;
    float edgeDiff = n - uProgress;

    if (edgeDiff < 0.0) {
        discard;
    }

    // 切口宽度 0.09 内渲染炽热锻炉余烬带 (#FF5E2B -> #FBBF24)
    float emberBand = 1.0 - smoothstep(0.0, 0.09, edgeDiff);
    vec3 outerEmber = vec3(1.0, 0.369, 0.169); // #FF5E2B
    vec3 innerGold  = vec3(0.984, 0.749, 0.141); // #FBBF24
    vec3 burnColor  = mix(outerEmber, innerGold, smoothstep(0.4, 1.0, emberBand));

    vec3 finalRgb = mix(texel.rgb, burnColor * texel.a, emberBand * step(0.01, uProgress));
    gl_FragColor = vec4(finalRgb, texel.a);
}
```

#### 3. 招架力场与司铎护盾屏幕空间折射着色器（`src/render/shaders/shield_refract.frag`）
```glsl
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uShieldCenter;   // 归一化屏幕 UV (0.0 ~ 1.0)
uniform float uShieldRadius;  // 归一化屏幕半径
uniform float uAspect;        // width / height 修正正圆比例

varying vec2 outTexCoord;

void main() {
    vec2 delta = outTexCoord - uShieldCenter;
    delta.x *= uAspect;
    float dist = length(delta);

    if (dist > uShieldRadius) {
        gl_FragColor = texture2D(uMainSampler, outTexCoord);
        return;
    }

    float normDist = dist / max(uShieldRadius, 0.0001);
    // 菲涅尔边缘强化环 + 向外扩散的水银高频正弦涟漪
    float rim = pow(normDist, 3.2);
    float wave = sin(normDist * 28.0 - uTime * 14.0) * 0.012 * rim;
    vec2 refractUv = clamp(outTexCoord + normalize(delta + 1e-5) * wave, 0.0, 1.0);

    vec4 sceneCol = texture2D(uMainSampler, refractUv);
    vec3 mercuryRimColor = vec3(0.55, 0.85, 1.0) * rim * 0.65;
    gl_FragColor = vec4(sceneCol.rgb + mercuryRimColor, sceneCol.a);
}
```

#### 4. 暴击/重击/盾反全屏色差撕裂与径向冲击管线（`src/render/shaders/chromatic_impact.frag`）
```glsl
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uIntensity;      // 0.0 ~ 1.0，触发瞬间置为 0.65~1.0，按指数衰减归零
uniform vec2 uImpactCenter;    // 命中点归一化屏幕坐标

varying vec2 outTexCoord;

void main() {
    if (uIntensity <= 0.001) {
        gl_FragColor = texture2D(uMainSampler, outTexCoord);
        return;
    }

    vec2 toEdge = outTexCoord - uImpactCenter;
    float dist = length(toEdge);
    // 中心焦距清晰，越靠近屏幕四周色差撕裂与径向拉伸越强烈
    float radialMask = smoothstep(0.06, 0.65, dist) * uIntensity;
    vec2 offset = toEdge * (0.026 * radialMask);

    // 4-Tap 轻量径向残影模糊 + RGB 三通道分离采样
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 4; i++) {
        float scale = 1.0 - float(i) * 0.009 * radialMask;
        vec2 baseUv = uImpactCenter + (outTexCoord - uImpactCenter) * scale;
        float r = texture2D(uMainSampler, clamp(baseUv + offset, 0.0, 1.0)).r;
        float g = texture2D(uMainSampler, clamp(baseUv, 0.0, 1.0)).g;
        float b = texture2D(uMainSampler, clamp(baseUv - offset, 0.0, 1.0)).b;
        acc += vec3(r, g, b);
    }
    gl_FragColor = vec4(acc * 0.25, 1.0);
}
```

#### 5. 暗黑炼金氛围暗角与高光阈值辉光管线（`src/render/shaders/vignette_bloom.frag`）
```glsl
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uBloomStrength;    // 默认 0.42
uniform float uBloomThreshold;   // 默认 0.72 (仅水银核、火光、刀光与元素特效越过阈值)
uniform float uVignetteDarkness; // 默认 0.38

varying vec2 outTexCoord;

vec3 extractBright(vec2 uv) {
    vec3 c = texture2D(uMainSampler, clamp(uv, 0.0, 1.0)).rgb;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return c * smoothstep(uBloomThreshold, uBloomThreshold + 0.22, lum);
}

void main() {
    vec4 base = texture2D(uMainSampler, outTexCoord);
    vec2 texel = 2.0 / max(uResolution, vec2(1.0));

    // 9-Tap 对称十字星芒采样提取辉光
    vec3 bloom = extractBright(outTexCoord) * 0.24;
    bloom += extractBright(outTexCoord + vec2( texel.x,  0.0)) * 0.12;
    bloom += extractBright(outTexCoord + vec2(-texel.x,  0.0)) * 0.12;
    bloom += extractBright(outTexCoord + vec2( 0.0,  texel.y)) * 0.12;
    bloom += extractBright(outTexCoord + vec2( 0.0, -texel.y)) * 0.12;
    bloom += extractBright(outTexCoord + vec2( texel.x,  texel.y)) * 0.07;
    bloom += extractBright(outTexCoord + vec2(-texel.x,  texel.y)) * 0.07;
    bloom += extractBright(outTexCoord + vec2( texel.x, -texel.y)) * 0.07;
    bloom += extractBright(outTexCoord + vec2(-texel.x, -texel.y)) * 0.07;

    vec3 combined = base.rgb + bloom * uBloomStrength;

    // 暗黑地牢四角冷色压暗暗角
    vec2 centered = outTexCoord - 0.5;
    float vig = 1.0 - dot(centered, centered) * (uVignetteDarkness * 2.2);
    vec3 deepShadowTint = vec3(0.043, 0.047, 0.063); // #0B0C10
    vec3 finalRgb = mix(deepShadowTint, combined, clamp(vig, 0.0, 1.0));

    gl_FragColor = vec4(finalRgb, base.a);
}
```

#### 6. 翻滚残影池渲染器（`src/render/GhostTrailRenderer.ts`）
`DodgeRollState` 与 `wpn_quicksilver_rapier` 突刺期间，每 `4 ticks (33.3ms)` 从预分配容量为 `24` 的 `ObjectPool<Phaser.GameObjects.Image>` 取出一个残影实例，复制主角当前帧纹理、坐标与翻转朝向，执行 `.setTintFill(0x38BDF8).setAlpha(0.65).setBlendMode(Phaser.BlendModes.ADD)`，并在 `180ms` 内线性衰减 `alpha -> 0` 后自动归还对象池，零 GC 分配。

---

### 2.3 物理感 GPU 粒子发射器参数配置全表（`src/render/vfx/ParticleDirector.ts`）

| 粒子发射器 ID | 触发时机 | 粒子数量 / 速率 | 初速度与发射扇区 | 重力 `gravityY` 与地面碰撞反弹 | 寿命 (`ms`) / 混合模式 |
| :--- | :--- | :---: | :--- | :--- | :---: |
| **`vfx_mercury_blood`**<br>肉体/炼金怪受击飙血 | 每次命中血肉畸变怪 | 单次爆发 `10~18` 颗（暴击 `28` 颗） | `110 ~ 290 px/s`，沿刀光方向 `±35°` 喷射 | `gravityY: 680`，**开启房间地面瓦片碰撞 `bounce: 0.35`**，触地第 2 次静止化为 `1.5s` 渐隐血迹 | `450 ~ 800 ms` / `NORMAL` (`#E11D48` + `#F8FAFC`) |
| **`vfx_brass_sparks`**<br>发条机械/持盾怪火花 | 砍中机械怪、砍盾或盾反成功 | 单次爆发 `14~26` 颗长条拉伸火花 | `160 ~ 380 px/s`，法线反射角 `±45°` | `gravityY: 520`，**地面高弹跳碰撞 `bounce: 0.58`**，速度方向自动对齐粒子拉伸角 | `260 ~ 520 ms` / `ADD` (`#FBBF24` → `#FF5E2B`) |
| **`vfx_double_jump_ring`**<br>二段跳炼金气浪 | 触发 `DoubleJumpState` 瞬间 | 横向扁环爆开 `16` 颗气旋颗粒 | 水平向两侧 `±90~150 px/s`，`vy: +25` | `gravityY: -40`（微上浮扩散） | `220 ms` / `ADD` (`#B8C4D4`) |
| **`vfx_dodge_dust`**<br>起步/急转/翻滚擦地尘 | 起跑、反向急刹、翻滚贴地 | 连续喷发 `3` 团像素烟尘球 | 逆移动方向 `40 ~ 85 px/s` | `gravityY: -25`，体积由 `1.0 -> 0.2` 缩散 | `280 ms` / `NORMAL` (`#556085`) |
| **`vfx_parry_sunburst`**<br>黄金招架十字星芒 | `ParryState` 成功弹反第 1 帧 | 1 枚十字闪光环 + `32` 颗高速金星 | 全向 `360°` 爆发 `220 ~ 440 px/s` | 无重力阻尼急停 (`drag: 850`) | `300 ms` / `ADD` (`#F8FAFC` + `#FBBF24`) |
| **`vfx_elem_aura_6`**<br>6 元素附着常驻粒子 | 目标携带任一元素状态期间 | `8 ~ 14 particles/s` 环绕包围盒 | 燃烧/紫火上飘 `-65 px/s`；油/血/毒下滴 `+50 px/s`；冰晶环绕；感电折线跳变 | 按元素物理属性绑定（见第 1.2 节锚点色） | `350 ~ 600 ms` / 火电冰 `ADD`，油血毒 `NORMAL` |

---

## 3. 全套标准化 AI 美术生图英文 Prompt 词典

所有调用 `tools/asset-factory/generate_sprite.py` 的生图请求，**必须统一拼接以下锁定画风前缀与负面约束**，保证全游戏近百张图集拥有如同同一位主美手绘的统一笔触与透视角度：

- **`LOCKED_STYLE_PREFIX`**：
  > `"Masterpiece commercial 2D side-scrolling action game pixel art sprite, Dead Cells and Blasphemous inspired dark alchemy & corrupted clockwork gothic fantasy aesthetic, crisp hand-pixelated clusters, razor-sharp 1px dark indigo outlines, dramatic high-contrast rim lighting, zero anti-aliasing, zero motion blur, strict side-profile 2D platformer view, isolated on solid flat #FF00FF magenta background --no gradient background, soft brush, 3d render, chibi, blurry edges, watermark, text"`

### 3.1 主角 `Vessel-09` 全部 10 状态序列帧规格与生图 Prompt 表（单帧逻辑画布 `64 × 64 px`）

> **主角锁定角色外观特征描述词（`HERO_DESIGN_TOKEN`）**：
> `"headless alchemical homunculus warrior, hollow ornate brass astrolabe cage helmet glowing with a bright liquid silver-cyan mercury core inside, cracked white porcelain chestplate over dark oiled alchemist coat, tattered crimson scarf trailing behind, nimble athletic proportions"`

| 状态类文件 | 动画键名 | 帧数 / 播放帧率 | 标准化英文动作序列生图 Prompt（拼接在 `LOCKED_STYLE_PREFIX + HERO_DESIGN_TOKEN` 之后） |
| :--- | :--- | :---: | :--- |
| `IdleState.ts` | `hero_idle` | `6 帧` / `8 fps` (循环) | `"6-frame horizontal sprite sheet of combat-ready breathing idle stance, subtle rise and fall of shoulders, glowing liquid mercury core pulsing gently inside brass cage helm, crimson scarf swaying slightly"` |
| `RunState.ts` | `hero_run` | `8 帧` / `14 fps` (循环) | `"8-frame horizontal sprite sheet of aggressive forward leaning sprint cycle, dynamic leg drive, coat tails and crimson scarf streaming horizontally behind, crisp contact and passing poses"` |
| `JumpState.ts` | `hero_jump_fall` | `4 帧` (`2` 起跳 + `2` 下落) | `"4-frame sprite sheet: frames 1-2 explosive upward leap knees tucked scarf trailing down; frames 3-4 fast downward fall cape billowing upward, dynamic vertical silhouette"` |
| `DoubleJumpState.ts` | `hero_djump` | `4 帧` / `16 fps` | `"4-frame mid-air alchemical somersault boost, boots expelling a burst of silver mercury vapor downward, agile tucked flip recovery"` |
| `WallSlideState.ts` | `hero_wall_slide` | `3 帧` / `10 fps` (循环) | `"3-frame vertical wall-slide pose, one magnetic brass claw gauntlet gripping wall surface, sparks at fingertips, legs braced against wall looking back over shoulder"` |
| `DodgeRollState.ts` | `hero_dodge_roll` | `6 帧` / `18 fps` | `"6-frame low-profile acrobatic combat dive roll, body partially liquefying into streaking quicksilver motion form mid-roll, compact tuck to swift knee-slide recovery"` |
| `ParryState.ts` | `hero_parry` | `5 帧` / `20 fps` | `"5-frame shield parry stance, snapping heavy alchemical buckler forward with explosive silver shockwave posture, braced back leg, triumphant counter-ready silhouette"` |
| `AttackComboState.ts` | `hero_atk_slash` | `12 帧` (三段通用骨架 + 武器层叠加) | `"12-frame 3-hit melee combo sprite sheet: frames 1-4 wide horizontal forehand slash; frames 5-8 upward diagonal backhand cleave; frames 9-12 lunging overhead finisher strike, exaggerated smear arcs"` |
| `HurtState.ts` | `hero_hurt` | `3 帧` / `12 fps` | `"3-frame heavy hit-stagger recoil pose, torso jolted backward, droplets of glowing silver mercury splashing from helm cage, porcelain armor cracking"` |
| `DeadState.ts` | `hero_collapse` | `8 帧` / `10 fps` | `"8-frame death sequence, white porcelain homunculus armor shattering into pieces collapsing to knees, glowing liquid mercury core draining downward into floor grates"` |

---

### 3.2 四大生态群落 47-Tile 瓦片集与视差背景生图 Prompt 表

| 生态群落 | 资产类型与尺寸 | 标准化英文生图 Prompt（附加无缝平铺或正交横版约束） |
| :--- | :--- | :--- |
| **`biome_01_slag_retort`**<br>矿渣蒸馏厂 | `16×16` 47格自动瓦片集 + 5层视差 (`640×360`) | `"Orthographic 2D pixel art platformer tileset & multi-layer parallax background of The Slag Retorts: soot-blackened riveted cast-iron platforms, glowing furnace grate floors, tarnished brass pipes, giant boiling glass alembics in background, warm amber gaslight vs dark slate shadows"` |
| **`biome_02_vitriol_sewers`**<br>矾酸暗渠 | `16×16` 47格自动瓦片集 + 5层视差 (`640×360`) | `"Orthographic 2D pixel art platformer tileset & parallax background of The Vitriol Aqueducts: verdigris corroded copper masonry, wet mossy stone bricks, glowing toxic chartreuse acid waterfalls in background sluices, bioluminescent alchemy fungi, deep abyssal teal atmosphere"` |
| **`biome_03_clockwork_ossuary`**<br>发条骸骨堂 | `16×16` 47格自动瓦片集 + 5层视差 (`640×360`) | `"Orthographic 2D pixel art platformer tileset & parallax background of The Clockwork Ossuary: Gothic cathedral stone inlaid with gilded skulls and brass clockwork gears, colossal interlocking escapement wheels andstained-glass rose window in stormy indigo sky, cyan lightning"` |
| **`biome_04_crucible_apex`**<br>星界熔炉之巅 | `16×16` 47格自动瓦片集 + 5层视差 (`640×360`) | `"Orthographic 2D pixel art platformer tileset & parallax background of The Astral Athanor: fractured obsidian and white marble floating sanctum, upward-flowing liquid silver mercury waterfalls, giant rotating golden astrolabe rings against crimson eclipse cosmos"` |

---

### 3.3 全部 12 把武器图标（`32×32 px`）与挥砍刀光生图 Prompt 全表

| # | 武器 ID | 标准化英文武器图标与刀光生图 Prompt（拼接 `LOCKED_STYLE_PREFIX`） |
| :-: | :--- | :--- |
| **01** | `wpn_rust_scalpel` | `"32x32 pixel art weapon icon of a wicked serrated surgical vivisector blade, pitted dark iron stained with crimson rubedo runes, brass bone-saw handle + crimson crescent slash smear"` |
| **02** | `wpn_quicksilver_rapier` | `"32x32 pixel art weapon icon of an elegant needle-thin estoc rapier, hollow glass fuller glowing with liquid silver mercury, ornate brass bell-guard + razor-thin silver thrust streak"` |
| **03** | `wpn_cinnabar_twinblades` | `"32x32 pixel art weapon icon of paired curved cinnabar dual daggers, vermilion red crystalline edges with brass finger-rings + twin crossing scarlet X-slash arcs"` |
| **04** | `wpn_athanor_cleaver` | `"32x32 pixel art weapon icon of a colossal furnace guillotine cleaver, thick blackened forged steel with glowing molten orange vents along spine + heavy fiery overhead cleave arc"` |
| **05** | `wpn_crucible_maul` | `"32x32 pixel art weapon icon of a two-handed alchemical war maul, cage-like iron hammerhead holding a glowing molten crucible core + ground-shattering magma shockwave sprite"` |
| **06** | `wpn_pendulum_halberd` | `"32x32 pixel art weapon icon of a long-shafted cathedral pendulum glaive, crescent gilded brass axe-blade shaped like a clock pendulum, bone-inlaid pole + wide golden outer-edge sweep"` |
| **07** | `wpn_alembic_bow` | `"32x32 pixel art weapon icon of a recurve mechanical bow crafted from curved brass condenser tubes and glowing tungsten bowstring + glass-tipped mercury arrow projectile"` |
| **08** | `wpn_clockwork_repeater` | `"32x32 pixel art weapon icon of a heavy repeating clockwork arbalest crossbow, visible brass gear drum magazine and steel prod + 3-bolt metallic volley trail"` |
| **09** | `wpn_vitriol_thrower` | `"32x32 pixel art weapon icon of a bandolier of volatile spherical glass retort flasks bubbling with green-orange vitriol acid fire, corked with brass seals + shattering splash frames"` |
| **10** | `wpn_voltaic_arc_staff` | `"32x32 pixel art weapon icon of an astrolabe lightning conduit scepter, spinning golden rings around a glowing cyan Tesla crystal + jagged branching electric arc beam"` |
| **11** | `wpn_slag_buckler` | `"32x32 pixel art shield icon of a heavy riveted cast-iron slag repulsor buckler, central glowing alchemical furnace seal, scorched rim + circular amber shockwave burst"` |
| **12** | `wpn_mirror_aegis` | `"32x32 pixel art shield icon of a sacred oval mirror shield, liquid quicksilver reflective face framed in white porcelain and astral gold wings + 3 homing silver prism beams"` |

---

### 3.4 全部 12 种普通/精英怪物与 2 大多阶段 Boss 标准化生图 Prompt 全表

| 实体 ID | 画布规格 | 标准化英文角色设计生图 Prompt（含待机、移动、前摇蓄力与攻击序列） |
| :--- | :---: | :--- |
| `mob_01_slag_husk` | `64×64` | `"Hunched corrupted miner zombie fused with cooling black furnace slag, glowing ember cracks in chest, dragging a rusted iron pickaxe, shambling & lunging slash frames"` |
| `mob_02_frenzied_miner` | `64×64` | `"Muscular berserk calcined delver, upper body encrusted in jagged red sulfur crystals, dual-wielding red-hot mining picks, steaming vents on back, frenzied double-chop frames"` |
| `mob_03_alembic_thrower` | `64×64` | `"Plague-masked alchemist grenadier wearing heavy leather apron and a brass backpack rack of glowing green/orange acid flasks, agile backflip and lobbing throw animation"` |
| `mob_04_acid_spitter` | `64×64` | `"Grotesque bloated copper-pipe slug mutant, translucent glowing green vitriol sac pulsing on back, corroded brass valve mouth spitting acid globules & swelling death-burst"` |
| `mob_05_brass_sentinel` | `80×80` | `"Towering clockwork-grafted phalanx knight holding a massive riveted brass tower shield covering entire front profile, steam thruster on back for shield bash charge"` |
| `mob_06_flail_executor` | `96×96` | `"Heavy hooded executioner automaton in crimson tattered robes, swinging a giant spiked brass incense thurible on heavy iron chain, overhead ground-slam frames"` |
| `mob_07_voltaic_weaver` | `64×64` | `"Floating eldritch clockwork spider-construct suspended by electric arcs, brass astrolabe abdomen crackling with cyan lightning coils, casting targeted shock beam"` |
| `mob_08_clockwork_tick` | `48×48` | `"Compact brass spherical clockwork spider-mine, 6 sharp scuttling bronze legs, oversized glowing red glass pressure bulb on top flashing before detonation"` |
| `mob_09_ossuary_prelate` | `72×72` | `"Tall skeletal cathedral priest in crimson velvet vestments, spine replaced with golden clockwork gears, raising an ornate reliquary staff projecting silver shield aura"` |
| `mob_10_pendulum_assassin` | `64×64` | `"Sleek masked clockwork cutthroat in dark indigo cloak, twin curved scissor-blades, dissolving into dark smoke and reappearing in cross-slash ambush stance"` |
| `mob_11_mercury_stalker` | `80×64` | `"Quadrupedal liquid-mercury mechanical hound, sleek chrome-silver feral chassis capable of flattening into a reflective puddle and erupting into razor spike pounce"` |
| `mob_12_astral_inquisitor` | `96×96` | `"Floating high-ranking white-porcelain & gold inquisitor, three levitating golden astrolabe blade-rings orbiting body, faceless mask with crimson seal, casting gravity sigil"` |
| **`boss_01_furnace_warden`**<br>典狱长·萨尔弗 | `160×160` | `"Colossal Boss sprite sheet of Arch-Warden Sulfur: hulk-sized brass-armored furnace jailer with a giant burning bronze thurible cage built into his ribcage; Phase 1 swinging chained censer; Phase 2 chest furnace ripped open erupting roaring orange-green sulfur flames, dual-chain whirlwind"` |
| **`boss_02_grand_alchemist`**<br>帕拉塞尔苏斯 (P1/P2/P3) | `192×192` (P2)<br>`80×80` (P1/P3) | `"Final Boss Paracelsus Prime: [P1] Regal floating alchemist sovereign in white-gold porcelain robes surrounded by 4 elemental orbs; [P2] Fused into a gigantic Ouroboros clockwork-seraphim half-body colossus wielding a 3-meter liquid mercury greatsword; [P3] Stripped mortal white-coated swordsman duelist mirror-form"` |

---

## 4. 商业级双轨交互音乐与多变体音效全案

### 4.1 双轨垂直自适应混音器与濒死低通滤波架构（`src/audio/`）

1. **零相位漂移双轨同播（`src/audio/AdaptiveStemMixer.ts`）**：
   进入每个生态群落时，同时实例化并同帧启动 `exploreHowl`（音量初始 `0.85`）与 `combatHowl`（音量初始 `0.0`，但与探索轨保持毫秒级同步静音跟跑）。
   - 当 `EnemyDirector` 上报视野与邻近仇恨怪物数量 `aggroCount >= 1` 时：在 `900 ms` 内平滑拉升 `combatHowl` 音量至 `0.90`，并将 `exploreHowl` 微压至 `0.35` 作为和声铺底；
   - 当最后一只仇恨怪死亡（脱战超过 `2.2 s`）时：在 `1,500 ms` 内将 `combatHowl` 淡出回 `0.0`，恢复幽邃的探索氛围轨。
2. **濒死心跳与暂停界面实时低通滤波器（`src/audio/WebAudioFilterRack.ts`）**：
   将 `Howler.masterGain` 重路由串联一颗原生 `BiquadFilterNode (type: 'lowpass', Q: 1.4)`：
   - 正常战斗状态：截止频率锁定 `20,000 Hz`（全频通透）；
   - 当玩家 `currentHp < 0.25 * maxHp` 或打开暂停/背包弹窗时：使用 `filter.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.25)` 将高频瞬态平滑滤除，营造水下窒息般的濒死压迫感，并在濒死时叠加独立的 `68 BPM` 低频闷响水银脉搏声。

---

### 4.2 全量 BGM 双轨曲目单与 AI 音乐生成英文 Prompt 词典

| 曲目 ID | 归属场景 / 阶段 | 精确 BPM & 拍号 / 循环小节 | AI 音乐生成标准化英文 Prompt（Suno / Udio / Stable Audio 工业母带级指令） |
| :--- | :--- | :---: | :--- |
| `bgm_sanctum_loop` | 永恒锻炉圣所（安全基地） | `84 BPM`, `3/4`, `32 Bars` | `"Dark chamber alchemy sanctuary theme, 84 BPM 3/4 waltz, melancholic solo cello,resonant glass harmonica, distant warm forge bellows and ticking pocket watch, atmospheric gothic indie game soundtrack, Dead Cells inspired, no vocals"` |
| `bgm_b01_explore`<br>`bgm_b01_combat` | 第一层：矿渣蒸馏厂<br>（探索轨 / 战斗轨） | **`136 BPM`**, `4/4`, `32 Bars` | **Explore**: `"136 BPM dark industrial alchemy ambient stem, muted acoustic guitar ostinato, deep Bowed double bass, metallic pipe resonance, tense subterranean prison mood"`<br>**Combat**: `"136 BPM exact tempo match aggressive dark action roguelite combat stem, driving anvil percussion, distorted hurdy-gurdy riff, staccato brass stabs, high-energy Dead Cells style"` |
| `bgm_b02_explore`<br>`bgm_b02_combat` | 第二层：矾酸暗渠<br>（探索轨 / 战斗轨） | **`142 BPM`**, `4/4`, `32 Bars` | **Explore**: `"142 BPM eerie subterranean sewer alchemy stem, echoing pizzicato strings, bubbling analog synth sub-bass, haunting bass flute, dank verdigris atmosphere"`<br>**Combat**: `"142 BPM exact tempo match frantic plague-sewer battle stem, breakbeat tribal war drums, aggressive staccato violas, gritty synth acid bassline, relentless momentum"` |
| `bgm_b03_explore`<br>`bgm_b03_combat` | 第三层：发条骸骨堂<br>（探索轨 / 战斗轨） | **`150 BPM`**, `6/8`, `32 Bars` | **Explore**: `"150 BPM 6/8 gothic clockwork cathedral exploration stem, harpsichord arpeggios, mechanical clock escapement clicks, distant pipe organ pedal tone"`<br>**Combat**: `"150 BPM 6/8 baroque metal gothic boss-rush intensity combat stem, thunderous church pipe organ leads, fast double-kick percussion, electric harpsichord and choir"` |
| `bgm_b04_explore`<br>`bgm_b04_combat` | 第四层：星界熔炉之巅<br>（探索轨 / 战斗轨） | **`156 BPM`**, `4/4`, `32 Bars` | **Explore**: `"156 BPM cosmic dark alchemy summit stem, shimmering metallic celesta, tense high string tremolos, deep sub-drone, sacred ominous finality"`<br>**Combat**: `"156 BPM epic final biome action roguelite combat stem, soaring brass section, polyrhythmic taiko and clockwork percussion, blazing solo violin, urgent climax"` |
| `bgm_boss1_p1`<br>`bgm_boss1_p2` | Boss 1：典狱长·萨尔弗<br>（P1 重锤 / P2 焚化狂暴） | **`138 BPM`**, `4/4`, `32 Bars` | **P1**: `"138 BPM heavy industrial boss fight music, stomping iron chain percussion, low tuba and trombone menace, dark gothic orchestral"`<br>**P2**: `"138 BPM furious phase-2 boss escalation, blazing Latin choir stabs, double-time anvil blast-beats, screaming brass & overdriven cello"` |
| `bgm_boss2_p1`<br>`bgm_boss2_p2`<br>`bgm_boss2_p3` | Boss 2：帕拉塞尔苏斯<br>（P1 导师 / P2 神躯 / P3 真结局死斗） | **`160 BPM`**, `4/4`, `48 Bars` | **P1**: `"160 BPM regal arcane grandmaster battle, intricate harpsichord + string quartet duel"`<br>**P2**: `"160 BPM colossal divine clockwork boss orchestra, massive pipe organ, full apocalyptic choir"`<br>**P3 (True Ending)**: `"160 BPM emotional tragic piano and solo violin over driving breakneck percussion, two halves of one soul dueling to the death"` |

---

### 4.3 高频防疲劳音效池清单（24 组多变体采样 + `±8%` 音高微扰 Prompt 表）

`SfxPoolPlayer.ts` 对以下每一组音效加载指定数量的独立采样变体（`_v1`, `_v2`, ...），每次触发随机抽取非上一次使用的变体，并施加 `rate = 0.92 + visualRng.nextFloat() * 0.16` 音高微扰：

| 音效组 ID | 变体数 / 并发上限 | 标准化英文 SFX 生成 Prompt（时长严格裁剪无静音头，瞬态锐利） |
| :--- | :---: | :--- |
| `sfx_step_stone` | `4` / `2` | `"Crisp boot footstep on wet dungeon stone with subtle metallic spur clink, dry foley, 120ms"` |
| `sfx_step_metal` | `4` / `2` | `"Sharp boot footstep on hollow cast-iron grate, industrial metallic ring, 120ms"` |
| `sfx_jump_launch` | `3` / `2` | `"Leather coat whoosh with subtle pneumatic brass joint hiss upward jump, 180ms"` |
| `sfx_djump_mercury` | `3` / `2` | `"Pressurized liquid mercury vapor burst mixed with shimmering metallic chime double-jump, 240ms"` |
| `sfx_dodge_whoosh` | `3` / `2` | `"Fast low-pitched cloth whip and liquid silver swoosh evasive dodge roll, 220ms"` |
| `sfx_swing_light` | `4` / `3` | `"Razor-sharp surgical steel blade cutting air, high-speed treble whoosh, 140ms"` |
| `sfx_swing_heavy` | `3` / `2` | `"Heavy iron cleaver/maul displacing air, deep weighty low-mid whoosh with chain rattle, 280ms"` |
| `sfx_hit_flesh` | `4` / `4` | `"Visceral wet blade slash into corrupted flesh, crunchy bone impact + liquid splash, punchy transient, 190ms"` |
| `sfx_hit_clockwork` | `4` / `4` | `"Hard steel striking brass armor and gears, bright metallic spark crunch, 200ms"` |
| `sfx_crit_impact` | `3` / `3` | `"Devastating critical hit layered transient: sub-bass thump + shattering alchemical glass + resonant silver bell overtone, 380ms"` |
| `sfx_parry_clang` | `3` / `2` | `"Iconic ultra-satisfying shield parry: crystal-clear resonant high-carbon steel ring + shockwave boom, 450ms"` |
| `sfx_breach_stun` | `2` / `2` | `"Enemy poise broken armor cracking apart with descending brass spring unwind groan, 400ms"` |
| `sfx_bow_release` | `3` / `3` | `"Tightly strung tungsten bowstring snap and mechanical crossbow latch click, 160ms"` |
| `sfx_flask_shatter` | `3` / `3` | `"Thick glass alchemy flask smashing on stone followed by sizzling acid flare, 350ms"` |
| `sfx_voltaic_zap` | `4` / `3` | `"Snappy high-voltage Tesla coil electric arc crackle, 200ms"` |
| `sfx_status_freeze` | `2` / `2` | `"Flash cryogenic ice crystallization crack, brittle sub-zero chime, 320ms"` |
| `sfx_hemorrhage_pop` | `2` / `2` | `"5-stack bleed burst: deep visceral heartbeat thud into pressurized arterial splash, 360ms"` |
| `sfx_enemy_warn_parry` | `2` / `3` | `"Distinct sharp golden tuning-fork glint cue warning player to parry now, 180ms"` |
| `sfx_enemy_warn_red` | `2` / `2` | `"Menacing low brass horn growl + metallic scrape warning of unparriable attack, 280ms"` |
| `sfx_enemy_dissolve` | `3` / `4` | `"Corrupted construct crumbling into sizzling embers and ash dust, 500ms"` |
| `sfx_ichor_pickup` | `4` / `5` | `"Crystalline liquid mercury droplet absorbed with harmonic ascending chime, 160ms"` |
| `sfx_scroll_upgrade` | `1` / `1` | `"Parchment unfurl + powerful alchemical furnace flare chord stat level-up fanfare, 950ms"` |
| `sfx_flask_drink` | `2` / `1` | `"Uncorking glass phial, glowing elixir gulp and warm crystalline resonance heal, 600ms"` |
| `sfx_ui_confirm_cancel` | `3` / `2` | `"Tactile brass pocket-watch escapement click and weighted mechanical lever lock UI sound, 90ms"` |
