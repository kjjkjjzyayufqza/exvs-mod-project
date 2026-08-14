"""
Fail closed when MSC decompiled C registers function pointers as layout-sensitive
hex offsets instead of relocatable function symbols.

Background
----------
Default msclang relocates `func_143` (identifier) but keeps bare ints like `0x5fef`
as constants. After any earlier function body grows, those constants still point at
the old script offset and the unit loses all actions.

See:
  docs/agent-sessions/2026-08-13-msc-0c-function-pointer-offset-bug.md

Critical pattern (action thinker registration in 0.c):

  BAD:  sys_1(0x10001, 0, 0x1, 0x5fef);
  GOOD: sys_1(0x10001, 0, 0x1, func_143);

Usage
-----
  python tools/check_msc_opaque_func_ptrs.py path/to/0.c
  python tools/check_msc_opaque_func_ptrs.py --scan-dir E:\\XB\\mod\\040msc --glob "**/0.c"
  python tools/check_msc_opaque_func_ptrs.py path/to/0.c --fix --write
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


# Action-thinker registration: sys_1(0x10001, 0, 0x1, <ptr>)
THINKER_RE = re.compile(
    r"""
    sys_1\s*\(\s*
    (0x10001|65537)\s*,\s*   # domain
    (0x0+|0)\s*,\s*           # sub 0
    (0x1|1)\s*,\s*            # slot 1 = thinker
    (?P<arg>[^)]+?)\s*
    \)
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Broader: any sys_1(0x10001, ..., 0xNNNN) last-arg hex that looks like a script offset
# (used as advisory when --strict-scan is on). Keep thinker rule as error always.
HEX_CONST_RE = re.compile(r"^(0x[0-9a-fA-F]+|\d+)$")
FUNC_SYM_RE = re.compile(r"^func_\d+$", re.IGNORECASE)
IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# Known decompile constants that should become symbols (unit-agnostic rewrite table).
# Value is preferred symbol when --fix is used; if missing, use func_143 default.
KNOWN_THINKER_OFFSETS = {
    0x5FEF: "func_143",  # EW / Rebellion wing zero family (016 / wing_gundam_zero_rebellion)
    0x6005: "func_143",  # TV 028gunwtv style decompile of same slot
    0x6605: "func_143",  # GMecha-family style (verify per unit if rewrite)
}


@dataclass(frozen=True)
class Finding:
    path: Path
    line_no: int
    kind: str  # "error" | "warn"
    code: str
    message: str
    raw_arg: str
    line: str

    def format(self) -> str:
        return f"{self.path}:{self.line_no}: {self.kind.upper()} [{self.code}] {self.message} :: {self.line.strip()}"


def _strip_c_comments_line(line: str) -> str:
    # Drop // comments only (sufficient for this gate).
    if "//" in line:
        return line.split("//", 1)[0]
    return line


def _parse_int(token: str) -> int | None:
    token = token.strip()
    try:
        return int(token, 0) & 0xFFFFFFFF
    except ValueError:
        return None


def _classify_thinker_arg(arg: str) -> tuple[str, str]:
    """
    Returns (severity, detail_code).
    severity: "ok" | "error" | "warn"
    """
    arg = arg.strip()
    if FUNC_SYM_RE.match(arg) or IDENT_RE.match(arg):
        # func_143 or other relocatable identifier (e.g. NULL-like names rare).
        if arg.upper() in {"NULL", "NULL_FUNC_PTR"}:
            return "error", "null_thinker"
        return "ok", "symbol"

    n = _parse_int(arg)
    if n is None:
        # Expression / macro — warn, do not fail closed unless clearly hex.
        if HEX_CONST_RE.match(arg):
            return "error", "opaque_int"
        return "warn", "non_symbol_expr"

    if n == 0 or n == 0xFFFFFFFF:
        return "error", "null_thinker"

    if n in KNOWN_THINKER_OFFSETS:
        return "error", "known_opaque_offset"

    # Heuristic: small-to-mid script offsets typical of decompiled thinkers.
    if 0x100 <= n <= 0xFFFFF:
        return "error", "opaque_script_offset"

    return "warn", "unusual_int"


def check_file(path: Path, *, strict_scan: bool = False) -> list[Finding]:
    findings: list[Finding] = []
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="utf-8-sig")

    for line_no, line in enumerate(text.splitlines(), start=1):
        code_line = _strip_c_comments_line(line)
        for match in THINKER_RE.finditer(code_line):
            raw_arg = match.group("arg").strip()
            severity, code = _classify_thinker_arg(raw_arg)
            if severity == "ok":
                continue
            if severity == "warn" and not strict_scan:
                # Still report known rewrite targets as errors only; skip soft warns.
                if code != "known_opaque_offset":
                    continue
            msg = {
                "null_thinker": "action thinker registered as null/invalid pointer",
                "known_opaque_offset": (
                    f"layout-sensitive decompiled offset {raw_arg}; "
                    f"use symbol {KNOWN_THINKER_OFFSETS.get(_parse_int(raw_arg) or -1, 'func_143')}"
                ),
                "opaque_script_offset": (
                    f"action thinker uses opaque integer {raw_arg}; "
                    "msclang will not relocate it when earlier functions grow"
                ),
                "opaque_int": f"action thinker uses non-symbol argument {raw_arg}",
                "non_symbol_expr": f"action thinker argument is not a plain function symbol: {raw_arg}",
            }.get(code, code)
            findings.append(
                Finding(
                    path=path,
                    line_no=line_no,
                    kind="error" if severity == "error" else "warn",
                    code=code,
                    message=msg,
                    raw_arg=raw_arg,
                    line=line,
                )
            )
    return findings


