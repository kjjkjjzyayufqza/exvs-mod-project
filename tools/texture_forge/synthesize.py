"""Derive every PBR map from one segmentation of the base color.

The alternative — deriving each map independently as a curve over luminance — is what
the texture wizard does, and it produced a roughness of `0.72 * luma` and a metallic of
`1.20 * (1 - luma)`: two trivial functions of the same input, correlating +0.992 and
-0.970 with base color luminance where shipped art measures -0.006 and -0.318.

Here roughness and metallic are property lookups on the material class, so they carry the
segmentation's information rather than the albedo's brightness.
"""

from dataclasses import dataclass

import numpy as np

from .classify import MATERIAL_PROPERTIES, MaterialAssignment
from .segment import Segmentation

#: No texel may fall below this. Shipped art has 0.3% of texels under 0.1; the broken
#: custom map had 57.2%, and that mirror surface is what rendered as white chrome.
ROUGHNESS_FLOOR = 0.15

#: How far the edge term may push roughness away from its class constant.
DEFAULT_ROUGHNESS_VARIATION = 0.12

#: Ambient occlusion from albedo luminance is partly fictional — luminance is not height.
#: Kept mild by default; a confirmed-working reference mod ships an entirely flat AO.
DEFAULT_AO_STRENGTH = 0.35

#: Occlusion neighbourhood as a fraction of the shorter image side, so the kernel can see
#: out of wide grooves regardless of texture resolution.
AO_RADIUS_FRACTION = 0.02

#: A gradient of one albedo cannot recover a high-poly bake. Shipped normal maps measure
#: an R-channel standard deviation of 0.171; this path reaches roughly 0.02.
DEFAULT_NORMAL_STRENGTH = 4.0

_LUMA_WEIGHTS = np.array([0.2126, 0.7152, 0.0722])


@dataclass(frozen=True)
class TextureSet:
    roughness: np.ndarray  # (h, w) in 0..1
    metallic: np.ndarray  # (h, w) in 0..1
    ao: np.ndarray  # (h, w) in 0..1
    normal: np.ndarray  # (h, w, 3) in 0..1, tangent space


def luminance(image: np.ndarray) -> np.ndarray:
    return image @ _LUMA_WEIGHTS


def _sobel(channel: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    padded = np.pad(channel, 1, mode="edge")
    kernel_x = np.array([[-1.0, 0.0, 1.0], [-2.0, 0.0, 2.0], [-1.0, 0.0, 1.0]])
    kernel_y = kernel_x.T
    gradient_x = np.zeros_like(channel)
    gradient_y = np.zeros_like(channel)
    for dy in range(3):
        for dx in range(3):
            window = padded[dy : dy + channel.shape[0], dx : dx + channel.shape[1]]
            gradient_x += kernel_x[dy, dx] * window
            gradient_y += kernel_y[dy, dx] * window
    return gradient_x / 8.0, gradient_y / 8.0


def _edge_term(image: np.ndarray) -> np.ndarray:
    """Normalized edge magnitude in 0..1, used to break up flat per-class constants."""
    gradient_x, gradient_y = _sobel(luminance(image))
    magnitude = np.hypot(gradient_x, gradient_y)
    peak = float(magnitude.max())
    if peak <= 1e-8:
        return np.zeros_like(magnitude)
    return magnitude / peak


def _class_map(
    segmentation: Segmentation,
    assignments: list[MaterialAssignment],
    attribute: str,
) -> np.ndarray:
    """Paint a per-cluster property value across the label map."""
    values = np.zeros(len(assignments), dtype=np.float64)
    for assignment in assignments:
        values[assignment.cluster_index] = getattr(
            MATERIAL_PROPERTIES[assignment.material], attribute
        )
    return values[segmentation.labels]


def _box_blur(channel: np.ndarray, radius: int) -> np.ndarray:
    """Separable box blur in O(n) via cumulative sums, edge-clamped."""
    if radius < 1:
        return channel.copy()
    width = 2 * radius + 1
    horizontal = np.pad(channel, ((0, 0), (radius, radius)), mode="edge")
    sums = np.pad(np.cumsum(horizontal, axis=1), ((0, 0), (1, 0)))
    blurred = (sums[:, width:] - sums[:, :-width]) / width
    vertical = np.pad(blurred, ((radius, radius), (0, 0)), mode="edge")
    sums = np.pad(np.cumsum(vertical, axis=0), ((1, 0), (0, 0)))
    return (sums[width:, :] - sums[:-width, :]) / width


def _cavity(image: np.ndarray, strength: float) -> np.ndarray:
    """Occlusion estimate treating albedo luminance as a height field.

    Luminance is not height, so this darkens wherever the painting is dark. It is kept
    mild deliberately; see DEFAULT_AO_STRENGTH.

    The neighbourhood scales with the image: a fixed small kernel cannot see out of a
    wide groove, which left the map flat at 0.995 on a real 1408x1408 base color.
    """
    if strength <= 0.0:
        return np.ones(image.shape[:2], dtype=np.float64)
    height = luminance(image)
    radius = max(2, int(round(min(image.shape[:2]) * AO_RADIUS_FRACTION)))
    # Positive where the neighbourhood is brighter than the texel, i.e. a dip.
    occlusion = np.clip(_box_blur(height, radius) - height, 0.0, None)
    peak = float(occlusion.max())
    if peak <= 1e-8:
        return np.ones_like(height)
    return np.clip(1.0 - (occlusion / peak) * strength, 0.0, 1.0)


def synthesize(
    image: np.ndarray,
    segmentation: Segmentation,
    assignments: list[MaterialAssignment],
    roughness_variation: float = DEFAULT_ROUGHNESS_VARIATION,
    ao_strength: float = DEFAULT_AO_STRENGTH,
    normal_strength: float = DEFAULT_NORMAL_STRENGTH,
) -> TextureSet:
    """Build the full map set for an (h, w, 3) sRGB base color in 0..1."""
    if image.shape[:2] != segmentation.labels.shape:
        raise ValueError(
            f"image is {image.shape[:2]} but the label map is {segmentation.labels.shape}"
        )
    if len(assignments) != len(segmentation.centers_rgb):
        raise ValueError(
            f"{len(assignments)} assignments for {len(segmentation.centers_rgb)} clusters"
        )

    edge = _edge_term(image)
    base_roughness = _class_map(segmentation, assignments, "roughness")
    roughness = base_roughness + (edge - 0.5) * 2.0 * roughness_variation
    roughness = np.clip(roughness, ROUGHNESS_FLOOR, 1.0)

    # Metallic stays a hard mask: shipped art is 19.3% pure zero with a small strongly
    # metallic set, so a gradient here would be wrong as well as unsafe.
    metallic = np.clip(_class_map(segmentation, assignments, "metallic"), 0.0, 1.0)

    gradient_x, gradient_y = _sobel(luminance(image))
    normal = np.stack(
        [
            np.clip(0.5 - gradient_x * normal_strength, 0.0, 1.0),
            np.clip(0.5 - gradient_y * normal_strength, 0.0, 1.0),
            np.ones(image.shape[:2], dtype=np.float64),
        ],
        axis=-1,
    )

    return TextureSet(
        roughness=roughness,
        metallic=metallic,
        ao=_cavity(image, ao_strength),
        normal=normal,
    )
