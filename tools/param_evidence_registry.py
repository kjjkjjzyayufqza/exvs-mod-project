"""Generate the machine-readable param field evidence registry.

Why this exists
---------------
A field hash in this project can carry three different names at once: the shipped
canonical key in `src-tauri/src/format/<x>param.rs`, the key in
`docs/<x>param-semantic-ledger.md`, and the key in `docs/command_mapping.md`.
When they disagree, whichever document an agent happens to open becomes its
"truth". That has already caused a corrected field to be re-reported as wrong and
an uncorrected field to be assumed fine, in the same session.

The registry breaks the tie by making one machine-readable file the carrier of
*evidence* rather than of names. Names live in Rust; evidence lives here; a guard
(`tools/check_param_name_evidence.py`) asserts the two are consistent.

Columns
-------
file_type        speedparam | characterparam | ...
hash             0xXXXXXXXX
canonical_key    the key currently shipped in the Rust command pool
kind             param binary kind (2 = i32, 5 = f32, 7 = string offset)
grade            A | B | C | U | S | R-fixed
mechanism        how the engine reaches the field
distinct_values  how many distinct values appear across the sampled real files
citation         where the evidence lives

Usage
-----
    python tools/param_evidence_registry.py --out docs/param-evidence-registry.tsv
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from param_name_reconcile import parse_rust  # noqa: E402

POOLS = [
    {
        "file_type": "speedparam",
        "rust": os.path.join("src-tauri", "src", "format", "speedparam.rs"),
        "pool_const": "SPEEDPARAM_COMMAND_POOL",
        "alias_const": "SPEEDPARAM_LEGACY_KEY_ALIASES",
    },
    {
        "file_type": "characterparam",
        "rust": os.path.join("src-tauri", "src", "format", "characterparam.rs"),
        "pool_const": "CHARACTERPARAM_COMMAND_POOL",
        "alias_const": "CHARACTERPARAM_LEGACY_KEY_ALIASES",
    },
]

NEUTRAL_PREFIXES = ("reserved_", "unk_", "unresolved_")

ANNOTATION_RE = re.compile(r"\[(?:V|D):[^\]]+\]")


def load_tsv(path: str) -> list[dict]:
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def norm(text: str) -> str:
    return f"0x{int(text, 16) & 0xFFFFFFFF:08x}"


def build_verdict_index(folder: str) -> dict[str, str]:
    """Return the effective verdict for each hash.

    Reports are processed deterministically.  A ``regrade`` report explicitly
    supersedes an initial ``grade`` report; within the same tier the
    lexicographically later filename wins.  This matters when a later audit
    revisits an earlier OPEN result.
    """
    selected: dict[str, tuple[int, str, str]] = {}
    if not os.path.isdir(folder):
        return out
    hash_re = re.compile(r"0[xX][0-9A-Fa-f]{8}")
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".md"):
            continue
        with open(os.path.join(folder, name), encoding="utf-8") as handle:
            for line in handle:
                if not line.lstrip().startswith("|"):
                    continue
                cells = [c.strip().strip("`") for c in
                         line.strip().strip("|").split("|")]
                hashes = [c for c in cells if hash_re.fullmatch(c)]
                if not hashes:
                    continue
                for cell in cells:
                    upper = cell.upper()
                    if upper in ("CONFIRM", "REJECT", "OPEN", "S"):
                        key = norm(hashes[0])
                        priority = 1 if "regrade" in name.lower() else 0
                        candidate = (priority, name, upper)
                        current = selected.get(key)
                        if current is None or candidate[:2] > current[:2]:
                            selected[key] = candidate
                        break
    return {key: candidate[2] for key, candidate in selected.items()}


def grade_for(verdict: str, kind: int, msc_read: str, consumption: str,
              canonical: str) -> tuple[str, str]:
    """Return (grade, mechanism) from the mechanical evidence state."""
    if kind == 7:
        return "S", "string_offset"
    if consumption:
        mechanism = consumption
    elif msc_read == "yes":
        mechanism = "msc_sys_0"
    elif msc_read == "no":
        mechanism = "no_reader_found"
    else:
        mechanism = "unknown"

    if mechanism in ("no_reader_found", "absent"):
        return "U", mechanism
    if canonical.startswith(NEUTRAL_PREFIXES):
        return "U", mechanism
    if verdict == "CONFIRM":
        return "B", mechanism
    if verdict == "REJECT":
        return "R-fixed", mechanism
    if verdict == "OPEN":
        return "C", mechanism
    # Reachability is not semantic identity.  A getter hit or membership in a
    # native hash table stays grade C until a per-hash verdict closes the
    # downstream arithmetic/role.
    if mechanism.startswith("code_getter") or mechanism == "data_table":
        return "C", mechanism
    return "C", mechanism


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True)
    parser.add_argument("--verdicts", default=os.path.join("docs", "param-research"))
    parser.add_argument(
        "--crosscheck",
        default=os.path.join("tmp", "param-evidence", "crosscheck", "crosscheck.tsv"),
    )
    parser.add_argument(
        "--consumption",
        default=os.path.join("tmp", "param-evidence", "classify",
                             "characterparam_consumption.tsv"),
    )
    args = parser.parse_args()

    missing_inputs = [
        path
        for path in (args.verdicts, args.crosscheck, args.consumption)
        if not os.path.exists(path)
    ]
    if missing_inputs:
        for path in missing_inputs:
            print(f"missing required evidence input: {path}", file=sys.stderr)
        return 2

    verdicts = build_verdict_index(args.verdicts)
    cross = {(r["file_type"], norm(r["hash"])): r
             for r in load_tsv(args.crosscheck) if r.get("hash")}
    consumption = {norm(r["hash"]): r for r in load_tsv(args.consumption)
                   if r.get("hash")}
    if not verdicts or not cross or not consumption:
        print("required evidence input parsed as empty; refusing to overwrite registry",
              file=sys.stderr)
        return 2

    rows: list[dict] = []
    for spec in POOLS:
        if not os.path.isfile(spec["rust"]):
            print(f"skip missing {spec['rust']}", file=sys.stderr)
            continue
        pool, _aliases = parse_rust(spec["rust"], spec["pool_const"],
                                    spec["alias_const"])
        if not pool:
            print(f"warning: no pool parsed from {spec['rust']} "
                  f"({spec['pool_const']})", file=sys.stderr)
            continue
        with open(spec["rust"], encoding="utf-8") as handle:
            source_lines = handle.read().splitlines()
        annotated: dict[str, bool] = {}
        for index, line in enumerate(source_lines):
            match = re.search(r"\(\s*(0[xX][0-9A-Fa-f]+)\s*,", line)
            if match:
                entry_lines = [line]
                for following in source_lines[index + 1:]:
                    if re.search(r"\(\s*0[xX][0-9A-Fa-f]+\s*,", following):
                        break
                    entry_lines.append(following)
                    if following.lstrip().startswith(")") or following.rstrip().endswith("),"):
                        break
                annotated[norm(match.group(1))] = bool(
                    ANNOTATION_RE.search("\n".join(entry_lines))
                )

        for field_hash, (kind, canonical) in sorted(pool.items()):
            cross_row = cross.get((spec["file_type"], field_hash), {})
            cons_row = consumption.get(field_hash, {}) \
                if spec["file_type"] == "characterparam" else {}
            grade, mechanism = grade_for(
                verdicts.get(field_hash, ""),
                kind,
                cross_row.get("msc_read", ""),
                cons_row.get("consumption", ""),
                canonical,
            )
            citations = []
            if spec["file_type"] == "speedparam":
                citations.append("docs/speedparam-msc-consumer-evidence.md")
                if field_hash in verdicts:
                    citations.append("docs/param-research/")
            else:
                citations.append("docs/characterparam-native-consumer-map-ob.md")
            if annotated.get(field_hash):
                citations.append("inline-annotation")
            rows.append({
                "file_type": spec["file_type"],
                "hash": field_hash,
                "canonical_key": canonical,
                "kind": kind,
                "grade": grade,
                "mechanism": mechanism,
                "distinct_values": cross_row.get("distinct_values", ""),
                "citation": ";".join(citations),
            })

    cols = ["file_type", "hash", "canonical_key", "kind", "grade", "mechanism",
            "distinct_values", "citation"]
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("# Generated by tools/param_evidence_registry.py. "
                     "Do not hand-edit; regenerate.\n")
        handle.write("\t".join(cols) + "\n")
        for row in rows:
            handle.write("\t".join(str(row[c]) for c in cols) + "\n")

    print(f"rows={len(rows)} out={args.out}")
    by_grade: dict[str, int] = {}
    for row in rows:
        key = f"{row['file_type']}/{row['grade']}"
        by_grade[key] = by_grade.get(key, 0) + 1
    for key, count in sorted(by_grade.items()):
        print(f"  {key}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
