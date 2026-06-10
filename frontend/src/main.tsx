import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CameraPose, ModelVariant, PreferredCodec, RenderStats } from '@citygs/shared';
import { SparkDemo } from './SparkDemo';
import { SessionOptions, SignalingClient } from './signalingClient';
import './styles.css';

const architectureSteps = [
  { title: 'Web Client', subtitle: '浏览器交互层', note: '负责页面展示、相机拖拽、参数配置和渲染结果播放。' },
  { title: 'Camera Protocol', subtitle: '相机控制协议', note: '将 position、rotation、FOV、分辨率、质量档位等参数封装为控制消息。' },
  { title: 'Signaling Server', subtitle: '信令与会话管理', note: '维护 client / session / worker 关系，转发控制消息和渲染状态。' },
  { title: 'Render Worker', subtitle: '服务端渲染调度', note: '保存最新相机位姿，按渲染循环向 CityGS 渲染服务请求图像帧。' },
  { title: 'CityGS Renderer', subtitle: 'GPU 渲染核心', note: '加载离线训练好的 MatrixCity / CityGS 模型，根据相机参数生成当前视角。' },
  { title: 'Frame Encoder', subtitle: '图像/视频编码层', note: '当前输出 PNG/JPEG/MJPEG，后续可接入 H.264/H.265 硬件编码。' },
  { title: 'Streaming Output', subtitle: '低延迟回传层', note: '当前通过 MJPEG 流回传浏览器，最终目标为 WebRTC 视频流。' },
  { title: 'Metrics Panel', subtitle: '性能监控展示', note: '展示 render、encode、latency、FPS 等指标，用于观察端到端链路状态。' },
];

type QualityPreset = SessionOptions['qualityPreset'];
type DisplayMode = 'png' | 'mjpeg' | 'webrtc';

const qualityPresets: Record<Exclude<QualityPreset, 'custom'>, Pick<SessionOptions, 'maxWidth' | 'maxHeight' | 'maxFps' | 'qualityPreset'> & { label: string; modelVariant: ModelVariant }> = {
  'low-latency': { label: '低延迟 720p/30', maxWidth: 1280, maxHeight: 720, maxFps: 30, qualityPreset: 'low-latency', modelVariant: 'coarse' },
  balanced: { label: '均衡 1080p/30', maxWidth: 1920, maxHeight: 1080, maxFps: 30, qualityPreset: 'balanced', modelVariant: 'coarse' },
  quality: { label: '质量 LOD 1080p/60', maxWidth: 1920, maxHeight: 1080, maxFps: 60, qualityPreset: 'quality', modelVariant: 'lod' },
};

type ResolutionPreset = '960x540' | '1280x720' | '1920x1080' | 'custom';

const resolutionPresets: Record<Exclude<ResolutionPreset, 'custom'>, { label: string; maxWidth: number; maxHeight: number }> = {
  '960x540': { label: '540p 流畅 960×540', maxWidth: 960, maxHeight: 540 },
  '1280x720': { label: '720p 标准 1280×720', maxWidth: 1280, maxHeight: 720 },
  '1920x1080': { label: '1080p 高清 1920×1080', maxWidth: 1920, maxHeight: 1080 },
};

const signalingUrlStorageKey = 'citygs.signalingUrl';
const frameBaseUrlStorageKey = 'citygs.frameBaseUrl';
const webRtcServerUrlStorageKey = 'citygs.webRtcServerUrl';
const defaultSignalingUrl = 'ws://localhost:8788';
const defaultFrameBaseUrl = 'http://127.0.0.1:8789';
const defaultWebRtcServerUrl = 'http://127.0.0.1:9200';
const defaultCameraSendIntervalMs = 250;
const mouseYawSensitivity = 0.0025;
const mousePitchSensitivity = 0.0025;
const keyYawStep = 0.04;
const keyPitchStep = 0.025;
const keyRadiusStep = 0.4;
const wheelRadiusSensitivity = 0.004;

// Match the known-good CityGaussian camera first, then orbit around a point
// along its optical axis. This keeps the MVP camera inside the trained
// MatrixCity coordinate range instead of orbiting an arbitrary origin.
const orbitTarget: [number, number, number] = [-2.9289, -0.38, -5.5711];
const initialOrbit = {
  yaw: Math.PI,
  pitch: Math.PI / 4,
  radius: 10,
};

