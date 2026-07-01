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
    get_settings,
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
    parents_set: int = 0

    def message(self, bone_name: str) -> str:
        details = [
            f"{self.total_vertices} vertices",
            f"{self.modifiers_added} modifiers added",
            f"{self.groups_removed} groups removed",
        ]
        if self.parents_set:
            details.append(f"{self.parents_set} parents set")
        return f"Bound {self.mesh_count} mesh(es) to {bone_name} ({', '.join(details)})"


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


@dataclass
class RemoveGroupStats:
    mesh_count: int = 0
    groups_removed: int = 0


@dataclass
class RetargetStats:
    mesh_count: int = 0
    modifiers_added: int = 0
    modifiers_retargeted: int = 0


def selected_mesh_objects(context: Context) -> list[Object]:
    return [obj for obj in context.selected_objects if obj.type == "MESH"]


def scene_mesh_objects(context: Context) -> list[Object]:
    return [obj for obj in context.scene.objects if obj.type == "MESH"]


def is_visible_in_context(obj: Object, context: Context) -> bool:
    try:
        return obj.visible_get(view_layer=context.view_layer)
    except TypeError:
        return obj.visible_get()


def candidate_mesh_objects(context: Context) -> list[Object]:
    settings = get_settings(context)
    objects = (
        selected_mesh_objects(context)
        if settings.selection_scope == "SELECTED"
        else scene_mesh_objects(context)
    )
    if settings.include_hidden:
        return objects
    return [obj for obj in objects if is_visible_in_context(obj, context)]


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


def replace_selection(context: Context, objects: list[Object]) -> int:
    ensure_object_mode(context)
    bpy.ops.object.select_all(action="DESELECT")
    selected_count = 0
    first_selected: Object | None = None
    for obj in objects:
        try:
            obj.select_set(True)
        except RuntimeError:
            continue
        selected_count += 1
        if first_selected is None:
            first_selected = obj
    if first_selected is not None:
        context.view_layer.objects.active = first_selected
    return selected_count


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


def used_vertex_group_names(mesh_object: Object) -> set[str]:
    names: set[str] = set()
    groups = mesh_object.vertex_groups
    for vertex in mesh_object.data.vertices:
        for assignment in vertex.groups:
            if assignment.weight <= 0.0:
                continue
            if assignment.group < len(groups):
                names.add(groups[assignment.group].name)
    return names


def remove_empty_vertex_groups(mesh_object: Object) -> int:
    used_names = used_vertex_group_names(mesh_object)
    removed = 0
    for group in list(mesh_object.vertex_groups):
        if group.name in used_names:
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
    mesh_object: Object,
    armature: Object,
    create_if_missing: bool,
    retarget_existing: bool,
) -> tuple[int, int]:
    modifiers = armature_modifiers(mesh_object)
    retargeted = 0
    if retarget_existing:
        for modifier in modifiers:
            if modifier.object != armature:
                modifier.object = armature
                retargeted += 1
    if modifiers or not create_if_missing:
        return 0, retargeted
    modifier = mesh_object.modifiers.new(name="Armature", type="ARMATURE")
    modifier.object = armature
    return 1, retargeted


def ensure_parent_armature(mesh_object: Object, armature: Object, keep_transform: bool) -> int:
    if mesh_object.parent == armature:
        return 0
    world_matrix = mesh_object.matrix_world.copy()
    mesh_object.parent = armature
    if keep_transform:
        mesh_object.matrix_world = world_matrix
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
) -> tuple[int, int, int, int]:
    group = find_or_create_vertex_group(mesh_object, bone_name)
    removed = 0
    if settings.remove_other_groups:
        removed = remove_non_target_groups(mesh_object, bone_name)
    vertex_count = assign_full_weight(group, mesh_object, settings.weight)
    modifiers_added, _retargeted = ensure_armature_modifier(
        mesh_object,
        armature,
        settings.add_armature_modifier,
        settings.retarget_existing_modifiers,
    )
    parents_set = 0
    if settings.parent_to_armature:
        parents_set = ensure_parent_armature(
            mesh_object, armature, settings.keep_parent_transform
        )
    if settings.normalize:
        normalize_vertex_groups(context, mesh_object)
    return vertex_count, removed, modifiers_added, parents_set


def bind_meshes(
    context: Context, mesh_objects: list[Object], armature: Object, bone_name: str, settings
) -> BindStats:
    stats = BindStats()
    wm = context.window_manager
    wm.progress_begin(0, len(mesh_objects))
    try:
        for index, mesh_object in enumerate(mesh_objects):
            wm.progress_update(index)
            vertex_count, removed, modifiers_added, parents_set = bind_mesh_object(
                context, mesh_object, armature, bone_name, settings
            )
            stats.mesh_count += 1
            stats.total_vertices += vertex_count
            stats.groups_removed += removed
            stats.modifiers_added += modifiers_added
            stats.parents_set += parents_set
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


def mesh_has_armature_modifier(mesh_object: Object) -> bool:
    return bool(armature_modifiers(mesh_object))


def mesh_has_skin(mesh_object: Object) -> bool:
    return mesh_has_armature_modifier(mesh_object) or len(mesh_object.vertex_groups) > 0


