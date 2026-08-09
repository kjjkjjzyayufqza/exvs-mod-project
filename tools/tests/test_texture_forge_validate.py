import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
sys.path.insert(0, str(TOOLS_DIR))

from texture_forge import validate as val  # noqa: E402


def constant(value: float, size: int = 64) -> np.ndarray:
    return np.full((size, size), value, dtype=np.float64)


def ids(findings, severity: str | None = None) -> list[str]:
    return [f.rule for f in findings if severity is None or f.severity == severity]


def test_mirror_roughness_is_an_error():
    """57.2% of the shipped-broken roughness map was below 0.1; that is the defect that
    rendered as white chrome."""
    findings = val.validate_channel("roughness", constant(0.05))
    assert "roughness-mirror" in ids(findings, "error")


def test_roughness_in_the_shipped_band_is_clean():
    channel = np.random.default_rng(0).normal(0.52, 0.12, (64, 64)).clip(0.2, 0.95)
    assert ids(val.validate_channel("roughness", channel), "error") == []


def test_everything_metal_is_an_error():
    """The shipped-broken metallic had p25 = 0.541, i.e. 75% of the gun read as metal."""
    findings = val.validate_channel("metallic", constant(0.63))
    assert "metallic-everything" in ids(findings, "error")


def test_a_fully_dielectric_metallic_map_is_not_an_error():
    findings = val.validate_channel("metallic", constant(0.0))
    assert ids(findings, "error") == []


def test_flat_ao_is_advisory_only():
    """A confirmed-working reference mod ships an AO of mean 0.994 with no variance, so
    flagging that as an error would criminalise art that is known to work in game."""
    findings = val.validate_channel("ao", constant(0.995))
    assert ids(findings, "error") == []
    assert "ao-no-effect" in ids(findings, "info")


def test_weak_normal_is_advisory_only():
    normal = np.dstack([constant(0.5), constant(0.5), constant(1.0)])
    findings = val.validate_normal(normal)
    assert ids(findings, "error") == []
    assert "normal-no-detail" in ids(findings, "info")


def test_srgb_on_a_data_map_is_an_error():
    findings = val.validate_format("roughness", "BC7Srgb")
    assert "srgb-on-data-map" in ids(findings, "error")


def test_srgb_on_metallic_is_only_a_warning():
    """The shipped pbr1_metallic is genuinely BC3Srgb while emi_metallic is BC4Unorm, so
    the game contradicts itself and an error would fire on stock art."""
    findings = val.validate_format("metallic", "BC3Srgb")
    assert ids(findings, "error") == []
    assert "srgb-on-metallic" in ids(findings, "warn")


def test_linear_data_map_and_srgb_base_color_are_both_clean():
    assert val.validate_format("roughness", "BC7Unorm") == []
    assert val.validate_format("basecolor", "BC7Srgb") == []


def test_srgb_missing_on_base_color_is_an_error():
    findings = val.validate_format("basecolor", "BC7Unorm")
    assert "linear-on-color-map" in ids(findings, "error")


def test_non_power_of_two_is_advisory():
    findings = val.validate_dimensions("basecolor", 1408, 1408)
    assert ids(findings, "error") == []
    assert "non-power-of-two" in ids(findings, "info")


def test_findings_carry_the_measured_value_and_the_shipped_reference():
    findings = val.validate_channel("roughness", constant(0.05))
    mirror = next(f for f in findings if f.rule == "roughness-mirror")
    assert "100" in mirror.measured
    assert "0.3%" in mirror.reference
