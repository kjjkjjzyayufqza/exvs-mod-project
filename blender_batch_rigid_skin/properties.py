from __future__ import annotations

import bpy
from bpy.props import BoolProperty, EnumProperty, FloatProperty, PointerProperty
from bpy.types import Context, Object, PropertyGroup

NO_BONE_VALUE = "__NONE__"

# Rebuild bone enum at most once per redraw when the armature changes.
_BONE_ENUM_CACHE: dict[str, tuple[tuple[str, str, str], ...]] = {}


def is_armature_object(_self: PropertyGroup, obj: Object | None) -> bool:
    return obj is not None and obj.type == "ARMATURE"


def selected_armatures(context: Context) -> list[Object]:
    return [obj for obj in context.selected_objects if obj.type == "ARMATURE"]


def scene_armatures(context: Context) -> list[Object]:
    return [obj for obj in context.scene.objects if obj.type == "ARMATURE"]


def preferred_scene_armature(
    context: Context, current: Object | None
) -> Object | None:
    selected = selected_armatures(context)
    if len(selected) == 1:
        return selected[0]
    if current is not None and current.type == "ARMATURE":
        return current
    armatures = scene_armatures(context)
    if len(armatures) == 1:
        return armatures[0]
    return None


def armature_has_bone(armature: Object | None, bone_name: str) -> bool:
    if armature is None or not bone_name or bone_name == NO_BONE_VALUE:
        return False
    return armature.data.bones.get(bone_name) is not None


def preferred_bone_name(context: Context | None, armature: Object | None) -> str:
    if armature is None:
        return NO_BONE_VALUE
    if context is not None and context.active_object == armature:
        pose_bone = context.active_pose_bone
        if pose_bone and armature_has_bone(armature, pose_bone.name):
            return pose_bone.name
    active_bone = armature.data.bones.active
    if active_bone is not None:
        return active_bone.name
    bones = armature.data.bones
    return bones[0].name if bones else NO_BONE_VALUE


def bone_items(self: "BatchRigidSkinSettings", context: Context):
    armature = self.armature_object
    if armature is None or armature.type != "ARMATURE":
        return [(NO_BONE_VALUE, "No Bone", "Select an armature first")]

    cache_key = f"{armature.name_full}|{len(armature.data.bones)}"
    cached = _BONE_ENUM_CACHE.get(cache_key)
    if cached is not None:
        return cached

    bones = armature.data.bones
    if not bones:
        items = ((NO_BONE_VALUE, "No Bones", "The armature has no bones"),)
    else:
        items = tuple((bone.name, bone.name, "") for bone in bones)

    if self.bone_name and self.bone_name != NO_BONE_VALUE:
        known = {item[0] for item in items}
        if self.bone_name not in known:
            items = ((self.bone_name, self.bone_name, "Current value"),) + items

    _BONE_ENUM_CACHE[cache_key] = items
    return items


def on_armature_updated(self: "BatchRigidSkinSettings", context: Context) -> None:
    _BONE_ENUM_CACHE.clear()
    if self.armature_object is None:
        return
    if not armature_has_bone(self.armature_object, self.bone_name):
        self.bone_name = preferred_bone_name(context, self.armature_object)


def get_settings(context: Context) -> "BatchRigidSkinSettings":
    return context.scene.batch_rigid_skin_settings


def init_settings_for_bind(context: Context) -> "BatchRigidSkinSettings":
    settings = get_settings(context)
    if settings.armature_object is None or settings.armature_object.type != "ARMATURE":
        auto_armature = preferred_scene_armature(context, settings.armature_object)
        if auto_armature is not None:
            settings.armature_object = auto_armature
    if not armature_has_bone(settings.armature_object, settings.bone_name):
        settings.bone_name = preferred_bone_name(context, settings.armature_object)
    return settings


class BatchRigidSkinSettings(PropertyGroup):
    armature_object: PointerProperty(
        name="Armature",
        type=bpy.types.Object,
        poll=is_armature_object,
        update=on_armature_updated,
        description="Armature that owns the target bone",
    )
    bone_name: EnumProperty(
        name="Bone",
        items=bone_items,
        description="Exact bone name for the rigid bind vertex group",
    )
    weight: FloatProperty(
        name="Weight",
        default=1.0,
        min=0.000001,
        max=1.0,
        precision=3,
        description="Rigid bind weight assigned to every vertex",
    )
    remove_other_groups: BoolProperty(
        name="Remove Other Groups",
        default=True,
        description="Recommended for EXVS2 rigid export to keep one influence",
    )
    add_armature_modifier: BoolProperty(
        name="Add Armature Modifier",
        default=True,
        description="Add an Armature modifier when the mesh has none",
    )
    normalize: BoolProperty(
        name="Normalize After Bind",
        default=False,
        description="Run Blender vertex group normalization after binding",
    )


def register_properties() -> None:
    bpy.types.Scene.batch_rigid_skin_settings = PointerProperty(
        type=BatchRigidSkinSettings
    )


def unregister_properties() -> None:
    _BONE_ENUM_CACHE.clear()
    if hasattr(bpy.types.Scene, "batch_rigid_skin_settings"):
        del bpy.types.Scene.batch_rigid_skin_settings


CLASSES = (BatchRigidSkinSettings,)
