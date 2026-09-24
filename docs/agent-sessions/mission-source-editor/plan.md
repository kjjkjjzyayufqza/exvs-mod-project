# Mission source editor plan

Hub: [2026-09-22-mission-source-editor.md](../2026-09-22-mission-source-editor.md)

## Objective

Open an existing mission `.c`, derive an editable graph, validate, and save
source changes. Graph JSON persistence is out of scope. The original A-1-1
file stays read-only; only tests use copies.

## In scope

1. File-level TDD: byte preservation, selective edits, structural edits,
   readback, invalid inputs, and the real source oracle.
2. Native save: working copy, conflict, invalid source, alias paths, failed
   writes, source immutability. Optimistic snapshot plus same-directory atomic
   replace.
3. UI session: Open, Validate, preview/generate, Save (Ctrl+S writes the opened
   `.c`), Save as (new path becomes active). No duplicate Mission/Units
   navigation. The action library only offers compiling kinds. Rules and units
   editors stay.
4. Gates: mission graph/source/transpiler/page suites, `mission_authoring_test`,
   `tsc --noEmit`, debug `cargo check --lib --bins`.

## Out of scope

- Persisting the graph as JSON.
- Repack or in-game proof. Evidence stays E1.
- Opening mission scripts that are not the recognized OBHK linear scaffold.
  Those fail on open by design.
- Native window E2E. File and component tests cover the save session.

## Code map

| Piece | Path |
|---|---|
| Read / save / compile guard | `src-tauri/src/msc_toolchain/mission_authoring.rs` |
| Native tests | `src-tauri/tests/mission_authoring_test.rs` |
| Open / Save / Save as | `src/services/missionGraph/sourceFile.ts` |
| Page session | `src/page/MissionNodeEditor/page.tsx` |
| Compiling library | `NODE_LIBRARY` in `components/FlowNodes.tsx` |

## Done when

The four in-scope items are true in the current tree, and the gates in
`process.md` have a fresh pass recorded for this completion pass.

Status: met on 2026-09-22. See the completion-pass gates in `process.md`.
