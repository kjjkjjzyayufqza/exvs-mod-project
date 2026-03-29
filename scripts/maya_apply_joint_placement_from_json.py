from __future__ import annotations

import json

import maya.cmds as cmds

DEFAULT_SCENE_STATE_JSON_PATH = r"E:\XB\解包\com\file\test\test.json"
APPLY_JOINT_ORIENT = False


def _leaf_name(node_long: str) -> str:
    return node_long.split("|")[-1]


def _normalize_token(token: str) -> str:
    return token.split(":")[-1]


def _lineage_data_from_long(node_long: str) -> tuple[str, str]:
    tokens = [_normalize_token(token) for token in _path_tokens(node_long)]
    lineage_path = "|".join(tokens)
    lineage_path_no_root = "|".join(tokens[1:]) if len(tokens) > 1 else tokens[0]
    return lineage_path, lineage_path_no_root


def _joint_maps() -> tuple[dict[str, str], dict[str, list[str]], dict[str, list[str]], dict[str, list[str]]]:
    joints = cmds.ls(type="joint", long=True) or []
    by_long: dict[str, str] = {}
    by_leaf: dict[str, list[str]] = {}
    by_lineage: dict[str, list[str]] = {}
    by_lineage_no_root: dict[str, list[str]] = {}
    for joint_long in joints:
        long_name = cmds.ls(joint_long, long=True)[0]
        by_long[long_name] = long_name
        leaf = _leaf_name(long_name)
        by_leaf.setdefault(leaf, []).append(long_name)
        lineage_path, lineage_path_no_root = _lineage_data_from_long(long_name)
        by_lineage.setdefault(lineage_path, []).append(long_name)
        by_lineage_no_root.setdefault(lineage_path_no_root, []).append(long_name)
    return by_long, by_leaf, by_lineage, by_lineage_no_root


def _path_tokens(node_long: str) -> list[str]:
    return [token for token in node_long.split("|") if token]


def _path_similarity_score(source_long: str, candidate_long: str) -> int:
    source_tokens = _path_tokens(source_long)
    candidate_tokens = _path_tokens(candidate_long)
    score = 0
    si = len(source_tokens) - 1
    ci = len(candidate_tokens) - 1
    weight = 1
    while si >= 0 and ci >= 0:
        if source_tokens[si] != candidate_tokens[ci]:
            break
        score += weight
        si -= 1
        ci -= 1
        weight += 1
    return score


def _best_candidate_by_path(state_long_name: str, candidates: list[str]) -> str | None:
    scored = [(candidate, _path_similarity_score(state_long_name, candidate)) for candidate in candidates]
    scored.sort(key=lambda item: item[1], reverse=True)
    if not scored:
        return None
    best_score = scored[0][1]
    if best_score <= 0:
        return None
    best_candidates = [candidate for candidate, score in scored if score == best_score]
    if len(best_candidates) != 1:
        return None
    return best_candidates[0]


def _fallback_candidate(state_long_name: str | None, candidates: list[str]) -> str:
    source_depth = len(_path_tokens(state_long_name)) if state_long_name else 0
    ranked = sorted(
        candidates,
        key=lambda candidate: (
            1 if "_copy" in candidate.lower() else 0,
            abs(len(_path_tokens(candidate)) - source_depth) if source_depth else len(_path_tokens(candidate)),
            len(_path_tokens(candidate)),
            candidate,
        ),
    )
    return ranked[0]


def _resolve_joint_target(
    joint_state: dict,
    by_long: dict[str, str],
    by_leaf: dict[str, list[str]],
    by_lineage: dict[str, list[str]],
    by_lineage_no_root: dict[str, list[str]],
) -> str | None:
    state_long_name = joint_state.get("long_name")
    if state_long_name and state_long_name in by_long:
        return by_long[state_long_name]
    state_lineage_no_root = joint_state.get("lineage_path_no_root")
    if state_lineage_no_root:
        candidates = by_lineage_no_root.get(state_lineage_no_root, [])
        if len(candidates) == 1:
            return candidates[0]
    state_lineage = joint_state.get("lineage_path")
    if state_lineage:
        candidates = by_lineage.get(state_lineage, [])
        if len(candidates) == 1:
            return candidates[0]
    name = joint_state.get("name")
    if not name:
        raise RuntimeError("Invalid joint state: missing 'name'")
    candidates = by_leaf.get(name, [])
    if not candidates:
        return None
    if state_long_name:
        best_candidate = _best_candidate_by_path(state_long_name, candidates)
        if best_candidate is not None:
            return best_candidate
    if len(candidates) > 1:
        return _fallback_candidate(state_long_name, candidates)
    return candidates[0]


