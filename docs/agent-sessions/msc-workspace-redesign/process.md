# Process: MSC Workspace Reverse-Packing & Mod-Dev Redesign

> Session created per AGENTS.md startup protocol. This file records context, evidence,
> and decisions. The deliverable is `plan.md` (planning only, no code changes in this session).

## Task Framing

User request (mod-developer perspective):
1. Analyze the TestEditor MSC workspace.
2. Optimize the whole reverse-engineering / repacking logic and the mod-development workflow.
3. Redesign UI/UX using `design-taste-frontend` principles, possibly redesigning flow and buttons.
4. Review prior agent work, `todo.md`, `process.md`, and `AGENTS.md` for unfinished items.
5. Specifically: for the "standard-version MSC" and the "new-version MSC", determine what is
   missing to enable **function auto-naming**.
6. Output: a plan markdown file only. Do not change code.

## Design Read (design-taste-frontend Section 0.B)

Reading this as: a redesign of a dense desktop tool surface (MSC reverse-engineering workspace
inside a Tauri IDE-like app), for an expert single-user mod developer, with a Dark Industrial
language, leaning toward the project's existing shadcn/ui + Tailwind + Slate/Zinc + Blue-500
direction (redesign-preserve mode).

Skill scope note: `design-taste-frontend` Section 13 explicitly excludes dashboards / dense
product UI / code editors / multi-step wizards. The MSC workspace is exactly that class, so the
landing-page parts of the skill do not apply. The transferable principles that DO apply and are
used in the plan: visual hierarchy via scale/weight (not uniform gray), single locked accent,
shape-consistency lock, motivated-motion-only, full loading/empty/error states, icon-family
discipline, button contrast, and high `VISUAL_DENSITY` with mono type for hex/offsets.

## Evidence Gathered (codegraph + reads)

### Frontend: `src/page/TestEditor/components/msc-editor/MscWorkspaceView.tsx`
- Pick-folder gate: folder must contain >=1 `.bscex/.cscex/.dscex` (`folderContainsMscScriptFiles`).
- File-list card UI. Per-extension actions in `createFileActions`:
  - `.bscex/.cscex/.dscex` -> **Convert** (opens confirm dialog, runs `mscdec.py`).
  - `.c` -> **Open Cursor**; for `0.c/1.c/2.c` also **Repack** (`msclang.py`); for `2.c` also **Rename Actions**.
  - `.txt` -> **Open Cursor**.
- **Convert** (`handleConvertScriptToC`) runs:
  `mscdec.py <in> -o <out.c> -log <out.txt> --exvsMapping <hardcoded 0xF1EF3B32 json>`.
  - For `2.c`: auto `renameScript2CallbacksByActionMask(0.c, 2.c)` + `func_0 -> main`.
  - For `0.c/1.c`: `func_0 -> main` only.
  - **Never passes `--assumeCharStd` or `--xmlPath`.**
- **Repack** (`handleRepackCToScript`) runs `msclang.py <in.c> -o <out> -i --exvsMapping <0xF1EF3B32>`.
- **Repack Folder** invokes Tauri `repack_fhm2d` with `<folder>_structure.json` -> `<folder>.fhm2d`.
- `resolveExvsMappingPath()` is **hardcoded** to `tools/mappings/exvs_0xF1EF3B32.native_truth.json`.
- `handleOpenInCursor` shells out to `cursor <file>` (hard dependency on external editor).
- Buttons: `BUTTON_STYLES` are all `bg-gray-{500..900}` -> no hierarchy, all actions look equal.
- Icons from `lucide-react`. No workspace persistence (folder selection is React state only).

### Naming helper: `src/page/TestEditor/utils/mscActionRename.ts`
- `ACTION_BY_MASK`: only **12** known masks (0x1..0x800).
- Parses `0.c` `func_143` body, walks if/else stack, reads `global48 & MASK`, `global20 & 0x4000`,
  `global2 & 0x3c`, `sys_0(0x90000,0)` to synthesize `ACTION_*` callback names.
- Renames `2.c` callbacks bound via `func_241(0xHASH, callback)`.
- **Hardcoded** to `func_143 / func_95 / func_241 / global48 / global20 / global2`.

### Toolchain (Python `tools/`)
- `mscdec.py` `from msc_core import *` (unified core in use). Disasm via `disasmlib.disasm(use_cfg=True)`.
- Function naming in `mscdec.py main()`:
  - sequential `script.name` (`func_N`), entrypoint script renamed to `main`.
  - `--assumeCharStd` -> pulls names from `xmlInfo` (`funcNames[f.id] = f.name`, plus global names).
  - native-truth symbolization: `_walk_and_symbolize_exvs_native_truth` -> `decode_symbol_from_value`.
- `tools/xml_info.py getXmlInfoPath()` looks for `%LOCALAPPDATA%\mscinfo.xml` or `tools/mscinfo.xml`.
  **No `mscinfo.xml` exists in the repo** (glob `tools/**/*.xml` -> none). So `--assumeCharStd` has no data unless the user supplies one.
