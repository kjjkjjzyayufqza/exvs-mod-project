# Scene Editor Save (Folder & FHM2D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement two distinct save operations in the Scene Editor — "Save as Folder" (writes all scene changes to the stage folder on disk) and "Save as FHM2D" (Save as Folder + pack into .fhm2d binary).

**Architecture:** Incremental dirty-tracking per object (added/modified/deleted) drives a save pipeline that writes only changed assets. A shared `textures/` folder at stage root holds all nutexb files (deduplicated by filename). Structure JSON is always fully rebuilt from disk state after writes. Save as FHM2D wraps the folder save and invokes compression.js for packing.

**Tech Stack:** TypeScript (frontend UI + save orchestration), Rust/Tauri (nutexb conversion, SSBH generation, HKT, FHM2D packing via `fhm2d_pack.rs`, texture redistribution via `fhm2d_stage.rs`), Three.js (scene state), Zustand (dirty tracking store)

---

## Context

The Scene Editor currently has a single "Save" button (`MapToolbar.tsx:175-197`) that calls `executeStageSave` (`sceneSavePipeline.ts:268`). This function only handles:
- DAE → SSBH conversion for newly imported objects (parallel via `convertSingleDae`)
- Writing `placement.csv` and `graphic_param.csv`
- Repack via `repackFolderUsingStructure` (compression.js) + reload via `load_stage_bundle`

It does **NOT** handle:
- Saving modified transforms of existing placed objects
- Deleting removed objects from disk
- Saving texture/material changes
- Migrating old format (textures duplicated per model) to new format (shared `textures/`)
- Packing to fhm2d as a separate output file

The `page.tsx` currently uses a simple `useState(false)` for `hasUnsavedChanges` (line 277), with `setHasUnsavedChanges(true)` called ~70 times throughout the file for various operations (transform, duplicate, delete, graphic param, placement field edits, etc.). This must be replaced with granular dirty tracking.

This plan implements the full save pipeline with two distinct UI buttons.

## Key Decisions (from design session)

| Decision | Choice |
|----------|--------|
| Structure JSON rebuild | Full rebuild via `writeStagePackStructureJson` (scan disk after all writes) |
| Delete handling | Double-confirm dialog showing files to delete + re-index objectNumbers |
| Texture strategy | Shared `textures/` folder at stage root, no textures in model subfolders |
| Old format migration | Auto-migrate on save (deduplicate textures to `textures/`) |
| Texture dedup | By filename; warn/suffix if same name but different content |
| Save as Folder target | Always writes back to current `stageRoot` |
| Save as FHM2D target | File save dialog for user to choose .fhm2d path |
| FHM2D flow | Dialog first → Save as Folder → Pack |
| Model folder structure | `modelName/0/` contains SSBH files (numshb, numdlb, numatb, etc.); HKT at `modelName/` root |
| Dirty tracking | Zustand+immer store, incremental per-object (added/modified/deleted) + per-field flags |
| UI | Two independent buttons side by side in MapToolbar |
| Progress | Modal dialog with step list (extend `StageImportProgressDialog` pattern with error states) |
| Error handling | Partial commit + report failures per step |
| base/sky/objects | All treated equally, all use shared `textures/`, fully editable |
| placement.csv | base has no entry; sky has `VDK_TYPE=SKY`; EFFECT entries preserved as-is |
| New texture import | User selects DDS format; source is PNG |
| HKT | Auto-generated on DAE import + can be replaced; existing objects support replace only |
| FHM2D texture redistribution | **Implemented** — Rust `redistribute_stage_textures` + `restore_shared_textures` (parses numatb refs, copies nutexb to model subdirs before pack, restores shared layout after) |

---

## File Structure

### New Files

```
src/page/SceneEdit/store/sceneDirtyStore.ts              — Dirty tracking state (per-object change map)
src/page/SceneEdit/store/sceneDirtyStore.test.ts          — Tests for dirty store
src/page/SceneEdit/utils/sceneSaveFolderPipeline.ts       — Save as Folder orchestration
src/page/SceneEdit/utils/sceneSaveFolderPipeline.test.ts  — Tests for folder save pipeline
src/page/SceneEdit/utils/sceneSaveFhm2dPipeline.ts       — Save as FHM2D orchestration (folder save + pack)
src/page/SceneEdit/utils/sceneTextureMigration.ts         — Old format → new format texture migration
src/page/SceneEdit/utils/sceneTextureMigration.test.ts    — Tests for texture migration
src/page/SceneEdit/utils/sceneTextureDedup.ts             — Texture deduplication logic
src/page/SceneEdit/utils/sceneTextureDedup.test.ts        — Tests for texture dedup
src/page/SceneEdit/utils/sceneDeleteConfirm.ts            — Delete confirmation data builder
src/page/SceneEdit/utils/sceneDeleteConfirm.test.ts       — Tests for delete confirmation
src/page/SceneEdit/components/SaveProgressDialog.tsx       — Modal progress dialog with error states
src/page/SceneEdit/components/DeleteConfirmDialog.tsx      — Double-confirm deletion dialog
src/page/SceneEdit/components/TextureFormatSelect.tsx      — DDS format selector for new texture import
```

### Modified Files

```
src/page/SceneEdit/components/MapToolbar.tsx               — Replace single save button with two buttons
src/page/SceneEdit/page.tsx                                — Wire dirty store + new save handlers (~70 setHasUnsavedChanges sites)
src/page/SceneEdit/utils/sceneStageStructure.ts            — No changes needed (already handles shared textures/)
src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx — Add texture format selection
src/utils/repackRunner.ts                                  — Add repackFolderToFhm2dFile variant
```

### Existing Utilities (reused, not modified)

```
src/page/SceneEdit/utils/sceneStageStructure.ts       — buildStageStructureJsonFromFiles, resolveStagePackStructureTarget
src/page/SceneEdit/utils/sceneDaeSsbhSave.ts          — buildImportedDaeStageRegistrationPlan, buildImportedDaeSsbhConvertParams, createImportedDaePlacementRow
src/page/SceneEdit/utils/sceneSavePipeline.ts         — convertSingleDae (reused), executeStageSave (deprecated)
src/page/SceneEdit/utils/sceneSessionService.ts       — sceneSaveAsFolder (Rust backend call for session artifacts)
src/page/SceneEdit/store/sceneEditorStore.ts          — Selection, groups, clipboard, undo/redo (not modified)
src/utils/repackRunner.ts                             — repackFolderUsingStructure, repackFolderUsingStructureToDir
```

---

## Task 1: Dirty Tracking Store

**Files:**
- Create: `src/page/SceneEdit/store/sceneDirtyStore.ts`
- Create: `src/page/SceneEdit/store/sceneDirtyStore.test.ts`

### Data Model

```typescript
type ChangeType = "added" | "modified" | "deleted";

type ModifiedFields = {
  transform: boolean;
  material: boolean;
  textures: boolean;
  hkt: boolean;
};

type ObjectDirtyEntry = {
  changeType: ChangeType;
  modifiedFields: ModifiedFields;
};

type GlobalDirtyState = {
  graphicParams: boolean;
  placementOrder: boolean;
};

interface SceneDirtyStore {
  objects: Map<string, ObjectDirtyEntry>;
  global: GlobalDirtyState;

  hasAnyChanges: () => boolean;
  markObjectAdded: (folderName: string) => void;
  markObjectModified: (folderName: string, field: keyof ModifiedFields) => void;
  markObjectDeleted: (folderName: string) => void;
  markGlobalDirty: (field: keyof GlobalDirtyState) => void;

  getAddedObjects: () => string[];
  getModifiedObjects: () => string[];
  getDeletedObjects: () => string[];

  reset: () => void;
  resetObject: (folderName: string) => void;
}
```

### Behavioral Rules

