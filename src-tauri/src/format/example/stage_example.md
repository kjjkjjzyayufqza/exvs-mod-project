# 0x16F73C97.fhm2d Folder Structure Tree

```
Root/
└── 0/
    ├── 0/
    │   ├── 0/
    │   │   ├── 0/
    │   │   │   ├── 17.nusktb
    │   │   │   ├── 0/
    │   │   │   │   ├── 0.nutexb
    │   │   │   │   ├── 1.nutexb
    │   │   │   │   ├── 2.nutexb
    │   │   │   │   ├── 3.nutexb
    │   │   │   │   ├── 4.nutexb
    │   │   │   │   └── 5.nutexb
    │   │   │   ├── 20.numatb
    │   │   │   ├── 1/
    │   │   │   │   ├── 2.nutexb
    │   │   │   │   ├── 3.nutexb
    │   │   │   │   ├── 1.nutexb
    │   │   │   │   ├── 0.nutexb
    │   │   │   │   ├── 4.nutexb
    │   │   │   │   └── 5.nutexb
    │   │   │   ├── 21.numatb
    │   │   │   ├── 26.numshb
    │   │   │   ├── 29.numdlb
    │   │   │   └── 32.bin
    │   │   └── 33.bin
    │   ├── 1/
    │   │   ├── 0/
    │   │   │   ├── 6.nutexb
    │   │   │   └── 7.nutexb
    │   │   ├── 1/
    │   │   │   └── 8.nutexb
    │   │   ├── 34.bin
    │   │   ├── 35.bin
    │   │   ├── 36.bin
    │   │   ├── 37.bin
    │   │   └── 2/
    │   │       └── 9.nutexb
    │   ├── 2/
    │   │   ├── 0/
    │   │   │   ├── 18.nusktb
    │   │   │   ├── 0/
    │   │   │   │   ├── 10.nutexb
    │   │   │   │   ├── 11.nutexb
    │   │   │   │   ├── 12.nutexb
    │   │   │   │   ├── 0.nutexb
    │   │   │   │   ├── 13.nutexb
    │   │   │   │   ├── 1.nutexb
    │   │   │   │   ├── 2.nutexb
    │   │   │   │   ├── 3.nutexb
    │   │   │   │   ├── 4.nutexb
    │   │   │   │   ├── 5.nutexb
    │   │   │   │   ├── 14.nutexb
    │   │   │   │   └── 15.nutexb
    │   │   │   ├── 22.numatb
    │   │   │   ├── 1/
    │   │   │   │   ├── 12.nutexb
    │   │   │   │   ├── 0.nutexb
    │   │   │   │   ├── 1.nutexb
    │   │   │   │   ├── 13.nutexb
    │   │   │   │   ├── 5.nutexb
    │   │   │   │   ├── 2.nutexb
    │   │   │   │   ├── 3.nutexb
    │   │   │   │   ├── 4.nutexb
    │   │   │   │   ├── 14.nutexb
    │   │   │   │   ├── 10.nutexb
    │   │   │   │   ├── 11.nutexb
    │   │   │   │   └── 15.nutexb
    │   │   │   ├── 23.numatb
    │   │   │   ├── 27.numshb
    │   │   │   ├── 30.numdlb
    │   │   │   └── 38.bin
    │   │   └── 39.bin
    │   └── 3/
    │       └── 0/
    │           ├── 19.nusktb
    │           ├── 0/
    │           │   └── 16.nutexb
    │           ├── 24.numatb
    │           ├── 1/
    │           ├── 25.numatb
    │           ├── 28.numshb
    │           ├── 31.numdlb
    │           └── 40.bin
    └── 1/
```


## Named Tree (original folder structure, resolved file names)

File names resolved from binary internal data:
- `.nutexb` → internal texture name (from `46XT` marker)
- `.numdlb` → MODL model name
- `.nusktb` / `.numshb` / `.numatb` → derived from sibling numdlb's MODL info
- `.bin` → identified by content: jnttbl (single bin in model folder), map_hit.hkt (single bin at model root), info bins by content heuristics (placement.csv, graphic_param.csv, border_hit.hkt, plan_param.spbin)

