#!/usr/bin/env bash
set -euo pipefail

echo "[CityGS] Starting render_server: coarse model"
echo "[CityGS] Model: /root/ftl/CityGaussian/output_v1/mc_aerial_coarse"
echo "[CityGS] Listen: http://127.0.0.1:9100"
cd /root/ftl/CityGaussian
exec conda run --no-capture-output -n citygs python render_server.py \
  --model output_v1/mc_aerial_coarse \
  --host 127.0.0.1 \
  --port 9100
