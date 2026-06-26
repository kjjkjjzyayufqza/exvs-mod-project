# MSC Toolchain Session Repair Record

- Date: 2026-06-26
- Scope: Current session repair notes for `tools/mscdec.py`,
  `tools/msclang.py`, `tools/disasmlib.py`, `tools/msc_cfg.py`, and the
  `040msc\0x18AF7533` -> `040msc\0xFEEA714A` roundtrip.
- Reference binary:
  `E:\XB\解包\com\file\040msc\0x18AF7533\2.dscex`
- Target workspace:
  `E:\XB\解包\com\file\040msc\0xFEEA714A`

## Why This Record Exists

This session started from a real in-game failure: a rebuilt
`0xFEEA714A\2.dscex` could crash, then later stopped crashing but left the unit
uncontrollable. The investigation separated three concerns that had been mixed
together:

1. binary layout preservation;
2. decompiler/compiler semantic drift;
3. editor overlay naming.

The final result is that the working path is the clean toolchain path:

```text
0x18AF7533\2.dscex
  -> tools\mscdec.py -c
  -> 0xFEEA714A\2.c
  -> tools\msclang.py -i
  -> 0xFEEA714A\2.dscex
```

No raw binary copy and no active `--layoutReference` are required.

## Current Session Fixes

### 1. Removed `--layoutReference` From The Active Flow

`--layoutReference` was tested in game and found unnecessary for this unit.
The no-layout build does not crash, does not freeze, and does not leave the
unit uncontrollable.

Current `tools/msclang.py` behavior:

- uses `scriptTable = refs.scriptPositions`;
- uses the compiled `main` entry point when present;
- uses the normal `unk` rule:
  `0x16 if len(msc.strings) > 0 or len(msc.scripts) > 10 else 0x00`;
- has no active `--layoutReference` CLI parameter.

Important conclusion:

`--layoutReference` was only preserving reference script table order. It was
not the cause of the gameplay freeze and it is not part of the clean repair.

### 2. Fixed Boolean Shape Drift In `mscdec.py`

In `tools/mscdec.py`, `ifToTernaryOp()` now preserves this branch shape:

```c
!a && !b
```

instead of beautifying it into:

```c
!(a || b)
```

The exact repaired case is `arrayRepresentation == [0, [0, 1]]`.

Why it matters:

`msclang.py` is not a C optimizer; different C surface shapes can lower into
different bytecode. This fix keeps the decompiler output closer to the original
branch structure.

### 3. Fixed Same-precedence Binary Parentheses In `ast2str.py`

`tools/ast2str.py` now parenthesizes right-hand same-precedence binary
expressions. This prevents expressions such as arithmetic chains or nested
logical trees from being printed in a way that changes stack evaluation order
when recompiled.

Why it matters:

The C text is an intermediate bytecode representation. Printing fewer
parentheses can change the AST read by `msclang.py`, which can change the final
MSC bytecode.

### 4. Fixed Condition Lowering In `msclang.py`

`tools/msclang.py` now has `normalizeConditionExpr()` and
`isComparisonOnlyOrTree()`.

Current behavior:

- removes double negation;
- only applies De Morgan lowering to non-comparison OR trees;
- keeps pure comparison OR trees as OR trees;
- avoids forcing the legacy `not + if(0x34)` AB34 path for comparison-only OR
  conditions.

Why it matters:

The previous lowering could turn valid decompiled C into bytecode with different
branch behavior. This was one of the real causes behind the earlier bad
roundtrip.

### 5. Fixed Nested `try` / `callFunc` pushBit Emission In `msclang.py`

`addArg()` now tracks nested `callFunc` / `try` depth before setting pushBit.

Current behavior:

- for normal expressions, set pushBit on the last real producer command;
- for function calls, walk backward through nested `callFunc` / `try` structure;
- set pushBit on the matching `try` (`0x2E`) instead of binary-patching
  `0x2E -> 0xAE` afterward.

