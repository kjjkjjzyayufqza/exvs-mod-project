# EXVS Native-Truth Mapping Workflow

## Purpose

This workflow replaces one-off text patching with a stable `native truth -> mapping JSON -> mscdec/msclang` pipeline.
It is intentionally scoped to EXVS scripts under `0xF1EF3B32` first.

## Files Added For This Workflow

- Mapping model and runtime helpers: `tools/exvs_native_truth.py`
- Initial EXVS mapping seed: `tools/mappings/exvs_0xF1EF3B32.native_truth.json`
- Seed extractor from decompiled C: `tools/extract_exvs_native_truth_seed.py`
- mscdec mapping import: `tools/mscdec.py` (`--exvsMapping`)
- msclang relocation import: `tools/msclang.py` (`--exvsMapping`)

## Readonly IDA Ground-Truth Extraction

Use readonly MCP calls to collect evidence first, then write/update mapping JSON.

Recommended order:

1. `survey_binary`
2. `find` / `insn_query` for syscall patterns:
   - `sys_1(0x10002, 0x2, hash, callback)` registration flow
   - `sys_0(0x10003, 0x2, hash)` and `sys_0(0x10002, 0x2, hash)` lookup flow
3. `xref_query` / `callgraph` / `analyze_function` to trace dispatch handlers
4. `ida://idb/metadata` and `ida://idb/segments` for version anchoring

Write extracted facts into mapping JSON fields:

- `binary`
- `anchors`
- `callback_bindings_seed`
- `opaque_function_refs`

## C-Seed Extraction (Fast Bootstrap)

Before full IDA mapping is complete, generate first-pass seed data from existing decompiled `0.c` and `2.c`:

```bash
python "tools/extract_exvs_native_truth_seed.py" --script0 "E:\\XB\\解包\\com\\file\\0xF1EF3B32\\0_bak.c" --script2 "E:\\XB\\解包\\com\\file\\0xF1EF3B32\\2.c" --output "tmp\\exvs_0xF1EF3B32.seed.json"
```

This produces:

- `callback_bindings_seed` from `bindActionHashHandler(...)`
- `func83_seed` from `func_83(slot, value)`

Use this as a seed, then overwrite/confirm with IDA-native evidence.

## Decompile With Native-Truth Symbolization

```bash
python "tools/mscdec.py" "E:\\XB\\解包\\com\\file\\0xF1EF3B32\\0.bin" -o "tmp\\0.native_truth.c" --exvsMapping "tools\\mappings\\exvs_0xF1EF3B32.native_truth.json"
```

Behavior:

- For rules of kind `function_ref`, matching constants in configured call arguments are converted into symbolic function IDs during decompile.

## Compile With Explicit Relocation

```bash
python "tools/msclang.py" "tmp\\0.native_truth.c" -o "tmp\\0.native_truth.mscsb" --exvsMapping "tools\\mappings\\exvs_0xF1EF3B32.native_truth.json"
```

Behavior:

- `function_ref` rules:
  - decode side: constant to symbol (decompile)
  - encode side: symbol to final script offset (compile), with configurable `encode_add`
- `script_delta` rules:
  - compile-time relocation applies a deterministic anchor-based delta:
    `relocated = raw + (current_anchor_offset - baseline_anchor_offset)`

## Mapping Rule Semantics

`opaque_function_refs` supports:

- `kind = "function_ref"`
  - Use when argument is encoded function pointer/reference
  - Supports `decode_add` and `encode_add`
- `kind = "script_delta"`
  - Use when argument behaves like a layout-sensitive code offset table
  - Supports anchor relocation using `anchor_function` and `anchor_baseline_offset`

## Verification Checklist

1. Decompile old baseline with mapping and capture symbolized output.
2. Compile unchanged baseline and confirm output behavior is unchanged.
3. Introduce unrelated code-size change (for example one `printf`) before mapped tables.
4. Recompile with the same mapping.
5. Confirm mapped arguments relocate as expected instead of staying stale literals.

