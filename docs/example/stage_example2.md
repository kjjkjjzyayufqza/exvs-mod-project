# 0x16F73C97.fhm2d — Numatb-Based Texture Consolidation

## What This Document Describes

This is the **AFTER** state of texture consolidation. Compare with `stage_example.md` for the **BEFORE** state.

Before consolidation: textures are scattered as references across model folders (0/, 1/ subfolders).
After consolidation: textures are deduplicated into a single shared `textures/` folder.

## How Consolidation Changes the Reference Model

### Before (see stage_example.md)

```
SubFileData pool: 41 entries (fileIndex 0-40), including 17 nutexb textures
SubFileStructure: same fileIndex referenced multiple times across model folders

Example: fileIndex=0 (stage001_panel_01_diffuse.nutexb) appeared 4 times:
  base/model/0/0.nutexb  ← reference 1
  base/model/1/0.nutexb  ← reference 2
  obj/model/0/0.nutexb   ← reference 3
  obj/model/1/0.nutexb   ← reference 4
```

### After (this document)

```
Texture groups 0/ and 1/ under each model are REMOVED.
All model-referenced textures are collected into one shared textures/ folder.
Each texture appears ONCE in textures/ — deduplication by fileIndex.

Example: fileIndex=0 (stage001_panel_01_diffuse.nutexb) now appears 1 time:
  textures/stage001_panel_01_diffuse.nutexb  ← single copy

Info folder textures (fog/, light/, post_effect/) are NOT moved — they stay in place
because they are not referenced by any model's numatb.
```

### Key difference for AI agents

| Aspect | Before (stage_example.md) | After (this document) |
|--------|--------------------------|----------------------|
| Texture location | Scattered in numbered 0/, 1/ subfolders per model | Collected in shared `textures/` folder |
| Same texture, multiple models | Same fileIndex in multiple tree locations | Single entry in `textures/`, numatb paths point to it |
| Reference count per texture | 2-4 (per texture group, per model) | 1 (deduplicated) |
| Model folder contents | nusktb + numatb + numshb + numdlb + jnttbl + texture subfolders | nusktb + numatb + numshb + numdlb + jnttbl only |
| Info folder textures | In-place | In-place (unchanged) |

---

## Consolidation Algorithm

Textures are collected into `textures/` by reading numatb material references:
1. Find all `.numatb` files in the stage
2. Parse each numatb -> extract texture reference paths (e.g. `../../textures/stage001_skydome_sky`)
3. Strip path prefix -> keep stem only (`stage001_skydome_sky`)
4. Find matching `.nutexb` by internal name from any numbered subdir (0/, 1/)
5. Move unique textures into shared `textures/` folder (deduplicated by fileIndex)
6. Remove now-empty numbered subfolders (0/, 1/) from model data folders

### What gets moved vs. what stays

| Category | Moved to textures/? | Reason |
|----------|---------------------|--------|
| Model textures (in 0/, 1/ subfolders) | YES | Referenced by numatb material files |
| Info/fog textures | NO | Not referenced by any model numatb |
| Info/light textures | NO | Not referenced by any model numatb |
| Info/post_effect textures | NO | Not referenced by any model numatb |

---

## Tree View (after numatb-based consolidation)

