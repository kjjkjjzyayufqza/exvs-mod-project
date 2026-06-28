use anyhow::{anyhow, Result};
use serde::Serialize;
use ssbh_data::matl_data::{MatlData, ParamId};
use ssbh_data::mesh_data::{MeshData, VectorData};
use ssbh_data::modl_data::ModlData;
use ssbh_data::skel_data::SkelData;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::ffi::OsStr;
use std::fmt::Write as FmtWrite;
use std::io::Write;
use std::path::{Path, PathBuf};
use xmltree::{Element, XMLNode};

use crate::nutexb_lib;
use crate::ssbh_preview::resolve_nutexb_path;

use super::dae_parse::UpAxisConversion;

/// Configuration for DAE export from SSBH mesh data
#[derive(Debug, Clone)]
pub struct DaeExportConfig {
    pub up_axis: UpAxisConversion,
    pub scale_factor: f32,
    /// Mirror UV horizontally: `u -> 1.0 - u`.
    pub flip_uv_u: bool,
    /// Mirror UV vertically: `v -> 1.0 - v` (often needed for Maya vs OpenGL-style UVs).
    pub flip_uv_v: bool,
}

impl Default for DaeExportConfig {
    fn default() -> Self {
        Self {
            up_axis: UpAxisConversion::YUp,
            scale_factor: 1.0,
            flip_uv_u: false,
            flip_uv_v: true,
        }
    }
}

#[derive(Debug, Clone)]
struct JsonVertexWeight {
    vertex_index: u32,
    vertex_weight: f32,
}

#[derive(Debug, Clone)]
struct JsonBoneInfluence {
    bone_name: String,
    vertex_weights: Vec<JsonVertexWeight>,
}

#[derive(Debug, Clone)]
struct JsonMeshObject {
    name: String,
    original_name: String,
    original_subindex: u64,
    vertex_indices: Vec<u32>,
    positions: Vec<[f32; 3]>,
    normals: Option<Vec<[f32; 3]>>,
    texcoords0: Option<Vec<[f32; 2]>>,
    bone_influences: Vec<JsonBoneInfluence>,
}

#[derive(Debug, Clone)]
struct JsonBone {
    name: String,
    transform: [[f32; 4]; 4],
    parent_index: Option<usize>,
}

#[derive(Debug, Clone)]
struct JsonScene {
    meshes: Vec<JsonMeshObject>,
    bones: Vec<JsonBone>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDaeStats {
    pub objects_exported: usize,
    pub triangles_exported: usize,
    pub textures_exported: usize,
}

/// When set, resolves numatb textures to PNG next to the `.dae` and wires `library_images` / materials.
#[derive(Debug, Clone)]
pub struct DaeMaterialTextureExport<'a> {
    pub root_canon: &'a Path,
    pub output_dir: &'a Path,
    pub modl: &'a ModlData,
    pub matl: &'a MatlData,
}

#[derive(Debug, Clone)]
struct MaterialNodeDef {
    material_id: String,
    effect_id: String,
    image_id: String,
    png_rel: String,
    /// Absolute `file:///...` URI for `<image><init_from>` (Maya often ignores relative paths).
    image_init_from_uri: String,
}

fn matl_entry_for_label<'a>(
    matl: &'a MatlData,
    label: &str,
) -> Option<&'a ssbh_data::matl_data::MatlEntryData> {
    matl.entries.iter().find(|e| e.material_label == label)
}

fn modl_material_label(modl: &ModlData, mesh_name: &str, subindex: u64) -> Result<String> {
    modl.entries
        .iter()
        .find(|e| e.mesh_object_name == mesh_name && e.mesh_object_subindex == subindex)
        .map(|e| e.material_label.clone())
        .ok_or_else(|| {
            anyhow!(
                "No numdlb entry for mesh object '{}' subindex {}",
                mesh_name,
                subindex
            )
        })
}

fn param_texture_ref(entry: &ssbh_data::matl_data::MatlEntryData, id: ParamId) -> Option<&str> {
    entry
        .textures
        .iter()
        .find(|t| t.param_id == id)
        .map(|t| t.data.as_str())
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            entry
                .textures2
                .iter()
                .find(|t| t.param_id == id)
                .map(|t| t.data.as_str())
                .filter(|s| !s.trim().is_empty())
        })
}

fn is_likely_cube_map(s: &str) -> bool {
    let l = s.to_ascii_lowercase();
    l.contains("cube") || l.contains("cubemap") || l.contains("ibl")
}

/// Lowercase filename stem for path tokens (aligned with meshFromSsbh `textureRefStemLower`).
fn texture_ref_stem_lower(s: &str) -> String {
    let p = s.replace('\\', "/");
    let seg = p.split('/').filter(|x| !x.is_empty()).last().unwrap_or(s);
    Path::new(seg)
        .file_stem()
        .and_then(|x| x.to_str())
        .unwrap_or(seg)
        .to_ascii_lowercase()
}

fn is_likely_non_albedo_texture_ref(s: &str) -> bool {
    let b = texture_ref_stem_lower(s);
    const TOKENS: &[&str] = &[
        "roughnessandmask",
        "roughness",
        "andmask",
        "_mask",
        "metalness",
        "metallic",
        "_orm",
        "ormpack",
        "normalmap",
        "_normal",
        "normal",
        "_nor",
        "_nrm",
        "nor_",
        "nrm_",
        "bump",
        "specular",
        "_spec",
        "spec_",
        "occlusion",
        "ambientocclusion",
        "_ao",
        "aomap",
        "height",
        "displace",
        "prm",
        "mrao",
        "mra",
    ];
    TOKENS.iter().any(|t| b.contains(t))
}

fn is_likely_albedo_texture_ref(s: &str) -> bool {
    let b = texture_ref_stem_lower(s);
    const TOKENS: &[&str] = &[
        "albedo",
        "basecolor",
        "base_color",
        "diffuse",
        "_dif",
        "_col",
        "color",
        "tex_",
        "_tex",
        "decal",
    ];
    TOKENS.iter().any(|t| b.contains(t))
}

/// EXVS-style PBR filenames (`pbr1_basecolor`, etc.); scans all texture slots like meshFromSsbh `pickExvsPbrTextureRefs`.
fn pick_exvs_pbr_base_ref(entry: &ssbh_data::matl_data::MatlEntryData) -> Option<&str> {
    for t in entry.textures.iter().chain(entry.textures2.iter()) {
        let r = t.data.trim();
        if r.is_empty() {
            continue;
        }
        let b = texture_ref_stem_lower(r);
        if b.contains("pbr1_basecolor") {
            return Some(r);
        }
    }
    for t in entry.textures.iter().chain(entry.textures2.iter()) {
        let r = t.data.trim();
        if r.is_empty() {
            continue;
        }
        let b = texture_ref_stem_lower(r);
        if b.contains("pbr2_basecolor") {
            return Some(r);
        }
    }
    for t in entry.textures.iter().chain(entry.textures2.iter()) {
        let r = t.data.trim();
        if r.is_empty() {
            continue;
        }
        let b = texture_ref_stem_lower(r);
        if (b.contains("basecolor") || b.contains("base_color") || b.contains("_albedo"))
            && !b.contains("roughnessandmask")
        {
            return Some(r);
        }
    }
    None
}

