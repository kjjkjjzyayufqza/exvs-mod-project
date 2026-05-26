# EXVS2 FHM2D Structure Rebuild — Pitfalls & Fixes

> **Critical lessons from debugging game crashes caused by incorrect structure rebuilds.**
> Every byte matters. The game runtime parses the SubFileStructure binary
> sequentially; a single extra or missing `0x0B` byte shifts all subsequent
> offsets and causes immediate crashes.

---

## Pitfall 1: Empty Texture Container Directories

**Symptom**: Game crashes on stage load.

**Root cause**: Sky model has a `__nust__` material with 0 textures. The
`1/` directory exists on disk but is empty. The rebuild code filtered it out
via `dir_is_empty_recursive` and `is_texture_container_dir` (which required
at least 1 file), so:
- `folderCount` was 7 instead of 8
- The empty `Folder(0, unk3=32, unk5=1)` + EndMark was missing
- The paired `__nust__.numatb` item was missing

**Fix**:
- `is_texture_container_dir`: Allow empty directories (remove `any_file` check).
  EXVS uses empty texture containers for materials with no textures.
- `build_exvs_directory`: Skip `dir_is_empty_recursive` filtering for digit-named
  directories (potential texture containers). Let them through even when empty.

**Rule**: EXVS **always** requires exactly 2 texture containers per SSBH model
(`0/` for `__maya__`, `1/` for `__nust__`), even when one has 0 textures.

---

## Pitfall 2: info/post_effect Position

**Symptom**: Structure topology mismatch → offset errors → crash.

**Root cause**: The `post_effect/` sub-folder inside `info/` was emitted before
the loose files (`border_hit.hkt`, `placement.csv`, etc.) because the generic
directory handler puts all sub-folders first. In the game-original format,
`post_effect/` is always the **last** child of `info/`.

**Fix**: In `build_exvs_directory`, when processing `info/` (or its known
sub-folder names), partition directories: emit `fog/` and `light/` first,
then loose files, then `post_effect/` last.

**Rule**: EXVS info/ layout is: `fog/ → light/ → [loose files] → post_effect/`
(post_effect is always last, closed together with info by a merged EndMark).

---

## Pitfall 3: post_effect lut_none.nutexb unk2

**Symptom**: Post-processing effects broken (LUT texture not found).

**Root cause**: All `.nutexb` files got `Item.unk2 = "00000000"`, but
`lut_none.nutexb` inside `info/post_effect/` requires `"01010000"`.

**Fix**: `unk2_for_file()` checks parent directory name. If parent is
`post_effect` and extension is `.nutexb`, return `"01010000"`.

**Rule**: EXVS marks post-effect textures with `unk2 = "01010000"`.

---

## Pitfall 4: Trailing Empty Folder at Root

**Symptom**: Metadata size mismatch → crash.

**Root cause**: Game-original archives have a trailing `Folder(count=0)`
after the content tree, closed by `EndMark(1)`. The rebuild didn't emit it.

**Fix**: `build_exvs_structure_tree` appends `Folder(0) + EndMark(1)` after
the main tree, and patches the first Folder's `folderCount += 1`.

**Rule**: EXVS root structure is always `Folder(N+1) [content...] Folder(0) EndMark(1)`.
The trailing empty folder must exist. Only 1 EndMark closes it (not 2).

---

## Pitfall 5: SSBH Detection Without Texture Containers

**Symptom**: Sky model items emitted in wrong order (alphabetical instead of
SSBH canonical), causing fileIndex offset mismatch.

**Root cause**: `is_ssbh_folder` required both `.nusktb` AND non-empty
texture container directories. Sky model after `redistribute_stage_textures`
has no texture container dirs on disk (textures remain in shared `textures/`
folder), so it was treated as a generic directory.

**Fix**: Detect SSBH also when `.nusktb` + `.numatb` are present (even without
texture container dirs): `has_nusktb && (!tex_container_dirs.is_empty() || has_numatb)`.

**Rule**: A directory is SSBH if it has `.nusktb` AND (texture container dirs
OR `.numatb` files).

---

