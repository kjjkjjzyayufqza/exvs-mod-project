# Scene FBX Blender Diagnosis

- [x] Read project rules and related Scene/FBX import notes.
- [x] Trace Rust FBX -> SSBH conversion entry points.
- [x] Probe `d:\output\minecraft\test.fbx` and `test.obj` for vertex/index/UV semantics.
- [x] Compare findings with current ufbx/SSBH documentation.
- [x] Summarize likely root cause and recommended fix path.
- [x] Implement FBX importer fix: expand triangulated FBX corners and deduplicate by the full SSBH vertex attribute tuple.
- [x] Add regression coverage for the Blender `d:\output\minecraft\test.fbx` sample.
- [x] Run complete FBX -> SSBH conversion against the Blender sample and parse the generated SSBH files.

## Remaining

- Optional visual inspection in the Scene Editor viewport with the generated files, if a human visual pass is needed after code-level conversion validation.
