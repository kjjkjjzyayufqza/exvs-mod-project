from argparse import ArgumentParser
from pathlib import Path
import csv
import re
import sys

from research_chrsysparam_700002 import u32_hex
from research_chrsysparam_action_report import signed_cell


SYS_2D_RE = re.compile(
    r"sys_2D\(\s*0x3\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*([^)]+?)\s*\);"
)


def parse_int(text):
    return int(text, 0)


def parse_value(text):
    value = text.strip()
    if re.fullmatch(r"0x[0-9a-fA-F]+|\d+", value):
        return parse_int(value) & 0xFFFFFFFF
    return value


def parse_old_b4ac(path):
    rows = {}
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    for row_text, field_text, value_text in SYS_2D_RE.findall(text):
        row = parse_int(row_text)
        field = parse_int(field_text)
        rows.setdefault(row, {})[field] = parse_value(value_text)
    return rows


def cell(row, field, default=0):
    return row.get(field, default)


def numeric_cell(row, field, default=0):
    value = cell(row, field, default)
    return value if isinstance(value, int) else default


def schedule_mask_for_old_field_04(value):
    mask = 0
    if value == 0:
        mask |= 0x1
    if value in (0x8, 0xC, 0xF):
        mask |= 0x2
    if value in (0x4, 0xC, 0xF):
        mask |= 0x4
    if value in (0x1, 0x3, 0xF):
        mask |= 0x10
    if value in (0x2, 0x3, 0xF):
        mask |= 0x8
    if value == 0x10:
        mask |= 0x20
    if value == 0x11:
        mask |= 0x40
    if value == 0x12:
        mask |= 0x80
    if value == 0x13:
        mask |= 0x100
    if value == 0x14:
        mask |= 0x400
    if value == 0x15:
        mask |= 0x200
    if value == 0x16:
        mask |= 0x800
    return mask


def logical_row(physical_row, base_row):
    return physical_row - base_row + 1


def iter_action_rows(rows, base_row):
    for physical_row, row in sorted(rows.items()):
        action_hash = numeric_cell(row, 0x2E)
        if physical_row >= base_row and action_hash != 0:
            yield physical_row, row


def iter_derived_records(path, rows, base_row):
    action_to_row = {
        numeric_cell(row, 0x2E): physical_row
        for physical_row, row in iter_action_rows(rows, base_row)
    }
    for physical_row, row in iter_action_rows(rows, base_row):
        for slot in range(10):
            key = numeric_cell(row, 0x30 + slot)
            if key == 0:
                continue
            delay = numeric_cell(row, 0x59 + slot)
            target_physical = action_to_row.get(key)
            target = None if target_physical is None else rows[target_physical]
            target_field_04 = "" if target is None else u32_hex(numeric_cell(target, 0x04))
            target_mask = "" if target is None else u32_hex(schedule_mask_for_old_field_04(numeric_cell(target, 0x04)))
            yield {
                "file": str(path),
                "physical_row": u32_hex(physical_row),
                "logical_row": str(logical_row(physical_row, base_row)),
                "action_hash": u32_hex(numeric_cell(row, 0x2E)),
                "group": f"0x{numeric_cell(row, 0x0A):02X}",
                "source_slot": str(slot),
                "source_delay": str(delay),
                "target_physical_row": "" if target_physical is None else u32_hex(target_physical),
                "target_logical_row": "" if target_physical is None else str(logical_row(target_physical, base_row)),
                "target_action_hash": u32_hex(key),
                "target_group": "" if target is None else f"0x{numeric_cell(target, 0x0A):02X}",
                "target_field_04": target_field_04,
                "target_schedule_mask": target_mask,
                "target_field_06": "" if target is None else u32_hex(numeric_cell(target, 0x06)),
                "target_field_7e": "" if target is None else signed_cell(numeric_cell(target, 0x7E)),
                "target_field_7f": "" if target is None else signed_cell(numeric_cell(target, 0x7F)),
                "status": "target_found" if target is not None else "target_missing",
            }


def write_records(records, output_format):
    fieldnames = [
        "file",
        "physical_row",
        "logical_row",
        "action_hash",
        "group",
        "source_slot",
        "source_delay",
        "target_physical_row",
        "target_logical_row",
        "target_action_hash",
        "target_group",
        "target_field_04",
        "target_schedule_mask",
        "target_field_06",
        "target_field_7e",
        "target_field_7f",
        "status",
    ]
    delimiter = "," if output_format == "csv" else "\t"
    writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames, delimiter=delimiter, lineterminator="\n")
    writer.writeheader()
    for record in records:
        writer.writerow(record)


def main():
    parser = ArgumentParser(description="Build a derived-action report for old embedded B4AC sys_2D action rows.")
    parser.add_argument("path", help="old decompiled C file containing sys_2D(0x3, row, field, value)")
    parser.add_argument("--base-row", type=lambda value: int(value, 0), default=0x11)
    parser.add_argument("--format", choices=("tsv", "csv"), default="tsv")
    args = parser.parse_args()

    rows = parse_old_b4ac(args.path)
    write_records(iter_derived_records(Path(args.path), rows, args.base_row), args.format)


if __name__ == "__main__":
    main()
