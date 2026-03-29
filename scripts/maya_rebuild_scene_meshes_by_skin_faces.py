"""
Rebuild skinned meshes by splitting faces into new meshes per dominant influence.
"""

from __future__ import annotations

import time

import maya.api.OpenMaya as om2
import maya.api.OpenMayaAnim as oma2
import maya.cmds as cmds

DEBUG_LOG = True
DEFAULT_SUFFIX = "_skinFaceGrouped"


def _log(message: str) -> None:
    if DEBUG_LOG:
        print(f"[maya_rebuild_scene_meshes_by_skin_faces] {message}", flush=True)


def _t0() -> float:
    return time.perf_counter()


def _stage(label: str, start: float) -> None:
    if DEBUG_LOG:
        print(f"[maya_rebuild_scene_meshes_by_skin_faces] {label}  (+{time.perf_counter() - start:.3f}s)", flush=True)


def _node_leaf_name(node_path: str) -> str:
    result = cmds.ls(node_path, long=True)
    if not result:
        raise RuntimeError(f"Node not found: {node_path}")
    return result[0].split("|")[-1]


def _joint_leaf_name(joint_path: str) -> str:
    return _node_leaf_name(joint_path).split(":")[-1]


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


def _skin_cluster_for_mesh_transform(mesh_transform: str) -> str:
    shape_long = _mesh_shape_from_transform(mesh_transform)
    history = cmds.listHistory(shape_long, pruneDagObjects=True) or []
    skins = [node for node in history if cmds.nodeType(node) == "skinCluster"]
    skins = list(dict.fromkeys(cmds.ls(skins, long=True) or []))
    if not skins:
        raise RuntimeError(f"No skinCluster found for mesh transform: {mesh_transform}")
    if len(skins) != 1:
        raise RuntimeError(f"Expected exactly one skinCluster in mesh history: {mesh_transform} skinClusters={skins}")
    return skins[0]


def _api2_skin_fn(skin_cluster_name: str) -> oma2.MFnSkinCluster:
    short = None
    if cmds.objExists(skin_cluster_name):
        short = cmds.ls(skin_cluster_name, shortNames=True)[0]
    if short is None:
        raise RuntimeError(f"Skin cluster not found for API2: {skin_cluster_name}")
    sel = om2.MSelectionList()
    sel.add(short)
    mobj = sel.getDependNode(0)
    fn = oma2.MFnSkinCluster()
    fn.setObject(mobj)
    return fn


def _api2_vertex_component_all(mesh_dag: om2.MDagPath) -> tuple[om2.MObject, int]:
    mesh_fn = om2.MFnMesh(mesh_dag)
    vertex_count = mesh_fn.numVertices
    comp_fn = om2.MFnSingleIndexedComponent()
    comp_fn.create(om2.MFn.kMeshVertComponent)
    comp_fn.addElements(list(range(vertex_count)))
    return comp_fn.object(), vertex_count


def _api2_get_full_flat_weights(
    skin_fn: oma2.MFnSkinCluster,
    mesh_dag: om2.MDagPath,
    vertex_comp: om2.MObject,
    vertex_count: int,
) -> tuple[om2.MDoubleArray, int]:
    result = skin_fn.getWeights(mesh_dag, vertex_comp)
    if isinstance(result, tuple):
        flat_weights, influence_count = result[0], int(result[1])
    else:
        flat_weights = result
        influence_count = len(flat_weights) // vertex_count if vertex_count else 0
    expected_len = vertex_count * influence_count
    if len(flat_weights) != expected_len:
        raise RuntimeError(
            f"getWeights flat length {len(flat_weights)} != vertex_count*influence_count "
            f"({vertex_count}*{influence_count}={expected_len})"
        )
    if influence_count != len(skin_fn.influenceObjects()):
        raise RuntimeError("Influence count mismatch between getWeights and influenceObjects().")
    return flat_weights, influence_count


