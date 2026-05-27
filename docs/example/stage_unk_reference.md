# EXVS2 MBON — SubFileStructure Complete Reference

> **WARNING TO ALL AI AGENTS**: This document describes a reverse-engineered binary format
> used by EXVS2 MBON (Mobile Suit Gundam: Extreme VS. Maxiboost ON).
> Every unk field has a purpose in the game runtime. **DO NOT zero out, omit, or guess these values.**
> Incorrect unk values cause silent rendering failures, texture corruption, or crashes at runtime.
> When in doubt, **match the original extracted values exactly**.

---

## 1. Binary Layout

SubFileStructure is a pre-order serialized tree. Three node types:

### 1.1 Folder Node — `0x0A` prefix, 33 bytes (0x21)

```
Offset  Bytes  JSON Key       Type         Description
──────  ─────  ────────       ────         ───────────
+0x00   1      (type)         u8           Always 0x0A
+0x01   4      unk1           hex[4]       Always "00000000" in stage data
+0x05   4      folderCount    i32 LE       Number of direct children (Items + sub-Folders)
+0x09   4      unk2           hex[4]       Always "00000000" in stage data
+0x0D   4      unk2_1         i32 LE       Always 0 in stage data
+0x11   4      unk3           i32 LE       ★ Folder type tag (see §2)
+0x15   4      unk4           i32 LE       Always 0 in stage data
+0x19   4      unk5           i32 LE       ★ Texture container flag (see §2)
+0x1D   4      unk6           i32 LE       Always 0 in stage data
```

### 1.2 Item Node — `0x00` prefix, 25 bytes (0x19)

```
Offset  Bytes  JSON Key       Type         Description
──────  ─────  ────────       ────         ───────────
+0x00   1      (type)         u8           Always 0x00
+0x01   4      unk1           hex[4]       Always "00000000" in stage data
+0x05   4      fileIndex      i32 LE       Index into SubFileData[] pool
+0x09   4      unk2           hex[4]       ★★★ FILE TYPE TAG (see §3) — CRITICAL
+0x0D   4      unk2_1         i32 LE       Always 0 in stage data
+0x11   4      unk3           i32 LE       Always 0 in original stage data (see §3.2)
+0x15   4      unk4           i32 LE       Always 0 in stage data
```

### 1.3 EndMark Node — `0x0B` prefix, 1 byte each

```
Each 0x0B byte closes one folder level. N consecutive 0x0B bytes = close N levels.
In JSON, consecutive 0x0B bytes are collapsed into EndMark { endMarkCount: N }.
EndMark(3) and three separate EndMark(1) produce identical binary output.
```

**Source:** `fhm2d.rs:650-703` (parser), `fhm2d_pack.rs:582-631` (serializer)

---

## 2. Folder.unk3 and Folder.unk5 — Folder Type Classification

| unk3 | unk5 | Meaning | Detection Rule |
|------|------|---------|---------------|
| **0** | **0** | Regular directory | Default for all non-special dirs |
| **32** | **1** | Texture container directory | All-digit name ("0", "1"), contains ONLY `.nutexb` files, no subdirs |
| **64** | **0** | Shared `textures/` directory | Only in shared-textures pipeline mode (post stage_rename) |

### Rules

- `unk3=32` **ALWAYS** pairs with `unk5=1`. If you emit unk3=32 with unk5=0, the game may not recognize the texture container.
- `unk3=64` is used only in the shared-textures workflow where `textures/` exists at the content level. Not present in game-original archives.
- There is no `unk3=32, unk5=0` combination in any known game data.

### Empty Texture Containers

