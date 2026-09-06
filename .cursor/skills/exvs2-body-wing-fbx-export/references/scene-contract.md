# Scene contract: composed body + wing

Editing happens in **one** Blender scene. Export still writes **two** FBX files.

## Object graph (Rebellion Zero EW)

```text
Scene
├── OLD_Armature / OLD_* meshes     hidden leftovers; never export
├── ZeroEW_Body                     ARMATURE, 52 bones, marker CENTER_RT
│   ├── ZeroEW_Body_SHAPE_ROOTShape
│   ├── ZeroEW_Body_SHAPE_ROOTShape__sub1
│   ├── ZeroEW_Body_SHAPE_ROOTShape__sub2
│   └── ZeroEW_Wing                 ARMATURE, 44 bones, marker LMAIN_1
│       parent_type = BONE
│       parent_bone = ATH_BACKPACK
│       └── ZeroEW_Wing_SHAPE_ROOTShape
```

Duplicates after File → Save As / append appear as `ZeroEW_Body.001`. Detect by bones, not exact names.

## Constraints

Wing `GBL_RT` carries:

```text
CHILD_OF  name=Attach_ATH_BACKPACK  target=ZeroEW_Body  subtarget=ATH_BACKPACK
```

This is preview attach only. Export isolation hides Body while baking Wing (and vice versa). Do **not** unparent to "clean" the FBX.

## Actions

Each armature has its **own** Action. Blender playback evaluates both. The Action Editor only shows the **selected** armature, which looks like "only one side animates".

| Armature | Proven action names |
|----------|---------------------|
| Body | `ZeroEW_from_gwtv`, `ZeroEW_Body_trans_end`, `ZeroEW_Body_60fps_lastframe` |
| Wing | `ZeroEW_Wing_kamae_sht_air`, `ZeroEW_Wing_guardbgn_sht_air`, `ZeroEW_Wing_guardloop_sht_air`, `ZeroEW_Wing_trans_end`, `ZeroEW_Wing_60fps_lastframe` |

Frame ranges are per action. Body 1–24 and wing 1–10/20 in the same scene is normal. Align ranges only if the user asks.

## Mesh membership

A mesh belongs to an armature if:

1. `mesh.parent == armature`, or
2. any modifier `type==ARMATURE` and `modifier.object == armature`

Exclude `OLD_*` and the other armature's meshes even if a modifier was copied by mistake.

## `ATH_*` bones

They stay on the **skeleton**.

- **Host Body / host wing homemade clips:** do not author `ATH_*` keys. Strip
  keys in DCC (`strip_ath_keys`). NUANMB writer omits ATH Transform nodes.
- **Extra / Part clips** (Rebellion white `ZeroEW_White_Body` / `body_whitel`):
  keep every bone, including ATH animation. The extra is not driven by host
  NUHLPB. Do not call `strip_ath_keys` on that armature.

Policy: `docs/nuanmb-ath-helper-bone-policy.md`. Victory extra owner:
`docs/msc-research/wing-zero-rebellion-victory-pose.md` §9.
