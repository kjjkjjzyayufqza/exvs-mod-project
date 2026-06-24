import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from msc_core import MscFile, EXVS2_FORMAT

TEST_DIR = r'E:\XB\解包\com\file\0xBDBE6FEA_test'
TEST_FILES = ['0.bscex', '1.cscex', '2.dscex']
REAL_SAMPLE_DIR = r'E:\XB\解包\com\file\040msc\0xFEEA714A'
TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_msc(path):
    msc = MscFile()
    with open(path, 'rb') as f:
        msc.readFromFile(f, EXVS2_FORMAT)
    return msc


def test_sequential_table_names(path):
    fn = os.path.basename(path)
    msc = read_msc(path)
    expected = [f'func_{i}' for i in range(len(msc.scripts))]
    actual = [script.name for script in msc.scripts]
    if actual == expected:
        print(f'[OK] {fn}: sequential table-order names')
        return 0

    for i, (exp, act) in enumerate(zip(expected, actual)):
        if exp != act:
            print(f'[FAIL] {fn}: first name mismatch at index {i}: expected={exp}, actual={act}')
            break
    return 1


def test_entrypoint_resolution(path):
    fn = os.path.basename(path)
    msc = read_msc(path)
    ep_script = msc.getScriptAtLocation(msc.entryPoint)
    if ep_script is None:
        print(f'[FAIL] {fn}: getScriptAtLocation(entryPoint) returned None')
        return 1

    if ep_script.name not in [f'func_{i}' for i in range(len(msc.scripts))]:
        print(f'[FAIL] {fn}: entrypoint script has unexpected name {ep_script.name}')
        return 1

    print(f'[OK] {fn}: entrypoint resolves to {ep_script.name}')
    return 0


def test_real_sample_sequential_names():
    path = os.path.join(REAL_SAMPLE_DIR, '0.bscex')
    if not os.path.exists(path):
        print('[SKIP] real sample not found')
        return 0

    msc = read_msc(path)
    expected = [f'func_{i}' for i in range(min(10, len(msc.scripts)))]
    actual = [script.name for script in msc.scripts[:len(expected)]]
    if actual != expected:
        print(f'[FAIL] real sample first names mismatch: expected={expected}, actual={actual}')
        return 1

    print(f'[OK] real sample first names: {actual}')
    return 0


def test_real_sample_single_main_after_decompile():
    path = os.path.join(REAL_SAMPLE_DIR, '0.bscex')
    if not os.path.exists(path):
        print('[SKIP] real sample decompile test not found')
        return 0

    with tempfile.NamedTemporaryFile(suffix='.c', delete=False) as tmp_c:
        c_path = tmp_c.name
    with tempfile.NamedTemporaryFile(suffix='.txt', delete=False) as tmp_log:
        log_path = tmp_log.name

    try:
        result = subprocess.run(
            [sys.executable, os.path.join(TOOLS_DIR, 'mscdec.py'),
             path, '-o', c_path, '-log', log_path],
            capture_output=True, text=True, cwd=TOOLS_DIR
        )
        if result.returncode != 0:
            print(f'[FAIL] real sample decompile failed: {result.stderr[-200:]}')
            return 1

        with open(c_path, 'r', encoding='utf-8') as f:
            content = f.read()

        main_defs = len(re.findall(r'\b(?:int|void|float|bool|string)\s+main\s*\(', content))
        if main_defs != 1:
            print(f'[FAIL] real sample main definition count = {main_defs}, expected 1')
            return 1

        print('[OK] real sample decompile emits exactly one main definition')
        return 0
    finally:
        for temp_path in (c_path, log_path):
            if os.path.exists(temp_path):
                os.unlink(temp_path)


if __name__ == '__main__':
    fails = 0
    for fn in TEST_FILES:
        path = os.path.join(TEST_DIR, fn)
        print(f'\n=== Testing {fn} ===')
        fails += test_sequential_table_names(path)
        fails += test_entrypoint_resolution(path)
    print('\n=== Testing real sample ===')
    fails += test_real_sample_sequential_names()
    fails += test_real_sample_single_main_after_decompile()

    print('\n===== RESULT =====')
    if fails == 0:
        print('ALL TESTS PASSED')
    else:
        print(f'{fails} test(s) FAILED')
    sys.exit(fails)