A texture container CAN have `folderCount=0` (e.g., sky's `__nust__` container when that material has no textures). The folder still gets `unk3=32, unk5=1` and is still followed by an EndMark and its paired numatb item.

---

## 3. Item.unk2 — File Type Tag (CRITICAL)

### 3.1 SSBH Model File Types

Inside SSBH model folders, each file type has a **fixed unk2 value**:

| unk2 (hex bytes) | Binary (LE) | File Extension | Role in SSBH | Position in Model Folder |
|-------------------|------------|----------------|-------------|--------------------------|
| `"10000000"` | 0x00000010 | `.nusktb` | Skeleton | **1st** (always first) |
| `"21000000"` | 0x00000021 | `.numatb` | Material | After its paired texture container |
| `"30000000"` | 0x00000030 | `.numshb` | Mesh / Shader | After last numatb |
| `"40000000"` | 0x00000040 | `.numdlb` | Model | After numshb |
| `"50000000"` | 0x00000050 | `.jnttbl` | Joint Table | **Last** (always last) |
| `"00000000"` | 0x00000000 | `.nutexb` | Texture (in texture container) | Inside tex container folder |

### 3.2 Non-SSBH Files

| unk2 (hex bytes) | File Extension | Context |
|-------------------|---------------|---------|
| `"00000000"` | `.nutexb` | Textures in `info/fog/`, `info/light/` |
| `"00000000"` | `.hkt` | Havok collision (e.g., `map_hit.hkt`, `border_hit.hkt`) |
| `"00000000"` | `.csv` | Parameter files (e.g., `placement.csv`, `graphic_param.csv`) |
| `"00000000"` | `.spbin` | Special binary (e.g., `plan_param.spbin`) |
| `"01010000"` | `.nutexb` | **Special case:** `lut_none.nutexb` in `info/post_effect/` |

### 3.3 Item.unk3 — Reference Flag

In ALL game-original stage data examined: **`unk3 = 0` for every Item**, including shared textures.

Cross-model texture sharing is achieved purely by having multiple Items point to the same `fileIndex` in SubFileData. The unk3 field is NOT used to mark references.

**Rule: Always emit `unk3 = 0` for Items when rebuilding.**

---

## 4. SSBH Model Folder — Canonical Item Order (CRITICAL)

### 4.1 The Pattern

Every SSBH model folder in EXVS2 stages follows this **exact** internal order:

```
Folder(count=N, unk3=0)                             ← the SSBH model folder
│
├─ Item(.nusktb, unk2="10000000")                    ← ① SKELETON — always first
│
├─ Folder(tex_container_0, unk3=32, unk5=1)          ← ② __maya__ texture container
│  ├─ Item(.nutexb, unk2="00000000", unk3=0) × M     │  textures in material slot order
│  EndMark(1)
│
├─ Item(__maya__.numatb, unk2="21000000")             ← ③ PAIRED with tex_container_0
│
├─ Folder(tex_container_1, unk3=32, unk5=1)          ← ④ __nust__ texture container
│  ├─ Item(.nutexb, unk2="00000000", unk3=0) × M     │  textures in material slot order
│  EndMark(1)
│
├─ Item(__nust__.numatb, unk2="21000000")             ← ⑤ PAIRED with tex_container_1
│
├─ Item(.numshb, unk2="30000000")                    ← ⑥ Mesh/Shader
├─ Item(.numdlb, unk2="40000000")                    ← ⑦ Model
└─ Item(.jnttbl, unk2="50000000")                    ← ⑧ Joint Table — always last
EndMark(1)
```

### 4.2 Key Rules

1. **nusktb is ALWAYS the first Item** in the model folder. NOT alphabetical.
2. **Each texture container is immediately followed by its paired numatb.**
   - Container `0/` → `*__maya__.numatb`
   - Container `1/` → `*__nust__.numatb`
3. **The pairing is positional**: container index 0 = first numatb, container index 1 = second numatb. The naming convention (`__maya__`, `__nust__`) is consistent in EXVS2 but the structure is defined by position.
4. **After all (container + numatb) pairs**: numshb → numdlb → jnttbl, in this order.
5. **jnttbl is ALWAYS the last Item** in the model folder.
6. **Empty texture containers still exist.** If `__nust__` has 0 textures, the Folder is emitted with `folderCount=0`, followed by EndMark(1), followed by the nust numatb.

### 4.3 folderCount Calculation

`folderCount` for an SSBH model folder = sum of:
- 1 (nusktb)
- 1 per texture container (folder node, counts as 1 child)
- 1 per numatb (one per texture container)
- 1 (numshb)
- 1 (numdlb)
- 1 (jnttbl)

For a standard model with 2 texture containers: `1 + 2 + 2 + 1 + 1 + 1 = 8`

### 4.4 How to Detect an SSBH Model Folder

A directory is an SSBH model folder if it contains:
- At least one `.nusktb` file, AND
- At least one texture container subdirectory (all-digit name, only `.nutexb` children)

### 4.5 Texture Order Within Containers

Textures within a container are ordered by the **material's texture slot order** (as defined in the `.numatb` file), NOT alphabetically. When rebuilding from disk without numatb parsing, alphabetical order is an acceptable approximation — the game reads textures by fileIndex, not by position within the container.

---

## 5. Cross-Model Texture Sharing (Deduplication)

### 5.1 How It Works in the Original Format

```
SubFileData[0] = stage001_panel_01_diffuse.nutexb   ← stored ONCE

SubFileStructure:
  base/0/  → Item(fileIndex=0, unk3=0)   ← reference to [0]
  base/1/  → Item(fileIndex=0, unk3=0)   ← same [0], no unk3 flag
  obj/0/   → Item(fileIndex=0, unk3=0)   ← same [0], no unk3 flag
  obj/1/   → Item(fileIndex=0, unk3=0)   ← same [0], no unk3 flag
```

- One SubFileData entry per unique texture file.
- Multiple Items in different texture containers reference the same fileIndex.
- **No special flag** on the Item — unk3 stays 0.
- The fileUrl in SubFileData points to ONE physical path (e.g., `textures/` folder). It doesn't matter which model "owns" it.

### 5.2 Deduplication Key

Two `.nutexb` files are considered the same if their **lowercase filename** matches, regardless of which model directory they reside in.

### 5.3 fileUrl in SubFileData

In the game-original format, all shared textures have their fileUrl pointing to a shared `textures/` folder:
```
.\{stage_name}\0\0\textures\{filename}.nutexb
```

When rebuilding with per-model texture containers, the fileUrl points to the first model's container where the texture was encountered:
```
.\{stage_name}\0\0\base\{model}\0\{filename}.nutexb
```

Both are valid — the game loads data by binary offset (computed from SubFileData index), not by file path.

---

## 6. SubFileData fileType Mapping

The game-original format classifies some extensions under `.bin`:

| Actual Extension | fileType in SubFileData |
|------------------|------------------------|
| `.nutexb` | `.nutexb` |
| `.nusktb` | `.nusktb` |
| `.numatb` | `.numatb` |
| `.numshb` | `.numshb` |
| `.numdlb` | `.numdlb` |
| `.nuanmb` | `.nuanmb` |
| `.nurpdb` | `.nurpdb` |
| `.nushdb` | `.nushdb` |
| `.nufxlb` | `.nufxlb` |
| `.nuhlpb` | `.nuhlpb` |
| `.nudnbb` | `.nudnbb` |
| `.nus3bank` | `.nus3bank` |
| `.jnttbl` | **`.bin`** |
| `.hkt` | **`.bin`** |
| `.csv` | **`.bin`** |
| `.spbin` | **`.bin`** |

**Rule:** SSBH-family extensions (`.nu*`, `.nus3bank`) keep their extension. Everything else becomes `.bin`.

---

## 7. Stage Content-Level Directory Order

At the content level (where `base/`, `info/`, model dirs, `sky/` exist), directories appear in this fixed order:

```
1. base/          ← always first
2. info/          ← always second
3. {model dirs}   ← sorted alphabetically among themselves
4. sky/           ← always last (before textures/ if present)
5. textures/      ← only in shared-textures mode (unk3=64)
```

Each model directory (e.g., `001stage001_object_box01/`) typically contains:
- A numbered SSBH subfolder (e.g., `0/`) containing the model files
- Optional collision file (e.g., `map_hit.hkt`) at the model dir level

---

## 8. Root-Level Structure

The game-original root structure has:

```
Folder(count=2, unk3=0)         ← root (the stage folder)
├─ Folder(count=N, unk3=0)      ← 0\0\ wrapper (contains content dirs)
│  ├─ base/ ...
│  ├─ info/ ...
│  ├─ models/ ...
│  └─ sky/ ...
└─ Folder(count=0, unk3=0)      ← empty trailing folder
   EndMark(2)                    ← closes empty folder + root
```

The empty trailing folder at root level is present in game-original data. Its purpose is unknown but it should be preserved when possible.

---

## 9. Complete Worked Example

Stage `0x16F73C97` with 3 models (base, object_box01, sky) and 17 unique textures:

```
SubFileData pool (41 entries):
  [0-5]   base textures (panel_01_*)         ← shared with object_box
  [6-9]   info textures (ibl, rampfog, lut)
  [10-15] object_box textures (panel_02_*)   ← shared with base (in obj's container)
  [16]    sky texture (skydome_sky)
  [17-19] skeletons (.nusktb) × 3 models
  [20-25] materials (.numatb) × 6 (maya + nust per model)
  [26-28] meshes (.numshb) × 3 models
  [29-31] models (.numdlb) × 3 models
  [32]    base jnttbl
  [33-37] misc bin files (hkt, csv, spbin)
  [38]    object_box jnttbl
  [39]    object_box map_hit.hkt
  [40]    sky jnttbl

SubFileStructure tree:
  ROOT Folder(count=2)
  ├─ Folder(count=4)                           ← content wrapper
  │  ├─ base/ Folder(count=2)
  │  │  ├─ 001stage001_base/ Folder(count=8)   ← SSBH model
  │  │  │  ├─ Item(17, unk2=10000000)          ← nusktb
  │  │  │  ├─ Folder(6, unk3=32, unk5=1)       ← tex container 0/
  │  │  │  │  └─ Items [0,1,2,3,4,5]           ← all unk3=0
  │  │  │  ├─ Item(20, unk2=21000000)          ← maya numatb
  │  │  │  ├─ Folder(6, unk3=32, unk5=1)       ← tex container 1/
  │  │  │  │  └─ Items [2,3,1,0,4,5]           ← same fileIndices, unk3=0
  │  │  │  ├─ Item(21, unk2=21000000)          ← nust numatb
  │  │  │  ├─ Item(26, unk2=30000000)          ← numshb
  │  │  │  ├─ Item(29, unk2=40000000)          ← numdlb
  │  │  │  └─ Item(32, unk2=50000000)          ← jnttbl
  │  │  └─ Item(33, unk2=00000000)             ← map_hit.hkt
  │  │
  │  ├─ info/ Folder(count=7)
  │  │  ├─ fog/ → Items [6, 7]
  │  │  ├─ light/ → Item [8]
  │  │  ├─ Items [34,35,36,37]                 ← hkt, csv, csv, spbin
  │  │  └─ post_effect/ → Item(9, unk2=01010000)  ← SPECIAL unk2 for lut
  │  │
  │  ├─ object_box01/ Folder(count=2)
  │  │  ├─ 0/ Folder(count=8)                  ← SSBH model
  │  │  │  ├─ Item(18, unk2=10000000)          ← nusktb
  │  │  │  ├─ Folder(12, unk3=32, unk5=1)      ← tex 0/ (12 textures: 6 own + 6 shared)
  │  │  │  │  └─ Items [10,11,12,0,13,1,2,3,4,5,14,15]  ← idx 0-5 are SHARED
  │  │  │  ├─ Item(22, unk2=21000000)          ← maya numatb
  │  │  │  ├─ Folder(12, unk3=32, unk5=1)      ← tex 1/
  │  │  │  │  └─ Items [12,0,1,13,5,2,3,4,14,10,11,15]  ← SHARED, different order
  │  │  │  ├─ Item(23, unk2=21000000)          ← nust numatb
  │  │  │  ├─ Item(27, unk2=30000000)
  │  │  │  ├─ Item(30, unk2=40000000)
  │  │  │  └─ Item(38, unk2=50000000)
  │  │  └─ Item(39, unk2=00000000)             ← map_hit.hkt
  │  │
  │  └─ sky/ Folder(count=1)
  │     └─ 0/ Folder(count=8)                  ← SSBH model
  │        ├─ Item(19, unk2=10000000)           ← nusktb
  │        ├─ Folder(1, unk3=32, unk5=1)        ← tex 0/ (1 texture)
  │        │  └─ Item [16]
  │        ├─ Item(24, unk2=21000000)           ← maya numatb
  │        ├─ Folder(0, unk3=32, unk5=1)        ← tex 1/ (EMPTY! count=0)
  │        ├─ Item(25, unk2=21000000)           ← nust numatb (still present!)
  │        ├─ Item(28, unk2=30000000)
  │        ├─ Item(31, unk2=40000000)
  │        └─ Item(40, unk2=50000000)
  │
  └─ Folder(count=0)                            ← empty trailing folder
     EndMark(2)
```

---

## 10. Common Mistakes AI Agents Make

| # | Mistake | Why It's Wrong | Correct Behavior |
|---|---------|---------------|-----------------|
| 1 | Set all Item.unk2 to "00000000" | Loses file type semantics | Use the mapping in §3.1 |
| 2 | Set Folder.unk5=0 for texture containers | Game may not recognize the texture container | Always set unk5=1 when unk3=32 |
| 3 | Sort SSBH model items alphabetically | Breaks nusktb-first and tex↔numatb pairing | Follow the order in §4.1 |
| 4 | Create separate SubFileData entries for same texture in different models | Wastes space, breaks the reference model | Deduplicate by lowercase filename |
| 5 | Set Item.unk3=1 for shared/linked textures | Original data always uses unk3=0 | Always emit unk3=0 |
| 6 | Use actual file extensions as fileType (.jnttbl, .hkt, .csv) | Original uses ".bin" for non-SSBH formats | Map to ".bin" per §6 |
| 7 | Omit empty texture containers | Sky's __nust__ container has 0 textures but still exists | Always emit both containers |
| 8 | Put numatb files after ALL texture containers | Breaks the interleaved pairing | Each container immediately followed by its numatb |
| 9 | Assume unk fields are padding/unused | Every field is written to binary and read by the game | Preserve all values exactly |

---

## 11. Rust Implementation Reference

| Concern | File | Line | Function |
|---------|------|------|----------|
| Binary parser | `fhm2d.rs` | 650 | `parse_sub_file_structure` |
| Binary serializer | `fhm2d_pack.rs` | 582 | `serialize_structure_binary` |
| Folder emission | `fhm2d_stage.rs` | 3231 | `RebuildCollector::push_folder` |
| Item emission | `fhm2d_stage.rs` | 3218 | `RebuildCollector::push_item_ex` |
| unk2 mapping (STUB) | `fhm2d_stage.rs` | 3023 | `unk2_for_ext` — needs implementation |
| Texture container detect | `fhm2d_stage.rs` | 2997 | `is_texture_container_dir` |
| Structure tree walk | `fhm2d_stage.rs` | 3313 | `emit_dir_recursive_inner` |
| Rebuild entry point | `fhm2d_stage.rs` | 3475 | `rebuild_structure_from_scratch` |
