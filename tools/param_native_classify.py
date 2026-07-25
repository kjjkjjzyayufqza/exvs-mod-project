"""Classify characterparam field hashes by how the OB executable consumes them.

Three consumption mechanisms are distinguishable purely from where a hash's
little-endian bytes occur:

- `code_getter`  - occurs in `.text`, as an inline immediate inside a getter
- `data_table`   - occurs only in a data section, i.e. as an element of a static
                   hash array that some loop walks
- `absent`       - occurs nowhere in the image, so no code path can select it

The boundary is derived from observed symbol addresses rather than assumed: the
last known `.text` symbols sit near `0x140a7d***`, while string literals and hash
arrays sit at `0x1413*****` and above.

Usage
-----
    python tools/param_native_classify.py \
        --native tmp/param-evidence/native_hash_map.json \
        --byte-results tmp/param-evidence/byte_search_results.json \
        --pattern-map tmp/param-evidence/byte_pattern_map.json \
        --file-fields tmp/param-evidence/crosscheck/file_fields.tsv \
        --out tmp/param-evidence/classify
"""

from __future__ import annotations

import argparse
import csv
import json
import os
from collections import defaultdict

CODE_LIMIT = 0x141000000


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native", required=True)
    parser.add_argument("--byte-results", required=True)
    parser.add_argument("--pattern-map", required=True)
    parser.add_argument("--file-fields", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    with open(args.native, encoding="utf-8") as handle:
        native = json.load(handle)
    with open(args.byte_results, encoding="utf-8") as handle:
        byte_results = json.load(handle)["results"]
    with open(args.pattern_map, encoding="utf-8") as handle:
        pattern_map = json.load(handle)

    inline: dict[int, list[str]] = defaultdict(list)
    for fn_addr, info in native["functions"].items():
        for raw in info.get("hashes_in_byte_order", []):
            inline[int(raw, 16) & 0xFFFFFFFF].append(fn_addr)

    meta: dict[int, dict] = {}
    with open(args.file_fields, encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            if row["file_type"] != "characterparam":
                continue
            meta[int(row["hash"], 16) & 0xFFFFFFFF] = row

    probe: dict[int, list[str]] = {}
    for pattern, addrs in byte_results.items():
        label = pattern_map.get(pattern)
        if label is None:
            print(f"warning: unmapped pattern {pattern}")
            continue
        probe[int(label, 16) & 0xFFFFFFFF] = addrs

    rows = []
    counts: dict[str, int] = defaultdict(int)
    arrays: dict[str, list[str]] = defaultdict(list)
    for value, info in sorted(meta.items()):
        label = f"0x{value:08x}"
        if value in inline:
            kind = "code_getter_inline"
            where = ",".join(inline[value])
        elif value in probe:
            addrs = probe[value]
            code = [a for a in addrs if int(a, 16) < CODE_LIMIT]
            data = [a for a in addrs if int(a, 16) >= CODE_LIMIT]
            if code:
                kind = "code_getter_probed"
                where = ",".join(code)
            elif data:
                kind = "data_table"
                where = ",".join(data)
                for addr in data:
                    arrays[addr[:9]].append(f"{addr}={label}")
            else:
                kind = "absent"
                where = ""
        else:
            kind = "unprobed"
            where = ""
        counts[kind] += 1
        rows.append({
            "hash": label,
            "kind_id": info.get("kinds", ""),
            "offset": info.get("offsets", ""),
            "distinct_values": info.get("distinct_values", ""),
            "consumption": kind,
            "where": where,
        })

    os.makedirs(args.out, exist_ok=True)
    cols = ["hash", "kind_id", "offset", "distinct_values", "consumption", "where"]
    with open(os.path.join(args.out, "characterparam_consumption.tsv"),
              "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\t".join(cols) + "\n")
        for row in rows:
            handle.write("\t".join(str(row[c]) for c in cols) + "\n")

    total = len(rows)
    print(f"characterparam fields: {total}")
    for kind, count in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {kind}: {count} ({100.0 * count / total:.1f}%)")
    reachable = counts["code_getter_inline"] + counts["code_getter_probed"]
    print(f"reachable by code: {reachable}/{total} "
          f"({100.0 * reachable / total:.1f}%)")

    if arrays:
        print("\nstatic hash arrays in data (grouped by 0x1000 region):")
        for region, members in sorted(arrays.items()):
            entries = sorted(members)
            print(f"  {region}*** : {len(entries)} entries")
            for entry in entries:
                print(f"      {entry}")

    # Fields that are absent from the image AND constant across the whole
    # sampled corpus cannot be named from any available evidence at all.
    unnameable = [r for r in rows
                  if r["consumption"] == "absent"
                  and int(r["distinct_values"] or 0) <= 1]
    print(f"\nfields with no code reference and no data variation: "
          f"{len(unnameable)}")
    print("  " + " ".join(r["hash"] for r in unnameable))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