- `markObjectDeleted` on an "added" object removes it entirely (never existed on disk, no save needed)
- `markObjectModified` on a "deleted" object is a no-op (already marked for deletion)
- `markObjectModified` on an "added" object is a no-op (full write already planned)
- `markGlobalDirty("placementOrder")` is set whenever any placement row is added, removed, reordered, or has field edits
- `markGlobalDirty("graphicParams")` is set whenever any graphic_param value changes

### Implementation Notes

- Use Zustand with `immer` middleware (matching `sceneEditorStore.ts` pattern)
- Store key is `folderName` (the model folder name in the stage directory, e.g., `"001stage001_object_box01"`)
- For imported DAE objects that don't yet have a `folderName`, use the `ImportedDaeObject.name` as a temporary key; the folder name is assigned at save time by `buildImportedDaeStageRegistrationPlan`

- [ ] **Step 1: Write failing tests for dirty store**

Test cases:
- `markObjectAdded` adds entry with changeType "added"
- `markObjectModified` creates entry with changeType "modified" if not exists, sets field flag
- `markObjectModified` on existing "modified" entry preserves other field flags
- `markObjectDeleted` sets changeType "deleted"
- `markObjectDeleted` on an "added" object removes the entry entirely
- `markObjectModified` on a "deleted" object is a no-op (entry remains "deleted")
- `markObjectModified` on an "added" object is a no-op (entry remains "added")
- `hasAnyChanges` returns false when empty, true when any object or global field is dirty
- `reset` clears all objects and global state
- `resetObject` removes a single object entry
- `getDeletedObjects` / `getAddedObjects` / `getModifiedObjects` filter correctly
- `markGlobalDirty("graphicParams")` sets the flag; `hasAnyChanges` reflects it

- [ ] **Step 2: Implement sceneDirtyStore.ts**

- [ ] **Step 3: Run tests — verify all pass**

- [ ] **Step 4: Code review**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(scene): add dirty tracking store for incremental save"
```

---

## Task 2: Delete Confirmation System

**Files:**
- Create: `src/page/SceneEdit/utils/sceneDeleteConfirm.ts`
- Create: `src/page/SceneEdit/utils/sceneDeleteConfirm.test.ts`
- Create: `src/page/SceneEdit/components/DeleteConfirmDialog.tsx`

### Logic

```typescript
type DeletePreview = {
  folderName: string;
  folderPath: string;
  files: string[];
  totalSizeBytes: number;
};

type DeleteConfirmation = {
  previews: DeletePreview[];
  totalFiles: number;
  totalSizeBytes: number;
};

async function buildDeletePreview(
  stageRoot: string,
  deletedFolderNames: string[],
): Promise<DeleteConfirmation>;

async function executeDelete(
  stageRoot: string,
  confirmedFolderNames: string[],
): Promise<void>;
```

### Implementation Notes

- `buildDeletePreview` uses Tauri `readDir` (from `@tauri-apps/plugin-fs`) to recursively enumerate files in each folder
- `executeDelete` uses Tauri `remove` (from `@tauri-apps/plugin-fs`) with `{ recursive: true }` to delete folders
- File sizes obtained via Tauri `stat` (from `@tauri-apps/plugin-fs`)

### DeleteConfirmDialog Component

- Shows list of folders to be deleted with file counts and sizes
- Two-step confirmation: first click shows details, second click ("Confirm Delete") executes
- Cancel button to abort
- Red warning styling (`text-destructive`, `border-destructive`) to indicate destructive action
- Returns a `Promise<boolean>` — `true` if user confirmed, `false` if cancelled

- [ ] **Step 1: Write tests for buildDeletePreview**

Test cases:
- Returns correct file list for a single folder
- Calculates total size across files
- Handles multiple folders
- Handles empty folder gracefully (0 files, 0 bytes)
- Handles non-existent folder (throws or returns empty)

- [ ] **Step 2: Implement sceneDeleteConfirm.ts**

- [ ] **Step 3: Implement DeleteConfirmDialog component**

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Code review**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(scene): add delete confirmation dialog with file preview"
```

---

## Task 3: Texture Migration & Deduplication

**Files:**
- Create: `src/page/SceneEdit/utils/sceneTextureMigration.ts`
- Create: `src/page/SceneEdit/utils/sceneTextureMigration.test.ts`
- Create: `src/page/SceneEdit/utils/sceneTextureDedup.ts`
- Create: `src/page/SceneEdit/utils/sceneTextureDedup.test.ts`

### Migration Logic

Detects old format where textures are stored in numbered subdirectories within model folders (e.g., `modelName/0/`, `modelName/1/` containing `.nutexb` files) and migrates them to the shared `textures/` folder at stage root.

Steps:
1. Scan each model folder in `stageRoot` for numbered subdirectories (`/^\d+$/`)
2. Check if any numbered subdirectory contains `.nutexb` files (old format indicator)
3. Deduplicate by filename (compare binary content if same name found from multiple sources)
4. Move unique textures to `{stageRoot}/textures/`
5. Remove the numbered texture subdirectories from model folders after migration

```typescript
type MigrationResult = {
  migratedCount: number;
  deduplicatedCount: number;
  conflicts: Array<{ filename: string; sources: string[]; suffixUsed: string }>;
};

async function detectOldTextureFormat(stageRoot: string): Promise<boolean>;

async function migrateTexturesToSharedFolder(stageRoot: string): Promise<MigrationResult>;
```

### Deduplication Logic

```typescript
type DedupResult = {
  kept: string[];
  duplicatesRemoved: number;
  conflicts: Array<{ filename: string; suffix: string }>;
};

async function deduplicateTextureFolder(texturesDir: string): Promise<DedupResult>;

async function compareNutexbContent(pathA: string, pathB: string): Promise<boolean>;
```

Conflict resolution: If `texture_diffuse.nutexb` already exists in `textures/` with different binary content, rename the new one to `texture_diffuse_1.nutexb` and update the referencing numatb file.

### Implementation Notes

- Use Tauri `readDir`, `readFile`, `writeFile`, `rename`, `remove` from `@tauri-apps/plugin-fs`
- Binary content comparison via `readFile` + byte-by-byte or hash comparison
- The `RESERVED_STAGE_MODEL_FOLDERS` set in `sceneDaeSsbhSave.ts` (line 10) already excludes `"base"`, `"info"`, `"textures"` — use this to filter which folders are model folders

- [ ] **Step 1: Write tests for deduplication logic**

Test cases:
- Same filename + same content → keep one, remove duplicate
- Same filename + different content → rename with suffix, report conflict
- Unique filenames → no changes
- Empty folder → no-op

- [ ] **Step 2: Implement sceneTextureDedup.ts**

- [ ] **Step 3: Write tests for migration logic**

Test cases:
- Detects old format (numbered subfolders containing .nutexb files)
- Does not trigger on new format (no numbered subfolders, or no .nutexb in them)
- Moves textures to `textures/` folder
- Removes empty numbered subfolders after migration
- Handles dedup conflicts correctly during migration

- [ ] **Step 4: Implement sceneTextureMigration.ts**

- [ ] **Step 5: Run all tests**

- [ ] **Step 6: Code review**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(scene): add texture migration and deduplication for shared textures/ folder"
```

---

## Task 4: Save Progress Dialog

**Files:**
- Create: `src/page/SceneEdit/components/SaveProgressDialog.tsx`

### Component Design

Extends the pattern from `StageImportProgressDialog.tsx` (which only has pending/active/done states) by adding an `"error"` status and a close button:

```typescript
type SaveStepStatus = "pending" | "running" | "done" | "error";

type SaveStepInfo = {
  id: string;
  label: string;
  status: SaveStepStatus;
  detail?: string;
  error?: string;
};

type SaveProgressDialogProps = {
  open: boolean;
  title: string;
  steps: SaveStepInfo[];
  onClose: () => void;
  canClose: boolean;
};
```

Features:
- Title dynamically changes: "Saving..." → "Save Complete" / "Save Failed"
- Step list with status indicators: `Circle` (pending), `Loader2` (running), `CheckCircle2` (done), `XCircle` (error)
- Expandable error details per step (collapsible text below the step)
- Close button only enabled when `canClose` is true (complete or failed)
- Blocks all scene interaction while open (`onPointerDownOutside` + `onEscapeKeyDown` prevented)
- Reuses existing UI components: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`

