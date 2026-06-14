# MATL / LTAM / `.numatb` — ssbh_lib vs EXVS2 IDA Audit

**Date:** 2026-06-14  
**IDA binary:** `vsac27_Release.exe` (`E:\OBHK0.3_v27\vsac27_Release.exe.i64`)  
**ssbh_lib sources:** `E:/research/ssbh_lib/ssbh_lib/src/formats/matl.rs`, `E:/research/ssbh_lib/ssbh_data/src/matl_data.rs`  
**Related TAURI docs:** `docs/exvs-stage-numatb-simple-color.md`, `docs/gvs-numatb-step2-migration-changes.md`

---

## 1. Format identity

| Field | Value |
|-------|-------|
| SSBH inner FourCC | `LTAM` (LE `0x4D41544C` / decimal `1296127052`) |
| Typical extension | `.numatb` (`__nust__.numatb`, `__maya__.numatb`) |
| Rust container | `Matl` enum (`V15` / `V16`) |
| High-level API | `MatlData` / `MatlEntryData` in `ssbh_data` |
| HBSS wrapper | Yes (all SSBH types) |

**Versions supported in ssbh_lib**

| major | minor | Rust variant | Notes |
|-------|-------|--------------|-------|
| 1 | 5 | `Matl::V15` | GVS / legacy; `ParamV15::String2` (type 12) |
| 1 | 6 | `Matl::V16` | EXVS2 target; no `String2`; `ParamV16Type4` = 16 raw bytes |

---

## 2. On-disk layout (ssbh_lib)

### 2.1 Top-level `Matl`

```
Matl V15/V16
  entries: SsbhArray<MatlEntryV15|V16>
```

### 2.2 `MatlEntry` (per material)

| Field | Type | Notes |
|-------|------|-------|
| `material_label` | `SsbhString` | Unique material name |
| `attributes` | `SsbhArray<AttributeV15\|V16>` | Flat param list |
| `shader_label` | `SsbhString` | EXVS2: e.g. `vstgStandard_VertexColor`, `vsngCharaBasic` |

### 2.3 `Attribute` (per param)

| Field | Type | Notes |
|-------|------|-------|
| `param_id` | `ParamId` (u64) | Semantic slot (e.g. `BaseColorMap` = 361) |
| `param` | `SsbhEnum64<ParamV15\|V16>` | Tagged union: u64 discriminant + relative payload |

### 2.4 `ParamV16` discriminant → payload (ssbh_lib)

| Discriminant | Variant | Payload size (typical) |
|-------------|---------|------------------------|
| 0 | `Float` | 4 |
| 1 | `Float1` | 4 |
| 2 | `Boolean` | 4 (u32, non-zero = true) |
| 4 | `Type4` | **16 bytes** (`ParamV16Type4`) |
| 5 | `Vector4` | 16 |
| 7 | `Unk7` (Color4f) | 16 |
| 11 | `String` | `SsbhString` (texture stem) |
| 14 | `Sampler` | `Sampler` struct |
| 16 | `UvTransform` | 20 bytes (5× f32) |
| 17 | `BlendState` | `BlendStateV16` (+ 8 pad) |
| 18 | `RasterizerState` | `RasterizerStateV16` (+ 4 pad) |

**V15-only:** discriminant **12** = `String2` (`SsbhString`).

**V15 Type4** (`ParamV15Type4`): ambiguous 12-byte region — `Matrix4x4`, `Reserved[12]`, or legacy `InlineString` in JSON only.

### 2.5 `MatlEntryData` grouping (ssbh_data JSON shape)

`matl_data.rs` splits the flat `attributes` array into typed buckets for JSON/tooling:

- `textures` ← `String` (type 11)
- `textures2` ← `String2` (type 12, V15 only)
- `booleans`, `floats`, `float1s`, `vectors`, `colors`
- `samplers`, `blend_states`, `rasterizer_states`, `uv_transforms`
- `type4_v16` / `type4_v15`

**Write path gap:** `TryFrom<&MatlData> for Matl` only emits **V16**; V15 round-trip write is unsupported (`UnsupportedVersion` for non-(1,6)).

---

## 3. EXVS2-relevant `ParamId` values

Full enum in `matl.rs` (365+ ids). High-signal EXVS2 / stage migration ids:

