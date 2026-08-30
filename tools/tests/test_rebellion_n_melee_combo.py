"""Source contract for Rebellion N melee combo BD1 -> DIR_2 third slash.

N combo must func_81 into real ACTION hashes (registry E6). DIR_2 third
ENTER must keep a short func_516 approach: zeroing global175/188/189
lets func_492 set global603=1, which disables func_493 func_517 chase.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


SRC_2C = Path(r"E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c")

DIR_2_HASH = 0x6338BE1F
VARIANT_HASH = 0x3AC14535
FWD_DERIV_HASH = 0x446C1D89
DIR_1_HASH = 0xA2236F44
BD1_HIT_TIME = 0x320


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


def _int_lit(text: str) -> int:
    return int(text, 0)


def _timer_frames(code: str, name: str) -> int:
    match = re.search(
        rf"{re.escape(name)}\s*=\s*(0x[0-9a-fA-F]+|\d+)\s*\*\s*0x64\s*;",
        code,
    )
    if not match:
        raise AssertionError(f"{name} is not written as frames * 0x64")
    frames = _int_lit(match.group(1))
    if frames <= 0:
        raise AssertionError(f"{name} approach frames must be > 0, got {frames}")
    return frames


class RebellionNMeleeComboTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = _read(SRC_2C)

    def test_dir2_third_start_keeps_short_approach_chase(self) -> None:
        code = _strip_c_comments(_function_body(self.source, "rebellion_n_dir2_third_start"))
        self.assertIn("func_531(func_974)", code)
        for name in ("global175", "global188", "global189"):
            self.assertIsNone(
                re.search(rf"{name}\s*=\s*0\s*;", code),
                msg=f"{name}=0 skips func_516 and lets func_492 set global603=1",
            )
        frames_175 = _timer_frames(code, "global175")
        frames_188 = _timer_frames(code, "global188")
        frames_189 = _timer_frames(code, "global189")
        self.assertLessEqual(
            frames_189,
            frames_188,
            "global189 must elapse before global188 so global603 stays 0 into func_974",
        )
        self.assertGreaterEqual(frames_175, 0x8)
        self.assertLess(
            frames_175,
            0x10,
            "16f approach was still a long BD1 to DIR_2 third gap",
        )
        self.assertIn("global385 = 0x320", code)

    def test_bd1_n_combo_requires_melee_window_for_dir2_final(self) -> None:
        code = _strip_c_comments(_function_body(self.source, "func_980"))
        self.assertIn(f"func_309(global20, {hex(BD1_HIT_TIME)})", code)
        self.assertIn("rebellion_n_combo_need_melee_release", code)
        self.assertIn(f"func_81({hex(DIR_2_HASH)}, 0x1, 0x2, 0x3)", code)
        self.assertIn("rebellion_n_combo_want_dir2_third = 0x1", code)
        self.assertNotIn("rebellion_n_submit_dir2_third", code)

    def test_n_combo_uses_variant_enter_not_spliced_bd_body(self) -> None:
        n2 = _strip_c_comments(_function_body(self.source, "func_954"))
        self.assertIn("rebellion_n_submit_bd", n2)
        submit = _strip_c_comments(_function_body(self.source, "rebellion_n_submit_bd"))
        self.assertIn(f"func_81({hex(VARIANT_HASH)}, 0x1, 0x2, 0x6)", submit)
        variant = _strip_c_comments(_function_body(self.source, "ACTION_B_MELEE_VARIANT"))
        self.assertIn("global602 = func_979", variant)

    def test_dir2_third_slash_does_not_self_follow(self) -> None:
        code = _strip_c_comments(_function_body(self.source, "func_974"))
        self.assertIn("func_532(0x14, 0x28, 0x50)", code)
        self.assertIn("global385 = 0x190", code)
        enter = code[: code.index("if (func_309")]
        self.assertNotIn("sys_46(0x1, 0x1, 0, 0, 0x190)", enter)
        self.assertIn("func_309(global20, 0xc8)", code)
        self.assertIn("func_309(global20, 0xbb8)", code)
        self.assertNotIn("func_309(global20, 0xe10)", code)
        self.assertIn("sys_46(0x1, 0x1, 0, 1000, 0x190)", code)
        self.assertNotIn("sys_46(0x1, 0x1, 0, 0xffffdcd8, 0x190)", code)
        self.assertNotIn("sys_46(0x1, 0x1, 0, 0x7d0, 0x190)", code)
        self.assertIn("sys_46(0x1, 0x1, 0, 0, 0)", code)
        self.assertIn("rebellion_dir2_fourth_aimed = 0", enter)
        self.assertIn("rebellion_dir2_fourth_aimed == 0", code)
        self.assertIn("sys_46(0, func_102", code)
        self.assertNotIn("func_535", code)
        self.assertNotIn("func_536", code)
        self.assertNotIn("rebellion_dir2_third_slash_visits", code)
        self.assertNotIn("rebellion_n_combo", code)

    def test_dir2_n3_holds_chase_before_third_slash(self) -> None:
        n3 = _strip_c_comments(_function_body(self.source, "func_955"))
        enter = _strip_c_comments(_function_body(self.source, "rebellion_dir2_enter_n3"))
        self.assertIn("rebellion_dir2_n3_bridge = 1", enter)
        self.assertIn("func_955()", enter)
        self.assertIn("if (rebellion_dir2_n3_bridge != 0)", n3)
        follow = re.search(
            r"func_536\(\s*0x1\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*func_974\s*\)",
            n3,
        )
        window = re.search(
            r"func_535\(\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*\)",
            n3,
        )
        chase = re.search(
            r"func_532\(\s*0x8\s*,\s*0x1e\s*,\s*0x5f\s*\)",
            n3,
        )
        self.assertIsNotNone(follow, "bridged N3 must still 536 to func_974")
        self.assertIsNotNone(window)
        self.assertIsNotNone(chase, "bridged N3 must keep the 8f strike chase")
        follow_at = _int_lit(follow.group(1))
        win_start = _int_lit(window.group(1))
        win_end = _int_lit(window.group(2))
        self.assertGreaterEqual(follow_at, 0x12)
        self.assertLessEqual(follow_at, 0x14)
        self.assertEqual(win_start, follow_at)
        self.assertGreater(win_end, follow_at)
        self.assertIn("func_89(0x2c, 0)", n3)
        self.assertNotIn("func_89(0x40, 0)", n3)
        self.assertIn("sys_46(0x1, 0x1, 0, 0, 0x190)", n3)
        self.assertIn("sys_46(0x1, 0x1, 0, 0, 0)", n3)

    def test_standing_bd1_uses_input_window_for_bd2_then_ends(self) -> None:
        code = _strip_c_comments(_function_body(self.source, "func_980"))
        self.assertIn("func_536(0x1, 0x18, func_981)", code)
        clip = code[code.rindex("sys_47(0x7, sys_4B(0x1))") :]
        self.assertIn("global252 = 0x1", clip)
        self.assertNotIn("func_81", clip)

    def test_standing_bd2_turn_hands_off_cutback_action(self) -> None:
        turn = _strip_c_comments(_function_body(self.source, "func_981"))
        self.assertNotIn("func_535", turn)
        self.assertNotIn("func_536", turn)
        self.assertIn("func_81(0xbabeaf7, 0x1, 0x2, 0x6)", turn)
        self.assertNotIn(hex(FWD_DERIV_HASH), turn)
        self.assertNotIn(hex(DIR_2_HASH), turn)
        cut = _strip_c_comments(_function_body(self.source, "func_985"))
        clip = cut[cut.rindex("sys_47(0x7, sys_4B(0x1))") :]
        self.assertIn("global252 = 0x1", clip)
        self.assertNotIn("func_81", clip)
        self.assertNotIn(hex(FWD_DERIV_HASH), clip)
        hit = cut[cut.index("func_309(global20, 0x2bc)") : cut.rindex("sys_47(0x7, sys_4B(0x1))")]
        self.assertNotIn("func_81", hit)
        self.assertNotIn(hex(DIR_1_HASH), cut)
        enter = _strip_c_comments(_function_body(self.source, "func_982"))
        self.assertIn("global602 = func_984", enter)

    def test_reverted_extra_bd_branch_stays_absent(self) -> None:
        for symbol in (
            "rebellion_bd_combo_want_extra_bd1",
            "rebellion_bd_submit_extra_bd1",
            "rebellion_bd_extra_bd1_count",
            "rebellion_bd_fwd_reopen_chase",
        ):
            with self.subTest(symbol=symbol):
                self.assertNotIn(symbol, self.source)

    def test_standing_dir2_first_slash_still_goes_to_second(self) -> None:
        slash = _strip_c_comments(_function_body(self.source, "func_972"))
        self.assertIn("func_536(0x1, 0xd, func_973)", slash)
        self.assertNotIn("rebellion_bd_submit", slash)
        enter = _strip_c_comments(_function_body(self.source, "ACTION_B_MELEE_DIR_2"))
        self.assertNotIn("rebellion_bd_combo_want_dir2_first", enter)
        self.assertIn("global602 = rebellion_n_dir2_third_start", enter)

    def test_dir1_special_dash_gate_unchanged(self) -> None:
        code = _strip_c_comments(_function_body(self.source, "ACTION_B_MELEE_DIR_1"))
        self.assertIn("func_81(0x928ca34f, 0x1, 0x2, 0x1)", code)
        self.assertIn("global602 = func_960", code)
