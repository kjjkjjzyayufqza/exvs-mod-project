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

## 2026-06-02 Large `test3.fbx` Follow-up

### Context

- User reported a new Blender-exported sample:
  - input: `d:\output\minecraft\test3.fbx`
  - output: `e:\XB\解包\com\test\0x16F73C97\0\0\new_model\0\new_model.numshb`
- Symptom: after FBX -> SSBH conversion, the rendered result shows severe stretched-triangle / "skinning-like" artifacts even though the source is a static mesh with no intended armature or weights.
- User also noted the problem only shows up on very large meshes, not on small or medium samples.

### Terminal Log Evidence

- Existing app terminal logs show the problematic conversion path was:
  - `ssbh_analyze_fbx path=D:\output\minecraft\test3.fbx`
  - `dae_to_ssbh converting scene: 68 meshes, 0 bones, base_filename=new_model`
- Every converted mesh in the log reported `0 bone_influences`.
- Final conversion summary from the same run:
  - `mesh stats: 68 objects, 5182512 vertices, 8187864 triangle_indices`
  - `convert_import_path_to_ssbh_paths ... mesh_objects=68 total_vertices=5182512 total_indices=8187864 bones=0`
- The written output file size is very large:
  - `new_model.numshb` = `778,258,568` bytes
- Several single mesh objects are extremely large on their own:
  - `Birch_Leaves`: `1,209,656` verts / `1,814,484` indices
  - `Stone`: `1,384,400` verts / `2,311,812` indices
  - `Stationary_Water`: `411,024` verts / `616,536` indices
  - `Wildflowers`: `292,668` verts / `444,648` indices
- A smaller earlier conversion recorded in the same terminal (`new_model` from another input) completed as:
  - `28 objects, 209140 vertices, 329532 triangle_indices`
  - This helps separate the issue from generic static-mesh conversion and points toward very large per-object meshes.

### In-Code Findings

- `src-tauri/src/ssbh_dae/fbx_import.rs::import_one_mesh()`:
  - uses `u32` triangle indices,
  - sets `skin_vertex_key = 0` when `has_skin == false`,
  - only generates `bone_influences` when the FBX mesh actually has a skin deformer.
- This means the current `test3.fbx` path is **not** producing accidental skin weights or bones during FBX import.
- `src-tauri/src/ssbh_dae/dae_to_ssbh.rs::convert_meshes_to_ssbh()` writes each imported `DaeMesh` as a single `MeshObjectData`:
  - `subindex: 0`
  - `vertex_indices: dae_mesh.indices.clone()`
  - no chunking/splitting of oversized mesh objects

### Working Hypothesis

- The visible corruption is unlikely to be true skinning failure, because the conversion path for `test3.fbx` stays at `0 bones` / `0 bone_influences` throughout the logged run.
- The more plausible cause is a **very large single mesh object** problem:
  - either the written `.numshb` data becomes invalid for some downstream consumer when one object is extremely large,
  - or the `.numshb` is structurally valid on disk, but the preview/runtime render path breaks on very large static mesh objects.
- The strongest current correlation is with **per-object vertex count**, not with skeleton data.

### Next Diagnostic Step

- Parse the written `new_model.numshb` directly and print per-object `vertex_count`, `index_count`, `max_index`, and out-of-bounds status.
- If the parsed on-disk mesh data is valid, inspect the SSBH preview/render path for large static object handling.
- If the parsed on-disk mesh data is invalid, add a guard and likely a mesh-splitting path before `.numshb` write.

### Follow-up Verification

- Added ignored local regression probe:
  - `src-tauri/src/ssbh_dae/fbx_import.rs::convert_large_blender_fbx_to_ssbh_files_has_in_bounds_indices`
- Command:
  - `cargo test --manifest-path e:\TAURI_PROJECT\src-tauri\Cargo.toml --lib ssbh_dae::fbx_import::tests::convert_large_blender_fbx_to_ssbh_files_has_in_bounds_indices -- --ignored --nocapture`
