# Repack Stage FHM2D — AI Agent Checklist

> **Purpose**: Definitive rule set for any AI agent modifying the FHM2D stage
> rebuild pipeline (`fhm2d_stage.rs`, `fhm2d_pack.rs`). Every rule below is
> derived from byte-level comparison against game-original archives. Violating
> any MUST rule produces a binary that crashes or renders incorrectly at runtime.

---

## Architecture: Two-Layer Model

```
Layer 1: SubFileData[]        — flat pool, each file stored ONCE, indexed by fileIndex (0-based)
Layer 2: SubFileStructure[]   — pre-order tree of Folder/Item/EndMark nodes
```

- SubFileData stores actual file bytes. One entry per unique file.
- SubFileStructure is a tree. Item nodes reference SubFileData by `fileIndex`.
- The same `fileIndex` CAN appear in multiple Item nodes (reference semantics).
- The game loads data by binary offset computed from SubFileData index, not by path.

---

## HARD RULES (invariants — never violate)

### R1: Item.unk2 — File Type Tag

Every Item node MUST have the correct `unk2` value based on file extension:

| Extension   | unk2           | Meaning         |
|-------------|----------------|-----------------|
| `.nusktb`   | `"10000000"`   | Skeleton        |
| `.numatb`   | `"21000000"`   | Material        |
| `.numshb`   | `"30000000"`   | Mesh/Shader     |
| `.numdlb`   | `"40000000"`   | Model           |
| `.jnttbl`   | `"50000000"`   | Joint Table     |
| `.nutexb`   | `"00000000"`   | Texture (default) |
| `.hkt`      | `"00000000"`   | Havok collision |
| `.csv`      | `"00000000"`   | Parameter file  |
| `.spbin`    | `"00000000"`   | Special binary  |

**Exception R1a**: `.nutexb` inside `info/post_effect/` directory → `"01010000"`.
Detection: check parent directory name equals `"post_effect"`.

**Source**: `unk2_for_ext()` + `unk2_for_file()` in `fhm2d_stage.rs`.

### R2: Folder.unk3 / unk5 — Folder Type Classification

| unk3 | unk5 | Meaning                  | Detection                                        |
|------|------|--------------------------|--------------------------------------------------|
| 0    | 0    | Regular directory        | Default                                          |
| 32   | 1    | Texture container        | All-digit name AND contains only `.nutexb` files |
| 64   | 0    | Shared `textures/` dir   | Only in shared-textures pipeline mode            |

**MUST**: When `unk3 == 32`, `unk5` MUST be `1`. There is NO valid `unk3=32, unk5=0` combination.

### R3: Item.unk3 — Always 0

In ALL game-original stage data: `Item.unk3 = 0` for every Item, including
shared/deduplicated textures. Cross-model sharing is achieved purely via shared
`fileIndex`, not via a flag.

**MUST**: Always emit `unk3 = 0` for Item nodes.

### R4: SubFileData.fileType Mapping

SSBH-family extensions keep their extension. Everything else maps to `".bin"`:

```
KEEP AS-IS:  .nutexb .nusktb .numatb .numshb .numdlb .nuanmb .nurpdb .nushdb .nufxlb .nuhlpb .nudnbb .nus3bank
MAP TO .bin: .jnttbl .hkt .csv .spbin (and any other non-SSBH extension)
```

### R5: Texture Deduplication

When the same texture filename (case-insensitive) appears in multiple models'
texture containers, ALL occurrences MUST share ONE SubFileData entry (same `fileIndex`).

- First encounter: create new SubFileData entry, assign fileIndex.
- Subsequent encounters: reuse existing fileIndex, do NOT create a new entry.
- The `fileUrl` in SubFileData points to whichever physical path was encountered first.

### R6: SSBH Model Folder — Canonical Item Order

Inside each SSBH model folder, items MUST follow this exact sequence:

