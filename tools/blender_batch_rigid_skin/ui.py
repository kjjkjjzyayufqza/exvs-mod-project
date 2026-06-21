from __future__ import annotations

import bpy
from bpy.types import Context, Menu, Panel

from .operators import (
    BATCH_RIGID_SKIN_OT_bind,
    BATCH_RIGID_SKIN_OT_bind_from_pose_bone,
    BATCH_RIGID_SKIN_OT_clear_skin,
    BATCH_RIGID_SKIN_OT_reload_addon,
)
from .properties import NO_BONE_VALUE, armature_has_bone, get_settings


def selected_mesh_count(context: Context) -> int:
    return sum(1 for obj in context.selected_objects if obj.type == "MESH")


def draw_bind_buttons(layout) -> None:
    column = layout.column(align=True)
    column.scale_y = 1.25
    column.operator(
        BATCH_RIGID_SKIN_OT_bind.bl_idname,
        text="Bind Selected Meshes to Bone",
        icon="GROUP_VERTEX",
    )
    row = layout.row(align=True)
    row.operator(
        BATCH_RIGID_SKIN_OT_bind_from_pose_bone.bl_idname,
        text="Use Active Pose Bone",
        icon="BONE_DATA",
    )
    row.operator(
        BATCH_RIGID_SKIN_OT_clear_skin.bl_idname,
        text="Clear Skin",
        icon="TRASH",
    )


class BATCH_RIGID_SKIN_PT_panel(Panel):
    bl_label = "Batch Rigid Skin"
    bl_idname = "BATCH_RIGID_SKIN_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Rigid Skin"

    def draw(self, context: Context) -> None:
        settings = get_settings(context)
        layout = self.layout
        layout.use_property_split = True
        layout.use_property_decorate = False
        layout.label(text=f"Selected Meshes: {selected_mesh_count(context)}")
        layout.prop(settings, "armature_object", text="Armature")
        layout.prop(settings, "bone_name", text="Bone")
        layout.prop(settings, "weight")
        layout.prop(settings, "remove_other_groups")
        layout.prop(settings, "add_armature_modifier")
        layout.prop(settings, "normalize")
        if settings.armature_object is None:
            layout.label(text="Pick an armature, or leave one in the scene", icon="INFO")
        elif not armature_has_bone(settings.armature_object, settings.bone_name):
            layout.label(text="Pick a target bone", icon="ERROR")
        elif settings.bone_name == NO_BONE_VALUE:
            layout.label(text="Pick a target bone", icon="ERROR")
        if context.active_pose_bone and context.active_object == settings.armature_object:
            layout.label(text=f"Active Pose Bone: {context.active_pose_bone.name}")
        draw_bind_buttons(layout)
        layout.separator()
        layout.operator(
            BATCH_RIGID_SKIN_OT_reload_addon.bl_idname,
            text="Reload Batch Rigid Skin Addon",
            icon="FILE_REFRESH",
        )


class BATCH_RIGID_SKIN_MT_object_menu(Menu):
    bl_label = "Rigid Skin"
    bl_idname = "BATCH_RIGID_SKIN_MT_object_menu"

    def draw(self, context: Context) -> None:
        layout = self.layout
        layout.operator(
            BATCH_RIGID_SKIN_OT_bind.bl_idname,
            text="Bind Selected Meshes to Bone",
            icon="GROUP_VERTEX",
        )
        layout.operator(
            BATCH_RIGID_SKIN_OT_bind_from_pose_bone.bl_idname,
            text="Bind to Active Pose Bone",
            icon="BONE_DATA",
        )
        layout.separator()
        layout.operator(
            BATCH_RIGID_SKIN_OT_clear_skin.bl_idname,
            text="Clear Skin",
            icon="TRASH",
        )
        layout.operator(
            BATCH_RIGID_SKIN_OT_reload_addon.bl_idname,
            text="Reload Batch Rigid Skin Addon",
            icon="FILE_REFRESH",
        )


def draw_object_context_menu(self, context: Context) -> None:
    self.layout.separator()
    self.layout.menu(BATCH_RIGID_SKIN_MT_object_menu.bl_idname, icon="ARMATURE_DATA")


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
    BATCH_RIGID_SKIN_PT_panel,
    BATCH_RIGID_SKIN_MT_object_menu,
)
