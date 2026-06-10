# Model Presets

These are the current CityGS / MatrixCity browser demo presets. The sizes are
for the current local assets on the A6000 server.

| Label | Browser file | Splats | Browser size | Source |
| --- | --- | ---: | ---: | --- |
| `200k` | `mc_aerial_c36_light_75_vq_preview_200k.ply` | 200,000 | 31 MB | Uniform sample from LOD 3 source PLY |
| `1000k` | `mc_aerial_c36_light_75_vq_preview_1000k.ply` | 1,000,000 | 157 MB | Uniform sample from LOD 3 source PLY |
| `3000k` | `mc_aerial_c36_light_75_vq_preview_3000k.ply` | 3,000,000 | 469 MB | Uniform sample from LOD 3 source PLY |
| `Coarse` | `mc_aerial_coarse_iter30000_7479k.spz` | 7,479,470 | 144 MB | `mc_aerial_coarse` final 30k |
| `LOD 3` | `mc_aerial_c36_light_75_vq_full_5912k.spz` | 5,912,000 | 114 MB | `mc_aerial_c36_light_75_vq` |
| `LOD 2` | `mc_aerial_c36_light_66_vq_lod2_8040k.spz` | 8,040,318 | 155 MB | `mc_aerial_c36_light_66_vq` |
| `LOD 1` | `mc_aerial_c36_light_50_vq_lod1_11824k.spz` | 11,823,999 | 230 MB | `mc_aerial_c36_light_50_vq` |
| `Full` | `mc_aerial_c36_full_23648k.compressed.ply` | 23,647,998 | 1.35 GB | `mc_aerial_c36` |

## LOD Mapping

The LOD entries come from:

```text
/root/ftl/CityGaussian/config/mc_aerial_c36_lod_output_v1.yaml
```

Current mapping:

- `LOD 1`: `output_v1/mc_aerial_c36_light_50_vq`
- `LOD 2`: `output_v1/mc_aerial_c36_light_66_vq`
- `LOD 3`: `output_v1/mc_aerial_c36_light_75_vq`

`mc_aerial_c36_lod` itself is mainly an evaluation output directory with files
such as `renders/`, `gt/`, `results.json`, and `costs.json`; it is not the
single source model directory for the browser viewer.

## Asset Rules

- Keep preview PLY files uniformly sampled from the full source PLY. Taking the
  first N splats creates a biased local chunk.
- Use `.spz` for full coarse/LOD browser delivery when possible.
- Do not use `mc_aerial_coarse/input.ply` as a Spark splat model. It is a plain
  RGB point cloud and does not contain Gaussian fields such as opacity, scale,
  rotation, and SH color attributes.
