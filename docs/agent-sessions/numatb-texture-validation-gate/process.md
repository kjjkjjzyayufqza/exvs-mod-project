# numatb-texture-validation-gate — Process

## Context gathered (current state, code-verified)

### No automatic texture validation in Save/Repack today
- `executeSaveFolderPipeline` (`src/page/SceneEdit/utils/sceneSaveFolderPipeline.ts`)
  Phase 4 (materials) and Phase 5 (textures) are explicit placeholders ("Skipped").
- `executeSaveFhm2dPipeline` (`sceneSaveFhm2dPipeline.ts`) runs folder pipeline ->
  `redistribute_stage_textures` -> `rebuild_stage_structure_json_forced` ->
  `repackFolderToFhm2dFile`. No numatb validation anywhere.
- `scene_repack_in_place` (`src-tauri/src/scene_session_commands.rs:1274`) only
  writes session artifacts. No validation.

### Orphaned validator exists
- `src-tauri/src/format/fhm2d_stage_validate.rs::exvs_stage_validate_for_repack`
  registered as a command (`lib.rs:139`, `stage_commands.rs:675`).
- Step 5 `exvs_stage_check_numatb_textures` checks numatb refs exist in per-model
  `0/` (maya) / `1/` (nust) subdirs. It SKIPS empty refs (line ~356).
- Frontend NEVER calls it (grep over `src/` = 0 hits).

### Existing empty-path detection (TS, editor-only)
- `collectMissingTexturePathSlots` / `collectMissingTexturePathSlotRefsForExportSession`
  in `numatbTemplateStoreHelpers.ts` flags texture params present-but-empty.
- Wired into DAE import / SSBH session UI (`DaeImportSsbhFullPanel`,
  `DaeSsbhSessionLayout`) as a fill helper. NOT into SceneEdit save/repack, never blocks.

### Key safety facts
- Empty-param check only fires on params present in `textures` with empty `data`.
  A legitimately texture-less material (sky `__nust__`) has an empty `textures`
  array -> zero false positives.
- Case B step assumes per-model `0//1/` layout, which only exists after
  `redistribute_stage_textures` in the FHM2D pipeline (Save-as-Folder keeps a
  shared `textures/` layout).

### Outliner mapping
- `SceneOutliner.tsx` has NO existing per-object status badge mechanism.
- `useSceneDirtyStore` keys per-object state by model folder name (content-level
  dir name: "base", "sky", model dir). Use the same key for validation errors.

### ssbh_data API (for the new Rust step)
- `MatlData.entries[].material_label: String`.
- `entry.textures` / `entry.textures2`: each item is a texture-path param with
  `.data: String` and `.param_id`. All items are texture-path params (no "Use*"
  toggles, those are booleans elsewhere) -> just check `data.trim().is_empty()`.
- Stringify param_id via serde to match the frontend's param_id strings.

## Decisions / commands / results

### Implementation (complete)

Rust (`src-tauri/`):
- `format/fhm2d_stage_validate.rs`: added `EXVS_STAGE_PREFLIGHT_FLOW`,
  `exvs_stage_validate_numatb_empty_params(stage_root)`, step
  `exvs_stage_check_numatb_empty_params` (+ `collect_numatb_paths`,
  `empty_param_error`, `param_id_to_string`). Existing
  `exvs_stage_check_numatb_textures` and `exvs_stage_validate_for_repack`
  left UNCHANGED.
- `stage_commands.rs`: added command `scene_validate_numatb_empty_params`.
- `lib.rs`: registered the new command.
- `scene_session_commands.rs::scene_repack_in_place`: added a defensive
  pre-flight gate (returns Err on empty-param errors).

Frontend (`src/page/SceneEdit/`):
- `utils/sceneSessionService.ts`: `ExvsStageValidationError`/`Result` types +
  `validateNumatbEmptyParams` + `validateStageForRepack`.
- `store/sceneValidationStore.ts`: zustand store keyed by folder name.
- `utils/sceneValidationErrors.ts`: `deriveErrorFolder`,
  `buildErrorFolderCounts`, `groupErrorsByFolder` (path -> outliner node id).
