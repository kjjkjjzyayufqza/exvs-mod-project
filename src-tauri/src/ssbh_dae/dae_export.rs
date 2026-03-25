use anyhow::{anyhow, Result};
use serde::Serialize;
use ssbh_data::mesh_data::{MeshData, VectorData};
use ssbh_data::skel_data::SkelData;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::Write;
use std::path::Path;
use xmltree::{Element, XMLNode};

use super::dae_parse::UpAxisConversion;

/// Configuration for DAE export from SSBH mesh data
#[derive(Debug, Clone)]
pub struct DaeExportConfig {
    pub up_axis: UpAxisConversion,
    pub scale_factor: f32,
}

impl Default for DaeExportConfig {
    fn default() -> Self {
        Self {
            up_axis: UpAxisConversion::YUp,
            scale_factor: 1.0,
        }
    }
}

#[derive(Debug, Clone)]
struct JsonVertexWeight {
    vertex_index: u32,
    vertex_weight: f32,
}

#[derive(Debug, Clone)]
struct JsonBoneInfluence {
    bone_name: String,
    vertex_weights: Vec<JsonVertexWeight>,
}

#[derive(Debug, Clone)]
struct JsonMeshObject {
    name: String,
    vertex_indices: Vec<u32>,
    positions: Vec<[f32; 3]>,
    normals: Option<Vec<[f32; 3]>>,
    texcoords0: Option<Vec<[f32; 2]>>,
    bone_influences: Vec<JsonBoneInfluence>,
}

#[derive(Debug, Clone)]
struct JsonBone {
    name: String,
    transform: [[f32; 4]; 4],
    parent_index: Option<usize>,
}

