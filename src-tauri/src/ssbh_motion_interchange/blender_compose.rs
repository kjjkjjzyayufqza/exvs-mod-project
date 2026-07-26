//! BlenderCompose orchestrator for CompleteMotionFbx export.
//!
//! Builds temp staging inputs (model-only FBX + MotionJson pose-basis frames),
//! runs the shipped headless Blender 5.1 script, validates output, and cleans
//! staging always. Motion travels as JSON rather than an animation-only FBX
//! because Blender's FBX importer drops all-constant animation curves, which
//! silently reverted bones whose animated value differs from rest.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::blender_resolve::resolve_blender_51_executable;
use super::nuanmb::read_nuanmb_as_motion_clip;
use super::{MotionClip, MotionInterchangeError};

const COMPOSE_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const COMPOSE_SCRIPT_NAME: &str = "motion_fbx_compose.py";
const COMPOSE_SCRIPT_ENV: &str = "EXVS2_MOTION_FBX_COMPOSE_SCRIPT";

/// Request to export a single CompleteMotionFbx (model + bound motion).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteMotionFbxExportRequest {
    pub nuanmb_path: String,
    pub nusktb_path: String,
    pub numdlb_path: String,
    pub output_fbx_path: String,
    pub blender_path: Option<String>,
    pub action_name: Option<String>,
}

/// Report for a successful CompleteMotionFbx export.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteMotionFbxExportReport {
    pub output_path: String,
    pub action_name: String,
    pub frame_count: usize,
    pub duration_seconds: f32,
    pub blender_path: String,
    pub warnings: Vec<String>,
}

/// Internal staging inputs written under a temp directory (not user-facing).
#[derive(Debug)]
struct StagingComposeInputs {
    temp_dir: PathBuf,
    model_fbx: PathBuf,
    motion_json: PathBuf,
}

impl StagingComposeInputs {
    fn create() -> Result<Self, MotionInterchangeError> {
        let temp_dir =
            std::env::temp_dir().join(format!("exvs2_motion_fbx_export_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).map_err(|error| {
            MotionInterchangeError::Compose(format!(
                "failed to create staging directory {}: {error}",
                temp_dir.display()
            ))
        })?;
        Ok(Self {
            model_fbx: temp_dir.join("model.fbx"),
            motion_json: temp_dir.join("motion.json"),
            temp_dir,
        })
    }

    fn cleanup(&self) {
        // Debug affordance: keep staging inputs for inspection when set.
        if std::env::var("EXVS2_MOTION_FBX_KEEP_STAGING")
            .is_ok_and(|value| !value.trim().is_empty())
        {
            eprintln!("keeping compose staging at {}", self.temp_dir.display());
            return;
        }
        let _ = std::fs::remove_dir_all(&self.temp_dir);
    }
}

impl Drop for StagingComposeInputs {
    fn drop(&mut self) {
        self.cleanup();
    }
}

/// MotionJson staging payload consumed by the compose script: per-frame
/// pose-basis TRS (basis = rest_local^-1 * animated_local) per bone, encoded
/// as `[tx,ty,tz,qx,qy,qz,qw,sx,sy,sz]`. Motion travels as JSON rather than
/// an animation-only FBX because Blender's FBX importer drops all-constant
/// animation curves, silently reverting bones whose animated value differs
/// from rest (e.g. a BASE offset bone) back to the rest pose.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MotionJsonPayload<'a> {
    action_name: &'a str,
    fps: u32,
    frame_count: usize,
    bone_names: Vec<&'a str>,
    frames: Vec<Vec<[f32; 10]>>,
}

