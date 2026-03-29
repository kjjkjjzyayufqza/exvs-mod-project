from __future__ import annotations

import json

import maya.api.OpenMaya as om2
import maya.cmds as cmds

DEFAULT_EXPORT_JSON_PATH = r"E:\XB\解包\com\file\test\test.json"


def _long_name(node: str) -> str:
    result = cmds.ls(node, long=True)
    if not result:
        raise RuntimeError(f"Node not found: {node}")
    return result[0]


def _leaf_name(node_long: str) -> str:
    return node_long.split("|")[-1]


def _path_tokens(node_long: str) -> list[str]:
    return [token for token in node_long.split("|") if token]


def _normalize_token(token: str) -> str:
    return token.split(":")[-1]


def _lineage_data(node_long: str) -> dict:
    tokens = [_normalize_token(token) for token in _path_tokens(node_long)]
    return {
        "lineage_path": "|".join(tokens),
        "lineage_path_no_root": "|".join(tokens[1:]) if len(tokens) > 1 else tokens[0],
    }


def _unique_name_map(nodes_long: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for node_long in nodes_long:
        name = _leaf_name(node_long)
        if name in result:
            raise RuntimeError(f"Duplicate node name detected, cannot match by name: {name}")
        result[name] = node_long
    return result


def _transform_state(transform_long: str) -> dict:
    state = {
        "name": _leaf_name(transform_long),
        "long_name": transform_long,
        "translate": [
            float(cmds.getAttr(f"{transform_long}.translateX")),
            float(cmds.getAttr(f"{transform_long}.translateY")),
            float(cmds.getAttr(f"{transform_long}.translateZ")),
        ],
        "rotate": [
            float(cmds.getAttr(f"{transform_long}.rotateX")),
            float(cmds.getAttr(f"{transform_long}.rotateY")),
            float(cmds.getAttr(f"{transform_long}.rotateZ")),
        ],
        "scale": [
            float(cmds.getAttr(f"{transform_long}.scaleX")),
            float(cmds.getAttr(f"{transform_long}.scaleY")),
            float(cmds.getAttr(f"{transform_long}.scaleZ")),
        ],
        "world_matrix": [float(v) for v in cmds.xform(transform_long, query=True, matrix=True, worldSpace=True)],
        "object_matrix": [float(v) for v in cmds.xform(transform_long, query=True, matrix=True, objectSpace=True)],
        "rotate_order": int(cmds.getAttr(f"{transform_long}.rotateOrder")),
        "visibility": bool(cmds.getAttr(f"{transform_long}.visibility")),
        "inherits_transform": bool(cmds.getAttr(f"{transform_long}.inheritsTransform")),
    }
    state.update(_lineage_data(transform_long))
    return state


def _joint_state(joint_long: str) -> dict:
    state = _transform_state(joint_long)
    state["joint_orient"] = [
        float(cmds.getAttr(f"{joint_long}.jointOrientX")),
        float(cmds.getAttr(f"{joint_long}.jointOrientY")),
        float(cmds.getAttr(f"{joint_long}.jointOrientZ")),
    ]
    return state


def _mesh_shape_from_transform(mesh_transform_long: str) -> str:
    shapes = cmds.listRelatives(mesh_transform_long, shapes=True, fullPath=True, type="mesh", noIntermediate=True) or []
    if len(shapes) != 1:
        raise RuntimeError(f"Expected exactly one non-intermediate mesh shape: {mesh_transform_long}")
    return _long_name(shapes[0])


def _mesh_points(shape_long: str) -> list[list[float]]:
    sel = om2.MSelectionList()
    sel.add(shape_long)
    dag = sel.getDagPath(0)
    mesh_fn = om2.MFnMesh(dag)
    points = mesh_fn.getPoints(om2.MSpace.kObject)
    return [[float(p.x), float(p.y), float(p.z)] for p in points]


def _set_mesh_points(shape_long: str, points_xyz: list[list[float]]) -> None:
    sel = om2.MSelectionList()
    sel.add(shape_long)
    dag = sel.getDagPath(0)
    mesh_fn = om2.MFnMesh(dag)
    if mesh_fn.numVertices != len(points_xyz):
        raise RuntimeError(
            f"Vertex count mismatch for mesh {shape_long}: scene={mesh_fn.numVertices} json={len(points_xyz)}"
        )
    points = om2.MPointArray([om2.MPoint(x, y, z) for x, y, z in points_xyz])
    mesh_fn.setPoints(points, om2.MSpace.kObject)
    mesh_fn.updateSurface()


def export_scene_state_dict() -> dict:
    joint_longs = cmds.ls(type="joint", long=True) or []
    mesh_shapes = cmds.ls(type="mesh", long=True) or []
    mesh_transform_longs: list[str] = []
    seen: set[str] = set()
    for shape in mesh_shapes:
        if cmds.getAttr(f"{shape}.intermediateObject"):
            continue
        parents = cmds.listRelatives(shape, parent=True, fullPath=True, type="transform") or []
        if len(parents) != 1:
            raise RuntimeError(f"Mesh shape has invalid parent count: {shape}")
        transform_long = _long_name(parents[0])
        if transform_long in seen:
            continue
        seen.add(transform_long)
        mesh_transform_longs.append(transform_long)
    joints = [_joint_state(joint_long) for joint_long in joint_longs]
    meshes = []
    for mesh_transform_long in mesh_transform_longs:
        shape_long = _mesh_shape_from_transform(mesh_transform_long)
        meshes.append(
            {
                "name": _leaf_name(mesh_transform_long),
                "long_name": mesh_transform_long,
                "shape_name": _leaf_name(shape_long),
                "shape_long_name": shape_long,
                "transform": _transform_state(mesh_transform_long),
                "points": _mesh_points(shape_long),
            }
        )
    return {
        "joints": joints,
        "meshes": meshes,
    }


def export_scene_state_json(indent: int = 2) -> str:
    return json.dumps(export_scene_state_dict(), ensure_ascii=False, indent=indent)


def print_scene_state_json(indent: int = 2) -> None:
    print(export_scene_state_json(indent=indent), flush=True)


def export_scene_state_to_file(path: str = DEFAULT_EXPORT_JSON_PATH, indent: int = 2) -> str:
    scene_json = export_scene_state_json(indent=indent)
    with open(path, "w", encoding="utf-8") as f:
        f.write(scene_json)
    return path


def _apply_transform_state(node_long: str, state: dict) -> None:
    cmds.setAttr(f"{node_long}.rotateOrder", int(state["rotate_order"]))
    cmds.xform(node_long, matrix=state["world_matrix"], worldSpace=True)
    cmds.setAttr(f"{node_long}.visibility", bool(state["visibility"]))
    cmds.setAttr(f"{node_long}.inheritsTransform", bool(state["inherits_transform"]))


def _apply_joint_state(joint_long: str, state: dict) -> None:
    _apply_transform_state(joint_long, state)
    joint_orient = state["joint_orient"]
    cmds.setAttr(f"{joint_long}.jointOrientX", float(joint_orient[0]))
    cmds.setAttr(f"{joint_long}.jointOrientY", float(joint_orient[1]))
    cmds.setAttr(f"{joint_long}.jointOrientZ", float(joint_orient[2]))


def apply_scene_state_dict(scene_state: dict) -> dict:
    if "joints" not in scene_state or "meshes" not in scene_state:
        raise RuntimeError("Invalid scene state: expected keys 'joints' and 'meshes'")
    scene_joint_longs = cmds.ls(type="joint", long=True) or []
    scene_mesh_shapes = cmds.ls(type="mesh", long=True) or []
    scene_mesh_transform_longs: list[str] = []
    seen: set[str] = set()
    for shape in scene_mesh_shapes:
        if cmds.getAttr(f"{shape}.intermediateObject"):
            continue
        parents = cmds.listRelatives(shape, parent=True, fullPath=True, type="transform") or []
        if len(parents) != 1:
            raise RuntimeError(f"Mesh shape has invalid parent count: {shape}")
        transform_long = _long_name(parents[0])
        if transform_long in seen:
            continue
        seen.add(transform_long)
        scene_mesh_transform_longs.append(transform_long)
    joints_by_name = _unique_name_map(scene_joint_longs)
    meshes_by_name = _unique_name_map(scene_mesh_transform_longs)
    applied_joint_count = 0
    for joint_state in scene_state["joints"]:
        name = joint_state["name"]
        if name not in joints_by_name:
            raise RuntimeError(f"Joint missing in scene for apply: {name}")
        _apply_joint_state(joints_by_name[name], joint_state)
        applied_joint_count += 1
    applied_mesh_count = 0
    for mesh_state in scene_state["meshes"]:
        name = mesh_state["name"]
        if name not in meshes_by_name:
            raise RuntimeError(f"Mesh transform missing in scene for apply: {name}")
        mesh_transform_long = meshes_by_name[name]
        _apply_transform_state(mesh_transform_long, mesh_state["transform"])
        shape_long = _mesh_shape_from_transform(mesh_transform_long)
        _set_mesh_points(shape_long, mesh_state["points"])
        applied_mesh_count += 1
    return {
        "applied_joints": applied_joint_count,
        "applied_meshes": applied_mesh_count,
    }


def apply_scene_state_json(scene_state_json: str) -> dict:
    return apply_scene_state_dict(json.loads(scene_state_json))


def run_export() -> None:
    output_path = export_scene_state_to_file()
    print(output_path, flush=True)


'''
script_globals = {"__name__": "maya_scene_state_json_bridge"}
exec(
    compile(
        open(r"E:/TAURI_PROJECT/scripts/maya_scene_state_json_bridge.py", encoding="utf-8").read(),
        r"E:/TAURI_PROJECT/scripts/maya_scene_state_json_bridge.py",
        "exec",
    ),
    script_globals,
)
script_globals["run_export"]()
'''