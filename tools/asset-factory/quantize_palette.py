#!/usr/bin/env python3
"""
Purges semi-transparent fringes & #FF00FF chroma halos, snaps pixel grid,
and quantizes RGBA sprites/tiles/parallax layers to the locked 48-color Dark Alchemy palette.
"""
import os
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError:
    for _cand in ("/opt/homebrew/bin/python3.14", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"):
        if os.path.exists(_cand) and os.path.realpath(_cand) != os.path.realpath(sys.executable):
            os.execv(_cand, [_cand, *sys.argv])
    raise

import argparse
from pathlib import Path

try:
    from rembg import remove as rembg_remove
except ImportError:
    rembg_remove = None

# 与 src/data/palette.data.ts 100% 镜像锁定的 48 色暗黑炼金主色板
LOCKED_PALETTE_HEX = [
    # 1. Void & Cold Slate Shadows (8)
    "#0B0C10", "#11131C", "#161824", "#1E2233", "#272C42", "#323954", "#414A6B", "#556085",
    # 2. Porcelain & Quicksilver Highlights (6)
    "#7C8599", "#9AA5B8", "#B8C4D4", "#D4DEE8", "#E8EFF5", "#F8FAFC",
    # 3. Corrupted Brass & Astral Gold (8)
    "#291A0E", "#3D2817", "#593A1E", "#7A5128", "#9E6B34", "#C28B42", "#E0AE53", "#FBBF24",
    # 4. Slag Rust & Calcined Flesh (8)
    "#240B12", "#3B121E", "#591B2B", "#7D2438", "#A62B44", "#CF3650", "#E11D48", "#FB7185",
    # 5. Verdigris Copper & Vitriol Acid (8)
    "#0B1F1D", "#12332F", "#1B4D46", "#266B60", "#328F7D", "#22C55E", "#3CE682", "#A3E635",
    # 6. Furnace Ember & Elemental Accents (10)
    "#431407", "#7C2D12", "#C2410C", "#EA580C", "#FF5E2B", "#FDBA74",
    "#3B0764", "#6D28D9", "#A855F7", "#38BDF8",
]

PALETTE_RGB = np.array(
    [[int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)] for h in LOCKED_PALETTE_HEX],
    dtype=np.float32,
)

BAYER_2X2 = (np.array([[0.0, 2.0], [3.0, 1.0]], dtype=np.float32) / 4.0 - 0.375) * 8.0


def strip_magenta_and_despill(rgba: np.ndarray) -> np.ndarray:
    """Strips #FF00FF background (including JPEG DCT bleed) and neutralizes pink/purple edge halos."""
    out = rgba.copy()
    r = out[:, :, 0]
    g = out[:, :, 1]
    b = out[:, :, 2]
    a = out[:, :, 3]

    rb_close = np.abs(r - b) < 72.0
    magenta_core = rb_close & (r > 105.0) & (b > 105.0) & ((r - g) > 62.0) & ((b - g) > 62.0)
    a = np.where(magenta_core, 0.0, a)

    # Erode 1px of residual strong magenta fringe bordering transparent pixels
    trans = a < 140.0
    padded = np.pad(trans, 1, mode="edge")
    near_trans = (
        padded[:-2, 1:-1]
        | padded[2:, 1:-1]
        | padded[1:-1, :-2]
        | padded[1:-1, 2:]
        | padded[:-2, :-2]
        | padded[:-2, 2:]
        | padded[2:, :-2]
        | padded[2:, 2:]
    )
    fringe_spill = near_trans & (np.abs(r - b) < 60.0) & ((r - g) > 34.0) & ((b - g) > 34.0)
    a = np.where(fringe_spill, 0.0, a)

    # Despill subtle magenta tint on surviving boundary pixels so they map to cold slate instead of neon purple
    surviving_tint = (a >= 140.0) & near_trans & (np.abs(r - b) < 50.0) & (g < np.minimum(r, b) - 18.0)
    neutral_rb = np.maximum(g + 8.0, 0.35 * (r + b) * 0.5)
    out[:, :, 0] = np.where(surviving_tint, neutral_rb, r)
    out[:, :, 2] = np.where(surviving_tint, neutral_rb + 6.0, b)
    out[:, :, 3] = a
    return out


