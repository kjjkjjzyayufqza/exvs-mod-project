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

## 2026-06-03 Continued Research: dynamic `0x700000` action records

User direction:

- Continue researching new-version MSC.
- IDA Pro MCP is reportedly connected to the EXVS executable.
- Preserve the no-dictionary rule. The user will not choose an
  `action_hash -> name` dictionary solution.

Tool availability check:

- `list_mcp_resources` showed only Exa resources.
- `tool_search` for IDA/IDA Pro tools returned no tools.
- Therefore EXE-side IDA queries could not be executed directly in this Codex
  session. Local decompiled samples were used instead.

### Cross-sample script-side scan

Local scan roots:

- `E:\XB\解包\com\file`
- 6 directories with both `0.c` and `2.c`
- 30 directories with parseable `2.c` action-graph tables
- 15 `2.c` files using `0x700000` / `0x700001` / `0x700002`

Important cross-sample result:

- The `0.c` `sys_1(0x10000, 0x1, slot, actionHash)` table is identical in
  all 6 directories that have `0.c`.
- It is a stable base action-slot vocabulary, not a per-unit accidental table.
- The table has 30 slots. `2.c` generally registers 27 of those base hashes.
- These 3 base hashes are present in `0.c` but were not registered in any
  scanned `2.c` sample:
  - `0x4cdc9902`
  - `0x16d0093c`
  - `0x450c6ce4`
- `0x613494c8` is the common extra `2.c` action hash outside the `0.c`
  base table. It binds to `func_58`, whose body is empty in checked samples,
  so treat it as a no-op/system placeholder, not a meaningful weapon action.

For `0x700000`-style `2.c` samples:

- 15 samples were found.
- Their static registrations are mostly the base `0.c` action hashes.
- 24 base hashes appear in every `0x700000`-style sample.
- The only common extra outside the base table is usually `0x613494c8`.
- Some samples omit `0xf32aa1ba`, `0x900ab393`, or `0x27786a84`, which looks
  like per-unit capability/enablement rather than a different naming system.

### New key finding: dynamic action registration from `0x700000`

In `E:\XB\解包\com\file\0x693F756D\2.c`, `func_849()` is the dynamic
registration entry:

```c
var0 = sys_0(0x700001, 0);
var1 = 0x1;
while (var1 < var0)
{
    var2 = sys_0(0x700000, 0, var1, 0x2e);
    var3 = sys_0(0x700000, 0, var1, 0xa);
    var4 = func_873(var3);
    func_241(var2, var4);
    var1++;
}
```

This is the strongest current answer to "where are new action hashes recorded":

- the script reads action hashes at runtime from the native `0x700000`
  action-record table
- `0x700001` returns the action-record count
- `0x700000` field `0x2e` is the action hash
- `0x700000` field `0xa` is a group/type key
- the group/type key is resolved by a local resolver such as `func_873`
- the resolved callback is registered through `func_241(actionHash, callback)`

This is not an `action_hash -> name` dictionary. It is a runtime action-record
import path. The unresolved part is still the native/file backing source for
`0x700000`.

### `0x700000` also builds reverse and phase-callback tables

The same dynamic registration function also builds:

```c
sys_1(0x10002, 0x1f, actionHash, recordIndex);
sys_1(0x10001, 0x10, recordIndex, func_975(func_875(recordIndex, 0x2)));
sys_1(0x10001, 0x11, recordIndex, func_975(func_875(recordIndex, 0x7c)));
sys_1(0x10001, 0x12, recordIndex, func_975(func_875(recordIndex, 0x7d)));
```

Current interpretation:

- `0x10002,0x1f`: `actionHash -> actionRecordIndex`
- `0x10001,0x10`: record init/start callback
- `0x10001,0x11`: record tick/phase callback
- `0x10001,0x12`: record end/cancel callback
- `0x700000` fields `0x2`, `0x7c`, and `0x7d` store callback-key hashes
  that are resolved through the large local resolver `func_975`.

Runtime usage in `0x693F756D/2.c`:

- `func_866()` reads `global4` (active action hash) through
  `sys_0(0x10002, 0x1f, global4)` into `global798` (record index).
- `func_862()` runs the `0x10001,0x10` callback for that record.
- `func_863()` runs the `0x10001,0x11` callback for that record.
- `func_865()` runs the `0x10001,0x12` callback for that record.

So the new dynamic action path is:

```text
native action-record table
  -> recordIndex
  -> field 0x2e actionHash
  -> field 0xa group resolver -> action callback
  -> field 0x2 / 0x7c / 0x7d phase callback keys
  -> local key->function resolver
  -> init/tick/end script functions
```

### `0.c func_145()` and `2.c func_872()` are parallel dispatch writers

`0.c func_145()` and `2.c func_872()` both read:

```c
actionHash = sys_0(0x700000, 0, recordIndex, 0x2e);
group = sys_0(0x700000, 0, recordIndex, 0xa);
route0 = sys_0(0x700002, group, 0, recordIndex, ...);
route1 = sys_0(0x700002, group, 1, recordIndex, ...);
```

Then they write the resolved action/route state into script globals or shared
slots. This confirms `0x700000` is not merely an editor-side metadata clue; it
is used in both selection and execution layers.

### Function-ref decode issue: raw offset plus `0x30`

In `0x693F756D/2.c`, `func_873()` returns raw constants:

```c
else if (arg0 == 0x3) { return 0x3b343; }
```

The same script's `2.txt` function table shows:

- `0x3b343 + 0x30 = 0x3b373`, which is `func_950`
- `0x39689 + 0x30 = 0x396b9`, which is `func_924`
- `0x3a9e1 + 0x30 = 0x3aa11`, which is `func_942`
- `0x3aeef + 0x30 = 0x3af1f`, which is `func_946`
- `0x3bbfe + 0x30 = 0x3bc2e`, which is `func_956`
- `0x388b1 + 0x30 = 0x388e1`, which is `func_916`
- `0x38bd3 + 0x30 = 0x38c03`, which is `func_919`

So raw function refs in this resolver use `decode_add = 0x30`.

Other `0x700000` samples already decompile the same resolver style as
`return func_945;` / `return func_949;`, so the structural logic exists but is
not reliable across all samples. Current code explains the miss:

- `tools/msc_cfg.py::_try_resolve_ref()` only resolves exact script entry
  offsets.
- It does not try `value + SCRIPT_BASE` / `value + 0x30`.
- `tools/exvs_native_truth.py` supports `decode_add`, and the existing
  `exvs_0xF1EF3B32.native_truth.json` already has a `func241_arg1` rule with
  `decode_add = 48`, but `script_functions` is empty.
- `_walk_and_symbolize_exvs_native_truth()` currently handles call arguments,
  not raw `return 0x...;` constants inside resolver functions.

