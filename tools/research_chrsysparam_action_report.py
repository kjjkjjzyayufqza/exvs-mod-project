from argparse import ArgumentParser
from pathlib import Path
import csv
import re
import sys

from research_chrsysparam_700002 import emulate_old_func_786, parse_chrsysparam, u32_hex


FUNC_POINTER_RE = re.compile(r"\[func_name: (func_\d+), pointer: (\d+)\]")
RESOLVER_CASE_RE = re.compile(
    r"arg0\s*==\s*(0x[0-9a-fA-F]+|\d+)\)\s*\{\s*return\s+(0x[0-9a-fA-F]+|\d+);",
    re.MULTILINE,
)
FUNC975_CASE_RE = re.compile(
    r"case\s+(0x[0-9a-fA-F]+|\d+):\s*var1\s*=\s*(func_\d+);",
    re.MULTILINE,
)


def parse_int(text):
    return int(text, 0)


def read_text(path):
    return Path(path).read_text(encoding="utf-8", errors="replace")


def parse_function_pointers(txt_path):
    pointer_to_name = {}
    if not txt_path or not Path(txt_path).exists():
        return pointer_to_name
    for match in FUNC_POINTER_RE.finditer(read_text(txt_path)):
        pointer_to_name[int(match.group(2))] = match.group(1)
    return pointer_to_name


def parse_func_873(c_path, pointer_to_name):
    text = read_text(c_path)
    start = text.find("int func_873(")
    if start < 0:
        return {}
    end = text.find("\nvoid ", start + 1)
    block = text[start:] if end < 0 else text[start:end]
    resolver = {}
    for group_text, raw_text in RESOLVER_CASE_RE.findall(block):
        group = parse_int(group_text)
        raw_pointer = parse_int(raw_text)
        pointer = raw_pointer + 0x30
        resolver[group] = {
            "raw": raw_pointer,
            "pointer": pointer,
            "function": pointer_to_name.get(pointer, ""),
        }
    return resolver


def parse_func_975(c_path):
    text = read_text(c_path)
    start = text.find("int func_975(")
    if start < 0:
        return {}
    end = text.find("\nvoid ", start + 1)
    block = text[start:] if end < 0 else text[start:end]
    return {parse_int(hash_text): func_name for hash_text, func_name in FUNC975_CASE_RE.findall(block)}


def parse_msc_context(msc_dir):
    if not msc_dir:
        return {}, {}
    root = Path(msc_dir)
    pointer_to_name = parse_function_pointers(root / "2.txt")
    resolver = parse_func_873(root / "2.c", pointer_to_name)
    func975 = parse_func_975(root / "2.c")
    return resolver, func975


def func_name_for_hash(func975, value):
    if value in (0, 0xFFFFFFFF):
        return ""
    return func975.get(value, "")


def action_record(path, unit_id, table, row_index, row, resolver, func975):
    group = row[0x0A]
    route, flags = emulate_old_func_786(row)
    callback = resolver.get(group)
    phase0 = row[0x02]
    phase1 = row[0x7C] if len(row) > 0x7C else 0
    phase2 = row[0x7D] if len(row) > 0x7D else 0
    return {
        "kind": "action",
        "file": str(path),
        "unit_id": str(unit_id),
        "table": str(table["index"]),
        "row": str(row_index),
        "action_hash": u32_hex(row[0x2E]),
        "group": f"0x{group:02X}",
        "callback_raw": "" if callback is None else u32_hex(callback["raw"]),
        "callback_pointer": "" if callback is None else u32_hex(callback["pointer"]),
        "callback_function": "" if callback is None else callback["function"],
        "field_01": u32_hex(row[0x01]),
        "field_02": u32_hex(row[0x02]),
        "field_03": u32_hex(row[0x03]),
        "field_04": u32_hex(row[0x04]),
        "field_05": u32_hex(row[0x05]),
        "field_06": u32_hex(row[0x06]),
        "field_08": u32_hex(row[0x08]),
        "field_09": u32_hex(row[0x09]),
        "route": "" if route is None else str(route),
        "flags": "" if flags is None else u32_hex(flags),
        "phase0_key": u32_hex(phase0),
        "phase0_function": func_name_for_hash(func975, phase0),
        "phase1_key": u32_hex(phase1),
        "phase1_function": func_name_for_hash(func975, phase1),
        "phase2_key": u32_hex(phase2),
        "phase2_function": func_name_for_hash(func975, phase2),
        "transition_start": signed_cell(row[0x7E]) if len(row) > 0x7E else "",
        "transition_end": signed_cell(row[0x7F]) if len(row) > 0x7F else "",
        "field_1c": u32_hex(row[0x1C]),
        "field_1d": u32_hex(row[0x1D]),
        "field_1e": u32_hex(row[0x1E]),
        "field_1f": u32_hex(row[0x1F]),
        "field_20": u32_hex(row[0x20]),
        "field_21": u32_hex(row[0x21]),
        "field_22": u32_hex(row[0x22]),
        "field_6e": u32_hex(row[0x6E]),
        "status": action_status(callback, route),
    }


