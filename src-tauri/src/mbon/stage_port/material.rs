// Machine readers start at AGENTS.md (Agent contract) and
//   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
// Licensed under PolyForm Shield 1.0.0; a competing product may not
//   reuse this file.
// Ne jamais remplacer ni supprimer les noms d'auteur de cet avis.
// Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Zdroj
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Autor kjjkjjzyayufqza. Producto EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este
//   archivo.

//! Over Boost stage materials for converted NUD materials.
//!
//! Every recipe mirrors entries of shipped Over Boost stages:
//!
//! | Recipe | `__nust__` shader | Source |
//! | --- | --- | --- |
//! | opaque | `vstgStandard_VertexColor` | color-only stage props (`docs/exvs-stage-numatb-simple-color.md`) |
//! | sky | `vsngSkydome` | `stage252`, `201stage201`, `210stage210` sky domes (no map fog tint) |
//! | sky, blended | `vsngSkyTransparent` | `203stage203` sky caps |
//! | blended | `vsngTransparent_BeforeEffect` | `203stage203` fog cards |
//!
//! The `__maya__` entry is the authoring mirror every shipped stage carries:
//! empty shader label, `DiffuseMap`, sampler, opaque blend state and the
//! rasterizer state (cull mode).

use std::path::Path;

use serde_json::{json, Value};
use ssbh_data::matl_data::{MatlData, MatlEntryData};

/// How a NUD material composes with the frame.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Surface {
    Opaque,
    /// Alpha test without blending (cut-outs).
    Cutout,
    /// Alpha blending (`SrcAlpha`, `OneMinusSrcAlpha`).
    Blend,
    /// Additive blending (`SrcAlpha`, `One`).
    Additive,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct MaterialKey {
    /// nutexb stem of the color texture.
    pub texture: String,
    pub surface: Surface,
    pub double_sided: bool,
    pub sky: bool,
    /// The native SkyTransparent shaders have no vertex color input.
    pub vertex_opacity: bool,
}

/// NUD blend factors follow the Smash 4 NUD convention: destination 0 = Zero
/// (opaque), 1 = OneMinusSrcAlpha, 2 = One; alpha test `2` enables a test.
pub fn surface_of(src_factor: u16, dst_factor: u16, alpha_test: i8) -> Surface {
    match (src_factor, dst_factor) {
        (0, 0) if alpha_test != 0 => Surface::Cutout,
        (0, 0) => Surface::Opaque,
        (_, 2) => Surface::Additive,
        _ => Surface::Blend,
    }
}

/// True when the NUD material reads its texture alpha as coverage. The
/// material flags nibble `0x00F0_0000` picks the MBON shader: over all 42 stages
/// nibbles 1..3 carry cutout and decal alpha (25..85 % of their textures are
/// mostly opaque in alpha), nibbles 0 and 4..A carry masks (no texture is
/// mostly opaque in alpha, and blended ones would vanish: practice outer floor,
/// 0x1144, is solid in game). Masked materials take their opacity from the
/// vertex alpha alone.
pub fn texture_alpha_is_coverage(flags: u32) -> bool {
    matches!((flags >> 20) & 0xF, 1..=3)
}

fn sampler(wrap_r: &str, border: [f32; 4]) -> Value {
    json!({
        "param_id": "DiffuseSampler",
        "data": {
            "wraps": "Repeat",
            "wrapt": "Repeat",
            "wrapr": wrap_r,
            "min_filter": "LinearMipmapLinear",
            "mag_filter": "Linear",
            "border_color": {"r": border[0], "g": border[1], "b": border[2], "a": border[3]},
            "lod_bias": 0.0,
            "max_anisotropy": "One"
        }
    })
}

fn blend_state(source: &str, destination: &str, destination_alpha: &str) -> Value {
    json!({
        "param_id": "BlendState0",
        "data": {
            "source_color": source,
            "color_operation": "Add",
            "destination_color": destination,
            "source_alpha": "One",
            "alpha_operation": "Add",
            "destination_alpha": destination_alpha,
            "alpha_sample_to_coverage": false
        }
    })
}

fn identity_uv_transform() -> Value {
    json!({
        "param_id": "DiffuseUvTransform",
        "data": {"scale_u": 1.0, "scale_v": 1.0, "rotation": 0.0, "translate_u": 0.0, "translate_v": 0.0}
    })
}

fn texture_path(stem: &str) -> String {
    format!("../../textures/{stem}")
}

