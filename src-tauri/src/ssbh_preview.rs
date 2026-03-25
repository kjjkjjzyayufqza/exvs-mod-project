use serde::Serialize;
use serde_json::{json, Value};
use ssbh_data::prelude::*;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureRefResolve {
    pub reference: String,
    pub nutexb_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SsbhModelPreviewBundle {
    pub root_folder: String,
    pub modl_path: String,
    pub mesh_path: String,
    pub skel_path: Option<String>,
    pub matl_paths: Vec<String>,
    pub modl: Value,
    pub mesh: Value,
    pub skel: Option<Value>,
    pub matl: Option<Value>,
    pub texture_refs: Vec<String>,
    pub resolved_nutexb_paths: Vec<String>,
    pub texture_resolve: Vec<TextureRefResolve>,
    pub warnings: Vec<String>,
}

/// Game bundles inject a hard-coded `nusubf` segment in several references. Unpacked trees usually
/// omit that folder. Remove every path component equal to `nusubf` (case-insensitive); keep `.` and `..`.
fn normalize_bundle_relative_path(raw: &str) -> String {
    let s = raw.trim().replace('\\', "/");
    s.split('/')
        .filter(|p| !p.is_empty() && !p.eq_ignore_ascii_case("nusubf"))
        .collect::<Vec<_>>()
        .join("/")
}

/// Canonical model root (directory containing the `.numdlb`).
fn canonical_model_folder(folder: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(folder).map_err(|e| {
        format!(
            "Failed to canonicalize model folder {}: {e}",
            folder.display()
        )
    })
}

/// Max `..` steps while resolving a reference from the model folder (abuse guard).
const MAX_RELATIVE_PARENT_POPS: usize = 64;

/// Max ancestors of the model folder to treat as a valid "unpack root" for `..` references.
const MAX_PREVIEW_ANCESTOR_HOPS: usize = 64;

fn normal_path_component_count(path: &Path) -> usize {
    path.components()
        .filter(|c| matches!(c, std::path::Component::Normal(_)))
        .count()
}

/// Game matl paths often use `../../textures/...` relative to the `.numdlb` directory. Resolve from
/// `model_folder_canon` allowing `..` up to the filesystem root, with a hard cap on `..` steps.
fn resolve_relative_from_model_folder(model_folder_canon: &Path, raw: &str) -> Result<PathBuf, String> {
    let s = raw.trim();
    if s.is_empty() {
        return Err("Model reference path is empty".to_string());
    }
    if Path::new(s).is_absolute() {
        return Err(format!(
            "Absolute paths in model references are not allowed: {s}"
        ));
    }

    let mut cur = model_folder_canon.to_path_buf();
    let mut pop_count = 0usize;
    for part in s.split(|c| c == '/' || c == '\\').filter(|p| !p.is_empty()) {
        match part {
            "." => {}
            ".." => {
                pop_count += 1;
                if pop_count > MAX_RELATIVE_PARENT_POPS {
                    return Err(format!("Path has too many '..' segments: {s}"));
                }
                if !cur.pop() {
                    return Err(format!(
                        "Path goes above filesystem root (too many '..'): {s}"
                    ));
                }
            }
            other => {
                if other.contains(':') {
                    return Err(format!(
                        "Invalid path segment in model reference: {other}"
                    ));
                }
                cur.push(other);
            }
        }
    }
    Ok(cur)
}

/// True if `resolved_canon` lies under `model_folder_canon` or under one of its ancestors, but not
/// solely via a volume root prefix (e.g. `E:\`), which would allow the entire drive.
fn resolved_stays_under_unpack_tree(model_folder_canon: &Path, resolved_canon: &Path) -> bool {
    let mut base = model_folder_canon.to_path_buf();
    for _ in 0..=MAX_PREVIEW_ANCESTOR_HOPS {
        if resolved_canon.starts_with(&base) && normal_path_component_count(&base) >= 1 {
            return true;
        }
        if !base.pop() {
            break;
        }
    }
    false
}

/// Canonicalize `candidate` and ensure it stays under the model's unpack tree (see
/// `resolved_stays_under_unpack_tree`). Blocks symlink escapes outside that tree.
fn verify_preview_path_under_model_tree(
    model_folder_canon: &Path,
    candidate: &Path,
) -> Result<PathBuf, String> {
    let canon = fs::canonicalize(candidate).map_err(|e| {
        format!(
            "Failed to canonicalize {}: {e}",
            candidate.display()
        )
    })?;
    if !resolved_stays_under_unpack_tree(model_folder_canon, &canon) {
        return Err(format!(
            "Resolved path is outside the allowed unpack tree for this model: {}",
            canon.display()
        ));
    }
    Ok(canon)
}

fn find_numdlb_in_dir(dir: &Path) -> Result<PathBuf, String> {
    let preferred = dir.join("model.numdlb");
    if preferred.is_file() {
        return Ok(preferred);
    }
    let mut candidates: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|s| s.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case("numdlb"))
                    .unwrap_or(false)
        })
        .collect();
    candidates.sort();
    candidates
        .into_iter()
        .next()
        .ok_or_else(|| "No .numdlb file found in the selected folder".to_string())
}

