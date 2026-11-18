#!/usr/bin/env python3
"""
Milestone 4 Asset Factory Synthesizer:
Generates 48-color Dark Alchemy pixel-art frames & paired OpenGL tangent-space normal maps (*_n.png) for:
  1. world_props_atlas (Teleporter steles, 4 Rune gizmos, 5 Biome traps, Room role props & Corridor arches)
  2. minimap_ui_sheet (12x 16x16 crisp pixel icons: 8 Room Role icons + 4 Exploration Rune emblems)

All outputs pass strictly through quantize_palette.py -> normal_map_sobel.py -> pack_multiatlas.mjs.
"""
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

import math
from pathlib import Path

from generate_sprite import C, add_1px_outline, draw_thick_segment, put_px

ACID_0 = (11, 31, 29, 255)      # #0B1F1D
ACID_2 = (38, 107, 96, 255)     # #266B60
ACID_4 = (34, 197, 94, 255)     # #22C55E
ACID_6 = (163, 230, 53, 255)    # #A3E635
AETHER_0 = (59, 7, 100, 255)    # #3B0764
AETHER_1 = (109, 40, 217, 255)  # #6D28D9
AETHER_2 = (168, 85, 247, 255)  # #A855F7


def fill_rect_px(arr: np.ndarray, x0: int, y0: int, w: int, h: int, col: tuple[int, int, int, int]) -> None:
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            put_px(arr, x, y, col)


def save_outlined(arr: np.ndarray, path: Path) -> None:
    out = add_1px_outline(arr, C["OUTLINE"])
    Image.fromarray(out, mode="RGBA").save(path)


