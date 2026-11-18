#!/usr/bin/env python3
"""
Milestone 5 Asset Factory Synthesizer:
Generates 48-color Dark Alchemy pixel-art frames & paired OpenGL tangent-space normal maps (*_n.png) for:
  1. weapons_fx_atlas (6 iconic weapons, slash smear arcs, mercury arrows, chain lightning, parry sunburst,
     bouncing mercury-blood droplets + floor stains, brass sparks, tri-color scroll & ichor orbs)
  2. weapon_icons_sheet (320x32 crisp UI icon strip: 6 M5 weapons + 3 stat scrolls + 1 elixir flask)
  3. m5_enemies_atlas (Slag Husk 64x64 flesh target & Brass Sentinel 80x80 tower-shield clockwork knight)

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

ACID_4 = (34, 197, 94, 255)     # #22C55E
ACID_6 = (163, 230, 53, 255)    # #A3E635
AETHER_1 = (109, 40, 217, 255)  # #6D28D9
AETHER_2 = (168, 85, 247, 255)  # #A855F7


def fill_rect_px(arr: np.ndarray, x0: int, y0: int, w: int, h: int, col: tuple[int, int, int, int]) -> None:
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            put_px(arr, x, y, col)


def fill_disc(arr: np.ndarray, cx: float, cy: float, r: float, col: tuple[int, int, int, int]) -> None:
    ri = int(math.ceil(r))
    for dy in range(-ri, ri + 1):
        for dx in range(-ri, ri + 1):
            if dx * dx + dy * dy <= r * r:
                put_px(arr, int(round(cx + dx)), int(round(cy + dy)), col)


def save_outlined(arr: np.ndarray, path: Path) -> None:
    out = add_1px_outline(arr, C["OUTLINE"])
    Image.fromarray(out, mode="RGBA").save(path)


def draw_weapon_art_32(slot: int, with_frame_bg: bool) -> np.ndarray:
    canvas = np.zeros((32, 32, 4), dtype=np.uint8)
    fg = np.zeros((32, 32, 4), dtype=np.uint8)

    border_map = [
        C["CRIM_5"],   # 0 scalpel
        C["CYAN"],     # 1 rapier
        C["EMBER_4"],  # 2 cleaver
        C["GOLD"],     # 3 bow
        C["CYAN"],     # 4 arc staff
        C["BRASS_5"],  # 5 buckler
        C["CRIM_6"],   # 6 rubedo scroll
        C["GOLD"],     # 7 citrinitas scroll
        C["ACID_5"],   # 8 albedo scroll
        C["CRIM_5"],   # 9 elixir flask
    ]
    if with_frame_bg:
        bcol = border_map[slot]
        for y in range(2, 30):
            for x in range(2, 30):
                ch = abs(x - 15.5) + abs(y - 15.5)
                if ch <= 23.5:
                    if ch >= 22.0 or x in (2, 29) or y in (2, 29):
                        canvas[y, x] = bcol
                    else:
                        canvas[y, x] = C["SLATE_1"] if (x + y) % 2 == 0 else C["SLATE_0"]

    if slot == 0:
        # wpn_rust_scalpel: Serrated surgical vivisector blade + crimson rubedo runes
        draw_thick_segment(fg, 6, 25, 12, 19, 1.8, C["BRASS_3"], C["GOLD"])
        draw_thick_segment(fg, 12, 19, 26, 6, 2.2, C["SLATE_5"], C["PORC_4"])
        for k in range(14, 25, 3):
            put_px(fg, k + 1, 31 - k, C["CRIM_6"])
            put_px(fg, k, 30 - k, C["PORC_5"])
        put_px(fg, 10, 21, C["GOLD"])
    elif slot == 1:
        # wpn_quicksilver_rapier: Needle-thin estoc with brass bell-guard & glowing mercury fuller
        draw_thick_segment(fg, 5, 26, 10, 21, 1.4, C["BRASS_4"], C["GOLD"])
        for a in range(-65, 65, 12):
            rad = math.radians(a - 45)
            put_px(fg, int(round(11 + 4.2 * math.cos(rad))), int(round(20 + 4.2 * math.sin(rad))), C["GOLD"])
        draw_thick_segment(fg, 11, 20, 27, 4, 1.2, C["CYAN"], C["PORC_5"])
    elif slot == 2:
        # wpn_athanor_cleaver: Colossal furnace guillotine cleaver with molten vents
        draw_thick_segment(fg, 5, 26, 11, 20, 1.8, C["BRASS_2"], C["BRASS_5"])
        for y in range(5, 21):
            for x in range(10, 27):
                if (x - 10) + (20 - y) >= 7 and (x - 10) <= 15 and y >= 5 + (25 - x) // 3:
                    edge = x >= 23 or y <= 7
                    vent = (x + y) % 5 == 0 and 13 <= x <= 21 and 9 <= y <= 17
                    fg[y, x] = C["PORC_4"] if edge else (C["EMBER_4"] if vent else C["SLATE_3"])
        put_px(fg, 17, 12, C["GOLD"])
        put_px(fg, 20, 9, C["GOLD"])
    elif slot == 3:
        # wpn_alembic_bow: Curved brass condenser bow + tungsten string + mercury arrow
        draw_thick_segment(fg, 8, 6, 8, 25, 0.9, C["PORC_3"], C["CYAN"])
        for a in range(-75, 76, 6):
            rad = math.radians(a)
            bx = int(round(9 + 12 * math.cos(rad)))
            by = int(round(15.5 + 11 * math.sin(rad)))
            fill_disc(fg, bx, by, 1.3, C["BRASS_5"] if abs(a) > 25 else C["GOLD"])
        draw_thick_segment(fg, 7, 16, 26, 16, 1.1, C["CYAN"], C["PORC_5"])
        put_px(fg, 27, 16, C["PORC_5"])
    elif slot == 4:
        # wpn_voltaic_arc_staff: Spinning golden astrolabe scepter + cyan Tesla crystal
        draw_thick_segment(fg, 6, 26, 19, 13, 1.5, C["BRASS_3"], C["GOLD"])
        for a in range(0, 360, 18):
            rad = math.radians(a)
            put_px(fg, int(round(21 + 5.2 * math.cos(rad))), int(round(10 + 5.2 * math.sin(rad))), C["GOLD"])
        fill_disc(fg, 21, 10, 2.6, C["CYAN"])
        put_px(fg, 21, 10, C["PORC_5"])
    elif slot == 5:
        # wpn_slag_buckler: Heavy riveted cast-iron slag repulsor buckler + furnace core
        for y in range(6, 26):
            for x in range(7, 25):
                d = ((x - 15.5) / 8.2) ** 2 + ((y - 15.5) / 9.2) ** 2
                if d <= 1.0:
                    if d >= 0.70:
                        fg[y, x] = C["GOLD"] if (x + y) % 4 == 0 else C["BRASS_4"]
                    elif d <= 0.20:
                        fg[y, x] = C["GOLD"] if d <= 0.07 else C["EMBER_4"]
                    else:
                        fg[y, x] = C["SLATE_3"] if x < 16 else C["SLATE_5"]
    elif slot in (6, 7, 8):
        # Tri-color Alchemy Scrolls (Rubedo / Citrinitas / Albedo)
        wax_col = C["CRIM_6"] if slot == 6 else (C["GOLD"] if slot == 7 else C["ACID_5"])
        fill_rect_px(fg, 9, 6, 14, 3, C["BRASS_5"])
        fill_rect_px(fg, 9, 23, 14, 3, C["BRASS_4"])
        fill_rect_px(fg, 10, 9, 12, 14, C["PORC_3"])
        fill_rect_px(fg, 11, 10, 10, 12, C["PORC_4"])
        fill_disc(fg, 15.5, 15.5, 3.2, wax_col)
        put_px(fg, 15, 15, C["PORC_5"])
    else:
        # Philosopher's Elixir Flask
        fill_rect_px(fg, 14, 5, 4, 4, C["GOLD"])
        for y in range(9, 26):
            half = min(7, 2 + (y - 9) // 2) if y < 20 else max(3, 7 - (y - 20))
            for x in range(16 - half, 16 + half):
                fg[y, x] = C["CRIM_6"] if y >= 14 else C["PORC_3"]
        fill_rect_px(fg, 13, 15, 2, 5, C["PORC_5"])

    outlined_fg = add_1px_outline(fg, C["OUTLINE"])
    if not with_frame_bg:
        return outlined_fg
    mask = outlined_fg[:, :, 3] > 0
    canvas[mask] = outlined_fg[mask]
    return add_1px_outline(canvas, C["OUTLINE"])


def build_weapons_and_vfx_frames(out_dir: Path) -> None:
    wpn_names = [
        "wpn_rust_scalpel",
        "wpn_quicksilver_rapier",
        "wpn_athanor_cleaver",
        "wpn_alembic_bow",
        "wpn_voltaic_arc_staff",
        "wpn_slag_buckler",
    ]
    for idx, name in enumerate(wpn_names):
        Image.fromarray(draw_weapon_art_32(idx, False), mode="RGBA").save(out_dir / f"{name}.png")

    # Tri-scroll pedestal pickup sprite (28x32) & Ichor droplets (14x14)
    scr = np.zeros((32, 28, 4), dtype=np.uint8)
    fill_rect_px(scr, 6, 26, 16, 4, C["BRASS_3"])
    fill_rect_px(scr, 8, 7, 12, 18, C["PORC_4"])
    fill_rect_px(scr, 7, 5, 14, 3, C["GOLD"])
    fill_rect_px(scr, 7, 23, 14, 3, C["BRASS_5"])
    fill_rect_px(scr, 10, 11, 8, 2, C["CRIM_6"])
    fill_rect_px(scr, 10, 15, 8, 2, C["GOLD"])
    fill_rect_px(scr, 10, 19, 8, 2, C["ACID_5"])
    save_outlined(scr, out_dir / "scroll_tri_pickup.png")

    for idx in range(2):
        orb = np.zeros((14, 14, 4), dtype=np.uint8)
        fill_disc(orb, 6.5, 6.5, 4.2 - idx * 0.4, C["CYAN"])
        fill_disc(orb, 5.8, 5.8, 2.0, C["PORC_5"])
        save_outlined(orb, out_dir / f"ichor_orb_{idx}.png")

    # 1. Scalpel crimson crescent slash smears (48x36)
    for idx in range(2):
        arr = np.zeros((36, 48, 4), dtype=np.uint8)
        for a in range(-68, 69, 3):
            rad = math.radians(a)
            for r in range(13, 21 - idx * 2):
                px = int(round(14 + r * 1.35 * math.cos(rad)))
                py = int(round(18 + r * 0.85 * math.sin(rad)))
                col = C["PORC_5"] if r >= 18 - idx else (C["CRIM_6"] if r >= 15 else C["CRIM_3"])
                put_px(arr, px, py, col)
        save_outlined(arr, out_dir / f"slash_scalpel_{idx}.png")

    # 2. Quicksilver Rapier razor needle thrust streak (80x20)
    for idx in range(2):
        arr = np.zeros((20, 80, 4), dtype=np.uint8)
        draw_thick_segment(arr, 6, 10, 74, 10, 2.2 - idx * 0.6, C["CYAN"], C["PORC_5"])
        draw_thick_segment(arr, 46, 6, 74, 10, 1.0, C["PORC_3"], C["PORC_5"])
        draw_thick_segment(arr, 46, 14, 74, 10, 1.0, C["PORC_3"], C["PORC_5"])
        save_outlined(arr, out_dir / f"thrust_rapier_{idx}.png")

    # 3. Athanor Cleaver molten overhead guillotine arc (68x52) + rhythm shoulder spark (20x20)
    for idx in range(2):
        arr = np.zeros((52, 68, 4), dtype=np.uint8)
        for a in range(-82, 48, 2):
            rad = math.radians(a)
            for r in range(16, 29 - idx * 3):
                px = int(round(20 + r * 1.45 * math.cos(rad)))
                py = int(round(28 + r * 0.95 * math.sin(rad)))
                col = C["GOLD"] if r >= 25 - idx * 2 else (C["EMBER_4"] if r >= 20 else C["CRIM_5"])
                put_px(arr, px, py, col)
        save_outlined(arr, out_dir / f"cleave_athanor_{idx}.png")

    for idx in range(2):
        sp = np.zeros((20, 20, 4), dtype=np.uint8)
        span = 8 - idx * 2
        draw_thick_segment(sp, 10 - span, 10, 10 + span, 10, 1.3, C["EMBER_4"], C["GOLD"])
        draw_thick_segment(sp, 10, 10 - span, 10, 10 + span, 1.3, C["EMBER_4"], C["PORC_5"])
        draw_thick_segment(sp, 10 - 5, 10 - 5, 10 + 5, 10 + 5, 1.0, C["GOLD"], C["PORC_5"])
        save_outlined(sp, out_dir / f"rhythm_spark_{idx}.png")

    # 4. Alembic Bow mercury arrow (26x9) & enemy flask projectile (14x14)
    arrow = np.zeros((9, 26, 4), dtype=np.uint8)
    fill_rect_px(arrow, 3, 4, 17, 2, C["BRASS_5"])
    draw_thick_segment(arrow, 18, 2, 24, 4.5, 1.2, C["CYAN"], C["PORC_5"])
    draw_thick_segment(arrow, 18, 7, 24, 4.5, 1.2, C["CYAN"], C["PORC_5"])
    fill_rect_px(arrow, 2, 2, 4, 2, C["PORC_4"])
    fill_rect_px(arrow, 2, 6, 4, 2, C["PORC_4"])
    save_outlined(arrow, out_dir / "proj_mercury_arrow.png")

    flask = np.zeros((14, 14, 4), dtype=np.uint8)
    fill_disc(flask, 6.5, 7.5, 4.2, C["ACID_5"])
    fill_disc(flask, 5.5, 6.5, 2.0, C["GOLD"])
    fill_rect_px(flask, 5, 2, 3, 2, C["BRASS_4"])
    save_outlined(flask, out_dir / "proj_enemy_flask.png")

    # 5. Voltaic Arc Staff jagged lightning segment (48x14)
    for idx in range(2):
        bolt = np.zeros((14, 48, 4), dtype=np.uint8)
        prev_y = 7
        for x in range(2, 46, 4):
            ny = 7 + (((x // 4 + idx * 2) % 3) - 1) * 3
            draw_thick_segment(bolt, x, prev_y, x + 4, ny, 1.2, C["CYAN"], C["PORC_5"])
            if x % 8 == 2:
                put_px(bolt, x + 2, max(1, min(12, ny - 2)), AETHER_2)
            prev_y = ny
        save_outlined(bolt, out_dir / f"arc_chain_bolt_{idx}.png")

    # 6. Slag Buckler shockwave cone (64x48) & Golden Parry Sunburst (36x36)
    for idx in range(2):
        wave = np.zeros((48, 64, 4), dtype=np.uint8)
        for a in range(-52, 53, 3):
            rad = math.radians(a)
            for r in (20 + idx * 4, 34 + idx * 5):
                for dr in range(4):
                    px = int(round(10 + (r + dr) * math.cos(rad)))
                    py = int(round(24 + (r + dr) * 0.72 * math.sin(rad)))
                    put_px(wave, px, py, C["PORC_5"] if dr == 3 else (C["GOLD"] if dr >= 1 else C["EMBER_4"]))
        save_outlined(wave, out_dir / f"buckler_shockwave_{idx}.png")

    sun = np.zeros((36, 36, 4), dtype=np.uint8)
    draw_thick_segment(sun, 3, 18, 33, 18, 1.8, C["GOLD"], C["PORC_5"])
    draw_thick_segment(sun, 18, 3, 18, 33, 1.8, C["GOLD"], C["PORC_5"])
    for a in range(0, 360, 15):
        rad = math.radians(a)
        put_px(sun, int(round(18 + 10 * math.cos(rad))), int(round(18 + 10 * math.sin(rad))), C["PORC_4"])
    save_outlined(sun, out_dir / "parry_sunburst_0.png")

    # 7. Physical Mercury-Blood Droplets (8x8), Floor Stains (16x6), and Brass Sparks (12x5)
    for idx in range(2):
        bd = np.zeros((8, 8, 4), dtype=np.uint8)
        fill_disc(bd, 3.5, 3.5, 2.3 - idx * 0.3, C["CRIM_6"])
        put_px(bd, 3, 3, C["PORC_5"])
        save_outlined(bd, out_dir / f"blood_drop_{idx}.png")

        splat = np.zeros((6, 16, 4), dtype=np.uint8)
        fill_rect_px(splat, 2 + idx, 3, 12 - idx * 2, 2, C["CRIM_5"])
        fill_rect_px(splat, 5, 2, 6, 1, C["PORC_4"])
        save_outlined(splat, out_dir / f"blood_splat_{idx}.png")

        spk = np.zeros((6, 12, 4), dtype=np.uint8)
        fill_rect_px(spk, 1, 2, 10 - idx * 2, 2, C["EMBER_4"])
        fill_rect_px(spk, 4, 2, 6 - idx, 2, C["GOLD"])
        put_px(spk, 9 - idx, 2, C["PORC_5"])
        save_outlined(spk, out_dir / f"brass_spark_{idx}.png")


def build_weapon_icons_sheet(raw_png: Path) -> None:
    sheet = np.zeros((32, 320, 4), dtype=np.uint8)
    for slot in range(10):
        sheet[0:32, slot * 32 : (slot + 1) * 32] = draw_weapon_art_32(slot, True)
    raw_png.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, mode="RGBA").save(raw_png)


def build_sparring_enemy_frames(out_dir: Path) -> None:
    # 1. mob_01_slag_husk (64x64): Corrupted miner fused with black slag & glowing ember cracks
    husk_poses = [
        ("slag_husk_idle_0", 0, 0, -25),
        ("slag_husk_idle_1", 0, 1, -20),
        ("slag_husk_walk_0", -2, 0, -30),
        ("slag_husk_walk_1", 2, 0, -15),
        ("slag_husk_windup_0", -2, -1, -115),
        ("slag_husk_slash_0", 4, 1, 28),
        ("slag_husk_hurt_0", -4, 1, -60),
    ]
    for name, lean_x, bob_y, pick_deg in husk_poses:
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        cx = 30 + lean_x
        # Boots & legs (foot-aligned at y=62 so 1px outline touches y=63)
        leg_off = 3 if "walk_0" in name else (-3 if "walk_1" in name else 0)
        fill_rect_px(arr, cx - 7 + leg_off, 50, 5, 13, C["SLATE_2"])
        fill_rect_px(arr, cx + 2 - leg_off, 50, 5, 13, C["SLATE_3"])
        # Hunched slag-encrusted torso + glowing furnace ember cracks
        for y in range(30 + bob_y, 51):
            w = 15 if y < 44 else 12
            fill_rect_px(arr, cx - w // 2, y, w, 1, C["SLATE_2"] if y % 2 == 0 else C["SLATE_3"])
        draw_thick_segment(arr, cx - 2, 34 + bob_y, cx + 3, 44 + bob_y, 1.1, C["EMBER_3"], C["GOLD"])
        put_px(arr, cx + 1, 38 + bob_y, C["PORC_5"])
        # Corrupted miner helmet head with glowing ember eye
        fill_disc(arr, cx + 2, 26 + bob_y, 5.2, C["BRASS_2"])
        fill_rect_px(arr, cx - 2, 23 + bob_y, 9, 2, C["BRASS_4"])
        put_px(arr, cx + 5, 26 + bob_y, C["GOLD"] if "windup" in name else C["EMBER_4"])
        # Rusted Iron Pickaxe
        rad = math.radians(pick_deg)
        hx = cx + 4 + int(round(16 * math.cos(rad)))
        hy = 36 + bob_y + int(round(16 * math.sin(rad)))
        draw_thick_segment(arr, cx + 2, 37 + bob_y, hx, hy, 1.3, C["BRASS_3"], C["BRASS_5"])
        p_rad = rad + math.pi * 0.5
        draw_thick_segment(
            arr,
            hx - 6 * math.cos(p_rad),
            hy - 6 * math.sin(p_rad),
            hx + 7 * math.cos(p_rad),
            hy + 7 * math.sin(p_rad),
            1.5,
            C["CRIM_4"] if "slash" not in name else C["EMBER_4"],
            C["PORC_4"],
        )
        save_outlined(arr, out_dir / f"{name}.png")

    # 2. mob_05_brass_sentinel (80x80): Clockwork phalanx knight with riveted brass tower shield
    sent_poses = [
        ("brass_sentinel_idle_0", 0, 12, False, False),
        ("brass_sentinel_idle_1", 0, 12, False, False),
        ("brass_sentinel_march_0", 2, 13, False, False),
        ("brass_sentinel_march_1", -1, 12, False, False),
        ("brass_sentinel_windup_0", -3, 10, True, False),
        ("brass_sentinel_charge_0", 6, 16, True, False),
        ("brass_sentinel_stun_0", -4, -6, False, True),
    ]
    for idx, (name, body_dx, shield_dx, jet_on, stunned) in enumerate(sent_poses):
        arr = np.zeros((80, 80, 4), dtype=np.uint8)
        cx = 36 + body_dx
        top_y = 32 if stunned else (24 + (idx % 2))
        # Armored greaves touching y=78 (outline at y=79)
        fill_rect_px(arr, cx - 9, 58, 7, 21, C["BRASS_2"])
        fill_rect_px(arr, cx + 2, 58, 7, 21, C["BRASS_3"])
        fill_rect_px(arr, cx - 8, 62, 5, 3, C["GOLD"])
        fill_rect_px(arr, cx + 3, 62, 5, 3, C["GOLD"])
        # Heavy clockwork torso + back steam thruster
        fill_rect_px(arr, cx - 10, top_y + 10, 20, 25, C["SLATE_3"])
        fill_rect_px(arr, cx - 8, top_y + 12, 16, 10, C["BRASS_4"])
        fill_rect_px(arr, cx - 15, top_y + 14, 5, 14, C["BRASS_2"])
        if jet_on:
            draw_thick_segment(arr, cx - 16, top_y + 20, cx - 27, top_y + 22, 2.6, C["EMBER_4"], C["GOLD"])
        # Crested Phalanx Helm
        fill_rect_px(arr, cx - 6, top_y, 13, 11, C["BRASS_4"])
        fill_rect_px(arr, cx - 4, top_y - 4, 9, 4, C["GOLD"])
        fill_rect_px(arr, cx + 1, top_y + 4, 5, 2, C["CYAN"] if not stunned else C["CRIM_6"])
        if stunned:
            put_px(arr, cx - 5, top_y - 7, C["GOLD"])
            put_px(arr, cx + 6, top_y - 8, C["PORC_5"])
        # Massive Riveted Brass Tower Shield (front +X side unless knocked open on stun)
        sx = cx + shield_dx
        sy0 = 42 if stunned else 28
        sh_h = 34
        fill_rect_px(arr, sx, sy0, 9, sh_h, C["BRASS_3"])
        fill_rect_px(arr, sx + 2, sy0 + 2, 6, sh_h - 4, C["BRASS_5"])
        fill_rect_px(arr, sx + 6, sy0 + 2, 2, sh_h - 4, C["GOLD"])
        for ry in range(sy0 + 4, sy0 + sh_h - 3, 7):
            put_px(arr, sx + 4, ry, C["PORC_5"])
        save_outlined(arr, out_dir / f"{name}.png")


def quantize_and_normal(root: Path, py: str, raw_in: Path, quant_out: Path, strength: float = 2.4) -> None:
    subprocess.run(
        [
            py,
            str(root / "tools/asset-factory/quantize_palette.py"),
            "--input",
            str(raw_in),
            "--output",
            str(quant_out),
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
            str(quant_out),
            "--strength",
            str(strength),
        ],
        check=True,
    )


def run_pipeline() -> None:
    root = Path(__file__).resolve().parents[2]
    py = sys.executable

    # 1. weapons_fx_atlas (pivot 0.5, 0.5)
    raw_wpn = root / ".tmp/raw_assets/m5_weapons_fx"
    quant_wpn = root / ".tmp/quantized/m5_weapons_fx"
    raw_wpn.mkdir(parents=True, exist_ok=True)
    quant_wpn.mkdir(parents=True, exist_ok=True)
    for old in [*raw_wpn.glob("*.png"), *quant_wpn.glob("*.png")]:
        old.unlink()

    build_weapons_and_vfx_frames(raw_wpn)
    quantize_and_normal(root, py, raw_wpn, quant_wpn, 2.4)
    subprocess.run(
        [
            "node",
            str(root / "tools/asset-factory/pack_multiatlas.mjs"),
            "--src",
            str(quant_wpn),
            "--out",
            str(root / "public/assets/atlases/weapons_fx_atlas"),
            "--no-trim",
            "--pivot-x",
            "0.5",
            "--pivot-y",
            "0.5",
        ],
        check=True,
    )

    # 2. weapon_icons_sheet (320x32 UI sprite strip + normal map pair)
    raw_icons = root / ".tmp/raw_assets/m5_ui_icons/weapon_icons_sheet.png"
    out_icons = root / "public/assets/atlases/weapon_icons_sheet.png"
    build_weapon_icons_sheet(raw_icons)
    quantize_and_normal(root, py, raw_icons, out_icons, 2.2)

    # 3. m5_enemies_atlas (Slag Husk & Brass Sentinel, foot-center pivot 0.5, 1.0)
    raw_enm = root / ".tmp/raw_assets/m5_enemies"
    quant_enm = root / ".tmp/quantized/m5_enemies"
    raw_enm.mkdir(parents=True, exist_ok=True)
    quant_enm.mkdir(parents=True, exist_ok=True)
    for old in [*raw_enm.glob("*.png"), *quant_enm.glob("*.png")]:
        old.unlink()

    build_sparring_enemy_frames(raw_enm)
    quantize_and_normal(root, py, raw_enm, quant_enm, 2.5)
    subprocess.run(
        [
            "node",
            str(root / "tools/asset-factory/pack_multiatlas.mjs"),
            "--src",
            str(quant_enm),
            "--out",
            str(root / "public/assets/atlases/m5_enemies_atlas"),
            "--no-trim",
            "--pivot-x",
            "0.5",
            "--pivot-y",
            "1.0",
        ],
        check=True,
    )
    print("✅ Synthesized, quantized, normal-mapped, and packed all Milestone 5 combat atlases!")


if __name__ == "__main__":
    run_pipeline()
