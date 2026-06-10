# Spark Browser Render Spike

This document records the experimental browser-side 3DGS rendering route.

The reusable viewer method is also collected under:

```text
examples/spark-viewer/
```

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

The default preview contains 200,000 splats and is about 31 MB. Avoid using
`mc_aerial_coarse/input.ply` as the default Spark input because it is a plain
RGB point cloud without Gaussian fields such as `opacity`, `scale_*`, and
`rot_*`.

Additional local preview presets are available for browser performance testing:

- `mc_aerial_c36_light_75_vq_preview_1000k.ply`, about 157 MB.
- `mc_aerial_c36_light_75_vq_preview_3000k.ply`, about 469 MB.
- `Coarse`: `mc_aerial_coarse_iter30000_7479k.spz`, about 144 MB.
- `LOD 1`: `mc_aerial_c36_light_50_vq_lod1_11824k.spz`, about 230 MB.
- `LOD 2`: `mc_aerial_c36_light_66_vq_lod2_8040k.spz`, about 155 MB.
- `LOD 3`: `mc_aerial_c36_light_75_vq_full_5912k.spz`, about 114 MB.
- `Full`: `mc_aerial_c36_full_23648k.compressed.ply`, about 1.35 GB.

Keep these previews uniformly sampled from the full `point_cloud.ply`. Taking
the first N splats produces a spatially biased local chunk, which makes the
camera framing and visual quality misleading.

The coarse and LOD models are served as Spark-supported SPZ to reduce transfer
size. Treat that as lossy quantization for display, not as a replacement for
original PLY files used in metrics.

## Current Result

Implemented:

- SparkJS and Three.js dependencies.
- A standalone `SparkDemo` page selected by `?spark=1`.
- OrbitControls for browser-side camera navigation.
- Model preset UI for local 200k / 1000k / 3000k / Coarse / Full presets.
- Camera preset buttons for overview, top, low-angle, and side views.
- Loading/progress/status/FPS/splat count/model size/load time UI.
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
