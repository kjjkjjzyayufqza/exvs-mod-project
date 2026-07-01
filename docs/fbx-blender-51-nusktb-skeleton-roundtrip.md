# Blender 5.1 FBX Skeleton Round-Trip Notes

## Scope

This note documents why a Blender 5.1 FBX round-trip can produce large
`.nusktb` skeleton differences even when the user did not intentionally edit the
armature.

The diagnosed sample was:

- FBX: `D:\output\N1_rocket\N2_not_boom_mix_ship.fbx`
- Converted skeleton:
  `E:\XB\解包\com\file\002chara\gundam_005gyan00\models\N2_not_boom_mix_ship\N2_not_boom_mix_ship.nusktb`
- Reference skeleton:
  `E:\XB\解包\com\file\002chara\gundam_005gyan00\models\001gundam_005gyan00_001_wep_suibaku00\001gundam_005gyan00_001_wep_suibaku00__maya__.nusktb`

## Findings

Blender 5.1.2 and `ufbx` both read the sample FBX hierarchy as:

```text
GBL_RT
  STICK
    ATH_E_VERNIER
      ATH_E_VERNIER_end
```

The direct hierarchy is valid in the FBX. The old importer broke it by starting
the parent search at the direct parent but checking each node's parent first.
This skipped one level:

```text
STICK parent: expected GBL_RT, imported None
ATH_E_VERNIER parent: expected STICK, imported GBL_RT
```

The importer also used `node_to_world` for root bones. In Blender exports, root
bones are children of an Armature object, so this incorrectly baked the Armature
object transform into the game skeleton root. Root bones should use
`node_to_parent` when they have a scene parent, preserving the bone transform
relative to the Armature object.

## Blender 5.1 Behavior

Blender armatures are edit-bone based: each bone has a head, tail, and local
`+Y` direction. The project FBX exporter already converts SSBH joint matrices to
a Blender-friendly display hierarchy in `apply_blender_bone_orientations()`:

1. Compute the source SSBH world matrix for each bone.
2. Keep the joint position.
3. Replace the bone rotation with a display rotation that points local `+Y`
   toward the child joint or parent direction.
4. Write Model `Lcl`, cluster `TransformLink`, and bind pose matrices using the
   display hierarchy.

This makes Blender editing usable, but it means the FBX no longer contains the
original SSBH local rotations unless they are stored separately. The diagnosed
`.blend` had no Armature, Bone, or PoseBone custom properties carrying original
matrices, and pose basis matrices were identity.

Blender 5.1's FBX add-on defaults are also relevant:

- Import custom properties: enabled by default.
- Import automatic bone orientation: disabled by default.
- Import primary/secondary bone axis: `Y` / `X`.
- Export custom properties: disabled by default.
- Export leaf bones: enabled in the operator UI by default.

The `_end` bone seen after Blender import/export is a leaf/display bone, not a
skinned game bone.

## Repair Applied

`src-tauri/src/ssbh_dae/fbx_import.rs` now:

- Treats the current ancestor candidate as a possible bone parent before
  climbing, preserving direct bone parents.
- Uses a root bone's `node_to_parent` when it has a scene parent, preventing the
  Blender Armature object transform from becoming `GBL_RT`'s local transform.
- Limits Blender FBX axis-convention correction to mesh positions/normals. The
  importer no longer applies the Y180 correction to skeleton local rest matrices
  or inverse bind matrices, since that flips preserved SSBH local translations
  such as `ATH_E_VERNIER` from `-X` to `+X`.
- Adds a regression test using the Gyan Blender FBX sample. The test asserts the
  imported chain `GBL_RT -> STICK -> ATH_E_VERNIER`, converts the FBX to a
  temporary `.nusktb`, and verifies the written parent indices and identity
  `GBL_RT` matrix.

`src-tauri/src/ssbh_fbx.rs` now:

- Exports Blender-friendly connected/display bones for editing.
- Stores the original SSBH local rest matrix on each FBX bone `Model` as the
  custom property `EXVS2_SSBH_LocalMatrix`.
- Keeps `apply_blender_bone_orientations()` in the production export path so
  Blender displays the chain as connected bones, but no longer treats those
  display transforms as authoritative when converting back to `.nusktb`.
- Writes FBX `Visibility` properties using Blender 5.1's expected
  `Visibility`/float64 signature instead of a generic bool property.

Blender 5.1 imports custom properties by default, and the property lands on the
pose bone. Blender does **not** export custom properties by default. When
exporting the edited FBX from Blender, enable `Custom Properties`
(`use_custom_props=True`) or the source SSBH rest matrices will be lost and the
fallback path will again see Blender display-bone transforms.

Verification on the Gyan sample:

1. Exported
   `001gundam_005gyan00_001_wep_suibaku00.numdlb` to
   `D:\output\N1_rocket\codex_display_props_export_check.fbx`.
2. Imported and exported that file through Blender 5.1.2 headlessly with
   `use_custom_props=True` to
   `D:\output\N1_rocket\codex_display_props_blender_roundtrip.fbx`.
3. Converted the Blender round-trip FBX back to a temporary `.nusktb` with
   scale `0.1`.

The resulting skeleton matrix check passed:

```text
GBL_RT        parent=None    local=identity
STICK         parent=GBL_RT  local=identity
ATH_E_VERNIER parent=STICK   translation=(-1.7783101, 0, 0), rotation ~= diag(-1, 1, -1)
```

The same Blender export with `use_custom_props=False` loses
`EXVS2_SSBH_LocalMatrix`; `ATH_E_VERNIER` then falls back to display local
translation near `(0, 1.77831, 0)`, which is the original corruption mode.

## Remaining Limitation

Existing FBX files exported before this repair do not contain
`EXVS2_SSBH_LocalMatrix`. They may already have lost arbitrary SSBH bone
roll/local rotation data because Blender only saw display-bone matrices. Those
files cannot be fully reconstructed from Blender head/tail data alone. Re-export
the model with the repaired exporter before doing another Blender round-trip.
