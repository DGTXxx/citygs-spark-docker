import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, rename, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import WebSocket from 'ws';
import { CameraControlPacket, CameraPose, isProtocolMessage, makeId, ModelVariant, ProtocolMessage } from '@citygs/shared';

const signalingUrl = process.env.SIGNALING_URL ?? 'ws://localhost:8788';
const workerId = process.env.WORKER_ID ?? makeId('citygs_worker');
const defaultRenderServerUrls: Record<ModelVariant, string> = {
  coarse: 'http://127.0.0.1:9100/render',
  full: 'http://127.0.0.1:9101/render',
  lod: 'http://127.0.0.1:9102/render',
};

function envRenderServerUrls(): Record<ModelVariant, string> {
  const urls = { ...defaultRenderServerUrls };
  if (process.env.CITYGS_RENDER_SERVER_URL) {
    // Backward compatibility: one URL means all variants route to the same server.
    urls.coarse = process.env.CITYGS_RENDER_SERVER_URL;
    urls.full = process.env.CITYGS_RENDER_SERVER_URL;
    urls.lod = process.env.CITYGS_RENDER_SERVER_URL;
  }
  if (process.env.CITYGS_RENDER_SERVER_URL_COARSE) urls.coarse = process.env.CITYGS_RENDER_SERVER_URL_COARSE;
  if (process.env.CITYGS_RENDER_SERVER_URL_FULL) urls.full = process.env.CITYGS_RENDER_SERVER_URL_FULL;
  if (process.env.CITYGS_RENDER_SERVER_URL_LOD) urls.lod = process.env.CITYGS_RENDER_SERVER_URL_LOD;
  return urls;
}

const renderServerUrls = envRenderServerUrls();
const outputPath = process.env.CITYGS_OUTPUT_PATH ?? '/tmp/citygs-frame-worker.png';
const jpegOutputPath = process.env.CITYGS_JPEG_OUTPUT_PATH ?? '/tmp/citygs-frame-worker.jpg';
const jpegTempOutputPath = `${jpegOutputPath}.tmp`;
const frameServerHost = process.env.CITYGS_FRAME_SERVER_HOST ?? '0.0.0.0';
const frameServerPort = Number(process.env.CITYGS_FRAME_SERVER_PORT ?? 8789);
const publicFrameBaseUrl = process.env.CITYGS_PUBLIC_FRAME_BASE_URL ?? `http://127.0.0.1:${frameServerPort}`;
const minRenderIntervalMs = Number(process.env.CITYGS_MIN_RENDER_INTERVAL_MS ?? 0);
const renderTimeoutMs = Number(process.env.CITYGS_RENDER_TIMEOUT_MS ?? 30_000);
const renderLoopFps = Number(process.env.CITYGS_RENDER_LOOP_FPS ?? 5);
const streamFps = Number(process.env.CITYGS_STREAM_FPS ?? 8);
const jpegQuality = Number(process.env.CITYGS_JPEG_QUALITY ?? 85);
const execFileAsync = promisify(execFile);

startFrameServer();

const ws = new WebSocket(signalingUrl);
const activeSessions = new Map<string, ModelVariant>();
const activeSessionOptions = new Map<string, { maxWidth: number; maxHeight: number; maxFps?: number }>();

let lastCamera: CameraControlPacket | undefined;
let lastRenderStartedAt = 0;
let renderInFlight = false;
let streamClientCount = 0;

// Match the known-good CityGaussian camera first, then orbit around a point
// along its optical axis. This keeps the MVP camera inside the trained
// MatrixCity coordinate range instead of orbiting an arbitrary origin.
const orbitTarget: Vec3 = [-2.9289, -0.38, -5.5711];
const defaultImageWidth = 960;
const defaultImageHeight = 540;

const fixedCamera: CityGsCamera = {
  R: [
    [-4.371138825898235e-8, -0.9999999999999983, -3.89386082266796e-8],
    [-0.7071068044696104, 5.8442372857792086e-8, -0.7071067579034818],
    [0.7071067579034829, -3.37486311119406e-9, -0.7071068044696117],
  ],
  T: [-0.380000387199643, -6.010407885585369, 8.131727784392663],
  FoVx: 0.7853981852531432,
  FoVy: 0.45782234845589415,
  width: defaultImageWidth,
  height: defaultImageHeight,
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
  saveMs?: number;
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

function cameraFromPose(pose?: CameraPose, options?: { maxWidth?: number; maxHeight?: number }): CityGsCamera {
  const width = Math.max(160, Math.round(options?.maxWidth ?? defaultImageWidth));
  const height = Math.max(120, Math.round(options?.maxHeight ?? defaultImageHeight));
  if (!pose) return { ...fixedCamera, width, height };

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
  const aspect = width / height;
  const FoVx = 2 * Math.atan(Math.tan(FoVy / 2) * aspect);

  return {
    R,
    T,
    FoVx,
    FoVy,
    width,
    height,
    source_camera: 'frontend-orbit',
  };
}

async function convertLatestFrameToJpeg() {
  const script = `
from PIL import Image
img = Image.open(${JSON.stringify(outputPath)})
img.load()
if img.mode not in ('RGB', 'L'):
    img = img.convert('RGB')
img.save(${JSON.stringify(jpegTempOutputPath)}, 'JPEG', quality=${JSON.stringify(jpegQuality)}, optimize=True)
`;
  await execFileAsync('python', ['-c', script], { timeout: 10_000 });
  await rename(jpegTempOutputPath, jpegOutputPath);
}

function startFrameServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
      return;
    }

    if (url.pathname === '/stream.mjpg') {
      streamClientCount += 1;
      console.log(`MJPEG client connected; streamClientCount=${streamClientCount}`);
      res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=citygs-frame',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      let sending = false;
      const sendLatestFrame = async () => {
        if (sending || res.destroyed) return;
        sending = true;
        try {
          const frame = await readFile(jpegOutputPath);
          res.write(`--citygs-frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.byteLength}\r\n\r\n`);
          res.write(frame);
          res.write('\r\n');
        } catch {
          // The first CityGS frame may not exist yet. Keep the stream open and try again.
        } finally {
          sending = false;
        }
      };

      void sendLatestFrame();
      const interval = setInterval(sendLatestFrame, Math.max(50, Math.round(1000 / Math.max(1, streamFps))));
      req.on('close', () => {
        clearInterval(interval);
        streamClientCount = Math.max(0, streamClientCount - 1);
        console.log(`MJPEG client disconnected; streamClientCount=${streamClientCount}`);
      });
      return;
    }

    if (url.pathname !== '/frame.png') {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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
    console.log(`MJPEG stream listening on http://${frameServerHost}:${frameServerPort}/stream.mjpg @ ${streamFps}fps`);
    console.log(`render loop target=${renderLoopFps}fps; renders only while MJPEG clients are connected`);
  });

  server.on('error', (error) => {
    console.error('frame server error:', error);
  });
}

