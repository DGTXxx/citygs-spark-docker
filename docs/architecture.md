# MVP Architecture

## Goal

Build a first vertical slice for remote server-side CityGS / 3DGS rendering:

1. User opens browser frontend.
2. Frontend requests a scene session.
3. Signaling service assigns a GPU worker.
4. Browser sends camera control packets.
5. GPU worker renders the requested viewpoint and streams video back.

In this MVP, video streaming is represented by a placeholder and mock stats. The protocol and interfaces are intentionally shaped so a real renderer can be added without rewriting the frontend.

## Components

### Frontend

- React + TypeScript + Vite.
- Captures mouse drag, wheel, and keyboard controls.
- Sends compact camera packets.
- Displays session status and render stats.

### Signaling

- Node.js WebSocket server.
- Tracks connected browser clients and workers.
- Assigns sessions to available workers.
- Routes messages by `sessionId`.

### Worker

- Mock worker for local development.
- Registers capabilities.
- Receives session assignment and camera packets.
- Emits render stats.

## Production shape

For the real GPU server:

```text
Camera packet
  → CityGS/gsplat camera update
  → CUDA rasterization
  → raw frame buffer
  → NVENC H.264/AV1 encode
  → WebRTC SRTP media
  → browser video element
```

Use WebRTC DataChannel for camera controls once real media transport is added. The current WebSocket camera route is acceptable for the local mock MVP and mirrors the same packet schema.
