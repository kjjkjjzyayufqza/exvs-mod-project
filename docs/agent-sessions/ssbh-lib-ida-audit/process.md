# ssbh_lib IDA Audit — Process Log

## 2026-06-14 — Session bootstrap

### Goal

Enumerate every binary format in `E:/research/ssbh_lib`, then per-format deep analysis against EXVS2 game logic via `ida-pro-mcp`.

### Enumeration method

1. Read `ssbh_lib/src/formats.rs` — 12 format modules.
2. Read `ssbh_lib/src/lib.rs` — `Ssbh` enum FourCC magics and `ssbh_read_write_impl!` macros.
3. Cross-check `ssbh_data/src/lib.rs` for high-level data modules.
4. Check `TAURI_PROJECT/src-tauri/Cargo.toml` for vendored dependency (git branch `wmmt2`, no local path patch).

### Complete format inventory (12 distinct formats + HBSS wrapper)

| Format | Rust type | FourCC | Typical extension | ssbh_data module |
|--------|-----------|--------|-------------------|------------------|
| hlpb | Hlpb | BPLH | .nuhlpb | hlpb_data |
| matl | Matl | LTAM | .numatb | matl_data |
| modl | Modl | LDOM | .numdlb / .nusrcmdlb | modl_data |
| mesh | Mesh | HSEM | .numshb | mesh_data |
| skel | Skel | LEKS | .nusktb | skel_data |
| anim | Anim | MINA | .nuanmb | anim_data (+ nuanmb_v12) |
| nlst | Nlst | TSLN | .nulstb | (lib only) |
| nrpd | Nrpd | DPRN | .nurpdb | (lib only) |
| nufx | Nufx | XFUN | .nufxlb | (lib only) |
| shdr | Shdr | RDHS | .nushdb | shdr_data |
| adj | Adj | (none) | .adjb | adj_data |
| meshex | MeshEx | (none) | .numshexb | meshex_data |

All SSBH types share outer container magic `HBSS` (bytes `48 42 53 53`).

### Out of scope (not in ssbh_lib)

- `nutexb` — texture format; TAURI Rust decode in `src-tauri`
- `hkt` — Havok collision; custom encoder in `src-tauri`
- `numshbd` — not present in ssbh_lib source (may be game-side derivative of numshb)

### IDA search strategy (per format subagent)

1. `find` type `string` for extension (e.g. `.numatb`, `numatb`, `LTAM`).
2. `find_bytes` for FourCC little-endian (e.g. `4D 41 54 4C` for LTAM).
3. `find` type `string` for `HBSS` loader paths if needed.
4. `analyze_function`, `callees`, `callgraph` on hit functions.
5. Document chains: `sub_140XXXXXX -> sub_140YYYYYY -> {field}`.

### Related TAURI_PROJECT docs

- `docs/exvs-stage-numatb-simple-color.md`
- `docs/gvs-numatb-step2-migration-changes.md`
- `docs/agent-sessions/` (various nusktb, numatb, mesh sessions)

### Subagent dispatch

12 background `generalPurpose` agents (composer-2.5), one per format. Reports → `{format}.md`.

---

## Findings (appended by format agents)

### adj (2026-06-14)

- **Report**: [`adj.md`](adj.md)
- **ssbh_lib**: `Adj { entries, index_buffer }`; `ssbh_data` `MAX_ADJACENT_VERTICES=18`.
- **IDA**: `.adjb`/`adjb`/`find_bytes` → 0 hits; `adjacency` = Boost RTTI only. Mesh chain `sub_1402EDCF0 → sub_1401152E0 → sub_1402980A0 → sub_14029B410` documented; no adj loader.
- **TAURI**: unused.
- **Follow-up**: real EXVS2 `.adjb` sample; seam/normal code from mesh callees.

### anim (MINA / .nuanmb) — 2026-06-14

**Report**: [`anim.md`](anim.md)

**IDA instance**: `vsac27_Release.exe` @ `127.0.0.1:13337`

**Key loader chain**:

```
sub_140115FC0 → sub_140233570 (MINA/NANM dispatch)
  ├─ NANM → sub_14024AE90
  └─ MINA major/minor:
       1.0 → sub_14024AF40
       1.1 → sub_14024BD20
       1.2 → sub_14024C680
       2.0 → sub_14024D1D0
```

**Runtime sampling chain**:

```
sub_140146A00 → sub_1402370B0("Transform")
  → sub_140234CB0 (Scale/Rotate/Translate/CompensateScale)
  → sub_140233C00 → sub_140233940 (types 1/12/16/44)
```

**Confirmed**: `sub_140239FE0` divides header float by `60.0` for v1.2 timebase — matches ssbh_data EXVS2 header convention (`final_frame_index=60`, `unk2=last frame`).

**Not found**: direct `cmp` against immediate `0x3409` in `0x140230000–0x140260000`; `0x4409` present in data table `sub_14117DF10`.

**ssbh_lib highlights**: `nuanmb_v12` implements `0x3409`/`0x4409` DCT residual family; default write path is uncompressed v1.2 unless `to_anim_v12_compressed()`.

**Open gaps**: V2.1 `unk_data` rebuild; strict `0x3409` 1D-motion variant; `NANM` legacy path not in ssbh_lib.

### hlpb (2026-06-14)

**Report:** [`hlpb.md`](hlpb.md)

**IDA chain (EXVS2 `vsac27_Release.exe`):**

```text
sub_1408EBBC0 → sub_140116A20 → sub_140298290 → sub_1402982C0
  ├─ BPLH v1.0 → sub_1402A61E0
  └─ BPLH v1.1 → sub_1402A6BC0 → sub_140298340 (node) / sub_140298530 (append)
```

**Confirmed:** FourCC `0x484C5042`, version 1.1, aim record 144 B, orient record 112 B, `ConstraintType` 0/1.

**Top gaps:** `HlpbData` drops `constraint_indices`/`constraint_types` interleave on save; TAURI `ssbh_motion` preview ignores quats/`unk_type`/schedule; duplicate `*_name1`/`*_name2` resolution differs from IDA.

**IDA notes:** No `.nuhlpb` string in binary; `BPLH` at `0x1402982d2`. Game also implements v1.0 parser (`sub_1402A61E0`) — not in ssbh_lib.

**Next:** Runtime helper-bone evaluator (post-parse), real-file round-trip corpus, optional IPC exposure of constraint schedule.

---

## 2026-06-14 — nufx (XFUN / .nufxlb)

### IDA connectivity

- Initial `ERR_CONNECTION_REFUSED`; retried successfully in same session.

### Search results

| Query | Hits |
|-------|------|
| `XFUN` string / bytes `58 46 55 4E` | `0x140289e3a` inside `sub_140289E20` |
| `.nufxlb` / `nufxlb` | None |
| `RDHS` / `nushdb` | None (shdr handled separately) |
| `nu::Final` | 20+ data refs |
| `nu::Opaque` / `Sort` / `Near` / `Far` | None in this binary |

### Dispatch chain (confirmed)

```
sub_140459130 / sub_1408E4DF0
  → sub_140116140
    → sub_140289E20  (XFUN @+0x10, major@+0x14, minor@+0x16)
      → sub_14028AB00  minor 0  (v1.0)
      → sub_14028D2C0  minor 1  (v1.1)
      → sub_14028DB50  minor 2  (v1.2, not in ssbh_lib)
```

Runtime type: `VDK::DEV::ASSET::NuMaterialEffect` (0x88 bytes).

### Key helpers

- `sub_14028B340` — SSBH relative pointer resolve
- `sub_14028BFA0` — read/append stage name string (×6 per program)
- `sub_14028C0D0` / `sub_14028C370` — program hash map (FNV-1a on name)
- `sub_14009DE20` + `off_141707BB0` — vertex attribute name → index (v1.1+)
- `sub_1400B7810` — per-program vertex attribute map insert (v1.1+)
- `sub_14028F3D0` — typed `unk_string_list` parse (v1.2)

