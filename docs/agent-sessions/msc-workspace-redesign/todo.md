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
- [ ] W1.6 Add a per-project `symbols.json` (persisted, user-editable name overrides) + merge order.
- [ ] W1.7 Integrate CRC32 reverse-search (existing tool plan) to recover names from action hashes.

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
Begin with Workstream 1 (W1.1 -> W1.3) because auto-naming is the highest-value user-visible gap.
W2/W3 depend on W1's persisted `symbols.json` contract. Confirm phase order with user first.