Practical implementation implication:

- The new extractor should not rely on hardcoded function numbers.
- It should discover the dynamic registration function by the
  `sys_0(0x700001, 0)` plus `func_241(var2, var4)` pattern.
- It should discover the group resolver from `var4 = resolver(var3)`.
- It should resolve resolver return values either as direct symbols or as
  `raw + 0x30` using the script function offset table.
- It should use this to build a dynamic action-record graph, not a dictionary.

### Updated native/IDA targets

The IDA target list should now be sharpened:

1. Find the native handlers/backing classes for `sys_0(0x700001, 0)`,
   `sys_0(0x700000, ...)`, and `sys_0(0x700002, ...)`.
2. Identify the loader that populates the `0x700000` action-record table.
3. Determine the file/package type and per-unit key that feeds that loader.
4. Confirm field layout:
   - `0x2e`: action hash
   - `0xa`: group/type key for callback resolver and `0x700002`
   - `0x3`: category/type used by `0.c func_144`
   - `0x4`: input/direction mask used by `0.c func_144`
   - `0x2`, `0x7c`, `0x7d`: callback-key fields used by `2.c`
5. Confirm whether `0x700002` stores route/state values or a secondary table
   keyed by `field 0xa`.

Current bottom line:

- We still have not found the file that stores new action records.
- We have found the runtime table that records the action hash.
- The next EXE-side question is no longer "does a table exist?" but "which
  native loader populates `0x700000` / `0x700001` / `0x700002`?"

## 2026-06-03 Correction: `0x700000` action records come from `chrsysparam.csyspm`

User provided the concrete resource list for unit `59001001`:

```json
{
  "id": 59001001,
  "Param": 952389493,
  "Msc": 1765766509
}
```

Important decimal/hex mapping:

- `id 59001001` = `0x038448A9`
- `Param 952389493` = `0x38C44F75`
- `Msc 1765766509` = `0x693F756D`

This pairs:

- MSC scripts: `E:\XB\解包\com\file\0x693F756D\0.c` and `2.c`
- param bundle: `E:\XB\解包\com\file\0x38C44F75\`

The missing file-side source for the new action records is therefore:

```text
E:\XB\解包\com\file\0x38C44F75\chrsysparam.csyspm
```

This file matches the IDA/native path exactly:

- file magic: `0xB4ACACAF`
- version/type: `0x00010000`
- header id: `0x038448A9`
- subtable count/offset count: `2`
- table0 offset: `0x1C`
- table1 offset: `0x6E2C`
- table0 marker: `0xA8BBBAB9`
- table0 shape: `55` rows x `128` u32 columns
- table0 data start/end: `0x2C` -> `0x6E2C`
- table1 marker: `0xA8BAA9BA`
- table1 shape: `1` row x `1` u32 column
- table1 data start/end: `0x6E3C` -> `0x6E40`

Subtable header correction:

```text
u32 marker
u32 row_count
u32 column_count
u32 reserved_or_zero
```

Matrix data starts at `subtable_offset + 0x10`. Do not parse row data from
`subtable_offset + 0x0C`.

This corrects an earlier assumption in the repo parser:

- `src-tauri/src/format/chrsysparam.rs` currently treats `0x10` as a flat
  20-byte entry count.
- That works for tiny 68-byte samples where there are two trivial subtables.
- It is not the real large-file layout.
- For `0x38C44F75/chrsysparam.csyspm`, `0x10 == 2` means two subtables, not two
  `[hash,valueA,valueB,valueC,valueD]` entries.
- The real action table is table0: a 2D u32 matrix read by native
  `sys_0(0x700000, selector, row, field)`.

### `0.c` reads the action matrix, not a normal `.bin`, for action selection

For `0x693F756D/0.c`, the relevant action selection path is:

```c
var0 = sys_41(0x1, global48, global2, func_123(), global20, ...);
...
var1 = func_144(var0);
func_145(var0, var1, 0);
```

`func_144(recordIndex)` reads:

```c
var1 = sys_0(0x700000, 0, arg0, 0x3) % 0x64;
var2 = sys_0(0x700000, 0, arg0, 0x4);
```

So the old-style gameplay category is derived dynamically from
`chrsysparam` table0 fields:

- `field 0x03`: base category/type
- `field 0x04`: input/direction/branch mask used to refine category

`func_145(recordIndex, category, flags)` reads:

```c
actionHash = sys_0(0x700000, 0, recordIndex, 0x2e);
group = sys_0(0x700000, 0, recordIndex, 0xa);
route0 = sys_0(0x700002, group, 0, recordIndex, 1);
route1 = sys_0(0x700002, group, 1, recordIndex, 1) | flags;
func_95(actionHash, route0, route1, category);
```

This establishes the static-file path for auto rename:

```text
resource list
  -> Param hash
  -> chrsysparam.csyspm
  -> table0 action row
  -> field 0x2e action hash
  -> field 0x0a group
  -> 2.c group resolver
  -> func_241(actionHash, callback)
```

The answer to "which bin does `0.c` read with" is therefore: for the new action
records, it is not a normal `.bin`; it is `chrsysparam.csyspm` inside the paired
Param bundle. Other `sys_0(0x10000, ...)` values in `0.c` are native preloaded
runtime/basic parameter arrays and may be populated from `characterparam.bin` or
other params, but they are not the direct action-record source.

### Auto-rename implication

The user explicitly rejected an `action_hash -> name` dictionary. The correct
new path is dynamic mapping:

1. Use the resource list to pair `Msc` with `Param`.
2. Parse `Param/chrsysparam.csyspm` as a two-subtable matrix file.
3. Read table0 records and extract at least:
   - `0x2e`: action hash
   - `0x0a`: group key
   - `0x03`: base category/type
   - `0x04`: input mask/category refinement
   - `0x02`, `0x7c`, `0x7d`: phase callback keys used by `2.c`
4. Parse `Msc/2.c` resolver such as `func_873(group)` to map group keys to
   action callbacks.
5. Parse `Msc/0.c func_144()` to derive old-style fixed gameplay labels such as
   Shoot/射击, Melee/格斗, Sub/副射, Special Shoot/特射, and Special Melee/特格
   from table fields, not from a user dictionary.

Next research should focus on field semantics and naming rules for the action
matrix, not on broad resource search.

## 2026-06-03 follow-up: 59001001 action matrix row mapping

Continued local analysis only; no broad IDA pass. IDA had been restarted by the
user, but the current step stayed on the already identified static files:

```text
Msc   -> E:\XB\解包\com\file\0x693F756D\
Param -> E:\XB\解包\com\file\0x38C44F75\
```

### Commands / files inspected

- Read `0x693F756D/0.c` around `func_95`, `func_101`, `func_144`,
  `func_145`, and `global26/global62` usage.
- Read `0x693F756D/2.c` around `func_241`, `func_849`, `func_873`,
  `func_875`, `func_916`, `func_919`, `func_924`, `func_942`,
  `func_946`, `func_950`, `func_956`, and `func_975`.
- Parsed `0x38C44F75/chrsysparam.csyspm` table0 rows as `55 x 128`
  little-endian u32 values.
- Cross-checked old input naming notes in
  `docs/exvs-msc-input-action-weapon-pipeline.md`.

### Findings

`0.c` stores the derived category from `func_144()` into `global26`, then later
copies it to `global62` and writes it into runtime state:

```c
global26 = arg3;              // func_95
global62 = global26;          // func_79
sys_1(0x10000, 0, 0x1a, global62);
```

This proves the category is runtime-significant. It does not by itself prove
the exact Chinese display label for each numeric category.

`2.c` confirms the dynamic registration chain:

```c
row count -> table0 row -> field 0x2e action hash
          -> field 0x0a group -> func_873(group)
          -> func_241(actionHash, callback)
