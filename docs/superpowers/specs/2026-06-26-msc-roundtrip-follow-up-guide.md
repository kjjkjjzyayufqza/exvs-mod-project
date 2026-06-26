# MSC Roundtrip Follow-up Guide

- Date: 2026-06-26
- Scope: Follow-up guide for the clean `mscdec -> msclang` roundtrip around
  `040msc\0x18AF7533\2.dscex` and `040msc\0xFEEA714A\2.dscex`.
- Primary evidence note:
  `docs/superpowers/specs/2026-06-26-msclang-layout-reference-table-research.md`

## Current State

The current `0xFEEA714A\2.dscex` was regenerated through the real toolchain:

```text
0x18AF7533\2.dscex
  -> tools\mscdec.py -c
  -> 0xFEEA714A\2.c
  -> tools\msclang.py -i
  -> 0xFEEA714A\2.dscex
```

It was not produced by copying raw binary bytes.

`--layoutReference` was tested and removed. In-game testing showed the no-layout
build does not freeze and does not leave the unit uncontrollable, so the earlier
problem was not caused by script table order.

Latest verified artifacts:

```text
Reference: E:\XB\解包\com\file\040msc\0x18AF7533\2.dscex
Target C:  E:\XB\解包\com\file\040msc\0xFEEA714A\2.c
Target:    E:\XB\解包\com\file\040msc\0xFEEA714A\2.dscex

reference SHA256: 0C9C8E29090046E07DC14747DAFA70C0CA387A8FD52E2DA6F20946600B697D43
target SHA256:    28418D89C789F890BA271F0C72217D50DCDB37B6EDB94CCD22906E0CD29EA388
byte_diff: 1221
reference unk:    777
target unk:       22
body_diff_0x40_to_table: 0
table_same: false
table_set_same: true
table_diff_entries: 633
opcode_shape_diff_count_by_table_index: 597

target 2.c SHA256: B41F5F16F486355239576FDF182F6B95384FBD34562ACD42514FC76B332F6E57
moded2.c SHA256:   B41F5F16F486355239576FDF182F6B95384FBD34562ACD42514FC76B332F6E57
c_identical: true
```

For this no-op reference roundtrip, full binary identity is not expected. The
expected baseline is: script body bytes are stable, decompiled C is stable, and
the compiler may emit its normal script table order and default `unk`.

## Core Fixes Already Applied

- `tools/msclang.py`
  - Removed active `--layoutReference` support after no-layout in-game testing
    showed it was unnecessary for this unit.
  - `normalizeConditionExpr()` keeps pure comparison OR trees as OR trees
    instead of forcing De Morgan shape.
  - Nested comparison-only OR no longer forces the legacy `not + if(0x34)`
    AB34 path.
  - `handle_EXVS2_2E_to_AE` remains as a commented legacy reference only.

- `tools/mscdec.py`
  - `ifToTernaryOp()` renders boolean-array shape `[0, [0, 1]]` as
    `!a && !b` instead of `!(a || b)`, preserving original branch shape.

- `tools/disasmlib.py` / `tools/msc_cfg.py`
  - EXVS `sys_1` callback registry signatures now resolve script-offset
    arguments during decompile:
    - `sys_1(0x10001, 0x2, slot, callback)`
    - `sys_1(0x10001, 0xa, slot, callback)`
    - `sys_1(0x10002, 0x2, actionHash, callback)`
  - This replaces the old unsafe "every offset-shaped syscall value is a
    script reference" behavior with signature-proven callback resolution.

- `tools/ast2str.py`
  - Right-hand same-precedence binary expressions are parenthesized, preserving
    stack evaluation order for arithmetic chains.

These are structural fixes. They must remain dynamic and AST/bytecode-shape
based. Do not replace them with unit IDs, hardcoded function names, fixed
offsets, table-order preservation, or byte-pattern patching.

## Operating Rules For Next AI

