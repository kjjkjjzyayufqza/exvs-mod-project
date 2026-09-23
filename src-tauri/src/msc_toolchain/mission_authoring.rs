//! Mission source compilation and guarded, atomic source-file editing.

use super::{
    binary, compile_mission_in_process, mission_round_trip_status, MissionRoundTripStatus,
};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Mutex;

const MAX_SOURCE_BYTES: usize = 512 * 1024;
static SOURCE_WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn compile_authoring_source(source: &str) -> Result<Vec<u8>, String> {
    if source.len() > 512 * 1024 {
        return Err("Mission source exceeds 512 KiB".into());
    }
    let bytes = compile_mission_in_process(source.trim_start_matches('\u{feff}'))?;
    let parsed = binary::parse_msc(&bytes)?;
    if parsed.unk != 25 || parsed.scripts.len() != 36 {
        return Err("Source does not match the embedded OBHK mission layout".into());
    }
    // The template's two sys_0(0x802, offset, ...) calls contain literal code
    // offsets. Refuse layout drift before offering a binary for export.
    for (name, expected) in [("func_20", 0x97d), ("func_15", 0x9de)] {
        let actual = parsed
            .scripts
            .iter()
            .find(|script| script.name == name)
            .map(|script| script.start);
        if actual != Some(expected) {
            return Err(format!(
                "{name} coroutine address drift: expected {expected:#x}, got {actual:?}"
            ));
        }
    }
    match mission_round_trip_status(&bytes)? {
        MissionRoundTripStatus::Identical => Ok(bytes),
        status => Err(format!(
            "Mission round-trip guard refused this source: {status:?}"
        )),
    }
}

fn check_source_path(path: &Path) -> Result<(), String> {
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("c"))
    {
        return Err("Choose a .c mission source file".into());
    }
    if std::fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink()) {
        return Err("Open the actual mission source file instead of a symbolic link".into());
    }
    Ok(())
}

pub fn read_source_file(path: &Path) -> Result<String, String> {
    check_source_path(path)?;
    let file =
        std::fs::File::open(path).map_err(|error| format!("Read mission source: {error}"))?;
    if !file
        .metadata()
        .map_err(|error| error.to_string())?
        .is_file()
    {
        return Err("Choose a regular .c file".into());
    }
    let mut bytes = Vec::new();
    file.take((MAX_SOURCE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Read mission source: {error}"))?;
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err("Mission source exceeds 512 KiB".into());
    }
    String::from_utf8(bytes).map_err(|_| "Mission source must be UTF-8".into())
}

fn check_snapshot(path: &Path, expected: Option<&str>) -> Result<(), String> {
    match expected {
        Some(text) => {
            if read_source_file(path).ok().as_deref() != Some(text) {
                return Err("Mission source changed outside the editor or was removed. Reopen it or Save as a different file.".into());
            }
        }
        None => match std::fs::symlink_metadata(path) {
            Ok(_) => return Err("Destination already exists. Reopen it before saving.".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        },
    }
    Ok(())
}

/// Snapshot comparison and compilation complete before any destination write.
/// Same-directory replacement prevents a failed write from truncating the source.
pub fn save_source_file(path: &Path, expected: Option<&str>, source: &str) -> Result<(), String> {
    let _guard = SOURCE_WRITE_LOCK
        .lock()
        .map_err(|error| error.to_string())?;
    check_source_path(path)?;
    check_snapshot(path, expected)?;
    compile_authoring_source(source)?;
    if expected == Some(source) {
        return Ok(());
    }
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("Prepare mission save: {error}"))?;
    temporary
        .write_all(source.as_bytes())
        .map_err(|error| format!("Write mission source: {error}"))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("Flush mission source: {error}"))?;
    if expected.is_some() {
        let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
        if metadata.permissions().readonly() {
            return Err("Mission source is read-only".into());
        }
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|error| error.to_string())?;
    }
    check_snapshot(path, expected)?;
    if expected.is_some() {
        temporary
            .persist(path)
            .map_err(|error| format!("Replace mission source: {}", error.error))?;
    } else {
        temporary
            .persist_noclobber(path)
            .map_err(|error| format!("Create mission source: {}", error.error))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn read_mission_source(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_source_file(Path::new(&path)))
        .await
        .map_err(|error| format!("Mission read task failed: {error}"))?
}

#[tauri::command]
pub async fn save_mission_source(
    path: String,
    expected: Option<String>,
    source: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        save_source_file(Path::new(&path), expected.as_deref(), &source)
    })
    .await
    .map_err(|error| format!("Mission save task failed: {error}"))?
}

#[tauri::command]
pub async fn compile_mission_authoring(source: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || compile_authoring_source(&source))
        .await
        .map_err(|error| format!("Mission compilation task failed: {error}"))?
}
