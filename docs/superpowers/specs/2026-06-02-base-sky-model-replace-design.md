# Base / Sky Model Replace — Design Spec

- Date: 2026-06-02
- Status: Approved (pending implementation plan)
- Area: Scene Editor (`src/page/SceneEdit`, `src-tauri/src` stage/session commands)

> **Scope update (2026-06-03):** generalized from base/sky to **all on-disk stage
> SSBH models**. `base`, every sub-model, and `sky` are the same SSBH format stored
> at `{folder}/0/...`; the replace feature now targets any such node by folder name.
> The implementation plan is `docs/superpowers/plans/2026-06-03-stage-model-replace.md`.

## 1. Goal

Let the user **replace** any on-disk stage SSBH model — the `base` model or any
sub-model (including `sky`) — by importing a new DAE/FBX file, mirroring how a
sub-model is added. This is a *replace*, not a remove: the model
geometry/material/textures are swapped wholesale while the slot's role in the scene
(base backdrop; a sub-model's placement entry; sky's `SKY` placement entry) is
preserved.

Out of scope: adding a model when the folder does not already exist; partial
geometry-only replacement that keeps the old material/texture binding; replacing
not-yet-saved imports (`imported_dae`) that are not on disk.

## 2. Key codebase facts (why this is feasible)

- On-disk stage layout (per `load_stage_bundle_impl`, `load_stage_skeleton_impl`
  in `src-tauri/src/format/fhm2d_stage.rs`): the stage root holds `base/`,
  `info/`, `textures/`, `sky/`, and model folders. Each model's SSBH files live
  in `{folder}/0/...`. **`base` and `sky` are just folders named `"base"` /
  `"sky"` (`STAGE_BASE_NAME` / `STAGE_SKY_NAME`), structurally identical to a
  sub-model.** Base is read via `load_model_in_subfolder(root, "base")`.
- Special handling:
  - `base` is excluded from placement object indexing (`has_base_model` flag);
    it has no placement object.
  - `sky` is forced to the last `object_index` (`= model_folder_count`) and has a
    `vdkType == "SKY"` placement row whose `VDK_OBJECTNUMBER` is maintained by
    `ensureSkyPlacementObjectNumber` (`src/page/SceneEdit/utils`).
- Existing add/save mechanics:
  - Import → convert: `importDaeThroughSceneSession` converts a DAE/FBX to SSBH
    in the session; `sceneBuildImportPreviewBundle` builds a preview bundle.
  - `retargetSessionImportFolderName` already retargets a session import to an
    arbitrary folder name via `ssbhConfig.baseFilename`.
  - On save, `collect_save_artifacts` (Rust `scene_memory_session.rs`) emits each
    converted import to `{baseFilename}/0/...`.
  - Deletion on disk: `executeDelete(stageRoot, [folderName])` removes a folder
    recursively (`src/page/SceneEdit/utils/sceneDeleteConfirm.ts`).
- Therefore **replace = clean the target folder + write a new import whose
  `baseFilename` is `"base"` / `"sky"`** — no new Rust command required.

### Known inconsistency to note (not relied upon)

`executeBaseDelete` / `buildBaseDeletePreview` operate on *root-level* `*.numdlb`
files, while the loader reads base from the `base/` subfolder. This design treats
the loader as the source of truth (`base/0/...`) and uses `executeDelete(stageRoot,
["base"])` for cleanup. The root-level base-delete path is legacy and is left
untouched; the discrepancy is documented here for future cleanup.

## 3. Approach (deferred commit; chosen over immediate-write and delete+rename)

Replace stages a preview immediately and commits on the next Save, consistent
with the editor's dirty/Save model. Reuses the sub-model import pipeline. Rust
unchanged.

### 3.1 Trigger (immediate — produces preview)

1. Outliner right-click on the `base` node or the `sky` node →
   `Replace model…` → open the existing `DaeImportConfigModal` in
   "replace target" mode (target = `base` | `sky`).
2. On confirm: `importDaeThroughSceneSession` with
   `importConfig.convertToSsbh = true` and `ssbhConfig.baseFilename = target`,
   then `sceneBuildImportPreviewBundle` for a preview bundle.
3. Swap the in-scene preview: set `baseModel` (for base) or replace the sky
   sub-model entry's bundle (for sky). Record
   `modelReplacements[target] = { sessionImportId, sourcePath, sourceName }`.
   Mark the dirty store: `markModelReplaced(target)`.

### 3.2 Commit (on Save / Save FHM2D)

