# MSC Human Roundtrip Rewrite Process

## 2026-06-12 Readable C Direction Refresh

- Current user objective: follow `task.md` and create at least 20 todo list items in one pass so the work can continue coherently.
- Re-read `AGENTS.md` and `.cursor/rules/custom-rules.mdc`.
- Re-read `task.md`. The current product direction is no longer the byte-preserving `mscsrc` carrier. The primary deliverable is jam1garner-style, human-readable C source with IDA/game-exe grounded native names.
- Read relevant docs:
  - `docs/msc-binary-format-spec.md`
  - `docs/exvs2-msc-vm-native-semantics.md`
  - `docs/exvs-native-truth-mapping-workflow.md`
- Reused session folder `docs/agent-sessions/msc-human-roundtrip/`.
- Updated `todo.md` with 29 task items for the readable C direction.
- Checked CodeGraph for `E:\research\msc_reserch\msc_human_rewrite`; it is not initialized there, so current work will rely on direct project inspection unless the user asks to initialize CodeGraph.
- Confirmed `E:\research\msc_reserch\msc_human_rewrite` is not a git repository.
- Confirmed the current implementation still contains `source_text.py`, `semantic_text.py`, `flow_text.py`, `semantics.py`, `stack_analysis.py`, and `function_model.py`; these should be treated as reusable internals, not final output formats.

## 2026-06-12 Readable C Vertical Slice

Implemented the first IDA-grounded readable C projection under
`E:\research\msc_reserch\msc_human_rewrite`:

- Added `src/exvs2_msc/c_decompile.py`.
- Added `tests/test_c_decompile.py`.
- Added `c-decompile` to `src/exvs2_msc/__main__.py`.
- Exported `dumps_c_decompile` from `src/exvs2_msc/__init__.py`.
- Updated rewrite docs:
  - `README.md`
  - `docs/architecture.md`
  - `docs/source-text.md`
  - `docs/flow-text.md`

Current C projection behavior:

- Emits file-level `@domain`, ground-truth file, module, and SHA-256 evidence.
- Groups scripts as `fn_XXXXXXXX` functions based on the native offset-table
  function model.
- Reuses existing domain inheritance and subcommand evidence from
  `GroundTruth`.
- Reuses CFG stack analysis for native call arguments.
- Renders IDA-proven native subcommands as semantic API calls, such as
  `get_active_shell_entry_id()` and `shell_entry_exists(0x6BAA794A)`.
- Renders unproven native behavior explicitly as
  `native_call_unresolved(domain, handler_id, subcmd, ...)`.
- Uses conservative labels and `goto` statements for unstructured CFG regions.

Commands and outcomes:

- `python -m unittest discover -s tests` before changes: passed 79 tests in
  76.153s.
- `python -m unittest discover -s tests -p test_c_decompile.py`: first failed
  because `exvs2_msc.c_decompile` did not exist, then passed 6 tests in 3.252s.
- `python -m unittest discover -s tests`: passed 85 tests in 85.802s.
- `python -m compileall -q src tests`: passed.
- Real sample C export:
  - Command:
    `python -m exvs2_msc c-decompile E:\research\msc_reserch\EXVS2_msc\0x04AD9F33\2.dscex --ground-truth data\ida\vsac27_release_msc_handlers.json --domain "VDK::GAM::CDepictionScript" -o tmp\0x04AD9F33\2.readable.c`
  - Output lines: 85076.
  - Output size: 3371488 bytes.
  - Verified output contains `@domain`, `@evidence`, `get_active_shell_entry_id()`,
    `shell_entry_exists(0x6BAA794A)`, and `native_call_unresolved(...)`.
- Tauri comparison output:
  - Command:
    `python E:\TAURI_PROJECT\tools\mscdec.py E:\research\msc_reserch\EXVS2_msc\0x04AD9F33\2.dscex -o tmp\0x04AD9F33\2.tauri_mscdec.c`
  - Output lines: 28600.
  - Output size: 623183 bytes.
  - Shape difference: old output uses ordinal `func_N` names and global
    `sys_XX(...)` calls, for example `sys_47(... sys_4B(0x1) ...)`; new output
    uses offset-stable `fn_XXXXXXXX`, domain/build evidence comments, resolved
    semantic names, and explicit unresolved native calls.

Remaining work:

- The current C output is intentionally conservative and noisy. It still needs
  branch predicate recovery, CFG structuring, output-size reduction, broader
  handler/subcommand evidence, and more readable snapshots.

## 2026-06-12 Repeated TDD Toolchain Harness

The user requested a 100-item todo list and emphasized repeated TDD, repeated
jam1garner/legacy decode checks, and repeated `msclang` repack script tests
rather than fake micro-task splitting.

