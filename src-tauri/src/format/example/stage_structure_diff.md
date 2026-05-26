# Origin vs Rebuild Structure Comparison

Comparing `0x16F73C97_origin_structure.json` (game original) with `0x16F73C97_structure.json` (our rebuild output).

## 1. Header-Level Differences

| Field | Origin | Rebuild | Notes |
|-------|--------|---------|-------|
| Magic | 20 | 20 | Same |
| Fhm2dTotalCount | **41** | **47** | Rebuild has more entries (no dedup + extra test model) |
| UnkCount | 5 | 5 | Same |

## 2. SubFileData (File Pool) Differences

### 2.1 Deduplication

**Origin (41 entries):** Same texture shared across models uses ONE SubFileData entry with one fileIndex.
Example: `stage001_panel_01_diffuse.nutexb` is fileIndex=0, referenced by base/0/, base/1/, object_box/0/, object_box/1/.

**Rebuild (47 entries):** Each physical file gets its own fileIndex. No cross-model sharing.
Example: `stage001_panel_01_diffuse.nutexb` under base gets idx=1, but the same texture in object_box gets a separate idx.

### 2.2 fileType Classification

| Actual Extension | Origin fileType | Rebuild fileType |
|------------------|----------------|-----------------|
| .nutexb | `.nutexb` | `.nutexb` |
| .nusktb | `.nusktb` | `.nusktb` |
| .numatb | `.numatb` | `.numatb` |
| .numshb | `.numshb` | `.numshb` |
| .numdlb | `.numdlb` | `.numdlb` |
| .jnttbl | **`.bin`** | `.jnttbl` |
| .hkt | **`.bin`** | `.hkt` |
| .csv | **`.bin`** | `.csv` |
| .spbin | **`.bin`** | `.spbin` |

Origin groups `.jnttbl`, `.hkt`, `.csv`, `.spbin` under `.bin`. Rebuild uses the actual extension.

### 2.3 fileUrl Path Style

**Origin:** Shared textures point to a `textures/` folder:
```
.\0x16F73C97_origin\0\0\textures\stage001_panel_01_diffuse.nutexb
```

**Rebuild:** Textures in per-model numbered subdirs:
```
.\0x16F73C97\0\0\base\001stage001_base\0\stage001_panel_01_diffuse.nutexb
```

---

## 3. Folder unk Fields

### 3.1 Regular Directories

| Field | Origin | Rebuild | Match? |
|-------|--------|---------|--------|
| unk1 | "00000000" | "00000000" | YES |
| unk2 | "00000000" | "00000000" | YES |
| unk2_1 | 0 | 0 | YES |
| unk3 | 0 | 0 | YES |
| unk4 | 0 | 0 | YES |
| unk5 | 0 | 0 | YES |
| unk6 | 0 | 0 | YES |

### 3.2 Texture Container Directories (unk3=32)

| Field | Origin | Rebuild | Match? |
|-------|--------|---------|--------|
| unk1 | "00000000" | "00000000" | YES |
| unk2 | "00000000" | "00000000" | YES |
| unk2_1 | 0 | 0 | YES |
| unk3 | 32 | 32 | YES |
| unk4 | 0 | 0 | YES |
| **unk5** | **1** | **0** | **NO** |
| unk6 | 0 | 0 | YES |

**BUG: Rebuild sets `unk5=0` for texture container folders. Origin always has `unk5=1`.**

### 3.3 All Folder unk3 Values Observed

| unk3 Value | Meaning | Where |
|------------|---------|-------|
| 0 | Regular directory | All non-texture dirs |
| 32 | Texture container directory | Numbered dirs (0/, 1/) that contain only .nutexb files |
| 64 | Shared textures/ directory | Only in shared-textures mode (not present in either test file) |

---

## 4. Item unk Fields

### 4.1 Item.unk2 — File Type Tag (CRITICAL DIFFERENCE)

**Origin — unk2 encodes file type semantics:**

