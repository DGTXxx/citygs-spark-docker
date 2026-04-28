# CityGS Remote Render MVP

A minimal scaffold for a **remote real-time server-side 3D Gaussian Splatting / CityGS rendering system**.

The MVP keeps the browser thin: it displays a remote stream placeholder, captures camera controls, and sends control packets to a GPU worker through a signaling service. The worker is currently a mock process, but the interfaces are prepared for a real CityGS/gsplat + NVENC + WebRTC pipeline.

## Architecture

```text
React Web Client
  ├─ displays WebRTC video stream placeholder
  └─ sends camera packets
        ↓ WebSocket signaling for MVP
Signaling Service
  ├─ assigns sessions to workers
  └─ routes camera/stats/WebRTC messages
        ↓
GPU Worker
  ├─ mock worker now
  ├─ CityGS/gsplat RenderCore later
  ├─ NVENC VideoEncoderBridge later
  └─ WebRTC Publisher later
```

## Run locally

```bash
npm install
npm run dev:signaling
npm run dev:worker
npm run dev:frontend
```

Then open the Vite URL, connect signaling, and start a session.

## MVP scope

- ✅ Frontend control panel and camera input capture
- ✅ WebSocket signaling service
- ✅ Mock GPU worker registration/session routing
- ✅ Shared TypeScript protocol definitions
- ✅ Interfaces for CityGS renderer, NVENC encoder, and WebRTC publisher
- ⏳ Real CUDA/CityGS rendering
- ⏳ Real WebRTC media stream
- ⏳ Kubernetes/GPU scheduling

## Real server integration plan

Replace `worker/src/mock-worker.ts` with a real GPU worker that implements the interfaces in `worker/src/render-core.ts`.
