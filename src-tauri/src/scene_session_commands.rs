use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{ipc::Channel, Emitter, State};

use crate::format::fhm2d_stage;
use crate::havok_cli;
use crate::scene_memory_session::{
    GraphicParam, HavokCollisionData, ImportConfig, PlacementEntry, SceneMemorySession,
    SceneSessionState, SceneSource, SsbhArtifactPaths, SsbhArtifacts,
};
use crate::ssbh_dae::{
    convert_dae_file, convert_fbx_file, ConvertedFiles, DaeConvertConfig, SsbhConvertStats,
};
use crate::ssbh_dae_cmd::build_session_numatb_artifacts;
use crate::ssbh_preview::{MatlProfilePreviewValues, SsbhModelPreviewBundle, TextureRefResolve};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneOpenResult {
    pub session_id: String,
    pub root_path: String,
    pub warnings: Vec<String>,
}

/// Progress payload emitted while `scene_open_folder` converts the stage's HKT
/// collision files to XML (each file is a slow Havok Content Tools invocation).
/// Mirrors the model-stream / texture-decode progress surfaced in the viewport.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HktLoadProgress {
    loaded: usize,
    total: usize,
}

/// Event name for HKT collision load progress (listened to in SceneEdit page).
const SCENE_HKT_PROGRESS_EVENT: &str = "scene-hkt-progress";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub import_id: String,
    pub name: String,
    pub ssbh_generated: bool,
    pub hkt_generated: bool,
    pub hkt_detail: Option<String>,
    pub warnings: Vec<String>,
}

const LARGE_STATIC_MESH_SOURCE_BYTES: u64 = 64 * 1024 * 1024;
const LARGE_STATIC_MESH_IPC_PAYLOAD_BYTES: u64 = 16 * 1024 * 1024;
const MAX_IMPORT_PREVIEW_ARTIFACT_BYTES: u64 = 128 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum StaticMeshImportProgress {
    Status {
        phase: String,
        label: String,
    },
    SourceFile {
        path: String,
        bytes: u64,
        format: String,
    },
    IpcWarning {
        phase: String,
        bytes: u64,
        threshold_bytes: u64,
        message: String,
    },
    ConvertStarted {
        format: String,
        source_name: String,
        base_filename: String,
    },
    ConvertFinished {
        total_bytes: u64,
        file_count: usize,
    },
    WriteStarted {
        output_dir: String,
        base_filename: String,
    },
    WriteFinished {
        file_count: usize,
    },
    HktStarted {
        source_name: String,
    },
    HktFinished {
        bytes: u64,
        triangle_count: usize,
    },
    Complete,
    Error {
        message: String,
    },
}

fn send_static_mesh_progress(
    on_progress: Option<&Channel<StaticMeshImportProgress>>,
    chunk: StaticMeshImportProgress,
) {
    if let Some(channel) = on_progress {
        let _ = channel.send(chunk);
    }
}

fn send_static_mesh_status(
    on_progress: Option<&Channel<StaticMeshImportProgress>>,
    phase: &str,
    label: impl Into<String>,
) {
    send_static_mesh_progress(
        on_progress,
        StaticMeshImportProgress::Status {
            phase: phase.to_string(),
            label: label.into(),
        },
    );
}

fn static_mesh_format_label(ext: &str) -> String {
    ext.to_ascii_uppercase()
}

fn static_mesh_source_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn send_large_source_warning(
    on_progress: Option<&Channel<StaticMeshImportProgress>>,
    phase: &str,
    bytes: u64,
    format: &str,
) {
    if bytes < LARGE_STATIC_MESH_SOURCE_BYTES {
        return;
    }
    send_static_mesh_progress(
        on_progress,
        StaticMeshImportProgress::IpcWarning {
            phase: phase.to_string(),
            bytes,
            threshold_bytes: LARGE_STATIC_MESH_SOURCE_BYTES,
            message: format!(
                "Large {format} source detected. Conversion status will use Channel metadata and avoid sending the source file back through frontend IPC."
            ),
        },
    );
}

fn send_large_artifact_warning(
    on_progress: Option<&Channel<StaticMeshImportProgress>>,
    phase: &str,
    bytes: u64,
) {
    if bytes < LARGE_STATIC_MESH_IPC_PAYLOAD_BYTES {
        return;
    }
    send_static_mesh_progress(
        on_progress,
        StaticMeshImportProgress::IpcWarning {
            phase: phase.to_string(),
            bytes,
            threshold_bytes: LARGE_STATIC_MESH_IPC_PAYLOAD_BYTES,
            message: "Large converted SSBH artifact payload detected. The command keeps payload transfer to Channel metadata and returns only the final small result.".to_string(),
        },
    );
}

fn send_static_mesh_source_progress(
    on_progress: Option<&Channel<StaticMeshImportProgress>>,
    source_path: &Path,
    phase: &str,
) -> Result<(&'static str, u64), String> {
    let ext = import_extension_from_path(source_path)?;
    let bytes = std::fs::metadata(source_path)
        .map_err(|e| format!("Failed to inspect '{}': {}", source_path.display(), e))?
        .len();
    let format = static_mesh_format_label(ext);
    send_static_mesh_progress(
        on_progress,
        StaticMeshImportProgress::SourceFile {
            path: source_path.to_string_lossy().to_string(),
            bytes,
            format: format.clone(),
        },
    );
    send_large_source_warning(on_progress, phase, bytes, &format);
    Ok((ext, bytes))
}

fn ssbh_artifact_payload_bytes(artifacts: &SsbhArtifacts) -> u64 {
    artifacts.numdlb.len() as u64
        + artifacts.numshb.len() as u64
        + artifacts.nusktb.as_ref().map_or(0, |v| v.len() as u64)
        + artifacts.numatb.len() as u64
        + artifacts.maya_numatb.as_ref().map_or(0, |v| v.len() as u64)
        + artifacts.jnttbl.len() as u64
}

fn ssbh_artifact_file_count(artifacts: &SsbhArtifacts) -> usize {
    usize::from(!artifacts.numdlb.is_empty())
        + usize::from(!artifacts.numshb.is_empty())
        + usize::from(artifacts.nusktb.as_ref().is_some_and(|v| !v.is_empty()))
        + usize::from(!artifacts.numatb.is_empty())
        + usize::from(
            artifacts
                .maya_numatb
                .as_ref()
                .is_some_and(|v| !v.is_empty()),
        )
        + usize::from(!artifacts.jnttbl.is_empty())
}

enum SessionSsbhArtifacts {
    Memory(SsbhArtifacts),
    Paths(SsbhArtifactPaths),
}

impl SessionSsbhArtifacts {
    fn payload_bytes(&self) -> u64 {
        match self {
            Self::Memory(artifacts) => ssbh_artifact_payload_bytes(artifacts),
            Self::Paths(paths) => paths.payload_bytes(),
        }
    }

    fn file_count(&self) -> usize {
        match self {
            Self::Memory(artifacts) => ssbh_artifact_file_count(artifacts),
            Self::Paths(paths) => paths.file_count(),
        }
    }

    fn numdlb_len(&self) -> u64 {
        self.path_or_memory_len(
            |artifacts| artifacts.numdlb.len() as u64,
            |paths| paths.numdlb.as_ref(),
        )
    }

    fn numshb_len(&self) -> u64 {
        self.path_or_memory_len(
            |artifacts| artifacts.numshb.len() as u64,
            |paths| paths.numshb.as_ref(),
        )
    }

    fn nusktb_len(&self) -> u64 {
        self.path_or_memory_len(
            |artifacts| artifacts.nusktb.as_ref().map_or(0, |v| v.len() as u64),
            |paths| paths.nusktb.as_ref(),
        )
    }

    fn numatb_len(&self) -> u64 {
        self.path_or_memory_len(
            |artifacts| artifacts.numatb.len() as u64,
            |paths| paths.numatb.as_ref(),
        )
    }

    fn path_or_memory_len(
        &self,
        memory_len: impl FnOnce(&SsbhArtifacts) -> u64,
        path_ref: impl FnOnce(&SsbhArtifactPaths) -> Option<&PathBuf>,
    ) -> u64 {
        match self {
            Self::Memory(artifacts) => memory_len(artifacts),
            Self::Paths(paths) => path_ref(paths)
                .and_then(|path| std::fs::metadata(path).ok())
                .map_or(0, |meta| meta.len()),
        }
    }
}

pub fn hkt_success_detail(name: &str, byte_len: usize, triangle_count: usize) -> String {
    format!(
        "HKT mesh collision generated for \"{name}\" ({byte_len} bytes, {triangle_count} triangles, skin-baked merge). \
         Mesh-accurate Havok compressed shape."
    )
}

pub fn hkt_simplify_to_options(
    cfg: &crate::scene_memory_session::HktSimplifyConfig,
) -> crate::collision_mesh::CollisionSimplifyOptions {
    crate::collision_mesh::CollisionSimplifyOptions {
        enabled: cfg.enabled,
        cos_planarity_threshold: crate::collision_mesh::cos_planarity_from_angle_deg(
            cfg.planarity_angle_deg,
        ),
        min_triangle_area: cfg.min_triangle_area,
        weld_epsilon: cfg.weld_epsilon,
        target_triangle_ratio: cfg.target_triangle_ratio,
        max_target_triangles: cfg.max_target_triangles,
        mode: match cfg.strategy {
            crate::scene_memory_session::CollisionStrategy::ShapePreserving => {
                crate::collision_mesh::CollisionSimplifyMode::ShapePreserving
            }
            crate::scene_memory_session::CollisionStrategy::ConvexHull => {
                crate::collision_mesh::CollisionSimplifyMode::ConvexHull
            }
        },
        hull_target_faces: cfg.hull_target_faces,
    }
}

pub fn hkt_collision_options_from_import(
    config: &ImportConfig,
) -> crate::collision_mesh::CollisionMeshOptions {
    let mut options = config
        .ssbh_config
        .as_ref()
        .map(|ssbh| {
            crate::collision_mesh::CollisionMeshOptions::from_ssbh_axis(
                &ssbh.up_axis,
                ssbh.scale_factor,
            )
        })
        .unwrap_or_default();
    options.simplify = hkt_simplify_to_options(&config.hkt_simplify);
    options
}

fn validate_static_mesh_hkt_collision_from_path(
    source_path: &Path,
    config: &ImportConfig,
) -> Result<(), String> {
    let source_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("input.dae")
        .to_string();
    let bytes = std::fs::read(source_path)
        .map_err(|e| format!("Failed to read '{}': {}", source_path.display(), e))?;
    crate::havok_collision_encode::preview_hkt_collision_from_import_bytes(
        &bytes,
        &source_name,
        hkt_collision_options_from_import(config),
    )
    .map(|_| ())
}

