# Plan: FHM2D Stage Structure Rebuild Accuracy

**Source**: `src/format/example/stage_structure_diff.md` (detailed comparison)
**Complexity**: Large
**System**: EXVS2 MBON Stage FHM2D — the archive format used by the game to pack stage assets

## Summary

The `rebuild_structure_from_scratch` pipeline produces structure JSON that differs from game-original files in 6 material ways. Fixing these ensures repacked `.fhm2d` archives behave identically to the originals at runtime. A secondary deliverable is a definitive reference document so future AI agents never have to rediscover these rules.

## Context: Why This Matters

EXVS2 MBON loads stage data from `.fhm2d` archives. The runtime parser is strict about binary layout. Our tool's purpose is to let modders **extract → edit → repack** without data corruption. If unk fields, item ordering, or deduplication are wrong, the game will either crash, render incorrectly, or silently ignore textures. Every field in the structure has a reason — we just haven't fully reverse-engineered some of them yet, so **matching the original output exactly** is the safest approach.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Folder emission | `fhm2d_stage.rs:3231` | `push_folder(count, unk3)` — needs unk5 param |
| Item emission | `fhm2d_stage.rs:3218` | `push_item_ex(idx, unk2, unk3)` — unk2 is already a param |
| Binary serialization | `fhm2d_pack.rs:582-631` | `serialize_structure_binary` writes all unk fields to binary — unk5 is written at offset for Folder |
| EndMark serialization | `fhm2d_pack.rs:623-627` | `EndMark(N)` loops N times writing 0x0B — so EndMark(3) = 3x EndMark(1) **binary-equivalent** |
| Extension handling | `fhm2d_stage.rs:2964` | `ext_of()` returns actual extension; `unk2_for_ext()` at line 3023 is a stub returning "00000000" |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/format/fhm2d_stage.rs` | UPDATE | Fix unk2, unk5, item ordering, fileType mapping |
| `src/format/example/stage_structure_diff.md` | UPDATE | Mark resolved items after fixes |
| `src/format/example/stage_unk_reference.md` | CREATE | Definitive unk field reference for AI agents |
| `src/format/example/stage_rebuild_rules.md` | CREATE | Rebuild pipeline rules / checklist for AI agents |

---

## Tasks

### Task 1: Fix `unk2_for_ext()` — Item type tag (CRITICAL)

**What:** Replace the stub at `fhm2d_stage.rs:3023` with correct extension-to-unk2 mapping.

**Mapping (from origin analysis):**

| Extension | unk2 | Semantics |
|-----------|------|-----------|
| `.nusktb` | `"10000000"` | Skeleton |
| `.numatb` | `"21000000"` | Material |
| `.numshb` | `"30000000"` | Mesh/shader |
| `.numdlb` | `"40000000"` | Model |
| `.jnttbl` | `"50000000"` | Joint table |
| `.nutexb` | `"00000000"` | Texture (default) |
| `.hkt` | `"00000000"` | Havok physics |
| `.csv` | `"00000000"` | Param CSV |
| `.spbin` | `"00000000"` | Special binary |
| everything else | `"00000000"` | Default |

**Edge case:** `lut_none.nutexb` in `info/post_effect/` has unk2=`"01010000"`. This may be a folder-context-dependent rule (post_effect textures get a different tag). Needs more samples to confirm — for now, use `"00000000"` for all `.nutexb` and leave a note.

**Validate:** Rebuild the test stage, compare Item unk2 values against origin.

---

### Task 2: Fix `push_folder` unk5 for texture containers (HIGH)

**What:** When emitting a texture container folder (`unk3=32`), set `unk5=1`.

**Options (pick one):**

- **Option A:** Add `push_folder_with_unk5(count, unk3, unk5)` method to `RebuildCollector`
- **Option B:** Modify `push_folder` to auto-set `unk5=1` when `unk3==32`

Option B is simpler and matches the invariant: in all observed data, `unk3=32` always pairs with `unk5=1`.

**Where:** `fhm2d_stage.rs:3231-3242` (push_folder) and `fhm2d_stage.rs:3380` (call site in emit_dir_recursive_inner)

**Validate:** Check that all Folder entries with unk3=32 in the rebuilt JSON have unk5=1.

---

### Task 3: Fix SSBH model folder item ordering (HIGH)

**What:** Inside each model's SSBH folder, items must follow the game's semantic order instead of alphabetical sort.

**Origin order inside an SSBH model folder:**

```
1. .nusktb                          ← skeleton FIRST
2. texture_container_0/ (unk3=32)   ← __maya__ textures
   EndMark
3. __maya__.numatb                  ← PAIRED with texture_container_0
4. texture_container_1/ (unk3=32)   ← __nust__ textures
   EndMark
5. __nust__.numatb                  ← PAIRED with texture_container_1
6. .numshb                          ← mesh/shader
7. .numdlb                          ← model
8. .jnttbl                          ← joint table
```

**Key insight:** The texture containers and their numatb files are **interleaved** — each container is immediately followed by its corresponding material. The container's index (0=maya, 1=nust) determines which numatb it pairs with.

**Where:** `emit_dir_recursive_inner` at `fhm2d_stage.rs:3313-3422`. Currently processes all subdirs first (line 3377-3402), then all files (line 3405-3417). Need to detect SSBH folders and apply semantic ordering.

**Detection heuristic for "this is an SSBH model folder":** Contains at least one `.nusktb` file AND at least one texture container subdir.

**Implementation sketch:**

```
if is_ssbh_model_folder(dir):
    emit nusktb first
    for each texture_container (sorted by name "0", "1", ...):
        emit texture_container folder + items + EndMark
        emit corresponding numatb (match container index to __maya__/__nust__)
    emit remaining files in order: numshb, numdlb, jnttbl, others
