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
pub async fn import_stage_fhm2d_in_memory(
    app: AppHandle,
    state: State<'_, Fhm2dMemorySessionState>,
    source_path: String,
) -> Result<fhm2d_stage::StageInMemoryImportResult, String> {
    let path = source_path.trim().to_string();
    if path.is_empty() {
        return Err("source_path cannot be empty.".to_string());
    }

    let source_name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "stage".to_string());

    stage_log(&format!("import start: source={source_name} path={path}"));
    let pipeline_start = Instant::now();

    emit_progress(&app, "read", "Reading file...", 5, None);
    let t0 = Instant::now();

    let source_name_for_extract = source_name.clone();
    let app_clone = app.clone();

    let (extraction, virtual_tree, rename_warnings) =
        tauri::async_runtime::spawn_blocking(move || {
            let bytes = std::fs::read(&path)
                .map_err(|e| format!("Failed to read FHM2D file: {e}"))?;
            let file_size = bytes.len();
            let read_ms = t0.elapsed().as_millis() as u64;

            stage_log(&format!("read done: size={file_size} bytes, elapsed={read_ms}ms"));

            emit_progress(&app_clone, "extract", "Decompressing FHM2D...", 20, Some(read_ms));
            let t1 = Instant::now();

            let extraction = extract_fhm2d_to_memory_impl(
                &bytes,
                &source_name_for_extract,
                None,
            )?;

            let extract_ms = t1.elapsed().as_millis() as u64;
            stage_log(&format!("extract done: {} files, elapsed={extract_ms}ms",
                extraction.files.len()));

            emit_progress(&app_clone, "rename", "Analyzing folder structure...", 40, Some(extract_ms));
            let t2 = Instant::now();

            let (virtual_tree, rename_warnings) =
                fhm2d_stage::stage_rename_in_memory(&extraction.files)?;

            let rename_ms = t2.elapsed().as_millis() as u64;
            stage_log(&format!("rename done: {} folders, {} warnings, elapsed={rename_ms}ms",
                virtual_tree.len(), rename_warnings.len()));
            for folder in &virtual_tree {
                stage_log(&format!("  folder {}: {} → {} [{}] ({} files)",
                    folder.original_index,
                    folder.original_index,
                    folder.renamed_name,
                    folder.role,
                    folder.files.len()));
            }

            emit_progress(&app_clone, "csv", "Parsing stage data...", 55, Some(rename_ms));

            Ok::<_, String>((extraction, virtual_tree, rename_warnings))
        })
        .await
        .map_err(|e| e.to_string())??;

    let t3 = Instant::now();
    let mut all_warnings = rename_warnings;

    let graphic_param_bytes: Option<Vec<u8>> = fhm2d_stage::find_info_file_data(
        &extraction.files,
        &virtual_tree,
        "graphic_param.csv",
    ).map(|d| d.to_vec());

    let placement_bytes: Option<Vec<u8>> = fhm2d_stage::find_info_file_data(
        &extraction.files,
        &virtual_tree,
        "placement.csv",
    ).map(|d| d.to_vec());

    let graphic_params = match graphic_param_bytes.as_deref() {
        Some(data) => fhm2d_stage::parse_graphic_param_csv_from_bytes(data, &mut all_warnings),
        None => {
            all_warnings.push("graphic_param.csv not found in info folder".to_string());
            Vec::new()
        }
    };

    let (placement_header, placement_entries) = match placement_bytes.as_deref() {
        Some(data) => fhm2d_stage::parse_placement_csv_from_bytes(data, &mut all_warnings),
        None => {
            all_warnings.push("placement.csv not found in info folder".to_string());
            (Vec::new(), Vec::new())
        }
    };

    let csv_ms = t3.elapsed().as_millis() as u64;
    stage_log(&format!("csv done: {} graphic params, {} placement entries, elapsed={csv_ms}ms",
        graphic_params.len(), placement_entries.len()));

    let model_folder_count = virtual_tree.iter()
        .filter(|f| f.role == "base" || f.role == "sub_model")
        .count();

    emit_progress(&app, "models", "Building model previews...", 60, Some(csv_ms));

    let app_for_models = app.clone();
    let mut models_built = 0usize;
    let model_progress_callback = move |folder_name: &str, _folder_index: usize| {
        models_built += 1;
        let sub_progress = if model_folder_count > 0 {
            60 + (35 * models_built / model_folder_count).min(35) as u8
        } else {
            90
        };
        emit_progress(
            &app_for_models,
            "models",
            &format!("Building model: {}...", folder_name),
            sub_progress,
            None,
        );
    };

    let (base_model, sub_models, model_warnings) =
        crate::fhm2d_memory_preview::build_stage_preview_models(
            &state,
            source_name.clone(),
            extraction,
            &virtual_tree,
            model_progress_callback,
        )?;

    all_warnings.extend(model_warnings);

    let total_ms = pipeline_start.elapsed().as_millis() as u64;
    stage_log(&format!("import complete: base_model={}, sub_models={}, warnings={}, total_elapsed={total_ms}ms",
        base_model.is_some(), sub_models.len(), all_warnings.len()));

    emit_progress(&app, "done", "Import complete", 100, None);

    let bundle = fhm2d_stage::StageBundle {
        root_path: format!("memory://{}", source_name),
        base_model,
        sub_models,
        graphic_params,
        placement_header,
        placement_entries,
        warnings: all_warnings.clone(),
    };

    Ok(fhm2d_stage::StageInMemoryImportResult {
        bundle,
        virtual_tree,
        warnings: all_warnings,
    })
}
