//! Neutral mesh/skeleton scene for DAE, FBX, and other importers before SSBH conversion.

use anyhow::{anyhow, Result};
use std::collections::HashMap;

/// Up axis hint from source file (DAE asset / FBX load options).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum UpAxisConversion {
    YUp,
    ZUp,
    NoConversion,
}

/// Parsed scene: meshes, optional materials, bone hierarchy, and source up-axis hint.
#[derive(Debug)]
pub struct ImportScene {
    pub meshes: Vec<ImportMesh>,
    pub materials: Vec<ImportMaterial>,
    pub bones: Vec<ImportBone>,
    pub up_axis: UpAxisConversion,
}

#[derive(Debug)]
pub struct ImportMesh {
    pub name: String,
    pub vertices: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub uvs: Vec<[f32; 2]>,
    pub indices: Vec<u32>,
    pub material_name: Option<String>,
    pub bone_influences: Vec<ImportBoneInfluence>,
}

#[derive(Debug, Clone)]
pub struct ImportBoneInfluence {
    pub bone_name: String,
    pub vertex_weights: Vec<ImportVertexWeight>,
}

#[derive(Debug, Clone)]
pub struct ImportVertexWeight {
    pub vertex_index: u32,
    pub weight: f32,
}

#[derive(Debug, Clone)]
pub struct ImportBone {
    pub name: String,
    pub parent_index: Option<usize>,
    pub transform: [[f32; 4]; 4],
    pub inverse_bind_matrix: Option<[[f32; 4]; 4]>,
}

#[derive(Debug)]
pub struct ImportMaterial {
    pub name: String,
    pub diffuse_color: [f32; 4],
    pub specular_color: [f32; 4],
    pub emission_color: [f32; 4],
    pub texture_paths: HashMap<String, String>,
}

/// Validate scene before SSBH conversion (shared by DAE and FBX paths).
pub fn validate_import_scene(scene: &ImportScene) -> Result<()> {
    if scene.meshes.is_empty() {
        return Err(anyhow!("Scene contains no meshes"));
    }

    let mut valid_mesh_count = 0;

    for (index, mesh) in scene.meshes.iter().enumerate() {
        if mesh.vertices.is_empty() {
            continue;
        }

        if mesh.indices.is_empty() {
            continue;
        }

        valid_mesh_count += 1;

        let max_vertex_index = mesh.vertices.len() as u32;
        for (idx_pos, &index_val) in mesh.indices.iter().enumerate() {
            if index_val >= max_vertex_index {
                return Err(anyhow!(
                    "Mesh '{}' (index {}) has out-of-bounds index: {} at position {} (max valid index: {}, vertex count: {})",
                    mesh.name,
                    index,
                    index_val,
                    idx_pos,
                    max_vertex_index.saturating_sub(1),
                    mesh.vertices.len()
                ));
            }
        }

        if mesh.indices.len() % 3 != 0 {
            return Err(anyhow!(
                "Mesh '{}' (index {}) has invalid index count: {} (must be divisible by 3 for triangles)",
                mesh.name,
                index,
                mesh.indices.len()
            ));
        }

        if !mesh.normals.is_empty() && mesh.normals.len() != mesh.vertices.len() {
            return Err(anyhow!(
                "Mesh '{}' (index {}): normals count {} does not match vertex count {}",
                mesh.name,
                index,
                mesh.normals.len(),
                mesh.vertices.len()
            ));
        }

        if !mesh.uvs.is_empty() && mesh.uvs.len() != mesh.vertices.len() {
            return Err(anyhow!(
                "Mesh '{}' (index {}): UV count {} does not match vertex count {}",
                mesh.name,
                index,
                mesh.uvs.len(),
                mesh.vertices.len()
            ));
        }

        validate_mesh_skinning_constraints(mesh, index)?;
    }

    if valid_mesh_count == 0 {
        return Err(anyhow!(
            "Scene contains no valid meshes after filtering empty ones"
        ));
    }

    Ok(())
}