/// Same resolution order as meshFromSsbh `resolveMaterialTexturePaths` base: exvs base, DiffuseMap, then ordered slots with non-albedo heuristics.
fn pick_base_color_texture_ref(entry: &ssbh_data::matl_data::MatlEntryData) -> Option<&str> {
    if let Some(r) = pick_exvs_pbr_base_ref(entry) {
        if !is_likely_cube_map(r) {
            return Some(r);
        }
    }
    if let Some(r) = param_texture_ref(entry, ParamId::DiffuseMap) {
        if !is_likely_cube_map(r) {
            return Some(r);
        }
    }
    const ORDER: &[ParamId] = &[
        ParamId::Texture0,
        ParamId::Texture1,
        ParamId::Texture3,
        ParamId::Texture4,
        ParamId::Texture5,
    ];
    for &id in ORDER {
        if let Some(r) = param_texture_ref(entry, id) {
            if !is_likely_cube_map(r) && !is_likely_non_albedo_texture_ref(r) {
                return Some(r);
            }
        }
    }
    for &id in ORDER {
        if let Some(r) = param_texture_ref(entry, id) {
            if !is_likely_cube_map(r) && is_likely_albedo_texture_ref(r) {
                return Some(r);
            }
        }
    }
    for &id in ORDER {
        if let Some(r) = param_texture_ref(entry, id) {
            if !is_likely_cube_map(r) {
                return Some(r);
            }
        }
    }
    for t in entry.textures.iter().chain(entry.textures2.iter()) {
        let d = t.data.trim();
        if d.is_empty() || is_likely_cube_map(d) {
            continue;
        }
        if matches!(
            t.param_id,
            ParamId::Texture6 | ParamId::Texture2 | ParamId::Texture7 | ParamId::Texture8
        ) {
            continue;
        }
        return Some(t.data.as_str());
    }
    None
}

fn next_unique_png_name(stem: &str, used: &mut HashSet<String>) -> String {
    let base = sanitize_id(stem);
    let mut name = format!("{base}.png");
    let mut n = 0u32;
    while used.contains(&name) {
        n += 1;
        name = format!("{base}_{n}.png");
    }
    used.insert(name.clone());
    name
}

fn run_texture_export_plan(
    ctx: &DaeMaterialTextureExport<'_>,
    json_scene: &JsonScene,
) -> Result<(Vec<Option<(String, String)>>, Vec<MaterialNodeDef>, usize)> {
    let mut used_png_names: HashSet<String> = HashSet::new();
    let mut nutexb_to_rel_png: HashMap<PathBuf, String> = HashMap::new();
    let mut exported_nutexb: HashSet<PathBuf> = HashSet::new();
    let mut textures_exported: usize = 0;

    let mut per_mesh: Vec<Option<(String, String)>> = vec![None; json_scene.meshes.len()];
    let mut mat_nodes: Vec<MaterialNodeDef> = Vec::new();
    let mut mat_key_to_index: HashMap<String, usize> = HashMap::new();

    for (mesh_index, mesh) in json_scene.meshes.iter().enumerate() {
        let mat_label = modl_material_label(ctx.modl, &mesh.original_name, mesh.original_subindex)?;
        let entry = matl_entry_for_label(ctx.matl, &mat_label)
            .ok_or_else(|| anyhow!("No numatb entry for material label '{}'", mat_label))?;
        let tex_ref = pick_base_color_texture_ref(entry).ok_or_else(|| {
            anyhow!(
                "No usable diffuse texture in numatb for material '{}'",
                mat_label
            )
        })?;
        let nutexb_abs = resolve_nutexb_path(ctx.root_canon, tex_ref)
            .map_err(|e| anyhow!(e))?
            .ok_or_else(|| {
                anyhow!(
                    "Could not resolve nutexb on disk for material '{}': {}",
                    mat_label,
                    tex_ref
                )
            })?;

        let rel_png = nutexb_to_rel_png
            .entry(nutexb_abs.clone())
            .or_insert_with(|| {
                let stem = nutexb_abs
                    .file_stem()
                    .and_then(OsStr::to_str)
                    .unwrap_or("texture");
                next_unique_png_name(stem, &mut used_png_names)
            })
            .clone();

        let full_png = ctx.output_dir.join(&rel_png);
        if !exported_nutexb.contains(&nutexb_abs) {
            let src = nutexb_abs
                .to_str()
                .ok_or_else(|| anyhow!("Invalid nutexb path"))?;
            let dst = full_png
                .to_str()
                .ok_or_else(|| anyhow!("Invalid PNG output path"))?;
            nutexb_lib::export_nutexb_to_png(src, dst).map_err(|e| anyhow!(e))?;
            exported_nutexb.insert(nutexb_abs.clone());
            textures_exported += 1;
        }

        let mat_key = format!("{}|{}", mat_label, rel_png);
        let mat_idx = if let Some(&idx) = mat_key_to_index.get(&mat_key) {
            idx
        } else {
            let idx = mat_nodes.len();
            let image_init_from_uri = collada_absolute_file_uri(&full_png)?;
            mat_nodes.push(MaterialNodeDef {
                material_id: format!("material_{}", idx),
                effect_id: format!("effect_{}", idx),
                image_id: format!("image_{}", idx),
                png_rel: rel_png.clone(),
                image_init_from_uri,
            });
            mat_key_to_index.insert(mat_key, idx);
            idx
        };

        let symbol = format!("MAT_{mesh_index}");
        per_mesh[mesh_index] = Some((symbol, mat_nodes[mat_idx].material_id.clone()));
    }

    Ok((per_mesh, mat_nodes, textures_exported))
}

/// Absolute `file:///...` URI for COLLADA `<image><init_from>`. Maya's importer often fails on
/// relative paths when the scene is imported from a different working directory.
fn collada_absolute_file_uri(path: &Path) -> Result<String> {
    let abs = path.canonicalize().map_err(|e| {
        anyhow!(
            "Could not canonicalize texture path {}: {}",
            path.display(),
            e
        )
    })?;
    let mut s = abs
        .to_str()
        .ok_or_else(|| anyhow!("Texture path is not valid UTF-8: {}", abs.display()))?
        .to_string();
    if let Some(stripped) = s.strip_prefix("\\\\?\\") {
        s = stripped.to_string();
    }
    let s = s.replace('\\', "/");
    Ok(format!("file:///{}", s))
}

