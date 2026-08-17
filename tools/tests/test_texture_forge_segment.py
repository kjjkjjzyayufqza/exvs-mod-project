import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
sys.path.insert(0, str(TOOLS_DIR))

from texture_forge import segment as seg  # noqa: E402


def flat_image(colors: list[tuple[float, float, float]], size: int = 96) -> np.ndarray:
    """Stack horizontal bands of exactly the given colors."""
    band = size // len(colors)
    image = np.zeros((size, size, 3), dtype=np.float64)
    for index, color in enumerate(colors):
        start = index * band
        end = size if index == len(colors) - 1 else start + band
        image[start:end, :, :] = color
    return image


def test_flat_colors_recover_their_own_centers():
    colors = [(0.90, 0.10, 0.10), (0.10, 0.30, 0.85), (0.05, 0.05, 0.05)]
    result = seg.segment(flat_image(colors), k=8, seed=0)

    assert len(result.centers_rgb) == 3, f"expected 3 merged clusters, got {len(result.centers_rgb)}"
    for color in colors:
        distances = np.abs(result.centers_rgb - np.array(color)).max(axis=1)
        assert distances.min() < 1 / 255, f"no cluster recovered {color}; closest off by {distances.min()}"
    assert abs(result.shares.sum() - 1.0) < 1e-6
    assert np.all(result.shares > 0.25)


def test_segmentation_is_deterministic():
    """Every downstream map is a lookup on the label map, so unstable labels would make
    the whole pipeline unreproducible from the same base color."""
    image = flat_image([(0.8, 0.6, 0.2), (0.1, 0.2, 0.5), (0.02, 0.02, 0.02), (0.5, 0.5, 0.5)])
    first = seg.segment(image, k=8, seed=0)
    second = seg.segment(image, k=8, seed=0)

    assert np.array_equal(first.labels, second.labels)
    assert np.allclose(first.centers_rgb, second.centers_rgb)


def test_single_color_image_yields_one_cluster_without_crashing():
    image = np.full((64, 64, 3), 0.42, dtype=np.float64)
    result = seg.segment(image, k=8, seed=0)

    assert len(result.centers_rgb) == 1
    assert abs(result.shares[0] - 1.0) < 1e-6
    assert result.labels.shape == (64, 64)
    assert result.labels.max() == 0


def test_shading_variants_of_one_material_merge_into_a_single_cluster():
    """Measured on the real weapon: the gold reads as three clusters (hue 24/33/36) that
    are one material. Clustering in RGB splits on brightness; Lab keeps them together."""
    gold_shades = [(0.335, 0.175, 0.072), (0.599, 0.369, 0.096), (0.819, 0.577, 0.205)]
    blue = (0.038, 0.301, 0.593)
    result = seg.segment(flat_image([*gold_shades, blue]), k=8, seed=0, merge_threshold=32.0)

    assert len(result.centers_rgb) == 2, (
        f"gold shades should collapse to one cluster beside the blue, got {len(result.centers_rgb)}"
    )


def test_labels_index_every_returned_center():
    image = flat_image([(0.9, 0.2, 0.2), (0.2, 0.2, 0.9), (0.1, 0.6, 0.1)])
    result = seg.segment(image, k=8, seed=0)

    assert result.labels.min() >= 0
    assert result.labels.max() == len(result.centers_rgb) - 1
    assert set(np.unique(result.labels)) == set(range(len(result.centers_rgb)))
