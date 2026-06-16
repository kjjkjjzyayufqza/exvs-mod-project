use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde_json::Value;
use tempfile::Builder;

use crate::format::fhm2d_pack::{repack_fhm2d_from_structure, RepackProgress, RepackResult};

pub fn repack_unit_model_from_structure(
    structure_json_path: &str,
    output_path: &str,
    atomic_write: bool,
    progress_callback: Option<&dyn Fn(RepackProgress)>,
) -> Result<RepackResult, String> {
    let structure_path = Path::new(structure_json_path);
    let json_dir = structure_path
        .parent()
        .ok_or_else(|| "Cannot determine parent directory of structure json".to_string())?;
    let raw = fs::read_to_string(structure_path)
        .map_err(|e| format!("Failed to read structure json: {e}"))?;
    let mut root: Value =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse structure json: {e}"))?;

    let skip_indices = missing_legacy_root_file_indices(&root, json_dir)?;
    if skip_indices.is_empty() {
        return repack_fhm2d_from_structure(
            structure_json_path,
            output_path,
            atomic_write,
            progress_callback,
        );
    }

    filter_structure_for_skipped_indices(&mut root, &skip_indices)?;

    let mut temp = Builder::new()
        .prefix(".unit-model-repack-")
        .suffix("_structure.json")
        .tempfile_in(json_dir)
        .map_err(|e| {
            format!(
                "Failed to create temporary Unit Model structure in {}: {e}",
                json_dir.display()
            )
        })?;
    let sanitized = serde_json::to_vec_pretty(&root)
        .map_err(|e| format!("Failed to serialize temporary Unit Model structure: {e}"))?;
    temp.write_all(&sanitized).map_err(|e| {
        format!(
            "Failed to write temporary Unit Model structure {}: {e}",
            temp.path().display()
        )
    })?;
    temp.flush().map_err(|e| {
        format!(
            "Failed to flush temporary Unit Model structure {}: {e}",
            temp.path().display()
        )
    })?;

    let temp_path = temp.path().to_string_lossy().to_string();
    repack_fhm2d_from_structure(&temp_path, output_path, atomic_write, progress_callback)
}

/// Collect the `fileIndex` of any *legacy root control bin* (characterid / shell / vernier_table
/// / effect_project) that is missing on disk. These are shared/deduped and may legitimately be
/// absent; they are filtered out so the repack can proceed. Every other referenced file is a hard
/// requirement and a missing one fails the repack (see `load_and_compress_files`).
fn missing_legacy_root_file_indices(root: &Value, json_dir: &Path) -> Result<HashSet<i32>, String> {
    let entries = root
        .get("SubFileData")
        .and_then(Value::as_array)
        .ok_or_else(|| "Structure JSON is missing SubFileData array.".to_string())?;
    let mut out = HashSet::new();
    for entry in entries {
        if !is_legacy_root_control_entry(entry) {
            continue;
        }
        let Some(file_index) = value_file_index(entry) else {
            continue;
        };
        let Some(file_url) = entry.get("fileUrl").and_then(Value::as_str) else {
            continue;
        };
        if !resolve_file_path(json_dir, file_url).is_file() {
            out.insert(file_index);
        }
    }
    Ok(out)
}

fn filter_structure_for_skipped_indices(
    root: &mut Value,
    skip_indices: &HashSet<i32>,
) -> Result<(), String> {
    let sub_file_data = root
        .get_mut("SubFileData")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Structure JSON is missing SubFileData array.".to_string())?;
    sub_file_data.retain(|entry| {
        value_file_index(entry)
            .map(|file_index| !skip_indices.contains(&file_index))
            .unwrap_or(true)
    });
    for (index, entry) in sub_file_data.iter_mut().enumerate() {
        if let Some(obj) = entry.as_object_mut() {
            obj.insert("index".to_string(), Value::from(index));
        }
    }

    let sub_file_structure = root
        .get_mut("SubFileStructure")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Structure JSON is missing SubFileStructure array.".to_string())?;
    let filtered = filter_structure_entries(sub_file_structure, skip_indices);
    *sub_file_structure = filtered;

    Ok(())
}

fn filter_structure_entries(entries: &[Value], skip_indices: &HashSet<i32>) -> Vec<Value> {
    let mut cursor = 0usize;
    let mut out = Vec::new();
    while cursor < entries.len() {
        if let Some(mut chunk) = filter_structure_entry(entries, &mut cursor, skip_indices) {
            out.append(&mut chunk);
        }
    }
    out
}

fn filter_structure_entry(
    entries: &[Value],
    cursor: &mut usize,
    skip_indices: &HashSet<i32>,
) -> Option<Vec<Value>> {
    let entry = entries.get(*cursor)?.clone();
    *cursor += 1;

    match entry_type(&entry) {
        Some("Item") => {
            let file_index = value_file_index(&entry)?;
            if skip_indices.contains(&file_index) {
                None
            } else {
                Some(vec![entry])
            }
        }
        Some("Folder") => Some(filter_folder_entry(entry, entries, cursor, skip_indices)),
        Some("EndMark") => Some(vec![entry]),
        _ => Some(vec![entry]),
    }
}

