#!/usr/bin/env python3
"""
Standardized Asset Factory raw frame & tileset synthesizer / multimodal raw-plate ingester
for QUICKSILVER CRUCIBLE (Milestone 2+).

Outputs raw RGBA PNGs into .tmp/raw_assets/... ready for:
  quantize_palette.py -> normal_map_sobel.py -> pack_multiatlas.mjs
"""
import os
import sys

try:
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:
    for _cand in ("/opt/homebrew/bin/python3.14", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"):
        if os.path.exists(_cand) and os.path.realpath(_cand) != os.path.realpath(sys.executable):
            os.execv(_cand, [_cand, *sys.argv])
    raise

import argparse
import json
import math
from pathlib import Path

LOCKED_STYLE_PREFIX = (
    "Masterpiece commercial 2D side-scrolling action game pixel art sprite, "
    "Dead Cells and Blasphemous inspired dark alchemy & corrupted clockwork gothic fantasy aesthetic, "
    "crisp hand-pixelated clusters, razor-sharp 1px dark indigo outlines, dramatic high-contrast rim lighting, "
    "zero anti-aliasing, zero motion blur, strict side-profile 2D platformer view, "
    "isolated on solid flat #FF00FF magenta background "
    "--no gradient background, soft brush, 3d render, chibi, blurry edges, watermark, text"
)

HERO_DESIGN_TOKEN = (
    "headless alchemical homunculus warrior, hollow ornate brass astrolabe cage helmet glowing with "
    "a bright liquid silver-cyan mercury core inside, cracked white porcelain chestplate over dark oiled "
    "alchemist coat, tattered crimson scarf trailing behind, nimble athletic proportions"
)

PROMPT_CATALOG = {
    "hero_idle": f"{LOCKED_STYLE_PREFIX}, {HERO_DESIGN_TOKEN}, 6-frame horizontal sprite sheet of combat-ready breathing idle stance",
    "hero_run": f"{LOCKED_STYLE_PREFIX}, {HERO_DESIGN_TOKEN}, 8-frame horizontal sprite sheet of aggressive forward leaning sprint cycle",
    "hero_jump_fall": f"{LOCKED_STYLE_PREFIX}, {HERO_DESIGN_TOKEN}, 4-frame sprite sheet: frames 1-2 explosive upward leap; frames 3-4 fast downward fall",
    "hero_djump": f"{LOCKED_STYLE_PREFIX}, {HERO_DESIGN_TOKEN}, 4-frame mid-air alchemical somersault boost, boots expelling silver mercury vapor",
    "hero_wall_slide": f"{LOCKED_STYLE_PREFIX}, {HERO_DESIGN_TOKEN}, 3-frame vertical wall-slide pose, magnetic brass claw gauntlet sparks",
    "hero_dodge_roll": f"{LOCKED_STYLE_PREFIX}, {HERO_DESIGN_TOKEN}, 6-frame low-profile acrobatic combat dive roll liquefying into quicksilver",
    "hero_parry": f"{LOCKED_STYLE_PREFIX}, {HERO_DESIGN_TOKEN}, 5-frame shield parry stance snapping heavy alchemical buckler with shockwave",
    "hero_atk_slash": f"{LOCKED_STYLE_PREFIX}, {HERO_DESIGN_TOKEN}, 12-frame 3-hit melee combo sprite sheet with exaggerated smear arcs",
    "hero_hurt": f"{LOCKED_STYLE_PREFIX}, {HERO_DESIGN_TOKEN}, 3-frame heavy hit-stagger recoil pose splashing silver mercury droplets",
    "hero_collapse": f"{LOCKED_STYLE_PREFIX}, {HERO_DESIGN_TOKEN}, 8-frame death sequence shattering white porcelain armor draining mercury core",
    "biome_01_slag_retort": (
        "Orthographic 2D pixel art platformer tileset & multi-layer parallax background of The Slag Retorts: "
        "soot-blackened riveted cast-iron platforms, glowing furnace grate floors, tarnished brass pipes, "
        "giant boiling glass alembics in background, warm amber gaslight vs dark slate shadows"
    ),
}

# Exact colors from src/data/palette.data.ts
C = {
    "OUTLINE": (11, 12, 16, 255),       # #0B0C10
    "SLATE_0": (17, 19, 28, 255),       # #11131C
    "SLATE_1": (22, 24, 36, 255),       # #161824
    "SLATE_2": (30, 34, 51, 255),       # #1E2233
    "SLATE_3": (39, 44, 66, 255),       # #272C42
    "SLATE_4": (50, 57, 84, 255),       # #323954
    "SLATE_5": (65, 74, 107, 255),      # #414A6B
    "SLATE_6": (85, 96, 133, 255),      # #556085
    "PORC_0": (124, 133, 153, 255),     # #7C8599
    "PORC_1": (154, 165, 184, 255),     # #9AA5B8
    "PORC_2": (184, 196, 212, 255),     # #B8C4D4
    "PORC_3": (212, 222, 232, 255),     # #D4DEE8
    "PORC_4": (232, 239, 245, 255),     # #E8EFF5
    "PORC_5": (248, 250, 252, 255),     # #F8FAFC
    "BRASS_0": (41, 26, 14, 255),       # #291A0E
    "BRASS_1": (61, 40, 23, 255),       # #3D2817
    "BRASS_2": (89, 58, 30, 255),       # #593A1E
    "BRASS_3": (122, 81, 40, 255),      # #7A5128
    "BRASS_4": (158, 107, 52, 255),     # #9E6B34
    "BRASS_5": (194, 139, 66, 255),     # #C28B42
    "BRASS_6": (224, 174, 83, 255),     # #E0AE53
    "GOLD": (251, 191, 36, 255),        # #FBBF24
    "CRIM_0": (36, 11, 18, 255),        # #240B12
    "CRIM_1": (59, 18, 30, 255),        # #3B121E
    "CRIM_2": (89, 27, 43, 255),        # #591B2B
    "CRIM_3": (125, 36, 56, 255),       # #7D2438
    "CRIM_4": (166, 43, 68, 255),       # #A62B44
    "CRIM_5": (207, 54, 80, 255),       # #CF3650
    "CRIM_6": (225, 29, 72, 255),       # #E11D48
    "CRIM_7": (251, 113, 133, 255),     # #FB7185
    "ACID_1": (27, 77, 70, 255),        # #1B4D46
    "ACID_3": (50, 143, 125, 255),      # #328F7D
    "ACID_5": (60, 230, 130, 255),      # #3CE682
    "EMBER_0": (67, 20, 7, 255),        # #431407
    "EMBER_1": (124, 45, 18, 255),      # #7C2D12
    "EMBER_2": (194, 65, 12, 255),      # #C2410C
    "EMBER_3": (234, 88, 12, 255),      # #EA580C
    "EMBER_4": (255, 94, 43, 255),      # #FF5E2B
    "EMBER_5": (253, 186, 116, 255),    # #FDBA74
    "CYAN": (56, 189, 248, 255),        # #38BDF8
}


def put_px(arr: np.ndarray, x: int, y: int, col: tuple[int, int, int, int]) -> None:
    h, w, _ = arr.shape
    if 0 <= x < w and 0 <= y < h:
        arr[y, x] = col


def draw_thick_segment(
    arr: np.ndarray,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    radius: float,
    fill_col: tuple[int, int, int, int],
    hi_col: tuple[int, int, int, int] | None = None,
) -> None:
    steps = max(2, int(math.hypot(x1 - x0, y1 - y0) * 2.5) + 1)
    r_int = int(math.ceil(radius))
    for s in range(steps + 1):
        t = s / float(steps)
        cx = x0 + (x1 - x0) * t
        cy = y0 + (y1 - y0) * t
        for dy in range(-r_int, r_int + 1):
            for dx in range(-r_int, r_int + 1):
                if dx * dx + dy * dy <= radius * radius + 0.15:
                    col = hi_col if (hi_col is not None and (dx + dy) < 0) else fill_col
                    put_px(arr, int(round(cx + dx)), int(round(cy + dy)), col)


def add_1px_outline(arr: np.ndarray, outline_col: tuple[int, int, int, int]) -> np.ndarray:
    """Adds crisp 1px dark indigo/void outline around all opaque pixel clusters."""
    out = arr.copy()
    opaque = arr[:, :, 3] > 0
    padded = np.pad(opaque, 1, mode="constant", constant_values=False)
    dilated = (
        padded[:-2, 1:-1]
        | padded[2:, 1:-1]
        | padded[1:-1, :-2]
        | padded[1:-1, 2:]
    )
    border = dilated & (~opaque)
    out[border] = outline_col
    return out


def draw_scarf(arr: np.ndarray, neck_x: int, neck_y: int, wave_phase: float, length: int, angle_deg: float) -> None:
    rad = math.radians(angle_deg)
    for i in range(length):
        t = i / float(max(1, length - 1))
        flutter = math.sin(wave_phase + t * 4.2) * (1.2 + 2.5 * t)
        px = neck_x + math.cos(rad) * i - math.sin(rad) * flutter
        py = neck_y + math.sin(rad) * i + math.cos(rad) * flutter
        thickness = 2.1 * (1.0 - 0.55 * t)
        shade = C["CRIM_6"] if t < 0.35 else (C["CRIM_5"] if t < 0.7 else C["CRIM_3"])
        hi = C["CRIM_7"] if t < 0.45 else C["CRIM_5"]
        draw_thick_segment(arr, px, py, px + 0.5, py, max(0.8, thickness), shade, hi)


def draw_porcelain_torso(arr: np.ndarray, cx: int, cy: int, lean_px: int = 0, cracked_lvl: int = 1) -> None:
    """Draws Vessel-09's sculpted white porcelain chestplate, dark alchemist coat waist & brass belt."""
    # Dark oiled coat waist & tails underneath
    for dy in range(4, 13):
        half_w = 4 + (dy - 4) // 2
        row_x = cx - lean_px // 2
        for dx in range(-half_w, half_w + 1):
            col = C["SLATE_3"] if dx > 0 else (C["SLATE_2"] if dx > -2 else C["SLATE_1"])
            put_px(arr, row_x + dx, cy + dy, col)

    # Brass alchemist waist belt & buckle
    for dx in range(-4, 5):
        put_px(arr, cx + dx, cy + 4, C["BRASS_3"] if abs(dx) > 1 else C["GOLD"])
        put_px(arr, cx + dx, cy + 5, C["BRASS_2"])

    # Sculpted White Porcelain Homunculus Chestplate & Shoulder Pauldrons
    for dy in range(-5, 4):
        shift = int(round(lean_px * (-dy / 6.0)))
        half_w = 5 if dy < 0 else 4
        for dx in range(-half_w, half_w + 1):
            # Convex 3D shading across chestplate
            if dx >= 2 and dy <= -1:
                col = C["PORC_5"]
            elif dx >= 0 and dy <= 1:
                col = C["PORC_4"]
            elif dx >= -2:
                col = C["PORC_2"]
            elif dx >= -4:
                col = C["PORC_1"]
            else:
                col = C["PORC_0"]
            put_px(arr, cx + shift + dx, cy + dy, col)

    # Battle crack fissure across porcelain chestplate
    put_px(arr, cx + 1, cy - 3, C["SLATE_2"])
    put_px(arr, cx, cy - 2, C["SLATE_2"])
    put_px(arr, cx - 1, cy - 1, C["SLATE_3"])
    if cracked_lvl >= 2:
        put_px(arr, cx + 2, cy, C["CRIM_5"])
        put_px(arr, cx - 2, cy + 1, C["SLATE_1"])


def draw_astrolabe_helm(arr: np.ndarray, hx: int, hy: int, core_pulse: float = 1.0) -> None:
    """Hollow ornate brass astrolabe cage helmet with glowing Philosopher's Mercury Core inside."""
    # Dark interior void inside cage
    for dy in range(-4, 4):
        for dx in range(-3, 4):
            if dx * dx + dy * dy <= 13:
                put_px(arr, hx + dx, hy + dy, C["SLATE_0"])

    # Glowing Silver-Cyan Mercury Core floating inside cage (lum > 0.72 triggers Bloom!)
    core_r = 2 if core_pulse >= 0.9 else 1
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            d2 = dx * dx + dy * dy
            if d2 == 0:
                put_px(arr, hx + dx, hy + dy, C["PORC_5"])
            elif d2 <= core_r + 1:
                put_px(arr, hx + dx, hy + dy, C["CYAN"])
            elif d2 <= 4:
                put_px(arr, hx + dx, hy + dy, C["PORC_3"])

    # Ornate Brass Cage Ribs & Astrolabe Equatorial Ring
    cage_pts = [
        (-4, -1, C["BRASS_3"]), (-4, 0, C["BRASS_4"]), (-3, -3, C["BRASS_4"]), (-2, -4, C["BRASS_5"]),
        (0, -5, C["GOLD"]), (2, -4, C["BRASS_6"]), (3, -3, C["GOLD"]), (4, -1, C["BRASS_6"]),
        (4, 0, C["GOLD"]), (3, 2, C["BRASS_5"]), (-3, 2, C["BRASS_2"]),
        (-2, 3, C["BRASS_3"]), (0, 3, C["BRASS_5"]), (2, 3, C["BRASS_4"]),
        (-1, -1, C["BRASS_5"]), (3, -1, C["GOLD"]),
    ]
    for dx, dy, col in cage_pts:
        put_px(arr, hx + dx, hy + dy, col)


def draw_leg(arr: np.ndarray, hip_x: int, hip_y: int, knee_x: int, knee_y: int, foot_x: int, foot_y: int, front: bool) -> None:
    thigh_col = C["SLATE_4"] if front else C["SLATE_2"]
    thigh_hi = C["SLATE_5"] if front else C["SLATE_3"]
    boot_col = C["BRASS_2"] if front else C["BRASS_1"]
    boot_hi = C["BRASS_5"] if front else C["BRASS_3"]
    draw_thick_segment(arr, hip_x, hip_y, knee_x, knee_y, 1.6, thigh_col, thigh_hi)
    draw_thick_segment(arr, knee_x, knee_y, foot_x, foot_y, 1.4, boot_col, boot_hi)
    # Boot toe
    draw_thick_segment(arr, foot_x, foot_y, foot_x + 2.5, foot_y, 1.2, boot_col, boot_hi)


def draw_blade(arr: np.ndarray, hand_x: int, hand_y: int, tip_x: int, tip_y: int, glow: bool = False) -> None:
    draw_thick_segment(arr, hand_x, hand_y, tip_x, tip_y, 1.1, C["PORC_2"], C["PORC_5"] if glow else C["PORC_4"])
    put_px(arr, hand_x, hand_y, C["GOLD"])
    put_px(arr, hand_x - 1, hand_y + 1, C["BRASS_4"])


def draw_slash_arc(
    arr: np.ndarray,
    cx: int,
    cy: int,
    rx: float,
    ry: float,
    deg_start: float,
    deg_end: float,
    outer_col: tuple[int, int, int, int],
    inner_col: tuple[int, int, int, int],
) -> None:
    steps = 48
    for s in range(steps + 1):
        t = s / float(steps)
        ang = math.radians(deg_start + (deg_end - deg_start) * t)
        thickness = math.sin(t * math.pi) * 4.2
        for r_off in np.linspace(-thickness, 0.8, 7):
            px = int(round(cx + (rx + r_off) * math.cos(ang)))
            py = int(round(cy + (ry + r_off) * math.sin(ang)))
            col = outer_col if r_off > -1.2 else inner_col
            put_px(arr, px, py, col)


def render_hero_state_frames(out_dir: Path) -> int:
    """Synthesizes all 59 frames across Vessel-09's 10 canonical FSM states at 64x64px."""
    out_dir.mkdir(parents=True, exist_ok=True)
    count = 0

    def finalize_and_save(body: np.ndarray, vfx_unoutlined: np.ndarray | None, name: str) -> None:
        nonlocal count
        outlined = add_1px_outline(body, C["OUTLINE"])
        if vfx_unoutlined is not None:
            mask = vfx_unoutlined[:, :, 3] > 0
            outlined[mask] = vfx_unoutlined[mask]
        Image.fromarray(outlined, mode="RGBA").save(out_dir / f"{name}.png")
        count += 1

    # 1. hero_idle (6 frames)
    for f in range(6):
        phase = (f / 6.0) * 2.0 * math.pi
        bob = int(round(math.sin(phase) * 1.0))
        body = np.zeros((64, 64, 4), dtype=np.uint8)
        draw_scarf(body, 29, 34 + bob, phase, 14, 158)
        draw_leg(body, 30, 48 + bob, 28, 55, 26, 62, front=False)
        draw_leg(body, 34, 48 + bob, 37, 55, 38, 62, front=True)
        draw_blade(body, 27, 44 + bob, 16, 51 + bob)
        draw_porcelain_torso(body, 32, 39 + bob, lean_px=1)
        draw_thick_segment(body, 35, 36 + bob, 39, 43 + bob, 1.5, C["PORC_2"], C["PORC_4"])
        draw_astrolabe_helm(body, 33, 27 + bob, core_pulse=0.9 + 0.2 * math.sin(phase))
        finalize_and_save(body, None, f"hero_idle_{f}")

    # 2. hero_run (8 frames)
    for f in range(8):
        phase = (f / 8.0) * 2.0 * math.pi
        bob = -abs(int(round(math.sin(phase) * 2.0)))
        stride = math.sin(phase)
        opp = math.sin(phase + math.pi)
        body = np.zeros((64, 64, 4), dtype=np.uint8)
        draw_scarf(body, 29, 34 + bob, phase * 1.5, 19, 174)
        # Back leg
        draw_leg(
            body, 31, 47 + bob,
            int(round(32 + opp * 6)), int(round(54 - max(0.0, -opp) * 3)),
            int(round(31 + opp * 10)), int(round(61 - max(0.0, -opp) * 5)),
            front=False,
        )
        # Front leg
        draw_leg(
            body, 34, 47 + bob,
            int(round(34 + stride * 7)), int(round(54 - max(0.0, -stride) * 3)),
            int(round(33 + stride * 11)), int(round(62 - max(0.0, -stride) * 5)),
            front=True,
        )
        draw_blade(body, int(round(29 - stride * 4)), 43 + bob, int(round(16 - stride * 4)), 46 + bob)
        draw_porcelain_torso(body, 34, 39 + bob, lean_px=4)
        draw_thick_segment(body, 36, 36 + bob, int(round(41 + opp * 4)), 42 + bob, 1.5, C["PORC_2"], C["PORC_4"])
        draw_astrolabe_helm(body, 38, 28 + bob, core_pulse=1.0)
        finalize_and_save(body, None, f"hero_run_{f}")

    # 3. hero_jump_fall (4 frames: 0-1 upward leap, 2-3 downward fall)
    for f in range(4):
        body = np.zeros((64, 64, 4), dtype=np.uint8)
        rising = f < 2
        cy = 34 if rising else 37
        scarf_ang = 122 + f * 8 if rising else 235 + (f - 2) * 10
        draw_scarf(body, 30, cy - 4, f * 1.2, 16, scarf_ang)
        if rising:
            draw_leg(body, 30, cy + 8, 35, cy + 12, 31, cy + 18, front=False)
            draw_leg(body, 34, cy + 8, 40, cy + 10, 37, cy + 16, front=True)
            draw_porcelain_torso(body, 33, cy, lean_px=2)
            draw_blade(body, 28, cy + 3, 18, cy + 11)
            draw_astrolabe_helm(body, 35, cy - 12, core_pulse=1.1)
        else:
            draw_leg(body, 30, cy + 8, 28, cy + 15, 26, cy + 22, front=False)
            draw_leg(body, 34, cy + 8, 37, cy + 14, 39, cy + 20, front=True)
            draw_porcelain_torso(body, 32, cy, lean_px=-1)
            draw_blade(body, 37, cy - 2, 48, cy - 9)
            draw_astrolabe_helm(body, 32, cy - 12, core_pulse=0.95)
        finalize_and_save(body, None, f"hero_jump_fall_{f}")

    # 4. hero_djump (4 frames: mid-air somersault + mercury vapor burst)
    for f in range(4):
        body = np.zeros((64, 64, 4), dtype=np.uint8)
        vfx = np.zeros((64, 64, 4), dtype=np.uint8)
        ang = f * 85
        draw_scarf(body, 31, 35, f * 1.9, 14, 150 + ang)
        tuck = 1 if f in (1, 2) else 0
        draw_leg(body, 30, 42 - tuck * 3, 36, 45 - tuck * 3, 33, 50 - tuck * 2, front=True)
        draw_porcelain_torso(body, 32, 36 - tuck * 2, lean_px=3 - f)
        draw_astrolabe_helm(body, 34, 25 - tuck, core_pulse=1.2)
        # Mercury vapor ring under boots
        ring_y = 53 + f * 2
        ring_rx = 6 + f * 3
        for dx in range(-ring_rx, ring_rx + 1):
            if abs(dx) >= ring_rx - 3:
                put_px(vfx, 32 + dx, ring_y, C["PORC_5"] if f < 2 else C["CYAN"])
                put_px(vfx, 32 + dx, ring_y + 1, C["PORC_2"])
        finalize_and_save(body, vfx, f"hero_djump_{f}")

    # 5. hero_wall_slide (3 frames: magnetic brass claw gripping wall on right + sparks)
    for f in range(3):
        body = np.zeros((64, 64, 4), dtype=np.uint8)
        vfx = np.zeros((64, 64, 4), dtype=np.uint8)
        draw_scarf(body, 32, 34, f * 1.7, 14, 240)
        draw_leg(body, 34, 46, 39, 51, 43, 56, front=False)
        draw_leg(body, 36, 46, 41, 49, 44, 52, front=True)
        draw_porcelain_torso(body, 35, 38, lean_px=-2)
        # Magnetic brass claw arm reaching up-right onto wall x=45
        draw_thick_segment(body, 37, 34, 44, 26, 1.6, C["BRASS_4"], C["GOLD"])
        draw_astrolabe_helm(body, 33, 27, core_pulse=1.0)
        # Wall friction sparks
        for s in range(3):
            put_px(vfx, 44 - ((f + s) % 3), 24 - s * 2, C["GOLD"] if s == 0 else C["EMBER_4"])
        finalize_and_save(body, vfx, f"hero_wall_slide_{f}")

    # 6. hero_dodge_roll (6 frames: dive roll liquefying into quicksilver streak mid-roll)
    for f in range(6):
        body = np.zeros((64, 64, 4), dtype=np.uint8)
        vfx = np.zeros((64, 64, 4), dtype=np.uint8)
        if f in (1, 2, 3):
            # Compact quicksilver liquid-metal vortex roll close to ground
            cy = 49
            for dy in range(-8, 9):
                for dx in range(-11, 12):
                    if (dx * dx) / 121.0 + (dy * dy) / 64.0 <= 1.0:
                        swirl = math.sin(dx * 0.45 + dy * 0.5 + f * 1.6)
                        col = C["PORC_5"] if swirl > 0.55 else (C["CYAN"] if swirl > 0.0 else C["PORC_1"])
                        put_px(body, 33 + dx, cy + dy, col)
            # Trailing silver droplets
            for k in range(5):
                put_px(vfx, 16 + k * 3, 50 + ((k + f) % 3) * 2, C["CYAN"] if k % 2 == 0 else C["PORC_4"])
        else:
            crouch = 4 if f == 0 else 5
            draw_scarf(body, 28, 38 + crouch, f * 1.4, 16, 175)
            draw_leg(body, 30, 50, 25, 57, 21, 62, front=False)
            draw_leg(body, 35, 50, 41, 56, 44, 62, front=True)
            draw_porcelain_torso(body, 33, 43 + crouch // 2, lean_px=4)
            draw_astrolabe_helm(body, 37, 32 + crouch // 2, core_pulse=1.1)
        finalize_and_save(body, vfx, f"hero_dodge_roll_{f}")

    # 7. hero_parry (5 frames: snapping heavy buckler + silver-gold shockwave arc)
    for f in range(5):
        body = np.zeros((64, 64, 4), dtype=np.uint8)
        vfx = np.zeros((64, 64, 4), dtype=np.uint8)
        lunge = 2 if f in (1, 2) else 0
        draw_scarf(body, 28, 35, f * 1.1, 15, 168)
        draw_leg(body, 29, 48, 25, 55, 22, 62, front=False)
        draw_leg(body, 35, 48, 40 + lunge, 55, 42 + lunge, 62, front=True)
        draw_porcelain_torso(body, 33 + lunge, 39, lean_px=2)
        draw_astrolabe_helm(body, 35 + lunge, 27, core_pulse=1.2)
        # Heavy riveted alchemical buckler in front
        bx = 42 + lunge * 2
        for dy in range(-7, 8):
            for dx in range(-2, 3):
                if abs(dy) <= 6 or dx <= 1:
                    col = C["GOLD"] if (dx >= 1 and abs(dy) <= 3) else (C["BRASS_5"] if dx >= 0 else C["SLATE_4"])
                    put_px(body, bx + dx, 39 + dy, col)
        if f in (1, 2):
            draw_slash_arc(vfx, bx + 2, 39, 10 + f * 3, 14 + f * 2, -65, 65, C["PORC_5"], C["GOLD"])
        finalize_and_save(body, vfx, f"hero_parry_{f}")

    # 8. hero_atk_slash (12 frames: 3-hit melee combo 4+4+4 with distinct smear arcs)
    for f in range(12):
        body = np.zeros((64, 64, 4), dtype=np.uint8)
        vfx = np.zeros((64, 64, 4), dtype=np.uint8)
        hit_idx = f // 4
        sub = f % 4
        lunge = 3 if sub in (1, 2) else 1
        draw_scarf(body, 27, 35, f * 1.3, 17, 172)
        draw_leg(body, 29, 48, 24, 55, 21, 62, front=False)
        draw_leg(body, 35, 48, 41 + lunge, 55, 44 + lunge, 62, front=True)
        draw_porcelain_torso(body, 34 + lunge, 39, lean_px=3 + lunge)
        draw_astrolabe_helm(body, 37 + lunge, 28, core_pulse=1.15)

        if hit_idx == 0:
            # Hit 1: Wide horizontal forehand surgical slash (crimson + quicksilver smear)
            if sub == 0:
                draw_blade(body, 29, 36, 17, 28, glow=True)
            elif sub in (1, 2):
                draw_blade(body, 40, 39, 58, 40, glow=True)
                draw_slash_arc(vfx, 36, 39, 21 if sub == 1 else 18, 9, -38, 42, C["PORC_5"], C["CRIM_6"])
            else:
                draw_blade(body, 39, 42, 52, 47)
        elif hit_idx == 1:
            # Hit 2: Upward diagonal backhand cleave (astral gold + silver smear)
            if sub == 0:
                draw_blade(body, 34, 45, 22, 53, glow=True)
            elif sub in (1, 2):
                draw_blade(body, 40, 34, 55, 18, glow=True)
                draw_slash_arc(vfx, 35, 39, 19, 18, 45, -72, C["PORC_5"], C["GOLD"])
            else:
                draw_blade(body, 38, 31, 47, 17)
        else:
            # Hit 3: Lunging overhead heavy execution strike (molten furnace + cyan mercury arc)
            if sub == 0:
                draw_blade(body, 33, 25, 21, 12, glow=True)
            elif sub in (1, 2):
                draw_blade(body, 42, 43, 60, 56, glow=True)
                draw_slash_arc(vfx, 35, 37, 23, 22, -82, 58, C["PORC_5"], C["EMBER_4"] if sub == 1 else C["CYAN"])
            else:
                draw_blade(body, 41, 46, 56, 58)

        finalize_and_save(body, vfx, f"hero_atk_slash_{f}")

    # 9. hero_hurt (3 frames: backward recoil + splashing mercury droplets)
    for f in range(3):
        body = np.zeros((64, 64, 4), dtype=np.uint8)
        vfx = np.zeros((64, 64, 4), dtype=np.uint8)
        recoil = 3 - f
        draw_scarf(body, 31 - recoil, 36, f, 13, 140)
        draw_leg(body, 29 - recoil, 48, 25 - recoil, 55, 24 - recoil, 62, front=False)
        draw_leg(body, 33 - recoil, 48, 37 - recoil, 56, 39 - recoil, 61, front=True)
        draw_porcelain_torso(body, 30 - recoil, 40, lean_px=-4, cracked_lvl=2)
        draw_astrolabe_helm(body, 27 - recoil, 28, core_pulse=1.25)
        for d in range(4):
            put_px(vfx, 29 + d * 4 + f * 2, 22 - d * 2 + f * 3, C["PORC_5"] if d % 2 == 0 else C["CYAN"])
        finalize_and_save(body, vfx, f"hero_hurt_{f}")

    # 10. hero_collapse (8 frames: porcelain shattering to knees & mercury core draining into floor)
    for f in range(8):
        body = np.zeros((64, 64, 4), dtype=np.uint8)
        vfx = np.zeros((64, 64, 4), dtype=np.uint8)
        drop = min(18, f * 3)
        if f < 5:
            draw_scarf(body, 29, 38 + drop, f, 12, 165)
            draw_leg(body, 30, 50 + drop // 3, 27, 58, 24, 62, front=False)
            draw_leg(body, 34, 50 + drop // 3, 38, 59, 41, 62, front=True)
            draw_porcelain_torso(body, 32, 41 + drop // 2, lean_px=-2, cracked_lvl=2)
            draw_astrolabe_helm(body, 31, 29 + int(drop * 0.8), core_pulse=max(0.3, 1.0 - f * 0.15))
        else:
            # Shattered porcelain shards & brass helm on floor + glowing mercury puddle draining
            for sx, scol in [(-9, C["PORC_3"]), (-5, C["PORC_4"]), (0, C["BRASS_5"]), (5, C["PORC_2"]), (9, C["CRIM_4"])]:
                draw_thick_segment(body, 32 + sx, 59, 34 + sx, 61, 1.6, scol, C["PORC_5"])
            puddle_r = 4 + (f - 4) * 3
            for dx in range(-puddle_r, puddle_r + 1):
                put_px(vfx, 32 + dx, 62, C["CYAN"] if abs(dx) > 3 else C["PORC_5"])
                put_px(vfx, 32 + dx // 2, 61, C["PORC_4"])
        finalize_and_save(body, vfx, f"hero_collapse_{f}")

    return count


# ==============================================================================
# Biome 01: 47-Tile Blob Autotile + 9 Special Structural Tiles (8x7 = 128x112px)
# ==============================================================================
BIT_N, BIT_NE, BIT_E, BIT_SE, BIT_S, BIT_SW, BIT_W, BIT_NW = 1, 2, 4, 8, 16, 32, 64, 128


def gate_blob_bitmask(raw: int) -> int:
    n = (raw & BIT_N) != 0
    e = (raw & BIT_E) != 0
    s = (raw & BIT_S) != 0
    w = (raw & BIT_W) != 0
    g = raw & (BIT_N | BIT_E | BIT_S | BIT_W)
    if n and e and (raw & BIT_NE):
        g |= BIT_NE
    if s and e and (raw & BIT_SE):
        g |= BIT_SE
    if s and w and (raw & BIT_SW):
        g |= BIT_SW
    if n and w and (raw & BIT_NW):
        g |= BIT_NW
    return g


def canonical_47_masks() -> list[int]:
    return sorted({gate_blob_bitmask(r) for r in range(256)})


def render_slag_autotile_cell(mask: int, variant_ember: bool = False) -> np.ndarray:
    """Renders a 16x16 Slag Retort riveted cast-iron & soot-brick tile matching 8-neighbor bitmask."""
    cell = np.zeros((16, 16, 4), dtype=np.uint8)
    has_n = (mask & BIT_N) != 0
    has_e = (mask & BIT_E) != 0
    has_s = (mask & BIT_S) != 0
    has_w = (mask & BIT_W) != 0

    # Base soot-darkened stone brick courses (4px rows with staggered vertical mortar seams)
    for y in range(16):
        course = y // 4
        is_h_mortar = (y % 4) == 3
        stagger = 4 if (course % 2 == 1) else 0
        for x in range(16):
            is_v_mortar = ((x + stagger) % 8) == 7
            if is_h_mortar or is_v_mortar:
                cell[y, x] = C["OUTLINE"]
            else:
                local_y = y % 4
                local_x = (x + stagger) % 8
                if local_y == 0 and local_x < 6:
                    cell[y, x] = C["SLATE_4"]
                elif local_y == 1:
                    cell[y, x] = C["SLATE_3"] if (course + x // 8) % 2 == 0 else C["SLATE_2"]
                else:
                    cell[y, x] = C["SLATE_1"]

    if variant_ember:
        for gx, gy in [(4, 5), (5, 5), (6, 6), (9, 9), (10, 10), (11, 10)]:
            cell[gy, gx] = C["EMBER_3"] if (gx + gy) % 2 == 0 else C["GOLD"]

    # Exposed North (top walkable deck): Heavy riveted cast-iron floor plate + specular bevel
    if not has_n:
        for x in range(16):
            cell[0, x] = C["OUTLINE"]
            cell[1, x] = C["PORC_0"] if (x % 4 != 3) else C["SLATE_5"]
            cell[2, x] = C["SLATE_5"]
            cell[3, x] = C["BRASS_2"]
            if x in (2, 6, 10, 14):
                cell[2, x] = C["BRASS_6"]

    # Exposed South (ceiling underside girder)
    if not has_s:
        for x in range(16):
            cell[15, x] = C["OUTLINE"]
            cell[14, x] = C["SLATE_0"]
            cell[13, x] = C["BRASS_1"]

    # Exposed West (left vertical iron trim)
    if not has_w:
        for y in range(16):
            cell[y, 0] = C["OUTLINE"]
            cell[y, 1] = C["SLATE_5"] if (0 < y < 15) else C["OUTLINE"]
            cell[y, 2] = C["SLATE_2"]
            if y in (3, 8, 12) and (has_n or y > 3):
                cell[y, 1] = C["BRASS_5"]

    # Exposed East (right vertical iron trim)
    if not has_e:
        for y in range(16):
            cell[y, 15] = C["OUTLINE"]
            cell[y, 14] = C["SLATE_4"] if (0 < y < 15) else C["OUTLINE"]
            cell[y, 13] = C["SLATE_1"]
            if y in (3, 8, 12) and (has_n or y > 3):
                cell[y, 14] = C["BRASS_4"]

    # Inner concave corner brass gusset bolts when orthogonal neighbors exist but diagonal is air
    if has_n and has_w and not (mask & BIT_NW):
        cell[0:3, 0:3] = C["BRASS_2"]
        cell[1, 1] = C["GOLD"]
    if has_n and has_e and not (mask & BIT_NE):
        cell[0:3, 13:16] = C["BRASS_2"]
        cell[1, 14] = C["GOLD"]
    if has_s and has_w and not (mask & BIT_SW):
        cell[13:16, 0:3] = C["BRASS_1"]
        cell[14, 1] = C["BRASS_5"]
    if has_s and has_e and not (mask & BIT_SE):
        cell[13:16, 13:16] = C["BRASS_1"]
        cell[14, 14] = C["BRASS_5"]

    return cell


def render_special_tile(slot_idx: int) -> np.ndarray:
    """Renders special structural tiles (slots 47..55) for Biome 01."""
    if slot_idx == 47:
        return render_slag_autotile_cell(0xFF, variant_ember=True)

    cell = np.zeros((16, 16, 4), dtype=np.uint8)
    if slot_idx == 48:
        # Molten furnace grate block
        for y in range(16):
            for x in range(16):
                if y in (0, 15):
                    cell[y, x] = C["OUTLINE"]
                elif y in (1, 2):
                    cell[y, x] = C["BRASS_5"] if x % 4 == 1 else C["SLATE_5"]
                elif x % 4 in (0, 3):
                    cell[y, x] = C["SLATE_2"] if x % 4 == 0 else C["SLATE_0"]
                else:
                    cell[y, x] = C["GOLD"] if (y + x) % 5 == 0 else (C["EMBER_4"] if y < 9 else C["EMBER_2"])
        return cell

    if slot_idx in (49, 50, 51):
        # One-way brass & riveted grate catwalk (6px top thickness, transparent below)
        x_min = 1 if slot_idx == 49 else 0
        x_max = 15 if slot_idx == 51 else 16
        for x in range(x_min, x_max):
            cell[0, x] = C["OUTLINE"]
            cell[1, x] = C["BRASS_6"] if x % 3 != 0 else C["GOLD"]
            cell[2, x] = C["BRASS_3"]
            cell[3, x] = C["SLATE_3"] if x % 2 == 0 else C["OUTLINE"]
            cell[4, x] = C["BRASS_1"]
            cell[5, x] = C["OUTLINE"]
        if slot_idx == 49:
            cell[0:6, 0] = C["OUTLINE"]
        if slot_idx == 51:
            cell[0:6, 15] = C["OUTLINE"]
        return cell

    if slot_idx in (52, 53):
        # Magnetic claw climbable wall trim (left / right)
        base = render_slag_autotile_cell(BIT_N | BIT_S | (BIT_E if slot_idx == 52 else BIT_W))
        edge_x = 1 if slot_idx == 52 else 14
        for y in range(1, 15, 3):
            base[y, edge_x] = C["CYAN"]
            base[y + 1, edge_x] = C["GOLD"]
        return base

    # 54, 55: Breakable cracked slag floor
    base = render_slag_autotile_cell(BIT_E | BIT_W)
    for k in range(3, 13):
        cx = k
        cy = 3 + ((k * 3) % 9)
        base[cy, cx] = C["EMBER_4"]
        base[min(14, cy + 1), cx] = C["GOLD"]
    return base


def build_biome01_tileset(raw_out_png: Path, meta_out_json: Path) -> None:
    cols, rows = 8, 7
    sheet = np.zeros((rows * 16, cols * 16, 4), dtype=np.uint8)
    masks = canonical_47_masks()
    assert len(masks) == 47, f"Expected 47 canonical masks, got {len(masks)}"

    tile_entries = []
    for idx, mask in enumerate(masks):
        r, c = divmod(idx, cols)
        sheet[r * 16 : (r + 1) * 16, c * 16 : (c + 1) * 16] = render_slag_autotile_cell(mask)
        tile_entries.append({"index": idx, "kind": "autotile47", "bitmask": mask, "x": c * 16, "y": r * 16})

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
        sheet[r * 16 : (r + 1) * 16, c * 16 : (c + 1) * 16] = render_special_tile(idx)
        tile_entries.append({"index": idx, "kind": special_names[idx], "x": c * 16, "y": r * 16})

    raw_out_png.parent.mkdir(parents=True, exist_ok=True)
    meta_out_json.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, mode="RGBA").save(raw_out_png)
    meta_out_json.write_text(
        json.dumps(
            {
                "biomeId": "biome_01_slag_retort",
                "tileSize": 16,
                "columns": cols,
                "rows": rows,
                "image": "biome01_slag_tileset.png",
                "normalMap": "biome01_slag_tileset_n.png",
                "tiles": tile_entries,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def synthesize_near_pipes_and_cages_L3() -> np.ndarray:
    """Synthesizes L3 (640x360) near-plane riveted steam pipes & hanging white porcelain cages."""
    img = Image.new("RGBA", (640, 360), (255, 0, 255, 255))
    draw = ImageDraw.Draw(img)

    # Top horizontal riveted cast-iron & brass steam header pipe spanning 0..640 seamlessly
    draw.rectangle([0, 14, 639, 34], fill=(17, 19, 28, 255))
    draw.rectangle([0, 16, 639, 22], fill=(122, 81, 40, 255))
    draw.rectangle([0, 18, 639, 20], fill=(224, 174, 83, 255))
    draw.rectangle([0, 23, 639, 31], fill=(61, 40, 23, 255))
    for rx in range(0, 640, 32):
        draw.rectangle([rx, 13, rx + 5, 35], fill=(89, 58, 30, 255))
        draw.point([(rx + 2, 16), (rx + 2, 32)], fill=(251, 191, 36, 255))

    # Hanging iron chains + suspended white porcelain homunculus specimen cages (keep center 230..410 open!)
    for cx, cage_top in [(92, 98), (536, 86)]:
        for cy in range(35, cage_top, 4):
            draw.rectangle([cx - 1, cy, cx + 1, cy + 2], fill=(50, 57, 84, 255))
        # Cage dome & base
        draw.arc([cx - 14, cage_top, cx + 14, cage_top + 18], 180, 0, fill=(194, 139, 66, 255), width=2)
        draw.rectangle([cx - 14, cage_top + 9, cx + 14, cage_top + 42], outline=(158, 107, 52, 255), width=2)
        for bx in range(-10, 11, 5):
            draw.line([(cx + bx, cage_top + 9), (cx + bx, cage_top + 41)], fill=(89, 58, 30, 255), width=1)
        # Cracked porcelain vessel silhouette & glowing emerald/cyan vial inside cage
        draw.ellipse([cx - 5, cage_top + 19, cx + 5, cage_top + 33], fill=(212, 222, 232, 255))
        draw.rectangle([cx - 2, cage_top + 23, cx + 2, cage_top + 27], fill=(60, 230, 130, 255))
        draw.rectangle([cx - 16, cage_top + 40, cx + 16, cage_top + 44], fill=(61, 40, 23, 255))

    return np.array(img, dtype=np.uint8)


def build_biome01_parallax_raw(raw_assets_dir: Path, out_dir: Path) -> None:
    """Prepares 5 raw 640x360 parallax plates (ingesting multimodal plates when available)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    mapping = [
        ("L0", raw_assets_dir / "biome01_cavern_L0_raw.jpg", 0.62),
        ("L1", raw_assets_dir / "biome01_smokestacks_L1_raw.jpg", 0.85),
        ("L2", raw_assets_dir / "biome01_archway_L2_raw.jpg", 0.92),
        ("L3", None, 1.0),
        ("L4", raw_assets_dir / "biome01_foreground_L4_raw.jpg", 0.90),
    ]

    for layer_id, src_jpg, brightness in mapping:
        dst_png = out_dir / f"biome01_parallax_{layer_id}.png"
        if src_jpg is not None and src_jpg.exists():
            im = Image.open(src_jpg).convert("RGBA")
            arr = np.array(im, dtype=np.float32)
            # Darken non-magenta pixels slightly on far background layers for strong foreground readability
            r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
            is_mag = (np.abs(r - b) < 72.0) & (r > 105.0) & (b > 105.0) & ((r - g) > 62.0)
            for ch in range(3):
                arr[:, :, ch] = np.where(is_mag, arr[:, :, ch], arr[:, :, ch] * brightness)
            Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGBA").save(dst_png)
        else:
            arr = synthesize_near_pipes_and_cages_L3()
            Image.fromarray(arr, mode="RGBA").save(dst_png)


def main() -> None:
    parser = argparse.ArgumentParser(description="QUICKSILVER CRUCIBLE Asset Factory Generator")
    parser.add_argument(
        "--asset",
        choices=["all_m2", "hero_vessel09", "biome01_tileset", "biome01_parallax"],
        default="all_m2",
    )
    parser.add_argument("--raw-dir", type=Path, default=Path(".tmp/raw_assets"))
    parser.add_argument("--list-prompts", action="store_true")
    parser.add_argument("--print-prompt", type=str, default=None)
    args = parser.parse_args()

    if args.list_prompts:
        for k in PROMPT_CATALOG:
            print(k)
        return
    if args.print_prompt:
        print(PROMPT_CATALOG[args.print_prompt])
        return

    if args.asset in ("all_m2", "hero_vessel09"):
        n_frames = render_hero_state_frames(args.raw_dir / "hero")
        print(f"✅ Generated Vessel-09 raw frames: {n_frames} frames (64x64) -> {args.raw_dir / 'hero'}")

    if args.asset in ("all_m2", "biome01_tileset"):
        build_biome01_tileset(
            args.raw_dir / "tilemaps" / "biome01_slag_tileset.png",
            Path("public/assets/tilemaps/biome01_slag_tileset.json"),
        )
        print("✅ Generated Biome 01 47-Tile + special tileset -> .tmp/raw_assets/tilemaps/")

    if args.asset in ("all_m2", "biome01_parallax"):
        build_biome01_parallax_raw(args.raw_dir, args.raw_dir / "parallax")
        print("✅ Prepared Biome 01 5-layer raw parallax plates -> .tmp/raw_assets/parallax/")


if __name__ == "__main__":
    main()
