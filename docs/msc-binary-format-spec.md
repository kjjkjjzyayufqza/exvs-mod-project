# MSC Binary Format Specification — EXVS2 Over Boost

> Verified against real EXVS2 Over Boost MSC files (hash `0xBDBE6FEA` test corpus).

---

## Table of Contents

1. [Overview](#overview)
2. [File Layout](#file-layout)
3. [Header (0x00–0x2F)](#header-0x000x2f)
4. [Reserved Region (0x30–0x3F)](#reserved-region-0x300x3f)
5. [Script Body](#script-body)
   - [Instruction Encoding](#instruction-encoding)
   - [pushBit Semantics](#pushbit-semantics)
6. [Script Offset Table](#script-offset-table)
7. [String Table](#string-table)
8. [Float Encoding](#float-encoding)
9. [Offset Conventions](#offset-conventions)
10. [Complete Opcode Table](#complete-opcode-table)
11. [EXVS2 vs Smash Bros Differences](#exvs2-vs-smash-bros-differences)

---

## Overview

MSC (Motion Script Code) is a bytecode format used by EXVS2 Over Boost to drive game-logic scripts. The format descends from the MSC VM found in Super Smash Bros. but carries EXVS2-specific changes to the header, endianness, and opcode set.

All multi-byte integers in the **header** are **little-endian (LE)**. All multi-byte integers in **opcode parameters** (the script body) are **big-endian (BE)**.

---

## File Layout

```
┌─────────────────────────────────┐  0x00
│  Header (48 bytes / 0x30)       │
├─────────────────────────────────┤  0x30
│  Reserved / Padding (16 bytes)  │
├─────────────────────────────────┤  0x40
│  Script Body (variable length)  │
│  (instructions, bytecode)       │
├─────────────────────────────────┤  0x30 + entriesOffset (aligned ×0x10)
│  Script Offset Table            │
│  (entryCount × 4 bytes, LE)     │
├─────────────────────────────────┤  (aligned ×0x10)
│  String Table (optional)        │
│  (stringCount × stringSize)     │
└─────────────────────────────────┘
```

---

## Header (0x00–0x2F)

48 bytes (0x30). All uint32 fields are **little-endian**.

| Offset | Size | Type | Field | Description |
|--------|------|------|-------|-------------|
| 0x00 | 8 | bytes | `magic` | Fixed: `B2 AC BC BA E6 90 32 01` |
| 0x08 | 4 | bytes | `version` | EXVS2 variant: `0A 21 AF 16` |
| 0x0C | 4 | bytes | `flags` | File-specific flags (e.g. `00 AE 00 00` or `00 00 00 00`) |
| 0x10 | 4 | LE uint32 | `entriesOffset` | Byte offset from 0x30 base to the script offset table |
| 0x14 | 4 | LE uint32 | `entryPoint` | Byte offset of the entry-point script (relative to 0x30 base) |
| 0x18 | 4 | LE uint32 | `entryCount` | Number of entries in the script offset table |
| 0x1C | 4 | LE uint32 | `unk` | Unknown (observed: `0x16`, `0x00`) |
| 0x20 | 4 | LE uint32 | `stringSize` | Max byte length per string slot (`0` if no strings) |
| 0x24 | 4 | LE uint32 | `stringCount` | Number of string slots (`0` if no strings) |
| 0x28 | 8 | bytes | `reserved` | Reserved, always zero |

### Magic Validation

A valid EXVS2 MSC file must begin with the exact 8-byte magic sequence:

```
B2 AC BC BA E6 90 32 01
```

The next 4 bytes identify the EXVS2 variant:

```
0A 21 AF 16
```

---

## Reserved Region (0x30–0x3F)

16 bytes of padding between the header and the script body. Observed as all zeros. Parsers should skip this region.

---

## Script Body

### Instruction Encoding

Scripts begin at absolute file offset **0x40** (i.e. `0x30 base + 0x10 padding`).

Each instruction consists of:

```
┌───────────────────────┬────────────────────────────┐
│  Opcode byte (1 byte) │  Parameters (0–4 bytes BE) │
└───────────────────────┴────────────────────────────┘
```

The opcode byte layout:

```
  Bit 7       Bits 6–0
┌─────────┬──────────────┐
│ pushBit │   opcode     │
└─────────┴──────────────┘
```

- **Bits 0–6**: Opcode index. The current VSAC27 interpreter accepts executable indices through `0x49`, with rejected holes at `0x0C` and `0x37`.
- **Bit 7**: Result/control bit. For ordinary instructions, it pushes the instruction result onto the evaluation stack. `try` (`0x2E`) uses it as call-return metadata instead.

Parameter bytes follow the opcode byte immediately, encoded in **big-endian**. The parameter format depends on the opcode (see the opcode table below).

### pushBit Semantics

For ordinary instructions, bit 7 (`| 0x80`) sends the instruction's last-result value through the common stack-push path at `0x14030F005`. This is the MSC VM's primary mechanism for composing expressions and passing arguments.

`try` (`0x2E`) is a native exception. The interpreter clears bit 7 while decoding the opcode and stores it in the call frame as a keep-return flag. Therefore `0xAE` does not immediately push a `try` result; it requests that the later callee return value be preserved on the caller stack.

Examples:

| Raw byte | Opcode | pushBit | Meaning |
|----------|--------|---------|---------|
| `0x0A` | `0x0A` pushInt | 0 | Push int (result discarded—unusual, typically always has pushBit) |
| `0x8A` | `0x0A` pushInt | 1 | Push int onto stack |
| `0x2E` | `0x2E` try | 0 | Set up a call frame and discard the eventual return value |
| `0xAE` | `0x2E` try | 1 | Set up a call frame and preserve the eventual return value |

---

## Script Offset Table

- **Location**: `0x30 + entriesOffset`, aligned up to a 0x10 boundary.
- **Size**: `entryCount × 4` bytes.
- **Encoding**: Each entry is a **LE uint32** representing a script start offset relative to the 0x30 base.

To compute the absolute file position of script entry *i*:

```
abs_offset = 0x30 + table[i]
```

---

## String Table

- **Location**: Immediately after the script offset table, aligned up to a 0x10 boundary.
- **Entry size**: `stringSize` bytes per slot (fixed-width, zero-padded).
- **Count**: `stringCount` entries.
- **Encoding**: UTF-8.

If `stringCount` is 0, the string table is absent.

String index `N` is referenced by the `printf` opcode and lives at:

```
string_table_base + N × stringSize
```

---

## Float Encoding

The MSC VM has no dedicated "push float" opcode. Float constants are stored as their IEEE 754 single-precision (32-bit) bit pattern inside a `pushInt` (`0x0A`) instruction.

For example, the float `1.0` (IEEE 754 = `0x3F800000`) is encoded as:

```
8A 3F 80 00 00
```

(`0x8A` = pushInt with pushBit, followed by `0x3F800000` in BE.)

The current VSAC27 interpreter does not expose the historical pymsc float opcode range. Decompilers must infer float interpretation from native handler signatures, variable use, or other executable evidence, not from old `addf`/`multf` mnemonic assignments.

---

## Offset Conventions

All offsets stored within the file—script positions in the offset table, jump targets (`jump`, `if`, `ifNot`, `else`, `try`)—are relative to the **script base** at absolute file offset `0x30`.

To convert a stored offset to an absolute file position:

```
absolute = 0x30 + stored_offset
```

To convert an absolute file position to a stored offset:

```
stored_offset = absolute - 0x30
```

---

## Complete Opcode Table

**Format column key** (struct pack characters, all BE):
- `B` = uint8 (1 byte)
- `H` = uint16 BE (2 bytes)
- `I` = uint32 BE (4 bytes)
- `''` = no parameters (0 bytes)

**Pops column**: Number of values consumed from the stack. Notation `B[0]` means "the value of the first parameter byte determines pop count."

**Pushes**: Ordinary instructions push their result when bit 7 is set. `try` stores that bit as a keep-return flag, and the eventual return operation performs the conditional push.

| Op | Mnemonic | Format | Pops | Description |
|----|----------|--------|------|-------------|
| `0x00` | `nop` | `''` | 0 | No operation |
| `0x01` | `abort_01` | `''` | 0 | Native error/abort path; not a NOP |
| `0x02` | `begin` | `HH` | 0 | Function prologue: argc, localVarCount |
| `0x03` | `end` | `''` | 0 | Function epilogue |
| `0x04` | `jump` | `I` | 0 | Unconditional jump to address |
| `0x05` | `jump5` | `I` | 0 | Unconditional jump (continue) |
| `0x06` | `return_val` | `''` | 1 | Return with value from stack |
| `0x07` | `return_void` | `''` | 0 | Return without value |
| `0x08` | `return_8` | `''` | 1 | Return with value (alt) |
| `0x09` | `return_9` | `''` | 0 | Return without value (alt) |
| `0x0A` | `pushInt` | `I` | 0 | Push 32-bit integer constant |
| `0x0B` | `pushVar` | `BH` | 0 | Push variable (B=scope: 0=local, 1=global; H=index) |
| `0x0C` | rejected | `I` in size helper | — | Not an executable interpreter case |
| `0x0D` | `pushShort` | `H` | 0 | Push 16-bit short constant (space optimization) |
| `0x0E` | `addi` | `''` | 2 | Integer add |
| `0x0F` | `subi` | `''` | 2 | Integer subtract |
| `0x10` | `multi` | `''` | 2 | Integer multiply |
| `0x11` | `divi` | `''` | 2 | Integer divide |
| `0x12` | `modi` | `''` | 2 | Integer modulo |
| `0x13` | `negi` | `''` | 1 | Integer negate |
| `0x14` | `i++` | `BH` | 0 | Increment integer variable |
| `0x15` | `i--` | `BH` | 0 | Decrement integer variable |
| `0x16` | `bitAnd` | `''` | 2 | Bitwise AND |
| `0x17` | `bitOr` | `''` | 2 | Bitwise OR |
| `0x18` | `bitNot` | `''` | 1 | Bitwise NOT |
| `0x19` | `bitXor` | `''` | 2 | Bitwise XOR |
| `0x1A` | `leftShift` | `''` | 2 | Left shift |
| `0x1B` | `rightShift` | `''` | 2 | Right shift |
| `0x1C` | `setVar` | `BH` | 1 | Assign stack top to variable |
| `0x1D` | `i+=` | `BH` | 1 | Add-assign to integer variable |
| `0x1E` | `i-=` | `BH` | 1 | Sub-assign to integer variable |
| `0x1F` | `i*=` | `BH` | 1 | Mul-assign to integer variable |
| `0x20` | `i/=` | `BH` | 1 | Div-assign to integer variable |
| `0x21` | `i%=` | `BH` | 1 | Mod-assign to integer variable |
| `0x22` | `i&=` | `BH` | 1 | AND-assign to integer variable |
| `0x23` | `i\|=` | `BH` | 1 | OR-assign to integer variable |
| `0x24` | `i^=` | `BH` | 1 | XOR-assign to integer variable |
| `0x25` | `equals` | `''` | 2 | Integer equality comparison |
| `0x26` | `notEquals` | `''` | 2 | Integer inequality comparison |
| `0x27` | `lessThan` | `''` | 2 | Integer less than |
| `0x28` | `lessOrEqual` | `''` | 2 | Integer less or equal |
| `0x29` | `greater` | `''` | 2 | Integer greater than |
| `0x2A` | `greaterOrEqual` | `''` | 2 | Integer greater or equal |
| `0x2B` | `not` | `''` | 1 | Logical NOT |
| `0x2C` | `printf` | `B` | B[0] | Print formatted string; pops B[0] arguments |
| `0x2D` | `sys` | `BB` | B[0] | System call; B[0]=argc, B[1]=syscall ID |
| `0x2E` | `try` | `I` | 0 | Function call frame setup; I=return address |
| `0x2F` | `callFunc` | `B` | B[0]+1 | Call function; pops function pointer + B[0] args |
| `0x30` | `callFunc2` | `B` | B[0]+1 | Call function variant 2 (set_main) |
| `0x31` | `callFunc3` | `B` | B[0]+1 | Call function variant 3 |
| `0x32` | `push` | `''` | 0 | Push the VM's separate last-result value |
| `0x33` | `pop` | `''` | 1 | Pop stack top into the last-result value |
| `0x34` | `if` | `I` | 1 | Branch to I if stack top == 0 (false) |
| `0x35` | `ifNot` | `I` | 1 | Branch to I if stack top != 0 (true) |
| `0x36` | `else` | `I` | 0 | Unconditional jump (else branch) |
| `0x37` | rejected | — | — | Not an executable interpreter case |
| `0x38`–`0x49` | `reserved_XX` | `''` | 0 | One-byte reserved/no-op cases in VSAC27 |

The shared size helper has dormant entries for `0x4A`–`0x4E`, but `sub_14030E270` rejects every opcode above `0x49` before dispatch. Those entries are not part of the executable VSAC27 language.

---

## EXVS2 vs Smash Bros Differences

| Aspect | EXVS2 Over Boost | Super Smash Bros (pymsc) |
|--------|------------------|--------------------------|
| Header uint32 endianness | Little-endian | Big-endian |
| Opcode parameter endianness | Big-endian | Big-endian |
| Version bytes (0x08–0x0B) | `0A 21 AF 16` | Different per game |
| Opcode `0x01` | Native abort/error path | Not present |
| Opcode `0x38`–`0x49` | One-byte reserved/no-op | Historical float mnemonic range |
| Compilation: header writes | LE uint32 | BE uint32 |
| Compilation: opcode params | BE | BE |

When building a compiler/assembler for EXVS2 MSC, the header fields (`entriesOffset`, `entryPoint`, `entryCount`, `unk`, `stringSize`, `stringCount`) must be written as **LE uint32**, while all opcode parameters within the script body must be written as **BE**.
