# Scene Editor — User Guide

This guide covers all UI operations, keyboard shortcuts, and workflows available in the Scene Editor page.

---

## 1. Opening a Stage

### Open from FHM2D file

Click the **Archive icon** (📦) in the toolbar → select a `.fhm2d` file.  
The editor will extract and rename sub-files, then load the full stage bundle (base model, sub-models, placement, graphic params).

### Open from extracted folder

Click the **Folder icon** (📂) in the toolbar → select a folder that was previously extracted from `.fhm2d`.  
The folder must contain `base/`, `info/`, and numbered sub-model folders.

### Extract FHM2D to folder

Click the **PackageOpen icon** (📤) in the toolbar → select a `.fhm2d` file → choose an output directory.  
The `.fhm2d` will be extracted to the chosen folder. You can then open it with "Open stage folder".

---

## 2. Toolbar Buttons (Left to Right)

| Icon | Action | Description |
|------|--------|-------------|
| 📦 FileArchive | Import .fhm2d | Open and load a .fhm2d stage file |
| 📤 PackageOpen | Extract .fhm2d | Extract .fhm2d contents to a folder |
| 📂 FolderOpen | Open stage folder | Load a previously extracted stage folder |
| 💾 Save | Save | Save CSV files + convert imported DAE to SSBH |
| ⬆ Upload (▼ dropdown) | Import DAE | **Quick Import**: directly place into scene / **Import with Config...**: open DAE config modal |
| ⬇ Download | Export DAE | Export selected objects as DAE file(s) |
| ✥ Move3D | Translate (W) | Set gizmo to translate mode |
| ↻ RotateCw | Rotate (E) | Set gizmo to rotate mode |
| ⤢ Maximize | Scale (R) | Set gizmo to scale mode |
| ☰ SlidersH | Gizmo Size | Open a slider to adjust gizmo handle size |
| ⊞ Grid3x3 | Toggle Grid | Show/hide the ground grid |
| ╋ Axis3D | Toggle Axes | Show/hide the XYZ axis helper |
| □ Box | Toggle Wireframe | Enable/disable wireframe rendering |
| ◌ Activity | Toggle Stats | Show/hide draw call statistics overlay |
| 👁 Eye / □ Box / ☰ Layers | Havok View Mode | Switch between Normal / Collision / Both views |
| ✦ Sparkles | Anime Render | Toggle anime-style post-processing |
| ↺ RotateCcw | Reset Camera | Reset 3D camera to default position |
| ✎ Eraser | Clear Cache | Unload the stage, clear all texture and memory caches |

---

## 3. Keyboard Shortcuts

### Gizmo Mode (Maya-style)

| Key | Action |
|-----|--------|
| `W` | Switch to **Translate** mode |
| `E` | Switch to **Rotate** mode |
| `R` | Switch to **Scale** mode |

### Selection & Editing

| Shortcut | Action |
|----------|--------|
| `Click` on object | Select single object |
| `Shift + Click` | Add to / extend selection |
| `Ctrl + Click` | Toggle selection of a single object |
| `Ctrl + A` | Select all objects |
| `Escape` | Deselect all |
| `Delete` / `Backspace` | Delete selected objects |
| `Ctrl + D` | Duplicate selected objects |
| `Ctrl + C` | Copy selected objects to clipboard |
| `Ctrl + V` | Paste from clipboard |
| `Ctrl + G` | Group selected objects (2+ required) |

### Camera & Viewport

| Shortcut | Action |
|----------|--------|
| `F` | Focus camera on selected object |
| `H` | Toggle visibility (hide/show) of selected objects |
| Left-drag | Orbit camera |
| Right-drag | Pan camera |
| Scroll wheel | Zoom in/out |

### Undo / Redo

