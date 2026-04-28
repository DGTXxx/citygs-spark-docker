import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CameraPose, RenderStats } from '@citygs/shared';
import { SignalingClient } from './signalingClient';
import './styles.css';

const signalingUrlStorageKey = 'citygs.signalingUrl';
const frameBaseUrlStorageKey = 'citygs.frameBaseUrl';
const defaultSignalingUrl = 'ws://localhost:8788';
const defaultFrameBaseUrl = 'http://127.0.0.1:8789';
const cameraSendIntervalMs = 250;

// Match the known-good CityGaussian camera first, then orbit around a point
// along its optical axis. This keeps the MVP camera inside the trained
// MatrixCity coordinate range instead of orbiting an arbitrary origin.
const orbitTarget: [number, number, number] = [-2.9289, -0.38, -5.5711];
const initialOrbit = {
  yaw: Math.PI,
  pitch: Math.PI / 4,
  radius: 10,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getStoredValue(key: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function setStoredValue(key: string, value: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
}

function orbitToPose(orbit: { yaw: number; pitch: number; radius: number }): CameraPose {
  const cp = Math.cos(orbit.pitch);
  const position: [number, number, number] = [
    orbitTarget[0] + orbit.radius * cp * Math.cos(orbit.yaw),
    orbitTarget[1] + orbit.radius * cp * Math.sin(orbit.yaw),
    orbitTarget[2] + orbit.radius * Math.sin(orbit.pitch),
  ];

  return {
    position,
    // Worker currently derives orientation with lookAt(position -> fixed target).
    rotation: [1, 0, 0, 0],
    fovYDegrees: 26.23,
    near: 0.01,
    far: 100,
  };
}

function App() {
  const client = useMemo(() => new SignalingClient(), []);
  const [status, setStatus] = useState('idle');
  const [sceneId, setSceneId] = useState('matrixcity-demo-block');
  const [signalingUrl, setSignalingUrl] = useState(() => getStoredValue(signalingUrlStorageKey, defaultSignalingUrl));
  const [frameBaseUrl, setFrameBaseUrl] = useState(() => getStoredValue(frameBaseUrlStorageKey, defaultFrameBaseUrl));
  const [sessionId, setSessionId] = useState('-');
  const [stats, setStats] = useState<RenderStats | undefined>();
  const [orbitDebug, setOrbitDebug] = useState(initialOrbit);
  const [isRendering, setIsRendering] = useState(false);
  const sequence = useRef(0);
  const dragging = useRef(false);
  const orbit = useRef({ ...initialOrbit });
  const lastCameraSentAt = useRef(0);
  const cameraSendTimer = useRef<number | undefined>(undefined);

  const sendOrbitSnapshotNow = () => {
    if (cameraSendTimer.current) {
      window.clearTimeout(cameraSendTimer.current);
      cameraSendTimer.current = undefined;
    }
    const pose = orbitToPose(orbit.current);
    client.sendCamera({ sequence: ++sequence.current, mode: 'snapshot', pose });
    lastCameraSentAt.current = Date.now();
    setOrbitDebug({ ...orbit.current });
    setIsRendering(true);
  };

  const queueOrbitSnapshot = () => {
    const elapsed = Date.now() - lastCameraSentAt.current;
    if (elapsed >= cameraSendIntervalMs) {
      sendOrbitSnapshotNow();
      return;
    }
    if (cameraSendTimer.current) return;
    cameraSendTimer.current = window.setTimeout(sendOrbitSnapshotNow, cameraSendIntervalMs - elapsed);
  };

  client.onStatus = (nextStatus) => {
    setStatus(nextStatus);
    if (nextStatus.startsWith('error:') || nextStatus === 'signaling-closed' || nextStatus === 'signaling-error') {
      setIsRendering(false);
    }
  };
  client.onAssigned = (s) => {
    setSessionId(s.sessionId);
    setStatus(`assigned worker ${s.workerId}`);
    sendOrbitSnapshotNow();
  };
  client.onStats = (nextStats) => {
    setStats(nextStats);
    setIsRendering(false);
  };

  const updateSignalingUrl = (value: string) => {
    setSignalingUrl(value);
    setStoredValue(signalingUrlStorageKey, value);
  };

  const updateFrameBaseUrl = (value: string) => {
    setFrameBaseUrl(value);
    setStoredValue(frameBaseUrlStorageKey, value);
  };

  const updateOrbit = (delta: { yaw?: number; pitch?: number; radius?: number }) => {
    orbit.current = {
      yaw: orbit.current.yaw + (delta.yaw ?? 0),
      pitch: clamp(orbit.current.pitch + (delta.pitch ?? 0), -1.2, 1.2),
      radius: clamp(orbit.current.radius + (delta.radius ?? 0), 3, 30),
    };
    setOrbitDebug({ ...orbit.current });
    queueOrbitSnapshot();
  };

  const frameUrl = (() => {
    if (!stats) return undefined;
    if (frameBaseUrl.trim()) {
      return `${frameBaseUrl.replace(/\/$/, '')}/frame.png?t=${stats.timestampMs}`;
    }
    return stats.imageUrl;
  })();

  return <main className="app">
    <section className="hero">
      <h1>CityGS Remote Render MVP</h1>
      <p>Thin browser client for server-side 3D Gaussian Splatting rendering.</p>
    </section>

    <section className="toolbar">
      <label>
        Scene
        <input value={sceneId} onChange={(e) => setSceneId(e.target.value)} />
      </label>
      <label>
        Signaling URL
        <input value={signalingUrl} onChange={(e) => updateSignalingUrl(e.target.value)} placeholder="wss://...trycloudflare.com" />
      </label>
      <label>
        Frame base URL
        <input value={frameBaseUrl} onChange={(e) => updateFrameBaseUrl(e.target.value)} placeholder="https://...trycloudflare.com" />
      </label>
      <button onClick={() => client.connect(signalingUrl)}>Connect signaling</button>
      <button onClick={() => client.requestSession(sceneId)}>Start session</button>
    </section>

    <section className="layout">
      <div
        className="viewport"
        tabIndex={0}
        onMouseDown={(e) => {
          e.currentTarget.focus();
          dragging.current = true;
        }}
        onMouseUp={() => { dragging.current = false; }}
        onMouseLeave={() => { dragging.current = false; }}
        onMouseMove={(e) => dragging.current && updateOrbit({ yaw: e.movementX * 0.006, pitch: -e.movementY * 0.006 })}
        onWheel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          updateOrbit({ radius: e.deltaY * 0.01 });
        }}
        onKeyDown={(e) => {
          const step = 0.1;
          if (e.key === 'a') updateOrbit({ yaw: -step });
          if (e.key === 'd') updateOrbit({ yaw: step });
          if (e.key === 'w') updateOrbit({ pitch: step });
          if (e.key === 's') updateOrbit({ pitch: -step });
          if (e.key === 'q') updateOrbit({ radius: step });
          if (e.key === 'e') updateOrbit({ radius: -step });
        }}
      >
        {frameUrl
          ? <img className="renderFrame" src={frameUrl} alt="Latest CityGS render" />
          : <div className="videoPlaceholder">Remote CityGS render frame placeholder</div>}
        {isRendering && <div className="renderingBadge">Rendering...</div>}
        <div className="hint">Drag: orbit · Wheel: zoom · WASD/QE: orbit/zoom</div>
      </div>

      <aside className="panel">
        <h2>Session</h2>
        <p><b>Status:</b> {status}</p>
        <p><b>Client:</b> {client.clientId}</p>
        <p><b>Session:</b> {sessionId}</p>
        <h2>Render stats</h2>
        <p>FPS: {stats?.fps ?? '-'}</p>
        <p>Render: {stats?.renderMs ?? '-'} ms</p>
        <p>Encode: {stats?.encodeMs ?? '-'} ms</p>
        <p>Bitrate: {stats?.bitrateKbps ?? '-'} kbps</p>
        <p>Latency: {stats?.latencyMs ?? '-'} ms</p>
        <p>Image: {frameUrl ? 'latest frame loaded' : '-'}</p>
        <p>Rendering: {isRendering ? 'yes' : 'no'}</p>
        <h2>Orbit camera</h2>
        <p>Yaw: {orbitDebug.yaw.toFixed(2)}</p>
        <p>Pitch: {orbitDebug.pitch.toFixed(2)}</p>
        <p>Radius: {orbitDebug.radius.toFixed(2)}</p>
      </aside>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