- `components/StageValidationErrorDialog.tsx`: grouped error dialog with Locate.
- `page.tsx`: `runNumatbPreflight` + `surfaceValidationErrors`; pre-flight gate
  in `handleSaveFolder` and `handleSaveFhm2d`; case B errors surfaced from the
  FHM2D pipeline; dialog rendered with outliner Locate.
- `utils/sceneSaveFhm2dPipeline.ts`: post-redistribute case B gate via
  `validateStageForRepack`, threads `validationErrors` out on failure.
- `components/SceneOutliner.tsx`: red `AlertTriangle` + destructive label when a
  node's folder name is in the validation store's `errorFolders`.

### Verification

- `cargo check` (src-tauri): PASS (only pre-existing warnings).
- `npx tsc --noEmit`: my authored/edited files report ZERO errors. The 6
  remaining tsc errors are pre-existing, in unrelated working-tree WIP
  (`sceneSaveFolderPipeline.ts`, `mapDaeImportConfigToBackend`, 3 test files) —
  not touched by this feature.

### Notes for next agent

- Mapping key everywhere is the content-level folder name = outliner node id
  (`base`, `sky`, model dir). `deriveErrorFolder` matches it from the error path.
- `scene_repack_in_place` is imported into `page.tsx` but not yet wired to a UI
  button; its gate is defensive (string error) for when it gets wired.
- Pre-existing WIP has tsc errors unrelated to this feature; resolve separately.

## 2026-05-30 — Coordinator: revert inline Rust patch, design module, delegate

- Reverted uncommitted changes in `fhm2d_stage_validate.rs` (`git checkout --`).
- Frontend Use*-gated validation lives in `numatbTemplateStoreHelpers.ts` (all profile entries).
- New design: `design-numatb-format-module.md` — extract `format/numatb_format.rs`, wire validator only.
- Subagent brief: `agent-handoff-gpt55.md` (implement + test; do not re-embed rules in validator file).

## 2026-05-30 — GPT-5.5 implementation: reusable Rust numatb rules

- Added `src-tauri/src/format/numatb_format.rs` as the reusable Rust source for empty texture-path rules.
- Registered the module in `src-tauri/src/format/mod.rs`.
- Refactored `exvs_stage_check_numatb_empty_params` in `src-tauri/src/format/fhm2d_stage_validate.rs` to call `numatb_format::collect_missing_texture_paths_for_matl`.
- Kept `exvs_stage_check_numatb_textures` unchanged.

### Rule parity implemented

- `Texture1` is always required, including when the row is missing.
- `MetallicMap`, `RoughnessMap`, `NormalMap`, `EmissiveMap`, `AmbientOcclusionMap`, and `SpecularMap` are required only when their matching `Use*` boolean is true.
- `BaseColorMap`, `BaseColorMapLayer1`, `DiffuseMap`, and `DiffuseMapLayer1` follow the frontend explicit/implicit base color rules:
  - `UseBaseColorMap` or `UseDiffuseMap` true requires present base slots, or `BaseColorMap` if none exist.
  - Either toggle false disables the implicit slot-present requirement.
  - With no toggle, existing base color slots are required.
- `DiffuseCubeMap` remains non-required because there is no EXVS `Use*` rule for it.
- The stage pre-flight validates every material entry in every scanned `.numatb`, with no NUMDLB label filtering.

### Verification

- `cargo fmt --manifest-path "e:\TAURI_PROJECT\src-tauri\Cargo.toml"`: PASS.
- `cargo test numatb_format --manifest-path "e:\TAURI_PROJECT\src-tauri\Cargo.toml"`: PASS, 9 `format::numatb_format` tests passed.
- `cargo check --manifest-path "e:\TAURI_PROJECT\src-tauri\Cargo.toml"`: PASS.
- `ReadLints` on edited Rust files: PASS, no linter errors.

Warnings observed during Rust commands are pre-existing repository warnings:

- `parse_numatb_texture_refs` dead code in `src-tauri/src/format/fhm2d_stage.rs`.
- `collect_u64_integers` dead code in `src-tauri/src/havok_mesh_export.rs`.
- `debug_hkt_to_obj` unused import / unused variable warnings.