| ParamId | u64 | Role |
|---------|-----|------|
| `DiffuseMap` | 30 | GVS / `__maya__` color texture |
| `BaseColorMap` | 361 | EXVS2 `__nust__` color texture |
| `BaseColorMapLayer1` | 362 | Layered base color |
| `UseDiffuseMap` | 47 | GVS enable flag |
| `UseBaseColorMap` | 359 | **Required** on EXVS2 when only color map present |
| `DiffuseSampler` | 64 | Primary sampler |
| `BlendState0` | 280 | Alpha blend |
| `RasterizerState0` | 291 | Cull / fill |
| `Fresnel` | 8 | Often stored as Type4 in EXVS2 files |
| `Texture0`–`Texture19` | 92–310 | Shader-specific slots |
| `CustomBoolean*` / `CustomVector*` / `CustomFloat*` | 152+ | Shader uniforms |

Stage color-only recipe (see `exvs-stage-numatb-simple-color.md`):

- `shader_label` → `vstgStandard_VertexColor`
- Keep `BaseColorMap` + `UseBaseColorMap: true` + `DiffuseSampler`
- Strip PBR rows (`MetallicMap`, `RoughnessMap`, `NormalMap`, …)

---

## 4. IDA — SSBH load / version dispatch chain

### 4.1 Primary LTAM router

```
sub_140114D60          ; SSBH asset loader (calls FourCC dispatch)
  └─ sub_140288F20     ; LTAM header check @ a2+16
       FourCC == 0x4D41544C ('LTAM')
       major == 1 @ +20
       minor == 5 or 6 @ +22
       └─ sub_14028A240(a1, a2+24)   ; parse entries array / build runtime materials
```

Parallel direct router (vtable / type registry):

```
sub_140288EC0
  cmp [r8+10h], 'LTAM' (4C 54 41 4D)
  cmp word [r8+14h], 1        ; major
  movzx eax, word [r8+16h]    ; minor
  cmp ax, 6 → sub_140289F00   ; Matl V1.6 entry parser
  cmp ax, 5 → sub_14028A7C0   ; Matl V1.5 entry parser
```

### 4.2 Entry parsers (V16 vs V15)

Both parsers share the same structure; differ only in attribute-value delegate:

| Version | Function | Attribute delegate |
|---------|----------|-------------------|
| 1.6 | `sub_140289F00` | `sub_14028EAD0` → `sub_14028F3A0` → **`sub_14028F3D0`** |
| 1.5 | `sub_14028A7C0` | `sub_14028FA70` → `sub_14028FB30` → **`sub_14028FB60`** |

Common callees in entry loop:

| Function | Role |
|----------|------|
| `sub_1400BA620` | Construct `nu::Material` (336-byte object) |
| `sub_1400B4D50` | `InstancePointer<nu::Material>` |
| `sub_1400BB330` | Lookup / insert param by **`param_id`** into material bind table |
| `sub_1400BB970` | Apply typed value to material param slot |
| `sub_14028A620` | RelPtr / SsbhString resolve helper |
| `sub_14028A6F0` | Test empty `SsbhString` |
| `sub_1402890C0` | Post-process material + shader label hash map |

**Entry iteration layout (inferred from decompile):**

- Outer: `SsbhArray` stride **32 bytes** per material entry (label + attributes ptr + shader label).
- Inner attributes: stride **24 bytes** per attribute (`param_id` + `SsbhEnum64` header).

### 4.3 On-disk param type dispatch (`sub_14028F3D0` / `sub_14028FB60`)

Switch on `a1[1]` (= `SsbhEnum64` discriminant). Maps 1:1 to ssbh_lib `ParamV16` for supported types:

| Case | Handler | ssbh_lib `ParamV16` |
|------|---------|---------------------|
| 0 | `sub_14028F7E0` | `Float` |
| 1 | `sub_14028F800` | `Float1` |
| 2 | `sub_14028F820` | `Boolean` |
| 3 | `sub_14028F840` | *(no ssbh_lib variant — game-only?)* |
| 4 | `sub_14028F860` → `sub_14028EB80` | `Type4` |
| 5 | `sub_14028F880` | `Vector4` |
| 6 | `sub_14028F8A0` | *(game-only)* |
| 7 | `sub_14028F8C0` | `Unk7` / Color4f |
| 8 | `sub_14028F8E0` | *(game-only — matrix?)* |
| 9,10,13,15 | `sub_14028F900` | **Throws** — unsupported on disk |
| 11 | `sub_14028F920` → `sub_14028EC70` | `String` |
| 12 | `sub_14028FF70` (**V15 only**) | `String2` |
| 14 | `sub_14028F950` | `Sampler` |
| 16 | `sub_14028F980` | `UvTransform` |
| 17 | `sub_14028F9B0` → `sub_14028F0F0` | `BlendState` |
| 18 | `sub_14028F9E0` → `sub_14028F1B0` | `RasterizerState` |
| default | `sub_14028FA40` + `_CxxThrowException` | Unknown discriminant = hard fail |

