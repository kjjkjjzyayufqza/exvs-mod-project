import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
MSCDEC = TOOLS_DIR / "mscdec.py"
REGRESSION_FIXTURES = {
    "missing grouped condition": Path(
        r"E:\XB\mod\040msc\unit_514709001\2.dscex"
    ),
    "missing grouped condition demicc": Path(
        r"E:\XB\mod\040msc\766suisei_001demicc_001_73b8d56b\2.dscex"
    ),
    "missing grouped condition reginlaze": Path(
        r"E:\XB\mod\040msc\749orphn2_005rgnjla_001_1e55465d\2.dscex"
    ),
    "missing grouped condition ginn": Path(
        r"E:\XB\mod\040msc\720gnseed_001ginn00_001_3bd48790\2.dscex"
    ),
    "missing grouped condition aegis": Path(
        r"E:\XB\mod\040msc\520gnseed_012aegis0_001\2.dscex"
    ),
    "nested loop push state": Path(
        r"E:\XB\mod\040msc\025gigloo_002hildol_001\2.dscex"
    ),
    "missing grouped condition maxter": Path(
        r"E:\XB\mod\040msc\018ggundm_008maxter_001_019eace6\2.dscex"
    ),
    "missing grouped condition sinanju": Path(
        r"E:\XB\mod\040msc\015gndmuc_003sinanj_001_54a08a2d\2.dscex"
    ),
    "missing grouped condition the-o": Path(
        r"E:\XB\mod\040msc\014gndm00_019theins_001_109b55e4\2.dscex"
    ),
    "missing grouped condition reborns": Path(
        r"E:\XB\mod\040msc\014gndm00_007rebons_001_4c0c99be\2.dscex"
    ),
    "recursive path explosion": Path(
        r"E:\XB\mod\040msc\014gndm00_007rebons_001\2.dscex"
    ),
    "nested loop push state bertigo": Path(
        r"E:\XB\mod\040msc\007gundmx_006bertig_001\2.dscex"
    ),
}


class MscdecLogRegressionTests(unittest.TestCase):
    def test_log_regression_samples_decompile_with_nonempty_function_bodies(self):
        missing = [
            str(fixture)
            for fixture in REGRESSION_FIXTURES.values()
            if not fixture.exists()
        ]
        self.assertFalse(missing, f"Missing regression fixtures: {missing}")

        with tempfile.TemporaryDirectory(prefix="mscdec_log_regressions_") as tmp_dir:
            tmp = Path(tmp_dir)
            for case_name, fixture in REGRESSION_FIXTURES.items():
                with self.subTest(case=case_name):
                    output_path = tmp / f"{fixture.parent.name}.c"
                    log_path = tmp / f"{fixture.parent.name}.log"
                    env = os.environ.copy()
                    env["PYTHONDONTWRITEBYTECODE"] = "1"
                    result = subprocess.run(
                        [
                            sys.executable,
                            str(MSCDEC),
                            str(fixture),
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

                    self.assertEqual(
                        result.returncode,
                        0,
                        f"{case_name} failed:\n{result.stderr[-4000:]}",
                    )
                    output = output_path.read_text(encoding="utf-8")
                    self.assertGreater(
                        output.count("sys_"),
                        100,
                        f"{case_name} produced suspiciously empty C output",
                    )


if __name__ == "__main__":
    unittest.main()
