"""
使用说明：
1. 将本文件完整复制到 Maya Script Editor 的 Python 标签页中执行。
2. 在 Outliner 或视图中选中一个骨头，作为要复制的骨骼子树根节点。
3. 执行 `run()`，或执行 `copy_joint_skinned_meshes()`。
4. 脚本会复制选中的骨骼子树、复制受该骨骼子树权重影响的 mesh，并删除复制结果中不需要的 mesh faces。
"""

from __future__ import annotations

from collections.abc import Callable
import re
import time

import maya.api.OpenMaya as om2
import maya.api.OpenMayaAnim as oma2
import maya.cmds as cmds

WEIGHT_THRESHOLD = 0.001
DEBUG_LOG = True
ENFORCE_DUPLICATE_INFLUENCES_ONLY = False
USE_DIRECT_SUBTREE_EXTRACTION = True
EXTRACTION_VERTEX_WEIGHT_EPS = 0.0
EXTRACTION_INFLUENCE_SUM_EPS = 0.0
EXTRACTION_HARD_ASSIGN_MAX = False
EXTRACTION_REQUIRE_SUBTREE_EXCLUSIVE = True
EXTRACTION_EXTERNAL_WEIGHT_EPS = 1e-6
FIX_ZERO_WEIGHT_VERTICES = True
ZERO_WEIGHT_EPS = 1e-8

# Progress heartbeat during remap (vertex count).
REMAP_PROGRESS_EVERY_VERTICES = 25000


def _log(msg: str) -> None:
    if DEBUG_LOG:
        print(f"[maya_copy_joint_skin] {msg}", flush=True)


def _t0() -> float:
    return time.perf_counter()


def _stage(label: str, start: float) -> None:
    if DEBUG_LOG:
        print(f"[maya_copy_joint_skin] {label}  (+{time.perf_counter() - start:.3f}s)", flush=True)


def _require_joint_selection() -> str:
    sel = cmds.ls(selection=True, long=True, type="joint")
    if not sel:
        raise RuntimeError("Select exactly one joint (root of the subtree to copy).")
    if len(sel) != 1:
        raise RuntimeError("Select exactly one joint.")
    return sel[0]


def _joint_subtree_dfs(joint_root: str) -> list[str]:
    joint_root = cmds.ls(joint_root, long=True)[0]
    out: list[str] = []

    def dfs(j: str) -> None:
        jl = cmds.ls(j, long=True)[0]
        out.append(jl)
        for k in cmds.listRelatives(jl, children=True, fullPath=True, type="joint") or []:
            dfs(k)

    dfs(joint_root)
    return out


def _relative_suffix_under_root(joint: str, root: str) -> str:
    jl = cmds.ls(joint, long=True)[0]
    rl = cmds.ls(root, long=True)[0]
    if jl == rl:
        return ""
    if not jl.startswith(rl + "|"):
        raise RuntimeError(f"Joint is not under the given root: {joint} root={root}")
    return jl[len(rl) + 1 :]


def _duplicate_joint_subtree(joint_root: str, name_suffix: str) -> tuple[str, dict[str, str]]:
    orig = _joint_subtree_dfs(joint_root)
    short = joint_root.split("|")[-1].split(":")[-1]
    dup_list = cmds.duplicate(
        joint_root,
        name=f"{short}{name_suffix}",
        parentOnly=False,
        returnRootsOnly=True,
    )
    if not dup_list:
        raise RuntimeError(f"Failed to duplicate joint hierarchy: {joint_root}")
    dup_root = cmds.ls(dup_list[0], long=True)[0]
    dup = _joint_subtree_dfs(dup_root)
    if len(dup) != len(orig):
        raise RuntimeError(f"Joint hierarchy size mismatch after duplicate: {len(orig)} vs {len(dup)}")
    by_suf_o = {_relative_suffix_under_root(j, joint_root): j for j in orig}
    by_suf_d = {_relative_suffix_under_root(j, dup_root): j for j in dup}
    if set(by_suf_o.keys()) != set(by_suf_d.keys()):
        raise RuntimeError("Duplicate joint hierarchy path suffixes do not match the original.")
    mapping = {by_suf_o[s]: by_suf_d[s] for s in by_suf_o}
    duplicate_uuid_by_orig: dict[str, str] = {}
    for original_joint, duplicate_joint in mapping.items():
        uuids = cmds.ls(duplicate_joint, uuid=True) or []
        if len(uuids) != 1:
            raise RuntimeError(f"Failed to resolve duplicate joint UUID: {duplicate_joint}")
        duplicate_uuid_by_orig[original_joint] = uuids[0]

    def current_long_from_uuid(node_uuid: str) -> str:
        names = cmds.ls(node_uuid, long=True) or []
        if len(names) != 1:
            raise RuntimeError(f"Failed to resolve joint from UUID: {node_uuid}")
        return names[0]

    for original_joint in mapping:
        duplicate_long = current_long_from_uuid(duplicate_uuid_by_orig[original_joint])
        duplicate_leaf = _joint_leaf_name(duplicate_long)
        if _is_generated_copy_node(duplicate_long, name_suffix):
            continue
        cmds.rename(duplicate_long, f"{duplicate_leaf}{name_suffix}")

    renamed_mapping = {
        original_joint: current_long_from_uuid(duplicate_uuid_by_orig[original_joint])
        for original_joint in mapping
    }
    dup_root = renamed_mapping[joint_root]
    return dup_root, renamed_mapping


def _joint_leaf_name(joint_path: str) -> str:
    return cmds.ls(joint_path, long=True)[0].split("|")[-1].split(":")[-1]


def _node_leaf_name(node_path: str) -> str:
    return cmds.ls(node_path, long=True)[0].split("|")[-1].split(":")[-1]


def _is_generated_copy_node(node_path: str, name_suffix: str) -> bool:
    leaf = _node_leaf_name(node_path)
    return leaf.endswith(name_suffix) or re.search(rf"{re.escape(name_suffix)}\d+$", leaf) is not None


def _skin_percent_transform_name(skin_cluster: str, joint_dag: str) -> str:
    joint_long = cmds.ls(joint_dag, long=True)[0]
    infs_long = _skin_influence_long_paths(skin_cluster)
    if joint_long in infs_long:
        return joint_long
    leaf = joint_long.split("|")[-1].split(":")[-1]
    leaf_hits = [influence for influence in infs_long if _joint_leaf_name(influence) == leaf]
    if len(leaf_hits) == 1:
        return leaf_hits[0]
    raise RuntimeError(f"Joint not in skinCluster {skin_cluster} influences: {joint_dag}")


