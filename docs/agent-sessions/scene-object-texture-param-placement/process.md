# Scene Object Texture Param Placement Process

## Context

- User requested SceneEdit changes:
  - Object-level control for textures loaded by each object, showing real nutexb internal names rather than generic slot names.
  - Global-level display of currently loaded nutexb entries.
  - Separate right-side tab for selective `graphic_param.csv` apply/edit/add/delete with slider controls.
  - Separate right-side tab for selective `placement.csv` apply/edit/add/delete.
  - Fix selected effect disappearing when anime render style is enabled.
- Project rules require Chinese user communication, English code/comments, Tauri v2 native APIs, no dev server unless explicitly requested, and session notes under `docs/agent-sessions/`.

## Sources Read

- `AGENTS.md`
- `.cursor/rules/custom-rules.mdc`
- `docs/superpowers/plans/2026-05-14-sceneedit-nutexb-texture-pipeline.md`
- `docs/agent-sessions/sceneedit-nutexb-texture-pipeline/process.md`
- `docs/agent-sessions/scene-texture-controls/process.md`
- `docs/agent-sessions/scene-editor-feature-audit/process.md`
- shadcn Slider official docs: `https://ui.shadcn.com/docs/components/radix/slider`

## Commands And Findings

- `git status --short` showed an existing modified `src/page/SceneEdit/components/MapViewport.tsx`; this work must preserve and integrate with those changes.
- Context7 MCP resources were unavailable, so official shadcn docs were used for Slider reference.
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools\analyze_stage_csv_common_values.ps1 -Root 'E:\XB\解包\vs2\bak\001stage'`
  - Wrote `docs/agent-sessions/scene-object-texture-param-placement/stage_csv_common_values.json`.
  - Found 16 `graphic_param.csv` files and 16 `placement.csv` files.
  - Found 1,825 placement rows with VDK types `EFFECT`, `OBJECT`, `PROP`, and `SKY`.
- `npm test -- src/page/SceneEdit/utils/sceneTextureInventory.test.ts src/page/SceneEdit/utils/sceneCsvEditors.test.ts src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts src/page/SceneEdit/utils/sceneEditorObjectOps.test.ts`
  - Passed: 4 test files, 15 tests.
- `npm test -- src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx`
  - RED first: failed because the panels still used fixed-height internal scroll areas and lacked flexible panel roots.
  - GREEN after fix: passed, confirming non-Three.js `graphic_param` rows and non-transform placement fields render in flexible panels.
- `npm test -- src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx src/page/SceneEdit/utils/sceneTextureInventory.test.ts src/page/SceneEdit/utils/sceneCsvEditors.test.ts src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts src/page/SceneEdit/utils/sceneEditorObjectOps.test.ts`
  - Passed: 5 test files, 17 tests.
- `npx tsc --noEmit`
  - Passed after cleanup.
- `npm run build`
  - Passed. Vite reported existing large chunk and plugin timing warnings.

## Decisions

- Do not wait for explicit design approval because the user's project instructions require automatic execution without approval prompts.
- Keep graphic_param and placement editing in separate right-side tabs instead of merging into the existing first tab.
- Keep global texture slot toggles for broad preview quality control, and add object-level nutexb path toggles for per-object texture loading.
- Remove legacy unused SceneEdit files after confirming they had no live imports: old `ControlPanel`, DAE/Havok model components, texture/import/model list panels, property section/input components, legacy postprocessing outline, old placement panel, and their private selection helper.
- Move `PlacementRow` into `src/page/SceneEdit/types/placement.ts` so current code does not depend on the removed old placement panel.

## Implementation Notes

- Added `src/page/SceneEdit/utils/sceneTextureInventory.ts` for object/global nutexb inventory and per-object texture path enable state.
- Added `src/page/SceneEdit/utils/sceneCsvEditors.ts` for selective `graphic_param` and `placement` row editing operations.
- Added `src/components/ui/slider.tsx` using Radix Slider patterns.
- Added `src/page/SceneEdit/components/PlacementCsvEditorPanel.tsx`.
- Updated `GraphicParamPanel` to support selective apply, editing, add/delete, filtering, and sliders.
- Updated `MapViewport` to combine anime render material injection with selection highlight injection so selected effects remain visible.
- Added `tools/analyze_stage_csv_common_values.ps1`; `-Root` is required to avoid source-encoded non-ASCII path issues in Windows PowerShell.
- Removed fixed `max-h-[400px]` and `max-h-[620px]` editor scroll areas from `GraphicParamPanel` and `PlacementCsvEditorPanel`; the right-side tab panel now uses the single outer scroll area with `min-h-0 flex-1`.
- Added `src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx` to cover full CSV value display and flexible panel layout.