pub fn resolve_modl_entry_path(input: &str) -> Result<PathBuf, String> {
    let path = Path::new(input);
    if path.is_file() {
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .ok_or_else(|| "File has no extension".to_string())?;
        if !ext.eq_ignore_ascii_case("numdlb") {
            return Err("Selected file is not a .numdlb model".to_string());
        }
        return Ok(path.to_path_buf());
    }
    if path.is_dir() {
        return find_numdlb_in_dir(path);
    }
    Err(format!(
        "Path does not exist or is not accessible: {}",
        input
    ))
}

fn collect_texture_refs(matl: &MatlData) -> Vec<String> {
    let mut set: HashSet<String> = HashSet::new();
    for entry in &matl.entries {
        for tex in &entry.textures {
            let s = tex.data.trim();
            if !s.is_empty() {
                set.insert(s.to_string());
            }
        }
    }
    let mut v: Vec<String> = set.into_iter().collect();
    v.sort();
    v
}

fn texture_basename_as_nutexb(texture_ref: &str) -> Option<String> {
    let s = texture_ref.trim().replace('\\', "/");
    let last = s.split('/').filter(|p| !p.is_empty()).last()?.trim();
    if last.is_empty() {
        return None;
    }
    if last.to_ascii_lowercase().ends_with(".nutexb") {
        Some(last.to_string())
    } else {
        Some(format!("{last}.nutexb"))
    }
}

fn find_case_insensitive_file_in_dir(dir: &Path, want_file: &str) -> Option<PathBuf> {
    let rd = fs::read_dir(dir).ok()?;
    for ent in rd.flatten() {
        let p = ent.path();
        if !p.is_file() {
            continue;
        }
        let name = p.file_name()?.to_str()?;
        if name.eq_ignore_ascii_case(want_file) {
            return Some(p);
        }
    }
    None
}

/// When the matl path does not match disk (extra folders, different `..` depth), locate the same
/// filename under any `textures` directory on the path from the model folder up the unpack tree.
fn find_nutexb_by_basename_near_textures(
    model_root_canon: &Path,
    texture_ref: &str,
) -> Result<Option<PathBuf>, String> {
    let want_file = match texture_basename_as_nutexb(texture_ref) {
        Some(n) => n,
        None => return Ok(None),
    };
    let mut base_anc = model_root_canon.to_path_buf();
    for _ in 0..=MAX_PREVIEW_ANCESTOR_HOPS {
        for sub in ["textures", "Textures", "TEXTURES"] {
            let dir = base_anc.join(sub);
            if !dir.is_dir() {
                continue;
            }
            let direct = dir.join(&want_file);
            if direct.is_file() {
                return Ok(Some(verify_preview_path_under_model_tree(
                    model_root_canon,
                    &direct,
                )?));
            }
            if let Some(found) = find_case_insensitive_file_in_dir(&dir, &want_file) {
                return Ok(Some(verify_preview_path_under_model_tree(
                    model_root_canon,
                    &found,
                )?));
            }
        }
        if !base_anc.pop() {
            break;
        }
    }
    Ok(None)
}

