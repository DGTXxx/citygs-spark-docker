# Mac Spark Docker Build

This guide is written as command-first instructions for building the SparkJS
3DGS website Docker package on a local Mac.

The final browser URL is:

```text
http://localhost:5173/
```

## 0. What Must Exist Locally

The local project folder must contain:

```text
frontend/public/models/
```

This directory is not committed to Git because it is about 2.9 GB. Copy it from
the A6000 server before building the model image.

Required Spark model files:

```text
frontend/public/models/mc_aerial_c36_light_75_vq_preview_200k.ply
frontend/public/models/mc_aerial_c36_light_75_vq_preview_1000k.ply
frontend/public/models/mc_aerial_c36_light_75_vq_preview_3000k.ply
frontend/public/models/mc_aerial_coarse_iter30000_7479k.spz
frontend/public/models/mc_aerial_c36_light_75_vq_full_5912k.spz
frontend/public/models/mc_aerial_c36_light_66_vq_lod2_8040k.spz
frontend/public/models/mc_aerial_c36_light_50_vq_lod1_11824k.spz
frontend/public/models/mc_aerial_c36_full_23648k.compressed.ply
```

## 1. Install Docker Desktop On Mac

If Homebrew is available:

```bash
brew install --cask docker
open -a Docker
```

Wait until Docker Desktop finishes starting, then verify:

```bash
docker version
docker buildx version
```

If Homebrew is not available, install Docker Desktop manually from:

```text
https://www.docker.com/products/docker-desktop/
```

## 2. Get The Project

Use the repository URL after the latest Docker files are pushed:

```bash
git clone https://github.com/DGT-X/citygs-remote-render-mvp.git
cd citygs-remote-render-mvp
```

If the folder already exists:

```bash
cd citygs-remote-render-mvp
git pull
```

## 3. Copy Models From The A6000 Server

Create the local model directory:

```bash
mkdir -p frontend/public/models
```

Copy with `rsync`:

```bash
rsync -avP root@A6000_SERVER_IP:/root/Projects/citygs-remote-render-mvp/frontend/public/models/ frontend/public/models/
```

If the models are only in the deploy copy:

```bash
rsync -avP root@A6000_SERVER_IP:/root/ftl/citygs-remote-render-deploy/citygs-remote-render-mvp/frontend/public/models/ frontend/public/models/
```

Replace `A6000_SERVER_IP` with the actual server IP or SSH host alias.

If the assets have been uploaded to Hugging Face, download them instead:

```bash
pip install -U huggingface_hub
hf download DGTXxx/citygs-spark-assets \
  --repo-type dataset \
  --include "models/*" \
  --local-dir frontend/public
```

This creates:

```text
frontend/public/models/
```

Check size:

```bash
du -sh frontend/public/models
ls -lh frontend/public/models
```

Expected size is about:

```text
2.9G
```

## 4. Build And Export amd64 Docker Images

Run:

```bash
./scripts/export-spark-docker.sh
```

If Docker Hub times out while fetching `node` or `nginx`, retry with an image
mirror:

```bash
NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim \
NGINX_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine \
./scripts/export-spark-docker.sh
```

This builds:

```text
citygs-spark-frontend:amd64
citygs-spark-models:amd64
```

and writes:

```text
citygs-spark-amd64-docker-images.tar.gz
```

On Apple Silicon Macs, amd64 builds can be slower because Docker Desktop uses
emulation. This is expected.

## 5. Test Locally

After export, the images are already loaded locally. Start the site:

```bash
docker compose -f docker-compose.spark.yml up -d
```

Open:

```text
http://localhost:5173/
```

Check logs if needed:

```bash
docker compose -f docker-compose.spark.yml ps
docker compose -f docker-compose.spark.yml logs --tail=100
```

Stop:

```bash
docker compose -f docker-compose.spark.yml down
```

## 6. Move To Another Server

Copy these two files to the target server:

```text
citygs-spark-amd64-docker-images.tar.gz
docker-compose.spark.yml
```

On the target server:

```bash
docker load -i citygs-spark-amd64-docker-images.tar.gz
docker compose -f docker-compose.spark.yml up -d
```

Open:

```text
http://SERVER_IP:5173/
```

## 7. GitHub Storage

Do not commit the generated Docker archive to a normal GitHub repository. The
model bundle is too large for normal Git storage. Use one of these instead:

```text
Recommended: push images to GitHub Container Registry
Acceptable: transfer tar.gz through server, NAS, or cloud drive
Small demo only: attach to GitHub Release if the file is small enough
```
