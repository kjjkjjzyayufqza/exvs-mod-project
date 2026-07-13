from __future__ import annotations

import bpy
from bpy.types import Context, Menu, Panel

from .operators import (
    EXVS2_EASY_TOOLS_OT_bind,
    EXVS2_EASY_TOOLS_OT_bind_from_pose_bone,
    EXVS2_EASY_TOOLS_OT_bind_selected_motion,
    EXVS2_EASY_TOOLS_OT_clear_skin,
    EXVS2_EASY_TOOLS_OT_keep_target_bone_group,
    EXVS2_EASY_TOOLS_OT_remove_empty_vertex_groups,
    EXVS2_EASY_TOOLS_OT_rename_mesh_data_to_objects,
    EXVS2_EASY_TOOLS_OT_prepare_motion_export_selection,
    EXVS2_EASY_TOOLS_OT_retarget_armature_modifiers,
    EXVS2_EASY_TOOLS_OT_reload_addon,
    EXVS2_EASY_TOOLS_OT_select_meshes_bound_to_bone,
    EXVS2_EASY_TOOLS_OT_select_meshes_using_armature,
    EXVS2_EASY_TOOLS_OT_select_unskinned_meshes,
    EXVS2_EASY_TOOLS_OT_use_selected_motion_rigs,
    detect_motion_binding,
    validate_motion_skeletons,
)
from .properties import NO_BONE_VALUE, armature_has_bone, get_settings


def selected_object_counts(context: Context) -> tuple[int, int]:
    armatures = sum(1 for obj in context.selected_objects if obj.type == "ARMATURE")
    meshes = sum(1 for obj in context.selected_objects if obj.type == "MESH")
    return armatures, meshes


def short_motion_error(error: str | None) -> str:
    if not error:
        return "Pick A and B"
    if "exactly two" in error or "Choose both" in error:
        return "Pick A and B"
    if "no active Action" in error:
        return "B has no Action"
    if "not used by any model meshes" in error:
        return "A has no model meshes"
    if "must be different" in error:
        return "A and B must differ"
    return error


def draw_motion_tools(layout, context: Context) -> None:
    settings = get_settings(context)
    layout.use_property_split = True
    layout.use_property_decorate = False
    fields = layout.column(align=True)
    fields.prop(settings, "motion_model_armature", text="A  Model")
    fields.prop(settings, "motion_source_armature", text="B  Motion")
    fields.operator(
        EXVS2_EASY_TOOLS_OT_use_selected_motion_rigs.bl_idname,
        text="Use Selected Pair",
        icon="RESTRICT_SELECT_OFF",
    )

    setup, error = detect_motion_binding(context)
    layout.separator()
    status = layout.column(align=True)
    if setup is None:
        model = settings.motion_model_armature
        action = model.animation_data.action if model and model.animation_data else None
        binding_complete = bool(
            model
            and settings.motion_source_armature is None
            and action
            and action.get("exvs2_source_armature")
        )
        if binding_complete:
            status.label(text=f"Done: {model.name}", icon="CHECKMARK")
        else:
            status.label(text=short_motion_error(error), icon="ERROR")
    else:
        validation_error, _max_rest_delta = validate_motion_skeletons(setup)
        if validation_error:
            status.label(text="Skeleton mismatch", icon="ERROR")
        else:
            status.label(text="Ready", icon="CHECKMARK")

    button = layout.column()
    button.scale_y = 1.25
    button.operator(
        EXVS2_EASY_TOOLS_OT_bind_selected_motion.bl_idname,
        text="Transfer and Delete B",
        icon="ACTION",
    )
    layout.label(text="Deletes B after success", icon="TRASH")


def draw_motion_export_guide(layout) -> None:
    layout.operator(
        EXVS2_EASY_TOOLS_OT_prepare_motion_export_selection.bl_idname,
        text="Select Export Set",
        icon="RESTRICT_SELECT_OFF",
    )
    layout.separator()
    guide = layout.column(align=True)
    guide.label(text="Selected Objects  ON", icon="CHECKMARK")
    guide.label(text="Mesh + Armature", icon="CHECKMARK")
    guide.label(text="Leaf Bones  OFF", icon="X")
    guide.label(text="NLA / All Actions  OFF", icon="X")


def draw_selection_tools(layout, context: Context) -> None:
    settings = get_settings(context)
    row = layout.row(align=True)
    row.prop(settings, "selection_scope", text="")
    row.prop(settings, "include_hidden")
    column = layout.column(align=True)
    column.operator(
        EXVS2_EASY_TOOLS_OT_select_unskinned_meshes.bl_idname,
        text="Without Skin",
        icon="MESH_DATA",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_select_meshes_using_armature.bl_idname,
        text="Using Armature",
        icon="ARMATURE_DATA",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_select_meshes_bound_to_bone.bl_idname,
        text="Bound to Bone",
        icon="BONE_DATA",
    )


