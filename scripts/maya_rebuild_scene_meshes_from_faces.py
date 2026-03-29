"""
Rebuild all scene meshes as clean face-based copies.
"""

from __future__ import annotations

import time

import maya.api.OpenMaya as om2
import maya.cmds as cmds

DEBUG_LOG = True
DEFAULT_SUFFIX = "_faceRebuilt"
DEBUG_LIST_LIMIT = 12


def _log(message: str) -> None:
    if DEBUG_LOG:
        print(f"[maya_rebuild_scene_meshes_from_faces] {message}", flush=True)


def _t0() -> float:
    return time.perf_counter()


def _stage(label: str, start: float) -> None:
    if DEBUG_LOG:
        print(f"[maya_rebuild_scene_meshes_from_faces] {label}  (+{time.perf_counter() - start:.3f}s)", flush=True)


def _node_leaf_name(node_path: str) -> str:
    return cmds.ls(node_path, long=True)[0].split("|")[-1]


def _api2_dag_path_from_long_name(node_long_name: str, fn_type: int) -> om2.MDagPath:
    target = cmds.ls(node_long_name, long=True)
    if not target:
        raise RuntimeError(f"Node not found: {node_long_name}")
    target_long = target[0]
    dag = om2.MItDag(om2.MItDag.kDepthFirst, fn_type)
    while not dag.isDone():
        path = dag.getPath()
        if path.fullPathName() == target_long:
            return path
        dag.next()
    raise RuntimeError(f"DAG path not found for node: {node_long_name}")


def _mesh_shape_from_transform(mesh_transform: str) -> str:
    shapes = cmds.listRelatives(mesh_transform, shapes=True, fullPath=True, type="mesh", noIntermediate=True) or []
    if len(shapes) != 1:
        raise RuntimeError(f"Expected exactly one non-intermediate mesh shape under transform: {mesh_transform}")
    return cmds.ls(shapes[0], long=True)[0]


def _rebuild_source_shape(mesh_transform: str) -> str:
    return _mesh_shape_from_transform(mesh_transform)


def _is_generated_rebuild_mesh(mesh_transform: str, suffix: str = DEFAULT_SUFFIX) -> bool:
    return _node_leaf_name(mesh_transform).endswith(suffix)


def _scene_mesh_transforms() -> list[str]:
    mesh_shapes = cmds.ls(type="mesh", long=True) or []
    transforms: list[str] = []
    seen: set[str] = set()
    for shape in mesh_shapes:
        if cmds.getAttr(f"{shape}.intermediateObject"):
            continue
        parents = cmds.listRelatives(shape, parent=True, fullPath=True, type="transform") or []
        if len(parents) != 1:
            continue
        transform = cmds.ls(parents[0], long=True)[0]
        if transform in seen:
            continue
        seen.add(transform)
        transforms.append(transform)
    return transforms


def _capture_mesh_data(shape_long: str) -> dict:
    mesh_dag = _api2_dag_path_from_long_name(shape_long, om2.MFn.kMesh)
    mesh_fn = om2.MFnMesh(mesh_dag)
    polygon_counts, polygon_connects = mesh_fn.getVertices()
    points = mesh_fn.getPoints(om2.MSpace.kObject)
    uv_sets: list[dict] = []
    for uv_set_name in mesh_fn.getUVSetNames():
        u_values, v_values = mesh_fn.getUVs(uv_set_name)
        uv_counts, uv_ids = mesh_fn.getAssignedUVs(uv_set_name)
        uv_sets.append(
            {
                "name": uv_set_name,
                "u": list(u_values),
                "v": list(v_values),
                "counts": list(uv_counts),
                "ids": list(uv_ids),
            }
        )
    return {
        "points": points,
        "polygon_counts": list(polygon_counts),
        "polygon_connects": list(polygon_connects),
        "uv_sets": uv_sets,
    }


