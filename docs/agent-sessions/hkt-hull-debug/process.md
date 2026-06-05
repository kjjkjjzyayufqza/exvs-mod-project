# HKT Hull Debug Process

## Startup Context

- Read `AGENTS.md`.
- Read `.cursor/rules/custom-rules.mdc`.
- Searched `docs/` for HKT, Havok, hull, convex, FBX, OBJ, collision, and preview references.
- Relevant docs reviewed:
  - `docs/havok_compressed_mesh_encode.md`
  - `docs/havok_hkt_to_obj.md`
  - `docs/hkt-collision-format-comparison.md`
  - `docs/superpowers/plans/2026-06-02-hkt-convex-hull-outline-mode.md`
  - prior session notes under `docs/agent-sessions/havok-mesh-validation/`
  - prior session notes under `docs/agent-sessions/scene-hkt-unitmodel-render/`

## Initial Notes

- The intended architecture routes preview stats, preview mesh, final HKT generation,
  and regenerate through `simplify_collision_mesh`.
- The convex-hull plan expected planar input to use a separate 2D monotone-chain hull
  path because 3D quickhull is degenerate on perfectly coplanar meshes.
- HKT compressed mesh encoding depends on correct local/shared vertex quantization and
  section-local primitive indexing; preview corruption can be caused before HKT encoding
  if the intermediate collision mesh itself contains bad triangles.

## Code Flow

- `src-tauri/src/havok_collision_encode.rs`
  - `preview_hkt_collision_mesh_from_import_bytes`
  - `generate_hkt_from_import_bytes`
  - both parse import bytes, bake/merge collision mesh, then call `simplify_collision_mesh`.
- `src-tauri/src/collision_mesh/simplify.rs`
  - `CollisionSimplifyMode::ConvexHull` dispatches to
    `convex_hull_collision_mesh`.
- `src-tauri/src/collision_mesh/convex_hull.rs`
  - previous path used a strict `PLANARITY_RATIO=1e-3`.
  - `test3_plane_clear2.fbx` had Y span about 4000 and max horizontal span about
    40700, so ratio was about 0.098 and the mesh took the 3D QuickHull branch.

## Reproduction

Command:

```powershell
cargo run --manifest-path src-tauri\Cargo.toml --bin perf_preview_hkt -- "D:\output\minecraft\test3_plane_clear2.fbx" 80
```

Before fix:

- merged: 465285 triangles, 832795 vertices
- merged AABB: min `[-20350, 0, -17550]`, max `[20350, 4000.0017, 17550]`
- convex hull: 50 triangles, 27 vertices
- exported probe OBJ showed valid topology but a 3D convex envelope connecting
  sparse high/low extreme points across the whole terrain, matching the user's
  "fuzzy ball" / spiky preview description.

## Fix

- Added a new thin-terrain branch in `convex_hull_collision_mesh`:
  - perfectly planar input still uses the existing single-plane 2D fan.
  - thin but nonzero input (`thin_extent <= max_extent * 0.15`) now builds a 2D
    convex outline and extrudes it between the min/max thin-axis bounds.
  - volumetric input still uses `chull` 3D QuickHull.
- Added `outline_slab_mesh` with outward-oriented triangles.
- Added `thin_terrain_uses_closed_outline_slab` regression test.
- Added optional diagnostic OBJ output to `perf_preview_hkt`, gated by
  `HKT_PROBE_WRITE_OBJ`.

## Verification

Commands:

```powershell
cargo test --manifest-path src-tauri\Cargo.toml convex_hull --lib
cargo test --manifest-path src-tauri\Cargo.toml scene_session_commands::tests::hkt_simplify_to_options_maps_convex_hull_strategy --lib
$env:HKT_PROBE_WRITE_OBJ='1'; cargo run --manifest-path src-tauri\Cargo.toml --bin perf_preview_hkt -- "D:\output\minecraft\test3_plane_clear2.fbx" 80
```

Results:

- `cargo test ... convex_hull --lib`: 6 passed.
- `cargo test ... hkt_simplify_to_options_maps_convex_hull_strategy --lib`: 1 passed.
- After fix on the FBX:
  - merged: 465285 triangles, 832795 vertices
  - convex hull preview: 12 triangles, 8 vertices
  - AABB preserved: min `[-20350, 0, -17550]`, max `[20350, 4000.0017, 17550]`
  - probe OBJ topology: 8 vertices, 12 faces, 18 unique edges, 0 boundary/nonmanifold edges.

## Cleanup

- Deleted `D:\output\minecraft\test3_plane_clear2_convex_hull_80_probe.obj`.
- Confirmed no `test3_plane_clear2*probe.obj` files remain in `D:\output\minecraft`.

## High-Precision Review OBJ (2026-06-05 follow-up)

User clarified that the 8/12-triangle coarse outline is useful as an option, but
not the desired default goal. The desired direction is a higher-precision
collision mesh closer to the FBX model edges/surface.

Added a review-only path to `src-tauri/src/bin/perf_preview_hkt.rs`:

- enabled with `HKT_REVIEW_TARGET_TRIS`
- uses `CollisionSimplifyMode::ShapePreserving`
- sets `max_target_triangles` to the requested target
- writes `<stem>_collision_high_precision_<actual_tris>_review.obj`

Command:

```powershell
$env:HKT_REVIEW_TARGET_TRIS='50000'; cargo run --manifest-path src-tauri\Cargo.toml --bin perf_preview_hkt -- "D:\output\minecraft\test3_plane_clear2.fbx" 80
```

Result:

- source merged mesh: 465285 triangles, 832795 vertices
- high-precision review mesh: 49682 triangles, 25722 vertices
- AABB preserved: min `[-20350, 0, -17550]`, max `[20350, 4000.0017, 17550]`
- output kept intentionally for user review:
  `D:\output\minecraft\test3_plane_clear2_collision_high_precision_49682_review.obj`
- file size: 2086615 bytes
- no `test3_plane_clear2*probe.obj` files remain.

Verification:

```powershell
cargo test --manifest-path src-tauri\Cargo.toml convex_hull --lib
```

Result: 6 passed.

## Frontend Review Controls (2026-06-05 follow-up)

User accepted the high-precision shape-preserving algorithm and requested
frontend controls for generating different HKT variants, exporting the FBX ->
HKT-input OBJ for review, and previewing multiple mesh stages in the Three.js
HKT preview.

Implemented:

- Added `high` HKT simplify preset in the frontend:
  - `strategy=shapePreserving`
  - `planarityAngleDeg=15`
  - `weldEpsilon=0.001`
  - `maxTargetTriangles=50000`
  - no `targetTriangleRatio`
- Kept the convex outline/slab algorithm as a separate `convexHull` option.
- Made Generate HKT from New Model default to the high-precision preset while
  leaving the general import default at `medium`.
- Added review stages to the Generate HKT dialog:
  - `merged`: skin-baked/axis-converted mesh after merge, before simplify
  - `hktInput`: exact mesh sent into the HKT encoder
  - `decodedHkt`: Havok-generated HKT decoded back through the existing XML path
- Added `Export HKT input OBJ`, which writes the `hktInput` stage through a Rust
  backend command instead of passing OBJ text through frontend IPC.

Backend changes:

- Added `HktCollisionReviewStage` and stage-aware preview helpers in
  `src-tauri/src/havok_collision_encode.rs`.
- Added `write_collision_mesh_obj`.
- Added `scene_export_hkt_collision_review_obj_path` in
  `src-tauri/src/scene_session_commands.rs`.
- Registered the new command in `src-tauri/src/lib.rs`.

Verification:

```powershell
pnpm vitest run src/page/SceneEdit/utils/hktSimplifyUtils.test.ts src/page/SceneEdit/utils/hktPreviewGeometry.test.ts src/page/SceneEdit/components/dae-import/DaeImportHktSimplifyFields.test.tsx
cargo test --manifest-path src-tauri\Cargo.toml write_collision_mesh_obj --lib
cargo test --manifest-path src-tauri\Cargo.toml pack_and_register_collision_mesh_packs_positions_then_indices --lib
cargo test --manifest-path src-tauri\Cargo.toml convex_hull --lib
cargo test --manifest-path src-tauri\Cargo.toml preview_collision_counts_for_subdivided_planar_quad_dae --lib
pnpm vitest run src/page/SceneEdit/components/havok/generateHktFromModelCache.test.ts
pnpm exec tsc --noEmit
```

