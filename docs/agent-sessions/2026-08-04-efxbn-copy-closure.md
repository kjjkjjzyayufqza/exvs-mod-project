# EFXBN source-local copy closure

## Goal

Fix Test Editor effect copy so selecting an EFXBN copies only resources used by
that EFXBN and present in the source effect pack. Resources resolved by EXVS2
from global pools are intentionally ignored.

## Architecture evidence

- Header: `0x20` bytes, followed by `effectCount * 0x370` effect blocks.
- Control lookup starts at `0x20 + effectCount * 0x370 - 8`; each entry is a
  `(key f32 bits, value f32 bits)` qword.
- The legacy `idTable` at effect-meta `0x50..0xCF` is actually
  `controlReferences[0..15]`. Together with pairs at `0x1C4` and `0x1CC`, the
  runtime resolves 18 `(selector, lookupIndex/value)` curve references.
- Resource filename-stem IEEE CRC32 fields are model ID at `meta+0x138`,
  animation ID at `meta+0x288`, and texture ID at model-control `+0x04`.
- A copied model brings its complete model folder. Its NUMATB texture names are
  hashed and matched against source-pack NUTEXB items.

## Fixed behavior

- Removed the false `control reference id -> FHM2D fileIndex` expansion that
  produced oversized dependency/file lists.
- Removed false `EFXBN item hash -> texture` and `modelId -> texture` links.
- Added source-local `animationId -> .nuanmb` matching.
- Added source-local copied-model `NUMATB -> .nutexb` matching.
- Missing model, animation, or texture hashes are treated as global resources
  and do not generate copy-plan warnings.
- Frontend preview and Rust backend now use the same dependency rules.

## Verification

- Real fixture:
  `E:\XB\mod\006effect\053gbftry_005tsient_001\0\0\167.efxbn`.
- End-to-end test copies the selected entry to an auto-cleaned temporary target,
  re-inspects the target, compares source-local model/texture/animation counts,
  and confirms the source EFXBN bytes remain unchanged.
- Passed:
  `cargo test --manifest-path src-tauri/Cargo.toml --test effect_folder_real_data_test -- --nocapture`
  (`1 passed`). For `167.efxbn`, no matching source-local model, texture, or
  animation exists, so the correct copy set contains the one selected EFXBN.

## UI reduction

- Summary shows selected/files plus nonzero dependency categories only.
- Removed visible source/structure repetition, inferred structure path, Debug
  tab, How-it-works block, long behavior notes, entry paths/reasons, and file
  table paths.
- Empty dependency sections are hidden.
