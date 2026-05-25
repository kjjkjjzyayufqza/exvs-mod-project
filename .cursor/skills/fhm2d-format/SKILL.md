# FHM2D Binary Format — Pitfalls & Working Guide

## Overview

FHM2D is a compressed archive format used by EXVS2 for bundling stage assets (models,
textures, configs). This skill documents the binary layout, known pitfalls, and the
correct approach for repacking and extracting stage files.

**Source files:**
- `src/format/fhm2d.rs` — extraction (binary → in-memory files)
- `src/format/fhm2d_pack.rs` — repacking (structure JSON → binary)
- `src/format/fhm2d_stage.rs` — stage rename (numbered folders → semantic names)
- `src/format/fhm2d_stage_test.rs` — tests

## Binary Layout

```
┌─────────────────────────────────┐
│  Header (fixed size)            │
├─────────────────────────────────┤
│  Meta Blob (compressed)         │
│  ├── FileTypeData[]             │  ← per-type entry counts
│  ├── PerFileIndexEntries[]      │  ← per-file metadata
│  ├── SubEntryHeaders[]          │  ← per-file offset/size/packed_index
│  └── SubFileStructure (binary)  │  ← tree of Folder/Item/EndMark
├─────────────────────────────────┤
│  Body (file data, 16-byte aligned) │
└─────────────────────────────────┘
```

### SubFileStructure

A flat stream of tagged entries that encodes a tree:

| Tag | Meaning |
|-----|---------|
| `Folder { name }` | Open a directory |
| `Item { fileIndex, ... }` | A file reference inside the current folder |
| `EndMark` | Close the current directory |

`fileIndex` in Items corresponds to the **packed index** (position in the body), NOT the
logical/array index from the structure JSON.

## Pitfall #1: FileIndex Corruption After Type-Sorting

### The Problem

When repacking, files are sorted by `type_id` to match the binary's expected grouping:

```
nutexb(0x0B) → nusktb(0x0C) → numatb(0x0D) → numshb(0x0E) → numdlb(0x0F) → bin(0x00 last)
```

After sorting, the packed index (position in the sorted body) differs from the original
`fileIndex` in the structure JSON. If the SubFileStructure Items and SubEntryHeaders still
reference the **old** indices, extraction will map files to wrong folders.

### The Fix

After building the sorted order, create a remap: `old_logical_index → new_packed_index`.
Apply it to:

1. **SubFileStructure Items** — remap every `Item.fileIndex`
2. **SubEntryHeaders** — write `packed_index` (not `file.file_index`) at offset 0x28

See: `build_file_index_remap()` and `remap_structure_file_indices()` in `fhm2d_pack.rs`.

### Verification

Extract the repacked binary and verify every file's data matches the original by content
hash. The test `repack_round_trip_data_integrity` does this for all 47 files.

## Pitfall #2: Position-Based Folder Naming

### The Problem

Stage extraction renames numbered folders to semantic names: `base`, `info`, `sky`, and
model names inferred from numdlb files. The **wrong** approach is position-based:

```
position 0 → "base"
position 1 → "info"
last position → "sky"
```

This fails because the SubFileStructure tree order is **alphabetical by original folder
name**, not by semantic role. A new model folder named `001stage001_object_box01` sorts
before `base` and `info`, shifting all positions.

### The Fix

Use **content-aware classification** (`classify_content_folders` in `fhm2d_stage.rs`):

| Role | Detection Rule |
|------|---------------|
| **Textures** | folder name matches `textures` (case-insensitive) |
| **Info** | subtree contains **no** `.numdlb` file |
| **Sky** | numdlb model name contains `sky` (fallback: last remaining model folder) |
| **Base** | first model folder after excluding textures/info/sky |
| **Model(name)** | remaining model folders, named by numdlb-inferred model name |

### Key Insight

The SubFileStructure tree order is NOT guaranteed to match any semantic ordering.
**Never** rely on position indices for role assignment. Always inspect file content.

## Pitfall #3: SubEntryHeader Packed Index

The SubEntryHeader at offset `0x28` must contain the **packed index** (position in the
type-sorted body), not the logical file index from the JSON. The extraction code uses
this value to locate file data in the body.

## Type ID Reference

| Extension | Type ID | Sort Priority |
|-----------|---------|---------------|
| .nushdb | 0x0A | ascending |
| .nutexb | 0x0B | ascending |
| .nusktb | 0x0C | ascending |
| .numatb | 0x0D | ascending |
| .numshb | 0x0E | ascending |
| .numdlb | 0x0F | ascending |
| .nuanmb | 0x11 | middle (descending slot) |
| .nuhlpb | 0x13 | ascending |
| .nus3bank | 0x14 | ascending |
| .nudnbb | 0x17 | ascending |
| .nufxlb | 0x18 | ascending |
| .nurpdb | 0x19 | ascending |
| .bin/.hkt/.csv/other | 0x00 | last |

## Checklist: Adding New Model Files to a Stage

When adding a complete SSBH model (numatb + numshb + numdlb + nusktb + ...) to an
existing fhm2d:

- [ ] Add entries to `SubFileData[]` in the structure JSON with sequential `fileIndex`
- [ ] Add corresponding `SubFileStructure` tree entries (Folder/Item/EndMark)
- [ ] Ensure Item `fileIndex` values match `SubFileData` array indices
- [ ] Repack with `repack_fhm2d_from_structure` — it handles type-sorting + remapping
- [ ] Verify extraction round-trip: all files match by content hash
- [ ] Verify stage rename: `base`, `info`, `sky` are correctly identified by content

## Checklist: Modifying Stage Rename Logic

When changing folder classification or rename behavior:

- [ ] Never use position/index for role assignment
- [ ] Identify info by absence of numdlb (it contains config files: CSV, HKT, SPBIN)
- [ ] Identify sky by numdlb model name pattern (contains "sky")
- [ ] Identify base as the first model folder (after excluding info/sky/textures)
- [ ] Run `repack_then_extract_folder_tree_is_correct` test
- [ ] Run full `cargo test` to verify no regressions in the 190+ existing tests
- [ ] Test with the real fhm2d binary at `E:\XB\解包\com\test\` if available

## Test Infrastructure

Key test constants:
- `TEST_DATA_ROOT = r"E:\XB\解包\com\test"` — real fhm2d test data
- `0x16F73C97_structure.json` — structure JSON for the test fhm2d
- `0x16F73C97.fhm2d` — original binary for comparison

Key tests:
- `repack_then_extract_folder_tree_is_correct` — repack from JSON, extract, verify tree names
- `repack_round_trip_data_integrity` — verify all files match by content after round-trip
