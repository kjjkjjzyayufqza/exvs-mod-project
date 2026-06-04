from argparse import ArgumentParser
from collections import defaultdict
from pathlib import Path
import json
import sys

from research_chrsysparam_700002 import u32_hex
from research_chrsysparam_action_report import parse_msc_context
from research_chrsysparam_human_export import export_human_readable


def parse_id(value):
    if value is None:
        return None
    return int(str(value), 0)


def existing_scripts(msc_dir):
    if not msc_dir:
        return []
    root = Path(msc_dir)
    return sorted(path.name for path in root.glob("*.c"))


def function_candidate(function_name, role, label, row_record, extra=None):
    known = row_record["known"]
    entry = {
        "role": role,
        "label": label,
        "row": row_record["row"],
        "action_hash": known["action_hash"],
        "group": known["group"],
        "category": known["category"]["computed"],
        "category_hex": known["category"]["computed_hex"],
        "gameplay_type_bits": known["category"]["gameplay_type_bits"],
    }
    if extra:
        entry.update(extra)
    return entry


def action_label(row_record):
    known = row_record["known"]
    category = known["category"]["computed"]
    return f"ACTION_ROW_{row_record['row']:03d}_CAT_{category:02X}_GROUP_{known['group'][2:]}"


def summarize_action(row_record):
    known = row_record["known"]
    phase_functions = [phase["function"] for phase in known["phase_callbacks"]]
    return {
        "row": row_record["row"],
        "label": action_label(row_record),
        "action_hash": known["action_hash"],
        "group": known["group"],
        "category": known["category"]["computed"],
        "category_hex": known["category"]["computed_hex"],
        "gameplay_type_bits": known["category"]["gameplay_type_bits"],
        "group_callback": known["group_callback"]["function"],
        "phase_callbacks": phase_functions,
        "route_flags_old_formula": known["route_flags_old_formula"],
        "transition_range": known["transition_range"],
        "derived_link_count": len(known["derived_links"]),
    }


def collect_function_candidates(param_export):
    candidates = defaultdict(list)
    action_summary = []
    unresolved = {
        "route_unknown_rows": [],
        "no_group_callback_rows": [],
        "phase_key_unresolved_rows": [],
        "derived_missing_rows": [],
    }

    for table in param_export["tables"]:
        for row_record in table["row_records"]:
            if row_record.get("kind") != "action" or row_record.get("is_empty"):
                continue
            known = row_record["known"]
            action_summary.append(summarize_action(row_record))

            group_callback = known["group_callback"]["function"]
            if group_callback:
                label = f"GROUP_{known['group'][2:]}_ACTION_CALLBACK"
                candidates[group_callback].append(function_candidate(group_callback, "group_callback", label, row_record))
            else:
                unresolved["no_group_callback_rows"].append(row_record["row"])

            if not known["route_flags_old_formula"]["covered"]:
                unresolved["route_unknown_rows"].append(row_record["row"])

            for phase_index, phase in enumerate(known["phase_callbacks"]):
                key = phase["key"]
                function_name = phase["function"]
                if key in ("0x00000000", "0xFFFFFFFF"):
                    continue
                if function_name:
                    label = f"ACTION_ROW_{row_record['row']:03d}_PHASE_{phase_index}"
                    candidates[function_name].append(
                        function_candidate(
                            function_name,
                            "phase_callback",
                            label,
                            row_record,
                            {"phase_index": phase_index, "phase_key": key},
                        )
                    )
                else:
                    unresolved["phase_key_unresolved_rows"].append({"row": row_record["row"], "phase_index": phase_index, "key": key})

            for link in known["derived_links"]:
                if not link["candidate_rows"]:
                    unresolved["derived_missing_rows"].append(
                        {"row": row_record["row"], "slot": link["slot"], "key": link["key"]}
                    )

    return action_summary, dict(sorted(candidates.items())), unresolved


def summarize_categories(action_summary):
    categories = {}
    for action in action_summary:
        key = action["category_hex"]
        entry = categories.setdefault(
            key,
            {
                "category": action["category"],
                "category_hex": key,
                "count": 0,
                "shooting_bit": action["gameplay_type_bits"]["shooting_bit"],
                "melee_bit": action["gameplay_type_bits"]["melee_bit"],
                "unknown_bits": action["gameplay_type_bits"]["unknown_bits"],
                "groups": {},
            },
        )
        entry["count"] += 1
        entry["groups"][action["group"]] = entry["groups"].get(action["group"], 0) + 1
    return dict(sorted(categories.items(), key=lambda item: item[1]["category"]))


def build_bundle(args):
    unit_id = parse_id(args.unit_id)
    msc_id = parse_id(args.msc_id)
    param_id = parse_id(args.param_id)
    param_export = export_human_readable(Path(args.chrsysparam), args.msc_dir, args.non_empty_only)
    resolver, func975 = parse_msc_context(args.msc_dir)
    action_summary, function_candidates, unresolved = collect_function_candidates(param_export)
    category_summary = summarize_categories(action_summary)

    return {
        "schema": "research.msc_project.human_bundle.v0",
        "unit": {
            "id": unit_id,
            "id_hex": None if unit_id is None else u32_hex(unit_id),
            "msc_id": None if msc_id is None else u32_hex(msc_id),
            "param_id": None if param_id is None else u32_hex(param_id),
        },
        "paths": {
            "msc_dir": "" if args.msc_dir is None else str(Path(args.msc_dir)),
            "chrsysparam": str(Path(args.chrsysparam)),
        },
        "msc": {
            "scripts_present": existing_scripts(args.msc_dir),
            "group_resolver": {
                f"0x{group:02X}": {
                    "raw": u32_hex(info["raw"]),
                    "pointer": u32_hex(info["pointer"]),
                    "function": info["function"],
                }
                for group, info in sorted(resolver.items())
            },
            "phase_resolver_case_count": len(func975),
        },
        "param": param_export,
        "action_summary": action_summary,
        "category_summary": category_summary,
        "function_candidates": function_candidates,
        "unresolved": unresolved,
    }


def main():
    parser = ArgumentParser(description="Build a human-readable MSC + chrsysparam research bundle.")
    parser.add_argument("--unit-id", help="Unit id, decimal or hex")
    parser.add_argument("--msc-id", help="Msc resource id/hash, decimal or hex")
    parser.add_argument("--param-id", help="Param resource id/hash, decimal or hex")
    parser.add_argument("--msc-dir", required=True, help="Matching decompiled MSC directory with 2.c and 2.txt")
    parser.add_argument("--chrsysparam", required=True, help="Matching chrsysparam.csyspm")
    parser.add_argument("--non-empty-only", action="store_true", help="omit fully zero Param rows from embedded export")
    parser.add_argument("--output", help="Optional output path. Defaults to stdout.")
    args = parser.parse_args()

    bundle = build_bundle(args)
    text = json.dumps(bundle, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    else:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
