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
const BONE_DIRECTION_EPSILON: f32 = 1e-5;

use crate::format::numatb_format::param_texture_path;
use crate::nutexb_lib;
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
        let local = glam::Mat4::from_cols_array_2d(&bone.transform);
        if !local.is_finite() {
            return Err(anyhow!("Bone '{}' has a non-finite transform", bone.name));
        }
        let (scale, rotation, mut translation) = local.to_scale_rotation_translation();
        translation *= scale_factor;
        local_transforms.push(glam::Mat4::from_scale_rotation_translation(
            scale,
            rotation,
            translation,
        ));
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

    let mut bones: Vec<ExportBone> = skel
        .bones
        .iter()
        .enumerate()
        .map(|(index, bone)| ExportBone {
            name: sanitize_fbx_name(&bone.name),
            parent_index: bone.parent_index,
            local_transform: local_transforms[index],
            world_transform: world_transforms[index],
        })
        .collect();
    apply_blender_bone_orientations(&mut bones)?;
    Ok(bones)
}

fn apply_blender_bone_orientations(bones: &mut [ExportBone]) -> Result<()> {
    if bones.is_empty() {
        return Ok(());
    }

    let mut children_by_parent: HashMap<usize, Vec<usize>> = HashMap::new();
    for (index, bone) in bones.iter().enumerate() {
        if let Some(parent_index) = bone.parent_index {
            if parent_index >= bones.len() {
                return Err(anyhow!(
                    "Bone '{}' has invalid parent index {}",
                    bone.name,
                    parent_index
                ));
            }
            children_by_parent
                .entry(parent_index)
                .or_default()
                .push(index);
        }
    }

    let source_worlds: Vec<glam::Mat4> = bones.iter().map(|bone| bone.world_transform).collect();
    let mut display_worlds = Vec::with_capacity(bones.len());
    for index in 0..bones.len() {
        let position = source_worlds[index].transform_point3(glam::Vec3::ZERO);
        let direction = bone_display_direction(
            index,
            &source_worlds,
            &children_by_parent,
            bones[index].parent_index,
        );
        let rotation = glam::Quat::from_rotation_arc(glam::Vec3::Y, direction);
        display_worlds.push(glam::Mat4::from_scale_rotation_translation(
            glam::Vec3::ONE,
            rotation,
            position,
        ));
    }

    for index in 0..bones.len() {
        let local_transform = if let Some(parent_index) = bones[index].parent_index {
            let parent_inverse = display_worlds[parent_index].inverse();
            if !parent_inverse.is_finite() {
                return Err(anyhow!(
                    "Bone '{}' has a non-invertible Blender display parent transform",
                    bones[index].name
                ));
            }
            parent_inverse * display_worlds[index]
        } else {
            display_worlds[index]
        };
        if !local_transform.is_finite() {
            return Err(anyhow!(
                "Bone '{}' has a non-finite Blender display local transform",
                bones[index].name
            ));
        }
        bones[index].local_transform = local_transform;
        bones[index].world_transform = display_worlds[index];
    }
    Ok(())
}

fn bone_display_direction(
    index: usize,
    source_worlds: &[glam::Mat4],
    children_by_parent: &HashMap<usize, Vec<usize>>,
    parent_index: Option<usize>,
) -> glam::Vec3 {
    let position = source_worlds[index].transform_point3(glam::Vec3::ZERO);
    if let Some(children) = children_by_parent.get(&index) {
        let mut direction_sum = glam::Vec3::ZERO;
        let mut first_direction = None;
        for &child_index in children {
            let child_position = source_worlds[child_index].transform_point3(glam::Vec3::ZERO);
            if let Some(direction) = normalize_direction(child_position - position) {
                direction_sum += direction;
                first_direction.get_or_insert(direction);
            }
        }
        if let Some(direction) = normalize_direction(direction_sum) {
            return direction;
        }
        if let Some(direction) = first_direction {
            return direction;
        }
    }

    if let Some(parent_index) = parent_index {
        let parent_position = source_worlds[parent_index].transform_point3(glam::Vec3::ZERO);
        if let Some(direction) = normalize_direction(position - parent_position) {
            return direction;
        }
    }

    normalize_direction(source_worlds[index].transform_vector3(glam::Vec3::Y))
        .unwrap_or(glam::Vec3::Y)
}

fn normalize_direction(value: glam::Vec3) -> Option<glam::Vec3> {
    if value.is_finite() && value.length_squared() > BONE_DIRECTION_EPSILON * BONE_DIRECTION_EPSILON
    {
        Some(value.normalize())
    } else {
        None
    }
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
        VectorData::Vector2(values) => Ok(values
            .iter()
            .map(|value| [value[0], value[1], 0.0])
            .collect()),
        VectorData::Vector3(values) => Ok(values.clone()),
        VectorData::Vector4(values) => Ok(values
            .iter()
            .map(|value| [value[0], value[1], value[2]])
            .collect()),
    }
}

