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

- 2026-06-02 correction: do **not** treat the new auto-rename path as an
  `action_hash -> name` dictionary problem. The user explicitly rejects a dictionary-based design.
- The old path dynamically inferred fixed gameplay words from script structure
  (`Shoot/射击`, `Melee/格斗`, `Sub/副射`, `Special Shoot/特射`,
  `Special Melee/特格`, etc.). The new path should preserve that dynamic-mapping spirit.
- So far, no file has been found that records the original names for the new action hashes.
- The new path should build a script-side action graph:
  1. action registration table (`func_1219` / `func_241`)
  2. slot-callback table (`func_1220` / `sys_1(0x10001, 0x2, ...)`)
  3. slot-hash/resource table (`func_1221` / `sys_1(0x10001, 0x3/0x4, ...)`)
  4. resource and kind-7 param label evidence reached by each callback
- Names should be generated from traced behavior and fixed gameplay categories where evidence is
  strong. Unknown action hashes must remain visible as unresolved.

## 2026-06-02 Follow-up: new MSC action auto-rename design context

Scope: brainstorming only. No implementation code changed. Session docs updated per project protocol.

Startup/context commands:

- Read `AGENTS.md`.
- Read `.cursor/rules/custom-rules.mdc`.
- Read `C:\Users\kjjkjj\.agents\skills\brainstorming\SKILL.md`.
- Searched `docs/` for MSC workspace, action rename, `0.c`, `2.c`, function-name, and related terms.
- Re-read:
  - `docs/agent-sessions/msc-workspace-redesign/auto-rename-external-file-analysis.md`
  - `docs/agent-sessions/msc-workspace-redesign/process.md`
  - `docs/agent-sessions/msc-workspace-redesign/todo.md`
  - `docs/agent-sessions/msc-workspace-redesign/plan.md`
  - `docs/exvs-msc-input-action-weapon-pipeline.md`
  - `docs/exvs-native-truth-mapping-workflow.md`
  - `docs/msc-binary-format-spec.md`
  - `docs/msc-system-problems-analysis.md`

Current code findings:

- `MscWorkspaceView` still hardcodes mapping selection to
  `tools/mappings/exvs_0xF1EF3B32.native_truth.json`.
- During decompile, `2.c` still runs `renameScript2CallbacksByActionMask(0.c, 2.c)` and then
  `func_0 -> main`; `0.c` / `1.c` only get `func_0 -> main`.
- `renameScript2CallbacksByActionMask` still depends on:
  - `0.c` containing `void func_143()`
  - action routes appearing as `func_95(hash, ...)`
  - conditions containing `global48 & MASK`
  - `2.c` bindings appearing as `func_241(hash, callback)`
- `tools/mappings/exvs_0xF1EF3B32.native_truth.json` still has `script_functions: []`.
  Therefore native-truth `function_ref` symbolization has no offset-to-name table to resolve.
- The repo still does not contain `tools/crc32_reverse_search.py`, although docs and plans refer
  to it.
- `src-tauri/src/format/obf_string.rs` exists and can decode obfuscated strings.
- `armsparam.rs`, `characterparam.rs`, and `speedparam.rs` define
  `action_label_offset` / `resource_label_offset`, but `parse_command_table_file()` still treats
  kind `7` as raw `u32` and leaves `value_string` empty.

External sample checks:

- Existing sample paths:
  - `E:\XB\解包\com\file\0xF1EF3B32\0.c`
  - `E:\XB\解包\com\file\0xF1EF3B32\2.c`
  - `E:\XB\解包\com\file\0x693F756D\0.c`
  - `E:\XB\解包\com\file\0x693F756D\2.c`
  - `E:\XB\解包\com\file\0x38C44F75`
- Old/common `0xF1EF3B32/2.c` already contains meaningful manually recovered names such as
  `bindActionHashHandler`, `activeActionHash`, `pendingActionHash`,
  `setupMainShotScriptCallbacks`, `mainShotOnInitScript`, and `mainShotOnPhaseTickScript`.
- New sample `0x693F756D/0.c func_143()` is not the old mask router. It uses
  `sys_41(...) -> func_144(...) -> func_145(...)`; `func_95(...)` appears under that helper chain,
  not in the old `global48 & MASK` structure.
