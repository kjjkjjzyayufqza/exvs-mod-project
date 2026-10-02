# 2026-10-02 efxbn model view-angle ramp (preview)

Plan: `docs/superpowers/plans/2026-10-02-efxbn-model-view-angle-ramp.md`.

## Goal

The effect folder 3D preview draws the view-angle colour ramp on model elements as the game does,
so a block like FAUC `94_copy.efxbn` block 1 (an expanding sphere that only glows green at its
silhouette) looks in preview the way it looks in game.

## Context

- Reported by the user: the 360-degree ring around the FAUC Banshee aura cannot be seen in the
  preview at all, while the fields that drive it can be edited.
- First suspect was the particle rings (blocks 2 -> 3 and 5 -> 6). Ruled out by simulating
  `94_copy` through `simulateEfxbnPreviewFrame` (summary dumped with
  `app_lib::format::effect_folder::parse_efxbn_file`): 200 / 500 particles, radius 3 -> ~70 in 40
  frames, sizes 2.4 x 0.5 and 5 x 5, colours non-zero; blend, depth, camera fade (needs
  `extraFlags & 0x1000`, absent) and view ramp (absent) do not hide them.
- The only cyan / green in the file is block 1's ramp end `(0, 1.2, 0.8, 1)` with ramp start
  `(0, 0, 0, 0)`: the ring is the sphere's silhouette. The preview implements the ramp only in
  `EfxbnParticlePreview.tsx` (billboards); the model path (`SsbhModelCanvas.tsx`
  `attachEfxColorExUniforms`) has none.

## Evidence

- Extracted `efxDrawModelVS` and `efxDrawModelSoftVS` from
  `E:/XB/解包/vs2/x64/005renderinfo/shader/efx/vsng_shader_efx_list_draw_3rd.nushdb` with
  `node tmp/efxbn-preview/dxbc_constant_buffer_probe.js efxDrawModelVS` (and `...SoftVS`):
  identical 12,512-byte DXBC; dumps in `tmp/efxbn-preview/efxDrawModelVS.dump.txt` (gitignored).
- Decoded algorithm and the three differences from the billboard ramp: see the plan, "Evidence".
- Gate: `and r3.xy, cb7[1].xxxx, l(1024, 256, 0, 0)` -> `drawSchemeFlag & 0x400`, which
  `efxbnRuntimeDerive.ts` sets from `actionFlags & 0x02000000` (`SCHEME_ACTION_2000000`).

## Progress

