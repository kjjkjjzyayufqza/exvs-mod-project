use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use encoding_rs::GBK;
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
    ipc::{InvokeBody, Response},
    AppHandle, Emitter, State,
};

#[tauri::command]
pub fn my_custom_command() {
    println!("I was invoked from JS!");
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
pub fn nutexb_preview_file_identity(path: String) -> Result<crate::nutexb_lib::NutexbPreviewFileIdentity, String> {
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

/// Returns raw PNG bytes via IPC [`InvokeBody::Raw`] (no base64); prefer for large textures vs [`nutexb_png_base64`].
#[tauri::command]
pub fn nutexb_png_bytes(input_path: String) -> Result<Response, String> {
    let bytes = crate::nutexb_lib::nutexb_to_png_bytes(&input_path)?;
    Ok(Response::new(InvokeBody::Raw(bytes)))
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
        return Err(format!(
            "files.len() must be <= {MAX_FILES_PER_INVOKE}"
        ));
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

#[tauri::command]
pub async fn copy_asset_as_new(
    project_root_dir: String,
    old_hash_hex: String,
    seed: String,
    _field_key: String,
) -> Result<CopyAssetAsNewResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(project_root_dir);
        if !root.is_dir() {
            return Err("Project root directory does not exist".to_string());
        }

        let normalized_old_hash = normalize_hash_hex(&old_hash_hex)?;
        let new_crc_u32 = crc32_ieee(seed.as_bytes());
        let new_hash_hex = format!("0x{:08X}", new_crc_u32);
        let new_raw_value = new_crc_u32 as i32;

        if new_hash_hex.eq_ignore_ascii_case(&normalized_old_hash) {
            return Err("Computed hash equals the source hash; use a different seed".to_string());
        }

        let old_folder = root.join(&normalized_old_hash);
        let old_struct = root.join(format!("{normalized_old_hash}_structure.json"));
        let new_folder = root.join(&new_hash_hex);
        let new_struct = root.join(format!("{new_hash_hex}_structure.json"));

        if !old_folder.is_dir() {
            return Err(format!("Source folder not found: {}", old_folder.display()));
        }
        if !old_struct.is_file() {
            return Err(format!("Source structure JSON not found: {}", old_struct.display()));
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
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveAssetTargets {
    pub workspace_root: Option<String>,
    pub extract_output_root: Option<String>,
    pub mod_directory: Option<String>,
}

fn remove_asset_hash_folder_pair(root: &Path, normalized_hash: &str) -> Result<bool, String> {
    let asset_folder = root.join(normalized_hash);
    let struct_json = root.join(format!("{normalized_hash}_structure.json"));
    let mut did_any = false;
    if asset_folder.is_dir() {
        fs::remove_dir_all(&asset_folder).map_err(|e| {
            format!(
                "Failed to remove folder {}: {}",
                asset_folder.display(),
                e
            )
        })?;
        did_any = true;
    }
    if struct_json.is_file() {
        fs::remove_file(&struct_json).map_err(|e| {
            format!("Failed to remove {}: {}", struct_json.display(), e)
        })?;
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

#[tauri::command]
pub async fn remove_asset_workspace(hash_hex: String, targets: RemoveAssetTargets) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let normalized = normalize_hash_hex(&hash_hex)?;

        let mut root_paths: Vec<PathBuf> = Vec::new();
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for opt in [&targets.workspace_root, &targets.extract_output_root] {
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

        for root in &root_paths {
            if !root.is_dir() {
                return Err(format!("Directory does not exist: {}", root.display()));
            }
            if !remove_asset_hash_folder_pair(root, &normalized)? {
                return Err(format!(
                    "Nothing to remove under {} for {}",
                    root.display(),
                    normalized
                ));
            }
        }

        if let Some(mod_s) = mod_trimmed {
            let mod_dir = PathBuf::from(mod_s);
            if !mod_dir.is_dir() {
                return Err(format!("Mod directory does not exist: {}", mod_dir.display()));
            }
            if !remove_mod_fhm2d_file(&mod_dir, &normalized)? {
                return Err(format!(
                    "Packaged .fhm2d not found under {} for {}",
                    mod_dir.display(),
                    normalized
                ));
            }
        }

        Ok(())
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
    let handle = thread::spawn(move || watch_loop(app_handle, rx, stop_flag_clone, canonical_for_loop));

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
                        let replaced =
                            replace_ascii_case_insensitive(original.as_str(), old_hash_hex, new_hash_hex);
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
