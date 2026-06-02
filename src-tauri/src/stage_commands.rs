//! Tauri command wrappers for stage fhm2d rename, bundle loading, and repacking.

use serde::Serialize;
use std::sync::Mutex;
use std::time::Instant;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, State};

use crate::fhm2d_memory_preview::Fhm2dMemorySessionState;
use crate::format::fhm2d::{extract_fhm2d_to_memory_impl, InMemoryFhm2dExtraction};
use crate::format::fhm2d_stage;
use crate::format::fhm2d_stage_validate;
use crate::format::unit_model_validate;

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
    stage_log(&format!(
        "step={step} progress={progress}% label=\"{label}\"{}",
        elapsed_ms
            .map(|ms| format!(" elapsed={ms}ms"))
            .unwrap_or_default()
    ));
    let _ = app.emit(
        "stage-import-progress",
        StageImportProgress {
            step: step.to_string(),
            label: label.to_string(),
            progress,
            elapsed_ms,
        },
    );
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractStepProgress {
    step: String,
    label: String,
    detail: Option<String>,
}

fn emit_extract_step(app: &AppHandle, step: &str, label: &str, detail: Option<&str>) {
    eprintln!(
        "[extract_fhm2d] {step}: {label}{}",
        detail.map(|d| format!(" ({d})")).unwrap_or_default()
    );
    let _ = app.emit(
        "extract-fhm2d-progress",
        ExtractStepProgress {
            step: step.to_string(),
            label: label.to_string(),
            detail: detail.map(|d| d.to_string()),
        },
    );
}

