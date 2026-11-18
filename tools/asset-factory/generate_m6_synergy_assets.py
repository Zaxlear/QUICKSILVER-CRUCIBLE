#!/usr/bin/env python3
"""
Milestone 6 Asset Factory Synthesizer:
Generates 48-color Dark Alchemy pixel-art frames & paired OpenGL tangent-space normal maps (*_n.png) for:
  1. synergy_fx_atlas (6 new weapons #03/#05/#06/#08/#09/#12, weapon smears & magma shockwaves,
     3 homing prism beams, Black-Fire Violet Napalm purple flame pools, Brass Tesla Turret + blue tether beam,
     Clockwork Saw Traps, Cryo Nova, Aegis Dome, 6 Elemental Aura particles, and Mutation Forge Crucible Altar)
  2. weapon_icons_sheet (expanded 1088x32 = 34 slots of 32x32 crisp UI icons:
     slots 0..9 M5 icons, 10..15 new 6 weapons, 16..21 6 active skills, 22..33 12 mutations)

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

from generate_m5_combat_assets import draw_weapon_art_32 as draw_m5_slot_32
from generate_m5_combat_assets import fill_disc, fill_rect_px, quantize_and_normal, save_outlined
from generate_sprite import C, add_1px_outline, draw_thick_segment, put_px

VIOLET_0 = (59, 7, 100, 255)    # #3B0764
VIOLET_1 = (109, 40, 217, 255)  # #6D28D9
VIOLET_2 = (168, 85, 247, 255)  # #A855F7
ACID_4 = (34, 197, 94, 255)     # #22C55E
ACID_6 = (163, 230, 53, 255)    # #A3E635


def frame_box_32(border_col: tuple[int, int, int, int]) -> np.ndarray:
    canvas = np.zeros((32, 32, 4), dtype=np.uint8)
    for y in range(2, 30):
        for x in range(2, 30):
            ch = abs(x - 15.5) + abs(y - 15.5)
            if ch <= 23.5:
                if ch >= 22.0 or x in (2, 29) or y in (2, 29):
                    canvas[y, x] = border_col
                else:
                    canvas[y, x] = C["SLATE_1"] if (x + y) % 2 == 0 else C["SLATE_0"]
    return canvas


def compose_icon_32(fg: np.ndarray, border_col: tuple[int, int, int, int] | None) -> np.ndarray:
    outlined = add_1px_outline(fg, C["OUTLINE"])
    if border_col is None:
        return outlined
    bg = frame_box_32(border_col)
    mask = outlined[:, :, 3] > 0
    bg[mask] = outlined[mask]
    return add_1px_outline(bg, C["OUTLINE"])


def draw_m6_icon_or_world_32(slot: int, with_bg: bool) -> np.ndarray:
    if slot < 10:
        return draw_m5_slot_32(slot, with_bg)

    fg = np.zeros((32, 32, 4), dtype=np.uint8)
    bcol = C["BRASS_5"]

    if slot == 10:
        # wpn_cinnabar_twinblades: Paired curved vermilion dual daggers
        bcol = C["CRIM_6"]
        for off, col_hi in ((-3, C["CRIM_7"]), (4, C["GOLD"])):
            draw_thick_segment(fg, 6 + off, 25, 11 + off, 20, 1.3, C["BRASS_4"], C["GOLD"])
            for t in range(12):
                px = int(round(11 + off + t * 1.1))
                py = int(round(20 - t * 1.2 - math.sin(t * 0.3) * 2.2))
                fill_disc(fg, px, py, 1.4, C["CRIM_6"] if t < 9 else col_hi)
    elif slot == 11:
        # wpn_crucible_maul: Cage iron war maul holding molten crucible core
        bcol = C["ACID_5"]
        draw_thick_segment(fg, 5, 26, 17, 14, 1.6, C["BRASS_3"], C["BRASS_5"])
        fill_rect_px(fg, 14, 5, 12, 11, C["SLATE_4"])
        fill_rect_px(fg, 16, 7, 8, 7, C["EMBER_4"])
        fill_disc(fg, 20, 10.5, 2.5, C["GOLD"])
        put_px(fg, 20, 10, C["PORC_5"])
    elif slot == 12:
        # wpn_pendulum_halberd: Long cathedral pendulum glaive with crescent gilded blade
        bcol = C["GOLD"]
        draw_thick_segment(fg, 5, 27, 25, 7, 1.3, C["PORC_2"], C["PORC_4"])
        for a in range(-55, 66, 6):
            rad = math.radians(a - 45)
            for r in (5.5, 7.2):
                put_px(fg, int(round(19 + r * math.cos(rad))), int(round(13 + r * math.sin(rad))), C["GOLD"] if r > 6 else C["BRASS_5"])
        put_px(fg, 26, 6, C["PORC_5"])
    elif slot == 13:
        # wpn_clockwork_repeater: Heavy repeating arbalest crossbow with brass gear drum
        bcol = C["GOLD"]
        draw_thick_segment(fg, 6, 23, 24, 9, 1.8, C["BRASS_3"], C["BRASS_5"])
        draw_thick_segment(fg, 15, 5, 26, 18, 1.4, C["SLATE_5"], C["PORC_3"])
        fill_disc(fg, 15, 16, 3.6, C["GOLD"])
        fill_disc(fg, 15, 16, 1.5, C["BRASS_2"])
        draw_thick_segment(fg, 16, 15, 26, 7, 1.0, C["CYAN"], C["PORC_5"])
    elif slot == 14:
        # wpn_vitriol_thrower: Volatile spherical glass retort flasks bubbling green-orange acid fire
        bcol = C["ACID_5"]
        fill_disc(fg, 15.5, 17.5, 6.8, C["ACID_3"])
        fill_disc(fg, 15.5, 18.5, 5.2, C["ACID_5"])
        fill_disc(fg, 16.5, 16.5, 2.8, C["EMBER_4"])
        fill_rect_px(fg, 14, 7, 4, 4, C["BRASS_5"])
        put_px(fg, 13, 14, C["PORC_5"])
        put_px(fg, 18, 13, C["GOLD"])
    elif slot == 15:
        # wpn_mirror_aegis: Oval liquid quicksilver mirror shield framed in porcelain & gold wings
        bcol = C["CYAN"]
        for y in range(5, 27):
            for x in range(7, 25):
                d = ((x - 15.5) / 7.8) ** 2 + ((y - 16.0) / 9.8) ** 2
                if d <= 1.0:
                    if d >= 0.72:
                        fg[y, x] = C["GOLD"] if y < 14 else C["PORC_4"]
                    else:
                        fg[y, x] = C["PORC_5"] if (x + y) % 5 == 0 else (C["CYAN"] if x < 16 else C["PORC_3"])
        draw_thick_segment(fg, 6, 11, 9, 7, 1.2, C["GOLD"], C["PORC_5"])
        draw_thick_segment(fg, 25, 11, 22, 7, 1.2, C["GOLD"], C["PORC_5"])
    elif slot == 16:
        # skl_vitriol_flask: Black-Fire Violet Napalm canister
        bcol = VIOLET_2
        fill_disc(fg, 15.5, 18, 6.5, VIOLET_0)
        fill_disc(fg, 15.5, 17, 4.6, VIOLET_2)
        fill_disc(fg, 15.5, 11, 3.0, C["EMBER_4"])
        put_px(fg, 15, 10, C["GOLD"])
        put_px(fg, 14, 16, C["PORC_5"])
    elif slot == 17:
        # skl_clockwork_saw_trap: Brass toothed bear trap
        bcol = C["GOLD"]
        fill_rect_px(fg, 6, 19, 20, 4, C["BRASS_4"])
        for tx in range(7, 25, 4):
            draw_thick_segment(fg, tx, 19, tx + 1, 12, 1.1, C["PORC_3"], C["PORC_5"])
        fill_disc(fg, 16, 20, 2.8, C["GOLD"])
    elif slot == 18:
        # skl_tesla_coil_turret: Brass Tesla turret with cyan arc
        bcol = C["CYAN"]
        draw_thick_segment(fg, 9, 26, 16, 16, 1.4, C["BRASS_4"], C["GOLD"])
        draw_thick_segment(fg, 23, 26, 16, 16, 1.4, C["BRASS_4"], C["GOLD"])
        fill_rect_px(fg, 13, 10, 6, 9, C["BRASS_5"])
        fill_disc(fg, 16, 8, 3.4, C["CYAN"])
        put_px(fg, 16, 8, C["PORC_5"])
    elif slot == 19:
        # skl_cryo_mercury_nova: Liquid nitrogen frost burst star
        bcol = C["CYAN"]
        draw_thick_segment(fg, 6, 16, 26, 16, 1.4, C["CYAN"], C["PORC_5"])
        draw_thick_segment(fg, 16, 6, 16, 26, 1.4, C["CYAN"], C["PORC_5"])
        draw_thick_segment(fg, 9, 9, 23, 23, 1.2, C["PORC_2"], C["PORC_5"])
        draw_thick_segment(fg, 23, 9, 9, 23, 1.2, C["PORC_2"], C["PORC_5"])
    elif slot == 20:
        # skl_crimson_transfusion: Pierced rubedo mercury core
        bcol = C["CRIM_6"]
        fill_disc(fg, 16, 16, 6.5, C["CRIM_4"])
        fill_disc(fg, 16, 16, 4.0, C["CRIM_6"])
        draw_thick_segment(fg, 7, 7, 25, 25, 1.2, C["PORC_4"], C["PORC_5"])
        put_px(fg, 15, 14, C["GOLD"])
    elif slot == 21:
        # skl_aegis_tonics: Philosopher's Mercury Urn + refract ring
        bcol = C["ACID_5"]
        for a in range(0, 360, 14):
            rad = math.radians(a)
            put_px(fg, int(round(16 + 9.5 * math.cos(rad))), int(round(16 + 9.5 * math.sin(rad))), C["CYAN"])
        fill_rect_px(fg, 12, 12, 8, 11, C["PORC_4"])
        fill_rect_px(fg, 13, 8, 6, 4, C["GOLD"])
        fill_disc(fg, 16, 17, 2.5, C["ACID_5"])
    else:
        # Slots 22..33: 12 Mutations (22..25 Rubedo, 26..29 Citrinitas, 30..33 Albedo)
        mut_idx = slot - 22
        if mut_idx < 4:
            bcol, core_c, hi_c = C["CRIM_6"], C["CRIM_5"], C["CRIM_7"]
        elif mut_idx < 8:
            bcol, core_c, hi_c = C["GOLD"], C["BRASS_6"], C["PORC_5"]
        else:
            bcol, core_c, hi_c = C["ACID_5"], C["ACID_3"], C["CYAN"]
        fill_disc(fg, 16, 16, 7.2, C["SLATE_3"])
        fill_disc(fg, 16, 16, 5.2, core_c)
        sub = mut_idx % 4
        if sub == 0:
            draw_thick_segment(fg, 10, 21, 22, 11, 1.5, hi_c, C["PORC_5"])
        elif sub == 1:
            draw_thick_segment(fg, 11, 11, 21, 21, 1.3, hi_c, C["PORC_5"])
            draw_thick_segment(fg, 21, 11, 11, 21, 1.3, hi_c, C["PORC_5"])
        elif sub == 2:
            fill_disc(fg, 16, 16, 2.6, C["PORC_5"])
            for a in range(0, 360, 45):
                r = math.radians(a)
                put_px(fg, int(round(16 + 6.5 * math.cos(r))), int(round(16 + 6.5 * math.sin(r))), hi_c)
        else:
            fill_rect_px(fg, 13, 10, 6, 12, hi_c)
            fill_rect_px(fg, 10, 13, 12, 6, C["PORC_5"])

    return compose_icon_32(fg, bcol if with_bg else None)


def build_expanded_weapon_icons_sheet(raw_png: Path) -> None:
    total_slots = 34
    sheet = np.zeros((32, total_slots * 32, 4), dtype=np.uint8)
    for slot in range(total_slots):
        sheet[0:32, slot * 32 : (slot + 1) * 32] = draw_m6_icon_or_world_32(slot, True)
    raw_png.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, mode="RGBA").save(raw_png)


def build_synergy_fx_frames(out_dir: Path) -> None:
    # 1. 6 new M6 weapon world sprites + Black-Fire flask sprite
    new_wpns = [
        (10, "wpn_cinnabar_twinblades"),
        (11, "wpn_crucible_maul"),
        (12, "wpn_pendulum_halberd"),
        (13, "wpn_clockwork_repeater"),
        (14, "wpn_vitriol_thrower"),
        (15, "wpn_mirror_aegis"),
        (16, "skl_vitriol_flask"),
    ]
    for slot, name in new_wpns:
        Image.fromarray(draw_m6_icon_or_world_32(slot, False), mode="RGBA").save(out_dir / f"{name}.png")

    # 2. Twinblades crossing scarlet X-slash arcs (52x40)
    for idx in range(2):
        arr = np.zeros((40, 52, 4), dtype=np.uint8)
        draw_thick_segment(arr, 8, 6 + idx * 3, 44, 34 - idx * 3, 2.2, C["CRIM_6"], C["PORC_5"])
        draw_thick_segment(arr, 10, 34 - idx * 3, 45, 7 + idx * 3, 2.0, C["EMBER_4"], C["GOLD"])
        save_outlined(arr, out_dir / f"slash_twinblades_{idx}.png")

    # 3. Crucible Maul ground-shattering magma shockwave (96x40)
    for idx in range(2):
        arr = np.zeros((40, 96, 4), dtype=np.uint8)
        fill_rect_px(arr, 6, 33, 84, 4, C["EMBER_3"])
        for spike in range(5):
            sx = 14 + spike * 17 + idx * 3
            sh = 12 + (spike % 3) * 6
            draw_thick_segment(arr, sx, 35, sx + 5, 35 - sh, 2.6, C["EMBER_4"], C["GOLD"])
            put_px(arr, sx + 5, 35 - sh, C["PORC_5"])
        save_outlined(arr, out_dir / f"maul_shockwave_{idx}.png")

    # 4. Pendulum Halberd wide golden crescent outer-edge sweep (96x52)
    for idx in range(2):
        arr = np.zeros((52, 96, 4), dtype=np.uint8)
        for a in range(-62, 63, 2):
            rad = math.radians(a)
            for r in range(28, 39 - idx * 3):
                px = int(round(36 + r * 1.42 * math.cos(rad)))
                py = int(round(26 + r * 0.62 * math.sin(rad)))
                put_px(arr, px, py, C["PORC_5"] if r >= 35 - idx * 2 else (C["GOLD"] if r >= 31 else C["BRASS_5"]))
        save_outlined(arr, out_dir / f"sweep_halberd_{idx}.png")

    # 5. Clockwork Repeater bolt (22x7), Vitriol flask (16x16), Mirror Aegis Homing Prism Beam (38x14)
    bolt = np.zeros((7, 22, 4), dtype=np.uint8)
    fill_rect_px(bolt, 2, 2, 13, 3, C["BRASS_6"])
    draw_thick_segment(bolt, 14, 1, 20, 3, 1.2, C["CYAN"], C["PORC_5"])
    save_outlined(bolt, out_dir / "proj_repeater_bolt.png")

    vflask = np.zeros((16, 16, 4), dtype=np.uint8)
    fill_disc(vflask, 7.5, 8.5, 5.0, C["ACID_5"])
    fill_disc(vflask, 8.5, 7.5, 2.4, C["EMBER_4"])
    fill_rect_px(vflask, 6, 2, 4, 2, C["GOLD"])
    save_outlined(vflask, out_dir / "proj_vitriol_flask.png")

    for idx in range(2):
        beam = np.zeros((14, 38, 4), dtype=np.uint8)
        draw_thick_segment(beam, 3, 7, 34, 7, 2.6 - idx * 0.4, C["CYAN"], C["PORC_5"])
        draw_thick_segment(beam, 20, 3, 34, 7, 1.3, VIOLET_2, C["PORC_5"])
        draw_thick_segment(beam, 20, 11, 34, 7, 1.3, VIOLET_2, C["PORC_5"])
        save_outlined(beam, out_dir / f"proj_aegis_prism_beam_{idx}.png")

    # 6. Saw Trap (34x18), Brass Tesla Turret (36x48) & High-Voltage Blue Tether Beam (56x16)
    trap_open = np.zeros((18, 34, 4), dtype=np.uint8)
    fill_rect_px(trap_open, 3, 13, 28, 3, C["BRASS_4"])
    for tx in range(5, 29, 5):
        draw_thick_segment(trap_open, tx, 13, tx + 1, 7, 1.1, C["PORC_4"], C["PORC_5"])
    fill_disc(trap_open, 17, 14, 2.5, C["GOLD"])
    save_outlined(trap_open, out_dir / "saw_trap_armed_0.png")

    trap_snap = np.zeros((18, 34, 4), dtype=np.uint8)
    draw_thick_segment(trap_snap, 7, 15, 16, 4, 2.0, C["PORC_3"], C["CRIM_6"])
    draw_thick_segment(trap_snap, 27, 15, 18, 4, 2.0, C["PORC_3"], C["CRIM_6"])
    fill_disc(trap_snap, 17, 14, 3.0, C["GOLD"])
    save_outlined(trap_snap, out_dir / "saw_trap_snapped_0.png")

    for idx in range(2):
        tur = np.zeros((48, 36, 4), dtype=np.uint8)
        draw_thick_segment(tur, 6, 45, 18, 26, 2.0, C["BRASS_3"], C["BRASS_5"])
        draw_thick_segment(tur, 30, 45, 18, 26, 2.0, C["BRASS_3"], C["BRASS_5"])
        fill_rect_px(tur, 13, 16, 10, 15, C["BRASS_4"])
        fill_rect_px(tur, 11, 20, 14, 3, C["GOLD"])
        fill_rect_px(tur, 11, 26, 14, 3, C["GOLD"])
        fill_disc(tur, 18, 10, 5.2 + idx * 0.6, C["CYAN"])
        fill_disc(tur, 18, 10, 2.4, C["PORC_5"])
        save_outlined(tur, out_dir / f"tesla_turret_idle_{idx}.png")

        tether = np.zeros((16, 56, 4), dtype=np.uint8)
        py_prev = 8
        for x in range(2, 53, 5):
            ny = 8 + (((x // 5 + idx * 2) % 3) - 1) * 4
            draw_thick_segment(tether, x, py_prev, x + 5, ny, 1.8, C["CYAN"], C["PORC_5"])
            py_prev = ny
        save_outlined(tether, out_dir / f"tesla_tether_beam_{idx}.png")

    # 7. Violet Napalm Purple Flames (64x30), Acid Fire Pool (56x22), Toxic Cloud (64x28)
    for idx in range(2):
        nap = np.zeros((30, 64, 4), dtype=np.uint8)
        fill_rect_px(nap, 4, 24, 56, 4, VIOLET_0)
        for fx in range(8, 58, 7):
            fh = 11 + ((fx + idx * 5) % 11)
            draw_thick_segment(nap, fx, 25, fx + (idx * 2 - 1), 25 - fh, 3.0, VIOLET_1, VIOLET_2)
            put_px(nap, fx, max(2, 25 - fh), C["PORC_5"])
        save_outlined(nap, out_dir / f"pool_violet_napalm_{idx}.png")

        afire = np.zeros((22, 56, 4), dtype=np.uint8)
        fill_rect_px(afire, 4, 17, 48, 3, C["ACID_3"])
        for fx in range(8, 50, 8):
            fh = 8 + ((fx + idx * 3) % 7)
            draw_thick_segment(afire, fx, 18, fx, 18 - fh, 2.2, C["ACID_5"], C["EMBER_4"])
        save_outlined(afire, out_dir / f"pool_vitriol_fire_{idx}.png")

        tcloud = np.zeros((28, 64, 4), dtype=np.uint8)
        for cx, cy, r in ((16, 17, 7), (31, 14, 9), (47, 17, 7)):
            fill_disc(tcloud, cx + idx, cy, r, C["ACID_3"])
            fill_disc(tcloud, cx + idx, cy - 1, r * 0.55, C["ACID_5"])
        save_outlined(tcloud, out_dir / f"pool_toxic_cloud_{idx}.png")

    # 8. Cryo Nova Ring (88x38), Crimson Mist (36x36), Aegis Dome (56x56), Reaction Burst (48x48)
    cryo = np.zeros((38, 88, 4), dtype=np.uint8)
    for a in range(0, 360, 8):
        r = math.radians(a)
        put_px(cryo, int(round(44 + 38 * math.cos(r))), int(round(19 + 13 * math.sin(r))), C["CYAN"])
        put_px(cryo, int(round(44 + 35 * math.cos(r))), int(round(19 + 11 * math.sin(r))), C["PORC_5"])
    save_outlined(cryo, out_dir / "cryo_nova_ring_0.png")

    mist = np.zeros((36, 36, 4), dtype=np.uint8)
    for a in range(0, 360, 30):
        r = math.radians(a)
        fill_disc(mist, 18 + 9 * math.cos(r), 18 + 9 * math.sin(r), 3.2, C["CRIM_6"])
    fill_disc(mist, 18, 18, 4.5, C["CRIM_7"])
    save_outlined(mist, out_dir / "crimson_mist_0.png")

    dome = np.zeros((56, 56, 4), dtype=np.uint8)
    for a in range(0, 360, 6):
        r = math.radians(a)
        put_px(dome, int(round(28 + 23 * math.cos(r))), int(round(28 + 23 * math.sin(r))), C["CYAN"])
        if a % 30 == 0:
            put_px(dome, int(round(28 + 21 * math.cos(r))), int(round(28 + 21 * math.sin(r))), C["PORC_5"])
    save_outlined(dome, out_dir / "aegis_urn_dome_0.png")

    rburst = np.zeros((48, 48, 4), dtype=np.uint8)
    for a in range(0, 360, 12):
        r = math.radians(a)
        draw_thick_segment(rburst, 24 + 8 * math.cos(r), 24 + 8 * math.sin(r), 24 + 20 * math.cos(r), 24 + 20 * math.sin(r), 1.2, VIOLET_2 if a % 24 == 0 else C["GOLD"], C["PORC_5"])
    save_outlined(rburst, out_dir / "react_burst_ring_0.png")

    # 9. 6 Elemental Aura attached droplets/sparks (12x12)
    aura_specs = [
        ("elem_oiled_0", VIOLET_0, VIOLET_2),
        ("elem_ignited_0", C["EMBER_4"], C["GOLD"]),
        ("elem_violet_0", VIOLET_1, C["PORC_5"]),
        ("elem_bleeding_0", C["CRIM_6"], C["CRIM_7"]),
        ("elem_frozen_0", C["CYAN"], C["PORC_5"]),
        ("elem_electrified_0", C["CYAN"], C["GOLD"]),
        ("elem_poisoned_0", C["ACID_5"], ACID_6),
    ]
    for name, c_main, c_hi in aura_specs:
        ep = np.zeros((12, 12, 4), dtype=np.uint8)
        fill_disc(ep, 5.5, 5.5, 3.4, c_main)
        put_px(ep, 5, 4, c_hi)
        put_px(ep, 6, 5, C["PORC_5"])
        save_outlined(ep, out_dir / f"{name}.png")

    # 10. Mutation & Eternal Forge Crucible Altar (48x56)
    for idx in range(2):
        alt = np.zeros((56, 48, 4), dtype=np.uint8)
        fill_rect_px(alt, 6, 46, 36, 8, C["SLATE_3"])
        fill_rect_px(alt, 10, 32, 28, 15, C["BRASS_3"])
        fill_rect_px(alt, 12, 34, 24, 4, C["GOLD"])
        fill_disc(alt, 24, 24, 9.5, C["SLATE_4"])
        fill_disc(alt, 24, 22, 6.5, VIOLET_2 if idx == 0 else C["EMBER_4"])
        fill_disc(alt, 24, 20, 3.2, C["GOLD"])
        put_px(alt, 24, 19, C["PORC_5"])
        save_outlined(alt, out_dir / f"forge_crucible_altar_{idx}.png")


def run_pipeline() -> None:
    root = Path(__file__).resolve().parents[2]
    py = sys.executable

    raw_syn = root / ".tmp/raw_assets/m6_synergy_fx"
    quant_syn = root / ".tmp/quantized/m6_synergy_fx"
    raw_syn.mkdir(parents=True, exist_ok=True)
    quant_syn.mkdir(parents=True, exist_ok=True)
    for old in [*raw_syn.glob("*.png"), *quant_syn.glob("*.png")]:
        old.unlink()

    build_synergy_fx_frames(raw_syn)
    quantize_and_normal(root, py, raw_syn, quant_syn, 2.4)
    subprocess.run(
        [
            "node",
            str(root / "tools/asset-factory/pack_multiatlas.mjs"),
            "--src",
            str(quant_syn),
            "--out",
            str(root / "public/assets/atlases/synergy_fx_atlas"),
            "--no-trim",
            "--pivot-x",
            "0.5",
            "--pivot-y",
            "0.5",
        ],
        check=True,
    )

    raw_icons = root / ".tmp/raw_assets/m6_ui_icons/weapon_icons_sheet.png"
    out_icons = root / "public/assets/atlases/weapon_icons_sheet.png"
    build_expanded_weapon_icons_sheet(raw_icons)
    quantize_and_normal(root, py, raw_icons, out_icons, 2.2)

    print("✅ Synthesized, quantized, normal-mapped, and packed all Milestone 6 synergy atlases & 34-slot UI icon sheet!")


if __name__ == "__main__":
    run_pipeline()
