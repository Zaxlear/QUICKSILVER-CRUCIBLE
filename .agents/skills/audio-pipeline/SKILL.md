---
name: audio-pipeline
description: >-
  Commercial interactive music and SFX mastering pipeline for QUICKSILVER CRUCIBLE. Use this skill whenever normalizing audio loudness to -14 LUFS, cutting zero-crossing seamless loops for dual-stem BGM (Exploration + Combat), or exporting .webm (Opus) and .m4a (AAC) dual-codec assets for desktop and iOS Safari/PWA.
---

# 商业级双轨交互音乐与音效工程流水线技能（Audio Pipeline）

本技能负责将 AI 音乐/音效生成模型或 DAW 导出的原始 `.wav` 母带处理为满足 **零爆音无缝循环、`-14 LUFS` 工业响度一致、桌面与 iOS WebKit 双格式瞬时解码** 的成品资源。

---

## 1. 标准三步母带流水线（Mastering Runbook）

1. **Step 1 — 零交叉点对齐无缝循环裁切（针对所有双轨 BGM 与环境循环音）**：
   执行 `python3 tools/audio-pipeline/zero_cross_loop.py --input .tmp/raw_audio/<stem>.wav --bpm <BPM> --bars <BARS> --output .tmp/looped/<stem>.wav`
   - 同一生态群落的 `explore` 轨与 `combat` 轨必须传入**完全相同的 `--bpm` 与 `--bars`（例如 `136 BPM, 32 小节`）**，确保采样帧数精确到 `1 sample` 完全相等，杜绝长时运行相位漂移！
2. **Step 2 — EBU R128 集成响度标准化（BGM `-14 LUFS` / 短促打击 SFX 真峰值 `-1.5 dBTP`）**：
   执行 `python3 tools/audio-pipeline/normalize_lufs.py --input .tmp/looped/<stem>.wav --output .tmp/normalized/<stem>.wav --target-lufs -14.0`
3. **Step 3 — 导出 `.webm (Opus)` + `.m4a (AAC)` 双编码成品**：
   执行 `bash tools/audio-pipeline/export_dual_codec.sh .tmp/normalized/<stem>.wav public/assets/audio/stems/<stem>`
   - 在 `Howler` 配置中固定声明 `src: ['/assets/audio/stems/slag_explore.webm', '/assets/audio/stems/slag_explore.m4a']`（Chrome/Firefox/Edge 优先读取极小体积 Opus，iOS Safari/PWA 硬件加速秒解 AAC）。

---

## 2. 批处理脚本标准实现

### 2.1 零交叉点同采样帧数锁相裁切脚本（`tools/audio-pipeline/zero_cross_loop.py`）

```python
#!/usr/bin/env python3
"""Cuts exact bar-aligned, zero-crossing click-free loops with 15ms micro-crossfade tail."""
import argparse
from pathlib import Path
import numpy as np
import soundfile as sf


def cut_seamless_loop(in_wav: Path, out_wav: Path, bpm: float, bars: int, beats_per_bar: int = 4) -> None:
    data, sr = sf.read(in_wav, always_2d=True)
    exact_seconds = (bars * beats_per_bar * 60.0) / bpm
    target_samples = int(round(exact_seconds * sr))
    fade_samples = int(round(0.015 * sr))  # 15ms 尾部包络交叉消除一切循环咔哒爆音

    if data.shape[0] < target_samples + fade_samples:
        raise ValueError(f"{in_wav} too short: need {target_samples + fade_samples} samples, got {data.shape[0]}")

    # 在前 5ms 搜索双声道能量最低的过零点作为唯一起点
    search_win = min(int(0.005 * sr), 256)
    mono_abs = np.mean(np.abs(data[:search_win]), axis=1)
    start_idx = int(np.argmin(mono_abs))

    body = data[start_idx : start_idx + target_samples].copy()
    overhang = data[start_idx + target_samples : start_idx + target_samples + fade_samples]

    # 将尾部残响平滑叠回循环头部，保证首尾相位与幅值 100% 连续
    t = np.linspace(0.0, 1.0, fade_samples, endpoint=False)[:, None]
    body[:fade_samples] = body[:fade_samples] * t + overhang * (1.0 - t)

    out_wav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_wav, body, sr, subtype="PCM_24")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bpm", type=float, required=True)
    parser.add_argument("--bars", type=int, required=True)
    args = parser.parse_args()
    cut_seamless_loop(args.input, args.output, args.bpm, args.bars)
```

---

### 2.2 `ffmpeg` `-14 LUFS` 标准化与双格式导出脚本（`tools/audio-pipeline/export_dual_codec.sh`）

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT_WAV="$1"
OUTPUT_BASE="$2" # 不含扩展名，如 public/assets/audio/stems/biome01_explore
mkdir -p "$(dirname "$OUTPUT_BASE")"

# 1. EBU R128 -14 LUFS / -1.0 dBTP 真峰值标准化并输出 WebM (Opus 128kbps, 48kHz)
ffmpeg -y -hide_banner -loglevel error \
  -i "$INPUT_WAV" \
  -af "loudnorm=I=-14.0:TP=-1.0:LRA=11.0" \
  -ar 48000 -ac 2 -c:a libopus -b:a 128k -vbr on \
  "${OUTPUT_BASE}.webm"

# 2. 同源响度标准化输出 iOS Safari 原生硬件解码 M4A (AAC-LC 160kbps, 48kHz, faststart)
ffmpeg -y -hide_banner -loglevel error \
  -i "$INPUT_WAV" \
  -af "loudnorm=I=-14.0:TP=-1.0:LRA=11.0" \
  -ar 48000 -ac 2 -c:a aac -b:a 160k -movflags +faststart \
  "${OUTPUT_BASE}.m4a"
```
