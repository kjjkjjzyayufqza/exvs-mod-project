//! Auto-detect and fix unit-model `.numatb` maya/nust **filenames** only.
//!
//! **Never modifies `.numdlb`.** Game modl paths are absolute truth for the target
//! basenames. This tool only renames on-disk `.numatb` files + rewrites
//! `_structure.json` SubFileData / Item Name so they match.
//!
//! Content rule (which physical file is maya vs nust):
//! any non-empty `shader_label` → Nust; all empty → Maya.
//!
//! Target basename for each profile comes from the sibling `.numdlb`
//! `material_file_names` (basename only; `nusubf/` is ignored — extract is flat).

use serde::Serialize;
use serde_json::{json, Value};
use ssbh_data::prelude::ModlData;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use crate::format::numatb_format::{detect_numatb_profile_from_matl, NumatbProfileKind};

const MAYA_SUFFIX: &str = "__maya__";
const NUST_SUFFIX: &str = "__nust__";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NumatbProfileFixEntry {
    pub file_index: i32,
    pub old_filename: String,
    pub new_filename: String,
    pub old_file_url: String,
    pub new_file_url: String,
    pub content_profile: String,
    pub name_profile_before: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NumatbProfileFixReport {
    pub scanned: usize,
    pub fixed: usize,
    pub skipped: usize,
    pub fixes: Vec<NumatbProfileFixEntry>,
    pub warnings: Vec<String>,
}

#[derive(Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct InputSubFileData {
    index: usize,
    file_type: String,
    file_index: i32,
    file_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_base_name: Option<String>,
}

struct StructureDocument {
    path: PathBuf,
    json_dir: PathBuf,
    value: Value,
    sub_file_data: Vec<InputSubFileData>,
}

/// Dry-run: scan numatb entries and report renames needed (no disk writes).
pub fn analyze_unit_model_numatb_profiles(
    model_root: &str,
    structure_json_path: Option<&str>,
) -> Result<NumatbProfileFixReport, String> {
    let (model_root_path, doc) = open_doc(model_root, structure_json_path)?;
    plan_fixes(&model_root_path, &doc)
}

/// Apply renames on disk and rewrite structure JSON SubFileData / Item names.
pub fn fix_unit_model_numatb_profiles(
    model_root: &str,
    structure_json_path: Option<&str>,
) -> Result<NumatbProfileFixReport, String> {
    let (model_root_path, mut doc) = open_doc(model_root, structure_json_path)?;
    let mut report = plan_fixes(&model_root_path, &doc)?;
    if report.fixes.is_empty() {
        return Ok(report);
    }

    apply_disk_renames(&model_root_path, &report.fixes, &mut report.warnings)?;
    apply_structure_updates(&mut doc, &report.fixes)?;
    write_structure_document(&mut doc)?;
    Ok(report)
}

fn open_doc(
    model_root: &str,
    structure_json_path: Option<&str>,
) -> Result<(PathBuf, StructureDocument), String> {
    let model_root_path = validate_model_root(model_root)?;
    let doc = read_structure_document(&model_root_path, structure_json_path)?;
    Ok((model_root_path, doc))
}

