#!/usr/bin/env bash
set -euo pipefail

PORT="${CITYGS_RENDER_PORT:-9101}"
echo "[CityGS] Starting render_server: full mc_aerial_c36 model"
echo "[CityGS] Model: /root/ftl/CityGaussian/output_v1/mc_aerial_c36"
echo "[CityGS] Listen: http://127.0.0.1:${PORT}"
echo "[CityGS] Note: full model load is expected to take about 25s and use about 13GB GPU memory after rendering."
cd /root/ftl/CityGaussian
exec conda run --no-capture-output -n citygs python render_server.py \
  --model output_v1/mc_aerial_c36 \
  --host 127.0.0.1 \
  --port "${PORT}"
