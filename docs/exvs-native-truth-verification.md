# EXVS Native-Truth Verification Notes

## Verification Scope

- Target scripts:
  - `E:\XB\解包\com\file\0xF1EF3B32\0_bak.c`
  - `E:\XB\解包\com\file\0xF1EF3B32\0.c`
  - `E:\XB\解包\com\file\0xF1EF3B32\2.c`
- Mapping:
  - `tools/mappings/exvs_0xF1EF3B32.native_truth.json`

## Commands Used

```bash
python "tools/extract_exvs_native_truth_seed.py" --script0 "E:\\XB\\解包\\com\\file\\0xF1EF3B32\\0_bak.c" --script2 "E:\\XB\\解包\\com\\file\\0xF1EF3B32\\2.c" --output "E:\\TAURI_PROJECT\\tmp\\exvs_0xF1EF3B32.seed.json"
python "tools/msclang.py" "E:\\XB\\解包\\com\\file\\0xF1EF3B32\\0_bak.c" -o "E:\\TAURI_PROJECT\\tmp\\0_bak_mapped.mscsb" --exvsMapping "E:\\TAURI_PROJECT\\tools\\mappings\\exvs_0xF1EF3B32.native_truth.json"
python "tools/msclang.py" "E:\\XB\\解包\\com\\file\\0xF1EF3B32\\0.c" -o "E:\\TAURI_PROJECT\\tmp\\0_mapped.mscsb" --exvsMapping "E:\\TAURI_PROJECT\\tools\\mappings\\exvs_0xF1EF3B32.native_truth.json"
python "tools/mscdec.py" "E:\\TAURI_PROJECT\\tmp\\0_bak_mapped.mscsb" -o "E:\\TAURI_PROJECT\\tmp\\0_bak_mapped.c"
python "tools/mscdec.py" "E:\\TAURI_PROJECT\\tmp\\0_mapped.mscsb" -o "E:\\TAURI_PROJECT\\tmp\\0_mapped.c"
```

## Observations

1. Seed extractor generated first-pass mapping evidence:
   - `tmp/exvs_0xF1EF3B32.seed.json`
   - Includes `callback_bindings_seed` and `func83_seed`

2. `msclang --exvsMapping` compiled both baseline and modified script successfully.

3. `0.c` still includes `printf("[Hello World]")`, so layout changed as expected.

4. `func_83(slot, value)` table values in mapped outputs now relocate with layout delta:
   - Example baseline vs modified:
     - `func_83(0x1, 0x1426)` -> `func_83(0x1, 0x142b)` (`+0x5`)
     - `func_83(0x7, 0x1a52)` -> `func_83(0x7, 0x1a57)` (`+0x5`)
     - `func_83(0x21, 0x2578)` -> `func_83(0x21, 0x257d)` (`+0x5`)

5. `mscdec --exvsMapping` runs successfully on rebuilt outputs, confirming mapping import path is valid.

## Current Limitation

- `script_delta` relocation depends on an accurate `anchor_baseline_offset`.
- The checked-in mapping uses a placeholder baseline offset until native IDA truth extraction finalizes exact anchor values for the target build.

