"""Cross-check param-file field hashes against MSC syscall evidence.

Why
---
`speedparam` / `characterparam` English field names in this repo were largely
inherited from a label list, not from proven consumers. Before any name can be
trusted we need two mechanical facts per hash:

1. Does the hash actually exist in real parameter files, and with which kind and
   which distinct values across the corpus?
2. Is the hash actually read by anything (MSC script via `sys_0(tableId, ...)`),
   and if so from how many distinct units and functions?

This script joins those two sources. It interprets nothing.

Inputs
------
- Real `.bin` parameter files, parsed through the project's own `exvs2_json`
  debug CLI (single source of truth for layout).
- `by_field.tsv` produced by `tools/param_msc_usage_scan.py`.

Outputs
-------
- `<out>/file_fields.tsv`  per (file_type, hash): kind, offset, value spread
- `<out>/crosscheck.tsv`   per hash: file presence + MSC read evidence
- `<out>/anomalies.tsv`    hashes present in file but never read, and vice versa

Usage
-----
    python tools/param_evidence_crosscheck.py \
        --cpm-root "E:\\XB\\解包\\com\\file\\041cpm" \
        --cpm-root "E:\\XB\\mod\\041cpm" \
        --msc-by-field tmp/param-evidence/full/by_field.tsv \
        --out tmp/param-evidence/crosscheck
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
from collections import defaultdict
from typing import Any, Iterator

DEFAULT_CLI = os.path.join("src-tauri", "target", "debug", "exvs2_json.exe")

# MSC syscall table id -> parameter file base name.
# Only 0x60006 is asserted by existing project docs; the rest stay unlabeled and
# are resolved by hash-set intersection at runtime.
TABLE_HINTS = {"0x60006": "speedparam"}

TARGET_FILES = (
    "speedparam.bin",
    "characterparam.bin",
    "armsparam.bin",
    "bulletparam.bin",
    "grapparam.bin",
    "hitgroupiddef.bin",
    "interactionid.bin",
    "projectile_depiction_table.bin",
    "foroutgamecharacterparam_playable.bin",
    "foroutgamecharacterparam_boss.bin",
    "foroutgamecharacterparam_zako.bin",
)


def iter_param_files(roots: list[str], any_magic: bool = False) -> Iterator[str]:
    """Yield candidate parameter files.

    By default only the known filenames are returned. With ``any_magic`` every
    file whose first four bytes are the param-binary magic is returned, whatever
    it is called. Relying on a hardcoded filename list is what left 84 native
    field hashes unattributed and two MSC table ids unbound: the owning files
    simply were not in the list.
    """
    for root in roots:
        if not os.path.isdir(root):
            print(f"skip missing root: {root}", file=sys.stderr)
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d != ".git"]
            for name in filenames:
                path = os.path.join(dirpath, name)
                if name in TARGET_FILES:
                    yield path
                    continue
                if not any_magic:
                    continue
                try:
                    with open(path, "rb") as handle:
                        if handle.read(4) == b"\xa9\xb8\xab\xcd":
                            yield path
                except OSError:
                    continue


def run_cli(cli: str, path: str) -> dict[str, Any] | None:
    try:
        proc = subprocess.run(
            [cli, "inspect", path, "--pretty"],
            capture_output=True,
            timeout=180,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"cli failed on {path}: {exc}", file=sys.stderr)
        return None
    if proc.returncode != 0:
        print(f"cli rc={proc.returncode} on {path}", file=sys.stderr)
        return None
    try:
        return json.loads(proc.stdout.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        print(f"bad json from {path}: {exc}", file=sys.stderr)
        return None


def find_hash_records(node: Any, trail: str = "") -> Iterator[tuple[str, dict]]:
    """Yield (json_path, dict) for any dict that looks like a field descriptor.

    A field descriptor is any object carrying a hash-ish key. Shape discovery is
    deliberate: the CLI schema is allowed to evolve without breaking this tool.
    """
    hash_keys = ("hash", "fieldHash", "commandHash", "keyHash")
    if isinstance(node, dict):
        if any(k in node for k in hash_keys):
            yield trail, node
        for key, value in node.items():
            yield from find_hash_records(value, f"{trail}.{key}" if trail else key)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from find_hash_records(value, f"{trail}[{index}]")


def normalize_hash(value: Any) -> str | None:
    if isinstance(value, int):
        return f"0x{value & 0xFFFFFFFF:08x}"
    if isinstance(value, str):
        text = value.strip()
        try:
            return f"0x{int(text, 16) & 0xFFFFFFFF:08x}"
        except ValueError:
            return None
    return None


def pick(record: dict, *names: str) -> Any:
    for name in names:
        if name in record:
            return record[name]
    return None


def read_param_binary(path: str) -> dict | None:
    """Layout-faithful read-only parser mirroring `param_bin_format.rs`.

    The `exvs2_json` CLI does not expose every param type (`characterparam` has
    no `--type`), so this fallback reads the binary directly. Layout constants
    are taken from `src-tauri/src/format/param_bin_format.rs`, which the project
    treats as the ABI authority. Nothing is written back.
    """
    magic_expected = 0xCDABB8A9
    header_size = 0x20
    try:
        with open(path, "rb") as handle:
            data = handle.read()
    except OSError as exc:
        print(f"read failed {path}: {exc}", file=sys.stderr)
        return None
    if len(data) < header_size:
        return None

    def u32(offset: int) -> int:
        return int.from_bytes(data[offset:offset + 4], "little")

    def i32(offset: int) -> int:
        return int.from_bytes(data[offset:offset + 4], "little", signed=True)

    if u32(0x00) != magic_expected:
        return None
    entry_count = u32(0x10)
    cmd_count = u32(0x14)
    entry_size = u32(0x18)

    hash_base = header_size
    desc_base = hash_base + cmd_count * 4
    ids_base = desc_base + cmd_count * 12
    entries_base = ids_base + entry_count * 4
    entries_end = entries_base + entry_count * entry_size
    if entries_end > len(data):
        print(f"truncated param file {path}", file=sys.stderr)
        return None

    specs = []
    for index in range(cmd_count):
        off = desc_base + index * 12
        specs.append({
            "hash": u32(hash_base + index * 4),
            "entryOffset": u32(off),
            "flags": u32(off + 4),
            "kind": u32(off + 8),
        })
    entry_ids = [u32(ids_base + i * 4) for i in range(entry_count)]
    rows = []
    for index in range(entry_count):
        start = entries_base + index * entry_size
        row = {}
        for spec in specs:
            off = start + spec["entryOffset"]
            if off + 4 > entries_end:
                continue
            kind = spec["kind"]
            if kind == 5:
                import struct
                row[spec["hash"]] = round(
                    struct.unpack_from("<f", data, off)[0], 6
                )
            elif kind == 2:
                row[spec["hash"]] = i32(off)
            else:
                row[spec["hash"]] = u32(off)
        rows.append(row)
    return {
        "entryCount": entry_count,
        "commandsCount": cmd_count,
        "entrySize": entry_size,
        "fieldSpecs": specs,
        "entryIds": entry_ids,
        "rows": rows,
    }


def collect_file_fields(cli: str, paths: list[str], probe: bool) -> dict:
    """Return {file_type: {hash: {kind, offsets, values, files}}}."""
    out: dict[str, dict[str, dict]] = defaultdict(dict)
    for index, path in enumerate(paths, 1):
        file_type = os.path.basename(path).rsplit(".", 1)[0]
        parsed = read_param_binary(path)
        if parsed is None:
            print(f"[{index}/{len(paths)}] SKIP unparsed {path}", file=sys.stderr)
            continue
        if probe and index <= 1:
            print(f"--- probe {path} ({file_type}) ---")
            print(f"  entries={parsed['entryCount']} "
                  f"fields={parsed['commandsCount']} "
                  f"entrySize={parsed['entrySize']}")
        folder = os.path.basename(os.path.dirname(path))
        for spec in parsed["fieldSpecs"]:
            key = f"0x{spec['hash'] & 0xFFFFFFFF:08x}"
            slot = out[file_type].setdefault(
                key,
                {"kinds": set(), "offsets": set(), "values": set(), "files": set()},
            )
            slot["kinds"].add(str(spec["kind"]))
            slot["offsets"].add(f"0x{spec['entryOffset']:03x}")
            slot["files"].add(folder)
            for row in parsed["rows"]:
                if spec["hash"] in row:
                    slot["values"].add(str(row[spec["hash"]]))
        print(f"[{index}/{len(paths)}] {file_type} entries={parsed['entryCount']} "
              f"fields={parsed['commandsCount']} {path}")
    return out


def load_msc_by_field(path: str) -> dict[tuple[str, str], dict]:
    rows: dict[tuple[str, str], dict] = {}
    if not os.path.isfile(path):
        print(f"missing msc by_field: {path}", file=sys.stderr)
        return rows
    with open(path, "r", encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            table = row.get("table_id", "")
            field_hash = normalize_hash(row.get("field_hash", "")) or ""
            if not table or not field_hash:
                continue
            rows[(table, field_hash)] = row
    return rows


def write_tsv(path: str, columns: list[str], rows: list[dict]) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\t".join(columns) + "\n")
        for row in rows:
            handle.write("\t".join(str(row.get(c, "")) for c in columns) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cpm-root", action="append", required=True)
    parser.add_argument("--msc-by-field", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--cli", default=DEFAULT_CLI)
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--max-files", type=int, default=0)
    parser.add_argument("--any-magic", action="store_true",
                        help="include every file carrying the param-binary magic, "
                             "not just the known filenames")
    args = parser.parse_args(argv)

    if not os.path.isfile(args.cli):
        print(f"note: cli not found at {args.cli}; using built-in "
              f"layout-faithful reader only", file=sys.stderr)

    paths = sorted(set(iter_param_files(args.cpm_root, args.any_magic)))
    if args.max_files:
        paths = paths[: args.max_files]
    if not paths:
        print("no parameter files found", file=sys.stderr)
        return 2
    print(f"parameter files: {len(paths)}")

    file_fields = collect_file_fields(args.cli, paths, args.probe)
    msc = load_msc_by_field(args.msc_by_field)

    os.makedirs(args.out, exist_ok=True)

    file_rows: list[dict] = []
    for file_type, fields in sorted(file_fields.items()):
        for field_hash, slot in sorted(fields.items()):
            file_rows.append({
                "file_type": file_type,
                "hash": field_hash,
                "kinds": ",".join(sorted(slot["kinds"])),
                "offsets": ",".join(sorted(slot["offsets"])[:4]),
                "distinct_values": len(slot["values"]),
                "sample_values": ",".join(sorted(slot["values"])[:8]),
                "file_count": len(slot["files"]),
            })
    write_tsv(
        os.path.join(args.out, "file_fields.tsv"),
        ["file_type", "hash", "kinds", "offsets", "distinct_values",
         "sample_values", "file_count"],
        file_rows,
    )

    # Table id <-> file type resolution by hash-set intersection.
    msc_tables: dict[str, set[str]] = defaultdict(set)
    for (table, field_hash) in msc:
        msc_tables[table].add(field_hash)
    resolution: list[dict] = []
    for table, hashes in sorted(msc_tables.items()):
        for file_type, fields in sorted(file_fields.items()):
            overlap = hashes & set(fields)
            if not overlap:
                continue
            resolution.append({
                "table_id": table,
                "file_type": file_type,
                "msc_hashes": len(hashes),
                "file_hashes": len(fields),
                "overlap": len(overlap),
                "overlap_pct_of_msc": f"{100.0 * len(overlap) / len(hashes):.1f}",
                "hint": TABLE_HINTS.get(table, ""),
            })
    resolution.sort(key=lambda r: (-r["overlap"], r["table_id"]))
    write_tsv(
        os.path.join(args.out, "table_resolution.tsv"),
        ["table_id", "file_type", "msc_hashes", "file_hashes", "overlap",
         "overlap_pct_of_msc", "hint"],
        resolution,
    )

    # Per-hash join, scoped to the best-matching table for each file type.
    best_table: dict[str, str] = {}
    for row in resolution:
        best_table.setdefault(row["file_type"], row["table_id"])

    cross_rows: list[dict] = []
    anomaly_rows: list[dict] = []
    for file_type, fields in sorted(file_fields.items()):
        table = best_table.get(file_type, "")
        for field_hash, slot in sorted(fields.items()):
            msc_row = msc.get((table, field_hash)) if table else None
            entry = {
                "file_type": file_type,
                "hash": field_hash,
                "table_id": table,
                "kinds": ",".join(sorted(slot["kinds"])),
                "distinct_values": len(slot["values"]),
                "msc_sites": msc_row.get("sites", 0) if msc_row else 0,
                "msc_units": msc_row.get("units_count", 0) if msc_row else 0,
                "msc_funcs": msc_row.get("funcs_count", 0) if msc_row else 0,
                "msc_read": "yes" if msc_row else "no",
            }
            cross_rows.append(entry)
            if not msc_row:
                anomaly_rows.append({
                    "kind": "in_file_never_read_by_msc",
                    "file_type": file_type,
                    "table_id": table,
                    "hash": field_hash,
                    "detail": f"distinct_values={len(slot['values'])}",
                })
        if table:
            file_hash_set = set(fields)
            for field_hash in sorted(msc_tables.get(table, set())):
                if field_hash not in file_hash_set:
                    anomaly_rows.append({
                        "kind": "read_by_msc_absent_from_file",
                        "file_type": file_type,
                        "table_id": table,
                        "hash": field_hash,
                        "detail": msc[(table, field_hash)].get("sites", ""),
                    })
    write_tsv(
        os.path.join(args.out, "crosscheck.tsv"),
        ["file_type", "table_id", "hash", "kinds", "distinct_values",
         "msc_read", "msc_sites", "msc_units", "msc_funcs"],
        cross_rows,
    )
    write_tsv(
        os.path.join(args.out, "anomalies.tsv"),
        ["kind", "file_type", "table_id", "hash", "detail"],
        anomaly_rows,
    )

    print(f"file_fields={len(file_rows)} crosscheck={len(cross_rows)} "
          f"anomalies={len(anomaly_rows)} out={args.out}")
    for row in resolution[:8]:
        print(f"  table {row['table_id']} ~ {row['file_type']}: "
              f"overlap {row['overlap']}/{row['msc_hashes']} "
              f"({row['overlap_pct_of_msc']}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
