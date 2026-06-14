# HLBP / BPLH / `.nuhlpb` v1.1 — IDA Audit

**Date:** 2026-06-14  
**IDA binary:** `vsac27_Release.exe` (EXVS2 OB, `E:\OBHK0.3_v27\vsac27_Release.exe.i64`)  
**ssbh_lib module:** `E:/research/ssbh_lib/ssbh_lib/src/formats/hlpb.rs`  
**High-level data:** `ssbh_data/src/hlpb_data.rs`  
**TAURI runtime:** `src-tauri/src/ssbh_motion.rs`, `src-tauri/src/ssbh_dae_cmd.rs`

---

## Summary

| Item | Verdict |
|------|---------|
| FourCC `BPLH` / version 1.1 dispatch | **Confirmed** in IDA (`sub_1402982C0`) |
| Top-level `Hlpb::V11` array layout | **Confirmed** (4× `SsbhArray` headers) |
| `AimConstraint` record size (144 B) | **Confirmed** (`144LL` stride in parser) |
| `OrientConstraint` record size (112 B) | **Confirmed** (`112LL` stride in parser) |
| `ConstraintType` enum (0=Aim, 1=Orient) | **Confirmed** in parser + node ctor |
| `constraint_indices` / `constraint_types` interleave | **Partial** — game walks types; ssbh_data drops order on round-trip |
| Duplicate `*_name1`/`*_name2` fields | **Gap** — game resolves bones via lookup helper; TAURI preview uses `*_name1` only |
| `quat1`/`quat2` semantics | **Gap** — stored + passed to runtime node; ignored by TAURI `apply_*` |
| `unk_type` (0/1/2) | **Gap** — stored at node+20; not used by TAURI preview |
| `range_min`/`range_max` defaults | **Mismatch risk** — game node ctor seeds ±π rad; ssbh comments say ±180° |
| `.nuhlpb` extension string in binary | **Not found** (loader uses FourCC, not path suffix) |

**Overall:** Binary layout in ssbh_lib matches EXVS2 v1.1 parser struct sizes and constraint-type values. Largest practical gaps are **metadata loss in `HlpbData`**, **incomplete runtime semantics** (quats, `unk_type`, duplicate name slots), and **preview parity** vs in-game helper-bone solver.

---

## ssbh_lib layout (authoritative for disk format)

### Container

```
HBSS (0x10-aligned)
  └─ BPLH (0x484C5042 LE u32)
       ├─ major_version: u16  (=1)
       ├─ minor_version: u16  (=1)
       └─ Hlpb::V11 payload
```

### `Hlpb::V11` (after version words)

| Offset | Field | Type |
|--------|-------|------|
| +0 | `aim_constraints` | `SsbhArray<AimConstraint>` |
| +16 | `orient_constraints` | `SsbhArray<OrientConstraint>` |
| +32 | `constraint_indices` | `SsbhArray<u32>` |
| +48 | `constraint_types` | `SsbhArray<ConstraintType>` |

`SsbhArray` header: `u64 rel_offset`, `u64 count` (standard ssbh_lib).

### `AimConstraint` — 144 bytes (fixed stride)

| Off | Size | Rust field | Notes |
|-----|------|------------|-------|
| 0 | 8 | `name` | `SsbhString` |
| 8 | 8 | `aim_bone_name1` | |
| 16 | 8 | `aim_bone_name2` | |
| 24 | 8 | `aim_type1` | usually `"DEFAULT"` |
| 32 | 8 | `aim_type2` | usually `"DEFAULT"` |
| 40 | 8 | `target_bone_name1` | TAURI preview uses this as constrained bone |
| 48 | 8 | `target_bone_name2` | IDA aim-parse path resolves bone name from **+48** |
| 56 | 4 | `unk1` | observed 0 |
| 60 | 4 | `unk2` | observed 1 |
| 64 | 12 | `aim` | `Vector3` local aim axis |
| 76 | 12 | `up` | `Vector3` |
| 88 | 16 | `quat1` | `Vector4` |
| 104 | 16 | `quat2` | `Vector4` |
| 120 | 24 | `unk17`…`unk22` | six `f32`, usually 0; **stripped** on `HlpbData` → `Hlpb` write |

### `OrientConstraint` — 112 bytes (fixed stride)

