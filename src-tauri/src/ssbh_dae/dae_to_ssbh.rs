use anyhow::{anyhow, Result};
use serde::Serialize;
use ssbh_data::mesh_data::{AttributeData, MeshData, MeshObjectData, VectorData};
use ssbh_data::modl_data::{ModlData, ModlEntryData};
use ssbh_data::skel_data::{BillboardType, BoneData, SkelData};
use std::collections::HashSet;
use std::path::Path;

use super::dae_parse::{
    apply_normal_transforms, apply_transforms, convert_dae_bone_influences_to_ssbh, parse_dae_file,
    validate_converted_files, validate_dae_scene, ConvertedFiles, DaeBone, DaeConvertConfig, DaeMesh,
    DaeScene,
};

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SsbhConvertStats {
    pub mesh_objects: usize,
    pub total_vertices: usize,
    pub total_triangle_indices: usize,
    pub bones: usize,
}

fn compute_convert_stats(mesh: &MeshData, bone_count: usize) -> SsbhConvertStats {
    let total_vertices: usize = mesh
        .objects
        .iter()
        .map(|o| o.positions.first().map(|a| a.data.len()).unwrap_or(0))
        .sum();
    let total_triangle_indices: usize = mesh.objects.iter().map(|o| o.vertex_indices.len()).sum();
    SsbhConvertStats {
        mesh_objects: mesh.objects.len(),
        total_vertices,
        total_triangle_indices,
        bones: bone_count,
    }
}

/// Convert DAE scene to SSBH files using ssbh_data write paths.
pub fn convert_dae_to_ssbh_files(
    dae_scene: &DaeScene,
    config: &DaeConvertConfig,
) -> Result<(ConvertedFiles, SsbhConvertStats)> {
    let mut converted_files = ConvertedFiles::default();

    if !config.write_numdlb && !config.write_numshb && !config.write_nusktb {
        return Err(anyhow!("Select at least one SSBH output (.numdlb / .numshb / .nusktb)"));
    }
    if config.write_numdlb && (!config.write_numshb || !config.write_nusktb) {
        return Err(anyhow!(
            "Writing .numdlb requires both .numshb and .nusktb in this pipeline (modl references both)"
        ));
    }

    ensure_unique_geometry_names_for_vs2(&dae_scene.meshes)?;

    let skel_data = convert_skeleton_from_dae(&dae_scene.bones, &dae_scene.meshes, config)?;
    let mesh_data = convert_meshes_to_ssbh(&dae_scene.meshes, config)?;
    let stats = compute_convert_stats(&mesh_data, skel_data.bones.len());
    let modl_data = convert_model_to_ssbh(&dae_scene.meshes, config)?;

    if config.write_nusktb {
        let skel_path = config
            .output_directory
            .join(format!("{}.nusktb", config.base_filename));
        skel_data
            .write_to_file(&skel_path)
            .map_err(|e| anyhow!("Failed to write skeleton: {}", e))?;
        converted_files.nusktb_path = Some(skel_path);
    }

    if config.write_numshb {
        let mesh_path = config
            .output_directory
            .join(format!("{}.numshb", config.base_filename));
        mesh_data
            .write_to_file(&mesh_path)
            .map_err(|e| anyhow!("Failed to write mesh: {}", e))?;
        converted_files.numshb_path = Some(mesh_path);
    }

    if config.write_numdlb {
        let modl_path = config
            .output_directory
            .join(format!("{}.numdlb", config.base_filename));
        modl_data
            .write_to_file(&modl_path)
            .map_err(|e| anyhow!("Failed to write model: {}", e))?;
        converted_files.numdlb_path = Some(modl_path);
    }

    Ok((converted_files, stats))
}

/// Convert a DAE file to `.numdlb`, `.numshb`, and `.nusktb` in `config.output_directory`.
pub fn convert_dae_file(
    dae_file_path: &Path,
    config: &DaeConvertConfig,
) -> Result<(ConvertedFiles, SsbhConvertStats)> {
    let mut dae_scene = parse_dae_file(dae_file_path)?;
    if !config.include_geometry_names.is_empty() {
        let allowed: HashSet<String> = config.include_geometry_names.iter().cloned().collect();
        dae_scene.meshes.retain(|m| !m.vertices.is_empty() && allowed.contains(&m.name));
        if dae_scene.meshes.is_empty() {
            return Err(anyhow!(
                "include_geometry_names left no geometries (check exact COLLADA geometry names)"
            ));
        }
    }
    validate_dae_scene(&dae_scene)?;
    let (converted_files, stats) = convert_dae_to_ssbh_files(&dae_scene, config)?;
    validate_converted_files(&converted_files)?;
    Ok((converted_files, stats))
}

