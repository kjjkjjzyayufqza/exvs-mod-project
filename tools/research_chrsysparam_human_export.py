from argparse import ArgumentParser
from pathlib import Path
import json
import sys

from research_chrsysparam_700002 import MAIN_TABLE_MARKER, emulate_old_func_786, parse_chrsysparam, u32_hex
from research_chrsysparam_action_report import parse_msc_context, schedule_mask_for_field_04, signed_cell


TRANSITION_TABLE_MARKER = 0xA8BAA9BA


def hex_cells(row):
    return [u32_hex(value) for value in row]


def maybe_cell(row, index):
    if index >= len(row):
        return None
    return u32_hex(row[index])


def maybe_signed(row, index):
    if index >= len(row):
        return None
    return signed_cell(row[index])


def phase_record(row, index, func975):
    key = row[index] if index < len(row) else 0
    return {
        "field": f"0x{index:02X}",
        "key": u32_hex(key),
        "function": "" if key in (0, 0xFFFFFFFF) else func975.get(key, ""),
    }


def compute_new_func_144_category(field_03, field_04):
    category = field_03 % 0x64
    if category != 0x1:
        return category, "field_03_mod_0x64"
    remap = {
        0x20: 0x4,
        0x10: 0x3,
        0x08: 0x5,
        0x04: 0x2,
        0x0C: 0x2,
        0x30: 0x4,
        0x3C: 0x2,
    }
    if field_04 in remap:
        return remap[field_04], "field_03_mod_1_field_04_remap"
    return category, "field_03_mod_1_default"


def gameplay_type_bits(category):
    return {
        "category": category,
        "category_hex": u32_hex(category),
        "shooting_bit": (category & 0x1) != 0,
        "melee_bit": (category & 0x2) != 0,
        "unknown_bits": u32_hex(category & ~0x3),
        "evidence": "Old script comments identify category bit 0x1 as Shooting and bit 0x2 as Melee; other bits remain unnamed.",
    }


def build_action_hash_index(rows):
    by_hash = {}
    for row_index, row in enumerate(rows):
        if len(row) <= 0x2E:
            continue
        action_hash = row[0x2E]
        if action_hash in (0, 0xFFFFFFFF):
            continue
        by_hash.setdefault(action_hash, []).append(row_index)
    return by_hash


def derived_links(row, action_hash_index):
    links = []
    if len(row) <= 0x62:
        return links
    for slot in range(10):
        key = row[0x30 + slot]
        if key in (0, 0xFFFFFFFF):
            continue
        delay = row[0x59 + slot] if slot < 4 else None
        links.append(
            {
                "slot": slot,
                "key": u32_hex(key),
                "delay": None if delay is None else delay,
                "candidate_rows": action_hash_index.get(key, []),
            }
        )
    return links


def action_known_fields(row, resolver, func975, action_hash_index):
    group = row[0x0A]
    route, flags = emulate_old_func_786(row)
    callback = resolver.get(group)
    computed_category, category_rule = compute_new_func_144_category(row[0x03], row[0x04])
    return {
        "action_hash": maybe_cell(row, 0x2E),
        "group": f"0x{group:02X}",
        "group_callback": {
            "raw": "" if callback is None else u32_hex(callback["raw"]),
            "pointer": "" if callback is None else u32_hex(callback["pointer"]),
            "function": "" if callback is None else callback["function"],
        },
        "category": {
            "field_03": maybe_cell(row, 0x03),
            "field_04": maybe_cell(row, 0x04),
            "computed": computed_category,
            "computed_hex": u32_hex(computed_category),
            "rule": category_rule,
            "gameplay_type_bits": gameplay_type_bits(computed_category),
        },
        "route_flags_old_formula": {
            "route": route,
            "flags": None if flags is None else u32_hex(flags),
            "covered": route is not None,
        },
        "phase_callbacks": [
            phase_record(row, 0x02, func975),
            phase_record(row, 0x7C, func975),
            phase_record(row, 0x7D, func975),
        ],
        "transition_range": {
            "start_zero_based": maybe_signed(row, 0x7E),
            "end_zero_based": maybe_signed(row, 0x7F),
        },
        "derived_links": derived_links(row, action_hash_index),
        "fields": {
            "field_01": maybe_cell(row, 0x01),
            "field_05": maybe_cell(row, 0x05),
            "field_06": maybe_cell(row, 0x06),
            "field_08": maybe_cell(row, 0x08),
            "field_09": maybe_cell(row, 0x09),
            "field_1C": maybe_cell(row, 0x1C),
            "field_1D": maybe_cell(row, 0x1D),
            "field_1E": maybe_cell(row, 0x1E),
            "field_1F": maybe_cell(row, 0x1F),
            "field_20": maybe_cell(row, 0x20),
            "field_21": maybe_cell(row, 0x21),
            "field_22": maybe_cell(row, 0x22),
            "field_2C": maybe_cell(row, 0x2C),
            "field_58": maybe_cell(row, 0x58),
            "field_6E": maybe_cell(row, 0x6E),
        },
    }


