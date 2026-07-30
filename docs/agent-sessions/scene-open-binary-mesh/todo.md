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
- [x] ② open-folder uses `stageStreamBundles` with `stageLoadSkeleton` pre-load. Frontend now
      streams base/sub-model bundles, hydrates binary geometry per chunk, tracks stream progress,
      and treats `complete` as the reliable finish signal.
- [x] Verify: streaming-open wiring type-checks with `npm exec tsc --noEmit`; `page.tsx` lints clean.
- [ ] Manual: open `0x16F73C97` in the running app and confirm no crash + new_model renders.
- [x] Follow-up: `SceneDetailViewWindow` MeshReadonlyTab shows no arrays for binary mesh (display-only).
      Fixed: `getMeshObjectStats` now reads `__bin` typed-array views first (vertices from the
      positions view, triangles from indices/3, UV channels from uv0/uv1 presence; bones from the
      bridged `bone_influences`, "-" when absent), legacy inline fallback kept + unit tests.
- [x] Follow-up perf: `stage_stream_bundles` now streams sub-models as produced — rayon
      `for_each_with` sends each parsed bundle down an mpsc channel; a consumer task forwards to
      `on_chunk` and emits progress as they arrive. Peak memory drops from "all sub-models at once"
      to ~one bundle per rayon worker; sub-models render progressively. Completion order is safe —
      each chunk carries its own `folder_name`/`object_index` and the frontend resolves placement
      from the chunk (`resolveSubModelPlacementRef`), not arrival order.
- [x] HKT collision preview now uses the same binary-IPC side-channel as the SSBH loader:
      `scene_preview_hkt_collision_mesh_path` returns a light header (`HktCollisionMeshGeometryHeader`)
      with a `geometryId`; the packed buffer (positions f32 LE + indices u32 LE) is registered via
      `ssbh_mesh_binary::register_geometry` and fetched once with `take_mesh_geometry`. Frontend builds
      `BufferAttribute`s straight from typed-array views (no JSON number arrays).
- [ ] Follow-up perf: only positions/normals/uv0/uv1/indices are packed (tangents/colorsets dropped from
      preview geometry — matches what the renderer used anyway).

## Notes

- Big-bang: ALL bundles now emit binary headers; `__bin` rides on the shared mesh-object refs so
  MapViewport's `buildDrawListFromBundle` sites need no change (hydrated in `applyBundle`).
- `mesh.binary` flag still selects binary vs legacy inline path (legacy kept for unit tests).
- Geometry blobs are freed on `take_mesh_geometry`; `resetState` clears leftovers before each open.
