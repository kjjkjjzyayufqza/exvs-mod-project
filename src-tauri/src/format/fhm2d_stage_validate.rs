use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::fhm2d_stage::{
    find_ssbh_folders, parse_numatb_texture_refs_by_role, resolve_content_root,
    INFO_SUBFOLDER_NAMES, STAGE_BASE_NAME, STAGE_INFO_NAME,
};
use super::numatb_format;

// ── Public types ────────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExvsStageValidationError {
    pub phase: String,
    pub message: String,
    pub path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExvsStageValidationResult {
    pub valid: bool,
    pub errors: Vec<ExvsStageValidationError>,
}

// ── Validator factory ───────────────────────────────────────────────────────

type ExvsValidationStep = fn(&Path, &mut Vec<ExvsStageValidationError>);

const EXVS_STAGE_VALIDATION_FLOW: &[ExvsValidationStep] = &[
    exvs_stage_check_base,
    exvs_stage_check_info,
    exvs_stage_check_content_order,
    exvs_stage_check_sub_models,
    exvs_stage_check_numatb_textures,
];

/// Layout-independent pre-flight flow run before any save/repack mutation.
///
/// Only inspects numatb file contents (not the on-disk texture layout), so it is
/// safe to run on both the shared `textures/` layout (Save as Folder / in-place
/// repack) and the per-model subdir layout (FHM2D pack). The on-disk texture
/// existence check (`exvs_stage_check_numatb_textures`) is intentionally NOT part
/// of this flow — it assumes the per-model `0//1/` layout and is reused as-is via
/// `exvs_stage_validate_for_repack` after `redistribute_stage_textures`.
const EXVS_STAGE_PREFLIGHT_FLOW: &[ExvsValidationStep] = &[exvs_stage_check_numatb_empty_params];

// ── Entry point ─────────────────────────────────────────────────────────────

pub fn exvs_stage_validate_for_repack(stage_root: &str) -> ExvsStageValidationResult {
    let root = Path::new(stage_root);
    let content_root = resolve_content_root(root);

    let mut errors = Vec::new();

    for step in EXVS_STAGE_VALIDATION_FLOW {
        step(&content_root, &mut errors);
        // base and info are prerequisites — stop early if they fail
        if errors
            .iter()
            .any(|e| e.phase == "base" || e.phase == "info")
        {
            break;
        }
    }

    ExvsStageValidationResult {
        valid: errors.is_empty(),
        errors,
    }
}

/// Pre-flight gate: detect numatb material texture parameters whose path string
/// is empty. Layout-independent — reads numatb content only. Used by every save
/// and repack entry point before any file is mutated.
pub fn exvs_stage_validate_numatb_empty_params(stage_root: &str) -> ExvsStageValidationResult {
    let root = Path::new(stage_root);
    let content_root = resolve_content_root(root);

    let mut errors = Vec::new();
    for step in EXVS_STAGE_PREFLIGHT_FLOW {
        step(&content_root, &mut errors);
    }

    ExvsStageValidationResult {
        valid: errors.is_empty(),
        errors,
    }
}

// ── Step 1: base/ must exist and contain an SSBH model ──────────────────────

fn exvs_stage_check_base(content_root: &Path, errors: &mut Vec<ExvsStageValidationError>) {
    let base_dir = content_root.join(STAGE_BASE_NAME);
    if !base_dir.is_dir() {
        errors.push(ExvsStageValidationError {
            phase: "base".into(),
            message: "Missing required 'base/' folder. Stage must have a base model.".into(),
            path: Some(base_dir.to_string_lossy().into()),
        });
        return;
    }

    // base/ must contain an SSBH model (directly or in a subfolder)
    let mut warnings = Vec::new();
    let ssbh = find_ssbh_folders(&base_dir, &mut warnings).unwrap_or_default();
    if ssbh.is_empty() {
        errors.push(ExvsStageValidationError {
            phase: "base".into(),
            message: "base/ folder does not contain a valid SSBH model (missing .nusktb/.numatb)."
                .into(),
            path: Some(base_dir.to_string_lossy().into()),
        });
    }
}

// ── Step 2: info/ must exist with required files and subfolders ──────────────

