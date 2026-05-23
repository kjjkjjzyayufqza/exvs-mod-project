# FHM2D FileIndex Debug Process

## Goal

Diagnose and fix the severe FHM2D repack bug where packing back to `.fhm2d`
loses `fileIndex` information. The primary real-data target is:

- `E:\XB\解包\com\test\16F73C97.fhm2d`
- `E:\XB\解包\com\test\16F73C97\0\0`
- `E:\XB\解包\com\test\0x16F73C97_structure.json`

## Constraints

- Do not run the Tauri dev server.
- Use Rust tests and backend code paths for reproduction.
- Preserve existing user changes in the working tree.
- Find root cause before applying fixes.

## Startup Context

- Read `AGENTS.md`.
- Read `.cursor/rules/custom-rules.mdc`.
- Read `docs/superpowers/plans/2026-05-13-stage-fhm2d-in-memory-import.md`.
- Read `docs/superpowers/plans/2026-05-13-stage-import-progress-and-debug.md`.
- Read `docs/superpowers/plans/2026-05-21-scene-editor-save.md`.
- Read `docs/agent-sessions/scene-dae-ssbh-save/process.md`.
- Loaded systematic debugging and Rust testing guidance.

## Investigation Log

- The user reports that any pack back to FHM2D drops `fileIndex` information.
- Requested reproduction path: unpack `16F73C97`, pack `16F73C97`, and exercise Scene Editor style object copy/add/delete DAE -> SSBH -> HKT operations through Rust test code.
- `E:\XB\解包\com\test` exists and contains `16F73C97.fhm2d`, `16F73C97_structure.json`, and `0x16F73C97_structure.json`.
- `16F73C97_structure.json` has 65 `SubFileData` entries; `0x16F73C97_structure.json` has 41 `SubFileData` entries and a non-sequential `SubFileStructure` item order.
- Existing ignored raw FHM2D pack roundtrip test passes for 41 raw files, so the basic packer can preserve raw data when fed the raw structure.
- Added `test_rebuild_structure_preserves_fileindex_links_after_stage_extract`.
- RED result: `cargo test test_rebuild_structure_preserves_fileindex_links_after_stage_extract -- --nocapture` fails because `rebuild_structure_json_for_stage` rejects preservation with `File count mismatch: 41 referenced vs 65 on disk`, falls back to full rebuild, and writes 65 unique `SubFileData` entries.

## Current Hypothesis

Stage extraction materializes linked `SubFileStructure` items as multiple disk paths for editor convenience. Those paths can share the same original `fileIndex`. The rebuild path currently compares raw disk packable file count against `SubFileData` count, treats linked duplicate paths as new files, and falls back to full rebuild. Full rebuild assigns fresh sequential `fileIndex` values, destroying the original linked topology.

## Implementation

- Updated `try_preserve_original_structure` so a disk file count greater than `SubFileData` count no longer forces full rebuild by itself.
- Added packable-file collection and content signatures `(extension, length, crc32)` for link detection.
- Extra disk files are accepted only when each one matches an already referenced file signature, meaning they are materialized linked paths rather than new content.
- If any extra file is not a linked duplicate, the code still falls back to full rebuild so newly added files are not silently omitted.
- Added regression coverage for preserving linked `fileIndex` topology after stage extraction.
- Updated existing roundtrip tests to distinguish internal FHM2D `SubFileData` count from materialized disk path count.

## Verification

- RED before fix:
  - `cargo test test_rebuild_structure_preserves_fileindex_links_after_stage_extract -- --nocapture`
  - Failed with `File count mismatch: 41 referenced vs 65 on disk`, then full rebuild produced 65 `SubFileData` entries.
- GREEN after fix:
  - `cargo test test_rebuild_structure_preserves_fileindex_links_after_stage_extract -- --nocapture` -> passed.
  - `cargo test test_full_repack_roundtrip_16f73c97 -- --nocapture` -> passed.
  - `cargo test test_clone_object_only_modifies_placement_then_repack -- --nocapture` -> passed.
  - `cargo test test_delete_object_folder_then_repack -- --nocapture` -> passed.
  - `cargo test format::fhm2d_stage::tests -- --nocapture` -> passed, 50 tests.
- `ReadLints` on `src-tauri/src/format/fhm2d_stage.rs` and `src-tauri/src/format/fhm2d_stage_test.rs` -> no linter errors.
- Attempted to run `code-reviewer` subagent, but Cursor returned an unpaid invoice error, so no subagent review could be completed.

## Notes

- This fix covers no-op/CSV-only/object-copy style repacks where extra disk paths are linked materializations of existing internal files.
- When genuinely new files are present, the current fallback still rebuilds from disk. A future improvement should merge original linked topology with newly added files instead of doing a full rebuild, especially for full DAE -> SSBH -> HKT additions.