def _sanitize_name(value: str) -> str:
    return value.replace(":", "_").replace("|", "_")


def _is_generated_split_mesh(mesh_transform: str, suffix: str = DEFAULT_SUFFIX) -> bool:
    return f"{suffix}__" in _node_leaf_name(mesh_transform)


def _scene_skinned_mesh_transforms() -> list[str]:
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
        _skin_cluster_for_mesh_transform(transform)
        transforms.append(transform)
    return transforms


def _group_faces_by_dominant_influence(mesh_transform: str, skin_cluster: str) -> dict[str, list[int]]:
    shape_long = _mesh_shape_from_transform(mesh_transform)
    mesh_dag = _api2_dag_path_from_long_name(shape_long, om2.MFn.kMesh)
    skin_fn = _api2_skin_fn(skin_cluster)
    vertex_comp, vertex_count = _api2_vertex_component_all(mesh_dag)
    flat_weights, influence_count = _api2_get_full_flat_weights(skin_fn, mesh_dag, vertex_comp, vertex_count)
    influences = [skin_fn.influenceObjects()[i].fullPathName() for i in range(len(skin_fn.influenceObjects()))]
    if len(influences) != influence_count:
        raise RuntimeError(
            f"Influence count mismatch: skinFn={len(influences)} weights={influence_count} skin={skin_cluster}"
        )
    face_it = om2.MItMeshPolygon(mesh_dag)
    groups: dict[str, list[int]] = {}
    zero_faces: list[int] = []
    while not face_it.isDone():
        face_index = int(face_it.index())
        vertices = [int(v) for v in face_it.getVertices()]
        if not vertices:
            face_it.next()
            continue
        sums = [0.0] * influence_count
        for vertex_index in vertices:
            base = vertex_index * influence_count
            for influence_index in range(influence_count):
                sums[influence_index] += float(flat_weights[base + influence_index])
        best_index = max(range(influence_count), key=lambda i: sums[i])
        best_value = sums[best_index]
        if best_value <= 0.0:
            zero_faces.append(face_index)
            face_it.next()
            continue
        influence_path = influences[best_index]
        groups.setdefault(influence_path, []).append(face_index)
        face_it.next()
    if zero_faces:
        raise RuntimeError(
            f"Found faces without any skin influence contribution on mesh: {mesh_transform} "
            f"count={len(zero_faces)} sample={zero_faces[:10]}"
        )
    return groups


def _duplicate_mesh_keep_faces(source_mesh: str, face_indices_to_keep: list[int], target_name: str) -> str:
    duplicated = cmds.duplicate(
        source_mesh,
        name=target_name,
        upstreamNodes=False,
        inputConnections=False,
        returnRootsOnly=True,
    )
    if not duplicated:
        raise RuntimeError(f"Failed to duplicate mesh: {source_mesh}")
    mesh_dup = cmds.ls(duplicated[0], long=True)[0]
    total_faces = int(cmds.polyEvaluate(mesh_dup, face=True))
    keep_set = set(int(v) for v in face_indices_to_keep)
    delete_components = [f"{mesh_dup}.f[{i}]" for i in range(total_faces) if i not in keep_set]
    if delete_components:
        cmds.delete(delete_components)
    cmds.delete(mesh_dup, constructionHistory=True)
    new_shape = _mesh_shape_from_transform(mesh_dup)
    cmds.rename(new_shape, f"{_node_leaf_name(mesh_dup)}Shape")
    return cmds.ls(mesh_dup, long=True)[0]