### ssbh_lib gaps flagged

1. No v1.2 (`minor=2`) variant.
2. No `ssbh_data` module.
3. `unk_string_list` semantics unresolved.

### Deliverable

- `docs/agent-sessions/ssbh-lib-ida-audit/nufx.md`

### nrpd (2026-06-14)

**Report:** [`nrpd.md`](nrpd.md)

**ssbh_lib:** `formats/nrpd.rs` — v1.6 only; many `unk*` fields; `RenderPassData` variants partly guessed from string patterns.

**EXVS2 sample:** `E:/XB/解包/vs2/x64/005renderinfo/renderpipeline/1.nurpdb`

- Header: `HBSS` + `DPRN` + **version 1.2** (not 1.6) → **ssbh_lib cannot parse**.
- ASCII resource/pass names (not UTF-16 `SsbhString`).
- Default resolution `1920×1080` at offset `0x388`.
- Deferred pipeline passes: `FeGBuffer` → SDSM chain → `FeTiledDeferredShading` → `nuFeImageBasedLighting` → `nu::HDRComposite` → `FeRendererTransparency` → `nu::Final`.
- Resource suffix convention: `_RTV` / `_SRV` / `_DSV` / `_Plug`.

**FrameBuffer / RenderPass mapping (game):**

| ssbh_lib | Game role |
|----------|-----------|
| `Framebuffer0`–`4` | GBuffer MRTs, `Fe_RTV`, depth targets |
| `UniformBuffer` | `nuPerShadowCBuffer`, `cbSDSM_*`, scene/per-view cbuffers |
| `State::*` | Global sampler/raster/blend/depth; referenced by `*Plug` in passes |
| `RenderPassContainer.name` | Same strings as `nufx` `render_pass` buckets |
| `RenderPassData` 9–18 | Clears, viewport, state binds, RTV/DSV binds |

**IDA:** `ida-pro-mcp` connection refused — no game function addresses. Search plan documented in `nrpd.md` §11.

**Priority gaps:** P0 — add v1.2 reader; fix `render_passes` write rel ptr. P1 — `UnkFormat` DXGI mapping, `RelPtr64` array typing.

### modl (2026-06-14)

**Report:** [`modl.md`](modl.md)

**IDA chain (LDOM → skel/mesh/matl):**

```
sub_140115510
  └─ sub_140298210          ; FourCC LDOM (0x4D4F444C), major 1
       ├─ minor 6 → sub_1402A5460
       └─ minor 7 → sub_1402A5C10
            ├─ sub_140184070(ctx+0x40)  mesh  → nu::Mesh
            ├─ sub_140183F70(ctx+0x60)  skel  → nu::Skeleton
            └─ sub_140183E70(ctx+0x80)  matl  → nu::MaterialContainer
```

**ssbh_lib alignment:** v1.7 header/entry layout matches manual parser in `fhm2d_stage.rs` (base `0x18`, 24-byte `ModlEntry`).

**Gaps:** game also parses v1.6 (`sub_1402A5460`); ssbh_lib only v1.7. No `numdlb` extension strings in IDA — FourCC dispatch only.

**IDA notes:** `list_instances` initially refused connection; LDOM hits recovered on retry. `LDOM` string @ `0x140298226` has no xrefs; dispatch uses immediate compare in `sub_140298210`.

### nufx (2026-06-14)

- Report: [`nufx.md`](nufx.md)
- IDA: `vsac27_Release.exe` — XFUN hit at `0x140289e3a` (immediate in `sub_140289E20`).
- **Gap:** EXVS2 supports XFUN **1.2** (`sub_14028DB50`); ssbh_lib stops at 1.1.
- Loader chain: `sub_14044CBE0` → `sub_14010B610` → (`sub_140459A70` | `sub_1404591D0` → `sub_140459130`) → `sub_140116140` → `sub_140289E20` → version parser.
- Runtime type: `VDK::DEV::ASSET::NuMaterialEffect` (0x88 bytes).
- TAURI: `.nufxlb` FHM2D type `0x18`, pass-through in stage rebuild; no editor.

