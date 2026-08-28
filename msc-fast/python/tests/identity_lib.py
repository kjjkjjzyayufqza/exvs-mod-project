"""Helpers for original-vs-fast byte identity. English only."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def first_diff(original: bytes, fast: bytes) -> str:
    if original == fast:
        return ""
    limit = min(len(original), len(fast))
    for offset in range(limit):
        if original[offset] != fast[offset]:
            lo = max(0, offset - 24)
            hi = min(limit, offset + 24)
            return (
                f"first mismatch at offset {offset} (0x{offset:x}): "
                f"original=0x{original[offset]:02x} fast=0x{fast[offset]:02x}; "
                f"original_len={len(original)} fast_len={len(fast)}; "
                f"original_ctx={original[lo:hi]!r} fast_ctx={fast[lo:hi]!r}"
            )
    return (
        f"common prefix of {limit} bytes matches; "
        f"original_len={len(original)} fast_len={len(fast)}"
    )


def assert_bytes_equal(original: bytes, fast: bytes, label: str) -> None:
    if original != fast:
        raise AssertionError(f"{label}: {first_diff(original, fast)}")


def run_python_tool(tools_dir: Path, script_name: str, argv: list[str], timeout: int = 180) -> None:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(tools_dir)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    script_path = tools_dir / script_name
    result = subprocess.run(
        [sys.executable, str(script_path), *argv],
        cwd=str(tools_dir),
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise AssertionError(
            f"{script_name} failed in {tools_dir} argv={argv!r}\n"
            f"stdout:\n{result.stdout[-4000:]}\n"
            f"stderr:\n{result.stderr[-4000:]}"
        )


def decompile(tools_dir: Path, src: Path, out_c: Path, log_path: Path) -> bytes:
    out_c.parent.mkdir(parents=True, exist_ok=True)
    run_python_tool(
        tools_dir,
        "mscdec.py",
        [str(src), "-o", str(out_c), "-log", str(log_path)],
    )
    return out_c.read_bytes()


def compile_c(tools_dir: Path, src_c: Path, out_bin: Path) -> bytes:
    out_bin.parent.mkdir(parents=True, exist_ok=True)
    run_python_tool(
        tools_dir,
        "msclang.py",
        [str(src_c), "-o", str(out_bin), "-i"],
    )
    return out_bin.read_bytes()
