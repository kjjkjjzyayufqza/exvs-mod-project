from __future__ import annotations

from dataclasses import dataclass
import addon_utils
import importlib
import math
import sys
import traceback

import bpy
from bpy.types import Context, Modifier, Object, Operator, VertexGroup

from .properties import (
    NO_BONE_VALUE,
    armature_has_bone,
    init_settings_for_bind,
)

_reload_pending = False
_VERTEX_CHUNK_SIZE = 65536


@dataclass
class BindStats:
    mesh_count: int = 0
    total_vertices: int = 0
    modifiers_added: int = 0
    groups_removed: int = 0

    def message(self, bone_name: str) -> str:
        return (
            f"Bound {self.mesh_count} mesh(es) to {bone_name} "
            f"({self.total_vertices} total vertices)"
        )


@dataclass
class ClearStats:
    mesh_count: int = 0
    modifiers_removed: int = 0
    groups_removed: int = 0

    def message(self) -> str:
        return (
            f"Cleared skin from {self.mesh_count} mesh(es) "
            f"({self.groups_removed} groups, {self.modifiers_removed} armature modifiers)"
        )


def selected_mesh_objects(context: Context) -> list[Object]:
    return [obj for obj in context.selected_objects if obj.type == "MESH"]


def selection_state(context: Context) -> tuple[str | None, list[str]]:
    active = context.view_layer.objects.active
    selected = [obj.name for obj in context.selected_objects]
    return (active.name if active else None, selected)


def restore_selection_state(
    context: Context, active_name: str | None, selected_names: list[str]
) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for name in selected_names:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.select_set(True)
    if active_name is None:
        return
    active = bpy.data.objects.get(active_name)
    if active is not None:
        context.view_layer.objects.active = active


def first_selected_pose_bone(context: Context):
    if context.active_pose_bone is not None:
        return context.active_pose_bone
    bones = context.selected_pose_bones or []
    return bones[0] if bones else None


def ensure_object_mode(context: Context) -> None:
    if context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def valid_weight(weight: float) -> bool:
    return math.isfinite(weight) and weight > 0.0


def find_or_create_vertex_group(mesh_object: Object, bone_name: str) -> VertexGroup:
    group = mesh_object.vertex_groups.get(bone_name)
    return group or mesh_object.vertex_groups.new(name=bone_name)


def remove_non_target_groups(mesh_object: Object, bone_name: str) -> int:
    removed = 0
    for group in list(mesh_object.vertex_groups):
        if group.name == bone_name:
            continue
        mesh_object.vertex_groups.remove(group)
        removed += 1
    return removed


def assign_full_weight(group: VertexGroup, mesh_object: Object, weight: float) -> int:
    vertex_count = len(mesh_object.data.vertices)
    if vertex_count == 0:
        return 0

    if vertex_count <= _VERTEX_CHUNK_SIZE:
        group.add(range(vertex_count), weight, "REPLACE")
        return vertex_count

    for start in range(0, vertex_count, _VERTEX_CHUNK_SIZE):
        end = min(start + _VERTEX_CHUNK_SIZE, vertex_count)
        group.add(range(start, end), weight, "REPLACE")
    return vertex_count


def armature_modifiers(mesh_object: Object) -> list[Modifier]:
    return [modifier for modifier in mesh_object.modifiers if modifier.type == "ARMATURE"]


def ensure_armature_modifier(
    mesh_object: Object, armature: Object, create_if_missing: bool
) -> int:
    modifiers = armature_modifiers(mesh_object)
    for modifier in modifiers:
        modifier.object = armature
    if modifiers or not create_if_missing:
        return 0
    modifier = mesh_object.modifiers.new(name="Armature", type="ARMATURE")
    modifier.object = armature
    return 1


def normalize_vertex_groups(context: Context, mesh_object: Object) -> None:
    context.view_layer.objects.active = mesh_object
    mesh_object.select_set(True)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)


def bind_mesh_object(
    context: Context,
    mesh_object: Object,
    armature: Object,
    bone_name: str,
    settings,
) -> tuple[int, int, int]:
    group = find_or_create_vertex_group(mesh_object, bone_name)
    removed = 0
    if settings.remove_other_groups:
        removed = remove_non_target_groups(mesh_object, bone_name)
    vertex_count = assign_full_weight(group, mesh_object, settings.weight)
    modifiers_added = ensure_armature_modifier(
        mesh_object, armature, settings.add_armature_modifier
    )
    if settings.normalize:
        normalize_vertex_groups(context, mesh_object)
    return vertex_count, removed, modifiers_added


def bind_meshes(
    context: Context, mesh_objects: list[Object], armature: Object, bone_name: str, settings
) -> BindStats:
    stats = BindStats()
    wm = context.window_manager
    wm.progress_begin(0, len(mesh_objects))
    try:
        for index, mesh_object in enumerate(mesh_objects):
            wm.progress_update(index)
            vertex_count, removed, modifiers_added = bind_mesh_object(
                context, mesh_object, armature, bone_name, settings
            )
            stats.mesh_count += 1
            stats.total_vertices += vertex_count
            stats.groups_removed += removed
            stats.modifiers_added += modifiers_added
    finally:
        wm.progress_end()
    return stats


def clear_mesh_skin(mesh_object: Object) -> tuple[int, int]:
    modifiers_removed = 0
    for modifier in list(mesh_object.modifiers):
        if modifier.type != "ARMATURE":
            continue
        mesh_object.modifiers.remove(modifier)
        modifiers_removed += 1
    groups_removed = len(mesh_object.vertex_groups)
    for group in list(mesh_object.vertex_groups):
        mesh_object.vertex_groups.remove(group)
    return modifiers_removed, groups_removed