Actions:

- Expanded `todo.md` with a dedicated `100-Item Repeated TDD Backlog`.
- Added `src/exvs2_msc/toolchain_regression.py`.
- Added `tests/test_toolchain_regression.py`.
- Added the `toolchain-regression` CLI command.
- Updated `README.md` with the repeated regression command and boundary.

Harness behavior:

- Discovers the 16 real MSC files under `E:\research\msc_reserch\EXVS2_msc`.
- For each sample, records:
  - new JSON IR decode/repack byte-exact result;
  - new IDA-grounded C export result and line/size counts;
  - legacy `E:\TAURI_PROJECT\tools\mscdec.py` decode status;
  - legacy `E:\TAURI_PROJECT\tools\msclang.py` compile status;
  - whether the legacy compiled bytes are byte-exact against the original input.
- Stores per-sample artifacts under the selected `tmp\toolchain-regression-*`
  folder and writes a JSON report.

TDD steps and results:

- `python -m unittest discover -s tests -p test_toolchain_regression.py` first
  failed because `exvs2_msc.toolchain_regression` did not exist.
- Implemented the harness module.
- Added a parser test for `toolchain-regression`; it failed until the CLI command
  was added.
- Real smoke exposed a relative-output-path bug when calling legacy `mscdec.py`;
  added a test with relative artifacts path and fixed the harness by resolving
  `output_dir` before passing paths to legacy tools.
- Added `legacy_msclang.byte_exact_to_input` after the first real smoke showed a
  successful old compile can still produce non-byte-exact output.

Commands and outcomes:

- `python -m unittest discover -s tests -p test_toolchain_regression.py`: passed
  3 tests.
- `python -m compileall -q src tests`: passed.
- Single-sample smoke:
  - Command:
    `python -m exvs2_msc toolchain-regression E:\research\msc_reserch\EXVS2_msc --ground-truth data\ida\vsac27_release_msc_handlers.json --domain "VDK::GAM::CDepictionScript" --mscdec E:\TAURI_PROJECT\tools\mscdec.py --msclang E:\TAURI_PROJECT\tools\msclang.py --artifacts-dir tmp\toolchain-regression-smoke --limit 1 -o tmp\toolchain-regression-smoke\report.json`
  - Sample: `0x04AD9F33/0.bscex`.
  - New roundtrip: byte-exact true.
  - New C export: 9488 lines, domain/evidence present, unresolved fallback present.
  - Legacy `mscdec`: returncode 0.
  - Legacy `msclang`: returncode 0, output size 24400 vs input size 27808,
    byte-exact false.
- Full 16-sample corpus harness:
  - Command:
    `python -m exvs2_msc toolchain-regression E:\research\msc_reserch\EXVS2_msc --ground-truth data\ida\vsac27_release_msc_handlers.json --domain "VDK::GAM::CDepictionScript" --mscdec E:\TAURI_PROJECT\tools\mscdec.py --msclang E:\TAURI_PROJECT\tools\msclang.py --artifacts-dir tmp\toolchain-regression-full -o tmp\toolchain-regression-full\report.json`
  - Elapsed: about 32 seconds.
  - Sample count: 16.
  - New JSON roundtrip byte-exact: 16/16.
  - New C export success: 16/16.
  - Legacy `mscdec` success: 16/16.
  - Legacy `msclang` success: 16/16.
  - Legacy `msclang` byte-exact against original input: 5/16.
  - Non-byte-exact legacy outputs:
    - `0x04AD9F33/0.bscex`: input 27808, compiled 24400.
    - `0x04AD9F33/2.dscex`: input 272784, compiled 237856.
    - `0x693F756D/0.bscex`: input 27232, compiled 24000.
    - `0x693F756D/2.dscex`: input 318096, compiled 276960.
    - `0xBDBE6FEA/0.bscex`: input 27808, compiled 24400.
    - `0xBDBE6FEA/2.dscex`: input 272832, compiled 237872.
    - `0xBDBE6FEA_test/0.bscex`: input 27808, compiled 24400.
    - `0xBDBE6FEA_test/2.dscex`: input 272832, compiled 237872.
    - `0xE20B4862/0.bscex`: input 26960, compiled 23664.
    - `0xE20B4862/0.native_truth.bscex`: input 26944, compiled 23616.
    - `0xE20B4862/2.dscex`: input 278992, compiled 242848.
- `python -m unittest discover -s tests`: passed 88 tests in 81.592s.

Current interpretation:

- Legacy `mscdec`/`msclang` can often complete, but returncode 0 is not enough.
  Byte equality catches old pipeline lossiness.