```

For `0x693F756D`, `func_873(group)` maps:

- `0x03 -> func_950`
- `0x0C -> func_924`
- `0x0D -> func_942`
- `0x0F -> func_946`
- `0x10 -> func_956`
- `0x13 -> func_956`
- `0x1F -> func_916`
- `0x25 -> func_919`
- `0x26 -> func_919`

Groups `0x27`, `0x28`, and `0x29` are present in `chrsysparam` but not handled
by `func_873`; the resolver returns `0`. These rows must remain visibly
unresolved instead of receiving guessed callback names.

`func_144(row)` derives a category from `field 0x03/0x04`. For rows where
`field 0x03 % 0x64 == 1`:

- `0x04 == 0x04 / 0x0C / 0x3C -> category 2`
- `0x04 == 0x10 -> category 3`
- `0x04 == 0x20 / 0x30 -> category 4`
- `0x04 == 0x08 -> category 5`
- otherwise category remains `1`

Core `field 0x03 == 1` rows in `59001001`:

| row | action hash | field `0x04` | category | group | callback |
|---:|---|---:|---:|---:|---|
| 20 | `0x178D1109` | `0x00` | `1` | `0x0C` | `func_924` |
| 25 | `0x84BD2B08` | `0x04` | `2` | `0x1F` | `func_916` |
| 27 | `0x0E962048` | `0x30` | `4` | `0x0C` | `func_924` |
| 32 | `0x58CC87CE` | `0x08` | `5` | `0x0D` | `func_942` |
| 38 | `0x446C1D89` | `0x04` | `2` | `0x0C` | `func_924` |

This sample does not contain a `field 0x04 == 0x10` row that would produce
category `3`.

`2.c` also maps phase hashes dynamically:

```c
field 0x02 -> func_975(...) -> sys_1(0x10001, 0x10, row, func)
field 0x7c -> func_975(...) -> sys_1(0x10001, 0x11, row, func)
field 0x7d -> func_975(...) -> sys_1(0x10001, 0x12, row, func)
```

`func_975` has 162 cases in this script. Every nonzero phase hash from the
sample action rows resolved to a local `func_xxx`. This gives the renamer a
clear row-child naming path for phase callbacks, independent of any action hash
dictionary.

### Design decision

The new auto-rename contract should be row-evidence based:

```text
resource list -> Msc/Param pair -> chrsysparam table0 row
  -> category fields 0x03/0x04
  -> action hash field 0x2e
  -> group field 0x0a -> 2.c resolver callback
  -> phase fields 0x02/0x7c/0x7d -> func_975 callbacks
```

Fixed words such as Shoot/射击, Melee/格斗, Sub/副射, Special Shoot/特射, and
Special Melee/特格 are allowed only as category vocabulary after the category
is dynamically derived. They are not an `action_hash -> name` dictionary.

Until numeric category-to-word alignment is verified against `sys_41` input
selection or runtime traces, implementation should use evidence names such as:

- `ACTION_CAT_02_ROW_25`
- `ACTION_GROUP_1F_ROW_25`
- `ACTION_ROW_25_FUNC_916`
- `ACTION_ROW_25_PHASE_0`
- `ACTION_ROW_25_PHASE_1`
- `ACTION_ROW_25_PHASE_2`

Detailed row-level notes were added to:

- `docs/agent-sessions/msc-workspace-redesign/auto-rename-external-file-analysis.md`

## 2026-06-03 follow-up: MBON-derived, FB-compatible in-MSC B4AC comparison

User provided:

```text
G:\1. Gundam - 1011.c
```

This file shows the older compatibility approach for the same action-record
model. Instead of reading `chrsysparam.csyspm`, it embeds the action table into
MSC with `sys_2D(0x3,row,field,value)` in `add_B4AC()`, then reads logical
dataset `n` with:

```c
sys_2C(0x3, 0x11 + n - 1, field)
```

The file comments state that this table was generated from MBON `011.bin`, and
that the newer `sys_0(0x30013,0,row,field)` is the substitute for the old
`sys_2C` access path. This confirms the older MSC is not using a name
dictionary; it is an in-MSC expansion of the same B4AC/action matrix concept.

Important equivalences with the new `59001001` sample:

- old `sys_2D(0x3,row,field,value)` table -> new `chrsysparam.csyspm` table0
- old `func_796(row,field)` -> new `func_875(row,field)`
- old `sys_74(0x3,...)` selector -> new `sys_41(...)` selector
- old `field 0x03/0x04` category derivation -> new `field 0x03/0x04`
  category derivation
- old `field 0x0A` group switch in `func_786()` -> new `func_873(group)`
- old `field 0x2E` hash/ID bridge -> new `field 0x2E` action hash
- old `field 0x02/0x7C/0x7D -> func_926()` phase callbacks -> new
  `field 0x02/0x7C/0x7D -> func_975()` phase callbacks

The category logic is semantically the same but has different `field 0x04`
encoding:

- old: `1 -> cat4`, `2 -> cat3`, `4 -> cat5`, `8/C/F -> cat2`, `3 -> cat4`
- new: `20/30 -> cat4`, `10 -> cat3`, `8 -> cat5`,
  `4/C/3C -> cat2`

Core category rows found in the old embedded table:

| logical row | action hash / ID | field `0x04` | category | group |
|---:|---|---:|---:|---:|
| 11 | `0xDB2CA8B5` | `0x00` | 1 | `0x0C` |
| 16 | `0x8C02D1FC` | `0x08` | 2 | `0x0C` |
| 18 | `0x137D0C4E` | `0x03` | 4 | `0x0C` |
| 25 | `0x7ABD7BF6` | `0x04` | 5 | `0x0C` |

Examples of old phase resolution:

- logical row 16: `0x65BB7CA0/0xB9F85E31/0x3E6042FE`
  -> `func_1034/func_1033/func_1035`
- logical row 25: `0xC0A5594F/0x7B9FE3EC/0xFC07FF23`
  -> `func_1088/func_1087/func_1089`

The old file comments also define the B4AC markers:

- `A8 BB BA B9`: main `0x80` batch
- `A8 BA A9 BA`: extra variable section

and the expanded table ends with:

```c
sys_2D(0x3, 0x2D, 0x80, 0xA8BAA9BA);
```

This marker family matches the newer `chrsysparam.csyspm` evidence.

`parse_Melee_Var(set_hash,var_hash)` at the tail is related as an inline
parameter surface, but not the primary action-name source. Its call sites load
melee parameter variables by `set_hash + var_hash`. Treat it as another example
of newer/external parameter data being embedded into older MSC, not as
`action_hash -> name`.

Design impact: the old file strengthens the dynamic row-evidence contract. The
renamer should support "embedded action matrix" and "external chrsysparam
matrix" as two storage backends for the same row/field model, while continuing
to reject user-maintained action-hash dictionaries.

## 2026-06-03 follow-up: rename capability and editing implication

Answered the key design question: `chrsysparam.csyspm` can drive a new-version
equivalent of the old `0.c -> helper -> 2.c` rename flow.

The rename evidence chain is:

```text
resource list
  -> Msc / Param pair
  -> Param/chrsysparam.csyspm table0 action row
  -> field 0x03/0x04 derived category
  -> field 0x2E action hash
  -> field 0x0A group
  -> Msc/2.c group resolver
  -> func_241(actionHash, callback)
  -> field 0x02/0x7C/0x7D phase hashes
  -> phase callback resolver