| File Type | unk2 Value | Hex Meaning |
|-----------|-----------|-------------|
| .nutexb (texture) | `"00000000"` | Default / texture |
| .nutexb (lut_none in post_effect/) | `"01010000"` | Special post-effect texture |
| .nusktb (skeleton) | `"10000000"` | Skeleton data |
| .numatb (material) | `"21000000"` | Material data |
| .numshb (mesh/shader) | `"30000000"` | Mesh shader data |
| .numdlb (model) | `"40000000"` | Model data |
| .jnttbl (joint table) | `"50000000"` | Joint table |
| .hkt (havok) | `"00000000"` | Binary / havok |
| .csv (param) | `"00000000"` | Binary / param |
| .spbin (special bin) | `"00000000"` | Binary / special |

**Rebuild — ALL items have `unk2 = "00000000"`.**

**This is a MAJOR information loss. The `unk2_for_ext()` function returns `"00000000"` unconditionally.**

### 4.2 Item.unk3 — Link/Reference Flag

**Origin:** ALL items have `unk3 = 0`. Even when the same fileIndex appears in 4+ texture containers across different models, the unk3 field is always 0. Reference sharing is implicit through fileIndex alone.

**Rebuild:** Uses `unk3 = 1` for deduplicated textures (second+ occurrence of same filename in a different texture container).

| Scenario | Origin unk3 | Rebuild unk3 |
|----------|------------|-------------|
| First texture occurrence | 0 | 0 |
| Same texture in another model's texture container | **0** | **1** |
| Non-texture items | 0 | 0 |

**Question: Is unk3=1 actually wrong, or is it acceptable?** The origin never uses it for shared textures, but we need to verify against other stage files. It's possible unk3=1 is valid but the origin encoder simply doesn't use it.

### 4.3 Item unk Field Summary

| Field | Origin | Rebuild | Match? |
|-------|--------|---------|--------|
| unk1 | "00000000" | "00000000" | YES |
| **unk2** | **Type-specific** | **"00000000" always** | **NO** |
| unk2_1 | 0 | 0 | YES |
| **unk3** | **0 always** | **0 or 1** | **PARTIAL** |
| unk4 | 0 | 0 | YES |

---

## 5. EndMark Differences

### 5.1 endMarkCount Values

**Origin:** Uses `endMarkCount > 1` to close multiple folder levels at once.

| endMarkCount | Occurrences in Origin | Meaning |
|--------------|----------------------|---------|
| 1 | Most | Close current folder |
| 2 | 2 times | Close 2 nested levels at once |
| 3 | 1 time | Close 3 nested levels at once |

**Rebuild:** ALL EndMarks have `endMarkCount = 1`. Multiple sequential EndMark(1) entries are used instead.

### 5.2 Example: Closing Sky Section in Origin

```
sky/
  0/
    ...items...
  EndMark(1)   ← close 0/
EndMark(3)     ← close sky/ + content_level_0/0/ + outer_0/ (3 levels at once!)
```

### 5.3 Equivalent in Rebuild

```
sky/
  0/
    ...items...
  EndMark(1)   ← close 0/
EndMark(1)     ← close sky/
EndMark(1)     ← close content level
EndMark(1)     ← close outer level
```

**Question: Are these semantically equivalent?** The binary parser may treat EndMark(3) as "pop 3 levels" or as a single token with value 3. Need to verify against the binary parser (`parse_sub_file_structure` in fhm2d.rs).

---

## 6. SSBH Model Folder: Item Ordering (CRITICAL)

### 6.1 Origin Order (Semantic / Interleaved)

Inside each model's SSBH folder (e.g., `001stage001_base/`), items follow a **fixed semantic order**:

```
Folder(count=8)
  1. Item(.nusktb)         ← unk2="10000000"  ← SKELETON FIRST
  2. Folder(tex_container_0/, unk3=32, unk5=1)  ← __maya__ textures
     ...textures...
     EndMark(1)
  3. Item(.numatb __maya__) ← unk2="21000000"  ← PAIRED with tex_container_0/
  4. Folder(tex_container_1/, unk3=32, unk5=1)  ← __nust__ textures
     ...textures...
     EndMark(1)
  5. Item(.numatb __nust__) ← unk2="21000000"  ← PAIRED with tex_container_1/
  6. Item(.numshb)          ← unk2="30000000"
  7. Item(.numdlb)          ← unk2="40000000"
  8. Item(.jnttbl)          ← unk2="50000000"
```

