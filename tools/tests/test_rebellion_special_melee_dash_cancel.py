"""
Shipped cancel path: any-dir special melee then any melee enters the dash.

Drives the real Rebellion 0.c / 2.c on disk. The gate is func_233(want, exclude)
inside func_933 / func_936, then func_81(0x928ca34f) which func_241 wires to
rebellion_enter_normal_special_n_bird_dash. N-only 0x2 must fail dir melee.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


MSC = Path(r"E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc")
SRC_0C = MSC / "0.c"
SRC_2C = MSC / "2.c"

DASH_HASH = 0x928CA34F
N_SPECIAL = 0xC805DC33
DIR_SPECIAL = 0x66EB879F
N_MELEE = 0x2
# Analog 前进 is 0x4 on raw global2/global4. 前格/VARIANT is 0x40.
# L/R melee is 0x8/0x10. Do not treat analog 0x4 as melee.
DIR_MELEE_BITS = (0x8, 0x10, 0x40)
FRONT_MELEE_CANCEL = 0x4
ANALOG_FORWARD = 0x4
OC_SPECIAL_MELEE_MASK = 0x5E


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


def _parse_func_233_call(window_body: str) -> tuple[int, int]:
    code = _strip_c_comments(window_body)
    match = re.search(
        r"func_233\s*\(\s*(0x[0-9a-fA-F]+)\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*\)",
        code,
    )
    if not match:
        raise AssertionError("func_233 cancel call not found in window")
    return int(match.group(1), 0), int(match.group(2), 0)


def _func_233_from_source(global92: int, want: int, exclude: int) -> bool:
    """Apply the shipped func_233 return (sys_0(0x6000d) off / var2 == global92)."""
    return (global92 & want) != 0 and (global92 & exclude) == 0


class RebellionSpecialMeleeDashCancelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.src0 = _read(SRC_0C)
        cls.src2 = _read(SRC_2C)
        cls.func_233 = _function_body(cls.src2, "func_233")
        cls.func_933 = _function_body(cls.src2, "func_933")
        cls.func_936 = _function_body(cls.src2, "func_936")
        cls.enter = _function_body(cls.src2, "rebellion_enter_normal_special_n_bird_dash")
        cls.func_143 = _function_body(cls.src0, "func_143")

    def test_shipped_func_233_is_want_and_not_exclude(self) -> None:
        code = _strip_c_comments(self.func_233)
        self.assertRegex(
            code,
            r"return\s*\(\s*var2\s*&\s*arg0\s*\)\s*!=\s*0\s*&&\s*\(\s*global92\s*&\s*arg1\s*\)\s*==\s*0",
        )

    def test_registry_wires_dash_hash_to_enter(self) -> None:
        self.assertRegex(
            _strip_c_comments(self.src2),
            r"func_241\s*\(\s*0x928ca34f\s*,\s*rebellion_enter_normal_special_n_bird_dash\s*\)",
        )

    def test_ground_enter_does_not_redirect_to_func_937(self) -> None:
        code = _strip_c_comments(self.enter)
        self.assertIn("func_586()", code)
        self.assertIn("rebellion_normal_special_n_bird_dash_start", code)
        self.assertRegex(
            code,
            r"if\s*\(\s*rebellion_bird_n_melee_from_flight\s*\|\|\s*global143\s*==\s*0x2\s*\)",
        )

    def test_both_special_windows_submit_dash_for_every_melee_bit(self) -> None:
        for name, body in (("func_933", self.func_933), ("func_936", self.func_936)):
            with self.subTest(window=name):
                want, exclude = _parse_func_233_call(body)
                code = _strip_c_comments(body)
                self.assertIn("func_81(0x928ca34f, 0x1, 0x2, 0x1)", code)
                self.assertNotIn("func_81(0x8b97920e", code)
                self.assertNotRegex(
                    code,
                    r"if\s*\(\s*\(\s*global48\s*&\s*0x7e\s*\)",
                )
                self.assertRegex(
                    code,
                    r"global242\s*==\s*0x1\s*&&\s*func_233\s*\(\s*0x7e\s*,\s*0\s*\)",
                )
                for bit in (N_MELEE,) + DIR_MELEE_BITS:
                    self.assertTrue(
                        _func_233_from_source(bit, want, exclude),
                        f"{name}: melee bit 0x{bit:x} must pass func_233(0x{want:x}, 0x{exclude:x})",
                    )
                self.assertFalse(
                    _func_233_from_source(0, want, exclude),
                    f"{name}: empty input must not cancel",
                )

    def test_n_only_mask_would_drop_dir_melee(self) -> None:
        """Guard against regressing to func_233(0x2): dir melee bits miss."""
        want, exclude = _parse_func_233_call(self.func_933)
        self.assertNotEqual(want, N_MELEE)
        for bit in DIR_MELEE_BITS:
            self.assertTrue(_func_233_from_source(bit, want, exclude))
            self.assertFalse(_func_233_from_source(bit, N_MELEE, exclude))

    def test_0c_does_not_map_stick_on_special_press_to_dash(self) -> None:
        code = _strip_c_comments(self.func_143)
        normal = code.split("if (global39 == 0)", 1)[1]
        special = re.search(
            r"else if\s*\(\s*global48\s*&\s*0x200\s*\)\s*\{",
            normal,
        )
        self.assertIsNotNone(special)
        start = special.end() - 1
        depth = 0
        for index in range(start, len(normal)):
            if normal[index] == "{":
                depth += 1
            elif normal[index] == "}":
                depth -= 1
                if depth == 0:
                    block = normal[start : index + 1]
                    break
        else:
            self.fail("unterminated 0x200 special block")
        self.assertNotRegex(
            block,
            r"if\s*\(\s*global2\s*&\s*0x3c\s*\)\s*\{[^}]*func_95\s*\(\s*0x928ca34f",
        )
        self.assertIn("0xc805dc33", block)
        self.assertIn("0x66eb879f", block)

    def test_0c_mid_special_dir_melee_submits_dash(self) -> None:
        code = _strip_c_comments(self.func_143)
        self.assertRegex(
            code,
            r"global8\s*==\s*0xc805dc33\s*\|\|\s*global8\s*==\s*0x66eb879f",
        )
        self.assertIn("global48 & 0x5e", code)
        self.assertNotIn("global4 & 0x7e", code)
        self.assertIn("func_95(0x928ca34f, 0x1, 0x2, 0x1)", code)
        self.assertTrue(FRONT_MELEE_CANCEL & OC_SPECIAL_MELEE_MASK)
        self.assertTrue(0x40 & OC_SPECIAL_MELEE_MASK)
        self.assertTrue(N_MELEE & OC_SPECIAL_MELEE_MASK)
        dash_at = code.find("global48 & 0x5e")
        dir1_at = code.find("func_95(0xa2236f44")
        self.assertGreater(dash_at, 0)
        self.assertGreater(dir1_at, dash_at)

    def test_analog_forward_alone_is_not_melee_cancel(self) -> None:
        want, exclude = _parse_func_233_call(self.func_933)
        code933 = _strip_c_comments(self.func_933)
        self.assertNotIn("global48 & 0x7e", code933)
        self.assertTrue(_func_233_from_source(0x40, want, exclude))
        self.assertTrue(_func_233_from_source(N_MELEE, want, exclude))

    def test_special_windows_drop_front_melee_from_cancel_allow(self) -> None:
        """0x9a5 bit 0x4 is 前格. That native cancel plays 0xa2236f44."""
        for name, body in (("func_933", self.func_933), ("func_936", self.func_936)):
            with self.subTest(window=name):
                code = _strip_c_comments(body)
                self.assertIn("func_123(0x9a1)", code)
                self.assertNotIn("func_123(0x9a5)", code)
                self.assertEqual(0x9A1 & FRONT_MELEE_CANCEL, 0)
                self.assertEqual(0x9A5 & FRONT_MELEE_CANCEL, FRONT_MELEE_CANCEL)
                self.assertTrue(_func_233_from_source(FRONT_MELEE_CANCEL, 0x7E, 0))

    def test_dir1_enter_redirects_front_melee_cancel_from_special(self) -> None:
        body = _strip_c_comments(_function_body(self.src2, "ACTION_B_MELEE_DIR_1"))
        self.assertRegex(
            body,
            r"global7\s*==\s*0xc805dc33\s*\|\|\s*global7\s*==\s*0x66eb879f",
        )
        self.assertIn("func_81(0x928ca34f, 0x1, 0x2, 0x1)", body)
        vanilla_at = body.find("func_488()")
        steal_at = body.find("func_81(0x928ca34f")
        self.assertGreater(vanilla_at, 0)
        self.assertGreater(vanilla_at, steal_at)

    def test_locked_loop_move_homes_on_lock_yaw_not_body_forward(self) -> None:
        body = _strip_c_comments(
            _function_body(self.src2, "rebellion_normal_special_n_bird_dash_locked_loop_move")
        )
        self.assertIn("sys_0(0x40000, 0x5)", body)
        self.assertIn("sys_46(0, global265)", body)
        self.assertIn("sys_46(0x1, 0x1, yaw, 0,", body)
        self.assertIn("peak = 0x1194", body)
        self.assertIn("home = 0x4b0", body)
        self.assertNotIn("sys_46(0x2, 0x3, 0, 0, 0x1)", body)
        self.assertNotIn("facing_ready", body)
        self.assertNotIn("func_102(global265, 0xf, 0x1)", body)
        self.assertNotIn("func_101(global265 - turn + yaw)", body)
        self.assertNotIn("arc = 0x7d0 * remain / 0xbb8", body)
        self.assertNotIn("arc = 0x2328 * remain / 0xbb8", body)
        self.assertNotIn("sys_0(0x40003, 0x6)", body)
        self.assertIn("orbit_side == 0x1", body)
        self.assertIn("orbit_side == 0x2", body)
        self.assertNotIn("func_516(", body)
        self.assertNotIn("global265 += arc", body)
        self.assertNotIn("func_102(global265, 0x64, 0)", body)
        enter = _strip_c_comments(
            _function_body(self.src2, "rebellion_enter_normal_special_n_bird_dash")
        )
        self.assertIn("global92 & 0x8", enter)
        self.assertIn("global92 & 0x10", enter)
        self.assertIn("global87 & 0x10", enter)
        self.assertIn("global87 & 0x20", enter)
        self.assertIn("global166 = 0", enter)
        self.assertIn("func_104(0, 0, 0)", enter)
        self.assertIn("global624 = 0x1", enter)
        self.assertIn("sys_46(0, global265)", enter)

    def test_dash_end_coasts_on_no_stick_instead_of_snap_stop(self) -> None:
        shoot = _strip_c_comments(
            _function_body(self.src2, "rebellion_normal_special_n_bird_dash_shoot")
        )
        end = _strip_c_comments(
            _function_body(self.src2, "rebellion_normal_special_n_bird_dash_end")
        )
        land = _strip_c_comments(
            _function_body(self.src2, "rebellion_dash_land_keep_move")
        )
        self.assertIn("elapsed >= 0xbb8", shoot)
        self.assertIn("global252 = 0x1", shoot)
        self.assertNotIn("0xfa0", shoot)
        # Inherit is the 677 channel: sys_46(0x1, 0x1) with func_296(1).
        # 296(0)+channel 0x2 is air-idle/jump, not dash leftover.
        self.assertIn("coast = rebellion_normal_special_n_bird_dash_speed", end)
        self.assertIn("rebellion_dash_untransform_keep_move()", end)
        self.assertNotIn("rebellion_dash_land_keep_move()", end)
        self.assertIn("func_296(0x3e8, 0x1)", end)
        self.assertIn("sys_46(0x1, 0x1, 0, 0xfffff830, global508)", end)
        self.assertIn("global508 = global508 * 0x5a / 0x64", end)
        self.assertNotIn("sys_46(0x1, 0x2,", end)
        self.assertNotIn("func_287(0x3ed)", end)
        self.assertNotIn("sys_46(0xf,", end)
        self.assertNotIn("func_81(0x77b100ff", end)
        self.assertNotIn("func_296(0x3e8, 0)", land)

    def test_0c_steals_dir1_hash_when_previous_action_was_special(self) -> None:
        code = _strip_c_comments(self.func_143)
        self.assertRegex(
            code,
            r"global8\s*==\s*0xa2236f44",
        )
        self.assertRegex(
            code,
            r"global7\s*==\s*0xc805dc33\s*\|\|\s*global7\s*==\s*0x66eb879f",
        )


if __name__ == "__main__":
    unittest.main()
