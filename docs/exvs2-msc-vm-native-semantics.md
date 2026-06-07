# EXVS2 MSC Native VM Semantics

## Scope

This note records MSC VM behavior recovered from the current EXVS2 Over Boost
executable. It supersedes pymsc-derived opcode assumptions for this build.

Evidence anchor:

- Module: `vsac27_Release.exe`
- SHA-256: `cae3636aa4870d356eb25837badeb83482a71e290961442decf13cf87e1baa76`
- Loader: `sub_14030DEF0`
- Interpreter: `sub_14030E270`
- Instruction-size function: `sub_14030DB30`

## Recovered Design

The VM has an evaluation stack, a separate last-result value, and explicit call
frames. This distinction explains instruction sequences that a simple
push/pop-only model cannot recover.

- Ordinary opcode bit 7 pushes the instruction result through the shared path
  at `0x14030F005`.
- `push` (`0x32`) pushes the last-result value.
- `pop` (`0x33`) moves the top stack value into last-result.
- `sys` (`0x2D`) consumes its declared arguments and calls a domain-installed
  native handler.
- `try` (`0x2E`) records caller state and a keep-return flag.
- `callFunc` (`0x2F`) enters the callee frame.
- `callFunc2` (`0x30`) yields the selected target to the outer scheduler.
- `callFunc3` (`0x31`) switches execution to the selected target under the
  alternate begin mode.
- Return instructions restore caller state and preserve the return value only
  when requested by the preceding call setup.

The two `begin` (`0x02`) operands are a parameter slot count and total frame
slot count. The second operand is not a source-level local-variable count. The
native prologue resizes the frame, zero-fills missing parameter/frame slots, and
ignores or truncates surplus caller arguments.

For `try`, bit 7 is not the ordinary immediate push operation. The interpreter
clears the bit at `0x14030EE0D` and stores it as call-return metadata. Thus
`0xAE` means that the later callee result is retained.

## Opcode Range

The interpreter accepts indices through `0x49` and rejects larger values.
`0x0C` and `0x37` are rejected. `0x38..0x49` are one-byte reserved/no-op slots
in this build. Dormant length entries for `0x4A..0x4E` in the shared size helper
do not make those opcodes executable.

Consequently, historical float mnemonic assignments for `0x38..0x4D` are not
valid evidence for VSAC27.

## Analysis Consequence

Decompiler argument recovery must simulate:

- basic-block stack state;
- last-result state;
- call-frame setup and return restoration;
- branch merges with bounded phi values;
- nested syscall and expression results.

A backward scan of contiguous push instructions is insufficient. It loses
function results, branch-dependent values, and values routed through the
last-result register.

## Engineering Rule

Treat native behavior as build-profile data. When another executable revision
changes a dispatch table, instruction boundary, or handler implementation,
record a new profile with its own hash and addresses instead of generalizing
from names inherited from older tools.
