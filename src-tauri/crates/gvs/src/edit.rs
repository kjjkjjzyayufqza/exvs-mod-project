/*
 * Ne jamais remplacer ni supprimer les noms d'auteur de cet avis.
 * Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
 * 作者 kjjkjjzyayufqza，产品 EXVS Mod Project，仓库 https://github.com/kjjkjjzyayufqza/exvs-mod-project。
 * El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la
 *   investigacion VS2 de este proyecto.
 * 作者 kjjkjjzyayufqza。製品 EXVS Mod Project。https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso:
 *   ACCEPTABLE_USE.md.
 */

//! Model, scene, detail, and MSC operations for the GVS backend.
//!
//! The page renders these payloads. Over Boost modules are not imported.

use std::io::Cursor;

use glam::Vec3;
use serde::Serialize;
use ssbh_data::mesh_data::{AttributeData, MeshData, MeshObjectData, VectorData};

use exvs_ps4_common::init_index::{open_index as open_shared, OpenIndex};
use exvs_ps4_common::msc_header::{inspect_msc as inspect_shared, MscHeader};
use exvs_ps4_common::scene::apply_scene_edit as apply_shared;

use crate::{Error, Result};
use crate::nutexb::Nutexb;
use crate::ssbh_view::{meshes_to_obj, ViewerMesh};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEdit {
    pub vertices: usize,
    pub first_x: f32,
    pub obj: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailEdit {
    pub name: String,
    pub bytes: Vec<u8>,
}

pub fn open_index(root: &std::path::Path) -> Result<OpenIndex> {
    open_shared(root)
}

pub fn edit_scene(document: &str, name: &str, x: f32, y: f32, z: f32) -> Result<String> {
    apply_shared(document, name, x, y, z)
}

pub fn inspect_msc(bytes: &[u8]) -> Result<MscHeader> {
    inspect_shared(bytes)
}

/// One triangle mesh the model edit can rewrite. The positions are the
/// shipped mesh writer, not a second container format.
pub fn triangle_mesh_bytes() -> Result<Vec<u8>> {
    let mesh = MeshData {
        major_version: 1,
        minor_version: 10,
        is_vs2: false,
        objects: vec![MeshObjectData {
            name: "triangle".to_string(),
            vertex_indices: vec![0, 1, 2],
            positions: vec![AttributeData {
                name: "Position0".into(),
                data: VectorData::Vector3(vec![
                    Vec3::new(-1.0, 1.0, 0.0),
                    Vec3::new(-1.0, -1.0, 0.0),
                    Vec3::new(1.0, -1.0, 0.0),
                ]),
            }],
            ..MeshObjectData::default()
        }],
    };
    write_mesh(&mesh)
}

/// Shift the first position of the first mesh object by +1 on X.
pub fn edit_model(bytes: &[u8]) -> Result<ModelEdit> {
    let mut mesh = MeshData::read(&mut Cursor::new(bytes)).map_err(|error| Error::format(format!("mesh: {error}")))?;
    let (name, indices, first_x, positions) = {
        let object = mesh
            .objects
            .first_mut()
            .ok_or_else(|| Error::invalid("mesh has no objects"))?;
        let name = object.name.clone();
        let indices = object.vertex_indices.clone();
        let attribute = object
            .positions
            .first_mut()
            .ok_or_else(|| Error::invalid("mesh has no positions"))?;
        let first_x = match &mut attribute.data {
            VectorData::Vector3(values) => {
                let point = values.first_mut().ok_or_else(|| Error::invalid("mesh has no vertices"))?;
                point.x += 1.0;
                point.x
            }
            _ => return Err(Error::unsupported("model edit expects Vector3 positions")),
        };
        let positions = match &attribute.data {
            VectorData::Vector3(values) => values.iter().flat_map(|point| [point.x, point.y, point.z]).collect(),
            _ => Vec::new(),
        };
        (name, indices, first_x, positions)
    };
    let vertices = positions.len() / 3;
    let written = write_mesh(&mesh)?;
    let obj = meshes_to_obj(
        &[ViewerMesh {
            name,
            positions,
            normals: Vec::new(),
            uvs: Vec::new(),
            indices,
            material: None,
            texture: None,
        }],
        "",
    );
    Ok(ModelEdit {
        vertices,
        first_x,
        obj,
        bytes: written,
    })
}

/// Rename a nutexb and return bytes that parse back to that name.
pub fn edit_detail(bytes: &[u8], name: &str) -> Result<DetailEdit> {
    if name.is_empty() || name.as_bytes().contains(&0) || name.len() >= 0x40 {
        return Err(Error::invalid("texture name is empty, too long, or contains NUL"));
    }
    let mut texture = Nutexb::parse(bytes)?;
    texture.name = name.to_string();
    texture.name_field.clear();
    let written = texture.to_bytes()?;
    let again = Nutexb::parse(&written)?;
    Ok(DetailEdit {
        name: again.name,
        bytes: written,
    })
}

fn write_mesh(mesh: &MeshData) -> Result<Vec<u8>> {
    let mut cursor = Cursor::new(Vec::new());
    mesh.write(&mut cursor)
        .map_err(|error| Error::format(format!("mesh write: {error}")))?;
    Ok(cursor.into_inner())
}
