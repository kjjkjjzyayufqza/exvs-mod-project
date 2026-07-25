# motion_fbx_compose.py

Headless Blender 5.1 script that binds a motion-only FBX onto a model FBX and
writes a single **CompleteMotionFbx** (armature + skinned meshes + action).

## Invocation

```text
blender -b -P src-tauri/scripts/motion_fbx_compose.py -- \
  --model-fbx <path> \
  --motion-fbx <path> \
  --output-fbx <path>
```

Arguments after `--` are required:

| Flag | Meaning |
|------|---------|
| `--model-fbx` | Staging model-only FBX (armature + meshes) |
| `--motion-fbx` | Staging animation-only FBX (armature + action) |
| `--output-fbx` | Destination CompleteMotionFbx path |

## Behavior

1. Clears the default scene.
2. Imports model FBX, then motion FBX.
3. Detects model armature (drives meshes) vs motion armature (action, no meshes).
4. Copies the motion Action onto the model armature (Action Slot aware on 5.1),
   shifts keys so the action starts at frame 0, sets scene FPS to 60.
5. Deletes the motion armature (and unused data).
6. Exports selection only (model armature + its meshes) with
   `add_leaf_bones=False`, `bake_anim=True`, no NLA / all-actions bake.

## Output contract

- **Success**: exit 0; one JSON line on stdout, e.g.
  `{"ok":true,"frame_start":0,"frame_end":40,"fps":60}`
- **Failure**: non-zero exit; message on stderr

Self-contained: does not load or require EXVS2-Easy-Blender-Tools.
