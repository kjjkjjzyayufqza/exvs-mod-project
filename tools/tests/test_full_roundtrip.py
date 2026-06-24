import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TEST_DIR = r'E:\XB\解包\com\file\0xBDBE6FEA_test'
TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUNC_HEADER_RE = re.compile(r'^(?:void|int|float|bool|string)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^\n]*\)\s*\{', re.M)

TEST_CASES = [
    {
        'original': '1.cscex',
        'roundtrip': True,
    },
    {
        'original': '0.bscex',
        'roundtrip': False,
    },
    {
        'original': '2.dscex',
        'roundtrip': True,
    },
]


def compare_bytes(data_a, data_b, label):
    if data_a == data_b:
        print(f'  [OK] {label}: IDENTICAL ({len(data_a)} bytes)')
        return 0

    size_diff = len(data_b) - len(data_a)
    min_len = min(len(data_a), len(data_b))
    diffs = sum(1 for i in range(min_len) if data_a[i] != data_b[i])
    total = diffs + abs(size_diff)
    print(f'  [INFO] {label}: binary differs ({diffs} byte diffs, size diff={size_diff})')
    shown = 0
    for i in range(min_len):
        if data_a[i] != data_b[i]:
            if shown < 5:
                print(f'    offset {i:#06x}: orig={data_a[i]:#04x} new={data_b[i]:#04x}')
            shown += 1
    if shown > 5:
        print(f'    ... and {shown - 5} more')
    return total


def test_core_read_write():
    from msc_core import MscFile, EXVS2_FORMAT, SCRIPT_BASE

    print('\n=== Phase 1: msc_core.py read/write round-trip ===')
    total_fail = 0

    for tc in TEST_CASES:
        path = os.path.join(TEST_DIR, tc['original'])
        with open(path, 'rb') as f:
            original_bytes = f.read()

        msc = MscFile()
        with open(path, 'rb') as f:
            msc.readFromFile(f, EXVS2_FORMAT)

        cmd_count = sum(len(s.cmds) for s in msc.scripts)
        mismatch = 0
        for script in msc.scripts:
            for cmd in script.cmds:
                written = cmd.write('>')
                abs_pos = cmd.commandPosition + SCRIPT_BASE
                orig_slice = original_bytes[abs_pos:abs_pos + len(written)]
                if written != orig_slice:
                    mismatch += 1

        if mismatch == 0:
            print(f'  [OK] {tc["original"]}: {cmd_count} commands round-trip OK')
        else:
            print(f'  [FAIL] {tc["original"]}: {mismatch}/{cmd_count} commands differ')
            total_fail += 1

    return total_fail


def decompile_to_temp(orig_path):
    with tempfile.NamedTemporaryFile(suffix='.c', delete=False) as tmp_c:
        c_path = tmp_c.name
    with tempfile.NamedTemporaryFile(suffix='.txt', delete=False) as tmp_log:
        log_path = tmp_log.name

    result = subprocess.run(
        [sys.executable, os.path.join(TOOLS_DIR, 'mscdec.py'),
         orig_path, '-o', c_path, '-log', log_path],
        capture_output=True, text=True, cwd=TOOLS_DIR, timeout=120
    )
    return result, c_path, log_path


def compile_c_to_temp(c_path):
    with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as tmp:
        out_path = tmp.name

    result = subprocess.run(
        [sys.executable, os.path.join(TOOLS_DIR, 'msclang.py'),
         c_path, '-o', out_path, '-i'],
        capture_output=True, text=True, cwd=TOOLS_DIR, timeout=120
    )
    return result, out_path


def read_text(path):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        return f.read().replace('\r\n', '\n')


def extract_functions(text):
    functions = {}
    matches = list(FUNC_HEADER_RE.finditer(text))
    for match in matches:
        name = match.group(1)
        start = match.start()
        brace = text.find('{', match.end() - 1)
        depth = 0
        end = len(text)
        i = brace
        while i < len(text):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
            i += 1
        functions[name] = text[start:end]
    return functions


def compare_semantic_text(path_a, path_b, label):
    text_a = read_text(path_a)
    text_b = read_text(path_b)
    if text_a == text_b:
        print(f'  [OK] {label}: semantic redecompile stable')
        return 0

    funcs_a = extract_functions(text_a)
    funcs_b = extract_functions(text_b)
    differing = [name for name in funcs_a if name in funcs_b and funcs_a[name] != funcs_b[name]]
    missing = [name for name in funcs_a if name not in funcs_b]
    extras = [name for name in funcs_b if name not in funcs_a]
    print(f'  [FAIL] {label}: semantic redecompile drift')
    print(f'    differing functions: {len(differing)}')
    if differing:
        print(f'    first differing function: {differing[0]}')
    if missing:
        print(f'    missing functions: {missing[:5]}')
    if extras:
        print(f'    extra functions: {extras[:5]}')
    return 1


def test_compile_roundtrip():
    print('\n=== Phase 2: decompile -> compile -> redecompile semantic comparison ===')
    total_fail = 0

    for tc in TEST_CASES:
        if not tc['roundtrip']:
            print(f'  [SKIP] {tc["original"]}: no matching .c for compile test')
            continue

        orig_path = os.path.join(TEST_DIR, tc['original'])

        with open(orig_path, 'rb') as f:
            original = f.read()

        decompile_result, c_path, log_path = decompile_to_temp(orig_path)
        if decompile_result.returncode != 0:
            print(f'  [FAIL] {tc["original"]}: decompile failed: {decompile_result.stderr[-200:]}')
            total_fail += 1
            for temp_path in (c_path, log_path):
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
            continue

        try:
            result, tmp_path = compile_c_to_temp(c_path)

            if result.returncode != 0:
                print(f'  [FAIL] {tc["original"]}: compile failed: {result.stderr[-200:]}')
                total_fail += 1
                continue

            with open(tmp_path, 'rb') as f:
                compiled = f.read()

            compare_bytes(original, compiled, tc['original'])

            rebuilt_decompile_result, rebuilt_c_path, rebuilt_log_path = decompile_to_temp(tmp_path)
            if rebuilt_decompile_result.returncode != 0:
                print(f'  [FAIL] {tc["original"]}: redecompile failed: {rebuilt_decompile_result.stderr[-200:]}')
                total_fail += 1
                continue

            total_fail += compare_semantic_text(c_path, rebuilt_c_path, tc['original'])

        finally:
            for temp_path in (c_path, log_path):
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
            if 'tmp_path' in locals() and os.path.exists(tmp_path):
                os.unlink(tmp_path)
            if 'rebuilt_c_path' in locals():
                for temp_path in (rebuilt_c_path, rebuilt_log_path):
                    if os.path.exists(temp_path):
                        os.unlink(temp_path)

    return total_fail


if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.WARNING)

    fails = 0
    fails += test_core_read_write()
    fails += test_compile_roundtrip()

    print(f'\n===== FINAL RESULT =====')
    if fails == 0:
        print('ALL TESTS PASSED')
    else:
        print(f'{fails} test(s) FAILED')
    sys.exit(fails)
