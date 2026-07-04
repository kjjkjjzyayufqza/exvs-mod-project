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
