# Scene Import IPC Memory Process

## Context

- User reports frontend memory growth/crash when large FBX/DAE conversions finish.
- Log evidence: `test2.fbx` produced `new_model.numshb` at `354233824` bytes, with `2362718` vertices and `3720684` triangle indices.
- Existing import progress uses lightweight `Channel` messages, but the conversion pipeline still stores large source bytes and converted artifacts in session memory and can request a large preview bundle through IPC.

## Initial Findings

- `scene_import_dae_from_path_streamed` reads the selected file into `PendingImport.dae_bytes`.
- `scene_execute_import_impl` clones those bytes, converts them in a blocking task, then stores `SsbhArtifacts` as `Vec<u8>` in `PendingImport`.
- `scene_build_import_preview_bundle` reads `SsbhArtifacts` and serializes `MeshData`/`ModlData` as JSON to the frontend.
- In the current frontend SSBH mode path, `processSsbhSessionImport` calls `sceneBuildImportPreviewBundle` even though the backend config has `loadToScene=false`.
- For the large sample, this means a 354 MB `.numshb` can become a much larger JSON/IPC payload before React/Three.js state even handles it.

## Direction

- Keep source files path-backed for path imports instead of copying them into session bytes.
- Store converted SSBH artifacts as temp file paths for path-based conversion, not as large byte vectors.
- Read artifact bytes only for small preview/save operations that truly need them.
- Skip preview bundle creation when the selected import mode is SSBH conversion without scene loading.

## Implementation

- `PendingImport` now records `source_path: Option<PathBuf>`.
  - `scene_import_dae_from_path[_streamed]` registers the source path instead of reading the full DAE/FBX into `dae_bytes`.
  - Byte-backed imports through `scene_import_dae` are still supported.
- Added `SsbhArtifactPaths` for path-backed SSBH artifacts.
  - Path-based conversion writes converter output into a persistent temp directory and stores paths in the Rust session.
  - Temp directories are cleaned when an import is removed, overwritten, or the session is dropped.
  - `scene_list_imports` treats memory-backed and path-backed artifacts the same.
- `scene_execute_import_impl` now uses:
  - path-based conversion and path-based HKT generation when the import came from a file path,
  - byte-based conversion only for byte-backed imports.
- `scene_convert_static_mesh_to_stage_files[_streamed]` now copies generated files from converter output paths to the target model folder instead of first reading large `.numshb` files into a `Vec<u8>`.
- `scene_build_import_preview_bundle` now blocks preview bundle IPC when generated artifacts exceed `128 MiB`.
- `processSsbhSessionImport` no longer requests a viewport preview bundle when `entry.config.loadToScene` is false. This avoids sending huge mesh JSON through IPC for "Convert SSBH" mode.

## Verification

- `cargo test --manifest-path src-tauri\Cargo.toml --lib scene_memory_session::tests -- --nocapture`
  - PASS: 24 tests.
- `cargo test --manifest-path src-tauri\Cargo.toml --lib scene_session_commands::tests -- --nocapture`
  - PASS: 18 passed, 1 ignored.
- `cargo test --manifest-path src-tauri\Cargo.toml --lib scene_session_commands::tests::convert_large_fbx_path_to_ssbh_artifact_paths_keeps_mesh_on_disk -- --ignored --nocapture`
  - PASS.
  - Used `D:\output\minecraft\test2.fbx`.
  - Conversion reported 46 meshes, 0 bones, 2,362,718 vertices, and 3,720,684 triangle indices.
  - Test asserted artifact payload is larger than 128 MiB and stays file-backed.
- `cargo check --manifest-path src-tauri\Cargo.toml`
  - PASS.
  - Existing warnings remain in unrelated code: unused `parse_numatb_texture_refs`, unused `collect_u64_integers`, and debug bin warnings.
- `pnpm exec vitest run src/page/SceneEdit/utils/sceneSessionService.test.ts src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts`
  - PASS: 30 tests.
- `pnpm exec tsc --noEmit --pretty false`
  - PASS.

## Follow-up: Large Payload Warning Hid Three.js Preview

- Symptom: after `Large converted SSBH artifact payload detected...`, the viewport did not show the imported model.
- Cause: the frontend skipped `sceneBuildImportPreviewBundle` for `loadToScene=false`, but the same early exit also skipped `loadStaticMeshFromPath`, so Three.js never received the source mesh preview.
- Fix: keep the large SSBH artifact bundle off IPC, but continue loading the source FBX/DAE through the existing Three.js static mesh loader and create the imported object with `ssbhBundle: null`.
- Result: SSBH conversion metadata stays file-backed, while the user still sees the selected model in the viewport.

## Follow-up: HKT Generate/Regenerate Simplification

- Finding: the existing simplifier only welded vertices, removed tiny triangles, merged similar-normal connected regions, and retriangulated planar boundaries.
- Limitation: closed or curved meshes like spheres have no planar boundary loop to retriangulate, so even heavy settings could leave a 1000-face sphere near the original face count.
- Fix: added optional target decimation after similar-face merging:
  - medium remains conservative and keeps only the existing similar-face/coplanar behavior.
  - heavy now requests `targetTriangleRatio=0.05` with a `maxTargetTriangles=50000` cap.
  - Rust maps these fields into `CollisionSimplifyOptions` and runs a spatial vertex-clustering decimator when the merged mesh is still above target.
- Regression: added a UV sphere fixture near 1000 triangles and asserts heavy simplification reduces it to about 5% without collapsing below a usable primitive.

## Follow-up Verification

- `cargo test --manifest-path src-tauri\Cargo.toml collision_mesh::simplify::tests -- --nocapture`
  - PASS: 6 tests, including `heavy_target_decimates_closed_curved_mesh`.
- `cargo test --manifest-path src-tauri\Cargo.toml scene_session_commands::tests -- --nocapture`
  - PASS: 18 passed, 1 ignored.
- `cargo check --manifest-path src-tauri\Cargo.toml`
  - PASS with existing unrelated warnings.
- `pnpm exec vitest run src/page/SceneEdit/utils/hktSimplifyUtils.test.ts src/page/SceneEdit/components/havok/HavokCollisionEditorPanel.test.tsx`
  - PASS: 6 tests.
- `pnpm exec tsc --noEmit --pretty false`
  - PASS.
- `git diff --check`
  - PASS; Git emitted CRLF normalization warnings only.
