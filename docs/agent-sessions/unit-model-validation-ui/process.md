# Unit Model Validation UI Process

## Context

- The Unit Model workspace stores `validation` in `useUnitModelWorkspace`.
- The properties panel can render validation summaries and issues, but data is only present after manual validation.
- `UnitModelRepackDialog` currently runs `validateUnitModelForRepack` inside the Repack confirmation handler and only shows a toast with the issue count.
- Structure mutations and texture changes currently clear validation instead of refreshing it.

## Decisions

- Keep the existing backend validation command as the source of truth.
- Add automatic validation on loaded root changes and after explicit invalidation events.
- Keep a final validation guard in the repack action, but write the result back to shared workspace state and render details in the dialog.
- Use the existing compact Unit Model layout rather than introducing a new visual system.
- Treat legacy `shell_*.shl` entries as non-blocking warnings. They are not part
  of the native Unit Model folder layout.
- Unit Model repack now uses a Unit-specific wrapper that filters missing legacy
  `.shl` entries from a temporary structure before calling the shared FHM2D packer.
  The shared `repack_fhm2d` command is unchanged for Scene/Test Editor.

## Implementation Notes

- `useUnitModelWorkspace` now auto-runs validation silently when a root/structure
  becomes available and after explicit stale events.
- Structure mutations and saved `.numatb` / `.numdlb` edits mark validation stale.
- `UnitModelPropertiesPanel` shows validation state, issue count, virtualized
  issues, and non-blocking warnings.
- `UnitModelRepackDialog` receives shared validation state, disables Repack until
  validation passes, displays blocking issue details, and writes final guard
  validation results back to shared state.
- `validate_unit_model_for_repack` now emits missing/stale legacy SHL findings as
  warnings instead of errors.

## Verification Log

- `cargo test missing_legacy_shl_reference_is_warning_only --lib`
  - Passed.
- `cargo test unit_model_validate --lib`
  - Passed: 8 tests.
- `cargo test unit_model_repack --lib`
  - Passed: 1 test.
- `cargo test unit_model --lib`
  - Passed: 23 tests.
- `cargo check`
  - Passed with existing warnings in `unit_model_extract.rs` and
    `debug_hkt_to_obj.rs`.
- `npx vitest run src/page/UnitModelEdit/components/UnitModelRepackDialog.test.tsx`
  - Passed: 2 tests.
- `npx vitest run src/page/UnitModelEdit`
  - Passed: 7 files, 22 tests.
- `npx tsc --noEmit --pretty false`
  - Still blocked by unrelated existing errors in
    `sceneDaeSessionImport.test.ts`, `sceneModelReplacePreview.test.ts`, and
    `stageRegistrySync.test.ts`.
- `git diff --check`
  - Passed with line-ending warnings only.
