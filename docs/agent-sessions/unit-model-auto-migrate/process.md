# Unit Model Auto Migrate Process

## Goal

When the user opens an existing Unit Model folder, automatically detect whether it
is already using the current folder layout. If it is an older flat extract and has
a valid Unit `_structure.json`, prompt before migrating it to the current
`models/`, `textures/`, `nuhlpb/`, `weapon_icon/`, `ragdoll/`, and `nudnbb/`
layout.

## Context Read

- `AGENTS.md`
- `.cursor/rules/custom-rules.mdc`
- `docs/agent-sessions/unit-model-editor/implementation-plan.md`
- `docs/agent-sessions/unit-model-editor/process.md`
- `docs/agent-sessions/unit-model-editor/dynamic-folder-pipeline-plan.md`
- `docs/agent-sessions/unit-model-fbx-import/process.md`

## Findings

- Current `.fhm2d` extraction already writes the current Unit Model layout.
- Older local samples such as `0xAF73362C` are flat folders with sibling
  `_structure.json`; their `SubFileData.fileUrl` values point directly to
  `.\<root>\<file>`.
- The preview loader recursively lists `.numdlb` files under the selected root.
  Leaving old flat `.numdlb` files after migration would make duplicate models
  likely, so migration should remove old referenced files after the new copies
  and structure JSON are committed.
- `SubFileStructure` is already the authoritative tree. Migration should not
  rebuild or reorder it; only physical file placement and `SubFileData.fileUrl`
  need to change.

## Implementation Notes

- Added `unit_model_migrate.rs`.
  - `analyze_unit_model_folder_migration` is read-only and returns
    `notUnit`, `current`, or `legacy`.
  - Only `Magic=10` structures with parseable `SubFileData` and
    `SubFileStructure` are considered migratable.
  - Desired file URLs are derived from the same role rules used by the current
    Unit extract layout: model files under `models/<model>`, normal textures
    under `textures`, icons under `weapon_icon`, helper tables under `nuhlpb`,
    and other companion groups under their group folders.
  - `migrate_unit_model_folder_layout` performs preflight, copies files, writes a
    backup structure JSON, replaces the structure JSON, then removes legacy
    referenced files.
- Added `unitModelMigrationService.ts`.
- `useUnitModelWorkspace.pickUnitFolder` now runs analyze before loading:
  - current/non-Unit folders load as before;
  - legacy Unit folders show a Tauri confirmation dialog;
  - confirming runs migration and then loads the migrated root.

## Verification Log

- `cargo test unit_model_migrate --lib`
  - Passed: 3 tests.
  - Includes generated legacy fixture migration and a path-gated read-only check
    against local sample `E:\XB\解包\com\file\0xAF73362C`.
- `cargo test unit_model --lib`
  - Passed: 20 tests.
  - Covered Unit validate, textures, model add/import, and migration tests.
- `cargo check`
  - Passed.
  - Existing warnings only: `unit_model_extract.rs` dead field and
    `debug_hkt_to_obj.rs` unused import/variable.
- `npx vitest run src/page/UnitModelEdit/utils`
  - Passed: 6 files, 20 tests.
- `npx tsc --noEmit --pretty false`
  - Blocked by unrelated existing errors in:
    `sceneDaeSessionImport.test.ts`, `sceneModelReplacePreview.test.ts`, and
    `stageRegistrySync.test.ts`.
- `git diff --check`
  - Passed with line-ending warnings only.

## 2026-06-14 Stale Legacy `fileUrl` Follow-up

### Reported Failure

- User reported migration failure:
  `Referenced source file is missing and no migrated copy exists: E:/0xa258a522/delatkai_body/026gnbelt_003delatkai_001.nusktb`

### TDD Fix

- The requested `$tdd` skill file was not present under the project `.agents/skills`
  folder in this runtime, so the fallback was explicit red-green TDD.
- Added failing regression test:
  `migrate_falls_back_to_unique_root_file_when_legacy_file_url_is_stale`.
- The test models a legacy Unit `_structure.json` whose `SubFileData.fileUrl`
  points to an old per-model subfolder (`.\root\delatkai_body\file.nusktb`) while
  the actual file is in the selected root folder.
- Fixed migration planning to resolve a missing legacy source path by searching
  the selected Unit root for a unique file with the same basename.
- If exactly one fallback file is found, migration uses it as the copy source and
  records a warning.
- If multiple fallback files with the same basename are found, migration stops
  with an explicit ambiguity error instead of guessing.

### Verification

- `cargo test migrate_falls_back_to_unique_root_file_when_legacy_file_url_is_stale --lib`
  - Failed before the fix with the same missing-source-path error.
  - Passed after the fix.
- `cargo test unit_model_migrate --lib`
  - Passed: 4 tests.
- `cargo test unit_model --lib`
  - Passed: 21 tests.
- `cargo check`
  - Passed with existing warnings only.
- `git diff --check`
  - Passed with line-ending warnings only.