def _joints_to_skin_influence_paths_for_mesh(
    skin_cluster: str,
    joint_long_paths: list[str],
    shape_long: str,
    allow_leaf_fallback: bool = True,
) -> list[tuple[str, str]]:
    """
    Resolve each joint to a skin influence long path. When several influences share the same
    leaf name, pick the column with the largest max vertex weight on this mesh.
    Returns (selected joint long path, resolved skin influence long path) per joint that influences.
    """
    infs_long = _skin_influence_long_paths(skin_cluster)
    skin_fn = _api2_skin_fn(skin_cluster)
    mesh_dag = _api2_mesh_dag(shape_long)
    vertex_comp, n = _api2_vertex_component_all(mesh_dag)
    flat_weights, inf_count = _api2_get_full_flat_weights(skin_fn, mesh_dag, vertex_comp, n)
    out: list[tuple[str, str]] = []
    for j in joint_long_paths:
        jl = cmds.ls(j, long=True)[0]
        if jl in infs_long:
            out.append((jl, jl))
            continue
        if not allow_leaf_fallback:
            continue
        leaf = _joint_leaf_name(jl)
        leaf_hits = [p for p in infs_long if _joint_leaf_name(p) == leaf]
        if not leaf_hits:
            continue
        if len(leaf_hits) == 1:
            out.append((jl, cmds.ls(leaf_hits[0], long=True)[0]))
            continue
        best_p = leaf_hits[0]
        best_max = -1.0
        for p in leaf_hits:
            col = _influence_index_for_skin_path(skin_cluster, p)
            mx = 0.0
            for vtx in range(n):
                w = float(flat_weights[vtx * inf_count + col])
                if w > mx:
                    mx = w
            if mx > best_max:
                best_max = mx
                best_p = p
        out.append((jl, cmds.ls(best_p, long=True)[0]))
    return out


def _skin_cluster_includes_joint(
    skin_cluster: str,
    joint_long: str,
    allow_leaf_fallback: bool = True,
) -> bool:
    jl = cmds.ls(joint_long, long=True)[0]
    infs_long = _skin_influence_long_paths(skin_cluster)
    if jl in infs_long:
        return True
    if not allow_leaf_fallback:
        return False
    leaf = _joint_leaf_name(jl)
    for inf in infs_long:
        if _joint_leaf_name(inf) == leaf:
            return True
    return False


def _skin_cluster_touches_subtree(
    skin_cluster: str,
    joint_subtree_long: list[str],
    allow_leaf_fallback: bool = True,
) -> bool:
    return any(
        _skin_cluster_includes_joint(skin_cluster, j, allow_leaf_fallback)
        for j in joint_subtree_long
    )


def _mesh_shape_from_transform(mesh_transform: str) -> str:
    shapes = cmds.listRelatives(mesh_transform, shapes=True, fullPath=True, type="mesh", noIntermediate=True)
    if not shapes:
        raise RuntimeError(f"No non-intermediate mesh shape under transform: {mesh_transform}")
    return shapes[0]


def _api2_selection_last_segment_for_add(path: str) -> str:
    """
    Maya 2026 on Windows: MSelectionList.add(full_dag_path) can raise UnicodeDecodeError when the
    binding decodes internal path bytes as UTF-8. Use the last path segment (e.g. ns:nodeName);
    it is usually ASCII and still disambiguates namespaced nodes. Requires unique leaf names.
    """
    return path.split("|")[-1]


def _api2_skin_fn(skin_cluster_name: str) -> oma2.MFnSkinCluster:
    """
    Build MFnSkinCluster without MSelectionList.add(long_dag_path): Windows may decode internal paths as UTF-8.
    If the node exists, resolve its short name with cmds and sel.add(short) — do not require cmds.ls(type='skinCluster'),
    which can return an empty list in some Maya builds while the skin node is still valid.
    Otherwise match by leaf name against all skinCluster nodes (type filter, then nodeType fallback).
    """
    short = None
    if cmds.objExists(skin_cluster_name):
        short = cmds.ls(skin_cluster_name, shortNames=True)[0]
    if short is None:
        want_leaf = _api2_selection_last_segment_for_add(skin_cluster_name).split(":")[-1]
        candidates = cmds.ls(type="skinCluster", long=True) or []
        if not candidates:
            candidates = [n for n in cmds.ls(long=True) if cmds.nodeType(n) == "skinCluster"]
        for sc_long in candidates:
            if sc_long.split("|")[-1].split(":")[-1] == want_leaf:
                short = cmds.ls(sc_long, shortNames=True)[0]
                break
    if short is None:
        raise RuntimeError(f"Skin cluster not found for API2: {skin_cluster_name}")
    sel = om2.MSelectionList()
    sel.add(short)
    mobj = sel.getDependNode(0)
    fn = oma2.MFnSkinCluster()
    fn.setObject(mobj)
    return fn


def _skin_influence_long_paths(skin_cluster_name: str) -> list[str]:
    skin_fn = _api2_skin_fn(skin_cluster_name)
    influence_dags = skin_fn.influenceObjects()
    return [influence_dags[i].fullPathName() for i in range(len(influence_dags))]


def _api2_mesh_dag(shape_long_name: str) -> om2.MDagPath:
    """
    Resolve mesh shape MDagPath without MSelectionList.add on a long path (UTF-8 decode issues).
    Match exact last segment or leaf after ':' (namespaced shape names).
    """
    target = _api2_selection_last_segment_for_add(shape_long_name)
    target_leaf = target.split(":")[-1]
    dag = om2.MItDag(om2.MItDag.kDepthFirst, om2.MFn.kMesh)
    while not dag.isDone():
        path = dag.getPath()
        fn_mesh = om2.MFnMesh(path)
        node_name = fn_mesh.name()
        leaf = node_name.split(":")[-1]
        if node_name == target or leaf == target_leaf:
            return path
        dag.next()
    raise RuntimeError(f"Mesh shape not found for API2 DAG: {shape_long_name}")


