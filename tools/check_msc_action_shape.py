"""
Fail closed when an EXVS2 MSC action body departs from the vanilla action shape.

Why these rules and not others
------------------------------
Every rule that raises an error below was measured against the vanilla corpus
first, so a passing vanilla unit can never fail this gate. Baseline: 538 vanilla
units under 040msc, 1881 action bodies (a function that assigns global676).

  measured invariant                                    counterexamples
  ----------------------------------------------------  ---------------
  callFunc3 appears at most once per action body         0 / 1881
  its argument is a bare function identifier             0 / 1087 calls
  callFunc / callFunc2 / set_main never appear           0 / 1881
  func_586() precedes the first global676 write          0 / 1431 (when present)

Deliberately NOT errors, because vanilla violates them:

  func_586() present                    1431/1881 (76%)  -> absence is legal
  all four of global676..679 assigned   1428/1881 (76%)  -> partial is legal
  callFunc3 present at all              1087/1881 (58%)  -> absence is legal
  sys_46 inside the global677 body       229 vanilla uses -> legal

The last row matters: a blanket ban on sys_46 in the shoot phase was inferred
from a single failed build and does not hold as a general rule.

Regenerate the baseline after a corpus change:
  python tools/check_msc_action_shape.py --corpus-report --scan-dir E:\\XB\\mod\\040msc

Usage
-----
  python tools/check_msc_action_shape.py path/to/2.c
  python tools/check_msc_action_shape.py --scan-dir E:\\XB\\mod\\040msc --glob "**/2.c"
"""

from __future__ import annotations

import argparse
import collections
import re
import sys
from dataclasses import dataclass
from pathlib import Path

FUNC_START = re.compile(r"^(?:void|int)\s+([A-Za-z_]\w*)\s*\(")
ASSIGN_676 = re.compile(r"global676\s*=")
PHASE_ASSIGN = re.compile(r"global(67[6-9])\s*=")
CALLFUNC3 = re.compile(r"\bcallFunc3\s*\(([^)]*)\)")
CALLFUNC2 = re.compile(r"\b(?:callFunc2|set_main)\s*\(")
CALLFUNC1 = re.compile(r"(?<![A-Za-z0-9_])callFunc\s*\(")
BARE_IDENT = re.compile(r"[A-Za-z_]\w*")
VANILLA_DIR = re.compile(r"^\d{3}[a-z0-9]+_\d{3}[a-z0-9]+_\d{3}$")


@dataclass
class Function:
    name: str
    line: int
    body: str


def split_functions(text: str) -> list[Function]:
    """Split mscdec output into top-level functions by brace depth."""
    lines = text.splitlines()
    out: list[Function] = []
    index = 0
    total = len(lines)
    while index < total:
        match = FUNC_START.match(lines[index])
        if not match:
            index += 1
            continue
        start = index
        depth = 0
        opened = False
        cursor = index
        while cursor < total:
            depth += lines[cursor].count("{") - lines[cursor].count("}")
            if "{" in lines[cursor]:
                opened = True
            if opened and depth <= 0:
                break
            cursor += 1
        out.append(Function(match.group(1), start + 1, "\n".join(lines[start : cursor + 1])))
        index = cursor + 1
    return out


def action_bodies(funcs: list[Function]) -> list[Function]:
    """An action body is any function that assigns the first phase slot."""
    return [f for f in funcs if ASSIGN_676.search(f.body)]


def check_file(path: Path) -> tuple[list[str], list[str]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    funcs = split_functions(text)
    defined = {f.name for f in funcs}
    errors: list[str] = []
    notes: list[str] = []

    for fn in action_bodies(funcs):
        where = f"{path}:{fn.line}: {fn.name}"

        calls = CALLFUNC3.findall(fn.body)
        if len(calls) > 1:
            errors.append(
                f"{where}: {len(calls)} callFunc3 calls in one action body; vanilla never exceeds 1"
            )
        for raw in calls:
            arg = raw.strip()
            if not BARE_IDENT.fullmatch(arg):
                errors.append(
                    f"{where}: callFunc3 argument is not a bare function identifier: {arg[:60]}"
                )
            elif arg not in defined:
                errors.append(f"{where}: callFunc3 target {arg} is not defined in this file")

        if CALLFUNC2.search(fn.body):
            errors.append(f"{where}: callFunc2/set_main inside an action body; 0 vanilla precedent")
        if CALLFUNC1.search(fn.body):
            errors.append(f"{where}: callFunc inside an action body; 0 vanilla precedent")

        if "func_586()" in fn.body:
            reset_at = fn.body.index("func_586()")
            first_write = ASSIGN_676.search(fn.body).start()
            if reset_at > first_write:
                errors.append(f"{where}: func_586() runs after the first global676 write")
        else:
            notes.append(f"{where}: no func_586() reset (legal, 24% of vanilla actions)")

        assigned = set(PHASE_ASSIGN.findall(fn.body))
        if len(assigned) != 4:
            slots = ",".join(sorted(assigned))
            notes.append(f"{where}: assigns {len(assigned)}/4 phase slots ({slots})")

    return errors, notes


def corpus_report(root: Path, glob: str) -> None:
    """Recompute the vanilla baseline quoted in this module docstring."""
    stats: collections.Counter = collections.Counter()
    for path in sorted(root.glob(glob)):
        if not any(VANILLA_DIR.match(part) for part in path.parts):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        stats["units"] += 1
        for fn in action_bodies(split_functions(text)):
            stats["actions"] += 1
            calls = len(CALLFUNC3.findall(fn.body))
            stats[f"callFunc3=={min(calls, 2)}"] += 1
            stats["func_586"] += "func_586()" in fn.body
            stats["quartet_complete"] += len(set(PHASE_ASSIGN.findall(fn.body))) == 4
            stats["callFunc2_or_set_main"] += bool(CALLFUNC2.search(fn.body))
    for key in sorted(stats):
        print(f"{key:26} {stats[key]}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check EXVS2 MSC action-body shape.")
    parser.add_argument("files", nargs="*")
    parser.add_argument("--scan-dir")
    parser.add_argument("--glob", default="**/2.c")
    parser.add_argument(
        "--corpus-report", action="store_true", help="print the vanilla baseline instead of checking"
    )
    parser.add_argument("--quiet", action="store_true", help="suppress informational notes")
    args = parser.parse_args()

    if args.corpus_report:
        if not args.scan_dir:
            print("--corpus-report requires --scan-dir", file=sys.stderr)
            return 2
        corpus_report(Path(args.scan_dir), args.glob)
        return 0

    if args.scan_dir:
        targets = sorted(Path(args.scan_dir).glob(args.glob))
    else:
        targets = [Path(p) for p in args.files]
    if not targets:
        print("no target files", file=sys.stderr)
        return 2

    all_errors: list[str] = []
    all_notes: list[str] = []
    for path in targets:
        errors, notes = check_file(path)
        all_errors += errors
        all_notes += notes

    if not args.quiet:
        for note in all_notes:
            print(f"info: {note}")
    for error in all_errors:
        print(f"error: {error}", file=sys.stderr)

    print(f"checked {len(targets)} file(s): {len(all_errors)} error(s), {len(all_notes)} note(s)")
    return 1 if all_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