/// VS2 mesh write path stores `subindex` 0 on disk for every object; modl entries must use 0 as well.
/// Distinct objects therefore require unique geometry names in the DAE.
fn ensure_unique_geometry_names_for_vs2(meshes: &[DaeMesh]) -> Result<()> {
    let mut seen = HashSet::new();
    for m in meshes {
        if m.vertices.is_empty() {
            continue;
        }
        if !seen.insert(m.name.clone()) {
            return Err(anyhow!(
                "Duplicate geometry name '{}' in DAE: VS2 export requires unique names (mesh subindex is always 0 on disk)",
                m.name
            ));
        }
    }
    Ok(())
}

fn convert_meshes_to_ssbh(meshes: &[DaeMesh], config: &DaeConvertConfig) -> Result<MeshData> {
    let mut mesh_objects = Vec::new();

    for dae_mesh in meshes {
        if dae_mesh.vertices.is_empty() {
            continue;
        }

        let vertices = apply_transforms(&dae_mesh.vertices, config);
        let vertex_count = vertices.len();

        let normals = if !dae_mesh.normals.is_empty() {
            let transformed_normals = apply_normal_transforms(&dae_mesh.normals, config);
            if transformed_normals.len() != vertex_count {
                return Err(anyhow!(
                    "Mesh '{}': normal count {} does not match vertex count {} after transform",
                    dae_mesh.name,
                    transformed_normals.len(),
                    vertex_count
                ));
            }
            transformed_normals
        } else {
            generate_vertex_based_normals(&vertices)
        };

        let mut uvs = if !dae_mesh.uvs.is_empty() {
            if dae_mesh.uvs.len() != vertex_count {
                return Err(anyhow!(
                    "Mesh '{}': UV count {} does not match vertex count {}",
                    dae_mesh.name,
                    dae_mesh.uvs.len(),
                    vertex_count
                ));
            }
            dae_mesh.uvs.clone()
        } else {
            generate_default_uvs(vertex_count)
        };

        if config.flip_uv {
            for uv in &mut uvs {
                uv[1] = 1.0 - uv[1];
            }
        }

        let (binormals, tangents) = generate_binormals_and_tangents(&vertices, &normals);
        let bone_influences = convert_dae_bone_influences_to_ssbh(&dae_mesh.bone_influences);

        let mesh_object = MeshObjectData {
            name: dae_mesh.name.clone(),
            subindex: 0,
            positions: vec![AttributeData {
                name: String::new(),
                data: VectorData::Vector3(vertices),
            }],
            normals: vec![AttributeData {
                name: String::new(),
                data: VectorData::Vector3(normals),
            }],
            binormals: vec![
                AttributeData {
                    name: String::new(),
                    data: VectorData::Vector3(binormals.clone()),
                },
                AttributeData {
                    name: String::new(),
                    data: VectorData::Vector3(binormals),
                },
            ],
            tangents: vec![
                AttributeData {
                    name: String::new(),
                    data: VectorData::Vector3(tangents.clone()),
                },
                AttributeData {
                    name: String::new(),
                    data: VectorData::Vector3(tangents),
                },
            ],
            texture_coordinates: vec![
                AttributeData {
                    name: String::new(),
                    data: VectorData::Vector2(uvs),
                },
                AttributeData {
                    name: "HalfFloat2_0".to_string(),
                    data: VectorData::Vector4(generate_half_float2_data(vertex_count)),
                },
            ],
            color_sets: vec![
                AttributeData {
                    name: "colorSet0".to_string(),
                    data: VectorData::Vector2(generate_default_colorset0_data(vertex_count)),
                },
                AttributeData {
                    name: "colorSet1".to_string(),
                    data: VectorData::Vector2(generate_default_colorset1_data(vertex_count)),
                },
            ],
            vertex_indices: dae_mesh.indices.clone(),
            bone_influences,
            ..Default::default()
        };

        mesh_objects.push(mesh_object);
    }

    if mesh_objects.is_empty() {
        return Err(anyhow!("No valid mesh objects were created from DAE data"));
    }

    Ok(MeshData {
        major_version: 1,
        minor_version: 8,
        objects: mesh_objects,
        is_vs2: true,
    })
}