fn write_motion_basis_json(
    path: &Path,
    clip: &MotionClip,
    action_name: &str,
) -> Result<(), MotionInterchangeError> {
    let mut rest_inverses = Vec::with_capacity(clip.skeleton.bones.len());
    for bone in &clip.skeleton.bones {
        let rest = glam::Mat4::from_scale_rotation_translation(
            bone.rest_local.scale,
            bone.rest_local.rotation,
            bone.rest_local.translation,
        );
        let inverse = rest.inverse();
        if !inverse.is_finite() {
            return Err(MotionInterchangeError::Compose(format!(
                "bone '{}' has a non-invertible rest transform",
                bone.name
            )));
        }
        rest_inverses.push(inverse);
    }

    let mut previous_rotations: Vec<Option<glam::Quat>> = vec![None; clip.skeleton.bones.len()];
    let mut frames = Vec::with_capacity(clip.frames.len());
    for frame in &clip.frames {
        let mut bone_values = Vec::with_capacity(frame.local_transforms.len());
        for (bone_index, transform) in frame.local_transforms.iter().enumerate() {
            let animated = glam::Mat4::from_scale_rotation_translation(
                transform.scale,
                transform.rotation,
                transform.translation,
            );
            let basis = rest_inverses[bone_index] * animated;
            let (scale, rotation, translation) = basis.to_scale_rotation_translation();
            let mut rotation = rotation.normalize();
            if !scale.is_finite() || !rotation.is_finite() || !translation.is_finite() {
                return Err(MotionInterchangeError::Compose(format!(
                    "bone '{}' produced a non-finite pose basis",
                    clip.skeleton.bones[bone_index].name
                )));
            }
            if let Some(previous) = previous_rotations[bone_index] {
                if previous.dot(rotation) < 0.0 {
                    rotation = -rotation;
                }
            }
            previous_rotations[bone_index] = Some(rotation);
            bone_values.push([
                translation.x,
                translation.y,
                translation.z,
                rotation.x,
                rotation.y,
                rotation.z,
                rotation.w,
                scale.x,
                scale.y,
                scale.z,
            ]);
        }
        frames.push(bone_values);
    }

    // Blender culls all-constant animation channels on both FBX import and
    // export; a culled channel falls back to the bone's static rest value,
    // corrupting bones whose animated value differs from rest (e.g. a BASE
    // offset bone). Nudge the last frame of every constant component by a
    // sub-tolerance epsilon so every channel survives both directions.
    const CONSTANT_CHANNEL_EPSILON: f32 = 1.0e-3;
    if frames.len() >= 2 {
        let bone_count = clip.skeleton.bones.len();
        let last = frames.len() - 1;
        for bone_index in 0..bone_count {
            for component in 0..10 {
                let first = frames[0][bone_index][component];
                let constant = frames
                    .iter()
                    .all(|frame| frame[bone_index][component] == first);
                if constant {
                    frames[last][bone_index][component] += CONSTANT_CHANNEL_EPSILON;
                }
            }
        }
    }

    let payload = MotionJsonPayload {
        action_name,
        fps: clip.sample_rate_hz,
        frame_count: clip.frames.len(),
        bone_names: clip
            .skeleton
            .bones
            .iter()
            .map(|bone| bone.name.as_str())
            .collect(),
        frames,
    };
    let json = serde_json::to_vec(&payload).map_err(|error| {
        MotionInterchangeError::Compose(format!("failed to serialize MotionJson: {error}"))
    })?;
    std::fs::write(path, json).map_err(|error| {
        MotionInterchangeError::Compose(format!(
            "failed to write MotionJson {}: {error}",
            path.display()
        ))
    })
}

/// Export CompleteMotionFbx via staging inputs + Blender 5.1 headless compose.
pub fn export_complete_motion_fbx(
    request: CompleteMotionFbxExportRequest,
) -> Result<CompleteMotionFbxExportReport, MotionInterchangeError> {
    let validated = validate_export_request(&request)?;

    let blender_override = request
        .blender_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(Path::new);
    let blender_path = resolve_blender_51_executable(blender_override)?;

    let action_name = request
        .action_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string())
        .unwrap_or_else(|| file_stem_or_default(&validated.nuanmb_path, "motion"));

    let clip = read_nuanmb_as_motion_clip(
        &validated.nuanmb_path,
        &validated.nusktb_path,
        action_name.clone(),
    )?;

    let staging = StagingComposeInputs::create()?;
    // Ensure cleanup on every exit path (Drop + explicit for clarity).
    let result = run_compose_with_staging(&validated, &clip, &blender_path, &staging, action_name);
    staging.cleanup();
    result
}

