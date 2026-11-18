#!/usr/bin/env python3
"""
Milestone 8 Asset Factory — Multi-Phase Bosses, Arena Hazards, Sanctum Hub & NPC Portraits:
  1. public/assets/atlases/bosses_atlas.{json,png,_n.png} (pivot 0.5, 1.0)
     - boss_01_furnace_warden (160x160): P1 jailer, 55% HP chest-rip roar, P2 dual-chain incinerator
     - boss_02_grand_alchemist: P1 sovereign (80x80), P2 clockwork seraphim colossus (192x192), P3 mirror swordsman (80x80)
  2. public/assets/atlases/boss_fx_atlas.{json,png,_n.png} (pivot 0.5, 0.5)
     - 4-gate furnace grates, 320px astrolabe & sweeping laser, porcelain platforms, quicksilver sea & blade forest
  3. public/assets/atlases/sanctum_hub_atlas.{json,png,_n.png} (pivot 0.5, 1.0)
     - Corvus, Isolde, Sister Vesper, 12-weapon hanging glass tubes, Athanor hearth, 3-seal monument, departure tube
  4. public/assets/atlases/npc_portraits_sheet.{png,_n.png} (192x32 = 6 x 32x32 crisp pixel portraits)
"""
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
from generate_m5_combat_assets import fill_disc, fill_rect_px, quantize_and_normal, save_outlined
from generate_sprite import C, add_1px_outline, draw_thick_segment, put_px

ACID_5 = (34, 197, 94, 255)
ACID_6 = (60, 230, 130, 255)
ACID_7 = (163, 230, 53, 255)
AETHER_1 = (109, 40, 217, 255)
AETHER_2 = (168, 85, 247, 255)


def fill_ring(arr: np.ndarray, cx: float, cy: float, r_in: float, r_out: float, col: tuple[int, int, int, int]) -> None:
    ri = int(math.ceil(r_out))
    for dy in range(-ri, ri + 1):
        for dx in range(-ri, ri + 1):
            d2 = dx * dx + dy * dy
            if r_in * r_in <= d2 <= r_out * r_out:
                put_px(arr, int(round(cx + dx)), int(round(cy + dy)), col)


