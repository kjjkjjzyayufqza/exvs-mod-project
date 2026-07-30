# EXVS2 MBON — Stage Rebuild Pipeline Rules

> **READ THIS BEFORE MODIFYING ANY REBUILD CODE.**
>
> This document describes the rules, invariants, and edge cases for the
> `rebuild_structure_from_scratch` pipeline in `fhm2d_stage.rs`.
> Violating any invariant will produce an FHM2D archive that the game
> runtime either rejects or renders incorrectly.
>
> Companion reference: `stage_unk_reference.md` (binary layout and unk field tables).

---

## 1. Pipeline Overview

```
Extract (.fhm2d)
  |
  v
Rename (stage_rename_in_memory)
  |
  v
Edit textures / models on disk
  |
  v
Redistribute textures (redistribute_stage_textures)
  |                       ^-- moves shared textures into per-model numbered subdirs
  v
Rebuild structure JSON (rebuild_structure_from_scratch / _with_shared_textures)
  |                       ^-- walks disk, emits SubFileData[] + SubFileStructure[]
  v
Repack binary (serialize_structure_binary in fhm2d_pack.rs)
```

**Critical ordering**: `redistribute_stage_textures` MUST run before rebuild.
The rebuild walker expects textures inside numbered subdirs (texture containers).

---

## 2. Two-Layer Architecture

### 2.1 SubFileData — Flat File Pool

- Each unique file gets exactly one entry with a unique `fileIndex` (0-based).
- Fields: `fileIndex`, `fileType`, `fileUrl`.
- `fileType` is the format extension (`.nutexb`, `.nusktb`, etc.) or `".bin"` for
  non-SSBH binary formats.

### 2.2 SubFileStructure — Pre-Order Serialized Tree

- Three node types: **Folder**, **Item**, **EndMark**.
- Folder opens a scope, EndMark closes it. Items reference SubFileData by `fileIndex`.
- Binary serialization writes these nodes sequentially with no separators.

---

## 3. Invariants That MUST Hold

### 3.1 Item.unk2 — File Type Tag

Every Item node encodes the file's semantic role in `unk2`:

| Extension | unk2 | Meaning |
|-----------|------|---------|
| `.nusktb` | `"10000000"` | Skeleton |
| `.numatb` | `"21000000"` | Material |
| `.numshb` | `"30000000"` | Mesh/shader |
| `.numdlb` | `"40000000"` | Model |
| `.jnttbl` | `"50000000"` | Joint table |
| everything else | `"00000000"` | Default (textures, havok, csv, spbin) |

**Source**: `unk2_for_ext()` at `fhm2d_stage.rs` (~3192); `.nutexb` special
cases go through `unk2_for_file()` (~3500).

### 3.2 Folder.unk3 / unk5 — Folder Type

| unk3 | unk5 | Meaning |
|------|------|---------|
| 0 | 0 | Regular directory |
| 32 | 1 | Texture container (numbered dir with only .nutexb files) |
| 64 | 0 | Shared textures/ directory |

**Rule**: When `unk3 == 32`, `unk5` MUST be `1`. This is enforced automatically
in `RebuildCollector::push_folder()` at `fhm2d_stage.rs` (~3407).

### 3.3 Item.unk3 — Always 0

In game-original data, `Item.unk3` is always `0`, even for shared/deduplicated
textures. The deduplication mechanism uses shared `fileIndex` values, not a flag.

### 3.4 fileType Mapping

SSBH-family extensions keep their original extension as `fileType`.
All other formats map to `".bin"`:

```
.nutexb, .nusktb, .numatb, .numshb, .numdlb,
.nuanmb, .nurpdb, .nushdb, .nufxlb, .nuhlpb,
.nudnbb, .nus3bank  -->  keep as-is

.jnttbl, .hkt, .csv, .spbin, everything else  -->  ".bin"
```

**Source**: `file_type_for_ext()` at `fhm2d_stage.rs` (~3184)

### 3.5 Texture Deduplication

When the same texture filename appears in multiple models' texture containers,
all occurrences share ONE `SubFileData` entry (same `fileIndex`). The first
occurrence's `fileUrl` is used. This is handled by
`RebuildCollector::add_nutexb_dedup()` at `fhm2d_stage.rs` (~3380).

### 3.6 SSBH Model Folder Semantic Ordering

