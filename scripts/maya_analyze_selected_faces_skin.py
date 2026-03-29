from __future__ import annotations

import json

import maya.cmds as cmds


def _is_copy_influence(influence_name: str) -> bool:
    return "_copy" in influence_name.lower()


def _mesh_transform_from_face(face_component: str) -> str:
    return face_component.split(".f[")[0]


def _mesh_shape_from_transform(mesh_transform: str) -> str:
    shapes = cmds.listRelatives(mesh_transform, shapes=True, fullPath=True, type="mesh", noIntermediate=True) or []
    if len(shapes) != 1:
        raise RuntimeError(f"Expected exactly one non-intermediate mesh shape under transform: {mesh_transform}")
    return cmds.ls(shapes[0], long=True)[0]


def _skin_cluster_for_shape(shape_long: str) -> str:
    history = cmds.listHistory(shape_long, pruneDagObjects=True) or []
    skins = [node for node in history if cmds.nodeType(node) == "skinCluster"]
    skins = list(dict.fromkeys(cmds.ls(skins, long=True) or []))
    if not skins:
        raise RuntimeError(f"No skinCluster found for shape: {shape_long}")
    if len(skins) != 1:
        raise RuntimeError(f"Expected exactly one skinCluster for shape: {shape_long}, got={skins}")
    return skins[0]


def _face_vertices(face_component: str) -> list[str]:
    verts = cmds.polyListComponentConversion(face_component, fromFace=True, toVertex=True) or []
    return cmds.ls(verts, flatten=True, long=True) or []


def _vertex_weights(skin_cluster: str, vertex_component: str, influences: list[str]) -> list[float]:
    values = cmds.skinPercent(skin_cluster, vertex_component, query=True, value=True) or []
    if len(values) != len(influences):
        raise RuntimeError(
            f"skinPercent value count mismatch: skin={skin_cluster} vertex={vertex_component} "
            f"values={len(values)} influences={len(influences)}"
        )
    return [float(v) for v in values]


def _top_entries(influences: list[str], weights: list[float], count: int = 3) -> list[dict]:
    pairs = sorted(zip(influences, weights), key=lambda item: item[1], reverse=True)
    out = []
    for influence, weight in pairs[:count]:
        if weight <= 0.0:
            continue
        out.append({"influence": influence, "weight": float(weight), "is_copy": _is_copy_influence(influence)})
    return out


def analyze_selected_faces(sample_limit_per_face: int = 8) -> dict:
    selection = cmds.ls(selection=True, flatten=True, long=True) or []
    faces = [item for item in selection if ".f[" in item]
    if not faces:
        raise RuntimeError("Select at least one mesh face component.")
    by_mesh: dict[str, list[str]] = {}
    for face in faces:
        mesh_transform = _mesh_transform_from_face(face)
        by_mesh.setdefault(mesh_transform, []).append(face)
    report_faces: list[dict] = []
    total_vertices = 0
    total_non_copy_dominant = 0
    total_zero_weight = 0
    for mesh_transform, mesh_faces in by_mesh.items():
        shape_long = _mesh_shape_from_transform(mesh_transform)
        skin_cluster = _skin_cluster_for_shape(shape_long)
        influences = cmds.skinCluster(skin_cluster, query=True, influence=True) or []
        influences = cmds.ls(influences, long=True) or []
        for face in mesh_faces:
            vertices = _face_vertices(face)
            total_vertices += len(vertices)
            non_copy_dominant = 0
            zero_weight = 0
            samples: list[dict] = []
            for vertex in vertices:
                weights = _vertex_weights(skin_cluster, vertex, influences)
                total = float(sum(weights))
                if total <= 1e-8:
                    zero_weight += 1
                    if len(samples) < sample_limit_per_face:
                        samples.append(
                            {
                                "vertex": vertex,
                                "reason": "zero_weight",
                                "top": [],
                            }
                        )
                    continue
                dominant_index = max(range(len(weights)), key=lambda idx: weights[idx])
                dominant_influence = influences[dominant_index]
                dominant_weight = float(weights[dominant_index])
                dominant_is_copy = _is_copy_influence(dominant_influence)
                if not dominant_is_copy:
                    non_copy_dominant += 1
                    if len(samples) < sample_limit_per_face:
                        samples.append(
                            {
                                "vertex": vertex,
                                "reason": "dominant_non_copy",
                                "dominant_influence": dominant_influence,
                                "dominant_weight": dominant_weight,
                                "top": _top_entries(influences, weights, 3),
                            }
                        )
                elif len(samples) < sample_limit_per_face:
                    samples.append(
                        {
                            "vertex": vertex,
                            "reason": "dominant_copy",
                            "dominant_influence": dominant_influence,
                            "dominant_weight": dominant_weight,
                            "top": _top_entries(influences, weights, 3),
                        }
                    )
            total_non_copy_dominant += non_copy_dominant
            total_zero_weight += zero_weight
            if non_copy_dominant > 0:
                diagnosis = "face_has_vertices_dominated_by_original_rig"
            elif zero_weight > 0:
                diagnosis = "face_has_zero_weight_vertices"
            else:
                diagnosis = "no_obvious_skin_binding_issue"
            report_faces.append(
                {
                    "face": face,
                    "mesh": mesh_transform,
                    "shape": shape_long,
                    "skin_cluster": skin_cluster,
                    "vertex_count": len(vertices),
                    "dominant_non_copy_vertex_count": non_copy_dominant,
                    "zero_weight_vertex_count": zero_weight,
                    "diagnosis": diagnosis,
                    "samples": samples,
                }
            )
    result = {
        "selected_face_count": len(faces),
        "analyzed_face_count": len(report_faces),
        "total_vertices": total_vertices,
        "total_dominant_non_copy_vertices": total_non_copy_dominant,
        "total_zero_weight_vertices": total_zero_weight,
        "faces": report_faces,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    return result


def run() -> None:
    analyze_selected_faces()

