# MeshEx (`.numshexb`) — Format & IDA Audit

**Session:** ssbh-lib-ida-audit  
**Date:** 2026-06-14  
**ssbh_lib module:** `E:/research/ssbh_lib/ssbh_lib/src/formats/meshex.rs`  
**High-level data:** `E:/research/ssbh_lib/ssbh_data/src/meshex_data.rs`  
**IDA binary:** `vsac27_Release.exe` (`E:\OBHK0.3_v27\vsac27_Release.exe.i64`)

---

## 1. Summary

| Item | Value |
|------|-------|
| Extension | `.numshexb` |
| Container | **None** — not HBSS/SSBH; raw binary like `.adjb` |
| FourCC | **None** |
| Rust type | `ssbh_lib::formats::meshex::MeshEx` |
| ssbh_data type | `ssbh_data::meshex_data::MeshExData` |
| Purpose | Per–mesh-object bounding spheres, name tags, and 16-bit render flags |
| Companion files | Loaded alongside `.numshb` / model pack; one `.numshexb` per model root |

MeshEx is **metadata-only**: no vertex/index buffers. It groups `MeshObject` entries (by stripped name), stores combined bounding spheres per group, and holds one `EntryFlag` per mesh object subindex.

---

## 2. ssbh_lib layout

All multi-byte integers are **little-endian**. `Ptr64<T>` is an **absolute u64 offset** from file start (`SeekFrom::Start`); `0` = null.

### 2.1 File header (`MeshEx`) — 64 bytes (0x40)

| Offset | Size | Field | Notes |
|--------|------|-------|-------|
| 0x00 | 8 | `file_length` | Total file size; rewritten on save |
| 0x08 | 4 | `entry_count` | Must equal `entry_flags` element count |
| 0x0C | 4 | `mesh_object_group_count` | Length of `mesh_object_groups` vec |
| 0x10 | 8 | `all_data` | → `AllData` |
| 0x18 | 8 | `mesh_object_groups` | → `Vec<MeshObjectGroup>` |
| 0x20 | 8 | `entries` | → `Vec<MeshEntry>` |
| 0x28 | 8 | `entry_flags` | → `EntryFlags` (count = `entry_count`) |
| 0x30 | 4 | `unk1` | Preserved on read; ssbh_data writes `0` |
| 0x34 | 12 | *(padding)* | Header padded to 16-byte boundary |

File tail is also padded to **16-byte alignment** on write.

### 2.2 `AllData` (16-byte aligned heap struct)

| Field | Type | Size |
|-------|------|------|
| `bounding_sphere` | `BoundingSphere` | 16 |
| `name` | `Ptr64<CString<16>>` | 8 |

`BoundingSphere`: `Vector3 center` (12) + `f32 radius` (4).

Default export name from ssbh_data: `"All"` (combined sphere over all groups).

### 2.3 `MeshObjectGroup` (16-byte aligned)

| Field | Type | Notes |
|-------|------|-------|
| `bounding_sphere` | `BoundingSphere` | Union of all objects sharing `mesh_object_name` |
| `mesh_object_full_name` | `Ptr64<CString<4>>` | Maya-style full name, e.g. `Mario_FaceN_VIS_O_OBJShape` |
| `mesh_object_name` | `Ptr64<CString<4>>` | Stripped name, e.g. `Mario_FaceN` |

Name stripping (ssbh_data `strip_mesh_name_tags`): truncate at first `_VIS` or `_O_`; else strip trailing `Shape`.

### 2.4 `MeshEntry` (16-byte aligned, 16 bytes)

| Field | Type | Notes |
|-------|------|-------|
| `mesh_object_group_index` | `u32` | Index into `mesh_object_groups` |
| `unk1` | `Vector3` | Observed `(0, 1, 0)` in tests; ssbh_data always writes this |

**Parallel arrays:** `entries[i]` pairs with `entry_flags.0[i]`. Multiple entries may share the same `mesh_object_group_index` (one per `MeshObject` subindex with the same name).

### 2.5 `EntryFlag` — 16-bit bitfield

| Bit | Name | ssbh_data maps? | Known behavior (comments in ssbh_lib) |
|-----|------|-----------------|----------------------------------------|
| 0 | `draw_model` | Yes | Primary visibility toggle |
| 1 | `cast_shadow` | Yes | Shadow casting |
| 2 | *(reserved)* | — | — |
| 3 | `unk3` | No | Disables stage reflection (Fountain of Dreams water) |
| 4 | `unk4` | No | Draw only in water reflection |
| 5 | `unk5` | No | Used for `light_neck_*` shapes (Jack/doyle c00) |
| 6–15 | *(reserved)* | — | — |

