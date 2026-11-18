#!/usr/bin/env python3
"""
Milestone 3 Asset Factory Synthesizer:
Generates raw pixel-art frames for:
  1. locomotion_fx_atlas (dust puffs, double-jump mercury vapor wisps, magnetic claw sparks)
  2. touch_hud_sheet (8x 32x32 Dark Alchemy action icons + 64x64 Astrolabe Joystick Ring & Mercury Core)

All outputs are processed through quantize_palette.py -> normal_map_sobel.py -> pack_multiatlas.mjs.
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

import math
from pathlib import Path

from generate_sprite import C, add_1px_outline, draw_thick_segment, put_px


def generate_locomotion_fx_raw(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. dust_puff_0..3 (16x16 slate/porcelain smoke puffs)
    puff_configs = [
        [(6, 9, 3.6), (9, 8, 3.2), (11, 10, 2.4)],
        [(5, 8, 3.8), (9, 7, 3.6), (12, 9, 2.8), (7, 11, 2.5)],
        [(4, 7, 3.0), (8, 6, 3.2), (12, 8, 2.6), (6, 11, 2.0)],
        [(4, 6, 2.2), (9, 5, 2.4), (12, 7, 1.8)],
    ]
    for idx, blobs in enumerate(puff_configs):
        arr = np.zeros((16, 16, 4), dtype=np.uint8)
        for bx, by, rad in blobs:
            r_int = int(math.ceil(rad))
            for dy in range(-r_int, r_int + 1):
                for dx in range(-r_int, r_int + 1):
                    if dx * dx + dy * dy <= rad * rad:
                        if dy < -rad * 0.35:
                            col = C["PORC_1"] if idx < 2 else C["PORC_0"]
                        elif dy < rad * 0.25:
                            col = C["SLATE_6"]
                        else:
                            col = C["SLATE_4"]
                        put_px(arr, int(bx + dx), int(by + dy), col)
        outlined = add_1px_outline(arr, C["SLATE_1"])
        Image.fromarray(outlined, mode="RGBA").save(out_dir / f"dust_puff_{idx}.png")

    # 2. mercury_vapor_0..2 (24x16 horizontal liquid silver-cyan burst crescents)
    for idx in range(3):
        arr = np.zeros((16, 24, 4), dtype=np.uint8)
        rx = 8 - idx
        ry = 4 - idx // 2
        for x in range(2, 22):
            nx = (x - 12.0) / max(1.0, float(rx))
            if abs(nx) <= 1.25:
                arch_y = int(round(8 + (nx * nx) * 2.5))
                put_px(arr, x, arch_y - 1, C["PORC_5"])
                put_px(arr, x, arch_y, C["CYAN"] if (x + idx) % 2 == 0 else C["PORC_4"])
                if abs(nx) < 0.85 and ry >= 3:
                    put_px(arr, x, arch_y + 1, C["PORC_2"])
        # Droplet beads on tips
        put_px(arr, 3 + idx, 9, C["CYAN"])
        put_px(arr, 20 - idx, 9, C["CYAN"])
        outlined = add_1px_outline(arr, C["SLATE_2"])
        Image.fromarray(outlined, mode="RGBA").save(out_dir / f"mercury_vapor_{idx}.png")

    # 3. claw_spark_0..1 (12x12 sharp golden/ember cross & streak sparks)
    for idx in range(2):
        arr = np.zeros((12, 12, 4), dtype=np.uint8)
        cx, cy = 6, 6
        span = 4 if idx == 0 else 3
        for d in range(-span, span + 1):
            col = C["PORC_5"] if abs(d) <= 1 else (C["GOLD"] if abs(d) <= 2 else C["EMBER_4"])
            put_px(arr, cx + d, cy, col)
            put_px(arr, cx, cy + d, col)
        if idx == 0:
            for d in (-2, 2):
                put_px(arr, cx + d, cy + d, C["EMBER_3"])
                put_px(arr, cx + d, cy - d, C["GOLD"])
        Image.fromarray(arr, mode="RGBA").save(out_dir / f"claw_spark_{idx}.png")


def _draw_icon_frame_bg(tile: np.ndarray, border_col: tuple[int, int, int, int]) -> None:
    # Subtle dark gothic octagonal backing inside 32x32 icon for strong silhouette contrast
    for y in range(3, 29):
        for x in range(3, 29):
            chamfer = abs(x - 15.5) + abs(y - 15.5)
            if chamfer <= 21.5:
                if chamfer >= 20.0 or x in (3, 28) or y in (3, 28):
                    tile[y, x] = border_col
                else:
                    tile[y, x] = C["SLATE_1"] if (x + y) % 2 == 0 else C["SLATE_0"]


def render_touch_icon(slot: int) -> np.ndarray:
    tile = np.zeros((32, 32, 4), dtype=np.uint8)
    body = np.zeros((32, 32, 4), dtype=np.uint8)

    if slot == 0:
        # 0: attack_primary — Serrated Surgical Scalpel + Crimson Rubedo Arc
        _draw_icon_frame_bg(tile, C["CRIM_4"])
        draw_thick_segment(body, 8, 24, 13, 19, 1.8, C["BRASS_4"], C["GOLD"])
        draw_thick_segment(body, 13, 19, 25, 7, 2.0, C["PORC_2"], C["PORC_5"])
        for k in range(15, 24, 3):
            put_px(body, k + 1, 31 - k, C["CRIM_6"])
        for a in range(-55, 20, 6):
            rad = math.radians(a)
            px = int(round(15 + 11 * math.cos(rad)))
            py = int(round(16 + 11 * math.sin(rad)))
            put_px(body, px, py, C["CRIM_6"] if a < -15 else C["PORC_5"])
    elif slot == 1:
        # 1: attack_secondary — Riveted Slag Repulsor Buckler
        _draw_icon_frame_bg(tile, C["BRASS_5"])
        for y in range(7, 25):
            for x in range(8, 24):
                d = ((x - 15.5) / 7.5) ** 2 + ((y - 15.5) / 8.5) ** 2
                if d <= 1.0:
                    if d >= 0.68:
                        body[y, x] = C["BRASS_5"] if (x + y) % 3 != 0 else C["GOLD"]
                    elif d <= 0.22:
                        body[y, x] = C["CYAN"] if d <= 0.08 else C["PORC_4"]
                    else:
                        body[y, x] = C["SLATE_4"] if x < 16 else C["SLATE_5"]
    elif slot == 2:
        # 2: dodge — Quicksilver Dive Streak & Droplets
        _draw_icon_frame_bg(tile, C["CYAN"])
        draw_thick_segment(body, 7, 20, 23, 12, 2.6, C["CYAN"], C["PORC_5"])
        draw_thick_segment(body, 10, 23, 25, 16, 1.5, C["PORC_2"], C["PORC_4"])
        for dx, dy in [(6, 15), (9, 12), (24, 9), (25, 13)]:
            put_px(body, dx, dy, C["PORC_5"])
    elif slot == 3:
        # 3: jump — Brass Pneumatic Winged Boot + Mercury Updraft
        _draw_icon_frame_bg(tile, C["PORC_2"])
        draw_thick_segment(body, 13, 9, 13, 20, 2.2, C["BRASS_4"], C["GOLD"])
        draw_thick_segment(body, 13, 20, 21, 21, 2.0, C["BRASS_3"], C["BRASS_6"])
        # Mercury wing feathers
        draw_thick_segment(body, 11, 14, 6, 9, 1.3, C["PORC_3"], C["PORC_5"])
        draw_thick_segment(body, 11, 17, 7, 13, 1.2, C["CYAN"], C["PORC_4"])
        for x in range(10, 23, 2):
            put_px(body, x, 25, C["CYAN"])
    elif slot == 4:
        # 4: skill_1 — Vitriol Black-Oil Flask
        _draw_icon_frame_bg(tile, C["ACID_3"])
        draw_thick_segment(body, 15, 7, 16, 11, 1.6, C["BRASS_5"], C["GOLD"])
        for y in range(12, 25):
            for x in range(9, 23):
                if (x - 15.5) ** 2 + (y - 18.0) ** 2 <= 40.0:
                    body[y, x] = C["ACID_5"] if y > 17 else (C["PORC_3"] if x < 13 else C["EMBER_4"])
    elif slot == 5:
        # 5: skill_2 — Clockwork Saw Gear Trap
        _draw_icon_frame_bg(tile, C["BRASS_4"])
        for y in range(7, 25):
            for x in range(7, 25):
                r = math.hypot(x - 15.5, y - 15.5)
                ang = math.atan2(y - 15.5, x - 15.5)
                tooth = 1.6 * math.sin(ang * 8.0)
                if 3.2 <= r <= 7.5 + tooth:
                    body[y, x] = C["GOLD"] if r > 6.4 else C["BRASS_4"]
    elif slot == 6:
        # 6: heal_flask — Philosopher's Crimson Elixir Phial
        _draw_icon_frame_bg(tile, C["CRIM_5"])
        draw_thick_segment(body, 15, 6, 16, 10, 1.5, C["GOLD"], C["PORC_5"])
        for y in range(11, 25):
            half = min(6, 2 + (y - 11) // 2) if y < 20 else max(2, 6 - (y - 20))
            for x in range(16 - half, 16 + half + 1):
                body[y, x] = C["CRIM_6"] if y >= 15 else C["PORC_4"]
        put_px(body, 14, 17, C["PORC_5"])
        put_px(body, 14, 18, C["CRIM_7"])
    else:
        # 7: interact — Ornate Astrolabe Seal Key
        _draw_icon_frame_bg(tile, C["GOLD"])
        for y in range(7, 17):
            for x in range(11, 21):
                d = math.hypot(x - 15.5, y - 11.5)
                if 2.2 <= d <= 4.5:
                    body[y, x] = C["GOLD"]
        draw_thick_segment(body, 15, 16, 15, 25, 1.2, C["BRASS_5"], C["GOLD"])
        draw_thick_segment(body, 15, 22, 19, 22, 1.1, C["GOLD"], C["PORC_5"])

    outlined_fg = add_1px_outline(body, C["OUTLINE"])
    mask = outlined_fg[:, :, 3] > 0
    tile[mask] = outlined_fg[mask]
    return add_1px_outline(tile, C["OUTLINE"])


def generate_touch_hud_sheet_raw(out_png: Path) -> None:
    sheet = np.zeros((96, 256, 4), dtype=np.uint8)

    # Row 0 (y=0..31): 8 x 32x32 icons
    for slot in range(8):
        sheet[0:32, slot * 32 : (slot + 1) * 32] = render_touch_icon(slot)

    # Row 1..2 Left (x=0..63, y=32..95): 64x64 Astrolabe Joystick Outer Ring
    ring = np.zeros((64, 64, 4), dtype=np.uint8)
    for y in range(64):
        for x in range(64):
            dx = x - 31.5
            dy = y - 31.5
            r = math.hypot(dx, dy)
            if 24.5 <= r <= 29.5:
                if r >= 28.5 or r <= 25.3:
                    ring[y, x] = C["OUTLINE"]
                elif (int(round(math.degrees(math.atan2(dy, dx)))) % 45) in (-2, -1, 0, 1, 2):
                    ring[y, x] = C["GOLD"]
                else:
                    ring[y, x] = C["BRASS_4"] if dy < 0 else C["BRASS_2"]
            elif r < 24.5 and (abs(r - 14.0) < 0.8) and ((x + y) % 3 == 0):
                ring[y, x] = C["SLATE_4"]
            elif r < 24.5:
                ring[y, x] = C["SLATE_0"] if (x + y) % 2 == 0 else C["SLATE_1"]
    # Cardinal brass pointers
    for px, py in [(31, 1), (32, 1), (31, 62), (32, 62), (1, 31), (1, 32), (62, 31), (62, 32)]:
        put_px(ring, px, py, C["GOLD"])
    sheet[32:96, 0:64] = ring

    # Row 1..2 Next (x=64..127, y=32..95): 64x64 Glowing Philosopher's Mercury Core Knob
    knob = np.zeros((64, 64, 4), dtype=np.uint8)
    for y in range(64):
        for x in range(64):
            dx = x - 31.5
            dy = y - 31.5
            r = math.hypot(dx, dy)
            if r <= 13.5:
                if r >= 12.2:
                    knob[y, x] = C["OUTLINE"]
                elif r >= 9.8:
                    knob[y, x] = C["BRASS_5"] if (dx + dy) < 0 else C["BRASS_3"]
                elif math.hypot(dx + 3.0, dy + 3.0) <= 3.8:
                    knob[y, x] = C["PORC_5"]
                elif r <= 7.2:
                    knob[y, x] = C["CYAN"]
                else:
                    knob[y, x] = C["PORC_2"]
    sheet[32:96, 64:128] = knob

    out_png.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, mode="RGBA").save(out_png)


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    raw_fx = root / ".tmp/raw_assets/locomotion_fx"
    raw_hud = root / ".tmp/raw_assets/touch_hud/touch_hud_sheet.png"
    generate_locomotion_fx_raw(raw_fx)
    generate_touch_hud_sheet_raw(raw_hud)
    print(f"✅ Synthesized raw M3 locomotion FX ({raw_fx}) & touch HUD sheet ({raw_hud})")


if __name__ == "__main__":
    main()
