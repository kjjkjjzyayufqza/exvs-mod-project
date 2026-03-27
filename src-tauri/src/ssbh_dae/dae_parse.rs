//! DAE parsing and validation (adapted from ssbh_editor). Many fields are populated for forward compatibility.

#![allow(dead_code)]

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use ssbh_data::{
    mesh_data::{BoneInfluence, VertexWeight},
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use xmltree::Element;

pub use super::import_scene::{
    validate_import_scene, ImportBone, ImportBoneInfluence, ImportMaterial, ImportMesh, ImportScene,
    ImportVertexWeight, UpAxisConversion,
};

/// Backward-compatible type aliases for the DAE XML parser.
pub type DaeScene = ImportScene;
pub type DaeMesh = ImportMesh;
pub type DaeBone = ImportBone;
pub type DaeBoneInfluence = ImportBoneInfluence;
pub type DaeVertexWeight = ImportVertexWeight;
pub type DaeMaterial = ImportMaterial;

/// Validates scene before conversion (DAE or other sources).
pub fn validate_dae_scene(scene: &DaeScene) -> Result<()> {
    validate_import_scene(scene)
}

/// Configuration for DAE conversion
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModlEntryConfig {
    pub mesh_object_name: String,
    pub mesh_object_subindex: u64,
    pub material_label: String,
}

#[derive(Debug, Clone)]
pub struct DaeConvertConfig {
    pub output_directory: PathBuf,
    pub base_filename: String,
    pub scale_factor: f32,
    pub up_axis_conversion: UpAxisConversion,
    pub flip_uv: bool,
    /// When non-empty, only geometries whose `name` matches (exact) are converted.
    pub include_geometry_names: Vec<String>,
    pub write_numdlb: bool,
    pub write_numshb: bool,
    pub write_nusktb: bool,
    pub modl_entries: Vec<ModlEntryConfig>,
}

impl Default for DaeConvertConfig {
    fn default() -> Self {
        Self {
            output_directory: PathBuf::new(),
            base_filename: "model".to_string(),
            scale_factor: 1.0,
            up_axis_conversion: UpAxisConversion::YUp,
            flip_uv: false,
            include_geometry_names: Vec::new(),
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            modl_entries: Vec::new(),
        }
    }
}

/// Parse DAE file and extract scene data using xmltree
pub fn parse_dae_file(file_path: &Path) -> Result<ImportScene> {
    let content = std::fs::read_to_string(file_path)
        .map_err(|e| anyhow!("Failed to read DAE file: {}", e))?;
    
    let root = Element::parse(content.as_bytes())
        .map_err(|e| anyhow!("Failed to parse DAE XML: {}", e))?;
    
    let mut scene = ImportScene {
        meshes: Vec::new(),
        materials: Vec::new(),
        bones: Vec::new(),
        up_axis: UpAxisConversion::YUp,
    };
    
    // Extract up axis from asset information
    if let Some(asset) = find_child(&root, "asset") {
        if let Some(up_axis) = find_child(asset, "up_axis") {
            if let Some(text) = get_element_text(up_axis) {
                scene.up_axis = match text.as_str() {
                    "X_UP" => UpAxisConversion::NoConversion,
                    "Y_UP" => UpAxisConversion::YUp,
                    "Z_UP" => UpAxisConversion::ZUp,
                    _ => UpAxisConversion::YUp,
                };
            }
        }
    }
    
    // Parse materials
    if let Some(lib_materials) = find_child(&root, "library_materials") {
        scene.materials = parse_materials_from_xml(lib_materials)?;
    }
    
    // Parse geometries
    let mut geometry_id_to_name_map = std::collections::HashMap::new();
    if let Some(lib_geometries) = find_child(&root, "library_geometries") {
        scene.meshes = parse_geometries_from_xml(lib_geometries, &mut geometry_id_to_name_map)?;
    }
    
    // Parse controllers (bone influences and weights)
    if let Some(lib_controllers) = find_child(&root, "library_controllers") {
        parse_controllers_and_apply_to_meshes(lib_controllers, &mut scene.meshes, &geometry_id_to_name_map)?;
    }
    
    // Parse visual scenes for bone hierarchy
    if let Some(lib_visual_scenes) = find_child(&root, "library_visual_scenes") {
        scene.bones = parse_bone_hierarchy_from_visual_scenes(lib_visual_scenes)?;
    }
    
    // If no bones found in visual scenes, try library_nodes
    if scene.bones.is_empty() {
        if let Some(lib_nodes) = find_child(&root, "library_nodes") {
            scene.bones = parse_bone_hierarchy_from_nodes(lib_nodes)?;
        }
    }
    
    Ok(scene)
}


/// Result of DAE conversion operation
#[derive(Debug, Default)]
pub struct ConvertedFiles {
    pub numdlb_path: Option<PathBuf>,
    pub numshb_path: Option<PathBuf>,
    pub numatb_path: Option<PathBuf>,
    pub nusktb_path: Option<PathBuf>,
}

/// Validate converted SSBH files (only paths that were requested and recorded).
pub fn validate_converted_files(converted_files: &ConvertedFiles) -> Result<()> {
    let paths = [
        &converted_files.numdlb_path,
        &converted_files.numshb_path,
        &converted_files.nusktb_path,
    ];
    let mut any = false;
    for p in paths {
        if let Some(path) = p {
            any = true;
            if !path.exists() {
                return Err(anyhow!("Generated file does not exist: {}", path.display()));
            }
        }
    }
    if !any {
        return Err(anyhow!("No output files were written"));
    }
    Ok(())
}

/// Show the DAE convert configuration dialog

// Helper functions for parsing with xmltree
fn find_child<'a>(element: &'a Element, name: &str) -> Option<&'a Element> {
    element.children.iter().find_map(|node| {
        if let xmltree::XMLNode::Element(child) = node {
            if child.name == name {
                Some(child)
            } else {
                None
            }
        } else {
            None
        }
    })
}

