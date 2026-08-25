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
ANALOG_FORWARD = 0x4


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
            r"global8\s*==\s*0xc805dc33\s*\|\|\s*global8\s*==\s*0x66eb879f\s*\)\s*&&\s*\(\s*global48\s*&\s*0x42\s*\)",
        )
        self.assertNotIn("global4 & 0x7e", code)
        self.assertIn("func_95(0x928ca34f, 0x1, 0x2, 0x1)", code)
        packed_forward_melee = 0x80000040
        packed_analog_forward = 0x80000004
        self.assertTrue(packed_forward_melee & 0x42)
        self.assertFalse(packed_analog_forward & 0x42)
        dash_at = code.find("global48 & 0x42")
        variant_at = code.find("else if (global48 & 0x40)")
        self.assertGreater(dash_at, 0)
        self.assertGreater(variant_at, dash_at)

    def test_analog_forward_alone_is_not_melee_cancel(self) -> None:
        want, exclude = _parse_func_233_call(self.func_933)
        code933 = _strip_c_comments(self.func_933)
        self.assertNotIn("global48 & 0x7e", code933)
        self.assertTrue(_func_233_from_source(0x40, want, exclude))
        self.assertTrue(_func_233_from_source(N_MELEE, want, exclude))


if __name__ == "__main__":
    unittest.main()