#[derive(Debug, Clone)]
struct JsonScene {
    meshes: Vec<JsonMeshObject>,
    bones: Vec<JsonBone>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDaeStats {
    pub objects_exported: usize,
    pub triangles_exported: usize,
}

fn build_json_scene_from_ssbh(
    mesh_data: &MeshData,
    skel: Option<&SkelData>,
    config: &DaeExportConfig,
    include_objects: Option<&HashSet<(String, u64)>>,
) -> Result<JsonScene> {
    if mesh_data.objects.is_empty() {
        return Err(anyhow!("No mesh objects to export"));
    }

    let mut meshes: Vec<JsonMeshObject> = Vec::with_capacity(mesh_data.objects.len());
    for obj in &mesh_data.objects {
        if let Some(set) = include_objects {
            if !set.is_empty() && !set.contains(&(obj.name.clone(), obj.subindex)) {
                continue;
            }
        }
        let mut positions = get_first_vec3(&obj.positions)
            .ok_or_else(|| anyhow!("Mesh '{}' subindex {} has no positions", obj.name, obj.subindex))?;
        if config.scale_factor != 1.0 {
            for p in &mut positions {
                p[0] *= config.scale_factor;
                p[1] *= config.scale_factor;
                p[2] *= config.scale_factor;
            }
        }
        let normals = obj
            .normals
            .get(0)
            .and_then(|a| vector_data_to_vec3(&a.data).ok());
        let texcoords0 = obj
            .texture_coordinates
            .get(0)
            .and_then(|a| vector_data_to_vec2(&a.data).ok());

        let mut influences: Vec<JsonBoneInfluence> = obj
            .bone_influences
            .iter()
            .map(|bi| JsonBoneInfluence {
                bone_name: bi.bone_name.clone(),
                vertex_weights: bi
                    .vertex_weights
                    .iter()
                    .map(|vw| JsonVertexWeight {
                        vertex_index: vw.vertex_index,
                        vertex_weight: vw.vertex_weight,
                    })
                    .collect(),
            })
            .collect();

        if influences.is_empty() && !obj.parent_bone_name.is_empty() {
            let vertex_count = positions.len() as u32;
            influences.push(JsonBoneInfluence {
                bone_name: obj.parent_bone_name.clone(),
                vertex_weights: (0..vertex_count)
                    .map(|i| JsonVertexWeight { vertex_index: i, vertex_weight: 1.0 })
                    .collect(),
            });
        }

        let export_name = if obj.subindex == 0 {
            obj.name.clone()
        } else {
            format!("{}__sub{}", obj.name, obj.subindex)
        };

        meshes.push(JsonMeshObject {
            name: export_name,
            vertex_indices: obj.vertex_indices.clone(),
            positions,
            normals,
            texcoords0,
            bone_influences: influences,
        });
    }

    if meshes.is_empty() {
        return Err(anyhow!(
            "No mesh objects matched the export filter (check name/subindex selection)"
        ));
    }

    let bones: Vec<JsonBone> = skel
        .map(|s| {
            s.bones
                .iter()
                .map(|b| JsonBone {
                    name: b.name.clone(),
                    transform: b.transform,
                    parent_index: b.parent_index,
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(JsonScene { meshes, bones })
}

/// Export SSBH [MeshData] (and optional skeleton) to a COLLADA (.dae) file.
/// When `include_objects` is `Some` and non-empty, only `(name, subindex)` pairs in the set are written.
pub fn export_ssbh_bundle_to_dae(
    mesh_data: &MeshData,
    skel: Option<&SkelData>,
    output_path: &Path,
    config: &DaeExportConfig,
    include_objects: Option<&HashSet<(String, u64)>>,
) -> Result<ExportDaeStats> {
    let json_scene = build_json_scene_from_ssbh(mesh_data, skel, config, include_objects)?;
    let objects_exported = json_scene.meshes.len();
    let triangles_exported: usize = json_scene
        .meshes
        .iter()
        .map(|m| {
            let n = m.vertex_indices.len();
            if n % 3 == 0 {
                n / 3
            } else {
                0
            }
        })
        .sum();
    // Build DOM
    let mut collada = Element::new("COLLADA");
    collada.attributes.insert("xmlns".to_string(), "http://www.collada.org/2005/11/COLLADASchema".to_string());
    collada.attributes.insert("version".to_string(), "1.4.1".to_string());

    // <asset>
    collada.children.push(XMLNode::Element(build_asset(config)));

    // <library_geometries> built from JSON intermediate
    let mut library_geometries = Element::new("library_geometries");
    for (mesh_index, mesh_object) in json_scene.meshes.iter().enumerate() {
        let geom = build_geometry_element_json(mesh_object, mesh_index)?;
        library_geometries.children.push(XMLNode::Element(geom));
    }
    collada.children.push(XMLNode::Element(library_geometries));

    // <library_controllers> (skinning) built from JSON intermediate
    let mut library_controllers = Element::new("library_controllers");
    if !json_scene.bones.is_empty() {
        let bone_name_to_index: BTreeMap<String, usize> = json_scene
            .bones
            .iter()
            .enumerate()
            .map(|(i, b)| (b.name.clone(), i))
            .collect();

        let inverse_bind_matrices = compute_inverse_bind_matrices_from_json(&json_scene.bones);

        for (mesh_index, mesh_object) in json_scene.meshes.iter().enumerate() {
            if mesh_object.bone_influences.is_empty() {
                continue;
            }

            let controller = build_controller_element_json(
                mesh_object,
                mesh_index,
                &json_scene.bones,
                &bone_name_to_index,
                &inverse_bind_matrices,
            )?;
            library_controllers.children.push(XMLNode::Element(controller));
        }
    }
    collada.children.push(XMLNode::Element(library_controllers));

    // <library_visual_scenes>
    let mut library_visual_scenes = Element::new("library_visual_scenes");
    let mut visual_scene = Element::new("visual_scene");
    visual_scene.attributes.insert("id".to_string(), "Scene".to_string());
    visual_scene.attributes.insert("name".to_string(), "Scene".to_string());

    // Skeleton nodes from JSON intermediate
    if !json_scene.bones.is_empty() {
        let mut children_map: HashMap<Option<usize>, Vec<usize>> = HashMap::new();
        for (i, bone) in json_scene.bones.iter().enumerate() {
            children_map.entry(bone.parent_index).or_default().push(i);
        }

        if let Some(root_children) = children_map.get(&None) {
            for &root_index in root_children {
                let node = build_skeleton_node_recursive_json(&json_scene.bones, root_index, &children_map);
                visual_scene.children.push(XMLNode::Element(node));
            }
        }
    }

    // Mesh instance nodes
    for (mesh_index, mesh_object) in json_scene.meshes.iter().enumerate() {
        let mut mesh_node = Element::new("node");
        mesh_node
            .attributes
            .insert("id".to_string(), format!("mesh_{}", mesh_index));
        mesh_node
            .attributes
            .insert("name".to_string(), mesh_object.name.clone());

        let controller_id = format!("ctrl_{}_{}", mesh_index, sanitize_id(&mesh_object.name));
        let geometry_id = format!("geom_{}_{}", mesh_index, sanitize_id(&mesh_object.name));

        if !mesh_object.bone_influences.is_empty() && !json_scene.bones.is_empty() {
            // Instance controller with skeleton root reference
            let mut inst_ctrl = Element::new("instance_controller");
            inst_ctrl
                .attributes
                .insert("url".to_string(), format!("#{}", controller_id));

            if let Some(root_index) = json_scene.bones.iter().position(|b| b.parent_index.is_none()) {
                let root_id = sanitize_id(&json_scene.bones[root_index].name);
                let mut skeleton_elem = Element::new("skeleton");
                skeleton_elem
                    .children
                    .push(XMLNode::Text(format!("#{}", root_id)));
                inst_ctrl.children.push(XMLNode::Element(skeleton_elem));
            }

            mesh_node.children.push(XMLNode::Element(inst_ctrl));

            // Skinned meshes remain at scene root to avoid double transforms
            visual_scene.children.push(XMLNode::Element(mesh_node));
        } else {
            // Instance geometry (rigid or unskinned)
            let mut inst_geom = Element::new("instance_geometry");
            inst_geom
                .attributes
                .insert("url".to_string(), format!("#{}", geometry_id));
            mesh_node.children.push(XMLNode::Element(inst_geom));

            // For rigid meshes, place at scene root (match GLTF exporter behavior)
            visual_scene.children.push(XMLNode::Element(mesh_node));
        }
    }

    library_visual_scenes.children.push(XMLNode::Element(visual_scene));
    collada.children.push(XMLNode::Element(library_visual_scenes));

    // <scene>
    let mut scene_elem = Element::new("scene");
    let mut inst_vs = Element::new("instance_visual_scene");
    inst_vs
        .attributes
        .insert("url".to_string(), "#Scene".to_string());
    scene_elem.children.push(XMLNode::Element(inst_vs));
    collada.children.push(XMLNode::Element(scene_elem));

    // Write file
    let mut file = std::fs::File::create(output_path)?;
    collada.write(&mut file)?;
    file.flush()?;

    Ok(ExportDaeStats {
        objects_exported,
        triangles_exported,
    })
}

fn build_geometry_element_json(
    mesh_object: &JsonMeshObject,
    mesh_index: usize,
) -> Result<Element> {
    let positions = &mesh_object.positions;
    let normals = mesh_object.normals.as_ref();
    let texcoords = mesh_object.texcoords0.as_ref();
    let indices = &mesh_object.vertex_indices;

    let geom_id = format!("geom_{}_{}", mesh_index, sanitize_id(&mesh_object.name));

    let mut geometry = Element::new("geometry");
    geometry
        .attributes
        .insert("id".to_string(), geom_id.clone());
    geometry
        .attributes
        .insert("name".to_string(), mesh_object.name.clone());

    let mut mesh = Element::new("mesh");

    let pos_source_id = format!("{}-positions", geom_id);
    mesh.children.push(XMLNode::Element(build_source_float_vec3(&pos_source_id, positions)));

    let normal_source_id = format!("{}-normals", geom_id);
    if let Some(norms) = normals {
        mesh.children.push(XMLNode::Element(build_source_float_vec3(&normal_source_id, norms)));
    }

    let texcoord_source_id = format!("{}-texcoord0", geom_id);
    if let Some(uvs) = texcoords {
        mesh.children.push(XMLNode::Element(build_source_float_vec2(&texcoord_source_id, uvs)));
    }

    // <vertices>
    let mut vertices = Element::new("vertices");
    let vertices_id = format!("{}-vertices", geom_id);
    vertices
        .attributes
        .insert("id".to_string(), vertices_id.clone());
    let mut input_pos = Element::new("input");
    input_pos
        .attributes
        .insert("semantic".to_string(), "POSITION".to_string());
    input_pos
        .attributes
        .insert("source".to_string(), format!("#{}", pos_source_id));
    vertices.children.push(XMLNode::Element(input_pos));
    mesh.children.push(XMLNode::Element(vertices));

    // <triangles>
    let input_count = 1
        + if normals.is_some() { 1 } else { 0 }
        + if texcoords.is_some() { 1 } else { 0 };
    let mut triangles = Element::new("triangles");
    triangles
        .attributes
        .insert("count".to_string(), format!("{}", indices.len() / 3));

    let mut in_vtx = Element::new("input");
    in_vtx
        .attributes
        .insert("semantic".to_string(), "VERTEX".to_string());
    in_vtx
        .attributes
        .insert("source".to_string(), format!("#{}", vertices_id));
    in_vtx.attributes.insert("offset".to_string(), "0".to_string());
    triangles.children.push(XMLNode::Element(in_vtx));

    let mut current_offset = 1;
    if normals.is_some() {
        let mut in_n = Element::new("input");
        in_n
            .attributes
            .insert("semantic".to_string(), "NORMAL".to_string());
        in_n
            .attributes
            .insert("source".to_string(), format!("#{}", normal_source_id));
        in_n
            .attributes
            .insert("offset".to_string(), current_offset.to_string());
        triangles.children.push(XMLNode::Element(in_n));
        current_offset += 1;
    }

    if texcoords.is_some() {
        let mut in_t = Element::new("input");
        in_t
            .attributes
            .insert("semantic".to_string(), "TEXCOORD".to_string());
        in_t
            .attributes
            .insert("source".to_string(), format!("#{}", texcoord_source_id));
        in_t
            .attributes
            .insert("offset".to_string(), current_offset.to_string());
        in_t.attributes.insert("set".to_string(), "0".to_string());
        triangles.children.push(XMLNode::Element(in_t));
    }

    // Build <p> with original indices per input stream (no flattening)
    let mut p = Element::new("p");
    let mut values: Vec<String> = Vec::with_capacity(indices.len() * input_count);
    for &idx in indices {
        values.push(idx.to_string());
        if normals.is_some() {
            values.push(idx.to_string());
        }
        if texcoords.is_some() {
            values.push(idx.to_string());
        }
    }
    p.children.push(XMLNode::Text(values.join(" ")));
    triangles.children.push(XMLNode::Element(p));

    mesh.children.push(XMLNode::Element(triangles));
    geometry.children.push(XMLNode::Element(mesh));
    Ok(geometry)
}

fn build_controller_element_json(
    mesh_object: &JsonMeshObject,
    mesh_index: usize,
    bones: &[JsonBone],
    bone_name_to_index: &BTreeMap<String, usize>,
    inverse_bind_matrices: &Vec<[f32; 16]>,
) -> Result<Element> {
    let geom_id = format!("geom_{}_{}", mesh_index, sanitize_id(&mesh_object.name));
    let ctrl_id = format!("ctrl_{}_{}", mesh_index, sanitize_id(&mesh_object.name));

    let mut controller = Element::new("controller");
    controller
        .attributes
        .insert("id".to_string(), ctrl_id.clone());

    let mut skin = Element::new("skin");
    skin
        .attributes
        .insert("source".to_string(), format!("#{}", geom_id));

    // bind_shape_matrix (identity)
    let mut bsm = Element::new("bind_shape_matrix");
    bsm.children.push(XMLNode::Text(matrix_to_string(&[1.0, 0.0, 0.0, 0.0,
                                                       0.0, 1.0, 0.0, 0.0,
                                                       0.0, 0.0, 1.0, 0.0,
                                                       0.0, 0.0, 0.0, 1.0])));
    skin.children.push(XMLNode::Element(bsm));

    // JOINTS source (names). Use bone "sid" strings (original names) to align with node SIDs.
    let joint_names: Vec<String> = bones.iter().map(|b| b.name.clone()).collect();
    let joint_source_id = format!("{}-joints", ctrl_id);
    skin.children.push(XMLNode::Element(build_source_name_array(&joint_source_id, &joint_names)));

    // INV_BIND_MATRIX source
    let bind_pose_source_id = format!("{}-bind_poses", ctrl_id);
    skin.children.push(XMLNode::Element(build_source_mat4_array(&bind_pose_source_id, inverse_bind_matrices)));

    // WEIGHTS source
    let weights_source_id = format!("{}-weights", ctrl_id);

    // Prepare vertex influences (top-4 per vertex, normalized)
    let vertex_count = mesh_object.positions.len();
    let mut vertex_influences: Vec<Vec<(usize, f32)>> = vec![Vec::new(); vertex_count];
    for influence in &mesh_object.bone_influences {
        if let Some(&bone_index) = bone_name_to_index.get(&influence.bone_name) {
            for vw in &influence.vertex_weights {
                let vtx = vw.vertex_index as usize;
                if vtx < vertex_count {
                    vertex_influences[vtx].push((bone_index, vw.vertex_weight));
                }
            }
        }
    }

    // Build vcount and v streams, and collect weights array
    let mut weights: Vec<f32> = Vec::new();
    let mut weight_values: Vec<f32> = Vec::new();
    let mut vcount_values: Vec<usize> = Vec::with_capacity(vertex_count);
    let mut v_values: Vec<i32> = Vec::new();

    for influences in vertex_influences.iter_mut() {
        if influences.is_empty() {
            // Assign to root bone with weight 1.0
            let bone_index = 0usize;
            let w_idx = match weight_values.iter().position(|&v| (v - 1.0).abs() < 1e-6) {
                Some(i) => i,
                None => {
                    weight_values.push(1.0);
                    weights.push(1.0);
                    weights.len() - 1
                }
            };
            vcount_values.push(1);
            v_values.push(bone_index as i32);
            v_values.push(w_idx as i32);
            continue;
        }

        influences.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        influences.truncate(4);
        let sum: f32 = influences.iter().map(|(_, w)| *w).sum();
        let norm = if sum > 0.0 { sum } else { 1.0 };

        vcount_values.push(influences.len());
        for (joint, w) in influences.iter().copied() {
            let w_norm = w / norm;
            let idx = match weight_values.iter().position(|&v| (v - w_norm).abs() < 1e-6) {
                Some(i) => i,
                None => {
                    weight_values.push(w_norm);
                    weights.push(w_norm);
                    weights.len() - 1
                }
            };
            v_values.push(joint as i32);
            v_values.push(idx as i32);
        }
    }

    skin.children.push(XMLNode::Element(build_source_float_array(&weights_source_id, &weights, 1)));

    // <joints>
    let mut joints = Element::new("joints");
    let mut j_in = Element::new("input");
    j_in
        .attributes
        .insert("semantic".to_string(), "JOINT".to_string());
    j_in
        .attributes
        .insert("source".to_string(), format!("#{}", joint_source_id));
    joints.children.push(XMLNode::Element(j_in));
    let mut ibm_in = Element::new("input");
    ibm_in
        .attributes
        .insert("semantic".to_string(), "INV_BIND_MATRIX".to_string());
    ibm_in
        .attributes
        .insert("source".to_string(), format!("#{}", bind_pose_source_id));
    joints.children.push(XMLNode::Element(ibm_in));
    skin.children.push(XMLNode::Element(joints));

    // <vertex_weights>
    let mut vweights = Element::new("vertex_weights");
    vweights
        .attributes
        .insert("count".to_string(), (vertex_count as i32).to_string());

    let mut in_joint = Element::new("input");
    in_joint
        .attributes
        .insert("semantic".to_string(), "JOINT".to_string());
    in_joint
        .attributes
        .insert("source".to_string(), format!("#{}", joint_source_id));
    in_joint
        .attributes
        .insert("offset".to_string(), "0".to_string());
    vweights.children.push(XMLNode::Element(in_joint));

    let mut in_weight = Element::new("input");
    in_weight
        .attributes
        .insert("semantic".to_string(), "WEIGHT".to_string());
    in_weight
        .attributes
        .insert("source".to_string(), format!("#{}", weights_source_id));
    in_weight
        .attributes
        .insert("offset".to_string(), "1".to_string());
    vweights.children.push(XMLNode::Element(in_weight));

    let mut vcount = Element::new("vcount");
    vcount
        .children
        .push(XMLNode::Text(vcount_values.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" ")));
    vweights.children.push(XMLNode::Element(vcount));

    let mut v = Element::new("v");
    v.children.push(XMLNode::Text(v_values.iter().map(|n| n.to_string()).collect::<Vec<_>>().join(" ")));
    vweights.children.push(XMLNode::Element(v));

    skin.children.push(XMLNode::Element(vweights));

    controller.children.push(XMLNode::Element(skin));
    Ok(controller)
}

fn build_skeleton_node_recursive_json(
    bones: &[JsonBone],
    bone_index: usize,
    children_map: &HashMap<Option<usize>, Vec<usize>>,
) -> Element {
    let bone = &bones[bone_index];
    let mut node = Element::new("node");
    let id = sanitize_id(&bone.name);
    node.attributes.insert("id".to_string(), id.clone());
    node.attributes.insert("name".to_string(), bone.name.clone());
    node.attributes.insert("sid".to_string(), bone.name.clone());
    node.attributes.insert("type".to_string(), "JOINT".to_string());

    // Prefer SRT decomposition to ensure DCCs like Maya populate translate/rotate/scale channels.
    let m = glam::Mat4::from_cols_array_2d(&bone.transform);
    let (s, r, t) = m.to_scale_rotation_translation();

    // <translate>
    let mut translate = Element::new("translate");
    translate.children.push(XMLNode::Text(format!(
        "{} {} {}",
        format_float(t.x),
        format_float(t.y),
        format_float(t.z)
    )));
    node.children.push(XMLNode::Element(translate));

    // <rotate> as axis-angle in degrees
    let (axis, angle_rad) = r.to_axis_angle();
    let angle_deg: f32 = angle_rad.to_degrees();
    let mut rotate = Element::new("rotate");
    rotate.children.push(XMLNode::Text(format!(
        "{} {} {} {}",
        format_float(axis.x),
        format_float(axis.y),
        format_float(axis.z),
        format_float(angle_deg)
    )));
    node.children.push(XMLNode::Element(rotate));

    // <scale>
    let mut scale = Element::new("scale");
    scale.children.push(XMLNode::Text(format!(
        "{} {} {}",
        format_float(s.x),
        format_float(s.y),
        format_float(s.z)
    )));
    node.children.push(XMLNode::Element(scale));

    if let Some(children) = children_map.get(&Some(bone_index)) {
        for &child_index in children {
            let child_node = build_skeleton_node_recursive_json(bones, child_index, children_map);
            node.children.push(XMLNode::Element(child_node));
        }
    }

    node
}

fn compute_inverse_bind_matrices_from_json(bones: &[JsonBone]) -> Vec<[f32; 16]> {
    if bones.is_empty() {
        return Vec::new();
    }

    let mut world: Vec<glam::Mat4> = vec![glam::Mat4::IDENTITY; bones.len()];
    let mut calculated = vec![false; bones.len()];

    fn calc(idx: usize, bones: &[JsonBone], world: &mut [glam::Mat4], calculated: &mut [bool]) {
        if calculated[idx] { return; }
        let local = glam::Mat4::from_cols_array_2d(&bones[idx].transform);
        if let Some(parent) = bones[idx].parent_index {
            calc(parent, bones, world, calculated);
            world[idx] = world[parent] * local;
        } else {
            world[idx] = local;
        }
        calculated[idx] = true;
    }

    for i in 0..bones.len() {
        calc(i, bones, &mut world, &mut calculated);
    }

    // COLLADA skin sources are commonly interpreted as row-major float arrays by DCC tools like Maya.
    // Convert each inverse bind matrix to row-major ordering when flattening.
    fn col_major_to_row_major(c: &[f32; 16]) -> [f32; 16] {
        [
            c[0], c[4], c[8],  c[12],
            c[1], c[5], c[9],  c[13],
            c[2], c[6], c[10], c[14],
            c[3], c[7], c[11], c[15],
        ]
    }

    world
        .iter()
        .map(|m| m.inverse().to_cols_array())
        .map(|c| col_major_to_row_major(&c))
        .collect()
}

fn build_asset(config: &DaeExportConfig) -> Element {
    let mut asset = Element::new("asset");

    // Optional: unit / authoring_tool could be added later
    let mut up_axis = Element::new("up_axis");
    up_axis.children.push(XMLNode::Text(match config.up_axis {
        UpAxisConversion::YUp => "Y_UP".to_string(),
        UpAxisConversion::ZUp => "Z_UP".to_string(),
        UpAxisConversion::NoConversion => "Y_UP".to_string(),
    }));
    asset.children.push(XMLNode::Element(up_axis));

    asset
}





fn build_source_float_vec3(id: &str, data: &[[f32; 3]]) -> Element {
    let flat: Vec<f32> = data.iter().flat_map(|v| [v[0], v[1], v[2]]).collect();
    build_source_float_array(id, &flat, 3)
}

fn build_source_float_vec2(id: &str, data: &[[f32; 2]]) -> Element {
    let flat: Vec<f32> = data.iter().flat_map(|v| [v[0], v[1]]).collect();
    build_source_float_array(id, &flat, 2)
}

fn build_source_float_array(
    id: &str,
    flat_data: &Vec<f32>,
    stride: usize,
) -> Element {
    // Note: We cannot encode param generic type directly; build below
    let mut source = Element::new("source");
    source.attributes.insert("id".to_string(), id.to_string());

    let mut float_array = Element::new("float_array");
    float_array
        .attributes
        .insert("id".to_string(), format!("{}-array", id));
    float_array
        .attributes
        .insert("count".to_string(), flat_data.len().to_string());
    float_array
        .children
        .push(XMLNode::Text(flat_data.iter().map(|v| format_float(*v)).collect::<Vec<_>>().join(" ")));
    source.children.push(XMLNode::Element(float_array));

    let mut tech = Element::new("technique_common");
    let mut accessor = Element::new("accessor");
    accessor
        .attributes
        .insert("source".to_string(), format!("#{}-array", id));
    accessor
        .attributes
        .insert("count".to_string(), (flat_data.len() / stride).to_string());
    accessor
        .attributes
        .insert("stride".to_string(), stride.to_string());

    // Params by stride
    match stride {
        2 => {
            let mut p0 = Element::new("param");
            p0.attributes.insert("name".to_string(), "S".to_string());
            p0.attributes.insert("type".to_string(), "float".to_string());
            accessor.children.push(XMLNode::Element(p0));

            let mut p1 = Element::new("param");
            p1.attributes.insert("name".to_string(), "T".to_string());
            p1.attributes.insert("type".to_string(), "float".to_string());
            accessor.children.push(XMLNode::Element(p1));
        }
        3 => {
            let mut p0 = Element::new("param");
            p0.attributes.insert("name".to_string(), "X".to_string());
            p0.attributes.insert("type".to_string(), "float".to_string());
            accessor.children.push(XMLNode::Element(p0));

            let mut p1 = Element::new("param");
            p1.attributes.insert("name".to_string(), "Y".to_string());
            p1.attributes.insert("type".to_string(), "float".to_string());
            accessor.children.push(XMLNode::Element(p1));

            let mut p2 = Element::new("param");
            p2.attributes.insert("name".to_string(), "Z".to_string());
            p2.attributes.insert("type".to_string(), "float".to_string());
            accessor.children.push(XMLNode::Element(p2));
        }
        16 => {
            // Mat4; no names required for each component
        }
        _ => {}
    }

    tech.children.push(XMLNode::Element(accessor));
    source.children.push(XMLNode::Element(tech));
    source
}

fn build_source_name_array(id: &str, names: &[String]) -> Element {
    let mut source = Element::new("source");
    source.attributes.insert("id".to_string(), id.to_string());

    let mut name_array = Element::new("Name_array");
    name_array
        .attributes
        .insert("id".to_string(), format!("{}-array", id));
    name_array
        .attributes
        .insert("count".to_string(), names.len().to_string());
    name_array
        .children
        .push(XMLNode::Text(names.join(" ")));
    source.children.push(XMLNode::Element(name_array));

    let mut tech = Element::new("technique_common");
    let mut accessor = Element::new("accessor");
    accessor
        .attributes
        .insert("source".to_string(), format!("#{}-array", id));
    accessor
        .attributes
        .insert("count".to_string(), names.len().to_string());
    accessor
        .attributes
        .insert("stride".to_string(), "1".to_string());
    let mut param = Element::new("param");
    param.attributes.insert("name".to_string(), "JOINT".to_string());
    param.attributes.insert("type".to_string(), "name".to_string());
    accessor.children.push(XMLNode::Element(param));
    tech.children.push(XMLNode::Element(accessor));
    source.children.push(XMLNode::Element(tech));
    source
}

fn build_source_mat4_array(id: &str, matrices: &[[f32; 16]]) -> Element {
    let mut source = Element::new("source");
    source.attributes.insert("id".to_string(), id.to_string());

    let mut float_array = Element::new("float_array");
    float_array
        .attributes
        .insert("id".to_string(), format!("{}-array", id));
    float_array
        .attributes
        .insert("count".to_string(), (matrices.len() * 16).to_string());
    let mut values: Vec<String> = Vec::with_capacity(matrices.len() * 16);
    for m in matrices {
        values.extend(m.iter().map(|v| format_float(*v)));
    }
    float_array.children.push(XMLNode::Text(values.join(" ")));
    source.children.push(XMLNode::Element(float_array));

    let mut tech = Element::new("technique_common");
    let mut accessor = Element::new("accessor");
    accessor
        .attributes
        .insert("source".to_string(), format!("#{}-array", id));
    accessor
        .attributes
        .insert("count".to_string(), matrices.len().to_string());
    accessor
        .attributes
        .insert("stride".to_string(), "16".to_string());
    tech.children.push(XMLNode::Element(accessor));
    source.children.push(XMLNode::Element(tech));
    source
}

fn get_first_vec3(attrs: &[ssbh_data::mesh_data::AttributeData]) -> Option<Vec<[f32; 3]>> {
    attrs.get(0).and_then(|a| vector_data_to_vec3(&a.data).ok())
}

fn vector_data_to_vec3(data: &VectorData) -> Result<Vec<[f32; 3]>> {
    match data {
        VectorData::Vector3(v) => Ok(v.clone()),
        VectorData::Vector2(v) => Ok(v.iter().map(|x| [x[0], x[1], 0.0]).collect()),
        VectorData::Vector4(v) => Ok(v.iter().map(|x| [x[0], x[1], x[2]]).collect()),
    }
}

fn vector_data_to_vec2(data: &VectorData) -> Result<Vec<[f32; 2]>> {
    match data {
        VectorData::Vector2(v) => Ok(v.clone()),
        VectorData::Vector3(v) => Ok(v.iter().map(|x| [x[0], x[1]]).collect()),
        VectorData::Vector4(v) => Ok(v.iter().map(|x| [x[0], x[1]]).collect()),
    }
}


// Removed unused row/column-major conversion helpers after switching to column-major output.

fn matrix_to_string(m: &[f32; 16]) -> String {
    m.iter().map(|v| format_float(*v)).collect::<Vec<_>>().join(" ")
}

fn format_float(v: f32) -> String {
    // Use shorter representation without losing precision materially
    if v == 0.0 { "0".to_string() } else { format!("{:.6}", v) }
}

fn sanitize_id(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        if ch.is_alphanumeric() || ch == '_' || ch == '-' { out.push(ch); } else { out.push('_'); }
    }
    if out.is_empty() { "id".to_string() } else { out }
}