fn run_compose_with_staging(
    validated: &ValidatedPaths,
    clip: &MotionClip,
    blender_path: &Path,
    staging: &StagingComposeInputs,
    action_name: String,
) -> Result<CompleteMotionFbxExportReport, MotionInterchangeError> {
    crate::ssbh_fbx::write_model_fbx_no_textures(&validated.numdlb_path, &staging.model_fbx)
        .map_err(|error| {
            MotionInterchangeError::Compose(format!(
                "failed to write model staging FBX {}: {error:#}",
                staging.model_fbx.display()
            ))
        })?;

    write_motion_basis_json(&staging.motion_json, clip, &action_name)?;

    let script_path = resolve_compose_script_path()?;
    let compose_output = run_blender_compose(
        blender_path,
        &script_path,
        &staging.model_fbx,
        &staging.motion_json,
        &validated.output_fbx_path,
    )?;

    if !parse_compose_success_from_stdout(&compose_output.stdout) {
        let stderr_snip = truncate_for_error(&compose_output.stderr, 2_000);
        let stdout_snip = truncate_for_error(&compose_output.stdout, 1_000);
        return Err(MotionInterchangeError::Compose(format!(
            "Blender compose did not report success (exit {}). stderr: {stderr_snip} stdout: {stdout_snip}",
            compose_output
                .exit_code
                .map(|code| code.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        )));
    }

    ensure_output_fbx_ready(&validated.output_fbx_path)?;

    Ok(CompleteMotionFbxExportReport {
        output_path: validated.output_fbx_path.to_string_lossy().to_string(),
        action_name,
        frame_count: clip.frames.len(),
        duration_seconds: duration_seconds(clip),
        blender_path: blender_path.to_string_lossy().to_string(),
        warnings: Vec::new(),
    })
}

#[derive(Debug)]
struct ValidatedPaths {
    nuanmb_path: PathBuf,
    nusktb_path: PathBuf,
    numdlb_path: PathBuf,
    output_fbx_path: PathBuf,
}

fn validate_export_request(
    request: &CompleteMotionFbxExportRequest,
) -> Result<ValidatedPaths, MotionInterchangeError> {
    let nuanmb_path = required_compose_path(&request.nuanmb_path, "nuanmb_path")?;
    let nusktb_path = required_compose_path(&request.nusktb_path, "nusktb_path")?;
    let numdlb_path = required_compose_path(&request.numdlb_path, "numdlb_path")?;
    let output_fbx_path = required_compose_path(&request.output_fbx_path, "output_fbx_path")?;

    if !path_ends_with_fbx(&output_fbx_path) {
        return Err(MotionInterchangeError::Compose(
            "output_fbx_path must end with .fbx".to_string(),
        ));
    }

    if paths_equal(&output_fbx_path, &nuanmb_path)
        || paths_equal(&output_fbx_path, &nusktb_path)
        || paths_equal(&output_fbx_path, &numdlb_path)
    {
        return Err(MotionInterchangeError::Compose(
            "output_fbx_path must not equal any input path".to_string(),
        ));
    }

    Ok(ValidatedPaths {
        nuanmb_path,
        nusktb_path,
        numdlb_path,
        output_fbx_path,
    })
}

fn required_compose_path(value: &str, field_name: &str) -> Result<PathBuf, MotionInterchangeError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(MotionInterchangeError::Compose(format!(
            "{field_name} must not be empty"
        )));
    }
    Ok(PathBuf::from(value))
}

fn path_ends_with_fbx(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("fbx"))
        .unwrap_or(false)
}

fn paths_equal(a: &Path, b: &Path) -> bool {
    a == b
}

