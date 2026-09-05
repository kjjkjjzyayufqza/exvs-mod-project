use crate::format::fhm2d_structure_metadata::{
    prepare_copied_structure_json, sanitize_structure_name,
};
use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};
use encoding_rs::GBK;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc::{channel, Receiver},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    ipc::{Channel, InvokeBody, Response},
    AppHandle, Emitter, State,
};

#[tauri::command]
pub fn my_custom_command() {
    println!("I was invoked from JS!");
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

fn paths_refer_to_same_file(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn copy_file_to_path_impl(
    source_path: &Path,
    target_path: &Path,
    overwrite: bool,
) -> Result<(), String> {
    if !source_path.is_file() {
        return Err(format!("Source file not found: {}", source_path.display()));
    }
    if target_path.is_dir() {
        return Err(format!("Target is a directory: {}", target_path.display()));
    }
    if target_path.exists() {
        if !overwrite {
            return Err(format!("Target already exists: {}", target_path.display()));
        }
        if paths_refer_to_same_file(source_path, target_path) {
            return Ok(());
        }
    }
    if let Some(parent) = target_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create target directory {}: {}",
                parent.display(),
                e
            )
        })?;
    }
    fs::copy(source_path, target_path).map_err(|e| {
        format!(
            "Failed to copy file {} -> {}: {}",
            source_path.display(),
            target_path.display(),
            e
        )
    })?;
    Ok(())
}

#[tauri::command]
pub async fn copy_file_to_path(
    source_path: String,
    target_path: String,
    overwrite: Option<bool>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        copy_file_to_path_impl(
            &PathBuf::from(source_path),
            &PathBuf::from(target_path),
            overwrite.unwrap_or(false),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn read_file(path: &str) -> Response {
    match fs::read(path) {
        Ok(data) => {
            println!("File read succesfully");
            return Response::new(InvokeBody::Raw(data));
        }
        Err(e) => {
            println!("Error reading file: {:?}", e);
            return Response::new(InvokeBody::Raw(vec![]));
        }
    }
}

#[tauri::command]
pub fn exec_shell_command(command: &str) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", command]).output()
    } else {
        Command::new("sh").arg("-c").arg(command).output()
    };

    match output {
        Ok(output) => {
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).to_string())
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellCommandOutput {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

fn decode_command_text(bytes: &[u8]) -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(text) = std::str::from_utf8(bytes) {
            return text.to_string();
        }
        let (decoded, _, _) = GBK.decode(bytes);
        decoded.to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        String::from_utf8_lossy(bytes).to_string()
    }
}

