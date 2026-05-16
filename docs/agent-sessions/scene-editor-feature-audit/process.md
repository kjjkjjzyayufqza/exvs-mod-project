# Scene Editor Feature Audit Process

## Goal

Check whether the requested Unreal-like Scene Editor feature list has been implemented.

## Context Gathered

- Read `AGENTS.md`.
- Read `.cursor/rules/custom-rules.mdc`.
- Found existing SceneEdit session docs:
  - `docs/agent-sessions/scene-edit-ui-ux/`
  - `docs/agent-sessions/scene-texture-controls/`
  - `docs/agent-sessions/sceneedit-nutexb-texture-pipeline/`
- Found `SCENE_EXPORT_IMPORT_README.md`, which describes JSON scene export/import rather than DAE import/export.
- Found SceneEdit source files under `src/page/SceneEdit/`.

## Commands

- `Get-Content -Path AGENTS.md`
- `Get-Content -Path .cursor/rules/custom-rules.mdc`
- `Get-ChildItem -Path docs -Recurse -Filter *.md`
- `Get-ChildItem -Path src/page/SceneEdit -Recurse`
- `rg` search for SceneEdit feature keywords
- `npm run build` -> passed

## Findings

- SceneEdit has a new Outliner, Radix context menus, placement-backed object instances, transform gizmos, texture slot controls, and orange postprocess selection outline.
- DAE import/export helpers and Rust Tauri commands exist, but the SceneEdit page does not wire the handlers into the toolbar or right-click menu.
- Undo/redo stack and keyboard shortcuts exist in `sceneEditorStore` and `useSceneKeyboard`, but SceneEdit edits do not call `pushCommand`, so practical undo/redo coverage is incomplete.
- Copy/group/delete/duplicate controls exist in the Outliner, but paste and some per-row context menu actions are not wired.
- Build verification passed with a chunk-size warning only.

## Implementation Notes

- Added `sceneEditorObjectOps.ts` and focused tests for placement duplicate/delete/paste operations.
- Wired viewport Radix context menu DAE import/export callbacks.
- Added imported DAE actors to SceneEdit state, viewport rendering, Outliner, transform editing, selection outline, duplicate/delete/paste, and DAE export.
- Exposed selected viewport objects through `MapViewportHandle.getSelectedExportObjects()`.
- Added `recordCommand()` to the SceneEditor store so already-applied UI edits can enter undo/redo history.
- Wired Ctrl+V and Outliner Paste as New.
- Wired Outliner row Duplicate as New and Delete menu items.
- Added undo/redo command records for placement field edits, placement duplicate/delete/paste, imported DAE import/duplicate/delete/paste, and base/standalone/DAE transform field edits.

## Verification

- `npm test -- src/page/SceneEdit/utils/sceneEditorObjectOps.test.ts` -> passed, 4 tests.
- `npm run build` -> passed. Vite still reports the existing large chunk warning.

## Scene Gizmo Drag Performance Investigation

- User reported that selecting a scene object and moving it with the transform axis makes the whole scene freeze/stutter.
- Root-cause path under investigation: `TransformControls` fires high-frequency object-change events while dragging. Current SceneEdit wiring syncs those frames into React state (`placementEntries`, imported DAE objects, base/standalone transforms), which forces page-level derived trees, property panels, and viewport props to recompute during every drag frame.
- Desired behavior: keep Three.js object movement local and smooth while dragging; sync React/editor state once on commit so properties, save data, and undo/redo remain correct.
- Added `sceneEditorGizmoSync.ts` to lock the interaction policy: drag frames repaint the viewport without syncing React scene state; commit events sync editor state.
- Updated `MapViewport` transform controls for placement, effect, base, standalone, and imported DAE actors so `onObjectChange` only invalidates/regresses the R3F viewport during drag.
- Updated SceneEdit commit handlers so placement/base/standalone/DAE gizmo edits write React state once on mouse-up and record one undo/redo history entry per completed drag.

## Scene Gizmo Drag Verification

- `npm test -- src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts` -> failed first because the policy module did not exist.
- `npm test -- src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts src/page/SceneEdit/utils/sceneEditorObjectOps.test.ts` -> passed, 7 tests.
- `npm run build` -> passed. Vite still reports the existing large chunk and plugin timing warnings.

## TransformControls Visibility Regression

- User reported TransformControls disappeared after the drag performance change.
- Root cause: `StageModelGroup` still required both `onPlacementGizmoFrame` and `onPlacementGizmoCommit` to render TransformControls. The performance fix intentionally stopped passing frame callbacks for base/standalone actors and placement frame state sync, so the render guard hid the gizmo.
- Added `shouldRenderGizmoControls()` policy: controls render when the actor is selected and has a commit handler. Drag-frame handlers are optional and must not control visibility.
- `npm test -- src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts` -> failed first because `shouldRenderGizmoControls` did not exist.
- `npm test -- src/page/SceneEdit/utils/sceneEditorGizmoSync.test.ts src/page/SceneEdit/utils/sceneEditorObjectOps.test.ts` -> passed, 9 tests.
- `npm run build` -> passed. Vite still reports the existing large chunk and plugin timing warnings.
