use anyhow::{anyhow, Result};
use glam::{Mat4, Vec2, Vec3, Vec4};
use serde::Serialize;
use ssbh_data::mesh_data::{AttributeData, MeshData, MeshObjectData, VectorData};
use ssbh_data::modl_data::{ModlData, ModlEntryData};
use ssbh_data::skel_data::{BillboardType, BoneData, SkelData};
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;

use super::dae_parse::{
    apply_normal_transforms, apply_transforms, convert_dae_bone_influences_to_ssbh, parse_dae_file,
    scale_bone_transform_translation, validate_converted_files, validate_dae_scene, ConvertedFiles,
    DaeBone, DaeConvertConfig, DaeMesh, DaeScene,
};
use super::import_scene::ImportScene;

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

/// Convert a neutral import scene (from DAE, FBX, etc.) to SSBH files.
pub fn convert_import_scene_to_ssbh_files(
    scene: &ImportScene,
    config: &DaeConvertConfig,
) -> Result<(ConvertedFiles, SsbhConvertStats)> {
    eprintln!(
        "[dae_to_ssbh] converting scene: {} meshes, {} bones, base_filename={}",
        scene.meshes.len(),
        scene.bones.len(),
        config.base_filename
    );
    let mut converted_files = ConvertedFiles::default();

    if !config.write_numdlb && !config.write_numshb && !config.write_nusktb {
        eprintln!("[dae_to_ssbh] no output format selected");
        return Err(anyhow!(
            "Select at least one SSBH output (.numdlb / .numshb / .nusktb)"
        ));
    }
    if config.write_numdlb && (!config.write_numshb || !config.write_nusktb) {
        eprintln!("[dae_to_ssbh] numdlb requires numshb + nusktb");
        return Err(anyhow!(
            "Writing .numdlb requires both .numshb and .nusktb in this pipeline (modl references both)"
        ));
    }

    let prepared_meshes = prepare_meshes_for_vs2(&scene.meshes)?;

    eprintln!("[dae_to_ssbh] checking unique geometry names...");
    ensure_unique_geometry_names_for_vs2(&prepared_meshes)?;

    eprintln!("[dae_to_ssbh] converting skeleton...");
    let skel_data = convert_skeleton_from_dae(&scene.bones, &scene.meshes, config)?;
    eprintln!("[dae_to_ssbh] skeleton: {} bones", skel_data.bones.len());

    eprintln!("[dae_to_ssbh] converting meshes...");
    let mesh_data = convert_prepared_meshes_to_ssbh(&prepared_meshes, config)?;
    let stats = compute_convert_stats(&mesh_data, skel_data.bones.len());
    eprintln!(
        "[dae_to_ssbh] mesh stats: {} objects, {} vertices, {} triangle_indices",
        stats.mesh_objects, stats.total_vertices, stats.total_triangle_indices
    );

    eprintln!("[dae_to_ssbh] converting model entries...");
    let modl_data = convert_prepared_model_to_ssbh(&prepared_meshes, config)?;
    eprintln!("[dae_to_ssbh] modl entries: {}", modl_data.entries.len());

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
        // Mesh export MUST use write_to_file (legacy / MeshWriteProfile::LegacyCompatible).
        // Do NOT switch to write_to_file_with_profile(MeshWriteProfile::Vs2Canonical):
        // real FBX/DAE conversions showed skin stretching and missing mesh objects
        // even though the canonical profile only omits the all-zero dummy vertex buffer 2.
        // See docs/agent-sessions/ssbh-model-optimization/ for the original Vs2Canonical plan.
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

/// Convert DAE-backed scene to SSBH (alias for `convert_import_scene_to_ssbh_files`).
pub fn convert_dae_to_ssbh_files(
    dae_scene: &DaeScene,
    config: &DaeConvertConfig,
) -> Result<(ConvertedFiles, SsbhConvertStats)> {
    convert_import_scene_to_ssbh_files(dae_scene, config)
}

/// Convert a DAE file to `.numdlb`, `.numshb`, and `.nusktb` in `config.output_directory`.
pub fn convert_dae_file(
    dae_file_path: &Path,
    config: &DaeConvertConfig,
) -> Result<(ConvertedFiles, SsbhConvertStats)> {
    eprintln!(
        "[dae_to_ssbh] convert_dae_file: {}",
        dae_file_path.display()
    );
    let mut scene = parse_dae_file(dae_file_path)?;
    if !config.include_geometry_names.is_empty() {
        eprintln!(
            "[dae_to_ssbh] filtering by include_geometry_names: {:?}",
            config.include_geometry_names
        );
        let allowed: HashSet<String> = config.include_geometry_names.iter().cloned().collect();
        let before = scene.meshes.len();
        scene
            .meshes
            .retain(|m| !m.vertices.is_empty() && allowed.contains(&m.name));
        eprintln!(
            "[dae_to_ssbh] geometry filter: {} -> {} meshes",
            before,
            scene.meshes.len()
        );
        if scene.meshes.is_empty() {
            eprintln!("[dae_to_ssbh] include_geometry_names filter left no geometries");
            return Err(anyhow!(
                "include_geometry_names left no geometries (check exact COLLADA geometry names)"
            ));
        }
    }
    eprintln!("[dae_to_ssbh] validating scene...");
    validate_dae_scene(&scene).map_err(|e| {
        eprintln!("[dae_to_ssbh] scene validation failed: {}", e);
        e
    })?;
    eprintln!("[dae_to_ssbh] scene validation passed");
    let (converted_files, stats) = convert_dae_to_ssbh_files(&scene, config)?;
    eprintln!("[dae_to_ssbh] validating output files...");
    validate_converted_files(&converted_files).map_err(|e| {
        eprintln!("[dae_to_ssbh] output file validation failed: {}", e);
        e
    })?;
    eprintln!("[dae_to_ssbh] convert_dae_file done successfully");
    Ok((converted_files, stats))
}

/// Filter, validate, and convert an in-memory import scene (e.g. after FBX parse).
pub fn convert_import_scene_file(
    mut scene: ImportScene,
    config: &DaeConvertConfig,
) -> Result<(ConvertedFiles, SsbhConvertStats)> {
    if !config.include_geometry_names.is_empty() {
        let allowed: HashSet<String> = config.include_geometry_names.iter().cloned().collect();
        scene
            .meshes
            .retain(|m| !m.vertices.is_empty() && allowed.contains(&m.name));
        if scene.meshes.is_empty() {
            return Err(anyhow!(
                "include_geometry_names left no geometries (check exact mesh names)"
            ));
        }
    }
    validate_dae_scene(&scene)?;
    let (converted_files, stats) = convert_import_scene_to_ssbh_files(&scene, config)?;
    validate_converted_files(&converted_files)?;
    Ok((converted_files, stats))
}

/// VS2 mesh write path stores `subindex` 0 on disk for every object; modl entries must use 0 as well.
/// Distinct objects therefore require unique geometry names in the DAE.
fn ensure_unique_geometry_names_for_vs2(meshes: &[Vs2PreparedMesh]) -> Result<()> {
    let mut seen = HashSet::new();
    for m in meshes {
        if m.vertices.is_empty() {
            continue;
        }
        if !seen.insert(m.name.clone()) {
            eprintln!(
                "[dae_to_ssbh] duplicate geometry name '{}' (VS2 requires unique names)",
                m.name
            );
            return Err(anyhow!(
                "Duplicate geometry name '{}' in DAE: VS2 export requires unique names (mesh subindex is always 0 on disk)",
                m.name
            ));
        }
    }
    eprintln!("[dae_to_ssbh] all {} geometry names are unique", seen.len());
    Ok(())
}

const VS2_MAX_VERTEX_INDEX: u32 = u16::MAX as u32;
const VS2_MAX_VERTEX_COUNT: usize = u16::MAX as usize + 1;

#[derive(Debug)]
struct Vs2PreparedMesh {
    name: String,
    source_name: String,
    vertices: Vec<[f32; 3]>,
    normals: Vec<[f32; 3]>,
    uvs: Vec<[f32; 2]>,
    indices: Vec<u32>,
    bone_influences: Vec<super::dae_parse::DaeBoneInfluence>,
}

fn prepare_meshes_for_vs2(meshes: &[DaeMesh]) -> Result<Vec<Vs2PreparedMesh>> {
    let mut prepared = Vec::new();
    let mut reserved_names: HashSet<String> = meshes
        .iter()
        .filter(|mesh| !mesh.vertices.is_empty())
        .map(|mesh| mesh.name.clone())
        .collect();

    for mesh in meshes {
        if mesh.vertices.is_empty() || mesh.indices.is_empty() {
            prepared.push(Vs2PreparedMesh {
                name: mesh.name.clone(),
                source_name: mesh.name.clone(),
                vertices: mesh.vertices.clone(),
                normals: mesh.normals.clone(),
                uvs: mesh.uvs.clone(),
                indices: mesh.indices.clone(),
                bone_influences: mesh.bone_influences.clone(),
            });
            continue;
        }

        let max_index = mesh.indices.iter().copied().max().unwrap_or(0);
        if mesh.vertices.len() <= VS2_MAX_VERTEX_COUNT && max_index <= VS2_MAX_VERTEX_INDEX {
            prepared.push(Vs2PreparedMesh {
                name: mesh.name.clone(),
                source_name: mesh.name.clone(),
                vertices: mesh.vertices.clone(),
                normals: mesh.normals.clone(),
                uvs: mesh.uvs.clone(),
                indices: mesh.indices.clone(),
                bone_influences: mesh.bone_influences.clone(),
            });
            continue;
        }

        let split = split_mesh_for_vs2_with_reserved_names(mesh, &mut reserved_names)?;
        eprintln!(
            "[dae_to_ssbh] split mesh '{}' for VS2 u16 index safety: {} verts, {} indices -> {} parts",
            mesh.name,
            mesh.vertices.len(),
            mesh.indices.len(),
            split.len()
        );
        prepared.extend(split);
    }

    Ok(prepared)
}

#[cfg(test)]
fn split_mesh_for_vs2(mesh: &DaeMesh) -> Result<Vec<Vs2PreparedMesh>> {
    split_mesh_for_vs2_with_reserved_names(mesh, &mut HashSet::new())
}

fn split_mesh_for_vs2_with_reserved_names(
    mesh: &DaeMesh,
    reserved_names: &mut HashSet<String>,
) -> Result<Vec<Vs2PreparedMesh>> {
    if mesh.indices.len() % 3 != 0 {
        return Err(anyhow!(
            "Mesh '{}' index count {} is not divisible by 3",
            mesh.name,
            mesh.indices.len()
        ));
    }

    let mut parts = Vec::new();
    let mut vertex_order = Vec::new();
    let mut local_indices = Vec::new();
    let mut remap: HashMap<u32, u32> = HashMap::new();

    for triangle in mesh.indices.chunks_exact(3) {
        let additional_vertices = triangle
            .iter()
            .filter(|&&index| !remap.contains_key(&index))
            .count();

        if !local_indices.is_empty()
            && vertex_order.len() + additional_vertices > VS2_MAX_VERTEX_COUNT
        {
            parts.push(build_vs2_split_part(
                mesh,
                parts.len(),
                &vertex_order,
                &local_indices,
                &remap,
                reserved_names,
            )?);
            vertex_order.clear();
            local_indices.clear();
            remap.clear();
        }

        for &source_index in triangle {
            let local_index = if let Some(&existing) = remap.get(&source_index) {
                existing
            } else {
                let next = vertex_order.len() as u32;
                vertex_order.push(source_index);
                remap.insert(source_index, next);
                next
            };
            local_indices.push(local_index);
        }
    }

    if !local_indices.is_empty() {
        parts.push(build_vs2_split_part(
            mesh,
            parts.len(),
            &vertex_order,
            &local_indices,
            &remap,
            reserved_names,
        )?);
    }

    Ok(parts)
}

fn build_vs2_split_part(
    mesh: &DaeMesh,
    part_index: usize,
    vertex_order: &[u32],
    local_indices: &[u32],
    remap: &HashMap<u32, u32>,
    reserved_names: &mut HashSet<String>,
) -> Result<Vs2PreparedMesh> {
    let vertices = vertex_order
        .iter()
        .map(|&source_index| {
            mesh.vertices
                .get(source_index as usize)
                .copied()
                .ok_or_else(|| {
                    anyhow!(
                        "Mesh '{}' split vertex index {} out of bounds",
                        mesh.name,
                        source_index
                    )
                })
        })
        .collect::<Result<Vec<_>>>()?;

    let normals = if mesh.normals.is_empty() {
        Vec::new()
    } else {
        vertex_order
            .iter()
            .map(|&source_index| {
                mesh.normals
                    .get(source_index as usize)
                    .copied()
                    .ok_or_else(|| {
                        anyhow!(
                            "Mesh '{}' split normal index {} out of bounds",
                            mesh.name,
                            source_index
                        )
                    })
            })
            .collect::<Result<Vec<_>>>()?
    };

    let uvs = if mesh.uvs.is_empty() {
        Vec::new()
    } else {
        vertex_order
            .iter()
            .map(|&source_index| {
                mesh.uvs.get(source_index as usize).copied().ok_or_else(|| {
                    anyhow!(
                        "Mesh '{}' split uv index {} out of bounds",
                        mesh.name,
                        source_index
                    )
                })
            })
            .collect::<Result<Vec<_>>>()?
    };

    let bone_influences = mesh
        .bone_influences
        .iter()
        .filter_map(|influence| {
            let vertex_weights: Vec<super::dae_parse::DaeVertexWeight> = influence
                .vertex_weights
                .iter()
                .filter_map(|weight| {
                    remap.get(&weight.vertex_index).map(|&local_index| {
                        super::dae_parse::DaeVertexWeight {
                            vertex_index: local_index,
                            weight: weight.weight,
                        }
                    })
                })
                .collect();

            (!vertex_weights.is_empty()).then_some(super::dae_parse::DaeBoneInfluence {
                bone_name: influence.bone_name.clone(),
                vertex_weights,
            })
        })
        .collect();

    Ok(Vs2PreparedMesh {
        name: next_vs2_split_part_name(&mesh.name, part_index, reserved_names),
        source_name: mesh.name.clone(),
        vertices,
        normals,
        uvs,
        indices: local_indices.to_vec(),
        bone_influences,
    })
}

fn next_vs2_split_part_name(
    mesh_name: &str,
    part_index: usize,
    reserved_names: &mut HashSet<String>,
) -> String {
    let preferred = format!("{}__part{}", mesh_name, part_index);
    if reserved_names.insert(preferred.clone()) {
        return preferred;
    }

    let mut split_index = 0usize;
    loop {
        let candidate = format!("{}__split{}__part{}", mesh_name, split_index, part_index);
        if reserved_names.insert(candidate.clone()) {
            return candidate;
        }
        split_index += 1;
    }
}

#[cfg(test)]
fn convert_meshes_to_ssbh(meshes: &[DaeMesh], config: &DaeConvertConfig) -> Result<MeshData> {
    let prepared = prepare_meshes_for_vs2(meshes)?;
    convert_prepared_meshes_to_ssbh(&prepared, config)
}

fn convert_prepared_meshes_to_ssbh(
    meshes: &[Vs2PreparedMesh],
    config: &DaeConvertConfig,
) -> Result<MeshData> {
    let mut mesh_objects = Vec::new();

    for dae_mesh in meshes {
        if dae_mesh.vertices.is_empty() {
            eprintln!("[dae_to_ssbh] skipping empty mesh '{}'", dae_mesh.name);
            continue;
        }

        eprintln!(
            "[dae_to_ssbh] converting mesh '{}': {} verts, {} indices, {} bone_influences",
            dae_mesh.name,
            dae_mesh.vertices.len(),
            dae_mesh.indices.len(),
            dae_mesh.bone_influences.len()
        );

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
                data: VectorData::Vector3(vertices.iter().copied().map(Vec3::from).collect()),
            }],
            normals: vec![AttributeData {
                name: String::new(),
                data: VectorData::Vector3(normals.iter().copied().map(Vec3::from).collect()),
            }],
            binormals: vec![
                AttributeData {
                    name: String::new(),
                    data: VectorData::Vector3(binormals.iter().copied().map(Vec3::from).collect()),
                },
                AttributeData {
                    name: String::new(),
                    data: VectorData::Vector3(binormals.into_iter().map(Vec3::from).collect()),
                },
            ],
            tangents: vec![
                AttributeData {
                    name: String::new(),
                    data: VectorData::Vector3(tangents.iter().copied().map(Vec3::from).collect()),
                },
                AttributeData {
                    name: String::new(),
                    data: VectorData::Vector3(tangents.into_iter().map(Vec3::from).collect()),
                },
            ],
            texture_coordinates: vec![
                AttributeData {
                    name: String::new(),
                    data: VectorData::Vector2(uvs.into_iter().map(Vec2::from).collect()),
                },
                AttributeData {
                    name: "HalfFloat2_0".to_string(),
                    data: VectorData::Vector4(
                        generate_half_float2_data(vertex_count)
                            .into_iter()
                            .map(Vec4::from)
                            .collect(),
                    ),
                },
            ],
            color_sets: vec![
                AttributeData {
                    name: "colorSet0".to_string(),
                    data: VectorData::Vector2(
                        generate_default_colorset0_data(vertex_count)
                            .into_iter()
                            .map(Vec2::from)
                            .collect(),
                    ),
                },
                AttributeData {
                    name: "colorSet1".to_string(),
                    data: VectorData::Vector2(
                        generate_default_colorset1_data(vertex_count)
                            .into_iter()
                            .map(Vec2::from)
                            .collect(),
                    ),
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

fn convert_prepared_model_to_ssbh(
    meshes: &[Vs2PreparedMesh],
    config: &DaeConvertConfig,
) -> Result<ModlData> {
    let mut entries = Vec::new();
    let configured_entries: HashMap<(&str, u64), &str> = config
        .modl_entries
        .iter()
        .map(|entry| {
            (
                (entry.mesh_object_name.as_str(), entry.mesh_object_subindex),
                entry.material_label.as_str(),
            )
        })
        .collect();

    for mesh in meshes {
        if mesh.vertices.is_empty() {
            continue;
        }
        let material_label = if configured_entries.is_empty() {
            "DefaultMaterial".to_string()
        } else {
            let key = (mesh.name.as_str(), 0u64);
            let source_key = (mesh.source_name.as_str(), 0u64);
            configured_entries
                .get(&key)
                .or_else(|| configured_entries.get(&source_key))
                .ok_or_else(|| anyhow!("Missing numdlb mapping for mesh '{}'", mesh.name))?
                .trim()
                .to_string()
        };
        if material_label.is_empty() {
            return Err(anyhow!(
                "Mesh '{}' has an empty material label in the numdlb mapping",
                mesh.name
            ));
        }
        entries.push(ModlEntryData {
            mesh_object_name: mesh.name.clone(),
            mesh_object_subindex: 0,
            material_label,
        });
    }

    Ok(ModlData {
        major_version: 1,
        minor_version: 0,
        model_name: config.base_filename.clone(),
        skeleton_file_name: format!("{}.nusktb", config.base_filename),
        material_file_names: vec![format!("{}__nust__.numatb", config.base_filename)],
        animation_file_name: None,
        mesh_file_name: format!("{}.numshb", config.base_filename),
        entries,
    })
}

fn convert_skeleton_from_dae(
    dae_bones: &[DaeBone],
    meshes: &[DaeMesh],
    config: &DaeConvertConfig,
) -> Result<SkelData> {
    let mut bones = Vec::new();

    if !dae_bones.is_empty() {
        for dae_bone in dae_bones {
            bones.push(BoneData {
                name: dae_bone.name.clone(),
                transform: Mat4::from_cols_array_2d(&scale_bone_transform_translation(
                    dae_bone.transform,
                    config.scale_factor,
                )),
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
                transform: Mat4::IDENTITY,
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
    use tempfile::tempdir;

    fn make_mesh_with_unique_triangle_vertices(name: &str, triangle_count: usize) -> DaeMesh {
        let mut vertices = Vec::with_capacity(triangle_count * 3);
        let mut normals = Vec::with_capacity(triangle_count * 3);
        let mut uvs = Vec::with_capacity(triangle_count * 3);
        let mut indices = Vec::with_capacity(triangle_count * 3);

        for tri in 0..triangle_count {
            let base = (tri * 3) as u32;
            let x = tri as f32;
            vertices.push([x, 0.0, 0.0]);
            vertices.push([x, 1.0, 0.0]);
            vertices.push([x, 0.0, 1.0]);
            normals.push([0.0, 0.0, 1.0]);
            normals.push([0.0, 0.0, 1.0]);
            normals.push([0.0, 0.0, 1.0]);
            uvs.push([0.0, 0.0]);
            uvs.push([1.0, 0.0]);
            uvs.push([0.0, 1.0]);
            indices.extend([base, base + 1, base + 2]);
        }

        DaeMesh {
            name: name.to_string(),
            vertices,
            normals,
            uvs,
            indices,
            material_name: None,
            bone_influences: Vec::new(),
        }
    }

    #[test]
    fn convert_meshes_to_ssbh_splits_large_meshes_for_vs2_u16_index_limit() {
        let mesh = make_mesh_with_unique_triangle_vertices("HugeMesh", 25_000);
        assert!(mesh.vertices.len() > u16::MAX as usize + 1);

        let mesh_data =
            convert_meshes_to_ssbh(&[mesh], &DaeConvertConfig::default()).expect("mesh conversion");

        assert!(
            mesh_data.objects.len() > 1,
            "large VS2 mesh should be split before writing so each object stays u16-index-safe"
        );
        for object in &mesh_data.objects {
            let vertex_count = object.vertex_count().expect("vertex count");
            let max_index = object.vertex_indices.iter().copied().max().unwrap_or(0);
            assert!(
                vertex_count <= u16::MAX as usize + 1,
                "split object '{}' still exceeds u16-safe vertex count: {}",
                object.name,
                vertex_count
            );
            assert!(
                max_index <= u16::MAX as u32,
                "split object '{}' still exceeds u16-safe max index: {}",
                object.name,
                max_index
            );
        }
    }

    #[test]
    fn convert_meshes_to_ssbh_avoids_split_name_collisions_with_existing_meshes() {
        let huge = make_mesh_with_unique_triangle_vertices("HugeMesh", 25_000);
        let existing_part = make_mesh_with_unique_triangle_vertices("HugeMesh__part0", 1);

        let mesh_data =
            convert_meshes_to_ssbh(&[huge, existing_part], &DaeConvertConfig::default())
                .expect("mesh conversion");

        let names: Vec<&str> = mesh_data
            .objects
            .iter()
            .map(|object| object.name.as_str())
            .collect();
        let unique_names: std::collections::HashSet<&str> = names.iter().copied().collect();

        assert_eq!(
            unique_names.len(),
            names.len(),
            "split output names must remain unique even when the input already contains __partN names"
        );
    }

    #[test]
    fn split_mesh_for_vs2_remaps_bone_influences_to_local_part_indices() {
        let mut mesh = make_mesh_with_unique_triangle_vertices("SkinnedHuge", 25_000);
        let last_vertex_index = mesh.vertices.len() as u32 - 1;
        mesh.bone_influences = vec![super::super::dae_parse::DaeBoneInfluence {
            bone_name: "Root".to_string(),
            vertex_weights: vec![
                super::super::dae_parse::DaeVertexWeight {
                    vertex_index: 0,
                    weight: 1.0,
                },
                super::super::dae_parse::DaeVertexWeight {
                    vertex_index: last_vertex_index,
                    weight: 0.5,
                },
            ],
        }];

        let parts = split_mesh_for_vs2(&mesh).expect("split mesh");
        assert!(parts.len() > 1, "expected the large skinned mesh to split");

        let total_weights: usize = parts
            .iter()
            .map(|part| {
                part.bone_influences
                    .iter()
                    .map(|influence| influence.vertex_weights.len())
                    .sum::<usize>()
            })
            .sum();
        assert_eq!(
            total_weights, 2,
            "split parts should preserve both source weights"
        );

        for part in &parts {
            for influence in &part.bone_influences {
                for weight in &influence.vertex_weights {
                    assert!(
                        (weight.vertex_index as usize) < part.vertices.len(),
                        "weight {} in '{}' should be remapped into the local vertex range {}",
                        weight.vertex_index,
                        part.name,
                        part.vertices.len()
                    );
                }
            }
        }
    }

    #[test]
    fn convert_import_scene_to_ssbh_files_preserves_material_mapping_for_split_parts() {
        use ssbh_data::modl_data::ModlData;

        let output = tempdir().expect("temp dir");
        let scene = ImportScene {
            meshes: vec![make_mesh_with_unique_triangle_vertices("HugeMesh", 25_000)],
            materials: Vec::new(),
            bones: Vec::new(),
            up_axis: super::super::import_scene::UpAxisConversion::NoConversion,
            fbx_import_source: None,
        };
        let config = DaeConvertConfig {
            output_directory: output.path().to_path_buf(),
            base_filename: "huge_mesh_test".to_string(),
            scale_factor: 1.0,
            up_axis_conversion: super::super::import_scene::UpAxisConversion::NoConversion,
            flip_uv: false,
            include_geometry_names: Vec::new(),
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            modl_entries: vec![super::super::dae_parse::ModlEntryConfig {
                mesh_object_name: "HugeMesh".to_string(),
                mesh_object_subindex: 0,
                material_label: "StoneMaterial".to_string(),
            }],
        };

        let (files, stats) =
            convert_import_scene_to_ssbh_files(&scene, &config).expect("full conversion");
        let modl = ModlData::from_file(files.numdlb_path.as_ref().expect("numdlb path"))
            .expect("parse modl");

        assert!(
            stats.mesh_objects > 1,
            "large VS2 mesh should become multiple mesh objects"
        );
        assert_eq!(
            modl.entries.len(),
            stats.mesh_objects,
            "numdlb should contain one entry per split mesh object"
        );
        assert!(
            modl.entries
                .iter()
                .all(|entry| entry.material_label == "StoneMaterial"),
            "all split parts should inherit the original mesh material mapping"
        );
    }

    #[test]
    #[ignore = "write_to_file_with_profile(Vs2Canonical) breaks in-game meshes; production uses write_to_file"]
    fn exported_numshb_uses_canonical_profile_without_dummy_buffer2() {
        use ssbh_lib::formats::mesh::Mesh;

        let output = tempdir().expect("temp dir");
        let scene = ImportScene {
            meshes: vec![make_mesh_with_unique_triangle_vertices("SmallMesh", 4)],
            materials: Vec::new(),
            bones: Vec::new(),
            up_axis: super::super::import_scene::UpAxisConversion::NoConversion,
            fbx_import_source: None,
        };
        let config = DaeConvertConfig {
            output_directory: output.path().to_path_buf(),
            base_filename: "canonical_profile_test".to_string(),
            scale_factor: 1.0,
            up_axis_conversion: super::super::import_scene::UpAxisConversion::NoConversion,
            flip_uv: false,
            include_geometry_names: Vec::new(),
            write_numdlb: false,
            write_numshb: true,
            write_nusktb: false,
            modl_entries: Vec::new(),
        };

        let (files, stats) =
            convert_import_scene_to_ssbh_files(&scene, &config).expect("conversion");
        let numshb_path = files.numshb_path.as_ref().expect("numshb path");

        // The canonical EXVS2 profile omits the unused dummy vertex buffer 2.
        let mesh = Mesh::from_file(numshb_path).expect("parse numshb");
        let inner = match &mesh {
            Mesh::V8(inner) => inner,
            _ => panic!("EXVS2 exports must stay mesh v1.8"),
        };
        assert_eq!(0, inner.buffer_sizes.elements[2]);
        assert_eq!(0, inner.vertex_buffers.elements[2].elements.len());
        for object in &inner.objects.elements {
            assert_eq!(32, object.stride2);
            assert_eq!(object.vertex_buffer1_offset, object.vertex_buffer2_offset);
            assert!(
                object
                    .attributes
                    .elements
                    .iter()
                    .all(|a| a.buffer_index < 2),
                "no attribute may reference the omitted buffer"
            );
        }

        // The exported file must preserve the pre-write mesh semantics.
        let expected = convert_meshes_to_ssbh(&scene.meshes, &config).expect("expected mesh data");
        let reparsed = MeshData::from_file(numshb_path).expect("reparse numshb");
        assert_eq!(expected.objects.len(), reparsed.objects.len());
        assert_eq!(stats.mesh_objects, reparsed.objects.len());
        for (expected_object, actual_object) in expected.objects.iter().zip(reparsed.objects.iter())
        {
            assert_eq!(expected_object.name, actual_object.name);
            assert_eq!(expected_object.subindex, actual_object.subindex);
            assert_eq!(expected_object.vertex_indices, actual_object.vertex_indices);

            let groups = [
                (&expected_object.positions, &actual_object.positions),
                (&expected_object.normals, &actual_object.normals),
                (&expected_object.binormals, &actual_object.binormals),
                (&expected_object.tangents, &actual_object.tangents),
                (
                    &expected_object.texture_coordinates,
                    &actual_object.texture_coordinates,
                ),
                (&expected_object.color_sets, &actual_object.color_sets),
            ];
            for (expected_attributes, actual_attributes) in groups {
                assert_eq!(expected_attributes.len(), actual_attributes.len());
                for (expected_attribute, actual_attribute) in
                    expected_attributes.iter().zip(actual_attributes.iter())
                {
                    // Mesh v1.8 regenerates attribute names, so compare the data only.
                    assert_eq!(
                        format!("{:?}", expected_attribute.data),
                        format!("{:?}", actual_attribute.data),
                        "attribute data changed for object '{}'",
                        expected_object.name
                    );
                }
            }
        }
    }
}
