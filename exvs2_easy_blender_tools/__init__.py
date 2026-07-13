from __future__ import annotations

bl_info = {
    "name": "EXVS2-Easy-Blender-Tools",
    "author": "OpenAI",
    "version": (1, 5, 0),
    "blender": (5, 1, 0),
    "location": "View3D > Sidebar > EXVS2 Tools",
    "description": "EXVS2 motion binding, mesh, armature, and rigid skin workflow helpers",
    "warning": "",
    "category": "Rigging",
}

import bpy

if "properties" in locals():
    import importlib

    importlib.reload(properties)
    importlib.reload(operators)
    importlib.reload(ui)
else:
    from . import operators, properties, ui

CLASSES = (*properties.CLASSES, *operators.CLASSES, *ui.CLASSES)


def register() -> None:
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    properties.register_properties()
    ui.register_ui()


def unregister() -> None:
    ui.unregister_ui()
    properties.unregister_properties()
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
