#!/usr/bin/env python3
"""
Cuts exact bar-aligned, zero-crossing click-free seamless audio loops with a 15ms micro-crossfade tail.
Guarantees Exploration & Combat stems of the same BPM + Bars have 1-sample-identical lengths.
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
from pathlib import Path
import wave

try:
    import soundfile as _sf
except ImportError:
    _sf = None


def read_wav_float64(path: Path | str) -> tuple[np.ndarray, int]:
    """Reads 16/24/32-bit PCM WAV into float64 [-1.0, 1.0] shape (N, C)."""
    path = Path(path)
    if _sf is not None:
        data, sr = _sf.read(path, always_2d=True, dtype="float64")
        return data, int(sr)

    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        sr = wf.getframerate()
        nframes = wf.getnframes()
        raw = wf.readframes(nframes)

    if sampwidth == 2:
        pcm = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    elif sampwidth == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        signed = (
            b[:, 0].astype(np.int32)
            | (b[:, 1].astype(np.int32) << 8)
            | (b[:, 2].astype(np.int8).astype(np.int32) << 16)
        )
        pcm = signed.astype(np.float64) / 8388608.0
    elif sampwidth == 4:
        pcm = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2147483648.0
    else:
        raise ValueError(f"Unsupported WAV sample width: {sampwidth} bytes in {path}")

    return pcm.reshape(-1, channels), int(sr)


def write_wav_pcm24(path: Path | str, data: np.ndarray, sr: int) -> None:
    """Writes float64 [-1.0, 1.0] shape (N, C) as 24-bit PCM WAV."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(data, -1.0, 0.99999988)
    if _sf is not None:
        _sf.write(path, clipped, sr, subtype="PCM_24")
        return

    nframes, channels = clipped.shape
    ints = np.round(clipped * 8388607.0).astype(np.int32).reshape(-1)
    out_bytes = np.empty((ints.size, 3), dtype=np.uint8)
    out_bytes[:, 0] = ints & 0xFF
    out_bytes[:, 1] = (ints >> 8) & 0xFF
    out_bytes[:, 2] = (ints >> 16) & 0xFF

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(3)
        wf.setframerate(sr)
        wf.writeframes(out_bytes.tobytes())


def cut_seamless_loop(
    in_wav: Path,
    out_wav: Path,
    bpm: float,
    bars: int,
    beats_per_bar: int = 4,
) -> int:
    data, sr = read_wav_float64(in_wav)
    exact_seconds = (bars * beats_per_bar * 60.0) / bpm
    target_samples = int(round(exact_seconds * sr))
    fade_samples = int(round(0.015 * sr))  # 15ms tail micro-crossfade eliminates loop boundary clicks

    if data.shape[0] < target_samples + fade_samples:
        raise ValueError(
            f"{in_wav} too short: need {target_samples + fade_samples} samples, got {data.shape[0]}"
        )

    # Search first 5ms for lowest stereo energy zero-crossing
    search_win = min(max(1, int(0.005 * sr)), 256, data.shape[0] - (target_samples + fade_samples) + 1)
    mono_abs = np.mean(np.abs(data[:search_win]), axis=1)
    start_idx = int(np.argmin(mono_abs))

    body = data[start_idx : start_idx + target_samples].copy()
    overhang = data[start_idx + target_samples : start_idx + target_samples + fade_samples]

    t = np.linspace(0.0, 1.0, fade_samples, endpoint=False)[:, None]
    body[:fade_samples] = body[:fade_samples] * t + overhang * (1.0 - t)

    write_wav_pcm24(out_wav, body, sr)
    return target_samples


def main() -> None:
    parser = argparse.ArgumentParser(description="Cut sample-exact bar-aligned zero-crossing seamless loops.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bpm", type=float, required=True)
    parser.add_argument("--bars", type=int, required=True)
    parser.add_argument("--beats-per-bar", type=int, default=4)
    args = parser.parse_args()

    samples = cut_seamless_loop(args.input, args.output, args.bpm, args.bars, args.beats_per_bar)
    print(f"✅ Zero-cross loop written: {args.output} ({samples} exact samples @ {args.bpm} BPM, {args.bars} bars)")


if __name__ == "__main__":
    main()