## Pitfall 6: EndMark Count at Root Level

**Symptom**: 1 extra `0x0B` byte in structure binary → all subsequent file
offsets shifted by 1 → crash.

**Root cause**: `build_exvs_structure_tree` used `push_end(2)` after the
trailing `Folder(0)`, but `build_exvs_directory` at depth=1 already emits
its own EndMark when returning. The extra EndMark produced 1 surplus `0x0B`.

**Fix**: Use `push_end(1)` — only close the empty Folder itself. The content
Folder (depth=1) is already self-closing via the recursive `push_end(1)`.

**Rule**: Count EndMarks carefully. `build_exvs_directory` manages its own
open/close at each depth. External code should never double-close.

---

## Verification Checklist

After any rebuild code change, compare the output metadata binary against
a known-good origin:

1. **Size must match exactly** — even 1 byte difference = crash
2. **Extract and diff**: Use `zlib.decompressobj(-15)` on the metadata region
   (offset 0x30, length from offset 0x20) and compare byte-for-byte
3. **Remaining diffs should only be**: fileIndex values inside texture containers
   (ordering from SubFileData pool, acceptable — game reads by fileIndex not position)
4. **Re-extract the repacked fhm2d** and verify file contents match originals


---

## Pitfall 7: Trailing Empty Folder Position (Inside vs Outside)

**Symptom**: info/ folder contents not loaded by game.

**Root cause**: The trailing `Folder(count=0)` was appended at the **root level**
(as a sibling of the outer wrapper Folder), but in the game-original format it
must be **inside** the outer wrapper (as its second child).

Origin structure:
```
0x16F73C97/
  └─ 0/              ← outer wrapper Folder(count=2)
      ├─ 0/          ← content Folder(count=4) with base/info/models/sky
      └─ 1/          ← empty trailing Folder(count=0) — INSIDE wrapper
```

Wrong (our initial impl):
```
0x16F73C97/
  ├─ 0/              ← outer wrapper Folder(count=1)
  │   └─ 0/          ← content
  └─ 1/              ← empty Folder — OUTSIDE wrapper (wrong!)
```

**Fix**: Insert `Folder(0) + EndMark(1)` at `c.structure.len() - 1` (before the
wrapper's closing EndMark), not at the end. Then patch the wrapper's folderCount += 1.

**Rule**: The trailing empty Folder is always a child of the outermost wrapper,
not a root-level sibling.

---

## Pitfall 8: info/ Loose File Order (placement before graphic_param)

**Symptom**: Game reads wrong CSV data for graphic parameters (gets placement
data instead, or vice versa).

**Root cause**: `collect_sorted_entries` sorts files alphabetically, producing
`border_hit → graphic_param → placement → plan_param`. But EXVS expects the
fixed order: `border_hit → placement → graphic_param → plan_param`.

**Fix**: Added `info_file_order()` sort function that assigns explicit priority:
```
border_hit = 0
placement = 1
graphic_param = 2
plan_param = 3
everything else = 4 (alphabetical)
```

Applied only when the current directory is detected as `info/`.

**Rule**: EXVS info/ file order is hardcoded in the game runtime. The game reads
files positionally (file at position 1 = placement, position 2 = graphic_param).
Alphabetical ordering will swap these and break stage loading.

---

## Pitfall 9: graphic_param.csv Empty Line Preservation

**Symptom**: Repacked graphic_param.csv is 2 bytes shorter than original.
Game may misparse parameters after the missing separator.

**Root cause**: `parse_graphic_param_csv` filtered out empty lines with
`.filter(|line| !line.trim().is_empty())`. The original CSV has an empty line
at row 86 used as a section separator. When saving, only key-value pairs were
written back, losing the empty line.

**Fix**:
- Rust parser: Preserve empty lines as `GraphicParamEntry { key: "", value: "" }`
- TS save: Output empty string (not `","`) for entries where both key and value
  are empty

**Rule**: Preserve CSV files byte-for-byte when possible. Empty lines and
trailing whitespace may have meaning in the game's parser. Never filter or
trim content from configuration files without explicit justification.
