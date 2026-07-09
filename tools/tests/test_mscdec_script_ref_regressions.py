import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
MSCDEC = TOOLS_DIR / "mscdec.py"

RX78_SCRIPT0 = Path(r"E:\XB\mod\040msc\001gundam_001gundam_001\0.bscex")
DOM_SCRIPT2 = Path(r"E:\XB\mod\040msc\001gundam_017dom000_001_0473be5c\2.dscex")


def decompile_to_text(input_path, output_path, log_path):
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    result = subprocess.run(
        [
            sys.executable,
            str(MSCDEC),
            str(input_path),
            "-o",
            str(output_path),
            "-log",
            str(log_path),
        ],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise AssertionError(
            f"mscdec failed for {input_path}:\n{result.stdout[-2000:]}\n{result.stderr[-2000:]}"
        )
    return output_path.read_text(encoding="utf-8")


class MscdecScriptRefRegressionTests(unittest.TestCase):
    def test_rx78_script0_keeps_offset_shaped_data_literal(self):
        if not RX78_SCRIPT0.exists():
            raise AssertionError(f"Missing regression fixture: {RX78_SCRIPT0}")

        with tempfile.TemporaryDirectory(prefix="mscdec_rx78_script0_") as tmp_dir:
            tmp = Path(tmp_dir)
            text = decompile_to_text(
                RX78_SCRIPT0,
                tmp / "0.c",
                tmp / "0.log",
            )

        self.assertIn("arg0 = 0x10;", text)
        self.assertNotIn("arg0 = func_0;", text)

    def test_rx78_script0_resolves_action_selector_callbacks_via_sys1_signature(self):
        if not RX78_SCRIPT0.exists():
            raise AssertionError(f"Missing regression fixture: {RX78_SCRIPT0}")

        with tempfile.TemporaryDirectory(prefix="mscdec_rx78_action_selector_") as tmp_dir:
            tmp = Path(tmp_dir)
            text = decompile_to_text(
                RX78_SCRIPT0,
                tmp / "0.c",
                tmp / "0.log",
            )

        self.assertIn("func_83(0x1, func_15);", text)
        self.assertIn("func_83(0x10, func_30);", text)
        self.assertNotIn("func_83(0x1, 0x13dc);", text)

    def test_dom_script2_resolves_action_dispatch_fallback_callback(self):
        if not DOM_SCRIPT2.exists():
            raise AssertionError(f"Missing regression fixture: {DOM_SCRIPT2}")

        with tempfile.TemporaryDirectory(prefix="mscdec_dom_script2_") as tmp_dir:
            tmp = Path(tmp_dir)
            text = decompile_to_text(
                DOM_SCRIPT2,
                tmp / "2.c",
                tmp / "2.log",
            )

        self.assertIn("var1 = func_45;", text)
        self.assertIn("sys_2(0, 0x2, var1);", text)
        self.assertNotIn("var1 = 0x4438;", text)


if __name__ == "__main__":
    unittest.main()