def fix_file(path: Path, *, write: bool) -> tuple[str, int]:
    """
    Rewrite known opaque thinker offsets to function symbols.
    Returns (new_text, n_replacements).
    """
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="utf-8-sig")

    replacements = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal replacements
        raw_arg = match.group("arg").strip()
        n = _parse_int(raw_arg)
        if n is None:
            return match.group(0)
        symbol = KNOWN_THINKER_OFFSETS.get(n)
        if symbol is None:
            # Generic opaque mid-range offset → default thinker symbol.
            if 0x100 <= n <= 0xFFFFF:
                symbol = "func_143"
            else:
                return match.group(0)
        replacements += 1
        # Preserve original spacing style loosely.
        return f"sys_1(0x10001, 0, 0x1, {symbol})"

    new_text = THINKER_RE.sub(repl, text)
    if write and replacements and new_text != text:
        path.write_text(new_text, encoding="utf-8", newline="\n")
    return new_text, replacements


def iter_paths(files: list[Path], scan_dir: Path | None, glob_pat: str) -> list[Path]:
    out: list[Path] = []
    out.extend(files)
    if scan_dir is not None:
        out.extend(sorted(scan_dir.glob(glob_pat)))
    # de-dupe preserve order
    seen: set[Path] = set()
    unique: list[Path] = []
    for p in out:
        rp = p.resolve()
        if rp in seen:
            continue
        if not p.is_file():
            continue
        seen.add(rp)
        unique.append(p)
    return unique


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Gate MSC C files: action thinker must use function symbols, not opaque offsets."
    )
    parser.add_argument("files", nargs="*", type=Path, help="C files to check")
    parser.add_argument(
        "--scan-dir",
        type=Path,
        default=None,
        help="Directory to scan with --glob (e.g. E:\\XB\\mod\\040msc)",
    )
    parser.add_argument(
        "--glob",
        default="**/0.c",
        help="Glob under --scan-dir (default: **/0.c)",
    )
    parser.add_argument(
        "--strict-scan",
        action="store_true",
        help="Also emit soft warnings for non-symbol thinker expressions",
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Rewrite known opaque thinker offsets to func_* symbols (print summary)",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="With --fix, write changes to disk",
    )
    parser.add_argument(
        "--inventory",
        action="store_true",
        help="Print all thinker registrations (ok and bad) for inventory",
    )
    args = parser.parse_args(argv)

    paths = iter_paths(list(args.files), args.scan_dir, args.glob)
    if not paths:
        print("No files to check", file=sys.stderr)
        return 2

    if args.fix:
        total = 0
        for path in paths:
            _, n = fix_file(path, write=args.write)
            if n:
                mode = "wrote" if args.write else "would rewrite"
                print(f"{path}: {mode} {n} thinker registration(s)")
                total += n
        print(f"OK: fix pass on {len(paths)} file(s), {total} replacement(s)")
        if not args.write and total:
            print("Re-run with --fix --write to apply.")
        # After fix, still run check if writing? if dry-run, return 0.
        if args.write:
            # fall through to verify
            pass
        else:
            return 0

    all_findings: list[Finding] = []
    inventory_lines: list[str] = []

    for path in paths:
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = path.read_text(encoding="utf-8-sig")
        if args.inventory:
            for line_no, line in enumerate(text.splitlines(), start=1):
                for match in THINKER_RE.finditer(_strip_c_comments_line(line)):
                    arg = match.group("arg").strip()
                    sev, code = _classify_thinker_arg(arg)
                    inventory_lines.append(
                        f"{path}:{line_no}: {sev}/{code} arg={arg} :: {line.strip()}"
                    )
        all_findings.extend(check_file(path, strict_scan=args.strict_scan))

    if args.inventory:
        for row in inventory_lines:
            print(row)
        print(f"INVENTORY: {len(inventory_lines)} thinker registration(s) in {len(paths)} file(s)")

    errors = [f for f in all_findings if f.kind == "error"]
    warns = [f for f in all_findings if f.kind == "warn"]
    for f in all_findings:
        print(f.format())

    if errors:
        print(
            f"FAIL: {len(errors)} error(s), {len(warns)} warning(s) in {len(paths)} file(s)",
            file=sys.stderr,
        )
        print(
            "Hint: use `sys_1(0x10001, 0, 0x1, func_143)` or "
            "`python tools/check_msc_opaque_func_ptrs.py <file> --fix --write`",
            file=sys.stderr,
        )
        return 1

    print(f"OK: checked {len(paths)} file(s), {len(warns)} warning(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
