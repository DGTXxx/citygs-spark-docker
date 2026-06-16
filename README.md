# CityGS Spark Docker

A browser-side 3D Gaussian Splatting viewer for CityGS / MatrixCity scenes,
powered by SparkJS and Three.js. This repository is focused on the Spark viewer
and Docker handoff workflow, so it can be built on a local Mac and deployed on
an x86_64 Ubuntu server.

Model files are stored separately on Hugging Face:

```text
https://huggingface.co/datasets/DGTXxx/citygs-spark-assets
```

## Features

- Browser-side 3DGS rendering with SparkJS.
- `.ply` and `.spz` splat model loading.
- Model level switching: 200k, 1000k, 3000k, Coarse, LOD 1/2/3, and Full.
- Camera presets: city overview, top-down structure, low oblique view, and side view.
- Custom `Splat URL` input for loading other model files.
- Runtime status display: FPS, splat count, model size, and load time.
- Docker handoff with two images: frontend image and model-assets image.
- amd64 Docker export for x86_64 Ubuntu deployment.

## Getting Started

### Prerequisites

- Node.js 20+ and npm, for local development or source build.
- Docker Desktop on Mac, or Docker Engine on Linux.
- Hugging Face CLI, for downloading model assets.

Install the Hugging Face tools:

```bash
python3 -m pip install -U huggingface_hub hf_transfer
```

### Installation

Clone the repository:

```bash
git clone https://github.com/DGTXxx/citygs-spark-docker.git
cd citygs-spark-docker
```

Install JavaScript dependencies:

```bash
npm install
```

Download the Spark model assets:

```bash
HF_HUB_ENABLE_HF_TRANSFER=1 hf download DGTXxx/citygs-spark-assets \
  --repo-type dataset \
  --include "models/*" \
  --local-dir frontend/public
```

Check that the model directory exists:

```bash
du -sh frontend/public/models
ls frontend/public/models | head
```

Start the local development server:

```bash
npm run dev
```

Open:

```text
http://localhost:5173/
```

## Docker Deployment

There are two roles in this workflow:

- Build machine: your Mac or another machine with Docker, used to build and
  export `citygs-spark-amd64-docker-images.tar.gz`.
- Target server: the Ubuntu server where the website will run. It only needs
  the exported archive and `docker-compose.spark.yml`.

### Option A: Build amd64 Images On Mac

Build the amd64 images and export them as one compressed archive:

```bash
NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim \
NGINX_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine \
./scripts/export-spark-docker.sh
```

This creates:

```text
citygs-spark-amd64-docker-images.tar.gz
```

The archive contains:

```text
citygs-spark-frontend:amd64
citygs-spark-models:amd64
```

### Option B: Build And Run Directly On Linux

On an x86_64 Ubuntu server with Docker installed, clone the repository, download
the model assets, and start Compose directly:

```bash
git clone https://github.com/DGTXxx/citygs-spark-docker.git
cd citygs-spark-docker

python3 -m pip install -U huggingface_hub hf_transfer
HF_HUB_ENABLE_HF_TRANSFER=1 hf download DGTXxx/citygs-spark-assets \
  --repo-type dataset \
  --include "models/*" \
  --local-dir frontend/public

docker compose -f docker-compose.spark.yml up -d --build
```

Open:

```text
http://SERVER_IP:5173/
```

### Test Locally After Export

Start the Docker version locally:

```bash
docker compose -f docker-compose.spark.yml up -d
```

Open:

```text
http://localhost:5173/
```

Stop:

```bash
docker compose -f docker-compose.spark.yml down
```

### Deploy On Ubuntu Server

Copy these two files to the target server:

```text
citygs-spark-amd64-docker-images.tar.gz
docker-compose.spark.yml
```

Load and start the images:

```bash
docker load -i citygs-spark-amd64-docker-images.tar.gz
docker compose -f docker-compose.spark.yml up -d
```

Open:

```text
http://SERVER_IP:5173/
```

## Project Structure

```text
.
├── docker-compose.spark.yml
├── frontend/
│   ├── Dockerfile.spark
│   ├── nginx.spark.conf
│   ├── public/
│   │   ├── Dockerfile.spark-models
│   │   └── nginx.spark-models.conf
│   └── src/
│       ├── SparkDemo.tsx
│       ├── main.tsx
│       └── styles.css
├── scripts/
│   └── export-spark-docker.sh
└── docs/
    ├── mac-spark-docker-build.md
    ├── linux-spark-docker-deploy.md
    └── spark-docker-handoff.md
```

## Notes

- Do not commit `frontend/public/models/` to GitHub.
- Do not commit `citygs-spark-amd64-docker-images.tar.gz` to a normal GitHub repository.
- Full model assets are distributed through Hugging Face.
- Detailed Mac build guide: `docs/mac-spark-docker-build.md`.
- Detailed Linux deployment guide: `docs/linux-spark-docker-deploy.md`.
- Detailed handoff guide: `docs/spark-docker-handoff.md`.
