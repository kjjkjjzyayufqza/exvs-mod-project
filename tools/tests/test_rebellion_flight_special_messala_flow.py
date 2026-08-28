"""Source contract for the Messala-style Rebellion flight special."""

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


class RebellionFlightSpecialMessalaFlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = _read(SRC_2C)

    def test_action_uses_messala_portable_quartet_parameters(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "SPECIAL_SHOT_FLIGHT"))
        expected = (
            "func_586()",
            "global676 = special_shot_flight_start",
            "global677 = special_shot_flight_shoot",
            "global678 = special_shot_flight_no_ammo",
            "global679 = special_shot_flight_end",
            "global681 = 0x2",
            "global682 = 0x1",
            "global683 = 0x1",
            "global686 = 0x100",
            "global689 = 0xa",
            "global698 = 0",
            "global452 = 0x64",
            "global453 = 0x61",
            "global454 = 0x61",
            "global142 = 0xc2b19d13",
            "callFunc3(special_shot_flight_tick)",
        )
        for statement in expected:
            with self.subTest(statement=statement):
                self.assertIn(statement, body)

    def test_tick_keeps_messala_owner_then_applies_target_translation_clamp(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "special_shot_flight_tick"))
        self.assertRegex(
            body,
            r"^\{\s*func_593\(\);\s*func_167\(0x1004000\);\s*"
            r"if\s*\(\s*global184\s*!=\s*0x4\s*\)\s*\{\s*"
            r"rebellion_flight_special_stop_translation\(\);\s*\}\s*\}$",
        )

    def test_translation_clamp_does_not_break_flight_ownership(self) -> None:
        body = _strip_c_comments(
            _function_body(self.source, "rebellion_flight_special_stop_translation")
        )
        self.assertIn("sys_46(0x1, 0x1, 0, 0, 0)", body)
        self.assertIn("sys_46(0x1, 0x2, 0, 0, 0)", body)
        self.assertIn("sys_46(0x4, 0x4, 0)", body)
        self.assertIn("func_300(0)", body)
        self.assertIn("func_104(0, 0, 0)", body)
        self.assertIn("func_107(0, 0, 0)", body)
        self.assertNotIn("func_169(", body)
        self.assertNotIn("func_296(", body)
        self.assertNotRegex(body, r"global714\s*=")

    def test_private_patch_state_and_adapters_are_removed(self) -> None:
        forbidden = (
            "rebellion_flight_special_seg",
            "rebellion_flight_special_frames",
            "rebellion_flight_special_foot_stop",
            "rebellion_flight_special_lock_aim",
            "rebellion_flight_special_restore_analog",
        )
        for symbol in forbidden:
            with self.subTest(symbol=symbol):
                self.assertNotIn(symbol, self.source)

    def test_four_phases_use_native_phase_state(self) -> None:
        for name in (
            "special_shot_flight_start",
            "special_shot_flight_shoot",
            "special_shot_flight_no_ammo",
            "special_shot_flight_end",
        ):
            with self.subTest(function=name):
                body = _strip_c_comments(_function_body(self.source, name))
                self.assertRegex(body, r"if\s*\(\s*global240\s*==\s*0\s*\)")

        for name in (
            "special_shot_flight_start",
            "special_shot_flight_shoot",
            "special_shot_flight_no_ammo",
        ):
            with self.subTest(timed_function=name):
                body = _strip_c_comments(_function_body(self.source, name))
                self.assertIn("global244", body)

    def test_looping_motion_end_releases_action_immediately(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "special_shot_flight_end"))
        self.assertNotIn("global244", body)
        self.assertRegex(body, r"global252\s*=\s*0x1")


if __name__ == "__main__":
    unittest.main()
