#!/usr/bin/env bash
set -euo pipefail

PORT="${CITYGS_RENDER_PORT:-9100}"
echo "[CityGS] Starting render_server: coarse model"
echo "[CityGS] Model: /root/ftl/CityGaussian/output_v1/mc_aerial_coarse"
echo "[CityGS] Listen: http://127.0.0.1:${PORT}"
cd /root/ftl/CityGaussian
exec conda run --no-capture-output -n citygs python render_server.py \
  --model output_v1/mc_aerial_coarse \
  --host 127.0.0.1 \
  --port "${PORT}"
