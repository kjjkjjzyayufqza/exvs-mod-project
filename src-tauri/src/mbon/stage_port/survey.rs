/*
 * Pesquisa MBON: toda vinda do BoostStudio de descatal
 *   (https://github.com/descatal/BoostStudio).
 * Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
 * Autor kjjkjjzyayufqza. Produs EXVS Mod Project. Sursa
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * In afara arborelui EXVS Mod Project, nu continua portarea.
 * Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.
 * Coding agents: read the Agent contract at the top of AGENTS.md
 *   before editing.
 * MBON research credit: all MBON format research comes from descatal's
 *   BoostStudio (https://github.com/descatal/BoostStudio).
 */

//! Read-only summaries of MBON stage packages (agent research and reports).

use std::collections::BTreeMap;
use std::path::Path;

use exvs_mbon::ntp3::Ntp3;
use exvs_mbon::nud::Nud;
use exvs_mbon::stage::{StageModelRole, StagePackage};
use exvs_mbon::vcl::Vcl;
use serde::Serialize;

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleSummary {
    pub models: usize,
    pub polygons: usize,
    pub vertices: usize,
    pub triangles: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureSummary {
    pub texture_id: String,
    pub format: String,
    pub width: u16,
    pub height: u16,
    pub mips: usize,
    pub cube_map: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectSummary {
    pub index: usize,
    pub durability: String,
    pub animated: bool,
    pub parts: usize,
    pub nuds: usize,
    pub collisions: usize,
    pub placements: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSummary {
    pub roles: BTreeMap<String, RoleSummary>,
    /// Material property tuples (`flags src dst alphaTest alphaFunc refAlpha cull textures`) with counts.
    pub materials: BTreeMap<String, usize>,
    /// Polygon vertex layouts (`geometry bone color uvCount half`) with counts.
    pub vertex_layouts: BTreeMap<String, usize>,
    /// Vertex color channel range over every stage model (RGBA, 1.0 = byte 0x7F).
    pub color_min: [f32; 4],
    pub color_max: [f32; 4],
    pub hit_triangles: usize,
    pub wall_triangles: usize,
    pub hit_surface_kinds: BTreeMap<u32, usize>,
    pub textures: Vec<TextureSummary>,
    pub environment_textures: Vec<TextureSummary>,
    pub missing_texture_ids: Vec<String>,
    pub objects: Vec<ObjectSummary>,
    pub effect_placements: usize,
    pub effect_ids: Vec<String>,
    pub spawn_plan: exvs_mbon::stage::SpawnPlan,
    pub graphic_param_words: usize,
}

fn textures(bytes: &[u8]) -> Result<Vec<TextureSummary>, String> {
    let ntp3 = Ntp3::parse(bytes).map_err(|error| error.to_string())?;
    Ok(ntp3
        .textures
        .iter()
        .map(|texture| TextureSummary {
            texture_id: format!("0x{:08X}", texture.texture_id),
            format: texture.format_label(),
            width: texture.width,
            height: texture.height,
            mips: texture.mip_count(),
            cube_map: texture.cube_map,
        })
        .collect())
}

fn role_key(role: StageModelRole) -> String {
    role.manifest_key().to_string()
}

pub fn summarize(path: &Path) -> Result<StageSummary, String> {
    let stage = StagePackage::read_path(path).map_err(|error| error.to_string())?;
    let mut roles: BTreeMap<String, RoleSummary> = BTreeMap::new();
    let mut materials = BTreeMap::new();
    let mut vertex_layouts = BTreeMap::new();
    let mut color_min = [f32::MAX; 4];
    let mut color_max = [f32::MIN; 4];
    let mut used_ids = Vec::new();
    for model in &stage.models {
        let nud = Nud::parse(&model.bytes).map_err(|error| format!("{:?} entry {}: {error}", model.role, model.entry))?;
        let summary = roles.entry(role_key(model.role)).or_default();
        summary.models += 1;
        for polygon in nud.polysets.iter().flat_map(|set| &set.polygons) {
            summary.polygons += 1;
            summary.vertices += usize::from(polygon.vertex_count);
            summary.triangles += polygon.triangle_count;
            *vertex_layouts
                .entry(format!(
                    "geometry {} bone {} color {} uv {} half {}",
                    polygon.geometry_type, polygon.bone_type, polygon.color_type, polygon.uv_count, polygon.uv_half
                ))
                .or_insert(0) += 1;
            for material in &polygon.materials {
                *materials
                    .entry(format!(
                        "flags 0x{:08X} src {} dst {} alphaTest {} alphaFunc {} ref {} cull 0x{:X} textures {}",
                        material.flags,
                        material.src_factor,
                        material.dst_factor,
                        material.alpha_test,
                        material.alpha_function,
                        material.ref_alpha,
                        material.cull_mode,
                        material.textures.len()
                    ))
                    .or_insert(0) += 1;
                used_ids.extend(material.textures.iter().map(|texture| texture.texture_id));
            }
        }
        for mesh in nud.mesh_buffers(&model.bytes).map_err(|error| error.to_string())? {
            for color in mesh.colors.chunks_exact(4) {
                for channel in 0..4 {
                    color_min[channel] = color_min[channel].min(color[channel]);
                    color_max[channel] = color_max[channel].max(color[channel]);
                }
            }
        }
    }
    for (index, object) in stage.objects.iter().enumerate() {
        for bytes in object.parts.iter().flat_map(|part| &part.nuds) {
            let nud = Nud::parse(bytes).map_err(|error| format!("object {index}: {error}"))?;
            for material in nud.polysets.iter().flat_map(|set| &set.polygons).flat_map(|polygon| &polygon.materials) {
                used_ids.extend(material.textures.iter().map(|texture| texture.texture_id));
            }
        }
    }
    let collision = |blobs: &[Vec<u8>]| -> Result<(usize, BTreeMap<u32, usize>), String> {
        let mut triangles = 0;
        let mut kinds = BTreeMap::new();
        for blob in blobs {
            let vcl = Vcl::parse(blob).map_err(|error| error.to_string())?;
            triangles += vcl.triangle_count();
            for group in &vcl.groups {
                *kinds.entry(group.surface_kind).or_insert(0) += group.triangles.len();
            }
        }
        Ok((triangles, kinds))
    };
    let (hit_triangles, hit_surface_kinds) = collision(&stage.hit_collisions)?;
    let (wall_triangles, _) = collision(&stage.wall_collisions)?;
    let texture_list = textures(&stage.textures)?;
    let known: std::collections::HashSet<String> = texture_list.iter().map(|texture| texture.texture_id.clone()).collect();
    used_ids.sort_unstable();
    used_ids.dedup();
    let missing_texture_ids = used_ids
        .iter()
        .map(|id| format!("0x{id:08X}"))
        .filter(|id| !known.contains(id))
        .collect();
    let objects = stage
        .objects
        .iter()
        .enumerate()
        .map(|(index, object)| ObjectSummary {
            index,
            durability: object.durability.clone(),
            animated: object.animated,
            parts: object.parts.len(),
            nuds: object.parts.iter().map(|part| part.nuds.len()).sum(),
            collisions: object.parts.iter().map(|part| part.collisions.len()).sum(),
            placements: stage
                .placements
                .objects
                .iter()
                .filter(|placement| placement.object == index)
                .count(),
        })
        .collect();
    let mut effect_ids: Vec<String> = stage
        .placements
        .effects
        .iter()
        .map(|effect| effect.effect.clone())
        .collect();
    effect_ids.sort();
    effect_ids.dedup();
    Ok(StageSummary {
        effect_placements: stage.placements.effects.len(),
        effect_ids,
        roles,
        materials,
        vertex_layouts,
        color_min,
        color_max,
        hit_triangles,
        wall_triangles,
        hit_surface_kinds,
        textures: texture_list,
        environment_textures: textures(&stage.environment_textures)?,
        missing_texture_ids,
        objects,
        spawn_plan: stage.spawn_plan.clone(),
        graphic_param_words: stage.graphic_param.words.len(),
    })
}
