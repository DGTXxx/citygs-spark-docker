import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CameraPose, RenderStats } from '@citygs/shared';
import { SignalingClient } from './signalingClient';
import './styles.css';

const orbitTarget: [number, number, number] = [0, -0.38, 0];
const initialOrbit = {
  yaw: Math.PI,
  pitch: 0.15,
  radius: 10.2,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  const [signalingUrl, setSignalingUrl] = useState('ws://localhost:8788');
  const [frameBaseUrl, setFrameBaseUrl] = useState('http://127.0.0.1:8789');
  const [sessionId, setSessionId] = useState('-');
  const [stats, setStats] = useState<RenderStats | undefined>();
  const [orbitDebug, setOrbitDebug] = useState(initialOrbit);
  const sequence = useRef(0);
  const dragging = useRef(false);
  const orbit = useRef({ ...initialOrbit });

  client.onStatus = setStatus;
  client.onAssigned = (s) => {
    setSessionId(s.sessionId);
    setStatus(`assigned worker ${s.workerId}`);
    sendOrbitSnapshot();
  };
  client.onStats = setStats;

  const sendOrbitSnapshot = () => {
    const pose = orbitToPose(orbit.current);
    client.sendCamera({ sequence: ++sequence.current, mode: 'snapshot', pose });
    setOrbitDebug({ ...orbit.current });
  };

  const updateOrbit = (delta: { yaw?: number; pitch?: number; radius?: number }) => {
    orbit.current = {
      yaw: orbit.current.yaw + (delta.yaw ?? 0),
      pitch: clamp(orbit.current.pitch + (delta.pitch ?? 0), -1.2, 1.2),
      radius: clamp(orbit.current.radius + (delta.radius ?? 0), 3, 30),
    };
    sendOrbitSnapshot();
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
        <input value={signalingUrl} onChange={(e) => setSignalingUrl(e.target.value)} placeholder="wss://...trycloudflare.com" />
      </label>
      <label>
        Frame base URL
        <input value={frameBaseUrl} onChange={(e) => setFrameBaseUrl(e.target.value)} placeholder="https://...trycloudflare.com" />
      </label>
      <button onClick={() => client.connect(signalingUrl)}>Connect signaling</button>
      <button onClick={() => client.requestSession(sceneId)}>Start session</button>
    </section>

    <section className="layout">
      <div
        className="viewport"
        tabIndex={0}
        onMouseDown={() => { dragging.current = true; }}
        onMouseUp={() => { dragging.current = false; }}
        onMouseLeave={() => { dragging.current = false; }}
        onMouseMove={(e) => dragging.current && updateOrbit({ yaw: e.movementX * 0.006, pitch: -e.movementY * 0.006 })}
        onWheel={(e) => updateOrbit({ radius: e.deltaY * 0.01 })}
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
        <h2>Orbit camera</h2>
        <p>Yaw: {orbitDebug.yaw.toFixed(2)}</p>
        <p>Pitch: {orbitDebug.pitch.toFixed(2)}</p>
        <p>Radius: {orbitDebug.radius.toFixed(2)}</p>
      </aside>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
