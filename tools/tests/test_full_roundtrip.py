import sys, os, struct, tempfile, shutil

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TEST_DIR = r'E:\XB\解包\com\file\0xBDBE6FEA_test'
TOOLS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TEST_CASES = [
    {
        'original': '1.cscex',
        'decompiled_c': '1.c',
        'roundtrip': True,
    },
    {
        'original': '0.bscex',
        'decompiled_c': '0.c',
        'roundtrip': False,
    },
    {
        'original': '2.dscex',
        'decompiled_c': '2.c',
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
    print(f'  [FAIL] {label}: {diffs} byte diffs, size diff={size_diff}')
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


def test_compile_roundtrip():
    print('\n=== Phase 2: decompile -> compile binary comparison ===')
    total_fail = 0

    for tc in TEST_CASES:
        if not tc['roundtrip']:
            print(f'  [SKIP] {tc["original"]}: no matching .c for compile test')
            continue

        orig_path = os.path.join(TEST_DIR, tc['original'])
        c_path = os.path.join(TEST_DIR, tc['decompiled_c'])

        if not os.path.exists(c_path):
            print(f'  [SKIP] {tc["original"]}: {tc["decompiled_c"]} not found')
            continue

        with open(orig_path, 'rb') as f:
            original = f.read()

        with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as tmp:
            tmp_path = tmp.name

        try:
            import subprocess
            result = subprocess.run(
                [sys.executable, os.path.join(TOOLS_DIR, 'msclang.py'),
                 c_path, '-o', tmp_path, '-i'],
                capture_output=True, text=True, cwd=TOOLS_DIR
            )

            if result.returncode != 0:
                print(f'  [FAIL] {tc["original"]}: compile failed: {result.stderr[-200:]}')
                total_fail += 1
                continue

            with open(tmp_path, 'rb') as f:
                compiled = f.read()

            fails = compare_bytes(original, compiled, tc['original'])
            total_fail += (1 if fails > 0 else 0)

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

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
