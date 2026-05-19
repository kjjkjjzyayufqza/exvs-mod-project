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
    _dae_bytes: &[u8],
    _config_profile: &str,
    _havok_config: &HavokCliConfig,
) -> Result<Vec<u8>, String> {
    // Havok Content Tools (FileConvert.exe, hctStandAloneFilterManager.exe) cannot
    // load DAE files directly. They only support Havok-native formats (.hkx, .hkt,
    // XML tagfile/packfile). DAE→HKT conversion requires the Havok 3ds Max/Maya
    // exporter plugin, which is not available as a CLI tool.
    Err("HKT generation from DAE is not supported: Havok Content Tools cannot load DAE files directly. \
         Use a DCC tool (3ds Max/Maya) with the Havok exporter plugin to produce HKT files.".to_string())
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