def _delete_faces_touching_vertices(mesh_transform: str, vertices: list[int], log_prefix: str) -> int:
    """
    Delete any face that references at least one vertex in `vertices`.
    Use this as a strict cleanup pass to prevent boundary vertices with invalid weights from surviving.
    """
    if not vertices:
        return 0
    vertex_set = set(vertices)
    shape_long = cmds.ls(_mesh_shape_from_transform(mesh_transform), long=True)[0]
    mesh_dag = _api2_mesh_dag(shape_long)
    face_it = om2.MItMeshPolygon(mesh_dag)
    faces_to_delete: list[str] = []
    total_faces = 0
    while not face_it.isDone():
        total_faces += 1
        face_vertices = face_it.getVertices()
        if face_vertices and any(int(vertex_id) in vertex_set for vertex_id in face_vertices):
            faces_to_delete.append(f"{mesh_transform}.f[{face_it.index()}]")
        face_it.next()
    if not faces_to_delete:
        return 0
    _log(f"{log_prefix}: delete {len(faces_to_delete)}/{total_faces} faces")
    cmds.delete(faces_to_delete)
    return len(faces_to_delete)


def _fix_zero_weight_vertices_to_duplicate_root(
    skin_cluster_name: str,
    mesh_transform: str,
    duplicate_root_joint: str,
    eps: float = ZERO_WEIGHT_EPS,
) -> dict:
    shape_long = cmds.ls(_mesh_shape_from_transform(mesh_transform), long=True)[0]
    mesh_dag = _api2_mesh_dag(shape_long)
    root_long = cmds.ls(duplicate_root_joint, long=True)[0]
    influence_paths = _skin_influence_long_paths(skin_cluster_name)
    if root_long not in influence_paths:
        cmds.skinCluster(skin_cluster_name, edit=True, addInfluence=root_long, weight=0.0)
    skin_fn = _api2_skin_fn(skin_cluster_name)
    vertex_comp, vertex_count = _api2_vertex_component_all(mesh_dag)
    flat_weights, influence_count = _api2_get_full_flat_weights(skin_fn, mesh_dag, vertex_comp, vertex_count)
    vertex_it = om2.MItMeshVertex(mesh_dag)
    zero_vertices: list[int] = []
    while not vertex_it.isDone():
        vertex_index = int(vertex_it.index())
        connected_faces = vertex_it.getConnectedFaces()
        if not connected_faces:
            vertex_it.next()
            continue
        base = vertex_index * influence_count
        total = 0.0
        for col in range(influence_count):
            total += float(flat_weights[base + col])
        if total <= eps:
            zero_vertices.append(vertex_index)
        vertex_it.next()
    if not zero_vertices:
        return {"zero_vertices": 0, "fixed_vertices": 0}
    root_influence_name = _skin_percent_transform_name(skin_cluster_name, root_long)
    components = [f"{mesh_transform}.vtx[{vertex_index}]" for vertex_index in zero_vertices]
    cmds.skinPercent(
        skin_cluster_name,
        components,
        transformValue=[(root_influence_name, 1.0)],
        normalize=True,
        zeroRemainingInfluences=True,
    )
    return {"zero_vertices": len(zero_vertices), "fixed_vertices": len(zero_vertices)}


def _api2_vertex_component_all(mesh_dag: om2.MDagPath) -> tuple[om2.MObject, int]:
    fn_mesh = om2.MFnMesh(mesh_dag)
    n = fn_mesh.numVertices
    comp_fn = om2.MFnSingleIndexedComponent()
    comp_fn.create(om2.MFn.kMeshVertComponent)
    comp_fn.addElements(list(range(n)))
    return comp_fn.object(), n


def _influence_index_for_skin_path(skin_cluster: str, skin_influence_long_path: str) -> int:
    """
    Resolve the influence column using cmds skinCluster influence order only.
    This avoids MSelectionList.add, which can raise UnicodeDecodeError on Windows.
    """
    target_long = cmds.ls(skin_influence_long_path, long=True)[0]
    infs_long = _skin_influence_long_paths(skin_cluster)
    if target_long in infs_long:
        return infs_long.index(target_long)
    target_leaf = _joint_leaf_name(target_long)
    leaf_hits = [index for index, inf_long in enumerate(infs_long) if _joint_leaf_name(inf_long) == target_leaf]
    if len(leaf_hits) == 1:
        return leaf_hits[0]
    if not leaf_hits:
        raise RuntimeError(f"Skin influence not found in skinCluster {skin_cluster}: {skin_influence_long_path}")
    raise RuntimeError(
        f"Ambiguous influence leaf name in skinCluster {skin_cluster}: {skin_influence_long_path}"
    )


def _api2_get_full_flat_weights(
    skin_fn: oma2.MFnSkinCluster, mesh_dag: om2.MDagPath, vertex_comp: om2.MObject, n: int
) -> tuple[om2.MDoubleArray, int]:
    res = skin_fn.getWeights(mesh_dag, vertex_comp)
    if isinstance(res, tuple):
        flat_weights, inf_count = res[0], int(res[1])
    else:
        flat_weights = res
        inf_count = len(flat_weights) // n if n else 0
    expected_len = n * inf_count
    if len(flat_weights) != expected_len:
        raise RuntimeError(
            f"getWeights flat length {len(flat_weights)} != n*inf_count ({n}*{inf_count}={expected_len})"
        )
    if inf_count != len(skin_fn.influenceObjects()):
        raise RuntimeError("influence count mismatch between getWeights and influenceObjects()")
    return flat_weights, inf_count


def _api2_per_vertex_max_for_influences(
    skin_cluster_name: str, shape_long_name: str, skin_influence_long_paths: list[str]
) -> tuple[list[float], int]:
    if not skin_influence_long_paths:
        return [], 0
    skin_fn = _api2_skin_fn(skin_cluster_name)
    mesh_dag = _api2_mesh_dag(shape_long_name)
    vertex_comp, n = _api2_vertex_component_all(mesh_dag)
    max_w = [0.0] * n
    flat_weights, inf_count = _api2_get_full_flat_weights(skin_fn, mesh_dag, vertex_comp, n)
    cols = [_influence_index_for_skin_path(skin_cluster_name, p) for p in skin_influence_long_paths]
    for vtx in range(n):
        base = vtx * inf_count
        for col in cols:
            w = float(flat_weights[base + col])
            if w > max_w[vtx]:
                max_w[vtx] = w
    return max_w, n


