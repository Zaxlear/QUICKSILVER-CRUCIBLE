#!/usr/bin/env python3
"""
EBU R128 / ITU-R BS.1770-4 Integrated Loudness Normalizer (-14.0 LUFS, -1.0 dBTP peak ceiling).
Uses ffmpeg loudnorm when available on PATH/Homebrew, with pure-NumPy ITU-R BS.1770-4 K-weighted fallback.
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

import argparse
import math
from pathlib import Path
import shutil
import subprocess
from zero_cross_loop import read_wav_float64, write_wav_pcm24


def find_ffmpeg() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    repo_root = Path(__file__).resolve().parents[2]
    local_static = repo_root / "node_modules" / "ffmpeg-static" / "ffmpeg"
    for cand in (str(local_static), "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"):
        if os.path.exists(cand) and os.access(cand, os.X_OK):
            return cand
    return None


def _biquad_filter_fft(
    x: np.ndarray,
    b: tuple[float, float, float],
    a: tuple[float, float, float],
) -> np.ndarray:
    """Vectorized zero-padded FFT evaluation of exact IIR biquad transfer function H(e^{jw})."""
    n_samples = x.shape[0]
    if n_samples == 0:
        return x.copy()
    pad = min(4096, n_samples)
    n_fft = 1
    while n_fft < n_samples + pad:
        n_fft <<= 1

    # Normalized digital angular frequency w in [0, pi]
    k = np.arange(n_fft // 2 + 1, dtype=np.float64)
    w = (2.0 * math.pi * k) / float(n_fft)
    z1 = np.exp(-1j * w)
    z2 = z1 * z1

    num = b[0] + b[1] * z1 + b[2] * z2
    den = a[0] + a[1] * z1 + a[2] * z2
    h_resp = (num / den)[:, None]

    spec = np.fft.rfft(x, n=n_fft, axis=0)
    y_full = np.fft.irfft(spec * h_resp, n=n_fft, axis=0)
    return y_full[:n_samples]


def measure_integrated_lufs(data: np.ndarray, sr: int) -> float:
    """Computes ITU-R BS.1770-4 gated integrated loudness (LUFS)."""
    # Standard 48kHz K-weighting biquad stages (close <0.15 dB match at 44.1kHz~48kHz)
    s1 = _biquad_filter_fft(
        data,
        (1.53512485958697, -2.69169618940638, 1.19839281085285),
        (1.0, -1.69065929318241, 0.73248077421585),
    )
    kw = _biquad_filter_fft(
        s1,
        (1.0, -2.0, 1.0),
        (1.0, -1.99004745483398, 0.99007225036621),
    )

    sq = kw * kw
    block_len = max(1, int(round(0.400 * sr)))
    step_len = max(1, int(round(0.100 * sr)))

    if sq.shape[0] < block_len:
        mean_energy = float(np.sum(np.mean(sq, axis=0)))
        return -70.0 if mean_energy <= 1e-12 else (-0.691 + 10.0 * math.log10(mean_energy))

    # Fast cumulative-sum sliding window block energies
    csum = np.vstack([np.zeros((1, sq.shape[1]), dtype=np.float64), np.cumsum(sq, axis=0)])
    starts = np.arange(0, sq.shape[0] - block_len + 1, step_len)
    block_means = (csum[starts + block_len] - csum[starts]) / float(block_len)
    block_powers = np.sum(block_means, axis=1)

    valid_abs = block_powers > (10.0 ** ((-70.0 + 0.691) / 10.0))
    if not np.any(valid_abs):
        return -70.0

    rel_gate_power = float(np.mean(block_powers[valid_abs])) * 0.1
    valid_rel = valid_abs & (block_powers > rel_gate_power)
    gated_mean = float(np.mean(block_powers[valid_rel if np.any(valid_rel) else valid_abs]))
    return -0.691 + 10.0 * math.log10(max(gated_mean, 1e-12))


def soft_true_peak_limit(data: np.ndarray, ceiling_dbtp: float = -1.0) -> np.ndarray:
    """Applies transparent soft-knee limiting capped strictly at -1.0 dBTP."""
    ceiling = 10.0 ** (ceiling_dbtp / 20.0)
    knee = ceiling * 0.82
    abs_x = np.abs(data)
    over = np.maximum(abs_x - knee, 0.0)
    span = ceiling - knee
    compressed = np.where(
        abs_x <= knee,
        abs_x,
        knee + span * np.tanh(over / max(span, 1e-6)),
    )
    return np.sign(data) * np.minimum(compressed, ceiling)


def normalize_wav_lufs(
    input_wav: Path,
    output_wav: Path,
    target_lufs: float = -14.0,
    ceiling_dbtp: float = -1.0,
    prefer_ffmpeg: bool = False,
) -> float:
    data, sr = read_wav_float64(input_wav)
    is_short_transient = data.shape[0] < int(0.45 * sr)
    ffmpeg_bin = find_ffmpeg() if (prefer_ffmpeg and not is_short_transient) else None
    if ffmpeg_bin is not None:
        output_wav.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                ffmpeg_bin, "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(input_wav),
                "-af", f"loudnorm=I={target_lufs:.1f}:TP={ceiling_dbtp:.1f}:LRA=11.0",
                "-c:a", "pcm_s24le",
                str(output_wav),
            ],
            check=True,
        )
        out_data, out_sr = read_wav_float64(output_wav)
        return measure_integrated_lufs(out_data, out_sr)

    cur_lufs = measure_integrated_lufs(data, sr)
    if cur_lufs <= -69.5:
        write_wav_pcm24(output_wav, data, sr)
        return cur_lufs

    effective_ceiling = min(ceiling_dbtp, -1.5) if is_short_transient else ceiling_dbtp
    out = data.copy()
    for _ in range(3):
        measured = measure_integrated_lufs(out, sr)
        gain = 10.0 ** ((target_lufs - measured) / 20.0)
        out = soft_true_peak_limit(out * gain, ceiling_dbtp=effective_ceiling)

    write_wav_pcm24(output_wav, out, sr)
    return measure_integrated_lufs(out, sr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize WAV audio to -14.0 LUFS / -1.0 dBTP.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--target-lufs", type=float, default=-14.0)
    parser.add_argument("--true-peak", type=float, default=-1.0)
    args = parser.parse_args()

    final_lufs = normalize_wav_lufs(args.input, args.output, args.target_lufs, args.true_peak)
    print(f"✅ Normalized {args.output}: {final_lufs:.2f} LUFS (peak ceiling {args.true_peak:.1f} dBTP)")


if __name__ == "__main__":
    main()
