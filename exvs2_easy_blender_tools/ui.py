from __future__ import annotations

import bpy
from bpy.types import Context, Menu, Panel

from .operators import (
    EXVS2_EASY_TOOLS_OT_bind,
    EXVS2_EASY_TOOLS_OT_bind_from_pose_bone,
    EXVS2_EASY_TOOLS_OT_clear_skin,
    EXVS2_EASY_TOOLS_OT_keep_target_bone_group,
    EXVS2_EASY_TOOLS_OT_remove_empty_vertex_groups,
    EXVS2_EASY_TOOLS_OT_rename_mesh_data_to_objects,
    EXVS2_EASY_TOOLS_OT_retarget_armature_modifiers,
    EXVS2_EASY_TOOLS_OT_reload_addon,
    EXVS2_EASY_TOOLS_OT_select_meshes_bound_to_bone,
    EXVS2_EASY_TOOLS_OT_select_meshes_using_armature,
    EXVS2_EASY_TOOLS_OT_select_unskinned_meshes,
)
from .properties import NO_BONE_VALUE, armature_has_bone, get_settings


def selected_mesh_count(context: Context) -> int:
    return sum(1 for obj in context.selected_objects if obj.type == "MESH")


def draw_selection_tools(layout, context: Context) -> None:
    settings = get_settings(context)
    box = layout.box()
    box.label(text="Selection Helpers", icon="RESTRICT_SELECT_OFF")
    row = box.row(align=True)
    row.prop(settings, "selection_scope", text="")
    row.prop(settings, "include_hidden")
    column = box.column(align=True)
    column.operator(
        EXVS2_EASY_TOOLS_OT_select_unskinned_meshes.bl_idname,
        text="Select Meshes Without Skin",
        icon="MESH_DATA",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_select_meshes_using_armature.bl_idname,
        text="Select Meshes Using Armature",
        icon="ARMATURE_DATA",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_select_meshes_bound_to_bone.bl_idname,
        text="Select Meshes Bound to Bone",
        icon="BONE_DATA",
    )


def draw_bind_tools(layout, context: Context) -> None:
    settings = get_settings(context)
    box = layout.box()
    box.label(text="Maya-Style Rigid Bind", icon="GROUP_VERTEX")
    box.prop(settings, "armature_object", text="Armature")
    box.prop(settings, "bone_name", text="Bone")
    box.prop(settings, "weight")
    box.prop(settings, "remove_other_groups")
    box.prop(settings, "add_armature_modifier")
    box.prop(settings, "retarget_existing_modifiers")
    box.prop(settings, "parent_to_armature")
    if settings.parent_to_armature:
        box.prop(settings, "keep_parent_transform")
    box.prop(settings, "normalize")
    if settings.armature_object is None:
        box.label(text="Pick an armature, or leave one armature in the scene", icon="INFO")
    elif not armature_has_bone(settings.armature_object, settings.bone_name):
        box.label(text="Pick a target bone", icon="ERROR")
    elif settings.bone_name == NO_BONE_VALUE:
        box.label(text="Pick a target bone", icon="ERROR")
    if context.active_pose_bone and context.active_object == settings.armature_object:
        box.label(text=f"Active Pose Bone: {context.active_pose_bone.name}")
    column = box.column(align=True)
    column.scale_y = 1.15
    column.operator(
        EXVS2_EASY_TOOLS_OT_bind.bl_idname,
        text="Bind Selected Meshes to Bone",
        icon="GROUP_VERTEX",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_bind_from_pose_bone.bl_idname,
        text="Bind to Active Pose Bone",
        icon="BONE_DATA",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_retarget_armature_modifiers.bl_idname,
        text="Retarget Armature Modifiers",
        icon="MOD_ARMATURE",
    )


def draw_cleanup_tools(layout) -> None:
    box = layout.box()
    box.label(text="Cleanup for Export", icon="BRUSH_DATA")
    column = box.column(align=True)
    column.operator(
        EXVS2_EASY_TOOLS_OT_keep_target_bone_group.bl_idname,
        text="Keep Only Target Bone Group",
        icon="GROUP_VERTEX",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_remove_empty_vertex_groups.bl_idname,
        text="Remove Empty Vertex Groups",
        icon="X",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_rename_mesh_data_to_objects.bl_idname,
        text="Name Mesh Data from Objects",
        icon="OUTLINER_DATA_MESH",
    )
    column.operator(
        EXVS2_EASY_TOOLS_OT_clear_skin.bl_idname,
        text="Clear Rigid Skin",
        icon="TRASH",
    )


class EXVS2_EASY_TOOLS_PT_panel(Panel):
    bl_label = "EXVS2 Easy Blender Tools"
    bl_idname = "EXVS2_EASY_TOOLS_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "EXVS2 Tools"

    def draw(self, context: Context) -> None:
        layout = self.layout
        layout.use_property_split = True
        layout.use_property_decorate = False
        layout.label(text=f"Selected Meshes: {selected_mesh_count(context)}")
        draw_selection_tools(layout, context)
        draw_bind_tools(layout, context)
        draw_cleanup_tools(layout)
        layout.separator()
        layout.operator(
            EXVS2_EASY_TOOLS_OT_reload_addon.bl_idname,
            text="Reload EXVS2 Easy Blender Tools",
            icon="FILE_REFRESH",
        )


class EXVS2_EASY_TOOLS_MT_object_menu(Menu):
    bl_label = "EXVS2 Easy Blender Tools"
    bl_idname = "EXVS2_EASY_TOOLS_MT_object_menu"

    def draw(self, context: Context) -> None:
        layout = self.layout
        layout.operator(
            EXVS2_EASY_TOOLS_OT_bind.bl_idname,
            text="Bind Selected Meshes to Bone",
            icon="GROUP_VERTEX",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_bind_from_pose_bone.bl_idname,
            text="Bind to Active Pose Bone",
            icon="BONE_DATA",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_retarget_armature_modifiers.bl_idname,
            text="Retarget Armature Modifiers",
            icon="MOD_ARMATURE",
        )
        layout.separator()
        layout.operator(
            EXVS2_EASY_TOOLS_OT_select_unskinned_meshes.bl_idname,
            text="Select Meshes Without Skin",
            icon="MESH_DATA",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_select_meshes_using_armature.bl_idname,
            text="Select Meshes Using Armature",
            icon="ARMATURE_DATA",
        )
        layout.separator()
        layout.operator(
            EXVS2_EASY_TOOLS_OT_keep_target_bone_group.bl_idname,
            text="Keep Only Target Bone Group",
            icon="GROUP_VERTEX",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_remove_empty_vertex_groups.bl_idname,
            text="Remove Empty Vertex Groups",
            icon="X",
        )
        layout.operator(
            EXVS2_EASY_TOOLS_OT_clear_skin.bl_idname,
            text="Clear Rigid Skin",
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
    EXVS2_EASY_TOOLS_MT_object_menu,
)
