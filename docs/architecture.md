# MVP Architecture

## Goal

Build a remote server-side CityGS / 3DGS rendering MVP:

1. The user opens a browser frontend.
2. The frontend requests a scene session through the signaling service.
3. The signaling service assigns an available CityGS worker.
4. The browser sends camera control packets.
5. The worker calls the CityGaussian render server on the A6000 GPU server.
6. The browser displays the returned frame through `Latest PNG` or `MJPEG Stream`.

`WebRTC Video` exists as a prototype path. The final target is NVENC encoded WebRTC video.

## Current Components

### Frontend

- React + TypeScript + Vite.
- Captures mouse drag, wheel, and keyboard controls.
- Sends compact camera packets.
- Provides model, resolution, FPS, quality, and display-mode controls.
- Displays session status and render stats.
- Supports:
  - `Latest PNG`
  - `MJPEG Stream`
  - `WebRTC Video` prototype

### Signaling

- Node.js WebSocket server.
- Tracks connected browser clients and workers.
- Assigns sessions to available workers.
- Routes messages by `sessionId`.
- Carries model variant, preferred codec, resolution, FPS, and quality preset in session messages.

### CityGS Worker

- Registers as a render worker.
- Receives session assignments and camera packets.
- Converts frontend orbit camera poses into CityGaussian camera parameters.
- Routes render requests to coarse / full / lod render server endpoints.
- Serves:
  - `/frame.png`
  - `/stream.mjpg`
- Emits render stats back to the frontend.

### CityGaussian Render Server

- Python service running beside CityGaussian.
- Loads a trained model once at startup.
- Receives camera parameters over HTTP.
- Calls the CUDA rasterizer.
- Writes the latest rendered frame and returns render timing metadata.

## Current Data Flow

```text
Browser camera input
  -> camera.control over WebSocket
  -> signaling
  -> CityGS worker
  -> HTTP POST /render
  -> CityGaussian render_server
  -> CUDA rasterization on A6000
  -> PNG output
  -> /frame.png or /stream.mjpg
  -> browser display
```

## Target Production Shape

```text
Browser camera input
  -> signaling / DataChannel
  -> CityGS worker
  -> CityGaussian CUDA render
  -> GPU frame buffer
  -> NVENC H.264 / H.265 encode
  -> WebRTC media track
  -> browser video element
```

## Deployment Direction

The final demo should expose one stable HTTPS site:

```text
https://<stable-domain>/
```

The frontend, signaling, frame stream, and later WebRTC endpoints should be routed behind a stable domain or named tunnel rather than temporary `trycloudflare.com` links.
