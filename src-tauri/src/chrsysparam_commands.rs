//! Tauri commands for the `chrsysparam.csyspm` action-table editor.

use std::fs;
use std::path::Path;

use serde_json::{json, Value};

use crate::format::chrsysparam::{build_chrsysparam, parse_chrsysparam, ChrSysParamFile};
use crate::format::chrsysparam_document::{from_document, to_document};
use crate::format::chrsysparam_msc_links::{resolve_msc_links, ChrSysMscLinks};
use crate::format::chrsysparam_schema::{field_specs, ChrSysTableKind, ROUTE_TABLE};
use crate::format::chrsysparam_validate::validate_chrsysparam;

fn file_from_json(file_json: Value) -> Result<ChrSysParamFile, String> {
    serde_json::from_value(file_json).map_err(|e| format!("Invalid chrsysparam data: {e}"))
}

#[tauri::command]
pub fn parse_chrsysparam_file(path: &str) -> Result<Value, String> {
    let data = fs::read(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let parsed = parse_chrsysparam(&data)?;
    serde_json::to_value(&parsed).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn build_chrsysparam_file(file_json: Value, output_path: &str) -> Result<(), String> {
    let bytes = build_chrsysparam(&file_from_json(file_json)?)?;
    fs::write(output_path, &bytes).map_err(|e| format!("Failed to write {output_path}: {e}"))
}

#[tauri::command]
pub fn get_chrsysparam_schema(action_columns: u32, transition_columns: u32) -> Result<Value, String> {
    let routes: Vec<Value> = ROUTE_TABLE
        .iter()
        .enumerate()
        .map(|(group, (route, flags, alternate_flags))| {
            json!({
                "group": group,
                "route": route,
                "flags": flags,
                "alternateFlags": alternate_flags,
            })
        })
        .collect();
    Ok(json!({
        "action": field_specs(ChrSysTableKind::Action, action_columns),
        "transition": field_specs(ChrSysTableKind::Transition, transition_columns),
        "routeTable": routes,
    }))
}

#[tauri::command]
pub fn resolve_chrsysparam_msc_links(script_dir: &str) -> Result<Value, String> {
    let links = resolve_msc_links(Path::new(script_dir))?;
    serde_json::to_value(&links).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn validate_chrsysparam_data(file_json: Value, links_json: Option<Value>) -> Result<Value, String> {
    let file = file_from_json(file_json)?;
    let links: Option<ChrSysMscLinks> = links_json
        .map(|value| serde_json::from_value(value).map_err(|e| format!("Invalid MSC links: {e}")))
        .transpose()?;
    let issues = validate_chrsysparam(&file, links.as_ref());
    serde_json::to_value(&issues).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn export_chrsysparam_document(file_json: Value, output_path: &str) -> Result<(), String> {
    let file = file_from_json(file_json)?;
    build_chrsysparam(&file)?;
    let text = serde_json::to_string_pretty(&to_document(&file))
        .map_err(|e| format!("Serialize failed: {e}"))?;
    fs::write(output_path, text).map_err(|e| format!("Failed to write {output_path}: {e}"))
}

#[tauri::command]
pub fn import_chrsysparam_document(path: &str) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let document: Value =
        serde_json::from_str(&text).map_err(|e| format!("{path} is not valid JSON: {e}"))?;
    let file = from_document(&document)?;
    build_chrsysparam(&file)?;
    serde_json::to_value(&file).map_err(|e| format!("Serialize failed: {e}"))
}