Inside each SSBH model folder (detected by: has `.nusktb` + has texture container
subdirs), items MUST follow this order:

```
1. .nusktb                          -- skeleton FIRST
2. texture_container_0/ (unk3=32)   -- __maya__ textures
   EndMark(1)
3. __maya__.numatb                  -- PAIRED with container_0
4. texture_container_1/ (unk3=32)   -- __nust__ textures
   EndMark(1)
5. __nust__.numatb                  -- PAIRED with container_1
6. .numshb                          -- mesh/shader
7. .numdlb                          -- model
8. .jnttbl                          -- joint table
```

**Key**: Each texture container is immediately followed by its paired `.numatb`.
Container index 0 = `__maya__`, index 1 = `__nust__`.

**Source**: SSBH detection and ordering in `build_exvs_structure_tree()` at
`fhm2d_stage.rs` (~3516), driven by `ExvsBuildOpts` (~3496) and collected via
`RebuildCollector` (~3352). (The former `emit_dir_recursive_inner()` walker
was replaced by this function.)

### 3.7 Content-Level Directory Ordering

At the level where `base/`, `info/`, `sky/` etc. exist, directories follow
a canonical order (not alphabetical):

```
base (0) -> info (1) -> {model dirs sorted alphabetically} (2) -> sky (3) -> textures (4)
```

**Source**: `stage_content_dir_order()` at `fhm2d_stage.rs` (~3484).

---

## 4. Texture Container Detection

A directory is a texture container if and only if:
1. Its name consists entirely of ASCII digits (e.g., `0`, `1`, `23`)
2. It contains ONLY `.nutexb` files (no subdirs, no other extensions)
3. It contains at least one file (empty dirs are skipped)

**Source**: `is_texture_container_dir()` at `fhm2d_stage.rs` (~3159).

**Exception**: An empty texture container (folderCount=0) can still be valid in
the origin data (e.g., sky model with 0 __nust__ textures). The current code
filters these out via `dir_is_empty_recursive`. This matches observed origin
behavior where empty containers are not emitted.

---

## 5. Known Edge Cases

### 5.1 lut_none.nutexb in post_effect/

In origin data, `lut_none.nutexb` inside `info/post_effect/` has
`Item.unk2 = "01010000"` instead of the usual `"00000000"` for textures.
**FIXED**: `unk2_for_file()` detects `.nutexb` files whose parent directory is
`post_effect` and emits `"01010000"`. See `exvs2-effect-special-unk2.md`.

### 5.2 Sky Model with Empty __nust__ Container

Sky models sometimes have zero __nust__ textures, resulting in an empty
texture container. The current code skips empty directories entirely,
which matches origin behavior for this case.

### 5.3 EndMark Collapsing

Origin data uses `EndMark(N)` where N > 1 to close multiple folder levels
at once. Our rebuild emits separate `EndMark(1)` entries. These are
**binary-equivalent**: `EndMark(N)` writes N consecutive `0x0B` bytes,
identical to N separate `EndMark(1)` entries. Verified in the EndMark arm of
`serialize_structure_binary()` at `fhm2d_pack.rs` (fn at ~712; EndMark loop
~753).

### 5.4 Shared Textures Mode

When `include_shared_textures` is true, the rebuild includes a top-level
`textures/` directory (unk3=64) containing deduplicated texture references.
This is the "shared textures" variant used by
`rebuild_structure_from_scratch_with_shared_textures()`.

---

## 6. Validation Checklist

After modifying any rebuild code, verify ALL of the following:

### 6.1 Compilation

```bash
cargo check
```

### 6.2 Post-Change Verification Checklist (Template — Do Not Tick)

This is a reusable checklist to re-run after every rebuild-code change, not a
record of pending work. Copy it into your session notes and verify each point
there; keep the boxes here permanently unticked.

1. Extract a known-good stage (e.g., `0x16F73C97`) to a temp directory
2. Run `rebuild_structure_json_for_stage` on the extracted directory
3. Compare the rebuilt JSON against the origin `_structure.json`
4. Check each category:

