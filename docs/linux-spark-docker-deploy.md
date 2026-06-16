# Linux Spark Docker Deploy

This guide is for deploying the CityGS Spark viewer on an x86_64 Ubuntu server.
The server can either build the images itself or load an archive built on another
machine.

The final browser URL is:

```text
http://SERVER_IP:5173/
```

## 1. Prerequisites

The server needs:

```text
Docker Engine
Docker Compose plugin
Git
Python 3
```

Verify Docker:

```bash
docker version
docker compose version
```

## 2. Clone The Repository

```bash
git clone https://github.com/DGTXxx/citygs-spark-docker.git
cd citygs-spark-docker
```

## 3. Download Model Assets

```bash
python3 -m pip install -U huggingface_hub hf_transfer
HF_HUB_ENABLE_HF_TRANSFER=1 hf download DGTXxx/citygs-spark-assets \
  --repo-type dataset \
  --include "models/*" \
  --local-dir frontend/public
```

Check the downloaded files:

```bash
du -sh frontend/public/models
ls frontend/public/models | head
```

Expected size is about:

```text
3.8G
```

## 4. Build And Start On The Server

If the server can access Docker base images normally:

```bash
docker compose -f docker-compose.spark.yml up -d --build
```

If Docker Hub is slow or times out, use mirrored base images:

```bash
NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim \
NGINX_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine \
docker compose -f docker-compose.spark.yml up -d --build
```

Open:

```text
http://SERVER_IP:5173/
```

## 5. Deploy From An Offline Archive

If another machine already built the archive, copy these two files to the server:

```text
citygs-spark-amd64-docker-images.tar.gz
docker-compose.spark.yml
```

Then run:

```bash
docker load -i citygs-spark-amd64-docker-images.tar.gz
docker compose -f docker-compose.spark.yml up -d
```

Open:

```text
http://SERVER_IP:5173/
```

## 6. Check And Stop

Check service status:

```bash
docker compose -f docker-compose.spark.yml ps
docker compose -f docker-compose.spark.yml logs --tail=100
```

Stop:

```bash
docker compose -f docker-compose.spark.yml down
```