def _mesh_has_positive_weight_on_joint_columns(
    skin_cluster: str,
    mesh_transform: str,
    joint_long_paths: list[str],
    min_weight: float,
    allow_leaf_fallback: bool = True,
) -> bool:
    shape = _mesh_shape_from_transform(mesh_transform)
    shape_long = cmds.ls(shape, long=True)[0]
    pairs = _joints_to_skin_influence_paths_for_mesh(
        skin_cluster,
        joint_long_paths,
        shape_long,
        allow_leaf_fallback,
    )
    if not pairs:
        return False
    influence_paths = [p for _, p in pairs]
    t_scan = _t0()
    max_w, _ = _api2_per_vertex_max_for_influences(skin_cluster, shape_long, influence_paths)
    for w in max_w:
        if w >= min_weight:
            _stage(f"mesh filter hit (vtx >= {min_weight} on subtree influences): {mesh_transform}", t_scan)
            return True
    return False


def _find_mesh_pairs_for_joint_paths(
    joint_paths: list[str],
    weight_threshold: float,
    skin_matcher: Callable[[str], bool],
    scan_log: str,
    missing_skin_error: str,
    missing_weight_error: str,
    name_suffix: str,
    source_is_generated: bool,
    allow_leaf_fallback: bool,
) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    seen_mesh: set[str] = set()
    has_matching_skin = False
    all_skins = cmds.ls(type="skinCluster", long=True) or []
    _log(f"{scan_log}: {len(all_skins)}")
    for si, sc in enumerate(all_skins):
        if not skin_matcher(sc):
            continue
        has_matching_skin = True
        geoms = cmds.skinCluster(sc, query=True, geometry=True) or []
        _log(f"  skin[{si}] {sc} geoms={len(geoms)}")
        for g in geoms:
            mesh_xform = cmds.listRelatives(g, parent=True, fullPath=True)
            if not mesh_xform:
                raise RuntimeError(f"Skin geometry has no parent transform: {g}")
            mt = cmds.ls(mesh_xform[0], long=True)[0]
            mesh_is_generated = _is_generated_copy_node(mt, name_suffix)
            if mesh_is_generated != source_is_generated:
                if mesh_is_generated:
                    _log(f"    skip generated copy mesh: {mt}")
                else:
                    _log(f"    skip original source mesh: {mt}")
                continue
            if mt in seen_mesh:
                continue
            _log(f"    candidate mesh: {mt}")
            if not _mesh_has_positive_weight_on_joint_columns(
                sc,
                mt,
                joint_paths,
                weight_threshold,
                allow_leaf_fallback,
            ):
                _log(f"    skip (no vtx >= {weight_threshold} for target joints on mesh)")
                continue
            seen_mesh.add(mt)
            pairs.append((sc, mt))
    if not pairs:
        if not has_matching_skin:
            raise RuntimeError(missing_skin_error)
        raise RuntimeError(missing_weight_error)
    return pairs


def find_meshes_for_joint_subtree(
    joint_root: str,
    weight_threshold: float = WEIGHT_THRESHOLD,
    name_suffix: str = "_copy",
) -> tuple[list[str], list[tuple[str, str]]]:
    """
    DFS subtree from joint_root; list (skinCluster, mesh_transform) where at least one subtree joint
    influences the skin and some vertex has max weight >= weight_threshold over subtree columns.
    """
    t0 = _t0()
    joint_subtree = _joint_subtree_dfs(joint_root)
    source_is_generated = _is_generated_copy_node(joint_root, name_suffix)
    # Use strict influence matching by long path to avoid cross-skeleton contamination
    # when different rigs share the same joint leaf names.
    allow_leaf_fallback = False
    _log(f"build joint subtree: {len(joint_subtree)} joints (DFS)")
    pairs = _find_mesh_pairs_for_joint_paths(
        joint_paths=joint_subtree,
        weight_threshold=weight_threshold,
        skin_matcher=lambda sc: _skin_cluster_touches_subtree(sc, joint_subtree, allow_leaf_fallback),
        scan_log="scan skinClusters in scene",
        missing_skin_error=(
            f"No skinCluster lists any joint from the selected subtree as an influence: {joint_root}"
        ),
        missing_weight_error=(
            f"No mesh has vertex weight >= {weight_threshold} for the joint subtree. "
            "Lower WEIGHT_THRESHOLD or paint weights."
        ),
        name_suffix=name_suffix,
        source_is_generated=source_is_generated,
        allow_leaf_fallback=allow_leaf_fallback,
    )
    _stage(f"find_meshes_for_joint_subtree done, pairs={len(pairs)}", t0)
    return joint_subtree, pairs


def find_meshes_for_joint(
    joint: str,
    weight_threshold: float = WEIGHT_THRESHOLD,
    name_suffix: str = "_copy",
) -> list[tuple[str, str]]:
    """Only the selected joint (no descendant joints). For subtree use find_meshes_for_joint_subtree."""
    joint_long = cmds.ls(joint, long=True)[0]
    source_is_generated = _is_generated_copy_node(joint_long, name_suffix)
    allow_leaf_fallback = False
    return _find_mesh_pairs_for_joint_paths(
        joint_paths=[joint_long],
        weight_threshold=weight_threshold,
        skin_matcher=lambda sc: _skin_cluster_includes_joint(sc, joint_long, allow_leaf_fallback),
        scan_log=f"scan skinClusters (single joint) joint={joint_long}",
        missing_skin_error=f"No skinCluster lists the joint as an influence: {joint_long}",
        missing_weight_error=(
            f"No mesh has vertex weight >= {weight_threshold} for this joint. "
            "Lower WEIGHT_THRESHOLD or paint weights."
        ),
        name_suffix=name_suffix,
        source_is_generated=source_is_generated,
        allow_leaf_fallback=allow_leaf_fallback,
    )


def _duplicate_skinned_mesh(mesh_src: str, name_suffix: str) -> str:
    t0 = _t0()
    base_name = f"{mesh_src.split('|')[-1]}{name_suffix}"
    _log(f"duplicate mesh geometry only: {mesh_src}")
    mesh_dup_list = cmds.duplicate(
        mesh_src,
        name=base_name,
        upstreamNodes=False,
        inputConnections=False,
        returnRootsOnly=True,
    )
    if not mesh_dup_list:
        raise RuntimeError(f"Failed to duplicate mesh: {mesh_src}")
    mesh_dup = cmds.ls(mesh_dup_list[0], long=True)[0]
    _stage("duplicate mesh ok (geometry only)", t0)
    return mesh_dup


