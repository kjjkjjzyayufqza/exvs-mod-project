#!/usr/bin/env python3
"""PortDetector: score a suspect tree against a local tuple manifest."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
TEXT_SUFFIXES = {".rs", ".py", ".json", ".md", ".html", ".toml", ".txt"}
HASH_TOKEN_RE = re.compile(r"0x[0-9a-f]{8}")
PAIR_WINDOW = 400
LOG_PATTERNS = [
    re.compile(r"extract.*command_pool", re.IGNORECASE),
    re.compile(r"merge.*command_pool", re.IGNORECASE),
    re.compile(r"strip.*command_pool", re.IGNORECASE),
    re.compile(r"obf_string", re.IGNORECASE),
    re.compile(r"port_fingerprint/extract_pools", re.IGNORECASE),
]


def normalize_hash(text: str) -> str | None:
    match = HASH_TOKEN_RE.search(text.lower())
    if not match:
        return None
    return match.group(0)


def git_ignores(path: Path) -> bool:
    result = subprocess.run(
        ["git", "check-ignore", "-q", str(path)],
        cwd=REPO_ROOT,
        capture_output=True,
    )
    return result.returncode == 0


def manifest_path_allowed(path: Path) -> bool:
    resolved = path.resolve()
    try:
        resolved.relative_to(FIXTURES_DIR.resolve())
        return True
    except ValueError:
        pass
    try:
        resolved.relative_to(REPO_ROOT.resolve())
    except ValueError:
        return True
    return git_ignores(resolved)


def refuse_manifest(path: Path) -> None:
    resolved = path.resolve()
    try:
        resolved.relative_to(REPO_ROOT.resolve())
    except ValueError:
        return
    if manifest_path_allowed(resolved):
        return
    raise SystemExit(f"--manifest must be gitignored or under fixtures: {path}")


def load_manifest(path: Path) -> list[dict[str, object]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("rows", [])
    if not isinstance(rows, list):
        raise SystemExit("manifest rows must be a list")
    return rows


def iter_text_files(tree: Path) -> list[Path]:
    files: list[Path] = []
    for path in tree.rglob("*"):
        if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES:
            files.append(path)
    return files


def pair_hit_in_text(text: str, hash_text: str, name: str) -> bool:
    name_index = 0
    while True:
        found = text.find(name, name_index)
        if found < 0:
            return False
        window_start = max(0, found - PAIR_WINDOW)
        window_end = min(len(text), found + len(name) + PAIR_WINDOW)
        window = text[window_start:window_end]
        if hash_text in window.lower():
            return True
        name_index = found + 1
    return False


def scan_tree(
    tree: Path, rows: list[dict[str, object]]
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    pair_hits: list[dict[str, str]] = []
    weak_hits: list[dict[str, str]] = []
    for file_path in iter_text_files(tree):
        text = file_path.read_text(encoding="utf-8", errors="replace")
        lowered = text.lower()
        for row in rows:
            hash_text = str(row["hash"]).lower()
            name = str(row["name"])
            if pair_hit_in_text(text, hash_text, name):
                pair_hits.append(
                    {"hash": hash_text, "name": name, "file": str(file_path)}
                )
                continue
            if name in text and hash_text not in lowered:
                weak_hits.append(
                    {"hash": hash_text, "name": name, "file": str(file_path)}
                )
    return pair_hits, weak_hits


def scan_log(log_path: Path) -> list[str]:
    hits: list[str] = []
    for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if any(pattern.search(line) for pattern in LOG_PATTERNS):
            hits.append(line)
    return hits


def decide_match(
    pair_hits: list[dict[str, str]],
    rows: list[dict[str, object]],
    threshold: int,
) -> bool:
    trap_hashes = {
        str(row["hash"]).lower()
        for row in rows
        if str(row.get("class", "")) == "trap"
    }
    if trap_hashes:
        for hit in pair_hits:
            if hit["hash"] in trap_hashes:
                return True
    return len(pair_hits) >= threshold


class _UsageParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        self.print_usage(sys.stderr)
        print(f"error: {message}", file=sys.stderr)
        raise SystemExit(1)


def main(argv: list[str] | None = None) -> int:
    parser = _UsageParser(description="Scan a suspect tree for tuple fingerprints.")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--tree", type=Path, required=True)
    parser.add_argument("--log", type=Path)
    parser.add_argument("--threshold", type=int, default=8)
    args = parser.parse_args(argv)

    if not args.manifest.is_file():
        print("manifest not found", file=sys.stderr)
        return 1
    if not args.tree.is_dir():
        print("tree not found", file=sys.stderr)
        return 1

    refuse_manifest(args.manifest)
    rows = load_manifest(args.manifest)
    pair_hits, weak_hits = scan_tree(args.tree, rows)

    for hit in pair_hits:
        print(f"PAIR {hit['hash']} {hit['name']} {hit['file']}")
    for hit in weak_hits:
        print(f"WEAK {hit['hash']} {hit['name']} {hit['file']}")

    if args.log is not None and args.log.is_file():
        for line in scan_log(args.log):
            print(f"LOG {line}")

    if decide_match(pair_hits, rows, args.threshold):
        print("MATCH")
        return 0

    print("NO_MATCH")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
