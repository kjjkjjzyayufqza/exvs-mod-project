#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""
Headless Blender compose for CompleteMotionFbx.

Invoked by the Tauri backend as:

    blender -b -P motion_fbx_compose.py -- \\
        --model-fbx <path> --motion-json <path> --output-fbx <path>

The motion arrives as MotionJson: per-frame pose-basis TRS precomputed by the
Rust backend (basis = rest_local^-1 * animated_local against the same NUSKTB
the model armature was written from). The script keys those basis values
directly onto the model armature's pose bones. Animation is intentionally NOT
transported through a second FBX: Blender's FBX importer drops all-constant
animation curves, which silently reverted bones whose animated value differs
from rest (e.g. a BASE offset bone) back to the rest pose.

Self-contained: does not import or require EXVS2-Easy-Blender-Tools.
Designed for Blender 5.1.
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path
from typing import Any, Iterable, Sequence


SAMPLE_RATE_FPS = 60
SUCCESS_FPS = 60


# ---------------------------------------------------------------------------
# Pure helpers (testable without bpy)
# ---------------------------------------------------------------------------


def argv_after_double_dash(argv: Sequence[str] | None = None) -> list[str]:
    """Return arguments after the first standalone ``--`` (Blender -P convention)."""
    source = list(sys.argv if argv is None else argv)
    if "--" in source:
        return source[source.index("--") + 1 :]
    return source


def parse_compose_args(argv: Sequence[str]) -> argparse.Namespace:
    """Parse headless compose CLI flags. Pure; no bpy."""
    parser = argparse.ArgumentParser(
        prog="motion_fbx_compose",
        description="Key MotionJson pose-basis frames onto the model FBX armature and export CompleteMotionFbx.",
    )
    parser.add_argument("--model-fbx", required=True, help="Path to model-only staging FBX")
    parser.add_argument("--motion-json", required=True, help="Path to MotionJson staging file")
    parser.add_argument("--output-fbx", required=True, help="Path for CompleteMotionFbx output")
    return parser.parse_args(list(argv))


def validate_input_paths(model_fbx: str, motion_json: str, output_fbx: str) -> None:
    """Raise ValueError if paths are empty, missing inputs, or collide."""
    if not model_fbx or not str(model_fbx).strip():
        raise ValueError("--model-fbx is empty")
    if not motion_json or not str(motion_json).strip():
        raise ValueError("--motion-json is empty")
    if not output_fbx or not str(output_fbx).strip():
        raise ValueError("--output-fbx is empty")

    model_path = Path(model_fbx).resolve()
    motion_path = Path(motion_json).resolve()
    output_path = Path(output_fbx).resolve()

    if not model_path.is_file():
        raise ValueError(f"model FBX not found: {model_path}")
    if not motion_path.is_file():
        raise ValueError(f"motion JSON not found: {motion_path}")
    if output_path == model_path or output_path == motion_path:
        raise ValueError("output FBX must not equal a staging input path")
    if model_path == motion_path:
        raise ValueError("model FBX and motion JSON must be different files")


def load_motion_json(path: str) -> dict[str, Any]:
    """Load and structurally validate MotionJson. Pure; no bpy."""
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    action_name = payload.get("actionName")
    fps = payload.get("fps")
    bone_names = payload.get("boneNames")
    frames = payload.get("frames")
    if not isinstance(action_name, str) or not action_name.strip():
        raise ValueError("MotionJson actionName must be a non-empty string")
    if fps != SAMPLE_RATE_FPS:
        raise ValueError(f"MotionJson fps must be {SAMPLE_RATE_FPS}, found {fps!r}")
    if not isinstance(bone_names, list) or not bone_names:
        raise ValueError("MotionJson boneNames must be a non-empty list")
    if not isinstance(frames, list) or not frames:
        raise ValueError("MotionJson frames must be a non-empty list")
    for frame_index, frame in enumerate(frames):
        if not isinstance(frame, list) or len(frame) != len(bone_names):
            raise ValueError(
                f"MotionJson frame {frame_index} must contain one entry per bone "
                f"({len(bone_names)}), found {len(frame) if isinstance(frame, list) else type(frame)}"
            )
        for bone_index, values in enumerate(frame):
            if not isinstance(values, list) or len(values) != 10:
                raise ValueError(
                    f"MotionJson frame {frame_index} bone {bone_index} must be "
                    f"[tx,ty,tz,qx,qy,qz,qw,sx,sy,sz]"
                )
    return payload


