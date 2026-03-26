use serde::{Deserialize, Serialize};
use serde_json::json;
use ssbh_data::prelude::*;
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::ssbh_dae::{
    analyze_dae_path, analyze_fbx_path, convert_dae_file, convert_fbx_file, export_ssbh_bundle_to_dae,
    ConvertedFiles, DaeAnalysisReport, DaeConvertConfig, DaeExportConfig, UpAxisConversion,
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
    pub nusktb_path: Option<String>,
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
            nusktb_path: c
                .nusktb_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
        }
    }
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
    };

    let started = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let (converted, stats) = convert_dae_file(&dae, &config).map_err(|e| format!("DAE conversion: {e:#}"))?;

    let mut log_path: Option<String> = None;
    if write_log {
        let lp = out_dir.join(format!("{base}_dae_to_ssbh.log"));
        let log_body = format!(
            "ts_ms={started}\ndae_path={}\noutput_dir={}\nbase_filename={}\nscale_factor={}\nflip_uv={}\nup_axis={}\ninclude_geometry_names={:?}\nwrite_numdlb={write_numdlb}\nwrite_numshb={write_numshb}\nwrite_nusktb={write_nusktb}\n\nstats={}\nfiles:\n  numdlb={:?}\n  numshb={:?}\n  nusktb={:?}\n",
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
            converted.nusktb_path,
        );
        std::fs::write(&lp, log_body).map_err(|e| format!("Failed to write log file: {e}"))?;
        log_path = Some(lp.to_string_lossy().to_string());
    }

    let result = SsbhDaeConvertResult::from_converted(&converted);
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
    };

    let started = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let (converted, stats) =
        convert_fbx_file(&fbx, &config).map_err(|e| format!("FBX conversion: {e:#}"))?;

    let mut log_path: Option<String> = None;
    if write_log {
        let lp = out_dir.join(format!("{base}_fbx_to_ssbh.log"));
        let log_body = format!(
            "ts_ms={started}\nfbx_path={}\noutput_dir={}\nbase_filename={}\nscale_factor={}\nflip_uv={}\nup_axis={}\ninclude_geometry_names={:?}\nwrite_numdlb={write_numdlb}\nwrite_numshb={write_numshb}\nwrite_nusktb={write_nusktb}\n\nstats={}\nfiles:\n  numdlb={:?}\n  numshb={:?}\n  nusktb={:?}\n",
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
            converted.nusktb_path,
        );
        std::fs::write(&lp, log_body).map_err(|e| format!("Failed to write log file: {e}"))?;
        log_path = Some(lp.to_string_lossy().to_string());
    }

    let result = SsbhDaeConvertResult::from_converted(&converted);
    Ok(json!({
        "ok": true,
        "files": result,
        "stats": stats,
        "logPath": log_path,
    }))
}
