import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { CameraControlPacket, CameraPose, isProtocolMessage, makeId, ProtocolMessage } from '@citygs/shared';

const signalingUrl = process.env.SIGNALING_URL ?? 'ws://localhost:8788';
const workerId = process.env.WORKER_ID ?? makeId('citygs_worker');
const renderServerUrl = process.env.CITYGS_RENDER_SERVER_URL ?? 'http://127.0.0.1:9100/render';
const outputPath = process.env.CITYGS_OUTPUT_PATH ?? '/tmp/citygs-frame-worker.png';
const frameServerHost = process.env.CITYGS_FRAME_SERVER_HOST ?? '0.0.0.0';
const frameServerPort = Number(process.env.CITYGS_FRAME_SERVER_PORT ?? 8789);
const publicFrameBaseUrl = process.env.CITYGS_PUBLIC_FRAME_BASE_URL ?? `http://127.0.0.1:${frameServerPort}`;
const minRenderIntervalMs = Number(process.env.CITYGS_MIN_RENDER_INTERVAL_MS ?? 500);
const renderTimeoutMs = Number(process.env.CITYGS_RENDER_TIMEOUT_MS ?? 30_000);

startFrameServer();

const ws = new WebSocket(signalingUrl);
const activeSessions = new Set<string>();

let lastCamera: CameraControlPacket | undefined;
let lastRenderStartedAt = 0;
let renderInFlight = false;

const orbitTarget: Vec3 = [0, -0.38, 0];
const imageWidth = 960;
const imageHeight = 540;

const fixedCamera: CityGsCamera = {
  R: [
    [-4.371138825898235e-8, -0.9999999999999983, -3.89386082266796e-8],
    [-0.7071068044696104, 5.8442372857792086e-8, -0.7071067579034818],
    [0.7071067579034829, -3.37486311119406e-9, -0.7071068044696117],
  ],
  T: [-0.380000387199643, -6.010407885585369, 8.131727784392663],
  FoVx: 0.7853981852531432,
  FoVy: 0.45782234845589415,
  width: imageWidth,
  height: imageHeight,
  source_camera: 'fixed-0000',
};

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

type CityGsCamera = {
  R: Mat3;
  T: Vec3;
  FoVx: number;
  FoVy: number;
  width: number;
  height: number;
  source_camera?: string;
};

type RenderServerResponse = {
  ok: boolean;
  output?: string;
  renderMs?: number;
  totalMs?: number;
  width?: number;
  height?: number;
  gpuMemoryPeakMb?: number;
  error?: string;
};

function send(msg: ProtocolMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function norm(v: Vec3) {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v: Vec3): Vec3 {
  const n = norm(v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function cameraFromPose(pose?: CameraPose): CityGsCamera {
  if (!pose) return fixedCamera;

  const position = pose.position;
  const forward = normalize(sub(orbitTarget, position));
  const worldUp: Vec3 = Math.abs(dot(forward, [0, 0, 1])) > 0.98 ? [0, 1, 0] : [0, 0, 1];
  const right = normalize(cross(forward, worldUp));
  const down = normalize(cross(forward, right));

  // CityGaussian ViewerCam expects COLMAP-like world-to-camera R/T:
  // x = right, y = down, z = forward, T = -R * camera_center.
  const R: Mat3 = [right, down, forward];
  const T: Vec3 = [-dot(right, position), -dot(down, position), -dot(forward, position)];
  const FoVy = (pose.fovYDegrees * Math.PI) / 180;
  const aspect = imageWidth / imageHeight;
  const FoVx = 2 * Math.atan(Math.tan(FoVy / 2) * aspect);

  return {
    R,
    T,
    FoVx,
    FoVy,
    width: imageWidth,
    height: imageHeight,
    source_camera: 'frontend-orbit',
  };
}

function startFrameServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if ((req.method !== 'GET' && req.method !== 'HEAD') || url.pathname !== '/frame.png') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    try {
      const frameStat = await stat(outputPath);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': frameStat.size,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(outputPath).pipe(res);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: `frame not found: ${outputPath}` }));
    }
  });

  server.listen(frameServerPort, frameServerHost, () => {
    console.log(`frame server listening on http://${frameServerHost}:${frameServerPort}/frame.png`);
  });

  server.on('error', (error) => {
    console.error('frame server error:', error);
  });
}

