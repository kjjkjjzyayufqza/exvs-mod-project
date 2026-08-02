use serde::Serialize;
use serde_json::{json, Value};
use ssbh_data::prelude::*;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureRefResolve {
    pub reference: String,
    pub nutexb_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatlProfilePreviewValues {
    pub maya: Option<Value>,
    pub nust: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
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
    pub matl_profiles: Option<MatlProfilePreviewValues>,
    pub texture_refs: Vec<String>,
    pub resolved_nutexb_paths: Vec<String>,
    pub texture_resolve: Vec<TextureRefResolve>,
    pub warnings: Vec<String>,
    pub source_kind: String,
    pub source_session_id: Option<String>,
    pub virtual_modl_path: Option<String>,
}

const WINDOWS_EXTENDED_PATH_PREFIX: &str = r"\\?\";

pub(crate) fn normalize_preview_path_for_frontend(raw: &str) -> String {
    let trimmed = raw.trim();
    let without_extended = trimmed
        .strip_prefix(WINDOWS_EXTENDED_PATH_PREFIX)
        .unwrap_or(trimmed);
    without_extended.replace('\\', "/")
}

pub(crate) fn preview_path_to_frontend(path: &Path) -> String {
    normalize_preview_path_for_frontend(&path.to_string_lossy())
}

/// Normalizes modl-relative path strings: trim, unify separators, drop empty segments.
/// Does not rewrite `nusubf` or other folder names; resolution follows the paths recorded in the modl.
fn normalize_modl_relative_path_str(raw: &str) -> String {
    raw.trim()
        .replace('\\', "/")
        .split('/')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

/// Tries the path as recorded in the modl first; if that file is missing, tries the same basename
/// directly under the model folder (directory containing the `.numdlb`).
fn resolve_modl_sidecar_path(
    model_root_canon: &Path,
    raw: &str,
) -> Result<(Option<PathBuf>, String), String> {
    let rel = normalize_modl_relative_path_str(raw);
    if rel.is_empty() {
        return Err("Path is empty".to_string());
    }
    let primary_opt = resolve_relative_from_model_folder(model_root_canon, &rel).ok();
    if let Some(ref primary) = primary_opt {
        if primary.is_file() {
            let v = verify_preview_path_under_model_tree(model_root_canon, primary)?;
            return Ok((Some(v), preview_path_to_frontend(primary)));
        }
    }
    if let Some(fname) = Path::new(&rel).file_name().and_then(|s| s.to_str()) {
        if !fname.is_empty() {
            let alt = model_root_canon.join(fname);
            if alt.is_file() {
                let v = verify_preview_path_under_model_tree(model_root_canon, &alt)?;
                let expected = primary_opt
                    .as_ref()
                    .map(|p| preview_path_to_frontend(p.as_path()))
                    .unwrap_or_else(|| rel.clone());
                return Ok((Some(v), expected));
            }
        }
    }
    let expected = primary_opt
        .as_ref()
        .map(|p| preview_path_to_frontend(p.as_path()))
        .unwrap_or_else(|| rel.clone());
    Ok((None, expected))
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
fn resolve_relative_from_model_folder(
    model_folder_canon: &Path,
    raw: &str,
) -> Result<PathBuf, String> {
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
                    return Err(format!("Invalid path segment in model reference: {other}"));
                }
                cur.push(other);
            }
        }
    }
    Ok(cur)
}

