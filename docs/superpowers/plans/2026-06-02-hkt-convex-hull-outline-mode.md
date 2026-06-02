# HKT Convex-Hull "Outline" Collision Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second collision-generation strategy to the HKT generate/regenerate pipeline — a convex-hull "outer frame" mode that produces a coarse low-poly collision shell (e.g. a 1000-face disc → a ~hexagonal slab) instead of the existing shape-preserving simplification, exposed through a Rust core option and a frontend strategy selector.

**Architecture:** The existing pipeline (`parse → bake_and_merge_collision_mesh → simplify_collision_mesh → HKT`) routes every entry point (preview stats, 3D preview, generate, regenerate) through one function: `simplify_collision_mesh`. We make that function **mode-aware**: a new `CollisionSimplifyMode::ConvexHull` branch computes a convex hull (3D via the `chull` quickhull crate; planar input via a hand-rolled 2D monotone-chain hull) and collapses it to a face budget by **reusing** the existing coplanar-merge + target-decimation code. The config flows TS → Rust as a new `strategy` + `hullTargetFaces` pair. The UI gains a segmented "strategy" selector that swaps between the existing shape-preserving presets and a new set of convex-hull coarseness presets.

**Tech Stack:** Rust (Tauri backend, `chull = "0.2.4"` quickhull), TypeScript/React (Vite + Vitest + Testing Library, shadcn-style UI components).

---

## Background — current architecture (read first)

The engineer implementing this has zero context. Key facts established by code review:

- **One core function, four call paths.** `collision_mesh::simplify_collision_mesh(mesh, options)` is called by:
  1. `havok_collision_encode::preview_hkt_collision_from_import_bytes` (preview stats),
  2. `havok_collision_encode::preview_hkt_collision_mesh_from_import_bytes` (3D preview geometry),
  3. `havok_collision_encode::generate_hkt_from_import_scene` (final HKT generation),
  4. `scene_session_commands::scene_generate_hkt_from_mesh` (regenerate from an existing numshb mesh),
  plus `havok_mesh_encode::fit_to_single_section` (a **second** simplify pass inside XML encoding), and two dev-only `src/bin` diagnostic tools.
  Making `simplify_collision_mesh` mode-aware therefore lights up all real paths at once.

- **Current algorithm is shape-preserving** (`src-tauri/src/collision_mesh/simplify.rs`): weld → cluster coplanar adjacent triangles by normal angle → ear-clip retriangulate each region's boundary loop → optional spatial-cluster decimation to a target triangle count. It always keeps the full surface, so a big flat plain stays huge. There is **no** outer-hull mode today.

- **Config object shape:**
  - Rust core: `CollisionSimplifyOptions` (in `collision_mesh/types.rs`) — `enabled, cos_planarity_threshold, min_triangle_area, weld_epsilon, target_triangle_ratio, max_target_triangles`. Derives `Debug, Clone, Copy, PartialEq`.
  - Rust session DTO: `HktSimplifyConfig` (in `scene_memory_session.rs`, `#[serde(rename_all="camelCase")]`) — `enabled, planarity_angle_deg, min_triangle_area, weld_epsilon, target_triangle_ratio, max_target_triangles`. Converted to core options by `hkt_simplify_to_options` in `scene_session_commands.rs`.
  - TS: `HktSimplifyConfig` (in `daeImportTypes.ts`) — `preset, enabled, planarityAngleDeg, minTriangleArea, weldEpsilon, targetTriangleRatio, maxTargetTriangles`. Built by `hktSimplifyConfigFromPreset` in `hktSimplifyUtils.ts`. `preset` is **frontend-only** (Rust DTO ignores unknown serde fields).

- **`chull` v0.2.4 API** (verified on docs.rs): `chull::ConvexHullWrapper::try_new(&points: &Vec<Vec<f64>>, None) -> Result<_, _>`, then `.vertices_indices() -> (Vec<Vec<f64>>, Vec<usize>)` (deduplicated, indexed triangle list). 3D quickhull is degenerate on perfectly coplanar input, so flat terrain MUST take a separate 2D-hull path.

- **Test runners:** Rust `#[cfg(test)]` modules (run `cargo test --manifest-path src-tauri/Cargo.toml <filter>`). Frontend Vitest (run `pnpm vitest run <file>`). **Do NOT run `pnpm dev`/`tauri dev`.** `pnpm build` currently has *pre-existing* tsc errors in SceneEdit unrelated to this work — verify TS via Vitest and a scoped `tsc --noEmit`, and only require *no new* errors.

---

## File Structure

**Rust (`src-tauri/src/`):**
- `collision_mesh/types.rs` — MODIFY: add `CollisionSimplifyMode` enum + two fields on `CollisionSimplifyOptions`.
- `collision_mesh/convex_hull.rs` — CREATE: the convex-hull collision builder (3D + planar + budget). One clear responsibility.
- `collision_mesh/simplify.rs` — MODIFY: `simplify_collision_mesh` returns `Result` and dispatches on `mode`; extract the current body into `shape_preserving_simplify`; make `weld_vertices` `pub(super)`; update tests to `.unwrap()`.
- `collision_mesh/mod.rs` — MODIFY: declare `mod convex_hull;`, re-export `CollisionSimplifyMode`.
- `havok_collision_encode.rs` — MODIFY: add `?` at 3 call sites + 1 test `.unwrap()`.
- `havok_mesh_encode.rs` — MODIFY: add `?` at the `fit_to_single_section` call site.
- `scene_memory_session.rs` — MODIFY: add `CollisionStrategy` enum + `strategy` & `hull_target_faces` fields on `HktSimplifyConfig`.
- `scene_session_commands.rs` — MODIFY: map the new fields in `hkt_simplify_to_options`; add `?` at the regenerate call site; add a conversion test.
- `bin/debug_hkt_to_obj.rs`, `bin/gen_hkt_variants.rs` — MODIFY: fix the changed signature / struct literal in dev tools.
- `Cargo.toml` — MODIFY: add `chull = "0.2.4"`.

**Frontend (`src/page/SceneEdit/`):**
- `components/dae-import/daeImportTypes.ts` — MODIFY: add `HktSimplifyStrategy`, `HktHullPreset`, and 3 fields on `HktSimplifyConfig`.
- `utils/hktSimplifyUtils.ts` — MODIFY: add hull presets + `hktHullConfigFromPreset`; update `hktSimplifyConfigFromPreset` and `normalizeHktSimplifyConfig`.
- `components/dae-import/DaeImportHktSimplifyFields.tsx` — MODIFY: add the strategy segmented control + conditional sub-preset; extend preview dep array.
- `utils/hktSimplifyUtils.test.ts`, `components/dae-import/DaeImportHktSimplifyFields.test.tsx` — MODIFY: add tests.

---

## Task 1: Add the `chull` dependency

**Files:**
- Modify: `src-tauri/Cargo.toml:57` (after the existing `rayon = "1.10"` line in `[dependencies]`)

- [ ] **Step 1: Add the dependency line**

In `src-tauri/Cargo.toml`, add to the `[dependencies]` block (right after `rayon = "1.10"`):

```toml
chull = "0.2.4"
```

