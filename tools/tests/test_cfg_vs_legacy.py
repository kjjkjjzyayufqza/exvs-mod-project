import sys, os, subprocess, tempfile, logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
logging.basicConfig(level=logging.WARNING)

TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_DIR = r'E:\XB\解包\com\file\0xBDBE6FEA_test'

def decompile_with_mode(input_path, use_cfg):
    with tempfile.NamedTemporaryFile(suffix='.c', delete=False, mode='w') as tmp_c:
        c_path = tmp_c.name
    with tempfile.NamedTemporaryFile(suffix='.txt', delete=False, mode='w') as tmp_log:
        log_path = tmp_log.name

    env = os.environ.copy()
    if not use_cfg:
        env['MSC_LEGACY_EMU'] = '1'

    result = subprocess.run(
        [sys.executable, os.path.join(TOOLS_DIR, 'mscdec.py'),
         input_path, '-o', c_path, '-log', log_path],
        capture_output=True, text=True, cwd=TOOLS_DIR, env=env
    )

    if result.returncode != 0:
        print(f'  decompile failed: {result.stderr[-300:]}')
        return None, c_path, log_path

    with open(c_path, 'r', encoding='utf-8') as f:
        content = f.read()
    return content, c_path, log_path


def compile_and_compare(c_path, original_path, label):
    with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as tmp:
        out_path = tmp.name

    result = subprocess.run(
        [sys.executable, os.path.join(TOOLS_DIR, 'msclang.py'),
         c_path, '-o', out_path, '-i'],
        capture_output=True, text=True, cwd=TOOLS_DIR
    )

    if result.returncode != 0:
        print(f'  [{label}] compile failed')
        os.unlink(out_path)
        return False

    with open(original_path, 'rb') as f:
        orig = f.read()
    with open(out_path, 'rb') as f:
        compiled = f.read()
    os.unlink(out_path)

    if orig == compiled:
        print(f'  [{label}] BYTE-IDENTICAL ({len(orig)} bytes)')
        return True
    else:
        diff_count = sum(1 for i in range(min(len(orig), len(compiled))) if orig[i] != compiled[i])
        print(f'  [{label}] {diff_count} byte diffs, size orig={len(orig)} compiled={len(compiled)}')
        return False


def test_file(filename):
    path = os.path.join(TEST_DIR, filename)
    print(f'\n=== {filename} ===')

    cfg_content, cfg_c, cfg_log = decompile_with_mode(path, use_cfg=True)
    if cfg_content is None:
        print('  CFG decompile FAILED')
        return 1

    c_path = os.path.join(TEST_DIR, filename.rsplit('.', 1)[0] + '.c')
    if os.path.exists(c_path):
        ok = compile_and_compare(c_path, path, 'original .c')
    else:
        print(f'  [SKIP] no pre-existing .c for compile test')

    ok_cfg = compile_and_compare(cfg_c, path, 'CFG decompiled .c')

    os.unlink(cfg_c)
    os.unlink(cfg_log)

    return 0 if ok_cfg else 1


if __name__ == '__main__':
    fails = 0
    for fn in ['1.cscex', '0.bscex']:
        fails += test_file(fn)

    print(f'\n===== RESULT =====')
    if fails == 0:
        print('ALL CFG TESTS PASSED')
    else:
        print(f'{fails} test(s) FAILED')
    sys.exit(fails)
