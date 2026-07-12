use anyhow::{anyhow, Context, Result};
use fbxcel::low::{v7400::ArrayAttributeEncoding, FbxVersion};
use fbxcel::writer::v7400::binary::{FbxFooter, Writer};
use serde::{Deserialize, Serialize};
use ssbh_data::matl_data::{MatlData, MatlEntryData, ParamId};
use ssbh_data::mesh_data::{MeshData, VectorData};
use ssbh_data::modl_data::ModlData;
use ssbh_data::skel_data::SkelData;
use std::collections::{HashMap, HashSet};
use std::io::{Seek, Write};
use std::path::{Path, PathBuf};

/// Display size hint for skeleton nodes. This must not change joint transforms.
const DEFAULT_BONE_DISPLAY_SIZE: f64 = 1.0;

use crate::format::numatb_format::param_texture_path;
use crate::nutexb_lib;
use crate::ssbh_motion_interchange::MotionClip;
use crate::ssbh_preview::resolve_nutexb_path;

#[derive(Debug, Clone, Copy)]
enum FbxUpAxis {
    YUp,
    ZUp,
}

impl FbxUpAxis {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().replace('-', "_").as_str() {
            "y_up" | "yup" => Ok(Self::YUp),
            "z_up" | "zup" => Ok(Self::ZUp),
            other => Err(format!("Invalid up_axis '{other}': expected y_up or z_up")),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFbxExportEntry {
    root_path: String,
    output_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFbxExportedFile {
    name: String,
    path: String,
    mesh_count: usize,
    vertex_count: usize,
    texture_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFbxExportResult {
    exported: Vec<BatchFbxExportedFile>,
    errors: Vec<String>,
    total_exported: usize,
    total_failed: usize,
}

#[derive(Debug, Clone)]
struct ExportConfig {
    scale_factor: f32,
    up_axis: FbxUpAxis,
    export_textures: bool,
}

#[derive(Debug)]
struct LoadedSsbhModel {
    root_folder: PathBuf,
    mesh: MeshData,
    skel: Option<SkelData>,
    modl: ModlData,
    matl: Option<MatlData>,
    texture_references: Vec<String>,
}

#[derive(Debug)]
struct ExportScene {
    meshes: Vec<ExportMesh>,
    bones: Vec<ExportBone>,
}

#[derive(Debug)]
struct ExportMesh {
    name: String,
    positions: Vec<[f32; 3]>,
    normals: Option<Vec<[f32; 3]>>,
    texcoords: Option<Vec<[f32; 2]>>,
    indices: Vec<u32>,
    clusters: Vec<ExportCluster>,
    material: ExportMaterial,
}

#[derive(Debug)]
struct ExportCluster {
    bone_index: usize,
    vertex_indices: Vec<i32>,
    weights: Vec<f64>,
}

#[derive(Debug)]
struct ExportBone {
    name: String,
    parent_index: Option<usize>,
    local_transform: glam::Mat4,
    world_transform: glam::Mat4,
}

#[derive(Debug)]
struct ExportMaterial {
    name: String,
    texture_path: Option<String>,
}

#[derive(Default)]
struct BatchTextureExportState {
    used_names: HashSet<String>,
    source_to_relative: HashMap<PathBuf, String>,
}

#[derive(Debug)]
struct MeshIds {
    geometry: i64,
    model: i64,
    material: i64,
    skin: Option<i64>,
    clusters: Vec<(usize, i64)>,
    texture: Option<i64>,
    video: Option<i64>,
}

#[derive(Debug)]
struct BoneIds {
    model: i64,
    attribute: i64,
}

#[derive(Debug)]
struct MotionAnimationChannelIds {
    translation_node: i64,
    rotation_node: i64,
    scale_node: i64,
    translation_curves: [i64; 3],
    rotation_curves: [i64; 3],
    scale_curves: [i64; 3],
}

#[derive(Debug)]
struct MotionAnimationIds {
    stack: i64,
    layer: i64,
    channels: Vec<MotionAnimationChannelIds>,
}

#[derive(Debug)]
struct MotionAnimationChannelData {
    translation: [Vec<f32>; 3],
    rotation: [Vec<f32>; 3],
    scale: [Vec<f32>; 3],
}

const FBX_TICKS_PER_SECOND: i64 = 46_186_158_000;
const FBX_LINEAR_KEY_FLAG: i32 = 24_836;

struct IdGenerator {
    next: i64,
}

impl IdGenerator {
    fn new() -> Self {
        Self { next: 2_000_000 }
    }

    fn next(&mut self) -> i64 {
        self.next += 1;
        self.next
    }
}

#[tauri::command]
pub async fn unit_model_batch_export_fbx(
    output_dir: String,
    entries: Vec<BatchFbxExportEntry>,
    scale_factor: Option<f32>,
    up_axis: Option<String>,
    export_textures: Option<bool>,
) -> Result<BatchFbxExportResult, String> {
    let output_dir = output_dir.trim().to_string();
    if output_dir.is_empty() {
        return Err("output_dir cannot be empty".to_string());
    }

    let scale_factor = scale_factor.unwrap_or(1.0);
    if !scale_factor.is_finite() || scale_factor <= 0.0 {
        return Err("scale_factor must be a finite positive number".to_string());
    }
    let up_axis = FbxUpAxis::parse(up_axis.as_deref().unwrap_or("y_up"))?;
    let config = ExportConfig {
        scale_factor,
        up_axis,
        export_textures: export_textures.unwrap_or(false),
    };

    tauri::async_runtime::spawn_blocking(move || {
        let output_dir = PathBuf::from(output_dir);
        std::fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;

        let mut texture_state = BatchTextureExportState::default();
        let mut used_output_names = HashSet::new();
        let mut exported = Vec::new();
        let mut errors = Vec::new();

        for entry in entries {
            let root_path = entry.root_path.trim();
            if root_path.is_empty() {
                errors.push(format!("Skipped '{}': empty root_path", entry.output_name));
                continue;
            }

            let output_name = next_unique_name(
                &sanitize_file_name(&entry.output_name),
                &mut used_output_names,
            );
            match export_single_model(
                root_path,
                &output_dir,
                &output_name,
                &config,
                &mut texture_state,
            ) {
                Ok(file) => exported.push(file),
                Err(error) => errors.push(format!("{}: {error:#}", entry.output_name)),
            }
        }

        Ok(BatchFbxExportResult {
            total_exported: exported.len(),
            total_failed: errors.len(),
            exported,
            errors,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn export_single_model(
    root_path: &str,
    output_dir: &Path,
    output_name: &str,
    config: &ExportConfig,
    texture_state: &mut BatchTextureExportState,
) -> Result<BatchFbxExportedFile> {
    let model = load_ssbh_model(root_path)?;
    let output_path = output_dir.join(format!("{output_name}.fbx"));
    let (scene, texture_count) = build_export_scene(&model, output_dir, config, texture_state)?;
    let mesh_count = scene.meshes.len();
    let vertex_count = scene.meshes.iter().map(|mesh| mesh.positions.len()).sum();
    write_scene_fbx(&output_path, &scene, config.up_axis)?;

    Ok(BatchFbxExportedFile {
        name: output_name.to_string(),
        path: output_path.to_string_lossy().to_string(),
        mesh_count,
        vertex_count,
        texture_count,
    })
}

fn load_ssbh_model(root_path: &str) -> Result<LoadedSsbhModel> {
    let modl_path = PathBuf::from(root_path)
        .canonicalize()
        .with_context(|| format!("Failed to resolve NUMDLB path: {root_path}"))?;
    if !modl_path.is_file() {
        return Err(anyhow!(
            "NUMDLB path is not a file: {}",
            modl_path.display()
        ));
    }
    let root_folder = modl_path
        .parent()
        .ok_or_else(|| anyhow!("NUMDLB path has no parent directory"))?
        .to_path_buf();
    let modl = ModlData::from_file(&modl_path)
        .map_err(|error| anyhow!("Failed to read NUMDLB {}: {error}", modl_path.display()))?;

    let mesh_path = resolve_model_file(&root_folder, &modl.mesh_file_name)
        .with_context(|| format!("Failed to resolve NUMSHB for {}", modl_path.display()))?;
    let mesh = MeshData::from_file(&mesh_path)
        .map_err(|error| anyhow!("Failed to read NUMSHB {}: {error}", mesh_path.display()))?;

    let skel =
        if modl.skeleton_file_name.trim().is_empty() {
            None
        } else {
            let skel_path = resolve_model_file(&root_folder, &modl.skeleton_file_name)
                .with_context(|| format!("Failed to resolve NUSKTB for {}", modl_path.display()))?;
            Some(SkelData::from_file(&skel_path).map_err(|error| {
                anyhow!("Failed to read NUSKTB {}: {error}", skel_path.display())
            })?)
        };

    let mut material_paths: Vec<PathBuf> = modl
        .material_file_names
        .iter()
        .filter(|name| !name.trim().is_empty())
        .filter_map(|name| resolve_model_file(&root_folder, name).ok())
        .collect();
    material_paths.sort_by_key(|path| {
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if name.contains("__nust__") {
            0
        } else if name.contains("__maya__") {
            1
        } else {
            2
        }
    });
    material_paths.dedup();

    let mut matl: Option<MatlData> = None;
    let mut texture_references = Vec::new();
    let mut seen_texture_references = HashSet::new();
    for path in material_paths {
        let data = MatlData::from_file(&path)
            .map_err(|error| anyhow!("Failed to read NUMATB {}: {error}", path.display()))?;
        for entry in &data.entries {
            for texture in entry.textures.iter().chain(entry.textures2.iter()) {
                let texture_reference = texture.data.trim();
                if !texture_reference.is_empty()
                    && seen_texture_references
                        .insert(normalize_texture_reference(texture_reference))
                {
                    texture_references.push(texture_reference.to_string());
                }
            }
        }
        match matl.as_mut() {
            Some(existing) => {
                for entry in data.entries {
                    if let Some(existing_entry) =
                        existing.entries.iter_mut().find(|existing_entry| {
                            existing_entry.material_label == entry.material_label
                        })
                    {
                        if existing_entry.textures.is_empty() {
                            existing_entry.textures = entry.textures;
                        }
                        if existing_entry.textures2.is_empty() {
                            existing_entry.textures2 = entry.textures2;
                        }
                    } else {
                        existing.entries.push(entry);
                    }
                }
            }
            None => matl = Some(data),
        }
    }

    Ok(LoadedSsbhModel {
        root_folder,
        mesh,
        skel,
        modl,
        matl,
        texture_references,
    })
}

fn resolve_model_file(root_folder: &Path, reference: &str) -> Result<PathBuf> {
    let normalized = reference.trim().replace('\\', "/");
    if normalized.is_empty() {
        return Err(anyhow!("SSBH file reference is empty"));
    }

    let direct = root_folder.join(&normalized);
    if direct.is_file() {
        return direct
            .canonicalize()
            .with_context(|| format!("Failed to resolve {}", direct.display()));
    }

    let file_name = Path::new(&normalized)
        .file_name()
        .ok_or_else(|| anyhow!("SSBH file reference has no filename: {reference}"))?;
    let flat = root_folder.join(file_name);
    if flat.is_file() {
        return flat
            .canonicalize()
            .with_context(|| format!("Failed to resolve {}", flat.display()));
    }

    Err(anyhow!("Referenced SSBH file was not found: {reference}"))
}

fn build_export_scene(
    model: &LoadedSsbhModel,
    output_dir: &Path,
    config: &ExportConfig,
    texture_state: &mut BatchTextureExportState,
) -> Result<(ExportScene, usize)> {
    if model.mesh.objects.is_empty() {
        return Err(anyhow!("NUMSHB contains no mesh objects"));
    }

    let bones = build_export_bones(model.skel.as_ref(), config.scale_factor)?;
    let bone_indices: HashMap<&str, usize> = bones
        .iter()
        .enumerate()
        .map(|(index, bone)| (bone.name.as_str(), index))
        .collect();
    let (exported_texture_paths, textures_exported) = if config.export_textures {
        export_all_material_textures(model, output_dir, texture_state)?
    } else {
        (HashMap::new(), 0)
    };
    let mut meshes = Vec::with_capacity(model.mesh.objects.len());

    for object in &model.mesh.objects {
        let mut positions = vector_data_to_vec3(
            &object
                .positions
                .first()
                .ok_or_else(|| {
                    anyhow!(
                        "Mesh '{}' subindex {} has no positions",
                        object.name,
                        object.subindex
                    )
                })?
                .data,
        )?;
        for position in &mut positions {
            position[0] *= config.scale_factor;
            position[1] *= config.scale_factor;
            position[2] *= config.scale_factor;
        }
        if object
            .vertex_indices
            .iter()
            .any(|index| *index as usize >= positions.len())
        {
            return Err(anyhow!(
                "Mesh '{}' subindex {} has an out-of-range vertex index",
                object.name,
                object.subindex
            ));
        }
        if object.vertex_indices.len() % 3 != 0 {
            return Err(anyhow!(
                "Mesh '{}' subindex {} index count is not divisible by 3",
                object.name,
                object.subindex
            ));
        }

        let normals = object
            .normals
            .first()
            .map(|attribute| vector_data_to_vec3(&attribute.data))
            .transpose()?;
        let texcoords = object
            .texture_coordinates
            .first()
            .map(|attribute| vector_data_to_vec2(&attribute.data))
            .transpose()?;
        let clusters = build_clusters(object, positions.len(), &bone_indices);
        let material_label = model
            .modl
            .entries
            .iter()
            .find(|entry| {
                entry.mesh_object_name == object.name
                    && entry.mesh_object_subindex == object.subindex
            })
            .map(|entry| entry.material_label.as_str())
            .unwrap_or("DefaultMaterial");

        let texture_path = if config.export_textures {
            resolve_material_base_texture_path(material_label, model, &exported_texture_paths)
        } else {
            None
        };

        let name = if object.subindex == 0 {
            object.name.clone()
        } else {
            format!("{}__sub{}", object.name, object.subindex)
        };
        meshes.push(ExportMesh {
            name: sanitize_fbx_name(&name),
            positions,
            normals,
            texcoords,
            indices: object.vertex_indices.clone(),
            clusters,
            material: ExportMaterial {
                name: sanitize_fbx_name(material_label),
                texture_path,
            },
        });
    }

    Ok((ExportScene { meshes, bones }, textures_exported))
}

fn build_export_bones(skel: Option<&SkelData>, scale_factor: f32) -> Result<Vec<ExportBone>> {
    let Some(skel) = skel else {
        return Ok(Vec::new());
    };
    let mut local_transforms = Vec::with_capacity(skel.bones.len());
    for bone in &skel.bones {
        let mut local = bone.transform;
        if !local.is_finite() {
            return Err(anyhow!("Bone '{}' has a non-finite transform", bone.name));
        }
        local.w_axis.x *= scale_factor;
        local.w_axis.y *= scale_factor;
        local.w_axis.z *= scale_factor;
        local_transforms.push(local);
    }

    let mut world_transforms = vec![glam::Mat4::IDENTITY; skel.bones.len()];
    let mut resolved = vec![false; skel.bones.len()];
    let mut resolving = vec![false; skel.bones.len()];
    for index in 0..skel.bones.len() {
        resolve_bone_world_transform(
            index,
            &skel.bones,
            &local_transforms,
            &mut world_transforms,
            &mut resolved,
            &mut resolving,
        )?;
    }

    Ok(skel
        .bones
        .iter()
        .enumerate()
        .map(|(index, bone)| ExportBone {
            name: sanitize_fbx_name(&bone.name),
            parent_index: bone.parent_index,
            local_transform: local_transforms[index],
            world_transform: world_transforms[index],
        })
        .collect())
}

fn resolve_bone_world_transform(
    index: usize,
    bones: &[ssbh_data::skel_data::BoneData],
    local_transforms: &[glam::Mat4],
    world_transforms: &mut [glam::Mat4],
    resolved: &mut [bool],
    resolving: &mut [bool],
) -> Result<()> {
    if resolved[index] {
        return Ok(());
    }
    if resolving[index] {
        return Err(anyhow!("Skeleton contains a parent cycle at bone {index}"));
    }
    resolving[index] = true;
    world_transforms[index] = if let Some(parent_index) = bones[index].parent_index {
        if parent_index >= bones.len() {
            return Err(anyhow!(
                "Bone '{}' has invalid parent index {}",
                bones[index].name,
                parent_index
            ));
        }
        resolve_bone_world_transform(
            parent_index,
            bones,
            local_transforms,
            world_transforms,
            resolved,
            resolving,
        )?;
        world_transforms[parent_index] * local_transforms[index]
    } else {
        local_transforms[index]
    };
    resolving[index] = false;
    resolved[index] = true;
    Ok(())
}

fn build_clusters(
    object: &ssbh_data::mesh_data::MeshObjectData,
    vertex_count: usize,
    bone_indices: &HashMap<&str, usize>,
) -> Vec<ExportCluster> {
    if bone_indices.is_empty() {
        return Vec::new();
    }

    let mut per_vertex = vec![Vec::<(usize, f32)>::new(); vertex_count];
    let mut has_skinning = false;
    for influence in &object.bone_influences {
        let Some(&bone_index) = bone_indices.get(influence.bone_name.as_str()) else {
            continue;
        };
        for weight in &influence.vertex_weights {
            let vertex_index = weight.vertex_index as usize;
            if vertex_index < vertex_count
                && weight.vertex_weight.is_finite()
                && weight.vertex_weight > 0.0
            {
                per_vertex[vertex_index].push((bone_index, weight.vertex_weight));
                has_skinning = true;
            }
        }
    }

    if !has_skinning && !object.parent_bone_name.trim().is_empty() {
        if let Some(&bone_index) = bone_indices.get(object.parent_bone_name.as_str()) {
            for weights in &mut per_vertex {
                weights.push((bone_index, 1.0));
            }
            has_skinning = true;
        }
    }
    if !has_skinning {
        return Vec::new();
    }

    let root_index = 0usize;
    let mut cluster_vertices = vec![Vec::<i32>::new(); bone_indices.len()];
    let mut cluster_weights = vec![Vec::<f64>::new(); bone_indices.len()];
    for (vertex_index, weights) in per_vertex.iter_mut().enumerate() {
        if weights.is_empty() {
            weights.push((root_index, 1.0));
        }
        weights.sort_by(|left, right| {
            right
                .1
                .partial_cmp(&left.1)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        weights.truncate(4);
        let total: f32 = weights.iter().map(|(_, weight)| *weight).sum();
        if total <= 0.0 {
            continue;
        }
        for &(bone_index, weight) in weights.iter() {
            cluster_vertices[bone_index].push(vertex_index as i32);
            cluster_weights[bone_index].push((weight / total) as f64);
        }
    }

    cluster_vertices
        .into_iter()
        .zip(cluster_weights)
        .enumerate()
        .filter_map(|(bone_index, (vertex_indices, weights))| {
            if vertex_indices.is_empty() {
                None
            } else {
                Some(ExportCluster {
                    bone_index,
                    vertex_indices,
                    weights,
                })
            }
        })
        .collect()
}

fn normalize_texture_reference(texture_reference: &str) -> String {
    texture_reference
        .trim()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn export_all_material_textures(
    model: &LoadedSsbhModel,
    output_dir: &Path,
    state: &mut BatchTextureExportState,
) -> Result<(HashMap<String, String>, usize)> {
    let mut reference_to_relative = HashMap::new();
    let mut exported_count = 0;

    for texture_reference in &model.texture_references {
        let source_path = resolve_nutexb_path(&model.root_folder, texture_reference)
            .map_err(anyhow::Error::msg)?
            .ok_or_else(|| {
                anyhow!("Referenced NUMATB texture was not found: {texture_reference}")
            })?;
        let source_path = source_path
            .canonicalize()
            .with_context(|| format!("Failed to resolve NUTEXB: {}", source_path.display()))?;

        let relative = if let Some(relative) = state.source_to_relative.get(&source_path) {
            relative.clone()
        } else {
            let stem = source_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("texture");
            let relative = next_unique_texture_name(stem, &mut state.used_names);
            let destination = output_dir.join(&relative);
            nutexb_lib::export_nutexb_to_png(
                source_path
                    .to_str()
                    .ok_or_else(|| anyhow!("NUTEXB path is not valid UTF-8"))?,
                destination
                    .to_str()
                    .ok_or_else(|| anyhow!("PNG output path is not valid UTF-8"))?,
            )
            .map_err(|error| {
                anyhow!(
                    "Failed to export NUMATB texture '{}' to PNG: {error}",
                    texture_reference
                )
            })?;
            state
                .source_to_relative
                .insert(source_path, relative.clone());
            exported_count += 1;
            relative
        };

        reference_to_relative.insert(normalize_texture_reference(texture_reference), relative);
    }

    Ok((reference_to_relative, exported_count))
}

fn pick_base_color_texture_ref(entry: &MatlEntryData) -> Option<&str> {
    for texture in entry.textures.iter().chain(entry.textures2.iter()) {
        let value = texture.data.trim();
        let lower = value.to_ascii_lowercase();
        if !value.is_empty()
            && (lower.contains("pbr1_basecolor")
                || lower.contains("pbr2_basecolor")
                || lower.contains("basecolor")
                || lower.contains("base_color"))
        {
            return Some(value);
        }
    }
    if let Some(value) = param_texture_path(entry, ParamId::DiffuseMap) {
        return Some(value);
    }
    for id in [
        ParamId::Texture0,
        ParamId::Texture1,
        ParamId::Texture3,
        ParamId::Texture4,
        ParamId::Texture5,
    ] {
        if let Some(value) = param_texture_path(entry, id) {
            let lower = value.to_ascii_lowercase();
            if !lower.contains("normal")
                && !lower.contains("rough")
                && !lower.contains("metal")
                && !lower.contains("mask")
                && !lower.contains("cube")
            {
                return Some(value);
            }
        }
    }
    None
}

fn resolve_material_base_texture_path(
    material_label: &str,
    model: &LoadedSsbhModel,
    exported_texture_paths: &HashMap<String, String>,
) -> Option<String> {
    let matl = model.matl.as_ref()?;
    let entry = matl
        .entries
        .iter()
        .find(|entry| entry.material_label == material_label)?;
    let texture_reference = pick_base_color_texture_ref(entry)?;
    exported_texture_paths
        .get(&normalize_texture_reference(texture_reference))
        .cloned()
}

fn vector_data_to_vec3(data: &VectorData) -> Result<Vec<[f32; 3]>> {
    match data {
        VectorData::Vector2(values) => {
            Ok(values.iter().map(|value| [value.x, value.y, 0.0]).collect())
        }
        VectorData::Vector3(values) => Ok(values.iter().map(|value| value.to_array()).collect()),
        VectorData::Vector4(values) => Ok(values
            .iter()
            .map(|value| [value.x, value.y, value.z])
            .collect()),
    }
}

fn vector_data_to_vec2(data: &VectorData) -> Result<Vec<[f32; 2]>> {
    match data {
        VectorData::Vector2(values) => Ok(values.iter().map(|value| value.to_array()).collect()),
        VectorData::Vector3(values) => Ok(values.iter().map(|value| [value.x, value.y]).collect()),
        VectorData::Vector4(values) => Ok(values.iter().map(|value| [value.x, value.y]).collect()),
    }
}

fn write_scene_fbx(path: &Path, scene: &ExportScene, up_axis: FbxUpAxis) -> Result<()> {
    let mut ids = IdGenerator::new();
    let mesh_ids: Vec<MeshIds> = scene
        .meshes
        .iter()
        .map(|mesh| {
            let geometry = ids.next();
            let model = ids.next();
            let material = ids.next();
            let skin = (!mesh.clusters.is_empty()).then(|| ids.next());
            let clusters = mesh
                .clusters
                .iter()
                .map(|cluster| (cluster.bone_index, ids.next()))
                .collect();
            let texture = mesh.material.texture_path.as_ref().map(|_| ids.next());
            let video = mesh.material.texture_path.as_ref().map(|_| ids.next());
            MeshIds {
                geometry,
                model,
                material,
                skin,
                clusters,
                texture,
                video,
            }
        })
        .collect();
    let bone_ids: Vec<BoneIds> = scene
        .bones
        .iter()
        .map(|_| BoneIds {
            model: ids.next(),
            attribute: ids.next(),
        })
        .collect();
    let has_skin = mesh_ids.iter().any(|mesh| mesh.skin.is_some());
    let pose_id = has_skin.then(|| ids.next());

    // This lightweight fbxcel writer targets Blender-compatible binary FBX.
    // Autodesk Maya's importer is stricter about FBX scene metadata and is not
    // a supported target for this exporter.
    let mut writer =
        Writer::new(std::io::Cursor::new(Vec::new()), FbxVersion::V7_4).map_err(io_error)?;
    write_header(&mut writer, up_axis)?;
    write_definitions(&mut writer, scene, &mesh_ids, has_skin)?;

    writer.new_node("Objects").map_err(io_error)?;
    for (mesh, ids) in scene.meshes.iter().zip(&mesh_ids) {
        write_geometry(&mut writer, mesh, ids)?;
        write_mesh_model(&mut writer, mesh, ids)?;
        write_material(&mut writer, &mesh.material, ids)?;
        if let (Some(texture_id), Some(video_id), Some(relative_path)) = (
            ids.texture,
            ids.video,
            mesh.material.texture_path.as_deref(),
        ) {
            write_texture_and_video(&mut writer, texture_id, video_id, relative_path)?;
        }
        if let Some(skin_id) = ids.skin {
            write_skin(&mut writer, skin_id)?;
            for (cluster, (_, cluster_id)) in mesh.clusters.iter().zip(&ids.clusters) {
                write_cluster(
                    &mut writer,
                    *cluster_id,
                    cluster,
                    scene
                        .bones
                        .get(cluster.bone_index)
                        .ok_or_else(|| anyhow!("Cluster references an invalid bone index"))?,
                )?;
            }
        }
    }
    for (bone, ids) in scene.bones.iter().zip(&bone_ids) {
        write_bone(&mut writer, bone, ids)?;
    }
    if let Some(pose_id) = pose_id {
        write_bind_pose(&mut writer, pose_id, scene, &mesh_ids, &bone_ids)?;
    }
    writer.close_node().map_err(io_error)?;

    write_connections(&mut writer, scene, &mesh_ids, &bone_ids)?;
    let cursor = writer
        .finalize_and_flush(&FbxFooter::default())
        .map_err(io_error)?;
    std::fs::write(path, cursor.into_inner())
        .with_context(|| format!("Failed to write FBX: {}", path.display()))?;
    Ok(())
}

pub(crate) fn write_animation_only_fbx(output_path: &Path, clip: &MotionClip) -> Result<()> {
    clip.validate().map_err(|error| anyhow!(error))?;
    let bones = motion_export_bones(clip)?;
    let animation_data = motion_animation_data(clip, &bones)?;
    let mut ids = IdGenerator::new();
    let bone_ids: Vec<BoneIds> = bones
        .iter()
        .map(|_| BoneIds {
            model: ids.next(),
            attribute: ids.next(),
        })
        .collect();
    let animation_ids = MotionAnimationIds {
        stack: ids.next(),
        layer: ids.next(),
        channels: bones
            .iter()
            .map(|_| MotionAnimationChannelIds {
                translation_node: ids.next(),
                rotation_node: ids.next(),
                scale_node: ids.next(),
                translation_curves: [ids.next(), ids.next(), ids.next()],
                rotation_curves: [ids.next(), ids.next(), ids.next()],
                scale_curves: [ids.next(), ids.next(), ids.next()],
            })
            .collect(),
    };
    let mut writer =
        Writer::new(std::io::Cursor::new(Vec::new()), FbxVersion::V7_4).map_err(io_error)?;
    write_header(&mut writer, FbxUpAxis::YUp)?;
    write_motion_definitions(&mut writer, bones.len())?;

    writer.new_node("Objects").map_err(io_error)?;
    for (bone, ids) in bones.iter().zip(&bone_ids) {
        write_bone(&mut writer, bone, ids)?;
    }
    write_motion_animation_stack(
        &mut writer,
        animation_ids.stack,
        &clip.name,
        clip.frames.len(),
    )?;
    write_motion_animation_layer(&mut writer, animation_ids.layer, &clip.name)?;
    for ((bone, ids), data) in bones
        .iter()
        .zip(&animation_ids.channels)
        .zip(&animation_data)
    {
        write_motion_curve_node(
            &mut writer,
            ids.translation_node,
            &bone.name,
            "Translation",
            &data.translation,
        )?;
        write_motion_curve_node(
            &mut writer,
            ids.rotation_node,
            &bone.name,
            "Rotation",
            &data.rotation,
        )?;
        write_motion_curve_node(
            &mut writer,
            ids.scale_node,
            &bone.name,
            "Scaling",
            &data.scale,
        )?;
        for axis in 0..3 {
            write_motion_curve(
                &mut writer,
                ids.translation_curves[axis],
                &bone.name,
                "Translation",
                axis,
                &data.translation[axis],
            )?;
            write_motion_curve(
                &mut writer,
                ids.rotation_curves[axis],
                &bone.name,
                "Rotation",
                axis,
                &data.rotation[axis],
            )?;
            write_motion_curve(
                &mut writer,
                ids.scale_curves[axis],
                &bone.name,
                "Scaling",
                axis,
                &data.scale[axis],
            )?;
        }
    }
    writer.close_node().map_err(io_error)?;

    write_motion_connections(&mut writer, &bones, &bone_ids, &animation_ids)?;
    let cursor = writer
        .finalize_and_flush(&FbxFooter::default())
        .map_err(io_error)?;
    std::fs::write(output_path, cursor.into_inner())
        .with_context(|| format!("Failed to write FBX: {}", output_path.display()))?;
    Ok(())
}

fn motion_export_bones(clip: &MotionClip) -> Result<Vec<ExportBone>> {
    clip.skeleton
        .bones
        .iter()
        .map(|bone| {
            let local_transform = glam::Mat4::from_scale_rotation_translation(
                bone.rest_local.scale,
                bone.rest_local.rotation,
                bone.rest_local.translation,
            );
            if !local_transform.is_finite() {
                return Err(anyhow!(
                    "Bone '{}' has a non-finite rest transform",
                    bone.name
                ));
            }
            Ok(ExportBone {
                name: motion_fbx_bone_name(&bone.name)?,
                parent_index: bone.parent_index,
                local_transform,
                world_transform: local_transform,
            })
        })
        .collect()
}

fn motion_animation_data(
    clip: &MotionClip,
    bones: &[ExportBone],
) -> Result<Vec<MotionAnimationChannelData>> {
    bones
        .iter()
        .enumerate()
        .map(|(bone_index, bone)| {
            let (_, _, _, order_value) = decompose_fbx_trs(bone.local_transform)?;
            let rotation_order = rotation_order_from_value(order_value)?;
            let mut translation = std::array::from_fn(|_| Vec::with_capacity(clip.frames.len()));
            let mut rotation = std::array::from_fn(|_| Vec::with_capacity(clip.frames.len()));
            let mut scale = std::array::from_fn(|_| Vec::with_capacity(clip.frames.len()));
            for frame in &clip.frames {
                let transform = frame.local_transforms[bone_index];
                translation[0].push(transform.translation.x);
                translation[1].push(transform.translation.y);
                translation[2].push(transform.translation.z);
                let euler = ufbx::quat_to_euler(
                    ufbx::Quat {
                        x: transform.rotation.x as f64,
                        y: transform.rotation.y as f64,
                        z: transform.rotation.z as f64,
                        w: transform.rotation.w as f64,
                    },
                    rotation_order,
                );
                rotation[0].push(euler.x as f32);
                rotation[1].push(euler.y as f32);
                rotation[2].push(euler.z as f32);
                scale[0].push(transform.scale.x);
                scale[1].push(transform.scale.y);
                scale[2].push(transform.scale.z);
            }
            for values in &mut rotation {
                unwrap_euler_degrees(values);
            }
            Ok(MotionAnimationChannelData {
                translation,
                rotation,
                scale,
            })
        })
        .collect()
}

fn rotation_order_from_value(value: i32) -> Result<ufbx::RotationOrder> {
    match value {
        0 => Ok(ufbx::RotationOrder::Xyz),
        1 => Ok(ufbx::RotationOrder::Xzy),
        2 => Ok(ufbx::RotationOrder::Yzx),
        3 => Ok(ufbx::RotationOrder::Yxz),
        4 => Ok(ufbx::RotationOrder::Zxy),
        5 => Ok(ufbx::RotationOrder::Zyx),
        _ => Err(anyhow!("Unsupported FBX rotation order {value}")),
    }
}

fn unwrap_euler_degrees(values: &mut [f32]) {
    for index in 1..values.len() {
        let delta = values[index] - values[index - 1];
        values[index] -= (delta / 360.0).round() * 360.0;
    }
}

fn write_header<W: Write + Seek>(writer: &mut Writer<W>, up_axis: FbxUpAxis) -> Result<()> {
    writer.new_node("FBXHeaderExtension").map_err(io_error)?;
    write_i32_node(writer, "FBXHeaderVersion", 1003)?;
    write_i32_node(writer, "FBXVersion", 7400)?;
    write_string_node(writer, "Creator", "EXVS2 Model Editor")?;
    writer.close_node().map_err(io_error)?;

    writer.new_node("GlobalSettings").map_err(io_error)?;
    write_i32_node(writer, "Version", 1000)?;
    writer.new_node("Properties70").map_err(io_error)?;
    match up_axis {
        FbxUpAxis::YUp => {
            write_prop_int(writer, "UpAxis", 1)?;
            write_prop_int(writer, "UpAxisSign", 1)?;
            write_prop_int(writer, "FrontAxis", 2)?;
            write_prop_int(writer, "FrontAxisSign", -1)?;
            write_prop_int(writer, "CoordAxis", 0)?;
            write_prop_int(writer, "CoordAxisSign", -1)?;
            write_prop_int(writer, "OriginalUpAxis", 1)?;
        }
        FbxUpAxis::ZUp => {
            write_prop_int(writer, "UpAxis", 2)?;
            write_prop_int(writer, "UpAxisSign", 1)?;
            write_prop_int(writer, "FrontAxis", 0)?;
            write_prop_int(writer, "FrontAxisSign", -1)?;
            write_prop_int(writer, "CoordAxis", 1)?;
            write_prop_int(writer, "CoordAxisSign", -1)?;
            write_prop_int(writer, "OriginalUpAxis", 2)?;
        }
    }
    write_prop_int(writer, "OriginalUpAxisSign", 1)?;
    write_prop_double(writer, "UnitScaleFactor", 1.0)?;
    write_prop_double(writer, "OriginalUnitScaleFactor", 1.0)?;
    writer.close_node().map_err(io_error)?;
    writer.close_node().map_err(io_error)?;

    writer.new_node("Documents").map_err(io_error)?;
    write_i32_node(writer, "Count", 1)?;
    {
        let mut attributes = writer.new_node("Document").map_err(io_error)?;
        attributes.append_i64(1_000_000_000).map_err(io_error)?;
        attributes.append_string_direct("").map_err(io_error)?;
        attributes.append_string_direct("Scene").map_err(io_error)?;
    }
    writer.new_node("Properties70").map_err(io_error)?;
    writer.close_node().map_err(io_error)?;
    write_i64_node(writer, "RootNode", 0)?;
    writer.close_node().map_err(io_error)?;
    writer.close_node().map_err(io_error)?;

    writer.new_node("References").map_err(io_error)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_definitions<W: Write + Seek>(
    writer: &mut Writer<W>,
    scene: &ExportScene,
    mesh_ids: &[MeshIds],
    has_skin: bool,
) -> Result<()> {
    let cluster_count: usize = mesh_ids.iter().map(|mesh| mesh.clusters.len()).sum();
    let skin_count = mesh_ids.iter().filter(|mesh| mesh.skin.is_some()).count();
    let texture_count = mesh_ids
        .iter()
        .filter(|mesh| mesh.texture.is_some())
        .count();
    writer.new_node("Definitions").map_err(io_error)?;
    write_i32_node(writer, "Version", 100)?;
    write_definition(writer, "GlobalSettings", 1)?;
    write_definition(
        writer,
        "Model",
        (scene.meshes.len() + scene.bones.len()) as i32,
    )?;
    write_definition(writer, "Geometry", scene.meshes.len() as i32)?;
    write_definition(writer, "Material", scene.meshes.len() as i32)?;
    if !scene.bones.is_empty() {
        write_definition(writer, "NodeAttribute", scene.bones.len() as i32)?;
    }
    if skin_count + cluster_count > 0 {
        write_definition(writer, "Deformer", (skin_count + cluster_count) as i32)?;
    }
    if has_skin {
        write_definition(writer, "Pose", 1)?;
    }
    if texture_count > 0 {
        write_definition(writer, "Texture", texture_count as i32)?;
        write_definition(writer, "Video", texture_count as i32)?;
    }
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_motion_definitions<W: Write + Seek>(
    writer: &mut Writer<W>,
    bone_count: usize,
) -> Result<()> {
    writer.new_node("Definitions").map_err(io_error)?;
    write_i32_node(writer, "Version", 100)?;
    write_definition(writer, "GlobalSettings", 1)?;
    write_definition(writer, "Model", bone_count as i32)?;
    write_definition(writer, "NodeAttribute", bone_count as i32)?;
    write_definition(writer, "AnimationStack", 1)?;
    write_definition(writer, "AnimationLayer", 1)?;
    write_definition(writer, "AnimationCurveNode", (bone_count * 3) as i32)?;
    write_definition(writer, "AnimationCurve", (bone_count * 9) as i32)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_motion_animation_stack<W: Write + Seek>(
    writer: &mut Writer<W>,
    id: i64,
    action_name: &str,
    frame_count: usize,
) -> Result<()> {
    let end_time = ((frame_count.saturating_sub(1)) as i64)
        .checked_mul(FBX_TICKS_PER_SECOND)
        .ok_or_else(|| anyhow!("FBX animation duration overflows ticks"))?
        / 60;
    {
        let mut attributes = writer.new_node("AnimationStack").map_err(io_error)?;
        attributes.append_i64(id).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(action_name, "AnimStack"))
            .map_err(io_error)?;
        attributes.append_string_direct("").map_err(io_error)?;
    }
    writer.new_node("Properties70").map_err(io_error)?;
    write_prop_time(writer, "LocalStart", 0)?;
    write_prop_time(writer, "LocalStop", end_time)?;
    write_prop_time(writer, "ReferenceStart", 0)?;
    write_prop_time(writer, "ReferenceStop", end_time)?;
    writer.close_node().map_err(io_error)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_motion_animation_layer<W: Write + Seek>(
    writer: &mut Writer<W>,
    id: i64,
    action_name: &str,
) -> Result<()> {
    {
        let mut attributes = writer.new_node("AnimationLayer").map_err(io_error)?;
        attributes.append_i64(id).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(action_name, "AnimLayer"))
            .map_err(io_error)?;
        attributes.append_string_direct("").map_err(io_error)?;
    }
    write_i32_node(writer, "Version", 100)?;
    writer.new_node("Properties70").map_err(io_error)?;
    write_prop_double(writer, "Weight", 100.0)?;
    write_prop_bool(writer, "Mute", false)?;
    writer.close_node().map_err(io_error)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_motion_curve_node<W: Write + Seek>(
    writer: &mut Writer<W>,
    id: i64,
    bone_name: &str,
    property_name: &str,
    values: &[Vec<f32>; 3],
) -> Result<()> {
    {
        let mut attributes = writer.new_node("AnimationCurveNode").map_err(io_error)?;
        attributes.append_i64(id).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(
                &format!("{bone_name}_{property_name}"),
                "AnimCurveNode",
            ))
            .map_err(io_error)?;
        attributes.append_string_direct("").map_err(io_error)?;
    }
    writer.new_node("Properties70").map_err(io_error)?;
    for (axis, value) in ['X', 'Y', 'Z'].into_iter().zip(values.iter()) {
        write_prop_animation_component(writer, axis, value.first().copied().unwrap_or_default())?;
    }
    writer.close_node().map_err(io_error)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_motion_curve<W: Write + Seek>(
    writer: &mut Writer<W>,
    id: i64,
    bone_name: &str,
    property_name: &str,
    axis: usize,
    values: &[f32],
) -> Result<()> {
    let axis_name = ['X', 'Y', 'Z']
        .get(axis)
        .ok_or_else(|| anyhow!("Invalid FBX animation axis {axis}"))?;
    let key_times = (0..values.len()).map(|frame| {
        (frame as i64)
            .checked_mul(FBX_TICKS_PER_SECOND)
            .ok_or_else(|| anyhow!("FBX animation key time overflows"))
            .map(|ticks| ticks / 60)
    });
    {
        let mut attributes = writer.new_node("AnimationCurve").map_err(io_error)?;
        attributes.append_i64(id).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(
                &format!("{bone_name}_{property_name}_{axis_name}"),
                "AnimCurve",
            ))
            .map_err(io_error)?;
        attributes.append_string_direct("").map_err(io_error)?;
    }
    write_f64_node(
        writer,
        "Default",
        values.first().copied().unwrap_or_default() as f64,
    )?;
    write_i32_node(writer, "KeyVer", 4008)?;
    write_i64_array_node(
        writer,
        "KeyTime",
        key_times.collect::<Result<Vec<_>>>()?,
        compression(),
    )?;
    write_f32_array_node(
        writer,
        "KeyValueFloat",
        values.iter().copied(),
        compression(),
    )?;
    write_f32_array_node(
        writer,
        "KeyAttrDataFloat",
        std::iter::repeat(0.0).take(values.len() * 4),
        compression(),
    )?;
    write_i32_array_node(
        writer,
        "KeyAttrFlags",
        std::iter::repeat(FBX_LINEAR_KEY_FLAG).take(values.len()),
        compression(),
    )?;
    write_i32_array_node(
        writer,
        "KeyAttrRefCount",
        std::iter::repeat(1).take(values.len()),
        compression(),
    )?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_motion_connections<W: Write + Seek>(
    writer: &mut Writer<W>,
    bones: &[ExportBone],
    bone_ids: &[BoneIds],
    animation_ids: &MotionAnimationIds,
) -> Result<()> {
    writer.new_node("Connections").map_err(io_error)?;
    for (bone, ids) in bones.iter().zip(bone_ids) {
        write_connection(writer, "OO", ids.attribute, ids.model)?;
        let parent = bone
            .parent_index
            .and_then(|index| bone_ids.get(index))
            .map(|ids| ids.model)
            .unwrap_or(0);
        write_connection(writer, "OO", ids.model, parent)?;
    }
    write_connection(writer, "OO", animation_ids.layer, animation_ids.stack)?;
    for (index, ids) in animation_ids.channels.iter().enumerate() {
        let bone = bone_ids
            .get(index)
            .ok_or_else(|| anyhow!("Missing bone ID for animation channel {index}"))?;
        for (node, property) in [
            (ids.translation_node, "Lcl Translation"),
            (ids.rotation_node, "Lcl Rotation"),
            (ids.scale_node, "Lcl Scaling"),
        ] {
            write_connection(writer, "OO", node, animation_ids.layer)?;
            write_property_connection(writer, node, bone.model, property)?;
        }
        for (node, curves) in [
            (ids.translation_node, &ids.translation_curves),
            (ids.rotation_node, &ids.rotation_curves),
            (ids.scale_node, &ids.scale_curves),
        ] {
            for (axis, curve) in curves.iter().enumerate() {
                let property = match axis {
                    0 => "d|X",
                    1 => "d|Y",
                    2 => "d|Z",
                    _ => unreachable!(),
                };
                write_property_connection(writer, *curve, node, property)?;
            }
        }
    }
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_geometry<W: Write + Seek>(
    writer: &mut Writer<W>,
    mesh: &ExportMesh,
    ids: &MeshIds,
) -> Result<()> {
    {
        let mut attributes = writer.new_node("Geometry").map_err(io_error)?;
        attributes.append_i64(ids.geometry).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(&mesh.name, "Geometry"))
            .map_err(io_error)?;
        attributes.append_string_direct("Mesh").map_err(io_error)?;
    }
    write_i32_node(writer, "GeometryVersion", 124)?;
    write_f64_array_node(
        writer,
        "Vertices",
        mesh.positions
            .iter()
            .flat_map(|position| position.iter().map(|value| *value as f64)),
        compression(),
    )?;
    let polygon_indices = mesh.indices.chunks_exact(3).flat_map(|triangle| {
        [
            triangle[0] as i32,
            triangle[1] as i32,
            -(triangle[2] as i32) - 1,
        ]
    });
    write_i32_array_node(writer, "PolygonVertexIndex", polygon_indices, compression())?;

    if let Some(normals) = mesh.normals.as_ref() {
        write_begin_i32_attributed_node(writer, "LayerElementNormal", 0)?;
        write_i32_node(writer, "Version", 101)?;
        write_string_node(writer, "Name", "")?;
        write_string_node(writer, "MappingInformationType", "ByPolygonVertex")?;
        write_string_node(writer, "ReferenceInformationType", "Direct")?;
        let values = mesh.indices.iter().flat_map(|index| {
            normals
                .get(*index as usize)
                .copied()
                .unwrap_or([0.0, 1.0, 0.0])
                .into_iter()
                .map(|value| value as f64)
        });
        write_f64_array_node(writer, "Normals", values, compression())?;
        writer.close_node().map_err(io_error)?;
    }

    if let Some(texcoords) = mesh.texcoords.as_ref() {
        write_begin_i32_attributed_node(writer, "LayerElementUV", 0)?;
        write_i32_node(writer, "Version", 101)?;
        write_string_node(writer, "Name", "UVMap")?;
        write_string_node(writer, "MappingInformationType", "ByPolygonVertex")?;
        write_string_node(writer, "ReferenceInformationType", "Direct")?;
        let values = mesh.indices.iter().flat_map(|index| {
            let uv = texcoords
                .get(*index as usize)
                .copied()
                .unwrap_or([0.0, 0.0]);
            [uv[0], 1.0 - uv[1]].into_iter().map(|value| value as f64)
        });
        write_f64_array_node(writer, "UV", values, compression())?;
        writer.close_node().map_err(io_error)?;
    }

    write_begin_i32_attributed_node(writer, "LayerElementMaterial", 0)?;
    write_i32_node(writer, "Version", 101)?;
    write_string_node(writer, "Name", "")?;
    write_string_node(writer, "MappingInformationType", "AllSame")?;
    write_string_node(writer, "ReferenceInformationType", "IndexToDirect")?;
    write_i32_array_node(writer, "Materials", [0], None)?;
    writer.close_node().map_err(io_error)?;

    write_begin_i32_attributed_node(writer, "Layer", 0)?;
    write_i32_node(writer, "Version", 100)?;
    if mesh.normals.is_some() {
        write_layer_element(writer, "LayerElementNormal")?;
    }
    if mesh.texcoords.is_some() {
        write_layer_element(writer, "LayerElementUV")?;
    }
    write_layer_element(writer, "LayerElementMaterial")?;
    writer.close_node().map_err(io_error)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_mesh_model<W: Write + Seek>(
    writer: &mut Writer<W>,
    mesh: &ExportMesh,
    ids: &MeshIds,
) -> Result<()> {
    {
        let mut attributes = writer.new_node("Model").map_err(io_error)?;
        attributes.append_i64(ids.model).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(&mesh.name, "Model"))
            .map_err(io_error)?;
        attributes.append_string_direct("Mesh").map_err(io_error)?;
    }
    write_i32_node(writer, "Version", 232)?;
    writer.new_node("Properties70").map_err(io_error)?;
    write_prop_enum_int(writer, "InheritType", 1)?;
    write_prop_visibility(writer, true)?;
    write_prop_int(writer, "DefaultAttributeIndex", 0)?;
    write_prop_lcl(writer, "Lcl Translation", [0.0, 0.0, 0.0])?;
    write_prop_lcl(writer, "Lcl Rotation", [0.0, 0.0, 0.0])?;
    write_prop_lcl(writer, "Lcl Scaling", [1.0, 1.0, 1.0])?;
    writer.close_node().map_err(io_error)?;
    write_bool_node(writer, "Shading", true)?;
    write_string_node(writer, "Culling", "CullingOff")?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_material<W: Write + Seek>(
    writer: &mut Writer<W>,
    material: &ExportMaterial,
    ids: &MeshIds,
) -> Result<()> {
    {
        let mut attributes = writer.new_node("Material").map_err(io_error)?;
        attributes.append_i64(ids.material).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(&material.name, "Material"))
            .map_err(io_error)?;
        attributes.append_string_direct("").map_err(io_error)?;
    }
    write_i32_node(writer, "Version", 102)?;
    write_string_node(writer, "ShadingModel", "phong")?;
    write_i32_node(writer, "MultiLayer", 0)?;
    writer.new_node("Properties70").map_err(io_error)?;
    write_prop_color(writer, "DiffuseColor", [0.8, 0.8, 0.8])?;
    write_prop_color(writer, "AmbientColor", [0.2, 0.2, 0.2])?;
    write_prop_color(writer, "SpecularColor", [0.2, 0.2, 0.2])?;
    write_prop_double(writer, "Shininess", 20.0)?;
    writer.close_node().map_err(io_error)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_texture_and_video<W: Write + Seek>(
    writer: &mut Writer<W>,
    texture_id: i64,
    video_id: i64,
    relative_path: &str,
) -> Result<()> {
    let texture_name = sanitize_fbx_name(
        Path::new(relative_path)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("texture"),
    );
    {
        let mut attributes = writer.new_node("Texture").map_err(io_error)?;
        attributes.append_i64(texture_id).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(&texture_name, "Texture"))
            .map_err(io_error)?;
        attributes.append_string_direct("").map_err(io_error)?;
    }
    write_string_node(writer, "Type", "TextureVideoClip")?;
    write_i32_node(writer, "Version", 202)?;
    write_string_node(
        writer,
        "TextureName",
        &fbx_name_class(&texture_name, "Texture"),
    )?;
    write_string_node(writer, "Media", &fbx_name_class(&texture_name, "Video"))?;
    write_string_node(writer, "FileName", relative_path)?;
    write_string_node(writer, "RelativeFilename", relative_path)?;
    write_f64_values_node(writer, "ModelUVTranslation", [0.0, 0.0])?;
    write_f64_values_node(writer, "ModelUVScaling", [1.0, 1.0])?;
    write_string_node(writer, "Texture_Alpha_Source", "None")?;
    write_i32_values_node(writer, "Cropping", [0, 0, 0, 0])?;
    writer.close_node().map_err(io_error)?;

    {
        let mut attributes = writer.new_node("Video").map_err(io_error)?;
        attributes.append_i64(video_id).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(&texture_name, "Video"))
            .map_err(io_error)?;
        attributes.append_string_direct("Clip").map_err(io_error)?;
    }
    write_string_node(writer, "Type", "Clip")?;
    write_string_node(writer, "FileName", relative_path)?;
    write_string_node(writer, "RelativeFilename", relative_path)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_bone<W: Write + Seek>(
    writer: &mut Writer<W>,
    bone: &ExportBone,
    ids: &BoneIds,
) -> Result<()> {
    {
        let mut attributes = writer.new_node("NodeAttribute").map_err(io_error)?;
        attributes.append_i64(ids.attribute).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(&bone.name, "NodeAttribute"))
            .map_err(io_error)?;
        attributes
            .append_string_direct("LimbNode")
            .map_err(io_error)?;
    }
    write_string_node(writer, "TypeFlags", "Skeleton")?;
    writer.new_node("Properties70").map_err(io_error)?;
    write_prop_double(writer, "Size", DEFAULT_BONE_DISPLAY_SIZE)?;
    writer.close_node().map_err(io_error)?;
    writer.close_node().map_err(io_error)?;

    let (translation, rotation, scale, rotation_order) = decompose_fbx_trs(bone.local_transform)?;
    {
        let mut attributes = writer.new_node("Model").map_err(io_error)?;
        attributes.append_i64(ids.model).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(&bone.name, "Model"))
            .map_err(io_error)?;
        attributes
            .append_string_direct("LimbNode")
            .map_err(io_error)?;
    }
    write_i32_node(writer, "Version", 232)?;
    writer.new_node("Properties70").map_err(io_error)?;
    write_prop_enum_int(writer, "InheritType", 1)?;
    write_prop_enum_int(writer, "RotationOrder", rotation_order)?;
    write_prop_bool(writer, "RotationActive", true)?;
    write_prop_visibility(writer, true)?;
    write_prop_lcl(writer, "Lcl Translation", translation)?;
    write_prop_lcl(writer, "Lcl Rotation", rotation)?;
    write_prop_lcl(writer, "Lcl Scaling", scale)?;
    writer.close_node().map_err(io_error)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_skin<W: Write + Seek>(writer: &mut Writer<W>, skin_id: i64) -> Result<()> {
    {
        let mut attributes = writer.new_node("Deformer").map_err(io_error)?;
        attributes.append_i64(skin_id).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class("Skin", "Deformer"))
            .map_err(io_error)?;
        attributes.append_string_direct("Skin").map_err(io_error)?;
    }
    write_i32_node(writer, "Version", 101)?;
    write_f64_node(writer, "Link_DeformAcuracy", 50.0)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_cluster<W: Write + Seek>(
    writer: &mut Writer<W>,
    cluster_id: i64,
    cluster: &ExportCluster,
    bone: &ExportBone,
) -> Result<()> {
    let mesh_to_bone_bind = bone.world_transform.inverse();
    if !mesh_to_bone_bind.is_finite() {
        return Err(anyhow!(
            "Bone '{}' has a non-invertible bind transform",
            bone.name
        ));
    }
    {
        let mut attributes = writer.new_node("Deformer").map_err(io_error)?;
        attributes.append_i64(cluster_id).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class(&bone.name, "SubDeformer"))
            .map_err(io_error)?;
        attributes
            .append_string_direct("Cluster")
            .map_err(io_error)?;
    }
    write_i32_node(writer, "Version", 100)?;
    write_i32_array_node(
        writer,
        "Indexes",
        cluster.vertex_indices.iter().copied(),
        compression(),
    )?;
    write_f64_array_node(
        writer,
        "Weights",
        cluster.weights.iter().copied(),
        compression(),
    )?;
    // FBX stores Transform in bone space. Importers recover the mesh bind matrix as
    // TransformLink * Transform, so an identity mesh bind needs inverse(bone) here.
    write_f64_array_node(writer, "Transform", matrix_values(mesh_to_bone_bind), None)?;
    write_f64_array_node(
        writer,
        "TransformLink",
        matrix_values(bone.world_transform),
        None,
    )?;
    write_f64_array_node(writer, "TransformAssociateModel", identity_matrix(), None)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_bind_pose<W: Write + Seek>(
    writer: &mut Writer<W>,
    pose_id: i64,
    scene: &ExportScene,
    mesh_ids: &[MeshIds],
    bone_ids: &[BoneIds],
) -> Result<()> {
    {
        let mut attributes = writer.new_node("Pose").map_err(io_error)?;
        attributes.append_i64(pose_id).map_err(io_error)?;
        attributes
            .append_string_direct(&fbx_name_class("BindPose", "Pose"))
            .map_err(io_error)?;
        attributes
            .append_string_direct("BindPose")
            .map_err(io_error)?;
    }
    write_string_node(writer, "Type", "BindPose")?;
    write_i32_node(writer, "Version", 100)?;
    write_i32_node(
        writer,
        "NbPoseNodes",
        (mesh_ids.len() + bone_ids.len()) as i32,
    )?;
    for ids in mesh_ids {
        write_pose_node(writer, ids.model, identity_matrix())?;
    }
    for (bone, ids) in scene.bones.iter().zip(bone_ids) {
        write_pose_node(writer, ids.model, matrix_values(bone.world_transform))?;
    }
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_pose_node<W: Write + Seek>(
    writer: &mut Writer<W>,
    model_id: i64,
    matrix: impl IntoIterator<Item = f64>,
) -> Result<()> {
    writer.new_node("PoseNode").map_err(io_error)?;
    write_i64_node(writer, "Node", model_id)?;
    write_f64_array_node(writer, "Matrix", matrix, None)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_connections<W: Write + Seek>(
    writer: &mut Writer<W>,
    scene: &ExportScene,
    mesh_ids: &[MeshIds],
    bone_ids: &[BoneIds],
) -> Result<()> {
    writer.new_node("Connections").map_err(io_error)?;
    for (mesh, ids) in scene.meshes.iter().zip(mesh_ids) {
        write_connection(writer, "OO", ids.model, 0)?;
        write_connection(writer, "OO", ids.geometry, ids.model)?;
        write_connection(writer, "OO", ids.material, ids.model)?;
        if let (Some(texture), Some(video)) = (ids.texture, ids.video) {
            write_connection(writer, "OO", video, texture)?;
            write_property_connection(writer, texture, ids.material, "DiffuseColor")?;
        }
        if let Some(skin_id) = ids.skin {
            write_connection(writer, "OO", skin_id, ids.geometry)?;
            for (cluster, (_, cluster_id)) in mesh.clusters.iter().zip(&ids.clusters) {
                write_connection(writer, "OO", *cluster_id, skin_id)?;
                let bone_id = bone_ids
                    .get(cluster.bone_index)
                    .ok_or_else(|| anyhow!("Cluster references an invalid bone index"))?;
                write_connection(writer, "OO", bone_id.model, *cluster_id)?;
            }
        }
    }
    for (bone, ids) in scene.bones.iter().zip(bone_ids) {
        write_connection(writer, "OO", ids.attribute, ids.model)?;
        let parent = bone
            .parent_index
            .and_then(|index| bone_ids.get(index))
            .map(|ids| ids.model)
            .unwrap_or(0);
        write_connection(writer, "OO", ids.model, parent)?;
    }
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_begin_i32_attributed_node<W: Write + Seek>(
    writer: &mut Writer<W>,
    name: &str,
    value: i32,
) -> Result<()> {
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    attributes.append_i32(value).map_err(io_error)?;
    drop(attributes);
    Ok(())
}

fn write_definition<W: Write + Seek>(writer: &mut Writer<W>, name: &str, count: i32) -> Result<()> {
    {
        let mut attributes = writer.new_node("ObjectType").map_err(io_error)?;
        attributes.append_string_direct(name).map_err(io_error)?;
    }
    write_i32_node(writer, "Count", count)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_layer_element<W: Write + Seek>(writer: &mut Writer<W>, element_type: &str) -> Result<()> {
    writer.new_node("LayerElement").map_err(io_error)?;
    write_string_node(writer, "Type", element_type)?;
    write_i32_node(writer, "TypedIndex", 0)?;
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_connection<W: Write + Seek>(
    writer: &mut Writer<W>,
    connection_type: &str,
    child: i64,
    parent: i64,
) -> Result<()> {
    let mut attributes = writer.new_node("C").map_err(io_error)?;
    attributes
        .append_string_direct(connection_type)
        .map_err(io_error)?;
    attributes.append_i64(child).map_err(io_error)?;
    attributes.append_i64(parent).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_property_connection<W: Write + Seek>(
    writer: &mut Writer<W>,
    child: i64,
    parent: i64,
    property: &str,
) -> Result<()> {
    let mut attributes = writer.new_node("C").map_err(io_error)?;
    attributes.append_string_direct("OP").map_err(io_error)?;
    attributes.append_i64(child).map_err(io_error)?;
    attributes.append_i64(parent).map_err(io_error)?;
    attributes
        .append_string_direct(property)
        .map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_prop_int<W: Write + Seek>(writer: &mut Writer<W>, name: &str, value: i32) -> Result<()> {
    let mut attributes = writer.new_node("P").map_err(io_error)?;
    attributes.append_string_direct(name).map_err(io_error)?;
    attributes.append_string_direct("int").map_err(io_error)?;
    attributes
        .append_string_direct("Integer")
        .map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_i32(value).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_prop_visibility<W: Write + Seek>(writer: &mut Writer<W>, visible: bool) -> Result<()> {
    let mut attributes = writer.new_node("P").map_err(io_error)?;
    attributes
        .append_string_direct("Visibility")
        .map_err(io_error)?;
    attributes
        .append_string_direct("Visibility")
        .map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes
        .append_f64(if visible { 1.0 } else { 0.0 })
        .map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_prop_enum_int<W: Write + Seek>(
    writer: &mut Writer<W>,
    name: &str,
    value: i32,
) -> Result<()> {
    let mut attributes = writer.new_node("P").map_err(io_error)?;
    attributes.append_string_direct(name).map_err(io_error)?;
    attributes.append_string_direct("enum").map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_i32(value).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_prop_bool<W: Write + Seek>(writer: &mut Writer<W>, name: &str, value: bool) -> Result<()> {
    let mut attributes = writer.new_node("P").map_err(io_error)?;
    attributes.append_string_direct(name).map_err(io_error)?;
    attributes.append_string_direct("bool").map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes
        .append_i32(if value { 1 } else { 0 })
        .map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_prop_double<W: Write + Seek>(
    writer: &mut Writer<W>,
    name: &str,
    value: f64,
) -> Result<()> {
    let mut attributes = writer.new_node("P").map_err(io_error)?;
    attributes.append_string_direct(name).map_err(io_error)?;
    attributes
        .append_string_direct("double")
        .map_err(io_error)?;
    attributes
        .append_string_direct("Number")
        .map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_f64(value).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_prop_time<W: Write + Seek>(writer: &mut Writer<W>, name: &str, value: i64) -> Result<()> {
    let mut attributes = writer.new_node("P").map_err(io_error)?;
    attributes.append_string_direct(name).map_err(io_error)?;
    attributes.append_string_direct("KTime").map_err(io_error)?;
    attributes.append_string_direct("Time").map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_i64(value).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_prop_animation_component<W: Write + Seek>(
    writer: &mut Writer<W>,
    axis: char,
    value: f32,
) -> Result<()> {
    let mut attributes = writer.new_node("P").map_err(io_error)?;
    attributes
        .append_string_direct(&format!("d|{axis}"))
        .map_err(io_error)?;
    attributes
        .append_string_direct("Number")
        .map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_string_direct("A").map_err(io_error)?;
    attributes.append_f64(value as f64).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_prop_lcl<W: Write + Seek>(
    writer: &mut Writer<W>,
    name: &str,
    value: [f64; 3],
) -> Result<()> {
    let mut attributes = writer.new_node("P").map_err(io_error)?;
    attributes.append_string_direct(name).map_err(io_error)?;
    attributes.append_string_direct(name).map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_string_direct("A").map_err(io_error)?;
    for component in value {
        attributes.append_f64(component).map_err(io_error)?;
    }
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_prop_color<W: Write + Seek>(
    writer: &mut Writer<W>,
    name: &str,
    value: [f64; 3],
) -> Result<()> {
    let mut attributes = writer.new_node("P").map_err(io_error)?;
    attributes.append_string_direct(name).map_err(io_error)?;
    attributes.append_string_direct("Color").map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_string_direct("A").map_err(io_error)?;
    for component in value {
        attributes.append_f64(component).map_err(io_error)?;
    }
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_i32_node<W: Write + Seek>(writer: &mut Writer<W>, name: &str, value: i32) -> Result<()> {
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    attributes.append_i32(value).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_i64_node<W: Write + Seek>(writer: &mut Writer<W>, name: &str, value: i64) -> Result<()> {
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    attributes.append_i64(value).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_f64_node<W: Write + Seek>(writer: &mut Writer<W>, name: &str, value: f64) -> Result<()> {
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    attributes.append_f64(value).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_bool_node<W: Write + Seek>(writer: &mut Writer<W>, name: &str, value: bool) -> Result<()> {
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    attributes.append_bool(value).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_string_node<W: Write + Seek>(
    writer: &mut Writer<W>,
    name: &str,
    value: &str,
) -> Result<()> {
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    attributes.append_string_direct(value).map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_i32_array_node<W, I>(
    writer: &mut Writer<W>,
    name: &str,
    values: I,
    encoding: Option<ArrayAttributeEncoding>,
) -> Result<()>
where
    W: Write + Seek,
    I: IntoIterator<Item = i32>,
{
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    attributes
        .append_arr_i32_from_iter(encoding, values)
        .map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_i64_array_node<W, I>(
    writer: &mut Writer<W>,
    name: &str,
    values: I,
    encoding: Option<ArrayAttributeEncoding>,
) -> Result<()>
where
    W: Write + Seek,
    I: IntoIterator<Item = i64>,
{
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    attributes
        .append_arr_i64_from_iter(encoding, values)
        .map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_f32_array_node<W, I>(
    writer: &mut Writer<W>,
    name: &str,
    values: I,
    encoding: Option<ArrayAttributeEncoding>,
) -> Result<()>
where
    W: Write + Seek,
    I: IntoIterator<Item = f32>,
{
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    attributes
        .append_arr_f32_from_iter(encoding, values)
        .map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_f64_array_node<W, I>(
    writer: &mut Writer<W>,
    name: &str,
    values: I,
    encoding: Option<ArrayAttributeEncoding>,
) -> Result<()>
where
    W: Write + Seek,
    I: IntoIterator<Item = f64>,
{
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    attributes
        .append_arr_f64_from_iter(encoding, values)
        .map_err(io_error)?;
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_f64_values_node<W, I>(writer: &mut Writer<W>, name: &str, values: I) -> Result<()>
where
    W: Write + Seek,
    I: IntoIterator<Item = f64>,
{
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    for value in values {
        attributes.append_f64(value).map_err(io_error)?;
    }
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn write_i32_values_node<W, I>(writer: &mut Writer<W>, name: &str, values: I) -> Result<()>
where
    W: Write + Seek,
    I: IntoIterator<Item = i32>,
{
    let mut attributes = writer.new_node(name).map_err(io_error)?;
    for value in values {
        attributes.append_i32(value).map_err(io_error)?;
    }
    drop(attributes);
    writer.close_node().map_err(io_error)?;
    Ok(())
}

fn matrix_values(matrix: glam::Mat4) -> impl Iterator<Item = f64> {
    matrix.to_cols_array().into_iter().map(|value| value as f64)
}

fn decompose_fbx_trs(matrix: glam::Mat4) -> Result<([f64; 3], [f64; 3], [f64; 3], i32)> {
    let values = matrix.to_cols_array().map(|value| value as f64);
    let transform = ufbx::matrix_to_transform(&ufbx::Matrix {
        m00: values[0],
        m10: values[1],
        m20: values[2],
        m01: values[4],
        m11: values[5],
        m21: values[6],
        m02: values[8],
        m12: values[9],
        m22: values[10],
        m03: values[12],
        m13: values[13],
        m23: values[14],
    });
    let translation = [
        transform.translation.x,
        transform.translation.y,
        transform.translation.z,
    ];
    let scale = [transform.scale.x, transform.scale.y, transform.scale.z];
    let rotation_orders = [
        (ufbx::RotationOrder::Xyz, 1usize),
        (ufbx::RotationOrder::Xzy, 2usize),
        (ufbx::RotationOrder::Yzx, 2usize),
        (ufbx::RotationOrder::Yxz, 0usize),
        (ufbx::RotationOrder::Zxy, 0usize),
        (ufbx::RotationOrder::Zyx, 1usize),
    ];
    let (rotation_order, rotation) = rotation_orders
        .into_iter()
        .map(|(order, middle_axis)| {
            let euler = ufbx::quat_to_euler(transform.rotation, order);
            let rotation = [euler.x, euler.y, euler.z];
            let gimbal_margin = rotation[middle_axis].to_radians().cos().abs();
            (order, rotation, gimbal_margin)
        })
        .max_by(|left, right| left.2.total_cmp(&right.2))
        .map(|(order, rotation, _)| (order as i32, rotation))
        .ok_or_else(|| anyhow!("FBX rotation order list is empty"))?;
    if translation
        .iter()
        .chain(rotation.iter())
        .chain(scale.iter())
        .any(|value| !value.is_finite())
    {
        return Err(anyhow!("Bone local transform decomposition is non-finite"));
    }
    if scale.iter().any(|value| value.abs() <= 1e-10) {
        return Err(anyhow!("Bone local transform has a zero scale axis"));
    }

    Ok((translation, rotation, scale, rotation_order))
}

fn identity_matrix() -> impl Iterator<Item = f64> {
    matrix_values(glam::Mat4::IDENTITY)
}

fn compression() -> Option<ArrayAttributeEncoding> {
    Some(ArrayAttributeEncoding::Zlib)
}

fn sanitize_file_name(value: &str) -> String {
    let sanitized = value
        .trim()
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    if sanitized.is_empty() {
        "export".to_string()
    } else {
        sanitized
    }
}

fn sanitize_fbx_name(value: &str) -> String {
    let sanitized: String = value
        .trim()
        .chars()
        .map(|character| {
            if character.is_control() || matches!(character, ':' | '\0') {
                '_'
            } else {
                character
            }
        })
        .collect();
    if sanitized.is_empty() {
        "unnamed".to_string()
    } else {
        sanitized
    }
}

fn motion_fbx_bone_name(value: &str) -> Result<String> {
    if value
        .chars()
        .any(|character| character == '\0' || character.is_control())
    {
        return Err(anyhow!(
            "Bone name {value:?} contains a control character unsupported by FBX"
        ));
    }
    Ok(value.to_string())
}

fn fbx_name_class(name: &str, class: &str) -> String {
    // Keep the visible FBX object name identical to the source asset name.
    // Keep class namespaces out of visible FBX object names; only the internal
    // FBX class marker after the NUL separator is preserved for Blender's parser.
    format!("{name}\0\u{1}{class}")
}

fn next_unique_name(base_name: &str, used_names: &mut HashSet<String>) -> String {
    let mut candidate = base_name.to_string();
    let mut index = 1usize;
    while !used_names.insert(candidate.to_ascii_lowercase()) {
        candidate = format!("{base_name}_{index}");
        index += 1;
    }
    candidate
}

fn next_unique_texture_name(stem: &str, used_names: &mut HashSet<String>) -> String {
    let stem = sanitize_file_name(stem);
    let mut candidate = format!("{stem}.png");
    let mut index = 1usize;
    while !used_names.insert(candidate.to_ascii_lowercase()) {
        candidate = format!("{stem}_{index}.png");
        index += 1;
    }
    candidate
}

fn io_error(error: impl std::fmt::Display) -> std::io::Error {
    std::io::Error::other(error.to_string())
}

#[cfg(test)]
mod bone_transform_tests {
    use super::*;
    use glam::{Mat4, Quat, Vec3};

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-5,
            "expected {expected}, got {actual}"
        );
    }

    #[test]
    fn decompose_fbx_trs_preserves_local_translation_rotation_and_scale() {
        let matrix = Mat4::from_scale_rotation_translation(
            Vec3::new(2.0, 3.0, 4.0),
            Quat::from_rotation_z(std::f32::consts::FRAC_PI_2),
            Vec3::new(5.0, 6.0, 7.0),
        );

        let (translation, rotation, scale, _) = decompose_fbx_trs(matrix).unwrap();

        assert_close(translation[0], 5.0);
        assert_close(translation[1], 6.0);
        assert_close(translation[2], 7.0);
        assert_close(rotation[0], 0.0);
        assert_close(rotation[1], 0.0);
        assert_close(rotation[2], 90.0);
        assert_close(scale[0], 2.0);
        assert_close(scale[1], 3.0);
        assert_close(scale[2], 4.0);
    }

    fn assert_mat4_close(actual: Mat4, expected: Mat4) {
        let actual = actual.to_cols_array();
        let expected = expected.to_cols_array();
        for (index, (actual, expected)) in actual.iter().zip(expected.iter()).enumerate() {
            assert!(
                (actual - expected).abs() < 1e-5,
                "matrix[{index}] expected {expected}, got {actual}"
            );
        }
    }

    #[test]
    fn build_export_bones_keeps_source_local_pose() {
        use ssbh_data::skel_data::{BillboardType, BoneData};

        let child_local = Mat4::from_scale_rotation_translation(
            Vec3::ONE,
            Quat::from_rotation_y(std::f32::consts::PI),
            Vec3::new(-17.7831, 0.0, 0.0),
        );
        let skel = SkelData {
            major_version: 1,
            minor_version: 0,
            bones: vec![
                BoneData {
                    name: "GBL_RT".to_string(),
                    transform: Mat4::IDENTITY,
                    parent_index: None,
                    billboard_type: BillboardType::Disabled,
                },
                BoneData {
                    name: "ATH_E_VERNIER".to_string(),
                    transform: child_local,
                    parent_index: Some(0),
                    billboard_type: BillboardType::Disabled,
                },
            ],
        };

        let bones = build_export_bones(Some(&skel), 0.1).unwrap();

        assert_mat4_close(
            bones[1].local_transform,
            Mat4::from_scale_rotation_translation(
                Vec3::ONE,
                Quat::from_rotation_y(std::f32::consts::PI),
                Vec3::new(-1.77831, 0.0, 0.0),
            ),
        );
    }

    #[test]
    fn build_export_bones_scales_translation_without_recomposing_rotation() {
        use ssbh_data::skel_data::{BillboardType, BoneData};

        let source = Mat4::from_cols_array_2d(&[
            [0.0, -0.00000819905, 1.0, 0.0],
            [-0.34202000, 0.93969297, 0.00000770459, 0.0],
            [-0.93969297, -0.34202000, -0.00000280424, 0.0],
            [0.9, 0.3, 0.2, 1.0],
        ]);
        let skel = SkelData {
            major_version: 1,
            minor_version: 0,
            bones: vec![BoneData {
                name: "ATH_TE_R90".to_string(),
                transform: source,
                parent_index: None,
                billboard_type: BillboardType::Disabled,
            }],
        };
        let mut expected = source;
        expected.w_axis.x *= 0.1;
        expected.w_axis.y *= 0.1;
        expected.w_axis.z *= 0.1;

        let bones = build_export_bones(Some(&skel), 0.1).unwrap();

        assert!(
            bones[0].local_transform.abs_diff_eq(expected, 1e-7),
            "translation scaling must not alter the source 3x3 transform"
        );
    }

    #[test]
    fn source_local_fbx_roundtrips() -> Result<()> {
        let child_local = Mat4::from_scale_rotation_translation(
            Vec3::ONE,
            Quat::from_rotation_y(std::f32::consts::PI),
            Vec3::new(-1.77831, 0.0, 0.0),
        );
        let scene = ExportScene {
            meshes: Vec::new(),
            bones: vec![
                ExportBone {
                    name: "GBL_RT".to_string(),
                    parent_index: None,
                    local_transform: Mat4::IDENTITY,
                    world_transform: Mat4::IDENTITY,
                },
                ExportBone {
                    name: "ATH_E_VERNIER".to_string(),
                    parent_index: Some(0),
                    local_transform: child_local,
                    world_transform: child_local,
                },
            ],
        };

        let dir = tempfile::tempdir()?;
        let path = dir.path().join("source_local_no_props.fbx");
        write_scene_fbx(&path, &scene, FbxUpAxis::YUp)?;

        let imported = crate::ssbh_dae::parse_fbx_file(&path)?;
        assert_eq!(imported.bones.len(), 2);
        assert_eq!(imported.bones[0].name, "GBL_RT");
        assert_eq!(imported.bones[0].parent_index, None);
        assert_eq!(imported.bones[1].name, "ATH_E_VERNIER");
        assert_eq!(imported.bones[1].parent_index, Some(0));
        assert_mat4_close(
            Mat4::from_cols_array_2d(&imported.bones[1].transform),
            child_local,
        );

        Ok(())
    }

    #[test]
    fn source_local_fbx_roundtrips_near_xyz_gimbal_without_sidecar_matrix() -> Result<()> {
        let local_transform = Mat4::from_cols_array_2d(&[
            [0.0, -0.00000819905, 1.0, 0.0],
            [-0.34202000, 0.93969297, 0.00000770459, 0.0],
            [-0.93969297, -0.34202000, -0.00000280424, 0.0],
            [0.9, 0.3, 0.2, 1.0],
        ]);
        let scene = ExportScene {
            meshes: Vec::new(),
            bones: vec![ExportBone {
                name: "ATH_TE_R90".to_string(),
                parent_index: None,
                local_transform,
                world_transform: local_transform,
            }],
        };

        let dir = tempfile::tempdir()?;
        let path = dir.path().join("near_xyz_gimbal_no_props.fbx");
        write_scene_fbx(&path, &scene, FbxUpAxis::YUp)?;

        let imported = crate::ssbh_dae::parse_fbx_file(&path)?;
        assert_eq!(imported.bones.len(), 1);
        assert!(
            Mat4::from_cols_array_2d(&imported.bones[0].transform)
                .abs_diff_eq(local_transform, 1e-5),
            "FBX XYZ Euler decomposition changed the source local transform"
        );

        Ok(())
    }

    #[test]
    fn source_local_fbx_roundtrips_numerically_near_xyz_gimbal() -> Result<()> {
        let local_transform = Mat4::from_cols_array_2d(&[
            [0.0, -0.00000821054, 1.0, 0.0],
            [-0.34202000, 0.93969297, 0.00000771880, 0.0],
            [-0.93969297, -0.34201998, -0.00000274181, 0.0],
            [0.9, 0.3, 0.2, 1.0],
        ]);
        let scene = ExportScene {
            meshes: Vec::new(),
            bones: vec![ExportBone {
                name: "ATH_TE_R90".to_string(),
                parent_index: None,
                local_transform,
                world_transform: local_transform,
            }],
        };

        let dir = tempfile::tempdir()?;
        let path = dir.path().join("numerically_near_xyz_gimbal.fbx");
        write_scene_fbx(&path, &scene, FbxUpAxis::YUp)?;

        let imported = crate::ssbh_dae::parse_fbx_file(&path)?;
        assert_eq!(imported.bones.len(), 1);
        let imported_transform = Mat4::from_cols_array_2d(&imported.bones[0].transform);
        let decomposition = decompose_fbx_trs(local_transform)?;
        assert!(
            imported_transform.abs_diff_eq(local_transform, 1e-5),
            "FBX Euler decomposition must be stable near XYZ gimbal lock: decomposition={decomposition:?}, expected={:?}, actual={:?}",
            local_transform.to_cols_array_2d(),
            imported_transform.to_cols_array_2d()
        );

        Ok(())
    }

    #[test]
    fn source_skel_pipeline_roundtrips_near_xyz_gimbal_without_sidecar_matrix() -> Result<()> {
        use ssbh_data::skel_data::{BillboardType, BoneData};

        let source = Mat4::from_cols_array_2d(&[
            [0.0, -0.00000819905, 1.0, 0.0],
            [-0.34202000, 0.93969297, 0.00000770459, 0.0],
            [-0.93969297, -0.34202000, -0.00000280424, 0.0],
            [0.9, 0.3, 0.2, 1.0],
        ]);
        let skel = SkelData {
            major_version: 1,
            minor_version: 0,
            bones: vec![BoneData {
                name: "ATH_TE_R90".to_string(),
                transform: source,
                parent_index: None,
                billboard_type: BillboardType::Disabled,
            }],
        };
        let scene = ExportScene {
            meshes: Vec::new(),
            bones: build_export_bones(Some(&skel), 1.0)?,
        };

        let dir = tempfile::tempdir()?;
        let path = dir.path().join("source_skel_near_xyz_gimbal_no_props.fbx");
        write_scene_fbx(&path, &scene, FbxUpAxis::YUp)?;

        let imported = crate::ssbh_dae::parse_fbx_file(&path)?;
        assert_eq!(imported.bones.len(), 1);
        assert!(
            Mat4::from_cols_array_2d(&imported.bones[0].transform).abs_diff_eq(source, 1e-5),
            "the SSBH-to-FBX pipeline changed the near-gimbal local transform"
        );

        Ok(())
    }

    #[test]
    fn source_local_fbx_preserves_child_local_rotation_under_rotated_parent() -> Result<()> {
        let parent_local = Mat4::from_cols_array_2d(&[
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, -1.0, 0.0, 0.0],
            [2.4, 0.0, 0.0, 1.0],
        ]);
        let child_local = Mat4::from_cols_array_2d(&[
            [0.0, -0.00000819905, 1.0, 0.0],
            [-0.34202000, 0.93969297, 0.00000770459, 0.0],
            [-0.93969297, -0.34202000, -0.00000280424, 0.0],
            [0.9, 0.3, 0.2, 1.0],
        ]);
        let scene = ExportScene {
            meshes: Vec::new(),
            bones: vec![
                ExportBone {
                    name: "TE_R".to_string(),
                    parent_index: None,
                    local_transform: parent_local,
                    world_transform: parent_local,
                },
                ExportBone {
                    name: "ATH_TE_R90".to_string(),
                    parent_index: Some(0),
                    local_transform: child_local,
                    world_transform: parent_local * child_local,
                },
            ],
        };

        let dir = tempfile::tempdir()?;
        let path = dir.path().join("rotated_parent_no_props.fbx");
        write_scene_fbx(&path, &scene, FbxUpAxis::YUp)?;

        let imported = crate::ssbh_dae::parse_fbx_file(&path)?;
        assert_eq!(imported.bones.len(), 2);
        assert_eq!(imported.bones[1].parent_index, Some(0));
        assert!(
            Mat4::from_cols_array_2d(&imported.bones[1].transform).abs_diff_eq(child_local, 1e-5),
            "the parent transform must not alter the child's FBX local transform"
        );

        Ok(())
    }

    fn resolve_real_export_numdlb_path(path: PathBuf) -> Result<PathBuf> {
        if path.is_file() {
            return Ok(path);
        }
        if !path.is_dir() {
            return Err(anyhow!(
                "Real export root is not a file or directory: {}",
                path.display()
            ));
        }

        let mut candidates = std::fs::read_dir(&path)
            .with_context(|| format!("Failed to read {}", path.display()))?
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|candidate| {
                candidate
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("numdlb"))
            })
            .collect::<Vec<_>>();
        candidates.sort();
        candidates.into_iter().next().ok_or_else(|| {
            anyhow!(
                "Real export root directory contains no .numdlb file: {}",
                path.display()
            )
        })
    }

    #[test]
    fn export_real_unit_model_fbx_when_env_is_set() -> Result<()> {
        let Some(root_path) = std::env::var_os("SSBH_FBX_REAL_EXPORT_ROOT").map(PathBuf::from)
        else {
            eprintln!("SKIP: SSBH_FBX_REAL_EXPORT_ROOT is not set");
            return Ok(());
        };
        let Some(output_path) = std::env::var_os("SSBH_FBX_REAL_EXPORT_PATH").map(PathBuf::from)
        else {
            eprintln!("SKIP: SSBH_FBX_REAL_EXPORT_PATH is not set");
            return Ok(());
        };
        let root_path = resolve_real_export_numdlb_path(root_path)?;

        let output_dir = output_path
            .parent()
            .ok_or_else(|| anyhow!("Output path has no parent: {}", output_path.display()))?;
        std::fs::create_dir_all(output_dir)
            .with_context(|| format!("Failed to create {}", output_dir.display()))?;
        let output_name = output_path
            .file_stem()
            .ok_or_else(|| anyhow!("Output path has no file stem: {}", output_path.display()))?
            .to_string_lossy()
            .to_string();
        let config = ExportConfig {
            scale_factor: 1.0,
            up_axis: FbxUpAxis::YUp,
            export_textures: false,
        };
        let model = load_ssbh_model(root_path.to_string_lossy().as_ref())?;
        let mut texture_state = BatchTextureExportState::default();
        let (scene, _) = build_export_scene(&model, output_dir, &config, &mut texture_state)?;

        write_scene_fbx(&output_path, &scene, config.up_axis)?;
        let loaded = ufbx::load_file(
            output_path.to_string_lossy().as_ref(),
            ufbx::LoadOpts::default(),
        )
        .map_err(|e| {
            anyhow!(
                "ufbx failed to load exported FBX: {} - {}",
                e.description,
                e.info()
            )
        })?;
        assert!(
            !loaded.meshes.is_empty(),
            "exported FBX should contain meshes"
        );
        assert!(
            !loaded.nodes.is_empty(),
            "exported FBX should contain nodes"
        );
        eprintln!("exported {} as {}", output_name, output_path.display(),);
        Ok(())
    }
}
