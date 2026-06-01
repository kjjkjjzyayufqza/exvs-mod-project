# EXVS2 Stage Numatb — Simple Color-Only Materials

## Summary

Stage map props that only have a **single color texture** (no PBR maps) must **not**
use character shaders such as `vsngCharaBasic`. Use the **stage vertex-color shader
family** instead.

Using `vsngCharaBasic` with only a color map (or with color bound to PBR slots) causes
**severe overexposure / white blowout** in-game — flat surfaces clip to white while
distant geometry may still show partial color.

Confirmed fix (2026-06): migrate to the **`FeRendererMovableVertexColor` →
`vstgStandard_VertexColor`** material path and **strip unused texture slots**.

## Shader mapping (GVS → EXVS2)

| Role | GVS / export origin | EXVS2 runtime (`__nust__`) |
|------|---------------------|----------------------------|
| Simple opaque stage prop, color only | `FeRendererMovableVertexColor` | `vstgStandard_VertexColor` |
| Multi-UV + alpha / light-shadow | `FeRendererMovableBlend2MultiUV` | `vstgStandard_MultiUV_LightAndShadowMap` |

Do **not** use `vsngCharaBasic` / `pbr1Mtl` character PBR defaults for Minecraft-style
terrain blocks or other map props with only one albedo texture.

Reference: `docs/gvs-numatb-step2-migration-changes.md`, `src/page/FilesEdit/page.tsx`
(comment: wrong shader → textures turn white).

## Minimal material layout

### `__nust__` profile (game runtime)

Keep only what the stage shader needs:

| Keep | Remove (not needed for color-only) |
|------|-------------------------------------|
| `shader_label`: `vstgStandard_VertexColor` | `vsngCharaBasic` |
| `BaseColorMap` → color nutexb stem | `MetallicMap`, `RoughnessMap`, `NormalMap` |
| `UseBaseColorMap`: `true` | `EmissiveMap`, `AmbientOcclusionMap`, `Texture1` |
| `DiffuseSampler` | `DiffuseCubeMap`, `CustomFloat*`, `EmissiveScale` |
| | All `UseMetallicMap` / `UseRoughnessMap` / … toggles |

Example:

```json
{
  "material_label": "pbr1Mtl",
  "shader_label": "vstgStandard_VertexColor",
  "textures": [
    { "param_id": "BaseColorMap", "data": "your_color_texture" }
  ],
  "booleans": [
    { "param_id": "UseBaseColorMap", "data": true }
  ],
  "samplers": [
    {
      "param_id": "DiffuseSampler",
      "data": {
        "wraps": "Repeat",
        "wrapt": "Repeat",
        "wrapr": "Repeat",
        "min_filter": "LinearMipmapLinear",
        "mag_filter": "Linear",
        "border_color": { "r": 0, "g": 0, "b": 0, "a": 0 },
        "lod_bias": -1,
        "max_anisotropy": "One"
      }
    }
  ]
}
```

### `__maya__` profile (DCC / export mirror)

- `shader_label`: empty string `""`
- `textures`: only `DiffuseMap` → same color stem
- `DiffuseSampler` + optional `BlendState0` / `RasterizerState0`
- Do **not** mirror PBR slots (`SpecularMap`, `NormalMap`, `Texture1`, …) when they
  do not exist on disk

## Alpha / foliage

If a mesh needs cutout alpha and a second texture (e.g. `*-Alpha`), use
`FeRendererMovableBlend2MultiUV` → `vstgStandard_MultiUV_LightAndShadowMap`, not
`vsngCharaBasic` with `Texture1` bound to the alpha file.

`Texture1` on `vsngCharaBasic` is a **roughness/mask** slot, not a transparency map.

## Workflow checklist

1. Set nust `shader_label` to `vstgStandard_VertexColor` (after GVS migration from
   `FeRendererMovableVertexColor`).
2. Delete unused texture rows; keep only `BaseColorMap` (nust) / `DiffuseMap` (maya).
3. Add `UseBaseColorMap: true` on nust when only BaseColorMap is present.
4. **Save** `__nust__.numatb` / `__maya__.numatb` to disk — stage repack reads binary
   files, not in-editor JSON alone.
5. Repack fhm2d / reload stage and verify in-game.

## Related files

- Migration rules: `docs/gvs-numatb-step2-migration-changes.md`
- GVS tool: `src/page/MiscTools/components/gvs-map-to-vs2/GvsMapToVs2Tool.tsx`
- FilesEdit patch: `src/page/FilesEdit/page.tsx` (`handleDebugNumatb`)
- Agent skill: `.cursor/skills/exvs-stage-numatb/SKILL.md`
- Session notes: `docs/agent-sessions/stage-numatb-simple-color/process.md`

## Changelog

| Date | Change |
|------|--------|
| 2026-06 | Documented overexposure root cause and color-only stage material recipe |
