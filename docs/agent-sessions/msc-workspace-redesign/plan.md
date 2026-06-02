# Plan: MSC Workspace Reverse-Packing & Mod-Dev Redesign

**Source request**: free-form (TestEditor MSC workspace optimization + UI/UX redesign + auto-naming gap audit)
**Mode**: planning only (no code changes this session)
**Complexity**: Large (spans Python toolchain, Tauri commands, React workspace, and a naming-data layer)

---

## 1. Design Read

Reading this as: a redesign of a dense desktop tool surface (MSC reverse-engineering workspace
inside a Tauri IDE-like app) for an expert single-user mod developer, with a Dark Industrial
language, leaning toward the project's existing shadcn/ui + Tailwind + Slate/Zinc + Blue-500
direction (redesign-preserve).

`design-taste-frontend` Section 13 excludes dashboards / dense product UI / editors / wizards, so
only its transferable principles apply here (hierarchy by scale and weight, one locked accent,
shape lock, motivated motion only, full loading/empty/error states, button contrast, high density
with mono for hex). The landing-page rules (hero, eyebrows, marquees) are out of scope.

---

## 2. Summary

The MSC workspace works but forces a 6+ step, per-file, manual reverse-packing loop with weak
naming and no project memory. The single biggest user-visible gap is **function auto-naming**:
the "standard-version" path (standard-library XML via `--assumeCharStd`) is dormant and the
"new-version" path has no data wired at all. This plan (a) explains exactly what is missing for
auto-naming, (b) redesigns the reverse-packing pipeline to be project-centric and batch-driven
with round-trip verification, and (c) redesigns the UI to a hierarchical Dark Industrial layout
with symbol resolution as a first-class inspectable stage.

### 2026-06-02 Correction

The new-version action auto-rename design must **not** use an `action_hash -> name` dictionary.
The user explicitly rejects a dictionary fallback. The correct direction is dynamic mapping:
derive fixed gameplay labels and semantic names from script routes, slot tables, resource usage,
and decoded per-unit labels. So far, no file has been found that records the original new-version
action hash names.

---

## 3. Current-State Audit

### 3.1 Frontend (`MscWorkspaceView.tsx`)
A flat list of file cards. Per file type:

| File | Actions today |
|---|---|
| `.bscex/.cscex/.dscex` | Convert (confirm dialog -> `mscdec.py`) |
| `0.c` / `1.c` | Open Cursor, Repack, (Convert auto-applies `func_0 -> main`) |
| `2.c` | Open Cursor, Rename Actions, Repack, (Convert auto-applies action rename + `func_0 -> main`) |
| `.txt` | Open Cursor |
| folder | Repack Folder (`repack_fhm2d` -> `.fhm2d`) |

