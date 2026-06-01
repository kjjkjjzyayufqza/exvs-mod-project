# Scene Import IPC Memory

- [x] Read project rules and relevant Scene Editor IPC/import docs.
- [x] Trace static mesh import conversion and preview IPC paths.
- [x] Store path-based imports and converted SSBH artifacts outside frontend IPC.
- [x] Prevent non-preview SSBH conversion from requesting large preview bundles.
- [x] Add focused regression coverage.
- [x] Run narrow Rust/TypeScript verification and record results.
- [x] Keep Three.js source mesh preview visible when large SSBH artifact preview IPC is skipped.
- [x] Add heavy HKT simplification target decimation for curved meshes.

## Remaining

- Optional next step: stream `scene_save_as_folder` writes directly from path-backed artifacts instead of materializing a temporary `SaveArtifact` vector during save.
