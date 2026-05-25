# Delete SSBH Model — Design Spec

**Date:** 2026-05-25
**Status:** Draft

## Overview

Add the ability to delete any model from the Scene Editor — imported DAE objects, sub-models, and the base model. Currently `handleDeleteSelected` only handles imported DAE (frontend state only, no backend cleanup) and placement rows. Sub-model and base model deletion is not implemented.

## Requirements

- **Scope:** All model types — imported DAE, sub-model, base model
- **Undo:** Not supported; deletion is final after confirmation
- **Confirmation:** Modal dialog showing affected files, sizes, and associated data before executing
- **Placement sync:** Deleting a sub-model automatically removes all its placement entries (matched by `objectIndex`)
- **HKT cleanup:** Deleting an imported DAE removes its associated `HavokCollisionData` from the backend session

## Architecture

### Three Deletion Paths

Each model type has a distinct storage mechanism and therefore a distinct deletion path. All three converge in the existing save pipeline's Phase 1 (`executeDelete`) for physical file removal.

#### 1. Imported DAE

**Storage:** `PendingImport` in Rust `SceneMemorySession.pending_imports` + `importedDaeObjects` React state.

**Delete flow:**
1. Remove from `importedDaeObjects` React state
2. Call `sceneRemoveImport(sessionId, importId)` — cleans up `PendingImport` + `SsbhArtifacts` + `hkt_bytes` in the Rust session
3. Call new `sceneRemoveHavokData(sessionId, sourceId)` — removes associated `HavokCollisionData` entry (the `sourceId` equals `importId`)
4. Remove from `havokMeshDataMap` and `havokMetaMap` React state
5. Remove asset config via `useSceneAssetStore.getState().removeAsset(id)`
6. Clear collision visibility via `useSceneEditorStore`

**Physical deletion:** Not needed — imported DAE data exists only in memory until saved.

**Backend change needed:** New `remove_havok_data(source_id)` method on `SceneMemorySession` and corresponding Tauri command `scene_remove_havok_data`.

#### 2. Sub-model

**Storage:** On-disk folder under stage root (e.g., `stageRoot/box01/`). Loaded into `base_bundle.sub_model_files` in Rust and `subModels` / `subModelBundles` React state.

**Delete flow:**
1. Call `useSceneDirtyStore.getState().markObjectDeleted(folderName)` — flags for Phase 1 deletion at save time
2. Remove matching placement entries from `placementEntries` state (all entries where `objectNumber === objectIndex`)
3. Remove the `StageTreeNode` from `treeRoot.children`
4. Remove from `subModels` / `subModelBundles` React state (removes 3D objects from viewport)
5. Mark `placementOrder` as globally dirty

**Physical deletion:** Handled by existing `executeDelete(stageRoot, deletedFolderNames)` during save pipeline Phase 1. The existing `buildDeletePreview` generates a file list for the confirmation dialog.

**No backend change needed** — `base_bundle` is read-only in the Rust session; deletion is a frontend + filesystem operation.

#### 3. Base model

**Storage:** On-disk root-level SSBH files (`model.numdlb`, `model.numshb`, etc.) under stage root. Loaded into `base_bundle.root_files` in Rust and `baseModel` React state.

**Delete flow:**
1. Call `useSceneDirtyStore.getState().markObjectDeleted("base")` — uses the reserved key `"base"` to flag base model deletion
2. Set `baseModel` React state to `null` (removes 3D object from viewport)
3. Remove the `StageTreeNode` with `role: "base"` from `treeRoot.children`

**Physical deletion:** Extend save pipeline Phase 1 to handle `"base"` as a special case — instead of deleting a subfolder, delete root-level SSBH files (`*.numdlb`, `*.numshb`, `*.numshexb`, `*.nusktb`, `*.numatb`). Add a `buildBaseDeletePreview(stageRoot)` helper that lists these files.

### Confirmation Dialog

A single `DeleteConfirmDialog` component used for all three types. It receives a `DeleteConfirmation` object (already exists in `sceneDeleteConfirm.ts`) and shows:

- List of folders/files to be deleted
- Total file count and size
- For sub-models: number of placement entries that will be removed
- For imported DAE: note that associated HKT collision data will also be removed

The dialog is shown **immediately on delete action** (not deferred to save time) for sub-model and base model deletions that affect on-disk files. For imported DAE (memory-only), a lighter toast confirmation is sufficient since no disk files are at risk.

### Updated `handleDeleteSelected`

The existing function gains two new branches, checked in order:

