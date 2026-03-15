# GVS Map Parameter Migration Notes

## Purpose

This document defines the best-practice rules for migrating legacy GVS map parameter files to an EXVS2-compatible format.

The primary goal is compatibility migration (key/schema migration), not map look retuning.

## Source Priority (Authoritative Order)

Use data sources in the following order:

1. **EXVS2 decompiled string list** (authoritative for key existence).
2. **Multiple EXVS2 map config samples** (preferred for default value patterns).
3. **Single map sample (for example `773.csv`)** as reference only.

Important: `773.csv` is not a global truth. It represents one map and may contain map-specific tuning.

## Best Migration Rules

Apply migration in this order:

1. **Whitelist by EXVS2 keys**
   - Keep only keys that exist in EXVS2 key space.
   - Remove GVS-only keys that are absent in EXVS2.

2. **Preserve shared-key values from source map**
   - If a key exists in both GVS and EXVS2, keep the original GVS value by default.
   - Do not force-replace shared values with a single EXVS2 sample value.

3. **Add missing EXVS2 keys**
   - Add keys required by EXVS2 but missing in source.
   - Fill values using source priority: multi-map defaults first, single-map sample second, neutral safe defaults last.

4. **No forced retuning during migration**
   - Migration step should not apply artistic or gameplay-specific retuning.
   - Retuning is a separate pass after compatibility is confirmed.

## Legacy Families to Remove

Remove families not present in EXVS2 key space:

- `yebis_*`
- `light_shaft_*`
- `color_correct_*`
- `depth_field_*`
- Legacy shadow family (for example):
  - `shadow_culling_far`
  - `shadow_frustum_*`
  - `shadow_importance_*`
  - `shadow_protected_radius`
  - `shadow_saturation_radius`
  - `shadow_tessellation_per_texel`

## EXVS2 Families Commonly Added

Typical missing groups to add:

- `pfx_*` (bloom/fxaa/ssao/lightshaft/ssr)
- `curveedit_*` groups (`BGR/BGG/BGB/BGA`, `MSR/MSG/MSB/MSA`, `FXR/FXG/FXB/FXA`)
- `color_grading_3d*`
- `shadow_near_clip`, `shadow_far_clip`
- `shadow_add_color_*`, `ao_blend_color_*`
- `projXZ_*`
- `ibl_lighting_intensity`, `posteffect_enable`

## Validation Checklist

After each migration, verify:

1. No legacy-only families remain.
2. All required EXVS2 keys exist.
3. Shared keys keep source-map values unless explicitly approved for retuning.
4. Added keys have deterministic defaults and are documented.
5. Runtime load succeeds without parameter parse errors.

## Notes

- Treat migration and retuning as two different stages.
- Always keep a backup (`.bak`) before applying changes.
- If map-specific visual tuning is needed, do it after compatibility migration passes validation.

