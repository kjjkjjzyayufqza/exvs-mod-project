# Scene Open: Binary Mesh Geometry

- [x] Confirm root cause with evidence (337 MB mesh → serde_json::Value → multi-GB JSON IPC).
- [x] Rust: `ssbh_mesh_binary.rs` — header types + `pack_mesh_geometry` + unit tests. 3/3 pass.
- [x] Rust: process-global geometry registry (`register/take/clear`) + `pack_and_register`.
- [x] Rust: switch all 4 mesh `Value` producers to `pack_and_register` (light header + blob id).
- [x] Rust: commands `take_mesh_geometry` (raw `Response` bytes) + `clear_mesh_geometry_registry`; registered in lib.rs.
- [x] Frontend: `types.ts` — binary header + `MeshBinaryObjectViews` + `__bin` runtime field.
- [x] Frontend: `meshFromSsbh.ts` — `buildGeometryForObject` reads typed-array views; inline fallback kept.
- [x] Frontend: `meshGeometryHydrate.ts` — fetch blob + attach `__bin`; wired into `applyBundle`,
      `resetState` (clear), and `SsbhModelPreviewContext.buildInstancesFromBundles`.
- [x] ③ (partial): defensive re-entrant-open guard in `handleOpenFolder` (true trigger needs live confirm).
- [x] Verify: cargo `ssbh_mesh_binary` 3/3 + lib compiles; vitest meshFromSsbh 10/10; tsc 0 errors.
- [ ] ② open-folder uses `stageStreamBundles` (base first, sub-models streamed). Needs the stream
      command to also carry placement/graphic-params (or pre-load skeleton) + live-app validation.
- [ ] Manual: open `0x16F73C97` in the running app and confirm no crash + new_model renders.
- [ ] Follow-up: `SceneDetailViewWindow` MeshReadonlyTab shows no arrays for binary mesh (display-only).
- [ ] Follow-up perf: only positions/normals/uv0/uv1/indices are packed (tangents/colorsets dropped from
      preview geometry — matches what the renderer used anyway).

## Notes

- Big-bang: ALL bundles now emit binary headers; `__bin` rides on the shared mesh-object refs so
  MapViewport's `buildDrawListFromBundle` sites need no change (hydrated in `applyBundle`).
- `mesh.binary` flag still selects binary vs legacy inline path (legacy kept for unit tests).
- Geometry blobs are freed on `take_mesh_geometry`; `resetState` clears leftovers before each open.