### nrpd (2026-06-14)

- **Report:** [`nrpd.md`](nrpd.md)
- **IDA:** `vsac27_Release.exe` — dual loaders `sub_1402A7660` → NRPD (`strncmp "NRPD"`) vs DPRN (`0x4E525044` @ payload+0x10).
- **Pipeline output:** `nu::RenderPipeline`; main parsers `sub_1402B9960` (offset table) and `sub_1402C71F0` (fixed layout).
- **FrameBuffer 0–4:** Confirmed 1:1 with `sub_1402C8F10`; `Framebuffer0` format field may be u32 in game vs u64 in ssbh_lib.
- **RenderPassData:** Partial match — types 9/10/12/14–17 confirmed; game also has types 4/5/11/20 not in ssbh enum.
- **Gaps:** `UnkFormat` unnamed; tail `unk_width*` fields unmapped; `render_passes` write broken in ssbh_lib.
- **Severity:** Medium (read OK for keep-as-is stage packs; edit/rebuild needs more RE).

### mesh (HSEM / `.numshb`) — 2026-06-14

**Agent**: mesh format subagent  
**Report**: [mesh.md](./mesh.md)

**IDA MCP**: `list_instances`, `find`, `analyze_function(sub_14029ACB0)` all returned `net::ERR_CONNECTION_REFUSED`. No `sub_` chains recovered this session.

**ssbh_lib highlights**:

- Versions 1.8 / 1.9 / 1.10 in `formats/mesh.rs`; EXVS2 production path uses **1.8**.
- EXVS2-specific `AttributeUsageV8` values 10–12 (`ExvsColor5`, `ExvsColor4`, `ExvsColor12`) documented with anchor `sub_14029ACB0` (D3D semantic mapper in `vsac27_Release.exe`) — **not re-verified in IDA**.
- `ssbh_data` remaps usages 10–11 to `TextureCoordinate` on read; may lose Color4/Color5 shader binding.
- `VertexWeightV10` wire format ambiguous: comment says `u16` index; writer/reader use `u32`.
- TAURI uses `MeshWriteProfile::Vs2Canonical` and mesh splitter for u16 index safety.

**Next agent**: Re-run IDA MCP with EXVS2 loaded; confirm HSEM dispatch case and full `sub_14029ACB0` switch; hex-validate v1.10 rigging weights.

### nlst (TSLN / `.nulstb`) — 2026-06-14