- New sample `0x693F756D/2.c` registers action callbacks in `func_1219()`:
  `func_241(action_hash, callback)`.
- The same sample registers slot callbacks in `func_1220()`:
  `sys_1(0x10001, 0x2, slot, callback)`.
- It registers slot hashes in `func_1221()`:
  `sys_1(0x10001, 0x3/0x4, slot, hash)`.
- The action callbacks often call `func_69(slot)`, which resolves the slot callback through
  `sys_0(0x10001, 0x2, slot)`, then executes it.
- Slot callbacks often call `func_74(slot, delay)` / `func_79(...)`, which resolves the second
  hash table through `sys_0(0x10001, 0x3 + global170, slot)`.

Design implication:

- The new auto-rename should not try to stretch the old mask parser.
- Do not use a stored `action_hash -> name` dictionary as the primary mechanism.
- A useful name needs a source badge and confidence level because different evidence names
  different layers:
  - dynamic route evidence maps action hash to callback/slot/resource flow
  - fixed gameplay labels such as Shoot/射击, Melee/格斗, and Sub/副射 are assigned only when the
    route evidence supports them
  - param kind-7 labels provide readable weapon/resource/order/movement names for per-unit
    semantics
  - resource hashes from `sys_4F` / `sys_58` / `sys_0(0x60006, ...)` enrich callbacks but do not
    always identify the primary action hash
- The open research question remains: where, if anywhere, the original action hash names are
  recorded.

User correction recorded:

- The previous dictionary-centered conclusion was wrong for the desired design.
- The user will not choose a dictionary solution.
- Future design/spec work must focus on dynamic mapping and on finding the true action-hash source,
  not on inventing a replacement dictionary.

## 2026-06-02 Continued Research: new MSC dynamic mapping

User direction:

- Continue researching new-version MSC.
- IDA Pro MCP is reportedly connected to the EXVS executable.
- Keep the no-dictionary rule: action hash names must not be solved by a hand-maintained
  `action_hash -> name` table.

Tool availability note:

- In this Codex session, `tool_search` did not expose any IDA MCP tools.
- `list_mcp_resources` only returned Exa resources.
- Therefore native/IDA verification could not be executed directly in this turn.
- Local extracted samples under `E:\XB\解包\com\file` are readable, so script-side evidence
  extraction continued from decompiled C.

### New key finding: `0.c` has an action slot table

For sample:

- MSC: `E:\XB\解包\com\file\0x693F756D`
- `0.c`
- `2.c`

`0.c func_13()` initializes a table:

```c
sys_1(0x10000, 0x1, slot, actionHash);
```

Examples:

| action slot | action hash |
|---:|---:|
| `0x2` | `0x6d00aeaa` |
| `0x3` | `0x9cf36e1b` |
| `0x4` | `0x868ec571` |
| `0x5` | `0xa8ab2ac9` |
| `0xa` | `0xf5f21169` |
| `0x1d` | `0xdabb0543` |
| `0x24` | `0xf32aa1ba` |
| `0x25` | `0x900ab393` |
| `0x28` | `0x27786a84` |

This means the action hashes are not only in `2.c func_1219()`.
They are also script-side action-slot values in `0.c`.

Important correction to the previous mental model:

- We still have not found the original human-readable action-hash name file.
- But we have found a script-local action-slot layer that can support dynamic mapping.
- This is much closer to the old fixed-word route than to a dictionary lookup.

### `0.c func_14()` binds action slots to selector callbacks

`0.c func_14()` calls:

```c
func_83(slot, selectorCallback);
```

`func_83()` resolves the slot's hash through `sys_0(0x10000, 0x1, slot)` and registers:

```c
sys_1(0x10002, 0, actionHash, selectorCallback);
```

Examples:

| action slot | action hash | selector |
|---:|---:|---|
| `0x1` | `0x4cdc9902` | `func_15` |
| `0x2` | `0x6d00aeaa` | `func_16` |
| `0x3` | `0x9cf36e1b` | `func_17` |
| `0xa` | `0xf5f21169` | `func_24` |
| `0x1d` | `0xdabb0543` | `func_31` |
| `0x1e` | `0x68790b03` | `func_32` |
| `0x1f` | `0xeee34191` | `func_33` |
| `0x20` | `0x676aca0b` | `func_34` |
| `0x21` | `0x1ad4e055` | `func_39` |
| `0x23` | `0x450c6ce4` | `func_40` |
| `0x24` | `0xf32aa1ba` | disabled selector (`0`) |
| `0x25` | `0x900ab393` | disabled selector (`0`) |
| `0x28` | `0x27786a84` | disabled selector (`0`) |

Selector callbacks often return other action slots through:

```c
return sys_0(0x10000, 0x1, targetSlot);
```

Examples:

- `func_17` for slot `0x3` can return slot `0x4`.
- `func_19` for slot `0x5` can return slot `0x2`.
- `func_20` for slot `0x6` can return slots `0x2` or `0x8`.
- `func_21` for slot `0x7` can return slots `0x8` or `0xa`.
- `func_22` for slot `0x8` can return slots `0x9` or `0xa`.
- `func_31` for slot `0x1d` can return slot `0x1e`.
- `func_32` for slot `0x1e` can return slot `0x1f`.
- `func_33` for slot `0x1f` can return slot `0xa`.

This suggests a dynamic action graph exists on the `0.c` side before the selected hash reaches
the `2.c` action layer.

### `sys_41` and `0x700000` are now the main native questions

`0.c func_143()` does:

```c
var0 = sys_41(...);
var1 = func_144(var0);
func_145(var0, var1, 0);
```

`func_145()` reads:

```c
var3 = sys_0(0x700000, 0, arg0, 0x2e);
var4 = sys_0(0x700000, 0, arg0, 0xa);
var6 = sys_0(0x700002, var4, 0, arg0, 1);
var7 = sys_0(0x700002, var4, 1, arg0, 1) | arg2;
func_95(var3, var6, var7, arg1);
```

Current interpretation:

- `sys_41(...)` returns an action-record index or encoded action-record handle.
- `sys_0(0x700000, 0, actionRecord, 0x2e)` returns the action hash.
- `sys_0(0x700000, 0, actionRecord, 0x3)` is used by `func_144()` as an action category/type.
- `sys_0(0x700000, 0, actionRecord, 0x4)` is used by `func_144()` as an input/direction mask.
- `sys_0(0x700000, 0, actionRecord, 0xa)` is used as a key into `0x700002`.
- `0x700002` returns additional selected action fields passed into `func_95()`.

This makes `sys_41` and the backing store for `0x700000` / `0x700002` the highest-priority IDA
targets. If an external file exists for action names or action records, it is more likely connected
to this native path than to `2.c func_241()` alone.

### `func_144()` dynamically maps native action records to fixed categories

`func_144()` computes:

```c
var1 = sys_0(0x700000, 0, arg0, 0x3) % 0x64;
var2 = sys_0(0x700000, 0, arg0, 0x4);
```

When `var1 == 1`, it maps `var2` values to category ids:

| `var2` mask | returned category |
|---:|---:|
| `0x4` | `0x2` |
| `0xc` | `0x2` |
| `0x3c` | `0x2` |
| `0x10` | `0x3` |
| `0x20` | `0x4` |
| `0x30` | `0x4` |
| `0x8` | `0x5` |

This resembles the old fixed-word action grouping, but the exact labels are not proven yet.
It is a strong candidate for dynamically recovering categories such as melee / directional melee /
subroutes, once the native meaning of field `0x4` and the category ids are verified.

### `2.c` requires two-level slot tracing

`2.c func_1219()` registers:

```c
func_241(actionHash, actionCallback);
```

`2.c func_1220()` registers:

```c
sys_1(0x10001, 0x2, actionSlot, slotCallback);
```

`2.c func_1221()` registers:

```c
sys_1(0x10001, 0x3, innerSlot, slotHash);
sys_1(0x10001, 0x4, innerSlot, slotHash);
```

Important correction:

- The `func_69(actionSlot)` argument is not usually the final slot-hash index.
- The action callback calls `func_69(actionSlot)`.
- That loads a slot callback through `sys_0(0x10001, 0x2, actionSlot)`.
- The slot callback then calls `func_74(innerSlot, delay)` / related helpers.
- `func_79()` resolves the final slot hash through `sys_0(0x10001, 0x3 + global170, innerSlot)`.

