"""Mechanical extractor for MSC parameter-table syscall usage.

Purpose
-------
Param field semantics in this project were historically named from a label list
(`docs/command_mapping.md`) rather than from proven consumers. This scanner
collects *primary evidence only*: every `sys_N(tableId, ...)` call site found in
decompiled MSC `.c` files, with the assignment target and the raw lines that
later consume that target.

It performs no semantic interpretation. It never writes to the scanned corpus.

Output
------
- `<out>/usage.json`   full structured record set
- `<out>/by_field.tsv` aggregate per (syscall, table_id, field_hash)
- `<out>/tables.tsv`   aggregate per (syscall, table_id)

Usage
-----
    python tools/param_msc_usage_scan.py --root "E:\\XB\\mod\\040msc" \
        --out ".scratch/param-msc-usage"
    python tools/param_msc_usage_scan.py --root "..." --probe
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from typing import Iterable, Iterator

# `sys_0(`, `sys_1(`, `sys_46(`, `sys_4F(` ... capture the syscall index.
SYSCALL_RE = re.compile(r"\bsys_([0-9A-Fa-f]{1,2})\s*\(")

# Function headers emitted by mscdec, e.g. `void func_424()` at column 0.
FUNC_HEADER_RE = re.compile(r"^[A-Za-z_][\w\s\*]*?\b(func_\d+|script_\d+)\s*\(")

# `global507 = sys_0(...)` / `var3 = sys_0(...)`
ASSIGN_RE = re.compile(r"([A-Za-z_]\w*)\s*(?:=|\+=|-=|\*=|/=)\s*$")

# `global162 = (global266 * sys_0(...) / 0x4650 + sys_0(...)) * 0x64;`
# The syscall is nested inside a larger right-hand side, so the assignment
# target must be taken from the head of the statement instead of the text
# immediately preceding the call.
STMT_ASSIGN_RE = re.compile(r"^\s*([A-Za-z_]\w*)\s*(?:=|\+=|-=|\*=|/=)[^=]")

HEX_RE = re.compile(r"^0[xX][0-9A-Fa-f]+$")


@dataclass
class Site:
    """One syscall call site with mechanically collected context."""

    unit: str
    file: str
    line: int
    func: str
    syscall: str
    table_id: str
    args: list[str]
    field_hash: str | None
    entry_arg: str | None
    assigned_to: str | None
    call_text: str
    consumer_lines: list[str] = field(default_factory=list)


def split_args(text: str, start: int) -> tuple[list[str], int]:
    """Split the argument list of a call whose '(' is at ``text[start]``.

    Returns the argument strings and the index just past the matching ')'.
    Nested parens/brackets are respected so ternaries and nested calls survive.
    """
    assert text[start] == "("
    depth = 0
    args: list[str] = []
    buf: list[str] = []
    i = start
    while i < len(text):
        ch = text[i]
        if ch in "([":
            depth += 1
            if depth > 1:
                buf.append(ch)
        elif ch in ")]":
            depth -= 1
            if depth == 0:
                arg = "".join(buf).strip()
                if arg:
                    args.append(arg)
                return args, i + 1
            buf.append(ch)
        elif ch == "," and depth == 1:
            args.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    return args, len(text)


def iter_c_files(root: str) -> Iterator[tuple[str, str]]:
    """Yield (unit_name, absolute_path) for every decompiled `.c` file."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != ".git"]
        rel = os.path.relpath(dirpath, root)
        unit = rel.split(os.sep)[0] if rel != "." else "."
        for name in sorted(filenames):
            if name.lower().endswith(".c"):
                yield unit, os.path.join(dirpath, name)


