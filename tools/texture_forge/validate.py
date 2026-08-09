"""Check a generated texture set against the shipped art's measured behaviour.

Thresholds come from `016gundmw_001wgzero_001_pbr1_*` (shipped), the `026gnbelt` Delta Kai
mod (a custom package confirmed working in game), and the broken custom weapon that
started this. Two rules are deliberately weaker than the raw evidence would allow,
because the known-good art violates them — see `srgb-on-metallic` and `normal-no-detail`.
"""

from dataclasses import dataclass

import numpy as np

DATA_SLOTS = ("normal", "roughness", "metallic", "ao")
COLOR_SLOTS = ("basecolor", "emissive")

# Shipped reference values, for the message text.
SHIPPED = {
    "roughness": {"mean": 0.525, "mirror": 0.003},
    "metallic": {"mean": 0.285, "p25": 0.129},
    "ao": {"mean": 0.838, "std": 0.259},
    "normal": {"std": 0.171},
}

THRESHOLDS = {
    "roughness_mirror_fraction": 0.10,
    "roughness_low_mean": 0.25,
    "metallic_high_p25": 0.40,
    "metallic_high_mean": 0.50,
    "ao_flat_std": 0.01,
    "normal_flat_std": 0.02,
}


@dataclass(frozen=True)
class Finding:
    rule: str
    severity: str  # "error" | "warn" | "info"
    slot: str
    measured: str
    reference: str
    message: str


def _finding(rule, severity, slot, measured, reference, message) -> Finding:
    return Finding(rule, severity, slot, measured, reference, message)


def validate_channel(slot: str, channel: np.ndarray) -> list[Finding]:
    """Check one greyscale map's distribution."""
    findings: list[Finding] = []
    mean = float(channel.mean())
    mirror = float((channel < 0.1).mean())
    p25 = float(np.percentile(channel, 25))
    std = float(channel.std())

    if slot == "roughness":
        if mirror > THRESHOLDS["roughness_mirror_fraction"]:
            findings.append(
                _finding(
                    "roughness-mirror",
                    "error",
                    slot,
                    f"{mirror:.1%} of texels below 0.1",
                    f"shipped art {SHIPPED['roughness']['mirror']:.1%}",
                    "This much of the surface is a mirror; it will reflect the environment "
                    "cube map and read as white in game.",
                )
            )
        if mean < THRESHOLDS["roughness_low_mean"]:
            findings.append(
                _finding(
                    "roughness-too-low",
                    "warn",
                    slot,
                    f"mean {mean:.3f}",
                    f"shipped art {SHIPPED['roughness']['mean']:.3f}",
                    "Surface is far glossier than the shipped art.",
                )
            )

    if slot == "metallic":
        if p25 > THRESHOLDS["metallic_high_p25"]:
            findings.append(
                _finding(
                    "metallic-everything",
                    "error",
                    slot,
                    f"p25 {p25:.3f}",
                    f"shipped art {SHIPPED['metallic']['p25']:.3f}",
                    "Three quarters of the surface reads as metal. Metals have no diffuse "
                    "response, so the base color will not reach the screen.",
                )
            )
        if mean > THRESHOLDS["metallic_high_mean"]:
            findings.append(
                _finding(
                    "metallic-high-mean",
                    "warn",
                    slot,
                    f"mean {mean:.3f}",
                    f"shipped art {SHIPPED['metallic']['mean']:.3f}",
                    "More of the model is metal than the shipped art uses.",
                )
            )

    if slot == "ao" and std < THRESHOLDS["ao_flat_std"]:
        findings.append(
            _finding(
                "ao-no-effect",
                "info",
                slot,
                f"std {std:.4f}",
                f"shipped art {SHIPPED['ao']['std']:.3f}",
                "AO map is effectively flat and will not change the render. A working "
                "reference mod ships one like this, so it is not a defect.",
            )
        )
    return findings


def validate_normal(normal: np.ndarray) -> list[Finding]:
    std = float(normal[..., 0].std())
    if std < THRESHOLDS["normal_flat_std"]:
        return [
            _finding(
                "normal-no-detail",
                "info",
                "normal",
                f"R std {std:.4f}",
                f"shipped bake {SHIPPED['normal']['std']:.3f}",
                "Normal map carries almost no surface detail. A gradient of one base color "
                "cannot recover a high-poly bake.",
            )
        ]
    return []


def validate_format(slot: str, stored_format: str) -> list[Finding]:
    """Check the colour space a texture was actually stored with."""
    is_srgb = stored_format.endswith("Srgb")

    if slot == "metallic" and is_srgb:
        return [
            _finding(
                "srgb-on-metallic",
                "warn",
                slot,
                stored_format,
                "shipped pbr1_metallic is BC3Srgb, emi_metallic is BC4Unorm",
                "The game is inconsistent for this slot, so this is not necessarily wrong.",
            )
        ]
    if slot in DATA_SLOTS and is_srgb:
        return [
            _finding(
                "srgb-on-data-map",
                "error",
                slot,
                stored_format,
                "shipped art uses BC4Unorm / BC7Unorm",
                "The GPU will apply the sRGB transfer to material data. The editor preview "
                "picks colour space by slot and never reads this tag, so it only shows in game.",
            )
        ]
    if slot in COLOR_SLOTS and not is_srgb:
        return [
            _finding(
                "linear-on-color-map",
                "error",
                slot,
                stored_format,
                "shipped basecolor is BC7Srgb",
                "A colour map stored linear renders washed out.",
            )
        ]
    return []


def validate_dimensions(slot: str, width: int, height: int) -> list[Finding]:
    def power_of_two(value: int) -> bool:
        return value > 0 and (value & (value - 1)) == 0

    if not power_of_two(width) or not power_of_two(height):
        return [
            _finding(
                "non-power-of-two",
                "info",
                slot,
                f"{width}x{height}",
                "shipped art is 1024 or 2048 square",
                "Block aligned, so it encodes, but the mip chain can misalign on some hardware.",
            )
        ]
    return []


def worst_severity(findings: list[Finding]) -> str | None:
    for severity in ("error", "warn", "info"):
        if any(f.severity == severity for f in findings):
            return severity
    return None