def success_payload(frame_start: int, frame_end: int, fps: int = SUCCESS_FPS) -> dict[str, Any]:
    return {
        "ok": True,
        "frame_start": int(frame_start),
        "frame_end": int(frame_end),
        "fps": int(fps),
    }


def format_success_line(frame_start: int, frame_end: int, fps: int = SUCCESS_FPS) -> str:
    return json.dumps(success_payload(frame_start, frame_end, fps), separators=(",", ":"))


# ---------------------------------------------------------------------------
# bpy-dependent pipeline (runs only inside Blender)
# ---------------------------------------------------------------------------


def _require_bpy():
    try:
        import bpy  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "bpy is not available; run this script via Blender: blender -b -P motion_fbx_compose.py -- ..."
        ) from exc
    return bpy


def clear_scene(bpy: Any) -> None:
    """Remove all objects and orphaned data from the default startup scene."""
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    for collection in (
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.actions,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.curves,
    ):
        for block in list(collection):
            try:
                collection.remove(block)
            except Exception:
                pass


def import_fbx(bpy: Any, filepath: str) -> None:
    result = bpy.ops.import_scene.fbx(filepath=str(filepath))
    if "FINISHED" not in result:
        raise RuntimeError(f"FBX import failed for {filepath}: {result}")


def armature_modifiers(mesh_object: Any) -> list[Any]:
    return [modifier for modifier in mesh_object.modifiers if modifier.type == "ARMATURE"]


def meshes_using_armature(scene_objects: Iterable[Any], armature: Any) -> list[Any]:
    meshes: list[Any] = []
    for obj in scene_objects:
        if obj.type != "MESH":
            continue
        if obj.parent == armature:
            meshes.append(obj)
            continue
        if any(modifier.object == armature for modifier in armature_modifiers(obj)):
            meshes.append(obj)
    return meshes


def find_model_armature(bpy: Any) -> Any:
    """The imported model FBX must contain exactly one armature."""
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        names = ", ".join(obj.name for obj in armatures) or "(none)"
        raise RuntimeError(
            f"expected exactly one armature in the model FBX, found {len(armatures)}: {names}"
        )
    return armatures[0]


def disconnect_all_bones(bpy: Any, armature: Any) -> None:
    """Clear use_connect on every bone so location channels stay animatable.

    Blender's FBX importer connects child bones whose head coincides with the
    parent's tail; connected pose bones silently ignore location keys, which
    would freeze translation animation (e.g. BASE offset bones) at rest.
    Disconnecting keeps head/tail/roll, so rest matrices are unchanged.
    """
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    for edit_bone in armature.data.edit_bones:
        edit_bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")


