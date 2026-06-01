# Scene FBX Blender Diagnosis Process

## Context

- User reports Blender-exported `d:\output\minecraft\test.fbx` converts to broken SSBH: stretched/skin-like appearance, bad UVs, and mesh issues.
- The source static model is `d:\output\minecraft\test.obj`; the FBX has no intended bones or weights.
- User notes that `d:\noesisv4474\Noesis64.exe` can re-export a cleaner FBX that converts correctly, but that path is too slow and old.

## Local Code Findings

- Rust command entry point: `ssbh_convert_fbx_to_ssbh` in `src-tauri/src/ssbh_dae_cmd.rs`.
- Conversion chain: `ssbh_convert_fbx_to_ssbh` -> `convert_fbx_file` -> `parse_fbx_file` -> `convert_import_scene_file` -> `convert_import_scene_to_ssbh_files`.
- `parse_fbx_file` loads FBX with `ufbx::load_file`, builds bones only from skin deformers, collects mesh instance nodes, imports each node mesh, and bakes `node.geometry_to_world`.
- `import_one_mesh` currently creates vertices by `mesh.num_vertices` logical/control-point vertices.
- `import_one_mesh` samples normal and UV using `try_corner_for_logical_vertex()`, keeping only the first FBX corner for each logical vertex.
- `triangulated_indices` triangulates faces into FBX corner indices, then maps each corner back to `mesh.vertex_indices[corner]` logical vertex indices.

## Initial Hypothesis

Blender FBX stores UVs and split normals per polygon corner/index. Current importer collapses those corner attributes into one logical vertex, so UV seams and hard/split normals are lost. Noesis likely rewrites/splits the mesh into a more GPU-style vertex/index layout, hiding this importer bug.

## Commands / Results

- `cargo run --manifest-path src-tauri\Cargo.toml --bin debug_hkt_to_obj -- d:\output\minecraft\test.fbx`
  - PASS.
  - Parsed scene: 17 meshes, 0 bones, 0 materials, up_axis `NoConversion`.
  - Meshes are rigid; no skin influences were found by the current path.
  - Wrote debug OBJ outputs under `d:\output\minecraft\`.
- Temporary probe command:
  - `cargo run --manifest-path src-tauri\Cargo.toml --bin fbx_probe -- d:\output\minecraft\test.obj d:\output\minecraft\test.fbx`
  - OBJ: positions `10201`, texcoords `95`, normals `44`, face_corners `32252`, unique `v/vt/vn` triplets `31237`.
  - FBX raw scene: meshes `17`, nodes `18`, materials `17`, up_axis `Unknown`.
  - Project parser: meshes `17`, bones `0`, materials `0`, up_axis `NoConversion`.
  - FBX logical vertices total: `11233`.
  - FBX triangulated corner count total: `46194`.
  - FBX unique `(logical vertex + uv index + normal index)` total: `29781`.
  - Many meshes have `vertex_uv.unique_per_vertex=false` and hundreds/thousands of logical vertices with multiple UV indices. Example: `Stone` has `2391` logical vertices but `7644` unique `(logical+uv+normal)` tuples; `Sand` has `1613` logical vertices but `5582` unique tuples.

## External Source Findings

- ufbx mesh docs distinguish logical `Vertex` from per-corner/index attributes. A single logical vertex may be referenced by multiple face corners with different UVs/normals.
- ufbx docs recommend building a GPU-friendly mesh by iterating triangulated corner indices, reading position/normal/UV from each corner, then generating/deduplicating indices.
- `ssbh_data::mesh_data::MeshObjectData` stores attribute arrays indexed by `vertex_indices`; all attribute arrays must correspond to the same vertex domain.
- Local `cargo tree` shows this project uses `ufbx v0.10.1`; `cargo search ufbx` and `cargo info ufbx` report latest `ufbx v0.11.1` as of 2026-06-01. Upgrading may be useful, but it does not remove the need to preserve corner attributes.

## Conclusion

The direct Blender FBX path is broken because `import_one_mesh` collapses FBX polygon-corner attributes into logical vertices. Blender exports UVs and split normals as per-corner attributes, so the importer loses seam-specific UV/normal data. Noesis likely rewrites/splits the mesh into a cleaner indexed vertex layout, masking the bug.

Recommended fix:

1. Rewrite FBX mesh import to triangulate faces and emit a temporary vertex for each triangulated corner.
2. Read position, normal, UV, and skin weights from the FBX corner/logical vertex as appropriate.
3. Deduplicate by the full SSBH vertex tuple, not just logical vertex index.
4. Keep instance transform baking after the expanded mesh is built.
5. Add a regression test using a minimal mesh where one logical vertex has two UVs across a seam.

## Implementation

- Reworked `src-tauri/src/ssbh_dae/fbx_import.rs::import_one_mesh` to follow the ufbx GPU-mesh path:
  - Triangulate each FBX polygon with `ufbx::triangulate_face`.
  - Treat triangulated values as FBX corner indices.
  - Read position, normal, and UV from the corner attribute domain.
  - Pack vertex attributes into a padding-free `PackedFbxVertex` key.
  - Use `ufbx::generate_indices` for fast native deduplication/index generation.
- Static meshes deduplicate by actual position/normal/UV values.
- Skinned meshes include the logical FBX vertex in the packed key so per-logical-vertex skin weights remain distinct, then remap logical influences to expanded vertices.
- Removed the old first-corner sampling path that collapsed Blender split UV/normal data onto logical vertices.

## Verification After Fix

- `rustfmt src-tauri\src\ssbh_dae\fbx_import.rs`
  - PASS.
- `cargo test --manifest-path src-tauri\Cargo.toml --lib ssbh_dae::fbx_import::tests -- --nocapture`
  - PASS: 6 tests.
  - Blender sample conversion reported `17` mesh objects, `0` bones, `29775` vertices, and `46194` triangle indices.
  - The generated `.numdlb`, `.numshb`, and `.nusktb` files were parsed back with `ssbh_data` successfully.
- `cargo check --manifest-path src-tauri\Cargo.toml`
  - PASS.
  - Existing warnings remain in unrelated code: unused `parse_numatb_texture_refs`, unused `collect_u64_integers`, and warnings in `debug_hkt_to_obj`.
- `git diff --check -- src-tauri\src\ssbh_dae\fbx_import.rs docs\agent-sessions\scene-fbx-blender-diagnosis\todo.md docs\agent-sessions\scene-fbx-blender-diagnosis\process.md`
  - PASS, with a line-ending warning for `fbx_import.rs`.

## Notes

- A full `cargo fmt --manifest-path src-tauri\Cargo.toml --check` was not used as the gating command because it reports widespread pre-existing formatting differences outside this task.
- The conversion test uses `d:\output\minecraft\test.fbx` when present and skips cleanly when the local sample is absent.
