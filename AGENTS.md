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
  - `src/page/` — React page components (TestEditor with MSC workspace, UnitEdit,
    FilesEdit, SceneEdit, etc.).
  - `src-tauri/` — Tauri Rust backend.
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
  → msclang.py (C → MSC bytecode compilation, correct try pushBit via addArg)
  → MSC binary (.mscsb)
```

Key design decisions:
- Function pointer resolution happens at disassembly time (msc_cfg.py), not via
  post-processing text patches on .c output.
- The compiler's `addArg()` correctly tracks nested `try`/`callFunc` depth to set
  pushBit, eliminating the need for binary patching (0x2E→0xAE).
- `msc_cfg.py` builds control flow graphs per script and performs per-basic-block
  stack simulation to resolve script references.

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
