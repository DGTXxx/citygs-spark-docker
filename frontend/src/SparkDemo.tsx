import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

const defaultSplatUrl = '/models/mc_aerial_c36_light_75_vq_preview_200k.ply';

function getInitialSplatUrl() {
  if (typeof window === 'undefined') return defaultSplatUrl;
  return new URLSearchParams(window.location.search).get('splatUrl') || defaultSplatUrl;
}

export function SparkDemo() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [splatUrl, setSplatUrl] = useState(getInitialSplatUrl);
  const [activeUrl, setActiveUrl] = useState(getInitialSplatUrl);
  const [status, setStatus] = useState('loading');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ fps: 0, splats: 0 });
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let frameCount = 0;
    let lastFpsAt = performance.now();

    setStatus('loading');
    setProgress(0);
    setError(undefined);
    setStats({ fps: 0, splats: 0 });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07111f);

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.01, 10000);
    camera.position.set(0, -8, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);

    const spark = new SparkRenderer({ renderer });
    scene.add(spark);

    const splat = new SplatMesh({
      url: activeUrl,
      lod: true,
      onProgress: (event) => {
        if (!event.lengthComputable) return;
        setProgress(Math.round((event.loaded / event.total) * 100));
      },
      onLoad: (mesh) => {
        if (disposed) return;
        setStatus('ready');
        setProgress(100);
        const box = mesh.getBoundingBox(true);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z, 1);
        controls.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(0, -radius * 1.4, radius * 0.75));
        camera.near = Math.max(radius / 10000, 0.01);
        camera.far = Math.max(radius * 10, 1000);
        camera.updateProjectionMatrix();
        controls.update();
        setStats((current) => ({ ...current, splats: mesh.splats?.getNumSplats?.() ?? 0 }));
      },
    });
    splat.initialized.catch((loadError: unknown) => {
      if (disposed) return;
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
        setStats((current) => ({ ...current, fps: Math.round((frameCount * 1000) / (now - lastFpsAt)) }));
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
    };
  }, [activeUrl]);

  return (
    <main className="sparkPage">
      <section className="sparkTopbar">
        <div>
          <h1>Spark Browser 3DGS Test</h1>
          <p>Client-side SparkJS viewer for a CityGS coarse PLY sample.</p>
        </div>
        <a className="sparkLink" href="/">Server render</a>
      </section>

      <section className="sparkControls">
        <label>
          Splat URL
          <input value={splatUrl} onChange={(event) => setSplatUrl(event.target.value)} />
        </label>
        <button onClick={() => setActiveUrl(splatUrl)}>Load</button>
        <span>Status: {status}</span>
        <span>Progress: {progress}%</span>
        <span>FPS: {stats.fps || '-'}</span>
        <span>Splats: {stats.splats ? stats.splats.toLocaleString() : '-'}</span>
      </section>

      <section className="sparkViewport" ref={mountRef}>
        {status === 'loading' && <div className="sparkOverlay">Loading splat {progress}%</div>}
        {error && <div className="sparkError">{error}</div>}
      </section>
    </main>
  );
}
