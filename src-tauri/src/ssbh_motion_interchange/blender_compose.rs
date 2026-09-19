//! BlenderCompose orchestrator for CompleteMotionFbx export.
//!
//! Builds temp staging inputs (model-only FBX + MotionJson pose-basis frames),
//! runs the headless Blender 5.1 script (`tools/motion_fbx_compose.py`, also
//! embedded in the binary), validates output, and cleans
//! staging always. Motion travels as JSON rather than an animation-only FBX
//! because Blender's FBX importer drops all-constant animation curves, which
//! silently reverted bones whose animated value differs from rest.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
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
/// Windows `CREATE_NO_WINDOW`. Stops blender.exe from allocating a console that
/// steals foreground focus on every clip.
pub const WINDOWS_CREATE_NO_WINDOW: u32 = 0x0800_0000;
pub const COMPOSE_STOPPED_BY_USER: &str = "stopped by user";
const COMPOSE_LOG_CAP: usize = 32_768;
const COMPOSE_STATUS_TAIL: usize = 4_000;
/// Shipped compose script. Blender still needs a `.py` path for `-P`; when no
/// on-disk copy is found we write this into the staging directory.
const EMBEDDED_COMPOSE_SCRIPT: &str = include_str!("../../../tools/motion_fbx_compose.py");

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

/// Live snapshot of the in-flight headless Blender compose process.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MotionFbxComposeJobStatus {
    pub running: bool,
    pub stop_requested: bool,
    pub pid: Option<u32>,
    pub blender_path: Option<String>,
    pub output_fbx: Option<String>,
    pub elapsed_ms: u64,
    pub stdout_tail: String,
    pub stderr_tail: String,
}

struct ActiveComposeJob {
    pid: u32,
    blender_path: String,
    output_fbx: String,
    started: Instant,
    stdout: Arc<Mutex<String>>,
    stderr: Arc<Mutex<String>>,
    stop_requested: Arc<AtomicBool>,
}

static ACTIVE_COMPOSE_JOB: Mutex<Option<ActiveComposeJob>> = Mutex::new(None);

fn lock_active_job() -> std::sync::MutexGuard<'static, Option<ActiveComposeJob>> {
    ACTIVE_COMPOSE_JOB
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn windows_hidden_process_creation_flags() -> u32 {
    WINDOWS_CREATE_NO_WINDOW
}

fn apply_background_process_flags(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(WINDOWS_CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = command;
    }
}

pub fn snapshot_compose_job() -> MotionFbxComposeJobStatus {
    let guard = lock_active_job();
    match guard.as_ref() {
        Some(job) => MotionFbxComposeJobStatus {
            running: true,
            stop_requested: job.stop_requested.load(Ordering::SeqCst),
            pid: Some(job.pid),
            blender_path: Some(job.blender_path.clone()),
            output_fbx: Some(job.output_fbx.clone()),
            elapsed_ms: job.started.elapsed().as_millis() as u64,
            stdout_tail: tail_log(&job.stdout, COMPOSE_STATUS_TAIL),
            stderr_tail: tail_log(&job.stderr, COMPOSE_STATUS_TAIL),
        },
        None => MotionFbxComposeJobStatus {
            running: false,
            stop_requested: false,
            pid: None,
            blender_path: None,
            output_fbx: None,
            elapsed_ms: 0,
            stdout_tail: String::new(),
            stderr_tail: String::new(),
        },
    }
}

pub fn request_stop_motion_fbx_compose() -> bool {
    let pid = {
        let guard = lock_active_job();
        match guard.as_ref() {
            Some(job) => {
                job.stop_requested.store(true, Ordering::SeqCst);
                job.pid
            }
            None => return false,
        }
    };
    kill_process_tree(pid);
    true
}

fn clear_active_if_pid(pid: u32) {
    let mut guard = lock_active_job();
    if guard.as_ref().is_some_and(|job| job.pid == pid) {
        *guard = None;
    }
}

