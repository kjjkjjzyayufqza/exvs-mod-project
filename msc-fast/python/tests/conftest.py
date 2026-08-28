"""Identity-test fixtures. Never import E:\\TAURI_PROJECT\\tools."""
from __future__ import annotations

from pathlib import Path

import pytest

SANDBOX = Path(__file__).resolve().parents[1]
ORIGINAL_DIR = SANDBOX / "original"
FAST_DIR = SANDBOX / "fast"
BENCH_DIR = SANDBOX / "bench" / "identity"

SAMPLE_DIRS = [
    Path(r"E:\XB\解包\com\file\040msc\0x605245CC"),
    Path(r"E:\XB\解包\com\file\040msc\0x18AF7533"),
    Path(r"E:\XB\解包\com\file\040msc\0x0B180D9E"),
]


def pytest_configure(config: pytest.Config) -> None:
    BENCH_DIR.mkdir(parents=True, exist_ok=True)


@pytest.fixture(scope="session")
def original_dir() -> Path:
    assert ORIGINAL_DIR.is_dir(), ORIGINAL_DIR
    return ORIGINAL_DIR


@pytest.fixture(scope="session")
def fast_dir() -> Path:
    assert FAST_DIR.is_dir(), FAST_DIR
    return FAST_DIR