def _cleanup_non_deformer_history(mesh_transform: str) -> None:
    """
    Keep skin/deformers and remove construction operators that can break exporters.
    Equivalent to Maya "Delete Non-Deformer History".
    """
    mesh_transform_long = cmds.ls(mesh_transform, long=True)[0]
    _log(f"cleanup non-deformer history: {mesh_transform_long}")
    cmds.bakePartialHistory(mesh_transform_long, prePostDeformers=True)
    shape_long = cmds.ls(_mesh_shape_from_transform(mesh_transform_long), long=True)[0]
    history_nodes = cmds.listHistory(shape_long, pruneDagObjects=True) or []
    unsupported_poly_nodes = [
        node
        for node in history_nodes
        if cmds.nodeType(node).startswith("poly")
    ]
    if unsupported_poly_nodes:
        raise RuntimeError(
            f"Unsupported poly history remains on duplicated mesh after cleanup: {mesh_transform_long} "
            f"nodes={unsupported_poly_nodes}"
        )


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


def _ensure_unique_skin_cluster(mesh_dup: str, mesh_src: str, skin_src: str) -> str:
    """
    Build a fresh skinCluster on the duplicated mesh using the source influences, then copy
    weights from the source mesh. This avoids duplicated history sharing the original skin node.
    """
    _log("bind fresh skinCluster on duplicate + API2 copy weights")
    infs = _skin_influence_long_paths(skin_src)
    if not infs:
        raise RuntimeError(f"No influences found on source skinCluster: {skin_src}")
    settings = _source_skin_settings(skin_src)
    cluster = cmds.skinCluster(
        infs,
        mesh_dup,
        toSelectedBones=True,
        bindMethod=0,
        maximumInfluences=settings["max_influences"],
        obeyMaxInfluences=True,
        skinMethod=settings["skinning_method"],
        normalizeWeights=settings["normalize_weights"],
        ignoreBindPose=True,
    )[0]
    new_skin = cmds.ls(cluster, long=True)[0]
    _copy_flat_skin_weights_between_skin_clusters(mesh_src, skin_src, mesh_dup, new_skin)
    return new_skin


def _extract_subtree_weights_to_duplicate_mesh(
    mesh_src: str,
    skin_src: str,
    mesh_dup: str,
    joint_subtree: list[str],
    orig_to_dup: dict[str, str],
    threshold: float,
) -> str:
    shape_src_long = cmds.ls(_mesh_shape_from_transform(mesh_src), long=True)[0]
    shape_dup_long = cmds.ls(_mesh_shape_from_transform(mesh_dup), long=True)[0]
    source_pairs = _joints_to_skin_influence_paths_for_mesh(
        skin_src,
        joint_subtree,
        shape_src_long,
        allow_leaf_fallback=False,
    )
    source_pairs = [(orig_joint, skin_inf) for orig_joint, skin_inf in source_pairs if orig_joint in orig_to_dup]
    if not source_pairs:
        raise RuntimeError(
            f"No subtree influences resolve for extraction on source mesh: mesh={mesh_src} skin={skin_src}"
        )
    src_cols = [_influence_index_for_skin_path(skin_src, skin_inf) for _, skin_inf in source_pairs]
    dup_influences_all = [cmds.ls(orig_to_dup[orig_joint], long=True)[0] for orig_joint, _ in source_pairs]

    skin_fn_src = _api2_skin_fn(skin_src)
    mesh_dag_src = _api2_mesh_dag(shape_src_long)
    vc_src, n_src = _api2_vertex_component_all(mesh_dag_src)
    flat_src, inf_count_src = _api2_get_full_flat_weights(skin_fn_src, mesh_dag_src, vc_src, n_src)

    remove_vertices: list[int] = []
    keep_vertex_values: dict[int, list[float]] = {}
    keep_vertices = 0
    influence_sums = [0.0] * len(src_cols)
    for vertex_index in range(n_src):
        base_src = vertex_index * inf_count_src
        total_sum = 0.0
        for col in range(inf_count_src):
            total_sum += float(flat_src[base_src + col])
        values = []
        for source_col in src_cols:
            value = float(flat_src[base_src + source_col])
            values.append(value if value >= EXTRACTION_VERTEX_WEIGHT_EPS else 0.0)
        subtree_sum = sum(values)
        external_sum = total_sum - subtree_sum
        if subtree_sum < threshold or subtree_sum <= 0.0:
            remove_vertices.append(vertex_index)
            continue
        if EXTRACTION_REQUIRE_SUBTREE_EXCLUSIVE and external_sum > EXTRACTION_EXTERNAL_WEIGHT_EPS:
            remove_vertices.append(vertex_index)
            continue
        keep_vertices += 1
        keep_vertex_values[vertex_index] = values
        for influence_index, value in enumerate(values):
            influence_sums[influence_index] += value

    active_indices = [
        index for index, value in enumerate(influence_sums) if value > EXTRACTION_INFLUENCE_SUM_EPS
    ]
    if not active_indices:
        raise RuntimeError(
            f"All subtree influences are below sum epsilon on mesh: mesh={mesh_src} eps={EXTRACTION_INFLUENCE_SUM_EPS}"
        )
    dup_influences = [dup_influences_all[index] for index in active_indices]
    settings = _source_skin_settings(skin_src)
    max_influences = min(settings["max_influences"], len(dup_influences))
    cluster = cmds.skinCluster(
        dup_influences,
        mesh_dup,
        toSelectedBones=True,
        bindMethod=0,
        maximumInfluences=max_influences,
        obeyMaxInfluences=True,
        skinMethod=settings["skinning_method"],
        normalizeWeights=settings["normalize_weights"],
        ignoreBindPose=True,
    )[0]
    skin_dup = cmds.ls(cluster, long=True)[0]

    skin_fn_dup = _api2_skin_fn(skin_dup)
    mesh_dag_dup = _api2_mesh_dag(shape_dup_long)
    vc_dup, n_dup = _api2_vertex_component_all(mesh_dag_dup)
    if n_src != n_dup:
        raise RuntimeError(f"Vertex count mismatch for subtree extract: source={n_src} dup={n_dup}")

    dest_inf_count = len(dup_influences)
    out = [0.0] * (n_dup * dest_inf_count)
    filtered_keep_vertices = 0
    for vertex_index, values in keep_vertex_values.items():
        active_values = [values[index] for index in active_indices]
        active_sum = sum(active_values)
        if active_sum <= 0.0:
            remove_vertices.append(vertex_index)
            continue
        filtered_keep_vertices += 1
        base_dst = vertex_index * dest_inf_count
        if EXTRACTION_HARD_ASSIGN_MAX:
            max_index = max(range(dest_inf_count), key=lambda idx: active_values[idx])
            out[base_dst + max_index] = 1.0
        else:
            inv = 1.0 / active_sum
            for influence_index, value in enumerate(active_values):
                out[base_dst + influence_index] = value * inv

    out_flat = om2.MDoubleArray(out)
    _api2_set_full_flat_weights(skin_fn_dup, mesh_dag_dup, vc_dup, out_flat)
    deleted_faces = _delete_faces_touching_vertices(mesh_dup, remove_vertices, "extract prune")
    _log(
        f"extract subtree weights: keepVerts={filtered_keep_vertices} removeVerts={len(remove_vertices)} "
        f"deletedFaces={deleted_faces} influences={dest_inf_count}"
    )
    return skin_dup


