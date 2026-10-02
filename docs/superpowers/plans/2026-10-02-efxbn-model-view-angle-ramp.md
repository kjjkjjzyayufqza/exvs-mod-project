# EFXBN model view-angle ramp in the 3D preview

**Goal:** draw the view-angle colour ramp on effect **model** elements (type 3) in the effect
folder 3D preview, the way the game's model vertex shader does. Until now the preview applied the
ramp only to billboards (`2026-08-16-efxbn-preview-fidelity-continuation.md`, "View-angle alpha
ramp ... billboard only"), so a block whose whole look comes from the ramp was wrong in preview.

**Session record:** `docs/agent-sessions/2026-10-02-efxbn-model-view-angle-ramp.md`.

## Motivating case

FAUC pack `fapt_gndmuc_008faunig_001_effect`, `94.efxbn` (`0x59B8EFE7`) and its copy `94_copy.efxbn`
(`0xE9C146C0`), block 1:

- model element on the common `eff_000common_000common_001_sphere_001` (`0x328D9438`);
- colour curves `(1, 1, 1)`, alpha `1 -> 0`, size `0.5`, scale X `1 -> 45` over its 45-frame life;
- ramp start `(0, 0, 0, 0)`, ramp end `(0, 1.2, 0.8, 1)`, threshold `0`, power `0.5`;
- `actionFlags` `0x060E0010`, so draw scheme `0x411` (Soft, Z test, ramp bit `0x400`).

In game the sphere is invisible face-on and glows fluorescent green at its silhouette: an
expanding 360-degree ring. In the preview it was a plain translucent sphere.

## Evidence (game shader)

Source: `E:/XB/解包/vs2/x64/005renderinfo/shader/efx/vsng_shader_efx_list_draw_3rd.nushdb`,
extracted with `tmp/efxbn-preview/dxbc_constant_buffer_probe.js <name>` (writes
`tmp/efxbn-preview/<name>.dxbc` and the `fxc /dumpbin` disassembly `<name>.dump.txt`).

- `efxDrawModelVS` and `efxDrawModelSoftVS` are byte-identical (12,512 bytes).
- `efxConstructDrawBufferModel3rd` has no ramp: the model ramp lives in the vertex shader.
- `efxDrawModelPS` is `texel * vertexColour`, alpha cutoff 0.01, `rgb * 0.5` unless `0x40000`, so
  the ramp reaches the pixel only through the vertex colour.

`efxDrawModelVS` (cb7 = `SEfxModelConstantBuffer`: `drawSchemeFlag` +16, `blurEnableRange` +28,
`blurFadePower` +32, `blurStartColor` +64, `blurEndColor` +80, `poseMatrix` +96):

```text
r0       = instance.color * v5 (vertex colour)
world    = poseMatrix * instance.world
normal   = normalize(world^-T * v1)                 ; each axis normalised then divided by its length
and r3.x = drawSchemeFlag & 0x400                   ; the ramp gate
P        = world * v0                               ; vertex, world space
eye      = cameraPos                                ; cb0[7] (viewInverse translation)
d        = |P - eye|
if d < 20: eye = cameraPos + normalize(cameraPos - origin) * (20 - d)   ; origin = world translation
V        = normalize(P - eye)
rim      = 1 - |dot(V, normal)|
t        = rim > threshold ? ((rim - threshold) / (1 - threshold)) ^ power : 0
r0      *= flag ? lerp(blurStartColor, blurEndColor, t) : 1
```

Differences from the billboard ramp (`efxConstructDrawBufferBillboard3rd`): it is evaluated per
vertex with the mesh normal (not the quad normal), it is gated by the draw-scheme bit `0x400` (the
derived form of `actionFlags & 0x02000000`), and it moves the eye back to 20 units when the camera
is closer than that to the vertex.

## Design

1. `efxbnSimulation.ts`: export `DRAW_SCHEME_VIEW_ANGLE_RAMP = 0x400` beside
   `DRAW_SCHEME_FULL_BRIGHTNESS`.
2. `efxbnBillboardShading.ts`: `resolveEfxbnModelViewAngleRamp(block)`, gated on that bit, returning
   the same `EfxbnViewAngleRamp` shape the billboard path uses.
3. `SsbhModelCanvas.tsx`, `PreviewInstanceHostTransform`: `effectViewAngleRamp` (start, end,
   threshold, power, or null). The instance origin needs no field: the per-frame update reads the
   instance group's world position, which is the particle's position.
4. `SsbhModelCanvas.tsx`, `attachEfxColorExUniforms`: uniforms `efxViewAngleRamp`,
   `efxViewAngleStartColor`, `efxViewAngleEndColor`, `efxViewAngleThreshold`, `efxViewAnglePower`,
   `efxInstanceOrigin`; the vertex patch computes the ramp colour into a varying, in view space
   (distances and angles are the same as in world space under the rigid view matrix); the fragment
   patch multiplies `diffuseColor` by it before the soft-particle term and the alpha test.
   - normal: the skinned / morphed `objectNormal` when three computes it, else `normal`;
     view-space normal through `inverse(transpose(mat3(modelViewMatrix [* instanceMatrix])))`;
   - vertex: `mvPosition` (after skinning and instancing);
   - span guard `max(1 - threshold, 1e-5)` and `t = 0` at or below the threshold, as the billboard
     shader in `EfxbnParticlePreview.tsx` already does.
5. `SsbhModelCanvas.tsx`, per-frame update: write the uniforms from `hostTransform` and the group's
   world position.
6. `EfxbnDiagnosticOverlay.tsx`: pass `effectViewAngleRamp: resolveEfxbnModelViewAngleRamp(target)`
   for model particles (both the live and the parked slot branches).
7. Docs: point the "billboard only" ledger line of `2026-08-16-efxbn-preview-fidelity-continuation.md`
   at this plan.

8. Follow-up found by the first user check: the sphere had zero Y / Z scale in preview. Block 1
   holds `scaleBaseY` / `scaleBaseZ` at 0 and relies on `actionFlags & 0x10`, under which the
   kinetic shaders copy the evaluated `scaleBaseX` into Y and Z every frame
   (`efxKineticParticleModel3rd` lines 568-572). `efxbnSimulation.ts` now does the same, next to
   the existing spawn-size copy.

Out of scope: the ramp-fog branch of the same shader (`drawSchemeFlag & 0x100`), lighting variants.

## Verification

- `npx tsc --noEmit -p tsconfig.json`: clean.
- `npx vitest run src/page/TestEditor/components/effect-folder-editor src/components/ssbh-model-preview`:
  existing suites pass.
- Manual (user): open `94_copy.efxbn`, play; block 1 shows a green silhouette ring that grows and
  fades, nothing face-on.
