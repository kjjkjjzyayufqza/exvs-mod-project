# 0x16F73C97.fhm2d Folder Structure Tree

## Architecture Overview (READ THIS FIRST)

### Two-Layer Design

The `.fhm2d` archive uses a **two-layer architecture** to store files:

```
Layer 1: SubFileData[]        — flat array, each entry has a UNIQUE fileIndex
Layer 2: SubFileStructure[]   — tree of Folder/Item/EndMark nodes, Items REFERENCE SubFileData by fileIndex
```

| Layer | Role | Key Property |
|-------|------|-------------|
| **SubFileData** | File Pool (flat) | Each file stored ONCE with a unique `fileIndex`. Contains file type, path, base name, and actual binary data. |
| **SubFileStructure** | Folder Tree (hierarchical) | Pre-order serialized tree. `Item` nodes point into SubFileData by `fileIndex`. **The same `fileIndex` CAN appear in multiple Items** — this is a reference, not a copy. |

### Critical: Reference Semantics

```
SubFileData (flat pool — each file stored ONCE):
  [0] stage001_panel_01_diffuse.nutexb     ← data stored ONCE
  [1] stage001_panel_01_specular.nutexb    ← data stored ONCE
  ...

SubFileStructure (tree — same fileIndex referenced MULTIPLE times):
  base/0/  → Item(fileIndex=0), Item(fileIndex=1), ...   ← 1st reference
  base/1/  → Item(fileIndex=0), Item(fileIndex=1), ...   ← 2nd reference (SAME data)
  obj/0/   → Item(fileIndex=0), Item(fileIndex=1), ...   ← 3rd reference (SAME data)
  obj/1/   → Item(fileIndex=0), Item(fileIndex=1), ...   ← 4th reference (SAME data)
```

**Rule: "same numbered filename in different folders" = "reference to same SubFileData entry".**
The file's number IS its fileIndex. `0.nutexb` in folder A and `0.nutexb` in folder B are the SAME file, not copies.

### SubFileStructure Node Types

| Type | Key Field | Meaning |
|------|-----------|---------|
| `Folder` | `folderCount` | Opens a directory. `folderCount` = number of direct child nodes (Items + sub-Folders) before the matching EndMark. |
| `Item` | `fileIndex` | A reference to `SubFileData[fileIndex]`. Also has `originalFileIndex` for tracking pre-modification position. `unk3=1` flags this as a "link" (referenced from multiple locations). |
| `EndMark` | `endMarkCount` | Closes the current folder level. Multiple consecutive EndMarks close nested levels. |

### Tree Traversal (pseudocode)

```
function traverse(nodes[], cursor) → cursor:
    node = nodes[cursor]
    if node is Folder:
        create_directory()
        cursor += 1
        for i in 0..node.folderCount:
            cursor = traverse(nodes, cursor)
        assert nodes[cursor] is EndMark
        cursor += 1   // consume EndMark
    elif node is Item:
        place_file_reference(SubFileData[node.fileIndex])
        cursor += 1
    return cursor
```

### Model Folder Convention

Each 3D model group follows this pattern:

```
model_group_folder/           (e.g., "base/", "sky/", or model-name-derived)
├── model_data_folder/        (e.g., "001stage001_base/")
│   ├── {name}__maya__.nusktb          skeleton
│   ├── 0/                             texture group for __maya__ material
│   │   └── {N}.nutexb ...             fileIndex references to nutexb pool
│   ├── {name}__maya__.numatb          maya material definition
│   ├── 1/                             texture group for __nust__ material
│   │   └── {N}.nutexb ...             SAME fileIndex values as 0/ (references, not copies!)
│   ├── {name}__nust__.numatb          nust material definition
│   ├── {name}__maya__.numshb          mesh
│   ├── {name}.numdlb                  model
│   └── {name}.jnttbl (.bin)           joint table
└── map_hit.hkt (.bin)                 collision data
```

**Texture groups `0/` and `1/` reference the SAME nutexb files.** Both `__maya__` and `__nust__` materials use the same textures — the SubFileStructure simply creates two reference sets pointing to the same SubFileData entries.

---

## Numbered Tree (original binary, filenames = fileIndex)