Steps displayed:
1. Checking for deletions...
2. Migrating textures...
3. Converting new objects (N/M)...
4. Writing materials...
5. Writing textures...
6. Writing HKT files...
7. Writing CSV files...
8. Rebuilding structure JSON...
9. (FHM2D only) Packing FHM2D...

- [ ] **Step 1: Implement SaveProgressDialog component**

- [ ] **Step 2: Code review**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(scene): add modal save progress dialog with error states"
```

---

## Task 5: Save as Folder Pipeline

**Files:**
- Create: `src/page/SceneEdit/utils/sceneSaveFolderPipeline.ts`
- Create: `src/page/SceneEdit/utils/sceneSaveFolderPipeline.test.ts`

### Pipeline Interface

```typescript
import type { PlacementRow } from "../types/placement";
import type { ImportedDaeObject } from "../components/MapViewport";
import type { StageBundleResponse, SaveStepInfo } from "./sceneSavePipeline";
import type { DeleteConfirmation } from "./sceneDeleteConfirm";
import type { SceneDirtyStore } from "../store/sceneDirtyStore";

type SaveFolderParams = {
  stageRoot: string;
  dirtyStore: SceneDirtyStore;
  graphicParams: Array<{ key: string; value: string }>;
  placementHeader: readonly string[];
  placementEntries: readonly PlacementRow[];
  importedDaeObjects: readonly ImportedDaeObject[];
  sceneSessionId: string | null;
  onProgress: (step: SaveStepInfo) => void;
  onDeleteConfirm: (preview: DeleteConfirmation) => Promise<boolean>;
};

type SaveFolderResult = {
  success: boolean;
  convertedCount: number;
  failedCount: number;
  failedNames: string[];
  deletedCount: number;
  migratedTextures: number;
  reloadedBundle: StageBundleResponse | null;
};

async function executeSaveFolderPipeline(params: SaveFolderParams): Promise<SaveFolderResult>;
```

### Execution Order

1. **Delete phase**: If `dirtyStore.getDeletedObjects().length > 0`:
   - Call `buildDeletePreview(stageRoot, deletedFolderNames)` to build preview
   - Call `onDeleteConfirm(preview)` — if user cancels, abort entire save and return `{ success: false }`
   - On confirm: call `executeDelete(stageRoot, confirmedFolderNames)` to recursively remove folders

2. **Migration phase**: Call `detectOldTextureFormat(stageRoot)`:
   - If old format detected → call `migrateTexturesToSharedFolder(stageRoot)`
   - If not → skip

3. **Convert phase**: For each object in `dirtyStore.getAddedObjects()` that has a corresponding `ImportedDaeObject`:
   - Reuse `allocateAllFolderPlans` + `convertSingleDae` from existing `sceneSavePipeline.ts`
   - Run conversions in parallel via `Promise.all`
   - Report progress per object

4. **Material phase**: For each object in `dirtyStore.getModifiedObjects()` where `modifiedFields.material === true`:
   - Write updated numatb to `{stageRoot}/{folderName}/0/`
   - (Material data comes from the scene session or in-memory state)

5. **Texture phase**: For each object in `dirtyStore.getModifiedObjects()` where `modifiedFields.textures === true`:
   - Write new `.nutexb` files to `{stageRoot}/textures/` (with dedup check)
   - Run `deduplicateTextureFolder` if new textures were added

6. **HKT phase**: For each object in `dirtyStore.getModifiedObjects()` where `modifiedFields.hkt === true`:
   - Write `.hkt` file to `{stageRoot}/{folderName}/`

7. **CSV phase**:
   - Write `graphic_param.csv` to `{stageRoot}/info/`
   - Write `placement.csv` to `{stageRoot}/info/`:
     - If objects were deleted: call `load_stage_bundle` to get new folder→objectIndex mapping, rebuild all placement rows with corrected `VDK_OBJECTNUMBER` values
     - Preserve EFFECT and other non-OBJECT/SKY entries as-is (no objectNumber change)
   - Session artifacts: if `sceneSessionId` is present, call `sceneSaveAsFolder(sceneSessionId, stageRoot)`

8. **Structure phase**: Call `writeStagePackStructureJson(stageRoot)` to do full rebuild of structure JSON from disk files

9. **Reload phase**: Call `invoke<StageBundleResponse>("load_stage_bundle", { stageRoot })` to refresh scene state

### ObjectNumber Re-indexing After Delete

After deleting folders and before writing placement.csv:
1. Call `load_stage_bundle` to get the new folder→objectIndex mapping from `subModels`
2. For each surviving placement row with `vdkType === "OBJECT"`:
   - Look up the sub-model by `folderName` → get new `objectIndex`
   - Update `VDK_OBJECTNUMBER` in `rawFields` via `patchPlacementRawFieldsForNumericField`
3. Preserve EFFECT rows and other non-OBJECT/SKY entries unchanged
4. Remove placement rows whose `objectNumber` references a deleted object

- [ ] **Step 1: Write integration tests for the pipeline** (mock fs operations and Tauri invoke, verify correct execution order and data flow)

- [ ] **Step 2: Implement executeSaveFolderPipeline** (extract and reuse `convertSingleDae`, `allocateAllFolderPlans`, `writeStagePackStructureJson`, `collectStagePackFiles` from `sceneSavePipeline.ts`)

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Code review**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(scene): implement Save as Folder pipeline with incremental dirty tracking"
```

---

## Task 6: Save as FHM2D Pipeline

**Files:**
- Create: `src/page/SceneEdit/utils/sceneSaveFhm2dPipeline.ts`
- Modify: `src/utils/repackRunner.ts` — add `repackFolderToFhm2dFile` function

### Pipeline

```typescript
type SaveFhm2dParams = SaveFolderParams & {
  outputFhm2dPath: string; // user-chosen path from Tauri save dialog
};

type SaveFhm2dResult = SaveFolderResult & {
  fhm2dPath: string;
  fhm2dSizeBytes: number;
};

async function executeSaveFhm2dPipeline(params: SaveFhm2dParams): Promise<SaveFhm2dResult>;
```

Steps:
1. Execute full `executeSaveFolderPipeline` (all 9 phases)
2. If folder save succeeded → call `repackFolderToFhm2dFile` to pack folder → fhm2d at `outputFhm2dPath`
3. Get output file size via Tauri `stat`
4. NOTE: Texture redistribution into model subfolders for fhm2d packing is deferred (assumes compression.js will handle this, or a future update)

### repackRunner.ts Addition

Add a new function alongside the existing `repackFolderUsingStructure` and `repackFolderUsingStructureToDir`:

```typescript
type RepackToFileParams = {
  structurePath: string;
  inputFolderPath: string;
  outputFilePath: string; // the .fhm2d output path
  toolPath?: string;
};

export async function repackFolderToFhm2dFile({
  structurePath,
  inputFolderPath,
  outputFilePath,
  toolPath,
}: RepackToFileParams): Promise<void> {
  const tool = toolPath ?? "E:\\XB\\解包\\com\\compression.js";
  const normalizedStructurePath = toWindowsPath(structurePath);
  const normalizedInputPath = toWindowsPath(inputFolderPath);
  const normalizedOutputPath = toWindowsPath(outputFilePath);
  const parentSegments = normalizedInputPath.split("\\").slice(0, -1);
  const comPath = parentSegments.join("\\") + (parentSegments.length ? "\\" : "");

  const command = await Command.create(
    "exec-node",
    [tool, normalizedStructurePath, "-r", "-com-path", comPath, "-o", normalizedOutputPath],
    { encoding: "utf-8" }
  ).execute();

  if (command.code !== 0) {
    throw new Error(command.stderr || "Repack to FHM2D failed");
  }
}
```

