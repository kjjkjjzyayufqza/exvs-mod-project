from __future__ import annotations

import json
import re

import maya.cmds as cmds

PREFIX = "m"
DEFAULT_APPLY = True
PBR_PATTERN = re.compile(r"pbr[_-]?(\d+)", re.IGNORECASE)
TOP_TAG = "pbr1"
BOTTOM_TAG = "pbr2"


def _leaf_name(path: str) -> str:
    return path.split("|")[-1]


def _long_name(node: str) -> str:
    names = cmds.ls(node, long=True) or []
    if not names:
        raise RuntimeError(f"Node not found: {node}")
    return names[0]


def _mesh_transforms() -> list[str]:
    mesh_shapes = cmds.ls(type="mesh", long=True) or []
    transforms: list[str] = []
    seen: set[str] = set()
    for shape in mesh_shapes:
        if cmds.getAttr(f"{shape}.intermediateObject"):
            continue
        parents = cmds.listRelatives(shape, parent=True, fullPath=True, type="transform") or []
        if len(parents) != 1:
            continue
        transform = _long_name(parents[0])
        if transform in seen:
            continue
        seen.add(transform)
        transforms.append(transform)
    transforms.sort()
    return transforms


def _shape_from_transform(transform: str) -> str:
    shapes = cmds.listRelatives(transform, shapes=True, fullPath=True, type="mesh", noIntermediate=True) or []
    if len(shapes) != 1:
        raise RuntimeError(f"Expected exactly one non-intermediate mesh shape under transform: {transform}")
    return _long_name(shapes[0])


def _materials_for_shape(shape: str) -> list[str]:
    shading_groups = cmds.listConnections(shape, type="shadingEngine") or []
    shading_groups = list(dict.fromkeys(shading_groups))
    materials: list[str] = []
    for sg in shading_groups:
        shaders = cmds.listConnections(f"{sg}.surfaceShader", source=True, destination=False) or []
        for shader in shaders:
            materials.append(_leaf_name(_long_name(shader)))
    materials = sorted(set(materials))
    if not materials:
        raise RuntimeError(f"No material connected for shape: {shape}")
    return materials


def _texture_paths_for_material(material: str) -> list[str]:
    history = cmds.listHistory(_long_name(material), pruneDagObjects=False) or []
    file_nodes = [node for node in history if cmds.nodeType(node) == "file"]
    paths: list[str] = []
    for file_node in file_nodes:
        attr = f"{file_node}.fileTextureName"
        if not cmds.objExists(attr):
            continue
        value = cmds.getAttr(attr)
        if value:
            paths.append(str(value))
    unique_paths = sorted(set(paths))
    if not unique_paths:
        raise RuntimeError(f"No file texture found in material history: {material}")
    return unique_paths


def _texture_paths_for_materials(materials: list[str]) -> list[str]:
    paths: list[str] = []
    for material in materials:
        paths.extend(_texture_paths_for_material(material))
    unique_paths = sorted(set(paths))
    if not unique_paths:
        raise RuntimeError(f"No texture path found for materials: {materials}")
    return unique_paths


def _pbr_tag_from_texture_paths(texture_paths: list[str]) -> str:
    pbr_ids: set[int] = set()
    for path in texture_paths:
        match = PBR_PATTERN.search(path)
        if match:
            pbr_ids.add(int(match.group(1)))
    if not pbr_ids:
        raise RuntimeError(f"Cannot parse pbr number from texture paths: {texture_paths}")
    if len(pbr_ids) != 1:
        raise RuntimeError(f"Multiple pbr numbers found in one mesh textures: {sorted(pbr_ids)} from {texture_paths}")
    pbr_id = next(iter(pbr_ids))
    return f"pbr{pbr_id}"


def scan_scene_meshes() -> list[dict]:
    meshes: list[dict] = []
    for transform in _mesh_transforms():
        shape = _shape_from_transform(transform)
        materials = _materials_for_shape(shape)
        texture_paths = _texture_paths_for_materials(materials)
        tag = _pbr_tag_from_texture_paths(texture_paths)
        meshes.append(
            {
                "transform": transform,
                "shape": shape,
                "materials": materials,
                "texture_paths": texture_paths,
                "tag": tag,
            }
        )
    return meshes