**Agent**: nlst format subagent  
**Report**: [`nlst.md`](nlst.md)  
**Binary**: `vsac27_Release.exe.i64` @ `E:\OBHK0.3_v27\`

**ssbh_lib**:

- `Nlst::V10 { file_names: SsbhArray<SsbhString> }` only; no `ssbh_data` wrapper.
- Round-trip hex sample generated via `ssbh_lib_json` (2-entry list, 87 bytes).

**IDA MCP**:

- `TSLN` / `.nulstb` / immediate `0x4E4C5354` / `HBSS` bytes → **0 hits** in main EXE.
- Sibling SSBH handlers confirmed (e.g. `sub_140288EC0` LTAM `0x4D41544C`, `sub_1402980A0` HSEM `0x4D455348`).
- **No `TSLN` FourCC compare** analogous to matl/mesh dispatch → likely no in-process `.nulstb` parser in this build.
- Separate runtime **`FileList` proc chain** (not SSBH):  
  `sub_14075E6B0` → `sub_14075C8C0` → `sub_14075CD30` (`m_FileList` string @ `0x14136ed20`) → `sub_14075CAB0` — JSON/proc driven, not `.nulstb` read.

**TAURI**: unused.

**Follow-up**: search other modules for `0x4E4C5354`; extract real game `.nulstb` from FHM2D pack.

### skel (LEKS / `.nusktb`) — 2026-06-14

**Report**: [`skel.md`](skel.md)

**IDA instance**: `vsac27_Release.exe` @ `127.0.0.1:13337` (initial connection refused; recovered via `select_instance`)

**Key finding**: No `cmp` against immediate `0x534B454C` (`LEKS`) anywhere in `.text` (unlike `LDOM`/`HSEM`/`LTAM`/`BPLH`/`MINA`/`DPRN`). Skeleton parse is reached through **`sub_140298020` → `sub_14029A4B0`**, called from `sub_140114C10`.

**Confirmed parse helpers**:

| Helper | Role |
|--------|------|
| `sub_14029AC70` | Writes `index` / `parent_index` at bone struct +16/+18 |
| `sub_14029ABF0` | Appends `billboard_type` byte |
| `sub_140183380` | Copies 64-byte `Matrix4x4` |
| `sub_1402A6110` | Bone name → pointer (shared with HLBP) |

**Modl integration** (cross-ref modl audit): `sub_140183F70` @ ctx+0x60 resolves skeleton sidecar; `sub_140290370` → `sub_140296600` binds `nu::Skeleton` to mesh objects.

**ssbh_lib**: v1.0 only; five parallel `SsbhArray` (entries + 4 matrix banks). `SkelData` stores local `transform` only; recomputes world/inverses on write.

**Gaps**: `flags.unk1` semantics; no `.nusktb` extension strings in EXE; TAURI DAE import uses simplified hierarchy / no billboard / no `.jnttbl`.

**Follow-up**: Trace HBSS router before `sub_140114C10` for LEKS table dispatch; audit `.jnttbl` hash vs `sub_1402A6110` map.

### matl (LTAM / `.numatb`) — 2026-06-14

**Report:** [`matl.md`](matl.md)

**IDA instance:** `vsac27_Release.exe` @ `127.0.0.1:13337`

**Load chain:**

```text
sub_140114D60 → sub_140288F20 → sub_14028A240
sub_140288EC0 → sub_140289F00 (v1.6) | sub_14028A7C0 (v1.5)
  → sub_14028F3D0 / sub_14028FB60 (param discriminant switch)
  → sub_1400BB330 (ParamId bind) → sub_1400BBB80 / sub_1400BBDF0
```

**Param types vs ssbh_lib `ParamV16`:** cases 0,1,2,4,5,7,11,14,16,17,18 confirmed; case 12 = `String2` (V15 only). Discriminants 9/10/13/15 throw in game.

**Module init:** `sub_1400AAB00` → `sub_1400AF760` registers default techniques (`DiffuseMap`, `BlendState0`, `RasterizerState0`, …).

**Gaps:** `MatlData` write only v1.6; Type4 internal 12 B (`sub_14028EB80`) vs 16 B on disk (`ParamV16Type4`). EXVS2 migration docs: `UseBaseColorMap`, `vstgStandard_VertexColor`.

**Next:** Type4 round-trip test; optional V15 write support for GVS ingest.

### meshex (`.numshexb`) — 2026-06-14

**Report:** [`meshex.md`](meshex.md)

**IDA instance:** `vsac27_Release.exe` @ `127.0.0.1:13337`

**Search results:**

| Query | Hits |
|-------|------|
| `.numshexb` / `numshexb` / `MeshEx` | **0** |
| `HBSS` / `HSEM` / `.numshb` strings | **0** (FourCC dispatch elsewhere) |
| `SHEX*` strings | 27 data hits — binary noise, 0 xrefs |
| `CastShadow` @ `0x141aa9d48` | Shader param table `0x141708548` (not meshex flags) |

**Inferred load chain (no direct meshex parser located):**

```text
.fhm2d → sub_14011E5F0
  → CBinder@FHM2 / ModelDataSet@Exvs2ResourceInstance
  → ModelDataSet::SetupNewFormat(Content@FHM2)
       ├─ NuMesh@ASSET (.numshb)
       └─ (inferred) meshex blob — no NuMeshEx RTTI