- `tools/exvs_native_truth.py`: `function_ref` decode uses `functions_by_offset` built from
  `script_functions`. In the only mapping file, `script_functions: []` is **empty** -> function_ref
  naming emits nothing. `script_delta` rules only relocate offsets (compile correctness), not names.
- Only ONE mapping exists: `tools/mappings/exvs_0xF1EF3B32.native_truth.json`.
- Legacy cores `mscdec_msc.py` / `msclang_msc.py` still present in `tools/` but deprecated by AGENTS.md.

### Status of the 20 problems in `docs/msc-system-problems-analysis.md`
- RESOLVED: #1/#16 dual cores + magic (unified `msc_core`), #2 `0x2E->0xAE` binary patch (gone;
  only `magic[0x0D]=0xAE` header byte remains), #3 loop detection (CFG via `msc_cfg.py`, `use_cfg=True`).
- STILL OPEN: #5 duplicate UI (`src/page/MSCEdit/*` still exists), #6 hardcoded paths (mapping +
  `cursor`), #7/#8 type/float heuristics, #12 no round-trip tests, #15 regex switch-case
  (`convert_if_else_dispatchers_to_switch` still post-processes the `.c`), #17 global state,
  #18 mixed debug output, #20 no workspace persistence.

## Key Conclusion: Standard vs New MSC function auto-naming

There are four naming mechanisms; none is fully wired for a "new" (non-`0xF1EF3B32`) script:
1. Sequential `func_N` + `main` (always on).
2. Standard-lib XML (`--assumeCharStd` + `mscinfo.xml`/`--xmlPath`): the real "standard-version"
   auto-naming. **Dormant**: UI never passes it and no `mscinfo.xml` ships.
3. Native-truth mapping (`--exvsMapping`): `script_functions` empty -> no symbol names; only one
   mapping exists and it is hardcoded. `script_delta` rules only fix offsets.
4. Action-mask rename (TS): hardcoded func numbers + 12 masks; tuned to `0xF1EF3B32` layout.

So a "new MSC" gets only `func_N` + `main`, because: no per-script mapping, empty
`script_functions`, no `mscinfo.xml`, hardcoded mapping path, hardcoded action router, no
`script_file_id` auto-detection, and no IDA ground-truth extraction has been run for new
characters (workflow doc scoped it to `0xF1EF3B32` "first").

## Decisions
- Treat the redesign as redesign-preserve, aligning to the existing
  `docs/superpowers/specs/2026-05-11-test-editor-redesign-design.md` (Dark Industrial, tiling).
- Make **symbol resolution a first-class, inspectable, persisted stage** rather than scattered
  post-processing across Python + TS.
- Make the workflow **project-centric and batch-driven** instead of per-file manual clicks.

## Implementation Log (UI redesign, current branch)

Scope: Plan Workstream 3 (UI) + the frontend-orchestratable parts of Workstream 2. No Python or
Tauri-command changes (auto-naming backend, round-trip verify, and the symbol table are deferred
because building UI for a non-existent backend would be incomplete/placeholder code).

Design dials: VARIANCE 4 (structured), MOTION 2 (state feedback only), DENSITY 7 (cockpit, mono
for hex/offsets). design-taste-frontend Section 13 marks this surface (dense tool UI) out of scope
for the landing-page rules; only transferable principles applied.

Changes:
- New `mscPipeline.ts`: pure file-role classification, per-slot pipeline status, grouping, and a
  leading-index comparator. Fully unit-tested (`mscPipeline.test.ts`, 7 tests).
- New `MscPipelineBar.tsx`: 3 pack-slot chips with semantic SRC/C presence flags (real state, not
  decoration). New `MscFileRow.tsx`: dense row with semantic action-button variants.
- Rewrote `MscWorkspaceView.tsx`:
  - Semantic button hierarchy replaces the all-gray `BUTTON_STYLES`. Primary = pipeline-advancing
    (Convert / Repack / Decompile All / Repack All); secondary = Rename Actions / Repack .fhm2d;
    ghost = Open; outline = Pick folder.
  - Batch "Decompile All" / "Repack All" orchestrate the existing per-file `mscdec`/`msclang`
    commands sequentially (0 -> 1 -> 2 so 2.c rename sees a freshly written 0.c), with a progress bar.
  - Unified confirm dialog (convert-one / decompile-all / repack-all) with overwrite warnings.
  - Unfiltered `allFiles` fetch + memoized filter/group/slots (fixes re-fetch-per-keystroke and
    makes batch targets + pipeline state independent of the active search filter).
  - Grouped dense `divide-y` list (Source scripts / Decompiled C / Logs / Other), skeleton loading,
    composed empty state, toast errors.
  - Preserved behavior: action-mask rename for 2.c, func_0 -> main, Repack Folder (`repack_fhm2d`),
    external-editor open, hardcoded `0xF1EF3B32` mapping path (unchanged; addressed by W1 later).

