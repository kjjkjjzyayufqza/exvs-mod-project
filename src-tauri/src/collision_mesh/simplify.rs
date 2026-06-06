//! Coplanar collision mesh simplification (Havok-style similar-normal merging).
//!
//! Adjacent triangles whose face normals differ by less than a planarity threshold
//! are merged into regions and retriangulated from their boundary loops. This matches
//! the intent of Havok's `cosPlanarityThreshold` / Hertel-Mehlhorn coplanar merging:
//! flat render tessellation collapses to minimal collision triangles while creases
//! (dissimilar normals) are preserved.

use std::collections::{BTreeSet, HashMap, HashSet};

use super::types::{
    AuthoredCollisionSet, CollisionPrimitive, CollisionPrimitiveMesh, CollisionSimplifyMode,
    CollisionSimplifyOptions, CollisionTriMesh,
};

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

#[derive(Default)]
struct ClusterAccum {
    sum: [f64; 3],
    count: usize,
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

fn tri_infos(mesh: &CollisionTriMesh, min_triangle_area: f64) -> Vec<TriInfo> {
    let mut tris = Vec::new();
    for chunk in mesh.indices.chunks(3) {
        if chunk.len() != 3 {
            continue;
        }
        let tri = [chunk[0], chunk[1], chunk[2]];
        if let Some(info) = triangle_data(&mesh.vertices, tri) {
            if info.area >= min_triangle_area {
                tris.push(info);
            }
        }
    }
    tris
}

fn canonical_edge(a: u32, b: u32) -> (u32, u32) {
    if a < b {
        (a, b)
    } else {
        (b, a)
    }
}

pub(super) fn weld_vertices(mesh: &CollisionTriMesh, epsilon: f64) -> CollisionTriMesh {
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

    let indices: Vec<u32> = mesh.indices.iter().map(|&i| remap[i as usize]).collect();

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

fn compact_mesh(vertices: Vec<[f64; 3]>, indices: Vec<u32>) -> CollisionTriMesh {
    let mut remap: HashMap<u32, u32> = HashMap::new();
    let mut compact_vertices = Vec::new();
    let mut compact_indices = Vec::with_capacity(indices.len());

    for index in indices {
        let next = if let Some(&mapped) = remap.get(&index) {
            mapped
        } else {
            let mapped = compact_vertices.len() as u32;
            if let Some(vertex) = vertices.get(index as usize) {
                compact_vertices.push(*vertex);
                remap.insert(index, mapped);
                mapped
            } else {
                continue;
            }
        };
        compact_indices.push(next);
    }

    CollisionTriMesh {
        vertices: compact_vertices,
        indices: compact_indices,
    }
}

fn target_triangle_count(
    source_triangles: usize,
    options: &CollisionSimplifyOptions,
) -> Option<usize> {
    if source_triangles <= 4 {
        return None;
    }

    let mut target = options
        .target_triangle_ratio
        .filter(|ratio| ratio.is_finite() && *ratio > 0.0 && *ratio < 1.0)
        .map(|ratio| ((source_triangles as f64) * ratio).ceil() as usize);

    if let Some(max_target) = options.max_target_triangles.filter(|max| *max > 0) {
        target = Some(target.map_or(max_target, |current| current.min(max_target)));
    }

    let target = target?.clamp(4, source_triangles - 1);
    (target < source_triangles).then_some(target)
}

fn quantize_axis(value: f64, min: f64, extent: f64, resolution: usize) -> i32 {
    if extent <= 1e-12 {
        return 0;
    }
    let max_cell = resolution.saturating_sub(1) as f64;
    let scaled = ((value - min) / extent) * resolution as f64;
    scaled.floor().clamp(0.0, max_cell) as i32
}

fn cluster_vertices_at_resolution(
    mesh: &CollisionTriMesh,
    resolution: usize,
    min_triangle_area: f64,
) -> CollisionTriMesh {
    if resolution < 2 || mesh.vertices.is_empty() || mesh.indices.len() < 3 {
        return mesh.clone();
    }

    let Ok((min, max)) = mesh.compute_aabb() else {
        return mesh.clone();
    };
    let extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    if extent.iter().all(|axis| *axis <= 1e-12) {
        return mesh.clone();
    }

    let mut cell_map: HashMap<(i32, i32, i32), u32> = HashMap::new();
    let mut accum: Vec<ClusterAccum> = Vec::new();
    let mut remap = Vec::with_capacity(mesh.vertices.len());

    for vertex in &mesh.vertices {
        let key = (
            quantize_axis(vertex[0], min[0], extent[0], resolution),
            quantize_axis(vertex[1], min[1], extent[1], resolution),
            quantize_axis(vertex[2], min[2], extent[2], resolution),
        );
        let index = if let Some(&index) = cell_map.get(&key) {
            index
        } else {
            let index = accum.len() as u32;
            cell_map.insert(key, index);
            accum.push(ClusterAccum::default());
            index
        };
        let acc = &mut accum[index as usize];
        acc.sum[0] += vertex[0];
        acc.sum[1] += vertex[1];
        acc.sum[2] += vertex[2];
        acc.count += 1;
        remap.push(index);
    }

    let vertices: Vec<[f64; 3]> = accum
        .into_iter()
        .map(|acc| {
            let inv = (acc.count.max(1) as f64).recip();
            [acc.sum[0] * inv, acc.sum[1] * inv, acc.sum[2] * inv]
        })
        .collect();

    let mut seen = HashSet::new();
    let mut indices = Vec::new();
    for tri in mesh.indices.chunks(3) {
        if tri.len() != 3 {
            continue;
        }
        let candidate = [
            remap[tri[0] as usize],
            remap[tri[1] as usize],
            remap[tri[2] as usize],
        ];
        if candidate[0] == candidate[1]
            || candidate[1] == candidate[2]
            || candidate[0] == candidate[2]
        {
            continue;
        }
        let Some(info) = triangle_data(&vertices, candidate) else {
            continue;
        };
        if info.area < min_triangle_area {
            continue;
        }
        let mut key = candidate;
        key.sort_unstable();
        if seen.insert(key) {
            indices.extend_from_slice(&candidate);
        }
    }

    compact_mesh(vertices, indices)
}

fn simplify_to_triangle_target(
    mesh: &CollisionTriMesh,
    target: usize,
    min_triangle_area: f64,
) -> CollisionTriMesh {
    if mesh.triangle_count() <= target {
        return mesh.clone();
    }

    let estimate = (((target as f64) / 6.0).sqrt().ceil() as usize).clamp(2, 512);
    let max_resolution = mesh.vertices.len().max(estimate).min(1024);
    let mut cache: HashMap<usize, CollisionTriMesh> = HashMap::new();

    fn cached_cluster(
        mesh: &CollisionTriMesh,
        min_triangle_area: f64,
        cache: &mut HashMap<usize, CollisionTriMesh>,
        resolution: usize,
    ) -> CollisionTriMesh {
        if let Some(cached) = cache.get(&resolution) {
            return cached.clone();
        }
        let simplified = cluster_vertices_at_resolution(mesh, resolution, min_triangle_area);
        cache.insert(resolution, simplified.clone());
        simplified
    }

    let mut low_under: Option<usize> = None;
    let mut high_over: Option<usize> = None;
    let mut best_over: Option<CollisionTriMesh> = None;

    let first = cached_cluster(mesh, min_triangle_area, &mut cache, estimate);
    let first_count = first.triangle_count();
    if first_count > 0 && first_count <= target {
        low_under = Some(estimate);
        let mut resolution = estimate;
        for _ in 0..8 {
            let next = (resolution.saturating_mul(2)).min(max_resolution);
            if next == resolution {
                break;
            }
            let candidate = cached_cluster(mesh, min_triangle_area, &mut cache, next);
            let count = candidate.triangle_count();
            if count > 0 && count <= target {
                low_under = Some(next);
                resolution = next;
            } else {
                high_over = Some(next);
                best_over = Some(candidate);
                break;
            }
        }
    } else {
        high_over = Some(estimate);
        if first_count < mesh.triangle_count() {
            best_over = Some(first);
        }
        let mut resolution = estimate;
        while resolution > 2 {
            let next = ((resolution + 1) / 2).max(2);
            if next == resolution {
                break;
            }
            let candidate = cached_cluster(mesh, min_triangle_area, &mut cache, next);
            let count = candidate.triangle_count();
            if count > 0 && count <= target {
                low_under = Some(next);
                break;
            }
            if count > 0
                && count
                    < best_over
                        .as_ref()
                        .map_or(mesh.triangle_count(), |m| m.triangle_count())
            {
                best_over = Some(candidate);
            }
            high_over = Some(next);
            resolution = next;
        }
    }

    if let (Some(mut low), Some(mut high)) = (low_under, high_over) {
        for _ in 0..10 {
            if high <= low + 1 {
                break;
            }
            let mid = (low + high) / 2;
            let candidate = cached_cluster(mesh, min_triangle_area, &mut cache, mid);
            let count = candidate.triangle_count();
            if count > 0 && count <= target {
                low = mid;
                low_under = Some(mid);
            } else {
                high = mid;
                if count > 0
                    && count
                        < best_over
                            .as_ref()
                            .map_or(mesh.triangle_count(), |m| m.triangle_count())
                {
                    best_over = Some(candidate);
                }
            }
        }
    }

    if let Some(resolution) = low_under {
        let candidate = cached_cluster(mesh, min_triangle_area, &mut cache, resolution);
        if candidate.triangle_count() > 0 && candidate.triangle_count() < mesh.triangle_count() {
            return candidate;
        }
    }

    if let Some(candidate) = best_over {
        if candidate.triangle_count() > 0 && candidate.triangle_count() < mesh.triangle_count() {
            return candidate;
        }
    }

    mesh.clone()
}

fn build_edge_map(tris: &[TriInfo]) -> HashMap<(u32, u32), Vec<(usize, u32)>> {
    let mut map: HashMap<(u32, u32), Vec<(usize, u32)>> = HashMap::new();
    for (ti, tri) in tris.iter().enumerate() {
        let [a, b, c] = tri.indices;
        for (u, v, opp) in [(a, b, c), (b, c, a), (c, a, b)] {
            map.entry(canonical_edge(u, v)).or_default().push((ti, opp));
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

            let cross_z = (pi[0] - p_prev[0]) * (p_next[1] - pi[1])
                - (pi[1] - p_prev[1]) * (p_next[0] - pi[0]);
            let is_ear = if ccw {
                cross_z > 1e-12
            } else {
                cross_z < -1e-12
            };
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

fn is_convex_polygon_2d(poly: &[[f64; 2]]) -> bool {
    if poly.len() < 3 {
        return false;
    }
    let mut sign = 0.0;
    for i in 0..poly.len() {
        let a = poly[i];
        let b = poly[(i + 1) % poly.len()];
        let c = poly[(i + 2) % poly.len()];
        let cross_z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if cross_z.abs() <= 1e-12 {
            continue;
        }
        if sign == 0.0 {
            sign = cross_z.signum();
        } else if cross_z.signum() != sign.signum() {
            return false;
        }
    }
    sign != 0.0
}

fn ordered_boundary_loop(boundary_edges: &[(u32, u32)]) -> Option<[u32; 4]> {
    if boundary_edges.len() != 4 {
        return None;
    }

    let mut adjacency: HashMap<u32, Vec<u32>> = HashMap::new();
    for &(a, b) in boundary_edges {
        adjacency.entry(a).or_default().push(b);
        adjacency.entry(b).or_default().push(a);
    }
    if adjacency.len() != 4 || adjacency.values().any(|neighbors| neighbors.len() != 2) {
        return None;
    }

    let start = *adjacency.keys().min()?;
    let mut start_neighbors = adjacency.get(&start)?.clone();
    start_neighbors.sort_unstable();

    for first in start_neighbors {
        let mut ordered = [0u32; 4];
        ordered[0] = start;
        ordered[1] = first;
        let mut prev = start;
        let mut current = first;
        let mut valid = true;

        for slot in ordered.iter_mut().skip(2) {
            let neighbors = adjacency.get(&current)?;
            let next = neighbors
                .iter()
                .copied()
                .find(|candidate| *candidate != prev);
            let Some(next) = next else {
                valid = false;
                break;
            };
            *slot = next;
            prev = current;
            current = next;
        }

        if !valid {
            continue;
        }

        let end_neighbors = adjacency.get(&ordered[3])?;
        if end_neighbors.contains(&start)
            && ordered.iter().copied().collect::<BTreeSet<_>>().len() == 4
        {
            return Some(ordered);
        }
    }

    None
}

fn try_build_quad(vertices: &[[f64; 3]], tri_a: TriInfo, tri_b: TriInfo) -> Option<[u32; 4]> {
    let avg_normal = normalize([
        tri_a.normal[0] + tri_b.normal[0],
        tri_a.normal[1] + tri_b.normal[1],
        tri_a.normal[2] + tri_b.normal[2],
    ])?;

    let mut edge_use: HashMap<(u32, u32), u8> = HashMap::new();
    for tri in [tri_a.indices, tri_b.indices] {
        for (u, v) in [(tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])] {
            *edge_use.entry(canonical_edge(u, v)).or_insert(0) += 1;
        }
    }
    let boundary_edges: Vec<(u32, u32)> = edge_use
        .into_iter()
        .filter(|(_, count)| *count == 1)
        .map(|(edge, _)| edge)
        .collect();
    let mut quad = ordered_boundary_loop(&boundary_edges)?;

    let origin = vertices[quad[0] as usize];
    let (u, v) = build_plane_basis(avg_normal);
    let poly2d: Vec<[f64; 2]> = quad
        .iter()
        .map(|&index| project_2d(vertices[index as usize], origin, u, v))
        .collect();
    if polygon_signed_area_2d(&poly2d).abs() <= DEGENERATE_AREA || !is_convex_polygon_2d(&poly2d) {
        return None;
    }

    let quad_normal = normalize(cross(
        sub(vertices[quad[1] as usize], vertices[quad[0] as usize]),
        sub(vertices[quad[2] as usize], vertices[quad[0] as usize]),
    ))?;
    if dot(quad_normal, avg_normal) < 0.0 {
        quad = [quad[0], quad[3], quad[2], quad[1]];
    }

    Some(quad)
}

fn quadify_region(vertices: &[[f64; 3]], region_tris: &[TriInfo]) -> Vec<CollisionPrimitive> {
    if region_tris.is_empty() {
        return Vec::new();
    }
    if region_tris.len() == 1 {
        return vec![CollisionPrimitive::Triangle(region_tris[0].indices)];
    }

    let edge_map = build_edge_map(region_tris);
    let mut candidates: Vec<(usize, usize, [u32; 4])> = Vec::new();
    for shared in edge_map.values() {
        if shared.len() != 2 {
            continue;
        }
        let a = shared[0].0;
        let b = shared[1].0;
        if a == b {
            continue;
        }
        if let Some(quad) = try_build_quad(vertices, region_tris[a], region_tris[b]) {
            candidates.push((a.min(b), a.max(b), quad));
        }
    }
    candidates.sort_by_key(|(a, b, _)| (*a, *b));

    let mut used = vec![false; region_tris.len()];
    let mut primitives = Vec::new();
    for (a, b, quad) in candidates {
        if used[a] || used[b] {
            continue;
        }
        used[a] = true;
        used[b] = true;
        primitives.push(CollisionPrimitive::Quad(quad));
    }
    for (index, tri) in region_tris.iter().enumerate() {
        if !used[index] {
            primitives.push(CollisionPrimitive::Triangle(tri.indices));
        }
    }
    primitives
}

fn compact_primitive_mesh(mesh: &CollisionPrimitiveMesh) -> CollisionPrimitiveMesh {
    let mut used = BTreeSet::new();
    for primitive in &mesh.primitives {
        let indices = primitive.unique_indices();
        used.insert(indices[0]);
        used.insert(indices[1]);
        used.insert(indices[2]);
        if indices[2] != indices[3] {
            used.insert(indices[3]);
        }
    }

    let mut remap = HashMap::new();
    let mut vertices = Vec::with_capacity(used.len());
    for old_index in used {
        remap.insert(old_index, vertices.len() as u32);
        vertices.push(mesh.vertices[old_index as usize]);
    }

    let primitives = mesh
        .primitives
        .iter()
        .map(|primitive| match primitive {
            CollisionPrimitive::Triangle([a, b, c]) => {
                CollisionPrimitive::Triangle([remap[a], remap[b], remap[c]])
            }
            CollisionPrimitive::Quad([a, b, c, d]) => {
                CollisionPrimitive::Quad([remap[a], remap[b], remap[c], remap[d]])
            }
        })
        .collect();

    CollisionPrimitiveMesh {
        vertices,
        primitives,
    }
}

fn quadify_triangle_mesh(
    mesh: &CollisionTriMesh,
    cos_threshold: f64,
    min_triangle_area: f64,
) -> CollisionPrimitiveMesh {
    let tris = tri_infos(mesh, min_triangle_area);
    if tris.is_empty() {
        return mesh.to_primitive_mesh();
    }

    let mut uf = cluster_coplanar(&tris, cos_threshold);
    let mut regions: HashMap<usize, Vec<usize>> = HashMap::new();
    for (index, _) in tris.iter().enumerate() {
        regions.entry(uf.find(index)).or_default().push(index);
    }

    let mut primitives = Vec::new();
    let mut region_ids: Vec<usize> = regions.keys().copied().collect();
    region_ids.sort_unstable();
    for region_id in region_ids {
        let region_tris: Vec<TriInfo> = regions[&region_id]
            .iter()
            .map(|&index| tris[index])
            .collect();
        primitives.extend(quadify_region(&mesh.vertices, &region_tris));
    }

    compact_primitive_mesh(&CollisionPrimitiveMesh {
        vertices: mesh.vertices.clone(),
        primitives,
    })
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

fn retriangulate_region(vertices: &[[f64; 3]], region_tris: &[TriInfo]) -> Vec<[u32; 3]> {
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
    if tris.is_empty() || (input_tri_count > 2 && tris.len() * 2 < input_tri_count) {
        region_tris.iter().map(|t| t.indices).collect()
    } else {
        tris
    }
}

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

/// Build authored collision shapes from a triangle mesh: simplify first, then
/// preserve real quads where coplanar triangle pairs can be merged, and finally
/// split the result into multiple shape-sized chunks.
/// EXVS compressed-mesh shape keys are 15-bit: the runtime computes a contact key as
/// `sectionIndex * 256 + localKey`, so a single shape may hold at most ~128 sections
/// (maxKeyValue ≤ 32767). A shape that needs more sections overflows the key space and
/// crashes the game on first contact. Real multi-body game stages stay well under this
/// (largest seen: 66 sections / 15 bits). Budgeting primitive keys per shape keeps each
/// encoded shape's section count (≈ keys/85 worst case) safely below 128.
const MAX_SHAPE_PRIMITIVE_KEYS: u32 = 6_000;

/// Split an authored mesh into multiple shapes so each stays under the 15-bit shape-key
/// cap (see [`MAX_SHAPE_PRIMITIVE_KEYS`]). Primitives are ordered spatially by centroid so
/// each chunk is a compact region, keeping per-shape BVHs tight and the broadphase
/// efficient. Each chunk's vertices are compacted to only those it references.
fn split_authored_for_shape_key_limit(
    mesh: &CollisionPrimitiveMesh,
) -> Vec<CollisionPrimitiveMesh> {
    if mesh.primitives.is_empty() {
        return Vec::new();
    }

    let centroid = |primitive: &CollisionPrimitive| -> [f64; 3] {
        let [a, b, c, _] = primitive.indices4();
        let mut sum = [0.0f64; 3];
        for index in [a, b, c] {
            let vertex = mesh.vertices[index as usize];
            sum[0] += vertex[0];
            sum[1] += vertex[1];
            sum[2] += vertex[2];
        }
        [sum[0] / 3.0, sum[1] / 3.0, sum[2] / 3.0]
    };

    let mut order: Vec<usize> = (0..mesh.primitives.len()).collect();
    order.sort_by(|&a, &b| {
        let ca = centroid(&mesh.primitives[a]);
        let cb = centroid(&mesh.primitives[b]);
        ca[0]
            .total_cmp(&cb[0])
            .then(ca[2].total_cmp(&cb[2]))
            .then(ca[1].total_cmp(&cb[1]))
    });

    let mut shapes = Vec::new();
    let mut current: Vec<CollisionPrimitive> = Vec::new();
    let mut keys = 0u32;
    for &index in &order {
        let primitive = mesh.primitives[index];
        let primitive_keys = primitive.primitive_key_count();
        if !current.is_empty() && keys + primitive_keys > MAX_SHAPE_PRIMITIVE_KEYS {
            shapes.push(compact_primitive_mesh(&CollisionPrimitiveMesh {
                vertices: mesh.vertices.clone(),
                primitives: std::mem::take(&mut current),
            }));
            keys = 0;
        }
        current.push(primitive);
        keys += primitive_keys;
    }
    if !current.is_empty() {
        shapes.push(compact_primitive_mesh(&CollisionPrimitiveMesh {
            vertices: mesh.vertices.clone(),
            primitives: current,
        }));
    }
    shapes
}

pub fn author_collision_shapes(
    mesh: &CollisionTriMesh,
    options: &CollisionSimplifyOptions,
) -> Result<AuthoredCollisionSet, String> {
    let simplified = simplify_collision_mesh(mesh, options)?;
    let authored = if options.quad_merge_enabled {
        quadify_triangle_mesh(
            &simplified,
            options.cos_planarity_threshold,
            options.min_triangle_area,
        )
    } else {
        simplified.to_primitive_mesh()
    };
    // A compressed-mesh shape key is 15-bit (sectionIndex*256 + localKey, ≤128 sections).
    // Large maps exceed that in a single shape — test3's ~22k primitives need >170 Havok
    // sections, far past 128 — and crash on contact. Split into multiple bodies, each under
    // the cap, exactly like real multi-body game stages. Multi-body is fully supported by
    // the game (working assets ship 50+ bodies).
    let mut shapes = split_authored_for_shape_key_limit(&authored);
    if shapes.is_empty() {
        shapes.push(authored);
    }
    Ok(AuthoredCollisionSet { shapes })
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

    fn uv_sphere_mesh(lat_segments: usize, lon_segments: usize) -> CollisionTriMesh {
        let mut vertices = Vec::new();
        vertices.push([0.0, 0.0, 1.0]);
        for lat in 1..lat_segments {
            let theta = std::f64::consts::PI * lat as f64 / lat_segments as f64;
            let z = theta.cos();
            let r = theta.sin();
            for lon in 0..lon_segments {
                let phi = std::f64::consts::TAU * lon as f64 / lon_segments as f64;
                vertices.push([r * phi.cos(), r * phi.sin(), z]);
            }
        }
        let bottom = vertices.len() as u32;
        vertices.push([0.0, 0.0, -1.0]);

        let ring_index = |lat: usize, lon: usize| -> u32 {
            1 + ((lat - 1) * lon_segments + (lon % lon_segments)) as u32
        };

        let mut indices = Vec::new();
        for lon in 0..lon_segments {
            indices.extend_from_slice(&[0, ring_index(1, lon + 1), ring_index(1, lon)]);
        }
        for lat in 1..lat_segments - 1 {
            for lon in 0..lon_segments {
                let a = ring_index(lat, lon);
                let b = ring_index(lat, lon + 1);
                let c = ring_index(lat + 1, lon + 1);
                let d = ring_index(lat + 1, lon);
                indices.extend_from_slice(&[a, b, c, a, c, d]);
            }
        }
        for lon in 0..lon_segments {
            indices.extend_from_slice(&[
                ring_index(lat_segments - 1, lon),
                ring_index(lat_segments - 1, lon + 1),
                bottom,
            ]);
        }

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
            ..Default::default()
        };
        let out = simplify_collision_mesh(&mesh, &opts).unwrap();
        assert_eq!(
            out.triangle_count(),
            2,
            "coplanar fan should collapse to 2 tris"
        );
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
        let out = simplify_collision_mesh(&mesh, &opts).unwrap();
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
        for (a, b, c) in [
            (0, 1, 4),
            (1, 5, 4),
            (1, 2, 5),
            (2, 6, 5),
            (2, 3, 6),
            (3, 7, 6),
            (3, 0, 7),
            (0, 4, 7),
        ] {
            indices.extend_from_slice(&[a, b, c]);
        }
        // Inner hole fill (keeps two boundary loops on the coplanar region)
        for (a, b, c) in [(4, 5, 6), (4, 6, 7)] {
            indices.extend_from_slice(&[a, b, c]);
        }
        let mesh = CollisionTriMesh { vertices, indices };
        let input_tris = mesh.triangle_count();
        let out = simplify_collision_mesh(&mesh, &CollisionSimplifyOptions::default()).unwrap();
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
        let out = simplify_collision_mesh(&mesh, &opts).unwrap();
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
        let out = simplify_collision_mesh(&mesh, &opts).unwrap();
        assert!(out.triangle_count() <= 2);
    }

    #[test]
    fn heavy_target_decimates_closed_curved_mesh() {
        let mesh = uv_sphere_mesh(16, 32);
        assert!(
            (900..=1100).contains(&mesh.triangle_count()),
            "test fixture should stay near 1000 tris"
        );
        let opts = CollisionSimplifyOptions {
            target_triangle_ratio: Some(0.05),
            max_target_triangles: Some(50_000),
            ..Default::default()
        };
        let out = simplify_collision_mesh(&mesh, &opts).unwrap();
        assert!(
            out.triangle_count() <= 60,
            "expected about 5% collision tris, got {}",
            out.triangle_count()
        );
        assert!(
            out.triangle_count() >= 12,
            "closed curved mesh should not collapse to an unusable primitive"
        );
    }

    #[test]
    fn small_mesh_stays_single_shape() {
        let mut vertices = Vec::new();
        let mut primitives = Vec::new();
        for index in 0..20u32 {
            let base = vertices.len() as u32;
            let x = index as f64 * 10.0;
            vertices.push([x, 0.0, 0.0]);
            vertices.push([x + 1.0, 0.0, 0.0]);
            vertices.push([x, 1.0, 0.0]);
            primitives.push(CollisionPrimitive::Triangle([base, base + 1, base + 2]));
        }
        let mesh = CollisionPrimitiveMesh {
            vertices,
            primitives,
        }
        .to_triangle_mesh();

        let set = author_collision_shapes(&mesh, &CollisionSimplifyOptions::default())
            .expect("author shapes");

        // 20 keys is far under the per-shape budget, so it stays a single body.
        assert_eq!(set.shape_count(), 1);
    }

    #[test]
    fn large_mesh_splits_under_shape_key_cap() {
        // More keys than MAX_SHAPE_PRIMITIVE_KEYS must split into multiple shapes, each
        // under the cap, so no shape exceeds the 15-bit compressed-mesh shape-key space.
        let count = (MAX_SHAPE_PRIMITIVE_KEYS as usize) + 500;
        let mut vertices = Vec::new();
        let mut primitives = Vec::new();
        for index in 0..count as u32 {
            let base = vertices.len() as u32;
            let x = index as f64 * 10.0;
            vertices.push([x, 0.0, 0.0]);
            vertices.push([x + 1.0, 0.0, 0.0]);
            vertices.push([x, 1.0, 0.0]);
            primitives.push(CollisionPrimitive::Triangle([base, base + 1, base + 2]));
        }
        let mesh = CollisionPrimitiveMesh {
            vertices,
            primitives,
        };

        let shapes = split_authored_for_shape_key_limit(&mesh);
        assert!(
            shapes.len() >= 2,
            "must split when over the per-shape key budget"
        );
        for shape in &shapes {
            assert!(shape.primitive_key_count() <= MAX_SHAPE_PRIMITIVE_KEYS);
        }
        let total: usize = shapes.iter().map(|s| s.primitive_count()).sum();
        assert_eq!(total, count, "split must preserve every primitive");
    }

    #[test]
    fn author_collision_shapes_can_skip_quad_merge() {
        let mesh = subdivided_quad_mesh();
        let with_quads = author_collision_shapes(&mesh, &CollisionSimplifyOptions::default())
            .expect("author quads");
        assert!(with_quads
            .shapes
            .iter()
            .flat_map(|shape| shape.primitives.iter())
            .any(|primitive| matches!(primitive, CollisionPrimitive::Quad(_))));

        let without_quads = author_collision_shapes(
            &mesh,
            &CollisionSimplifyOptions {
                quad_merge_enabled: false,
                ..CollisionSimplifyOptions::default()
            },
        )
        .expect("author triangles");
        assert!(without_quads
            .shapes
            .iter()
            .flat_map(|shape| shape.primitives.iter())
            .all(|primitive| matches!(primitive, CollisionPrimitive::Triangle(_))));
    }
}
