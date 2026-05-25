# 0x16F73C97.fhm2d — Numatb-Based Texture Consolidation

Textures are collected into `textures/` by reading numatb material references:
1. Find all `.numatb` files in the stage
2. Parse each numatb → extract texture paths (e.g. `../../textures/stage001_skydome_sky`)
3. Strip path prefix → keep stem only (`stage001_skydome_sky`)
4. Find matching `.nutexb` by internal name from numbered subdirs (0/, 1/)
5. Move into shared `textures/` folder (deduplicated)

## Tree View (after `stage_rename_in_memory_numatb_based`)

```
Root/
└── 0/
    └── 0/
        ├── base/
        │   ├── 001stage001_base/
        │   │   ├── 001stage001_base__maya__.nusktb
        │   │   ├── 001stage001_base__maya__.numatb
        │   │   ├── 001stage001_base__nust__.numatb
        │   │   ├── 001stage001_base__maya__.numshb
        │   │   ├── 001stage001_base.numdlb
        │   │   └── 001stage001_base.jnttbl
        │   └── map_hit.hkt
        ├── info/
        │   ├── fog/
        │   │   ├── 900default_ibl_specular.nutexb
        │   │   └── 900default_ibl_irradiance.nutexb
        │   ├── light/
        │   │   └── 001stage001_rampfog.nutexb
        │   ├── post_effect/
        │   │   └── lut_none.nutexb
        │   ├── border_hit.hkt
        │   ├── placement.csv
        │   ├── graphic_param.csv
        │   └── plan_param.spbin
        ├── 001stage001_object_box01/
        │   ├── 0/
        │   │   ├── 001stage001_object_box01__maya__.nusktb
        │   │   ├── 001stage001_object_box01__maya__.numatb
        │   │   ├── 001stage001_object_box01__nust__.numatb
        │   │   ├── 001stage001_object_box01__maya__.numshb
        │   │   ├── 001stage001_object_box01.numdlb
        │   │   └── 001stage001_object_box01.jnttbl
        │   └── map_hit.hkt
        ├── sky/
        │   └── 0/
        │       ├── 001stage001_sky__maya__.nusktb
        │       ├── 001stage001_sky__maya__.numatb
        │       ├── 001stage001_sky__nust__.numatb
        │       ├── 001stage001_sky__maya__.numshb
        │       ├── 001stage001_sky.numdlb
        │       └── 001stage001_sky.jnttbl
        └── textures/
            ├── stage001_panel_01_diffuse.nutexb
            ├── stage001_panel_01_specular.nutexb
            ├── stage001_panel_01_roughness.nutexb
            ├── stage001_panel_01_normal.nutexb
            ├── stage001_panel_01_ambientocclusion.nutexb
            ├── stage001_panel_01_emissive.nutexb
            ├── stage001_panel_02_roughness.nutexb
            ├── stage001_panel_02_normal.nutexb
            ├── stage001_panel_02_specular.nutexb
            ├── stage001_panel_02_emissive.nutexb
            ├── stage001_panel_02_diffuse.nutexb
            ├── stage001_panel_02_ambientocclusion.nutexb
            └── stage001_skydome_sky.nutexb
```

## Naming Mapping (numatb texture references → textures/)

| Numatb Source | Reference Path | Resolved Texture |
|---|---|---|
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_diffuse` | stage001_panel_01_diffuse.nutexb |
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_specular` | stage001_panel_01_specular.nutexb |
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_roughness` | stage001_panel_01_roughness.nutexb |
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_normal` | stage001_panel_01_normal.nutexb |
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_ambientocclusion` | stage001_panel_01_ambientocclusion.nutexb |
| 001stage001_base__maya__.numatb | `../../textures/stage001_panel_01_emissive` | stage001_panel_01_emissive.nutexb |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_roughness` | stage001_panel_02_roughness.nutexb |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_normal` | stage001_panel_02_normal.nutexb |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_specular` | stage001_panel_02_specular.nutexb |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_emissive` | stage001_panel_02_emissive.nutexb |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_diffuse` | stage001_panel_02_diffuse.nutexb |
| 001stage001_object_box01__maya__.numatb | `../../textures/stage001_panel_02_ambientocclusion` | stage001_panel_02_ambientocclusion.nutexb |
| 001stage001_sky__maya__.numatb | `../../textures/stage001_skydome_sky` | stage001_skydome_sky.nutexb |

## Notes

- Info folder nutexb (fog/, light/, post_effect/) are NOT moved to textures/
  because they are not referenced by any model's numatb
- `__nust__` numatb references the same textures as `__maya__` (deduplicated)
- Total: 13 unique textures collected from 6 numatb files (3 maya + 3 nust)
