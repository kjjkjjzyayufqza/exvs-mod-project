use serde::{Deserialize, Serialize};
use serde_json::json;
use ssbh_data::hlpb_data::{AimConstraintData, HlpbData, OrientConstraintData};
use ssbh_data::modl_data::{ModlData, ModlEntryData};
use ssbh_data::prelude::*;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::ssbh_dae::{
    analyze_dae_path, analyze_fbx_path, convert_dae_file, convert_fbx_file,
    export_ssbh_bundle_to_dae, ConvertedFiles, DaeAnalysisReport, DaeConvertConfig,
    DaeExportConfig, DaeMaterialTextureExport, ModlEntryConfig, UpAxisConversion,
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

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create parent directory {}: {e}",
                parent.display()
            )
        })?;
    }
    Ok(())
}

pub(crate) fn write_numatb_from_json_value(
    json_value: &serde_json::Value,
    output_path: &Path,
) -> Result<(), String> {
    ensure_parent_dir(output_path)?;
    let matl: MatlData = serde_json::from_value(json_value.clone()).map_err(|e| {
        format!(
            "Invalid numatb JSON (expected ssbh_data MatlData: major_version, minor_version, entries): {e}"
        )
    })?;
    matl.write_to_file(output_path)
        .map_err(|e| format!("Failed to write numatb {}: {e}", output_path.display()))
}

fn read_numatb_to_json_value(file_path: &Path) -> Result<serde_json::Value, String> {
    if !file_path.is_file() {
        return Err(format!("numatb file not found: {}", file_path.display()));
    }
    let matl = MatlData::from_file(file_path).map_err(|e| format!("Failed to read numatb: {e}"))?;
    serde_json::to_value(&matl).map_err(|e| format!("Failed to serialize numatb to JSON: {e}"))
}

pub(crate) fn variant_numatb_paths(base: &str, output_dir: &Path) -> (PathBuf, PathBuf) {
    (
        output_dir.join(format!("{base}__maya__.numatb")),
        output_dir.join(format!("{base}__nust__.numatb")),
    )
}

pub(crate) fn serialize_numatb_from_json_value(
    json_value: &serde_json::Value,
) -> Result<Vec<u8>, String> {
    let temp_dir = tempfile::tempdir()
        .map_err(|e| format!("Failed to create temp dir for numatb serialization: {e}"))?;
    let path = temp_dir.path().join("session.numatb");
    write_numatb_from_json_value(json_value, &path)?;
    std::fs::read(&path).map_err(|e| format!("Failed to read serialized numatb bytes: {e}"))
}

pub(crate) fn build_session_numatb_artifacts(
    base: &str,
    write_numatb: bool,
    write_maya_profile: bool,
    nust_file: Option<&serde_json::Value>,
    maya_file: Option<&serde_json::Value>,
) -> Result<(Vec<u8>, Option<Vec<u8>>), String> {
    if !write_numatb {
        return Ok((Vec::new(), None));
    }
    let nust_payload = nust_file.ok_or_else(|| {
        format!("write_numatb is true but no nust profile was provided for base '{base}'")
    })?;
    let numatb = serialize_numatb_from_json_value(nust_payload)?;
    let maya_numatb = if write_maya_profile {
        let maya_payload = maya_file.ok_or_else(|| {
            format!("write_maya_profile is true but no maya profile was provided for base '{base}'")
        })?;
        Some(serialize_numatb_from_json_value(maya_payload)?)
    } else {
        None
    };
    Ok((numatb, maya_numatb))
}

/// Preflight a `.dae` file: per-geometry metrics, bone list, blocking errors vs `validate_dae_scene`.
#[tauri::command]
pub fn ssbh_analyze_dae(dae_path: String) -> Result<DaeAnalysisReport, String> {
    eprintln!("[ssbh_analyze_dae] path={}", dae_path);
    let p = PathBuf::from(dae_path.trim());
    let result = analyze_dae_path(&p);
    match &result {
        Ok(r) => eprintln!(
            "[ssbh_analyze_dae] done: can_convert={} meshes={} bones={} warnings={} errors={}",
            r.can_convert,
            r.mesh_rows.len(),
            r.bone_count,
            r.warnings.len(),
            r.blocking_errors.len()
        ),
        Err(e) => eprintln!("[ssbh_analyze_dae] failed: {}", e),
    }
    result
}

