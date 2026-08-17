import sys
import tempfile
import unittest
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parents[1]
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from mscdec import (
    DecompilerError,
    generate_switch_case_function,
    handle_sys_1_0x10001_0x10_var1_pointer_funcs,
    is_new_external_action_msc,
)


class MscdecSwitchPostprocessTests(unittest.TestCase):
    def test_generated_switch_function_closes_function_body(self):
        source = generate_switch_case_function(
            "func_985",
            [
                ("1", "func_100"),
                ("2", "func_101"),
                ("3", "func_102"),
                ("4", "func_103"),
                ("5", "func_104"),
            ],
        )

        self.assertEqual(source.count("{"), source.count("}"))
        self.assertTrue(source.endswith("}\n"))

    def test_new_action_resolver_becomes_balanced_switch_with_function_refs(self):
        source = """void func_10()
{
    sys_1(0x10001, 0x10, var1, func_20(func_30(var1, 0x2)));
}

int func_20(int arg0)
{
    int var1;
    if (0x50 == arg0)
    {
        var1 = 0x4d0;
    }
    else if (0x40 == arg0)
    {
        var1 = 0x3d0;
    }
    else if (0x30 == arg0)
    {
        var1 = 0x2d0;
    }
    else if (0x20 == arg0)
    {
        var1 = 0x1d0;
    }
    else if (0x10 == arg0)
    {
        var1 = 0xd0;
    }
    else
    {
        var1 = 0;
    }
    return var1;
}

void func_21()
{
}
"""
        log = """[func_name: func_100, pointer: 256]
[func_name: func_101, pointer: 512]
[func_name: func_102, pointer: 768]
[func_name: func_103, pointer: 1024]
[func_name: func_104, pointer: 1280]
"""

        with tempfile.TemporaryDirectory(prefix="mscdec_switch_") as tmp_dir:
            tmp = Path(tmp_dir)
            source_path = tmp / "2.c"
            log_path = tmp / "2.log"
            source_path.write_text(source, encoding="utf-8")
            log_path.write_text(log, encoding="utf-8")

            handle_sys_1_0x10001_0x10_var1_pointer_funcs(source_path, log_path)
            result = source_path.read_text(encoding="utf-8")

        self.assertIn("switch(arg0)", result)
        self.assertIn("case 0x10:", result)
        self.assertIn("var1 = func_100;", result)
        self.assertIn("var1 = func_104;", result)
        self.assertNotIn("var1 = 0xd0;", result)
        self.assertNotIn("var1 = 0x4d0;", result)
        self.assertEqual(result.count("{"), result.count("}"))
        self.assertIn("void func_21()", result)

    def test_new_external_action_msc_requires_both_structural_markers(self):
        external_table = "var3 = sys_0(0x700000, 0, var1, 0xa);\n"
        dispatcher = "sys_1(0x10001, 0x10, var1, func_20(var3));\n"

        with tempfile.TemporaryDirectory(prefix="mscdec_detect_") as tmp_dir:
            source_path = Path(tmp_dir) / "2.c"
            source_path.write_text(external_table + dispatcher, encoding="utf-8")
            self.assertTrue(is_new_external_action_msc(source_path))

            source_path.write_text(external_table, encoding="utf-8")
            self.assertFalse(is_new_external_action_msc(source_path))

    def test_new_action_resolver_rejects_unresolved_script_pointer(self):
        source = """void func_10()
{
    sys_1(0x10001, 0x10, var1, func_20(func_30(var1, 0x2)));
}

int func_20(int arg0)
{
    int var1;
    if (0x10 == arg0)
    {
        var1 = 0xd0;
    }
    return var1;
}
"""

        with tempfile.TemporaryDirectory(prefix="mscdec_unresolved_") as tmp_dir:
            tmp = Path(tmp_dir)
            source_path = tmp / "2.c"
            log_path = tmp / "2.log"
            source_path.write_text(source, encoding="utf-8")
            log_path.write_text("", encoding="utf-8")

            with self.assertRaisesRegex(DecompilerError, "0xd0"):
                handle_sys_1_0x10001_0x10_var1_pointer_funcs(source_path, log_path)

            self.assertEqual(source_path.read_text(encoding="utf-8"), source)


if __name__ == "__main__":
    unittest.main()
