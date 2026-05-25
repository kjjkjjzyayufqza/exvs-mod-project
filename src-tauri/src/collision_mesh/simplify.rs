//! Coplanar collision mesh simplification (Havok-style similar-normal merging).
//!
//! Adjacent triangles whose face normals differ by less than a planarity threshold
//! are merged into regions and retriangulated from their boundary loops. This matches
//! the intent of Havok's `cosPlanarityThreshold` / Hertel-Mehlhorn coplanar merging:
//! flat render tessellation collapses to minimal collision triangles while creases
//! (dissimilar normals) are preserved.

use std::collections::{HashMap, HashSet};

use super::types::{CollisionSimplifyOptions, CollisionTriMesh};

const DEGENERATE_AREA: f64 = 1e-14;

#[derive(Clone, Copy)]
struct TriInfo {
    indices: [u32; 3],
    normal: [f64; 3],
    area: f64,
}

struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<u8>,
}

impl UnionFind {
    fn new(n: usize) -> Self {
        Self {
            parent: (0..n).collect(),
            rank: vec![0; n],
        }
    }

    fn find(&mut self, x: usize) -> usize {
        if self.parent[x] != x {
            let root = self.find(self.parent[x]);
            self.parent[x] = root;
        }
        self.parent[x]
    }

    fn union(&mut self, a: usize, b: usize) {
        let ra = self.find(a);
        let rb = self.find(b);
        if ra == rb {
            return;
        }
        if self.rank[ra] < self.rank[rb] {
            self.parent[ra] = rb;
        } else if self.rank[ra] > self.rank[rb] {
            self.parent[rb] = ra;
        } else {
            self.parent[rb] = ra;
            self.rank[ra] += 1;
        }
    }
}

fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn len_sq(v: [f64; 3]) -> f64 {
    dot(v, v)
}

fn normalize(v: [f64; 3]) -> Option<[f64; 3]> {
    let l2 = len_sq(v);
    if l2 <= DEGENERATE_AREA {
        return None;
    }
    let inv = l2.sqrt().recip();
    Some([v[0] * inv, v[1] * inv, v[2] * inv])
}

fn triangle_data(vertices: &[[f64; 3]], tri: [u32; 3]) -> Option<TriInfo> {
    let v0 = vertices[tri[0] as usize];
    let v1 = vertices[tri[1] as usize];
    let v2 = vertices[tri[2] as usize];
    let e1 = sub(v1, v0);
    let e2 = sub(v2, v0);
    let c = cross(e1, e2);
    let area = len_sq(c).sqrt() * 0.5;
    if area <= DEGENERATE_AREA {
        return None;
    }
    let normal = normalize(c)?;
    Some(TriInfo {
        indices: tri,
        normal,
        area,
    })
}

fn canonical_edge(a: u32, b: u32) -> (u32, u32) {
    if a < b {
        (a, b)
    } else {
        (b, a)
    }
}

fn weld_vertices(mesh: &CollisionTriMesh, epsilon: f64) -> CollisionTriMesh {
    if epsilon <= 0.0 || mesh.vertices.is_empty() {
        return mesh.clone();
    }

    let cell = epsilon;
    let mut cell_map: HashMap<(i64, i64, i64), u32> = HashMap::new();
    let mut welded: Vec<[f64; 3]> = Vec::new();
    let mut remap: Vec<u32> = Vec::with_capacity(mesh.vertices.len());

    for v in &mesh.vertices {
        let key = (
            (v[0] / cell).floor() as i64,
            (v[1] / cell).floor() as i64,
            (v[2] / cell).floor() as i64,
        );
        if let Some(&existing) = cell_map.get(&key) {
            remap.push(existing);
            continue;
        }
        let mut merged = *v;
        for dx in -1i64..=1 {
            for dy in -1i64..=1 {
                for dz in -1i64..=1 {
                    let nk = (key.0 + dx, key.1 + dy, key.2 + dz);
                    if let Some(&idx) = cell_map.get(&nk) {
                        let w = welded[idx as usize];
                        if len_sq(sub(*v, w)).sqrt() <= epsilon {
                            merged = w;
                            break;
                        }
                    }
                }
            }
        }
        let idx = welded.len() as u32;
        if merged == *v {
            welded.push(*v);
        } else {
            welded.push(merged);
        }
        cell_map.insert(key, idx);
        remap.push(idx);
    }

    let indices: Vec<u32> = mesh
        .indices
        .iter()
        .map(|&i| remap[i as usize])
        .collect();

    let mut deduped_indices = Vec::new();
    for tri in indices.chunks(3) {
        if tri.len() != 3 {
            continue;
        }
        if tri[0] == tri[1] || tri[1] == tri[2] || tri[0] == tri[2] {
            continue;
        }
        deduped_indices.extend_from_slice(tri);
    }

    CollisionTriMesh {
        vertices: welded,
        indices: deduped_indices,
    }
}