def _capture_shading_assignments(mesh_transform: str) -> list[dict]:
    shape_long = _mesh_shape_from_transform(mesh_transform)
    shading_groups = list(dict.fromkeys(cmds.listConnections(shape_long, type="shadingEngine") or []))
    assignments: list[dict] = []
    for shading_group in shading_groups:
        members = cmds.sets(shading_group, query=True) or []
        whole_object = False
        face_indexes: list[int] = []
        for member in members:
            expanded = cmds.ls(member, long=True, flatten=True) or []
            for item in expanded:
                if item == mesh_transform or item == shape_long:
                    whole_object = True
                    continue
                if item.startswith(mesh_transform + ".f[") or item.startswith(shape_long + ".f["):
                    face_token = item[item.index("[") + 1 : item.index("]")]
                    face_indexes.append(int(face_token))
        assignments.append(
            {
                "shading_group": shading_group,
                "whole_object": whole_object,
                "face_indexes": sorted(set(face_indexes)),
            }
        )
    return assignments


def _skin_cluster_for_mesh_transform(mesh_transform: str) -> str | None:
    shape_long = _mesh_shape_from_transform(mesh_transform)
    history = cmds.listHistory(shape_long, pruneDagObjects=True) or []
    skins = [cmds.ls(node, long=True)[0] for node in history if cmds.nodeType(node) == "skinCluster"]
    skins = list(dict.fromkeys(skins))
    if not skins:
        return None
    if len(skins) != 1:
        raise RuntimeError(f"Expected exactly one skinCluster in mesh history: {mesh_transform} skinClusters={skins}")
    return skins[0]


def _skin_influence_long_paths(skin_cluster: str) -> list[str]:
    influences = cmds.skinCluster(skin_cluster, query=True, influence=True) or []
    influence_longs: list[str] = []
    for influence in influences:
        long_name = cmds.ls(influence, long=True)
        if not long_name:
            raise RuntimeError(f"Influence does not exist in scene: {influence}")
        influence_longs.append(long_name[0])
    if not influence_longs:
        raise RuntimeError(f"No influences found on source skinCluster: {skin_cluster}")
    return influence_longs


def _skin_cluster_max_influences(skin_cluster: str, default: int = 4) -> int:
    value = cmds.skinCluster(skin_cluster, query=True, maximumInfluences=True)
    if value is None:
        return default
    if isinstance(value, list):
        return int(value[0])
    return int(value)


def _source_skin_settings(skin_cluster: str) -> dict:
    return {
        "max_influences": _skin_cluster_max_influences(skin_cluster),
        "skinning_method": int(cmds.getAttr(f"{skin_cluster}.skinningMethod")),
        "normalize_weights": int(cmds.getAttr(f"{skin_cluster}.normalizeWeights")),
    }


def _get_matrix_attr(node: str, attr: str) -> tuple[float, ...]:
    value = cmds.getAttr(f"{node}.{attr}")
    if not value:
        raise RuntimeError(f"Matrix attribute has no value: {node}.{attr}")
    if isinstance(value, (list, tuple)) and len(value) == 16 and not isinstance(value[0], (list, tuple)):
        row = value
    else:
        row = value[0]
    if not isinstance(row, (list, tuple)) or len(row) != 16:
        raise RuntimeError(f"Unexpected matrix attribute value on {node}.{attr}: {value!r}")
    return tuple(float(v) for v in row)


def _set_matrix_attr(node: str, attr: str, matrix_values: tuple[float, ...]) -> None:
    cmds.setAttr(f"{node}.{attr}", *matrix_values, type="matrix")


def _copy_skin_bind_data(source_skin_cluster: str, target_skin_cluster: str) -> None:
    source_influences = _skin_influence_long_paths(source_skin_cluster)
    target_influences = _skin_influence_long_paths(target_skin_cluster)
    target_index_by_influence = {path: index for index, path in enumerate(target_influences)}
    for source_index, source_influence in enumerate(source_influences):
        if source_influence not in target_index_by_influence:
            raise RuntimeError(f"Target skinCluster missing influence from source bind data: {source_influence}")
        target_index = target_index_by_influence[source_influence]
        bind_pre = _get_matrix_attr(source_skin_cluster, f"bindPreMatrix[{source_index}]")
        _set_matrix_attr(target_skin_cluster, f"bindPreMatrix[{target_index}]", bind_pre)
    source_geom = _get_matrix_attr(source_skin_cluster, "geomMatrix")
    _set_matrix_attr(target_skin_cluster, "geomMatrix", source_geom)