fn resolve_nutexb_path(root_canon: &Path, texture_ref: &str) -> Result<Option<PathBuf>, String> {
    let trimmed = texture_ref.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let normalized = normalize_bundle_relative_path(trimmed);
    if !normalized.is_empty() {
        let base = resolve_relative_from_model_folder(root_canon, &normalized)?;
        if base.is_file() {
            return Ok(Some(verify_preview_path_under_model_tree(root_canon, &base)?));
        }
        if !normalized.to_ascii_lowercase().ends_with(".nutexb") {
            let with_ext = format!("{normalized}.nutexb");
            let alt = resolve_relative_from_model_folder(root_canon, &with_ext)?;
            if alt.is_file() {
                return Ok(Some(verify_preview_path_under_model_tree(root_canon, &alt)?));
            }
        }
    }
    find_nutexb_by_basename_near_textures(root_canon, texture_ref)
}

pub fn load_model_preview_bundle(root_input: &str) -> Result<SsbhModelPreviewBundle, String> {
    let modl_path = resolve_modl_entry_path(root_input)?;
    let folder = modl_path
        .parent()
        .ok_or_else(|| "Could not determine model folder from .numdlb path".to_string())?
        .to_path_buf();

    let root_canon = canonical_model_folder(&folder)?;

    let modl: ModlData =
        ModlData::from_file(&modl_path).map_err(|e| format!("Failed to read Modl: {e}"))?;

    let mesh_rel = normalize_bundle_relative_path(&modl.mesh_file_name);
    let mesh_lex = resolve_relative_from_model_folder(&root_canon, &mesh_rel)?;
    if !mesh_lex.is_file() {
        return Err(format!(
            "Mesh file not found: {}",
            mesh_lex.display()
        ));
    }
    let mesh_path = verify_preview_path_under_model_tree(&root_canon, &mesh_lex)?;

    let mesh: MeshData =
        MeshData::from_file(&mesh_path).map_err(|e| format!("Failed to read Mesh: {e}"))?;

    let mut warnings: Vec<String> = Vec::new();

    let (skel, skel_path_opt, skel_expected_display) = {
        let skel_ref = modl.skeleton_file_name.trim();
        if skel_ref.is_empty() {
            (None, None, String::new())
        } else {
            let skel_rel = normalize_bundle_relative_path(skel_ref);
            let skel_lex = resolve_relative_from_model_folder(&root_canon, &skel_rel)?;
            let expected = skel_lex.display().to_string();
            if skel_lex.is_file() {
                let skel_path = verify_preview_path_under_model_tree(&root_canon, &skel_lex)?;
                let s: SkelData =
                    SkelData::from_file(&skel_path).map_err(|e| format!("Failed to read Skel: {e}"))?;
                (
                    Some(
                        serde_json::to_value(&s)
                            .map_err(|e| format!("Failed to serialize Skel to JSON: {e}"))?,
                    ),
                    Some(skel_path.to_string_lossy().to_string()),
                    expected,
                )
            } else {
                (None, None, expected)
            }
        }
    };

    if skel_path_opt.is_none() && !skel_expected_display.is_empty() {
        warnings.push(format!(
            "Skeleton file not found (expected at {}), bone view disabled.",
            skel_expected_display
        ));
    }

    let mut matl_paths: Vec<String> = Vec::new();
    let mut matl_combined: Option<MatlData> = None;

    for name in &modl.material_file_names {
        let name_trim = name.trim();
        if name_trim.is_empty() {
            continue;
        }
        let mat_rel = normalize_bundle_relative_path(name_trim);
        if mat_rel.is_empty() {
            warnings.push(format!(
                "Material reference has no usable path after normalizing: {name_trim}"
            ));
            continue;
        }
        let mut p_lex = match resolve_relative_from_model_folder(&root_canon, &mat_rel) {
            Ok(p) => p,
            Err(e) => {
                warnings.push(format!("Material reference invalid ({name_trim}): {e}"));
                continue;
            }
        };
        if !p_lex.is_file() {
            if let Some(fname) = Path::new(&mat_rel).file_name() {
                let alt = root_canon.join(fname);
                if alt.is_file() {
                    p_lex = alt;
                }
            }
        }
        if !p_lex.is_file() {
            warnings.push(format!(
                "Material file listed in model but missing: {}",
                p_lex.display()
            ));
            continue;
        }
        let p = verify_preview_path_under_model_tree(&root_canon, &p_lex)?;
        let data: MatlData =
            MatlData::from_file(&p).map_err(|e| format!("Failed to read Matl {}: {e}", p.display()))?;
        matl_paths.push(p.to_string_lossy().to_string());
        match matl_combined.as_mut() {
            None => matl_combined = Some(data),
            Some(existing) => {
                existing.entries.extend(data.entries);
            }
        }
    }

    let (texture_refs, resolved_nutexb_paths, texture_resolve, matl_value) =
        if let Some(ref m) = matl_combined {
            let refs = collect_texture_refs(m);
            let mut resolved: Vec<String> = Vec::new();
            let mut resolve_rows: Vec<TextureRefResolve> = Vec::new();
            for r in &refs {
                let nutexb_path = resolve_nutexb_path(&root_canon, r)?
                    .map(|x| x.to_string_lossy().to_string());
                if let Some(ref s) = nutexb_path {
                    if !resolved.contains(s) {
                        resolved.push(s.clone());
                    }
                } else {
                    warnings.push(format!(
                        "Texture reference could not be resolved to a .nutexb on disk: {r}"
                    ));
                }
                resolve_rows.push(TextureRefResolve {
                    reference: r.clone(),
                    nutexb_path,
                });
            }
            let v =
                serde_json::to_value(m).map_err(|e| format!("Failed to serialize Matl: {e}"))?;
            (refs, resolved, resolve_rows, Some(v))
        } else {
            if !modl.material_file_names.is_empty() {
                warnings.push(
                    "No material files could be loaded; meshes render with a neutral material.".into(),
                );
            }
            (Vec::new(), Vec::new(), Vec::new(), None)
        };

    let modl_json = serde_json::to_value(&modl).map_err(|e| format!("Failed to serialize Modl: {e}"))?;
    let mesh_json = serde_json::to_value(&mesh).map_err(|e| format!("Failed to serialize Mesh: {e}"))?;

    Ok(SsbhModelPreviewBundle {
        root_folder: root_canon.to_string_lossy().to_string(),
        modl_path: modl_path.to_string_lossy().to_string(),
        mesh_path: mesh_path.to_string_lossy().to_string(),
        skel_path: skel_path_opt,
        matl_paths,
        modl: modl_json,
        mesh: mesh_json,
        skel,
        matl: matl_value,
        texture_refs,
        resolved_nutexb_paths,
        texture_resolve,
        warnings,
    })
}