**Key pattern:** Each texture container is immediately followed by its corresponding `.numatb` material file. The `.nusktb` skeleton is always first.

### 6.2 Rebuild Order (Alphabetical)

```
Folder(count=8)
  1. Folder(tex_container_0/, unk3=32, unk5=0)  ← sorted first (name "0")
     ...textures...
     EndMark(1)
  2. Folder(tex_container_1/, unk3=32, unk5=0)  ← sorted second (name "1")
     ...textures...
     EndMark(1)
  3. Item(.jnttbl)          ← unk2="00000000"  ← alphabetical sort
  4. Item(.numdlb)          ← unk2="00000000"
  5. Item(.numatb __maya__)  ← unk2="00000000"
  6. Item(.numshb)           ← unk2="00000000"
  7. Item(.nusktb)           ← unk2="00000000"
  8. Item(.numatb __nust__)  ← unk2="00000000"
```

**BUG: Rebuild breaks the texture_container ↔ numatb pairing and puts nusktb last instead of first.**

---

## 7. Root-Level Nesting Depth

**Origin:** `root(count=2) → 0/(count=4) → {base, info, models, sky}`
- Root has 2 children: the main content wrapper + an empty folder
- The empty folder at the end has `count=0` and is followed by `EndMark(2)`

**Rebuild:** `root(count=1) → 0/0/(count=5) → {base, info, models, sssssccccc, sky}`
- Root has 1 child (the content wrapper)
- No empty trailing folder
- The `0/` and `0/0/` levels appear to be collapsed into one level

---

## 8. Summary of Issues in Rebuild

| # | Issue | Severity | Fix Required |
|---|-------|----------|-------------|
| 1 | `Item.unk2` always "00000000" | **CRITICAL** | Implement `unk2_for_ext()` with correct type mapping |
| 2 | `Folder.unk5 = 0` for texture containers | **HIGH** | Set `unk5 = 1` when `unk3 = 32` |
| 3 | SSBH item ordering is alphabetical | **HIGH** | Implement semantic ordering: nusktb → (tex_container + numatb) pairs → numshb → numdlb → jnttbl |
| 4 | `Item.unk3 = 1` for dedup links | **MEDIUM** | Origin uses 0 for all. May or may not cause issues. Needs more samples |
| 5 | `EndMark.endMarkCount` always 1 | **MEDIUM** | Origin batches multi-level closes. May be functionally equivalent |
| 6 | No SubFileData deduplication | **HIGH** | Same texture across models should share one fileIndex (already addressed in recent code update) |
| 7 | `.jnttbl`/`.hkt`/`.csv`/`.spbin` not mapped to `.bin` | **MEDIUM** | Origin uses `.bin` for these types |
| 8 | Missing empty trailing folder at root | **LOW** | Origin has `Folder(count=0) + EndMark(2)` at root level |
| 9 | `0/` and `0/0/` nesting collapsed | **LOW** | May affect binary offset calculations |

## 9. Correct unk2 Mapping (for unk2_for_ext)

```rust
fn unk2_for_ext(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        ".nusktb" => "10000000",
        ".numatb" => "21000000",
        ".numshb" => "30000000",
        ".numdlb" => "40000000",
        ".jnttbl" | ".bin" => "50000000",
        // .nutexb, .hkt, .csv, .spbin, etc.
        _ => "00000000",
    }
}
```

**Note:** `lut_none.nutexb` in `post_effect/` has unk2=`"01010000"` — this may be a special case or a broader rule for post_effect textures. Need more samples to confirm.

## 10. Correct Texture Container Folder Emission

```rust
// When emitting a texture container folder (all-digit name, only nutexb):
c.push_folder(tex_files.len() as i32, 32);  // unk3=32
// BUT also need unk5=1! Current push_folder doesn't set unk5.
```

Requires either:
- A new `push_folder_ex()` method that accepts unk5
- Or modifying `push_folder()` to accept unk5 when unk3=32