```
① Item(.nusktb, unk2="10000000")              — skeleton, ALWAYS first
② Folder(tex_container_0, unk3=32, unk5=1)    — __maya__ textures
   Item(.nutexb) × N
   EndMark(1)
③ Item(__maya__.numatb, unk2="21000000")       — PAIRED with container_0
④ Folder(tex_container_1, unk3=32, unk5=1)    — __nust__ textures
   Item(.nutexb) × M
   EndMark(1)
⑤ Item(__nust__.numatb, unk2="21000000")       — PAIRED with container_1
⑥ Item(.numshb, unk2="30000000")
⑦ Item(.numdlb, unk2="40000000")
⑧ Item(.jnttbl, unk2="50000000")              — joint table, ALWAYS last
EndMark(1)
```

**Key constraints**:
- nusktb is ALWAYS the first Item. NOT alphabetical.
- Each texture container is IMMEDIATELY followed by its paired numatb.
- Container 0 = `__maya__`, Container 1 = `__nust__`. Positional, not by name.
- After all (container + numatb) pairs: numshb → numdlb → jnttbl in this order.
- jnttbl is ALWAYS the last Item.

**folderCount** for standard SSBH model with 2 texture containers:
`1(nusktb) + 2(containers) + 2(numatbs) + 1(numshb) + 1(numdlb) + 1(jnttbl) = 8`

### R7: Empty Texture Containers MUST Be Preserved

