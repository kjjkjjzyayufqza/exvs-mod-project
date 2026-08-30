"""Source contracts for the 2026-08-30 Rebellion MSC repair batch.

These assertions establish E1 source structure only. Player-visible behavior
still requires the pre-registered in-game matrix.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


MSC = Path(r"E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc")
SRC_0C = MSC / "0.c"
SRC_2C = MSC / "2.c"


def _read(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"required MSC source missing: {path}")
    return path.read_text(encoding="utf-8", errors="replace")


def _function_body(source: str, name: str) -> str:
    match = re.search(
        rf"^(?:void|int)\s+{re.escape(name)}\s*\([^)]*\)\s*\{{", source, re.M
    )
    if not match:
        raise AssertionError(f"function not found: {name}")
    start = match.end() - 1
    depth = 0
    for index in range(start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]
    raise AssertionError(f"unterminated function: {name}")


def _strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//.*?$", "", text, flags=re.M)


class RebellionRequestedFixesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.src0 = _read(SRC_0C)
        cls.src2 = _read(SRC_2C)

    def test_custom_subshot_uses_its_slot_without_touching_charge_slot_zero(self) -> None:
        enter = _strip_comments(_function_body(self.src2, "SUB_SHOT_CUSTOM"))
        start = _strip_comments(_function_body(self.src2, "sub_shot_custom_start"))
        shoot = _strip_comments(_function_body(self.src2, "sub_shot_custom_shoot"))
        no_ammo = _strip_comments(_function_body(self.src2, "sub_shot_custom_no_ammo"))
        self.assertIn("global681 = 0x1", enter)
        self.assertIn("sys_58(0x1, 0x436f1f0a)", start)
        self.assertNotIn("sys_58(0x3", start)
        self.assertNotIn("sys_58(0x4)", shoot)
        self.assertNotIn("sys_58(0x4)", no_ammo)
        self.assertIn("sys_4F(0, 0x5, 0xCDA9F563)", shoot)
        self.assertIn("sys_4F(0, 0x5, 0xCDA9F564)", shoot)
        self.assertNotIn("sys_4F(0, 0, 0xCDA9F563", shoot)
        self.assertNotIn("sys_4F(0, 0, 0xCDA9F564", shoot)
        self.assertIn("sys_4A(0x1, 0x7, 0)", shoot)
        self.assertIn("sys_4A(0x1, 0x7, 0x1)", shoot)

    def test_flight_special_stops_loop_se_on_natural_and_interrupt_exits(self) -> None:
        enter = _strip_comments(_function_body(self.src2, "SPECIAL_SHOT_FLIGHT"))
        cleanup = _strip_comments(
            _function_body(self.src2, "rebellion_flight_special_stop_loop_se")
        )
        self.assertIn("func_240(rebellion_flight_special_stop_loop_se)", enter)
        self.assertIn("sys_58(0x4)", cleanup)
        for name in (
            "special_shot_flight_shoot",
            "special_shot_flight_no_ammo",
            "special_shot_flight_end",
        ):
            with self.subTest(function=name):
                body = _strip_comments(_function_body(self.src2, name))
                self.assertIn("sys_58(0x4)", body)

    def test_side_combo_has_bounded_third_recovery_and_stronger_final_rush(self) -> None:
        third = _strip_comments(_function_body(self.src2, "func_955"))
        final = _strip_comments(_function_body(self.src2, "func_974"))
        self.assertNotIn("func_89(0x40, 0)", third)
        self.assertIn("func_89(0x2c, 0)", third)
        self.assertIn("global385 = 0x190", final)
        enter = final[: final.index("if (func_309")]
        self.assertNotIn("sys_46(0x1, 0x1, 0, 0, 0x190)", enter)
        self.assertIn("func_309(global20, 0xc8)", final)
        self.assertIn("func_309(global20, 0xbb8)", final)
        self.assertNotIn("func_309(global20, 0xe10)", final)
        self.assertIn("sys_46(0x1, 0x1, 0, 1000, 0x190)", final)
        self.assertNotIn("sys_46(0x1, 0x1, 0, 0xffffdcd8, 0x190)", final)
        self.assertNotIn("sys_46(0x1, 0x1, 0, 0x7d0, 0x190)", final)
        self.assertNotIn("sys_46(0x1, 0x1, 0, 0, 0x320)", final)
        self.assertIn("sys_46(0x1, 0x1, 0, 0, 0)", final)
        self.assertIn("rebellion_dir2_fourth_aimed = 0", enter)
        self.assertIn("sys_46(0, func_102", final)
        self.assertIn("func_532(0x14, 0x28, 0x50)", final)
        self.assertRegex(third, r"func_536\(0x1, (?:0x12|18), func_974\)")
        self.assertRegex(third, r"func_535\((?:0x12|18), 0x28\)")

    def test_n_combo_final_slash_requires_the_registered_melee_window(self) -> None:
        bd1 = _strip_comments(_function_body(self.src2, "func_980"))
        self.assertIn("rebellion_n_combo_need_melee_release", bd1)
        self.assertIn("func_81(0x6338be1f, 0x1, 0x2, 0x3)", bd1)
        self.assertNotIn("rebellion_n_submit_dir2_third", bd1)
        self.assertRegex(
            bd1,
            re.compile(
                r"sys_47\(0x7,\s*sys_4B\(0x1\)\).*?"
                r"rebellion_n_combo_in_bd\s*=\s*0;.*?global252\s*=\s*0x1",
                re.S,
            ),
        )

    def test_bird_cs_emits_from_non_consuming_slot_but_consumes_charge(self) -> None:
        bind = _strip_comments(_function_body(self.src2, "rebellion_bird_cs_bind"))
        self.assertIn("global681 = 0x5", bind)
        for name in ("ACTION_A_SHOT_BIRD_CS1", "ACTION_A_SHOT_BIRD_CS2"):
            with self.subTest(function=name):
                body = _strip_comments(_function_body(self.src2, name))
                self.assertIn("sys_4F(0xa, 0)", body)

    def test_normal_back_special_no_longer_submits_multi_lock_action(self) -> None:
        thinker = _strip_comments(_function_body(self.src0, "func_143"))
        self.assertNotIn("0x8d3a4411", thinker)
        self.assertIn("func_95(0x20923fb6, 0x1, 0x1, 0x8)", thinker)


if __name__ == "__main__":
    unittest.main()