- The new pipeline's byte-preserving parser remains exact across all 16 samples.
- The new C projection now has a repeated all-corpus smoke gate, but still needs
  branch predicate recovery and CFG structuring to approach jam1garner-style
  readability.

## Context Gathered

- `task.md` asks for a new project rooted at `E:\research\msc_reserch`, not edits to the current Tauri app.
- The final deliverable is a rewritten EXVS2 MSC decode/repack workflow with byte-for-byte validation.
- The user explicitly allows public research for jam1garner/MSC background, but local EXVS2 samples and IDA/native-truth findings remain authoritative.
- Local `tdd-workflow` skill file was not present in `.agents/skills` or `.cursor/skills`; proceeded with manual TDD discipline.

## Relevant Local Specs

- `docs/msc-binary-format-spec.md`
  - MSC header uint32 fields are little-endian.
  - Script body opcode parameters are big-endian.
  - Script offsets are relative to base `0x30`.
  - Script body starts at absolute `0x40`.
- `docs/msc-system-problems-analysis.md`
  - Existing C decompile/compile workflow is lossy and relies on hacks.
  - Current tooling does not guarantee roundtrip fidelity.
- `docs/exvs-native-truth-mapping-workflow.md`
  - Native-truth mapping is a later symbolization layer, separate from byte layout fidelity.

## Current Evidence

- `E:\research\msc_reserch` already contains legacy references:
  - `EXVS2_msc`
  - `mscdec_EXVS2`
  - `msclang_EXVS2`
  - `bak`
- Real sample files are available under `E:\research\msc_reserch\EXVS2_msc`, including:
  - `0xBDBE6FEA\0.bscex`
  - `0xBDBE6FEA\1.cscex`
  - `0xBDBE6FEA\2.dscex`

## Decisions

- First TDD slice: build a lossless human-readable text IR instead of a C-like decompiler.
- Rationale: byte-perfect roundtrip must not depend on type inference, float guesses, switch reconstruction, or native syscall names.
- Higher-level IDA/syscall symbolization can be layered after the byte-preserving core is proven.
- User clarified that the goal is not to rewrite jam1garner's implementation. The new implementation must be based on IDA/game-exe logic. Existing pymsc-derived tools are comparison inputs only.
- `ida-pro-mcp` became available after installation/reload. Current IDB is `E:\OBHK0.3_v27\vsac27_Release.exe.i64`.

## Commands And Results

- `rg --files docs -g "*.md"`: found MSC specs and existing session docs.
- `Get-ChildItem -Force E:\research\msc_reserch`: confirmed the research root exists and has legacy material.
- Web search for jam1garner MSC/pymsc: confirmed public `jam1garner/pymsc` background, matching local documentation.
- `python -m unittest discover -s tests` in `E:\research\msc_reserch\msc_human_rewrite`: passed 7 tests after adding lossless IR and ground-truth provider.
- `python -m unittest discover -s tests` in `E:\research\msc_reserch\msc_human_rewrite`: passed 9 tests after expanding coverage to all 16 corpus MSC files and string-table rare-opcode regression.
- `$env:PYTHONPATH='src'; python -m exvs2_msc --help` in `E:\research\msc_reserch\msc_human_rewrite`: CLI entrypoint works with the documented src-layout invocation.
- `ida-pro-mcp --install`: plugin already up to date; auto-connected to `vsac27_Release.exe` at `127.0.0.1:13337`.
- `codex mcp list`: confirmed `ida-pro-mcp` enabled at `http://127.0.0.1:13337/mcp`.
- `ida://idb/metadata`: IDB path `E:\OBHK0.3_v27\vsac27_Release.exe.i64`, module `vsac27_Release.exe`, base `0x140000000`, sha256 `cae3636aa4870d356eb25837badeb83482a71e290961442decf13cf87e1baa76`.
- IDA `decompile/disasm` confirmed `sub_14067A890` installs slots `4/5/6`.
- IDA `decompile/disasm` confirmed `sub_140664F70` calls `sub_14067A890` then installs CDepictionScript handlers, including `slot 82 -> sub_1406840C0`, `slot 83 -> sub_140684F00`, `slot 85 -> sub_1406856A0`.
- Added `src/exvs2_msc/ida_export.py` to parse IDA disasm exports into handler table entries.
- Added `data/ida/vsac27_release_msc_handlers.json` as normalized live IDA handler-table evidence.
- Added `src/exvs2_msc/semantics.py` and CLI `annotate` to attach native handler evidence to `sys(argc, id)` instructions.
- `python -m unittest discover -s tests` in `E:\research\msc_reserch\msc_human_rewrite`: passed 16 tests after IDA export ingestion and semantic syscall annotation.
- IDA decompile of `sub_140684F00` confirmed switch on `*a4` and cases including `0x0A -> sub_1405BC040`, `0x11 -> sub_140684E70`, `0x13 -> sub_1405DED00`, `0x14 -> sub_1405DEEE0`.
- Added `sys_4F` subcommand records to `data/ida/vsac27_release_msc_handlers.json`.
- Added conservative local stack-argument recovery in `semantics.py`: contiguous push-result instructions immediately before `sys` are recovered as call arguments; non-contiguous cases are not guessed.
- Verified real sample `0x04AD9F33\2.dscex` annotates `sys_4F(0x13)` as `reset_all_weapon_hud_entries` and `sys_4F(0x14, 1)` as `apply_context_weapon_hud_mode`.
- `python -m unittest discover -s tests` in `E:\research\msc_reserch\msc_human_rewrite`: passed 17 tests after `sys_4F` subcommand annotation.
- `python -m unittest discover -s tests -p test_semantics.py` in `E:\research\msc_reserch\msc_human_rewrite`: passed 6 tests before the `sys_55` expansion.
- `python -m unittest discover -s tests` in `E:\research\msc_reserch\msc_human_rewrite`: passed 19 tests before the `sys_55` expansion.
- Added `parse_hexrays_subcommand_cases()` in `src/exvs2_msc/ida_export.py` to recover subcommand values, case EAs, and native helper calls from Hex-Rays switch-case excerpts.
- IDA decompile of `sub_1406837C0` confirmed `sys_55` branch shape:
  - `*a4 == 0`: calls `sub_1405FB1E0` to reset the category judgement table.
  - `*a4 == 1`: maps ID through `sub_140682280` and writes state via `sub_1405FB220`.
  - `*a4 == 2`: maps ID through `sub_140682280` and queries count via `sub_1405FB080`.
