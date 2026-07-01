//! FBX import via ufbx into the neutral `ImportScene` used by `dae_to_ssbh`.

use anyhow::{anyhow, Result};
use glam::{Mat4, Vec3, Vec4};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use ufbx::{
    AllocatorOpts, Application, LoadOpts, Matrix, Mesh, Node, Real, Scene, SkinCluster,
    SkinDeformer, VertexStream,
};

use super::dae_analyze::{analysis_report_for_import_scene, DaeAnalysisReport};
use super::dae_parse::{ConvertedFiles, DaeConvertConfig};
use super::dae_to_ssbh::{convert_import_scene_file, SsbhConvertStats};
use super::import_scene::{
    FbxImportSource, ImportBone, ImportBoneInfluence, ImportMesh, ImportScene, ImportVertexWeight,
    UpAxisConversion,
};

const DEFAULT_NORMAL: [f32; 3] = [0.0, 0.0, 1.0];
const DEFAULT_UV: [f32; 2] = [0.0, 0.0];
const SSBH_LOCAL_MATRIX_PROP: &str = "EXVS2_SSBH_LocalMatrix";

fn application_text_indicates_blender(app: &Application) -> bool {
    text_indicates_blender(&app.name, &app.vendor)
}

fn application_text_indicates_maya(app: &Application) -> bool {
    app.name.to_ascii_lowercase().contains("maya")
}

fn text_indicates_blender(name: &str, vendor: &str) -> bool {
    let name = name.to_ascii_lowercase();
    let vendor = vendor.to_ascii_lowercase();
    name.contains("blender") || vendor.contains("blender")
}

fn creator_text_indicates_blender(creator: &str) -> bool {
    creator.to_ascii_lowercase().contains("blender")
}

fn creator_text_indicates_maya(creator: &str) -> bool {
    creator.to_ascii_lowercase().contains("maya")
}

/// Detect the DCC that produced an FBX file from ufbx metadata.
pub fn detect_fbx_import_source(scene: &Scene) -> FbxImportSource {
    let metadata = &scene.metadata;
    if application_text_indicates_blender(&metadata.original_application)
        || application_text_indicates_blender(&metadata.latest_application)
        || creator_text_indicates_blender(&metadata.creator)
    {
        return FbxImportSource::Blender;
    }
    if application_text_indicates_maya(&metadata.original_application)
        || application_text_indicates_maya(&metadata.latest_application)
        || creator_text_indicates_maya(&metadata.creator)
    {
        return FbxImportSource::Maya;
    }
    FbxImportSource::Unknown
}

/// Blender FBX IO uses `FrontAxisSign=+1` / `CoordAxisSign=+1`, while our FBX export uses
/// Maya-style `-1`/`-1`. ufbx resolves those conventions into different scene spaces; without
/// correction, a Blender round-trip flips the model 180 degrees around Y (head/tail reversed).
fn scene_uses_blender_fbx_axis_convention(scene: &Scene) -> bool {
    scene.settings.axes.front == ufbx::CoordinateAxis::PositiveZ
        && scene.settings.axes.right == ufbx::CoordinateAxis::PositiveX
        && matches!(
            scene.settings.axes.up,
            ufbx::CoordinateAxis::PositiveY | ufbx::CoordinateAxis::NegativeY
        )
}

fn apply_y180_axis_convention_correction(scene: &mut ImportScene) {
    let rot = Mat4::from_rotation_y(std::f32::consts::PI);
    for mesh in &mut scene.meshes {
        for vertex in &mut mesh.vertices {
            *vertex = rot.transform_point3(Vec3::from_array(*vertex)).to_array();
        }
        for normal in &mut mesh.normals {
            let transformed = rot.transform_vector3(Vec3::from_array(*normal));
            if let Some(normalized) = normalized_vec3(transformed) {
                *normal = normalized;
            }
        }
    }
}

fn load_fbx_scene(path: &Path) -> Result<ufbx::SceneRoot> {
    let path_str = path
        .to_str()
        .ok_or_else(|| anyhow!("FBX path must be valid UTF-8: {}", path.display()))?;
    ufbx::load_file(path_str, LoadOpts::default())
        .map_err(|e| anyhow!("ufbx failed to load FBX: {} — {}", e.description, e.info()))
}

fn rf32(v: Real) -> f32 {
    v as f32
}

fn f32_key(v: f32) -> u32 {
    if v == 0.0 {
        0.0f32.to_bits()
    } else {
        v.to_bits()
    }
}

fn vec2_key(v: [f32; 2]) -> [u32; 2] {
    [f32_key(v[0]), f32_key(v[1])]
}