fn convert_model_to_ssbh(meshes: &[DaeMesh], config: &DaeConvertConfig) -> Result<ModlData> {
    let mut entries = Vec::new();

    for mesh in meshes {
        if mesh.vertices.is_empty() {
            continue;
        }
        entries.push(ModlEntryData {
            mesh_object_name: mesh.name.clone(),
            mesh_object_subindex: 0,
            material_label: "DefaultMaterial".to_string(),
        });
    }

    Ok(ModlData {
        major_version: 1,
        minor_version: 0,
        model_name: config.base_filename.clone(),
        skeleton_file_name: format!("{}.nusktb", config.base_filename),
        material_file_names: vec![format!("{}.numatb", config.base_filename)],
        animation_file_name: None,
        mesh_file_name: format!("{}.numshb", config.base_filename),
        entries,
    })
}

fn convert_skeleton_from_dae(
    dae_bones: &[DaeBone],
    meshes: &[DaeMesh],
    _config: &DaeConvertConfig,
) -> Result<SkelData> {
    let mut bones = Vec::new();

    if !dae_bones.is_empty() {
        for dae_bone in dae_bones {
            bones.push(BoneData {
                name: dae_bone.name.clone(),
                transform: dae_bone.transform,
                parent_index: dae_bone.parent_index,
                billboard_type: BillboardType::Disabled,
            });
        }
    } else {
        let mut bone_names = HashSet::new();
        for mesh in meshes {
            for bone_influence in &mesh.bone_influences {
                bone_names.insert(bone_influence.bone_name.clone());
            }
        }
        let mut bone_names: Vec<String> = bone_names.into_iter().collect();
        bone_names.sort();

        for (index, bone_name) in bone_names.iter().enumerate() {
            bones.push(BoneData {
                name: bone_name.clone(),
                transform: [
                    [1.0, 0.0, 0.0, 0.0],
                    [0.0, 1.0, 0.0, 0.0],
                    [0.0, 0.0, 1.0, 0.0],
                    [0.0, 0.0, 0.0, 1.0],
                ],
                parent_index: if index == 0 { None } else { Some(index - 1) },
                billboard_type: BillboardType::Disabled,
            });
        }
    }

    Ok(SkelData {
        major_version: 1,
        minor_version: 0,
        bones,
    })
}

fn generate_vertex_based_normals(vertices: &[[f32; 3]]) -> Vec<[f32; 3]> {
    vertices
        .iter()
        .map(|vertex| [vertex[0] * 1e-8, 0.0, -1.0])
        .collect()
}

fn generate_default_uvs(vertex_count: usize) -> Vec<[f32; 2]> {
    vec![[0.0, 0.0]; vertex_count]
}

fn generate_binormals_and_tangents(
    vertices: &[[f32; 3]],
    normals: &[[f32; 3]],
) -> (Vec<[f32; 3]>, Vec<[f32; 3]>) {
    let mut binormals = Vec::with_capacity(vertices.len());
    let mut tangents = Vec::with_capacity(vertices.len());

    for (vertex, normal) in vertices.iter().zip(normals.iter()) {
        let binormal = [
            -vertex[0] * 0.12 + normal[1] * 0.3,
            vertex[1] * 0.08 + normal[0] * 0.5,
            -vertex[2] * 0.001 + normal[2] * 0.1,
        ];
        binormals.push(normalize_vector(binormal));
        tangents.push(*vertex);
    }

    (binormals, tangents)
}

fn normalize_vector(v: [f32; 3]) -> [f32; 3] {
    let length = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if length > 0.0001 {
        [v[0] / length, v[1] / length, v[2] / length]
    } else {
        [1.0, 0.0, 0.0]
    }
}

fn generate_half_float2_data(vertex_count: usize) -> Vec<[f32; 4]> {
    vec![[1.0, 1.0, 1.0, 1.0]; vertex_count]
}

fn generate_default_colorset0_data(vertex_count: usize) -> Vec<[f32; 2]> {
    vec![[0.0, 0.0]; vertex_count]
}

fn generate_default_colorset1_data(vertex_count: usize) -> Vec<[f32; 2]> {
    vec![[0.0, 0.0]; vertex_count]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn convert_dae_file_rejects_missing_input() {
        let cfg = DaeConvertConfig {
            output_directory: std::env::temp_dir(),
            base_filename: "test_model".to_string(),
            scale_factor: 1.0,
            up_axis_conversion: crate::ssbh_dae::UpAxisConversion::YUp,
            flip_uv: false,
            include_geometry_names: Vec::new(),
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
        };
        let p = Path::new("__ssbh_dae_missing_test_file__.dae");
        assert!(convert_dae_file(p, &cfg).is_err());
    }
}
