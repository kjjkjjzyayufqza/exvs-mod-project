import sys
import unittest
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parents[1]
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from mscdec import generate_switch_case_function


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


if __name__ == "__main__":
    unittest.main()
