# SceneEdit UI/UX Improvements Process

## Context Gathered
- User reported issues with scaling, drag-and-drop (hard to grab handles), and stats panel blocking elements in SceneEdit.
- User requested copying "status" functionality from TestEditor.
- Codebase analysis shows:
    - `ResizableHandle` is thin (2.5px).
    - `SceneViewportOverlay` is at `bottom-2 right-2`.
    - `TestEditor` has a "Repack Changes" button with a pulsing dot for dirty state.

## Decisions
- Increase `ResizableHandle` hit area and visibility (increased width and added hover/active states).
- Move `SceneViewportOverlay` to `bottom-left` (bottom-4 left-4) to avoid blocking the Gizmo in `bottom-right`.
- Add a "dirty state" indicator to `MapToolbar` (pulsing yellow dot on Save button).
- Improve default panel ratios (adjusted from 20/52/28 to 18/57/25).
- Polished `SceneStatusPanel` UI with better typography and micro-interactions.

## Commands Run
- `ls` and `grep` to explore codebase.
- `webview_screenshot` and `webview_dom_snapshot` to analyze current UI.
- `StrReplace` to apply fixes.

## Selection UX Follow-up

- User requested replacing the selected-object editor effect, fixing viewport selection not updating the left outliner, and auditing more SceneEdit interaction details.
- Root cause found:
    - `MapViewport` click selection updated `selectedNodeId` / `selectedPlacementIdx` in `page.tsx`, while `SceneOutliner` highlighted rows from `useSceneEditorStore().selectedIds`.
    - Escape and outliner "Deselect All" cleared only the store selection, leaving the page-level selected object and gizmo active.
    - Selected mesh highlighting still used postprocessing outline plus material shader injection, which was visually heavy and did not match the requested wireframe-only style.
- Design decision:
    - Use a single selection synchronization path from viewport, outliner, placement rows, imports, duplicate, paste, delete, Escape, and select-all operations.
    - Replace the selected mesh shader/postprocess highlight with an editor-only wireframe overlay over the selected object.
    - Keep changes local to SceneEdit and existing store/util patterns.

## Selection UX Implementation

- Added `sceneEditorSelection.ts` to centralize SceneEdit selection resolution and command target priority.
- Added `sceneSelectionOverlay.ts` to define the selected-object wireframe overlay style.
- Removed the postprocessing outline and selection material shader injection from SceneEdit selected meshes.
- Added wireframe overlays for selected SSBH stage meshes and imported DAE objects.
- Synced viewport selection, outliner row selection, placement editor row selection, import/paste/duplicate/delete selection, Escape, Deselect All, and Select All.
- Changed duplicate/delete command target resolution to prefer the outliner multi-selection set before the page primary selection.
- Added multi-placement delete and synchronized placement duplicate/paste/delete changes into `placementDraftEntries` so Save writes the same rows visible in the scene.
- Improved Focus Selected to frame the selected object bounding box instead of resetting the camera.
- Improved toolbar and outliner small interactions:
    - toolbar can horizontally scroll in narrow layouts;
    - icon buttons have `aria-label`s;
    - stage badge exposes the full stage name in `title`;
    - active hidden/locked/selected outliner row controls remain visible;
    - outliner visibility/lock icon buttons have `aria-label`s;
    - viewport context menu and export enabled state respect multi-selection;
    - all selected instanced placements render as selected instead of only one selected instance.

## Verification

- `npm test -- src/page/SceneEdit/utils/sceneEditorSelection.test.ts` -> failed first because `sceneEditorSelection.ts` did not exist.
- `npm test -- src/page/SceneEdit/utils/sceneEditorSelection.test.ts` -> passed, 4 tests.
- `npm test -- src/page/SceneEdit/utils/sceneSelectionOverlay.test.ts` -> failed first because `sceneSelectionOverlay.ts` did not exist.
- `npm test -- src/page/SceneEdit/utils/sceneSelectionOverlay.test.ts` -> passed, 2 tests.
- `npm test -- src/page/SceneEdit/utils/sceneEditorObjectOps.test.ts` -> failed first because `deletePlacementsAt` did not exist.
- `npm test -- src/page/SceneEdit/utils/sceneEditorObjectOps.test.ts` -> passed, 5 tests.
- `npx tsc --noEmit` -> failed once on generic `THREE.Camera` near/far/projection typing in Focus Selected.
- `npx tsc --noEmit` -> passed after narrowing to perspective/orthographic cameras.
- `npm test -- src/page/SceneEdit/utils/sceneEditorSelection.test.ts src/page/SceneEdit/utils/sceneSelectionOverlay.test.ts src/page/SceneEdit/utils/sceneEditorObjectOps.test.ts src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts src/page/SceneEdit/utils/sceneEditorNodeState.test.ts src/page/SceneEdit/utils/sceneTextureInventory.test.ts src/page/SceneEdit/utils/sceneCsvEditors.test.ts src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx` -> passed, 8 files, 27 tests.
- `npm run build` -> passed. Vite still reports the existing large chunk and plugin timing warnings.
- `git diff --check` -> exit 0, only LF-to-CRLF warnings.
- `rg -n "[\p{Han}]"` over changed SceneEdit code files -> no matches.
