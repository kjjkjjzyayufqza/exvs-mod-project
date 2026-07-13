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


def bone_items(self: "Exvs2EasyToolsSettings", context: Context):
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
        items = ((NO_BONE_VALUE, "No Bone", "Select a target bone"),) + tuple(
            (bone.name, bone.name, "") for bone in bones
        )

    _BONE_ENUM_CACHE[cache_key] = items
    return items


def on_armature_updated(self: "Exvs2EasyToolsSettings", context: Context) -> None:
    _BONE_ENUM_CACHE.clear()
    if self.armature_object is None:
        return
    if not armature_has_bone(self.armature_object, self.bone_name):
        self.bone_name = preferred_bone_name(context, self.armature_object)


def get_settings(context: Context) -> "Exvs2EasyToolsSettings":
    return context.scene.exvs2_easy_tools_settings


def init_settings_for_bind(context: Context) -> "Exvs2EasyToolsSettings":
    settings = get_settings(context)
    if settings.armature_object is None or settings.armature_object.type != "ARMATURE":
        auto_armature = preferred_scene_armature(context, settings.armature_object)
        if auto_armature is not None:
            settings.armature_object = auto_armature
    if not armature_has_bone(settings.armature_object, settings.bone_name):
        settings.bone_name = preferred_bone_name(context, settings.armature_object)
    return settings


class Exvs2EasyToolsSettings(PropertyGroup):
    motion_model_armature: PointerProperty(
        name="A Model Armature",
        type=bpy.types.Object,
        poll=is_armature_object,
        description="Armature already used by the model meshes",
    )
    motion_source_armature: PointerProperty(
        name="B Motion Armature",
        type=bpy.types.Object,
        poll=is_armature_object,
        description="Armature whose active Action will be copied to A",
    )
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
        description="Keep only the target bone vertex group on bound meshes",
    )
    add_armature_modifier: BoolProperty(
        name="Add Armature Modifier",
        default=True,
        description="Add an Armature modifier when the mesh has none",
    )
    retarget_existing_modifiers: BoolProperty(
        name="Retarget Existing Modifiers",
        default=True,
        description="Point existing Armature modifiers at the chosen armature",
    )
    parent_to_armature: BoolProperty(
        name="Parent Meshes to Armature",
        default=False,
        description="Set the armature as the object parent after binding",
    )
    keep_parent_transform: BoolProperty(
        name="Keep Transform When Parenting",
        default=True,
        description="Preserve mesh world transforms when assigning the parent",
    )
    normalize: BoolProperty(
        name="Normalize After Bind",
        default=False,
        description="Run Blender vertex group normalization after binding",
    )
    selection_scope: EnumProperty(
        name="Selection Scope",
        items=(
            ("SCENE", "Scene", "Search every mesh object in the scene"),
            ("SELECTED", "Selected", "Search only the current mesh selection"),
        ),
        default="SCENE",
        description="Mesh scope used by selection helper actions",
    )
    include_hidden: BoolProperty(
        name="Include Hidden",
        default=False,
        description="Allow selection helper actions to include hidden objects",
    )


def register_properties() -> None:
    bpy.types.Scene.exvs2_easy_tools_settings = PointerProperty(
        type=Exvs2EasyToolsSettings
    )


def unregister_properties() -> None:
    _BONE_ENUM_CACHE.clear()
    if hasattr(bpy.types.Scene, "exvs2_easy_tools_settings"):
        del bpy.types.Scene.exvs2_easy_tools_settings


CLASSES = (Exvs2EasyToolsSettings,)
