---
name: asset-factory
description: >-
  Automated pixel-art asset production pipeline for QUICKSILVER CRUCIBLE. Use this skill whenever generating, cleaning, palette-quantizing, normal-mapping, or packing character spritesheets, enemy/boss animations, biome 47-tile autotiles, parallax layers, or weapon/skill icons into Phaser 3 Light2D MultiAtlases.
---

# AI 像素美术资产与法线贴图自动化工厂技能（Asset Factory）

本技能封装了《水银坩埚》从原始多模态生图输出到可直接挂载 Phaser `Light2D` 动态光照管线的 **5 步零白边标准化生产流水线**。所有脚本均位于 `tools/asset-factory/`。

---

## 1. 标准五步执行流水线（Pipeline Runbook）

每当需要新增或更新任何角色、怪物、瓦片或图标资产时，按以下严格顺序执行：

1. **Step 1 — 锁定画风原画生成**：
   读取 `docs/04_ART_VFX_AUDIO_PIPELINE.md` 第 3 节中的标准英文 Prompt 模板（必须携带 `LOCKED_STYLE_PREFIX` 与纯品红 `#FF00FF` 或高对比纯色背景约束），输出原始序列帧大图至 `.tmp/raw_assets/<category>/<asset_id>.png`。
2. **Step 2 — 边缘无白边去背与最近邻像素网格对齐 + 48 色板锁定量化**：
   执行 `python3 tools/asset-factory/quantize_palette.py --input .tmp/raw_assets/... --output .tmp/quantized/... --target-cell 64`
   - 使用 `rembg` 结合色度键剥离背景，并对 Alpha 通道执行 **`alpha >= 140 ? 255 : 0` 硬阈值二值化裁剪**，彻底根除半透明白边与灰边；
   - 按目标逻辑像素尺寸执行最近邻插值（Nearest-Neighbor）对齐，并使用 `Bayer 2x2` 微抖动将所有 RGB 像素严格映射至 `src/data/palette.data.ts` 的 48 色暗黑炼金主色板。
3. **Step 3 — 自动计算像素对齐切线空间法线贴图（`*_n.png`）**：
   执行 `python3 tools/asset-factory/normal_map_sobel.py --diffuse .tmp/quantized/<name>.png --output .tmp/quantized/<name>_n.png --strength 2.4`
   - 对漫反射图提取感知伪高度场（金属高光与白瓷凸起权重高于暗部皮革），叠加轮廓距离场（Signed Distance Bevel）使精灵边缘呈现饱满立体倒角，再经 `3x3 Sobel` 算子输出标准 OpenGL 法线贴图（平坦表面 `#8080FF`，透明区域统一填充中性法线 `#8080FF` 防采样黑圈）。
4. **Step 4 — 枢轴点紧致裁剪与 Phaser MultiAtlas 双图打包**：
   执行 `node tools/asset-factory/pack_multiatlas.mjs --src .tmp/quantized/<category> --out public/assets/atlases/<atlas_name>`
   - 自动按角色脚底中心设置 `pivot: { x: 0.5, y: 1.0 }`，输出 `<atlas_name>.json`、`<atlas_name>.png` 与严格同尺寸同 UV 坐标的 `<atlas_name>_n.png`。
5. **Step 5 — 法线对与零占位符门禁校验**：
   执行 `node .agents/skills/visual-qa-inspector/scripts/audit_zero_placeholder.mjs` 确认新图集漫反射与法线图像素尺寸 `1:1` 完全吻合。

---

## 2. 核心流水线脚本参考实现

### 2.1 色板量化与零白边净化脚本（`tools/asset-factory/quantize_palette.py`）