```
1. Match imported DAE → DAE deletion path (enhanced with backend cleanup)
2. Match sub-model (role === "sub_model") → Sub-model deletion path (NEW)
3. Match base model (role === "base") → Base model deletion path (NEW)
4. Match placement row → existing placement deletion (unchanged)
```

Multi-select is supported: if the selection includes both sub-models and placements, they are processed in the order above. The confirmation dialog aggregates all deletions into a single preview.

## Data Flow

```
User selects node(s) → presses Delete / clicks context menu "Delete"
  ↓
handleDeleteSelected(ids)
  ↓
Classify each id by role (imported_dae | sub_model | base | placement)
  ↓
Build aggregated DeleteConfirmation preview
  ↓
Show DeleteConfirmDialog (async, awaits user confirm/cancel)
  ↓ (confirmed)
For each type, execute deletion path:
  - imported_dae: React state cleanup + sceneRemoveImport + sceneRemoveHavokData
  - sub_model: markObjectDeleted + remove placements + remove from tree/viewport
  - base: markObjectDeleted("base") + remove from tree/viewport
  ↓
Clear selection, mark dirty, show toast
  ↓ (at save time)
Save pipeline Phase 1 reads dirtyStore.getDeletedObjects()
  → executeDelete removes sub-model folders from disk
  → new base delete logic removes root SSBH files from disk
  → Phase 7 re-filters placement rows (drops orphaned objectNumber refs)
  → Phase 8 rebuilds _structure.json
```

## Changes Required

### Backend (Rust)

| File | Change |
|------|--------|
| `scene_memory_session.rs` | Add `remove_havok_data(source_id: &str)` method — removes entry from `self.havok_data` by `source_id`, sets `dirty = true` |
| `scene_session_commands.rs` | Add `scene_remove_havok_data` Tauri command wrapping the new method |
| `lib.rs` | Register `scene_remove_havok_data` in `generate_handler!` |

### Frontend — Service Layer

| File | Change |
|------|--------|
| `sceneSessionService.ts` | Add `sceneRemoveHavokData(sessionId, sourceId)` IPC wrapper |
| `sceneDeleteConfirm.ts` | Add `buildBaseDeletePreview(stageRoot)` — lists root-level SSBH files for base model deletion preview |

### Frontend — UI & State

| File | Change |
|------|--------|
| `page.tsx` `handleDeleteSelected` | Add sub-model and base model branches; enhance DAE branch with backend cleanup (`sceneRemoveImport` + `sceneRemoveHavokData`); add confirmation dialog for disk-affecting deletions; remove undo/redo recording for all delete operations |
| `page.tsx` state cleanup | For sub-model: remove from `subModels`, `subModelBundles`, `treeRoot.children`. For base: set `baseModel` to null, remove from `treeRoot.children` |
| `sceneSaveFolderPipeline.ts` Phase 1 | Handle `"base"` in `deletedObjects` — call `buildBaseDeletePreview` and delete root SSBH files instead of a subfolder |

### Frontend — New Component

| File | Purpose |
|------|---------|
| `DeleteConfirmDialog.tsx` | Modal dialog showing deletion preview (files, sizes, associated data). Receives `DeleteConfirmation` + optional metadata (placement count, HKT info). Returns `Promise<boolean>`. |

## Error Handling

- If `sceneRemoveImport` fails (session not found, import not found): show error toast, abort deletion for that item, continue with others
- If `sceneRemoveHavokData` fails: log warning, continue (non-critical — HKT data is orphaned but harmless)
- If disk deletion fails during save Phase 1: existing behavior — show error in progress UI, abort save pipeline
- If base model root files are read-only or locked: `remove()` throws → caught by Phase 1 error handling

## Testing

### Unit Tests

- `handleDeleteSelected` correctly classifies node roles and dispatches to the right path
- `markObjectDeleted("base")` correctly flags base model for deletion
- `buildBaseDeletePreview` lists correct root-level SSBH files
- Placement entries are correctly filtered when a sub-model is deleted
- `remove_havok_data` on `SceneMemorySession` removes the correct entry and sets dirty

### Integration Tests

- Delete imported DAE → verify `sceneRemoveImport` and `sceneRemoveHavokData` are called
- Delete sub-model → verify `markObjectDeleted` called, placements removed, tree node removed
- Delete base model → verify base node removed from tree, `baseModel` state nulled
- Save pipeline Phase 1 correctly deletes sub-model folders and base SSBH files

## Out of Scope

- Undo/redo for any deletion
- Deleting placement rows associated with effect-type entries (unchanged existing behavior)
- Batch delete across mixed stage and non-stage scenes
- Deleting texture-only folders