fn register_active_job(
    pid: u32,
    blender_path: &Path,
    output_fbx: &Path,
    stdout: Arc<Mutex<String>>,
    stderr: Arc<Mutex<String>>,
    stop_requested: Arc<AtomicBool>,
) -> Result<(), MotionInterchangeError> {
    let mut guard = lock_active_job();
    if guard.is_some() {
        return Err(MotionInterchangeError::Compose(
            "another Blender compose job is already running".to_string(),
        ));
    }
    *guard = Some(ActiveComposeJob {
        pid,
        blender_path: blender_path.to_string_lossy().to_string(),
        output_fbx: output_fbx.to_string_lossy().to_string(),
        started: Instant::now(),
        stdout,
        stderr,
        stop_requested,
    });
    Ok(())
}

struct ActiveJobGuard {
    pid: u32,
}

impl Drop for ActiveJobGuard {
    fn drop(&mut self) {
        clear_active_if_pid(self.pid);
    }
}

fn append_log(buffer: &Arc<Mutex<String>>, bytes: &[u8]) {
    let text = String::from_utf8_lossy(bytes);
    let mut guard = buffer.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.push_str(&text);
    if guard.len() > COMPOSE_LOG_CAP {
        let excess = guard.len() - COMPOSE_LOG_CAP;
        guard.drain(..excess);
    }
}

fn clone_log(buffer: &Arc<Mutex<String>>) -> String {
    buffer
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

fn tail_log(buffer: &Arc<Mutex<String>>, max_chars: usize) -> String {
    let text = clone_log(buffer);
    let count = text.chars().count();
    if count <= max_chars {
        return text;
    }
    text.chars().skip(count - max_chars).collect()
}

fn spawn_log_reader(pipe: impl Read + Send + 'static, buffer: Arc<Mutex<String>>) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut reader = pipe;
        let mut chunk = [0u8; 4096];
        loop {
            match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => append_log(&buffer, &chunk[..n]),
            }
        }
    })
}

fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        let mut command = Command::new("taskkill");
        command.args(["/PID", &pid.to_string(), "/T", "/F"]);
        apply_background_process_flags(&mut command);
        command.stdin(Stdio::null());
        command.stdout(Stdio::null());
        command.stderr(Stdio::null());
        let _ = command.status();
    }
    #[cfg(not(windows))]
    {
        let mut command = Command::new("kill");
        command.args(["-TERM", &pid.to_string()]);
        command.stdin(Stdio::null());
        command.stdout(Stdio::null());
        command.stderr(Stdio::null());
        let _ = command.status();
    }
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

    let script_path = match resolve_compose_script_path() {
        Ok(path) => path,
        Err(_) => materialize_embedded_compose_script(&staging.temp_dir)?,
    };
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

/// Resolve headless compose script path on disk.
///
/// Order: env `EXVS2_MOTION_FBX_COMPOSE_SCRIPT`, repo `tools/`, cwd `tools/`,
/// then `tools/` (or the file itself) next to the executable. Callers that
/// already have a staging directory should fall back to
/// [`materialize_embedded_compose_script`] so a copied exe still works.
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

    for candidate in compose_script_disk_candidates() {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err(MotionInterchangeError::Compose(format!(
        "compose script {COMPOSE_SCRIPT_NAME} not found (set {COMPOSE_SCRIPT_ENV} or install tools/{COMPOSE_SCRIPT_NAME} next to the app)"
    )))
}

/// Write the compile-time compose script into `dir` and return that path.
pub fn materialize_embedded_compose_script(dir: &Path) -> Result<PathBuf, MotionInterchangeError> {
    std::fs::create_dir_all(dir).map_err(|error| {
        MotionInterchangeError::Compose(format!(
            "failed to create compose script directory {}: {error}",
            dir.display()
        ))
    })?;
    let dest = dir.join(COMPOSE_SCRIPT_NAME);
    std::fs::write(&dest, EMBEDDED_COMPOSE_SCRIPT).map_err(|error| {
        MotionInterchangeError::Compose(format!(
            "failed to write embedded compose script {}: {error}",
            dest.display()
        ))
    })?;
    Ok(dest)
}