const cameraPresets = [
  { name: '初始视角', orbit: initialOrbit },
  { name: '近景观察', orbit: { yaw: Math.PI, pitch: 0.72, radius: 8.5 } },
  { name: '高空总览', orbit: { yaw: Math.PI * 0.96, pitch: 1.0, radius: 16 } },
  { name: '左侧观察', orbit: { yaw: Math.PI - 0.28, pitch: 0.78, radius: 10.5 } },
  { name: '右侧观察', orbit: { yaw: Math.PI + 0.28, pitch: 0.78, radius: 10.5 } },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getUrlOverride(...names: string[]) {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  for (const name of names) {
    const value = params.get(name);
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

function getStoredValue(key: string, fallback: string, ...urlOverrideNames: string[]) {
  if (typeof window === 'undefined') return fallback;
  const override = getUrlOverride(...urlOverrideNames);
  if (override) {
    window.localStorage.setItem(key, override);
    return override;
  }
  const stored = window.localStorage.getItem(key);
  // Quick Cloudflare tunnel URLs are ephemeral. Public preview links should pass
  // current endpoints through query params instead of trusting old localStorage.
  if (window.location.hostname.endsWith('trycloudflare.com')) {
    if (!stored || stored.includes('trycloudflare.com')) {
      window.localStorage.setItem(key, fallback);
      return fallback;
    }
  }
  return stored || fallback;
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
  const [modelVariant, setModelVariant] = useState<ModelVariant>('coarse');
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('low-latency');
  const [preferredCodec, setPreferredCodec] = useState<PreferredCodec>('h264');
  const [resolutionPreset, setResolutionPreset] = useState<ResolutionPreset>('1280x720');
  const [maxWidth, setMaxWidth] = useState(1280);
  const [maxHeight, setMaxHeight] = useState(720);
  const [maxFps, setMaxFps] = useState(30);
  const [controlSendIntervalMs, setControlSendIntervalMs] = useState(defaultCameraSendIntervalMs);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => {
    const mode = getUrlOverride('displayMode', 'mode');
    return mode === 'mjpeg' || mode === 'webrtc' ? mode : 'png';
  });
  const [signalingUrl, setSignalingUrl] = useState(() => getStoredValue(signalingUrlStorageKey, defaultSignalingUrl, 'signalingUrl', 'signaling'));
  const [frameBaseUrl, setFrameBaseUrl] = useState(() => getStoredValue(frameBaseUrlStorageKey, defaultFrameBaseUrl, 'frameBaseUrl', 'frame'));
  const [webRtcServerUrl, setWebRtcServerUrl] = useState(() => getStoredValue(webRtcServerUrlStorageKey, defaultWebRtcServerUrl, 'webrtcUrl', 'webrtc'));
  const [sessionId, setSessionId] = useState('-');
  const [workerId, setWorkerId] = useState('-');
  const [lastError, setLastError] = useState<string | undefined>();
  const [stats, setStats] = useState<RenderStats | undefined>();
  const [orbitDebug, setOrbitDebug] = useState(initialOrbit);
  const [isRendering, setIsRendering] = useState(false);
  const sequence = useRef(0);
  const dragging = useRef(false);
  const activePointerId = useRef<number | undefined>(undefined);
  const orbit = useRef({ ...initialOrbit });
  const lastCameraSentAt = useRef(0);
  const cameraSendTimer = useRef<number | undefined>(undefined);
  const autoSessionStarted = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const sessionOptions: SessionOptions = { preferredCodec, maxWidth, maxHeight, maxFps, qualityPreset };

  const sendWebRtcCamera = async (pose: CameraPose) => {
    const baseUrl = webRtcServerUrl.trim().replace(/\/$/, '');
    if (!baseUrl || displayMode !== 'webrtc') return;
    try {
      await fetch(`${baseUrl}/camera`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pose, width: maxWidth, height: maxHeight, modelVariant }),
      });
    } catch (error) {
      setLastError(`WebRTC camera update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const stopWebRtc = () => {
    peerRef.current?.close();
    peerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startWebRtc = async () => {
    const baseUrl = webRtcServerUrl.trim().replace(/\/$/, '');
    if (!baseUrl) return;
    stopWebRtc();
    setLastError(undefined);
    setStatus('webrtc-connecting');
    try {
      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
          void videoRef.current.play();
        }
      };
      pc.onconnectionstatechange = () => setStatus(`webrtc-${pc.connectionState}`);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch(`${baseUrl}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pc.localDescription),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const answer = await response.json();
      await pc.setRemoteDescription(answer);
      await sendWebRtcCamera(orbitToPose(orbit.current));
    } catch (error) {
      stopWebRtc();
      setStatus('webrtc-error');
      setLastError(`WebRTC start failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const sendOrbitSnapshotNow = () => {
    if (cameraSendTimer.current) {
      window.clearTimeout(cameraSendTimer.current);
      cameraSendTimer.current = undefined;
    }
    const pose = orbitToPose(orbit.current);
    const sent = displayMode === 'webrtc'
      ? (void sendWebRtcCamera(pose), true)
      : client.sendCamera({ sequence: ++sequence.current, mode: 'snapshot', pose });
    lastCameraSentAt.current = Date.now();
    setOrbitDebug({ ...orbit.current });
    setIsRendering(sent && displayMode !== 'webrtc');
  };

  const queueOrbitSnapshot = () => {
    const elapsed = Date.now() - lastCameraSentAt.current;
    if (elapsed >= controlSendIntervalMs) {
      sendOrbitSnapshotNow();
      return;
    }
    if (cameraSendTimer.current) return;
    cameraSendTimer.current = window.setTimeout(sendOrbitSnapshotNow, controlSendIntervalMs - elapsed);
  };

  client.onStatus = (nextStatus) => {
    setStatus(nextStatus);
    if (nextStatus === 'signaling-connected' && !autoSessionStarted.current) {
      autoSessionStarted.current = true;
      client.requestSession(sceneId, modelVariant, sessionOptions);
    }
    if (nextStatus.startsWith('error:')) {
      setLastError(nextStatus.replace(/^error:\s*/, ''));
      setIsRendering(false);
    }
    if (nextStatus === 'signaling-closed' || nextStatus === 'signaling-error') {
      setWorkerId('-');
      setSessionId('-');
      setIsRendering(false);
    }
  };
  client.onAssigned = (s) => {
    setSessionId(s.sessionId);
    setWorkerId(s.workerId);
    setLastError(undefined);
    setStatus(`session-ready`);
    sendOrbitSnapshotNow();
  };
  client.onStats = (nextStats) => {
    setStats(nextStats);
    setLastError(undefined);
    setIsRendering(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (signalingUrl.trim()) client.connect(signalingUrl);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [client, signalingUrl]);

  const updateSignalingUrl = (value: string) => {
    autoSessionStarted.current = false;
    setSessionId('-');
    setWorkerId('-');
    setStats(undefined);
    setLastError(undefined);
    setIsRendering(false);
    client.disconnect();
    setStatus('idle');
    setSignalingUrl(value);
    setStoredValue(signalingUrlStorageKey, value);
  };

  const updateFrameBaseUrl = (value: string) => {
    setFrameBaseUrl(value);
    setStoredValue(frameBaseUrlStorageKey, value);
  };

  const updateWebRtcServerUrl = (value: string) => {
    setWebRtcServerUrl(value);
    setStoredValue(webRtcServerUrlStorageKey, value);
  };

  const reconnectAndStart = () => {
    autoSessionStarted.current = false;
    setSessionId('-');
    setWorkerId('-');
    setStats(undefined);
    setLastError(undefined);
    setIsRendering(false);
    client.connect(signalingUrl);
  };

  const restartSession = () => {
    autoSessionStarted.current = true;
    setSessionId('-');
    setWorkerId('-');
    setStats(undefined);
    setLastError(undefined);
    client.requestSession(sceneId, modelVariant, sessionOptions);
  };

  const requestSessionForModel = (nextModelVariant: ModelVariant, nextOptions: SessionOptions = sessionOptions) => {
    setSessionId('-');
    setWorkerId('-');
    setStats(undefined);
    setLastError(undefined);
    setIsRendering(false);
    autoSessionStarted.current = true;
    client.requestSession(sceneId, nextModelVariant, nextOptions);
  };

  const changeModelVariant = (nextModelVariant: ModelVariant) => {
    setModelVariant(nextModelVariant);
    requestSessionForModel(nextModelVariant);
  };

  const applyQualityPreset = (presetName: Exclude<QualityPreset, 'custom'>) => {
    const preset = qualityPresets[presetName];
    const nextOptions: SessionOptions = {
      preferredCodec,
      maxWidth: preset.maxWidth,
      maxHeight: preset.maxHeight,
      maxFps: preset.maxFps,
      qualityPreset: preset.qualityPreset,
    };
    setQualityPreset(preset.qualityPreset);
    const presetResolution = `${preset.maxWidth}x${preset.maxHeight}` as ResolutionPreset;
    setResolutionPreset(presetResolution in resolutionPresets ? presetResolution : 'custom');
    setMaxWidth(preset.maxWidth);
    setMaxHeight(preset.maxHeight);
    setMaxFps(preset.maxFps);
    setModelVariant(preset.modelVariant);
    requestSessionForModel(preset.modelVariant, nextOptions);
  };

  const setCustomRenderConfig = (updates: Partial<Pick<SessionOptions, 'maxWidth' | 'maxHeight' | 'maxFps'>>) => {
    setQualityPreset('custom');
    if (updates.maxWidth !== undefined || updates.maxHeight !== undefined) setResolutionPreset('custom');
    if (updates.maxWidth !== undefined) setMaxWidth(updates.maxWidth);
    if (updates.maxHeight !== undefined) setMaxHeight(updates.maxHeight);
    if (updates.maxFps !== undefined) setMaxFps(updates.maxFps);
  };

  const applyResolutionPreset = (presetName: ResolutionPreset) => {
    setResolutionPreset(presetName);
    if (presetName === 'custom') {
      setQualityPreset('custom');
      return;
    }
    const preset = resolutionPresets[presetName];
    setQualityPreset('custom');
    setMaxWidth(preset.maxWidth);
    setMaxHeight(preset.maxHeight);
  };

  const setCameraPreset = (nextOrbit: typeof initialOrbit) => {
    orbit.current = { ...nextOrbit };
    setOrbitDebug({ ...orbit.current });
    sendOrbitSnapshotNow();
  };

  const resetCamera = () => setCameraPreset(initialOrbit);

  const updateOrbit = (delta: { yaw?: number; pitch?: number; radius?: number }) => {
    orbit.current = {
      yaw: orbit.current.yaw + (delta.yaw ?? 0),
      pitch: clamp(orbit.current.pitch + (delta.pitch ?? 0), -1.2, 1.2),
      radius: clamp(orbit.current.radius + (delta.radius ?? 0), 3, 30),
    };
    setOrbitDebug({ ...orbit.current });
    queueOrbitSnapshot();
  };

  const normalizedFrameBaseUrl = frameBaseUrl.trim().replace(/\/$/, '');
  const streamUrl = normalizedFrameBaseUrl ? `${normalizedFrameBaseUrl}/stream.mjpg` : undefined;
  const frameUrl = (() => {
    if (!stats) return undefined;
    if (normalizedFrameBaseUrl) {
      return `${normalizedFrameBaseUrl}/frame.png?t=${stats.timestampMs}`;
    }
    return stats.imageUrl;
  })();

  const frameBudgetMs = Math.round(1000 / Math.max(1, maxFps));
  const renderMs = stats?.renderMs ?? 0;
  const saveMs = stats?.saveMs ?? 0;
  const encodeMs = stats?.encodeMs ?? 0;
  const requestMs = stats?.requestMs ?? stats?.latencyMs ?? 0;
  const serverTotalMs = stats?.serverTotalMs ?? renderMs + saveMs;
  const measuredLatencyMs = stats?.latencyMs ?? (requestMs || renderMs + saveMs + encodeMs);
  const transportMs = Math.max(0, measuredLatencyMs - serverTotalMs - encodeMs);
  const renderPressure = Math.min(100, Math.round((renderMs / frameBudgetMs) * 100));
  const savePressure = Math.min(100, Math.round((saveMs / frameBudgetMs) * 100));
  const encodePressure = Math.min(100, Math.round((encodeMs / frameBudgetMs) * 100));
  const transportPressure = Math.min(100, Math.round((transportMs / frameBudgetMs) * 100));
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
        Model
        <select
          value={modelVariant}
          onChange={(e) => changeModelVariant(e.target.value as ModelVariant)}
        >
          <option value="coarse">快速预览 Coarse</option>
          <option value="full">高质量 Full</option>
          <option value="lod">三层 LOD</option>
        </select>
      </label>
      <label>
        Quality preset
        <select
          value={qualityPreset}
          onChange={(e) => {
            const next = e.target.value as QualityPreset;
            if (next === 'custom') setQualityPreset('custom');
            else applyQualityPreset(next);
          }}
        >
          <option value="low-latency">低延迟 720p/30</option>
          <option value="balanced">均衡 1080p/30</option>
          <option value="quality">质量 LOD 1080p/60</option>
          <option value="custom">自定义</option>
        </select>
      </label>
      <label>
        Codec
        <select value={preferredCodec} onChange={(e) => setPreferredCodec(e.target.value as PreferredCodec)}>
          <option value="h264">H.264</option>
          <option value="av1">AV1</option>
        </select>
      </label>
      <label>
        Resolution
        <select value={resolutionPreset} onChange={(e) => applyResolutionPreset(e.target.value as ResolutionPreset)}>
          <option value="960x540">540p 流畅 960×540</option>
          <option value="1280x720">720p 标准 1280×720</option>
          <option value="1920x1080">1080p 高清 1920×1080</option>
          <option value="custom">自定义</option>
        </select>
      </label>
      {resolutionPreset === 'custom' && <label>
        Custom size
        <div className="inlineInputs">
          <input type="number" min={320} step={160} value={maxWidth} onChange={(e) => setCustomRenderConfig({ maxWidth: Number(e.target.value) })} aria-label="Max width" />
          <span>×</span>
          <input type="number" min={240} step={90} value={maxHeight} onChange={(e) => setCustomRenderConfig({ maxHeight: Number(e.target.value) })} aria-label="Max height" />
        </div>
      </label>}
      <label>
        Target FPS
        <input type="number" min={1} max={120} value={maxFps} onChange={(e) => setCustomRenderConfig({ maxFps: Number(e.target.value) })} />
      </label>
      <label>
        Control interval
        <input type="number" min={16} max={1000} step={16} value={controlSendIntervalMs} onChange={(e) => setControlSendIntervalMs(Number(e.target.value))} />
      </label>
      <label>
        Signaling URL
        <input value={signalingUrl} onChange={(e) => updateSignalingUrl(e.target.value)} placeholder="wss://...trycloudflare.com" />
      </label>
      <label>
        Frame base URL
        <input value={frameBaseUrl} onChange={(e) => updateFrameBaseUrl(e.target.value)} placeholder="https://...trycloudflare.com" />
      </label>
      <label>
        WebRTC server URL
        <input value={webRtcServerUrl} onChange={(e) => updateWebRtcServerUrl(e.target.value)} placeholder="https://...trycloudflare.com" />
      </label>
      <label>
        Display mode
        <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}>
          <option value="png">Latest PNG</option>
          <option value="mjpeg">MJPEG Stream</option>
          <option value="webrtc">WebRTC Video</option>
        </select>
      </label>
      <button onClick={reconnectAndStart}>Reconnect</button>
      <button onClick={startWebRtc}>Start WebRTC</button>
      <button onClick={restartSession}>Apply settings</button>
      <button onClick={resetCamera}>Reset camera</button>
    </section>

    <section className="layout">
      <div className="viewerColumn">
        <div
          className="viewport"
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.focus();
            dragging.current = true;
            activePointerId.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            activePointerId.current = undefined;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={(e) => {
            dragging.current = false;
            activePointerId.current = undefined;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragging.current || activePointerId.current !== e.pointerId) return;
            e.preventDefault();
            updateOrbit({ yaw: e.movementX * mouseYawSensitivity, pitch: -e.movementY * mousePitchSensitivity });
          }}
          onWheel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            updateOrbit({ radius: e.deltaY * wheelRadiusSensitivity });
          }}
          onKeyDown={(e) => {
            if (['a', 'd', 'w', 's', 'q', 'e'].includes(e.key)) {
              e.preventDefault();
              e.stopPropagation();
            }
            if (e.key === 'a') updateOrbit({ yaw: -keyYawStep });
            if (e.key === 'd') updateOrbit({ yaw: keyYawStep });
            if (e.key === 'w') updateOrbit({ pitch: keyPitchStep });
            if (e.key === 's') updateOrbit({ pitch: -keyPitchStep });
            if (e.key === 'q') updateOrbit({ radius: keyRadiusStep });
            if (e.key === 'e') updateOrbit({ radius: -keyRadiusStep });
          }}
        >
          {displayMode === 'webrtc'
            ? <video className="renderFrame" ref={videoRef} autoPlay playsInline muted />
            : displayMode === 'mjpeg' && streamUrl
              ? <img className="renderFrame" src={streamUrl} alt="CityGS MJPEG stream" />
              : frameUrl
                ? <img className="renderFrame" src={frameUrl} alt="Latest CityGS render" />
                : <div className="videoPlaceholder">Remote CityGS render frame placeholder</div>}
          {isRendering && <div className="renderingBadge">Rendering...</div>}
          {lastError && <div className="errorBadge">{lastError}</div>}
          <div className="hint">Drag: orbit · Wheel: zoom · WASD/QE: orbit/zoom</div>
        </div>

        <div className="orbitBar">
          <b>Orbit camera</b>
          <span>Yaw: {orbitDebug.yaw.toFixed(2)}</span>
          <span>Pitch: {orbitDebug.pitch.toFixed(2)}</span>
          <span>Radius: {orbitDebug.radius.toFixed(2)}</span>
        </div>

        <div className="presetBar">
          <b>Camera presets</b>
          {cameraPresets.map((preset) => (
            <button className="secondaryButton" key={preset.name} onClick={() => setCameraPreset(preset.orbit)}>{preset.name}</button>
          ))}
        </div>
      </div>

      <aside className="panel">
        <h2>Session</h2>
        <p><b>Status:</b> {status}</p>
        <p><b>Client:</b> {client.clientId}</p>
        <p><b>Session:</b> {sessionId}</p>
        <p><b>Worker:</b> {workerId}</p>
        <p><b>Model:</b> {modelVariant}</p>
        <p><b>Resolution:</b> {maxWidth} × {maxHeight}</p>
        <p><b>Last error:</b> {lastError ?? '-'}</p>
        <h2>Render stats</h2>
        <p>FPS: {stats?.fps ?? '-'}</p>
        <p>GPU render: {stats?.renderMs?.toFixed?.(2) ?? '-'} ms</p>
        <p>Save PNG: {stats?.saveMs?.toFixed?.(2) ?? '-'} ms</p>
        <p>JPEG encode: {stats?.encodeMs ?? '-'} ms</p>
        <p>Server total: {stats?.serverTotalMs?.toFixed?.(2) ?? '-'} ms</p>
        <p>Worker request: {stats?.requestMs ?? '-'} ms</p>
        <p>Bitrate: {stats?.bitrateKbps ?? '-'} kbps</p>
        <p>Latency: {stats?.latencyMs ?? '-'} ms</p>
        <p>Display: {displayMode === 'mjpeg' ? 'MJPEG stream' : 'Latest PNG'}</p>
        <p>Image: {displayMode === 'mjpeg' ? (streamUrl ? 'stream endpoint' : '-') : (frameUrl ? 'latest frame loaded' : '-')}</p>
        <p>Rendering: {isRendering ? 'yes' : 'no'}</p>

        <h2>Bottleneck view</h2>
        <p>Frame budget: {frameBudgetMs} ms @ {maxFps} FPS</p>
        <div className="metricBar">
          <span>Render {renderMs} ms</span>
          <i style={{ width: `${renderPressure}%` }} />
        </div>
        <div className="metricBar save">
          <span>Save PNG {saveMs.toFixed(1)} ms</span>
          <i style={{ width: `${savePressure}%` }} />
        </div>
        <div className="metricBar encode">
          <span>Encode JPEG {encodeMs} ms</span>
          <i style={{ width: `${encodePressure}%` }} />
        </div>
        <div className="metricBar network">
          <span>Request/Display overhead {transportMs.toFixed(1)} ms</span>
          <i style={{ width: `${transportPressure}%` }} />
        </div>
      </aside>
    </section>

    <section className="presentationGrid presentationGridSingle" aria-label="远程实时渲染技术路线">
      <div className="routeCard">
        <div className="sectionHeader">
          <span className="eyebrow">Technical route</span>
          <h2>CityGS 远程实时渲染技术路线</h2>
          <p>浏览器负责交互与播放，A6000 服务器负责模型加载、GPU 渲染、帧编码和结果回传。</p>
        </div>
        <div className="pipeline">
          {architectureSteps.map((step, index) => (
            <div className="pipelineStep" key={step.title}>
              <div className="stepIndex">{index + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.subtitle}</p>
              <small>{step.note}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  </main>;
}

const params = new URLSearchParams(window.location.search);
createRoot(document.getElementById('root')!).render(params.has('spark') ? <SparkDemo /> : <App />);
