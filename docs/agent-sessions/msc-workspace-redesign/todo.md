# Todo: MSC Workspace Reverse-Packing & Mod-Dev Redesign

Status legend: [ ] pending, [~] in progress, [x] done, [-] dropped

## This session (planning only)
- [x] Audit `MscWorkspaceView` + `mscWorkspaceUtils` + `mscActionRename`.
- [x] Audit Python toolchain naming path (`mscdec.py`, `xml_info.py`, `exvs_native_truth.py`).
- [x] Cross-check 20 problems in `msc-system-problems-analysis.md` against current code.
- [x] Diagnose standard-vs-new MSC function auto-naming gap.
- [x] Write `plan.md`, `process.md`, `todo.md`.
- [ ] Get user confirmation on phase ordering before any implementation.

## Implementation backlog (from plan.md; do NOT start until confirmed)

### Workstream 1 - Symbol resolution unification (enables auto-naming)
- [ ] W1.1 Add `script_file_id` auto-detection from folder name + MSC header.
- [ ] W1.2 Replace hardcoded mapping path with per-script mapping lookup + graceful "no mapping" path.
- [ ] W1.3 Populate `script_functions` offset->symbol table for `0xF1EF3B32` (reference char).
- [ ] W1.4 Ship a `tools/mscinfo.xml` (or `--xmlPath` per project) and wire `--assumeCharStd` from UI.
- [ ] W1.5 Generalize `mscActionRename` to discover the action-router function; complete the mask table.
- [ ] W1.6 Design a dynamic action-mapping artifact/report for each MSC project.
      It should record traced evidence, not act as an `action_hash -> name` dictionary.
- [ ] W1.7 Research where new-version action hashes are recorded, if anywhere.
      Current state: no complete action-hash name file has been found; user rejects dictionary fallback.
- [ ] W1.8 Wire kind-7 label decoding into the parser/UI path for
      `action_label_offset` / `resource_label_offset` in
      `armsparam` / `characterparam` / `speedparam`.
      Research result: the pointed records decode correctly with the existing
      `obf_string` transform (same family as `characterlist`), e.g.
      `GUN_...`, `CHR_...`, `ORDER_*`, `SKL_MOVE*`.

### Workstream 2 - Workflow / pipeline redesign
- [x] W2.1 Folder persistence (already handled by parent `mscWorkspaceFolderPath` in MainView).
- [x] W2.2 Batch "Decompile All" / "Repack All" with per-stage progress (frontend orchestration of
      existing `mscdec`/`msclang` commands; sequential 0 -> 1 -> 2 so 2.c sees 0.c).
- [ ] W2.3 Round-trip verify: recompile then byte-compare vs original; report first divergence.
      (Deferred: needs a backend compare command.)
- [~] W2.4 Pipeline visualization: shipped `MscPipelineBar` (per-slot SRC/C state). Full
      Extract -> Decompile -> Name -> Edit -> Recompile -> Pack strip deferred (Edit/Recompile
      states are not filename-distinguishable without backend metadata).
- [ ] W2.5 In-app `.c` preview + diff; make external editor optional/configurable (drop hard `cursor`).

### Workstream 3 - UI/UX redesign (Dark Industrial, design-taste principles)
- [x] W3.1 Replaced flat gray `BUTTON_STYLES` with semantic Button variants (locked `primary`
      accent, `secondary`/`outline`/`ghost`), one radius scale, mono for paths/filenames/percent.
- [ ] W3.2 3-region layout: file/pipeline rail | symbol table + preview/diff | inspector.
      (Deferred: symbol table + diff need the naming/verify backend.)
- [ ] W3.3 Symbol table view with name-source badges and inline rename. (Deferred: needs W1.)
- [x] W3.4 Batch progress bar + grouped dense file list + skeleton loading + composed empty/error.

### Implemented this session (current branch, UI-only, no backend changes)
- CREATE `src/page/TestEditor/components/msc-editor/mscPipeline.ts` (pure helpers + tests).
- CREATE `src/page/TestEditor/components/msc-editor/mscPipeline.test.ts` (7 tests, passing).
- CREATE `src/page/TestEditor/components/msc-editor/MscPipelineBar.tsx`.
- CREATE `src/page/TestEditor/components/msc-editor/MscFileRow.tsx`.
- REWRITE `src/page/TestEditor/components/msc-editor/MscWorkspaceView.tsx`.
- Verified: `tsc --noEmit` clean for these files (pre-existing SceneEdit errors unrelated);
  `vitest run mscPipeline.test.ts` 7/7 pass; zero em-dashes.

### Workstream 4 - Cleanup / debt
- [ ] W4.1 Remove dead `src/page/MSCEdit/*` after parity is reached.
- [ ] W4.2 Remove deprecated `tools/mscdec_msc.py` + `tools/msclang_msc.py`.
- [ ] W4.3 Add round-trip regression tests for known-good scripts.
- [ ] W4.4 Quiet/route debug output behind a verbosity flag.

## Next agent starts here
Begin with Workstream 1 because auto-naming is the highest-value user-visible gap.
Use a dynamic mapping/report contract, not a dictionary contract. Confirm phase order with user first.

## 2026-06-02 follow-up: new MSC action auto-rename brainstorming
- [x] Re-read root `AGENTS.md`, Cursor rule, and brainstorming skill.
- [x] Re-read existing MSC workspace redesign session notes.
- [x] Verify current code path for `MscWorkspaceView` -> `renameScript2CallbacksByActionMask`.
- [x] Re-check old common sample `0xF1EF3B32` and new per-unit sample `0x693F756D`.
- [x] Confirm current repo still lacks `tools/crc32_reverse_search.py` and has empty `script_functions`.
- [x] Record user correction: dictionary-based action-hash naming is rejected.
- [x] Extract `0.c` action slot table and selector table for `0x693F756D`.
- [x] Extract `2.c` two-level action graph for `0x693F756D`.
- [x] Check current Codex tool exposure for IDA MCP; no IDA tools/resources are visible in this session.
- [x] Cross-scan local `2.c` action graphs under `E:\XB\解包\com\file`.
- [x] Confirm the `0.c` action-slot table is stable across all checked `0.c` samples.
- [x] Identify new `2.c` dynamic action-record registration from `0x700000`:
      `0x700001` count -> `0x700000` field `0x2e` action hash ->
      field `0xa` group resolver -> `func_241(actionHash, callback)`.
- [x] Identify record reverse/phase tables:
      `0x10002,0x1f` actionHash->recordIndex and
      `0x10001,0x10/0x11/0x12` record phase callbacks from fields
      `0x2/0x7c/0x7d`.
- [x] Confirm raw resolver constants in `0x693F756D` decode with `+0x30`
      to script function entry pointers.
- [~] Research native source of `sys_41` / `0x700000` action records.
- [ ] Use IDA to find the native loader/backing file for
      `0x700000` / `0x700001` / `0x700002`.
      Current blocker: IDA Pro MCP is reportedly connected, but no IDA tools are
      exposed in this Codex session.
- [ ] Propose naming-source approaches and get user approval before writing a design spec.
