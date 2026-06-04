//! Build hknpCompressedMeshShape meshTree XML from a merged triangle mesh.
//!
//! The multi-section encoder here is the game-faithful production path. Its BVH section
//! split, Axis4/Axis5 codec, compressed-AABB nibble packing, 11/11/10 packed vertices,
//! and 21/21/22 shared vertices are byte-identical to the authoritative community
//! reference, DSMapStudio's `HKX2.Builders.hknpCollisionMeshBuilder` / `BVH.cs`
//! (`soulsmods/DSMapStudio`, `src/HKX2/HKX2/Builders/`). The shape-key width fields
//! (`mesh_key_info`) intentionally follow this game's own primitive-key sizing rather
//! than DSMapStudio's hardcoded `bitsPerKey=5 / maxKeyValue=30` (which targets
//! FromSoftware titles and is marked `// ?` in that source). The reference itself ships a
//! dummy `simdTree` and omits `connectivity` / `triangleIsInterior`, so neutralizing
//! those (see `neutralize_acceleration_payload`) is consistent with it.

use crate::collision_mesh::{simplify_collision_mesh, CollisionSimplifyOptions, CollisionTriMesh};

const COLLISION_TEMPLATE_XML: &str = include_str!("../assets/havok_box_collision_template.xml");

/// Real game collision shell (a neutral single-object `map_hit` export: origin body,
/// identity orientation, empty render scene). Used as the production template so generated
/// HKTs inherit authentic game scene/physics metadata instead of the synthetic box shell.
const COLLISION_SAMPLE_TEMPLATE_XML: &str =
    include_str!("../assets/havok_collision_sample_template.xml");

const MAX_SECTION_VERTS: usize = 255;
const MAX_SECTION_TRIS: usize = 127;
const MAX_AXIS5_LEAF_KEY: u32 = 30;
/// Havok Axis5 mesh-tree leaves encode section indices in 15 bits (0..=32767).
const MAX_HAVOK_SECTIONS: usize = 0x8000;
/// Distinct shared vertices are referenced through u16 indices (0..=65535).
pub const MAX_HAVOK_SHARED_VERTICES: usize = (u16::MAX as usize) + 1;
const MAX_PACKED_AXIS: f64 = 2047.0;
const MAX_PACKED_Z: f64 = 1023.0;
const AABB_PAD: f64 = 0.01;

/// Reject meshes whose shared-vertex count exceeds Havok's u16 index space.
pub fn validate_havok_shared_vertex_count(count: usize) -> Result<(), String> {
    if count > MAX_HAVOK_SHARED_VERTICES {
        return Err(format!(
            "Shared vertex count {count} exceeds Havok limit ({MAX_HAVOK_SHARED_VERTICES}). \
             Use a lower-poly collision mesh with fewer cross-section shared vertices."
        ));
    }
    Ok(())
}

/// Reject meshes that would require more Havok sections than Axis5 leaf indices allow.
pub fn validate_havok_section_count(count: usize) -> Result<(), String> {
    if count > MAX_HAVOK_SECTIONS {
        return Err(format!(
            "Mesh requires {count} Havok sections (limit {MAX_HAVOK_SECTIONS}). \
             Reduce triangle count or use a dedicated low-poly collision mesh."
        ));
    }
    Ok(())
}

#[derive(Clone, Copy, Debug)]
struct Aabb {
    min: [f64; 3],
    max: [f64; 3],
}

#[derive(Clone, Debug)]
enum BvhNode {
    Leaf {
        bounds: Aabb,
        index: usize,
    },
    Branch {
        bounds: Aabb,
        left: Box<BvhNode>,
        right: Box<BvhNode>,
    },
}

#[derive(Clone, Copy, Debug)]
struct Axis4Node {
    xyz: [u8; 3],
    data: u8,
}

#[derive(Clone, Copy, Debug)]
struct Axis5Node {
    xyz: [u8; 3],
    hi_data: u8,
    lo_data: u8,
}

#[derive(Clone)]
struct SectionBuild {
    codec_parms: [f64; 6],
    packed_vertices: Vec<u32>,
    shared_vertices_index: Vec<u16>,
    primitives: Vec<[u8; 4]>,
    primitive_bounds: Vec<Aabb>,
    min: [f64; 3],
    max: [f64; 3],
    first_packed_vertex_index: u32,
    first_shared_vertex_index: u32,
    first_primitive_index: u32,
    first_data_run_index: u32,
}

#[derive(Clone)]
struct SectionSeed {
    bounds: Aabb,
    triangle_indices: Vec<usize>,
    used_vertices: std::collections::BTreeSet<u32>,
}

struct MeshBuild {
    sections: Vec<SectionBuild>,
    mesh_bvh: BvhNode,
    shared_vertices: Vec<u64>,
}

pub fn build_mesh_collision_xml(mesh: &CollisionTriMesh) -> Result<String, String> {
    build_mesh_collision_xml_with_template(mesh, COLLISION_TEMPLATE_XML)
}

pub fn build_mesh_collision_xml_with_template(
    mesh: &CollisionTriMesh,
    template_xml: &str,
) -> Result<String, String> {
    build_mesh_collision_xml_with_template_mode(mesh, template_xml, TemplateReplaceMode::All)
}

#[derive(Clone, Copy)]
pub enum TemplateReplaceMode {
    All,
    Last,
}

pub fn build_mesh_collision_xml_with_template_mode(
    mesh: &CollisionTriMesh,
    template_xml: &str,
    replace_mode: TemplateReplaceMode,
) -> Result<String, String> {
    let (global_min, global_max) = padded_aabb(mesh)?;
    let build = split_and_encode_sections(mesh, global_min, global_max)?;
    let total_prims: u32 = build
        .sections
        .iter()
        .map(|s| s.primitives.len() as u32)
        .sum();
    let total_primitive_keys = total_prims.saturating_mul(2);
    let (shape_key_bits, _, _) = mesh_key_info(total_primitive_keys);
    let mesh_tree = format_mesh_tree_xml(&build, global_min, global_max)?;
    inject_mesh_tree_into_template(
        template_xml,
        &mesh_tree,
        global_min,
        global_max,
        total_primitive_keys,
        shape_key_bits,
        replace_mode,
    )
}

/// Production HKT builder. Faithful, game-native multi-section encode of `mesh` injected
/// into the embedded real-game collision shell, with the stale acceleration payload
/// neutralized. This is the single entry point used by both DAE-import and existing-SSBH
/// HKT generation — confirmed to load correctly in-game.
pub fn build_mesh_collision_xml_faithful(mesh: &CollisionTriMesh) -> Result<String, String> {
    build_mesh_collision_xml_sample_template(mesh, COLLISION_SAMPLE_TEMPLATE_XML)
}

/// Replace only the shape/data chain of an exported sample template (e.g. the
/// `map_hit.xml` style: `hknpCompressedMeshShape` + `hknpCompressedMeshShapeData`).
///
/// It regenerates the fields that must follow the new mesh — `numShapeKeyBits`,
/// `triangleIsInterior`, and `meshTree` — via the standard [`TemplateReplaceMode::All`]
/// path, then neutralizes stale acceleration / connectivity payload left over from the
/// original sample (`simdTree`, `connectivity`, `hasSimdTree`) so the result is fully
/// regenerated instead of half-old/half-new.
pub fn build_mesh_collision_xml_sample_template(
    mesh: &CollisionTriMesh,
    template_xml: &str,
) -> Result<String, String> {
    let xml =
        build_mesh_collision_xml_with_template_mode(mesh, template_xml, TemplateReplaceMode::All)?;
    neutralize_acceleration_payload(&xml)
}

