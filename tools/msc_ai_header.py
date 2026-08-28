"""
Canonical AI-facing header banner for EXVS2 MSC decompiled C sources.

Why this exists
---------------
`X.c` is decompiled bytecode. It opens with ~700 bare `int globalN;` lines and
contains no types, no field names and no syscall signatures. An agent that is
handed the file with no other context (Grok, ChatGPT, a fresh Cursor session,
a subagent) has nothing to anchor on, so it invents a plausible-sounding model
and reports it with full confidence.

Skills and rules live in the harness and do not travel with the file. The
banner does. It is emitted by `mscdec.py` into every decompiled source, so the
reading contract is the first thing any agent sees, whatever tool it uses.

The banner is comment-only. `msclang.py` strips comments before codegen, so a
stamped file compiles to byte-identical bytecode.

Usage
-----
  python tools/msc_ai_header.py --check  path/to/2.c
  python tools/msc_ai_header.py --stamp  path/to/2.c
  python tools/msc_ai_header.py --stamp  --scan-dir E:\XB\mod\040msc --glob "**/*.c"
  python tools/msc_ai_header.py --strip  path/to/2.c
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BEGIN = "// ==== EXVS2 MSC READING CONTRACT (v1) - do not delete ===="
END = "// ==== end EXVS2 MSC READING CONTRACT ===="

# ASCII only, and no quote characters anywhere: msclang's comment stripper
# mis-handles a quote that opens on one // line and closes on another.
BANNER_BODY = """//
// This file is DECOMPILED BYTECODE, not authored C. Before you analyse or edit
// it, accept these four rules. They are measured, not stylistic.
//
// 1. READING THIS FILE CANNOT ESTABLISH BEHAVIOUR.
//    Three layers exist. L1 syntax (what the file contains) is answerable here.
//    L2 engine ABI (what sys_N/func_N do, which layer a hash runs on) needs two
//    vanilla units agreeing or an IDA read. L3 behaviour (what the player sees,
//    can they steer, does it auto-exit) is answerable IN GAME ONLY.
//    A claim is graded by its weakest link. Grade every claim you make:
//    E0 guess / E1 source-pinned / E2 cross-source / E3 in-game / E3- falsified.
//    If you state an L2 or L3 fact with only this file as evidence, it is E0.
//
// 2. ACTION SHAPE IS FIXED. DO NOT INVENT ONE.
//    An action is one entry function plus four phase bodies:
//      void ACTION_X() {
//          func_586();              // before any global676 write
//          global676 = X_start;     // 677 shoot, 678 no_ammo, 679 end
//          global677 = X_shoot;
//          global678 = X_no_ammo;   // 0 means this move has no empty-ammo phase
//          global679 = X_end;
//          callFunc3(X_tick);       // at most once, bare identifier
//      }
//      void X_tick() { func_593(); }
//    You own the four phase bodies. You do NOT own phase advancement; the
//    driver (func_593 / func_599) runs it. A hand-rolled phase counter inside
//    the tick replaces native ownership and has failed in game before.
//
// 3. callFunc / callFunc2 / set_main SEMANTICS ARE UNKNOWN (E0).
//    Opcodes are pinned; what the VM does with them is not. Copy the vanilla
//    shape. Never reason from assumed call semantics.
//
// 4. NAMES ARE NOT DOCUMENTATION.
//    ACTION_* names come from a heuristic mapping, and func_N / globalN numbers
//    are stable only within one unit build. Confirm the id in the file you will
//    actually edit; do not carry a number over from another unit or a doc.
//
// Repack with tools/msclang.py only. Gates before packing:
//   python tools/check_msc_ai_blocks.py <file>
//   python tools/check_msc_opaque_func_ptrs.py <file>
//   python tools/check_msc_action_shape.py <file>
// Full contract: docs/msc-research/MSC_AI_PRIMER.md (self-contained, paste-able)
//"""


def banner() -> str:
    return f"{BEGIN}\n{BANNER_BODY}\n{END}\n"


def has_banner(text: str) -> bool:
    return BEGIN in text


def strip_banner(text: str) -> str:
    if BEGIN not in text:
        return text
    head, _, rest = text.partition(BEGIN)
    _, _, tail = rest.partition(END)
    return head + tail.lstrip("\n")


def stamp(text: str) -> str:
    """Idempotent: an existing banner is replaced, never stacked."""
    return banner() + strip_banner(text).lstrip("\n")


def _iter_targets(args: argparse.Namespace) -> list[Path]:
    if args.scan_dir:
        return sorted(Path(args.scan_dir).glob(args.glob))
    return [Path(p) for p in args.files]


def main() -> int:
    ap = argparse.ArgumentParser(description="Stamp or verify the MSC reading contract banner.")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="fail if any target lacks the banner")
    mode.add_argument("--stamp", action="store_true", help="write the banner at the top of each target")
    mode.add_argument("--strip", action="store_true", help="remove the banner from each target")
    ap.add_argument("files", nargs="*", help="one or more .c files")
    ap.add_argument("--scan-dir", help="directory to scan instead of listing files")
    ap.add_argument("--glob", default="**/*.c", help="glob used with --scan-dir")
    args = ap.parse_args()

    targets = _iter_targets(args)
    if not targets:
        print("no target files", file=sys.stderr)
        return 2

    missing = 0
    changed = 0
    for path in targets:
        text = path.read_text(encoding="utf-8", errors="replace")
        if args.check:
            if not has_banner(text):
                missing += 1
                print(f"{path}: missing MSC reading contract banner")
            continue
        new = stamp(text) if args.stamp else strip_banner(text)
        if new != text:
            path.write_text(new, encoding="utf-8", newline="")
            changed += 1

    if args.check:
        print(f"checked {len(targets)} file(s), {missing} missing")
        return 1 if missing else 0
    print(f"{'stamped' if args.stamp else 'stripped'} {changed}/{len(targets)} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
