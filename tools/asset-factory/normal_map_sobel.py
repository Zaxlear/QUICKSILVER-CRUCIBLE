#!/usr/bin/env python3
"""
Generates pixel-aligned OpenGL tangent-space normal maps (*_n.png) for Phaser 3 Light2D.
Uses exact 2D Euclidean Distance Transform + 3x3 Sobel in pure NumPy (with optional SciPy fast-path).
Transparent pixels are filled with neutral flat normal #8080FF (128, 128, 255, 255).
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
    from scipy.ndimage import distance_transform_edt as _scipy_edt
    from scipy.ndimage import sobel as _scipy_sobel
except ImportError:
    _scipy_edt = None
    _scipy_sobel = None


def _edt_1d_sq(f: np.ndarray) -> np.ndarray:
    """Felzenszwalb & Huttenlocher O(N) exact 1D squared distance transform along axis 1."""
    rows, cols = f.shape
    d = np.empty_like(f)
    INF = 1e12
    for r in range(rows):
        row = f[r]
        v = np.zeros(cols, dtype=np.int32)
        z = np.zeros(cols + 1, dtype=np.float32)
        z[0] = -INF
        z[1] = INF
        k = 0
        for q in range(1, cols):
            s = ((row[q] + q * q) - (row[v[k]] + v[k] * v[k])) / (2.0 * (q - v[k]))
            while s <= z[k]:
                k -= 1
                s = ((row[q] + q * q) - (row[v[k]] + v[k] * v[k])) / (2.0 * (q - v[k]))
            k += 1
            v[k] = q
            z[k] = s
            z[k + 1] = INF
        k = 0
        for q in range(cols):
            while z[k + 1] < q:
                k += 1
            diff = q - v[k]
            d[r, q] = diff * diff + row[v[k]]
    return d


def compute_edt(opaque: np.ndarray) -> np.ndarray:
    """Computes exact Euclidean distance to nearest transparent pixel (0 outside, >=1 inside)."""
    if _scipy_edt is not None:
        return _scipy_edt(opaque).astype(np.float32)
    if np.all(opaque):
        h, w = opaque.shape
        return np.full((h, w), 8.0, dtype=np.float32)
    if not np.any(opaque):
        return np.zeros_like(opaque, dtype=np.float32)

    # Pad 1px of False border so sprite edges touching canvas boundary still receive crisp bevel
    padded = np.pad(opaque, 1, mode="constant", constant_values=False)
    INF = 1e9
    init = np.where(padded, INF, 0.0).astype(np.float32)
    pass_x = _edt_1d_sq(init)
    pass_xy = _edt_1d_sq(pass_x.T).T
    dist = np.sqrt(np.maximum(pass_xy[1:-1, 1:-1], 0.0))
    return dist.astype(np.float32)


def sobel_xy(height_map: np.ndarray, wrap_x: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """3x3 Sobel gradients along X (axis=1) and Y (axis=0) with optional horizontal wrap."""
    if _scipy_sobel is not None and not wrap_x:
        return _scipy_sobel(height_map, axis=1), _scipy_sobel(height_map, axis=0)

    pad_y = np.pad(height_map, ((1, 1), (0, 0)), mode="edge")
    if wrap_x:
        padded = np.pad(pad_y, ((0, 0), (1, 1)), mode="wrap")
    else:
        padded = np.pad(pad_y, ((0, 0), (1, 1)), mode="edge")

    # Sobel X kernel: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
    dx = (
        (padded[:-2, 2:] + 2.0 * padded[1:-1, 2:] + padded[2:, 2:])
        - (padded[:-2, :-2] + 2.0 * padded[1:-1, :-2] + padded[2:, :-2])
    )
    # Sobel Y kernel: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]] (positive downward in image coords)
    dy = (
        (padded[2:, :-2] + 2.0 * padded[2:, 1:-1] + padded[2:, 2:])
        - (padded[:-2, :-2] + 2.0 * padded[:-2, 1:-1] + padded[:-2, 2:])
    )
    return dx, dy


def generate_normal_map(
    diffuse_path: Path,
    output_path: Path,
    strength: float = 2.4,
    wrap_x: bool = False,
) -> None:
    img = Image.open(diffuse_path).convert("RGBA")
    arr = np.array(img, dtype=np.float32)
    rgb = arr[:, :, :3] / 255.0
    opaque = arr[:, :, 3] > 127.0

    # Perceptual luminance + 4px silhouette bevel gives porcelain armor & riveted masonry rich 3D volume
    luma = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    bevel = np.clip(compute_edt(opaque) / 4.0, 0.0, 1.0)
    height_map = np.where(opaque, 0.58 * luma + 0.42 * bevel, 0.0)

    dx, dy = sobel_xy(height_map, wrap_x=wrap_x)
    nx = -dx * strength
    ny = dy * strength  # Flip image Y-down gradient into OpenGL tangent-space +Y up convention
    nz = np.ones_like(height_map)

    inv_norm = 1.0 / (np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6)
    nx *= inv_norm
    ny *= inv_norm
    nz *= inv_norm

    out = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
    out[:, :, 0] = np.where(opaque, np.clip(np.round((nx * 0.5 + 0.5) * 255.0), 0, 255), 128).astype(np.uint8)
    out[:, :, 1] = np.where(opaque, np.clip(np.round((ny * 0.5 + 0.5) * 255.0), 0, 255), 128).astype(np.uint8)
    out[:, :, 2] = np.where(opaque, np.clip(np.round((nz * 0.5 + 0.5) * 255.0), 0, 255), 255).astype(np.uint8)
    out[:, :, 3] = 255

    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, mode="RGBA").save(output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate tangent-space *_n.png normal maps for Light2D.")
    parser.add_argument("--diffuse", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=False)
    parser.add_argument("--strength", type=float, default=2.4)
    parser.add_argument("--wrap-x", action="store_true")
    args = parser.parse_args()

    if args.diffuse.is_dir():
        out_dir = args.output if args.output is not None else args.diffuse
        for png_file in sorted(args.diffuse.glob("*.png")):
            if png_file.name.endswith("_n.png"):
                continue
            normal_out = out_dir / f"{png_file.stem}_n.png"
            generate_normal_map(png_file, normal_out, strength=args.strength, wrap_x=args.wrap_x)
    else:
        normal_out = (
            args.output
            if args.output is not None
            else args.diffuse.with_name(f"{args.diffuse.stem}_n.png")
        )
        generate_normal_map(args.diffuse, normal_out, strength=args.strength, wrap_x=args.wrap_x)


if __name__ == "__main__":
    main()
