# msclang Layout Reference Table Research

- Date: 2026-06-26
- Area: `tools/mscdec.py`, `tools/msclang.py`, `tools/ast2str.py`
- Files under test:
  - Reference: `E:\XB\解包\com\file\040msc\0x18AF7533\2.dscex`
  - Target source: `E:\XB\解包\com\file\040msc\0xFEEA714A\2.c`

## Finding

The previous `--layoutReference` implementation remapped the reference script
offset table through physical script index:

1. Sort the reference offsets.
2. Resolve each old table offset to a physical index.
3. Use `scriptPositions[physicalIndex]` in the rebuilt file.

That is only correct when the compiled C declaration order is physical order.
The current `2.c` declaration order follows the reference offset-table order:

```text
main, func_3, func_1, func_4, func_18, func_2, ...
```

With the physical-index remap, table entry 1, which should still point to
`func_3`, was redirected to the compiled position for physical index 3. This
can preserve decompiled-looking text while breaking runtime table-index
semantics.

## Fix

`--layoutReference` now maps each old reference table offset to the decompiler
symbol it represents:

1. Resolve the old offset to `main` when it is the reference entry point.
2. Otherwise resolve the old offset to `func_<physicalIndex>`.
3. Look up that symbol in the current compiled `refs.functions`.
4. Write the current compiled position for that symbol into the rebuilt table.
5. Fall back to the old physical-index mapping only if the symbol does not exist.

This keeps table-index identity stable without hardcoded offsets or unit IDs.

## Final Evidence

The accepted repair path is a real roundtrip, not binary preservation:

```text
0x18AF7533\2.dscex
  -> tools\mscdec.py -c
  -> 2.c
  -> tools\msclang.py --layoutReference 0x18AF7533\2.dscex
  -> 0xFEEA714A\2.dscex
```

The current target was regenerated through that pipeline:

```text
reference SHA256: 0C9C8E29090046E07DC14747DAFA70C0CA387A8FD52E2DA6F20946600B697D43
target SHA256:    0C9C8E29090046E07DC14747DAFA70C0CA387A8FD52E2DA6F20946600B697D43

target length: 255424 bytes
entriesOffset: 251299
entryPoint: 0x10
entryCount: 1015
unk: 777

byte_diff: 0
opcode_shape_diff_count: 0
param_type_shape_diff_count: 0
```

The regenerated target C was also decompiled again from the regenerated
`2.dscex`; the second decompile matched the first C byte-for-byte:

```text
target 2.c SHA256:  B41F5F16F486355239576FDF182F6B95384FBD34562ACD42514FC76B332F6E57
moded2.c SHA256:    B41F5F16F486355239576FDF182F6B95384FBD34562ACD42514FC76B332F6E57
c_identical: true
```

## Compiler/Decompiler Shape Fixes

The layout table fix alone exposed expression-shape drift. The remaining
roundtrip failures were eliminated by preserving decompiler boolean shape
instead of folding everything to prettier C:

- `ast2str.BinaryOp.__str__()` now parenthesizes right-hand same-precedence
  binary expressions, preserving stack evaluation order for arithmetic chains.
- `mscdec.ifToTernaryOp()` maps the `[0, [0, 1]]` boolean-array shape to
  `!a && !b` instead of `!(a || b)`. This keeps the original two-branch
  `if/ifNot` shape instead of losing it through De Morgan prettification.
- `msclang.normalizeConditionExpr()` no longer rewrites `!(comparison || ... ||
  comparison)` into De Morgan form. Pure comparison OR trees are kept as OR
  trees so `ifNot` lowering matches the original bytecode.
- `msclang` applies the same comparison-only OR check before forcing the legacy
  `not + if(0x34)` AB34 path for nested OR. This fixes the three-term OR in
  `func_648` without hardcoding that function.

These fixes are structural AST/bytecode-shape rules. They do not depend on unit
IDs, function names, offsets, or raw byte preservation.

## Reverted Probe

A probe that converted trailing `not + if(0x34)` into `ifNot(0x35)` was tested
and reverted. It expanded opcode-shape drift from 8 functions to 86 functions,
so the current decompiler expressions cannot be globally folded that way.

## Rejected Raw Preservation

The current target source
`E:\XB\解包\com\file\040msc\0xFEEA714A\2.c` was compared against a fresh
`mscdec` decompile of the reference binary. A direct text diff is noisy because
function order and offset-vs-symbol rendering differ, so the comparison used a
canonical profile:

1. Strip comments.
2. Extract global declarations.
3. Extract all `main` / `func_N` bodies by name.
4. Normalize reference script offsets into their matching `func_N` symbols.
5. Compare function profiles independent of file order.

Result:

```text
globals_equal: true
function_count: 1015 / 1015
canonical_function_diffs: 0
```

This proves the C source is semantically a no-op reference source, but copying
the reference binary back out is not an acceptable compiler repair. The active
repair path must keep going through `mscdec -> msclang` and reduce the remaining
compiler lowering drift directly.
