# Scene FBX Blender Diagnosis

- [x] Read project rules and related Scene/FBX import notes.
- [x] Trace Rust FBX -> SSBH conversion entry points.
- [x] Probe `d:\output\minecraft\test.fbx` and `test.obj` for vertex/index/UV semantics.
- [x] Compare findings with current ufbx/SSBH documentation.
- [x] Summarize likely root cause and recommended fix path.
- [x] Implement FBX importer fix: expand triangulated FBX corners and deduplicate by the full SSBH vertex attribute tuple.
- [x] Add regression coverage for the Blender `d:\output\minecraft\test.fbx` sample.
- [x] Run complete FBX -> SSBH conversion against the Blender sample and parse the generated SSBH files.
- [x] Correlate the new `d:\output\minecraft\test3.fbx` failure with actual per-mesh vertex/index counts from the Scene Editor conversion logs.
- [x] Verify the `test3.fbx` path still produces `0 bones` / `0 bone_influences`, ruling out true skinning as the direct cause.
- [x] Confirm the large `test3.fbx` output parses back as `68` valid mesh objects with in-bounds indices, making the preview/runtime consumer the prime suspect.
- [x] Trace the Scene Editor SSBH viewport path and identify the high-risk large-object merge point.
- [x] Add a viewport merge guard so giant same-material draw groups skip `mergeBufferGeometries()`.
- [x] Add focused tests for triangle-count and vertex-count merge bailouts.
- [x] Re-check the conversion path after the user confirmed the same corruption appears in-game and in Three.js.
- [x] Pin the real root cause to the VS2 mesh write path: large objects can exceed the `u16` index range while the dependency still writes `draw_element_type = UnsignedShort`.
- [x] Implement a project-local VS2-safe mesh splitter before `.numshb` write so oversized objects are chunked into multiple `__partN` mesh objects.
- [x] Preserve original `numdlb` material mappings across split mesh parts.
- [x] Re-run the real `d:\output\minecraft\test3.fbx` regression and verify every written object now stays within the VS2 `u16` index range.

## Remaining

- Manually verify the regenerated `new_model.numshb` in Scene Editor and in-game.
- Decide whether the viewport merge guard should stay as a separate performance/stability safeguard now that the converter fix is in place.
- Consider surfacing a user-facing warning/log entry when a source mesh is auto-split for VS2 index safety.
