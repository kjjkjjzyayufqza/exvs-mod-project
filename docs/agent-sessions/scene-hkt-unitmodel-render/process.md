# Scene HKT + UnitModel Render — Process

## Context / handoff

Continued from a prior Claude Code session (transcript
`3ee74d62-...jsonl`) that hit its session limit mid-Feature-1. Features 1-3 were
implemented there; this session wired Feature 1 into the UI and verified 1-3.

## Verification log

- `npx vitest run src/page/UnitModelEdit/utils/unitModelRepackService.test.ts` -> 7/7 pass.
- `npx tsc --noEmit -p tsconfig.json` -> only PRE-EXISTING errors, all unrelated to the
  changed files:
  - `sceneEditRndSizePersistence.test.ts` (`store` typing)
  - `sceneTextureConvert.ts`, `sceneTextureDdsFormat.ts`, `texturePathPickerUtils.ts`
    (`DdsFormat` import from `@/lib/ddsFormats`)
  No errors in: page.tsx, SceneOutliner.tsx, GenerateHktFromModelDialog.tsx,
  HktCollisionPreviewCanvas.tsx, SsbhModelCanvas.tsx, UnitModel* files.

## Feature 1 wiring (this session)

- `page.tsx`: import `GenerateHktFromModelDialog`; add `genHktFromModel` dialog state;
  `handleGenerateHktFromModel(importId)` resolves the target (sub_model/base ->
  `folder/map_hit.hkt`, mirroring `handleReplaceHkt`) and opens the dialog;
  `handleGenHktFromModelReplaced(resolvedImportId)` refreshes havok meta + marks dirty.
- `SceneOutliner.tsx`: threaded `onGenerateHktFromModel` through all layers; new context-menu
  item "Generate HKT from Model..." (Sparkles icon) next to "Replace HKT...".

## Feature 4 — rendering review findings

UnitModelEdit renders via `SsbhModelPreviewViewport` -> `SsbhModelCanvas`
(`src/components/ssbh-model-preview/`). Scene editor renders via `MapViewport`
(`src/page/SceneEdit/components/`). `SsbhModelCanvas` is now used ONLY by UnitModelEdit
(TestEditor no longer owns it), so render-core changes are scoped to one page.

### Core-rendering divergences (UnitModelEdit vs Scene Editor)

| Aspect | SsbhModelCanvas (UnitModelEdit) | MapViewport (Scene Editor) |
|---|---|---|
| Texture upload | `useTexture(dataUrls)` via drei/TextureLoader (decodes base64 data URLs per draw; no dedup) | `SceneTexturePool` direct `DataTexture`/`CompressedTexture` from decoded nutexb, content-hash dedup, `generateMipmaps=false` |
| Compressed textures | no (data URL = decoded RGBA) | yes (`CompressedTexture`, keeps GPU format, less VRAM) |
| Depth buffer | default | `logarithmicDepthBuffer: true` |
| DPR | dynamic `setDpr` via `AdaptiveCanvasPerformanceController` (resize-blur source; F3 patched the resize case only) | static, clamped once by triangle budget (`clampSceneViewportRasterProfile`) |
| Frameloop | `demand` / `always` while motion | `demand` + `ViewportFrameLoopGate` |

"GPU material rendering" in the goal == the `useTexture(dataUrls)` + meshStandardMaterial path.
"Copy scene editor core to optimize" == adopt SceneTexturePool + direct DataTexture/Compressed
+ logarithmicDepthBuffer + stable DPR.

### Implication: data-pipeline change

The scene pool consumes decoded `NutexbTextureDataMap` + `ResolvedMaterialBinding`.
UnitModelEdit's context currently emits `drawMaterialDataUrlsByDrawKey` (data URLs).
The viewport already passes `drawMaterialBindingsByDrawKey`. Adopting the pool requires the
context to expose decoded nutexb texture DATA (not just data URLs) — a context-level change.

### Animation (NUANMB) + bone control — already wired, regressed behaviorally

