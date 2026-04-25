import struct
import os
import math
from collections import defaultdict

MAGIC = 0xCDABB8A9
HEADER_SIZE = 0x20

FAMILIES = {
    'arms_param':      r'E:\XB\解包\vs2\x64\041cpm\arms_param',
    'bullet_param':    r'E:\XB\解包\vs2\x64\041cpm\bullet_param',
    'character_param': r'E:\XB\解包\vs2\x64\041cpm\character_param',
    'grap_param':      r'E:\XB\解包\vs2\x64\041cpm\grap_param',
    'hitgroup':        r'E:\XB\解包\vs2\x64\041cpm\hitgroup',
    'interaction':     r'E:\XB\解包\vs2\x64\041cpm\interaction',
    'speed_param':     r'E:\XB\解包\vs2\x64\041cpm\speed_param',
    'effect_project':  r'E:\XB\解包\vs2\x64\006effect\effect_project',
}

EFFECT_BIN = r'E:\XB\解包\com\file\0xa258a522\effect_project_015gndmuc_004deltpl_001.bin'

NUM_SAMPLES = 30

def read_u32(data, off):
    return struct.unpack_from('<I', data, off)[0]

def read_i32(data, off):
    return struct.unpack_from('<i', data, off)[0]

def read_f32(data, off):
    return struct.unpack_from('<f', data, off)[0]

def read_blob(data, off):
    if off >= len(data):
        return b''
    end = off
    while end < len(data) and data[end] != 0:
        end += 1
    return data[off:end]

