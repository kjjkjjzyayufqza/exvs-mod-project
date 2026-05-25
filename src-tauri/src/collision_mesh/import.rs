use std::path::Path;

use crate::ssbh_dae::{parse_dae_file, parse_fbx_file, ImportScene};

/// Load DAE or FBX bytes via a temp file (parsers are path-based today).
pub fn parse_import_scene_from_bytes(name: &str, bytes: &[u8]) -> Result<ImportScene, String> {
    let ext = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let temp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let file_name = if ext.is_empty() {
        "input.dae".to_string()
    } else {
        format!("input.{ext}")
    };
    let path = temp_dir.path().join(&file_name);
    std::fs::write(&path, bytes).map_err(|e| format!("Failed to write temp import file: {e}"))?;

    match ext.as_str() {
        "fbx" => parse_fbx_file(&path).map_err(|e| e.to_string()),
        "dae" | "" => parse_dae_file(&path).map_err(|e| e.to_string()),
        other => Err(format!(
            "Unsupported import format for HKT collision: .{other} (use .dae or .fbx)"
        )),
    }
}
