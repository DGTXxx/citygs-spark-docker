# Spark Docker Handoff

This package is for the browser-side SparkJS 3DGS viewer:

```text
http://SERVER_IP:5173/
```

The handoff flow is: build amd64 Docker images, export them as a compressed
archive, copy the archive plus the Compose file to the Ubuntu server, load the
images, then start Compose.

For local Mac build instructions, see:

```text
docs/mac-spark-docker-build.md
```

For direct Linux deployment instructions, see:

```text
docs/linux-spark-docker-deploy.md
```

## Images

```text
citygs-spark-frontend:amd64
citygs-spark-models:amd64
```

`citygs-spark-frontend` contains the React/Nginx website. `citygs-spark-models`
contains the files under `frontend/public/models`, so the Spark viewer can load
`/models/*.ply` and `/models/*.spz` without a host volume.

## Build And Export

First build the Docker archive on a build machine, such as your Mac:

```bash
cd citygs-spark-docker
./scripts/export-spark-docker.sh
```

Equivalent manual commands:

```bash
docker buildx build --platform linux/amd64 \
  -t citygs-spark-frontend:amd64 \
  -f frontend/Dockerfile.spark \
  --load .

docker buildx build --platform linux/amd64 \
  -t citygs-spark-models:amd64 \
  -f frontend/public/Dockerfile.spark-models \
  --load frontend/public

docker save citygs-spark-frontend:amd64 citygs-spark-models:amd64 \
  | gzip > citygs-spark-amd64-docker-images.tar.gz
```

## Deploy On Ubuntu Server

Then copy these two files from the build machine to the target server:

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

## Stop

```bash
docker compose -f docker-compose.spark.yml down
```

## Delivery Options

The generated archive includes both the website image and the model-assets
image. It can be copied directly to the lab server, pushed to GitHub Container
Registry, or transferred through NAS or cloud storage.
