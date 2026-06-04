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
- [x] Research native source of `sys_41` / `0x700000` action records enough to
      identify the file-side source:
      `Param/chrsysparam.csyspm` (`0xB4ACACAF`, version `0x10000`) table0.
- [x] Confirm concrete 59001001 pairing:
      `Msc=0x693F756D`, `Param=0x38C44F75`, unit id/header `0x038448A9`.
- [x] Confirm `0x38C44F75/chrsysparam.csyspm` table0 layout:
      marker `0xA8BBBAB9`, `55 x 128` u32 matrix; table1 marker
      `0xA8BAA9BA`, `1 x 1`.
- [x] Record subtable header correction for `chrsysparam.csyspm`:
      each subtable has a 16-byte header and matrix data starts at
      `subtable_offset + 0x10`, not `+0x0c`.
- [x] Record parser correction: current `chrsysparam.rs` flat 20-byte-entry
      parser is not the large action-table layout.
- [x] Analyze `chrsysparam.csyspm` action matrix field semantics needed for first-pass auto rename.
      Confirmed fields: `0x2e` action hash, `0x0a` group key,
      `0x03` base category/type, `0x04` input/category refinement,
      `0x02/0x7c/0x7d` phase callback keys.
- [x] Map `0x38C44F75/chrsysparam.csyspm` rows to
      `0x693F756D/2.c func_873()` callback functions.
- [x] Compare user-provided old EXVS1-style MSC
      `G:\1. Gundam - 1011.c` against the new `chrsysparam.csyspm`
      evidence. Conclusion: old MSC embeds the same B4AC/action row-field
      model with `sys_2D/sys_2C`; new MSC reads the external matrix via
      `0x700000` syscalls.
- [~] Verify old fixed gameplay label alignment from `0x693F756D/0.c func_144()` and
      action matrix fields, not from a dictionary.
      Current status: computed categories are derived and exported. Old EXVS1
      comments confirm category bit `0x1` as Shooting and bit `0x2` as Melee.
      Higher category bits remain unnamed; exact Sub/Special Shot/Special Melee
      alignment still needs `sys_41` input-selection or native/runtime
      verification.
- [ ] Design storage-backend abstraction for action rows:
      embedded B4AC table (`sys_2D/sys_2C`) vs external
      `Param/chrsysparam.csyspm` matrix, with one shared row-evidence output.
- [~] Design structured editable export/import for `chrsysparam.csyspm`
      action rows so future MSC edits can update action metadata without
      manual binary editing. Must preserve unknown fields and round-trip
      unchanged rows exactly.
      New evidence: this must include table1 transition rows and table0
      `0x7e/0x7f` transition ranges, not only table0 action rows.
      Current progress: `tools/research_chrsysparam_human_export.py` exports
      a human-readable research JSON with table metadata, known semantic
      fields, duplicate action-hash candidates, and full raw cells. This is
      not yet an editable round-trip writer.
- [x] Define edit classification rules for MSC workspace:
      safe MSC-only callback edits vs paired action-metadata edits that require
      `chrsysparam.csyspm` export/rebuild.
      Current boundary recorded: callback-body/symbol rename edits are usually
      MSC-only; action rows, hashes, groups, route/flag fields, and phase
      callback keys require paired `Msc + Param` support. Latest clarification:
      function auto-renaming is tooling-only and does not require Param edits;
      adding/deleting/rekeying/moving actions or changing derived/transition
      metadata does.
- [x] Draft the auto-rename design contract:
      `resource list -> Msc/Param pair -> chrsysparam action row -> group resolver -> callback`.
- [x] Record key design answer: `chrsysparam.csyspm` can implement a new
      equivalent of old `0.c -> helper -> 2.c` rename, but only as
      row-evidence naming until category labels are verified.
- [~] Parse/confirm `0x700002` route field semantics for groups.
      Current status: confirmed subfield `0` returns a small route/side/state
      enum and subfield `1` returns a flags bitmask consumed by `0.c func_95()`
      and `2.c func_81()`. Strong new evidence from old embedded B4AC
      `func_786()` suggests overlapping groups derive route/flags from
      fields `0x0a`, `0x03`, `0x2c`, and `0x6e`, not primarily
      `0x1c..0x22`. Still unresolved: native confirmation and rules for
      new-only groups `0x0f`, `0x13`, `0x25`, `0x26`, `0x27`, `0x28`,
      `0x29`.