**V16 path has no case 12** — matches ssbh_lib removal of `String2` in V16.

### 4.4 Runtime param storage dispatch (`sub_1400BBB80` / `sub_1400BBDF0`)

After parse, material params are stored using an **internal type index** (0–19), not the on-disk discriminant directly:

| Internal index | Read (`BBB80`) | Write (`BBDF0`) | Likely meaning |
|----------------|----------------|-----------------|----------------|
| 0,1,18 | `DWORD` | `DWORD` @ +8 | float / int / enum |
| 2 | `BYTE` | `BYTE` | boolean |
| 3 | `QWORD` | `QWORD` | 8-byte |
| 4 | `QWORD` + `DWORD` (12 B) | same | **Type4 / reserved** |
| 5,6,7,10 | `OWORD` (16 B) | `OWORD` | Vector4 / Color |
| 8 | 4× `OWORD` (64 B) | same | Matrix4x4 |
| 9 | `sub_1400BCA00` | `sub_1400BA0F0` | Complex blob |
| 11,13 | string handle | `sub_1400BCB00` | `String` |
| 12 | `sub_1400BC8A0` | `sub_1400BCB80` | **String2 (V15)** |
| 14 | sampler ref (+160) | `sub_1400BCCB0` | `Sampler` |
| 15 | 52 bytes | OWORD×3 + DWORD | Blend-related |
| 16,17 | object ref | `sub_1400BCD30` / `BCDb0` | UvTransform / states |

`sub_1400BB330` keys lookups by **`*(int*)(descriptor+8)`** = `ParamId` u64 (validated `< 0x16E` = 366).

### 4.5 Type4 internal write (`sub_14028EB80`)

```c
*(_DWORD *)slot = 4;           // internal type tag
*(_QWORD *)(slot+8)  = src[0]; // 8 bytes
*(_DWORD *)(slot+16) = src[8]; // 4 bytes  → 12 bytes total
```

**Gap note:** ssbh_lib `ParamV16Type4` is **16 bytes on disk**; game's internal Type4 slot is **12 bytes**. The loader likely truncates or only uses the first 12 bytes of the on-disk 16-byte payload — needs binary round-trip test with a real EXVS2 `Fresnel` Type4 attribute.

### 4.6 Material module / default technique registration

```
sub_1400AA910   ; nu::MaterialModule ctor
sub_1400AAB00   ; MaterialModuleDesc init
  ├─ sub_1400B3E70
  ├─ sub_1400AAE30
  └─ sub_1400AF760   ; Register built-in techniques + param name bindings
       strings: SystemLambert, DiffuseMap, DiffuseSampler, BlendState0,
                RasterizerState0, Layer0UVTransform, ...
       callees: sub_1400B1540 (MaterialEffect), sub_1400B1A80 (MaterialTechnique handle)
```

`sub_1400AF760` is the large (~7.6 KB) function that wires default shader technique metadata to `ParamId` string names (`0x141aa9500` region).

### 4.7 Param name string pool (`.rdata`)

Static descriptors at `~0x141708000` point to names at `~0x141aa9000`:

| Address | String | ssbh `ParamId` |
|---------|--------|----------------|
| `0x141aa9500` | `DiffuseMap` | 30 |
| `0x141aa9528` | `RasterizerState0` | 291 |
| `0x141aa9558` | `BlendState0` | 280 |
| `0x141aa9750` | `Fresnel` | 8 |
| `0x141aaaf00` | `BaseColorMapLayer1` | 362 |
| `0x141aaaf68` | `UseBaseColorMap` | 359 |

Xrefs from `sub_1400AF760` confirm these are default technique bindings, not dynamic file content.

### 4.8 Other SSBH FourCC neighbors (same loader family)

| FourCC | String addr | Loader stub |
|--------|-------------|-------------|
| `HSEM` | `0x1402980d1` | `sub_1402980A0` (mesh) |
| `LDOM` | `0x140298226` | modl family |
| `BPLH` | `0x1402982d2` | hlpb family |

