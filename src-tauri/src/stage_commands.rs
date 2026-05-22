//! Tauri command wrappers for stage fhm2d rename, bundle loading, and repacking.

use serde::Serialize;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};

use crate::fhm2d_memory_preview::Fhm2dMemorySessionState;
use crate::format::fhm2d::{extract_fhm2d_to_memory_impl, InMemoryFhm2dExtraction};
use crate::format::fhm2d_stage;

// ── Pending import state ────────────────────────────────────────────────────

#[derive(Default)]
pub struct StagePendingImportState {
    pending: Mutex<Option<PendingStageImport>>,
}

struct PendingStageImport {
    extraction: InMemoryFhm2dExtraction,
    tree: fhm2d_stage::StageVirtualTreeFolder,
    warnings: Vec<String>,
    source_name: String,
}

fn stage_log(msg: &str) {
    eprintln!("[stage_import] {msg}");
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StageImportProgress {
    step: String,
    label: String,
    progress: u8,
    elapsed_ms: Option<u64>,
}

fn emit_progress(app: &AppHandle, step: &str, label: &str, progress: u8, elapsed_ms: Option<u64>) {
    stage_log(&format!("step={step} progress={progress}% label=\"{label}\"{}",
        elapsed_ms.map(|ms| format!(" elapsed={ms}ms")).unwrap_or_default()
    ));
    let _ = app.emit("stage-import-progress", StageImportProgress {
        step: step.to_string(),
        label: label.to_string(),
        progress,
        elapsed_ms,
    });
}

#[tauri::command]
pub async fn extract_stage_fhm2d_to_folder(
    source_path: String,
    output_dir: String,
) -> Result<fhm2d_stage::StageExtractResult, String> {
    let src = source_path.trim().to_string();
    let out = output_dir.trim().to_string();
    if src.is_empty() {
        return Err("source_path cannot be empty.".to_string());
    }
    if out.is_empty() {
        return Err("output_dir cannot be empty.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::extract_stage_fhm2d_to_folder_impl(&src, &out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn stage_apply_rename(
    extracted_dir: String,
) -> Result<fhm2d_stage::StageApplyRenameResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::stage_apply_rename_impl(&extracted_dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn load_stage_bundle(
    stage_root: String,
) -> Result<fhm2d_stage::StageBundle, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::load_stage_bundle_impl(&stage_root)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn preview_stage_fhm2d_rename(
    app: AppHandle,
    pending_state: State<'_, StagePendingImportState>,
    source_path: String,
) -> Result<fhm2d_stage::StageRenamePreviewResult, String> {
    let path = source_path.trim().to_string();
    if path.is_empty() {
        return Err("source_path cannot be empty.".to_string());
    }

    let source_name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "stage".to_string());

    stage_log(&format!("preview rename start: source={source_name}"));

    emit_progress(&app, "read", "Reading file...", 5, None);

    let source_name_clone = source_name.clone();
    let app_clone = app.clone();
    let (result, extraction, tree_clone, warnings_clone) =
        tauri::async_runtime::spawn_blocking(move || {
            let t0 = Instant::now();
            let bytes = std::fs::read(&path)
                .map_err(|e| format!("Failed to read FHM2D file: {e}"))?;
            let file_size = bytes.len();
            let read_ms = t0.elapsed().as_millis() as u64;
            stage_log(&format!("read done: {file_size} bytes, {read_ms}ms"));

            emit_progress(&app_clone, "extract", "Decompressing FHM2D...", 25, Some(read_ms));
            let t1 = Instant::now();

            let extraction = extract_fhm2d_to_memory_impl(&bytes, &source_name_clone, None)?;
            let extract_ms = t1.elapsed().as_millis() as u64;
            stage_log(&format!(
                "extract done: {} files, {extract_ms}ms",
                extraction.files.len()
            ));

            emit_progress(
                &app_clone,
                "tree",
                "Parsing folder structure...",
                60,
                Some(extract_ms),
            );
            let t2 = Instant::now();

            let (tree, warnings) = fhm2d_stage::stage_rename_in_memory(
                &extraction.files,
                &extraction.sub_file_structure,
            )?;

            let rename_ms = t2.elapsed().as_millis() as u64;
            stage_log(&format!(
                "tree done: {} children, {} warnings, {rename_ms}ms",
                tree.children.len(),
                warnings.len()
            ));

            let total_files = extraction.files.len();
            let total_size_bytes: usize = extraction.files.iter().map(|f| f.data.len()).sum();

            emit_progress(&app_clone, "done", "Complete", 100, Some(rename_ms));

            let preview = fhm2d_stage::StageRenamePreviewResult {
                tree: tree.clone(),
                warnings: warnings.clone(),
                source_name: source_name_clone.clone(),
                total_files,
                total_size_bytes,
            };

            Ok::<_, String>((preview, extraction, tree, warnings))
        })
        .await
        .map_err(|e| e.to_string())??;

    {
        let mut guard = pending_state
            .pending
            .lock()
            .map_err(|_| "Failed to lock stage pending import state")?;
        *guard = Some(PendingStageImport {
            extraction,
            tree: tree_clone,
            warnings: warnings_clone,
            source_name: result.source_name.clone(),
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn repack_fhm2d(
    app: AppHandle,
    structure_json_path: String,
    output_path: String,
    atomic_write: Option<bool>,
) -> Result<crate::format::fhm2d_pack::RepackResult, String> {
    let atomic = atomic_write.unwrap_or(true);
    let app_clone = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        crate::format::fhm2d_pack::repack_fhm2d_from_structure(
            &structure_json_path,
            &output_path,
            atomic,
            Some(&|progress| {
                let _ = app_clone.emit("repack-fhm2d-progress", progress.clone());
            }),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn load_stage_from_preview(
    app: AppHandle,
    pending_state: State<'_, StagePendingImportState>,
    memory_state: State<'_, Fhm2dMemorySessionState>,
) -> Result<fhm2d_stage::StageInMemoryImportResult, String> {
    let pending = {
        let mut guard = pending_state
            .pending
            .lock()
            .map_err(|_| "Failed to lock stage pending import state")?;
        guard
            .take()
            .ok_or_else(|| "No pending stage import. Run preview first.".to_string())?
    };

    stage_log(&format!(
        "load_stage_from_preview: source={}, {} files",
        pending.source_name,
        pending.extraction.files.len()
    ));

    emit_progress(&app, "build", "Building model bundles...", 30, None);

    let tree_for_result = pending.tree.clone();
    let warnings_for_result = pending.warnings.clone();
    let source_name = pending.source_name.clone();

    let extraction = pending.extraction;
    let tree = pending.tree;

    let app_for_build = app.clone();
    let (bundle, extraction_for_session) = tauri::async_runtime::spawn_blocking(move || {
        let t0 = Instant::now();
        let result = fhm2d_stage::build_stage_bundle_from_memory(
            &extraction.files,
            &tree,
            Some("pending"),
            |done, total, name| {
                let pct = if total == 0 {
                    30
                } else {
                    30 + ((done as u64) * 60 / (total as u64)) as u8
                };
                let label = format!("Building model {}/{}: {}", done + 1, total, name);
                stage_log(&format!("model progress: {label}"));
                emit_progress(&app_for_build, "build_model", &label, pct, None);
            },
        );
        let elapsed = t0.elapsed().as_millis() as u64;
        stage_log(&format!("build_stage_bundle_from_memory: {elapsed}ms"));
        result.map(|b| (b, extraction))
    })
    .await
    .map_err(|e| e.to_string())??;

    emit_progress(&app, "session", "Creating texture session...", 92, None);

    let session_id = memory_state
        .allocate_and_insert_session(extraction_for_session, source_name)
        .map_err(|e| {
            stage_log(&format!("session creation failed: {e}"));
            e
        })?;

    stage_log(&format!("memory session created: {session_id}"));

    let mut final_bundle = bundle;
    if let Some(ref mut base) = final_bundle.base_model {
        base.source_session_id = Some(session_id.clone());
        base.source_kind = "memory".to_string();
    }
    for sub in &mut final_bundle.sub_models {
        sub.bundle.source_session_id = Some(session_id.clone());
        sub.bundle.source_kind = "memory".to_string();
    }

    emit_progress(&app, "done", "Complete", 100, None);

    Ok(fhm2d_stage::StageInMemoryImportResult {
        bundle: final_bundle,
        tree: tree_for_result,
        warnings: warnings_for_result,
        session_id: Some(session_id),
    })
}