Results:

- Frontend focused tests: 17 passed across 3 files.
- `generateHktFromModelCache.test.ts`: 2 passed.
- Rust focused tests: passed.
- `pnpm exec tsc --noEmit`: still fails on pre-existing SceneEdit test fixture
  errors in:
  - `src/page/SceneEdit/utils/sceneDaeSessionImport.test.ts`
  - `src/page/SceneEdit/utils/sceneModelReplacePreview.test.ts`
  The error list no longer includes files touched by this follow-up.

Cleanup/status:

- Confirmed no `D:\output\minecraft\test3_plane_clear2*probe.obj` files remain.
- Kept the user review OBJ intentionally:
  `D:\output\minecraft\test3_plane_clear2_collision_high_precision_49682_review.obj`

## Game-Original HKT Comparison (2026-06-05 late follow-up)

User pointed out that the real question is not only FBX -> OBJ preview quality,
but why the game's own complex HKTs work while our generated HKT can still fail
or look structurally wrong. Two on-disk files were compared:

- generated/problematic file:
  `E:\XB\解包\com\test\0x16F73C97\0\0\base\map_hit.hkt`
- game-original reference:
  `E:\XB\解包\com\test\0x7A57BA57\0\0\base\map_hit.hkt`

### Structural comparison

`scripts/hkt_struct_verify.ps1` results:

- `0x7A57BA57`:
  - `shapeCount=2`
  - `meshDataCount=2`
  - main shape:
    - `numShapeKeyBits=14`
    - `triangleIsInteriorBits=10462`
    - `numPrimitiveKeys=6735`
    - `bitsPerKey=14`
    - `maxKeyValue=10461`
    - `meshNodes=81`
    - `sections=41`
    - `primitives=3486`
    - `sharedVerticesIndex=1512`
    - `packedVertices=2750`
    - `sharedVertices=727`
    - `primitiveDataRuns=351`
    - `hasSimdTree=true`
  - secondary shape:
    - `numPrimitiveKeys=16`
    - `sections=1`
    - `primitives=10`
    - `hasSimdTree=true`
- `0x16F73C97`:
  - `shapeCount=1`
  - `meshDataCount=1`
  - `numShapeKeyBits=17`
  - `triangleIsInteriorBits=99166`
  - `numPrimitiveKeys=99166`
  - `bitsPerKey=17`
  - `maxKeyValue=99165`
  - `meshNodes=781`
  - `sections=391`
  - `primitives=49583`
  - `sharedVerticesIndex=68682`
  - `packedVertices=5184`
  - `sharedVertices=20529`
  - `primitiveDataRuns=391`
  - `hasSimdTree=false`

### OBJ decode summary

Temporary XML/OBJ conversions were run and cleaned up immediately afterward.

- `0x7A57BA57` main decoded mesh:
  - `41` sections
  - `3486` primitives
  - `4392` vertices
  - `237` triangles
  - `3249` quads
- `0x16F73C97` decoded mesh:
  - `391` sections
  - `49583` primitives
  - `73866` vertices
  - `49583` triangles
  - `0` quads

### Findings

- The game does support more complex HKT than our earlier "65536 / 16-bit" guess
  alone can explain, but the more important difference is structural:
  - the game-original file is **multi-shape**
  - the game-original file uses mostly **real quads**, not only degenerate
    `[a,b,c,c]` triangle primitives
  - the game-original file keeps `hasSimdTree=true`
  - the game-original file uses `primitiveDataRuns=351` with only `41` sections,
    proving our current "one data run per section" simplification does not match
    every real asset
- Therefore the current builder is not failing merely because "HKT cannot be
  complex"; it is failing because we are still encoding a much denser, more
  triangle-heavy, single-shape approximation than the game's authored collision.

### Code changes from this comparison

- Removed the newly-added hard rejection that treated `>65536` primitive keys as
  a proven game/Havok format limit. The evidence from real files was not strong
  enough to keep that as a hard encoder rule.