fn validate_static_mesh_hkt_collision_from_bytes(
    bytes: &[u8],
    source_name: &str,
    config: &ImportConfig,
) -> Result<(), String> {
    crate::havok_collision_encode::preview_hkt_collision_from_import_bytes(
        bytes,
        source_name,
        hkt_collision_options_from_import(config),
    )
    .map(|_| ())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub success: bool,
    pub files_written: u32,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteImportOptions {
    pub import_id: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateHktOptions {
    pub session_id: String,
    pub import_id: String,
    pub config_profile: String,
}

#[tauri::command]
pub fn scene_session_create(state: State<'_, SceneSessionState>, source: SceneSource) -> String {
    eprintln!("[scene_session_create] source={:?}", source);
    let sid = state.create_session(source);
    eprintln!("[scene_session_create] created session_id={}", sid);
    sid
}

#[tauri::command]
pub fn scene_session_destroy(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<(), String> {
    eprintln!("[scene_session_destroy] session_id={}", session_id);
    state.destroy_session(&session_id).inspect_err(|e| {
        eprintln!("[scene_session_destroy] failed: {}", e);
    })
}

#[tauri::command]
pub fn scene_session_is_dirty(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<bool, String> {
    state.with_session(&session_id, |s| Ok(s.dirty))
}

#[tauri::command]
pub fn scene_import_dae(
    state: State<'_, SceneSessionState>,
    session_id: String,
    dae_bytes: Vec<u8>,
    name: String,
) -> Result<String, String> {
    eprintln!(
        "[scene_import_dae] session_id={} name={} dae_bytes_len={}",
        session_id,
        name,
        dae_bytes.len()
    );
    let result = state.with_session_mut(&session_id, |s| Ok(s.add_import(name, dae_bytes)));
    match &result {
        Ok(import_id) => eprintln!("[scene_import_dae] success import_id={}", import_id),
        Err(e) => eprintln!("[scene_import_dae] failed: {}", e),
    }
    result
}

#[tauri::command]
pub fn scene_import_dae_from_path(
    state: State<'_, SceneSessionState>,
    session_id: String,
    file_path: String,
    name: String,
) -> Result<String, String> {
    eprintln!(
        "[scene_import_dae_from_path] session_id={} name={} path={}",
        session_id, name, file_path
    );
    let path = std::path::Path::new(&file_path);
    let result = state.with_session_mut(&session_id, |s| s.add_import_from_path(name, path));
    match &result {
        Ok(import_id) => eprintln!(
            "[scene_import_dae_from_path] success import_id={}",
            import_id
        ),
        Err(e) => eprintln!("[scene_import_dae_from_path] failed: {}", e),
    }
    result
}

#[tauri::command]
pub fn scene_import_dae_from_path_streamed(
    state: State<'_, SceneSessionState>,
    session_id: String,
    file_path: String,
    name: String,
    on_progress: Channel<StaticMeshImportProgress>,
) -> Result<String, String> {
    eprintln!(
        "[scene_import_dae_from_path_streamed] session_id={} name={} path={}",
        session_id, name, file_path
    );
    let path = std::path::Path::new(&file_path);
    send_static_mesh_status(
        Some(&on_progress),
        "read",
        "Checking selected static mesh file...",
    );
    let (ext, _) = send_static_mesh_source_progress(Some(&on_progress), path, "read")?;
    send_static_mesh_status(
        Some(&on_progress),
        "read",
        format!(
            "Registering {} source path in Rust session...",
            static_mesh_format_label(ext)
        ),
    );
    let result = state.with_session_mut(&session_id, |s| s.add_import_from_path(name, path));
    match &result {
        Ok(import_id) => {
            eprintln!(
                "[scene_import_dae_from_path_streamed] success import_id={}",
                import_id
            );
            send_static_mesh_status(Some(&on_progress), "read", "Source stored in Rust session.");
        }
        Err(e) => {
            eprintln!("[scene_import_dae_from_path_streamed] failed: {}", e);
            send_static_mesh_progress(
                Some(&on_progress),
                StaticMeshImportProgress::Error { message: e.clone() },
            );
        }
    }
    result
}

#[tauri::command]
pub fn scene_preview_hkt_collision_path(
    file_path: String,
    source_name: String,
    config: ImportConfig,
) -> Result<crate::havok_collision_encode::HktCollisionPreview, String> {
    let dae_bytes =
        std::fs::read(&file_path).map_err(|e| format!("Failed to read '{}': {}", file_path, e))?;
    let options = hkt_collision_options_from_import(&config);
    crate::havok_collision_encode::preview_hkt_collision_from_import_bytes(
        &dae_bytes,
        &source_name,
        options,
    )
}

/// Build the simplified collision mesh geometry for a freshly-selected DAE/FBX
/// so the New-Model HKT window can render a live 3D collision preview before the
/// (Havok-dependent) HKT is generated and applied.
#[tauri::command]
pub async fn scene_preview_hkt_collision_mesh_path(
    file_path: String,
    source_name: String,
    config: ImportConfig,
    stage: Option<crate::havok_collision_encode::HktCollisionReviewStage>,
) -> Result<crate::havok_collision_encode::HktCollisionMeshGeometryHeader, String> {
    // Must be async + spawn_blocking: this runs the full FBX/DAE parse → skin-bake →
    // merge → simplify pipeline, which is heavy for large models. A synchronous
    // command would run on the Tauri main thread and freeze the whole UI (and stall
    // any sibling invoke fired in the same Promise.all batch).
    let t = Instant::now();
    eprintln!(
        "[scene_preview_hkt_collision_mesh_path] start path={} source={} stage={}",
        file_path,
        source_name,
        stage.unwrap_or_default().label()
    );
    let options = hkt_collision_options_from_import(&config);
    let source_for_task = source_name.clone();
    let stage_for_task = stage.unwrap_or_default();
    let header = tauri::async_runtime::spawn_blocking(
        move || -> Result<crate::havok_collision_encode::HktCollisionMeshGeometryHeader, String> {
            let read_t = Instant::now();
            let dae_bytes = std::fs::read(&file_path)
                .map_err(|e| format!("Failed to read '{}': {}", file_path, e))?;
            eprintln!(
                "[scene_preview_hkt_collision_mesh_path] read {} bytes in {}ms",
                dae_bytes.len(),
                read_t.elapsed().as_millis()
            );
            let geometry =
                crate::havok_collision_encode::preview_hkt_collision_mesh_from_import_bytes_with_stage(
                    &dae_bytes,
                    &source_for_task,
                    options,
                    stage_for_task,
                )?;
            // Ship geometry as a binary blob over the IPC side-channel (same path as the
            // SSBH model loader) instead of a JSON number array; the frontend fetches it
            // via `take_mesh_geometry` and builds typed-array BufferAttributes directly.
            Ok(crate::havok_collision_encode::pack_and_register_collision_mesh(&geometry))
        },
    )
    .await
    .map_err(|e| format!("Preview task join error: {e}"))??;
    eprintln!(
        "[scene_preview_hkt_collision_mesh_path] done in {}ms (verts={} tris={})",
        t.elapsed().as_millis(),
        header.vertex_count,
        header.triangle_count
    );
    Ok(header)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportHktCollisionReviewObjOptions {
    pub file_path: String,
    pub source_name: String,
    pub config: ImportConfig,
    pub stage: crate::havok_collision_encode::HktCollisionReviewStage,
    pub output_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HktCollisionReviewObjExport {
    pub output_path: String,
    pub stage: crate::havok_collision_encode::HktCollisionReviewStage,
    pub triangle_count: usize,
    pub vertex_count: usize,
    pub render_triangle_count: usize,
    pub merged_triangle_count: usize,
}

/// Export a review OBJ for a selected FBX/DAE → HKT collision stage. The OBJ is
/// written in the Rust backend so large review meshes do not cross IPC as text.
#[tauri::command]
pub async fn scene_export_hkt_collision_review_obj_path(
    options: ExportHktCollisionReviewObjOptions,
) -> Result<HktCollisionReviewObjExport, String> {
    let t = Instant::now();
    eprintln!(
        "[scene_export_hkt_collision_review_obj_path] start path={} source={} stage={} output={}",
        options.file_path,
        options.source_name,
        options.stage.label(),
        options.output_path
    );

    let mesh_options = hkt_collision_options_from_import(&options.config);
    let stage = options.stage;
    let file_path = options.file_path.clone();
    let source_name = options.source_name.clone();
    let output_path = options.output_path.clone();
    let export = tauri::async_runtime::spawn_blocking(
        move || -> Result<HktCollisionReviewObjExport, String> {
            let bytes = std::fs::read(&file_path)
                .map_err(|e| format!("Failed to read '{}': {}", file_path, e))?;
            let stage_mesh =
                crate::havok_collision_encode::preview_hkt_collision_stage_mesh_from_import_bytes_with_stage(
                    &bytes,
                    &source_name,
                    mesh_options,
                    stage,
                )?;
            let out = std::path::PathBuf::from(&output_path);
            crate::havok_collision_encode::write_collision_mesh_obj(
                &out,
                &stage_mesh.mesh,
                stage_mesh.stage,
            )?;
            Ok(HktCollisionReviewObjExport {
                output_path: out.to_string_lossy().to_string(),
                stage: stage_mesh.stage,
                triangle_count: stage_mesh.mesh.triangle_count(),
                vertex_count: stage_mesh.mesh.vertices.len(),
                render_triangle_count: stage_mesh.render_triangle_count,
                merged_triangle_count: stage_mesh.merged_triangle_count,
            })
        },
    )
    .await
    .map_err(|e| format!("Export OBJ task join error: {e}"))??;
    eprintln!(
        "[scene_export_hkt_collision_review_obj_path] done in {}ms (verts={} tris={})",
        t.elapsed().as_millis(),
        export.vertex_count,
        export.triangle_count
    );
    Ok(export)
}

#[tauri::command]
pub fn scene_configure_import(
    state: State<'_, SceneSessionState>,
    session_id: String,
    import_id: String,
    config: ImportConfig,
) -> Result<(), String> {
    eprintln!(
        "[scene_configure_import] session_id={} import_id={} convert_to_ssbh={} generate_hkt={} load_to_scene={}",
        session_id, import_id, config.convert_to_ssbh, config.generate_hkt, config.load_to_scene
    );
    if let Some(ref sc) = config.ssbh_config {
        eprintln!(
            "[scene_configure_import] ssbh_config: base_filename={} scale={} up_axis={} numdlb={} numshb={} nusktb={}",
            sc.base_filename, sc.scale_factor, sc.up_axis,
            sc.write_numdlb, sc.write_numshb, sc.write_nusktb
        );
    }
    state
        .with_session_mut(&session_id, |s| {
            let import = s.find_import_mut(&import_id)?;
            import.config = config;
            Ok(())
        })
        .inspect_err(|e| eprintln!("[scene_configure_import] failed: {}", e))
}

#[tauri::command]
pub fn scene_remove_import(
    state: State<'_, SceneSessionState>,
    session_id: String,
    import_id: String,
) -> Result<(), String> {
    eprintln!(
        "[scene_remove_import] session_id={} import_id={}",
        session_id, import_id
    );
    state
        .with_session_mut(&session_id, |s| s.remove_import(&import_id))
        .inspect_err(|e| eprintln!("[scene_remove_import] failed: {}", e))
}

#[tauri::command]
pub fn scene_remove_havok_data(
    state: State<'_, SceneSessionState>,
    session_id: String,
    source_id: String,
) -> Result<(), String> {
    eprintln!(
        "[scene_remove_havok_data] session_id={} source_id={}",
        session_id, source_id
    );
    state
        .with_session_mut(&session_id, |s| s.remove_havok_data(&source_id))
        .inspect_err(|e| eprintln!("[scene_remove_havok_data] failed: {}", e))
}

fn scene_memory_virtual_path(session_id: &str, relative_path: &str) -> String {
    format!("memory://{session_id}/{}", relative_path.replace('\\', "/"))
}

fn with_nutexb_extension(path: &Path) -> std::path::PathBuf {
    if path
        .extension()
        .and_then(|s| s.to_str())
        .map(|e| e.eq_ignore_ascii_case("nutexb"))
        .unwrap_or(false)
    {
        path.to_path_buf()
    } else {
        path.with_extension("nutexb")
    }
}

fn frontend_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn resolve_scene_import_texture_ref(
    stage_root: Option<&str>,
    source_path: Option<&str>,
    reference: &str,
) -> Option<String> {
    let trimmed = reference.trim();
    if trimmed.is_empty() {
        return None;
    }

    let ref_path = Path::new(trimmed);
    if ref_path.is_absolute() {
        let candidate = with_nutexb_extension(ref_path);
        if candidate.is_file() {
            return Some(frontend_path(&candidate));
        }
    }

    let mut roots = Vec::new();
    if let Some(source) = source_path {
        if let Some(parent) = Path::new(source).parent() {
            roots.push(parent.to_path_buf());
        }
    }
    if let Some(root) = stage_root {
        let root_path = Path::new(root);
        roots.push(root_path.to_path_buf());
        roots.push(root_path.join("textures"));
    }

    let normalized = trimmed.replace('\\', "/");
    let basename = normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .next_back()
        .unwrap_or(trimmed);
    let candidates = if basename.eq_ignore_ascii_case(trimmed) {
        vec![trimmed.to_string()]
    } else {
        vec![normalized.clone(), basename.to_string()]
    };

    for root in roots {
        for candidate in &candidates {
            let joined = with_nutexb_extension(&root.join(candidate));
            if joined.is_file() {
                return Some(frontend_path(&joined));
            }
        }
    }

    None
}

fn build_scene_import_preview_bundle_from_artifacts(
    session_id: &str,
    import_id: &str,
    config: &ImportConfig,
    artifacts: &SsbhArtifacts,
    stage_root: Option<&str>,
    source_path: Option<&str>,
) -> Result<SsbhModelPreviewBundle, String> {
    let ssbh_config = config
        .ssbh_config
        .as_ref()
        .ok_or_else(|| format!("Import '{import_id}' has no SSBH config"))?;
    let base = ssbh_config.base_filename.trim();
    if base.is_empty() {
        return Err(format!(
            "Import '{import_id}' has an empty SSBH base filename"
        ));
    }
    if artifacts.numdlb.is_empty() || artifacts.numshb.is_empty() {
        return Err(format!(
            "Import '{import_id}' has incomplete SSBH artifacts"
        ));
    }

    let modl = crate::fhm2d_memory_preview::load_modl_data(&artifacts.numdlb)?;
    let mesh = crate::fhm2d_memory_preview::load_mesh_data(&artifacts.numshb)?;
    let skel = artifacts
        .nusktb
        .as_ref()
        .map(|bytes| crate::fhm2d_memory_preview::load_skel_data(bytes))
        .transpose()?;

    let mut matl_paths = Vec::new();
    let mut nust_matl = None;
    let mut maya_matl = None;
    if !artifacts.numatb.is_empty() {
        let path =
            scene_memory_virtual_path(session_id, &format!("{base}/0/{base}__nust__.numatb"));
        matl_paths.push(path);
        nust_matl = Some(crate::fhm2d_memory_preview::load_matl_data(
            &artifacts.numatb,
        )?);
    }
    if let Some(maya_bytes) = artifacts.maya_numatb.as_ref() {
        if !maya_bytes.is_empty() {
            let path =
                scene_memory_virtual_path(session_id, &format!("{base}/0/{base}__maya__.numatb"));
            matl_paths.push(path);
            maya_matl = Some(crate::fhm2d_memory_preview::load_matl_data(maya_bytes)?);
        }
    }

    let mut warnings = Vec::new();
    let mut matl_combined = None;
    for matl in [&nust_matl, &maya_matl].into_iter().flatten() {
        match matl_combined.as_mut() {
            None => matl_combined = Some(matl.clone()),
            Some(existing) => existing.entries.extend(matl.entries.clone()),
        }
    }

    let texture_refs = matl_combined
        .as_ref()
        .map(crate::fhm2d_memory_preview::collect_texture_refs)
        .unwrap_or_default();
    let mut resolved_nutexb_paths = Vec::new();
    let mut texture_resolve = Vec::new();
    for reference in &texture_refs {
        let nutexb_path =
            resolve_scene_import_texture_ref(stage_root, source_path, reference.as_str());
        if let Some(path) = nutexb_path.as_ref() {
            if !resolved_nutexb_paths
                .iter()
                .any(|existing| existing == path)
            {
                resolved_nutexb_paths.push(path.clone());
            }
        } else {
            warnings.push(format!(
                "Texture reference could not be resolved before save: {reference}"
            ));
        }
        texture_resolve.push(TextureRefResolve {
            reference: reference.clone(),
            nutexb_path,
        });
    }

    let root_folder = scene_memory_virtual_path(session_id, base);
    let modl_path = scene_memory_virtual_path(session_id, &format!("{base}/0/{base}.numdlb"));
    Ok(SsbhModelPreviewBundle {
        root_folder,
        modl_path: modl_path.clone(),
        mesh_path: scene_memory_virtual_path(session_id, &format!("{base}/0/{base}.numshb")),
        skel_path: artifacts
            .nusktb
            .as_ref()
            .map(|_| scene_memory_virtual_path(session_id, &format!("{base}/0/{base}.nusktb"))),
        matl_paths,
        modl: serde_json::to_value(&modl)
            .map_err(|e| format!("Failed to serialize in-memory Modl: {e}"))?,
        // Geometry travels as a binary side-channel; see ssbh_mesh_binary::pack_and_register.
        mesh: serde_json::to_value(crate::ssbh_mesh_binary::pack_and_register(&mesh))
            .map_err(|e| format!("Failed to serialize in-memory Mesh header: {e}"))?,
        skel: skel
            .map(|value| serde_json::to_value(&value))
            .transpose()
            .map_err(|e| format!("Failed to serialize in-memory Skel: {e}"))?,
        matl: matl_combined
            .map(|value| serde_json::to_value(&value))
            .transpose()
            .map_err(|e| format!("Failed to serialize in-memory Matl: {e}"))?,
        matl_profiles: Some(MatlProfilePreviewValues {
            maya: maya_matl
                .map(|value| serde_json::to_value(&value))
                .transpose()
                .map_err(|e| format!("Failed to serialize in-memory Maya Matl: {e}"))?,
            nust: nust_matl
                .map(|value| serde_json::to_value(&value))
                .transpose()
                .map_err(|e| format!("Failed to serialize in-memory Nust Matl: {e}"))?,
        }),
        texture_refs,
        resolved_nutexb_paths,
        texture_resolve,
        warnings,
        source_kind: "memory".to_string(),
        source_session_id: Some(session_id.to_string()),
        virtual_modl_path: Some(modl_path),
    })
}

#[tauri::command]
pub fn scene_build_import_preview_bundle(
    state: State<'_, SceneSessionState>,
    session_id: String,
    import_id: String,
    stage_root: Option<String>,
    source_path: Option<String>,
) -> Result<SsbhModelPreviewBundle, String> {
    state.with_session(&session_id, |s| {
        let import = s.find_import(&import_id)?;
        let artifact_bytes = SceneMemorySession::import_ssbh_artifact_payload_bytes(import);
        if artifact_bytes > MAX_IMPORT_PREVIEW_ARTIFACT_BYTES {
            return Err(format!(
                "Import '{import_id}' generated {artifact_bytes} bytes of SSBH artifacts, which is too large for viewport preview IPC. Use out-of-scene conversion or save the session to disk."
            ));
        }
        let artifacts = SceneMemorySession::read_import_ssbh_artifacts(import)?;
        build_scene_import_preview_bundle_from_artifacts(
            &session_id,
            &import_id,
            &import.config,
            &artifacts,
            stage_root.as_deref(),
            source_path.as_deref(),
        )
    })
}

/// Forget a sub-model from the in-memory session by its on-disk folder name so
/// the next save commits its deletion instead of re-materializing it from a
/// lingering converted import. Memory-only — disk is untouched until save.
#[tauri::command]
pub fn scene_forget_model(
    state: State<'_, SceneSessionState>,
    session_id: String,
    folder_name: String,
) -> Result<bool, String> {
    eprintln!(
        "[scene_forget_model] session_id={} folder_name={}",
        session_id, folder_name
    );
    state.with_session_mut(&session_id, |s| Ok(s.forget_model(&folder_name)))
}

/// Forget the in-memory base model (root SSBH files) so the next save commits
/// its deletion. Memory-only — disk is untouched until save.
#[tauri::command]
pub fn scene_forget_base_model(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<bool, String> {
    eprintln!("[scene_forget_base_model] session_id={}", session_id);
    state.with_session_mut(&session_id, |s| Ok(s.forget_base_model()))
}

#[tauri::command]
pub async fn scene_open_folder(
    app: tauri::AppHandle,
    state: State<'_, SceneSessionState>,
    path: String,
) -> Result<SceneOpenResult, String> {
    eprintln!("[scene_open_folder] Starting — path={}", path);
    let t = Instant::now();
    let path_clone = path.clone();
    let skeleton = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::load_stage_skeleton_impl(&path_clone)
    })
    .await
    .map_err(|e| {
        eprintln!(
            "[scene_open_folder] Failed in {}ms — spawn_blocking join error: {}",
            t.elapsed().as_millis(),
            e
        );
        e.to_string()
    })?
    .map_err(|e| {
        eprintln!(
            "[scene_open_folder] Failed in {}ms — load_stage_skeleton_impl failed: {}",
            t.elapsed().as_millis(),
            e
        );
        e
    })?;

    let warnings = skeleton.warnings;
    let placement_header = skeleton.placement_header;
    let placement_entries = skeleton.placement_entries;
    let graphic_params = skeleton.graphic_params;

    let stage_path = path.clone();
    let app_for_hkt = app.clone();
    let havok_data_list = tauri::async_runtime::spawn_blocking(move || {
        let emit = |loaded: usize, total: usize| {
            let _ = app_for_hkt.emit(
                SCENE_HKT_PROGRESS_EVENT,
                HktLoadProgress { loaded, total },
            );
        };
        collect_hkt_as_xml(&stage_path, &emit)
    })
    .await
    .map_err(|e| e.to_string())?;

    let session_id = state.create_session(SceneSource::Folder { path: path.clone() });
    state.with_session_mut(&session_id, |s| {
        s.placement_header = placement_header;
        s.placement_entries = placement_entries
            .into_iter()
            .map(|e| PlacementEntry {
                vdk_type: e.vdk_type,
                object_number: e.object_number,
                pos_x: e.pos_x,
                pos_y: e.pos_y,
                pos_z: e.pos_z,
                rot_x: e.rot_x,
                rot_y: e.rot_y,
                rot_z: e.rot_z,
                scale_x: e.scale_x,
                scale_y: e.scale_y,
                scale_z: e.scale_z,
                raw_fields: e.raw_fields,
            })
            .collect();
        s.graphic_params = graphic_params
            .into_iter()
            .map(|g| GraphicParam {
                key: g.key,
                value: g.value,
            })
            .collect();
        s.havok_data = havok_data_list;
        Ok(())
    })?;

    eprintln!(
        "[scene_open_folder] Done in {}ms — session_id={} warnings={}",
        t.elapsed().as_millis(),
        session_id,
        warnings.len()
    );
    Ok(SceneOpenResult {
        session_id,
        root_path: path,
        warnings,
    })
}

/// Scan stage folder for all .hkt files and convert each to XML via Havok Content Tools.
///
/// `on_progress(loaded, total)` is invoked once with `loaded == 0` after the file
/// list is known, then after every converted file, so the viewport can render an
/// HKT load progress bar. Source ids use forward slashes so they match the
/// replace / staging convention (`folder/map_hit.hkt`) and stay stable across
/// platforms.
fn collect_hkt_as_xml(
    stage_root: &str,
    on_progress: &dyn Fn(usize, usize),
) -> Vec<HavokCollisionData> {
    let config = match havok_cli::HavokCliConfig::detect() {
        Some(c) => c,
        None => {
            eprintln!(
                "[collect_hkt_as_xml] Havok Content Tools not found, skipping HKT conversion"
            );
            return Vec::new();
        }
    };
    if !Path::new(&config.filter_manager_path).exists() {
        eprintln!("[collect_hkt_as_xml] filter manager exe not found");
        return Vec::new();
    }

    let root = Path::new(stage_root);
    let mut results = Vec::new();

    fn find_hkt_files(dir: &Path, root: &Path, out: &mut Vec<(String, Vec<u8>)>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                find_hkt_files(&p, root, out);
            } else if p.extension().and_then(|e| e.to_str()) == Some("hkt") {
                let rel = p
                    .strip_prefix(root)
                    .map(|r| r.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| p.file_name().unwrap().to_string_lossy().to_string());
                if let Ok(bytes) = std::fs::read(&p) {
                    out.push((rel, bytes));
                }
            }
        }
    }

    let mut hkt_files: Vec<(String, Vec<u8>)> = Vec::new();
    find_hkt_files(root, root, &mut hkt_files);

    let total = hkt_files.len();
    on_progress(0, total);

    for (index, (source_id, raw_bytes)) in hkt_files.into_iter().enumerate() {
        match havok_cli::convert_hkt_bytes_to_xml(&config.filter_manager_path, &raw_bytes) {
            Ok(xml) => {
                eprintln!("[collect_hkt_as_xml] converted: {}", source_id);
                let display_name = Path::new(&source_id)
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| source_id.clone());
                let object_node_id = Path::new(&source_id).parent().and_then(|p| {
                    let s = p.to_string_lossy().to_string();
                    if s.is_empty() {
                        None
                    } else {
                        Some(s)
                    }
                });
                results.push(HavokCollisionData {
                    source_id,
                    display_name,
                    object_node_id,
                    hkt_xml: xml,
                    raw_bytes,
                });
            }
            Err(e) => {
                eprintln!(
                    "[collect_hkt_as_xml] failed to convert {}: {}",
                    source_id, e
                );
            }
        }
        on_progress(index + 1, total);
    }

    results
}

#[tauri::command]
pub async fn scene_execute_import(
    state: State<'_, SceneSessionState>,
    options: ExecuteImportOptions,
) -> Result<ImportResult, String> {
    scene_execute_import_impl(state, options, None).await
}

#[tauri::command]
pub async fn scene_execute_import_streamed(
    state: State<'_, SceneSessionState>,
    options: ExecuteImportOptions,
    on_progress: Channel<StaticMeshImportProgress>,
) -> Result<ImportResult, String> {
    scene_execute_import_impl(state, options, Some(on_progress)).await
}

async fn scene_execute_import_impl(
    state: State<'_, SceneSessionState>,
    options: ExecuteImportOptions,
    on_progress: Option<Channel<StaticMeshImportProgress>>,
) -> Result<ImportResult, String> {
    eprintln!(
        "[scene_execute_import] session_id={} import_id={}",
        options.session_id, options.import_id
    );
    send_static_mesh_status(
        on_progress.as_ref(),
        "read",
        "Loading static mesh import from Rust session...",
    );
    let (dae_bytes, source_path, name, source_name, config) = state
        .with_session(&options.session_id, |s| {
            let import = s.find_import(&options.import_id)?;
            Ok((
                import.dae_bytes.clone(),
                import.source_path.clone(),
                import.name.clone(),
                import.source_name.clone(),
                import.config.clone(),
            ))
        })
        .map_err(|e| {
            eprintln!("[scene_execute_import] find_import failed: {}", e);
            e
        })?;

    eprintln!(
        "[scene_execute_import] name={} source_name={} dae_bytes_len={} convert_to_ssbh={} generate_hkt={}",
        name,
        source_name,
        source_path
            .as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map_or(dae_bytes.len() as u64, |m| m.len()),
        config.convert_to_ssbh,
        config.generate_hkt
    );

    let mut ssbh_generated = false;
    let mut hkt_generated = false;
    let mut hkt_detail: Option<String> = None;
    let mut warnings: Vec<String> = Vec::new();
    let source_ext = import_extension_from_name(&source_name)?;
    let source_format = static_mesh_format_label(source_ext);
    let source_bytes = source_path
        .as_ref()
        .and_then(|p| std::fs::metadata(p).ok())
        .map_or(dae_bytes.len() as u64, |m| m.len());

    send_static_mesh_progress(
        on_progress.as_ref(),
        StaticMeshImportProgress::SourceFile {
            path: source_name.clone(),
            bytes: source_bytes,
            format: source_format.clone(),
        },
    );
    send_large_source_warning(on_progress.as_ref(), "read", source_bytes, &source_format);

    if config.convert_to_ssbh {
        if config.generate_hkt {
            send_static_mesh_status(
                on_progress.as_ref(),
                "collisionCheck",
                "Checking HKT collision mesh input...",
            );
            if let Some(source_path) = source_path.as_ref() {
                validate_static_mesh_hkt_collision_from_path(source_path, &config)?;
            } else {
                validate_static_mesh_hkt_collision_from_bytes(&dae_bytes, &source_name, &config)?;
            }
        }

        let ssbh_config = config.ssbh_config.clone().unwrap_or_else(|| {
            eprintln!("[scene_execute_import] no ssbh_config provided, using defaults");
            crate::scene_memory_session::SsbhConvertConfig {
                base_filename: name.clone(),
                scale_factor: 1.0,
                up_axis: "y_up".into(),
                flip_uv: false,
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: true,
                write_numatb: true,
                write_jnttbl: true,
                write_maya_profile: true,
                material_template: None,
                maya_file: None,
                nust_file: None,
                numdlb_entries: Vec::new(),
            }
        });

        eprintln!(
            "[scene_execute_import] SSBH conversion: base_filename={} scale={} up_axis={}",
            ssbh_config.base_filename, ssbh_config.scale_factor, ssbh_config.up_axis
        );
        send_static_mesh_progress(
            on_progress.as_ref(),
            StaticMeshImportProgress::ConvertStarted {
                format: source_format.clone(),
                source_name: source_name.clone(),
                base_filename: ssbh_config.base_filename.clone(),
            },
        );

        let dae_bytes_clone = dae_bytes.clone();
        let source_name_clone = source_name.clone();
        let source_path_clone = source_path.clone();
        let artifacts_result = tauri::async_runtime::spawn_blocking(move || {
            if let Some(source_path) = source_path_clone.as_ref() {
                convert_import_path_to_ssbh_artifact_paths(source_path, &ssbh_config)
                    .map(SessionSsbhArtifacts::Paths)
            } else {
                convert_import_bytes_to_ssbh_artifacts(
                    &dae_bytes_clone,
                    &source_name_clone,
                    &ssbh_config,
                )
                .map(SessionSsbhArtifacts::Memory)
            }
        })
        .await
        .map_err(|e| {
            eprintln!("[scene_execute_import] spawn_blocking join error: {}", e);
            send_static_mesh_progress(
                on_progress.as_ref(),
                StaticMeshImportProgress::Error {
                    message: format!("Task join error: {e}"),
                },
            );
            format!("Task join error: {e}")
        })?;
        let artifacts = artifacts_result.map_err(|e| {
            eprintln!("[scene_execute_import] SSBH conversion failed: {}", e);
            send_static_mesh_progress(
                on_progress.as_ref(),
                StaticMeshImportProgress::Error { message: e.clone() },
            );
            e
        })?;

        eprintln!(
            "[scene_execute_import] SSBH artifacts generated: numdlb={} numshb={} nusktb={} numatb={}",
            artifacts.numdlb_len(),
            artifacts.numshb_len(),
            artifacts.nusktb_len(),
            artifacts.numatb_len()
        );
        let artifact_bytes = artifacts.payload_bytes();
        let artifact_file_count = artifacts.file_count();
        send_static_mesh_progress(
            on_progress.as_ref(),
            StaticMeshImportProgress::ConvertFinished {
                total_bytes: artifact_bytes,
                file_count: artifact_file_count,
            },
        );
        send_large_artifact_warning(on_progress.as_ref(), "artifacts", artifact_bytes);
        send_static_mesh_status(
            on_progress.as_ref(),
            "artifacts",
            "Storing converted SSBH artifacts in Rust session...",
        );

        state.with_session_mut(&options.session_id, |s| match artifacts {
            SessionSsbhArtifacts::Memory(artifacts) => {
                s.store_ssbh_artifacts(&options.import_id, artifacts)
            }
            SessionSsbhArtifacts::Paths(paths) => {
                s.store_ssbh_artifact_paths(&options.import_id, paths)
            }
        })?;
        ssbh_generated = true;
    }

    if config.generate_hkt {
        eprintln!("[scene_execute_import] starting HKT generation");
        send_static_mesh_progress(
            on_progress.as_ref(),
            StaticMeshImportProgress::HktStarted {
                source_name: source_name.clone(),
            },
        );
        let hkt_options = hkt_collision_options_from_import(&config);
        if let Some(havok_config) = havok_cli::HavokCliConfig::detect() {
            if !std::path::Path::new(&havok_config.filter_manager_path).exists() {
                eprintln!("[scene_execute_import] hctStandAloneFilterManager.exe not found");
                warnings.push(format!(
                    "HKT generation skipped for \"{name}\": hctStandAloneFilterManager.exe not found"
                ));
            } else {
                eprintln!(
                    "[scene_execute_import] using Havok filter manager for mesh collision HKT"
                );
                let dae_bytes_clone = dae_bytes.clone();
                let import_name = source_name.clone();
                let source_path_clone = source_path.clone();
                let filter_path = havok_config.filter_manager_path.clone();
                match tauri::async_runtime::spawn_blocking(move || {
                    if let Some(source_path) = source_path_clone.as_ref() {
                        havok_cli::generate_hkt_from_import_path(
                            source_path,
                            &havok_config,
                            hkt_options,
                        )
                    } else {
                        havok_cli::generate_hkt_from_dae(
                            &dae_bytes_clone,
                            &import_name,
                            &havok_config,
                            hkt_options,
                        )
                    }
                })
                .await
                {
                    Ok(Ok(result)) => {
                        let hkt_bytes = result.bytes;
                        let hkt_size = hkt_bytes.len();
                        eprintln!(
                            "[scene_execute_import] HKT generated: {} bytes, {} triangles",
                            hkt_size, result.triangle_count
                        );
                        let hkt_xml = if !filter_path.is_empty() {
                            let bytes_for_xml = hkt_bytes.clone();
                            match tauri::async_runtime::spawn_blocking(move || {
                                havok_cli::convert_hkt_bytes_to_xml(&filter_path, &bytes_for_xml)
                            })
                            .await
                            {
                                Ok(Ok(xml)) => xml,
                                Ok(Err(e)) => {
                                    eprintln!(
                                        "[scene_execute_import] HKT→XML conversion failed: {e}"
                                    );
                                    String::new()
                                }
                                Err(e) => {
                                    eprintln!("[scene_execute_import] HKT→XML join error: {e}");
                                    String::new()
                                }
                            }
                        } else {
                            String::new()
                        };
                        let import_display_name = name.clone();
                        let import_id_for_node = options.import_id.clone();
                        state.with_session_mut(&options.session_id, |s| {
                            s.store_hkt_bytes(&options.import_id, hkt_bytes.clone())?;
                            if !hkt_xml.is_empty() {
                                s.upsert_havok_data(HavokCollisionData {
                                    source_id: options.import_id.clone(),
                                    display_name: import_display_name,
                                    object_node_id: Some(import_id_for_node),
                                    hkt_xml,
                                    raw_bytes: hkt_bytes,
                                });
                            }
                            Ok(())
                        })?;
                        hkt_generated = true;
                        hkt_detail =
                            Some(hkt_success_detail(&name, hkt_size, result.triangle_count));
                        send_static_mesh_progress(
                            on_progress.as_ref(),
                            StaticMeshImportProgress::HktFinished {
                                bytes: hkt_size as u64,
                                triangle_count: result.triangle_count,
                            },
                        );
                    }
                    Ok(Err(e)) => {
                        eprintln!(
                            "[scene_execute_import] HKT generation failed (non-fatal): {}",
                            e
                        );
                        warnings.push(format!("HKT generation failed for \"{name}\": {e}"));
                    }
                    Err(e) => {
                        eprintln!(
                            "[scene_execute_import] HKT spawn_blocking join error (non-fatal): {}",
                            e
                        );
                        warnings.push(format!("HKT generation task failed for \"{name}\": {e}"));
                    }
                }
            }
        } else {
            eprintln!("[scene_execute_import] Havok SDK not detected, skipping HKT");
            warnings.push(format!(
                "HKT generation skipped for \"{name}\": Havok Content Tools not installed"
            ));
        }
    }

    eprintln!(
        "[scene_execute_import] done: name={} ssbh_generated={} hkt_generated={}",
        name, ssbh_generated, hkt_generated
    );
    send_static_mesh_progress(on_progress.as_ref(), StaticMeshImportProgress::Complete);
    Ok(ImportResult {
        import_id: options.import_id,
        name,
        ssbh_generated,
        hkt_generated,
        hkt_detail,
        warnings,
    })
}

fn default_session_nust_matl_json() -> serde_json::Value {
    serde_json::json!({
        "major_version": 1,
        "minor_version": 6,
        "entries": [{
            "material_label": "pbr1Mtl",
            "shader_label": "vsngCharaBasic",
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
            "type4_v16": [],
            "type4_v15": [],
            "uv_transforms": []
        }]
    })
}

fn default_session_maya_matl_json() -> serde_json::Value {
    serde_json::json!({
        "major_version": 1,
        "minor_version": 6,
        "entries": [{
            "material_label": "pbr1Mtl",
            "shader_label": "",
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
            "type4_v16": [],
            "type4_v15": [],
            "uv_transforms": []
        }]
    })
}

fn resolve_session_numatb_profiles(
    ssbh_config: &crate::scene_memory_session::SsbhConvertConfig,
) -> (serde_json::Value, Option<serde_json::Value>) {
    let nust = ssbh_config
        .nust_file
        .clone()
        .unwrap_or_else(default_session_nust_matl_json);
    let maya = if ssbh_config.write_maya_profile {
        Some(
            ssbh_config
                .maya_file
                .clone()
                .unwrap_or_else(default_session_maya_matl_json),
        )
    } else {
        None
    };
    (nust, maya)
}

fn import_extension_from_name(source_name: &str) -> Result<&'static str, String> {
    let ext = Path::new(source_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("dae")
        .to_ascii_lowercase();
    match ext.as_str() {
        "dae" => Ok("dae"),
        "fbx" => Ok("fbx"),
        "" => Ok("dae"),
        other => Err(format!(
            "Unsupported static mesh format '.{other}'. Use .dae or .fbx"
        )),
    }
}

fn import_extension_from_path(path: &Path) -> Result<&'static str, String> {
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());
    import_extension_from_name(&name)
}