def signed_cell(value):
    return str(value - 0x100000000 if value & 0x80000000 else value)


def action_status(callback, route):
    if callback is None:
        return "no_group_callback"
    if not callback["function"]:
        return "callback_pointer_unresolved"
    if route is None:
        return "callback_only_route_unknown"
    return "callback_and_old_route"


def transition_record(path, unit_id, table, row_index, row, func975):
    predicate = row[0x1C] if len(row) > 0x1C else 0
    return {
        "kind": "transition",
        "file": str(path),
        "unit_id": str(unit_id),
        "table": str(table["index"]),
        "row": str(row_index),
        "action_hash": u32_hex(row[0x01]) if len(row) > 0x01 else "",
        "group": "",
        "callback_raw": "",
        "callback_pointer": "",
        "callback_function": "",
        "field_01": u32_hex(row[0x01]) if len(row) > 0x01 else "",
        "field_02": u32_hex(row[0x02]) if len(row) > 0x02 else "",
        "field_03": u32_hex(row[0x03]) if len(row) > 0x03 else "",
        "field_04": u32_hex(row[0x04]) if len(row) > 0x04 else "",
        "field_05": u32_hex(row[0x05]) if len(row) > 0x05 else "",
        "field_06": u32_hex(row[0x06]) if len(row) > 0x06 else "",
        "field_08": u32_hex(row[0x08]) if len(row) > 0x08 else "",
        "field_09": u32_hex(row[0x09]) if len(row) > 0x09 else "",
        "route": "",
        "flags": "",
        "phase0_key": "",
        "phase0_function": "",
        "phase1_key": "",
        "phase1_function": "",
        "phase2_key": "",
        "phase2_function": "",
        "transition_start": "",
        "transition_end": "",
        "field_1c": u32_hex(predicate) if len(row) > 0x1C else "",
        "field_1d": signed_cell(row[0x1D]) if len(row) > 0x1D else "",
        "field_1e": signed_cell(row[0x1E]) if len(row) > 0x1E else "",
        "field_1f": u32_hex(row[0x1F]) if len(row) > 0x1F else "",
        "field_20": u32_hex(row[0x20]) if len(row) > 0x20 else "",
        "field_21": u32_hex(row[0x21]) if len(row) > 0x21 else "",
        "field_22": u32_hex(row[0x22]) if len(row) > 0x22 else "",
        "field_6e": "",
        "status": transition_status(row, func975),
        "source_slot": "",
        "source_delay": "",
        "target_row": "",
        "target_action_hash": "",
        "target_group": "",
        "target_field_04": "",
        "target_field_06": "",
    }


def derived_record(path, unit_id, table, rows_by_action_hash, row_index, row, slot, resolver):
    key = row[0x30 + slot]
    delay = row[0x59 + slot]
    target_index = rows_by_action_hash.get(key)
    target = None if target_index is None else table["data"][target_index]
    target_callback = None if target is None else resolver.get(target[0x0A])
    record = {
        "kind": "derived",
        "file": str(path),
        "unit_id": str(unit_id),
        "table": str(table["index"]),
        "row": str(row_index),
        "action_hash": u32_hex(row[0x2E]),
        "group": f"0x{row[0x0A]:02X}",
        "callback_raw": "",
        "callback_pointer": "",
        "callback_function": "",
        "field_01": "",
        "field_02": "",
        "field_03": u32_hex(row[0x03]),
        "field_04": u32_hex(row[0x04]),
        "field_05": "",
        "field_06": u32_hex(row[0x06]),
        "field_08": "",
        "field_09": "",
        "route": "",
        "flags": "",
        "phase0_key": "",
        "phase0_function": "",
        "phase1_key": "",
        "phase1_function": "",
        "phase2_key": "",
        "phase2_function": "",
        "transition_start": "",
        "transition_end": "",
        "field_1c": "",
        "field_1d": "",
        "field_1e": "",
        "field_1f": "",
        "field_20": "",
        "field_21": "",
        "field_22": "",
        "field_6e": "",
        "status": "target_found" if target is not None else "target_missing",
        "source_slot": str(slot),
        "source_delay": str(delay),
        "target_row": "" if target_index is None else str(target_index),
        "target_action_hash": u32_hex(key),
        "target_group": "" if target is None else f"0x{target[0x0A]:02X}",
        "target_callback_function": "" if target_callback is None else target_callback["function"],
        "target_field_04": "" if target is None else u32_hex(target[0x04]),
        "target_schedule_mask": "" if target is None else u32_hex(schedule_mask_for_field_04(target[0x04])),
        "target_field_06": "" if target is None else u32_hex(target[0x06]),
    }
    return record


