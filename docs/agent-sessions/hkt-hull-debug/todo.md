# HKT Hull Debug Todo

## Objective

Analyze and fix the `src-tauri` HKT convex-hull collision generation path for FBX input.
The current preview OBJ/HKT geometry can become visibly corrupted, described by the
user as looking like a fuzzy ball.

## Test Input

- `D:\output\minecraft\test3_plane_clear2.fbx`

## Constraints

- Temporary diagnostic OBJ files may be written under `D:\output\minecraft`.
- Delete diagnostic OBJ files before handoff unless explicitly kept for user inspection.
- Do not start a dev server.
- Communicate with the user in Chinese; code and code comments stay English.

## Tasks

- [x] Read `AGENTS.md` and `.cursor/rules/custom-rules.mdc`.
- [x] Search and read relevant Havok/HKT docs.
- [x] Locate the FBX -> collision mesh -> simplify/hull -> HKT/preview OBJ flow.
- [x] Reproduce the corrupted hull behavior with the provided FBX.
- [x] Identify the root cause in point extraction, hull generation, simplification, or preview export.
- [x] Apply the smallest evidence-backed fix if code changes are needed.
- [x] Run focused Rust tests or command-line verification.
- [x] Remove temporary diagnostic OBJ files that are not intentionally handed off.
- [x] Expose the high-precision shape-preserving HKT option in frontend presets.
- [x] Add frontend review-stage controls for merged mesh, HKT input mesh, and decoded HKT mesh.
- [x] Add a backend OBJ export command for the exact HKT input review mesh.
- [x] Wire the Generate HKT from New Model dialog to preview selected stages and export review OBJ.

## Current Status

- Fixed: thin but nonzero terrain now uses a closed 2D outline slab instead of a
  3D QuickHull envelope.
- Verified on `D:\output\minecraft\test3_plane_clear2.fbx`.
- Generated a high-precision review OBJ for user inspection:
  `D:\output\minecraft\test3_plane_clear2_collision_high_precision_49682_review.obj`.
- Added frontend controls for the accepted high-precision route and review stages.
- Added backend `scene_export_hkt_collision_review_obj_path` for exporting the
  same mesh that will be encoded into HKT.