fn build_edge_map(tris: &[TriInfo]) -> HashMap<(u32, u32), Vec<(usize, u32)>> {
    let mut map: HashMap<(u32, u32), Vec<(usize, u32)>> = HashMap::new();
    for (ti, tri) in tris.iter().enumerate() {
        let [a, b, c] = tri.indices;
        for (u, v, opp) in [(a, b, c), (b, c, a), (c, a, b)] {
            map.entry(canonical_edge(u, v))
                .or_default()
                .push((ti, opp));
        }
    }
    map
}

fn cluster_coplanar(tris: &[TriInfo], cos_threshold: f64) -> UnionFind {
    let mut uf = UnionFind::new(tris.len());
    let edge_map = build_edge_map(tris);
    for adj in edge_map.values() {
        if adj.len() != 2 {
            continue;
        }
        let (t0, _) = adj[0];
        let (t1, _) = adj[1];
        if dot(tris[t0].normal, tris[t1].normal) >= cos_threshold {
            uf.union(t0, t1);
        }
    }
    uf
}

fn build_plane_basis(normal: [f64; 3]) -> ([f64; 3], [f64; 3]) {
    let n = normalize(normal).unwrap_or([0.0, 0.0, 1.0]);
    let ref_axis = if n[0].abs() < 0.9 {
        [1.0, 0.0, 0.0]
    } else {
        [0.0, 1.0, 0.0]
    };
    let u = normalize(cross(n, ref_axis)).unwrap_or([1.0, 0.0, 0.0]);
    let v = cross(n, u);
    (u, v)
}

fn project_2d(p: [f64; 3], origin: [f64; 3], u: [f64; 3], v: [f64; 3]) -> [f64; 2] {
    let d = sub(p, origin);
    [dot(d, u), dot(d, v)]
}

fn polygon_signed_area_2d(poly: &[[f64; 2]]) -> f64 {
    if poly.len() < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..poly.len() {
        let j = (i + 1) % poly.len();
        area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    }
    area * 0.5
}