> **Note:** The exact compression.js CLI flags for outputting to a specific .fhm2d file path need to be verified. If compression.js doesn't support `-o` for output path, the implementation may need to: (a) pack in-place and then rename/move, or (b) use `repackFolderUsingStructureToDir` with a temp directory and then rename. This must be confirmed during implementation.

- [ ] **Step 1: Add repackFolderToFhm2dFile to repackRunner.ts**

- [ ] **Step 2: Implement executeSaveFhm2dPipeline**

- [ ] **Step 3: Code review**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(scene): implement Save as FHM2D pipeline"
```

---

## Task 7: Update MapToolbar UI

**Files:**
- Modify: `src/page/SceneEdit/components/MapToolbar.tsx`

### Props Changes

```typescript
// Remove from MapToolbarProps:
onSave: () => void;

// Add to MapToolbarProps:
onSaveFolder: () => void;
onSaveFhm2d: () => void;
```

### UI Changes

Replace the single Save button (lines 175-197) with two buttons:

1. **Save as Folder** button:
   - Icon: `Save` (existing import)
   - Shows the unsaved changes indicator dot (yellow ping animation)
   - Tooltip: "Save as Folder"

2. **Save as FHM2D** button:
   - Icon: `PackageOpen` (already imported but used for Extract — need a different icon to avoid confusion, consider `FileArchive` with a different style or `HardDriveDownload`)
   - No unsaved changes dot
   - Tooltip: "Save as FHM2D"

Both buttons disabled when `!canSave || isLoading`.

- [ ] **Step 1: Update MapToolbarProps interface** — replace `onSave` with `onSaveFolder` + `onSaveFhm2d`

- [ ] **Step 2: Replace single save button with two buttons** — keep the existing icon styling and unsaved indicator

- [ ] **Step 3: Code review**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(scene): split save button into Save Folder and Save FHM2D"
```

---

## Task 8: Wire Save Handlers in page.tsx

**Files:**
- Modify: `src/page/SceneEdit/page.tsx`

### Overview

This is the largest task — `page.tsx` is ~2800 lines with ~70 `setHasUnsavedChanges(true)` call sites. The changes are:

1. **Import and initialize dirty store**: Add `useSceneDirtyStore` alongside existing `useSceneEditorStore`
2. **Replace `hasUnsavedChanges` boolean**: Remove `useState(false)` on line 277; derive from `dirtyStore.hasAnyChanges()`
3. **Replace all ~70 `setHasUnsavedChanges(true)` calls** with appropriate dirty store mutations
4. **Replace `handleSave`** with `handleSaveFolder` and `handleSaveFhm2d`
5. **Add SaveProgressDialog and DeleteConfirmDialog state management**
6. **Update MapToolbar props**: Pass `onSaveFolder` and `onSaveFhm2d` instead of `onSave`

### Dirty Store Mutation Mapping

The ~70 `setHasUnsavedChanges(true)` sites fall into these categories:

| Category | Current pattern | New dirty store call |
|----------|----------------|---------------------|
| Transform change (property editor) | `setHasUnsavedChanges(true)` after transform update | `markObjectModified(folderName, "transform")` + `markGlobalDirty("placementOrder")` |
| Placement field edit | `setHasUnsavedChanges(true)` after raw field change | `markGlobalDirty("placementOrder")` |
| Placement duplicate/paste | `setHasUnsavedChanges(true)` after duplicate | `markGlobalDirty("placementOrder")` |
| Placement delete | `setHasUnsavedChanges(true)` after delete | `markObjectDeleted(folderName)` + `markGlobalDirty("placementOrder")` |
| DAE import (new object) | `setHasUnsavedChanges(true)` after import | `markObjectAdded(tempName)` |
| DAE duplicate | `setHasUnsavedChanges(true)` after clone | `markObjectAdded(cloneName)` |
| Graphic param change | `setHasUnsavedChanges(true)` after param edit | `markGlobalDirty("graphicParams")` |
| Graphic param add/delete | `setHasUnsavedChanges(true)` after add/remove | `markGlobalDirty("graphicParams")` |
| Reset session | `setHasUnsavedChanges(false)` | `dirtyStore.reset()` |
| Reset subsection | `setHasUnsavedChanges(true)` after partial reset | `markGlobalDirty("placementOrder")` or `markGlobalDirty("graphicParams")` |
| Undo/redo callbacks | `setHasUnsavedChanges(true)` in undo/redo | Same dirty mutation as the original action |

### handleSaveFolder Implementation

```typescript
const handleSaveFolder = useCallback(async () => {
  if (!stageRoot) return;
  // Open SaveProgressDialog
  setSaveProgressOpen(true);
  try {
    const result = await executeSaveFolderPipeline({
      stageRoot,
      dirtyStore: useSceneDirtyStore.getState(),
      graphicParams,
      placementHeader,
      placementEntries,
      importedDaeObjects,
      sceneSessionId,
      onProgress: (step) => setSaveSteps(prev => updateStepInList(prev, step)),
      onDeleteConfirm: (preview) => showDeleteConfirmDialog(preview),
    });

    if (result.reloadedBundle) {
      applyBundle(stageRoot, result.reloadedBundle, { showToast: false });
    }

    useSceneDirtyStore.getState().reset();
    // Clear imported DAE objects that were successfully converted
    setImportedDaeObjects([]);
    // Show success/partial failure toast
  } catch (err) {
    // Show error toast
  } finally {
    setSaveProgressCanClose(true);
  }
}, [stageRoot, graphicParams, placementHeader, placementEntries, importedDaeObjects, sceneSessionId, applyBundle]);
```

### handleSaveFhm2d Implementation

```typescript
const handleSaveFhm2d = useCallback(async () => {
  if (!stageRoot) return;
  // Open Tauri save file dialog first
  const outputPath = await save({
    defaultPath: `${stageName ?? "stage"}.fhm2d`,
    filters: [{ name: "FHM2D", extensions: ["fhm2d"] }],
  });
  if (!outputPath) return; // User cancelled

  setSaveProgressOpen(true);
  try {
    const result = await executeSaveFhm2dPipeline({
      stageRoot,
      dirtyStore: useSceneDirtyStore.getState(),
      graphicParams,
      placementHeader,
      placementEntries,
      importedDaeObjects,
      sceneSessionId,
      outputFhm2dPath: outputPath,
      onProgress: (step) => setSaveSteps(prev => updateStepInList(prev, step)),
      onDeleteConfirm: (preview) => showDeleteConfirmDialog(preview),
    });

    useSceneDirtyStore.getState().reset();
    setImportedDaeObjects([]);
    // Show success toast with file size
  } catch (err) {
    // Show error toast
  } finally {
    setSaveProgressCanClose(true);
  }
}, [stageRoot, stageName, graphicParams, placementHeader, placementEntries, importedDaeObjects, sceneSessionId, applyBundle]);
```

### New Imports Needed in page.tsx

```typescript
import { save } from "@tauri-apps/plugin-dialog"; // for FHM2D save dialog
import { useSceneDirtyStore } from "./store/sceneDirtyStore";
import { executeSaveFolderPipeline } from "./utils/sceneSaveFolderPipeline";
import { executeSaveFhm2dPipeline } from "./utils/sceneSaveFhm2dPipeline";
import { SaveProgressDialog, type SaveStepInfo } from "./components/SaveProgressDialog";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
```

### New State Variables

```typescript
const [saveProgressOpen, setSaveProgressOpen] = useState(false);
const [saveSteps, setSaveSteps] = useState<SaveStepInfo[]>([]);
const [saveProgressCanClose, setSaveProgressCanClose] = useState(false);
const [deleteConfirmState, setDeleteConfirmState] = useState<{
  open: boolean;
  preview: DeleteConfirmation | null;
  resolve: ((confirmed: boolean) => void) | null;
}>({ open: false, preview: null, resolve: null });
```

- [ ] **Step 1: Initialize dirty store and add save progress / delete confirm state**

