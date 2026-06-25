# MSC Repack Runnable Guide

This note explains why recent repacks crashed in-game, which compiler to use, and
how the repository is split between **game repack** and **semantic research**.

## TL;DR

| Goal | Tool | Notes |
|------|------|-------|
| Pack `.c` back into the game | `tools/msclang.py` | Legacy repack compiler (`msclang_msc`) |
| Semantic roundtrip experiments | `tools/msclang_modern.py` | Reference only; do **not** use for in-game repack |
| Decompile binary to `.c` | `tools/mscdec.py` | Unchanged entry point |

**Workflow for modding:**

```
2.dscex  →  mscdec.py  →  2.c  →  (edit)  →  msclang.py  →  2.dscex
```

Only repack the script you changed (usually `2.c` → `2.dscex`). Leave `0.bscex`
and `1.cscex` alone unless you intentionally edited them.

## Why The Game Crashed

The crash was **not** primarily caused by ACTION aliases or `//主射` comments.
Those are source-level only and do not change bytecode when comments/aliases are
stripped before compile.

Evidence from A/B comparison on `0x18AF7533` / `0xFEEA714A`:

1. **Header `flags=00ae0000` alone did not explain the regression.**
   Old repack and new repack both had similar wrong header fields, but only the
   new compiler body differed from the last known runnable output.

2. **The crash correlated with `msclang_modern` body output.**
   Repacked `2.dscex` matched the modern compiler SHA, not the legacy compiler
   SHA, while header fields were nearly identical between old and new repack.

3. **Root cause:** commit `7fc7311` replaced the legacy `msclang.py` + `msclang_msc.py`
   pipeline with `msc_core`-based codegen. That modern path changes try/pushBit,
   boolean lowering, and layout enough to produce a different `2.dscex` body.
   The game accepts the legacy body shape; the modern body shape crashed.

4. **`mscdec` also changed** (script naming/layout), but the decisive runtime
   break was **which compiler rebuilt the bytecode**, not UI overlay work.

## What We Reverted

### Default repack compiler: `tools/msclang.py`

Restored the pre-`7fc7311` legacy compiler:

- Imports `msclang_msc.py` (not `msc_core` codegen).
- Keeps the historical post-compile `0x2E → 0xAE` patch hook used by the old
  workflow.
- **Bugfix only:** the old patch used `if find_result:` which treated `-1` as
  true and corrupted header byte `0x0D`. The restored compiler now skips patches
  when the pattern is not found and never writes below offset `0x40`.

This is **not** new pattern hardcoding; it is the original tool behavior with a
safe guard on the known `-1` bug.

### Reference compiler: `tools/msclang_modern.py`

The unified-core snapshots now remain in the repo as reference-only files:

- `tools/msclang_ref_only.py`
- `tools/mscdec_ref_only.py`
- `tools/msc_core_ref_only.py`
- `tools/disasmlib_ref_only.py`
- `tools/msc_cfg_ref_only.py`

`tools/msc_core.py` is now only a thin wrapper around `msc_core_ref_only.py` so
existing modern tests/imports keep working without being the default repack path.

These files remain for:

- `test_msclang_phase2_regressions.py`
- `test_real_sample_semantic_roundtrip.py`
- Phase 2 of `test_full_roundtrip.py`

Use it when studying **decompile → compile → redecompile text stability**.
Do not point the game repack UI or packaging scripts at this file.

### Removed experimental hardcoding

The following approach was **rejected** and removed:

- `msc_header_metadata.py` sidecar/header comment channel
- Dual `addArg_legacy` / `addArg_modern` paths inside one compiler
- Duplicated `LEGACY_TRY_PUSHBIT_PATTERNS` blocks
- Writing `0xAE` into header `flags` when `try` pushBit is present

That duplicated legacy behavior inside the modern compiler and added more magic
bytes to maintain. Restoring the actual legacy compiler is simpler and matches
what previously worked in-game.

## Verification

Run the runnable repack gate against **real on-disk samples**:

```bash
python tools/tests/test_msclang_runnable_repack.py
```

This test file reads:

- `E:\XB\解包\com\file\040msc\0x18AF7533\` — reference corpus
- `E:\XB\解包\com\file\040msc\0xFEEA714A\2.c` and `2.dscex` — your crash case

It checks:

1. Reference `2.dscex` decompile → legacy repack keeps original header flags.
2. On-disk `0xFEEA714A\2.c` repack **does not** reproduce the known modern-crash
   binary SHA currently sitting in `0xFEEA714A\2.dscex`.
3. Direct repack from on-disk `2.c` matches the recovery path
   `decompile(bad 2.dscex) → msclang.py`.

Manual one-shot repack for game testing:

```bash
python tools/msclang.py "E:\XB\解包\com\file\040msc\0xFEEA714A\2.c" -o "E:\XB\解包\com\file\040msc\0xFEEA714A\2.repack.dscex" -i
```

Copy `2.repack.dscex` over the game pack after backup. Do **not** use
`msclang_modern.py` for this step.

Run semantic research gates (modern compiler):

```bash
python tools/tests/test_msclang_phase2_regressions.py
python tools/tests/test_real_sample_semantic_roundtrip.py
python tools/tests/test_full_roundtrip.py
```

## Practical Notes

- **`unk` header field:** legacy `msclang.py` still writes `0x16` for large
  scripts instead of preserving the original `unk` value. This predates the crash
  regression and was tolerated in-game when only `2.dscex` was repacked.
- **`1.cscex`:** legacy repack keeps header flags clean; byte identity is not guaranteed
  on all samples, but compile succeeds on the reference corpus.
- **`0.bscex`:** avoid repacking unless you edited `0.c`; it was never part of
  the usual mod workflow and magnifies layout drift.
- **After decompile:** if you see `func_487` instead of `0x186a0`, that is often
  a decompiler symbolization artifact, not proof that repack is wrong.

## Related Specs

- `docs/superpowers/specs/2026-06-23-msc-script-identity-layout-design.md` —
  semantic roundtrip acceptance (modern compiler research track)
- `docs/msc-binary-format-spec.md` — header layout and pushBit semantics
