#!/usr/bin/env bash
set -euo pipefail

PRE_NORMALIZED=0
if [[ "${1:-}" == "--pre-normalized" ]]; then
  PRE_NORMALIZED=1
  shift
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: bash tools/audio-pipeline/export_dual_codec.sh [--pre-normalized] <input.wav> <output_base_without_ext>" >&2
  exit 1
fi

INPUT_WAV="$1"
OUTPUT_BASE="$2" # e.g. public/assets/audio/stems/bgm_b01_explore
mkdir -p "$(dirname "$OUTPUT_BASE")"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

FFMPEG_BIN=""
if command -v ffmpeg >/dev/null 2>&1; then
  FFMPEG_BIN="$(command -v ffmpeg)"
elif [[ -x "${REPO_ROOT}/node_modules/ffmpeg-static/ffmpeg" ]]; then
  FFMPEG_BIN="${REPO_ROOT}/node_modules/ffmpeg-static/ffmpeg"
elif [[ -x "/opt/homebrew/bin/ffmpeg" ]]; then
  FFMPEG_BIN="/opt/homebrew/bin/ffmpeg"
elif [[ -x "/usr/local/bin/ffmpeg" ]]; then
  FFMPEG_BIN="/usr/local/bin/ffmpeg"
fi

if [[ -z "$FFMPEG_BIN" ]]; then
  echo "❌ Error: ffmpeg binary not found on PATH, node_modules/ffmpeg-static, or /opt/homebrew/bin/ffmpeg." >&2
  exit 2
fi

if [[ "$PRE_NORMALIZED" -eq 1 ]]; then
  "$FFMPEG_BIN" -y -hide_banner -loglevel error \
    -i "$INPUT_WAV" \
    -ar 48000 -ac 2 -c:a libopus -b:a 128k -vbr on \
    "${OUTPUT_BASE}.webm"

  "$FFMPEG_BIN" -y -hide_banner -loglevel error \
    -i "$INPUT_WAV" \
    -ar 48000 -ac 2 -c:a aac -b:a 160k -movflags +faststart \
    "${OUTPUT_BASE}.m4a"
else
  # 1. EBU R128 -14.0 LUFS / -1.0 dBTP 标准化并输出桌面端 WebM (Opus 128kbps, 48kHz)
  "$FFMPEG_BIN" -y -hide_banner -loglevel error \
    -i "$INPUT_WAV" \
    -af "loudnorm=I=-14.0:TP=-1.0:LRA=11.0" \
    -ar 48000 -ac 2 -c:a libopus -b:a 128k -vbr on \
    "${OUTPUT_BASE}.webm"

  # 2. 同源响度标准化输出 iOS Safari / PWA 原生硬件解码 M4A (AAC-LC 160kbps, 48kHz, +faststart)
  "$FFMPEG_BIN" -y -hide_banner -loglevel error \
    -i "$INPUT_WAV" \
    -af "loudnorm=I=-14.0:TP=-1.0:LRA=11.0" \
    -ar 48000 -ac 2 -c:a aac -b:a 160k -movflags +faststart \
    "${OUTPUT_BASE}.m4a"
fi

echo "✅ Exported dual-codec audio: ${OUTPUT_BASE}.webm + ${OUTPUT_BASE}.m4a"
