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
            # User TUNE: analog commit window. D10 originally 0x14.
            "global698 = 0x27",
            # User TUNE: ENTER mix. I8: this is not beam agility.
            "global452 = 0x60",
            "global453 = 0x60",
            "global454 = 0x60",
            "global142 = 0xc2b19d13",
            "callFunc3(special_shot_flight_tick)",
        )
        for statement in expected:
            with self.subTest(statement=statement):
                self.assertIn(statement, body)

    def test_tick_matches_messala_func_970(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "special_shot_flight_tick"))
        self.assertRegex(
            body,
            r"func_593\(\);\s*func_167\(0x1004000\);",
        )
        self.assertRegex(
            body,
            r"if\s*\(\s*global184\s*==\s*0x2\s*\)\s*\{\s*"
            r"rebellion_flight_special_dampen_shoot_move\(\);\s*\}",
        )
        self.assertNotIn("rebellion_flight_special_face_current_target()", body)
        self.assertNotIn("rebellion_flight_special_stop_translation()", body)

    def test_shoot_dampen_scales_leftover_channels_after_func_167(self) -> None:
        body = _strip_c_comments(
            _function_body(self.source, "rebellion_flight_special_dampen_shoot_move")
        )
        self.assertIn("func_298(0x32)", body)
        self.assertIn("func_299(0x32)", body)
        self.assertIn("func_300(0x32)", body)
        self.assertNotIn("func_298(0)", body)
        self.assertNotIn("func_299(0)", body)
        self.assertNotIn("func_300(0)", body)

    def test_homemade_heading_and_clamp_adapters_are_gone(self) -> None:
        forbidden = (
            "rebellion_flight_special_face_current_target",
            "rebellion_flight_special_stop_aim",
            "rebellion_flight_special_reassert_and_clamp",
            "rebellion_flight_special_stop_translation",
        )
        for symbol in forbidden:
            with self.subTest(symbol=symbol):
                self.assertNotIn(f"void {symbol}(", self.source)
        for name in (
            "special_shot_flight_tick",
            "special_shot_flight_start",
            "special_shot_flight_shoot",
            "special_shot_flight_no_ammo",
            "special_shot_flight_end",
        ):
            body = _strip_c_comments(_function_body(self.source, name))
            for symbol in forbidden:
                with self.subTest(function=name, symbol=symbol):
                    self.assertNotIn(symbol, body)

    def test_the_flight_motor_is_never_taken_away(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "special_shot_flight_tick"))
        self.assertNotIn("func_296(0x3e8, 0)", body)

    def test_release_restores_flight_bit_motor_and_analog_profile(self) -> None:
        release = _strip_c_comments(
            _function_body(self.source, "rebellion_flight_special_release_flight_owner")
        )
        self.assertIn("func_167(0x1004000)", release)
        self.assertIn("func_296(0x3e8, 0x1)", release)
        self.assertIn("func_351(0x2, 0x4)", release)
        self.assertIn("rebellion_flight_special_profile_swapped = 0", release)

    def test_start_records_the_analog_profile_swap(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "special_shot_flight_start"))
        self.assertRegex(
            body,
            r"func_351\(0, 0x4\);\s*rebellion_flight_special_profile_swapped\s*=\s*0x1;",
        )

    def test_end_restores_bird_analog_then_sets_global252(self) -> None:
        # Loop motion has no Messala recovery clip (I3). Bird analog needs
        # profile 2 before func_598 (D10).
        body = _strip_c_comments(_function_body(self.source, "special_shot_flight_end"))
        self.assertRegex(
            body,
            r"rebellion_flight_special_release_flight_owner\(\);\s*"
            r"global252\s*=\s*0x1;",
        )
        self.assertNotIn("global244", body)

    def test_action_enter_clears_both_ownership_flags(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "SPECIAL_SHOT_FLIGHT"))
        self.assertIn("rebellion_flight_special_end_hold = 0", body)
        self.assertIn("rebellion_flight_special_profile_swapped = 0", body)

    def test_idle_landing_after_the_special_rearms_flight(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "func_41"))
        self.assertRegex(
            body,
            r"else if\s*\(\s*global3\s*!=\s*0xf5f21169\s*&&\s*global3\s*!=\s*0x6d00aeaa\s*\)"
            r"\s*\{\s*rebellion_flight_special_keep_form\s*=\s*0;\s*\}\s*"
            r"else\s*\{\s*func_167\(0x1004000\);\s*func_296\(0x3e8, 0x1\);\s*\}",
        )

    def test_abnormal_exit_restores_the_analog_profile(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "func_41"))
        self.assertRegex(
            body,
            r"if\s*\(\s*global3\s*!=\s*0\s*&&\s*global3\s*!=\s*0xd94d608f\s*\)\s*\{\s*"
            r"rebellion_flight_special_end_hold\s*=\s*0;\s*"
            r"if\s*\(\s*rebellion_flight_special_profile_swapped\s*\)",
        )
        self.assertIn("rebellion_flight_special_release_flight_owner()", body)

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

    def test_shoot_window_is_longer_than_the_cs2_copy(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "special_shot_flight_shoot"))
        self.assertIn("global244 >= 0x3c * 0x64", body)
        self.assertNotIn("global244 >= 0x28 * 0x64", body)

    def test_callfunc3_stays_on_the_tick(self) -> None:
        enter = _strip_c_comments(_function_body(self.source, "SPECIAL_SHOT_FLIGHT"))
        self.assertIn("callFunc3(special_shot_flight_tick)", enter)
        self.assertNotIn("callFunc3(special_shot_flight_start)", enter)


if __name__ == "__main__":
    unittest.main()
