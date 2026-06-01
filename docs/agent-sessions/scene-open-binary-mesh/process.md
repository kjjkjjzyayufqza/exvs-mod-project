# Scene Open: Binary Mesh Geometry over IPC

## Context / Root Cause (verified)

Crash: opening stage `E:\XB\解包\com\test\0x16F73C97` in the Scene Editor aborts
the host process (`app.exe`, exit code `0xE0000008`) right after `[load_bundle] Done`.

Evidence:
- `new_model.numshb` on disk is **337.82 MB** (other stage models < 1.1 MB). This is a
  user-imported model (the prior `scene-import-ipc-memory` session reported the same
  asset: 2,362,718 vertices / 3,720,684 triangle indices from `test2.fbx`).
- `ssbh_preview.rs:1072` does `serde_json::to_value(&mesh)` — the entire `MeshData`
  (all positions/normals/uv/indices) becomes an in-memory `serde_json::Value` tree
  (~6-10x blow-up for float arrays → multiple GB), stored in
  `SsbhModelPreviewBundle.mesh: Value`.
- `load_stage_bundle` returns the whole `StageBundle` (base + all sub-models, each with
  the mesh `Value`). Tauri serializes the command response to a JSON **string** — for
  338 MB of floats this is a single multi-GB allocation.
- Exit code `0xE0000008` has the customer bit (29) set → an application/runtime fatal
  abort (allocation failure / oversized IPC payload), not a plain access violation.
- Aggravators: the open path invokes `load_stage_bundle` **twice** in the log
  (new_model parse 5157ms vs 5389ms → two real runs); debug build makes serde_json slow.

The prior `scene-import-ipc-memory` session added a 128 MiB guard on the **import
preview** path (`scene_build_import_preview_bundle`) and path-backed artifacts. But the
**open-folder / `load_stage_bundle` path has no such guard** and still ships full mesh
JSON — that is the path crashing here. Guarding/blocking is not acceptable for open,
because the saved model must remain visible on reload. Therefore the fix is efficient
binary transfer.

## Decision (user-approved scope: 根治 ①+②+③)

1. Geometry no longer travels as `serde_json::Value` / JSON text. Pack the large arrays
   (positions, normals, uv0, uv1 as f32 LE; vertex_indices as u32 LE) into a binary blob
   delivered out-of-band. `bundle.mesh` becomes a light header with object metadata +
   per-attribute byte offsets.
2. Open-folder uses the existing `stage_stream_bundles` streaming command so the base
   model renders first and peak memory stays bounded to one model at a time.
3. Fix the duplicate `load_stage_bundle` invocation on open.

## Wire format

`pack_mesh_geometry(&MeshData) -> (MeshGeometryHeader, Vec<u8>)`:

- Binary blob = concatenated little-endian buffers at declared offsets:
  - f32 for positions(3)/normals(3)/uv0(2)/uv1(2)
  - u32 for vertex_indices
- Header (small JSON, replaces the heavy `mesh` Value):
  ```jsonc
  {
    "majorVersion", "minorVersion", "isVs2",
    "binary": true,
    "objects": [{
      "name", "subindex", "parentBoneName",
      "boneInfluences": [...],          // kept inline (≈empty for static stage models)
      "vertexCount": V, "indexCount": N,
      "positions": {"offset":B,"count":V,"components":3} | null,
      "normals":   {"offset":B,"count":V,"components":3} | null,
      "uv0":       {"offset":B,"count":V,"components":2} | null,
      "uv1":       {"offset":B,"count":V,"components":2} | null,
      "indices":   {"offset":B,"count":N}
    }]
  }
  ```

Delivery: the loader parses each `.numshb` **once**, writes the packed blob to a temp
`.bin` file, and records the header (incl. blob path) in `bundle.mesh`. The frontend reads
the blob via `tauri-plugin-fs` `readFile` (binary `Uint8Array`) and builds typed-array
`BufferAttribute`s from offsets — no `JSON.parse` of geometry, no nested-array walking.

Backward compatibility: when `mesh.binary` is absent (in-memory/test bundles still using
inline `{"Vector3": [...]}`), the frontend keeps the existing array path.

## Affected sites

Rust mesh `Value` producers (4): `ssbh_preview.rs:1072`, `fhm2d_stage.rs:2865`,
`fhm2d_memory_preview.rs:971`, `scene_session_commands.rs:752`. No production Rust reads
`bundle.mesh` back (only test `scene_session_commands.rs:3139`).

Frontend `bundle.mesh` consumers: geometry — `meshFromSsbh.ts` (`buildGeometryForObject`,
`buildDrawListFromBundle`), `SsbhModelPreviewContext.tsx:871`, `MapViewport.tsx`
(4 draw-list sites); metadata-only — `sceneTextureInventory.ts:105`,
`SceneDetailViewWindow.tsx:169`. Types in `types.ts` (`MeshObjectJson` etc.).

## Implementation log

- ① done: `ssbh_mesh_binary.rs` (header types, `pack_mesh_geometry`, process-global geometry
  registry, `pack_and_register`, commands `take_mesh_geometry` / `clear_mesh_geometry_registry`).
  All 4 mesh `Value` producers now emit a light header + registered blob id. Frontend builds
  geometry from typed-array views (`buildGeometryForObject`), hydrated via
  `meshGeometryHydrate.ts` in `applyBundle` / preview context; `resetState` clears the registry.
- ③ partial: defensive re-entrant guard in `handleOpenFolder`.
- Verified: cargo `ssbh_mesh_binary` 3/3 + lib compiles green; vitest meshFromSsbh 10/10; tsc 0 errors.
- Not done: ② streaming open (optimization on top of the now-fixed crash); live-app open of
  `0x16F73C97` not yet run (cannot launch dev server from here).

## Delivery decision (big-bang, per user)

Geometry blob = only positions/normals/uv0/uv1 (f32) + vertex_indices (u32), so the packed buffer
is far smaller than the `.numshb` (the 337 MB model packs to ~90 MB). Registry holds blobs until the
webview takes them; `load_stage_bundle` (non-stream) registers all up front (~one stage's worth,
bounded), `take_mesh_geometry` frees each on fetch. This removes the multi-GB JSON string that aborted
the host — the crash root cause — without streaming. ② further bounds peak to one model and renders
base first, but is not required to stop the crash.
