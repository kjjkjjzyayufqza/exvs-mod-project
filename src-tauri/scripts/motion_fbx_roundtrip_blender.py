"""Test-only helper: open an FBX and re-export it with Blender defaults.

Simulates a mod developer editing CompleteMotionFbx in Blender 5.1 and
exporting the result. Not shipped as a product feature.
"""
import argparse
import json
import sys

import bpy


def parse_args() -> argparse.Namespace:
    separator_index = sys.argv.index("--")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-fbx", required=True)
    parser.add_argument("--output-fbx", required=True)
    return parser.parse_args(sys.argv[separator_index + 1 :])


def frame_scene_to_imported_action() -> None:
    """Match a well-behaved modder: timeline = clip range, 60 FPS.

    Blender's exporter bakes the SCENE frame range, not the action range, so
    leaving the default 1..250 timeline would pad the exported clip.
    """
    action = None
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE" and obj.animation_data and obj.animation_data.action:
            action = obj.animation_data.action
            break
    scene = bpy.context.scene
    if action is not None:
        start, end = action.frame_range
        scene.frame_start = int(round(start))
        scene.frame_end = int(round(end))
    scene.render.fps = 60


def main() -> None:
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=args.input_fbx)
    frame_scene_to_imported_action()
    bpy.ops.export_scene.fbx(
        filepath=args.output_fbx,
        bake_anim=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=False,
        add_leaf_bones=True,
    )
    print(json.dumps({"ok": True}))


main()