fn get_element_text(element: &Element) -> Option<String> {
    element.children.iter().find_map(|node| {
        if let xmltree::XMLNode::Text(text) = node {
            Some(text.clone())
        } else {
            None
        }
    })
}

fn find_all_children<'a>(element: &'a Element, name: &str) -> Vec<&'a Element> {
    element.children.iter().filter_map(|node| {
        if let xmltree::XMLNode::Element(child) = node {
            if child.name == name {
                Some(child)
            } else {
                None
            }
        } else {
            None
        }
    }).collect()
}

fn parse_materials_from_xml(lib_materials: &Element) -> Result<Vec<DaeMaterial>> {
    let mut materials = Vec::new();
    
    for material_elem in find_all_children(lib_materials, "material") {
        if let Some(id) = material_elem.attributes.get("id") {
            let dae_material = DaeMaterial {
                name: id.clone(),
                diffuse_color: [1.0, 1.0, 1.0, 1.0],
                specular_color: [0.0, 0.0, 0.0, 1.0],
                emission_color: [0.0, 0.0, 0.0, 1.0],
                texture_paths: HashMap::new(),
            };
            materials.push(dae_material);
        }
    }
    
    Ok(materials)
}

fn parse_geometries_from_xml(lib_geometries: &Element, geometry_id_to_name_map: &mut HashMap<String, String>) -> Result<Vec<DaeMesh>> {
    let mut meshes = Vec::new();
    
    for geometry_elem in find_all_children(lib_geometries, "geometry") {
        if let Some(id) = geometry_elem.attributes.get("id") {
            if let Some(mesh_elem) = find_child(geometry_elem, "mesh") {
                // Use 'name' attribute if available, otherwise fall back to 'id'
                let mesh_name = geometry_elem.attributes.get("name")
                    .unwrap_or(id)
                    .clone();
                
                // Store the mapping from geometry id to mesh name
                geometry_id_to_name_map.insert(id.clone(), mesh_name.clone());
                
                let mut dae_mesh = DaeMesh {
                    name: mesh_name,
                    vertices: extract_vertices_from_xml_mesh(mesh_elem)?,
                    normals: extract_normals_from_xml_mesh(mesh_elem)?,
                    uvs: extract_uvs_from_xml_mesh(mesh_elem)?,
                    indices: extract_indices_from_xml_mesh(mesh_elem)?,
                    material_name: None,
                    bone_influences: Vec::new(),
                };
                
                // Post-process to ensure indices and vertex data are consistent
                optimize_mesh_data(&mut dae_mesh);
                
                meshes.push(dae_mesh);
            }
        }
    }
    
    Ok(meshes)
}