def _build_skin_cluster_from_source(target_mesh_transform: str, source_skin_cluster: str) -> str:
    influences = _skin_influence_long_paths(source_skin_cluster)
    settings = _source_skin_settings(source_skin_cluster)
    cluster = cmds.skinCluster(
        influences,
        target_mesh_transform,
        toSelectedBones=True,
        bindMethod=0,
        maximumInfluences=settings["max_influences"],
        obeyMaxInfluences=True,
        skinMethod=settings["skinning_method"],
        normalizeWeights=settings["normalize_weights"],
        ignoreBindPose=True,
    )[0]
    cluster_long = cmds.ls(cluster, long=True)[0]
    _copy_skin_bind_data(source_skin_cluster, cluster_long)
    return cluster_long


def _copy_skin_weights(source_skin_cluster: str, target_skin_cluster: str) -> None:
    cmds.copySkinWeights(
        sourceSkin=source_skin_cluster,
        destinationSkin=target_skin_cluster,
        noMirror=True,
        surfaceAssociation="closestPoint",
        influenceAssociation=("name", "oneToOne", "closestJoint"),
        normalize=True,
    )


def _rebuilt_transform_for_source(source_transform: str, new_suffix: str = DEFAULT_SUFFIX) -> str:
    source_transform = cmds.ls(source_transform, long=True)[0]
    source_leaf = _node_leaf_name(source_transform)
    target_leaf = f"{source_leaf}{new_suffix}"
    parent = cmds.listRelatives(source_transform, parent=True, fullPath=True) or []
    if parent:
        matches = cmds.ls(f"{parent[0]}|{target_leaf}", long=True, type="transform") or []
    else:
        matches = cmds.ls(f"|{target_leaf}", long=True, type="transform") or []
    if len(matches) != 1:
        raise RuntimeError(f"Expected exactly one rebuilt transform for source: {source_transform} targetLeaf={target_leaf}")
    rebuilt_transform = matches[0]
    _mesh_shape_from_transform(rebuilt_transform)
    return rebuilt_transform


def _copy_transform_state(source_transform: str, target_transform: str) -> None:
    cmds.xform(
        target_transform,
        matrix=cmds.xform(source_transform, query=True, matrix=True, objectSpace=True),
        objectSpace=True,
    )
    cmds.setAttr(f"{target_transform}.rotateOrder", cmds.getAttr(f"{source_transform}.rotateOrder"))
    for attr in ("visibility", "inheritsTransform"):
        if cmds.attributeQuery(attr, node=source_transform, exists=True):
            cmds.setAttr(f"{target_transform}.{attr}", cmds.getAttr(f"{source_transform}.{attr}"))
    rotate_pivot = cmds.xform(source_transform, query=True, rotatePivot=True, objectSpace=True)
    scale_pivot = cmds.xform(source_transform, query=True, scalePivot=True, objectSpace=True)
    rotate_pivot_translation = cmds.xform(source_transform, query=True, rotateTranslation=True, objectSpace=True)
    scale_pivot_translation = cmds.xform(source_transform, query=True, scaleTranslation=True, objectSpace=True)
    cmds.xform(target_transform, rotatePivot=rotate_pivot, objectSpace=True)
    cmds.xform(target_transform, scalePivot=scale_pivot, objectSpace=True)
    cmds.xform(target_transform, rotateTranslation=rotate_pivot_translation, objectSpace=True)
    cmds.xform(target_transform, scaleTranslation=scale_pivot_translation, objectSpace=True)


