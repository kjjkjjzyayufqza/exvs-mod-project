use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HavokCliConfig {
    pub file_convert_path: String,
    pub filter_manager_path: String,
    pub config_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HavokInstallInfo {
    pub version: String,
    pub file_convert_available: bool,
    pub filter_manager_available: bool,
    pub config_profiles: Vec<String>,
}

impl HavokCliConfig {
    pub fn detect() -> Option<Self> {
        let base = r"C:\Program Files\Havok\HavokContentTools";
        if !Path::new(base).exists() {
            return None;
        }
        Some(Self {
            file_convert_path: format!(r"{base}\FileConvert\bin\windows\FileConvert.exe"),
            filter_manager_path: format!(r"{base}\hctStandAloneFilterManager.exe"),
            config_dir: format!(r"{base}\configurations"),
        })
    }
}

pub fn list_hko_configs(config_dir: &str) -> Vec<String> {
    let mut profiles = Vec::new();
    let config_path = Path::new(config_dir);
    if !config_path.is_dir() {
        return profiles;
    }
    collect_hko_files(config_path, config_path, &mut profiles);
    profiles.sort();
    profiles
}

fn collect_hko_files(base: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_hko_files(base, &path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("hko") {
            if let Ok(relative) = path.strip_prefix(base) {
                out.push(relative.to_string_lossy().to_string());
            }
        }
    }
}

pub fn generate_hkt_from_dae(
    dae_bytes: &[u8],
    config_profile: &str,
    havok_config: &HavokCliConfig,
) -> Result<Vec<u8>, String> {
    let temp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let input_path = temp_dir.path().join("input.dae");
    let output_path = temp_dir.path().join("output.hkt");

    std::fs::write(&input_path, dae_bytes)
        .map_err(|e| format!("Failed to write temp DAE: {e}"))?;

    let config_path = format!(r"{}\{}", havok_config.config_dir, config_profile);

    let output = std::process::Command::new(&havok_config.file_convert_path)
        .arg("-i")
        .arg(&input_path)
        .arg("-o")
        .arg(&output_path)
        .arg("-c")
        .arg(&config_path)
        .output()
        .map_err(|e| format!("Failed to run FileConvert.exe: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "FileConvert exited with code {:?}: {}",
            output.status.code(),
            stderr
        ));
    }

    if !output_path.exists() {
        return Err("FileConvert did not produce output file".to_string());
    }

    std::fs::read(&output_path).map_err(|e| format!("Failed to read HKT output: {e}"))
}

#[tauri::command]
pub fn detect_havok_installation() -> Option<HavokInstallInfo> {
    HavokCliConfig::detect().map(|config| {
        let profiles = list_hko_configs(&config.config_dir);
        HavokInstallInfo {
            version: "2018-1-0".to_string(),
            file_convert_available: Path::new(&config.file_convert_path).exists(),
            filter_manager_available: Path::new(&config.filter_manager_path).exists(),
            config_profiles: profiles,
        }
    })
}