- Result:
  - PASS.
  - `validate_import_scene()` reported `68 valid meshes`.
  - Re-converted `test3.fbx` to a temp directory and parsed the generated `.numshb` successfully.
  - Asserted `mesh.objects.len() == 68`.
  - Asserted every mesh object satisfies `max_index < vertex_count`.
  - Largest written object remained `Stone` at `1,384,400` vertices and `2,311,812` indices.

### Updated Conclusion

- The current evidence no longer points to malformed skinning data or obviously broken mesh indices in the written `.numshb`.
- The generated file is at least structurally coherent enough to:
  - pass import-scene validation before write,
  - round-trip through `MeshData::from_file`,
  - keep every parsed object within index bounds.
- The remaining high-probability failure area is therefore the **preview/runtime consumer path for very large static mesh objects**, or a downstream engine/tool limitation that is not currently modeled by the converter.

## 2026-06-02 Viewport Root Cause And Fix

### Root Cause

- Scene Editor does not render imported SSBH mesh objects one-by-one inside `MapViewport`.
- In `src/page/SceneEdit/components/MapViewport.tsx`, both stage-model paths group `BuiltMeshDraw` entries by `draw.materialLabel` and then call:
  - `mergeBufferGeometries(geometries, false)`
- The FBX -> SSBH converter currently writes every generated `numdlb` entry with the same fallback material label when no explicit mapping is provided:
  - `src-tauri/src/ssbh_dae/dae_to_ssbh.rs::convert_model_to_ssbh()`
  - fallback label: `DefaultMaterial`
- For `test3.fbx`, that means the viewport was likely trying to merge all `68` objects into one massive combined geometry because they share the same material label.
- This matches the user symptom:
  - small/medium meshes render fine,
  - failure appears only once a single import produces an extremely large same-material draw group,
  - on-disk `.numshb` stays structurally valid, so the bad behavior is concentrated in the preview consumer.

### Fix

- Extracted the material-group merge logic from `MapViewport.tsx` into:
  - `src/page/SceneEdit/components/mapViewportDrawMerge.ts`
- Added a safety bailout before merge:
  - skip merge when grouped geometry reaches `>= 1,000,000` triangles, or
  - skip merge when grouped geometry reaches `>= 3,000,000` vertices
- Both `MapViewport` stage-model merge sites now call the helper instead of open-coding the merge loop.

### Tests

- Added:
  - `src/page/SceneEdit/components/mapViewportDrawMerge.test.ts`
- Coverage now includes:
  - small same-material groups still merge,
  - huge same-material groups skip merge on triangle-count threshold,
  - huge same-material groups skip merge on vertex-count threshold even when triangle count is small

### Verification

- `pnpm exec vitest run src/page/SceneEdit/components/mapViewportDrawMerge.test.ts`
  - PASS: 3 tests
- `pnpm exec tsc --noEmit --pretty false`
  - PASS
- `ReadLints` on:
  - `src/page/SceneEdit/components/MapViewport.tsx`
  - `src/page/SceneEdit/components/mapViewportDrawMerge.ts`
  - `src/page/SceneEdit/components/mapViewportDrawMerge.test.ts`
  - PASS: no diagnostics

### Remaining Risk

- This fix targets the Scene Editor viewport merge path specifically.
- A manual visual pass is still needed on the actual `test3.fbx` / `new_model.numshb` workflow to confirm the explosion is gone.
- If a downstream consumer outside `MapViewport` still breaks on giant single objects, the next likely step is mesh splitting before `.numshb` write rather than another viewport-only workaround.

## 2026-06-02 Final Converter Root Cause And VS2-Safe Split Fix

### User Correction That Changed The Direction

- The user explicitly confirmed that the already converted `new_model.numshb` also renders incorrectly **in-game**, and that the in-game result matches the broken Three.js preview.
- That means the viewport was only showing the bad file faithfully; it was not the primary source of corruption.
- The viewport merge guard remains a useful defensive improvement, but it is **not** the root-cause fix for the large `test3.fbx` failure.

### Actual Root Cause

- The current project dependency checkout for `ssbh_data` (`ssbh_data/src/mesh_data.rs`) contains this VS2-specific write path:
  - `let vertex_indices = convert_indices(&data.vertex_indices);`
  - `// for vs2`
  - `let draw_element_type = DrawElementType::UnsignedShort;`