def build_rename_plan(meshes: list[dict], prefix: str = PREFIX) -> list[dict]:
    counters: dict[str, int] = {}
    plan: list[dict] = []
    for item in meshes:
        tag = item["tag"]
        counters[tag] = counters.get(tag, 0) + 1
        target_leaf = f"{prefix}_{tag}_{counters[tag]:03d}"
        plan.append(
            {
                "source_transform": item["transform"],
                "source_shape": item["shape"],
                "tag": tag,
                "materials": item["materials"],
                "texture_paths": item["texture_paths"],
                "target_transform_leaf": target_leaf,
                "target_shape_leaf": f"{target_leaf}Shape",
            }
        )
    return plan


def apply_rename_plan(plan: list[dict]) -> list[dict]:
    renamed: list[dict] = []
    temp_items: list[dict] = []
    for index, item in enumerate(plan, start=1):
        source_transform = _long_name(item["source_transform"])
        temp_name = f"__tmp_mesh_rename_{index:04d}__"
        temp_transform = cmds.rename(source_transform, temp_name)
        temp_items.append({**item, "temp_transform": _long_name(temp_transform)})
    for item in temp_items:
        final_transform = cmds.rename(item["temp_transform"], item["target_transform_leaf"])
        final_transform_long = _long_name(final_transform)
        final_shape = _shape_from_transform(final_transform_long)
        renamed_shape = cmds.rename(final_shape, item["target_shape_leaf"])
        renamed.append(
            {
                "source_transform": item["source_transform"],
                "target_transform": final_transform_long,
                "target_shape": _long_name(renamed_shape),
                "tag": item["tag"],
                "materials": item["materials"],
                "texture_paths": item["texture_paths"],
            }
        )
    return renamed


def _parent_key(transform: str) -> str:
    parents = cmds.listRelatives(transform, parent=True, fullPath=True, type="transform") or []
    if parents:
        return _long_name(parents[0])
    return "__WORLD__"


def reorder_by_tag_priority(renamed_items: list[dict]) -> None:
    grouped: dict[str, list[dict]] = {}
    for item in renamed_items:
        transform = _long_name(item["target_transform"])
        parent = _parent_key(transform)
        grouped.setdefault(parent, []).append({**item, "target_transform": transform})

    for siblings in grouped.values():
        top_items = sorted(
            (item for item in siblings if item["tag"] == TOP_TAG),
            key=lambda item: _leaf_name(item["target_transform"]),
        )
        bottom_items = sorted(
            (item for item in siblings if item["tag"] == BOTTOM_TAG),
            key=lambda item: _leaf_name(item["target_transform"]),
        )
        for item in reversed(top_items):
            cmds.reorder(item["target_transform"], front=True)
        for item in bottom_items:
            cmds.reorder(item["target_transform"], back=True)


def run(apply: bool = DEFAULT_APPLY, prefix: str = PREFIX) -> dict:
    meshes = scan_scene_meshes()
    plan = build_rename_plan(meshes, prefix=prefix)
    tag_counts: dict[str, int] = {}
    for item in plan:
        tag = item["tag"]
        tag_counts[tag] = tag_counts.get(tag, 0) + 1
    result = {
        "mesh_count": len(meshes),
        "apply": bool(apply),
        "prefix": prefix,
        "tag_counts": tag_counts,
        "plan": plan,
    }
    if apply:
        renamed = apply_rename_plan(plan)
        reorder_by_tag_priority(renamed)
        result["renamed"] = renamed
        result["reorder"] = {"top_tag": TOP_TAG, "bottom_tag": BOTTOM_TAG}
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    return result

'''
script_globals = {"__name__": "maya_fast_rename_meshes_by_material"}
exec(
    compile(
        open(r"E:/TAURI_PROJECT/scripts/maya_fast_rename_meshes_by_material.py", encoding="utf-8").read(),
        r"E:/TAURI_PROJECT/scripts/maya_fast_rename_meshes_by_material.py",
        "exec",
    ),
    script_globals,
)

script_globals["run"](apply=True)
'''