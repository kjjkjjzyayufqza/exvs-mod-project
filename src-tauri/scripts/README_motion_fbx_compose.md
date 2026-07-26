# motion_fbx_compose.py

Headless Blender 5.1 script that keys MotionJson pose-basis frames onto a
model FBX armature and writes a single **CompleteMotionFbx** (armature +
skinned meshes + action).

## Invocation

```text
blender -b -P src-tauri/scripts/motion_fbx_compose.py -- \
  --model-fbx <path> \
  --motion-json <path> \
  --output-fbx <path>
```

Arguments after `--` are required:

| Flag | Meaning |
|------|---------|
| `--model-fbx` | Staging model-only FBX (armature + meshes) |
| `--motion-json` | Staging MotionJson (per-frame pose-basis TRS per bone) |
| `--output-fbx` | Destination CompleteMotionFbx path |

## MotionJson

Written by the Rust backend. Basis values are precomputed against the same
NUSKTB the model armature was exported from
(`basis = rest_local^-1 * animated_local`):

```json
{
  "actionName": "…",
  "fps": 60,
  "frameCount": 60,
  "boneNames": ["GBL_RT", "…"],
  "frames": [[[tx, ty, tz, qx, qy, qz, qw, sx, sy, sz], "…per bone"], "…per frame"]
}
```

Motion is intentionally NOT transported as an animation-only FBX: Blender's
FBX importer and exporter both cull all-constant animation channels, which
silently reverts bones whose animated value differs from rest (e.g. BASE
offset bones) back to the rest pose. The Rust side additionally nudges the
last frame of any still-constant channel by a sub-tolerance epsilon so the
channels survive the mod developer's own Blender round trip.

## Behavior

1. Clears the default scene and imports the model FBX (exactly one armature).
2. Disconnects every bone (`use_connect = False`): connected pose bones
   silently ignore location keys, freezing translation animation at rest.
3. Keys pose-basis location/quaternion/scale for every bone at every frame.
4. Sets scene FPS to 60 and the frame range to the real clip length.
5. Exports selection only (model armature + its meshes) with
   `add_leaf_bones=False`, `bake_anim=True`, `bake_anim_simplify_factor=0.0`,
   no NLA / all-actions bake.

## Output contract

- **Success**: exit 0; one JSON line on stdout, e.g.
  `{"ok":true,"frame_start":0,"frame_end":40,"fps":60}`
- **Failure**: non-zero exit; message on stderr

Self-contained: does not load or require EXVS2-Easy-Blender-Tools.