- Communicate with the user in Chinese; keep code comments in English.
- Do not use raw binary copy as a repair or verification shortcut.
- Do not reintroduce `--layoutReference`, `--sourceReference`,
  `--preserveReferenceBytecode`, or any feature that bypasses the clean
  `mscdec -> msclang` flow unless new evidence proves it is necessary.
- Do not add new tests, one-off research scripts, or probe files under
  `tools/`. If temporary probes are needed, run them inline or document findings
  under `docs/`.
- Do not use `--exvsPostprocess` for this roundtrip path. The active repair is
  in core decompile/compile logic, not text postprocessing.
- Run Python with `-B` or `PYTHONDONTWRITEBYTECODE=1` when possible to avoid
  more `__pycache__` churn.
- If manually editing decompiled `X.c` files, follow
  `docs/msc-research/msc-ai-edit-block-rule.md`. Full tool-generated decompile
  output is not an AI semantic edit block.
- Treat unrelated dirty worktree entries as user/pre-existing state. Do not
  revert them unless explicitly asked.

## Verification Commands

From `E:\TAURI_PROJECT` in PowerShell:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$ref = 'E:\XB\解包\com\file\040msc\0x18AF7533\2.dscex'
$targetDir = 'E:\XB\解包\com\file\040msc\0xFEEA714A'
$targetC = Join-Path $targetDir '2.c'
$targetD = Join-Path $targetDir '2.dscex'
$log = Join-Path $targetDir '2_mscdec_roundtrip.log'

python -B .\tools\mscdec.py $ref -o $targetC -c -log $log
python -B .\tools\msclang.py $targetC -o $targetD -i
```

Use this inline checker to confirm the clean no-op roundtrip:

```powershell
@'
import hashlib, struct, sys
sys.path.insert(0, r'E:\TAURI_PROJECT\tools')
from msc_core import MscFile, Command

ref = r'E:\XB\解包\com\file\040msc\0x18AF7533\2.dscex'
target = r'E:\XB\解包\com\file\040msc\0xFEEA714A\2.dscex'
SCRIPT_BASE = 0x30

def read(path):
    with open(path, 'rb') as f:
        return f.read()

def load(path):
    msc = MscFile()
    with open(path, 'rb') as f:
        msc.readFromFile(f)
    return msc

def table(data):
    entry_rel = struct.unpack_from('<I', data, 0x10)[0]
    count = struct.unpack_from('<I', data, 0x18)[0]
    offset = SCRIPT_BASE + entry_rel
    if offset % 0x10:
        offset += 0x10 - (offset % 0x10)
    return offset, list(struct.unpack_from('<' + 'I' * count, data, offset))

def shape(script):
    return [
        (cmd.command, bool(cmd.pushBit), len(cmd.parameters))
        for cmd in script
        if isinstance(cmd, Command) and cmd.command not in (0xfffe, 0xffff)
    ]

def sort_key(name):
    return (
        name != 'main',
        int(name.split('_')[1]) if name.startswith('func_') else -1,
        name,
    )

ref_data = read(ref)
target_data = read(target)
ref_table_offset, ref_table = table(ref_data)
target_table_offset, target_table = table(target_data)
ref_msc = load(ref)
target_msc = load(target)
ref_shapes = {script.name: shape(script) for script in ref_msc.scripts}
target_shapes = {script.name: shape(script) for script in target_msc.scripts}
all_names = sorted(set(ref_shapes) | set(target_shapes), key=sort_key)
shape_diffs = [
    name for name in all_names
    if ref_shapes.get(name) != target_shapes.get(name)
]
body_diff = (
    sum(a != b for a, b in zip(ref_data[0x40:ref_table_offset], target_data[0x40:target_table_offset]))
    + abs((ref_table_offset - 0x40) - (target_table_offset - 0x40))
)

