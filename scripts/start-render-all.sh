#!/usr/bin/env bash
set -euo pipefail

cd /root/Projects/citygs-remote-render-mvp
mkdir -p logs

echo "[CityGS] Starting all render servers: coarse=9100 full=9101 lod=9102"
CITYGS_RENDER_PORT=9100 ./scripts/start-render-coarse.sh > logs/render-coarse.log 2>&1 &
COARSE_PID=$!
CITYGS_RENDER_PORT=9101 ./scripts/start-render-full.sh > logs/render-full.log 2>&1 &
FULL_PID=$!
CITYGS_RENDER_PORT=9102 ./scripts/start-render-lod.sh > logs/render-lod.log 2>&1 &
LOD_PID=$!

echo "[CityGS] PIDs: coarse=${COARSE_PID} full=${FULL_PID} lod=${LOD_PID}"
echo "[CityGS] Logs: logs/render-coarse.log logs/render-full.log logs/render-lod.log"
echo "[CityGS] Stop with: kill ${COARSE_PID} ${FULL_PID} ${LOD_PID}"
wait