4. New "replace-clean" step: for each replaced target,
   `executeDelete(stageRoot, [target])` to wipe the old `base/` | `sky/` folder
   (removes stale files whose stem differs from the new `baseFilename`).
5. `sceneSaveAsFolder` writes `collect_save_artifacts()` as usual; the
   replacement import (already `baseFilename = target`) lands at `base/0/...` /
   `sky/0/...`.
6. Placement: base — no placement change. sky — keep the existing `SKY` row;
   `ensureSkyPlacementObjectNumber` runs as today. Model-folder count is
   unchanged (base/sky are not counted as model folders and we do not add/remove
   folders), so every `object_index` is stable — no re-indexing.
7. Treat replacements as a structural change → rebuild structure JSON + reload
   the stage bundle so the view returns to disk truth. Clear `modelReplacements`
   on successful save (the existing `dirtyStore.reset()` already runs).

## 4. Components / files to change

Frontend:
- `components/SceneOutliner.tsx`: add `onReplaceModel?: (nodeId: string) => void`;
  add a `Replace model…` item in `NodeContextMenuContent`, gated to
  `role === "base"` or (`role === "sub_model"` and folder name `=== "sky"`).
- `page.tsx`: `handleReplaceModel(nodeId)` resolves the target → opens
  `DaeImportConfigModal` (new `replaceTarget` state) → on confirm runs
  import+convert+preview, updates `baseModel` / sky entry, sets a
  `modelReplacements` state map. `handleSaveFolder` / `handleSaveFhm2d` pass
  `modelReplacements` into the pipeline.
- `utils/sceneSaveFolderPipeline.ts`: add a `modelReplacements` param; add the
  replace-clean step (4); include replacements in `hasStructuralChanges`.
- `utils/sceneSaveFhm2dPipeline.ts`: pass-through (already spreads
  `folderParams`).
- `store/sceneDirtyStore.ts`: track base/sky replacement; surface
  "Base model replaced" / "Sky model replaced" in `buildSaveChangePreview`.
- Reuse: `importDaeThroughSceneSession`, `retargetSessionImportFolderName`,
  `executeDelete`, `ensureSkyPlacementObjectNumber`, `DaeImportConfigModal`.

Backend (Rust): **no new commands** — reuse `scene_import_dae_from_path`,
`scene_configure_import`, `scene_execute_import`, `scene_build_import_preview_bundle`,
`scene_save_as_folder`.

## 5. Data model

```ts
type ModelReplaceTarget = "base" | "sky";

interface ModelReplacement {
  target: ModelReplaceTarget;
  sessionImportId: string;
  sourcePath: string;
  sourceName: string;
}

// page.tsx state
modelReplacements: Record<ModelReplaceTarget, ModelReplacement | null>;
```

## 6. Edge cases & error handling

- **Textures**: the new model's numatb references must resolve in the shared
  `textures/` folder, otherwise `runNumatbPreflight` blocks Save (same behavior
  as adding a sub-model). The user supplies missing textures via Texture Manager.
  This feature adds no new texture logic.
- **Slot must exist**: base/sky node must be present to be right-clicked.
  Replacing a missing slot is out of scope (this is replace, not add).
- **Index stability**: replacing same-named folders does not add/remove model
  folders → object indices unchanged.
- **Conversion failure**: surface an error toast, do not stage the replacement,
  do not mark dirty. Not saving = undo.
- **Non-SSBH attachments**: if the old `base/` / `sky/` folder held files beyond
  the `0/` SSBH set (uncommon), wholesale replace clears them — consistent with
  "整体替换" semantics; documented as expected.
- **Save FHM2D**: the FHM2D pipeline wraps the folder pipeline, so replacements
  are committed before the isolated-workspace pack, then packed normally.

## 7. Testing

- Unit:
  - `sceneSaveFolderPipeline` replace branch: asserts the clean step is invoked
    for each target and the artifacts target `base/0` and `sky/0`.
  - Dirty store: replacement state + change-preview text.
  - Sky placement preserved after replace with correct `VDK_OBJECTNUMBER`.
- Integration / E2E:
  - Right-click base → replace → Save folder → `base/0/base.numdlb` exists and
    the old stem is gone.
  - Same for sky; `placement.csv` `SKY` row unchanged.
  - Save FHM2D packs successfully after a base/sky replace.

## 8. Benefits

Reuses the existing import pipeline, requires **zero Rust changes**, stays
consistent with the dirty/Save model, and causes **no object-index reshuffle**.
