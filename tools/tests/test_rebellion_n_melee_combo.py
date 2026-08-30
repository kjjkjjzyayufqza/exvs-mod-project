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
        self.assertIn("global385 = 0x190", code)

    def test_bd1_n_combo_submits_dir2_at_hit_not_clip_end_only(self) -> None:
        code = _strip_c_comments(_function_body(self.source, "func_980"))
        self.assertIn(f"func_309(global20, {hex(BD1_HIT_TIME)})", code)
        self.assertIn(f"func_81({hex(DIR_2_HASH)}, 0x1, 0x2, 0x3)", code)
        self.assertIn("rebellion_n_combo_want_dir2_third = 1", code)

    def test_n_combo_uses_variant_enter_not_spliced_bd_body(self) -> None:
        n2 = _strip_c_comments(_function_body(self.source, "func_954"))
        self.assertIn("rebellion_n_submit_bd", n2)
        submit = _strip_c_comments(_function_body(self.source, "rebellion_n_submit_bd"))
        self.assertIn(f"func_81({hex(VARIANT_HASH)}, 0x1, 0x2, 0x6)", submit)
        variant = _strip_c_comments(_function_body(self.source, "ACTION_B_MELEE_VARIANT"))
        self.assertIn("global602 = func_979", variant)

    def test_dir2_third_slash_does_not_self_follow(self) -> None:
        code = _strip_c_comments(_function_body(self.source, "func_974"))
        self.assertIn("func_532(0x1f, 0x2a, 0x50)", code)
        self.assertIn("global385 = 0x190", code)
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
            r"func_536\(\s*0x1\s*,\s*(0x[0-9a-fA-F]+)\s*,\s*func_974\s*\)",
            n3,
        )
        window = re.search(
            r"func_535\(\s*(0x[0-9a-fA-F]+)\s*,\s*(0x[0-9a-fA-F]+)\s*\)",
            n3,
        )
        chase = re.search(
            r"func_532\(\s*(0x[0-9a-fA-F]+)\s*,\s*(0x[0-9a-fA-F]+)\s*,\s*(0x[0-9a-fA-F]+)\s*\)",
            n3[n3.index("rebellion_dir2_n3_bridge") :],
        )
        hold = re.search(
            r"func_89\(\s*(0x[0-9a-fA-F]+)\s*,\s*0\s*\)",
            n3[n3.index("rebellion_dir2_n3_bridge") :],
        )
        self.assertIsNotNone(follow, "bridged N3 must still 536 to func_974")
        self.assertIsNotNone(window)
        self.assertIsNotNone(chase)
        self.assertIsNotNone(hold)
        follow_at = _int_lit(follow.group(1))
        win_start = _int_lit(window.group(1))
        win_end = _int_lit(window.group(2))
        chase_frames = _int_lit(chase.group(1))
        hold_frames = _int_lit(hold.group(1))
        self.assertGreaterEqual(follow_at, 0x1c)
        self.assertGreaterEqual(win_start, 0x1c)
        self.assertGreater(win_end, follow_at)
        self.assertGreaterEqual(chase_frames, follow_at)
        self.assertGreater(hold_frames, win_end)
        self.assertIn("global385 = 0x190", n3)

    def test_standing_bd1_clip_enters_bd2_not_action_end(self) -> None:
        code = _strip_c_comments(_function_body(self.source, "func_980"))
        self.assertIn("func_536(0x1, 0x18, func_981)", code)
        self.assertIn("func_71(func_981)", code)
        clip = code[code.rindex("sys_47(0x7, sys_4B(0x1))") :]
        self.assertIn("func_71(func_981)", clip)
        self.assertRegex(
            clip,
            r"else\s*\{[^}]*func_71\(func_981\)",
            "standing BD1 clip must enter BD2 instead of global252",
        )

    def test_standing_bd2_turn_hands_off_cutback_action(self) -> None:
        turn = _strip_c_comments(_function_body(self.source, "func_981"))
        self.assertNotIn("func_535", turn)
        self.assertNotIn("func_536", turn)
        self.assertIn("func_81(0xbabeaf7, 0x1, 0x2, 0x6)", turn)
        self.assertNotIn(hex(FWD_DERIV_HASH), turn)
        self.assertNotIn(hex(DIR_2_HASH), turn)
        cut = _strip_c_comments(_function_body(self.source, "func_985"))
        self.assertIn("rebellion_bd_submit_extra_bd1", cut)
        self.assertIn("func_536(0x1, 0x8, rebellion_bd_submit_extra_bd1)", cut)
        clip = cut[cut.rindex("sys_47(0x7, sys_4B(0x1))") :]
        self.assertIn("rebellion_bd_combo_want_extra_bd1 = 1", clip)
        self.assertIn(f"func_81({hex(VARIANT_HASH)}, 0x1, 0x2, 0x6)", clip)
        self.assertNotIn(hex(FWD_DERIV_HASH), clip)
        hit = cut[cut.index("func_309(global20, 0x2bc)") : cut.rindex("sys_47(0x7, sys_4B(0x1))")]
        self.assertNotIn("func_81", hit)
        self.assertNotIn(hex(DIR_1_HASH), cut)
        enter = _strip_c_comments(_function_body(self.source, "func_982"))
        self.assertIn("global602 = func_984", enter)

    def test_bd_combo_two_extra_bd1_then_dir2_third(self) -> None:
        variant = _strip_c_comments(_function_body(self.source, "ACTION_B_MELEE_VARIANT"))
        self.assertIn("rebellion_bd_combo_want_extra_bd1", variant)
        self.assertIn("global602 = func_980", variant)
        self.assertIn("global602 = func_979", variant)
        submit = _strip_c_comments(
            _function_body(self.source, "rebellion_bd_submit_extra_bd1")
        )
        self.assertIn(f"func_81({hex(VARIANT_HASH)}, 0x1, 0x2, 0x6)", submit)
        self.assertNotIn(hex(FWD_DERIV_HASH), submit)
        bd1 = _strip_c_comments(_function_body(self.source, "func_980"))
        self.assertIn("rebellion_bd_extra_bd1_count++", bd1)
        self.assertIn("func_536(0x1, 0x8, func_980)", bd1)
        self.assertIn("func_536(0x1, 0x8, rebellion_n_submit_dir2_third)", bd1)
        self.assertIn("func_536(0x1, 0x18, func_981)", bd1)
        clip = bd1[bd1.rindex("sys_47(0x7, sys_4B(0x1))") :]
        self.assertIn("func_71(func_980)", clip)
        self.assertIn(f"func_81({hex(DIR_2_HASH)}, 0x1, 0x2, 0x3)", clip)
        self.assertIn("func_71(func_981)", clip)
        fwd = _strip_c_comments(_function_body(self.source, "func_987"))
        self.assertIn("global602 = func_989", fwd)
        self.assertNotIn("rebellion_bd_fwd_first_start", fwd)
        first = _strip_c_comments(_function_body(self.source, "func_990"))
        self.assertIn("func_536(0x200, 0x5, func_991)", first)
        self.assertNotIn("rebellion_bd_fwd_reopen_chase", first)
        second = _strip_c_comments(_function_body(self.source, "func_991"))
        self.assertIn("func_536(0x200, 0xf, func_992)", second)
        self.assertNotIn("rebellion_n_submit_dir2_third", second)

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