- [ ] **Step 2: Verify it resolves and compiles**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: build succeeds and `chull v0.2.4` appears in the dependency graph. If the build fails because of a transitive dependency, stop and report the exact crate/version — do not pin around it silently.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "build: add chull crate for convex-hull collision generation"
```

---

## Task 2: Add `CollisionSimplifyMode` and hull options to the core type

**Files:**
- Modify: `src-tauri/src/collision_mesh/types.rs`

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `#[cfg(test)] mod tests` block in `src-tauri/src/collision_mesh/types.rs` (after `from_ssbh_axis_applies_scale_and_z_up`):

```rust
    #[test]
    fn default_simplify_mode_is_shape_preserving() {
        let opts = CollisionSimplifyOptions::default();
        assert_eq!(opts.mode, CollisionSimplifyMode::ShapePreserving);
        assert_eq!(opts.hull_target_faces, None);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p app default_simplify_mode_is_shape_preserving`
Expected: FAIL to compile — `CollisionSimplifyMode` and `hull_target_faces` do not exist yet.

- [ ] **Step 3: Add the enum and fields**

In `src-tauri/src/collision_mesh/types.rs`, add the enum right above the `CollisionSimplifyOptions` struct definition:

```rust
/// How collision geometry is reduced before HKT encoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CollisionSimplifyMode {
    /// Merge coplanar faces and optionally decimate, keeping the original surface.
    #[default]
    ShapePreserving,
    /// Replace the geometry with a coarse convex hull ("outer frame").
    ConvexHull,
}
```

Add the two fields to `CollisionSimplifyOptions` (after `max_target_triangles`):

```rust
    /// Optional absolute cap applied with `target_triangle_ratio`.
    pub max_target_triangles: Option<usize>,
    /// Collision reduction strategy.
    pub mode: CollisionSimplifyMode,
    /// For `ConvexHull` mode: collapse the hull toward this many faces (None = no extra budget).
    pub hull_target_faces: Option<usize>,
```

Add both fields to the `Default for CollisionSimplifyOptions` impl (after `max_target_triangles: None,`):

```rust
            max_target_triangles: None,
            mode: CollisionSimplifyMode::ShapePreserving,
            hull_target_faces: None,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p app default_simplify_mode_is_shape_preserving`