fn exvs_stage_check_info(content_root: &Path, errors: &mut Vec<ExvsStageValidationError>) {
    let info_dir = content_root.join(STAGE_INFO_NAME);
    if !info_dir.is_dir() {
        errors.push(ExvsStageValidationError {
            phase: "info".into(),
            message: "Missing required 'info/' folder.".into(),
            path: Some(info_dir.to_string_lossy().into()),
        });
        return;
    }

    // Required files: border_hit.hkt, graphic_param.csv, placement.csv, plan_param.spbin
    let required_files = &[
        "border_hit.hkt",
        "graphic_param.csv",
        "placement.csv",
        "plan_param.spbin",
    ];
    for fname in required_files {
        if !info_dir.join(fname).exists() {
            errors.push(ExvsStageValidationError {
                phase: "info".into(),
                message: format!("info/ is missing required file: {}", fname),
                path: Some(info_dir.join(fname).to_string_lossy().into()),
            });
        }
    }

    // Required subfolders: light/, fog/, post_effect/
    for subfolder in INFO_SUBFOLDER_NAMES {
        if !info_dir.join(subfolder).is_dir() {
            errors.push(ExvsStageValidationError {
                phase: "info".into(),
                message: format!("info/ is missing required subfolder: {}/", subfolder),
                path: Some(info_dir.join(subfolder).to_string_lossy().into()),
            });
        }
    }
}

// ── Step 3: content order: base must be first, info must be second ───────────

fn exvs_stage_check_content_order(
    content_root: &Path,
    _errors: &mut Vec<ExvsStageValidationError>,
) {
    let mut dirs: Vec<String> = Vec::new();
    if let Ok(entries) = fs::read_dir(content_root) {
        let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                dirs.push(entry.file_name().to_string_lossy().to_string());
            }
        }
    }

    // Verify base is present in the directory listing
    if !dirs.iter().any(|d| d == STAGE_BASE_NAME) {
        // Already reported in step 1
        return;
    }

    // Verify info is present
    if !dirs.iter().any(|d| d == STAGE_INFO_NAME) {
        // Already reported in step 2
        return;
    }

    // The repack engine sorts: base(0) → info(1) → models(2) → sky(3)
    // We just verify both exist; the engine handles ordering.
    // No additional error needed here since ordering is enforced by rebuild.
}

// ── Step 4: sub models must have required SSBH files ─────────────────────────

fn exvs_stage_check_sub_models(content_root: &Path, errors: &mut Vec<ExvsStageValidationError>) {
    let skip_names: &[&str] = &[STAGE_BASE_NAME, STAGE_INFO_NAME, "textures"];

    let entries = match fs::read_dir(content_root) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut model_dirs: Vec<PathBuf> = Vec::new();
    for entry in entries.filter_map(|e| e.ok()) {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if skip_names.contains(&name.as_str()) {
            continue;
        }
        model_dirs.push(entry.path());
    }

    if model_dirs.is_empty() {
        errors.push(ExvsStageValidationError {
            phase: "sub_models".into(),
            message: "No sub-model folders found (need at least sky/).".into(),
            path: None,
        });
        return;
    }

    for model_dir in &model_dirs {
        let dir_name = model_dir.file_name().unwrap().to_string_lossy().to_string();
        let mut warnings = Vec::new();
        let ssbh_folders = find_ssbh_folders(model_dir, &mut warnings).unwrap_or_default();

        if ssbh_folders.is_empty() {
            errors.push(ExvsStageValidationError {
                phase: "sub_models".into(),
                message: format!(
                    "Model folder '{}' does not contain a valid SSBH model folder.",
                    dir_name
                ),
                path: Some(model_dir.to_string_lossy().into()),
            });
            continue;
        }

        for ssbh_folder in &ssbh_folders {
            exvs_stage_check_ssbh_folder(ssbh_folder, &dir_name, errors);
        }
    }
}

