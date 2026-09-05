#!/usr/bin/env python3
"""Keep only the `app` Cargo binary for the GitHub Actions NSIS bundle.

Tauri CLI 2.11 builds `cargo build --bins` and then disk-scans src/bin.
Agent CLIs (exvs2_json, fhm2d_extract) would otherwise be linked into the
installer. This rewrite is CI-only and mutates the checkout.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CARGO_TOML = REPO_ROOT / "src-tauri" / "Cargo.toml"
SRC_BIN = REPO_ROOT / "src-tauri" / "src" / "bin"
HIDDEN_BIN = REPO_ROOT / "src-tauri" / "src" / "bin.ci-hidden"


def keep_app_bin_only(text: str) -> str:
    lines = text.splitlines(keepends=True)
    output: list[str] = []
    index = 0
    while index < len(lines):
        if lines[index].strip() == "[[bin]]":
            block = [lines[index]]
            index += 1
            while index < len(lines) and not lines[index].startswith("["):
                block.append(lines[index])
                index += 1
            if any(line.strip() == 'name = "app"' for line in block):
                output.extend(block)
            continue
        output.append(lines[index])
        index += 1
    return "".join(output)


def main() -> int:
    original = CARGO_TOML.read_text(encoding="utf-8")
    rewritten = keep_app_bin_only(original)
    if 'name = "app"' not in rewritten:
        print("prepare_tauri_app_only_bins: dropped the app binary", file=sys.stderr)
        return 1
    if 'name = "crc32_brute_seed"' in rewritten or 'name = "exvs2_json"' in rewritten:
        print("prepare_tauri_app_only_bins: extra [[bin]] entries remain", file=sys.stderr)
        return 1
    CARGO_TOML.write_text(rewritten, encoding="utf-8")
    if SRC_BIN.exists():
        if HIDDEN_BIN.exists():
            print(f"prepare_tauri_app_only_bins: {HIDDEN_BIN} already exists", file=sys.stderr)
            return 1
        SRC_BIN.rename(HIDDEN_BIN)
    print("Prepared Cargo.toml and hid src/bin for an app-only NSIS bundle")
    return 0


def _self_check() -> None:
    sample = """[package]
name = "app"
[[bin]]
name = "app"
path = "src/main.rs"

[[bin]]
name = "exvs2_json"
path = "src/bin/exvs2_json.rs"

[[test]]
name = "x"
"""
    rewritten = keep_app_bin_only(sample)
    if "exvs2_json" in rewritten:
        raise SystemExit("self-check: extra bin was kept")
    if 'name = "app"' not in rewritten or "[[test]]" not in rewritten:
        raise SystemExit("self-check: app bin or tests were dropped")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        _self_check()
        print("prepare_tauri_app_only_bins self-check passed")
    else:
        raise SystemExit(main())
