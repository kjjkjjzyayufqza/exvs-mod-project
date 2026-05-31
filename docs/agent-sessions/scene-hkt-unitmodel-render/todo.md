# Scene HKT + UnitModel Render — Todo

4-feature goal (from session goal hook, terminal 8.txt:64-79).

## Feature 1 — Scene Editor: generate HKT from a NEW model (read DAE -> HKT -> replace)
- [x] Rust backend: `scene_preview_hkt_collision_mesh_path` (Havok-free geometry preview)
- [x] Rust backend: `scene_replace_hkt_from_dae_path` (generate HKT from DAE + apply)
- [x] Register both commands in `lib.rs`
- [x] Service bindings in `sceneSessionService.ts`
- [x] `HktCollisionPreviewCanvas.tsx` (Three.js collision preview)
- [x] `GenerateHktFromModelDialog.tsx` (design-taste styled window)
- [x] Wire dialog into SceneEdit page + outliner context menu ("Generate HKT from Model...")
- [x] Type-check clean (no errors in changed files)

## Feature 2 — UnitModelEdit Repack -> configured mod folder
- [x] Repack targets `obModPath` (configured mod folder), not the structure-json folder
- [x] "Repack Changes"-style dialog (`UnitModelRepackDialog.tsx`)
- [x] Test: `unitModelRepackService.test.ts` 7/7 pass

## Feature 3 — UnitModelEdit resize blur fix
- [x] `SsbhModelCanvas` restores full DPR + forces one repaint on viewport resize

## Feature 4 — UnitModelEdit rendering review + restore NUANMB anim + bone control (DONE)
- [x] Review: UnitModelEdit uses shared `SsbhModelCanvas`; scene editor uses `MapViewport`
- [x] Root cause anim+bone: `PreviewCollectionStore::replace_items` left `activeItemId` null
      after Open model/.numdlb, gating BOTH NUANMB playback and bone interaction.
- [x] Fix: `replace_items` auto-activates the first item (mirrors `append_items`); +2 Rust tests.
- [x] Rendering rewrite (user chose "full"): new shared `ssbhTextureUpload.ts`
      (SceneTexturePool + createDataTexture/buildTexturePoolKey/lookupTextureData/pathForSlot);
      context now decodes RGBA into a path-keyed `textureDataMap` (via `decodeSceneNutexbRgba`),
      dropping the per-draw PNG blob-URL pipeline; `SsbhModelCanvas` uploads pooled
      `DataTexture`s + `logarithmicDepthBuffer`; viewport + inspector repointed; scene
      `SceneTexturePool.ts` re-exports the shared class.
- [x] Verify: tsc clean (only pre-existing unrelated errors), 93 preview/scene tests pass,
      6 preview_collection Rust tests pass.

## Runtime verification still needed (cannot launch dev server here)
- Visual: load a unit model folder -> textures display correctly (colorspace/UV), no regressions.
- Open .nuanmb -> Play -> mesh animates; scrub timeline; select bone -> gizmo + W/E/R + undo/redo.
- Resize panel/window -> no blur (Feature 3).

## Notes / follow-ups
- `textureFlipY` toggle now applies flipY onto pooled textures (global), preserved.
- RGBA decode is full-res (maxDimension=null) to match prior PNG full-res quality; a
  quality cap could be added later if VRAM/CPU is a concern on huge textures.
- Memory-preview bundles have no skel path (pre-existing limitation) — motion sampling for
  memory models still needs a skel path; disk-loaded models are the main flow.