- Added `sys_55` subcommand records to `data/ida/vsac27_release_msc_handlers.json`:
  - `0x00 -> reset_category_judgement_table`
  - `0x01 -> set_category_judgement_state`
  - `0x02 -> get_category_judgement_hit_count`
- Real sample scan found complete contiguous `sys_55` calls in depiction scripts, including offsets `0x000013C4`, `0x0000260E`, and `0x00034A6E` in `0x04AD9F33\2.dscex`.
- `python -m unittest discover -s tests -p test_ground_truth.py` in `E:\research\msc_reserch\msc_human_rewrite`: passed 5 tests after `sys_55` ground truth.
- `python -m unittest discover -s tests -p test_semantics.py` in `E:\research\msc_reserch\msc_human_rewrite`: passed 7 tests after `sys_55` semantic call annotation.
- `python -m unittest discover -s tests` in `E:\research\msc_reserch\msc_human_rewrite`: passed 21 tests after IDA switch-case export parsing and `sys_55` semantics.
- Added ground-truth domain inheritance. `VDK::GAM::CDepictionScript` now inherits `VDK::GAM::CMotionScriptAbstract`, matching the native constructor/install chain and resolving base `sys_00/sys_01/sys_02` handlers in the derived domain.
- Real sample `0x04AD9F33\2.dscex` offset `0x000002D5` now resolves inherited `sys_00` to `sub_1406915E0`.
- IDA decompile of `sub_14067F620` confirmed `sys_4B` is a `CShellAbstract` entry and visual-state dispatch bus.
- Added first `sys_4B` subcommands:
  - `0x00 -> activate_shell_entry`
  - `0x01 -> get_active_shell_entry_id`
  - `0x02 -> configure_shell_entry`
  - `0x03 -> clear_shell_entry_or_all`
  - `0x04 -> shell_entry_exists`
- Added `docs/exvs-msc-syscall-4b-notes.md` with the native evidence and design interpretation.
- Real sample semantic tests cover `sys_4B(1)` at `0x00000164` and `sys_4B(4, 0x6BAA794A)` at `0x000401ED`.
- Added `src/exvs2_msc/semantic_text.py` with an offset-anchored semantic overlay.
- The overlay applies edits only to fully recovered literal arguments backed by `pushInt` or `pushShort`, preserving opcode, push bit, instruction width, and layout.
- Added CLI commands:
  - `semantic-export`
  - `semantic-apply`
- Semantic overlay tests verify native call export, one literal edit, rejection of call renames, rejection of non-literal edits, CLI export/apply/repack, and byte-exact no-op overlay roundtrip.
- `python -m unittest discover -s tests -p test_semantic_text.py`: passed 6 tests.
- `$env:PYTHONPATH='src'; python -m exvs2_msc --help`: confirmed all five CLI commands are registered.
- `python -m unittest discover -s tests`: passed 30 tests after domain inheritance, `sys_4B`, and semantic overlay work.
- Direct execution also passed:
  - `python tests\test_semantics.py`: 9 tests.
  - `python tests\test_semantic_text.py`: 6 tests.