In this tree, **every filename IS the fileIndex** from SubFileData.
When the same number appears in different folders, it is a REFERENCE to the same file data.

Annotations: `[REF×N]` = this fileIndex is referenced N times total across the entire tree.

```
Root/
└── 0/
    ├── 0/
    │   ├── 0/  (→ base model group)
    │   │   ├── 0/  (→ 001stage001_base model data folder)
    │   │   │   ├── 17.nusktb                    [REF×1]
    │   │   │   ├── 0/  (→ texture group for __maya__ material)
    │   │   │   │   ├── 0.nutexb                  [REF×4] ← shared with base/1/, obj/0/, obj/1/
    │   │   │   │   ├── 1.nutexb                  [REF×4]
    │   │   │   │   ├── 2.nutexb                  [REF×4]
    │   │   │   │   ├── 3.nutexb                  [REF×4]
    │   │   │   │   ├── 4.nutexb                  [REF×4]
    │   │   │   │   └── 5.nutexb                  [REF×4]
    │   │   │   ├── 20.numatb                     [REF×1]
    │   │   │   ├── 1/  (→ texture group for __nust__ material, SAME textures as 0/)
    │   │   │   │   ├── 2.nutexb                  [REF×4] ← same file as 0/2.nutexb
    │   │   │   │   ├── 3.nutexb                  [REF×4] ← same file as 0/3.nutexb
    │   │   │   │   ├── 1.nutexb                  [REF×4] ← same file as 0/1.nutexb
    │   │   │   │   ├── 0.nutexb                  [REF×4] ← same file as 0/0.nutexb
    │   │   │   │   ├── 4.nutexb                  [REF×4] ← same file as 0/4.nutexb
    │   │   │   │   └── 5.nutexb                  [REF×4] ← same file as 0/5.nutexb
    │   │   │   ├── 21.numatb                     [REF×1]
    │   │   │   ├── 26.numshb                     [REF×1]
    │   │   │   ├── 29.numdlb                     [REF×1]
    │   │   │   └── 32.bin                        [REF×1]
    │   │   └── 33.bin                            [REF×1]
    │   ├── 1/  (→ info folder)
    │   │   ├── 0/  (→ fog)
    │   │   │   ├── 6.nutexb                      [REF×1]
    │   │   │   └── 7.nutexb                      [REF×1]
    │   │   ├── 1/  (→ light)
    │   │   │   └── 8.nutexb                      [REF×1]
    │   │   ├── 34.bin                            [REF×1]
    │   │   ├── 35.bin                            [REF×1]
    │   │   ├── 36.bin                            [REF×1]
    │   │   ├── 37.bin                            [REF×1]
    │   │   └── 2/  (→ post_effect)
    │   │       └── 9.nutexb                      [REF×1]
    │   ├── 2/  (→ 001stage001_object_box01 model group)
    │   │   ├── 0/  (→ model data folder)
    │   │   │   ├── 18.nusktb                     [REF×1]
    │   │   │   ├── 0/  (→ texture group for __maya__ material)
    │   │   │   │   ├── 10.nutexb                 [REF×2] ← shared with obj/1/
    │   │   │   │   ├── 11.nutexb                 [REF×2]
    │   │   │   │   ├── 12.nutexb                 [REF×2]
    │   │   │   │   ├── 0.nutexb                  [REF×4] ← shared with base/0/, base/1/, obj/1/
    │   │   │   │   ├── 13.nutexb                 [REF×2]
    │   │   │   │   ├── 1.nutexb                  [REF×4]
    │   │   │   │   ├── 2.nutexb                  [REF×4]
    │   │   │   │   ├── 3.nutexb                  [REF×4]
    │   │   │   │   ├── 4.nutexb                  [REF×4]
    │   │   │   │   ├── 5.nutexb                  [REF×4]
    │   │   │   │   ├── 14.nutexb                 [REF×2]
    │   │   │   │   └── 15.nutexb                 [REF×2]
    │   │   │   ├── 22.numatb                     [REF×1]
    │   │   │   ├── 1/  (→ texture group for __nust__ material, SAME textures as 0/)
    │   │   │   │   ├── 12.nutexb                 [REF×2] ← same file as obj/0/12.nutexb
    │   │   │   │   ├── 0.nutexb                  [REF×4] ← same file as base/0/0.nutexb
    │   │   │   │   ├── 1.nutexb                  [REF×4]
    │   │   │   │   ├── 13.nutexb                 [REF×2]
    │   │   │   │   ├── 5.nutexb                  [REF×4]
    │   │   │   │   ├── 2.nutexb                  [REF×4]
    │   │   │   │   ├── 3.nutexb                  [REF×4]
    │   │   │   │   ├── 4.nutexb                  [REF×4]
    │   │   │   │   ├── 14.nutexb                 [REF×2]
    │   │   │   │   ├── 10.nutexb                 [REF×2]
    │   │   │   │   ├── 11.nutexb                 [REF×2]
    │   │   │   │   └── 15.nutexb                 [REF×2]
    │   │   │   ├── 23.numatb                     [REF×1]
    │   │   │   ├── 27.numshb                     [REF×1]
    │   │   │   ├── 30.numdlb                     [REF×1]
    │   │   │   └── 38.bin                        [REF×1]
    │   │   └── 39.bin                            [REF×1]
    │   └── 3/  (→ sky model group)
    │       └── 0/  (→ model data folder)
    │           ├── 19.nusktb                     [REF×1]
    │           ├── 0/  (→ texture group for __maya__ material)
    │           │   └── 16.nutexb                 [REF×1]
    │           ├── 24.numatb                     [REF×1]
    │           ├── 1/  (→ texture group for __nust__ material, empty)
    │           ├── 25.numatb                     [REF×1]
    │           ├── 28.numshb                     [REF×1]
    │           ├── 31.numdlb                     [REF×1]
    │           └── 40.bin                        [REF×1]
    └── 1/
```


