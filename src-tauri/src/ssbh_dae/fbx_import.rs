//! FBX import via ufbx into the neutral `ImportScene` used by `dae_to_ssbh`.

use anyhow::{anyhow, Result};
use glam::{Mat4, Vec4};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use ufbx::{LoadOpts, Matrix, Mesh, Node, Real, Scene, SkinCluster, SkinDeformer};

use super::dae_analyze::{analysis_report_for_import_scene, DaeAnalysisReport};
use super::dae_parse::{ConvertedFiles, DaeConvertConfig};
use super::dae_to_ssbh::{convert_import_scene_file, SsbhConvertStats};
use super::import_scene::{
    ImportBone, ImportBoneInfluence, ImportMesh, ImportScene, ImportVertexWeight, UpAxisConversion,
};

fn rf32(v: Real) -> f32 {
    v as f32
}

/// Column-major 4x4 (same layout as DAE `ImportBone::transform` / `glam::Mat4::from_cols_array_2d`).
fn matrix_3x4_to_import_columns(m: &Matrix) -> [[f32; 4]; 4] {
    [
        [rf32(m.m00), rf32(m.m10), rf32(m.m20), 0.0],
        [rf32(m.m01), rf32(m.m11), rf32(m.m21), 0.0],
        [rf32(m.m02), rf32(m.m12), rf32(m.m22), 0.0],
        [rf32(m.m03), rf32(m.m13), rf32(m.m23), 1.0],
    ]
}

fn ufbx_matrix3x4_to_glam(m: &Matrix) -> Mat4 {
    Mat4::from_cols(
        Vec4::new(rf32(m.m00), rf32(m.m10), rf32(m.m20), 0.0),
        Vec4::new(rf32(m.m01), rf32(m.m11), rf32(m.m21), 0.0),
        Vec4::new(rf32(m.m02), rf32(m.m12), rf32(m.m22), 0.0),
        Vec4::new(rf32(m.m03), rf32(m.m13), rf32(m.m23), 1.0),
    )
}

fn glam_to_import_columns(m: Mat4) -> [[f32; 4]; 4] {
    [
        [m.x_axis.x, m.x_axis.y, m.x_axis.z, m.x_axis.w],
        [m.y_axis.x, m.y_axis.y, m.y_axis.z, m.y_axis.w],
        [m.z_axis.x, m.z_axis.y, m.z_axis.z, m.z_axis.w],
        [m.w_axis.x, m.w_axis.y, m.w_axis.z, m.w_axis.w],
    ]
}

fn up_axis_from_scene(scene: &Scene) -> UpAxisConversion {
    match scene.settings.original_axis_up {
        ufbx::CoordinateAxis::PositiveY | ufbx::CoordinateAxis::NegativeY => UpAxisConversion::YUp,
        ufbx::CoordinateAxis::PositiveZ | ufbx::CoordinateAxis::NegativeZ => UpAxisConversion::ZUp,
        _ => UpAxisConversion::NoConversion,
    }
}

fn disambiguate_mesh_name(base: &str, used: &mut HashMap<String, u32>) -> String {
    let c = used.entry(base.to_string()).or_insert(0);
    *c += 1;
    if *c == 1 {
        base.to_string()
    } else {
        format!("{}_{}", base, *c - 1)
    }
}

fn cluster_bone_name(cluster: &SkinCluster) -> String {
    cluster
        .bone_node
        .as_ref()
        .map(|n| n.element.name.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| cluster.element.name.to_string())
}

fn collect_skin_bone_names(scene: &Scene) -> HashSet<String> {
    let mut names = HashSet::new();
    for mesh in scene.meshes.iter() {
        for skin_ref in mesh.skin_deformers.iter() {
            let skin = skin_ref.as_ref();
            for c in skin.clusters.iter() {
                let n = cluster_bone_name(c.as_ref());
                if !n.is_empty() {
                    names.insert(n);
                }
            }
        }
    }
    names
}