/// ANALYSIS ONLY — not the shipping path. Reduce a collision mesh so it fits into exactly
/// one Havok section: `<= MAX_SECTION_TRIS` primitives and `<= MAX_SECTION_VERTS`
/// referenced vertices.
///
/// This was the single-section isolation experiment used to prove the template shell was
/// not the PreviewTool blocker. It discards most of the geometry, so it is retained only
/// for diagnostics; production uses the full multi-section encoder.
///
/// Reduction is lightest-first and reuses what already exists in-repo:
/// 1. coplanar-merge simplify ([`simplify_collision_mesh`]) sheds redundant triangles;
/// 2. if the simplified mesh already fits, it is kept whole;
/// 3. otherwise the largest leading run of triangles that still fits one section is kept.
///
/// The returned mesh has compacted vertices (only the referenced ones, remapped to
/// `0..n`). Feeding it to [`build_mesh_collision_xml_with_template_mode`] therefore yields
/// exactly one section with empty `sharedVertices` / `sharedVerticesIndex` arrays.
pub fn fit_to_single_section(mesh: &CollisionTriMesh) -> Result<CollisionTriMesh, String> {
    if mesh.indices.len() < 3 {
        return Err("Cannot fit an empty collision mesh into a single Havok section".into());
    }

    let simplified = simplify_collision_mesh(mesh, &CollisionSimplifyOptions::default())?;
    let source = if simplified.triangle_count() > 0 {
        &simplified
    } else {
        mesh
    };

    let kept_tris = single_section_prefix(source);
    compact_triangles(source, &kept_tris)
}

/// Triangle indices of the leading run that still fits a single Havok section.
fn single_section_prefix(mesh: &CollisionTriMesh) -> Vec<usize> {
    let mut used: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();
    let mut kept = Vec::new();
    for (tri_index, tri) in mesh.indices.chunks_exact(3).enumerate() {
        let new_vertices = tri.iter().filter(|v| !used.contains(v)).count();
        if !kept.is_empty()
            && (kept.len() >= MAX_SECTION_TRIS || used.len() + new_vertices > MAX_SECTION_VERTS)
        {
            break;
        }
        for &v in tri {
            used.insert(v);
        }
        kept.push(tri_index);
    }
    kept
}

/// Rebuild a mesh from the kept triangles with vertices compacted to `0..n`.
fn compact_triangles(
    mesh: &CollisionTriMesh,
    kept_tris: &[usize],
) -> Result<CollisionTriMesh, String> {
    let mut remap = std::collections::HashMap::<u32, u32>::new();
    let mut vertices: Vec<[f64; 3]> = Vec::new();
    let mut indices: Vec<u32> = Vec::with_capacity(kept_tris.len() * 3);

    for &tri_index in kept_tris {
        let base = tri_index * 3;
        for offset in 0..3 {
            let old = mesh.indices[base + offset];
            let new_index = match remap.get(&old) {
                Some(&idx) => idx,
                None => {
                    let idx = vertices.len() as u32;
                    vertices.push(mesh.vertices[old as usize]);
                    remap.insert(old, idx);
                    idx
                }
            };
            indices.push(new_index);
        }
    }

    if indices.is_empty() {
        return Err("Single-section fit produced no triangles".into());
    }

    Ok(CollisionTriMesh { vertices, indices })
}

fn padded_aabb(mesh: &CollisionTriMesh) -> Result<([f64; 3], [f64; 3]), String> {
    let (mut min, mut max) = mesh.compute_aabb()?;
    for axis in 0..3 {
        if (max[axis] - min[axis]).abs() < 1e-9 {
            max[axis] += 0.5;
            min[axis] -= 0.5;
        }
    }
    min = [min[0] - AABB_PAD, min[1] - AABB_PAD, min[2] - AABB_PAD];
    max = [max[0] + AABB_PAD, max[1] + AABB_PAD, max[2] + AABB_PAD];
    Ok((min, max))
}

fn empty_aabb() -> Aabb {
    Aabb {
        min: [f64::INFINITY; 3],
        max: [f64::NEG_INFINITY; 3],
    }
}

fn include_point(bounds: &mut Aabb, point: [f64; 3]) {
    for axis in 0..3 {
        bounds.min[axis] = bounds.min[axis].min(point[axis]);
        bounds.max[axis] = bounds.max[axis].max(point[axis]);
    }
}

fn include_aabb(bounds: &mut Aabb, child: Aabb) {
    for axis in 0..3 {
        bounds.min[axis] = bounds.min[axis].min(child.min[axis]);
        bounds.max[axis] = bounds.max[axis].max(child.max[axis]);
    }
}

fn triangle_aabb(mesh: &CollisionTriMesh, tri: [u32; 3]) -> Aabb {
    let mut bounds = empty_aabb();
    for vertex_index in tri {
        include_point(&mut bounds, mesh.vertices[vertex_index as usize]);
    }
    bounds
}

fn bounds_centroid(bounds: Aabb) -> [f64; 3] {
    [
        (bounds.min[0] + bounds.max[0]) * 0.5,
        (bounds.min[1] + bounds.max[1]) * 0.5,
        (bounds.min[2] + bounds.max[2]) * 0.5,
    ]
}

fn bounds_extent(bounds: Aabb) -> [f64; 3] {
    [
        bounds.max[0] - bounds.min[0],
        bounds.max[1] - bounds.min[1],
        bounds.max[2] - bounds.min[2],
    ]
}

fn union_bounds(bounds: &[Aabb], indices: &[usize]) -> Aabb {
    let mut out = empty_aabb();
    for &idx in indices {
        include_aabb(&mut out, bounds[idx]);
    }
    out
}

fn build_bvh(bounds: &[Aabb]) -> Option<BvhNode> {
    if bounds.is_empty() {
        return None;
    }
    let mut indices: Vec<usize> = (0..bounds.len()).collect();
    Some(build_bvh_recursive(bounds, &mut indices))
}

fn build_bvh_recursive(bounds: &[Aabb], indices: &mut [usize]) -> BvhNode {
    let node_bounds = union_bounds(bounds, indices);
    if indices.len() == 1 {
        return BvhNode::Leaf {
            bounds: node_bounds,
            index: indices[0],
        };
    }

    let centroid_bounds = {
        let mut out = empty_aabb();
        for &idx in indices.iter() {
            include_point(&mut out, bounds_centroid(bounds[idx]));
        }
        out
    };
    let extent = bounds_extent(centroid_bounds);
    let split_axis = if extent[0] >= extent[1] && extent[0] >= extent[2] {
        0
    } else if extent[1] >= extent[2] {
        1
    } else {
        2
    };

    indices.sort_by(|a, b| {
        let ac = bounds_centroid(bounds[*a])[split_axis];
        let bc = bounds_centroid(bounds[*b])[split_axis];
        ac.partial_cmp(&bc).unwrap_or(std::cmp::Ordering::Equal)
    });

    let mid = indices.len() / 2;
    let (left_indices, right_indices) = indices.split_at_mut(mid);
    let left = build_bvh_recursive(bounds, left_indices);
    let right = build_bvh_recursive(bounds, right_indices);
    BvhNode::Branch {
        bounds: node_bounds,
        left: Box::new(left),
        right: Box::new(right),
    }
}

fn bvh_bounds(node: &BvhNode) -> Aabb {
    match node {
        BvhNode::Leaf { bounds, .. } | BvhNode::Branch { bounds, .. } => *bounds,
    }
}

fn key_bits_for_max_key(max_key: u32) -> u32 {
    (32 - max_key.max(1).leading_zeros()).max(4)
}

/// Shape-key width fields, sized to the primitive-key space exactly as the game's own
/// `hknpCompressedMeshShape` assets are. Verified against real game samples:
/// the simple sample uses `numPrimitiveKeys=10 / bitsPerKey=4 / maxKeyValue=9`, the
/// complex sample uses `bitsPerKey=13 / maxKeyValue=5043`.
///
/// `numShapeKeyBits`, `bitsPerKey`, and `maxKeyValue` all follow `numPrimitiveKeys`
/// regardless of how many sections the mesh is split into — the Axis5 mesh-tree leaves
/// still address section indices separately. The previous section-key sizing produced a
/// file that was internally inconsistent (e.g. `bitsPerKey=5` declaring 7802 keys); the
/// game tolerated it but it diverged from every authentic asset.
fn mesh_key_info(total_primitive_keys: u32) -> (u32, u32, u32) {
    let max_key = total_primitive_keys.saturating_sub(1).max(1);
    let bits_per_key = key_bits_for_max_key(max_key);
    (bits_per_key, max_key, bits_per_key)
}