def clear_meshes(mesh_objects: list[Object]) -> ClearStats:
    stats = ClearStats()
    wm = bpy.context.window_manager
    wm.progress_begin(0, len(mesh_objects))
    try:
        for index, mesh_object in enumerate(mesh_objects):
            wm.progress_update(index)
            modifiers_removed, groups_removed = clear_mesh_skin(mesh_object)
            stats.mesh_count += 1
            stats.modifiers_removed += modifiers_removed
            stats.groups_removed += groups_removed
    finally:
        wm.progress_end()
    return stats


def validated_bind_setup(operator: Operator, context: Context):
    settings = init_settings_for_bind(context)
    mesh_objects = selected_mesh_objects(context)
    armature = settings.armature_object
    if not mesh_objects:
        operator.report({"ERROR"}, "Select at least one mesh object")
        return None
    if armature is None or armature.type != "ARMATURE":
        operator.report({"ERROR"}, "Select one armature or keep exactly one armature in the scene")
        return None
    if not armature_has_bone(armature, settings.bone_name):
        operator.report({"ERROR"}, "Select a valid target bone")
        return None
    if settings.bone_name == NO_BONE_VALUE:
        operator.report({"ERROR"}, "Select a valid target bone")
        return None
    if not valid_weight(settings.weight):
        operator.report({"ERROR"}, "Weight must be finite and greater than zero")
        return None
    return mesh_objects, armature, settings.bone_name, settings


def run_bind(operator: Operator, context: Context):
    setup = validated_bind_setup(operator, context)
    if setup is None:
        return {"CANCELLED"}
    mesh_objects, armature, bone_name, settings = setup
    active_name, selected_names = selection_state(context)
    ensure_object_mode(context)
    try:
        stats = bind_meshes(context, mesh_objects, armature, bone_name, settings)
    finally:
        restore_selection_state(context, active_name, selected_names)
    operator.report({"INFO"}, stats.message(bone_name))
    return {"FINISHED"}


def reload_addon_package(addon_name: str) -> None:
    global _reload_pending
    package = sys.modules.get(addon_name)
    try:
        addon_utils.disable(addon_name, default_set=False, handle_error=True)
        if package is not None:
            importlib.reload(package)
        addon_utils.modules_refresh()
        addon_utils.enable(addon_name, default_set=False, handle_error=True)
    except Exception:
        print("[Batch Rigid Skin] Reload failed")
        traceback.print_exc()
    finally:
        _reload_pending = False
    return None


class BATCH_RIGID_SKIN_OT_bind(Operator):
    bl_idname = "batch_rigid_skin.bind"
    bl_label = "Bind Selected Meshes to Bone"
    bl_description = (
        "Create or reuse a vertex group with the exact bone name and assign every vertex to it"
    )
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Context) -> bool:
        return bool(selected_mesh_objects(context))

    def execute(self, context: Context):
        return run_bind(self, context)


class BATCH_RIGID_SKIN_OT_bind_from_pose_bone(Operator):
    bl_idname = "batch_rigid_skin.bind_from_pose_bone"
    bl_label = "Bind Selected Meshes to Active Pose Bone"
    bl_description = "Use the active selected pose bone as the rigid bind target"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Context) -> bool:
        return bool(selected_mesh_objects(context)) and first_selected_pose_bone(context) is not None

    def execute(self, context: Context):
        armature = context.active_object
        pose_bone = first_selected_pose_bone(context)
        if armature is None or armature.type != "ARMATURE" or pose_bone is None:
            self.report({"ERROR"}, "Select an armature in Pose Mode and choose a bone")
            return {"CANCELLED"}
        settings = init_settings_for_bind(context)
        settings.armature_object = armature
        settings.bone_name = pose_bone.name
        return run_bind(self, context)


class BATCH_RIGID_SKIN_OT_clear_skin(Operator):
    bl_idname = "batch_rigid_skin.clear_skin"
    bl_label = "Clear Rigid Skin from Selected Meshes"
    bl_description = "Remove all vertex groups and Armature modifiers from the selected meshes"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Context) -> bool:
        return bool(selected_mesh_objects(context))

    def execute(self, context: Context):
        mesh_objects = selected_mesh_objects(context)
        ensure_object_mode(context)
        stats = clear_meshes(mesh_objects)
        self.report({"INFO"}, stats.message())
        return {"FINISHED"}


class BATCH_RIGID_SKIN_OT_reload_addon(Operator):
    bl_idname = "batch_rigid_skin.reload_addon"
    bl_label = "Reload Batch Rigid Skin Addon"
    bl_description = "Reload this addon without restarting Blender"
    bl_options = {"REGISTER"}

    def execute(self, context: Context):
        global _reload_pending
        addon_name = (__package__ or "").split(".")[0]
        if _reload_pending:
            self.report({"WARNING"}, "Batch Rigid Skin reload is already scheduled")
            return {"CANCELLED"}
        _reload_pending = True
        bpy.app.timers.register(
            lambda addon_name=addon_name: reload_addon_package(addon_name),
            first_interval=0.05,
        )
        self.report({"INFO"}, "Scheduled Batch Rigid Skin addon reload")
        return {"FINISHED"}


CLASSES = (
    BATCH_RIGID_SKIN_OT_bind,
    BATCH_RIGID_SKIN_OT_bind_from_pose_bone,
    BATCH_RIGID_SKIN_OT_clear_skin,
    BATCH_RIGID_SKIN_OT_reload_addon,
)