fn convert_import_file(
    input_path: &Path,
    convert_config: &DaeConvertConfig,
) -> Result<(ConvertedFiles, SsbhConvertStats), String> {
    match import_extension_from_path(input_path)? {
        "fbx" => convert_fbx_file(input_path, convert_config)
            .map_err(|e| format!("FBX conversion failed: {e:#}")),
        "dae" => convert_dae_file(input_path, convert_config)
            .map_err(|e| format!("DAE conversion failed: {e:#}")),
        _ => unreachable!("import_extension_from_path only returns dae/fbx"),
    }
}

fn convert_import_bytes_to_ssbh_artifacts(
    dae_bytes: &[u8],
    source_name: &str,
    ssbh_config: &crate::scene_memory_session::SsbhConvertConfig,
) -> Result<SsbhArtifacts, String> {
    let source_ext = import_extension_from_name(source_name)?;
    eprintln!(
        "[convert_import_bytes_to_ssbh] start: source_name={} source_ext={} bytes_len={} base_filename={}",
        source_name,
        source_ext,
        dae_bytes.len(),
        ssbh_config.base_filename
    );
    let temp_dir = tempfile::tempdir().map_err(|e| {
        eprintln!(
            "[convert_import_bytes_to_ssbh] failed to create temp dir: {}",
            e
        );
        format!("Failed to create temp dir: {e}")
    })?;
    let input_path = temp_dir.path().join(format!("input.{source_ext}"));
    eprintln!(
        "[convert_import_bytes_to_ssbh] writing temp import file to {}",
        input_path.display()
    );
    std::fs::write(&input_path, dae_bytes).map_err(|e| {
        eprintln!(
            "[convert_import_bytes_to_ssbh] failed to write temp import file: {}",
            e
        );
        format!("Failed to write temp import file: {e}")
    })?;

    let up_axis = match ssbh_config.up_axis.to_ascii_lowercase().as_str() {
        "z_up" | "zup" => crate::ssbh_dae::UpAxisConversion::ZUp,
        "none" | "no_conversion" => crate::ssbh_dae::UpAxisConversion::NoConversion,
        _ => crate::ssbh_dae::UpAxisConversion::YUp,
    };
    eprintln!("[convert_import_bytes_to_ssbh] up_axis={:?}", up_axis);

    let convert_config = DaeConvertConfig {
        output_directory: temp_dir.path().to_path_buf(),
        base_filename: ssbh_config.base_filename.clone(),
        scale_factor: ssbh_config.scale_factor as f32,
        up_axis_conversion: up_axis,
        flip_uv: ssbh_config.flip_uv,
        include_geometry_names: Vec::new(),
        write_numdlb: ssbh_config.write_numdlb,
        write_numshb: ssbh_config.write_numshb,
        write_nusktb: ssbh_config.write_nusktb,
        modl_entries: ssbh_config.numdlb_entries.clone(),
    };

    eprintln!(
        "[convert_import_bytes_to_ssbh] calling converter: numdlb={} numshb={} nusktb={}",
        convert_config.write_numdlb, convert_config.write_numshb, convert_config.write_nusktb
    );
    let (converted_files, stats) = convert_import_file(&input_path, &convert_config)?;

    eprintln!(
        "[convert_import_bytes_to_ssbh] convert success: mesh_objects={} total_vertices={} total_indices={} bones={}",
        stats.mesh_objects, stats.total_vertices, stats.total_triangle_indices, stats.bones
    );
    eprintln!(
        "[convert_import_bytes_to_ssbh] output files: numdlb={} numshb={} nusktb={} numatb={}",
        converted_files
            .numdlb_path
            .as_ref()
            .map_or("none".to_string(), |p| p.display().to_string()),
        converted_files
            .numshb_path
            .as_ref()
            .map_or("none".to_string(), |p| p.display().to_string()),
        converted_files
            .nusktb_path
            .as_ref()
            .map_or("none".to_string(), |p| p.display().to_string()),
        converted_files
            .numatb_path
            .as_ref()
            .map_or("none".to_string(), |p| p.display().to_string()),
    );

    let read_opt = |label: &str, path: &Option<std::path::PathBuf>| -> Result<Vec<u8>, String> {
        match path {
            Some(p) => {
                let data = std::fs::read(p).map_err(|e| {
                    eprintln!(
                        "[convert_import_bytes_to_ssbh] failed to read {}: {}",
                        label, e
                    );
                    format!("Failed to read {}: {e}", p.display())
                })?;
                eprintln!(
                    "[convert_import_bytes_to_ssbh] read {}: {} bytes",
                    label,
                    data.len()
                );
                Ok(data)
            }
            None => {
                eprintln!(
                    "[convert_import_bytes_to_ssbh] {} not generated (None)",
                    label
                );
                Ok(Vec::new())
            }
        }
    };

    let (nust_payload, maya_payload) = resolve_session_numatb_profiles(ssbh_config);
    let (numatb, maya_numatb) = build_session_numatb_artifacts(
        &ssbh_config.base_filename,
        ssbh_config.write_numatb,
        ssbh_config.write_maya_profile,
        Some(&nust_payload),
        maya_payload.as_ref(),
    )
    .map_err(|e| {
        eprintln!(
            "[convert_import_bytes_to_ssbh] numatb generation failed: {}",
            e
        );
        e
    })?;

    eprintln!(
        "[convert_import_bytes_to_ssbh] numatb artifacts: nust={} bytes, maya={:?} bytes",
        numatb.len(),
        maya_numatb.as_ref().map(|v| v.len())
    );

    let artifacts = SsbhArtifacts {
        numdlb: read_opt("numdlb", &converted_files.numdlb_path)?,
        numshb: read_opt("numshb", &converted_files.numshb_path)?,
        nusktb: converted_files
            .nusktb_path
            .as_ref()
            .map(|p| {
                std::fs::read(p).map_err(|e| {
                    eprintln!(
                        "[convert_import_bytes_to_ssbh] failed to read nusktb: {}",
                        e
                    );
                    format!("Failed to read nusktb: {e}")
                })
            })
            .transpose()?,
        numatb,
        maya_numatb,
        jnttbl: Vec::new(),
    };
    eprintln!("[convert_import_bytes_to_ssbh] done, artifacts ready");
    Ok(artifacts)
}

