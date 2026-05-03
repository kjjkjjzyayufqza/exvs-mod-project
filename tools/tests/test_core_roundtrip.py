import sys, os, struct
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from msc_core import MscFile, MscFormat, EXVS2_FORMAT, SCRIPT_BASE, getSizeFromFormat, COMMAND_FORMAT

TEST_DIR = r'E:\XB\解包\com\file\0xBDBE6FEA_test'
TEST_FILES = ['0.bscex', '1.cscex', '2.dscex']

def read_msc(path):
    msc = MscFile()
    with open(path, 'rb') as f:
        msc.readFromFile(f, EXVS2_FORMAT)
    return msc

def rebuild_bytes(msc):
    fmt = msc.format
    he = fmt.header_endian

    with open(os.path.join(TEST_DIR, '1.cscex'), 'rb') as _:
        pass

    script_bytes = b''
    script_positions = []
    for script in msc.scripts:
        script_positions.append(len(script_bytes) + 0x10)
        for cmd in script:
            script_bytes += cmd.write('>')

    end_of_scripts = len(script_bytes) + 0x10

    if len(script_bytes) % 0x10 != 0:
        script_bytes += b'\x00' * (0x10 - (len(script_bytes) % 0x10))

    offset_table = b''
    for pos in script_positions:
        offset_table += struct.pack(he+'L', pos)

    if len(offset_table) % 0x10 != 0:
        offset_table += b'\x00' * (0x10 - (len(offset_table) % 0x10))

    max_string_length = 0
    for s in msc.strings:
        if len(s) > max_string_length:
            max_string_length = len(s)
    if max_string_length % 0x10 != 0:
        max_string_length += 0x10 - (max_string_length % 0x10)

    header = msc.raw_magic if msc.raw_magic else EXVS2_FORMAT.magic
    header += struct.pack(he+'L', end_of_scripts)
    main_pos = 0x10
    for i, script in enumerate(msc.scripts):
        if script.name == 'main' or script.bounds[0] == msc.entryPoint:
            main_pos = script_positions[i]
            break
    header += struct.pack(he+'L', main_pos)
    header += struct.pack(he+'L', len(msc.scripts))
    header += struct.pack(he+'L', msc.unk)
    header += struct.pack(he+'L', max_string_length)
    header += struct.pack(he+'L', len(msc.strings))
    header += struct.pack(he+'L', 0)
    header += struct.pack(he+'L', 0)
    header += b'\x00' * 0x10

    result = header + script_bytes + offset_table
    for s in msc.strings:
        result += s.encode('utf-8')
        result += b'\x00' * (max_string_length - len(s))

    return result

def test_read_parse(path):
    fn = os.path.basename(path)
    msc = read_msc(path)
    print(f'[OK] {fn}: read {len(msc.scripts)} scripts, entryPoint={msc.entryPoint:#x}')
    for i, script in enumerate(msc.scripts[:3]):
        print(f'     script {i} ({script.name}): {len(script.cmds)} cmds, bounds={[hex(b) for b in script.bounds]}')
    return msc

def test_command_roundtrip(path):
    fn = os.path.basename(path)
    with open(path, 'rb') as f:
        original = f.read()

    msc = read_msc(path)

    total_cmds = 0
    mismatches = 0
    for script in msc.scripts:
        for cmd in script:
            total_cmds += 1
            written = cmd.write('>')
            abs_pos = cmd.commandPosition + SCRIPT_BASE
            orig_slice = original[abs_pos:abs_pos+len(written)]
            if written != orig_slice:
                mismatches += 1
                if mismatches <= 5:
                    print(f'  MISMATCH at {abs_pos:#x}: orig={orig_slice.hex()} written={written.hex()} cmd={cmd.command:#x} push={cmd.pushBit}')

    if mismatches == 0:
        print(f'[OK] {fn}: all {total_cmds} commands round-trip perfectly')
    else:
        print(f'[FAIL] {fn}: {mismatches}/{total_cmds} commands differ')
    return mismatches

def test_header_roundtrip(path):
    fn = os.path.basename(path)
    with open(path, 'rb') as f:
        original = f.read()

    msc = read_msc(path)
    he = msc.format.header_endian

    orig_entries_off = struct.unpack_from(he+'L', original, 0x10)[0]
    orig_entrypoint = struct.unpack_from(he+'L', original, 0x14)[0]
    orig_count = struct.unpack_from(he+'L', original, 0x18)[0]
    orig_unk = struct.unpack_from(he+'L', original, 0x1C)[0]
    orig_strsize = struct.unpack_from(he+'L', original, 0x20)[0]
    orig_strcount = struct.unpack_from(he+'L', original, 0x24)[0]

    ok = True
    if msc.entryPoint != orig_entrypoint:
        print(f'  entryPoint: orig={orig_entrypoint:#x} read={msc.entryPoint:#x}')
        ok = False
    if len(msc.scripts) != orig_count:
        print(f'  entryCount: orig={orig_count} read={len(msc.scripts)}')
        ok = False
    if msc.unk != orig_unk:
        print(f'  unk: orig={orig_unk:#x} read={msc.unk:#x}')
        ok = False
    if msc.stringSize != orig_strsize:
        print(f'  stringSize: orig={orig_strsize:#x} read={msc.stringSize:#x}')
        ok = False
    if len(msc.strings) != orig_strcount:
        print(f'  stringCount: orig={orig_strcount} read={len(msc.strings)}')
        ok = False

    if ok:
        print(f'[OK] {fn}: header fields match original')
    else:
        print(f'[FAIL] {fn}: header field mismatch')
    return 0 if ok else 1


if __name__ == '__main__':
    total_fails = 0
    for fn in TEST_FILES:
        path = os.path.join(TEST_DIR, fn)
        print(f'\n===== Testing {fn} =====')
        test_read_parse(path)
        total_fails += test_header_roundtrip(path)
        total_fails += test_command_roundtrip(path)

    print(f'\n===== SUMMARY =====')
    if total_fails == 0:
        print('ALL TESTS PASSED')
    else:
        print(f'{total_fails} test(s) FAILED')
    sys.exit(total_fails)