- [ ] **Item.unk2**: Every item has the correct type tag per `unk2_for_ext()`
- [ ] **Folder.unk3/unk5**: Texture containers have unk3=32, unk5=1; regular dirs have unk3=0, unk5=0
- [ ] **Item.unk3**: All items have unk3=0
- [ ] **fileType**: `.jnttbl`/`.hkt`/`.csv`/`.spbin` mapped to `.bin`
- [ ] **SSBH ordering**: nusktb first, tex_container+numatb interleaved, numshb/numdlb/jnttbl last
- [ ] **Content dir order**: base -> info -> models -> sky -> textures
- [ ] **Deduplication**: Same texture filename across models shares one fileIndex
- [ ] **folderCount**: Each Folder's count matches its actual number of direct children

---

## 7. Common Mistakes AI Agents Make

1. **Zeroing unk2**: Setting all Item.unk2 to "00000000". Each file type has a
   specific tag — use `unk2_for_ext()`.

2. **Forgetting unk5=1 for texture containers**: When unk3=32, unk5 MUST be 1.
   The `push_folder()` function handles this automatically.

3. **Alphabetical ordering in SSBH folders**: The game expects semantic ordering
   (nusktb first, interleaved tex+numatb pairs). Alphabetical breaks the pairing.

4. **Using unk3=1 for dedup links**: Origin data always uses unk3=0 for items.
   Deduplication works through shared fileIndex, not through a flag.

5. **Keeping actual extension as fileType**: `.jnttbl`, `.hkt`, `.csv`, `.spbin`
   must be mapped to `.bin`. Use `file_type_for_ext()`.

6. **Breaking texture container detection**: A texture container is ONLY a
   digit-named dir with exclusively `.nutexb` files. Adding non-texture files
   or subdirs will break detection.

7. **Emitting texture containers without paired numatb**: Each texture container
   MUST be immediately followed by its corresponding `.numatb` item in the
   structure tree. Container 0 pairs with `__maya__`, container 1 with `__nust__`.

8. **Modifying push_folder without updating serialize_structure_binary**: The
   binary serializer `serialize_structure_binary()` at `fhm2d_pack.rs` (~712)
   writes unk5 at a specific offset. Any new Folder fields must be reflected
   in both the JSON emission and binary serialization.

9. **Assuming EndMark(N) differs from N x EndMark(1)**: They produce identical
   binary output. Do not add special handling for multi-count EndMarks.

---

## 8. Key Source Code Locations

Line numbers are approximate (verified 2026-07-26); search by function name
first — names are stable, line numbers drift.

| Function / Type | File (~Line) | Purpose |
|-----------------|--------------|---------|
| `is_texture_container_dir` | `fhm2d_stage.rs` (~3159) | Detect texture container dirs |
| `file_type_for_ext` | `fhm2d_stage.rs` (~3184) | Map extension to SubFileData.fileType |
| `unk2_for_ext` | `fhm2d_stage.rs` (~3192) | Map extension to Item.unk2 type tag |
| `RebuildCollector` (struct) | `fhm2d_stage.rs` (~3352) | Accumulates SubFileData pool + structure nodes during rebuild |
| `RebuildCollector::add_nutexb_dedup` | `fhm2d_stage.rs` (~3380) | Texture deduplication by filename |
| `RebuildCollector::push_item` / `push_item_ex` | `fhm2d_stage.rs` (~3390 / ~3394) | Emit Item node |
| `RebuildCollector::push_folder` | `fhm2d_stage.rs` (~3407) | Emit Folder node (auto-sets unk5 for unk3=32) |
| `stage_content_dir_order` | `fhm2d_stage.rs` (~3484) | Content-level dir sort order |
| `ExvsBuildOpts` (struct) | `fhm2d_stage.rs` (~3496) | Options controlling the structure tree build |
| `unk2_for_file` | `fhm2d_stage.rs` (~3500) | Per-file unk2 override (e.g. post_effect lut `.nutexb`) |
| `build_exvs_structure_tree` | `fhm2d_stage.rs` (~3516) | Main tree builder (SSBH detection + ordering; replaced the old `emit_dir_recursive_inner` / `emit_texture_container_items` / `emit_file_item` walkers) |
| `rebuild_structure_from_scratch` | `fhm2d_stage.rs` (~3986) | Entry point (per-model textures) |
| `rebuild_structure_from_scratch_with_shared_textures` | `fhm2d_stage.rs` (~4072) | Entry point (shared textures mode) |
| `serialize_structure_binary` | `fhm2d_pack.rs` (~712) | Binary serialization of structure tree |
| `parse_sub_file_structure` | `fhm2d.rs` (~697) | Binary parser (reference for field offsets) |
