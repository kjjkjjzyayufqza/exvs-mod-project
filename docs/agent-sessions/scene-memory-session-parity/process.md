# Scene Memory Session Parity Process

## 2026-05-30

- Used the `executing-plans` skill because the requested `superpowers:executing-plans` skill is not available in this environment.
- Read required startup files: `AGENTS.md`, `.cursor/rules/custom-rules.mdc`.
- Read PRD: `.claude/prds/scene-memory-session-parity.prd.md`.
- Read relevant docs:
  - `docs/scene-editor-user-guide.md`
  - `docs/scene-stage-disk-layout.md`
  - `docs/superpowers/specs/2026-05-25-delete-ssbh-model-design.md`
- `git status --short` shows existing modified/untracked files related to Milestone 3 delete lifecycle:
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/scene_memory_session.rs`
  - `src-tauri/src/scene_session_commands.rs`
  - `src/page/SceneEdit/page.tsx`
  - `src/page/SceneEdit/utils/sceneSessionService.ts`
  - `src/page/SceneEdit/utils/havokOverlayCleanup.ts`
  - `src/page/SceneEdit/utils/havokOverlayCleanup.test.ts`
- PRD marks Milestone 3 complete; remaining planned work is Milestone 1 Properties parity and Milestone 2 texture rendering parity.

### Implementation

- Added `scene_build_import_preview_bundle` Tauri command to build an `SsbhModelPreviewBundle` directly from `SceneMemorySession` converted SSBH artifacts.
- The preview bundle parses in-memory numdlb/numshb/nusktb/numatb bytes and resolves numatb texture references against:
  - absolute texture paths,
  - the source DAE folder,
  - `stageRoot`,
  - `stageRoot/textures`.
- Imported DAE objects now retain `ssbhBundle` when conversion succeeds.
- `MapViewport` renders imported objects with an attached `ssbhBundle` through the same `StageModelGroup` SSBH rendering path used by disk-loaded models; unconverted imports still use the DAE scene fallback.
- `useSceneTextureLoader` now includes imported in-memory SSBH bundles in texture collection and decodes per-path: `memory://` paths use memory IPC, disk paths use disk IPC. This prevents an imported memory model with disk-resolved nutexb paths from blocking on an unrelated FHM2D memory session id.
- Detail view bundle lookup now resolves `imported_dae` nodes when an in-memory `ssbhBundle` is attached.
- `useSceneDetailView` loads model/material tabs from the in-memory bundle JSON when `sourceKind === "memory"` instead of trying to read a non-existent disk file.
- For memory bundles, detail-view save actions update the in-panel base draft without writing to disk.

### Verification

- `npm test -- --run src/page/SceneEdit/utils/sceneDetailViewBundleLookup.test.ts src/page/SceneEdit/utils/havokOverlayCleanup.test.ts` — passed, 10 tests.
- `npm run build` — passed (`tsc && vite build`), with existing Vite large chunk/plugin timing warnings.
- `cargo check --manifest-path src-tauri/Cargo.toml` — passed, with existing dead-code/unused warnings.
- `npm test -- --run src/page/SceneEdit/components/detail-view/SceneDetailViewWindow.test.tsx src/page/SceneEdit/utils/sceneDetailViewBundleLookup.test.ts src/page/SceneEdit/utils/sceneTextureInventory.test.ts src/page/SceneEdit/utils/havokOverlayCleanup.test.ts src/page/SceneEdit/utils/sceneSessionService.test.ts` — passed, 33 tests. Vitest reported an existing hoisted mock warning in `sceneSessionService.test.ts`.
- `cargo test --manifest-path src-tauri/Cargo.toml scene_memory_session::tests -- --nocapture` — passed, 22 tests.
- `cargo fmt --manifest-path src-tauri/Cargo.toml` — completed.
- `cargo fmt` initially formatted unrelated Rust files across the crate; those formatter-only changes were reverted, preserving only task-related Rust files.
- Re-ran `cargo check --manifest-path src-tauri/Cargo.toml` after cleanup — passed with existing warnings.
- Re-ran `npm run build` after cleanup — passed with existing Vite chunk/timing warnings.
- Local asset check:
  - `Test-Path 'D:\output\exvs2\zabanya\backpack_up.dae'` — true.
  - `Test-Path 'E:\XB\解包\com\test\0x4D1F5138\0\0'` — false.
  - `Get-ChildItem 'D:\output\exvs2' -Recurse -Filter *.nutexb -File` — no `.nutexb` files found.