#[cfg(test)]
fn convert_dae_bytes_to_ssbh_artifacts(
    dae_bytes: &[u8],
    ssbh_config: &crate::scene_memory_session::SsbhConvertConfig,
) -> Result<SsbhArtifacts, String> {
    convert_import_bytes_to_ssbh_artifacts(dae_bytes, "input.dae", ssbh_config)
}

fn write_optional_artifact(
    output_dir: &Path,
    file_name: &str,
    data: &[u8],
) -> Result<Option<PathBuf>, String> {
    if data.is_empty() {
        return Ok(None);
    }
    let path = output_dir.join(file_name);
    std::fs::write(&path, data)
        .map_err(|e| format!("Failed to write generated artifact {}: {e}", path.display()))?;
    Ok(Some(path))
}

fn convert_import_path_to_ssbh_artifact_paths(
    source_path: &Path,
    ssbh_config: &crate::scene_memory_session::SsbhConvertConfig,
) -> Result<SsbhArtifactPaths, String> {
    import_extension_from_path(source_path)?;
    let temp_dir = tempfile::Builder::new()
        .prefix("scene-import-ssbh-")
        .tempdir()
        .map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let up_axis = match ssbh_config.up_axis.to_ascii_lowercase().as_str() {
        "z_up" | "zup" => crate::ssbh_dae::UpAxisConversion::ZUp,
        "none" | "no_conversion" => crate::ssbh_dae::UpAxisConversion::NoConversion,
        _ => crate::ssbh_dae::UpAxisConversion::YUp,
    };

    let convert_config = DaeConvertConfig {
        output_directory: temp_dir.path().to_path_buf(),
        base_filename: ssbh_config.base_filename.clone(),
        scale_factor: ssbh_config.scale_factor as f32,
        up_axis_conversion: up_axis,
        flip_uv: ssbh_config.flip_uv,
        include_geometry_names: Vec::new(),
        write_numdlb: ssbh_config.write_numdlb,
        write_numshb: ssbh_config.write_numshb,
        write_nusktb: ssbh_config.write_nusktb,
        modl_entries: ssbh_config.numdlb_entries.clone(),
    };

    let (converted_files, stats) = convert_import_file(source_path, &convert_config)?;
    eprintln!(
        "[convert_import_path_to_ssbh_paths] source={} mesh_objects={} total_vertices={} total_indices={} bones={}",
        source_path.display(),
        stats.mesh_objects,
        stats.total_vertices,
        stats.total_triangle_indices,
        stats.bones
    );

    let (nust_payload, maya_payload) = resolve_session_numatb_profiles(ssbh_config);
    let (numatb, maya_numatb) = build_session_numatb_artifacts(
        &ssbh_config.base_filename,
        ssbh_config.write_numatb,
        ssbh_config.write_maya_profile,
        Some(&nust_payload),
        maya_payload.as_ref(),
    )?;
    let numatb_path = write_optional_artifact(
        temp_dir.path(),
        &format!("{}__nust__.numatb", ssbh_config.base_filename),
        &numatb,
    )?;
    let maya_numatb_path = maya_numatb
        .as_ref()
        .map(|bytes| {
            write_optional_artifact(
                temp_dir.path(),
                &format!("{}__maya__.numatb", ssbh_config.base_filename),
                bytes,
            )
        })
        .transpose()?
        .flatten();
    let root_dir = temp_dir.keep();

    Ok(SsbhArtifactPaths {
        root_dir,
        numdlb: converted_files.numdlb_path,
        numshb: converted_files.numshb_path,
        nusktb: converted_files.nusktb_path,
        numatb: numatb_path,
        maya_numatb: maya_numatb_path,
        jnttbl: None,
    })
}

fn write_static_mesh_artifact_paths(
    output_dir: &Path,
    base: &str,
    artifacts: &SsbhArtifactPaths,
    write_jnttbl: bool,
) -> Result<Vec<String>, String> {
    let model_dir = output_dir.join(base).join("0");
    std::fs::create_dir_all(&model_dir)
        .map_err(|e| format!("Failed to create {}: {e}", model_dir.display()))?;

    let mut written = Vec::new();
    let mut copy_file = |relative: String, source: &Option<PathBuf>| -> Result<(), String> {
        let Some(source) = source.as_ref() else {
            return Ok(());
        };
        if !source.is_file() {
            return Ok(());
        }
        let target = output_dir.join(&relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
        }
        std::fs::copy(source, &target).map_err(|e| {
            format!(
                "Failed to copy generated artifact {} to {}: {e}",
                source.display(),
                target.display()
            )
        })?;
        written.push(relative);
        Ok(())
    };

    copy_file(format!("{base}/0/{base}.numdlb"), &artifacts.numdlb)?;
    copy_file(format!("{base}/0/{base}.numshb"), &artifacts.numshb)?;
    copy_file(format!("{base}/0/{base}.nusktb"), &artifacts.nusktb)?;
    copy_file(format!("{base}/0/{base}__nust__.numatb"), &artifacts.numatb)?;
    copy_file(
        format!("{base}/0/{base}__maya__.numatb"),
        &artifacts.maya_numatb,
    )?;
    if write_jnttbl {
        copy_file(format!("{base}/0/{base}.jnttbl"), &artifacts.jnttbl)?;
    }

    Ok(written)
}