/// Parse controllers from DAE and apply bone influences to meshes
fn parse_controllers_and_apply_to_meshes(lib_controllers: &Element, meshes: &mut [DaeMesh], geometry_id_to_name_map: &HashMap<String, String>) -> Result<()> {
    for controller_elem in find_all_children(lib_controllers, "controller") {
        if controller_elem.attributes.get("id").is_some() {
            if let Some(skin_elem) = find_child(controller_elem, "skin") {
                if let Some(source_attr) = skin_elem.attributes.get("source") {
                    let geometry_id = source_attr.trim_start_matches('#');

                    if let Some(mesh_name) = geometry_id_to_name_map.get(geometry_id) {
                        if let Some(mesh) = meshes.iter_mut().find(|m| &m.name == mesh_name) {
                            parse_skin_data_to_mesh(skin_elem, mesh)?;
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

/// Parse skin data from DAE and convert to mesh bone influences
fn parse_skin_data_to_mesh(skin_elem: &Element, mesh: &mut DaeMesh) -> Result<()> {
    // Parse joints source
    let mut joint_names = Vec::new();
    let mut weights = Vec::new();
    
    // Find joints source
    for source_elem in find_all_children(skin_elem, "source") {
        if let Some(source_id) = source_elem.attributes.get("id") {
            if source_id.contains("joints") || source_id.contains("Joint") {
                if let Some(name_array) = find_child(source_elem, "Name_array") {
                    if let Some(names_text) = get_element_text(name_array) {
                        joint_names = names_text.split_whitespace().map(|s| s.to_string()).collect();
                    }
                }
            } else if source_id.contains("weights") || source_id.contains("Weight") {
                if let Some(float_array) = find_child(source_elem, "float_array") {
                    if let Some(weights_text) = get_element_text(float_array) {
                        weights = weights_text
                            .split_whitespace()
                            .filter_map(|s| s.parse::<f32>().ok())
                            .collect();
                    }
                }
            }
        }
    }
    
    if joint_names.is_empty() || weights.is_empty() {
        return Ok(());
    }
    
    // Parse vertex weights
    if let Some(vertex_weights_elem) = find_child(skin_elem, "vertex_weights") {
        if let Some(count_attr) = vertex_weights_elem.attributes.get("count") {
            if let Ok(vertex_count) = count_attr.parse::<usize>() {
                parse_vertex_weights_data(vertex_weights_elem, mesh, &joint_names, &weights, vertex_count)?;
            }
        }
    }
    
    Ok(())
}

/// Parse vertex weights data and convert to bone influences
fn parse_vertex_weights_data(
    vertex_weights_elem: &Element,
    mesh: &mut DaeMesh,
    joint_names: &[String],
    weights: &[f32],
    vertex_count: usize,
) -> Result<()> {
    // Parse vcount (weights per vertex)
    let mut vcounts = Vec::new();
    if let Some(vcount_elem) = find_child(vertex_weights_elem, "vcount") {
        if let Some(vcount_text) = get_element_text(vcount_elem) {
            vcounts = vcount_text
                .split_whitespace()
                .filter_map(|s| s.parse::<usize>().ok())
                .collect();
        }
    }
    
    // Parse v (joint indices and weight indices)
    let mut v_data = Vec::new();
    if let Some(v_elem) = find_child(vertex_weights_elem, "v") {
        if let Some(v_text) = get_element_text(v_elem) {
            v_data = v_text
                .split_whitespace()
                .filter_map(|s| s.parse::<usize>().ok())
                .collect();
        }
    }
    
    if vcounts.len() != vertex_count {
        return Ok(());
    }
    
    // Group weights by bone
    let mut bone_influences: HashMap<String, Vec<DaeVertexWeight>> = HashMap::new();
    
    let mut v_index = 0;
    for (vertex_idx, &weight_count) in vcounts.iter().enumerate() {
        for _ in 0..weight_count {
            if v_index + 1 < v_data.len() {
                let joint_idx = v_data[v_index];
                let weight_idx = v_data[v_index + 1];
                
                if joint_idx < joint_names.len() && weight_idx < weights.len() {
                    let bone_name = &joint_names[joint_idx];
                    let weight = weights[weight_idx];
                    
                    // Only include non-zero weights
                    if weight > 0.0 {
                        bone_influences
                            .entry(bone_name.clone())
                            .or_insert_with(Vec::new)
                            .push(DaeVertexWeight {
                                vertex_index: vertex_idx as u32,
                                weight,
                            });
                    }
                }
                v_index += 2;
            }
        }
    }
    
    // Convert to mesh bone influences
    mesh.bone_influences = bone_influences
        .into_iter()
        .map(|(bone_name, vertex_weights)| DaeBoneInfluence {
            bone_name,
            vertex_weights,
        })
        .collect();
    
    
    Ok(())
}

// Helper functions for extracting specific data from XML mesh structures
fn extract_vertices_from_xml_mesh(mesh_elem: &Element) -> Result<Vec<[f32; 3]>> {
    let mut vertices = Vec::new();
    
    // Find vertices element and position source
    if let Some(vertices_elem) = find_child(mesh_elem, "vertices") {
        if let Some(input_elem) = find_child(vertices_elem, "input") {
            if let Some(semantic) = input_elem.attributes.get("semantic") {
                if semantic == "POSITION" {
                    if let Some(source_ref) = input_elem.attributes.get("source") {
                        let source_id = source_ref.trim_start_matches('#');
                        
                        // Find the corresponding source
                        for source_elem in find_all_children(mesh_elem, "source") {
                            if let Some(id) = source_elem.attributes.get("id") {
                                if id == source_id {
                                    if let Some(float_array_elem) = find_child(source_elem, "float_array") {
                                        if let Some(data_text) = get_element_text(float_array_elem) {
                                            let values: Result<Vec<f32>, _> = data_text
                                                .split_whitespace()
                                                .map(|s| s.parse())
                                                .collect();
                                            
                                            if let Ok(values) = values {
                                                for chunk in values.chunks(3) {
                                                    if chunk.len() >= 3 {
                                                        vertices.push([chunk[0], chunk[1], chunk[2]]);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(vertices)
}

fn extract_normals_from_xml_mesh(mesh_elem: &Element) -> Result<Vec<[f32; 3]>> {
    let mut normals = Vec::new();
    
    // First try to find normal data through triangles/input references
    for triangles_elem in find_all_children(mesh_elem, "triangles") {
        for input_elem in find_all_children(triangles_elem, "input") {
            if let Some(semantic) = input_elem.attributes.get("semantic") {
                if semantic == "NORMAL" {
                    if let Some(source_ref) = input_elem.attributes.get("source") {
                        let source_id = source_ref.trim_start_matches('#');
                        
                        // Find the corresponding source
                        for source_elem in find_all_children(mesh_elem, "source") {
                            if let Some(id) = source_elem.attributes.get("id") {
                                if id == source_id {
                                    if let Some(float_array_elem) = find_child(source_elem, "float_array") {
                                        if let Some(data_text) = get_element_text(float_array_elem) {
                                            let values: Result<Vec<f32>, _> = data_text
                                                .split_whitespace()
                                                .map(|s| s.parse())
                                                .collect();
                                            
                                            if let Ok(values) = values {
                                                for chunk in values.chunks(3) {
                                                    if chunk.len() >= 3 {
                                                        normals.push([chunk[0], chunk[1], chunk[2]]);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
        if !normals.is_empty() {
            break;
        }
    }
    
    // If no normals found through triangles, search for source names containing "Nrm" or "Normal"
    if normals.is_empty() {
        for source_elem in find_all_children(mesh_elem, "source") {
            if let Some(name) = source_elem.attributes.get("name") {
                // Check if source name contains normal indicators
                if name.contains("Nrm") || name.contains("Normal") || name.contains("normal") {
                    if let Some(float_array_elem) = find_child(source_elem, "float_array") {
                        if let Some(data_text) = get_element_text(float_array_elem) {
                            let values: Result<Vec<f32>, _> = data_text
                                .split_whitespace()
                                .map(|s| s.parse())
                                .collect();
                            
                            if let Ok(values) = values {
                                // Check if stride is 3 from technique_common/accessor
                                let mut stride = 3; // Default to 3 for normals
                                if let Some(technique_elem) = find_child(source_elem, "technique_common") {
                                    if let Some(accessor_elem) = find_child(technique_elem, "accessor") {
                                        if let Some(stride_attr) = accessor_elem.attributes.get("stride") {
                                            if let Ok(parsed_stride) = stride_attr.parse::<usize>() {
                                                stride = parsed_stride;
                                            }
                                        }
                                    }
                                }
                                
                                if stride == 3 {
                                    for chunk in values.chunks(3) {
                                        if chunk.len() >= 3 {
                                            normals.push([chunk[0], chunk[1], chunk[2]]);
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(normals)
}

fn extract_uvs_from_xml_mesh(mesh_elem: &Element) -> Result<Vec<[f32; 2]>> {
    let mut uvs = Vec::new();
    
    // First try to find UV data through triangles/input references
    for triangles_elem in find_all_children(mesh_elem, "triangles") {
        for input_elem in find_all_children(triangles_elem, "input") {
            if let Some(semantic) = input_elem.attributes.get("semantic") {
                if semantic == "TEXCOORD" {
                    if let Some(source_ref) = input_elem.attributes.get("source") {
                        let source_id = source_ref.trim_start_matches('#');
                        
                        // Find the corresponding source
                        for source_elem in find_all_children(mesh_elem, "source") {
                            if let Some(id) = source_elem.attributes.get("id") {
                                if id == source_id {
                                    if let Some(float_array_elem) = find_child(source_elem, "float_array") {
                                        if let Some(data_text) = get_element_text(float_array_elem) {
                                            let values: Result<Vec<f32>, _> = data_text
                                                .split_whitespace()
                                                .map(|s| s.parse())
                                                .collect();
                                            
                                            if let Ok(values) = values {
                                                for chunk in values.chunks(2) {
                                                    if chunk.len() >= 2 {
                                                        uvs.push([chunk[0], chunk[1]]);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
        if !uvs.is_empty() {
            break;
        }
    }
    
    // If no UVs found through triangles, search for source names containing "UV" or "TexCoord"
    if uvs.is_empty() {
        for source_elem in find_all_children(mesh_elem, "source") {
            if let Some(name) = source_elem.attributes.get("name") {
                // Check if source name contains UV indicators
                if name.contains("UV") || name.contains("TexCoord") || name.contains("TextureCoordinate") || name.contains("uv") {
                    if let Some(float_array_elem) = find_child(source_elem, "float_array") {
                        if let Some(data_text) = get_element_text(float_array_elem) {
                            let values: Result<Vec<f32>, _> = data_text
                                .split_whitespace()
                                .map(|s| s.parse())
                                .collect();
                            
                            if let Ok(values) = values {
                                // Check if stride is 2 from technique_common/accessor
                                let mut stride = 2; // Default to 2 for UVs
                                if let Some(technique_elem) = find_child(source_elem, "technique_common") {
                                    if let Some(accessor_elem) = find_child(technique_elem, "accessor") {
                                        if let Some(stride_attr) = accessor_elem.attributes.get("stride") {
                                            if let Ok(parsed_stride) = stride_attr.parse::<usize>() {
                                                stride = parsed_stride;
                                            }
                                        }
                                    }
                                }
                                
                                if stride == 2 {
                                    for chunk in values.chunks(2) {
                                        if chunk.len() >= 2 {
                                            uvs.push([chunk[0], chunk[1]]);
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(uvs)
}

fn extract_indices_from_xml_mesh(mesh_elem: &Element) -> Result<Vec<u32>> {
    let mut indices = Vec::new();
    
    for triangles_elem in find_all_children(mesh_elem, "triangles") {
        // Get the stride (number of indices per vertex)
        let input_elements = find_all_children(triangles_elem, "input");
        let stride = input_elements.len();
        
        // Find the position input offset
        let mut position_offset = 0;
        for input_elem in &input_elements {
            if let Some(semantic) = input_elem.attributes.get("semantic") {
                if semantic == "VERTEX" || semantic == "POSITION" {
                    if let Some(offset_str) = input_elem.attributes.get("offset") {
                        position_offset = offset_str.parse().unwrap_or(0);
                    }
                    break;
                }
            }
        }
        
        if let Some(p_elem) = find_child(triangles_elem, "p") {
            if let Some(data_text) = get_element_text(p_elem) {
                let values: Result<Vec<u32>, _> = data_text
                    .split_whitespace()
                    .map(|s| s.parse())
                    .collect();
                
                if let Ok(values) = values {
                    if stride > 0 {
                        // Extract only the position indices using the correct offset and stride
                        for i in (position_offset..values.len()).step_by(stride) {
                            indices.push(values[i]);
                        }
                    } else {
                        // Fallback: if no stride detected, assume simple vertex indices
                        indices.extend(values);
                    }
                }
            }
        }
    }
    
    Ok(indices)
}

/// Optimize mesh data to ensure indices and vertex data are consistent
fn optimize_mesh_data(mesh: &mut DaeMesh) {
    if mesh.indices.is_empty() || mesh.vertices.is_empty() {
        return;
    }
    
    
    // First, ensure all attribute data has consistent length with vertices
    align_attribute_data(mesh);
    
    // Find the maximum index used
    let max_index = mesh.indices.iter().max().copied().unwrap_or(0);
    let vertex_count = mesh.vertices.len() as u32;
    
    // If indices are within bounds and data is consistent, no further optimization needed
    if max_index < vertex_count {
        return;
    }
    
    
    // Create a mapping of used indices to compact vertex data
    let mut used_indices: Vec<u32> = mesh.indices.iter().cloned().collect();
    used_indices.sort();
    used_indices.dedup();
    
    // Filter to only include valid indices
    used_indices.retain(|&idx| (idx as usize) < mesh.vertices.len());
    
    if used_indices.is_empty() {
        mesh.indices.clear();
        return;
    }
    
    // Create new vertex data using only referenced vertices
    let mut new_vertices = Vec::new();
    let mut new_normals = Vec::new();
    let mut new_uvs = Vec::new();
    let mut index_map = std::collections::HashMap::new();
    
    for (new_idx, &old_idx) in used_indices.iter().enumerate() {
        let old_idx_usize = old_idx as usize;
        if old_idx_usize < mesh.vertices.len() {
            new_vertices.push(mesh.vertices[old_idx_usize]);
            index_map.insert(old_idx, new_idx as u32);
            
            // Copy normals if available (should be same length as vertices now)
            if old_idx_usize < mesh.normals.len() {
                new_normals.push(mesh.normals[old_idx_usize]);
            }
            
            // Copy UVs if available (should be same length as vertices now)
            if old_idx_usize < mesh.uvs.len() {
                new_uvs.push(mesh.uvs[old_idx_usize]);
            }
        }
    }
    
    // Remap indices
    let mut new_indices = Vec::new();
    for &old_index in &mesh.indices {
        if let Some(&new_index) = index_map.get(&old_index) {
            new_indices.push(new_index);
        } else {
        }
    }
    
    // Ensure we have triangles (index count divisible by 3)
    let remainder = new_indices.len() % 3;
    if remainder != 0 {
        new_indices.truncate(new_indices.len() - remainder);
    }
    
    // Update mesh data
    mesh.vertices = new_vertices;
    mesh.normals = new_normals;
    mesh.uvs = new_uvs;
    mesh.indices = new_indices;
    
}

/// Align attribute data to ensure all arrays have the same length as vertices
fn align_attribute_data(mesh: &mut DaeMesh) {
    let vertex_count = mesh.vertices.len();
    
    if vertex_count == 0 {
        mesh.normals.clear();
        mesh.uvs.clear();
        return;
    }
    
    // Align normals
    if !mesh.normals.is_empty() {
        if mesh.normals.len() < vertex_count {
            // Pad with default normals (pointing up)
            mesh.normals.resize(vertex_count, [0.0, 1.0, 0.0]);
        } else if mesh.normals.len() > vertex_count {
            mesh.normals.truncate(vertex_count);
        }
    }
    
    // Align UVs
    if !mesh.uvs.is_empty() {
        if mesh.uvs.len() < vertex_count {
            // Pad with default UVs
            mesh.uvs.resize(vertex_count, [0.0, 0.0]);
        } else if mesh.uvs.len() > vertex_count {
            mesh.uvs.truncate(vertex_count);
        }
    }
    
}




/// Convert DAE bone influences to SSBH bone influences
pub fn convert_dae_bone_influences_to_ssbh(dae_influences: &[DaeBoneInfluence]) -> Vec<BoneInfluence> {
    let mut ssbh_influences = Vec::new();
    
    for dae_influence in dae_influences {
        let vertex_weights: Vec<VertexWeight> = dae_influence
            .vertex_weights
            .iter()
            .map(|dae_weight| VertexWeight {
                vertex_index: dae_weight.vertex_index,
                vertex_weight: dae_weight.weight,
            })
            .collect();
        
        if !vertex_weights.is_empty() {
            ssbh_influences.push(BoneInfluence {
                bone_name: dae_influence.bone_name.clone(),
                vertex_weights,
            });
        }
    }
    
    ssbh_influences
}

// Helper functions for coordinate and data transformations
pub fn apply_transforms(vertices: &[[f32; 3]], config: &DaeConvertConfig) -> Vec<[f32; 3]> {
    vertices.iter().map(|v| {
        let mut transformed = *v;
        
        // Apply scale factor
        transformed[0] *= config.scale_factor;
        transformed[1] *= config.scale_factor;
        transformed[2] *= config.scale_factor;
        
        // Apply coordinate system conversion
        match config.up_axis_conversion {
            UpAxisConversion::ZUp => {
                // Convert Z-up to Y-up: swap Y and Z, negate new Z
                let temp = transformed[1];
                transformed[1] = transformed[2];
                transformed[2] = -temp;
            },
            UpAxisConversion::YUp | UpAxisConversion::NoConversion => {
                // No conversion needed
            },
        }
        
        transformed
    }).collect()
}

pub fn apply_normal_transforms(normals: &[[f32; 3]], config: &DaeConvertConfig) -> Vec<[f32; 3]> {
    normals.iter().map(|n| {
        let mut transformed = *n;
        
        // Apply coordinate system conversion (no scaling for normals)
        match config.up_axis_conversion {
            UpAxisConversion::ZUp => {
                let temp = transformed[1];
                transformed[1] = transformed[2];
                transformed[2] = -temp;
            },
            UpAxisConversion::YUp | UpAxisConversion::NoConversion => {},
        }
        
        transformed
    }).collect()
}

/// Parse bone hierarchy from library_visual_scenes
fn parse_bone_hierarchy_from_visual_scenes(lib_visual_scenes: &Element) -> Result<Vec<DaeBone>> {
    let mut bones = Vec::new();
    
    for visual_scene in find_all_children(lib_visual_scenes, "visual_scene") {
        for node in find_all_children(visual_scene, "node") {
            parse_node_hierarchy(node, None, &mut bones)?;
        }
    }
    
    Ok(bones)
}

/// Parse bone hierarchy from library_nodes
fn parse_bone_hierarchy_from_nodes(lib_nodes: &Element) -> Result<Vec<DaeBone>> {
    let mut bones = Vec::new();

    for node in find_all_children(lib_nodes, "node") {
        parse_node_hierarchy(node, None, &mut bones)?;
    }

    Ok(bones)
}

/// Recursively parse node hierarchy to extract bone information
fn parse_node_hierarchy(
    node: &Element,
    parent_index: Option<usize>,
    bones: &mut Vec<DaeBone>,
) -> Result<()> {
    if let Some(node_id) = node.attributes.get("id") {
        // Check if this is a bone/joint node
        let node_type = node.attributes.get("type").map(|s| s.as_str()).unwrap_or("");
        let node_name = node.attributes.get("name").unwrap_or(node_id);
        let node_sid = node.attributes.get("sid").map(|s| s.as_str()).unwrap_or("");
        
        let is_bone = node_type == "JOINT" || 
                     node_id.to_lowercase().contains("bone") || 
                     node_id.to_lowercase().contains("joint") ||
                     node_name.to_lowercase().contains("bone") ||
                     node_name.to_lowercase().contains("joint") ||
                     node_sid.to_lowercase().contains("bone") ||
                     node_sid.to_lowercase().contains("joint");
        
        if is_bone || parent_index.is_some() {
            // Use 'name' attribute if available, otherwise fall back to 'id'
            let bone_name = node.attributes.get("name")
                .or_else(|| node.attributes.get("sid"))
                .unwrap_or(node_id)
                .clone();
            
            // Parse transformation matrix
            let transform = parse_node_transform(node);
            
            let bone = DaeBone {
                name: bone_name.clone(),
                parent_index,
                transform,
                inverse_bind_matrix: None,
            };
            
            let current_index = bones.len();
            bones.push(bone);
            
            // Recursively parse child nodes
            for child_node in find_all_children(node, "node") {
                parse_node_hierarchy(child_node, Some(current_index), bones)?;
            }
        } else {
            // Not a bone, but check children anyway
            for child_node in find_all_children(node, "node") {
                parse_node_hierarchy(child_node, parent_index, bones)?;
            }
        }
    }
    
    Ok(())
}

/// Parse transformation matrix from a node
fn parse_node_transform(node: &Element) -> [[f32; 4]; 4] {
    // Look for matrix element first
    if let Some(matrix_elem) = find_child(node, "matrix") {
        if let Some(matrix_text) = get_element_text(matrix_elem) {
            if let Ok(values) = parse_matrix_values(&matrix_text) {
                if values.len() >= 16 {
                    // Convert from row-major (DAE format) to column-major (target format)
                    // DAE stores matrices in row-major order: [m00, m01, m02, m03, m10, m11, m12, m13, ...]
                    // Target format expects column-major order: [[col0], [col1], [col2], [col3]]
                    return [
                        [values[0], values[4], values[8], values[12]],   // Column 0
                        [values[1], values[5], values[9], values[13]],   // Column 1
                        [values[2], values[6], values[10], values[14]],  // Column 2
                        [values[3], values[7], values[11], values[15]],  // Column 3
                    ];
                }
            }
        }
    }
    
    // If no matrix, try to build from translate, rotate, scale
    let mut transform = [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ];
    
    // Apply translation (using column-major format)
    if let Some(translate_elem) = find_child(node, "translate") {
        if let Some(translate_text) = get_element_text(translate_elem) {
            if let Ok(values) = parse_matrix_values(&translate_text) {
                if values.len() >= 3 {
                    // Store translation in the last column (column-major format)
                    transform[3][0] = values[0];  // X translation
                    transform[3][1] = values[1];  // Y translation
                    transform[3][2] = values[2];  // Z translation
                }
            }
        }
    }
    
    // Note: For full accuracy, we should also handle rotation and scale,
    // but identity matrix is sufficient for basic skeleton structure
    
    transform
}

/// Parse matrix values from text
fn parse_matrix_values(text: &str) -> Result<Vec<f32>> {
    text.split_whitespace()
        .map(|s| s.parse::<f32>().map_err(|e| anyhow!("Failed to parse float: {}", e)))
        .collect()
}


