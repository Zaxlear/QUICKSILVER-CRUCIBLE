#!/usr/bin/env python3
"""
Milestone 7 Asset Factory — All 12 Enemy Species MultiAtlas & Enemy/Elite/Atmosphere FX MultiAtlas:
  1. public/assets/atlases/enemies_roster_atlas.{json,png,_n.png} (pivot 0.5, 1.0)
     Covers mob_01_slag_husk .. mob_12_astral_inquisitor at exact spec dimensions (48x48 .. 96x96).
  2. public/assets/atlases/enemy_fx_atlas.{json,png,_n.png} (pivot 0.5, 0.5)
     Covers Prelate golden tether beam & ward halo, enemy projectiles, ground spikes, gravity sigils,
     4 Elite Affix visuals, and 4 Biome ambient atmosphere particle sprites.
  3. Retires legacy m5_enemies_atlas.{json,png,_n.png}.
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
from generate_sprite import C, draw_thick_segment, put_px

ACID_3 = (38, 107, 96, 255)
ACID_5 = (34, 197, 94, 255)
ACID_6 = (60, 230, 130, 255)
ACID_7 = (163, 230, 53, 255)
AETHER_0 = (59, 7, 100, 255)
AETHER_1 = (109, 40, 217, 255)
AETHER_2 = (168, 85, 247, 255)

POSES = ("idle_0", "idle_1", "move_0", "move_1", "windup_0", "attack_0", "hurt_0")


def fill_ring(arr: np.ndarray, cx: float, cy: float, r_in: float, r_out: float, col: tuple[int, int, int, int]) -> None:
    ri = int(math.ceil(r_out))
    for dy in range(-ri, ri + 1):
        for dx in range(-ri, ri + 1):
            d2 = dx * dx + dy * dy
            if r_in * r_in <= d2 <= r_out * r_out:
                put_px(arr, int(round(cx + dx)), int(round(cy + dy)), col)


def pose_offsets(pose: str) -> tuple[int, int, int]:
    """Returns (lean_x, bob_y, stride_x) for standard locomotion/combat poses."""
    if pose == "idle_0":
        return (0, 0, 0)
    if pose == "idle_1":
        return (0, 1, 0)
    if pose == "move_0":
        return (1, -1, 4)
    if pose == "move_1":
        return (1, 0, -4)
    if pose == "windup_0":
        return (-3, -1, -2)
    if pose == "attack_0":
        return (5, 1, 3)
    return (-4, 1, -1)


def build_all_12_enemies(out_dir: Path) -> None:
    # --------------------------------------------------------------------------
    # 01. mob_01_slag_husk (64x64): Hunched miner zombie + glowing ember cracks + pickaxe
    # --------------------------------------------------------------------------
    for p in POSES:
        lx, by, st = pose_offsets(p)
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        cx = 30 + lx
        fill_rect_px(arr, cx - 7 + st, 50, 5, 13, C["SLATE_2"])
        fill_rect_px(arr, cx + 2 - st, 50, 5, 13, C["SLATE_3"])
        fill_rect_px(arr, cx - 7, 30 + by, 15, 20, C["SLATE_3"])
        draw_thick_segment(arr, cx - 3, 34 + by, cx + 4, 45 + by, 1.2, C["EMBER_3"], C["GOLD"])
        fill_disc(arr, cx + 2, 25 + by, 5.2, C["BRASS_2"])
        fill_rect_px(arr, cx - 2, 22 + by, 9, 2, C["BRASS_5"])
        put_px(arr, cx + 5, 25 + by, C["GOLD"] if p == "windup_0" else C["EMBER_4"])
        deg = -115 if p == "windup_0" else (28 if p == "attack_0" else -25)
        rad = math.radians(deg)
        hx, hy = cx + 4 + int(16 * math.cos(rad)), 36 + by + int(16 * math.sin(rad))
        draw_thick_segment(arr, cx + 2, 37 + by, hx, hy, 1.3, C["BRASS_3"], C["BRASS_5"])
        pr = rad + math.pi * 0.5
        draw_thick_segment(arr, hx - 6 * math.cos(pr), hy - 6 * math.sin(pr), hx + 7 * math.cos(pr), hy + 7 * math.sin(pr), 1.5, C["EMBER_4"] if p == "attack_0" else C["CRIM_4"], C["PORC_4"])
        save_outlined(arr, out_dir / f"mob_01_slag_husk_{p}.png")

    # --------------------------------------------------------------------------
    # 02. mob_02_frenzied_miner (64x64): Berserk sulfur-crystal miner dual-wielding red-hot picks
    # --------------------------------------------------------------------------
    for p in POSES:
        lx, by, st = pose_offsets(p)
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        cx = 31 + lx
        fill_rect_px(arr, cx - 8 + st, 49, 6, 14, C["BRASS_1"])
        fill_rect_px(arr, cx + 3 - st, 49, 6, 14, C["BRASS_2"])
        fill_rect_px(arr, cx - 9, 28 + by, 18, 22, C["CRIM_2"])
        fill_rect_px(arr, cx - 6, 30 + by, 12, 12, C["CRIM_4"])
        # Jagged red sulfur crystals on back/shoulders
        for sx, sy in [(-8, 26), (-5, 22), (-1, 24)]:
            draw_thick_segment(arr, cx + sx, sy + by + 4, cx + sx - 3, sy + by - 3, 1.4, C["CRIM_6"], C["EMBER_4"])
        fill_disc(arr, cx + 3, 24 + by, 5.0, C["SLATE_3"])
        fill_rect_px(arr, cx + 4, 23 + by, 4, 2, C["GOLD"])
        # Dual red-hot picks
        for arm_off, base_deg in [(-3, -95 if p == "windup_0" else (35 if p == "attack_0" else -35)), (4, -125 if p == "windup_0" else (12 if p == "attack_0" else -10))]:
            rad = math.radians(base_deg)
            hx, hy = cx + arm_off + int(15 * math.cos(rad)), 35 + by + int(15 * math.sin(rad))
            draw_thick_segment(arr, cx + arm_off, 35 + by, hx, hy, 1.3, C["BRASS_4"], C["GOLD"])
            draw_thick_segment(arr, hx - 3, hy - 5, hx + 4, hy + 5, 1.5, C["EMBER_4"], C["GOLD"])
        save_outlined(arr, out_dir / f"mob_02_frenzied_miner_{p}.png")

    # --------------------------------------------------------------------------
    # 03. mob_03_alembic_thrower (64x64): Plague-mask grenadier + glowing acid flask rack
    # --------------------------------------------------------------------------
    for p in POSES:
        lx, by, st = pose_offsets(p)
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        cx = 31 + lx
        fill_rect_px(arr, cx - 6 + st, 50, 4, 13, C["SLATE_2"])
        fill_rect_px(arr, cx + 2 - st, 50, 4, 13, C["SLATE_3"])
        # Heavy leather alchemist apron + brass backpack rack with bubbling green/orange flasks
        fill_rect_px(arr, cx - 7, 31 + by, 14, 20, C["BRASS_2"])
        fill_rect_px(arr, cx - 12, 28 + by, 6, 15, C["BRASS_4"])
        fill_disc(arr, cx - 10, 27 + by, 3.2, ACID_6)
        fill_disc(arr, cx - 10, 35 + by, 3.0, C["EMBER_4"])
        # Plague doctor hood & brass beak mask
        fill_disc(arr, cx + 1, 24 + by, 5.2, C["SLATE_3"])
        draw_thick_segment(arr, cx + 4, 24 + by, cx + 12, 26 + by, 1.6, C["BRASS_5"], C["GOLD"])
        put_px(arr, cx + 4, 23 + by, ACID_6)
        # Held volatile flask in throwing hand
        fx = cx + (12 if p == "attack_0" else (-4 if p == "windup_0" else 8))
        fy = 20 + by if p == "windup_0" else 34 + by
        fill_disc(arr, fx, fy, 3.6, ACID_6 if p != "windup_0" else C["GOLD"])
        put_px(arr, fx - 1, fy - 1, C["PORC_5"])
        save_outlined(arr, out_dir / f"mob_03_alembic_thrower_{p}.png")

    # --------------------------------------------------------------------------
    # 04. mob_04_acid_spitter (64x64): Bloated copper-pipe slug mutant + green sac + red swell
    # --------------------------------------------------------------------------
    for p in (*POSES, "swell_0"):
        lx, by, _ = pose_offsets(p if p != "swell_0" else "windup_0")
        is_swell = p == "swell_0"
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        cx = 31 + lx
        # Muscular slug base hugging floor (y=62)
        for dy in range(48, 63):
            hw = 18 - (62 - dy) // 3
            fill_rect_px(arr, cx - hw, dy, hw * 2, 1, ACID_3 if dy % 2 == 0 else C["SLATE_3"])
        # Translucent glowing vitriol sac (turns blazing crimson-orange on deathrattle swell!)
        sac_r = 14.5 if is_swell else (12.5 if p == "windup_0" else 11.5)
        sac_col = C["CRIM_6"] if is_swell else ACID_5
        sac_hi = C["GOLD"] if is_swell else ACID_6
        fill_disc(arr, cx - 3, 45 + by, sac_r, sac_col)
        fill_disc(arr, cx - 5, 42 + by, sac_r * 0.58, sac_hi)
        put_px(arr, cx - 6, 39 + by, C["PORC_5"])
        # Corroded brass pipe maw facing +X
        fill_rect_px(arr, cx + 8, 44 + by, 10, 10, C["BRASS_3"])
        fill_rect_px(arr, cx + 15, 42 + by, 4, 14, C["BRASS_5"])
        fill_disc(arr, cx + 18, 49 + by, 3.2, C["EMBER_4"] if is_swell else ACID_7)
        save_outlined(arr, out_dir / f"mob_04_acid_spitter_{p}.png")

    # --------------------------------------------------------------------------
    # 05. mob_05_brass_sentinel (80x80): Towering clockwork knight + massive tower shield
    # --------------------------------------------------------------------------
    for p in POSES:
        lx, by, st = pose_offsets(p)
        stunned = p == "hurt_0"
        jet = p in ("windup_0", "attack_0")
        arr = np.zeros((80, 80, 4), dtype=np.uint8)
        cx = 36 + lx
        top_y = 31 if stunned else 24 + by
        fill_rect_px(arr, cx - 9 + st // 2, 58, 7, 21, C["BRASS_2"])
        fill_rect_px(arr, cx + 2 - st // 2, 58, 7, 21, C["BRASS_3"])
        fill_rect_px(arr, cx - 10, top_y + 10, 20, 25, C["SLATE_3"])
        fill_rect_px(arr, cx - 8, top_y + 12, 16, 11, C["BRASS_4"])
        fill_rect_px(arr, cx - 15, top_y + 14, 5, 14, C["BRASS_2"])
        if jet:
            draw_thick_segment(arr, cx - 16, top_y + 20, cx - 28, top_y + 22, 2.8, C["EMBER_4"], C["GOLD"])
        fill_rect_px(arr, cx - 6, top_y, 13, 11, C["BRASS_5"])
        fill_rect_px(arr, cx - 4, top_y - 4, 9, 4, C["GOLD"])
        fill_rect_px(arr, cx + 1, top_y + 4, 5, 2, C["CRIM_6"] if stunned else C["CYAN"])
        sx = cx + (-6 if stunned else (16 if p == "attack_0" else 12))
        sy0 = 42 if stunned else 27
        fill_rect_px(arr, sx, sy0, 9, 36, C["BRASS_3"])
        fill_rect_px(arr, sx + 2, sy0 + 2, 6, 32, C["BRASS_5"])
        fill_rect_px(arr, sx + 6, sy0 + 2, 2, 32, C["GOLD"])
        for ry in range(sy0 + 5, sy0 + 33, 7):
            put_px(arr, sx + 4, ry, C["PORC_5"])
        save_outlined(arr, out_dir / f"mob_05_brass_sentinel_{p}.png")

    # --------------------------------------------------------------------------
    # 06. mob_06_flail_executor (96x96): Crimson hooded automaton + giant spiked brass thurible
    # --------------------------------------------------------------------------
    for p in POSES:
        lx, by, st = pose_offsets(p)
        arr = np.zeros((96, 96, 4), dtype=np.uint8)
        cx = 42 + lx
        fill_rect_px(arr, cx - 11 + st // 2, 70, 8, 25, C["SLATE_2"])
        fill_rect_px(arr, cx + 3 - st // 2, 70, 8, 25, C["SLATE_3"])
        # Crimson executioner robes & broad brass shoulderplates
        for dy in range(34 + by, 76):
            hw = 12 + (dy - 34) // 5
            fill_rect_px(arr, cx - hw, dy, hw * 2, 1, C["CRIM_3"] if dy % 3 else C["CRIM_2"])
        fill_rect_px(arr, cx - 14, 34 + by, 28, 9, C["BRASS_4"])
        fill_rect_px(arr, cx - 12, 35 + by, 24, 3, C["GOLD"])
        # Tall pointed crimson executioner hood + glowing eye slit
        for dy in range(12):
            hw = max(2, 8 - dy // 2)
            fill_rect_px(arr, cx - hw, 22 + by + dy, hw * 2, 1, C["CRIM_4"])
        fill_rect_px(arr, cx + 1, 29 + by, 5, 2, C["GOLD"])
        # Heavy chain & spiked brass thurible censer
        tx, ty = (cx - 16, 20 + by) if p == "windup_0" else ((cx + 34, 78) if p == "attack_0" else (cx + 24, 58 + by))
        draw_thick_segment(arr, cx + 10, 44 + by, tx, ty, 1.6, C["SLATE_5"], C["PORC_2"])
        fill_disc(arr, tx, ty, 8.5, C["BRASS_4"])
        fill_disc(arr, tx, ty, 5.0, C["EMBER_4"])
        fill_disc(arr, tx, ty, 2.5, C["GOLD"])
        for deg in range(0, 360, 45):
            rad = math.radians(deg)
            put_px(arr, int(tx + 10 * math.cos(rad)), int(ty + 10 * math.sin(rad)), C["PORC_4"])
        save_outlined(arr, out_dir / f"mob_06_flail_executor_{p}.png")

    # --------------------------------------------------------------------------
    # 07. mob_07_voltaic_weaver (64x64): Floating clockwork spider-construct + cyan Tesla coils
    # --------------------------------------------------------------------------
    for p in POSES:
        lx, by, _ = pose_offsets(p)
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        cx, cy = 32 + lx, 28 + by
        fill_ring(arr, cx, cy, 9, 13, C["BRASS_4"])
        fill_ring(arr, cx, cy, 10, 11.5, C["GOLD"])
        fill_disc(arr, cx, cy, 7.5, C["SLATE_2"])
        fill_disc(arr, cx, cy, 4.5 if p != "windup_0" else 6.2, C["CYAN"])
        fill_disc(arr, cx, cy, 2.0, C["PORC_5"])
        # 4 articulated brass spider legs splaying downward
        for side in (-1, 1):
            for row, ly_off in enumerate((-3, 4)):
                kx = cx + side * (16 + (2 if p in ("move_0", "attack_0") and row == 0 else 0))
                ky = cy + ly_off - 4
                fx = cx + side * 21
                fy = cy + ly_off + 12
                draw_thick_segment(arr, cx + side * 9, cy + ly_off, kx, ky, 1.3, C["BRASS_3"], C["GOLD"])
                draw_thick_segment(arr, kx, ky, fx, fy, 1.1, C["BRASS_5"], C["CYAN"])
        save_outlined(arr, out_dir / f"mob_07_voltaic_weaver_{p}.png")

    # --------------------------------------------------------------------------
    # 08. mob_08_clockwork_tick (48x48): Compact brass spider-mine + red pressure bulb
    # --------------------------------------------------------------------------
    for p in (*POSES, "ball_0"):
        arr = np.zeros((48, 48, 4), dtype=np.uint8)
        cx = 24
        is_ball = p == "ball_0"
        by = 37 if is_ball else (33 if p != "attack_0" else 31)
        if not is_ball:
            leg_jit = 2 if p == "move_0" else (-2 if p == "move_1" else 0)
            for side in (-1, 1):
                for k in (-4, 0, 4):
                    draw_thick_segment(arr, cx + side * 6, by + 2, cx + side * 14, by + 9 + (leg_jit if k == 0 else 0), 1.1, C["BRASS_3"], C["GOLD"])
        fill_disc(arr, cx, by, 8.2, C["BRASS_4"])
        fill_ring(arr, cx, by, 5.5, 7.2, C["GOLD"])
        bulb_col = C["PORC_5"] if p == "attack_0" else (C["CRIM_6"] if p == "windup_0" else (C["BRASS_2"] if is_ball else C["EMBER_4"]))
        fill_disc(arr, cx, by - 5, 4.0 if p in ("windup_0", "attack_0") else 3.0, bulb_col)
        save_outlined(arr, out_dir / f"mob_08_clockwork_tick_{p}.png")

    # --------------------------------------------------------------------------
    # 09. mob_09_ossuary_prelate (72x72): Skeletal crimson priest + golden spine gears + reliquary staff
    # --------------------------------------------------------------------------
    for p in (*POSES, "chant_0"):
        lx, by, _ = pose_offsets(p if p != "chant_0" else "windup_0")
        chanting = p in ("chant_0", "windup_0", "attack_0")
        arr = np.zeros((72, 72, 4), dtype=np.uint8)
        cx = 34 + lx
        # Tall crimson velvet vestments touching y=70
        for dy in range(28 + by, 71):
            hw = 6 + (dy - 28) // 5
            fill_rect_px(arr, cx - hw, dy, hw * 2, 1, C["CRIM_4"] if dy % 4 == 0 else C["CRIM_2"])
            put_px(arr, cx + hw - 1, dy, C["GOLD"])
        # Golden clockwork spine gears on back
        fill_disc(arr, cx - 7, 34 + by, 4.2, C["GOLD"])
        fill_disc(arr, cx - 8, 43 + by, 3.6, C["BRASS_5"])
        # Porcelain skull & bishop mitre crown
        fill_disc(arr, cx + 1, 21 + by, 4.8, C["PORC_3"])
        fill_rect_px(arr, cx - 3, 12 + by, 8, 6, C["CRIM_5"])
        fill_rect_px(arr, cx, 10 + by, 3, 8, C["GOLD"])
        put_px(arr, cx + 3, 21 + by, C["CYAN"])
        # Ornate reliquary staff projecting silver-gold ward aura
        sx = cx + (13 if chanting else 10)
        sy_top = 12 + by if chanting else 20 + by
        draw_thick_segment(arr, sx, sy_top + 6, sx - 2, 69, 1.3, C["BRASS_5"], C["GOLD"])
        fill_ring(arr, sx, sy_top, 3.5, 6.2, C["GOLD"])
        fill_disc(arr, sx, sy_top, 3.0, C["CYAN"] if chanting else C["PORC_4"])
        if chanting:
            fill_ring(arr, sx, sy_top, 7.5, 9.2, C["PORC_5"])
        save_outlined(arr, out_dir / f"mob_09_ossuary_prelate_{p}.png")

    # --------------------------------------------------------------------------
    # 10. mob_10_pendulum_assassin (64x64): Indigo cloaked cutthroat + twin scissor-blades + smoke
    # --------------------------------------------------------------------------
    for p in (*POSES, "smoke_0"):
        arr = np.zeros((64, 64, 4), dtype=np.uint8)
        if p == "smoke_0":
            for k in range(14):
                ang = k * 0.9
                rx = 32 + int(8 * math.cos(ang))
                ry = 24 + k * 2.5
                fill_disc(arr, rx, ry, 5.5 - (k % 3), AETHER_0 if k % 2 else C["SLATE_2"])
            fill_disc(arr, 32, 38, 3.0, AETHER_2)
            save_outlined(arr, out_dir / f"mob_10_pendulum_assassin_{p}.png")
            continue

        lx, by, st = pose_offsets(p)
        cx = 31 + lx
        fill_rect_px(arr, cx - 6 + st, 49, 4, 14, C["SLATE_1"])
        fill_rect_px(arr, cx + 2 - st, 49, 4, 14, C["SLATE_2"])
        for dy in range(29 + by, 52):
            hw = 5 + (dy - 29) // 4
            fill_rect_px(arr, cx - hw, dy, hw * 2, 1, C["SLATE_2"] if dy % 2 else AETHER_0)
        fill_disc(arr, cx + 2, 24 + by, 4.5, C["SLATE_1"])
        fill_rect_px(arr, cx + 3, 23 + by, 4, 2, AETHER_2 if p == "windup_0" else C["CRIM_6"])
        # Twin curved scissor blades
        if p == "attack_0":
            draw_thick_segment(arr, cx + 2, 28 + by, cx + 22, 46 + by, 1.5, C["PORC_3"], C["PORC_5"])
            draw_thick_segment(arr, cx + 2, 44 + by, cx + 22, 24 + by, 1.5, C["CRIM_6"], C["PORC_5"])
        else:
            draw_thick_segment(arr, cx + 4, 35 + by, cx + 17, 27 + by, 1.3, C["PORC_2"], C["PORC_5"])
            draw_thick_segment(arr, cx - 2, 37 + by, cx - 14, 44 + by, 1.3, C["PORC_1"], C["PORC_4"])
        save_outlined(arr, out_dir / f"mob_10_pendulum_assassin_{p}.png")

    # --------------------------------------------------------------------------
    # 11. mob_11_mercury_stalker (80x64): Chrome-silver mechanical hound + reflective puddle
    # --------------------------------------------------------------------------
    for p in (*POSES, "puddle_0"):
        arr = np.zeros((64, 80, 4), dtype=np.uint8)
        if p == "puddle_0":
            for dx in range(-26, 27):
                h_pud = max(1, int(4 * (1.0 - (dx / 27.0) ** 2)))
                fill_rect_px(arr, 40 + dx, 62 - h_pud, 1, h_pud + 1, C["PORC_4"] if abs(dx) < 12 else C["PORC_2"])
            fill_rect_px(arr, 32, 59, 16, 1, C["PORC_5"])
            fill_rect_px(arr, 24, 61, 8, 1, C["CYAN"])
            save_outlined(arr, out_dir / f"mob_11_mercury_stalker_{p}.png")
            continue

        lx, by, st = pose_offsets(p)
        cx = 40 + lx
        leap_y = -6 if p == "attack_0" else 0
        # Sleek quadrupedal chrome hound body
        for dy in range(-5, 6):
            fill_rect_px(arr, cx - 15, 44 + by + leap_y + dy, 30, 1, C["PORC_4"] if dy < -1 else (C["PORC_2"] if dy < 2 else C["SLATE_4"]))
        # 4 articulated metallic legs touching y=62
        for lx_off, phase in [(-13, st), (-6, -st), (7, st), (14, -st)]:
            draw_thick_segment(arr, cx + lx_off, 48 + by + leap_y, cx + lx_off + phase // 2, 62 + (leap_y // 2), 1.5, C["PORC_1"], C["PORC_4"])
        # Feral razor head & dorsal mercury spikes
        draw_thick_segment(arr, cx + 14, 42 + by + leap_y, cx + 26, 39 + by + leap_y, 3.2, C["PORC_3"], C["PORC_5"])
        put_px(arr, cx + 22, 38 + by + leap_y, C["CRIM_6"] if p in ("windup_0", "attack_0") else C["CYAN"])
        for sx in (-8, 0, 8):
            draw_thick_segment(arr, cx + sx, 39 + by + leap_y, cx + sx - 5, 31 + by + leap_y, 1.3, C["CYAN"], C["PORC_5"])
        save_outlined(arr, out_dir / f"mob_11_mercury_stalker_{p}.png")

    # --------------------------------------------------------------------------
    # 12. mob_12_astral_inquisitor (96x96): Floating porcelain & gold inquisitor + 3 orbiting rings
    # --------------------------------------------------------------------------
    for p in POSES:
        lx, by, _ = pose_offsets(p)
        arr = np.zeros((96, 96, 4), dtype=np.uint8)
        cx, cy = 48 + lx, 44 + by
        # 3 Orbiting golden astrolabe blade-rings behind/around body
        for ox, oy in [(-20, -14), (20, -14), (0, -26)]:
            fill_ring(arr, cx + ox, cy + oy, 5.5, 8.2, C["GOLD"])
            put_px(arr, cx + ox, cy + oy, C["CRIM_6"] if p == "windup_0" else C["CYAN"])
        # Levitating white-porcelain & astral-gold robes (hovering above y=90)
        for dy in range(-10, 32):
            hw = 9 if dy < 4 else max(3, 13 - (dy - 4) // 3)
            col = C["PORC_4"] if abs(dy) < 6 else (C["PORC_2"] if dy < 18 else C["CRIM_4"])
            fill_rect_px(arr, cx - hw, cy + dy, hw * 2, 1, col)
            put_px(arr, cx - hw, cy + dy, C["GOLD"])
            put_px(arr, cx + hw - 1, cy + dy, C["GOLD"])
        # Faceless porcelain mask with crimson seal
        fill_disc(arr, cx, cy - 16, 6.0, C["PORC_5"])
        fill_rect_px(arr, cx - 1, cy - 19, 3, 7, C["CRIM_6"])
        fill_ring(arr, cx, cy - 16, 8.0, 10.0, C["GOLD"])
        save_outlined(arr, out_dir / f"mob_12_astral_inquisitor_{p}.png")


def build_enemy_and_elite_fx(out_dir: Path) -> None:
    # 1. Enemy projectiles: Acid Spitter globule (14x14) & Astral Inquisitor golden blade (24x16)
    glob = np.zeros((14, 14, 4), dtype=np.uint8)
    fill_disc(glob, 6.5, 6.5, 4.6, ACID_5)
    fill_disc(glob, 5.5, 5.5, 2.5, ACID_6)
    put_px(glob, 5, 5, ACID_7)
    save_outlined(glob, out_dir / "proj_acid_glob.png")

    blade = np.zeros((16, 24, 4), dtype=np.uint8)
    draw_thick_segment(blade, 3, 8, 20, 8, 2.2, C["GOLD"], C["PORC_5"])
    fill_ring(blade, 12, 8, 4.0, 6.2, C["BRASS_6"])
    put_px(blade, 21, 8, C["PORC_5"])
    save_outlined(blade, out_dir / "proj_astral_blade.png")

    # 2. Ossuary Prelate Golden Shield Tether Beam (48x12) & Invulnerable Ward Halo (48x56)
    for idx in range(2):
        beam = np.zeros((12, 48, 4), dtype=np.uint8)
        fill_rect_px(beam, 0, 4, 48, 4, C["BRASS_5"])
        fill_rect_px(beam, 0, 5, 48, 2, C["GOLD"])
        for x in range(idx * 4, 48, 8):
            fill_rect_px(beam, x, 3, 4, 6, C["PORC_5"])
        save_outlined(beam, out_dir / f"prelate_gold_beam_{idx}.png")

        halo = np.zeros((56, 48, 4), dtype=np.uint8)
        for deg in range(0, 360, 8):
            rad = math.radians(deg)
            rx = int(round(24 + 19 * math.cos(rad)))
            ry = int(round(28 + 24 * math.sin(rad)))
            fill_disc(halo, rx, ry, 1.6 if (deg // 16 + idx) % 2 == 0 else 1.1, C["GOLD"] if deg % 24 else C["PORC_5"])
        save_outlined(halo, out_dir / f"prelate_ward_halo_{idx}.png")

    # 3. Voltaic Weaver targeted shock ray (48x10)
    for idx in range(2):
        ray = np.zeros((10, 48, 4), dtype=np.uint8)
        fill_rect_px(ray, 0, 4, 48, 2, C["CYAN"])
        for x in range(idx * 3, 46, 6):
            put_px(ray, x, 3 if (x // 6) % 2 == 0 else 6, C["PORC_5"])
        save_outlined(ray, out_dir / f"weaver_aim_ray_{idx}.png")

    # 4. Mercury Stalker ground spike eruption (36x44) & Flail Executor shockwave (56x28)
    for idx in range(2):
        spk = np.zeros((44, 36, 4), dtype=np.uint8)
        if idx == 0:
            # Warning bubbling silver puddle
            fill_rect_px(spk, 4, 38, 28, 4, C["PORC_3"])
            fill_disc(spk, 12, 36, 3.0, C["CYAN"])
            fill_disc(spk, 23, 35, 3.5, C["PORC_5"])
        else:
            # Erupting razor spikes
            for sx, top_y in [(9, 12), (18, 3), (27, 10)]:
                draw_thick_segment(spk, sx, 41, sx + (2 if sx < 18 else -2), top_y, 2.4, C["PORC_3"], C["PORC_5"])
                draw_thick_segment(spk, sx, 41, sx, top_y + 6, 1.2, C["CYAN"], C["PORC_5"])
        save_outlined(spk, out_dir / f"mercury_ground_spike_{idx}.png")

    wave = np.zeros((28, 56, 4), dtype=np.uint8)
    for k in range(5):
        sx = 8 + k * 10
        draw_thick_segment(wave, sx, 25, sx + 4, 6 + (k % 2) * 5, 2.2, C["EMBER_4"], C["GOLD"])
    fill_rect_px(wave, 4, 23, 48, 3, C["CRIM_5"])
    save_outlined(wave, out_dir / "executor_ground_wave_0.png")

    # 5. Astral Inquisitor Gravity Collapse Sigil (64x24)
    for idx in range(2):
        sig = np.zeros((24, 64, 4), dtype=np.uint8)
        for deg in range(0, 360, 6):
            rad = math.radians(deg)
            for rx_s, ry_s, col in [(28, 9, AETHER_2), (20, 6, C["GOLD"] if idx == 1 else AETHER_1)]:
                put_px(sig, int(round(32 + rx_s * math.cos(rad))), int(round(12 + ry_s * math.sin(rad))), col)
        fill_disc(sig, 32, 12, 4.0 if idx == 1 else 2.5, C["PORC_5"] if idx == 1 else C["CRIM_6"])
        save_outlined(sig, out_dir / f"gravity_sigil_ring_{idx}.png")

    # 6. 4 Elite Affix Visuals: underfoot sigil, 96px rotating laser, voltaic cage pillar, thorns crest
    for idx in range(2):
        esig = np.zeros((18, 56, 4), dtype=np.uint8)
        for deg in range(0, 360, 8):
            rad = math.radians(deg)
            put_px(esig, int(round(28 + 25 * math.cos(rad))), int(round(9 + 6 * math.sin(rad))), C["GOLD"] if (deg + idx * 16) % 16 == 0 else C["BRASS_5"])
            put_px(esig, int(round(28 + 16 * math.cos(rad))), int(round(9 + 4 * math.sin(rad))), C["EMBER_4"])
        save_outlined(esig, out_dir / f"elite_underfoot_sigil_{idx}.png")

        laser = np.zeros((14, 96, 4), dtype=np.uint8)
        fill_rect_px(laser, 2, 4, 92, 6, C["CRIM_5"])
        fill_rect_px(laser, 2, 5, 92, 4, C["EMBER_4"])
        fill_rect_px(laser, 2, 6, 92, 2, C["GOLD"] if idx == 0 else C["PORC_5"])
        save_outlined(laser, out_dir / f"elite_fire_beam_{idx}.png")

        pil = np.zeros((64, 18, 4), dtype=np.uint8)
        fill_rect_px(pil, 5, 4, 8, 56, C["CYAN"])
        fill_rect_px(pil, 7, 4, 4, 56, C["PORC_5"] if idx == 0 else AETHER_2)
        fill_rect_px(pil, 3, 56, 12, 5, C["GOLD"])
        save_outlined(pil, out_dir / f"elite_cage_pillar_{idx}.png")

    thorn = np.zeros((32, 26, 4), dtype=np.uint8)
    for sy, tx in [(8, 4), (16, 2), (24, 5)]:
        draw_thick_segment(thorn, 18, sy, tx, sy - 4, 2.0, AETHER_1, AETHER_2)
        put_px(thorn, tx, sy - 4, C["PORC_5"])
    save_outlined(thorn, out_dir / "elite_thorns_crest.png")

    # 7. Biome Ambient Atmosphere Particles (10x10 / 8x14)
    emb = np.zeros((8, 8, 4), dtype=np.uint8)
    fill_disc(emb, 3.5, 3.5, 2.0, C["EMBER_4"])
    put_px(emb, 3, 3, C["GOLD"])
    save_outlined(emb, out_dir / "atmo_ember_0.png")

    rain = np.zeros((14, 6, 4), dtype=np.uint8)
    fill_rect_px(rain, 2, 1, 2, 11, ACID_6)
    put_px(rain, 2, 11, ACID_7)
    save_outlined(rain, out_dir / "atmo_acid_rain_0.png")

    spore = np.zeros((8, 8, 4), dtype=np.uint8)
    fill_disc(spore, 3.5, 3.5, 2.1, ACID_5)
    put_px(spore, 3, 3, ACID_7)
    save_outlined(spore, out_dir / "atmo_acid_spore_0.png")

    ash = np.zeros((8, 8, 4), dtype=np.uint8)
    fill_disc(ash, 3.5, 3.5, 1.9, C["GOLD"])
    put_px(ash, 3, 3, C["PORC_5"])
    save_outlined(ash, out_dir / "atmo_gold_ash_0.png")

    mbead = np.zeros((10, 10, 4), dtype=np.uint8)
    fill_disc(mbead, 4.5, 4.5, 2.6, C["PORC_3"])
    put_px(mbead, 4, 3, C["PORC_5"])
    put_px(mbead, 5, 5, C["CYAN"])
    save_outlined(mbead, out_dir / "atmo_mercury_bead_0.png")


def run_pipeline() -> None:
    root = Path(__file__).resolve().parents[2]
    py = sys.executable
    atlases_dir = root / "public/assets/atlases"

    # 1. enemies_roster_atlas (12 monsters, foot pivot 0.5, 1.0)
    raw_enm = root / ".tmp/raw_assets/m7_enemies_roster"
    quant_enm = root / ".tmp/quantized/m7_enemies_roster"
    raw_enm.mkdir(parents=True, exist_ok=True)
    quant_enm.mkdir(parents=True, exist_ok=True)
    for old in [*raw_enm.glob("*.png"), *quant_enm.glob("*.png")]:
        old.unlink()

    build_all_12_enemies(raw_enm)
    quantize_and_normal(root, py, raw_enm, quant_enm, 2.5)
    subprocess.run(
        [
            "node",
            str(root / "tools/asset-factory/pack_multiatlas.mjs"),
            "--src",
            str(quant_enm),
            "--out",
            str(atlases_dir / "enemies_roster_atlas"),
            "--no-trim",
            "--pivot-x",
            "0.5",
            "--pivot-y",
            "1.0",
        ],
        check=True,
    )

    # 2. enemy_fx_atlas (projectiles, golden tether, sigils, elite affixes, atmosphere, pivot 0.5, 0.5)
    raw_fx = root / ".tmp/raw_assets/m7_enemy_fx"
    quant_fx = root / ".tmp/quantized/m7_enemy_fx"
    raw_fx.mkdir(parents=True, exist_ok=True)
    quant_fx.mkdir(parents=True, exist_ok=True)
    for old in [*raw_fx.glob("*.png"), *quant_fx.glob("*.png")]:
        old.unlink()

    build_enemy_and_elite_fx(raw_fx)
    quantize_and_normal(root, py, raw_fx, quant_fx, 2.2)
    subprocess.run(
        [
            "node",
            str(root / "tools/asset-factory/pack_multiatlas.mjs"),
            "--src",
            str(quant_fx),
            "--out",
            str(atlases_dir / "enemy_fx_atlas"),
            "--no-trim",
            "--pivot-x",
            "0.5",
            "--pivot-y",
            "0.5",
        ],
        check=True,
    )

    # 3. Retire temporary M5 sparring enemy atlas
    for ext in (".json", ".png", "_n.png"):
        legacy = atlases_dir / f"m5_enemies_atlas{ext}"
        if legacy.exists():
            legacy.unlink()

    print("✅ Generated enemies_roster_atlas (12 monsters) + enemy_fx_atlas and retired m5_enemies_atlas!")


if __name__ == "__main__":
    run_pipeline()
