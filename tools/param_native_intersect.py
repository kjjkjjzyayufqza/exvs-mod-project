"""Join native IDA hash evidence with real param-file hash sets.

Answers one question mechanically: for every field hash that OB native code
loads through `LookupCommandDescriptorByHash`, which parameter file does that
hash actually belong to, and which native function reads it?

Anything that lands in `characterparam` gains a *native consumer* - the only
admissible evidence class for characterparam, because the MSC corpus never
reads characterparam field hashes at all.

Inputs
------
- `native_hash_map.json` from targeted IDA extraction (see its own `_meta`).
- `file_fields.tsv` from `tools/param_evidence_crosscheck.py`.

Usage
-----
    python tools/param_native_intersect.py \
        --native tmp/param-evidence/native_hash_map.json \
        --file-fields tmp/param-evidence/crosscheck/file_fields.tsv \
        --out tmp/param-evidence/native-join
"""

from __future__ import annotations

import argparse
import csv
import json
import os
from collections import defaultdict


def norm(value: str) -> str:
    return f"0x{int(value, 16) & 0xFFFFFFFF:08x}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native", required=True)
    parser.add_argument("--file-fields", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    with open(args.native, encoding="utf-8") as handle:
        native = json.load(handle)

    owner: dict[str, list[str]] = defaultdict(list)
    meta: dict[str, dict] = {}
    with open(args.file_fields, encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            key = norm(row["hash"])
            owner[key].append(row["file_type"])
            meta[f"{row['file_type']}|{key}"] = row

    hash_to_fns: dict[str, list[str]] = defaultdict(list)
    for fn_addr, info in native["functions"].items():
        for raw in info.get("hashes_in_byte_order", []):
            hash_to_fns[norm(raw)].append(fn_addr)

    os.makedirs(args.out, exist_ok=True)
    rows = []
    unknown = []
    for field_hash in sorted(hash_to_fns):
        files = owner.get(field_hash, [])
        if not files:
            unknown.append(field_hash)
        for file_type in files or ["<not-in-any-sampled-param-file>"]:
            info = meta.get(f"{file_type}|{field_hash}", {})
            rows.append({
                "hash": field_hash,
                "file_type": file_type,
                "kind": info.get("kinds", ""),
                "offset": info.get("offsets", ""),
                "distinct_values": info.get("distinct_values", ""),
                "sample_values": info.get("sample_values", "")[:60],
                "native_fns": ",".join(hash_to_fns[field_hash]),
            })

    out_path = os.path.join(args.out, "native_join.tsv")
    cols = ["file_type", "hash", "kind", "offset", "distinct_values",
            "native_fns", "sample_values"]
    with open(out_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\t".join(cols) + "\n")
        for row in sorted(rows, key=lambda r: (r["file_type"], r["offset"])):
            handle.write("\t".join(str(row.get(c, "")) for c in cols) + "\n")

    by_file: dict[str, int] = defaultdict(int)
    for row in rows:
        by_file[row["file_type"]] += 1

    char_total = sum(1 for k in meta if k.startswith("characterparam|"))
    char_native = by_file.get("characterparam", 0)

    print(f"native hashes extracted: {len(hash_to_fns)}")
    for file_type, count in sorted(by_file.items(), key=lambda x: -x[1]):
        print(f"  {file_type}: {count}")
    if char_total:
        print(f"characterparam native coverage: {char_native}/{char_total} "
              f"({100.0 * char_native / char_total:.1f}%)")
    if unknown:
        print(f"hashes not found in any sampled param file: {len(unknown)}")
        for item in unknown:
            print(f"  {item} -> {','.join(hash_to_fns[item])}")
    print(f"out={out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
