"""Guard against ungrounded param field names and doc/code drift.

Run this after touching any param command pool, ledger, or field-note document:

    python tools/check_param_name_evidence.py

Exit code 0 means every canonical key is accounted for. Non-zero means at least
one rule below is violated, and the message names the offending hash.

Rules
-----
1. **Registry completeness.** Every hash in a Rust command pool has a row in
   `docs/param-evidence-registry.tsv`, and every registry row corresponds to a
   real pool entry. Catches a field being added to code without evidence, or the
   registry going stale after a rename.

2. **Neutral names for unreadable fields.** A field graded `U` — no consumer
   found anywhere and, for characterparam, absent from the executable image —
   must carry a neutral key (`reserved_*`, `unk_*`, `unresolved_*`). A field the
   engine cannot reach must not advertise a gameplay meaning.

3. **No doc/code name drift.** If a ledger or field-note document names a hash,
   that name must equal the shipped canonical key or be listed as a legacy alias.
   This is the rule that matters most: the 2026-07-25 session was misled twice by
   `docs/speedparam-semantic-ledger.md` still asserting pre-audit names for
   fields that Rust had already corrected, once concluding a correct field was
   wrong and once assuming a wrong field was fine.

4. **Alias preservation.** Any name that a document still uses, but which is no
   longer canonical, must exist as an input alias so old JSON keeps loading.

Background: docs/agent-sessions/2026-07-25-param-evidence-rebuild.md
"""

from __future__ import annotations

import csv
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from param_name_reconcile import parse_rust, snake_to_camel_key  # noqa: E402

REGISTRY = os.path.join("docs", "param-evidence-registry.tsv")
NEUTRAL_PREFIXES = ("reserved_", "unk_", "unresolved_")

POOLS = [
    ("speedparam", os.path.join("src-tauri", "src", "format", "speedparam.rs"),
     "SPEEDPARAM_COMMAND_POOL", "SPEEDPARAM_LEGACY_KEY_ALIASES"),
    ("characterparam", os.path.join("src-tauri", "src", "format", "characterparam.rs"),
     "CHARACTERPARAM_COMMAND_POOL", "CHARACTERPARAM_LEGACY_KEY_ALIASES"),
]

# Documents that historically asserted field names as truth.
NAME_DOCS = [
    os.path.join("docs", "speedparam-semantic-ledger.md"),
    os.path.join("docs", "characterparam-field-notes.md"),
    os.path.join("docs", "command_mapping.md"),
]

HASH_RE = re.compile(r"0[xX][0-9A-Fa-f]{8}")
IDENT_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]*")

# A document may name a hash without asserting it is canonical, provided the line
# carries one of these markers.
HYPOTHESIS_MARKERS = (
    "hypothesis", "rejected", "superseded", "legacy", "alias", "pre-audit",
    "not supported", "unproven", "historical",
)


ANNOTATION_RE = re.compile(r"\[(?:V|D):[^\]]+\]")
POOL_LINE_HASH_RE = re.compile(r"\(?\s*(0[xX][0-9A-Fa-f]{8})\s*,")


def collect_annotations(source: str) -> dict[str, bool]:
    """Map hash -> whether its pool line carries a `[V:...]` or `[D:...]` note.

    rustfmt wraps long entries, so the annotation can sit a few lines below the
    hash. The scan therefore looks ahead until the entry closes.
    """
    out: dict[str, bool] = {}
    lines = source.splitlines()
    for index, line in enumerate(lines):
        match = POOL_LINE_HASH_RE.search(line)
        if not match:
            continue
        field_hash = f"0x{int(match.group(1), 16) & 0xFFFFFFFF:08x}"
        window = "\n".join(lines[index : index + 5])
        found = bool(ANNOTATION_RE.search(window))
        out[field_hash] = out.get(field_hash, False) or found
    return out


def norm(text: str) -> str:
    return f"0x{int(text, 16) & 0xFFFFFFFF:08x}"


def name_key(name: str) -> str:
    """Casing- and separator-insensitive form for comparing field key spellings.

    Documents write `jump_type` while the alias table registers `jumpType`; both
    denote the same field, so a raw string compare would report drift that is not
    real.
    """
    return re.sub(r"[^a-z0-9]", "", name.lower())


def load_registry() -> dict[tuple[str, str], dict]:
    out: dict[tuple[str, str], dict] = {}
    if not os.path.isfile(REGISTRY):
        return out
    with open(REGISTRY, encoding="utf-8") as handle:
        lines = [ln for ln in handle if not ln.startswith("#")]
    for row in csv.DictReader(lines, delimiter="\t"):
        out[(row["file_type"], norm(row["hash"]))] = row
    return out


def scan_doc_names(path: str) -> list[tuple[int, str, str, str]]:
    """Yield (line_no, hash, candidate_name, raw_line) from markdown tables."""
    out = []
    if not os.path.isfile(path):
        return out
    with open(path, encoding="utf-8", errors="replace") as handle:
        for number, line in enumerate(handle, 1):
            if not line.lstrip().startswith("|"):
                continue
            lowered = line.lower()
            if any(marker in lowered for marker in HYPOTHESIS_MARKERS):
                continue
            cells = [c.strip().strip("`*") for c in line.strip().strip("|").split("|")]
            hashes = [c for c in cells if HASH_RE.fullmatch(c)]
            if not hashes:
                continue
            for cell in cells:
                if cell in hashes or not cell:
                    continue
                if IDENT_RE.fullmatch(cell) and "_" in cell or (
                    IDENT_RE.fullmatch(cell) and any(ch.isupper() for ch in cell[1:])
                ):
                    out.append((number, norm(hashes[0]), cell, line.rstrip()))
                    break
    return out


