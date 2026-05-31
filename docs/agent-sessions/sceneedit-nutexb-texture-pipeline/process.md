# Process Log - SceneEdit Nutexb Texture Pipeline

## Context

- User requested SceneEdit to apply `.nutexb` textures onto stage models.
- User required the implementation to directly follow TestEditor model design.
- User explicitly confirmed:
  - Full TestEditor-compatible texture pipeline.
  - Full slot support.
  - Shared cache strategy.
  - Eager decode behavior.
  - Reuse over rewrite.

## Initial Findings

- SceneEdit currently renders meshes with plain `meshStandardMaterial` and no texture decode pipeline.
- TestEditor already has:
  - Texture-path resolution from `bundle.textureResolve`.
  - Disk/memory decode branching.
  - Versioned cache (`nutexbPreviewCache`) with L1/L2 + inflight dedupe.
  - Progress reporting for unique texture decode.
- Current SceneEdit memory import backend builds bundles with `source_kind: "stage_memory"` and no `source_session_id`, which is incompatible with direct reuse of TestEditor memory decode path.

## Execution Plan

1. Make SceneEdit bundle metadata compatible with TestEditor texture source handling.
2. Reuse TestEditor material+texture resolution and decode utilities in SceneEdit viewport path.
3. Add decode progress UI in SceneEdit page/viewport.
4. Verify build/lint and runtime behavior.

## 2026-05-31 Texture Folder Regression

User reported that after extracting an `.fhm2d`, the model `.nutexb` files are correctly consolidated under the shared `textures/` folder, but later Save/Repack flows may delete that shared folder and recreate per-model numbered texture folders on disk.

Context gathered:
- `docs/scene-stage-disk-layout.md` describes the old behavior: Save keeps shared `textures/`; Repack runs `redistribute_stage_textures`, deletes shared `textures/`, rebuilds a forced per-model structure JSON, and packs.
- `executeSaveFhm2dPipeline` directly invokes `redistribute_stage_textures` on the resolved original pack root, then validates, runs `rebuild_stage_structure_json_forced`, and calls `repack_fhm2d`.
- `redistribute_stage_textures` copies refs from shared `textures/` into each model's numbered subdirs and removes the shared folder when it copied textures.

Decision:
- Keep the existing per-model repack structure JSON behavior, but run it only inside an isolated temporary copy of the pack root.
- The user's real stage folder should stay in the editing/shared `textures/` layout after Save as FHM2D, including failure cases.

Changes made:
- Added `repack_stage_fhm2d_preserving_shared_textures` in `fhm2d_stage.rs`. It copies the pack root and sibling structure JSON to a temp workspace, runs the existing `redistribute_stage_textures`, validates, forces the packable structure JSON rebuild, and calls the existing FHM2D packer from that temp workspace.
- Exposed the helper as a Tauri command and registered it in `lib.rs`.
- Changed `executeSaveFhm2dPipeline` to run the normal shared-textures folder save first, then call the preserving command instead of mutating the real pack root with `redistribute_stage_textures` + forced rebuild.
- Added a Rust regression test that asserts the source `textures/` directory and absence of numbered model texture dirs are preserved after the isolated repack flow.
- Updated `docs/scene-stage-disk-layout.md` so it documents the new source-folder-preserving repack behavior.

Verification:
- `cargo check --manifest-path src-tauri\Cargo.toml` passed with pre-existing warnings (`parse_numatb_texture_refs`, `collect_u64_integers`, and debug binary warnings).
- `cargo test --manifest-path src-tauri\Cargo.toml repack_preserving_shared_textures_does_not_mutate_source_layout --lib -- --nocapture` passed, but the body skipped because `E:\XB\解包\com\test\16F73C97.fhm2d` is not present on this machine.
- `pnpm build` still fails on pre-existing unrelated TypeScript errors in SceneEdit test/util files (`DaeImportSsbhFullPanel.test.tsx`, `sceneEditRndSizePersistence.test.ts`, `SceneTextureSelectPicker.test.tsx`, `sceneDaeSessionImport.test.ts`, and `DdsFormat` imports).
- `pnpm exec tsc --noEmit --pretty false` filtered for changed save pipeline files reported no diagnostics in `sceneSaveFhm2dPipeline.ts` or `sceneSaveFolderPipeline.ts`.
- `git diff --check` passed.

