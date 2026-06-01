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
4. For multi-step or research-heavy tasks, create or update a topic-specific
   session folder: `docs/agent-sessions/<topic>/`.
5. Maintain both files in that folder:
   - `todo.md` for current tasks, status, and next actions.
   - `process.md` for context gathered, decisions, commands, test results,
     failures, and handoff notes.

If a task already has a suitable session folder, reuse it. Choose short
kebab-case topic names such as `msc-cfg-refactor`, `unit-edit-redesign`,
`nusktb-parser`, or `scene-edit-timeline`.

## Required Documentation Sources

Use `docs/` as the first source of project truth:

- `docs/msc-binary-format-spec.md` — MSC bytecode format specification (header,
  opcodes, pushBit, script offset table, string table, EXVS2 vs Smash differences).
- `docs/exvs-stage-numatb-simple-color.md` — stage map props with only a color
  texture: use `FeRendererMovableVertexColor` → `vstgStandard_VertexColor`, strip
  unused PBR slots (avoids in-game overexposure).
- `docs/gvs-numatb-step2-migration-changes.md` — GVS→EXVS2 numatb migration rules.

When adding new research findings, write them under `docs/` and link them from
the active session `process.md`.

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

- Run the narrowest reliable verification for each change.
- For MSC tool changes, test with real MSC files and verify:
  - Function pointer resolution (no raw hex pointers in .c output).
  - `try.` pushBit counts match between original and recompiled.
  - Header flags correctness.
- Record commands and outcomes in the active `process.md`.
- Before ending a task, make sure `todo.md` says what is done, what remains, and
  where the next agent should start.