- [x] Root cause found and the game shader decoded.
- [x] Plan written.
- [x] Implementation (plan steps 1-7):
  - `efxbnSimulation.ts`: `DRAW_SCHEME_VIEW_ANGLE_RAMP = 0x400`;
  - `efxbnBillboardShading.ts`: `resolveEfxbnModelViewAngleRamp`, sharing `authoredViewAngleRamp` with the billboard resolver;
  - `SsbhModelCanvas.tsx`: `effectViewAngleRamp` on `PreviewInstanceHostTransform`; six uniforms on the EFX override material; vertex patch after `<fog_vertex>` writes `vEfxViewAngleColor` (normal from three's own `beginnormal` / `morphnormal` / `defaultnormal` chunks when `MeshBasicMaterial` skipped them); fragment multiplies `diffuseColor` before the soft term and alpha test; per-frame update writes the ramp and the group's world position as `efxInstanceOrigin`;
  - `EfxbnDiagnosticOverlay.tsx`: passes the ramp for live and parked model slots;
  - `2026-08-16-efxbn-preview-fidelity-continuation.md`: ledger row for the model ramp.
- [x] `npx tsc --noEmit -p tsconfig.json`: exit 0.
- [x] `npx vitest run src/page/TestEditor/components/effect-folder-editor src/components/ssbh-model-preview`: 525 passed, 5 failed. The 5 (`Fhm2dMemoryPreviewModal.test.tsx` x2, `useSsbhFileEditorSessions.test.ts` x3) fail identically with this change stashed, so they predate it.
- [x] User check 1 (screenshot): still no sphere at all, only the y_0001 half ring. The ramp was
  not the blocker.
- [x] Real blocker: block 1 authors `scaleBaseX` `1 -> 45` with `scaleBaseY` / `scaleBaseZ` held
  at constant 0 (lookup 29 / 30). `simulateEfxbnEmitterPair` copied only the spawn size under
  `actionFlags & 0x10`, so the sphere got scale `(s, 0, 0)`: a zero-thickness disc (and a singular
  normal matrix). Shader evidence: `efxKineticParticleModel3rd` (yyadorigi decompile in
  `tmp/efxbn-preview/`) lines 568-572 / 830-832 write the X curve value into instance `+48 + 1`
  and `+48 + 2` when `(actionFlags & 16) != 0`; `...Null3rd` and both FieldEffect variants do the
  same; `...Billboard3rd` line 568 and `...Strip3rd` line 575 copy X into Y.
- [x] Fix: `efxbnSimulation.ts` evaluates `scaleY` / `scaleZ` as `scaleX` under the flag. Test
  "copies the X scale curve into Y and Z — the FAUC 94.efxbn sphere case" in
  `efxbnSimulation.test.ts`. `vitest run src/page/TestEditor/components/effect-folder-editor`: 252
  passed, 0 failed; raw `npx tsc --noEmit -p tsconfig.json`: exit 0.
- [ ] User check 2: `94_copy.efxbn` block 1 shows an expanding sphere whose silhouette glows green
  (view-angle ramp), plus the y_0001 half ring. The ramp GLSL is still only compiled at runtime.

## View-angle ramp editor redone as colour pickers

- User request: "重做View-angle ramp，也是改成颜色picker" (the Edit tab group was eight bare numbers).
- `EfxbnViewAngleRampEditor.tsx` replaces the group's field rows (`EfxbnBlockEditor.tsx` `Group`):
  - an Enabled switch on `actionFlags & 0x02000000` (also named in `ACTION_FLAG_BITS`);
  - a bar that plots `lerp(start, end, efxbnViewAngleFactor(rim, threshold, power))` from face-on
    to edge-on over a checkerboard, with a tick at the threshold;
  - start / end stops: swatch with the native colour picker (one undo step when the picker closes,
    via the native `change` event; alpha kept) plus R / G / B / A sliders and number inputs
    (slider span 0..2, widened rather than clamped for larger authored values);
  - threshold and power sliders; a note when the block type (not billboard / model) ignores it.
- `setEfxbnFields` (`efxbnDocument.ts`) writes several fields as one undo step; `setEfxbnField`
  now delegates to it. `NumberInput` moved to `EfxbnNumberInput.tsx` so both editors share it.
- i18n: `block.viewRamp.*` in en-US / zh-CN `test-effect-folder.json`.
- Verification: raw `npx tsc --noEmit -p tsconfig.json` exit 0;
  `vitest run src/page/TestEditor/components/effect-folder-editor src/i18n`: 253 passed, 1 failed.
  The failure is `i18n.test.ts` locale key parity on `test-triad-route.json`
  (`order.variantRows_one`, `order.changedCount_one` exist only in en-US), a file this change does
  not touch. The project has no ESLint config, so no lint ran.

## Related changes on 2026-10-02 (same editor, already done)

- Texture parameter picker: `EfxbnTextureParameterPicker.tsx`, `setEfxbnTextureParameterColorMap`
  (`efxbnDocument.ts`), `readEffectFolderTextureSize` (`effectFolderService.ts`). A parameter's
  colour map can point at any nutexb of the pack or of `000common_001`; size follows the nutexb
  footer (equal to it for 1,731 of the 1,833 shipped parameters whose texture resolves).
- Registration order: `append_to_primary_container` (`src-tauri/src/format/effect_folder.rs`)
  inserts textures before model folders before efxbns (`RegistrationRank`). Appending a texture
  after the efxbn that samples it made it draw white in game: an efxbn binds its colour maps when
  registered (`sub_140174B30` -> `sub_14016BE10`). Details in
  `docs/efxbn-current-analysis-summary.md`, "Effect pack registration order".
