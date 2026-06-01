# EXVS2 Stage Numatb — Simple Color Materials

Use this skill when configuring **stage / map prop** `.numatb` materials that only have
a color texture (no metallic, roughness, normal, emissive, or cubemap assets).

## Trigger

- User adds or modds **stage objects** (terrain, boxes, map props) with one albedo
  nutexb only
- In-game render is **overexposed, washed out, or flat white** on large surfaces
- User is editing `__nust__.numatb` / `__maya__.numatb` or DAE→SSBH numatb templates
- Validation warns about empty PBR paths the user does not intend to use

## Root cause (confirmed)

**Wrong shader family.** Default DAE/SSBH templates often set nust
`shader_label = vsngCharaBasic` (character PBR). Stage props with only a color map must
use the **stage vertex-color** path:

| Context | Shader |
|---------|--------|
| GVS origin | `FeRendererMovableVertexColor` |
| EXVS2 runtime (`__nust__`) | `vstgStandard_VertexColor` |

`vsngCharaBasic` expects full PBR slots (`Texture1` mask, cubemap, Use* toggles).
Binding one color texture to multiple PBR params or leaving wrong defaults produces
**severe in-game overexposure**.

Project comment (FilesEdit): *must migrate FeRendererMovableVertexColor →
vstgStandard_VertexColor, otherwise some textures turn white*.

## Fix procedure

### 1. Nust (`__nust__.numatb`)

1. Set `shader_label` to **`vstgStandard_VertexColor`** (not `vsngCharaBasic`).
2. **Textures — keep only:**
   - `BaseColorMap` → color nutexb stem (no path prefix in stem)
3. **Delete texture rows** for maps that do not exist:
   - `MetallicMap`, `RoughnessMap`, `NormalMap`, `EmissiveMap`,
     `AmbientOcclusionMap`, `Texture1`, `DiffuseCubeMap`
4. **Booleans — keep only:**
   - `UseBaseColorMap: true`
5. **Remove** vsng-only params unless copying a known-good vanilla entry:
   - `UseMetallicMap`, `UseRoughnessMap`, `UseNormalMap`, `UseEmissiveMap`,
     `UseAmbientOcclusionMap`, `EmissiveScale`, `CustomFloat*`, `CustomVector*`, …
6. Keep **`DiffuseSampler`** (Repeat, LinearMipmapLinear, lod_bias -1).

### 2. Maya (`__maya__.numatb`)

1. `shader_label`: **`""`** (empty)
2. **Textures — keep only:** `DiffuseMap` → same color stem
3. Delete `SpecularMap`, `NormalMap`, `RoughnessMap`, `EmissiveMap`,
   `AmbientOcclusionMap`, `Texture1`, etc.
4. Keep `DiffuseSampler`; optional `BlendState0` / `RasterizerState0` / `Diffuse` color.

### 3. Alpha / second texture

- Opaque-only → **`vstgStandard_VertexColor`** + single color map (above).
- Cutout / second UV → **`FeRendererMovableBlend2MultiUV`** →
  **`vstgStandard_MultiUV_LightAndShadowMap`** — do **not** put alpha on
  `vsngCharaBasic` `Texture1`.

### 4. Persist and verify

- Save both numatb files to disk; repack reads **binary**, not editor JSON.
- Re-run stage repack / reload before judging in-game result.

## Do not

- Use `vsngCharaBasic` for single-texture stage props
- Bind the color texture to `MetallicMap`, `EmissiveMap`, `Texture1`, etc.
- Rely on `Use*: false` while leaving PBR texture rows present — remove unused rows
- Assume maya-only cleanup fixes runtime; **nust shader + slots** drive in-game render

## References

- Spec: `docs/exvs-stage-numatb-simple-color.md`
- GVS migration: `docs/gvs-numatb-step2-migration-changes.md`
- FHM2D stage pack: `.cursor/skills/fhm2d-format/SKILL.md`
- Session: `docs/agent-sessions/stage-numatb-simple-color/process.md`