- Real CLI no-op semantic roundtrip on `0x04AD9F33\2.dscex`:
  - input length: `272784`
  - output length: `272784`
  - semantic overlay lines: `427`
  - byte comparison: exact

## Native VM And CFG Reconstruction

- IDA loader/interpreter evidence:
  - `sub_14030DEF0`: loader; validates magic `B2 AC BC BA E6 90 32 01`.
  - `sub_14030E270`: active MSC bytecode interpreter.
  - `sub_14030DB30`: shared instruction-size function.
  - `0x14030F005`: ordinary result-push path.
- Native call behavior recovered from `sub_14030E270`:
  - ordinary opcode bit 7 pushes the last-result value;
  - `push` (`0x32`) pushes last-result rather than duplicating stack top;
  - `pop` (`0x33`) moves stack top into last-result rather than discarding it;
  - `try` (`0x2E`) captures caller frame state and uses bit 7 as a keep-return flag;
  - `callFunc` (`0x2F`) enters the callee frame;
  - returns restore caller state and conditionally preserve the return value;
  - `if` branches on zero and `ifNot` branches on nonzero.
- Opcode boundary recovered for the current build:
  - `0x0C` and `0x37` are rejected interpreter holes;
  - `0x38..0x49` are one-byte reserved/no-op cases;
  - values above `0x49` are rejected even though the size helper has dormant `0x4A..0x4E` entries;
  - pymsc-derived float mnemonics are not valid semantics for VSAC27.
- Added `src/exvs2_msc/vm_profile.py` with executable-hash/address anchors and an instruction-size table independently transcribed from `sub_14030DB30`.
- Added `src/exvs2_msc/stack_analysis.py`:
  - iterative worklist, no recursive VM walk;
  - abstract literals, variables, expressions, syscall results, function results, deferred calls, phi values, and unknowns;
  - native call-frame and last-result state;
  - bounded phi widening for convergence.
- Added focused tests for:
  - function return restoration at `0x000170A6`;
  - call arguments at `0x0002F1FE`;
  - branch phi merge at `0x00003F44`;
  - whole-function expression recovery at `0x000060EF`;
  - nested syscall result boundaries at `0x0000017B`;
  - arithmetic expression trees at `0x000016EF`.
- Updated project and repository docs:
  - `msc_human_rewrite/docs/native-vm-profile.md`;
  - `docs/exvs2-msc-vm-native-semantics.md`;
  - corrected `docs/msc-binary-format-spec.md`.

## Current Verification

- `python -m unittest discover -s tests`: passed 44 tests.
- `python -m compileall -q src tests`: passed.
- `$env:PYTHONPATH='src'; python -m exvs2_msc --help`: all five commands registered.
- Full corpus analysis:
  - files: `16`;
  - instructions: `383003`;
  - syscalls: `20376`;
  - incomplete syscall argument lists: `0`;
  - diagnostics: `0`;
  - elapsed: `2.832s`.
- Repeated real CLI no-op semantic roundtrip on `0x04AD9F33\2.dscex` after CFG/native-profile changes:
  - input length: `272784`;
  - output length: `272784`;
  - semantic overlay lines: `434`;
  - byte comparison: exact.

## Native Function ABI Reconstruction

- Added `src/exvs2_msc/function_model.py` and CLI `function-export`.
- Native `begin` operands are now modeled as:
  - `parameter_slot_count`;
  - `frame_slot_count`;
  - `non_parameter_frame_slot_count = frame_slot_count - parameter_slot_count`.
- Important correction: the second operand is not a source-level local-variable
  count. Non-parameter frame slots may include temporaries or compiler/VM frame
  storage.
- `callFunc`/`callFunc2`/`callFunc3` are recorded as distinct VM modes:
  - mode 1 `callFunc`: same-interpreter returning frame call;
  - mode 2 `callFunc2`: host-boundary root transfer;
  - mode 3 `callFunc3`: same-interpreter root transfer.
- `callFunc2` and `callFunc3` do not fall through in the current interpreter
  invocation. This removed five previously counted scheduler-fallthrough
  syscalls from reachable CFG results.
- Function catalog corpus results:
  - functions: `6338`;
  - encoded call sites: `21746`;
  - direct offset-table targets: `21568`;
  - indirect variable-backed targets: `178`;
  - exact direct-call arity: `21295`;
  - missing arguments zero-filled: `208`;
  - extra arguments ignored inside frame capacity: `25`;
  - extra arguments truncated beyond frame capacity: `40`;
  - unreachable encoded call sites retained lexically: `4`;
  - catalog diagnostics: `0`.
