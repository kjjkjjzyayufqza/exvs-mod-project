# FBX Import Transform Fix Process

## Goal

Fix FBX to SSBH conversion so mesh instances in the FBX scene graph keep their node transforms, and make the frontend SSBH conversion axis default follow analysis results.

## Context

- Prior analysis confirmed Blender and other viewers display the FBX correctly, while this project stacked or deformed multi-object static scenes.
- Root cause in `src-tauri/src/ssbh_dae/fbx_import.rs`: import walked `scene.meshes`, which are geometry-local, instead of importing mesh instances from FBX nodes.
- Existing DAE/SSBH conversion applies scale and up-axis conversion later in `dae_to_ssbh`, so FBX parsing should bake instance placement but not pre-apply up-axis conversion.
- Existing bone building intentionally uses scene node world poses consistently to avoid mixing cluster poses with scene hierarchy poses.

## Implementation

- Added helper coverage for baking instance transforms into `ImportMesh` positions and normals.
- FBX parsing now traverses the scene node tree and imports each node with a mesh as a separate mesh instance.
- Instance vertices are transformed with the node `geometry_to_world` matrix, which includes the node world transform plus FBX geometry transform.
- Normals are transformed with inverse-transpose and normalized, with a rotation/scale fallback for singular matrices.
- Multiple nodes referencing the same mesh data now produce separate `ImportMesh` entries with disambiguated names.
- The old `scene.meshes` iteration is retained only as a fallback for uninstanced mesh data.
- Skinning weights and indices are not rewritten by transform baking; bones still come from the existing scene-node hierarchy path.
- `daeSsbhSessionStore.loadAnalysis` now normalizes `analysis.upAxis` and applies valid `y_up`, `z_up`, or `none` values to the session.
- SceneEdit static mesh import config now syncs `ssbhConfig.upAxis` from analysis results, including FBX analysis, and the config panel exposes `none` as "No Conversion".

## Verification

- `cargo test --lib ssbh_dae::fbx_import::tests` from `src-tauri` passed: 4 tests.
- `npm test -- src/components/ssbh-model-preview/store/daeSsbhSessionStore.test.ts src/page/SceneEdit/components/dae-import/daeImportDefaults.test.ts` passed: 2 files, 10 tests.
- `cargo check` from `src-tauri` passed.
- `cargo fmt` from `src-tauri` completed.
- `ReadLints` on edited TypeScript/TSX files reported no linter errors.
- `npx tsc --noEmit` failed on existing unrelated repository issues in SceneEdit tests and DDS type imports.

## Notes

- `cargo check` still reports existing warnings in unrelated files: `parse_numatb_texture_refs`, `collect_u64_integers`, and warnings in `debug_hkt_to_obj`.
- Manual visual verification should use a Blender FBX scene with several separate objects and transforms left unapplied.