```python
#!/usr/bin/env python3
"""Purges semi-transparent fringes, snaps pixel grid, and quantizes to the locked 48-color Dark Alchemy palette."""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
from rembg import remove

# 与 src/data/palette.data.ts 100% 锁定的 48 色主色板 (RGB)
LOCKED_PALETTE_HEX = [
    # Void & Cold Slate Shadows (8)
    "#0B0C10", "#11131C", "#161824", "#1E2233", "#272C42", "#323954", "#414A6B", "#556085",
    # Porcelain & Quicksilver Highlights (6)
    "#7C8599", "#9AA5B8", "#B8C4D4", "#D4DEE8", "#E8EFF5", "#F8FAFC",
    # Corrupted Brass & Astral Gold (8)
    "#291A0E", "#3D2817", "#593A1E", "#7A5128", "#9E6B34", "#C28B42", "#E0AE53", "#FBBF24",
    # Slag Rust & Calcined Flesh (8)
    "#240B12", "#3B121E", "#591B2B", "#7D2438", "#A62B44", "#CF3650", "#E11D48", "#FB7185",
    # Verdigris Copper & Vitriol Acid (8)
    "#0B1F1D", "#12332F", "#1B4D46", "#266B60", "#328F7D", "#22C55E", "#3CE682", "#A3E635",
    # Furnace Ember & Elemental Accents (10)
    "#431407", "#7C2D12", "#C2410C", "#EA580C", "#FF5E2B", "#FDBA74",
    "#3B0764", "#6D28D9", "#A855F7", "#38BDF8",
]

PALETTE_RGB = np.array(
    [[int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)] for h in LOCKED_PALETTE_HEX],
    dtype=np.float32,
)

BAYER_2X2 = (np.array([[0.0, 2.0], [3.0, 1.0]], dtype=np.float32) / 4.0 - 0.375) * 10.0


def process_sprite(input_path: Path, output_path: Path, scale_down: int) -> None:
    raw_img = Image.open(input_path).convert("RGBA")
    cutout = remove(raw_img, alpha_matting=False)

    if scale_down > 1:
        w, h = cutout.size
        cutout = cutout.resize((max(1, w // scale_down), max(1, h // scale_down)), Image.Resampling.NEAREST)

    arr = np.array(cutout, dtype=np.float32)
    alpha = arr[:, :, 3]
    # 硬裁剪半透明边缘，彻底消灭 AI 原画常见的脏白边/品红残边
    hard_mask = alpha >= 140.0
    rgb = arr[:, :, :3]

    # 施加极轻微有序抖动并映射至最近邻欧氏色彩空间锁定色板
    h_px, w_px, _ = rgb.shape
    tiled_bayer = np.tile(BAYER_2X2, (h_px // 2 + 1, w_px // 2 + 1))[:h_px, :w_px, None]
    dithered = np.clip(rgb + tiled_bayer, 0.0, 255.0)

    flat_pixels = dithered[hard_mask]
    if flat_pixels.size > 0:
        diffs = flat_pixels[:, None, :] - PALETTE_RGB[None, :, :]
        dists = np.sum(diffs * diffs, axis=2)
        nearest_idx = np.argmin(dists, axis=1)
        quantized_rgb = np.zeros_like(rgb, dtype=np.uint8)
        quantized_rgb[hard_mask] = PALETTE_RGB[nearest_idx].astype(np.uint8)
    else:
        quantized_rgb = np.zeros_like(rgb, dtype=np.uint8)

    out_rgba = np.zeros((h_px, w_px, 4), dtype=np.uint8)
    out_rgba[:, :, :3] = quantized_rgb
    out_rgba[:, :, 3] = np.where(hard_mask, 255, 0).astype(np.uint8)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out_rgba, mode="RGBA").save(output_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--downsample", type=int, default=1)
    args = parser.parse_args()
    process_sprite(args.input, args.output, args.downsample)
```

---

### 2.2 Sobel + 轮廓倒角自动法线图生成脚本（`tools/asset-factory/normal_map_sobel.py`）

```python
#!/usr/bin/env python3
"""Generates pixel-aligned OpenGL tangent-space normal maps (*_n.png) for Phaser 3 Light2D."""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, sobel


def generate_normal_map(diffuse_path: Path, output_path: Path, strength: float) -> None:
    img = Image.open(diffuse_path).convert("RGBA")
    arr = np.array(img, dtype=np.float32)
    rgb = arr[:, :, :3] / 255.0
    opaque = arr[:, :, 3] > 127.0

    # 感知亮度高度 + 边缘 3px 球面内倒角高度混合，赋予 2D 像素饱满体积受光感
    luma = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    bevel = np.clip(distance_transform_edt(opaque) / 4.0, 0.0, 1.0)
    height_map = np.where(opaque, 0.55 * luma + 0.45 * bevel, 0.0)

    # OpenGL 切线空间：+X 向右 (R)，+Y 向上 (G)，+Z 朝向屏幕外 (B)
    dx = sobel(height_map, axis=1) * strength
    dy = sobel(height_map, axis=0) * strength

    nx = -dx
    ny = dy  # 翻转图像 Y 轴向下梯度至 OpenGL Y 轴向上法线标准
    nz = np.ones_like(height_map)

    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
    nx, ny, nz = nx / norm, ny / norm, nz / norm

    out = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
    # 透明背景统一填充标准平坦法线 (128, 128, 255, 255) 防止纹理边缘插值渗黑
    out[:, :, 0] = np.where(opaque, np.clip((nx * 0.5 + 0.5) * 255.0, 0, 255), 128).astype(np.uint8)
    out[:, :, 1] = np.where(opaque, np.clip((ny * 0.5 + 0.5) * 255.0, 0, 255), 128).astype(np.uint8)
    out[:, :, 2] = np.where(opaque, np.clip((nz * 0.5 + 0.5) * 255.0, 0, 255), 255).astype(np.uint8)
    out[:, :, 3] = 255

    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, mode="RGBA").save(output_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--diffuse", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--strength", type=float, default=2.4)
    args = parser.parse_args()
    generate_normal_map(args.diffuse, args.output, args.strength)
```
