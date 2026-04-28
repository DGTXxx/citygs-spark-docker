#!/usr/bin/env bash
set -euo pipefail

echo "[CityGS] Starting CityGS worker"
echo "[CityGS] Signaling: ${SIGNALING_URL:-ws://localhost:8788}"
echo "[CityGS] Render API: ${CITYGS_RENDER_SERVER_URL:-http://127.0.0.1:9100/render}"
echo "[CityGS] Frame server: http://${CITYGS_FRAME_SERVER_HOST:-0.0.0.0}:${CITYGS_FRAME_SERVER_PORT:-8789}/frame.png"
cd /root/Projects/citygs-remote-render-mvp
exec npm --workspace @citygs/worker run dev:citygs
