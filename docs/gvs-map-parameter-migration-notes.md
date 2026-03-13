# GVS Map Parameter Migration Notes

## Purpose

This note records how legacy GVS map parameter text files were migrated to an EXVS2-compatible parameter set.

## Migration Strategy

The migration used an EXVS2-compatible parameter profile as a baseline.

Each target file was migrated using a whitelist style replacement:

1. Keep/overwrite keys that exist in the EXVS2 baseline.
2. Add missing EXVS2 keys.
3. Remove legacy GVS-only keys not present in EXVS2 baseline.
4. Normalize shared keys to EXVS2 values.

## What Was Fixed

### 1) Removed Legacy Parameter Families

Removed old groups that are not in the EXVS2 baseline:

- `yebis_*`
- `light_shaft_*`
- `color_correct_*`
- `depth_field_*`
- Legacy shadow fields:
  - `shadow_culling_far`
  - `shadow_frustum_*`
  - `shadow_importance_*`
  - `shadow_protected_radius`
  - `shadow_saturation_radius`
  - `shadow_tessellation_per_texel`

### 2) Added Missing EXVS2 Parameter Families

Added missing groups required by the EXVS2 baseline:

- `pfx_*` (bloom, fxaa, ssao, lightshaft)
- `curveedit_*` groups
  - `BGR`, `BGG`, `BGB`, `BGA`
  - `MSR`, `MSG`, `MSB`, `MSA`
  - `FXR`, `FXG`, `FXB`, `FXA`
- `color_grading_3d*`
- `shadow_near_clip`, `shadow_far_clip`
- `shadow_add_color_*`, `ao_blend_color_*`
- `projXZ_*`

### 3) Updated Shared Keys With Incompatible Values

Typical examples updated to EXVS2 baseline values:

- `directional_lighting_intensity: 4 -> 5.5`
- `directional_lighting_rot_y: 92 -> 142`
- `fog_rgb_boost: 1 -> 1.7`
- `fog_alpha_boost: 1 -> 0.56`
- `mapfog_height: 10000 -> 5800`
- `mapfog_atten_end: 0.82 -> 0.2`
- `effect_wind_velocity_x: 1.2 -> -0.5`
- `effect_water_velocity_x: 0 -> 1`
- `border_able: 0 -> 1`

## Notes

- This migration intentionally prioritizes compatibility by matching a known EXVS2-compatible profile.
- If map-specific tuning is needed, start from the migrated file and adjust values iteratively.
- Use `.bak` files to rollback quickly.

