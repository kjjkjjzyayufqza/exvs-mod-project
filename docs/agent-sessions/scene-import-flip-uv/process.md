# Scene Import Flip UV

## Context
- User requested two Scene Editor `Import Static Mesh` changes:
  - add a `flip UV` option in the UI;
  - make `generate hkt` unchecked by default.

## Initial findings
- `createDefaultDaeImportConfig()` currently sets `generateHkt: true`.
- `DaeSsbhSessionStore` already has `flipUv`, but `DaeImportSsbhFullPanel` does not expose it.
- Scene import execution rebuilds SSBH config from `DaeSsbhSessionStore` via `buildSsbhSessionImportConfig()`.
- Rust scene-session conversion path still hardcodes `flip_uv: false` in `scene_session_commands.rs`.

## Plan
1. Add failing tests for default-off `generateHkt` and `flipUv` mapping.
2. Implement UI/state/backend plumbing.
3. Run targeted tests and lint.
4. Record results here and update `todo.md`.

## Implementation
- Changed `createDefaultDaeImportConfig()` to start with `generateHkt: false`.
- Added `flipUv` to SceneEdit SSBH config types/defaults.
- Exposed a new `Flip UV (V)` checkbox in `DaeImportSsbhFullPanel`.
- Updated `buildSsbhSessionImportConfig()` to pass `DaeSsbhSessionStore.flipUv` into scene-session `ImportConfig`.
- Extended frontend/backend `SsbhConvertConfig` shapes so `flipUv`/`flip_uv` travels through the scene-session import pipeline.
- Replaced Rust scene-session conversion hardcodes (`flip_uv: false`) with `ssbh_config.flip_uv`.
- Updated `docs/scene-editor-user-guide.md` for the new UI control and HKT default.

## Verification
- `pnpm exec vitest run src/page/SceneEdit/components/dae-import/daeImportDefaults.test.ts src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts src/page/SceneEdit/components/dae-import/DaeImportSsbhFullPanel.test.tsx src/page/SceneEdit/utils/sceneSessionService.test.ts`
  - Result: 4 files passed, 34 tests passed.
  - Note: existing Vitest warning remains in `sceneSessionService.test.ts` for a non-top-level `vi.mock("@tauri-apps/api/core")`; warning pre-existed and did not block the run.
- `cargo test --manifest-path src-tauri/Cargo.toml configure_import_updates_config -- --nocapture`
  - Result: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml hkt_collision_options_follow_import_ssbh_config -- --nocapture`
  - Result: passed.
- `ReadLints` on touched frontend files
  - Result: no new IDE diagnostics.

## Review notes
- `typescript-reviewer` and `rust-reviewer` subagents were attempted but unavailable in this region.
- Manual diff review found no additional blockers after the targeted verification above.
