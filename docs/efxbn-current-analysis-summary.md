# EFXBN Current Analysis Pickup

Canonical research summary:

```text
E:\research\efxbn\EXVS2\efxbn_current_analysis_summary.md
```

This Tauri repo currently uses the EFXBN research for parser summaries and
`exvs2-json` support work. Current confirmed implementation-facing points:

- EFXBN layout is lossless for the local `006effect` corpus.
- Control lookup starts at `0x20 + effectCount * 0x370 - 8`.
- Control lookup size is `controlConfigRegionParam * 8`.
- Model-control / texture-parameter blocks follow the complete control lookup.
- True post-model-control trailing length is `0` in current local corpus.
- Control lookup entries are qwords:
  - low dword: control key f32 bits;
  - high dword: control value f32 bits.
- Per-effect `controlReferences[]` has 18 `(selector, index/value)` pairs.
- `selector == 0`: no direct value.
- `selector == 1`: direct value from lookup high dword.
- `selector > 1`: sequence length for curve evaluation.
- `0xB8` model-control block is `SEfxTextureParameter`-backed.
- Model IDs, animation IDs, and texture IDs are IEEE CRC32 filename-stem IDs.
- `exvs2-json` is useful for related `.numshb` and `.numdlb` correlation.
- `exvs2-json inspect` does not currently support `.nuanmb`.
- Current Node parser priority is complete portable JSON conversion first:
  raw bytes emit as uppercase hex strings, build accepts hex / Buffer / legacy
  Buffer JSON, unresolved semantics remain neutral `unk*` fields, and legacy
  unknown aliases are input compatibility rather than preferred output.
- Tauri Rust/frontend sync now exposes the parser-first semantic shape:
  `unk0x18`, `unk0x1C`, per-effect `metaParsed.unkConfigInfo`,
  `metaParsed.configHeader.unk*`, `metaParsed.unk32`,
  `metaParsed.unkConfigInfo2`, `textureParameters`, and `todo.unknowns`.
- Tauri inventory intentionally does not emit full raw byte hex for every
  EFXBN file yet. Add a single-file full portable export later if editable raw
  bytes are needed without bloating folder inventory payloads.

Do not redo FHM2D loader research unless connecting a new request id / DPLID to
an EFXBN payload. FHM2D and Content-record notes are already in:

```text
E:\research\efxbn\EXVS2\fhm2pack_format_notes.md
E:\research\efxbn\EXVS2\sub_14011E5F0.md
```

## Effect pack registration order (textures first)

Confirmed in game on 2026-10-02 with the FAUC pack `0x0D0EB440`.

A nutexb added to an effect pack must sit in the texture group of its folder in
`SubFileStructure`. That group is the run of `unk2 = 01000000` items before the
model folders and the efxbn items. If the nutexb is listed after an efxbn that
samples it, that efxbn draws white, even though the nutexb, its hash and the
efxbn bytes are all correct.

How the exe reads the pack (OB v27 `vsac27_Release.exe`):

- `sub_1408EF9E0` registers the pack's entries in tree order.
- A texture goes into the texture table (`+552`), keyed by pack id and hash.
- An efxbn builds its drawers the moment it is registered.
  `sub_140174B30` resolves every colour or UV texture parameter with
  `sub_14016BE10`.
- If the hash is not registered yet, the drawer gets the default texture and
  keeps it.

Shipped packs always list textures first, then model folders, then efxbns.
`append_to_primary_container` in `src-tauri/src/format/effect_folder.rs` inserts
imported and copied entries in that order (`RegistrationRank`). Before this
change it appended at the end, which is how the white texture happened.
