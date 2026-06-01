---
name: tauri-ipc-large-binary
description: Transfer large array/geometry data (meshes, point clouds, images, audio buffers) across the Tauri IPC boundary as compact binary instead of JSON. Use when a command returns big numeric arrays, when the webview/host crashes or hangs on load (e.g. exit 0xE0000008, white screen, multi-second freeze), or when a struct field is a serde_json::Value holding vertex/index/sample buffers.
---

# Tauri IPC: Large Binary Data Transfer

## The anti-pattern (why this skill exists)

Shipping bulk numeric data through Tauri's default JSON IPC aborts the host on large inputs.

```rust
// BAD — the whole mesh becomes an in-memory JSON tree, then a JSON *string*
pub struct PreviewBundle { pub mesh: serde_json::Value /* positions/normals/uv/indices */ }
let mesh_json = serde_json::to_value(&mesh)?;            // ~6-10x memory blow-up
// command returns PreviewBundle -> Tauri serializes to one giant JSON String
```

Real case in this repo: a `337 MB` `.numshb` (`new_model`) became a multi-GB
`serde_json::Value` + multi-GB JSON string when `load_stage_bundle` returned, and the host
`app.exe` aborted with **exit code `0xE0000008`** (customer/runtime fatal-error bit set —
an allocation/abort, NOT a `0xC0000005` access violation). Symptoms to recognize:

- Host process exits right **after** a `[load_*] Done` log line (i.e. during response serialization).
- Exit code `0xE0000008` / `3758096392`, white screen, or a multi-second freeze on load.
- A DTO field typed `serde_json::Value` (or a huge `Vec<[f32; N]>` serialized as JSON).

**Why JSON is catastrophic here:** every `f32` becomes a ~16-24 byte `serde_json::Value`
node inside a `Vec<Value>`; then the text form (`-0.12345678…`) is allocated as one
contiguous `String`. For float buffers this is the worst possible representation on both
memory and a single-allocation-size axis.

## The core pattern: binary side-channel

Keep small metadata as JSON; move the bulk arrays out-of-band as raw bytes. Reference
implementation in this repo: **`src-tauri/src/ssbh_mesh_binary.rs`** (the "core").

1. **Pack** the big arrays into one little-endian `Vec<u8>` and a small JSON header that
   records each attribute's `{ offset, count, components }` (f32) and index `{ offset, count }` (u32).
   Pack **only what the consumer actually reads** (e.g. positions/normals/uv0/uv1/indices) —
   dropping unused attributes shrank the 337 MB mesh to a ~90 MB blob.
2. **Register** the blob in a process-global registry keyed by an id; the DTO field carries
   only the header + `geometryId`. (A global, not Tauri `State`, because the producers are
   plain functions called from many sites without `State` access.)
3. **Serve** the bytes from a dedicated command returning `tauri::ipc::Response` — the
   webview receives an `ArrayBuffer`, never JSON. `take` removes the entry so memory frees
   on fetch. Provide a `clear` command for reset paths.
4. **Frontend**: fetch the `ArrayBuffer`, wrap slices in `Float32Array` / `Uint32Array`
   views at the header offsets, feed `BufferAttribute` directly — no `JSON.parse`, no
   nested `[[x,y,z],…]` intermediate.

```rust
// Producer: light header + registered blob (replaces serde_json::to_value(&mesh))
let header = ssbh_mesh_binary::pack_and_register(&mesh);   // -> { binary, geometryId, objects:[{offset,count,...}] }
dto.mesh = serde_json::to_value(header)?;                   // tiny JSON

#[tauri::command]                                           // raw bytes, not JSON
pub fn take_mesh_geometry(geometry_id: String) -> Result<tauri::ipc::Response, String> {
    take_geometry(&geometry_id).map(tauri::ipc::Response::new)
        .ok_or_else(|| format!("geometry consumed/missing: {geometry_id}"))
}
```

```ts
// Consumer: ArrayBuffer -> typed-array views (see meshGeometryHydrate.ts + meshFromSsbh.ts)
const buf = await invoke<ArrayBuffer>("take_mesh_geometry", { geometryId });
const positions = new Float32Array(buf, slice.offset, slice.count * slice.components);
const indices   = new Uint32Array(buf, idx.offset, idx.count);
geom.setAttribute("position", new BufferAttribute(positions, 3));
```

## Recipe (apply to any large-array command)

- [ ] Identify the bulk arrays in the DTO and confirm **no Rust code reads the field back**
      (it is an output-only DTO) — then changing its wire shape only touches producers + frontend.
- [ ] Write `pack_*` returning `(SmallHeader, Vec<u8>)`; unit-test offsets + a round-trip
      (`ssbh_mesh_binary.rs` tests are the template).
- [ ] Add the registry (`register`/`take`/`clear`) + `pack_and_register`; switch **all**
      producers of that field at once (big-bang) — a half-migrated wire format renders nothing.
- [ ] Add the `take_*` (`Response`) and `clear_*` commands; register both in `invoke_handler`.
- [ ] Frontend: a `hydrate*` util fetches the blob once and attaches typed-array views to the
      shared object refs (so downstream render sites need no change); call it at every loader
      boundary; call `clear_*` on reset.
- [ ] Keep a legacy inline-array path behind a `binary` flag so existing unit tests still pass.
- [ ] Verify: `cargo test` (packer), `vitest` (binary build path), `tsc`, then open the real
      large asset in the running app.

## Pitfalls

- **Alignment**: `new Float32Array(buf, byteOffset, len)` needs `byteOffset % 4 === 0`. Packing
  f32/u32 sequentially keeps every offset 4-aligned; `len` is the element count, not bytes.
- **Lifetime / leaks**: `take` frees on fetch; the frontend must fetch every registered blob.
  Clear the registry on scene/reset and dedupe re-entrant loads so abandoned blobs don't pile up.
- **Memory vs disk path**: register by id (not by file path) so in-memory bundles work too —
  they have no on-disk source file to re-read.
- **Don't `serde(rename_all=camelCase)` the inner blob struct expecting it to rename nested
  `Value`s** — only the header's own field names are renamed; bridge camelCase↔snake_case on
  the frontend during hydration if the renderer expects snake_case.
- **Streaming (optional next level)**: a `Channel` that emits one model/chunk at a time bounds
  peak memory to a single item and renders the first chunk immediately — layer it on after the
  binary transfer is working.

## Related

- Root-cause + design notes: `docs/agent-sessions/scene-open-binary-mesh/`
- Prior, narrower fix (import preview path, 128 MiB guard): `docs/agent-sessions/scene-import-ipc-memory/`
