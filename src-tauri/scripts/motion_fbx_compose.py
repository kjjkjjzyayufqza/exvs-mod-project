#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""
Headless Blender compose for CompleteMotionFbx.

Invoked by the Tauri backend as:

    blender -b -P motion_fbx_compose.py -- \\
        --model-fbx <path> --motion-fbx <path> --output-fbx <path>

Self-contained: does not import or require EXVS2-Easy-Blender-Tools.
Designed for Blender 5.1 (Action Slots) with safe fallbacks for older APIs.
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from dataclasses import dataclass
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
        description="Bind motion FBX action onto model FBX armature and export CompleteMotionFbx.",
    )
    parser.add_argument("--model-fbx", required=True, help="Path to model-only staging FBX")
    parser.add_argument("--motion-fbx", required=True, help="Path to animation-only staging FBX")
    parser.add_argument("--output-fbx", required=True, help="Path for CompleteMotionFbx output")
    return parser.parse_args(list(argv))


def validate_input_paths(model_fbx: str, motion_fbx: str, output_fbx: str) -> None:
    """Raise ValueError if paths are empty, missing inputs, or collide."""
    if not model_fbx or not str(model_fbx).strip():
        raise ValueError("--model-fbx is empty")
    if not motion_fbx or not str(motion_fbx).strip():
        raise ValueError("--motion-fbx is empty")
    if not output_fbx or not str(output_fbx).strip():
        raise ValueError("--output-fbx is empty")

    model_path = Path(model_fbx).resolve()
    motion_path = Path(motion_fbx).resolve()
    output_path = Path(output_fbx).resolve()

    if not model_path.is_file():
        raise ValueError(f"model FBX not found: {model_path}")
    if not motion_path.is_file():
        raise ValueError(f"motion FBX not found: {motion_path}")
    if output_path == model_path or output_path == motion_path:
        raise ValueError("output FBX must not equal model or motion staging path")
    if model_path == motion_path:
        raise ValueError("model FBX and motion FBX must be different files")


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


@dataclass
class MotionBindingSetup:
    model_armature: Any
    motion_armature: Any
    model_meshes: list[Any]
    source_action: Any
    source_slot_handle: int


def clear_scene(bpy: Any) -> None:
    """Remove all objects and orphaned data from the default startup scene."""
    # Object mode if possible
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


def armature_objects(scene_objects: Iterable[Any]) -> list[Any]:
    return [obj for obj in scene_objects if obj.type == "ARMATURE"]


def has_active_action(armature: Any) -> bool:
    animation_data = armature.animation_data
    if animation_data is None:
        return False
    return animation_data.action is not None


def detect_binding(bpy: Any) -> MotionBindingSetup:
    """
    Identify model armature (drives meshes) vs motion armature (has action, no meshes).

    Requires exactly one model candidate and exactly one motion candidate among
    scene armatures after both FBXs have been imported.
    """
    objects = list(bpy.context.scene.objects)
    armatures = armature_objects(objects)
    if len(armatures) < 2:
        raise RuntimeError(
            f"expected at least two armatures (model + motion), found {len(armatures)}"
        )

    mesh_links = {arm.name: meshes_using_armature(objects, arm) for arm in armatures}
    model_candidates = [arm for arm in armatures if mesh_links[arm.name]]
    motion_candidates = [
        arm
        for arm in armatures
        if not mesh_links[arm.name] and has_active_action(arm)
    ]

    if len(model_candidates) != 1:
        names = ", ".join(a.name for a in model_candidates) or "(none)"
        raise RuntimeError(
            f"cannot identify model armature: expected exactly one armature driving meshes, "
            f"found {len(model_candidates)}: {names}"
        )
    if len(motion_candidates) != 1:
        # Fallback: any non-model armature that has an action
        fallback = [
            arm
            for arm in armatures
            if arm not in model_candidates and has_active_action(arm)
        ]
        if len(fallback) == 1:
            motion_candidates = fallback
        else:
            names = ", ".join(a.name for a in motion_candidates) or "(none)"
            raise RuntimeError(
                f"cannot identify motion armature: expected exactly one armature with action "
                f"and no meshes, found {len(motion_candidates)}: {names}"
            )

    model_armature = model_candidates[0]
    motion_armature = motion_candidates[0]
    if model_armature == motion_armature:
        raise RuntimeError("model and motion armatures resolved to the same object")

    animation_data = motion_armature.animation_data
    source_action = animation_data.action
    source_slot_handle = int(getattr(animation_data, "action_slot_handle", 0) or 0)
    if getattr(source_action, "slots", None) and source_slot_handle == 0:
        # Blender 5.1 with slots but none assigned — try single-slot default
        slots = list(source_action.slots)
        if len(slots) == 1:
            source_slot_handle = int(slots[0].handle)
        else:
            raise RuntimeError("motion armature has Action Slots but none is assigned")

    return MotionBindingSetup(
        model_armature=model_armature,
        motion_armature=motion_armature,
        model_meshes=list(mesh_links[model_armature.name]),
        source_action=source_action,
        source_slot_handle=source_slot_handle,
    )