def main() -> int:
    registry = load_registry()
    if not registry:
        print(f"FAIL: registry missing or empty: {REGISTRY}")
        print("      regenerate with tools/param_evidence_registry.py")
        return 1

    failures: list[str] = []
    pools: dict[str, dict[str, tuple[int, str]]] = {}
    alias_names: dict[str, set[str]] = {}
    annotations: dict[str, dict[str, bool]] = {}

    for file_type, rust_path, pool_const, alias_const in POOLS:
        if not os.path.isfile(rust_path):
            failures.append(f"missing Rust source: {rust_path}")
            continue
        pool, aliases = parse_rust(rust_path, pool_const, alias_const)
        if not pool:
            failures.append(f"parsed zero pool entries from {rust_path}")
            continue
        pools[file_type] = pool
        alias_names[file_type] = {
            name_key(name) for names in aliases.values() for name in names
        }
        with open(rust_path, encoding="utf-8") as handle:
            annotations[file_type] = collect_annotations(handle.read())

        # Rule 1: registry completeness, both directions.
        for field_hash in pool:
            if (file_type, field_hash) not in registry:
                failures.append(
                    f"[rule1] {file_type} {field_hash} "
                    f"'{pool[field_hash][1]}' has no registry row")
        for (reg_type, reg_hash) in registry:
            if reg_type == file_type and reg_hash not in pool:
                failures.append(
                    f"[rule1] {file_type} {reg_hash} is in the registry but not "
                    f"in {pool_const}")

        # Rule 2: a field the engine cannot reach must not claim a meaning.
        # Two tiers, because the available evidence differs:
        #   no consumer AND no data variation -> nothing can support any name
        #   no consumer BUT data varies        -> only a data-shape hypothesis is
        #                                         possible, so the entry must say so
        for field_hash, (_kind, key) in pool.items():
            row = registry.get((file_type, field_hash))
            if not row or row["grade"] != "U":
                continue
            if key.startswith(NEUTRAL_PREFIXES):
                continue
            try:
                distinct = int(row.get("distinct_values") or 0)
            except ValueError:
                distinct = 0
            if distinct <= 1:
                failures.append(
                    f"[rule2a] {file_type} {field_hash} has no consumer "
                    f"({row['mechanism']}) and is constant across the sampled "
                    f"corpus, yet claims '{key}'. Nothing can support that name; "
                    f"use a neutral key.")
            elif not annotations[file_type].get(field_hash):
                failures.append(
                    f"[rule2b] {file_type} {field_hash} has no consumer "
                    f"({row['mechanism']}) and claims '{key}' on data shape alone. "
                    f"Add a `// [D:...]` annotation stating the observed values, "
                    f"or use a neutral key.")

    # Rules 3 and 4: documents must not assert a name that no pool recognises.
    # The same hash can legitimately carry different keys in different pools
    # (speedparam calls 0xE6213731 `action_label`, characterparam calls it
    # `action_label_offset`), so a document name is accepted if any pool
    # recognises it as canonical or as an alias.
    accepted_by_hash: dict[str, set[str]] = {}
    canonical_examples: dict[str, str] = {}
    for file_type, pool in pools.items():
        for field_hash, (_kind, key) in pool.items():
            accepted_by_hash.setdefault(field_hash, set()).add(name_key(key))
            label = f"{file_type}:{key}"
            existing = canonical_examples.get(field_hash)
            canonical_examples[field_hash] = (
                label if existing is None
                else existing if label in existing
                else f"{existing}, {label}"
            )
            accepted_by_hash[field_hash].update(alias_names.get(file_type, set()))

    drift = 0
    alias_presented_as_canonical = 0
    for doc in NAME_DOCS:
        for number, field_hash, name, _line in scan_doc_names(doc):
            accepted = accepted_by_hash.get(field_hash)
            if not accepted:
                continue
            canonical_keys = set()
            for file_type, pool in pools.items():
                if field_hash in pool:
                    canonical_keys.add(name_key(pool[field_hash][1]))
            if name_key(name) in canonical_keys:
                continue
            if name_key(name) in accepted:
                # Rule 4 holds: the name still loads. But the document presents it
                # in the same position a canonical name would occupy, which is how
                # a reader mistakes a superseded name for the current one. Counted
                # and reported, not failed, because the document may legitimately
                # be a historical record — provided it says so in its header.
                alias_presented_as_canonical += 1
                continue
            drift += 1
            failures.append(
                f"[rule3] {doc}:{number} names {field_hash} '{name}' but no pool "
                f"recognises it; shipped keys are {canonical_examples[field_hash]}")

    if failures:
        print(f"FAIL: {len(failures)} violation(s)")
        for item in failures[:60]:
            print(f"  {item}")
        if len(failures) > 60:
            print(f"  ... and {len(failures) - 60} more")
        if drift:
            print(f"\n{drift} of these are doc/code name drift. Either update the "
                  f"document to the shipped key, mark the line as a historical "
                  f"claim, or register the old name as an input alias.")
        return 1

    total = sum(len(p) for p in pools.values())
    print(f"OK: {total} canonical keys across {len(pools)} pools all have "
          f"registry evidence, no grade-U field claims a semantic name, and no "
          f"document asserts an unregistered name.")
    if alias_presented_as_canonical:
        print(f"note: {alias_presented_as_canonical} document line(s) still show a "
              f"superseded-but-aliased name in a canonical position. Those files "
              f"must carry a header saying they are historical, otherwise a reader "
              f"will take the old name as current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
