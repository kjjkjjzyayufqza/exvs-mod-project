# Unit Model Auto Migrate TODO

- [x] Read project rules and relevant Unit Model layout/migration docs.
- [x] Inspect current Unit Model folder-open flow and extract layout implementation.
- [x] Define legacy-vs-current layout detection based on Unit `_structure.json`.
- [x] Add backend migration analysis and migration commands.
- [x] Add frontend migration service and open-folder confirmation flow.
- [x] Run Rust and frontend targeted verification.
- [x] Record final verification outcomes.

## Acceptance Requirements

- Opening a current Unit Model folder does not prompt.
- Opening a non-Unit folder does not prompt.
- Opening an older flat Unit extract with valid `Magic=10` `_structure.json` prompts before mutation.
- Migration updates `SubFileData.fileUrl` into the current layout and moves referenced files accordingly.
- Migration keeps `SubFileStructure` unchanged.
- The preview loads the migrated root after successful migration.

## Verification Notes

- `cargo test unit_model_migrate --lib`: passed.
- `cargo test unit_model --lib`: passed.
- `cargo check`: passed with existing warnings only.
- `npx vitest run src/page/UnitModelEdit/utils`: passed.
- `npx tsc --noEmit --pretty false`: still blocked by unrelated existing Scene/resourceRegistry test fixture errors.
- `git diff --check`: passed with line-ending warnings only.

## Follow-up Fix

- [x] Reproduced stale legacy `fileUrl` missing-source failure with a new Rust test.
- [x] Added unique-basename fallback source resolution for stale old folder paths.
- [x] Verified the regression and broader Unit Model test set.