#[tauri::command]
pub async fn extract_stage_fhm2d_to_folder(
    app: AppHandle,
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
    eprintln!("[extract_fhm2d] Starting — source: {src}, output: {out}");
    let t = Instant::now();
    let app_clone = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        emit_extract_step(
            &app_clone,
            "extract",
            "Reading and extracting FHM2D...",
            None,
        );
        let t0 = Instant::now();
        let mut result = fhm2d_stage::extract_stage_fhm2d_to_folder_impl(&src, &out)?;
        let extract_ms = t0.elapsed().as_millis();
        emit_extract_step(
            &app_clone,
            "extract",
            "Reading and extracting FHM2D...",
            Some(&format!("{} files, {extract_ms}ms", result.total_files)),
        );

        emit_extract_step(
            &app_clone,
            "textures",
            "Consolidating textures to shared folder...",
            None,
        );
        let t1 = Instant::now();
        match fhm2d_stage::restore_shared_textures(&result.output_dir) {
            Ok(restore) => {
                let restore_ms = t1.elapsed().as_millis();
                if restore.textures_collected > 0 {
                    emit_extract_step(
                        &app_clone,
                        "textures",
                        "Consolidating textures to shared folder...",
                        Some(&format!(
                            "{} textures, {} subdirs cleaned, {restore_ms}ms",
                            restore.textures_collected, restore.subdirs_removed
                        )),
                    );
                } else {
                    emit_extract_step(
                        &app_clone,
                        "textures",
                        "Consolidating textures to shared folder...",
                        Some("No textures to consolidate"),
                    );
                }
                result.warnings.extend(restore.warnings);
            }
            Err(e) => {
                let msg = format!("Texture consolidation failed: {e}");
                eprintln!("[extract_fhm2d] WARN: {msg}");
                result.warnings.push(msg);
            }
        }

        emit_extract_step(&app_clone, "done", "Extraction complete", None);
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?;
    match &result {
        Ok(r) => eprintln!(
            "[extract_fhm2d] Done in {}ms — {} files, {} warnings",
            t.elapsed().as_millis(),
            r.total_files,
            r.warnings.len()
        ),
        Err(e) => eprintln!(
            "[extract_fhm2d] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn stage_apply_rename(
    extracted_dir: String,
) -> Result<fhm2d_stage::StageApplyRenameResult, String> {
    eprintln!("[stage_apply_rename] Starting — dir: {extracted_dir}");
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::stage_apply_rename_impl(&extracted_dir)
    })
    .await
    .map_err(|e| e.to_string())?;
    match &result {
        Ok(_) => eprintln!("[stage_apply_rename] Done in {}ms", t.elapsed().as_millis()),
        Err(e) => eprintln!(
            "[stage_apply_rename] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn load_stage_bundle(stage_root: String) -> Result<fhm2d_stage::StageBundle, String> {
    eprintln!("[load_bundle] Loading: {stage_root}");
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        // Consolidate textures into a single shared textures/ folder before loading.
        // This keeps the editing layout consistent with extract and Save-to-folder
        // (one shared textures/, no per-model subdirs); the model loader resolves
        // textures from textures/ via ancestor walk, so per-model subdirs are not
        // required for display. Per-model subdirs are only materialized inside
        // the isolated .fhm2d repack workspace.
        if let Err(e) = fhm2d_stage::restore_shared_textures(&stage_root) {
            eprintln!("[load_bundle] Texture consolidation warning: {e}");
        }
        fhm2d_stage::load_stage_bundle_impl(&stage_root)
    })
    .await
    .map_err(|e| e.to_string())?;
    match &result {
        Ok(b) => eprintln!(
            "[load_bundle] Done in {}ms — {} sub-models",
            t.elapsed().as_millis(),
            b.sub_models.len()
        ),
        Err(e) => eprintln!(
            "[load_bundle] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn stage_load_skeleton(
    stage_root: String,
) -> Result<fhm2d_stage::StageSkeleton, String> {
    eprintln!("[stage_load_skeleton] Loading skeleton: {stage_root}");
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::load_stage_skeleton_impl(&stage_root)
    })
    .await
    .map_err(|e| e.to_string())?;
    match &result {
        Ok(s) => eprintln!(
            "[stage_load_skeleton] Done in {}ms — {} sub-models in manifest, has_base={}",
            t.elapsed().as_millis(),
            s.sub_model_manifest.len(),
            s.has_base_model,
        ),
        Err(e) => eprintln!(
            "[stage_load_skeleton] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn stage_stream_bundles(
    stage_root: String,
    on_chunk: Channel<fhm2d_stage::StageStreamChunk>,
) -> Result<(), String> {
    eprintln!("[stage_stream_bundles] Starting stream: {stage_root}");
    let t = Instant::now();

    let root = std::path::Path::new(&stage_root);
    if !root.is_dir() {
        return Err(format!("Stage root directory not found: {stage_root}"));
    }

    let skeleton = fhm2d_stage::load_stage_skeleton_impl(&stage_root)?;
    let total = skeleton.sub_model_manifest.len() + if skeleton.has_base_model { 1 } else { 0 };
    let mut loaded = 0usize;

    // Phase 1: Base model first (priority — viewport needs it immediately)
    if skeleton.has_base_model {
        let base_root = stage_root.clone();
        let base_result = tauri::async_runtime::spawn_blocking(move || {
            let root = std::path::Path::new(&base_root);
            let mut warnings = Vec::new();
            fhm2d_stage::load_model_in_subfolder_pub(root, "base", &mut warnings)
        })
        .await
        .map_err(|e| e.to_string())?;

        match base_result {
            Some(bundle) => {
                loaded += 1;
                let _ = on_chunk.send(fhm2d_stage::StageStreamChunk::BaseModel { bundle });
                let _ = on_chunk.send(fhm2d_stage::StageStreamChunk::Progress { loaded, total });
                eprintln!("[stage_stream_bundles] Base model sent ({loaded}/{total})");
            }
            None => {
                let _ = on_chunk.send(fhm2d_stage::StageStreamChunk::Error {
                    message: "Base model folder exists but failed to load".into(),
                    folder_name: Some("base".into()),
                });
            }
        }
    }

    // Phase 2: Sub-models parsed in parallel via rayon, results sent as they complete
    let manifest = skeleton.sub_model_manifest.clone();
    eprintln!(
        "[stage_stream_bundles] Parsing {} sub-models with rayon",
        manifest.len(),
    );

    let stage_root_for_rayon = stage_root.clone();
    let results = tauri::async_runtime::spawn_blocking(move || {
        use rayon::prelude::*;
        manifest
            .par_iter()
            .map(|entry| {
                let root = std::path::Path::new(&stage_root_for_rayon);
                let mut warnings = Vec::new();
                let bundle = fhm2d_stage::load_model_in_subfolder_pub(
                    root,
                    &entry.folder_name,
                    &mut warnings,
                );
                (entry.folder_name.clone(), entry.object_index, bundle)
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| e.to_string())?;

    // Send results in manifest order (deterministic) with progress updates
    for (folder_name, object_index, result) in results {
        match result {
            Some(bundle) => {
                loaded += 1;
                let _ = on_chunk.send(fhm2d_stage::StageStreamChunk::SubModel {
                    folder_name: folder_name.clone(),
                    object_index,
                    bundle,
                });
                let _ = on_chunk.send(fhm2d_stage::StageStreamChunk::Progress { loaded, total });
            }
            None => {
                let _ = on_chunk.send(fhm2d_stage::StageStreamChunk::Error {
                    message: format!("Failed to load sub-model '{folder_name}'"),
                    folder_name: Some(folder_name),
                });
            }
        }
    }

    let elapsed_ms = t.elapsed().as_millis() as u64;
    let _ = on_chunk.send(fhm2d_stage::StageStreamChunk::Complete {
        total_models: loaded,
        elapsed_ms,
    });
    eprintln!(
        "[stage_stream_bundles] Complete — {loaded} models in {elapsed_ms}ms"
    );
    Ok(())
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
    let t_total = Instant::now();

    emit_progress(&app, "read", "Reading file...", 5, None);

    let source_name_clone = source_name.clone();
    let app_clone = app.clone();
    let spawn_outcome =
        tauri::async_runtime::spawn_blocking(move || {
            let t0 = Instant::now();
            let bytes =
                std::fs::read(&path).map_err(|e| format!("Failed to read FHM2D file: {e}"))?;
            let file_size = bytes.len();
            let read_ms = t0.elapsed().as_millis() as u64;
            stage_log(&format!("read done: {file_size} bytes, {read_ms}ms"));

            emit_progress(
                &app_clone,
                "extract",
                "Decompressing FHM2D...",
                25,
                Some(read_ms),
            );
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

            let (tree, warnings) = fhm2d_stage::stage_rename_in_memory_numatb_based(
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
        .map_err(|e| e.to_string())?;
    let (result, extraction, tree_clone, warnings_clone) = match spawn_outcome {
        Ok(v) => v,
        Err(e) => {
            stage_log(&format!(
                "preview rename Failed in {}ms — {e}",
                t_total.elapsed().as_millis()
            ));
            return Err(e);
        }
    };

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

    stage_log(&format!(
        "preview rename Done in {}ms — {} files",
        t_total.elapsed().as_millis(),
        result.total_files
    ));
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

    eprintln!("[repack_fhm2d] Starting — structure: {structure_json_path}, output: {output_path}");
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
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
    .map_err(|e| format!("Task join error: {e}"))?;
    match &result {
        Ok(r) => eprintln!(
            "[repack_fhm2d] Done in {}ms — {} bytes",
            t.elapsed().as_millis(),
            r.output_size
        ),
        Err(e) => eprintln!(
            "[repack_fhm2d] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn repack_stage_fhm2d_preserving_shared_textures(
    app: AppHandle,
    stage_root: String,
    output_path: String,
    atomic_write: Option<bool>,
) -> Result<fhm2d_stage::StageRepackPreserveResult, String> {
    let atomic = atomic_write.unwrap_or(true);
    let app_clone = app.clone();

    eprintln!(
        "[repack_stage_preserve_shared] Starting — stage: {stage_root}, output: {output_path}"
    );
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::repack_stage_fhm2d_preserving_shared_textures(
            &stage_root,
            &output_path,
            atomic,
            Some(&|progress| {
                let _ = app_clone.emit("repack-fhm2d-progress", progress.clone());
            }),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    match &result {
        Ok(r) => eprintln!(
            "[repack_stage_preserve_shared] Done in {}ms — {} bytes, {} textures staged",
            t.elapsed().as_millis(),
            r.output_size,
            r.textures_copied
        ),
        Err(e) => eprintln!(
            "[repack_stage_preserve_shared] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn redistribute_stage_textures(
    stage_root: String,
) -> Result<fhm2d_stage::RedistributeResult, String> {
    eprintln!("[redistribute] Starting for: {stage_root}");
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::redistribute_stage_textures(&stage_root)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    match &result {
        Ok(r) => eprintln!(
            "[redistribute] Done in {}ms — {} models, {} textures copied, {} warnings",
            t.elapsed().as_millis(),
            r.models_processed,
            r.textures_copied,
            r.warnings.len()
        ),
        Err(e) => eprintln!(
            "[redistribute] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn restore_shared_textures(
    stage_root: String,
) -> Result<fhm2d_stage::RestoreSharedResult, String> {
    eprintln!("[restore_textures] Starting for: {stage_root}");
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::restore_shared_textures(&stage_root)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    match &result {
        Ok(r) => eprintln!(
            "[restore_textures] Done in {}ms — {} textures collected, {} subdirs removed, {} warnings",
            t.elapsed().as_millis(), r.textures_collected, r.subdirs_removed, r.warnings.len()
        ),
        Err(e) => eprintln!("[restore_textures] Failed in {}ms — {e}", t.elapsed().as_millis()),
    }
    result
}

#[tauri::command]
pub async fn apply_scene_texture_edits(
    stage_root: String,
    added: Vec<fhm2d_stage::AddedTextureEdit>,
    removed: Vec<fhm2d_stage::RemovedTextureEdit>,
) -> Result<fhm2d_stage::ApplyTextureEditsResult, String> {
    eprintln!(
        "[apply_texture_edits] Starting for: {stage_root} (+{} / -{})",
        added.len(),
        removed.len()
    );
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::apply_scene_texture_edits(&stage_root, &added, &removed)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    match &result {
        Ok(r) => eprintln!(
            "[apply_texture_edits] Done in {}ms — {} copied, {} deleted, {} warnings",
            t.elapsed().as_millis(),
            r.copied,
            r.deleted,
            r.warnings.len()
        ),
        Err(e) => eprintln!(
            "[apply_texture_edits] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn rebuild_stage_structure_json(stage_root: String) -> Result<String, String> {
    eprintln!("[rebuild_structure] Starting for: {stage_root}");
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::rebuild_structure_json_for_stage(&stage_root)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    match &result {
        Ok(p) => eprintln!(
            "[rebuild_structure] Done in {}ms — wrote {p}",
            t.elapsed().as_millis()
        ),
        Err(e) => eprintln!(
            "[rebuild_structure] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn rebuild_stage_structure_json_forced(stage_root: String) -> Result<String, String> {
    eprintln!("[rebuild_structure_forced] Starting for: {stage_root}");
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::rebuild_structure_json_for_stage_forced(&stage_root)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    match &result {
        Ok(p) => eprintln!(
            "[rebuild_structure_forced] Done in {}ms — wrote {p}",
            t.elapsed().as_millis()
        ),
        Err(e) => eprintln!(
            "[rebuild_structure_forced] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
}

#[tauri::command]
pub async fn rebuild_stage_structure_json_with_shared_textures(
    stage_root: String,
) -> Result<String, String> {
    eprintln!("[rebuild_structure_shared] Starting for: {stage_root}");
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::rebuild_structure_json_for_stage_with_shared_textures(&stage_root)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    match &result {
        Ok(p) => eprintln!(
            "[rebuild_structure_shared] Done in {}ms — wrote {p}",
            t.elapsed().as_millis()
        ),
        Err(e) => eprintln!(
            "[rebuild_structure_shared] Failed in {}ms — {e}",
            t.elapsed().as_millis()
        ),
    }
    result
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
    let t_total = Instant::now();

    emit_progress(&app, "build", "Building model bundles...", 30, None);

    let tree_for_result = pending.tree.clone();
    let warnings_for_result = pending.warnings.clone();
    let source_name = pending.source_name.clone();

    let extraction = pending.extraction;
    let tree = pending.tree;

    let app_for_build = app.clone();
    let spawn_outcome = tauri::async_runtime::spawn_blocking(move || {
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
    .map_err(|e| e.to_string())?;
    let (bundle, extraction_for_session) = match spawn_outcome {
        Ok(v) => v,
        Err(e) => {
            stage_log(&format!(
                "load_stage_from_preview Failed in {}ms — {e}",
                t_total.elapsed().as_millis()
            ));
            return Err(e);
        }
    };

    emit_progress(&app, "session", "Creating texture session...", 92, None);

    let session_id = memory_state
        .allocate_and_insert_session(extraction_for_session, source_name)
        .map_err(|e| {
            stage_log(&format!(
                "load_stage_from_preview Failed in {}ms — session creation failed: {e}",
                t_total.elapsed().as_millis()
            ));
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

    stage_log(&format!(
        "load_stage_from_preview Done in {}ms — {} sub-models",
        t_total.elapsed().as_millis(),
        final_bundle.sub_models.len()
    ));
    Ok(fhm2d_stage::StageInMemoryImportResult {
        bundle: final_bundle,
        tree: tree_for_result,
        warnings: warnings_for_result,
        session_id: Some(session_id),
    })
}

#[tauri::command]
pub async fn exvs_stage_validate_for_repack(
    stage_root: String,
) -> Result<fhm2d_stage_validate::ExvsStageValidationResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage_validate::exvs_stage_validate_for_repack(&stage_root)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    Ok(result)
}

/// Pre-flight gate: detect numatb material texture parameters with empty paths.
/// Layout-independent, so it is safe to run before any save/repack mutation.
#[tauri::command]
pub async fn scene_validate_numatb_empty_params(
    stage_root: String,
) -> Result<fhm2d_stage_validate::ExvsStageValidationResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage_validate::exvs_stage_validate_numatb_empty_params(&stage_root)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    Ok(result)
}

#[tauri::command]
pub async fn validate_unit_model_for_repack(
    model_root: String,
    structure_json_path: Option<String>,
) -> Result<unit_model_validate::UnitModelValidationResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_validate::validate_unit_model_for_repack(
            &model_root,
            structure_json_path.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    Ok(result)
}