def _create_target_transform(source_transform: str, new_leaf_name: str) -> str:
    parent = cmds.listRelatives(source_transform, parent=True, fullPath=True) or []
    if parent:
        existing = cmds.ls(f"{parent[0]}|{new_leaf_name}", long=True) or []
    else:
        existing = cmds.ls(f"|{new_leaf_name}", long=True) or []
    if existing:
        raise RuntimeError(f"Target transform already exists: {existing[0]}")
    parent = cmds.listRelatives(source_transform, parent=True, fullPath=True) or []
    if parent:
        created = cmds.createNode("transform", name=new_leaf_name, parent=parent[0])
    else:
        created = cmds.createNode("transform", name=new_leaf_name)
    created_long = cmds.ls(created, long=True)[0]
    _copy_transform_state(source_transform, created_long)
    return created_long


def _apply_uv_sets(mesh_shape_long: str, uv_sets: list[dict]) -> None:
    mesh_fn = om2.MFnMesh(_api2_dag_path_from_long_name(mesh_shape_long, om2.MFn.kMesh))
    existing = set(mesh_fn.getUVSetNames())
    for index, uv_set in enumerate(uv_sets):
        name = uv_set["name"]
        if index > 0 and name not in existing:
            mesh_fn.createUVSetWithName(name)
            existing.add(name)
        mesh_fn.setUVs(uv_set["u"], uv_set["v"], name)
        mesh_fn.assignUVs(uv_set["counts"], uv_set["ids"], name)
    if uv_sets:
        cmds.polyUVSet(mesh_shape_long, currentUVSet=True, uvSet=uv_sets[0]["name"])


def _apply_shading_assignments(mesh_transform: str, assignments: list[dict]) -> None:
    for item in assignments:
        if item["whole_object"]:
            cmds.sets(mesh_transform, edit=True, forceElement=item["shading_group"])
            continue
        if not item["face_indexes"]:
            continue
        face_components = [f"{mesh_transform}.f[{index}]" for index in item["face_indexes"]]
        cmds.sets(face_components, edit=True, forceElement=item["shading_group"])


def rebuild_mesh_from_faces(mesh_transform: str, new_suffix: str = DEFAULT_SUFFIX) -> dict:
    mesh_transform = cmds.ls(mesh_transform, long=True)[0]
    mesh_shape = _mesh_shape_from_transform(mesh_transform)
    rebuild_source_shape = _rebuild_source_shape(mesh_transform)
    mesh_data = _capture_mesh_data(rebuild_source_shape)
    shading_assignments = _capture_shading_assignments(mesh_transform)
    new_transform = _create_target_transform(mesh_transform, f"{_node_leaf_name(mesh_transform)}{new_suffix}")
    parent_mobject = _api2_dag_path_from_long_name(new_transform, om2.MFn.kTransform).node()
    mesh_fn = om2.MFnMesh()
    mesh_fn.create(
        mesh_data["points"],
        mesh_data["polygon_counts"],
        mesh_data["polygon_connects"],
        parent=parent_mobject,
    )
    new_shape = _mesh_shape_from_transform(new_transform)
    cmds.rename(new_shape, f"{_node_leaf_name(new_transform)}Shape")
    new_shape = _mesh_shape_from_transform(new_transform)
    _apply_uv_sets(new_shape, mesh_data["uv_sets"])
    _apply_shading_assignments(new_transform, shading_assignments)
    return {
        "source_transform": mesh_transform,
        "source_shape": mesh_shape,
        "rebuild_source_shape": rebuild_source_shape,
        "rebuilt_transform": new_transform,
        "rebuilt_shape": new_shape,
    }


