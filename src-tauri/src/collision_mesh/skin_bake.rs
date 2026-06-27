use std::collections::HashMap;

use glam::{Mat4, Vec4};

use crate::ssbh_dae::{ImportBone, ImportMesh, ImportScene};

use super::axis::apply_collision_axis_scale;
use super::types::{CollisionMeshOptions, CollisionTriMesh};

const WEIGHT_EPSILON: f32 = 1e-6;

fn mat4_from_import(transform: [[f32; 4]; 4]) -> Mat4 {
    Mat4::from_cols_array_2d(&transform)
}

fn compute_bone_world_matrices(bones: &[ImportBone]) -> Vec<Mat4> {
    let mut worlds = vec![Mat4::IDENTITY; bones.len()];
    for (i, bone) in bones.iter().enumerate() {
        let local = mat4_from_import(bone.transform);
        worlds[i] = match bone.parent_index {
            Some(parent) if parent < worlds.len() => worlds[parent] * local,
            Some(_) => local,
            None => local,
        };
    }
    worlds
}

fn bone_name_to_index(bones: &[ImportBone]) -> HashMap<String, usize> {
    bones
        .iter()
        .enumerate()
        .map(|(i, b)| (b.name.clone(), i))
        .collect()
}

fn skin_matrix_for_bone(bone: &ImportBone, bone_world: Mat4) -> Mat4 {
    match bone.inverse_bind_matrix {
        Some(ibm) => bone_world * mat4_from_import(ibm),
        None => bone_world,
    }
}

/// Bake one mesh to collision space (skin or rigid), then apply axis/scale.
pub fn bake_mesh_vertices(
    mesh: &ImportMesh,
    bones: &[ImportBone],
    options: &CollisionMeshOptions,
) -> Result<Vec<[f64; 3]>, String> {
    if mesh.vertices.is_empty() {
        return Ok(Vec::new());
    }

    let baked = if mesh.bone_influences.is_empty() {
        mesh.vertices.clone()
    } else {
        bake_skinned_vertices(mesh, bones)?
    };

    Ok(baked
        .into_iter()
        .map(|v| {
            apply_collision_axis_scale(
                [v[0] as f64, v[1] as f64, v[2] as f64],
                options,
            )
        })
        .collect())
}

fn bake_skinned_vertices(mesh: &ImportMesh, bones: &[ImportBone]) -> Result<Vec<[f32; 3]>, String> {
    let bone_worlds = compute_bone_world_matrices(bones);
    let name_to_index = bone_name_to_index(bones);

    let mut skin_mats: HashMap<String, Mat4> = HashMap::new();
    for bone in bones {
        let Some(&idx) = name_to_index.get(&bone.name) else {
            continue;
        };
        skin_mats.insert(
            bone.name.clone(),
            skin_matrix_for_bone(bone, bone_worlds[idx]),
        );
    }

    let mut out = vec![[0.0f32; 3]; mesh.vertices.len()];
    let mut weight_sums = vec![0.0f32; mesh.vertices.len()];

    for influence in &mesh.bone_influences {
        let Some(skin_mat) = skin_mats.get(&influence.bone_name) else {
            return Err(format!(
                "Mesh '{}': skin references unknown bone '{}'",
                mesh.name, influence.bone_name
            ));
        };
        for vw in &influence.vertex_weights {
            let vi = vw.vertex_index as usize;
            if vi >= mesh.vertices.len() {
                return Err(format!(
                    "Mesh '{}': skin weight vertex index {} out of range",
                    mesh.name, vi
                ));
            }
            if vw.weight <= WEIGHT_EPSILON {
                continue;
            }
            let bind = mesh.vertices[vi];
            let bind_v = Vec4::new(bind[0], bind[1], bind[2], 1.0);
            let deformed = *skin_mat * bind_v;
            let w = vw.weight;
            out[vi][0] += deformed.x * w;
            out[vi][1] += deformed.y * w;
            out[vi][2] += deformed.z * w;
            weight_sums[vi] += w;
        }
    }

    for (vi, sum) in weight_sums.iter().enumerate() {
        if *sum <= WEIGHT_EPSILON {
            out[vi] = mesh.vertices[vi];
        } else if (*sum - 1.0).abs() > 1e-3 {
            out[vi][0] /= sum;
            out[vi][1] /= sum;
            out[vi][2] /= sum;
        }
    }

    Ok(out)
}

fn normalize_to_ground_plane(vertices: &mut [[f64; 3]]) {
    if vertices.is_empty() {
        return;
    }
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for v in vertices.iter() {
        for axis in 0..3 {
            min[axis] = min[axis].min(v[axis]);
            max[axis] = max[axis].max(v[axis]);
        }
    }
    let center_x = (min[0] + max[0]) * 0.5;
    let center_z = (min[2] + max[2]) * 0.5;
    let y_shift = -min[1];
    if center_x.abs() < 1e-9 && y_shift.abs() < 1e-9 && center_z.abs() < 1e-9 {
        return;
    }
    for v in vertices.iter_mut() {
        v[0] -= center_x;
        v[1] += y_shift;
        v[2] -= center_z;
    }
}

