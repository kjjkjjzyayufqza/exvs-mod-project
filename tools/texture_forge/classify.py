"""Assign a material class to each base color cluster.

White paint and bare silver metal are the same color, so no rule can separate them —
the shipped body art is 55.7% near-neutral bright clusters that the shipped metallic map
scores as non-metal. The classifier therefore only marks metal on a positive warm-hue
signal and defaults everything else to paint.

The failure costs are asymmetric. A false metal has no diffuse response and renders as a
mirror of the HDR environment, which is the white blowout this pipeline exists to prevent.
A false dielectric only looks flatter than intended. Bias toward paint.
"""

import colorsys
from dataclasses import dataclass

import numpy as np

METAL = "metal"
PAINT = "paint"
DARK_RUBBER = "dark_rubber"
GLASS = "glass"


@dataclass(frozen=True)
class MaterialProperties:
    """Per-class targets. Roughness values sit inside the shipped band (mean 0.525,
    p25 0.357, p50 0.482); none is low enough to read as a mirror."""

    metallic: float
    roughness: float


#: `glass` is reachable only through an explicit override — see `classify`.
MATERIAL_PROPERTIES: dict[str, MaterialProperties] = {
    METAL: MaterialProperties(metallic=0.90, roughness=0.35),
    PAINT: MaterialProperties(metallic=0.00, roughness=0.55),
    DARK_RUBBER: MaterialProperties(metallic=0.00, roughness=0.85),
    GLASS: MaterialProperties(metallic=0.00, roughness=0.15),
}

METAL_HUE_RANGE = (20.0, 70.0)
METAL_MIN_SATURATION = 0.30
DARK_RUBBER_MAX_VALUE = 0.10


@dataclass(frozen=True)
class MaterialAssignment:
    cluster_index: int
    center_rgb: tuple[float, float, float]
    share: float
    material: str
    source: str  # "auto" or "override"

    @property
    def properties(self) -> MaterialProperties:
        return MATERIAL_PROPERTIES[self.material]


def auto_material(center_rgb: np.ndarray) -> str:
    """Classify one cluster center. Never returns `glass`; see the module docstring."""
    red, green, blue = (float(np.clip(c, 0.0, 1.0)) for c in center_rgb)
    hue, saturation, value = colorsys.rgb_to_hsv(red, green, blue)
    hue_degrees = hue * 360.0

    if value < DARK_RUBBER_MAX_VALUE:
        return DARK_RUBBER
    if (
        METAL_HUE_RANGE[0] <= hue_degrees <= METAL_HUE_RANGE[1]
        and saturation > METAL_MIN_SATURATION
    ):
        return METAL
    return PAINT


def classify(
    centers_rgb: np.ndarray,
    shares: np.ndarray,
    overrides: dict[int, str] | None = None,
) -> list[MaterialAssignment]:
    """Label every cluster, letting `overrides` (cluster index -> material) win."""
    if len(centers_rgb) != len(shares):
        raise ValueError(f"got {len(centers_rgb)} centers but {len(shares)} shares")

    overrides = overrides or {}
    for index, material in overrides.items():
        if material not in MATERIAL_PROPERTIES:
            raise ValueError(
                f"unknown material {material!r} for cluster {index}; "
                f"expected one of {sorted(MATERIAL_PROPERTIES)}"
            )
        if not 0 <= index < len(centers_rgb):
            raise ValueError(f"override targets cluster {index}, which does not exist")

    assignments = []
    for index, (center, share) in enumerate(zip(centers_rgb, shares)):
        overridden = index in overrides
        assignments.append(
            MaterialAssignment(
                cluster_index=index,
                center_rgb=(float(center[0]), float(center[1]), float(center[2])),
                share=float(share),
                material=overrides[index] if overridden else auto_material(center),
                source="override" if overridden else "auto",
            )
        )
    return assignments