Expected: PASS. (Other crates will not compile yet — that is fixed in Task 4/5. Run the focused test by building only this module's tests; if the workspace fails to compile due to the literal at `gen_hkt_variants.rs:199`, defer running until after Step 5.)

- [ ] **Step 5: Fix the explicit struct literal in the dev tool**

`src-tauri/src/bin/gen_hkt_variants.rs:199` constructs `CollisionSimplifyOptions { ... }` without `..Default::default()`, so it now misses two fields. Update that literal (the `V2_low` block) to include the new fields:

```rust
        &CollisionSimplifyOptions {
            enabled: true,
            cos_planarity_threshold: cos_planarity_from_angle_deg(60.0),
            min_triangle_area: 1e-3,
            weld_epsilon: 1e-2,
            target_triangle_ratio: Some(0.05),
            max_target_triangles: Some(50_000),
            mode: crate::collision_mesh::CollisionSimplifyMode::ShapePreserving,
            hull_target_faces: None,
        },
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/collision_mesh/types.rs src-tauri/src/bin/gen_hkt_variants.rs
git commit -m "feat(collision): add CollisionSimplifyMode and hull options to core type"
```

---

## Task 3: Implement the convex-hull collision builder

**Files:**
- Create: `src-tauri/src/collision_mesh/convex_hull.rs`
- Modify: `src-tauri/src/collision_mesh/simplify.rs` (make `weld_vertices` reusable)
- Modify: `src-tauri/src/collision_mesh/mod.rs` (declare the module)

This task creates the builder but does not wire it into dispatch yet (that is Task 4). It is unit-tested in isolation via a temporary `pub` entry point.

- [ ] **Step 1: Make `weld_vertices` reusable**

In `src-tauri/src/collision_mesh/simplify.rs`, change the visibility of `weld_vertices` (currently `fn weld_vertices`) to:

```rust
pub(super) fn weld_vertices(mesh: &CollisionTriMesh, epsilon: f64) -> CollisionTriMesh {
```

- [ ] **Step 2: Declare the module**

In `src-tauri/src/collision_mesh/mod.rs`, add `mod convex_hull;` in alphabetical order (after `mod axis;`):

```rust
mod axis;
mod convex_hull;
mod import;
mod simplify;
mod skin_bake;
mod types;
```

Update the `types` re-export to also export the new enum:

```rust
pub use types::{
    cos_planarity_from_angle_deg, CollisionMeshOptions, CollisionSimplifyMode,
    CollisionSimplifyOptions, CollisionTriMesh,
};
```

- [ ] **Step 3: Write the convex-hull module with its failing tests**

Create `src-tauri/src/collision_mesh/convex_hull.rs` with the full implementation and tests below:

```rust
//! Convex-hull collision shell ("outer frame" mode).
//!
//! Produces a coarse convex collision mesh instead of a shape-preserving one.
//! Volumetric input goes through a 3D quickhull (`chull`) then a face-budget
//! collapse that reuses the shape-preserving coplanar-merge + target-decimation
//! code. Near-planar input (flat terrain, discs) is degenerate for a 3D hull, so
//! it is handled with a 2D monotone-chain hull whose polygon is decimated to the
//! face budget and fan-triangulated. Convexity is intentional: concavities are
//! filled — this is the rough "outer frame" the caller asked for.

use chull::ConvexHullWrapper;

use super::simplify::{simplify_collision_mesh, weld_vertices};
use super::types::{
    cos_planarity_from_angle_deg, CollisionSimplifyMode, CollisionSimplifyOptions, CollisionTriMesh,
};

/// Thin-axis extent below this fraction of the largest extent is treated as planar.
const PLANARITY_RATIO: f64 = 1e-3;
/// Near-coplanar hull facets within this angle merge during the budget collapse.
const HULL_FACET_MERGE_ANGLE_DEG: f64 = 2.0;
const MIN_HULL_POINTS: usize = 3;

/// Build a coarse convex-hull collision mesh.
pub fn convex_hull_collision_mesh(
    mesh: &CollisionTriMesh,
    options: &CollisionSimplifyOptions,
) -> Result<CollisionTriMesh, String> {
    let welded = weld_vertices(mesh, options.weld_epsilon);
    let points = &welded.vertices;
    if points.len() < MIN_HULL_POINTS {
        return Err(format!(
            "Convex hull collision needs at least {MIN_HULL_POINTS} distinct vertices, got {}",
            points.len()
        ));
    }

    let (min, max) = welded
        .compute_aabb()
        .map_err(|e| format!("Convex hull: {e}"))?;
    let extents = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    let max_extent = extents.iter().copied().fold(0.0_f64, f64::max);
    if max_extent <= 0.0 {
        return Err("Convex hull: collision mesh has zero size".into());
    }
    let thin_axis = (0..3)
        .min_by(|&a, &b| extents[a].total_cmp(&extents[b]))
        .unwrap_or(0);

    if extents[thin_axis] <= max_extent * PLANARITY_RATIO {
        return planar_hull_mesh(points, thin_axis, options.hull_target_faces);
    }

    let hull = hull_3d(points)?;
    collapse_hull_to_budget(&hull, options)
}

/// 3D convex hull of a point cloud via quickhull.
fn hull_3d(points: &[[f64; 3]]) -> Result<CollisionTriMesh, String> {
    let pts: Vec<Vec<f64>> = points.iter().map(|p| vec![p[0], p[1], p[2]]).collect();
    let hull = ConvexHullWrapper::try_new(&pts, None)
        .map_err(|e| format!("Convex hull computation failed: {e:?}"))?;
    let (verts, indices) = hull.vertices_indices();
    if indices.len() < 3 {
        return Err("Convex hull produced no triangles".into());
    }
    let vertices: Vec<[f64; 3]> = verts.into_iter().map(|v| [v[0], v[1], v[2]]).collect();
    let indices: Vec<u32> = indices.into_iter().map(|i| i as u32).collect();
    Ok(CollisionTriMesh { vertices, indices })
}

/// Collapse a (convex, already-welded) hull mesh toward the face budget by
/// reusing the shape-preserving simplifier: coplanar facets merge, and a target
/// cap decimates curved hulls (spheres) toward `hull_target_faces`.
fn collapse_hull_to_budget(
    hull: &CollisionTriMesh,
    options: &CollisionSimplifyOptions,
) -> Result<CollisionTriMesh, String> {
    let collapse_opts = CollisionSimplifyOptions {
        enabled: true,
        cos_planarity_threshold: cos_planarity_from_angle_deg(HULL_FACET_MERGE_ANGLE_DEG),
        min_triangle_area: options.min_triangle_area,
        // Hull vertices are already distinct; do not re-weld and distort them.
        weld_epsilon: 0.0,
        target_triangle_ratio: None,
        max_target_triangles: options.hull_target_faces,
        mode: CollisionSimplifyMode::ShapePreserving,
        hull_target_faces: None,
    };
    simplify_collision_mesh(hull, &collapse_opts)
}

/// Planar input: 2D convex hull in the dominant plane, decimated to budget, fanned.
fn planar_hull_mesh(
    points: &[[f64; 3]],
    thin_axis: usize,
    budget: Option<usize>,
) -> Result<CollisionTriMesh, String> {
    let (ax, ay) = match thin_axis {
        0 => (1usize, 2usize),
        1 => (0usize, 2usize),
        _ => (0usize, 1usize),
    };
    let plane = points.iter().map(|p| p[thin_axis]).sum::<f64>() / points.len() as f64;

    let pts2d: Vec<[f64; 2]> = points.iter().map(|p| [p[ax], p[ay]]).collect();
    let hull = monotone_chain(&pts2d);
    if hull.len() < 3 {
        return Err("Convex hull: planar input is degenerate (collinear points)".into());
    }

    // A polygon of V vertices fan-triangulates to V-2 triangles.
    let target_verts = budget.map(|faces| (faces + 2).max(3));
    let kept = simplify_polygon(&pts2d, &hull, target_verts);

    let mut vertices: Vec<[f64; 3]> = Vec::with_capacity(kept.len());
    for &i in &kept {
        let mut v = [0.0_f64; 3];
        v[ax] = pts2d[i][0];
        v[ay] = pts2d[i][1];
        v[thin_axis] = plane;
        vertices.push(v);
    }

    let mut indices: Vec<u32> = Vec::new();
    for k in 1..vertices.len().saturating_sub(1) {
        indices.extend_from_slice(&[0, k as u32, (k + 1) as u32]);
    }
    if indices.is_empty() {
        return Err("Convex hull: planar hull collapsed below a triangle".into());
    }
    Ok(CollisionTriMesh { vertices, indices })
}

/// Andrew's monotone chain → CCW hull as indices into `points`, no repeated endpoint.
fn monotone_chain(points: &[[f64; 2]]) -> Vec<usize> {
    let mut idx: Vec<usize> = (0..points.len()).collect();
    idx.sort_by(|&a, &b| {
        points[a][0]
            .total_cmp(&points[b][0])
            .then(points[a][1].total_cmp(&points[b][1]))
    });
    idx.dedup_by(|&mut a, &mut b| points[a] == points[b]);
    if idx.len() < 3 {
        return idx;
    }

    let cross = |o: usize, a: usize, b: usize| -> f64 {
        (points[a][0] - points[o][0]) * (points[b][1] - points[o][1])
            - (points[a][1] - points[o][1]) * (points[b][0] - points[o][0])
    };

    let mut lower: Vec<usize> = Vec::new();
    for &p in &idx {
        while lower.len() >= 2 && cross(lower[lower.len() - 2], lower[lower.len() - 1], p) <= 0.0 {
            lower.pop();
        }
        lower.push(p);
    }
    let mut upper: Vec<usize> = Vec::new();
    for &p in idx.iter().rev() {
        while upper.len() >= 2 && cross(upper[upper.len() - 2], upper[upper.len() - 1], p) <= 0.0 {
            upper.pop();
        }
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    lower.extend(upper);
    lower
}

/// Visvalingam–Whyatt: drop the least-significant vertex until `<= target` remain.
fn simplify_polygon(points: &[[f64; 2]], hull: &[usize], target: Option<usize>) -> Vec<usize> {
    let Some(target) = target else {
        return hull.to_vec();
    };
    let target = target.max(3);
    let mut ring: Vec<usize> = hull.to_vec();
    while ring.len() > target {
        let n = ring.len();
        let mut min_area = f64::INFINITY;
        let mut min_at = 0usize;
        for i in 0..n {
            let prev = points[ring[(i + n - 1) % n]];
            let cur = points[ring[i]];
            let next = points[ring[(i + 1) % n]];
            let area = ((cur[0] - prev[0]) * (next[1] - prev[1])
                - (cur[1] - prev[1]) * (next[0] - prev[0]))
                .abs()
                * 0.5;
            if area < min_area {
                min_area = area;
                min_at = i;
            }
        }
        ring.remove(min_at);
    }
    ring
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collision_mesh::types::CollisionTriMesh;

    /// Axis-aligned unit cube, each face split into 2 triangles (8 verts, 12 tris).
    fn cube_mesh() -> CollisionTriMesh {
        let vertices = vec![
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0],
            [1.0, 0.0, 1.0],
            [1.0, 1.0, 1.0],
            [0.0, 1.0, 1.0],
        ];
        let indices = vec![
            0, 2, 1, 0, 3, 2, // bottom
            4, 5, 6, 4, 6, 7, // top
            0, 1, 5, 0, 5, 4, // front
            1, 2, 6, 1, 6, 5, // right
            2, 3, 7, 2, 7, 6, // back
            3, 0, 4, 3, 4, 7, // left
        ];
        CollisionTriMesh { vertices, indices }
    }

    /// Flat disc on Z=0: a ring of `segments` points + a center vertex, fanned.
    fn flat_disc(segments: usize) -> CollisionTriMesh {
        let mut vertices = vec![[0.0, 0.0, 0.0]];
        for s in 0..segments {
            let a = std::f64::consts::TAU * s as f64 / segments as f64;
            vertices.push([a.cos(), a.sin(), 0.0]);
        }
        let mut indices = Vec::new();
        for s in 0..segments {
            let a = 1 + s as u32;
            let b = 1 + ((s + 1) % segments) as u32;
            indices.extend_from_slice(&[0, a, b]);
        }
        CollisionTriMesh { vertices, indices }
    }

    fn uv_sphere(lat: usize, lon: usize) -> CollisionTriMesh {
        let mut vertices = vec![[0.0, 0.0, 1.0]];
        for la in 1..lat {
            let theta = std::f64::consts::PI * la as f64 / lat as f64;
            let (z, r) = (theta.cos(), theta.sin());
            for lo in 0..lon {
                let phi = std::f64::consts::TAU * lo as f64 / lon as f64;
                vertices.push([r * phi.cos(), r * phi.sin(), z]);
            }
        }
        let bottom = vertices.len() as u32;
        vertices.push([0.0, 0.0, -1.0]);
        let ring = |la: usize, lo: usize| 1 + ((la - 1) * lon + (lo % lon)) as u32;
        let mut indices = Vec::new();
        for lo in 0..lon {
            indices.extend_from_slice(&[0, ring(1, lo + 1), ring(1, lo)]);
        }
        for la in 1..lat - 1 {
            for lo in 0..lon {
                let (a, b, c, d) = (ring(la, lo), ring(la, lo + 1), ring(la + 1, lo + 1), ring(la + 1, lo));
                indices.extend_from_slice(&[a, b, c, a, c, d]);
            }
        }
        for lo in 0..lon {
            indices.extend_from_slice(&[ring(lat - 1, lo), ring(lat - 1, lo + 1), bottom]);
        }
        CollisionTriMesh { vertices, indices }
    }

    fn opts(hull_target_faces: Option<usize>) -> CollisionSimplifyOptions {
        CollisionSimplifyOptions {
            mode: CollisionSimplifyMode::ConvexHull,
            hull_target_faces,
            weld_epsilon: 1e-6,
            min_triangle_area: 1e-9,
            ..Default::default()
        }
    }

    #[test]
    fn cube_hull_collapses_to_twelve_triangles() {
        let out = convex_hull_collision_mesh(&cube_mesh(), &opts(None)).unwrap();
        assert_eq!(
            out.triangle_count(),
            12,
            "a box hull's 6 flat faces collapse to 12 triangles"
        );
    }

    #[test]
    fn planar_disc_collapses_to_budget_fan() {
        let out = convex_hull_collision_mesh(&flat_disc(64), &opts(Some(6))).unwrap();
        assert_eq!(out.triangle_count(), 6, "budget 6 -> 8-gon fan = 6 tris");
        assert!(
            out.vertices.iter().all(|v| v[2].abs() < 1e-9),
            "planar hull stays on the source plane"
        );
    }

    #[test]
    fn sphere_hull_respects_face_budget() {
        let full = convex_hull_collision_mesh(&uv_sphere(8, 12), &opts(None)).unwrap();
        let budgeted = convex_hull_collision_mesh(&uv_sphere(8, 12), &opts(Some(24))).unwrap();
        assert!(
            budgeted.triangle_count() < full.triangle_count(),
            "a face budget must reduce the hull (full={}, budgeted={})",
            full.triangle_count(),
            budgeted.triangle_count()
        );
        assert!(budgeted.triangle_count() <= 48, "stays near the 24-face budget");
        assert!(budgeted.triangle_count() >= 4, "does not collapse to nothing");
    }

    #[test]
    fn too_few_points_errors() {
        let mesh = CollisionTriMesh {
            vertices: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]],
            indices: vec![],
        };
        let err = convex_hull_collision_mesh(&mesh, &opts(None)).unwrap_err();
        assert!(err.contains("at least"), "got: {err}");
    }
}
```

- [ ] **Step 4: Temporarily expose the builder for isolated testing**

So the tests in Step 3 can run before dispatch wiring (Task 4), `convex_hull_collision_mesh` is already `pub` and the module is declared. The function calls `simplify_collision_mesh`, which still returns `CollisionTriMesh` (not `Result`) at this point — so this module will NOT compile until Task 4 changes that signature. **Do Task 4 immediately after writing this file**; run this task's tests at the end of Task 4 Step 4. (The two tasks are tightly coupled; treat Tasks 3 and 4 as one commit boundary.)

- [ ] **Step 5: (deferred) run tests — see Task 4 Step 4.**

---

## Task 4: Make `simplify_collision_mesh` mode-aware (returns `Result`)

**Files:**
- Modify: `src-tauri/src/collision_mesh/simplify.rs`
- Modify: `src-tauri/src/havok_collision_encode.rs`
- Modify: `src-tauri/src/havok_mesh_encode.rs`
- Modify: `src-tauri/src/scene_session_commands.rs`
- Modify: `src-tauri/src/bin/debug_hkt_to_obj.rs`
- Modify: `src-tauri/src/bin/gen_hkt_variants.rs`

- [ ] **Step 1: Convert the entry point to dispatch + `Result`**

In `src-tauri/src/collision_mesh/simplify.rs`, update the imports at the top of the file:

```rust
use super::types::{CollisionSimplifyMode, CollisionSimplifyOptions, CollisionTriMesh};
```

Replace the existing `pub fn simplify_collision_mesh(...) -> CollisionTriMesh { ... }` (the whole function body, lines ~733–790) with a dispatcher plus a private `shape_preserving_simplify` that holds the previous body:

```rust
/// Reduce a collision mesh according to `options.mode`.
pub fn simplify_collision_mesh(
    mesh: &CollisionTriMesh,
    options: &CollisionSimplifyOptions,
) -> Result<CollisionTriMesh, String> {
    if !options.enabled {
        return Ok(mesh.clone());
    }
    match options.mode {
        CollisionSimplifyMode::ConvexHull => {
            super::convex_hull::convex_hull_collision_mesh(mesh, options)
        }
        CollisionSimplifyMode::ShapePreserving => Ok(shape_preserving_simplify(mesh, options)),
    }
}

/// Simplify by merging coplanar regions (similar face normals), keeping the surface.
fn shape_preserving_simplify(
    mesh: &CollisionTriMesh,
    options: &CollisionSimplifyOptions,
) -> CollisionTriMesh {
    let welded = weld_vertices(mesh, options.weld_epsilon);

    let mut tris: Vec<TriInfo> = Vec::new();
    for chunk in welded.indices.chunks(3) {
        if chunk.len() != 3 {
            continue;
        }
        let tri = [chunk[0], chunk[1], chunk[2]];
        if let Some(info) = triangle_data(&welded.vertices, tri) {
            if info.area >= options.min_triangle_area {
                tris.push(info);
            }
        }
    }

    if tris.is_empty() {
        return welded;
    }

    let mut uf = cluster_coplanar(&tris, options.cos_planarity_threshold);

    let mut regions: HashMap<usize, Vec<usize>> = HashMap::new();
    for (i, _) in tris.iter().enumerate() {
        regions.entry(uf.find(i)).or_default().push(i);
    }

    let mut out_indices: Vec<u32> = Vec::new();
    for tri_indices in regions.values() {
        let region_tris: Vec<TriInfo> = tri_indices.iter().map(|&i| tris[i]).collect();
        for tri in retriangulate_region(&welded.vertices, &region_tris) {
            out_indices.extend_from_slice(&tri);
        }
    }

    let merged = if out_indices.is_empty() {
        welded
    } else {
        CollisionTriMesh {
            vertices: welded.vertices,
            indices: out_indices,
        }
    };

    if let Some(target) = target_triangle_count(merged.triangle_count(), options) {
        simplify_to_triangle_target(&merged, target, options.min_triangle_area)
    } else {
        merged
    }
}
```

- [ ] **Step 2: Update the simplify.rs unit tests to unwrap**

In the same file's `#[cfg(test)] mod tests`, the five existing tests call `let out = simplify_collision_mesh(&mesh, &opts);` (lines ~868, 891, 931, 946, 964, 980). Change each to `.unwrap()`:

```rust
        let out = simplify_collision_mesh(&mesh, &opts).unwrap();
```
and for the two `::default()` ones:
```rust
        let out = simplify_collision_mesh(&mesh, &CollisionSimplifyOptions::default()).unwrap();
```

- [ ] **Step 3: Update the production call sites to propagate with `?`**

`src-tauri/src/havok_collision_encode.rs` — three sites, all inside `Result`-returning functions:
- Line ~87 (`preview_hkt_collision_from_import_bytes`): `let simplified = simplify_collision_mesh(&merged, &options.simplify)?;`
- Line ~125 (`preview_hkt_collision_mesh_from_import_bytes`): `let simplified = simplify_collision_mesh(&merged, &options.simplify)?;`
- Line ~175 (`generate_hkt_from_import_scene`): `let mesh = simplify_collision_mesh(&merged, &options.simplify)?;`
- Test at line ~349 (inside `#[cfg(test)]`): `let simplified = simplify_collision_mesh(&mesh, &CollisionSimplifyOptions::default()).unwrap();`

`src-tauri/src/havok_mesh_encode.rs` line ~180 (`fit_to_single_section` returns `Result<CollisionTriMesh, String>`):

```rust
    let simplified = simplify_collision_mesh(mesh, &CollisionSimplifyOptions::default())?;
```

`src-tauri/src/scene_session_commands.rs` line ~1916 (inside the `spawn_blocking` closure that returns `Result`):

```rust
        let mesh = crate::collision_mesh::simplify_collision_mesh(&mesh, &simplify_opts)?;
```

`src-tauri/src/bin/debug_hkt_to_obj.rs` line ~133 (`process_file` returns `Result`):

```rust
    let simplified = simplify_collision_mesh(&merged, &options.simplify)?;
```

`src-tauri/src/bin/gen_hkt_variants.rs` lines ~197 and ~211 (diagnostic dev binary — use `.expect`, these are not shipped):

```rust
    let low = simplify_collision_mesh(
        &full,
        &CollisionSimplifyOptions {
            enabled: true,
            cos_planarity_threshold: cos_planarity_from_angle_deg(60.0),
            min_triangle_area: 1e-3,
            weld_epsilon: 1e-2,
            target_triangle_ratio: Some(0.05),
            max_target_triangles: Some(50_000),
            mode: crate::collision_mesh::CollisionSimplifyMode::ShapePreserving,
            hull_target_faces: None,
        },
    )
    .expect("V2_low simplify failed");
```
```rust
    let mid =
        simplify_collision_mesh(&full, &CollisionSimplifyOptions::default()).expect("V3_mid simplify failed");
```

- [ ] **Step 4: Run all collision tests (Tasks 3 + 4 together)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p app collision_mesh`
Expected: PASS — including the new `convex_hull` tests (`cube_hull_collapses_to_twelve_triangles`, `planar_disc_collapses_to_budget_fan`, `sphere_hull_respects_face_budget`, `too_few_points_errors`) and all updated shape-preserving tests.

Then confirm the whole crate (incl. bins) compiles:
Run: `cargo build --manifest-path src-tauri/Cargo.toml --all-targets`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/collision_mesh/ src-tauri/src/havok_collision_encode.rs src-tauri/src/havok_mesh_encode.rs src-tauri/src/scene_session_commands.rs src-tauri/src/bin/debug_hkt_to_obj.rs src-tauri/src/bin/gen_hkt_variants.rs
git commit -m "feat(collision): add convex-hull outline mode with budget collapse"
```

---

## Task 5: Wire the convex-hull strategy through the session config

**Files:**
- Modify: `src-tauri/src/scene_memory_session.rs`
- Modify: `src-tauri/src/scene_session_commands.rs`

- [ ] **Step 1: Write the failing conversion test**

In `src-tauri/src/scene_session_commands.rs`, inside the existing `#[cfg(test)] mod tests` (next to `hkt_simplify_to_options_converts_planarity_angle_deg`), add:

```rust
    #[test]
    fn hkt_simplify_to_options_maps_convex_hull_strategy() {
        let cfg = HktSimplifyConfig {
            strategy: crate::scene_memory_session::CollisionStrategy::ConvexHull,
            hull_target_faces: Some(48),
            ..HktSimplifyConfig::default()
        };
        let opts = hkt_simplify_to_options(&cfg);
        assert_eq!(opts.mode, crate::collision_mesh::CollisionSimplifyMode::ConvexHull);
        assert_eq!(opts.hull_target_faces, Some(48));
    }

    #[test]
    fn hkt_simplify_to_options_defaults_to_shape_preserving() {
        let opts = hkt_simplify_to_options(&HktSimplifyConfig::default());
        assert_eq!(opts.mode, crate::collision_mesh::CollisionSimplifyMode::ShapePreserving);
        assert_eq!(opts.hull_target_faces, None);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p app hkt_simplify_to_options_maps_convex_hull_strategy`
Expected: FAIL to compile — `CollisionStrategy`, `strategy`, and `hull_target_faces` do not exist on `HktSimplifyConfig`.

- [ ] **Step 3: Add the strategy enum and fields to the session DTO**

In `src-tauri/src/scene_memory_session.rs`, add the enum above `HktSimplifyConfig`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum CollisionStrategy {
    #[default]
    ShapePreserving,
    ConvexHull,
}
```

Add the two fields to `HktSimplifyConfig` (after `max_target_triangles`):

```rust
    #[serde(default)]
    pub max_target_triangles: Option<usize>,
    #[serde(default)]
    pub strategy: CollisionStrategy,
    #[serde(default)]
    pub hull_target_faces: Option<usize>,
```

Add them to the `Default for HktSimplifyConfig` impl (after `max_target_triangles: None,`):

```rust
            max_target_triangles: None,
            strategy: CollisionStrategy::ShapePreserving,
            hull_target_faces: None,
```

- [ ] **Step 4: Map the new fields in the conversion**

In `src-tauri/src/scene_session_commands.rs`, update `hkt_simplify_to_options` (the explicit `CollisionSimplifyOptions { ... }` literal at line ~283) to add the two new fields:

```rust
pub fn hkt_simplify_to_options(
    cfg: &crate::scene_memory_session::HktSimplifyConfig,
) -> crate::collision_mesh::CollisionSimplifyOptions {
    crate::collision_mesh::CollisionSimplifyOptions {
        enabled: cfg.enabled,
        cos_planarity_threshold: crate::collision_mesh::cos_planarity_from_angle_deg(
            cfg.planarity_angle_deg,
        ),
        min_triangle_area: cfg.min_triangle_area,
        weld_epsilon: cfg.weld_epsilon,
        target_triangle_ratio: cfg.target_triangle_ratio,
        max_target_triangles: cfg.max_target_triangles,
        mode: match cfg.strategy {
            crate::scene_memory_session::CollisionStrategy::ShapePreserving => {
                crate::collision_mesh::CollisionSimplifyMode::ShapePreserving
            }
            crate::scene_memory_session::CollisionStrategy::ConvexHull => {
                crate::collision_mesh::CollisionSimplifyMode::ConvexHull
            }
        },
        hull_target_faces: cfg.hull_target_faces,
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p app hkt_simplify_to_options`
Expected: PASS for all `hkt_simplify_to_options*` tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/scene_memory_session.rs src-tauri/src/scene_session_commands.rs
git commit -m "feat(scene): thread convex-hull strategy through HKT session config"
```

---

## Task 6: Frontend types + hull presets

**Files:**
- Modify: `src/page/SceneEdit/components/dae-import/daeImportTypes.ts`
- Modify: `src/page/SceneEdit/utils/hktSimplifyUtils.ts`
- Modify: `src/page/SceneEdit/utils/hktSimplifyUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/page/SceneEdit/utils/hktSimplifyUtils.test.ts`, add to the imports:

```ts
import {
  countHavokCollisionTriangles,
  DEFAULT_HKT_SIMPLIFY,
  HKT_HULL_PRESET_FACES,
  hktHullConfigFromPreset,
  hktSimplifyConfigFromPreset,
  normalizeHktSimplifyConfig,
  reductionPercent,
  serializeHktPreviewConfigKey,
} from "./hktSimplifyUtils";
```

Add these tests inside the `describe("hktSimplifyUtils", ...)` block:

```ts
  it("shape-preserving presets default to the shapePreserving strategy", () => {
    expect(hktSimplifyConfigFromPreset("medium").strategy).toBe("shapePreserving");
    expect(hktSimplifyConfigFromPreset("medium").hullTargetFaces).toBeNull();
  });

  it("maps hull presets to a convexHull strategy with a face budget", () => {
    const coarse = hktHullConfigFromPreset("coarse");
    expect(coarse.strategy).toBe("convexHull");
    expect(coarse.enabled).toBe(true);
    expect(coarse.hullPreset).toBe("coarse");
    expect(coarse.hullTargetFaces).toBe(HKT_HULL_PRESET_FACES.coarse);
    expect(hktHullConfigFromPreset("fine").hullTargetFaces).toBe(HKT_HULL_PRESET_FACES.fine);
  });

  it("normalize preserves a convexHull strategy and its hull preset", () => {
    const normalized = normalizeHktSimplifyConfig({ strategy: "convexHull", hullPreset: "balanced" });
    expect(normalized.strategy).toBe("convexHull");
    expect(normalized.hullPreset).toBe("balanced");
    expect(normalized.hullTargetFaces).toBe(HKT_HULL_PRESET_FACES.balanced);
  });

  it("preview key changes when the strategy changes", () => {
    const importConfig = { generateHkt: true, convertToSsbh: false, ssbhConfig: null } as const;
    const shape = serializeHktPreviewConfigKey(importConfig, DEFAULT_HKT_SIMPLIFY);
    const hull = serializeHktPreviewConfigKey(importConfig, hktHullConfigFromPreset("coarse"));
    expect(shape).not.toBe(hull);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/page/SceneEdit/utils/hktSimplifyUtils.test.ts`
Expected: FAIL — `hktHullConfigFromPreset`, `HKT_HULL_PRESET_FACES`, and the new fields do not exist.

- [ ] **Step 3: Extend the TS types**

In `src/page/SceneEdit/components/dae-import/daeImportTypes.ts`, replace the `HktSimplifyPreset` line and `HktSimplifyConfig` interface with:

```ts
export type HktSimplifyPreset = "none" | "medium" | "heavy";
export type HktSimplifyStrategy = "shapePreserving" | "convexHull";
export type HktHullPreset = "coarse" | "balanced" | "fine";

export interface HktSimplifyConfig {
  /** Top-level reduction strategy. */
  strategy: HktSimplifyStrategy;
  /** Shape-preserving sub-preset (used when strategy === "shapePreserving"). */
  preset: HktSimplifyPreset;
  /** Convex-hull coarseness sub-preset (used when strategy === "convexHull"). */
  hullPreset: HktHullPreset;
  enabled: boolean;
  /** Max angle (degrees) between coplanar mergeable face normals. */
  planarityAngleDeg: number;
  minTriangleArea: number;
  weldEpsilon: number;
  /** Optional target ratio for aggressive curved-surface collision decimation. */
  targetTriangleRatio: number | null;
  /** Optional absolute cap applied after targetTriangleRatio. */
  maxTargetTriangles: number | null;
  /** Convex-hull face budget (used when strategy === "convexHull"). */
  hullTargetFaces: number | null;
}
```

- [ ] **Step 4: Add hull presets and update the factories**

In `src/page/SceneEdit/utils/hktSimplifyUtils.ts`:

Update the import to include the new types:

```ts
import type {
  HktHullPreset,
  HktSimplifyConfig,
  HktSimplifyPreset,
} from "../components/dae-import/daeImportTypes";
```

Add hull preset constants below `HKT_SIMPLIFY_PRESET_HINTS`:

```ts
export const HKT_HULL_PRESET_ORDER: HktHullPreset[] = ["coarse", "balanced", "fine"];

export const HKT_HULL_PRESET_LABELS: Record<HktHullPreset, string> = {
  coarse: "Coarse",
  balanced: "Balanced",
  fine: "Fine",
};

export const HKT_HULL_PRESET_HINTS: Record<HktHullPreset, string> = {
  coarse: "Tightest outer shell, fewest faces",
  balanced: "Outer shell with rounded detail (recommended)",
  fine: "Detailed convex shell",
};

/** Target collision-face budget per hull coarseness preset. */
export const HKT_HULL_PRESET_FACES: Record<HktHullPreset, number> = {
  coarse: 24,
  balanced: 80,
  fine: 200,
};
```

Update `hktSimplifyConfigFromPreset` so every shape-preserving preset sets the new fields. Replace its body with:

```ts
export function hktSimplifyConfigFromPreset(preset: HktSimplifyPreset): HktSimplifyConfig {
  const base = {
    strategy: "shapePreserving" as const,
    preset,
    hullPreset: "balanced" as const,
    hullTargetFaces: null,
  };
  switch (preset) {
    case "none":
      return {
        ...base,
        enabled: false,
        planarityAngleDeg: 8,
        minTriangleArea: 1e-8,
        weldEpsilon: 1e-5,
        targetTriangleRatio: null,
        maxTargetTriangles: null,
      };
    case "medium":
      return {
        ...base,
        enabled: true,
        planarityAngleDeg: 15,
        minTriangleArea: 1e-6,
        weldEpsilon: 0.001,
        targetTriangleRatio: null,
        maxTargetTriangles: null,
      };
    case "heavy":
      return {
        ...base,
        enabled: true,
        planarityAngleDeg: 45,
        minTriangleArea: 0.001,
        weldEpsilon: 0.01,
        targetTriangleRatio: 0.05,
        maxTargetTriangles: 50_000,
      };
  }
}

/** Convex-hull ("outer frame") config for a coarseness preset. */
export function hktHullConfigFromPreset(preset: HktHullPreset): HktSimplifyConfig {
  return {
    strategy: "convexHull",
    preset: "medium",
    hullPreset: preset,
    enabled: true,
    planarityAngleDeg: 15,
    minTriangleArea: 1e-6,
    weldEpsilon: 0.001,
    targetTriangleRatio: null,
    maxTargetTriangles: null,
    hullTargetFaces: HKT_HULL_PRESET_FACES[preset],
  };
}
```

Update `normalizeHktSimplifyConfig` to short-circuit the convex-hull strategy (replace the function body's first lines):

```ts
export function normalizeHktSimplifyConfig(
  config: Partial<HktSimplifyConfig> | null | undefined,
): HktSimplifyConfig {
  if (config?.strategy === "convexHull") {
    const hullPreset =
      config.hullPreset && HKT_HULL_PRESET_ORDER.includes(config.hullPreset)
        ? config.hullPreset
        : "balanced";
    return hktHullConfigFromPreset(hullPreset);
  }
  if (config?.preset && HKT_SIMPLIFY_PRESET_ORDER.includes(config.preset)) {
    return hktSimplifyConfigFromPreset(config.preset);
  }
  const merged: HktSimplifyConfig = {
    ...hktSimplifyConfigFromPreset("medium"),
    ...config,
    preset: config?.preset ?? "medium",
  };
  const preset = detectHktSimplifyPreset(merged);
  return hktSimplifyConfigFromPreset(preset);
}
```

> Note: `serializeHktPreviewConfigKey` already serializes the normalized config object whole (`hktSimplify: normalized`), so the new fields are picked up automatically — no change needed there. `detectHktSimplifyPreset` stays shape-preserving-only.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/page/SceneEdit/utils/hktSimplifyUtils.test.ts`
Expected: PASS (existing + new tests).

- [ ] **Step 6: Commit**

```bash
git add src/page/SceneEdit/components/dae-import/daeImportTypes.ts src/page/SceneEdit/utils/hktSimplifyUtils.ts src/page/SceneEdit/utils/hktSimplifyUtils.test.ts
git commit -m "feat(scene): add convex-hull strategy + hull presets to HKT simplify config"
```

---

## Task 7: Strategy selector UI (design-taste)

Design intent (per design-taste-frontend, matching the existing dialog's emerald accent and `text-[11px]` / `border-border/60` / `bg-muted` token vocabulary already used in `GenerateHktFromModelDialog.tsx`): the strategy choice is a binary, decision-shaping control, so render it as a **segmented two-card toggle** (not a dropdown) with intentional active/hover/focus states and a one-line rationale per option. The sub-preset stays a compact `Select`. This gives the panel real hierarchy (strategy → coarseness) instead of a flat stack of dropdowns.

**Files:**
- Modify: `src/page/SceneEdit/components/dae-import/DaeImportHktSimplifyFields.tsx`
- Modify: `src/page/SceneEdit/components/dae-import/DaeImportHktSimplifyFields.test.tsx`

- [ ] **Step 1: Write the failing component test**

In `src/page/SceneEdit/components/dae-import/DaeImportHktSimplifyFields.test.tsx`, add `fireEvent` and `screen` to the testing-library import:

```ts
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
```

Add this test inside the `describe` block:

```ts
  it("switches to the convex-hull strategy and emits a convexHull config", async () => {
    const onChange = vi.fn();
    render(
      <DaeImportHktSimplifyFields
        value={DEFAULT_HKT_SIMPLIFY}
        onChange={onChange}
        importConfig={buildImportConfig()}
        sourcePath="C:/assets/mesh.dae"
        sourceName="mesh.dae"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /convex outline/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls[0][0];
    expect(next.strategy).toBe("convexHull");
    expect(next.enabled).toBe(true);
    expect(next.hullTargetFaces).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/page/SceneEdit/components/dae-import/DaeImportHktSimplifyFields.test.tsx`
Expected: FAIL — there is no "Convex outline" button yet.

- [ ] **Step 3: Implement the strategy selector**

In `src/page/SceneEdit/components/dae-import/DaeImportHktSimplifyFields.tsx`:

Update the type import:

```ts
import type {
  HktHullPreset,
  HktSimplifyConfig,
  HktSimplifyPreset,
  HktSimplifyStrategy,
} from "./daeImportTypes";
```

Update the utils import to add the hull helpers and `cn`:

```ts
import {
  buildImportConfigForHktPreview,
  detectHktSimplifyPreset,
  formatTriangleCount,
  HKT_HULL_PRESET_HINTS,
  HKT_HULL_PRESET_LABELS,
  HKT_HULL_PRESET_ORDER,
  HKT_SIMPLIFY_PRESET_HINTS,
  HKT_SIMPLIFY_PRESET_LABELS,
  HKT_SIMPLIFY_PRESET_ORDER,
  hktHullConfigFromPreset,
  hktSimplifyConfigFromPreset,
  normalizeHktSimplifyConfig,
  reductionPercent,
  serializeHktPreviewConfigKey,
} from "../../utils/hktSimplifyUtils";
import { cn } from "@/lib/utils";
```

Add a module-level constant above the component:

```ts
const STRATEGY_OPTIONS: { value: HktSimplifyStrategy; label: string; hint: string }[] = [
  { value: "shapePreserving", label: "Shape-preserving", hint: "Follow the original surface" },
  { value: "convexHull", label: "Convex outline", hint: "Coarse outer frame, few faces" },
];
```

Inside the component, derive the active strategy and add change handlers (place after `const activePreset = detectHktSimplifyPreset(normalizedValue);`):

```ts
  const activeStrategy = normalizedValue.strategy;
  const activeHullPreset = normalizedValue.hullPreset;

  const handleStrategyChange = (next: HktSimplifyStrategy) => {
    if (next === activeStrategy) return;
    onChange(
      next === "convexHull"
        ? hktHullConfigFromPreset(activeHullPreset)
        : hktSimplifyConfigFromPreset("medium"),
    );
  };

  const handleHullPresetChange = (next: HktHullPreset) => {
    onChange(hktHullConfigFromPreset(next));
  };
```

Extend the `previewConfigKey` `useMemo` dependency array to include the new fields (add these three entries to the deps list, after `normalizedValue.maxTargetTriangles`):

```ts
      normalizedValue.maxTargetTriangles,
      normalizedValue.strategy,
      normalizedValue.hullPreset,
      normalizedValue.hullTargetFaces,
```

Replace the existing `DaeImportFieldRow label="Simplify Level"` block (the preset `Select`) with the strategy toggle plus a conditional sub-preset:

```tsx
      <div className="space-y-2 px-1">
        <div className="text-[11px] font-medium text-foreground">Strategy</div>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 bg-muted/20 p-1">
          {STRATEGY_OPTIONS.map((opt) => {
            const active = activeStrategy === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => handleStrategyChange(opt.value)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/50",
                  active
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <span className="text-[11px] font-semibold">{opt.label}</span>
                <span className="text-[10px] leading-tight opacity-80">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeStrategy === "shapePreserving" ? (
        <DaeImportFieldRow label="Simplify Level" hint={HKT_SIMPLIFY_PRESET_HINTS[activePreset]}>
          <Select value={activePreset} onValueChange={handlePresetChange}>
            <SelectTrigger className="h-8 text-[11px]">
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent className={daeImportModalSelectContentClass}>
              {HKT_SIMPLIFY_PRESET_ORDER.map((preset) => (
                <SelectItem key={preset} value={preset} className="text-[11px]">
                  {HKT_SIMPLIFY_PRESET_LABELS[preset]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DaeImportFieldRow>
      ) : (
        <DaeImportFieldRow label="Hull Detail" hint={HKT_HULL_PRESET_HINTS[activeHullPreset]}>
          <Select value={activeHullPreset} onValueChange={(v) => handleHullPresetChange(v as HktHullPreset)}>
            <SelectTrigger className="h-8 text-[11px]">
              <SelectValue placeholder="Select detail" />
            </SelectTrigger>
            <SelectContent className={daeImportModalSelectContentClass}>
              {HKT_HULL_PRESET_ORDER.map((preset) => (
                <SelectItem key={preset} value={preset} className="text-[11px]">
                  {HKT_HULL_PRESET_LABELS[preset]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DaeImportFieldRow>
      )}
```

Update the info alert text to mention the new mode (replace the `DaeImportStatusAlert` body):

```tsx
      <DaeImportStatusAlert tone="info">
        Shape-preserving merges adjacent similar faces and can decimate curved surfaces. Convex
        outline replaces the geometry with a coarse convex shell — ideal for large flat terrain
        where even heavy simplification leaves too many faces.
      </DaeImportStatusAlert>
```

> The `handlePresetChange` handler already exists (`onChange(hktSimplifyConfigFromPreset(nextPreset))`) — keep it. The 3D/stats preview is unchanged and works automatically for both strategies because the collision counts flow from the same `previewConfig`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/page/SceneEdit/components/dae-import/DaeImportHktSimplifyFields.test.tsx`
Expected: PASS (existing identity test + the new strategy-switch test).

- [ ] **Step 5: Verify no new TypeScript errors in the touched files**

Run: `pnpm exec tsc --noEmit`
Expected: No errors in `daeImportTypes.ts`, `hktSimplifyUtils.ts`, `DaeImportHktSimplifyFields.tsx`, `sceneSessionService.ts`, `GenerateHktFromModelDialog.tsx`. (Pre-existing SceneEdit errors unrelated to these files may remain — confirm none are newly introduced by this change by diffing against the same command on `main`.)

- [ ] **Step 6: Commit**

```bash
git add src/page/SceneEdit/components/dae-import/DaeImportHktSimplifyFields.tsx src/page/SceneEdit/components/dae-import/DaeImportHktSimplifyFields.test.tsx
git commit -m "feat(scene): add collision strategy selector for convex-hull outline mode"
```

---

## Task 8: Full verification of generate + regenerate paths

No new production code — this task proves the whole feature end-to-end and that both the import dialog and the "Generate HKT from new model" / regenerate dialog use the new mode.

**Files:**
- Read-only verification: `src/page/SceneEdit/components/havok/GenerateHktFromModelDialog.tsx`, `src/page/SceneEdit/utils/sceneSessionService.ts`.

- [ ] **Step 1: Confirm the dialogs need no further changes**

Verify by reading: `GenerateHktFromModelDialog.tsx` builds its config via `buildImportConfigForHktPreview({ ..., hktSimplify: simplify })` and renders `<DaeImportHktSimplifyFields value={simplify} onChange={setSimplify} ... compact />`. Because `DaeImportHktSimplifyFields` now owns the strategy selector and `buildImportConfigForHktPreview` calls `normalizeHktSimplifyConfig`, the regenerate dialog inherits convex-hull mode with **zero** additional changes. Confirm `DEFAULT_HKT_SIMPLIFY` (the initial `simplify` state) resolves to a valid shape-preserving config. No edit expected; if any literal `HktSimplifyConfig` is constructed here, tsc from Task 7 Step 5 would have flagged it.

- [ ] **Step 2: Run the full Rust test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p app`
Expected: PASS (all collision, conversion, and session tests).

- [ ] **Step 3: Run the full frontend test suite**

Run: `pnpm vitest run`
Expected: PASS. In particular `hktSimplifyUtils.test.ts`, `DaeImportHktSimplifyFields.test.tsx`, and `sceneSessionService.test.ts` are green.

- [ ] **Step 4: Release build sanity (Rust)**

Run: `cargo build --manifest-path src-tauri/Cargo.toml --all-targets`
Expected: build succeeds, including `src/bin` diagnostic tools.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "test(collision): verify convex-hull outline mode across HKT pipeline"
```

---

## Self-Review

**1. Spec coverage**
- "generate/regenerate are the same function" → confirmed: both route through `simplify_collision_mesh`; mode-awareness (Task 4) covers both, verified in Task 8 Step 1. ✓
- "a mode that only computes the outer frame" → `CollisionSimplifyMode::ConvexHull` + `convex_hull_collision_mesh` (Task 3). ✓
- "circle 1000 faces → hexagon ~50 faces" → planar branch (`monotone_chain` + `simplify_polygon` budget) tested by `planar_disc_collapses_to_budget_fan` (Task 3). ✓
- "big flat plain stays huge even simplified" → planar branch produces a flat slab of a handful of faces; large-terrain rationale documented in the UI alert (Task 7). ✓
- "core Rust parameters" → `mode` + `hull_target_faces` on `CollisionSimplifyOptions`; `strategy` + `hull_target_faces` on the session DTO (Tasks 2, 5). ✓
- "frontend UI display" → segmented strategy selector + hull-detail preset, design-taste styled (Task 7). ✓

**2. Placeholder scan** — no TODO/"add error handling"/"similar to Task N"; every code step shows full code; every command states expected output. Error paths throw explicit `Err(...)` (no silent fallback), matching repo rule. ✓

**3. Type consistency**
- Rust enum is `CollisionSimplifyMode { ShapePreserving, ConvexHull }`; field `hull_target_faces: Option<usize>` — used identically in types.rs, simplify.rs, convex_hull.rs, scene_session_commands.rs, gen_hkt_variants.rs. ✓
- Session DTO enum `CollisionStrategy { ShapePreserving, ConvexHull }`; `hkt_simplify_to_options` maps `CollisionStrategy → CollisionSimplifyMode`. ✓
- `simplify_collision_mesh` returns `Result<CollisionTriMesh, String>` everywhere; all 8 call sites updated (3 preview/generate `?`, 1 `fit_to_single_section` `?`, 1 regenerate `?`, 1 encode test `.unwrap()`, 2 bin `.expect`, plus simplify.rs unit tests `.unwrap()`). ✓
- TS names: `HktSimplifyStrategy` = `"shapePreserving" | "convexHull"` matches the Rust `#[serde(rename_all="camelCase")] CollisionStrategy`; `hullTargetFaces` ↔ `hull_target_faces`. ✓
- TS factory `hktHullConfigFromPreset` and `HKT_HULL_PRESET_FACES` referenced consistently in utils, tests, and the component. ✓

**4. Coupling note** — Tasks 3 and 4 must land together (Task 3's module calls the Task-4 `Result` signature). The plan flags this and runs Task 3's tests at Task 4 Step 4.

---

**Plan complete.**