fn vec3_key(v: [f32; 3]) -> [u32; 3] {
    [f32_key(v[0]), f32_key(v[1]), f32_key(v[2])]
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct PackedFbxVertex {
    logical_vertex: u32,
    position: [u32; 3],
    normal: [u32; 3],
    uv: [u32; 2],
}

impl PackedFbxVertex {
    fn new(logical_vertex: u32, position: [f32; 3], normal: [f32; 3], uv: [f32; 2]) -> Self {
        Self {
            logical_vertex,
            position: vec3_key(position),
            normal: vec3_key(normal),
            uv: vec2_key(uv),
        }
    }

    fn position(self) -> [f32; 3] {
        [
            f32::from_bits(self.position[0]),
            f32::from_bits(self.position[1]),
            f32::from_bits(self.position[2]),
        ]
    }

    fn normal(self) -> [f32; 3] {
        [
            f32::from_bits(self.normal[0]),
            f32::from_bits(self.normal[1]),
            f32::from_bits(self.normal[2]),
        ]
    }

    fn uv(self) -> [f32; 2] {
        [f32::from_bits(self.uv[0]), f32::from_bits(self.uv[1])]
    }
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

fn transform_instance_position(position: [f32; 3], instance_to_world: Mat4) -> [f32; 3] {
    instance_to_world
        .transform_point3(Vec3::from_array(position))
        .to_array()
}

fn normalized_vec3(v: Vec3) -> Option<[f32; 3]> {
    (v.is_finite() && v.length_squared() > f32::EPSILON).then(|| v.normalize().to_array())
}

fn transform_instance_normal(normal: [f32; 3], instance_to_world: Mat4) -> [f32; 3] {
    let source = Vec3::from_array(normal);
    let normal_matrix = instance_to_world.inverse().transpose();
    let transformed = normal_matrix.transform_vector3(source);
    normalized_vec3(transformed)
        .or_else(|| normalized_vec3(instance_to_world.transform_vector3(source)))
        .unwrap_or(normal)
}

fn apply_instance_transform_to_mesh(mesh: &mut ImportMesh, instance_to_world: Mat4) {
    for vertex in &mut mesh.vertices {
        *vertex = transform_instance_position(*vertex, instance_to_world);
    }
    for normal in &mut mesh.normals {
        *normal = transform_instance_normal(*normal, instance_to_world);
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
                out.entry(name)
                    .or_insert_with(|| matrix_3x4_to_import_columns(&cluster.geometry_to_bone));
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
        cur = cur.parent.as_ref().map(|r| r.as_ref()).ok_or_else(|| {
            anyhow!(
                "FBX skeleton: bone node '{}' is not a scene descendant of parent bone '{}'",
                child.element.name,
                ancestor.element.name
            )
        })?;
    }
    Ok(m)
}

fn root_bone_local_transform(node: &Node) -> Mat4 {
    if node.parent.is_some() {
        ufbx_matrix3x4_to_glam(&node.node_to_parent)
    } else {
        ufbx_matrix3x4_to_glam(&node.node_to_world)
    }
}

fn parse_matrix_prop(value: &str) -> Option<Mat4> {
    let mut values = [0.0f32; 16];
    let mut count = 0usize;
    for part in value
        .split(|character: char| character.is_ascii_whitespace() || character == ',')
        .filter(|part| !part.is_empty())
    {
        if count >= values.len() {
            return None;
        }
        values[count] = part.parse().ok()?;
        count += 1;
    }
    (count == values.len()).then(|| Mat4::from_cols_array(&values))
}

fn ssbh_local_transform_prop(node: &Node) -> Option<Mat4> {
    let prop = ufbx::find_prop(&node.element.props, SSBH_LOCAL_MATRIX_PROP)?;
    (prop.type_ == ufbx::PropType::String)
        .then(|| parse_matrix_prop(prop.value_str.as_ref()))
        .flatten()
        .filter(Mat4::is_finite)
}

fn ancestor_bone_parent_index(
    mut node: Option<&Node>,
    name_to_index: &HashMap<String, usize>,
) -> Option<usize> {
    while let Some(n) = node {
        if let Some(&idx) = name_to_index.get(n.element.name.as_ref()) {
            return Some(idx);
        }
        if let Some(parent) = n.parent.as_ref() {
            node = Some(parent.as_ref());
        } else {
            break;
        }
    }
    None
}

/// World pose for skinned bones that have no matching scene node (append-only path).
fn bone_world_from_skin_clusters(
    scene: &Scene,
    required_names: &HashSet<String>,
) -> HashMap<String, Mat4> {
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
            let parent_index =
                ancestor_bone_parent_index(node.parent.as_ref().map(|p| p.as_ref()), name_to_index);
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
                if let Some(source_local) = ssbh_local_transform_prop(child_node) {
                    source_local
                } else {
                    let parent_name = drafts[p].name.as_str();
                    let parent_node =
                        find_scene_node_by_name(scene, parent_name).ok_or_else(|| {
                            anyhow!(
                                "FBX skeleton: parent bone '{}' has no scene node",
                                parent_name
                            )
                        })?;
                    local_transform_upto_ancestor(child_node, parent_node)
                        .map_err(|e| anyhow!("FBX skeleton: bone '{}': {}", d.name, e))?
                }
            }
            None => {
                if let Some(child_node) = find_scene_node_by_name(scene, &d.name) {
                    ssbh_local_transform_prop(child_node)
                        .unwrap_or_else(|| root_bone_local_transform(child_node))
                } else {
                    d.world
                }
            }
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

fn mesh_position_at_corner(mesh: &Mesh, corner: usize, logical_vertex: u32) -> Result<[f32; 3]> {
    if corner >= mesh.num_indices {
        return Err(anyhow!(
            "Mesh '{}': corner index {} out of range (num_indices={})",
            mesh.element.name,
            corner,
            mesh.num_indices
        ));
    }
    if mesh.vertex_position.exists {
        let p = mesh.vertex_position[corner];
        return Ok([rf32(p.x), rf32(p.y), rf32(p.z)]);
    }
    mesh_vertex_position(mesh, logical_vertex as usize)
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

fn mesh_has_uv(mesh: &Mesh) -> bool {
    mesh.vertex_uv.exists || mesh.uv_sets.iter().any(|set| set.vertex_uv.exists)
}

fn remap_skin_influences_to_expanded_vertices(
    influences: Vec<ImportBoneInfluence>,
    logical_to_expanded: &[Vec<u32>],
) -> Vec<ImportBoneInfluence> {
    let mut remapped = Vec::with_capacity(influences.len());

    for influence in influences {
        let mut vertex_weights = Vec::new();
        for weight in influence.vertex_weights {
            let logical_index = weight.vertex_index as usize;
            let Some(expanded_indices) = logical_to_expanded.get(logical_index) else {
                continue;
            };
            vertex_weights.reserve(expanded_indices.len());
            for &expanded_index in expanded_indices {
                vertex_weights.push(ImportVertexWeight {
                    vertex_index: expanded_index,
                    weight: weight.weight,
                });
            }
        }
        if !vertex_weights.is_empty() {
            remapped.push(ImportBoneInfluence {
                bone_name: influence.bone_name,
                vertex_weights,
            });
        }
    }

    remapped
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
            let bone_name = cluster_names.get(ci).cloned().ok_or_else(|| {
                anyhow!("Mesh '{}': invalid cluster_index {}", mesh.element.name, ci)
            })?;
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

    let all_corners = mesh.vertex_indices.as_ref();
    let has_normals = mesh.vertex_normal.exists;
    let has_uvs = mesh_has_uv(mesh);
    let has_skin = !mesh.skin_deformers.is_empty();
    let estimated_triangle_corners = mesh.num_triangles.saturating_mul(3);
    if estimated_triangle_corners > u32::MAX as usize {
        return Err(anyhow!(
            "Mesh '{}': too many triangle corners for u32 indices ({})",
            mesh.element.name,
            estimated_triangle_corners
        ));
    }

    let mut packed_vertices: Vec<PackedFbxVertex> = Vec::with_capacity(estimated_triangle_corners);
    let mut corner_buf = vec![0u32; mesh.max_face_triangles.saturating_mul(3).max(3)];

    for face in mesh.faces.iter() {
        let f = *face;
        if f.num_indices < 3 {
            continue;
        }

        let begin = f.index_begin as usize;
        let end = begin + f.num_indices as usize;
        if end > all_corners.len() {
            return Err(anyhow!(
                "Mesh '{}': face index range out of bounds",
                mesh.element.name
            ));
        }

        let ntri = ufbx::triangulate_face(&mut corner_buf, mesh, f);
        let corner_count = ntri as usize * 3;
        if corner_count == 0 {
            continue;
        }

        for &corner_idx in &corner_buf[..corner_count] {
            let corner = corner_idx as usize;
            if corner >= all_corners.len() {
                return Err(anyhow!(
                    "Mesh '{}': triangulation produced out-of-bounds corner index {} (num_indices={})",
                    mesh.element.name,
                    corner_idx,
                    all_corners.len()
                ));
            }
            let logical_vertex = all_corners[corner];
            if logical_vertex as usize >= mesh.num_vertices {
                return Err(anyhow!(
                    "Mesh '{}': corner {} maps to invalid logical vertex {} (num_vertices={})",
                    mesh.element.name,
                    corner_idx,
                    logical_vertex,
                    mesh.num_vertices
                ));
            }

            let position = mesh_position_at_corner(mesh, corner, logical_vertex)?;
            let normal = if has_normals {
                mesh_normal_at_corner(mesh, corner).unwrap_or(DEFAULT_NORMAL)
            } else {
                DEFAULT_NORMAL
            };
            let uv = if has_uvs {
                mesh_uv_at_corner(mesh, corner).unwrap_or(DEFAULT_UV)
            } else {
                DEFAULT_UV
            };

            let skin_vertex_key = if has_skin { logical_vertex } else { 0 };
            packed_vertices.push(PackedFbxVertex::new(skin_vertex_key, position, normal, uv));
        }
    }

    if packed_vertices.is_empty() {
        return Err(anyhow!(
            "Mesh '{}' produced no triangles",
            mesh.element.name
        ));
    }

    let mut indices = vec![0u32; packed_vertices.len()];
    let unique_count = {
        let mut streams = [VertexStream::new(&mut packed_vertices)];
        ufbx::generate_indices(&mut streams, &mut indices, AllocatorOpts::default()).map_err(
            |e| {
                anyhow!(
                    "ufbx failed to generate mesh indices: {} — {}",
                    e.description,
                    e.info()
                )
            },
        )?
    };
    packed_vertices.truncate(unique_count);

    let logical_to_expanded = if has_skin {
        let mut logical_to_expanded = vec![Vec::new(); mesh.num_vertices];
        for (expanded_index, packed) in packed_vertices.iter().enumerate() {
            let logical_index = packed.logical_vertex as usize;
            if logical_index < logical_to_expanded.len() {
                logical_to_expanded[logical_index].push(expanded_index as u32);
            }
        }
        logical_to_expanded
    } else {
        Vec::new()
    };

    let vertices: Vec<[f32; 3]> = packed_vertices
        .iter()
        .copied()
        .map(PackedFbxVertex::position)
        .collect();
    let normals: Vec<[f32; 3]> = if has_normals {
        packed_vertices
            .iter()
            .copied()
            .map(PackedFbxVertex::normal)
            .collect()
    } else {
        Vec::new()
    };
    let uvs: Vec<[f32; 2]> = if has_uvs {
        packed_vertices
            .iter()
            .copied()
            .map(PackedFbxVertex::uv)
            .collect()
    } else {
        Vec::new()
    };

    if indices.is_empty() {
        return Err(anyhow!(
            "Mesh '{}' produced no triangles",
            mesh.element.name
        ));
    }

    let bone_influences = if let Some(skin_ref) = mesh.skin_deformers.first() {
        remap_skin_influences_to_expanded_vertices(
            skin_influences_for_mesh(mesh, skin_ref.as_ref())?,
            &logical_to_expanded,
        )
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

fn collect_mesh_instance_nodes<'a>(node: &'a Node, nodes: &mut Vec<&'a Node>) {
    if node.mesh.is_some() {
        nodes.push(node);
    }
    for child in node.children.iter() {
        collect_mesh_instance_nodes(child.as_ref(), nodes);
    }
}

fn mesh_instance_base_name(node: &Node, mesh: &Mesh) -> String {
    let node_name = node.element.name.as_ref();
    if !node_name.is_empty() {
        return node_name.to_string();
    }
    let mesh_name = mesh.element.name.as_ref();
    if !mesh_name.is_empty() {
        return mesh_name.to_string();
    }
    format!("UnnamedMesh_{}", mesh.element.element_id)
}

fn import_mesh_instance_node(
    node: &Node,
    mesh_name_counts: &mut HashMap<String, u32>,
) -> Result<ImportMesh> {
    let mesh = node
        .mesh
        .as_ref()
        .ok_or_else(|| anyhow!("FBX node '{}' has no mesh instance", node.element.name))?
        .as_ref();
    let unique_name =
        disambiguate_mesh_name(&mesh_instance_base_name(node, mesh), mesh_name_counts);
    let mut imported = import_one_mesh(mesh, unique_name)?;
    apply_instance_transform_to_mesh(
        &mut imported,
        ufbx_matrix3x4_to_glam(&node.geometry_to_world),
    );
    Ok(imported)
}

fn import_uninstanced_mesh(
    mesh: &Mesh,
    mesh_name_counts: &mut HashMap<String, u32>,
) -> Result<ImportMesh> {
    let base = mesh.element.name.as_ref();
    let base = if base.is_empty() {
        format!("UnnamedMesh_{}", mesh.element.element_id)
    } else {
        base.to_string()
    };
    import_one_mesh(mesh, disambiguate_mesh_name(&base, mesh_name_counts))
}

/// Build an `ImportScene` from a loaded ufbx scene.
fn build_import_scene_from_fbx(
    scene: &Scene,
    fbx_import_source: FbxImportSource,
) -> Result<ImportScene> {
    let up_axis = up_axis_from_scene(scene);
    let skin_bone_names = collect_skin_bone_names(scene);
    let inverse_by_bone = first_inverse_bind_per_bone(scene);
    let bones = build_bones_preorder(scene, &skin_bone_names, &inverse_by_bone)?;

    let mut meshes = Vec::new();
    let mut mesh_name_counts: HashMap<String, u32> = HashMap::new();
    let mut mesh_nodes = Vec::new();
    collect_mesh_instance_nodes(scene.root_node.as_ref(), &mut mesh_nodes);

    if mesh_nodes.is_empty() {
        for mesh_ref in scene.meshes.iter() {
            meshes.push(import_uninstanced_mesh(
                mesh_ref.as_ref(),
                &mut mesh_name_counts,
            )?);
        }
    } else {
        for node in mesh_nodes {
            meshes.push(import_mesh_instance_node(node, &mut mesh_name_counts)?);
        }
    }

    let mut import_scene = ImportScene {
        meshes,
        materials: Vec::new(),
        bones,
        up_axis,
        fbx_import_source: Some(fbx_import_source),
    };
    if scene_uses_blender_fbx_axis_convention(scene) {
        apply_y180_axis_convention_correction(&mut import_scene);
    }
    Ok(import_scene)
}

/// Load an FBX file and build an `ImportScene` (same downstream path as COLLADA).
pub fn parse_fbx_file(path: &Path) -> Result<ImportScene> {
    let root = load_fbx_scene(path)?;
    let fbx_import_source = detect_fbx_import_source(&root);
    build_import_scene_from_fbx(&root, fbx_import_source)
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
    let root = load_fbx_scene(fbx_file_path)?;
    let fbx_import_source = detect_fbx_import_source(&root);
    let scene = build_import_scene_from_fbx(&root, fbx_import_source)?;
    convert_import_scene_file(scene, config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ssbh_data::prelude::SkelData;
    use std::path::{Path, PathBuf};

    const BIGZAM_AKENO: &str = r"D:\output\bigzam\Akeno.fbx";
    const BIGZAM_AKENO_BODY: &str = r"D:\output\bigzam\Akeno_body.fbx";
    const MINECRAFT_BLENDER_FBX: &str = r"D:\output\minecraft\test.fbx";
    const MINECRAFT_LARGE_BLENDER_FBX: &str = r"D:\output\minecraft\test3.fbx";
    const GYAN_STICK_SKIN_BLENDER_FBX: &str = r"D:\output\N1_rocket\N2_not_boom_mix_ship.fbx";

    fn assert_close3(actual: [f32; 3], expected: [f32; 3]) {
        for (actual, expected) in actual.iter().zip(expected.iter()) {
            assert!(
                (actual - expected).abs() < 1e-5,
                "expected {expected}, got {actual}"
            );
        }
    }

    fn assert_close_matrix(actual: [[f32; 4]; 4], expected: [[f32; 4]; 4]) {
        for row in 0..4 {
            for col in 0..4 {
                assert!(
                    (actual[row][col] - expected[row][col]).abs() < 1e-5,
                    "matrix[{row}][{col}] expected {}, got {}",
                    expected[row][col],
                    actual[row][col]
                );
            }
        }
    }

    #[test]
    fn fbx_source_text_detection_helpers() {
        assert!(text_indicates_blender("Blender", "Blender Foundation"));
        assert!(creator_text_indicates_blender("Blender 4.2.0"));
        assert!(!text_indicates_blender("Maya", "Autodesk"));
        assert!(creator_text_indicates_maya("Maya 2024"));
    }

    #[test]
    fn detect_blender_fbx_sample_file_when_present() {
        let path = Path::new(MINECRAFT_BLENDER_FBX);
        if !path.is_file() {
            eprintln!("SKIP: {MINECRAFT_BLENDER_FBX} not found");
            return;
        }
        let scene = load_fbx_scene(path).expect("sample Blender FBX should load");
        assert_eq!(detect_fbx_import_source(&scene), FbxImportSource::Blender);
        let import_scene = parse_fbx_file(path).expect("sample Blender FBX should parse");
        assert_eq!(
            import_scene.fbx_import_source,
            Some(FbxImportSource::Blender)
        );
    }

    #[test]
    fn parse_blender_fbx_preserves_direct_bone_parents_when_present() {
        use ssbh_data::prelude::*;

        let path = Path::new(GYAN_STICK_SKIN_BLENDER_FBX);
        if !path.is_file() {
            eprintln!("SKIP: {GYAN_STICK_SKIN_BLENDER_FBX} not found");
            return;
        }

        let scene = parse_fbx_file(path).expect("Gyan Blender FBX should parse");
        let names: Vec<&str> = scene.bones.iter().map(|b| b.name.as_str()).collect();
        let gbl_rt = names
            .iter()
            .position(|name| *name == "GBL_RT")
            .expect("GBL_RT should be present");
        let stick = names
            .iter()
            .position(|name| *name == "STICK")
            .expect("STICK should be present");
        let ath = names
            .iter()
            .position(|name| *name == "ATH_E_VERNIER")
            .expect("ATH_E_VERNIER should be present");
        assert_eq!(scene.bones[gbl_rt].parent_index, None);
        assert_eq!(scene.bones[stick].parent_index, Some(gbl_rt));
        assert_eq!(scene.bones[ath].parent_index, Some(stick));
        assert_close_matrix(
            scene.bones[gbl_rt].transform,
            Mat4::IDENTITY.to_cols_array_2d(),
        );

        let output = tempfile::tempdir().expect("temp conversion dir");
        let config = DaeConvertConfig {
            output_directory: output.path().to_path_buf(),
            base_filename: "gyan_stick_skin".to_string(),
            scale_factor: 0.05,
            up_axis_conversion: UpAxisConversion::NoConversion,
            flip_uv: false,
            include_geometry_names: Vec::new(),
            write_numdlb: false,
            write_numshb: false,
            write_nusktb: true,
            modl_entries: Vec::new(),
        };
        let (files, _) = convert_fbx_file(path, &config).expect("Gyan Blender FBX should convert");
        let skel = SkelData::from_file(files.nusktb_path.as_ref().unwrap())
            .expect("converted nusktb should parse");
        let gbl_rt = skel
            .bones
            .iter()
            .position(|bone| bone.name == "GBL_RT")
            .expect("GBL_RT should be present");
        let stick = skel
            .bones
            .iter()
            .position(|bone| bone.name == "STICK")
            .expect("STICK should be present");
        let ath = skel
            .bones
            .iter()
            .position(|bone| bone.name == "ATH_E_VERNIER")
            .expect("ATH_E_VERNIER should be present");
        assert_eq!(skel.bones[gbl_rt].parent_index, None);
        assert_eq!(skel.bones[stick].parent_index, Some(gbl_rt));
        assert_eq!(skel.bones[ath].parent_index, Some(stick));
        assert_close_matrix(
            skel.bones[gbl_rt].transform,
            Mat4::IDENTITY.to_cols_array_2d(),
        );
    }

    #[test]
    fn apply_instance_transform_bakes_positions_and_normals() {
        let mut mesh = ImportMesh {
            name: "Cube".to_string(),
            vertices: vec![[1.0, 2.0, 3.0]],
            normals: vec![[1.0, 0.0, 0.0]],
            uvs: Vec::new(),
            indices: vec![0, 0, 0],
            material_name: None,
            bone_influences: Vec::new(),
        };
        let transform = Mat4::from_scale_rotation_translation(
            glam::Vec3::new(2.0, 3.0, 4.0),
            glam::Quat::from_rotation_z(std::f32::consts::FRAC_PI_2),
            glam::Vec3::new(10.0, 20.0, 30.0),
        );

        apply_instance_transform_to_mesh(&mut mesh, transform);

        assert_close3(mesh.vertices[0], [4.0, 22.0, 42.0]);
        assert_close3(mesh.normals[0], [0.0, 1.0, 0.0]);
    }

    #[test]
    fn apply_instance_transform_preserves_skin_weight_indices() {
        let mut mesh = ImportMesh {
            name: "Skinned".to_string(),
            vertices: vec![[0.0, 0.0, 0.0]],
            normals: Vec::new(),
            uvs: Vec::new(),
            indices: vec![0, 0, 0],
            material_name: None,
            bone_influences: vec![ImportBoneInfluence {
                bone_name: "Root".to_string(),
                vertex_weights: vec![ImportVertexWeight {
                    vertex_index: 0,
                    weight: 1.0,
                }],
            }],
        };

        apply_instance_transform_to_mesh(
            &mut mesh,
            Mat4::from_translation(glam::Vec3::new(5.0, 0.0, 0.0)),
        );

        assert_eq!(mesh.vertices[0], [5.0, 0.0, 0.0]);
        assert_eq!(mesh.bone_influences[0].vertex_weights[0].vertex_index, 0);
        assert_eq!(mesh.bone_influences[0].vertex_weights[0].weight, 1.0);
    }

    #[test]
    fn parse_fbx_with_orphan_logical_vertices_succeeds() {
        let path = Path::new(BIGZAM_AKENO);
        if !path.is_file() {
            eprintln!("SKIP: {BIGZAM_AKENO} not found");
            return;
        }
        let scene =
            parse_fbx_file(path).expect("orphan logical vertices must not block FBX import");
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

    #[test]
    fn parse_blender_fbx_preserves_corner_attribute_splits() {
        let path = Path::new(MINECRAFT_BLENDER_FBX);
        if !path.is_file() {
            eprintln!("SKIP: {MINECRAFT_BLENDER_FBX} not found");
            return;
        }

        let path_str = path.to_string_lossy();
        let root = ufbx::load_file(path_str.as_ref(), LoadOpts::default())
            .expect("sample Blender FBX should load through ufbx");
        let logical_vertex_count: usize = root.meshes.iter().map(|m| m.as_ref().num_vertices).sum();

        let scene = parse_fbx_file(path).expect("sample Blender FBX should parse");
        let expanded_vertex_count: usize = scene.meshes.iter().map(|m| m.vertices.len()).sum();
        let uv_count: usize = scene.meshes.iter().map(|m| m.uvs.len()).sum();

        assert_eq!(scene.bones.len(), 0);
        assert!(
            expanded_vertex_count > logical_vertex_count * 2,
            "Blender FBX corner UV/normal splits should expand vertices: logical={logical_vertex_count}, expanded={expanded_vertex_count}"
        );
        assert_eq!(
            uv_count, expanded_vertex_count,
            "UVs should be in the same vertex domain as positions"
        );
        for mesh in &scene.meshes {
            assert_eq!(mesh.indices.len() % 3, 0);
            assert!(mesh
                .indices
                .iter()
                .all(|&i| (i as usize) < mesh.vertices.len()));
        }
    }

    #[test]
    fn convert_blender_fbx_sample_to_ssbh_files() {
        use ssbh_data::modl_data::ModlData;
        use ssbh_data::prelude::*;

        let path = Path::new(MINECRAFT_BLENDER_FBX);
        if !path.is_file() {
            eprintln!("SKIP: {MINECRAFT_BLENDER_FBX} not found");
            return;
        }

        let output = tempfile::tempdir().expect("temp conversion dir");
        let config = DaeConvertConfig {
            output_directory: output.path().to_path_buf(),
            base_filename: "minecraft_test".to_string(),
            scale_factor: 1.0,
            up_axis_conversion: UpAxisConversion::NoConversion,
            flip_uv: false,
            include_geometry_names: Vec::new(),
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            modl_entries: Vec::new(),
        };

        let (files, stats) =
            convert_fbx_file(path, &config).expect("Blender FBX should convert to SSBH files");

        assert_eq!(stats.mesh_objects, 17);
        assert_eq!(stats.bones, 0);
        assert!(
            stats.total_vertices > 25_000,
            "corner attribute splits should be preserved through conversion, stats={stats:?}"
        );
        assert!(files.numdlb_path.as_ref().is_some_and(|p| p.is_file()));
        assert!(files.numshb_path.as_ref().is_some_and(|p| p.is_file()));
        assert!(files.nusktb_path.as_ref().is_some_and(|p| p.is_file()));

        let modl = ModlData::from_file(files.numdlb_path.as_ref().unwrap())
            .expect("converted numdlb should parse");
        let mesh = MeshData::from_file(files.numshb_path.as_ref().unwrap())
            .expect("converted numshb should parse");
        let skel = SkelData::from_file(files.nusktb_path.as_ref().unwrap())
            .expect("converted nusktb should parse");
        assert_eq!(modl.entries.len(), 17);
        assert_eq!(mesh.objects.len(), 17);
        assert!(skel.bones.is_empty());
    }

    #[test]
    #[ignore = "large local FBX regression sample"]
    fn convert_large_blender_fbx_to_ssbh_files_has_in_bounds_indices() {
        use ssbh_data::prelude::*;

        let path = Path::new(MINECRAFT_LARGE_BLENDER_FBX);
        if !path.is_file() {
            eprintln!("SKIP: {MINECRAFT_LARGE_BLENDER_FBX} not found");
            return;
        }

        let output = tempfile::tempdir().expect("temp conversion dir");
        let config = DaeConvertConfig {
            output_directory: output.path().to_path_buf(),
            base_filename: "minecraft_large_test".to_string(),
            scale_factor: 1.0,
            up_axis_conversion: UpAxisConversion::NoConversion,
            flip_uv: false,
            include_geometry_names: Vec::new(),
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            modl_entries: Vec::new(),
        };

        let (files, stats) = convert_fbx_file(path, &config)
            .expect("large Blender FBX should convert to SSBH files");
        eprintln!(
            "[large_test3] mesh_objects={} vertices={} triangle_indices={} bones={}",
            stats.mesh_objects, stats.total_vertices, stats.total_triangle_indices, stats.bones
        );

        let mesh = MeshData::from_file(files.numshb_path.as_ref().unwrap())
            .expect("converted large numshb should parse");
        assert_eq!(mesh.objects.len(), stats.mesh_objects);
        assert_eq!(stats.bones, 0);

        let mut biggest_vertex_object: Option<(&str, usize, usize)> = None;
        for obj in &mesh.objects {
            let vertex_count = obj.vertex_count().expect("vertex count");
            let index_count = obj.vertex_indices.len();
            let max_index = obj.vertex_indices.iter().copied().max().unwrap_or(0);
            assert!(
                (max_index as usize) < vertex_count,
                "mesh '{}' subindex {} has max index {} >= vertex_count {}",
                obj.name,
                obj.subindex,
                max_index,
                vertex_count
            );
            assert!(
                max_index <= u16::MAX as u32,
                "mesh '{}' subindex {} still exceeds VS2 u16-safe index range: {}",
                obj.name,
                obj.subindex,
                max_index
            );

            let candidate = (obj.name.as_str(), vertex_count, index_count);
            if biggest_vertex_object
                .as_ref()
                .is_none_or(|(_, current_vertices, _)| vertex_count > *current_vertices)
            {
                biggest_vertex_object = Some(candidate);
            }
        }

        if let Some((name, vertex_count, index_count)) = biggest_vertex_object {
            eprintln!(
                "[large_test3] biggest object='{}' vertex_count={} index_count={}",
                name, vertex_count, index_count
            );
        }
    }

    #[test]
    fn convert_env_fbx_to_nusktb_matrix_check_when_set() {
        let Some(path) = std::env::var_os("SSBH_FBX_MATRIX_CHECK").map(PathBuf::from) else {
            eprintln!("SKIP: SSBH_FBX_MATRIX_CHECK is not set");
            return;
        };
        if !path.is_file() {
            eprintln!(
                "SKIP: SSBH_FBX_MATRIX_CHECK file not found: {}",
                path.display()
            );
            return;
        }
        let scale_factor = std::env::var("SSBH_FBX_MATRIX_CHECK_SCALE")
            .ok()
            .and_then(|value| value.parse::<f32>().ok())
            .unwrap_or(0.1);
        let output = tempfile::tempdir().expect("temp conversion dir");
        let config = DaeConvertConfig {
            output_directory: output.path().to_path_buf(),
            base_filename: "matrix_check".to_string(),
            scale_factor,
            up_axis_conversion: UpAxisConversion::NoConversion,
            flip_uv: false,
            include_geometry_names: Vec::new(),
            write_numdlb: false,
            write_numshb: false,
            write_nusktb: true,
            modl_entries: Vec::new(),
        };

        let (files, stats) = convert_fbx_file(&path, &config).expect("FBX should convert");
        eprintln!(
            "[matrix_check] converted {} bones={} meshes={}",
            path.display(),
            stats.bones,
            stats.mesh_objects
        );
        let skel = SkelData::from_file(files.nusktb_path.as_ref().unwrap())
            .expect("converted nusktb should parse");
        for (index, bone) in skel.bones.iter().enumerate() {
            let local = Mat4::from_cols_array_2d(&bone.transform);
            let (_, _, translation) = local.to_scale_rotation_translation();
            eprintln!(
                "[matrix_check] bone {index:02} '{}' parent={:?} translation={translation:?} matrix={:?}",
                bone.name, bone.parent_index, bone.transform
            );
        }

        if std::env::var("SSBH_FBX_MATRIX_EXPECT_GYAN").as_deref() == Ok("1") {
            let stick_index = skel
                .bones
                .iter()
                .position(|bone| bone.name == "STICK")
                .expect("expected STICK bone");
            let ath_index = skel
                .bones
                .iter()
                .position(|bone| bone.name == "ATH_E_VERNIER")
                .expect("expected ATH_E_VERNIER bone");
            assert_eq!(skel.bones[stick_index].parent_index, Some(0));
            assert_eq!(skel.bones[ath_index].parent_index, Some(stick_index));
            assert_close_matrix(
                skel.bones[stick_index].transform,
                Mat4::IDENTITY.to_cols_array_2d(),
            );
            assert_close_matrix(
                skel.bones[ath_index].transform,
                Mat4::from_scale_rotation_translation(
                    Vec3::ONE,
                    glam::Quat::from_rotation_y(std::f32::consts::PI),
                    Vec3::new(-17.7831 * scale_factor, 0.0, 0.0),
                )
                .to_cols_array_2d(),
            );
        }
    }

    #[test]
    fn diagnose_gyan_fbx_axis_flip() {
        const ORIGINAL: &str = r"D:\output\exvs2\Gyan\001gundam_005gyan00_001_wep_suibaku00.fbx";
        const BLENDER: &str = r"D:\output\exvs2\Gyan\Untitled.fbx";

        let original_path = Path::new(ORIGINAL);
        let blender_path = Path::new(BLENDER);
        if !original_path.is_file() || !blender_path.is_file() {
            eprintln!("SKIP: Gyan FBX samples not found");
            return;
        }

        let original_root = load_fbx_scene(original_path).expect("original fbx");
        let blender_root = load_fbx_scene(blender_path).expect("blender fbx");

        fn log_scene_settings(label: &str, scene: &Scene) {
            let s = &scene.settings;
            eprintln!(
                "[{label}] up={:?} front={:?} right={:?} original_up={:?} meters_per_unit={}",
                s.axes.up, s.axes.front, s.axes.right, s.original_axis_up, s.unit_meters
            );
            eprintln!(
                "[{label}] creator='{}' original_app='{}' latest_app='{}'",
                scene.metadata.creator,
                scene.metadata.original_application.name,
                scene.metadata.latest_application.name
            );
        }

        log_scene_settings("original", &original_root);
        log_scene_settings("blender", &blender_root);

        let original_scene =
            build_import_scene_from_fbx(&original_root, detect_fbx_import_source(&original_root))
                .expect("original import scene");
        let blender_scene =
            build_import_scene_from_fbx(&blender_root, detect_fbx_import_source(&blender_root))
                .expect("blender import scene");

        eprintln!(
            "[original] meshes={} bones={} up_axis={:?} source={:?}",
            original_scene.meshes.len(),
            original_scene.bones.len(),
            original_scene.up_axis,
            original_scene.fbx_import_source
        );
        eprintln!(
            "[blender] meshes={} bones={} up_axis={:?} source={:?}",
            blender_scene.meshes.len(),
            blender_scene.bones.len(),
            blender_scene.up_axis,
            blender_scene.fbx_import_source
        );

        for mesh in &original_scene.meshes {
            if mesh.vertices.is_empty() {
                continue;
            }
            let mut min = mesh.vertices[0];
            let mut max = mesh.vertices[0];
            for v in &mesh.vertices {
                for i in 0..3 {
                    min[i] = min[i].min(v[i]);
                    max[i] = max[i].max(v[i]);
                }
            }
            eprintln!(
                "[original mesh '{}'] verts={} bbox min={min:?} max={max:?}",
                mesh.name,
                mesh.vertices.len()
            );
        }
        for mesh in &blender_scene.meshes {
            if mesh.vertices.is_empty() {
                continue;
            }
            let mut min = mesh.vertices[0];
            let mut max = mesh.vertices[0];
            for v in &mesh.vertices {
                for i in 0..3 {
                    min[i] = min[i].min(v[i]);
                    max[i] = max[i].max(v[i]);
                }
            }
            eprintln!(
                "[blender mesh '{}'] verts={} bbox min={min:?} max={max:?}",
                mesh.name,
                mesh.vertices.len()
            );
        }

        for (label, scene) in [("original", &original_scene), ("blender", &blender_scene)] {
            for bone in &scene.bones {
                let t = bone.transform[3];
                eprintln!(
                    "[{label} bone '{}'] parent={:?} translation={t:?}",
                    bone.name, bone.parent_index
                );
            }
        }

        fn collect_mesh_nodes<'a>(node: &'a Node, out: &mut Vec<&'a Node>) {
            if node.mesh.is_some() {
                out.push(node);
            }
            for child in node.children.iter() {
                collect_mesh_nodes(child.as_ref(), out);
            }
        }

        for (label, root) in [("original", &original_root), ("blender", &blender_root)] {
            let mut nodes = Vec::new();
            collect_mesh_nodes(root.root_node.as_ref(), &mut nodes);
            for node in nodes {
                let gtw = node.geometry_to_world;
                eprintln!(
                    "[{label} mesh node '{}'] geometry_to_world translation=({}, {}, {})",
                    node.element.name,
                    rf32(gtw.m03),
                    rf32(gtw.m13),
                    rf32(gtw.m23)
                );
            }
        }

        if let (Some(om), Some(bm)) = (original_scene.meshes.first(), blender_scene.meshes.first())
        {
            assert_eq!(om.vertices.len(), bm.vertices.len());
            let mut matched = 0usize;
            for (ov, bv) in om.vertices.iter().zip(bm.vertices.iter()) {
                let diff = ov
                    .iter()
                    .zip(bv.iter())
                    .map(|(a, b)| (a - b).abs())
                    .fold(0.0f32, f32::max);
                if diff < 0.05 {
                    matched += 1;
                }
            }
            eprintln!(
                "[vertex compare after blender axis correction] matched={matched} total={}",
                om.vertices.len()
            );
            assert!(
                matched >= om.vertices.len().saturating_sub(1),
                "Blender round-trip vertices should match original fbxA after Y180 correction"
            );
        }
    }
}
