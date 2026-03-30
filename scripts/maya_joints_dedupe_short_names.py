"""
Maya: resolve duplicate joint short names with short suffixes only.

Rules:
- Group joints by the last segment of the DAG path (short name only).
- No path joining, no "__" chains from hierarchy.
- If a short name appears once: leave unchanged (no rename).
- If it appears N times (sorted by long path): keep first as NAME, then NAME_1,
  NAME_2, ... (index matches user expectation: second duplicate -> _1).
- Names already taken by other joints are avoided via a small bump suffix.

Rename order: deepest joints first.

Run in Maya Script Editor (Python).
"""

from __future__ import annotations

import json
from collections import defaultdict

import maya.cmds as cmds

APPLY = True
DRY_RUN = False


def _leaf_name(long_path: str) -> str:
    return long_path.split("|")[-1]


def _depth(long_path: str) -> int:
    return long_path.count("|")


def _allocate_unique(desired: str, used: set[str]) -> str:
    if desired not in used:
        return desired
    n = 1
    while True:
        cand = f"{desired}_{n}"
        if cand not in used:
            return cand
        n += 1


def collect_joint_rename_plan() -> list[dict[str, str]]:
    joints = sorted(cmds.ls(type="joint", long=True) or [])
    if not joints:
        return []

    by_short: dict[str, list[str]] = defaultdict(list)
    for j in joints:
        by_short[_leaf_name(j)].append(j)

    for k in by_short:
        by_short[k].sort()

    used: set[str] = set()
    for short_name, paths in by_short.items():
        if len(paths) == 1:
            used.add(short_name)

    plan_map: dict[str, str] = {}

    for short_name in sorted(by_short.keys()):
        paths = by_short[short_name]
        if len(paths) <= 1:
            plan_map[paths[0]] = short_name
            continue
        for i, long_path in enumerate(paths):
            desired = short_name if i == 0 else f"{short_name}_{i}"
            final_name = _allocate_unique(desired, used)
            used.add(final_name)
            plan_map[long_path] = final_name

    plan: list[dict[str, str]] = []
    for long_path in joints:
        old = _leaf_name(long_path)
        new = plan_map[long_path]
        if new != old:
            plan.append({"old_long": long_path, "new_short": new})

    plan.sort(key=lambda x: _depth(x["old_long"]), reverse=True)
    return plan


def apply_joint_rename_plan(plan: list[dict[str, str]]) -> list[dict[str, str]]:
    done: list[dict[str, str]] = []
    for item in plan:
        old_long = item["old_long"]
        new_short = item["new_short"]
        if not cmds.objExists(old_long):
            raise RuntimeError(f"Joint missing before rename: {old_long}")
        if DRY_RUN:
            done.append({"old_long": old_long, "new_short": new_short, "result": old_long})
            continue
        result = cmds.rename(old_long, new_short)
        done.append({"old_long": old_long, "new_short": new_short, "result": result})
    return done


def run(apply: bool = APPLY) -> dict:
    plan = collect_joint_rename_plan()
    out: dict = {
        "joint_count": len(cmds.ls(type="joint", long=True) or []),
        "rename_count": len(plan),
        "apply": bool(apply) and not DRY_RUN,
        "dry_run": bool(DRY_RUN),
        "plan": plan,
    }
    if apply and plan:
        out["applied"] = apply_joint_rename_plan(plan)
    print(json.dumps(out, ensure_ascii=False, indent=2), flush=True)
    return out


'''
script_globals = {"__name__": "maya_joints_dedupe_short_names"}
exec(
    compile(
        open(r"E:/TAURI_PROJECT/scripts/maya_joints_dedupe_short_names.py", encoding="utf-8").read(),
        r"E:/TAURI_PROJECT/scripts/maya_joints_dedupe_short_names.py",
        "exec",
    ),
    script_globals,
)
script_globals["run"](apply=True)
'''
