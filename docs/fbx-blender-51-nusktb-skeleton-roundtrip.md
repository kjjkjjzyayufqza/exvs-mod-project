# Blender 5.1 FBX Skeleton Round-Trip Notes

## Scope

This note documents the standard-FBX skeleton path used for SSBH to FBX to
SSBH round-trips with Blender 5.1. The path does not depend on
`EXVS2_SSBH_LocalMatrix` or any other private property.

Diagnosed samples:

- Body FBX: `D:\output\exvs2\Gyan\001gundam_005gyan00_001_body_normal.fbx`
- Edited weapon FBX: `D:\output\N1_rocket\N2_not_boom_mix_ship.fbx`
- Body skeleton: `001gundam_005gyan00_001_body_normal__maya__.nusktb`
- Weapon skeleton: `001gundam_005gyan00_001_wep_suibaku00__maya__.nusktb`

## Root Causes

### Skin clusters are not the complete armature

The old FBX importer built the NUSKTB bone list only from skin clusters. This
dropped valid armature bones with no vertex weights, including newly added
bones. The importer now traverses FBX skeleton `Model`/`LimbNode` nodes and uses
skin clusters only as an additional source.

Blender-generated leaf bones named `{parent}_end` or `{parent}.end` are omitted
when they are unskinned leaves. Exporting from Blender with
`add_leaf_bones=False` remains the unambiguous option.

### Display orientation is not source rest orientation

Blender edit bones use local `+Y` as the head-to-tail direction. An SSBH parent
can have a child joint in another local direction. For example, the source
weapon skeleton has an identity `STICK` rotation while `ATH_E_VERNIER` is
translated along local `-X`.

Those facts cannot produce a visually connected Blender bone cone without
changing the evaluated rest rotation. A connected cone is display geometry; it
is not evidence that the FBX parent relation or joint position is correct.

The former exporter changed rest rotations to point `+Y` at child joints and
stored the source matrices in `EXVS2_SSBH_LocalMatrix`. That made the skeleton
look connected but made correctness depend on a private property that Blender
does not export by default and that newly created bones do not have.

The standard path now writes source local rest transforms directly. The legacy
display-bone/property path remains opt-in for old workflows, but it is disabled
by default and is not required by the importer.

### Translation scaling perturbed rotations

The exporter previously scaled translation by decomposing every local matrix
into scale/rotation/translation and composing it again. This changed rotation
terms even though only translation needed scaling. Near XYZ gimbal lock, a
change around `1e-8` was enough to send the handwritten Euler decomposition
through an unstable branch. On `ATH_TE_R90`, one matrix term changed from about
`-0.342020` to `-0.334723`.

The exporter now scales only the translation column and leaves the source 3x3
transform untouched.

### Fixed XYZ Euler output was numerically fragile

FBX `Lcl Rotation` is Euler-based. The exporter now uses ufbx's transform and
quaternion conversion, evaluates all six standard FBX rotation orders, and
chooses the order whose middle axis is farthest from gimbal lock. It writes the
standard `RotationOrder` and `RotationActive` properties. Blender 5.1 imports
these properties and bakes them to its own XYZ export representation without
requiring private metadata.

## Import Rules

The FBX importer now:

- Preserves all skeleton nodes, including unweighted added bones.
- Preserves direct bone parents instead of skipping one ancestor level.
- Uses a root bone's transform relative to its Armature object rather than
  baking the Armature object transform into the NUSKTB root.
- Uses evaluated standard FBX local transforms when no legacy property exists.
- Keeps legacy property reading only to recover older files that still contain
  it.

## Blender 5.1 Export Settings

For the standard path:

- Import `Use Pre/Post Rotation`: enabled.
- Import `Automatic Bone Orientation`: disabled.
- Export `Add Leaf Bones`: disabled.
- Export `Only Deform Bones`: disabled when unweighted authored bones must be
  retained.
- Custom properties are not required.

Enabling Blender's automatic bone orientation prioritizes edit-bone appearance
over rest-axis preservation and is unsuitable for a loss-minimized round-trip.

## Verification

Verification used Blender 5.1.2 and no `EXVS2_SSBH_LocalMatrix` properties.

### Gyan body

- Source: 44 bones.
- Direct SSBH to FBX to NUSKTB: 44 bones; names and parent indices match.
- Blender 5.1 import/export to NUSKTB: 44 bones; names and parent indices match.
- Near-gimbal hand bones, including `ATH_TE_L90` and `ATH_TE_R90`, remain within
  the matrix comparison tolerance.

### Gyan weapon

- Source chain: `GBL_RT -> STICK -> ATH_E_VERNIER`.
- Blender 5.1 import/export preserves all three source local transforms.
- Adding unweighted `STICK.001` as a child of `STICK` produces four NUSKTB bones
  and preserves `STICK.001.parent_index = STICK`.
- Deleting `ATH_E_VERNIER` produces only `GBL_RT -> STICK`; the deleted bone is
  not recreated from stale skin data.

## Legacy Edited FBX Limitation

`D:\output\N1_rocket\N2_not_boom_mix_ship.fbx` contains no
`EXVS2_SSBH_LocalMatrix`, but its original three bones already use the former
Blender display orientation: `STICK` is rotated about 90 degrees and
`ATH_E_VERNIER` is translated along local `+Y`. The file correctly contains the
added `STICK.001` under `STICK`, but the original source rest rotations are no
longer present in the FBX.

No generic importer can infer overwritten rest roll/rotation from that FBX
alone. Re-export the source weapon with the standard path and repeat the bone
edit. The repaired exporter output
`D:\output\N1_rocket\codex_suibaku_standard_no_props.fbx` is a verified clean
starting point.
