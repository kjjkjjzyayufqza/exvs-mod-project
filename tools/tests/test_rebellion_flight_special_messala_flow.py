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
            # Not Messala's values. Messala's transform sub is a moving shot;
            # this is a foot-stop, so these follow ACTION_A_SHOT_BIRD, the one
            # bird-form ranged action that provably keeps flying afterwards.
            # global698 becomes engine field 0x16, read back by 0.c as global33:
            # while it is >= 0x64 the selector will not commit a new action, so
            # Messala's 0 left the native flight loop no window to take over.
            "global698 = 0x14",
            "global452 = 0",
            "global453 = 0",
            "global454 = 0",
            "global142 = 0xc2b19d13",
            "callFunc3(special_shot_flight_tick)",
        )
        for statement in expected:
            with self.subTest(statement=statement):
                self.assertIn(statement, body)

    def test_tick_keeps_messala_owner_then_foot_stops_every_pre_release_frame(self) -> None:
        # The phase index stays the primary gate. A single ownership latch was
        # able to switch the clamp off for the entire action, which is how the
        # unit ended up free to move through the whole beam on 2026-08-29.
        body = _strip_c_comments(_function_body(self.source, "special_shot_flight_tick"))
        self.assertRegex(
            body,
            r"^\{\s*func_593\(\);\s*func_167\(0x1004000\);\s*"
            r"if\s*\(\s*global184\s*!=\s*0x4\s*\|\|\s*"
            r"rebellion_flight_special_end_hold\s*!=\s*0\s*\)\s*\{\s*"
            r"rebellion_flight_special_stop_translation\(\);\s*"
            r"rebellion_flight_special_face_current_target\(\);\s*"
            r"\}\s*\}$",
        )

    def test_the_flight_motor_is_never_taken_away(self) -> None:
        # Four runs: the 2026-08-28 build never touched sys_1(0x30001) and both
        # stopped correctly and exited correctly; the build that dropped it with
        # a disabled clamp still let the player move. The clamp and the per-frame
        # lock writer are what fixed stop and heading, so the motor drop was an
        # unproven addition and the only remaining difference from
        # ACTION_A_SHOT_BIRD, the bird-form action that provably keeps flying.
        for name in (
            "rebellion_flight_special_stop_translation",
            "special_shot_flight_tick",
        ):
            with self.subTest(function=name):
                body = _strip_c_comments(_function_body(self.source, name))
                self.assertNotIn("func_296(0x3e8, 0)", body)

    def test_foot_stop_drops_the_native_flight_owner(self) -> None:
        body = _strip_c_comments(
            _function_body(self.source, "rebellion_flight_special_stop_translation")
        )
        # The flight bit must stay set: the clears below are calibrated against
        # the flight movement model, and dropping 0x4000 made the whole clamp a
        # no-op at runtime on 2026-08-29 (registered failure I1).
        self.assertNotIn("func_169(", body)
        # The engine's own stop primitives: sys_46(0x8)/func_113() are what
        # func_56 and func_73 run, and channels 1/2/3/4 are what func_44 clears
        # on every action switch.
        self.assertIn("sys_46(0x8, 0, 0, 0)", body)
        self.assertIn("func_113()", body)
        for channel in ("0x1", "0x2", "0x3", "0x4"):
            with self.subTest(channel=channel):
                self.assertIn(f"sys_46(0x1, {channel}, 0, 0, 0)", body)
        self.assertIn("sys_46(0x4, 0x4, 0)", body)
        self.assertIn("func_300(0)", body)
        self.assertIn("func_104(0, 0, 0)", body)
        self.assertIn("func_107(0, 0, 0)", body)
        self.assertNotRegex(body, r"global714\s*=")

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

    def test_end_phase_hands_the_flight_owner_back_on_its_first_frame(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "special_shot_flight_end"))
        self.assertRegex(
            body,
            r"rebellion_flight_special_end_hold\s*=\s*0x1;\s*"
            r"rebellion_flight_special_release_flight_owner\(\);\s*\}",
        )

    def test_action_enter_clears_both_ownership_flags(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "SPECIAL_SHOT_FLIGHT"))
        self.assertIn("rebellion_flight_special_end_hold = 0", body)
        self.assertIn("rebellion_flight_special_profile_swapped = 0", body)

    def test_idle_landing_after_the_special_rearms_flight(self) -> None:
        # func_412 (0xf5f21169) runs func_169(0x14000) + func_296(0x3e8, 0) and
        # func_390 (0x6d00aeaa) runs func_170(0x30000003). Both wipe the flight
        # bit and the motor, and both 0.c's bird input branch and the native
        # flight loop are selected from that state, so without a re-arm the unit
        # is stuck in bird visuals over a non-flight action with gravity on.
        body = _strip_c_comments(_function_body(self.source, "func_41"))
        self.assertRegex(
            body,
            r"else if\s*\(\s*global3\s*!=\s*0xf5f21169\s*&&\s*global3\s*!=\s*0x6d00aeaa\s*\)"
            r"\s*\{\s*rebellion_flight_special_keep_form\s*=\s*0;\s*\}\s*"
            r"else\s*\{\s*func_167\(0x1004000\);\s*func_296\(0x3e8, 0x1\);\s*\}",
        )

    def test_abnormal_exit_restores_the_analog_profile(self) -> None:
        body = _strip_c_comments(_function_body(self.source, "func_41"))
        # end_hold is cleared unconditionally, so it can only ever be set while
        # this action is in 679. The profile restore stays gated on
        # profile_swapped, which only 676 sets, so it can never fire before the
        # action has actually swapped the analog profile.
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
            "special_shot_flight_end",
        ):
            with self.subTest(timed_function=name):
                body = _strip_c_comments(_function_body(self.source, name))
                self.assertIn("global244", body)

    def test_looping_motion_end_holds_then_releases_ownership_with_global252(self) -> None:
        # Rebellion has no recovery clip, so Messala func_974's motion-end
        # predicate becomes a bounded phase timer. The foot-stop stays live for
        # the hold and ownership is handed back on the resolving frame.
        body = _strip_c_comments(_function_body(self.source, "special_shot_flight_end"))
        self.assertRegex(
            body,
            r"if\s*\(\s*global244\s*>=\s*0x19\s*\*\s*0x64\s*\)\s*\{\s*"
            r"rebellion_flight_special_end_hold\s*=\s*0;\s*"
            r"global252\s*=\s*0x1;\s*\}",
        )


if __name__ == "__main__":
    unittest.main()