print('ref_sha', hashlib.sha256(ref_data).hexdigest().upper())
print('target_sha', hashlib.sha256(target_data).hexdigest().upper())
print('identical', ref_data == target_data)
print('len_delta', len(target_data) - len(ref_data))
print('entry_rel_ref', struct.unpack_from('<I', ref_data, 0x10)[0])
print('entry_rel_target', struct.unpack_from('<I', target_data, 0x10)[0])
print('entry_point_ref', struct.unpack_from('<I', ref_data, 0x14)[0])
print('entry_point_target', struct.unpack_from('<I', target_data, 0x14)[0])
print('unk_ref', struct.unpack_from('<I', ref_data, 0x1c)[0])
print('unk_target', struct.unpack_from('<I', target_data, 0x1c)[0])
print('byte_diff', sum(a != b for a, b in zip(ref_data, target_data)) + abs(len(ref_data) - len(target_data)))
print('body_diff_0x40_to_table', body_diff)
print('table_same', ref_table == target_table)
print('table_set_same', sorted(ref_table) == sorted(target_table))
print('table_diff_entries', sum(a != b for a, b in zip(ref_table, target_table)))
print('opcode_shape_diff_count_by_table_index', len(shape_diffs), shape_diffs[:20])
'@ | python -B -
```

Expected no-op result:

```text
identical False
len_delta 0
entry_point_ref 16
entry_point_target 16
unk_ref 777
unk_target 22
byte_diff 1221
body_diff_0x40_to_table 0
table_same False
table_set_same True
table_diff_entries 633
opcode_shape_diff_count_by_table_index 597 [...]
```

The table-index shape diff is expected for this no-layout build because scripts
are named by table index when read back. It does not indicate script body drift.

To verify C stability:

```powershell
$targetD = 'E:\XB\解包\com\file\040msc\0xFEEA714A\2.dscex'
$targetC = 'E:\XB\解包\com\file\040msc\0xFEEA714A\2.c'
$modedC = Join-Path $env:TEMP 'fee_target_moded2_redecompile.c'
$log = Join-Path $env:TEMP 'fee_target_moded2_redecompile.log'

python -B .\tools\mscdec.py $targetD -o $modedC -c -log $log

@'
import hashlib, os
target_c = r'E:\XB\解包\com\file\040msc\0xFEEA714A\2.c'
moded_c = os.path.join(os.environ['TEMP'], 'fee_target_moded2_redecompile.c')
def read(path):
    with open(path, 'rb') as f:
        return f.read()
a = read(target_c)
b = read(moded_c)
print('target_c_sha', hashlib.sha256(a).hexdigest().upper())
print('moded2_c_sha', hashlib.sha256(b).hexdigest().upper())
print('c_identical', a == b)
'@ | python -B -
```

Expected:

```text
c_identical True
```

## If The User Reports In-game Failure

1. Keep the generated target file intact until there is evidence to overwrite it.
2. Ask whether the tested file was exactly:
   `E:\XB\解包\com\file\040msc\0xFEEA714A\2.dscex`.
3. Re-run the no-op verification above before making tool changes. The expected
   script-body result is `body_diff_0x40_to_table 0`; table order may differ.
4. If script body and C roundtrip still match, investigate packaging or
   surrounding unit asset differences before changing `mscdec` / `msclang`.
5. If the user tests a modified C later, compare only intended script changes:
   unchanged script bodies should retain opcode shape and function pointer
   symbol resolution.

## Next Useful Work

- Add a project-sanctioned verification command or documented procedure for MSC
  no-op roundtrip checks, preferably under `docs/` first because the user
  requested no new `tools/` research/test scripts in this thread.
- Review whether old text postprocessors under `mscdec.py` should be formally
  documented as legacy-only or migrated into core CFG/symbol resolution.
- If real gameplay edits are needed, edit semantic C blocks intentionally and
  verify modified vs unmodified script body shape separately instead of
  expecting whole-file byte identity.
