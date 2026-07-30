# FHM2D Pack Performance

## Status

- [x] Read project rules and FHM2D documentation.
- [x] Locate Rust repack entry points and compression implementation.
- [x] Confirm page size and metadata format coupling.
- [x] Summarize practical speed-up options for the user.

## Next Actions

- [x] If implementation is requested, prototype parallel per-file compression first.
  - done: rayon `into_par_iter` page-parallel deflate at
    `src-tauri/src/format/fhm2d_pack.rs:384-391` (commit bb446ab)
- [ ] Add a benchmark using a large synthetic or real FHM2D payload before changing compression settings.
  - note: still open — no `benches/` or criterion setup exists yet; a timing
    CLI matching the `src-tauri/src/bin/unit_model_repack_roundtrip.rs` style
    would satisfy this
- [x] Verify repacked archives by extraction round-trip after any packer change.
  - done: repack-then-re-extract tests in
    `src-tauri/src/format/fhm2d_stage_test.rs`
    (`test_full_repack_roundtrip_16f73c97`: extract -> repack -> re-extract ->
    verify) plus the `src-tauri/src/bin/unit_model_repack_roundtrip.rs` CLI
