//! Tauri command wrappers for stage fhm2d rename and bundle loading.

use tauri::State;

use crate::fhm2d_memory_preview::Fhm2dMemorySessionState;
use crate::format::fhm2d::extract_fhm2d_to_memory_impl;
use crate::format::fhm2d_stage;

#[tauri::command]
pub async fn stage_apply_rename(
    extracted_dir: String,
) -> Result<fhm2d_stage::StageApplyRenameResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::stage_apply_rename_impl(&extracted_dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn load_stage_bundle(
    stage_root: String,
) -> Result<fhm2d_stage::StageBundle, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::load_stage_bundle_impl(&stage_root)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn import_stage_fhm2d_in_memory(
    state: State<'_, Fhm2dMemorySessionState>,
    source_path: String,
) -> Result<fhm2d_stage::StageInMemoryImportResult, String> {
    let path = source_path.trim().to_string();
    if path.is_empty() {
        return Err("source_path cannot be empty.".to_string());
    }

    let source_name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "stage".to_string());

    let source_name_for_extract = source_name.clone();

    let (extraction, virtual_tree, rename_warnings) =
        tauri::async_runtime::spawn_blocking(move || {
            let bytes = std::fs::read(&path)
                .map_err(|e| format!("Failed to read FHM2D file: {e}"))?;

            let extraction = extract_fhm2d_to_memory_impl(
                &bytes,
                &source_name_for_extract,
                None,
            )?;

            let (virtual_tree, rename_warnings) =
                fhm2d_stage::stage_rename_in_memory(&extraction.files)?;

            Ok::<_, String>((extraction, virtual_tree, rename_warnings))
        })
        .await
        .map_err(|e| e.to_string())??;

    let mut all_warnings = rename_warnings;

    let graphic_param_bytes: Option<Vec<u8>> = fhm2d_stage::find_info_file_data(
        &extraction.files,
        &virtual_tree,
        "graphic_param.csv",
    ).map(|d| d.to_vec());

    let placement_bytes: Option<Vec<u8>> = fhm2d_stage::find_info_file_data(
        &extraction.files,
        &virtual_tree,
        "placement.csv",
    ).map(|d| d.to_vec());

    let graphic_params = match graphic_param_bytes.as_deref() {
        Some(data) => fhm2d_stage::parse_graphic_param_csv_from_bytes(data, &mut all_warnings),
        None => {
            all_warnings.push("graphic_param.csv not found in info folder".to_string());
            Vec::new()
        }
    };

    let (placement_header, placement_entries) = match placement_bytes.as_deref() {
        Some(data) => fhm2d_stage::parse_placement_csv_from_bytes(data, &mut all_warnings),
        None => {
            all_warnings.push("placement.csv not found in info folder".to_string());
            (Vec::new(), Vec::new())
        }
    };

    let (base_model, sub_models, model_warnings) =
        crate::fhm2d_memory_preview::build_stage_preview_models(
            &state,
            source_name.clone(),
            extraction,
            &virtual_tree,
        )?;

    all_warnings.extend(model_warnings);

    let bundle = fhm2d_stage::StageBundle {
        root_path: format!("memory://{}", source_name),
        base_model,
        sub_models,
        graphic_params,
        placement_header,
        placement_entries,
        warnings: all_warnings.clone(),
    };

    Ok(fhm2d_stage::StageInMemoryImportResult {
        bundle,
        virtual_tree,
        warnings: all_warnings,
    })
}
