#!/usr/bin/env bash
set -euo pipefail

PORT="${CITYGS_RENDER_PORT:-9102}"
echo "[CityGS] Starting render_server: LOD mc_aerial_c36 output_v1 VQ models"
echo "[CityGS] Config: /root/ftl/CityGaussian/config/mc_aerial_c36_lod_output_v1.yaml"
echo "[CityGS] Listen: http://127.0.0.1:${PORT}"
echo "[CityGS] Note: loads three VQ LOD levels once, then render_lod selects cells by camera distance/focal length."
cd /root/ftl/CityGaussian
exec conda run --no-capture-output -n citygs python render_server.py \
  --config config/mc_aerial_c36_lod_output_v1.yaml \
  --host 127.0.0.1 \
  --port "${PORT}"
