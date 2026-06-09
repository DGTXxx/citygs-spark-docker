#!/usr/bin/env bash
set -euo pipefail

PORT="${CITYGS_WEBRTC_PORT:-9200}"
FPS="${CITYGS_WEBRTC_FPS:-5}"
echo "[CityGS] Starting WebRTC prototype server: coarse model"
echo "[CityGS] Model: /root/ftl/CityGaussian/output_v1/mc_aerial_coarse"
echo "[CityGS] Listen: http://127.0.0.1:${PORT}"
echo "[CityGS] FPS: ${FPS}"
cd /root/ftl/CityGaussian
exec conda run --no-capture-output -n citygs python render_webrtc_server.py \
  --model output_v1/mc_aerial_coarse \
  --host 127.0.0.1 \
  --port "${PORT}" \
  --fps "${FPS}"