- Updated docs:
  - `msc_human_rewrite/docs/function-model.md`;
  - `msc_human_rewrite/docs/native-vm-profile.md`;
  - `docs/exvs2-msc-vm-native-semantics.md`.

## Current Verification After Function Model

- `python -m unittest discover -s tests`: passed 53 tests.
- `python -m compileall -q src tests`: passed.
- `$env:PYTHONPATH='src'; python -m exvs2_msc --help`: six commands registered, including `function-export`.
- Full corpus analysis:
  - files: `16`;
  - instructions: `383003`;
  - functions: `6338`;
  - encoded syscalls: `20376`;
  - reachable syscalls: `20371`;
  - analysis diagnostics: `0`;
  - catalog diagnostics: `0`.
- Real CLI no-op semantic roundtrip on `0x04AD9F33\2.dscex` with function export:
  - input length: `272784`;
  - output length: `272784`;
  - semantic overlay lines: `434`;
  - function catalog lines: `6022`;
  - byte comparison: exact.

## Standalone Source Text

- Added `src/exvs2_msc/source_text.py`.
- Added CLI commands:
  - `source-export`;
  - `source-import`.
- `mscsrc` v1 is a standalone carrier:
  - header/reserved bytes;
  - function ABI lines with `fn_XXXXXXXX`, parameter slots, frame slots, and non-parameter frame slots;
  - every instruction as `ins @offset raw=... mnemonic(args)`;
  - gaps, script padding, offset table bytes, offset-table padding, string raw bytes, and trailing bytes.
- Import treats `raw=` as authoritative and then calls the native-profile parser
  on the reconstructed byte stream. Rendered mnemonics are currently review
  text, not the editing authority.
- Added `docs/source-text.md`.
- Verification:
  - `python -m unittest discover -s tests -p test_source_text.py`: passed 4 tests;
  - all 16 real corpus files roundtrip through `mscsrc`;
  - raw instruction edit test changes the expected byte range;
  - real CLI chain on `0x04AD9F33\2.dscex`:
    - input length: `272784`;
    - output length: `272784`;
    - source lines: `66984`;
    - byte comparison: exact.

## Rendered Source Edits

- `source-import` now compiles supported rendered instruction text through the
  VSAC27 opcode profile when the encoded width matches the line's `raw=` width.
- Supported current edits include fixed-width integer operands, branch/call
  offsets, syscall ids/argc, and push-bit marker changes.
- Width-changing rendered edits are rejected; example: `pushInt` to `pushShort`.
- Unknown mnemonics are rejected before byte reconstruction.
- Direct function target literals render as `fn_XXXXXXXX` when the function
  catalog proves the `pushInt` feeds a direct call target.
- `fn_XXXXXXXX` imports as a 32-bit BE offset.
- Verification:
  - `python -m unittest discover -s tests -p test_source_text.py`: passed 9 tests;
  - `python -m unittest discover -s tests`: passed 62 tests;
  - `python -m compileall -q src tests`: passed;
  - real `0x04AD9F33\0.bscex` rendered literal edit:
    - input/output length: `27808`;
    - edited target bytes at `0x0000003B`: `8A00000001`;
  - real `0x04AD9F33\0.bscex` function symbol edit:
    - `pushInt(fn_0000009A)` to `pushInt(fn_00000262)`;
    - edited target bytes at `0x0000001A`: `8A00000262`;
  - real `0x04AD9F33\2.dscex` no-op source roundtrip:
    - input/output length: `272784`;
    - source lines: `66984`;
    - function symbol args: `3904`;
    - byte comparison: exact.

## CFG Stack Comments In Source Text

- `source-export` now appends read-only `#   stack ...` comments after syscall
  instruction lines when CFG stack analysis has recovered arguments.
- Comment rendering covers:
  - literals;
  - local/global frame values;
  - nested syscall results;
  - function results with `fn_XXXXXXXX` symbols;
  - arithmetic/logic expressions;
  - branch phi values.
- Import ignores these comments and still reconstructs bytes only from
  instruction/gap/table/string raw/rendered lines.
- Added source-text test coverage for:
  - call-result argument comment at `0x000170A6`;
  - phi argument comment at `0x00003F44`;
  - byte-exact import with comments present.
- Verification:
  - `python -m unittest discover -s tests -p test_source_text.py`: passed 10 tests;
  - `python -m unittest discover -s tests`: passed 63 tests;
  - `python -m compileall -q src tests`: passed;
  - real `0x04AD9F33\2.dscex` no-op source roundtrip:
    - input/output length: `272784`;
    - source lines: `70610`;
    - stack comments: `3626`;
    - function symbol args: `3904`;
    - byte comparison: exact.

