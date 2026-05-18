use serde::Serialize;
use tauri::State;

use crate::format::fhm2d_stage;
use crate::scene_memory_session::{
    GraphicParam, ImportConfig, PlacementEntry, SceneSessionState, SceneSource,
};

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

#[tauri::command]
pub fn scene_session_create(
    state: State<'_, SceneSessionState>,
    source: SceneSource,
) -> String {
    state.create_session(source)
}

#[tauri::command]
pub fn scene_session_destroy(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<(), String> {
    state.destroy_session(&session_id)
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
    state.with_session_mut(&session_id, |s| Ok(s.add_import(name, dae_bytes)))
}

#[tauri::command]
pub fn scene_configure_import(
    state: State<'_, SceneSessionState>,
    session_id: String,
    import_id: String,
    config: ImportConfig,
) -> Result<(), String> {
    state.with_session_mut(&session_id, |s| {
        let import = s.find_import_mut(&import_id)?;
        import.config = config;
        Ok(())
    })
}

#[tauri::command]
pub fn scene_remove_import(
    state: State<'_, SceneSessionState>,
    session_id: String,
    import_id: String,
) -> Result<(), String> {
    state.with_session_mut(&session_id, |s| s.remove_import(&import_id))
}

#[tauri::command]
pub async fn scene_open_folder(
    state: State<'_, SceneSessionState>,
    path: String,
) -> Result<SceneOpenResult, String> {
    let path_clone = path.clone();
    let bundle = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::load_stage_bundle_impl(&path_clone)
    })
    .await
    .map_err(|e| e.to_string())??;

    let warnings = bundle.warnings;
    let placement_header = bundle.placement_header;
    let placement_entries = bundle.placement_entries;
    let graphic_params = bundle.graphic_params;

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
        Ok(())
    })?;

    Ok(SceneOpenResult {
        session_id,
        root_path: path,
        warnings,
    })
}
