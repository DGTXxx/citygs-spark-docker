#!/usr/bin/env bash
set -euo pipefail

echo "[CityGS] Starting signaling service"
echo "[CityGS] Listen: ws://127.0.0.1:8788"
cd /root/Projects/citygs-remote-render-mvp
exec npm run dev:signaling