/// Resolve headless compose script path.
///
/// Order: env `EXVS2_MOTION_FBX_COMPOSE_SCRIPT`, then `CARGO_MANIFEST_DIR/scripts/`,
/// then cwd-relative `src-tauri/scripts/` (and `scripts/`), then beside executable.
pub fn resolve_compose_script_path() -> Result<PathBuf, MotionInterchangeError> {
    if let Ok(env_value) = std::env::var(COMPOSE_SCRIPT_ENV) {
        let trimmed = env_value.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.is_file() {
                return Ok(path);
            }
            return Err(MotionInterchangeError::Compose(format!(
                "compose script from {COMPOSE_SCRIPT_ENV} is not a file: {}",
                path.display()
            )));
        }
    }

    if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
        let candidate = Path::new(manifest_dir)
            .join("scripts")
            .join(COMPOSE_SCRIPT_NAME);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        for relative in [
            PathBuf::from("src-tauri")
                .join("scripts")
                .join(COMPOSE_SCRIPT_NAME),
            PathBuf::from("scripts").join(COMPOSE_SCRIPT_NAME),
        ] {
            let candidate = cwd.join(relative);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            for relative in [
                PathBuf::from("scripts").join(COMPOSE_SCRIPT_NAME),
                PathBuf::from(COMPOSE_SCRIPT_NAME),
            ] {
                let candidate = exe_dir.join(relative);
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }
    }

    Err(MotionInterchangeError::Compose(format!(
        "compose script {COMPOSE_SCRIPT_NAME} not found (set {COMPOSE_SCRIPT_ENV} or install scripts next to the app)"
    )))
}

struct ComposeProcessOutput {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
}

fn run_blender_compose(
    blender_path: &Path,
    script_path: &Path,
    model_fbx: &Path,
    motion_json: &Path,
    output_fbx: &Path,
) -> Result<ComposeProcessOutput, MotionInterchangeError> {
    if let Some(parent) = output_fbx.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| {
                MotionInterchangeError::Compose(format!(
                    "failed to create output directory {}: {error}",
                    parent.display()
                ))
            })?;
        }
    }

    let mut child = Command::new(blender_path)
        .arg("-b")
        .arg("-P")
        .arg(script_path)
        .arg("--")
        .arg("--model-fbx")
        .arg(model_fbx)
        .arg("--motion-json")
        .arg(motion_json)
        .arg("--output-fbx")
        .arg(output_fbx)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            MotionInterchangeError::Compose(format!(
                "failed to spawn Blender 5.1 at {}: {error}",
                blender_path.display()
            ))
        })?;

    let mut stdout_pipe = child.stdout.take().ok_or_else(|| {
        MotionInterchangeError::Compose("Blender process stdout pipe missing".to_string())
    })?;
    let mut stderr_pipe = child.stderr.take().ok_or_else(|| {
        MotionInterchangeError::Compose("Blender process stderr pipe missing".to_string())
    })?;

    let stdout_handle = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout_pipe.read_to_end(&mut buf);
        buf
    });
    let stderr_handle = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr_pipe.read_to_end(&mut buf);
        buf
    });

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if started.elapsed() >= COMPOSE_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(MotionInterchangeError::Compose(format!(
                        "Blender compose timed out after {} seconds",
                        COMPOSE_TIMEOUT.as_secs()
                    )));
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                return Err(MotionInterchangeError::Compose(format!(
                    "failed to wait for Blender process: {error}"
                )));
            }
        }
    };

    let stdout_bytes = stdout_handle.join().unwrap_or_default();
    let stderr_bytes = stderr_handle.join().unwrap_or_default();
    let stdout = String::from_utf8_lossy(&stdout_bytes).into_owned();
    let stderr = String::from_utf8_lossy(&stderr_bytes).into_owned();

    if !status.success() {
        let stderr_snip = truncate_for_error(&stderr, 2_000);
        let stdout_snip = truncate_for_error(&stdout, 1_000);
        return Err(MotionInterchangeError::Compose(format!(
            "Blender compose exited with code {}: stderr: {stderr_snip} stdout: {stdout_snip}",
            status
                .code()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        )));
    }

    Ok(ComposeProcessOutput {
        stdout,
        stderr,
        exit_code: status.code(),
    })
}

/// Scan Blender stdout for a JSON object (line or embedded) with `"ok": true`.
///
/// Blender may emit non-JSON noise on stdout; success is not assumed to be the
/// only line.
pub fn parse_compose_success_from_stdout(stdout: &str) -> bool {
    for line in stdout.lines() {
        if line_contains_ok_true_json(line) {
            return true;
        }
    }
    // Fallback: whole buffer may be one JSON document with surrounding noise stripped.
    line_contains_ok_true_json(stdout)
}

fn line_contains_ok_true_json(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    if json_is_ok_true(trimmed) {
        return true;
    }
    // Scan for JSON object substrings on noisy lines.
    let bytes = trimmed.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'{' {
            if let Some(end) = find_matching_brace(trimmed, index) {
                let candidate = &trimmed[index..=end];
                if json_is_ok_true(candidate) {
                    return true;
                }
            }
        }
        index += 1;
    }
    false
}