#[tauri::command]
pub fn exec_shell_command_with_output(command: &str) -> Result<ShellCommandOutput, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", command]).output()
    } else {
        Command::new("sh").arg("-c").arg(command).output()
    };

    match output {
        Ok(output) => Ok(ShellCommandOutput {
            success: output.status.success(),
            exit_code: output.status.code(),
            stdout: decode_command_text(&output.stdout),
            stderr: decode_command_text(&output.stderr),
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn exec_process_with_output(
    executable: &str,
    args: Vec<String>,
) -> Result<ShellCommandOutput, String> {
    let output = Command::new(executable).args(args).output();

    match output {
        Ok(output) => Ok(ShellCommandOutput {
            success: output.status.success(),
            exit_code: output.status.code(),
            stdout: decode_command_text(&output.stdout),
            stderr: decode_command_text(&output.stderr),
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn nutexb_preview_file_identity(
    path: String,
) -> Result<crate::nutexb_lib::NutexbPreviewFileIdentity, String> {
    crate::nutexb_lib::nutexb_preview_file_identity(&path)
}

#[tauri::command]
pub fn nutexb_read_info(input_path: &str) -> Result<crate::nutexb_lib::NutexbInfo, String> {
    crate::nutexb_lib::read_nutexb_info(input_path)
}

#[tauri::command]
pub fn nutexb_export_dds(input_path: &str, output_path: &str) -> Result<(), String> {
    crate::nutexb_lib::ensure_parent_dir(output_path)?;
    crate::nutexb_lib::export_nutexb_to_dds(input_path, output_path)
}

#[tauri::command]
pub fn nutexb_export_png_uncompressed(input_path: &str, output_path: &str) -> Result<(), String> {
    crate::nutexb_lib::ensure_parent_dir(output_path)?;
    crate::nutexb_lib::export_nutexb_to_png(input_path, output_path)
}

#[tauri::command]
pub fn nutexb_export_png(input_path: &str, output_path: &str) -> Result<(), String> {
    crate::nutexb_lib::ensure_parent_dir(output_path)?;
    crate::nutexb_lib::export_nutexb_to_png(input_path, output_path)
}

#[tauri::command]
pub fn nutexb_png_base64(input_path: String) -> Result<String, String> {
    crate::nutexb_lib::nutexb_to_png_base64(&input_path)
}

/// Returns a small PNG thumbnail (max 64px) as base64 for the Texture Manager panel.
#[tauri::command]
pub fn nutexb_thumbnail_base64(input_path: String) -> Result<String, String> {
    crate::nutexb_lib::nutexb_thumbnail_base64(&input_path)
}

/// Returns a medium PNG preview (max 512px) as base64 for the preview modal.
#[tauri::command]
pub fn nutexb_preview_base64(input_path: String) -> Result<String, String> {
    crate::nutexb_lib::nutexb_preview_base64(&input_path)
}

/// Recursively lists `.nutexb` files under `root` (skips `__convert` and dot-directories).
#[tauri::command]
pub fn list_nutexb_folder(root: String) -> Result<crate::nutexb_lib::NutexbFolderScan, String> {
    crate::nutexb_lib::list_nutexb_folder(root.as_str())
}

/// Returns raw PNG bytes via IPC [`InvokeBody::Raw`] (no base64); prefer for large textures vs [`nutexb_png_base64`].
#[tauri::command]
pub fn nutexb_png_bytes(input_path: String) -> Result<Response, String> {
    let bytes = crate::nutexb_lib::nutexb_to_png_bytes(&input_path)?;
    Ok(Response::new(InvokeBody::Raw(bytes)))
}

/// Returns raw RGBA pixels packed as [u32_LE width][u32_LE height][RGBA...].
/// Skips PNG encode/decode round-trip for faster preview pipeline.
/// Optional `max_dimension` caps the longest edge via Lanczos3 downsampling.
#[tauri::command]
pub async fn nutexb_rgba_bytes(
    input_path: String,
    max_dimension: Option<u32>,
) -> Result<Response, String> {
    let (w, h, rgba) = tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::nutexb_to_rgba_from_path(&input_path, max_dimension)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(Response::new(InvokeBody::Raw(
        crate::nutexb_lib::pack_rgba_response(w, h, rgba),
    )))
}

/// Returns GPU-compressed texture data (BC1-BC7) without CPU decode.
/// For compressed formats, data goes directly to GPU via CompressedTexture.
/// For uncompressed formats, falls back to RGBA.
#[tauri::command]
pub async fn nutexb_compressed_bytes(input_path: String) -> Result<Response, String> {
    let (w, h, fmt, data) = tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::nutexb_compressed_data_from_path(&input_path)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(Response::new(InvokeBody::Raw(
        crate::nutexb_lib::pack_compressed_response(w, h, fmt, data),
    )))
}

/// Single file read: returns identity (size+CRC32) in header + compressed texture data.
/// Response format: [u64_LE nutexb_size][u32_LE crc32][u32_LE width][u32_LE height][u8 format_id][data...]
#[tauri::command]
pub async fn nutexb_identity_and_compressed(input_path: String) -> Result<Response, String> {
    let (nutexb_size, crc32, w, h, fmt, data) = tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::nutexb_identity_and_compressed_from_path(&input_path)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut result = Vec::with_capacity(17 + data.len());
    result.extend_from_slice(&nutexb_size.to_le_bytes());
    result.extend_from_slice(&crc32.to_le_bytes());
    result.extend_from_slice(&w.to_le_bytes());
    result.extend_from_slice(&h.to_le_bytes());
    result.push(fmt);
    result.extend_from_slice(&data);
    Ok(Response::new(InvokeBody::Raw(result)))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum NutexbStreamChunk {
    #[serde(rename = "identity")]
    Identity {
        path: String,
        nutexb_size: u64,
        crc32: u32,
    },
    #[serde(rename = "identityError")]
    IdentityError { path: String, message: String },
    #[serde(rename = "progress")]
    Progress {
        done: usize,
        total: usize,
        phase: String,
    },
    #[serde(rename = "complete")]
    Complete {
        total_resolved: usize,
        elapsed_ms: u64,
    },
}

#[tauri::command]
pub async fn nutexb_stream_identities(
    paths: Vec<String>,
    on_chunk: Channel<NutexbStreamChunk>,
) -> Result<(), String> {
    let t = Instant::now();
    let total = paths.len();
    let concurrency = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .min(16)
        .max(2);

    let mut resolved = 0usize;

    for batch_start in (0..total).step_by(concurrency) {
        let batch_end = (batch_start + concurrency).min(total);
        let batch: Vec<String> = paths[batch_start..batch_end].to_vec();

        let mut handles = Vec::with_capacity(batch.len());
        for path in batch {
            let handle = tauri::async_runtime::spawn_blocking(move || {
                let identity = crate::nutexb_lib::nutexb_preview_file_identity(&path);
                (path, identity)
            });
            handles.push(handle);
        }

        for handle in handles {
            let (path, result) = handle.await.map_err(|e| e.to_string())?;
            match result {
                Ok(identity) => {
                    resolved += 1;
                    let _ = on_chunk.send(NutexbStreamChunk::Identity {
                        path,
                        nutexb_size: identity.nutexb_size,
                        crc32: identity.crc32,
                    });
                }
                Err(e) => {
                    let _ = on_chunk.send(NutexbStreamChunk::IdentityError { path, message: e });
                }
            }
        }

        let _ = on_chunk.send(NutexbStreamChunk::Progress {
            done: (batch_end).min(total),
            total,
            phase: "identity".into(),
        });
    }

    let elapsed_ms = t.elapsed().as_millis() as u64;
    let _ = on_chunk.send(NutexbStreamChunk::Complete {
        total_resolved: resolved,
        elapsed_ms,
    });

    Ok(())
}

#[tauri::command]
pub async fn nutexb_batch_export_png(
    root_dir: String,
    output_mode: String,
    overwrite: bool,
) -> Result<crate::nutexb_lib::BatchExportSummary, String> {
    let mode = crate::nutexb_lib::OutputMode::parse(output_mode.as_str())?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::batch_export_folder_to_png(root_dir.as_str(), mode, overwrite)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn series_image_replace_from_png(
    series_image_dir: String,
    series_image_convert_dir: String,
    icon_file_index: i32,
    file_name: String,
    png_path: String,
) -> Result<crate::nutexb_lib::SeriesImageReplaceSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::series_image_replace_from_png(
            series_image_dir.as_str(),
            series_image_convert_dir.as_str(),
            icon_file_index,
            file_name.as_str(),
            png_path.as_str(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn card_icon_replace_from_png(
    nutexb_path: String,
    convert_dir: String,
    png_path: String,
) -> Result<crate::nutexb_lib::SeriesImageReplaceSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::card_icon_replace_from_png(
            nutexb_path.as_str(),
            convert_dir.as_str(),
            png_path.as_str(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn image_to_nutexb(
    image_path: String,
    output_nutexb_path: String,
    nutexb_name: String,
    dds_format: String,
    generate_mipmaps: bool,
) -> Result<crate::nutexb_lib::SeriesImageReplaceSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::image_to_nutexb(
            image_path.as_str(),
            output_nutexb_path.as_str(),
            nutexb_name.as_str(),
            dds_format.as_str(),
            generate_mipmaps,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn card_icon_replace_from_png_with_dds_format(
    nutexb_path: String,
    convert_dir: String,
    png_path: String,
    dds_format: String,
) -> Result<crate::nutexb_lib::SeriesImageReplaceSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::card_icon_replace_from_png_with_dds_format(
            nutexb_path.as_str(),
            convert_dir.as_str(),
            png_path.as_str(),
            dds_format.as_str(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn card_icon_detect_dds_format(nutexb_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::card_icon_detect_dds_format(nutexb_path.as_str())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn card_icon_batch_replace_with_dds_format(
    items: Vec<(String, String)>,
    dds_format: String,
    source: String,
) -> Result<crate::nutexb_lib::CardIconBatchReplaceSummary, String> {
    let parsed_source: crate::nutexb_lib::CardIconBatchReplaceSource = source.parse()?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::nutexb_lib::card_icon_batch_replace_with_dds_format(
            items,
            dds_format.as_str(),
            parsed_source,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Relative path under `base_dir`: allows nested segments (e.g. `0/sub/file.bin`), rejects `..` and absolute paths.
fn validate_relative_path_under_base(rel: &str) -> Result<(), String> {
    if rel.is_empty() {
        return Err("relative_path must not be empty".to_string());
    }
    let path = Path::new(rel);
    if path.is_absolute() {
        return Err(format!("relative_path must be relative: {rel}"));
    }
    for c in path.components() {
        match c {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir => {
                return Err(format!("relative_path must not contain '..': {rel}"));
            }
            Component::Prefix(_) | Component::RootDir => {
                return Err(format!("relative_path must not be absolute: {rel}"));
            }
        }
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteBatchFileBase64 {
    pub relative_path: String,
    pub data_base64: String,
}

/// Per-file `fs::write` wall time (milliseconds); base64 decode is not included.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteBatchFileWriteTiming {
    pub relative_path: String,
    pub write_ms: f64,
}

/// Writes many files in one IPC round-trip (optionally chunked from the webview). Decodes base64 on the Rust side.
#[tauri::command]
pub async fn write_files_batch_base64(
    base_dir: String,
    files: Vec<WriteBatchFileBase64>,
) -> Result<Vec<WriteBatchFileWriteTiming>, String> {
    if files.is_empty() {
        return Ok(vec![]);
    }
    const MAX_FILES_PER_INVOKE: usize = 512;
    if files.len() > MAX_FILES_PER_INVOKE {
        return Err(format!("files.len() must be <= {MAX_FILES_PER_INVOKE}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
        let base = PathBuf::from(&base_dir);
        fs::create_dir_all(&base).map_err(|e| e.to_string())?;
        let mut timings: Vec<WriteBatchFileWriteTiming> = Vec::with_capacity(files.len());
        for f in files {
            validate_relative_path_under_base(&f.relative_path)?;
            let bytes = BASE64
                .decode(f.data_base64.trim())
                .map_err(|e| e.to_string())?;
            let path = base.join(&f.relative_path);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let write_start = Instant::now();
            fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            let write_ms = write_start.elapsed().as_secs_f64() * 1000.0;
            let path_str = path.to_string_lossy().into_owned();
            println!("[ExtractFHM] write file {} {:.2}ms", path_str, write_ms);
            timings.push(WriteBatchFileWriteTiming {
                relative_path: f.relative_path,
                write_ms,
            });
        }
        Ok(timings)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn extract_fhm2d_to_folder(
    source_path: String,
    out_dir: String,
    format: Option<String>,
    list_output_file_name: Option<String>,
    write_meta_bin: Option<bool>,
) -> Result<crate::format::fhm2d::ExtractFhm2dResult, String> {
    let format_label = format.clone().unwrap_or_else(|| "none".to_string());
    let write_meta = write_meta_bin.unwrap_or(false);
    let op = crate::console_color::StderrOp::start(
        "extract_fhm2d_to_folder",
        format!(
            "Starting — source: {source_path}, output: {out_dir}, format: {format_label}, write_meta_bin: {write_meta}"
        ),
    );
    let parsed_format = match crate::format::fhm2d::Fhm2dFormat::from_opt_str(format.as_deref()) {
        Ok(value) => value,
        Err(error) => {
            op.err(&error);
            return Err(error);
        }
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        crate::format::fhm2d::extract_fhm2d_to_folder_impl(
            source_path.as_str(),
            out_dir.as_str(),
            parsed_format,
            list_output_file_name,
            write_meta,
        )
    })
    .await
    .map_err(|e| {
        let msg = format!("Task join error: {e}");
        op.err(&msg);
        msg
    })?;
    match &result {
        Ok(extracted) => {
            if let Some(warning) = extracted.naming_error.as_ref() {
                crate::console_color::eprint_warn(
                    "extract_fhm2d_to_folder",
                    &format!("naming warning: {warning}"),
                );
            }
            op.ok("extracted");
        }
        Err(error) => op.err(error),
    }
    result
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkMscExtractTask {
    pub hash_hex: String,
    pub pack_name: String,
    #[serde(default)]
    pub character_ids: Vec<i32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkMscExtractItemResult {
    pub hash_hex: String,
    pub pack_name: String,
    pub character_ids: Vec<i32>,
    pub source_path: String,
    pub out_dir: String,
    pub status: String,
    pub naming_error: Option<String>,
    pub error: Option<String>,
    pub elapsed_ms: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkMscExtractProgress {
    pub current: usize,
    pub total: usize,
    pub item: BulkMscExtractItemResult,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkMscExtractSummary {
    pub total: usize,
    pub success_count: usize,
    pub source_missing_count: usize,
    pub extraction_failure_count: usize,
    pub naming_warning_count: usize,
    pub elapsed_ms: f64,
    pub items: Vec<BulkMscExtractItemResult>,
}

fn join_relative_path(base: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty() {
        return Ok(base.to_path_buf());
    }
    validate_relative_path_under_base(trimmed)?;
    let mut out = base.to_path_buf();
    for component in Path::new(trimmed).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(format!("Invalid relative path: {trimmed}"));
            }
        }
    }
    Ok(out)
}

fn build_fhm2d_source_index(source_root: &Path) -> Result<HashMap<String, PathBuf>, String> {
    if !source_root.is_dir() {
        return Err(format!(
            "Source root is not a directory: {}",
            source_root.display()
        ));
    }

    let mut index = HashMap::new();
    let entries = fs::read_dir(source_root)
        .map_err(|e| format!("Failed to read source root {}: {e}", source_root.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_fhm2d = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("fhm2d"))
            .unwrap_or(false);
        if !is_fhm2d {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        index.entry(stem.to_ascii_lowercase()).or_insert(path);
    }
    Ok(index)
}

fn process_bulk_msc_extract_task(
    task: BulkMscExtractTask,
    source_root: &Path,
    source_index: &HashMap<String, PathBuf>,
    output_route_root: &Path,
) -> BulkMscExtractItemResult {
    let started = Instant::now();
    let hash_hex = normalize_hash_hex(&task.hash_hex).unwrap_or_else(|_| task.hash_hex.clone());
    let hash_key = hash_hex.to_ascii_lowercase();
    let default_source_path = source_root.join(format!("{hash_hex}.fhm2d"));
    let pack_name = sanitize_structure_name(&task.pack_name);
    let Some(source_path) = source_index.get(&hash_key).cloned() else {
        let out_dir = output_route_root.join(&pack_name);
        return BulkMscExtractItemResult {
            hash_hex,
            pack_name,
            character_ids: task.character_ids,
            source_path: normalize_path(&default_source_path),
            out_dir: normalize_path(&out_dir),
            status: "source_missing".to_string(),
            naming_error: None,
            error: Some("Source file not found".to_string()),
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        };
    };

    let out_dir = output_route_root.join(&pack_name);
    let source_path_string = normalize_path(&source_path);
    let out_dir_string = normalize_path(&out_dir);

    match crate::format::fhm2d::extract_fhm2d_to_folder_impl(
        source_path_string.as_str(),
        out_dir_string.as_str(),
        Some(crate::format::fhm2d::Fhm2dFormat::Msc),
        None,
        false,
    ) {
        Ok(result) => BulkMscExtractItemResult {
            hash_hex,
            pack_name,
            character_ids: task.character_ids,
            source_path: source_path_string,
            out_dir: out_dir_string,
            status: "extracted".to_string(),
            naming_error: result.naming_error,
            error: None,
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        },
        Err(error) => BulkMscExtractItemResult {
            hash_hex,
            pack_name,
            character_ids: task.character_ids,
            source_path: source_path_string,
            out_dir: out_dir_string,
            status: "extract_error".to_string(),
            naming_error: None,
            error: Some(error),
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        },
    }
}

fn summarize_bulk_msc_extract(
    total: usize,
    started: Instant,
    items: Vec<BulkMscExtractItemResult>,
) -> BulkMscExtractSummary {
    let success_count = items
        .iter()
        .filter(|item| item.status == "extracted")
        .count();
    let source_missing_count = items
        .iter()
        .filter(|item| item.status == "source_missing")
        .count();
    let extraction_failure_count = items
        .iter()
        .filter(|item| item.status == "extract_error")
        .count();
    let naming_warning_count = items
        .iter()
        .filter(|item| item.naming_error.is_some())
        .count();

    BulkMscExtractSummary {
        total,
        success_count,
        source_missing_count,
        extraction_failure_count,
        naming_warning_count,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        items,
    }
}

fn bulk_extract_msc_fhm2d_to_folder_impl(
    source_root: String,
    output_root: String,
    route_prefix: String,
    tasks: Vec<BulkMscExtractTask>,
    concurrency: Option<usize>,
    on_progress: Channel<BulkMscExtractProgress>,
) -> Result<BulkMscExtractSummary, String> {
    let started = Instant::now();
    let total = tasks.len();
    if total == 0 {
        return Ok(summarize_bulk_msc_extract(total, started, Vec::new()));
    }

    let source_root_path = PathBuf::from(source_root);
    let output_root_path = PathBuf::from(output_root);
    if source_root_path.as_os_str().is_empty() {
        return Err("Source root is not configured".to_string());
    }
    if output_root_path.as_os_str().is_empty() {
        return Err("Output root is not configured".to_string());
    }
    fs::create_dir_all(&output_root_path).map_err(|e| {
        format!(
            "Failed to create output root {}: {e}",
            output_root_path.display()
        )
    })?;
    let output_route_root = join_relative_path(&output_root_path, &route_prefix)?;
    let source_index = Arc::new(build_fhm2d_source_index(&source_root_path)?);
    let queue = Arc::new(Mutex::new(VecDeque::from(tasks)));
    let (result_tx, result_rx) = channel::<BulkMscExtractItemResult>();
    let worker_count = concurrency.unwrap_or(4).clamp(1, 8).min(total.max(1));
    let mut handles = Vec::with_capacity(worker_count);

    for _ in 0..worker_count {
        let queue = queue.clone();
        let result_tx = result_tx.clone();
        let source_root_path = source_root_path.clone();
        let output_route_root = output_route_root.clone();
        let source_index = source_index.clone();
        handles.push(thread::spawn(move || loop {
            let next_task = {
                let mut guard = queue.lock().expect("bulk MSC queue lock poisoned");
                guard.pop_front()
            };
            let Some(task) = next_task else {
                break;
            };
            let result = process_bulk_msc_extract_task(
                task,
                &source_root_path,
                source_index.as_ref(),
                &output_route_root,
            );
            if result_tx.send(result).is_err() {
                break;
            }
        }));
    }
    drop(result_tx);

    let mut items = Vec::with_capacity(total);
    for result in result_rx {
        let current = items.len() + 1;
        let _ = on_progress.send(BulkMscExtractProgress {
            current,
            total,
            item: result.clone(),
        });
        items.push(result);
    }

    for handle in handles {
        handle
            .join()
            .map_err(|_| "Bulk MSC extract worker panicked".to_string())?;
    }

    if items.len() != total {
        return Err(format!(
            "Bulk MSC extract finished with {} result(s), expected {total}",
            items.len()
        ));
    }

    Ok(summarize_bulk_msc_extract(total, started, items))
}

#[tauri::command]
pub async fn bulk_extract_msc_fhm2d_to_folder(
    state: State<'_, WatcherState>,
    source_root: String,
    output_root: String,
    route_prefix: String,
    tasks: Vec<BulkMscExtractTask>,
    concurrency: Option<usize>,
    on_progress: Channel<BulkMscExtractProgress>,
) -> Result<BulkMscExtractSummary, String> {
    let _watcher_guard =
        WatcherSuppressGuard::new(state.suppress_count.clone(), state.suppress_until.clone());
    tauri::async_runtime::spawn_blocking(move || {
        bulk_extract_msc_fhm2d_to_folder_impl(
            source_root,
            output_root,
            route_prefix,
            tasks,
            concurrency,
            on_progress,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyAssetAsNewResult {
    pub new_hash_hex: String,
    pub new_raw_value: i32,
    pub new_folder_path: String,
    pub new_structure_json_path: String,
    pub updated_file_url_count: usize,
}

fn copy_asset_as_new_impl(
    source_folder_path: &Path,
    source_structure_json_path: &Path,
    destination_asset_root_dir: &Path,
    old_hash_hex: &str,
    seed: &str,
) -> Result<CopyAssetAsNewResult, String> {
    if !destination_asset_root_dir.is_dir() {
        return Err(format!(
            "Destination asset root directory does not exist: {}",
            destination_asset_root_dir.display()
        ));
    }

    let normalized_old_hash = normalize_hash_hex(old_hash_hex)?;
    let new_crc_u32 = crc32_ieee(seed.as_bytes());
    let new_hash_hex = format!("0x{:08X}", new_crc_u32);
    let new_raw_value = new_crc_u32 as i32;
    let new_pack_name = sanitize_structure_name(seed);

    if new_hash_hex.eq_ignore_ascii_case(&normalized_old_hash) {
        return Err("Computed hash equals the source hash; use a different seed".to_string());
    }

    if !source_folder_path.is_dir() {
        return Err(format!(
            "Source folder not found: {}",
            source_folder_path.display()
        ));
    }
    if !source_structure_json_path.is_file() {
        return Err(format!(
            "Source structure JSON not found: {}",
            source_structure_json_path.display()
        ));
    }

    let source_folder_stem = source_folder_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            format!(
                "Source folder name is invalid: {}",
                source_folder_path.display()
            )
        })?;

    let new_folder = destination_asset_root_dir.join(&new_pack_name);
    let new_struct = destination_asset_root_dir.join(format!("{new_pack_name}_structure.json"));

    if new_folder.exists() || new_struct.exists() {
        return Err(format!("Target already exists: {}", new_pack_name));
    }

    let old_struct_text = fs::read_to_string(source_structure_json_path).map_err(|e| {
        format!(
            "Failed to read source structure JSON {}: {}",
            source_structure_json_path.display(),
            e
        )
    })?;
    let struct_value: Value = serde_json::from_str(&old_struct_text).map_err(|e| {
        format!(
            "Failed to parse source structure JSON {}: {}",
            source_structure_json_path.display(),
            e
        )
    })?;

    let (struct_value, updated_file_url_count) = prepare_copied_structure_json(
        struct_value,
        source_folder_stem,
        &normalized_old_hash,
        &new_pack_name,
        &new_hash_hex,
    )?;

    let serialized = serde_json::to_string_pretty(&struct_value)
        .map_err(|e| format!("Failed to serialize new structure JSON: {e}"))?;
    fs::write(&new_struct, serialized).map_err(|e| {
        format!(
            "Failed to write new structure JSON {}: {}",
            new_struct.display(),
            e
        )
    })?;

    if let Err(copy_err) = copy_dir_recursive(source_folder_path, &new_folder) {
        let _ = cleanup_artifacts(&new_struct, &new_folder);
        return Err(format!(
            "Failed to copy source folder {} -> {}: {}",
            source_folder_path.display(),
            new_folder.display(),
            copy_err
        ));
    }

    Ok(CopyAssetAsNewResult {
        new_hash_hex,
        new_raw_value,
        new_folder_path: normalize_path(&new_folder),
        new_structure_json_path: normalize_path(&new_struct),
        updated_file_url_count,
    })
}

#[tauri::command]
pub async fn copy_asset_as_new(
    source_folder_path: String,
    source_structure_json_path: String,
    destination_asset_root_dir: String,
    old_hash_hex: String,
    seed: String,
    _field_key: String,
) -> Result<CopyAssetAsNewResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        copy_asset_as_new_impl(
            &PathBuf::from(source_folder_path),
            &PathBuf::from(source_structure_json_path),
            &PathBuf::from(destination_asset_root_dir),
            &old_hash_hex,
            &seed,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveAssetTargets {
    pub workspace_asset_root: Option<String>,
    pub extract_output_asset_root: Option<String>,
    pub mod_directory: Option<String>,
}

fn remove_asset_hash_folder_pair(root: &Path, normalized_hash: &str) -> Result<bool, String> {
    let asset_folder = root.join(normalized_hash);
    let struct_json = root.join(format!("{normalized_hash}_structure.json"));
    let mut did_any = false;
    if asset_folder.is_dir() {
        fs::remove_dir_all(&asset_folder)
            .map_err(|e| format!("Failed to remove folder {}: {}", asset_folder.display(), e))?;
        did_any = true;
    }
    if struct_json.is_file() {
        fs::remove_file(&struct_json)
            .map_err(|e| format!("Failed to remove {}: {}", struct_json.display(), e))?;
        did_any = true;
    }
    Ok(did_any)
}

fn remove_mod_fhm2d_file(mod_dir: &Path, normalized_hash: &str) -> Result<bool, String> {
    let upper = format!("{}.fhm2d", normalized_hash);
    let lower = upper.to_ascii_lowercase();
    let mut paths = vec![mod_dir.join(&upper)];
    if lower != upper {
        paths.push(mod_dir.join(&lower));
    }
    let mut removed = false;
    for p in paths {
        if p.is_file() {
            fs::remove_file(&p).map_err(|e| format!("Failed to remove {}: {}", p.display(), e))?;
            removed = true;
        }
    }
    Ok(removed)
}

fn remove_asset_workspace_impl(hash_hex: &str, targets: RemoveAssetTargets) -> Result<(), String> {
    let normalized = normalize_hash_hex(hash_hex)?;

    let mut root_paths: Vec<PathBuf> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for opt in [
        &targets.workspace_asset_root,
        &targets.extract_output_asset_root,
    ] {
        if let Some(s) = opt {
            let t = s.trim();
            if t.is_empty() {
                continue;
            }
            let p = PathBuf::from(t);
            let key = p.to_string_lossy().to_ascii_lowercase();
            if seen.insert(key) {
                root_paths.push(p);
            }
        }
    }

    let mod_trimmed = targets
        .mod_directory
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if root_paths.is_empty() && mod_trimmed.is_none() {
        return Err("Select at least one removal target".to_string());
    }

    let mut removed_any = false;
    let mut skipped_targets: Vec<String> = Vec::new();

    for root in &root_paths {
        if !root.is_dir() {
            skipped_targets.push(format!("missing directory {}", root.display()));
            continue;
        }
        if remove_asset_hash_folder_pair(root, &normalized)? {
            removed_any = true;
        } else {
            skipped_targets.push(format!("no folder pair under {}", root.display()));
        }
    }

    if let Some(mod_s) = mod_trimmed {
        let mod_dir = PathBuf::from(mod_s);
        if !mod_dir.is_dir() {
            skipped_targets.push(format!("missing mod directory {}", mod_dir.display()));
        } else if remove_mod_fhm2d_file(&mod_dir, &normalized)? {
            removed_any = true;
        } else {
            skipped_targets.push(format!("no packaged .fhm2d under {}", mod_dir.display()));
        }
    }

    if !removed_any {
        let detail = if skipped_targets.is_empty() {
            String::new()
        } else {
            format!(": {}", skipped_targets.join("; "))
        };
        return Err(format!(
            "Nothing to remove for {} in selected targets{}",
            normalized, detail
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_asset_workspace(
    hash_hex: String,
    targets: RemoveAssetTargets,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || remove_asset_workspace_impl(&hash_hex, targets))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveLegacyWorkspaceContentResult {
    pub source_folder_path: String,
    pub source_structure_json_path: String,
    pub configured_folder_path: String,
    pub configured_structure_json_path: String,
}

#[cfg(test)]
fn move_legacy_workspace_content_impl(
    legacy_asset_root_dir: &Path,
    configured_asset_root_dir: &Path,
    hash_hex: &str,
) -> Result<MoveLegacyWorkspaceContentResult, String> {
    if !legacy_asset_root_dir.is_dir() {
        return Err(format!(
            "Legacy asset root directory does not exist: {}",
            legacy_asset_root_dir.display()
        ));
    }

    let normalized_hash = normalize_hash_hex(hash_hex)?;
    let source_folder = legacy_asset_root_dir.join(&normalized_hash);
    let source_struct = legacy_asset_root_dir.join(format!("{normalized_hash}_structure.json"));
    let configured_folder = configured_asset_root_dir.join(&normalized_hash);
    let configured_struct =
        configured_asset_root_dir.join(format!("{normalized_hash}_structure.json"));

    move_legacy_workspace_content_paths_impl(
        &source_folder,
        &source_struct,
        &configured_folder,
        &configured_struct,
    )
}

fn move_legacy_workspace_content_paths_impl(
    source_folder: &Path,
    source_struct: &Path,
    configured_folder: &Path,
    configured_struct: &Path,
) -> Result<MoveLegacyWorkspaceContentResult, String> {
    if source_folder == configured_folder || source_struct == configured_struct {
        return Err("Legacy and configured workspace paths are identical".to_string());
    }
    if !source_folder.is_dir() {
        return Err(format!(
            "Legacy pack folder not found: {}",
            source_folder.display()
        ));
    }
    if !source_struct.is_file() {
        return Err(format!(
            "Legacy structure JSON not found: {}",
            source_struct.display()
        ));
    }
    if configured_folder.exists() {
        return Err(format!(
            "Configured pack folder already exists: {}",
            configured_folder.display()
        ));
    }
    if configured_struct.exists() {
        return Err(format!(
            "Configured structure JSON already exists: {}",
            configured_struct.display()
        ));
    }

    let configured_asset_root_dir = configured_folder.parent().ok_or_else(|| {
        format!(
            "Configured pack folder has no parent directory: {}",
            configured_folder.display()
        )
    })?;

    fs::create_dir_all(configured_asset_root_dir).map_err(|e| {
        format!(
            "Failed to create configured asset root {}: {}",
            configured_asset_root_dir.display(),
            e
        )
    })?;

    fs::rename(&source_folder, &configured_folder).map_err(|e| {
        format!(
            "Failed to move legacy pack folder {} -> {}: {}",
            source_folder.display(),
            configured_folder.display(),
            e
        )
    })?;

    if let Err(error) = fs::rename(&source_struct, &configured_struct) {
        if configured_folder.exists() && !source_folder.exists() {
            let _ = fs::rename(&configured_folder, &source_folder);
        }
        return Err(format!(
            "Failed to move legacy structure JSON {} -> {}: {}",
            source_struct.display(),
            configured_struct.display(),
            error
        ));
    }

    Ok(MoveLegacyWorkspaceContentResult {
        source_folder_path: normalize_path(&source_folder),
        source_structure_json_path: normalize_path(&source_struct),
        configured_folder_path: normalize_path(&configured_folder),
        configured_structure_json_path: normalize_path(&configured_struct),
    })
}

#[tauri::command]
pub async fn move_legacy_workspace_content(
    source_folder_path: String,
    source_structure_json_path: String,
    configured_folder_path: String,
    configured_structure_json_path: String,
) -> Result<MoveLegacyWorkspaceContentResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        move_legacy_workspace_content_paths_impl(
            &PathBuf::from(source_folder_path),
            &PathBuf::from(source_structure_json_path),
            &PathBuf::from(configured_folder_path),
            &PathBuf::from(configured_structure_json_path),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn analyze_fhm2d_structure_migration(
    structure_json_path: String,
) -> Result<crate::format::fhm2d_structure_metadata::Fhm2dStructureMigrationAnalysis, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::format::fhm2d_structure_metadata::analyze_structure_json(Path::new(
            &structure_json_path,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn migrate_fhm2d_structure_metadata(
    structure_json_path: String,
    name: String,
) -> Result<crate::format::fhm2d_structure_metadata::Fhm2dStructureMigrationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::format::fhm2d_structure_metadata::migrate_structure_json(
            Path::new(&structure_json_path),
            &name,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestTreeNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TestTreeNode>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderChangeOp {
    pub r#type: String,
    pub node: TestTreeNode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderChangePayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_tree: Option<Vec<TestTreeNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ops: Option<Vec<FolderChangeOp>>,
}

#[derive(Default)]
pub struct WatcherState {
    pub active: Mutex<Option<ActiveWatcher>>,
    pub suppress_count: Arc<AtomicUsize>,
    pub suppress_until: Arc<Mutex<Option<Instant>>>,
}

struct WatcherSuppressGuard {
    suppress_count: Arc<AtomicUsize>,
    suppress_until: Arc<Mutex<Option<Instant>>>,
}

impl WatcherSuppressGuard {
    fn new(suppress_count: Arc<AtomicUsize>, suppress_until: Arc<Mutex<Option<Instant>>>) -> Self {
        suppress_count.fetch_add(1, Ordering::Relaxed);
        Self {
            suppress_count,
            suppress_until,
        }
    }
}

impl Drop for WatcherSuppressGuard {
    fn drop(&mut self) {
        self.suppress_count.fetch_sub(1, Ordering::Relaxed);
        let _ = extend_watcher_suppression_until(
            self.suppress_until.as_ref(),
            Instant::now() + Duration::from_millis(1_500),
        );
    }
}

fn extend_watcher_suppression_until(
    suppress_until: &Mutex<Option<Instant>>,
    next_until: Instant,
) -> Result<(), String> {
    let mut suppress_until = suppress_until
        .lock()
        .map_err(|_| "Watcher suppression lock poisoned".to_string())?;
    if suppress_until
        .map(|current_until| current_until < next_until)
        .unwrap_or(true)
    {
        *suppress_until = Some(next_until);
    }
    Ok(())
}

fn watcher_is_suppressed(
    suppress_count: &AtomicUsize,
    suppress_until: &Mutex<Option<Instant>>,
) -> bool {
    if suppress_count.load(Ordering::Relaxed) > 0 {
        return true;
    }
    let Ok(mut suppress_until) = suppress_until.lock() else {
        return false;
    };
    if let Some(until) = *suppress_until {
        if Instant::now() < until {
            return true;
        }
        *suppress_until = None;
    }
    false
}

#[tauri::command]
pub fn suppress_test_editor_watcher(
    state: State<'_, WatcherState>,
    duration_ms: Option<u64>,
) -> Result<(), String> {
    let duration_ms = duration_ms.unwrap_or(8_000).clamp(500, 60_000);
    extend_watcher_suppression_until(
        state.suppress_until.as_ref(),
        Instant::now() + Duration::from_millis(duration_ms),
    )
}

pub struct ActiveWatcher {
    pub _watcher: RecommendedWatcher,
    pub stop: Arc<AtomicBool>,
    pub _handle: thread::JoinHandle<()>,
}

#[tauri::command]
pub async fn watch_folder(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<Vec<TestTreeNode>, String> {
    let path_buf = PathBuf::from(&path);
    let canonical = fs::canonicalize(&path_buf).map_err(|e| e.to_string())?;

    if !canonical.is_dir() {
        return Err("Provided path is not a directory".into());
    }

    let initial_tree = build_tree(&canonical)?;

    // stop previous watcher if any
    if let Some(existing) = state.active.lock().unwrap().take() {
        existing.stop.store(true, Ordering::Relaxed);
    }

    let (tx, rx) = channel();
    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_clone = stop_flag.clone();
    let app_handle = app.clone();
    let suppress_count = state.suppress_count.clone();
    let suppress_until = state.suppress_until.clone();

    let mut watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&canonical, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let canonical_for_loop = canonical.clone();
    let handle = thread::spawn(move || {
        watch_loop(
            app_handle,
            rx,
            stop_flag_clone,
            canonical_for_loop,
            suppress_count,
            suppress_until,
        )
    });

    let active = ActiveWatcher {
        _watcher: watcher,
        stop: stop_flag,
        _handle: handle,
    };

    *state.active.lock().unwrap() = Some(active);

    Ok(initial_tree)
}

fn watch_loop(
    app: AppHandle,
    rx: Receiver<notify::Result<Event>>,
    stop: Arc<AtomicBool>,
    root: PathBuf,
    suppress_count: Arc<AtomicUsize>,
    suppress_until: Arc<Mutex<Option<Instant>>>,
) {
    // Debounced full-tree rebuild: see `docs/test-editor-watcher-backend.md` for cost on huge workspaces.
    // Debounce window: emit a full tree rebuild this long after the last change.
    const DEBOUNCE_MS: u64 = 400;
    let mut last_change: Option<Instant> = None;

    loop {
        if stop.load(Ordering::Relaxed) {
            break;
        }

        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(Ok(event)) => {
                if watcher_is_suppressed(suppress_count.as_ref(), suppress_until.as_ref()) {
                    last_change = None;
                    continue;
                }
                // Emit incremental op immediately so dirty-folder tracking stays responsive.
                if let Some(payload) = convert_event(&event) {
                    let _ = app.emit("test-editor:folder-change", payload);
                    last_change = Some(Instant::now());
                }
            }
            Ok(Err(err)) => {
                eprintln!("watch error: {err}");
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                if watcher_is_suppressed(suppress_count.as_ref(), suppress_until.as_ref()) {
                    last_change = None;
                    continue;
                }
                // After the debounce window has elapsed without a new event, emit a
                // full tree so the frontend always ends up with an accurate view.
                if let Some(t) = last_change {
                    if t.elapsed() >= Duration::from_millis(DEBOUNCE_MS) {
                        last_change = None;
                        if let Ok(tree) = build_tree(&root) {
                            let _ = app.emit(
                                "test-editor:folder-change",
                                FolderChangePayload {
                                    full_tree: Some(tree),
                                    ops: None,
                                },
                            );
                        }
                    }
                }
            }
            Err(_) => break,
        }
    }
}

/// Paths containing "__convert" (file or folder name) are ignored from watch events.
const WATCH_IGNORE_PATTERNS: &[&str] = &["__convert"];

fn path_has_git_directory(path: &Path) -> bool {
    path.components().any(|component| {
        matches!(
            component,
            std::path::Component::Normal(name) if name == ".git"
        )
    })
}

fn should_ignore_path(path: &Path) -> bool {
    if path_has_git_directory(path) {
        return true;
    }
    let s = path.to_string_lossy();
    WATCH_IGNORE_PATTERNS.iter().any(|pat| s.contains(pat))
}

fn convert_event(event: &Event) -> Option<FolderChangePayload> {
    if event.paths.is_empty() {
        return None;
    }

    let mut ops: Vec<FolderChangeOp> = Vec::new();

    match &event.kind {
        EventKind::Create(_) => {
            for path in &event.paths {
                if should_ignore_path(path) {
                    continue;
                }
                if let Some(op) = make_op("add", path) {
                    ops.push(op);
                }
            }
        }
        EventKind::Modify(notify::event::ModifyKind::Name(notify::event::RenameMode::Both)) => {
            if event.paths.len() == 2 {
                let from = &event.paths[0];
                let to = &event.paths[1];
                if should_ignore_path(from) && should_ignore_path(to) {
                    // both ignored, skip entirely
                } else if !should_ignore_path(from) && !should_ignore_path(to) {
                    let from_parent = from.parent().map(to_id);
                    ops.push(FolderChangeOp {
                        r#type: "remove".into(),
                        node: TestTreeNode {
                            id: to_id(from),
                            name: file_name(from),
                            path: to_id(from),
                            is_dir: false,
                            mtime_ms: None,
                            size: None,
                            children: None,
                        },
                        parent_id: from_parent,
                    });
                    if let Some(op) = make_op("add", to) {
                        ops.push(op);
                    }
                } else if !should_ignore_path(from) {
                    let from_parent = from.parent().map(to_id);
                    ops.push(FolderChangeOp {
                        r#type: "remove".into(),
                        node: TestTreeNode {
                            id: to_id(from),
                            name: file_name(from),
                            path: to_id(from),
                            is_dir: false,
                            mtime_ms: None,
                            size: None,
                            children: None,
                        },
                        parent_id: from_parent,
                    });
                } else {
                    if let Some(op) = make_op("add", to) {
                        ops.push(op);
                    }
                }
            }
        }
        EventKind::Modify(_) => {
            for path in &event.paths {
                if should_ignore_path(path) {
                    continue;
                }
                if let Some(op) = make_op("modify", path) {
                    ops.push(op);
                }
            }
        }
        EventKind::Remove(remove_kind) => {
            let is_dir_hint = matches!(
                remove_kind,
                notify::event::RemoveKind::Folder | notify::event::RemoveKind::Other
            );
            for path in &event.paths {
                if should_ignore_path(path) {
                    continue;
                }
                let id = to_id(path);
                let parent_id = path.parent().map(to_id);
                ops.push(FolderChangeOp {
                    r#type: "remove".into(),
                    node: TestTreeNode {
                        id: id.clone(),
                        name: file_name(path),
                        path: id.clone(),
                        is_dir: is_dir_hint,
                        mtime_ms: None,
                        size: None,
                        children: None,
                    },
                    parent_id,
                });
            }
        }
        _ => {}
    }

    if ops.is_empty() {
        None
    } else {
        Some(FolderChangePayload {
            full_tree: None,
            ops: Some(ops),
        })
    }
}

fn make_op(kind: &str, path: &Path) -> Option<FolderChangeOp> {
    if should_ignore_path(path) {
        return None;
    }
    let meta = fs::metadata(path).ok()?;
    let is_dir = meta.is_dir();
    let mtime_ms = metadata_mtime_ms(&meta);
    let size = if is_dir { None } else { Some(meta.len()) };
    let id = to_id(path);
    let parent_id = path.parent().map(to_id);
    Some(FolderChangeOp {
        r#type: kind.to_string(),
        node: TestTreeNode {
            id: id.clone(),
            name: file_name(path),
            path: id.clone(),
            is_dir,
            mtime_ms,
            size,
            children: None,
        },
        parent_id,
    })
}

fn metadata_mtime_ms(meta: &fs::Metadata) -> Option<i64> {
    meta.modified().ok().and_then(|t| {
        t.duration_since(std::time::UNIX_EPOCH)
            .ok()
            .and_then(|d| i64::try_from(d.as_millis()).ok())
    })
}

fn build_tree(path: &Path) -> Result<Vec<TestTreeNode>, String> {
    let mut children: Vec<TestTreeNode> = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if should_ignore_path(&entry_path) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let is_dir = meta.is_dir();
        let mtime_ms = metadata_mtime_ms(&meta);
        let size = if is_dir { None } else { Some(meta.len()) };
        let mut node = TestTreeNode {
            id: to_id(&entry_path),
            name: file_name(&entry_path),
            path: to_id(&entry_path),
            is_dir,
            mtime_ms,
            size,
            children: None,
        };
        if is_dir {
            node.children = Some(build_tree(&entry_path)?);
        }
        children.push(node);
    }

    // Sort to mimic common explorer ordering: folders first, then files; case-insensitive name.
    children.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(children)
}

#[cfg(test)]
mod watcher_suppression_tests {
    use super::*;

    #[test]
    fn extend_watcher_suppression_until_keeps_longer_existing_lease() {
        let suppress_until = Mutex::new(Some(Instant::now() + Duration::from_millis(5_000)));
        let original_until = suppress_until.lock().unwrap().unwrap();

        extend_watcher_suppression_until(
            &suppress_until,
            Instant::now() + Duration::from_millis(100),
        )
        .unwrap();

        let actual_until = suppress_until.lock().unwrap().unwrap();
        assert!(actual_until >= original_until);
    }

    #[test]
    fn watcher_is_suppressed_clears_expired_lease() {
        let suppress_count = AtomicUsize::new(0);
        let suppress_until = Mutex::new(Some(Instant::now() - Duration::from_millis(1)));

        assert!(!watcher_is_suppressed(&suppress_count, &suppress_until));
        assert!(suppress_until.lock().unwrap().is_none());
    }

    #[test]
    fn should_ignore_path_skips_git_directory_but_not_gitignore() {
        assert!(should_ignore_path(Path::new(r"E:\workspace\.git\index")));
        assert!(should_ignore_path(Path::new(
            r"E:\workspace\002chara\0xBDBE6FEA\.git\HEAD"
        )));
        assert!(should_ignore_path(Path::new(r"E:\workspace\.git")));
        assert!(!should_ignore_path(Path::new(r"E:\workspace\.gitignore")));
        assert!(!should_ignore_path(Path::new(
            r"E:\workspace\002chara\0xBDBE6FEA\0.numdlb"
        )));
        assert!(should_ignore_path(Path::new(
            r"E:\workspace\__convert\temp.bin"
        )));
    }
}

fn to_id(path: &Path) -> String {
    normalize_path(path)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn normalize_path(path: &Path) -> String {
    let raw = path.to_string_lossy().into_owned();
    if raw.starts_with(r"\\?\") {
        raw.trim_start_matches(r"\\?\").to_string()
    } else {
        raw
    }
}

fn normalize_hash_hex(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.len() != 10 || !trimmed.starts_with("0x") {
        return Err(format!("Invalid hash format: {input}"));
    }
    let hex = &trimmed[2..];
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("Invalid hash format: {input}"));
    }
    Ok(format!("0x{}", hex.to_ascii_uppercase()))
}

fn crc32_ieee(bytes: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &b in bytes {
        crc ^= b as u32;
        for _ in 0..8 {
            if (crc & 1) != 0 {
                crc = (crc >> 1) ^ 0xEDB8_8320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), std::io::Error> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if metadata.is_file() {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

fn cleanup_artifacts(new_struct: &Path, new_folder: &Path) -> Result<(), String> {
    if new_struct.exists() {
        fs::remove_file(new_struct).map_err(|e| {
            format!(
                "Failed to clean up generated structure JSON {}: {}",
                new_struct.display(),
                e
            )
        })?;
    }
    if new_folder.exists() {
        fs::remove_dir_all(new_folder).map_err(|e| {
            format!(
                "Failed to clean up generated folder {}: {}",
                new_folder.display(),
                e
            )
        })?;
    }
    Ok(())
}

#[tauri::command]
pub fn parse_command_table_file(path: &str, file_type: &str) -> Result<Value, String> {
    let data = fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
    validate_command_table_file_type(&data, file_type)?;

    let parsed = read_param_binary(&data)?;
    let commands = parsed
        .field_specs
        .iter()
        .map(|spec| CommandDefinition {
            hash: spec.hash,
            entry_offset: spec.entry_offset,
            flags: spec.flags,
            kind: spec.kind,
        })
        .collect::<Vec<_>>();

    let mut entries = Vec::with_capacity(parsed.entries_raw.len());
    for (entry_index, raw) in parsed.entries_raw.iter().enumerate() {
        let mut fields = Vec::with_capacity(parsed.field_specs.len());
        for spec in &parsed.field_specs {
            let offset = spec.entry_offset as usize;
            if offset + 4 > raw.len() {
                return Err(format!(
                    "entry {} has out-of-range field offset 0x{:X}",
                    entry_index, spec.entry_offset
                ));
            }
            let bytes = [
                raw[offset],
                raw[offset + 1],
                raw[offset + 2],
                raw[offset + 3],
            ];
            let value_uint = u32::from_le_bytes(bytes);
            let value_int = i32::from_le_bytes(bytes);
            let value_float = f32::from_le_bytes(bytes);
            let value_hex = bytes
                .iter()
                .map(|b| format!("{:02x}", b))
                .collect::<Vec<_>>()
                .join("");

            let (field_int, field_uint, field_float, field_string) = match spec.kind {
                1 => (None, Some(value_uint), None, None),
                2 => (Some(value_int), None, None, None),
                5 => (None, None, Some(value_float), None),
                7 => (None, Some(value_uint), None, None),
                _ => (None, Some(value_uint), None, None),
            };

            fields.push(CommandFieldValue {
                hash: spec.hash,
                kind: spec.kind,
                offset: spec.entry_offset,
                value_int: field_int,
                value_uint: field_uint,
                value_float: field_float,
                value_string: field_string,
                value_hex,
            });
        }

        entries.push(ParsedEntry {
            entry_id: parsed.entry_ids.get(entry_index).copied().unwrap_or(0),
            entry_index: entry_index as u32,
            fields,
        });
    }

    let response = ParsedCommandTable {
        header: CommandTableHeader {
            magic: parsed.header.magic,
            unk_04: parsed.header.unk_04,
            file_size: parsed.header.file_size,
            unk_0c: parsed.header.unk_0c,
            entry_count: parsed.header.entry_count,
            commands_count: parsed.header.commands_count,
            entry_size: parsed.header.entry_size,
            unk_1c: parsed.header.unk_1c,
        },
        commands,
        entries,
        file_type: file_type.to_string(),
    };

    serde_json::to_value(response).map_err(|e| format!("Serialize failed: {e}"))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandTableBuildPayload {
    header: CommandTableHeader,
    commands: Vec<CommandDefinition>,
    entry_ids: Vec<u32>,
    entries_raw: Vec<Vec<u8>>,
    trailing_data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandTableHeader {
    magic: u32,
    unk_04: u32,
    file_size: u32,
    unk_0c: u32,
    entry_count: u32,
    commands_count: u32,
    entry_size: u32,
    unk_1c: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandDefinition {
    hash: u32,
    entry_offset: u32,
    flags: u32,
    kind: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandFieldValue {
    hash: u32,
    kind: u32,
    offset: u32,
    value_int: Option<i32>,
    value_uint: Option<u32>,
    value_float: Option<f32>,
    value_string: Option<String>,
    value_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParsedEntry {
    entry_id: u32,
    entry_index: u32,
    fields: Vec<CommandFieldValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParsedCommandTable {
    header: CommandTableHeader,
    commands: Vec<CommandDefinition>,
    entries: Vec<ParsedEntry>,
    file_type: String,
}

fn validate_command_table_file_type(data: &[u8], file_type: &str) -> Result<(), String> {
    match file_type {
        "armsparam" => {
            crate::format::armsparam::parse_armsparam(data)?;
        }
        "bulletparam" => {
            crate::format::bulletparam::parse_bulletparam(data)?;
        }
        "characterlist" => {
            crate::format::characterlist::parse_characterlist(data)?;
        }
        "bgmtable" => {
            crate::format::bgm_table::parse_bytes(data)?;
        }
        "bgmlist" | "bgm_list" => {
            crate::format::bgm_list::parse_bytes(data)?;
        }
        "serieslist" => {
            crate::format::serieslist::parse_serieslist(data)?;
        }
        "navilist" | "navi_list" => {
            crate::format::navilist::parse_navilist_data(data)?;
        }
        "stagelist" => {
            crate::format::stagelist::parse_stagelist(data)?;
        }
        "characterparam" => {
            crate::format::characterparam::parse_characterparam(data)?;
        }
        "grapparam" => {
            crate::format::grapparam::parse_grapparam(data)?;
        }
        "hitgroupiddef" => {
            crate::format::hitgroupiddef::parse_hitgroupiddef(data)?;
        }
        "interactionid" => {
            crate::format::interactionid::parse_interactionid(data)?;
        }
        "projectile_depiction_table" => {
            crate::format::projectile_depiction_table::parse_projectile_depiction_table(data)?;
        }
        "speedparam" => {
            crate::format::speedparam::parse_speedparam(data)?;
        }
        "effect_project" => {
            crate::format::effect_project::parse_effect_project(data)?;
        }
        "vernier_table" => {
            crate::format::vernier_table::parse_vernier_table(data)?;
        }
        _ => {
            return Err(format!("Unsupported command table type: {file_type}"));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn build_command_table_file(
    table_json: Value,
    output_path: &str,
    file_type: &str,
) -> Result<(), String> {
    let payload: CommandTableBuildPayload =
        serde_json::from_value(table_json).map_err(|e| format!("Deserialize failed: {e}"))?;

    if payload.entry_ids.len() != payload.entries_raw.len() {
        return Err("entry_ids and entries_raw length mismatch".to_string());
    }
    if payload.header.entry_size == 0 {
        return Err("header.entrySize must be greater than 0".to_string());
    }

    let mut header = ParamBinaryHeader {
        magic: payload.header.magic,
        unk_04: payload.header.unk_04,
        file_size: payload.header.file_size,
        unk_0c: payload.header.unk_0c,
        entry_count: payload.entry_ids.len() as u32,
        commands_count: payload.commands.len() as u32,
        entry_size: payload.header.entry_size,
        unk_1c: payload.header.unk_1c,
    };
    if header.magic == 0 {
        header.magic = crate::format::param_bin_format::PARAM_BIN_MAGIC;
    }

    for (i, raw) in payload.entries_raw.iter().enumerate() {
        if raw.len() > header.entry_size as usize {
            return Err(format!(
                "entry {} raw size {} is larger than entry_size {}",
                i,
                raw.len(),
                header.entry_size
            ));
        }
    }

    let field_specs = payload
        .commands
        .iter()
        .map(|cmd| ParamFieldSpec {
            hash: cmd.hash,
            entry_offset: cmd.entry_offset,
            flags: cmd.flags,
            kind: cmd.kind,
        })
        .collect::<Vec<_>>();

    let file = ParamBinaryFile {
        header,
        field_specs,
        entry_ids: payload.entry_ids,
        entries_raw: payload.entries_raw,
        trailing_data: payload.trailing_data,
    };
    let bytes = build_param_binary(&file)?;
    validate_command_table_file_type(&bytes, file_type)?;
    fs::write(output_path, &bytes).map_err(|e| format!("Write failed: {e}"))
}

#[tauri::command]
pub fn parse_typed_param_file(path: &str, param_type: &str) -> Result<Value, String> {
    let data = fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
    let v: Value = match param_type {
        "armsparam" => serde_json::to_value(crate::format::armsparam::parse_armsparam(&data)?),
        "bulletparam" => {
            serde_json::to_value(crate::format::bulletparam::parse_bulletparam(&data)?)
        }
        "characterlist" => {
            serde_json::to_value(crate::format::characterlist::parse_characterlist(&data)?)
        }
        "bgmtable" => {
            return crate::format::list_command_pool::list_data_to_json(
                &crate::format::bgm_table::parse_bytes(&data)?,
                crate::format::bgm_table::BGM_TABLE_COMMAND_POOL,
            );
        }
        "bgmlist" | "bgm_list" => {
            return crate::format::list_command_pool::list_data_to_json(
                &crate::format::bgm_list::parse_bytes(&data)?,
                crate::format::bgm_list::BGM_LIST_COMMAND_POOL,
            );
        }
        "serieslist" => {
            return crate::format::serieslist::parse_serieslist(&data);
        }
        "navilist" | "navi_list" => {
            return crate::format::navilist::parse_navilist(&data);
        }
        "stagelist" => {
            return crate::format::stagelist::parse_stagelist(&data);
        }
        "characterparam" => {
            serde_json::to_value(crate::format::characterparam::parse_characterparam(&data)?)
        }
        "grapparam" => serde_json::to_value(crate::format::grapparam::parse_grapparam(&data)?),
        "hitgroupiddef" => {
            serde_json::to_value(crate::format::hitgroupiddef::parse_hitgroupiddef(&data)?)
        }
        "interactionid" => {
            serde_json::to_value(crate::format::interactionid::parse_interactionid(&data)?)
        }
        "projectile_depiction_table" => serde_json::to_value(
            crate::format::projectile_depiction_table::parse_projectile_depiction_table(&data)?,
        ),
        "speedparam" => serde_json::to_value(crate::format::speedparam::parse_speedparam(&data)?),
        "effect_project" => {
            serde_json::to_value(crate::format::effect_project::parse_effect_project(&data)?)
        }
        "vernier_table" => {
            serde_json::to_value(crate::format::vernier_table::parse_vernier_table(&data)?)
        }
        _ => {
            return Err(format!(
                "Unknown param type: {param_type} (use typed param name, e.g. armsparam)"
            ));
        }
    }
    .map_err(|e| format!("Serialize failed: {e}"))?;
    Ok(v)
}

#[tauri::command]
pub fn build_typed_param_file(
    data_json: Value,
    output_path: &str,
    param_type: &str,
) -> Result<(), String> {
    let bytes: Vec<u8> = match param_type {
        "armsparam" => {
            let d: crate::format::armsparam::ArmsParamData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::armsparam::build_armsparam(&d)?
        }
        "bulletparam" => {
            let d: crate::format::bulletparam::BulletParamData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::bulletparam::build_bulletparam(&d)?
        }
        "characterlist" => {
            let d: crate::format::characterlist::CharacterListData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::characterlist::build_characterlist(&d)?
        }
        "bgmtable" => crate::format::bgm_table::build_sorted_bytes(&data_json)?,
        "bgmlist" | "bgm_list" => crate::format::bgm_list::build_sorted_bytes(&data_json)?,
        "serieslist" => crate::format::serieslist::build_serieslist(&data_json)?,
        "navilist" | "navi_list" => crate::format::navilist::build_navilist(&data_json)?,
        "stagelist" => crate::format::stagelist::build_stagelist(&data_json)?,
        "characterparam" => {
            let d: crate::format::characterparam::CharacterParamData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::characterparam::build_characterparam(&d)?
        }
        "grapparam" => {
            let d: crate::format::grapparam::GrapParamData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::grapparam::build_grapparam(&d)?
        }
        "hitgroupiddef" => {
            let d: crate::format::hitgroupiddef::HitGroupIdDefData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::hitgroupiddef::build_hitgroupiddef(&d)?
        }
        "interactionid" => {
            let d: crate::format::interactionid::InteractionIdData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::interactionid::build_interactionid(&d)?
        }
        "projectile_depiction_table" => {
            let d: crate::format::projectile_depiction_table::ProjectileDepictionTableData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::projectile_depiction_table::build_projectile_depiction_table(&d)?
        }
        "speedparam" => {
            let d: crate::format::speedparam::SpeedParamData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::speedparam::build_speedparam(&d)?
        }
        "effect_project" => {
            let d: crate::format::effect_project::EffectProjectData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::effect_project::build_effect_project(&d)?
        }
        "vernier_table" => {
            let d: crate::format::vernier_table::VernierTableData =
                serde_json::from_value(data_json).map_err(|e| e.to_string())?;
            crate::format::vernier_table::build_vernier_table(&d)?
        }
        _ => {
            return Err(format!("Unknown param type: {param_type}"));
        }
    };
    fs::write(output_path, &bytes).map_err(|e| format!("Write failed: {e}"))
}

#[tauri::command]
pub fn parse_chrsysparam_file(path: &str) -> Result<Value, String> {
    let data = fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
    let parsed = crate::format::chrsysparam::parse_chrsysparam(&data)?;
    serde_json::to_value(&parsed).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn build_chrsysparam_file(file_json: Value, output_path: &str) -> Result<(), String> {
    let file: crate::format::chrsysparam::ChrSysParamFile =
        serde_json::from_value(file_json).map_err(|e| format!("Deserialize failed: {e}"))?;
    let bytes = crate::format::chrsysparam::build_chrsysparam(&file)?;
    fs::write(output_path, &bytes).map_err(|e| format!("Write failed: {e}"))
}

#[tauri::command]
pub fn parse_shl_file(path: &str) -> Result<Value, String> {
    // A `shell_*.shl` is a legacy root control bin that is not part of the native Unit
    // folder layout: unpackers frequently deduplicate the shared shell across packages and
    // leave a dangling reference in this package's structure tree. Validation reports this as
    // a warning and repack skips it, so surface a clear, actionable message here instead of a
    // raw "os error 2" when the editor tries to open a shell that was never extracted.
    if !Path::new(path).is_file() {
        return Err(format!(
            "Shell control file not found on disk: {path}. This shell_*.shl is referenced by the \
             structure tree but is not present in this unit-model folder (legacy/shared shell files \
             can be deduplicated across packages and may not be extracted here), so it cannot be \
             opened for editing."
        ));
    }
    let data = fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
    let parsed = crate::format::shl::parse_shl(&data)?;
    serde_json::to_value(&parsed).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn build_shl_file(file_json: Value, output_path: &str) -> Result<(), String> {
    let file: crate::format::shl::ShlFile =
        serde_json::from_value(file_json).map_err(|e| format!("Deserialize failed: {e}"))?;
    let bytes = crate::format::shl::build_shl(&file)?;
    fs::write(output_path, &bytes).map_err(|e| format!("Write failed: {e}"))
}

#[tauri::command]
pub fn parse_raw_path_id_pack(folder_path: &str) -> Result<Value, String> {
    let parsed = crate::format::raw_path_id::parse_pack(folder_path)?;
    serde_json::to_value(&parsed).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn finalize_raw_path_id_entry(entry_json: Value) -> Result<Value, String> {
    let input: crate::format::raw_path_id::FinalizeRawPathIdInput =
        serde_json::from_value(entry_json).map_err(|e| format!("Deserialize failed: {e}"))?;
    let entry = crate::format::raw_path_id::finalize_entry(input)?;
    serde_json::to_value(&entry).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn derive_pilot_voice_source(voice_stem: &str) -> Result<Value, String> {
    let entry = crate::format::raw_path_id::derive_pilot_voice_entry(voice_stem)?;
    serde_json::to_value(&entry).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn build_raw_path_id_pack(
    data_json: Value,
    json_path: &str,
    vgsht1_path: &str,
) -> Result<Value, String> {
    let document: crate::format::raw_path_id::RawPathIdDocument =
        serde_json::from_value(data_json).map_err(|e| format!("Deserialize failed: {e}"))?;
    let written = crate::format::raw_path_id::write_pack(&document, json_path, vgsht1_path)?;
    serde_json::to_value(&written).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn parse_pilot_voice_resource_pack(folder_path: &str) -> Result<Value, String> {
    let parsed = crate::format::pilot_voice_resource::parse_pack(folder_path)?;
    serde_json::to_value(&parsed).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn finalize_pilot_voice_resource_entry(entry_json: Value) -> Result<Value, String> {
    let record: crate::format::pilot_voice_resource::PilotVoiceResourceRecord =
        serde_json::from_value(entry_json).map_err(|e| format!("Deserialize failed: {e}"))?;
    let next = crate::format::pilot_voice_resource::apply_stem_keys(&record)?;
    serde_json::to_value(&next).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn build_pilot_voice_resource_pack(data_json: Value, file_path: &str) -> Result<Value, String> {
    let table: crate::format::pilot_voice_resource::PilotVoiceResourceTable =
        serde_json::from_value(data_json).map_err(|e| format!("Deserialize failed: {e}"))?;
    let written = crate::format::pilot_voice_resource::write_pack(&table, file_path)?;
    serde_json::to_value(&written).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn parse_bgm_table_pack(folder_path: &str) -> Result<Value, String> {
    crate::format::bgm_table::parse_pack(folder_path)
}

#[tauri::command]
pub fn finalize_bgm_table_entry(entry_json: Value, table_json: Value) -> Result<Value, String> {
    crate::format::bgm_table::finalize_entry(&entry_json, &table_json)
}

#[tauri::command]
pub fn build_bgm_table_pack(data_json: Value, file_path: &str) -> Result<Value, String> {
    crate::format::bgm_table::write_pack(&data_json, file_path)
}

#[tauri::command]
pub fn parse_bgm_list_pack(folder_path: &str) -> Result<Value, String> {
    crate::format::bgm_list::parse_pack(folder_path)
}

#[tauri::command]
pub fn finalize_bgm_list_entry(entry_json: Value, table_json: Value) -> Result<Value, String> {
    crate::format::bgm_list::finalize_entry(&entry_json, &table_json)
}

#[tauri::command]
pub fn build_bgm_list_pack(data_json: Value, file_path: &str) -> Result<Value, String> {
    crate::format::bgm_list::write_pack(&data_json, file_path)
}

#[tauri::command]
pub fn bgm_table_group_assets(bank_group: u32) -> Result<Value, String> {
    let Some(assets) = crate::format::bgm_table::assets_for_bank_group(bank_group) else {
        return Err(format!(
            "No workspace assets registered for bank group {bank_group}"
        ));
    };
    Ok(serde_json::json!({
        "bankPackHash": assets.bank_pack_hash,
        "audioRelative": assets.audio_relative,
    }))
}

#[tauri::command]
pub fn parse_camera_table_file(path: &str) -> Result<Value, String> {
    crate::format::camera_table::parse_file(path)
}

#[tauri::command]
pub fn parse_camera_table_pack(folder_path: &str, family: &str) -> Result<Value, String> {
    crate::format::camera_table::parse_pack(folder_path, family)
}

#[tauri::command]
pub fn build_camera_table_file(data_json: Value, file_path: &str) -> Result<Value, String> {
    crate::format::camera_table::write_pack(&data_json, file_path)
}

#[tauri::command]
pub fn clone_fhm2d_pack(
    source_path: String,
    new_hash: u32,
    output_fhm2d_path: String,
) -> Result<Value, String> {
    let cloned = crate::format::gui_pack_clone::clone_gui_pack_extract(
        std::path::Path::new(&source_path),
        new_hash,
        std::path::Path::new(&output_fhm2d_path),
        None,
    )?;
    serde_json::to_value(&cloned).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub async fn clone_character_gui_set(
    request: crate::format::gui_pack_clone::CloneGuiSetRequest,
) -> Result<crate::format::gui_pack_clone::CloneGuiSetResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::format::gui_pack_clone::clone_character_gui_set(request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn list_workspace_gui_packs(
    workspace_root: String,
) -> Result<Vec<crate::format::gui_pack_clone::WorkspaceGuiPack>, String> {
    crate::format::gui_pack_clone::list_workspace_gui_packs(std::path::Path::new(&workspace_root))
}

#[tauri::command]
pub async fn extract_workspace_gui_pack(
    request: crate::format::gui_pack_clone::ExtractWorkspaceGuiPackRequest,
) -> Result<crate::format::gui_pack_clone::WorkspaceGuiPack, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::format::gui_pack_clone::extract_workspace_gui_pack(request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod file_copy_command_tests {
    use super::*;

    #[test]
    fn copy_file_to_path_creates_parent_directory() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.nuanmb");
        let target = temp.path().join("nested").join("target.nuanmb");
        fs::write(&source, b"motion").unwrap();

        copy_file_to_path_impl(&source, &target, false).unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"motion");
    }

    #[test]
    fn copy_file_to_path_rejects_existing_target_without_overwrite() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.nuanmb");
        let target = temp.path().join("target.nuanmb");
        fs::write(&source, b"new").unwrap();
        fs::write(&target, b"old").unwrap();

        let error = copy_file_to_path_impl(&source, &target, false).unwrap_err();

        assert!(error.contains("Target already exists"));
        assert_eq!(fs::read(&target).unwrap(), b"old");
    }

    #[test]
    fn copy_file_to_path_overwrites_existing_target_when_requested() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.nuanmb");
        let target = temp.path().join("target.nuanmb");
        fs::write(&source, b"new").unwrap();
        fs::write(&target, b"old").unwrap();

        copy_file_to_path_impl(&source, &target, true).unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"new");
    }
}

#[cfg(test)]
mod character_asset_command_tests {
    use super::*;

    fn seed_pack_pair(asset_root: &Path, hash_hex: &str) {
        let folder = asset_root.join(hash_hex);
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("asset.bin"), b"asset").unwrap();
        fs::write(
            asset_root.join(format!("{hash_hex}_structure.json")),
            format!(r#"{{"fileUrl":"{hash_hex}/asset.bin"}}"#),
        )
        .unwrap();
    }

    #[test]
    fn copy_asset_as_new_can_read_legacy_and_write_configured() {
        let legacy = tempfile::tempdir().unwrap();
        let configured = tempfile::tempdir().unwrap();
        seed_pack_pair(legacy.path(), "0xBDBE6FEA");

        let result = copy_asset_as_new_impl(
            &legacy.path().join("0xBDBE6FEA"),
            &legacy.path().join("0xBDBE6FEA_structure.json"),
            configured.path(),
            "0xBDBE6FEA",
            "custom_seed",
        )
        .unwrap();

        assert!(configured.path().join("custom_seed").is_dir());
        assert!(configured
            .path()
            .join("custom_seed_structure.json")
            .is_file());
        let structure_raw = fs::read_to_string(&result.new_structure_json_path).unwrap();
        let structure_value: Value = serde_json::from_str(&structure_raw).unwrap();
        assert_eq!(structure_value["Name"], "custom_seed");
        assert_eq!(structure_value["HashName"], result.new_hash_hex);
        assert!(!legacy.path().join(&result.new_hash_hex).exists());
    }

    #[test]
    fn copy_asset_as_new_reads_named_workspace_pack() {
        let source_root = tempfile::tempdir().unwrap();
        let destination_root = tempfile::tempdir().unwrap();
        let pack_name = "001gundam_005gyan00_001";
        let folder = source_root.path().join(pack_name);
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("asset.bin"), b"asset").unwrap();
        fs::write(
            source_root.path().join(format!("{pack_name}_structure.json")),
            format!(
                r#"{{"Name":"{pack_name}","HashName":"0xB802FAA1","SubFileData":[{{"fileUrl":".\\{pack_name}\\asset.bin"}}]}}"#
            ),
        )
        .unwrap();

        let result = copy_asset_as_new_impl(
            &folder,
            &source_root
                .path()
                .join(format!("{pack_name}_structure.json")),
            destination_root.path(),
            "0xB802FAA1",
            "001gundam_005gyan00_001_mod_n1_rocket",
        )
        .unwrap();

        assert!(destination_root
            .path()
            .join("001gundam_005gyan00_001_mod_n1_rocket")
            .is_dir());
        let structure_raw = fs::read_to_string(&result.new_structure_json_path).unwrap();
        let structure_value: Value = serde_json::from_str(&structure_raw).unwrap();
        assert_eq!(
            structure_value["Name"],
            "001gundam_005gyan00_001_mod_n1_rocket"
        );
        assert_eq!(structure_value["HashName"], result.new_hash_hex);
        assert_eq!(
            structure_value["SubFileData"][0]["fileUrl"],
            ".\\001gundam_005gyan00_001_mod_n1_rocket\\asset.bin"
        );
    }

    #[test]
    fn remove_asset_workspace_uses_resolved_asset_roots() {
        let workspace_asset_root = tempfile::tempdir().unwrap();
        let output_asset_root = tempfile::tempdir().unwrap();
        seed_pack_pair(workspace_asset_root.path(), "0xBDBE6FEA");
        seed_pack_pair(output_asset_root.path(), "0xBDBE6FEA");

        remove_asset_workspace_impl(
            "0xBDBE6FEA",
            RemoveAssetTargets {
                workspace_asset_root: Some(
                    workspace_asset_root.path().to_string_lossy().to_string(),
                ),
                extract_output_asset_root: Some(
                    output_asset_root.path().to_string_lossy().to_string(),
                ),
                mod_directory: None,
            },
        )
        .unwrap();

        assert!(!workspace_asset_root.path().join("0xBDBE6FEA").exists());
        assert!(!workspace_asset_root
            .path()
            .join("0xBDBE6FEA_structure.json")
            .exists());
        assert!(!output_asset_root.path().join("0xBDBE6FEA").exists());
        assert!(!output_asset_root
            .path()
            .join("0xBDBE6FEA_structure.json")
            .exists());
    }

    #[test]
    fn remove_asset_workspace_succeeds_when_one_selected_root_is_missing() {
        let workspace_asset_root = tempfile::tempdir().unwrap();
        let missing_output_asset_root = workspace_asset_root.path().join("missing-output-root");
        seed_pack_pair(workspace_asset_root.path(), "0xBDBE6FEA");

        remove_asset_workspace_impl(
            "0xBDBE6FEA",
            RemoveAssetTargets {
                workspace_asset_root: Some(
                    workspace_asset_root.path().to_string_lossy().to_string(),
                ),
                extract_output_asset_root: Some(
                    missing_output_asset_root.to_string_lossy().to_string(),
                ),
                mod_directory: None,
            },
        )
        .unwrap();

        assert!(!workspace_asset_root.path().join("0xBDBE6FEA").exists());
        assert!(!workspace_asset_root
            .path()
            .join("0xBDBE6FEA_structure.json")
            .exists());
    }

    #[test]
    fn move_legacy_workspace_content_moves_real_pack_pair_to_configured_route() {
        let workspace = tempfile::tempdir().unwrap();
        let legacy_root = workspace.path();
        let configured_root = workspace.path().join("012list");
        seed_pack_pair(legacy_root, "0x036B9E67");

        let result =
            move_legacy_workspace_content_impl(legacy_root, &configured_root, "0x036B9E67")
                .unwrap();

        assert!(!legacy_root.join("0x036B9E67").exists());
        assert!(!legacy_root.join("0x036B9E67_structure.json").exists());
        assert!(configured_root.join("0x036B9E67").is_dir());
        assert!(configured_root.join("0x036B9E67_structure.json").is_file());
        assert!(configured_root.join("0x036B9E67/asset.bin").is_file());
        assert_eq!(
            result.configured_folder_path,
            normalize_path(&configured_root.join("0x036B9E67"))
        );
    }

    #[test]
    fn move_legacy_workspace_content_moves_to_resolved_named_configured_paths() {
        let workspace = tempfile::tempdir().unwrap();
        let legacy_root = workspace.path();
        seed_pack_pair(legacy_root, "0xFF832E7F");

        let source_folder = legacy_root.join("0xFF832E7F");
        let source_struct = legacy_root.join("0xFF832E7F_structure.json");
        let configured_root = workspace.path().join("041cpm");
        let configured_folder = configured_root.join("for_outgame");
        let configured_struct = configured_root.join("for_outgame_structure.json");

        let result = move_legacy_workspace_content_paths_impl(
            &source_folder,
            &source_struct,
            &configured_folder,
            &configured_struct,
        )
        .unwrap();

        assert!(!source_folder.exists());
        assert!(!source_struct.exists());
        assert!(configured_folder.is_dir());
        assert!(configured_struct.is_file());
        assert!(configured_folder.join("asset.bin").is_file());
        assert_eq!(
            result.configured_folder_path,
            normalize_path(&configured_folder)
        );
        assert_eq!(
            result.configured_structure_json_path,
            normalize_path(&configured_struct)
        );
    }

    #[test]
    fn move_legacy_workspace_content_moves_all_fixed_content_packs_on_unicode_paths() {
        let workspace = tempfile::tempdir().unwrap();
        let legacy_root = workspace.path().join("解包").join("com").join("file");
        fs::create_dir_all(&legacy_root).unwrap();
        let content_routes = [
            ("0x036B9E67", "012list"),
            ("0xDFD38C70", "012list"),
            ("0xB7367090", "012list"),
            ("0xFF832E7F", "041cpm"),
            ("0x49235031", "009gui"),
            ("0xA0253AA0", "009gui"),
            ("0xCE74091E", "012list"),
            ("0x3CC8B10B", "009gui"),
            ("0x0CEE3991", "009gui"),
        ];

        for (hash_hex, _) in content_routes {
            seed_pack_pair(&legacy_root, hash_hex);
        }

        for (hash_hex, route_prefix) in content_routes {
            let configured_root = legacy_root.join(route_prefix);
            let result =
                move_legacy_workspace_content_impl(&legacy_root, &configured_root, hash_hex)
                    .unwrap();

            assert!(!legacy_root.join(hash_hex).exists());
            assert!(!legacy_root
                .join(format!("{hash_hex}_structure.json"))
                .exists());
            assert_eq!(
                fs::read(configured_root.join(hash_hex).join("asset.bin")).unwrap(),
                b"asset"
            );
            assert_eq!(
                fs::read_to_string(configured_root.join(format!("{hash_hex}_structure.json")))
                    .unwrap(),
                format!(r#"{{"fileUrl":"{hash_hex}/asset.bin"}}"#)
            );
            assert_eq!(
                result.configured_folder_path,
                normalize_path(&configured_root.join(hash_hex))
            );
        }
    }

    #[test]
    #[ignore = "requires TEST_EDITOR_LEGACY_FIXTURE_ROOT"]
    fn move_legacy_workspace_content_moves_copied_real_workspace_packs() {
        fn recursive_file_stats(root: &Path) -> (usize, u64) {
            let mut count = 0;
            let mut bytes = 0;
            for entry in fs::read_dir(root).unwrap() {
                let entry = entry.unwrap();
                let path = entry.path();
                if path.is_dir() {
                    let (child_count, child_bytes) = recursive_file_stats(&path);
                    count += child_count;
                    bytes += child_bytes;
                } else {
                    count += 1;
                    bytes += entry.metadata().unwrap().len();
                }
            }
            (count, bytes)
        }

        let fixture_root = PathBuf::from(
            std::env::var("TEST_EDITOR_LEGACY_FIXTURE_ROOT")
                .expect("TEST_EDITOR_LEGACY_FIXTURE_ROOT must point to a flat workspace root"),
        );
        let workspace = tempfile::tempdir().unwrap();
        let legacy_root = workspace.path().join("解包").join("com").join("file");
        fs::create_dir_all(&legacy_root).unwrap();
        let fixture_cases = [
            ("0xDFD38C70", "012list"),
            ("0xB7367090", "012list"),
            ("0xFF832E7F", "041cpm"),
            ("0xCE74091E", "012list"),
            ("0x3CC8B10B", "009gui"),
        ];

        for (hash_hex, route_prefix) in fixture_cases {
            let source_folder = fixture_root.join(hash_hex);
            let source_struct = fixture_root.join(format!("{hash_hex}_structure.json"));
            assert!(
                source_folder.is_dir() && source_struct.is_file(),
                "real fixture pair is missing for {hash_hex}"
            );

            let copied_folder = legacy_root.join(hash_hex);
            let copied_struct = legacy_root.join(format!("{hash_hex}_structure.json"));
            copy_dir_recursive(&source_folder, &copied_folder).unwrap();
            fs::copy(&source_struct, &copied_struct).unwrap();
            let expected_folder_stats = recursive_file_stats(&copied_folder);
            let expected_struct_bytes = fs::read(&copied_struct).unwrap();

            let configured_root = legacy_root.join(route_prefix);
            move_legacy_workspace_content_impl(&legacy_root, &configured_root, hash_hex).unwrap();

            assert_eq!(
                recursive_file_stats(&configured_root.join(hash_hex)),
                expected_folder_stats
            );
            assert_eq!(
                fs::read(configured_root.join(format!("{hash_hex}_structure.json"))).unwrap(),
                expected_struct_bytes
            );
            assert!(source_folder.is_dir());
            assert!(source_struct.is_file());
        }
    }

    #[test]
    fn move_legacy_workspace_content_rejects_existing_configured_target() {
        let workspace = tempfile::tempdir().unwrap();
        let legacy_root = workspace.path();
        let configured_root = workspace.path().join("012list");
        seed_pack_pair(legacy_root, "0x036B9E67");
        seed_pack_pair(&configured_root, "0x036B9E67");

        let err = move_legacy_workspace_content_impl(legacy_root, &configured_root, "0x036B9E67")
            .expect_err("existing configured target must block migration");

        assert!(
            err.contains("Configured pack folder already exists"),
            "unexpected error: {err}"
        );
        assert!(legacy_root.join("0x036B9E67").is_dir());
        assert!(legacy_root.join("0x036B9E67_structure.json").is_file());
        assert!(configured_root.join("0x036B9E67").is_dir());
        assert!(configured_root.join("0x036B9E67_structure.json").is_file());
    }
}

#[cfg(test)]
mod shl_command_tests {
    use super::*;
    use crate::format::shl::{ShlFile, ShlRecord};

    #[test]
    fn parse_shl_file_reports_missing_shell_clearly() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("shell_missing.shl");
        let path = missing.to_string_lossy().to_string();

        let err = parse_shl_file(&path).expect_err("missing shell must fail");

        // Actionable message, not the raw OS "file not found" surfaced to the editor.
        assert!(
            err.contains("not found on disk"),
            "unexpected message: {err}"
        );
        assert!(err.contains(&path), "message must name the path: {err}");
        assert!(
            !err.to_ascii_lowercase().contains("os error"),
            "must not leak the raw OS error: {err}"
        );
    }

    #[test]
    fn parse_shl_file_parses_an_existing_shell() {
        let dir = tempfile::tempdir().unwrap();
        let shl_path = dir.path().join("shell_sample.shl");
        let bytes = crate::format::shl::build_shl(&ShlFile {
            version: 0x64,
            reserved08: 0,
            records: vec![ShlRecord {
                model_id: 0x1234_5678,
                model_type: 0,
                folder_index: 2,
                unk1: 0,
                slot_index: 1,
            }],
            trailing_data: Vec::new(),
            source_records_raw: Vec::new(),
        })
        .unwrap();
        fs::write(&shl_path, &bytes).unwrap();

        let value = parse_shl_file(&shl_path.to_string_lossy()).expect("valid shell must parse");
        let record = &value["records"][0];
        assert_eq!(record["modelId"].as_u64(), Some(0x1234_5678));
        assert_eq!(record["folderIndex"].as_u64(), Some(2));
        assert_eq!(record["slotIndex"].as_u64(), Some(1));
    }
}