## Named Tree (original folder structure, resolved file names)

File names resolved from binary internal data:
- `.nutexb` -> internal texture name (from `46XT` marker)
- `.numdlb` -> MODL model name
- `.nusktb` / `.numshb` / `.numatb` -> derived from sibling numdlb's MODL info
- `.bin` -> identified by content: jnttbl (single bin in model folder), map_hit.hkt (single bin at model root), info bins by content heuristics (placement.csv, graphic_param.csv, border_hit.hkt, plan_param.spbin)

```
Root/
└── 0/
    ├── 0/
    │   ├── base/
    │   │   ├── 001stage001_base/
    │   │   │   ├── 001stage001_base__maya__.nusktb
    │   │   │   ├── 0/  (→ __maya__ material textures)
    │   │   │   │   ├── stage001_panel_01_diffuse.nutexb       [idx=0, REF×4]
    │   │   │   │   ├── stage001_panel_01_specular.nutexb      [idx=1, REF×4]
    │   │   │   │   ├── stage001_panel_01_roughness.nutexb     [idx=2, REF×4]
    │   │   │   │   ├── stage001_panel_01_normal.nutexb        [idx=3, REF×4]
    │   │   │   │   ├── stage001_panel_01_ambientocclusion.nutexb [idx=4, REF×4]
    │   │   │   │   └── stage001_panel_01_emissive.nutexb      [idx=5, REF×4]
    │   │   │   ├── 001stage001_base__maya__.numatb
    │   │   │   ├── 1/  (→ __nust__ material textures — SAME files as 0/, different order)
    │   │   │   │   ├── stage001_panel_01_roughness.nutexb     [idx=2, REF×4] ← same as 0/
    │   │   │   │   ├── stage001_panel_01_normal.nutexb        [idx=3, REF×4] ← same as 0/
    │   │   │   │   ├── stage001_panel_01_specular.nutexb      [idx=1, REF×4] ← same as 0/
    │   │   │   │   ├── stage001_panel_01_diffuse.nutexb       [idx=0, REF×4] ← same as 0/
    │   │   │   │   ├── stage001_panel_01_ambientocclusion.nutexb [idx=4, REF×4] ← same as 0/
    │   │   │   │   └── stage001_panel_01_emissive.nutexb      [idx=5, REF×4] ← same as 0/
    │   │   │   ├── 001stage001_base__nust__.numatb
    │   │   │   ├── 001stage001_base__maya__.numshb
    │   │   │   ├── 001stage001_base.numdlb
    │   │   │   └── 001stage001_base.jnttbl
    │   │   └── map_hit.hkt
    │   ├── info/
    │   │   ├── fog/
    │   │   │   ├── 900default_ibl_specular.nutexb             [idx=6, REF×1]
    │   │   │   └── 900default_ibl_irradiance.nutexb           [idx=7, REF×1]
    │   │   ├── light/
    │   │   │   └── 001stage001_rampfog.nutexb                 [idx=8, REF×1]
    │   │   ├── border_hit.hkt
    │   │   ├── placement.csv
    │   │   ├── graphic_param.csv
    │   │   ├── plan_param.spbin
    │   │   └── post_effect/
    │   │       └── lut_none.nutexb                            [idx=9, REF×1]
    │   ├── 001stage001_object_box01/
    │   │   ├── 0/
    │   │   │   ├── 001stage001_object_box01__maya__.nusktb
    │   │   │   ├── 0/  (→ __maya__ material textures — includes textures shared with base model)
    │   │   │   │   ├── stage001_panel_02_roughness.nutexb     [idx=10, REF×2]
    │   │   │   │   ├── stage001_panel_02_normal.nutexb        [idx=11, REF×2]
    │   │   │   │   ├── stage001_panel_02_specular.nutexb      [idx=12, REF×2]
    │   │   │   │   ├── stage001_panel_01_diffuse.nutexb       [idx=0, REF×4] ← CROSS-MODEL shared
    │   │   │   │   ├── stage001_panel_02_emissive.nutexb      [idx=13, REF×2]
    │   │   │   │   ├── stage001_panel_01_specular.nutexb      [idx=1, REF×4] ← CROSS-MODEL shared
    │   │   │   │   ├── stage001_panel_01_roughness.nutexb     [idx=2, REF×4] ← CROSS-MODEL shared
    │   │   │   │   ├── stage001_panel_01_normal.nutexb        [idx=3, REF×4] ← CROSS-MODEL shared
    │   │   │   │   ├── stage001_panel_01_ambientocclusion.nutexb [idx=4, REF×4] ← CROSS-MODEL shared
    │   │   │   │   ├── stage001_panel_01_emissive.nutexb      [idx=5, REF×4] ← CROSS-MODEL shared
    │   │   │   │   ├── stage001_panel_02_diffuse.nutexb       [idx=14, REF×2]
    │   │   │   │   └── stage001_panel_02_ambientocclusion.nutexb [idx=15, REF×2]
    │   │   │   ├── 001stage001_object_box01__maya__.numatb
    │   │   │   ├── 1/  (→ __nust__ material textures — SAME files as 0/)
    │   │   │   │   ├── stage001_panel_02_specular.nutexb      [idx=12, REF×2] ← same as obj/0/
    │   │   │   │   ├── stage001_panel_01_diffuse.nutexb       [idx=0, REF×4] ← same as obj/0/ and base/
    │   │   │   │   ├── stage001_panel_01_specular.nutexb      [idx=1, REF×4]
    │   │   │   │   ├── stage001_panel_02_emissive.nutexb      [idx=13, REF×2]
    │   │   │   │   ├── stage001_panel_01_emissive.nutexb      [idx=5, REF×4]
    │   │   │   │   ├── stage001_panel_01_roughness.nutexb     [idx=2, REF×4]
    │   │   │   │   ├── stage001_panel_01_normal.nutexb        [idx=3, REF×4]
    │   │   │   │   ├── stage001_panel_01_ambientocclusion.nutexb [idx=4, REF×4]
    │   │   │   │   ├── stage001_panel_02_diffuse.nutexb       [idx=14, REF×2]
    │   │   │   │   ├── stage001_panel_02_roughness.nutexb     [idx=10, REF×2]
    │   │   │   │   ├── stage001_panel_02_normal.nutexb        [idx=11, REF×2]
    │   │   │   │   └── stage001_panel_02_ambientocclusion.nutexb [idx=15, REF×2]
    │   │   │   ├── 001stage001_object_box01__nust__.numatb
    │   │   │   ├── 001stage001_object_box01__maya__.numshb
    │   │   │   ├── 001stage001_object_box01.numdlb
    │   │   │   └── 001stage001_object_box01.jnttbl
    │   │   └── map_hit.hkt
    │   └── sky/
    │       └── 0/
    │           ├── 001stage001_sky__maya__.nusktb
    │           ├── 0/  (→ __maya__ material textures)
    │           │   └── stage001_skydome_sky.nutexb             [idx=16, REF×1]
    │           ├── 001stage001_sky__maya__.numatb
    │           ├── 1/  (→ __nust__ material textures, empty for sky)
    │           ├── 001stage001_sky__nust__.numatb
    │           ├── 001stage001_sky__maya__.numshb
    │           ├── 001stage001_sky.numdlb
    │           └── 001stage001_sky.jnttbl
    └── 1/
```

