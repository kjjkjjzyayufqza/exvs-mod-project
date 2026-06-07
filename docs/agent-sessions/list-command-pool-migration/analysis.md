# series_list / stage_list → command-pool migration (analysis)

Goal: migrate `series_list.bin` and `stage_list.bin` parsing from the legacy
hardcoded-offset + `unk` TypeScript model to the same field-spec / command-pool
architecture already used by `character_list.bin`, so that `unk` fields become
readable named fields. Field names must be derived from IDA (binary
`vsac27_Release.exe`, OB), not guessed; `unk_0xNN` only where IDA yields nothing.

## Shared binary format (param_bin, magic 0xCDABB8A9)

All three list files share one layout (`src-tauri/src/format/param_bin_format.rs`):

```
0x00 header (0x20):
  magic(0xCDABB8A9) unk04 fileSize unk0c entryCount commandsCount entrySize unk1c
0x20 hash section:   commandsCount * u32 (field key hash)
     desc section:   commandsCount * {u32 entryOffset, u32 flags, u32 kind}
     id section:     entryCount * u32 (entry id)
     entry rows:     entryCount * entrySize
     string pool:    trailing
kind: 1=u32(raw/hash) 2=int(enum/id) 5=float 7=string offset
```

- `character_list` already uses this via Rust `parse_characterlist` +
  `CHARACTERLIST_COMMAND_POOL` (`src-tauri/src/format/characterlist.rs`),
  generic helpers in `param_entry_schema.rs`.
- `series_list` / `stage_list` are parsed in pure TS (`src/models/seriesList.ts`,
  `src/models/stageList.ts`): command section stored raw, entry read by
  hardcoded offset with `unk` names → source of the `unk` fields.

Field-key hashes are a proprietary VDK hash (NOT CRC32/FNV/DJB2 — see
`command_mapping.md`), so they cannot be reversed from candidate strings. Names
come from (a) offset-bridging the existing RE'd TS model, (b) cross-file shared
hashes with `CHARACTERLIST_COMMAND_POOL`, (c) IDA consumer analysis.

## Sample files

- `E:\XB\解包\com\file\0xB7367090\series_list.bin`
- `E:\XB\解包\com\file\0xCE74091E\stage_list.bin`
- `E:\XB\解包\com\file\0xDFD38C70\character_list.bin`

## series_list field_specs (entrySize=0x1C, commandsCount=6)

| offset | hash | kind | legacy TS name | status |
|--------|------|------|----------------|--------|
| 0x00 | 0x1111D441 | 1 | unk2 | shared w/ stage 0x00; TBD |
| 0x04 | 0x6CA1A996 | 1 | iconFileIndex | bridged |
| 0x08 | 0x869F08CE | 2 | unk3 | TBD |
| 0x0C | 0x8C18E794 | 7 | unkStr1 (series name) | bridged (string) |
| 0x10 | (none) | - | unk4 | GAP (no spec) |
| 0x14 | 0xAF69BF4B | 1 | unk5 | TBD |
| 0x18 | 0xC0922304 | 2 | characterListPosition | bridged |

## stage_list field_specs (entrySize=0x48, commandsCount=17)

| offset | hash | kind | legacy TS name | status |
|--------|------|------|----------------|--------|
| 0x00 | 0x1111D441 | 1 | unk1 | shared w/ series 0x00; TBD |
| 0x04 | 0x163BDAD5 | 2 | unk2 | TBD |
| 0x08 | 0x21BF7216 | 2 | unk3 | TBD |
| 0x0C | 0x2297748A | 1 | unk4 | TBD |
| 0x10 | 0x275AC0EA | 2 | unk5 | = char `series_alt_group_id` |
| 0x14 | 0x4A0A639D | 1 | unk6 | TBD |
| 0x18 | 0x509DC39F | 1 | vs_s_d | bridged (hash value) |
| 0x1C | 0x56DF265C | 1 | fileName | bridged (hash value) |
| 0x20 | 0x59154D2B | 2 | unk9 | TBD |
| 0x24 | 0x5E464BAD | 1 | vs_s_l | bridged (hash value) |
| 0x28 | 0x6CD5881F | 2 | unk11 | = char `series_default_group_id` |
| 0x2C | 0x6DE44026 | 7 | name | bridged (string) |
| 0x30 | (none) | - | unk13 | GAP (no spec) |
| 0x34 | 0x777FCAAC | 2 | unk14 | TBD |
| 0x38 | 0x876536E4 | 2 | unk15 | TBD |
| 0x3C | 0xA8D01752 | 2 | uniqueIndex | bridged |
| 0x40 | 0xAC448CB5 | 1 | vs_sn | bridged (hash value) |
| 0x44 | 0xB88AD3D3 | 1 | iconIndex | bridged |

Note: the legacy TS used contiguous offsets, but the file has 4-byte GAPS at
series 0x10 and stage 0x30 that have no command spec (string fields at 0x0C/0x2C
are u32 offsets occupying 4 bytes; the following 4 bytes are undescribed).

## IDA findings

- Generic field reader for stage/series: `sub_140533EF0(entry,&outPtr,&outKind,count,hash)`.
  Character uses a different named reader `CharacterList_ReadFieldByHash` (0x140531c50).