```
Root/
└── 0/
    ├── 0/
    │   ├── base/
    │   │   ├── 001stage001_base/
    │   │   │   ├── 001stage001_base__maya__.nusktb
    │   │   │   ├── 0/
    │   │   │   │   ├── stage001_panel_01_diffuse.nutexb
    │   │   │   │   ├── stage001_panel_01_specular.nutexb
    │   │   │   │   ├── stage001_panel_01_roughness.nutexb
    │   │   │   │   ├── stage001_panel_01_normal.nutexb
    │   │   │   │   ├── stage001_panel_01_ambientocclusion.nutexb
    │   │   │   │   └── stage001_panel_01_emissive.nutexb
    │   │   │   ├── 001stage001_base__maya__.numatb
    │   │   │   ├── 1/
    │   │   │   │   ├── stage001_panel_01_roughness.nutexb
    │   │   │   │   ├── stage001_panel_01_normal.nutexb
    │   │   │   │   ├── stage001_panel_01_specular.nutexb
    │   │   │   │   ├── stage001_panel_01_diffuse.nutexb
    │   │   │   │   ├── stage001_panel_01_ambientocclusion.nutexb
    │   │   │   │   └── stage001_panel_01_emissive.nutexb
    │   │   │   ├── 001stage001_base__nust__.numatb
    │   │   │   ├── 001stage001_base__maya__.numshb
    │   │   │   ├── 001stage001_base.numdlb
    │   │   │   └── 001stage001_base.jnttbl
    │   │   └── map_hit.hkt
    │   ├── info/
    │   │   ├── fog/
    │   │   │   ├── 900default_ibl_specular.nutexb
    │   │   │   └── 900default_ibl_irradiance.nutexb
    │   │   ├── light/
    │   │   │   └── 001stage001_rampfog.nutexb
    │   │   ├── border_hit.hkt
    │   │   ├── placement.csv
    │   │   ├── graphic_param.csv
    │   │   ├── plan_param.spbin
    │   │   └── post_effect/
    │   │       └── lut_none.nutexb
    │   ├── 001stage001_object_box01/
    │   │   ├── 0/
    │   │   │   ├── 001stage001_object_box01__maya__.nusktb
    │   │   │   ├── 0/
    │   │   │   │   ├── stage001_panel_02_roughness.nutexb
    │   │   │   │   ├── stage001_panel_02_normal.nutexb
    │   │   │   │   ├── stage001_panel_02_specular.nutexb
    │   │   │   │   ├── stage001_panel_01_diffuse.nutexb
    │   │   │   │   ├── stage001_panel_02_emissive.nutexb
    │   │   │   │   ├── stage001_panel_01_specular.nutexb
    │   │   │   │   ├── stage001_panel_01_roughness.nutexb
    │   │   │   │   ├── stage001_panel_01_normal.nutexb
    │   │   │   │   ├── stage001_panel_01_ambientocclusion.nutexb
    │   │   │   │   ├── stage001_panel_01_emissive.nutexb
    │   │   │   │   ├── stage001_panel_02_diffuse.nutexb
    │   │   │   │   └── stage001_panel_02_ambientocclusion.nutexb
    │   │   │   ├── 001stage001_object_box01__maya__.numatb
    │   │   │   ├── 1/
    │   │   │   │   ├── stage001_panel_02_specular.nutexb
    │   │   │   │   ├── stage001_panel_01_diffuse.nutexb
    │   │   │   │   ├── stage001_panel_01_specular.nutexb
    │   │   │   │   ├── stage001_panel_02_emissive.nutexb
    │   │   │   │   ├── stage001_panel_01_emissive.nutexb
    │   │   │   │   ├── stage001_panel_01_roughness.nutexb
    │   │   │   │   ├── stage001_panel_01_normal.nutexb
    │   │   │   │   ├── stage001_panel_01_ambientocclusion.nutexb
    │   │   │   │   ├── stage001_panel_02_diffuse.nutexb
    │   │   │   │   ├── stage001_panel_02_roughness.nutexb
    │   │   │   │   ├── stage001_panel_02_normal.nutexb
    │   │   │   │   └── stage001_panel_02_ambientocclusion.nutexb
    │   │   │   ├── 001stage001_object_box01__nust__.numatb
    │   │   │   ├── 001stage001_object_box01__maya__.numshb
    │   │   │   ├── 001stage001_object_box01.numdlb
    │   │   │   └── 001stage001_object_box01.jnttbl
    │   │   └── map_hit.hkt
    │   └── sky/
    │       └── 0/
    │           ├── 001stage001_sky__maya__.nusktb
    │           ├── 0/
    │           │   └── stage001_skydome_sky.nutexb
    │           ├── 001stage001_sky__maya__.numatb
    │           ├── 1/
    │           ├── 001stage001_sky__nust__.numatb
    │           ├── 001stage001_sky__maya__.numshb
    │           ├── 001stage001_sky.numdlb
    │           └── 001stage001_sky.jnttbl
    └── 1/
```

