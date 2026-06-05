//! Convex-hull collision shell ("outer frame" mode).
//!
//! Produces a coarse convex collision mesh instead of a shape-preserving one.
//! Volumetric input goes through a 3D quickhull (`chull`) then a face-budget
//! collapse that reuses the shape-preserving coplanar-merge + target-decimation
//! code. Near-planar input (flat terrain, discs) is degenerate for a 3D hull, so
//! it is handled with a 2D monotone-chain hull. Perfectly flat input is fanned on
//! its source plane; thin but nonzero terrain is extruded into a closed outline
//! slab so height noise does not turn the preview into a spiky 3D envelope.
//! Convexity is intentional: concavities are filled — this is the rough "outer
//! frame" the caller asked for.

use chull::ConvexHullWrapper;

use super::simplify::simplify_collision_mesh;
use super::types::{
    cos_planarity_from_angle_deg, CollisionSimplifyMode, CollisionSimplifyOptions, CollisionTriMesh,
};

/// Thin-axis extent below this fraction of the largest extent is treated as planar.
const PLANARITY_RATIO: f64 = 1e-3;
/// Thin but nonzero terrain below this ratio is handled as a 2D outline slab.
const OUTLINE_SLAB_RATIO: f64 = 0.15;
/// Near-coplanar hull facets within this angle merge during the budget collapse.
const HULL_FACET_MERGE_ANGLE_DEG: f64 = 2.0;
const MIN_HULL_POINTS: usize = 3;

/// Build a coarse convex-hull collision mesh.
///
/// The convex hull is invariant to interior and duplicate points, so the full
/// (often million-vertex) merged cloud is first reduced to its extreme points
/// along a fixed direction set ([`hull_sample_directions`]). Quickhull then runs
/// over a few dozen candidates in microseconds instead of minutes on the raw
/// cloud, and the (otherwise pointless) vertex weld is skipped entirely. The
/// sampled hull is contained in — and for a coarse "outer frame" effectively
/// matches — the exact hull; the subsequent budget collapse coarsens it further.
pub fn convex_hull_collision_mesh(
    mesh: &CollisionTriMesh,
    options: &CollisionSimplifyOptions,
) -> Result<CollisionTriMesh, String> {
    let points = &mesh.vertices;
    if points.len() < MIN_HULL_POINTS {
        return Err(format!(
            "Convex hull collision needs at least {MIN_HULL_POINTS} distinct vertices, got {}",
            points.len()
        ));
    }

    let directions = hull_sample_directions();
    let candidates = extreme_hull_candidates(points, &directions);
    if candidates.len() < MIN_HULL_POINTS {
        return Err(format!(
            "Convex hull: degenerate extreme-point set ({} candidate points)",
            candidates.len()
        ));
    }

    // AABB from the candidate set. The six axis directions are always sampled, so
    // the extents (and the planarity decision below) match the full cloud exactly.
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for v in &candidates {
        for axis in 0..3 {
            min[axis] = min[axis].min(v[axis]);
            max[axis] = max[axis].max(v[axis]);
        }
    }
    let extents = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    let max_extent = extents.iter().copied().fold(0.0_f64, f64::max);
    if max_extent <= 0.0 {
        return Err("Convex hull: collision mesh has zero size".into());
    }
    let thin_axis = (0..3)
        .min_by(|&a, &b| extents[a].total_cmp(&extents[b]))
        .unwrap_or(0);

    if extents[thin_axis] <= max_extent * PLANARITY_RATIO {
        return planar_hull_mesh(&candidates, thin_axis, options.hull_target_faces);
    }

    if extents[thin_axis] <= max_extent * OUTLINE_SLAB_RATIO {
        return outline_slab_mesh(
            points,
            thin_axis,
            min[thin_axis],
            max[thin_axis],
            options.hull_target_faces,
        );
    }

    let hull = hull_3d(&candidates)?;
    collapse_hull_to_budget(&hull, options)
}