| Off | Size | Rust field | IDA usage (v1.1 parser) |
|-----|------|------------|---------------------------|
| 0 | 8 | `name` | node name string |
| 8 | 8 | `parent_bone_name1` | bone lookup via `sub_1402A6110` |
| 16 | 8 | `parent_bone_name2` | second parent slot |
| 24 | 8 | `source_bone_name` | bone lookup |
| 32 | 8 | `target_bone_name` | bone lookup (+32 string in orient loop) |
| 40 | 4 | `unk_type` | copied to runtime node `+20` |
| 44 | 12 | `constraint_axes` | `f32` XYZ blend weights |
| 56 | 16 | `quat1` | `OWORD` → node `+304` |
| 72 | 16 | `quat2` | `OWORD` → node `+320` |
| 88 | 12 | `range_min` | |
| 100 | 12 | `range_max` | |

### `ConstraintType`

| Value | ssbh_lib | IDA `sub_140298340` node kind |
|-------|----------|-------------------------------|
| 0 | `Aim` | type arg `0` |
| 1 | `Orient` | type arg `1` |

---

## IDA findings — loader / parse chain

### String & FourCC discovery

| Query | Hits | Notes |
|-------|------|-------|
| `BPLH` | `0x1402982d2` | ASCII in `.rdata`, inside version dispatcher |
| `0x484C5042` immediate | `0x1402982cf` | `cmp [rax+10h], 484C5042h` |
| `.nuhlpb` | none | Extension not referenced; FHM2D uses type id `0x13` elsewhere in TAURI |
| `HelperBone` | 12 strings | RTTI / vftable names (`nu::HelperBone`, `HelperBoneNodeBase`) |

### Call chain (load path)

```text
sub_1408EC540
  └─ sub_1408EBA80          # model/asset bundle step; calls HLBP loader among others
       └─ sub_1408EBBC0      # large resource binder; strings "vector<T> too long"
            └─ sub_140116A20 # installs nu::InstancePointer<nu::HelperBone>
                 └─ sub_140298290
                      └─ sub_1402982C0   # BPLH version dispatch
                           ├─ minor==0 → sub_1402A61E0   # BPLH v1.0 parser (not in ssbh_lib)
                           └─ minor==1 → sub_1402A6BC0   # BPLH v1.1 parser ✓
```

### `sub_1402982C0` — version gate

```c
// a3 + 0x10: u32 fourcc, a3 + 0x14: major u16, a3 + 0x16: minor u16
if (magic == 0x484C5042 && major == 1) {
    if (minor == 0) sub_1402A61E0(...);
    else if (minor == 1) sub_1402A6BC0(...);
}
// else: empty nu::InstancePointer<nu::HelperBone>
```

Matches ssbh_lib: only **1.1** implemented; **1.0** exists in game but unsupported by ssbh_lib.

### `sub_1402A6BC0` — v1.1 parse algorithm (high level)

Parsed SSBH buffer exposed to parser as `a2` with relative-offset fields:

| `a2[i]` | Role (inferred) |
|---------|-----------------|
| `a2[3]` | `aim_constraints` elements |
| `a2[5]` | `orient_constraints` elements |
| `a2[8]` | `constraint_types` count |
| `a2[9]` | `constraint_types` rel offset |

**Interleave walk**

1. Loop `v12` over `constraint_types[]`.
2. `v15 = constraint_types[v12]`.
3. If `v15 == 0` (**Aim**): exit inner loop → process current aim entry `aim[v10++]` (144-byte stride).
4. If `v15 == 1` (**Orient**): parse `orient[v11++]` (112-byte stride), build runtime node.
5. Increment schedule index; repeat until type array exhausted.

This confirms the on-disk **`constraint_types` + `constraint_indices` schedule is authoritative in-game**, not just redundant metadata.

**Bone name resolution:** `sub_1402A6110(ssbh_string, skel_context)` — hashes/looks up bone in skeleton, returns bone instance pointer; used for parent/source/target name fields.

**Runtime node construction**

| Function | Role |
|----------|------|
| `sub_140298340` | Construct helper-bone **node**; arg2 = kind (0 aim / 1 orient); copies strings, quats, ints |
| `sub_140298530` | Append node to `HelperBone` tracker vector (32-byte handle stride) |
| `sub_1402A6B70` | Wrap node in `InstancePointer<HelperBoneNodeBase>` |

`sub_140298340` runtime object highlights:

| Node off | Source |
|----------|--------|
| +20 | constraint kind sub-type (`unk_type` for orient) |
| +24, +28 | int pair from bone lookups (`+56`, `+60` on bone obj) |
| +32 | name string |
| +304, +320 | `quat1`, `quat2` from file |
| +336, +352 | default `range_min`/`range_max` = **±π** (`xmmword_141B4F3E0` / `141B4F2C0`) when not overridden |

### v1.0 parser

`sub_1402A61E0` — same callee set (`sub_140298340`, `sub_140298530`, `sub_1402A6110`), smaller function. **Not modeled in ssbh_lib.** Low priority unless legacy assets appear.

