#!/usr/bin/env bash
# Silero VAD (MIT-licensed) ONNXモデルをpublic/models/ にダウンロードする。
# 実行: bash scripts/fetch-models.sh

set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/models

URL="https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx"
DEST="public/models/silero_vad.onnx"

echo "Downloading Silero VAD ONNX -> $DEST"
curl -fL --progress-bar "$URL" -o "$DEST"
echo "Done. $(ls -la "$DEST")"