async function postRenderRequest(camera: CityGsCamera, modelVariant: ModelVariant): Promise<RenderServerResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), renderTimeoutMs);
  const renderServerUrl = renderServerUrls[modelVariant] ?? renderServerUrls.coarse;

  try {
    const response = await fetch(renderServerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camera, output: outputPath, modelVariant }),
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

function startRenderLoop() {
  const intervalMs = Math.max(50, Math.round(1000 / Math.max(1, renderLoopFps)));
  setInterval(() => {
    if (streamClientCount <= 0) return;
    if (!lastCamera) return;
    void renderFrame(lastCamera.sessionId, lastCamera);
  }, intervalMs);
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
    const modelVariant = activeSessions.get(sessionId) ?? 'coarse';
    const sessionOptions = activeSessionOptions.get(sessionId) ?? { maxWidth: defaultImageWidth, maxHeight: defaultImageHeight };
    const citygsCamera = cameraFromPose(cameraPacket?.pose, sessionOptions);
    const result = await postRenderRequest(citygsCamera, modelVariant);
    const encodeStart = Date.now();
    await convertLatestFrameToJpeg();
    const encodeMs = Date.now() - encodeStart;
    const requestMs = Date.now() - requestStart;
    const renderMs = result.renderMs ?? requestMs;
    const saveMs = result.saveMs ?? 0;

    console.log(
      `CityGS render_server success: session=${sessionId} modelVariant=${modelVariant} output=${result.output ?? outputPath} ` +
      `renderMs=${renderMs.toFixed(2)} saveMs=${saveMs.toFixed(2)} encodeMs=${encodeMs} ` +
      `serverTotalMs=${result.totalMs?.toFixed(2) ?? 'n/a'} requestMs=${requestMs} ` +
      `size=${citygsCamera.width}x${citygsCamera.height} camera=${citygsCamera.source_camera}`,
    );

    const imageUrl = `${publicFrameBaseUrl}/frame.png?t=${Date.now()}`;

    send({
      type: 'stats.render',
      sessionId,
      timestampMs: Date.now(),
      fps: 0,
      renderMs,
      saveMs,
      encodeMs,
      bitrateKbps: 0,
      serverTotalMs: result.totalMs,
      requestMs,
      // In render-loop mode the latest camera timestamp may be old because we
      // intentionally keep re-rendering the same pose. Report per-frame server
      // processing latency instead of camera-packet age.
      latencyMs: requestMs,
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
      maxWidth: 1920,
      maxHeight: 1080,
      maxFps: 2,
      gpuName: 'NVIDIA RTX A6000',
      gpuMemoryGb: 48,
    },
  });
  console.log(`citygs worker ${workerId} connected to ${signalingUrl}`);
  console.log(`renderServerUrls=${JSON.stringify(renderServerUrls)}`);
  console.log(`outputPath=${outputPath}`);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (!isProtocolMessage(msg)) return;

  if (msg.type === 'session.assigned') {
    activeSessions.set(msg.sessionId, msg.modelVariant);
    activeSessionOptions.set(msg.sessionId, {
      maxWidth: msg.maxWidth ?? defaultImageWidth,
      maxHeight: msg.maxHeight ?? defaultImageHeight,
      maxFps: msg.maxFps,
    });
    console.log(`assigned session=${msg.sessionId} scene=${msg.sceneId} modelVariant=${msg.modelVariant} size=${msg.maxWidth ?? defaultImageWidth}x${msg.maxHeight ?? defaultImageHeight}`);
    return;
  }

  if (msg.type === 'camera.control') {
    lastCamera = msg;
    const modelVariant = activeSessions.get(msg.sessionId) ?? 'unknown';
    const poseInfo = msg.pose ? `pose=[${msg.pose.position.map((v) => v.toFixed(2)).join(',')}]` : 'fixed-camera';
    console.log(`camera packet seq=${msg.sequence} session=${msg.sessionId} modelVariant=${modelVariant}; saved latest camera ${poseInfo}`);
    if (streamClientCount === 0) void renderFrame(msg.sessionId, msg);
  }
});

startRenderLoop();

ws.on('close', () => {
  console.log('citygs worker disconnected from signaling');
});

ws.on('error', (error) => {
  console.error('citygs worker websocket error:', error);
});