Problems:
- Mapping path is hardcoded to `exvs_0xF1EF3B32.native_truth.json` for every script.
- Convert never passes `--assumeCharStd` or `--xmlPath` (standard-lib naming never runs).
- All buttons are gray (`bg-gray-500..900`): no visual hierarchy, every action looks equal.
- Hard dependency on an external `cursor` CLI for editing.
- No persistence: the folder must be re-picked every session (problem #20).
- Per-file manual clicking: no "decompile all" / "repack all"; a confirm dialog per convert.
- `Rename Actions` overlaps with what Convert already does for `2.c` (redundant, confusing).
- No diff, no round-trip verification, no symbol overview.

### 3.2 Toolchain status vs `msc-system-problems-analysis.md`
Resolved since that doc: dual cores unified into `msc_core` (#1/#16), `0x2E -> 0xAE` post-compile
binary patch removed (#2), CFG-based reference resolution via `msc_cfg.py` with `use_cfg=True` (#3).

Still open: duplicate UI `src/page/MSCEdit/*` (#5); hardcoded mapping + `cursor` paths (#6);
type/float heuristics (#7/#8); regex switch-case beautification over generated `.c`
(`convert_if_else_dispatchers_to_switch`, #15); no round-trip tests (#12); global mutable state
(#17); noisy mixed-language debug output (#18); no workspace persistence (#20). Deprecated
`mscdec_msc.py` / `msclang_msc.py` still sit in `tools/` as dead code.

### 3.3 The four function-naming mechanisms (today)
1. **Sequential**: `func_N`, entrypoint renamed to `main`. Always on.
2. **Standard-lib XML** (`--assumeCharStd` + `mscinfo.xml` or `--xmlPath`): pulls real function and
   global names from XML metadata (`funcNames[f.id] = f.name`). This IS "standard-version"
   auto-naming, but it is **dormant**: the UI never passes the flag and no `mscinfo.xml` ships.
3. **Native-truth mapping** (`--exvsMapping`): `function_ref` decodes a constant to a symbol via
   `functions_by_offset`, which is built from `script_functions`. That array is **empty** in the
   only mapping file, so it produces no names. `script_delta` rules only relocate offsets for
   compile correctness; they do not name anything.
4. **Action-mask rename** (TS `mscActionRename.ts`): renames `2.c` callbacks to `ACTION_*` by
   parsing `0.c func_143`. Hardcoded to `func_143/func_95/func_241/global48/global20/global2` and a
   12-entry mask table; tuned to the `0xF1EF3B32` layout.

---

## 4. Gap Analysis: what "standard" vs "new" MSC needs for auto-naming

| Capability | Standard MSC (`0xF1EF3B32`) | New MSC (other characters) |
|---|---|---|
| Sequential `func_N` + `main` | yes | yes |
| Standard-lib XML names | possible, but UI does not invoke it; no `mscinfo.xml` in repo | same gap |
| Native-truth `function_ref` names | rule exists but `script_functions` empty -> no names | no mapping file at all |
| `script_delta` offset relocation | yes (3 rules) | none defined |
| Action-mask callback names | works (layout matches) | likely breaks (hardcoded func ids / 12 masks) |
| Mapping selection | hardcoded single path | nothing selects a per-character mapping |

**What is missing to enable function auto-naming (both versions):**

1. **`script_file_id` auto-detection** so the toolchain can pick the right mapping/XML per character
   instead of always using `0xF1EF3B32`.
2. **A populated `script_functions` offset -> symbol table** in the native-truth mapping. It is
   empty even for the reference character, so `function_ref` naming is inert.
3. **A shipped standard-library `mscinfo.xml`** (or per-project `--xmlPath`) wired through
   `--assumeCharStd` from the UI. This is the actual "standard-version" naming channel and it is
   currently never used.
4. **A generalized action-router discovery** in `mscActionRename` instead of hardcoded
   `func_143/func_95/func_241`, plus a complete mask table, so "new" characters get `ACTION_*` names.
5. **An IDA ground-truth extraction pass** for each new character. The workflow doc scoped extraction
   to `0xF1EF3B32` "first"; nothing has been extracted for others, so there is no symbol source.
6. **Dynamic action mapping** to trace each action hash through callback, slot callback,
   slot-hash/resource usage, and param labels. This replaces the earlier dictionary/CRC32 idea.
7. **A per-project mapping report** holding evidence, confidence, and user-reviewed labels.
   It must not become a blind action-hash dictionary.

Short answer for the user: the **standard MSC** is "almost named" but the UI does not invoke its
XML naming channel and the offset table is empty; the **new MSC** has none of the four data sources
(no mapping, no XML, no matching action layout, no extracted ground truth), so it falls back to bare
`func_N`. Closing the gap means turning naming into one ordered, data-driven, per-script resolution
stage rather than four disconnected ad-hoc passes.

---

## 5. Reverse-Packing Workflow Redesign

### 5.1 Today (per-file, manual)
```
extract .fhm2d -> folder (0.bscex/1.cscex/2.dscex + _structure.json)
  -> Convert 0  (click + confirm)   -> 0.c (func_0->main)
  -> Convert 1  (click + confirm)   -> 1.c (func_0->main)
  -> Convert 2  (click + confirm)   -> 2.c (action rename + func_0->main)
  -> edit in external Cursor
  -> Repack 0 / Repack 1 / Repack 2 (3 clicks)
  -> Repack Folder -> .fhm2d
```

### 5.2 Proposed (project-centric, batch, verifiable)
```
Open MSC Project (folder)  ->  persisted project + per-file state
  Stage 1 Decompile All     (one action; runs 0/1/2 with correct mapping + xml)
  Stage 2 Resolve Symbols   (ordered: xml -> native-truth -> dynamic action graph -> user review)
                            -> writes/updates project mapping evidence; shows Symbol table
  Stage 3 Edit              (in-app .c preview/diff; external editor optional)
  Stage 4 Recompile All     (msclang.py with the same per-project mapping)
  Stage 5 Round-trip Verify (byte-compare recompiled vs original; first-divergence report)
  Stage 6 Repack Folder     -> .fhm2d
```

Principles:
- Naming order is explicit and deterministic; each name carries its source.
- Every stage is idempotent and shows status (idle / running / ok / warn / fail).
- Mapping + XML are selected by `script_file_id`, with a clear "no mapping yet" branch that offers
  a visible unresolved-action report and research path for finding the real action-hash source.
- Round-trip verification is built in, addressing problem #12 directly in the UX.

---

## 6. UI/UX Redesign (Dark Industrial)

Density dial high (cockpit), motion low and motivated only, one accent (Blue-500) locked, one radius
scale, mono type for hex/offsets. Aligns with `2026-05-11-test-editor-redesign-design.md`.

### 6.1 Layout
```
+-----------------------------------------------------------------------------------+
| Toolbar:  [Open Project]  [Decompile All]  [Recompile + Repack]  [Verify]   o ok  |
+----------------+--------------------------------------+---------------------------+
| PROJECT RAIL   | CENTER: Symbols + Source/Diff        | INSPECTOR                 |
|                |                                      |                           |
| > 0.bscex  ok  | func_0    -> main        [seq]       | File: 0.bscex             |
| > 1.cscex  ok  | func_143  -> actionRouter[xml]       | script_file_id: 0xF1EF..  |
| > 2.dscex  *   | func_241  -> ACTION_A_SHOT [mask]    | mapping: matched          |
|                | func_981  -> ?            [unnamed]  | xml: mscinfo.xml          |
| Pipeline:      | ...                                  | round-trip: PASS          |
| [#####----] 60%| (inline rename, source badge each)   | [Open in editor]          |
+----------------+--------------------------------------+---------------------------+
| Status bar: Decompiling 2.dscex...  |  142 symbols, 7 unnamed  |  last verify PASS |
+-----------------------------------------------------------------------------------+
```

### 6.2 Button hierarchy (replaces the all-gray set)
- Primary (filled Blue-500): the current pipeline-advancing action (Decompile All / Recompile).
- Secondary (outline): Open Project, Verify, Repack Folder.
- Ghost / icon: per-row actions (open file, rename symbol, reveal in tree).
- Destructive (red, confirm): overwrite-existing-output actions.
- Lock one radius scale; tint shadows to the surface; honor `prefers-reduced-motion`.

Note: the project already uses `lucide-react` widely. The design skill discourages Lucide as a
default, but project consistency wins here; keep Lucide and standardize stroke width. Do not mix
icon families.

### 6.3 Symbol table (the naming surface)
- One row per function: current name, resolved name, source badge (`seq / xml / native / dynamic-route / param-label / user`).
- Inline rename writes to the project mapping evidence as user-reviewed data; it is not treated as
  a global hash dictionary.
- Filter chips: `unnamed`, `user-edited`, `conflicts`. Mono font for ids and hex.

### 6.4 States
Loading: per-stage skeleton + progress in the status bar (not a generic spinner).
Empty: "No MSC project open" with a single Open Project action.
Error: inline on the failing file row + toast, with the tool's stderr in the inspector.

---

## 7. Phased Roadmap

### Phase 1 - Auto-naming foundation (highest value)
- script_file_id auto-detection (folder name + MSC header).
- Per-script mapping/XML resolution; graceful "no mapping" branch.
- Populate `script_functions` for `0xF1EF3B32`; ship `tools/mscinfo.xml`; wire `--assumeCharStd`/`--xmlPath` from the UI.
- Define and persist a per-project dynamic mapping report with evidence and confidence.

### Phase 2 - Generalized naming
- Discover action-router function instead of hardcoded ids; complete the mask table.
- Build dynamic action-route extraction for new-version MSC.
- Keep unresolved action hashes visible while researching the true recording source.

### Phase 3 - Pipeline + verification UX
- Project model + persistence (DocumentRegistry-style store).
- Batch Decompile All / Recompile + Repack All with per-stage status.
- Round-trip verify with first-divergence report.

### Phase 4 - UI redesign + cleanup
- 3-region Dark Industrial layout, button hierarchy, symbol table, status bar, in-app diff.
- Remove `src/page/MSCEdit/*`; remove `tools/mscdec_msc.py` + `tools/msclang_msc.py`.
- Round-trip regression tests; route debug output behind a verbosity flag.

---

## 8. Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Path helpers | `src/page/TestEditor/utils/mscWorkspaceUtils.ts` | pure helpers that throw on illegal input (no fallback) |
| Mapping model | `tools/exvs_native_truth.py` | dataclass rules + `from_path`, explicit `ExvsMappingError` |
| Workspace store | `2026-05-11-test-editor-redesign.md` (DocumentRegistry/WorkspaceStore) | Zustand store, dirty tracking |
| Tauri command | existing `repack_fhm2d` invoke in `MscWorkspaceView` | typed `invoke` with explicit args |
| Tests | `tools/tests/test_cfg_refs.py`, `paramEntryUtils.test.ts` | round-trip / parity comparison style |

---

## 9. Files to Change (when implementing; not this session)

| File | Action | Why |
|---|---|---|
| `tools/exvs_native_truth.py` | UPDATE | populate/consume `script_functions`; per-id loading |
| `tools/mappings/exvs_0xF1EF3B32.native_truth.json` | UPDATE | fill `script_functions` offset->symbol |
| `tools/mappings/<new id>.native_truth.json` | CREATE | per-character mappings |
| `tools/mscinfo.xml` | CREATE | standard-lib function/global names for `--assumeCharStd` |
| `tools/mscdec.py` | UPDATE | id detection; consistent symbolization order |
| `tools/mscActionRename.*` (port to py or keep ts) | UPDATE | generalize router discovery + mask table |
| `src/page/TestEditor/utils/mscWorkspaceUtils.ts` | UPDATE | id detection + mapping/xml resolution |
| `src/page/TestEditor/components/msc-editor/*` | UPDATE | pipeline UI, symbol table, button hierarchy |
| `src/page/TestEditor/store/*` | CREATE | project + document registry |
| `src/page/MSCEdit/*` | DELETE | dead duplicate UI (after parity) |
| `tools/mscdec_msc.py`, `tools/msclang_msc.py` | DELETE | deprecated cores |

---

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Round-trip not byte-stable, so verify always fails | High | Land Phase 3 verify against known-good first; treat as report, not a gate, until stable |
| Wrong mapping auto-selected for a new id | Medium | Require explicit confirmation when id has no mapping; never silently use `0xF1EF3B32` |
| Generalized action router misnames callbacks | Medium | Keep source badges + user override; never overwrite a `user` name |
| Removing MSCEdit breaks a `.bin` flow still in use | Medium | Confirm `.bin` parity in new UI before deletion |
| Dynamic mapping overfits one script layout | Medium | Keep evidence badges, confidence levels, and unresolved states instead of forcing names |

---

## 11. Acceptance / Open Questions

Acceptance (per phase): a new character folder decompiles with named functions where data exists,
unnamed funcs are clearly flagged, names persist across recompile, and round-trip verify reports a
clear pass/fail.

Open questions for the user before implementation:
1. Phase priority: start with auto-naming foundation (Phase 1), or the UI redesign (Phase 4) first?
2. Should `mscActionRename` stay in TypeScript or be ported into the Python toolchain so naming lives
   in one place?
3. Is there an existing `mscinfo.xml` (standard-library names) anywhere, or must it be reconstructed?
4. For "new MSC": where should we search next for the file or runtime table that records action
   hash names, if it exists?
