# Unit Model FBX/DAE Import Process

## Goal

Add a complete Unit Model model-import workflow with two source options:

1. Convert FBX/DAE through the existing Scene SSBH configuration experience.
2. Import an already-generated SSBH folder after strict completeness validation.

Both paths must integrate through the Unit Model canonical model mutation logic and
automatically add an empty NUHLPB.

## Relevant Documentation

- `docs/agent-sessions/unit-model-editor/dynamic-folder-pipeline-plan.md`
- `docs/agent-sessions/unit-model-editor/implementation-plan.md`
- `docs/agent-sessions/batch-static-mesh-import/process.md`
- `docs/agent-sessions/scene-dae-ssbh-save/process.md`
- `docs/agent-sessions/numatb-template-config/process.md`
- `docs/agent-sessions/fbx-import-transform-fix/process.md`

## Confirmed Constraints

- Unit Model packages use a canonical model tree plus a shared texture pool; generated
  files cannot simply be copied into an arbitrary folder.
- Existing `add_unit_model_model` is the integration boundary for source SSBH folders.
- Scene direct conversion already supports FBX/DAE analysis, NUMDLB mapping, Maya/Nust
  NUMATB profiles, texture reference validation, NUSKTB, NUMSHB, NUMDLB, and JNTTBL.
- Unit import does not need stage placement or mandatory HKT generation.
- Conversion is CPU/memory intensive. Keep parsing and conversion in Rust/Tauri,
  execute one source at a time, and expose explicit frontend busy/progress state.
- The Unit mutation must remain atomic from the user's perspective: do not update the
  structure until conversion and source-folder validation have completed.

## Current Audit Status

- Architecture context identified the main surfaces:
  - `UnitModelModelManagerPanel`
  - `unitModelModelService`
  - `format/unit_model_models.rs`
  - `DaeImportConfigModal`
  - `DaeImportSsbhFullPanel`
  - `sceneDaeSessionImport`
  - `scene_convert_static_mesh_to_stage_files_streamed`
- Detailed source and test inspection completed.

## Implementation Summary

- Split the Unit Model add action into two explicit paths:
  - `Import FBX / DAE`
  - `Add SSBH Folder`
- Added strict source-folder validation before Unit structure mutation:
  - exactly one NUMDLB, NUMSHB, NUSKTB, JNTTBL;
  - exactly two NUMATB profiles;
  - required Maya and Nust NUMATB profiles;
  - duplicate core files rejected;
  - model base names validated against the NUMDLB model name when available;
  - JNTTBL bone count validated against NUSKTB bones.
- Changed Unit model add to always create a fresh empty NUHLPB entry and ignore any
  source NUHLPB.
- Reused the Scene FBX/DAE SSBH analysis and configuration modal in a Unit-specific
  mode that hides stage output choices, disables HKT, and locks required SSBH outputs.
- Added `unit_model_import_static_mesh` as the Unit-specific backend orchestration:
  analyze/configure in the frontend, convert in Tauri/Rust, stage generated files,
  create identity JNTTBL from NUSKTB, stage external textures, then integrate through
  `add_unit_model_model`.
- Added rollback behavior around copied files if the structure JSON commit fails.
- Confirmed refresh behavior:
  - successful add/import calls `onMutated`;
  - `UnitModelEdit` increments `reloadTick`;
  - `_structure.json` is reread;
  - texture count refreshes because it depends on the new `structureJson`;
  - the model list is rebuilt from the refreshed tree.

## Files Touched

- `src-tauri/src/format/unit_model_models.rs`
- `src-tauri/src/stage_commands.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/scene_session_commands.rs`
- `src/page/UnitModelEdit/utils/unitModelModelService.ts`
- `src/page/UnitModelEdit/utils/unitModelModelService.test.ts`
- `src/page/UnitModelEdit/components/UnitModelModelManagerPanel.tsx`
- `src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx`
- `src/page/SceneEdit/components/dae-import/DaeImportSsbhFullPanel.tsx`
- `src/page/SceneEdit/components/dae-import/DaeImportSsbhFullPanel.test.tsx`
- `src/page/SceneEdit/components/StageImportProgressDialog.tsx`

## Verification

- `cargo check`
  - Passed.
  - Warnings only in existing files: `unit_model_extract.rs` and `debug_hkt_to_obj.rs`.
- `cargo test unit_model_models::tests --lib`
  - Passed: 7 tests.
- `cargo test unit_model_real_dae_pipeline_when_samples_are_present --lib`
  - Passed with local samples present.
  - Covered DAE analysis/conversion, Unit staging, strict folder validation, Unit add,
    generated files, and empty NUHLPB.
- `npx vitest run src/page/UnitModelEdit/utils/unitModelModelService.test.ts src/page/SceneEdit/components/dae-import/DaeImportSsbhFullPanel.test.tsx src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts`
  - Passed: 3 files, 19 tests.
- `git diff --check`
  - Passed with line-ending warnings only.

## Known Unrelated Failures

- `npx vitest run src/page/SceneEdit/components/dae-import src/page/UnitModelEdit`
  still fails one pre-existing text expectation:
  `DaeImportAnalysisPanel.test.tsx` expects `Analyzing DAE...`; current UI shows
  `Analyzing static mesh...`.
- `npx tsc --noEmit` still fails unrelated pre-existing test/type issues:
  `sceneDaeSessionImport.test.ts`, `sceneModelReplacePreview.test.ts`, and
  `stageRegistrySync.test.ts`.

## Notes

- The referenced `unit-model-structure-tree.json` file in the workspace was empty,
  so implementation was based on the existing parser/mutation code and real local
  Unit package samples instead.
