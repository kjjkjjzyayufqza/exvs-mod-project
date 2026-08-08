# EFXBN Magic and Offline Render Session

## Goal

Make Effect Folder preview and copy robust on real extracted packs, explain recurring
EFXBN magic failures, and validate effect appearance without starting Tauri by using
headless Blender plus native IDA/HLSL evidence.

## Confirmed Findings

- `E:\XB\mod\006effect` currently contains 482 files. Of 135 files named
  `.efxbn`, exactly one does not start with `EFXB`:
  `053gbftry_005tsient_001\0\0\129.efxbn`.
- A separate header-only scan of all 4,201 `.efxbn` files under the official
  `E:\XB\解包\vs2\x64\006effect` tree found zero invalid magic values. This
  isolates the failure to extraction/naming metadata rather than an alternate
  game EFXBN magic or widespread binary corruption.
- File 129 is not corrupt. It is an SSBH motion container: outer magic `HBSS`,
  inner FourCC `MINA` at `0x10`, with internal name
  `eff_053gbftry_005tsient_001_whitetiger_001.nuanmb` at `0x50`.
- Its structure hash is `515998570`; effects 18 and 20 in `201.efxbn` reference
  that animation ID. Content-aware inventory therefore fixes both the magic
  warning and a previously missing copy dependency.
- The extractor caused the misclassification: effect naming renamed every shallow
  `.bin` beside numbered model groups to `.efxbn` without inspecting bytes.
- Effect extraction now names shallow resources from binary signatures:
  `EFXB -> .efxbn`, `HBSS/MINA -> .nuanmb`, and unknown payloads stay `.bin`.
- A repack audit found that changing the structure `fileType` to `.nuanmb` would
  incorrectly change original FHM2D type `0` to `0x11`. The extractor now changes
  only the extracted URL/base name for MINA while preserving `fileType=.bin`, so
  extract -> repack keeps the native type metadata.
- Existing extracted packs are repaired logically at inventory time by reading
  only the first `0x14` bytes of declared EFXBN/NUANMB candidates. The original
  files and structure JSON remain untouched.

## Verification

- `cargo test --lib format::fhm2d::tests::effect_shallow_resources_are_named_from_magic -- --exact`
  passed after the repack-preservation correction: 1 test, 462 filtered out. The
  test also proves an `HBSS/LDOM` payload is not over-classified as NUANMB.
- The first attempt exposed an unrelated stale `AnimData` test initializer. Adding
  its already-required `name: None` field restored the narrow test gate.
- `cargo test --test effect_folder_real_data_test classifies_mislabeled_nuanmb_by_magic_for_animation_closure -- --exact --nocapture`
  passed and proves the `201.efxbn -> fileIndex 129` animation copy closure.

## Native Loader Cross-check

- `sub_1401218B0 -> sub_14011E5F0` opens the effect FHM2D. The loader validates
  `B9 B7 B2 CD`, expands raw-deflate chunks when needed, and builds 56-byte
  content records.
- `sub_1408E5EB0 -> sub_1408EF9E0` selects segment 1. Only leaf records whose
  runtime type at `+0x18` is zero pass their payload pointer at record `+0x00`
  to `sub_14016BBD0`; an FHM2D header, compressed chunk, or content record is
  not an EFXBN payload.
- Native EFXBN bytes are strictly `45 46 58 42` (`EFXB`). No byte-swapped or
  alternate magic path exists in the observed loader. `sub_140145DF0` consumes
  the already-selected payload and copies each `0x370` disk block into a
  `0x410` runtime slot before `sub_1401470F0` derives the feature mask at
  runtime `+0x390`.
- `sub_140188E30` chooses Face versus Model from runtime type and factors
  AddMix, ColorEx, Light, MultiUV, Soft, and HLight shader names from that mask.
- Fresh IDA plus the Rust writer/parser independently confirm the FHM2D header:
  format at `+0x08`, file size at `+0x10`, uncompressed/compressed sizes at
  `+0x18/+0x20`, and meta body at `+0x30`. The older research note was corrected;
  the Rust parser did not have this offset bug.

## Offline Render

- `167.efxbn` was parsed through the application backend and current TypeScript
  simulation, then rendered headlessly in Blender 5.1 without starting Tauri.
- Automatically selected frame 23 contains 91 live particles: block pair `0 -> 1`
  contributes 55 and `2 -> 3` contributes 36. The PNG is visibly non-empty.
- This source-local selection correctly has zero models and zero textures. Both
  referenced texture hashes are unresolved external/global assets, so the offline
  renderer uses a neutral blue-white billboard fallback rather than pretending the
  source pack contains transferable files.
- Artifact: `tmp/efxbn-render/167-real/preview.png` and matching `preview.blend`.

## In Progress

- Native shader/physics review and OB Wiki appearance comparison.
- Preview safety/diagnostic fixes.
- Independent final reverse-skill audit after implementation.