fn first_inverse_bind_per_bone(scene: &Scene) -> HashMap<String, [[f32; 4]; 4]> {
    let mut out = HashMap::new();
    for mesh in scene.meshes.iter() {
        for skin_ref in mesh.skin_deformers.iter() {
            let skin = skin_ref.as_ref();
            for c in skin.clusters.iter() {
                let cluster = c.as_ref();
                let name = cluster_bone_name(cluster);
                if name.is_empty() {
                    continue;
                }
                out.entry(name).or_insert_with(|| matrix_3x4_to_import_columns(&cluster.geometry_to_bone));
            }
        }
    }
    out
}

fn find_scene_node_by_name<'a>(scene: &'a Scene, name: &str) -> Option<&'a Node> {
    scene.nodes.iter().find_map(|nr| {
        let n = nr.as_ref();
        (n.element.name.as_ref() == name).then_some(n)
    })
}

/// Local transform from `child` bone node to `ancestor` bone node frame: product of `node_to_parent`
/// along the scene chain (ufbx: `child.node_to_world = parent.node_to_world * child.node_to_parent`).
fn local_transform_upto_ancestor(child: &Node, ancestor: &Node) -> Result<Mat4> {
    let target_id = ancestor.element.element_id;
    let mut cur = child;
    let mut m = Mat4::IDENTITY;
    while cur.element.element_id != target_id {
        m = ufbx_matrix3x4_to_glam(&cur.node_to_parent) * m;
        cur = cur
            .parent
            .as_ref()
            .map(|r| r.as_ref())
            .ok_or_else(|| {
                anyhow!(
                    "FBX skeleton: bone node '{}' is not a scene descendant of parent bone '{}'",
                    child.element.name,
                    ancestor.element.name
                )
            })?;
    }
    Ok(m)
}

fn ancestor_bone_parent_index(
    mut node: Option<&Node>,
    name_to_index: &HashMap<String, usize>,
) -> Option<usize> {
    while let Some(n) = node {
        if let Some(p) = n.parent.as_ref() {
            let parent = p.as_ref();
            if let Some(&idx) = name_to_index.get(parent.element.name.as_ref()) {
                return Some(idx);
            }
            node = Some(parent);
        } else {
            break;
        }
    }
    None
}

/// World pose for skinned bones that have no matching scene node (append-only path).
fn bone_world_from_skin_clusters(scene: &Scene, required_names: &HashSet<String>) -> HashMap<String, Mat4> {
    let mut out: HashMap<String, Mat4> = HashMap::new();
    for mesh in scene.meshes.iter() {
        for skin_ref in mesh.skin_deformers.iter() {
            for c in skin_ref.as_ref().clusters.iter() {
                let cluster = c.as_ref();
                let name = cluster_bone_name(cluster);
                if name.is_empty() || !required_names.contains(&name) {
                    continue;
                }
                if let Some(bn) = cluster.bone_node.as_ref() {
                    let w = ufbx_matrix3x4_to_glam(&bn.as_ref().node_to_world);
                    out.insert(name, w);
                }
            }
        }
    }
    out
}

struct BoneDraft {
    name: String,
    parent_index: Option<usize>,
    world: Mat4,
    inverse_bind_matrix: Option<[[f32; 4]; 4]>,
}