async function postRenderRequest(camera: CityGsCamera): Promise<RenderServerResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), renderTimeoutMs);

  try {
    const response = await fetch(renderServerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camera, output: outputPath }),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: RenderServerResponse;
    try {
      payload = JSON.parse(text) as RenderServerResponse;
    } catch {
      throw new Error(`render_server returned non-JSON response: HTTP ${response.status} ${text.slice(0, 300)}`);
    }

    if (!response.ok || !payload.ok) {
      throw new Error(`render_server failed: HTTP ${response.status} ${payload.error ?? text.slice(0, 300)}`);
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`render_server timeout after ${renderTimeoutMs}ms: ${renderServerUrl}`);
    }
    if (error instanceof Error && 'cause' in error) {
      const cause = (error as Error & { cause?: unknown }).cause;
      if (cause && typeof cause === 'object' && 'code' in cause && (cause as { code?: string }).code === 'ECONNREFUSED') {
        throw new Error(`render_server is not running or refused connection: ${renderServerUrl}`);
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function renderFrame(sessionId: string, cameraPacket?: CameraControlPacket) {
  if (renderInFlight) {
    console.log('skip render: previous render is still running');
    return;
  }

  const now = Date.now();
  if (now - lastRenderStartedAt < minRenderIntervalMs) {
    console.log(`skip render: throttled (${now - lastRenderStartedAt}ms < ${minRenderIntervalMs}ms)`);
    return;
  }

  renderInFlight = true;
  lastRenderStartedAt = now;
  const requestStart = Date.now();

  try {
    const citygsCamera = cameraFromPose(cameraPacket?.pose);
    const result = await postRenderRequest(citygsCamera);
    const requestMs = Date.now() - requestStart;
    const renderMs = result.renderMs ?? requestMs;

    console.log(
      `CityGS render_server success: session=${sessionId} output=${result.output ?? outputPath} ` +
      `renderMs=${renderMs.toFixed(2)} totalMs=${result.totalMs?.toFixed(2) ?? 'n/a'} requestMs=${requestMs} ` +
      `camera=${citygsCamera.source_camera}`,
    );

    const imageUrl = `${publicFrameBaseUrl}/frame.png?t=${Date.now()}`;

    send({
      type: 'stats.render',
      sessionId,
      timestampMs: Date.now(),
      fps: 0,
      renderMs,
      encodeMs: 0,
      bitrateKbps: 0,
      latencyMs: cameraPacket ? Date.now() - cameraPacket.timestampMs : undefined,
      gpuMemoryUsedMb: result.gpuMemoryPeakMb,
      imageUrl,
    });
  } catch (error) {
    const requestMs = Date.now() - requestStart;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`CityGS render_server failed: session=${sessionId} requestMs=${requestMs}: ${message}`);
    send({ type: 'error', sessionId, message: `CityGS render_server failed: ${message}` });
  } finally {
    renderInFlight = false;
  }
}

ws.on('open', () => {
  send({
    type: 'worker.register',
    workerId,
    capabilities: {
      renderer: 'citygs',
      codecs: ['h264'],
      maxWidth: imageWidth,
      maxHeight: imageHeight,
      maxFps: 2,
      gpuName: 'NVIDIA RTX A6000',
      gpuMemoryGb: 48,
    },
  });
  console.log(`citygs worker ${workerId} connected to ${signalingUrl}`);
  console.log(`renderServerUrl=${renderServerUrl}`);
  console.log(`outputPath=${outputPath}`);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (!isProtocolMessage(msg)) return;

  if (msg.type === 'session.assigned') {
    activeSessions.add(msg.sessionId);
    console.log(`assigned session=${msg.sessionId} scene=${msg.sceneId}`);
    return;
  }

  if (msg.type === 'camera.control') {
    lastCamera = msg;
    const poseInfo = msg.pose ? `pose=[${msg.pose.position.map((v) => v.toFixed(2)).join(',')}]` : 'fixed-camera';
    console.log(`camera packet seq=${msg.sequence} session=${msg.sessionId}; requesting CityGS render_server ${poseInfo}`);
    void renderFrame(msg.sessionId, msg);
  }
});

ws.on('close', () => {
  console.log('citygs worker disconnected from signaling');
});

ws.on('error', (error) => {
  console.error('citygs worker websocket error:', error);
});