fn compose_script_disk_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
        let manifest = Path::new(manifest_dir);
        candidates.push(manifest.join("..").join("tools").join(COMPOSE_SCRIPT_NAME));
        candidates.push(manifest.join("scripts").join(COMPOSE_SCRIPT_NAME));
    }
    if let Ok(cwd) = std::env::current_dir() {
        for relative in [
            PathBuf::from("tools").join(COMPOSE_SCRIPT_NAME),
            PathBuf::from("src-tauri")
                .join("scripts")
                .join(COMPOSE_SCRIPT_NAME),
            PathBuf::from("scripts").join(COMPOSE_SCRIPT_NAME),
        ] {
            candidates.push(cwd.join(relative));
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            for relative in [
                PathBuf::from("tools").join(COMPOSE_SCRIPT_NAME),
                PathBuf::from("scripts").join(COMPOSE_SCRIPT_NAME),
                PathBuf::from(COMPOSE_SCRIPT_NAME),
            ] {
                candidates.push(exe_dir.join(relative));
            }
        }
    }
    candidates
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

    let mut command = Command::new(blender_path);
    command
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
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    apply_background_process_flags(&mut command);

    let mut child = command.spawn().map_err(|error| {
        MotionInterchangeError::Compose(format!(
            "failed to spawn Blender 5.1 at {}: {error}",
            blender_path.display()
        ))
    })?;

    let stdout_pipe = child.stdout.take().ok_or_else(|| {
        MotionInterchangeError::Compose("Blender process stdout pipe missing".to_string())
    })?;
    let stderr_pipe = child.stderr.take().ok_or_else(|| {
        MotionInterchangeError::Compose("Blender process stderr pipe missing".to_string())
    })?;

    let stdout_log = Arc::new(Mutex::new(String::new()));
    let stderr_log = Arc::new(Mutex::new(String::new()));
    let stop_requested = Arc::new(AtomicBool::new(false));
    let pid = child.id();
    if let Err(error) = register_active_job(
        pid,
        blender_path,
        output_fbx,
        Arc::clone(&stdout_log),
        Arc::clone(&stderr_log),
        Arc::clone(&stop_requested),
    ) {
        let _ = child.kill();
        kill_process_tree(pid);
        let _ = child.wait();
        return Err(error);
    }
    let _job_guard = ActiveJobGuard { pid };

    let stdout_handle = spawn_log_reader(stdout_pipe, Arc::clone(&stdout_log));
    let stderr_handle = spawn_log_reader(stderr_pipe, Arc::clone(&stderr_log));

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if stop_requested.load(Ordering::SeqCst) {
                    let _ = child.kill();
                    kill_process_tree(pid);
                    let _ = child.wait();
                    let _ = stdout_handle.join();
                    let _ = stderr_handle.join();
                    return Err(MotionInterchangeError::Compose(
                        COMPOSE_STOPPED_BY_USER.to_string(),
                    ));
                }
                if started.elapsed() >= COMPOSE_TIMEOUT {
                    let _ = child.kill();
                    kill_process_tree(pid);
                    let _ = child.wait();
                    let _ = stdout_handle.join();
                    let _ = stderr_handle.join();
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

    let _ = stdout_handle.join();
    let _ = stderr_handle.join();
    let stdout = clone_log(&stdout_log);
    let stderr = clone_log(&stderr_log);

    if stop_requested.load(Ordering::SeqCst) {
        return Err(MotionInterchangeError::Compose(
            COMPOSE_STOPPED_BY_USER.to_string(),
        ));
    }

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

    #[test]
    fn idle_compose_job_is_not_running() {
        let status = snapshot_compose_job();
        assert!(!status.running);
        assert!(status.pid.is_none());
        assert!(status.stdout_tail.is_empty());
    }

    #[test]
    fn stop_without_job_returns_false() {
        assert!(!request_stop_motion_fbx_compose());
    }

    #[test]
    fn hidden_process_flag_is_create_no_window() {
        assert_eq!(windows_hidden_process_creation_flags(), 0x0800_0000);
        assert_eq!(WINDOWS_CREATE_NO_WINDOW, 0x0800_0000);
    }
}