def mesh_uses_armature(mesh_object: Object, armature: Object) -> bool:
    if any(modifier.object == armature for modifier in armature_modifiers(mesh_object)):
        return True
    bone_names = {bone.name for bone in armature.data.bones}
    return any(group.name in bone_names for group in mesh_object.vertex_groups)


def mesh_has_weighted_group(mesh_object: Object, group_name: str) -> bool:
    group = mesh_object.vertex_groups.get(group_name)
    if group is None:
        return False
    group_index = group.index
    for vertex in mesh_object.data.vertices:
        for assignment in vertex.groups:
            if assignment.group == group_index and assignment.weight > 0.0:
                return True
    return False


def validated_armature(operator: Operator, context: Context):
    settings = init_settings_for_bind(context)
    armature = settings.armature_object
    if armature is None or armature.type != "ARMATURE":
        operator.report({"ERROR"}, "Select one armature or keep exactly one armature in the scene")
        return None
    return armature, settings


def validated_target_bone(operator: Operator, context: Context):
    setup = validated_armature(operator, context)
    if setup is None:
        return None
    armature, settings = setup
    if settings.bone_name == NO_BONE_VALUE or not armature_has_bone(armature, settings.bone_name):
        operator.report({"ERROR"}, "Select a valid target bone")
        return None
    return armature, settings.bone_name, settings


def validated_bind_setup(operator: Operator, context: Context):
    setup = validated_target_bone(operator, context)
    if setup is None:
        return None
    armature, bone_name, settings = setup
    mesh_objects = selected_mesh_objects(context)
    if not mesh_objects:
        operator.report({"ERROR"}, "Select at least one mesh object")
        return None
    if not valid_weight(settings.weight):
        operator.report({"ERROR"}, "Weight must be finite and greater than zero")
        return None
    return mesh_objects, armature, bone_name, settings


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


def select_matching_meshes(operator: Operator, context: Context, meshes: list[Object], label: str):
    selected_count = replace_selection(context, meshes)
    operator.report({"INFO"}, f"Selected {selected_count} {label} mesh(es)")
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
        print("[EXVS2-Easy-Blender-Tools] Reload failed")
        traceback.print_exc()
    finally:
        _reload_pending = False
    return None


class EXVS2_EASY_TOOLS_OT_bind(Operator):
    bl_idname = "exvs2_easy_tools.bind"
    bl_label = "Bind Selected Meshes to Bone"
    bl_description = "Create a Maya-like rigid skin bind from selected meshes to one bone"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Context) -> bool:
        return bool(selected_mesh_objects(context))

    def execute(self, context: Context):
        return run_bind(self, context)


class EXVS2_EASY_TOOLS_OT_bind_from_pose_bone(Operator):
    bl_idname = "exvs2_easy_tools.bind_from_pose_bone"
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


class EXVS2_EASY_TOOLS_OT_select_unskinned_meshes(Operator):
    bl_idname = "exvs2_easy_tools.select_unskinned_meshes"
    bl_label = "Select Meshes Without Skin"
    bl_description = "Select meshes with no vertex groups and no Armature modifier"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context: Context):
        meshes = [mesh for mesh in candidate_mesh_objects(context) if not mesh_has_skin(mesh)]
        return select_matching_meshes(self, context, meshes, "unskinned")


class EXVS2_EASY_TOOLS_OT_select_meshes_using_armature(Operator):
    bl_idname = "exvs2_easy_tools.select_meshes_using_armature"
    bl_label = "Select Meshes Using Armature"
    bl_description = "Select meshes that reference the chosen armature or one of its bone groups"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context: Context):
        setup = validated_armature(self, context)
        if setup is None:
            return {"CANCELLED"}
        armature, _settings = setup
        meshes = [
            mesh
            for mesh in candidate_mesh_objects(context)
            if mesh_uses_armature(mesh, armature)
        ]
        return select_matching_meshes(self, context, meshes, "armature-linked")


class EXVS2_EASY_TOOLS_OT_select_meshes_bound_to_bone(Operator):
    bl_idname = "exvs2_easy_tools.select_meshes_bound_to_bone"
    bl_label = "Select Meshes Bound to Bone"
    bl_description = "Select meshes that have weighted vertices in the target bone group"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context: Context):
        setup = validated_target_bone(self, context)
        if setup is None:
            return {"CANCELLED"}
        _armature, bone_name, _settings = setup
        meshes = [
            mesh
            for mesh in candidate_mesh_objects(context)
            if mesh_has_weighted_group(mesh, bone_name)
        ]
        return select_matching_meshes(self, context, meshes, "bone-bound")


