# numatb-texture-validation-gate — TODO

Feature: block Save changes / Repack FHM2D in the Scene Editor when a model's
numatb references invalid textures, and surface the errors clearly (toast +
dedicated dialog + outliner marking).

## Resolved design decisions (from grill session)

1. Invalid = BOTH (case A) empty texture-path param AND (case B) referenced
   `.nutexb` missing on disk.
2. Gate all three entry points, hard block: `handleSaveFolder`,
   `handleSaveFhm2d`, `scene_repack_in_place`.
3. Validation logic lives in Rust, reusing the `EXVS_STAGE_VALIDATION_FLOW`
   step factory.
4. Case A = NEW step `exvs_stage_check_numatb_empty_params`. Do NOT modify the
   existing `exvs_stage_check_numatb_textures`.
5. Case B = reuse existing `exvs_stage_validate_for_repack` UNCHANGED, run only
   in the FHM2D pipeline after `redistribute_stage_textures` (per-model 0//1/
   layout exists there).
6. UI: toast (aggregate) + dedicated grouped error dialog (object -> material ->
   param) + outliner red marking. Pre-flight failure must not mutate any file.

## Tasks

- [ ] Rust: add `exvs_stage_check_numatb_empty_params` step + optional `object`
      field on `ExvsStageValidationError`.
- [ ] Rust: add `exvs_stage_validate_numatb_empty_params` entry + Tauri command
      `scene_validate_numatb_empty_params`, register in `lib.rs`.
- [ ] TS: `validateNumatbEmptyParams` + `validateStageForRepack` in
      `sceneSessionService.ts`.
- [ ] TS: `sceneValidationStore` (keyed by folderName) + `StageValidationErrorDialog`.
- [ ] TS: pre-flight gate in 3 entry points + FHM2D post-redistribute gate.
- [ ] TS: SceneOutliner red marking from validation store.
- [ ] Verify: `cargo check` + frontend typecheck/lint.

## Next agent starts at

Begin with the Rust step (`fhm2d_stage_validate.rs`), then the command, then
frontend wiring. See process.md for code-level findings.
