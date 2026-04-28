import WebSocket from 'ws';
import { CameraControlPacket, isProtocolMessage, makeId, ProtocolMessage } from '@citygs/shared';

const signalingUrl = process.env.SIGNALING_URL ?? 'ws://localhost:8788';
const workerId = process.env.WORKER_ID ?? makeId('worker');
const ws = new WebSocket(signalingUrl);
const activeSessions = new Set<string>();
let lastCamera: CameraControlPacket | undefined;

function send(msg: ProtocolMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

ws.on('open', () => {
  send({
    type: 'worker.register',
    workerId,
    capabilities: {
      renderer: 'mock',
      codecs: ['h264', 'av1'],
      maxWidth: 1920,
      maxHeight: 1080,
      maxFps: 60,
      gpuName: 'mock-gpu-worker',
      gpuMemoryGb: 24,
    },
  });
  console.log(`mock worker ${workerId} connected to ${signalingUrl}`);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (!isProtocolMessage(msg)) return;
  if (msg.type === 'session.assigned') {
    activeSessions.add(msg.sessionId);
    console.log(`assigned session=${msg.sessionId} scene=${msg.sceneId}`);
  }
  if (msg.type === 'camera.control') {
    lastCamera = msg;
    console.log(`camera packet seq=${msg.sequence} session=${msg.sessionId}`, msg.delta ?? msg.pose);
  }
});

setInterval(() => {
  for (const sessionId of activeSessions) {
    send({
      type: 'stats.render',
      sessionId,
      timestampMs: Date.now(),
      fps: 60,
      renderMs: 8.2,
      encodeMs: 2.1,
      bitrateKbps: 6000,
      latencyMs: lastCamera ? Date.now() - lastCamera.timestampMs : undefined,
      gpuMemoryUsedMb: 4096,
    });
  }
}, 1000);
