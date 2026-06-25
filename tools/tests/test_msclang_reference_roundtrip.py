import os
import subprocess
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOLS_DIR = REPO_ROOT / "tools"
REFERENCE_DSCE = Path(r"E:\XB\解包\com\file\040msc\0x18AF7533\2.dscex")


def run_tool(args, cwd=REPO_ROOT):
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    result = subprocess.run(
        [sys.executable, *map(str, args)],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stdout[-2000:])
        print(result.stderr[-2000:])
    return result


def assert_clean_result(result, label):
    if result.returncode != 0:
        raise AssertionError(f"{label} failed with exit code {result.returncode}")


def first_diff_line(left_text, right_text):
    left_lines = left_text.splitlines()
    right_lines = right_text.splitlines()
    for index, (left, right) in enumerate(zip(left_lines, right_lines), start=1):
        if left != right:
            return index, left, right
    if len(left_lines) != len(right_lines):
        index = min(len(left_lines), len(right_lines)) + 1
        left = left_lines[index - 1] if index <= len(left_lines) else "<missing>"
        right = right_lines[index - 1] if index <= len(right_lines) else "<missing>"
        return index, left, right
    return None


def test_reference_2_dscex_text_roundtrip_is_exact():
    if not REFERENCE_DSCE.exists():
        raise AssertionError(f"Missing reference sample: {REFERENCE_DSCE}")

    with tempfile.TemporaryDirectory(prefix="msc_reference_roundtrip_") as tmp_dir:
        tmp = Path(tmp_dir)
        baseline_c = tmp / "2.c"
        repacked = tmp / "moded2.dscex"
        roundtrip_c = tmp / "moded2.c"

        assert_clean_result(
            run_tool(
                [
                    TOOLS_DIR / "mscdec.py",
                    REFERENCE_DSCE,
                    "-o",
                    baseline_c,
                    "-c",
                    "-log",
                    tmp / "baseline.log",
                ]
            ),
            "baseline decompile",
        )
        assert_clean_result(
            run_tool(
                [
                    TOOLS_DIR / "msclang.py",
                    baseline_c,
                    "-o",
                    repacked,
                    "-i",
                ]
            ),
            "repack",
        )
        assert_clean_result(
            run_tool(
                [
                    TOOLS_DIR / "mscdec.py",
                    repacked,
                    "-o",
                    roundtrip_c,
                    "-c",
                    "-log",
                    tmp / "roundtrip.log",
                ]
            ),
            "roundtrip decompile",
        )

        baseline_text = baseline_c.read_text(encoding="utf-8")
        roundtrip_text = roundtrip_c.read_text(encoding="utf-8")
        if baseline_text != roundtrip_text:
            diff = first_diff_line(baseline_text, roundtrip_text)
            if diff is None:
                raise AssertionError("Roundtrip text differs but no line diff was found")
            line_number, left, right = diff
            raise AssertionError(
                "0x18AF7533 2.dscex text roundtrip changed "
                f"at line {line_number}:\n"
                f"baseline: {left}\n"
                f"roundtrip: {right}"
            )


if __name__ == "__main__":
    test_reference_2_dscex_text_roundtrip_is_exact()
    print("PASS")