def _api2_set_full_flat_weights(
    skin_fn: oma2.MFnSkinCluster,
    mesh_dag: om2.MDagPath,
    vertex_comp: om2.MObject,
    flat_weights: om2.MDoubleArray,
    normalize: bool = False,
) -> None:
    # Keep normalize off by default to avoid Maya-side renormalize warnings/path issues.
    # Callers should provide already-normalized weights when needed.
    inf_dags = skin_fn.influenceObjects()
    inf_list = [int(skin_fn.indexForInfluenceObject(inf_dags[x])) for x in range(len(inf_dags))]
    inf_indexes = om2.MIntArray(inf_list)
    skin_fn.setWeights(mesh_dag, vertex_comp, inf_indexes, flat_weights, normalize, False)


def _copy_flat_skin_weights_between_skin_clusters(
    mesh_src_transform: str,
    skin_src_name: str,
    mesh_dup_transform: str,
    skin_dst_name: str,
) -> None:
    """
    Copy per-vertex weights from source mesh/skin to destination mesh/skin using explicit
    skinCluster names. This avoids fragile history lookups on duplicated meshes.
    """
    shape_src_long = cmds.ls(_mesh_shape_from_transform(mesh_src_transform), long=True)[0]
    shape_dup_long = cmds.ls(_mesh_shape_from_transform(mesh_dup_transform), long=True)[0]
    skin_fn_src = _api2_skin_fn(skin_src_name)
    skin_fn_dst = _api2_skin_fn(skin_dst_name)
    mesh_dag_src = _api2_mesh_dag(shape_src_long)
    mesh_dag_dup = _api2_mesh_dag(shape_dup_long)
    vc_src, n_src = _api2_vertex_component_all(mesh_dag_src)
    vc_dup, n_dup = _api2_vertex_component_all(mesh_dag_dup)
    if n_src != n_dup:
        raise RuntimeError(f"Vertex count mismatch for weight copy: source={n_src} dup={n_dup}")
    flat_src, inf_count_src = _api2_get_full_flat_weights(skin_fn_src, mesh_dag_src, vc_src, n_src)
    src_infs_long = _skin_influence_long_paths(skin_src_name)
    dst_infs_long = _skin_influence_long_paths(skin_dst_name)
    inf_count_dst = len(dst_infs_long)
    if inf_count_src != len(src_infs_long):
        raise RuntimeError(
            f"Source influence count mismatch: weights={inf_count_src} cmds={len(src_infs_long)}"
        )
    if inf_count_src != inf_count_dst:
        raise RuntimeError(
            f"Influence count mismatch for weight copy: source={inf_count_src} dest={inf_count_dst}"
        )
    dst_to_src_col = [_influence_index_for_skin_path(skin_src_name, dst_inf) for dst_inf in dst_infs_long]
    flat_list: list[float] = []
    for vtx in range(n_src):
        base_src = vtx * inf_count_src
        for di in range(inf_count_dst):
            si = dst_to_src_col[di]
            flat_list.append(float(flat_src[base_src + si]))
    out_flat = om2.MDoubleArray(flat_list)
    _api2_set_full_flat_weights(skin_fn_dst, mesh_dag_dup, vc_dup, out_flat)


def _api2_bulk_remap_subtree_to_duplicates(
    skin_cluster_name: str,
    mesh_transform: str,
    joint_subtree: list[str],
    orig_to_dup: dict[str, str],
) -> None:
    t0 = _t0()
    shape = _mesh_shape_from_transform(mesh_transform)
    shape_long = cmds.ls(shape, long=True)[0]
    pairs = _joints_to_skin_influence_paths_for_mesh(
        skin_cluster_name,
        joint_subtree,
        shape_long,
        allow_leaf_fallback=False,
    )
    if not pairs:
        raise RuntimeError(
            f"No subtree joint resolves to a skin influence on {skin_cluster_name} for this mesh. "
            "Joint names may not match the bound skeleton."
        )
    influent = [j for j, _ in pairs]
    orig_to_skin_inf = {j: p for j, p in pairs}
    dup_joints = list({orig_to_dup[j] for j in influent if j in orig_to_dup})
    _log(f"remap: addInfluence for {len(dup_joints)} duplicate joints")
    for dj in dup_joints:
        cmds.skinCluster(skin_cluster_name, edit=True, addInfluence=dj, weight=0.0)
    skin_fn = _api2_skin_fn(skin_cluster_name)
    mesh_dag = _api2_mesh_dag(shape_long)
    _log("remap: build full vertex component + getWeights (flat)")
    vertex_comp, n = _api2_vertex_component_all(mesh_dag)
    flat_weights, inf_count = _api2_get_full_flat_weights(skin_fn, mesh_dag, vertex_comp, n)

    flat_list = [float(flat_weights[i]) for i in range(len(flat_weights))]
    skin_fn = _api2_skin_fn(skin_cluster_name)
    column_pairs: list[tuple[int, int]] = []
    for orig_j in influent:
        if orig_j not in orig_to_dup:
            raise RuntimeError(f"No duplicate joint mapped for: {orig_j}")
        dup_j = orig_to_dup[orig_j]
        skin_inf_orig = orig_to_skin_inf[orig_j]
        dup_long = cmds.ls(dup_j, long=True)[0]
        column_pairs.append(
            (
                _influence_index_for_skin_path(skin_cluster_name, skin_inf_orig),
                _influence_index_for_skin_path(skin_cluster_name, dup_long),
            )
        )
    npairs = len(column_pairs)
    total_ops = n * npairs
    _log(f"remap: accumulate orig->dup columns (verts={n}, pairs={npairs}, inner_ops~{total_ops})")
    last_hb = -1
    for c in range(n):
        if REMAP_PROGRESS_EVERY_VERTICES > 0:
            hb = c // REMAP_PROGRESS_EVERY_VERTICES
            if hb != last_hb:
                last_hb = hb
                _log(f"  remap heartbeat: vertex {c}/{n}")
        base = c * inf_count
        for col_o, col_d in column_pairs:
            o = flat_list[base + col_o]
            flat_list[base + col_d] += o
            flat_list[base + col_o] = 0.0

    _log("remap: setWeights (single call)")
    out_flat = om2.MDoubleArray(flat_list)
    skin_fn = _api2_skin_fn(skin_cluster_name)
    _api2_set_full_flat_weights(skin_fn, mesh_dag, vertex_comp, out_flat)

    _log(f"remap: removeInfluence for {len(influent)} source rig influences")
    for orig_j in influent:
        skin_inf_orig = orig_to_skin_inf[orig_j]
        cmds.skinCluster(
            skin_cluster_name,
            edit=True,
            removeInfluence=_skin_percent_transform_name(skin_cluster_name, skin_inf_orig),
        )
    _stage("remap done", t0)