def read_lines(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        return handle.read().splitlines()


def build_function_index(lines: list[str]) -> list[str]:
    """Map each line index to its enclosing function name."""
    index: list[str] = []
    current = "<toplevel>"
    for raw in lines:
        header = FUNC_HEADER_RE.match(raw)
        if header:
            current = header.group(1)
        index.append(current)
    return index


def collect_consumers(
    lines: list[str],
    func_index: list[str],
    start_index: int,
    symbol: str,
    window: int,
) -> list[str]:
    """Return raw lines after ``start_index`` that mention ``symbol``.

    For a file-scope ``globalN`` the scan deliberately crosses function
    boundaries: MSC state machines load a parameter in one `func_*` and consume it
    in a later one, so the decisive evidence (counter decrements, `<= 0` expiry
    tests, helper calls) usually sits in a different function than the `sys_0`
    call. Each hit is annotated with its enclosing function.

    For a **local** name (`varN`) the scan stops at the next function header.
    Locals are renumbered per function, so a `varN` in a later function is a
    different variable entirely and reporting it as a consumer is a false positive.
    """
    out: list[str] = []
    pattern = re.compile(rf"\b{re.escape(symbol)}\b")
    is_file_scope = symbol.startswith("global")
    for offset in range(1, window + 1):
        idx = start_index + offset
        if idx >= len(lines):
            break
        raw = lines[idx]
        if not is_file_scope and func_index[idx] != func_index[start_index]:
            break
        if pattern.search(raw):
            out.append(f"{idx + 1} [{func_index[idx]}]: {raw.strip()}")
    return out


def scan_file(
    unit: str, path: str, table_filter: set[str] | None, window: int
) -> list[Site]:
    lines = read_lines(path)
    func_index = build_function_index(lines)
    sites: list[Site] = []
    current_func = "<toplevel>"
    for index, raw in enumerate(lines):
        header = FUNC_HEADER_RE.match(raw)
        if header:
            current_func = header.group(1)
        for match in SYSCALL_RE.finditer(raw):
            paren = match.end() - 1
            args, _ = split_args(raw, paren)
            if not args:
                continue
            table_id = args[0]
            if not HEX_RE.match(table_id):
                continue
            normalized = f"0x{int(table_id, 16):x}"
            if table_filter and normalized not in table_filter:
                continue
            # The field hash is the last hex-literal argument; the entry key is
            # whatever sits between the table id and that hash.
            hex_args = [a for a in args[1:] if HEX_RE.match(a)]
            field_hash = f"0x{int(hex_args[-1], 16):08x}" if hex_args else None
            entry_arg = args[1] if len(args) >= 3 else None
            prefix = raw[: match.start()]
            assign = ASSIGN_RE.search(prefix)
            if assign:
                assigned_to = assign.group(1)
            else:
                stmt = STMT_ASSIGN_RE.match(raw)
                assigned_to = stmt.group(1) if stmt else None
            site = Site(
                unit=unit,
                file=path,
                line=index + 1,
                func=current_func,
                syscall=f"sys_{match.group(1)}",
                table_id=normalized,
                args=args,
                field_hash=field_hash,
                entry_arg=entry_arg,
                assigned_to=assigned_to,
                call_text=raw.strip(),
            )
            if assigned_to:
                site.consumer_lines = collect_consumers(
                    lines, func_index, index, assigned_to, window
                )
            sites.append(site)
    return sites


def aggregate(sites: Iterable[Site]) -> tuple[list[dict], list[dict]]:
    by_field: dict[tuple[str, str, str], dict] = {}
    by_table: dict[tuple[str, str], dict] = {}
    for site in sites:
        tkey = (site.syscall, site.table_id)
        trow = by_table.setdefault(
            tkey,
            {
                "syscall": site.syscall,
                "table_id": site.table_id,
                "sites": 0,
                "units": set(),
                "field_hashes": set(),
            },
        )
        trow["sites"] += 1
        trow["units"].add(site.unit)
        if site.field_hash:
            trow["field_hashes"].add(site.field_hash)

        if not site.field_hash:
            continue
        fkey = (site.syscall, site.table_id, site.field_hash)
        frow = by_field.setdefault(
            fkey,
            {
                "syscall": site.syscall,
                "table_id": site.table_id,
                "field_hash": site.field_hash,
                "sites": 0,
                "units": set(),
                "funcs": set(),
                "with_consumers": 0,
            },
        )
        frow["sites"] += 1
        frow["units"].add(site.unit)
        frow["funcs"].add(site.func)
        if site.consumer_lines:
            frow["with_consumers"] += 1

    def finish(rows: Iterable[dict]) -> list[dict]:
        out = []
        for row in rows:
            item = dict(row)
            for key in ("units", "funcs", "field_hashes"):
                if key in item:
                    item[f"{key}_count"] = len(item[key])
                    item[key] = sorted(item[key])
            out.append(item)
        return out

    field_rows = finish(by_field.values())
    table_rows = finish(by_table.values())
    field_rows.sort(key=lambda r: (r["table_id"], r["field_hash"]))
    table_rows.sort(key=lambda r: (-r["sites"], r["table_id"]))
    return field_rows, table_rows


def write_field_evidence(out_dir: str, sites: Iterable[Site], max_sites: int) -> int:
    """Write one plain-text evidence file per (table_id, field_hash).

    Each file is self-contained so an analyst (human or sub-agent) can grade a
    single hash without loading the whole corpus dump. Distinct call texts are
    preferred over repeated identical lines from cloned unit scripts.
    """
    grouped: dict[tuple[str, str], list[Site]] = defaultdict(list)
    for site in sites:
        if site.field_hash:
            grouped[(site.table_id, site.field_hash)].append(site)

    field_dir = os.path.join(out_dir, "fields")
    os.makedirs(field_dir, exist_ok=True)
    for (table_id, field_hash), items in grouped.items():
        seen_text: set[str] = set()
        unique: list[Site] = []
        duplicates: list[Site] = []
        for site in items:
            key = f"{site.func}|{site.call_text}"
            if key in seen_text:
                duplicates.append(site)
                continue
            seen_text.add(key)
            unique.append(site)

        name = f"{table_id.replace('0x', 't')}_{field_hash.replace('0x', '')}.txt"
        path = os.path.join(field_dir, name)
        units = sorted({s.unit for s in items})
        funcs = sorted({s.func for s in items})
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(f"table_id: {table_id}\n")
            handle.write(f"field_hash: {field_hash}\n")
            handle.write(f"total_sites: {len(items)}\n")
            handle.write(f"distinct_call_shapes: {len(unique)}\n")
            handle.write(f"units ({len(units)}): {', '.join(units[:30])}\n")
            handle.write(f"funcs ({len(funcs)}): {', '.join(funcs[:40])}\n")
            handle.write(f"duplicate_clone_sites: {len(duplicates)}\n")
            handle.write("\n=== DISTINCT CALL SHAPES WITH CONSUMER LINES ===\n")
            for site in unique[:max_sites]:
                handle.write(
                    f"\n[{site.unit}] {os.path.basename(site.file)}:{site.line} "
                    f"{site.func} entry={site.entry_arg} "
                    f"assigned={site.assigned_to}\n"
                )
                handle.write(f"  CALL {site.call_text}\n")
                for consumer in site.consumer_lines:
                    handle.write(f"  USE  {consumer}\n")
    return len(grouped)


def write_tsv(path: str, rows: list[dict], columns: list[str]) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\t".join(columns) + "\n")
        for row in rows:
            values = []
            for col in columns:
                value = row.get(col, "")
                if isinstance(value, list):
                    value = ",".join(value[:12])
                values.append(str(value))
            handle.write("\t".join(values) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", action="append", required=True,
                        help="MSC corpus root (repeatable)")
    parser.add_argument("--out", default=None, help="output directory")
    parser.add_argument("--table", action="append", default=None,
                        help="restrict to table id, e.g. 0x60006 (repeatable)")
    parser.add_argument("--window", type=int, default=25,
                        help="consumer scan window in lines (default 25)")
    parser.add_argument("--probe", action="store_true",
                        help="print a few sample sites and exit")
    parser.add_argument("--max-files", type=int, default=0,
                        help="limit scanned files (0 = no limit)")
    parser.add_argument("--split-by-field", action="store_true",
                        help="also write one evidence file per field hash")
    parser.add_argument("--split-max-sites", type=int, default=40,
                        help="max sites written per field evidence file")
    parser.add_argument("--no-json", action="store_true",
                        help="skip usage.json (aggregates only)")
    args = parser.parse_args(argv)

    table_filter = None
    if args.table:
        table_filter = {f"0x{int(t, 16):x}" for t in args.table}

    sites: list[Site] = []
    files = 0
    missing_roots = [r for r in args.root if not os.path.isdir(r)]
    if missing_roots:
        print(f"missing roots: {missing_roots}", file=sys.stderr)
        return 2

    for root in args.root:
        for unit, path in iter_c_files(root):
            files += 1
            sites.extend(scan_file(unit, path, table_filter, args.window))
            if args.max_files and files >= args.max_files:
                break
        if args.max_files and files >= args.max_files:
            break

    print(f"scanned_files={files} sites={len(sites)}")

    if args.probe:
        for site in sites[:8]:
            print("---")
            print(f"{site.unit} {os.path.basename(site.file)}:{site.line} "
                  f"{site.func} {site.syscall} table={site.table_id} "
                  f"hash={site.field_hash} assigned={site.assigned_to}")
            print(f"  call: {site.call_text}")
            for consumer in site.consumer_lines[:4]:
                print(f"  use : {consumer}")
        return 0

    if not args.out:
        print("--out is required unless --probe", file=sys.stderr)
        return 2

    os.makedirs(args.out, exist_ok=True)
    field_rows, table_rows = aggregate(sites)

    if not args.no_json:
        with open(os.path.join(args.out, "usage.json"), "w", encoding="utf-8") as handle:
            json.dump([asdict(s) for s in sites], handle, indent=1)
    if args.split_by_field:
        write_field_evidence(args.out, sites, args.split_max_sites)
    write_tsv(
        os.path.join(args.out, "by_field.tsv"),
        field_rows,
        ["table_id", "field_hash", "syscall", "sites", "units_count",
         "funcs_count", "with_consumers", "funcs"],
    )
    write_tsv(
        os.path.join(args.out, "tables.tsv"),
        table_rows,
        ["table_id", "syscall", "sites", "units_count", "field_hashes_count"],
    )
    print(f"tables={len(table_rows)} fields={len(field_rows)} out={args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
