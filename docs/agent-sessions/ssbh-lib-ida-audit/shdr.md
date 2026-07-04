# shdr (RDHS / `.nushdb` v1.2) — ssbh_lib vs EXVS2 IDA Audit

Session: 2026-06-14  
Binary: `vsac27_Release.exe` (`E:\OBHK0.3_v27\vsac27_Release.exe.i64`)  
Sources: `E:/research/ssbh_lib/ssbh_lib/src/formats/shdr.rs`, `E:/research/ssbh_lib/ssbh_data/src/shdr_data.rs`

---

## Overview

| Field | Value |
|-------|-------|
| Rust type | `ssbh_lib::formats::shdr::Shdr` |
| High-level API | `ssbh_data::shdr_data::ShdrData` |
| Outer container | `HBSS` (64-byte header, 16-byte aligned payload) |
| Inner FourCC | `RDHS` (`52 44 48 53` LE) |
| Version | **1.2 only** (`major=1`, `minor=2`) |
| Extension | `.nushdb` |
| FHM2D `fileType` | `0x0A` (see TAURI `fhm2d.rs`) |
| Role | Precompiled GPU shader **database**: multiple shader programs per file, each with NVN/Tegra bytecode plus reflection metadata (uniforms, buffers, vertex I/O). |

Community context (Smash / EXVS lineage): `.nushdb` stores **no plaintext GLSL**; metadata maps material/mesh inputs to compiled programs. Shader **program labels** and stage wiring live primarily in `.nufxlb` (`XFUN`), while `.numatb` references a `shader_label`. See [Smush-Material-Research Shaders.md](https://github.com/ScanMountGoat/Smush-Material-Research/blob/master/Shaders.md).

---

## ssbh_lib coverage (`formats/shdr.rs`)

### File envelope

```
Offset  Size  Field
0x00    4     "HBSS"
0x04    8     u64 0x40 (header size)
0x0C    4     u32 0
0x10    4     "RDHS"
0x14    2     u16 major_version (=1)
0x16    2     u16 minor_version (=2)
0x18    …     payload (relative pointers)
```

`Versioned<Shdr>` dispatches only `Shdr::V12`.

### Top-level `Shdr::V12`

| Field | Type | Notes |
|-------|------|-------|
| `shaders` | `SsbhArray<Shader>` | Relative offset + count; each element describes one compiled stage entry. |

### `Shader` entry (per program stage)

| Offset (inline) | Type | ssbh_lib field | Notes |
|-----------------|------|----------------|-------|
| +0 | `SsbhString` | `name` | Shader entry name (4-byte aligned CString via `RelPtr64`). |
| +8 | `u32` | `shader_stage` | `ShaderStage` enum, see below. |
| +12 | `u32` | `unk3` | Comment: **always 2** in observed files. |
| +16 | `SsbhByteBuffer` | `shader_binary` | `u64` rel offset + `u64` byte length → raw inner blob. |
| +32 | `u64` | `binary_size` | Redundant size field; `#[br(pad_after=16)]` / `#[ssbhwrite(pad_after=16)]` on struct. |

**Inline struct size:** 40 bytes + 16 bytes trailing padding = **56 bytes** per `Shader` header (before pointed string/binary data).

### `ShaderStage` (`repr(u32)`)

| Value | Variant |
|-------|---------|
| 0 | `Vertex` |
| 3 | `Geometry` |
| 4 | `Fragment` |
| 5 | `Compute` |

Gaps (1, 2) are unused in the Rust enum; game may reserve other stage IDs.

### Read/write status

- **Read:** full `Shdr` v1.2 via `binrw` + `SsbhWrite` round-trip (fuzz target `ssbh_lib/fuzz/fuzz_targets/shdr.rs`).
- **Write:** `Shdr` → file supported at lib level; **`ShdrData` → `Shdr` not implemented** (no encoder in `shdr_data.rs`).

---

## ssbh_data coverage (`shdr_data.rs`)

`ShdrData` parses each `Shader.shader_binary` into `ShaderEntryData { name, shader_stage, meta_data }`.

`Metadata` exposes:

- `buffers: Vec<Buffer>`
- `uniforms: Vec<Uniform>`
- `inputs: Vec<Attribute>`
- `outputs: Vec<Attribute>`
- `constant_buffer: Vec<f32>` (64 floats = 256 bytes)

### Inner `ShaderBinary` layout (partial)

The inner blob is **not** fully modeled as a single `binrw` struct; fixed seeks are used:

| Absolute offset | Field | Size | Notes |
|-----------------|-------|------|-------|
| `0x120` (288) | `UnkHeader` | 108 | Reflection header; all child tables relative to `entry_offset`. |
| `0x9C8` (2504) | `code_length` | 4 | Temp read; length of `program_code` in bytes. |
| after header read | `unk1` | 4 | Sequential read at cursor (~0x18C). |
| | `constant_buffer_offset` | 4 | Added to `0xB20` (2848) for CB load. |
| | `unk3` | 4 | |
| `0xB20 + constant_buffer_offset` | `constant_buffer` | 256 | 64 × `f32`. |
| `0xB50` (2896) | `program_code` | `code_length` | Precompiled GPU machine code (NVN). |

**Gap:** bytes `0x18C`–`0x9C8` (~1852 bytes) and region before `0x120` are **unparsed**.

### `UnkHeader` (108 bytes @ +288)

| Field | Type | Role |
|-------|------|------|
| `file_end_relative_offset` | u32 | Points near end of inner blob. |
| `entry_offset` | u32 | Base for all `UnkPtr` tables and string pool. |
| `unk1` | u32 + 32 pad | Unknown; comment says "all zeros". |
| `buffer_count` | u32 | |
| `buffer_entries` | `UnkPtr<BufferEntry>` | rel + `entry_offset` |
| `uniform_count` | u32 | |
| `uniforms` | `UnkPtr<UniformEntry>` | |
| `input_count` | u32 | |
| `inputs` | `UnkPtr<AttributeEntry>` | |
| `output_count` | u32 | |
| `outputs` | `UnkPtr<AttributeEntry>` | |
| `unk3`–`unk7` | 5×u32 | Unknown. |
| `string_info_end_relative_offset` | u32 | |
| `string_section_length` | u32 | |
| `string_section_relative_offset` | u32 | Pool base = `entry_offset + string_section_relative_offset`. |

### Table entry sizes (from comments)

| Struct | Size | Key fields |
|--------|------|------------|
| `BufferEntry` | 108 | `name` (EntryString + 32 pad), `used_size_in_bytes`, `uniform_entry_count`, `unk4`–`unk7`, padding |
| `UniformEntry` | 164 | `name`, `data_type`, `buffer_index`, `uniform_buffer_offset`, `unk11` (texture slot hint), `unk17` (0=texture, 1=?, 257=array elem) |
| `AttributeEntry` | 92 | `name`, `data_type`, `location` (-1 = builtin e.g. `gl_Position`), `unk5` (0/1/2) |

`EntryString`: `{ offset: u32, length: u32 }` into string pool; read subtracts 1 from length for NUL.

### `DataType` enum (partial)

| Value | Name | Inferred GLSL |
|-------|------|---------------|
| 0 | Boolean | bool |
| 4 | Int | int |
| 7 | Unk7 | unknown |
| 20 | UnsignedInt | uint |
| 22 | UVec3 | uvec3 |
| 36 | Float | float |
| 37–39 | Vector2/3/4 | vec2/3/4 |
| 50 | Matrix4x4 | mat4 |
| 67–73 | Sampler2d/3d/Cube/2dArray | samplers |
| 103 | Image2d | image2D |

---

## IDA findings (`vsac27_Release.exe`)

### Negative evidence (important)

| Search | Result |
|--------|--------|
| String `.nushdb`, `nushdb`, `RDHS`, `Shdr`, `HBSS` | **No hits** |
| Byte pattern `52 44 48 53` / `48 42 53 53` | **No hits** |
| Immediate `0x53484452` (RDHS) | **No hits** |
| Immediate other SSBH magics | Only **`LTAM`**, **`XFUN`**, **`LDOM`** found (see below) |

**Conclusion:** The PC EXVS2 main executable does **not** embed an obvious RDHS/HBSS loader. `.nushdb` is still shipped in stage packs (`fileType 0x0A`) and parsed by tooling via `ssbh_lib`; runtime loading may use a **stripped inner payload** (magic already resolved), a **dynamically linked SSBH module**, or pre-baked GPU state not present as literal FourCC in this IDB.

### SSBH format dispatch pattern (observed for other types)

Game uses a common header at **`base + 0x10`**:

```
+0x10  u32  FourCC (LE)
+0x14  u16  major
+0x16  u16  minor
+0x18  …    payload
```

| FourCC | Immediate | Function | Versions routed |
|--------|-----------|----------|-----------------|
| `LTAM` | `0x4D41544C` | `sub_140288EC0` | minor 5 → `sub_14028A7C0`, minor 6 → `sub_140289F00` |
| `LTAM` | (same) | `sub_140288F20` | minor 5/6 → `sub_14028A240` |
| `XFUN` | `0x4E554658` | `sub_140289E20` | minor 0/1/2 → `sub_14028AB00` / `sub_14028D2C0` / `sub_14028DB50` |
| `LDOM` | `0x4D4F444C` | `sub_140298210` | minor 6/7 → `sub_1402A5460` / `sub_1402A5C10` |

**RDHS dispatcher:** not found with same immediate-search methodology.

### Material / shader label chain (related, not `.nushdb` parse)

Shader **names** used at runtime (not reflection from `.nushdb`):

```
sub_14011C7D0  — thread-local table init
  ├─ "FeRendererMovable"
  ├─ "FeRendererMovableVertexColor"
  ├─ "FeRendererMovableMultiUVVertexColorAO"
  ├─ "vsngCharaBasic"
  ├─ "FeStandard"
  └─ "FeStandard_MultiUV"
```

Call chain for material container access:

```
sub_1402EDCF0
  → sub_140114D60        (SSBH stream ingest)
      → sub_140288EC0    (LTAM matl v1.5/v1.6)
  → sub_140115510        (material graph build)
      → sub_140298210    (LDOM modl v1.6/v1.7)
      → sub_140289420    (material param merge)
      → sub_140291040 → sub_1401836E0 → sub_140183AA0
```

`sub_14011C7D0` (caller `sub_1405CD100`) compares material `shader_label` strings against the FeRenderer/vsng table — aligns with EXVS2 stage migration docs (`vsngCharaBasic` vs `vstgStandard_VertexColor`).

### Misleading `0xB50` / `0x9C8` hits

Immediate `2896` (`0xB50`) appears in unrelated class sizes (e.g. `sub_14072C800` allocates `0xB50` for UI `CAcSepLmTournamentMenu`, not shader parsing). Do **not** treat all `0xB50` immediates as `program_code` offset without decompiler context.

### `ShaderStages_*` strings

Debug/typeinfo strings at `0x141AAC89F` (`ShaderStages_RasterDefault`, etc.) — **no code xrefs** in this IDB; likely stripped PDB metadata only.

---

## Field mapping summary

| ssbh_lib / shdr_data | IDA EXVS2 | Confidence |
|----------------------|-----------|------------|
| `HBSS` wrapper | Not found in binary | N/A — may strip before game parser |
| `RDHS` FourCC | Not found | **Gap** — no direct loader located |
| `Shader.shader_stage` u32 | Not traced | Medium — values 0/3/4/5 match NVN stage model |
| `Shader.shader_binary` | Not traced | **Gap** |
| `UnkHeader` @ +288 | Not traced | **Gap** — ssbh_data only |
| `program_code` @ +2896 | Not traced | **Gap** |
| `Metadata.uniforms/inputs` | Not traced | **Gap** |
| Material `shader_label` | `sub_14011C7D0` string table | **High** — runtime selection, separate from RDHS parse |
| `.nufxlb` program wiring | `sub_140289E20` (XFUN) | **High** for nufx, not nushdb |

---

## Gaps and severity

| ID | Gap | Severity | Notes |
|----|-----|----------|-------|
| G1 | No RDHS/HBSS loader in `vsac27_Release.exe` | **High** | Blocks full game↔ssbh_lib field parity for `.nushdb` |
| G2 | Inner blob `0x00`–`0x11F` unparsed | Medium | May contain NVN header / version / checksum |
| G3 | Region `~0x18C`–`0x9C7` unparsed | Medium | Likely secondary headers or alignment padding |
| G4 | `unk3` on `Shader` always 2 — semantic unknown | Low | |
| G5 | `BufferEntry`/`UniformEntry` unk fields | Medium | Texture binding (`unk11`, `unk17`) only partially guessed |
| G6 | `DataType::Unk7` | Low | |
| G7 | No `ShdrData` → `Shdr` writer | Medium | Round-trip editing not supported in ssbh_data |
| G8 | No unit tests with real `.nushdb` fixtures in repo | Medium | Fuzz only |

---

## Recommended next IDA steps

1. Locate **RDHS** by tracing **fileType `0x0A`** in FHM2D unpack path (TAURI `fhm2d.rs` maps `.nushdb` → `0x0A`) into game archive loader — may not use FourCC string.
2. Inspect **SSBHLib DLL** decompile tree (`D:\rpcs3\tools\反编译_SSBHLib_dll` per project notes) for `RDHS` / shader binary parsers; PC game may delegate there.
3. When a loader is found, verify fixed offsets **288 / 2504 / 2848 / 2896** against `ShaderBinary` in `shdr_data.rs`.
4. Cross-reference **`sub_140289E20` (XFUN)** outputs with `.nushdb` entry names — nufx programs reference vertex/fragment shader **names** that must match `Shader.name`.

---

## TAURI project touchpoints

| Location | Usage |
|----------|-------|
| `src-tauri/src/format/fhm2d.rs` | `0x0A` ↔ `.nushdb` |
| `src/page/SceneEdit/utils/sceneStageStructure.ts` | Stage asset extension list |
| `docs/exvs-stage-numatb-simple-color.md` | Shader **label** migration (matl ↔ runtime), not nushdb bytes |
| `src-tauri/Cargo.toml` | Vendored `ssbh_lib` branch `wmmt2` |

No first-class `.nushdb` editor UI in TAURI today; format is pack/extract preserved.

---

## 2026-07-04 PC DXBC / EFX Reflection Addendum

This addendum supersedes the earlier assumption that the fixed inner
`ShaderBinary` offsets in `ssbh_data::ShdrData` describe the local EXVS2 PC
assets.

Examined resource:

```text
E:\XB\解包\vs2\x64\005renderinfo\shader\efx\vsng_shader_efx_list_draw_3rd.nushdb
```

Results:

- `ssbh_lib::Shdr::V12` parses the outer file and exposes the expected
  `efxDrawModel*` shader entries.
- Each examined PC shader blob starts with `DXBC`, not the NVN-oriented inner
  representation assumed by the current `ShdrData` fixed seeks.
- `ShdrData::from_file` fails while parsing the first inner `BufferEntry`.
  Offsets `288/2504/2848/2896` must not be applied to this PC blob.
- A temporary read-only probe parsed the DXBC RDEF chunk directly and was
  removed after the run; `Cargo.toml` was restored without a diff.
- `efxDrawModelPS` has one 160-byte `drawConstantBuffer`. Its sole variable is
  a 160-byte `modelCBuffer` struct of type `SEfxModelConstantBuffer`.

RDEF provides the complete 160-byte layout:

| Member | Byte offset |
| --- | ---: |
| `distortionU` | `0` |
| `distortionV` | `4` |
| `distortionUPass2` | `8` |
| `distortionVPass2` | `12` |
| `drawSchemeFlag` | `16` |
| `useInstancingOffsetSB` | `20` |
| `softParticleRange` | `24` |
| `blurEnableRange` | `28` |
| `blurFadePower` | `32` |
| `reflectionPower` | `36` |
| `pass2BlendType` | `40` |
| `depthEmissionRange` | `44` |
| `depthEmissionPower` | `48` |
| `highlightPower` | `52` |
| `padding1` | `56` |
| `padding2` | `60` |
| `blurStartColor` | `64` |
| `blurEndColor` | `80` |
| `poseMatrix` | `96` |

IDA independently identifies the CPU owner as
`CShaderResourceConstantBuffer<SEfxModelConstantBuffer>` and binds it at
constant-buffer slot `7` for stages `0` and `4`. This reflection closes EFXBN
model-control `+0x70/+0x74`: slot2 supplies the first-pass distortion U/V and
slot3 supplies the pass-2 distortion U/V.

### Compute structured-buffer reflection

The companion PC resource
`vsng_shader_efx_list_3rd.nushdb` closes the complete EFXBN `0xB8`
model-control record:

- IDA names the CPU table `CEfxTextureParameterTable3rd` and the GPU mirror
  `CEfxTextureParameterTableShaderResource3rd`.
- The structured buffer is created with element size `184` and count `0x4000`.
- Both `efxSpawnParticleCommon3rd` and `efxKineticParticleModel3rd` expose the
  same RDEF `$Element` type, `SEfxTextureParameter`.
- The type has 29 members and covers all 184 bytes. RDEF kind `19` is uint and
  kind `3` is float.

| Offset | Member | Type |
| ---: | --- | --- |
| `0x00` | `input_source_type` | `uint` |
| `0x04` | `color_map_hash` | `uint` |
| `0x08` | `addressing_mode` | `uint` |
| `0x0C` | `reverse_u` | `uint` |
| `0x10` | `reverse_v` | `uint` |
| `0x14` | `texture_width` | `uint` |
| `0x18` | `texture_height` | `uint` |
| `0x1C` | `uv_pattern_type` | `uint` |
| `0x20` | `uv_u` | `float[4]` |
| `0x30` | `uv_v` | `float[4]` |
| `0x40` | `uv_scroll_speed` | `float` |
| `0x44` | `uv_scroll_limit` | `float` |
| `0x48` | `uv_scroll_direction` | `float` |
| `0x4C` | `uv_animation_random` | `uint` |
| `0x50` | `uv_animation_frame_num` | `uint` |
| `0x54` | `uv_animation_frame_width` | `uint` |
| `0x58` | `uv_animation_frame_height` | `uint` |
| `0x5C` | `uv_animation_frame_num_by_line` | `uint` |
| `0x60` | `uv_animation_frame_time` | `uint` |
| `0x64` | `uv_animation_3d_texture` | `uint` |
| `0x68` | `uv_scroll_model_speed_u` | `float` |
| `0x6C` | `uv_scroll_model_speed_v` | `float` |
| `0x70` | `uv_distortion_power_U` | `float` |
| `0x74` | `uv_distortion_power_V` | `float` |
| `0x78` | `texture_setting_flags` | `uint` |
| `0x7C` | `uv_animation_start_frame` | `uint` |
| `0x80` | `uv_random_offset_u` | `float` |
| `0x84` | `uv_random_offset_v` | `float` |
| `0x88` | `reserve_area` | `uint[12]` |

This supersedes the CPU-only provisional `sampler_filter_mode` label for
offset `0x08`: the authored field is `addressing_mode`. Offsets `0x0C/0x10`
are `reverse_u/reverse_v`, even though they do not need separate CPU readers
because the record is uploaded wholesale.

The current OB `006effect` corpus constrains the numeric domains but does not
fully name every authoring enum:

| Field | Observed values |
| --- | --- |
| `input_source_type` | `0`: 22653, `1`: 366, `2`: 80 |
| `addressing_mode` | `0`: 17133, `1`: 4027, `2`: 747, `3`: 1192 |
| `uv_pattern_type` | `0`: 13914, `1`: 7408, `2`: 1662, `3`: 115 |
| `texture_setting_flags` | `0`: 22558, `1`: 141, `2`: 21, `3`: 379 |

IDA confirms two behaviors: `input_source_type == 1` feeds
`sub_1401470F0` tail-bit production, while `addressing_mode` feeds the first
three sampler descriptor address-mode fields through `sub_1401777A0`. The UI
and JSON summaries should keep the numeric values visible unless later shader
or authoring evidence proves friendly enum labels.

Tooling implication: retain `ShdrData` for the platform/layout it currently
supports, but add a distinct DXBC/RDEF path before claiming EXVS2 PC `.nushdb`
metadata coverage.

---

## References

- ssbh_lib: `E:/research/ssbh_lib/ssbh_lib/src/formats/shdr.rs`
- ssbh_data: `E:/research/ssbh_lib/ssbh_data/src/shdr_data.rs`
- Related format: `formats/nufx.rs` (shader **program** database, `XFUN`)
- Smush shader research: https://github.com/ScanMountGoat/Smush-Material-Research