fn filter_folder_entry(
    mut folder: Value,
    entries: &[Value],
    cursor: &mut usize,
    skip_indices: &HashSet<i32>,
) -> Vec<Value> {
    let child_count = folder
        .get("folderCount")
        .and_then(Value::as_i64)
        .filter(|count| *count >= 0)
        .unwrap_or(0) as usize;

    let mut children = Vec::new();
    let mut kept_direct_children = 0usize;
    for _ in 0..child_count {
        if *cursor >= entries.len() || entry_type(&entries[*cursor]) == Some("EndMark") {
            break;
        }
        if let Some(mut chunk) = filter_structure_entry(entries, cursor, skip_indices) {
            kept_direct_children += 1;
            children.append(&mut chunk);
        }
    }

    let end_mark = if entries.get(*cursor).and_then(entry_type) == Some("EndMark") {
        let end = entries[*cursor].clone();
        *cursor += 1;
        Some(end)
    } else {
        None
    };

    if let Some(obj) = folder.as_object_mut() {
        obj.insert("folderCount".to_string(), Value::from(kept_direct_children));
    }

    let mut out = vec![folder];
    out.extend(children);
    if let Some(end_mark) = end_mark {
        out.push(end_mark);
    }
    out
}

fn entry_type(entry: &Value) -> Option<&str> {
    entry.get("type").and_then(Value::as_str)
}

fn value_file_index(entry: &Value) -> Option<i32> {
    let value = entry.get("fileIndex")?.as_i64()?;
    i32::try_from(value).ok()
}

fn actual_ext(entry: &Value) -> Option<String> {
    let file_url = entry
        .get("fileUrl")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let from_url = extension_from_name(&file_basename(file_url));
    if !from_url.is_empty() {
        return Some(from_url);
    }
    entry
        .get("fileType")
        .and_then(Value::as_str)
        .map(|value| value.to_ascii_lowercase())
}

fn is_legacy_root_control_entry(entry: &Value) -> bool {
    let Some(file_url) = entry.get("fileUrl").and_then(Value::as_str) else {
        return false;
    };
    let cleaned = file_url.replace('\\', "/");
    let segments: Vec<&str> = cleaned
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect();
    if segments.len() != 2 {
        return false;
    }
    let name = segments[1].to_ascii_lowercase();
    name.starts_with("characterid_")
        || name.starts_with("shell_")
        || name.starts_with("vernier_table_")
        || name.starts_with("effect_project_")
}

fn file_basename(file_url: &str) -> String {
    file_url
        .replace('\\', "/")
        .split('/')
        .filter(|s| !s.is_empty() && *s != ".")
        .last()
        .unwrap_or(file_url)
        .to_string()
}

fn extension_from_name(name: &str) -> String {
    match name.rfind('.') {
        Some(idx) if idx > 0 && idx + 1 < name.len() => name[idx..].to_ascii_lowercase(),
        _ => String::new(),
    }
}

fn resolve_file_path(json_dir: &Path, file_url: &str) -> PathBuf {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    json_dir.join(cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn missing_referenced_paths(structure_path: &Path) -> Vec<PathBuf> {
        let Ok(raw) = fs::read_to_string(structure_path) else {
            return Vec::new();
        };
        let Ok(root) = serde_json::from_str::<Value>(&raw) else {
            return Vec::new();
        };
        let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));
        root.get("SubFileData")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|entry| entry.get("fileUrl").and_then(Value::as_str))
            .map(|file_url| resolve_file_path(json_dir, file_url))
            .filter(|path| !path.is_file())
            .collect()
    }

    #[test]
    fn real_sample_0xa258a522_repack_skips_missing_legacy_shl_when_present() {
        let structure_path = Path::new(r"E:\XB\解包\com\file\0xA258a522_structure.json");
        if !structure_path.exists() {
            eprintln!("SKIP: real unit model sample 0xA258a522 is not present.");
            return;
        }
        let missing_paths = missing_referenced_paths(structure_path);
        if let Some(first_missing) = missing_paths.first() {
            eprintln!(
                "SKIP: real unit model sample 0xA258a522 is incomplete; missing {} referenced file(s), first: {}",
                missing_paths.len(),
                first_missing.display()
            );
            return;
        }

        let tmp = tempfile::tempdir().unwrap();
        let output_path = tmp.path().join("0xA258a522.fhm2d");
        let result = repack_unit_model_from_structure(
            structure_path.to_str().unwrap(),
            output_path.to_str().unwrap(),
            true,
            None,
        )
        .unwrap();

        assert!(result.total_files > 0);
        assert!(output_path.is_file());
    }
}
