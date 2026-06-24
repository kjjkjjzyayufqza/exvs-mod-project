# MSC Script Identity / Layout Separation — Design Spec

- Date: 2026-06-23
- Status: Phase 1 accepted; Phase 2 semantic roundtrip accepted
- Area: `tools/msc_core.py`, `tools/mscdec.py`, `tools/msclang.py`, `tools/tests/*`
- Driver: Current MSC decompile/compile flow mixes script identity, physical layout, and display naming. This produces confusing decompiled output such as `func_0, func_1, func_3, func_6, func_2...`, encourages UI rename hacks, and makes round-trip debugging much harder.

---

## 1. Problem Statement

Current toolchain uses one overloaded concept, `script.name`, for three different jobs:

1. **Identity**: which logical script this is.
2. **Layout**: where the script lives in the binary and how it ranks when offsets are sorted.
3. **Display**: what name gets emitted to C (`func_N` / `main`).

This causes structural drift.

Observed on real sample `E:\XB\解包\com\file\040msc\0xFEEA714A\0.bscex`:

- script count = `145`
- first 10 decompiler-visible names = `func_0, func_1, func_3, func_6, func_2, func_4, func_5, func_7, func_8, func_9`

That output is not random. It comes from current `MscFile.readFromFile()` behavior:

- names are assigned from **sorted offset rank**
- scripts are appended in **original offset-table order**

So one list carries two incompatible orderings.

---

## 2. Constraints

Confirmed constraints for this redesign:

1. No sidecar metadata files.
2. No extra recorded metadata/raw/reference fields attached to script objects as part of the redesign.
3. Follow existing `mscdec` code style: derive from current MSC facts, avoid new persistence or semantic caches.
4. No UI-only rename hack as the primary fix.
5. Fix must start at system architecture level.
6. Real file testing is required during implementation.
7. First slice must minimize blast radius: establish correct naming source before touching deep compiler semantics.

---

## 3. Options Considered

### Option A — Keep current model, patch naming only

Change emitted `func_N` names or add more `main` replacement rules.

Rejected:

- does not separate identity from layout
- leaves compiler/decompiler model inconsistent
- keeps future regressions likely

### Option B — Full compiler/decompiler rewrite first

Replace current flow with new IR, new compiler, new decompiler in one pass.

Rejected for first slice:

- too much surface area
- hard to verify incrementally
- high risk of breaking working paths like `1.cscex`

### Option C — Incremental architecture repair without recorded metadata

Keep current object model. Do not add new recorded fields. Change only the rule that assigns `script.name`: use offset-table order for `func_N`, while continuing to derive layout only from existing offsets/bounds when needed.

Chosen.

Reason:

- smallest safe structural fix
- directly explains and fixes current naming disorder
- creates stable base for later writer/header/`0x2E -> 0xAE` work

---

## 4. Target Architecture

No new script metadata layer.

Rules:

1. **Identity**
   - `func_N` is defined by original offset-table order.
   - `func_17` means "18th item in script offset table", not "18th script by physical address".

2. **Layout**
   - Physical layout continues to be derived from existing binary facts: offset table, sorted offsets, and `bounds`.
   - Layout is not recorded as extra script state.

3. **Display**
   - Non-entry scripts default to `func_<table_index>`.
   - Entrypoint may still be rendered as `main` during decompile output only.

---

## 5. Phase 1 Scope

Phase 1 intentionally fixes only naming source plus decompiler determinism.

### 5.1 `msc_core.py`

- Do not extend `MscScript`.
- In `MscFile.readFromFile()`:
  - read original offset table order
  - compute sorted layout order only as local calculation
  - set script `name` to `func_<table_index>`
  - keep script body range resolution unchanged

### 5.2 `mscdec.py`

- No structural rewrite required in this slice.
- Keep current entrypoint rename to `main`.
- Continue updating `ScriptRef(old_entry_name -> main)` so source output remains coherent.

### 5.3 Tests

Add regression coverage for:

1. script names in `msc.scripts` order are sequential by offset-table index
2. entrypoint still resolves correctly on real files
3. real sample `0xFEEA714A` no longer shows `func_0, func_1, func_3, func_6...` in first visible order

---

## 6. Non-Goals For Phase 1

Not in first slice:

- full `msclang.py` layout writer redesign
- `unk` / `flags` semantic repair
- `0x2E -> 0xAE` compiler fix
- action rename redesign
- removal of all old UI behavior

Those need later phases after naming source is trustworthy.

---

## 7. Risks And Guardrails

### Risk 1 — Existing code assumes `script.name` means layout rank

Guardrail:

- inspect all name consumers after change
- keep log output format stable

### Risk 2 — Entry-point rename still changes visible name

Guardrail:

- change only after initial `func_N` naming is assigned
- keep rename local to decompile stage

### Risk 3 — Round-trip behavior changes unexpectedly

Guardrail:

- run existing roundtrip suite before and after
- run targeted real-file inspection on `0xFEEA714A`

### Risk 4 — Compiler still depends on declaration order

Guardrail:

- phase 1 does not promise full binary fidelity
- phase 1 only ensures source-level naming is no longer ambiguous

---

## 8. Validation Plan

Required checks during execution:

1. Baseline run of current roundtrip tests.
2. Real-file inspection of `E:\XB\解包\com\file\040msc\0xFEEA714A\0.bscex` script names before/after.
3. New regression tests around sequential `func_N` naming and entrypoint resolution.
4. Post-change rerun of targeted tests.

Success for phase 1:

- `msc.scripts` iterates as `func_0, func_1, func_2...`
- decompiler still finds and renames entrypoint to `main`
- no new test regressions in current command/header read paths

---

## 9. Phase 1 Acceptance Status

Validated on 2026-06-24 against the current real-file corpus and regression suite:

- `tools/tests/test_script_identity_layout.py` passes
- `0.bscex`, `1.cscex`, and `2.dscex` resolve entrypoints correctly
- real sample `E:\XB\解包\com\file\040msc\0xFEEA714A\0.bscex` now exposes first visible names as `func_0..func_9`
- real sample decompile still emits exactly one `main`

Conclusion:

- the Phase 1 identity/layout objective is accepted
- script naming is now treated as stable baseline behavior
- remaining `2.dscex` drift belongs to later compiler/decompiler roundtrip work, not script identity ordering

---

## 10. Phase 2 Findings And Acceptance

Validated on 2026-06-24 against both the focused regression corpus and the real
sample `E:\XB\解包\com\file\040msc\0xFEEA714A`.

### 10.1 Confirmed root-cause categories

Phase 2 confirmed three separate drift categories:

1. **Negated OR-chain lowering in `msclang.py`**
   - `!((A) || (B && !C))`-style conditions were not semantically stable after
     compile and redecompile.
   - The safe repair is a shallow condition normalization pass before codegen:
     distribute `!` across `||` chains only, while leaving `!(A && B)` grouped.

2. **Nested call / `try` pushBit propagation**
   - Previously isolated with the script `1036` regression.
   - Existing targeted fix remains valid under the semantic gate.

3. **Physical layout drift vs. semantic stability**
   - Large byte diffs can remain even when source-level behavior round-trips
     correctly.
   - For the current legacy C pipeline, byte identity is no longer treated as the
     acceptance metric for Phase 2.

### 10.2 Real-sample results

Results after the Phase 2 repairs:

- `0xFEEA714A/0.bscex`: decompile -> compile -> redecompile text is identical.
- `0xFEEA714A/1.cscex`: decompile -> compile -> redecompile text is identical.
- `0xFEEA714A/2.dscex`:
  - previously unstable `func_274` and `func_648` now round-trip semantically;
  - only `func_167`, `func_940`, `func_941`, and `func_993` still differ in
    rendered text;
  - those four residual diffs are limited to `0x186a0` being re-rendered as
    `func_487` after rebuild because the rebuilt layout now has a script whose
    start offset is `0x186a0`;
  - raw command inspection confirms both original and rebuilt binaries still
    contain the literal `0x186a0` at those sites, so this is treated as a
    decompiler symbolization artifact rather than a runtime semantic change.

### 10.3 Verification evidence

The following suites now pass:

- `python tools/tests/test_script_identity_layout.py`
- `python tools/tests/test_msclang_phase2_regressions.py`
- `python tools/tests/test_full_roundtrip.py`
- `python tools/tests/test_real_sample_semantic_roundtrip.py`

Notable interpretation:

- `0xBDBE6FEA_test/2.dscex` is still not byte-identical after legacy
  decompile/compile, but its redecompiled source is stable under the semantic
  gate.
- The real user-facing acceptance target is now **semantic roundtrip stability**,
  not binary-perfect reproduction.

### 10.4 Phase 2 acceptance

Phase 2 is accepted under the following definition:

- decompile -> compile -> redecompile must preserve source-level behavior for the
  regression corpus;
- real sample `0xFEEA714A` must not retain known semantic regressions in
  `func_274` / `func_648`;
- remaining residual drift must be explainable as non-semantic rendering noise.

Byte-identical output remains useful as a diagnostic signal, but it is no longer
the release gate for this repair slice.