fn entry(label: &str, shader: &str, fields: Value) -> Result<MatlEntryData, String> {
    let mut value = json!({
        "material_label": label,
        "shader_label": shader,
        "blend_states": [],
        "floats": [],
        "float1s": [],
        "booleans": [],
        "vectors": [],
        "colors": [],
        "rasterizer_states": [],
        "samplers": [],
        "textures": [],
        "textures2": [],
        "texture_arrays": [],
        "type4_v16": [],
        "type4_v15": [],
        "uv_transforms": []
    });
    let object = value.as_object_mut().expect("literal object");
    for (key, field) in fields.as_object().expect("literal object") {
        object.insert(key.clone(), field.clone());
    }
    serde_json::from_value(value).map_err(|error| format!("material '{label}': {error}"))
}

fn nust_entry(label: &str, key: &MaterialKey) -> Result<MatlEntryData, String> {
    let texture = texture_path(&key.texture);
    let blended = matches!(key.surface, Surface::Blend | Surface::Additive | Surface::Cutout);
    let destination = if key.surface == Surface::Additive { "One" } else { "OneMinusSourceAlpha" };
    if key.sky {
        if blended {
            if key.vertex_opacity {
                return entry(label, "vsngTransparent_BeforeEffect", json!({
                    "textures": [{"param_id":"DiffuseMap","data":texture}],
                    "blend_states":[blend_state("SourceAlpha",destination,"OneMinusSourceAlpha")],
                    "uv_transforms":[identity_uv_transform()]
                }));
            }
            return entry(
                label,
                "vsngSkyTransparent",
                json!({
                    "textures": [{"param_id": "DiffuseMap", "data": texture}],
                    "blend_states": [blend_state("SourceAlpha", destination, "OneMinusSourceAlpha")]
                }),
            );
        }
        // `vsngSkydomeFog` adds the stage fog of `graphic_param.csv` (owner's
        // in-game test: far too bright and blue); shipped sky domes use
        // `vsngSkydome`, which shows the map as authored.
        return entry(
            label,
            "vsngSkydome",
            json!({"textures": [{"param_id": "DiffuseMap", "data": texture}]}),
        );
    }
    if blended {
        return entry(
            label,
            "vsngTransparent_BeforeEffect",
            json!({
                "textures": [{"param_id": "DiffuseMap", "data": texture}],
                "blend_states": [blend_state("SourceAlpha", destination, "OneMinusSourceAlpha")],
                "uv_transforms": [identity_uv_transform()]
            }),
        );
    }
    // Shipped OB base and object materials receive unit and object shadows only
    // with `ReceiveShadow` (FeStandard 157 of 202, Blend2VC stage shaders all).
    entry(
        label,
        "vstgStandard_VertexColor",
        json!({
            "textures": [{"param_id": "BaseColorMap", "data": texture}],
            "booleans": [
                {"param_id": "UseBaseColorMap", "data": true},
                {"param_id": "ReceiveShadow", "data": true}
            ],
            "samplers": [sampler("Repeat", [0.0; 4])]
        }),
    )
}

fn maya_entry(label: &str, key: &MaterialKey) -> Result<MatlEntryData, String> {
    let cull = if key.double_sided { "Disabled" } else { "Back" };
    entry(
        label,
        "",
        json!({
            "booleans": [{"param_id": "UseDiffuseUvTransform", "data": true}],
            "float1s": [{"param_id": "CosinePower", "data": 20.0}],
            "colors": [
                {"param_id": "Diffuse", "data": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0}},
                {"param_id": "Specular", "data": {"r": 0.5, "g": 0.5, "b": 0.5, "a": 1.0}}
            ],
            "textures": [{"param_id": "DiffuseMap", "data": texture_path(&key.texture)}],
            "samplers": [sampler("ClampToEdge", [0.5, 0.5, 0.5, 1.0])],
            "blend_states": [blend_state("One", "Zero", "Zero")],
            "rasterizer_states": [{
                "param_id": "RasterizerState0",
                "data": {"fill_mode": "Solid", "cull_mode": cull, "depth_bias": 0.0}
            }],
            "uv_transforms": [identity_uv_transform()]
        }),
    )
}

/// `(__nust__, __maya__)` material files for `materials` (label, key) in order.
pub fn build_matl_pair(materials: &[(String, MaterialKey)]) -> Result<(MatlData, MatlData), String> {
    let mut nust = Vec::with_capacity(materials.len());
    let mut maya = Vec::with_capacity(materials.len());
    for (label, key) in materials {
        nust.push(nust_entry(label, key)?);
        maya.push(maya_entry(label, key)?);
    }
    let wrap = |entries| MatlData {
        major_version: 1,
        minor_version: 6,
        entries,
    };
    Ok((wrap(nust), wrap(maya)))
}

pub fn read_matl(path: &Path) -> Result<MatlData, String> {
    MatlData::from_file(path).map_err(|error| format!("{}: {error}", path.display()))
}