- `SsbhModelPreviewViewport` has "Open .nuanmb", `SsbhModelViewportTimeline` scrub, and full
  bone props (select / transform mode W,E,R / undo-redo) into `SsbhModelCanvas`.
- Context (`SsbhModelPreviewContext`) has `pickMotionNuanmbFile`, `ssbh_nuanmb_manifest`,
  `reloadMotionClipForInstance`, `motionStatesByInstanceId`, GPU skeleton runtime, scrubbing.
- `SsbhModelCanvas` has the full `useFrame` playback (advanceMotionFrame, GPU skeleton update),
  scrub interpolation, `BonePreviewRig` + TransformControls.
- So the code PATH exists; the breakage is behavioral. Need repro symptoms to debug
  (cannot launch dev server per project rules).

## Feature 4 resolution

User decisions: full rendering rewrite; investigate the anim/bone breakage from code.

### Anim + bone root cause (single)
`src-tauri/src/preview_collection_state.rs` `replace_items` set all entries `active=false`
and never auto-activated one, so the snapshot `active_item_id` was None and the frontend
`activePreviewInstanceId` stayed null after `Open model folder` / `Open .numdlb`. Everything
that gates on the active instance broke together: `pickMotionNuanmbFile` (throws), motion
play/setFrame (early return), `bundle`/timeline (null), `isActive` (false -> no BonePreviewRig
gizmo/picking, no GPU skinning). `append_items` already auto-activated the last item; `replace`
did not. Fix: `replace_items` marks index 0 active. Added 2 unit tests (replace activates
first; empty replace -> no active). `cargo test preview_collection` = 6 passed.

### Rendering rewrite (texture pipeline -> scene-editor core)
- New shared module `src/components/ssbh-model-preview/ssbhTextureUpload.ts`:
  `SceneTexturePool`, `createDataTexture`, `createCompressedTexture`, `buildTexturePoolKey`,
  `lookupTextureData`, `pathForSlot`, `samplingForSlot`, `toThreeWrapping`, `SLOT_KEYS`,
  `SRGB_SLOTS`, `NutexbTextureData`/`NutexbTextureDataMap`, `PbrSlotKind`.
- `SsbhModelPreviewContext`: texture effect now decodes nutexb -> RGBA into a path-keyed
  `textureDataMap` via `decodeSceneNutexbRgba` (disk + memory), keeps
  `drawMaterialBindingsByDrawKey`, removed the PNG blob-URL pipeline + `createEmptyDrawMaterialDataUrls`
  + `getOrDecodeNutexbPngBlobUrl`/version-id plumbing. API: `drawMaterialDataUrlsByDrawKey` ->
  `textureDataMap`.
- `SsbhModelCanvas`: `DrawMeshUnifiedPbr` acquires pooled `DataTexture`s from `texturePool`
  (created once in the canvas, disposed on unmount) instead of `useTexture(dataUrls)`;
  `buildDrawMeshSlots` reads bindings + `textureDataMap`; added `logarithmicDepthBuffer: true`;
  removed dead `three` wrapping/colorspace imports. `AdaptiveCanvasPerformanceController` left
  intact (Feature 3 resize fix already handles the blur).
- `SsbhModelPreviewViewport`: passes `textureDataMap`.
- `SsbhModelPreviewInspector`: decode-status flags (`hasCube`, per-slot `decoded`) + texture
  count derived from `textureDataMap` + bindings (it never rendered <img> thumbnails).
- `src/page/SceneEdit/utils/SceneTexturePool.ts` re-exports the shared class (one pool impl).

### Verification
- `npx tsc --noEmit` -> only the same pre-existing unrelated errors.
- `npx vitest run src/components/ssbh-model-preview src/page/SceneEdit/utils/sceneTextureThumbnail.test.ts`
  -> 22 files, 93 tests pass.
- `cargo test preview_collection` -> 6 pass.
- NOT runtime-verified (no dev server): texture visual correctness + anim/bone interaction
  must be confirmed by running the app.