- Kept a conservative frontend high-detail preset budget (`32k`) as a current
  single-shape encoder budget, but no longer label it as a guaranteed global HKT
  limit.
- Updated HKT XML review parsing in `src/utils/havokXmlParser.ts` to aggregate
  **all** `meshTree` records instead of silently taking only the first one.
- Updated Rust OBJ export in `src-tauri/src/havok_mesh_export.rs` to aggregate
  all meshTree records too.

### Verification

Commands:

```powershell
pnpm vitest run src/utils/havokXmlParser.test.ts src/page/SceneEdit/utils/hktSimplifyUtils.test.ts src/page/SceneEdit/components/dae-import/DaeImportHktSimplifyFields.test.tsx src/page/SceneEdit/components/havok/generateHktFromModelCache.test.ts
cargo test --manifest-path src-tauri\Cargo.toml validate_havok_shared_vertex_count_allows_u16_space --lib
```

Results:

- Frontend focused tests: `4` files passed, `17` tests passed.
- Rust focused compile/test: `1` test passed; the touched library code compiled.

## Authored Multi-Shape Redesign (2026-06-05 final pass)

Based on the structural comparison above, the encoder was redesigned so HKT
generation no longer assumes "all primitives are degenerate quads in one shape".

### Main implementation changes

- Added authored collision types in `src-tauri/src/collision_mesh/types.rs`:
  - `CollisionPrimitive::{Triangle, Quad}`
  - `CollisionPrimitiveMesh`
  - `AuthoredCollisionSet`
- Added `author_collision_shapes()` in
  `src-tauri/src/collision_mesh/simplify.rs`:
  - runs the existing simplify path first
  - merges coplanar triangle pairs into real quads when valid
  - splits authored collision into multiple connected shapes under a primitive-key budget
- Refactored `src-tauri/src/havok_mesh_encode.rs`:
  - section/BVH encoding now works on `CollisionPrimitiveMesh` instead of only `CollisionTriMesh`
  - triangle primitive keys now count as `1`
  - quad primitive keys now count as `2`
  - added faithful sample-template multi-shape output by duplicating
    `bodyCinfos`, `hknpCompressedMeshShape`, and `hknpCompressedMeshShapeData`
    blocks with fresh object ids
  - neutralization of `hasSimdTree` now patches all duplicated shape-data blocks
- Updated generation/review entry points:
  - `src-tauri/src/havok_collision_encode.rs`
  - `src-tauri/src/scene_session_commands.rs`
  so HKT input preview, OBJ review export, and mesh->HKT generation now all use
  the authored collision set rather than a plain simplified triangle mesh.

### Important behavioral correction

The previous builder effectively did:

- every primitive encoded as `[a,b,c,c]`
- every primitive counted as `2` keys

The new builder distinguishes:

- triangle -> one primitive record, `1` key
- quad -> one primitive record, `2` keys

This matches the real-game sample evidence:

- original main shape: `3249 * 2 + 237 = 6735` primitive keys

### Verification

Commands:

```powershell
cargo test --manifest-path src-tauri\Cargo.toml --lib havok_mesh_encode -- --nocapture
cargo test --manifest-path src-tauri\Cargo.toml --lib havok_collision_encode -- --nocapture
cargo test --manifest-path src-tauri\Cargo.toml --lib scene_session_commands::tests::hkt_ -- --nocapture
rustfmt --edition 2021 src-tauri/src/havok_mesh_encode.rs src-tauri/src/havok_collision_encode.rs src-tauri/src/scene_session_commands.rs
```

Results:

- `havok_mesh_encode` focused tests: `13` passed.
- `havok_collision_encode` focused tests: `7` passed, `3` ignored.
- `scene_session_commands` HKT-focused tests: `5` passed.
- Full `cargo test --lib` still reports unrelated pre-existing failures in:
  - `format::fhm2d_stage::tests::repack_then_extract_folder_tree_is_correct`
  - `ssbh_motion::normalize_frame_tests::animate_skel_cpu_maps_namespaced_node_names_to_skeleton_names`
  - `ssbh_motion::normalize_frame_tests::animate_skel_cpu_maps_transform_track_by_name_not_first_track`

