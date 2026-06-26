# msclang Layout Reference Table Research

- Date: 2026-06-26
- Area: `tools/mscdec.py`, `tools/msclang.py`, `tools/ast2str.py`
- Files under test:
  - Reference: `E:\XB\解包\com\file\040msc\0x18AF7533\2.dscex`
  - Target source: `E:\XB\解包\com\file\040msc\0xFEEA714A\2.c`
  - Target binary: `E:\XB\解包\com\file\040msc\0xFEEA714A\2.dscex`

## Final Finding

`--layoutReference` is not required for this unit and has been removed from the
active `msclang.py` CLI.

The earlier hypothesis was that the game required the original script offset
table order. In-game testing disproved that for this case:

1. A build preserving the reference table worked.
2. A build preserving the table but not the reference `unk` field also worked.
3. A clean build with no `--layoutReference` and no table preservation also
   worked.

Therefore the previous in-game freeze / no-control behavior was caused by
roundtrip bytecode-shape drift, not by the script table order.

## What Was Removed

The active compiler no longer accepts or uses:

```text
--layoutReference
```

The following support code was removed from `tools/msclang.py`:

- reference layout parsing
- reference table-to-symbol remapping
- reference physical-order script reordering
- reference entry-point remapping
- reference header-prefix preservation

`msclang` now writes its normal compiler layout:

```text
script table = refs.scriptPositions
entry point  = main position, or 0x10 when main is absent
unk          = compiler default derivation
header       = MSC_MAGIC
```

## Current Clean Pipeline

The accepted no-op roundtrip is:

```text
0x18AF7533\2.dscex
  -> tools\mscdec.py -c
  -> 0xFEEA714A\2.c
  -> tools\msclang.py -i
  -> 0xFEEA714A\2.dscex
```

No raw binary copying is involved.

## Current Evidence

The current target was regenerated with no `--layoutReference`:

```text
reference SHA256: 0C9C8E29090046E07DC14747DAFA70C0CA387A8FD52E2DA6F20946600B697D43
target SHA256:    28418D89C789F890BA271F0C72217D50DCDB37B6EDB94CCD22906E0CD29EA388

target length: 255424 bytes
entriesOffset: 251299
entryPoint: 0x10
entryCount: 1015
reference unk: 777
target unk: 22

byte_diff: 1221
body_diff_0x40_to_table: 0
table_same: false
table_set_same: true
table_diff_entries: 633
opcode_shape_diff_count_by_table_index: 597
```

Interpretation:

- Script body bytes are identical.
- The script offset table contains the same offsets but in a different order.
- The table-index-based shape diff is expected because the reader names scripts
  by table index; it does not indicate opcode drift in the script body.
- In-game testing showed this table order difference does not affect this unit.

The regenerated target C was also decompiled again from the regenerated
`2.dscex`; the second decompile matched the first C byte-for-byte:

```text
target 2.c SHA256:  B41F5F16F486355239576FDF182F6B95384FBD34562ACD42514FC76B332F6E57
moded2.c SHA256:    B41F5F16F486355239576FDF182F6B95384FBD34562ACD42514FC76B332F6E57
c_identical: true
```

## Actual Core Fixes

The roundtrip failures were eliminated by preserving decompiler bytecode shape
instead of folding everything to prettier C:

- `ast2str.BinaryOp.__str__()` parenthesizes right-hand same-precedence binary
  expressions, preserving stack evaluation order for arithmetic chains.
- `mscdec.ifToTernaryOp()` maps the `[0, [0, 1]]` boolean-array shape to
  `!a && !b` instead of `!(a || b)`, preserving the original branch shape.
- `msclang.normalizeConditionExpr()` keeps pure comparison OR trees as OR trees
  instead of forcing De Morgan form.
- `msclang` applies the same comparison-only OR check before forcing the legacy
  `not + if(0x34)` AB34 path for nested OR.

These fixes are structural AST/bytecode-shape rules. They do not depend on unit
IDs, function names, offsets, table order, or raw byte preservation.

## Reverted Or Rejected Paths

- Raw binary preservation was rejected. The output must go through
  `mscdec -> msclang`.
- A probe that converted trailing `not + if(0x34)` into `ifNot(0x35)` globally
  expanded opcode-shape drift and was reverted.
- `--layoutReference` table preservation was tested in-game and then removed
  after the no-layout build also behaved correctly.