/// Normalizes a path for prefix checks on Windows so `\\?\`-verbatim and non-verbatim paths
/// compare consistently. `Path::starts_with` returns false when one side is verbatim and the other
/// is not, which could incorrectly reject valid nutexb files next to the `.numdlb`.
#[cfg(windows)]
fn win_normalize_path_for_tree_compare(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    let without = s.strip_prefix(r"\\?\");
    match without {
        Some(rest) if rest.starts_with("UNC\\") => PathBuf::from(format!(r"\\{}", &rest[4..])),
        Some(rest) => PathBuf::from(rest.to_string()),
        None => p.to_path_buf(),
    }
}

#[cfg(not(windows))]
fn win_normalize_path_for_tree_compare(p: &Path) -> PathBuf {
    p.to_path_buf()
}

/// True if `resolved_canon` lies under `model_folder_canon` or under one of its ancestors, but not
/// solely via a volume root prefix (e.g. `E:\`), which would allow the entire drive.
fn resolved_stays_under_unpack_tree(model_folder_canon: &Path, resolved_canon: &Path) -> bool {
    let model = win_normalize_path_for_tree_compare(model_folder_canon);
    let resolved = win_normalize_path_for_tree_compare(resolved_canon);
    let mut base = model;
    for _ in 0..=MAX_PREVIEW_ANCESTOR_HOPS {
        if resolved.starts_with(&base) && normal_path_component_count(&base) >= 1 {
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
    let canon = fs::canonicalize(candidate)
        .map_err(|e| format!("Failed to canonicalize {}: {e}", candidate.display()))?;
    if !resolved_stays_under_unpack_tree(model_folder_canon, &canon) {
        return Err(format!(
            "Resolved path is outside the allowed unpack tree for this model: {}",
            canon.display()
        ));
    }
    Ok(canon)
}

/// Max directory depth from the root when recursively listing `.numdlb` files.
const NUMDLB_RECURSE_MAX_DEPTH: usize = 16;
/// Max number of `.numdlb` files returned (sorted, truncated with deterministic order).
const NUMDLB_RECURSE_MAX_FILES: usize = 128;

pub(crate) fn preview_log(msg: &str) {
    eprintln!("[ssbh_preview] {msg}");
}

pub(crate) fn dir_name_should_skip(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    matches!(
        n.as_str(),
        ".git" | ".svn" | ".hg" | "node_modules" | "target" | ".cargo"
    )
}

/// Recursively collects files with extension `want_ext` under `root`, sorted lexicographically.
///
/// `max_files`: `Some(n)` caps the result at `n` paths; `None` returns every match under the
/// depth limit (needed for full unit motion packs that often exceed a few hundred `.nuanmb`).
pub(crate) fn collect_paths_recursive(
    root: &Path,
    want_ext: &str,
    max_depth: usize,
    max_files: Option<usize>,
    skip_dir: fn(&str) -> bool,
) -> Result<Vec<PathBuf>, String> {
    let t0 = Instant::now();
    preview_log(&format!(
        "scan start: root={} ext={} depth_cap={} file_cap={}",
        root.display(),
        want_ext,
        max_depth,
        max_files
            .map(|n| n.to_string())
            .unwrap_or_else(|| "unlimited".to_string())
    ));
    let root_canon = fs::canonicalize(root)
        .map_err(|e| format!("Failed to canonicalize {}: {e}", root.display()))?;
    if !root_canon.is_dir() {
        return Err(format!("Not a directory: {}", root_canon.display()));
    }

    let mut out: Vec<PathBuf> = Vec::new();
    let mut visited_dirs: HashSet<PathBuf> = HashSet::new();
    let want = want_ext.to_ascii_lowercase();

    fn at_file_cap(out_len: usize, max_files: Option<usize>) -> bool {
        max_files.is_some_and(|cap| out_len >= cap)
    }

    fn walk(
        dir: &Path,
        depth: usize,
        max_depth: usize,
        max_files: Option<usize>,
        want_ext_lc: &str,
        out: &mut Vec<PathBuf>,
        visited_dirs: &mut HashSet<PathBuf>,
        skip_dir: fn(&str) -> bool,
    ) -> Result<(), String> {
        if at_file_cap(out.len(), max_files) {
            return Ok(());
        }
        if depth > max_depth {
            return Ok(());
        }
        let canon = match fs::canonicalize(dir) {
            Ok(c) => c,
            Err(_) => return Ok(()),
        };
        if !visited_dirs.insert(canon.clone()) {
            return Ok(());
        }

        let rd = match fs::read_dir(&canon) {
            Ok(r) => r,
            Err(_) => return Ok(()),
        };
        let mut entries: Vec<_> = rd.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.file_name());

        for ent in entries {
            if at_file_cap(out.len(), max_files) {
                break;
            }
            let p = ent.path();
            let meta = match ent.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_file() {
                if p.extension()
                    .and_then(|s| s.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case(want_ext_lc))
                    .unwrap_or(false)
                {
                    out.push(p);
                }
                continue;
            }
            if meta.is_dir() {
                let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                if skip_dir(name) {
                    continue;
                }
                walk(
                    &p,
                    depth + 1,
                    max_depth,
                    max_files,
                    want_ext_lc,
                    out,
                    visited_dirs,
                    skip_dir,
                )?;
            }
        }
        Ok(())
    }

    walk(
        &root_canon,
        0,
        max_depth,
        max_files,
        &want,
        &mut out,
        &mut visited_dirs,
        skip_dir,
    )?;

    let mut unique: Vec<PathBuf> = Vec::new();
    let mut seen_canon: HashSet<PathBuf> = HashSet::new();
    for p in out {
        if let Ok(c) = fs::canonicalize(&p) {
            if seen_canon.insert(c.clone()) {
                unique.push(c);
            }
        }
    }
    unique.sort_by(|a, b| {
        a.to_string_lossy()
            .to_ascii_lowercase()
            .cmp(&b.to_string_lossy().to_ascii_lowercase())
    });
    preview_log(&format!(
        "scan done: root={} found={} elapsed_ms={}",
        root_canon.display(),
        unique.len(),
        t0.elapsed().as_millis()
    ));
    Ok(unique)
}

/// Recursively collects `.numdlb` file paths under `root`, sorted lexicographically by path string.
/// Skips junk directories, enforces depth and count caps; uses canonical paths in `visited` to avoid symlink cycles.
fn collect_numdlb_paths_recursive(
    root: &Path,
    max_depth: usize,
    max_files: usize,
) -> Result<Vec<PathBuf>, String> {
    collect_paths_recursive(
        root,
        "numdlb",
        max_depth,
        Some(max_files),
        dir_name_should_skip,
    )
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

fn truncate_warn_detail(s: &str, max_chars: usize) -> String {
    let t = s.trim();
    let count = t.chars().count();
    if count <= max_chars {
        return t.to_string();
    }
    t.chars().take(max_chars).collect::<String>() + "…"
}

/// Loads every `.numatb` in the model folder not already referenced by the modl.
/// Files that fail to parse (unsupported Matl revision / game-specific layout) are skipped with a warning.
fn merge_additional_numatb_in_model_folder(
    root_canon: &Path,
    matl_paths: &mut Vec<String>,
    matl_combined: &mut Option<MatlData>,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    let mut seen: HashSet<PathBuf> = HashSet::new();
    for s in matl_paths.iter() {
        let p = Path::new(s);
        if let Ok(c) = fs::canonicalize(p) {
            seen.insert(c);
        }
    }
    let rd = fs::read_dir(root_canon).map_err(|e| format!("Failed to read model folder: {e}"))?;
    for ent in rd.flatten() {
        let p = ent.path();
        let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("");
        if !ext.eq_ignore_ascii_case("numatb") {
            continue;
        }
        let canon = fs::canonicalize(&p)
            .map_err(|e| format!("Failed to canonicalize {}: {e}", p.display()))?;
        if seen.contains(&canon) {
            continue;
        }
        let data = match MatlData::from_file(&p) {
            Ok(d) => d,
            Err(e) => {
                warnings.push(format!(
                    "Skipped extra material file {} (cannot parse as Matl): {}",
                    p.display(),
                    truncate_warn_detail(&e.to_string(), 320)
                ));
                continue;
            }
        };
        matl_paths.push(preview_path_to_frontend(&p));
        seen.insert(canon);
        match matl_combined.as_mut() {
            None => *matl_combined = Some(data),
            Some(existing) => existing.entries.extend(data.entries),
        }
    }
    Ok(())
}

fn is_nust_numatb_path(path: &Path) -> bool {
    let file = match path.file_name().and_then(|s| s.to_str()) {
        Some(v) => v.to_ascii_lowercase(),
        None => return false,
    };
    file.ends_with("__nust__.numatb")
}

fn select_preferred_matl_paths(matl_paths: &[String]) -> (Vec<String>, Vec<String>) {
    let mut nust_paths: Vec<String> = Vec::new();
    let mut non_nust_paths: Vec<String> = Vec::new();
    for s in matl_paths {
        if is_nust_numatb_path(Path::new(s)) {
            nust_paths.push(s.clone());
        } else {
            non_nust_paths.push(s.clone());
        }
    }
    if !nust_paths.is_empty() {
        (nust_paths, non_nust_paths)
    } else {
        (matl_paths.to_vec(), Vec::new())
    }
}

fn load_and_merge_matl_paths(
    matl_paths: &[String],
    warnings: &mut Vec<String>,
) -> Option<MatlData> {
    let mut merged: Option<MatlData> = None;
    for s in matl_paths {
        let p = Path::new(s);
        let data = match MatlData::from_file(p) {
            Ok(v) => v,
            Err(e) => {
                warnings.push(format!(
                    "Skipped selected material file {} (cannot parse as Matl): {}",
                    p.display(),
                    truncate_warn_detail(&e.to_string(), 320)
                ));
                continue;
            }
        };
        match merged.as_mut() {
            None => merged = Some(data),
            Some(existing) => existing.entries.extend(data.entries),
        }
    }
    merged
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
        for tex in &entry.textures2 {
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

/// Strips leading `..` path components. Matl texture paths are often authored relative to a
/// content root above the `.numdlb` folder; those `..` segments must not be applied only from
/// the numdlb directory — the remainder (`share/textures/...`, `textures/...`) is joined under
/// the model folder and each ancestor until a real file is found.
fn texture_logical_suffix_after_parent_dots(normalized_rel: &str) -> String {
    let parts: Vec<&str> = normalized_rel
        .split(|c| c == '/' || c == '\\')
        .filter(|p| !p.is_empty() && *p != ".")
        .collect();
    let mut i = 0usize;
    while i < parts.len() && parts[i] == ".." {
        i += 1;
    }
    parts[i..].join(std::path::MAIN_SEPARATOR_STR)
}

fn try_resolve_nutexb_lex_under_model_tree(
    model_root_canon: &Path,
    candidate: &Path,
) -> Result<Option<PathBuf>, String> {
    let mut attempts: Vec<PathBuf> = Vec::new();
    attempts.push(candidate.to_path_buf());
    let has_nutexb_ext = candidate
        .extension()
        .and_then(|s| s.to_str())
        .map(|e| e.eq_ignore_ascii_case("nutexb"))
        .unwrap_or(false);
    if !has_nutexb_ext {
        attempts.push(candidate.with_extension("nutexb"));
    }
    for p in attempts {
        if p.is_file() {
            return Ok(Some(verify_preview_path_under_model_tree(
                model_root_canon,
                &p,
            )?));
        }
    }
    Ok(None)
}

/// Tries `suffix` joined to `model_root_canon` and each ancestor directory (walk-up), resolving
/// `.nutexb` files that live at the content root (e.g. `share/textures/...` next to `model/`).
fn find_nutexb_by_suffix_walking_ancestors(
    model_root_canon: &Path,
    suffix: &str,
) -> Result<Option<PathBuf>, String> {
    if suffix.is_empty() {
        return Ok(None);
    }
    let mut base = model_root_canon.to_path_buf();
    for _ in 0..=MAX_PREVIEW_ANCESTOR_HOPS {
        let candidate = base.join(suffix);
        if let Some(p) = try_resolve_nutexb_lex_under_model_tree(model_root_canon, &candidate)? {
            return Ok(Some(p));
        }
        if !base.pop() {
            break;
        }
    }
    Ok(None)
}

/// Matl strings like `../../textures/foo` or `../../../share/textures/bar` — strip `..`, drop
/// `textures/` and `share/textures/` prefixes, keep only the final filename for lookup (user
/// unpack trees place `.nutexb` under `{root}/textures/` or `{root}/share/textures/`).
fn normalized_matl_texture_filename_only(normalized_rel: &str) -> Option<String> {
    let s = normalized_rel.trim().replace('\\', "/");
    if s.is_empty() {
        return None;
    }
    let mut parts: Vec<&str> = s
        .split('/')
        .filter(|p| !p.is_empty() && *p != ".")
        .collect();
    while parts.first() == Some(&"..") {
        parts.remove(0);
    }
    while parts
        .first()
        .map(|p| p.eq_ignore_ascii_case("textures"))
        .unwrap_or(false)
    {
        parts.remove(0);
    }
    if parts.len() >= 2
        && parts[0].eq_ignore_ascii_case("share")
        && parts[1].eq_ignore_ascii_case("textures")
    {
        parts.drain(0..2);
    }
    let name = parts.last()?.trim();
    if name.is_empty() {
        return None;
    }
    Some(name.to_string())
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

fn nutexb_filename_from_basename_token(token: &str) -> String {
    let t = token.trim();
    if t.to_ascii_lowercase().ends_with(".nutexb") {
        t.to_string()
    } else {
        format!("{t}.nutexb")
    }
}

/// Looks for `want_file` (e.g. `foo.nutexb`) in `base_dir`, then under `textures/`, `share/textures/`,
/// and case variants (unpack layouts vary: flat root vs `textures/` subtree).
fn find_nutexb_in_texture_trees(
    model_root_canon: &Path,
    base_dir: &Path,
    want_file: &str,
) -> Result<Option<PathBuf>, String> {
    if base_dir.is_dir() {
        let direct = base_dir.join(want_file);
        if direct.is_file() {
            return Ok(Some(verify_preview_path_under_model_tree(
                model_root_canon,
                &direct,
            )?));
        }
        if let Some(found) = find_case_insensitive_file_in_dir(base_dir, want_file) {
            return Ok(Some(verify_preview_path_under_model_tree(
                model_root_canon,
                &found,
            )?));
        }
        // Scan numeric subdirectories (generic fhm2d extraction produces 0/, 1/, 2/, etc.)
        if let Ok(entries) = fs::read_dir(base_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let sub = entry.path();
                if !sub.is_dir() {
                    continue;
                }
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if !name_str.chars().all(|c| c.is_ascii_digit()) {
                    continue;
                }
                let candidate = sub.join(want_file);
                if candidate.is_file() {
                    return Ok(Some(verify_preview_path_under_model_tree(
                        model_root_canon,
                        &candidate,
                    )?));
                }
                if let Some(found) = find_case_insensitive_file_in_dir(&sub, want_file) {
                    return Ok(Some(verify_preview_path_under_model_tree(
                        model_root_canon,
                        &found,
                    )?));
                }
            }
        }
    }
    let subdir_chains: &[&[&str]] = &[
        &["textures"],
        &["Textures"],
        &["TEXTURES"],
        &["share", "textures"],
        &["share", "Textures"],
        &["Share", "textures"],
        &["Share", "Textures"],
    ];
    for chain in subdir_chains {
        let mut dir = base_dir.to_path_buf();
        for seg in *chain {
            dir.push(seg);
        }
        if !dir.is_dir() {
            continue;
        }
        let direct = dir.join(want_file);
        if direct.is_file() {
            return Ok(Some(verify_preview_path_under_model_tree(
                model_root_canon,
                &direct,
            )?));
        }
        if let Some(found) = find_case_insensitive_file_in_dir(&dir, want_file) {
            return Ok(Some(verify_preview_path_under_model_tree(
                model_root_canon,
                &found,
            )?));
        }
    }
    Ok(None)
}

/// When the matl path does not match disk (extra folders, different `..` depth), locate the same
/// filename in the content root, under `textures/`, or `share/textures/` while walking ancestors.
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
        if let Some(p) = find_nutexb_in_texture_trees(model_root_canon, &base_anc, &want_file)? {
            return Ok(Some(p));
        }
        if !base_anc.pop() {
            break;
        }
    }
    Ok(None)
}

pub fn resolve_nutexb_path(
    root_canon: &Path,
    texture_ref: &str,
) -> Result<Option<PathBuf>, String> {
    let trimmed = texture_ref.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let normalized = normalize_modl_relative_path_str(trimmed);
    if normalized.is_empty() {
        return find_nutexb_by_basename_near_textures(root_canon, texture_ref);
    }

    // 0) Strip `../`, `textures/`, `share/textures/` — use filename only (e.g. matl
    //    `../../textures/foo` → lookup `foo.nutexb` under `{unpack}/textures/` and `{unpack}/share/textures/`).
    if let Some(fname_token) = normalized_matl_texture_filename_only(&normalized) {
        let want = nutexb_filename_from_basename_token(&fname_token);
        let mut base_anc = root_canon.to_path_buf();
        for _ in 0..=MAX_PREVIEW_ANCESTOR_HOPS {
            if let Some(p) = find_nutexb_in_texture_trees(root_canon, &base_anc, &want)? {
                return Ok(Some(p));
            }
            if !base_anc.pop() {
                break;
            }
        }
    }

    // 1) Content-root style: ignore leading `..` segments and locate `share/textures/...`,
    //    `textures/...`, etc. under the model folder or any ancestor (unpack / workspace root).
    let suffix = texture_logical_suffix_after_parent_dots(&normalized);
    if !suffix.is_empty() {
        if let Some(p) = find_nutexb_by_suffix_walking_ancestors(root_canon, &suffix)? {
            return Ok(Some(p));
        }
    }

    // 2) Path relative to the folder that contains the `.numdlb` (legacy).
    if let Ok(base) = resolve_relative_from_model_folder(root_canon, &normalized) {
        if base.is_file() {
            return Ok(Some(verify_preview_path_under_model_tree(
                root_canon, &base,
            )?));
        }
        if !normalized.to_ascii_lowercase().ends_with(".nutexb") {
            let with_ext = format!("{normalized}.nutexb");
            if let Ok(alt) = resolve_relative_from_model_folder(root_canon, &with_ext) {
                if alt.is_file() {
                    return Ok(Some(verify_preview_path_under_model_tree(
                        root_canon, &alt,
                    )?));
                }
            }
        }
    }

    // 3) Same basename under any `textures/` folder up the tree.
    find_nutexb_by_basename_near_textures(root_canon, texture_ref)
}

pub fn load_model_preview_bundle(root_input: &str) -> Result<SsbhModelPreviewBundle, String> {
    let t0 = Instant::now();
    preview_log(&format!(
        "load start: input={}",
        normalize_preview_path_for_frontend(root_input)
    ));
    let modl_path = resolve_modl_entry_path(root_input)?;
    let folder = modl_path
        .parent()
        .ok_or_else(|| "Could not determine model folder from .numdlb path".to_string())?
        .to_path_buf();

    let root_canon = canonical_model_folder(&folder)?;
    preview_log(&format!(
        "resolved entry: modl={} root={}",
        preview_path_to_frontend(&modl_path),
        preview_path_to_frontend(&root_canon)
    ));

    let modl: ModlData =
        ModlData::from_file(&modl_path).map_err(|e| format!("Failed to read Modl: {e}"))?;

    let (mesh_opt, mesh_expected) = resolve_modl_sidecar_path(&root_canon, &modl.mesh_file_name)?;
    let mesh_path = mesh_opt.ok_or_else(|| {
        format!(
            "Mesh file not found (tried recorded path and model root basename): {}",
            mesh_expected
        )
    })?;
    preview_log(&format!(
        "mesh resolved: {}",
        preview_path_to_frontend(&mesh_path)
    ));

    let mesh: MeshData =
        MeshData::from_file(&mesh_path).map_err(|e| format!("Failed to read Mesh: {e}"))?;

    let mut warnings: Vec<String> = Vec::new();

    let (skel, skel_path_opt, skel_expected_display) = {
        let skel_ref = modl.skeleton_file_name.trim();
        if skel_ref.is_empty() {
            (None, None, String::new())
        } else {
            match resolve_modl_sidecar_path(&root_canon, skel_ref) {
                Ok((Some(skel_path), _expected)) => {
                    let s: SkelData = SkelData::from_file(&skel_path)
                        .map_err(|e| format!("Failed to read Skel: {e}"))?;
                    (
                        Some(
                            serde_json::to_value(&s)
                                .map_err(|e| format!("Failed to serialize Skel to JSON: {e}"))?,
                        ),
                        Some(preview_path_to_frontend(&skel_path)),
                        preview_path_to_frontend(&skel_path),
                    )
                }
                Ok((None, expected)) => (None, None, expected),
                Err(e) => {
                    warnings.push(format!("Skeleton reference invalid ({skel_ref}): {e}"));
                    (None, None, String::new())
                }
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
        let mat_rel = normalize_modl_relative_path_str(name_trim);
        if mat_rel.is_empty() {
            warnings.push(format!(
                "Material reference has no usable path after normalizing: {name_trim}"
            ));
            continue;
        }
        let mut p_lex = match resolve_relative_from_model_folder(&root_canon, &mat_rel) {
            Ok(p) => p,
            Err(_) => {
                if let Some(fname) = Path::new(&mat_rel).file_name() {
                    root_canon.join(fname)
                } else {
                    warnings.push(format!(
                        "Material reference invalid ({name_trim}): could not resolve path"
                    ));
                    continue;
                }
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
        let data = match MatlData::from_file(&p) {
            Ok(d) => d,
            Err(e) => {
                warnings.push(format!(
                    "Skipped material file {} (cannot parse as Matl): {}",
                    p.display(),
                    truncate_warn_detail(&e.to_string(), 320)
                ));
                continue;
            }
        };
        matl_paths.push(preview_path_to_frontend(&p));
        match matl_combined.as_mut() {
            None => matl_combined = Some(data),
            Some(existing) => {
                existing.entries.extend(data.entries);
            }
        }
    }

    merge_additional_numatb_in_model_folder(
        &root_canon,
        &mut matl_paths,
        &mut matl_combined,
        &mut warnings,
    )?;

    // Prefer game runtime material files: when `__nust__.numatb` exists, ignore non-`__nust__` files.
    // However, if `__nust__` yields 0 texture refs, fall back to all files (the `__maya__` variant
    // often carries the development-time texture bindings that are missing from a minimal `__nust__`).
    // When `__nust__` has some textures but individual entries are empty, fill from `__maya__`.
    let (preferred_matl_paths, ignored_non_nust_paths) = select_preferred_matl_paths(&matl_paths);
    if !ignored_non_nust_paths.is_empty() {
        let nust_matl = load_and_merge_matl_paths(&preferred_matl_paths, &mut warnings);
        let nust_has_textures = nust_matl
            .as_ref()
            .map(|m| !collect_texture_refs(m).is_empty())
            .unwrap_or(false);
        if nust_has_textures {
            let maya_matl = load_and_merge_matl_paths(&ignored_non_nust_paths, &mut warnings);
            matl_combined = match (nust_matl, maya_matl) {
                (Some(mut nust), Some(maya)) => {
                    for entry in &mut nust.entries {
                        if entry.textures.is_empty() {
                            if let Some(maya_entry) = maya
                                .entries
                                .iter()
                                .find(|e| e.material_label == entry.material_label)
                            {
                                entry.textures = maya_entry.textures.clone();
                            }
                        }
                    }
                    Some(nust)
                }
                (some, None) | (None, some) => some,
            };
            matl_paths = preferred_matl_paths;
        } else {
            matl_combined = load_and_merge_matl_paths(&matl_paths, &mut warnings);
        }
    } else {
        matl_combined = load_and_merge_matl_paths(&matl_paths, &mut warnings);
    }

    let (texture_refs, resolved_nutexb_paths, texture_resolve, matl_value) = if let Some(ref m) =
        matl_combined
    {
        let refs = collect_texture_refs(m);
        let mut resolved: Vec<String> = Vec::new();
        let mut resolve_rows: Vec<TextureRefResolve> = Vec::new();
        for r in &refs {
            let nutexb_path =
                resolve_nutexb_path(&root_canon, r)?.map(|x| preview_path_to_frontend(&x));
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
        let v = serde_json::to_value(m).map_err(|e| format!("Failed to serialize Matl: {e}"))?;
        (refs, resolved, resolve_rows, Some(v))
    } else {
        if !modl.material_file_names.is_empty() {
            warnings.push(
                "No material files could be loaded; meshes render with a neutral material.".into(),
            );
        }
        (Vec::new(), Vec::new(), Vec::new(), None)
    };

    let modl_json =
        serde_json::to_value(&modl).map_err(|e| format!("Failed to serialize Modl: {e}"))?;
    // Geometry travels as a binary side-channel (registered blob fetched by the frontend),
    // never as a JSON Value — large meshes otherwise blow memory up and abort the host.
    let mesh_json = serde_json::to_value(crate::ssbh_mesh_binary::pack_and_register(&mesh))
        .map_err(|e| format!("Failed to serialize Mesh header: {e}"))?;

    let bundle = SsbhModelPreviewBundle {
        root_folder: preview_path_to_frontend(&root_canon),
        modl_path: preview_path_to_frontend(&modl_path),
        mesh_path: preview_path_to_frontend(&mesh_path),
        skel_path: skel_path_opt,
        matl_paths,
        modl: modl_json,
        mesh: mesh_json,
        skel,
        matl: matl_value,
        matl_profiles: None,
        texture_refs,
        resolved_nutexb_paths,
        texture_resolve,
        warnings,
        source_kind: "disk".to_string(),
        source_session_id: None,
        virtual_modl_path: None,
    };
    preview_log(&format!(
        "load done: modl={} matl_files={} textures_ref={} textures_resolved={} warnings={} elapsed_ms={}",
        bundle.modl_path,
        bundle.matl_paths.len(),
        bundle.texture_refs.len(),
        bundle.resolved_nutexb_paths.len(),
        bundle.warnings.len(),
        t0.elapsed().as_millis()
    ));
    Ok(bundle)
}

#[tauri::command]
pub fn ssbh_load_model_preview(root_path: String) -> Result<SsbhModelPreviewBundle, String> {
    load_model_preview_bundle(&root_path)
}

/// Lists all `.numdlb` files under `root_path` (recursive), sorted lexicographically, capped by depth and count.
#[tauri::command]
pub fn ssbh_list_numdlb_under_tree(root_path: String) -> Result<Vec<String>, String> {
    let t0 = Instant::now();
    preview_log(&format!("list command: root={}", root_path));
    let paths = collect_numdlb_paths_recursive(
        Path::new(&root_path.trim()),
        NUMDLB_RECURSE_MAX_DEPTH,
        NUMDLB_RECURSE_MAX_FILES,
    )?;
    preview_log(&format!(
        "list command done: root={} count={} elapsed_ms={}",
        root_path,
        paths.len(),
        t0.elapsed().as_millis()
    ));
    Ok(paths
        .into_iter()
        .map(|p| preview_path_to_frontend(&p))
        .collect())
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
            return Err(format!("Unsupported extension for JSON preview: {other}"));
        }
    };
    Ok(json!({
        "filePath": path,
        "format": ext_lc,
        "data": v,
    }))
}

#[cfg(test)]
mod preview_path_tree_tests {
    use super::resolved_stays_under_unpack_tree;
    use std::path::Path;

    #[test]
    #[cfg(windows)]
    fn resolved_stays_mixed_verbatim_prefixes() {
        let model = Path::new(r"E:\unpack\delatkai_body");
        let resolved = Path::new(r"\\?\E:\unpack\delatkai_body\NormalMap.nutexb");
        assert!(resolved_stays_under_unpack_tree(model, resolved));
    }

    #[test]
    #[cfg(windows)]
    fn resolved_stays_both_verbatim() {
        let model = Path::new(r"\\?\E:\unpack\delatkai_body");
        let resolved = Path::new(r"\\?\E:\unpack\delatkai_body\NormalMap.nutexb");
        assert!(resolved_stays_under_unpack_tree(model, resolved));
    }
}

#[cfg(test)]
mod numatb_folder_tests {
    use super::{load_model_preview_bundle, MatlData};
    use std::fs;
    use std::path::Path;

    fn numatb_test_root() -> std::path::PathBuf {
        match std::env::var("SSBH_TEST_NUMATB_DIR") {
            Ok(s) => {
                let t = s.trim();
                if t.is_empty() {
                    Path::new(r"E:\XB\解包\com\file\0xa258a522").to_path_buf()
                } else {
                    std::path::PathBuf::from(t)
                }
            }
            Err(_) => Path::new(r"E:\XB\解包\com\file\0xa258a522").to_path_buf(),
        }
    }

    fn collect_numatb_paths(root: &Path) -> Vec<std::path::PathBuf> {
        let mut out: Vec<std::path::PathBuf> = fs::read_dir(root)
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .map(|e| e.path())
                    .filter(|p| {
                        p.extension()
                            .and_then(|x| x.to_str())
                            .map(|e| e.eq_ignore_ascii_case("numatb"))
                            .unwrap_or(false)
                    })
                    .collect()
            })
            .unwrap_or_default();
        out.sort();
        out
    }

    fn sample_model_path() -> std::path::PathBuf {
        numatb_test_root().join("015gndmuc_004deltpl_001_body_normal.numdlb")
    }

    /// Scans `SSBH_TEST_NUMATB_DIR` (default `E:\XB\解包\com\file\0xa258a522`) and asserts every
    /// `.numatb` parses with `ssbh_data::MatlData::from_file`.
    ///
    /// Run locally: `cargo test numatb_unpack_folder_matl_all_parse -- --ignored --nocapture`
    #[test]
    #[ignore = "Requires local unpack path; set SSBH_TEST_NUMATB_DIR to override"]
    fn numatb_unpack_folder_matl_all_parse() {
        let root = numatb_test_root();
        if !root.is_dir() {
            eprintln!(
                "skip: directory does not exist: {} (set SSBH_TEST_NUMATB_DIR)",
                root.display()
            );
            return;
        }
        let files = collect_numatb_paths(&root);
        assert!(
            !files.is_empty(),
            "no .numatb files under {}",
            root.display()
        );
        let mut failures: Vec<String> = Vec::new();
        for p in &files {
            match MatlData::from_file(p) {
                Ok(m) => {
                    eprintln!("OK  {}  ({} entries)", p.display(), m.entries.len());
                }
                Err(e) => {
                    let msg = format!("{}: {}", p.display(), e);
                    eprintln!("FAIL {msg}");
                    failures.push(msg);
                }
            }
        }
        assert!(
            failures.is_empty(),
            "MatlData::from_file failed for {} of {} file(s). See --nocapture output above.\n{}",
            failures.len(),
            files.len(),
            failures.join("\n---\n")
        );
    }

    /// Loads a real EXVS2 model preview bundle and verifies material + texture resolution reaches
    /// on-disk `.nutexb` files.
    ///
    /// Run locally:
    /// `cargo test exvs_model_preview_bundle_resolves_textures -- --ignored --nocapture`
    #[test]
    #[ignore = "Requires local unpack path; set SSBH_TEST_NUMATB_DIR to override"]
    fn exvs_model_preview_bundle_resolves_textures() {
        let model_path = sample_model_path();
        if !model_path.is_file() {
            eprintln!(
                "skip: model does not exist: {} (set SSBH_TEST_NUMATB_DIR)",
                model_path.display()
            );
            return;
        }

        let bundle = load_model_preview_bundle(&model_path.to_string_lossy())
            .expect("expected EXVS model preview bundle to load");

        assert!(
            bundle.matl.is_some(),
            "expected combined Matl JSON for {}",
            model_path.display()
        );
        assert!(
            bundle
                .matl_paths
                .iter()
                .any(|p| p.ends_with("__nust__.numatb")),
            "expected preview bundle to load at least one __nust__.numatb"
        );
        assert!(
            bundle
                .texture_refs
                .iter()
                .any(|r| r.contains("pbr1_basecolor")),
            "expected EXVS base color texture reference in preview bundle"
        );
        assert!(
            bundle
                .resolved_nutexb_paths
                .iter()
                .any(|p| p.ends_with("015gndmuc_004deltpl_001_pbr1_basecolor.nutexb")),
            "expected resolved EXVS base color .nutexb path in preview bundle"
        );
        assert!(
            !bundle
                .warnings
                .iter()
                .any(|w| w.contains("cannot parse as Matl")),
            "did not expect material parse warnings: {:?}",
            bundle.warnings
        );
    }
}
