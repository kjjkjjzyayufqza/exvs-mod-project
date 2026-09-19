//! Tauri commands for the arcade (Triad Battle) route editor.
//!
//! Everything here is a thin wrapper: the logic lives in `format::triad_*` so
//! it can be tested without a running app. Payloads are small — the three
//! route tables together are well under 100 KB and a briefing is about 1.5 KB
//! — so no chunked transfer is needed.

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::format::mission_hash::{check_collisions, triad_scene_identity, SceneIdentity};
use crate::format::triad_route_document::TriadRouteDocument;
use crate::format::triad_route_validate::{
    has_blocking_issue, validate_route, RouteValidationContext,
};
use crate::format::triad_route_workspace::{
    apply_route, load_briefing, load_stage_script, load_workspace,
    rename_briefings_to_scene_names, TriadWorkspacePaths,
};

fn paths_from_json(value: Value) -> Result<TriadWorkspacePaths, String> {
    serde_json::from_value(value).map_err(|e| format!("Invalid workspace paths: {e}"))
}

fn document_from_json(value: Value) -> Result<TriadRouteDocument, String> {
    serde_json::from_value(value).map_err(|e| format!("Invalid route project: {e}"))
}

fn to_value<T: Serialize>(value: &T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|e| format!("Serialize failed: {e}"))
}

#[tauri::command]
pub fn load_triad_workspace(paths_json: Value) -> Result<Value, String> {
    to_value(&load_workspace(&paths_from_json(paths_json)?)?)
}

#[tauri::command]
pub fn load_triad_briefing(outmission_dir: &str, scene_key: u32) -> Result<Value, String> {
    to_value(&load_briefing(Path::new(outmission_dir), scene_key)?)
}

/// Read one stage's mission script into the editor's draft shape.
///
/// A stage whose script package has not been unpacked yet, or whose script
/// this build cannot reproduce byte for byte, reports that instead of handing
/// back a half-understood configuration.
#[tauri::command]
pub fn load_triad_stage_script(
    script_dirs: Vec<String>,
    scene_key: u32,
    scene_name: Option<String>,
) -> Result<Value, String> {
    to_value(&load_stage_script(
        &script_dirs,
        scene_key,
        scene_name.as_deref(),
    )?)
}

/// Give every briefing in the outmission folder the name of its scene.
///
/// Purely cosmetic: the game and this editor both find briefings through the
/// package structure, not by filename. It is offered because a folder of 341
/// files called `0.bin` tells a modder nothing.
#[tauri::command]
pub fn rename_triad_briefings(outmission_dir: &str) -> Result<Value, String> {
    to_value(&rename_briefings_to_scene_names(Path::new(outmission_dir))?)
}

/// Result of a validation pass, with the blocking flag already computed so the
/// UI does not have to re-derive the save gate.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RouteValidationResult {
    issues: Vec<crate::format::triad_route_validate::ValidationIssue>,
    blocked: bool,
    /// Reference lists the context arrived without. Every check that reads one
    /// was skipped rather than guessed, so the UI can say which invariants an
    /// otherwise clean result does not cover.
    not_checked: Vec<&'static str>,
}

#[tauri::command]
pub fn validate_triad_route(document_json: Value, context_json: Value) -> Result<Value, String> {
    let document = document_from_json(document_json)?;
    let context: RouteValidationContext = serde_json::from_value(context_json)
        .map_err(|e| format!("Invalid validation context: {e}"))?;
    let issues = validate_route(&document, &context);
    let blocked = has_blocking_issue(&issues);
    to_value(&RouteValidationResult {
        issues,
        blocked,
        not_checked: context.unloaded_reference_lists(),
    })
}

#[tauri::command]
pub fn apply_triad_route(document_json: Value, paths_json: Value) -> Result<Value, String> {
    let document = document_from_json(document_json)?;
    let paths = paths_from_json(paths_json)?;
    to_value(&apply_route(&document, &paths)?)
}

/// A generated scene identity plus whether either hash is already taken.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedSceneIdentity {
    #[serde(flatten)]
    identity: SceneIdentity,
    scene_key_collision: Option<String>,
    package_hash_collision: Option<String>,
}

/// Generate the official-style name and both hashes for new scenes.
///
/// `stage_numbers` is usually `[1, 2, 3]`, or `[1]` for an F-class course. The
/// caller passes the ids already in use so a clash is reported here rather
/// than discovered when the game silently loads the wrong row.
#[tauri::command]
pub fn generate_triad_scene_identity(
    category: char,
    course_number: u16,
    stage_numbers: Vec<u16>,
    existing_scene_keys: Vec<u32>,
    existing_package_hashes: Vec<u32>,
) -> Result<Value, String> {
    if stage_numbers.is_empty() {
        return Err("at least one stage number is required".to_string());
    }
    let scene_keys: HashSet<u32> = existing_scene_keys.into_iter().collect();
    let package_hashes: HashSet<u32> = existing_package_hashes.into_iter().collect();

    let generated = stage_numbers
        .into_iter()
        .map(|stage_number| {
            let identity = triad_scene_identity(category, course_number, stage_number, None)?;
            Ok(GeneratedSceneIdentity {
                scene_key_collision: check_collisions(identity.scene_key, &scene_keys).err(),
                package_hash_collision: check_collisions(identity.package_hash, &package_hashes)
                    .err(),
                identity,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    to_value(&generated)
}