/// `SkelData` / DAE export treat `bone.transform` as **local** (child world = parent world * local).
/// ufbx `node_to_world` is global; convert with `local = inv(parent_world) * bone_world`.
fn build_bones_preorder(
    scene: &Scene,
    required_names: &HashSet<String>,
    inverse_by_bone: &HashMap<String, [[f32; 4]; 4]>,
) -> Result<Vec<ImportBone>> {
    if required_names.is_empty() {
        return Ok(Vec::new());
    }

    // Use scene node `node_to_world` only so parent chain and world poses stay consistent.
    // Cluster `bone_node` can disagree per mesh or duplicate bone name; mixing sources caused partial misalignment.
    let orphan_world = bone_world_from_skin_clusters(scene, required_names);
    let mut drafts: Vec<BoneDraft> = Vec::new();
    let mut name_to_index: HashMap<String, usize> = HashMap::new();

    fn visit(
        node: &Node,
        required_names: &HashSet<String>,
        inverse_by_bone: &HashMap<String, [[f32; 4]; 4]>,
        drafts: &mut Vec<BoneDraft>,
        name_to_index: &mut HashMap<String, usize>,
    ) {
        let name = node.element.name.to_string();
        if required_names.contains(&name) && !name_to_index.contains_key(&name) {
            let parent_index = ancestor_bone_parent_index(node.parent.as_ref().map(|p| p.as_ref()), name_to_index);
            let world = ufbx_matrix3x4_to_glam(&node.node_to_world);
            let inverse_bind_matrix = inverse_by_bone.get(&name).copied();
            let idx = drafts.len();
            name_to_index.insert(name.clone(), idx);
            drafts.push(BoneDraft {
                name,
                parent_index,
                world,
                inverse_bind_matrix,
            });
        }
        for child in node.children.iter() {
            visit(
                child.as_ref(),
                required_names,
                inverse_by_bone,
                drafts,
                name_to_index,
            );
        }
    }

    visit(
        scene.root_node.as_ref(),
        required_names,
        inverse_by_bone,
        &mut drafts,
        &mut name_to_index,
    );

    if drafts.len() != required_names.len() {
        let mut missing: Vec<String> = required_names
            .iter()
            .filter(|n| !name_to_index.contains_key(*n))
            .cloned()
            .collect();
        missing.sort();
        for n in missing {
            let inverse_bind_matrix = inverse_by_bone.get(&n).copied();
            let parent_index = None;
            let world = orphan_world.get(&n).copied().ok_or_else(|| {
                anyhow!(
                    "FBX skeleton: bone '{}' is referenced by skinning but has no node in the scene hierarchy and no cluster bone_node pose",
                    n
                )
            })?;
            let idx = drafts.len();
            name_to_index.insert(n.clone(), idx);
            drafts.push(BoneDraft {
                name: n,
                parent_index,
                world,
                inverse_bind_matrix,
            });
        }
    }

    let mut bones = Vec::with_capacity(drafts.len());
    for (i, d) in drafts.iter().enumerate() {
        let local = match d.parent_index {
            Some(p) => {
                if p >= i {
                    return Err(anyhow!(
                        "FBX skeleton: bone '{}' has parent_index {} which is not before index {}",
                        d.name,
                        p,
                        i
                    ));
                }
                let child_node = find_scene_node_by_name(scene, &d.name).ok_or_else(|| {
                    anyhow!(
                        "FBX skeleton: bone '{}' has no scene node (required for local transform)",
                        d.name
                    )
                })?;
                let parent_name = drafts[p].name.as_str();
                let parent_node = find_scene_node_by_name(scene, parent_name).ok_or_else(|| {
                    anyhow!(
                        "FBX skeleton: parent bone '{}' has no scene node",
                        parent_name
                    )
                })?;
                local_transform_upto_ancestor(child_node, parent_node).map_err(|e| {
                    anyhow!(
                        "FBX skeleton: bone '{}': {}",
                        d.name,
                        e
                    )
                })?
            }
            None => d.world,
        };
        bones.push(ImportBone {
            name: d.name.clone(),
            parent_index: d.parent_index,
            transform: glam_to_import_columns(local),
            inverse_bind_matrix: d.inverse_bind_matrix,
        });
    }
    Ok(bones)
}