def draw_sulfur_boss(out_dir: Path) -> None:
    p1_poses = ("p1_idle_0", "p1_idle_1", "p1_move_0", "p1_windup_0", "p1_attack_0", "p1_leap_0")
    p2_poses = ("roar_open_0", "p2_idle_0", "p2_move_0", "p2_windup_0", "p2_attack_0", "p2_whirl_0", "hurt_0")

    for pose in (*p1_poses, *p2_poses):
        arr = np.zeros((160, 160, 4), dtype=np.uint8)
        is_p2 = pose.startswith("p2_") or pose == "roar_open_0"
        is_roar = pose == "roar_open_0"
        is_hurt = pose == "hurt_0"
        is_whirl = pose == "p2_whirl_0"
        bob = 2 if pose.endswith("_1") else (-8 if pose == "p1_leap_0" else (8 if (is_roar or is_hurt) else 0))
        lean = 8 if "attack" in pose else (-5 if "windup" in pose else 0)
        cx = 78 + lean
        base_y = 156

        # Heavy riveted brass greaves & boots
        stride = 9 if "move" in pose else (12 if is_whirl else 0)
        fill_rect_px(arr, cx - 22 + stride // 2, base_y - 38 + max(0, bob // 2), 16, 38 - max(0, bob // 2), C["BRASS_2"])
        fill_rect_px(arr, cx + 6 - stride // 2, base_y - 38 + max(0, bob // 2), 16, 38 - max(0, bob // 2), C["BRASS_3"])
        fill_rect_px(arr, cx - 24 + stride // 2, base_y - 10, 20, 10, C["BRASS_4"])
        fill_rect_px(arr, cx + 5 - stride // 2, base_y - 10, 20, 10, C["BRASS_5"])

        # Hulk-sized armored torso & ribcage thurible furnace
        ty = 64 + bob
        fill_rect_px(arr, cx - 28, ty, 56, 56, C["SLATE_3"])
        fill_rect_px(arr, cx - 32, ty + 4, 64, 18, C["BRASS_3"])
        fill_rect_px(arr, cx - 30, ty + 6, 60, 6, C["BRASS_5"])

        if is_p2:
            # Ripped-open bronze chest doors + roaring orange-green sulfur fire core!
            fill_rect_px(arr, cx - 36, ty + 14, 12, 34, C["BRASS_4"])
            fill_rect_px(arr, cx + 24, ty + 14, 12, 34, C["BRASS_5"])
            fill_disc(arr, cx, ty + 31, 18.0, C["EMBER_3"])
            fill_disc(arr, cx, ty + 31, 12.5, C["EMBER_4"])
            fill_disc(arr, cx, ty + 30, 7.5, ACID_6 if is_roar else C["GOLD"])
            fill_disc(arr, cx, ty + 29, 3.5, C["PORC_5"])
            # Rib spikes & sulfur flame tongues
            for rx in (-14, -7, 7, 14):
                draw_thick_segment(arr, cx + rx, ty + 16, cx + rx, ty + 24, 1.5, C["GOLD"], C["PORC_4"])
            if is_roar:
                for ang in (-125, -95, -65, -40, -140):
                    rad = math.radians(ang)
                    draw_thick_segment(arr, cx, ty + 26, cx + 38 * math.cos(rad), ty + 26 + 38 * math.sin(rad), 2.8, C["EMBER_4"], ACID_6)
        else:
            # Closed bronze thurible cage bars with glowing coals behind
            fill_rect_px(arr, cx - 18, ty + 16, 36, 32, C["EMBER_1"])
            fill_disc(arr, cx, ty + 32, 11.0, C["EMBER_4"])
            for gx in range(-16, 18, 6):
                fill_rect_px(arr, cx + gx, ty + 15, 3, 34, C["BRASS_5"])
            fill_rect_px(arr, cx - 19, ty + 28, 38, 4, C["GOLD"])

        # Twin dorsal chimney stacks on shoulders
        for sx in (-22, 16):
            fill_rect_px(arr, cx + sx, ty - 18, 8, 20, C["BRASS_2"])
            fill_rect_px(arr, cx + sx - 1, ty - 20, 10, 4, C["BRASS_5"])
            fill_disc(arr, cx + sx + 4, ty - 24, 4.2, ACID_6 if is_p2 else C["EMBER_4"])

        # Horned warden helmet
        fill_rect_px(arr, cx - 12, ty - 16, 24, 18, C["BRASS_4"])
        fill_rect_px(arr, cx - 8, ty - 9, 18, 4, C["CRIM_6"] if is_hurt else C["GOLD"])
        draw_thick_segment(arr, cx - 11, ty - 12, cx - 20, ty - 26, 2.2, C["BRASS_5"], C["GOLD"])
        draw_thick_segment(arr, cx + 11, ty - 12, cx + 20, ty - 26, 2.2, C["BRASS_5"], C["GOLD"])

        # Chained giant thurible censer maul(s)
        if is_whirl:
            for side in (-1, 1):
                tx_end = cx + side * 62
                ty_end = ty + 26
                draw_thick_segment(arr, cx + side * 24, ty + 22, tx_end, ty_end, 2.2, C["SLATE_5"], C["PORC_3"])
                fill_disc(arr, tx_end, ty_end, 13.0, C["BRASS_4"])
                fill_disc(arr, tx_end, ty_end, 8.0, C["EMBER_4"])
                fill_disc(arr, tx_end, ty_end, 4.0, C["GOLD"])
        else:
            ang = -125 if "windup" in pose else (18 if "attack" in pose else (52 if is_hurt else 28))
            rad = math.radians(ang)
            mx = cx + 24 + int(42 * math.cos(rad))
            my = ty + 20 + int(42 * math.sin(rad))
            draw_thick_segment(arr, cx + 22, ty + 18, mx, my, 2.4, C["SLATE_5"], C["PORC_2"])
            fill_disc(arr, mx, my, 14.5, C["BRASS_4"])
            fill_ring(arr, mx, my, 11.0, 14.5, C["BRASS_6"])
            fill_disc(arr, mx, my, 7.5, ACID_6 if is_p2 else C["EMBER_4"])
            fill_disc(arr, mx, my, 3.5, C["PORC_5"])
            if is_p2 and not is_roar:
                # Secondary off-hand burning censer
                draw_thick_segment(arr, cx - 24, ty + 20, cx - 48, ty + 34, 2.0, C["SLATE_5"], C["GOLD"])
                fill_disc(arr, cx - 50, ty + 35, 10.5, C["BRASS_5"])
                fill_disc(arr, cx - 50, ty + 35, 5.5, C["EMBER_4"])

        save_outlined(arr, out_dir / f"boss_01_furnace_warden_{pose}.png")


def draw_paracelsus_boss(out_dir: Path) -> None:
    # 1. Phase 1 (80x80): Regal floating sovereign + 4 elemental alchemy orbs
    for pose in ("p1_idle_0", "p1_idle_1", "p1_windup_0", "p1_attack_0", "p1_hurt_0"):
        arr = np.zeros((80, 80, 4), dtype=np.uint8)
        hover = -4 if pose == "p1_idle_1" else (-6 if pose == "p1_windup_0" else (3 if pose == "p1_hurt_0" else -2))
        cx = 40
        ty = 26 + hover
        # Flowing white-gold porcelain robes tapering above ground
        for dy in range(44):
            hw = 6 + dy // 3
            col = C["PORC_4"] if dy < 26 else C["PORC_2"]
            fill_rect_px(arr, cx - hw, ty + dy, hw * 2, 1, col)
        fill_rect_px(arr, cx - 3, ty + 4, 6, 38, C["CRIM_5"])
        fill_rect_px(arr, cx - 12, ty + 2, 24, 8, C["GOLD"])
        # Sovereign crown & faceless porcelain mask
        fill_disc(arr, cx, ty - 6, 6.2, C["PORC_5"])
        fill_rect_px(arr, cx - 6, ty - 14, 12, 4, C["GOLD"])
        for hx in (-5, 0, 5):
            draw_thick_segment(arr, cx + hx, ty - 14, cx + hx, ty - 19, 1.0, C["GOLD"], C["PORC_5"])
        put_px(arr, cx, ty - 6, C["CRIM_6"])
        # 4 Orbiting Elemental Orbs (Fire, Ice, Volt, Acid)
        orb_r = 26 if pose == "p1_windup_0" else (30 if pose == "p1_attack_0" else 22)
        orbs = [(0, C["EMBER_4"]), (90, C["CYAN"]), (180, ACID_6), (270, AETHER_2)]
        phase_deg = 25 if pose.endswith("_1") else (45 if "attack" in pose else 0)
        for deg, ocol in orbs:
            rad = math.radians(deg + phase_deg)
            ox = cx + orb_r * math.cos(rad)
            oy = ty + 10 + orb_r * 0.55 * math.sin(rad)
            fill_disc(arr, ox, oy, 4.2, ocol)
            put_px(arr, int(round(ox)), int(round(oy)), C["PORC_5"])
        save_outlined(arr, out_dir / f"boss_02_grand_alchemist_{pose}.png")

    # 2. Phase 2 (192x192): Gigantic Ouroboros Clockwork-Seraphim Colossus + 3m Quicksilver Greatsword
    for pose in ("p2_idle_0", "p2_windup_0", "p2_slash_0", "p2_slam_0", "p2_laser_0", "p2_hurt_0"):
        arr = np.zeros((192, 192, 4), dtype=np.uint8)
        cx = 94 + (8 if pose == "p2_slash_0" else (-5 if pose == "p2_windup_0" else 0))
        cy = 88 + (6 if pose == "p2_hurt_0" else (-4 if pose == "p2_laser_0" else 0))

        # 6 Mechanical Golden Seraphim Wings + Ouroboros Halo Ring behind torso
        fill_ring(arr, cx, cy - 10, 44.0, 52.0, C["BRASS_5"])
        fill_ring(arr, cx, cy - 10, 47.0, 49.5, C["GOLD"])
        for side in (-1, 1):
            for w_idx, ang in enumerate((-28, 4, 34)):
                rad = math.radians(ang if side > 0 else 180 - ang)
                wx = cx + side * 26 + int(56 * math.cos(rad))
                wy = cy - 10 + int(42 * math.sin(rad))
                draw_thick_segment(arr, cx + side * 20, cy - 8 + w_idx * 8, wx, wy, 4.2, C["PORC_3"], C["GOLD"])
                draw_thick_segment(arr, cx + side * 24, cy - 2 + w_idx * 8, wx - side * 8, wy + 8, 2.5, C["BRASS_5"], C["PORC_5"])

        # Colossal White-Porcelain & Gilded-Brass Half-Body Chassis tapering into mercury spire base
        for dy in range(-20, 82):
            hw = max(8, 36 - abs(dy - 12) // 2)
            col = C["PORC_4"] if abs(dy) < 24 else (C["BRASS_4"] if dy > 44 else C["PORC_2"])
            fill_rect_px(arr, cx - hw, cy + dy, hw * 2, 1, col)
        # Exposed Philosopher's Stone Crimson-Mercury Core in chest
        fill_ring(arr, cx, cy + 12, 12.0, 17.5, C["GOLD"])
        fill_disc(arr, cx, cy + 12, 11.5, C["CRIM_6"] if pose != "p2_laser_0" else C["CYAN"])
        fill_disc(arr, cx, cy + 12, 5.5, C["PORC_5"])

        # Towering Crowned Seraphim Head
        fill_rect_px(arr, cx - 14, cy - 42, 28, 24, C["PORC_5"])
        fill_rect_px(arr, cx - 18, cy - 48, 36, 7, C["GOLD"])
        for spire_x in (-14, -7, 0, 7, 14):
            draw_thick_segment(arr, cx + spire_x, cy - 48, cx + spire_x, cy - 60 - (5 if spire_x == 0 else 0), 1.6, C["GOLD"], C["PORC_5"])
        fill_rect_px(arr, cx - 9, cy - 31, 18, 3, C["CRIM_6"])

        # 3-Meter Liquid Quicksilver Greatsword
        sw_deg = -115 if pose == "p2_windup_0" else (22 if pose == "p2_slash_0" else (78 if pose == "p2_slam_0" else (-65 if pose == "p2_laser_0" else -32)))
        srad = math.radians(sw_deg)
        sx0, sy0 = cx + 28, cy + 8
        sx1, sy1 = sx0 + int(74 * math.cos(srad)), sy0 + int(74 * math.sin(srad))
        draw_thick_segment(arr, sx0 - 8 * math.cos(srad), sy0 - 8 * math.sin(srad), sx0 + 6 * math.cos(srad), sy0 + 6 * math.sin(srad), 4.0, C["GOLD"], C["PORC_5"])
        draw_thick_segment(arr, sx0, sy0, sx1, sy1, 4.5, C["PORC_3"], C["PORC_5"])
        draw_thick_segment(arr, sx0 + 6 * math.cos(srad), sy0 + 6 * math.sin(srad), sx1, sy1, 2.0, C["CYAN"], C["PORC_5"])
        save_outlined(arr, out_dir / f"boss_02_grand_alchemist_{pose}.png")

    # 3. Phase 3 (80x80 — True Ending "The Great Alkahest"): Mortal white-coat mirror swordsman
    for pose in ("p3_idle_0", "p3_move_0", "p3_windup_0", "p3_thrust_0", "p3_submerge_0", "p3_sun_0", "p3_hurt_0"):
        arr = np.zeros((80, 80, 4), dtype=np.uint8)
        cx = 38 + (9 if pose == "p3_thrust_0" else (-4 if pose == "p3_windup_0" else 0))
        base_y = 77
        if pose == "p3_submerge_0":
            # Dissolving into reflective quicksilver sea puddle with piercing silver eyes
            fill_rect_px(arr, 14, 70, 52, 6, C["PORC_3"])
            fill_rect_px(arr, 20, 67, 40, 4, C["PORC_5"])
            fill_disc(arr, 40, 62, 7.0, C["CYAN"])
            save_outlined(arr, out_dir / f"boss_02_grand_alchemist_{pose}.png")
            continue

        y_off = -14 if pose == "p3_sun_0" else 0
        stride = 6 if pose in ("p3_move_0", "p3_thrust_0") else 0
        fill_rect_px(arr, cx - 6 + stride, base_y - 20 + y_off, 4, 20, C["SLATE_3"])
        fill_rect_px(arr, cx + 2 - stride, base_y - 20 + y_off, 4, 20, C["SLATE_4"])
        # Stripped white alchemist duelist coat + crimson heart scar (matching Vessel-09!)
        fill_rect_px(arr, cx - 7, base_y - 42 + y_off, 15, 23, C["PORC_4"])
        fill_rect_px(arr, cx - 9, base_y - 25 + y_off, 12, 10, C["PORC_2"])
        draw_thick_segment(arr, cx - 4, base_y - 38 + y_off, cx - 18, base_y - 32 + y_off, 2.2, C["CRIM_6"], C["CRIM_7"])
        fill_disc(arr, cx + 1, base_y - 34 + y_off, 2.8, C["CRIM_6"])
        # Mortal head + flowing silver hair + broken gold crown shard
        fill_disc(arr, cx + 1, base_y - 48 + y_off, 5.2, C["PORC_4"])
        draw_thick_segment(arr, cx - 2, base_y - 52 + y_off, cx - 11, base_y - 46 + y_off, 2.2, C["PORC_5"], C["CYAN"])
        put_px(arr, cx + 4, base_y - 48 + y_off, C["CRIM_6"])
        put_px(arr, cx + 2, base_y - 54 + y_off, C["GOLD"])
        # Pure Quicksilver Mirror Rapier
        if pose == "p3_sun_0":
            draw_thick_segment(arr, cx + 2, base_y - 40 + y_off, cx + 4, base_y - 68 + y_off, 1.6, C["GOLD"], C["PORC_5"])
        else:
            bx1 = cx + (36 if pose == "p3_thrust_0" else (-10 if pose == "p3_windup_0" else 24))
            by1 = base_y - (35 if pose == "p3_thrust_0" else (42 if pose == "p3_windup_0" else 32))
            draw_thick_segment(arr, cx + 4, base_y - 35, bx1, by1, 1.4, C["CYAN"], C["PORC_5"])
            fill_disc(arr, cx + 6, base_y - 35, 2.6, C["GOLD"])
        save_outlined(arr, out_dir / f"boss_02_grand_alchemist_{pose}.png")


def build_boss_fx(out_dir: Path) -> None:
    # 1. Boss 1 Molten Iron Floor Grates (64x16 / 64x24 / 64x128)
    g_idle = np.zeros((16, 64, 4), dtype=np.uint8)
    fill_rect_px(g_idle, 2, 4, 60, 10, C["SLATE_3"])
    fill_rect_px(g_idle, 2, 4, 60, 3, C["BRASS_4"])
    for gx in range(6, 58, 8):
        fill_rect_px(g_idle, gx, 6, 4, 7, C["EMBER_1"])
    save_outlined(g_idle, out_dir / "furnace_grate_idle.png")

    g_warn = np.zeros((28, 64, 4), dtype=np.uint8)
    fill_rect_px(g_warn, 2, 14, 60, 12, C["BRASS_5"])
    for gx in range(5, 59, 7):
        fill_rect_px(g_warn, gx, 8, 4, 16, C["EMBER_4"])
        put_px(g_warn, gx + 1, 5, C["GOLD"])
    save_outlined(g_warn, out_dir / "furnace_grate_warn.png")

    for idx in (0, 1):
        er = np.zeros((128, 64, 4), dtype=np.uint8)
        for y in range(8, 124):
            t = y / 124.0
            hw = int(14 + 10 * math.sin(t * math.pi) + (2 if (y // 6 + idx) % 2 == 0 else -2))
            fill_rect_px(er, 32 - hw, y, hw * 2, 1, C["EMBER_3"] if abs(hw) > 16 else C["EMBER_4"])
            fill_rect_px(er, 32 - hw // 2, y, hw, 1, C["GOLD"])
            if y % 5 == idx * 2:
                fill_rect_px(er, 30, y, 4, 2, C["PORC_5"])
        fill_rect_px(er, 2, 116, 60, 10, C["BRASS_5"])
        save_outlined(er, out_dir / f"furnace_grate_erupt_{idx}.png")

    wave = np.zeros((28, 48, 4), dtype=np.uint8)
    for x in range(4, 44):
        h = int(6 + 16 * ((x - 4) / 40.0))
        fill_rect_px(wave, x, 26 - h, 2, h, C["EMBER_4"])
        fill_rect_px(wave, x, 26 - h // 2, 2, h // 2, C["GOLD"])
    save_outlined(wave, out_dir / "sulfur_fire_wave_0.png")

    cloud = np.zeros((96, 96, 4), dtype=np.uint8)
    fill_ring(cloud, 48, 48, 28.0, 42.0, ACID_5)
    fill_ring(cloud, 48, 48, 33.0, 38.0, ACID_7)
    save_outlined(cloud, out_dir / "sulfur_toxic_cloud_0.png")

    # 2. Boss 2 Celestial Astrolabe (160x160 -> 320px), Sweeping Laser, Porcelain Platform & P3 Quicksilver Sea
    astro = np.zeros((160, 160, 4), dtype=np.uint8)
    fill_ring(astro, 80, 80, 70.0, 76.0, C["BRASS_5"])
    fill_ring(astro, 80, 80, 72.0, 74.0, C["GOLD"])
    fill_ring(astro, 80, 80, 48.0, 53.0, C["BRASS_4"])
    fill_ring(astro, 80, 80, 24.0, 28.0, C["GOLD"])
    for deg in range(0, 360, 30):
        rad = math.radians(deg)
        draw_thick_segment(astro, 80 + 26 * math.cos(rad), 80 + 26 * math.sin(rad), 80 + 72 * math.cos(rad), 80 + 72 * math.sin(rad), 1.3, C["BRASS_4"], C["GOLD"])
    fill_disc(astro, 80, 80, 10.0, C["CRIM_6"])
    fill_disc(astro, 80, 80, 5.0, C["PORC_5"])
    save_outlined(astro, out_dir / "ouroboros_astrolabe_ring.png")

    aim = np.zeros((8, 64, 4), dtype=np.uint8)
    fill_rect_px(aim, 0, 3, 64, 2, C["GOLD"])
    save_outlined(aim, out_dir / "astrolabe_aim_line.png")

    for idx in (0, 1):
        beam = np.zeros((24, 64, 4), dtype=np.uint8)
        fill_rect_px(beam, 0, 4, 64, 16, C["CRIM_6"] if idx == 0 else C["EMBER_4"])
        fill_rect_px(beam, 0, 7, 64, 10, C["GOLD"])
        fill_rect_px(beam, 0, 10, 64, 4, C["PORC_5"])
        save_outlined(beam, out_dir / f"astrolabe_laser_beam_{idx}.png")

    plat = np.zeros((22, 96, 4), dtype=np.uint8)
    fill_rect_px(plat, 2, 3, 92, 8, C["PORC_4"])
    fill_rect_px(plat, 4, 3, 88, 3, C["PORC_5"])
    fill_rect_px(plat, 8, 11, 80, 5, C["GOLD"])
    fill_disc(plat, 48, 15, 4.5, C["CYAN"])
    save_outlined(plat, out_dir / "porcelain_float_platform.png")

    prism = np.zeros((96, 96, 4), dtype=np.uint8)
    fill_ring(prism, 48, 48, 38.0, 43.0, C["CYAN"])
    fill_ring(prism, 48, 48, 40.0, 41.5, C["PORC_5"])
    save_outlined(prism, out_dir / "prism_shield_halo_0.png")

    bh = np.zeros((96, 96, 4), dtype=np.uint8)
    fill_disc(bh, 48, 48, 18.0, C["SLATE_0"])
    fill_ring(bh, 48, 48, 18.0, 26.0, AETHER_2)
    fill_ring(bh, 48, 48, 32.0, 36.0, C["CRIM_6"])
    save_outlined(bh, out_dir / "blackhole_core_0.png")

    m_warn = np.zeros((20, 80, 4), dtype=np.uint8)
    fill_rect_px(m_warn, 2, 12, 76, 5, AETHER_2)
    for mx in range(8, 74, 12):
        fill_rect_px(m_warn, mx, 6, 4, 10, C["CYAN"])
    save_outlined(m_warn, out_dir / "matrix_floor_rune_0.png")

    m_erupt = np.zeros((56, 80, 4), dtype=np.uint8)
    for mx in range(6, 74, 8):
        fill_rect_px(m_erupt, mx, 8, 5, 44, AETHER_2 if (mx // 8) % 2 == 0 else C["CYAN"])
        fill_rect_px(m_erupt, mx + 1, 12, 3, 38, C["PORC_5"])
    save_outlined(m_erupt, out_dir / "matrix_floor_erupt_0.png")

    # P3 Mirror Quicksilver Sea tiles & Sword Forest & Calcination Sun
    for idx in (0, 1):
        sea = np.zeros((20, 64, 4), dtype=np.uint8)
        fill_rect_px(sea, 0, 4, 64, 16, C["PORC_2"])
        fill_rect_px(sea, 0, 4, 64, 4, C["PORC_5"])
        for rx in range(4 + idx * 8, 60, 16):
            fill_rect_px(sea, rx, 9, 10, 2, C["CYAN"])
            fill_rect_px(sea, rx + 2, 14, 8, 2, C["PORC_4"])
        Image.fromarray(sea, mode="RGBA").save(out_dir / f"quicksilver_sea_tile_{idx}.png")

    rip = np.zeros((16, 48, 4), dtype=np.uint8)
    fill_rect_px(rip, 4, 8, 40, 4, C["CYAN"])
    fill_rect_px(rip, 10, 5, 28, 3, C["PORC_5"])
    save_outlined(rip, out_dir / "quicksilver_ripple_safe.png")

    blades = np.zeros((96, 56, 4), dtype=np.uint8)
    for bx, ang in ((10, -78), (28, -88), (44, -100)):
        rad = math.radians(ang)
        draw_thick_segment(blades, bx, 92, bx + 78 * math.cos(rad), 92 + 78 * math.sin(rad), 2.6, C["PORC_3"], C["PORC_5"])
        draw_thick_segment(blades, bx, 92, bx + 64 * math.cos(rad), 92 + 64 * math.sin(rad), 1.1, C["CYAN"], C["PORC_5"])
    save_outlined(blades, out_dir / "quicksilver_blade_forest_0.png")

    sun = np.zeros((96, 96, 4), dtype=np.uint8)
    fill_disc(sun, 48, 48, 34.0, C["CRIM_6"])
    fill_disc(sun, 48, 48, 25.0, C["EMBER_4"])
    fill_disc(sun, 48, 48, 16.0, C["GOLD"])
    fill_disc(sun, 48, 48, 8.0, C["PORC_5"])
    save_outlined(sun, out_dir / "calcination_mini_sun_0.png")


def build_sanctum_and_npcs(out_dir: Path) -> None:
    # 1. Archivist Corvus (64x64)
    for idx in (0, 1):
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        by = idx
        fill_rect_px(arr, 24, 30 + by, 16, 32 - by, C["SLATE_2"])
        fill_rect_px(arr, 22, 32 + by, 20, 14, AETHER_1)
        fill_rect_px(arr, 28, 32 + by, 6, 28 - by, C["BRASS_4"])
        fill_disc(arr, 32, 23 + by, 6.0, C["SLATE_3"])
        fill_disc(arr, 35, 23 + by, 2.5, C["GOLD"])
        put_px(arr, 35, 23 + by, C["CYAN"])
        # Bubbling alembic flask held in right hand
        fill_disc(arr, 44, 36 + by, 5.2, ACID_6)
        fill_rect_px(arr, 43, 29 + by, 3, 5, C["PORC_4"])
        put_px(arr, 43, 35 + by, C["PORC_5"])
        save_outlined(arr, out_dir / f"npc_corvus_idle_{idx}.png")

    # 2. Isolde the Unwound (64x64): Left shoulder brass escapement gear + heavy smithing hammer
    for idx in (0, 1):
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        by = idx
        fill_rect_px(arr, 24, 46, 7, 16, C["SLATE_3"])
        fill_rect_px(arr, 33, 46, 7, 16, C["SLATE_3"])
        fill_rect_px(arr, 23, 28 + by, 18, 20, C["BRASS_2"])
        fill_rect_px(arr, 25, 32 + by, 14, 16, C["CRIM_3"])
        # Iconic exposed brass escapement gear on left shoulder!
        fill_ring(arr, 22, 29 + by, 3.0, 6.5, C["GOLD"])
        put_px(arr, 22, 29 + by, C["CRIM_6"])
        fill_disc(arr, 32, 21 + by, 5.5, C["PORC_3"])
        fill_rect_px(arr, 27, 16 + by, 11, 4, C["BRASS_5"])
        # Resting anvil hammer
        fill_rect_px(arr, 43, 32 + by, 3, 30 - by, C["BRASS_4"])
        fill_rect_px(arr, 38, 28 + by, 13, 7, C["SLATE_5"])
        fill_rect_px(arr, 39, 28 + by, 11, 2, C["PORC_4"])
        save_outlined(arr, out_dir / f"npc_isolde_idle_{idx}.png")

    # 3. Sister Vesper (64x64): Blindfolded gothic nun + warm glowing amber lantern
    for idx in (0, 1):
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        by = idx
        for dy in range(34):
            hw = 6 + dy // 4
            fill_rect_px(arr, 31 - hw, 28 + by + dy, hw * 2, 1, C["SLATE_2"] if dy > 8 else C["PORC_3"])
        fill_disc(arr, 31, 22 + by, 5.5, C["PORC_4"])
        fill_rect_px(arr, 26, 21 + by, 11, 3, C["PORC_5"])  # White blindfold
        # Suspended warm lantern
        draw_thick_segment(arr, 37, 32 + by, 45, 30 + by, 1.2, C["BRASS_5"], C["GOLD"])
        fill_rect_px(arr, 43, 34 + by, 6, 9, C["GOLD"])
        fill_disc(arr, 46, 38 + by, 2.5, C["PORC_5"])
        save_outlined(arr, out_dir / f"npc_vesper_idle_{idx}.png")

    # 4. Sanctum Props: Hanging weapon flasks, Athanor hearth, Rebirth slab, 3-Seal monument, Departure tube
    for lit in (False, True):
        fl = np.zeros((56, 28, 4), dtype=np.uint8)
        fill_rect_px(fl, 12, 0, 4, 10, C["SLATE_5"])
        fill_rect_px(fl, 6, 10, 16, 4, C["BRASS_5"])
        fill_rect_px(fl, 7, 14, 14, 34, C["CYAN"] if lit else C["SLATE_3"])
        if lit:
            fill_rect_px(fl, 9, 18, 10, 26, C["PORC_4"])
            fill_rect_px(fl, 10, 16, 3, 28, C["PORC_5"])
        fill_rect_px(fl, 6, 48, 16, 5, C["BRASS_5"])
        save_outlined(fl, out_dir / ("sanctum_hanging_flask_lit.png" if lit else "sanctum_hanging_flask_empty.png"))

    for idx in (0, 1):
        hearth = np.zeros((96, 96, 4), dtype=np.uint8)
        fill_rect_px(hearth, 14, 24, 68, 70, C["SLATE_3"])
        fill_rect_px(hearth, 10, 20, 76, 8, C["BRASS_4"])
        fill_rect_px(hearth, 26, 4, 44, 18, C["BRASS_2"])
        fill_disc(hearth, 48, 64, 20.0, C["EMBER_2"])
        fill_disc(hearth, 48, 66, 14.0 - idx * 1.5, C["EMBER_4"])
        fill_disc(hearth, 48, 68, 7.5, C["GOLD"])
        # Foreground blacksmith anvil
        fill_rect_px(hearth, 6, 76, 34, 8, C["SLATE_5"])
        fill_rect_px(hearth, 14, 84, 18, 10, C["SLATE_4"])
        save_outlined(hearth, out_dir / f"sanctum_athanor_hearth_{idx}.png")

    slab = np.zeros((40, 80, 4), dtype=np.uint8)
    fill_rect_px(slab, 6, 26, 68, 12, C["SLATE_4"])
    fill_rect_px(slab, 10, 22, 60, 5, C["PORC_2"])
    fill_rect_px(slab, 24, 23, 32, 3, C["CYAN"])
    save_outlined(slab, out_dir / "sanctum_rebirth_slab.png")

    ped = np.zeros((72, 64, 4), dtype=np.uint8)
    fill_rect_px(ped, 16, 44, 32, 26, C["SLATE_4"])
    fill_ring(ped, 32, 26, 14.0, 19.0, C["GOLD"])
    fill_disc(ped, 32, 16, 3.5, C["CYAN"])
    fill_disc(ped, 23, 31, 3.5, C["EMBER_4"])
    fill_disc(ped, 41, 31, 3.5, C["GOLD"])
    save_outlined(ped, out_dir / "sanctum_seal_pedestal.png")

    pipe = np.zeros((88, 64, 4), dtype=np.uint8)
    fill_rect_px(pipe, 14, 4, 36, 12, C["BRASS_5"])
    fill_rect_px(pipe, 18, 16, 28, 60, C["CYAN"])
    fill_rect_px(pipe, 22, 16, 8, 60, C["PORC_5"])
    fill_rect_px(pipe, 10, 76, 44, 10, C["BRASS_4"])
    save_outlined(pipe, out_dir / "sanctum_departure_pipe.png")

    gate = np.zeros((96, 80, 4), dtype=np.uint8)
    fill_rect_px(gate, 10, 14, 60, 80, C["BRASS_4"])
    fill_rect_px(gate, 18, 22, 44, 72, AETHER_1)
    fill_disc(gate, 40, 56, 15.0, C["PORC_4"])
    fill_ring(gate, 40, 56, 15.0, 20.0, C["GOLD"])
    save_outlined(gate, out_dir / "throne_portal_gate.png")


def build_npc_portrait_sheet(raw_path: Path) -> None:
    """6 crisp 32x32 portraits (192x32): 0=Vessel-09, 1=Corvus, 2=Isolde, 3=Vesper, 4=Lore/Seal, 5=Paracelsus."""
    strip = np.zeros((32, 192, 4), dtype=np.uint8)
    accents = [C["CYAN"], ACID_6, C["EMBER_4"], C["GOLD"], AETHER_2, C["CRIM_6"]]
    for slot in range(6):
        ox = slot * 32
        fill_rect_px(strip, ox + 1, 1, 30, 30, C["SLATE_1"])
        fill_rect_px(strip, ox + 1, 1, 30, 2, accents[slot])
        fill_rect_px(strip, ox + 1, 29, 30, 2, accents[slot])
        fill_rect_px(strip, ox + 1, 1, 2, 30, accents[slot])
        fill_rect_px(strip, ox + 29, 1, 2, 30, accents[slot])

        fg = np.zeros((32, 32, 4), dtype=np.uint8)
        if slot == 0:  # Vessel-09
            fill_ring(fg, 16, 15, 5.0, 8.5, C["BRASS_5"])
            fill_disc(fg, 16, 15, 4.5, C["CYAN"])
            put_px(fg, 16, 14, C["PORC_5"])
            fill_rect_px(fg, 8, 23, 16, 6, C["PORC_4"])
        elif slot == 1:  # Corvus
            fill_disc(fg, 15, 14, 6.5, C["SLATE_4"])
            fill_disc(fg, 18, 14, 3.2, C["GOLD"])
            put_px(fg, 18, 14, ACID_6)
            fill_rect_px(fg, 8, 21, 16, 8, AETHER_1)
        elif slot == 2:  # Isolde
            fill_disc(fg, 16, 14, 6.0, C["PORC_3"])
            fill_rect_px(fg, 10, 9, 12, 4, C["BRASS_5"])
            fill_ring(fg, 9, 23, 2.2, 5.0, C["GOLD"])
            fill_rect_px(fg, 13, 21, 13, 8, C["CRIM_4"])
        elif slot == 3:  # Sister Vesper
            fill_disc(fg, 15, 15, 6.5, C["PORC_3"])
            fill_rect_px(fg, 10, 14, 11, 3, C["PORC_5"])
            fill_disc(fg, 24, 22, 3.5, C["GOLD"])
        elif slot == 4:  # Lore / Prima Materia Seal
            fill_rect_px(fg, 8, 6, 16, 20, C["BRASS_6"])
            fill_disc(fg, 16, 16, 5.0, C["CRIM_6"])
            put_px(fg, 16, 16, C["GOLD"])
        else:  # Paracelsus Sovereign
            fill_disc(fg, 16, 16, 6.5, C["PORC_5"])
            fill_rect_px(fg, 10, 8, 12, 4, C["GOLD"])
            fill_rect_px(fg, 12, 15, 8, 2, C["CRIM_6"])
            fill_rect_px(fg, 8, 23, 16, 6, C["PORC_4"])

        outlined = add_1px_outline(fg, C["OUTLINE"])
        for y in range(2, 30):
            for x in range(2, 30):
                if outlined[y, x, 3] > 0:
                    strip[y, ox + x] = outlined[y, x]
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(strip, mode="RGBA").save(raw_path)


def run_pipeline() -> None:
    root = Path(__file__).resolve().parents[2]
    py = sys.executable
    atlases_dir = root / "public/assets/atlases"

    bundles = [
        ("m8_bosses", "bosses_atlas", "1.0", 2.6, lambda d: (draw_sulfur_boss(d), draw_paracelsus_boss(d))),
        ("m8_boss_fx", "boss_fx_atlas", "0.5", 2.2, build_boss_fx),
        ("m8_sanctum", "sanctum_hub_atlas", "1.0", 2.4, build_sanctum_and_npcs),
    ]

    for folder, atlas_name, piv_y, norm_str, builder in bundles:
        raw_d = root / f".tmp/raw_assets/{folder}"
        quant_d = root / f".tmp/quantized/{folder}"
        raw_d.mkdir(parents=True, exist_ok=True)
        quant_d.mkdir(parents=True, exist_ok=True)
        for old in [*raw_d.glob("*.png"), *quant_d.glob("*.png")]:
            old.unlink()
        builder(raw_d)
        quantize_and_normal(root, py, raw_d, quant_d, norm_str)
        subprocess.run(
            [
                "node",
                str(root / "tools/asset-factory/pack_multiatlas.mjs"),
                "--src",
                str(quant_d),
                "--out",
                str(atlases_dir / atlas_name),
                "--no-trim",
                "--pivot-x",
                "0.5",
                "--pivot-y",
                piv_y,
            ],
            check=True,
        )

    # Generate npc_portraits_sheet.png + _n.png
    raw_port = root / ".tmp/raw_assets/m8_portraits"
    quant_port = root / ".tmp/quantized/m8_portraits"
    raw_port.mkdir(parents=True, exist_ok=True)
    quant_port.mkdir(parents=True, exist_ok=True)
    build_npc_portrait_sheet(raw_port / "npc_portraits_sheet.png")
    quantize_and_normal(root, py, raw_port, quant_port, 2.0)
    for suffix in ("", "_n"):
        src_f = quant_port / f"npc_portraits_sheet{suffix}.png"
        dst_f = atlases_dir / f"npc_portraits_sheet{suffix}.png"
        dst_f.write_bytes(src_f.read_bytes())

    print("✅ Milestone 8 Asset Factory complete: bosses_atlas, boss_fx_atlas, sanctum_hub_atlas & npc_portraits_sheet!")


if __name__ == "__main__":
    run_pipeline()