---

## Naming Mapping (fileIndex -> resolved name)

The `Refs` column shows how many times this fileIndex appears in the SubFileStructure tree.
Files with Refs > 1 are **shared references** — same data, multiple locations.

| fileIndex | Type | Resolved Name | Refs | Shared By |
|-----------|------|---------------|------|-----------|
| 0 | .nutexb | stage001_panel_01_diffuse.nutexb | **4** | base/0, base/1, obj/0, obj/1 |
| 1 | .nutexb | stage001_panel_01_specular.nutexb | **4** | base/0, base/1, obj/0, obj/1 |
| 2 | .nutexb | stage001_panel_01_roughness.nutexb | **4** | base/0, base/1, obj/0, obj/1 |
| 3 | .nutexb | stage001_panel_01_normal.nutexb | **4** | base/0, base/1, obj/0, obj/1 |
| 4 | .nutexb | stage001_panel_01_ambientocclusion.nutexb | **4** | base/0, base/1, obj/0, obj/1 |
| 5 | .nutexb | stage001_panel_01_emissive.nutexb | **4** | base/0, base/1, obj/0, obj/1 |
| 6 | .nutexb | 900default_ibl_specular.nutexb | 1 | info/fog only |
| 7 | .nutexb | 900default_ibl_irradiance.nutexb | 1 | info/fog only |
| 8 | .nutexb | 001stage001_rampfog.nutexb | 1 | info/light only |
| 9 | .nutexb | lut_none.nutexb | 1 | info/post_effect only |
| 10 | .nutexb | stage001_panel_02_roughness.nutexb | **2** | obj/0, obj/1 |
| 11 | .nutexb | stage001_panel_02_normal.nutexb | **2** | obj/0, obj/1 |
| 12 | .nutexb | stage001_panel_02_specular.nutexb | **2** | obj/0, obj/1 |
| 13 | .nutexb | stage001_panel_02_emissive.nutexb | **2** | obj/0, obj/1 |
| 14 | .nutexb | stage001_panel_02_diffuse.nutexb | **2** | obj/0, obj/1 |
| 15 | .nutexb | stage001_panel_02_ambientocclusion.nutexb | **2** | obj/0, obj/1 |
| 16 | .nutexb | stage001_skydome_sky.nutexb | 1 | sky/0 only |
| 17 | .nusktb | 001stage001_base__maya__.nusktb | 1 | |
| 18 | .nusktb | 001stage001_object_box01__maya__.nusktb | 1 | |
| 19 | .nusktb | 001stage001_sky__maya__.nusktb | 1 | |
| 20 | .numatb | 001stage001_base__maya__.numatb | 1 | |
| 21 | .numatb | 001stage001_base__nust__.numatb | 1 | |
| 22 | .numatb | 001stage001_object_box01__maya__.numatb | 1 | |
| 23 | .numatb | 001stage001_object_box01__nust__.numatb | 1 | |
| 24 | .numatb | 001stage001_sky__maya__.numatb | 1 | |
| 25 | .numatb | 001stage001_sky__nust__.numatb | 1 | |
| 26 | .numshb | 001stage001_base__maya__.numshb | 1 | |
| 27 | .numshb | 001stage001_object_box01__maya__.numshb | 1 | |
| 28 | .numshb | 001stage001_sky__maya__.numshb | 1 | |
| 29 | .numdlb | 001stage001_base.numdlb | 1 | |
| 30 | .numdlb | 001stage001_object_box01.numdlb | 1 | |
| 31 | .numdlb | 001stage001_sky.numdlb | 1 | |
| 32 | .bin | 001stage001_base.jnttbl | 1 | |
| 33 | .bin | map_hit.hkt (base) | 1 | |
| 34 | .bin | border_hit.hkt | 1 | |
| 35 | .bin | placement.csv | 1 | |
| 36 | .bin | graphic_param.csv | 1 | |
| 37 | .bin | plan_param.spbin | 1 | |
| 38 | .bin | 001stage001_object_box01.jnttbl | 1 | |
| 39 | .bin | map_hit.hkt (object_box01) | 1 | |
| 40 | .bin | 001stage001_sky.jnttbl | 1 | |