```

**Bounding sphere (misleading hits):**

- `sub_140C5B490` — Havok `SphereFinder::SimplexBoundingSphere` (collision), **not** meshex.
- `boundingSphere` / `radiusOfComCenteredBoundingSphere` — Havok hkMeshSection metadata tables only.

**ssbh_lib gaps:** ssbh_data recomputes bounds; `EntryFlag` bits 3–5 dropped; `MeshEntry.unk1` / `MeshEx.unk1` not preserved on export.

**Next:** Decompile `ModelDataSet::SetupNewFormat`; scan for 64-byte header + absolute `Ptr64` heap; trace flags from `StageModelDataSet`.

### SUMMARY (2026-06-14)

- **Deliverable**: [`SUMMARY.md`](SUMMARY.md) — 12/12 format reports, aggregated P0–L5 gaps, top 9 fix priorities.
- **This run (sequential coordinator)**: completed [`adj.md`](adj.md); verified all queue reports present; wrote SUMMARY.
- **Top P0**: nrpd v1.2 reader + write bug; mesh weight wire + EXVS color semantics.

### shdr (RDHS / `.nushdb` v1.2) — 2026-06-14

**Report:** [`shdr.md`](shdr.md)

**IDA instance:** `vsac27_Release.exe` @ `127.0.0.1:13337` (initial `ERR_CONNECTION_REFUSED`, recovered on retry)

**Search results:**

| Query | Hits |
|-------|------|
| `.nushdb` / `nushdb` / `RDHS` / `HBSS` / `Shdr` | **0** |
| Byte `52 44 48 53` / `48 42 53 53` | **0** |
| Immediate `0x53484452` (RDHS) | **0** |
| Sibling FourCC | `LTAM` @ `sub_140288EC0`, `XFUN` @ `sub_140289E20`, `LDOM` @ `sub_140298210` |

**ssbh_lib / shdr_data:**

- `Shdr::V12 { shaders: SsbhArray<Shader> }`; `ShaderStage` 0/3/4/5.
- Inner `ShaderBinary`: `UnkHeader` @ +288, `code_length` @ +2504, `constant_buffer` @ +2848+offset, `program_code` @ +2896.
- No `ShdrData` → `Shdr` encoder; bytes before +288 and ~+0x18C–+0x9C7 unparsed.

**Related runtime (shader labels, not RDHS parse):**

```text
sub_14011C7D0 — registers vsngCharaBasic, FeRendererMovable*, FeStandard*
sub_1402EDCF0 → sub_140114D60 (SSBH ingest) → sub_140288EC0 (LTAM)
```

**Conclusion:** No RDHS loader located in main EXE; follow FHM2D `fileType 0x0A` path or external SSBHLib decompile.

**Next:** Trace archive unpack for `.nushdb`; verify fixed offsets against real stage asset.

### adj (.adjb) — 2026-06-14

**Report:** [`adj.md`](adj.md)

**IDA instance:** `vsac27_Release.exe` @ `127.0.0.1:13337` (initial `ERR_CONNECTION_REFUSED`, recovered on retry)

**Search results:**

| Query | Hits |
|-------|------|
| `.adjb` / `adjb` / `ADJB` / `model.adjb` | **0** |
| `AdjData` / `CAdj` / `VertexAdj` / `MeshAdj` | **0** |
| `numshexb` / `meshex` | **0** (same class of non-SSBH sibling) |
| FHM2D type-id for `.adjb` | **None** (gap between `0x0F` numdlb and `0x11` nuanmb) |

**Nearest mesh chain (HSEM, not adj):**

```text
sub_1402EDCF0 / sub_1402EE420
  → sub_1401152E0
    → sub_1402980A0   ; HSEM 0x4D455348, versions 7–10
      → sub_14029B410   ; mesh v7 parser (among others)
```

**ssbh_lib:** `Adj` + `AdjData` complete; `MAX_ADJACENT_VERTICES=18`; `triangle_adjacency` with seam merge. No sample `.adjb` in repo.

**Conclusion:** EXVS2 main EXE shows no `.adjb` load path; adj format is tool-chain / Smash-oriented in ssbh_lib only for this audit.

**Next:** SU golden `model.adjb` byte diff; optional scan for runtime normal recompute from `numshb` indices.
