# Unreal-Style Scene Editor Roadmap

## Implemented In This Pass

- Actor-like imported DAE objects in the Outliner and viewport.
- Multi-selection-aware selected object export to single or batch DAE.
- Radix context menu commands for DAE import/export, duplicate, delete, copy, and paste.
- Ctrl+V paste-as-new and command-history-backed duplicate/delete/paste flows.
- Transform/details panel edits for imported DAE actors.

## Recommended Next Features

1. World Outliner folders with drag-and-drop reparenting.
   - Keep folders editor-only and store them separately from `placement.csv`.
   - Add rename, color label, isolate, hide children, and lock children.

2. Details panel sections modeled after Unreal.
   - Transform, Rendering, Textures, Placement CSV, Source Asset, and Debug.
   - Add per-section reset-to-default and copy/paste transform.

3. Actor operation toolbar.
   - Add Duplicate, Delete, Focus, Export DAE, Import DAE, Snap, Local/World, Pivot/Center, and Bounds.
   - Keep W/E/R as transform modes and add Q for select.

4. Selection modes.
   - Object mode, placement instance mode, and texture/material inspection mode.
   - Object mode should select the actor; material mode should select mesh draw/material slots.

5. Snapping and pivot controls.
   - Grid snap values: 0.1, 0.5, 1, 5, 10.
   - Rotation snap: 5, 15, 45, 90 degrees.
   - Scale snap: 0.05, 0.1, 0.25.

6. Content browser strip.
   - Show loaded stage folders, imported DAE files, resolved textures, and selected source path.
   - Right click assets for reimport, reveal, export, and assign to selection.

7. Transaction history panel.
   - Show undo/redo stack labels.
   - Allow click-to-revert in a future persistent history model.

8. Viewport overlays.
   - Actor labels, bounds toggle, pivot marker, collision/placement effect markers, and selected actor breadcrumbs.

## Library Direction

- Keep `@react-three/drei` for `TransformControls`, `GizmoHelper`, and `OrbitControls` because it already integrates with React Three Fiber and is in the project.
- Consider `@react-three/editor` or Triplex only for future authoring workflows that write JSX/source changes. They are not a clean fit for this Tauri asset editor because SceneEdit data comes from game files, `placement.csv`, and imported DAE actors rather than static JSX.
- Avoid adopting a full alternate scene framework such as ThreePipe until there is a clear need for its serialization/editor stack; it would compete with the current SSBH/placement data model.