---

## Reference Map (fileIndex -> all tree locations)

This section maps each multi-referenced fileIndex to every path where it appears in SubFileStructure.
This is the mapping AI agents need to understand file sharing.

### Textures shared across models (REF×4)

These 6 textures are shared between the `base` and `object_box01` models.
Each appears in 4 locations: 2 texture groups (maya, nust) × 2 models.

| fileIndex | Texture Name | Location 1 | Location 2 | Location 3 | Location 4 |
|-----------|-------------|------------|------------|------------|------------|
| 0 | panel_01_diffuse | base/model/0/ | base/model/1/ | obj/model/0/ | obj/model/1/ |
| 1 | panel_01_specular | base/model/0/ | base/model/1/ | obj/model/0/ | obj/model/1/ |
| 2 | panel_01_roughness | base/model/0/ | base/model/1/ | obj/model/0/ | obj/model/1/ |
| 3 | panel_01_normal | base/model/0/ | base/model/1/ | obj/model/0/ | obj/model/1/ |
| 4 | panel_01_ao | base/model/0/ | base/model/1/ | obj/model/0/ | obj/model/1/ |
| 5 | panel_01_emissive | base/model/0/ | base/model/1/ | obj/model/0/ | obj/model/1/ |

### Textures shared within model (REF×2)