- Per-field getters are tiny funcs that inline one hash and call the reader,
  e.g. `sub_1408F64F0` reads hash 0x56DF265C (stage fileName).
- These getters are VIRTUAL methods on `CStageData@Exvs2ResourceInstance`
  (RTTI `.?AVCStageData@Exvs2ResourceInstance@@` @ 0x14206b038). `sub_140756350`
  (a thin accessor calling sub_1408F64F0) is referenced only from vtables
  (0x14136d150, 0x142b419cc), not from code → consumers dispatch virtually, so
  static xref-based naming is limited.
- A descriptor table at 0x142b55d80 holds 12-byte records {getter_rva, getter_rva,
  typed_reader_rva}; the 3rd column is a shared typed reader (u32/int/float/string),
  not a name string.
- `sub_140534020(id,flag)` returns char field `flag?0x275AC0EA:0x6CD5881F` via
  CharacterList_ReadFieldByHash → confirms 0x275AC0EA=series_alt_group_id,
  0x6CD5881F=series_default_group_id.

## Cross-file shared hashes (from CHARACTERLIST_COMMAND_POOL)

| hash | char name | appears in |
|------|-----------|-----------|
| 0x275AC0EA | series_alt_group_id | stage 0x10 |
| 0x6CD5881F | series_default_group_id | stage 0x28 |

## Implementation plan (decided: full backend+model+UI, both lists)

1. Rust: `serieslist.rs` + `stagelist.rs` mirroring `characterlist.rs`; define
   `SERIESLIST_COMMAND_POOL` / `STAGELIST_COMMAND_POOL`; parse/build with
   byte-exact roundtrip; register in `parse_typed_param_file`,
   `build_command_table_file`, `validate_command_table_file_type`.
2. Pools named from IDA + bridged + cross-shared; `unk_0xNN` only where IDA silent.
3. TS models `seriesListEntry.ts` / `stageListEntry.ts` (named fields, snake→camel);
   migrate `SeriesListView`/`StageListView`/`SeriesEditor`/`StageEditor`/forms to
   backend `invoke` + new models. Keep GVS stage list (magic A9B8ABCE, different
   header, no command section) as-is.

## Final field naming (implemented) + IDA evidence

Per-field getters are virtual methods; static naming comes from the few callers
that read fields via the generic reader `sub_140533EF0` / `LookupCommandDescriptorByHash`
with literal hashes. find_bytes triage: a hash with no code reference at all is
genuinely IDA-silent and kept as `unk_0xNN`.

stage_list (STAGELIST_COMMAND_POOL):
- 0x1111D441 record_lookup_id — IDA: LookupRecordIdByFieldValue key (BgmList-style).
- 0x163BDAD5 random_select_weight_default — IDA: sub_1408F6D50 weighted-random picker (arg==0).
- 0x21BF7216 random_select_weight_alt — IDA: sub_1408F6D50 (arg!=0).
- 0x275AC0EA series_alt_group_id — char-shared; IDA: sub_1408F6890 alt-mode group/enable.
- 0x6CD5881F series_default_group_id — char-shared; IDA: sub_1408F6890 default-mode group/enable.
- 0x59154D2B select_order_alt — IDA: sub_1408F6890 alt-mode order index.
- 0xA8D01752 select_order_default — IDA: sub_1408F6890 default-mode order index (legacy uniqueIndex).
- 0x509DC39F vs_s_d / 0x56DF265C file_name / 0x5E464BAD vs_s_l / 0xAC448CB5 vs_sn — legacy
  resource-hash fields (getter-only / virtual; legacy RE names kept).
- 0x6DE44026 name (string) / 0xB88AD3D3 icon_index.
- 0x2297748A, 0x4A0A639D, 0x777FCAAC, 0x876536E4 → unk (ZERO code refs; IDA-silent).

series_list (SERIESLIST_COMMAND_POOL):
- 0x1111D441 record_lookup_id (shared with stage).
- 0x6CA1A996 icon_file_index — IDA: getter sub_140900F00 (series icon).
- 0x8C18E794 name (string) / 0xC0922304 character_list_position (legacy).
- 0xAF69BF4B display_name_ref — IDA: sub_140900F60 → Jukurendo popup name (sub_1409F8EA0).
- 0x869F08CE → unk (ZERO code refs; IDA-silent).

## STATUS: COMPLETE (verified)

Backend (`cargo test --lib serieslist`/`stagelist`, 3 tests each):
- byte-exact in-process roundtrip on real samples;
- JSON IPC roundtrip (`parse_*list` → JSON → `build_*list` → re-parse) preserves all
  named entry fields + strings.

Frontend `npx tsc --noEmit`: zero errors in migrated files (only pre-existing
SceneEdit test errors remain). Files:
- new `src/models/serieslistEntry.ts` (seriesListEntry.ts) + `stageListEntry.ts`;
- migrated SeriesListView/SeriesEditor/SeriesForm/SeriesList/SeriesCard +
  CharacterListView series picker; StageListView/StageEditor/StageForm/StageList/
  StageCard/StageListJson — all load via `invoke('parse_typed_param_file',{paramType})`
  and save via `invoke('build_typed_param_file',...)`.
- deleted legacy `src/models/seriesList.ts`; trimmed `src/models/stageList.ts` to GVS-only.

GVS stage list (magic A9B8ABCE) left on the legacy `stageList.ts` model unchanged.
