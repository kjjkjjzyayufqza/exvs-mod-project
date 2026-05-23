use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

use crate::format::fhm2d_stage;
use crate::havok_cli;
use crate::scene_memory_session::{
    GraphicParam, HavokCollisionData, ImportConfig, PlacementEntry, SceneSessionState,
    SceneSource, SsbhArtifacts,
};
use crate::ssbh_dae::{convert_dae_file, DaeConvertConfig};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneOpenResult {
    pub session_id: String,
    pub root_path: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub import_id: String,
    pub name: String,
    pub ssbh_generated: bool,
    pub hkt_generated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub success: bool,
    pub files_written: u32,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HavokDataResult {
    pub source_id: String,
    pub hkt_xml: String,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteImportOptions {
    pub import_id: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateHktOptions {
    pub session_id: String,
    pub import_id: String,
    pub config_profile: String,
}

#[tauri::command]
pub fn scene_session_create(
    state: State<'_, SceneSessionState>,
    source: SceneSource,
) -> String {
    eprintln!("[scene_session_create] source={:?}", source);
    let sid = state.create_session(source);
    eprintln!("[scene_session_create] created session_id={}", sid);
    sid
}

#[tauri::command]
pub fn scene_session_destroy(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<(), String> {
    eprintln!("[scene_session_destroy] session_id={}", session_id);
    state.destroy_session(&session_id).inspect_err(|e| {
        eprintln!("[scene_session_destroy] failed: {}", e);
    })
}

#[tauri::command]
pub fn scene_session_is_dirty(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<bool, String> {
    state.with_session(&session_id, |s| Ok(s.dirty))
}

#[tauri::command]
pub fn scene_import_dae(
    state: State<'_, SceneSessionState>,
    session_id: String,
    dae_bytes: Vec<u8>,
    name: String,
) -> Result<String, String> {
    eprintln!(
        "[scene_import_dae] session_id={} name={} dae_bytes_len={}",
        session_id,
        name,
        dae_bytes.len()
    );
    let result = state.with_session_mut(&session_id, |s| Ok(s.add_import(name, dae_bytes)));
    match &result {
        Ok(import_id) => eprintln!("[scene_import_dae] success import_id={}", import_id),
        Err(e) => eprintln!("[scene_import_dae] failed: {}", e),
    }
    result
}

#[tauri::command]
pub fn scene_configure_import(
    state: State<'_, SceneSessionState>,
    session_id: String,
    import_id: String,
    config: ImportConfig,
) -> Result<(), String> {
    eprintln!(
        "[scene_configure_import] session_id={} import_id={} convert_to_ssbh={} generate_hkt={} load_to_scene={}",
        session_id, import_id, config.convert_to_ssbh, config.generate_hkt, config.load_to_scene
    );
    if let Some(ref sc) = config.ssbh_config {
        eprintln!(
            "[scene_configure_import] ssbh_config: base_filename={} scale={} up_axis={} numdlb={} numshb={} nusktb={}",
            sc.base_filename, sc.scale_factor, sc.up_axis,
            sc.write_numdlb, sc.write_numshb, sc.write_nusktb
        );
    }
    state.with_session_mut(&session_id, |s| {
        let import = s.find_import_mut(&import_id)?;
        import.config = config;
        Ok(())
    }).inspect_err(|e| eprintln!("[scene_configure_import] failed: {}", e))
}

#[tauri::command]
pub fn scene_remove_import(
    state: State<'_, SceneSessionState>,
    session_id: String,
    import_id: String,
) -> Result<(), String> {
    eprintln!("[scene_remove_import] session_id={} import_id={}", session_id, import_id);
    state
        .with_session_mut(&session_id, |s| s.remove_import(&import_id))
        .inspect_err(|e| eprintln!("[scene_remove_import] failed: {}", e))
}

#[tauri::command]
pub async fn scene_open_folder(
    state: State<'_, SceneSessionState>,
    path: String,
) -> Result<SceneOpenResult, String> {
    eprintln!("[scene_open_folder] path={}", path);
    let path_clone = path.clone();
    let skeleton = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::load_stage_skeleton_impl(&path_clone)
    })
    .await
    .map_err(|e| {
        eprintln!("[scene_open_folder] spawn_blocking join error: {}", e);
        e.to_string()
    })?
    .map_err(|e| {
        eprintln!("[scene_open_folder] load_stage_skeleton_impl failed: {}", e);
        e
    })?;

    let warnings = skeleton.warnings;
    let placement_header = skeleton.placement_header;
    let placement_entries = skeleton.placement_entries;
    let graphic_params = skeleton.graphic_params;

    let stage_path = path.clone();
    let havok_data_list = tauri::async_runtime::spawn_blocking(move || {
        collect_hkt_as_xml(&stage_path)
    })
    .await
    .map_err(|e| e.to_string())?;

    let session_id = state.create_session(SceneSource::Folder { path: path.clone() });
    state.with_session_mut(&session_id, |s| {
        s.placement_header = placement_header;
        s.placement_entries = placement_entries
            .into_iter()
            .map(|e| PlacementEntry {
                vdk_type: e.vdk_type,
                object_number: e.object_number,
                pos_x: e.pos_x,
                pos_y: e.pos_y,
                pos_z: e.pos_z,
                rot_x: e.rot_x,
                rot_y: e.rot_y,
                rot_z: e.rot_z,
                scale_x: e.scale_x,
                scale_y: e.scale_y,
                scale_z: e.scale_z,
                raw_fields: e.raw_fields,
            })
            .collect();
        s.graphic_params = graphic_params
            .into_iter()
            .map(|g| GraphicParam {
                key: g.key,
                value: g.value,
            })
            .collect();
        s.havok_data = havok_data_list;
        Ok(())
    })?;

    eprintln!(
        "[scene_open_folder] success session_id={} warnings={}",
        session_id,
        warnings.len()
    );
    Ok(SceneOpenResult {
        session_id,
        root_path: path,
        warnings,
    })
}

/// Scan stage folder for all .hkt files and convert each to XML via Havok Content Tools.
fn collect_hkt_as_xml(stage_root: &str) -> Vec<HavokCollisionData> {
    let config = match havok_cli::HavokCliConfig::detect() {
        Some(c) => c,
        None => {
            eprintln!("[collect_hkt_as_xml] Havok Content Tools not found, skipping HKT conversion");
            return Vec::new();
        }
    };
    if !Path::new(&config.filter_manager_path).exists() {
        eprintln!("[collect_hkt_as_xml] filter manager exe not found");
        return Vec::new();
    }

    let root = Path::new(stage_root);
    let mut results = Vec::new();

    fn find_hkt_files(dir: &Path, root: &Path, out: &mut Vec<(String, Vec<u8>)>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                find_hkt_files(&p, root, out);
            } else if p.extension().and_then(|e| e.to_str()) == Some("hkt") {
                let rel = p.strip_prefix(root)
                    .map(|r| r.to_string_lossy().to_string())
                    .unwrap_or_else(|_| p.file_name().unwrap().to_string_lossy().to_string());
                if let Ok(bytes) = std::fs::read(&p) {
                    out.push((rel, bytes));
                }
            }
        }
    }

    let mut hkt_files: Vec<(String, Vec<u8>)> = Vec::new();
    find_hkt_files(root, root, &mut hkt_files);

    for (source_id, raw_bytes) in hkt_files {
        match havok_cli::convert_hkt_bytes_to_xml(&config.filter_manager_path, &raw_bytes) {
            Ok(xml) => {
                eprintln!("[collect_hkt_as_xml] converted: {}", source_id);
                results.push(HavokCollisionData {
                    source_id,
                    hkt_xml: xml,
                    raw_bytes,
                });
            }
            Err(e) => {
                eprintln!("[collect_hkt_as_xml] failed to convert {}: {}", source_id, e);
            }
        }
    }

    results
}

#[tauri::command]
pub async fn scene_execute_import(
    state: State<'_, SceneSessionState>,
    options: ExecuteImportOptions,
) -> Result<ImportResult, String> {
    eprintln!(
        "[scene_execute_import] session_id={} import_id={}",
        options.session_id, options.import_id
    );
    let (dae_bytes, name, config) = state.with_session(&options.session_id, |s| {
        let import = s.find_import(&options.import_id)?;
        Ok((
            import.dae_bytes.clone(),
            import.name.clone(),
            import.config.clone(),
        ))
    }).map_err(|e| {
        eprintln!("[scene_execute_import] find_import failed: {}", e);
        e
    })?;

    eprintln!(
        "[scene_execute_import] name={} dae_bytes_len={} convert_to_ssbh={} generate_hkt={}",
        name,
        dae_bytes.len(),
        config.convert_to_ssbh,
        config.generate_hkt
    );

    let mut ssbh_generated = false;
    let mut hkt_generated = false;

    if config.convert_to_ssbh {
        let ssbh_config = config.ssbh_config.clone().unwrap_or_else(|| {
            eprintln!("[scene_execute_import] no ssbh_config provided, using defaults");
            crate::scene_memory_session::SsbhConvertConfig {
                base_filename: name.clone(),
                scale_factor: 1.0,
                up_axis: "y_up".into(),
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: true,
                write_numatb: true,
                write_jnttbl: true,
                write_maya_profile: false,
                material_template: None,
            }
        });

        eprintln!(
            "[scene_execute_import] SSBH conversion: base_filename={} scale={} up_axis={}",
            ssbh_config.base_filename, ssbh_config.scale_factor, ssbh_config.up_axis
        );

        let dae_bytes_clone = dae_bytes.clone();
        let artifacts = tauri::async_runtime::spawn_blocking(move || {
            convert_dae_bytes_to_ssbh_artifacts(&dae_bytes_clone, &ssbh_config)
        })
        .await
        .map_err(|e| {
            eprintln!("[scene_execute_import] spawn_blocking join error: {}", e);
            format!("Task join error: {e}")
        })?
        .map_err(|e| {
            eprintln!("[scene_execute_import] SSBH conversion failed: {}", e);
            e
        })?;

        eprintln!(
            "[scene_execute_import] SSBH artifacts generated: numdlb={} numshb={} nusktb={} numatb={}",
            artifacts.numdlb.len(),
            artifacts.numshb.len(),
            artifacts.nusktb.as_ref().map_or(0, |v| v.len()),
            artifacts.numatb.len()
        );

        state.with_session_mut(&options.session_id, |s| {
            s.store_ssbh_artifacts(&options.import_id, artifacts)
        })?;
        ssbh_generated = true;
    }

    if config.generate_hkt {
        eprintln!("[scene_execute_import] starting HKT generation");
        if let Some(havok_config) = havok_cli::HavokCliConfig::detect() {
            let profiles = havok_cli::list_hko_configs(&havok_config.config_dir);
            eprintln!("[scene_execute_import] havok profiles found: {:?}", profiles);
            let profile = pick_best_hkt_profile(&profiles);
            if let Some(profile) = profile {
                eprintln!("[scene_execute_import] using havok profile: {}", profile);
                let dae_bytes_clone = dae_bytes.clone();
                match tauri::async_runtime::spawn_blocking(move || {
                    havok_cli::generate_hkt_from_dae(&dae_bytes_clone, &profile, &havok_config)
                })
                .await
                {
                    Ok(Ok(hkt_bytes)) => {
                        eprintln!(
                            "[scene_execute_import] HKT generated: {} bytes",
                            hkt_bytes.len()
                        );
                        state.with_session_mut(&options.session_id, |s| {
                            s.store_hkt_bytes(&options.import_id, hkt_bytes)
                        })?;
                        hkt_generated = true;
                    }
                    Ok(Err(e)) => {
                        eprintln!("[scene_execute_import] HKT generation failed (non-fatal): {}", e);
                    }
                    Err(e) => {
                        eprintln!("[scene_execute_import] HKT spawn_blocking join error (non-fatal): {}", e);
                    }
                }
            } else {
                eprintln!("[scene_execute_import] no suitable havok profile found, skipping HKT");
            }
        } else {
            eprintln!("[scene_execute_import] Havok SDK not detected, skipping HKT");
        }
    }

    eprintln!(
        "[scene_execute_import] done: name={} ssbh_generated={} hkt_generated={}",
        name, ssbh_generated, hkt_generated
    );
    Ok(ImportResult {
        import_id: options.import_id,
        name,
        ssbh_generated,
        hkt_generated,
    })
}

/// Pick the best .hko profile for mesh-to-HKT conversion.
/// Prefers `Destruction` profiles over `Animation`/`Behavior` since we are
/// converting geometry (not skeletal animations).
fn pick_best_hkt_profile(profiles: &[String]) -> Option<String> {
    static PREFERRED_ORDER: &[&str] = &[
        "Destruction2012\\simpleExport",
        "Destruction2012\\fullExport",
        "Destruction\\simpleExport",
        "Destruction\\fullExport",
        "Behavior\\terrain",
    ];

    for needle in PREFERRED_ORDER {
        if let Some(p) = profiles.iter().find(|p| p.starts_with(needle)) {
            return Some(p.clone());
        }
    }

    if let Some(p) = profiles.iter().find(|p| {
        let lower = p.to_ascii_lowercase();
        !lower.starts_with("animation") && !lower.starts_with("behavior")
    }) {
        return Some(p.clone());
    }

    profiles.first().cloned()
}

fn convert_dae_bytes_to_ssbh_artifacts(
    dae_bytes: &[u8],
    ssbh_config: &crate::scene_memory_session::SsbhConvertConfig,
) -> Result<SsbhArtifacts, String> {
    eprintln!(
        "[convert_dae_bytes_to_ssbh] start: dae_bytes_len={} base_filename={}",
        dae_bytes.len(),
        ssbh_config.base_filename
    );
    let temp_dir = tempfile::tempdir().map_err(|e| {
        eprintln!("[convert_dae_bytes_to_ssbh] failed to create temp dir: {}", e);
        format!("Failed to create temp dir: {e}")
    })?;
    let input_path = temp_dir.path().join("input.dae");
    eprintln!(
        "[convert_dae_bytes_to_ssbh] writing temp DAE to {}",
        input_path.display()
    );
    std::fs::write(&input_path, dae_bytes).map_err(|e| {
        eprintln!("[convert_dae_bytes_to_ssbh] failed to write temp DAE: {}", e);
        format!("Failed to write temp DAE: {e}")
    })?;

    let up_axis = match ssbh_config.up_axis.to_ascii_lowercase().as_str() {
        "z_up" | "zup" => crate::ssbh_dae::UpAxisConversion::ZUp,
        "none" | "no_conversion" => crate::ssbh_dae::UpAxisConversion::NoConversion,
        _ => crate::ssbh_dae::UpAxisConversion::YUp,
    };
    eprintln!("[convert_dae_bytes_to_ssbh] up_axis={:?}", up_axis);

    let convert_config = DaeConvertConfig {
        output_directory: temp_dir.path().to_path_buf(),
        base_filename: ssbh_config.base_filename.clone(),
        scale_factor: ssbh_config.scale_factor as f32,
        up_axis_conversion: up_axis,
        flip_uv: false,
        include_geometry_names: Vec::new(),
        write_numdlb: ssbh_config.write_numdlb,
        write_numshb: ssbh_config.write_numshb,
        write_nusktb: ssbh_config.write_nusktb,
        modl_entries: Vec::new(),
    };

    eprintln!(
        "[convert_dae_bytes_to_ssbh] calling convert_dae_file: numdlb={} numshb={} nusktb={}",
        convert_config.write_numdlb, convert_config.write_numshb, convert_config.write_nusktb
    );
    let (converted_files, stats) =
        convert_dae_file(&input_path, &convert_config).map_err(|e| {
            eprintln!("[convert_dae_bytes_to_ssbh] convert_dae_file failed: {}", e);
            e.to_string()
        })?;

    eprintln!(
        "[convert_dae_bytes_to_ssbh] convert_dae_file success: mesh_objects={} total_vertices={} total_indices={} bones={}",
        stats.mesh_objects, stats.total_vertices, stats.total_triangle_indices, stats.bones
    );
    eprintln!(
        "[convert_dae_bytes_to_ssbh] output files: numdlb={} numshb={} nusktb={} numatb={}",
        converted_files.numdlb_path.as_ref().map_or("none".to_string(), |p| p.display().to_string()),
        converted_files.numshb_path.as_ref().map_or("none".to_string(), |p| p.display().to_string()),
        converted_files.nusktb_path.as_ref().map_or("none".to_string(), |p| p.display().to_string()),
        converted_files.numatb_path.as_ref().map_or("none".to_string(), |p| p.display().to_string()),
    );

    let read_opt = |label: &str, path: &Option<std::path::PathBuf>| -> Result<Vec<u8>, String> {
        match path {
            Some(p) => {
                let data = std::fs::read(p).map_err(|e| {
                    eprintln!("[convert_dae_bytes_to_ssbh] failed to read {}: {}", label, e);
                    format!("Failed to read {}: {e}", p.display())
                })?;
                eprintln!("[convert_dae_bytes_to_ssbh] read {}: {} bytes", label, data.len());
                Ok(data)
            }
            None => {
                eprintln!("[convert_dae_bytes_to_ssbh] {} not generated (None)", label);
                Ok(Vec::new())
            }
        }
    };

    let artifacts = SsbhArtifacts {
        numdlb: read_opt("numdlb", &converted_files.numdlb_path)?,
        numshb: read_opt("numshb", &converted_files.numshb_path)?,
        nusktb: converted_files
            .nusktb_path
            .as_ref()
            .map(|p| {
                std::fs::read(p).map_err(|e| {
                    eprintln!("[convert_dae_bytes_to_ssbh] failed to read nusktb: {}", e);
                    format!("Failed to read nusktb: {e}")
                })
            })
            .transpose()?,
        numatb: read_opt("numatb", &converted_files.numatb_path)?,
        maya_numatb: None,
        jnttbl: Vec::new(),
    };
    eprintln!("[convert_dae_bytes_to_ssbh] done, artifacts ready");
    Ok(artifacts)
}

#[tauri::command]
pub async fn scene_generate_hkt(
    state: State<'_, SceneSessionState>,
    options: GenerateHktOptions,
) -> Result<bool, String> {
    eprintln!(
        "[scene_generate_hkt] session_id={} import_id={} profile={}",
        options.session_id, options.import_id, options.config_profile
    );
    let dae_bytes = state.with_session(&options.session_id, |s| {
        let import = s.find_import(&options.import_id)?;
        eprintln!("[scene_generate_hkt] dae_bytes_len={}", import.dae_bytes.len());
        Ok(import.dae_bytes.clone())
    }).map_err(|e| {
        eprintln!("[scene_generate_hkt] find_import failed: {}", e);
        e
    })?;

    let havok_config = havok_cli::HavokCliConfig::detect().ok_or_else(|| {
        eprintln!("[scene_generate_hkt] Havok SDK not found");
        "Havok SDK not found".to_string()
    })?;

    let profile = options.config_profile.clone();
    eprintln!("[scene_generate_hkt] calling generate_hkt_from_dae with profile={}", profile);
    let hkt_bytes = tauri::async_runtime::spawn_blocking(move || {
        havok_cli::generate_hkt_from_dae(&dae_bytes, &profile, &havok_config)
    })
    .await
    .map_err(|e| {
        eprintln!("[scene_generate_hkt] spawn_blocking join error: {}", e);
        format!("Task join error: {e}")
    })?
    .map_err(|e| {
        eprintln!("[scene_generate_hkt] generate_hkt_from_dae failed: {}", e);
        e
    })?;

    eprintln!("[scene_generate_hkt] generated {} bytes", hkt_bytes.len());
    state.with_session_mut(&options.session_id, |s| {
        s.store_hkt_bytes(&options.import_id, hkt_bytes.clone())?;
        s.add_havok_data(HavokCollisionData {
            source_id: options.import_id.clone(),
            hkt_xml: String::new(),
            raw_bytes: hkt_bytes,
        });
        Ok(())
    })?;

    eprintln!("[scene_generate_hkt] done");
    Ok(true)
}

#[tauri::command]
pub fn scene_get_havok_data(
    state: State<'_, SceneSessionState>,
    session_id: String,
    source_id: String,
) -> Result<Option<HavokDataResult>, String> {
    state.with_session(&session_id, |s| {
        Ok(s.get_havok_data(&source_id).map(|d| HavokDataResult {
            source_id: d.source_id.clone(),
            hkt_xml: d.hkt_xml.clone(),
            raw_bytes: d.raw_bytes.clone(),
        }))
    })
}

#[tauri::command]
pub fn scene_list_havok_data(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<Vec<HavokDataResult>, String> {
    state.with_session(&session_id, |s| {
        Ok(s.havok_data
            .iter()
            .map(|d| HavokDataResult {
                source_id: d.source_id.clone(),
                hkt_xml: d.hkt_xml.clone(),
                raw_bytes: d.raw_bytes.clone(),
            })
            .collect())
    })
}

#[tauri::command]
pub async fn scene_save_as_folder(
    state: State<'_, SceneSessionState>,
    session_id: String,
    output_path: String,
) -> Result<SaveResult, String> {
    let artifacts = state.with_session(&session_id, |s| Ok(s.collect_save_artifacts()))?;

    let output_dir = output_path.clone();
    let count = tauri::async_runtime::spawn_blocking(move || -> Result<u32, String> {
        let base = Path::new(&output_dir);
        std::fs::create_dir_all(base)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;

        let mut written = 0u32;
        for artifact in &artifacts {
            let target = base.join(&artifact.relative_path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create dir {}: {e}", parent.display()))?;
            }
            std::fs::write(&target, &artifact.data)
                .map_err(|e| format!("Failed to write {}: {e}", target.display()))?;
            written += 1;
        }
        Ok(written)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    state.with_session_mut(&session_id, |s| {
        s.mark_clean();
        Ok(())
    })?;

    Ok(SaveResult {
        success: true,
        files_written: count,
        warnings: Vec::new(),
    })
}

#[tauri::command]
pub async fn scene_repack_in_place(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<SaveResult, String> {
    let (source, artifacts) = state.with_session(&session_id, |s| {
        let source_path = match &s.source {
            SceneSource::Folder { path } => path.clone(),
            SceneSource::Fhm2d { path } => {
                let p = Path::new(path);
                p.parent()
                    .map(|pp| pp.to_string_lossy().to_string())
                    .unwrap_or_else(|| path.clone())
            }
            SceneSource::New => {
                return Err("Cannot repack a new session without a source path".into())
            }
        };
        Ok((source_path, s.collect_save_artifacts()))
    })?;

    let count = tauri::async_runtime::spawn_blocking(move || -> Result<u32, String> {
        let base = Path::new(&source);
        std::fs::create_dir_all(base)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;

        let mut written = 0u32;
        for artifact in &artifacts {
            let target = base.join(&artifact.relative_path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create dir {}: {e}", parent.display()))?;
            }
            std::fs::write(&target, &artifact.data)
                .map_err(|e| format!("Failed to write {}: {e}", target.display()))?;
            written += 1;
        }
        Ok(written)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    state.with_session_mut(&session_id, |s| {
        s.mark_clean();
        Ok(())
    })?;

    Ok(SaveResult {
        success: true,
        files_written: count,
        warnings: Vec::new(),
    })
}

#[tauri::command]
pub fn scene_list_imports(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<Vec<ImportResult>, String> {
    state.with_session(&session_id, |s| {
        Ok(s.pending_imports
            .iter()
            .map(|i| ImportResult {
                import_id: i.id.clone(),
                name: i.name.clone(),
                ssbh_generated: i.ssbh_artifacts.is_some(),
                hkt_generated: i.hkt_bytes.is_some(),
            })
            .collect())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scene_memory_session::{
        ImportConfig, SceneSessionState, SceneSource, StageBundleMemory,
    };
    use std::collections::HashMap;

    const STAGE_ROOT: &str = r"E:\XB\解包\com\test\0x4D1F5138\0\0";
    const DAE_DIR: &str = r"D:\output\exvs2\zabanya";

    fn skip_if_missing(path: &str) -> bool {
        if !std::path::Path::new(path).exists() {
            eprintln!("[SKIP] Test data not found: {path}");
            return true;
        }
        false
    }

    #[test]
    fn load_real_stage_bundle_into_session() {
        if skip_if_missing(STAGE_ROOT) {
            return;
        }

        let bundle =
            fhm2d_stage::load_stage_bundle_impl(STAGE_ROOT).expect("load_stage_bundle_impl failed");

        assert!(
            !bundle.placement_entries.is_empty(),
            "stage201 should have placement entries"
        );
        assert!(
            !bundle.graphic_params.is_empty(),
            "stage201 should have graphic params"
        );
        println!(
            "[OK] Stage loaded: {} placement entries, {} header cols, {} graphic params, {} warnings",
            bundle.placement_entries.len(),
            bundle.placement_header.len(),
            bundle.graphic_params.len(),
            bundle.warnings.len(),
        );

        let state = SceneSessionState::default();
        let sid = state.create_session(SceneSource::Folder {
            path: STAGE_ROOT.to_string(),
        });
        state
            .with_session_mut(&sid, |s| {
                s.placement_header = bundle.placement_header;
                s.placement_entries = bundle
                    .placement_entries
                    .into_iter()
                    .map(|e| PlacementEntry {
                        vdk_type: e.vdk_type,
                        object_number: e.object_number,
                        pos_x: e.pos_x,
                        pos_y: e.pos_y,
                        pos_z: e.pos_z,
                        rot_x: e.rot_x,
                        rot_y: e.rot_y,
                        rot_z: e.rot_z,
                        scale_x: e.scale_x,
                        scale_y: e.scale_y,
                        scale_z: e.scale_z,
                        raw_fields: e.raw_fields,
                    })
                    .collect();
                s.graphic_params = bundle
                    .graphic_params
                    .into_iter()
                    .map(|g| GraphicParam {
                        key: g.key,
                        value: g.value,
                    })
                    .collect();
                Ok(())
            })
            .unwrap();

        let is_dirty = state.with_session(&sid, |s| Ok(s.dirty)).unwrap();
        assert!(!is_dirty, "freshly loaded session should not be dirty");

        let placement_count = state
            .with_session(&sid, |s| Ok(s.placement_entries.len()))
            .unwrap();
        println!("[OK] Session has {placement_count} placement entries");
        assert!(placement_count > 0);
    }

    #[test]
    fn import_real_dae_and_convert_to_ssbh() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let dae_bytes = std::fs::read(&dae_path).expect("Failed to read backpack_up.dae");
        println!("[OK] Read DAE: {} bytes", dae_bytes.len());

        let state = SceneSessionState::default();
        let sid = state.create_session(SceneSource::New);
        let import_id = state
            .with_session_mut(&sid, |s| Ok(s.add_import("backpack_up".into(), dae_bytes.clone())))
            .unwrap();

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: false,
            material_template: None,
        };

        state
            .with_session_mut(&sid, |s| {
                let import = s.find_import_mut(&import_id)?;
                import.config = ImportConfig {
                    load_to_scene: false,
                    convert_to_ssbh: true,
                    generate_hkt: false,
                    ssbh_config: Some(ssbh_config.clone()),
                };
                Ok(())
            })
            .unwrap();

        let artifacts = convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config)
            .expect("SSBH conversion failed");

        println!(
            "[OK] SSBH artifacts: numdlb={} bytes, numshb={} bytes, nusktb={:?} bytes, numatb={} bytes",
            artifacts.numdlb.len(),
            artifacts.numshb.len(),
            artifacts.nusktb.as_ref().map(|v| v.len()),
            artifacts.numatb.len(),
        );

        assert!(
            !artifacts.numdlb.is_empty(),
            "numdlb should not be empty for a valid DAE"
        );
        assert!(
            !artifacts.numshb.is_empty(),
            "numshb should not be empty for a valid DAE"
        );

        state
            .with_session_mut(&sid, |s| s.store_ssbh_artifacts(&import_id, artifacts))
            .unwrap();

        let has_ssbh = state
            .with_session(&sid, |s| {
                let import = s.find_import(&import_id)?;
                Ok(import.ssbh_artifacts.is_some())
            })
            .unwrap();
        assert!(has_ssbh, "import should have SSBH artifacts after conversion");
        println!("[OK] SSBH artifacts stored in session");
    }

    #[test]
    fn full_pipeline_import_convert_save() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let dae_bytes = std::fs::read(&dae_path).expect("Failed to read DAE");

        let state = SceneSessionState::default();
        let sid = state.create_session(SceneSource::New);

        let import_id = state
            .with_session_mut(&sid, |s| Ok(s.add_import("backpack_up".into(), dae_bytes.clone())))
            .unwrap();

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: false,
            material_template: None,
        };

        state
            .with_session_mut(&sid, |s| {
                let import = s.find_import_mut(&import_id)?;
                import.config = ImportConfig {
                    load_to_scene: false,
                    convert_to_ssbh: true,
                    generate_hkt: false,
                    ssbh_config: Some(ssbh_config.clone()),
                };
                Ok(())
            })
            .unwrap();

        let artifacts = convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config)
            .expect("SSBH conversion failed");
        state
            .with_session_mut(&sid, |s| s.store_ssbh_artifacts(&import_id, artifacts))
            .unwrap();

        let save_artifacts = state
            .with_session(&sid, |s| Ok(s.collect_save_artifacts()))
            .unwrap();

        assert!(
            !save_artifacts.is_empty(),
            "should have artifacts to save after SSBH conversion"
        );

        println!("[OK] Save artifacts ({} files):", save_artifacts.len());
        for (i, a) in save_artifacts.iter().enumerate() {
            println!("  [{i}] {} ({} bytes)", a.relative_path, a.data.len());
        }

        assert!(
            save_artifacts.iter().any(|a| a.relative_path.contains("numdlb")),
            "should contain numdlb artifact"
        );
        assert!(
            save_artifacts.iter().any(|a| a.relative_path.contains("numshb")),
            "should contain numshb artifact"
        );

        let temp_output = tempfile::tempdir().expect("Failed to create temp dir");
        let output_path = temp_output.path();

        for artifact in &save_artifacts {
            let target = output_path.join(&artifact.relative_path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(&target, &artifact.data).unwrap();
        }

        for artifact in &save_artifacts {
            let target = output_path.join(&artifact.relative_path);
            assert!(target.exists(), "written file should exist: {}", target.display());
            let read_back = std::fs::read(&target).unwrap();
            assert_eq!(
                read_back.len(),
                artifact.data.len(),
                "file size mismatch for {}",
                artifact.relative_path
            );
        }

        state
            .with_session_mut(&sid, |s| {
                s.mark_clean();
                Ok(())
            })
            .unwrap();
        let is_dirty = state.with_session(&sid, |s| Ok(s.dirty)).unwrap();
        assert!(!is_dirty, "session should be clean after save");
        println!("[OK] Full pipeline passed: import -> convert -> save -> verify");
    }

    #[test]
    fn stage_plus_import_combined_save() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(STAGE_ROOT) || skip_if_missing(&dae_path) {
            return;
        }

        let state = SceneSessionState::default();
        let sid = state.create_session(SceneSource::Folder {
            path: STAGE_ROOT.to_string(),
        });

        let csv_bytes = std::fs::read(format!(r"{STAGE_ROOT}\info\placement.csv"))
            .expect("Failed to read placement.csv");
        let gp_bytes = std::fs::read(format!(r"{STAGE_ROOT}\info\graphic_param.csv"))
            .expect("Failed to read graphic_param.csv");

        state
            .with_session_mut(&sid, |s| {
                let mut root_files = HashMap::new();
                root_files.insert("info/placement.csv".to_string(), csv_bytes);
                root_files.insert("info/graphic_param.csv".to_string(), gp_bytes);
                s.base_bundle = Some(StageBundleMemory {
                    root_files,
                    sub_model_files: HashMap::new(),
                });
                Ok(())
            })
            .unwrap();

        let dae_bytes = std::fs::read(&dae_path).expect("Failed to read DAE");
        let import_id = state
            .with_session_mut(&sid, |s| Ok(s.add_import("backpack_up".into(), dae_bytes.clone())))
            .unwrap();

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: false,
            material_template: None,
        };

        let artifacts = convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config)
            .expect("SSBH conversion failed");
        state
            .with_session_mut(&sid, |s| {
                let import = s.find_import_mut(&import_id)?;
                import.config = ImportConfig {
                    load_to_scene: false,
                    convert_to_ssbh: true,
                    generate_hkt: false,
                    ssbh_config: Some(ssbh_config),
                };
                s.store_ssbh_artifacts(&import_id, artifacts)?;
                Ok(())
            })
            .unwrap();

        let save_artifacts = state
            .with_session(&sid, |s| Ok(s.collect_save_artifacts()))
            .unwrap();

        let has_csv = save_artifacts
            .iter()
            .any(|a| a.relative_path.contains("placement.csv"));
        let has_ssbh = save_artifacts
            .iter()
            .any(|a| a.relative_path.contains("numdlb"));

        println!(
            "[OK] Combined artifacts: {} files (has_csv={has_csv}, has_ssbh={has_ssbh})",
            save_artifacts.len()
        );
        for a in &save_artifacts {
            println!("  {} ({} bytes)", a.relative_path, a.data.len());
        }

        assert!(has_csv, "combined save should include stage CSV files");
        assert!(has_ssbh, "combined save should include new import SSBH files");
    }

    #[test]
    fn multi_dae_import_pipeline() {
        let dae_files = ["backpack_up.dae", "backpack_bottom.dae", "body.dae"];
        let mut all_exist = true;
        for f in &dae_files {
            let path = format!(r"{DAE_DIR}\{f}");
            if !std::path::Path::new(&path).exists() {
                eprintln!("[SKIP] Missing: {path}");
                all_exist = false;
            }
        }
        if !all_exist {
            return;
        }

        let state = SceneSessionState::default();
        let sid = state.create_session(SceneSource::New);

        let mut import_ids = Vec::new();
        for f in &dae_files {
            let path = format!(r"{DAE_DIR}\{f}");
            let bytes = std::fs::read(&path).expect("read DAE");
            let name = f.replace(".dae", "");
            let id = state
                .with_session_mut(&sid, |s| Ok(s.add_import(name, bytes)))
                .unwrap();
            import_ids.push(id);
        }

        let count = state
            .with_session(&sid, |s| Ok(s.pending_imports.len()))
            .unwrap();
        assert_eq!(count, 3, "should have 3 pending imports");

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "placeholder".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: false,
            material_template: None,
        };

        let mut convert_ok = 0;
        let mut convert_fail = 0;

        for (i, import_id) in import_ids.iter().enumerate() {
            let (dae_bytes, name) = state
                .with_session(&sid, |s| {
                    let import = s.find_import(import_id)?;
                    Ok((import.dae_bytes.clone(), import.name.clone()))
                })
                .unwrap();

            let mut cfg = ssbh_config.clone();
            cfg.base_filename = name.clone();

            match convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &cfg) {
                Ok(artifacts) => {
                    println!(
                        "[OK] [{i}] {name}: numdlb={} numshb={} bytes",
                        artifacts.numdlb.len(),
                        artifacts.numshb.len()
                    );
                    state
                        .with_session_mut(&sid, |s| s.store_ssbh_artifacts(import_id, artifacts))
                        .unwrap();
                    convert_ok += 1;
                }
                Err(e) => {
                    eprintln!("[WARN] [{i}] {name} conversion failed: {e}");
                    convert_fail += 1;
                }
            }
        }

        println!(
            "[OK] Multi-DAE: {convert_ok} converted, {convert_fail} failed out of {}",
            dae_files.len()
        );
        assert!(convert_ok > 0, "at least one DAE should convert successfully");

        let save_artifacts = state
            .with_session(&sid, |s| Ok(s.collect_save_artifacts()))
            .unwrap();
        println!("[OK] Total save artifacts: {}", save_artifacts.len());
        for a in &save_artifacts {
            println!("  {} ({} bytes)", a.relative_path, a.data.len());
        }
        assert!(!save_artifacts.is_empty());
    }

    #[test]
    fn session_isolation_with_real_data() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let dae_bytes = std::fs::read(&dae_path).unwrap();
        let state = SceneSessionState::default();

        let sid1 = state.create_session(SceneSource::New);
        let sid2 = state.create_session(SceneSource::New);

        state
            .with_session_mut(&sid1, |s| {
                s.add_import("model_a".into(), dae_bytes.clone());
                s.add_import("model_b".into(), dae_bytes.clone());
                Ok(())
            })
            .unwrap();

        state
            .with_session_mut(&sid2, |s| {
                s.add_import("model_c".into(), dae_bytes.clone());
                Ok(())
            })
            .unwrap();

        let count1 = state
            .with_session(&sid1, |s| Ok(s.pending_imports.len()))
            .unwrap();
        let count2 = state
            .with_session(&sid2, |s| Ok(s.pending_imports.len()))
            .unwrap();

        assert_eq!(count1, 2, "session1 should have 2 imports");
        assert_eq!(count2, 1, "session2 should have 1 import");

        state.destroy_session(&sid1).unwrap();
        assert!(state.with_session(&sid1, |_| Ok(())).is_err());

        let count2_after = state
            .with_session(&sid2, |s| Ok(s.pending_imports.len()))
            .unwrap();
        assert_eq!(
            count2_after, 1,
            "session2 should be unaffected by session1 destroy"
        );
        println!("[OK] Session isolation verified with real DAE data");
    }

    #[test]
    fn analyze_real_dae_returns_valid_report() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(&dae_path) {
            return;
        }

        let report = crate::ssbh_dae::analyze_dae_path(std::path::Path::new(&dae_path))
            .expect("analyze_dae_path failed");

        assert!(
            !report.mesh_rows.is_empty(),
            "DAE analysis should find at least one mesh"
        );
        assert!(report.can_convert, "backpack_up.dae should be convertible");
        assert!(
            report.blocking_errors.is_empty(),
            "backpack_up.dae should have no blocking errors"
        );

        let total_verts: usize = report.mesh_rows.iter().map(|r| r.vertex_count).sum();
        assert!(
            total_verts > 0,
            "total vertex count should be positive"
        );

        println!("[OK] DAE analysis: {} meshes, {} total verts, {} bones, up_axis={}, can_convert={}",
            report.mesh_rows.len(),
            total_verts,
            report.bone_count,
            report.up_axis,
            report.can_convert,
        );
        for row in &report.mesh_rows {
            println!(
                "  mesh '{}': {} verts, {} tris, {} bone groups, max_inf={}",
                row.name, row.vertex_count, row.triangle_count,
                row.bone_influence_groups, row.max_influences_per_vertex
            );
        }
    }

    #[test]
    fn analyze_all_zabanya_dae_files() {
        if skip_if_missing(DAE_DIR) {
            return;
        }

        let dae_files: Vec<_> = std::fs::read_dir(DAE_DIR)
            .expect("read DAE_DIR")
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .map_or(false, |ext| ext.eq_ignore_ascii_case("dae"))
            })
            .collect();

        assert!(!dae_files.is_empty(), "should find DAE files in {DAE_DIR}");

        let mut ok_count = 0;
        let mut fail_count = 0;

        for entry in &dae_files {
            let path = entry.path();
            match crate::ssbh_dae::analyze_dae_path(&path) {
                Ok(report) => {
                    let total_verts: usize = report.mesh_rows.iter().map(|r| r.vertex_count).sum();
                    println!(
                        "[OK] {}: {} meshes, {} verts, {} bones, convert={}",
                        path.file_name().unwrap().to_string_lossy(),
                        report.mesh_rows.len(),
                        total_verts,
                        report.bone_count,
                        report.can_convert,
                    );
                    ok_count += 1;
                }
                Err(e) => {
                    eprintln!(
                        "[FAIL] {}: {}",
                        path.file_name().unwrap().to_string_lossy(),
                        e
                    );
                    fail_count += 1;
                }
            }
        }

        println!(
            "[SUMMARY] {ok_count}/{} DAE files analyzed ({fail_count} failures)",
            dae_files.len()
        );
        assert!(ok_count > 0, "at least one DAE should analyze successfully");
    }

    #[test]
    fn full_session_lifecycle_stage_then_import_then_save() {
        let dae_path = format!(r"{DAE_DIR}\backpack_up.dae");
        if skip_if_missing(STAGE_ROOT) || skip_if_missing(&dae_path) {
            return;
        }

        let state = SceneSessionState::default();

        let sid = state.create_session(SceneSource::Folder {
            path: STAGE_ROOT.to_string(),
        });
        assert!(!sid.is_empty());

        let bundle = fhm2d_stage::load_stage_bundle_impl(STAGE_ROOT)
            .expect("load stage bundle");
        state
            .with_session_mut(&sid, |s| {
                s.placement_header = bundle.placement_header;
                s.placement_entries = bundle
                    .placement_entries
                    .into_iter()
                    .map(|e| PlacementEntry {
                        vdk_type: e.vdk_type,
                        object_number: e.object_number,
                        pos_x: e.pos_x,
                        pos_y: e.pos_y,
                        pos_z: e.pos_z,
                        rot_x: e.rot_x,
                        rot_y: e.rot_y,
                        rot_z: e.rot_z,
                        scale_x: e.scale_x,
                        scale_y: e.scale_y,
                        scale_z: e.scale_z,
                        raw_fields: e.raw_fields,
                    })
                    .collect();
                s.graphic_params = bundle
                    .graphic_params
                    .into_iter()
                    .map(|g| GraphicParam {
                        key: g.key,
                        value: g.value,
                    })
                    .collect();
                Ok(())
            })
            .unwrap();

        let is_dirty_1 = state.with_session(&sid, |s| Ok(s.dirty)).unwrap();
        assert!(!is_dirty_1, "fresh session should not be dirty");

        let dae_bytes = std::fs::read(&dae_path).expect("read DAE");
        let import_id = state
            .with_session_mut(&sid, |s| Ok(s.add_import("backpack_up".into(), dae_bytes.clone())))
            .unwrap();

        let ssbh_config = crate::scene_memory_session::SsbhConvertConfig {
            base_filename: "backpack_up".into(),
            scale_factor: 1.0,
            up_axis: "y_up".into(),
            write_numdlb: true,
            write_numshb: true,
            write_nusktb: true,
            write_numatb: true,
            write_jnttbl: true,
            write_maya_profile: false,
            material_template: None,
        };

        state
            .with_session_mut(&sid, |s| {
                let import = s.find_import_mut(&import_id)?;
                import.config = ImportConfig {
                    load_to_scene: false,
                    convert_to_ssbh: true,
                    generate_hkt: false,
                    ssbh_config: Some(ssbh_config.clone()),
                };
                Ok(())
            })
            .unwrap();

        let artifacts = convert_dae_bytes_to_ssbh_artifacts(&dae_bytes, &ssbh_config)
            .expect("SSBH conversion");
        state
            .with_session_mut(&sid, |s| s.store_ssbh_artifacts(&import_id, artifacts))
            .unwrap();

        let is_dirty_2 = state.with_session(&sid, |s| Ok(s.dirty)).unwrap();
        assert!(is_dirty_2, "session should be dirty after import+convert");

        let imports = state
            .with_session(&sid, |s| {
                Ok(s.pending_imports
                    .iter()
                    .map(|i| (i.id.clone(), i.name.clone(), i.ssbh_artifacts.is_some()))
                    .collect::<Vec<_>>())
            })
            .unwrap();
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].1, "backpack_up");
        assert!(imports[0].2, "should have ssbh artifacts");

        let save_artifacts = state
            .with_session(&sid, |s| Ok(s.collect_save_artifacts()))
            .unwrap();
        assert!(!save_artifacts.is_empty(), "should have save artifacts");

        let has_numdlb = save_artifacts.iter().any(|a| a.relative_path.contains("numdlb"));
        let has_numshb = save_artifacts.iter().any(|a| a.relative_path.contains("numshb"));
        assert!(has_numdlb, "should contain numdlb");
        assert!(has_numshb, "should contain numshb");

        let temp_out = tempfile::tempdir().expect("temp dir");
        for artifact in &save_artifacts {
            let target = temp_out.path().join(&artifact.relative_path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(&target, &artifact.data).unwrap();
        }

        for artifact in &save_artifacts {
            let target = temp_out.path().join(&artifact.relative_path);
            assert!(target.exists(), "saved file should exist: {}", artifact.relative_path);
            let size = std::fs::metadata(&target).unwrap().len();
            assert_eq!(
                size as usize,
                artifact.data.len(),
                "size mismatch for {}",
                artifact.relative_path
            );
        }

        state
            .with_session_mut(&sid, |s| {
                s.mark_clean();
                Ok(())
            })
            .unwrap();
        let is_dirty_3 = state.with_session(&sid, |s| Ok(s.dirty)).unwrap();
        assert!(!is_dirty_3, "should be clean after mark_clean");

        state.destroy_session(&sid).unwrap();
        assert!(
            state.with_session(&sid, |_| Ok(())).is_err(),
            "session should be gone after destroy"
        );

        println!(
            "[OK] Full lifecycle: create -> load stage -> import DAE -> convert -> save ({} files) -> clean -> destroy",
            save_artifacts.len()
        );
    }
}