- [ ] **Step 2: Implement handleSaveFolder with SaveProgressDialog integration**

- [ ] **Step 3: Implement handleSaveFhm2d with Tauri save dialog**

- [ ] **Step 4: Replace all ~70 setHasUnsavedChanges(true) calls with dirty store mutations** (this is the most tedious step — go through each call site and map it to the correct mutation based on the table above)

- [ ] **Step 5: Update MapToolbar props** — pass `onSaveFolder` and `onSaveFhm2d` instead of `onSave`

- [ ] **Step 6: Add SaveProgressDialog and DeleteConfirmDialog to JSX render tree**

- [ ] **Step 7: Build verification** — `pnpm build` must pass

- [ ] **Step 8: Code review**

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(scene): wire dirty store and save handlers in page.tsx"
```

---

## Task 9: Texture Format Selection for DAE Import

**Files:**
- Create: `src/page/SceneEdit/components/TextureFormatSelect.tsx`
- Modify: `src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx`

### TextureFormatSelect Component

Dropdown/select for DDS format when importing new textures from PNG source files:

| Format | Use Case |
|--------|----------|
| BC7_UNORM (default) | High quality color textures |
| BC7_UNORM_SRGB | sRGB color space |
| BC5_UNORM | Normal maps (two channel) |
| BC4_UNORM | Single channel — roughness, metallic, AO |
| BC1_UNORM | Low quality, small size |
| BC3_UNORM | Color + alpha |

### DaeImportConfigModal Integration

Add a section in the import config modal (`DaeImportConfigModal.tsx`) where user can:
1. Assign textures to material slots (select from existing `textures/` folder or import new PNG)
2. For new PNG imports, select the DDS format from the dropdown
3. Preview which textures will be written to `textures/` on save

### DaeImportConfig Extension

Add to `daeImportTypes.ts`:
```typescript
interface TextureImportEntry {
  slot: string; // e.g., "map", "normalMap", "roughnessMap"
  source: { type: "existing"; path: string } | { type: "new"; pngPath: string; ddsFormat: string };
}

// Add to DaeImportConfig:
textureEntries?: TextureImportEntry[];
```

- [ ] **Step 1: Create TextureFormatSelect component**

- [ ] **Step 2: Extend DaeImportConfig type with textureEntries**

- [ ] **Step 3: Integrate into DaeImportConfigModal**

- [ ] **Step 4: Code review**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(scene): add DDS format selection for texture import"
```

---

## Task 10: Integration Testing & Cleanup

**Files:**
- Modify: `src/page/SceneEdit/utils/sceneSavePipeline.ts` — deprecate old `executeStageSave` or redirect to new pipeline

### Extract Shared Utilities

Before deprecating, extract these functions from `sceneSavePipeline.ts` into a shared location (or export them) so both the old and new pipelines can use them:
- `convertSingleDae` (line 174)
- `allocateAllFolderPlans` (line 152)
- `collectStagePackFiles` (line 98)
- `writeStagePackStructureJson` (line 118)
- `createBakedImportedDaeExportObject` (line 53)

### Deprecation

Mark `executeStageSave` as deprecated with a JSDoc annotation. Do not delete it yet — keep for reference until the new pipeline is fully validated.

### Full Test Suite

```bash
pnpm vitest run src/page/SceneEdit/
```

Expected test files:
- `sceneDirtyStore.test.ts`
- `sceneDeleteConfirm.test.ts`
- `sceneTextureDedup.test.ts`
- `sceneTextureMigration.test.ts`
- `sceneSaveFolderPipeline.test.ts`
- (All existing tests: `sceneDaeSsbhSave.test.ts`, `sceneStageStructure.test.ts`, `sceneSavePipeline.test.ts`, etc.)

- [ ] **Step 1: Extract shared utilities from sceneSavePipeline.ts** (export `convertSingleDae`, etc.)

- [ ] **Step 2: Add deprecation notice to executeStageSave**

- [ ] **Step 3: Run full test suite**

```bash
pnpm vitest run src/page/SceneEdit/
```

- [ ] **Step 4: Run build verification**

```bash
pnpm build
```