def _enforce_duplicate_subtree_influences_only(
    skin_cluster_name: str,
    allowed_duplicate_joint_paths: list[str],
) -> None:
    """
    Keep only duplicated subtree influences on the duplicated mesh skinCluster.
    This guarantees no dependency on old/original rig joints.
    """
    allowed_longs = {cmds.ls(joint, long=True)[0] for joint in allowed_duplicate_joint_paths}
    if not allowed_longs:
        raise RuntimeError(
            f"No allowed duplicate joints provided for influence enforcement: {skin_cluster_name}"
        )
    all_influences_long = _skin_influence_long_paths(skin_cluster_name)
    remove_longs = [inf for inf in all_influences_long if inf not in allowed_longs]
    _log(
        f"enforce duplicate influences only: keep={len(allowed_longs)} "
        f"remove={len(remove_longs)} skin={skin_cluster_name}"
    )
    for influence_long in remove_longs:
        cmds.skinCluster(
            skin_cluster_name,
            edit=True,
            removeInfluence=_skin_percent_transform_name(skin_cluster_name, influence_long),
        )
    remaining_longs = _skin_influence_long_paths(skin_cluster_name)
    illegal_remaining = [inf for inf in remaining_longs if inf not in allowed_longs]
    if illegal_remaining:
        raise RuntimeError(
            f"Non-duplicate influences remain after enforcement on {skin_cluster_name}: {illegal_remaining}"
        )


def _delete_vertices_outside_subtree_weights(
    mesh_dup: str,
    mesh_src: str,
    skin_src: str,
    joint_subtree_for_prune: list[str],
    threshold: float,
) -> None:
    """
    Remove faces on the duplicated mesh using source-mesh skin weights:
    - keep vertices that are strongly controlled by the selected subtree
    - remove vertices that are weak on subtree or still influenced by joints outside subtree
    Then delete any face touching removed vertices to avoid boundary leftovers driven by old joints.
    """
    t0 = _t0()
    shape_src = _mesh_shape_from_transform(mesh_src)
    shape_src_long = cmds.ls(shape_src, long=True)[0]
    pairs = _joints_to_skin_influence_paths_for_mesh(
        skin_src,
        joint_subtree_for_prune,
        shape_src_long,
        allow_leaf_fallback=False,
    )
    if not pairs:
        raise RuntimeError(
            "No joint from the selected subtree influences this skinCluster on the source mesh."
        )
    influence_paths = [p for _, p in pairs]
    n_src = int(cmds.polyEvaluate(shape_src, vertex=True))
    n_dup = int(cmds.polyEvaluate(mesh_dup, vertex=True))
    if n_src != n_dup:
        raise RuntimeError(f"Vertex count mismatch after duplicate: source={n_src} dup={n_dup}")
    _log(f"prune: analyze subtree/external weights (verts={n_src}, subtree_influences={len(influence_paths)})")
    skin_fn_src = _api2_skin_fn(skin_src)
    mesh_dag_src = _api2_mesh_dag(shape_src_long)
    vertex_comp_src, _ = _api2_vertex_component_all(mesh_dag_src)
    flat_weights, inf_count = _api2_get_full_flat_weights(skin_fn_src, mesh_dag_src, vertex_comp_src, n_src)
    subtree_cols = sorted({_influence_index_for_skin_path(skin_src, path) for path in influence_paths})
    if not subtree_cols:
        raise RuntimeError(f"No subtree influence columns resolved for source skinCluster: {skin_src}")
    subtree_col_set = set(subtree_cols)
    external_epsilon = 1e-6
    to_keep: list[int] = []
    to_remove: list[int] = []
    external_weight_vertices = 0
    for vertex_index in range(n_src):
        base = vertex_index * inf_count
        subtree_sum = 0.0
        total_sum = 0.0
        for col in range(inf_count):
            value = float(flat_weights[base + col])
            total_sum += value
            if col in subtree_col_set:
                subtree_sum += value
        external_sum = total_sum - subtree_sum
        if subtree_sum >= threshold and external_sum <= external_epsilon:
            to_keep.append(vertex_index)
        else:
            to_remove.append(vertex_index)
            if external_sum > external_epsilon:
                external_weight_vertices += 1
    if not to_keep:
        raise RuntimeError(
            f"No vertices on {mesh_src} are fully controlled by subtree with threshold={threshold}."
        )
    _log(
        f"prune: keep {len(to_keep)} verts, remove {len(to_remove)} verts, "
        f"external-weight verts={external_weight_vertices}"
    )
    if not to_remove:
        _stage("prune (nothing to remove)", t0)
        return
    deleted_face_count = _delete_faces_touching_vertices(mesh_dup, to_remove, "prune strict")
    if deleted_face_count == 0:
        _log("prune: no faces touched removed vertices")
    _stage("prune done", t0)

def list_joint_skinned_meshes(joint: str | None = None, weight_threshold: float = WEIGHT_THRESHOLD) -> list[tuple[str, str]]:
    j = joint if joint is not None else _require_joint_selection()
    _, pairs = find_meshes_for_joint_subtree(j, weight_threshold, "_copy")
    _log(f"=== listed {len(pairs)} mesh(es) (subtree) ===")
    for i, (sc, mt) in enumerate(pairs, start=1):
        _log(f"  [{i}] {mt}  skin={sc}")
    return pairs


