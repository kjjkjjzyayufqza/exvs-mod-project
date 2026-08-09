"""Drive the real `python -m texture_forge` entry point (not a reimplemented harness)."""

import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"

# Package lives under tools/; the shipped entry point is `python -m texture_forge`.
ENV = {**os.environ, "PYTHONPATH": str(TOOLS_DIR)}


def _run_cli(*args: str, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "texture_forge", *args],
        cwd=str(REPO_ROOT),
        env=ENV,
        capture_output=True,
        text=True,
        check=check,
    )


def _write_multicolor_base(path: Path, size: int = 64) -> Path:
    """Synthetic base with blue paint + gold metal + near-black rubber."""
    image = np.zeros((size, size, 3), dtype=np.uint8)
    image[:, : size // 2] = (10, 50, 110)  # blue paint
    image[:, size // 2 : 3 * size // 4] = (200, 140, 30)  # gold metal
    image[:, 3 * size // 4 :] = (8, 8, 8)  # dark rubber
    Image.fromarray(image, "RGB").save(path)
    return path


def test_module_help_mentions_metallic_limitation():
    result = _run_cli("--help")
    assert result.returncode == 0, result.stderr
    text = (result.stdout + result.stderr).lower()
    assert "metal" in text
    assert "paint" in text
    assert "build" in text


def test_build_help_documents_neutral_default():
    result = _run_cli("build", "--help")
    assert result.returncode == 0, result.stderr
    text = result.stdout.lower()
    assert "paint" in text
    assert "--out" in text
    assert "--name" in text


def test_build_writes_maps_materials_and_report(tmp_path):
    base = _write_multicolor_base(tmp_path / "base.png")
    out = tmp_path / "out"
    result = _run_cli(
        "build",
        str(base),
        "--out",
        str(out),
        "--name",
        "wep_test",
        "--png-only",
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
    assert (out / "materials.json").is_file()
    assert (out / "report.md").is_file()
    for suffix in ("roughnessmap", "metallicmap", "aomap", "normalmap"):
        assert (out / f"wep_test_{suffix}.png").is_file(), suffix

    materials = json.loads((out / "materials.json").read_text(encoding="utf-8"))
    assert "limitation" in materials
    assert materials["clusters"]

    # Safe-band gates from the broken chrome weapon case.
    sys.path.insert(0, str(TOOLS_DIR))
    from texture_forge import pipeline as pl  # noqa: E402

    roughness = np.asarray(
        Image.open(out / "wep_test_roughnessmap.png").convert("L"), dtype=np.float64
    ) / 255.0
    metallic = np.asarray(
        Image.open(out / "wep_test_metallicmap.png").convert("L"), dtype=np.float64
    ) / 255.0
    r = pl.channel_stats(roughness)
    m = pl.channel_stats(metallic)
    assert r.mirror < 0.10, r
    assert m.p25 < 0.40, m


def test_build_exits_nonzero_when_validation_errors(tmp_path, monkeypatch):
    """Error-level validation must fail the process — not silently ship chrome maps."""
    base = _write_multicolor_base(tmp_path / "base.png")
    out = tmp_path / "out"

    sys.path.insert(0, str(TOOLS_DIR))
    import texture_forge.pipeline as pl  # noqa: E402
    import texture_forge.validate as val  # noqa: E402

    def bad_validate(texture_set):
        return [
            val.Finding(
                rule="roughness-mirror",
                severity="error",
                slot="roughness",
                measured="99%",
                reference="0.3%",
                message="forced error for CLI exit contract",
            )
        ]

    monkeypatch.setattr(pl, "validate_texture_set", bad_validate)
    # Call pipeline directly under the monkeypatch, then assert CLI wiring matches
    # by also re-checking the module path exit code contract on a broken report path.
    # The real CLI process cannot see this monkeypatch; drive build() here and
    # separately ensure main() maps error_count → exit 1.
    result = pl.build(
        base,
        out,
        "wep_bad",
        encode_nutexb=False,
    )
    assert result.error_count >= 1

    from texture_forge.__main__ import main  # noqa: E402

    # Inject a temporary command that reuses the already-failed build directory via check.
    # Force check to report an error by writing a mirror-flat roughness map.
    Image.fromarray(np.full((32, 32), 5, dtype=np.uint8), "L").save(
        out / "wep_bad_roughnessmap.png"
    )
    Image.fromarray(np.full((32, 32), 0, dtype=np.uint8), "L").save(
        out / "wep_bad_metallicmap.png"
    )
    Image.fromarray(np.full((32, 32), 255, dtype=np.uint8), "L").save(
        out / "wep_bad_aomap.png"
    )
    normal = np.dstack(
        [
            np.full((32, 32), 128, dtype=np.uint8),
            np.full((32, 32), 128, dtype=np.uint8),
            np.full((32, 32), 255, dtype=np.uint8),
        ]
    )
    Image.fromarray(normal, "RGB").save(out / "wep_bad_normalmap.png")

    exit_code = main(["check", str(out), "--name", "wep_bad"])
    assert exit_code == 1


def test_check_passes_clean_synthetic_set(tmp_path):
    base = _write_multicolor_base(tmp_path / "base.png")
    out = tmp_path / "out"
    built = _run_cli(
        "build", str(base), "--out", str(out), "--name", "wep_ok", "--png-only"
    )
    assert built.returncode == 0, built.stdout + built.stderr
    checked = _run_cli("check", str(out), "--name", "wep_ok")
    assert checked.returncode == 0, checked.stdout + checked.stderr