## Stack Arg Literal Editing

- `source-export` now emits `#   stack-arg[index] source=... value=...` comments
  for top-level syscall arguments that CFG proved are backed by literal
  `pushInt`/`pushShort` instructions.
- `source-import` collects these comments before compiling instruction lines.
- Editing a `stack-arg` value rewrites the referenced source instruction if and
  only if the source instruction is fixed-width `pushInt` or `pushShort`.
- Unsupported sources and conflicting edits are rejected.
- Verification:
  - `python -m unittest discover -s tests -p test_source_text.py`: passed 12 tests;
  - `python -m unittest discover -s tests`: passed 65 tests;
  - `python -m compileall -q src tests`: passed;
  - real `0x04AD9F33\2.dscex` stack-arg edit:
    - edited `#   stack-arg[0] source=0x00017095 value=0x00000004` to `0x00000005`;
    - input/output length: `272784`;
    - changed bytes at source push: `8A00000005`.

## Nested Stack Arg Literal Editing

- Extended `source-export` stack-arg source comments from top-level syscall
  literals to nested stack values.
- Supported current path suffixes:
  - `.sys_arg[N]` for nested syscall arguments;
  - `.call_function` for call-result function pointers;
  - `.call_arg[N]` for call-result/deferred-call arguments;
  - `.operand[N]` for expression operands.
- Import still anchors edits only on `source=0x...`; the path is for human
  orientation and does not choose the byte location.
- If a literal source appears in multiple comments, unchanged comments are
  ignored. Multiple different replacement values for the same source are
  rejected as conflicting edits.
- Verification:
  - `python -m unittest discover -s tests -p test_source_text.py -k stack_arg`: passed 5 tests;
  - `python -m unittest discover -s tests -p test_source_text.py`: passed 15 tests;
  - `python -m unittest discover -s tests`: passed 68 tests;
  - `python -m compileall -q src tests`: passed;
  - real `0x04AD9F33\2.dscex` nested stack-arg edit:
    - edited `#   stack-arg[1].sys_arg[0] source=0x0000015F value=0x00000001` to `0x00000002`;
    - changed bytes at source push: `8A00000002`;
    - following nested syscall bytes remained `AD014B`;
    - input/output length: `272784`;
  - real source export now has `79793` lines, `3626` stack comments, `9183`
    `stack-arg` source comments, and `328` nested `stack-arg` paths.

## Stack Expression Literal Editing

- Added `stack-expr` comments for CFG expression values that contain editable
  literal leaves.
- Format uses:
  - `site=...` for the syscall instruction;
  - `root=...` for the expression opcode;
  - `expr=...` for the recovered expression;
  - `edit=...` for a structure-preserving editable copy.
- Import rejects malformed `stack-expr` lines instead of silently ignoring them.
- Import compares `expr=` and `edit=` fail-closed:
  - operators, variables, arity, and parentheses must remain unchanged;
  - only integer literal tokens may differ;
  - literal changes are mapped back to `stack-arg` leaf sources under the same
    `(site, path)` and then use the existing fixed-width `pushInt`/`pushShort`
    BE rewrite checks.
- Verification:
  - `python -m unittest discover -s tests -p test_source_text.py -k stack_expression`: passed 5 tests;
  - `python -m unittest discover -s tests -p test_source_text.py`: passed 20 tests;
  - `python -m unittest discover -s tests`: passed 73 tests;
  - `python -m compileall -q src tests`: passed;
  - real `0xE20B4862\2.dscex` stack-expr edit:
    - edited denominator in `stack-expr[1] site=0x000016EF root=0x000016EE`;
    - changed leaf source bytes at `0x000016E9` to `8A00000032`;
    - expression root byte at `0x000016EE` remained `91`;
    - syscall bytes at `0x000016EF` remained `2D024C`;
    - input/output length: `278992`;
  - current `0x04AD9F33\2.dscex` source export has `79842` lines, `3626`
    stack comments, `9183` `stack-arg` comments, and `49` `stack-expr`
    comments;
  - current `0xE20B4862\2.dscex` source export has `82143` lines, `3813`
    stack comments, `9811` `stack-arg` comments, and `75` `stack-expr`
    comments.

## Reconstruction Boundary

- Existing pymsc-derived projects remain comparison material only.
- The implementation now follows the original subsystem boundaries: loader,
  instruction sizing, interpreter state, domain-installed syscall tables, and
  native handlers.