```

This is enough for deterministic evidence names such as
`ACTION_ROW_25_CAT_02_GROUP_1F`, `ACTION_ROW_25_FUNC_916`, and
`ACTION_ROW_25_PHASE_0`. It is not enough by itself to claim all final
human-readable gameplay labels. Category-to-label alignment still needs
verification from input selection or runtime behavior.

Editing implication recorded:

- Editing the body of an existing MSC callback usually does not require
  changing `chrsysparam.csyspm` if the action row, group, category, action hash,
  and phase keys remain the same.
- Editing action selection, registration, row category, group routing, action
  hash/ID, phase assignment, or route/condition fields probably requires
  editing `chrsysparam.csyspm` together with MSC.
- Therefore `chrsysparam.csyspm` should be treated as action metadata, not only
  as a rename reference.

Future tooling should expose this binary as a structured editable artifact:

```text
chrsysparam.csyspm -> action_rows.json/yaml -> rebuild chrsysparam.csyspm
```

The artifact must preserve unknown fields and support exact round-trip unless
the user intentionally edits specific fields.

## 2026-06-04 follow-up: MSC editing boundary with `chrsysparam.csyspm`

Recorded the answer to the follow-up design question: future MSC editing does
not automatically mean `chrsysparam.csyspm` must be changed, but action-level
edits must treat it as paired metadata.

Safe MSC-only edits:

- modify an existing callback body
- keep the same action row, action hash, group, category, phase keys, and route
  metadata
- avoid changing how the action is selected or registered

Paired edits that likely require rebuilding `chrsysparam.csyspm`:

- add/delete/move an action row
- change field `0x2E` action hash
- change field `0x0A` group routing
- change fields `0x03/0x04` category/input behavior
- change fields `0x02/0x7C/0x7D` phase callback keys
- change route/condition fields used by `0x700002`; after the old B4AC
  comparison, the strongest first-pass candidates are `0x03`, `0x2C`, and
  `0x6E`, while `0x1C..0x22` should be preserved as callback-specific action
  parameters unless proven otherwise

Tooling implication: `chrsysparam.csyspm` must eventually be exposed as a
human-readable structured artifact, not edited by hand as raw binary:

```text
chrsysparam.csyspm -> action row model -> user edit -> exact binary rebuild
```

The exporter/rebuilder must preserve unknown fields and round-trip unchanged
rows byte-for-byte.

## 2026-06-04 follow-up: `0x700002` route/flags boundary

Continued the `0x700002` investigation without IDA MCP access in this session.
Used script-side evidence from:

- `E:\XB\解包\com\file\0x693F756D\0.c`
- `E:\XB\解包\com\file\0x693F756D\2.c`
- `E:\XB\解包\com\file\0x38C44F75\chrsysparam.csyspm`
- `E:\XB\解包\com\file\0x31A97FD4\chrsysparam.csyspm`

Confirmed script state roles:

```text
0x700002(..., subfield 0, row) -> routeEnum
0x700002(..., subfield 1, row) -> flagsMask
```

Evidence:

- `0.c func_145()` reads subfields `0` and `1`, ORs subfield `1` with caller
  flags, then calls `func_95(actionHash, routeEnum, flagsMask, category)`.
- `0.c func_95()` stores route into `global23`, flags into `global24`, and uses
  `flagsMask & 0x800` to select action state `global22 = 2` vs `1`.
- `2.c func_872()` repeats the same `0x700002` subfield reads.
- `2.c func_81()` stores route into `global67`, flags into `global52`, and uses
  `flagsMask & 0x800` to select `global154 = 2` vs `1`.
- `2.c func_81()` also treats `routeEnum == 2` as an inherit/keep-previous
  value by replacing it with `global174`.

Shared runtime slots:

```text
0.c writes route/flags to 0x10000 fields 0x1C/0x1D
2.c reads those into global67/global52
2.c writes route/flags to 0x10000 fields 0x1E/0x1F
0.c reads those into global23/global24
```

This confirms that `0x700002` is not an action-name source and not a callback
resolver. It is a native decoder that returns action route/state metadata.

Large-table field shape check:

- `0x38C44F75` table0: `55 x 128`, paired with unit `59001001`
- `0x31A97FD4` table0: `72 x 128`, paired with unit `33004001`

The fields `0x1C..0x22` are group-specific:

- groups `0x0C` and `0x0D`: dense `0x1C..0x22` records
- groups `0x1F` and `0x1D`: compact `0x1C` plus small `0x1D` style records
- group `0x27`: no `0x1C`; consistently uses `0x1D`, `0x1F`, `0x20`,
  `0x21`, `0x22`
- group `0x03`: mixed hash-like and small numeric fields

Field `0x6E` should be kept separate for now. It is read directly by
`2.c func_870()` into `global912`; in the checked `0x693F756D` script,
callbacks such as `func_950()` / `func_956()` branch on `global912`. It is not
yet proven to feed `0x700002`.

Unresolved at this point: exact native mapping from action-row fields to route
enum and flags bits. The next strong step was to compare the old embedded B4AC
script, because it may contain the script-side predecessor of native
`0x700002`.

## 2026-06-04 follow-up: old B4AC gives a partial `0x700002` formula

Read `G:\1. Gundam - 1011.c` again, focusing on the caller of the old
`func_138(actionCallback, routeEnum, flagsMask, category)` path.

Key finding: old `func_138()` is structurally equivalent to new
`0x693F756D/2.c func_81()`.

Both functions:

- use `flagsMask & 0x800` to choose state `2` vs `1`
- treat `routeEnum == 2` as "inherit previous route"
- store route and flags into action-state globals
- store callback/hash and category beside them

The old caller `func_786(rowIndex, category)` reads embedded B4AC rows with
`func_796(row, field)` / `sys_2C(0x3,row,field)` and builds route/flags without
using `0x1C..0x22`.

Old formula evidence:

```text
extra400 = field_0x2C == 1 ? 0x400 : 0
baseFlag = field_0x03 > 0x12C ? 0x200 : 0x20000
group = field_0x0A
groupExtra = field_0x6E
```

Observed old group mapping:

```text
group 0x00 -> route 0, flags 0x1 + extra400 + baseFlag
group 0x03 -> route 1, flags 0x1 + extra400 + baseFlag
group 0x05 -> route 1, flags 0x1 + extra400 + baseFlag
group 0x0C -> route 1, flags 0x2 + extra400 + baseFlag
group 0x0D -> route 1, flags 0x2 + extra400 + baseFlag
group 0x10 -> route 1, flags 0x1 + extra400 + baseFlag
group 0x15 -> route 1, flags 0x401 + baseFlag
group 0x1F -> route 1, flags (field_0x6E ? 0x402 : 0x4) + baseFlag
group 0x2D -> route 1, flags 0x2 + extra400 + baseFlag
```

Applied the formula to local new tables:

- `0x38C44F75` / `59001001`:
  - group `0x03`: route `1`, flags `0x20001`
  - group `0x0C` / `0x0D`: route `1`, flags `0x20002`
  - group `0x10`: route `1`, flags `0x20001`
  - group `0x1F`: route `1`, flags `0x20004`
- `0x31A97FD4` / `33004001`:
  - rows with `field_0x03 > 0x12C` drop the base flag to `0x200`
  - group `0x1F` with `field_0x6E = 1` yields `0x20402`

Correction to the previous research direction:

- `0x1C..0x22` are still important action-row fields, but they are probably
  selected-callback parameters rather than primary `0x700002` inputs.
- The first-pass `0x700002` reconstruction should prioritize fields `0x0A`,
  `0x03`, `0x2C`, and `0x6E`.
- New-only groups still need native or runtime verification:
  `0x0F`, `0x13`, `0x25`, `0x26`, `0x27`, `0x28`, `0x29`.

Added `tools/research_chrsysparam_700002.py` as a local helper for first-pass
route/flags emulation. It parses `chrsysparam.csyspm` as B4AC table headers plus
little-endian `u32` matrices, applies the old `func_786()` formula to supported
groups, and reports unsupported groups instead of guessing.

Verification commands:

```powershell
python -m py_compile tools\research_chrsysparam_700002.py
python tools\research_chrsysparam_700002.py E:\XB\解包\com\file\0x38C44F75\chrsysparam.csyspm --supported-only | Select-Object -First 15
python tools\research_chrsysparam_700002.py E:\XB\解包\com\file\0x31A97FD4\chrsysparam.csyspm --supported-only | Select-Object -First 20
python tools\research_chrsysparam_700002.py E:\XB\解包\com\file\0x38C44F75\chrsysparam.csyspm E:\XB\解包\com\file\0x31A97FD4\chrsysparam.csyspm | Select-String -Pattern "unsupported_group" | Select-Object -First 20
```

Outcomes:

- syntax check passed
- `59001001` supported rows show the expected groups/flags, e.g.
  `0x03 -> route 1 flags 0x20001`, `0x0C -> 0x20002`,
  `0x1F -> 0x20004`
- `33004001` confirms the `field_0x03 > 0x12C` base-flag drop, e.g.
  group `0x1F` row with `field_0x03 = 0x190` yields flags `0x204`
- `33004001` also confirms the old `field_0x6E` rule for group `0x1F`:
  `field_0x6E = 1` yields flags `0x20402`
- unsupported rows are mostly the expected new-only groups, especially
  `0x0F`, `0x13`, `0x25`, `0x26`, and `0x27`

Editing implication recorded in
`auto-rename-external-file-analysis.md`: future edits should be classified as
MSC-only callback-body edits vs paired `Msc + Param/chrsysparam.csyspm` action
metadata edits. Users should not hand-edit the binary; the needed design is a
structured export/import and exact-preserving binary rebuild for action rows.

## 2026-06-04 follow-up: table1 and derived-action evidence

Added `tools/research_chrsysparam_action_report.py`.

Purpose:

- parse `chrsysparam.csyspm` table0/table1
- parse matching `2.txt` function pointer list
- parse matching `2.c func_873(group)` to map group -> callback function
- parse matching `2.c func_975(hash)` to map phase/predicate hashes -> callback
  functions
- output row-evidence TSV/CSV for action rows and transition rows

Verification commands:

```powershell
python -m py_compile tools\research_chrsysparam_action_report.py tools\research_chrsysparam_700002.py
python tools\research_chrsysparam_action_report.py E:\XB\解包\com\file\0x38C44F75\chrsysparam.csyspm --msc-dir E:\XB\解包\com\file\0x693F756D --mode actions --format csv
python tools\research_chrsysparam_action_report.py E:\XB\解包\com\file\0x31A97FD4\chrsysparam.csyspm --mode transitions --format csv
```

Key `59001001` action summary:

```text
0x03 -> func_950, old route formula covered, 5 rows
0x0C -> func_924, old route formula covered, 8 rows
0x0D -> func_942, old route formula covered, 2 rows
0x0F -> func_946, route unknown, 3 rows
0x10 -> func_956, old route formula covered, 2 rows
0x13 -> func_956, route unknown, 3 rows
0x1F -> func_916, old route formula covered, 7 rows
0x25 -> func_919, route unknown, 2 rows
0x26 -> func_919, route unknown, 2 rows
0x27 -> no group callback, phase callbacks only, 17 rows
0x28 -> no group callback, phase callbacks only, 2 rows
0x29 -> no group callback, phase callbacks only, 1 row
```

Important correction:

- groups `0x27`, `0x28`, and `0x29` are not empty even though `func_873()`
  returns `0`
- their fields `0x02`, `0x7C`, and `0x7D` still resolve through `func_975()`
  into real phase callbacks
- auto-rename should surface these as phase-driven action rows, not hide them

New table1 finding:

- `2.c func_869()` loads table0 fields `0x7E/0x7F` and adds `1` when the value
  is non-negative
- `2.c func_962()` iterates that range
- `2.c func_963()` reads table1 through `sys_0(0x700000, 0x1, row, field)`

So table0 fields `0x7E/0x7F` are zero-based ranges into table1; script-side
table1 access is one-based.

Confirmed with `33004001` / `0x31A97FD4`:

```text
table0 row 20 action 0x280BEB91 group 0x27 range 0..0 -> table1 row 1 action 0x280BEB91
table0 row 18 action 0x2B58E76E group 0x1F range 1..1 -> table1 row 2 action 0x2B58E76E
table0 row 37 action 0x58921C28 group 0x27 range 2..2 -> table1 row 3 action 0x58921C28
table0 row 42 action 0x7AE860E7 group 0x27 range 3..3 -> table1 row 4 action 0x7AE860E7
```

First table1 semantics from `func_963()`:

- fields `0x01`, `0x1F`, `0x20`, `0x21`, `0x22`: action hashes matched against
  current action hash `global855`
- field `0x02`: state compared with `global808`
- field `0x06`: transition mode
- field `0x1C`: optional predicate callback hash via `func_975()`
- fields `0x1D/0x1E`: timing/window thresholds
- fields `0x04/0x05`: returned transition values

Derived-action evidence from `func_921()`:

- current action row fields `0x30..0x39` are derived action-hash keys
- fields `0x59..0x62` are the per-slot delays; field `0x58` is separate
- native `0x700003` maps those keys plus `1 << global143` to another action row
- the returned row's field `0x06` filters route side/state, and field `0x04`
  maps to scheduled input/condition masks through `func_536()`

## 2026-06-04 follow-up: stronger `0x700003` evidence

Read both script-side `0x700003` entry points in `0x693F756D/2.c`:

- `func_900(delay,key)` takes a script-provided key, calls
  `sys_0(0x700003, key, 1 << global143)`, stores the returned row in the first
  free `global936..global945` slot, and schedules `func_928..func_937`
- `func_921(slot,defaultDelay)` reads current table0 fields `0x30..0x39` as
  action-hash keys and fields `0x59..0x62` as per-slot delays, then calls the
  same native lookup
- `func_928..func_937` set `global813` to the candidate row, call `func_874()`,
  then `func_938()` runs phase-only special handlers for groups
  `0x27/0x28/0x29` or falls back to `func_872(candidateRow, 0)`

Extended `tools/research_chrsysparam_action_report.py` with `--mode derived`.
It reports source row, source slot, delay, target row, target action hash,
target group/callback, target `field_0x04`, target schedule mask, and target
`field_0x06`.

Verification commands:

```powershell
python -m py_compile tools\research_chrsysparam_action_report.py
python tools\research_chrsysparam_action_report.py E:\XB\解包\com\file\0x38C44F75\chrsysparam.csyspm --msc-dir E:\XB\解包\com\file\0x693F756D --mode derived --format csv
python tools\research_chrsysparam_action_report.py E:\XB\解包\com\file\0x31A97FD4\chrsysparam.csyspm --mode derived --format csv
```

Outcomes:

- `59001001` / `0x38C44F75`: 42 derived links; every nonzero key in
  `0x30..0x39` matches a table0 action hash at field `0x2E`
- `33004001` / `0x31A97FD4`: 39 derived links; every nonzero key also matches a
  table0 action hash
- no missing derived targets in either checked sample
- both checked table0 samples have unique action hashes:
  `59001001` has `54/54` unique nonzero action hashes, and `33004001` has
  `71/71`; therefore these samples cannot prove duplicate-key variant
  selection

Current best `0x700003` model:

```text
0x700003(actionHashKey, 1 << global143) -> matching table0 action row index
```

The mask likely selects a variant when multiple rows share the same key. The
checked samples prove hash-to-row lookup but do not yet prove duplicate-key
selection rules.

Schedule-mask mapping from target field `0x04`:

```text
0x00 -> 0x001
0x04 -> 0x002
0x08 -> 0x004
0x10 -> 0x008
0x20 -> 0x010
0x40 -> 0x020
0x41 -> 0x040
0x42 -> 0x080
0x43 -> 0x100
0x44 -> 0x400
0x45 -> 0x200
0x46 -> 0x800
```

Example `59001001` links:

```text
row 20 action 0x178D1109 group 0x0C slot 0 delay 11 -> row 21 group 0x27 phase-only
row 20 action 0x178D1109 group 0x0C slot 1 delay 6  -> row 38 group 0x0C func_924 schedule 0x002
row 20 action 0x178D1109 group 0x0C slot 2 delay 11 -> row 41 group 0x0C func_924 schedule 0x100
row 42 action 0x476F6B01 group 0x27 slot 0 delay 30 -> row 43 group 0x1F func_916
row 47 action 0x1DDC5F3A group 0x0F slot 0 delay 0  -> row 48 group 0x29 phase-only schedule 0x800
```

Design implication:

- derived links are a third naming layer, after direct group callbacks and phase
  callbacks
- `0x27/0x28/0x29` rows can often be named by their source row + derived slot
  even when they have no direct group callback
- structured Param export/import must include table1 and table0 `0x7E/0x7F`
  ranges, not only table0 action rows
- auto-rename should output both group-callback names and phase-callback names
- `0x27/0x28/0x29` should use phase evidence names until their native route
  semantics are understood
- Param export/import must preserve fields `0x30..0x39` and `0x59..0x62` as
  derived-action links

## 2026-06-04 follow-up: old embedded B4AC confirms derived-action model

Added `tools/research_old_b4ac_action_report.py`.

Purpose:

- parse old embedded `sys_2D(0x3,row,field,value)` action rows
- treat physical row `0x11` as logical action row `1`, matching old
  `func_796(row,field)` which reads `sys_2C(0x3, 0x11 + row - 1, field)`
- report derived links from fields `0x30..0x39`
- use fields `0x59..0x62` as per-slot delays
- map old `field_0x04` values to schedule masks using old script logic

Verification commands:

```powershell
python -m py_compile tools\research_old_b4ac_action_report.py tools\research_chrsysparam_action_report.py
python tools\research_old_b4ac_action_report.py "G:\1. Gundam - 1011.c" --format csv
```

Outcomes:

- old file has `29` action rows and `29` unique action hashes
- old derived report finds `19` derived links
- all `19` derived links target an action hash present in the same embedded
  table
- no duplicate action hash is present, so the old sample also cannot prove
  duplicate-key variant selection

Function equivalence:

```text
old func_822(delay,key)             -> new func_900(delay,key)
old func_837(slot,defaultDelay)     -> new func_921(slot,defaultDelay)
old func_501(mask,delay,callback)   -> new func_536(mask,delay,callback)
old func_844..func_853              -> new func_928..func_937
```

Old lookup:

```c
candidateRow = sys_74(0x9, actionHashKey, global306);
```

Old file comments say MBON uses `1 << global306`. New script uses:

```c
candidateRow = sys_0(0x700003, actionHashKey, 1 << global143);
```

So `0x700003` is best understood as the newer native wrapper for old
`sys_74(0x9, actionHashKey, unitModeFlag)` derived-row lookup.

Important correction recorded:

- keys are fields `0x30..0x39`
- per-slot delays are fields `0x59..0x62`
- field `0x58` is loaded separately and is not slot 0 delay

Old vs new schedule encoding differs:

```text
mask 0x001: old field04 0x00 -> new field04 0x00
mask 0x002: old field04 0x08 -> new field04 0x04
mask 0x004: old field04 0x04 -> new field04 0x08
mask 0x008: old field04 0x02 -> new field04 0x10
mask 0x010: old field04 0x01 -> new field04 0x20
mask 0x020: old field04 0x10 -> new field04 0x40
mask 0x040: old field04 0x11 -> new field04 0x41
mask 0x080: old field04 0x12 -> new field04 0x42
mask 0x100: old field04 0x13 -> new field04 0x43
mask 0x200: old field04 0x15 -> new field04 0x45
mask 0x400: old field04 0x14 -> new field04 0x44
mask 0x800: old field04 0x16 -> new field04 0x46
```

Design conclusion: the old and new systems share the same evidence graph
(`action row -> derived key -> target row -> schedule mask`), but field-value
decoders must be version-aware.

## 2026-06-04 edit-boundary answer: MSC-only vs paired Param edits

Recorded the explicit answer in
`docs/agent-sessions/msc-workspace-redesign/auto-rename-external-file-analysis.md`.

Conclusion:

- Function auto-renaming in `2.c` is a tooling symbol operation. It does not
  require editing `chrsysparam.csyspm`.
- MSC callback-body edits can stay MSC-only when they preserve the same action
  contract: action row, field `0x2E` action hash, field `0x0A` group, fields
  `0x03/0x04` category/input data, phase keys `0x02/0x7C/0x7D`, derived keys,
  and transition ranges.
- Edits that add/delete/rekey/move actions require paired `Msc + Param`
  support because newer MSC reads the action registry from
  `Param/chrsysparam.csyspm`.
- Because `chrsysparam.csyspm` is binary, the workspace should not ask users to
  hand-edit it. The required design is a structured action-row export/import
  that round-trips unknown fields exactly and rebuilds the binary.

Editor policy to carry forward:

1. allow MSC-only symbol/callback edits;
2. warn when edits change row/hash/group/category/phase/derived/transition
   metadata;
3. block or mark paired edits incomplete until the Param writer exists.

## 2026-06-04 follow-up: local duplicate-key scan and human-readable export v0

Ran a bounded scan over the currently unpacked local
`E:\XB\解包\com\file\**\chrsysparam.csyspm` files to look for duplicate action
hashes in table0 field `0x2E`.

Command:

```powershell
@'
from pathlib import Path
from collections import defaultdict
import sys
sys.path.insert(0, r'E:\TAURI_PROJECT\tools')
from research_chrsysparam_700002 import parse_chrsysparam, MAIN_TABLE_MARKER, u32_hex