def parse_vgsht2(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()

    if len(data) < HEADER_SIZE:
        return None

    magic = read_u32(data, 0)
    if magic != MAGIC:
        return None

    entry_count = read_u32(data, 0x10)
    cmd_count = read_u32(data, 0x14)
    entry_size = read_u32(data, 0x18)

    hash_base = HEADER_SIZE
    desc_base = hash_base + cmd_count * 4
    ids_base = desc_base + cmd_count * 12
    entries_base = ids_base + entry_count * 4
    entries_end = entries_base + entry_count * entry_size

    if entries_end > len(data):
        return None

    commands = []
    for i in range(cmd_count):
        h = read_u32(data, hash_base + i * 4)
        off = desc_base + i * 12
        entry_offset = read_u32(data, off)
        flags = read_u32(data, off + 4)
        kind = read_u32(data, off + 8)
        commands.append({
            'hash': h,
            'entry_offset': entry_offset,
            'flags': flags,
            'kind': kind,
        })

    entry_ids = []
    for i in range(entry_count):
        entry_ids.append(read_u32(data, ids_base + i * 4))

    entries = []
    for i in range(entry_count):
        start = entries_base + i * entry_size
        entries.append(data[start:start + entry_size])

    return {
        'entry_count': entry_count,
        'cmd_count': cmd_count,
        'entry_size': entry_size,
        'commands': commands,
        'entry_ids': entry_ids,
        'entries': entries,
        'raw_data': data,
    }

def extract_field_values(parsed, cmd):
    values = []
    kind = cmd['kind']
    offset = cmd['entry_offset']

    for entry in parsed['entries']:
        if offset + 4 > len(entry):
            continue

        raw4 = entry[offset:offset+4]
        if kind == 2:
            v = struct.unpack('<i', raw4)[0]
            values.append(v)
        elif kind == 5:
            v = struct.unpack('<f', raw4)[0]
            if not math.isnan(v) and not math.isinf(v):
                values.append(v)
        elif kind == 1:
            v = struct.unpack('<I', raw4)[0]
            values.append(v)
        elif kind == 7:
            str_off = struct.unpack('<I', raw4)[0]
            blob = read_blob(parsed['raw_data'], str_off)
            values.append(blob)
        else:
            v = struct.unpack('<I', raw4)[0]
            values.append(v)

    return values

def infer_meaning_blob(blobs):
    if not blobs:
        return "no data", 0, []

    sizes = [len(b) for b in blobs]
    unique_sizes = set(sizes)
    min_size = min(sizes) if sizes else 0
    max_size = max(sizes) if sizes else 0

    unique_blobs = len(set(blobs))

    samples_hex = []
    seen = set()
    for b in blobs:
        h = b.hex()
        if h not in seen:
            seen.add(h)
            samples_hex.append(h)
        if len(samples_hex) >= 3:
            break

    if all(s == 0 for s in sizes):
        meaning = "empty blob (unused)"
    elif len(unique_sizes) == 1:
        sz = sizes[0]
        if sz == 16:
            meaning = f"GUID/UUID reference ({sz} bytes)"
        elif sz % 4 == 0:
            n = sz // 4
            meaning = f"hash chain ({n} x u32, {sz} bytes)"
        else:
            meaning = f"binary blob ({sz} bytes)"
    else:
        meaning = f"variable-length blob ({min_size}-{max_size} bytes)"

    return meaning, unique_blobs, samples_hex

def infer_meaning(kind, values, hash_val):
    if not values:
        return "no data"

    if kind == 7:
        meaning, _, _ = infer_meaning_blob(values)
        return meaning

    if kind == 5:
        fmin = min(values)
        fmax = max(values)
        unique = len(set(round(v, 6) for v in values))

        if fmin == 0.0 and fmax == 0.0:
            return "always 0.0 (unused/reserved)"
        if abs(fmin - fmax) < 0.0001 and unique == 1:
            return f"constant = {fmin:.4f}"
        if -0.01 <= fmin and fmax <= 1.01:
            return "coefficient / ratio [0..1]"
        if -0.01 <= fmin and fmax <= 2.01:
            return "multiplier / scale factor [0..2]"
        if -1.01 <= fmin and fmax <= 1.01:
            return "signed coefficient [-1..1]"
        if 0 <= fmin and fmax <= 10:
            return "small float param (size/scale)"
        if fmin >= -200 and fmax <= 200:
            return "position offset / angle (degrees)"
        if fmin >= -1000 and fmax <= 1000:
            return "distance / velocity"
        if fmax > 1000:
            return "large float (speed/distance)"
        return f"float range [{fmin:.2f}..{fmax:.2f}]"

    imin = min(values)
    imax = max(values)
    unique = len(set(values))

    if kind == 1:
        if unique == 1 and imin == 0:
            return "always 0 (unused)"
        if all(v > 0x10000000 for v in values if v != 0):
            return "hash reference (resource/action)"
        if all(v > 0x1000 for v in values if v != 0) and unique > 10:
            return "hash/ID reference"
        if imax <= 1:
            return "boolean flag (0/1)"
        if imax <= 0xFF:
            return f"u8 enum/flags [0x{imin:X}..0x{imax:X}]"
        if imax <= 0xFFFF:
            return f"u16 value/id [0x{imin:X}..0x{imax:X}]"
        return f"u32 value [0x{imin:X}..0x{imax:X}]"

    if kind == 2:
        if unique == 1 and imin == 0:
            return "always 0 (unused/default)"
        if unique == 1:
            return f"constant = {imin}"
        if imin == 0 and imax == 1:
            return "boolean (0/1)"
        if imin >= 0 and imax <= 3 and unique <= 4:
            return f"enum type [{imin}..{imax}]"
        if imin >= 0 and imax <= 8 and unique <= 9:
            return f"small enum [{imin}..{imax}]"
        if imin >= 0 and imax <= 15 and unique <= 16:
            return f"index/enum [{imin}..{imax}]"
        if imin >= -1 and imax <= 15:
            return f"index (may use -1=none) [{imin}..{imax}]"
        if imin >= 0 and imax <= 100:
            return f"ammo/percentage [{imin}..{imax}]"
        if imin >= 0 and imax <= 180:
            return f"angle (degrees) [{imin}..{imax}]"
        if imin >= 0 and imax <= 360:
            return f"angle (full rotation) [{imin}..{imax}]"
        if imin >= 0 and imax <= 1000:
            return f"damage/distance (x10 scale?) [{imin}..{imax}]"
        if imin >= 0 and imax <= 1800:
            return f"frame count / timer [{imin}..{imax}]"
        if imin >= 0 and imax <= 10000:
            return f"large int param [{imin}..{imax}]"
        if imin < 0:
            return f"signed int [{imin}..{imax}]"
        return f"int range [{imin}..{imax}]"

    return f"kind={kind} [{imin}..{imax}]"


def analyze_family(family_name, family_dir):
    print(f"  Analyzing {family_name}...")
    files = sorted([f for f in os.listdir(family_dir) if f.endswith('.vgsht2')])
    if not files:
        return None

    sample_files = files[:NUM_SAMPLES] if len(files) >= NUM_SAMPLES else files

    all_cmds = None
    cmd_values = defaultdict(list)
    entry_size = 0
    total_entries = 0
    files_parsed = 0

    for fname in sample_files:
        fpath = os.path.join(family_dir, fname)
        parsed = parse_vgsht2(fpath)
        if parsed is None:
            continue

        files_parsed += 1
        entry_size = parsed['entry_size']
        total_entries += parsed['entry_count']

        if all_cmds is None:
            all_cmds = parsed['commands']

        for cmd in parsed['commands']:
            vals = extract_field_values(parsed, cmd)
            key = (cmd['hash'], cmd['kind'], cmd['entry_offset'])
            cmd_values[key].extend(vals)

    if all_cmds is None:
        return None

    results = []
    for cmd in all_cmds:
        key = (cmd['hash'], cmd['kind'], cmd['entry_offset'])
        vals = cmd_values[key]
        kind = cmd['kind']

        info = {
            'hash': cmd['hash'],
            'offset': cmd['entry_offset'],
            'flags': cmd['flags'],
            'kind': kind,
            'kind_name': {1: 'u32', 2: 'int', 5: 'float', 7: 'blob'}.get(kind, f'unk({kind})'),
        }

        if kind == 7:
            meaning, unique_blobs, samples_hex = infer_meaning_blob(vals)
            sizes = [len(b) for b in vals if isinstance(b, (bytes, bytearray))]
            info['unique_count'] = unique_blobs
            info['min_size'] = min(sizes) if sizes else 0
            info['max_size'] = max(sizes) if sizes else 0
            info['samples'] = samples_hex
            info['inferred'] = meaning
        elif kind == 5:
            if vals:
                info['min'] = min(vals)
                info['max'] = max(vals)
                info['unique_count'] = len(set(round(v, 6) for v in vals))
                samples = sorted(set(round(v, 4) for v in vals))[:8]
                info['samples'] = samples
            else:
                info['min'] = 0
                info['max'] = 0
                info['unique_count'] = 0
                info['samples'] = []
            info['inferred'] = infer_meaning(kind, vals, cmd['hash'])
        elif kind == 2:
            if vals:
                info['min'] = min(vals)
                info['max'] = max(vals)
                info['unique_count'] = len(set(vals))
                samples = sorted(set(vals))[:10]
                info['samples'] = samples
            else:
                info['min'] = 0
                info['max'] = 0
                info['unique_count'] = 0
                info['samples'] = []
            info['inferred'] = infer_meaning(kind, vals, cmd['hash'])
        elif kind == 1:
            if vals:
                info['min'] = min(vals)
                info['max'] = max(vals)
                info['unique_count'] = len(set(vals))
                samples = sorted(set(vals))[:8]
                info['samples'] = samples
            else:
                info['min'] = 0
                info['max'] = 0
                info['unique_count'] = 0
                info['samples'] = []
            info['inferred'] = infer_meaning(kind, vals, cmd['hash'])
        else:
            if vals:
                info['min'] = min(vals)
                info['max'] = max(vals)
                info['unique_count'] = len(set(vals))
                info['samples'] = sorted(set(vals))[:8]
            else:
                info['min'] = 0
                info['max'] = 0
                info['unique_count'] = 0
                info['samples'] = []
            info['inferred'] = infer_meaning(kind, vals, cmd['hash'])

        results.append(info)

    return {
        'family': family_name,
        'cmd_count': len(all_cmds),
        'entry_size': entry_size,
        'files_parsed': files_parsed,
        'total_files': len(files),
        'total_entries': total_entries,
        'fields': results,
    }


def analyze_effect_bin(filepath):
    print(f"  Analyzing effect .bin: {os.path.basename(filepath)}")
    try:
        with open(filepath, 'rb') as f:
            data = f.read()
    except:
        return None

    magic = read_u32(data, 0)
    if magic != MAGIC:
        print(f"    Not command table (magic=0x{magic:08X}), reporting raw info")
        return {'note': f'Not command table format. Magic=0x{magic:08X}, size={len(data)} bytes'}

    parsed = parse_vgsht2(filepath)
    if parsed is None:
        return None

    results = []
    for cmd in parsed['commands']:
        vals = extract_field_values(parsed, cmd)
        kind = cmd['kind']
        info = {
            'hash': cmd['hash'],
            'offset': cmd['entry_offset'],
            'flags': cmd['flags'],
            'kind': kind,
            'kind_name': {1: 'u32', 2: 'int', 5: 'float', 7: 'blob'}.get(kind, f'unk({kind})'),
        }
        if kind == 7:
            meaning, unique_blobs, samples_hex = infer_meaning_blob(vals)
            sizes = [len(b) for b in vals if isinstance(b, (bytes, bytearray))]
            info['unique_count'] = unique_blobs
            info['min_size'] = min(sizes) if sizes else 0
            info['max_size'] = max(sizes) if sizes else 0
            info['samples'] = samples_hex
            info['inferred'] = meaning
        elif vals:
            if kind == 5:
                info['min'] = min(vals)
                info['max'] = max(vals)
                info['unique_count'] = len(set(round(v, 6) for v in vals))
                info['samples'] = sorted(set(round(v, 4) for v in vals))[:8]
            else:
                info['min'] = min(vals)
                info['max'] = max(vals)
                info['unique_count'] = len(set(vals))
                info['samples'] = sorted(set(vals))[:8]
            info['inferred'] = infer_meaning(kind, vals, cmd['hash'])
        else:
            info['min'] = 0
            info['max'] = 0
            info['unique_count'] = 0
            info['samples'] = []
            info['inferred'] = 'no data'
        results.append(info)

    return {
        'family': 'effect_project_bin',
        'cmd_count': parsed['cmd_count'],
        'entry_size': parsed['entry_size'],
        'files_parsed': 1,
        'total_files': 1,
        'total_entries': parsed['entry_count'],
        'fields': results,
        'source': filepath,
    }


def format_value(v, kind):
    if kind == 5:
        return f"{v:.4f}"
    if kind == 1 and isinstance(v, int) and v > 0xFFFF:
        return f"0x{v:08X}"
    return str(v)

def write_markdown(all_results, effect_bin_result, outpath):
    with open(outpath, 'w', encoding='utf-8') as f:
        f.write("# EXVS2 Over Boost - Comprehensive Param Field Analysis\n\n")
        f.write("Auto-generated analysis of command table fields across all param families.\n")
        f.write(f"Sampled {NUM_SAMPLES} character files per family from 432+ total.\n\n")
        f.write("## Format Reference\n\n")
        f.write("- **kind=1** (u32): Raw unsigned 32-bit (hash, id, bitfield)\n")
        f.write("- **kind=2** (int): Signed 32-bit integer (enum, count, frame count, damage)\n")
        f.write("- **kind=5** (float): IEEE 754 float (coefficient, speed, distance)\n")
        f.write("- **kind=7** (blob): Offset to null-terminated binary blob (hash chain, GUID)\n\n")
        f.write("---\n\n")

        total_cmds = sum(r['cmd_count'] for r in all_results if r)
        f.write(f"## Summary\n\n")
        f.write(f"| Family | Cmds | Entry Size | Files Sampled / Total | Entries Sampled |\n")
        f.write(f"|--------|------|------------|----------------------|----------------|\n")
        for r in all_results:
            if r is None:
                continue
            f.write(f"| {r['family']} | {r['cmd_count']} | {r['entry_size']} | {r['files_parsed']} / {r['total_files']} | {r['total_entries']} |\n")
        f.write(f"\n**Total unique command fields analyzed: {total_cmds}**\n\n")
        f.write("---\n\n")

        for r in all_results:
            if r is None:
                continue
            f.write(f"## {r['family']}\n\n")
            f.write(f"- Commands: **{r['cmd_count']}**, Entry size: **{r['entry_size']}** bytes\n")
            f.write(f"- Sampled {r['files_parsed']} / {r['total_files']} files, {r['total_entries']} total entries\n\n")

            f.write(f"| # | Hash | Offset | Kind | Unique | Min | Max | Inferred Meaning | Sample Values |\n")
            f.write(f"|---|------|--------|------|--------|-----|-----|------------------|---------------|\n")

            for idx, fld in enumerate(r['fields']):
                h = f"0x{fld['hash']:08X}"
                off = f"0x{fld['offset']:03X}"
                kname = fld['kind_name']

                if fld['kind'] == 7:
                    uniq = fld.get('unique_count', 0)
                    mn_sz = fld.get('min_size', 0)
                    mx_sz = fld.get('max_size', 0)
                    samples = fld.get('samples', [])
                    sample_str = ', '.join(f'`{s[:24]}...`' if len(s) > 24 else f'`{s}`' for s in samples[:2]) if samples else '-'
                    f.write(f"| {idx} | {h} | {off} | {kname} | {uniq} | {mn_sz}B | {mx_sz}B | {fld['inferred']} | {sample_str} |\n")
                else:
                    mn = fld.get('min', 0)
                    mx = fld.get('max', 0)
                    uniq = fld.get('unique_count', 0)
                    samples = fld.get('samples', [])

                    mn_s = format_value(mn, fld['kind'])
                    mx_s = format_value(mx, fld['kind'])
                    sample_str = ', '.join(format_value(s, fld['kind']) for s in samples[:6]) if samples else '-'

                    f.write(f"| {idx} | {h} | {off} | {kname} | {uniq} | {mn_s} | {mx_s} | {fld['inferred']} | {sample_str} |\n")

            f.write("\n---\n\n")

        if effect_bin_result:
            f.write("## effect_project (.bin standalone)\n\n")
            if 'note' in effect_bin_result:
                f.write(f"**Note:** {effect_bin_result['note']}\n\n")
            else:
                f.write(f"- Source: `{os.path.basename(effect_bin_result.get('source', EFFECT_BIN))}`\n")
                f.write(f"- Commands: **{effect_bin_result['cmd_count']}**, Entry size: **{effect_bin_result['entry_size']}** bytes\n")
                f.write(f"- Entries: {effect_bin_result['total_entries']}\n\n")

                f.write(f"| # | Hash | Offset | Kind | Unique | Min | Max | Inferred Meaning | Sample Values |\n")
                f.write(f"|---|------|--------|------|--------|-----|-----|------------------|---------------|\n")

                for idx, fld in enumerate(effect_bin_result['fields']):
                    h = f"0x{fld['hash']:08X}"
                    off = f"0x{fld['offset']:03X}"
                    kname = fld['kind_name']

                    if fld['kind'] == 7:
                        uniq = fld.get('unique_count', 0)
                        mn_sz = fld.get('min_size', 0)
                        mx_sz = fld.get('max_size', 0)
                        samples = fld.get('samples', [])
                        sample_str = ', '.join(f'`{s[:24]}...`' if len(s) > 24 else f'`{s}`' for s in samples[:2]) if samples else '-'
                        f.write(f"| {idx} | {h} | {off} | {kname} | {uniq} | {mn_sz}B | {mx_sz}B | {fld['inferred']} | {sample_str} |\n")
                    else:
                        mn = fld.get('min', 0)
                        mx = fld.get('max', 0)
                        uniq = fld.get('unique_count', 0)
                        samples = fld.get('samples', [])
                        mn_s = format_value(mn, fld['kind'])
                        mx_s = format_value(mx, fld['kind'])
                        sample_str = ', '.join(format_value(s, fld['kind']) for s in samples[:6]) if samples else '-'
                        f.write(f"| {idx} | {h} | {off} | {kname} | {uniq} | {mn_s} | {mx_s} | {fld['inferred']} | {sample_str} |\n")

                f.write("\n---\n\n")

        f.write("## Cross-Family Hash Overlap\n\n")
        hash_to_families = defaultdict(list)
        for r in all_results:
            if r is None:
                continue
            for fld in r['fields']:
                hash_to_families[fld['hash']].append((r['family'], fld['kind'], fld['offset']))

        shared = {h: fams for h, fams in hash_to_families.items() if len(fams) > 1}
        if shared:
            f.write(f"Found **{len(shared)}** hashes shared across multiple families:\n\n")
            f.write("| Hash | Families | Kind | Offsets |\n")
            f.write("|------|----------|------|--------|\n")
            for h, fams in sorted(shared.items()):
                fam_names = ', '.join(f[0] for f in fams)
                kinds = ', '.join(str(f[1]) for f in fams)
                offsets = ', '.join(f'0x{f[2]:03X}' for f in fams)
                f.write(f"| 0x{h:08X} | {fam_names} | {kinds} | {offsets} |\n")
        else:
            f.write("No command hashes are shared across multiple families.\n")

        f.write("\n---\n\n")

        f.write("## Kind Distribution by Family\n\n")
        f.write("| Family | kind=1 (u32) | kind=2 (int) | kind=5 (float) | kind=7 (blob) |\n")
        f.write("|--------|-------------|-------------|---------------|---------------|\n")
        for r in all_results:
            if r is None:
                continue
            counts = defaultdict(int)
            for fld in r['fields']:
                counts[fld['kind']] += 1
            f.write(f"| {r['family']} | {counts.get(1,0)} | {counts.get(2,0)} | {counts.get(5,0)} | {counts.get(7,0)} |\n")

        f.write("\n---\n\n")

        f.write("## Field Meaning Inference Guide\n\n")
        f.write("| Range | Likely Meaning |\n")
        f.write("|-------|---------------|\n")
        f.write("| int 0-1 | Boolean flag |\n")
        f.write("| int 0-3 | Enum type (action type, projectile behavior) |\n")
        f.write("| int 0-8 | Small enum (CPU level, burst type) |\n")
        f.write("| int 0-100 | Ammo count, percentage, small param |\n")
        f.write("| int 0-180 | Angle in degrees |\n")
        f.write("| int 0-360 | Full rotation angle |\n")
        f.write("| int 0-1000 | Damage (x10?), distance |\n")
        f.write("| int 0-1800 | Frame count (30fps = 60s max) |\n")
        f.write("| float 0.0-1.0 | Coefficient / ratio |\n")
        f.write("| float 0.0-2.0 | Multiplier / scale |\n")
        f.write("| float large | Speed, distance, position |\n")
        f.write("| u32 > 0x10000000 | Hash reference (resource, action) |\n")
        f.write("| blob 28-36 bytes | Resource hash chain (GUID + variant hashes) |\n")
        f.write("| blob 16 bytes | GUID / UUID reference |\n")

    print(f"\nOutput written to: {outpath}")
    print(f"File size: {os.path.getsize(outpath)} bytes")


def main():
    print("=" * 60)
    print("EXVS2 Comprehensive Param Field Analysis")
    print("=" * 60)

    all_results = []

    for family_name, family_dir in FAMILIES.items():
        if not os.path.isdir(family_dir):
            print(f"  SKIPPING {family_name}: directory not found")
            all_results.append(None)
            continue
        result = analyze_family(family_name, family_dir)
        all_results.append(result)

    effect_bin_result = None
    if os.path.isfile(EFFECT_BIN):
        effect_bin_result = analyze_effect_bin(EFFECT_BIN)

    outpath = r'E:\TAURI_PROJECT\param_field_analysis.md'
    write_markdown(all_results, effect_bin_result, outpath)

    total_fields = sum(r['cmd_count'] for r in all_results if r)
    print(f"\nDone! Analyzed {total_fields} total command fields across {len([r for r in all_results if r])} families.")


if __name__ == '__main__':
    main()