The old `handle_EXVS2_2E_to_AE` binary patch remains only as a commented
historical reference with an English explanation. It is not active.

### 6. Fixed EXVS `sys_1` Callback Pointer Decompilation

The latest issue was `func_1012` still showing raw callback offsets such as:

```c
sys_1(0x10001, 0x2, 0x1, 0x35101);
```

This was not a `Resolve Overlay` problem. It was a decompile-time script
reference resolution gap.

Current fix:

- `tools/msc_cfg.py` defines signature-proven EXVS callback registry shapes:

```text
sys_1(0x10001, 0x2, slot, callback)
sys_1(0x10001, 0xa, slot, callback)
sys_1(0x10002, 0x2, actionHash, callback)
```

- `tools/disasmlib.py` calls the shared resolver during the active legacy
  disassembly path.
- `tools/msc_cfg.py` also calls it from the CFG reference path.

After the fix, `func_1012` decompiles as:

```c
sys_1(0x10001, 0x2, 0x1, func_850);
sys_1(0x10001, 0x2, 0x33, func_849);
...
sys_1(0x10001, 0xa, 0x2, func_995);
```

This is dynamic and signature-based. It is not tied to `func_1012`, a unit id,
or fixed offsets.

## `tools/msc_bak` Versus Current `tools`

The backup directory is useful as historical evidence, but it is not the active
truth. The current active toolchain intentionally differs from it.

### High-level Diff Size

Measured with `git diff --no-index --stat`:

```text
tools\msc_bak\mscdec.py   -> tools\mscdec.py    552 lines changed
tools\msc_bak\msclang.py  -> tools\msclang.py   150 lines changed
tools\msc_bak\disasmlib.py -> tools\disasmlib.py 116 lines changed
tools\msc_bak\msc_cfg.py  -> tools\msc_cfg.py    70 lines changed
tools\msc_bak\msc_core.py -> tools\msc_core.py  645 lines changed
```

### Core Module Split

`tools/msc_bak/mscdec.py` imports:

```python
from msc_core import *
```

Current `tools/mscdec.py` imports:

```python
from mscdec_msc import *
```

Current `tools/msc_core.py` is only a reference-only wrapper around
`msc_core_ref_only.py`. The active legacy decompile / compile path uses:

```text
tools\mscdec_msc.py
tools\msclang_msc.py
```

This is why fixes that affect live decompile behavior must be applied to the
active legacy path and, where relevant, mirrored into the CFG/reference path.

### `mscdec.py`

Backup behavior:

- `ifToTernaryOp()` rendered `[0, [0, 1]]` as `!(a || b)`.
- This was cleaner-looking C, but unsafe for bytecode roundtrip.

Current behavior:

- renders the same shape as `!a && !b`;
- keeps the output closer to the original branch bytecode;
- still contains older text-postprocess helpers, but the current core repair is
  in decompile shape, not postprocessing.

### `disasmlib.py`

Backup behavior:

- broad syscall heuristic:
  any syscall argument whose value looked like a script offset and was greater
  than `0x50` could be converted into a script reference.
- This could accidentally convert native data constants when they collided with
  script offsets.

Current behavior:

- broad heuristic is removed from the active path;
- syscall constants are treated as native data unless a known signature proves
  the argument is a script callback;
- the exact resolver is `resolve_exvs_syscall_script_refs()`.

### `msc_cfg.py`

Backup behavior:

- resolves normal `callFunc` / `callFunc2` / `callFunc3` and local-variable
  cross-script references;
- has no EXVS `sys_1` callback signature rules.

Current behavior:

- adds `EXVS_SYS1_SCRIPT_CALLBACK_SIGNATURES`;
- resolves the callback argument only for known EXVS registry shapes;
- uses duck typing for command objects so both the active legacy command class
  and the reference command class can use the same helper.

### `msclang.py`

Backup behavior:

