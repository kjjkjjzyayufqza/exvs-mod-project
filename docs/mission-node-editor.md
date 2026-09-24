# Mission Node Editor

Open **Mission Node Editor** (`/MissionNodeEditor`) from the sidebar. Start with
an existing mission `.c`: the file supplies the battle configuration, all unit
slots, opening deployment and wave sequence. React Flow is a derived editing
view. This page does not open or save graph JSON.

## File workflow

1. **Open mission .c** selects a UTF-8 source file (optional BOM, maximum 512 KiB).
   Parsing occurs in a cancellable Worker with a 15-second timeout. Unsupported
   code reports an error and leaves the current document intact.
2. Edit mission rules, units, spawn coordinates and the connected phase chain.
   Click an action in the library to insert it into the selected phase. Dragging
   creates a draft that must be connected before saving.
3. **Preview changes** shows the source that would be written. It does not modify
   disk. The source view is available immediately after opening a file.
4. **Validate** checks graph/model constraints, compiles in the native Mission
   profile, checks coroutine entry offsets and requires a byte-identical binary
   decompile/recompile round trip. Validation writes no file.
5. **Save .c** / **Ctrl+S** regenerates and validates the current configuration,
   then updates the opened `.c` directly. Ctrl+S also works from property inputs.
6. **Save as** / **Ctrl+Shift+S** selects another `.c`. After success that file
   becomes the active source; subsequent saves update it. Cancel leaves the
   current source path and dirty state unchanged.

The source path and save state are always visible. Unsaved source changes prompt
before another file is opened. Native I/O uses Tauri v2 commands. Saves compare
the loaded source snapshot with disk before writing; an external modification or
deleted file causes a conflict error. Reopen that file or Save as a different
file to resolve it. Saves stage bytes in the destination directory, flush them,
recheck the snapshot and atomically replace the destination. Failed compilation,
conflict, read-only destination and staging errors leave it unchanged. Concurrent
in-app saves are serialized. Other applications should not write during a save;
snapshot checking is not an OS-wide file lock.

## What is preserved

The loaded file owns the runtime. Only recognized content functions can change:

| Source | Edited content |
|---|---|
| `func_32` | Map, costs, win/lose flags, BGM and all 51 words of each unit slot |
| `func_34` | Opening enemy deployment |
| `func_35` | Sequential predicates, delays and ordered actions |

Unchanged functions, initialization, event handling, respawn, coroutine offsets,
global declarations and file order are retained. No-op saves preserve exact
source bytes, including BOM, line endings and comments. Literal-only edits patch
the original numeric spans. Structural changes regenerate only the affected
content body; author comments within that body are retained at its beginning.
Generated changes carry paired AI/origin comments without nesting existing blocks.
Every generated source is parsed back and compared with the intended model.

The parser recognizes the existing OBHK 25-global / 36-function linear scaffold;
it is not a general C control-flow editor. A different runtime, extra statements,
unknown trigger or changed function order is refused instead of approximated or
replaced with the embedded template. The supplied local A-1-1 source is covered
by the opt-in file oracle below. No publisher source fixture is added to git.

## Editing tools

The left panel contains usable actions, linear templates and the flow outline.
The duplicate Mission/Units navigation buttons and non-compiling research node
entries have been removed. The right inspector retains **Node**, **Mission** and
**Units & points**, which edit the corresponding source configuration. New
insertions select their properties immediately.

Opening deploys run before the first condition. Each phase contains one supported
predicate, a positive delay and ordered deploy/message/BGM/raw syscall actions.
End finishes this sequence; the original runtime still owns victory and defeat.
Branches, loops, author parallel sequences and blackboard features have no runtime
Go; see [the control-flow owner note](mission-research/mission-graph-control-flow-go-nogo.md).
Raw syscalls retain their existing unverified-effect warnings. Author calls to
runtime-owned blackboard/coroutine commands (`0x601`, `0x604`, `0x802`, `0x803`)
are rejected, so the raw-call editor cannot bypass the control-flow gate.

Connection editing, undo/redo, native clipboard, selection, comments, minimap,
layout and the command palette remain available. Layout, visual labels, aliases,
collapse state and comments are **session-only**: they are not encoded into `.c`
or persisted as a React Flow JSON document. They do not make the source dirty.
Units and spawn coordinates are source data and do persist.

Errors block source saves: disconnected drafts, unsupported flow, missing slots,
duplicate deployments, invalid rules/delays and the conservative 12-enemy budget.
Unknown resource hashes and external-coordinate flags remain warnings. The source
preview becomes stale after a semantic edit; saving always rebuilds it.

**Compile & export MSC** writes a separately selected `.mismsexc` after native
validation. It does not modify course tables, briefing, scene keys or FHM2D packs.
Phase Trace remains a source-level stepper with manually supplied observations.
Source/bytecode checks are E1; gameplay and current-target resource availability
have not been verified in-game by this editor work.

## File-level verification

The TDD contract is in `src/services/missionGraph/source.test.ts` and
`src-tauri/tests/mission_authoring_test.rs`. Tests use real files under `tmp/`,
exercise parse → graph edit → source patch → write → reopen, native atomic saves,
conflicts, rejected writes, size/encoding limits and compilation. The source input
is checked unchanged after the real-file oracle. Existing UI tests are smoke
coverage for wiring, not a substitute for these file tests.

```powershell
# Optional local input. It is read only; all edited fixtures stay under tmp/.
$env:EXVS_MISSION_SOURCE = 'E:/XB/mod/051mission/000triad_battle_a001_001/000triad_battle_a001_001.c'
pnpm exec vitest run src/services/missionGraph/source.test.ts src/services/missionGraph/graph.test.ts src/services/missionGraph/editor.test.ts src/services/missionTranspiler/transpile.test.ts
# The native oracle consumes tmp/mission-source-tests/reference-edited.c above.
cd src-tauri
cargo test --test mission_authoring_test
cargo check --lib --bins
```

See [mission architecture](mission-research/exvs2-ob-triad-mission-architecture.md)
for evidence, and [AGENTS.md](../AGENTS.md) for project rules.
