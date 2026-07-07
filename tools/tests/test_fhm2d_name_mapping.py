import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
sys.path.insert(0, str(TOOLS_DIR))

import build_fhm2d_name_mapping as mapping  # noqa: E402


def test_ob_unit_character_name_prefers_full_ai_unit_id():
    with tempfile.TemporaryDirectory(prefix="fhm2d_ai_names_") as tmp_dir:
        ai_string_path = Path(tmp_dir) / "ai_string.txt"
        ai_string_path.write_text(
            "ai_CHR_002ZGUNDM_002HYAKSK_001 | true\n",
            encoding="utf-8",
        )

        ai_names = mapping.parse_ai_character_names([ai_string_path])
        ai_by_character_id = mapping.ai_names_by_character_id(ai_names)

    character_id = mapping.character_id_from_parts("002", "002", "001")
    name, aliases = mapping.unit_name_for_character_id(character_id, ai_by_character_id, {})

    assert name == "002zgundm_002hyaksk_001"
    assert "zgundm_002hyaksk" in aliases
    assert "002zgundm_002hyaksk_001" in aliases


def test_make_route_names_unique_hash_suffixes_same_route_name_collisions():
    entries = [
        {
            "hashName": "0xAAAAAAAA",
            "name": "002zgundm_011rkdias_001",
            "routeId": "unit.model",
            "routePrefix": "002chara",
            "packagePath": "002chara/002zgundm_011rkdias_001",
            "aliases": [],
        },
        {
            "hashName": "0xBBBBBBBB",
            "name": "002zgundm_011rkdias_001",
            "routeId": "unit.model",
            "routePrefix": "002chara",
            "packagePath": "002chara/002zgundm_011rkdias_001",
            "aliases": [],
        },
        {
            "hashName": "0xCCCCCCCC",
            "name": "002zgundm_011rkdias_001",
            "routeId": "unit.msc",
            "routePrefix": "040msc",
            "packagePath": "040msc/002zgundm_011rkdias_001",
            "aliases": [],
        },
    ]

    unique_entries = mapping.make_route_names_unique(entries)
    by_route = {}
    for entry in unique_entries:
        by_route.setdefault(entry["routeId"], set()).add(entry["name"])

    assert by_route["unit.model"] == {
        "002zgundm_011rkdias_001_aaaaaaaa",
        "002zgundm_011rkdias_001_bbbbbbbb",
    }
    assert by_route["unit.msc"] == {"002zgundm_011rkdias_001"}


def test_ob_structure_ai_string_entries_prefer_full_ai_unit_id():
    with tempfile.TemporaryDirectory(prefix="fhm2d_structure_names_") as tmp_dir:
        root = Path(tmp_dir)
        route_dir = root / "041cpm"
        route_dir.mkdir()
        structure_path = route_dir / "0x1240BD01_structure.json"
        structure_path.write_text(
            '{"Name": "zgundm_002hyaksk", "Text": "ai_CHR_002ZGUNDM_002HYAKSK_001"}',
            encoding="utf-8",
        )

        ai_string_path = root / "ai_string.txt"
        ai_string_path.write_text(
            "ai_CHR_002ZGUNDM_002HYAKSK_001 | true\n",
            encoding="utf-8",
        )
        ai_names = mapping.parse_ai_character_names([ai_string_path])

        entries = mapping.build_ob_structure_entries(root, ai_names, set())

    assert len(entries) == 1
    assert entries[0]["name"] == "002zgundm_002hyaksk_001"
    assert entries[0]["packagePath"] == "041cpm/002zgundm_002hyaksk_001"
    assert "zgundm_002hyaksk" in entries[0]["aliases"]


if __name__ == "__main__":
    test_ob_unit_character_name_prefers_full_ai_unit_id()
    test_make_route_names_unique_hash_suffixes_same_route_name_collisions()
    test_ob_structure_ai_string_entries_prefer_full_ai_unit_id()
    print("PASS")