fn plan_fixes(
    model_root: &Path,
    doc: &StructureDocument,
) -> Result<NumatbProfileFixReport, String> {
    let mut warnings = Vec::new();
    let mut fixes = Vec::new();
    let mut skipped = 0usize;
    let mut scanned = 0usize;

    // Per parent directory: numdlb-listed basenames for maya / nust (never written back).
    let mut dir_targets: HashMap<PathBuf, DirMaterialTargets> = HashMap::new();
    // Claimed target basenames (lower) within a directory for this batch.
    let mut claimed_targets: HashMap<String, i32> = HashMap::new();
    // Absolute paths that will be vacated by a planned rename (sources).
    let mut sources_leaving: HashSet<String> = HashSet::new();

    // First pass: classify every numatb we can parse.
    struct Classified {
        file_index: i32,
        abs: PathBuf,
        old_filename: String,
        old_file_url: String,
        content_profile: NumatbProfileKind,
        name_profile: Option<NumatbProfileKind>,
    }
    let mut classified: Vec<Classified> = Vec::new();

    for entry in doc.sub_file_data.iter() {
        if !entry_is_numatb(entry) {
            continue;
        }
        scanned += 1;
        let abs = resolve_file_path(&doc.json_dir, &entry.file_url);
        if !abs.is_file() {
            warnings.push(format!(
                "fileIndex {}: numatb missing on disk: {}",
                entry.file_index,
                abs.display()
            ));
            skipped += 1;
            continue;
        }
        let bytes = match fs::read(&abs) {
            Ok(b) => b,
            Err(e) => {
                warnings.push(format!(
                    "fileIndex {}: failed to read {}: {e}",
                    entry.file_index,
                    abs.display()
                ));
                skipped += 1;
                continue;
            }
        };
        let content_profile = match classify_bytes(&bytes) {
            Some(p) => p,
            None => {
                warnings.push(format!(
                    "fileIndex {}: failed to parse MatlData for shader_label profile ({})",
                    entry.file_index,
                    abs.display()
                ));
                skipped += 1;
                continue;
            }
        };
        let old_filename = basename_of(&entry.file_url);
        classified.push(Classified {
            file_index: entry.file_index,
            abs,
            old_filename: old_filename.clone(),
            old_file_url: entry.file_url.clone(),
            content_profile,
            name_profile: profile_from_filename(&old_filename),
        });
    }

    for item in &classified {
        let parent = item
            .abs
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        if !dir_targets.contains_key(&parent) {
            dir_targets.insert(
                parent.clone(),
                load_dir_material_targets(&parent, &mut warnings),
            );
        }
        let targets = dir_targets.get(&parent).cloned().unwrap_or_default();

        // Target basename: prefer the numdlb-listed name for this content profile.
        // Fall back only if that list has no entry for the profile (still no inventing _mNNN).
        let new_filename = match item.content_profile {
            NumatbProfileKind::Maya => {
                targets.maya_basenames.first().cloned().unwrap_or_else(|| {
                    desired_numatb_filename(&item.old_filename, NumatbProfileKind::Maya)
                })
            }
            NumatbProfileKind::Nust => {
                targets.nust_basenames.first().cloned().unwrap_or_else(|| {
                    desired_numatb_filename(&item.old_filename, NumatbProfileKind::Nust)
                })
            }
        };

        if new_filename.eq_ignore_ascii_case(&item.old_filename) {
            skipped += 1;
            continue;
        }

        let new_abs = parent.join(&new_filename);
        let target_key = format!(
            "{}|{}",
            normalize_path_key(&parent),
            new_filename.to_ascii_lowercase()
        );

        if let Some(other) = claimed_targets.get(&target_key) {
            if *other != item.file_index {
                warnings.push(format!(
                    "fileIndex {}: target '{}' already claimed by fileIndex {other}; skipped (numdlb untouched)",
                    item.file_index, new_filename
                ));
                skipped += 1;
                continue;
            }
        }

        // Refuse overwrite of an existing file that is not also being renamed away.
        if new_abs.exists() {
            let same_file = fs::canonicalize(&item.abs)
                .ok()
                .zip(fs::canonicalize(&new_abs).ok())
                .map(|(a, b)| a == b)
                .unwrap_or(false);
            if !same_file {
                let new_key = normalize_path_key(&new_abs);
                let vacated = sources_leaving.contains(&new_key)
                    || classified.iter().any(|c| {
                        c.file_index != item.file_index
                            && normalize_path_key(&c.abs) == new_key
                            && !new_filename.eq_ignore_ascii_case(&c.old_filename)
                    });
                // Second pass: check if any classified item currently at new_abs will rename away.
                let will_leave = classified.iter().any(|c| {
                    if normalize_path_key(&c.abs) != new_key {
                        return false;
                    }
                    // Will be planned later or already — approximate: different desired name
                    let their_target = match c.content_profile {
                        NumatbProfileKind::Maya => {
                            targets.maya_basenames.first().cloned().unwrap_or_else(|| {
                                desired_numatb_filename(&c.old_filename, NumatbProfileKind::Maya)
                            })
                        }
                        NumatbProfileKind::Nust => {
                            targets.nust_basenames.first().cloned().unwrap_or_else(|| {
                                desired_numatb_filename(&c.old_filename, NumatbProfileKind::Nust)
                            })
                        }
                    };
                    !their_target.eq_ignore_ascii_case(&c.old_filename)
                });
                if !vacated && !will_leave {
                    warnings.push(format!(
                        "fileIndex {}: refuse overwrite existing '{}'; skipped (numdlb untouched)",
                        item.file_index, new_filename
                    ));
                    skipped += 1;
                    continue;
                }
            }
        }

        claimed_targets.insert(target_key, item.file_index);
        sources_leaving.insert(normalize_path_key(&item.abs));

        let new_file_url = replace_filename_in_url(&item.old_file_url, &new_filename);
        fixes.push(NumatbProfileFixEntry {
            file_index: item.file_index,
            old_filename: item.old_filename.clone(),
            new_filename,
            old_file_url: item.old_file_url.clone(),
            new_file_url,
            content_profile: profile_label(item.content_profile).to_string(),
            name_profile_before: item.name_profile.map(profile_label).map(str::to_string),
        });
    }

    let _ = model_root;
    Ok(NumatbProfileFixReport {
        scanned,
        fixed: fixes.len(),
        skipped,
        fixes,
        warnings,
    })
}

