"""Ratchet check for MSC research doc evidence grades.

Every note under docs/msc-research/ must declare how strongly its conclusions are
backed, using the E0-E3 scale defined in
docs/msc-research/msc-evidence-grade-and-ingame-audit-protocol.md:

    **Status:** E3 in-game confirmed (2026-08-25); coast phase E3- falsified

Reading MSC X.c only ever establishes E1. Behaviour-level claims need E3, so an
ungraded note silently invites the next agent to treat source reading as proof.

The repository still carries a backlog of ungraded notes. Rather than failing the
whole tree, this check ratchets: files already known to be ungraded are listed in
a baseline, and the check fails only when a new ungraded file appears or a graded
file loses its grade. Shrink the baseline as notes are graded.
"""

from argparse import ArgumentParser
from pathlib import Path
import re

DOCS_DIR = Path("docs/msc-research")
BASELINE = DOCS_DIR / ".evidence-baseline.txt"

# INDEX.md is generated; README.md is the folder entry point, not a claim note.
EXEMPT = {"INDEX.md", "README.md"}

STATUS_RE = re.compile(r"^\*\*Status:\*\*(.*)$", re.MULTILINE)
GRADE_RE = re.compile(r"\bE(?:0|1|2|3-|3)\b")

OK = "graded"
NO_GRADE = "status-without-grade"
NO_STATUS = "no-status-line"


def classify(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    match = STATUS_RE.search(text)
    if match is None:
        return NO_STATUS
    if GRADE_RE.search(match.group(1)) is None:
        return NO_GRADE
    return OK


def scan(root: Path) -> dict[str, str]:
    docs_dir = root / DOCS_DIR
    results: dict[str, str] = {}
    for path in sorted(docs_dir.glob("*.md")):
        if path.name in EXEMPT:
            continue
        results[path.name] = classify(path)
    return results


def read_baseline(root: Path) -> set[str]:
    path = root / BASELINE
    if not path.exists():
        return set()
    lines = path.read_text(encoding="utf-8").splitlines()
    return {line.strip() for line in lines if line.strip() and not line.startswith("#")}


def write_baseline(root: Path, names: set[str]) -> None:
    path = root / BASELINE
    header = [
        "# MSC notes still missing an E0-E3 evidence grade.",
        "# Grade a note, then delete its line here. Never add a line to silence a new note.",
        "# See docs/msc-research/msc-evidence-grade-and-ingame-audit-protocol.md",
    ]
    path.write_text("\n".join(header + sorted(names)) + "\n", encoding="utf-8")


def main() -> int:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository root")
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Rewrite the baseline from the current tree (use only when grading notes)",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    results = scan(root)
    ungraded = {name for name, state in results.items() if state != OK}

    if args.update_baseline:
        write_baseline(root, ungraded)
        print(f"baseline updated: {len(ungraded)} ungraded notes recorded")
        return 0

    baseline = read_baseline(root)
    regressions = sorted(ungraded - baseline)
    fixed = sorted(baseline - ungraded)

    graded = len(results) - len(ungraded)
    print(f"MSC notes: {len(results)}   graded: {graded}   ungraded: {len(ungraded)}")

    for name in fixed:
        print(f"  graded since baseline: {name}")

    if regressions:
        print()
        print("ERROR: notes without an E0-E3 evidence grade in **Status:**")
        for name in regressions:
            print(f"  {name}  ({results[name]})")
        print()
        print("Add a grade, e.g. **Status:** E1 source-pinned; behaviour untested")
        print("See docs/msc-research/msc-evidence-grade-and-ingame-audit-protocol.md")
        return 1

    if fixed:
        print()
        print("Run --update-baseline to record the newly graded notes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