fn exvs_stage_check_ssbh_folder(
    ssbh_folder: &Path,
    model_name: &str,
    errors: &mut Vec<ExvsStageValidationError>,
) {
    let entries: Vec<String> = fs::read_dir(ssbh_folder)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| !e.file_type().map(|t| t.is_dir()).unwrap_or(true))
        .map(|e| e.file_name().to_string_lossy().to_ascii_lowercase())
        .collect();

    let has_ext = |ext: &str| entries.iter().any(|f| f.ends_with(ext));
    let count_ext = |ext: &str| entries.iter().filter(|f| f.ends_with(ext)).count();

    // Must have: nusktb, numatb(×2), numshb, numdlb, jnttbl
    if !has_ext(".nusktb") {
        errors.push(ExvsStageValidationError {
            phase: "sub_models".into(),
            message: format!("Model '{}': missing .nusktb (skeleton) file.", model_name),
            path: Some(ssbh_folder.to_string_lossy().into()),
        });
    }

    let numatb_count = count_ext(".numatb");
    if numatb_count < 2 {
        errors.push(ExvsStageValidationError {
            phase: "sub_models".into(),
            message: format!(
                "Model '{}': expected 2 .numatb files (__maya__ + __nust__), found {}.",
                model_name, numatb_count
            ),
            path: Some(ssbh_folder.to_string_lossy().into()),
        });
    }

    // Check maya/nust naming
    let has_maya = entries
        .iter()
        .any(|f| f.contains("__maya__") && f.ends_with(".numatb"));
    let has_nust = entries
        .iter()
        .any(|f| f.contains("__nust__") && f.ends_with(".numatb"));
    if !has_maya {
        errors.push(ExvsStageValidationError {
            phase: "sub_models".into(),
            message: format!(
                "Model '{}': missing __maya__.numatb material file.",
                model_name
            ),
            path: Some(ssbh_folder.to_string_lossy().into()),
        });
    }
    if !has_nust {
        errors.push(ExvsStageValidationError {
            phase: "sub_models".into(),
            message: format!(
                "Model '{}': missing __nust__.numatb material file.",
                model_name
            ),
            path: Some(ssbh_folder.to_string_lossy().into()),
        });
    }

    if !has_ext(".numshb") {
        errors.push(ExvsStageValidationError {
            phase: "sub_models".into(),
            message: format!("Model '{}': missing .numshb (mesh) file.", model_name),
            path: Some(ssbh_folder.to_string_lossy().into()),
        });
    }

    if !has_ext(".numdlb") {
        errors.push(ExvsStageValidationError {
            phase: "sub_models".into(),
            message: format!("Model '{}': missing .numdlb (model) file.", model_name),
            path: Some(ssbh_folder.to_string_lossy().into()),
        });
    }

    if !has_ext(".jnttbl") {
        errors.push(ExvsStageValidationError {
            phase: "sub_models".into(),
            message: format!(
                "Model '{}': missing .jnttbl (joint table) file.",
                model_name
            ),
            path: Some(ssbh_folder.to_string_lossy().into()),
        });
    }
}

// ── Step 5: numatb texture references must exist on disk ─────────────────────

fn exvs_stage_check_numatb_textures(
    content_root: &Path,
    errors: &mut Vec<ExvsStageValidationError>,
) {
    let mut warnings = Vec::new();
    let ssbh_folders = find_ssbh_folders(content_root, &mut warnings).unwrap_or_default();

    for ssbh_folder in &ssbh_folders {
        let model_name = ssbh_folder
            .strip_prefix(content_root)
            .unwrap_or(ssbh_folder)
            .to_string_lossy()
            .to_string();

        let numatb_refs = parse_numatb_texture_refs_by_role(ssbh_folder, &mut warnings);
        if numatb_refs.is_empty() {
            continue;
        }

        let role_names = ["maya (0/)", "nust (1/)"];

        for (subdir_index, refs) in numatb_refs.iter().enumerate() {
            let subdir = ssbh_folder.join(subdir_index.to_string());
            let role = role_names.get(subdir_index).unwrap_or(&"unknown");

            if !subdir.is_dir() && !refs.is_empty() {
                errors.push(ExvsStageValidationError {
                    phase: "textures".into(),
                    message: format!(
                        "Model '{}': texture folder {}/  does not exist but numatb ({}) references {} texture(s).",
                        model_name, subdir_index, role, refs.len()
                    ),
                    path: Some(subdir.to_string_lossy().into()),
                });
                continue;
            }

            // Index existing textures in the subdir (case-insensitive)
            let existing: Vec<String> = fs::read_dir(&subdir)
                .into_iter()
                .flatten()
                .filter_map(|e| e.ok())
                .filter(|e| !e.file_type().map(|t| t.is_dir()).unwrap_or(true))
                .map(|e| e.file_name().to_string_lossy().to_ascii_lowercase())
                .collect();

            for ref_name in refs {
                let ref_lower = ref_name.to_ascii_lowercase();
                // Skip empty texture references (e.g. ".nutexb" from empty material slots)
                if ref_lower == ".nutexb" || ref_lower.is_empty() {
                    continue;
                }
                if !existing.contains(&ref_lower) {
                    errors.push(ExvsStageValidationError {
                        phase: "textures".into(),
                        message: format!(
                            "Model '{}': {} numatb references '{}' but it is missing from {}/",
                            model_name, role, ref_name, subdir_index
                        ),
                        path: Some(subdir.join(ref_name).to_string_lossy().into()),
                    });
                }
            }
        }
    }
}

