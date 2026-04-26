# MSC System Problems Analysis

## Overview

MSC (Motion Script Command) is the scripting bytecode VM used by EXVS2 Over Boost (and originally by Super Smash Bros). Our toolchain is a fork of [jam1garner/pymsc](https://github.com/jam1garner/pymsc) that has been heavily patched to handle EXVS2's variant format. This document lists every known structural problem, hack, and fragility in the current implementation.

---

## Architecture Map (Current State)

```
[.bscex / .cscex / .dscex / .bin]  (MSC bytecode)
         │
         ├── mscdec.py          (decompile: bytecode → C)
         │    ├── mscdec_msc.py (LE core: MscFile, Command, MscScript)
         │    ├── disasmlib.py  (disassembly + script ref resolution)
         │    ├── ast2str.py    (custom AST → C string)
         │    └── exvs_native_truth.py (symbol mapping)
         │
         └── msclang.py         (compile: C → bytecode)
              ├── msclang_msc.py (BE core: MscFile, Command, MscScript)
              ├── xml_info.py    (syscall XML metadata)
              └── exvs_native_truth.py (symbol mapping)

[Frontend]
  ├── MSCEdit/page.tsx           (old UI, handles .bin files)
  ├── TestEditor/components/msc-editor/MscWorkspaceView.tsx (new UI, handles .bscex/.cscex/.dscex)
  ├── TestEditor/utils/mscWorkspaceUtils.ts (path helpers)
  ├── TestEditor/utils/mscActionRename.ts (action callback rename)
  └── lib/fhm2d_mscAssetFormatFuc.ts (FHM2D extract naming)
```

---

## Problem List

### 1. Dual Core Libraries with Divergent Endianness

**Files**: `msclang_msc.py` (compile core) vs `mscdec_msc.py` (decompile core)

两个文件是同一份 pymsc 代码的 **不同分叉**，各自做了不同的 EXVS2 适配，互相不兼容：

| Aspect | msclang_msc.py (compile) | mscdec_msc.py (decompile) |
|---|---|---|
| `ENDIANESS` constant | `'>'` (Big Endian) | not defined (implicit `'>'`) |
| `Command.read()` | uses `ENDIANESS` (`'>'`) | uses hardcoded `'>'` |
| `Command.write()` | default `endian=ENDIANESS` (`'>'`) | default `endian='<'` (LE!) |
| `readInt()` | uses passed `endian` param | **ignores param, hardcodes `"<"`** |
| Magic bytes | `\x0A\x21\xAF\x16` (bytes 8-11) | `\xFD\x02\x00\x00` (bytes 8-11) |
| `custom_01` opcode (0x1) | present | **missing** |

**Impact**: Decompiler reads headers as LE but body as BE; compiler writes headers/body with mixed endianness. The `readInt` function in `mscdec_msc.py` completely ignores its `endian` parameter:

```python
def readInt(f, endian):
    endian = "<"  # ← hardcoded override, parameter is useless
```

This means the header is always read as LE regardless of what the caller requests, while individual command bytes are still unpacked as BE. This "works" for EXVS2 because the header happens to be LE and opcodes are single bytes, but it is a landmine.

### 2. `handle_EXVS2_2E_to_AE` Binary Patch Hack

**File**: `msclang.py` lines 1117-1159

After compilation, a binary patch scans the output `.mscsb` file for specific byte patterns and replaces `0x2E` with `0xAE` at hardcoded positions.

```python
target_index1 = bytes([0x8A, 0x00, 0x01, 0x00, 0x01, 0x8A, 0x00, 0x00, 0x00, 0x10, 0x8B, 0x00, 0x00, 0x01])
# ...
content[target_position1 + len(target_index1)] = 0xAE
```

**Root Cause**: Opcode `0x2E` is "try" (function call frame setup). In EXVS2, certain call sites need the high bit set (`0x2E | 0x80 = 0xAE`, i.e., pushBit=true). The compiler does not correctly propagate the pushBit for these specific patterns, so a post-compilation binary patch is applied.

**Impact**:
- Only matches 3 hardcoded byte patterns; any change in script structure breaks the patch
- No error reporting if patterns are not found (truthy check on `find()` returning -1 is incorrect — `if target_position1:` is True even when `-1`)
- Cannot generalize to new scripts or modified function layouts

### 3. Unstable Loop Detection in disasmlib.py

**File**: `disasmlib.py`, function `emuScript()`

The disassembler uses recursive path exploration to resolve script references. It has multiple hard limits and hacks to prevent infinite loops:

```python
if depth > 990:
    return False  # ← arbitrary recursion limit

if iteration == 10000:
    raise Exception("iteration exceeded 10000, aborting recursive search")

if iteration >= 2000:
    # "i dont know how to fix it, so i just [endOfBlock - depth] to avoid infinite loop"
    finished = emuScript(script, jumpIndex, stack, passCount, endOfBlock - depth, depth+1)
```

**Impact**:
- `depth > 990` silently abandons analysis, producing incomplete script reference resolution
- `iteration >= 2000` applies a `endOfBlock - depth` offset that has no theoretical basis — it just "sometimes works"
- Large/complex scripts (like EXVS2 character scripts with 1000+ functions) routinely hit these limits
- No feedback to the user about what was missed

### 4. Function Pointer Resolution via Regex + Log File

**File**: `mscdec.py`, functions `handle_func_241_pointer_funcs`, `handle_sys_1_0x10001_0x10_var1_pointer_funcs`, `handle_var3_sys_0_0x700000_0_var1_0xa_pointer_funcs`

After decompilation, three separate post-processing passes scan the output `.c` file with regex to find hex pointer values, cross-reference them against a log file (`log.txt`) to find function names, and do text replacement.

```python
# Pattern 1: func_241(0xHEX, 0xHEX); → func_241(0xHEX, func_name);
# Pattern 2: sys_1(0x10001, 0x10, var1, func_X(func_Y(var1, 0x2)));
# Pattern 3: var3 = sys_0(0x700000, 0, var1, 0xa); → scan return values
```

**Impact**:
- Relies on `log.txt` from `mscdec_msc.py` logging script offsets during parsing — if log format changes, everything breaks
- Pointer values are offset by `+0x30` (hardcoded header size assumption)
- Each handler is hardcoded to one specific call pattern; new patterns require new handler functions
- The `handle_sys_1_0x10001_0x10_var1_pointer_funcs` function hardcodes `"int func_981(int arg0)"` as the target function signature

### 5. Duplicate UI Implementations

**Files**: `MSCEdit/page.tsx` + `MSCEdit/components/FileList.tsx` (old) vs `TestEditor/components/msc-editor/MscWorkspaceView.tsx` (new)

Two completely separate MSC editor UIs exist:

| Old (MSCEdit) | New (MscWorkspaceView) |
|---|---|
| Handles `.bin` files | Handles `.bscex / .cscex / .dscex` files |
| Simple folder picker + file list | Integrated into TestEditor workspace |
| Convert/Replace/Repack per file | Convert/Replace(+ActionRename)/Repack per file |
| No EXVS mapping support | Passes `--exvsMapping` to tools |
| Hardcoded `compression.js` path | Same hardcoded `compression.js` path |
| `func_0 → main` simple replace | `func_0 → main` + action mask rename for 2.c |

**Impact**: Any improvement needs to be duplicated in both UIs. The old UI is essentially dead code but still accessible.

### 6. Hardcoded External Tool Paths

**File**: Both UI files

```typescript
const toolPath = "E:\\XB\\解包\\com\\compression.js";
```

Repack functionality depends on an external Node.js compression tool at a fixed local path. This is not portable and will fail on any other machine.

### 7. Type Inference by Frequency Counting

**File**: `mscdec.py`, functions `getGlobalVars()` and `getLocalVarTypes()`

Variable types (int vs float) are determined by counting how often a variable appears in integer vs float operations and picking the majority:

```python
if floatCount > intCount:
    globalVarTypes[i] = "float"
```

**Impact**:
- A variable used 3 times as int and 2 times as float → declared as int, but those 2 float usages are now type-mismatched
- No support for pointer types, struct types, or enum types
- Cast operations (`intToFloat`/`floatToInt`) in the bytecode are used as hints but can be ambiguous

### 8. Float Detection by Heuristic

**File**: `disasmlib.py`, function `guessIsFloat()`

Determines whether a 32-bit `pushInt` constant is actually a float by checking:
- Is it close to zero?
- Is the exponent in range [-30, 30]?
- Are the low mantissa bits zero?

**Impact**: False positives and negatives. A value like `0x42480000` (50.0f) is correctly identified, but edge cases like small integer hash values in the float range will be misidentified.

### 9. `func_0` → `main` Manual Step

**Files**: Both UIs

After decompilation, users must manually click "Replace" to rename `func_0` to `main`. This is because `mscdec_msc.py` names scripts sequentially (`func_0`, `func_1`, ...) and only identifies the entrypoint script internally but doesn't rename `func_0` globally.

**Impact**: Extra manual step for every decompile cycle; easy to forget.

### 10. Action Mask Rename Brittleness

**File**: `mscActionRename.ts`

The action rename system:
1. Parses `0.c` to find `func_143` body
2. Scans for `func_95(0xHASH, ...)` calls inside nested if/else blocks
3. Infers action semantics from `global48 & MASK` conditions
4. Renames callbacks in `2.c` that match `func_241(HASH, callback)` bindings

**Impact**:
- Hardcoded to `func_143`, `func_95`, `func_241`, `global48`, `global20`, `global2` — any script restructuring breaks this
- Action mask table (`ACTION_BY_MASK`) covers only 12 known masks
- Brace-counting parser for function body extraction is fragile with nested structures

### 11. Three Different File Extensions for the Same Format

The MSC bytecode format uses different extensions depending on context:

| Extension | Context |
|---|---|
| `.bin` | Old workflow / generic |
| `.bscex` | FHM2D-extracted MSC subfile 0 (behaviour script) |
| `.cscex` | FHM2D-extracted MSC subfile 1 (character script) |
| `.dscex` | FHM2D-extracted MSC subfile 2 (depiction script) |
| `.mscsb` | pymsc compiler output |

All are identical MSC bytecode but the tooling treats them differently based on extension.

### 12. No Round-Trip Guarantee

There is no guarantee that `decompile(compile(source)) == source` or `compile(decompile(bytecode)) == bytecode`. Known causes:

- The `0x2E → 0xAE` patch only works for specific patterns
- `pushShort` (0xD) vs `pushInt` (0xA) substitution is lossy
- String table ordering may differ
- Float ↔ int constant ambiguity
- Script offset references depend on compilation order
- ExvsNativeTruthMapping encode/decode can introduce asymmetries

### 13. ExvsNativeTruthMapping Adds Hidden Complexity

**File**: `exvs_native_truth.py`

This system maps opaque hex constants in MSC scripts to symbolic function names using a JSON config file. It supports two rule kinds:

- `function_ref`: hex value → function symbol (with offset arithmetic)
- `script_delta`: hex value → relative offset into another script

**Impact**:
- The mapping file is version-specific (`exvs_0xF1EF3B32.native_truth.json`)
- Both compiler and decompiler must use the same mapping or symbols break
- Adds `decode_add` / `encode_add` offset math that is hard to debug
- `anchor_baseline_offset` assumes a fixed reference script position

### 14. No Proper Error Handling in Post-Processing

**File**: `mscdec.py`

The entire post-processing chain (`handle_exvs2_pointer_funcs`) runs after decompilation and silently produces garbage if:
- Log file format doesn't match expected pattern
- Function pointer offsets are wrong
- Target functions don't exist in the decompiled output
- Regex patterns don't match new code patterns

### 15. Switch-Case Conversion Hack

**File**: `mscdec.py`, functions `convert_nested_if_else_to_switch`, `extract_switch_cases_from_conditions`

After pointer resolution, another pass scans the `.c` file for deeply nested if-else chains that match `(0xHEX == arg0) { var1 = func_X; }` patterns and rewrites them as switch-case.

**Impact**:
- Requires ≥5 cases to trigger (hardcoded threshold)
- Uses regex over generated C source — vulnerable to formatting changes
- The generated switch-case loses the default fallthrough behavior of the original bytecode
- Only works on functions with signature `int func_X(int arg0)` containing `int var1; ... return var1;`

### 16. MSC Header Magic Bytes Inconsistency

`msclang_msc.py` and `mscdec_msc.py` define different magic bytes:

```python
# msclang_msc.py (compiler reads these)
MSC_MAGIC = b'\xB2\xAC\xBC\xBA\xE6\x90\x32\x01\x0A\x21\xAF\x16\x00\x00\x00\x00'

# mscdec_msc.py (decompiler reads these)
MSC_MAGIC = b'\xB2\xAC\xBC\xBA\xE6\x90\x32\x01\xFD\x02\x00\x00\x00\x00\x00\x00'
```

Bytes 8-11 differ (`0x0A21AF16` vs `0xFD020000`). The decompiler never validates the magic at all — it just starts reading from offset 0x10. The compiler writes the Smash Bros magic. Neither is correct for EXVS2.

### 17. Global Mutable State Everywhere

**Files**: `msclang.py`, `mscdec.py`, `disasmlib.py`

All three files use extensive global mutable state:

```python
# msclang.py
global refs, localVars, localVarTypes, args, xmlInfo, nodeDic, nodeCount, isNot, position, outputAB34, binaryOpCount

# mscdec.py
global currentFunc, index, localVars, globalVars, funcNames, xmlInfo

# disasmlib.py
global clearedPaths, scriptCalledVars, mscFile, funcName, iteration
```

**Impact**: Cannot run multiple decompilations in parallel, cannot unit test individual functions, state leaks between script analyses.

### 18. Mixed Chinese/English Debug Output

Throughout the codebase, debug prints mix languages and include debugging artifacts:

```python
print("nodeOut.append(Command(0x2B, pushBit=True))")  # msclang.py
print("b")  # msclang.py
logging.info("Ignore Script Ref for x.parameters[0]")  # disasmlib.py
```

These pollute stdout/stderr and make it hard to distinguish real errors from debug noise.

### 19. `if 0x34 if isIfNot else 0x34` Dead Logic

**File**: `msclang.py` line 734

```python
nodeOut.append(Command(0x34 if isIfNot else 0x34, [ifFalseLabel]))
```

The condition is meaningless — both branches produce `0x34`. This suggests `isIfNot` was intended to select between `0x34` (if) and `0x35` (ifNot) but was never properly implemented.

### 20. No Workspace State Persistence

**File**: `MscWorkspaceView.tsx`

The MSC workspace view stores the selected folder path in React state only. There is no persistence — the folder must be re-selected every time the editor is reopened.

---

## Summary: Core Difficulties

1. **No canonical MSC format spec** — everything is reverse-engineered from two different games (Smash Bros vs EXVS2) with incompatible adaptations
2. **Endianness is a mess** — header LE, body BE, write LE, mixed in the same file
3. **Post-compilation binary patching** (`0x2E→0xAE`) is fundamentally fragile and cannot scale
4. **Post-decompilation regex rewriting** (pointer→name, if-else→switch) is O(n²) in complexity and breaks on any structural change
5. **No round-trip fidelity** — decompile then recompile produces different bytecode
6. **Loop analysis is probabilistic** — deep/complex scripts silently lose information
7. **Two divergent UIs** doing the same thing with different code
8. **Everything is hardcoded** — function numbers, magic bytes, file paths, iteration limits
9. **Zero test coverage** — no unit tests, no integration tests, no regression tests
10. **Mod developers face a 6-step manual workflow** (extract → decompile → replace func_0 → rename actions → edit → recompile + binary patch) with no guardrails

---

## Recommended Next Steps (Not Implementation, Just Direction)

1. Unify `msclang_msc.py` and `mscdec_msc.py` into a single `msc_core.py` with explicit endianness configuration
2. Fix the `0x2E → 0xAE` issue at the compiler level (correct pushBit propagation) instead of binary patching
3. Replace `emuScript` loop analysis with proper control-flow graph construction
4. Move pointer resolution into the decompiler proper (using ExvsNativeTruthMapping) instead of post-processing regex
5. Remove the old MSCEdit page and consolidate into MscWorkspaceView
6. Add round-trip tests: `compile(decompile(X)) == X` for known-good scripts
7. Externalize all hardcoded constants (magic bytes, function numbers, tool paths) into config
