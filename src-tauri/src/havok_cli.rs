use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

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

const HKO_WRITE_XML: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<hkoptions>
	<hkobject class="hctConfigurationSetData">
		<hkparam name="filterManagerVersion">65537</hkparam>
		<hkparam name="activeConfiguration">0</hkparam>
	</hkobject>
	<hkobject class="hctConfigurationData">
		<hkparam name="configurationName">HKT2XML</hkparam>
		<hkparam name="numFilters">1</hkparam>
	</hkobject>
	<hkobject name="Write to Platform" class="hctFilterData">
		<hkparam name="id">2876798309</hkparam>
		<hkparam name="ver">66049</hkparam>
		<hkparam name="hasOptions">true</hkparam>
	</hkobject>
	<hkobject name="Write to Platform" class="hctPlatformWriterOptions">
		<hkparam name="filename"></hkparam>
		<hkparam name="tagfile">true</hkparam>
		<hkparam name="bytesInPointer">8</hkparam>
		<hkparam name="littleEndian">true</hkparam>
		<hkparam name="reusePaddingOptimized">false</hkparam>
		<hkparam name="emptyBaseClassOptimized">false</hkparam>
		<hkparam name="removeMetadata">false</hkparam>
		<hkparam name="userTag">0</hkparam>
		<hkparam name="saveEnvironmentData">true</hkparam>
		<hkparam name="xmlFormat">true</hkparam>
	</hkobject>
</hkoptions>"#;

const HKO_WRITE_HKT: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<hkoptions>
	<hkobject class="hctConfigurationSetData">
		<hkparam name="filterManagerVersion">65537</hkparam>
		<hkparam name="activeConfiguration">0</hkparam>
	</hkobject>
	<hkobject class="hctConfigurationData">
		<hkparam name="configurationName">XML2HKT</hkparam>
		<hkparam name="numFilters">1</hkparam>
	</hkobject>
	<hkobject name="Write to Platform" class="hctFilterData">
		<hkparam name="id">2876798309</hkparam>
		<hkparam name="ver">66049</hkparam>
		<hkparam name="hasOptions">true</hkparam>
	</hkobject>
	<hkobject name="Write to Platform" class="hctPlatformWriterOptions">
		<hkparam name="filename"></hkparam>
		<hkparam name="tagfile">true</hkparam>
		<hkparam name="bytesInPointer">8</hkparam>
		<hkparam name="littleEndian">true</hkparam>
		<hkparam name="reusePaddingOptimized">false</hkparam>
		<hkparam name="emptyBaseClassOptimized">false</hkparam>
		<hkparam name="removeMetadata">false</hkparam>
		<hkparam name="userTag">0</hkparam>
		<hkparam name="saveEnvironmentData">true</hkparam>
		<hkparam name="xmlFormat">false</hkparam>
	</hkobject>
</hkoptions>"#;

fn run_filter_manager(
    filter_manager_exe: &str,
    hko_content: &str,
    input_path: &Path,
    output_path: &Path,
) -> Result<(), String> {
    let temp_dir = std::env::temp_dir().join(format!("havok_convert_{}", std::process::id()));
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {e}"))?;

    let hko_path = temp_dir.join("settings.hko");
    std::fs::write(&hko_path, hko_content)
        .map_err(|e| format!("Failed to write .hko config: {e}"))?;

    let result = Command::new(filter_manager_exe)
        .current_dir(&temp_dir)
        .arg("-s")
        .arg(&hko_path)
        .arg("-p")
        .arg(format!("{}\\", temp_dir.display()))
        .arg("-o")
        .arg(format!("{}\\", temp_dir.display()))
        .arg(input_path.as_os_str())
        .output()
        .map_err(|e| format!("Failed to run hctStandAloneFilterManager: {e}"))?;

    let stdout = String::from_utf8_lossy(&result.stdout);

    let generated: Vec<PathBuf> = std::fs::read_dir(&temp_dir)
        .map_err(|e| format!("Failed to read temp dir: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
            (ext == "hkx" || ext == "hkt" || ext == "xml")
                && p.file_name().map(|n| n != "settings.hko").unwrap_or(false)
        })
        .collect();

    let cleanup = || {
        let _ = std::fs::remove_dir_all(&temp_dir);
    };

    if generated.is_empty() {
        let err_detail = if stdout.contains("Warning") || stdout.contains("Error") {
            stdout.to_string()
        } else {
            format!("No output file produced. Exit code: {}", result.status)
        };
        cleanup();
        return Err(format!("Havok conversion failed: {err_detail}"));
    }

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;
    }

    std::fs::copy(&generated[0], output_path).map_err(|e| {
        cleanup();
        format!("Failed to copy output file: {e}")
    })?;

    cleanup();
    Ok(())
}

/// Convert HKT bytes to XML string in memory (writes to temp, reads back).
pub fn convert_hkt_bytes_to_xml(
    filter_manager_exe: &str,
    hkt_bytes: &[u8],
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join(format!("havok_mem_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {e}"))?;

    let input_path = temp_dir.join("input.hkt");
    std::fs::write(&input_path, hkt_bytes)
        .map_err(|e| format!("Failed to write temp HKT: {e}"))?;

    let output_path = temp_dir.join("output.xml");
    let result = run_filter_manager(filter_manager_exe, HKO_WRITE_XML, &input_path, &output_path);

    let cleanup = || {
        let _ = std::fs::remove_dir_all(&temp_dir);
    };

    match result {
        Ok(()) => {
            let xml = std::fs::read_to_string(&output_path)
                .map_err(|e| format!("Failed to read output XML: {e}"))?;
            cleanup();
            Ok(xml)
        }
        Err(e) => {
            cleanup();
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn convert_hkt_to_xml(input_path: String, output_path: String) -> Result<String, String> {
    let config = HavokCliConfig::detect()
        .ok_or("Havok Content Tools not found")?;

    if !Path::new(&config.filter_manager_path).exists() {
        return Err("hctStandAloneFilterManager.exe not found".to_string());
    }

    let input = PathBuf::from(&input_path);
    if !input.exists() {
        return Err(format!("Input file not found: {input_path}"));
    }

    let output = PathBuf::from(&output_path);
    tauri::async_runtime::spawn_blocking(move || {
        run_filter_manager(
            &config.filter_manager_path,
            HKO_WRITE_XML,
            &input,
            &output,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    Ok(output_path)
}

#[tauri::command]
pub async fn convert_xml_to_hkt(input_path: String, output_path: String) -> Result<String, String> {
    let config = HavokCliConfig::detect()
        .ok_or("Havok Content Tools not found")?;

    if !Path::new(&config.filter_manager_path).exists() {
        return Err("hctStandAloneFilterManager.exe not found".to_string());
    }

    let input = PathBuf::from(&input_path);
    if !input.exists() {
        return Err(format!("Input file not found: {input_path}"));
    }

    let output = PathBuf::from(&output_path);
    tauri::async_runtime::spawn_blocking(move || {
        run_filter_manager(
            &config.filter_manager_path,
            HKO_WRITE_HKT,
            &input,
            &output,
        )
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    Ok(output_path)
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
