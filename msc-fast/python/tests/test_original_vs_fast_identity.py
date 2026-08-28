"""Golden-master identity: fast tools must match original tools byte-for-byte.

Decompiled C, decompile logs, and packed MSC binaries produced by the sandbox
`fast/` copy must be identical to `original/` (the unmodified old toolchain).
"""
from __future__ import annotations

from pathlib import Path

import pytest

from conftest import BENCH_DIR, SAMPLE_DIRS
from identity_lib import assert_bytes_equal, compile_c, decompile

DECOMPILE_NAMES = ("0.bscex", "1.cscex", "2.dscex")
COMPILE_NAMES = ("0.c", "1.c", "2.c")


def _existing_sample_files(names: tuple[str, ...]) -> list[tuple[str, Path]]:
    found: list[tuple[str, Path]] = []
    for sample_dir in SAMPLE_DIRS:
        if not sample_dir.is_dir():
            continue
        for name in names:
            path = sample_dir / name
            if path.is_file():
                found.append((f"{sample_dir.name}/{name}", path))
    return found


DECOMPILE_CASES = _existing_sample_files(DECOMPILE_NAMES)
COMPILE_CASES = _existing_sample_files(COMPILE_NAMES)

if not DECOMPILE_CASES:
    raise RuntimeError("no decompile fixtures found under SAMPLE_DIRS")
if not COMPILE_CASES:
    raise RuntimeError("no compile fixtures found under SAMPLE_DIRS")


@pytest.mark.parametrize("case_id,src", DECOMPILE_CASES, ids=[c[0] for c in DECOMPILE_CASES])
def test_decompile_c_and_log_match_original(case_id: str, src: Path, original_dir: Path, fast_dir: Path):
    orig_out = BENCH_DIR / "original" / f"{case_id.replace('/', '_')}.c"
    fast_out = BENCH_DIR / "fast" / f"{case_id.replace('/', '_')}.c"
    orig_log = BENCH_DIR / "original" / f"{case_id.replace('/', '_')}.log"
    fast_log = BENCH_DIR / "fast" / f"{case_id.replace('/', '_')}.log"

    original_c = decompile(original_dir, src, orig_out, orig_log)
    fast_c = decompile(fast_dir, src, fast_out, fast_log)

    assert_bytes_equal(original_c, fast_c, f"decompile C {case_id}")
    assert_bytes_equal(orig_log.read_bytes(), fast_log.read_bytes(), f"decompile log {case_id}")


@pytest.mark.parametrize("case_id,src", COMPILE_CASES, ids=[c[0] for c in COMPILE_CASES])
def test_compile_packed_bytes_match_original(case_id: str, src: Path, original_dir: Path, fast_dir: Path):
    orig_out = BENCH_DIR / "original" / f"{case_id.replace('/', '_')}.packed"
    fast_out = BENCH_DIR / "fast" / f"{case_id.replace('/', '_')}.packed"

    original_bin = compile_c(original_dir, src, orig_out)
    fast_bin = compile_c(fast_dir, src, fast_out)

    assert original_bin[:8] == b"\xB2\xAC\xBC\xBA\xE6\x90\x32\x01"
    assert_bytes_equal(original_bin, fast_bin, f"packed MSC {case_id}")
