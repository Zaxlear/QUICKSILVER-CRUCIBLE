#!/usr/bin/env python3
"""
Milestone 7 Asset Factory — Biomes 02, 03, 04 Normal-Mapped Tilesets, 5-Layer Parallax Plates
& 42 Handcrafted RoomChunk Templates (bringing total library to 55 chunks across all 4 biomes).

All raster outputs pass strictly through:
  quantize_palette.py (48-color Dark Alchemy lock + binary alpha {0, 255})
  -> normal_map_sobel.py (tangent-space OpenGL *_n.png normal maps)
"""
import json
import math
import os
import subprocess
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError:
    for _cand in ("/opt/homebrew/bin/python3.14", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"):
        if os.path.exists(_cand) and os.path.realpath(_cand) != os.path.realpath(sys.executable):
            os.execv(_cand, [_cand, *sys.argv])
    raise

from pathlib import Path
from generate_sprite import (
    BIT_E,
    BIT_N,
    BIT_NE,
    BIT_NW,
    BIT_S,
    BIT_SE,
    BIT_SW,
    BIT_W,
    C,
    canonical_47_masks,
    draw_thick_segment,
    put_px,
)

# Full 48-color dictionary extensions from src/data/palette.data.ts
ACID_0 = (11, 31, 29, 255)      # #0B1F1D
ACID_1 = (18, 51, 47, 255)      # #12332F
ACID_2 = (27, 77, 70, 255)      # #1B4D46
ACID_3 = (38, 107, 96, 255)     # #266B60
ACID_4 = (50, 143, 125, 255)    # #328F7D
ACID_5 = (34, 197, 94, 255)     # #22C55E
ACID_6 = (60, 230, 130, 255)    # #3CE682
ACID_7 = (163, 230, 53, 255)    # #A3E635
AETHER_0 = (59, 7, 100, 255)    # #3B0764
AETHER_1 = (109, 40, 217, 255)  # #6D28D9
AETHER_2 = (168, 85, 247, 255)  # #A855F7


def fill_box(arr: np.ndarray, x0: int, y0: int, w: int, h: int, col: tuple[int, int, int, int]) -> None:
    h_max, w_max, _ = arr.shape
    xa = max(0, x0)
    ya = max(0, y0)
    xb = min(w_max, x0 + w)
    yb = min(h_max, y0 + h)
    if xa < xb and ya < yb:
        arr[ya:yb, xa:xb] = col


def fill_disc(arr: np.ndarray, cx: float, cy: float, r: float, col: tuple[int, int, int, int]) -> None:
    ri = int(math.ceil(r))
    for dy in range(-ri, ri + 1):
        for dx in range(-ri, ri + 1):
            if dx * dx + dy * dy <= r * r:
                put_px(arr, int(round(cx + dx)), int(round(cy + dy)), col)


def fill_ring(arr: np.ndarray, cx: float, cy: float, r_in: float, r_out: float, col: tuple[int, int, int, int]) -> None:
    ri = int(math.ceil(r_out))
    r_in2 = r_in * r_in
    r_out2 = r_out * r_out
    for dy in range(-ri, ri + 1):
        for dx in range(-ri, ri + 1):
            d2 = dx * dx + dy * dy
            if r_in2 <= d2 <= r_out2:
                put_px(arr, int(round(cx + dx)), int(round(cy + dy)), col)


# ==============================================================================
# 1. Biomes 02, 03, 04 47+9 Autotile Sheets (128x112px = 8x7 of 16x16)
# ==============================================================================
BIOME_TILE_THEMES = {
    "biome_02_vitriol_sewers": {
        "key": "biome02_vitriol_tileset",
        "mortar": ACID_0,
        "brick_dark": ACID_1,
        "brick_mid": ACID_2,
        "brick_hi": ACID_3,
        "top_spec": ACID_6,
        "top_plate": ACID_4,
        "trim": C["BRASS_3"],
        "rivet": ACID_7,
        "accent_glow": ACID_6,
        "accent_hot": ACID_7,
    },
    "biome_03_clockwork_ossuary": {
        "key": "biome03_ossuary_tileset",
        "mortar": C["OUTLINE"],
        "brick_dark": C["SLATE_1"],
        "brick_mid": C["SLATE_3"],
        "brick_hi": C["BRASS_3"],
        "top_spec": C["GOLD"],
        "top_plate": C["BRASS_5"],
        "trim": C["BRASS_2"],
        "rivet": C["PORC_4"],
        "accent_glow": C["CYAN"],
        "accent_hot": C["GOLD"],
    },
    "biome_04_crucible_apex": {
        "key": "biome04_apex_tileset",
        "mortar": C["OUTLINE"],
        "brick_dark": AETHER_0,
        "brick_mid": C["SLATE_2"],
        "brick_hi": C["PORC_2"],
        "top_spec": C["PORC_5"],
        "top_plate": C["PORC_3"],
        "trim": C["BRASS_5"],
        "rivet": C["GOLD"],
        "accent_glow": C["CRIM_6"],
        "accent_hot": C["PORC_5"],
    },
}


def render_themed_autotile_cell(biome_id: str, mask: int, alt_inlay: bool = False) -> np.ndarray:
    th = BIOME_TILE_THEMES[biome_id]
    cell = np.zeros((16, 16, 4), dtype=np.uint8)
    has_n = (mask & BIT_N) != 0
    has_e = (mask & BIT_E) != 0
    has_s = (mask & BIT_S) != 0
    has_w = (mask & BIT_W) != 0

    for y in range(16):
        course = y // 4
        is_h_mortar = (y % 4) == 3
        stagger = 4 if (course % 2 == 1) else 0
        for x in range(16):
            is_v_mortar = ((x + stagger) % 8) == 7
            if is_h_mortar or is_v_mortar:
                cell[y, x] = th["mortar"]
            else:
                ly = y % 4
                lx = (x + stagger) % 8
                if ly == 0 and lx < 6:
                    cell[y, x] = th["brick_hi"]
                elif ly == 1:
                    cell[y, x] = th["brick_mid"] if (course + x // 8) % 2 == 0 else th["brick_dark"]
                else:
                    cell[y, x] = th["brick_dark"]

    if alt_inlay:
        if biome_id == "biome_02_vitriol_sewers":
            # Mossy acid seepage veins
            for gx, gy in [(3, 4), (4, 5), (5, 6), (10, 8), (11, 9), (11, 10)]:
                cell[gy, gx] = th["accent_glow"] if (gx + gy) % 2 == 0 else th["accent_hot"]
        elif biome_id == "biome_03_clockwork_ossuary":
            # Gilded skull & clockwork cog relief
            fill_disc(cell, 7.5, 7.5, 3.0, C["BRASS_5"])
            put_px(cell, 6, 7, C["OUTLINE"])
            put_px(cell, 9, 7, C["OUTLINE"])
            put_px(cell, 7, 5, C["GOLD"])
        else:
            # Astral crimson philosopher rune inlay
            for k in range(4, 12):
                cell[k, k] = C["GOLD"]
                cell[k, 15 - k] = C["CRIM_6"]
            put_px(cell, 7, 7, C["PORC_5"])

    if not has_n:
        for x in range(16):
            cell[0, x] = C["OUTLINE"]
            cell[1, x] = th["top_spec"] if (x % 4 != 3) else th["top_plate"]
            cell[2, x] = th["top_plate"]
            cell[3, x] = th["trim"]
            if x in (2, 6, 10, 14):
                cell[2, x] = th["rivet"]

    if not has_s:
        for x in range(16):
            cell[15, x] = C["OUTLINE"]
            cell[14, x] = th["mortar"]
            cell[13, x] = th["trim"]

    if not has_w:
        for y in range(16):
            cell[y, 0] = C["OUTLINE"]
            cell[y, 1] = th["top_plate"] if (0 < y < 15) else C["OUTLINE"]
            cell[y, 2] = th["brick_dark"]
            if y in (3, 8, 12) and (has_n or y > 3):
                cell[y, 1] = th["rivet"]

    if not has_e:
        for y in range(16):
            cell[y, 15] = C["OUTLINE"]
            cell[y, 14] = th["brick_hi"] if (0 < y < 15) else C["OUTLINE"]
            cell[y, 13] = th["brick_dark"]
            if y in (3, 8, 12) and (has_n or y > 3):
                cell[y, 14] = th["rivet"]

    if has_n and has_w and not (mask & BIT_NW):
        cell[0:3, 0:3] = th["trim"]
        cell[1, 1] = th["rivet"]
    if has_n and has_e and not (mask & BIT_NE):
        cell[0:3, 13:16] = th["trim"]
        cell[1, 14] = th["rivet"]
    if has_s and has_w and not (mask & BIT_SW):
        cell[13:16, 0:3] = th["trim"]
        cell[14, 1] = th["rivet"]
    if has_s and has_e and not (mask & BIT_SE):
        cell[13:16, 13:16] = th["trim"]
        cell[14, 14] = th["rivet"]

    return cell


def render_themed_special_tile(biome_id: str, slot_idx: int) -> np.ndarray:
    th = BIOME_TILE_THEMES[biome_id]
    if slot_idx == 47:
        return render_themed_autotile_cell(biome_id, 0xFF, alt_inlay=True)

    cell = np.zeros((16, 16, 4), dtype=np.uint8)
    if slot_idx == 48:
        # Glowing grate deck (Acid grate / Voltaic gear grate / Mercury conduit grate)
        for y in range(16):
            for x in range(16):
                if y in (0, 15):
                    cell[y, x] = C["OUTLINE"]
                elif y in (1, 2):
                    cell[y, x] = th["top_spec"] if x % 4 == 1 else th["top_plate"]
                elif x % 4 in (0, 3):
                    cell[y, x] = th["brick_mid"] if x % 4 == 0 else C["OUTLINE"]
                else:
                    cell[y, x] = th["accent_hot"] if (y + x) % 5 == 0 else th["accent_glow"]
        return cell

    if slot_idx in (49, 50, 51):
        x_min = 1 if slot_idx == 49 else 0
        x_max = 15 if slot_idx == 51 else 16
        for x in range(x_min, x_max):
            cell[0, x] = C["OUTLINE"]
            cell[1, x] = th["top_spec"] if x % 3 != 0 else th["rivet"]
            cell[2, x] = th["top_plate"]
            cell[3, x] = th["brick_mid"] if x % 2 == 0 else C["OUTLINE"]
            cell[4, x] = th["trim"]
            cell[5, x] = C["OUTLINE"]
        if slot_idx == 49:
            cell[0:6, 0] = C["OUTLINE"]
        if slot_idx == 51:
            cell[0:6, 15] = C["OUTLINE"]
        return cell

    if slot_idx in (52, 53):
        base = render_themed_autotile_cell(biome_id, BIT_N | BIT_S | (BIT_E if slot_idx == 52 else BIT_W))
        edge_x = 1 if slot_idx == 52 else 14
        for y in range(1, 15, 3):
            base[y, edge_x] = C["CYAN"]
            base[y + 1, edge_x] = C["GOLD"]
        return base

    # 54, 55: Breakable calcined rune floor (crimson-gold glowing fracture veins)
    base = render_themed_autotile_cell(biome_id, BIT_E | BIT_W)
    for k in range(2, 14):
        cy = 3 + ((k * 3) % 9)
        base[cy, k] = C["EMBER_4"]
        base[min(14, cy + 1), k] = C["GOLD"]
    return base


def build_themed_tileset(biome_id: str, raw_png: Path, meta_json: Path) -> None:
    cols, rows = 8, 7
    sheet = np.zeros((rows * 16, cols * 16, 4), dtype=np.uint8)
    masks = canonical_47_masks()
    key = BIOME_TILE_THEMES[biome_id]["key"]
    entries = []

    for idx, mask in enumerate(masks):
        r, c = divmod(idx, cols)
        sheet[r * 16 : (r + 1) * 16, c * 16 : (c + 1) * 16] = render_themed_autotile_cell(biome_id, mask)
        entries.append({"index": idx, "kind": "autotile47", "bitmask": mask, "x": c * 16, "y": r * 16})

    special_names = {
        47: "solid_alt_masonry",
        48: "furnace_molten_grate",
        49: "oneway_grate_left",
        50: "oneway_grate_mid",
        51: "oneway_grate_right",
        52: "climb_wall_left",
        53: "climb_wall_right",
        54: "breakable_slag_left",
        55: "breakable_slag_right",
    }
    for idx in range(47, 56):
        r, c = divmod(idx, cols)
        sheet[r * 16 : (r + 1) * 16, c * 16 : (c + 1) * 16] = render_themed_special_tile(biome_id, idx)
        entries.append({"index": idx, "kind": special_names[idx], "x": c * 16, "y": r * 16})

    raw_png.parent.mkdir(parents=True, exist_ok=True)
    meta_json.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, mode="RGBA").save(raw_png)
    meta_json.write_text(
        json.dumps(
            {
                "biomeId": biome_id,
                "tileSize": 16,
                "columns": cols,
                "rows": rows,
                "image": f"{key}.png",
                "normalMap": f"{key}_n.png",
                "tiles": entries,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


# ==============================================================================
# 2. Biomes 02, 03, 04 5-Layer Seamless Pixel-Art Parallax Plates (640x360)
# ==============================================================================
def synth_biome02_parallax(layer_idx: int) -> np.ndarray:
    """Biome 02 — The Vitriol Aqueducts (Verdigris arches, acid waterfalls, waterwheels, glowing fungi)."""
    arr = np.zeros((360, 640, 4), dtype=np.uint8)
    if layer_idx == 0:
        # L0 (100% opaque): Abyssal subterranean reservoir vault & toxic chartreuse mist bands
        for y in range(360):
            col = ACID_0 if y < 130 else (ACID_1 if y < 250 else ACID_2)
            arr[y, :] = col
            if y in (128, 132, 248, 252):
                for x in range(0, 640, 2):
                    arr[y, x] = ACID_2 if y < 200 else ACID_3
        # Distant vaulted ribs & eerie acid mist horizon
        for arch_x in range(40, 640, 160):
            fill_ring(arr, arch_x, 190, 58, 66, ACID_1)
            fill_box(arr, arch_x - 8, 190, 16, 170, ACID_1)
        for y in range(275, 315):
            for x in range(640):
                if (x + y * 3) % 7 == 0:
                    arr[y, x] = ACID_4 if y > 292 else ACID_3
        return arr

    if layer_idx == 1:
        # L1: Porous stone sluice dam + hanging green vitriol stalactites + distant acid waterfalls
        fill_box(arr, 0, 210, 640, 150, ACID_1)
        for x in range(0, 640, 32):
            h_stal = 38 + ((x * 13) % 48)
            for y in range(0, h_stal):
                w = max(1, (h_stal - y) // 5)
                fill_box(arr, x + 12 - w, y, w * 2, 1, ACID_2 if y % 3 else ACID_3)
        for wf_x in (96, 288, 496):
            fill_disc(arr, wf_x, 210, 16, C["OUTLINE"])
            fill_box(arr, wf_x - 10, 210, 20, 150, ACID_5)
            for y in range(210, 360, 4):
                fill_box(arr, wf_x - 6 + ((y // 4) % 3), y, 5, 2, ACID_6)
                put_px(arr, wf_x + ((y // 3) % 5) - 2, y + 1, ACID_7)
        return arr

    if layer_idx == 2:
        # L2: Giant verdigris waterwheels & Gothic sewer culvert arches
        for wx in (140, 460):
            fill_ring(arr, wx, 215, 58, 70, C["BRASS_2"])
            fill_ring(arr, wx, 215, 62, 66, ACID_3)
            fill_disc(arr, wx, 215, 14, C["BRASS_4"])
            for deg in range(0, 360, 30):
                rad = math.radians(deg)
                draw_thick_segment(arr, wx, 215, wx + 66 * math.cos(rad), 215 + 66 * math.sin(rad), 2.0, C["BRASS_3"], ACID_4)
        fill_box(arr, 0, 304, 640, 56, ACID_1)
        fill_box(arr, 0, 304, 640, 5, C["BRASS_3"])
        fill_box(arr, 0, 336, 640, 24, ACID_5)
        for x in range(0, 640, 16):
            fill_box(arr, x, 336, 8, 3, ACID_6)
        return arr

    if layer_idx == 3:
        # L3: Near-plane ruptured brass elbow pipes + glowing bioluminescent alchemy fungi clusters
        fill_box(arr, 0, 10, 640, 18, C["BRASS_1"])
        fill_box(arr, 0, 12, 640, 5, ACID_3)
        fill_box(arr, 0, 17, 640, 3, C["BRASS_4"])
        for rx in range(0, 640, 40):
            fill_box(arr, rx, 8, 6, 22, C["BRASS_3"])
            put_px(arr, rx + 2, 11, C["GOLD"])
        for px_col in (68, 568):
            fill_box(arr, px_col - 9, 28, 18, 290, ACID_1)
            fill_box(arr, px_col - 6, 28, 5, 290, C["BRASS_3"])
            # Bioluminescent fungi caps on pipe joints
            for fy in (96, 188, 264):
                fill_disc(arr, px_col + 10, fy, 8, ACID_5)
                fill_disc(arr, px_col + 10, fy - 2, 5, ACID_6)
                put_px(arr, px_col + 9, fy - 3, ACID_7)
        return arr

    # L4: Foreground corroded arch silhouette dripping acid beads at top/bottom corners
    fill_box(arr, 0, 0, 640, 14, C["OUTLINE"])
    fill_box(arr, 0, 346, 640, 14, C["OUTLINE"])
    for x in range(0, 640, 80):
        fill_box(arr, x, 14, 18, 12, ACID_0)
        fill_disc(arr, x + 9, 30 + (x % 7), 2.5, ACID_6)
    for side_x in (0, 616):
        fill_box(arr, side_x, 14, 24, 332, C["OUTLINE"])
    return arr


def synth_biome03_parallax(layer_idx: int) -> np.ndarray:
    """Biome 03 — The Clockwork Ossuary (Stormy indigo lightning sky, rose window, colossal brass gears, gilded skulls)."""
    arr = np.zeros((360, 640, 4), dtype=np.uint8)
    if layer_idx == 0:
        # L0: Midnight indigo storm clouds & distant cyan lightning bolts
        for y in range(360):
            arr[y, :] = C["OUTLINE"] if y < 80 else (C["SLATE_0"] if y < 190 else (C["SLATE_1"] if y < 280 else C["SLATE_2"]))
        for cx in range(40, 640, 110):
            fill_disc(arr, cx, 130 + (cx % 30), 42, C["SLATE_2"])
            fill_disc(arr, cx + 22, 138 + (cx % 20), 32, C["SLATE_3"])
        # Distant lightning forks
        for lx in (180, 490):
            prev_x = lx
            for y in range(18, 158, 14):
                nx = prev_x + (((y // 14 + lx) % 3) - 1) * 9
                draw_thick_segment(arr, prev_x, y, nx, y + 14, 1.4, C["CYAN"], C["PORC_5"])
                prev_x = nx
        return arr

    if layer_idx == 1:
        # L1: Gothic cathedral stained-glass rose windows & flying buttresses
        fill_box(arr, 0, 235, 640, 125, C["SLATE_1"])
        for rx in (160, 480):
            fill_box(arr, rx - 56, 70, 112, 175, C["SLATE_2"])
            fill_ring(arr, rx, 136, 10, 44, C["BRASS_3"])
            fill_disc(arr, rx, 136, 36, AETHER_0)
            for deg in range(0, 360, 30):
                rad = math.radians(deg)
                col = C["CRIM_5"] if (deg // 30) % 2 == 0 else C["CYAN"]
                fill_disc(arr, rx + 22 * math.cos(rad), 136 + 22 * math.sin(rad), 5, col)
                draw_thick_segment(arr, rx, 136, rx + 40 * math.cos(rad), 136 + 40 * math.sin(rad), 1.2, C["GOLD"])
            fill_disc(arr, rx, 136, 8, C["GOLD"])
        return arr

    if layer_idx == 2:
        # L2: House-sized interlocking brass escapement gears
        gears = [(110, 195, 72, C["BRASS_3"], C["BRASS_5"]), (270, 240, 56, C["BRASS_2"], C["BRASS_4"]), (470, 185, 82, C["BRASS_3"], C["GOLD"])]
        for gx, gy, gr, c_body, c_hi in gears:
            fill_ring(arr, gx, gy, gr * 0.62, gr, c_body)
            fill_ring(arr, gx, gy, gr * 0.72, gr * 0.86, c_hi)
            fill_disc(arr, gx, gy, gr * 0.24, C["BRASS_4"])
            fill_disc(arr, gx, gy, gr * 0.10, C["GOLD"])
            for deg in range(0, 360, 20):
                rad = math.radians(deg)
                tx = gx + (gr + 6) * math.cos(rad)
                ty = gy + (gr + 6) * math.sin(rad)
                fill_disc(arr, tx, ty, 4.5, c_hi)
                if deg % 60 == 0:
                    draw_thick_segment(arr, gx, gy, gx + gr * 0.7 * math.cos(rad), gy + gr * 0.7 * math.sin(rad), 3.0, c_body, c_hi)
        return arr

    if layer_idx == 3:
        # L3: Gilded skull alcove colonnade & suspended heavy pendulum chains
        fill_box(arr, 0, 8, 640, 16, C["BRASS_2"])
        fill_box(arr, 0, 20, 640, 3, C["GOLD"])
        for col_x in (62, 578):
            fill_box(arr, col_x - 14, 24, 28, 300, C["SLATE_2"])
            fill_box(arr, col_x - 10, 24, 20, 300, C["BRASS_1"])
            for sy in range(48, 290, 36):
                fill_disc(arr, col_x, sy, 6.0, C["GOLD"])
                put_px(arr, col_x - 2, sy, C["OUTLINE"])
                put_px(arr, col_x + 2, sy, C["OUTLINE"])
        for ch_x in (148, 492):
            for cy in range(24, 180, 6):
                fill_box(arr, ch_x - 2, cy, 4, 4, C["BRASS_5"] if (cy // 6) % 2 == 0 else C["SLATE_5"])
        return arr

    # L4: Foreground blurred pendulum cables & cathedral arch frame
    fill_box(arr, 0, 0, 640, 12, C["OUTLINE"])
    fill_box(arr, 0, 348, 640, 12, C["OUTLINE"])
    for cx in (32, 608):
        draw_thick_segment(arr, cx, 12, cx + (14 if cx < 300 else -14), 348, 3.0, C["OUTLINE"], C["BRASS_1"])
    return arr


def synth_biome04_parallax(layer_idx: int) -> np.ndarray:
    """Biome 04 — The Astral Athanor (Crimson solar eclipse cosmos, dark-gold clouds, golden astrolabe rings & upward mercury falls)."""
    arr = np.zeros((360, 640, 4), dtype=np.uint8)
    if layer_idx == 0:
        # L0: Deep violet-black cosmos & colossal crimson solar prominence alchemy array
        for y in range(360):
            arr[y, :] = C["OUTLINE"] if y < 95 else (AETHER_0 if y < 235 else C["CRIM_0"])
        for star_i in range(90):
            sx = (star_i * 73 + 19) % 640
            sy = (star_i * 41 + 11) % 240
            arr[sy, sx] = C["PORC_4"] if star_i % 3 == 0 else C["GOLD"]
        # Giant crimson eclipse & golden alchemy ring at sky center
        fill_ring(arr, 320, 142, 68, 86, C["CRIM_5"])
        fill_ring(arr, 320, 142, 64, 70, C["EMBER_4"])
        fill_ring(arr, 320, 142, 61, 64, C["GOLD"])
        fill_disc(arr, 320, 142, 60, C["OUTLINE"])
        return arr

    if layer_idx == 1:
        # L1: Churning dark-gold cloud sea & inverted shattering spire fragments
        for y in range(250, 360):
            arr[y, :] = C["BRASS_0"] if y > 305 else C["CRIM_1"]
        for cx in range(20, 640, 72):
            fill_disc(arr, cx, 255 + (cx % 18), 34, C["BRASS_1"])
            fill_disc(arr, cx + 14, 246 + (cx % 14), 22, C["BRASS_3"])
            fill_disc(arr, cx + 18, 240 + (cx % 14), 10, C["GOLD"])
        for shard_x in (92, 224, 428, 556):
            top_y = 65 + (shard_x % 40)
            for dy in range(44):
                w = max(1, (44 - dy) // 4)
                fill_box(arr, shard_x - w, top_y + dy, w * 2, 1, C["SLATE_3"] if dy % 4 else C["GOLD"])
        return arr

    if layer_idx == 2:
        # L2: Concentric golden armillary astrolabe rings & upward-flowing liquid silver mercury waterfalls
        for ring_r, col in [(116, C["BRASS_4"]), (94, C["GOLD"]), (72, C["PORC_2"])]:
            fill_ring(arr, 320, 165, ring_r - 3, ring_r, col)
        for mf_x in (116, 524):
            fill_box(arr, mf_x - 9, 30, 18, 330, C["PORC_2"])
            fill_box(arr, mf_x - 5, 30, 10, 330, C["PORC_4"])
            for y in range(32, 356, 8):
                fill_box(arr, mf_x - 2, y, 4, 4, C["PORC_5"])
                put_px(arr, mf_x - 11, y + 2, C["CYAN"])
        return arr

    if layer_idx == 3:
        # L3: White porcelain bas-relief broken columns & crimson velvet throne drapes
        fill_box(arr, 0, 8, 640, 14, C["PORC_2"])
        fill_box(arr, 0, 18, 640, 4, C["GOLD"])
        for dr_x in range(40, 600, 140):
            for dy in range(28):
                w = max(2, 22 - dy // 2)
                fill_box(arr, dr_x - w, 22 + dy, w * 2, 1, C["CRIM_4"] if dy < 22 else C["GOLD"])
        for col_x in (58, 582):
            fill_box(arr, col_x - 12, 54, 24, 240, C["PORC_1"])
            fill_box(arr, col_x - 7, 54, 9, 240, C["PORC_4"])
            fill_box(arr, col_x - 15, 50, 30, 8, C["GOLD"])
        return arr

    # L4: Foreground obsidian trim & antigravity rising mercury beads
    fill_box(arr, 0, 0, 640, 10, C["OUTLINE"])
    fill_box(arr, 0, 350, 640, 10, C["OUTLINE"])
    for k in range(24):
        bx = (k * 27 + 14) % 640
        by = 300 - (k * 11) % 240
        if bx < 72 or bx > 568:
            fill_disc(arr, bx, by, 2.2, C["PORC_5"] if k % 2 == 0 else C["CYAN"])
    return arr


# ==============================================================================
# 3. Handcrafted RoomChunk Templates for Biomes 02, 03, 04 (14 chunks each = 42 new)
# ==============================================================================
def make_stair_platforms(center_x: int, width: int = 8) -> list[dict]:
    """Builds a kinematically verified 64px-step one-way staircase from floor (y=26) up to north socket (y=4)."""
    return [
        {"tileX": center_x - width // 2, "tileY": 22, "widthTiles": width + 2},
        {"tileX": center_x - width // 2, "tileY": 18, "widthTiles": width + 2},
        {"tileX": center_x - width // 2, "tileY": 14, "widthTiles": width},
        {"tileX": center_x - width // 2, "tileY": 10, "widthTiles": width},
        {"tileX": center_x - width // 2 + 1, "tileY": 6, "widthTiles": max(6, width - 2)},
    ]


def make_room_shell(w: int, h: int, has_west: bool = True, has_east: bool = True, has_north_at: int | None = None, has_south_at: int | None = None) -> list[dict]:
    """Builds solid ceiling, floor, and side walls leaving clean 4-tile apertures for declared sockets."""
    rects: list[dict] = []
    # Top ceiling (tileY 0..2), leaving 4-tile opening if north socket exists
    if has_north_at is None:
        rects.append({"tileX": 0, "tileY": 0, "widthTiles": w, "heightTiles": 3})
    else:
        if has_north_at > 0:
            rects.append({"tileX": 0, "tileY": 0, "widthTiles": has_north_at, "heightTiles": 3})
        right_x = has_north_at + 4
        if right_x < w:
            rects.append({"tileX": right_x, "tileY": 0, "widthTiles": w - right_x, "heightTiles": 3})

    # Left wall (tileX 0..2): if WEST socket at tileY=h-5 (aperture y=h-8..h-5), stop wall at h-8
    left_h = (h - 8) - 3 if has_west else (h - 4) - 3
    rects.append({"tileX": 0, "tileY": 3, "widthTiles": 3, "heightTiles": left_h})

    # Right wall (tileX w-3..w-1)
    right_h = (h - 8) - 3 if has_east else (h - 4) - 3
    rects.append({"tileX": w - 3, "tileY": 3, "widthTiles": 3, "heightTiles": right_h})

    # Floor (tileY h-4..h-1), leaving 4-tile shaft + one-way grate if south socket exists
    fy = h - 4
    if has_south_at is None:
        rects.append({"tileX": 0, "tileY": fy, "widthTiles": w, "heightTiles": 4})
    else:
        rects.append({"tileX": 0, "tileY": fy, "widthTiles": has_south_at, "heightTiles": 4})
        rx = has_south_at + 4
        rects.append({"tileX": rx, "tileY": fy, "widthTiles": w - rx, "heightTiles": 4})

    return rects


def generate_biome_chunk_set(
    biome_id: str,
    prefix: str,
    secret_rune: str,
    secret_dir: str,
    primary_trap: str,
    secondary_trap: str,
    main_light: str,
    accent_light: str,
    lore_tag: str,
) -> list[dict]:
    chunks: list[dict] = []

    # 1. ENTRANCE (42x30)
    chunks.append({
        "chunkId": f"{prefix}_entrance_01",
        "biomePool": [biome_id],
        "role": "ENTRANCE",
        "widthTiles": 42,
        "heightTiles": 30,
        "solidRects": make_room_shell(42, 30, has_west=False, has_east=True),
        "oneWayPlatforms": [{"tileX": 12, "tileY": 22, "widthTiles": 8}, {"tileX": 24, "tileY": 19, "widthTiles": 8}],
        "climbableWalls": [{"tileX": 3, "topTileY": 8, "heightTiles": 16, "normalSide": "RIGHT"}],
        "breakableSlagFloors": [],
        "doorSockets": [
            {"socketId": "e_main", "direction": "EAST", "tileX": 41, "tileY": 25, "apertureTiles": 4, "requiredRune": None}
        ],
        "enemySpawns": [],
        "trapSlots": [],
        "teleporterTilePos": {"tileX": 9, "tileY": 25},
        "rewardPedestalTilePos": {"tileX": 6, "tileY": 25},
        "loreAnchor": None,
        "lightAnchors": [
            {"tileX": 8, "tileY": 22, "preset": "MERCURY_SILVER", "radiusPx": 190, "flickerAmplitude": 0.06},
            {"tileX": 22, "tileY": 22, "preset": main_light, "radiusPx": 185, "flickerAmplitude": 0.1},
            {"tileX": 35, "tileY": 22, "preset": accent_light, "radiusPx": 175, "flickerAmplitude": 0.09},
        ],
    })

    # 2. 6 Handcrafted COMBAT chunks (46..52 x 30, varied multi-tier combat arenas)
    combat_specs = [
        ("01_sluice", 48, True, False, True),
        ("02_gallery", 50, False, True, False),
        ("03_cistern", 46, True, True, False),
        ("04_nave", 52, False, True, True),
        ("05_conduit", 48, True, False, False),
        ("06_crucible", 50, True, True, True),
    ]
    for idx, (suffix, w, open_n, open_s, with_rune_gate) in enumerate(combat_specs):
        mid = w // 2
        n_x = mid - 2 if (open_n or (with_rune_gate and secret_dir == "NORTH")) else None
        s_x = mid - 2 if (open_s or (with_rune_gate and secret_dir == "SOUTH")) else None
        is_ram_secret = with_rune_gate and secret_rune == "rune_calcined_ram" and secret_dir == "SOUTH"

        solids = make_room_shell(w, 30, has_west=True, has_east=True, has_north_at=n_x, has_south_at=s_x)
        solids.append({"tileX": mid - 7, "tileY": 16, "widthTiles": 14, "heightTiles": 2})

        ow = make_stair_platforms(mid, 8) + [
            {"tileX": 7, "tileY": 21, "widthTiles": 8},
            {"tileX": w - 15, "tileY": 21, "widthTiles": 8},
        ]
        if s_x is not None and not is_ram_secret:
            ow.append({"tileX": s_x, "tileY": 26, "widthTiles": 4})

        breakables = [{"tileX": s_x, "tileY": 26, "widthTiles": 4}] if (s_x is not None and is_ram_secret) else []

        sockets = [
            {"socketId": "w_main", "direction": "WEST", "tileX": 0, "tileY": 25, "apertureTiles": 4, "requiredRune": None},
            {"socketId": "e_main", "direction": "EAST", "tileX": w - 1, "tileY": 25, "apertureTiles": 4, "requiredRune": None},
        ]
        if n_x is not None:
            sockets.append({
                "socketId": "n_sock",
                "direction": "NORTH",
                "tileX": n_x,
                "tileY": 0,
                "apertureTiles": 4,
                "requiredRune": secret_rune if (with_rune_gate and secret_dir == "NORTH") else None,
            })
        if s_x is not None:
            sockets.append({
                "socketId": "s_sock",
                "direction": "SOUTH",
                "tileX": s_x,
                "tileY": 29,
                "apertureTiles": 4,
                "requiredRune": secret_rune if (with_rune_gate and secret_dir == "SOUTH") else None,
            })

        climbs = [{"tileX": 3, "topTileY": 5, "heightTiles": 18, "normalSide": "RIGHT"}]
        if secret_rune == "rune_magnetic_claws" and with_rune_gate and n_x is not None:
            climbs.append({"tileX": w - 4, "topTileY": 4, "heightTiles": 19, "normalSide": "LEFT"})

        conduits = (
            [{"pairId": f"{prefix}_cnd_{idx}", "entryTileX": 6, "entryTileY": 25, "exitTileX": w - 8, "exitTileY": 20}]
            if idx == 4
            else []
        )

        chunks.append({
            "chunkId": f"{prefix}_combat_{suffix}",
            "biomePool": [biome_id],
            "role": "COMBAT",
            "widthTiles": w,
            "heightTiles": 30,
            "solidRects": solids,
            "oneWayPlatforms": ow,
            "climbableWalls": climbs,
            "breakableSlagFloors": breakables,
            "doorSockets": sockets,
            "enemySpawns": [
                {"slotId": "sp_01", "tileX": 11, "tileY": 25, "allowedArchetypes": ["MELEE_FODDER", "SHIELD_TANK"], "minCrucibleHeat": 0, "patrolSpanTiles": [5, 18]},
                {"slotId": "sp_02", "tileX": w - 12, "tileY": 25, "allowedArchetypes": ["FLANKER", "MELEE_FODDER"], "minCrucibleHeat": 0, "patrolSpanTiles": [w - 19, w - 5]},
                {"slotId": "sp_03", "tileX": mid, "tileY": 15, "allowedArchetypes": ["SUPPORT_CASTER", "RANGED_HARASS"], "minCrucibleHeat": 0, "patrolSpanTiles": [mid - 6, mid + 6]},
                {"slotId": "sp_04", "tileX": w - 11, "tileY": 20, "allowedArchetypes": ["RANGED_HARASS"], "minCrucibleHeat": 0, "patrolSpanTiles": [w - 15, w - 8]},
            ],
            "trapSlots": [
                {
                    "slotId": f"tr_{idx}_a",
                    "trapType": primary_trap if idx % 2 == 0 else secondary_trap,
                    "tileX": 16,
                    "tileY": 25,
                    "widthTiles": 4 if primary_trap == "ACID_GEYSER" else 2,
                    "phaseOffsetMs": (idx * 450) % 2400,
                    "cyclePeriodMs": 3200 if primary_trap == "ACID_GEYSER" else 2800,
                }
            ],
            "teleporterTilePos": {"tileX": 6, "tileY": 25} if idx % 2 == 0 else None,
            "rewardPedestalTilePos": None,
            "loreAnchor": None,
            "lightAnchors": [
                {"tileX": 9, "tileY": 23, "preset": main_light, "radiusPx": 185, "flickerAmplitude": 0.1},
                {"tileX": mid, "tileY": 14, "preset": accent_light, "radiusPx": 195, "flickerAmplitude": 0.08},
                {"tileX": w - 9, "tileY": 23, "preset": main_light, "radiusPx": 185, "flickerAmplitude": 0.1},
            ],
            **({"conduitPairs": conduits} if conduits else {}),
        })

    # 3. TELEPORTER_HUB (44x32)
    chunks.append({
        "chunkId": f"{prefix}_hub_crossroad_01",
        "biomePool": [biome_id],
        "role": "TELEPORTER_HUB",
        "widthTiles": 44,
        "heightTiles": 32,
        "solidRects": make_room_shell(44, 32, has_west=True, has_east=True, has_north_at=20, has_south_at=20),
        "oneWayPlatforms": [
            {"tileX": 20, "tileY": 28, "widthTiles": 4},
            {"tileX": 14, "tileY": 24, "widthTiles": 16},
            {"tileX": 16, "tileY": 20, "widthTiles": 12},
            {"tileX": 17, "tileY": 16, "widthTiles": 10},
            {"tileX": 18, "tileY": 12, "widthTiles": 8},
            {"tileX": 18, "tileY": 8, "widthTiles": 8},
            {"tileX": 19, "tileY": 4, "widthTiles": 6},
        ],
        "climbableWalls": [],
        "breakableSlagFloors": [],
        "doorSockets": [
            {"socketId": "w_main", "direction": "WEST", "tileX": 0, "tileY": 27, "apertureTiles": 4, "requiredRune": None},
            {"socketId": "e_main", "direction": "EAST", "tileX": 43, "tileY": 27, "apertureTiles": 4, "requiredRune": None},
            {"socketId": "n_branch", "direction": "NORTH", "tileX": 20, "tileY": 0, "apertureTiles": 4, "requiredRune": None},
            {"socketId": "s_branch", "direction": "SOUTH", "tileX": 20, "tileY": 31, "apertureTiles": 4, "requiredRune": None},
        ],
        "enemySpawns": [],
        "trapSlots": [],
        "teleporterTilePos": {"tileX": 12, "tileY": 27},
        "rewardPedestalTilePos": None,
        "loreAnchor": None,
        "lightAnchors": [
            {"tileX": 12, "tileY": 24, "preset": "VOLTAIC_CYAN", "radiusPx": 210, "flickerAmplitude": 0.06},
            {"tileX": 22, "tileY": 18, "preset": main_light, "radiusPx": 195, "flickerAmplitude": 0.07},
            {"tileX": 33, "tileY": 24, "preset": accent_light, "radiusPx": 175, "flickerAmplitude": 0.09},
        ],
    })

    # 4. ELITE (52x30)
    chunks.append({
        "chunkId": f"{prefix}_elite_altar_01",
        "biomePool": [biome_id],
        "role": "ELITE",
        "widthTiles": 52,
        "heightTiles": 30,
        "solidRects": make_room_shell(52, 30, has_west=True, has_east=True, has_north_at=24, has_south_at=24) + [
            {"tileX": 21, "tileY": 24, "widthTiles": 10, "heightTiles": 2}
        ],
        "oneWayPlatforms": make_stair_platforms(26, 8) + [
            {"tileX": 24, "tileY": 26, "widthTiles": 4},
            {"tileX": 9, "tileY": 21, "widthTiles": 8},
            {"tileX": 35, "tileY": 21, "widthTiles": 8},
        ],
        "climbableWalls": [],
        "breakableSlagFloors": [],
        "doorSockets": [
            {"socketId": "w_main", "direction": "WEST", "tileX": 0, "tileY": 25, "apertureTiles": 4, "requiredRune": None},
            {"socketId": "e_main", "direction": "EAST", "tileX": 51, "tileY": 25, "apertureTiles": 4, "requiredRune": None},
            {"socketId": "n_branch", "direction": "NORTH", "tileX": 24, "tileY": 0, "apertureTiles": 4, "requiredRune": None},
            {"socketId": "s_branch", "direction": "SOUTH", "tileX": 24, "tileY": 29, "apertureTiles": 4, "requiredRune": None},
        ],
        "enemySpawns": [
            {"slotId": "sp_elite_01", "tileX": 26, "tileY": 23, "allowedArchetypes": ["ELITE_GUARD"], "minCrucibleHeat": 0, "patrolSpanTiles": [10, 42]},
            {"slotId": "sp_support_02", "tileX": 38, "tileY": 20, "allowedArchetypes": ["SUPPORT_CASTER"], "minCrucibleHeat": 0, "patrolSpanTiles": [35, 42]},
        ],
        "trapSlots": [
            {"slotId": "tr_elite_l", "trapType": primary_trap, "tileX": 14, "tileY": 25, "widthTiles": 2, "phaseOffsetMs": 0, "cyclePeriodMs": 2800},
            {"slotId": "tr_elite_r", "trapType": primary_trap, "tileX": 36, "tileY": 25, "widthTiles": 2, "phaseOffsetMs": 1400, "cyclePeriodMs": 2800},
        ],
        "teleporterTilePos": {"tileX": 7, "tileY": 25},
        "rewardPedestalTilePos": {"tileX": 26, "tileY": 23},
        "loreAnchor": None,
        "lightAnchors": [
            {"tileX": 7, "tileY": 23, "preset": "VOLTAIC_CYAN", "radiusPx": 185, "flickerAmplitude": 0.06},
            {"tileX": 26, "tileY": 20, "preset": main_light, "radiusPx": 230, "flickerAmplitude": 0.08},
            {"tileX": 40, "tileY": 23, "preset": accent_light, "radiusPx": 185, "flickerAmplitude": 0.11},
        ],
    })

    # 5. SHOP, 6. LORE, 7. CURSED_VAULT (40x30 branch rooms)
    branch_defs = [
        ("SHOP", f"{prefix}_shop_armory_01", {"tileX": 28, "tileY": 25}, None, []),
        ("LORE", f"{prefix}_lore_sanctum_01", None, {"tileX": 27, "tileY": 25, "lorePoolTag": lore_tag}, []),
        (
            "CURSED_VAULT",
            f"{prefix}_cursed_vault_01",
            {"tileX": 29, "tileY": 25},
            None,
            [{"slotId": "sp_vault_guard", "tileX": 22, "tileY": 25, "allowedArchetypes": ["SHIELD_TANK", "FLANKER"], "minCrucibleHeat": 0, "patrolSpanTiles": [12, 34]}],
        ),
    ]
    for role, cid, ped, lore_obj, spawns in branch_defs:
        chunks.append({
            "chunkId": cid,
            "biomePool": [biome_id],
            "role": role,
            "widthTiles": 40,
            "heightTiles": 30,
            "solidRects": make_room_shell(40, 30, has_west=True, has_east=True, has_north_at=18, has_south_at=18),
            "oneWayPlatforms": make_stair_platforms(20, 8) + [{"tileX": 18, "tileY": 26, "widthTiles": 4}],
            "climbableWalls": [],
            "breakableSlagFloors": [],
            "doorSockets": [
                {"socketId": "w_in", "direction": "WEST", "tileX": 0, "tileY": 25, "apertureTiles": 4, "requiredRune": None},
                {"socketId": "e_in", "direction": "EAST", "tileX": 39, "tileY": 25, "apertureTiles": 4, "requiredRune": None},
                {"socketId": "n_in", "direction": "NORTH", "tileX": 18, "tileY": 0, "apertureTiles": 4, "requiredRune": None},
                {"socketId": "s_in", "direction": "SOUTH", "tileX": 18, "tileY": 29, "apertureTiles": 4, "requiredRune": None},
            ],
            "enemySpawns": spawns,
            "trapSlots": [],
            "teleporterTilePos": {"tileX": 9, "tileY": 25},
            "rewardPedestalTilePos": ped,
            "loreAnchor": lore_obj,
            "lightAnchors": [
                {"tileX": 10, "tileY": 23, "preset": "VOLTAIC_CYAN", "radiusPx": 175, "flickerAmplitude": 0.06},
                {"tileX": 28, "tileY": 22, "preset": main_light, "radiusPx": 220, "flickerAmplitude": 0.08},
            ],
        })

    # 8. RUNE_SECRET (40x30)
    chunks.append({
        "chunkId": f"{prefix}_secret_vault_01",
        "biomePool": [biome_id],
        "role": "RUNE_SECRET",
        "widthTiles": 40,
        "heightTiles": 30,
        "solidRects": make_room_shell(40, 30, has_west=True, has_east=True, has_north_at=18, has_south_at=18) + [
            {"tileX": 25, "tileY": 24, "widthTiles": 8, "heightTiles": 2}
        ],
        "oneWayPlatforms": make_stair_platforms(20, 8) + [{"tileX": 18, "tileY": 26, "widthTiles": 4}],
        "climbableWalls": [{"tileX": 3, "topTileY": 6, "heightTiles": 18, "normalSide": "RIGHT"}],
        "breakableSlagFloors": [],
        "doorSockets": [
            {"socketId": "n_sec", "direction": "NORTH", "tileX": 18, "tileY": 0, "apertureTiles": 4, "requiredRune": secret_rune},
            {"socketId": "s_sec", "direction": "SOUTH", "tileX": 18, "tileY": 29, "apertureTiles": 4, "requiredRune": secret_rune},
            {"socketId": "w_sec", "direction": "WEST", "tileX": 0, "tileY": 25, "apertureTiles": 4, "requiredRune": secret_rune},
            {"socketId": "e_sec", "direction": "EAST", "tileX": 39, "tileY": 25, "apertureTiles": 4, "requiredRune": secret_rune},
        ],
        "enemySpawns": [],
        "trapSlots": [],
        "teleporterTilePos": {"tileX": 9, "tileY": 25},
        "rewardPedestalTilePos": {"tileX": 29, "tileY": 23},
        "loreAnchor": {"tileX": 15, "tileY": 25, "lorePoolTag": f"{lore_tag}_seal"},
        "lightAnchors": [
            {"tileX": 19, "tileY": 23, "preset": main_light, "radiusPx": 215, "flickerAmplitude": 0.07},
            {"tileX": 29, "tileY": 21, "preset": "MERCURY_SILVER", "radiusPx": 200, "flickerAmplitude": 0.05},
        ],
    })

    # 9. EXIT (42x30)
    chunks.append({
        "chunkId": f"{prefix}_exit_lift_01",
        "biomePool": [biome_id],
        "role": "EXIT",
        "widthTiles": 42,
        "heightTiles": 30,
        "solidRects": make_room_shell(42, 30, has_west=True, has_east=False, has_north_at=18, has_south_at=18),
        "oneWayPlatforms": make_stair_platforms(20, 8) + [{"tileX": 18, "tileY": 26, "widthTiles": 4}],
        "climbableWalls": [],
        "breakableSlagFloors": [],
        "doorSockets": [
            {"socketId": "w_main", "direction": "WEST", "tileX": 0, "tileY": 25, "apertureTiles": 4, "requiredRune": None},
            {"socketId": "n_in", "direction": "NORTH", "tileX": 18, "tileY": 0, "apertureTiles": 4, "requiredRune": None},
            {"socketId": "s_in", "direction": "SOUTH", "tileX": 18, "tileY": 29, "apertureTiles": 4, "requiredRune": None},
        ],
        "enemySpawns": [],
        "trapSlots": [],
        "teleporterTilePos": {"tileX": 9, "tileY": 25},
        "rewardPedestalTilePos": {"tileX": 31, "tileY": 25},
        "loreAnchor": None,
        "lightAnchors": [
            {"tileX": 9, "tileY": 23, "preset": "VOLTAIC_CYAN", "radiusPx": 185, "flickerAmplitude": 0.06},
            {"tileX": 31, "tileY": 22, "preset": "MERCURY_SILVER", "radiusPx": 235, "flickerAmplitude": 0.05},
            {"tileX": 20, "tileY": 23, "preset": main_light, "radiusPx": 175, "flickerAmplitude": 0.09},
        ],
    })

    return chunks


def quantize_and_normal_file(root: Path, py: str, raw_png: Path, out_png: Path, strength: float = 2.4) -> None:
    subprocess.run(
        [
            py,
            str(root / "tools/asset-factory/quantize_palette.py"),
            "--input",
            str(raw_png),
            "--output",
            str(out_png),
            "--no-chroma-key",
            "--dither",
            "0.0",
        ],
        check=True,
    )
    subprocess.run(
        [
            py,
            str(root / "tools/asset-factory/normal_map_sobel.py"),
            "--diffuse",
            str(out_png),
            "--strength",
            str(strength),
        ],
        check=True,
    )


def run_pipeline() -> None:
    root = Path(__file__).resolve().parents[2]
    py = sys.executable
    raw_dir = root / ".tmp/raw_assets/m7_biomes"
    raw_dir.mkdir(parents=True, exist_ok=True)
    tilemaps_dir = root / "public/assets/tilemaps"

    # 1. Build, quantize & normal-map Biomes 02, 03, 04 tilesets
    for biome_id, meta in BIOME_TILE_THEMES.items():
        key = meta["key"]
        raw_ts = raw_dir / f"{key}.png"
        out_ts = tilemaps_dir / f"{key}.png"
        out_json = tilemaps_dir / f"{key}.json"
        build_themed_tileset(biome_id, raw_ts, out_json)
        quantize_and_normal_file(root, py, raw_ts, out_ts, 2.5)

    # 2. Build, quantize & normal-map Biomes 02, 03, 04 5-layer parallax plates
    parallax_builders = [
        ("biome02_parallax_L", synth_biome02_parallax),
        ("biome03_parallax_L", synth_biome03_parallax),
        ("biome04_parallax_L", synth_biome04_parallax),
    ]
    for prefix, fn in parallax_builders:
        for layer_idx in range(5):
            raw_p = raw_dir / f"{prefix}{layer_idx}.png"
            out_p = tilemaps_dir / f"{prefix}{layer_idx}.png"
            Image.fromarray(fn(layer_idx), mode="RGBA").save(raw_p)
            quantize_and_normal_file(root, py, raw_p, out_p, 2.2)

    # 3. Write 42 new handcrafted RoomChunk JSON templates + update chunks/index.json
    chunks_dir = tilemaps_dir / "chunks"
    b2 = generate_biome_chunk_set(
        "biome_02_vitriol_sewers", "vitriol", "rune_vitriol_tendril", "NORTH",
        "ACID_GEYSER", "SPIKE_BED", "VITRIOL_VAT_GREEN", "TORCH_AMBER", "lore_03_sluice_petition"
    )
    b3 = generate_biome_chunk_set(
        "biome_03_clockwork_ossuary", "ossuary", "rune_calcined_ram", "SOUTH",
        "PENDULUM_BLADE", "SPIKE_BED", "VOLTAIC_CYAN", "TORCH_AMBER", "lore_06_clockwork_vow"
    )
    b4 = generate_biome_chunk_set(
        "biome_04_crucible_apex", "apex", "rune_magnetic_claws", "NORTH",
        "VOLTAIC_ARC_GATE", "FLAME_NOZZLE", "MERCURY_SILVER", "FURNACE_CRIMSON", "lore_09_noble_banquet"
    )

    new_chunks = [*b2, *b3, *b4]
    for tpl in new_chunks:
        (chunks_dir / f"{tpl['chunkId']}.json").write_text(json.dumps(tpl, indent=2) + "\n", encoding="utf-8")

    b1_ids = [
        "slag_entrance_01",
        "slag_combat_vat_01",
        "slag_combat_furnace_02",
        "slag_combat_catwalk_03",
        "slag_combat_retort_04",
        "slag_combat_cistern_05",
        "slag_combat_foundry_06",
        "slag_hub_crossroad_01",
        "slag_elite_altar_01",
        "slag_shop_armory_01",
        "slag_lore_quarantine_01",
        "slag_secret_tendril_01",
        "slag_exit_lift_01",
    ]
    all_ids = [*b1_ids, *[c["chunkId"] for c in new_chunks]]
    (chunks_dir / "index.json").write_text(
        json.dumps(
            {
                "version": "1.7.0",
                "biomeId": "all_four_biomes",
                "chunks": all_ids,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"✅ Generated Biomes 02-04 tilesets, 15 parallax normal pairs, and {len(all_ids)} total RoomChunks!")


if __name__ == "__main__":
    run_pipeline()