- [ ] **Step 5: Code review**

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(scene): extract shared save utilities and deprecate old executeStageSave"
```

---

## Verification & Testing (HIGHEST PRIORITY)

> **Testing is the primary goal.** Development is secondary — after all implementation is complete, the main-thread AI MUST use the real test data at `E:\XB\解包\com\test` to perform thorough integration testing via the Tauri MCP server (webview interaction, IPC commands, DOM verification).

### Test Data Inventory

```
E:\XB\解包\com\test\
├── 0xBBC60B47_structure.json          — Stage 211 structure (large)
├── BBC60B47.fhm2d                     — Stage 211 packed (191 MB)
├── BBC60B47/0/0/                      — Stage 211 unpacked
├── 0x16F73C97_structure.json          — Stage 001 structure (small, primary test target)
├── 16F73C97.fhm2d                     — Stage 001 packed (5.8 MB)
├── 16F73C97/0/0/                      — Stage 001 unpacked
│   ├── base/001stage001_base/         — Base geometry + textures in 0/, 1/ subdirs
│   ├── sky/0/                         — Sky model + textures in 0/, 1/ subdirs
│   ├── 001stage001_object_box01/      — Object model (objectIndex 0)
│   │   ├── 0/                         — SSBH files (numatb, numshb, nusktb, numdlb, jnttbl)
│   │   │   ├── 0/                     — Texture variant 0 (*.nutexb)
│   │   │   └── 1/                     — Texture variant 1 (*.nutexb)
│   │   └── map_hit.hkt               — Collision mesh
│   ├── info/
│   │   ├── placement.csv             — 2+ OBJECT + 1 SKY entries
│   │   ├── graphic_param.csv         — ~50 lighting/fog/shadow params
│   │   ├── plan_param.spbin
│   │   ├── border_hit.hkt
│   │   ├── fog/, light/, post_effect/ — Additional textures
│   │   └── ...
│   └── [other model objects...]
├── 0x35516817_structure.json          — Stage 018 structure (large forest, 22 objects)
├── 35516817.fhm2d                     — Stage 018 packed (195 MB)
├── 35516817/0/0/                      — Stage 018 unpacked (many objects, EFFECT entries)
├── 0x84F085E5_structure.json          — Stage 100 structure (menu, simple)
├── 84F085E5.fhm2d                     — Stage 100 packed (17 MB)
└── 84F085E5/0/0/                      — Stage 100 unpacked (2 entries only)
```

**Key observations about test data:**
- ALL stages use **old texture format** (numbered subdirs `0/`, `1/` inside model folders) — texture migration is testable on every stage
- Stage 16F73C97 (small, ~5.8 MB) is the **primary test target** — fast to load, simple structure
- Stage 35516817 has **EFFECT entries** in placement.csv — critical for testing EFFECT preservation
- Stage 84F085E5 is the **simplest** (menu, 2 placement entries) — good for smoke tests
- placement.csv uses **pipe-like key-value** format: `VDK_TYPE,OBJECT,VDK_POSITION_X,250.0,...`
- graphic_param.csv uses **simple key,value** format: `directional_lighting_rot_x,-45`

### Automated Unit Tests

```bash
pnpm vitest run src/page/SceneEdit/store/sceneDirtyStore.test.ts
pnpm vitest run src/page/SceneEdit/utils/sceneDeleteConfirm.test.ts
pnpm vitest run src/page/SceneEdit/utils/sceneTextureDedup.test.ts
pnpm vitest run src/page/SceneEdit/utils/sceneTextureMigration.test.ts
pnpm vitest run src/page/SceneEdit/utils/sceneSaveFolderPipeline.test.ts
pnpm vitest run src/page/SceneEdit/
```

### Build Verification

```bash
pnpm build
```

### Main-Thread Integration Test Plan (Post-Development)

> **Executor:** Main-thread AI via Tauri MCP server (webview_screenshot, webview_interact, ipc_execute_command, webview_dom_snapshot, etc.)
>
> **Test data root:** `E:\XB\解包\com\test`
>
> **IMPORTANT:** Before each test, make a backup copy of the stage folder being tested, since save operations will modify files on disk. Restore the backup after each test.

#### Test Suite 1: Smoke Test (Stage 84F085E5 — simplest)

| # | Test Case | Steps | Expected Result | Verify Method |
|---|-----------|-------|-----------------|---------------|
| 1.1 | Open stage folder | Open `E:\XB\解包\com\test\84F085E5\0\0` via scene editor | Stage loads with base + sky + 1 object | Screenshot + DOM check for StageHierarchyTree nodes |
| 1.2 | Two save buttons visible | Check toolbar | "Save as Folder" and "Save as FHM2D" buttons both present | DOM snapshot of MapToolbar |
| 1.3 | No unsaved indicator on load | Check Save as Folder button | No yellow dot | DOM class check for `animate-ping` absence |
| 1.4 | Modify graphic param | Change `directional_lighting_rot_x` value | Yellow unsaved dot appears | DOM class check for `animate-ping` presence |
| 1.5 | Save as Folder | Click Save as Folder button | Progress dialog appears → completes → graphic_param.csv updated | Read `graphic_param.csv` after save, verify changed value |
| 1.6 | Unsaved indicator clears | After save completes | Yellow dot disappears | DOM class check |

#### Test Suite 2: Texture Migration (Stage 16F73C97 — old format)

| # | Test Case | Steps | Expected Result | Verify Method |
|---|-----------|-------|-----------------|---------------|
| 2.1 | Open stage with old texture format | Open `E:\XB\解包\com\test\16F73C97\0\0` | Stage loads, old format detected | Check console/logs for migration detection |
| 2.2 | Save triggers migration | Click Save as Folder | Progress shows "Migrating textures..." step | Screenshot of SaveProgressDialog |
| 2.3 | Textures moved to shared folder | After save | `textures/` folder created at stage root with all `.nutexb` files | List `16F73C97/0/0/textures/` — verify .nutexb files present |
| 2.4 | Old numbered dirs removed | After save | Model folders no longer have `0/`, `1/` texture subdirs | Check `001stage001_object_box01/0/` — no `0/` or `1/` subdirs with .nutexb |
| 2.5 | Structure JSON updated | After save | `0x16F73C97_structure.json` reflects new file locations | Read structure JSON, verify texture paths point to `textures/` folder |
| 2.6 | Scene still renders correctly | After save + reload | All models still display with textures | Screenshot viewport, compare with pre-save state |

#### Test Suite 3: Placement Edit + Save (Stage 16F73C97)

| # | Test Case | Steps | Expected Result | Verify Method |
|---|-----------|-------|-----------------|---------------|
| 3.1 | Select and move object | Select `001stage001_object_box01`, change position in property editor | Object moves in viewport, unsaved indicator appears | Screenshot + dirty store check |
| 3.2 | Save as Folder preserves transform | Click Save as Folder | placement.csv updated with new position | Read placement.csv, find VDK_OBJECTNUMBER=0, verify VDK_POSITION_X/Y/Z changed |
| 3.3 | Reload shows saved position | Close and reopen stage | Object at new position | Compare position with saved values |
| 3.4 | Graphic param + placement combined | Change lighting param AND move object, then save | Both graphic_param.csv and placement.csv updated | Read both CSVs |

#### Test Suite 4: Object Deletion (Stage 16F73C97)

| # | Test Case | Steps | Expected Result | Verify Method |
|---|-----------|-------|-----------------|---------------|
| 4.1 | Delete object | Select `001stage001_object_box01`, delete | Object removed from scene, unsaved indicator | DOM check — node removed from outliner |
| 4.2 | Delete confirm dialog | Click Save as Folder | DeleteConfirmDialog appears showing folder and files to delete | Screenshot of dialog |
| 4.3 | Cancel delete aborts save | Click Cancel in dialog | Save aborted, no files changed on disk | Verify folder still exists |
| 4.4 | Confirm delete executes | Click Confirm in dialog | Folder deleted, placement.csv updated (objectNumber re-indexed) | Folder doesn't exist + read placement.csv |
| 4.5 | Structure JSON after delete | After save completes | Structure JSON no longer references deleted object's files | Read structure JSON |

#### Test Suite 5: EFFECT Preservation (Stage 35516817 — has EFFECT entries)

| # | Test Case | Steps | Expected Result | Verify Method |
|---|-----------|-------|-----------------|---------------|
| 5.1 | Open stage with EFFECT entries | Open `E:\XB\解包\com\test\35516817\0\0` | Stage loads with objects + EFFECT entries visible in placement | Read placement.csv, count EFFECT entries |
| 5.2 | Move an OBJECT, save | Modify an OBJECT position, save as folder | EFFECT entries in placement.csv unchanged | Read placement.csv, compare EFFECT lines byte-for-byte with backup |
| 5.3 | Delete an OBJECT, save | Delete one object, confirm, save | EFFECT entries preserved, OBJECT entries re-indexed | Compare EFFECT entries with backup, verify OBJECT VDK_OBJECTNUMBER values are correct |

#### Test Suite 6: Save as FHM2D (Stage 84F085E5 — simplest)

| # | Test Case | Steps | Expected Result | Verify Method |
|---|-----------|-------|-----------------|---------------|
| 6.1 | FHM2D save dialog | Click Save as FHM2D | Tauri save file dialog appears with .fhm2d filter | Dialog appears (may need manual interaction) |
| 6.2 | Choose output path and save | Select output path, confirm | Progress dialog shows all steps including "Packing FHM2D..." | Screenshot of progress dialog |
| 6.3 | FHM2D file created | After save completes | .fhm2d file exists at chosen path with non-zero size | Check file existence and size |
| 6.4 | FHM2D is valid | Extract created .fhm2d and compare with original | Files match or are equivalent | Use compression.js to extract and diff |

#### Test Suite 7: Dirty Tracking Edge Cases

| # | Test Case | Steps | Expected Result | Verify Method |
|---|-----------|-------|-----------------|---------------|
| 7.1 | Undo clears unsaved state | Make change → undo → check indicator | If all changes undone, no unsaved indicator | DOM check |
| 7.2 | Multiple modifications | Move 3 objects, change 2 graphic params | Only changed files are written on save | Compare file timestamps before/after save |
| 7.3 | Add imported DAE then delete before save | Import DAE → delete it → save | No new folder created, no leftover files | Check stage folder for unexpected new directories |
| 7.4 | Save with no changes | Open stage, immediately Save as Folder | No error, CSVs rewritten but content unchanged | Diff CSVs before/after |

#### Test Suite 8: Save Progress Dialog States

| # | Test Case | Steps | Expected Result | Verify Method |
|---|-----------|-------|-----------------|---------------|
| 8.1 | All steps transition correctly | Perform full save with texture migration + object convert | Each step shows pending → running → done | Screenshot at each transition |
| 8.2 | Error step displayed | Simulate a failure (e.g., read-only file) | Failed step shows error icon + expandable detail | Screenshot of error state |
| 8.3 | Close button behavior | Dialog during save vs after save | Close disabled during save, enabled after completion/failure | DOM check `disabled` attribute |
| 8.4 | Dialog blocks interaction | Try clicking viewport during save | No scene interaction possible | DOM check pointer events |

### Test Execution Workflow

```
1. BACKUP: Copy test stage folder to a temp location
2. EXECUTE: Run test suite via Tauri MCP
3. VERIFY: Check file system state + screenshots + DOM snapshots
4. RESTORE: Copy backup back to original location
5. REPEAT: Next test suite on clean data
```

### Test Priority Order

1. **Suite 1** (Smoke) — verify basic save works at all
2. **Suite 3** (Placement) — verify core placement editing + save
3. **Suite 4** (Deletion) — verify destructive operation + re-indexing
4. **Suite 2** (Migration) — verify old format migration
5. **Suite 5** (EFFECT) — verify non-destructive preservation
6. **Suite 6** (FHM2D) — verify packing output
7. **Suite 7** (Edge cases) — verify dirty tracking edge cases
8. **Suite 8** (Progress dialog) — verify UI states

---

## Dependency Graph

```
Task 1 (Dirty Store) ─────────────┐
Task 2 (Delete Confirm) ──────────┤
Task 3 (Texture Migration/Dedup) ─┤
Task 4 (Save Progress Dialog) ────┤
                                   ├──→ Task 5 (Save Folder Pipeline) ──→ Task 6 (FHM2D Pipeline)