def transition_known_fields(row, func975):
    predicate = row[0x1C] if len(row) > 0x1C else 0
    return {
        "action_hashes": {
            "primary": maybe_cell(row, 0x01),
            "extra_1F": maybe_cell(row, 0x1F),
            "extra_20": maybe_cell(row, 0x20),
            "extra_21": maybe_cell(row, 0x21),
            "extra_22": maybe_cell(row, 0x22),
        },
        "state": maybe_cell(row, 0x02),
        "mode": maybe_cell(row, 0x06),
        "return_values": {
            "field_04": maybe_cell(row, 0x04),
            "field_05": maybe_cell(row, 0x05),
        },
        "predicate": {
            "field_1C": u32_hex(predicate),
            "function": "" if predicate in (0, 0xFFFFFFFF) else func975.get(predicate, ""),
        },
        "timing": {
            "field_1D": maybe_signed(row, 0x1D),
            "field_1E": maybe_signed(row, 0x1E),
        },
    }


def row_record(row_index, row, table, resolver, func975, action_hash_index, non_empty_only):
    is_empty = not any(row)
    if non_empty_only and is_empty:
        return None
    record = {
        "row": row_index,
        "is_empty": is_empty,
        "raw_cells": hex_cells(row),
    }
    if table["marker"] == MAIN_TABLE_MARKER and table["columns"] > 0x7F:
        record["kind"] = "action"
        record["known"] = action_known_fields(row, resolver, func975, action_hash_index)
    elif table["marker"] == TRANSITION_TABLE_MARKER and table["columns"] >= 0x23:
        record["kind"] = "transition"
        record["known"] = transition_known_fields(row, func975)
    else:
        record["kind"] = "raw"
        record["known"] = {}
    return record


def export_human_readable(path, msc_dir, non_empty_only):
    parsed = parse_chrsysparam(path)
    resolver, func975 = parse_msc_context(msc_dir)
    exported = {
        "schema": "research.chrsysparam.human.v0",
        "source_path": str(path),
        "unit_id": parsed["unit_id"],
        "unit_id_hex": u32_hex(parsed["unit_id"]),
        "reserved": u32_hex(parsed["reserved"]),
        "tables": [],
    }

    for table in parsed["tables"]:
        action_hash_index = (
            build_action_hash_index(table["data"])
            if table["marker"] == MAIN_TABLE_MARKER and table["columns"] > 0x7F
            else {}
        )
        table_record = {
            "index": table["index"],
            "offset": u32_hex(table["offset"]),
            "marker": u32_hex(table["marker"]),
            "rows": table["rows"],
            "columns": table["columns"],
            "reserved": u32_hex(table["reserved"]),
            "data_start": u32_hex(table["data_start"]),
            "data_end": u32_hex(table["data_end"]),
            "duplicate_action_hashes": {
                u32_hex(key): rows for key, rows in action_hash_index.items() if len(rows) > 1
            },
            "row_records": [],
        }
        for row_index, row in enumerate(table["data"]):
            record = row_record(row_index, row, table, resolver, func975, action_hash_index, non_empty_only)
            if record is not None:
                table_record["row_records"].append(record)
        exported["tables"].append(table_record)
    return exported


def main():
    parser = ArgumentParser(description="Export chrsysparam.csyspm as a human-readable research JSON document.")
    parser.add_argument("path", help="Path to chrsysparam.csyspm")
    parser.add_argument("--msc-dir", help="Matching decompiled MSC directory with 2.c and 2.txt")
    parser.add_argument("--non-empty-only", action="store_true", help="omit fully zero rows from the JSON")
    parser.add_argument("--output", help="Optional output path. Defaults to stdout.")
    args = parser.parse_args()

    exported = export_human_readable(Path(args.path), args.msc_dir, args.non_empty_only)
    text = json.dumps(exported, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    else:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
