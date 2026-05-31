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

## 2026-05-31 Texture Folder Regression

- [x] Identify which Scene Editor operation deletes shared `textures/` and recreates per-model texture folders.
- [x] Make Save as FHM2D pack from an isolated temporary workspace so the source stage folder remains in shared-textures layout.
- [x] Preserve existing repack structure JSON logic inside the isolated workspace.
- [x] Add/adjust verification covering original on-disk layout preservation.
- [x] Record commands and outcomes in `process.md`.

