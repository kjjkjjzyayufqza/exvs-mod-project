import sys
from pathlib import Path

import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
sys.path.insert(0, str(TOOLS_DIR))

from texture_forge import encode as enc  # noqa: E402

DATA_SLOTS = ("normal", "roughness", "metallic", "ao")


def test_color_slots_encode_as_srgb():
    for slot in ("basecolor", "emissive"):
        assert enc.format_for_slot(slot).endswith("Srgb"), slot


def test_data_slots_never_encode_as_srgb():
    """Every non-color map in the shipped art is linear. Tagging one sRGB is invisible in
    the editor preview and only shows up in game, which is how four maps shipped wrong."""
    for slot in DATA_SLOTS:
        chosen = enc.format_for_slot(slot)
        assert not chosen.endswith("Srgb"), f"{slot} resolved to {chosen}"
        assert chosen == "BC7RgbaUnorm"


def test_unknown_slot_is_rejected():
    with pytest.raises(ValueError, match="glossiness"):
        enc.format_for_slot("glossiness")


def test_power_of_two_sizes_pass_through():
    for size in (256, 512, 1024, 2048):
        assert enc.target_resolution(size) == size


def test_non_power_of_two_snaps_to_the_nearest_power_of_two():
    # The real base color is 1408x1408, which is block-aligned but not a power of two;
    # its mip chain can misalign on some hardware.
    assert enc.target_resolution(1408) == 1024
    assert enc.target_resolution(1600) == 2048
    assert enc.target_resolution(100) == 128


def test_resolution_override_wins():
    assert enc.target_resolution(1408, override=2048) == 2048


def test_override_must_itself_be_a_power_of_two():
    with pytest.raises(ValueError, match="1408"):
        enc.target_resolution(1024, override=1408)


def test_greyscale_channel_is_written_as_rgb_plus_opaque_alpha(tmp_path):
    channel = np.linspace(0.0, 1.0, 64 * 64).reshape(64, 64)
    path = enc.write_channel_png(channel, tmp_path / "r.png")

    from PIL import Image

    data = np.asarray(Image.open(path).convert("RGBA"))
    assert data.shape == (64, 64, 4)
    assert np.array_equal(data[..., 0], data[..., 1])
    assert np.array_equal(data[..., 0], data[..., 2])
    assert (data[..., 3] == 255).all()


def test_channel_png_is_resized_to_the_requested_resolution(tmp_path):
    channel = np.full((1408, 1408), 0.5)
    path = enc.write_channel_png(channel, tmp_path / "r.png", resolution=1024)

    from PIL import Image

    assert Image.open(path).size == (1024, 1024)


@pytest.mark.skipif(not enc.ULTIMATE_TEX_CLI.is_file(), reason="ultimate_tex_cli.exe not present")
def test_encode_produces_a_linear_nutexb_whose_footer_name_matches_the_stem(tmp_path):
    channel = np.full((256, 256), 0.5)
    png = enc.write_channel_png(channel, tmp_path / "wep_test_roughnessmap.png")
    nutexb = enc.encode_nutexb(png, tmp_path / "wep_test_roughnessmap.nutexb", slot="roughness")

    info = enc.read_nutexb_info(nutexb)
    assert info["name"] == "wep_test_roughnessmap"
    assert info["format"] == "BC7Unorm", f"got {info['format']}"
    assert info["width"] == 256 and info["height"] == 256


@pytest.mark.skipif(not enc.ULTIMATE_TEX_CLI.is_file(), reason="ultimate_tex_cli.exe not present")
def test_encoded_output_is_verified_by_reading_the_footer_back(tmp_path):
    """A successful subprocess exit is not proof the format landed; the footer is."""
    channel = np.full((128, 128), 0.25)
    png = enc.write_channel_png(channel, tmp_path / "wep_test_metallicmap.png")
    nutexb = enc.encode_nutexb(png, tmp_path / "wep_test_metallicmap.nutexb", slot="metallic")
    assert enc.read_nutexb_info(nutexb)["format"] == "BC7Unorm"
