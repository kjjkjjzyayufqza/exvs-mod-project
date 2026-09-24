# Mission node editor

- Goal: expose the existing mission transpiler in the sidebar and add a separate
  visual authoring page that uses a graph document instead of Lua.
- Scope: InRepoWork; frontend only, reuse the existing OB mission model and
  compiler. No native runtime or MSC template changes.
- Implemented: lazy `/MissionNodeEditor` sidebar route alongside Mission Script
  Lab; node canvas/ports, inspector, battle settings, named spawn points, units,
  JSON/C import, JSON save, direct graph-to-model-to-C generation, compiler export,
  phase simulation, undo/redo and invalid-draft protection.
- Model: sequential Start → opening deployments → conditions/actions → End.
  Unsupported branches/cycles/orphans fail validation. All slot words preserved.
- Verification: `pnpm exec vitest run src/services/missionGraph/graph.test.ts
  src/page/MissionNodeEditor/page.test.tsx` passed: 2 files, 14 tests. Covers
  sidebar routes, direct C round-trip/model preservation, connection validation,
  drag/keyboard layout, undo/redo, named point persistence, export invalidation,
  and mocked Tauri compiler/filesystem success/failure paths.
- No dev server or game was launched. Native compilation was invoked through
  a mock in UI tests; no Rust files changed for this node-editor task.
- Runtime behavior and resource availability have not been tested in game.

## React Flow migration

- User requested replacing the custom canvas with React Flow and fuller visual
  scripting editor interactions. Installed `@xyflow/react` 12.11.6.
- Replaced SVG/pointer canvas with React Flow custom mission nodes, execution
  handles, reconnection validation, box/multi-selection, native clipboard,
  duplicate/delete, comment frames with resizing, layout/alignment, minimap,
  searchable palette/context menu/outline, and editor shortcuts.
- Existing graph files remain readable. Optional viewport and comment metadata
  are persisted without changing the mission runtime. Layout-only edits retain
  generated source. Execution is still constrained by the sequential template.
- Verification in progress: graph model, editing commands and real React Flow
  component tests (only DOM geometry and native I/O are mocked).