### Remaining gap

This redesign aligns the builder with the biggest structural differences
(multi-shape + real quad key counts), but it still does **not** reproduce every
detail of game-authored HKT:

- `primitiveDataRuns` grouping still differs from the original sample
- authored shape packing is still more fragmented than the original sample for
  some generated inputs

## Test2 shared-vertex spike fix (2026-06-06)

User reviewed `D:\output\minecraft\test2_authored_collision_review.obj` and
reported that about 30% of the mesh still looked spiky.

Root cause:

- The generated XML wrote `sharedVertices` as `*sv as i64`.
- Many valid Havok shared-vertex values use the high bit. Original game XML from
  `E:\XB\解包\com\test\0x7A57BA57\0\0\base\map_hit.hkt` has positive values
  greater than `i64::MAX`.
- Our cast emitted negative XML integers. HCT accepted the XML but roundtripped
  those entries as different positive values, moving shared vertices across the
  map and creating long spike faces.

Fix:

- `src-tauri/src/havok_mesh_encode.rs` now formats shared vertices as unsigned
  `u64` decimal values.
- `src-tauri/src/havok_mesh_export.rs` now reads unsigned `u64` shared vertices
  and still accepts legacy negative diagnostic XML by two's-complement casting.
- Added `quadMergeEnabled` / `Real Quads` as an HKT option. It defaults to true;
  disabling it skips authored quad merging and emits triangle primitives only.
- `src-tauri/src/bin/gen_hkt_from_import.rs` accepts `HKT_QUAD_MERGE=0` for CLI
  triangle-only diagnostics.

Verification commands:

```powershell
cargo test --manifest-path src-tauri\Cargo.toml --lib quad_merge -- --nocapture
cargo test --manifest-path src-tauri\Cargo.toml --lib havok_mesh_ -- --nocapture
cargo test --manifest-path src-tauri\Cargo.toml --lib hkt_simplify_to_options -- --nocapture
pnpm vitest run src/page/SceneEdit/utils/hktSimplifyUtils.test.ts src/page/SceneEdit/components/havok/generateHktFromModelCache.test.ts
pnpm tsc --noEmit
cargo run --manifest-path src-tauri\Cargo.toml --bin gen_hkt_from_import -- "D:\output\minecraft\test2.fbx" "D:\output\minecraft\test2_authored_collision_u64.hkt"
powershell -ExecutionPolicy Bypass -File scripts\hkt_struct_verify.ps1 -HktPath "D:\output\minecraft\test2_authored_collision_u64.hkt" -OutXmlPath "D:\output\minecraft\test2_authored_collision_u64.roundtrip.xml"
cargo run --manifest-path src-tauri\Cargo.toml --bin hkt_xml_to_obj -- "D:\output\minecraft\test2_authored_collision_u64.roundtrip.xml" "D:\output\minecraft\test2_authored_collision_u64_review.obj"
```

Results:

- `quad_merge`: 3 passed.
- `havok_mesh_`: 16 passed.
- `hkt_simplify_to_options`: 4 passed.
- Frontend focused vitest: 2 files passed, 14 tests passed.
- `pnpm tsc --noEmit` still fails on unrelated existing test mock type errors in
  `sceneDaeSessionImport.test.ts` and `sceneModelReplacePreview.test.ts`.
- New HKT structure check: 70 shapes, 70 mesh data blocks, no reported errors.
- Shared-vertex preservation check:
  - generated XML: 25,537 shared vertices, 0 negative, 14,654 values > `i64::MAX`
  - HKT roundtrip XML: same counts and maximum value
- Edge metric improvement on review OBJ:
  - old `test2_authored_collision_review.obj`: max edge ~10,799; faces with
    max edge > 5,000 = 1,275
  - new `test2_authored_collision_u64_review.obj`: max edge ~1,456; faces with
    max edge > 5,000 = 0

Temporary diagnostic files deleted:

- `D:\output\minecraft\test2_authored_collision_prexml_diagnostic.obj`
- `D:\output\minecraft\test2_authored_collision_py_diagnostic.obj`
- `D:\output\minecraft\original_0x7A57BA57_map_hit_diagnostic.xml`
