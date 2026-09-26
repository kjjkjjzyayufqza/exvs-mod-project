#!/usr/bin/env python3
"""Extract (hash, kind, name) rows from public *_COMMAND_POOL tables."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

POOL_MARKER = "_COMMAND_POOL"
HASH_RE = re.compile(r"0x[0-9A-Fa-f]{8}")
KIND_RE = re.compile(r",\s*(\d+)\s*,\s*\"")
NAME_RE = re.compile(r"\"([^\"]+)\"")
SKIP_NAME_RE = re.compile(r"^(field_[0-9a-fA-F]+|unresolved_.*)$")

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FORMAT_DIR = REPO_ROOT / "src-tauri" / "src" / "format"
LOCAL_PROVENANCE_PREFIX = "local/provenance"


def find_matching_bracket(text: str, open_index: int) -> int:
    depth = 0
    for i in range(open_index, len(text)):
        ch = text[i]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return i
    raise ValueError("unclosed bracket slice")


def find_matching_paren(text: str, open_index: int) -> int:
    depth = 0
    in_string = False
    escape = False
    for i in range(open_index, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i
    raise ValueError("unclosed parenthesis in pool row")


def pool_body_for_marker(source: str, marker_index: int) -> str | None:
    anchor = source.find("&[", marker_index)
    if anchor < 0:
        return None
    bracket_start = anchor + 1
    bracket_end = find_matching_bracket(source, bracket_start)
    return source[bracket_start + 1 : bracket_end]


def parse_row_tuple(tuple_body: str) -> tuple[str, int, str] | None:
    hash_match = HASH_RE.search(tuple_body)
    kind_match = KIND_RE.search(tuple_body)
    name_match = NAME_RE.search(tuple_body)
    if not hash_match or not kind_match or not name_match:
        return None
    name = name_match.group(1)
    if SKIP_NAME_RE.match(name):
        return None
    hash_text = hash_match.group(0).lower()
    kind = int(kind_match.group(1))
    return hash_text, kind, name


def rows_from_pool_body(body: str) -> list[tuple[str, int, str]]:
    rows: list[tuple[str, int, str]] = []
    index = 0
    while index < len(body):
        if body[index] == "(":
            close = find_matching_paren(body, index)
            parsed = parse_row_tuple(body[index + 1 : close])
            if parsed is not None:
                rows.append(parsed)
            index = close + 1
        else:
            index += 1
    return rows


def extract_from_file(path: Path) -> list[dict[str, object]]:
    text = path.read_text(encoding="utf-8")
    extracted: list[dict[str, object]] = []
    search_from = 0
    while True:
        marker = text.find(POOL_MARKER, search_from)
        if marker < 0:
            break
        body = pool_body_for_marker(text, marker)
        search_from = marker + len(POOL_MARKER)
        if body is None:
            continue
        for hash_text, kind, name in rows_from_pool_body(body):
            extracted.append(
                {"hash": hash_text, "kind": kind, "name": name, "file": str(path)}
            )
    return extracted


def extract_directory(format_dir: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for path in sorted(format_dir.glob("*.rs")):
        rows.extend(extract_from_file(path))
    return rows


def normalize_provenance_path(path: Path) -> Path:
    return path.resolve()


def path_is_under_local_provenance(path: Path) -> bool:
    resolved = normalize_provenance_path(path)
    try:
        resolved.relative_to((REPO_ROOT / "local" / "provenance").resolve())
        return True
    except ValueError:
        return False


def git_ignores(path: Path) -> bool:
    result = subprocess.run(
        ["git", "check-ignore", "-q", str(path)],
        cwd=REPO_ROOT,
        capture_output=True,
    )
    return result.returncode == 0


def refuse_local_out(path: Path) -> None:
    resolved = normalize_provenance_path(path)
    if not path_is_under_local_provenance(resolved):
        raise SystemExit(
            f"--local-out must be under {LOCAL_PROVENANCE_PREFIX}/ (got {path})"
        )
    try:
        resolved.relative_to(REPO_ROOT.resolve())
    except ValueError:
        return
    if not git_ignores(resolved):
        raise SystemExit(
            f"--local-out is inside the repo but not gitignored: {path}"
        )


def write_local_manifest(path: Path, rows: list[dict[str, object]]) -> None:
    refuse_local_out(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "recipient": "public-main",
        "rows": [
            {
                "hash": row["hash"],
                "kind": row["kind"],
                "name": row["name"],
                "class": "burned",
            }
            for row in rows
        ],
    }
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract COMMAND_POOL tuples from Rust format pools.")
    parser.add_argument(
        "--format-dir",
        type=Path,
        default=DEFAULT_FORMAT_DIR,
        help="Directory of format *.rs files",
    )
    parser.add_argument(
        "--local-out",
        type=Path,
        help="Write burned manifest under local/provenance/ (gitignored)",
    )
    args = parser.parse_args(argv)

    if not args.format_dir.is_dir():
        print(f"format dir not found: {args.format_dir}", file=sys.stderr)
        return 1

    rows = extract_directory(args.format_dir)
    print(json.dumps(rows, indent=2))

    if args.local_out is not None:
        write_local_manifest(args.local_out, rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