`LTAM` does not appear as a standalone `.rdata` string with xrefs (only embedded in code / RTTI blobs `LTAMcbPerView` @ `0x14181913c`).

---

## 5. ssbh_lib ↔ game parity matrix

| Topic | ssbh_lib | EXVS2 (IDA) | Severity |
|-------|----------|-------------|----------|
| LTAM FourCC + v1.5/v1.6 | Supported | `sub_140288EC0` / `sub_140288F20` | OK |
| Param discriminants 0,1,2,4,5,7,11,14,16,17,18 | Supported | `sub_14028F3D0` switch | OK |
| V15 `String2` (12) | Supported | V15 only via `sub_14028FF70` | OK |
| V16 write from `MatlData` | V16 only | Game reads V16 | OK for EXVS2 pipeline |
| V15 write from `MatlData` | **Not implemented** | Game still reads V15 | Medium (GVS ingest) |
| `ParamV16Type4` 16-byte disk | 16 bytes | Internal store 12 bytes (`sub_14028EB80`) | **Medium** — verify Fresnel round-trip |
| `ParamV15Type4` matrix vs reserved | Heuristic read | 12-byte internal | Low |
| Unknown discriminant | `BinRead` error | `_CxxThrowException` | OK (both strict) |
| `ParamId` enum order | Smash-optimized sort | Hash on u64 id (`sub_1400BB330`) | OK (ids match) |
| `UseBaseColorMap` migration | Tooling docs | String present in binary | OK |
| Stage shader selection | App-level | `vsngCharaBasic` strings @ `0x141340cc0` | App concern, not parser |

---

## 6. GVS → EXVS2 migration (tooling context)

From `gvs-numatb-step2-migration-changes.md` (implemented in `GvsMapToVs2Tool.tsx`):

1. `minor_version` → **6**
2. `DiffuseMap` → `BaseColorMap` (except `_sky` skydome)
3. `UseDiffuseMap` → `UseBaseColorMap`; add `UseBaseColorMap: true` when missing
4. Shader renames: `FeRendererMovableVertexColor` → `vstgStandard_VertexColor`, etc.

**In-game symptoms when mismatch:**

- Green tint: missing `UseBaseColorMap`
- White blowout: wrong shader (`vsngCharaBasic`) or leftover PBR texture rows

---

## 7. Recommended follow-ups

1. **Round-trip test:** EXVS2 `__nust__.numatb` with `Fresnel` Type4 (16 bytes) → ssbh_lib read → write → reload in game.
2. **V15 write support:** Extend `TryFrom<MatlData> for Matl` for `(1,5)` if GVS ingest must preserve `String2`.
3. **Map internal type index 0–19** to on-disk discriminants in a shared table (for future `numatb_format` Rust module in TAURI).
4. **IDA rename pass:** `sub_140288EC0` → `ssbh_matl_dispatch_version`, `sub_140289F00` / `sub_14028A7C0` → `ssbh_matl_parse_v16` / `_v15`, `sub_14028F3D0` → `ssbh_matl_parse_param_v16`.

---

## 8. Quick reference — call graph (condensed)

```
sub_140114D60
  sub_140288F20 ──► sub_14028A240 (entries)
sub_140288EC0
  ├─► sub_140289F00 (v1.6)
  │     sub_1400BA620 (Material)
  │     sub_1400BB330 (param_id bind)
  │     sub_14028EAD0 → sub_14028F3D0 (param type switch)
  │           ├─ 4 → sub_14028EB80 (12B type4)
  │           ├─ 11 → sub_14028EC70 (string)
  │           ├─ 17 → sub_14028F0F0 (blend)
  │           └─ 18 → sub_14028F1B0 (rasterizer)
  └─► sub_14028A7C0 (v1.5) — same, via sub_14028FB60 (+ case 12 String2)

sub_1400AAB00 (module init)
  └─► sub_1400AF760 (default techniques / param names)
```

---

## 9. Audit status

| Item | Status |
|------|--------|
| ssbh_lib layout documented | Done |
| IDA load chain | Done |
| Param type switch vs `ParamV16` | Done |
| Param name / `ParamId` cross-ref | Partial (static pool only) |
| Full `ParamId` 0–365 table vs game | Not done (ids match ssbh_lib enum) |
| HBSS outer parser | Out of scope (shared SSBH layer) |