fn collect_leaf_indices(node: &BvhNode, out: &mut Vec<usize>) {
    match node {
        BvhNode::Leaf { index, .. } => out.push(*index),
        BvhNode::Branch { left, right, .. } => {
            collect_leaf_indices(right, out);
            collect_leaf_indices(left, out);
        }
    }
}

fn collect_used_vertices(
    triangles: &[[u32; 3]],
    triangle_indices: &[usize],
) -> std::collections::BTreeSet<u32> {
    let mut used = std::collections::BTreeSet::new();
    for &tri_idx in triangle_indices {
        for vertex in triangles[tri_idx] {
            used.insert(vertex);
        }
    }
    used
}

fn greedy_section_seeds(
    triangles: &[[u32; 3]],
    triangle_bounds: &[Aabb],
) -> Result<Vec<SectionSeed>, String> {
    let mut seeds = Vec::new();
    let mut cursor = 0usize;

    while cursor < triangles.len() {
        let mut triangle_indices = Vec::new();
        let mut used_vertices = std::collections::BTreeSet::new();
        let mut bounds = empty_aabb();

        while cursor < triangles.len() {
            let tri = triangles[cursor];
            let mut new_vertices = 0usize;
            for vertex in tri {
                if !used_vertices.contains(&vertex) {
                    new_vertices += 1;
                }
            }

            if !triangle_indices.is_empty()
                && (triangle_indices.len() >= MAX_SECTION_TRIS
                    || used_vertices.len() + new_vertices > MAX_SECTION_VERTS)
            {
                break;
            }

            for vertex in tri {
                used_vertices.insert(vertex);
            }
            include_aabb(&mut bounds, triangle_bounds[cursor]);
            triangle_indices.push(cursor);
            cursor += 1;
        }

        if triangle_indices.is_empty() {
            return Err("Failed to greedily partition mesh into Havok sections".into());
        }

        seeds.push(SectionSeed {
            bounds,
            triangle_indices,
            used_vertices,
        });
    }

    Ok(seeds)
}

fn build_section_bvh_from_seeds(seeds: &[SectionSeed]) -> Result<BvhNode, String> {
    let bounds: Vec<Aabb> = seeds.iter().map(|s| s.bounds).collect();
    build_bvh(&bounds).ok_or_else(|| "Failed to build section-level BVH".to_string())
}

fn split_bvh_sections(
    node: &BvhNode,
    triangles: &[[u32; 3]],
    sections: &mut Vec<SectionSeed>,
) -> BvhNode {
    let mut triangle_indices = Vec::new();
    collect_leaf_indices(node, &mut triangle_indices);
    let used_vertices = collect_used_vertices(triangles, &triangle_indices);

    if let BvhNode::Branch {
        bounds,
        left,
        right,
    } = node
    {
        if triangle_indices.len() > MAX_SECTION_TRIS || used_vertices.len() > MAX_SECTION_VERTS {
            return BvhNode::Branch {
                bounds: *bounds,
                left: Box::new(split_bvh_sections(left, triangles, sections)),
                right: Box::new(split_bvh_sections(right, triangles, sections)),
            };
        }
    }

    let section_index = sections.len();
    sections.push(SectionSeed {
        bounds: bvh_bounds(node),
        triangle_indices,
        used_vertices,
    });
    BvhNode::Leaf {
        bounds: bvh_bounds(node),
        index: section_index,
    }
}

fn split_and_encode_sections(
    mesh: &CollisionTriMesh,
    global_min: [f64; 3],
    global_max: [f64; 3],
) -> Result<MeshBuild, String> {
    let triangles: Vec<[u32; 3]> = mesh.indices.chunks(3).map(|c| [c[0], c[1], c[2]]).collect();

    if triangles.is_empty() {
        return Err("Cannot encode an empty Havok collision mesh".into());
    }

    let triangle_bounds: Vec<Aabb> = triangles
        .iter()
        .map(|tri| triangle_aabb(mesh, *tri))
        .collect();
    let source_bvh = build_bvh(&triangle_bounds)
        .ok_or_else(|| "Failed to build Havok source BVH".to_string())?;

    let mut seeds = Vec::new();
    let mut mesh_bvh = split_bvh_sections(&source_bvh, &triangles, &mut seeds);
    if seeds.len() > MAX_AXIS5_LEAF_KEY as usize + 1 {
        seeds = greedy_section_seeds(&triangles, &triangle_bounds)?;
        mesh_bvh = build_section_bvh_from_seeds(&seeds)?;
    }
    validate_havok_section_count(seeds.len())?;

    let mut vertex_section_counts = vec![0u16; mesh.vertices.len()];
    for seed in &seeds {
        for &vertex in &seed.used_vertices {
            if let Some(count) = vertex_section_counts.get_mut(vertex as usize) {
                *count = count.saturating_add(1);
            }
        }
    }

    let shared_set: std::collections::BTreeSet<u32> = vertex_section_counts
        .iter()
        .enumerate()
        .filter_map(|(idx, count)| (*count > 1).then_some(idx as u32))
        .collect();
    validate_havok_shared_vertex_count(shared_set.len())?;
    let mut shared_index_remap = std::collections::HashMap::new();
    let mut shared_vertices = Vec::new();
    for &vertex_index in &shared_set {
        let shared_index = shared_vertices.len();
        if shared_index > u16::MAX as usize {
            return Err(format!(
                "Shared vertex count {} exceeds Havok u16 limit ({MAX_HAVOK_SHARED_VERTICES})",
                shared_index + 1
            ));
        }
        shared_index_remap.insert(vertex_index, shared_index as u16);
        shared_vertices.push(encode_shared_vertex(
            mesh.vertices[vertex_index as usize],
            global_min,
            global_max,
        ));
    }

    let mut sections = Vec::new();
    let mut global_packed_offset = 0u32;
    let mut global_shared_index_offset = 0u32;
    let mut global_prim_offset = 0u32;
    let mut global_data_run_offset = 0u32;

    for seed in seeds {
        let min = seed.bounds.min;
        let max = seed.bounds.max;
        let codec = codec_parms_for_aabb(min, max);

        let mut global_to_local = std::collections::HashMap::<u32, u8>::new();
        let mut packed_vertices = Vec::new();
        let mut shared_vertices_index = Vec::new();
        let mut local_index = 0u8;

        for &vertex_index in &seed.used_vertices {
            if !shared_set.contains(&vertex_index) {
                global_to_local.insert(vertex_index, local_index);
                packed_vertices.push(encode_packed_vertex(
                    mesh.vertices[vertex_index as usize],
                    codec,
                ));
                local_index = local_index
                    .checked_add(1)
                    .ok_or_else(|| "Section local vertex index overflow".to_string())?;
            }
        }

        let num_packed_vertices = local_index as usize;
        for &vertex_index in &seed.used_vertices {
            if shared_set.contains(&vertex_index) {
                global_to_local.insert(vertex_index, local_index);
                let shared_index = *shared_index_remap
                    .get(&vertex_index)
                    .ok_or_else(|| "Shared vertex remap missing".to_string())?;
                shared_vertices_index.push(shared_index);
                local_index = local_index
                    .checked_add(1)
                    .ok_or_else(|| "Section local shared vertex index overflow".to_string())?;
            }
        }

        let mut primitives = Vec::new();
        let mut primitive_bounds = Vec::new();
        for &tri_idx in &seed.triangle_indices {
            let tri = triangles[tri_idx];
            let a = *global_to_local.get(&tri[0]).unwrap();
            let b = *global_to_local.get(&tri[1]).unwrap();
            let c = *global_to_local.get(&tri[2]).unwrap();
            primitives.push([a, b, c, c]);
            primitive_bounds.push(triangle_bounds[tri_idx]);
        }

        sections.push(SectionBuild {
            codec_parms: codec,
            packed_vertices,
            shared_vertices_index,
            primitives,
            primitive_bounds,
            min,
            max,
            first_packed_vertex_index: global_packed_offset,
            first_shared_vertex_index: global_shared_index_offset,
            first_primitive_index: global_prim_offset,
            first_data_run_index: global_data_run_offset,
        });

        global_packed_offset += num_packed_vertices as u32;
        global_shared_index_offset += sections
            .last()
            .map(|s| s.shared_vertices_index.len() as u32)
            .unwrap_or(0);
        global_prim_offset += sections
            .last()
            .map(|s| s.primitives.len() as u32)
            .unwrap_or(0);
        global_data_run_offset += 1;
    }

    Ok(MeshBuild {
        sections,
        mesh_bvh,
        shared_vertices,
    })
}