Verification: `pnpm exec tsc --noEmit` reports zero errors in msc-editor files (11 pre-existing
errors live in `src/page/SceneEdit/*`, unrelated uncommitted work). `vitest run` 7/7 pass.
Did not start a dev server (per project rule).

## Research Log (new-style MSC sample `0x693F756D`)

Goal: continue the auto-rename investigation with a concrete per-unit "new MSC" sample and its
paired param bundle:

- MSC: `E:\XB\解包\com\file\0x693F756D`
- param bundle: `E:\XB\解包\com\file\0x38C44F75`

Key findings:

- `0.c func_143()` in this sample is **not** the old `global48 & MASK` router. It now uses
  `sys_41(...) -> func_144(...) -> func_145(...)`, so the legacy `mscActionRename.ts` structural
  assumptions do not apply.
- `2.c func_1219()` registers 28 action hashes with `func_241(hash, callback)`.
- Most action callbacks do **not** directly spawn projectiles. Instead:
  - action callback -> `func_69(slot)`
  - `func_69(slot)` executes `sys_0(0x10001, 0x2, slot)` from the slot-callback table populated by
    `func_1220()`
  - those slot callbacks often call `func_74(slotB, delay)`, which resolves a second table
    populated by `func_1221()` (`sys_1(0x10001, 0x3, slotB, hash)`)
- The `0x10001,0x3` slot-hash table contains 38 unique hashes in this sample, and **none** of them
  appear in the paired param bundle. Therefore that table is internal script-side routing/state
  data, not the external ammo file.
- The external param bundle appears later as **resource semantics**:
  - `func_1158()` directly uses six `bulletparam.bin` entry hashes plus one
    `interactionid.bin` hash
  - other functions use `chrsysparam.csyspm` hashes
  - example chain: `0x900ab393 -> func_482 -> func_69(0x35) -> func_1158`
- `parse_command_table_file()` currently does not decode kind-7 strings. It returns raw `u32`
  offsets and leaves `valueString = None`.
- `armsparam.rs`, `characterparam.rs`, and `speedparam.rs` all define two shared kind-7 fields:
  `action_label_offset` and `resource_label_offset`.
- In sample `armsparam.bin`, those kind-7 values are **absolute file offsets** into the trailing
  blob area.
- Additional label-blob structure findings from the current extracted param corpus
  (`7` arms files, `7` character files, `7` speed files under `E:\XB\解包\com\file`):
  - `resource_label_offset` always points to a `0x1C` record with stable head
    `83 9F 86 0A` and stable tail `42 FC 19 00`
  - `action_label_offset` records are family-typed:
    - arms: `8B AA 36 0A...`
    - character: `8F A7 22 EA...`
    - speed: `A3 96 32 0A...`
  - all valid pairs satisfy `action_label_offset < resource_label_offset`
  - in `armsparam`, same-entry action/resource label records share bytes `4..26` exactly;
    only the 4-byte head differs and the action record continues with an extra tail before `00`
  - the exact sample resource-label blob from `0x38C44F75` appears only in
    `armsparam.bin` / `characterparam.bin` / `speedparam.bin` of that same bundle, and was not
    found by byte-scan in `vs2\x64/010localizedtext`, `020common`, or `100system`
  - decoder breakthrough: these records decode correctly with the same `obf_string`
    transform already used by `characterlist`, starting from byte 0 of the record
  - batch validation decoded `100%` of observed records in the current corpus into plausible
    identifier-like labels
  - examples:
    - arms resource: `CHR_059NEXTGN_001NEXTGE_001`
    - arms action: `GUN_059NEXTGN_001NEXTGE_001_BOMBER_KNUCKLE_ERUPTION`
    - character action: `ORDER_0`
    - speed action: `SKL_MOVE`
  - direct script linkage: sample `2.c` initializes `global142 = 0xC2B19D12`, and that id
    decodes from `speedparam.bin` to `SKL_MOVE`; later `global142` is used in repeated
    `sys_0(0x60006, global142, <speedparam field hash>)` calls, so the decoded label is
    a script-consumed param key/state name rather than mere display metadata
- Docs reference `tools/crc32_reverse_search.py`, but the file does **not** exist in the repo; only
  the planning doc exists under `docs/superpowers/plans/2026-04-03-crc32-reverse-search-tool.md`.

Refined conclusion:

- The new auto-rename path is likely **hybrid**, not single-source:
  1. global/shared action-hash dictionary for stable callback names
  2. script-side slot-table analysis (`func_1219` / `func_1220` / `func_1221`)
  3. per-unit param enrichment for projectile/interaction/system semantics
  4. per-unit kind-7 labels decoded via `obf_string` for directly readable
     weapon/resource/order/movement names