Task 7 (MapToolbar UI) ───────────┤                                              │
                                   ├──→ Task 8 (Wire page.tsx) ←─────────────────┘
Task 9 (Texture Format) ──────────┘
                                        Task 10 (Integration & Cleanup) ←── all above
```

Tasks 1-4, 7, 9 are independent and can be implemented in parallel.
Task 5 depends on Tasks 1-4.
Task 6 depends on Task 5.
Task 8 depends on Tasks 1, 4, 5, 6, 7.
Task 10 depends on all previous tasks.

---

## Sub-Agent Execution Plan

> **Model requirement:** ALL agents (implementer, spec reviewer, code quality reviewer) MUST use **Opus 4.6** (`model: "opus"`).
>
> **Process per task:** Implementer Agent → Spec Reviewer Agent → Code Quality Reviewer Agent. If reviewer finds issues, implementer fixes and re-review until approved.

### Execution Architecture

```
Wave 1 (6 Agents in parallel, each in its own git worktree)
├── Agent 1A: Task 1 — Dirty Store              ──┐
├── Agent 1B: Task 2 — Delete Confirm            ──┤
├── Agent 1C: Task 3 — Texture Migration/Dedup   ──┼──→ Merge all worktrees to main
├── Agent 1D: Task 4 — Save Progress Dialog       ──┤
├── Agent 1E: Task 7 — MapToolbar UI Split         ──┤
└── Agent 1F: Task 9 — Texture Format Selection    ──┘

Wave 2 (1 Agent on main branch, after Wave 1 merge)
└── Agent 2: Task 5 + Task 10 partial — Save Folder Pipeline + extract shared utils

Wave 3 (1 Agent on main branch, after Wave 2)
└── Agent 3: Task 6 — Save as FHM2D Pipeline

Wave 4 (1 Agent on main branch, after Wave 3 — LARGEST TASK)
└── Agent 4: Task 8 — Wire page.tsx Integration