root = Path(r'E:\XB\解包\com\file')
paths = sorted(root.rglob('chrsysparam.csyspm'))
for path in paths:
    parsed = parse_chrsysparam(path)
    main_tables = [t for t in parsed['tables'] if t['marker'] == MAIN_TABLE_MARKER and t['columns'] > 0x7F]
    ...
'@ | python -
```

Outcome:

- 7 local `chrsysparam.csyspm` files were present.
- 5 are placeholder-sized `1 x 1` table pairs.
- 2 contain large action tables:
  - `0x31A97FD4`: unit `33004001`, table0 `72 x 128`,
    `71` nonzero action hashes, `71` unique, `0` duplicates.
  - `0x38C44F75`: unit `59001001`, table0 `55 x 128`,
    `54` nonzero action hashes, `54` unique, `0` duplicates.
- Therefore the local unpacked samples still cannot prove how native
  `0x700003` selects a variant when multiple rows share one action hash.

This keeps the current `0x700003` model unchanged:

```text
0x700003(actionHashKey, 1 << global143) -> matching table0 action row index
```

The second argument is still best understood as a unit-mode/variant mask, but
the duplicate-key selection rule remains unverified.

Added `tools/research_chrsysparam_human_export.py`.

Purpose: export `chrsysparam.csyspm` into a human-readable research JSON format
that preserves every raw `u32` cell while also exposing known semantic fields.

Schema target:

```text
schema: research.chrsysparam.human.v0
source_path
unit_id / unit_id_hex
tables[]
  index, marker, rows, columns, offsets
  duplicate_action_hashes
  row_records[]
    row
    kind: action | transition | raw
    raw_cells[]
    known{}
