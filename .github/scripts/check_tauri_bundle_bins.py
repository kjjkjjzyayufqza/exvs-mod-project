#!/usr/bin/env python3
"""Guard the Tauri 2.11 NSIS extra-bin failure from release job 100337334552.

Tauri CLI 2.11 `get_binaries()`:
  1. Reads Cargo.toml [[bin]] and skips targets whose required-features
     are not enabled (legacy-cli-tools is off in `tauri build`).
  2. Disk-scans src-tauri/src/bin/*.rs and re-adds every name not already
     in the list, ignoring required-features (tauri-apps/tauri#15325).

Job 100337334552 then failed with:
  failed to bundle project when getting size of ...\\crc32_brute_seed.exe
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CARGO_TOML = REPO_ROOT / "src-tauri" / "Cargo.toml"
SRC_BIN = REPO_ROOT / "src-tauri" / "src" / "bin"
FAILED_JOB_BIN = "crc32_brute_seed"
TAURI_BUILD_FEATURES = {"tauri/custom-protocol"}

FAILED_LAYOUT = """
[[bin]]
name = "app"
path = "src/main.rs"

[[bin]]
name = "crc32_brute_seed"
path = "src/bin/crc32_brute_seed.rs"
required-features = ["legacy-cli-tools"]
"""


def parse_bin_blocks(text: str) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if stripped == "[[bin]]":
            if current:
                blocks.append(current)
            current = {}
            continue
        if current is None:
            continue
        if stripped.startswith("["):
            blocks.append(current)
            current = {} if stripped == "[[bin]]" else None
            continue
        match = re.match(r"^([A-Za-z0-9_-]+)\s*=\s*(.+)$", stripped)
        if not match:
            continue
        key, value = match.group(1), match.group(2).strip()
        current[key] = value
    if current:
        blocks.append(current)
    return blocks


def required_features_of(value: str | None) -> set[str]:
    if not value:
        return set()
    return set(re.findall(r'"([^"]+)"', value))


def has_required_features(value: str | None) -> bool:
    return bool(required_features_of(value))


def path_is_under_src_bin(value: str) -> bool:
    normalized = value.strip().strip('"').replace("\\", "/")
    return normalized.startswith("src/bin/")


def simulate_tauri_211_bundle_bins(
    cargo_text: str,
    src_bin: Path | None,
    enabled_features: set[str],
) -> list[str]:
    names: list[str] = []
    for bin_block in parse_bin_blocks(cargo_text):
        name = bin_block.get("name", "").strip().strip('"')
        required = required_features_of(bin_block.get("required-features"))
        if required and not required.issubset(enabled_features):
            continue
        if name:
            names.append(name)
    if src_bin is not None and src_bin.is_dir():
        for source in sorted(src_bin.glob("*.rs")):
            if source.stem not in names:
                names.append(source.stem)
    return names


def load_prepare_module():
    spec = importlib.util.spec_from_file_location(
        "prepare_tauri_app_only_bins",
        Path(__file__).with_name("prepare_tauri_app_only_bins.py"),
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load prepare_tauri_app_only_bins.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def collect_layout_errors(cargo_text: str, src_bin: Path) -> list[str]:
    bins = parse_bin_blocks(cargo_text)
    errors: list[str] = []
    gated_names: set[str] = set()
    for bin_block in bins:
        name = bin_block.get("name", "").strip().strip('"')
        bin_path = bin_block.get("path", "")
        if has_required_features(bin_block.get("required-features")):
            gated_names.add(name)
            if path_is_under_src_bin(bin_path):
                errors.append(
                    f"{name}: required-features bin must not use path {bin_path} "
                    "(move it out of src/bin so Tauri NSIS will not disk-scan it)"
                )

    if src_bin.is_dir():
        for source in src_bin.glob("*.rs"):
            if source.stem in gated_names:
                errors.append(
                    f"{source}: Tauri CLI 2.11 will bundle this gated bin even when cargo skips it"
                )

    bundled = simulate_tauri_211_bundle_bins(cargo_text, src_bin, TAURI_BUILD_FEATURES)
    for gated in sorted(gated_names):
        if gated in bundled:
            errors.append(
                f"Tauri 2.11 simulation would NSIS-copy {gated}.exe (same class as job 100337334552)"
            )
    if FAILED_JOB_BIN in bundled:
        errors.append(
            f"Tauri 2.11 simulation still includes {FAILED_JOB_BIN}, the binary from the failed release log"
        )
    return errors


def self_check() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        fake_src_bin = Path(tmp) / "bin"
        fake_src_bin.mkdir()
        (fake_src_bin / f"{FAILED_JOB_BIN}.rs").write_text("fn main() {}\n", encoding="utf-8")
        failed_list = simulate_tauri_211_bundle_bins(
            FAILED_LAYOUT,
            fake_src_bin,
            TAURI_BUILD_FEATURES,
        )
        if FAILED_JOB_BIN not in failed_list:
            raise SystemExit(
                "self-check: simulator did not reproduce the failed-job disk-scan of crc32_brute_seed"
            )

    cargo_text = CARGO_TOML.read_text(encoding="utf-8")
    current_errors = collect_layout_errors(cargo_text, SRC_BIN)
    if current_errors:
        raise SystemExit("self-check: current tree still matches the failed NSIS layout:\n" + "\n".join(current_errors))

    current_list = simulate_tauri_211_bundle_bins(cargo_text, SRC_BIN, TAURI_BUILD_FEATURES)
    if FAILED_JOB_BIN in current_list:
        raise SystemExit("self-check: current tree would still bundle crc32_brute_seed")

    prepare = load_prepare_module()
    stamped = re.sub(
        r'^version = "[^"]+"',
        'version = "0.1.99"',
        cargo_text,
        count=1,
        flags=re.M,
    )
    if 'version = "0.1.99"' not in stamped:
        raise SystemExit("self-check: stamp regex did not change the package version")
    prepared = prepare.keep_app_bin_only(stamped)
    if 'version = "0.1.99"' not in prepared:
        raise SystemExit("self-check: prepare dropped the stamped Cargo.toml version")
    prepared_list = simulate_tauri_211_bundle_bins(prepared, None, TAURI_BUILD_FEATURES)
    if prepared_list != ["app"]:
        raise SystemExit(f"self-check: app-only prepare produced {prepared_list!r}, expected ['app']")
    print("Tauri NSIS extra-bin self-check passed")
    print(f"current tauri 2.11 bundle bins: {current_list}")
    print(f"CI stamp+prepare bundle bins: {prepared_list}")


def main() -> int:
    cargo_text = CARGO_TOML.read_text(encoding="utf-8")
    bins = parse_bin_blocks(cargo_text)
    if not bins:
        print("No [[bin]] targets found in src-tauri/Cargo.toml", file=sys.stderr)
        return 1

    errors = collect_layout_errors(cargo_text, SRC_BIN)
    if errors:
        print("Tauri NSIS extra-bin gate failed:", file=sys.stderr)
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        return 1

    bundled = simulate_tauri_211_bundle_bins(cargo_text, SRC_BIN, TAURI_BUILD_FEATURES)
    print("Tauri NSIS extra-bin gate passed")
    print(f"tauri 2.11 would bundle: {', '.join(bundled)}")
    return 0


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        self_check()
    else:
        raise SystemExit(main())