/// ufbx `VertexVec2` / `VertexVec3` use **corner indices** (`0..num_indices`), not logical vertex indices.
/// Logical vertex `v` is stored in `mesh.vertices[v]`; attributes use one corner that references `v`.
/// Returns `None` when no polygon corner references the logical vertex (orphan / unused slot).
fn try_corner_for_logical_vertex(mesh: &Mesh, logical_vertex: usize) -> Option<usize> {
    if logical_vertex >= mesh.num_vertices {
        return None;
    }
    let want = logical_vertex as u32;
    let corners = mesh.vertex_indices.as_ref();
    let first = mesh.vertex_first_index.as_ref();
    if logical_vertex < first.len() {
        let ix = first[logical_vertex];
        if ix != u32::MAX {
            let ci = ix as usize;
            if ci < corners.len() && corners[ci] == want {
                return Some(ci);
            }
        }
    }
    for (ci, &v) in corners.iter().enumerate() {
        if v == want {
            return Some(ci);
        }
    }
    None
}

fn mesh_vertex_position(mesh: &Mesh, vi: usize) -> Result<[f32; 3]> {
    if vi >= mesh.num_vertices {
        return Err(anyhow!(
            "Mesh '{}': vertex index {} out of range (num_vertices={})",
            mesh.element.name,
            vi,
            mesh.num_vertices
        ));
    }
    let verts = mesh.vertices.as_ref();
    if verts.len() != mesh.num_vertices {
        return Err(anyhow!(
            "Mesh '{}': vertices buffer length {} != num_vertices {}",
            mesh.element.name,
            verts.len(),
            mesh.num_vertices
        ));
    }
    let p = verts[vi];
    Ok([rf32(p.x), rf32(p.y), rf32(p.z)])
}

fn mesh_normal_at_corner(mesh: &Mesh, corner: usize) -> Option<[f32; 3]> {
    if !mesh.vertex_normal.exists {
        return None;
    }
    if corner >= mesh.num_indices {
        return None;
    }
    let n = mesh.vertex_normal[corner];
    Some([rf32(n.x), rf32(n.y), rf32(n.z)])
}

fn mesh_uv_at_corner(mesh: &Mesh, corner: usize) -> Option<[f32; 2]> {
    if mesh.vertex_uv.exists {
        if corner < mesh.num_indices {
            let t = mesh.vertex_uv[corner];
            return Some([rf32(t.x), rf32(t.y)]);
        }
        return None;
    }
    if let Some(set) = mesh.uv_sets.first() {
        let uv = &set.vertex_uv;
        if uv.exists && corner < mesh.num_indices {
            let t = uv[corner];
            return Some([rf32(t.x), rf32(t.y)]);
        }
    }
    None
}

/// ufbx `triangulate_face` writes **per-mesh corner indices** (`face.index_begin + k`, in `0..num_indices`),
/// not logical vertex indices. Map each corner through `vertex_indices[corner]` to get `0..num_vertices`.
fn triangulated_indices(mesh: &Mesh) -> Result<Vec<u32>> {
    let mut indices: Vec<u32> = Vec::new();
    let mut corner_buf: Vec<u32> = Vec::new();
    let all_corners = mesh.vertex_indices.as_ref();
    for face in mesh.faces.iter() {
        let f = *face;
        if f.num_indices < 3 {
            continue;
        }
        corner_buf.clear();
        let begin = f.index_begin as usize;
        let end = begin + f.num_indices as usize;
        if end > all_corners.len() {
            return Err(anyhow!(
                "Mesh '{}': face index range out of bounds",
                mesh.element.name
            ));
        }
        let ntri = ufbx::triangulate_face_vec(&mut corner_buf, mesh, f);
        if ntri == 0 {
            continue;
        }
        for &corner_idx in corner_buf.iter() {
            let ci = corner_idx as usize;
            if ci >= all_corners.len() {
                return Err(anyhow!(
                    "Mesh '{}': triangulation produced out-of-bounds corner index {} (num_indices={})",
                    mesh.element.name,
                    corner_idx,
                    all_corners.len()
                ));
            }
            let logical = all_corners[ci];
            if logical as usize >= mesh.num_vertices {
                return Err(anyhow!(
                    "Mesh '{}': corner {} maps to invalid logical vertex {} (num_vertices={})",
                    mesh.element.name,
                    corner_idx,
                    logical,
                    mesh.num_vertices
                ));
            }
            indices.push(logical);
        }
    }
    Ok(indices)
}

