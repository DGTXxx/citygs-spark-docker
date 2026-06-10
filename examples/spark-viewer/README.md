# Spark Viewer Example

This folder documents the browser-side SparkJS viewer used for the CityGS /
MatrixCity demo.

The example is intentionally separate from the server-side GPU render path. It
loads Gaussian splat assets directly in the browser, which makes it useful for
interactive web demos, model-size comparisons, and quick visual inspection.

## What Is Included

```text
examples/spark-viewer/
├── README.md
├── src/SparkDemo.tsx
├── src/spark-viewer.css
├── public/models/README.md
└── docs/
    ├── convert-to-spz.md
    └── model-presets.md
```

`src/SparkDemo.tsx` is a copy of the current integrated demo component from
`frontend/src/SparkDemo.tsx`. The production route in this repository still uses
the frontend copy, selected by:

```text
http://127.0.0.1:5173/?spark=1
```

## Dependencies

The integrated frontend already installs the required packages:

```bash
npm --workspace frontend install @sparkjsdev/spark three
```

The viewer uses:

- `@sparkjsdev/spark` for Gaussian splat loading and rendering.
- `three` for the scene, camera, renderer, and orbit controls.
- React state for model presets, load progress, FPS, and errors.

## Model Policy

Do not commit large model assets to normal Git history.

Use Git for:

- viewer source code
- preset metadata
- conversion commands
- documentation

Use external storage for large assets:

- server-hosted files
- GitHub Release assets
- Hugging Face Dataset
- object storage
- campus/server download links

Place local demo files under `frontend/public/models/` when running the current
app, or under `examples/spark-viewer/public/models/` if extracting this example
into a standalone project.

## Current Integrated Route

Run the frontend:

```bash
cd /root/Projects/citygs-remote-render-mvp
npm run dev:frontend
```

Open:

```text
http://127.0.0.1:5173/?spark=1
```

Optional custom model URL:

```text
http://127.0.0.1:5173/?spark=1&splatUrl=/models/mc_aerial_c36_light_75_vq_preview_200k.ply
```

## Notes

- Prefer `.spz` for large browser demos. Raw PLY above a few hundred MB can
  trigger Spark/WASM memory pressure in the browser.
- Treat `.spz` as display-oriented lossy compression. Keep original PLY outputs
  for metrics, training records, and reproducibility.
- Use a load task id when switching models so old progress callbacks cannot
  overwrite the current model state.
- Show loading progress in one place only. The integrated page keeps progress in
  the viewport overlay and leaves the stats row for stable runtime metrics.
