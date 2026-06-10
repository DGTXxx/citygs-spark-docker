import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

const defaultSplatUrl = '/models/mc_aerial_c36_light_75_vq_preview_200k.ply';

type ModelPreset = {
  key: string;
  label: string;
  url: string;
  splats: number;
  sizeMb: number;
};

type CameraPreset = {
  key: string;
  label: string;
  offset: THREE.Vector3;
};

type RenderStats = {
  fps: number | null;
  splats: number;
  sizeMb: number;
  loadMs: number;
};

const modelPresets: ModelPreset[] = [
  {
    key: 'preview-200k',
    label: '200k',
    url: defaultSplatUrl,
    splats: 200_000,
    sizeMb: 31,
  },
  {
    key: 'preview-1000k',
    label: '1000k',
    url: '/models/mc_aerial_c36_light_75_vq_preview_1000k.ply',
    splats: 1_000_000,
    sizeMb: 157,
  },
  {
    key: 'preview-3000k',
    label: '3000k',
    url: '/models/mc_aerial_c36_light_75_vq_preview_3000k.ply',
    splats: 3_000_000,
    sizeMb: 469,
  },
  {
    key: 'coarse-7479k',
    label: 'Coarse',
    url: '/models/mc_aerial_coarse_iter30000_7479k.spz',
    splats: 7_479_470,
    sizeMb: 144,
  },
  {
    key: 'lod3-5912k',
    label: 'LOD 3',
    url: '/models/mc_aerial_c36_light_75_vq_full_5912k.spz',
    splats: 5_912_000,
    sizeMb: 114,
  },
  {
    key: 'lod2-8040k',
    label: 'LOD 2',
    url: '/models/mc_aerial_c36_light_66_vq_lod2_8040k.spz',
    splats: 8_040_318,
    sizeMb: 155,
  },
  {
    key: 'lod1-11824k',
    label: 'LOD 1',
    url: '/models/mc_aerial_c36_light_50_vq_lod1_11824k.spz',
    splats: 11_823_999,
    sizeMb: 230,
  },
  {
    key: 'c36-full-23648k',
    label: 'Full',
    url: '/models/mc_aerial_c36_full_23648k.compressed.ply',
    splats: 23_647_998,
    sizeMb: 1380,
  },
];

const cameraPresets: CameraPreset[] = [
  { key: 'overview', label: '城市总览', offset: new THREE.Vector3(0, -0.42, 0.24) },
  { key: 'top', label: '俯视结构', offset: new THREE.Vector3(0.02, -0.06, 0.62) },
  { key: 'low', label: '低空斜看', offset: new THREE.Vector3(0.3, -0.42, 0.14) },
  { key: 'side', label: '侧向观察', offset: new THREE.Vector3(0.46, -0.06, 0.22) },
];

function getInitialSplatUrl() {
  if (typeof window === 'undefined') return defaultSplatUrl;
  return new URLSearchParams(window.location.search).get('splatUrl') || defaultSplatUrl;
}

function getPresetForUrl(url: string) {
  return modelPresets.find((model) => model.url === url);
}

