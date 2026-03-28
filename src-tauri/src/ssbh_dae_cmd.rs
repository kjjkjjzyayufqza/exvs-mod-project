use serde::{Deserialize, Serialize};
use serde_json::json;
use ssbh_data::prelude::*;
use ssbh_data::modl_data::ModlEntryData;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::ssbh_dae::{
    analyze_dae_path, analyze_fbx_path, convert_dae_file, convert_fbx_file, export_ssbh_bundle_to_dae,
    ConvertedFiles, DaeAnalysisReport, DaeConvertConfig, DaeExportConfig, ModlEntryConfig,
    UpAxisConversion,
};
use crate::ssbh_preview::load_model_preview_bundle;

fn parse_up_axis(s: &str) -> Result<UpAxisConversion, String> {
    match s.trim().to_ascii_lowercase().replace('-', "_").as_str() {
        "y_up" | "yup" => Ok(UpAxisConversion::YUp),
        "z_up" | "zup" => Ok(UpAxisConversion::ZUp),
        "none" | "no_conversion" | "noconversion" => Ok(UpAxisConversion::NoConversion),
        other => Err(format!(
            "Invalid up_axis '{other}': expected y_up, z_up, or none"
        )),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SsbhDaeConvertResult {
    pub numdlb_path: Option<String>,
    pub numshb_path: Option<String>,
    pub numatb_path: Option<String>,
    pub nusktb_path: Option<String>,
    pub maya_numatb_path: Option<String>,
    pub nust_numatb_path: Option<String>,
}

impl SsbhDaeConvertResult {
    fn from_converted(c: &ConvertedFiles) -> Self {
        Self {
            numdlb_path: c
                .numdlb_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            numshb_path: c
                .numshb_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            numatb_path: c
                .numatb_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            nusktb_path: c
                .nusktb_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
            maya_numatb_path: None,
            nust_numatb_path: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NumdlbMappingEntryPayload {
    pub mesh_object_name: String,
    pub mesh_object_subindex: u64,
    pub material_label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NumdlbReadResult {
    pub model_name: String,
    pub skeleton_file_name: String,
    pub material_file_names: Vec<String>,
    pub mesh_file_name: String,
    pub animation_file_name: Option<String>,
    pub entries: Vec<NumdlbMappingEntryPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumdlbWritePayload {
    pub file_path: String,
    pub model_name: String,
    pub skeleton_file_name: String,
    pub material_file_names: Vec<String>,
    pub mesh_file_name: String,
    pub animation_file_name: Option<String>,
    pub entries: Vec<NumdlbMappingEntryPayload>,
}

fn tool_path(app: &AppHandle, tool_name: &str) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to resolve resource directory: {e}"))?;
    let path = resource_dir.join("tools").join(tool_name);
    if !path.is_file() {
        return Err(format!("Required tool not found: {}", path.display()));
    }
    Ok(path)
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory {}: {e}", parent.display()))?;
    }
    Ok(())
}

fn run_ssbh_lib_json_convert(
    app: &AppHandle,
    input_path: &Path,
    output_path: &Path,
) -> Result<(), String> {
    let tool = tool_path(app, "ssbh_lib_json.exe")?;
    let output = Command::new(&tool)
        .arg(input_path)
        .arg(output_path)
        .output()
        .map_err(|e| format!("Failed to run {}: {e}", tool.display()))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(format!(
            "ssbh_lib_json conversion failed ({} -> {}): {}",
            input_path.display(),
            output_path.display(),
            detail
        ));
    }
    Ok(())
}

fn write_numatb_from_json_value(
    app: &AppHandle,
    json_value: &serde_json::Value,
    output_path: &Path,
) -> Result<(), String> {
    ensure_parent_dir(output_path)?;
    let temp_dir = output_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("__convert");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp convert directory {}: {e}", temp_dir.display()))?;
    let temp_json_path = temp_dir.join(format!(
        "{}.json",
        output_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("temp_numatb")
    ));
    std::fs::write(
        &temp_json_path,
        serde_json::to_vec_pretty(json_value).map_err(|e| format!("Failed to serialize numatb JSON: {e}"))?,
    )
    .map_err(|e| format!("Failed to write temp numatb JSON {}: {e}", temp_json_path.display()))?;
    run_ssbh_lib_json_convert(app, &temp_json_path, output_path)?;
    Ok(())
}

fn read_numatb_to_json_value(app: &AppHandle, file_path: &Path) -> Result<serde_json::Value, String> {
    if !file_path.is_file() {
        return Err(format!("numatb file not found: {}", file_path.display()));
    }
    let temp_dir = file_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("__convert");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp convert directory {}: {e}", temp_dir.display()))?;
    let temp_json_path = temp_dir.join(format!(
        "{}.json",
        file_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("temp_numatb")
    ));
    run_ssbh_lib_json_convert(app, file_path, &temp_json_path)?;
    let bytes = std::fs::read(&temp_json_path)
        .map_err(|e| format!("Failed to read temp numatb JSON {}: {e}", temp_json_path.display()))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("Failed to parse numatb JSON: {e}"))
}

fn variant_numatb_paths(base: &str, output_dir: &Path) -> (PathBuf, PathBuf) {
    (
        output_dir.join(format!("{base}__maya__.numatb")),
        output_dir.join(format!("{base}__nust__.numatb")),
    )
}

/// Preflight a `.dae` file: per-geometry metrics, bone list, blocking errors vs `validate_dae_scene`.
#[tauri::command]
pub fn ssbh_analyze_dae(dae_path: String) -> Result<DaeAnalysisReport, String> {
    let p = PathBuf::from(dae_path.trim());
    analyze_dae_path(&p)
}

/// Preflight a `.fbx` file (same report shape as `ssbh_analyze_dae`).
#[tauri::command]
pub fn ssbh_analyze_fbx(fbx_path: String) -> Result<DaeAnalysisReport, String> {
    let p = PathBuf::from(fbx_path.trim());
    analyze_fbx_path(&p)
}

/// Export loaded model folder to COLLADA. Optional `include_mesh_objects`: `{ name, subindex }[]` — empty = all objects.
#[tauri::command]
pub fn ssbh_export_folder_to_dae(
    root_path: String,
    output_dae_path: String,
    scale_factor: f32,
    up_axis: String,
    include_mesh_objects: Option<Vec<MeshObjectRef>>,
) -> Result<serde_json::Value, String> {
    if !scale_factor.is_finite() || scale_factor <= 0.0 {
        return Err("scale_factor must be a finite positive number".to_string());
    }
    let bundle = load_model_preview_bundle(&root_path)?;
    let mesh_path = PathBuf::from(&bundle.mesh_path);
    let mesh: MeshData =
        MeshData::from_file(&mesh_path).map_err(|e| format!("Failed to read Mesh: {e}"))?;

    let skel = if let Some(ref p) = bundle.skel_path {
        let s: SkelData =
            SkelData::from_file(p).map_err(|e| format!("Failed to read Skel: {e}"))?;
        Some(s)
    } else {
        None
    };

    let out = PathBuf::from(output_dae_path.trim());
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;
    }

    let cfg = DaeExportConfig {
        up_axis: parse_up_axis(&up_axis)?,
        scale_factor,
    };

    let filter_set: Option<HashSet<(String, u64)>> = include_mesh_objects.map(|v| {
        v.into_iter()
            .map(|r| (r.name, r.subindex))
            .collect::<HashSet<_>>()
    });

    let skel_ref = skel.as_ref();
    let stats = export_ssbh_bundle_to_dae(&mesh, skel_ref, &out, &cfg, filter_set.as_ref())
        .map_err(|e| format!("DAE export failed: {e:#}"))?;

    Ok(json!({
        "daePath": out.to_string_lossy(),
        "stats": stats,
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshObjectRef {
    pub name: String,
    pub subindex: u64,
}

/// Convert DAE → SSBH. `include_geometry_names`: exact COLLADA geometry names; empty = all. `write_log`: append `{base}_dae_to_ssbh.log` in output dir.
#[tauri::command]
pub fn ssbh_convert_dae_to_ssbh(
    app: AppHandle,
    dae_path: String,
    output_dir: String,
    base_filename: String,
    scale_factor: f32,
    flip_uv: bool,
    up_axis: String,
    include_geometry_names: Vec<String>,
    write_log: bool,
    write_numdlb: bool,
    write_numshb: bool,
    write_nusktb: bool,
    write_numatb: bool,
    write_maya_profile: bool,
    numdlb_entries: Vec<NumdlbMappingEntryPayload>,
    maya_file: Option<serde_json::Value>,
    nust_file: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    if !scale_factor.is_finite() || scale_factor <= 0.0 {
        return Err("scale_factor must be a finite positive number".to_string());
    }
    let base = base_filename.trim();
    if base.is_empty() {
        return Err("base_filename must not be empty".to_string());
    }
    let dae = PathBuf::from(dae_path.trim());
    if !dae.is_file() {
        return Err(format!("DAE file not found: {}", dae.display()));
    }
    let out_dir = PathBuf::from(output_dir.trim());
    std::fs::create_dir_all(&out_dir)
        .map_err(|e| format!("Failed to create output directory: {e}"))?;

    let config = DaeConvertConfig {
        output_directory: out_dir.clone(),
        base_filename: base.to_string(),
        scale_factor,
        up_axis_conversion: parse_up_axis(&up_axis)?,
        flip_uv,
        include_geometry_names,
        write_numdlb,
        write_numshb,
        write_nusktb,
        modl_entries: numdlb_entries
            .iter()
            .map(|entry| ModlEntryConfig {
                mesh_object_name: entry.mesh_object_name.clone(),
                mesh_object_subindex: entry.mesh_object_subindex,
                material_label: entry.material_label.clone(),
            })
            .collect(),
    };

    let started = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let (mut converted, stats) =
        convert_dae_file(&dae, &config).map_err(|e| format!("DAE conversion: {e:#}"))?;

    let (maya_numatb_path, nust_numatb_path) = variant_numatb_paths(base, &out_dir);
    let mut maya_written_path: Option<String> = None;
    let mut nust_written_path: Option<String> = None;
    if write_numatb {
        let nust_payload = nust_file
            .as_ref()
            .ok_or_else(|| "writeNumatb is true but no nustFile payload was provided".to_string())?;
        write_numatb_from_json_value(&app, nust_payload, &nust_numatb_path)?;
        converted.numatb_path = Some(nust_numatb_path.clone());
        nust_written_path = Some(nust_numatb_path.to_string_lossy().to_string());

        if write_maya_profile {
            let payload = maya_file
                .as_ref()
                .ok_or_else(|| "writeMayaProfile is true but no mayaFile payload was provided".to_string())?;
            write_numatb_from_json_value(&app, payload, &maya_numatb_path)?;
            maya_written_path = Some(maya_numatb_path.to_string_lossy().to_string());
        }
    }

    let mut log_path: Option<String> = None;
    if write_log {
        let lp = out_dir.join(format!("{base}_dae_to_ssbh.log"));
        let log_body = format!(
            "ts_ms={started}\ndae_path={}\noutput_dir={}\nbase_filename={}\nscale_factor={}\nflip_uv={}\nup_axis={}\ninclude_geometry_names={:?}\nwrite_numdlb={write_numdlb}\nwrite_numshb={write_numshb}\nwrite_nusktb={write_nusktb}\nwrite_numatb={write_numatb}\nwrite_maya_profile={write_maya_profile}\n\nstats={}\nfiles:\n  numdlb={:?}\n  numshb={:?}\n  numatb={:?}\n  maya_numatb={:?}\n  nust_numatb={:?}\n  nusktb={:?}\n",
            dae.display(),
            out_dir.display(),
            base,
            scale_factor,
            flip_uv,
            up_axis,
            config.include_geometry_names,
            serde_json::to_string(&stats).map_err(|e| e.to_string())?,
            converted.numdlb_path,
            converted.numshb_path,
            converted.numatb_path,
            maya_written_path,
            nust_written_path,
            converted.nusktb_path,
        );
        std::fs::write(&lp, log_body).map_err(|e| format!("Failed to write log file: {e}"))?;
        log_path = Some(lp.to_string_lossy().to_string());
    }

    let mut result = SsbhDaeConvertResult::from_converted(&converted);
    result.maya_numatb_path = maya_written_path;
    result.nust_numatb_path = nust_written_path;
    Ok(json!({
        "ok": true,
        "files": result,
        "stats": stats,
        "logPath": log_path,
    }))
}

/// Convert FBX → SSBH. Same parameters as `ssbh_convert_dae_to_ssbh`; `include_geometry_names` matches FBX mesh names.
#[tauri::command]
pub fn ssbh_convert_fbx_to_ssbh(
    app: AppHandle,
    fbx_path: String,
    output_dir: String,
    base_filename: String,
    scale_factor: f32,
    flip_uv: bool,
    up_axis: String,
    include_geometry_names: Vec<String>,
    write_log: bool,
    write_numdlb: bool,
    write_numshb: bool,
    write_nusktb: bool,
    write_numatb: bool,
    write_maya_profile: bool,
    numdlb_entries: Vec<NumdlbMappingEntryPayload>,
    maya_file: Option<serde_json::Value>,
    nust_file: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    if !scale_factor.is_finite() || scale_factor <= 0.0 {
        return Err("scale_factor must be a finite positive number".to_string());
    }
    let base = base_filename.trim();
    if base.is_empty() {
        return Err("base_filename must not be empty".to_string());
    }
    let fbx = PathBuf::from(fbx_path.trim());
    if !fbx.is_file() {
        return Err(format!("FBX file not found: {}", fbx.display()));
    }
    let out_dir = PathBuf::from(output_dir.trim());
    std::fs::create_dir_all(&out_dir)
        .map_err(|e| format!("Failed to create output directory: {e}"))?;

    let config = DaeConvertConfig {
        output_directory: out_dir.clone(),
        base_filename: base.to_string(),
        scale_factor,
        up_axis_conversion: parse_up_axis(&up_axis)?,
        flip_uv,
        include_geometry_names,
        write_numdlb,
        write_numshb,
        write_nusktb,
        modl_entries: numdlb_entries
            .iter()
            .map(|entry| ModlEntryConfig {
                mesh_object_name: entry.mesh_object_name.clone(),
                mesh_object_subindex: entry.mesh_object_subindex,
                material_label: entry.material_label.clone(),
            })
            .collect(),
    };

    let started = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let (mut converted, stats) =
        convert_fbx_file(&fbx, &config).map_err(|e| format!("FBX conversion: {e:#}"))?;

    let (maya_numatb_path, nust_numatb_path) = variant_numatb_paths(base, &out_dir);
    let mut maya_written_path: Option<String> = None;
    let mut nust_written_path: Option<String> = None;
    if write_numatb {
        let nust_payload = nust_file
            .as_ref()
            .ok_or_else(|| "writeNumatb is true but no nustFile payload was provided".to_string())?;
        write_numatb_from_json_value(&app, nust_payload, &nust_numatb_path)?;
        converted.numatb_path = Some(nust_numatb_path.clone());
        nust_written_path = Some(nust_numatb_path.to_string_lossy().to_string());

        if write_maya_profile {
            let payload = maya_file
                .as_ref()
                .ok_or_else(|| "writeMayaProfile is true but no mayaFile payload was provided".to_string())?;
            write_numatb_from_json_value(&app, payload, &maya_numatb_path)?;
            maya_written_path = Some(maya_numatb_path.to_string_lossy().to_string());
        }
    }

    let mut log_path: Option<String> = None;
    if write_log {
        let lp = out_dir.join(format!("{base}_fbx_to_ssbh.log"));
        let log_body = format!(
            "ts_ms={started}\nfbx_path={}\noutput_dir={}\nbase_filename={}\nscale_factor={}\nflip_uv={}\nup_axis={}\ninclude_geometry_names={:?}\nwrite_numdlb={write_numdlb}\nwrite_numshb={write_numshb}\nwrite_nusktb={write_nusktb}\nwrite_numatb={write_numatb}\nwrite_maya_profile={write_maya_profile}\n\nstats={}\nfiles:\n  numdlb={:?}\n  numshb={:?}\n  numatb={:?}\n  maya_numatb={:?}\n  nust_numatb={:?}\n  nusktb={:?}\n",
            fbx.display(),
            out_dir.display(),
            base,
            scale_factor,
            flip_uv,
            up_axis,
            config.include_geometry_names,
            serde_json::to_string(&stats).map_err(|e| e.to_string())?,
            converted.numdlb_path,
            converted.numshb_path,
            converted.numatb_path,
            maya_written_path,
            nust_written_path,
            converted.nusktb_path,
        );
        std::fs::write(&lp, log_body).map_err(|e| format!("Failed to write log file: {e}"))?;
        log_path = Some(lp.to_string_lossy().to_string());
    }

    let mut result = SsbhDaeConvertResult::from_converted(&converted);
    result.maya_numatb_path = maya_written_path;
    result.nust_numatb_path = nust_written_path;
    Ok(json!({
        "ok": true,
        "files": result,
        "stats": stats,
        "logPath": log_path,
    }))
}

#[tauri::command]
pub fn ssbh_read_numdlb_mapping(file_path: String) -> Result<NumdlbReadResult, String> {
    let path = PathBuf::from(file_path.trim());
    let modl =
        ModlData::from_file(&path).map_err(|e| format!("Failed to read numdlb {}: {e}", path.display()))?;
    Ok(NumdlbReadResult {
        model_name: modl.model_name,
        skeleton_file_name: modl.skeleton_file_name,
        material_file_names: modl.material_file_names,
        mesh_file_name: modl.mesh_file_name,
        animation_file_name: modl.animation_file_name,
        entries: modl
            .entries
            .into_iter()
            .map(|entry| NumdlbMappingEntryPayload {
                mesh_object_name: entry.mesh_object_name,
                mesh_object_subindex: entry.mesh_object_subindex,
                material_label: entry.material_label,
            })
            .collect(),
    })
}

#[tauri::command]
pub fn ssbh_write_numdlb_mapping(payload: NumdlbWritePayload) -> Result<(), String> {
    let path = PathBuf::from(payload.file_path.trim());
    ensure_parent_dir(&path)?;
    let modl = ModlData {
        major_version: 1,
        minor_version: 0,
        model_name: payload.model_name,
        skeleton_file_name: payload.skeleton_file_name,
        material_file_names: payload.material_file_names,
        animation_file_name: payload.animation_file_name,
        mesh_file_name: payload.mesh_file_name,
        entries: payload
            .entries
            .into_iter()
            .map(|entry| ModlEntryData {
                mesh_object_name: entry.mesh_object_name,
                mesh_object_subindex: entry.mesh_object_subindex,
                material_label: entry.material_label,
            })
            .collect(),
    };
    modl.write_to_file(&path)
        .map_err(|e| format!("Failed to write numdlb {}: {e}", path.display()))
}

#[tauri::command]
pub fn ssbh_template_read_numatb(
    app: AppHandle,
    file_path: String,
) -> Result<serde_json::Value, String> {
    read_numatb_to_json_value(&app, &PathBuf::from(file_path.trim()))
}