fn codec_parms_for_aabb(min: [f64; 3], max: [f64; 3]) -> [f64; 6] {
    let scale_x = ((max[0] - min[0]) / MAX_PACKED_AXIS).max(1e-9);
    let scale_y = ((max[1] - min[1]) / MAX_PACKED_AXIS).max(1e-9);
    let scale_z = ((max[2] - min[2]) / MAX_PACKED_Z).max(1e-9);
    // Havok format: [offX, offY, offZ, sX, sY, sZ]
    [min[0], min[1], min[2], scale_x, scale_y, scale_z]
}

fn encode_packed_vertex(point: [f64; 3], codec: [f64; 6]) -> u32 {
    // codec = [offX, offY, offZ, sX, sY, sZ]
    let xi = ((point[0] - codec[0]) / codec[3])
        .clamp(0.0, MAX_PACKED_AXIS)
        .round() as u32;
    let yi = ((point[1] - codec[1]) / codec[4])
        .clamp(0.0, MAX_PACKED_AXIS)
        .round() as u32;
    let zi = ((point[2] - codec[2]) / codec[5])
        .clamp(0.0, MAX_PACKED_Z)
        .round() as u32;
    // Havok bit layout: Z[31:22] Y[21:11] X[10:0]
    (zi << 22) | (yi << 11) | xi
}

fn encode_shared_vertex(point: [f64; 3], min: [f64; 3], max: [f64; 3]) -> u64 {
    let sx = ((max[0] - min[0]) / ((1u64 << 21) - 1) as f64).max(1e-12);
    let sy = ((max[1] - min[1]) / ((1u64 << 21) - 1) as f64).max(1e-12);
    let sz = ((max[2] - min[2]) / ((1u64 << 22) - 1) as f64).max(1e-12);
    let x = ((point[0] - min[0]) / sx).clamp(0.0, ((1u64 << 21) - 1) as f64) as u64;
    let y = ((point[1] - min[1]) / sy).clamp(0.0, ((1u64 << 21) - 1) as f64) as u64;
    let z = ((point[2] - min[2]) / sz).clamp(0.0, ((1u64 << 22) - 1) as f64) as u64;
    (x & 0x1F_FFFF) | ((y & 0x1F_FFFF) << 21) | ((z & 0x3F_FFFF) << 42)
}

fn format_aabb_xml(min: [f64; 3], max: [f64; 3]) -> String {
    format!(
        r#"<record> <!-- hkAabb -->
              <field name="min">
                <array count="4" elementtypeid="type48">
                  {}
                  {}
                  {}
                  {}
                </array>
              </field>
              <field name="max">
                <array count="4" elementtypeid="type48">
                  {}
                  {}
                  {}
                  {}
                </array>
              </field>
            </record>"#,
        format_real_tag(min[0]),
        format_real_tag(min[1]),
        format_real_tag(min[2]),
        format_real_tag(1.0),
        format_real_tag(max[0]),
        format_real_tag(max[1]),
        format_real_tag(max[2]),
        format_real_tag(1.0),
    )
}

fn format_codec_parms_xml(codec: [f64; 6]) -> String {
    let mut out = String::from(
        r#"<array count="6" elementtypeid="type35">
"#,
    );
    for v in codec {
        out.push_str(&format!("                    {}\n", format_real_tag(v)));
    }
    out.push_str("                  </array>");
    out
}

fn compress_dim(min: f64, max: f64, parent_min: f64, parent_max: f64) -> u8 {
    let extent = parent_max - parent_min;
    if extent.abs() < 1e-9 {
        return 0;
    }
    let scale = 226.0 / extent;
    let low = ((min - parent_min) * scale).max(0.0).sqrt();
    let high = ((max - parent_max) * -scale).max(0.0).sqrt();
    let low_nibble = low.floor().min(15.0) as u8;
    let high_nibble = high.floor().min(15.0) as u8;
    (low_nibble << 4) | high_nibble
}

fn compressed_xyz(bounds: Aabb, parent: Aabb) -> [u8; 3] {
    [
        compress_dim(bounds.min[0], bounds.max[0], parent.min[0], parent.max[0]),
        compress_dim(bounds.min[1], bounds.max[1], parent.min[1], parent.max[1]),
        compress_dim(bounds.min[2], bounds.max[2], parent.min[2], parent.max[2]),
    ]
}

fn decompress_dim_min(encoded: u8, parent_min: f64, parent_max: f64) -> f64 {
    let nibble = (encoded >> 4) as f64;
    parent_min + ((nibble * nibble) / 226.0) * (parent_max - parent_min)
}

fn decompress_dim_max(encoded: u8, parent_min: f64, parent_max: f64) -> f64 {
    let nibble = (encoded & 0x0F) as f64;
    parent_max - ((nibble * nibble) / 226.0) * (parent_max - parent_min)
}

fn decompress_bounds(xyz: [u8; 3], parent: Aabb) -> Aabb {
    Aabb {
        min: [
            decompress_dim_min(xyz[0], parent.min[0], parent.max[0]),
            decompress_dim_min(xyz[1], parent.min[1], parent.max[1]),
            decompress_dim_min(xyz[2], parent.min[2], parent.max[2]),
        ],
        max: [
            decompress_dim_max(xyz[0], parent.min[0], parent.max[0]),
            decompress_dim_max(xyz[1], parent.min[1], parent.max[1]),
            decompress_dim_max(xyz[2], parent.min[2], parent.max[2]),
        ],
    }
}

fn build_axis4_tree(root: &BvhNode) -> Result<Vec<Axis4Node>, String> {
    fn emit(node: &BvhNode, parent: Aabb, out: &mut Vec<Axis4Node>) -> Result<(), String> {
        let curr_index = out.len();
        let xyz = compressed_xyz(bvh_bounds(node), parent);
        out.push(Axis4Node { xyz, data: 0 });
        let child_parent = decompress_bounds(xyz, parent);

        match node {
            BvhNode::Leaf { index, .. } => {
                if *index > 127 {
                    return Err(format!(
                        "Section primitive index {index} exceeds Axis4 leaf capacity"
                    ));
                }
                out[curr_index].data = (*index as u8) * 2;
            }
            BvhNode::Branch { left, right, .. } => {
                emit(left, child_parent, out)?;
                let right_offset = out.len() - curr_index;
                if right_offset > 254 {
                    return Err(format!(
                        "Section BVH right-child offset {right_offset} exceeds Axis4 capacity"
                    ));
                }
                out[curr_index].data = (right_offset as u8) | 0x1;
                emit(right, child_parent, out)?;
            }
        }
        Ok(())
    }

    let mut out = Vec::new();
    emit(root, bvh_bounds(root), &mut out)?;
    Ok(out)
}

fn build_axis5_tree(root: &BvhNode) -> Result<Vec<Axis5Node>, String> {
    fn emit(
        node: &BvhNode,
        parent: Aabb,
        out: &mut Vec<Axis5Node>,
        is_root: bool,
    ) -> Result<(), String> {
        let curr_index = out.len();
        let mut xyz = compressed_xyz(bvh_bounds(node), parent);
        if is_root {
            xyz = [0, 0, 0];
        }
        out.push(Axis5Node {
            xyz,
            hi_data: 0,
            lo_data: 0,
        });
        let child_parent = decompress_bounds(xyz, parent);

        match node {
            BvhNode::Leaf { index, .. } => {
                if *index > 0x7FFF {
                    return Err(format!("Section index {index} exceeds Axis5 leaf capacity"));
                }
                let data = *index as u16;
                out[curr_index].lo_data = (data & 0xFF) as u8;
                out[curr_index].hi_data = ((data >> 8) & 0x7F) as u8;
            }
            BvhNode::Branch { left, right, .. } => {
                emit(left, child_parent, out, false)?;
                let right_offset = out.len() - curr_index;
                if right_offset % 2 != 0 {
                    return Err(format!(
                        "Axis5 right-child node offset {right_offset} is not even"
                    ));
                }
                let data = (right_offset / 2) as u16;
                out[curr_index].lo_data = (data & 0xFF) as u8;
                out[curr_index].hi_data = (((data >> 8) & 0x7F) as u8) | 0x80;
                emit(right, child_parent, out, false)?;
            }
        }
        Ok(())
    }

    let mut out = Vec::new();
    emit(root, bvh_bounds(root), &mut out, true)?;
    Ok(out)
}

