#!/usr/bin/env python3
"""
Milestone 9 Commercial Audio Mastering Factory (tools/audio-pipeline/generate_m9_audio_assets.py)

Generates the complete offline WAV masters for QUICKSILVER CRUCIBLE:
  1. 15 BGM / Low-HP Pulse Stems (exact bar-locked, zero-crossing seamless loops via zero_cross_loop.py)
  2. 24 Multi-Variant SFX Groups (71 distinct acoustic foley/impact clips, zero leading silence)

All 86 masters are normalized to -14.0 LUFS (-1.0 / -1.5 dBTP true-peak ceiling) via normalize_lufs.py
and exported to dual-codec .webm (Opus 48kHz) + .m4a (AAC 48kHz +faststart) via export_dual_codec.sh.
"""
import os
import sys

try:
    import numpy as np
except ImportError:
    for _cand in ("/opt/homebrew/bin/python3.14", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"):
        if os.path.exists(_cand) and os.path.realpath(_cand) != os.path.realpath(sys.executable):
            os.execv(_cand, [_cand, *sys.argv])
    raise

from concurrent.futures import ThreadPoolExecutor, as_completed
import math
from pathlib import Path
import shutil
import subprocess
import tempfile

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from normalize_lufs import normalize_wav_lufs, soft_true_peak_limit
from zero_cross_loop import cut_seamless_loop, write_wav_pcm24

SR = 48000
EXPORT_SH = SCRIPT_DIR / "export_dual_codec.sh"
OUT_STEMS = REPO_ROOT / "public" / "assets" / "audio" / "stems"
OUT_SFX = REPO_ROOT / "public" / "assets" / "audio" / "sfx"


def midi_hz(note: float) -> float:
    return 440.0 * (2.0 ** ((note - 69.0) / 12.0))


def adsr_env(n: int, atk_s: float, dec_s: float, sus: float, rel_s: float) -> np.ndarray:
    if n <= 0:
        return np.zeros(0, dtype=np.float64)
    t = np.arange(n, dtype=np.float64) / SR
    dur = n / SR
    atk = max(atk_s, 0.0008)
    dec = max(dec_s, 0.002)
    rel = min(max(rel_s, 0.003), dur * 0.65)
    env = np.where(
        t < atk,
        t / atk,
        np.where(t < atk + dec, 1.0 - (1.0 - sus) * ((t - atk) / dec), sus),
    )
    rel_start = dur - rel
    rel_mask = t >= rel_start
    env[rel_mask] *= np.clip(1.0 - (t[rel_mask] - rel_start) / rel, 0.0, 1.0) ** 1.4
    return env


def schroeder_reverb(stereo: np.ndarray, room_ms: tuple[float, float, float] = (29.7, 37.1, 43.3), wet: float = 0.22) -> np.ndarray:
    """Lightweight stereo comb-diffusion room ambience for gothic alchemy acoustics."""
    out = stereo * (1.0 - wet * 0.45)
    n = stereo.shape[0]
    for idx, d_ms in enumerate(room_ms):
        d = max(1, int(round(d_ms * 0.001 * SR)))
        if d >= n:
            continue
        ch = idx % 2
        buf = stereo[:, ch].copy()
        acc = np.zeros(n, dtype=np.float64)
        gain = 0.42 - idx * 0.07
        cur = buf
        shift = d
        for _ in range(4):
            if shift >= n:
                break
            acc[shift:] += cur[:-shift] * gain
            gain *= 0.46
            shift += d
        out[:, ch] += acc * wet
        out[:, 1 - ch] += acc * (wet * 0.68)
    return out


def synth_voice(freq: float, dur_s: float, timbre: str, rng: np.random.Generator, pan: float = 0.0) -> np.ndarray:
    n = max(16, int(round(dur_s * SR)))
    t = np.arange(n, dtype=np.float64) / SR
    vib = 1.0 + (0.0035 * np.sin(2.0 * math.pi * 5.4 * t) if timbre in ("cello", "violin", "choir") else 0.0)
    phase = np.cumsum(2.0 * math.pi * freq * vib / SR)

    if timbre == "cello":
        harmonics = [(1, 1.0), (2, 0.58), (3, 0.36), (4, 0.21), (5, 0.14), (6, 0.08)]
        env = adsr_env(n, min(0.09, dur_s * 0.22), 0.14, 0.76, min(0.18, dur_s * 0.3))
    elif timbre == "violin":
        harmonics = [(1, 0.9), (2, 0.72), (3, 0.52), (4, 0.31), (5, 0.22), (7, 0.11)]
        env = adsr_env(n, min(0.045, dur_s * 0.15), 0.08, 0.82, min(0.12, dur_s * 0.25))
    elif timbre == "glass":
        harmonics = [(1, 1.0), (2.756, 0.28), (4.0, 0.19), (5.404, 0.09)]
        env = adsr_env(n, 0.035, 0.22, 0.42, min(0.28, dur_s * 0.45))
    elif timbre == "harpsichord":
        harmonics = [(1, 1.0), (2, 0.82), (3, 0.64), (4, 0.45), (5, 0.31), (6, 0.20), (8, 0.12)]
        env = np.exp(-t * 5.8) * adsr_env(n, 0.0025, 0.06, 0.55, 0.06)
    elif timbre == "organ":
        harmonics = [(0.5, 0.55), (1, 1.0), (2, 0.76), (3, 0.48), (4, 0.62), (6, 0.28), (8, 0.22)]
        env = adsr_env(n, 0.025, 0.05, 0.90, min(0.10, dur_s * 0.22))
    elif timbre == "brass":
        harmonics = [(1, 0.88), (2, 0.95), (3, 0.78), (4, 0.56), (5, 0.38), (6, 0.24), (7, 0.14)]
        env = adsr_env(n, 0.018, 0.07, 0.74, min(0.09, dur_s * 0.24))
    elif timbre == "hurdy":
        harmonics = [(1, 1.0), (1.5, 0.35), (2, 0.84), (3, 0.68), (4, 0.44), (5, 0.32)]
        env = adsr_env(n, 0.012, 0.05, 0.82, min(0.08, dur_s * 0.2))
    elif timbre == "pizz":
        harmonics = [(1, 1.0), (2, 0.48), (3, 0.24), (4, 0.11)]
        env = np.exp(-t * 9.5) * adsr_env(n, 0.002, 0.04, 0.4, 0.04)
    elif timbre == "choir":
        harmonics = [(1, 1.0), (2, 0.66), (3, 0.45), (4, 0.22), (5, 0.15)]
        env = adsr_env(n, min(0.08, dur_s * 0.25), 0.10, 0.85, min(0.16, dur_s * 0.3))
    else:  # sub / bass
        harmonics = [(1, 1.0), (2, 0.42), (3, 0.18)]
        env = adsr_env(n, 0.008, 0.08, 0.75, min(0.09, dur_s * 0.25))

    sig = np.zeros(n, dtype=np.float64)
    for mult, amp in harmonics:
        p_off = rng.uniform(0.0, 2.0 * math.pi)
        sig += amp * np.sin(phase * mult + p_off)
    if timbre in ("hurdy", "brass"):
        sig = np.tanh(sig * 1.45)
    sig *= env / max(1.0, sum(a for _, a in harmonics) * 0.72)

    left_g = math.sqrt(0.5 * (1.0 - np.clip(pan, -0.85, 0.85)))
    right_g = math.sqrt(0.5 * (1.0 + np.clip(pan, -0.85, 0.85)))
    return np.column_stack([sig * left_g, sig * right_g])


def synth_drum(kind: str, rng: np.random.Generator) -> np.ndarray:
    if kind == "kick":
        n = int(0.24 * SR)
        t = np.arange(n) / SR
        f = 52.0 + 118.0 * np.exp(-t * 34.0)
        body = np.sin(np.cumsum(2.0 * math.pi * f / SR)) * np.exp(-t * 13.5)
        click = rng.normal(0, 0.25, n) * np.exp(-t * 95.0)
        s = np.tanh((body + click) * 1.5)
        return np.column_stack([s, s])
    if kind == "anvil":
        n = int(0.32 * SR)
        t = np.arange(n) / SR
        modes = (
            0.75 * np.sin(2 * math.pi * 884 * t)
            + 0.58 * np.sin(2 * math.pi * 1412 * t)
            + 0.42 * np.sin(2 * math.pi * 2390 * t)
            + 0.28 * np.sin(2 * math.pi * 3710 * t)
        ) * np.exp(-t * 16.5)
        trans = rng.normal(0, 0.6, n) * np.exp(-t * 110.0)
        thud = 0.55 * np.sin(2 * math.pi * 135 * t) * np.exp(-t * 24.0)
        s = np.tanh((modes + trans + thud) * 1.2)
        return np.column_stack([s * 0.95, s * 1.05])
    if kind == "snare":
        n = int(0.20 * SR)
        t = np.arange(n) / SR
        tone = 0.55 * np.sin(2 * math.pi * 192 * t) * np.exp(-t * 24.0)
        wires = rng.normal(0, 0.65, n) * np.exp(-t * 21.0)
        return np.column_stack([tone + wires, tone + np.roll(wires, 11)])
    # clockwork tick / escapement hi-hat
    n = int(0.065 * SR)
    t = np.arange(n) / SR
    ping = (0.6 * np.sin(2 * math.pi * 3420 * t) + 0.45 * np.sin(2 * math.pi * 5290 * t)) * np.exp(-t * 72.0)
    noise = rng.normal(0, 0.35, n) * np.exp(-t * 88.0)
    return np.column_stack([(ping + noise) * 0.9, (ping + noise) * 1.0])


def mix_clip(canvas: np.ndarray, clip: np.ndarray, start_s: float, gain: float = 1.0) -> None:
    idx = max(0, int(round(start_s * SR)))
    if idx >= canvas.shape[0]:
        return
    end = min(canvas.shape[0], idx + clip.shape[0])
    canvas[idx:end] += clip[: end - idx] * gain


def render_musical_stem(
    stem_id: str,
    bpm: float,
    bars: int,
    beats_per_bar: int,
    root_midi: int,
    is_combat: bool,
    style: str,
    seed: int,
) -> tuple[np.ndarray, float, int, int]:
    rng = np.random.default_rng(seed)
    beat_s = 60.0 / bpm
    bar_s = beats_per_bar * beat_s
    # Render 1 extra bar so zero_cross_loop.py has clean musical overhang tail for seamless crossfade
    total_bars = bars + 1
    total_samples = int(round(total_bars * bar_s * SR)) + int(0.2 * SR)
    canvas = np.zeros((total_samples, 2), dtype=np.float64)

    # Dark harmonic minor / Phrygian alchemy chord roots (semitone offsets over 8-bar progression)
    prog_offsets = [0, 8, 3, 10, 5, 0, 7, 0]
    chord_triads = [
        (0, 3, 7), (0, 4, 7), (0, 4, 7), (0, 4, 7),
        (0, 3, 7), (0, 3, 7), (0, 4, 7), (0, 3, 7),
    ]
    scale_steps = [0, 2, 3, 5, 7, 8, 11, 12]

    pad_timbre = {
        "sanctum": "cello",
        "slag": "cello",
        "vitriol": "choir",
        "ossuary": "organ",
        "apex": "choir",
        "boss1": "brass",
        "boss2_p1": "cello",
        "boss2_p2": "organ",
        "boss2_p3": "violin",
    }.get(style, "cello")

    lead_timbre = {
        "sanctum": "glass",
        "slag": "hurdy" if is_combat else "pizz",
        "vitriol": "violin" if is_combat else "pizz",
        "ossuary": "organ" if is_combat else "harpsichord",
        "apex": "brass" if is_combat else "glass",
        "boss1": "brass",
        "boss2_p1": "harpsichord",
        "boss2_p2": "choir",
        "boss2_p3": "violin",
    }.get(style, "violin")

    kick = synth_drum("kick", rng)
    snare = synth_drum("snare", rng)
    anvil = synth_drum("anvil", rng)
    tick = synth_drum("tick", rng)

    for b in range(total_bars):
        p_idx = b % len(prog_offsets)
        bar_t0 = b * bar_s
        chord_root = root_midi + prog_offsets[p_idx]
        triad = chord_triads[p_idx]

        # 1. Deep Sub-Bass / Bowed Double Bass Pedal
        bass_note = chord_root - 12
        if is_combat:
            sub_div = beats_per_bar * 2
            step_dur = bar_s / sub_div
            for s in range(sub_div):
                oct_jump = 12 if (s % 2 == 1 and style in ("vitriol", "ossuary", "boss2_p3")) else 0
                v = synth_voice(midi_hz(bass_note + oct_jump), step_dur * 0.92, "bass", rng, pan=-0.05)
                mix_clip(canvas, v, bar_t0 + s * step_dur, gain=0.42)
        else:
            v = synth_voice(midi_hz(bass_note), bar_s * 1.02, "bass", rng, pan=-0.08)
            mix_clip(canvas, v, bar_t0, gain=0.34)

        # 2. Sustained Dark Harmonic Pad / Chamber Harmony
        for t_i, semi in enumerate(triad):
            pan = -0.32 + 0.32 * t_i
            pad = synth_voice(midi_hz(chord_root + semi), bar_s * 1.03, pad_timbre, rng, pan=pan)
            mix_clip(canvas, pad, bar_t0, gain=0.22 if is_combat else 0.25)

        # 3. Arpeggio / Melodic Ostinato Motif
        notes_in_bar = beats_per_bar * (2 if is_combat or style in ("ossuary", "boss2_p1") else 1)
        note_dur = bar_s / notes_in_bar
        for n_i in range(notes_in_bar):
            deg = scale_steps[(n_i * 2 + b) % len(scale_steps)]
            mel_midi = root_midi + 12 + deg + (12 if is_combat and n_i % 4 == 3 else 0)
            pan = 0.28 * math.sin(n_i * 1.3 + b)
            lead = synth_voice(midi_hz(mel_midi), note_dur * (0.85 if is_combat else 1.15), lead_timbre, rng, pan=pan)
            mix_clip(canvas, lead, bar_t0 + n_i * note_dur, gain=0.30 if is_combat else 0.24)

        # 4. Rhythm & Industrial Clockwork Percussion
        for bt in range(beats_per_bar):
            bt_t = bar_t0 + bt * beat_s
            if not is_combat:
                # Subtle pocket-watch / pipe escapement pulse in exploration & sanctum
                mix_clip(canvas, tick, bt_t, gain=0.14 if bt == 0 else 0.08)
                if bt == 0 and b % 2 == 0:
                    mix_clip(canvas, kick, bt_t, gain=0.18)
            else:
                # Driving action roguelite percussion
                if bt % 2 == 0:
                    mix_clip(canvas, kick, bt_t, gain=0.58)
                    if style in ("boss1", "boss2_p2", "boss2_p3"):
                        mix_clip(canvas, kick, bt_t + beat_s * 0.5, gain=0.40)
                else:
                    mix_clip(canvas, snare, bt_t, gain=0.46)
                    if style in ("slag", "boss1", "apex"):
                        mix_clip(canvas, anvil, bt_t, gain=0.38)
                mix_clip(canvas, tick, bt_t + beat_s * 0.5, gain=0.20)

    wet_amt = 0.18 if is_combat else 0.28
    canvas = schroeder_reverb(canvas, wet=wet_amt)
    return canvas, bpm, bars, beats_per_bar


def render_low_hp_pulse() -> tuple[np.ndarray, float, int, int]:
    """68 BPM visceral sub-bass mercury core heartbeat ('lub-dub') concentrated < 180Hz."""
    bpm = 68.0
    bars = 4
    beats_per_bar = 4
    beat_s = 60.0 / bpm
    total_bars = bars + 1
    total_samples = int(round(total_bars * beats_per_bar * beat_s * SR)) + int(0.2 * SR)
    canvas = np.zeros((total_samples, 2), dtype=np.float64)

    def heart_thump(f0: float, f1: float, dur: float, amp: float) -> np.ndarray:
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = f1 + (f0 - f1) * np.exp(-t * 22.0)
        w = np.sin(np.cumsum(2.0 * math.pi * f / SR)) * adsr_env(n, 0.012, 0.08, 0.25, 0.10) * amp
        return np.column_stack([w, w])

    lub = heart_thump(96.0, 46.0, 0.22, 0.85)
    dub = heart_thump(118.0, 52.0, 0.19, 0.62)

    for b in range(total_bars * beats_per_bar):
        t0 = b * beat_s
        mix_clip(canvas, lub, t0, 1.0)
        mix_clip(canvas, dub, t0 + 0.24, 1.0)

    return canvas, bpm, bars, beats_per_bar


def render_sfx_variant(sfx_id: str, variant_idx: int) -> np.ndarray:
    seed = ( abs(hash(f"{sfx_id}_{variant_idx}")) & 0xFFFFFFFF ) ^ (variant_idx * 0x9E3779B1)
    rng = np.random.default_rng(seed)
    v_detune = 1.0 + (variant_idx - 1.5) * 0.045

    def finish_stereo(mono_l: np.ndarray, mono_r: np.ndarray | None = None) -> np.ndarray:
        r = mono_l if mono_r is None else mono_r
        st = np.column_stack([mono_l, r])
        peak = float(np.max(np.abs(st)))
        if peak > 1e-6:
            st = st / peak * 0.82
        return st

    if sfx_id == "sfx_step_stone":
        n = int(0.125 * SR)
        t = np.arange(n) / SR
        thud = np.sin(2 * math.pi * (145 * v_detune) * t) * np.exp(-t * 48.0) * 0.75
        grit = rng.normal(0, 0.55, n) * np.exp(-t * 58.0)
        spur = 0.18 * np.sin(2 * math.pi * (2840 * v_detune) * t) * np.exp(-t * 70.0)
        return finish_stereo(thud + grit + spur)

    if sfx_id == "sfx_step_metal":
        n = int(0.135 * SR)
        t = np.arange(n) / SR
        ring = (
            0.55 * np.sin(2 * math.pi * (520 * v_detune) * t)
            + 0.42 * np.sin(2 * math.pi * (1180 * v_detune) * t)
            + 0.28 * np.sin(2 * math.pi * (2190 * v_detune) * t)
        ) * np.exp(-t * 36.0)
        clank = rng.normal(0, 0.45, n) * np.exp(-t * 75.0)
        return finish_stereo(ring + clank)

    if sfx_id == "sfx_jump_launch":
        n = int(0.185 * SR)
        t = np.arange(n) / SR
        f = (160.0 + 380.0 * (t / 0.185)) * v_detune
        whoosh = np.sin(np.cumsum(2 * math.pi * f / SR)) * adsr_env(n, 0.015, 0.06, 0.4, 0.09) * 0.55
        hiss = rng.normal(0, 0.45, n) * adsr_env(n, 0.008, 0.05, 0.35, 0.10)
        return finish_stereo(whoosh + hiss)

    if sfx_id == "sfx_djump_mercury":
        n = int(0.245 * SR)
        t = np.arange(n) / SR
        chime = (
            0.55 * np.sin(2 * math.pi * (1046 * v_detune) * t)
            + 0.40 * np.sin(2 * math.pi * (1568 * v_detune) * t)
            + 0.28 * np.sin(2 * math.pi * (2093 * v_detune) * t)
        ) * np.exp(-t * 14.0)
        vapor = rng.normal(0, 0.50, n) * adsr_env(n, 0.005, 0.07, 0.3, 0.14)
        return finish_stereo(chime + vapor, np.roll(chime, 18) + vapor)

    if sfx_id == "sfx_dodge_whoosh":
        n = int(0.220 * SR)
        t = np.arange(n) / SR
        f = (420.0 * np.exp(-t * 7.5) + 95.0) * v_detune
        sw = np.sin(np.cumsum(2 * math.pi * f / SR)) * adsr_env(n, 0.018, 0.08, 0.45, 0.10) * 0.65
        cloth = rng.normal(0, 0.42, n) * adsr_env(n, 0.012, 0.07, 0.35, 0.11)
        return finish_stereo(sw + cloth)

    if sfx_id == "sfx_swing_light":
        n = int(0.145 * SR)
        t = np.arange(n) / SR
        f = (1650.0 * np.exp(-t * 11.0) + 380.0) * v_detune
        blade = np.sin(np.cumsum(2 * math.pi * f / SR)) * adsr_env(n, 0.006, 0.04, 0.35, 0.08) * 0.55
        air = rng.normal(0, 0.5, n) * adsr_env(n, 0.005, 0.04, 0.3, 0.08)
        return finish_stereo(blade + air)

    if sfx_id == "sfx_swing_heavy":
        n = int(0.285 * SR)
        t = np.arange(n) / SR
        f = (340.0 * np.exp(-t * 6.5) + 68.0) * v_detune
        cleave = np.tanh(np.sin(np.cumsum(2 * math.pi * f / SR)) * 1.6) * adsr_env(n, 0.018, 0.09, 0.55, 0.14)
        chain = 0.25 * np.sin(2 * math.pi * (1920 * v_detune) * t) * np.exp(-t * 26.0)
        wind = rng.normal(0, 0.4, n) * adsr_env(n, 0.015, 0.10, 0.35, 0.14)
        return finish_stereo(cleave + chain + wind)

    if sfx_id == "sfx_hit_flesh":
        n = int(0.195 * SR)
        t = np.arange(n) / SR
        punch = np.sin(np.cumsum(2 * math.pi * (190 * np.exp(-t * 26) + 52) * v_detune / SR)) * np.exp(-t * 18.0)
        splat = np.tanh(rng.normal(0, 0.9, n) * np.exp(-t * 28.0) * (1.0 + 0.6 * np.sin(2 * math.pi * 64 * t)))
        return finish_stereo(punch * 0.85 + splat * 0.65)

    if sfx_id == "sfx_hit_clockwork":
        n = int(0.205 * SR)
        t = np.arange(n) / SR
        modes = (
            0.65 * np.sin(2 * math.pi * (740 * v_detune) * t)
            + 0.52 * np.sin(2 * math.pi * (1390 * v_detune) * t)
            + 0.38 * np.sin(2 * math.pi * (2680 * v_detune) * t)
            + 0.24 * np.sin(2 * math.pi * (4120 * v_detune) * t)
        ) * np.exp(-t * 20.0)
        crunch = rng.normal(0, 0.65, n) * np.exp(-t * 55.0)
        return finish_stereo(np.tanh((modes + crunch) * 1.3))

    if sfx_id == "sfx_crit_impact":
        n = int(0.380 * SR)
        t = np.arange(n) / SR
        sub = np.sin(np.cumsum(2 * math.pi * (165 * np.exp(-t * 18) + 42) / SR)) * np.exp(-t * 8.5)
        bell = (
            0.55 * np.sin(2 * math.pi * (1318.5 * v_detune) * t)
            + 0.42 * np.sin(2 * math.pi * (1975.5 * v_detune) * t)
            + 0.30 * np.sin(2 * math.pi * (3136.0 * v_detune) * t)
        ) * np.exp(-t * 9.5)
        shatter = rng.normal(0, 0.7, n) * np.exp(-t * 36.0)
        return finish_stereo(np.tanh((sub * 0.9 + bell * 0.7 + shatter * 0.5) * 1.35))

    if sfx_id == "sfx_parry_clang":
        n = int(0.450 * SR)
        t = np.arange(n) / SR
        ring = (
            0.70 * np.sin(2 * math.pi * (1174.7 * v_detune) * t)
            + 0.55 * np.sin(2 * math.pi * (1760.0 * v_detune) * t)
            + 0.42 * np.sin(2 * math.pi * (2793.8 * v_detune) * t)
            + 0.28 * np.sin(2 * math.pi * (4186.0 * v_detune) * t)
        ) * np.exp(-t * 6.8)
        boom = 0.75 * np.sin(np.cumsum(2 * math.pi * (140 * np.exp(-t * 14) + 46) / SR)) * np.exp(-t * 9.0)
        spark = rng.normal(0, 0.55, n) * np.exp(-t * 65.0)
        l_ch = np.tanh((ring + boom + spark) * 1.25)
        return finish_stereo(l_ch, np.roll(l_ch, 24))

    if sfx_id == "sfx_breach_stun":
        n = int(0.400 * SR)
        t = np.arange(n) / SR
        f = (460.0 * np.exp(-t * 4.2) + 85.0) * v_detune
        spring = np.tanh(np.sin(np.cumsum(2 * math.pi * f / SR)) * 1.7) * np.exp(-t * 5.5)
        crack = rng.normal(0, 0.75, n) * np.exp(-t * 28.0)
        return finish_stereo(spring * 0.8 + crack * 0.6)

    if sfx_id == "sfx_bow_release":
        n = int(0.165 * SR)
        t = np.arange(n) / SR
        twang = (
            0.7 * np.sin(2 * math.pi * (245 * v_detune) * t)
            + 0.45 * np.sin(2 * math.pi * (490 * v_detune) * t)
            + 0.3 * np.sin(2 * math.pi * (980 * v_detune) * t)
        ) * np.exp(-t * 26.0)
        latch = rng.normal(0, 0.6, n) * np.exp(-t * 85.0)
        return finish_stereo(twang + latch)

    if sfx_id == "sfx_flask_shatter":
        n = int(0.355 * SR)
        t = np.arange(n) / SR
        shards = sum(
            (0.35 / (k + 1)) * np.sin(2 * math.pi * (1850 + k * 690) * v_detune * t) * np.exp(-t * (18 + k * 5))
            for k in range(5)
        )
        sizzle = rng.normal(0, 0.55, n) * adsr_env(n, 0.004, 0.08, 0.42, 0.22)
        return finish_stereo(shards + sizzle)

    if sfx_id == "sfx_voltaic_zap":
        n = int(0.205 * SR)
        t = np.arange(n) / SR
        fm = np.sin(2 * math.pi * (680 * v_detune) * t + 7.5 * np.sin(2 * math.pi * 92 * t))
        crackle = np.sign(fm) * 0.45 * np.exp(-t * 16.0) + rng.normal(0, 0.5, n) * np.exp(-t * 24.0)
        return finish_stereo(np.tanh(crackle * 1.4))

    if sfx_id == "sfx_status_freeze":
        n = int(0.320 * SR)
        t = np.arange(n) / SR
        ice = (
            0.60 * np.sin(2 * math.pi * (2093 * v_detune) * t)
            + 0.48 * np.sin(2 * math.pi * (2637 * v_detune) * t)
            + 0.35 * np.sin(2 * math.pi * (3520 * v_detune) * t)
        ) * np.exp(-t * 11.5)
        crack = rng.normal(0, 0.6, n) * np.exp(-t * 42.0)
        return finish_stereo(ice + crack, np.roll(ice, 15) + crack)

    if sfx_id == "sfx_hemorrhage_pop":
        n = int(0.360 * SR)
        t = np.arange(n) / SR
        thud = np.sin(np.cumsum(2 * math.pi * (135 * np.exp(-t * 16) + 38) / SR)) * np.exp(-t * 9.0)
        burst = rng.normal(0, 0.85, n) * adsr_env(n, 0.035, 0.08, 0.35, 0.20)
        return finish_stereo(np.tanh((thud + burst * 0.7) * 1.4))

    if sfx_id == "sfx_enemy_warn_parry":
        n = int(0.185 * SR)
        t = np.arange(n) / SR
        fork = (
            0.72 * np.sin(2 * math.pi * (1480 * v_detune) * t)
            + 0.48 * np.sin(2 * math.pi * (2960 * v_detune) * t)
        ) * adsr_env(n, 0.004, 0.05, 0.55, 0.11)
        return finish_stereo(fork)

    if sfx_id == "sfx_enemy_warn_red":
        n = int(0.285 * SR)
        t = np.arange(n) / SR
        horn = np.tanh(
            (
                0.8 * np.sin(2 * math.pi * (92.5 * v_detune) * t)
                + 0.65 * np.sin(2 * math.pi * (131.0 * v_detune) * t)  # menacing tritone!
                + 0.45 * np.sin(2 * math.pi * (185.0 * v_detune) * t)
            )
            * 1.8
        ) * adsr_env(n, 0.015, 0.08, 0.72, 0.14)
        return finish_stereo(horn)

    if sfx_id == "sfx_enemy_dissolve":
        n = int(0.490 * SR)
        t = np.arange(n) / SR
        ash = rng.normal(0, 0.55, n) * adsr_env(n, 0.02, 0.15, 0.45, 0.28)
        ember = 0.35 * np.sin(np.cumsum(2 * math.pi * (280 * np.exp(-t * 5) + 60) * v_detune / SR)) * np.exp(-t * 6.5)
        return finish_stereo(ash + ember)

    if sfx_id == "sfx_ichor_pickup":
        n = int(0.165 * SR)
        t = np.arange(n) / SR
        f = np.where(t < 0.065, 880.0, 1318.5) * v_detune
        chime = (0.68 * np.sin(np.cumsum(2 * math.pi * f / SR)) + 0.35 * np.sin(np.cumsum(4 * math.pi * f / SR))) * np.exp(-t * 14.0)
        return finish_stereo(chime, np.roll(chime, 14))

    if sfx_id == "sfx_scroll_upgrade":
        n = int(0.920 * SR)
        t = np.arange(n) / SR
        chord = (
            synth_voice(midi_hz(50), 0.92, "brass", rng, -0.25)[:n]
            + synth_voice(midi_hz(57), 0.92, "brass", rng, 0.0)[:n]
            + synth_voice(midi_hz(62), 0.92, "organ", rng, 0.25)[:n]
            + synth_voice(midi_hz(66), 0.92, "glass", rng, 0.10)[:n]
        )
        parchment = rng.normal(0, 0.28, n) * np.exp(-t * 18.0)
        chord[:, 0] += parchment
        chord[:, 1] += parchment
        return schroeder_reverb(chord * 0.55, wet=0.26)

    if sfx_id == "sfx_flask_drink":
        n = int(0.580 * SR)
        t = np.arange(n) / SR
        pop = np.sin(2 * math.pi * (420 * v_detune) * t) * np.exp(-t * 55.0) * 0.7
        heal = (
            0.55 * np.sin(2 * math.pi * (587.3 * v_detune) * t)
            + 0.45 * np.sin(2 * math.pi * (880.0 * v_detune) * t)
            + 0.35 * np.sin(2 * math.pi * (1174.7 * v_detune) * t)
        ) * adsr_env(n, 0.09, 0.14, 0.55, 0.26)
        return finish_stereo(pop + heal)

    # sfx_ui_confirm_cancel
    n = int(0.092 * SR)
    t = np.arange(n) / SR
    click = (
        0.65 * np.sin(2 * math.pi * (2150 * v_detune) * t)
        + 0.45 * np.sin(2 * math.pi * (3680 * v_detune) * t)
        + 0.35 * np.sin(2 * math.pi * (310 * v_detune) * t)
    ) * np.exp(-t * 52.0)
    return finish_stereo(click)


STEM_JOBS = [
    ("bgm_sanctum_loop", 84.0, 8, 3, 50, False, "sanctum", 101),
    ("bgm_b01_explore", 136.0, 8, 4, 45, False, "slag", 201),
    ("bgm_b01_combat", 136.0, 8, 4, 45, True, "slag", 202),
    ("bgm_b02_explore", 142.0, 8, 4, 48, False, "vitriol", 301),
    ("bgm_b02_combat", 142.0, 8, 4, 48, True, "vitriol", 302),
    ("bgm_b03_explore", 150.0, 8, 6, 52, False, "ossuary", 401),
    ("bgm_b03_combat", 150.0, 8, 6, 52, True, "ossuary", 402),
    ("bgm_b04_explore", 156.0, 8, 4, 53, False, "apex", 501),
    ("bgm_b04_combat", 156.0, 8, 4, 53, True, "apex", 502),
    ("bgm_boss1_p1", 138.0, 8, 4, 43, True, "boss1", 601),
    ("bgm_boss1_p2", 138.0, 8, 4, 43, True, "boss1", 602),
    ("bgm_boss2_p1", 160.0, 8, 4, 50, False, "boss2_p1", 701),
    ("bgm_boss2_p2", 160.0, 8, 4, 50, True, "boss2_p2", 702),
    ("bgm_boss2_p3", 160.0, 8, 4, 50, True, "boss2_p3", 703),
]

SFX_JOBS = [
    ("sfx_step_stone", 4),
    ("sfx_step_metal", 4),
    ("sfx_jump_launch", 3),
    ("sfx_djump_mercury", 3),
    ("sfx_dodge_whoosh", 3),
    ("sfx_swing_light", 4),
    ("sfx_swing_heavy", 3),
    ("sfx_hit_flesh", 4),
    ("sfx_hit_clockwork", 4),
    ("sfx_crit_impact", 3),
    ("sfx_parry_clang", 3),
    ("sfx_breach_stun", 2),
    ("sfx_bow_release", 3),
    ("sfx_flask_shatter", 3),
    ("sfx_voltaic_zap", 4),
    ("sfx_status_freeze", 2),
    ("sfx_hemorrhage_pop", 2),
    ("sfx_enemy_warn_parry", 2),
    ("sfx_enemy_warn_red", 2),
    ("sfx_enemy_dissolve", 3),
    ("sfx_ichor_pickup", 4),
    ("sfx_scroll_upgrade", 1),
    ("sfx_flask_drink", 2),
    ("sfx_ui_confirm_cancel", 3),
]


def process_stem_job(tmp_dir: Path, job: tuple | str) -> str:
    if job == "bgm_low_hp_pulse":
        stem_id = "bgm_low_hp_pulse"
        pcm, bpm, bars, bpb = render_low_hp_pulse()
    else:
        stem_id, bpm, bars, bpb, root_m, is_c, style, seed = job
        pcm, bpm, bars, bpb = render_musical_stem(stem_id, bpm, bars, bpb, root_m, is_c, style, seed)

    raw_wav = tmp_dir / f"{stem_id}_raw.wav"
    loop_wav = tmp_dir / f"{stem_id}_loop.wav"
    norm_wav = tmp_dir / f"{stem_id}_norm.wav"

    write_wav_pcm24(raw_wav, soft_true_peak_limit(pcm, -1.0), SR)
    samples = cut_seamless_loop(raw_wav, loop_wav, bpm=bpm, bars=bars, beats_per_bar=bpb)
    lufs = normalize_wav_lufs(loop_wav, norm_wav, target_lufs=-14.0, ceiling_dbtp=-1.0, prefer_ffmpeg=False)
    subprocess.run(["bash", str(EXPORT_SH), "--pre-normalized", str(norm_wav), str(OUT_STEMS / stem_id)], check=True, stdout=subprocess.DEVNULL)
    return f"{stem_id} ({samples} samples, {lufs:.1f} LUFS)"


def process_sfx_job(tmp_dir: Path, sfx_id: str, v_idx: int) -> str:
    clip_name = f"{sfx_id}_v{v_idx}"
    pcm = render_sfx_variant(sfx_id, v_idx)
    raw_wav = tmp_dir / f"{clip_name}_raw.wav"
    norm_wav = tmp_dir / f"{clip_name}_norm.wav"
    write_wav_pcm24(raw_wav, pcm, SR)
    normalize_wav_lufs(raw_wav, norm_wav, target_lufs=-14.0, ceiling_dbtp=-1.5, prefer_ffmpeg=False)
    subprocess.run(["bash", str(EXPORT_SH), "--pre-normalized", str(norm_wav), str(OUT_SFX / clip_name)], check=True, stdout=subprocess.DEVNULL)
    return clip_name


def main() -> None:
    OUT_STEMS.mkdir(parents=True, exist_ok=True)
    OUT_SFX.mkdir(parents=True, exist_ok=True)
    tmp_dir = Path(tempfile.mkdtemp(prefix="qc_m9_audio_"))
    try:
        workers = min(8, max(2, os.cpu_count() or 4))
        futures = []
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for j in [*STEM_JOBS, "bgm_low_hp_pulse"]:
                futures.append(pool.submit(process_stem_job, tmp_dir, j))
            for sfx_id, count in SFX_JOBS:
                for v in range(1, count + 1):
                    futures.append(pool.submit(process_sfx_job, tmp_dir, sfx_id, v))

            done_count = 0
            for fut in as_completed(futures):
                fut.result()
                done_count += 1
        print(f"✅ Milestone 9 Audio Pipeline mastered {done_count} dual-codec (.webm + .m4a) pairs (-14 LUFS)!")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