### Naming mapping (index → resolved name)

| Index | Type | Resolved Name |
|-------|------|---------------|
| 0 | .nutexb | stage001_panel_01_diffuse.nutexb |
| 1 | .nutexb | stage001_panel_01_specular.nutexb |
| 2 | .nutexb | stage001_panel_01_roughness.nutexb |
| 3 | .nutexb | stage001_panel_01_normal.nutexb |
| 4 | .nutexb | stage001_panel_01_ambientocclusion.nutexb |
| 5 | .nutexb | stage001_panel_01_emissive.nutexb |
| 6 | .nutexb | 900default_ibl_specular.nutexb |
| 7 | .nutexb | 900default_ibl_irradiance.nutexb |
| 8 | .nutexb | 001stage001_rampfog.nutexb |
| 9 | .nutexb | lut_none.nutexb |
| 10 | .nutexb | stage001_panel_02_roughness.nutexb |
| 11 | .nutexb | stage001_panel_02_normal.nutexb |
| 12 | .nutexb | stage001_panel_02_specular.nutexb |
| 13 | .nutexb | stage001_panel_02_emissive.nutexb |
| 14 | .nutexb | stage001_panel_02_diffuse.nutexb |
| 15 | .nutexb | stage001_panel_02_ambientocclusion.nutexb |
| 16 | .nutexb | stage001_skydome_sky.nutexb |
| 17 | .nusktb | 001stage001_base__maya__.nusktb |
| 18 | .nusktb | 001stage001_object_box01__maya__.nusktb |
| 19 | .nusktb | 001stage001_sky__maya__.nusktb |
| 20 | .numatb | 001stage001_base__maya__.numatb |
| 21 | .numatb | 001stage001_base__nust__.numatb |
| 22 | .numatb | 001stage001_object_box01__maya__.numatb |
| 23 | .numatb | 001stage001_object_box01__nust__.numatb |
| 24 | .numatb | 001stage001_sky__maya__.numatb |
| 25 | .numatb | 001stage001_sky__nust__.numatb |
| 26 | .numshb | 001stage001_base__maya__.numshb |
| 27 | .numshb | 001stage001_object_box01__maya__.numshb |
| 28 | .numshb | 001stage001_sky__maya__.numshb |
| 29 | .numdlb | 001stage001_base.numdlb |
| 30 | .numdlb | 001stage001_object_box01.numdlb |
| 31 | .numdlb | 001stage001_sky.numdlb |
| 32–40 | .bin | Resolved names below |

| 32 | .bin | 001stage001_base.jnttbl |
| 33 | .bin | map_hit.hkt |
| 34 | .bin | border_hit.hkt |
| 35 | .bin | placement.csv |
| 36 | .bin | graphic_param.csv |
| 37 | .bin | plan_param.spbin |
| 38 | .bin | 001stage001_object_box01.jnttbl |
| 39 | .bin | map_hit.hkt |
| 40 | .bin | 001stage001_sky.jnttbl |
