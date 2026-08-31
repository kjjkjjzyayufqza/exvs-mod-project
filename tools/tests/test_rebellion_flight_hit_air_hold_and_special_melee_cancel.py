"""Source contract for Rebellion flight-hit air hold and bird special melee.

1. FORCED_RECOVERY keeps func_296(0x3e8, 1) when the previous action is
   flight special or transform start/end. Landing / sub-shot ENTER still
   disable the motor.
2. Bird special melee is the 2026-08-23 accepted dive: ENTER interrupt,
   A until 0x708, wait until !func_287(0x3ed). No keep-form skip, no
   wait_remain timeout, no EW cancel helpers.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


SRC_2C = Path(r"E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c")


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


class RebellionFlightHitAirHoldAndSpecialMeleeCancelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = _read(SRC_2C)

    def test_teardown_keep_air_sources_and_exclusions(self) -> None:
        code = _strip_c_comments(
            _function_body(self.source, "rebellion_teardown_should_keep_air_hold")
        )
        self.assertIn("0xd94d608f", code)
        self.assertIn("0x9475130e", code)
        self.assertIn("0xa02d57dc", code)
        self.assertIn("0xc0b814ff", code)
        self.assertIn("0x7e08fcc9", code)
        self.assertNotIn("0x77b100ff", code)

    def test_interrupt_reenable_motor_when_keep_air(self) -> None:
        code = _strip_c_comments(
            _function_body(self.source, "rebellion_interrupt_bird_form_to_ground")
        )
        self.assertIn("rebellion_teardown_should_keep_air_hold()", code)
        self.assertRegex(code, r"func_296\s*\(\s*0x3e8\s*,\s*0x1\s*\)")
        self.assertRegex(code, r"func_296\s*\(\s*0x3e8\s*,\s*0\s*\)")

    def test_hit_does_not_restore_analog_then_kill_motor(self) -> None:
        code = _strip_c_comments(_function_body(self.source, "func_41"))
        self.assertIn("rebellion_keep_air_on_teardown = 0x1", code)
        analog_restore = re.search(
            r"if\s*\(\s*global3\s*==\s*0x77b100ff\s*\|\|\s*global3\s*==\s*0xf5f21169",
            code,
        )
        self.assertIsNotNone(analog_restore)
        restore_fn = "rebellion_flight_special_release_flight_owner()"
        restore_at = code.find(restore_fn)
        self.assertGreater(restore_at, analog_restore.start())

    def test_bird_special_melee_keeps_form_on_enter(self) -> None:
        func41 = _strip_c_comments(_function_body(self.source, "func_41"))
        self.assertRegex(
            func41,
            r"global3\s*!=\s*0xd94d608f\s*&&\s*global3\s*!=\s*0xc0b814ff\s*&&\s*global3\s*!=\s*0x8d96c52f\s*&&\s*global3\s*!=\s*0x279f0da4",
        )
        func882 = _strip_c_comments(_function_body(self.source, "func_882"))
        self.assertRegex(
            func882,
            r"global3\s*==\s*0xd94d608f\s*\|\|\s*global3\s*==\s*0xc0b814ff\s*\|\|\s*global3\s*==\s*0x8d96c52f\s*\|\|\s*global3\s*==\s*0x279f0da4",
        )

    def test_special_melee_dive_keeps_bird_until_ground_b(self) -> None:
        air_start = _strip_c_comments(
            _function_body(self.source, "rebellion_bird_special_melee_landing_air_start")
        )
        self.assertNotIn("rebellion_interrupt_bird_form_to_ground()", air_start)
        self.assertIn("0x1192e91e", air_start)
        self.assertIn("0x708", air_start)
        wait = _strip_c_comments(
            _function_body(self.source, "rebellion_bird_special_melee_landing_air_wait")
        )
        self.assertIn("func_287(0x3ed)", wait)
        self.assertNotIn("0x960", wait)
        self.assertNotIn("func_233", wait)
        self.assertIn("rebellion_bird_special_melee_open_cancels()", wait)
        ground = _strip_c_comments(
            _function_body(self.source, "rebellion_bird_special_melee_landing_ground")
        )
        self.assertIn("0x33b742cd", ground)
        self.assertIn("rebellion_interrupt_bird_form_to_ground()", ground)
        self.assertIn("rebellion_bird_special_melee_open_cancels()", ground)
        landing = self.source.split("void ACTION_BC_SPECIAL_MELEE_BIRD_LANDING()")[1].split(
            "void ACTION_BC_SPECIAL_MELEE_BIRD_SIDE_TV()"
        )[0]
        self.assertNotIn("func_81", landing)
        opener = _strip_c_comments(
            _function_body(self.source, "rebellion_bird_special_melee_open_cancels")
        )
        self.assertIn("func_123(0x3bf)", opener)
        self.assertNotIn("0x9a5", opener)
        self.assertNotIn("func_123", air_start)


if __name__ == "__main__":
    unittest.main()