```

For action rows, `known` currently includes:

- field `0x2E` action hash
- field `0x0A` group
- resolved `func_873()` group callback when a matching `--msc-dir` is provided
- fields `0x03/0x04` category/input evidence
- old-B4AC-derived route/flags coverage
- phase callback keys `0x02/0x7C/0x7D` resolved through `func_975()`
- table1 transition range fields `0x7E/0x7F`
- derived links from `0x30..0x39`, delays from `0x59..0x62`, and all candidate
  target rows for the key
- selected named fields while still preserving the full raw row

For transition rows, `known` currently includes:

- action hash match fields `0x01/0x1F/0x20/0x21/0x22`
- field `0x02` state
- field `0x06` mode
- fields `0x04/0x05` returned values
- field `0x1C` predicate callback key resolved through `func_975()`
- timing fields `0x1D/0x1E`

Verification commands:

```powershell
python -m py_compile tools\research_chrsysparam_700002.py tools\research_chrsysparam_action_report.py tools\research_old_b4ac_action_report.py tools\research_chrsysparam_human_export.py
python tools\research_chrsysparam_human_export.py E:\XB\解包\com\file\0x38C44F75\chrsysparam.csyspm --msc-dir E:\XB\解包\com\file\0x693F756D --non-empty-only
```

Result:

- syntax check passed.
- export links `59001001` action rows to group callbacks, phase callbacks,
  derived links, old-formula route/flags, and raw rows in one JSON document.

Design implication: this JSON is not the final editor format yet, but it is the
first concrete "human-readable Param evidence" contract. The eventual editable
format should split this into stable user-facing fields plus an exact-preserved
raw-cell layer for unknown fields and binary rebuild.

## 2026-06-04 follow-up: MSC + Param human-readable bundle v0

Checked whether an IDA MCP tool is currently exposed for direct native
`0x700003` handler research. Tool discovery for IDA returned no tools in this
Codex session, so the next step used local, verifiable evidence rather than
claiming native-handler results.

Added `tools/research_msc_project_human_bundle.py`.

Purpose: build a project-level human-readable JSON bundle from the paired MSC
directory and `Param/chrsysparam.csyspm`.

Schema:

```text
research.msc_project.human_bundle.v0
  unit: id, msc_id, param_id
  paths: msc_dir, chrsysparam
  msc:
    scripts_present
    group_resolver from 2.c func_873 + 2.txt
    phase_resolver_case_count from 2.c func_975
  param:
    embedded research.chrsysparam.human.v0 export
  action_summary[]
  function_candidates{}
  unresolved{}
