import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
sys.path.insert(0, str(TOOLS_DIR))

from texture_forge import classify as cls  # noqa: E402

# Cluster centers measured with k-means (k=8) on the real base colors. Keeping the real
# numbers means these tests fail if the rules drift away from the art they were tuned on.
CUSTOM_WEAPON = [
    ((0.009, 0.193, 0.420), 0.238),  # blue armor
    ((0.026, 0.088, 0.197), 0.184),  # blue armor, shadow
    ((0.038, 0.301, 0.593), 0.161),  # blue armor, lit
    ((0.017, 0.037, 0.077), 0.127),  # near black
    ((0.335, 0.175, 0.072), 0.121),  # gold, shadow
    ((0.599, 0.369, 0.096), 0.092),  # gold
    ((0.819, 0.577, 0.205), 0.053),  # gold, highlight
    ((0.313, 0.611, 0.787), 0.026),  # light blue rim highlight
]

SHIPPED_BODY = [
    ((0.340, 0.389, 0.436), 0.211),
    ((0.917, 0.913, 0.946), 0.207),  # near-white armor
    ((0.108, 0.192, 0.337), 0.187),
    ((0.835, 0.831, 0.867), 0.184),  # near-white armor
    ((0.749, 0.746, 0.784), 0.092),
    ((0.653, 0.651, 0.672), 0.074),
    ((0.640, 0.099, 0.126), 0.028),  # red
    ((0.765, 0.657, 0.138), 0.018),  # gold trim
]


def run(entries):
    centers = np.array([c for c, _ in entries])
    shares = np.array([s for _, s in entries])
    return cls.classify(centers, shares)


def material_of(assignments, index: int) -> str:
    return assignments[index].material


def test_warm_saturated_clusters_classify_as_metal():
    result = run(CUSTOM_WEAPON)
    for index in (4, 5, 6):
        assert material_of(result, index) == cls.METAL, (
            f"cluster {index} {CUSTOM_WEAPON[index][0]} should be metal, got {material_of(result, index)}"
        )


def test_saturated_blue_armor_classifies_as_paint():
    result = run(CUSTOM_WEAPON)
    for index in (0, 1, 2):
        assert material_of(result, index) == cls.PAINT


def test_near_black_classifies_as_dark_rubber():
    result = run(CUSTOM_WEAPON)
    assert material_of(result, 3) == cls.DARK_RUBBER


def test_small_bright_saturated_cluster_is_paint_not_glass():
    """The 2.6% light blue is a rim highlight on the armor, not a lens. Auto-assigning
    `glass` would give it near-mirror roughness, which is the failure direction that
    produced the original white blowout, so glass is override-only."""
    result = run(CUSTOM_WEAPON)
    assert material_of(result, 7) == cls.PAINT


def test_neutral_bright_armor_is_never_auto_classified_as_metal():
    """Regression guard for the core limitation: white paint and silver metal are the
    same color. The shipped metallic map is 19.3% pure zero with mean 0.285, so these
    55.7% neutral-bright clusters are paint. Calling them metal recreates the blowout."""
    result = run(SHIPPED_BODY)
    for index in (0, 1, 3, 4, 5):
        assert material_of(result, index) == cls.PAINT, (
            f"cluster {index} {SHIPPED_BODY[index][0]} must be paint, got {material_of(result, index)}"
        )


def test_shipped_gold_trim_still_reads_as_metal():
    result = run(SHIPPED_BODY)
    assert material_of(result, 7) == cls.METAL


def test_explicit_override_beats_the_auto_label():
    centers = np.array([c for c, _ in CUSTOM_WEAPON])
    shares = np.array([s for _, s in CUSTOM_WEAPON])
    result = cls.classify(centers, shares, overrides={0: cls.METAL, 5: cls.PAINT})

    assert result[0].material == cls.METAL
    assert result[0].source == "override"
    assert result[5].material == cls.PAINT
    assert result[5].source == "override"
    assert result[6].source == "auto"


def test_unknown_override_material_is_rejected():
    centers = np.array([c for c, _ in CUSTOM_WEAPON])
    shares = np.array([s for _, s in CUSTOM_WEAPON])
    try:
        cls.classify(centers, shares, overrides={0: "shiny"})
    except ValueError as error:
        assert "shiny" in str(error)
    else:
        raise AssertionError("an unknown material name must be rejected, not silently ignored")


def test_every_cluster_receives_exactly_one_assignment():
    result = run(CUSTOM_WEAPON)
    assert len(result) == len(CUSTOM_WEAPON)
    assert [a.cluster_index for a in result] == list(range(len(CUSTOM_WEAPON)))
    assert all(a.material in cls.MATERIAL_PROPERTIES for a in result)
