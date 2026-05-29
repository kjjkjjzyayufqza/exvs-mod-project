use crate::collision_mesh::CollisionTriMesh;
use crate::fhm2d_memory_preview::load_mesh_data;
use ssbh_data::mesh_data::VectorData;

pub fn numshb_bytes_to_collision_trimesh(numshb_bytes: &[u8]) -> Result<CollisionTriMesh, String> {
    let mesh_data = load_mesh_data(numshb_bytes)?;
    let mut all_vertices: Vec<[f64; 3]> = Vec::new();
    let mut all_indices: Vec<u32> = Vec::new();

    for obj in &mesh_data.objects {
        let positions = obj
            .positions
            .first()
            .and_then(|a| match &a.data {
                VectorData::Vector3(v) => Some(v.clone()),
                VectorData::Vector4(v) => Some(v.iter().map(|x| [x[0], x[1], x[2]]).collect()),
                VectorData::Vector2(v) => Some(v.iter().map(|x| [x[0], x[1], 0.0]).collect()),
            })
            .ok_or_else(|| format!("Mesh object '{}' has no position data", obj.name))?;

        let base_idx = all_vertices.len() as u32;
        all_vertices.extend(positions.iter().map(|p| [p[0] as f64, p[1] as f64, p[2] as f64]));
        all_indices.extend(obj.vertex_indices.iter().map(|&i| i + base_idx));
    }

    if all_vertices.is_empty() {
        return Err("numshb has no mesh data".into());
    }

    Ok(CollisionTriMesh {
        vertices: all_vertices,
        indices: all_indices,
    })
}
