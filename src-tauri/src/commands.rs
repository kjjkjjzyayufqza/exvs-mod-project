use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};
use encoding_rs::GBK;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
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
    let parsed_format = crate::format::fhm2d::Fhm2dFormat::from_opt_str(format.as_deref())?;
    let write_meta = write_meta_bin.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        crate::format::fhm2d::extract_fhm2d_to_folder_impl(
            source_path.as_str(),
            out_dir.as_str(),
            parsed_format,
            list_output_file_name,
            write_meta,
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
    source_asset_root_dir: &Path,
    destination_asset_root_dir: &Path,
    old_hash_hex: &str,
    seed: &str,
) -> Result<CopyAssetAsNewResult, String> {
    if !source_asset_root_dir.is_dir() {
        return Err(format!(
            "Source asset root directory does not exist: {}",
            source_asset_root_dir.display()
        ));
    }
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

    if new_hash_hex.eq_ignore_ascii_case(&normalized_old_hash) {
        return Err("Computed hash equals the source hash; use a different seed".to_string());
    }

    let old_folder = source_asset_root_dir.join(&normalized_old_hash);
    let old_struct = source_asset_root_dir.join(format!("{normalized_old_hash}_structure.json"));
    let new_folder = destination_asset_root_dir.join(&new_hash_hex);
    let new_struct = destination_asset_root_dir.join(format!("{new_hash_hex}_structure.json"));

    if !old_folder.is_dir() {
        return Err(format!("Source folder not found: {}", old_folder.display()));
    }
    if !old_struct.is_file() {
        return Err(format!(
            "Source structure JSON not found: {}",
            old_struct.display()
        ));
    }
    if new_folder.exists() || new_struct.exists() {
        return Err(format!("Target already exists: {}", new_hash_hex));
    }

    let old_struct_text = fs::read_to_string(&old_struct).map_err(|e| {
        format!(
            "Failed to read source structure JSON {}: {}",
            old_struct.display(),
            e
        )
    })?;
    let mut struct_value: Value = serde_json::from_str(&old_struct_text).map_err(|e| {
        format!(
            "Failed to parse source structure JSON {}: {}",
            old_struct.display(),
            e
        )
    })?;

    let mut updated_file_url_count = 0usize;
    replace_file_url_hash(
        &mut struct_value,
        &normalized_old_hash,
        &new_hash_hex,
        &mut updated_file_url_count,
    );

    let serialized = serde_json::to_string_pretty(&struct_value)
        .map_err(|e| format!("Failed to serialize new structure JSON: {e}"))?;
    fs::write(&new_struct, serialized).map_err(|e| {
        format!(
            "Failed to write new structure JSON {}: {}",
            new_struct.display(),
            e
        )
    })?;

    if let Err(copy_err) = copy_dir_recursive(&old_folder, &new_folder) {
        let _ = cleanup_artifacts(&new_struct, &new_folder);
        return Err(format!(
            "Failed to copy source folder {} -> {}: {}",
            old_folder.display(),
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
    source_asset_root_dir: String,
    destination_asset_root_dir: String,
    old_hash_hex: String,
    seed: String,
    _field_key: String,
) -> Result<CopyAssetAsNewResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        copy_asset_as_new_impl(
            &PathBuf::from(source_asset_root_dir),
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
    let handle =
        thread::spawn(move || watch_loop(app_handle, rx, stop_flag_clone, canonical_for_loop));

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

fn should_ignore_path(path: &Path) -> bool {
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

fn replace_file_url_hash(
    value: &mut Value,
    old_hash_hex: &str,
    new_hash_hex: &str,
    updated_count: &mut usize,
) {
    match value {
        Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                if key == "fileUrl" {
                    if let Value::String(original) = child {
                        let replaced = replace_ascii_case_insensitive(
                            original.as_str(),
                            old_hash_hex,
                            new_hash_hex,
                        );
                        if replaced != *original {
                            *original = replaced;
                            *updated_count += 1;
                        }
                    }
                } else {
                    replace_file_url_hash(child, old_hash_hex, new_hash_hex, updated_count);
                }
            }
        }
        Value::Array(items) => {
            for child in items.iter_mut() {
                replace_file_url_hash(child, old_hash_hex, new_hash_hex, updated_count);
            }
        }
        _ => {}
    }
}

fn replace_ascii_case_insensitive(input: &str, from: &str, to: &str) -> String {
    let input_lower = input.to_ascii_lowercase();
    let from_lower = from.to_ascii_lowercase();
    if from_lower.is_empty() {
        return input.to_string();
    }

    let mut result = String::with_capacity(input.len());
    let mut cursor = 0usize;

    while let Some(rel_idx) = input_lower[cursor..].find(&from_lower) {
        let start = cursor + rel_idx;
        let end = start + from_lower.len();
        result.push_str(&input[cursor..start]);
        result.push_str(to);
        cursor = end;
    }

    result.push_str(&input[cursor..]);
    result
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
        "serieslist" => {
            crate::format::serieslist::parse_serieslist(data)?;
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
        "serieslist" => {
            return crate::format::serieslist::parse_serieslist(&data);
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
        "serieslist" => crate::format::serieslist::build_serieslist(&data_json)?,
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
            legacy.path(),
            configured.path(),
            "0xBDBE6FEA",
            "custom_seed",
        )
        .unwrap();

        assert!(configured.path().join(&result.new_hash_hex).is_dir());
        assert!(configured
            .path()
            .join(format!("{}_structure.json", result.new_hash_hex))
            .is_file());
        assert!(!legacy.path().join(&result.new_hash_hex).exists());
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