def _bind_mesh_to_single_influence(mesh_transform: str, influence_path: str) -> str:
    influence_long = cmds.ls(influence_path, long=True)
    if not influence_long:
        raise RuntimeError(f"Influence not found for binding: {influence_path}")
    cluster = cmds.skinCluster(
        influence_long[0],
        mesh_transform,
        toSelectedBones=True,
        bindMethod=0,
        maximumInfluences=1,
        obeyMaxInfluences=True,
        normalizeWeights=1,
        ignoreBindPose=True,
    )[0]
    skin_cluster = cmds.ls(cluster, long=True)[0]
    vertex_count = int(cmds.polyEvaluate(mesh_transform, vertex=True))
    if vertex_count > 0:
        components = [f"{mesh_transform}.vtx[{index}]" for index in range(vertex_count)]
        cmds.skinPercent(
            skin_cluster,
            components,
            transformValue=[(influence_long[0], 1.0)],
            normalize=True,
            zeroRemainingInfluences=True,
        )
    return skin_cluster


def rebuild_mesh_by_skin_faces(mesh_transform: str, new_suffix: str = DEFAULT_SUFFIX) -> dict:
    mesh_transform = cmds.ls(mesh_transform, long=True)[0]
    skin_cluster = _skin_cluster_for_mesh_transform(mesh_transform)
    face_groups = _group_faces_by_dominant_influence(mesh_transform, skin_cluster)
    source_leaf = _node_leaf_name(mesh_transform)
    rebuilt_meshes: list[dict] = []
    for influence_path, face_indices in sorted(face_groups.items(), key=lambda item: len(item[1]), reverse=True):
        influence_leaf = _sanitize_name(_joint_leaf_name(influence_path))
        target_name = f"{source_leaf}{new_suffix}__{influence_leaf}"
        rebuilt_transform = _duplicate_mesh_keep_faces(mesh_transform, face_indices, target_name)
        rebuilt_skin = _bind_mesh_to_single_influence(rebuilt_transform, influence_path)
        rebuilt_meshes.append(
            {
                "influence": influence_path,
                "rebuilt_transform": rebuilt_transform,
                "rebuilt_skin_cluster": rebuilt_skin,
                "face_count": len(face_indices),
            }
        )
    return {
        "source_transform": mesh_transform,
        "skin_cluster": skin_cluster,
        "group_count": len(rebuilt_meshes),
        "rebuilt_meshes": rebuilt_meshes,
    }


def rebuild_all_scene_meshes_by_skin_faces(new_suffix: str = DEFAULT_SUFFIX) -> list[dict]:
    t0 = _t0()
    all_skinned_meshes = _scene_skinned_mesh_transforms()
    mesh_transforms = [mesh for mesh in all_skinned_meshes if not _is_generated_split_mesh(mesh, new_suffix)]
    if not mesh_transforms:
        raise RuntimeError("No source skinned scene meshes found.")
    _log(f"scene skinned meshes: {len(mesh_transforms)}")
    for index, mesh_transform in enumerate(mesh_transforms, start=1):
        _log(f"  [{index}] {mesh_transform}")
    results: list[dict] = []
    for index, mesh_transform in enumerate(mesh_transforms, start=1):
        mesh_t0 = _t0()
        _log(f"rebuild-by-skin mesh {index}/{len(mesh_transforms)}: {mesh_transform}")
        results.append(rebuild_mesh_by_skin_faces(mesh_transform, new_suffix))
        _stage(f"rebuild-by-skin mesh {index}/{len(mesh_transforms)} done", mesh_t0)
    _stage("rebuild all scene meshes by skin faces done", t0)
    return results


def run() -> None:
    results = rebuild_all_scene_meshes_by_skin_faces()
    print("Rebuilt meshes by skin-face groups:", flush=True)
    for result in results:
        print(f"  source: {result['source_transform']} groups={result['group_count']}", flush=True)


if __name__ == "__main__":
    run()

'''
script_globals = {"__name__": "maya_rebuild_scene_meshes_by_skin_faces"}
exec(
    compile(
        open(r"E:/TAURI_PROJECT/scripts/maya_rebuild_scene_meshes_by_skin_faces.py", encoding="utf-8").read(),
        r"E:/TAURI_PROJECT/scripts/maya_rebuild_scene_meshes_by_skin_faces.py",
        "exec",
    ),
    script_globals,
)

script_globals["run"]()
'''