---

## TAURI_PROJECT integration

| Location | Behavior |
|----------|----------|
| `ssbh_dae_cmd.rs` | `ssbh_read_nuhlpb` / `ssbh_write_nuhlpb` via `HlpbData`; **does not expose** `constraint_indices` / `constraint_types` |
| `ssbh_motion.rs` | Optional `model.nuhlpb` beside skel; `apply_aim_constraint` / `apply_orient_constraint` |
| `NuhlpbEditorBody.tsx` | Edits aim/orient lists only |
| `fhm2d` | `.nuhlpb` type id `0x13`; character repack maps `0\3\*.nuhlpb` to model folders |

### TAURI preview semantics (simplified vs game)

**Aim (`apply_aim_constraint`):**

- Uses `aim_bone_name1` as source position bone.
- Uses `target_bone_name1` as aim target bone (IDA parse path also touches `+48` / `target_bone_name2`).
- Applies `aim` axis + `rotation_arc` to constrained transform.
- **Ignores:** `aim_bone_name2`, `target_bone_name2`, `aim_type*`, `unk1/2`, `up`, `quat1/2`, tail floats.

**Orient (`apply_orient_constraint`):**

- Uses `source_bone_name`, `target_bone_name`, `constraint_axes` with ZYX euler lerp.
- Parent from **skeleton** `parent_index`, not `parent_bone_name*`.
- **Ignores:** `unk_type`, `quat1/2`, `range_min/max`.

**Scheduling:** Preview finds first matching constraint per bone by name; **does not honor `constraint_types` ordering** or multiple stacked constraints on one bone.

---

## Gap register

| ID | Severity | Topic | Detail |
|----|----------|-------|--------|
| H1 | **High** | `HlpbData` round-trip | `From<HlpbData> for Hlpb` rebuilds `constraint_indices`/`constraint_types` as sequential aim-then-orient; **original interleave order lost** on edit/save via editor or `ssbh_write_nuhlpb` |
| H2 | **High** | Preview parity | `ssbh_motion` solver is partial; no `quat1/2`, `up`, `unk_type`, range clamps, or ordered multi-constraint stack |
| H3 | **Medium** | Duplicate name slots | Pairs `*_name1`/`*_name2` likely Maya export redundancy; IDA uses both in lookups but TAURI uses only `*_name1` (aim target uses `target_bone_name1`, parse uses `+48`) |
| H4 | **Medium** | `unk_type` | Values 0/1/2 in files; stored on runtime node+20; semantics unknown (ssbh_lib TODO) |
| H5 | **Medium** | `quat1`/`quat2` | Non-identity in real assets (see ssbh_lib_json sample); passed into game node ctor; **not applied** in TAURI preview |
| H6 | **Low** | `range_min/max` units | File samples use ±180; game ctor defaults ±π rad on runtime object — confirm whether file values are degrees or radians |
| H7 | **Low** | Aim tail floats | `unk17`–`unk22` read/written in binary but dropped by `HlpbData` conversion |
| H8 | **Low** | Version 1.0 | Game supports `minor==0`; ssbh_lib rejects / has no variant |
| H9 | **Info** | Field naming | Rust uses `unk*` / duplicated names; comments note Maya aim/orient analogy |

---

## Recommended follow-ups

1. **Preserve schedule on edit:** Extend `NuhlpbReadResult` + `HlpbData` IPC to carry `constraint_indices` and `constraint_types`; round-trip without reordering unless user explicitly normalizes.
2. **IDA runtime pass:** From `sub_140298340` xrefs, find per-frame helper-bone evaluator (search callees using node `+304` quats and `constraint_axes`) — not completed in this pass.
3. **Sample corpus:** Round-trip real `model.nuhlpb` from unit packs (`0xAF73362C` has 14 files) with `ssbh_lib_json` binary diff to validate padding.
4. **Rename pass in ssbh_lib:** Once semantics confirmed, rename `unk_type`, duplicate bone fields, and document which slot EXVS2 prefers.

---

## Verification performed

```text
cargo test -p ssbh_data create_hlpb   # OK (round-trip aim+orient lists)
IDA: find BPLH, analyze sub_1402982C0 / sub_1402A6BC0 / sub_140298340
IDA: struct strides 144 (aim), 112 (orient)
```

---

## Cross-references

- Session inventory: `docs/agent-sessions/ssbh-lib-ida-audit/process.md`
- FHM2D type id: `src-tauri/src/format/fhm2d_pack.rs` (`0x13`)
- Unit model `.nuhlpb` count rule: `docs/agent-sessions/unit-model-editor/process.md`