- `convert_indices()` still upgrades to `VertexIndices::UnsignedInt` whenever any index exceeds `u16::MAX`.
- So for oversized mesh objects, the file can be written with:
  - an actual **32-bit** index buffer payload,
  - but metadata that still says `draw_element_type = UnsignedShort`.
- Both the game and the preview then read the same bad file using the wrong index width, producing the same stretched / exploded triangle pattern.

### Why The Earlier "In-Bounds" Test Was Misleading

- The earlier ignored test only checked that parsing the written `.numshb` returned indices satisfying `max_index < vertex_count`.
- That was not enough to prove the file was semantically correct.
- If the file stores a `u32` index buffer but advertises `u16`, the read path will reinterpret the bytes with the wrong width.
- That misread can still produce values that look "in bounds" while the triangle topology is already corrupted.

### Project-Local Fix Strategy

- Instead of patching the dependency branch directly, the converter now enforces a VS2-safe invariant before `.numshb` write:
  - any mesh object that would exceed the `u16` index domain is split into multiple mesh parts,
  - each output part keeps indices within the VS2-safe `u16` range,
  - split parts are named `OriginalName__partN`.
- Implementation details in `src-tauri/src/ssbh_dae/dae_to_ssbh.rs`:
  - added `prepare_meshes_for_vs2()`,
  - added `split_mesh_for_vs2()` with triangle-order chunking and local vertex remapping,
  - added `build_vs2_split_part()` to rebuild positions/normals/UVs and remap bone influences,
  - added collision-safe split naming so a mesh like `Foo` can still split even if another source mesh is already named `Foo__part0`,
  - updated the conversion pipeline to convert prepared split meshes instead of raw `DaeMesh` objects.
- `numdlb` material mapping behavior was preserved by carrying the original source mesh name alongside each split part and falling back to the original `(mesh name, subindex)` mapping when generating `ModlData` entries.

### Verification

- Added Rust unit tests in `src-tauri/src/ssbh_dae/dae_to_ssbh.rs`:
  - `convert_meshes_to_ssbh_splits_large_meshes_for_vs2_u16_index_limit`
  - `convert_meshes_to_ssbh_avoids_split_name_collisions_with_existing_meshes`
  - `split_mesh_for_vs2_remaps_bone_influences_to_local_part_indices`
  - `convert_import_scene_to_ssbh_files_preserves_material_mapping_for_split_parts`
- Command:
  - `cargo test --manifest-path e:\TAURI_PROJECT\src-tauri\Cargo.toml --lib ssbh_dae::dae_to_ssbh::tests -- --nocapture`
  - PASS: 4 tests.
- Strengthened the existing ignored large-local-sample regression in `src-tauri/src/ssbh_dae/fbx_import.rs` to assert every written object now satisfies `max_index <= u16::MAX`.
- Command:
  - `cargo test --manifest-path e:\TAURI_PROJECT\src-tauri\Cargo.toml --lib ssbh_dae::fbx_import::tests::convert_large_blender_fbx_to_ssbh_files_has_in_bounds_indices -- --ignored --nocapture`
  - PASS.
  - `test3.fbx` now converts as:
    - `139` mesh objects (was `68`)
    - `5,188,098` total vertices
    - `8,187,864` triangle indices
    - largest written object: `Andesite__part0` at `65,536` vertices / `98,304` indices
  - Large original meshes are now split, for example:
    - `Stone`: `22` parts
    - `Birch_Leaves`: `19` parts
    - `Stationary_Water`: `7` parts
    - `Wildflowers`: `5` parts
- Command:
  - `cargo check --manifest-path e:\TAURI_PROJECT\src-tauri\Cargo.toml`
  - PASS.
  - Remaining warnings are pre-existing unrelated items in other modules/binaries.

### Current Status

- The converter-side root cause is now fixed in the project code without depending on a patched `ssbh_data` branch.
- The next meaningful verification is a manual run of the regenerated `new_model.numshb` in Scene Editor and in-game.
