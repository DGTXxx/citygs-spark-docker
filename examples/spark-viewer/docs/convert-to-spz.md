# Convert PLY To SPZ

This note records the current workflow for browser demo compression.

## Goal

Convert trained CityGS Gaussian splat PLY files into Spark-supported `.spz`
assets for faster browser transfer and lower client memory pressure.

The conversion is for display. Do not replace the original PLY files used for
metrics, training records, or reproducibility.

## Inputs

Current source model PLY files live under the CityGaussian output tree on the
A6000 server:

```text
/root/ftl/CityGaussian/output_v1/mc_aerial_coarse/point_cloud/iteration_30000/point_cloud.ply
/root/ftl/CityGaussian/output_v1/mc_aerial_c36_light_50_vq/point_cloud.ply
/root/ftl/CityGaussian/output_v1/mc_aerial_c36_light_66_vq/point_cloud.ply
/root/ftl/CityGaussian/output_v1/mc_aerial_c36_light_75_vq/point_cloud.ply
```

## Outputs

Current browser assets are served from:

```text
frontend/public/models/
```

The current compressed outputs are:

```text
mc_aerial_coarse_iter30000_7479k.spz
mc_aerial_c36_light_50_vq_lod1_11824k.spz
mc_aerial_c36_light_66_vq_lod2_8040k.spz
mc_aerial_c36_light_75_vq_full_5912k.spz
```

## Verification

For every converted file, record:

- input path
- output path
- source splat count
- output splat count
- clipped count
- output byte size

The current converted files were checked with matching splat counts and
`clipped=0`.

## Practical Notes

- Convert large models sequentially to avoid avoidable memory pressure.
- Keep the original PLY files untouched.
- Test model URLs through the frontend server before using them in the browser.
- If Spark reports `unreachable` after loading a large raw PLY, prefer SPZ
  conversion before raising browser memory limits.