- [x] Implement a local research helper for first-pass `0x700002` emulation:
      apply the old `func_786()` formula to parsed `chrsysparam` rows and
      report route/flags plus unsupported groups.
- [x] Implement a row-evidence report helper:
      `tools/research_chrsysparam_action_report.py` joins
      `chrsysparam` table0/table1, `2.c func_873`, `2.txt` function pointers,
      and `2.c func_975` phase callbacks.
      Extended with `--mode derived` to report `0x700003` source slot, delay,
      target action row, target group/callback, target `field_0x04` schedule
      mask, and target `field_0x06`.
      Correction: derived slot delays come from fields `0x59..0x62`; field
      `0x58` is separate, not slot 0 delay.
- [x] Confirm table1 transition linkage:
      table0 fields `0x7e/0x7f` are zero-based ranges into table1; `2.c`
      adds `1` before iterating through `func_962()` / `func_963()`.
- [x] Confirm groups `0x27/0x28/0x29` are phase-driven, not empty:
      `func_873()` returns `0`, but fields `0x02/0x7c/0x7d` still resolve to
      real phase callbacks through `func_975()`.
- [x] Confirm first-pass `0x700003` semantics:
      checked `0x38c44f75` and `0x31a97fd4`; every nonzero derived key in
      table0 fields `0x30..0x39` resolves to a table0 action hash in
      field `0x2e`. Current model:
      `0x700003(actionHashKey, 1 << global143) -> table0 row index`.
- [x] Add old embedded B4AC derived-link report helper:
      `tools/research_old_b4ac_action_report.py` parses old
      `sys_2D(0x3,row,field,value)` rows and confirms the same derived-link
      model in `G:\1. Gundam - 1011.c`.
- [x] Correct derived delay field mapping:
      keys are `0x30..0x39`, per-slot delays are `0x59..0x62`; field `0x58`
      is separate, not slot 0 delay.
- [x] Record old/new `field_0x04` schedule encoding difference:
      old uses `0x00/0x08/0x04/0x02/0x01/0x10..0x16`; new uses
      `0x00/0x04/0x08/0x10/0x20/0x40..0x46` for the same schedule masks.
- [x] Add human-readable `chrsysparam` research exporter:
      `tools/research_chrsysparam_human_export.py` emits
      `research.chrsysparam.human.v0` JSON. It preserves full raw `u32` rows
      while exposing known action, callback, phase, derived, and transition
      evidence.
- [x] Add project-level human-readable MSC + Param bundle exporter:
      `tools/research_msc_project_human_bundle.py` emits
      `research.msc_project.human_bundle.v0` JSON with unit/resource identity,
      MSC resolver evidence, embedded Param evidence, action summaries,
      function candidate labels, and unresolved rows.
- [x] Add safe computed-category evidence to human-readable exports:
      `computed_category` follows new `0.c func_144()` field `0x03/0x04`
      logic; category bit `0x1` is recorded as shooting evidence and bit
      `0x2` as melee evidence, while higher bits remain unnamed.
- [x] Scan local `chrsysparam.csyspm` files for duplicate action hashes:
      7 files checked under `E:\XB\解包\com\file`; only 2 contain large
      action tables, and both have unique nonzero action hashes
      (`0x31a97fd4` has `71/71`, `0x38c44f75` has `54/54`).
- [x] Record current native-research boundary:
      IDA MCP tools are not exposed in this Codex session, so no native
      `0x700003` handler result has been claimed.
- [ ] Confirm duplicate-key / variant selection behavior for `0x700003`.
      Current samples prove key-to-row lookup but not how native chooses when
      multiple rows share the same action hash key. Local scan found no
      duplicate-key sample, so this likely needs either more Param samples or
      native `0x700003` reverse work.
- [x] Decide first-pass UI naming fallback:
      use evidence-shaped labels such as `ACTION_ROW_003_CAT_0B_GROUP_03` and
      `ACTION_ROW_012_CAT_1F_GROUP_27_PHASE_0`. Do not emit exact
      `ACTION_SUB` / `ACTION_SPECIAL_SHOT` / `ACTION_SPECIAL_MELEE` names until
      category higher-bit semantics are verified.