These 6 textures are used only by `object_box01`, but appear in both its maya and nust texture groups.

| fileIndex | Texture Name | Location 1 | Location 2 |
|-----------|-------------|------------|------------|
| 10 | panel_02_roughness | obj/model/0/ | obj/model/1/ |
| 11 | panel_02_normal | obj/model/0/ | obj/model/1/ |
| 12 | panel_02_specular | obj/model/0/ | obj/model/1/ |
| 13 | panel_02_emissive | obj/model/0/ | obj/model/1/ |
| 14 | panel_02_diffuse | obj/model/0/ | obj/model/1/ |
| 15 | panel_02_ao | obj/model/0/ | obj/model/1/ |

### Why references matter for save/rebuild

When rebuilding SubFileStructure from a renamed/modified virtual tree:
1. Count unique fileIndex values — this is `Fhm2dTotalCount` (the actual file count)
2. A single fileIndex may need MULTIPLE Item entries in the structure
3. Deduplication: same filename appearing in 0/ and 1/ under one model → same fileIndex, not two separate files
4. Cross-model sharing: same texture name in different models → check if it's the same fileIndex before creating a new entry

---

## Rust Implementation Reference

The two-layer architecture maps to these Rust types:

```
SubFileData[i]         →  InMemoryFhm2dFile { file_index, file_type, file_url, data }
SubFileStructure[i]    →  SubFileStructureEntry::Folder { folder_count, unk3, ... }
                        |  SubFileStructureEntry::Item { file_index, original_file_index, unk3, ... }
                        |  SubFileStructureEntry::EndMark { end_mark_count }
```

Runtime lookup: `file_index_map: HashMap<i32, &InMemoryFhm2dFile>` — O(1) access by fileIndex.
Multiple Item nodes with the same `file_index` all resolve to the same HashMap entry.

Special flags in SubFileStructureEntry:
- `Folder.unk3 == 64` → this folder is a shared `textures/` directory
- `Item.unk3 == 1` → this item is a link/reference (same file referenced elsewhere)
