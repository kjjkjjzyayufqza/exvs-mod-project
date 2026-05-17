# Placement Panel Redesign + Reactive Scene Response

**Date:** 2026-05-17
**Scope:** `src/page/SceneEdit` — Placement panel UI, data flow, and scene reactivity
**Goal:** Eliminate the draft/apply workflow, make all placement edits immediate, and provide a typed "Add" flow for new scene objects.

---

## 1. Data Flow: Eliminate Draft Layer

### Current State

- Two parallel arrays: `placementEntries` (drives 3D viewport) and `placementDraftEntries` (editable state)
- User edits draft entries, then manually clicks "Apply" / "Apply All" to sync changes to the scene
- `handleSave` writes `placementDraftEntries` to disk

### New Design

- **Remove** `placementDraftEntries` state entirely from `page.tsx`
- **Remove** all `setPlacementDraftEntries` calls across the codebase
- **Remove** `handleApplyPlacementDraftRow`, `handleApplyAllPlacementDraftRows` callbacks
- All edits write directly to `placementEntries` via `setPlacementEntries`
- Each edit records an undo/redo command via `sceneEditorStore.recordCommand()`
- `handleSave` builds CSV from `placementEntries` (not draft)

### Files Affected

| File | Change |
|------|--------|
| `page.tsx` | Remove `placementDraftEntries` state, all draft setters, `handleApplyPlacementDraftRow`, `handleApplyAllPlacementDraftRows`, `handlePlacementDraftRowChange`, `handleAddPlacementDraftRow`, `handleDeletePlacementDraftRow`. Update `handleSave` to use `placementEntries`. |
| `PlacementCsvEditorPanel.tsx` | Remove `appliedEntries`, `onApplyRow`, `onApplyAll` props. All edit callbacks write directly. |

---

## 2. PlacementCsvEditorPanel UI Redesign

### List View (Collapsed State)

Each placement row shows:
- Type Badge (OBJECT / EFFECT / SKY / other vdkType)
- Row index `#N`
- Object number (if applicable)
- Click to select — syncs Outliner highlight, viewport gizmo, and Properties transform editor

### Expanded State (Immediate Edit)

When a row is selected/expanded:
- All `rawFields` displayed as flat key-value pairs (current layout preserved)
- Numeric fields have sliders (current slider logic preserved)
- **Every field change** immediately calls `setPlacementEntries` + `recordCommand`
- No "Apply" / "Apply All" buttons
- No "draft" badge or dirty indicator

### Add Button + Type Selector

- Top of the panel: `+` button opens a `DropdownMenu` / `Popover`
- Options: Object, Effect, Sky (and any other known vdkType values)
- Selecting a type:
  1. Creates a new `PlacementRow` with default fields for that type
  2. Inserts after the currently selected placement index (or at the end if nothing is selected)
  3. Records an undo command
  4. Auto-selects the new row
  5. The new object immediately appears in the 3D viewport and Outliner

### Default Field Templates

Each vdkType has a template of default rawFields:

- **OBJECT:** `VDK_TYPE OBJECT VDK_INDEX <next_available> VDK_POSITION_X 0 VDK_POSITION_Y 0 VDK_POSITION_Z 0 VDK_ROTATION_X 0 VDK_ROTATION_Y 0 VDK_ROTATION_Z 0 VDK_SCALE_X 1 VDK_SCALE_Y 1 VDK_SCALE_Z 1`
- **EFFECT:** `VDK_TYPE EFFECT VDK_POSITION_X 0 VDK_POSITION_Y 0 VDK_POSITION_Z 0 VDK_ROTATION_X 0 VDK_ROTATION_Y 0 VDK_ROTATION_Z 0 VDK_SCALE_X 1 VDK_SCALE_Y 1 VDK_SCALE_Z 1`
- **SKY:** `VDK_TYPE SKY VDK_POSITION_X 0 VDK_POSITION_Y 0 VDK_POSITION_Z 0 VDK_ROTATION_X 0 VDK_ROTATION_Y 0 VDK_ROTATION_Z 0 VDK_SCALE_X 1 VDK_SCALE_Y 1 VDK_SCALE_Z 1`

The exact field names will be derived from existing placement data patterns in the codebase.

---

## 3. Reactive Scene Response

All three downstream consumers already bind to `placementEntries`:

| Consumer | Mechanism | Action Needed |
|----------|-----------|---------------|
| **3D Viewport** (`MapViewport`) | Receives `placementEntries` as prop, re-renders on change | None — already reactive once draft layer is removed |
| **Outliner** (`outlinerRoot` memo) | Depends on `placementEntries`, rebuilds node tree | None — already reactive |
| **Properties Transform** | Reads `placementEntries[selectedPlacementIdx]` | None — already reactive |

### Selection Sync on Add/Delete

- **Add:** After inserting a new row, call `setSelectedPlacementIdxRaw(newIndex)` + resolve node ID + sync Outliner selection
- **Delete:** After removing a row, clear selection via `handleClearSelection()`
- **Edit:** Selection unchanged, values update in-place

---

## 4. Non-Goals

- No changes to the Inspect or Graphic tabs
- No changes to the Outliner component's own UI/interactions
- No changes to the viewport's rendering pipeline
- No changes to gizmo interaction or DAE import/export
- No new tab structure in Properties panel

---

## 5. Testing

- Update `sceneEditorObjectOps.test.ts` if `addPlacementRow` signature changes
- Verify undo/redo works for all new immediate-edit operations
- Verify add/delete placement updates Outliner node count
- Verify viewport renders new placement entries without manual apply
- TypeScript compilation check
