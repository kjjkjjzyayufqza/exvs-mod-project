mod blender_compose;
mod blender_resolve;
mod cascadeur;
mod fbx;
mod motion_clip;
mod nuanmb;
mod validate;

use std::fmt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub use blender_compose::{
    export_complete_motion_fbx, parse_compose_success_from_stdout, resolve_compose_script_path,
    CompleteMotionFbxExportReport, CompleteMotionFbxExportRequest,
};
pub use blender_resolve::{candidate_blender_51_paths, resolve_blender_51_executable};
pub use motion_clip::{
    MotionBone, MotionClip, MotionFrame, MotionSkeleton, EXVS2_SAMPLE_RATE_HZ,
    MAX_MOTION_FRAME_COUNT,
};
pub use nuanmb::{
    read_motion_skeleton, read_nuanmb_as_motion_clip, write_motion_clip_as_nuanmb,
    NuanmbWriteReport,
};
pub use validate::{validate_rig_binding, RigBindingPolicy, RigBindingReport};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MotionInterchangeError {
    InvalidClip(String),
    Bridge(String),
    /// MotionFbxExport / BlenderCompose failures (path resolve, process, staging).
    Compose(String),
    Nuanmb(String),
    RigMismatch(String),
}

impl fmt::Display for MotionInterchangeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidClip(message) => write!(f, "Invalid motion clip: {message}"),
            Self::Bridge(message) => write!(f, "Cascadeur bridge failed: {message}"),
            Self::Compose(message) => write!(f, "Motion FBX export failed: {message}"),
            Self::Nuanmb(message) => write!(f, "NUANMB conversion failed: {message}"),
            Self::RigMismatch(message) => write!(f, "Rig mismatch: {message}"),
        }
    }
}

impl std::error::Error for MotionInterchangeError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NuanmbToCascadeurRequest {
    pub nuanmb_path: String,
    pub nusktb_path: String,
    pub output_directory: String,
    pub action_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CascadeurToNuanmbRequest {
    pub fbx_path: String,
    pub bridge_manifest_path: String,
    pub nusktb_path: String,
    pub output_nuanmb_path: String,
    pub animation_stack_name: Option<String>,
    pub template_nuanmb_path: Option<String>,
    #[serde(default)]
    pub rig_binding_policy: RigBindingPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CascadeurBridgeInspectRequest {
    pub bridge_manifest_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionConversionReport {
    pub output_path: String,
    pub action_name: String,
    pub frame_count: usize,
    pub duration_seconds: f32,
    pub matched_bones: Vec<String>,
    pub ignored_bones: Vec<String>,
    pub preserved_non_transform_group_count: usize,
    pub warnings: Vec<String>,
}

pub fn export_nuanmb_to_cascadeur_bridge(
    request: NuanmbToCascadeurRequest,
) -> Result<MotionConversionReport, MotionInterchangeError> {
    let animation_path = required_path(&request.nuanmb_path, "nuanmb_path")?;
    let skeleton_path = required_path(&request.nusktb_path, "nusktb_path")?;
    let output_directory = required_path(&request.output_directory, "output_directory")?;
    let action_name = request
        .action_name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| file_stem_or_default(&animation_path, "motion"));
    let clip = read_nuanmb_as_motion_clip(&animation_path, &skeleton_path, action_name.clone())?;
    let bridge = write_cascadeur_bridge(&output_directory, &clip)?;
    Ok(MotionConversionReport {
        output_path: bridge.motion_fbx_path.to_string_lossy().to_string(),
        action_name,
        frame_count: clip.frames.len(),
        duration_seconds: duration_seconds(&clip),
        matched_bones: clip
            .skeleton
            .bones
            .iter()
            .map(|bone| bone.name.clone())
            .collect(),
        ignored_bones: Vec::new(),
        preserved_non_transform_group_count: 0,
        warnings: Vec::new(),
    })
}

pub fn import_cascadeur_bridge_to_nuanmb(
    request: CascadeurToNuanmbRequest,
) -> Result<MotionConversionReport, MotionInterchangeError> {
    let fbx_path = required_path(&request.fbx_path, "fbx_path")?;
    let manifest_path = required_path(&request.bridge_manifest_path, "bridge_manifest_path")?;
    let skeleton_path = required_path(&request.nusktb_path, "nusktb_path")?;
    let output_path = required_path(&request.output_nuanmb_path, "output_nuanmb_path")?;
    let template_path = request
        .template_nuanmb_path
        .as_deref()
        .map(|path| required_path(path, "template_nuanmb_path"))
        .transpose()?;
    if output_path == fbx_path
        || output_path == manifest_path
        || template_path.as_ref() == Some(&output_path)
    {
        return Err(MotionInterchangeError::Bridge(
            "output_nuanmb_path must differ from every input path".to_string(),
        ));
    }
    let reference = read_motion_skeleton(&skeleton_path)?;
    let (clip, binding) = read_cascadeur_bridge(
        &fbx_path,
        &manifest_path,
        &reference,
        request.animation_stack_name.as_deref(),
        request.rig_binding_policy,
    )?;
    let write_report = write_motion_clip_as_nuanmb(&clip, template_path.as_deref(), &output_path)?;
    Ok(MotionConversionReport {
        output_path: write_report.output_path.to_string_lossy().to_string(),
        action_name: clip.name.clone(),
        frame_count: write_report.frame_count,
        duration_seconds: duration_seconds(&clip),
        matched_bones: binding.matched_bones,
        ignored_bones: binding.ignored_bones,
        preserved_non_transform_group_count: write_report.preserved_non_transform_group_count,
        warnings: binding.warnings,
    })
}

#[tauri::command]
pub async fn ssbh_export_complete_motion_fbx(
    request: CompleteMotionFbxExportRequest,
) -> Result<CompleteMotionFbxExportReport, String> {
    run_blocking(move || export_complete_motion_fbx(request)).await
}

async fn run_blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, MotionInterchangeError> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| format!("Motion conversion task failed: {error}"))?
        .map_err(|error| error.to_string())
}

fn required_path(value: &str, field_name: &str) -> Result<PathBuf, MotionInterchangeError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(MotionInterchangeError::Bridge(format!(
            "{field_name} must not be empty"
        )));
    }
    Ok(PathBuf::from(value))
}

fn file_stem_or_default(path: &Path, fallback: &str) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .map(str::trim)
        .filter(|stem| !stem.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn duration_seconds(clip: &MotionClip) -> f32 {
    (clip.frames.len().saturating_sub(1) as f32) / clip.sample_rate_hz as f32
}
pub use cascadeur::{
    read_cascadeur_bridge, read_cascadeur_bridge_manifest, write_cascadeur_bridge, BridgeBone,
    CascadeurBridgeManifest, CascadeurBridgePaths, CASCADEUR_BRIDGE_SCHEMA_VERSION,
};