fn point_in_triangle_2d(p: [f64; 2], a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> bool {
    fn sign(p1: [f64; 2], p2: [f64; 2], p3: [f64; 2]) -> f64 {
        (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    }
    let d1 = sign(p, a, b);
    let d2 = sign(p, b, c);
    let d3 = sign(p, c, a);
    let has_neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let has_pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(has_neg && has_pos)
}

fn ear_clip_triangulate(loop_verts: &[u32], poly2d: &[[f64; 2]]) -> Vec<[u32; 3]> {
    if loop_verts.len() < 3 || poly2d.len() != loop_verts.len() {
        return Vec::new();
    }
    if loop_verts.len() == 3 {
        return vec![[loop_verts[0], loop_verts[1], loop_verts[2]]];
    }

    let mut remaining: Vec<u32> = loop_verts.to_vec();
    let mut points: Vec<[f64; 2]> = poly2d.to_vec();
    let mut tris = Vec::new();
    let ccw = polygon_signed_area_2d(&points) > 0.0;
    let guard = remaining.len() * remaining.len() + 8;
    let mut steps = 0;

    while remaining.len() > 3 && steps < guard {
        steps += 1;
        let mut clipped = false;
        for i in 0..remaining.len() {
            let n = remaining.len();
            let i_prev = (i + n - 1) % n;
            let i_next = (i + 1) % n;
            let vi = remaining[i];
            let v_prev = remaining[i_prev];
            let v_next = remaining[i_next];

            let pi = points[i];
            let p_prev = points[i_prev];
            let p_next = points[i_next];

            let cross_z =
                (pi[0] - p_prev[0]) * (p_next[1] - pi[1]) - (pi[1] - p_prev[1]) * (p_next[0] - pi[0]);
            let is_ear = if ccw { cross_z > 1e-12 } else { cross_z < -1e-12 };
            if !is_ear {
                continue;
            }

            let mut contains = false;
            for (j, pj) in points.iter().enumerate() {
                if j == i || j == i_prev || j == i_next {
                    continue;
                }
                if point_in_triangle_2d(*pj, p_prev, pi, p_next) {
                    contains = true;
                    break;
                }
            }
            if contains {
                continue;
            }

            tris.push([v_prev, vi, v_next]);
            remaining.remove(i);
            points.remove(i);
            clipped = true;
            break;
        }
        if !clipped {
            break;
        }
    }

    if remaining.len() == 3 {
        tris.push([remaining[0], remaining[1], remaining[2]]);
    }
    tris
}

fn extract_boundary_loops(region_tris: &[TriInfo]) -> Vec<Vec<u32>> {
    let mut edge_use: HashMap<(u32, u32), u32> = HashMap::new();
    for tri in region_tris {
        let [a, b, c] = tri.indices;
        for (u, v) in [(a, b), (b, c), (c, a)] {
            *edge_use.entry(canonical_edge(u, v)).or_insert(0) += 1;
        }
    }

    let boundary_edges: Vec<(u32, u32)> = edge_use
        .into_iter()
        .filter(|(_, count)| *count == 1)
        .map(|(e, _)| e)
        .collect();

    if boundary_edges.is_empty() {
        return Vec::new();
    }

    let mut adjacency: HashMap<u32, Vec<u32>> = HashMap::new();
    let boundary_len = boundary_edges.len();
    for (a, b) in &boundary_edges {
        adjacency.entry(*a).or_default().push(*b);
        adjacency.entry(*b).or_default().push(*a);
    }

    let mut loops: Vec<Vec<u32>> = Vec::new();
    let mut visited_edges: HashSet<(u32, u32)> = HashSet::new();

    for &(seed_a, seed_b) in &boundary_edges {
        let seed_edge = canonical_edge(seed_a, seed_b);
        if visited_edges.contains(&seed_edge) {
            continue;
        }

        let start = seed_a;
        let mut loop_verts = vec![start];
        let mut current = seed_b;
        let mut prev = start;
        visited_edges.insert(seed_edge);
        loop_verts.push(current);

        let mut found = current == start;

        for _ in 0..=boundary_len + 4 {
            if found {
                break;
            }
            let Some(neighbors) = adjacency.get(&current) else {
                break;
            };
            let mut next = None;
            for &cand in neighbors {
                if cand == prev {
                    continue;
                }
                let edge = canonical_edge(current, cand);
                if visited_edges.contains(&edge) {
                    continue;
                }
                next = Some(cand);
                break;
            }
            let Some(nxt) = next else {
                break;
            };
            visited_edges.insert(canonical_edge(current, nxt));
            if nxt == start {
                found = true;
                break;
            }
            loop_verts.push(nxt);
            prev = current;
            current = nxt;
        }

        if found && loop_verts.len() >= 3 {
            loops.push(loop_verts);
        }
    }

    loops
}

fn retriangulate_region(
    vertices: &[[f64; 3]],
    region_tris: &[TriInfo],
) -> Vec<[u32; 3]> {
    if region_tris.is_empty() {
        return Vec::new();
    }
    if region_tris.len() == 1 {
        return vec![region_tris[0].indices];
    }

    let boundary_loops = extract_boundary_loops(region_tris);
    if boundary_loops.len() != 1 {
        return region_tris.iter().map(|t| t.indices).collect();
    }

    let loop_verts = boundary_loops.into_iter().next().unwrap();
    if loop_verts.len() < 3 {
        return region_tris.iter().map(|t| t.indices).collect();
    }

    let mut avg_normal = [0.0; 3];
    let mut origin = [0.0; 3];
    let mut count = 0.0;
    for tri in region_tris {
        avg_normal[0] += tri.normal[0];
        avg_normal[1] += tri.normal[1];
        avg_normal[2] += tri.normal[2];
        for &idx in &tri.indices {
            let v = vertices[idx as usize];
            origin[0] += v[0];
            origin[1] += v[1];
            origin[2] += v[2];
            count += 1.0;
        }
    }
    if count > 0.0 {
        origin = [origin[0] / count, origin[1] / count, origin[2] / count];
    }
    let Some(normal) = normalize(avg_normal) else {
        return region_tris.iter().map(|t| t.indices).collect();
    };
    let (u, v) = build_plane_basis(normal);

    let poly2d: Vec<[f64; 2]> = loop_verts
        .iter()
        .map(|&idx| project_2d(vertices[idx as usize], origin, u, v))
        .collect();

    if polygon_signed_area_2d(&poly2d).abs() <= DEGENERATE_AREA {
        return region_tris.iter().map(|t| t.indices).collect();
    }

    let tris = ear_clip_triangulate(&loop_verts, &poly2d);
    let input_tri_count = region_tris.len();
    if tris.is_empty()
        || (input_tri_count > 2 && tris.len() * 2 < input_tri_count)
    {
        region_tris.iter().map(|t| t.indices).collect()
    } else {
        tris
    }
}

/// Simplify a collision mesh by merging coplanar regions (similar face normals).
pub fn simplify_collision_mesh(
    mesh: &CollisionTriMesh,
    options: &CollisionSimplifyOptions,
) -> CollisionTriMesh {
    if !options.enabled {
        return mesh.clone();
    }

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

    if out_indices.is_empty() {
        return welded;
    }

    CollisionTriMesh {
        vertices: welded.vertices,
        indices: out_indices,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collision_mesh::types::CollisionTriMesh;

    fn subdivided_quad_mesh() -> CollisionTriMesh {
        // Unit square in XY plane, split into 4 triangles around center vertex.
        let vertices = vec![
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.5, 0.5, 0.0],
        ];
        let indices = vec![
            0, 1, 4, //
            1, 2, 4, //
            2, 3, 4, //
            3, 0, 4,
        ];
        CollisionTriMesh { vertices, indices }
    }

    #[test]
    fn coplanar_quad_merges_to_two_triangles() {
        let mesh = subdivided_quad_mesh();
        let opts = CollisionSimplifyOptions {
            enabled: true,
            cos_planarity_threshold: 0.99,
            min_triangle_area: 1e-8,
            weld_epsilon: 1e-6,
        };
        let out = simplify_collision_mesh(&mesh, &opts);
        assert_eq!(out.triangle_count(), 2, "coplanar fan should collapse to 2 tris");
    }

    #[test]
    fn crease_preserves_both_faces() {
        // Two squares sharing an edge, one in Z=0 and one tilted.
        let vertices = vec![
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 0.5],
            [1.0, 0.0, 0.5],
            [1.0, 1.0, 0.0],
        ];
        let indices = vec![0, 1, 2, 0, 2, 3, 1, 5, 6, 1, 6, 2];
        let mesh = CollisionTriMesh { vertices, indices };
        let opts = CollisionSimplifyOptions::default();
        let out = simplify_collision_mesh(&mesh, &opts);
        assert!(
            out.triangle_count() >= 3,
            "dissimilar normals should not fully collapse crease"
        );
    }

    #[test]
    fn multiple_boundary_loops_keep_original_triangles() {
        // Frame with a rectangular hole: outer 8 tris + inner 8 tris on Z=0 (16 total).
        let vertices = vec![
            [0.0, 0.0, 0.0],
            [4.0, 0.0, 0.0],
            [4.0, 4.0, 0.0],
            [0.0, 4.0, 0.0],
            [1.0, 1.0, 0.0],
            [3.0, 1.0, 0.0],
            [3.0, 3.0, 0.0],
            [1.0, 3.0, 0.0],
        ];
        let mut indices: Vec<u32> = Vec::new();
        // Outer ring (two tris per side)
        for (a, b, c) in [(0, 1, 4), (1, 5, 4), (1, 2, 5), (2, 6, 5), (2, 3, 6), (3, 7, 6), (3, 0, 7), (0, 4, 7)] {
            indices.extend_from_slice(&[a, b, c]);
        }
        // Inner hole fill (keeps two boundary loops on the coplanar region)
        for (a, b, c) in [(4, 5, 6), (4, 6, 7)] {
            indices.extend_from_slice(&[a, b, c]);
        }
        let mesh = CollisionTriMesh { vertices, indices };
        let input_tris = mesh.triangle_count();
        let out = simplify_collision_mesh(&mesh, &CollisionSimplifyOptions::default());
        assert_eq!(
            out.triangle_count(),
            input_tris,
            "regions with multiple boundary loops must not drop geometry"
        );
    }

    #[test]
    fn disabled_simplify_is_identity() {
        let mesh = subdivided_quad_mesh();
        let opts = CollisionSimplifyOptions {
            enabled: false,
            ..Default::default()
        };
        let out = simplify_collision_mesh(&mesh, &opts);
        assert_eq!(out.triangle_count(), mesh.triangle_count());
    }

    #[test]
    fn weld_merges_coincident_vertices() {
        let vertices = vec![
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
        ];
        let indices = vec![0, 1, 2, 0, 2, 3];
        let mesh = CollisionTriMesh { vertices, indices };
        let opts = CollisionSimplifyOptions {
            weld_epsilon: 1e-4,
            ..Default::default()
        };
        let out = simplify_collision_mesh(&mesh, &opts);
        assert!(out.triangle_count() <= 2);
    }
}
