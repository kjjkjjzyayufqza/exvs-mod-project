"""Source contract for wing-only refresh on bird-form forced recovery."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


SRC_2C = Path(r"E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c")


def _function_body(source: str, name: str) -> str:
    match = re.search(rf"^void\s+{re.escape(name)}\s*\([^)]*\)\s*\{{", source, re.M)
    if not match:
        raise AssertionError(f"function not found: {name}")
    start = match.end() - 1
    depth = 0
    for index in range(start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]
    raise AssertionError(f"unterminated function: {name}")


class RebellionFlightInterruptWingRefreshTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = SRC_2C.read_text(encoding="utf-8", errors="replace")
        cls.body = _function_body(cls.source, "rebellion_interrupt_bird_form_to_ground")

    def test_forced_recovery_refreshes_wing_after_normal_shell(self) -> None:
        shell_at = self.body.find("rebellion_restore_normal_hand_weapons()")
        state_at = self.body.find("func_1025(0x2)")
        wing_at = self.body.find("sys_47(0x43, 0xf6c1a9c1)")
        self.assertGreater(shell_at, 0)
        self.assertGreater(state_at, shell_at)
        self.assertGreater(wing_at, state_at)

    def test_forced_recovery_does_not_play_body_plus_wing_exit_motion(self) -> None:
        code = re.sub(r"//.*?$", "", self.body, flags=re.M)
        self.assertNotIn("func_74(0x3b", code)


if __name__ == "__main__":
    unittest.main()
