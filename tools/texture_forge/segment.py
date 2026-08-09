"""Segment a base color map into material clusters.

Clustering runs in CIELAB rather than RGB. Two shades of one painted surface differ
mostly in lightness, while two different materials differ in chroma, so the merge step
downweights lightness — on the real weapon the gold reads as three RGB clusters
(hue 24/33/36) that are one material.
"""

from dataclasses import dataclass

import numpy as np

# D65 white point, matching the sRGB primaries used by every texture in this pipeline.
_WHITE_D65 = np.array([0.95047, 1.00000, 1.08883])
_RGB_TO_XYZ = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ]
)

#: Lightness is scaled down when deciding whether two clusters are the same material.
LIGHTNESS_MERGE_WEIGHT = 0.25
DEFAULT_MERGE_THRESHOLD = 12.0
DEFAULT_SAMPLE_SIZE = 384


@dataclass(frozen=True)
class Segmentation:
    """Material clusters of a base color map.

    `labels` indexes `centers_rgb` / `centers_lab` / `shares`, which are ordered by
    descending area share so cluster 0 is always the dominant material.
    """

    centers_rgb: np.ndarray  # (n, 3) float in 0..1, sRGB
    centers_lab: np.ndarray  # (n, 3) CIELAB
    labels: np.ndarray  # (h, w) int32
    shares: np.ndarray  # (n,) fraction of pixels


def srgb_to_linear(srgb: np.ndarray) -> np.ndarray:
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def srgb_to_lab(srgb: np.ndarray) -> np.ndarray:
    """Convert an (..., 3) array of sRGB values in 0..1 to CIELAB."""
    linear = srgb_to_linear(np.clip(srgb, 0.0, 1.0))
    xyz = linear @ _RGB_TO_XYZ.T / _WHITE_D65
    epsilon = 216.0 / 24389.0
    kappa = 24389.0 / 27.0
    f = np.where(xyz > epsilon, np.cbrt(xyz), (kappa * xyz + 16.0) / 116.0)
    return np.stack(
        [116.0 * f[..., 1] - 16.0, 500.0 * (f[..., 0] - f[..., 1]), 200.0 * (f[..., 1] - f[..., 2])],
        axis=-1,
    )


def _material_distance(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Lab distance with lightness downweighted, so shading variants read as one material."""
    delta = a - b
    scale = np.array([LIGHTNESS_MERGE_WEIGHT, 1.0, 1.0])
    return np.sqrt(((delta * scale) ** 2).sum(axis=-1))


def _kmeans(points: np.ndarray, k: int, seed: int, iterations: int = 40) -> np.ndarray:
    """Lloyd's algorithm seeded deterministically; returns the surviving centers."""
    unique = np.unique(points, axis=0)
    if len(unique) <= k:
        return unique
    rng = np.random.default_rng(seed)
    centers = unique[rng.choice(len(unique), k, replace=False)]
    for _ in range(iterations):
        distances = ((points[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        labels = distances.argmin(axis=1)
        moved = False
        for index in range(len(centers)):
            members = points[labels == index]
            if len(members) == 0:
                continue
            mean = members.mean(axis=0)
            if not np.allclose(mean, centers[index]):
                centers[index] = mean
                moved = True
        if not moved:
            break
    distances = ((points[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
    labels = distances.argmin(axis=1)
    return np.array([centers[i] for i in range(len(centers)) if (labels == i).any()])


def _merge_close(centers: np.ndarray, threshold: float) -> np.ndarray:
    """Agglomerate centers closer than `threshold` until no pair remains."""
    merged = [row for row in centers]
    while len(merged) > 1:
        best: tuple[float, int, int] | None = None
        for i in range(len(merged)):
            for j in range(i + 1, len(merged)):
                distance = float(_material_distance(merged[i], merged[j]))
                if distance < threshold and (best is None or distance < best[0]):
                    best = (distance, i, j)
        if best is None:
            break
        _, i, j = best
        merged[i] = (merged[i] + merged[j]) / 2.0
        merged.pop(j)
    return np.array(merged)


def _subsample(image: np.ndarray, sample_size: int) -> np.ndarray:
    height, width = image.shape[:2]
    step = max(1, int(np.ceil(max(height, width) / sample_size)))
    return image[::step, ::step].reshape(-1, 3)


def segment(
    image: np.ndarray,
    k: int = 8,
    seed: int = 0,
    merge_threshold: float = DEFAULT_MERGE_THRESHOLD,
    sample_size: int = DEFAULT_SAMPLE_SIZE,
) -> Segmentation:
    """Cluster an (h, w, 3) sRGB image in 0..1 into material groups."""
    if image.ndim != 3 or image.shape[2] != 3:
        raise ValueError(f"expected an (h, w, 3) image, got shape {image.shape}")
    if k < 1:
        raise ValueError(f"k must be at least 1, got {k}")

    sample_lab = srgb_to_lab(_subsample(image, sample_size))
    centers_lab = _merge_close(_kmeans(sample_lab, k, seed), merge_threshold)

    pixels_lab = srgb_to_lab(image.reshape(-1, 3))
    distances = ((pixels_lab[:, None, :] - centers_lab[None, :, :]) ** 2).sum(axis=2)
    flat_labels = distances.argmin(axis=1)

    # Drop clusters that won no pixels at full resolution, then order by area so
    # cluster 0 is always the dominant material.
    populated = [i for i in range(len(centers_lab)) if (flat_labels == i).any()]
    shares = np.array([float((flat_labels == i).mean()) for i in populated])
    order = [populated[i] for i in np.argsort(-shares)]

    remap = np.full(len(centers_lab), -1, dtype=np.int32)
    for new_index, old_index in enumerate(order):
        remap[old_index] = new_index
    flat_labels = remap[flat_labels]

    flat_rgb = image.reshape(-1, 3)
    centers_rgb = np.array([flat_rgb[flat_labels == i].mean(axis=0) for i in range(len(order))])
    return Segmentation(
        centers_rgb=centers_rgb,
        centers_lab=srgb_to_lab(centers_rgb),
        labels=flat_labels.reshape(image.shape[:2]).astype(np.int32),
        shares=np.array([float((flat_labels == i).mean()) for i in range(len(order))]),
    )