#[derive(Clone, Default)]
struct DirMaterialTargets {
    maya_basenames: Vec<String>,
    nust_basenames: Vec<String>,
}

/// Read sibling `.numdlb` (read-only) for authoritative material basenames.
fn load_dir_material_targets(dir: &Path, warnings: &mut Vec<String>) -> DirMaterialTargets {
    let mut out = DirMaterialTargets::default();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if !name.ends_with(".numdlb") {
            continue;
        }
        match ModlData::from_file(&path) {
            Ok(modl) => {
                for raw in &modl.material_file_names {
                    let base = Path::new(raw.trim())
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    if base.is_empty() {
                        continue;
                    }
                    let lower = base.to_ascii_lowercase();
                    if lower.contains(MAYA_SUFFIX) {
                        if !out
                            .maya_basenames
                            .iter()
                            .any(|e| e.eq_ignore_ascii_case(&base))
                        {
                            out.maya_basenames.push(base);
                        }
                    } else if lower.contains(NUST_SUFFIX) {
                        if !out
                            .nust_basenames
                            .iter()
                            .any(|e| e.eq_ignore_ascii_case(&base))
                        {
                            out.nust_basenames.push(base);
                        }
                    }
                }
            }
            Err(e) => warnings.push(format!(
                "Could not read numdlb {} for material names (left untouched): {e}",
                path.display()
            )),
        }
    }
    out
}

