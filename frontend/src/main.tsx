import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RenderStats } from '@citygs/shared';
import { SignalingClient } from './signalingClient';
import './styles.css';

function App() {
  const client = useMemo(() => new SignalingClient(), []);
  const [status, setStatus] = useState('idle');
  const [sceneId, setSceneId] = useState('matrixcity-demo-block');
  const [sessionId, setSessionId] = useState('-');
  const [stats, setStats] = useState<RenderStats | undefined>();
  const sequence = useRef(0);
  const dragging = useRef(false);

  client.onStatus = setStatus;
  client.onAssigned = (s) => { setSessionId(s.sessionId); setStatus(`assigned worker ${s.workerId}`); };
  client.onStats = setStats;

  const sendDelta = (delta: Record<string, number>) => {
    client.sendCamera({ sequence: ++sequence.current, mode: 'delta', delta });
  };

  return <main className="app">
    <section className="hero">
      <h1>CityGS Remote Render MVP</h1>
      <p>Thin browser client for server-side 3D Gaussian Splatting rendering.</p>
    </section>

    <section className="toolbar">
      <input value={sceneId} onChange={(e) => setSceneId(e.target.value)} />
      <button onClick={() => client.connect('ws://localhost:8788')}>Connect signaling</button>
      <button onClick={() => client.requestSession(sceneId)}>Start session</button>
    </section>

    <section className="layout">
      <div
        className="viewport"
        tabIndex={0}
        onMouseDown={() => { dragging.current = true; }}
        onMouseUp={() => { dragging.current = false; }}
        onMouseLeave={() => { dragging.current = false; }}
        onMouseMove={(e) => dragging.current && sendDelta({ yaw: e.movementX * 0.002, pitch: e.movementY * 0.002 })}
        onWheel={(e) => sendDelta({ dolly: e.deltaY * 0.01 })}
        onKeyDown={(e) => {
          const step = 0.08;
          if (e.key === 'w') sendDelta({ dolly: -step });
          if (e.key === 's') sendDelta({ dolly: step });
          if (e.key === 'a') sendDelta({ truck: -step });
          if (e.key === 'd') sendDelta({ truck: step });
          if (e.key === 'q') sendDelta({ pedestal: -step });
          if (e.key === 'e') sendDelta({ pedestal: step });
        }}
      >
        <div className="videoPlaceholder">Remote WebRTC video stream placeholder</div>
        <div className="hint">Drag: orbit · Wheel: dolly · WASD/QE: move</div>
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
      </aside>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