/// Skin-bake every mesh and merge into one collision triangle mesh.
pub fn bake_and_merge_collision_mesh(
    scene: &ImportScene,
    options: &CollisionMeshOptions,
) -> Result<CollisionTriMesh, String> {
    let mut out_vertices: Vec<[f64; 3]> = Vec::new();
    let mut out_indices: Vec<u32> = Vec::new();

    for mesh in &scene.meshes {
        if mesh.vertices.is_empty() || mesh.indices.is_empty() {
            continue;
        }
        if mesh.indices.len() % 3 != 0 {
            return Err(format!(
                "Mesh '{}': index count {} is not divisible by 3",
                mesh.name,
                mesh.indices.len()
            ));
        }

        let baked = bake_mesh_vertices(mesh, &scene.bones, options)?;
        let base = out_vertices.len() as u32;
        out_vertices.extend(baked);
        for &idx in &mesh.indices {
            let global = base + idx;
            if global as usize >= out_vertices.len() {
                return Err(format!(
                    "Mesh '{}': index {} out of range after merge",
                    mesh.name, idx
                ));
            }
            out_indices.push(global);
        }
    }

    if out_vertices.is_empty() || out_indices.is_empty() {
        return Err("Scene produced no collision geometry".into());
    }

    normalize_to_ground_plane(&mut out_vertices);

    Ok(CollisionTriMesh {
        vertices: out_vertices,
        indices: out_indices,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssbh_dae::import_scene::{ImportBoneInfluence, ImportVertexWeight};
    use crate::ssbh_dae::UpAxisConversion;

    fn rigid_mesh() -> ImportMesh {
        ImportMesh {
            name: "box".into(),
            vertices: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            normals: vec![],
            uvs: vec![],
            indices: vec![0, 1, 2],
            material_name: None,
            bone_influences: vec![],
        }
    }

    #[test]
    fn rigid_mesh_normalized_to_ground_plane() {
        let scene = ImportScene {
            meshes: vec![rigid_mesh()],
            materials: vec![],
            bones: vec![],
            up_axis: UpAxisConversion::YUp,
            fbx_import_source: None,
        };
        let mesh = bake_and_merge_collision_mesh(&scene, &CollisionMeshOptions::default()).unwrap();
        assert_eq!(mesh.vertices.len(), 3);
        assert_eq!(mesh.indices, vec![0, 1, 2]);
        let (min, _max) = mesh.compute_aabb().unwrap();
        assert!(min[1].abs() < 1e-6, "min Y should be 0 (ground plane)");
        let center_x = mesh.vertices.iter().map(|v| v[0]).sum::<f64>() / mesh.vertices.len() as f64;
        assert!(center_x.abs() < 0.5, "XZ should be roughly centered");
    }

    #[test]
    fn two_meshes_merge_with_index_rebase() {
        let scene = ImportScene {
            meshes: vec![rigid_mesh(), rigid_mesh()],
            materials: vec![],
            bones: vec![],
            up_axis: UpAxisConversion::YUp,
            fbx_import_source: None,
        };
        let mesh = bake_and_merge_collision_mesh(&scene, &CollisionMeshOptions::default()).unwrap();
        assert_eq!(mesh.vertices.len(), 6);
        assert_eq!(mesh.indices, vec![0, 1, 2, 3, 4, 5]);
    }

    #[test]
    fn skin_bake_applies_single_bone_transform() {
        let mut bone = ImportBone {
            name: "root".into(),
            parent_index: None,
            transform: [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [2.0, 0.0, 0.0, 1.0],
            ],
            inverse_bind_matrix: None,
        };
        bone.inverse_bind_matrix = Some([
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ]);

        let mesh = ImportMesh {
            name: "skinned".into(),
            vertices: vec![[1.0, 0.0, 0.0]],
            normals: vec![],
            uvs: vec![],
            indices: vec![0, 0, 0],
            material_name: None,
            bone_influences: vec![ImportBoneInfluence {
                bone_name: "root".into(),
                vertex_weights: vec![ImportVertexWeight {
                    vertex_index: 0,
                    weight: 1.0,
                }],
            }],
        };

        let bones = vec![bone];
        let baked = bake_mesh_vertices(&mesh, &bones, &CollisionMeshOptions::default()).unwrap();
        assert!((baked[0][0] - 3.0).abs() < 1e-4, "bone translate +2 on X applied to vertex at x=1");
    }
}