def make_horizontal_seamless(rgba: np.ndarray, blend_px: int = 28) -> np.ndarray:
    """Cross-blends a narrow horizontal seam so x=0 and x=W-1 wrap cleanly for Phaser TileSprite."""
    h, w, _ = rgba.shape
    if w <= blend_px * 2:
        return rgba
    rolled = np.roll(rgba, shift=w // 2, axis=1)
    mid = w // 2
    half = blend_px // 2
    for offset in range(-half, half):
        x_dst = mid + offset
        x_src = (x_dst + w // 2) % w
        t = (offset + half) / float(max(1, 2 * half))
        # Smoothstep weight
        w_t = t * t * (3.0 - 2.0 * t)
        p_a = rolled[:, x_dst, :]
        p_b = rgba[:, x_src, :]
        rolled[:, x_dst, :3] = p_a[:, :3] * (1.0 - w_t) + p_b[:, :3] * w_t
        rolled[:, x_dst, 3] = np.where(w_t < 0.5, p_a[:, 3], p_b[:, 3])
    return np.roll(rolled, shift=-(w // 2), axis=1)


def quantize_rgba_array(
    arr: np.ndarray,
    dither_strength: float = 1.0,
    keep_opaque_bg: bool = False,
) -> np.ndarray:
    alpha = arr[:, :, 3]
    hard_mask = np.ones_like(alpha, dtype=bool) if keep_opaque_bg else (alpha >= 140.0)
    rgb = arr[:, :, :3]

    h_px, w_px, _ = rgb.shape
    if dither_strength > 0.0:
        tiled_bayer = np.tile(BAYER_2X2 * dither_strength, (h_px // 2 + 1, w_px // 2 + 1))[:h_px, :w_px, None]
        sample_rgb = np.clip(rgb + tiled_bayer, 0.0, 255.0)
    else:
        sample_rgb = np.clip(rgb, 0.0, 255.0)

    flat_pixels = sample_rgb[hard_mask]
    quantized_rgb = np.zeros_like(rgb, dtype=np.uint8)
    if flat_pixels.size > 0:
        # Perceptually weighted squared RGB distance (human-eye redmean approximation)
        weights = np.array([0.30, 0.59, 0.11], dtype=np.float32)[None, None, :]
        diffs = flat_pixels[:, None, :] - PALETTE_RGB[None, :, :]
        dists = np.sum((diffs * diffs) * (0.65 + 0.35 * weights), axis=2)
        nearest_idx = np.argmin(dists, axis=1)
        quantized_rgb[hard_mask] = PALETTE_RGB[nearest_idx].astype(np.uint8)

    out_rgba = np.zeros((h_px, w_px, 4), dtype=np.uint8)
    out_rgba[:, :, :3] = quantized_rgb
    out_rgba[:, :, 3] = np.where(hard_mask, 255, 0).astype(np.uint8)
    return out_rgba


def process_sprite(
    input_path: Path,
    output_path: Path,
    scale_down: int = 1,
    target_size: tuple[int, int] | None = None,
    chroma_key: bool = True,
    use_rembg: bool = False,
    keep_opaque_bg: bool = False,
    wrap_x: bool = False,
    dither_strength: float = 0.65,
) -> None:
    raw_img = Image.open(input_path).convert("RGBA")
    if use_rembg and rembg_remove is not None and not keep_opaque_bg:
        raw_img = rembg_remove(raw_img, alpha_matting=False)

    arr = np.array(raw_img, dtype=np.float32)
    if chroma_key and not keep_opaque_bg:
        arr = strip_magenta_and_despill(arr)

    if target_size is not None or scale_down > 1:
        pil_cut = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGBA")
        if target_size is not None:
            new_w, new_h = target_size
        else:
            w, h = pil_cut.size
            new_w, new_h = max(1, w // scale_down), max(1, h // scale_down)
        pil_cut = pil_cut.resize((new_w, new_h), Image.Resampling.NEAREST)
        arr = np.array(pil_cut, dtype=np.float32)

    if wrap_x:
        arr = make_horizontal_seamless(arr)

    out_rgba = quantize_rgba_array(arr, dither_strength=dither_strength, keep_opaque_bg=keep_opaque_bg)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out_rgba, mode="RGBA").save(output_path)


def parse_size(spec: str | None) -> tuple[int, int] | None:
    if not spec:
        return None
    parts = spec.lower().split("x")
    if len(parts) != 2:
        raise ValueError(f"Invalid --target-size '{spec}', expected WxH (e.g. 640x360)")
    return int(parts[0]), int(parts[1])


def main() -> None:
    parser = argparse.ArgumentParser(description="Quantize sprites/tiles to locked 48-color Dark Alchemy palette.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--downsample", type=int, default=1)
    parser.add_argument("--target-cell", type=int, default=0, help="Optional single-frame square target size")
    parser.add_argument("--target-size", type=str, default=None, help="Optional explicit WxH output size")
    parser.add_argument("--no-chroma-key", action="store_true")
    parser.add_argument("--use-rembg", action="store_true")
    parser.add_argument("--keep-opaque-bg", action="store_true")
    parser.add_argument("--wrap-x", action="store_true")
    parser.add_argument("--dither", type=float, default=0.65)
    args = parser.parse_args()

    tsize = parse_size(args.target_size)
    if tsize is None and args.target_cell > 0 and args.input.is_file():
        with Image.open(args.input) as probe:
            if probe.width == probe.height:
                tsize = (args.target_cell, args.target_cell)

    if args.input.is_dir():
        for src_file in sorted(args.input.glob("*.png")):
            if src_file.name.endswith("_n.png"):
                continue
            dst_file = args.output / src_file.name
            process_sprite(
                src_file,
                dst_file,
                scale_down=args.downsample,
                target_size=tsize,
                chroma_key=not args.no_chroma_key,
                use_rembg=args.use_rembg,
                keep_opaque_bg=args.keep_opaque_bg,
                wrap_x=args.wrap_x,
                dither_strength=args.dither,
            )
    else:
        process_sprite(
            args.input,
            args.output,
            scale_down=args.downsample,
            target_size=tsize,
            chroma_key=not args.no_chroma_key,
            use_rembg=args.use_rembg,
            keep_opaque_bg=args.keep_opaque_bg,
            wrap_x=args.wrap_x,
            dither_strength=args.dither,
        )


if __name__ == "__main__":
    main()
