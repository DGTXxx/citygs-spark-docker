# CityGS / GPU Server Integration Guide

## 1. Scene preparation

For the MVP, do not let users upload images or train online. Train CityGS/3DGS scenes offline from MatrixCity or your prepared dataset, then deploy trained models to the GPU server.

Suggested scene metadata:

```json
{
  "sceneId": "matrixcity-demo-block",
  "modelPath": "/data/citygs/matrixcity-demo/model.ply",
  "dataset": "MatrixCity"
}
```

## 2. Implement RenderCore

Implement `RenderCore` from `worker/src/render-core.ts`:

- `loadScene(scene)` loads Gaussian parameters/checkpoints into GPU memory.
- `setCamera(pose)` maps browser camera to CityGS/gsplat view/projection matrices.
- `renderFrame()` calls the CUDA rasterizer and returns a raw frame buffer.
- `getStats()` reports render time, FPS, GPU memory, etc.
- `dispose()` releases GPU resources.

## 3. Implement encoder bridge

Implement `VideoEncoderBridge` with NVIDIA NVENC:

- MVP codec: H.264.
- Later codec: AV1 on Ada-class or supported GPUs.
- Keep render and encode asynchronous when possible.

## 4. Implement WebRTC publisher

Implement `WebRtcPublisher`:

- Use Pion, LiveKit SDK, or a native WebRTC binding.
- Signaling can continue through the existing signaling server.
- Browser receives a real `MediaStream` and attaches it to a `<video>` element.

## 5. Camera packet format

Camera packets live in `shared/src/index.ts`.

High-rate interaction should use:

- `mode: "delta"` for mouse/keyboard movement.
- unordered/unreliable WebRTC DataChannel in production.

Periodic correction should use:

- `mode: "snapshot"` with full camera pose.
- reliable channel or ordered control message.

## 6. Deployment notes

First GPU-server deployment can be a single process:

```text
signaling service on control node
GPU worker on NVIDIA server
frontend on any HTTPS host
```

Later production deployment:

- Kubernetes GPU nodes
- NVIDIA k8s-device-plugin
- DCGM Exporter + Prometheus/Grafana
- scene cache on NVMe
- TURN fallback
- admission control
