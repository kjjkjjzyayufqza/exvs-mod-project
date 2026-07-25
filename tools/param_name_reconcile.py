"""Reconcile the three competing sources of truth for param field names.

The recurring failure in this project is not a single wrong name, it is that a
field hash can carry three different names at once:

- the **shipped canonical key** in `src-tauri/src/format/<file>param.rs`
- the **ledger key** in `docs/<file>param-semantic-ledger.md`
- the **label-list key** in `docs/command_mapping.md`

When those disagree, whichever document an agent happens to read becomes its
"truth", and a correction applied to one surface silently leaves the others
asserting the old name. That is how an already-corrected field gets re-reported
as wrong, and how an uncorrected field gets assumed fine.

This tool diffs the shipped keys against the ledger and against the fresh
per-hash evidence verdicts, and classifies every hash into an action bucket.

Usage
-----
    python tools/param_name_reconcile.py \
        --rust src-tauri/src/format/speedparam.rs \
        --pool-const SPEEDPARAM_COMMAND_POOL \
        --alias-const SPEEDPARAM_LEGACY_KEY_ALIASES \
        --ledger docs/speedparam-semantic-ledger.md \
        --verdicts docs/param-research \
        --consumption tmp/param-evidence/crosscheck/crosscheck.tsv \
        --file-type speedparam \
        --out tmp/param-evidence/reconcile
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
from collections import defaultdict

POOL_ROW_RE = re.compile(
    # rustfmt wraps long entries across lines and leaves a trailing comma after
    # the name, so the closing paren must tolerate `",\n    )` as well as `")`.
    r"\(\s*(0[xX][0-9A-Fa-f]+)\s*,\s*(\d+)\s*,\s*\"([^\"]+)\"\s*,?\s*\)"
)
ALIAS_ROW_RE = re.compile(r"\(\s*\"([^\"]+)\"\s*,\s*(0[xX][0-9A-Fa-f]+)\s*,?\s*\)")
# characterparam maps legacy key -> current key instead of legacy key -> hash.
ALIAS_KEY_TO_KEY_RE = re.compile(r"\(\s*\"([^\"]+)\"\s*,\s*\"([^\"]+)\"\s*,?\s*\)")
HASH_IN_TEXT_RE = re.compile(r"0[xX][0-9A-Fa-f]{8}")
VERDICTS = ("CONFIRM", "REJECT", "OPEN")

# Kind 7 fields store an absolute offset into the trailing obfuscated string
# pool. They are structural, not semantic, and are excluded from naming buckets.
KIND_STRING = 7


def norm(text: str) -> str:
    return f"0x{int(text, 16) & 0xFFFFFFFF:08x}"


def extract_const_block(source: str, name: str) -> str:
    """Return the value slice of a `const NAME: Type = &[ ... ];` declaration.

    The type annotation itself can contain brackets (`&[(&str, u32)]`), so the
    scan must start at the `=` rather than at the first `[` after the name,
    otherwise the type is parsed as the value and the result is empty.
    """
    start = source.find(name)
    if start < 0:
        return ""
    equals = source.find("=", start)
    if equals < 0:
        return ""
    open_bracket = source.find("[", equals)
    if open_bracket < 0:
        return ""
    depth = 0
    for index in range(open_bracket, len(source)):
        char = source[index]
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return source[open_bracket : index + 1]
    return source[open_bracket:]


def parse_rust(path: str, pool_const: str, alias_const: str):
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    pool: dict[str, tuple[int, str]] = {}
    for match in POOL_ROW_RE.finditer(extract_const_block(source, pool_const)):
        pool[norm(match.group(1))] = (int(match.group(2)), match.group(3))

    alias_block = extract_const_block(source, alias_const)
    aliases: dict[str, list[str]] = defaultdict(list)
    for match in ALIAS_ROW_RE.finditer(alias_block):
        aliases[norm(match.group(2))].append(match.group(1))
    # Second supported shape: legacy key -> current camelCase key. Resolve the
    # target key back to its hash through the pool so both files answer the same
    # question, "which hash does this legacy name write to".
    key_to_hash = {snake_to_camel_key(name): field_hash
                   for field_hash, (_kind, name) in pool.items()}
    for match in ALIAS_KEY_TO_KEY_RE.finditer(alias_block):
        target_hash = key_to_hash.get(match.group(2))
        if target_hash:
            aliases[target_hash].append(match.group(1))
    return pool, aliases


def snake_to_camel_key(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in rest)


def parse_ledger(path: str) -> dict[str, str]:
    """Pull hash -> first key-looking cell from any markdown table row."""
    out: dict[str, str] = {}
    if not os.path.isfile(path):
        return out
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            if not line.lstrip().startswith("|"):
                continue
            cells = [c.strip().strip("`") for c in line.strip().strip("|").split("|")]
            hashes = [c for c in cells if HASH_IN_TEXT_RE.fullmatch(c)]
            if not hashes:
                continue
            key = ""
            for cell in cells:
                if cell in hashes or not cell:
                    continue
                if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", cell):
                    key = cell
                    break
            if key:
                out.setdefault(norm(hashes[0]), key)
    return out


def parse_verdicts(folder: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for path in sorted(glob.glob(os.path.join(folder, "*.md"))):
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                if not line.lstrip().startswith("|"):
                    continue
                cells = [c.strip().strip("`") for c in line.strip().strip("|").split("|")]
                hashes = [c for c in cells if HASH_IN_TEXT_RE.fullmatch(c)]
                if not hashes:
                    continue
                verdict = ""
                for cell in cells:
                    upper = cell.upper()
                    for candidate in VERDICTS:
                        if upper == candidate or upper.startswith(candidate + " "):
                            verdict = candidate
                            break
                    if verdict:
                        break
                if not verdict:
                    continue
                key = norm(hashes[0])
                out.setdefault(key, {
                    "verdict": verdict,
                    "source": os.path.basename(path),
                    "cells": cells,
                })
    return out


def parse_consumption(path: str, file_type: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not os.path.isfile(path):
        return out
    with open(path, encoding="utf-8") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            if row.get("file_type") != file_type:
                continue
            out[norm(row["hash"])] = row
    return out


def classify(canonical: str, ledger: str, verdict: str, read: str,
             distinct: int, kind: int) -> str:
    """Bucket a hash into the action that its evidence state demands."""
    if kind == KIND_STRING:
        # Label offsets are structural. They are legitimately named and are not
        # expected to have a numeric consumer.
        return "structural_label"
    if read == "no" and distinct <= 1:
        return "must_be_neutral_no_reader_no_variation"
    if read == "no":
        return "must_be_neutral_no_reader"
    if not verdict:
        return "ungraded"
    if verdict == "REJECT":
        if ledger and canonical and ledger != canonical:
            return "already_corrected_in_rust_ledger_stale"
        return "needs_rust_rename"
    if verdict == "OPEN":
        return "open_keep_neutral"
    return "confirm"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rust", required=True)
    parser.add_argument("--pool-const", required=True)
    parser.add_argument("--alias-const", required=True)
    parser.add_argument("--ledger", required=True)
    parser.add_argument("--verdicts", required=True)
    parser.add_argument("--consumption", required=True)
    parser.add_argument("--file-type", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    pool, aliases = parse_rust(args.rust, args.pool_const, args.alias_const)
    ledger = parse_ledger(args.ledger)
    verdicts = parse_verdicts(args.verdicts)
    consumption = parse_consumption(args.consumption, args.file_type)

    print(f"rust pool={len(pool)} aliases={sum(len(v) for v in aliases.values())} "
          f"ledger={len(ledger)} verdicts={len(verdicts)} "
          f"consumption={len(consumption)}")

    rows = []
    buckets: dict[str, list[str]] = defaultdict(list)
    for field_hash, (kind, canonical) in sorted(pool.items()):
        cons = consumption.get(field_hash, {})
        read = cons.get("msc_read", "")
        distinct = int(cons.get("distinct_values") or 0)
        ledger_key = ledger.get(field_hash, "")
        verdict_row = verdicts.get(field_hash, {})
        verdict = verdict_row.get("verdict", "")
        bucket = classify(canonical, ledger_key, verdict, read, distinct, kind)
        buckets[bucket].append(field_hash)
        rows.append({
            "hash": field_hash,
            "kind": kind,
            "rust_canonical": canonical,
            "ledger_key": ledger_key,
            "rust_vs_ledger": "same" if ledger_key == canonical else "DIFF",
            "verdict": verdict,
            "msc_read": read,
            "distinct_values": distinct,
            "aliases": ",".join(aliases.get(field_hash, [])),
            "action": bucket,
        })

    os.makedirs(args.out, exist_ok=True)
    cols = ["hash", "kind", "rust_canonical", "ledger_key", "rust_vs_ledger",
            "verdict", "msc_read", "distinct_values", "action", "aliases"]
    out_tsv = os.path.join(args.out, f"{args.file_type}_reconcile.tsv")
    with open(out_tsv, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\t".join(cols) + "\n")
        for row in rows:
            handle.write("\t".join(str(row[c]) for c in cols) + "\n")
    with open(os.path.join(args.out, f"{args.file_type}_reconcile.json"),
              "w", encoding="utf-8") as handle:
        json.dump(rows, handle, indent=1)

    stale = [r for r in rows if r["rust_vs_ledger"] == "DIFF" and r["ledger_key"]]
    print(f"\nrust key differs from ledger key: {len(stale)} of {len(rows)}")
    print("action buckets:")
    for bucket, members in sorted(buckets.items(), key=lambda x: -len(x[1])):
        print(f"  {bucket}: {len(members)}")
        if bucket.startswith("must_be_neutral") or bucket == "needs_rust_rename":
            for field_hash in members:
                row = next(r for r in rows if r["hash"] == field_hash)
                print(f"      {field_hash}  {row['rust_canonical']}")
    print(f"\nout={out_tsv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
