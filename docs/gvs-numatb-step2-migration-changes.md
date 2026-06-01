# GVS to EXVS2 Numatb Step2 Migration Changes

## Purpose

This document describes the patch logic applied in **Step2: Fix Numatb Files** of the GVS Map to VS2 tool. The patches migrate `.numatb` material files from GVS format to EXVS2-compatible format.

## Reference

- Implementation: `src/page/MiscTools/components/gvs-map-to-vs2/GvsMapToVs2Tool.tsx` (runStep2FixNumatbFiles)
- JSON format: ssbh_data output (from `ssbh_data_json.exe`)
- Analysis source: `e:\research\ssbh_lib\217.from_tool.json` (ssbh_data-converted numatb JSON)

## Step2 Pipeline

1. **numatb → JSON**: Convert `.numatb` to JSON via `ssbh_data_json.exe`
2. **patch_json**: Apply migration rules (this document)
3. **JSON → numatb**: Convert patched JSON back to `.numatb` via `ssbh_data_json.exe`

---

## Migration Rules

### 1. Version

| Field | Origin (GVS) | Fixed (EXVS2) |
|-------|--------------|---------------|
| `minor_version` | 5 or other | **6** |

### 2. Texture Parameters (`textures` array)

Each entry has a `textures` array of `{ param_id, data }`. Apply:

| Origin (GVS) | Fixed (EXVS2) | Condition |
|--------------|---------------|-----------|
| `DiffuseMap` | `BaseColorMap` | `data` does not contain `"_sky"` (skydome keeps DiffuseMap) |
| `DiffuseMapLayer1` | `BaseColorMapLayer1` | Always |

### 3. Boolean Parameters (`booleans` array)

Each entry has a `booleans` array of `{ param_id, data }`. Apply:

| Rule | Description |
|------|-------------|
| `UseDiffuseMap` → `UseBaseColorMap` | Rename param_id, keep `data` value |
| Add `UseBaseColorMap: true` | When `textures` has BaseColorMap/BaseColorMapLayer1, and `booleans` has neither `UseBaseColorMap` nor `UseDiffuseMap` |

### 4. Shader Labels (`shader_label`)

| Origin (GVS) | Fixed (EXVS2) |
|--------------|---------------|
| `FeRendererMovableVertexColor` | `vstgStandard_VertexColor` |
| `FeRendererMovableBlend2MultiUV` | `vstgStandard_MultiUV_LightAndShadowMap` |
| `FeRendererMovableMultiUVVertexColorAO` | `vstgStandard_MultiUV_LightAndShadowMap` |
| `FeRendererMovable` | Unchanged (EXVS2 supports) |
| `FeRendererStatic` | Unchanged (EXVS2 supports) |
| `vsngTransparent*` | Unchanged |
| Other | Unchanged |

---

## JSON Structure (ssbh_data format)

Each entry in `jsonContent.entries` has:

- `material_label`, `shader_label`
- `booleans`: `[{ param_id, data }]` (e.g. UseNormalMap, UseSpecularMap)
- `textures`: `[{ param_id, data }]` (e.g. DiffuseMap, AmbientOcclusionMap)
- `samplers`, `floats`, `vectors`, `blend_states`, `rasterizer_states`, `uv_transforms`

The code uses `row.textures ?? []` and `row.booleans ?? []` to handle missing arrays.

---

## Green Rendering Fix

Some migrated maps rendered green in EXVS2. Root cause:

- EXVS2 shaders expect `UseBaseColorMap` to enable BaseColorMap texture sampling.
- GVS materials often have no `UseDiffuseMap` (implicit when DiffuseMap texture exists).
- After renaming DiffuseMap → BaseColorMap, the shader did not sample the texture and fell back to default/vertex color (green).

**Fix**: Add `UseBaseColorMap: true` when BaseColorMap textures exist and no Use* flag is present; also migrate `UseDiffuseMap` → `UseBaseColorMap`.

---

## White / Overexposure Fix (color-only stage props)

Symptoms in EXVS2: map props show color but large flat surfaces are **blown out to
white** (severe overexposure).

Root cause:

- Material uses **`vsngCharaBasic`** (character PBR) or leaves PBR texture rows bound
  to a single color nutexb.
- Stage props with **only a color texture** must use **`FeRendererMovableVertexColor`**
  (GVS) → **`vstgStandard_VertexColor`** (EXVS2 `__nust__`), not `vsngCharaBasic`.

**Fix**:

1. Set nust `shader_label` to `vstgStandard_VertexColor` after Step2 migration.
2. Keep only `BaseColorMap` (+ `UseBaseColorMap: true`, `DiffuseSampler`) on nust;
   keep only `DiffuseMap` on maya (`shader_label` empty).
3. **Delete** unused texture rows (`MetallicMap`, `RoughnessMap`, `NormalMap`,
   `EmissiveMap`, `AmbientOcclusionMap`, `Texture1`, `DiffuseCubeMap`, …) — do not
   rely on `Use*: false` alone.
4. Save `.numatb` to disk and repack the stage before in-game verification.

Full recipe: `docs/exvs-stage-numatb-simple-color.md`  
Agent skill: `.cursor/skills/exvs-stage-numatb/SKILL.md`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06 | Documented white/overexposure fix for color-only stage props (vstgStandard_VertexColor) |
| 2025-03 | Added UseBaseColorMap / UseDiffuseMap migration in booleans |
| 2025-03 | Added DiffuseMapLayer1 → BaseColorMapLayer1 texture mapping |
| 2025-03 | Added FeRendererMovableMultiUVVertexColorAO → vstgStandard_MultiUV_LightAndShadowMap |
| 2025-03 | Defensive null coalescing for textures/booleans arrays |
