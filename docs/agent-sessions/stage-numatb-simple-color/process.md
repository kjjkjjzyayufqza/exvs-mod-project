# Stage Numatb Simple Color — Process

## Problem

User modded a Minecraft-style stage model (`new_model`) with only two nutexb files:
`newmodeltexture` (color) and `newmodeltexture-Alpha`. In-game rendering showed correct
 hues but **severe overexposure** — large flat surfaces clipped to white.

Initial attempts tuned `vsngCharaBasic` / `pbr1Mtl`: disabled `Use*` toggles, set
`EmissiveScale` to 0, reduced texture rows. Overexposure persisted.

## Root cause

**Shader mismatch:** DAE→SSBH default nust template uses **`vsngCharaBasic`** (character
PBR). Stage map props with **color-only** assets must use the stage vertex-color shader
family.

Wrong shader + extra PBR texture rows (even with toggles off) does not match runtime
expectations and produces blown-out lighting on flat surfaces.

## Confirmed fix

1. Migrate to **`FeRendererMovableVertexColor`** (GVS) → **`vstgStandard_VertexColor`**
   (EXVS2 `__nust__`).
2. **Delete unused texture slots**; keep only:
   - nust: `BaseColorMap` + `UseBaseColorMap: true` + `DiffuseSampler`
   - maya: `DiffuseMap` + `DiffuseSampler`, empty `shader_label`
3. Save numatb to disk and repack stage before in-game test.

User verified in-game after this change.

## Documentation added

- `docs/exvs-stage-numatb-simple-color.md` — human/agent spec
- `.cursor/skills/exvs-stage-numatb/SKILL.md` — Cursor skill
- Updated `docs/gvs-numatb-step2-migration-changes.md` (overexposure section)
- Updated `.cursor/skills/fhm2d-format/SKILL.md` (pitfall cross-link)

## Handoff

When adding new single-texture stage props, start from
`vstgStandard_VertexColor` template in `docs/exvs-stage-numatb-simple-color.md`, not
`vsngCharaBasic` / `createEmptyMaterialEntry(..., "nust")` defaults in
`daeSsbhTypes.ts`.

For alpha foliage, evaluate `vstgStandard_MultiUV_LightAndShadowMap` separately; do not
reuse `vsngCharaBasic` `Texture1` for alpha cutout.
