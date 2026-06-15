# SHL (`shell_*.shl`) Format Analysis

Reverse-engineering record for the legacy SHL "shader/model shell" control bin used by
FHM2D unit-model packages. Goal: implement a byte-faithful Rust `parse_shl` / `build_shl`
and a Unit Model Editor shell editor.

- Game binary analysed: `E:\OBHK0.3_v27\vsac27_Release.exe` (`vsac27_Release.exe.i64`, x64).
- Samples: `E:\XB\解包\com\file\0x*\shell_*.shl` (8 files) plus the unpacked package
  `0xEE39E2DD` (`shell_033gndage_004gagefx_001.shl`).
- One SHL exists per package, named `shell_<character>_<costume>_NNN.shl`, sitting at the
  package root next to `characterid_*.bin`, `effect_project_*.bin`, `vernier_table_*.bin`.

## TL;DR

```
Header (0x10 bytes)
  0x00  u32  magic   "SHLL" (53 48 4C 4C)
  0x04  u32  version 0x64 (100)            // constant across all samples
  0x08  u32  reserved 0                    // always 0 in samples
  0x0C  u32  record_count

Record (0x20 bytes each, record_count of them, starting at 0x10)
  0x00  u32  model_id      // proprietary name-hash of the model FOLDER name
  0x04  u32  model_type    // 0 main body (required), 1 ?, 2 assist/援护, 3 part/部件
  0x08  u32  folder_index  // index into the structure-JSON model folder order
  0x0C  u32  unk1          // observed 0/1/2 — purpose unknown
  0x10  u32  slot_index    // usually == folder_index, may diverge
  0x14  u8[12] reserved    // always 0 in samples

File size == 0x10 + record_count * 0x20  (exact, no trailing data in samples)
```

## Field semantics

- **`model_id` (0x00)** — a 32-bit proprietary name hash of the model's *folder* name
  (e.g. `033gndage_004gagefx_001_body_normal`). Confirmed NOT CRC32-IEEE
  (`0xD3F54E76`), CRC32C (`0x314CB43C`), or FNV-1a-32 (`0xD9A410F7`); the stored value
  is `0x90BDF6A5`. This is the same hash family the repo already documents as the
  "proprietary VDK hash" (`serieslist.rs`). The algorithm is **not** implemented in the
  repo. We do not need it for the editor — see "model_id without the algorithm" below.
- **`model_type` (0x04)** — role of the model slot:
  - `0` main body (主机体). At least one must exist or the game errors.
  - `1` unknown (not yet observed in samples).
  - `2` assist / support (援护) type.
  - `3` part (部件) type; attaches onto a `0` body.
- **`folder_index` (0x08)** — index of the model in the package's **structure-JSON model
  folder order** (the order our extractor emits), NOT the OS/Windows alphabetical sort.
  Critical: in `0xEE39E2DD` Windows lists `..._assist_flat00` first, but SHL record 0 is
  `..._body_normal` (the type-0 main body). Always resolve via structure order.
- **`unk1` (0x0C)** — observed values 0, 1, 2. Independent of `folder_index` (e.g.
  `003zzgndm` record 2 has `folder_index=2` but `unk1=1`). Kept as `unk1` until known.
- **`slot_index` (0x10)** — a per-record index that usually equals `folder_index` in the
  small samples but is documented by the operator as occasionally diverging; treat as its
  own field, do not assume `== folder_index`.
- **`reserved` (0x14..0x20)** — 12 bytes, always zero in every sampled record.

## model_id without the algorithm (editor strategy)

The proprietary hash is not reversed, but the editor never needs to compute it for the
realistic cases:

1. **Display** `model_id -> model name` via `folder_index` -> structure-JSON model folder.
   No hashing required.
2. **Byte fidelity**: `build_shl` preserves the original 0x20 record bytes for any record
   whose logical fields are unchanged (same technique `build_vernier_table` uses with
   `source_entries_raw`). Untouched records round-trip exactly ("一字不落").
3. **Cross-bin harvest**: the identical `model_id` appears in `effect_project_*.bin`,
   `vernier_table_*.bin`, and `characterid_*.bin` for the same model, so a
   folder/name -> model_id table can be harvested from the package itself when a record's
   model is changed/added, without the hash function.
4. Adding a reference to a model that exists in `models/` but is referenced by no control
   bin anywhere would require the hash — documented limitation, deferred until/if the VDK
   hash is implemented.

## Evidence

`model_id 0x90BDF6A5` (`A5 F6 BD 90`) for `033gndage_004gagefx_001_body_normal` appears in
three control bins of package `0xEE39E2DD`, and in no `models/` file:

```
effect_project_033gndage_004gagefx_001.bin  @0x32C  A5 F6 BD 90
shell_033gndage_004gagefx_001.shl           @0x10   A5 F6 BD 90
vernier_table_033gndage_004gagefx_001.bin   @0xF50  A5 F6 BD 90
```

Header + first 3 records of three samples (all satisfy `size == 0x10 + count*0x20`):

```
shell_003zzgndm_001zzgndm_001_body_normal.shl  size=912  count=28
  0000: 53 48 4C 4C 64 00 00 00 00 00 00 00 1C 00 00 00   magic, ver=0x64, count=28
  0010: DD 9A 46 17 | 00 00 00 00 | 00 00 00 00 | 00 00 00 00   id, type0, folder0, unk0
  0030: 16 E4 A4 4A | 00 00 00 00 | 01 00 00 00 | 00 00 00 00 | 01...  type0, folder1, unk0, slot1
  0050: 00 C7 C4 5F | 03 00 00 00 | 02 00 00 00 | 01 00 00 00 | 02...  type3, folder2, unk1, slot2

shell_026gnbelt_002nitngl_001.shl  size=464  count=14
  0010: CA 4F 62 B0 | 00 | 00 | 00 | 00            type0, folder0, unk0, slot0
  0030: 2E 83 4F 18 | 03 | 01 | 01 | 01            type3, folder1, unk1, slot1
  0050: 7C 4F 2A 12 | 03 | 02 | 01 | 02            type3, folder2, unk1, slot2

shell_015gndmuc_004deltpl_001.shl  size=560  count=17
  0010: 43 30 9C AB | 00 | 00 | 00 | 00            type0, folder0, unk0, slot0
  0030: 86 55 B0 0C | 00 | 01 | 01 | 01            type0, folder1, unk1, slot1
  0050: 59 99 0C 22 | 03 | 02 | 02 | 02            type3, folder2, unk2, slot2
```

## IDA findings (`vsac27_Release.exe`)

The game does **not** expose a dedicated SHLL parser to static search:

- No `"SHLL"` string, no `".shl"` string, no `"shell_"` string in the string list.
- No `0x4C4C4853` (LE "SHLL"), `0x53484C4C` (BE), or `0x644C4C4853` (magic+version)
  immediate anywhere in code.
- No literal `53 48 4C 4C` byte sequence in the image.

Conclusion: `.shl` is loaded through the FHM2D generic *typed-package* loader, dispatched
by a numeric type id stored in the package table, not by extension string or magic
comparison. There is no symbol-named function to cite; the format contract is therefore
established from the on-disk bytes (above) plus operator domain knowledge, which agree
fully across all samples.

## Functions

### Existing (repo)

- `unit_model_validate.rs :: read_shl_model_count(path) -> Result<usize, String>`
  Reads `0x10`-min length, checks `SHLL` magic, reads `record_count` at `0x0C`, validates
  `len >= 0x10 + count*0x20`. Used only to warn when SHL slot count != model-group count;
  it does not parse records. This is the seed for the full parser.

### Planned (`src-tauri/src/format/shl.rs`)

```
struct ShlHeader   { version: u32, reserved08: u32 }            // magic + count are implicit
struct ShlRecord   { model_id: u32, model_type: u32, folder_index: u32,
                     unk1: u32, slot_index: u32, reserved14: [u8; 12] }
struct ShlFile     { header: ShlHeader, records: Vec<ShlRecord>,
                     source_records_raw: Vec<[u8; 0x20]> }       // for byte-faithful rebuild

fn parse_shl(data: &[u8]) -> Result<ShlFile, String>
  - require len >= 0x10, magic == b"SHLL"
  - version @0x04, reserved @0x08, count @0x0C
  - require len >= 0x10 + count*0x20
  - for each record: read the six fields + keep the raw 0x20 bytes

fn build_shl(f: &ShlFile) -> Result<Vec<u8>, String>
  - write magic, version, reserved08, count = records.len()
  - per record: if source raw exists and decodes to the same logical fields, re-emit raw
    verbatim; else serialize fields LE + zeroed reserved
  - byte-roundtrip test on all 8 samples must assert rebuilt == source
```

IPC: add `parse_shl_file(path)` / `build_shl_file(file_json, output_path)` Tauri commands
(parallel to `parse_typed_param_file` / `build_typed_param_file`).

## Editor integration plan (Unit Model Editor)

- Extend `ssbhEditorKindForPath` (or a sibling dispatch) to recognise `.shl`.
- New shell editor body: a record table (model name via `folder_index`, type dropdown
  `0/1/2/3`, folder picker from structure order, `unk1`, `slot_index`), add/remove/reorder.
- Reuse the shared resizable `SsbhEditorModalWindowShell` + session lifecycle
  (`open/draft/save/reload/dirty-guard`) like the other control-bin editors.
