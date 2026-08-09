import shutil
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
sys.path.insert(0, str(TOOLS_DIR))

from texture_forge import numatb as nm  # noqa: E402

PACKAGE = Path(r"E:\XB\mod\002chara\wing_gundam_zero_rebellion_model")
BACKUP = Path(r"E:\XB\mod\002chara\wing_gundam_zero_rebellion_model.bak-20260809")

# Pre-fix copy: the custom material has no Texture1, which is what every shipped material
# and every working third-party mod material binds.
WITHOUT_TEXTURE1 = BACKUP / "models" / "bsrifle00b_out" / "bsrifle00b_out__nust__.numatb"
WITH_TEXTURE1 = PACKAGE / "models" / "bsrifle00b_out" / "bsrifle00b_out__nust__.numatb"
MAYA_PROFILE = BACKUP / "models" / "bsrifle00b_out" / "bsrifle00b_out__maya__.numatb"

needs_fixtures = pytest.mark.skipif(
    not WITHOUT_TEXTURE1.is_file() or not WITH_TEXTURE1.is_file(),
    reason="real .numatb fixtures are unavailable",
)


@needs_fixtures
def test_missing_texture1_is_added_pointing_at_the_roughness_map(tmp_path):
    out = tmp_path / "patched.numatb"
    result = nm.ensure_texture1(WITHOUT_TEXTURE1, out, "Wep_2004", "wep_2004_roughnessmap")

    assert result.changed is True
    assert nm.texture_paths(out, "Wep_2004")["Texture1"] == "wep_2004_roughnessmap"


@needs_fixtures
def test_texture1_is_inserted_where_shipped_materials_put_it(tmp_path):
    """Shipped __nust__ materials list Texture1 right after MetallicMap. Matching the
    order keeps a generated entry byte-comparable with a stock one."""
    out = tmp_path / "patched.numatb"
    nm.ensure_texture1(WITHOUT_TEXTURE1, out, "Wep_2004", "wep_2004_roughnessmap")

    order = nm.texture_param_order(out, "Wep_2004")
    assert order.index("Texture1") == order.index("MetallicMap") + 1


@needs_fixtures
def test_maya_profile_uses_its_own_anchor(tmp_path):
    out = tmp_path / "patched_maya.numatb"
    nm.ensure_texture1(MAYA_PROFILE, out, "Wep_2004", "wep_2004_roughnessmap")

    order = nm.texture_param_order(out, "Wep_2004")
    assert order.index("Texture1") == order.index("NormalMap") + 1


@needs_fixtures
def test_material_that_already_binds_texture1_is_left_byte_identical(tmp_path):
    source = tmp_path / "source.numatb"
    shutil.copyfile(WITH_TEXTURE1, source)
    out = tmp_path / "out.numatb"

    result = nm.ensure_texture1(source, out, "Wep_2004", "wep_2004_roughnessmap")

    assert result.changed is False
    assert out.read_bytes() == source.read_bytes()


@needs_fixtures
def test_json_round_trip_fidelity_is_verified_before_writing(tmp_path):
    """The edit goes through a JSON round trip. If that round trip ever stops being
    lossless for a file, writing it back would silently corrupt the material."""
    assert nm.roundtrip_is_lossless(WITHOUT_TEXTURE1) is True


@needs_fixtures
def test_unknown_material_label_is_an_error(tmp_path):
    with pytest.raises(ValueError, match="NotAMaterial"):
        nm.ensure_texture1(
            WITHOUT_TEXTURE1, tmp_path / "x.numatb", "NotAMaterial", "wep_2004_roughnessmap"
        )


@needs_fixtures
def test_texture_paths_reports_every_bound_slot(tmp_path):
    paths = nm.texture_paths(WITHOUT_TEXTURE1, "Wep_2004")

    assert paths["BaseColorMap"] == "wep_2004_color"
    assert paths["RoughnessMap"] == "wep_2004_roughnessmap"
    assert paths["MetallicMap"] == "wep_2004_metallicmap"
    assert paths["NormalMap"] == "wep_2004_normalmap"
    assert paths["AmbientOcclusionMap"] == "wep_2004_aomap"
    assert "Texture1" not in paths