def action_fcurves(action: Any) -> Iterable[Any]:
    """Yield unique fcurves from layered (Blender 5.x) and legacy action layouts."""
    seen: set[int] = set()
    for layer in getattr(action, "layers", []) or []:
        for strip in getattr(layer, "strips", []) or []:
            for channelbag in getattr(strip, "channelbags", []) or []:
                for fcurve in getattr(channelbag, "fcurves", []) or []:
                    pointer = fcurve.as_pointer()
                    if pointer in seen:
                        continue
                    seen.add(pointer)
                    yield fcurve
    for fcurve in getattr(action, "fcurves", []) or []:
        pointer = fcurve.as_pointer()
        if pointer in seen:
            continue
        seen.add(pointer)
        yield fcurve


def shift_action_frames(action: Any, offset: float) -> None:
    if offset == 0.0:
        return
    for fcurve in action_fcurves(action):
        for keyframe in fcurve.keyframe_points:
            keyframe.co.x += offset
            keyframe.handle_left.x += offset
            keyframe.handle_right.x += offset
        for sample in getattr(fcurve, "sampled_points", []) or []:
            sample.co.x += offset
        fcurve.update()


def copied_action_slot(source_action: Any, copied_action: Any, source_slot_handle: int) -> Any | None:
    copied_slots = list(getattr(copied_action, "slots", []) or [])
    if not copied_slots:
        return None
    for slot in copied_slots:
        if int(slot.handle) == int(source_slot_handle):
            return slot

    source_slot = next(
        (
            slot
            for slot in (getattr(source_action, "slots", []) or [])
            if int(slot.handle) == int(source_slot_handle)
        ),
        None,
    )
    if source_slot is not None:
        for slot in copied_slots:
            if getattr(slot, "identifier", None) == getattr(source_slot, "identifier", None):
                return slot
    return copied_slots[0] if len(copied_slots) == 1 else None


def bind_copied_motion_action(setup: MotionBindingSetup) -> tuple[Any, float, float]:
    """Copy motion action onto model armature; normalize to frame 0."""
    bpy = _require_bpy()
    source_start, source_end = setup.source_action.frame_range
    copied_action = setup.source_action.copy()
    copied_action.name = f"{setup.source_action.name}_BOUND_{setup.model_armature.name}"
    try:
        copied_action["exvs2_source_action"] = setup.source_action.name
        copied_action["exvs2_source_armature"] = setup.motion_armature.name
    except Exception:
        pass

    target_slot = copied_action_slot(
        setup.source_action,
        copied_action,
        setup.source_slot_handle,
    )
    if getattr(copied_action, "slots", None) and target_slot is None:
        bpy.data.actions.remove(copied_action)
        raise RuntimeError("cannot identify the copied Action Slot")
    if target_slot is not None and hasattr(target_slot, "name_display"):
        target_slot.name_display = setup.model_armature.name

    shift_action_frames(copied_action, -float(source_start))
    normalized_end = float(source_end) - float(source_start)
    if hasattr(copied_action, "use_frame_range"):
        copied_action.use_frame_range = True
        copied_action.frame_start = 0.0
        copied_action.frame_end = normalized_end

    animation_data = setup.model_armature.animation_data_create()
    animation_data.action = copied_action
    if target_slot is not None:
        if hasattr(animation_data, "action_slot_handle"):
            animation_data.action_slot_handle = target_slot.handle
        elif hasattr(animation_data, "action_slot"):
            animation_data.action_slot = target_slot
    return copied_action, 0.0, normalized_end


def remove_motion_source(setup: MotionBindingSetup) -> None:
    bpy = _require_bpy()
    motion_data = setup.motion_armature.data
    source_action = setup.source_action

    if setup.motion_armature.animation_data is not None:
        setup.motion_armature.animation_data_clear()
    bpy.data.objects.remove(setup.motion_armature, do_unlink=True)

    if motion_data is not None and getattr(motion_data, "users", 1) == 0:
        try:
            bpy.data.armatures.remove(motion_data)
        except Exception:
            pass

    fake_user_count = 1 if getattr(source_action, "use_fake_user", False) else 0
    if source_action.users <= fake_user_count:
        source_action.use_fake_user = False
        try:
            bpy.data.actions.remove(source_action)
        except Exception:
            pass


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
        object_types={"ARMATURE", "MESH"},
        path_mode="AUTO",
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"FBX export failed: {result}")
    if not output_path.is_file() or output_path.stat().st_size <= 0:
        raise RuntimeError(f"export produced no file at {output_path}")


def compose(model_fbx: str, motion_fbx: str, output_fbx: str) -> dict[str, Any]:
    """Full compose pipeline. Returns success payload dict."""
    validate_input_paths(model_fbx, motion_fbx, output_fbx)
    bpy = _require_bpy()

    clear_scene(bpy)
    import_fbx(bpy, model_fbx)
    import_fbx(bpy, motion_fbx)

    setup = detect_binding(bpy)
    _copied, frame_start, frame_end = bind_copied_motion_action(setup)
    start_i, end_i = configure_scene_timeline(bpy, frame_start, frame_end)
    remove_motion_source(setup)

    # Re-resolve meshes after deletion (object refs remain valid for model side)
    model_meshes = meshes_using_armature(bpy.context.scene.objects, setup.model_armature)
    if not model_meshes:
        model_meshes = list(setup.model_meshes)

    export_objects = [setup.model_armature, *model_meshes]
    replace_selection(bpy, export_objects)
    export_complete_fbx(bpy, Path(output_fbx).resolve())

    return success_payload(start_i, end_i, SUCCESS_FPS)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_compose_args(argv_after_double_dash(argv))
        payload = compose(args.model_fbx, args.motion_fbx, args.output_fbx)
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