fn validate_mesh_skinning_constraints(mesh: &ImportMesh, mesh_index: usize) -> Result<()> {
    if mesh.vertices.is_empty() || mesh.bone_influences.is_empty() {
        return Ok(());
    }

    let vertex_count = mesh.vertices.len();
    let mut influences_per_vertex = vec![0usize; vertex_count];
    let mut weight_sum_per_vertex = vec![0.0f32; vertex_count];
    let mut first_influence_detail_per_vertex: Vec<Option<(String, f32)>> = vec![None; vertex_count];

    let mut issues = Vec::new();
    const MAX_ISSUES: usize = 24;

    for bone_influence in &mesh.bone_influences {
        for vertex_weight in &bone_influence.vertex_weights {
            let vertex_index = vertex_weight.vertex_index as usize;
            if vertex_index >= vertex_count {
                issues.push(format!(
                    "[NUMSHB_BONE_INDEX_OUT_OF_RANGE] mesh='{}' mesh_index={} bone='{}' vertex_index={} max_vertex_index={}",
                    mesh.name,
                    mesh_index,
                    bone_influence.bone_name,
                    vertex_weight.vertex_index,
                    vertex_count - 1
                ));
                if issues.len() >= MAX_ISSUES {
                    break;
                }
                continue;
            }

            if !vertex_weight.weight.is_finite() {
                issues.push(format!(
                    "[NUMSHB_INVALID_WEIGHT_VALUE] mesh='{}' mesh_index={} bone='{}' vertex_index={} weight={} reason=non_finite",
                    mesh.name,
                    mesh_index,
                    bone_influence.bone_name,
                    vertex_weight.vertex_index,
                    vertex_weight.weight
                ));
                if issues.len() >= MAX_ISSUES {
                    break;
                }
                continue;
            }

            if vertex_weight.weight < 0.0 {
                issues.push(format!(
                    "[NUMSHB_INVALID_WEIGHT_VALUE] mesh='{}' mesh_index={} bone='{}' vertex_index={} weight={} reason=negative",
                    mesh.name,
                    mesh_index,
                    bone_influence.bone_name,
                    vertex_weight.vertex_index,
                    vertex_weight.weight
                ));
                if issues.len() >= MAX_ISSUES {
                    break;
                }
                continue;
            }

            influences_per_vertex[vertex_index] += 1;
            weight_sum_per_vertex[vertex_index] += vertex_weight.weight;
            if first_influence_detail_per_vertex[vertex_index].is_none() {
                first_influence_detail_per_vertex[vertex_index] =
                    Some((bone_influence.bone_name.clone(), vertex_weight.weight));
            }
        }

        if issues.len() >= MAX_ISSUES {
            break;
        }
    }

    for vertex_index in 0..vertex_count {
        let influence_count = influences_per_vertex[vertex_index];
        if influence_count > 4 {
            let detail = first_influence_detail_per_vertex[vertex_index]
                .as_ref()
                .map(|(bone_name, weight)| format!("first_bone='{}' first_weight={}", bone_name, weight))
                .unwrap_or_else(|| "first_bone='<none>' first_weight=<none>".to_string());
            issues.push(format!(
                "[NUMSHB_INFLUENCE_OVERFLOW] mesh='{}' mesh_index={} vertex_index={} influences={} max_allowed=4 weight_sum={} {}",
                mesh.name,
                mesh_index,
                vertex_index,
                influence_count,
                weight_sum_per_vertex[vertex_index],
                detail
            ));
            if issues.len() >= MAX_ISSUES {
                break;
            }
        }

        let sum = weight_sum_per_vertex[vertex_index];
        if influence_count > 0 && (!sum.is_finite() || sum <= 0.0) {
            issues.push(format!(
                "[NUMSHB_ZERO_WEIGHT_SUM] mesh='{}' mesh_index={} vertex_index={} influences={} weight_sum={}",
                mesh.name,
                mesh_index,
                vertex_index,
                influence_count,
                sum
            ));
            if issues.len() >= MAX_ISSUES {
                break;
            }
        }
    }

    if issues.is_empty() {
        return Ok(());
    }

    let mut message = format!(
        "Skinning validation failed for mesh '{}' (mesh_index={}).\n\
This export was blocked to prevent generating a crashing .numshb.\n\
Issues (showing up to {}):",
        mesh.name, mesh_index, MAX_ISSUES
    );
    for issue in issues {
        message.push('\n');
        message.push_str("- ");
        message.push_str(&issue);
    }
    message.push_str(
        "\nFix this mesh in the source file and retry. \
Each vertex must have at most 4 valid bone influences.",
    );

    Err(anyhow!(message))
}