```
Root/
└── 0/
    └── 0/
        ├── base/
        │   ├── 001stage001_base/
        │   │   ├── 001stage001_base__maya__.nusktb
        │   │   ├── 001stage001_base__maya__.numatb    (references ../../textures/*)
        │   │   ├── 001stage001_base__nust__.numatb    (references ../../textures/*)
        │   │   ├── 001stage001_base__maya__.numshb
        │   │   ├── 001stage001_base.numdlb
        │   │   └── 001stage001_base.jnttbl
        │   └── map_hit.hkt
        ├── info/
        │   ├── fog/
        │   │   ├── 900default_ibl_specular.nutexb     (stays here, not in textures/)
        │   │   └── 900default_ibl_irradiance.nutexb   (stays here, not in textures/)
        │   ├── light/
        │   │   └── 001stage001_rampfog.nutexb         (stays here, not in textures/)
        │   ├── post_effect/
        │   │   └── lut_none.nutexb                    (stays here, not in textures/)
        │   ├── border_hit.hkt
        │   ├── placement.csv
        │   ├── graphic_param.csv
        │   └── plan_param.spbin
        ├── 001stage001_object_box01/
        │   ├── 0/
        │   │   ├── 001stage001_object_box01__maya__.nusktb
        │   │   ├── 001stage001_object_box01__maya__.numatb  (references ../../textures/*)
        │   │   ├── 001stage001_object_box01__nust__.numatb  (references ../../textures/*)
        │   │   ├── 001stage001_object_box01__maya__.numshb
        │   │   ├── 001stage001_object_box01.numdlb
        │   │   └── 001stage001_object_box01.jnttbl
        │   └── map_hit.hkt
        ├── sky/
        │   └── 0/
        │       ├── 001stage001_sky__maya__.nusktb
        │       ├── 001stage001_sky__maya__.numatb           (references ../../textures/*)
        │       ├── 001stage001_sky__nust__.numatb           (references ../../textures/*)
        │       ├── 001stage001_sky__maya__.numshb
        │       ├── 001stage001_sky.numdlb
        │       └── 001stage001_sky.jnttbl
        └── textures/                                        (shared, deduplicated)
            ├── stage001_panel_01_diffuse.nutexb              [was idx=0, REF×4 -> now 1 copy]
            ├── stage001_panel_01_specular.nutexb             [was idx=1, REF×4 -> now 1 copy]
            ├── stage001_panel_01_roughness.nutexb            [was idx=2, REF×4 -> now 1 copy]
            ├── stage001_panel_01_normal.nutexb               [was idx=3, REF×4 -> now 1 copy]
            ├── stage001_panel_01_ambientocclusion.nutexb     [was idx=4, REF×4 -> now 1 copy]
            ├── stage001_panel_01_emissive.nutexb             [was idx=5, REF×4 -> now 1 copy]
            ├── stage001_panel_02_roughness.nutexb            [was idx=10, REF×2 -> now 1 copy]
            ├── stage001_panel_02_normal.nutexb               [was idx=11, REF×2 -> now 1 copy]
            ├── stage001_panel_02_specular.nutexb             [was idx=12, REF×2 -> now 1 copy]
            ├── stage001_panel_02_emissive.nutexb             [was idx=13, REF×2 -> now 1 copy]
            ├── stage001_panel_02_diffuse.nutexb              [was idx=14, REF×2 -> now 1 copy]
            ├── stage001_panel_02_ambientocclusion.nutexb     [was idx=15, REF×2 -> now 1 copy]
            └── stage001_skydome_sky.nutexb                   [was idx=16, REF×1 -> now 1 copy]
```

---

## Numatb Reference Path Mapping

This table shows how numatb files reference textures. The path format inside numatb binary is
a relative path like `../../textures/stage001_panel_01_diffuse` (no extension).

| Numatb Source | Reference Path | Resolved Texture | Original fileIndex |
|---|---|---|---|
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_diffuse` | stage001_panel_01_diffuse.nutexb | 0 |
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_specular` | stage001_panel_01_specular.nutexb | 1 |
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_roughness` | stage001_panel_01_roughness.nutexb | 2 |
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_normal` | stage001_panel_01_normal.nutexb | 3 |
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_ambientocclusion` | stage001_panel_01_ambientocclusion.nutexb | 4 |
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_emissive` | stage001_panel_01_emissive.nutexb | 5 |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_roughness` | stage001_panel_02_roughness.nutexb | 10 |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_normal` | stage001_panel_02_normal.nutexb | 11 |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_specular` | stage001_panel_02_specular.nutexb | 12 |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_emissive` | stage001_panel_02_emissive.nutexb | 13 |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_diffuse` | stage001_panel_02_diffuse.nutexb | 14 |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_ambientocclusion` | stage001_panel_02_ambientocclusion.nutexb | 15 |
| 001stage001_sky__maya__.numatb | `../../textures/stage001_skydome_sky` | stage001_skydome_sky.nutexb | 16 |

### Cross-model texture sharing through numatb

Note: `object_box01__maya__` numatb ALSO references `panel_01_*` textures (indices 0-5), which are
the same textures used by `base__maya__`. This is why those textures had REF×4 in the original structure —
they were referenced by both models' materials. After consolidation, each texture exists once in `textures/`,
and both numatb files point to the same path.

The `__nust__` numatb files reference the same textures as their `__maya__` counterparts (deduplicated).

---

## Notes

- Info folder nutexb (fog/, light/, post_effect/) are NOT moved to textures/
  because they are not referenced by any model's numatb
- `__nust__` numatb references the same textures as `__maya__` (deduplicated)
- Total: 13 unique textures collected from 6 numatb files (3 maya + 3 nust)
- Consolidation eliminates reference duplication: 52 total Item references in original tree -> 13 unique files in textures/

---

## For AI Agents: Rebuild Checklist

When rebuilding SubFileStructure from a consolidated virtual tree back to binary:

1. **Flatten textures/ back to per-model subfolders**: each model's numatb references determine which textures go into that model's 0/ and 1/ subdirectories
2. **Restore reference semantics**: the same fileIndex must be reused for the same texture across all locations
3. **Preserve fileIndex stability**: do not renumber — existing SubFileData entries retain their original fileIndex
4. **Handle deduplication**: two models referencing the same texture stem -> same SubFileData entry, same fileIndex in both models' Item nodes
5. **Info textures are separate**: they never participated in consolidation and keep their original structure
