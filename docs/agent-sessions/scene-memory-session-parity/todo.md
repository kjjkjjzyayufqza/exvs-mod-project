# Scene Memory Session Parity

## Current Objective

Continue executing `.claude/prds/scene-memory-session-parity.prd.md`.

## Status

- [x] Read `AGENTS.md`, `.cursor/rules/custom-rules.mdc`, PRD, and relevant scene docs.
- [x] Confirm current worktree already contains delete-lifecycle work for PRD Milestone 3.
- [x] Milestone 1 implementation: in-memory Properties parity for unsaved imported SSBH models.
- [x] Milestone 2 implementation: in-memory texture rendering parity for unsaved imported SSBH models.
- [x] Run targeted automated verification.
- [x] Add automated coverage for import texture reference resolution and real DAE memory preview bundle construction.
- [x] Preserve separate Maya/Nust material profile JSON for in-memory import preview bundles.
- [x] Add hook-level Properties parity coverage proving imported memory bundles do not read `.numdlb/.numatb` from disk.
- [x] Add hook-level texture loader coverage proving disk-resolved `.nutexb` paths in memory import bundles use disk texture IPC, not memory texture IPC.
- [x] Add backend coverage proving preview bundle construction resolves disk textures without materializing unsaved SSBH files to stage/source folders.
- [x] Check local real-asset availability for manual texture parity QA.
- [x] Update PRD/session handoff notes.
- [ ] Manual QA with a real DAE + valid numatb/nutexb set: compare pre-save viewport/Properties with post-save reload.

## Next Actions

1. Provide or restore a real stage root plus matching `.nutexb` textures. Current local checks found `D:\output\exvs2\zabanya\*.dae`, but no `.nutexb`, and `E:\XB\解包\com\test\0x4D1F5138\0\0` is missing.
2. Run manual parity QA with real assets.
2. If manual QA passes, update PRD Milestones 1 and 2 from `in-progress` to `complete`.
