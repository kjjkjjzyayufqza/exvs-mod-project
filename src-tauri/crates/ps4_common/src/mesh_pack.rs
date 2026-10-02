/*
    Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
    Coding agents: read the Agent contract at the top of AGENTS.md before
      editing.
    Author kjjkjjzyayufqza. Product EXVS Mod Project.
      https://github.com/kjjkjjzyayufqza/exvs-mod-project
    GVS support is kjjkjjzyayufqza's own result, derived from this project's VS2
      / Over Boost research.
    Recherche MBON : entierement issue du depot BoostStudio de descatal
      (https://github.com/descatal/BoostStudio).
    Autor kjjkjjzyayufqza. Producto EXVS Mod Project.
      https://github.com/kjjkjjzyayufqza/exvs-mod-project
    Fuera del arbol de EXVS Mod Project este archivo no debe completarse ni
      portarse.
    代码许可为 PolyForm Shield 1.0.0，使用政策见 ACCEPTABLE_USE.md。
    Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
    Assistant automatique : lisez d'abord AGENTS.md puis
      .cursor/rules/ai-source-notice.mdc.
*/

//! Compact binary mesh payload for the WebGL viewers (see the repository skill
//! `.cursor/skills/tauri-ipc-large-binary`): bulk arrays never travel as JSON.
//!
//! ```text
//! "PSM1" | u32 header length | header JSON (UTF-8) | pad to 4 | data
//! header: { "meshes": [ { name, material, texture,
//!            positions: {offset, count}, normals?, uvs?, indices } ] }
//! offsets are byte offsets into `data`; counts are element counts
//! (f32 for attributes, u32 for indices); all values are little-endian.
//! ```

use serde::Serialize;

pub const MAGIC: [u8; 4] = *b"PSM1";

/// One mesh to pack.
#[derive(Clone, Debug, Default)]
pub struct MeshInput<'a> {
    pub name: &'a str,
    pub material: Option<&'a str>,
    pub texture: Option<&'a str>,
    pub positions: &'a [f32],
    pub normals: &'a [f32],
    pub uvs: &'a [f32],
    pub indices: &'a [u32],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Span {
    offset: usize,
    count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MeshHeader<'a> {
    name: &'a str,
    material: Option<&'a str>,
    texture: Option<&'a str>,
    positions: Span,
    normals: Option<Span>,
    uvs: Option<Span>,
    indices: Span,
}

#[derive(Serialize)]
struct Header<'a> {
    meshes: Vec<MeshHeader<'a>>,
}

fn push_f32(data: &mut Vec<u8>, values: &[f32]) -> Span {
    let offset = data.len();
    data.reserve(values.len() * 4);
    for value in values {
        data.extend_from_slice(&value.to_le_bytes());
    }
    Span {
        offset,
        count: values.len(),
    }
}

/// Pack meshes into one buffer. Optional attributes whose length does not
/// match the vertex count are dropped instead of confusing the viewer.
pub fn pack(meshes: &[MeshInput<'_>]) -> Vec<u8> {
    let mut data = Vec::new();
    let mut headers = Vec::with_capacity(meshes.len());
    for mesh in meshes {
        let vertices = mesh.positions.len() / 3;
        let positions = push_f32(&mut data, &mesh.positions[..vertices * 3]);
        let normals = (mesh.normals.len() == vertices * 3 && vertices > 0).then(|| push_f32(&mut data, mesh.normals));
        let uvs = (mesh.uvs.len() == vertices * 2 && vertices > 0).then(|| push_f32(&mut data, mesh.uvs));
        let offset = data.len();
        let valid: Vec<u32> = mesh
            .indices
            .chunks_exact(3)
            .filter(|face| face.iter().all(|index| (*index as usize) < vertices))
            .flatten()
            .copied()
            .collect();
        for index in &valid {
            data.extend_from_slice(&index.to_le_bytes());
        }
        headers.push(MeshHeader {
            name: mesh.name,
            material: mesh.material,
            texture: mesh.texture,
            positions,
            normals,
            uvs,
            indices: Span {
                offset,
                count: valid.len(),
            },
        });
    }
    let header = serde_json::to_vec(&Header { meshes: headers }).expect("mesh header serializes");
    let mut out = Vec::with_capacity(8 + header.len() + 3 + data.len());
    out.extend_from_slice(&MAGIC);
    out.extend_from_slice(&(header.len() as u32).to_le_bytes());
    out.extend_from_slice(&header);
    while out.len() % 4 != 0 {
        out.push(b' ');
    }
    out.extend_from_slice(&data);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packs_header_and_aligned_data() {
        let positions = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let packed = pack(&[MeshInput {
            name: "tri",
            positions: &positions,
            uvs: &[0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
            normals: &[1.0],
            indices: &[0, 1, 2, 0, 1, 9],
            ..MeshInput::default()
        }]);
        assert_eq!(&packed[..4], b"PSM1");
        let header_len = u32::from_le_bytes(packed[4..8].try_into().unwrap()) as usize;
        let header: serde_json::Value = serde_json::from_slice(&packed[8..8 + header_len]).unwrap();
        let mesh = &header["meshes"][0];
        assert_eq!(mesh["positions"]["count"], 9);
        assert!(mesh["normals"].is_null(), "mismatched normals are dropped");
        assert_eq!(mesh["uvs"]["count"], 6);
        assert_eq!(mesh["indices"]["count"], 3, "faces with out-of-range indices are dropped");
        let data_start = (8 + header_len).div_ceil(4) * 4;
        assert_eq!(packed.len(), data_start + 9 * 4 + 6 * 4 + 3 * 4);
    }
}
