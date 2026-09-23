//! Tauri commands for the arcade (Triad Battle) route editor.
//!
//! Everything here is a thin wrapper: the logic lives in `format::triad_*` so
//! it can be tested without a running app. Payloads are small — the three
//! route tables together are well under 100 KB and a briefing is about 1.5 KB
//! — so no chunked transfer is needed.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

use crate::format::mission_hash::{
    check_collisions, family_hash, triad_scene_identity, SceneIdentity, SCENE_KEY_STATE,
    SCRIPT_PACKAGE_STATE,
};
use crate::format::triad_repack_plan::plan_triad_repack;
use crate::format::triad_route_document::TriadRouteDocument;
use crate::format::triad_route_validate::{
    has_blocking_issue, validate_route, RouteValidationContext,
};
use crate::format::triad_route_workspace::{
    apply_route, load_briefing, load_stage_script, load_workspace, plan_route,
    rename_briefings_to_scene_names, renumber_course_category, TriadWorkspacePaths,
};
use crate::format::triad_scene_create::{
    create_triad_scene, scene_name_ownership, taken_ids, NewSceneRequest,
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

/// Read one mission script file into the map editor's preview shape.
///
/// Takes the file directly — a decompiled `.c` or a compiled `.mismsexc` —
/// so a modder can preview the script they are editing without it having to
/// be indexed by a route workspace first.
#[tauri::command]
pub fn load_mission_script_preview(script_path: &str) -> Result<Value, String> {
    to_value(&crate::format::mission_preview::load_mission_script_preview(
        script_path,
    )?)
}

/// Modification time of a mission script, for the preview's hot-reload poll.
#[tauri::command]
pub fn mission_script_modified_ms(script_path: &str) -> Result<u64, String> {
    crate::format::mission_preview::mission_script_modified_ms(script_path)
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

/// Describe what saving would write, without writing anything.
///
/// Runs the same planner `apply_triad_route` does, so the preview and the
/// save can never describe different things.
#[tauri::command]
pub fn preview_triad_route(document_json: Value, paths_json: Value) -> Result<Value, String> {
    let document = document_from_json(document_json)?;
    let paths = paths_from_json(paths_json)?;
    to_value(&plan_route(&document, &paths)?)
}

#[tauri::command]
pub fn apply_triad_route(document_json: Value, paths_json: Value) -> Result<Value, String> {
    let document = document_from_json(document_json)?;
    let paths = paths_from_json(paths_json)?;
    to_value(&apply_route(&document, &paths)?)
}

/// Reorder one category on the course select screen.
///
/// The screen groups by `CATEGORY` and orders by `NUMBER_IN_CATEGORY`, so the
/// only way to move a course is to renumber the whole category. `course_id_order`
/// is the category's course ids in the order they should appear; the first
/// one becomes number 1. This writes the course table, so the caller has to
/// have saved or dropped any open edits to the category first.
#[tauri::command]
pub fn renumber_triad_category(
    paths_json: Value,
    category: i32,
    course_id_order: Vec<i32>,
) -> Result<Value, String> {
    let paths = paths_from_json(paths_json)?;
    to_value(&renumber_course_category(&paths, category, &course_id_order)?)
}

/// List every mission package and say which ones the game is still missing.
///
/// Saving writes workspace folders; the game reads `.fhm2d`. This is the step
/// between them, and getting it wrong is silent: a route whose tables were
/// never repacked simply does not appear on the select screen. Nothing is
/// written here — the plan only reads.
#[tauri::command]
pub fn plan_triad_repack_packages(
    paths_json: Value,
    mod_folder: String,
    route_scene_names: Vec<String>,
) -> Result<Value, String> {
    let paths = paths_from_json(paths_json)?;
    to_value(&plan_triad_repack(&paths, &mod_folder, &route_scene_names)?)
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

/// A hashed scene name, what holds its ids, and whether it can be replaced.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HashedSceneName {
    #[serde(flatten)]
    identity: SceneIdentity,
    scene_key_collision: Option<String>,
    package_hash_collision: Option<String>,
    /// True when the only thing holding these ids is this workspace's own
    /// copy of the same scene, so creating it with `replaceExisting` works.
    replaceable: bool,
}

/// Hash scene names the modder typed, with the same clash check.
///
/// `generate_triad_scene_identity` builds official-style names from a category
/// and a number; this is its sibling for a name the modder edited, so the
/// dialog can show what a folder will be called and what it hashes to while
/// they are still typing, instead of after the files exist.
///
/// The taken set is built exactly the way `create_triad_scenes` builds it —
/// the ids the caller passes *plus* every scene key the outmission package
/// already has a briefing for. Checking a narrower set here is what let a
/// name read as free in the dialog and then fail on create.
#[tauri::command]
pub fn hash_triad_scene_names(
    names: Vec<String>,
    existing_scene_keys: Vec<u32>,
    existing_package_hashes: Vec<u32>,
    outmission_dir: String,
    workspace_root: String,
    script_prefix: String,
) -> Result<Value, String> {
    if names.is_empty() {
        return Err("at least one scene name is required".to_string());
    }
    let outmission = PathBuf::from(outmission_dir.trim().trim_end_matches(['/', '\\']));
    let script_root = PathBuf::from(workspace_root.trim().trim_end_matches(['/', '\\']))
        .join(script_prefix.trim().trim_end_matches(['/', '\\']));
    let (scene_key_set, package_hash_set) =
        taken_ids(&outmission, &existing_scene_keys, &existing_package_hashes)?;
    let scene_keys: HashSet<u32> = scene_key_set.into_iter().collect();
    let package_hashes: HashSet<u32> = package_hash_set.into_iter().collect();

    let hashed = names
        .iter()
        .map(|name| {
            let trimmed = name.trim();
            let identity = SceneIdentity {
                scene_key: family_hash(SCENE_KEY_STATE, trimmed)?,
                package_hash: family_hash(SCRIPT_PACKAGE_STATE, trimmed)?,
                name: trimmed.to_string(),
            };
            let owned = scene_name_ownership(
                &outmission,
                &script_root,
                trimmed,
                identity.scene_key,
                identity.package_hash,
            )?;
            let scene_key_taken = scene_keys.contains(&identity.scene_key);
            let package_taken = package_hashes.contains(&identity.package_hash);
            // Only ids held by this scene's own files can be reclaimed, and
            // a leftover folder counts even when its hash is not in the set.
            let replaceable = !owned.is_empty()
                && (!scene_key_taken || owned.briefing.is_some())
                && (!package_taken || owned.script_folder.is_some());
            Ok(HashedSceneName {
                scene_key_collision: check_collisions(identity.scene_key, &scene_keys).err(),
                package_hash_collision: check_collisions(identity.package_hash, &package_hashes)
                    .err(),
                replaceable,
                identity,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    to_value(&hashed)
}

/// Create the files a brand-new scene needs, by cloning a donor scene.
///
/// The stages of one course are created together so a later stage cannot be
/// handed an id an earlier one just took. Each scene is materialised in turn
/// and the ids it claims join the taken set before the next one is checked.
#[tauri::command]
pub fn create_triad_scenes(
    requests_json: Value,
    existing_scene_keys: Vec<u32>,
    existing_package_hashes: Vec<u32>,
) -> Result<Value, String> {
    let requests: Vec<NewSceneRequest> = serde_json::from_value(requests_json)
        .map_err(|e| format!("Invalid new-scene request: {e}"))?;
    if requests.is_empty() {
        return Err("at least one scene is required".to_string());
    }
    let outmission = requests[0].outmission_dir.clone();
    let (mut scene_keys, mut package_hashes) = taken_ids(
        Path::new(outmission.trim_end_matches(['/', '\\'])),
        &existing_scene_keys,
        &existing_package_hashes,
    )?;

    let mut created = Vec::with_capacity(requests.len());
    for request in &requests {
        let scene = create_triad_scene(request, &scene_keys, &package_hashes)?;
        scene_keys.insert(scene.scene_key);
        package_hashes.insert(scene.package_hash);
        created.push(scene);
    }
    to_value(&created)
}
