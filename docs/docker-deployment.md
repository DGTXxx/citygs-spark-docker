# Docker Deployment

This setup packages the web-facing MVP pieces:

- `frontend`: React static build served by Nginx.
- `signaling`: Node.js WebSocket signaling service.
- `worker`: Node.js CityGS bridge and frame/MJPEG server.
- `SparkDemo`: browser-side 3DGS/SparkJS viewer built into the same frontend.

The CUDA CityGaussian render servers still run on the A6000 host. This keeps
the web deployment portable without baking the full CUDA/conda/CityGaussian
runtime into the website image.

## Build

```bash
docker compose build
```

The frontend image does not copy large model assets into the image. Compose
mounts the host directory instead:

```text
./frontend/public/models -> /usr/share/nginx/html/models
```

## Spark Browser Viewer With Bundled Models

Use this when the deployment target only needs the browser-side SparkJS 3DGS
viewer and the model files should travel inside Docker images:

```bash
docker compose -f docker-compose.spark.yml up -d --build
```

Open:

```text
http://127.0.0.1:5173/?spark=1
```

This starts two containers:

```text
citygs-spark-frontend:amd64 -> React/Nginx site
citygs-spark-models:amd64   -> Nginx model asset server
```

The frontend proxies `/models/*` to `spark-models`, so all existing Spark model
presets continue to use the same URLs as local development:

```text
/models/mc_aerial_c36_light_75_vq_preview_200k.ply
/models/mc_aerial_c36_light_75_vq_preview_1000k.ply
/models/mc_aerial_c36_light_75_vq_preview_3000k.ply
/models/mc_aerial_coarse_iter30000_7479k.spz
/models/mc_aerial_c36_light_75_vq_full_5912k.spz
/models/mc_aerial_c36_light_66_vq_lod2_8040k.spz
/models/mc_aerial_c36_light_50_vq_lod1_11824k.spz
/models/mc_aerial_c36_full_23648k.compressed.ply
```

For the campus-photo-collector style offline handoff, see:

```text
docs/spark-docker-handoff.md
```

To export the Spark Docker images as one compressed archive:

```bash
./scripts/export-spark-docker.sh
```

On another machine:

```bash
gunzip -c citygs-spark-docker-images.tar.gz | docker load
docker compose -f docker-compose.spark.yml up -d
```

Do not commit this archive to a normal GitHub repository. The model image is
multi-GB, and GitHub repositories have a 100 MB single-file limit. Prefer
pushing the images to GitHub Container Registry (GHCR), or attach a smaller
demo archive to a GitHub Release only if it stays under the release asset limit.

## Run With Real CityGS Render Servers

Start the render servers on the host first:

```bash
./scripts/start-render-coarse.sh
./scripts/start-render-full.sh
./scripts/start-render-lod.sh
```

Then start the web services:

```bash
docker compose --profile citygs up -d --build
```

Open:

```text
http://127.0.0.1:5173
```

Website modes:

```text
/          -> server-side CityGS render path
/?spark=1 -> browser-side SparkJS 3DGS viewer
```

The Spark viewer loads assets from `/models/...`. Those files are mounted from
`frontend/public/models`, so they migrate with the host data directory rather
than being baked into the frontend image.

Default endpoints:

```text
frontend  -> http://127.0.0.1:5173
signaling -> ws://127.0.0.1:8788
frames    -> http://127.0.0.1:8789
```

Inside Docker, the worker reaches host render servers through:

```text
http://host.docker.internal:9100/render
http://host.docker.internal:9101/render
http://host.docker.internal:9102/render
```

## Run Protocol Demo Without GPU Render Servers

```bash
docker compose --profile mock up -d --build
```

This starts the frontend, signaling service, and mock worker. It verifies the
websocket/session flow but does not produce real CityGS frames.

## Stop

```bash
docker compose --profile citygs down
docker compose --profile mock down
docker compose -f docker-compose.spark.yml down
```

## Notes For Server Migration

Copy the repository plus `frontend/public/models` for the Spark viewer assets.
For real server-side rendering, also prepare CityGaussian and the trained model
paths on the target GPU host, then start the render servers before starting
Docker Compose.