fn json_is_ok_true(text: &str) -> bool {
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) => map.get("ok").and_then(Value::as_bool) == Some(true),
        _ => false,
    }
}

fn find_matching_brace(text: &str, open_index: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    if open_index >= bytes.len() || bytes[open_index] != b'{' {
        return None;
    }
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
    for (offset, &byte) in bytes[open_index..].iter().enumerate() {
        if in_string {
            if escape {
                escape = false;
            } else if byte == b'\\' {
                escape = true;
            } else if byte == b'"' {
                in_string = false;
            }
            continue;
        }
        match byte {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(open_index + offset);
                }
            }
            _ => {}
        }
    }
    None
}

fn ensure_output_fbx_ready(path: &Path) -> Result<(), MotionInterchangeError> {
    let metadata = std::fs::metadata(path).map_err(|error| {
        MotionInterchangeError::Compose(format!(
            "compose output FBX missing at {}: {error}",
            path.display()
        ))
    })?;
    if !metadata.is_file() {
        return Err(MotionInterchangeError::Compose(format!(
            "compose output path is not a file: {}",
            path.display()
        )));
    }
    if metadata.len() == 0 {
        return Err(MotionInterchangeError::Compose(format!(
            "compose output FBX is empty: {}",
            path.display()
        )));
    }
    Ok(())
}

fn duration_seconds(clip: &MotionClip) -> f32 {
    (clip.frames.len().saturating_sub(1) as f32) / clip.sample_rate_hz as f32
}

fn file_stem_or_default(path: &Path, fallback: &str) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .map(str::trim)
        .filter(|stem| !stem.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn truncate_for_error(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }
    let truncated: String = trimmed.chars().take(max_chars).collect();
    format!("{truncated}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_success_ignores_blender_noise_before_json() {
        let stdout = "\
Blender 5.1.0
Read blend: /tmp/startup.blend
{\"ok\":true,\"frame_start\":0,\"frame_end\":39,\"fps\":60}
";
        assert!(parse_compose_success_from_stdout(stdout));
    }

    #[test]
    fn parse_success_finds_embedded_json_on_noisy_line() {
        let stdout = "INFO {\"ok\":true,\"frame_start\":0,\"frame_end\":1,\"fps\":60} done\n";
        assert!(parse_compose_success_from_stdout(stdout));
    }

    #[test]
    fn parse_success_rejects_ok_false() {
        let stdout = "{\"ok\":false,\"error\":\"bind failed\"}\n";
        assert!(!parse_compose_success_from_stdout(stdout));
    }

    #[test]
    fn validate_rejects_empty_nuanmb_path() {
        let error = validate_export_request(&CompleteMotionFbxExportRequest {
            nuanmb_path: "  ".into(),
            nusktb_path: "a.nusktb".into(),
            numdlb_path: "a.numdlb".into(),
            output_fbx_path: "out.fbx".into(),
            blender_path: None,
            action_name: None,
        })
        .expect_err("empty nuanmb must fail");
        assert!(error.to_string().contains("nuanmb_path"));
    }

    #[test]
    fn validate_rejects_non_fbx_output() {
        let error = validate_export_request(&CompleteMotionFbxExportRequest {
            nuanmb_path: "a.nuanmb".into(),
            nusktb_path: "a.nusktb".into(),
            numdlb_path: "a.numdlb".into(),
            output_fbx_path: "out.dae".into(),
            blender_path: None,
            action_name: None,
        })
        .expect_err("non-fbx must fail");
        assert!(error.to_string().contains(".fbx"));
    }

    #[test]
    fn validate_rejects_output_equal_input() {
        let error = validate_export_request(&CompleteMotionFbxExportRequest {
            nuanmb_path: "same.fbx".into(),
            nusktb_path: "a.nusktb".into(),
            numdlb_path: "a.numdlb".into(),
            output_fbx_path: "same.fbx".into(),
            blender_path: None,
            action_name: None,
        })
        .expect_err("output equal input must fail");
        assert!(error.to_string().contains("must not equal"));
    }
}
