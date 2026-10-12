/*
    ................................................
    Pesquisa MBON: toda vinda do BoostStudio de descatal
      (https://github.com/descatal/BoostStudio).
    Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
    Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
    Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
      https://github.com/kjjkjjzyayufqza/exvs-mod-project
    No elimines ni sustituyas los nombres de autor de este aviso.
    代码许可为 PolyForm Shield 1.0.0，使用政策见 ACCEPTABLE_USE.md。
    ................................................
*/

//! VCL collision to Over Boost Havok `.hkt` (map_hit / border_hit).
//!
//! VCL triangles are in stage space, Y up, the same units as the models, so
//! their complete triangle topology is retained. High-precision shared vertices
//! and conservative decoded-coordinate bounds avoid quantization seams; multi-body
//! splitting keeps shape keys in range. Havok `hctStandAloneFilterManager` writes
//! the binary tagfile.

use exvs_mbon::vcl::Vcl;

use crate::collision_mesh::{author_collision_shapes, CollisionSimplifyOptions, CollisionTriMesh};
use crate::havok_cli::HavokCliConfig;
use crate::havok_collision_encode::convert_xml_string_to_hkt;
use crate::havok_mesh_encode::build_authored_collision_set_xml_shared_vertices_scaled;

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollisionReport {
    pub source_triangles: usize,
    pub hkt_triangles: usize,
    pub shapes: usize,
    pub bytes: usize,
}

/// Merge VCL files into one triangle mesh. Object collision stays in object
/// space like the object models: the placement row carries the transform.
pub fn vcl_mesh(blobs: &[Vec<u8>]) -> Result<CollisionTriMesh, String> {
    let mut mesh = CollisionTriMesh {
        vertices: Vec::new(),
        indices: Vec::new(),
    };
    for blob in blobs {
        let vcl = Vcl::parse(blob).map_err(|error| error.to_string())?;
        let part = vcl.mesh();
        let base = mesh.vertices.len() as u32;
        mesh.vertices
            .extend(part.vertices.iter().map(|vertex| vertex.map(f64::from)));
        mesh.indices
            .extend(part.triangles.iter().flat_map(|triangle| triangle.map(|index| base + index)));
    }
    Ok(mesh)
}

pub fn havok_filter_manager() -> Result<String, String> {
    let config = HavokCliConfig::detect().ok_or("Havok Content Tools are not installed (C:\\Program Files\\Havok\\HavokContentTools)")?;
    if !std::path::Path::new(&config.filter_manager_path).is_file() {
        return Err(format!("{} not found", config.filter_manager_path));
    }
    Ok(config.filter_manager_path)
}

/// Build a binary HKT for `mesh`.
pub fn mesh_to_hkt(mesh: &CollisionTriMesh, filter_manager: &str) -> Result<(Vec<u8>, CollisionReport), String> {
    if mesh.indices.is_empty() {
        return Err("collision mesh has no triangles".into());
    }
    let authored = author_collision_shapes(mesh, &stage_collision_options())?;
    let xml = build_authored_collision_set_xml_shared_vertices_scaled(&authored, 1.0)?;
    let bytes = convert_xml_string_to_hkt(filter_manager, &xml)?;
    let report = CollisionReport {
        source_triangles: mesh.triangle_count(),
        hkt_triangles: authored.triangle_count(),
        shapes: authored.shape_count(),
        bytes: bytes.len(),
    };
    Ok((bytes, report))
}

/// Imported VCL collision policy (kept separate from interactive mesh authoring).
pub fn stage_collision_options() -> CollisionSimplifyOptions {
    // VCL already supplies the game's authored collision topology. The UI's
    // 15-degree merge tolerance can flatten creases and change a bent pair's
    // diagonal. Preserve every source face; retain only the safe shape-key split.
    CollisionSimplifyOptions {
        enabled: false,
        quad_merge_enabled: false,
        min_triangle_area: 0.0,
        weld_epsilon: 0.0,
        ..CollisionSimplifyOptions::default()
    }
}