fn skin_influences_for_mesh(mesh: &Mesh, skin: &SkinDeformer) -> Result<Vec<ImportBoneInfluence>> {
    let mut by_bone: HashMap<String, Vec<ImportVertexWeight>> = HashMap::new();
    let cluster_names: Vec<String> = skin
        .clusters
        .iter()
        .map(|c| cluster_bone_name(c.as_ref()))
        .collect();

    if skin.vertices.len() != mesh.num_vertices {
        return Err(anyhow!(
            "Mesh '{}': skin vertex count {} != mesh num_vertices {}",
            mesh.element.name,
            skin.vertices.len(),
            mesh.num_vertices
        ));
    }

    for vi in 0..mesh.num_vertices {
        let sv = skin.vertices[vi];
        let wb = sv.weight_begin as usize;
        let nw = sv.num_weights as usize;
        let we = wb.saturating_add(nw);
        if we > skin.weights.len() {
            return Err(anyhow!(
                "Mesh '{}': skin weight range out of bounds for vertex {}",
                mesh.element.name,
                vi
            ));
        }
        for w in wb..we {
            let sw = skin.weights[w];
            let ci = sw.cluster_index as usize;
            let bone_name = cluster_names
                .get(ci)
                .cloned()
                .ok_or_else(|| anyhow!("Mesh '{}': invalid cluster_index {}", mesh.element.name, ci))?;
            if bone_name.is_empty() {
                continue;
            }
            let weight = rf32(sw.weight);
            if weight <= 0.0 || !weight.is_finite() {
                continue;
            }
            by_bone
                .entry(bone_name)
                .or_default()
                .push(ImportVertexWeight {
                    vertex_index: vi as u32,
                    weight,
                });
        }
    }

    Ok(by_bone
        .into_iter()
        .map(|(bone_name, vertex_weights)| ImportBoneInfluence {
            bone_name,
            vertex_weights,
        })
        .collect())
}

fn import_one_mesh(mesh: &Mesh, name: String) -> Result<ImportMesh> {
    if mesh.num_vertices == 0 {
        return Err(anyhow!("Mesh '{}' has no vertices", mesh.element.name));
    }

    let mut vertices = Vec::with_capacity(mesh.num_vertices);
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut uvs: Vec<[f32; 2]> = Vec::new();

    for vi in 0..mesh.num_vertices {
        vertices.push(mesh_vertex_position(mesh, vi)?);
    }

    let has_uv = mesh.vertex_uv.exists || !mesh.uv_sets.is_empty();
    const ORPHAN_NORMAL: [f32; 3] = [0.0, 0.0, 1.0];
    const ORPHAN_UV: [f32; 2] = [0.0, 0.0];

    if mesh.vertex_normal.exists {
        for vi in 0..mesh.num_vertices {
            let n = try_corner_for_logical_vertex(mesh, vi)
                .and_then(|corner| mesh_normal_at_corner(mesh, corner))
                .unwrap_or(ORPHAN_NORMAL);
            normals.push(n);
        }
    }

    if has_uv {
        for vi in 0..mesh.num_vertices {
            let uv = try_corner_for_logical_vertex(mesh, vi)
                .and_then(|corner| mesh_uv_at_corner(mesh, corner))
                .unwrap_or(ORPHAN_UV);
            uvs.push(uv);
        }
    }

    let indices = triangulated_indices(mesh)?;
    if indices.is_empty() {
        return Err(anyhow!("Mesh '{}' produced no triangles", mesh.element.name));
    }

    let bone_influences = if let Some(skin_ref) = mesh.skin_deformers.first() {
        skin_influences_for_mesh(mesh, skin_ref.as_ref())?
    } else {
        Vec::new()
    };

    let material_name = mesh
        .materials
        .first()
        .map(|m| m.as_ref().element.name.to_string());

    Ok(ImportMesh {
        name,
        vertices,
        normals,
        uvs,
        indices,
        material_name,
        bone_influences,
    })
}

