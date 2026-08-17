import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
sys.path.insert(0, str(TOOLS_DIR))

from texture_forge import classify as cls  # noqa: E402
from texture_forge import segment as seg  # noqa: E402
from texture_forge import synthesize as syn  # noqa: E402

# Shipped reference distribution, measured from 016gundmw_001wgzero_001_pbr1_*.
GAME_ROUGHNESS_MEAN = 0.525
GAME_METALLIC_MEAN = 0.285

# Cluster colors and area shares measured on the real weapon base color.
WEAPON_BANDS = [
    ((0.009, 0.193, 0.420), 0.238),
    ((0.026, 0.088, 0.197), 0.184),
    ((0.038, 0.301, 0.593), 0.161),
    ((0.017, 0.037, 0.077), 0.127),
    ((0.335, 0.175, 0.072), 0.121),
    ((0.599, 0.369, 0.096), 0.092),
    ((0.819, 0.577, 0.205), 0.053),
    ((0.313, 0.611, 0.787), 0.026),
]


def banded_image(bands, size: int = 200) -> np.ndarray:
    """Horizontal bands whose heights follow the given area shares."""
    image = np.zeros((size, size, 3), dtype=np.float64)
    row = 0
    for index, (color, share) in enumerate(bands):
        height = size - row if index == len(bands) - 1 else max(1, int(round(share * size)))
        image[row : row + height, :, :] = color
        row += height
    return image


def weapon_fixture():
    image = banded_image(WEAPON_BANDS)
    segmentation = seg.segment(image, k=8, seed=0)
    assignments = cls.classify(segmentation.centers_rgb, segmentation.shares)
    return image, segmentation, assignments


def stats(channel: np.ndarray) -> dict[str, float]:
    return {
        "mean": float(channel.mean()),
        "p25": float(np.percentile(channel, 25)),
        "p50": float(np.percentile(channel, 50)),
        "mirror": float((channel < 0.1).mean()),
        "min": float(channel.min()),
        "max": float(channel.max()),
    }


def test_roughness_lands_in_the_shipped_band():
    """The single hard requirement. 57.2% of the shipped-broken roughness map was below
    0.1, and that mirror surface is what rendered as white chrome in game."""
    image, segmentation, assignments = weapon_fixture()
    result = syn.synthesize(image, segmentation, assignments)
    r = stats(result.roughness)

    assert r["mirror"] < 0.01, f"mirror texels {r['mirror']:.1%} (shipped art: 0.3%)"
    assert 0.40 <= r["mean"] <= 0.65, f"mean {r['mean']:.3f} outside band around {GAME_ROUGHNESS_MEAN}"
    assert r["min"] >= syn.ROUGHNESS_FLOOR - 1e-6


def test_metallic_never_marks_the_whole_surface_metal():
    """The shipped-broken metallic had p25 = 0.541, i.e. 75% of the gun was substantially
    metal; the shipped art has p25 = 0.129."""
    image, segmentation, assignments = weapon_fixture()
    result = syn.synthesize(image, segmentation, assignments)
    m = stats(result.metallic)

    assert m["p25"] < 0.20, f"p25 {m['p25']:.3f}"
    assert m["mean"] < 0.45, f"mean {m['mean']:.3f} (shipped art: {GAME_METALLIC_MEAN})"


def test_metallic_is_exactly_zero_outside_metal_clusters():
    image, segmentation, assignments = weapon_fixture()
    result = syn.synthesize(image, segmentation, assignments)

    metal_clusters = {a.cluster_index for a in assignments if a.material == cls.METAL}
    assert metal_clusters, "fixture should contain at least one metal cluster"
    non_metal_mask = ~np.isin(segmentation.labels, list(metal_clusters))

    assert result.metallic[non_metal_mask].max() == 0.0
    assert result.metallic[~non_metal_mask].min() > 0.5


def test_an_all_paint_model_produces_a_fully_dielectric_metallic_map():
    image = banded_image([((0.1, 0.2, 0.5), 0.5), ((0.15, 0.25, 0.55), 0.5)])
    segmentation = seg.segment(image, k=4, seed=0)
    assignments = cls.classify(segmentation.centers_rgb, segmentation.shares)
    result = syn.synthesize(image, segmentation, assignments)

    assert all(a.material == cls.PAINT for a in assignments)
    assert result.metallic.max() == 0.0


def test_roughness_varies_within_a_cluster_but_stays_in_class():
    """Flat per-class constants look synthetic, so an edge term modulates them — but it
    must never push a painted surface down into the mirror band."""
    image, segmentation, assignments = weapon_fixture()
    result = syn.synthesize(image, segmentation, assignments)

    paint_clusters = [a.cluster_index for a in assignments if a.material == cls.PAINT]
    mask = np.isin(segmentation.labels, paint_clusters)
    values = result.roughness[mask]

    assert values.std() > 0.0, "roughness should not be perfectly flat inside a cluster"
    assert values.min() >= syn.ROUGHNESS_FLOOR - 1e-6


def test_normal_map_is_tangent_space_shaped():
    image, segmentation, assignments = weapon_fixture()
    result = syn.synthesize(image, segmentation, assignments)

    assert result.normal.shape == (*image.shape[:2], 3)
    assert np.allclose(result.normal[..., 2], 1.0)
    assert abs(float(result.normal[..., 0].mean()) - 0.5) < 0.05
    assert abs(float(result.normal[..., 1].mean()) - 0.5) < 0.05


def test_all_maps_share_the_source_resolution_and_stay_in_range():
    image, segmentation, assignments = weapon_fixture()
    result = syn.synthesize(image, segmentation, assignments)

    for name in ("roughness", "metallic", "ao"):
        channel = getattr(result, name)
        assert channel.shape == image.shape[:2], f"{name} shape {channel.shape}"
        assert channel.min() >= 0.0 and channel.max() <= 1.0, f"{name} out of range"


def test_ao_darkens_crevices_at_texture_resolution():
    """The neighbourhood has to scale with the image. A fixed small kernel produced a
    flat 0.995 on the real 1408x1408 base color, i.e. an AO map that does nothing."""
    size = 512
    image = np.full((size, size, 3), 0.75, dtype=np.float64)
    image[:, size // 2 - 6 : size // 2 + 6, :] = 0.05  # a dark groove

    segmentation = seg.segment(image, k=4, seed=0)
    assignments = cls.classify(segmentation.centers_rgb, segmentation.shares)
    ao = syn.synthesize(image, segmentation, assignments).ao

    groove = ao[:, size // 2 - 3 : size // 2 + 3].mean()
    flat = ao[:, : size // 8].mean()
    assert groove < flat - 0.05, f"groove {groove:.3f} should be darker than flat {flat:.3f}"
    assert ao.std() > 0.01, f"AO std {ao.std():.4f} means the map has no effect"


def test_ao_strength_zero_disables_the_map():
    image, segmentation, assignments = weapon_fixture()
    ao = syn.synthesize(image, segmentation, assignments, ao_strength=0.0).ao
    assert np.allclose(ao, 1.0)


def test_synthesis_is_deterministic():
    image, segmentation, assignments = weapon_fixture()
    first = syn.synthesize(image, segmentation, assignments)
    second = syn.synthesize(image, segmentation, assignments)

    assert np.array_equal(first.roughness, second.roughness)
    assert np.array_equal(first.metallic, second.metallic)