def apply_motion_basis(bpy: Any, armature: Any, motion: dict[str, Any]) -> tuple[int, int]:
    """Key MotionJson pose-basis TRS onto the armature's pose bones at 60 FPS."""
    bone_names: list[str] = list(motion["boneNames"])
    frames: list[list[list[float]]] = motion["frames"]

    pose_bones = []
    missing: list[str] = []
    for name in bone_names:
        pose_bone = armature.pose.bones.get(name)
        if pose_bone is None:
            missing.append(name)
        pose_bones.append(pose_bone)
    if missing:
        raise RuntimeError(
            f"model armature is missing {len(missing)} motion bones: {', '.join(missing[:8])}"
        )

    for pose_bone in pose_bones:
        pose_bone.rotation_mode = "QUATERNION"

    animation_data = armature.animation_data_create()
    action = bpy.data.actions.new(str(motion["actionName"]))
    animation_data.action = action
    # Blender 5.1 slotted actions: keying below auto-creates the slot; make sure
    # the assignment sticks for this armature.
    if getattr(action, "slots", None) is not None and hasattr(animation_data, "action_slot"):
        try:
            slot = action.slots.new(id_type="OBJECT", name=armature.name)
            animation_data.action_slot = slot
        except Exception:
            pass

    for frame_index, frame in enumerate(frames):
        for pose_bone, values in zip(pose_bones, frame):
            tx, ty, tz, qx, qy, qz, qw, sx, sy, sz = values
            pose_bone.location = (tx, ty, tz)
            pose_bone.rotation_quaternion = (qw, qx, qy, qz)
            pose_bone.scale = (sx, sy, sz)
            pose_bone.keyframe_insert(data_path="location", frame=frame_index)
            pose_bone.keyframe_insert(data_path="rotation_quaternion", frame=frame_index)
            pose_bone.keyframe_insert(data_path="scale", frame=frame_index)

    return 0, len(frames) - 1


def replace_selection(bpy: Any, objects: Sequence[Any]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        try:
            obj.select_set(True)
        except Exception:
            pass
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def configure_scene_timeline(bpy: Any, frame_start: float, frame_end: float) -> tuple[int, int]:
    scene = bpy.context.scene
    scene.render.fps = SAMPLE_RATE_FPS
    scene.render.fps_base = 1.0
    start_i = int(round(frame_start))
    end_i = int(round(frame_end))
    if end_i < start_i:
        end_i = start_i
    scene.frame_start = start_i
    scene.frame_end = end_i
    scene.frame_set(start_i)
    return start_i, end_i


def export_complete_fbx(bpy: Any, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.fbx(
        filepath=str(output_path),
        use_selection=True,
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=False,
        # Keep every baked sample: simplification culls all-constant channels,
        # which would revert constant-but-not-rest bones to the rest pose on
        # reimport (see MotionJson rationale in the module docstring).
        bake_anim_simplify_factor=0.0,
        object_types={"ARMATURE", "MESH"},
        path_mode="AUTO",
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"FBX export failed: {result}")
    if not output_path.is_file() or output_path.stat().st_size <= 0:
        raise RuntimeError(f"export produced no file at {output_path}")


def compose(model_fbx: str, motion_json: str, output_fbx: str) -> dict[str, Any]:
    """Full compose pipeline. Returns success payload dict."""
    validate_input_paths(model_fbx, motion_json, output_fbx)
    motion = load_motion_json(motion_json)
    bpy = _require_bpy()

    clear_scene(bpy)
    import_fbx(bpy, model_fbx)

    armature = find_model_armature(bpy)
    disconnect_all_bones(bpy, armature)
    frame_start, frame_end = apply_motion_basis(bpy, armature, motion)
    start_i, end_i = configure_scene_timeline(bpy, frame_start, frame_end)

    model_meshes = meshes_using_armature(bpy.context.scene.objects, armature)
    export_objects = [armature, *model_meshes]
    replace_selection(bpy, export_objects)
    export_complete_fbx(bpy, Path(output_fbx).resolve())

    return success_payload(start_i, end_i, SUCCESS_FPS)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_compose_args(argv_after_double_dash(argv))
        payload = compose(args.model_fbx, args.motion_json, args.output_fbx)
        # Single JSON success line on stdout (Rust parses this)
        print(format_success_line(payload["frame_start"], payload["frame_end"], payload["fps"]))
        return 0
    except SystemExit as exc:
        # argparse already wrote to stderr
        code = exc.code if isinstance(exc.code, int) else 1
        return code if code is not None else 1
    except Exception as exc:
        print(f"motion_fbx_compose failed: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
