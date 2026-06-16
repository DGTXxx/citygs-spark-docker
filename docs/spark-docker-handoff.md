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

## Images

```text
citygs-spark-frontend:amd64
citygs-spark-models:amd64
```

`citygs-spark-frontend` contains the React/Nginx website. `citygs-spark-models`
contains the files under `frontend/public/models`, so the Spark viewer can load
`/models/*.ply` and `/models/*.spz` without a host volume.

## Build And Export

On the build machine:

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

Copy these two files to the server:

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

## GitHub Storage Note

Do not commit `citygs-spark-amd64-docker-images.tar.gz` to a normal GitHub
repository. The Spark model directory is about 2.9 GB, and GitHub repositories
are not suitable for that kind of binary artifact. Prefer one of these:

- push the images to GitHub Container Registry;
- attach a smaller demo archive to a GitHub Release;
- transfer the full archive through a server, NAS, or cloud drive.