class EXVS2_EASY_TOOLS_OT_retarget_armature_modifiers(Operator):
    bl_idname = "exvs2_easy_tools.retarget_armature_modifiers"
    bl_label = "Retarget Armature Modifiers"
    bl_description = "Point selected meshes' Armature modifiers at the chosen armature"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Context) -> bool:
        return bool(selected_mesh_objects(context))

    def execute(self, context: Context):
        setup = validated_armature(self, context)
        if setup is None:
            return {"CANCELLED"}
        armature, settings = setup
        stats = RetargetStats()
        for mesh_object in selected_mesh_objects(context):
            modifiers_added, modifiers_retargeted = ensure_armature_modifier(
                mesh_object,
                armature,
                settings.add_armature_modifier,
                True,
            )
            stats.mesh_count += 1
            stats.modifiers_added += modifiers_added
            stats.modifiers_retargeted += modifiers_retargeted
        self.report(
            {"INFO"},
            (
                f"Retargeted {stats.mesh_count} mesh(es): "
                f"{stats.modifiers_retargeted} changed, {stats.modifiers_added} added"
            ),
        )
        return {"FINISHED"}


class EXVS2_EASY_TOOLS_OT_keep_target_bone_group(Operator):
    bl_idname = "exvs2_easy_tools.keep_target_bone_group"
    bl_label = "Keep Only Target Bone Group"
    bl_description = "Remove every vertex group except the selected bone group"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Context) -> bool:
        return bool(selected_mesh_objects(context))

    def execute(self, context: Context):
        setup = validated_target_bone(self, context)
        if setup is None:
            return {"CANCELLED"}
        _armature, bone_name, _settings = setup
        stats = RemoveGroupStats()
        for mesh_object in selected_mesh_objects(context):
            stats.mesh_count += 1
            stats.groups_removed += remove_non_target_groups(mesh_object, bone_name)
        self.report(
            {"INFO"},
            f"Kept {bone_name} on {stats.mesh_count} mesh(es), removed {stats.groups_removed} group(s)",
        )
        return {"FINISHED"}


class EXVS2_EASY_TOOLS_OT_remove_empty_vertex_groups(Operator):
    bl_idname = "exvs2_easy_tools.remove_empty_vertex_groups"
    bl_label = "Remove Empty Vertex Groups"
    bl_description = "Remove selected meshes' vertex groups that have no positive vertex weights"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Context) -> bool:
        return bool(selected_mesh_objects(context))

    def execute(self, context: Context):
        stats = RemoveGroupStats()
        for mesh_object in selected_mesh_objects(context):
            stats.mesh_count += 1
            stats.groups_removed += remove_empty_vertex_groups(mesh_object)
        self.report(
            {"INFO"},
            f"Removed {stats.groups_removed} empty group(s) from {stats.mesh_count} mesh(es)",
        )
        return {"FINISHED"}


class EXVS2_EASY_TOOLS_OT_rename_mesh_data_to_objects(Operator):
    bl_idname = "exvs2_easy_tools.rename_mesh_data_to_objects"
    bl_label = "Name Mesh Data from Objects"
    bl_description = "Rename selected mesh datablocks to match their object names for cleaner FBX export"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Context) -> bool:
        return bool(selected_mesh_objects(context))

    def execute(self, context: Context):
        renamed = 0
        for mesh_object in selected_mesh_objects(context):
            if mesh_object.data.name == mesh_object.name:
                continue
            mesh_object.data.name = mesh_object.name
            renamed += 1
        self.report({"INFO"}, f"Renamed {renamed} mesh datablock(s)")
        return {"FINISHED"}


class EXVS2_EASY_TOOLS_OT_clear_skin(Operator):
    bl_idname = "exvs2_easy_tools.clear_skin"
    bl_label = "Clear Rigid Skin from Selected Meshes"
    bl_description = "Remove all vertex groups and Armature modifiers from selected meshes"
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


class EXVS2_EASY_TOOLS_OT_reload_addon(Operator):
    bl_idname = "exvs2_easy_tools.reload_addon"
    bl_label = "Reload EXVS2 Easy Blender Tools"
    bl_description = "Reload this addon without restarting Blender"
    bl_options = {"REGISTER"}

    def execute(self, context: Context):
        global _reload_pending
        addon_name = (__package__ or "").split(".")[0]
        if _reload_pending:
            self.report({"WARNING"}, "EXVS2 Easy Blender Tools reload is already scheduled")
            return {"CANCELLED"}
        _reload_pending = True
        bpy.app.timers.register(
            lambda addon_name=addon_name: reload_addon_package(addon_name),
            first_interval=0.05,
        )
        self.report({"INFO"}, "Scheduled EXVS2 Easy Blender Tools reload")
        return {"FINISHED"}


CLASSES = (
    EXVS2_EASY_TOOLS_OT_bind,
    EXVS2_EASY_TOOLS_OT_bind_from_pose_bone,
    EXVS2_EASY_TOOLS_OT_select_unskinned_meshes,
    EXVS2_EASY_TOOLS_OT_select_meshes_using_armature,
    EXVS2_EASY_TOOLS_OT_select_meshes_bound_to_bone,
    EXVS2_EASY_TOOLS_OT_retarget_armature_modifiers,
    EXVS2_EASY_TOOLS_OT_keep_target_bone_group,
    EXVS2_EASY_TOOLS_OT_remove_empty_vertex_groups,
    EXVS2_EASY_TOOLS_OT_rename_mesh_data_to_objects,
    EXVS2_EASY_TOOLS_OT_clear_skin,
    EXVS2_EASY_TOOLS_OT_reload_addon,
)
