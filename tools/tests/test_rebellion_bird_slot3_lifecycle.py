import re
import unittest
from pathlib import Path


MSC = Path(r"E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc")
SRC_2C = MSC / "2.c"


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
    return re.sub(r"//.*", "", text)


class RebellionBirdSlot3LifecycleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        source = _read(SRC_2C)
        cls.install = _strip_c_comments(
            _function_body(source, "rebellion_install_bird_weapon_bar")
        )
        cls.restore = _strip_c_comments(
            _function_body(source, "rebellion_restore_normal_hand_weapons")
        )
        cls.tick = _strip_c_comments(_function_body(source, "func_879"))
        cls.land = _strip_c_comments(_function_body(source, "func_876"))
        cls.respawn = _strip_c_comments(_function_body(source, "func_874"))

    def test_bird_enter_unbinds_slot3_without_availability_flag(self) -> None:
        self.assertIn("sys_4F(0xb, 0x3, 0);", self.install)
        self.assertIn("global770 = 0;", self.install)
        self.assertNotIn("sys_4F(0x16, 0x3, 0);", self.install)
        self.assertNotIn("sys_4F(0x16, 0x3, 0x1);", self.install)
        self.assertIn("sys_4F(0xb, 0, 0x77a3426b, 0x750b4b8e, 0x4);", self.install)

    def test_bird_form_skips_flying_ex_bindslot_and_keeps_wing_tick(self) -> None:
        gate = "if (global143 != 0x2)"
        self.assertIn(gate, self.tick)
        self.assertNotIn("sys_4F(0x16, 0x3, 0);", self.tick)
        self.assertLess(self.tick.index(gate), self.tick.index("func_1034(0x3);"))
        self.assertLess(self.tick.index("func_1034(0x3);"), self.tick.index("func_314(0xf6c1a9c1);"))
        self.assertIn("func_314(0xf6c1a9c1);", self.tick)

    def test_normal_exit_rebinds_flying_and_repauses_if_waiting_for_land(self) -> None:
        self.assertNotIn("sys_4F(0x16, 0x3, 0x1);", self.restore)
        self.assertIn("sys_4F(0xb, 0x3, 0xfa64e4d0);", self.restore)
        self.assertIn("if (global772 == 0x1)", self.restore)
        self.assertIn("sys_4F(0x15, 0x3, 0);", self.restore)
        self.assertIn("global770 = 0;", self.restore)

    def test_land_reload_gate_and_respawn_do_not_touch_slot3_availability(self) -> None:
        self.assertIn("sys_4F(0x15, 0x3, 0x1);", self.land)
        self.assertIn("func_1034(0);", self.respawn)
        self.assertNotIn("sys_4F(0x16, 0x3, 0x1);", self.respawn)
        self.assertNotIn("sys_4F(0x16, 0x3, 0);", self.respawn)


if __name__ == "__main__":
    unittest.main()
