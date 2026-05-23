# FHM2D FileIndex Debug Todo

- [x] Read repository agent rules and Cursor project rules.
- [x] Search and read relevant SceneEdit/FHM2D save/import documentation.
- [x] Load systematic debugging and Rust testing guidance.
- [x] Map the Rust FHM2D extract/pack and Scene Editor save code paths.
- [x] Inspect the `E:\XB\解包\com\test` data layout for `16F73C97`.
- [x] Add a focused Rust regression test that round-trips `16F73C97` and checks `fileIndex` preservation.
- [x] Reproduce the current failure before changing production code.
- [x] Trace where `fileIndex` is dropped during pack/save.
- [x] Implement the smallest fix at the source of the loss.
- [x] Verify the regression test passes and no focused Rust checks regress.
