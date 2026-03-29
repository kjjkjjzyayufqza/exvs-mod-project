from __future__ import annotations

import maya.api.OpenMaya as om2
import maya.api.OpenMayaAnim as oma2
import maya.cmds as cmds


def _long(node: str) -> str:
    hits = cmds.ls(node, long=True) or []
    if not hits:
        raise RuntimeError(f"Node not found: {node}")
    return hits[0]


def _leaf(node: str) -> str:
    return _long(node).split("|")[-1].split(":")[-1]


def _is_copy_hierarchy_path(node_long: str) -> bool:
    """
    Treat a node as copy-derived if any DAG segment leaf ends with "_copy".
    This correctly marks duplicated child joints whose own leaf may not end with "_copy".
    """
    segments = [seg for seg in node_long.split("|") if seg]
    for segment in segments:
        leaf = segment.split(":")[-1]
        if leaf.endswith("_copy"):
            return True
    return False


def _mesh_shape_from_any(node: str) -> str:
    node_long = _long(node)
    node_type = cmds.nodeType(node_long)
    if node_type == "mesh":
        if cmds.getAttr(f"{node_long}.intermediateObject"):
            raise RuntimeError(f"Intermediate mesh is not supported: {node_long}")
        return node_long
    if node_type != "transform":
        raise RuntimeError(f"Selected node is not transform/mesh: {node_long}")
    shapes = cmds.listRelatives(node_long, shapes=True, fullPath=True, type="mesh", noIntermediate=True) or []
    if not shapes:
        raise RuntimeError(f"No non-intermediate mesh shape under transform: {node_long}")
    return _long(shapes[0])


def _mesh_transform_from_shape(shape_long: str) -> str:
    parents = cmds.listRelatives(shape_long, parent=True, fullPath=True, type="transform") or []
    if len(parents) != 1:
        raise RuntimeError(f"Mesh shape parent transform invalid: {shape_long}")
    return _long(parents[0])


def _skin_cluster_for_shape(shape_long: str) -> str:
    history = cmds.listHistory(shape_long, pruneDagObjects=True) or []
    skins = [_long(node) for node in history if cmds.nodeType(node) == "skinCluster"]
    skins = list(dict.fromkeys(skins))
    if not skins:
        raise RuntimeError(f"No skinCluster found in history: {shape_long}")
    if len(skins) != 1:
        raise RuntimeError(f"Expected exactly one skinCluster, got {len(skins)}: {shape_long} -> {skins}")
    return skins[0]


def _api2_skin_fn(skin_cluster_name: str) -> oma2.MFnSkinCluster:
    if not cmds.objExists(skin_cluster_name):
        raise RuntimeError(f"Skin cluster does not exist: {skin_cluster_name}")
    short_name = cmds.ls(skin_cluster_name, shortNames=True)[0]
    sel = om2.MSelectionList()
    sel.add(short_name)
    mobj = sel.getDependNode(0)
    fn = oma2.MFnSkinCluster()
    fn.setObject(mobj)
    return fn


def _api2_mesh_dag(shape_long_name: str) -> om2.MDagPath:
    target = shape_long_name.split("|")[-1]
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


def _api2_vertex_component_all(mesh_dag: om2.MDagPath) -> tuple[om2.MObject, int]:
    fn_mesh = om2.MFnMesh(mesh_dag)
    vertex_count = fn_mesh.numVertices
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
    res = skin_fn.getWeights(mesh_dag, vertex_comp)
    if isinstance(res, tuple):
        flat_weights, influence_count = res[0], int(res[1])
    else:
        flat_weights = res
        influence_count = len(flat_weights) // vertex_count if vertex_count else 0
    expected_len = vertex_count * influence_count
    if len(flat_weights) != expected_len:
        raise RuntimeError(f"getWeights length mismatch: len={len(flat_weights)} expected={expected_len}")
    return flat_weights, influence_count


