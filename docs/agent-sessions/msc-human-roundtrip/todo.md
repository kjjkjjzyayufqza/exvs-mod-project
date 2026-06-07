# MSC Human Roundtrip Rewrite

## Current Task

- Build new EXVS2 MSC decode/repack work under `E:\research\msc_reserch`.
- Use a TDD flow: write verification first, then implement the smallest byte-exact roundtrip.
- Preserve the final target: `msc -> human-readable text IR -> msc` with byte-for-byte comparison.

## Status

- [x] Read repository rules and Cursor rule.
- [x] Read MSC binary/spec and native-truth workflow docs.
- [x] Inspected existing research root and found legacy `mscdec_EXVS2`, `msclang_EXVS2`, and real sample files under `EXVS2_msc`.
- [x] Create isolated new rewrite project under `E:\research\msc_reserch`.
- [x] Add tests for real EXVS2 sample byte-perfect roundtrip.
- [x] Implement lossless parser/text IR/repacker.
- [x] Run verification and record results.
- [x] Add IDA/game-exe ground-truth provider boundary tests.
- [x] Expand roundtrip coverage to all 16 discovered corpus files.
- [x] Add string-table/rare-opcode regression coverage.

## Remaining

- [x] Connect `ida-pro-mcp` for read-only current-IDB evidence.
- [x] Add normalized IDA export ingestion for constructor handler tables.
- [x] Add first IDA-grounded syscall annotation layer.
- [x] Add first conservative stack-argument recovery and `sys_4F` subcommand annotations.
- [x] Add initial normalized IDA export ingestion for syscall subcommand facts from Hex-Rays switch-case excerpts.
- [x] Add `sys_55` category judgement state semantics from IDA/native notes.
- [x] Model native domain inheritance so `CDepictionScript` resolves base handlers.
- [x] Add the first `sys_4B` shell-entry semantic slice from live IDA evidence.
- [x] Build the first editable semantic text overlay on top of the byte-preserving IR.
- [x] Replace contiguous-only argument recovery with iterative CFG stack analysis.
- [x] Model native last-result, `try`/`callFunc`, returns, nested syscalls, expressions, and branch phi values.
- [x] Anchor the executable opcode profile to `sub_14030E270` and instruction sizes to `sub_14030DB30`.
- [x] Correct legacy opcode assumptions against the current VSAC27 executable.
- [x] Verify all 16 real corpus files with zero incomplete syscalls and byte-exact repacking.
- [x] Recover the native function catalog from offset table, `begin`, and call-family VM behavior.
- [x] Model `begin(parameter_slot_count, frame_slot_count)` without assuming source-level local variables.
- [x] Distinguish `callFunc`, `callFunc2`, and `callFunc3` VM modes and host-boundary transfer behavior.
- [x] Add standalone `mscsrc` text export/import as the first full human-readable carrier.
- [x] Verify `msc -> mscsrc -> msc` byte-exact on all 16 real corpus files.
- [x] Compile selected fixed-width rendered `mscsrc` instruction edits back into raw bytes.
- [x] Render direct function targets as `fn_XXXXXXXX` and import them back to 32-bit offsets.
- [x] Add read-only CFG stack comments to `mscsrc` syscall lines.
- [x] Verify stack-commented `mscsrc` remains byte-exact on a real depiction script.
- [x] Allow CFG-proven top-level literal `stack-arg` comments to rewrite their source push instructions.
- [x] Extend `stack-arg` editing to nested literal values with explicit source paths and conflict checks.
- [x] Add structure-preserving `stack-expr` literal edits over CFG expression values.

## Next Actions

1. Add structured function body export that groups calls, syscalls, expressions, and branches without losing instruction offsets.
2. Continue IDA-grounded handler work, prioritizing broader `sys_4B`/`sys_47` subcommands and `sys_53`/`sys_54` camera semantics.
3. Add separate VM profiles when another executable revision is analyzed; do not mutate VSAC27 evidence in place.
