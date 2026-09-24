# Mission source editor process

## 2026-09-22 session note

The hub note already records an earlier red-to-green pass: source suites,
8 native file tests, 17 UI tests, `tsc`, and debug `cargo check`. It also
records the designed limits (OBHK linear scaffold only; no native-window E2E).

## 2026-09-22 completion pass

Audit of the current tree, before re-running gates:

- `read_mission_source` / `save_mission_source` are registered and implement
  snapshot conflict detection plus same-directory atomic replacement.
- The page opens a `.c`, generates from the graph, validates with
  `compile_mission_authoring`, saves in place on Save / Ctrl+S, and switches
  the active path on Save as.
- `NODE_LIBRARY` is only `condition`, `deploy`, `message`, `bgm`, `raw_sys`.
  Planned / No-Go kinds are not library buttons. The page test asserts the
  library has no TODO entry and that Mission/Units duplicate buttons are gone.

Gates for this pass (fresh, 2026-09-22 23:03):

- `pnpm exec vitest run src/services/missionGraph src/services/missionTranspiler src/page/MissionNodeEditor`: 6 files passed, 1 skipped; 70 tests passed, 2 skipped.
- `cargo test --test mission_authoring_test`: 8 passed.
- `pnpm exec tsc --noEmit`: exit 0.
- debug `cargo check --lib --bins`: finished with no app rustc warnings. Dependency future-incompatibility notes for binrw and proc-macro-error2 remain.

No source change was required. Designed limits stay: unrecognized scaffolds fail on open; no native-window E2E; no in-game run.
