# Spark Browser Render Spike

This document records the experimental browser-side 3DGS rendering route.

## Goal

Test whether SparkJS can load a CityGS / MatrixCity Gaussian model directly in
the browser, as an alternative to streaming every rendered frame from the A6000.

This does not replace the current server-side render path. It is a separate
spike for smoother client-side interaction.

## Entry

Start the frontend and open:

```text
http://127.0.0.1:5173/?spark=1
```

Optional custom splat URL:

```text
http://127.0.0.1:5173/?spark=1&splatUrl=/models/mc_aerial_coarse_input.ply
```

## Local Test Asset

The local test asset is not committed to GitHub:

```text
frontend/public/models/mc_aerial_c36_light_75_vq_preview_200k.ply
```

On the A6000 server this preview is sampled from the real Gaussian splat file:

```text
/root/ftl/citygs-remote-render-deploy/CityGaussian-runtime/output_v1/mc_aerial_c36_light_75_vq/point_cloud.ply
```

The preview contains 200,000 splats and is about 31 MB. Avoid using
`mc_aerial_coarse/input.ply` as the default Spark input because it is a plain
RGB point cloud without Gaussian fields such as `opacity`, `scale_*`, and
`rot_*`.

## Current Result

Implemented:

- SparkJS and Three.js dependencies.
- A standalone `SparkDemo` page selected by `?spark=1`.
- OrbitControls for browser-side camera navigation.
- Loading/progress/status/FPS/splat count UI.
- Local model directory ignored by Git.

Verified:

- `npm run typecheck` passes.
- `npm run build` passes.
- `/?spark=1` returns HTTP 200 from the Vite dev server.
- `/models/mc_aerial_c36_light_75_vq_preview_200k.ply` returns HTTP 200 from
  the Vite dev server.

Not yet verified in this environment:

- Actual browser canvas rendering, because the server does not currently have a
  local Chromium/Playwright runtime installed.

## Next Steps

1. Open `/?spark=1` in a real browser and check if the splats are visible.
2. If visible, measure FPS and memory usage with the 200k preview.
3. Try Spark-supported compressed formats such as `.spz`.
4. If coarse works, test a reduced/converted version of the trained point cloud.
5. Keep the server-side render path for full / LOD / WebRTC experiments.