If a material has 0 textures (e.g., sky's `__nust__`), the texture container
STILL exists as `Folder(folderCount=0, unk3=32, unk5=1)` followed by `EndMark(1)`
and its paired numatb Item.

**MUST**: Always emit exactly 2 texture containers per SSBH model (`0/` for
`__maya__`, `1/` for `__nust__`), even when one has 0 textures.

### R8: Content-Level Directory Order

At the level containing `base/`, `info/`, model dirs, and `sky/`:

```
base (priority 0) → info (1) → {model dirs alphabetically} (2) → sky (3) → textures (4, if present)
```

This is NOT alphabetical — it is a fixed priority order.

### R9: info/ Internal Layout

Inside `info/`, children MUST follow this order:

```
fog/  →  light/  →  [loose files in fixed order]  →  post_effect/
```

**post_effect/ is ALWAYS the last child of info/**.

Loose file order within info/ is hardcoded by the game runtime:

| Position | File              | Priority |
|----------|-------------------|----------|
| 0        | border_hit.hkt    | 0        |
| 1        | placement.csv     | 1        |
| 2        | graphic_param.csv | 2        |
| 3        | plan_param.spbin  | 3        |

The game reads these files POSITIONALLY. Alphabetical ordering (which puts
graphic_param before placement) WILL break stage loading.

### R10: Root-Level Structure

Game-original root structure:

```
Folder(count=N+1, unk3=0)         ← root wrapper (the 0/ dir)
├─ Folder(count=M, unk3=0)        ← content level (0/0/) — contains base/info/models/sky
│  └─ ...content tree...
└─ Folder(count=0, unk3=0)        ← trailing empty folder — MUST exist
   EndMark(1)                      ← closes ONLY the empty folder (not 2!)
EndMark(1)                         ← closes root wrapper
```

**MUST**: The trailing empty Folder is a CHILD of the outer wrapper, not a root-level sibling.
**MUST**: Only 1 EndMark closes the trailing empty folder.
**MUST**: The outer wrapper's folderCount includes both the content folder AND the trailing empty folder.

### R11: EndMark Equivalence

`EndMark(N)` writes N consecutive `0x0B` bytes. This is identical to N separate
`EndMark(1)` entries. Both produce the same binary output.

Our rebuild uses separate `EndMark(1)` entries. This is correct and binary-equivalent.

### R12: CSV Content Preservation

`graphic_param.csv` and other CSV files MUST be preserved byte-for-byte:
- Empty lines are section separators — do NOT filter them out.
- Trailing whitespace may have meaning.
- Empty entries (both key and value empty) output as empty string, NOT as `","`.

---

## SSBH Model Folder Detection

A directory is an SSBH model folder if it contains:

```
has .nusktb AND (has texture container subdirs OR has .numatb files)
```

A directory is a texture container if:
1. Name consists entirely of ASCII digits (`0`, `1`, `23`)
2. Contains ONLY `.nutexb` files (no subdirs, no other extensions)
3. CAN be empty (0 files) — this is valid for materials with 0 textures

---

## Pipeline Execution Order

```
1. Extract .fhm2d archive
     ↓
2. Rename (stage_rename_in_memory) — resolve fileIndex filenames to real names
     ↓
3. Edit on disk — modify textures, models, etc.
     ↓
4. Redistribute textures (redistribute_stage_textures)
     MOVES shared textures from textures/ back into per-model numbered subdirs
     MUST run BEFORE rebuild
     ↓
5. Rebuild structure JSON (rebuild_structure_from_scratch)
     Walks disk → emits SubFileData[] + SubFileStructure[]
     ↓
6. Repack binary (serialize_structure_binary in fhm2d_pack.rs)
     SubFileData + SubFileStructure → binary .fhm2d
```

**CRITICAL**: Step 4 (redistribute) MUST complete before step 5 (rebuild).
The rebuild walker expects textures inside numbered subdirs (texture containers).

---

## Texture Workflow

### Extract → Edit cycle (shared textures mode)

When extracted for editing, textures are consolidated into a shared `textures/`
folder (deduplicated). Each numatb references textures via relative paths like
`../../textures/{texture_name}`.

```
BEFORE (in-archive):  base/model/0/{tex}.nutexb, base/model/1/{tex}.nutexb  (refs)
AFTER  (on-disk):     textures/{tex}.nutexb  (single copy)
```

Info folder textures (fog/, light/, post_effect/) are NOT moved — they stay
in place because they are not referenced by any model's numatb.

### Rebuild cycle (per-model textures mode)

Before repacking, `redistribute_stage_textures` moves textures back from
`textures/` into per-model numbered subdirs (0/, 1/) based on numatb references.

---

## Validation Checklist (after any rebuild code change)

### Build
- [ ] `cargo check` passes

### Structure comparison (against known-good origin)
- [ ] **Item.unk2**: Every Item has correct type tag per extension table (R1)
- [ ] **Item.unk2 post_effect**: lut_none.nutexb has `"01010000"` (R1a)
- [ ] **Folder.unk3/unk5**: Texture containers = `(32, 1)`, regular dirs = `(0, 0)` (R2)
- [ ] **Item.unk3**: ALL items have `unk3 = 0` (R3)
- [ ] **fileType**: `.jnttbl`/`.hkt`/`.csv`/`.spbin` mapped to `".bin"` (R4)
- [ ] **Deduplication**: Same texture filename across models shares one fileIndex (R5)
- [ ] **SSBH ordering**: nusktb first, tex_container↔numatb interleaved, numshb/numdlb/jnttbl last (R6)
- [ ] **Empty containers**: All SSBH models have exactly 2 texture containers (R7)
- [ ] **Content dir order**: base → info → models → sky → textures (R8)
- [ ] **info/ order**: fog → light → [loose files in fixed order] → post_effect (R9)
- [ ] **info/ loose files**: border_hit → placement → graphic_param → plan_param (R9)
- [ ] **Root structure**: Trailing empty Folder inside wrapper, with correct EndMark count (R10)
- [ ] **folderCount**: Each Folder's count matches its actual number of direct children
- [ ] **CSV preservation**: Empty lines and whitespace preserved byte-for-byte (R12)

### Binary comparison
- [ ] Repacked metadata binary size matches origin exactly (even 1 byte off = crash)
- [ ] Re-extract repacked .fhm2d and verify file contents match originals
- [ ] Only acceptable diffs: fileIndex ordering within texture containers

---

## Known Pitfalls (indexed for quick lookup)

| ID  | Pitfall                                      | Symptom                        | Rule |
|-----|----------------------------------------------|--------------------------------|------|
| P1  | All Item.unk2 set to "00000000"              | Lost type semantics            | R1   |
| P2  | Folder.unk5=0 for texture containers         | Game ignores texture container | R2   |
| P3  | Item.unk3=1 for deduplicated textures        | Non-original flag value        | R3   |
| P4  | Actual extension as fileType (not .bin)       | fileType mismatch              | R4   |
| P5  | Separate SubFileData for same texture         | Bloated pool, broken refs      | R5   |
| P6  | Alphabetical sort in SSBH model folder       | Broken tex↔numatb pairing     | R6   |
| P7  | Skip empty texture container                 | Missing container + numatb     | R7   |
| P8  | numatb after ALL texture containers           | Broken pairing (must interleave) | R6 |
| P9  | Alphabetical info/ file order                 | placement↔graphic_param swapped | R9 |
| P10 | post_effect/ not last in info/                | Structure topology mismatch    | R9   |
| P11 | Trailing empty folder at root level (outside) | Metadata size mismatch         | R10  |
| P12 | EndMark(2) closing trailing empty folder      | Extra 0x0B byte, all offsets shift | R10 |
| P13 | Filtering empty lines from CSV                | Byte count mismatch            | R12  |
| P14 | post_effect nutexb unk2 = "00000000"          | LUT texture not found          | R1a  |
| P15 | SSBH not detected (no tex containers on disk) | Wrong item order for sky model | R6   |

---

## Source Code Map

| Function                                     | Location             | Purpose                                    |
|----------------------------------------------|----------------------|--------------------------------------------|
| `is_texture_container_dir`                   | `fhm2d_stage.rs`     | Detect texture container directories       |
| `file_type_for_ext`                          | `fhm2d_stage.rs`     | Map extension → SubFileData.fileType       |
| `unk2_for_ext`                               | `fhm2d_stage.rs`     | Map extension → Item.unk2 type tag         |
| `unk2_for_file`                              | `fhm2d_stage.rs`     | Map extension + parent dir → Item.unk2     |
| `add_nutexb_dedup`                           | `fhm2d_stage.rs`     | Texture deduplication by filename          |
| `push_folder`                                | `fhm2d_stage.rs`     | Emit Folder node (auto-sets unk5 for unk3=32) |
| `push_item` / `push_item_ex`                | `fhm2d_stage.rs`     | Emit Item node                             |
| `emit_texture_container_items`               | `fhm2d_stage.rs`     | Emit tex container folder + items + EndMark |
| `emit_file_item`                             | `fhm2d_stage.rs`     | Emit single file Item with correct unk2    |
| `emit_dir_recursive_inner`                   | `fhm2d_stage.rs`     | Main tree walker (SSBH detection + ordering) |
| `stage_content_dir_order`                    | `fhm2d_stage.rs`     | Content-level directory sort order         |
| `info_file_order`                            | `fhm2d_stage.rs`     | info/ loose file sort order                |
| `rebuild_structure_from_scratch`             | `fhm2d_stage.rs`     | Entry point (per-model textures mode)      |
| `rebuild_structure_from_scratch_with_shared` | `fhm2d_stage.rs`     | Entry point (shared textures mode)         |
| `serialize_structure_binary`                 | `fhm2d_pack.rs`      | Binary serialization of structure tree     |
| `parse_sub_file_structure`                   | `fhm2d.rs`           | Binary parser (reference for field offsets) |

---

## Binary Node Sizes (for byte-level debugging)

| Node Type | Prefix Byte | Total Size | Key Fields                              |
|-----------|-------------|------------|-----------------------------------------|
| Folder    | `0x0A`      | 33 bytes   | +0x05: folderCount, +0x11: unk3, +0x19: unk5 |
| Item      | `0x00`      | 25 bytes   | +0x05: fileIndex, +0x09: unk2, +0x11: unk3   |
| EndMark   | `0x0B`      | 1 byte each | N consecutive 0x0B = close N levels         |