fn format_bvh_node_4byte(node: Axis4Node) -> String {
    format!(
        r#"<record>
                      <field name="xyz">
                        <array count="3" elementtypeid="type135">
                          <integer value="{}"/>
                          <integer value="{}"/>
                          <integer value="{}"/>
                        </array>
                      </field>
                      <field name="data"><integer value="{}"/></field>
                    </record>"#,
        node.xyz[0], node.xyz[1], node.xyz[2], node.data
    )
}

fn format_bvh_node_5byte(node: Axis5Node) -> String {
    format!(
        r#"<record>
                <field name="xyz">
                  <array count="3" elementtypeid="type135">
                    <integer value="{}"/>
                    <integer value="{}"/>
                    <integer value="{}"/>
                  </array>
                </field>
                <field name="hiData"><integer value="{}"/></field>
                <field name="loData"><integer value="{}"/></field>
              </record>"#,
        node.xyz[0], node.xyz[1], node.xyz[2], node.hi_data, node.lo_data
    )
}

fn format_section_xml(sec: &SectionBuild, leaf_index: usize) -> Result<String, String> {
    let root = build_bvh(&sec.primitive_bounds)
        .ok_or_else(|| "Cannot build section BVH with no primitives".to_string())?;
    let bvh_data = build_axis4_tree(&root)?;
    let node_count = bvh_data.len();
    let mut bvh_nodes = String::new();
    for node in &bvh_data {
        bvh_nodes.push_str(&format_bvh_node_4byte(*node));
        bvh_nodes.push('\n');
    }

    let mut prims = String::new();
    for p in &sec.primitives {
        prims.push_str(&format!(
            r#"<record>
                <field name="indices">
                  <array count="4" elementtypeid="type135">
                    <integer value="{}"/>
                    <integer value="{}"/>
                    <integer value="{}"/>
                    <integer value="{}"/>
                  </array>
                </field>
              </record>
"#,
            p[0], p[1], p[2], p[3]
        ));
    }

    Ok(format!(
        r#"<record>
                <field name="nodes">
                  <array count="{node_count}" elementtypeid="type400">
                    {bvh_nodes}
                  </array>
                </field>
                <field name="domain">
                  {domain}
                </field>
                <field name="codecParms">
                  {codec}
                </field>
                <field name="firstPackedVertexIndex"><integer value="{first_packed}"/></field>
                <field name="firstSharedVertexIndex"><integer value="{first_shared}"/></field>
                <field name="firstPrimitiveIndex"><integer value="{first_prim}"/></field>
                <field name="firstDataRunIndex"><integer value="{first_run}"/></field>
                <field name="numPackedVertices"><integer value="{num_packed}"/></field>
                <field name="numPrimitives"><integer value="{num_prims}"/></field>
                <field name="numDataRuns"><integer value="1"/></field>
                <field name="page"><integer value="0"/></field>
                <field name="leafIndex"><integer value="{leaf_index}"/></field>
                <field name="layerData"><integer value="0"/></field>
                <field name="flags"><integer value="0"/></field>
              </record>"#,
        node_count = node_count,
        bvh_nodes = bvh_nodes,
        domain = format_aabb_xml(sec.min, sec.max),
        codec = format_codec_parms_xml(sec.codec_parms),
        first_packed = sec.first_packed_vertex_index,
        first_shared = sec.first_shared_vertex_index,
        first_prim = sec.first_primitive_index,
        first_run = sec.first_data_run_index,
        num_packed = sec.packed_vertices.len(),
        num_prims = sec.primitives.len(),
        leaf_index = leaf_index,
    ))
}

fn format_mesh_tree_xml(
    build: &MeshBuild,
    global_min: [f64; 3],
    global_max: [f64; 3],
) -> Result<String, String> {
    let sections = &build.sections;
    let total_prims: u32 = sections.iter().map(|s| s.primitives.len() as u32).sum();
    let total_primitive_keys = total_prims.saturating_mul(2);
    let total_packed: u32 = sections
        .iter()
        .map(|s| s.packed_vertices.len() as u32)
        .sum();
    let total_shared_indices: u32 = sections
        .iter()
        .map(|s| s.shared_vertices_index.len() as u32)
        .sum();

    let mesh_nodes = build_axis5_tree(&build.mesh_bvh)?;
    let mut section_leaf_indices = vec![0usize; sections.len()];
    for (node_index, node) in mesh_nodes.iter().enumerate() {
        if node.hi_data & 0x80 == 0 {
            let section_index = (((node.hi_data as u16) << 8) | node.lo_data as u16) as usize;
            if let Some(slot) = section_leaf_indices.get_mut(section_index) {
                *slot = node_index;
            }
        }
    }

    let mut section_records = String::new();
    for (section_index, sec) in sections.iter().enumerate() {
        section_records.push_str(&format_section_xml(
            sec,
            section_leaf_indices[section_index],
        )?);
        section_records.push('\n');
    }

    let mut mesh_node_records = String::new();
    for node in &mesh_nodes {
        mesh_node_records.push_str(&format_bvh_node_5byte(*node));
        mesh_node_records.push('\n');
    }

    let mut packed_integers = String::new();
    for sec in sections {
        for pv in &sec.packed_vertices {
            packed_integers.push_str(&format!(
                r#"              <integer value="{}"/>
"#,
                pv
            ));
        }
    }

    let mut shared_index_integers = String::new();
    for sec in sections {
        for idx in &sec.shared_vertices_index {
            shared_index_integers.push_str(&format!(
                r#"              <integer value="{}"/>
"#,
                idx
            ));
        }
    }

    let mut shared_vertex_integers = String::new();
    for sv in &build.shared_vertices {
        shared_vertex_integers.push_str(&format!(
            r#"              <integer value="{}"/>
"#,
            *sv as i64
        ));
    }

    let mut prim_records = String::new();
    for sec in sections {
        for p in &sec.primitives {
            prim_records.push_str(&format!(
                r#"<record>
                <field name="indices">
                  <array count="4" elementtypeid="type135">
                    <integer value="{}"/>
                    <integer value="{}"/>
                    <integer value="{}"/>
                    <integer value="{}"/>
                  </array>
                </field>
              </record>
"#,
                p[0], p[1], p[2], p[3]
            ));
        }
    }

    let mut data_runs = String::new();
    for sec in sections {
        data_runs.push_str(&format!(
            r#"<record>
                <field name="value"><integer value="0"/></field>
                <field name="index"><integer value="0"/></field>
                <field name="count"><integer value="{}"/></field>
              </record>
"#,
            sec.primitives.len()
        ));
    }

    let (bits_per_key, max_key, _) = mesh_key_info(total_primitive_keys);

    Ok(format!(
        r#"<record>
          <field name="nodes">
            <array count="{mesh_node_count}" elementtypeid="type391">
              {mesh_node_records}
            </array>
          </field>
          <field name="domain">
            {global_domain}
          </field>
          <field name="numPrimitiveKeys"><integer value="{total_primitive_keys}"/></field>
          <field name="bitsPerKey"><integer value="{bits_per_key}"/></field>
          <field name="maxKeyValue"><integer value="{max_key}"/></field>
          <field name="primitiveStoresIsFlatConvex"><integer value="255"/></field>
          <field name="sections">
            <array count="{section_count}" elementtypeid="type386">
              {section_records}
            </array>
          </field>
          <field name="primitives">
            <array count="{total_prims}" elementtypeid="type388">
              {prim_records}
            </array>
          </field>
          <field name="sharedVerticesIndex">
            <array count="{total_shared_indices}" elementtypeid="type188">
{shared_index_integers}
            </array>
          </field>
          <field name="packedVertices">
            <array count="{total_packed}" elementtypeid="type33">
{packed_integers}            </array>
          </field>
          <field name="sharedVertices">
            <array count="{total_shared_vertices}" elementtypeid="type136">
{shared_vertex_integers}
            </array>
          </field>
          <field name="primitiveDataRuns">
            <array count="{run_count}" elementtypeid="type383">
              {data_runs}
            </array>
          </field>
        </record>"#,
        global_domain = format_aabb_xml(global_min, global_max),
        mesh_node_count = mesh_nodes.len(),
        mesh_node_records = mesh_node_records,
        total_primitive_keys = total_primitive_keys,
        section_count = sections.len(),
        run_count = sections.len(),
        total_shared_indices = total_shared_indices,
        shared_index_integers = shared_index_integers,
        total_shared_vertices = build.shared_vertices.len(),
        shared_vertex_integers = shared_vertex_integers,
    ))
}

