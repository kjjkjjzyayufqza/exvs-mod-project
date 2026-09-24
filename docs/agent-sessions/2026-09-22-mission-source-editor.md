# Mission source editor

Plan: [mission-source-editor/plan.md](./mission-source-editor/plan.md).
Process: [mission-source-editor/process.md](./mission-source-editor/process.md).

Goal: open an existing mission `.c`, derive an editable graph, validate and save
source changes. Graph JSON persistence is outside this task. File-level TDD;
the user's original A-1-1 file is read-only during development.

Design: keep the existing strict OBHK template recognizer and graph/model
validation. Patch only changed content functions in the loaded source, preserving
the runtime, comments, line endings and all unknown slot words. No-op is byte
identical. Native saves use optimistic conflict detection and atomic replacement.
User clarification: normal Save / Ctrl+S updates the opened `.c` directly.
Only tests use copies. Save as chooses another `.c` and becomes the active source.

Lifecycle / state ownership (E1, no in-game claims):

| Phase | Owner | Editor policy |
|---|---|---|
| ENTER / reinitialize | func_33 resets global20..24 and calls func_32 | Preserve reset and dispatch; edit configuration only |
| ACTIVE | func_34 opening; func_35 phase and delay | Keep linear transitions; edit deployment, predicates and actions |
| EXIT | main / native win-lose evaluation | Preserve verbatim; graph End ends only authored phases |
| INTERRUPT / respawn | func_15 / func_16 / func_19 / func_20 | Preserve verbatim and coroutine offsets |

Source identification: mission-script catalog matched; architecture and category
owner notes read. Falsified registry symbol matches refer to unit-script namespaces,
not this mission scaffold. No new resource identity or runtime policy is asserted.
Resource availability remains a warning requiring target assets; no repack performed.

Implementation sequence:

1. File tests for byte preservation, selective edits, structural edits, readback,
   invalid inputs and the user-selected real source; run red, implement, run green.
2. Native file save tests for working copy, conflict, invalid source, alias paths,
   failed writes and source immutability; run red, implement, run green.
3. Connect open / validate / preview / save to source session. Remove duplicate
   navigation and unsupported action-library entries. Keep real rules/units editors.
4. Run relevant file suites, frontend type check and required debug Rust check.

Progress: complete. Open existing C -> graph editing -> preview / native validation
-> original-path save or Save as. Source snapshots detect external changes;
same-directory atomic replacement prevents truncated writes. Duplicate navigation,
graph-file actions and non-compiling library entries were removed. Layout remains
session-only. Existing unrelated dirty worktree changes are preserved.

Verification (2026-09-22):

- Source/file TDD red -> green: no-op byte identity, content-only rewrites,
  comments/BOM/CRLF, alternate assignment order, all slot words, signed coordinates,
  structural phase/opening edits, round-trip models and annotation gates. The
  raw-call bypass of reserved blackboard/coroutine commands was reproduced red and
  blocked. Source, graph/editor and transpiler suites: 54 passed.
- Native file TDD red (missing read/save API) -> green: 8 passed, including the
  real A-1-1 oracle, stale/deleted destinations, compilation/address drift, invalid
  encoding/size, new-file no-clobber, read-only failure and concurrent writers.
- Existing UI wiring regression suite adapted to source saves: 17 passed.
- TypeScript no-emit check passed. Debug `cargo check --lib --bins` passed with no
  app rustc warnings; existing dependency future-incompatibility notices remain.
- Generated real-source fixture passed `check_msc_ai_blocks.py` and
  `check_msc_opaque_func_ptrs.py` (zero warnings). The referenced notice-stamping
  checker `tools/stamp_rs_ai_notices.py` is absent in this checkout; existing
  file-top Rust notices were preserved.
- Real input was read-only throughout. Edited fixtures are under
  `tmp/mission-source-tests/`; no native game binaries or publisher source fixtures
  were added to tracked files. No in-game run or repack; evidence remains E1.

Remaining limitations: only the recognized OBHK linear scaffold is supported;
unsupported runtime variants fail on open. Native window/browser E2E was not run.