ssbh_data `EntryFlags` only round-trips bits 0–1; bits 3–5 are **lost** on edit/save.

---

## 3. ssbh_data behavior & gaps

### 3.1 `MeshExData`

- Groups by `MeshObjectData.name`.
- Recomputes bounding spheres via `geometry_tools::bounding` (centroid + max distance — **often over-estimates** vs game).
- Default flags: `draw_model: true`, `cast_shadow: true`.
- **Not binary-identical** after save (documented in `meshex_data.rs`).

### 3.2 ssbh_lib vs game — severity

| Gap | Severity | Detail |
|-----|----------|--------|
| Bounding sphere algorithm | **High** | Recalculated spheres differ from retail `.numshexb` |
| `EntryFlag` bits 3–5 | **Medium** | Stage reflection / special draw modes stripped |
| `MeshEntry.unk1` | **Low** | Hard-coded `(0,1,0)` on export |
| `MeshEx.unk1` | **Low** | Always written as `0` |
| Empty `CString` handling | **Low** | Open question in ssbh_lib comments |

### 3.3 Round-trip

`ssbh_test` checks 1:1 read/write for `.numshexb` at the **lib** layer (`MeshEx::read` → `write`). ssbh_data round-trip is **not** bit-exact due to recomputation.

---

## 4. Relationship to `.numshb`

```
.numdlb ──► references model.numshb, model.nusktb, model.numatb, …
.numshb ──► MeshObject[] (geometry, per-object subindex)
.numshexb ► MeshEx (parallel entry per MeshObject: group index + flags + group bounds)
```

- `mesh_object_group_index` links each `MeshEntry` to a name group in both meshex and mesh.
- Group bounding sphere ⊇ all subindices sharing that stripped name.
- `all_data.bounding_sphere` ⊇ all group spheres.

---

## 5. IDA Pro audit (`vsac27_Release.exe`)

### 5.1 Search strategy executed

1. String search: `.numshexb`, `numshexb`, `MeshEx`, `meshex`, `numshex`
2. Regex: `shexb`, `numshb`, `HBSS`, `HSEM`, SSBH FourCC bytes
3. Struct search: `MeshEx`, `BoundingSphere`, `NuMesh`, `SHEX`
4. RTTI / asset pipeline: `ASSET@DEV@VDK`, `Exvs2ResourceInstance`, `FHM2`
5. Rendering: `CastShadow`, `CDrawModel*`, `boundingSphere`, Havok `SphereFinder`

### 5.2 Key finding: no extension string in binary

**Zero matches** for `.numshexb`, `numshexb`, or `MeshEx` as readable strings.  
Likewise no xrefs for `.numshb`, `.adjb`, `HBSS`, or `HSEM` as loader literals.

Retail loads model assets through **FHM2 pack binding**, not path suffix tables in the executable.

### 5.3 Asset pipeline (indirect meshex load path)

| Symbol / RTTI | Address | Role |
|---------------|---------|------|
| `.fhm2d` | `0x14181890c` | Pack extension string |
| `sub_14011E5F0` | xref → `.fhm2d` | FHM2 open/bind path (version string `1.2.8`) |
| `ModelDataSet@ASSET@DEV@VDK` | `0x1420f5b00` | Core model asset aggregator |
| `ModelDataSet::SetupNewFormat` | RTTI in `0x1420f5cb0` | Parses FHM2 `Content` → asset interfaces |
| `ModelDataSet::SetupOldFormat` | RTTI in `0x1420f5b80` | Legacy FHM2 layout |
| `ModelDataSet@Exvs2ResourceInstance` | `0x14206afb8` | EXVS2 resource wrapper |
| `StageModelDataSet@Exvs2ResourceInstance` | `0x14206aff8` | Stage variant |
| `NuMesh@ASSET@DEV@VDK` | `0x1420e2908` | Mesh asset facet (geometry) |
| `CModelDataSetHolder@GAM@VDK` | `0x142018d40` | Runtime holder |

**Inferred chain (not fully decompiled):**

```
.fhm2d pack
  → CBinder@FHM2 / CFhm2BinderImpl
  → ResourceInstanceInterface factory (0x142023550 sig)
  → ModelDataSet@Exvs2ResourceInstance
  → ModelDataSet::SetupNewFormat(Content@FHM2, asset map)
       ├─ NuMesh@ASSET          (.numshb geometry)
       ├─ NuSkeleton / NuMaterial / …
       └─ (likely) meshex blob bound by hash — no separate NuMeshEx RTTI found
```

