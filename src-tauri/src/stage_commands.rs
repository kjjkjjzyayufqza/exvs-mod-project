//! Tauri command wrappers for stage fhm2d rename, bundle loading, and repacking.

use serde::Serialize;
use std::sync::Mutex;
use std::time::Instant;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, State};

use crate::fhm2d_memory_preview::Fhm2dMemorySessionState;
use crate::format::effect_folder;
use crate::format::fhm2d::{extract_fhm2d_to_memory_impl, InMemoryFhm2dExtraction};
use crate::format::fhm2d_stage;
use crate::format::fhm2d_stage_validate;
use crate::format::unit_model_extract;
use crate::format::unit_model_migrate;
use crate::format::unit_model_models;
use crate::format::unit_model_numatb_profile_fix;
use crate::format::unit_model_repack;
use crate::format::unit_model_textures;
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
    output_name: Option<String>,
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
        let mut result = fhm2d_stage::extract_stage_fhm2d_to_folder_impl_with_name(
            &src,
            &out,
            output_name.as_deref(),
        )?;
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
pub async fn stage_load_skeleton(stage_root: String) -> Result<fhm2d_stage::StageSkeleton, String> {
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

/// Load one stage model slot from disk after a direct-to-disk replace (no session IPC).
#[tauri::command]
pub async fn stage_load_model_slot_bundle(
    stage_root: String,
    folder_name: String,
) -> Result<crate::ssbh_preview::SsbhModelPreviewBundle, String> {
    let stage_root = stage_root.trim().to_string();
    let folder_name = folder_name.trim().to_string();
    if stage_root.is_empty() {
        return Err("stage_root cannot be empty".to_string());
    }
    if folder_name.is_empty() {
        return Err("folder_name cannot be empty".to_string());
    }

    eprintln!("[stage_load_model_slot_bundle] stage_root={stage_root} folder_name={folder_name}");
    let t = Instant::now();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let root = std::path::Path::new(&stage_root);
        if !root.is_dir() {
            return Err(format!("Stage root directory not found: {stage_root}"));
        }
        let mut warnings = Vec::new();
        let bundle = fhm2d_stage::load_model_in_subfolder_pub(root, &folder_name, &mut warnings)
            .ok_or_else(|| format!("Failed to load model slot '{folder_name}' from disk"))?;
        let mut bundle = bundle;
        if !warnings.is_empty() {
            bundle.warnings.extend(warnings);
        }
        Ok(bundle)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;

    eprintln!(
        "[stage_load_model_slot_bundle] Done in {}ms",
        t.elapsed().as_millis()
    );
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

    // Phase 2: Sub-models parsed in parallel via rayon and forwarded to the webview as each
    // one finishes — NOT collected into a Vec first. Collecting held every sub-model bundle
    // (plus its registered geometry blob) in memory at once, which pushed peak memory toward
    // the abort threshold on large stages. Streaming as produced bounds peak memory to
    // roughly one bundle per rayon worker and lets sub-models render progressively. Order is
    // completion order rather than manifest order, which is safe: each chunk carries its own
    // `folder_name` + `object_index`, so the frontend resolves placement from the chunk
    // itself, not arrival order.
    let manifest = skeleton.sub_model_manifest.clone();
    eprintln!(
        "[stage_stream_bundles] Parsing {} sub-models with rayon (streaming as produced)",
        manifest.len(),
    );

    let (tx, rx) = std::sync::mpsc::channel::<fhm2d_stage::StageStreamChunk>();
    let stage_root_for_rayon = stage_root.clone();
    // Producer: parse sub-models in parallel, sending each result down the channel as soon
    // as it is ready. `for_each_with` hands every rayon worker its own `Sender` clone, so no
    // shared `&Sender` crosses threads. The channel closes once all clones drop (parse done).
    let producer = tauri::async_runtime::spawn_blocking(move || {
        use rayon::prelude::*;
        manifest.par_iter().for_each_with(tx, |tx, entry| {
            let root = std::path::Path::new(&stage_root_for_rayon);
            let mut warnings = Vec::new();
            match fhm2d_stage::load_model_in_subfolder_pub(root, &entry.folder_name, &mut warnings)
            {
                Some(bundle) => {
                    let _ = tx.send(fhm2d_stage::StageStreamChunk::SubModel {
                        folder_name: entry.folder_name.clone(),
                        object_index: entry.object_index,
                        bundle,
                    });
                }
                None => {
                    let _ = tx.send(fhm2d_stage::StageStreamChunk::Error {
                        message: format!("Failed to load sub-model '{}'", entry.folder_name),
                        folder_name: Some(entry.folder_name.clone()),
                    });
                }
            }
        });
    });

    // Consumer: forward each chunk to the webview as it arrives, emitting a progress update
    // after every successfully loaded sub-model. Runs on the blocking pool so the blocking
    // `recv` loop never stalls the async runtime, and hands `on_chunk` back with the final
    // loaded count.
    let total_for_consumer = total;
    let base_loaded = loaded;
    let (on_chunk, sub_loaded) = tauri::async_runtime::spawn_blocking(move || {
        let mut loaded = base_loaded;
        while let Ok(chunk) = rx.recv() {
            let is_sub_model = matches!(chunk, fhm2d_stage::StageStreamChunk::SubModel { .. });
            let _ = on_chunk.send(chunk);
            if is_sub_model {
                loaded += 1;
                let _ = on_chunk.send(fhm2d_stage::StageStreamChunk::Progress {
                    loaded,
                    total: total_for_consumer,
                });
            }
        }
        (on_chunk, loaded)
    })
    .await
    .map_err(|e| e.to_string())?;

    producer.await.map_err(|e| e.to_string())?;
    loaded = sub_loaded;

    let elapsed_ms = t.elapsed().as_millis() as u64;
    let _ = on_chunk.send(fhm2d_stage::StageStreamChunk::Complete {
        total_models: loaded,
        elapsed_ms,
    });
    eprintln!("[stage_stream_bundles] Complete — {loaded} models in {elapsed_ms}ms");
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
    let spawn_outcome = tauri::async_runtime::spawn_blocking(move || {
        let t0 = Instant::now();
        let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read FHM2D file: {e}"))?;
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

    crate::console_color::eprint_info(
        "repack_fhm2d",
        &format!("Starting — structure: {structure_json_path}, output: {output_path}"),
    );
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
        Ok(r) => crate::console_color::eprint_success(
            "repack_fhm2d",
            &format!(
                "Done in {}ms — {} bytes",
                t.elapsed().as_millis(),
                r.output_size
            ),
        ),
        Err(e) => crate::console_color::eprint_error(
            "repack_fhm2d",
            &format!("Failed in {}ms — {e}", t.elapsed().as_millis()),
        ),
    }
    result
}

#[tauri::command]
pub async fn repack_unit_model_fhm2d(
    app: AppHandle,
    structure_json_path: String,
    output_path: String,
    atomic_write: Option<bool>,
) -> Result<crate::format::fhm2d_pack::RepackResult, String> {
    let atomic = atomic_write.unwrap_or(true);
    let app_clone = app.clone();

    crate::console_color::eprint_info(
        "repack_unit_model_fhm2d",
        &format!("Starting — structure: {structure_json_path}, output: {output_path}"),
    );
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_repack::repack_unit_model_from_structure(
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
        Ok(r) => crate::console_color::eprint_success(
            "repack_unit_model_fhm2d",
            &format!(
                "Done in {}ms — {} bytes",
                t.elapsed().as_millis(),
                r.output_size
            ),
        ),
        Err(e) => crate::console_color::eprint_error(
            "repack_unit_model_fhm2d",
            &format!("Failed in {}ms — {e}", t.elapsed().as_millis()),
        ),
    }
    result
}

#[tauri::command]
pub async fn inspect_effect_folder(
    effect_root: String,
    structure_json_path: Option<String>,
) -> Result<effect_folder::EffectFolderInventory, String> {
    tauri::async_runtime::spawn_blocking(move || {
        effect_folder::inspect_effect_folder(&effect_root, structure_json_path.as_deref())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn parse_effect_efxbn_file(path: String) -> Result<effect_folder::EfxbnSummary, String> {
    tauri::async_runtime::spawn_blocking(move || effect_folder::parse_efxbn_file(&path))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn patch_effect_efxbn_control_constants(
    path: String,
    patches: Vec<effect_folder::EfxbnControlConstantPatch>,
) -> Result<effect_folder::EfxbnControlConstantWriteResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        effect_folder::patch_efxbn_control_constants(&path, &patches)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn validate_effect_folder_for_repack(
    effect_root: String,
    structure_json_path: Option<String>,
) -> Result<effect_folder::EffectFolderValidationResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        effect_folder::validate_effect_folder_for_repack(
            &effect_root,
            structure_json_path.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?;
    Ok(result)
}

#[tauri::command]
pub async fn repack_effect_folder_fhm2d(
    app: AppHandle,
    structure_json_path: String,
    output_path: String,
    atomic_write: Option<bool>,
) -> Result<crate::format::fhm2d_pack::RepackResult, String> {
    let atomic = atomic_write.unwrap_or(true);
    let app_clone = app.clone();

    crate::console_color::eprint_info(
        "repack_effect_folder_fhm2d",
        &format!("Starting — structure: {structure_json_path}, output: {output_path}"),
    );
    let t = Instant::now();
    let result = tauri::async_runtime::spawn_blocking(move || {
        effect_folder::repack_effect_folder_from_structure(
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
        Ok(r) => crate::console_color::eprint_success(
            "repack_effect_folder_fhm2d",
            &format!(
                "Done in {}ms — {} bytes",
                t.elapsed().as_millis(),
                r.output_size
            ),
        ),
        Err(e) => crate::console_color::eprint_error(
            "repack_effect_folder_fhm2d",
            &format!("Failed in {}ms — {e}", t.elapsed().as_millis()),
        ),
    }
    result
}

#[tauri::command]
pub async fn import_effect_folder_file(
    effect_root: String,
    structure_json_path: Option<String>,
    source_path: Option<String>,
    kind: String,
    hash_id: i32,
    target_filename: Option<String>,
) -> Result<effect_folder::EffectFolderMutationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        effect_folder::import_effect_file(
            &effect_root,
            structure_json_path.as_deref(),
            source_path.as_deref(),
            &kind,
            hash_id,
            target_filename.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn update_effect_folder_item_hash(
    effect_root: String,
    structure_json_path: Option<String>,
    file_index: i32,
    hash_id: i32,
) -> Result<effect_folder::EffectFolderMutationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        effect_folder::update_effect_folder_item_hash(
            &effect_root,
            structure_json_path.as_deref(),
            file_index,
            hash_id,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn import_effect_folder_model(
    effect_root: String,
    structure_json_path: Option<String>,
    source_dir: Option<String>,
    model_hash_id: i32,
    target_folder_name: Option<String>,
) -> Result<effect_folder::EffectFolderMutationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        effect_folder::import_effect_model_folder(
            &effect_root,
            structure_json_path.as_deref(),
            source_dir.as_deref(),
            model_hash_id,
            target_folder_name.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn delete_effect_folder_entries(
    effect_root: String,
    structure_json_path: Option<String>,
    selections: Vec<effect_folder::EffectFolderSelection>,
    delete_files: Option<bool>,
) -> Result<effect_folder::EffectFolderMutationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        effect_folder::delete_effect_folder_entries(
            &effect_root,
            structure_json_path.as_deref(),
            &selections,
            delete_files.unwrap_or(false),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn copy_effect_folder_selection(
    source_effect_root: String,
    source_structure_json_path: Option<String>,
    destination_effect_root: String,
    destination_structure_json_path: Option<String>,
    selections: Vec<effect_folder::EffectFolderSelection>,
) -> Result<effect_folder::EffectFolderCopyResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        effect_folder::copy_effect_folder_selection(
            &source_effect_root,
            source_structure_json_path.as_deref(),
            &destination_effect_root,
            destination_structure_json_path.as_deref(),
            &selections,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
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

#[tauri::command]
pub async fn list_unit_model_textures(
    model_root: String,
    structure_json_path: Option<String>,
) -> Result<unit_model_textures::UnitModelTextureInventory, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_textures::list_unit_model_textures(&model_root, structure_json_path.as_deref())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn sync_unit_model_texture_containers(
    model_root: String,
    structure_json_path: Option<String>,
) -> Result<unit_model_models::UnitModelTextureContainerSyncResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_models::sync_unit_model_texture_containers_result(
            &model_root,
            structure_json_path.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn add_unit_model_nutexb(
    model_root: String,
    structure_json_path: Option<String>,
    source_path: String,
    target_filename: String,
) -> Result<unit_model_textures::UnitModelTextureInventory, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_textures::add_unit_model_nutexb(
            &model_root,
            structure_json_path.as_deref(),
            &source_path,
            &target_filename,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

/// Dry-run scan: report numatb files whose `__maya__`/`__nust__` marker disagrees with
/// content (any non-empty shader_label → nust).
#[tauri::command]
pub async fn analyze_unit_model_numatb_profiles(
    model_root: String,
    structure_json_path: Option<String>,
) -> Result<unit_model_numatb_profile_fix::NumatbProfileFixReport, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_numatb_profile_fix::analyze_unit_model_numatb_profiles(
            &model_root,
            structure_json_path.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

/// Rename mismatched numatb files and rewrite `_structure.json` SubFileData / Item Name.
#[tauri::command]
pub async fn fix_unit_model_numatb_profiles(
    model_root: String,
    structure_json_path: Option<String>,
) -> Result<unit_model_numatb_profile_fix::NumatbProfileFixReport, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_numatb_profile_fix::fix_unit_model_numatb_profiles(
            &model_root,
            structure_json_path.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn register_unit_model_pool_orphans(
    model_root: String,
    structure_json_path: Option<String>,
) -> Result<unit_model_textures::UnitModelTextureInventory, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_textures::register_unit_model_pool_orphans(
            &model_root,
            structure_json_path.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn remove_unit_model_nutexb(
    model_root: String,
    structure_json_path: Option<String>,
    file_index: i32,
) -> Result<unit_model_textures::UnitModelTextureInventory, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_textures::remove_unit_model_nutexb(
            &model_root,
            structure_json_path.as_deref(),
            file_index,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn extract_unit_model_fhm2d_to_folder(
    source_path: String,
    out_root: String,
    write_meta_bin: Option<bool>,
) -> Result<unit_model_extract::UnitModelExtractResult, String> {
    let write_meta = write_meta_bin.unwrap_or(false);
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_extract::extract_unit_model_fhm2d_to_folder_impl(
            &source_path,
            &out_root,
            write_meta,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn analyze_unit_model_folder_migration(
    model_root: String,
    structure_json_path: Option<String>,
) -> Result<unit_model_migrate::UnitModelMigrationAnalysis, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_migrate::analyze_unit_model_folder_migration(
            &model_root,
            structure_json_path.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn migrate_unit_model_folder_layout(
    model_root: String,
    structure_json_path: Option<String>,
) -> Result<unit_model_migrate::UnitModelMigrationResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_migrate::migrate_unit_model_folder_layout(
            &model_root,
            structure_json_path.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn remove_unit_model_model(
    model_root: String,
    structure_json_path: Option<String>,
    model_name: String,
) -> Result<unit_model_models::UnitModelMutationResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_models::remove_unit_model_model(
            &model_root,
            structure_json_path.as_deref(),
            &model_name,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn add_unit_model_model(
    model_root: String,
    structure_json_path: Option<String>,
    source_dir: String,
) -> Result<unit_model_models::UnitModelMutationResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_models::add_unit_model_model(
            &model_root,
            structure_json_path.as_deref(),
            &source_dir,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn replace_unit_model_model(
    model_root: String,
    structure_json_path: Option<String>,
    target_model_name: String,
    source_dir: String,
) -> Result<unit_model_models::UnitModelMutationResult, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_models::replace_unit_model_model(
            &model_root,
            structure_json_path.as_deref(),
            &target_model_name,
            &source_dir,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn preview_unit_model_model_replacement(
    model_root: String,
    structure_json_path: Option<String>,
    target_model_name: String,
    source_dir: String,
) -> Result<unit_model_models::UnitModelReplacePreview, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        unit_model_models::preview_unit_model_model_replacement(
            &model_root,
            structure_json_path.as_deref(),
            &target_model_name,
            &source_dir,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;
    Ok(result)
}

#[tauri::command]
pub async fn validate_unit_model_source_folder(
    source_dir: String,
) -> Result<unit_model_models::UnitModelSourceValidation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        unit_model_models::validate_unit_model_source_folder(&source_dir)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
