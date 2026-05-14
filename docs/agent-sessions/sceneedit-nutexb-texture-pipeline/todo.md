# SceneEdit Nutexb Texture Pipeline

## Goal

Apply `.nutexb` textures to SceneEdit models with the same end-to-end behavior as TestEditor, including cache behavior for duplicate textures.

## Tasks

- [x] Confirm architecture decisions with user via grill flow.
- [ ] Reuse TestEditor texture decode/caching pipeline in SceneEdit.
- [ ] Ensure memory-stage bundles use TestEditor-compatible source metadata (`sourceKind: "memory"`, `sourceSessionId`).
- [ ] Ensure disk-stage bundles continue to work with the unified texture pipeline.
- [ ] Add SceneEdit texture decode progress UI (`Decoding unique textures x/y`).
- [ ] Verify duplicate texture cache hits across models.
- [ ] Run `cargo check` and frontend lint checks on changed files.