/// Fixed direction set for extreme-point extraction (k-DOP style): the six exact
/// axis directions (so the AABB / planarity test stays exact) plus a
/// Fibonacci-sphere spread for near-uniform angular coverage of the hull.
fn hull_sample_directions() -> Vec<[f64; 3]> {
    const FIB_DIRS: usize = 64;
    let mut dirs = Vec::with_capacity(FIB_DIRS + 6);
    for axis in 0..3 {
        let mut pos = [0.0; 3];
        pos[axis] = 1.0;
        dirs.push(pos);
        let mut neg = [0.0; 3];
        neg[axis] = -1.0;
        dirs.push(neg);
    }
    let golden_angle = std::f64::consts::PI * (3.0 - 5.0_f64.sqrt());
    for i in 0..FIB_DIRS {
        let z = 1.0 - 2.0 * (i as f64 + 0.5) / FIB_DIRS as f64;
        let radius = (1.0 - z * z).max(0.0).sqrt();
        let theta = golden_angle * i as f64;
        dirs.push([radius * theta.cos(), radius * theta.sin(), z]);
    }
    dirs
}

/// One O(n·d) pass collecting the extreme (max-dot) point along each direction.
/// Every returned point is extreme in some direction and therefore lies on the
/// true convex hull; duplicates (a sharp vertex winning several directions) are
/// removed so quickhull receives at most `directions.len()` distinct candidates.
fn extreme_hull_candidates(points: &[[f64; 3]], directions: &[[f64; 3]]) -> Vec<[f64; 3]> {
    let mut best_index = vec![0usize; directions.len()];
    let mut best_dot = vec![f64::NEG_INFINITY; directions.len()];
    for (i, p) in points.iter().enumerate() {
        for (d, dir) in directions.iter().enumerate() {
            let dot = p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2];
            if dot > best_dot[d] {
                best_dot[d] = dot;
                best_index[d] = i;
            }
        }
    }
    let mut seen = std::collections::HashSet::with_capacity(directions.len());
    let mut out = Vec::with_capacity(directions.len());
    for &index in &best_index {
        if seen.insert(index) {
            out.push(points[index]);
        }
    }
    out
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
        quad_merge_enabled: true,
    };
    simplify_collision_mesh(hull, &collapse_opts)
}

