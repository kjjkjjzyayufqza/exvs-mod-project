//! Tauri command wrappers for stage fhm2d rename and bundle loading.

use serde::Serialize;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};

use crate::fhm2d_memory_preview::Fhm2dMemorySessionState;
use crate::format::fhm2d::extract_fhm2d_to_memory_impl;
use crate::format::fhm2d_stage;

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
    let result = tauri::async_runtime::spawn_blocking(move || {
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
        stage_log(&format!("extract done: {} files, {extract_ms}ms", extraction.files.len()));

        emit_progress(&app_clone, "tree", "Parsing folder structure...", 60, Some(extract_ms));
        let t2 = Instant::now();

        let (tree, warnings) =
            fhm2d_stage::stage_rename_in_memory(&extraction.files, &extraction.sub_file_structure)?;

        let rename_ms = t2.elapsed().as_millis() as u64;
        stage_log(&format!("tree done: {} children, {} warnings, {rename_ms}ms",
            tree.children.len(), warnings.len()));

        let total_files = extraction.files.len();
        let total_size_bytes: usize = extraction.files.iter().map(|f| f.data.len()).sum();

        emit_progress(&app_clone, "done", "Complete", 100, Some(rename_ms));

        Ok::<_, String>(fhm2d_stage::StageRenamePreviewResult {
            tree,
            warnings,
            source_name: source_name_clone,
            total_files,
            total_size_bytes,
        })
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(result)
}

// Full import command is disabled while the tree preview is being validated.
// It will be re-enabled once the rename mapping is confirmed correct.
#[tauri::command]
pub async fn import_stage_fhm2d_in_memory(
    _app: AppHandle,
    _state: State<'_, Fhm2dMemorySessionState>,
    _source_path: String,
) -> Result<fhm2d_stage::StageInMemoryImportResult, String> {
    Err("import_stage_fhm2d_in_memory is temporarily disabled. Use preview_stage_fhm2d_rename instead.".to_string())
}
