import difflib
import os
import re
import subprocess
import sys
import tempfile

TEST_DIR = r"E:\XB\解包\com\file\0xBDBE6FEA_test"
TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET_FILE = "2.dscex"
TARGET_SCRIPT_INDICES = [283, 648, 1036]
FUNC_HEADER_RE = re.compile(r"^(?:void|int|float|bool|string)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^\n]*\)\s*\{", re.M)


def compile_c_to_temp(c_path):
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        out_path = tmp.name
    result = subprocess.run(
        [sys.executable, os.path.join(TOOLS_DIR, "msclang.py"), c_path, "-o", out_path, "-i"],
        capture_output=True,
        text=True,
        cwd=TOOLS_DIR,
        timeout=120,
    )
    return result, out_path


def decompile_to_temp(original_path):
    with tempfile.NamedTemporaryFile(suffix=".c", delete=False) as tmp_c:
        c_path = tmp_c.name
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp_log:
        log_path = tmp_log.name

    result = subprocess.run(
        [sys.executable, os.path.join(TOOLS_DIR, "mscdec.py"), original_path, "-o", c_path, "-log", log_path],
        capture_output=True,
        text=True,
        cwd=TOOLS_DIR,
        timeout=120,
    )
    return result, c_path, log_path


def read_text(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read().replace("\r\n", "\n")


def extract_functions(text):
    functions = {}
    matches = list(FUNC_HEADER_RE.finditer(text))
    for match in matches:
        name = match.group(1)
        start = match.start()
        brace = text.find("{", match.end() - 1)
        depth = 0
        end = len(text)
        i = brace
        while i < len(text):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
            i += 1
        functions[name] = text[start:end]
    return functions


def format_diff(original_body, rebuilt_body, limit=10):
    lines = []
    for line in difflib.unified_diff(original_body.splitlines(), rebuilt_body.splitlines(), n=1):
        if line.startswith(("---", "+++", "@@")):
            continue
        lines.append(line)
        if len(lines) >= limit:
            break
    return lines


def test_target_script_semantics():
    original_path = os.path.join(TEST_DIR, TARGET_FILE)
    decompile_result, c_path, log_path = decompile_to_temp(original_path)
    if decompile_result.returncode != 0:
        print("[FAIL] decompile failed")
        print((decompile_result.stderr or "")[-500:])
        for temp_path in (c_path, log_path):
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        return 1

    result, compiled_path = compile_c_to_temp(c_path)
    if result.returncode != 0:
        print("[FAIL] compile failed")
        print((result.stderr or "")[-500:])
        for temp_path in (c_path, log_path, compiled_path):
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        return 1

    try:
        rebuilt_decompile_result, rebuilt_c_path, rebuilt_log_path = decompile_to_temp(compiled_path)
        if rebuilt_decompile_result.returncode != 0:
            print("[FAIL] redecompile failed")
            print((rebuilt_decompile_result.stderr or "")[-500:])
            return 1

        original_functions = extract_functions(read_text(c_path))
        rebuilt_functions = extract_functions(read_text(rebuilt_c_path))
        failures = 0
        for index in TARGET_SCRIPT_INDICES:
            func_name = f"func_{index}"
            if func_name not in original_functions:
                print(f"[FAIL] {func_name}: missing from original decompile")
                failures += 1
                continue
            if func_name not in rebuilt_functions:
                print(f"[FAIL] {func_name}: missing from rebuilt decompile")
                failures += 1
                continue

            original_body = original_functions[func_name]
            rebuilt_body = rebuilt_functions[func_name]
            if original_body == rebuilt_body:
                print(f"[OK] {func_name}: semantic round-trip stable")
                continue

            print(f"[FAIL] {func_name}: semantic round-trip changed")
            for line in format_diff(original_body, rebuilt_body):
                print(f"       {line}")
            failures += 1
        return failures
    finally:
        for temp_path in (c_path, log_path, compiled_path):
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        if "rebuilt_c_path" in locals():
            for temp_path in (rebuilt_c_path, rebuilt_log_path):
                if os.path.exists(temp_path):
                    os.unlink(temp_path)


if __name__ == "__main__":
    failure_count = test_target_script_semantics()
    print("\n===== RESULT =====")
    if failure_count == 0:
        print("ALL TESTS PASSED")
    else:
        print(f"{failure_count} test(s) FAILED")
    sys.exit(1 if failure_count else 0)