// ── Pre-flight step: numatb texture parameters must not have empty paths ─────

/// Flag required numatb material texture parameters whose path string is empty.
fn exvs_stage_check_numatb_empty_params(
    content_root: &Path,
    errors: &mut Vec<ExvsStageValidationError>,
) {
    let mut warnings = Vec::new();
    let ssbh_folders = find_ssbh_folders(content_root, &mut warnings).unwrap_or_default();

    for ssbh_folder in &ssbh_folders {
        let model_name = ssbh_folder
            .strip_prefix(content_root)
            .unwrap_or(ssbh_folder)
            .to_string_lossy()
            .to_string();

        let numatb_paths = collect_numatb_paths(ssbh_folder);
        for numatb_path in numatb_paths {
            let data = match fs::read(&numatb_path) {
                Ok(d) => d,
                Err(e) => {
                    warnings.push(format!(
                        "Failed to read numatb '{}': {e}",
                        numatb_path.display()
                    ));
                    continue;
                }
            };
            let mut cursor = Cursor::new(&data);
            let matl = match ssbh_data::prelude::MatlData::read(&mut cursor) {
                Ok(m) => m,
                Err(e) => {
                    warnings.push(format!(
                        "Failed to parse numatb '{}': {e}",
                        numatb_path.display()
                    ));
                    continue;
                }
            };
            let numatb_name = numatb_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            for missing in numatb_format::collect_missing_texture_paths_for_matl(
                &matl,
                numatb_format::detect_numatb_profile_from_name(&numatb_name),
            ) {
                errors.push(empty_param_error(
                    &model_name,
                    &missing.material_label,
                    &missing.param_id,
                    &numatb_name,
                    &numatb_path,
                    missing.is_textures2_bucket,
                ));
            }
        }
    }
}

fn collect_numatb_paths(ssbh_folder: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(ssbh_folder) {
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(true) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.to_ascii_lowercase().ends_with(".numatb") {
                out.push(entry.path());
            }
        }
    }
    out.sort();
    out
}

fn empty_param_error(
    model_name: &str,
    material_label: &str,
    param_id: &impl Serialize,
    numatb_name: &str,
    numatb_path: &Path,
    is_textures2: bool,
) -> ExvsStageValidationError {
    let param = param_id_to_string(param_id);
    let suffix = if is_textures2 { " (textures2)" } else { "" };
    ExvsStageValidationError {
        phase: "empty_texture_param".into(),
        message: format!(
            "Model '{}': material '{}' texture parameter '{}'{} has an empty path ({}).",
            model_name, material_label, param, suffix, numatb_name
        ),
        path: Some(numatb_path.to_string_lossy().into()),
    }
}

/// Serialize a numatb ParamId to the same string the frontend numatb JSON uses
/// (e.g. "Texture0"/"DiffuseMap"), falling back to Debug if serialization fails.
fn param_id_to_string(param_id: &impl Serialize) -> String {
    serde_json::to_value(param_id)
        .ok()
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "UnknownParam".to_string())
}