/// Load an FBX file and build an `ImportScene` (same downstream path as COLLADA).
pub fn parse_fbx_file(path: &Path) -> Result<ImportScene> {
    let path_str = path
        .to_str()
        .ok_or_else(|| anyhow!("FBX path must be valid UTF-8: {}", path.display()))?;
    let root = ufbx::load_file(path_str, LoadOpts::default()).map_err(|e| {
        anyhow!(
            "ufbx failed to load FBX: {} — {}",
            e.description,
            e.info()
        )
    })?;
    let scene: &Scene = &root;

    let up_axis = up_axis_from_scene(scene);
    let skin_bone_names = collect_skin_bone_names(scene);
    let inverse_by_bone = first_inverse_bind_per_bone(scene);
    let bones = build_bones_preorder(scene, &skin_bone_names, &inverse_by_bone)?;

    let mut mesh_name_counts: HashMap<String, u32> = HashMap::new();
    let mut meshes = Vec::new();
    for mesh_ref in scene.meshes.iter() {
        let mesh = mesh_ref.as_ref();
        let base = mesh.element.name.to_string();
        let base = if base.is_empty() {
            format!("UnnamedMesh_{}", mesh.element.element_id)
        } else {
            base
        };
        let unique_name = disambiguate_mesh_name(&base, &mut mesh_name_counts);
        let imported = import_one_mesh(mesh, unique_name)?;
        if !imported.vertices.is_empty() {
            meshes.push(imported);
        }
    }

    Ok(ImportScene {
        meshes,
        materials: Vec::new(),
        bones,
        up_axis,
    })
}

/// Preflight an FBX file (same JSON shape as `analyze_dae_path`).
pub fn analyze_fbx_path(path: &Path) -> Result<DaeAnalysisReport, String> {
    let scene = parse_fbx_file(path).map_err(|e| e.to_string())?;
    Ok(analysis_report_for_import_scene(
        path.to_string_lossy().to_string(),
        &scene,
    ))
}

/// Convert FBX → SSBH using the same options as DAE conversion.
pub fn convert_fbx_file(
    fbx_file_path: &Path,
    config: &DaeConvertConfig,
) -> Result<(ConvertedFiles, SsbhConvertStats)> {
    let scene = parse_fbx_file(fbx_file_path)?;
    convert_import_scene_file(scene, config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    const BIGZAM_AKENO: &str = r"D:\output\bigzam\Akeno.fbx";
    const BIGZAM_AKENO_BODY: &str = r"D:\output\bigzam\Akeno_body.fbx";

    #[test]
    fn parse_fbx_with_orphan_logical_vertices_succeeds() {
        let path = Path::new(BIGZAM_AKENO);
        if !path.is_file() {
            eprintln!("SKIP: {BIGZAM_AKENO} not found");
            return;
        }
        let scene = parse_fbx_file(path)
            .expect("orphan logical vertices must not block FBX import");
        assert_eq!(scene.meshes.len(), 1);
        let mesh = &scene.meshes[0];
        assert!(!mesh.vertices.is_empty());
        assert!(mesh.indices.len() >= 3);
        assert_eq!(mesh.indices.len() % 3, 0);
    }

    #[test]
    fn parse_fbx_body_export_without_skin_succeeds() {
        let path = Path::new(BIGZAM_AKENO_BODY);
        if !path.is_file() {
            eprintln!("SKIP: {BIGZAM_AKENO_BODY} not found");
            return;
        }
        let scene = parse_fbx_file(path).expect("body FBX export must parse");
        assert_eq!(scene.meshes.len(), 1);
        assert!(scene.meshes[0].indices.len() >= 3);
    }
}
