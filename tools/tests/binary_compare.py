import sys
import os

def compare_files(path_a, path_b, label_a="original", label_b="repacked"):
    with open(path_a, 'rb') as f:
        data_a = f.read()
    with open(path_b, 'rb') as f:
        data_b = f.read()

    size_a = len(data_a)
    size_b = len(data_b)
    print(f'{label_a}: {size_a} bytes')
    print(f'{label_b}: {size_b} bytes')

    if size_a != size_b:
        print(f'SIZE MISMATCH: {label_a}={size_a}, {label_b}={size_b} (diff={size_b - size_a})')

    min_len = min(size_a, size_b)
    diffs = []
    for i in range(min_len):
        if data_a[i] != data_b[i]:
            diffs.append(i)

    if len(diffs) == 0 and size_a == size_b:
        print('IDENTICAL - byte-perfect match')
        return 0

    print(f'Found {len(diffs)} byte differences in first {min_len} bytes')
    shown = 0
    for offset in diffs:
        if shown >= 30:
            print(f'  ... and {len(diffs) - shown} more')
            break
        ctx_start = max(0, offset - 2)
        ctx_end = min(min_len, offset + 3)
        ctx_a = data_a[ctx_start:ctx_end].hex()
        ctx_b = data_b[ctx_start:ctx_end].hex()
        print(f'  offset {offset:#06x}: {label_a}={data_a[offset]:#04x} {label_b}={data_b[offset]:#04x}  context_a=[{ctx_a}] context_b=[{ctx_b}]')
        shown += 1

    return len(diffs) + abs(size_a - size_b)


if __name__ == '__main__':
    base = r'E:\XB\解包\com\file\0xBDBE6FEA_test'
    pairs = []
    if len(sys.argv) >= 3:
        pairs.append((sys.argv[1], sys.argv[2], 'A', 'B'))
    else:
        pairs = [
            ('1.cscex', '1_repack2.cscex', 'orig', 'repack'),
        ]
    total = 0
    for orig, repack, la, lb in pairs:
        pa = os.path.join(base, orig) if not os.path.isabs(orig) else orig
        pb = os.path.join(base, repack) if not os.path.isabs(repack) else repack
        if not os.path.exists(pb):
            print(f'SKIP: {pb} not found')
            continue
        print(f'\n=== {os.path.basename(pa)} vs {os.path.basename(pb)} ===')
        total += compare_files(pa, pb, la, lb)

    if total == 0:
        print('\nALL COMPARISONS PASSED')
    else:
        print(f'\n{total} total difference(s)')