Wave 5 (1 Agent on main branch, after Wave 4)
└── Agent 5: Task 10 — Integration Testing & Cleanup + Final Review
```

### Agent 1A — Dirty Tracking Store

| Item | Detail |
|------|--------|
| **Plan Task** | Task 1 |
| **Isolation** | `worktree` |
| **Creates** | `src/page/SceneEdit/store/sceneDirtyStore.ts`, `src/page/SceneEdit/store/sceneDirtyStore.test.ts` |
| **Modifies** | None |
| **Context to provide** | Full text of Task 1 from plan. Provide `sceneEditorStore.ts` as Zustand+immer pattern reference (386 lines). |
| **Key instructions** | Implement Zustand+immer store with `ChangeType` (added/modified/deleted), `ModifiedFields` (transform/material/textures/hkt), `GlobalDirtyState` (graphicParams/placementOrder). Write 11+ test cases covering all behavioral rules (delete-on-added removes entry, modify-on-deleted is no-op, etc.). TDD: tests first, then implementation. |
| **Deliverable** | Store + all tests passing |
| **Estimated complexity** | Medium — isolated store, clear spec |

### Agent 1B — Delete Confirmation System

| Item | Detail |
|------|--------|
| **Plan Task** | Task 2 |
| **Isolation** | `worktree` |
| **Creates** | `src/page/SceneEdit/utils/sceneDeleteConfirm.ts`, `src/page/SceneEdit/utils/sceneDeleteConfirm.test.ts`, `src/page/SceneEdit/components/DeleteConfirmDialog.tsx` |
| **Modifies** | None |
| **Context to provide** | Full text of Task 2 from plan. Provide Tauri fs API usage examples from existing code (e.g., `readDir` usage in `sceneSavePipeline.ts:98-116`). Provide `AlertDialog` component pattern from existing usage in `page.tsx`. |
| **Key instructions** | `buildDeletePreview`: use Tauri `readDir` (recursive) + `stat` to enumerate files and sizes. `executeDelete`: use Tauri `remove` with `{ recursive: true }`. `DeleteConfirmDialog`: two-step confirmation (show details → confirm), red destructive styling, returns `Promise<boolean>`. TDD for the utility functions. |
| **Deliverable** | Utils + tests passing + dialog component |
| **Estimated complexity** | Medium — Tauri fs API + UI component |

### Agent 1C — Texture Migration & Deduplication

| Item | Detail |
|------|--------|
| **Plan Task** | Task 3 |
| **Isolation** | `worktree` |
| **Creates** | `src/page/SceneEdit/utils/sceneTextureMigration.ts`, `src/page/SceneEdit/utils/sceneTextureMigration.test.ts`, `src/page/SceneEdit/utils/sceneTextureDedup.ts`, `src/page/SceneEdit/utils/sceneTextureDedup.test.ts` |
| **Modifies** | None |
| **Context to provide** | Full text of Task 3 from plan. Provide `sceneDaeSsbhSave.ts` line 10 (`RESERVED_STAGE_MODEL_FOLDERS`). Explain old texture format: numbered subdirectories (`0/`, `1/`) inside model folders containing `.nutexb` files. New format: single `textures/` folder at stage root. |
| **Key instructions** | Two separate modules: (1) `sceneTextureDedup.ts` — compare `.nutexb` files by binary content, conflict resolution via suffix rename. (2) `sceneTextureMigration.ts` — detect old format, move textures to shared folder, remove empty numbered dirs. TDD for both. |
| **Deliverable** | Two utils + all tests passing |
| **Estimated complexity** | Medium — file system operations + binary comparison |

### Agent 1D — Save Progress Dialog

| Item | Detail |
|------|--------|
| **Plan Task** | Task 4 |
| **Isolation** | `worktree` |
| **Creates** | `src/page/SceneEdit/components/SaveProgressDialog.tsx` |
| **Modifies** | None |
| **Context to provide** | Full text of Task 4 from plan. Provide `StageImportProgressDialog.tsx` (93 lines) as the pattern to extend. Provide existing UI component imports (Dialog, DialogContent, DialogHeader, DialogTitle, Progress, Button). |
| **Key instructions** | Extend `StageImportProgressDialog` pattern: add `"error"` status with `XCircle` icon + red color, expandable error detail text, close button (only when `canClose`). `SaveStepStatus = "pending" \| "running" \| "done" \| "error"`. Block interaction while open. |
| **Deliverable** | SaveProgressDialog component |
| **Estimated complexity** | Low — UI component, clear pattern to follow |

### Agent 1E — MapToolbar UI Split

| Item | Detail |
|------|--------|
| **Plan Task** | Task 7 |
| **Isolation** | `worktree` |
| **Creates** | None |
| **Modifies** | `src/page/SceneEdit/components/MapToolbar.tsx` |
| **Context to provide** | Full text of Task 7 from plan. Provide complete `MapToolbar.tsx` (462 lines). Note that `page.tsx` will be updated separately in Wave 4 to pass the new props — this agent should ONLY modify `MapToolbar.tsx`. |
| **Key instructions** | Remove `onSave` prop from `MapToolbarProps`, add `onSaveFolder` + `onSaveFhm2d`. Replace single Save button (lines 175-197) with two side-by-side buttons. Save as Folder keeps yellow unsaved indicator dot. Save as FHM2D uses a different icon (e.g., `HardDriveDownload` from lucide-react — avoid reusing `PackageOpen` which is already used for Extract). Note: after this change, `page.tsx` will have a compile error at line 2415 (`onSave={handleSave}`); this is expected and will be fixed in Wave 4. |
| **Deliverable** | Modified MapToolbar.tsx |
| **Estimated complexity** | Low — prop rename + UI button split |

### Agent 1F — Texture Format Selection

| Item | Detail |
|------|--------|
| **Plan Task** | Task 9 |
| **Isolation** | `worktree` |
| **Creates** | `src/page/SceneEdit/components/TextureFormatSelect.tsx` |
| **Modifies** | `src/page/SceneEdit/components/dae-import/daeImportTypes.ts`, `src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx` |
| **Context to provide** | Full text of Task 9 from plan. Provide `daeImportTypes.ts` (71 lines) and full `DaeImportConfigModal.tsx`. Explain the DDS format options and their use cases. |
| **Key instructions** | Create `TextureFormatSelect` dropdown component with 6 BC format options. Extend `DaeImportConfig` type with optional `textureEntries: TextureImportEntry[]`. Integrate into the SSBH section of `DaeImportConfigModal` — add a texture assignment area where user can select existing textures from `textures/` folder or import new PNG with format selection. |
| **Deliverable** | New component + type extension + modal integration |
| **Estimated complexity** | Medium — UI component + type extension + integration |

### Agent 2 — Save as Folder Pipeline (Wave 2)

| Item | Detail |
|------|--------|
| **Plan Task** | Task 5 + Task 10 partial (extract shared utilities) |
| **Isolation** | Main branch (after Wave 1 merge) |
| **Creates** | `src/page/SceneEdit/utils/sceneSaveFolderPipeline.ts`, `src/page/SceneEdit/utils/sceneSaveFolderPipeline.test.ts` |
| **Modifies** | `src/page/SceneEdit/utils/sceneSavePipeline.ts` — export `convertSingleDae`, `allocateAllFolderPlans`, `collectStagePackFiles`, `writeStagePackStructureJson`, `createBakedImportedDaeExportObject` as public functions |
| **Context to provide** | Full text of Task 5 from plan. Provide all Wave 1 outputs (dirty store interface, delete confirm interface, texture migration/dedup interface, save progress step types). Provide complete `sceneSavePipeline.ts` (394 lines), `sceneDaeSsbhSave.ts` (247 lines), `sceneStageStructure.ts` (195 lines), `repackRunner.ts` (65 lines), `sceneSessionService.ts` (158 lines), `placement.ts` (14 lines). Provide `patchPlacementRawFields.ts` for ObjectNumber re-indexing. |
| **Key instructions** | Implement 9-phase pipeline: delete → migrate → convert DAE → materials → textures → HKT → CSV → structure JSON → reload. First extract shared utilities from `sceneSavePipeline.ts` (make `convertSingleDae` etc. public exports). ObjectNumber re-indexing after delete: reload bundle to get new mapping, update `VDK_OBJECTNUMBER` in rawFields. Mock-based integration tests for pipeline orchestration. |
| **Deliverable** | Pipeline + tests + refactored exports from sceneSavePipeline.ts |
| **Estimated complexity** | High — 9-phase orchestration, integration with multiple modules |

### Agent 3 — Save as FHM2D Pipeline (Wave 3)

| Item | Detail |
|------|--------|
| **Plan Task** | Task 6 |
| **Isolation** | Main branch (after Wave 2) |
| **Creates** | `src/page/SceneEdit/utils/sceneSaveFhm2dPipeline.ts` |
| **Modifies** | `src/utils/repackRunner.ts` — add `repackFolderToFhm2dFile` function |
| **Context to provide** | Full text of Task 6 from plan. Provide `repackRunner.ts` (65 lines) and Wave 2's `sceneSaveFolderPipeline.ts` interface. Note about compression.js CLI flags needing verification. |
| **Key instructions** | FHM2D pipeline = call `executeSaveFolderPipeline` + `repackFolderToFhm2dFile`. Add `repackFolderToFhm2dFile` to `repackRunner.ts` following the pattern of existing `repackFolderUsingStructure`. Verify compression.js supports output path flag; if not, use temp dir + rename approach. |
| **Deliverable** | FHM2D pipeline + repackRunner extension |
| **Estimated complexity** | Low-Medium — wraps folder pipeline + adds repack variant |

### Agent 4 — Wire page.tsx Integration (Wave 4)

| Item | Detail |
|------|--------|
| **Plan Task** | Task 8 |
| **Isolation** | Main branch (after Wave 3) |
| **Creates** | None |
| **Modifies** | `src/page/SceneEdit/page.tsx` (~2800 lines, ~70 `setHasUnsavedChanges` call sites) |
| **Context to provide** | Full text of Task 8 from plan, including the complete **Dirty Store Mutation Mapping** table. Provide complete `page.tsx`. Provide all Wave 1-3 module interfaces (dirty store, save progress dialog props, delete confirm dialog props, folder pipeline params/result, fhm2d pipeline params/result, MapToolbar new props). Provide `@tauri-apps/plugin-dialog` `save` function signature. |
| **Key instructions** | This is the LARGEST and MOST COMPLEX task. (1) Remove `useState(false)` for `hasUnsavedChanges`, derive from `dirtyStore.hasAnyChanges()`. (2) Replace ALL ~70 `setHasUnsavedChanges(true)` with granular dirty mutations per the mapping table — this requires analyzing each call site's context to determine the correct mutation (transform vs placement vs graphicParam vs dae-import etc.). (3) Implement `handleSaveFolder` and `handleSaveFhm2d` handlers with progress dialog and delete confirm integration. (4) Add state variables for save progress and delete confirm dialogs. (5) Update MapToolbar props. (6) `pnpm build` MUST pass after this task. |
| **Deliverable** | Fully integrated page.tsx, build passes |
| **Estimated complexity** | Very High — ~70 call site replacements + new handlers + state management + build verification |

### Agent 5 — Integration Testing & Cleanup (Wave 5)

| Item | Detail |
|------|--------|
| **Plan Task** | Task 10 |
| **Isolation** | Main branch (after Wave 4) |
| **Creates** | None |
| **Modifies** | `src/page/SceneEdit/utils/sceneSavePipeline.ts` — add deprecation JSDoc to `executeStageSave` |
| **Context to provide** | Full text of Task 10 from plan. Provide git diff of all changes from Wave 1-4. List all test files that should exist. |
| **Key instructions** | (1) Add `@deprecated` JSDoc to `executeStageSave`. (2) Run `pnpm vitest run src/page/SceneEdit/` — ALL tests must pass. (3) Run `pnpm build` — must pass. (4) Perform final code review of entire implementation across all files. Report any issues found. |
| **Deliverable** | All tests pass + build passes + deprecation + final review report |
| **Estimated complexity** | Medium — testing + review, no new code |

### Summary Table

| Agent | Wave | Plan Task(s) | Creates | Modifies | Isolation | Complexity |
|-------|------|-------------|---------|----------|-----------|------------|
| 1A | 1 (parallel) | 1 | 2 files | — | worktree | Medium |
| 1B | 1 (parallel) | 2 | 3 files | — | worktree | Medium |
| 1C | 1 (parallel) | 3 | 4 files | — | worktree | Medium |
| 1D | 1 (parallel) | 4 | 1 file | — | worktree | Low |
| 1E | 1 (parallel) | 7 | — | 1 file | worktree | Low |
| 1F | 1 (parallel) | 9 | 1 file | 2 files | worktree | Medium |
| 2 | 2 (sequential) | 5 + 10p | 2 files | 1 file | main | High |
| 3 | 3 (sequential) | 6 | 1 file | 1 file | main | Low-Medium |
| 4 | 4 (sequential) | 8 | — | 1 file (big) | main | Very High |
| 5 | 5 (sequential) | 10 | — | 1 file | main | Medium |

**Total new files:** 14 | **Total modified files:** 6 | **Total agent dispatches:** ~30 (10 impl + 10 spec + 10 quality)