So dynamic mapping must trace at least:

```text
actionHash -> actionCallback -> func_69(actionSlot)
  -> slotCallback -> func_74(innerSlot)
  -> slotHash/resource
```

Selected extracted chains:

| action hash | action callback | traced chain |
|---:|---|---|
| `0x6d00aeaa` | `func_390` | `actionSlot 0x1 -> func_1124 -> innerSlot 0x0 -> 0x1f588bd9` |
| `0x9cf36e1b` | `func_392` | `actionSlot 0x2 -> func_1125 -> innerSlots 0x2/0x4/0x3 -> 0x377e9872 / 0xf0b3ea12 / 0xd74ba485` |
| `0xa8ab2ac9` | `func_401` | `actionSlot 0x4 -> func_1127 -> innerSlot 0x8 -> 0x1f588bd9` |
| `0x4de2206b` | `func_403` | `actionSlot 0x5 -> func_1128 -> innerSlot 0xe -> 0xc00b5dec` |
| `0x901c3623` | `func_408` | `actionSlot 0x7 -> func_1130 -> innerSlots 0x10/0x11 -> 0x44542fbc` |
| `0x86d45295` | `func_437` | `actionSlot 0x1d -> func_1137 -> innerSlots 0x1/0x0/0x29 -> 0xe53bc97 / 0x1f588bd9 / 0xf270ea6a` |
| `0xf32aa1ba` | `func_480` | `actionSlot 0x34 -> func_1148..1152 -> innerSlot 0x4e -> conditional hashes` |
| `0x900ab393` | `func_482` | `actionSlot 0x35 -> func_1158 -> innerSlot 0x4f -> 0xb189334e` |
| `0x27786a84` | `func_486` | `actionSlot 0x36 -> func_1159 -> innerSlot 0x50 -> 0x1f588bd9` |

Actions with no first-pass route evidence:

- `0x506ac760 -> func_425`
- `0x1ad4e055 -> func_1144`
- `0xef809e66 -> func_1146`
- `0x676aca0b -> func_472`
- `0x613494c8 -> func_58`

Disabled in `2.c func_1219()`:

- `0x9475130e`
- `0x77b100ff`
- `0xa02d57dc`

### Current research conclusion

The most promising no-dictionary auto-rename route is:

1. Use `0.c func_13()` to build `actionSlot -> actionHash`.
2. Use `0.c func_14()` to build `actionSlot -> selectorCallback`.
3. Analyze selector callbacks to infer dynamic route categories and fallback chains.
4. Use `func_144()` / `0x700000` fields to recover fixed gameplay category ids.
5. Use `2.c func_1219()` to map `actionHash -> actionCallback`.
6. Trace `2.c` from action callback through slot callback to slot hash/resource.
7. Use per-unit params and kind-7 labels only as semantic enrichment after the script route is known.

This keeps the old-style "fixed gameplay word" approach, but adapts it to the new action-slot and
native action-record structure.

### IDA verification targets once IDA MCP is available

Search/query priorities:

1. Native syscall handler for `sys_41`.
   - Determine what data structure it searches.
   - Determine whether it reads a file-backed action table.
   - Confirm whether its return value is an index into the `0x700000` action-record table.
2. Native handler for `sys_0(0x700000, 0, record, field)`.
   - Identify the backing struct.
   - Confirm field `0x2e` is action hash.
   - Confirm field `0x3` is category/type.
   - Confirm field `0x4` is input/direction mask.
   - Confirm field `0xa` is a key/group for `0x700002`.
3. Native handler for `sys_0(0x700002, group, subfield, record, 1)`.
   - Identify what `var6` and `var7` represent before `func_95`.
4. Native backing source for `0x10000, 0x1` action-slot table.
   - Confirm whether it is purely script-initialized by `func_13` or also mirrored natively.
5. Search EXE strings / RTTI / data refs around action-record loading.
   - Look for names related to command action, action table, input action, route, weapon, or command list.
6. Cross-check whether resource packages contain data loaded into `0x700000`.
   - Candidate file families should be investigated only after IDA identifies the loader path.