There is **no** `NuMeshEx` or `MeshEx@ASSET` typeinfo; meshex is probably parsed inside `NuMesh` or `ModelDataSet::SetupNewFormat` without a public C++ type name matching ssbh_lib.

### 5.4 Bounding sphere — what IDA *did* find

| String | Address | Xref function | Subsystem |
|--------|---------|---------------|-----------|
| `SphereFinder::SimplexBoundingSphere::Expand…` | `0x1415af980` | `sub_140C5B490` | **Havok** convex hull / physics |
| `boundingSphere` | `0x1415826a8` | Data table only (`0x141581238`) | Havok hkMeshSection metadata |
| `radiusOfComCenteredBoundingSphere` | `0x14154da98` | Data table only (`0x141532e40`) | Havok property name |
| `CastShadow` | `0x141aa9d48` | Shader param table `0x141708548` | **Material/shader** slot name |

**Not meshex-specific:**

- `sub_140C5B490` / `sub_140C5BC70` — Havok `SphereFinder` simplex expand (collision mesh), **not** `.numshexb` parser.
- `CastShadow` at `0x141708548` sits beside `ShadowMap0`…`ReceiveShadow` in a **shader uniform name table** — homonym with `EntryFlag.cast_shadow`, different subsystem.

### 5.5 Rendering draw path (flags consumer — unlinked)

| RTTI | Address |
|------|---------|
| `CDrawModel@ENG@VDK` | `0x1420f5ec8` |
| `CDrawModelRigid@ENG@VDK` | `0x1420f6098` |
| `CDrawModelSkinned@ENG@VDK` | `0x1420f5e98` |
| `StageModelDataSet@Exvs2ResourceInstance` | `0x14206aff8` |

No code xrefs recovered to these typeinfo blobs (typical for MSVC RTTI). Actual `draw_model` / meshex flag tests were **not** located in this pass.

### 5.6 False positives

- `SHEX*` strings (`0x1416ff640`…): binary noise, **not** format magics; zero xrefs.
- `HSEM` immediate search: too many unrelated matches; no clean loader string.

---

## 6. Recommended next IDA steps

1. **Decompile `ModelDataSet::SetupNewFormat`** — locate via PDB if available, or scan large functions referencing `Content@FHM2` vtables and u64+ u32+ u32 header reads (64-byte meshex header signature).
2. **Trace `NuMesh@ASSET` vtable** — follow virtual methods after FHM2 bind; look for 16-bit flag arrays parallel to mesh object count.
3. **Breakpoint on stage model load** — compare in-memory struct after loading a known `.numshexb` vs ssbh_lib parse (header + pointer heap).
4. **Cross-ref `StageModelDataSet`** — stage `.numshexb` uses reflection flags (`unk3`/`unk4`); stage loader may expose flag tests more clearly than fighter models.
5. **Do not chase Havok `sub_140C5B490`** for meshex parity — different bounding algorithm and data source (collision vs render culling).

---

## 7. ssbh_lib implementation notes

- **Read:** `#[binread]` on `MeshEx`; temp fields hide header counts used only for `#[br(count)]`.
- **Write:** Custom `SsbhWrite` — validates `entries.len() == entry_flags.0.len()`, patches `file_length` after 16-byte tail pad.
- **Pointers:** `Ptr64` (absolute), not `RelPtr64` (SSBH-relative). Meshex uses the Adj-style **absolute heap** model.
- **Fuzz targets:** `ssbh_lib/fuzz/fuzz_targets/meshex.rs`, `ssbh_data/fuzz/*meshex*`.

---

## 8. Verdict

| Layer | Status |
|-------|--------|
| ssbh_lib struct layout | **Trusted** — consistent, tested read/write |
| ssbh_data editing | **Partial** — flags + bounds not retail-accurate |
| IDA meshex parser | **Not found** — loads via FHM2 / ModelDataSet; no extension string |
| IDA bounding sphere loader for meshex | **Not found** — only Havok collision spheres located |
| IDA entry-flag consumer | **Not found** — shader `CastShadow` is unrelated homonym |

**Priority for ssbh_lib:** preserve `EntryFlag` bits 3–5 and retail bounding spheres if EXVS2 stage/fighter tooling requires binary parity.