#[tauri::command]
pub fn ssbh_load_model_preview(root_path: String) -> Result<SsbhModelPreviewBundle, String> {
    load_model_preview_bundle(&root_path)
}

#[tauri::command]
pub fn ssbh_load_ssbh_file_as_json(path: String) -> Result<Value, String> {
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "File has no extension".to_string())?;
    let ext_lc = ext.to_ascii_lowercase();
    let v = match ext_lc.as_str() {
        "numshb" => {
            let d: MeshData =
                MeshData::from_file(p).map_err(|e| format!("Failed to read Mesh: {e}"))?;
            serde_json::to_value(&d).map_err(|e| e.to_string())?
        }
        "numdlb" => {
            let d: ModlData =
                ModlData::from_file(p).map_err(|e| format!("Failed to read Modl: {e}"))?;
            serde_json::to_value(&d).map_err(|e| e.to_string())?
        }
        "nusktb" => {
            let d: SkelData =
                SkelData::from_file(p).map_err(|e| format!("Failed to read Skel: {e}"))?;
            serde_json::to_value(&d).map_err(|e| e.to_string())?
        }
        "numatb" => {
            let d: MatlData =
                MatlData::from_file(p).map_err(|e| format!("Failed to read Matl: {e}"))?;
            serde_json::to_value(&d).map_err(|e| e.to_string())?
        }
        other => {
            return Err(format!(
                "Unsupported extension for JSON preview: {other}"
            ));
        }
    };
    Ok(json!({
        "filePath": path,
        "format": ext_lc,
        "data": v,
    }))
}