fn inject_mesh_tree_into_template(
    template: &str,
    mesh_tree: &str,
    global_min: [f64; 3],
    global_max: [f64; 3],
    total_prims: u32,
    shape_key_bits: u32,
    replace_mode: TemplateReplaceMode,
) -> Result<String, String> {
    let mut xml = match replace_mode {
        TemplateReplaceMode::All => {
            let mut xml = replace_all_named_field_bodies(template, "meshTree", mesh_tree)?;
            xml = replace_all_named_field_bodies(
                &xml,
                "triangleIsInterior",
                &format_triangle_is_interior_xml(total_prims),
            )?;
            patch_num_shape_key_bits(&xml, shape_key_bits, replace_mode)?
        }
        TemplateReplaceMode::Last => {
            inject_last_body_shape_data(template, mesh_tree, shape_key_bits, total_prims)?
        }
    };

    // Patch legacy template domain blocks outside meshTree (compound shape metadata).
    let domain_aabb = format_aabb_xml(global_min, global_max);
    while let Some(dom_start) = xml.find(
        r#"<field name="domain">
            <record> <!-- hkAabb -->
              <field name="min">
                <array count="4" elementtypeid="type48"> <!-- ArrayOf float -->
                  <real dec="-40.01""#,
    ) {
        let dom_end = xml[dom_start..]
            .find(
                r#"</field>
          <field name="numPrimitiveKeys">"#,
            )
            .or_else(|| {
                xml[dom_start..].find(
                    r#"</field>
                <field name="codecParms">"#,
                )
            })
            .ok_or_else(|| "domain end marker missing".to_string())?
            + dom_start;
        xml.replace_range(
            dom_start..dom_end,
            &format!(
                r#"<field name="domain">
            {domain_aabb}"#
            ),
        );
    }

    Ok(xml)
}

