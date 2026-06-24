import os
import subprocess
import sys
import tempfile


TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_DIR = r"E:\XB\解包\com\file\0xBDBE6FEA_test"
TARGET_FILE = "2.dscex"
TARGET_FUNC_HEADER = "void func_1036()"


def extract_function_block(source_text, func_header):
    start = source_text.find(func_header)
    if start == -1:
        raise AssertionError(f"Function header not found: {func_header}")

    brace_start = source_text.find("{", start)
    if brace_start == -1:
        raise AssertionError(f"Opening brace not found for: {func_header}")

    depth = 0
    for index in range(brace_start, len(source_text)):
        ch = source_text[index]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return source_text[start : index + 1]

    raise AssertionError(f"Closing brace not found for: {func_header}")


def decompile_to_temp(input_path):
    with tempfile.NamedTemporaryFile(suffix=".c", delete=False) as tmp_c:
        c_path = tmp_c.name
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp_log:
        log_path = tmp_log.name

    result = subprocess.run(
        [sys.executable, os.path.join(TOOLS_DIR, "mscdec.py"), input_path, "-o", c_path, "-log", log_path],
        capture_output=True,
        text=True,
        cwd=TOOLS_DIR,
        timeout=120,
    )
    return result, c_path, log_path


def run_func_1036_decompile_shape():
    input_path = os.path.join(TEST_DIR, TARGET_FILE)
    if not os.path.exists(input_path):
        print(f"[SKIP] target file not found: {input_path}")
        return 0

    result, c_path, log_path = decompile_to_temp(input_path)

    if result.returncode != 0:
        print("[FAIL] decompile failed")
        print((result.stderr or "")[-500:])
        return 1

    try:
        with open(c_path, "r", encoding="utf-8") as f:
            content = f.read()

        block = extract_function_block(content, TARGET_FUNC_HEADER)

        expected_if = "if (func_309(global20, func_248() * 0x64))"
        expected_call = "func_123(0x3bf);"
        bad_standalone = "    func_309(global20, func_248() * 0x64);"
        preceding_statement = "sys_58(0x9, 0xc017d7c3);"
        trailing_if = "if (func_91())"

        failures = 0

        if expected_if not in block:
            print(f"[FAIL] missing expected guarded call: {expected_if}")
            failures += 1
        else:
            print("[OK] func_1036 contains guarded func_309 condition")

        if expected_call not in block:
            print(f"[FAIL] missing expected side-effect call: {expected_call}")
            failures += 1
        else:
            print("[OK] func_1036 contains func_123 side-effect in guarded block")

        if bad_standalone in block:
            print(f"[FAIL] found bad standalone call: {bad_standalone.strip()}")
            failures += 1
        else:
            print("[OK] func_1036 does not emit standalone discarded func_309 call")

        func_309_count = block.count("func_309(")
        if func_309_count != 1:
            print(f"[FAIL] func_1036 emits func_309 {func_309_count} times, expected 1")
            failures += 1
        else:
            print("[OK] func_1036 emits func_309 exactly once")

        func_123_count = block.count(expected_call)
        if func_123_count != 1:
            print(f"[FAIL] func_1036 emits func_123 guard call {func_123_count} times, expected 1")
            failures += 1
        else:
            print("[OK] func_1036 emits func_123 guard call exactly once")

        if expected_if in block and preceding_statement in block and trailing_if in block:
            if not (block.index(preceding_statement) < block.index(expected_if) < block.index(trailing_if)):
                print("[FAIL] func_1036 guarded func_309 block appears in the wrong relative order")
                failures += 1
            else:
                print("[OK] func_1036 guarded func_309 block stays between the surrounding original blocks")

        return failures
    finally:
        for temp_path in (c_path, log_path):
            if os.path.exists(temp_path):
                os.unlink(temp_path)


def test_func_1036_decompile_shape():
    failures = run_func_1036_decompile_shape()
    assert failures == 0, f"{failures} test(s) FAILED"


if __name__ == "__main__":
    try:
        test_func_1036_decompile_shape()
        failure_count = 0
    except AssertionError as exc:
        print(exc)
        failure_count = 1
    print("\n===== RESULT =====")
    if failure_count == 0:
        print("ALL TESTS PASSED")
    else:
        print("TEST FAILED")
    sys.exit(1 if failure_count else 0)
