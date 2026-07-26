use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{
    dcc_fbx::read_dcc_motion_clip, read_motion_skeleton, write_motion_clip_as_nuanmb,
    MotionConversionReport, MotionInterchangeError, RigBindingPolicy,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionFbxImportRequest {
    pub fbx_path: String,
    pub nusktb_path: String,
    pub output_nuanmb_path: String,
    pub template_nuanmb_path: Option<String>,
    pub animation_stack_name: Option<String>,
    #[serde(default)]
    pub rig_binding_policy: RigBindingPolicy,
}

/// Manifest-free MotionFbxImport: DCC FBX + NUSKTB (+ template) → new NUANMB.
pub fn import_motion_fbx(
    request: MotionFbxImportRequest,
) -> Result<MotionConversionReport, MotionInterchangeError> {
    let fbx_path = required_import_path(&request.fbx_path, "fbx_path")?;
    let skeleton_path = required_import_path(&request.nusktb_path, "nusktb_path")?;
    let output_path = required_import_path(&request.output_nuanmb_path, "output_nuanmb_path")?;
    let template_path = request
        .template_nuanmb_path
        .as_deref()
        .map(|path| required_import_path(path, "template_nuanmb_path"))
        .transpose()?;

    if !path_has_extension(&output_path, "nuanmb") {
        return Err(MotionInterchangeError::Import(
            "output_nuanmb_path must end with .nuanmb".to_string(),
        ));
    }
    let inputs = [
        Some(&fbx_path),
        Some(&skeleton_path),
        template_path.as_ref(),
    ];
    if inputs
        .into_iter()
        .flatten()
        .any(|input| input == &output_path)
    {
        return Err(MotionInterchangeError::Import(
            "output_nuanmb_path must differ from every input path".to_string(),
        ));
    }

    let reference = read_motion_skeleton(&skeleton_path)?;
    let (clip, binding) = read_dcc_motion_clip(
        &fbx_path,
        &reference,
        request.animation_stack_name.as_deref(),
        request.rig_binding_policy,
    )?;
    let write_report = write_motion_clip_as_nuanmb(&clip, template_path.as_deref(), &output_path)?;

    let mut warnings = binding.warnings.clone();
    if template_path.is_none() {
        warnings.push(
            "no template NUANMB was provided; the output is transform-only (visibility/material groups absent)"
                .to_string(),
        );
    }
    if !binding.ignored_bones.is_empty() {
        warnings.push(format!(
            "ignored {} non-reference FBX nodes (helpers, leaf bones)",
            binding.ignored_bones.len()
        ));
    }

    Ok(MotionConversionReport {
        output_path: write_report.output_path.to_string_lossy().to_string(),
        action_name: clip.name.clone(),
        frame_count: write_report.frame_count,
        duration_seconds: (clip.frames.len().saturating_sub(1)) as f32 / clip.sample_rate_hz as f32,
        matched_bones: binding.matched_bones,
        ignored_bones: binding.ignored_bones,
        preserved_non_transform_group_count: write_report.preserved_non_transform_group_count,
        warnings,
    })
}

fn required_import_path(value: &str, field_name: &str) -> Result<PathBuf, MotionInterchangeError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(MotionInterchangeError::Import(format!(
            "{field_name} must not be empty"
        )));
    }
    Ok(PathBuf::from(value))
}

fn path_has_extension(path: &Path, expected: &str) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case(expected))
}
