//! Standalone domain support for the OB v27 EXVS common bundle.
//!
//! `0xCB665375` is a singleton preload bundle, not a legacy unit package. It
//! combines camera, model, and global-system resources. This module owns its
//! fixed paths and content-based naming so the legacy unit-model extractor does
//! not acquire common-specific branches.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::format::fhm2d::{
    extract_fhm2d_to_memory_impl, Fhm2dFormat, InMemoryFhm2dExtraction, InMemoryFhm2dFile,
    SubFileStructureEntry,
};
use crate::format::shl::{ShlFile, ShlRecord};
use crate::format::unit_model_models::UnitModelMutationResult;

pub const EXVS_COMMON_HASH_NAME: &str = "0xCB665375";
pub const EXVS_COMMON_PACKAGE_NAME: &str = "000common_000common_001";
pub const EXVS_COMMON_PREFIX: &str = "002chara";
pub const EXVS_COMMON_FHM2D_FILENAME: &str = "0xCB665375.fhm2d";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExvsCommonBundlePaths {
    pub source_fhm2d: PathBuf,
    pub model_root: PathBuf,
    pub structure_json: PathBuf,
    pub mod_fhm2d: PathBuf,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CommonResourceKind {
    Model,
    Texture,
    Camera,
    System,
    Control,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommonResourcePlacement {
    pub kind: CommonResourceKind,
    pub relative_path: PathBuf,
    pub read_only: bool,
    pub known: bool,
    pub sha256: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExvsCommonMaterializeResult {
    pub model_root: String,
    pub structure_json_path: String,
    pub total_files: usize,
    pub unique_physical_files: usize,
    pub logical_reference_count: usize,
    pub structure_reference_count: usize,
    pub unknown_resource_count: usize,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExvsCommonExtractResult {
    pub source_fhm2d: String,
    pub model_root: String,
    pub structure_json_path: String,
    pub total_files: usize,
    pub unique_physical_files: usize,
    pub logical_reference_count: usize,
    pub structure_reference_count: usize,
    pub unknown_resource_count: usize,
    pub warnings: Vec<String>,
    pub backup_model_root: Option<String>,
    pub backup_structure_json: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExvsCommonValidationError {
    pub phase: String,
    pub message: String,
    pub path: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExvsCommonValidationSummary {
    pub model_count: usize,
    pub texture_count: usize,
    pub shl_record_count: usize,
    pub unknown_resource_count: usize,
    pub total_files: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExvsCommonValidationResult {
    pub valid: bool,
    pub model_root: String,
    pub structure_json_path: String,
    pub summary: ExvsCommonValidationSummary,
    pub errors: Vec<ExvsCommonValidationError>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExvsCommonRepackResult {
    pub output_path: String,
    pub total_files: usize,
    pub output_size: usize,
    pub warnings: Vec<String>,
    pub backup_output_path: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExvsCommonMutationResult {
    pub model_root: String,
    pub structure_json_path: String,
    pub affected_model: Option<String>,
    pub model_id: Option<u32>,
    pub model_count: usize,
    pub total_files: usize,
    pub validation: ExvsCommonValidationResult,
    pub backup_model_root: Option<String>,
    pub backup_structure_json: Option<String>,
}

struct StagedCommonWorkspace {
    _temp_dir: tempfile::TempDir,
    model_root: PathBuf,
    structure_json: PathBuf,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommonInputFile {
    index: usize,
    file_type: String,
    file_index: i32,
    file_url: String,
}

#[derive(Deserialize)]
struct CommonInputStructure {
    #[serde(rename = "HashName")]
    hash_name: Option<String>,
    #[serde(rename = "Fhm2dTotalCount")]
    total_count: Option<usize>,
    #[serde(rename = "SubFileData")]
    files: Vec<CommonInputFile>,
    #[serde(rename = "SubFileStructure")]
    structure: Vec<SubFileStructureEntry>,
    #[serde(rename = "ExvsCommonProfile")]
    profile: Option<CommonProfile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommonProfile {
    package_hash: String,
    resources: Vec<CommonProfileResource>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommonProfileResource {
    file_index: i32,
    relative_path: String,
    kind: CommonResourceKind,
    read_only: bool,
    known: bool,
    original_sha256: String,
}

#[derive(Clone, Copy)]
struct ManifestEntry {
    sha256: &'static str,
    relative_path: &'static str,
    kind: CommonResourceKind,
    read_only: bool,
}

const MANIFEST: &[ManifestEntry] = &[
    entry(
        "2ec0584415da6f10fd9171ddc46345168bc5a18218dadb3a369d466ed3b0b30d",
        "camera/battle/big.nuanmb",
        CommonResourceKind::Camera,
        true,
    ),
    entry(
        "27e9c8a96713ece5f1eb246a75d4ce1fb40139ecf7a80ed33da0f467a543eb51",
        "camera/camera_motion.nusktb",
        CommonResourceKind::Camera,
        true,
    ),
    entry(
        "5da540b7883d79df77fb6ce1bcf40fd1b04762de05920e8ae51cfa418c6316f3",
        "camera/parameters/02winlose.vgsht2",
        CommonResourceKind::Camera,
        true,
    ),
    entry(
        "1ae857ea273efe3d7f8b99a22ba668bfa1bcc3191ca2cfe75e88313b0472c751",
        "camera/parameters/00system.vgsht2",
        CommonResourceKind::Camera,
        true,
    ),
    entry(
        "0132ba29ce31e9c8db32ee8b7cd68fceaba483b88cc386b1d0913eaf587a06ac",
        "camera/parameters/01waza.vgsht2",
        CommonResourceKind::Camera,
        true,
    ),
    entry(
        "6ffc51cc84a9cbc0b4d10e08676d70c3e2b5ce53363fa68c5d617e05c652ee3f",
        "camera/parameters/03cpubattle.vgsht2",
        CommonResourceKind::Camera,
        true,
    ),
    entry(
        "c378c22ae3fd973cf025df4a97f17f9f14a6f71332ef00d8f4e87a1878ce1f61",
        "models/wep_coop00/000common_000common_001_wep_coop00__maya__.nusktb",
        CommonResourceKind::Model,
        false,
    ),
    entry(
        "8a6f0e49ca3765f25fe4eb42ed9c7566dc49023b3d0c5cf372945216132946c0",
        "models/wep_coop00/000common_000common_001_wep_coop00__maya__.numatb",
        CommonResourceKind::Model,
        false,
    ),
    entry(
        "08ae69e50f0ccb006e33c0ded9871a0bcfb2264f97d160a460fd996df497f652",
        "models/wep_coop00/000common_000common_001_wep_coop00__nust__.numatb",
        CommonResourceKind::Model,
        false,
    ),
    entry(
        "be34090b6ea44e1cf78d090a592e7142d8a51f21c87ef50670169fbdf438aacf",
        "models/wep_coop00/000common_000common_001_wep_coop00__maya__.numshb",
        CommonResourceKind::Model,
        false,
    ),
    entry(
        "f97b8c4065a2ca067679af9ef4a4d702492249dc4ee89104cfca1aaa1a3b62ff",
        "models/wep_coop00/000common_000common_001_wep_coop00.numdlb",
        CommonResourceKind::Model,
        false,
    ),
    entry(
        "61800d832c81a1e7769d848f1cd324f8853a5150b6afc57a8822c16e19099b4c",
        "models/wep_coop00/000common_000common_001_wep_coop00.jnttbl",
        CommonResourceKind::Model,
        false,
    ),
    entry(
        "c34ea8565690cde58bc5019a5c061fee25641ca5bab4f3c9c52409f334df80d0",
        "control/shell_000common_000common_001.shl",
        CommonResourceKind::Control,
        false,
    ),
    entry(
        "c1ed3169f90bc9288e59a6ca8c5874e1eee55fe152a29dcdbdc79a6fb8158876",
        "camera/stage_intro/stage_intro_camera_group.bin",
        CommonResourceKind::Camera,
        true,
    ),
    entry(
        "9ce8aa35ea4797a9d7c1f7ebe6649e45fce8511396125cbdc13f803393b54bad",
        "system/awakening_param.vgsht2",
        CommonResourceKind::System,
        true,
    ),
    entry(
        "e0144b0c8c8896d57b1e29113dcf793c41b9d1bc25567b50a5532b6c658d7771",
        "system/interaction/interactionid_000common_000common_001.vgsht2",
        CommonResourceKind::System,
        true,
    ),
    entry(
        "8ed9090bbf90a6f010f42aeef4b19f64bd2a1d297b8f5c7dfa75d3b3e2184f9a",
        "system/battle_system_param.vgsht2",
        CommonResourceKind::System,
        true,
    ),
    entry(
        "2ea36964f2e1b55d9c4464e433e2f15be223ac18e4992256adab309c60b0e073",
        "system/mode_adjust/ultimate_battle_adjust_param.vgsht2",
        CommonResourceKind::System,
        true,
    ),
    entry(
        "1c06be9866dbed357f294cee1a7f904cce684116b0d8de3f5bd14c7566f36def",
        "system/mode_adjust/enemy_adjust_param.vgsht2",
        CommonResourceKind::System,
        true,
    ),
    entry(
        "a011383050c6ae3a1f5f744c89ef14837a2053ef77b7a7ecf6cefcb06e37f1a8",
        "system/mode_adjust/winning_streak_adjust_param.vgsht2",
        CommonResourceKind::System,
        true,
    ),
    entry(
        "de3c9ea45d9b9428bf9bdb3a75e9ab44f749ed8a9333457326e167bbd8ea1dd0",
        "system/mode_adjust/total_adjust_param.vgsht2",
        CommonResourceKind::System,
        true,
    ),
    entry(
        "7db8c434fae6c385aa94d8769235763a9daa2b462d2d8e21580cf17978ade1ff",
        "system/mode_adjust/triad_adjust_edit_param.vgsht2",
        CommonResourceKind::System,
        true,
    ),
    entry(
        "b9208d13642fa298e0eff085e18f738c0079eba4d5b7b35a18422603069c4391",
        "system/mode_adjust/triad_adjust_skill_param.vgsht2",
        CommonResourceKind::System,
        true,
    ),
    entry(
        "f6ee37666080aa712f82156508c0f5dfbb97f083474c5cf8c609b0466756a4f2",
        "system/mode_adjust/triad_adjust_bonus_param.vgsht2",
        CommonResourceKind::System,
        true,
    ),
];

const fn entry(
    sha256: &'static str,
    relative_path: &'static str,
    kind: CommonResourceKind,
    read_only: bool,
) -> ManifestEntry {
    ManifestEntry {
        sha256,
        relative_path,
        kind,
        read_only,
    }
}

pub fn resolve_exvs_common_bundle_paths(
    extract_output_path: &str,
    ob_dplcache_path: &str,
    ob_mod_path: &str,
) -> Result<ExvsCommonBundlePaths, String> {
    let extract_root = required_directory_setting(extract_output_path, "Extract Output Path")?;
    let dplcache_root = required_directory_setting(ob_dplcache_path, "OB DPLCache Path")?;
    let mod_root = if ob_mod_path.trim().is_empty() {
        None
    } else {
        Some(PathBuf::from(ob_mod_path.trim()))
    };
    let prefix_root = extract_root.join(EXVS_COMMON_PREFIX);
    Ok(ExvsCommonBundlePaths {
        source_fhm2d: dplcache_root.join(EXVS_COMMON_FHM2D_FILENAME),
        model_root: prefix_root.join(EXVS_COMMON_PACKAGE_NAME),
        structure_json: prefix_root.join(format!("{EXVS_COMMON_PACKAGE_NAME}_structure.json")),
        mod_fhm2d: mod_root
            .map(|root| root.join(EXVS_COMMON_FHM2D_FILENAME))
            .unwrap_or_default(),
    })
}

pub fn classify_common_resource(file: &InMemoryFhm2dFile) -> CommonResourcePlacement {
    classify_common_payload(&file.file_type, &file.data)
}

/// Decode the fixed source package from the configured DPLCache directory and
/// atomically install a semantic workspace under `002chara`.
pub fn extract_exvs_common_bundle_impl(
    extract_output_path: &str,
    ob_dplcache_path: &str,
    overwrite: bool,
) -> Result<ExvsCommonExtractResult, String> {
    let extract_root = required_directory_setting(extract_output_path, "Extract Output Path")?;
    let dplcache_root = required_directory_setting(ob_dplcache_path, "OB DPLCache Path")?;
    let source_fhm2d = dplcache_root.join(EXVS_COMMON_FHM2D_FILENAME);
    if !source_fhm2d.is_file() {
        return Err(format!(
            "EXVS common source does not exist in OB DPLCache Path: {}",
            source_fhm2d.display()
        ));
    }

    let prefix_root = extract_root.join(EXVS_COMMON_PREFIX);
    let model_root = prefix_root.join(EXVS_COMMON_PACKAGE_NAME);
    let structure_json = prefix_root.join(format!("{EXVS_COMMON_PACKAGE_NAME}_structure.json"));
    if !overwrite && (model_root.exists() || structure_json.exists()) {
        return Err(format!(
            "EXVS common workspace already exists at {}. Open it or explicitly re-extract with overwrite.",
            model_root.display()
        ));
    }

    fs::create_dir_all(&prefix_root).map_err(|error| {
        format!(
            "Failed to create EXVS common prefix directory {}: {error}",
            prefix_root.display()
        )
    })?;
    let source_bytes = fs::read(&source_fhm2d).map_err(|error| {
        format!(
            "Failed to read EXVS common source {}: {error}",
            source_fhm2d.display()
        )
    })?;
    let extraction = extract_fhm2d_to_memory_impl(
        &source_bytes,
        EXVS_COMMON_PACKAGE_NAME,
        Some(Fhm2dFormat::ExvsCommon),
    )?;

    let staging = tempfile::Builder::new()
        .prefix(".exvs-common-extract-")
        .tempdir_in(&prefix_root)
        .map_err(|error| {
            format!(
                "Failed to create EXVS common staging directory in {}: {error}",
                prefix_root.display()
            )
        })?;
    let staging_model_root = staging.path().join(EXVS_COMMON_PACKAGE_NAME);
    let staging_structure = staging
        .path()
        .join(format!("{EXVS_COMMON_PACKAGE_NAME}_structure.json"));
    let materialized =
        materialize_exvs_common_extraction(&extraction, &staging_model_root, &staging_structure)?;
    let (backup_model_root, backup_structure_json) = install_staged_workspace(
        &staging_model_root,
        &staging_structure,
        &model_root,
        &structure_json,
        overwrite,
    )?;

    Ok(ExvsCommonExtractResult {
        source_fhm2d: source_fhm2d.to_string_lossy().to_string(),
        model_root: model_root.to_string_lossy().to_string(),
        structure_json_path: structure_json.to_string_lossy().to_string(),
        total_files: materialized.total_files,
        unique_physical_files: materialized.unique_physical_files,
        logical_reference_count: materialized.logical_reference_count,
        structure_reference_count: materialized.structure_reference_count,
        unknown_resource_count: materialized.unknown_resource_count,
        warnings: materialized.warnings,
        backup_model_root: backup_model_root.map(|path| path.to_string_lossy().to_string()),
        backup_structure_json: backup_structure_json.map(|path| path.to_string_lossy().to_string()),
    })
}

/// Validate the common profile without applying legacy unit-package rules such
/// as `nuhlpb_count == model_count`.
pub fn validate_exvs_common_bundle(
    model_root: &str,
    structure_json_path: &str,
) -> ExvsCommonValidationResult {
    let model_root_path = PathBuf::from(model_root.trim());
    let structure_path = PathBuf::from(structure_json_path.trim());
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut summary = ExvsCommonValidationSummary {
        model_count: 0,
        texture_count: 0,
        shl_record_count: 0,
        unknown_resource_count: 0,
        total_files: 0,
    };

    if model_root_path.file_name().and_then(|name| name.to_str()) != Some(EXVS_COMMON_PACKAGE_NAME)
    {
        push_validation_error(
            &mut errors,
            "profile",
            format!("EXVS common model root must be named {EXVS_COMMON_PACKAGE_NAME}."),
            Some(&model_root_path),
        );
    }
    let raw = match fs::read_to_string(&structure_path) {
        Ok(raw) => raw,
        Err(error) => {
            push_validation_error(
                &mut errors,
                "structure",
                format!("Failed to read EXVS common structure: {error}"),
                Some(&structure_path),
            );
            return validation_result(model_root_path, structure_path, summary, errors, warnings);
        }
    };
    let input: CommonInputStructure = match serde_json::from_str(&raw) {
        Ok(input) => input,
        Err(error) => {
            push_validation_error(
                &mut errors,
                "structure",
                format!("Failed to parse EXVS common structure: {error}"),
                Some(&structure_path),
            );
            return validation_result(model_root_path, structure_path, summary, errors, warnings);
        }
    };
    summary.total_files = input.files.len();
    if input.hash_name.as_deref() != Some(EXVS_COMMON_HASH_NAME) {
        push_validation_error(
            &mut errors,
            "profile",
            format!("HashName must be {EXVS_COMMON_HASH_NAME}."),
            Some(&structure_path),
        );
    }
    if input.total_count != Some(input.files.len()) {
        push_validation_error(
            &mut errors,
            "structure",
            format!(
                "Fhm2dTotalCount {:?} does not match SubFileData length {}.",
                input.total_count,
                input.files.len()
            ),
            Some(&structure_path),
        );
    }

    let profile = input.profile.as_ref();
    if profile.map(|value| value.package_hash.as_str()) != Some(EXVS_COMMON_HASH_NAME) {
        push_validation_error(
            &mut errors,
            "profile",
            "ExvsCommonProfile is missing or belongs to a different package.".to_string(),
            Some(&structure_path),
        );
    }
    let profile_by_index = profile
        .map(|value| {
            value
                .resources
                .iter()
                .map(|resource| (resource.file_index, resource))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();

    validate_structure_entries(&input, &structure_path, &mut errors);
    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));
    let mut current_indices = std::collections::HashSet::new();
    let mut resources_by_model: HashMap<String, std::collections::HashSet<String>> = HashMap::new();
    let mut available_textures = std::collections::HashSet::new();
    let mut numatb_paths = Vec::new();
    let mut shl_paths = Vec::new();

    for (expected_index, file) in input.files.iter().enumerate() {
        if !current_indices.insert(file.file_index) {
            push_validation_error(
                &mut errors,
                "structure",
                format!("Duplicate SubFileData fileIndex {}.", file.file_index),
                Some(&structure_path),
            );
        }
        if file.index != expected_index {
            push_validation_error(
                &mut errors,
                "structure",
                format!(
                    "SubFileData index {} does not match its position {expected_index}.",
                    file.index
                ),
                Some(&structure_path),
            );
        }
        let Some(path) = resolve_common_file_url(json_dir, &file.file_url) else {
            push_validation_error(
                &mut errors,
                "structure",
                format!("Unsafe or foreign fileUrl '{}'.", file.file_url),
                Some(&structure_path),
            );
            continue;
        };
        if !path.is_file() {
            push_validation_error(
                &mut errors,
                "files",
                format!("Referenced common resource is missing: {}", path.display()),
                Some(&path),
            );
            continue;
        }
        let relative = common_relative_from_file_url(&file.file_url).unwrap_or_default();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| format!(".{}", value.to_ascii_lowercase()))
            .unwrap_or_else(|| file.file_type.to_ascii_lowercase());
        if let Some(model_name) = model_name_from_relative(&relative) {
            resources_by_model
                .entry(model_name)
                .or_default()
                .insert(extension.clone());
        }
        if extension == ".numatb" {
            numatb_paths.push(path.clone());
        }
        if extension == ".shl" {
            shl_paths.push(path.clone());
        }
        if extension == ".nutexb" {
            summary.texture_count += 1;
            match fs::read(&path)
                .map_err(|error| error.to_string())
                .and_then(|bytes| super::fhm2d::parse_nutexb_name(&bytes))
            {
                Ok(name) => {
                    available_textures
                        .insert(super::unit_model_models::normalize_texture_filename(&name));
                }
                Err(error) => push_validation_error(
                    &mut errors,
                    "textures",
                    format!(
                        "Failed to read texture identity {}: {error}",
                        path.display()
                    ),
                    Some(&path),
                ),
            }
        }

        let manifest_entry = profile_by_index.get(&file.file_index).copied();
        if relative.starts_with("unknown/")
            || manifest_entry.is_some_and(|original| !original.known)
        {
            summary.unknown_resource_count += 1;
            push_validation_error(
                &mut errors,
                "unknown",
                format!("Unknown resource blocks repack: {relative}"),
                Some(&path),
            );
        }
        match manifest_entry {
            Some(original) => {
                if let Ok(bytes) = fs::read(&path) {
                    let current_hash = sha256_hex(&bytes);
                    if current_hash != original.original_sha256 {
                        if original.read_only {
                            warnings.push(format!(
                                "High-risk read-only common resource was modified: {}",
                                path.display()
                            ));
                        } else if original.kind == CommonResourceKind::Model {
                            warnings.push(format!(
                                "Original common model resource was modified: {}",
                                path.display()
                            ));
                        } else if extension == ".shl" {
                            warnings.push(format!(
                                "High-risk common SHL differs from the extracted original: {}",
                                path.display()
                            ));
                        }
                    }
                }
            }
            None if !relative.starts_with("models/") && !relative.starts_with("textures/") => {
                summary.unknown_resource_count += 1;
                push_validation_error(
                    &mut errors,
                    "unknown",
                    format!("Unmanifested common resource blocks repack: {relative}"),
                    Some(&path),
                );
            }
            None => {}
        }
    }

    for original in profile_by_index.values() {
        if current_indices.contains(&original.file_index) {
            continue;
        }
        if original.read_only {
            push_validation_error(
                &mut errors,
                "read-only",
                format!(
                    "Required read-only common resource was removed: {}",
                    original.relative_path
                ),
                Some(&structure_path),
            );
        } else if original.kind == CommonResourceKind::Model {
            warnings.push(format!(
                "Original common model resource was removed: {}",
                original.relative_path
            ));
        }
    }

    summary.model_count = resources_by_model.len();
    validate_model_resource_sets(&resources_by_model, &model_root_path, &mut errors);
    for numatb_path in numatb_paths {
        match super::unit_model_textures::read_numatb_texture_names(&numatb_path) {
            Ok(names) => {
                for name in names {
                    if !available_textures.contains(&name) {
                        push_validation_error(
                            &mut errors,
                            "textures",
                            format!(
                                "NUMATB {} references missing texture '{}'.",
                                numatb_path.display(),
                                name
                            ),
                            Some(&numatb_path),
                        );
                    }
                }
            }
            Err(error) => push_validation_error(&mut errors, "numatb", error, Some(&numatb_path)),
        }
    }
    validate_common_shl(&shl_paths, summary.model_count, &mut summary, &mut errors);

    validation_result(model_root_path, structure_path, summary, errors, warnings)
}

/// Validate and repack only to the configured OB mod directory. The DPLCache
/// source is never used as an output target.
pub fn repack_exvs_common_bundle_impl(
    model_root: &str,
    structure_json_path: &str,
    ob_mod_path: &str,
    confirm_high_risk: bool,
) -> Result<ExvsCommonRepackResult, String> {
    let validation = validate_exvs_common_bundle(model_root, structure_json_path);
    if !validation.valid {
        let first = validation
            .errors
            .first()
            .map(|error| error.message.as_str())
            .unwrap_or("unknown validation failure");
        return Err(format!(
            "EXVS common repack blocked by {} validation issue(s): {first}",
            validation.errors.len()
        ));
    }
    let has_high_risk_changes = validation
        .warnings
        .iter()
        .any(|warning| warning.contains("High-risk"));
    if has_high_risk_changes && !confirm_high_risk {
        return Err(
            "EXVS common repack requires explicit confirmation for high-risk SHL/read-only changes."
                .to_string(),
        );
    }

    let mod_root = required_directory_setting(ob_mod_path, "OB Mod Path")?;
    fs::create_dir_all(&mod_root).map_err(|error| {
        format!(
            "Failed to create OB Mod Path {}: {error}",
            mod_root.display()
        )
    })?;
    let output_path = mod_root.join(EXVS_COMMON_FHM2D_FILENAME);
    let staging_dir = tempfile::Builder::new()
        .prefix(".exvs-common-repack-")
        .tempdir_in(&mod_root)
        .map_err(|error| {
            format!(
                "Failed to create EXVS common repack staging directory in {}: {error}",
                mod_root.display()
            )
        })?;
    let staging_output = staging_dir.path().join(EXVS_COMMON_FHM2D_FILENAME);
    let repacked = super::fhm2d_pack::repack_fhm2d_from_structure(
        structure_json_path,
        &staging_output.to_string_lossy(),
        false,
        None,
    )?;

    let backup_output = if output_path.exists() {
        let backup = unique_mod_backup_path(&output_path)?;
        if let Err(error) = fs::rename(&output_path, &backup) {
            let _ = fs::remove_file(&staging_output);
            return Err(format!(
                "Failed to back up existing EXVS common mod output {}: {error}",
                output_path.display()
            ));
        }
        Some(backup)
    } else {
        None
    };
    if let Err(error) = fs::rename(&staging_output, &output_path) {
        if let Some(backup) = &backup_output {
            let _ = fs::rename(backup, &output_path);
        }
        return Err(format!(
            "Failed to atomically install EXVS common mod output {}: {error}",
            output_path.display()
        ));
    }

    Ok(ExvsCommonRepackResult {
        output_path: output_path.to_string_lossy().to_string(),
        total_files: repacked.total_files,
        output_size: repacked.output_size,
        warnings: validation.warnings,
        backup_output_path: backup_output.map(|path| path.to_string_lossy().to_string()),
    })
}

pub fn add_exvs_common_model(
    model_root: &str,
    structure_json_path: &str,
    source_dir: &str,
    model_id: u32,
) -> Result<ExvsCommonMutationResult, String> {
    ensure_common_workspace_valid(model_root, structure_json_path)?;
    let source = super::unit_model_models::validate_unit_model_source_folder(source_dir)?;
    let staged = stage_common_workspace(model_root, structure_json_path)?;
    let mut shl = read_common_shl(&staged.model_root)?;
    if shl.records.iter().any(|record| record.model_id == model_id) {
        return Err(format!(
            "EXVS common SHL already contains model ID 0x{model_id:08X}."
        ));
    }
    let mutation = super::unit_model_models::add_unit_model_model_without_nuhlpb(
        &staged.model_root.to_string_lossy(),
        Some(&staged.structure_json.to_string_lossy()),
        source_dir,
    )?;
    let model_names = super::unit_model_models::list_unit_model_model_names(
        &staged.model_root.to_string_lossy(),
        Some(&staged.structure_json.to_string_lossy()),
    )?;
    let folder_index = model_names
        .iter()
        .position(|name| name == &source.model_name)
        .ok_or_else(|| {
            format!(
                "Added model '{}' was not found in the common structure.",
                source.model_name
            )
        })?;
    add_common_shl_model_record(&mut shl, model_id, folder_index as u32)?;
    write_common_shl(&staged.model_root, &shl)?;
    finish_common_mutation(
        staged,
        Path::new(model_root),
        Path::new(structure_json_path),
        mutation,
        Some(source.model_name),
        Some(model_id),
    )
}

pub fn remove_exvs_common_model(
    model_root: &str,
    structure_json_path: &str,
    model_name: &str,
) -> Result<ExvsCommonMutationResult, String> {
    ensure_common_workspace_valid(model_root, structure_json_path)?;
    let staged = stage_common_workspace(model_root, structure_json_path)?;
    let model_names = super::unit_model_models::list_unit_model_model_names(
        &staged.model_root.to_string_lossy(),
        Some(&staged.structure_json.to_string_lossy()),
    )?;
    let removed_index = model_names
        .iter()
        .position(|name| name == model_name)
        .ok_or_else(|| format!("Model '{model_name}' was not found in the common structure."))?;
    let mutation = super::unit_model_models::remove_unit_model_model(
        &staged.model_root.to_string_lossy(),
        Some(&staged.structure_json.to_string_lossy()),
        model_name,
    )?;
    let mut shl = read_common_shl(&staged.model_root)?;
    remove_common_shl_model_records(&mut shl, removed_index as u32);
    write_common_shl(&staged.model_root, &shl)?;
    finish_common_mutation(
        staged,
        Path::new(model_root),
        Path::new(structure_json_path),
        mutation,
        Some(model_name.to_string()),
        None,
    )
}

pub fn replace_exvs_common_model(
    model_root: &str,
    structure_json_path: &str,
    target_model_name: &str,
    source_dir: &str,
) -> Result<ExvsCommonMutationResult, String> {
    ensure_common_workspace_valid(model_root, structure_json_path)?;
    let staged = stage_common_workspace(model_root, structure_json_path)?;
    let mutation = super::unit_model_models::replace_unit_model_model(
        &staged.model_root.to_string_lossy(),
        Some(&staged.structure_json.to_string_lossy()),
        target_model_name,
        source_dir,
    )?;
    finish_common_mutation(
        staged,
        Path::new(model_root),
        Path::new(structure_json_path),
        mutation,
        Some(target_model_name.to_string()),
        None,
    )
}

pub fn add_exvs_common_texture(
    model_root: &str,
    structure_json_path: &str,
    source_path: &str,
    target_filename: &str,
) -> Result<ExvsCommonMutationResult, String> {
    ensure_common_workspace_valid(model_root, structure_json_path)?;
    let staged = stage_common_workspace(model_root, structure_json_path)?;
    let inventory = super::unit_model_textures::add_unit_model_nutexb(
        &staged.model_root.to_string_lossy(),
        Some(&staged.structure_json.to_string_lossy()),
        source_path,
        target_filename,
    )?;
    let validation = validate_exvs_common_bundle(
        &staged.model_root.to_string_lossy(),
        &staged.structure_json.to_string_lossy(),
    );
    let mutation = UnitModelMutationResult {
        model_root: inventory.model_root,
        structure_json_path: inventory.structure_json_path,
        model_count: validation.summary.model_count,
        total_files: validation.summary.total_files,
        removed_files: Vec::new(),
    };
    finish_common_mutation(
        staged,
        Path::new(model_root),
        Path::new(structure_json_path),
        mutation,
        None,
        None,
    )
}

pub fn remove_exvs_common_texture(
    model_root: &str,
    structure_json_path: &str,
    file_index: i32,
) -> Result<ExvsCommonMutationResult, String> {
    ensure_common_workspace_valid(model_root, structure_json_path)?;
    let staged = stage_common_workspace(model_root, structure_json_path)?;
    let inventory = super::unit_model_textures::remove_unit_model_nutexb(
        &staged.model_root.to_string_lossy(),
        Some(&staged.structure_json.to_string_lossy()),
        file_index,
    )?;
    let validation = validate_exvs_common_bundle(
        &staged.model_root.to_string_lossy(),
        &staged.structure_json.to_string_lossy(),
    );
    let mutation = UnitModelMutationResult {
        model_root: inventory.model_root,
        structure_json_path: inventory.structure_json_path,
        model_count: validation.summary.model_count,
        total_files: validation.summary.total_files,
        removed_files: Vec::new(),
    };
    finish_common_mutation(
        staged,
        Path::new(model_root),
        Path::new(structure_json_path),
        mutation,
        None,
        None,
    )
}

pub fn save_exvs_common_shl(
    model_root: &str,
    structure_json_path: &str,
    shl: &ShlFile,
) -> Result<ExvsCommonMutationResult, String> {
    ensure_common_workspace_valid(model_root, structure_json_path)?;
    let staged = stage_common_workspace(model_root, structure_json_path)?;
    write_common_shl(&staged.model_root, shl)?;
    let validation = validate_exvs_common_bundle(
        &staged.model_root.to_string_lossy(),
        &staged.structure_json.to_string_lossy(),
    );
    let mutation = UnitModelMutationResult {
        model_root: staged.model_root.to_string_lossy().to_string(),
        structure_json_path: staged.structure_json.to_string_lossy().to_string(),
        model_count: validation.summary.model_count,
        total_files: validation.summary.total_files,
        removed_files: Vec::new(),
    };
    finish_common_mutation(
        staged,
        Path::new(model_root),
        Path::new(structure_json_path),
        mutation,
        None,
        None,
    )
}

pub fn sync_exvs_common_texture_containers(
    model_root: &str,
    structure_json_path: &str,
) -> Result<bool, String> {
    ensure_common_workspace_valid(model_root, structure_json_path)?;
    let staged = stage_common_workspace(model_root, structure_json_path)?;
    let changed = super::unit_model_models::sync_unit_model_texture_containers(
        &staged.model_root.to_string_lossy(),
        Some(&staged.structure_json.to_string_lossy()),
    )?;
    if !changed {
        return Ok(false);
    }
    let validation = validate_exvs_common_bundle(
        &staged.model_root.to_string_lossy(),
        &staged.structure_json.to_string_lossy(),
    );
    if !validation.valid {
        let first = validation
            .errors
            .first()
            .map(|error| error.message.as_str())
            .unwrap_or("unknown validation failure");
        return Err(format!(
            "EXVS common texture-container sync failed validation: {first}"
        ));
    }
    install_staged_workspace(
        &staged.model_root,
        &staged.structure_json,
        Path::new(model_root),
        Path::new(structure_json_path),
        true,
    )?;
    Ok(true)
}

pub fn add_common_shl_model_record(
    shl: &mut ShlFile,
    model_id: u32,
    folder_index: u32,
) -> Result<(), String> {
    if shl.records.iter().any(|record| record.model_id == model_id) {
        return Err(format!("Duplicate common model ID 0x{model_id:08X}."));
    }
    shl.records.push(ShlRecord {
        model_id,
        model_type: 6,
        folder_index,
        unk1: 0,
        slot_index: folder_index,
    });
    Ok(())
}

pub fn remove_common_shl_model_records(shl: &mut ShlFile, removed_index: u32) {
    shl.records.retain(|record| {
        record.folder_index != removed_index && record.slot_index != removed_index
    });
    for record in &mut shl.records {
        if record.folder_index > removed_index {
            record.folder_index -= 1;
        }
        if record.slot_index > removed_index {
            record.slot_index -= 1;
        }
    }
}

/// Write an already-decoded common package into its semantic editor layout.
///
/// Callers performing replacement must pass staging paths and swap them only
/// after this function succeeds. Equal payloads that resolve to the same path
/// are written once while each logical `SubFileData` entry remains present.
pub fn materialize_exvs_common_extraction(
    extraction: &InMemoryFhm2dExtraction,
    model_root: &Path,
    structure_json: &Path,
) -> Result<ExvsCommonMaterializeResult, String> {
    if model_root.exists() {
        return Err(format!(
            "EXVS common staging root already exists: {}",
            model_root.display()
        ));
    }
    let structure_parent = structure_json.parent().ok_or_else(|| {
        format!(
            "EXVS common structure path has no parent: {}",
            structure_json.display()
        )
    })?;
    fs::create_dir_all(model_root).map_err(|error| {
        format!(
            "Failed to create EXVS common staging root {}: {error}",
            model_root.display()
        )
    })?;
    fs::create_dir_all(structure_parent).map_err(|error| {
        format!(
            "Failed to create EXVS common structure directory {}: {error}",
            structure_parent.display()
        )
    })?;

    let mut written_by_path: HashMap<PathBuf, String> = HashMap::new();
    let mut kind_by_file_index: HashMap<i32, CommonResourceKind> = HashMap::new();
    let mut sub_file_data = Vec::with_capacity(extraction.files.len());
    let mut manifest_resources = Vec::with_capacity(extraction.files.len());
    let mut warnings = Vec::new();
    let mut unknown_resource_count = 0usize;

    for (index, file) in extraction.files.iter().enumerate() {
        let classified = classify_common_resource(file);
        kind_by_file_index.insert(file.file_index, classified.kind);
        if !classified.known {
            unknown_resource_count += 1;
            warnings.push(format!(
                "Unknown common resource fileIndex {} was preserved as {}.",
                file.file_index,
                classified.relative_path.display()
            ));
        }
        let destination = model_root.join(&classified.relative_path);
        if !destination.starts_with(model_root) {
            return Err(format!(
                "Refusing to write EXVS common resource outside staging root: {}",
                destination.display()
            ));
        }
        match written_by_path.get(&classified.relative_path) {
            Some(existing_hash) if existing_hash == &classified.sha256 => {}
            Some(_) => {
                return Err(format!(
                    "EXVS common content naming collision at {}.",
                    classified.relative_path.display()
                ));
            }
            None => {
                let parent = destination.parent().ok_or_else(|| {
                    format!("Invalid common resource path: {}", destination.display())
                })?;
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
                fs::write(&destination, &file.data).map_err(|error| {
                    format!("Failed to write {}: {error}", destination.display())
                })?;
                written_by_path.insert(classified.relative_path.clone(), classified.sha256.clone());
            }
        }

        let file_url = relative_file_url(&classified.relative_path);
        let file_base_name = classified
            .relative_path
            .file_stem()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        sub_file_data.push(json!({
            "index": index,
            "fileType": file.file_type,
            "fileIndex": file.file_index,
            "fileUrl": file_url,
            "fileBaseName": file_base_name,
        }));
        manifest_resources.push(json!({
            "index": index,
            "fileIndex": file.file_index,
            "fileType": file.file_type,
            "fileUrl": file_url,
            "relativePath": path_for_json(&classified.relative_path),
            "kind": classified.kind,
            "readOnly": classified.read_only,
            "known": classified.known,
            "originalSha256": classified.sha256,
        }));
    }

    let unique_physical_files = written_by_path.len();
    let structure_reference_count = extraction
        .sub_file_structure
        .iter()
        .filter(|entry| matches!(entry, SubFileStructureEntry::Item { .. }))
        .count();
    let mut occurrences_by_file_index: HashMap<i32, usize> = HashMap::new();
    for entry in &extraction.sub_file_structure {
        if let SubFileStructureEntry::Item { file_index, .. } = entry {
            *occurrences_by_file_index.entry(*file_index).or_default() += 1;
        }
    }
    let texture_alias_count = occurrences_by_file_index
        .into_iter()
        .filter(|(file_index, _)| {
            kind_by_file_index.get(file_index) == Some(&CommonResourceKind::Texture)
        })
        .map(|(_, count)| count.saturating_sub(1))
        .sum::<usize>();
    let logical_reference_count = extraction.files.len() + texture_alias_count;
    let structure = json!({
        "Name": EXVS_COMMON_PACKAGE_NAME,
        "HashName": EXVS_COMMON_HASH_NAME,
        "Magic": extraction.meta_header,
        "Fhm2dTotalCount": extraction.files.len(),
        "UnkCount": extraction.unk_count,
        "SubFileData": sub_file_data,
        "SubFileStructure": extraction.sub_file_structure,
        "ExvsCommonProfile": {
            "version": 1,
            "packageHash": EXVS_COMMON_HASH_NAME,
            "packageName": EXVS_COMMON_PACKAGE_NAME,
            "uniquePhysicalFiles": unique_physical_files,
            "logicalReferenceCount": logical_reference_count,
            "structureReferenceCount": structure_reference_count,
            "resources": manifest_resources,
        },
    });
    let serialized = serde_json::to_string_pretty(&structure)
        .map_err(|error| format!("Failed to serialize EXVS common structure: {error}"))?;
    fs::write(structure_json, format!("{serialized}\n")).map_err(|error| {
        format!(
            "Failed to write EXVS common structure {}: {error}",
            structure_json.display()
        )
    })?;

    Ok(ExvsCommonMaterializeResult {
        model_root: model_root.to_string_lossy().to_string(),
        structure_json_path: structure_json.to_string_lossy().to_string(),
        total_files: extraction.files.len(),
        unique_physical_files,
        logical_reference_count,
        structure_reference_count,
        unknown_resource_count,
        warnings,
    })
}

fn validate_structure_entries(
    input: &CommonInputStructure,
    structure_path: &Path,
    errors: &mut Vec<ExvsCommonValidationError>,
) {
    let known_indices = input
        .files
        .iter()
        .map(|file| file.file_index)
        .collect::<std::collections::HashSet<_>>();
    let mut depth = 0i32;
    for entry in &input.structure {
        match entry {
            SubFileStructureEntry::Folder { .. } => depth += 1,
            SubFileStructureEntry::Item { file_index, .. } => {
                if depth <= 0 {
                    push_validation_error(
                        errors,
                        "structure",
                        format!("fileIndex {file_index} appears outside a structure folder."),
                        Some(structure_path),
                    );
                }
                if !known_indices.contains(file_index) {
                    push_validation_error(
                        errors,
                        "structure",
                        format!("SubFileStructure references missing fileIndex {file_index}."),
                        Some(structure_path),
                    );
                }
            }
            SubFileStructureEntry::EndMark { end_mark_count } => {
                if *end_mark_count <= 0 || *end_mark_count > depth {
                    push_validation_error(
                        errors,
                        "structure",
                        format!("Invalid EndMark count {end_mark_count} at folder depth {depth}."),
                        Some(structure_path),
                    );
                    depth = 0;
                } else {
                    depth -= *end_mark_count;
                }
            }
        }
    }
    if depth != 0 {
        push_validation_error(
            errors,
            "structure",
            format!("SubFileStructure ends with {depth} unclosed folder(s)."),
            Some(structure_path),
        );
    }
}

fn resolve_common_file_url(json_dir: &Path, file_url: &str) -> Option<PathBuf> {
    let segments = normalized_url_segments(file_url)?;
    if segments.first().map(String::as_str) != Some(EXVS_COMMON_PACKAGE_NAME) {
        return None;
    }
    Some(
        segments
            .iter()
            .fold(json_dir.to_path_buf(), |path, segment| path.join(segment)),
    )
}

fn common_relative_from_file_url(file_url: &str) -> Option<String> {
    let segments = normalized_url_segments(file_url)?;
    if segments.first().map(String::as_str) != Some(EXVS_COMMON_PACKAGE_NAME) {
        return None;
    }
    Some(segments[1..].join("/"))
}

fn normalized_url_segments(file_url: &str) -> Option<Vec<String>> {
    let normalized = file_url.replace('\\', "/");
    if normalized.starts_with('/') || normalized.contains(':') {
        return None;
    }
    let segments = normalized
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .map(str::to_string)
        .collect::<Vec<_>>();
    if segments.is_empty()
        || segments
            .iter()
            .any(|segment| segment == ".." || segment.contains(['/', '\\']))
    {
        return None;
    }
    Some(segments)
}

fn model_name_from_relative(relative: &str) -> Option<String> {
    let mut segments = relative.split('/');
    if segments.next()? != "models" {
        return None;
    }
    let model_name = segments.next()?.trim();
    if model_name.is_empty() {
        None
    } else {
        Some(model_name.to_string())
    }
}

fn validate_model_resource_sets(
    resources_by_model: &HashMap<String, std::collections::HashSet<String>>,
    model_root: &Path,
    errors: &mut Vec<ExvsCommonValidationError>,
) {
    const REQUIRED: &[&str] = &[".numdlb", ".nusktb", ".numshb", ".jnttbl"];
    for (model_name, extensions) in resources_by_model {
        for required in REQUIRED {
            if !extensions.contains(*required) {
                push_validation_error(
                    errors,
                    "models",
                    format!("Model '{model_name}' is missing required {required} resource."),
                    Some(&model_root.join("models").join(model_name)),
                );
            }
        }
        if !extensions.contains(".numatb") {
            push_validation_error(
                errors,
                "models",
                format!("Model '{model_name}' has no NUMATB material resource."),
                Some(&model_root.join("models").join(model_name)),
            );
        }
    }
    if resources_by_model.is_empty() {
        push_validation_error(
            errors,
            "models",
            "EXVS common bundle must contain at least one model.".to_string(),
            Some(model_root),
        );
    }
}

fn validate_common_shl(
    shl_paths: &[PathBuf],
    model_count: usize,
    summary: &mut ExvsCommonValidationSummary,
    errors: &mut Vec<ExvsCommonValidationError>,
) {
    if shl_paths.len() != 1 {
        push_validation_error(
            errors,
            "shl",
            format!(
                "EXVS common bundle requires exactly one SHL file, found {}.",
                shl_paths.len()
            ),
            shl_paths.first().map(PathBuf::as_path),
        );
        return;
    }
    let shl_path = &shl_paths[0];
    let bytes = match fs::read(shl_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            push_validation_error(
                errors,
                "shl",
                format!("Failed to read common SHL: {error}"),
                Some(shl_path),
            );
            return;
        }
    };
    let shl = match super::shl::parse_shl(&bytes) {
        Ok(shl) => shl,
        Err(error) => {
            push_validation_error(errors, "shl", error, Some(shl_path));
            return;
        }
    };
    summary.shl_record_count = shl.records.len();
    let mut model_ids = std::collections::HashSet::new();
    for (index, record) in shl.records.iter().enumerate() {
        if !model_ids.insert(record.model_id) {
            push_validation_error(
                errors,
                "shl",
                format!(
                    "SHL record {index} has duplicate model ID 0x{:08X}.",
                    record.model_id
                ),
                Some(shl_path),
            );
        }
        if record.model_type > 7 {
            push_validation_error(
                errors,
                "shl",
                format!(
                    "SHL record {index} has unsupported model type {} (expected 0..7).",
                    record.model_type
                ),
                Some(shl_path),
            );
        }
        if record.folder_index as usize >= model_count || record.slot_index as usize >= model_count
        {
            push_validation_error(
                errors,
                "shl",
                format!(
                    "SHL record {index} points outside {model_count} model folder(s): folder={}, slot={}.",
                    record.folder_index, record.slot_index
                ),
                Some(shl_path),
            );
        }
    }
}

fn push_validation_error(
    errors: &mut Vec<ExvsCommonValidationError>,
    phase: &str,
    message: String,
    path: Option<&Path>,
) {
    errors.push(ExvsCommonValidationError {
        phase: phase.to_string(),
        message,
        path: path.map(|value| value.to_string_lossy().to_string()),
    });
}

fn validation_result(
    model_root: PathBuf,
    structure_json: PathBuf,
    summary: ExvsCommonValidationSummary,
    errors: Vec<ExvsCommonValidationError>,
    warnings: Vec<String>,
) -> ExvsCommonValidationResult {
    ExvsCommonValidationResult {
        valid: errors.is_empty(),
        model_root: model_root.to_string_lossy().to_string(),
        structure_json_path: structure_json.to_string_lossy().to_string(),
        summary,
        errors,
        warnings,
    }
}

fn ensure_common_workspace_valid(
    model_root: &str,
    structure_json_path: &str,
) -> Result<(), String> {
    let validation = validate_exvs_common_bundle(model_root, structure_json_path);
    if validation.valid {
        return Ok(());
    }
    let first = validation
        .errors
        .first()
        .map(|error| error.message.as_str())
        .unwrap_or("unknown validation failure");
    Err(format!(
        "EXVS common mutation blocked by {} validation issue(s): {first}",
        validation.errors.len()
    ))
}

fn stage_common_workspace(
    model_root: &str,
    structure_json_path: &str,
) -> Result<StagedCommonWorkspace, String> {
    let source_root = PathBuf::from(model_root.trim());
    let source_structure = PathBuf::from(structure_json_path.trim());
    if !source_root.is_dir() || !source_structure.is_file() {
        return Err("EXVS common workspace folder or structure JSON is missing.".to_string());
    }
    let parent = source_root.parent().ok_or_else(|| {
        format!(
            "Cannot determine EXVS common workspace parent for {}",
            source_root.display()
        )
    })?;
    let temp_dir = tempfile::Builder::new()
        .prefix(".exvs-common-mutation-")
        .tempdir_in(parent)
        .map_err(|error| {
            format!(
                "Failed to create EXVS common mutation staging directory in {}: {error}",
                parent.display()
            )
        })?;
    let staged_root = temp_dir.path().join(EXVS_COMMON_PACKAGE_NAME);
    let staged_structure = temp_dir
        .path()
        .join(format!("{EXVS_COMMON_PACKAGE_NAME}_structure.json"));
    copy_directory_recursive(&source_root, &staged_root)?;
    fs::copy(&source_structure, &staged_structure).map_err(|error| {
        format!(
            "Failed to stage EXVS common structure {}: {error}",
            source_structure.display()
        )
    })?;
    Ok(StagedCommonWorkspace {
        _temp_dir: temp_dir,
        model_root: staged_root,
        structure_json: staged_structure,
    })
}

fn finish_common_mutation(
    staged: StagedCommonWorkspace,
    final_model_root: &Path,
    final_structure_json: &Path,
    mutation: UnitModelMutationResult,
    affected_model: Option<String>,
    model_id: Option<u32>,
) -> Result<ExvsCommonMutationResult, String> {
    let staged_validation = validate_exvs_common_bundle(
        &staged.model_root.to_string_lossy(),
        &staged.structure_json.to_string_lossy(),
    );
    if !staged_validation.valid {
        let first = staged_validation
            .errors
            .first()
            .map(|error| error.message.as_str())
            .unwrap_or("unknown validation failure");
        return Err(format!(
            "EXVS common mutation failed staged validation with {} issue(s): {first}",
            staged_validation.errors.len()
        ));
    }
    let (backup_model_root, backup_structure_json) = install_staged_workspace(
        &staged.model_root,
        &staged.structure_json,
        final_model_root,
        final_structure_json,
        true,
    )?;
    let validation = validate_exvs_common_bundle(
        &final_model_root.to_string_lossy(),
        &final_structure_json.to_string_lossy(),
    );
    Ok(ExvsCommonMutationResult {
        model_root: final_model_root.to_string_lossy().to_string(),
        structure_json_path: final_structure_json.to_string_lossy().to_string(),
        affected_model,
        model_id,
        model_count: mutation.model_count,
        total_files: mutation.total_files,
        validation,
        backup_model_root: backup_model_root.map(|path| path.to_string_lossy().to_string()),
        backup_structure_json: backup_structure_json.map(|path| path.to_string_lossy().to_string()),
    })
}

fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| {
        format!(
            "Failed to create staged directory {}: {error}",
            destination.display()
        )
    })?;
    let entries = fs::read_dir(source)
        .map_err(|error| format!("Failed to read directory {}: {error}", source.display()))?;
    for entry in entries {
        let entry = entry
            .map_err(|error| format!("Failed to read entry in {}: {error}", source.display()))?;
        let file_type = entry.file_type().map_err(|error| {
            format!(
                "Failed to inspect staged source {}: {error}",
                entry.path().display()
            )
        })?;
        let target = destination.join(entry.file_name());
        if file_type.is_symlink() {
            return Err(format!(
                "EXVS common workspace may not contain symlinks: {}",
                entry.path().display()
            ));
        }
        if file_type.is_dir() {
            copy_directory_recursive(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &target).map_err(|error| {
                format!(
                    "Failed to stage common resource {} -> {}: {error}",
                    entry.path().display(),
                    target.display()
                )
            })?;
        }
    }
    Ok(())
}

fn common_shl_path(model_root: &Path) -> PathBuf {
    model_root
        .join("control")
        .join("shell_000common_000common_001.shl")
}

fn read_common_shl(model_root: &Path) -> Result<ShlFile, String> {
    let path = common_shl_path(model_root);
    let bytes = fs::read(&path)
        .map_err(|error| format!("Failed to read common SHL {}: {error}", path.display()))?;
    super::shl::parse_shl(&bytes)
}

fn write_common_shl(model_root: &Path, shl: &ShlFile) -> Result<(), String> {
    let path = common_shl_path(model_root);
    let bytes = super::shl::build_shl(shl)?;
    fs::write(&path, bytes)
        .map_err(|error| format!("Failed to write common SHL {}: {error}", path.display()))
}

fn install_staged_workspace(
    staging_model_root: &Path,
    staging_structure: &Path,
    model_root: &Path,
    structure_json: &Path,
    overwrite: bool,
) -> Result<(Option<PathBuf>, Option<PathBuf>), String> {
    if !overwrite && (model_root.exists() || structure_json.exists()) {
        return Err("EXVS common workspace appeared while extraction was in progress.".to_string());
    }

    let (backup_root_candidate, backup_structure_candidate) = unique_backup_paths(model_root)?;
    let mut backup_model_root = None;
    let mut backup_structure_json = None;
    if model_root.exists() {
        fs::rename(model_root, &backup_root_candidate).map_err(|error| {
            format!(
                "Failed to back up existing EXVS common folder {}: {error}",
                model_root.display()
            )
        })?;
        backup_model_root = Some(backup_root_candidate.clone());
    }
    if structure_json.exists() {
        if let Err(error) = fs::rename(structure_json, &backup_structure_candidate) {
            if let Some(backup) = &backup_model_root {
                let _ = fs::rename(backup, model_root);
            }
            return Err(format!(
                "Failed to back up existing EXVS common structure {}: {error}",
                structure_json.display()
            ));
        }
        backup_structure_json = Some(backup_structure_candidate.clone());
    }

    if let Err(error) = fs::rename(staging_model_root, model_root) {
        restore_backups(
            model_root,
            structure_json,
            backup_model_root.as_deref(),
            backup_structure_json.as_deref(),
        );
        return Err(format!(
            "Failed to install EXVS common folder {}: {error}",
            model_root.display()
        ));
    }
    if let Err(error) = fs::rename(staging_structure, structure_json) {
        let _ = fs::rename(model_root, staging_model_root);
        restore_backups(
            model_root,
            structure_json,
            backup_model_root.as_deref(),
            backup_structure_json.as_deref(),
        );
        return Err(format!(
            "Failed to install EXVS common structure {}: {error}",
            structure_json.display()
        ));
    }

    Ok((backup_model_root, backup_structure_json))
}

fn unique_backup_paths(model_root: &Path) -> Result<(PathBuf, PathBuf), String> {
    let parent = model_root.parent().ok_or_else(|| {
        format!(
            "Cannot determine EXVS common workspace parent for {}",
            model_root.display()
        )
    })?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before Unix epoch: {error}"))?
        .as_millis();
    for suffix in 0..1000u32 {
        let discriminator = if suffix == 0 {
            timestamp.to_string()
        } else {
            format!("{timestamp}-{suffix}")
        };
        let folder = parent.join(format!("{EXVS_COMMON_PACKAGE_NAME}_backup_{discriminator}"));
        let structure = parent.join(format!(
            "{EXVS_COMMON_PACKAGE_NAME}_structure_backup_{discriminator}.json"
        ));
        if !folder.exists() && !structure.exists() {
            return Ok((folder, structure));
        }
    }
    Err("Could not allocate unique EXVS common backup names.".to_string())
}

fn unique_mod_backup_path(output_path: &Path) -> Result<PathBuf, String> {
    let parent = output_path.parent().ok_or_else(|| {
        format!(
            "Cannot determine EXVS common mod output parent for {}",
            output_path.display()
        )
    })?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before Unix epoch: {error}"))?
        .as_millis();
    for suffix in 0..1000u32 {
        let discriminator = if suffix == 0 {
            timestamp.to_string()
        } else {
            format!("{timestamp}-{suffix}")
        };
        let candidate = parent.join(format!(
            "{EXVS_COMMON_HASH_NAME}_backup_{discriminator}.fhm2d"
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("Could not allocate a unique EXVS common mod backup name.".to_string())
}

fn restore_backups(
    model_root: &Path,
    structure_json: &Path,
    backup_model_root: Option<&Path>,
    backup_structure_json: Option<&Path>,
) {
    if let Some(backup) = backup_model_root {
        let _ = fs::rename(backup, model_root);
    }
    if let Some(backup) = backup_structure_json {
        let _ = fs::rename(backup, structure_json);
    }
}

pub(crate) fn classify_common_payload(file_type: &str, data: &[u8]) -> CommonResourcePlacement {
    let sha256 = sha256_hex(data);
    if let Some(known) = MANIFEST.iter().find(|entry| entry.sha256 == sha256) {
        return placement(
            known.kind,
            known.relative_path,
            known.read_only,
            true,
            sha256,
        );
    }

    if let Some(name) = common_motion_name(data) {
        let lower = name.to_ascii_lowercase();
        let path = if lower == "big.nuanmb" {
            "camera/battle/big.nuanmb".to_string()
        } else {
            format!("camera/menu/{lower}")
        };
        return placement(CommonResourceKind::Camera, &path, true, true, sha256);
    }

    if file_type.eq_ignore_ascii_case(".nutexb") {
        if let Ok(name) = super::fhm2d::parse_nutexb_name(data) {
            let base = name.trim_end_matches(".nutexb");
            return placement(
                CommonResourceKind::Texture,
                &format!("textures/{base}.nutexb"),
                false,
                true,
                sha256,
            );
        }
    }

    let extension = safe_extension(file_type);
    placement(
        CommonResourceKind::Unknown,
        &format!("unknown/{extension}_{}.{}", &sha256[..16], extension),
        false,
        false,
        sha256,
    )
}

fn required_directory_setting(value: &str, label: &str) -> Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} is not configured."));
    }
    Ok(PathBuf::from(trimmed))
}

fn placement(
    kind: CommonResourceKind,
    path: &str,
    read_only: bool,
    known: bool,
    sha256: String,
) -> CommonResourcePlacement {
    CommonResourcePlacement {
        kind,
        relative_path: slash_path(path),
        read_only,
        known,
        sha256,
    }
}

fn slash_path(value: &str) -> PathBuf {
    value
        .split('/')
        .filter(|segment| !segment.is_empty())
        .fold(PathBuf::new(), |path, segment| path.join(segment))
}

fn path_for_json(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn sha256_hex(data: &[u8]) -> String {
    format!("{:x}", Sha256::digest(data))
}

fn safe_extension(file_type: &str) -> String {
    let extension: String = file_type
        .trim()
        .trim_start_matches('.')
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase();
    if extension.is_empty() {
        "bin".to_string()
    } else {
        extension
    }
}

fn common_motion_name(data: &[u8]) -> Option<String> {
    let ascii = String::from_utf8_lossy(data);
    for marker in ["big.nuanmx.scaled", "STGIntro"] {
        let Some(start) = ascii.find(marker) else {
            continue;
        };
        let tail = &ascii[start..];
        let end = tail.find('\0').unwrap_or(tail.len()).min(
            "STGIntro000.nuanmx.scaled"
                .len()
                .max("big.nuanmx.scaled".len()),
        );
        let raw = &tail[..end];
        if let Some(base) = raw.strip_suffix(".nuanmx.scaled") {
            return Some(format!("{base}.nuanmb"));
        }
    }
    None
}

pub(crate) fn relative_file_url(relative_path: &Path) -> String {
    let mut result = format!(".\\{EXVS_COMMON_PACKAGE_NAME}");
    for component in relative_path.components() {
        result.push('\\');
        result.push_str(&component.as_os_str().to_string_lossy());
    }
    result
}