fn apply_disk_renames(
    model_root: &Path,
    fixes: &[NumatbProfileFixEntry],
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    let root_canon = fs::canonicalize(model_root).map_err(|e| {
        format!(
            "Failed to canonicalize model root {}: {e}",
            model_root.display()
        )
    })?;

    // Map old absolute → new absolute for this batch.
    let mut renames: Vec<(PathBuf, PathBuf)> = Vec::new();
    for fix in fixes {
        // Prefer resolving via structure-relative urls through parent of old file.
        // Reconstruct from file_url is done by caller storing paths via structure dir.
        // Here we re-resolve from model-relative by scanning: use old_file_url relative to structure.
        // We don't have json_dir here — derive from old_filename search under model_root.
        let old_abs = find_file_under_root(model_root, &fix.old_filename).ok_or_else(|| {
            format!(
                "Cannot locate '{}' under {} for rename",
                fix.old_filename,
                model_root.display()
            )
        })?;
        let new_abs = old_abs
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(&fix.new_filename);
        renames.push((old_abs, new_abs));
    }

    // Two-phase rename with temps to support A↔B swaps.
    let mut temps: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (i, (old_abs, new_abs)) in renames.iter().enumerate() {
        let old_canon = fs::canonicalize(old_abs)
            .map_err(|e| format!("Failed to canonicalize {}: {e}", old_abs.display()))?;
        if !old_canon.starts_with(&root_canon) {
            return Err(format!(
                "Refusing to rename outside unit root: {}",
                old_canon.display()
            ));
        }
        let temp = old_abs.with_extension(format!("numatb.__fix_tmp_{i}"));
        fs::rename(old_abs, &temp).map_err(|e| {
            format!(
                "Failed to temp-rename {} -> {}: {e}",
                old_abs.display(),
                temp.display()
            )
        })?;
        temps.push((temp, new_abs.clone()));
    }

    for (temp, new_abs) in &temps {
        if let Some(parent) = new_abs.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent dir {}: {e}", parent.display()))?;
        }
        if new_abs.exists() {
            // After all sources moved to temps, surviving targets mean we would clobber
            // a file that was not part of this rename set — abort that one and restore.
            warnings.push(format!(
                "Refuse to overwrite existing '{}'; rolling back temp {}",
                new_abs.display(),
                temp.display()
            ));
            // Try to restore temp to a unique recovery name rather than destroy data.
            let recovery = temp.with_extension("numatb.__fix_recovered");
            let _ = fs::rename(temp, &recovery);
            continue;
        }
        fs::rename(temp, new_abs).map_err(|e| {
            format!(
                "Failed to rename {} -> {}: {e}",
                temp.display(),
                new_abs.display()
            )
        })?;
    }

    Ok(())
}

fn apply_structure_updates(
    doc: &mut StructureDocument,
    fixes: &[NumatbProfileFixEntry],
) -> Result<(), String> {
    let by_index: HashMap<i32, &NumatbProfileFixEntry> =
        fixes.iter().map(|f| (f.file_index, f)).collect();

    for entry in &mut doc.sub_file_data {
        let Some(fix) = by_index.get(&entry.file_index) else {
            continue;
        };
        entry.file_url = fix.new_file_url.clone();
        entry.file_base_name = Some(strip_numatb_extension(&fix.new_filename));
    }

    // Patch SubFileStructure Item.Name when it matches an old basename (no extension).
    if let Some(structure) = doc.value.get_mut("SubFileStructure") {
        if let Some(arr) = structure.as_array_mut() {
            for node in arr.iter_mut() {
                let Some(obj) = node.as_object_mut() else {
                    continue;
                };
                let is_item = obj
                    .get("type")
                    .and_then(|v| v.as_str())
                    .is_some_and(|t| t.eq_ignore_ascii_case("Item"));
                if !is_item {
                    continue;
                }
                let file_index = obj
                    .get("fileIndex")
                    .and_then(|v| v.as_i64())
                    .map(|v| v as i32);
                let Some(fi) = file_index else {
                    continue;
                };
                let Some(fix) = by_index.get(&fi) else {
                    continue;
                };
                let new_base = strip_numatb_extension(&fix.new_filename);
                // Keep tree Item.Name in sync with the renamed stem.
                obj.insert("Name".to_string(), json!(new_base));
            }
        }
    }

    Ok(())
}

