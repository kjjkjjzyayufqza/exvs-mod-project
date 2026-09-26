#!/usr/bin/env python3
"""Mechanical strip passes for provenance scanner tests only."""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

WORD_LINE_RE = re.compile(
    r"AEtools|PolyForm|kjjkjjzyayufqza|ACCEPTABLE_USE|SourceNotice|Agent contract",
    re.IGNORECASE,
)
POOL_ROW_RE = re.compile(
    r"^\s*\(\s*0x[0-9A-Fa-f]{8}\s*,\s*\d+\s*,\s*\"[^\"]+\"\s*\)\s*,?\s*$"
)
QUOTED_POOL_NAME_RE = re.compile(r"\"([^\"]+)\"")


def copy_tree(source: Path, destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination)


def drop_word_lines(tree: Path) -> None:
    for path in tree.rglob("*"):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines(keepends=True)
        kept = [line for line in lines if not WORD_LINE_RE.search(line)]
        path.write_text("".join(kept), encoding="utf-8")


def load_allow_hashes(allow_file: Path) -> set[str]:
    allowed: set[str] = set()
    for line in allow_file.read_text(encoding="utf-8").splitlines():
        token = line.strip().lower()
        if token:
            allowed.add(token)
    return allowed


def drop_unknown_hash_rows(tree: Path, allow_file: Path) -> None:
    allowed = load_allow_hashes(allow_file)
    for path in tree.rglob("*"):
        if not path.is_file():
            continue
        lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
        kept: list[str] = []
        for line in lines:
            if POOL_ROW_RE.match(line.rstrip("\n")):
                hash_match = re.search(r"0x[0-9A-Fa-f]{8}", line, re.IGNORECASE)
                if hash_match and hash_match.group(0).lower() not in allowed:
                    continue
            kept.append(line)
        path.write_text("".join(kept), encoding="utf-8")


def replace_pool_names(tree: Path) -> None:
    for path in tree.rglob("*"):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines(keepends=True)
        out: list[str] = []
        for line in lines:
            if POOL_ROW_RE.match(line.rstrip("\n")):
                line = QUOTED_POOL_NAME_RE.sub('"unknown"', line)
            out.append(line)
        path.write_text("".join(out), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Simulate mechanical provenance stripping.")
    parser.add_argument("source", type=Path, help="Input directory")
    parser.add_argument("destination", type=Path, help="Output directory")
    parser.add_argument("--drop-words", action="store_true")
    parser.add_argument("--drop-unknown-hash", type=Path, metavar="ALLOW_FILE")
    parser.add_argument("--replace-names", action="store_true")
    args = parser.parse_args(argv)

    if not args.source.is_dir():
        print(f"source not found: {args.source}", file=sys.stderr)
        return 1

    copy_tree(args.source, args.destination)
    if args.drop_words:
        drop_word_lines(args.destination)
    if args.drop_unknown_hash is not None:
        drop_unknown_hash_rows(args.destination, args.drop_unknown_hash)
    if args.replace_names:
        replace_pool_names(args.destination)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