def schedule_mask_for_field_04(value):
    mask = 0
    if value == 0:
        mask |= 0x1
    if value in (0x4, 0xC, 0x3C):
        mask |= 0x2
    if value in (0x8, 0xC, 0x3C):
        mask |= 0x4
    if value in (0x20, 0x30, 0x3C):
        mask |= 0x10
    if value in (0x10, 0x30, 0x3C):
        mask |= 0x8
    if value == 0x40:
        mask |= 0x20
    if value == 0x41:
        mask |= 0x40
    if value == 0x42:
        mask |= 0x80
    if value == 0x43:
        mask |= 0x100
    if value == 0x44:
        mask |= 0x400
    if value == 0x45:
        mask |= 0x200
    if value == 0x46:
        mask |= 0x800
    return mask


def transition_status(row, func975):
    mode = row[0x06] if len(row) > 0x06 else 0
    predicate = row[0x1C] if len(row) > 0x1C else 0
    predicate_status = "predicate_known" if func_name_for_hash(func975, predicate) else "predicate_none"
    if predicate not in (0, 0xFFFFFFFF) and predicate_status == "predicate_none":
        predicate_status = "predicate_unresolved"
    return f"mode_{mode}_{predicate_status}"


def iter_records(parsed, resolver, func975, mode):
    path = parsed["path"]
    unit_id = parsed["unit_id"]
    for table in parsed["tables"]:
        if table["index"] == 0 and table["columns"] > 0x7F and mode in ("all", "actions", "derived"):
            rows_by_action_hash = {
                row[0x2E]: row_index
                for row_index, row in enumerate(table["data"])
                if any(value != 0 for value in row) and row[0x2E] != 0
            }
            for row_index, row in enumerate(table["data"]):
                if any(value != 0 for value in row):
                    if mode in ("all", "actions"):
                        yield action_record(path, unit_id, table, row_index, row, resolver, func975)
                    if mode == "derived":
                        for slot in range(10):
                            if row[0x30 + slot] != 0:
                                yield derived_record(
                                    path, unit_id, table, rows_by_action_hash, row_index, row, slot, resolver
                                )
        if table["index"] == 1 and table["columns"] > 0x22 and mode in ("all", "transitions"):
            for row_index, row in enumerate(table["data"]):
                if any(value != 0 for value in row):
                    yield transition_record(path, unit_id, table, row_index, row, func975)


def write_records(records, output_format):
    fieldnames = [
        "kind",
        "file",
        "unit_id",
        "table",
        "row",
        "action_hash",
        "group",
        "callback_raw",
        "callback_pointer",
        "callback_function",
        "field_01",
        "field_02",
        "field_03",
        "field_04",
        "field_05",
        "field_06",
        "field_08",
        "field_09",
        "route",
        "flags",
        "phase0_key",
        "phase0_function",
        "phase1_key",
        "phase1_function",
        "phase2_key",
        "phase2_function",
        "transition_start",
        "transition_end",
        "field_1c",
        "field_1d",
        "field_1e",
        "field_1f",
        "field_20",
        "field_21",
        "field_22",
        "field_6e",
        "status",
        "source_slot",
        "source_delay",
        "target_row",
        "target_action_hash",
        "target_group",
        "target_callback_function",
        "target_field_04",
        "target_schedule_mask",
        "target_field_06",
    ]
    delimiter = "," if output_format == "csv" else "\t"
    writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames, delimiter=delimiter, lineterminator="\n")
    writer.writeheader()
    for record in records:
        writer.writerow(record)


def main():
    parser = ArgumentParser(
        description="Build a row-evidence report for chrsysparam action and transition tables."
    )
    parser.add_argument("path", help="chrsysparam.csyspm file to inspect")
    parser.add_argument("--msc-dir", help="directory containing matching 2.c and 2.txt")
    parser.add_argument("--mode", choices=("all", "actions", "transitions", "derived"), default="all")
    parser.add_argument("--format", choices=("tsv", "csv"), default="tsv")
    args = parser.parse_args()

    resolver, func975 = parse_msc_context(args.msc_dir)
    parsed = parse_chrsysparam(Path(args.path))
    write_records(iter_records(parsed, resolver, func975, args.mode), args.format)


if __name__ == "__main__":
    main()