```

Important design point: `function_candidates` is not a rename dictionary. It is
a many-to-one evidence index from script function name to candidate semantic
labels and supporting rows. A single function can receive multiple candidates,
so this remains reviewable and evidence-based.

Verification commands:

```powershell
python -m py_compile tools\research_chrsysparam_human_export.py tools\research_msc_project_human_bundle.py
python tools\research_msc_project_human_bundle.py --unit-id 59001001 --msc-id 0x693F756D --param-id 0x38C44F75 --msc-dir E:\XB\解包\com\file\0x693F756D --chrsysparam E:\XB\解包\com\file\0x38C44F75\chrsysparam.csyspm --non-empty-only
```

Pipe/JSON decoding issue found and fixed: both JSON export scripts now
reconfigure stdout to UTF-8 before writing, while `--output` still writes UTF-8
files directly.

Validation result for `59001001`:

- schema: `research.msc_project.human_bundle.v0`
- scripts present: `0.c`, `1.c`, `2.c`
- group resolver entries: 9 groups
  (`0x03`, `0x0C`, `0x0D`, `0x0F`, `0x10`, `0x13`, `0x1F`, `0x25`, `0x26`)
- `func_975` phase resolver cases: 162
- action summary rows: 54
- function candidate entries: 150 script functions
- route unknown rows: 30
- no group callback rows: 20
- phase unresolved count: 0
- derived missing count: 0

This is the first project-level "human-readable MSC + Param" artifact:

```text
resource ids
  -> paired Msc directory + Param/chrsysparam
  -> script resolver evidence
  -> Param row evidence
  -> function candidate evidence
  -> unresolved fields/rows for reverse work