/// Planar input: 2D convex hull in the dominant plane, decimated to budget, fanned.
fn planar_hull_mesh(
    points: &[[f64; 3]],
    thin_axis: usize,
    budget: Option<usize>,
) -> Result<CollisionTriMesh, String> {
    let (ax, ay) = plane_axes(thin_axis);
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

/// Thin terrain input: 2D outline in the dominant plane, extruded to a closed slab.
fn outline_slab_mesh(
    points: &[[f64; 3]],
    thin_axis: usize,
    min_thin: f64,
    max_thin: f64,
    budget: Option<usize>,
) -> Result<CollisionTriMesh, String> {
    let (ax, ay) = plane_axes(thin_axis);
    let pts2d: Vec<[f64; 2]> = points.iter().map(|p| [p[ax], p[ay]]).collect();
    let hull = monotone_chain(&pts2d);
    if hull.len() < 3 {
        return Err("Convex hull: outline slab input is degenerate (collinear points)".into());
    }

    // A slab with V outline vertices uses top (V-2) + bottom (V-2) + sides (2V)
    // triangles, so the face budget maps to roughly V=(faces+4)/4.
    let target_verts = budget.map(|faces| ((faces + 4) / 4).max(3));
    let kept = simplify_polygon(&pts2d, &hull, target_verts);
    if kept.len() < 3 {
        return Err("Convex hull: outline slab collapsed below a triangle".into());
    }

    let n = kept.len();
    let mut vertices: Vec<[f64; 3]> = Vec::with_capacity(n * 2);
    for &i in &kept {
        let mut v = [0.0_f64; 3];
        v[ax] = pts2d[i][0];
        v[ay] = pts2d[i][1];
        v[thin_axis] = min_thin;
        vertices.push(v);
    }
    for &i in &kept {
        let mut v = [0.0_f64; 3];
        v[ax] = pts2d[i][0];
        v[ay] = pts2d[i][1];
        v[thin_axis] = max_thin;
        vertices.push(v);
    }

    let center = mesh_center(&vertices);
    let mut indices: Vec<u32> = Vec::with_capacity((4 * n - 4) * 3);

    for k in 1..n - 1 {
        push_oriented_tri(&vertices, center, [0, k + 1, k], &mut indices);
        push_oriented_tri(&vertices, center, [n, n + k, n + k + 1], &mut indices);
    }

    for i in 0..n {
        let j = (i + 1) % n;
        push_oriented_tri(&vertices, center, [i, j, n + j], &mut indices);
        push_oriented_tri(&vertices, center, [i, n + j, n + i], &mut indices);
    }

    Ok(CollisionTriMesh { vertices, indices })
}

fn plane_axes(thin_axis: usize) -> (usize, usize) {
    match thin_axis {
        0 => (1usize, 2usize),
        1 => (0usize, 2usize),
        _ => (0usize, 1usize),
    }
}

fn mesh_center(vertices: &[[f64; 3]]) -> [f64; 3] {
    let mut center = [0.0; 3];
    for v in vertices {
        center[0] += v[0];
        center[1] += v[1];
        center[2] += v[2];
    }
    let inv = (vertices.len() as f64).recip();
    [center[0] * inv, center[1] * inv, center[2] * inv]
}

fn push_oriented_tri(
    vertices: &[[f64; 3]],
    center: [f64; 3],
    tri: [usize; 3],
    indices: &mut Vec<u32>,
) {
    let v0 = vertices[tri[0]];
    let v1 = vertices[tri[1]];
    let v2 = vertices[tri[2]];
    let normal = cross3(sub3(v1, v0), sub3(v2, v0));
    let tri_center = [
        (v0[0] + v1[0] + v2[0]) / 3.0,
        (v0[1] + v1[1] + v2[1]) / 3.0,
        (v0[2] + v1[2] + v2[2]) / 3.0,
    ];
    let outward = sub3(tri_center, center);
    let ordered = if dot3(normal, outward) < 0.0 {
        [tri[0], tri[2], tri[1]]
    } else {
        tri
    };
    indices.extend_from_slice(&[ordered[0] as u32, ordered[1] as u32, ordered[2] as u32]);
}

fn sub3(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn cross3(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn dot3(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
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

    fn thin_terrain_box() -> CollisionTriMesh {
        let vertices = vec![
            [-100.0, 0.0, -50.0],
            [100.0, 0.0, -50.0],
            [100.0, 0.0, 50.0],
            [-100.0, 0.0, 50.0],
            [-100.0, 10.0, -50.0],
            [100.0, 10.0, -50.0],
            [100.0, 10.0, 50.0],
            [-100.0, 10.0, 50.0],
            [0.0, 5.0, 0.0],
        ];
        CollisionTriMesh {
            vertices,
            indices: vec![0, 1, 8, 1, 2, 8, 2, 3, 8, 3, 0, 8],
        }
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
                let (a, b, c, d) = (
                    ring(la, lo),
                    ring(la, lo + 1),
                    ring(la + 1, lo + 1),
                    ring(la + 1, lo),
                );
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
    fn thin_terrain_uses_closed_outline_slab() {
        let out = convex_hull_collision_mesh(&thin_terrain_box(), &opts(Some(24))).unwrap();
        assert_eq!(
            out.vertices.len(),
            8,
            "4 outline vertices extruded to 8 slab vertices"
        );
        assert_eq!(
            out.triangle_count(),
            12,
            "rectangular outline slab is a closed box"
        );

        let (min, max) = out.compute_aabb().unwrap();
        assert!((min[1] - 0.0).abs() < 1e-9, "keeps the low thin-axis bound");
        assert!(
            (max[1] - 10.0).abs() < 1e-9,
            "keeps the high thin-axis bound"
        );
        assert_eq!(min[0], -100.0);
        assert_eq!(max[0], 100.0);
        assert_eq!(min[2], -50.0);
        assert_eq!(max[2], 50.0);
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
        assert!(
            budgeted.triangle_count() <= 48,
            "stays near the 24-face budget"
        );
        assert!(
            budgeted.triangle_count() >= 4,
            "does not collapse to nothing"
        );
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