- The current editable overlay is still literal-width preserving. Stable
  function symbols, editable expressions, structured control flow, and a full
  semantic compiler remain future work rather than being inferred prematurely.

## Sub Agent Sample Scan

- Scanned 16 real EXVS2 MSC files under `E:\research\msc_reserch\EXVS2_msc`.
- Parsed 383003 instructions with no unknown opcode.
- Only `0xE20B4862\0.bscex` has a string table (`stringSize=16`, `stringCount=1`) and covers rare `printf`/`pushShort`.
- Header `unk` values include more than `0x16/0x00`: observed `0x6C`, `0x6D`, `0x309`, `0x3C1`.
- Added next-step requirement to cover all 16 samples and the string-table rare-opcode sample in tests.

## Readable C Stack Expression TDD

- User feedback: `tmp\toolchain-regression-full\0x04AD9F33__0_bscex\new_readable.c`
  was still too VM-trace-like for C/Python/JS programmers. The target shape is
  closer to jam1garner `mscdec.py` output, but with OB/EXVS2/VSAC domain and
  IDA-grounded native names.
- Added failing coverage in `tests/test_c_decompile.py` for `0x04AD9F33\0.bscex`:
  - no default `pushInt`/`pushVar`/expression opcode comments for simple stack
    producers;
  - `setVar` renders `local_0000 = native_call_unresolved(...)` instead of
    `local_0000 = last_result`;
  - branch predicate no longer renders `condition_00000041`;
  - branch predicate uses recovered expression:
    `if (!(local_0000 != 0x00000000)) goto label_00000056;`.
- Extended `src/exvs2_msc/stack_analysis.py`:
  - `StackAnalysisResult` now exposes `instruction_inputs`;
  - records consumed values for `setVar`, compound assignment, `if`/`ifNot`,
    and `return_val`;
  - keeps existing syscall and call-site recovery unchanged.
- Updated `src/exvs2_msc/c_decompile.py`:
  - default C output hides pure stack producer comments and `try`/`begin` noise;
  - assignment, compound assignment, branch, and return rendering consume
    recovered abstract values;
  - native/function producers consumed by expressions are rendered inline and
    skipped as duplicate standalone statements;
  - resolved IDA native names can now appear inside branch predicates, e.g.
    `shell_entry_exists(0x6BAA794A)`.
- Corrected one initial test expectation: the first behaviour branch compares
  against `0x00000000`, matching legacy readable C's `if (var0 != 0)` shape.

## Verification After Readable C Expression Recovery

- `python -m unittest discover -s tests -p test_c_decompile.py -k behaviour_c_uses_recovered_stack_expressions`:
  failed first on old VM-trace output, then passed after implementation.
- `python -m unittest discover -s tests -p test_c_decompile.py`: passed 7 tests.
- `python -m unittest discover -s tests -p test_stack_analysis.py`: passed 8 tests.
- `python -m unittest discover -s tests`: passed 89 tests.
- `python -m compileall -q src tests`: passed.
- Re-ran full toolchain regression with absolute corpus paths:
  - command target: `tmp\toolchain-regression-full\report.json`;
  - samples: `16`;
  - new JSON roundtrip byte-exact: `16/16`;
  - new readable C export success: `16/16`;
  - legacy jam1garner `mscdec.py` decode success: `16/16`;
  - legacy `msclang.py` repack command success: `16/16`;
  - legacy `msclang.py` byte-exact to input: `5/16`.
- Also wrote an isolated validation copy under
  `tmp\toolchain-regression-readable-20260612\report.json` with the same
  aggregate results.
- Note: an intermediate regression run used a relative corpus path and produced
  invalid legacy decode failures because `mscdec.py` ran under the artifacts
  directory. The final `toolchain-regression-full` report was regenerated with
  absolute paths and is the valid report.

## Current Readable C Shape

- The first function in
  `tmp\toolchain-regression-full\0x04AD9F33__0_bscex\new_readable.c` now starts:
  - `fn_0000009A();`
  - `local_0000 = native_call_unresolved("VDK::GAM::CDepictionScript", 0x00, 0x10000, 0x00000000, 0x00000033);`
  - `if (!(local_0000 != 0x00000000)) goto label_00000056;`
  - `fn_00005D4A(local_0000);`
- This removes the previous `pushInt`/`pushVar`/`notEquals` comments and the
  synthetic `condition_00000041` placeholder from the simple branch.
- Remaining readable-C work:
  - structure proven `if`/`else` regions instead of label/goto fallback;
  - structure loops where CFG proof is unambiguous;
  - reduce double negations like `if (!(!(expr)))`;
  - keep expanding IDA-backed native names for unresolved handler/subcommand
    families.
