"""
Structural verification for docs/msc-research/gyan-dodai-throw-aim-at-enemy-analysis.md.

Drives the real Hyaku and Gyan MSC decompile sources on disk. Fails if the
aim-path claims in the analysis no longer match the shipped research sources.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


HYAKU_2C = Path(r"E:\XB\mod\040msc\002zgundm_002hyaksk_001\2.c")
GYAN_MODIFIED_2C = Path(r"E:\XB\解包\com\file\040msc\gundam_005gyan00_modified\2.c")
GYAN_MOD_TREE_2C = Path(r"E:\XB\mod\040msc\001gundam_005gyan00_001\2.c")
ANALYSIS_DOC = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "msc-research"
    / "gyan-dodai-throw-aim-at-enemy-analysis.md"
)

ACTION_HASH = "0x7b65b9b7"


def _read(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"required MSC source missing: {path}")
    return path.read_text(encoding="utf-8", errors="replace")


def _function_body(source: str, name: str) -> str:
    """Extract a top-level void function body by brace matching."""
    pattern = re.compile(rf"^void\s+{re.escape(name)}\s*\([^)]*\)\s*\{{", re.M)
    match = pattern.search(source)
    if not match:
        raise AssertionError(f"function not found: {name}")
    start = match.end() - 1
    depth = 0
    for index in range(start, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]
    raise AssertionError(f"unterminated function body: {name}")


class TestGyanDodaiThrowAimAnalysis(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.hyaku = _read(HYAKU_2C)
        cls.gyan = _read(GYAN_MODIFIED_2C)
        cls.doc = _read(ANALYSIS_DOC) if ANALYSIS_DOC.is_file() else ""

    def test_analysis_document_exists(self) -> None:
        self.assertTrue(ANALYSIS_DOC.is_file(), f"missing deliverable: {ANALYSIS_DOC}")
        self.assertIn(ACTION_HASH, self.doc.lower())
        self.assertIn("global689", self.doc)
        self.assertIn("global691", self.doc)
        self.assertIn("Minimal recommended port recipe", self.doc)

    def test_hyaku_registry_maps_hash_to_lock_switch(self) -> None:
        pattern = re.compile(
            rf"func_241\(\s*{ACTION_HASH}\s*,\s*ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH\s*\)",
            re.I,
        )
        self.assertIsNotNone(
            pattern.search(self.hyaku),
            "Hyaku must register 0x7B65B9B7 to ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH",
        )

    def test_hyaku_lock_switch_arms_positive_turn_window(self) -> None:
        body = _function_body(self.hyaku, "ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH")
        self.assertRegex(body, r"global691\s*=\s*0xa\b")
        self.assertNotRegex(body, r"global691\s*=\s*0xffffffff\b")
        self.assertRegex(body, r"global700\s*=\s*0x14\b")
        self.assertIn("func_1020", body)
        self.assertIn("func_1021", body)
        self.assertIn("func_1019", body)

    def test_hyaku_driver_calls_func599_and_rotate_damping(self) -> None:
        body = _function_body(self.hyaku, "func_1019")
        self.assertIn("func_599()", body)
        self.assertRegex(body, r"func_106\s*\(")
        self.assertRegex(body, r"func_109\s*\(")
        scale = re.search(
            r"0x3\s*\*\s*\(\s*0x64\s*-\s*func_274\s*\(\s*\)\s*\)\s*/\s*0x64\s*\+\s*0x61",
            body,
        )
        self.assertIsNotNone(scale, "Hyaku driver must use frame-delta rotate scale")

    def test_hyaku_func601_has_target_yaw_use_site(self) -> None:
        body = _function_body(self.hyaku, "func_601")
        self.assertRegex(body, r"if\s*\(\s*global176\s*==\s*0x1\s*\)")
        self.assertIn("sys_0(0x40000, 0x5)", body)
        self.assertRegex(body, r"sys_46\s*\(\s*0\s*,")
        # turn budget residual uses global177 from global691 * 0x64 in func_600
        init = _function_body(self.hyaku, "func_600")
        self.assertRegex(init, r"global177\s*=\s*global691\s*\*\s*0x64")
        self.assertRegex(init, r"global176\s*==\s*0x1")

    def test_hyaku_lock_face_latched_from_global67(self) -> None:
        self.assertRegex(self.hyaku, r"global176\s*=\s*global67\s*;")

    def test_hyaku_func106_109_emit_sys47_rotate(self) -> None:
        for name in ("func_106", "func_109"):
            body = _function_body(self.hyaku, name)
            self.assertIn("sys_47(0x10", body)

    def test_gyan_registry_maps_hash_to_dodai_action(self) -> None:
        pattern = re.compile(
            rf"func_241\(\s*{ACTION_HASH}\s*,\s*GYAN_DODAI_SPECIAL_SHOT_ACTION\s*\)",
            re.I,
        )
        self.assertIsNotNone(
            pattern.search(self.gyan),
            "Gyan must register 0x7B65B9B7 to GYAN_DODAI_SPECIAL_SHOT_ACTION",
        )

    def test_gyan_dodai_action_disables_turn_window(self) -> None:
        body = _function_body(self.gyan, "GYAN_DODAI_SPECIAL_SHOT_ACTION")
        self.assertRegex(
            body,
            r"global689\s*=\s*0xffffffff\b",
            "current Gyan Dodai must show the disable sentinel (gap evidence)",
        )
        self.assertRegex(body, r"global698\s*=\s*0\b")
        self.assertIn("GYAN_DODAI_SPECIAL_SHOT_START", body)
        self.assertIn("GYAN_DODAI_SPECIAL_SHOT_RELEASE", body)
        self.assertIn("GYAN_DODAI_SPECIAL_SHOT_DRIVER", body)

    def test_gyan_dodai_driver_is_func599_only(self) -> None:
        body = _function_body(self.gyan, "GYAN_DODAI_SPECIAL_SHOT_DRIVER")
        self.assertIn("func_599()", body)
        self.assertNotRegex(body, r"func_106\s*\(")
        self.assertNotRegex(body, r"func_109\s*\(")

    def test_gyan_func601_has_same_aim_use_site_shape(self) -> None:
        body = _function_body(self.gyan, "func_601")
        self.assertRegex(body, r"if\s*\(\s*global174\s*==\s*0x1\s*\)")
        self.assertIn("sys_0(0x40000, 0x5)", body)
        self.assertRegex(body, r"sys_46\s*\(\s*0\s*,")
        init = _function_body(self.gyan, "func_600")
        self.assertRegex(init, r"global175\s*=\s*global689\s*\*\s*0x64")
        self.assertRegex(init, r"if\s*\(\s*global175\s*>\s*0\s*\)")
        self.assertRegex(init, r"global174\s*==\s*0x1")

    def test_gyan_lock_face_latched_from_global67(self) -> None:
        self.assertRegex(self.gyan, r"global174\s*=\s*global67\s*;")

    def test_gyan_func586_default_turn_window_is_positive(self) -> None:
        body = _function_body(self.gyan, "func_586")
        self.assertRegex(body, r"global689\s*=\s*0xa\b")
        self.assertRegex(body, r"global698\s*=\s*0x14\b")

    def test_gyan_func106_109_exist_with_sys47(self) -> None:
        for name in ("func_106", "func_109"):
            body = _function_body(self.gyan, name)
            self.assertIn("sys_47(0x10", body)

    def test_field_map_pairs_present_in_both_sources(self) -> None:
        """Use-site justified renumbers from the analysis field map."""
        hyaku_pairs = [
            (r"global176\s*=\s*global67", "Hyaku lock-face latch"),
            (r"global177\s*=\s*global691\s*\*\s*0x64", "Hyaku turn budget"),
            (r"global254", "Hyaku completion flag symbol"),
        ]
        gyan_pairs = [
            (r"global174\s*=\s*global67", "Gyan lock-face latch"),
            (r"global175\s*=\s*global689\s*\*\s*0x64", "Gyan turn budget"),
            (r"global252", "Gyan completion flag symbol"),
        ]
        for pattern, label in hyaku_pairs:
            self.assertRegex(self.hyaku, pattern, label)
        for pattern, label in gyan_pairs:
            self.assertRegex(self.gyan, pattern, label)

    def test_mod_tree_gyan_shares_disable_sentinel(self) -> None:
        """E:\\XB\\mod stock-path Gyan also carries the Dodai port with aim disabled."""
        if not GYAN_MOD_TREE_2C.is_file():
            self.skipTest(f"mod-tree Gyan missing: {GYAN_MOD_TREE_2C}")
        text = _read(GYAN_MOD_TREE_2C)
        body = _function_body(text, "GYAN_DODAI_SPECIAL_SHOT_ACTION")
        self.assertRegex(body, r"global689\s*=\s*0xffffffff\b")

    def test_recipe_does_not_require_hyaku_bone_hashes(self) -> None:
        self.assertIn("Must not change", self.doc)
        self.assertIn("Do not copy Hyaku Dodai model/mount hashes", self.doc)
        self.assertIn("global689 = 0xa", self.doc)


if __name__ == "__main__":
    unittest.main()