def build_teleporter_frames(out_dir: Path) -> None:
    # 32x48 Gothic Mercury Teleporter Stele (dormant + 3 active frames)
    for idx in range(4):
        arr = np.zeros((48, 32, 4), dtype=np.uint8)
        active = idx > 0
        # Stepped obsidian & brass pedestal base
        fill_rect_px(arr, 4, 43, 24, 4, C["SLATE_2"])
        fill_rect_px(arr, 6, 40, 20, 3, C["BRASS_3"])
        # Tall obelisk body
        for y in range(10, 40):
            half = 6 + (y - 10) // 10
            for x in range(16 - half, 16 + half):
                edge = abs(x - 15.5) >= half - 1.4
                arr[y, x] = C["BRASS_4"] if edge else (C["SLATE_3"] if x < 16 else C["SLATE_4"])
        # Pointed astrolabe crown
        for dy in range(6):
            span = 6 - dy
            fill_rect_px(arr, 16 - span, 4 + dy, span * 2, 1, C["GOLD"] if dy < 2 else C["BRASS_5"])
        # Central mercury core channel & floating halo ring
        core_col = C["CYAN"] if active else C["SLATE_1"]
        hi_col = C["PORC_5"] if active else C["SLATE_5"]
        fill_rect_px(arr, 14, 15, 4, 20, core_col)
        if active:
            pulse_y = 18 + (idx * 5) % 12
            fill_rect_px(arr, 13, pulse_y, 6, 4, C["PORC_5"])
            for a in range(0, 360, 18):
                rad = math.radians(a + idx * 15)
                rx = int(round(15.5 + 10.5 * math.cos(rad)))
                ry = int(round(20.0 + 5.5 * math.sin(rad)))
                put_px(arr, rx, ry, C["CYAN"] if (a // 18) % 2 == 0 else hi_col)
        name = "stele_dormant" if idx == 0 else f"stele_active_{idx - 1}"
        save_outlined(arr, out_dir / f"{name}.png")

    # 24x48 vertical mercury warp beam streaks
    for idx in range(2):
        arr = np.zeros((48, 24, 4), dtype=np.uint8)
        for y in range(2, 46):
            wobble = int(round(math.sin((y + idx * 9) * 0.35) * 2.0))
            fill_rect_px(arr, 9 + wobble, y, 6, 1, C["CYAN"])
            fill_rect_px(arr, 11 + wobble, y, 2, 1, C["PORC_5"])
        save_outlined(arr, out_dir / f"mercury_warp_streak_{idx}.png")


def build_rune_gizmo_frames(out_dir: Path) -> None:
    # 1. Vitriol Tendril Spore Grate (32x16 floor grate) + Vine Stem (16x32) + Vine Crown (24x20)
    grate = np.zeros((16, 32, 4), dtype=np.uint8)
    fill_rect_px(grate, 2, 10, 28, 5, C["BRASS_2"])
    for x in range(4, 28, 4):
        fill_rect_px(grate, x, 11, 2, 3, ACID_0)
        put_px(grate, x, 9, C["ACID_5"])
        put_px(grate, x + 1, 8 - (x % 2), ACID_6)
    save_outlined(grate, out_dir / "tendril_grate.png")

    stem = np.zeros((32, 16, 4), dtype=np.uint8)
    for y in range(1, 31):
        cx = int(round(7.5 + math.sin(y * 0.42) * 2.2))
        fill_rect_px(stem, cx - 2, y, 4, 1, C["ACID_3"])
        put_px(stem, cx - 1, y, C["ACID_5"])
        if y % 8 == 3:
            fill_rect_px(stem, cx - 5, y, 10, 2, ACID_4)
            put_px(stem, cx - 5, y - 1, C["PORC_4"])
            put_px(stem, cx + 4, y - 1, C["PORC_4"])
    save_outlined(stem, out_dir / "tendril_vine_stem.png")

    crown = np.zeros((20, 24, 4), dtype=np.uint8)
    draw_thick_segment(crown, 12, 18, 5, 8, 2.0, C["ACID_3"], C["ACID_5"])
    draw_thick_segment(crown, 12, 18, 19, 8, 2.0, C["ACID_3"], C["ACID_5"])
    fill_rect_px(crown, 4, 6, 16, 3, ACID_4)
    fill_rect_px(crown, 6, 5, 12, 1, ACID_6)
    save_outlined(crown, out_dir / "tendril_vine_crown.png")

    # 2. Mercury Conduit Brass Capillary Coffin (24x40 idle & active)
    for active in (False, True):
        arr = np.zeros((40, 24, 4), dtype=np.uint8)
        fill_rect_px(arr, 4, 6, 16, 32, C["BRASS_2"])
        fill_rect_px(arr, 6, 8, 12, 28, C["SLATE_2"] if not active else C["PORC_2"])
        fill_rect_px(arr, 3, 4, 18, 3, C["GOLD"] if active else C["BRASS_5"])
        fill_rect_px(arr, 3, 36, 18, 3, C["BRASS_4"])
        for y in range(11, 34, 5):
            fill_rect_px(arr, 8, y, 8, 3, C["CYAN"] if active else C["SLATE_4"])
            if active:
                put_px(arr, 11, y + 1, C["PORC_5"])
        save_outlined(arr, out_dir / ("conduit_coffin_active.png" if active else "conduit_coffin_idle.png"))

    # 3. Elite Rune Altar Pedestal (40x36) + 4 Floating Rune Sigils (20x20)
    altar = np.zeros((36, 40, 4), dtype=np.uint8)
    fill_rect_px(altar, 4, 31, 32, 4, C["SLATE_3"])
    fill_rect_px(altar, 8, 27, 24, 4, C["BRASS_3"])
    fill_rect_px(altar, 12, 15, 16, 12, C["SLATE_4"])
    fill_rect_px(altar, 10, 12, 20, 3, C["GOLD"])
    fill_rect_px(altar, 17, 17, 6, 8, C["CRIM_5"])
    save_outlined(altar, out_dir / "rune_altar_pedestal.png")

    sigil_cols = [
        (C["ACID_5"], ACID_6),
        (C["CYAN"], C["PORC_5"]),
        (C["EMBER_4"], C["GOLD"]),
        (C["GOLD"], C["PORC_5"]),
    ]
    for idx, (c_main, c_hi) in enumerate(sigil_cols):
        sig = np.zeros((20, 20, 4), dtype=np.uint8)
        for y in range(3, 17):
            for x in range(3, 17):
                d = abs(x - 9.5) + abs(y - 9.5)
                if d <= 6.5:
                    sig[y, x] = c_hi if d <= 2.5 else (c_main if d <= 5.0 else C["BRASS_4"])
        save_outlined(sig, out_dir / f"rune_sigil_{idx}.png")


def build_trap_frames(out_dir: Path) -> None:
    # 1. Spike Bed Strip (16x16 tileable slag iron spikes)
    spike = np.zeros((16, 16, 4), dtype=np.uint8)
    fill_rect_px(spike, 1, 13, 14, 2, C["SLATE_2"])
    for sx in (3, 8, 13):
        for dy in range(9):
            span = max(1, (8 - dy) // 3)
            fill_rect_px(spike, sx - span + 1, 4 + dy, span, 1, C["PORC_3"] if dy < 3 else C["CRIM_4"])
    save_outlined(spike, out_dir / "spike_bed_strip.png")

    # 2. Acid Geyser: pool base (16x16), warning bubbles (16x24 x2), high acid jet (16x64 x2)
    pool = np.zeros((16, 16, 4), dtype=np.uint8)
    fill_rect_px(pool, 1, 10, 14, 5, ACID_2)
    fill_rect_px(pool, 1, 9, 14, 2, C["ACID_5"])
    put_px(pool, 5, 8, ACID_6)
    put_px(pool, 11, 8, C["PORC_4"])
    save_outlined(pool, out_dir / "acid_pool_base.png")

    for idx in range(2):
        warn = np.zeros((24, 16, 4), dtype=np.uint8)
        fill_rect_px(warn, 1, 18, 14, 5, C["ACID_3"])
        fill_rect_px(warn, 2, 16, 12, 2, ACID_6)
        for bx, by in ([(4, 12), (9, 9), (12, 14)] if idx == 0 else [(5, 8), (10, 13), (7, 5)]):
            fill_rect_px(warn, bx, by, 3, 3, C["ACID_5"])
            put_px(warn, bx + 1, by, C["PORC_5"])
        save_outlined(warn, out_dir / f"acid_bubble_warn_{idx}.png")

        jet = np.zeros((64, 16, 4), dtype=np.uint8)
        for y in range(3, 63):
            sway = int(round(math.sin((y + idx * 7) * 0.3) * 1.5))
            w = 8 if y > 14 else max(4, (y - 1) // 2 + 2)
            x0 = 8 - w // 2 + sway
            fill_rect_px(jet, x0, y, w, 1, C["ACID_5"] if y % 2 == 0 else ACID_4)
            fill_rect_px(jet, x0 + w // 3, y, max(1, w // 3), 1, ACID_6 if y > 10 else C["PORC_5"])
        save_outlined(jet, out_dir / f"acid_geyser_jet_{idx}.png")

    # 3. Steam Flame Nozzle: cast-iron housing (16x16) + 80px vertical flame column (20x80 x2)
    nozzle = np.zeros((16, 16, 4), dtype=np.uint8)
    fill_rect_px(nozzle, 2, 9, 12, 6, C["BRASS_2"])
    fill_rect_px(nozzle, 4, 6, 8, 4, C["SLATE_4"])
    fill_rect_px(nozzle, 5, 5, 6, 2, C["EMBER_3"])
    save_outlined(nozzle, out_dir / "flame_nozzle_housing.png")

    for idx in range(2):
        fjet = np.zeros((80, 20, 4), dtype=np.uint8)
        for y in range(4, 78):
            sway = int(round(math.sin((y + idx * 11) * 0.28) * 2.0))
            w = 10 if 16 < y < 68 else max(4, 10 - abs(y - 42) // 5)
            x0 = 10 - w // 2 + sway
            fill_rect_px(fjet, x0, y, w, 1, C["EMBER_3"] if y % 2 == 0 else C["EMBER_4"])
            fill_rect_px(fjet, x0 + 2, y, max(2, w - 4), 1, C["GOLD"] if y > 24 else C["EMBER_5"])
            if y > 48 and y % 3 == 0:
                put_px(fjet, 10 + sway, y, C["PORC_5"])
        save_outlined(fjet, out_dir / f"flame_jet_{idx}.png")

    # 4. Pendulum Blade: pivot mount (16x16) + chain & crescent axe blade (40x68)
    piv = np.zeros((16, 16, 4), dtype=np.uint8)
    fill_rect_px(piv, 3, 2, 10, 10, C["BRASS_4"])
    fill_rect_px(piv, 6, 5, 4, 4, C["GOLD"])
    save_outlined(piv, out_dir / "pendulum_pivot.png")

    pend = np.zeros((68, 40, 4), dtype=np.uint8)
    for y in range(2, 50):
        col = C["BRASS_5"] if (y // 3) % 2 == 0 else C["SLATE_5"]
        fill_rect_px(pend, 19, y, 2, 1, col)
    for y in range(46, 65):
        for x in range(4, 36):
            r = math.hypot(x - 19.5, (y - 42.0) * 1.15)
            if 11.0 <= r <= 21.5 and y >= 48:
                pend[y, x] = C["PORC_5"] if r >= 19.5 else (C["GOLD"] if r <= 13.5 else C["PORC_2"])
    save_outlined(pend, out_dir / "pendulum_crescent_blade.png")

    # 5. Voltaic Arc Gate: astrolabe node (16x16) + electric beam (16x64 x2)
    vnode = np.zeros((16, 16, 4), dtype=np.uint8)
    fill_rect_px(vnode, 3, 3, 10, 10, C["BRASS_4"])
    fill_rect_px(vnode, 5, 5, 6, 6, C["CYAN"])
    put_px(vnode, 7, 7, C["PORC_5"])
    save_outlined(vnode, out_dir / "voltaic_node.png")

    for idx in range(2):
        arc = np.zeros((64, 16, 4), dtype=np.uint8)
        for y in range(2, 62):
            zig = ((y // 4 + idx) % 3 - 1) * 2
            fill_rect_px(arc, 6 + zig, y, 4, 1, C["CYAN"])
            put_px(arc, 7 + zig, y, C["PORC_5"])
            if y % 7 == idx * 3:
                put_px(arc, 4 + zig, y, AETHER_2)
        save_outlined(arc, out_dir / f"voltaic_arc_beam_{idx}.png")


def build_room_role_props(out_dir: Path) -> None:
    # 1. Entrance Suspension Vessel Tube (28x56)
    tube = np.zeros((56, 28, 4), dtype=np.uint8)
    fill_rect_px(tube, 4, 2, 20, 5, C["BRASS_4"])
    fill_rect_px(tube, 4, 49, 20, 5, C["BRASS_3"])
    for y in range(7, 49):
        fill_rect_px(tube, 6, y, 16, 1, C["ACID_1"] if (y % 4 != 0) else C["ACID_3"])
        put_px(tube, 7, y, C["PORC_4"])
        put_px(tube, 20, y, C["SLATE_5"])
    fill_rect_px(tube, 11, 20, 6, 14, C["PORC_3"])
    put_px(tube, 13, 24, C["CYAN"])
    save_outlined(tube, out_dir / "entrance_vessel_tube.png")

    # 2. Shop Armory Anvil & Weapon Rack (48x40)
    shop = np.zeros((40, 48, 4), dtype=np.uint8)
    fill_rect_px(shop, 4, 30, 40, 8, C["BRASS_2"])
    fill_rect_px(shop, 2, 27, 44, 3, C["GOLD"])
    draw_thick_segment(shop, 12, 26, 12, 8, 1.5, C["PORC_2"], C["PORC_5"])
    draw_thick_segment(shop, 24, 26, 24, 6, 2.0, C["CRIM_5"], C["EMBER_4"])
    draw_thick_segment(shop, 36, 26, 36, 10, 1.8, C["CYAN"], C["PORC_5"])
    save_outlined(shop, out_dir / "shop_armory_rack.png")

    # 3. Lore Notice Board & Oil Lantern (36x40)
    lore = np.zeros((40, 36, 4), dtype=np.uint8)
    fill_rect_px(lore, 6, 20, 3, 18, C["BRASS_2"])
    fill_rect_px(lore, 27, 20, 3, 18, C["BRASS_2"])
    fill_rect_px(lore, 4, 6, 28, 16, C["BRASS_3"])
    fill_rect_px(lore, 7, 9, 14, 10, C["PORC_3"])
    fill_rect_px(lore, 9, 11, 8, 2, C["CRIM_5"])
    fill_rect_px(lore, 23, 11, 4, 6, C["EMBER_4"])
    put_px(lore, 24, 13, C["GOLD"])
    save_outlined(lore, out_dir / "lore_notice_board.png")

    # 4. Exit Quicksilver Capillary Lift Platform (48x56)
    lift = np.zeros((56, 48, 4), dtype=np.uint8)
    fill_rect_px(lift, 6, 2, 4, 52, C["BRASS_3"])
    fill_rect_px(lift, 38, 2, 4, 52, C["BRASS_3"])
    fill_rect_px(lift, 4, 48, 40, 6, C["GOLD"])
    fill_rect_px(lift, 10, 44, 28, 4, C["PORC_3"])
    for y in range(8, 44, 2):
        fill_rect_px(lift, 21, y, 6, 1, C["CYAN"])
        put_px(lift, 23, y, C["PORC_5"])
    save_outlined(lift, out_dir / "exit_mercury_lift.png")

    # 5. Corridor Bridge Seal Archway (24x64)
    arch = np.zeros((64, 24, 4), dtype=np.uint8)
    fill_rect_px(arch, 2, 2, 20, 6, C["BRASS_4"])
    fill_rect_px(arch, 4, 8, 4, 54, C["SLATE_3"])
    fill_rect_px(arch, 16, 8, 4, 54, C["SLATE_3"])
    fill_rect_px(arch, 9, 4, 6, 4, C["GOLD"])
    save_outlined(arch, out_dir / "corridor_seal_arch.png")


def build_minimap_ui_sheet(raw_png: Path) -> None:
    # 192x16 strip: 12 slots of 16x16 crisp pixel icons
    # Slots 0..7: ENTRANCE, COMBAT, TELEPORTER_HUB, ELITE, SHOP, LORE, RUNE_SECRET, EXIT
    # Slots 8..11: TENDRIL, CONDUIT, RAM, CLAWS
    sheet = np.zeros((16, 192, 4), dtype=np.uint8)
    slot_colors = [
        (C["PORC_4"], C["CYAN"]),       # 0 ENTRANCE
        (C["CRIM_5"], C["PORC_4"]),     # 1 COMBAT
        (C["CYAN"], C["PORC_5"]),       # 2 HUB
        (C["CRIM_6"], C["GOLD"]),       # 3 ELITE
        (C["GOLD"], C["EMBER_5"]),      # 4 SHOP
        (C["PORC_3"], AETHER_2),        # 5 LORE
        (C["ACID_5"], ACID_6),          # 6 SECRET
        (C["GOLD"], C["CYAN"]),         # 7 EXIT
        (C["ACID_5"], ACID_6),          # 8 RUNE TENDRIL
        (C["CYAN"], C["PORC_5"]),       # 9 RUNE CONDUIT
        (C["EMBER_4"], C["GOLD"]),      # 10 RUNE RAM
        (C["GOLD"], C["PORC_5"]),       # 11 RUNE CLAWS
    ]
    for s, (c1, c2) in enumerate(slot_colors):
        icon = np.zeros((16, 16, 4), dtype=np.uint8)
        fill_rect_px(icon, 2, 2, 12, 12, C["SLATE_1"])
        for i in range(2, 14):
            put_px(icon, i, 2, C["BRASS_4"])
            put_px(icon, i, 13, C["BRASS_4"])
            put_px(icon, 2, i, C["BRASS_4"])
            put_px(icon, 13, i, C["BRASS_4"])
        if s in (0, 2, 7):
            fill_rect_px(icon, 6, 4, 4, 8, c1)
            fill_rect_px(icon, 7, 5, 2, 6, c2)
        elif s in (1, 3):
            draw_thick_segment(icon, 4, 11, 11, 4, 1.1, c1, c2)
            if s == 3:
                draw_thick_segment(icon, 4, 4, 11, 11, 1.1, c1, c2)
        elif s == 4:
            fill_rect_px(icon, 5, 6, 6, 5, c1)
            fill_rect_px(icon, 6, 4, 4, 2, c2)
        elif s == 5:
            fill_rect_px(icon, 5, 4, 6, 8, c1)
            fill_rect_px(icon, 6, 6, 4, 1, c2)
            fill_rect_px(icon, 6, 9, 4, 1, c2)
        else:
            for y in range(4, 12):
                for x in range(4, 12):
                    if abs(x - 7.5) + abs(y - 7.5) <= 3.6:
                        icon[y, x] = c2 if abs(x - 7.5) + abs(y - 7.5) <= 1.6 else c1
        outlined = add_1px_outline(icon, C["OUTLINE"])
        sheet[0:16, s * 16 : (s + 1) * 16] = outlined

    raw_png.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, mode="RGBA").save(raw_png)


def run_pipeline() -> None:
    root = Path(__file__).resolve().parents[2]
    py = sys.executable
    raw_props = root / ".tmp/raw_assets/world_props"
    quant_props = root / ".tmp/quantized/world_props"
    raw_props.mkdir(parents=True, exist_ok=True)
    quant_props.mkdir(parents=True, exist_ok=True)

    for old in quant_props.glob("*.png"):
        old.unlink()

    build_teleporter_frames(raw_props)
    build_rune_gizmo_frames(raw_props)
    build_trap_frames(raw_props)
    build_room_role_props(raw_props)

    subprocess.run(
        [
            py,
            str(root / "tools/asset-factory/quantize_palette.py"),
            "--input",
            str(raw_props),
            "--output",
            str(quant_props),
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
            str(quant_props),
            "--strength",
            "2.4",
        ],
        check=True,
    )

    subprocess.run(
        [
            "node",
            str(root / "tools/asset-factory/pack_multiatlas.mjs"),
            "--src",
            str(quant_props),
            "--out",
            str(root / "public/assets/atlases/world_props_atlas"),
            "--no-trim",
            "--pivot-x",
            "0.5",
            "--pivot-y",
            "1.0",
        ],
        check=True,
    )

    # Minimap UI pixel sheet + normal map pair
    raw_map = root / ".tmp/raw_assets/minimap_ui/minimap_ui_sheet.png"
    out_map = root / "public/assets/atlases/minimap_ui_sheet.png"
    build_minimap_ui_sheet(raw_map)
    subprocess.run(
        [
            py,
            str(root / "tools/asset-factory/quantize_palette.py"),
            "--input",
            str(raw_map),
            "--output",
            str(out_map),
            "--no-chroma-key",
            "--dither",
            "0.0",
        ],
        check=True,
    )
    subprocess.run(
        [py, str(root / "tools/asset-factory/normal_map_sobel.py"), "--diffuse", str(out_map), "--strength", "2.2"],
        check=True,
    )
    print("✅ Synthesized, quantized, normal-mapped, and packed Milestone 4 world_props_atlas + minimap_ui_sheet!")


if __name__ == "__main__":
    run_pipeline()
