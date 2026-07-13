# Motion FBX import review evidence

This directory contains screenshots captured from the real applications used to
investigate `E:\del\motion.fbx`.

## Cascadeur: original file failure

![Cascadeur original import failure](./cascadeur-original-import-error.png)

The Event Log shows that Cascadeur 2026.1.3 failed in the native FBX scene
import. The following RigInfo exception is a secondary error after no scene was
loaded.

## Blender 5.1: fixed candidate import

![Blender 5.1 fixed candidate import](./blender-5.1-candidate-import.png)

The fixed candidate is `E:\del\motion_metadata_candidate.fbx`. The screenshot
is generated after Blender 5.1 imports that actual file and selects its imported
armature/action. Structured verification records 44 bones, 440 F-curves, frames
1 through 45, and a 60 FPS scene rate.

## Review status

- Original FBX: reproduced as a Cascadeur native scene import failure.
- Original FBX: imports in Blender, but Blender falls back to 25 FPS because the
  file omits FBX time metadata.
- Fixed candidate: imports in Blender 4.2 and 5.1 at 60 FPS with the motion
  preserved.
- Fixed candidate in Cascadeur: still rejected during native `FbxScene` load;
  the user chose to stop further Cascadeur parser investigation.

## Blender 5.1: complete model and motion

![Blender complete model and motion](./blender-complete-model-motion.png)

The live Blender scene contains a 44-bone skinned model armature, two meshes,
and action `001hito_001gundam_005gyan00_001_kakun10a_stk_air_fr`. The complete
binary FBX was exported to `E:\del\model_with_motion_blender51.fbx`.

An isolated Blender 5.1 re-import verified one 44-bone armature, two meshes with
correct Armature Modifier targets, 60 FPS, frames 1 through 40, and finite pose
matrices. The screenshot shows the verified live model at frame 20; the
temporary source motion armature is hidden and excluded from export.