/// Preflight a `.fbx` file (same report shape as `ssbh_analyze_dae`).
#[tauri::command]
pub fn ssbh_analyze_fbx(fbx_path: String) -> Result<DaeAnalysisReport, String> {
    eprintln!("[ssbh_analyze_fbx] path={}", fbx_path);
    let p = PathBuf::from(fbx_path.trim());
    analyze_fbx_path(&p).inspect_err(|e| eprintln!("[ssbh_analyze_fbx] failed: {}", e))
}

/// Export model to COLLADA. `root_path` is passed to `load_model_preview_bundle`: use the same `.numdlb`
/// path as the preview when a folder contains multiple models; a directory alone may resolve a different `.numdlb`.
/// Optional `include_mesh_objects`: `{ name, subindex }[]` — empty = all objects.
#[tauri::command]
pub fn ssbh_export_folder_to_dae(
    root_path: String,
    output_dae_path: String,
    scale_factor: f32,
    up_axis: String,
    include_mesh_objects: Option<Vec<MeshObjectRef>>,
    export_numatb_textures: bool,
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
        ..Default::default()
    };

    let filter_set: Option<HashSet<(String, u64)>> = include_mesh_objects.map(|v| {
        v.into_iter()
            .map(|r| (r.name, r.subindex))
            .collect::<HashSet<_>>()
    });

    let skel_ref = skel.as_ref();

    let stats = if export_numatb_textures {
        let out_dir = out.parent().ok_or_else(|| {
            "output_dae_path must include a parent directory for texture export".to_string()
        })?;
        let matl_json = bundle.matl.clone().ok_or_else(|| {
            "matl data is missing from the model bundle; cannot export numatb textures".to_string()
        })?;
        let modl: ModlData = serde_json::from_value(bundle.modl.clone())
            .map_err(|e| format!("Failed to parse modl: {e}"))?;
        let matl: MatlData =
            serde_json::from_value(matl_json).map_err(|e| format!("Failed to parse matl: {e}"))?;
        let root_canon = PathBuf::from(bundle.root_folder.trim());
        let material_export = DaeMaterialTextureExport {
            root_canon: &root_canon,
            output_dir: out_dir,
            modl: &modl,
            matl: &matl,
        };
        export_ssbh_bundle_to_dae(
            &mesh,
            skel_ref,
            &out,
            &cfg,
            filter_set.as_ref(),
            Some(&material_export),
        )
    } else {
        export_ssbh_bundle_to_dae(&mesh, skel_ref, &out, &cfg, filter_set.as_ref(), None)
    }
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
    _app: AppHandle,
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
    eprintln!(
        "[ssbh_convert_dae_to_ssbh] dae_path={} output_dir={} base={} scale={} up_axis={} flip_uv={} geometries={:?}",
        dae_path, output_dir, base_filename, scale_factor, up_axis, flip_uv, include_geometry_names
    );
    if !scale_factor.is_finite() || scale_factor <= 0.0 {
        eprintln!(
            "[ssbh_convert_dae_to_ssbh] invalid scale_factor: {}",
            scale_factor
        );
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
        let nust_payload = nust_file.as_ref().ok_or_else(|| {
            "writeNumatb is true but no nustFile payload was provided".to_string()
        })?;
        write_numatb_from_json_value(nust_payload, &nust_numatb_path)?;
        converted.numatb_path = Some(nust_numatb_path.clone());
        nust_written_path = Some(nust_numatb_path.to_string_lossy().to_string());

        if write_maya_profile {
            let payload = maya_file.as_ref().ok_or_else(|| {
                "writeMayaProfile is true but no mayaFile payload was provided".to_string()
            })?;
            write_numatb_from_json_value(payload, &maya_numatb_path)?;
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
    _app: AppHandle,
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
        let nust_payload = nust_file.as_ref().ok_or_else(|| {
            "writeNumatb is true but no nustFile payload was provided".to_string()
        })?;
        write_numatb_from_json_value(nust_payload, &nust_numatb_path)?;
        converted.numatb_path = Some(nust_numatb_path.clone());
        nust_written_path = Some(nust_numatb_path.to_string_lossy().to_string());

        if write_maya_profile {
            let payload = maya_file.as_ref().ok_or_else(|| {
                "writeMayaProfile is true but no mayaFile payload was provided".to_string()
            })?;
            write_numatb_from_json_value(payload, &maya_numatb_path)?;
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
    let modl = ModlData::from_file(&path)
        .map_err(|e| format!("Failed to read numdlb {}: {e}", path.display()))?;
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NuhlpbReadResult {
    pub major_version: u16,
    pub minor_version: u16,
    pub aim_constraints: Vec<serde_json::Value>,
    pub orient_constraints: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NuhlpbWritePayload {
    pub file_path: String,
    pub major_version: u16,
    pub minor_version: u16,
    pub aim_constraints: Vec<serde_json::Value>,
    pub orient_constraints: Vec<serde_json::Value>,
}

#[tauri::command]
pub fn ssbh_read_nuhlpb(file_path: String) -> Result<NuhlpbReadResult, String> {
    let path = PathBuf::from(file_path.trim());
    let hlpb = HlpbData::from_file(&path)
        .map_err(|e| format!("Failed to read nuhlpb {}: {e}", path.display()))?;
    let aim_constraints: Vec<serde_json::Value> = hlpb
        .aim_constraints
        .iter()
        .map(|c| serde_json::to_value(c).unwrap())
        .collect();
    let orient_constraints: Vec<serde_json::Value> = hlpb
        .orient_constraints
        .iter()
        .map(|c| serde_json::to_value(c).unwrap())
        .collect();
    Ok(NuhlpbReadResult {
        major_version: hlpb.major_version,
        minor_version: hlpb.minor_version,
        aim_constraints,
        orient_constraints,
    })
}

#[tauri::command]
pub fn ssbh_write_nuhlpb(payload: NuhlpbWritePayload) -> Result<(), String> {
    let path = PathBuf::from(payload.file_path.trim());
    ensure_parent_dir(&path)?;
    let aim_constraints: Vec<AimConstraintData> = payload
        .aim_constraints
        .into_iter()
        .enumerate()
        .map(|(i, v)| {
            serde_json::from_value(v)
                .map_err(|e| format!("Invalid aim constraint at index {i}: {e}"))
        })
        .collect::<Result<_, _>>()?;
    let orient_constraints: Vec<OrientConstraintData> = payload
        .orient_constraints
        .into_iter()
        .enumerate()
        .map(|(i, v)| {
            serde_json::from_value(v)
                .map_err(|e| format!("Invalid orient constraint at index {i}: {e}"))
        })
        .collect::<Result<_, _>>()?;
    let hlpb = HlpbData {
        major_version: payload.major_version,
        minor_version: payload.minor_version,
        aim_constraints,
        orient_constraints,
    };
    hlpb.write_to_file(&path)
        .map_err(|e| format!("Failed to write nuhlpb {}: {e}", path.display()))
}

#[tauri::command]
pub fn ssbh_template_read_numatb(
    _app: AppHandle,
    file_path: String,
) -> Result<serde_json::Value, String> {
    read_numatb_to_json_value(&PathBuf::from(file_path.trim()))
}

#[tauri::command]
pub fn ssbh_template_write_numatb(
    _app: AppHandle,
    file_path: String,
    matl_json: serde_json::Value,
) -> Result<(), String> {
    write_numatb_from_json_value(&matl_json, &PathBuf::from(file_path.trim()))
}

// ── Stage Scene Editor: batch DAE export ────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDaeExportEntry {
    pub root_path: String,
    pub output_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDaeExportResult {
    pub exported: Vec<BatchDaeExportedFile>,
    pub errors: Vec<String>,
    pub total_exported: usize,
    pub total_failed: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDaeExportedFile {
    pub name: String,
    pub path: String,
    pub mesh_count: usize,
    pub vertex_count: usize,
}

/// Batch-export multiple SSBH model folders to DAE files.
/// Each entry specifies a model `root_path` (folder containing .numdlb) and a desired `output_name`.
/// All DAE files are written to `output_dir`.
#[tauri::command]
pub async fn stage_batch_export_dae(
    output_dir: String,
    entries: Vec<BatchDaeExportEntry>,
    scale_factor: Option<f32>,
    up_axis: Option<String>,
    export_textures: Option<bool>,
) -> Result<BatchDaeExportResult, String> {
    let out_dir = output_dir.trim().to_string();
    if out_dir.is_empty() {
        return Err("output_dir cannot be empty".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let out_path = PathBuf::from(&out_dir);
        std::fs::create_dir_all(&out_path)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;

        let scale = scale_factor.unwrap_or(1.0);
        if !scale.is_finite() || scale <= 0.0 {
            return Err("scale_factor must be a finite positive number".to_string());
        }

        let axis = up_axis.as_deref().unwrap_or("y_up");
        let axis_conv = parse_up_axis(axis)?;
        let with_textures = export_textures.unwrap_or(false);

        let cfg = DaeExportConfig {
            up_axis: axis_conv,
            scale_factor: scale,
            ..Default::default()
        };

        let mut exported: Vec<BatchDaeExportedFile> = Vec::new();
        let mut errors: Vec<String> = Vec::new();

        for entry in &entries {
            let root = entry.root_path.trim();
            if root.is_empty() {
                errors.push(format!("Skipped '{}': empty root_path", entry.output_name));
                continue;
            }

            match export_single_to_dae(root, &out_path, &entry.output_name, &cfg, with_textures) {
                Ok(info) => exported.push(info),
                Err(e) => errors.push(format!("{}: {e}", entry.output_name)),
            }
        }

        let total_exported = exported.len();
        let total_failed = errors.len();

        Ok(BatchDaeExportResult {
            exported,
            errors,
            total_exported,
            total_failed,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn export_single_to_dae(
    root_path: &str,
    out_dir: &Path,
    output_name: &str,
    cfg: &DaeExportConfig,
    export_textures: bool,
) -> Result<BatchDaeExportedFile, String> {
    let bundle = load_model_preview_bundle(root_path)?;
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

    let safe_name = output_name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let dae_path = out_dir.join(format!("{safe_name}.dae"));

    let stats = if export_textures {
        let matl_json = bundle
            .matl
            .clone()
            .ok_or_else(|| "matl data is missing; cannot export textures".to_string())?;
        let modl: ssbh_data::modl_data::ModlData = serde_json::from_value(bundle.modl.clone())
            .map_err(|e| format!("Failed to parse modl: {e}"))?;
        let matl: ssbh_data::matl_data::MatlData =
            serde_json::from_value(matl_json).map_err(|e| format!("Failed to parse matl: {e}"))?;
        let root_canon = PathBuf::from(bundle.root_folder.trim());
        let material_export = DaeMaterialTextureExport {
            root_canon: &root_canon,
            output_dir: out_dir,
            modl: &modl,
            matl: &matl,
        };
        export_ssbh_bundle_to_dae(
            &mesh,
            skel.as_ref(),
            &dae_path,
            cfg,
            None,
            Some(&material_export),
        )
    } else {
        export_ssbh_bundle_to_dae(&mesh, skel.as_ref(), &dae_path, cfg, None, None)
    }
    .map_err(|e| format!("DAE export failed: {e:#}"))?;

    let mesh_count = stats.objects_exported;
    let vertex_count = stats.triangles_exported * 3;

    Ok(BatchDaeExportedFile {
        name: safe_name,
        path: dae_path.to_string_lossy().to_string(),
        mesh_count,
        vertex_count,
    })
}

/// Export a single model to DAE by selecting specific folder path, returning the output path.
#[tauri::command]
pub async fn stage_export_single_dae(
    root_path: String,
    output_path: String,
    scale_factor: Option<f32>,
    up_axis: Option<String>,
    export_textures: Option<bool>,
) -> Result<serde_json::Value, String> {
    let root = root_path.trim().to_string();
    let out = output_path.trim().to_string();
    if root.is_empty() {
        return Err("root_path cannot be empty".to_string());
    }
    if out.is_empty() {
        return Err("output_path cannot be empty".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let scale = scale_factor.unwrap_or(1.0);
        if !scale.is_finite() || scale <= 0.0 {
            return Err("scale_factor must be a finite positive number".to_string());
        }
        let axis = up_axis.as_deref().unwrap_or("y_up");
        let axis_conv = parse_up_axis(axis)?;

        let cfg = DaeExportConfig {
            up_axis: axis_conv,
            scale_factor: scale,
            ..Default::default()
        };

        let out_path = PathBuf::from(&out);
        let out_dir = out_path
            .parent()
            .ok_or_else(|| "output_path must have a parent directory".to_string())?;
        std::fs::create_dir_all(out_dir)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;

        let output_name = out_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("export");

        let with_textures = export_textures.unwrap_or(false);
        let info = export_single_to_dae(&root, out_dir, output_name, &cfg, with_textures)?;

        Ok(json!({
            "path": info.path,
            "meshCount": info.mesh_count,
            "vertexCount": info.vertex_count,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
