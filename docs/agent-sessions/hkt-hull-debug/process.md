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
