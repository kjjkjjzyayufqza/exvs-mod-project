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
