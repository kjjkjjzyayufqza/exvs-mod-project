from argparse import ArgumentParser
from pathlib import Path
import csv
import struct
import sys


MAIN_TABLE_MARKER = 0xA8BBBAB9


def u32_hex(value):
    return f"0x{value:08X}"


def parse_chrsysparam(path):
    data = Path(path).read_bytes()
    if len(data) < 0x14:
        raise ValueError(f"{path}: file too small")

    magic, version, unit_id, reserved, table_count = struct.unpack_from("<5I", data, 0)
    if magic != 0xB4ACACAF:
        raise ValueError(f"{path}: unexpected magic {u32_hex(magic)}")
    if version != 0x00010000:
        raise ValueError(f"{path}: unexpected version {u32_hex(version)}")

    offsets_end = 0x14 + table_count * 4
    if offsets_end > len(data):
        raise ValueError(f"{path}: table offset list exceeds file size")

    table_offsets = struct.unpack_from("<" + "I" * table_count, data, 0x14)
    tables = []
    for table_index, offset in enumerate(table_offsets):
        if offset + 0x10 > len(data):
            raise ValueError(f"{path}: table {table_index} header exceeds file size")
        marker, rows, columns, table_reserved = struct.unpack_from("<4I", data, offset)
        data_start = offset + 0x10
        data_end = data_start + rows * columns * 4
        if data_end > len(data):
            raise ValueError(f"{path}: table {table_index} data exceeds file size")
        table_rows = [
            struct.unpack_from("<" + "I" * columns, data, data_start + row_index * columns * 4)
            for row_index in range(rows)
        ]
        tables.append(
            {
                "index": table_index,
                "offset": offset,
                "marker": marker,
                "rows": rows,
                "columns": columns,
                "reserved": table_reserved,
                "data_start": data_start,
                "data_end": data_end,
                "data": table_rows,
            }
        )

    return {
        "path": str(path),
        "unit_id": unit_id,
        "reserved": reserved,
        "tables": tables,
    }


def emulate_old_func_786(row):
    group = row[0x0A]
    extra_400 = 0x400 if row[0x2C] == 1 else 0
    base_flag = 0x200 if row[0x03] > 0x12C else 0x20000

    if group == 0x00:
        return 0, 0x1 + extra_400 + base_flag
    if group in (0x03, 0x05, 0x10):
        return 1, 0x1 + extra_400 + base_flag
    if group in (0x0C, 0x0D, 0x2D):
        return 1, 0x2 + extra_400 + base_flag
    if group == 0x15:
        return 1, 0x401 + base_flag
    if group == 0x1F:
        return 1, (0x402 if row[0x6E] else 0x4) + base_flag
    return None, None


def iter_main_rows(parsed):
    for table in parsed["tables"]:
        if table["marker"] == MAIN_TABLE_MARKER and table["columns"] > 0x6E:
            for row_index, row in enumerate(table["data"]):
                if any(value != 0 for value in row):
                    yield table, row_index, row


def row_record(path, unit_id, table, row_index, row):
    route, flags = emulate_old_func_786(row)
    status = "supported_old_func_786" if route is not None else "unsupported_group"
    return {
        "file": str(path),
        "unit_id": str(unit_id),
        "table": str(table["index"]),
        "row": str(row_index),
        "action": u32_hex(row[0x2E]),
        "group": f"0x{row[0x0A]:02X}",
        "field_03": u32_hex(row[0x03]),
        "field_04": u32_hex(row[0x04]),
        "field_2c": u32_hex(row[0x2C]),
        "field_6e": u32_hex(row[0x6E]),
        "route": "" if route is None else str(route),
        "flags": "" if flags is None else u32_hex(flags),
        "status": status,
    }


def write_records(records, output_format):
    fieldnames = [
        "file",
        "unit_id",
        "table",
        "row",
        "action",
        "group",
        "field_03",
        "field_04",
        "field_2c",
        "field_6e",
        "route",
        "flags",
        "status",
    ]
    delimiter = "," if output_format == "csv" else "\t"
    writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames, delimiter=delimiter, lineterminator="\n")
    writer.writeheader()
    for record in records:
        writer.writerow(record)


def main():
    parser = ArgumentParser(
        description="Research helper for old func_786-style route/flags emulation on chrsysparam.csyspm table0 rows."
    )
    parser.add_argument("paths", nargs="+", help="chrsysparam.csyspm files to inspect")
    parser.add_argument("--format", choices=("tsv", "csv"), default="tsv")
    parser.add_argument("--supported-only", action="store_true", help="hide rows whose group is not covered by old func_786")
    args = parser.parse_args()

    records = []
    for raw_path in args.paths:
        path = Path(raw_path)
        parsed = parse_chrsysparam(path)
        for table, row_index, row in iter_main_rows(parsed):
            record = row_record(path, parsed["unit_id"], table, row_index, row)
            if args.supported_only and record["status"] != "supported_old_func_786":
                continue
            records.append(record)

    write_records(records, args.format)


if __name__ == "__main__":
    main()