/// Empty out the stale acceleration / connectivity payload of a sample template:
/// reset `simdTree` to an empty (non-compact) tree, reset `connectivity` to empty
/// arrays, and clear `hasSimdTree`. Element type ids are read back from the template
/// so they stay valid for that export's type table.
fn neutralize_acceleration_payload(xml: &str) -> Result<String, String> {
    let simd_nodes_type = first_array_elem_typeid_after_field(xml, "simdTree")?;
    let mut out =
        replace_all_named_field_bodies(xml, "simdTree", &empty_simd_tree_body(&simd_nodes_type))?;

    let conn_start = out
        .find(r#"<field name="connectivity">"#)
        .ok_or_else(|| "connectivity field missing from collision template".to_string())?;
    let conn_end = find_field_end(&out, conn_start)?;
    let conn_scope = out[conn_start..conn_end].to_string();
    let headers_type = first_array_elem_typeid_after_field(&conn_scope, "headers")?;
    let local_links_type = first_array_elem_typeid_after_field(&conn_scope, "localLinks")?;
    let global_links_type = first_array_elem_typeid_after_field(&conn_scope, "globalLinks")?;
    let connectivity_body =
        empty_connectivity_body(&headers_type, &local_links_type, &global_links_type);
    out = replace_all_named_field_bodies(&out, "connectivity", &connectivity_body)?;

    patch_has_simd_tree(&out, false)
}

/// Element type id of the first `<array>` that appears after `<field name="{field}">`.
fn first_array_elem_typeid_after_field(xml: &str, field: &str) -> Result<String, String> {
    let field_marker = format!(r#"<field name="{field}">"#);
    let field_start = xml
        .find(&field_marker)
        .ok_or_else(|| format!("{field} field missing from collision template"))?;
    let array_start = xml[field_start..]
        .find("<array ")
        .map(|idx| field_start + idx)
        .ok_or_else(|| format!("{field} field has no array to read elementtypeid from"))?;
    let key = r#"elementtypeid=""#;
    let value_start = xml[array_start..]
        .find(key)
        .map(|idx| array_start + idx + key.len())
        .ok_or_else(|| format!("{field} array missing elementtypeid"))?;
    let value_end = xml[value_start..]
        .find('"')
        .map(|idx| value_start + idx)
        .ok_or_else(|| format!("{field} array elementtypeid is malformed"))?;
    Ok(xml[value_start..value_end].to_string())
}

fn empty_simd_tree_body(nodes_typeid: &str) -> String {
    format!(
        r#"
        <record> <!-- hkcdSimdTree -->
          <field name="nodes">
            <array count="0" elementtypeid="{nodes_typeid}"> <!-- ArrayOf hkcdSimdTree::Node -->
            </array>
          </field>
          <field name="isCompact"><bool value="false"/></field>
        </record>
      "#
    )
}

fn empty_connectivity_body(headers: &str, local_links: &str, global_links: &str) -> String {
    format!(
        r#"
        <record> <!-- hkcdStaticMeshTree::Connectivity -->
          <field name="headers">
            <array count="0" elementtypeid="{headers}">
            </array>
          </field>
          <field name="localLinks">
            <array count="0" elementtypeid="{local_links}">
            </array>
          </field>
          <field name="globalLinks">
            <array count="0" elementtypeid="{global_links}">
            </array>
          </field>
        </record>
      "#
    )
}

fn patch_has_simd_tree(xml: &str, value: bool) -> Result<String, String> {
    let marker = r#"<field name="hasSimdTree">"#;
    let start = xml
        .find(marker)
        .ok_or_else(|| "hasSimdTree field missing from collision template".to_string())?;
    let end = find_field_end(xml, start)?;
    let replacement = format!(r#"<field name="hasSimdTree"><bool value="{value}"/></field>"#);
    Ok(format!("{}{}{}", &xml[..start], replacement, &xml[end..]))
}

fn inject_last_body_shape_data(
    template: &str,
    mesh_tree: &str,
    shape_key_bits: u32,
    total_prims: u32,
) -> Result<String, String> {
    let shape_id = find_last_body_shape_id(template)?;
    let shape_range = find_object_range(template, &shape_id)?;
    let data_id = extract_pointer_field(&template[shape_range.clone()], "data")?;

    let mut xml = replace_named_field_body_in_object(template, &data_id, "meshTree", mesh_tree)?;
    xml = replace_raw_field_in_object(
        &xml,
        &shape_id,
        "numShapeKeyBits",
        &format!(r#"<field name="numShapeKeyBits"><integer value="{shape_key_bits}"/></field>"#),
    )?;
    replace_named_field_body_in_object(
        &xml,
        &shape_id,
        "triangleIsInterior",
        &format_triangle_is_interior_xml(total_prims),
    )
}

fn find_last_body_shape_id(xml: &str) -> Result<String, String> {
    let start = xml
        .find(r#"<field name="bodyCinfos">"#)
        .ok_or_else(|| "bodyCinfos field missing from collision template".to_string())?;
    let end = find_field_end(xml, start)?;
    let body_cinfos = &xml[start..end];
    extract_last_pointer_field(body_cinfos, "shape")
}

fn extract_last_pointer_field(xml: &str, field_name: &str) -> Result<String, String> {
    let marker = format!(r#"<field name="{field_name}"><pointer id=""#);
    let start = xml
        .rfind(&marker)
        .ok_or_else(|| format!("{field_name} pointer missing from collision template"))?
        + marker.len();
    let end = xml[start..]
        .find('"')
        .map(|idx| start + idx)
        .ok_or_else(|| format!("{field_name} pointer id is malformed"))?;
    Ok(xml[start..end].to_string())
}

fn extract_pointer_field(xml: &str, field_name: &str) -> Result<String, String> {
    let marker = format!(r#"<field name="{field_name}"><pointer id=""#);
    let start = xml
        .find(&marker)
        .ok_or_else(|| format!("{field_name} pointer missing from collision template"))?
        + marker.len();
    let end = xml[start..]
        .find('"')
        .map(|idx| start + idx)
        .ok_or_else(|| format!("{field_name} pointer id is malformed"))?;
    Ok(xml[start..end].to_string())
}

fn find_object_range(xml: &str, object_id: &str) -> Result<std::ops::Range<usize>, String> {
    let marker = format!(r#"<object id="{object_id}""#);
    let start = xml
        .find(&marker)
        .ok_or_else(|| format!("{object_id} object missing from collision template"))?;
    let end = xml[start..]
        .find("</object>")
        .map(|idx| start + idx + "</object>".len())
        .ok_or_else(|| format!("{object_id} object is malformed"))?;
    Ok(start..end)
}

fn replace_raw_field_in_object(
    xml: &str,
    object_id: &str,
    field_name: &str,
    replacement: &str,
) -> Result<String, String> {
    let range = find_object_range(xml, object_id)?;
    let marker = format!(r#"<field name="{field_name}">"#);
    let rel_start = xml[range.clone()]
        .find(&marker)
        .ok_or_else(|| format!("{field_name} field missing from {object_id}"))?;
    let start = range.start + rel_start;
    let end = find_field_end(xml, start)?;
    Ok(format!("{}{}{}", &xml[..start], replacement, &xml[end..]))
}

fn replace_named_field_body_in_object(
    xml: &str,
    object_id: &str,
    field_name: &str,
    replacement_body: &str,
) -> Result<String, String> {
    let replacement = format!(r#"<field name="{field_name}">{replacement_body}</field>"#);
    replace_raw_field_in_object(xml, object_id, field_name, &replacement)
}

fn format_triangle_is_interior_xml(total_prims: u32) -> String {
    let word_count = total_prims.div_ceil(32).max(1);
    let mut words = String::new();
    for _ in 0..word_count {
        words.push_str("                  <integer value=\"0\"/>\n");
    }
    format!(
        r#"
        <record> <!-- hkBitField -->
          <field name="storage">
            <record> <!-- hkBitFieldStorage -->
              <field name="words">
                <array count="{word_count}" elementtypeid="type36"> <!-- ArrayOf hkUint32 -->
{words}                </array>
              </field>
              <field name="numBits"><integer value="{total_prims}"/></field>
            </record>
          </field>
        </record>"#
    )
}

fn patch_num_shape_key_bits(
    xml: &str,
    bits: u32,
    replace_mode: TemplateReplaceMode,
) -> Result<String, String> {
    let marker = r#"<field name="numShapeKeyBits">"#;
    let replacement = format!(r#"<field name="numShapeKeyBits"><integer value="{bits}"/></field>"#);
    if matches!(replace_mode, TemplateReplaceMode::Last) {
        return replace_last_raw_field(xml, marker, &replacement, "numShapeKeyBits");
    }

    let mut out = xml.to_string();
    let mut search_from = 0;
    let mut replacements = 0usize;
    while let Some(rel_start) = out[search_from..].find(marker) {
        let start = search_from + rel_start;
        let end = find_field_end(&out, start)?;
        out.replace_range(start..end, &replacement);
        search_from = start + replacement.len();
        replacements += 1;
    }
    if replacements == 0 {
        return Err("numShapeKeyBits field not found in collision template".to_string());
    }
    Ok(out)
}

fn replace_last_raw_field(
    xml: &str,
    marker: &str,
    replacement: &str,
    field_name: &str,
) -> Result<String, String> {
    let start = xml
        .rfind(marker)
        .ok_or_else(|| format!("{field_name} field not found in collision template"))?;
    let end = find_field_end(xml, start)?;
    Ok(format!("{}{}{}", &xml[..start], replacement, &xml[end..]))
}

pub fn float_to_havok_hex(value: f64) -> String {
    let bits = value.to_bits();
    format!("#{:016X}", bits)
}

pub fn format_real_tag(value: f64) -> String {
    format!(
        r#"<real dec="{:.9}" hex="{}"/>"#,
        value,
        float_to_havok_hex(value)
    )
}

fn find_field_end(xml: &str, field_start: usize) -> Result<usize, String> {
    const OPEN: &str = "<field ";
    const CLOSE: &str = "</field>";

    let after_open = xml[field_start..]
        .find('>')
        .map(|idx| field_start + idx + 1)
        .ok_or_else(|| "Malformed XML field opening tag".to_string())?;

    let mut depth = 1usize;
    let mut pos = after_open;

    while pos < xml.len() && depth > 0 {
        let open = xml[pos..].find(OPEN);
        let close = xml[pos..].find(CLOSE);

        match (open, close) {
            (Some(o), Some(c)) if o <= c => {
                depth += 1;
                pos += o + OPEN.len();
            }
            (_, Some(c)) => {
                depth -= 1;
                pos += c + CLOSE.len();
                if depth == 0 {
                    return Ok(pos);
                }
            }
            _ => break,
        }
    }

    Err("Failed to locate end of XML field".into())
}

fn replace_all_named_field_bodies(
    xml: &str,
    field_name: &str,
    replacement_body: &str,
) -> Result<String, String> {
    let marker = format!(r#"<field name="{field_name}">"#);
    let replacement = format!(r#"<field name="{field_name}">{replacement_body}</field>"#);
    let mut out = xml.to_string();
    let mut search_from = 0;
    let mut replacements = 0usize;

    while let Some(rel_start) = out[search_from..].find(&marker) {
        let start = search_from + rel_start;
        let end = find_field_end(&out, start)?;
        out.replace_range(start..end, &replacement);
        search_from = start + replacement.len();
        replacements += 1;
    }

    if replacements == 0 {
        return Err(format!(
            "{field_name} field missing from collision template"
        ));
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::collision_mesh::CollisionTriMesh;

    #[test]
    fn single_triangle_mesh_builds_xml_without_template_literals() {
        let mesh = CollisionTriMesh {
            vertices: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            indices: vec![0, 1, 2],
        };
        let xml = build_mesh_collision_xml(&mesh).unwrap();
        assert!(xml.contains("hknpCompressedMeshShape"));
        assert!(xml.contains(r#"<field name="meshTree">"#));
        assert!(!xml.contains(r#"dec="-40.01""#));
        assert!(xml.contains(r#"<integer value="1"/>"#)); // one primitive
    }

    #[test]
    fn large_mesh_splits_into_multiple_sections() {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        for batch in 0..3usize {
            let base = (batch * 200) as f64;
            let v_base = vertices.len() as u32;
            vertices.push([base, 0.0, 0.0]);
            vertices.push([base + 1.0, 0.0, 0.0]);
            vertices.push([base, 1.0, 0.0]);
            for t in 0..200usize {
                let o = (v_base as usize) + t * 3;
                if o + 2 >= vertices.len() {
                    vertices.push([base + (t as f64), 0.0, 0.0]);
                    vertices.push([base + (t as f64) + 0.1, 0.0, 0.0]);
                    vertices.push([base + (t as f64), 0.1, 0.0]);
                }
                indices.extend_from_slice(&[
                    (v_base + t as u32 * 3) % vertices.len() as u32,
                    ((v_base + t as u32 * 3 + 1) % vertices.len() as u32),
                    ((v_base + t as u32 * 3 + 2) % vertices.len() as u32),
                ]);
            }
        }
        // simpler: 300 separate triangles with unique verts
        vertices.clear();
        indices.clear();
        for i in 0..300usize {
            let x = i as f64;
            let base = vertices.len() as u32;
            vertices.push([x, 0.0, 0.0]);
            vertices.push([x + 0.1, 0.0, 0.0]);
            vertices.push([x, 0.1, 0.0]);
            indices.extend_from_slice(&[base, base + 1, base + 2]);
        }
        let mesh = CollisionTriMesh { vertices, indices };
        let (global_min, global_max) = padded_aabb(&mesh).unwrap();
        let build = split_and_encode_sections(&mesh, global_min, global_max).unwrap();
        assert!(build.sections.len() >= 2);
    }

    #[test]
    fn multi_section_mesh_writes_real_mesh_bvh_and_data_run_indices() {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        for i in 0..300usize {
            let x = i as f64;
            let base = vertices.len() as u32;
            vertices.push([x, 0.0, 0.0]);
            vertices.push([x + 0.1, 0.0, 0.0]);
            vertices.push([x, 0.1, 0.0]);
            indices.extend_from_slice(&[base, base + 1, base + 2]);
        }

        let mesh = CollisionTriMesh { vertices, indices };
        let xml = build_mesh_collision_xml(&mesh).unwrap();

        assert!(
            xml.contains(r#"<array count="7" elementtypeid="type391">"#),
            "four sections should produce a 7-node Axis5 mesh tree"
        );
        assert!(xml.contains(r#"<field name="firstDataRunIndex"><integer value="0"/></field>"#));
        assert!(xml.contains(r#"<field name="firstDataRunIndex"><integer value="1"/></field>"#));
        assert!(xml.contains(r#"<field name="firstDataRunIndex"><integer value="2"/></field>"#));
        assert!(xml.contains(r#"<field name="firstDataRunIndex"><integer value="3"/></field>"#));
        assert!(xml.contains(r#"<field name="index"><integer value="0"/></field>"#));
        assert!(!xml.contains(r#"<field name="index"><integer value="127"/></field>"#));
    }

    #[test]
    fn multi_section_mesh_uses_primitive_key_shape_bits() {
        // 3901 primitives -> 7802 primitive keys -> 13 bits. The shape-key width follows
        // the primitive-key space (matching the game's own assets), not the section count.
        let mesh = separate_triangles_mesh(3901);
        let xml = build_mesh_collision_xml(&mesh).unwrap();

        assert_eq!(mesh_key_info(7802), (13, 7801, 13));
        assert!(xml.contains(r#"<field name="numPrimitiveKeys"><integer value="7802"/></field>"#));
        assert!(xml.contains(r#"<field name="bitsPerKey"><integer value="13"/></field>"#));
        assert!(xml.contains(r#"<field name="maxKeyValue"><integer value="7801"/></field>"#));
        assert!(xml.contains(r#"<field name="numShapeKeyBits"><integer value="13"/></field>"#));
    }

    fn separate_triangles_mesh(count: usize) -> CollisionTriMesh {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        for i in 0..count {
            let x = i as f64;
            let base = vertices.len() as u32;
            vertices.push([x, 0.0, 0.0]);
            vertices.push([x + 0.1, 0.0, 0.0]);
            vertices.push([x, 0.1, 0.0]);
            indices.extend_from_slice(&[base, base + 1, base + 2]);
        }
        CollisionTriMesh { vertices, indices }
    }

    #[test]
    fn fit_to_single_section_stays_within_one_section_budget() {
        let mesh = separate_triangles_mesh(300);
        let fitted = fit_to_single_section(&mesh).unwrap();

        assert!(fitted.triangle_count() <= MAX_SECTION_TRIS);
        assert!(fitted.vertices.len() <= MAX_SECTION_VERTS);
        assert_eq!(fitted.indices.len(), fitted.triangle_count() * 3);

        // The fitted mesh must encode to exactly one section with empty shared arrays.
        let xml = build_mesh_collision_xml(&fitted).unwrap();
        assert!(xml.contains(r#"<array count="1" elementtypeid="type386">"#));
        assert!(xml.contains(r#"<array count="0" elementtypeid="type136">"#)); // sharedVertices
        assert!(xml.contains(r#"<array count="0" elementtypeid="type188">"#)); // sharedVerticesIndex
    }

    #[test]
    fn fit_to_single_section_keeps_small_mesh_whole() {
        let mesh = separate_triangles_mesh(10);
        let fitted = fit_to_single_section(&mesh).unwrap();
        assert_eq!(fitted.triangle_count(), 10);
    }

    #[test]
    fn neutralize_acceleration_payload_empties_simd_and_connectivity() {
        let xml = r#"<field name="simdTree">
        <record>
          <field name="nodes">
            <array count="2" elementtypeid="type357">
              <record><field name="parent"><integer value="0"/></field></record>
              <record><field name="parent"><integer value="1"/></field></record>
            </array>
          </field>
          <field name="isCompact"><bool value="true"/></field>
        </record>
      </field>
      <field name="connectivity">
        <record>
          <field name="headers"><array count="3" elementtypeid="type375"></array></field>
          <field name="localLinks"><array count="5" elementtypeid="type135"></array></field>
          <field name="globalLinks"><array count="7" elementtypeid="type377"></array></field>
        </record>
      </field>
      <field name="hasSimdTree"><bool value="true"/></field>"#;

        let out = neutralize_acceleration_payload(xml).unwrap();

        assert!(out.contains(r#"<array count="0" elementtypeid="type357">"#));
        assert!(!out.contains(
            r#"elementtypeid="type357">
              <record>"#
        ));
        assert!(out.contains(r#"<array count="0" elementtypeid="type375">"#));
        assert!(out.contains(r#"<array count="0" elementtypeid="type135">"#));
        assert!(out.contains(r#"<array count="0" elementtypeid="type377">"#));
        assert!(out.contains(r#"<field name="isCompact"><bool value="false"/></field>"#));
        assert!(out.contains(r#"<field name="hasSimdTree"><bool value="false"/></field>"#));
        assert!(!out.contains(r#"value="true""#));
    }

    #[test]
    fn faithful_builder_uses_game_shell_and_neutralizes_acceleration() {
        let mesh = separate_triangles_mesh(50);
        let xml = build_mesh_collision_xml_faithful(&mesh).unwrap();

        // Geometry injected into the real-game shell (body "rr"), not the box template.
        assert!(xml.contains(r#"<field name="meshTree">"#));
        assert!(xml.contains(r#"<string value="rr"/>"#));
        assert!(!xml.contains("object_box01_col01"));

        // Acceleration payload neutralized; primitive-key shape sizing (50 -> 100 keys).
        assert!(xml.contains(r#"<field name="hasSimdTree"><bool value="false"/></field>"#));
        assert!(xml.contains(r#"<field name="numPrimitiveKeys"><integer value="100"/></field>"#));
    }

    #[test]
    fn external_template_replaces_all_mesh_tree_fields() {
        let mesh = CollisionTriMesh {
            vertices: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            indices: vec![0, 1, 2],
        };
        let template = COLLISION_TEMPLATE_XML.replacen(
            r#"<field name="meshTree">"#,
            r#"<field name="meshTree"><record><field name="nodes"><array count="0" elementtypeid="type391"></array></field></record></field><field name="meshTree">"#,
            1,
        );

        let xml = build_mesh_collision_xml_with_template(&mesh, &template).unwrap();
        let mesh_tree_count = xml.matches(r#"<field name="meshTree">"#).count();
        let primitive_count = xml
            .matches(r#"<field name="numPrimitiveKeys"><integer value="2"/></field>"#)
            .count();

        assert_eq!(mesh_tree_count, 2);
        assert_eq!(primitive_count, 2);
    }

    #[test]
    fn validate_havok_shared_vertex_count_allows_u16_space() {
        validate_havok_shared_vertex_count(MAX_HAVOK_SHARED_VERTICES).expect("65536 fits u16");
    }

    #[test]
    fn validate_havok_shared_vertex_count_rejects_overflow() {
        let err = validate_havok_shared_vertex_count(MAX_HAVOK_SHARED_VERTICES + 1).unwrap_err();
        assert!(err.contains("Shared vertex count"));
    }

    #[test]
    fn validate_havok_section_count_rejects_axis5_overflow() {
        let err = validate_havok_section_count(MAX_HAVOK_SECTIONS + 1).unwrap_err();
        assert!(err.contains("Havok sections"));
    }
}
