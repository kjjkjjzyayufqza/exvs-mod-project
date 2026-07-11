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
  - `src-tauri/` — Tauri Rust backend, including the agent-facing `exvs2-json`
    CLI (`exvs2_json` binary; see [CLI Tools](#cli-tools-agent-facing)).
  - `src/page/` — React page components (TestEditor with MSC workspace, UnitEdit,
    FilesEdit, SceneEdit, etc.).
  - `docs/` — Format specifications and research notes.

## Mandatory Task Startup Protocol

Before doing any task, every AI agent must:

1. Read this file first.
2. Read the Cursor project rule: `.cursor/rules/custom-rules.mdc`.
3. Search `docs/` for Markdown files relevant to the user's request, then read
   the most relevant specifications before touching code or assets.
4. Run the **Superpowers skills** workflow in [AI Task Management](#ai-task-management-superpowers--mandatory)
   — this is the required task manager for every agent session.

## AI Task Management (Superpowers — Mandatory)

**Superpowers skills are this repository's primary AI task management system.**
Agents must invoke relevant skills before responding or making changes. Skill
discipline overrides default agent habits.

Typical skill chain by task type:

| Situation | Skills (in order) |
|-----------|-------------------|
| Any new task | `using-superpowers` |
| New feature, UI, or behavior change | `brainstorming` → `writing-plans` (if multi-step) |
| Bug or unexpected failure | `systematic-debugging` |
| Implementation | `test-driven-development` + domain/project skills |
| Executing a written plan | `executing-plans` or `subagent-driven-development` |
| Before claiming work is done | `verification-before-completion` |

When a skill provides a checklist, track items with `TodoWrite` (or the
platform-equivalent todo tool). Record verification commands and outcomes in
your session response or plan artifact — not in a separate repo note tree.

### Legacy auxiliary notes (not a task manager)

The repo may contain older per-topic note folders under `docs/` (historically
`todo.md` / `process.md` pairs). That layout is a **legacy, separate workflow**
from an earlier AI task manager. It is **auxiliary only**:

- **Do not** adopt it as your primary task tracker, handoff system, or startup
  obligation.
- **Do not** create or update those folders unless the user explicitly asks.
- **May** read existing notes when they contain useful historical context,
  research evidence, or prior decisions for the current task.
- For current truth, prefer `docs/` specifications and Superpowers skill
  outputs over stale session notes.

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
- `docs/characterparam-field-notes.md` — characterparam empirical field
  identity (`lockOnDistanceMax` + `alertRangeDistance` = 红锁,
  `boostGaugeInitial` = HP); prefer over stale pool names when they conflict.
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
| Design background | `docs/superpowers/specs/2026-06-28-exvs2-binary-json-cli-design.md` |
| CLI core | `src-tauri/src/exvs2_json_cli/` |
| Binary entry | `src-tauri/src/bin/exvs2_json.rs` |
| Integration tests | `src-tauri/tests/exvs2_json_cli_test.rs` |
| Debug executable (agent default) | `src-tauri/target/debug/exvs2_json.exe` |
| Release executable | `src-tauri/target/release/exvs2_json.exe` (**only if user asks**) |

**Agent build policy (mandatory):** Do **not** use `cargo … --release` for normal
work. Prefer debug for speed. See `.cursor/rules/no-release-builds.mdc` and
`.cursor/rules/custom-rules.mdc` §7a.

**Commands**

- `inspect` — parse `.jnttbl`, `character_id_table.bin`, `vernier_table`,
  `armsparam`, `bulletparam`, `projectile_depiction_table`, and SSBH model files
  (`.nusktb`, `.numshb`, `.numdlb`; auto-detect or `--type`). Prefer
  `--summary --pretty` for large files; for `.numshb` use `--raw-fields` only
  when full vertex buffers are required.
- `edit` — apply AI-facing JSON edit requests to lossless builder-backed file
  types (`jnttbl`, `character_id_table`, `vernier_table`, `armsparam`,
  `bulletparam`, `speedparam`, `projectile_depiction_table`). Use `--dry-run`
  for preview-only output; SSBH files remain inspect-only because their rewrite
  is not byte-identical.
- `correlate` — emit a JSON skeleton joining unit/weapon/dispatcher/IDA evidence
  (paste IDA symbols via optional flags; does not call IDA automatically).

**Run** (from `src-tauri/`; **debug only** unless user requests release):

```powershell
cargo run --bin exvs2_json -- --help
cargo run --bin exvs2_json -- inspect "<path>" --summary --pretty
cargo run --bin exvs2_json -- edit "<path>" --request "<edit.json>" --output "<new-path>" --pretty
cargo run --bin exvs2_json -- correlate --unit 001GUNDAM/005GYAN00/001 --weapon SuibakuMissile --id 10050102 --pretty
# Prefer after code change:
cargo build --bin exvs2_json
# then: .\target\debug\exvs2_json.exe inspect ...
```

JSON output envelope always sets `"tool": "exvs2-json"`. Reuses the same Rust
parsers as the desktop editor backend. Cross-repo pickup for  hook
research: `docs\EXVS2JsonCli.md`.

## Rule And Skill Link Map

`AGENTS.md` is the hub. Every project rule or skill should link back here.

Current project rule entry points:

- Cursor project rule: `.cursor/rules/custom-rules.mdc`
- Cross-agent hub: `AGENTS.md`

AI task management (primary):

- Superpowers entry skill: `using-superpowers` (invoke before any task)
- Process skills: `brainstorming`, `writing-plans`, `systematic-debugging`,
  `test-driven-development`, `executing-plans`, `verification-before-completion`

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
- Do not start dev servers unless the user explicitly asks.
- Prefer reusing existing utility functions, components, and data models.
- Each `page` component should have a corresponding `components/` directory.
- Use `useTransition` for heavy UI updates that should not block input; use
  explicit loading state for I/O operations.

## Verification And Handoff

- Invoke `verification-before-completion` before claiming any task is done.
- Run the narrowest reliable verification for each change.
- For MSC tool changes, test with real MSC files and verify:
  - Function pointer resolution (no raw hex pointers in .c output).
  - `try.` pushBit counts match between original and recompiled.
  - Header flags correctness.
- Summarize what was done, what remains, and verification evidence in your
  final response (or the active Superpowers plan artifact).
