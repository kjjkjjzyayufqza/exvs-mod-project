# Scene Editor User Guide

This guide covers the complete stage modding workflow: loading an FHM2D stage,
extracting it to a folder, editing models and placements, saving changes, and
repacking back into a playable FHM2D file.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [UI Overview](#2-ui-overview)
3. [Method A — Import FHM2D (Memory Preview)](#3-method-a--import-fhm2d-memory-preview)
4. [Method B — Extract FHM2D to Folder](#4-method-b--extract-fhm2d-to-folder)
5. [Open Stage Folder](#5-open-stage-folder)
6. [Navigating the 3D Viewport](#6-navigating-the-3d-viewport)
7. [Editing Placements (Move / Rotate / Scale)](#7-editing-placements-move--rotate--scale)
8. [Importing DAE Models](#8-importing-dae-models)
9. [Deleting Objects](#9-deleting-objects)
10. [Editing Graphic Params](#10-editing-graphic-params)
11. [Saving Changes](#11-saving-changes)
12. [Repacking to FHM2D](#12-repacking-to-fhm2d)
13. [Complete Workflow Example](#13-complete-workflow-example)
14. [Stage Folder Structure Reference](#14-stage-folder-structure-reference)
15. [Keyboard Shortcuts](#15-keyboard-shortcuts)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Prerequisites

| Item | Description |
|------|-------------|
| **Source FHM2D** | A stage `.fhm2d` file extracted from the game package (e.g. `0x4D1F5138.fhm2d`). |
| **compression.js** | The Node.js repack tool located at `E:\XB\解包\com\compression.js` (default path). Required only for the final repack step. |
| **Node.js** | Needed to run `compression.js`. |
| **DAE models** (optional) | Collada `.dae` files for any new objects you want to add to the stage. |

---

## 2. UI Overview

The Scene Editor is divided into three panels:

```
┌──────────────┬───────────────────────────┬──────────────┐
│   Outliner   │        3D Viewport        │  Properties  │
│  (left)      │        (center)           │  (right)     │
└──────────────┴───────────────────────────┴──────────────┘
```

### Toolbar Buttons (left to right)

| Icon | Name | Description |
|------|------|-------------|
| 📦 | **Import .fhm2d** | Load an FHM2D file into memory for preview |
| 📂↗ | **Extract .fhm2d to folder** | Decompress an FHM2D to a disk folder with semantic naming |
| 📁 | **Open stage folder** | Load an already-extracted stage folder |
| 💾 | **Save** | Write CSV edits to disk; convert imported DAE to SSBH |
| ⬆️ | **Import DAE** | Import Collada .dae model(s) into the scene |
| ⬇️ | **Export DAE** | Export selected scene object(s) as .dae |
| **W/E/R** | **Move / Rotate / Scale** | Gizmo mode toggle (keyboard shortcuts: W, E, R) |
| 🎚️ | **Gizmo Size** | Adjust the transform gizmo size |
| Grid / Axes / Wireframe / Stats | **View toggles** | Toggle grid, axes gizmo, wireframe overlay, perf stats |
| ✨ | **Anime Render** | Toggle EXVS anime-style shading |
| ↺ | **Reset Camera** | Reset to default camera position |
| 🧹 | **Clear Cache** | Unload the current stage and clear all caches |

### Properties Panel Tabs

- **Inspect** — Transform editor, scene info, texture settings, object config
- **Graphic** — `graphic_param.csv` key/value editor
- **Placement** — `placement.csv` row-level editor with per-field editing

---

## 3. Method A — Import FHM2D (Memory Preview)

This method loads the FHM2D directly into memory without writing to disk. Useful
for quick preview, but **you cannot save edits** in this mode (Save button is
disabled).

### Steps

1. Click the **Import .fhm2d** button (📦) in the toolbar.
2. In the file dialog, select the `.fhm2d` file (e.g. `stage201.fhm2d`).
3. A progress dialog shows:
   - **Reading file** — loading the binary into memory
   - **Decompressing FHM2D** — inflating compressed sub-files
   - **Parsing folder structure** — building the virtual file tree
4. A **Rename Preview Dialog** appears, showing the virtual folder tree with
   semantic names (base, info, model names, etc.). Review the structure.
5. Click **Load** to build the 3D scene from the in-memory data.
6. The stage appears in the viewport with all models, textures, and placement
   data.

> **Note:** Memory-import mode is read-only. To make persistent edits, use
> Method B (extract to folder) instead.

---

## 4. Method B — Extract FHM2D to Folder

This method decompresses the FHM2D to a real folder on disk, with human-readable
semantic names. The resulting folder can be opened, edited, saved, and repacked.

### Steps

1. Click the **Extract .fhm2d to folder** button (📂↗) in the toolbar.
2. **Select source file:** Choose the `.fhm2d` file.
3. **Select output folder:** Choose the parent directory where the extracted
   stage folder will be created.
4. The tool extracts all sub-files, applies semantic renaming, and writes them
   to disk.
5. On success, a toast shows the file count and total size.

### What gets created

If you extract `stage201.fhm2d` into `E:\output\`, the result is:

```
E:\output\stage201\
├── base\                    ← base model (ground, terrain)
│   └── <model_name>\
│       ├── model_name.numdlb
│       ├── model_name.numshb
│       ├── model_name.nusktb
│       ├── model_name__maya__.numatb
│       └── model_name__nust__.numatb
├── info\                    ← stage metadata
│   ├── fog\
│   ├── light\
│   ├── post_effect\
│   ├── graphic_param.csv
│   ├── placement.csv
│   ├── border_hit.hkt
│   └── plan_param.spbin
├── <object_name>\           ← sub-model objects (buildings, props, etc.)
│   └── <model_name>\
│       ├── ...numdlb, numshb, numatb, etc.
│       └── *.nutexb (textures)
├── sky\                     ← sky model (always last folder)
│   └── ...
└── stage201_structure.json  ← repack metadata (sibling of the folder)
```

> **Important:** The `_structure.json` file is generated alongside the extracted
> folder. It is required for repacking later.

---

## 5. Open Stage Folder

After extracting (or if you already have a stage folder on disk), load it for
editing.

### Steps

1. Click the **Open stage folder** button (📁).
2. Navigate to the **inner stage folder** that contains `base/`, `info/`, etc.
   For example: `E:\output\stage201\` or `E:\XB\解包\com\test\0x4D1F5138\0\0`.
3. The editor loads all sub-models, parses `graphic_param.csv` and
   `placement.csv`, and builds the 3D scene.

### What the editor reads

| Path | Purpose |
|------|---------|
| `base/` | Base terrain/ground model |
| `info/graphic_param.csv` | Lighting and rendering parameters |
| `info/placement.csv` | Object placement data (position, rotation, scale, VDK type) |
| `<name>/` (other folders) | Sub-model objects, sorted alphabetically → assigned objectIndex 0, 1, 2... |
| `sky/` (last folder) | Sky dome model |

---

## 6. Navigating the 3D Viewport

| Action | Control |
|--------|---------|
| **Orbit** | Left-click + drag |
| **Pan** | Middle-click + drag or Shift + Left-click + drag |
| **Zoom** | Scroll wheel |
| **Select object** | Left-click on a model in the viewport or click in the Outliner |
| **Deselect all** | Click on empty viewport space or press Esc |
| **Focus selected** | Press F |
| **Multi-select** | Ctrl+Click or Shift+Click in the Outliner |
| **Select all** | Ctrl+A |

---

## 7. Editing Placements (Move / Rotate / Scale)

When you select an object that has a placement entry (OBJECT type in
`placement.csv`), a 3D transform gizmo appears.

### Using the Gizmo

1. Select an object in the viewport or Outliner.
2. Choose the gizmo mode:
   - **W** — Move (translate)
   - **E** — Rotate
   - **R** — Scale
3. Drag the gizmo axes to transform the object.
4. The placement values update in the Properties → Placement tab.

### Direct Value Editing

1. Open the **Placement** tab in Properties (right panel).
2. Click a placement row to expand it.
3. Edit any field value directly in the input fields.
4. Numeric fields (position, rotation, scale) show a slider for fine
   adjustment.
5. Use the ↺ button next to a field to reset it to the originally loaded value.

### Adding a New Placement Row

1. In the Placement tab, click **Add** → choose the type (Object, Effect, Sky).
2. A new row is inserted after the currently selected row.
3. Fill in the VDK fields as needed.

---

## 8. Importing DAE Models

You can add new 3D models to the stage by importing Collada `.dae` files.

### Steps

1. Click the **Import DAE** button (⬆️) in the toolbar.
2. Select one or more `.dae` files in the file dialog.
3. The models appear in the viewport with default positioning.
4. Use the gizmo (W/E/R) to position the model where you want it.
5. The imported models show up in the Outliner with their file names.

### What happens on Save

When you click **Save**, each imported DAE model is:
1. Exported as a baked DAE with world-space geometry.
2. Analyzed for SSBH compatibility (vertex format, bone count, etc.).
3. Converted to SSBH format (`.numdlb`, `.numshb`, `.numatb`, `.jnttbl`).
4. Written to a new sub-folder inside the stage folder.
5. A placement row is automatically generated with the model's transform.
6. The `_structure.json` is regenerated.
7. The stage is repacked via `compression.js`.
8. The scene is reloaded to show the newly converted model.

> **Limitations:** Only rigid meshes are supported. Skinned meshes (skeletal
> animation) in DAE files will produce an error during conversion.

---

## 9. Deleting Objects

### Deleting a Placement Row

1. Select the object in the viewport or Outliner.
2. Press **Delete** on the keyboard, or right-click → **Delete** in the
   Outliner context menu.
3. The placement row is removed. The model disappears from the viewport.

### Deleting an Imported DAE Object

1. Select the imported DAE object in the viewport or Outliner.
2. Press **Delete** or use the context menu.
3. The DAE object is removed from the scene (it hasn't been saved to disk
   yet, so nothing to clean up).

### Undo / Redo

- **Ctrl+Z** — Undo the last action
- **Ctrl+Shift+Z** — Redo

All placement edits, transforms, add/delete operations support undo/redo.

---

## 10. Editing Graphic Params

The `graphic_param.csv` controls stage lighting, post-processing, and
rendering settings.

1. Open the **Graphic** tab in Properties.
2. Each row shows a key-value pair (e.g. `directional_lighting_intensity,1.2`).
3. Edit the **value** field directly.
4. Toggle the checkbox to **apply** the parameter to the viewport preview.
5. Click **Apply All** to enable all params, or **Clear** to disable all.
6. Use the ↺ button to reset individual params to the loaded values.

---

## 11. Saving Changes

Click the **Save** button (💾) to write changes to disk.

### What gets saved

| What | Where |
|------|-------|
| Graphic param edits | `<stageRoot>/info/graphic_param.csv` |
| Placement edits | `<stageRoot>/info/placement.csv` |
| Imported DAE models | Converted to SSBH and placed in new sub-folders |

### Save behavior

- **No imported DAE models:** Only the CSV files are written. No repack occurs.
- **With imported DAE models:** The full pipeline runs:
  1. DAE → SSBH conversion (parallel)
  2. Placement row generation
  3. CSV file writing
  4. `_structure.json` regeneration
  5. Automatic repack via `compression.js`
  6. Scene reload

> **Note:** Save is only available when the stage was loaded from a disk folder
> (Open Stage Folder), not from memory import.

---

## 12. Repacking to FHM2D

### Automatic Repack (during Save with DAE imports)

When you save with imported DAE models, the repack runs automatically as part
of the save pipeline. No manual action needed.

### Manual Repack (after CSV-only edits)

If you only edited CSV values (placement positions, graphic params) without
adding new DAE models, the save writes the CSV files but does NOT repack. To
repack manually:

#### Option A: Use the Test Editor's repack function

1. Navigate to the **Test Editor** page.
2. Open the stage's hash folder in the file tree (e.g. `0x4D1F5138`).
3. Right-click → **Repack** on the hash folder.

#### Option B: Use the command line

```bash
node E:\XB\解包\com\compression.js E:\XB\解包\com\test\0x4D1F5138_structure.json -r -com-path E:\XB\解包\com\test\
```

Arguments:
- First argument: path to the `_structure.json` file
- `-r`: repack mode
- `-com-path`: parent directory of the hash folder

#### Option C: Use the e2e_structure_repack script

```bash
node scripts/e2e_structure_repack.mjs E:\XB\解包\com\test\0x4D1F5138\0\0
```

This script:
1. Resolves the hash folder and structure.json path
2. Collects all game-ready files from the stage folder
3. Builds a fresh `_structure.json`
4. Runs the repack tool

---

## 13. Complete Workflow Example

Here is a typical end-to-end workflow for modifying a stage:

### Step 1: Extract the FHM2D

```
Source:  E:\XB\解包\com\test\0x4D1F5138.fhm2d
Output: E:\XB\解包\com\test\stage201\
```

1. Open Scene Editor.
2. Click **Extract .fhm2d to folder**.
3. Select `0x4D1F5138.fhm2d`.
4. Select `E:\XB\解包\com\test\` as the output directory.

### Step 2: Open the extracted folder

1. Click **Open stage folder**.
2. Navigate to `E:\XB\解包\com\test\stage201\`.
3. The stage loads in the viewport.

### Step 3: Edit existing objects

1. Select an object in the Outliner or viewport.
2. Use W/E/R to move/rotate/scale it.
3. Edit placement fields in the Properties → Placement tab.

### Step 4: Add a new model

1. Click **Import DAE** (⬆️).
2. Select your `.dae` file.
3. Position it with the gizmo.

### Step 5: (Optional) Delete unwanted objects

1. Select an object.
2. Press Delete.

### Step 6: Save

1. Click **Save** (💾).
2. Wait for DAE conversion and repack to complete.
3. The scene reloads with the converted models.

### Step 7: Verify

1. The new model should now appear as a proper SSBH sub-model in the Outliner.
2. Check the Placement tab to verify the generated placement row.

### Step 8: Test in game

Copy the repacked `.fhm2d` file back to the game's file structure and test.

---

## 14. Stage Folder Structure Reference

A valid stage folder follows this layout:

```
<stage_root>/
├── base/                         ← Ground / terrain model
│   └── <model_name>/
│       ├── <model>.numdlb        ← Model definition
│       ├── <model>.numshb        ← Mesh data
│       ├── <model>.nusktb        ← Skeleton (optional)
│       ├── <model>__maya__.numatb ← Material (maya)
│       ├── <model>__nust__.numatb ← Material (nust template)
│       ├── <model>.jnttbl        ← Joint table
│       ├── map_hit.hkt           ← Collision (optional)
│       └── *.nutexb              ← Textures
├── info/                         ← Stage metadata
│   ├── fog/                      ← Fog settings
│   ├── light/                    ← Light settings
│   ├── post_effect/              ← Post-processing settings
│   ├── graphic_param.csv         ← Lighting/rendering params
│   ├── placement.csv             ← Object placement data
│   ├── border_hit.hkt            ← Stage boundary collision
│   ├── plan_param.spbin          ← Plan parameters
│   └── stage_boundary.csv        ← Boundary definitions
├── <object_name>/                ← Sub-model (e.g. building, prop)
│   └── <model_name>/             ← Same structure as base
│       └── ...
├── sky/                          ← Sky dome (always the last folder)
│   └── ...
└── textures/ (optional)          ← Shared textures
    └── *.nutexb
```

### placement.csv Format

Each row in `placement.csv` defines one placed object instance:

```csv
VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,0,VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE
```

Key fields:
- `VDK_TYPE` — `OBJECT`, `EFFECT`, `SKY`, or `PROP`
- `VDK_OBJECTNUMBER` — Index referencing which sub-model folder (alphabetical
  order, 0-based, excluding base/info/textures)
- `VDK_POSITION_X/Y/Z` — World position
- `VDK_ROTATION_X/Y/Z` — Euler rotation (degrees)
- `VDK_SCALE_X/Y/Z` — Scale factors

### graphic_param.csv Format

```csv
directional_lighting_intensity,1.2
directional_lighting_color_r,1.0
directional_lighting_color_g,0.95
directional_lighting_color_b,0.85
ibl_lighting_intensity,0.6
```

---

## 15. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **W** | Switch to Move (translate) mode |
| **E** | Switch to Rotate mode |
| **R** | Switch to Scale mode |
| **F** | Focus camera on selected object |
| **Delete** | Delete selected object(s) |
| **Ctrl+D** | Duplicate selected object(s) |
| **Ctrl+C** | Copy selected to clipboard |
| **Ctrl+V** | Paste as new object |
| **Ctrl+A** | Select all objects |
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** | Redo |
| **Ctrl+G** | Group selected objects (Outliner only) |
| **Esc** | Deselect all |
| **H** | Toggle visibility of selected (Outliner context menu) |

---

## 16. Troubleshooting

### "Unable to resolve a hash-named stage pack root"

The stage folder must be inside a hash-named directory (e.g. `0x4D1F5138/`).
The repack tool locates the `_structure.json` by looking for the nearest
ancestor folder with a hex name. If your folder is not under a hash-named
parent, the repack will fail.

### Save button is disabled

- **Memory import mode:** You used "Import .fhm2d" which is read-only. Extract
  the FHM2D to a folder first, then open the folder.
- **No stage loaded:** Load a stage before saving.

### "placement.csv header has no VDK_TYPE column"

The CSV encoding or delimiter format is unexpected. Ensure the file uses
comma-separated values with a proper header row, or uses the EXVS flat
key-value pair format.

### DAE conversion fails with "skinned meshes"

The Scene Editor currently only supports rigid (static) meshes for DAE import.
Remove skeletal animation / skinning data from the DAE file before importing.

### Missing `_structure.json` after extract

Ensure you used the Scene Editor's "Extract .fhm2d to folder" function, which
generates the `_structure.json` alongside the output folder. If the file is
missing, you can regenerate it using the `e2e_structure_repack.mjs` script.

### Textures not loading

- Check the **Texture** section in Properties → Inspect tab.
- Ensure texture quality is not set to a resolution too low for your textures.
- Toggle individual texture slots on/off to diagnose which textures are missing.
- For memory-import mode, texture decoding happens asynchronously — wait for
  the progress bar to complete.