```

Remaining blocker for full semantics is unchanged: current local data still
lacks duplicate action-hash rows, and IDA native tools are not exposed in this
session, so `0x700003` duplicate-key variant selection remains unproven.

## 2026-06-04 follow-up: category bits and safer human-readable labels

Re-read the existing TypeScript helper
`src/page/TestEditor/utils/mscActionRename.ts`. Its old approach maps `0.c`
condition masks to fixed stems:

```text
0x1   -> ACTION_A_SHOT
0x2   -> ACTION_B_MELEE
0x4   -> ACTION_B_MELEE_DIR_1
0x8   -> ACTION_B_MELEE_DIR_2
0x10  -> ACTION_B_MELEE_DIR_3
0x20  -> ACTION_B_MELEE_DIR_4
0x40  -> ACTION_B_MELEE_VARIANT
0x80  -> ACTION_AB_SUB
0x100 -> ACTION_AC_SPECIAL_SHOT
0x200 -> ACTION_BC_SPECIAL_MELEE
0x400 -> ACTION_ABC_FINAL_ATTACK
0x800 -> ACTION_CHARGE_SHOT
```

That helper is valid for older `0.c func_143()` structures that directly expose
mask branches. It is not directly valid for newer `sys_41 -> func_144 ->
func_145` flow because the newer flow returns a row-derived category, not the
old branch mask.

Re-read the user-provided MBON-derived, FB-compatible file around `input()` and
`assign_B4AC_Weapon_Inputs()`. Its category derivation matches the newer
`0x693F756D/0.c func_144()` shape, but with different field `0x04` values:

```text
old:
field04 0x01 -> category 0x04
field04 0x02 -> category 0x03
field04 0x04 -> category 0x05
field04 0x08 -> category 0x02
field04 0x0C -> category 0x02
field04 0x03 -> category 0x04
field04 0x0F -> category 0x02

new 59001001:
field04 0x20 -> category 0x04
field04 0x10 -> category 0x03
field04 0x08 -> category 0x05
field04 0x04 -> category 0x02
field04 0x0C -> category 0x02
field04 0x30 -> category 0x04
field04 0x3C -> category 0x02
```

The old file also contains explicit comments:

```text
global51 & 0x1 = Shooting
global51 & 0x2 = Melee
```

and `write_Weapon_Type_Enum()` writes `1` for shooting and `2` for melee.

This proves a safer first-pass interpretation:

- category bit `0x1` means shooting-type evidence
- category bit `0x2` means melee-type evidence
- category values with higher bits, such as `0x04`, `0x08`, and `0x1F`, are
  composite or still unnamed; do not force them into fixed labels like Sub,
  Special Shot, or Special Melee yet

Updated `tools/research_chrsysparam_human_export.py`:

- added `computed` category using the newer `func_144()` field `0x03/0x04`
  formula
- added `gameplay_type_bits` with `shooting_bit`, `melee_bit`, and
  `unknown_bits`

Updated `tools/research_msc_project_human_bundle.py`:

- action labels now include category:
  `ACTION_ROW_001_CAT_00_GROUP_03`
- function candidates carry category and gameplay bit evidence
- bundle includes `category_summary`

Validation for `59001001`:

```text
actions: 54
category 0x00: 2 rows
category 0x01: 1 row, shooting bit
category 0x02: 2 rows, melee bit
category 0x04: 1 row, unknown bit 0x04
category 0x05: 1 row, shooting bit + unknown bit 0x04
category 0x06: 1 row, melee bit + unknown bit 0x04
category 0x07: 3 rows, shooting bit + melee bit + unknown bit 0x04
category 0x08: 4 rows, unknown bit 0x08
category 0x09: 4 rows, shooting bit + unknown bit 0x08
category 0x0A: 2 rows, melee bit + unknown bit 0x08
category 0x0B: 1 row, shooting bit + melee bit + unknown bit 0x08
category 0x1F: 32 rows, shooting bit + melee bit + unknown bits 0x1C
```

Design decision: the current human-readable layer should use labels such as
`ACTION_ROW_003_CAT_0B_GROUP_03` and expose bit evidence. It should not yet emit
claims such as `ACTION_SUB` or `ACTION_SPECIAL_SHOT` unless further `sys_41`
input-selection or native evidence confirms the exact mapping.
