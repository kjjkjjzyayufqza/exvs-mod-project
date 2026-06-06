# FHM2D Pack Performance Process

## Context

User asked whether the current Rust FHM2D repack path can be made faster for very large files, around 1 GB, where data is split into roughly 64 KiB deflate pages.

## Sources Read

- `AGENTS.md`
- `.cursor/rules/custom-rules.mdc`
- `.cursor/skills/fhm2d-format/SKILL.md`
- `.cursor/skills/tauri-ipc-large-binary/SKILL.md`
- `docs/checklist/repack-stage-fhm2d-checklist.md`
- Relevant Rust symbols in `src-tauri/src/format/fhm2d_pack.rs`
- Matching decode logic in `src-tauri/src/format/fhm2d.rs`

## Findings

- Repack command entry is `stage_commands::repack_fhm2d`, which runs `fhm2d_pack::repack_fhm2d_from_structure` inside `spawn_blocking`.
- Current pack pipeline:
  - Read `_structure.json`.
  - For each `SubFileData` entry, read the entire file with `fs::read`.
  - Compress each file through `compress_file_body`.
  - Sort files by type and concatenate all compressed bodies into one `body_data` buffer.
  - Build metadata, raw-deflate-compress metadata, assemble one final `output_bytes` buffer.
  - Write the entire final buffer using `fs::write`.
- `PAGE_SIZE` is `0x10000` bytes, i.e. 65,536 bytes. The user's 65,535 observation is likely the internal maximum deflate stored-block payload size, not this code's page size.
- Decode side also uses `PAGE_SIZE = 0x10000`, bitmap flags, and a compressed-size table. Changing page size would require format compatibility validation.
- Main performance risks for 1 GB input:
  - Single-threaded compression loop.
  - Full-file reads into memory.
  - Multiple full-size memory copies: source file bytes, compressed per-file body, concatenated body, final output.
  - `flate2::Compression::default()` may spend CPU on pages that are already compressed assets such as `.nutexb`, `.numshb`, `.nus3bank`, `.hkt`.

## Candidate Optimizations

1. Parallelize independent file/page compression with `rayon`.
2. Add a fast compression profile using `Compression::fast()` or level 1.
3. Skip compression for file types known to already be compressed, if game/runtime accepts raw pages for those files.
4. Stream output writing instead of assembling one giant `output_bytes` buffer.
5. Stream large file reads page-by-page instead of `fs::read` for the whole file.
6. Consider a faster raw deflate backend, but only after benchmark and compatibility tests.

## Verification Needed For Code Changes

- `cargo test -p tauri-app format::fhm2d_pack`
- Real archive repack then extract round-trip.
- Check that raw/uncompressed pages and chunk tables are still accepted by the game.