- Added Rust coverage in `src-tauri/src/scene_session_commands.rs`:
  - `scene_import_texture_ref_resolution_checks_source_and_stage_roots` verifies `.nutexb` resolution from absolute refs, source DAE parent, `stageRoot/textures`, and unresolved missing refs without touching the stage folder.
  - `real_dae_conversion_builds_memory_preview_bundle` uses local `D:\output\exvs2\zabanya\backpack_up.dae` to convert DAE bytes and build an in-memory `SsbhModelPreviewBundle` with populated modl, mesh, matl JSON and `memory://` virtual paths.
- Improved Properties parity for unsaved imports:
  - Added `matlProfiles` to `SsbhModelPreviewBundle` so memory import bundles can preserve independent Maya/Nust material JSON instead of forcing the detail view to reuse one merged `matl` payload for both profiles.
  - `scene_build_import_preview_bundle` now serializes separate `maya` and `nust` profile values when the converted artifacts contain both profiles.
  - `useSceneDetailView` now prefers `bundle.matlProfiles.maya/nust` for memory material tabs and falls back to the merged `matl` only when profile-specific data is unavailable.
  - Added `src/page/SceneEdit/hooks/useSceneDetailView.test.tsx` to prove imported memory bundles load model/material Properties from bundle JSON and do not call disk `.numdlb/.numatb` readers.
- Improved texture rendering parity coverage for unsaved imports:
  - Added `src/page/SceneEdit/hooks/useSceneTextureLoader.test.tsx`.
  - The test builds an imported `sourceKind: "memory"` bundle whose material resolves to a disk `.nutexb` path, then verifies `useSceneTextureLoader` calls `nutexb_preview_file_identity` and `nutexb_rgba_bytes` with that disk path.
  - The same test verifies the path does not call `fhm2d_memory_nutexb_rgba_bytes` or `getMemoryNutexbPreviewIdentity`, covering the mixed memory-bundle/disk-texture case that caused black pre-save textures.
- Improved pre-save disk immutability coverage:
  - Added Rust test `real_dae_memory_preview_bundle_resolves_textures_without_pre_save_disk_writes`.
  - The test copies the real local `backpack_up.dae` into a temp source directory, creates a temp stage `textures/stage_wall_alb.nutexb`, injects that texture reference into generated Nust/Maya numatb artifacts, and builds the in-memory preview bundle.
  - It snapshots source/stage file lists before and after preview bundle construction and verifies no new SSBH artifacts are written before Save, while `textureResolve` still points at the existing disk `.nutexb`.
- New verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml scene_import_texture_ref_resolution_checks_source_and_stage_roots -- --nocapture` — passed, 1 test.
  - `cargo test --manifest-path src-tauri/Cargo.toml real_dae_conversion_builds_memory_preview_bundle -- --nocapture` — passed, 1 test.
  - `cargo test --manifest-path src-tauri/Cargo.toml real_dae_memory_preview_bundle_resolves_textures_without_pre_save_disk_writes -- --nocapture` — passed, 1 test.
  - `cargo check --manifest-path src-tauri/Cargo.toml` — passed, with existing warnings.
  - `cargo test --manifest-path src-tauri/Cargo.toml scene_memory_session::tests -- --nocapture` — passed, 22 tests.
  - `npm test -- --run src/page/SceneEdit/hooks/useSceneDetailView.test.tsx` — passed, 1 test.
  - `npm test -- --run src/page/SceneEdit/hooks/useSceneTextureLoader.test.tsx` — passed, 1 test.
  - `npm test -- --run src/page/SceneEdit/hooks/useSceneTextureLoader.test.tsx src/page/SceneEdit/hooks/useSceneDetailView.test.tsx src/page/SceneEdit/components/detail-view/SceneDetailViewWindow.test.tsx src/page/SceneEdit/utils/sceneDetailViewBundleLookup.test.ts src/page/SceneEdit/utils/sceneTextureInventory.test.ts src/page/SceneEdit/utils/havokOverlayCleanup.test.ts src/page/SceneEdit/utils/sceneSessionService.test.ts` — passed, 7 files / 35 tests. Vitest still reports the existing hoisted `vi.mock` warning in `sceneSessionService.test.ts`.
  - `npm run build` — passed, with existing Vite large chunk/plugin timing warnings.

### Remaining Evidence Gap

- Automated checks now cover the new interfaces, detail/texture/session unit coverage, temp-directory texture reference resolution, real DAE conversion into a memory preview bundle, profile-specific memory material data in the Properties hook, disk-resolved texture decoding from imported memory bundles, and pre-save disk immutability during preview bundle construction.
- Full PRD completion still needs manual QA with a real imported DAE and valid numatb/nutexb setup: open Properties before Save, confirm model/material/skeleton/texture tabs populate; verify viewport texture appearance before Save matches after Save + reload; verify disk remains untouched until Save.
- This machine does not currently have the needed texture/stage QA data: the Zabanya DAE files exist, but no `.nutexb` files were found under `D:\output\exvs2`, and the configured stage root path is missing.