export function SparkDemo() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const viewRef = useRef<{ center: THREE.Vector3; radius: number } | null>(null);
  const loadIdRef = useRef(0);
  const [selectedModelKey, setSelectedModelKey] = useState(() => getPresetForUrl(getInitialSplatUrl())?.key ?? 'custom');
  const [splatUrl, setSplatUrl] = useState(getInitialSplatUrl);
  const [activeUrl, setActiveUrl] = useState(getInitialSplatUrl);
  const [status, setStatus] = useState('loading');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<RenderStats>({ fps: null, splats: 0, sizeMb: 0, loadMs: 0 });
  const [error, setError] = useState<string | undefined>();
  const [activePresetKey, setActivePresetKey] = useState('overview');

  const applyCameraPreset = (presetKey: string) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const view = viewRef.current;
    const preset = cameraPresets.find((candidate) => candidate.key === presetKey) ?? cameraPresets[0];
    if (!camera || !controls || !view) return;
    const offset = preset.offset.clone().multiplyScalar(view.radius);
    camera.position.copy(view.center).add(offset);
    controls.target.copy(view.center);
    controls.update();
    setActivePresetKey(preset.key);
  };

  const loadPreset = (preset: ModelPreset) => {
    setSelectedModelKey(preset.key);
    setSplatUrl(preset.url);
    setActiveUrl(preset.url);
  };

  const loadCustomUrl = () => {
    setSelectedModelKey(getPresetForUrl(splatUrl)?.key ?? 'custom');
    setActiveUrl(splatUrl);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let frameCount = 0;
    let lastFpsAt = performance.now();
    const loadStartedAt = performance.now();
    const activePreset = getPresetForUrl(activeUrl);
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;

    setStatus('loading');
    setProgress(0);
    setError(undefined);
    setStats({ fps: null, splats: activePreset?.splats ?? 0, sizeMb: activePreset?.sizeMb ?? 0, loadMs: 0 });
    viewRef.current = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06101b);

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.01, 10000);
    camera.position.set(0, -8, 4);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const spark = new SparkRenderer({ renderer });
    scene.add(spark);

    const splat = new SplatMesh({
      url: activeUrl,
      lod: false,
      onProgress: (event) => {
        if (disposed || loadIdRef.current !== loadId) return;
        if (!event.lengthComputable) return;
        const nextProgress = Math.round((event.loaded / event.total) * 100);
        if (Number.isFinite(nextProgress)) {
          setProgress(Math.max(0, Math.min(100, nextProgress)));
        }
      },
      onLoad: (mesh) => {
        if (disposed || loadIdRef.current !== loadId) return;
        setStatus('ready');
        setProgress(100);
        const box = mesh.getBoundingBox(true);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z, 1);
        viewRef.current = { center, radius };
        camera.near = Math.max(radius / 10000, 0.01);
        camera.far = Math.max(radius * 10, 1000);
        camera.updateProjectionMatrix();
        applyCameraPreset(activePresetKey);
        const splats = mesh.splats?.getNumSplats?.() ?? activePreset?.splats ?? 0;
        setStats((current) => ({
          ...current,
          splats,
          sizeMb: activePreset?.sizeMb ?? current.sizeMb,
          loadMs: Math.round(performance.now() - loadStartedAt),
        }));
      },
    });
    splat.initialized.catch((loadError: unknown) => {
      if (disposed || loadIdRef.current !== loadId) return;
      setStatus('error');
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    scene.add(splat);

    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameCount += 1;
      const now = performance.now();
      if (now - lastFpsAt >= 1000) {
        const elapsedMs = now - lastFpsAt;
        const sampledFps = elapsedMs > 0 ? Math.round((frameCount * 1000) / elapsedMs) : null;
        setStats((current) => ({
          ...current,
          fps: sampledFps !== null && Number.isFinite(sampledFps) ? sampledFps : null,
        }));
        frameCount = 0;
        lastFpsAt = now;
      }
    };

    const handleError = (event: ErrorEvent) => {
      setStatus('error');
      setError(event.message);
    };

    window.addEventListener('resize', resize);
    window.addEventListener('error', handleError);
    renderer.setAnimationLoop(animate);

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', resize);
      window.removeEventListener('error', handleError);
      controls.dispose();
      splat.dispose();
      spark.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      if (cameraRef.current === camera) cameraRef.current = null;
      if (controlsRef.current === controls) controlsRef.current = null;
    };
  }, [activeUrl]);

  return (
    <main className="sparkPage">
      <section className="sparkTopbar">
        <div>
          <h1>CityGS Spark Viewer</h1>
          <p>浏览器本地 3DGS 渲染，优先用于流畅交互和网页演示。</p>
        </div>
        <a className="sparkLink" href="/">Server render</a>
      </section>

      <section className="sparkControls">
        <div className="sparkControlGroup">
          <span className="sparkControlLabel">模型档位</span>
          <div className="sparkButtonRow">
            {modelPresets.map((preset) => (
              <button
                className={selectedModelKey === preset.key ? 'sparkButton active' : 'sparkButton'}
                key={preset.key}
                onClick={() => loadPreset(preset)}
              >
                <strong>{preset.label}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="sparkControlGroup">
          <span className="sparkControlLabel">视角</span>
          <div className="sparkButtonRow">
            {cameraPresets.map((preset) => (
              <button
                className={activePresetKey === preset.key ? 'sparkButton active compact' : 'sparkButton compact'}
                key={preset.key}
                onClick={() => applyCameraPreset(preset.key)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <label>
          Splat URL
          <input value={splatUrl} onChange={(event) => setSplatUrl(event.target.value)} />
        </label>
        <button onClick={loadCustomUrl}>Load</button>
      </section>

      <section className="sparkStats" aria-label="Spark render stats">
        <span><b>Status</b>{status}</span>
        <span><b>FPS</b>{stats.fps === null ? 'measuring' : stats.fps}</span>
        <span><b>Splats</b>{stats.splats ? stats.splats.toLocaleString() : '-'}</span>
        <span><b>Size</b>{stats.sizeMb ? `${stats.sizeMb} MB` : '-'}</span>
        <span><b>Load</b>{stats.loadMs ? `${(stats.loadMs / 1000).toFixed(1)}s` : '-'}</span>
      </section>

      <section className="sparkViewport" ref={mountRef}>
        {status === 'loading' && <div className="sparkOverlay">Loading splat {progress}%</div>}
        {error && <div className="sparkError">{error}</div>}
      </section>
    </main>
  );
}