else:
    current alphabetical behavior
```

**Validate:** Compare tree topology of rebuilt structure against origin for the same stage.

---

### Task 4: Fix fileType for binary-classified extensions (MEDIUM)

**What:** Map `.jnttbl`, `.hkt`, `.csv`, `.spbin` to `".bin"` in `RebuildSubFileData.file_type`.

**Where:** `rebuild_structure_from_scratch` at `fhm2d_stage.rs:3498-3517`, where `RebuildSubFileData` is constructed. The `ext.clone()` should go through a mapping function.

**New function:**

```rust
fn file_type_for_ext(ext: &str) -> String {
    match ext {
        ".jnttbl" | ".hkt" | ".csv" | ".spbin" => ".bin".to_string(),
        other => other.to_string(),
    }
}
```

**Validate:** Check that rebuilt JSON SubFileData entries match origin fileType values.

---

### Task 5: Reconsider Item.unk3 for dedup links (MEDIUM)

**What:** The origin file uses `unk3=0` for ALL items, even shared textures. Our code sets `unk3=1` for deduplicated references. Need to decide whether to keep or remove this.

**Analysis:**
- Origin (game-extracted): `unk3=0` always
- Our rebuild (with dedup): `unk3=1` for link items
- Risk: Unknown. The game might ignore unk3, or it might behave differently for unk3=1 items.

**Decision:** **Set unk3=0 for all items to match the origin.** This is the safest approach. The dedup feature (sharing fileIndex) already works correctly without the unk3 flag — the flag is redundant since the shared fileIndex IS the reference mechanism.

**Where:** `fhm2d_stage.rs:3396` — change `if is_link { 1 } else { 0 }` to just `0`.

**Validate:** Check that all Items in rebuilt JSON have unk3=0.

---

### Task 6: Create `stage_unk_reference.md` (DOCUMENTATION)

**What:** Definitive reference document for ALL unk fields in the FHM2D stage structure. Written for AI agents who will work on this codebase in the future.

**Location:** `src/format/example/stage_unk_reference.md`

**Must include:**
- Byte-level binary layout for each node type (Folder, Item, EndMark)
- Complete unk field value tables with semantic meanings
- Texture container detection rules
- SSBH model folder detection rules and item ordering
- fileType mapping rules
- Cross-references to Rust source code locations
- "Common mistakes" section listing pitfalls AI agents tend to make

---

### Task 7: Create `stage_rebuild_rules.md` (DOCUMENTATION)

**What:** Step-by-step rules and checklist for the rebuild pipeline. This is the "READ THIS BEFORE MODIFYING REBUILD CODE" document.

**Location:** `src/format/example/stage_rebuild_rules.md`

**Must include:**
- The full pipeline: extract → rename → edit → redistribute → rebuild → repack
- Invariants that MUST hold (dedup, ordering, unk values)
- Checklist for validating a rebuilt structure against an origin
- Known edge cases (empty texture containers, lut_none unk2, sky with 0 nust textures)
- "If you're changing rebuild code, verify these N things"

---

## Execution Order

```
Task 1 (unk2_for_ext)           ← no dependencies, highest impact
Task 2 (push_folder unk5)       ← no dependencies, simple fix
Task 4 (fileType mapping)       ← no dependencies, simple fix
Task 5 (Item.unk3 decision)     ← no dependencies, simple fix
Task 3 (SSBH item ordering)     ← most complex, do after 1-2-4-5
  cargo check                   ← verify all code changes compile
Task 6 (stage_unk_reference.md) ← write after code is correct
Task 7 (stage_rebuild_rules.md) ← write after code is correct
```

Tasks 1, 2, 4, 5 are independent and can be done in parallel.
Task 3 depends on Task 1 (needs correct unk2 values for ordering logic).
Tasks 6, 7 should be written last so they reflect the final code state.

## Validation

```bash
# After all code changes:
cargo check

# Manual validation (compare rebuilt vs origin):
# 1. Extract test stage to temp dir
# 2. Run rebuild_structure_json_for_stage
# 3. Diff SubFileStructure entries against origin
# 4. Check: all Folder unk5 correct, all Item unk2 correct, ordering matches
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| unk2 mapping incomplete (extensions we haven't seen) | Medium | Use "00000000" as default fallback; add logging for unknown extensions |
| SSBH ordering breaks non-standard stages | Low | Only apply semantic ordering when SSBH pattern is detected; fall back to alphabetical |
| lut_none unk2="01010000" is context-dependent | Medium | Document as known edge case; implement if more samples confirm the pattern |
| Item.unk3=1 is actually needed for some game behavior | Low | Default to 0 (matches origin); keep `push_item_ex` so unk3 can be set if needed later |
| EndMark count>1 matters for some parser | Very Low | Binary output is identical (verified in serialize_structure_binary) |

## Acceptance

- [ ] `unk2_for_ext()` returns correct type-specific values
- [ ] Texture container folders have `unk5=1`
- [ ] SSBH model folders emit items in semantic order (nusktb → tex+numatb pairs → numshb → numdlb → jnttbl)
- [ ] fileType maps `.jnttbl`/`.hkt`/`.csv`/`.spbin` to `.bin`
- [ ] All Item.unk3 = 0 (matching origin behavior)
- [ ] `cargo check` passes
- [ ] `stage_unk_reference.md` created with complete unk field documentation
- [ ] `stage_rebuild_rules.md` created with rebuild pipeline rules and checklist
- [ ] Rebuilt structure for test stage matches origin on all unk fields
