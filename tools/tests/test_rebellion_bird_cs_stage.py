"""Source contract for Rebellion bird CS three-hash stage split.

Drives the real 0.c / 2.c on disk. Behaviour remains E1 until packed in-game.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


MSC = Path(r"E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc")
SRC_0C = MSC / "0.c"
SRC_2C = MSC / "2.c"

UNCHARGED = "0x476fac14"
CS1 = "0x16ed34c0"
CS2 = "0x2194f05d"
FIELD_100 = "sys_1(0x10000, 0, 0x100"


def _read(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"required MSC source missing: {path}")
    return path.read_text(encoding="utf-8", errors="replace")


def _function_body(source: str, name: str) -> str:
    pattern = re.compile(rf"^(?:void|int)\s+{re.escape(name)}\s*\([^)]*\)\s*\{{", re.M)
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


def _strip_c_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//.*?$", "", text, flags=re.M)


class RebellionBirdCsStageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.src0 = _read(SRC_0C)
        cls.src2 = _read(SRC_2C)

    def test_registry_wires_three_hashes(self) -> None:
        code = _strip_c_comments(self.src2)
        self.assertIn(f"func_241({UNCHARGED}, ACTION_A_SHOT_BIRD)", code)
        self.assertIn(f"func_241({CS1}, ACTION_A_SHOT_BIRD_CS1)", code)
        self.assertIn(f"func_241({CS2}, ACTION_A_SHOT_BIRD_CS2)", code)
        self.assertNotIn("ACTION_CHARGE_SHOT_BIRD", code)

    def test_selector_reads_field_100_not_input_mask(self) -> None:
        body = _strip_c_comments(_function_body(self.src0, "rebellion_bird_submit_main_or_cs"))
        self.assertIn("sys_0(0x10000, 0, 0x100)", body)
        self.assertIn(f"func_95({UNCHARGED}, 0, 0x1, 0)", body)
        self.assertIn(f"func_95({CS1}, 0, 0x1, 0)", body)
        self.assertIn(f"func_95({CS2}, 0, 0x1, 0)", body)
        thinker = _strip_c_comments(_function_body(self.src0, "func_143"))
        self.assertEqual(thinker.count("rebellion_bird_submit_main_or_cs()"), 2)
        self.assertNotIn(f"func_95({CS2}, 0, 0x1, 0)", thinker)

    def test_func43_publishes_stage(self) -> None:
        body = _strip_c_comments(_function_body(self.src2, "func_43"))
        self.assertIn(f"{FIELD_100}, rebellion_bird_cs_stage)", body)

    def test_tick_notches_only_in_bird_form_and_resets_off_form(self) -> None:
        body = _strip_c_comments(_function_body(self.src2, "rebellion_bird_cs_tick"))
        self.assertIn("global143 != 0x2", body)
        self.assertIn("sys_0(0x90003, 0) == 0x1", body)
        self.assertIn("sys_4F(0xa, 0)", body)
        self.assertIn("rebellion_bird_cs_stage = 0", body)
        func4 = _strip_c_comments(_function_body(self.src2, "func_4"))
        self.assertIn("rebellion_bird_cs_tick()", func4)

    def test_cs_enter_consumes_before_callfunc3_and_uncharged_does_not(self) -> None:
        cs1 = _strip_c_comments(_function_body(self.src2, "ACTION_A_SHOT_BIRD_CS1"))
        cs2 = _strip_c_comments(_function_body(self.src2, "ACTION_A_SHOT_BIRD_CS2"))
        uncharged = _strip_c_comments(_function_body(self.src2, "ACTION_A_SHOT_BIRD"))
        for body in (cs1, cs2):
            consume_at = body.find("sys_4F(0xa, 0)")
            bind_at = body.find("rebellion_bird_cs_bind()")
            fire_at = body.find("global677 =")
            tick_at = body.find("callFunc3(rebellion_bird_cs_action_tick)")
            self.assertGreater(consume_at, 0)
            self.assertGreater(bind_at, consume_at)
            self.assertGreater(fire_at, bind_at)
            self.assertGreater(tick_at, fire_at)
        self.assertNotIn("sys_4F(0xa, 0)", uncharged)
        self.assertIn("callFunc3(rebellion_bird_main_shot_tick)", uncharged)

    def test_cs_fire_ids_and_action_tick_hold_timescale(self) -> None:
        cs1 = _strip_c_comments(_function_body(self.src2, "rebellion_bird_cs1_fire"))
        cs2 = _strip_c_comments(_function_body(self.src2, "rebellion_bird_cs2_fire"))
        uncharged = _strip_c_comments(_function_body(self.src2, "rebellion_bird_main_shot_fire"))
        tick = _strip_c_comments(_function_body(self.src2, "rebellion_bird_cs_action_tick"))
        self.assertIn("0xCDA9F55A", cs1)
        self.assertIn("0xCDA9F55B", cs1)
        self.assertIn("0xCDA9F55C", cs2)
        self.assertIn("0xCDA9F55D", cs2)
        self.assertIn("0xCDA9F561", uncharged)
        self.assertIn("0xCDA9F562", uncharged)
        self.assertIn("func_593()", tick)
        self.assertIn("global47 |= 0x40", tick)

    def test_keep_form_allowlist_and_interrupt_clear_stage(self) -> None:
        func41 = _strip_c_comments(_function_body(self.src2, "func_41"))
        func882 = _strip_c_comments(_function_body(self.src2, "func_882"))
        interrupt = _strip_c_comments(
            _function_body(self.src2, "rebellion_interrupt_bird_form_to_ground")
        )
        for body in (func41, func882):
            self.assertIn(UNCHARGED, body)
            self.assertIn(CS1, body)
            self.assertIn(CS2, body)
        self.assertIn("rebellion_bird_cs_stage = 0", interrupt)
        self.assertIn(f"{FIELD_100}, 0)", interrupt)


if __name__ == "__main__":
    unittest.main()