fn collada_color_element(r: f32, g: f32, b: f32, a: f32) -> Element {
    let mut c = Element::new("color");
    c.children.push(XMLNode::Text(format!(
        "{} {} {} {}",
        format_float(r),
        format_float(g),
        format_float(b),
        format_float(a)
    )));
    c
}

fn collada_profile_color_child(name: &str, r: f32, g: f32, b: f32, a: f32) -> Element {
    let mut e = Element::new(name);
    e.children
        .push(XMLNode::Element(collada_color_element(r, g, b, a)));
    e
}

fn collada_profile_float_child(name: &str, v: f32) -> Element {
    let mut e = Element::new(name);
    let mut f = Element::new("float");
    f.children.push(XMLNode::Text(format_float(v)));
    e.children.push(XMLNode::Element(f));
    e
}

fn build_library_images(nodes: &[MaterialNodeDef]) -> Element {
    let mut lib = Element::new("library_images");
    for n in nodes {
        let mut img = Element::new("image");
        img.attributes.insert("id".to_string(), n.image_id.clone());
        img.attributes.insert("name".to_string(), n.png_rel.clone());
        let mut init = Element::new("init_from");
        init.children
            .push(XMLNode::Text(n.image_init_from_uri.clone()));
        img.children.push(XMLNode::Element(init));
        lib.children.push(XMLNode::Element(img));
    }
    lib
}

/// Maya-friendly `profile_COMMON`: Lambert diffuse + file texture (not Phong-only), full color slots,
/// WRAP sampler, and `TEX0` bound to mesh `TEXCOORD` set 0 via `bind_vertex_input`.
fn build_maya_lambert_effect(effect_id: &str, image_id: &str) -> Element {
    let mut effect = Element::new("effect");
    effect
        .attributes
        .insert("id".to_string(), effect_id.to_string());
    let mut profile = Element::new("profile_COMMON");
    let mut newparam_surf = Element::new("newparam");
    newparam_surf
        .attributes
        .insert("sid".to_string(), "surface0".to_string());
    let mut surface = Element::new("surface");
    surface
        .attributes
        .insert("type".to_string(), "2D".to_string());
    let mut init_from = Element::new("init_from");
    // Maya sample files use the image id without a leading `#` in surface init_from.
    init_from.children.push(XMLNode::Text(image_id.to_string()));
    surface.children.push(XMLNode::Element(init_from));
    newparam_surf.children.push(XMLNode::Element(surface));
    profile.children.push(XMLNode::Element(newparam_surf));

    let mut newparam_samp = Element::new("newparam");
    newparam_samp
        .attributes
        .insert("sid".to_string(), "sampler0".to_string());
    let mut sampler2d = Element::new("sampler2D");
    let mut src = Element::new("source");
    src.children.push(XMLNode::Text("surface0".to_string()));
    sampler2d.children.push(XMLNode::Element(src));
    let mut wrap_s = Element::new("wrap_s");
    wrap_s.children.push(XMLNode::Text("WRAP".to_string()));
    sampler2d.children.push(XMLNode::Element(wrap_s));
    let mut wrap_t = Element::new("wrap_t");
    wrap_t.children.push(XMLNode::Text("WRAP".to_string()));
    sampler2d.children.push(XMLNode::Element(wrap_t));
    let mut minf = Element::new("minfilter");
    minf.children.push(XMLNode::Text("LINEAR".to_string()));
    sampler2d.children.push(XMLNode::Element(minf));
    let mut magf = Element::new("magfilter");
    magf.children.push(XMLNode::Text("LINEAR".to_string()));
    sampler2d.children.push(XMLNode::Element(magf));
    newparam_samp.children.push(XMLNode::Element(sampler2d));
    profile.children.push(XMLNode::Element(newparam_samp));

    let mut technique = Element::new("technique");
    technique
        .attributes
        .insert("sid".to_string(), "common".to_string());
    let mut lambert = Element::new("lambert");
    lambert
        .children
        .push(XMLNode::Element(collada_profile_color_child(
            "emission", 0.0, 0.0, 0.0, 1.0,
        )));
    lambert
        .children
        .push(XMLNode::Element(collada_profile_color_child(
            "ambient", 1.0, 1.0, 1.0, 1.0,
        )));
    let mut diffuse = Element::new("diffuse");
    let mut tex = Element::new("texture");
    tex.attributes
        .insert("texture".to_string(), "sampler0".to_string());
    tex.attributes
        .insert("texcoord".to_string(), "TEX0".to_string());
    diffuse.children.push(XMLNode::Element(tex));
    lambert.children.push(XMLNode::Element(diffuse));
    lambert
        .children
        .push(XMLNode::Element(collada_profile_color_child(
            "reflective",
            0.0,
            0.0,
            0.0,
            1.0,
        )));
    lambert
        .children
        .push(XMLNode::Element(collada_profile_float_child(
            "reflectivity",
            0.0,
        )));
    let mut transparent = Element::new("transparent");
    transparent
        .attributes
        .insert("opaque".to_string(), "A_ONE".to_string());
    transparent
        .children
        .push(XMLNode::Element(collada_color_element(1.0, 1.0, 1.0, 1.0)));
    lambert.children.push(XMLNode::Element(transparent));
    lambert
        .children
        .push(XMLNode::Element(collada_profile_float_child(
            "transparency",
            0.0,
        )));
    technique.children.push(XMLNode::Element(lambert));
    profile.children.push(XMLNode::Element(technique));
    effect.children.push(XMLNode::Element(profile));
    effect
}

fn build_library_effects(nodes: &[MaterialNodeDef]) -> Element {
    let mut lib = Element::new("library_effects");
    for n in nodes {
        lib.children
            .push(XMLNode::Element(build_maya_lambert_effect(
                &n.effect_id,
                &n.image_id,
            )));
    }
    lib
}

fn build_library_materials(nodes: &[MaterialNodeDef]) -> Element {
    let mut lib = Element::new("library_materials");
    for n in nodes {
        let mut m = Element::new("material");
        m.attributes.insert("id".to_string(), n.material_id.clone());
        m.attributes
            .insert("name".to_string(), n.material_id.clone());
        let mut inst = Element::new("instance_effect");
        inst.attributes
            .insert("url".to_string(), format!("#{}", n.effect_id));
        m.children.push(XMLNode::Element(inst));
        let mut extra = Element::new("extra");
        let mut maya_tech = Element::new("technique");
        maya_tech
            .attributes
            .insert("profile".to_string(), "MAYA".to_string());
        let mut ds = Element::new("double_sided");
        ds.children.push(XMLNode::Text("1".to_string()));
        maya_tech.children.push(XMLNode::Element(ds));
        extra.children.push(XMLNode::Element(maya_tech));
        m.children.push(XMLNode::Element(extra));
        lib.children.push(XMLNode::Element(m));
    }
    lib
}

