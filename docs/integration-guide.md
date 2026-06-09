# CityGS / GPU Server Integration Guide

## 1. Scene Preparation

Do not let users upload images or train online in this MVP. Train CityGS / 3DGS scenes offline from MatrixCity or prepared datasets, then deploy trained models to the A6000 GPU server.

Current server-side model targets:

```text
coarse -> /root/ftl/CityGaussian/output_v1/mc_aerial_coarse
full   -> /root/ftl/CityGaussian/output_v1/mc_aerial_c36
lod    -> /root/ftl/CityGaussian/config/mc_aerial_c36_lod_output_v1.yaml
```

## 2. Render Server

The current integration uses the Python `render_server.py` service in the CityGaussian environment.

Expected render endpoints:

```text
coarse -> http://127.0.0.1:9100/render
full   -> http://127.0.0.1:9101/render
lod    -> http://127.0.0.1:9102/render
```

Start scripts:

```bash
./scripts/start-render-coarse.sh
./scripts/start-render-full.sh
./scripts/start-render-lod.sh
./scripts/start-render-all.sh
```

The render server should:

- load the model once at startup;
- accept CityGaussian camera parameters;
- render one frame with CUDA rasterization;
- write the latest output image;
- return render timing metadata.

## 3. CityGS Worker

`worker/src/citygs-worker.ts` is the bridge between the web app and CityGaussian.

It is responsible for:

- registering with the signaling server;
- receiving session assignments;
- tracking selected model variant and render settings;
- converting browser orbit camera poses into CityGaussian `R/T/FoVx/FoVy`;
- calling the correct render server endpoint;
- exposing `/frame.png` for latest-frame preview;
- exposing `/stream.mjpg` for continuous image streaming;
- reporting render stats back to the frontend.

Recommended worker command:

```bash
SIGNALING_URL=ws://127.0.0.1:8788 \
CITYGS_RENDER_SERVER_URL_COARSE=http://127.0.0.1:9100/render \
CITYGS_RENDER_SERVER_URL_FULL=http://127.0.0.1:9101/render \
CITYGS_RENDER_SERVER_URL_LOD=http://127.0.0.1:9102/render \
npm --workspace @citygs/worker run dev:citygs
```

## 4. Frame Return Modes

### Latest PNG

The browser requests:

```text
GET /frame.png
```

This is simple and useful for debugging.

### MJPEG Stream

The browser displays:

```text
GET /stream.mjpg
```

This is the current practical video-like preview mode. It is still image-based, but it is easier to stabilize than WebRTC and works well for MVP demonstration.

### WebRTC Prototype

The current prototype server is started with:

```bash
./scripts/start-webrtc-coarse.sh
```

The final target is:

```text
CUDA render frame
-> NVENC H.264 / H.265 encode
-> WebRTC video track
-> browser video element
```

The prototype path should be treated as experimental until browser playback is stable.

## 5. Camera Packet Format

Camera packets live in `shared/src/index.ts`.

High-rate interaction currently uses snapshot-style camera packets over WebSocket:

```text
camera.control
```

The future WebRTC path may move high-rate camera control to a DataChannel, while keeping signaling for session setup and worker assignment.

## 6. Deployment Notes

The current preview can use temporary Cloudflare quick tunnels for:

```text
frontend
signaling
frame server
optional WebRTC prototype server
```

Final deployment should move to:

- stable domain;
- HTTPS;
- reverse proxy or named tunnel;
- service manager such as systemd / pm2 / supervisor;
- access control;
- GPU monitoring;
- simple concurrency limits.
