from pathlib import Path

src = Path(r"E:/research/ssbh_editor/src/export/dae.rs").read_text(encoding="utf-8").splitlines()

header = """use anyhow::{anyhow, Result};
use ssbh_data::mesh_data::{MeshData, VectorData};
use ssbh_data::skel_data::SkelData;
use std::collections::{BTreeMap, HashMap};
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

"""

structs = "\n".join(src[26:60])

build_fn = """
fn build_json_scene_from_ssbh(
    mesh_data: &MeshData,
    skel: Option<&SkelData>,
    config: &DaeExportConfig,
) -> Result<JsonScene> {
    if mesh_data.objects.is_empty() {
        return Err(anyhow!("No mesh objects to export"));
    }

    let mut meshes: Vec<JsonMeshObject> = Vec::with_capacity(mesh_data.objects.len());
    for obj in &mesh_data.objects {
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
pub fn export_ssbh_bundle_to_dae(
    mesh_data: &MeshData,
    skel: Option<&SkelData>,
    output_path: &Path,
    config: &DaeExportConfig,
) -> Result<()> {
    let json_scene = build_json_scene_from_ssbh(mesh_data, skel, config)?;
"""

collada_fn = "\n".join(src[163:293])
if not collada_fn.startswith("    // Build DOM"):
    raise SystemExit("Unexpected export/dae.rs layout; update build_dae_export.py")
collada_fn_fixed = collada_fn

helpers = "\n".join(src[295:897])

out = (
    header
    + structs
    + "\n\n"
    + build_fn
    + collada_fn_fixed
    + "\n}\n\n"
    + helpers
)

Path(r"E:/TAURI_PROJECT/src-tauri/src/ssbh_dae/dae_export.rs").write_text(out, encoding="utf-8")
print("OK", len(out))