| Shortcut | Action |
|----------|--------|
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` or `Ctrl + Y` | Redo |

---

## 4. Right-Click Context Menu (3D Viewport)

Right-click anywhere in the 3D viewport to open the context menu:

| Menu Item | Shortcut | Description |
|-----------|----------|-------------|
| Focus Selected | `F` | Center camera on the selected object |
| Reset Camera | — | Reset camera to default position |
| Transform → Translate | `W` | Switch gizmo to translate mode |
| Transform → Rotate | `E` | Switch gizmo to rotate mode |
| Transform → Scale | `R` | Switch gizmo to scale mode |
| Duplicate | `Ctrl+D` | Duplicate the selected objects |
| Delete | `Del` | Delete the selected objects |
| Import DAE... | — | Open file dialog to quick-import DAE object(s) |
| Export Selected as DAE... | — | Export selected object(s) to DAE file |

---

## 5. DAE Import Workflows

### Quick Import

1. Click the **Upload** dropdown in the toolbar → **Quick Import**  
   (or right-click in viewport → **Import DAE...**)
2. Select one or more `.dae` files in the file dialog.
3. The DAE object(s) appear in the 3D viewport immediately, spaced horizontally.
4. Use the gizmo (W/E/R) to position them.

### Import with Config (Session-based)

1. Click the **Upload** dropdown → **Import with Config...**
2. Select one or more `.dae` files.
3. The **DAE Import Config Modal** opens. For each file you can configure:

   | Option | Description |
   |--------|-------------|
   | **Load to scene** | Preview the DAE in the 3D viewport (visual only) |
   | **Convert to SSBH** | Convert DAE to game-ready binary format (numdlb, numshb, nusktb, numatb) |
   | **Generate HKT** | Generate Havok collision data (requires Havok SDK installed, off by default) |

4. When **Convert to SSBH** is checked, additional settings appear:

   | Setting | Description |
   |---------|-------------|
   | Base Filename | Name prefix for output files |
   | Scale Factor | Scale multiplier (default: 1.0) |
   | Up Axis | Y-Up or Z-Up coordinate system |
   | Flip UV (V) | Invert the V texture coordinate during SSBH conversion |
   | Write numdlb | Model definition binary |
   | Write numshb | Mesh data binary |
   | Write nusktb | Skeleton binary |
   | Write numatb | Material binary |
   | Write jnttbl | Joint table binary |
   | Write Maya Profile | Include Maya-specific material profile |
   | Material Template | Optional material template name |

5. When **Generate HKT** is checked, select a Havok config profile from the dropdown.

6. Click **Import** to start the session-based pipeline. The backend will:
   - Store the DAE file bytes in memory
   - Run DAE → SSBH conversion (if enabled)
   - Run HKT collision generation (if enabled)
   - All results stay in memory until you explicitly **Save**.

---

## 6. Havok Collision Visualization

When collision data is available (HKT loaded or generated), the three view mode buttons in the toolbar become active:

| Button | Mode | Description |
|--------|------|-------------|
| 👁 Eye | **Normal** | Show only the 3D model (default) |
| □ Box | **Collision** | Show only the collision wireframe (green overlay) |
| ☰ Layers | **Both** | Show model and collision overlay simultaneously |

---

## 7. Saving

### Save (toolbar button or Ctrl+S)

When a stage folder is loaded (not a memory import), the **Save** button:

1. Writes `graphic_param.csv` and `placement.csv` to the `info/` folder.
2. For any Quick-Imported DAE objects:
   - Converts each to SSBH files in a new sub-folder.
   - Generates placement rows and appends to `placement.csv`.
   - Repacks the stage structure.
3. For session-based imports (Import with Config):
   - Writes all SSBH artifacts and HKT files from the in-memory session to the stage folder.
4. Reloads the stage bundle to reflect changes.

A yellow dot on the Save icon indicates unsaved changes.

---

## 8. Left Panel — Scene Hierarchy

The left panel shows the scene tree (Outliner):

- **root** — the top-level stage node
  - **base** — the base stage model
  - **sub_model_xxx** — numbered sub-models (object_bench, object_tree, etc.)
  - **dae_xxx** — imported DAE objects

### Outliner operations:
- Click a node to select it in both tree and viewport.
- `Shift + Click` for range selection.
- `Ctrl + Click` for toggle selection.
- Right-click for duplicate/delete context menu.
- `H` to hide/show the selected node.

---

## 9. Right Panel — Property Editor

When a placement object is selected, the right panel shows its transform:

| Property | Description |
|----------|-------------|
| Position X/Y/Z | World position |
| Rotation X/Y/Z | Rotation in degrees |
| Scale X/Y/Z | Scale multiplier |
| VDK Type | Placement type (OBJECT, EFFECT, etc.) |
| Object Number | Object index in the stage |
| Raw Fields | Full CSV row for advanced editing |

Edit values directly in the input fields. Changes are tracked in the undo/redo history.

---

## 10. Bottom Panel — CSV Editors

Two tabs for raw stage data editing:

### Graphic Param
- Key-value pairs controlling stage rendering (lighting, fog, post-effects).
- Toggle **Applied** column to preview parameter effects in real-time.
- Click **Apply All** / **Clear Applied** to batch toggle.

### Placement
- Full placement CSV table with all columns.
- Direct cell editing with undo support.
- New rows are automatically generated when importing DAE objects.

---

## 11. Texture Controls

### Texture Quality Panel
Located in the right panel, controls how textures are loaded:

| Setting | Description |
|---------|-------------|
| Quality Level | Low / Medium / High / Full — controls max texture resolution |
| Slot Load | Enable/disable per-material-slot texture loading |

### Texture Inventory
Shows which textures are loaded, referenced, and their resolution. Useful for debugging missing textures.

---

## 12. Quick Reference Card

```
Open Stage:     Toolbar → 📂 (folder) or 📦 (fhm2d)
Save:           Toolbar → 💾
Import DAE:     Toolbar → ⬆ dropdown → Quick Import / Import with Config
Export DAE:     Select object → Toolbar → ⬇

Gizmo:          W = Translate, E = Rotate, R = Scale
Select:         Click / Shift+Click / Ctrl+Click
Select All:     Ctrl+A
Deselect:       Escape
Delete:         Delete / Backspace
Duplicate:      Ctrl+D
Copy/Paste:     Ctrl+C / Ctrl+V
Group:          Ctrl+G
Undo/Redo:      Ctrl+Z / Ctrl+Shift+Z
Focus:          F
Hide/Show:      H
Right-Click:    Context menu in viewport
```
