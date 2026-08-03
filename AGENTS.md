# AGENTS.md

This file is AI-only operating guidance for coding agents working in this
repository. It complements human-facing docs and should be treated as the
cross-agent hub for Cursor, Claude, Codex, Copilot, and other coding agents.

## Project Identity

- **Framework**: Tauri v2 desktop application (Rust backend + React/TypeScript frontend).
- **Domain**: EXVS2 Over Boost game asset editing — MSC script decompilation/
  recompilation, binary format parsing, 3D model/animation editing, and modding
  workflows.
- **Key subsystems**:
  - `tools/` — Python-based MSC bytecode toolchain (`mscdec.py`, `msclang.py`,
    `disasmlib.py`, `msc_core.py`, `msc_cfg.py`).
  - `src-tauri/` — Tauri Rust backend, including agent-facing CLIs `exvs2-json`
    (`exvs2_json`) and `fhm2d-extract` (`fhm2d_extract`); see
    [CLI Tools](#cli-tools-agent-facing).
  - `src/page/` — React page components (TestEditor with MSC workspace, UnitEdit,
    FilesEdit, SceneEdit, etc.).
  - `docs/` — Format specifications and research notes.

## Mandatory Task Startup Protocol

Before doing any task, every AI agent must:

1. Read this file first.
2. Read the Cursor project rule: `.cursor/rules/custom-rules.mdc`.
3. Search `docs/` for Markdown files relevant to the user's request, then read
   the most relevant specifications before touching code or assets.

## Lightweight Agent Sessions

Use a lightweight session note only for multi-step research, work that spans
multiple turns, or work that may need a handoff. Simple questions and small,
self-contained changes do not require a session file.

- Store new session notes as `docs/agent-sessions/YYYY-MM-DD-<topic>.md`.
- Use the date-first `YYYY-MM-DD` naming convention and a short lowercase
  kebab-case topic.
- Keep one file per task. Do not create separate `todo.md` / `process.md` pairs.
- Keep the note concise: goal, relevant context, current progress, verification
  evidence, and remaining work are sufficient.
- Update the note only when material findings or task state change. Platform
  plans and checklists are optional, not mandatory phase gates.
- For short tasks, the final response is the session record.

### Legacy auxiliary notes

The repo may contain older per-topic note folders under `docs/` (historically
`todo.md` / `process.md` pairs). That layout is a **legacy, separate workflow**
from an earlier AI task manager. It is **auxiliary only**:

- **Do not** adopt it as your primary task tracker, handoff system, or startup
  obligation.
- **Do not** create or update those folders unless the user explicitly asks.
- **May** read existing notes when they contain useful historical context,
  research evidence, or prior decisions for the current task.
- For current truth, prefer `docs/` specifications and current verification
  evidence over stale session notes.

## Required Documentation Sources

Use `docs/` as the first source of project truth:

- `docs/msc-binary-format-spec.md` — MSC bytecode format specification (header,
  opcodes, pushBit, script offset table, string table, EXVS2 vs Smash differences).
- `docs/exvs-stage-numatb-simple-color.md` — stage map props with only a color
  texture: use `FeRendererMovableVertexColor` → `vstgStandard_VertexColor`, strip
  unused PBR slots (avoids in-game overexposure).
- `docs/gvs-numatb-step2-migration-changes.md` — GVS→EXVS2 numatb migration rules.
- `docs/exvs2-json-cli.md` — `exvs2-json` CLI for EXVS2 binary resource
  inspection, scoped JSON-driven editing, and correlation JSON (implementation
  in `src-tauri/`).
- `docs/nuanmb-ath-helper-bone-policy.md` — homemade NUANMB must **not**
  author/edit/convert `ATH_*` helper bones; writer omits whole Transform
  nodes (NUHLPB + rest only). Code: `ssbh_motion_interchange/nuanmb.rs`.
- `docs/nuanmb-exvs2-import-in-game-layout.md` — homemade body/shot NUANMB
  for **in-game** use. Retest ranking: **indexed multi-frame `0x4300` is the
  critical shot fix**; also CompScale/Visibility shell + hygiene (no ATH /
  residual / wrong source); **full Translate on every bone** (omit-limb-T not
  required). Import FBX write path. Code: `ssbh_motion_interchange/nuanmb.rs`.
- `docs/fhm2d-extract-cli.md` — `fhm2d-extract` CLI for unpacking OB `.fhm2d`
  with required `--type` / `--layout`; agent outputs must stay under `tmp/`
  (see `.cursor/rules/fhm2d-extract-artifacts.mdc`).
- `docs/characterparam-field-notes.md` — characterparam empirical field
  identity (`lockOnDistanceMax` + `alertRangeDistance` = 红锁,
  `boostGaugeInitial` = HP); prefer over stale pool names when they conflict.
  **Superseded on the lock question** by
  `docs/lock-on-range-native-resolution-ob.md`: the red-lock boundary is
  `min(Family1, Family2*scale + offset - 1)`, so no single field owns it.
- `docs/param-evidence-registry.tsv` — machine-readable evidence state for every
  `speedparam` / `characterparam` field hash: grade, consumption mechanism, value
  spread, citation. Generated; validated by `tools/check_param_name_evidence.py`.
- `docs/lock-on-range-native-resolution-ob.md` — full decompiled lock-on chain
  (band resolver, inner/outer radius formulas, slot-selection gate).
- `docs/characterparam-native-consumer-map-ob.md` — all 197 characterparam fields
  classified by consumption mechanism (128 code / 32 `.rdata` hash array / 37
  absent), with the `find immediate` false-negative trap documented.
- `docs/speedparam-msc-consumer-evidence.md` — per-hash MSC call-site arithmetic
  for all 74 speedparam fields.
- `docs/param-table-id-file-binding-proof.md` — proven `sys_0` table id → param
  file bindings (`0x60006`=speedparam, `0x60002`=grapparam, `0x60007`=interactionid).
- `docs/msc-research/gyan-main-shot-no-auto-turn.md` — disable main-shot
  auto-turn (`global693` / `func_592`); flight uses `global24 & 0x4000`.
- `docs/msc-research/gyan-melee-direction-actions.md` — Gyan directional melee:
  后格 = `ACTION_B_MELEE_DIR_4` (`0x58CC87CE`); 左右 = `DIR_2` / motion
  `0xECE28FD9` (not 后格).
- `docs/msc-research/gyan-back-melee-movement.md` — 后格位移: `func_495` +
  `func_528`/`func_516` 追踪 + `func_964`/`func_965` → `sys_46(0x1,0x4,…)`.
- `docs/msc-research/gyan-session-2026-07-11-handoff.md` — Gyan/tooling session
  (Param `0x35B195CC`, speed C2 vs B7, flight camera, Dodai spawn VFX vs N2,
  Param Editor labels, Extract→Workspace).
- `docs/param-editor-typed-labels-notes.md` — typed Param Editor list labels
  (kind-7 string/offset) and Extract-to-Workspace behavior.

When adding new research findings, write them under `docs/` as standalone
specifications or research notes.

## Technology Constraints

1. Use **Tauri v2 APIs/plugins** for all native file system access, dialogs, and
   OS interactions. Do not use Node.js `fs`, `path`, or browser-only APIs for
   native operations.
2. All multi-byte integers in MSC **headers** are **little-endian (LE)**. All
   opcode parameters in the **script body** are **big-endian (BE)**.
3. For `bone_index`, hash, jnttbl, nusktb calculations, always use **LE values**
   for matching. BE/LE switching is UI-only.
4. Performance-sensitive operations (large file reads, heavy re-renders, deep
   recursion) must be flagged to the user before implementation.
5. Python MSC tools use `msc_core.py` as the unified MSC definition module.
   The old `mscdec_msc.py` and `msclang_msc.py` are deprecated.

## MSC Toolchain Architecture

The MSC decompile/compile pipeline:

```
MSC binary (.bscex/.cscex/.dscex)
  → disasmlib.py (CFG-based script reference resolution via msc_cfg.py)
  → mscdec.py (bytecode → C decompilation + switch-case beautification)
  → .c file

.c file
  → msclang.py (legacy repack; use msclang_modern.py for semantic research only)
  → MSC binary (.mscsb)
```

Key design decisions:
- Function pointer resolution happens at disassembly time (msc_cfg.py), not via
  post-processing text patches on .c output.
- The compiler's `addArg()` correctly tracks nested `try`/`callFunc` depth to set
  pushBit, eliminating the need for binary patching (0x2E→0xAE).
- `msc_cfg.py` builds control flow graphs per script and performs per-basic-block
  stack simulation to resolve script references.

## CLI Tools (Agent-Facing)

### `exvs2-json` (Cargo binary: `exvs2_json`)

Read-only CLI for converting known EXVS2 binary/resource files into structured
JSON. There is **no** tool named `exvs2-cli`; use `exvs2-json` / `exvs2_json`.

| Item | Path |
|------|------|
| Full spec | `docs/exvs2-json-cli.md` |
| CLI core | `src-tauri/src/exvs2_json_cli/` |
| Binary entry | `src-tauri/src/bin/exvs2_json.rs` |
| Integration tests | `src-tauri/tests/exvs2_json_cli_test.rs` |
| Debug executable (agent default) | `src-tauri/target/debug/exvs2_json.exe` |
| Release executable | `src-tauri/target/release/exvs2_json.exe` (**only if user asks**) |

**Agent build policy (mandatory):** Do **not** use `cargo … --release` for normal
work. Prefer debug for speed. See `.cursor/rules/no-release-builds.mdc` and
`.cursor/rules/custom-rules.mdc` §7a.

**Artifact location policy (mandatory):** Every persisted artifact created while
preparing, running, or validating `exvs2-json` must be placed under the
repository-root `tmp/` directory. Prefer a task-scoped directory such as
`tmp/exvs2-json/<task>/`. This includes redirected `inspect` / `correlate` JSON,
edit request JSON, files written by `edit --output`, reports, logs, diffs, and
manually created round-trip fixtures. Do not write these artifacts beside source
assets, into `docs/` or `src-tauri/`, or directly into the repository root.
Paths are relative to the current working directory: use `tmp/...` from the
repository root and `../tmp/...` from `src-tauri/`. Console-only output does not
create an artifact; redirect it into `tmp/` whenever it needs to be retained.
See `.cursor/rules/exvs2-json-artifacts.mdc`.

**Commands**

- `inspect` — parse `.jnttbl`, `character_id_table.bin`, `vernier_table`,
  `armsparam`, `bulletparam`, `projectile_depiction_table`, `navi_list`,
  `pilot_list`, and SSBH model files (`.nusktb`, `.numshb`, `.numdlb`;
  auto-detect or `--type`). Prefer `--summary --pretty` for large files; for
  `.numshb` use `--raw-fields` only when full vertex buffers are required.
- `edit` — apply AI-facing JSON edit requests to lossless builder-backed file
  types (`jnttbl`, `character_id_table`, `vernier_table`, `armsparam`,
  `bulletparam`, `speedparam`, `projectile_depiction_table`, `navi_list`,
  `pilot_list`). Use `--dry-run` for preview-only output; SSBH files remain
  inspect-only because their rewrite is not byte-identical.
- `correlate` — emit a JSON skeleton joining unit/weapon/dispatcher/IDA evidence
  (paste IDA symbols via optional flags; does not call IDA automatically).

**Run** (from `src-tauri/`; **debug only** unless user requests release):

```powershell
cargo run --bin exvs2_json -- --help
New-Item -ItemType Directory -Force "..\tmp\exvs2-json\<task>" | Out-Null
cargo run --bin exvs2_json -- inspect "<path>" --summary --pretty |
  Out-File -Encoding utf8 "..\tmp\exvs2-json\<task>\inspect.json"
cargo run --bin exvs2_json -- edit "<path>" --request "..\tmp\exvs2-json\<task>\edit-request.json" --output "..\tmp\exvs2-json\<task>\edited.bin" --pretty |
  Out-File -Encoding utf8 "..\tmp\exvs2-json\<task>\edit-report.json"
cargo run --bin exvs2_json -- correlate --unit 001GUNDAM/005GYAN00/001 --weapon SuibakuMissile --id 10050102 --pretty |
  Out-File -Encoding utf8 "..\tmp\exvs2-json\<task>\correlation.json"
# Prefer after code change:
cargo build --bin exvs2_json
# then: .\target\debug\exvs2_json.exe inspect ...
```

JSON output envelope always sets `"tool": "exvs2-json"`. Reuses the same Rust
parsers as the desktop editor backend. Cross-repo pickup for  hook
research: `docs\EXVS2JsonCli.md`.

### `fhm2d-extract` (Cargo binary: `fhm2d_extract`)

Standalone OB `.fhm2d` unpacker with **required** `--type` naming and explicit
`--layout folder|flat`. Same thin-bin + library CLI core pattern as `exvs2-json`.
Prefer this CLI for agent-side FHM2D unpack; do not use legacy
`fhm2d_extract_folder` unless the user asks.

| Item | Path |
|------|------|
| Full spec | `docs/fhm2d-extract-cli.md` |
| CLI core | `src-tauri/src/fhm2d_extract_cli/` |
| Binary entry | `src-tauri/src/bin/fhm2d_extract.rs` |
| Extract engine | `src-tauri/src/format/fhm2d.rs` |
| Integration tests | `src-tauri/tests/fhm2d_extract_cli_test.rs` |
| Debug executable (agent default) | `src-tauri/target/debug/fhm2d_extract.exe` |
| Artifact isolation rule | `.cursor/rules/fhm2d-extract-artifacts.mdc` |

**Agent build policy (mandatory):** Debug only. See
`.cursor/rules/no-release-builds.mdc` and `.cursor/rules/custom-rules.mdc` §7a.

**Artifact location policy (mandatory):** Every persisted artifact created while
preparing, running, or validating `fhm2d-extract` must be placed under the
repository-root `tmp/` directory. Prefer a task-scoped directory such as
`tmp/fhm2d-extract/<task>/`. This includes `--output` extract folders, sibling
`*_structure.json`, `meta.bin`, redirected logs, reports, and temporary
fixtures. Do **not** extract beside source `.fhm2d` assets, into game/workspace
trees, `docs/`, `src-tauri/`, or the repository root unless the user explicitly
requests that path. Paths are relative to the current working directory: use
`tmp/...` from the repository root and `../tmp/...` from `src-tauri/`. See
`.cursor/rules/fhm2d-extract-artifacts.mdc` and custom-rules §7c.

**Run** (from `src-tauri/`; **debug only**):

```powershell
cargo build --bin fhm2d_extract
$task = "..\tmp\fhm2d-extract\<task>"
New-Item -ItemType Directory -Force $task | Out-Null
.\target\debug\fhm2d_extract.exe "<source.fhm2d>" `
  --output "$task\pack" `
  --type motion `
  --layout folder `
  2>&1 | Tee-Object -FilePath "$task\extract.log"
# flat example:
.\target\debug\fhm2d_extract.exe "<source.fhm2d>" -o "$task\pack_flat" -t character -l flat
```

**Required flags (no silent defaults):** `--type` / `-t` and `--layout` / `-l`
(`folder` | `flat`). Types: `character`, `effect`, `motion`, `msc`, `sound`,
`character_param`, `character_cost`, `all_nutexb`, `stage_list` (also `fhm2d_*`).

Writes files under `--output` and `<out_dir>_structure.json` beside that folder
name (still under `tmp/` when `--output` is under `tmp/...`). Layout is
independent of type. Naming warnings go to stderr; extraction still succeeds
when files were written.

## Rule And Skill Link Map

`AGENTS.md` is the hub. Every project rule or skill should link back here.

Current project rule entry points:

- Cursor project rule: `.cursor/rules/custom-rules.mdc`
- `exvs2-json` artifact isolation: `.cursor/rules/exvs2-json-artifacts.mdc`
- `fhm2d-extract` artifact isolation: `.cursor/rules/fhm2d-extract-artifacts.mdc`
- No release builds: `.cursor/rules/no-release-builds.mdc`
- Cross-agent hub: `AGENTS.md`

Project skills (domain):

- FHM2D stage pack/extract: `.cursor/skills/fhm2d-format/SKILL.md`
- Stage numatb color-only materials: `.cursor/skills/exvs-stage-numatb/SKILL.md`
- Tauri large binary IPC: `.cursor/skills/tauri-ipc-large-binary/SKILL.md`

## Development Conduct

- Communicate with the user in Chinese; write code and comments in English.
- Do not leave `TODO` / `FIXME` markers in code.
- When modifying MSC decompiled `X.c` files, wrap every AI-added or AI-modified
  code block with the required `// AI decision (YYYY-MM-DD): ...` and
  `// End, origin is ...` comments. See
  `docs/msc-research/msc-ai-edit-block-rule.md`. Verify with
  `python .\tools\check_msc_ai_blocks.py "<modified X.c>"`.
- When adding symbols to MSC decompiled `X.c` files, work as a reverse engineer:
  preserve existing decompiler names when reading old code, but never invent new
  opaque names like `global777` / `var42` for AI-added state. Use semantic names
  grounded in proven evidence, and record uncertain meanings in the AI block
  origin or semantic overlay.
- **Param field names are evidence-gated.** The canonical key for a param field
  hash is the one in `src-tauri/src/format/*param.rs`; the evidence state lives in
  `docs/param-evidence-registry.tsv`. `docs/command_mapping.md` and
  `docs/speedparam-semantic-ledger.md` are **historical claim records, not sources
  of truth** — both carry a superseded banner and both have been the direct cause
  of an agent re-reporting an already-corrected field as wrong. After touching any
  param pool, ledger, or field-note document, run:
  `python .\tools\check_param_name_evidence.py`
  It fails when a field the engine cannot reach claims a gameplay name, when the
  registry and a pool disagree, or when a document asserts a name no pool
  recognises. Regenerate the registry with
  `python .\tools\param_evidence_registry.py --out docs\param-evidence-registry.tsv`.
  Never rename a param key without adding the old name to that file's legacy alias
  table in the same change.
- Do not start dev servers unless the user explicitly asks.
- Prefer reusing existing utility functions, components, and data models.
- Each `page` component should have a corresponding `components/` directory.
- Use `useTransition` for heavy UI updates that should not block input; use
  explicit loading state for I/O operations.

## Verification And Handoff

- Run the narrowest reliable verification for each change.
- For MSC tool changes, test with real MSC files and verify:
  - Function pointer resolution (no raw hex pointers in .c output).
  - `try.` pushBit counts match between original and recompiled.
  - Header flags correctness.
- Summarize what was done, what remains, and verification evidence in your
  final response or active plan artifact.