def rebuild_all_scene_meshes(new_suffix: str = DEFAULT_SUFFIX) -> list[dict]:
    t0 = _t0()
    all_mesh_transforms = _scene_mesh_transforms()
    mesh_transforms = [mesh for mesh in all_mesh_transforms if not _is_generated_rebuild_mesh(mesh, new_suffix)]
    if not mesh_transforms:
        raise RuntimeError("No source scene meshes found.")
    skipped_meshes = [mesh for mesh in all_mesh_transforms if _is_generated_rebuild_mesh(mesh, new_suffix)]
    _log(f"scene meshes: {len(mesh_transforms)}")
    for index, mesh_transform in enumerate(mesh_transforms, start=1):
        _log(f"  [{index}] {mesh_transform}")
    if skipped_meshes:
        _log(f"skipped rebuilt meshes: {len(skipped_meshes)}")
        for index, mesh_transform in enumerate(skipped_meshes[:DEBUG_LIST_LIMIT], start=1):
            _log(f"  [skip {index}] {mesh_transform}")
    results: list[dict] = []
    for index, mesh_transform in enumerate(mesh_transforms, start=1):
        mesh_t0 = _t0()
        _log(f"rebuild mesh {index}/{len(mesh_transforms)}: {mesh_transform}")
        results.append(rebuild_mesh_from_faces(mesh_transform, new_suffix))
        _stage(f"rebuild mesh {index}/{len(mesh_transforms)} done", mesh_t0)
    _stage("rebuild all scene meshes done", t0)
    return results


def reapply_skin_to_rebuilt_mesh(source_mesh_transform: str, new_suffix: str = DEFAULT_SUFFIX) -> dict:
    source_mesh_transform = cmds.ls(source_mesh_transform, long=True)[0]
    source_skin_cluster = _skin_cluster_for_mesh_transform(source_mesh_transform)
    if source_skin_cluster is None:
        raise RuntimeError(f"No skinCluster found on source mesh: {source_mesh_transform}")
    rebuilt_mesh_transform = _rebuilt_transform_for_source(source_mesh_transform, new_suffix)
    existing_target_skin = _skin_cluster_for_mesh_transform(rebuilt_mesh_transform)
    if existing_target_skin is not None:
        raise RuntimeError(
            f"Rebuilt mesh already has skinCluster, cannot reapply: {rebuilt_mesh_transform} skinCluster={existing_target_skin}"
        )
    rebuilt_skin_cluster = _build_skin_cluster_from_source(rebuilt_mesh_transform, source_skin_cluster)
    _copy_skin_weights(source_skin_cluster, rebuilt_skin_cluster)
    _log(
        f"reapplied skin: sourceMesh={source_mesh_transform} rebuiltMesh={rebuilt_mesh_transform} "
        f"sourceSkin={source_skin_cluster} rebuiltSkin={rebuilt_skin_cluster}"
    )
    return {
        "source_transform": source_mesh_transform,
        "source_skin_cluster": source_skin_cluster,
        "rebuilt_transform": rebuilt_mesh_transform,
        "rebuilt_skin_cluster": rebuilt_skin_cluster,
    }


def reapply_skin_to_all_rebuilt_meshes(new_suffix: str = DEFAULT_SUFFIX) -> list[dict]:
    t0 = _t0()
    all_mesh_transforms = _scene_mesh_transforms()
    source_meshes = [mesh for mesh in all_mesh_transforms if not _is_generated_rebuild_mesh(mesh, new_suffix)]
    skinned_sources = [mesh for mesh in source_meshes if _skin_cluster_for_mesh_transform(mesh) is not None]
    if not skinned_sources:
        raise RuntimeError("No skinned source meshes found for skin reapply.")
    _log(f"reapply skin mesh count: {len(skinned_sources)}")
    results: list[dict] = []
    for index, source_mesh in enumerate(skinned_sources, start=1):
        mesh_t0 = _t0()
        _log(f"reapply skin {index}/{len(skinned_sources)}: {source_mesh}")
        results.append(reapply_skin_to_rebuilt_mesh(source_mesh, new_suffix))
        _stage(f"reapply skin {index}/{len(skinned_sources)} done", mesh_t0)
    _stage("reapply skin to all rebuilt meshes done", t0)
    return results


def run() -> None:
    results = rebuild_all_scene_meshes()
    print("Rebuilt meshes:", flush=True)
    for index, result in enumerate(results, start=1):
        print(f"  [{index}] {result['rebuilt_transform']}", flush=True)


if __name__ == "__main__":
    run()