def _apply_joint_state(joint_long: str, state: dict) -> None:
    if "rotate_order" in state:
        cmds.setAttr(f"{joint_long}.rotateOrder", int(state["rotate_order"]))
    if "translate" in state and len(state["translate"]) == 3:
        tr = state["translate"]
        cmds.setAttr(f"{joint_long}.translateX", float(tr[0]))
        cmds.setAttr(f"{joint_long}.translateY", float(tr[1]))
        cmds.setAttr(f"{joint_long}.translateZ", float(tr[2]))
    elif "world_matrix" in state:
        cmds.xform(joint_long, matrix=[float(v) for v in state["world_matrix"]], worldSpace=True)
    if "rotate" in state and len(state["rotate"]) == 3:
        rot = state["rotate"]
        cmds.setAttr(f"{joint_long}.rotateX", float(rot[0]))
        cmds.setAttr(f"{joint_long}.rotateY", float(rot[1]))
        cmds.setAttr(f"{joint_long}.rotateZ", float(rot[2]))
    if "scale" in state and len(state["scale"]) == 3:
        scl = state["scale"]
        cmds.setAttr(f"{joint_long}.scaleX", float(scl[0]))
        cmds.setAttr(f"{joint_long}.scaleY", float(scl[1]))
        cmds.setAttr(f"{joint_long}.scaleZ", float(scl[2]))
    if "visibility" in state:
        cmds.setAttr(f"{joint_long}.visibility", bool(state["visibility"]))
    if "inherits_transform" in state:
        cmds.setAttr(f"{joint_long}.inheritsTransform", bool(state["inherits_transform"]))
    if APPLY_JOINT_ORIENT and "joint_orient" in state and len(state["joint_orient"]) == 3:
        jo = state["joint_orient"]
        cmds.setAttr(f"{joint_long}.jointOrientX", float(jo[0]))
        cmds.setAttr(f"{joint_long}.jointOrientY", float(jo[1]))
        cmds.setAttr(f"{joint_long}.jointOrientZ", float(jo[2]))


def apply_joint_placement_from_state_dict(scene_state: dict) -> dict:
    if "joints" not in scene_state:
        raise RuntimeError("Invalid scene state: missing 'joints'")
    joints_by_long, joints_by_leaf, joints_by_lineage, joints_by_lineage_no_root = _joint_maps()
    applied: list[str] = []
    skipped: list[str] = []
    for joint_state in scene_state["joints"]:
        name = joint_state.get("name")
        if not name:
            raise RuntimeError("Invalid joint state: missing 'name'")
        target_joint = _resolve_joint_target(
            joint_state,
            joints_by_long,
            joints_by_leaf,
            joints_by_lineage,
            joints_by_lineage_no_root,
        )
        if target_joint is None:
            skipped.append(name)
            continue
        _apply_joint_state(target_joint, joint_state)
        applied.append(name)
    return {
        "applied_joints": applied,
        "skipped_joints": skipped,
        "applied_count": len(applied),
        "skipped_count": len(skipped),
    }


def apply_joint_placement_from_json(json_text: str) -> dict:
    return apply_joint_placement_from_state_dict(json.loads(json_text))


def apply_joint_placement_from_file(path: str = DEFAULT_SCENE_STATE_JSON_PATH) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        scene_state = json.load(f)
    return apply_joint_placement_from_state_dict(scene_state)


def run() -> None:
    result = apply_joint_placement_from_file()
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    
'''
script_globals = {"__name__": "maya_apply_joint_placement_from_json"}
exec(
    compile(
        open(r"E:/TAURI_PROJECT/scripts/maya_apply_joint_placement_from_json.py", encoding="utf-8").read(),
        r"E:/TAURI_PROJECT/scripts/maya_apply_joint_placement_from_json.py",
        "exec",
    ),
    script_globals,
)

script_globals["run"]()
'''