# FBX Import Transform Fix

- [x] Read project rules and related DAE/SceneEdit import notes.
- [x] Add focused regression tests for FBX instance transform baking.
- [x] Traverse FBX mesh instance nodes and bake instance world transforms into imported meshes.
- [x] Sync valid analysis up-axis values into the SSBH conversion session.
- [x] Sync SceneEdit static mesh import config from analysis up-axis.
- [x] Run focused Rust and frontend tests.
- [x] Run `cargo check`.

## Remaining

- Manually verify with a Blender FBX multi-object static scene exported without Apply Transform.
- For skinned FBX files, verify representative assets visually because current automated coverage only checks transform helper invariants and existing optional local fixtures.