fn build_bind_material(mat_symbol: &str, material_id: &str) -> Element {
    let mut bm = Element::new("bind_material");
    let mut tc = Element::new("technique_common");
    let mut im = Element::new("instance_material");
    im.attributes
        .insert("symbol".to_string(), mat_symbol.to_string());
    im.attributes
        .insert("target".to_string(), format!("#{material_id}"));
    let mut bvi = Element::new("bind_vertex_input");
    bvi.attributes
        .insert("semantic".to_string(), "TEX0".to_string());
    bvi.attributes
        .insert("input_semantic".to_string(), "TEXCOORD".to_string());
    bvi.attributes
        .insert("input_set".to_string(), "0".to_string());
    im.children.push(XMLNode::Element(bvi));
    tc.children.push(XMLNode::Element(im));
    bm.children.push(XMLNode::Element(tc));
    bm
}

fn build_json_scene_from_ssbh(
    mesh_data: &MeshData,
    skel: Option<&SkelData>,
    config: &DaeExportConfig,
    include_objects: Option<&HashSet<(String, u64)>>,
) -> Result<JsonScene> {
    if mesh_data.objects.is_empty() {
        return Err(anyhow!("No mesh objects to export"));
    }

    let mut meshes: Vec<JsonMeshObject> = Vec::with_capacity(mesh_data.objects.len());
    for obj in &mesh_data.objects {
        if let Some(set) = include_objects {
            if !set.is_empty() && !set.contains(&(obj.name.clone(), obj.subindex)) {
                continue;
            }
        }
        let mut positions = get_first_vec3(&obj.positions).ok_or_else(|| {
            anyhow!(
                "Mesh '{}' subindex {} has no positions",
                obj.name,
                obj.subindex
            )
        })?;
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
            .and_then(|a| vector_data_to_vec2(&a.data).ok())
            .map(|mut tc| {
                if config.flip_uv_u {
                    for uv in &mut tc {
                        uv[0] = 1.0 - uv[0];
                    }
                }
                if config.flip_uv_v {
                    for uv in &mut tc {
                        uv[1] = 1.0 - uv[1];
                    }
                }
                tc
            });

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
                    .map(|i| JsonVertexWeight {
                        vertex_index: i,
                        vertex_weight: 1.0,
                    })
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
            original_name: obj.name.clone(),
            original_subindex: obj.subindex,
            vertex_indices: obj.vertex_indices.clone(),
            positions,
            normals,
            texcoords0,
            bone_influences: influences,
        });
    }

    if meshes.is_empty() {
        return Err(anyhow!(
            "No mesh objects matched the export filter (check name/subindex selection)"
        ));
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
/// When `include_objects` is `Some` and non-empty, only `(name, subindex)` pairs in the set are written.
/// When `material_export` is set, exports diffuse nutexb textures as PNG next to the DAE and binds materials.
pub fn export_ssbh_bundle_to_dae(
    mesh_data: &MeshData,
    skel: Option<&SkelData>,
    output_path: &Path,
    config: &DaeExportConfig,
    include_objects: Option<&HashSet<(String, u64)>>,
    material_export: Option<&DaeMaterialTextureExport<'_>>,
) -> Result<ExportDaeStats> {
    let json_scene = build_json_scene_from_ssbh(mesh_data, skel, config, include_objects)?;
    let objects_exported = json_scene.meshes.len();
    let triangles_exported: usize = json_scene
        .meshes
        .iter()
        .map(|m| {
            let n = m.vertex_indices.len();
            if n % 3 == 0 {
                n / 3
            } else {
                0
            }
        })
        .sum();

    let (per_mesh_mat, mat_nodes, textures_exported) = if let Some(ctx) = material_export {
        let (per, nodes, ntex) = run_texture_export_plan(ctx, &json_scene)?;
        (Some(per), nodes, ntex)
    } else {
        (None, Vec::new(), 0usize)
    };

    // Build DOM
    let mut collada = Element::new("COLLADA");
    collada.attributes.insert(
        "xmlns".to_string(),
        "http://www.collada.org/2005/11/COLLADASchema".to_string(),
    );
    collada
        .attributes
        .insert("version".to_string(), "1.4.1".to_string());

    // <asset>
    collada.children.push(XMLNode::Element(build_asset(config)));

    if !mat_nodes.is_empty() {
        collada
            .children
            .push(XMLNode::Element(build_library_images(&mat_nodes)));
        collada
            .children
            .push(XMLNode::Element(build_library_effects(&mat_nodes)));
        collada
            .children
            .push(XMLNode::Element(build_library_materials(&mat_nodes)));
    }

    // <library_geometries> built from JSON intermediate
    let mut library_geometries = Element::new("library_geometries");
    for (mesh_index, mesh_object) in json_scene.meshes.iter().enumerate() {
        let mat_sym = per_mesh_mat
            .as_ref()
            .and_then(|v| v.get(mesh_index))
            .and_then(|o| o.as_ref().map(|(s, _)| s.as_str()));
        let geom = build_geometry_element_json(mesh_object, mesh_index, mat_sym)?;
        library_geometries.children.push(XMLNode::Element(geom));
    }
    collada.children.push(XMLNode::Element(library_geometries));

    // <library_controllers> (skinning) built from JSON intermediate
    let mut library_controllers = Element::new("library_controllers");
    if !json_scene.bones.is_empty() {
        let bone_name_to_index: BTreeMap<String, usize> = json_scene
            .bones
            .iter()
            .enumerate()
            .map(|(i, b)| (b.name.clone(), i))
            .collect();

        let inverse_bind_matrices = compute_inverse_bind_matrices_from_json(&json_scene.bones);

        for (mesh_index, mesh_object) in json_scene.meshes.iter().enumerate() {
            if mesh_object.bone_influences.is_empty() {
                continue;
            }

            let controller = build_controller_element_json(
                mesh_object,
                mesh_index,
                &json_scene.bones,
                &bone_name_to_index,
                &inverse_bind_matrices,
            )?;
            library_controllers
                .children
                .push(XMLNode::Element(controller));
        }
    }
    collada.children.push(XMLNode::Element(library_controllers));

    // <library_visual_scenes>
    let mut library_visual_scenes = Element::new("library_visual_scenes");
    let mut visual_scene = Element::new("visual_scene");
    visual_scene
        .attributes
        .insert("id".to_string(), "Scene".to_string());
    visual_scene
        .attributes
        .insert("name".to_string(), "Scene".to_string());

    // Skeleton nodes from JSON intermediate
    if !json_scene.bones.is_empty() {
        let mut children_map: HashMap<Option<usize>, Vec<usize>> = HashMap::new();
        for (i, bone) in json_scene.bones.iter().enumerate() {
            children_map.entry(bone.parent_index).or_default().push(i);
        }

        if let Some(root_children) = children_map.get(&None) {
            for &root_index in root_children {
                let node = build_skeleton_node_recursive_json(
                    &json_scene.bones,
                    root_index,
                    &children_map,
                );
                visual_scene.children.push(XMLNode::Element(node));
            }
        }
    }

    // Mesh instance nodes
    for (mesh_index, mesh_object) in json_scene.meshes.iter().enumerate() {
        let mut mesh_node = Element::new("node");
        mesh_node
            .attributes
            .insert("id".to_string(), format!("mesh_{}", mesh_index));
        mesh_node
            .attributes
            .insert("name".to_string(), mesh_object.name.clone());

        let controller_id = format!("ctrl_{}_{}", mesh_index, sanitize_id(&mesh_object.name));
        let geometry_id = format!("geom_{}_{}", mesh_index, sanitize_id(&mesh_object.name));

        if !mesh_object.bone_influences.is_empty() && !json_scene.bones.is_empty() {
            // Instance controller with skeleton root reference
            let mut inst_ctrl = Element::new("instance_controller");
            inst_ctrl
                .attributes
                .insert("url".to_string(), format!("#{}", controller_id));

            if let Some(root_index) = json_scene
                .bones
                .iter()
                .position(|b| b.parent_index.is_none())
            {
                let root_id = sanitize_id(&json_scene.bones[root_index].name);
                let mut skeleton_elem = Element::new("skeleton");
                skeleton_elem
                    .children
                    .push(XMLNode::Text(format!("#{}", root_id)));
                inst_ctrl.children.push(XMLNode::Element(skeleton_elem));
            }

            if let Some(ref rows) = per_mesh_mat {
                if let Some(Some((ref sym, ref mid))) = rows.get(mesh_index) {
                    inst_ctrl
                        .children
                        .push(XMLNode::Element(build_bind_material(sym, mid)));
                }
            }

            mesh_node.children.push(XMLNode::Element(inst_ctrl));

            // Skinned meshes remain at scene root to avoid double transforms
            visual_scene.children.push(XMLNode::Element(mesh_node));
        } else {
            // Instance geometry (rigid or unskinned)
            let mut inst_geom = Element::new("instance_geometry");
            inst_geom
                .attributes
                .insert("url".to_string(), format!("#{}", geometry_id));

            if let Some(ref rows) = per_mesh_mat {
                if let Some(Some((ref sym, ref mid))) = rows.get(mesh_index) {
                    inst_geom
                        .children
                        .push(XMLNode::Element(build_bind_material(sym, mid)));
                }
            }

            mesh_node.children.push(XMLNode::Element(inst_geom));

            // For rigid meshes, place at scene root (match GLTF exporter behavior)
            visual_scene.children.push(XMLNode::Element(mesh_node));
        }
    }

    library_visual_scenes
        .children
        .push(XMLNode::Element(visual_scene));
    collada
        .children
        .push(XMLNode::Element(library_visual_scenes));

    // <scene>
    let mut scene_elem = Element::new("scene");
    let mut inst_vs = Element::new("instance_visual_scene");
    inst_vs
        .attributes
        .insert("url".to_string(), "#Scene".to_string());
    scene_elem.children.push(XMLNode::Element(inst_vs));
    collada.children.push(XMLNode::Element(scene_elem));

    // Write file
    let mut file = std::fs::File::create(output_path)?;
    collada.write(&mut file)?;
    file.flush()?;

    Ok(ExportDaeStats {
        objects_exported,
        triangles_exported,
        textures_exported,
    })
}

fn build_geometry_element_json(
    mesh_object: &JsonMeshObject,
    mesh_index: usize,
    material_symbol: Option<&str>,
) -> Result<Element> {
    let positions = &mesh_object.positions;
    let normals = mesh_object.normals.as_ref();
    let texcoords = mesh_object.texcoords0.as_ref();
    let indices = &mesh_object.vertex_indices;

    let geom_id = format!("geom_{}_{}", mesh_index, sanitize_id(&mesh_object.name));

    let mut geometry = Element::new("geometry");
    geometry
        .attributes
        .insert("id".to_string(), geom_id.clone());
    geometry
        .attributes
        .insert("name".to_string(), mesh_object.name.clone());

    let mut mesh = Element::new("mesh");

    let pos_source_id = format!("{}-positions", geom_id);
    mesh.children.push(XMLNode::Element(build_source_float_vec3(
        &pos_source_id,
        positions,
    )));

    let normal_source_id = format!("{}-normals", geom_id);
    if let Some(norms) = normals {
        mesh.children.push(XMLNode::Element(build_source_float_vec3(
            &normal_source_id,
            norms,
        )));
    }

    let texcoord_source_id = format!("{}-texcoord0", geom_id);
    if let Some(uvs) = texcoords {
        mesh.children.push(XMLNode::Element(build_source_float_vec2(
            &texcoord_source_id,
            uvs,
        )));
    }

    // <vertices>
    let mut vertices = Element::new("vertices");
    let vertices_id = format!("{}-vertices", geom_id);
    vertices
        .attributes
        .insert("id".to_string(), vertices_id.clone());
    let mut input_pos = Element::new("input");
    input_pos
        .attributes
        .insert("semantic".to_string(), "POSITION".to_string());
    input_pos
        .attributes
        .insert("source".to_string(), format!("#{}", pos_source_id));
    vertices.children.push(XMLNode::Element(input_pos));
    mesh.children.push(XMLNode::Element(vertices));

    // <triangles>
    let input_count =
        1 + if normals.is_some() { 1 } else { 0 } + if texcoords.is_some() { 1 } else { 0 };
    let mut triangles = Element::new("triangles");
    triangles
        .attributes
        .insert("count".to_string(), format!("{}", indices.len() / 3));
    if let Some(ms) = material_symbol {
        triangles
            .attributes
            .insert("material".to_string(), ms.to_string());
    }

    let mut in_vtx = Element::new("input");
    in_vtx
        .attributes
        .insert("semantic".to_string(), "VERTEX".to_string());
    in_vtx
        .attributes
        .insert("source".to_string(), format!("#{}", vertices_id));
    in_vtx
        .attributes
        .insert("offset".to_string(), "0".to_string());
    triangles.children.push(XMLNode::Element(in_vtx));

    let mut current_offset = 1;
    if normals.is_some() {
        let mut in_n = Element::new("input");
        in_n.attributes
            .insert("semantic".to_string(), "NORMAL".to_string());
        in_n.attributes
            .insert("source".to_string(), format!("#{}", normal_source_id));
        in_n.attributes
            .insert("offset".to_string(), current_offset.to_string());
        triangles.children.push(XMLNode::Element(in_n));
        current_offset += 1;
    }

    if texcoords.is_some() {
        let mut in_t = Element::new("input");
        in_t.attributes
            .insert("semantic".to_string(), "TEXCOORD".to_string());
        in_t.attributes
            .insert("source".to_string(), format!("#{}", texcoord_source_id));
        in_t.attributes
            .insert("offset".to_string(), current_offset.to_string());
        in_t.attributes.insert("set".to_string(), "0".to_string());
        triangles.children.push(XMLNode::Element(in_t));
    }

    // Build <p> with original indices per input stream (no flattening)
    let mut p = Element::new("p");
    let est = indices.len().saturating_mul(input_count).saturating_mul(8);
    let mut p_text = String::with_capacity(est);
    let mut first_num = true;
    let push_idx = |n: u32, buf: &mut String, first: &mut bool| {
        if !*first {
            buf.push(' ');
        }
        *first = false;
        write!(buf, "{}", n).unwrap();
    };
    for &idx in indices {
        push_idx(idx, &mut p_text, &mut first_num);
        if normals.is_some() {
            push_idx(idx, &mut p_text, &mut first_num);
        }
        if texcoords.is_some() {
            push_idx(idx, &mut p_text, &mut first_num);
        }
    }
    p.children.push(XMLNode::Text(p_text));
    triangles.children.push(XMLNode::Element(p));

    mesh.children.push(XMLNode::Element(triangles));
    geometry.children.push(XMLNode::Element(mesh));
    Ok(geometry)
}

fn build_controller_element_json(
    mesh_object: &JsonMeshObject,
    mesh_index: usize,
    bones: &[JsonBone],
    bone_name_to_index: &BTreeMap<String, usize>,
    inverse_bind_matrices: &Vec<[f32; 16]>,
) -> Result<Element> {
    let geom_id = format!("geom_{}_{}", mesh_index, sanitize_id(&mesh_object.name));
    let ctrl_id = format!("ctrl_{}_{}", mesh_index, sanitize_id(&mesh_object.name));

    let mut controller = Element::new("controller");
    controller
        .attributes
        .insert("id".to_string(), ctrl_id.clone());

    let mut skin = Element::new("skin");
    skin.attributes
        .insert("source".to_string(), format!("#{}", geom_id));

    // bind_shape_matrix (identity)
    let mut bsm = Element::new("bind_shape_matrix");
    bsm.children.push(XMLNode::Text(matrix_to_string(&[
        1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    ])));
    skin.children.push(XMLNode::Element(bsm));

    // JOINTS source (names). Use bone "sid" strings (original names) to align with node SIDs.
    let joint_names: Vec<String> = bones.iter().map(|b| b.name.clone()).collect();
    let joint_source_id = format!("{}-joints", ctrl_id);
    skin.children.push(XMLNode::Element(build_source_name_array(
        &joint_source_id,
        &joint_names,
    )));

    // INV_BIND_MATRIX source
    let bind_pose_source_id = format!("{}-bind_poses", ctrl_id);
    skin.children.push(XMLNode::Element(build_source_mat4_array(
        &bind_pose_source_id,
        inverse_bind_matrices,
    )));

    // WEIGHTS source
    let weights_source_id = format!("{}-weights", ctrl_id);

    // Prepare vertex influences (top-4 per vertex, normalized)
    let vertex_count = mesh_object.positions.len();
    let mut vertex_influences: Vec<Vec<(usize, f32)>> = vec![Vec::new(); vertex_count];
    for influence in &mesh_object.bone_influences {
        if let Some(&bone_index) = bone_name_to_index.get(&influence.bone_name) {
            for vw in &influence.vertex_weights {
                let vtx = vw.vertex_index as usize;
                if vtx < vertex_count {
                    vertex_influences[vtx].push((bone_index, vw.vertex_weight));
                }
            }
        }
    }

    // Build vcount and v streams, and collect weights array (O(1) lookup per weight via quantized key)
    let mut weights: Vec<f32> = Vec::new();
    let mut weight_key_to_index: HashMap<i32, usize> = HashMap::new();
    let mut vcount_values: Vec<usize> = Vec::with_capacity(vertex_count);
    let mut v_values: Vec<i32> = Vec::new();

    let weight_index_for_value = |w: f32, weights: &mut Vec<f32>, map: &mut HashMap<i32, usize>| {
        let k = weight_quant_key(w);
        if let Some(&i) = map.get(&k) {
            return i;
        }
        let i = weights.len();
        weights.push(w);
        map.insert(k, i);
        i
    };

    for influences in vertex_influences.iter_mut() {
        if influences.is_empty() {
            // Assign to root bone with weight 1.0
            let bone_index = 0usize;
            let w_idx = weight_index_for_value(1.0, &mut weights, &mut weight_key_to_index);
            vcount_values.push(1);
            v_values.push(bone_index as i32);
            v_values.push(w_idx as i32);
            continue;
        }

        influences.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        influences.truncate(4);
        let sum: f32 = influences.iter().map(|(_, w)| *w).sum();
        let norm = if sum > 0.0 { sum } else { 1.0 };

        vcount_values.push(influences.len());
        for (joint, w) in influences.iter().copied() {
            let w_norm = w / norm;
            let idx = weight_index_for_value(w_norm, &mut weights, &mut weight_key_to_index);
            v_values.push(joint as i32);
            v_values.push(idx as i32);
        }
    }

    skin.children
        .push(XMLNode::Element(build_source_float_array(
            &weights_source_id,
            &weights,
            1,
        )));

    // <joints>
    let mut joints = Element::new("joints");
    let mut j_in = Element::new("input");
    j_in.attributes
        .insert("semantic".to_string(), "JOINT".to_string());
    j_in.attributes
        .insert("source".to_string(), format!("#{}", joint_source_id));
    joints.children.push(XMLNode::Element(j_in));
    let mut ibm_in = Element::new("input");
    ibm_in
        .attributes
        .insert("semantic".to_string(), "INV_BIND_MATRIX".to_string());
    ibm_in
        .attributes
        .insert("source".to_string(), format!("#{}", bind_pose_source_id));
    joints.children.push(XMLNode::Element(ibm_in));
    skin.children.push(XMLNode::Element(joints));

    // <vertex_weights>
    let mut vweights = Element::new("vertex_weights");
    vweights
        .attributes
        .insert("count".to_string(), (vertex_count as i32).to_string());

    let mut in_joint = Element::new("input");
    in_joint
        .attributes
        .insert("semantic".to_string(), "JOINT".to_string());
    in_joint
        .attributes
        .insert("source".to_string(), format!("#{}", joint_source_id));
    in_joint
        .attributes
        .insert("offset".to_string(), "0".to_string());
    vweights.children.push(XMLNode::Element(in_joint));

    let mut in_weight = Element::new("input");
    in_weight
        .attributes
        .insert("semantic".to_string(), "WEIGHT".to_string());
    in_weight
        .attributes
        .insert("source".to_string(), format!("#{}", weights_source_id));
    in_weight
        .attributes
        .insert("offset".to_string(), "1".to_string());
    vweights.children.push(XMLNode::Element(in_weight));

    let mut vcount = Element::new("vcount");
    let mut vcount_text = String::with_capacity(vcount_values.len() * 3);
    let mut first_vc = true;
    for vc in &vcount_values {
        if !first_vc {
            vcount_text.push(' ');
        }
        first_vc = false;
        write!(&mut vcount_text, "{}", vc).unwrap();
    }
    vcount.children.push(XMLNode::Text(vcount_text));
    vweights.children.push(XMLNode::Element(vcount));

    let mut v = Element::new("v");
    let mut v_text = String::with_capacity(v_values.len() * 6);
    let mut first_v = true;
    for n in &v_values {
        if !first_v {
            v_text.push(' ');
        }
        first_v = false;
        write!(&mut v_text, "{}", n).unwrap();
    }
    v.children.push(XMLNode::Text(v_text));
    vweights.children.push(XMLNode::Element(v));

    skin.children.push(XMLNode::Element(vweights));

    controller.children.push(XMLNode::Element(skin));
    Ok(controller)
}

fn build_skeleton_node_recursive_json(
    bones: &[JsonBone],
    bone_index: usize,
    children_map: &HashMap<Option<usize>, Vec<usize>>,
) -> Element {
    let bone = &bones[bone_index];
    let mut node = Element::new("node");
    let id = sanitize_id(&bone.name);
    node.attributes.insert("id".to_string(), id.clone());
    node.attributes
        .insert("name".to_string(), bone.name.clone());
    node.attributes.insert("sid".to_string(), bone.name.clone());
    node.attributes
        .insert("type".to_string(), "JOINT".to_string());

    // Prefer SRT decomposition to ensure DCCs like Maya populate translate/rotate/scale channels.
    let m = glam::Mat4::from_cols_array_2d(&bone.transform);
    let (s, r, t) = m.to_scale_rotation_translation();

    // <translate>
    let mut translate = Element::new("translate");
    translate.children.push(XMLNode::Text(format!(
        "{} {} {}",
        format_float(t.x),
        format_float(t.y),
        format_float(t.z)
    )));
    node.children.push(XMLNode::Element(translate));

    // <rotate> as axis-angle in degrees
    let (axis, angle_rad) = r.to_axis_angle();
    let angle_deg: f32 = angle_rad.to_degrees();
    let mut rotate = Element::new("rotate");
    rotate.children.push(XMLNode::Text(format!(
        "{} {} {} {}",
        format_float(axis.x),
        format_float(axis.y),
        format_float(axis.z),
        format_float(angle_deg)
    )));
    node.children.push(XMLNode::Element(rotate));

    // <scale>
    let mut scale = Element::new("scale");
    scale.children.push(XMLNode::Text(format!(
        "{} {} {}",
        format_float(s.x),
        format_float(s.y),
        format_float(s.z)
    )));
    node.children.push(XMLNode::Element(scale));

    if let Some(children) = children_map.get(&Some(bone_index)) {
        for &child_index in children {
            let child_node = build_skeleton_node_recursive_json(bones, child_index, children_map);
            node.children.push(XMLNode::Element(child_node));
        }
    }

    node
}

fn compute_inverse_bind_matrices_from_json(bones: &[JsonBone]) -> Vec<[f32; 16]> {
    if bones.is_empty() {
        return Vec::new();
    }

    let mut world: Vec<glam::Mat4> = vec![glam::Mat4::IDENTITY; bones.len()];
    let mut calculated = vec![false; bones.len()];

    fn calc(idx: usize, bones: &[JsonBone], world: &mut [glam::Mat4], calculated: &mut [bool]) {
        if calculated[idx] {
            return;
        }
        let local = glam::Mat4::from_cols_array_2d(&bones[idx].transform);
        if let Some(parent) = bones[idx].parent_index {
            calc(parent, bones, world, calculated);
            world[idx] = world[parent] * local;
        } else {
            world[idx] = local;
        }
        calculated[idx] = true;
    }

    for i in 0..bones.len() {
        calc(i, bones, &mut world, &mut calculated);
    }

    // COLLADA skin sources are commonly interpreted as row-major float arrays by DCC tools like Maya.
    // Convert each inverse bind matrix to row-major ordering when flattening.
    fn col_major_to_row_major(c: &[f32; 16]) -> [f32; 16] {
        [
            c[0], c[4], c[8], c[12], c[1], c[5], c[9], c[13], c[2], c[6], c[10], c[14], c[3], c[7],
            c[11], c[15],
        ]
    }

    world
        .iter()
        .map(|m| m.inverse().to_cols_array())
        .map(|c| col_major_to_row_major(&c))
        .collect()
}

fn build_asset(config: &DaeExportConfig) -> Element {
    let mut asset = Element::new("asset");

    // Optional: unit / authoring_tool could be added later
    let mut up_axis = Element::new("up_axis");
    up_axis.children.push(XMLNode::Text(match config.up_axis {
        UpAxisConversion::YUp => "Y_UP".to_string(),
        UpAxisConversion::ZUp => "Z_UP".to_string(),
        UpAxisConversion::NoConversion => "Y_UP".to_string(),
    }));
    asset.children.push(XMLNode::Element(up_axis));

    asset
}

fn append_format_float(out: &mut String, v: f32) {
    if v == 0.0 {
        out.push('0');
    } else {
        write!(out, "{:.6}", v).unwrap();
    }
}

/// Quantized key for skin weight deduplication (~1e-6 tolerance, same as prior linear scan).
fn weight_quant_key(w: f32) -> i32 {
    (w as f64 * 1_000_000.0).round() as i32
}

fn build_source_float_vec3(id: &str, data: &[[f32; 3]]) -> Element {
    let float_count = data.len() * 3;
    let mut float_text = String::with_capacity(float_count * 12);
    let mut first = true;
    for v in data {
        for &c in v {
            if !first {
                float_text.push(' ');
            }
            first = false;
            append_format_float(&mut float_text, c);
        }
    }
    build_source_float_array_text(id, float_text, float_count, 3)
}

fn build_source_float_vec2(id: &str, data: &[[f32; 2]]) -> Element {
    let float_count = data.len() * 2;
    let mut float_text = String::with_capacity(float_count * 12);
    let mut first = true;
    for v in data {
        for &c in v {
            if !first {
                float_text.push(' ');
            }
            first = false;
            append_format_float(&mut float_text, c);
        }
    }
    build_source_float_array_text(id, float_text, float_count, 2)
}

fn build_source_float_array(id: &str, flat_data: &[f32], stride: usize) -> Element {
    let mut float_text = String::with_capacity(flat_data.len() * 12);
    let mut first = true;
    for &v in flat_data {
        if !first {
            float_text.push(' ');
        }
        first = false;
        append_format_float(&mut float_text, v);
    }
    build_source_float_array_text(id, float_text, flat_data.len(), stride)
}

fn build_source_float_array_text(
    id: &str,
    float_text: String,
    float_count: usize,
    stride: usize,
) -> Element {
    let mut source = Element::new("source");
    source.attributes.insert("id".to_string(), id.to_string());

    let mut float_array = Element::new("float_array");
    float_array
        .attributes
        .insert("id".to_string(), format!("{}-array", id));
    float_array
        .attributes
        .insert("count".to_string(), float_count.to_string());
    float_array.children.push(XMLNode::Text(float_text));
    source.children.push(XMLNode::Element(float_array));

    let mut tech = Element::new("technique_common");
    let mut accessor = Element::new("accessor");
    accessor
        .attributes
        .insert("source".to_string(), format!("#{}-array", id));
    accessor
        .attributes
        .insert("count".to_string(), (float_count / stride).to_string());
    accessor
        .attributes
        .insert("stride".to_string(), stride.to_string());

    // Params by stride
    match stride {
        2 => {
            let mut p0 = Element::new("param");
            p0.attributes.insert("name".to_string(), "S".to_string());
            p0.attributes
                .insert("type".to_string(), "float".to_string());
            accessor.children.push(XMLNode::Element(p0));

            let mut p1 = Element::new("param");
            p1.attributes.insert("name".to_string(), "T".to_string());
            p1.attributes
                .insert("type".to_string(), "float".to_string());
            accessor.children.push(XMLNode::Element(p1));
        }
        3 => {
            let mut p0 = Element::new("param");
            p0.attributes.insert("name".to_string(), "X".to_string());
            p0.attributes
                .insert("type".to_string(), "float".to_string());
            accessor.children.push(XMLNode::Element(p0));

            let mut p1 = Element::new("param");
            p1.attributes.insert("name".to_string(), "Y".to_string());
            p1.attributes
                .insert("type".to_string(), "float".to_string());
            accessor.children.push(XMLNode::Element(p1));

            let mut p2 = Element::new("param");
            p2.attributes.insert("name".to_string(), "Z".to_string());
            p2.attributes
                .insert("type".to_string(), "float".to_string());
            accessor.children.push(XMLNode::Element(p2));
        }
        16 => {
            // Mat4; no names required for each component
        }
        _ => {}
    }

    tech.children.push(XMLNode::Element(accessor));
    source.children.push(XMLNode::Element(tech));
    source
}

fn build_source_name_array(id: &str, names: &[String]) -> Element {
    let mut source = Element::new("source");
    source.attributes.insert("id".to_string(), id.to_string());

    let mut name_array = Element::new("Name_array");
    name_array
        .attributes
        .insert("id".to_string(), format!("{}-array", id));
    name_array
        .attributes
        .insert("count".to_string(), names.len().to_string());
    name_array.children.push(XMLNode::Text(names.join(" ")));
    source.children.push(XMLNode::Element(name_array));

    let mut tech = Element::new("technique_common");
    let mut accessor = Element::new("accessor");
    accessor
        .attributes
        .insert("source".to_string(), format!("#{}-array", id));
    accessor
        .attributes
        .insert("count".to_string(), names.len().to_string());
    accessor
        .attributes
        .insert("stride".to_string(), "1".to_string());
    let mut param = Element::new("param");
    param
        .attributes
        .insert("name".to_string(), "JOINT".to_string());
    param
        .attributes
        .insert("type".to_string(), "name".to_string());
    accessor.children.push(XMLNode::Element(param));
    tech.children.push(XMLNode::Element(accessor));
    source.children.push(XMLNode::Element(tech));
    source
}

fn build_source_mat4_array(id: &str, matrices: &[[f32; 16]]) -> Element {
    let mut source = Element::new("source");
    source.attributes.insert("id".to_string(), id.to_string());

    let mut float_array = Element::new("float_array");
    float_array
        .attributes
        .insert("id".to_string(), format!("{}-array", id));
    float_array
        .attributes
        .insert("count".to_string(), (matrices.len() * 16).to_string());
    let mut float_text = String::with_capacity(matrices.len() * 16 * 12);
    let mut first = true;
    for m in matrices {
        for &v in m {
            if !first {
                float_text.push(' ');
            }
            first = false;
            append_format_float(&mut float_text, v);
        }
    }
    float_array.children.push(XMLNode::Text(float_text));
    source.children.push(XMLNode::Element(float_array));

    let mut tech = Element::new("technique_common");
    let mut accessor = Element::new("accessor");
    accessor
        .attributes
        .insert("source".to_string(), format!("#{}-array", id));
    accessor
        .attributes
        .insert("count".to_string(), matrices.len().to_string());
    accessor
        .attributes
        .insert("stride".to_string(), "16".to_string());
    tech.children.push(XMLNode::Element(accessor));
    source.children.push(XMLNode::Element(tech));
    source
}

fn get_first_vec3(attrs: &[ssbh_data::mesh_data::AttributeData]) -> Option<Vec<[f32; 3]>> {
    attrs.get(0).and_then(|a| vector_data_to_vec3(&a.data).ok())
}

fn vector_data_to_vec3(data: &VectorData) -> Result<Vec<[f32; 3]>> {
    match data {
        VectorData::Vector3(v) => Ok(v.clone()),
        VectorData::Vector2(v) => Ok(v.iter().map(|x| [x[0], x[1], 0.0]).collect()),
        VectorData::Vector4(v) => Ok(v.iter().map(|x| [x[0], x[1], x[2]]).collect()),
    }
}

fn vector_data_to_vec2(data: &VectorData) -> Result<Vec<[f32; 2]>> {
    match data {
        VectorData::Vector2(v) => Ok(v.clone()),
        VectorData::Vector3(v) => Ok(v.iter().map(|x| [x[0], x[1]]).collect()),
        VectorData::Vector4(v) => Ok(v.iter().map(|x| [x[0], x[1]]).collect()),
    }
}

// Removed unused row/column-major conversion helpers after switching to column-major output.

fn matrix_to_string(m: &[f32; 16]) -> String {
    let mut s = String::with_capacity(16 * 12);
    let mut first = true;
    for &v in m {
        if !first {
            s.push(' ');
        }
        first = false;
        append_format_float(&mut s, v);
    }
    s
}

fn format_float(v: f32) -> String {
    let mut s = String::new();
    append_format_float(&mut s, v);
    s
}

fn sanitize_id(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        if ch.is_alphanumeric() || ch == '_' || ch == '-' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "id".to_string()
    } else {
        out
    }
}
