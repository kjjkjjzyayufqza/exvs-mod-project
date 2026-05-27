import struct

a = open(r'E:\XB\解包\com\test\test_metadata.bin', 'rb').read()
b = open(r'E:\XB\解包\com\test\0x16F73C97_metadata.bin', 'rb').read()

print('=== METADATA BINARY SIZE ===')
print(f'  test:   {len(a)} bytes')
print(f'  origin: {len(b)} bytes')
print(f'  DIFF:   {len(a) - len(b)} bytes')

print('\n=== METADATA HEADER (first 0x24 bytes) ===')
print(f'  test:   {a[:0x24].hex()}')
print(f'  origin: {b[:0x24].hex()}')

print('\n=== KEY HEADER FIELDS ===')
ta_magic = struct.unpack_from('<I', a, 0)[0]
tb_magic = struct.unpack_from('<I', b, 0)[0]
ta_ftc = struct.unpack_from('<I', a, 0x18)[0]
tb_ftc = struct.unpack_from('<I', b, 0x18)[0]
ta_fc = struct.unpack_from('<I', a, 0x1c)[0]
tb_fc = struct.unpack_from('<I', b, 0x1c)[0]
ta_unk = struct.unpack_from('<I', a, 0x20)[0]
tb_unk = struct.unpack_from('<I', b, 0x20)[0]

print(f'  test:   magic=0x{ta_magic:08X}  fileTypeCount={ta_ftc}  fileCount={ta_fc}  unkCount={ta_unk}')
print(f'  origin: magic=0x{tb_magic:08X}  fileTypeCount={tb_ftc}  fileCount={tb_fc}  unkCount={tb_unk}')

# Count total diffs
diffs = sum(1 for i in range(min(len(a), len(b))) if a[i] != b[i])
print(f'\n=== BYTE DIFFERENCES ===')
print(f'  Total differing bytes (shared range): {diffs}')
print(f'  Extra bytes in test: {max(0, len(a)-len(b))}')

# Structure binary starts after: header(0x24) + fileTypeEntries(fileTypeCount * 0x20) + subEntryHeaders(fileCount * 0x24)
# then chunk sizes, then structure bytes at the end
# Let's compare the structure binary portion (last N bytes)
# The structure is serialized at the end of metadata. Let's find where they diverge structurally.

# Show region 0x24 to 0x100 to compare file type tables
print(f'\n=== FILE TYPE TABLE (starting at 0x24) ===')
ft_size = ta_ftc * 0x20
print(f'  test fileType entries ({ta_ftc}): {a[0x24:0x24+ft_size].hex()}')
print(f'  origin fileType entries ({tb_ftc}): {b[0x24:0x24+ft_size].hex()}')
if a[0x24:0x24+ft_size] == b[0x24:0x24+ft_size]:
    print('  FILE TYPE TABLE: IDENTICAL')
else:
    print('  FILE TYPE TABLE: DIFFERS')