- no `normalizeConditionExpr()`;
- no `isComparisonOnlyOrTree()`;
- `addArg()` did not track nested `try` / `callFunc` depth;
- `writeToFile()` dynamically changed `MSC_MAGIC[0x0D]` to `0xAE` when a
  try-pushBit existed.

Current behavior:

- normalizes only the condition shapes that are safe to normalize;
- preserves comparison-only OR trees;
- tracks nested function-call depth in `addArg()`;
- leaves `handle_EXVS2_2E_to_AE` as a commented historical reference only;
- writes the standard header path and lets the compiler emit correct command
  pushBits directly.

### `ast2str.py`

There is no `tools\msc_bak\ast2str.py` snapshot in the backup folder. The
current important behavior is the right-hand same-precedence parenthesizing
fix described above.

## Resolve Overlay Clarification

The Tauri MSC Workspace `Resolve Overlay` action currently calls
`renameScript2CallbacksByActionMask()`.

It is for action aliases and comments such as:

```c
func_241(0x519d49ce, ACTION_A_SHOT); //...
```

It is not responsible for script-table pointer resolution. Raw values like:

```c
sys_1(0x10001, 0x2, 0x1, 0x35101);
```

must be fixed by `mscdec` during binary-to-C decompilation. That is now handled
by the `sys_1` callback signature resolver.

## Verification Evidence From This Session

### Clean No-layout Roundtrip

Latest no-layout reference roundtrip evidence:

```text
reference SHA256: 0C9C8E29090046E07DC14747DAFA70C0CA387A8FD52E2DA6F20946600B697D43
target SHA256:    28418D89C789F890BA271F0C72217D50DCDB37B6EDB94CCD22906E0CD29EA388
len_delta: 0
byte_diff: 1221
body_diff_0x40_to_table: 0
table_same: false
table_set_same: true
table_diff_entries: 633
c_identical: true
```

Interpretation:

- full binary identity is not expected;
- script body bytes are stable;
- decompiled C is stable;
- table order and `unk` do not affect this tested unit.

### `func_1012` Callback Pointer Fix

Temporary verification command shape:

```powershell
python -B .\tools\mscdec.py `
  "E:\XB\解包\com\file\040msc\0xFEEA714A\2.dscex" `
  -o "$env:TEMP\fee_funcptr_check.c" `
  -c `
  -log "$env:TEMP\fee_funcptr_check.log"

python -B .\tools\msclang.py `
  "$env:TEMP\fee_funcptr_check.c" `
  -o "$env:TEMP\fee_funcptr_check.dscex" `
  -i

python -B .\tools\mscdec.py `
  "$env:TEMP\fee_funcptr_check.dscex" `
  -o "$env:TEMP\fee_funcptr_check_roundtrip.c" `
  -c `
  -log "$env:TEMP\fee_funcptr_check_roundtrip.log"
```

Observed result:

```text
c_identical: true
roundtrip_raw_sys1_arg4_script_offset_matches: 0
```

## Current Working Rules

- Keep the repair in core `mscdec` / `msclang` behavior.
- Do not use raw binary copy as a repair.
- Do not reintroduce `--layoutReference` unless new evidence proves it is
  needed for a different unit.
- Do not restore the old broad syscall heuristic that converts every
  offset-shaped syscall argument into a script reference.
- Do not use `Resolve Overlay` as a substitute for decompiler pointer
  resolution.
- Do not add new research or test scripts under `tools/` for this thread.
  Keep research notes under `docs/`.

## Next Safe Operational Step

If the user wants `E:\XB\解包\com\file\040msc\0xFEEA714A\2.c` itself to contain
the fixed `func_1012` callback names, regenerate `2.c` from the current
`2.dscex` using the updated `mscdec.py`, then run `Resolve Overlay` afterward
if ACTION aliases/comments are still desired.

Do not apply a manual text replacement to `2.c` for this pointer issue.
