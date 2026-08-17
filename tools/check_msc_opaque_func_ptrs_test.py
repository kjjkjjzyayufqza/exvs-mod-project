"""Unit tests for check_msc_opaque_func_ptrs (stdlib unittest)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from check_msc_opaque_func_ptrs import (
    KNOWN_THINKER_OFFSETS,
    check_file,
    fix_file,
    main,
)


class CheckMscOpaqueFuncPtrsTest(unittest.TestCase):
    def _write(self, body: str) -> Path:
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        path = Path(td.name) / "0.c"
        path.write_text(body, encoding="utf-8")
        return path

    def test_symbol_thinker_ok(self) -> None:
        path = self._write(
            """
void func_92()
{
    sys_1(0x10001, 0, 0x1, func_143);
}
"""
        )
        self.assertEqual(check_file(path), [])

    def test_opaque_5fef_is_error(self) -> None:
        path = self._write(
            """
void func_92()
{
    sys_1(0x10001, 0, 0x1, 0x5fef);
}
"""
        )
        findings = check_file(path)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].kind, "error")
        self.assertIn("0x5fef", findings[0].raw_arg.lower() + findings[0].message.lower())

    def test_known_offset_table(self) -> None:
        self.assertEqual(KNOWN_THINKER_OFFSETS[0x5FEF], "func_143")
        self.assertEqual(KNOWN_THINKER_OFFSETS[0x6005], "func_143")

    def test_fix_rewrites_without_write(self) -> None:
        path = self._write(
            """
void func_92()
{
    sys_1(0x10001, 0, 0x1, 0x5fef);
}
"""
        )
        new_text, n = fix_file(path, write=False)
        self.assertEqual(n, 1)
        self.assertIn("func_143", new_text)
        self.assertNotIn("0x5fef", new_text)
        # disk unchanged
        self.assertIn("0x5fef", path.read_text(encoding="utf-8"))

    def test_fix_write(self) -> None:
        path = self._write(
            """
void func_92()
{
    sys_1(0x10001, 0, 0x1, 0x5FEF);
}
"""
        )
        _, n = fix_file(path, write=True)
        self.assertEqual(n, 1)
        text = path.read_text(encoding="utf-8")
        self.assertIn("func_143", text)
        self.assertEqual(check_file(path), [])

    def test_cli_fail_on_opaque(self) -> None:
        path = self._write("sys_1(0x10001, 0, 0x1, 0x5fef);\n")
        rc = main([str(path)])
        self.assertEqual(rc, 1)

    def test_cli_ok_on_symbol(self) -> None:
        path = self._write("sys_1(0x10001, 0, 0x1, func_143);\n")
        rc = main([str(path)])
        self.assertEqual(rc, 0)

    def test_comment_ignored(self) -> None:
        path = self._write(
            """
// sys_1(0x10001, 0, 0x1, 0x5fef);
sys_1(0x10001, 0, 0x1, func_143);
"""
        )
        self.assertEqual(check_file(path), [])


if __name__ == "__main__":
    unittest.main()