def draw_bind_tools(layout, context: Context) -> None:
    settings = get_settings(context)
    layout.use_property_split = True
    layout.use_property_decorate = False
    layout.prop(settings, "armature_object", text="Armature")
    layout.prop(settings, "bone_name", text="Bone")
    layout.prop(settings, "weight")
    layout.separator()
    options = layout.column(align=True)
    options.prop(settings, "remove_other_groups", text="Remove other groups")
    options.prop(settings, "add_armature_modifier", text="Add modifier")
    options.prop(settings, "retarget_existing_modifiers", text="Retarget modifiers")
    options.prop(settings, "parent_to_armature", text="Parent to armature")
    if settings.parent_to_armature:
        options.prop(settings, "keep_parent_transform", text="Keep transform")
    options.prop(settings, "normalize", text="Normalize")
    if settings.armature_object is None:
        layout.label(text="Pick an armature", icon="INFO")
    elif not armature_has_bone(settings.armature_object, settings.bone_name):
        layout.label(text="Pick a bone", icon="ERROR")
    elif settings.bone_name == NO_BONE_VALUE:
        layout.label(text="Pick a bone", icon="ERROR")
    if context.active_pose_bone and context.active_object == settings.armature_object:
        layout.label(text=f"Active: {context.active_pose_bone.name}")
    layout.separator()
    column = layout.column(align=True)
    column.operator(
        EXVS2_EASY_TOOLS_OT_bind.bl_idname,
        text="Bind Meshes",
        icon="GROUP_VERTEX",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_bind_from_pose_bone.bl_idname,
        text="Use Active Bone",
        icon="BONE_DATA",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_retarget_armature_modifiers.bl_idname,
        text="Retarget Modifiers",
        icon="MOD_ARMATURE",
    )


def draw_cleanup_tools(layout) -> None:
    column = layout.column(align=True)
    column.operator(
        EXVS2_EASY_TOOLS_OT_keep_target_bone_group.bl_idname,
        text="Keep Target Group",
        icon="GROUP_VERTEX",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_remove_empty_vertex_groups.bl_idname,
        text="Remove Empty Groups",
        icon="X",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_rename_mesh_data_to_objects.bl_idname,
        text="Match Mesh Data Names",
        icon="OUTLINER_DATA_MESH",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_clear_skin.bl_idname,
        text="Clear Skin",
        icon="TRASH",
    )


class EXVS2_EASY_TOOLS_PT_panel(Panel):
    bl_label = "EXVS2 Easy Tools"
    bl_idname = "EXVS2_EASY_TOOLS_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "EXVS2 Tools"

    def draw(self, context: Context) -> None:
        armatures, meshes = selected_object_counts(context)
        self.layout.label(text=f"Selected: {armatures} rigs, {meshes} meshes")


class _EXVS2_EASY_TOOLS_PT_child_panel:
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "EXVS2 Tools"
    bl_parent_id = EXVS2_EASY_TOOLS_PT_panel.bl_idname


class EXVS2_EASY_TOOLS_PT_motion(_EXVS2_EASY_TOOLS_PT_child_panel, Panel):
    bl_label = "Motion"
    bl_idname = "EXVS2_EASY_TOOLS_PT_motion"
    bl_order = 10

    def draw_header(self, _context: Context) -> None:
        self.layout.label(text="", icon="ACTION")

    def draw(self, context: Context) -> None:
        draw_motion_tools(self.layout, context)


class EXVS2_EASY_TOOLS_PT_export(_EXVS2_EASY_TOOLS_PT_child_panel, Panel):
    bl_label = "FBX Export"
    bl_idname = "EXVS2_EASY_TOOLS_PT_export"
    bl_order = 20

    def draw_header(self, _context: Context) -> None:
        self.layout.label(text="", icon="EXPORT")

    def draw(self, _context: Context) -> None:
        draw_motion_export_guide(self.layout)


class EXVS2_EASY_TOOLS_PT_rigid_skin(_EXVS2_EASY_TOOLS_PT_child_panel, Panel):
    bl_label = "Rigid Skin"
    bl_idname = "EXVS2_EASY_TOOLS_PT_rigid_skin"
    bl_order = 30
    bl_options = {"DEFAULT_CLOSED"}

    def draw_header(self, _context: Context) -> None:
        self.layout.label(text="", icon="GROUP_VERTEX")

    def draw(self, context: Context) -> None:
        draw_bind_tools(self.layout, context)


class EXVS2_EASY_TOOLS_PT_selection(_EXVS2_EASY_TOOLS_PT_child_panel, Panel):
    bl_label = "Selection"
    bl_idname = "EXVS2_EASY_TOOLS_PT_selection"
    bl_order = 40
    bl_options = {"DEFAULT_CLOSED"}

    def draw_header(self, _context: Context) -> None:
        self.layout.label(text="", icon="RESTRICT_SELECT_OFF")

    def draw(self, context: Context) -> None:
        draw_selection_tools(self.layout, context)