#[tauri::command]
pub async fn scene_generate_hkt(
    state: State<'_, SceneSessionState>,
    options: GenerateHktOptions,
) -> Result<bool, String> {
    eprintln!(
        "[scene_generate_hkt] session_id={} import_id={} profile={}",
        options.session_id, options.import_id, options.config_profile
    );
    let (dae_bytes, source_path, import_name, hkt_options) = state
        .with_session(&options.session_id, |s| {
            let import = s.find_import(&options.import_id)?;
            eprintln!(
                "[scene_generate_hkt] source_path={:?} dae_bytes_len={}",
                import.source_path,
                import.dae_bytes.len(),
            );
            Ok((
                import.dae_bytes.clone(),
                import.source_path.clone(),
                import.source_name.clone(),
                hkt_collision_options_from_import(&import.config),
            ))
        })
        .map_err(|e| {
            eprintln!("[scene_generate_hkt] find_import failed: {}", e);
            e
        })?;

    let havok_config = havok_cli::HavokCliConfig::detect().ok_or_else(|| {
        eprintln!("[scene_generate_hkt] Havok SDK not found");
        "Havok SDK not found".to_string()
    })?;

    let _profile = &options.config_profile;
    let regen_display_name = import_name.clone();
    eprintln!("[scene_generate_hkt] calling mesh collision HKT generator");
    let hkt_result = tauri::async_runtime::spawn_blocking(move || {
        if let Some(source_path) = source_path.as_ref() {
            havok_cli::generate_hkt_from_import_path(source_path, &havok_config, hkt_options)
        } else {
            havok_cli::generate_hkt_from_dae(&dae_bytes, &import_name, &havok_config, hkt_options)
        }
    })
    .await
    .map_err(|e| {
        eprintln!("[scene_generate_hkt] spawn_blocking join error: {}", e);
        format!("Task join error: {e}")
    })?
    .map_err(|e| {
        eprintln!("[scene_generate_hkt] generate_hkt_from_dae failed: {}", e);
        e
    })?;

    let hkt_bytes = hkt_result.bytes;
    eprintln!(
        "[scene_generate_hkt] generated {} bytes ({} triangles)",
        hkt_bytes.len(),
        hkt_result.triangle_count
    );

    let filter_path = havok_cli::HavokCliConfig::detect()
        .map(|c| c.filter_manager_path.clone())
        .unwrap_or_default();
    let hkt_xml = if !filter_path.is_empty() {
        let bytes_for_xml = hkt_bytes.clone();
        tauri::async_runtime::spawn_blocking(move || {
            havok_cli::convert_hkt_bytes_to_xml(&filter_path, &bytes_for_xml)
        })
        .await
        .map_err(|e| format!("XML conversion join error: {e}"))?
        .unwrap_or_else(|e| {
            eprintln!("[scene_generate_hkt] HKT→XML conversion failed: {e}");
            String::new()
        })
    } else {
        String::new()
    };

    let regen_node_id = options.import_id.clone();
    state.with_session_mut(&options.session_id, |s| {
        s.store_hkt_bytes(&options.import_id, hkt_bytes.clone())?;
        s.upsert_havok_data(HavokCollisionData {
            source_id: options.import_id.clone(),
            display_name: regen_display_name,
            object_node_id: Some(regen_node_id),
            hkt_xml,
            raw_bytes: hkt_bytes,
        });
        Ok(())
    })?;

    eprintln!("[scene_generate_hkt] done");
    Ok(true)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateHktFromMeshOptions {
    pub session_id: String,
    pub folder_name: String,
    pub hkt_simplify: crate::scene_memory_session::HktSimplifyConfig,
}

#[tauri::command]
pub async fn scene_generate_hkt_from_mesh(
    state: State<'_, SceneSessionState>,
    options: GenerateHktFromMeshOptions,
) -> Result<bool, String> {
    eprintln!(
        "[scene_generate_hkt_from_mesh] session_id={} folder_name={}",
        options.session_id, options.folder_name
    );

    let numshb_bytes = state.with_session(&options.session_id, |s| {
        // Try from in-memory bundle first
        if let Some(bundle) = s.base_bundle.as_ref() {
            let files = if options.folder_name == "base" {
                &bundle.root_files
            } else {
                bundle
                    .sub_model_files
                    .get(&options.folder_name)
                    .ok_or_else(|| format!("Folder '{}' not found", options.folder_name))?
            };
            let (_, bytes) = files
                .iter()
                .find(|(k, _)| k.ends_with(".numshb"))
                .ok_or_else(|| format!("No .numshb file in folder '{}'", options.folder_name))?;
            return Ok(bytes.clone());
        }
        // Fallback: read numshb from disk using session source path
        let base_path = match &s.source {
            SceneSource::Folder { path } => path.clone(),
            SceneSource::Fhm2d { path } => std::path::Path::new(path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
            SceneSource::New => {
                return Err("No base bundle loaded and no stage path available".to_string())
            }
        };
        let folder_dir = if options.folder_name == "base" {
            std::path::PathBuf::from(&base_path)
        } else {
            std::path::PathBuf::from(&base_path).join(&options.folder_name)
        };
        // The mesh (.numshb) is the sibling of the model's .numdlb, which may sit one
        // level below `folder_dir` (e.g. `<folder>/0/<name>.numshb`). Mirror the stage
        // loader's discovery so HKT generation uses the same mesh that is displayed.
        let numshb_path = crate::format::fhm2d_stage::find_model_numshb(&folder_dir)
            .ok_or_else(|| format!("No .numshb file in folder '{}'", folder_dir.display()))?;
        std::fs::read(&numshb_path)
            .map_err(|e| format!("Failed to read '{}': {}", numshb_path.display(), e))
    })?;

    eprintln!(
        "[scene_generate_hkt_from_mesh] numshb_bytes_len={}",
        numshb_bytes.len()
    );

    let havok_config = havok_cli::HavokCliConfig::detect().ok_or_else(|| {
        eprintln!("[scene_generate_hkt_from_mesh] Havok SDK not found");
        "Havok SDK not found".to_string()
    })?;

    let simplify_opts = hkt_simplify_to_options(&options.hkt_simplify);
    let filter_path = havok_config.filter_manager_path.clone();

    let hkt_bytes = tauri::async_runtime::spawn_blocking(move || {
        let mesh = crate::numshb_collision::numshb_bytes_to_collision_trimesh(&numshb_bytes)?;
        eprintln!(
            "[scene_generate_hkt_from_mesh] mesh verts={} tris={}",
            mesh.vertices.len(),
            mesh.triangle_count()
        );
        let mesh = crate::collision_mesh::simplify_collision_mesh(&mesh, &simplify_opts)?;
        eprintln!(
            "[scene_generate_hkt_from_mesh] after simplify tris={}",
            mesh.triangle_count()
        );
        let xml = crate::havok_mesh_encode::build_mesh_collision_xml_faithful(&mesh)?;
        crate::havok_collision_encode::convert_xml_string_to_hkt(&filter_path, &xml)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
    .map_err(|e| {
        eprintln!("[scene_generate_hkt_from_mesh] HKT generation failed: {e}");
        e
    })?;

    eprintln!(
        "[scene_generate_hkt_from_mesh] generated {} bytes",
        hkt_bytes.len()
    );

    let filter_path2 = havok_cli::HavokCliConfig::detect()
        .map(|c| c.filter_manager_path.clone())
        .unwrap_or_default();
    let hkt_xml = if !filter_path2.is_empty() {
        let bytes_for_xml = hkt_bytes.clone();
        tauri::async_runtime::spawn_blocking(move || {
            havok_cli::convert_hkt_bytes_to_xml(&filter_path2, &bytes_for_xml)
        })
        .await
        .map_err(|e| format!("XML conversion join error: {e}"))?
        .unwrap_or_else(|e| {
            eprintln!("[scene_generate_hkt_from_mesh] HKT→XML conversion failed: {e}");
            String::new()
        })
    } else {
        String::new()
    };

    let folder_name = options.folder_name.clone();
    let source_id = format!("mesh-hkt-{}", folder_name);
    let display_name = format!("{}/map_hit.hkt", folder_name);

    let hkt_target_id = format!("{folder_name}/map_hit.hkt");
    state.with_session_mut(&options.session_id, |s| {
        s.store_stage_folder_hkt_bytes(&hkt_target_id, hkt_bytes.clone())?;
        s.upsert_havok_data(HavokCollisionData {
            source_id,
            display_name,
            object_node_id: None,
            hkt_xml,
            raw_bytes: hkt_bytes,
        });
        Ok(())
    })?;

    eprintln!("[scene_generate_hkt_from_mesh] done");
    Ok(true)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceHktOptions {
    pub session_id: String,
    pub import_id: String,
    pub hkt_path: String,
}

#[tauri::command]
pub async fn scene_replace_hkt(
    state: State<'_, SceneSessionState>,
    options: ReplaceHktOptions,
) -> Result<bool, String> {
    let hkt_bytes = std::fs::read(&options.hkt_path)
        .map_err(|e| format!("Failed to read HKT file {}: {e}", options.hkt_path))?;

    let display_name = std::path::Path::new(&options.hkt_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("replaced.hkt")
        .to_string();

    let filter_path = havok_cli::HavokCliConfig::detect()
        .map(|c| c.filter_manager_path.clone())
        .unwrap_or_default();
    let hkt_xml = if !filter_path.is_empty() {
        let bytes_for_xml = hkt_bytes.clone();
        tauri::async_runtime::spawn_blocking(move || {
            havok_cli::convert_hkt_bytes_to_xml(&filter_path, &bytes_for_xml)
        })
        .await
        .map_err(|e| format!("XML conversion join error: {e}"))?
        .unwrap_or_else(|e| {
            eprintln!("[scene_replace_hkt] HKT→XML failed: {e}");
            String::new()
        })
    } else {
        String::new()
    };

    state.with_session_mut(&options.session_id, |s| {
        eprintln!(
            "[scene_replace_hkt] import_id={:?} pending_imports={} has_base_bundle={} source={:?}",
            options.import_id,
            s.pending_imports.len(),
            s.base_bundle.is_some(),
            s.source
        );
        apply_replacement_hkt_to_session(s, &options.import_id, hkt_bytes, hkt_xml, display_name)
    })?;

    Ok(true)
}

/// Apply replacement HKT (already-decoded bytes + optional XML) onto a target in
/// the session, resolving the target across pending DAE imports, the in-memory
/// base bundle (FHM2D sub-models), and folder-backed sessions. Shared by both
/// `scene_replace_hkt` (existing .hkt file) and `scene_replace_hkt_from_dae_path`
/// (HKT freshly generated from a new DAE).
///
/// Folder-backed sessions also update the in-memory bundle overlay; callers such as
/// `scene_replace_hkt_from_dae_path` may write `map_hit.hkt` to the live stage
/// directory immediately after this succeeds.
fn apply_replacement_hkt_to_session(
    s: &mut crate::scene_memory_session::SceneMemorySession,
    import_id: &str,
    hkt_bytes: Vec<u8>,
    hkt_xml: String,
    display_name: String,
) -> Result<(), String> {
    // Pending DAE imports keep HKT on the import record; on-disk stage folders are
    // staged in the in-memory base bundle (and may also be written live by callers).
    if s.find_import(import_id).is_ok() {
        eprintln!("[apply_replacement_hkt] found in pending_imports");
        s.store_hkt_bytes(import_id, hkt_bytes.clone())?;
    } else {
        eprintln!(
            "[apply_replacement_hkt] staging in memory for target_id={import_id}"
        );
        s.store_stage_folder_hkt_bytes(import_id, hkt_bytes.clone())?;
    }
    s.upsert_havok_data(HavokCollisionData {
        source_id: import_id.to_string(),
        display_name,
        object_node_id: Some(import_id.to_string()),
        hkt_xml,
        raw_bytes: hkt_bytes,
    });
    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceHktFromDaeOptions {
    pub session_id: String,
    pub import_id: String,
    pub file_path: String,
    pub source_name: String,
    pub config: ImportConfig,
}

async fn generate_hkt_bytes_from_dae_path(
    file_path: &str,
    _source_name: &str,
    config: &ImportConfig,
) -> Result<crate::havok_collision_encode::HktGenerationResult, String> {
    let mesh_options = hkt_collision_options_from_import(config);
    let havok_config = havok_cli::HavokCliConfig::detect().ok_or_else(|| {
        eprintln!("[generate_hkt_bytes_from_dae_path] Havok SDK not found");
        "Havok SDK not found".to_string()
    })?;
    let path = file_path.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        havok_cli::generate_hkt_from_import_path(
            std::path::Path::new(&path),
            &havok_config,
            mesh_options,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
    .map_err(|e| {
        eprintln!("[generate_hkt_bytes_from_dae_path] generate_hkt_from_import_path failed: {e}");
        e
    })
}

async fn hkt_xml_from_bytes(hkt_bytes: &[u8]) -> String {
    let filter_path = havok_cli::HavokCliConfig::detect()
        .map(|c| c.filter_manager_path.clone())
        .unwrap_or_default();
    if filter_path.is_empty() {
        return String::new();
    }
    let bytes_for_xml = hkt_bytes.to_vec();
    match tauri::async_runtime::spawn_blocking(move || {
        havok_cli::convert_hkt_bytes_to_xml(&filter_path, &bytes_for_xml)
    })
    .await
    {
        Ok(Ok(xml)) => xml,
        Ok(Err(e)) => {
            eprintln!("[hkt_xml_from_bytes] HKT→XML failed: {e}");
            String::new()
        }
        Err(e) => {
            eprintln!("[hkt_xml_from_bytes] XML conversion join error: {e}");
            String::new()
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedHktFromDaePayload {
    pub hkt_bytes: Vec<u8>,
    pub triangle_count: usize,
    /// Decoded via Havok Content Tools — same XML the scene overlay parses.
    pub hkt_xml: String,
}

/// Generate HKT bytes from a DAE/FBX path without applying to the session.
/// Used by the New-Model HKT dialog so Apply can reuse the preview generation.
#[tauri::command]
pub async fn scene_generate_replacement_hkt_from_dae_path(
    file_path: String,
    source_name: String,
    config: ImportConfig,
) -> Result<GeneratedHktFromDaePayload, String> {
    eprintln!(
        "[scene_generate_replacement_hkt_from_dae_path] path={} source={}",
        file_path, source_name
    );
    let hkt_result = generate_hkt_bytes_from_dae_path(&file_path, &source_name, &config).await?;
    let hkt_xml = hkt_xml_from_bytes(&hkt_result.bytes).await;
    eprintln!(
        "[scene_generate_replacement_hkt_from_dae_path] generated {} bytes ({} triangles)",
        hkt_result.bytes.len(),
        hkt_result.triangle_count
    );
    Ok(GeneratedHktFromDaePayload {
        hkt_bytes: hkt_result.bytes,
        triangle_count: hkt_result.triangle_count,
        hkt_xml,
    })
}

/// Write HKT bytes to a stage `map_hit.hkt` path via a same-directory temp file.
fn write_hkt_bytes_to_stage_disk(disk_path: &std::path::Path, hkt_bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = disk_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    let temp_path = disk_path.with_extension("hkt.tmp");
    std::fs::write(&temp_path, hkt_bytes)
        .map_err(|e| format!("Failed to write {}: {e}", temp_path.display()))?;
    std::fs::rename(&temp_path, disk_path).map_err(|e| {
        let _ = std::fs::remove_file(&temp_path);
        format!("Failed to replace {}: {e}", disk_path.display())
    })?;
    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyReplacementHktBytesOptions {
    pub session_id: String,
    pub import_id: String,
    pub hkt_bytes: Vec<u8>,
    pub display_name: String,
}

/// Apply pre-generated HKT bytes onto a session target (no mesh/Havok re-generation).
#[tauri::command]
pub async fn scene_apply_replacement_hkt_bytes(
    state: State<'_, SceneSessionState>,
    options: ApplyReplacementHktBytesOptions,
) -> Result<bool, String> {
    eprintln!(
        "[scene_apply_replacement_hkt_bytes] session_id={} import_id={} bytes={}",
        options.session_id,
        options.import_id,
        options.hkt_bytes.len()
    );
    let hkt_xml = hkt_xml_from_bytes(&options.hkt_bytes).await;
    let import_id = options.import_id.clone();
    let display_name = options.display_name.clone();
    state.with_session_mut(&options.session_id, |s| {
        apply_replacement_hkt_to_session(s, &import_id, options.hkt_bytes, hkt_xml, display_name)
    })?;
    Ok(true)
}

/// Generate a mesh-accurate HKT from a freshly-selected DAE/FBX (using the same
/// skin-bake → merge → simplify pipeline as scene_generate_hkt) and apply it to
/// the target import — the "generate HKT from a new model" replace flow.
#[tauri::command]
pub async fn scene_replace_hkt_from_dae_path(
    state: State<'_, SceneSessionState>,
    options: ReplaceHktFromDaeOptions,
) -> Result<bool, String> {
    eprintln!(
        "[scene_replace_hkt_from_dae_path] session_id={} import_id={} path={}",
        options.session_id, options.import_id, options.file_path
    );
    let hkt_result = generate_hkt_bytes_from_dae_path(
        &options.file_path,
        &options.source_name,
        &options.config,
    )
    .await?;
    let hkt_bytes = hkt_result.bytes;
    eprintln!(
        "[scene_replace_hkt_from_dae_path] generated {} bytes ({} triangles)",
        hkt_bytes.len(),
        hkt_result.triangle_count
    );

    let hkt_xml = hkt_xml_from_bytes(&hkt_bytes).await;
    let display_name = options.source_name.clone();
    let import_id = options.import_id.clone();

    let disk_path = state.with_session(&options.session_id, |s| {
        Ok(s.resolve_hkt_disk_path(&import_id))
    })?;

    state.with_session_mut(&options.session_id, |s| {
        apply_replacement_hkt_to_session(
            s,
            &import_id,
            hkt_bytes.clone(),
            hkt_xml,
            display_name,
        )
    })?;

    if let Some(disk_path) = disk_path {
        write_hkt_bytes_to_stage_disk(&disk_path, &hkt_bytes)?;
        eprintln!(
            "[scene_replace_hkt_from_dae_path] wrote {} bytes to {}",
            hkt_bytes.len(),
            disk_path.display()
        );
    }

    eprintln!("[scene_replace_hkt_from_dae_path] done");
    Ok(true)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HavokDataMeta {
    pub source_id: String,
    pub display_name: String,
    pub object_node_id: Option<String>,
    pub hkt_xml: String,
}

impl From<&HavokCollisionData> for HavokDataMeta {
    fn from(d: &HavokCollisionData) -> Self {
        Self {
            source_id: d.source_id.clone(),
            display_name: d.display_name.clone(),
            object_node_id: d.object_node_id.clone(),
            hkt_xml: d.hkt_xml.clone(),
        }
    }
}

#[tauri::command]
pub fn scene_get_havok_meta(
    state: State<'_, SceneSessionState>,
    session_id: String,
    source_id: String,
) -> Result<Option<HavokDataMeta>, String> {
    state.with_session(&session_id, |s| {
        Ok(s.get_havok_data(&source_id).map(HavokDataMeta::from))
    })
}

#[tauri::command]
pub fn scene_list_havok_meta(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<Vec<HavokDataMeta>, String> {
    state.with_session(&session_id, |s| {
        Ok(s.havok_data.iter().map(HavokDataMeta::from).collect())
    })
}

#[tauri::command]
pub fn scene_get_havok_raw_bytes(
    state: State<'_, SceneSessionState>,
    session_id: String,
    source_id: String,
) -> Result<tauri::ipc::Response, String> {
    state.with_session(&session_id, |s| match s.get_havok_data(&source_id) {
        Some(d) => Ok(tauri::ipc::Response::new(tauri::ipc::InvokeBody::Raw(
            d.raw_bytes.clone(),
        ))),
        None => Err(format!(
            "HavokData '{}' not found in session '{}'",
            source_id, session_id
        )),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewHktCollisionSessionArgs {
    pub session_id: String,
    pub import_id: String,
    pub config: ImportConfig,
}

#[tauri::command]
pub fn scene_preview_hkt_collision_session(
    state: State<'_, SceneSessionState>,
    args: PreviewHktCollisionSessionArgs,
) -> Result<crate::havok_collision_encode::HktCollisionPreview, String> {
    state.with_session(&args.session_id, |s| {
        let import = s.find_import(&args.import_id)?;
        let options = hkt_collision_options_from_import(&args.config);
        crate::havok_collision_encode::preview_hkt_collision_from_import_bytes(
            &import.dae_bytes,
            &import.source_name,
            options,
        )
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewHktCollisionBytesArgs {
    pub dae_bytes: Vec<u8>,
    pub source_name: String,
    pub config: ImportConfig,
}

#[tauri::command]
pub fn scene_preview_hkt_collision_bytes(
    args: PreviewHktCollisionBytesArgs,
) -> Result<crate::havok_collision_encode::HktCollisionPreview, String> {
    let options = hkt_collision_options_from_import(&args.config);
    crate::havok_collision_encode::preview_hkt_collision_from_import_bytes(
        &args.dae_bytes,
        &args.source_name,
        options,
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetImportConfigOptions {
    pub session_id: String,
    pub import_id: String,
}

#[tauri::command]
pub fn scene_get_import_config(
    state: State<'_, SceneSessionState>,
    options: GetImportConfigOptions,
) -> Result<ImportConfig, String> {
    state.with_session(&options.session_id, |s| {
        let import = s.find_import(&options.import_id)?;
        Ok(import.config.clone())
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticMeshDirectConvertOptions {
    pub source_path: String,
    pub output_dir: String,
    pub config: ImportConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticMeshDirectConvertResult {
    pub source_path: String,
    pub output_dir: String,
    pub model_dir: String,
    pub base_filename: String,
    pub ssbh_generated: bool,
    pub hkt_generated: bool,
    pub files_written: Vec<String>,
    pub hkt_detail: Option<String>,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub async fn scene_convert_static_mesh_to_stage_files(
    options: StaticMeshDirectConvertOptions,
) -> Result<StaticMeshDirectConvertResult, String> {
    scene_convert_static_mesh_to_stage_files_impl(options, None).await
}

#[tauri::command]
pub async fn scene_convert_static_mesh_to_stage_files_streamed(
    options: StaticMeshDirectConvertOptions,
    on_progress: Channel<StaticMeshImportProgress>,
) -> Result<StaticMeshDirectConvertResult, String> {
    scene_convert_static_mesh_to_stage_files_impl(options, Some(on_progress)).await
}

async fn scene_convert_static_mesh_to_stage_files_impl(
    options: StaticMeshDirectConvertOptions,
    on_progress: Option<Channel<StaticMeshImportProgress>>,
) -> Result<StaticMeshDirectConvertResult, String> {
    let source_path = PathBuf::from(options.source_path.trim());
    if !source_path.is_file() {
        return Err(format!(
            "Static mesh file not found: {}",
            source_path.display()
        ));
    }
    send_static_mesh_status(
        on_progress.as_ref(),
        "read",
        "Checking selected static mesh file...",
    );
    let (source_ext, _) =
        send_static_mesh_source_progress(on_progress.as_ref(), &source_path, "read")?;
    let source_format = static_mesh_format_label(source_ext);

    let output_dir = PathBuf::from(options.output_dir.trim());
    if options.output_dir.trim().is_empty() {
        return Err("output_dir cannot be empty".to_string());
    }

    let ssbh_config = options.config.ssbh_config.clone().ok_or_else(|| {
        "Direct static mesh conversion requires SSBH conversion settings".to_string()
    })?;
    let base = ssbh_config.base_filename.trim().to_string();
    if base.is_empty() {
        return Err("base_filename cannot be empty".to_string());
    }

    if options.config.generate_hkt {
        send_static_mesh_status(
            on_progress.as_ref(),
            "collisionCheck",
            "Checking HKT collision mesh input...",
        );
        validate_static_mesh_hkt_collision_from_path(&source_path, &options.config)?;
    }

    send_static_mesh_progress(
        on_progress.as_ref(),
        StaticMeshImportProgress::ConvertStarted {
            format: source_format.clone(),
            source_name: static_mesh_source_name(&source_path),
            base_filename: base.clone(),
        },
    );

    let source_for_convert = source_path.clone();
    let output_for_write = output_dir.clone();
    let ssbh_config_for_convert = ssbh_config.clone();
    let progress_for_write = on_progress.clone();
    let write_result = tauri::async_runtime::spawn_blocking(move || {
        let artifacts = convert_import_path_to_ssbh_artifact_paths(
            &source_for_convert,
            &ssbh_config_for_convert,
        )?;
        let artifact_bytes = artifacts.payload_bytes();
        let artifact_count = artifacts.file_count();
        send_static_mesh_progress(
            progress_for_write.as_ref(),
            StaticMeshImportProgress::ConvertFinished {
                total_bytes: artifact_bytes,
                file_count: artifact_count,
            },
        );
        send_large_artifact_warning(progress_for_write.as_ref(), "artifacts", artifact_bytes);
        send_static_mesh_progress(
            progress_for_write.as_ref(),
            StaticMeshImportProgress::WriteStarted {
                output_dir: output_for_write.to_string_lossy().to_string(),
                base_filename: ssbh_config_for_convert.base_filename.clone(),
            },
        );
        let artifact_root = artifacts.root_dir.clone();
        let files_written_result = write_static_mesh_artifact_paths(
            &output_for_write,
            &ssbh_config_for_convert.base_filename,
            &artifacts,
            ssbh_config_for_convert.write_jnttbl,
        );
        let _ = std::fs::remove_dir_all(artifact_root);
        let files_written = files_written_result?;
        send_static_mesh_progress(
            progress_for_write.as_ref(),
            StaticMeshImportProgress::WriteFinished {
                file_count: files_written.len(),
            },
        );
        Ok::<_, String>((files_written, artifact_bytes, artifact_count))
    })
    .await
    .map_err(|e| {
        send_static_mesh_progress(
            on_progress.as_ref(),
            StaticMeshImportProgress::Error {
                message: format!("Task join error: {e}"),
            },
        );
        format!("Task join error: {e}")
    })?;
    let (mut files_written, _, _) = write_result.map_err(|e| {
        send_static_mesh_progress(
            on_progress.as_ref(),
            StaticMeshImportProgress::Error { message: e.clone() },
        );
        e
    })?;

    let mut hkt_generated = false;
    let mut hkt_detail = None;
    let mut warnings = Vec::new();

    if options.config.generate_hkt {
        send_static_mesh_progress(
            on_progress.as_ref(),
            StaticMeshImportProgress::HktStarted {
                source_name: static_mesh_source_name(&source_path),
            },
        );
        let hkt_options = hkt_collision_options_from_import(&options.config);
        if let Some(havok_config) = havok_cli::HavokCliConfig::detect() {
            let hkt_source_path = source_path.clone();
            match tauri::async_runtime::spawn_blocking(move || {
                havok_cli::generate_hkt_from_import_path(
                    &hkt_source_path,
                    &havok_config,
                    hkt_options,
                )
            })
            .await
            {
                Ok(Ok(result)) => {
                    let relative = format!("{base}/map_hit.hkt");
                    let target = output_dir.join(&relative);
                    if let Some(parent) = target.parent() {
                        std::fs::create_dir_all(parent)
                            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
                    }
                    std::fs::write(&target, &result.bytes)
                        .map_err(|e| format!("Failed to write {}: {e}", target.display()))?;
                    files_written.push(relative);
                    hkt_detail = Some(hkt_success_detail(
                        &base,
                        result.bytes.len(),
                        result.triangle_count,
                    ));
                    send_static_mesh_progress(
                        on_progress.as_ref(),
                        StaticMeshImportProgress::HktFinished {
                            bytes: result.bytes.len() as u64,
                            triangle_count: result.triangle_count,
                        },
                    );
                    hkt_generated = true;
                }
                Ok(Err(e)) => warnings.push(format!("HKT generation failed: {e}")),
                Err(e) => warnings.push(format!("HKT generation task failed: {e}")),
            }
        } else {
            warnings.push("HKT generation skipped: Havok Content Tools not installed".to_string());
        }
    }

    let model_dir = output_dir.join(&base).to_string_lossy().to_string();
    send_static_mesh_progress(on_progress.as_ref(), StaticMeshImportProgress::Complete);
    Ok(StaticMeshDirectConvertResult {
        source_path: source_path.to_string_lossy().to_string(),
        output_dir: output_dir.to_string_lossy().to_string(),
        model_dir,
        base_filename: base,
        ssbh_generated: true,
        hkt_generated,
        files_written,
        hkt_detail,
        warnings,
    })
}

#[tauri::command]
pub async fn scene_save_as_folder(
    state: State<'_, SceneSessionState>,
    session_id: String,
    output_path: String,
) -> Result<SaveResult, String> {
    eprintln!("[scene_save_as_folder] Starting — output: {output_path}");
    let t = Instant::now();
    let result: Result<SaveResult, String> = async {
        let artifacts = state.with_session(&session_id, |s| Ok(s.collect_save_artifacts()))?;

        let output_dir = output_path.clone();
        let count = tauri::async_runtime::spawn_blocking(move || -> Result<u32, String> {
            let base = Path::new(&output_dir);
            std::fs::create_dir_all(base)
                .map_err(|e| format!("Failed to create output directory: {e}"))?;

            let mut written = 0u32;
            for artifact in &artifacts {
                let target = base.join(&artifact.relative_path);
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create dir {}: {e}", parent.display()))?;
                }
                std::fs::write(&target, &artifact.data)
                    .map_err(|e| format!("Failed to write {}: {e}", target.display()))?;
                written += 1;
            }
            Ok(written)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))??;

        state.with_session_mut(&session_id, |s| {
            s.mark_clean();
            Ok(())
        })?;

        Ok(SaveResult {
            success: true,
            files_written: count,
            warnings: Vec::new(),
        })
    }
    .await;
    match &result {
        Ok(r) => eprintln!(
            "[scene_save_as_folder] Done in {}ms — {} files written",
            t.elapsed().as_millis(),
            r.files_written
        ),
        Err(e) => eprintln!(
            "[scene_save_as_folder] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn scene_repack_in_place(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<SaveResult, String> {
    eprintln!("[scene_repack_in_place] Starting — session: {session_id}");
    let t = Instant::now();
    let result: Result<SaveResult, String> = async {
        let (source, artifacts) = state.with_session(&session_id, |s| {
            let source_path = match &s.source {
                SceneSource::Folder { path } => path.clone(),
                SceneSource::Fhm2d { path } => {
                    let p = Path::new(path);
                    p.parent()
                        .map(|pp| pp.to_string_lossy().to_string())
                        .unwrap_or_else(|| path.clone())
                }
                SceneSource::New => {
                    return Err("Cannot repack a new session without a source path".into())
                }
            };
            Ok((source_path, s.collect_save_artifacts()))
        })?;

        // Pre-flight gate: numatb texture parameters with empty paths must be fixed
        // before repacking (matches the Scene Editor save/repack validation gate).
        let validation =
            crate::format::fhm2d_stage_validate::exvs_stage_validate_numatb_empty_params(&source);
        if !validation.valid {
            let summary = validation
                .errors
                .iter()
                .take(5)
                .map(|e| e.message.clone())
                .collect::<Vec<_>>()
                .join("; ");
            return Err(format!(
                "Repack blocked: {} numatb texture parameter(s) have empty paths. {}",
                validation.errors.len(),
                summary
            ));
        }

        let count = tauri::async_runtime::spawn_blocking(move || -> Result<u32, String> {
            let base = Path::new(&source);
            std::fs::create_dir_all(base)
                .map_err(|e| format!("Failed to create output directory: {e}"))?;

            let mut written = 0u32;
            for artifact in &artifacts {
                let target = base.join(&artifact.relative_path);
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create dir {}: {e}", parent.display()))?;
                }
                std::fs::write(&target, &artifact.data)
                    .map_err(|e| format!("Failed to write {}: {e}", target.display()))?;
                written += 1;
            }
            Ok(written)
        })
        .await
        .map_err(|e| format!("Task join error: {e}"))??;

        state.with_session_mut(&session_id, |s| {
            s.mark_clean();
            Ok(())
        })?;

        Ok(SaveResult {
            success: true,
            files_written: count,
            warnings: Vec::new(),
        })
    }
    .await;
    match &result {
        Ok(r) => eprintln!(
            "[scene_repack_in_place] Done in {}ms — {} files written",
            t.elapsed().as_millis(),
            r.files_written
        ),
        Err(e) => eprintln!(
            "[scene_repack_in_place] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub fn scene_list_imports(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<Vec<ImportResult>, String> {
    state.with_session(&session_id, |s| {
        Ok(s.pending_imports
            .iter()
            .map(|i| ImportResult {
                import_id: i.id.clone(),
                name: i.name.clone(),
                ssbh_generated: SceneMemorySession::import_has_ssbh_artifacts(i),
                hkt_generated: i.hkt_bytes.is_some(),
                hkt_detail: None,
                warnings: Vec::new(),
            })
            .collect())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene_memory_session::{
        HktSimplifyConfig, ImportConfig, SceneSessionState, SceneSource, StageBundleMemory,
    };
    use std::collections::HashMap;

    const STAGE_ROOT: &str = r"E:\XB\解包\com\test\0x4D1F5138\0\0";
    const DAE_DIR: &str = r"D:\output\exvs2\zabanya";
    const MINECRAFT_BLENDER_FBX: &str = r"D:\output\minecraft\test.fbx";
    const MINECRAFT_LARGE_BLENDER_FBX: &str = r"D:\output\minecraft\test2.fbx";

    fn skip_if_missing(path: &str) -> bool {
        if !std::path::Path::new(path).exists() {
            eprintln!("[SKIP] Test data not found: {path}");
            return true;
        }
        false
    }

    fn relative_file_list(root: &std::path::Path) -> Vec<String> {
        fn visit(root: &std::path::Path, dir: &std::path::Path, out: &mut Vec<String>) {
            let Ok(entries) = std::fs::read_dir(dir) else {
                return;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    visit(root, &path, out);
                } else if path.is_file() {
                    let rel = path
                        .strip_prefix(root)
                        .unwrap_or(path.as_path())
                        .to_string_lossy()
                        .replace('\\', "/");
                    out.push(rel);
                }
            }
        }

        let mut out = Vec::new();
        visit(root, root, &mut out);
        out.sort();
        out
    }

    #[test]
    fn hkt_simplify_to_options_converts_planarity_angle_deg() {
        use crate::collision_mesh::{cos_planarity_from_angle_deg, CollisionSimplifyOptions};

        let cfg = HktSimplifyConfig {
            enabled: true,
            planarity_angle_deg: 15.0,
            min_triangle_area: 1e-6,
            weld_epsilon: 1e-3,
            target_triangle_ratio: None,
            max_target_triangles: None,
            strategy: crate::scene_memory_session::CollisionStrategy::ShapePreserving,
            hull_target_faces: None,
        };
        let opts = hkt_simplify_to_options(&cfg);
        assert_eq!(
            opts.cos_planarity_threshold,
            cos_planarity_from_angle_deg(15.0),
        );
        assert_eq!(opts, CollisionSimplifyOptions::default());
    }

    #[test]
    fn hkt_simplify_to_options_maps_convex_hull_strategy() {
        let cfg = HktSimplifyConfig {
            strategy: crate::scene_memory_session::CollisionStrategy::ConvexHull,
            hull_target_faces: Some(48),
            ..HktSimplifyConfig::default()
        };
        let opts = hkt_simplify_to_options(&cfg);
        assert_eq!(
            opts.mode,
            crate::collision_mesh::CollisionSimplifyMode::ConvexHull
        );
        assert_eq!(opts.hull_target_faces, Some(48));
    }

    #[test]
    fn hkt_simplify_to_options_defaults_to_shape_preserving() {
        let opts = hkt_simplify_to_options(&HktSimplifyConfig::default());
        assert_eq!(
            opts.mode,
            crate::collision_mesh::CollisionSimplifyMode::ShapePreserving
        );
        assert_eq!(opts.hull_target_faces, None);
    }

    #[test]
    fn hkt_collision_options_follow_import_ssbh_config() {
        use crate::collision_mesh::CollisionMeshOptions;
        use crate::scene_memory_session::SsbhConvertConfig;
        use crate::ssbh_dae::UpAxisConversion;

        let config = ImportConfig {
            load_to_scene: false,
            convert_to_ssbh: true,
            generate_hkt: true,
            ssbh_config: Some(SsbhConvertConfig {
                base_filename: "bodyout".into(),
                scale_factor: 0.01,
                up_axis: "z_up".into(),
                flip_uv: false,
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: true,
                write_numatb: true,
                write_jnttbl: true,
                write_maya_profile: true,
                material_template: None,
                maya_file: None,
                nust_file: None,
                numdlb_entries: Vec::new(),
            }),
            hkt_simplify: HktSimplifyConfig::default(),
        };
        let opts = hkt_collision_options_from_import(&config);
        assert_eq!(opts.scale_factor, 0.01);
        assert_eq!(opts.up_axis, UpAxisConversion::ZUp);

        let default_cfg = ImportConfig {
            load_to_scene: false,
            convert_to_ssbh: false,
            generate_hkt: true,
            ssbh_config: None,
            hkt_simplify: HktSimplifyConfig::default(),
        };
        let defaults = hkt_collision_options_from_import(&default_cfg);
        assert_eq!(defaults, CollisionMeshOptions::default());
    }

    #[test]
    fn session_numatb_artifacts_respect_write_flags() {
        use crate::ssbh_dae_cmd::build_session_numatb_artifacts;

        let nust = default_session_nust_matl_json();
        let maya = default_session_maya_matl_json();

        let (nust_bytes, maya_none) =
            build_session_numatb_artifacts("hero", true, false, Some(&nust), Some(&maya))
                .expect("nust-only generation should succeed");
        assert!(!nust_bytes.is_empty());
        assert!(maya_none.is_none());

        let (both_nust, both_maya) =
            build_session_numatb_artifacts("hero", true, true, Some(&nust), Some(&maya))
                .expect("dual-profile generation should succeed");
        assert!(!both_nust.is_empty());
        assert!(both_maya.as_ref().is_some_and(|bytes| !bytes.is_empty()));
    }

    #[test]
    fn hkt_success_detail_describes_mesh_collision() {
        let detail = hkt_success_detail("backpack_up", 4096, 1200);
        assert!(detail.contains("backpack_up"));
        assert!(detail.contains("4096"));
        assert!(detail.contains("1200"));
        assert!(detail.contains("mesh collision"));
    }

    #[test]
    fn scene_import_texture_ref_resolution_checks_source_and_stage_roots() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let source_dir = temp_dir.path().join("source");
        let stage_dir = temp_dir.path().join("stage");
        let stage_texture_dir = stage_dir.join("textures");
        std::fs::create_dir_all(&source_dir).expect("source dir");
        std::fs::create_dir_all(&stage_texture_dir).expect("stage texture dir");

        let dae_path = source_dir.join("preview.dae");
        std::fs::write(&dae_path, b"dae").expect("dae");

        let absolute_texture = temp_dir.path().join("absolute_tex.nutexb");
        let source_texture = source_dir.join("source_tex.nutexb");
        let stage_texture = stage_texture_dir.join("stage_tex.nutexb");
        std::fs::write(&absolute_texture, b"absolute").expect("absolute texture");
        std::fs::write(&source_texture, b"source").expect("source texture");
        std::fs::write(&stage_texture, b"stage").expect("stage texture");

        let absolute = resolve_scene_import_texture_ref(
            Some(stage_dir.to_string_lossy().as_ref()),
            Some(dae_path.to_string_lossy().as_ref()),
            absolute_texture
                .with_extension("")
                .to_string_lossy()
                .as_ref(),
        )
        .expect("absolute texture should resolve");
        assert_eq!(absolute, frontend_path(&absolute_texture));

        let source_relative = resolve_scene_import_texture_ref(
            Some(stage_dir.to_string_lossy().as_ref()),
            Some(dae_path.to_string_lossy().as_ref()),
            "nested/source_tex",
        )
        .expect("source basename should resolve");
        assert_eq!(source_relative, frontend_path(&source_texture));

        let stage_relative = resolve_scene_import_texture_ref(
            Some(stage_dir.to_string_lossy().as_ref()),
            Some(dae_path.to_string_lossy().as_ref()),
            "stage_tex",
        )
        .expect("stage texture basename should resolve");
        assert_eq!(stage_relative, frontend_path(&stage_texture));

        assert!(
            resolve_scene_import_texture_ref(
                Some(stage_dir.to_string_lossy().as_ref()),
                Some(dae_path.to_string_lossy().as_ref()),
                "missing_texture",
            )
            .is_none(),
            "missing texture refs should stay unresolved"
        );
    }

    #[test]
    fn load_real_stage_bundle_into_session() {
        if skip_if_missing(STAGE_ROOT) {
            return;
        }

        let bundle =
            fhm2d_stage::load_stage_bundle_impl(STAGE_ROOT).expect("load_stage_bundle_impl failed");

        assert!(
            !bundle.placement_entries.is_empty(),
            "stage201 should have placement entries"
        );
        assert!(
            !bundle.graphic_params.is_empty(),
            "stage201 should have graphic params"
        );
        println!(
            "[OK] Stage loaded: {} placement entries, {} header cols, {} graphic params, {} warnings",
            bundle.placement_entries.len(),
            bundle.placement_header.len(),
            bundle.graphic_params.len(),
            bundle.warnings.len(),
        );

        let state = SceneSessionState::default();
        let sid = state.create_session(SceneSource::Folder {
            path: STAGE_ROOT.to_string(),
        });
        state
            .with_session_mut(&sid, |s| {
                s.placement_header = bundle.placement_header;
                s.placement_entries = bundle
                    .placement_entries
                    .into_iter()
                    .map(|e| PlacementEntry {
                        vdk_type: e.vdk_type,
                        object_number: e.object_number,
                        pos_x: e.pos_x,
                        pos_y: e.pos_y,
                        pos_z: e.pos_z,
                        rot_x: e.rot_x,
                        rot_y: e.rot_y,
                        rot_z: e.rot_z,
                        scale_x: e.scale_x,
                        scale_y: e.scale_y,
                        scale_z: e.scale_z,
                        raw_fields: e.raw_fields,
                    })
                    .collect();
                s.graphic_params = bundle
                    .graphic_params
                    .into_iter()
                    .map(|g| GraphicParam {
                        key: g.key,
                        value: g.value,
                    })
                    .collect();
                Ok(())
            })
            .unwrap();

        let is_dirty = state.with_session(&sid, |s| Ok(s.dirty)).unwrap();
        assert!(!is_dirty, "freshly loaded session should not be dirty");

        let placement_count = state
            .with_session(&sid, |s| Ok(s.placement_entries.len()))
            .unwrap();
        println!("[OK] Session has {placement_count} placement entries");
        assert!(placement_count > 0);
    }

    #[test]
    fn import_real_dae_and_convert_to_ssbh() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let dae_bytes = std::fs::read(&dae_path).expect("Failed to read backpack_up.dae");
        println!("[OK] Read DAE: {} bytes", dae_bytes.len());

        let state = SceneSessionState::default();
        let sid = state.create_session(SceneSource::New);
        let import_id = state
            .with_session_mut(&sid, |s| {
                Ok(s.add_import("backpack_up".into(), dae_bytes.clone()))
            })
            .unwrap();

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            flip_uv: false,
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: false,
            material_template: None,
            maya_file: None,
            nust_file: None,
            numdlb_entries: Vec::new(),
        };

        state
            .with_session_mut(&sid, |s| {
                let import = s.find_import_mut(&import_id)?;
                import.config = ImportConfig {
                    load_to_scene: false,
                    convert_to_ssbh: true,
                    generate_hkt: false,
                    ssbh_config: Some(ssbh_config.clone()),
                    hkt_simplify: HktSimplifyConfig::default(),
                };
                Ok(())
            })
            .unwrap();

        let artifacts = convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config)
            .expect("SSBH conversion failed");

        println!(
            "[OK] SSBH artifacts: numdlb={} bytes, numshb={} bytes, nusktb={:?} bytes, numatb={} bytes",
            artifacts.numdlb.len(),
            artifacts.numshb.len(),
            artifacts.nusktb.as_ref().map(|v| v.len()),
            artifacts.numatb.len(),
        );

        assert!(
            !artifacts.numdlb.is_empty(),
            "numdlb should not be empty for a valid DAE"
        );
        assert!(
            !artifacts.numshb.is_empty(),
            "numshb should not be empty for a valid DAE"
        );

        state
            .with_session_mut(&sid, |s| s.store_ssbh_artifacts(&import_id, artifacts))
            .unwrap();

        let has_ssbh = state
            .with_session(&sid, |s| {
                let import = s.find_import(&import_id)?;
                Ok(import.ssbh_artifacts.is_some())
            })
            .unwrap();
        assert!(
            has_ssbh,
            "import should have SSBH artifacts after conversion"
        );
        println!("[OK] SSBH artifacts stored in session");
    }

    #[test]
    fn convert_fbx_path_to_ssbh_artifact_paths_keeps_mesh_on_disk() {
        if skip_if_missing(MINECRAFT_BLENDER_FBX) {
            return;
        }

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "minecraft_test".into(),
            scale_factor: 1.0,
            up_axis: "none".into(),
            flip_uv: false,
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: false,
            write_maya_profile: false,
            material_template: None,
            maya_file: None,
            nust_file: None,
            numdlb_entries: Vec::new(),
        };

        let artifacts = convert_import_path_to_ssbh_artifact_paths(
            Path::new(MINECRAFT_BLENDER_FBX),
            &ssbh_config,
        )
        .expect("FBX path conversion should produce file-backed artifacts");
        assert!(artifacts.numshb.as_ref().is_some_and(|path| path.is_file()));
        assert!(artifacts.payload_bytes() > 1_000_000);
        let root_dir = artifacts.root_dir.clone();
        std::fs::remove_dir_all(root_dir).ok();
    }

    #[test]
    #[ignore = "large local FBX regression sample"]
    fn convert_large_fbx_path_to_ssbh_artifact_paths_keeps_mesh_on_disk() {
        if skip_if_missing(MINECRAFT_LARGE_BLENDER_FBX) {
            return;
        }

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "minecraft_large_test".into(),
            scale_factor: 1.0,
            up_axis: "none".into(),
            flip_uv: false,
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: false,
            write_maya_profile: false,
            material_template: None,
            maya_file: None,
            nust_file: None,
            numdlb_entries: Vec::new(),
        };

        let artifacts = convert_import_path_to_ssbh_artifact_paths(
            Path::new(MINECRAFT_LARGE_BLENDER_FBX),
            &ssbh_config,
        )
        .expect("large FBX path conversion should produce file-backed artifacts");
        assert!(artifacts.numshb.as_ref().is_some_and(|path| path.is_file()));
        assert!(artifacts.payload_bytes() > 128 * 1024 * 1024);
        let root_dir = artifacts.root_dir.clone();
        std::fs::remove_dir_all(root_dir).ok();
    }

    #[test]
    fn real_dae_conversion_builds_memory_preview_bundle() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let dae_bytes = std::fs::read(&dae_path).expect("Failed to read backpack_up.dae");
        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            flip_uv: false,
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: true,
            material_template: None,
            maya_file: None,
            nust_file: None,
            numdlb_entries: Vec::new(),
        };
        let config = ImportConfig {
            load_to_scene: true,
            convert_to_ssbh: true,
            generate_hkt: false,
            ssbh_config: Some(ssbh_config.clone()),
            hkt_simplify: HktSimplifyConfig::default(),
        };

        let artifacts = convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config)
            .expect("SSBH conversion failed");
        let bundle = build_scene_import_preview_bundle_from_artifacts(
            "session-preview",
            "import-preview",
            &config,
            &artifacts,
            None,
            Some(&dae_path),
        )
        .expect("memory preview bundle should build from converted artifacts");

        assert_eq!(bundle.source_kind, "memory");
        assert_eq!(bundle.source_session_id.as_deref(), Some("session-preview"));
        assert!(bundle.root_folder.starts_with("memory://session-preview/"));
        assert!(bundle
            .modl_path
            .ends_with("/backpack_up/0/backpack_up.numdlb"));
        assert!(bundle
            .mesh_path
            .ends_with("/backpack_up/0/backpack_up.numshb"));
        assert!(
            bundle
                .virtual_modl_path
                .as_deref()
                .is_some_and(|path| path.starts_with("memory://session-preview/")),
            "memory bundles should expose a virtual model path for detail view lookup"
        );
        assert!(
            bundle.modl.is_object(),
            "modl JSON should populate Properties"
        );
        assert!(
            bundle.mesh.is_object(),
            "mesh JSON should populate scene rendering"
        );
        assert!(
            bundle.matl.as_ref().is_some_and(|value| value.is_object()),
            "matl JSON should populate material Properties before save"
        );
        assert!(
            bundle
                .matl_paths
                .iter()
                .all(|path| path.starts_with("memory://session-preview/")),
            "material paths should remain memory virtual paths before save"
        );
        let profiles = bundle
            .matl_profiles
            .as_ref()
            .expect("memory import bundles should preserve per-profile material JSON");
        assert!(
            profiles
                .nust
                .as_ref()
                .is_some_and(|value| value.is_object()),
            "nust material profile should be available independently"
        );
        assert!(
            profiles
                .maya
                .as_ref()
                .is_some_and(|value| value.is_object()),
            "maya material profile should be available independently"
        );
    }

    #[test]
    fn real_dae_memory_preview_bundle_resolves_textures_without_pre_save_disk_writes() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let temp_dir = tempfile::tempdir().expect("temp dir");
        let stage_root = temp_dir.path().join("stage");
        let source_dir = temp_dir.path().join("source");
        let texture_dir = stage_root.join("textures");
        std::fs::create_dir_all(&texture_dir).expect("texture dir");
        std::fs::create_dir_all(&source_dir).expect("source dir");
        let source_dae = source_dir.join("backpack_up.dae");
        std::fs::copy(&dae_path, &source_dae).expect("copy dae");
        let texture_path = texture_dir.join("stage_wall_alb.nutexb");
        std::fs::write(&texture_path, b"placeholder nutexb bytes").expect("write texture");

        let mut nust = default_session_nust_matl_json();
        let mut maya = default_session_maya_matl_json();
        for profile in [&mut nust, &mut maya] {
            profile["entries"][0]["textures"] = serde_json::json!([
                { "param_id": "Texture0", "data": "stage_wall_alb" }
            ]);
        }

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            flip_uv: false,
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: true,
            material_template: None,
            maya_file: Some(maya),
            nust_file: Some(nust),
            numdlb_entries: Vec::new(),
        };
        let config = ImportConfig {
            load_to_scene: true,
            convert_to_ssbh: true,
            generate_hkt: false,
            ssbh_config: Some(ssbh_config.clone()),
            hkt_simplify: HktSimplifyConfig::default(),
        };
        let dae_bytes = std::fs::read(&dae_path).expect("read dae");
        let artifacts = convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config)
            .expect("SSBH conversion failed");

        let stage_before = relative_file_list(&stage_root);
        let source_before = relative_file_list(&source_dir);
        let bundle = build_scene_import_preview_bundle_from_artifacts(
            "session-preview",
            "import-preview",
            &config,
            &artifacts,
            Some(stage_root.to_string_lossy().as_ref()),
            Some(source_dae.to_string_lossy().as_ref()),
        )
        .expect("memory preview bundle should build");
        let stage_after = relative_file_list(&stage_root);
        let source_after = relative_file_list(&source_dir);

        assert_eq!(
            stage_after, stage_before,
            "building an unsaved memory preview bundle must not materialize SSBH files on disk"
        );
        assert_eq!(
            source_after, source_before,
            "building an unsaved memory preview bundle must not write next to the source DAE"
        );
        assert_eq!(
            bundle.resolved_nutexb_paths,
            vec![frontend_path(&texture_path)]
        );
        assert!(
            bundle
                .texture_resolve
                .iter()
                .all(|row| row.nutexb_path.as_deref()
                    == Some(frontend_path(&texture_path).as_str())),
            "texture references should resolve to the existing disk nutexb without writing artifacts"
        );
    }

    #[test]
    fn convert_dae_bytes_applies_session_numdlb_entries() {
        use crate::ssbh_dae::{analyze_dae_path, ModlEntryConfig};
        use ssbh_data::modl_data::ModlData;

        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let dae_bytes = std::fs::read(&dae_path).expect("Failed to read backpack_up.dae");
        let analysis =
            analyze_dae_path(std::path::Path::new(&dae_path)).expect("DAE analysis should succeed");
        assert!(
            !analysis.geometry_names.is_empty(),
            "backpack_up.dae should expose at least one geometry"
        );

        let numdlb_entries: Vec<ModlEntryConfig> = analysis
            .geometry_names
            .iter()
            .map(|name| ModlEntryConfig {
                mesh_object_name: name.clone(),
                mesh_object_subindex: 0,
                material_label: "pbr1Mtl".into(),
            })
            .collect();

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            flip_uv: false,
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: false,
            write_jnttbl: false,
            write_maya_profile: false,
            material_template: None,
            maya_file: None,
            nust_file: None,
            numdlb_entries,
        };

        let artifacts = convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config)
            .expect("SSBH conversion with numdlb entries should succeed");
        assert!(
            !artifacts.numdlb.is_empty(),
            "numdlb should be generated when mappings are provided"
        );

        let temp_dir = tempfile::tempdir().expect("temp dir");
        let modl_path = temp_dir.path().join("backpack_up.numdlb");
        std::fs::write(&modl_path, &artifacts.numdlb).expect("write numdlb");
        let modl = ModlData::from_file(&modl_path).expect("read numdlb");
        assert!(
            !modl.entries.is_empty(),
            "numdlb should contain mesh entries"
        );
        assert!(
            modl.entries
                .iter()
                .all(|entry| entry.material_label == "pbr1Mtl"),
            "expected custom material labels, got: {:?}",
            modl.entries
                .iter()
                .map(|entry| entry.material_label.as_str())
                .collect::<Vec<_>>()
        );
        assert!(
            modl.entries
                .iter()
                .all(|entry| entry.material_label != "DefaultMaterial"),
            "session import must not fall back to DefaultMaterial when mappings are provided"
        );
    }

    #[test]
    fn full_pipeline_import_convert_save() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let dae_bytes = std::fs::read(&dae_path).expect("Failed to read DAE");

        let state = SceneSessionState::default();
        let sid = state.create_session(SceneSource::New);

        let import_id = state
            .with_session_mut(&sid, |s| {
                Ok(s.add_import("backpack_up".into(), dae_bytes.clone()))
            })
            .unwrap();

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            flip_uv: false,
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: false,
            material_template: None,
            maya_file: None,
            nust_file: None,
            numdlb_entries: Vec::new(),
        };

        state
            .with_session_mut(&sid, |s| {
                let import = s.find_import_mut(&import_id)?;
                import.config = ImportConfig {
                    load_to_scene: false,
                    convert_to_ssbh: true,
                    generate_hkt: false,
                    ssbh_config: Some(ssbh_config.clone()),
                    hkt_simplify: HktSimplifyConfig::default(),
                };
                Ok(())
            })
            .unwrap();

        let artifacts = convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config)
            .expect("SSBH conversion failed");
        state
            .with_session_mut(&sid, |s| s.store_ssbh_artifacts(&import_id, artifacts))
            .unwrap();

        let save_artifacts = state
            .with_session(&sid, |s| Ok(s.collect_save_artifacts()))
            .unwrap();

        assert!(
            !save_artifacts.is_empty(),
            "should have artifacts to save after SSBH conversion"
        );

        println!("[OK] Save artifacts ({} files):", save_artifacts.len());
        for (i, a) in save_artifacts.iter().enumerate() {
            println!("  [{i}] {} ({} bytes)", a.relative_path, a.data.len());
        }

        assert!(
            save_artifacts
                .iter()
                .any(|a| a.relative_path.contains("numdlb")),
            "should contain numdlb artifact"
        );
        assert!(
            save_artifacts
                .iter()
                .any(|a| a.relative_path.contains("numshb")),
            "should contain numshb artifact"
        );

        let temp_output = tempfile::tempdir().expect("Failed to create temp dir");
        let output_path = temp_output.path();

        for artifact in &save_artifacts {
            let target = output_path.join(&artifact.relative_path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(&target, &artifact.data).unwrap();
        }

        for artifact in &save_artifacts {
            let target = output_path.join(&artifact.relative_path);
            assert!(
                target.exists(),
                "written file should exist: {}",
                target.display()
            );
            let read_back = std::fs::read(&target).unwrap();
            assert_eq!(
                read_back.len(),
                artifact.data.len(),
                "file size mismatch for {}",
                artifact.relative_path
            );
        }

        state
            .with_session_mut(&sid, |s| {
                s.mark_clean();
                Ok(())
            })
            .unwrap();
        let is_dirty = state.with_session(&sid, |s| Ok(s.dirty)).unwrap();
        assert!(!is_dirty, "session should be clean after save");
        println!("[OK] Full pipeline passed: import -> convert -> save -> verify");
    }

    #[test]
    fn stage_plus_import_combined_save() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(STAGE_ROOT) || skip_if_missing(&dae_path) {
            return;
        }

        let state = SceneSessionState::default();
        let sid = state.create_session(SceneSource::Folder {
            path: STAGE_ROOT.to_string(),
        });

        let csv_bytes = std::fs::read(format!(r"{STAGE_ROOT}\info\placement.csv"))
            .expect("Failed to read placement.csv");
        let gp_bytes = std::fs::read(format!(r"{STAGE_ROOT}\info\graphic_param.csv"))
            .expect("Failed to read graphic_param.csv");

        state
            .with_session_mut(&sid, |s| {
                let mut root_files = HashMap::new();
                root_files.insert("info/placement.csv".to_string(), csv_bytes);
                root_files.insert("info/graphic_param.csv".to_string(), gp_bytes);
                s.base_bundle = Some(StageBundleMemory {
                    root_files,
                    sub_model_files: HashMap::new(),
                });
                Ok(())
            })
            .unwrap();

        let dae_bytes = std::fs::read(&dae_path).expect("Failed to read DAE");
        let import_id = state
            .with_session_mut(&sid, |s| {
                Ok(s.add_import("backpack_up".into(), dae_bytes.clone()))
            })
            .unwrap();

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            flip_uv: false,
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: false,
            material_template: None,
            maya_file: None,
            nust_file: None,
            numdlb_entries: Vec::new(),
        };

        let artifacts = convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config)
            .expect("SSBH conversion failed");
        state
            .with_session_mut(&sid, |s| {
                let import = s.find_import_mut(&import_id)?;
                import.config = ImportConfig {
                    load_to_scene: false,
                    convert_to_ssbh: true,
                    generate_hkt: false,
                    ssbh_config: Some(ssbh_config),
                    hkt_simplify: HktSimplifyConfig::default(),
                };
                s.store_ssbh_artifacts(&import_id, artifacts)?;
                Ok(())
            })
            .unwrap();

        let save_artifacts = state
            .with_session(&sid, |s| Ok(s.collect_save_artifacts()))
            .unwrap();

        let has_csv = save_artifacts
            .iter()
            .any(|a| a.relative_path.contains("placement.csv"));
        let has_ssbh = save_artifacts
            .iter()
            .any(|a| a.relative_path.contains("numdlb"));

        println!(
            "[OK] Combined artifacts: {} files (has_csv={has_csv}, has_ssbh={has_ssbh})",
            save_artifacts.len()
        );
        for a in &save_artifacts {
            println!("  {} ({} bytes)", a.relative_path, a.data.len());
        }

        assert!(has_csv, "combined save should include stage CSV files");
        assert!(
            has_ssbh,
            "combined save should include new import SSBH files"
        );
    }

    #[test]
    fn multi_dae_import_pipeline() {
        let dae_files = ["backpack_up.dae", "backpack_bottom.dae", "body.dae"];
        let mut all_exist = true;
        for f in &dae_files {
            let path = format!(r"{DAE_DIR}\{f}");
            if !std::path::Path::new(&path).exists() {
                eprintln!("[SKIP] Missing: {path}");
                all_exist = false;
            }
        }
        if !all_exist {
            return;
        }

        let state = SceneSessionState::default();
        let sid = state.create_session(SceneSource::New);

        let mut import_ids = Vec::new();
        for f in &dae_files {
            let path = format!(r"{DAE_DIR}\{f}");
            let bytes = std::fs::read(&path).expect("read DAE");
            let name = f.replace(".dae", "");
            let id = state
                .with_session_mut(&sid, |s| Ok(s.add_import(name, bytes)))
                .unwrap();
            import_ids.push(id);
        }

        let count = state
            .with_session(&sid, |s| Ok(s.pending_imports.len()))
            .unwrap();
        assert_eq!(count, 3, "should have 3 pending imports");

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "placeholder".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            flip_uv: false,
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: false,
            material_template: None,
            maya_file: None,
            nust_file: None,
            numdlb_entries: Vec::new(),
        };

        let mut convert_ok = 0;
        let mut convert_fail = 0;

        for (i, import_id) in import_ids.iter().enumerate() {
            let (dae_bytes, name) = state
                .with_session(&sid, |s| {
                    let import = s.find_import(import_id)?;
                    Ok((import.dae_bytes.clone(), import.name.clone()))
                })
                .unwrap();

            let mut cfg = ssbh_config.clone();
            cfg.base_filename = name.clone();

            match convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &cfg) {
                Ok(artifacts) => {
                    println!(
                        "[OK] [{i}] {name}: numdlb={} numshb={} bytes",
                        artifacts.numdlb.len(),
                        artifacts.numshb.len()
                    );
                    state
                        .with_session_mut(&sid, |s| s.store_ssbh_artifacts(import_id, artifacts))
                        .unwrap();
                    convert_ok += 1;
                }
                Err(e) => {
                    eprintln!("[WARN] [{i}] {name} conversion failed: {e}");
                    convert_fail += 1;
                }
            }
        }

        println!(
            "[OK] Multi-DAE: {convert_ok} converted, {convert_fail} failed out of {}",
            dae_files.len()
        );
        assert!(
            convert_ok > 0,
            "at least one DAE should convert successfully"
        );

        let save_artifacts = state
            .with_session(&sid, |s| Ok(s.collect_save_artifacts()))
            .unwrap();
        println!("[OK] Total save artifacts: {}", save_artifacts.len());
        for a in &save_artifacts {
            println!("  {} ({} bytes)", a.relative_path, a.data.len());
        }
        assert!(!save_artifacts.is_empty());
    }

    #[test]
    fn session_isolation_with_real_data() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let dae_bytes = std::fs::read(&dae_path).unwrap();
        let state = SceneSessionState::default();

        let sid1 = state.create_session(SceneSource::New);
        let sid2 = state.create_session(SceneSource::New);

        state
            .with_session_mut(&sid1, |s| {
                s.add_import("model_a".into(), dae_bytes.clone());
                s.add_import("model_b".into(), dae_bytes.clone());
                Ok(())
            })
            .unwrap();

        state
            .with_session_mut(&sid2, |s| {
                s.add_import("model_c".into(), dae_bytes.clone());
                Ok(())
            })
            .unwrap();

        let count1 = state
            .with_session(&sid1, |s| Ok(s.pending_imports.len()))
            .unwrap();
        let count2 = state
            .with_session(&sid2, |s| Ok(s.pending_imports.len()))
            .unwrap();

        assert_eq!(count1, 2, "session1 should have 2 imports");
        assert_eq!(count2, 1, "session2 should have 1 import");

        state.destroy_session(&sid1).unwrap();
        assert!(state.with_session(&sid1, |_| Ok(())).is_err());

        let count2_after = state
            .with_session(&sid2, |s| Ok(s.pending_imports.len()))
            .unwrap();
        assert_eq!(
            count2_after, 1,
            "session2 should be unaffected by session1 destroy"
        );
        println!("[OK] Session isolation verified with real DAE data");
    }

    #[test]
    fn analyze_real_dae_returns_valid_report() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let report = crate::ssbh_dae::analyze_dae_path(std::path::Path::new(&dae_path))
            .expect("analyze_dae_path failed");

        assert!(
            !report.mesh_rows.is_empty(),
            "DAE analysis should find at least one mesh"
        );
        assert!(report.can_convert, "backpack_up.dae should be convertible");
        assert!(
            report.blocking_errors.is_empty(),
            "backpack_up.dae should have no blocking errors"
        );

        let total_verts: usize = report.mesh_rows.iter().map(|r| r.vertex_count).sum();
        assert!(total_verts > 0, "total vertex count should be positive");

        println!(
            "[OK] DAE analysis: {} meshes, {} total verts, {} bones, up_axis={}, can_convert={}",
            report.mesh_rows.len(),
            total_verts,
            report.bone_count,
            report.up_axis,
            report.can_convert,
        );
        for row in &report.mesh_rows {
            println!(
                "  mesh '{}': {} verts, {} tris, {} bone groups, max_inf={}",
                row.name,
                row.vertex_count,
                row.triangle_count,
                row.bone_influence_groups,
                row.max_influences_per_vertex
            );
        }
    }

    #[test]
    fn analyze_all_zabanya_dae_files() {
        if skip_if_missing(DAE_DIR) {
            return;
        }

        let dae_files: Vec<_> = std::fs::read_dir(DAE_DIR)
            .expect("read DAE_DIR")
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .map_or(false, |ext| ext.eq_ignore_ascii_case("dae"))
            })
            .collect();

        assert!(!dae_files.is_empty(), "should find DAE files in {DAE_DIR}");

        let mut ok_count = 0;
        let mut fail_count = 0;

        for entry in &dae_files {
            let path = entry.path();
            match crate::ssbh_dae::analyze_dae_path(&path) {
                Ok(report) => {
                    let total_verts: usize = report.mesh_rows.iter().map(|r| r.vertex_count).sum();
                    println!(
                        "[OK] {}: {} meshes, {} verts, {} bones, convert={}",
                        path.file_name().unwrap().to_string_lossy(),
                        report.mesh_rows.len(),
                        total_verts,
                        report.bone_count,
                        report.can_convert,
                    );
                    ok_count += 1;
                }
                Err(e) => {
                    eprintln!(
                        "[FAIL] {}: {}",
                        path.file_name().unwrap().to_string_lossy(),
                        e
                    );
                    fail_count += 1;
                }
            }
        }

        println!(
            "[SUMMARY] {ok_count}/{} DAE files analyzed ({fail_count} failures)",
            dae_files.len()
        );
        assert!(ok_count > 0, "at least one DAE should analyze successfully");
    }

    #[test]
    fn full_session_lifecycle_stage_then_import_then_save() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(STAGE_ROOT) || skip_if_missing(&dae_path) {
            return;
        }

        let state = SceneSessionState::default();

        let sid = state.create_session(SceneSource::Folder {
            path: STAGE_ROOT.to_string(),
        });
        assert!(!sid.is_empty());

        let bundle = fhm2d_stage::load_stage_bundle_impl(STAGE_ROOT).expect("load stage bundle");
        state
            .with_session_mut(&sid, |s| {
                s.placement_header = bundle.placement_header;
                s.placement_entries = bundle
                    .placement_entries
                    .into_iter()
                    .map(|e| PlacementEntry {
                        vdk_type: e.vdk_type,
                        object_number: e.object_number,
                        pos_x: e.pos_x,
                        pos_y: e.pos_y,
                        pos_z: e.pos_z,
                        rot_x: e.rot_x,
                        rot_y: e.rot_y,
                        rot_z: e.rot_z,
                        scale_x: e.scale_x,
                        scale_y: e.scale_y,
                        scale_z: e.scale_z,
                        raw_fields: e.raw_fields,
                    })
                    .collect();
                s.graphic_params = bundle
                    .graphic_params
                    .into_iter()
                    .map(|g| GraphicParam {
                        key: g.key,
                        value: g.value,
                    })
                    .collect();
                Ok(())
            })
            .unwrap();

        let is_dirty_1 = state.with_session(&sid, |s| Ok(s.dirty)).unwrap();
        assert!(!is_dirty_1, "fresh session should not be dirty");

        let dae_bytes = std::fs::read(&dae_path).expect("read DAE");
        let import_id = state
            .with_session_mut(&sid, |s| {
                Ok(s.add_import("backpack_up".into(), dae_bytes.clone()))
            })
            .unwrap();

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            flip_uv: false,
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: false,
            material_template: None,
            maya_file: None,
            nust_file: None,
            numdlb_entries: Vec::new(),
        };

        state
            .with_session_mut(&sid, |s| {
                let import = s.find_import_mut(&import_id)?;
                import.config = ImportConfig {
                    load_to_scene: false,
                    convert_to_ssbh: true,
                    generate_hkt: false,
                    ssbh_config: Some(ssbh_config.clone()),
                    hkt_simplify: HktSimplifyConfig::default(),
                };
                Ok(())
            })
            .unwrap();

        let artifacts =
            convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config).expect("SSBH conversion");
        state
            .with_session_mut(&sid, |s| s.store_ssbh_artifacts(&import_id, artifacts))
            .unwrap();

        let is_dirty_2 = state.with_session(&sid, |s| Ok(s.dirty)).unwrap();
        assert!(is_dirty_2, "session should be dirty after import+convert");

        let imports = state
            .with_session(&sid, |s| {
                Ok(s.pending_imports
                    .iter()
                    .map(|i| (i.id.clone(), i.name.clone(), i.ssbh_artifacts.is_some()))
                    .collect::<Vec<_>>())
            })
            .unwrap();
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].1, "backpack_up");
        assert!(imports[0].2, "should have ssbh artifacts");

        let save_artifacts = state
            .with_session(&sid, |s| Ok(s.collect_save_artifacts()))
            .unwrap();
        assert!(!save_artifacts.is_empty(), "should have save artifacts");

        let has_numdlb = save_artifacts
            .iter()
            .any(|a| a.relative_path.contains("numdlb"));
        let has_numshb = save_artifacts
            .iter()
            .any(|a| a.relative_path.contains("numshb"));
        assert!(has_numdlb, "should contain numdlb");
        assert!(has_numshb, "should contain numshb");

        let temp_out = tempfile::tempdir().expect("temp dir");
        for artifact in &save_artifacts {
            let target = temp_out.path().join(&artifact.relative_path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(&target, &artifact.data).unwrap();
        }

        for artifact in &save_artifacts {
            let target = temp_out.path().join(&artifact.relative_path);
            assert!(
                target.exists(),
                "saved file should exist: {}",
                artifact.relative_path
            );
            let size = std::fs::metadata(&target).unwrap().len();
            assert_eq!(
                size as usize,
                artifact.data.len(),
                "size mismatch for {}",
                artifact.relative_path
            );
        }

        state
            .with_session_mut(&sid, |s| {
                s.mark_clean();
                Ok(())
            })
            .unwrap();
        let is_dirty_3 = state.with_session(&sid, |s| Ok(s.dirty)).unwrap();
        assert!(!is_dirty_3, "should be clean after mark_clean");

        state.destroy_session(&sid).unwrap();
        assert!(
            state.with_session(&sid, |_| Ok(())).is_err(),
            "session should be gone after destroy"
        );

        println!(
            "[OK] Full lifecycle: create -> load stage -> import DAE -> convert -> save ({} files) -> clean -> destroy",
            save_artifacts.len()
        );
    }
}