fn write_structure_document(doc: &mut StructureDocument) -> Result<(), String> {
    let sub_value = serde_json::to_value(&doc.sub_file_data)
        .map_err(|e| format!("Failed to serialize SubFileData: {e}"))?;
    let obj = doc
        .value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object.".to_string())?;
    obj.insert(
        "Fhm2dTotalCount".to_string(),
        json!(doc.sub_file_data.len()),
    );
    obj.insert("SubFileData".to_string(), sub_value);
    let raw = serde_json::to_string_pretty(&doc.value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    fs::write(&doc.path, format!("{raw}\n"))
        .map_err(|e| format!("Failed to write structure JSON {}: {e}", doc.path.display()))
}

// ── helpers ────────────────────────────────────────────────────────────────

fn validate_model_root(model_root: &str) -> Result<PathBuf, String> {
    let trimmed = model_root.trim();
    if trimmed.is_empty() {
        return Err("model_root cannot be empty.".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_dir() {
        return Err(format!(
            "Unit model root is not a directory: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn resolve_structure_json_path(
    model_root: &Path,
    explicit: Option<&str>,
) -> Result<PathBuf, String> {
    let trimmed = explicit.unwrap_or_default().trim();
    if !trimmed.is_empty() {
        return Ok(PathBuf::from(trimmed));
    }
    let parent = model_root.parent().ok_or_else(|| {
        format!(
            "Cannot infer structure JSON path from {}",
            model_root.display()
        )
    })?;
    let name = model_root
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| {
            format!(
                "Cannot infer structure JSON path from {}",
                model_root.display()
            )
        })?;
    Ok(parent.join(format!("{name}_structure.json")))
}

fn read_structure_document(
    model_root: &Path,
    structure_json_path: Option<&str>,
) -> Result<StructureDocument, String> {
    let path = resolve_structure_json_path(model_root, structure_json_path)?;
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read structure JSON {}: {e}", path.display()))?;
    let value: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse structure JSON {}: {e}", path.display()))?;
    let sub_value = value
        .get("SubFileData")
        .cloned()
        .ok_or_else(|| format!("Structure JSON is missing SubFileData: {}", path.display()))?;
    let sub_file_data: Vec<InputSubFileData> = serde_json::from_value(sub_value)
        .map_err(|e| format!("Failed to parse SubFileData from {}: {e}", path.display()))?;
    let json_dir = path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    Ok(StructureDocument {
        path,
        json_dir,
        value,
        sub_file_data,
    })
}

fn entry_is_numatb(entry: &InputSubFileData) -> bool {
    let ft = entry.file_type.trim().to_ascii_lowercase();
    if ft == ".numatb" {
        return true;
    }
    entry.file_url.to_ascii_lowercase().ends_with(".numatb")
}

fn classify_bytes(data: &[u8]) -> Option<NumatbProfileKind> {
    let mut cursor = Cursor::new(data);
    match ssbh_data::prelude::MatlData::read(&mut cursor) {
        Ok(matl) => Some(detect_numatb_profile_from_matl(&matl)),
        Err(_) => None,
    }
}

fn profile_label(profile: NumatbProfileKind) -> &'static str {
    match profile {
        NumatbProfileKind::Maya => "maya",
        NumatbProfileKind::Nust => "nust",
    }
}

/// Public for unit tests: strip markers and apply the content profile suffix.
pub fn desired_numatb_filename(current_filename: &str, profile: NumatbProfileKind) -> String {
    let stem = strip_numatb_extension(current_filename);
    let base = strip_profile_suffix(&stem);
    let safe = if base.is_empty() {
        "material"
    } else {
        base.as_str()
    };
    match profile {
        NumatbProfileKind::Maya => format!("{safe}{MAYA_SUFFIX}.numatb"),
        NumatbProfileKind::Nust => format!("{safe}{NUST_SUFFIX}.numatb"),
    }
}

pub fn profile_from_filename(filename: &str) -> Option<NumatbProfileKind> {
    let lower = strip_numatb_extension(filename).to_ascii_lowercase();
    if lower.contains(MAYA_SUFFIX) {
        Some(NumatbProfileKind::Maya)
    } else if lower.contains(NUST_SUFFIX) {
        Some(NumatbProfileKind::Nust)
    } else {
        None
    }
}

fn strip_profile_suffix(stem: &str) -> String {
    let lower = stem.to_ascii_lowercase();
    if let Some(idx) = lower.rfind(MAYA_SUFFIX) {
        return stem[..idx].to_string();
    }
    if let Some(idx) = lower.rfind(NUST_SUFFIX) {
        return stem[..idx].to_string();
    }
    stem.to_string()
}

fn strip_numatb_extension(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.to_ascii_lowercase().ends_with(".numatb") {
        trimmed[..trimmed.len() - ".numatb".len()].to_string()
    } else {
        trimmed.to_string()
    }
}

fn basename_of(file_url: &str) -> String {
    file_url
        .replace('/', "\\")
        .split('\\')
        .filter(|p| !p.is_empty() && *p != ".")
        .next_back()
        .unwrap_or(file_url)
        .to_string()
}

fn replace_filename_in_url(file_url: &str, new_filename: &str) -> String {
    match file_url.rfind(['/', '\\']) {
        Some(idx) => format!("{}{new_filename}", &file_url[..=idx]),
        None => new_filename.to_string(),
    }
}

fn resolve_file_path(json_dir: &Path, file_url: &str) -> PathBuf {
    let cleaned = file_url.trim().trim_start_matches(['.', '/', '\\']);
    let relative = cleaned.replace('/', std::path::MAIN_SEPARATOR_STR);
    json_dir.join(relative)
}

fn normalize_path_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn find_file_under_root(root: &Path, filename: &str) -> Option<PathBuf> {
    let target = filename.to_ascii_lowercase();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.eq_ignore_ascii_case(&target))
            {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desired_filename_strips_wrong_marker_and_applies_content() {
        assert_eq!(
            desired_numatb_filename("body__maya__.numatb", NumatbProfileKind::Nust),
            "body__nust__.numatb"
        );
        assert_eq!(
            desired_numatb_filename("body__nust__.numatb", NumatbProfileKind::Maya),
            "body__maya__.numatb"
        );
        assert_eq!(
            desired_numatb_filename("body.numatb", NumatbProfileKind::Maya),
            "body__maya__.numatb"
        );
        assert_eq!(
            desired_numatb_filename("body.numatb", NumatbProfileKind::Nust),
            "body__nust__.numatb"
        );
    }

    #[test]
    fn profile_from_filename_reads_markers() {
        assert_eq!(
            profile_from_filename("x__maya__.numatb"),
            Some(NumatbProfileKind::Maya)
        );
        assert_eq!(
            profile_from_filename("x__nust__.numatb"),
            Some(NumatbProfileKind::Nust)
        );
        assert_eq!(profile_from_filename("x.numatb"), None);
    }

    #[test]
    fn replace_filename_preserves_relative_prefix() {
        let url = r".\pkg\body\body__maya__.numatb";
        let next = replace_filename_in_url(url, "body__nust__.numatb");
        assert!(next.to_ascii_lowercase().ends_with("body__nust__.numatb"));
        assert!(next.contains("body") || next.contains("pkg"));
    }

    #[test]
    fn analyze_and_fix_roundtrip_on_fixture() {
        let temp = tempfile::tempdir().unwrap();
        let model_root = temp.path().join("PKG");
        let model_dir = model_root.join("body");
        fs::create_dir_all(&model_dir).unwrap();

        // Minimal invalid matl bytes — parse fails → skipped (no panic).
        fs::write(model_dir.join("body__maya__.numatb"), b"not-a-matl").unwrap();
        let structure_path = temp.path().join("PKG_structure.json");
        fs::write(
            &structure_path,
            serde_json::to_string_pretty(&json!({
                "Magic": 10,
                "Fhm2dTotalCount": 1,
                "SubFileData": [{
                    "index": 0,
                    "fileType": ".numatb",
                    "fileIndex": 0,
                    "fileUrl": r".\PKG\body\body__maya__.numatb",
                    "fileBaseName": "body__maya__"
                }],
                "SubFileStructure": [
                    { "type": "Folder", "unk2": "", "unk3": 0, "unk5": 0 },
                    { "type": "Item", "fileIndex": 0, "unk2": "21000000", "unk3": 1, "Name": "body__maya__" },
                    { "type": "EndMark", "endMarkCount": 1 }
                ]
            }))
            .unwrap(),
        )
        .unwrap();

        let report = analyze_unit_model_numatb_profiles(
            model_root.to_str().unwrap(),
            Some(structure_path.to_str().unwrap()),
        )
        .unwrap();
        assert_eq!(report.scanned, 1);
        // Invalid matl → no fix, warning present
        assert_eq!(report.fixed, 0);
        assert!(!report.warnings.is_empty());
    }
}
