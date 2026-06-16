#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM="${PLATFORM:-linux/amd64}"
ARCHIVE="${ARCHIVE:-citygs-spark-amd64-docker-images.tar.gz}"
NODE_IMAGE="${NODE_IMAGE:-node:22-bookworm-slim}"
NGINX_IMAGE="${NGINX_IMAGE:-nginx:1.27-alpine}"

cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed or not in PATH" >&2
  exit 1
fi

required_models=(
  "frontend/public/models/mc_aerial_c36_light_75_vq_preview_200k.ply"
  "frontend/public/models/mc_aerial_c36_light_75_vq_preview_1000k.ply"
  "frontend/public/models/mc_aerial_c36_light_75_vq_preview_3000k.ply"
  "frontend/public/models/mc_aerial_coarse_iter30000_7479k.spz"
  "frontend/public/models/mc_aerial_c36_light_75_vq_full_5912k.spz"
  "frontend/public/models/mc_aerial_c36_light_66_vq_lod2_8040k.spz"
  "frontend/public/models/mc_aerial_c36_light_50_vq_lod1_11824k.spz"
  "frontend/public/models/mc_aerial_c36_full_23648k.compressed.ply"
)

missing=()
for model in "${required_models[@]}"; do
  if [[ ! -f "$model" ]]; then
    missing+=("$model")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "missing Spark model files:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  echo "copy frontend/public/models from the A6000 server before exporting Docker images" >&2
  exit 1
fi

docker buildx build \
  --platform "$PLATFORM" \
  --build-arg NODE_IMAGE="$NODE_IMAGE" \
  --build-arg NGINX_IMAGE="$NGINX_IMAGE" \
  -t citygs-spark-frontend:amd64 \
  -f frontend/Dockerfile.spark \
  --load \
  .

docker buildx build \
  --platform "$PLATFORM" \
  --build-arg NGINX_IMAGE="$NGINX_IMAGE" \
  -t citygs-spark-models:amd64 \
  -f frontend/public/Dockerfile.spark-models \
  --load \
  frontend/public

docker save citygs-spark-frontend:amd64 citygs-spark-models:amd64 | gzip > "$ARCHIVE"

echo "Wrote $ROOT_DIR/$ARCHIVE"
echo "Copy $ARCHIVE and docker-compose.spark.yml to the target server."