class EXVS2_EASY_TOOLS_PT_cleanup(_EXVS2_EASY_TOOLS_PT_child_panel, Panel):
    bl_label = "Cleanup"
    bl_idname = "EXVS2_EASY_TOOLS_PT_cleanup"
    bl_order = 50
    bl_options = {"DEFAULT_CLOSED"}

    def draw_header(self, _context: Context) -> None:
        self.layout.label(text="", icon="BRUSH_DATA")

    def draw(self, _context: Context) -> None:
        draw_cleanup_tools(self.layout)


class EXVS2_EASY_TOOLS_PT_maintenance(_EXVS2_EASY_TOOLS_PT_child_panel, Panel):
    bl_label = "Maintenance"
    bl_idname = "EXVS2_EASY_TOOLS_PT_maintenance"
    bl_order = 60
    bl_options = {"DEFAULT_CLOSED"}

    def draw_header(self, _context: Context) -> None:
        self.layout.label(text="", icon="FILE_REFRESH")

    def draw(self, _context: Context) -> None:
        self.layout.operator(
            EXVS2_EASY_TOOLS_OT_reload_addon.bl_idname,
            text="Reload Addon",
            icon="FILE_REFRESH",
        )


class EXVS2_EASY_TOOLS_MT_object_menu(Menu):
    bl_label = "EXVS2 Easy Blender Tools"
    bl_idname = "EXVS2_EASY_TOOLS_MT_object_menu"

    def draw(self, context: Context) -> None:
        layout = self.layout
        layout.operator(
            EXVS2_EASY_TOOLS_OT_bind_selected_motion.bl_idname,
            text="Transfer Motion and Delete B",
            icon="ACTION",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_prepare_motion_export_selection.bl_idname,
            text="Select Export Set",
            icon="RESTRICT_SELECT_OFF",
        )
        layout.separator()
        layout.operator(
            EXVS2_EASY_TOOLS_OT_bind.bl_idname,
            text="Bind Meshes",
            icon="GROUP_VERTEX",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_bind_from_pose_bone.bl_idname,
            text="Use Active Bone",
            icon="BONE_DATA",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_retarget_armature_modifiers.bl_idname,
            text="Retarget Modifiers",
            icon="MOD_ARMATURE",
        )
        layout.separator()
        layout.operator(
            EXVS2_EASY_TOOLS_OT_select_unskinned_meshes.bl_idname,
            text="Select Without Skin",
            icon="MESH_DATA",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_select_meshes_using_armature.bl_idname,
            text="Select Using Armature",
            icon="ARMATURE_DATA",
        )
        layout.separator()
        layout.operator(
            EXVS2_EASY_TOOLS_OT_keep_target_bone_group.bl_idname,
            text="Keep Target Group",
            icon="GROUP_VERTEX",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_remove_empty_vertex_groups.bl_idname,
            text="Remove Empty Groups",
            icon="X",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_clear_skin.bl_idname,
            text="Clear Skin",
            icon="TRASH",
        )


def draw_object_context_menu(self, context: Context) -> None:
    self.layout.separator()
    self.layout.menu(EXVS2_EASY_TOOLS_MT_object_menu.bl_idname, icon="ARMATURE_DATA")


_OBJECT_CONTEXT_MENUS = (
    "VIEW3D_MT_object_context_menu",
)


def _append_to_object_menus(draw_func) -> list[str]:
    hooked: list[str] = []
    for menu_name in _OBJECT_CONTEXT_MENUS:
        menu_type = getattr(bpy.types, menu_name, None)
        if menu_type is None:
            continue
        menu_type.append(draw_func)
        hooked.append(menu_name)
    return hooked


def _remove_from_object_menus(draw_func) -> None:
    for menu_name in _OBJECT_CONTEXT_MENUS:
        menu_type = getattr(bpy.types, menu_name, None)
        if menu_type is None:
            continue
        try:
            menu_type.remove(draw_func)
        except (AttributeError, ValueError):
            pass


_hooked_menus: list[str] = []


def register_ui() -> None:
    global _hooked_menus
    _hooked_menus = _append_to_object_menus(draw_object_context_menu)


def unregister_ui() -> None:
    _remove_from_object_menus(draw_object_context_menu)


CLASSES = (
    EXVS2_EASY_TOOLS_PT_panel,
    EXVS2_EASY_TOOLS_PT_motion,
    EXVS2_EASY_TOOLS_PT_export,
    EXVS2_EASY_TOOLS_PT_rigid_skin,
    EXVS2_EASY_TOOLS_PT_selection,
    EXVS2_EASY_TOOLS_PT_cleanup,
    EXVS2_EASY_TOOLS_PT_maintenance,
    EXVS2_EASY_TOOLS_MT_object_menu,
)