def _copy_joint_skinned_meshes_once(
    weight_threshold: float = WEIGHT_THRESHOLD,
    name_suffix: str = "_copy",
) -> dict:
    """
    Select one joint (subtree root): duplicate that joint hierarchy, find skinned meshes for the
    subtree, duplicate each mesh, remap skin weights from source joints to duplicated joints,
    then delete vertices (and their faces) where subtree weight max < threshold so only the
    weighted region remains on the new bones.
    """
    run_t0 = _t0()
    _log("=== copy_joint_skinned_meshes start ===")
    cmds.refresh(suspend=True)
    try:
        cmds.undoInfo(openChunk=True, chunkName="copyJointSkinnedMeshes")
        t0 = _t0()
        joint_src = _require_joint_selection()
        _stage(f"selected joint (subtree root): {joint_src}", t0)

        t0 = _t0()
        joint_subtree, pairs = find_meshes_for_joint_subtree(joint_src, weight_threshold, name_suffix)
        _stage(f"find meshes ({len(pairs)})", t0)

        t0 = _t0()
        dup_root, orig_to_dup = _duplicate_joint_subtree(joint_src, name_suffix)
        _stage(f"duplicate joint subtree -> {dup_root}", t0)

        copies: list[dict] = []
        for mi, (skin_src, mesh_src) in enumerate(pairs):
            _log(f"--- mesh {mi + 1}/{len(pairs)} source={mesh_src} ---")
            t_mesh = _t0()
            mesh_dup = _duplicate_skinned_mesh(mesh_src, name_suffix)
            if USE_DIRECT_SUBTREE_EXTRACTION:
                skin_dup = _extract_subtree_weights_to_duplicate_mesh(
                    mesh_src,
                    skin_src,
                    mesh_dup,
                    joint_subtree,
                    orig_to_dup,
                    weight_threshold,
                )
            else:
                skin_dup = _ensure_unique_skin_cluster(mesh_dup, mesh_src, skin_src)
            _log(f"dup mesh={mesh_dup} skin={skin_dup}")
            if not USE_DIRECT_SUBTREE_EXTRACTION:
                _api2_bulk_remap_subtree_to_duplicates(skin_dup, mesh_dup, joint_subtree, orig_to_dup)
                _delete_vertices_outside_subtree_weights(
                    mesh_dup, mesh_src, skin_src, joint_subtree, weight_threshold
                )
                if ENFORCE_DUPLICATE_INFLUENCES_ONLY:
                    dup_subtree = [orig_to_dup[joint] for joint in joint_subtree if joint in orig_to_dup]
                    _enforce_duplicate_subtree_influences_only(skin_dup, dup_subtree)
            if FIX_ZERO_WEIGHT_VERTICES:
                zero_fix = _fix_zero_weight_vertices_to_duplicate_root(
                    skin_dup,
                    mesh_dup,
                    dup_root,
                    ZERO_WEIGHT_EPS,
                )
                _log(
                    f"fix zero-weight vertices: zero={zero_fix['zero_vertices']} "
                    f"fixed={zero_fix['fixed_vertices']}"
                )
            _cleanup_non_deformer_history(mesh_dup)
            copies.append(
                {
                    "source_mesh": mesh_src,
                    "duplicated_mesh": mesh_dup,
                    "skin_source": skin_src,
                    "skin_duplicate": skin_dup,
                }
            )
            _stage(f"mesh {mi + 1}/{len(pairs)} done", t_mesh)

        cmds.select([dup_root] + [c["duplicated_mesh"] for c in copies], replace=True)
        result = {
            "source_joint": joint_src,
            "duplicated_joint_root": dup_root,
            "joint_subtree_count": len(joint_subtree),
            "orig_to_dup": orig_to_dup,
            "meshes_found": len(pairs),
            "copies": copies,
        }
    finally:
        cmds.undoInfo(closeChunk=True)
        cmds.refresh(suspend=False)
    _stage("=== copy_joint_skinned_meshes finished ===", run_t0)
    return result


def copy_joint_skinned_meshes(
    weight_threshold: float = WEIGHT_THRESHOLD,
    name_suffix: str = "_copy",
    copy_count: int = 1,
) -> dict:
    if copy_count <= 0:
        raise RuntimeError(f"copy_count must be greater than 0, got: {copy_count}")
    runs: list[dict] = []
    for index in range(copy_count):
        _log(f"=== copy run {index + 1}/{copy_count} ===")
        runs.append(
            _copy_joint_skinned_meshes_once(
                weight_threshold=weight_threshold,
                name_suffix=name_suffix,
            )
        )
    if copy_count == 1:
        return runs[0]
    return {
        "copy_count": copy_count,
        "runs": runs,
    }


def copy_joint_with_weighted_skin(
    weight_threshold: float = WEIGHT_THRESHOLD,
    name_suffix: str = "_copy",
    copy_count: int = 1,
) -> dict:
    return copy_joint_skinned_meshes(
        weight_threshold=weight_threshold,
        name_suffix=name_suffix,
        copy_count=copy_count,
    )


def run() -> None:
    result = copy_joint_skinned_meshes()
    print("Done.", flush=True)
    if "runs" in result:
        print("Copy count:", result["copy_count"], flush=True)
        for run_index, run_result in enumerate(result["runs"], start=1):
            print(f"Run {run_index}:", flush=True)
            print("  Source joint:", run_result["source_joint"], flush=True)
            print("  Duplicated joint root:", run_result["duplicated_joint_root"], flush=True)
            print("  Subtree joints:", run_result["joint_subtree_count"], flush=True)
            print("  Meshes:", run_result["meshes_found"], flush=True)
            for mesh_index, copy_item in enumerate(run_result["copies"], start=1):
                print(f"    [{mesh_index}] {copy_item['duplicated_mesh']}", flush=True)
        return
    print("Source joint:", result["source_joint"], flush=True)
    print("Duplicated joint root:", result["duplicated_joint_root"], flush=True)
    print("Subtree joints:", result["joint_subtree_count"], flush=True)
    print("Meshes:", result["meshes_found"], flush=True)
    for i, c in enumerate(result["copies"], start=1):
        print(f"  [{i}] {c['duplicated_mesh']}", flush=True)


'''
script_globals = {"__name__": "maya_copy_joint_skin_chunk"}
exec(
    compile(
        open(r"E:/TAURI_PROJECT/scripts/maya_copy_joint_skin_chunk.py", encoding="utf-8").read(),
        r"E:/TAURI_PROJECT/scripts/maya_copy_joint_skin_chunk.py",
        "exec",
    ),
    script_globals,
)

result = script_globals["copy_joint_skinned_meshes"](copy_count=7)
print(result)
'''