def inspect_selected_mesh_skin(
    min_weight: float = 1e-4,
    top_n: int = 20,
    sample_vertices_per_influence: int = 12,
) -> None:
    selected = cmds.ls(selection=True, long=True) or []
    if not selected:
        raise RuntimeError("Select one or more mesh transforms/shapes first.")

    mesh_shapes: list[str] = []
    seen_shapes: set[str] = set()
    for node in selected:
        try:
            shape = _mesh_shape_from_any(node)
        except RuntimeError:
            continue
        if shape not in seen_shapes:
            seen_shapes.add(shape)
            mesh_shapes.append(shape)

    if not mesh_shapes:
        raise RuntimeError("No valid mesh found in selection.")

    print("=" * 100, flush=True)
    print(f"[skin-inspect] selected meshes: {len(mesh_shapes)}", flush=True)

    for shape_long in mesh_shapes:
        mesh_transform = _mesh_transform_from_shape(shape_long)
        skin_cluster = _skin_cluster_for_shape(shape_long)

        influences = cmds.skinCluster(skin_cluster, query=True, inf=True) or []
        influence_longs = [_long(inf) for inf in influences]
        influence_leaf_names = [_leaf(inf) for inf in influence_longs]

        skin_fn = _api2_skin_fn(skin_cluster)
        mesh_dag = _api2_mesh_dag(shape_long)
        vertex_comp, vertex_count = _api2_vertex_component_all(mesh_dag)
        flat_weights, influence_count = _api2_get_full_flat_weights(
            skin_fn, mesh_dag, vertex_comp, vertex_count
        )

        if influence_count != len(influence_longs):
            raise RuntimeError(
                f"Influence count mismatch: api2={influence_count} cmds={len(influence_longs)} skin={skin_cluster}"
            )

        sum_weights = [0.0] * influence_count
        max_weights = [0.0] * influence_count
        nonzero_vertices = [0] * influence_count
        dominant_vertices = [0] * influence_count

        copy_mesh = _leaf(mesh_transform).endswith("_copy")
        non_copy_dominant_samples: dict[int, list[tuple[int, float]]] = {}

        for vertex_index in range(vertex_count):
            base = vertex_index * influence_count
            best_col = 0
            best_val = -1.0
            for col in range(influence_count):
                weight = float(flat_weights[base + col])
                sum_weights[col] += weight
                if weight > max_weights[col]:
                    max_weights[col] = weight
                if weight > min_weight:
                    nonzero_vertices[col] += 1
                if weight > best_val:
                    best_val = weight
                    best_col = col
            dominant_vertices[best_col] += 1
            if copy_mesh:
                influence_long = influence_longs[best_col]
                if (not _is_copy_hierarchy_path(influence_long)) and best_val > min_weight:
                    bucket = non_copy_dominant_samples.setdefault(best_col, [])
                    if len(bucket) < sample_vertices_per_influence:
                        bucket.append((vertex_index, best_val))

        rows: list[dict] = []
        total_weight = float(vertex_count) if vertex_count > 0 else 1.0
        for col in range(influence_count):
            if sum_weights[col] <= min_weight:
                continue
            rows.append(
                {
                    "index": col,
                    "name": influence_leaf_names[col],
                    "sum_weight": sum_weights[col],
                    "ratio": sum_weights[col] / total_weight,
                    "max_weight": max_weights[col],
                    "nonzero_vertices": nonzero_vertices[col],
                    "dominant_vertices": dominant_vertices[col],
                    "is_copy": _is_copy_hierarchy_path(influence_longs[col]),
                    "path": influence_longs[col],
                }
            )
        rows.sort(key=lambda item: item["sum_weight"], reverse=True)

        print("-" * 100, flush=True)
        print(f"[mesh] {mesh_transform}", flush=True)
        print(f"[shape] {shape_long}", flush=True)
        print(f"[skin ] {skin_cluster}", flush=True)
        print(
            f"[info ] vertices={vertex_count} influences={influence_count} copy_mesh={copy_mesh}",
            flush=True,
        )

        non_copy_rows = [row for row in rows if not row["is_copy"]]
        copy_rows = [row for row in rows if row["is_copy"]]
        non_copy_ratio = sum(row["ratio"] for row in non_copy_rows)
        copy_ratio = sum(row["ratio"] for row in copy_rows)
        print(
            f"[ratio] copy_influences={copy_ratio:.6f} non_copy_influences={non_copy_ratio:.6f}",
            flush=True,
        )

        print(f"[top ] showing top {min(top_n, len(rows))} influences by sum_weight", flush=True)
        for rank, row in enumerate(rows[:top_n], start=1):
            print(
                f"  [{rank:02d}] {row['name']:<40} sum={row['sum_weight']:.6f} ratio={row['ratio']:.6f} "
                f"max={row['max_weight']:.6f} nonzeroVtx={row['nonzero_vertices']} "
                f"dominantVtx={row['dominant_vertices']} isCopy={row['is_copy']}",
                flush=True,
            )

        if copy_mesh and non_copy_rows:
            print("[warn] non-copy influences with non-zero contribution on *_copy mesh:", flush=True)
            for row in non_copy_rows[:top_n]:
                print(
                    f"  - {row['name']} ratio={row['ratio']:.6f} "
                    f"sum={row['sum_weight']:.6f} dominantVtx={row['dominant_vertices']} path={row['path']}",
                    flush=True,
                )

        if copy_mesh and non_copy_dominant_samples:
            print("[sample] vertices dominated by NON-copy influences:", flush=True)
            for col, samples in non_copy_dominant_samples.items():
                name = influence_leaf_names[col]
                sample_text = ", ".join([f"vtx[{vid}]={val:.4f}" for vid, val in samples])
                print(f"  - {name}: {sample_text}", flush=True)

    print("=" * 100, flush=True)


def run() -> None:
    inspect_selected_mesh_skin()


'''
script_globals = {"name": "maya_inspect_selected_mesh_skin"}
exec(
    compile(
        open(r"E:/TAURI_PROJECT/scripts/maya_inspect_selected_mesh_skin.py", encoding="utf-8").read(),
        r"E:/TAURI_PROJECT/scripts/maya_inspect_selected_mesh_skin.py",
        "exec",
    ),
    script_globals,
)
script_globals["run"]()
'''