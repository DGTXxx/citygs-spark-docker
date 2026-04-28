#!/usr/bin/env bash
set -euo pipefail

echo "[CityGS] Starting frontend dev server"
echo "[CityGS] Listen: http://127.0.0.1:5173"
cd /root/Projects/citygs-remote-render-mvp
exec npm run dev:frontend
