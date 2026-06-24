import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from msc_core import Command, EXVS2_FORMAT, MscFile

REAL_SAMPLE_DIR = r"E:\XB\解包\com\file\040msc\0xFEEA714A"
TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUNC_HEADER_RE = re.compile(r"^(?:void|int|float|bool|string)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^\n]*\)\s*\{", re.M)
STABLE_FILES = ["0.bscex", "1.cscex"]
SYMBOLIZATION_ONLY_FUNCTIONS = {"func_167", "func_940", "func_941", "func_993"}
SYMBOLIZATION_ONLY_SCRIPT_INDICES = [167, 940, 941, 993]
SYMBOLIZATION_LITERAL = 0x186A0


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


def read_msc(path):
    msc = MscFile()
    with open(path, "rb") as f:
        msc.readFromFile(f, EXVS2_FORMAT)
    return msc


def script_has_literal(msc, script_index, literal):
    for cmd in msc.scripts[script_index].cmds:
        if isinstance(cmd, Command):
            for param in cmd.parameters:
                if isinstance(param, int) and param == literal:
                    return True
    return False


def semantic_roundtrip_text(path):
    decompile_result, c_path, log_path = decompile_to_temp(path)
    if decompile_result.returncode != 0:
        print(f"[FAIL] {os.path.basename(path)}: decompile failed")
        print((decompile_result.stderr or "")[-400:])
        for temp_path in (c_path, log_path):
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        return 1, None, None, None, None, None

    compile_result, rebuilt_path = compile_c_to_temp(c_path)
    if compile_result.returncode != 0:
        print(f"[FAIL] {os.path.basename(path)}: compile failed")
        print((compile_result.stderr or "")[-400:])
        for temp_path in (c_path, log_path, rebuilt_path):
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        return 1, None, None, None, None, None

    rebuilt_decompile_result, rebuilt_c_path, rebuilt_log_path = decompile_to_temp(rebuilt_path)
    if rebuilt_decompile_result.returncode != 0:
        print(f"[FAIL] {os.path.basename(path)}: redecompile failed")
        print((rebuilt_decompile_result.stderr or "")[-400:])
        for temp_path in (c_path, log_path, rebuilt_path, rebuilt_c_path, rebuilt_log_path):
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        return 1, None, None, None, None, None

    return 0, c_path, log_path, rebuilt_path, rebuilt_c_path, rebuilt_log_path


def test_stable_files():
    failures = 0
    for name in STABLE_FILES:
        path = os.path.join(REAL_SAMPLE_DIR, name)
        if not os.path.exists(path):
            print(f"[SKIP] {name}: real sample file not found")
            continue
        status, c_path, log_path, rebuilt_path, rebuilt_c_path, rebuilt_log_path = semantic_roundtrip_text(path)
        if status != 0:
            failures += 1
            continue
        try:
            original_text = read_text(c_path)
            rebuilt_text = read_text(rebuilt_c_path)
            if original_text == rebuilt_text:
                print(f"[OK] {name}: semantic redecompile text identical")
            else:
                print(f"[FAIL] {name}: semantic redecompile text changed")
                failures += 1
        finally:
            for temp_path in (c_path, log_path, rebuilt_path, rebuilt_c_path, rebuilt_log_path):
                if temp_path and os.path.exists(temp_path):
                    os.unlink(temp_path)
    return failures


def test_script2_symbolization_only_drift():
    path = os.path.join(REAL_SAMPLE_DIR, "2.dscex")
    if not os.path.exists(path):
        print("[SKIP] 2.dscex: real sample file not found")
        return 0

    status, c_path, log_path, rebuilt_path, rebuilt_c_path, rebuilt_log_path = semantic_roundtrip_text(path)
    if status != 0:
        return 1

    try:
        original_text = read_text(c_path)
        rebuilt_text = read_text(rebuilt_c_path)
        original_functions = extract_functions(original_text)
        rebuilt_functions = extract_functions(rebuilt_text)
        differing = {
            name
            for name in original_functions
            if name in rebuilt_functions and original_functions[name] != rebuilt_functions[name]
        }

        if differing != SYMBOLIZATION_ONLY_FUNCTIONS:
            print(f"[FAIL] 2.dscex: unexpected differing functions {sorted(differing)}")
            return 1
        print(f"[OK] 2.dscex: only expected symbolization-only functions differ")

        for stable_name in ("func_274", "func_648"):
            if original_functions[stable_name] != rebuilt_functions[stable_name]:
                print(f"[FAIL] 2.dscex: {stable_name} still changed semantically")
                return 1
        print("[OK] 2.dscex: func_274 and func_648 semantic regressions are fixed")

        for func_name in sorted(SYMBOLIZATION_ONLY_FUNCTIONS):
            normalized_rebuilt = re.sub(r"\bfunc_487\b", "0x186a0", rebuilt_functions[func_name])
            if original_functions[func_name] != normalized_rebuilt:
                print(f"[FAIL] 2.dscex: {func_name} drift is not symbolization-only")
                return 1
        print("[OK] 2.dscex: residual text drift is limited to func_487 symbolization")

        original_msc = read_msc(path)
        rebuilt_msc = read_msc(rebuilt_path)
        for script_index in SYMBOLIZATION_ONLY_SCRIPT_INDICES:
            if not script_has_literal(original_msc, script_index, SYMBOLIZATION_LITERAL):
                print(f"[FAIL] 2.dscex: original script {script_index} lost literal {SYMBOLIZATION_LITERAL:#x}")
                return 1
            if not script_has_literal(rebuilt_msc, script_index, SYMBOLIZATION_LITERAL):
                print(f"[FAIL] 2.dscex: rebuilt script {script_index} lost literal {SYMBOLIZATION_LITERAL:#x}")
                return 1
        print("[OK] 2.dscex: residual drift keeps raw 0x186a0 immediates intact")
        return 0
    finally:
        for temp_path in (c_path, log_path, rebuilt_path, rebuilt_c_path, rebuilt_log_path):
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)


if __name__ == "__main__":
    failures = 0
    failures += test_stable_files()
    failures += test_script2_symbolization_only_drift()

    print("\n===== RESULT =====")
    if failures == 0:
        print("ALL TESTS PASSED")
    else:
        print(f"{failures} test(s) FAILED")
    sys.exit(1 if failures else 0)
