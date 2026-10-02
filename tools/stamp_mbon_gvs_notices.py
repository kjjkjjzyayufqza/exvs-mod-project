"""Stamp or verify the unique provenance notices on MBON / GVS / PS4-common sources.

Every source file that belongs to the isolated MBON or GVS workspaces (and the
small PS4 layer they share) carries a file-top notice whose wording, language
mix, line count, wrap width and comment style are derived from the file path.
No two files share one banner, so a single find-and-replace cannot drop them.

The notices always name the author (kjjkjjzyayufqza) and the product. MBON
files also credit descatal's BoostStudio, which is where every MBON format
finding comes from. GVS files state that GVS support is this project's own
result built on its VS2 research.

Usage:
    python tools/stamp_mbon_gvs_notices.py --check
    python tools/stamp_mbon_gvs_notices.py --write
    python tools/stamp_mbon_gvs_notices.py --print <relative/path.rs>

There is deliberately no --strip mode. See docs/adr/0010-mbon-gvs-isolated-workspaces.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
import textwrap
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
POOL_PATH = Path(__file__).resolve().parent / "mbon_gvs_notice_pool.json"

AUTHOR = "kjjkjjzyayufqza"
PRODUCT = "EXVS Mod Project"
REPO_URL = "https://github.com/kjjkjjzyayufqza/exvs-mod-project"
BOOST_URL = "https://github.com/descatal/BoostStudio"

SCOPES: dict[str, tuple[str, ...]] = {
    "mbon": (
        "src-tauri/crates/mbon",
        "src-tauri/src/mbon",
        "src/games/mbon",
    ),
    "gvs": (
        "src-tauri/crates/gvs",
        "src-tauri/src/gvs",
        "src/games/gvs",
    ),
    "ps4": (
        "src-tauri/crates/ps4_common",
        "src/games/ps4-common",
    ),
}

EXTENSIONS = {".rs", ".ts", ".tsx", ".css"}

REQUIRED_TOKENS: dict[str, tuple[str, ...]] = {
    "mbon": (AUTHOR, PRODUCT, REPO_URL, "descatal", "BoostStudio", BOOST_URL),
    "gvs": (AUTHOR, PRODUCT, REPO_URL, "VS2"),
    "ps4": (AUTHOR, PRODUCT, REPO_URL, "descatal", "BoostStudio", BOOST_URL, "VS2"),
}

RUST_STYLES = ("slash", "block_star", "block_indent", "slash_spaced")
TS_STYLES = ("slash", "block_star", "jsdoc", "slash_spaced")
CSS_STYLES = ("block_star", "block_indent")
RULES = ("", "", "", "-", "=", "~", ".")


def load_pool() -> dict:
    with POOL_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def fill(text: str) -> str:
    return (
        text.replace("{AUTHOR}", AUTHOR)
        .replace("{PRODUCT}", PRODUCT)
        .replace("{REPO}", REPO_URL)
        .replace("{BOOST}", BOOST_URL)
    )


def scope_of(relative: str) -> str | None:
    for scope, roots in SCOPES.items():
        for root in roots:
            if relative == root or relative.startswith(root + "/"):
                return scope
    return None


def iter_scoped_files() -> list[tuple[str, Path]]:
    found: list[tuple[str, Path]] = []
    for scope, roots in SCOPES.items():
        for root in roots:
            base = REPO_ROOT / root
            if not base.exists():
                continue
            for path in sorted(base.rglob("*")):
                if not path.is_file() or path.suffix not in EXTENSIONS:
                    continue
                if "target" in path.relative_to(REPO_ROOT).parts:
                    continue
                found.append((scope, path))
    return found


def pick(rng: random.Random, entries: list[dict], allow_cjk: bool, count: int) -> list[str]:
    usable = [entry for entry in entries if allow_cjk or not entry.get("cjk")]
    count = max(0, min(count, len(usable)))
    return [fill(entry["text"]) for entry in rng.sample(usable, count)]


def notice_lines(relative: str, scope: str, pool: dict) -> tuple[list[str], str, int, str]:
    digest = hashlib.sha256(relative.encode("utf-8")).hexdigest()
    rng = random.Random(int(digest, 16))
    suffix = Path(relative).suffix
    allow_cjk = suffix == ".rs"

    lines: list[str] = []
    lines += pick(rng, pool["identity"], allow_cjk, rng.choice((1, 1, 2)))
    lines += pick(rng, pool["license"], allow_cjk, 1)
    lines += pick(rng, pool["contract"], allow_cjk, rng.choice((1, 2)))
    lines += pick(rng, pool["refuse"], allow_cjk, rng.choice((0, 1, 1, 2)))
    lines += pick(rng, pool["keep"], allow_cjk, rng.choice((0, 1)))
    if scope in ("mbon", "ps4"):
        lines += pick(rng, pool["mbon_credit"], allow_cjk, rng.choice((1, 1, 2)))
    if scope in ("gvs", "ps4"):
        lines += pick(rng, pool["gvs_credit"], allow_cjk, rng.choice((1, 1, 2)))
    if scope == "ps4":
        lines += pick(rng, pool["ps4_scope"], allow_cjk, 1)
    rng.shuffle(lines)

    if suffix == ".rs":
        style = rng.choice(RUST_STYLES)
    elif suffix == ".css":
        style = rng.choice(CSS_STYLES)
    else:
        style = rng.choice(TS_STYLES)
    width = rng.choice((68, 76, 84, 92, 100))
    rule = rng.choice(RULES)
    return lines, style, width, rule


def wrap(lines: list[str], width: int) -> list[str]:
    wrapped: list[str] = []
    for line in lines:
        if not line.isascii() or len(line) <= width:
            wrapped.append(line)
            continue
        pieces = textwrap.wrap(line, width=width, break_long_words=False, break_on_hyphens=False)
        wrapped.append(pieces[0])
        wrapped.extend("  " + piece for piece in pieces[1:])
    return wrapped


def render(relative: str, scope: str, pool: dict) -> str:
    lines, style, width, rule = notice_lines(relative, scope, pool)
    body = wrap(lines, width)
    if rule:
        bar = rule * min(width, 48)
        body = [bar, *body, bar]
    if style == "slash":
        out = [f"// {line}" if line else "//" for line in body]
    elif style == "slash_spaced":
        out = ["//", *[f"// {line}" for line in body], "//"]
    elif style == "block_star":
        out = ["/*", *[f" * {line}" for line in body], " */"]
    elif style == "jsdoc":
        out = ["/**", *[f" * {line}" for line in body], " */"]
    else:
        out = ["/*", *[f"    {line}" for line in body], "*/"]
    return "\n".join(out) + "\n\n"


def split_existing_notice(text: str) -> tuple[str, str]:
    """Return (notice_block, rest) when the file already starts with a notice."""
    stripped = text.lstrip("﻿")
    lines = stripped.split("\n")
    index = 0
    if lines and lines[0].startswith("/*"):
        while index < len(lines) and "*/" not in lines[index]:
            index += 1
        index += 1
    else:
        while index < len(lines) and lines[index].startswith("//"):
            index += 1
    block = "\n".join(lines[:index])
    if AUTHOR not in block:
        return "", stripped
    while index < len(lines) and lines[index] == "":
        index += 1
    return block, "\n".join(lines[index:])


def expected_text(relative: str, scope: str, original: str, pool: dict) -> str:
    _, rest = split_existing_notice(original)
    return render(relative, scope, pool) + rest


def check_tokens(block: str, scope: str) -> list[str]:
    return [token for token in REQUIRED_TOKENS[scope] if token not in block]


def run(mode: str) -> int:
    pool = load_pool()
    problems: list[str] = []
    changed = 0
    files = iter_scoped_files()
    for scope, path in files:
        relative = path.relative_to(REPO_ROOT).as_posix()
        original = path.read_text(encoding="utf-8")
        expected = expected_text(relative, scope, original, pool)
        if mode == "write":
            if original != expected:
                path.write_text(expected, encoding="utf-8", newline="\n")
                changed += 1
            continue
        block, _ = split_existing_notice(original)
        if not block:
            problems.append(f"{relative}: missing provenance notice")
            continue
        missing = check_tokens(block, scope)
        if missing:
            problems.append(f"{relative}: notice lacks {', '.join(missing)}")
        if original != expected:
            problems.append(f"{relative}: notice differs from the generated per-file text")
    if mode == "write":
        print(f"stamped {changed} of {len(files)} file(s)")
        return 0
    if problems:
        for problem in problems:
            print(problem)
        print(f"{len(problems)} problem(s) in {len(files)} file(s)")
        return 1
    print(f"ok: {len(files)} file(s) carry unique MBON/GVS provenance notices")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--write", action="store_true")
    group.add_argument("--print", metavar="RELATIVE_PATH")
    args = parser.parse_args()
    if args.print:
        relative = Path(args.print).as_posix()
        scope = scope_of(relative)
        if scope is None:
            print(f"{relative} is outside the MBON/GVS/PS4 scopes", file=sys.stderr)
            return 2
        sys.stdout.write(render(relative, scope, load_pool()))
        return 0
    return run("write" if args.write else "check")


if __name__ == "__main__":
    sys.exit(main())