fn vector_data_to_vec2(data: &VectorData) -> Result<Vec<[f32; 2]>> {
    match data {
        VectorData::Vector2(values) => Ok(values.clone()),
        VectorData::Vector3(values) => {
            Ok(values.iter().map(|value| [value[0], value[1]]).collect())
        }
        VectorData::Vector4(values) => {
            Ok(values.iter().map(|value| [value[0], value[1]]).collect())
        }
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
    write_prop_bool(writer, "Visibility", true)?;
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

    // This is the Blender-friendly rest transform. Cluster and bind-pose matrices
    // use the same converted hierarchy, so the mesh remains in bind pose while
    // Blender can draw connected bones along its local +Y convention.
    let (translation, rotation, scale) = decompose_fbx_trs(bone.local_transform)?;
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
    write_prop_bool(writer, "Visibility", true)?;
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

fn write_prop_bool<W: Write + Seek>(writer: &mut Writer<W>, name: &str, value: bool) -> Result<()> {
    let mut attributes = writer.new_node("P").map_err(io_error)?;
    attributes.append_string_direct(name).map_err(io_error)?;
    attributes.append_string_direct("bool").map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_string_direct("").map_err(io_error)?;
    attributes.append_i32(i32::from(value)).map_err(io_error)?;
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

fn decompose_fbx_trs(matrix: glam::Mat4) -> Result<([f64; 3], [f64; 3], [f64; 3])> {
    let values = matrix.to_cols_array().map(|value| value as f64);
    let translation = [values[12], values[13], values[14]];
    let scale_x = (values[0].powi(2) + values[1].powi(2) + values[2].powi(2)).sqrt();
    let scale_y = (values[4].powi(2) + values[5].powi(2) + values[6].powi(2)).sqrt();
    let scale_z = (values[8].powi(2) + values[9].powi(2) + values[10].powi(2)).sqrt();
    if scale_x <= 1e-10 || scale_y <= 1e-10 || scale_z <= 1e-10 {
        return Err(anyhow!("Bone local transform has a zero scale axis"));
    }

    let r00 = values[0] / scale_x;
    let r01 = values[1] / scale_x;
    let r02 = values[2] / scale_x;
    let r12 = values[6] / scale_y;
    let r22 = values[10] / scale_z;
    let y = (-r02).clamp(-1.0, 1.0).asin();
    let (x, z) = if y.cos().abs() > 1e-6 {
        (r12.atan2(r22), r01.atan2(r00))
    } else {
        let r10 = values[4] / scale_y;
        let r11 = values[5] / scale_y;
        let x = if y.is_sign_positive() {
            r10.atan2(r11)
        } else {
            (-r10).atan2(r11)
        };
        (x, 0.0)
    };

    Ok((
        translation,
        [x.to_degrees(), y.to_degrees(), z.to_degrees()],
        [scale_x, scale_y, scale_z],
    ))
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

        let (translation, rotation, scale) = decompose_fbx_trs(matrix).unwrap();

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

    fn assert_vec3_close(actual: Vec3, expected: Vec3) {
        assert!(
            actual.abs_diff_eq(expected, 1e-5),
            "expected {expected:?}, got {actual:?}"
        );
    }

    #[test]
    fn blender_bone_orientation_aligns_single_child_to_parent_y_axis() {
        let mut bones = vec![
            ExportBone {
                name: "parent".to_string(),
                parent_index: None,
                local_transform: Mat4::IDENTITY,
                world_transform: Mat4::IDENTITY,
            },
            ExportBone {
                name: "child".to_string(),
                parent_index: Some(0),
                local_transform: Mat4::from_translation(Vec3::new(2.0, 0.0, 0.0)),
                world_transform: Mat4::from_translation(Vec3::new(2.0, 0.0, 0.0)),
            },
        ];

        apply_blender_bone_orientations(&mut bones).unwrap();

        let parent_y = bones[0]
            .world_transform
            .transform_vector3(Vec3::Y)
            .normalize();
        let (_, _, child_local_translation) =
            bones[1].local_transform.to_scale_rotation_translation();
        let (_, _, child_world_translation) =
            bones[1].world_transform.to_scale_rotation_translation();

        assert_vec3_close(parent_y, Vec3::X);
        assert_vec3_close(child_local_translation, Vec3::new(0.0, 2.0, 0.0));
        assert_vec3_close(child_world_translation, Vec3::new(2.0, 0.0, 0.0));
    }

    fn single_child_y_alignment_counts(bones: &[ExportBone]) -> (usize, usize) {
        let mut children_by_parent: HashMap<usize, Vec<usize>> = HashMap::new();
        for (index, bone) in bones.iter().enumerate() {
            if let Some(parent_index) = bone.parent_index {
                children_by_parent
                    .entry(parent_index)
                    .or_default()
                    .push(index);
            }
        }

        let mut aligned = 0usize;
        let mut total = 0usize;
        for children in children_by_parent.values() {
            if children.len() != 1 {
                continue;
            }
            let (_, _, translation) = bones[children[0]]
                .local_transform
                .to_scale_rotation_translation();
            if translation.length() <= 1e-4 {
                continue;
            }
            total += 1;
            if translation.x.abs() <= 1e-3 && translation.z.abs() <= 1e-3 && translation.y > 0.0 {
                aligned += 1;
            }
        }
        (aligned, total)
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
        let (aligned, total) = single_child_y_alignment_counts(&scene.bones);
        assert!(
            total > 0,
            "real export should contain single-child bone chains"
        );
        assert_eq!(
            aligned, total,
            "all single-child bone chains should point child translation along Blender +Y"
        );

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
        eprintln!(
            "exported {} as {} with {}/{} single-child bones aligned",
            output_name,
            output_path.display(),
            aligned,
            total
        );
        Ok(())
    }
}
