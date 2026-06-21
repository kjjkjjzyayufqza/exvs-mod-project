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
    let model_root = crate::format::unit_model_models::infer_model_root_from_structure_path(
        structure_path,
    )?;
    let json_dir = structure_path
        .parent()
        .ok_or_else(|| "Cannot determine parent directory of structure json".to_string())?;
    let original_raw = fs::read_to_string(structure_path)
        .map_err(|e| format!("Failed to read structure json: {e}"))?;
    let original_root: Value =
        serde_json::from_str(&original_raw).map_err(|e| format!("Failed to parse structure json: {e}"))?;
    let should_sync = original_root
        .get("SubFileStructure")
        .and_then(Value::as_array)
        .is_some_and(|entries| !entries.is_empty())
        && original_root
            .get("SubFileData")
            .and_then(Value::as_array)
            .is_some_and(|entries| {
                entries.iter().any(entry_is_numatb)
            });
    let working = Builder::new()
        .prefix(".unit-model-repack-working-")
        .suffix("_structure.json")
        .tempfile_in(json_dir)
        .map_err(|e| {
            format!(
                "Failed to create working Unit Model structure in {}: {e}",
                json_dir.display()
            )
        })?;
    fs::copy(structure_path, working.path()).map_err(|e| {
        format!(
            "Failed to copy Unit Model structure {} -> {}: {e}",
            structure_path.display(),
            working.path().display()
        )
    })?;
    if should_sync {
        crate::format::unit_model_models::sync_unit_model_texture_containers(
            &model_root.to_string_lossy(),
            Some(&working.path().to_string_lossy()),
        )?;
    }

    let raw = fs::read_to_string(working.path())
        .map_err(|e| format!("Failed to read structure json: {e}"))?;
    let mut root: Value =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse structure json: {e}"))?;

    let skip_indices = missing_legacy_root_file_indices(&root, json_dir)?;
    if skip_indices.is_empty() {
        return repack_fhm2d_from_structure(
            &working.path().to_string_lossy(),
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

fn entry_is_numatb(entry: &Value) -> bool {
    entry_extension(entry) == ".numatb"
}

fn entry_extension(entry: &Value) -> String {
    let file_url = entry
        .get("fileUrl")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let normalized = file_url.replace('\\', "/");
    let basename = normalized
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .last()
        .unwrap_or(file_url);
    if let Some(index) = basename.rfind('.') {
        return basename[index..].to_ascii_lowercase();
    }
    entry
        .get("fileType")
        .and_then(Value::as_str)
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default()
}

fn resolve_file_path(json_dir: &Path, file_url: &str) -> PathBuf {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    json_dir.join(cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use ssbh_data::hlpb_data::HlpbData;
    use ssbh_data::matl_data::ParamId;
    use ssbh_data::matl_data::{MatlData, MatlEntryData, TextureParam};

    fn write_sync_fixture(parent: &Path, folder_name: &str) -> (PathBuf, PathBuf) {
        let model_root = parent.join(folder_name);
        let model_dir = model_root.join("models").join("alpha");
        let textures_dir = model_root.join("textures");
        fs::create_dir_all(&model_dir).unwrap();
        fs::create_dir_all(&textures_dir).unwrap();

        for name in ["alpha.nusktb", "alpha.numshb", "alpha.numdlb", "alpha.jnttbl"] {
            fs::write(model_dir.join(name), b"stub").unwrap();
        }
        HlpbData {
            major_version: 1,
            minor_version: 0,
            aim_constraints: Vec::new(),
            orient_constraints: Vec::new(),
        }
        .write_to_file(model_dir.join("alpha.nuhlpb"))
        .unwrap();

        let maya = MatlData {
            major_version: 1,
            minor_version: 6,
            entries: vec![MatlEntryData {
                material_label: "alpha".into(),
                shader_label: String::new(),
                blend_states: Vec::new(),
                floats: Vec::new(),
                float1s: Vec::new(),
                booleans: Vec::new(),
                vectors: Vec::new(),
                colors: Vec::new(),
                rasterizer_states: Vec::new(),
                samplers: Vec::new(),
                textures: vec![TextureParam::new(
                    ParamId::DiffuseMap,
                    "color_palette".to_string(),
                )],
                textures2: Vec::new(),
                type4_v16: Vec::new(),
                type4_v15: Vec::new(),
                uv_transforms: Vec::new(),
            }],
        };
        maya.write_to_file(model_dir.join("alpha__maya__.numatb"))
            .unwrap();

        let nust = MatlData {
            major_version: 1,
            minor_version: 6,
            entries: vec![MatlEntryData {
                material_label: "alpha".into(),
                shader_label: "vstgStandard_VertexColor".into(),
                blend_states: Vec::new(),
                floats: Vec::new(),
                float1s: Vec::new(),
                booleans: Vec::new(),
                vectors: Vec::new(),
                colors: Vec::new(),
                rasterizer_states: Vec::new(),
                samplers: Vec::new(),
                textures: vec![TextureParam::new(
                    ParamId::BaseColorMap,
                    "color_palette".to_string(),
                )],
                textures2: Vec::new(),
                type4_v16: Vec::new(),
                type4_v15: Vec::new(),
                uv_transforms: Vec::new(),
            }],
        };
        nust.write_to_file(model_dir.join("alpha__nust__.numatb"))
            .unwrap();

        fs::write(textures_dir.join("color_palette.nutexb"), b"nutexb").unwrap();

        let structure = parent.join(format!("{folder_name}_structure.json"));
        let value = json!({
            "Magic": 10,
            "Fhm2dTotalCount": 8,
            "UnkCount": 0,
            "SubFileData": [
                { "index": 0, "fileType": ".nusktb", "fileIndex": 0, "fileUrl": format!(".\\{folder_name}\\models\\alpha\\alpha.nusktb"), "fileBaseName": "alpha" },
                { "index": 1, "fileType": ".numshb", "fileIndex": 1, "fileUrl": format!(".\\{folder_name}\\models\\alpha\\alpha.numshb"), "fileBaseName": "alpha" },
                { "index": 2, "fileType": ".numdlb", "fileIndex": 2, "fileUrl": format!(".\\{folder_name}\\models\\alpha\\alpha.numdlb"), "fileBaseName": "alpha" },
                { "index": 3, "fileType": ".jnttbl", "fileIndex": 3, "fileUrl": format!(".\\{folder_name}\\models\\alpha\\alpha.jnttbl"), "fileBaseName": "alpha" },
                { "index": 4, "fileType": ".numatb", "fileIndex": 4, "fileUrl": format!(".\\{folder_name}\\models\\alpha\\alpha__maya__.numatb"), "fileBaseName": "alpha__maya__" },
                { "index": 5, "fileType": ".numatb", "fileIndex": 5, "fileUrl": format!(".\\{folder_name}\\models\\alpha\\alpha__nust__.numatb"), "fileBaseName": "alpha__nust__" },
                { "index": 6, "fileType": ".nuhlpb", "fileIndex": 6, "fileUrl": format!(".\\{folder_name}\\models\\alpha\\alpha.nuhlpb"), "fileBaseName": "alpha" },
                { "index": 7, "fileType": ".nuhlpb", "fileIndex": 7, "fileUrl": format!(".\\{folder_name}\\models\\alpha\\alpha.nuhlpb"), "fileBaseName": "alpha" }
            ],
            "SubFileStructure": [
                { "type": "Folder", "unk1": "00000000", "folderCount": 2, "unk2": "00000000", "unk2_1": 0, "unk3": 0, "unk4": 0, "unk5": 0, "unk6": 0 },
                { "type": "Folder", "unk1": "00000000", "folderCount": 8, "unk2": "00000000", "unk2_1": 0, "unk3": 0, "unk4": 0, "unk5": 0, "unk6": 0 },
                { "type": "Item", "unk1": "00000000", "fileIndex": 0, "unk2": "10000000", "unk2_1": 0, "unk3": 0, "unk4": 0, "originalFileIndex": 0, "Name": "alpha" },
                { "type": "Folder", "unk1": "00000000", "folderCount": 0, "unk2": "00000000", "unk2_1": 0, "unk3": 32, "unk4": 0, "unk5": 1, "unk6": 0 },
                { "type": "EndMark", "endMarkCount": 1 },
                { "type": "Item", "unk1": "00000000", "fileIndex": 4, "unk2": "21000000", "unk2_1": 0, "unk3": 1, "unk4": 0, "originalFileIndex": 4, "Name": "alpha__maya__" },
                { "type": "Folder", "unk1": "00000000", "folderCount": 0, "unk2": "00000000", "unk2_1": 0, "unk3": 32, "unk4": 0, "unk5": 1, "unk6": 0 },
                { "type": "EndMark", "endMarkCount": 1 },
                { "type": "Item", "unk1": "00000000", "fileIndex": 5, "unk2": "21000000", "unk2_1": 0, "unk3": 1, "unk4": 0, "originalFileIndex": 5, "Name": "alpha__nust__" },
                { "type": "Item", "unk1": "00000000", "fileIndex": 1, "unk2": "30000000", "unk2_1": 0, "unk3": 0, "unk4": 0, "originalFileIndex": 1, "Name": "alpha" },
                { "type": "Item", "unk1": "00000000", "fileIndex": 2, "unk2": "40000000", "unk2_1": 0, "unk3": 0, "unk4": 0, "originalFileIndex": 2, "Name": "alpha" },
                { "type": "Item", "unk1": "00000000", "fileIndex": 3, "unk2": "50000000", "unk2_1": 0, "unk3": 0, "unk4": 0, "originalFileIndex": 3, "Name": "alpha" },
                { "type": "EndMark", "endMarkCount": 1 },
                { "type": "Item", "unk1": "00000000", "fileIndex": 7, "unk2": "00000000", "unk2_1": 0, "unk3": 0, "unk4": 0, "originalFileIndex": 7, "Name": "alpha" },
                { "type": "EndMark", "endMarkCount": 1 }
            ]
        });
        fs::write(&structure, serde_json::to_string_pretty(&value).unwrap()).unwrap();
        (model_root, structure)
    }

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

    #[test]
    fn repack_auto_syncs_texture_containers_from_numatb_refs() {
        let tmp = tempfile::tempdir().unwrap();
        let (_model_root, structure) = write_sync_fixture(tmp.path(), "0xSYNC");
        let output_path = tmp.path().join("0xSYNC.fhm2d");

        let result = repack_unit_model_from_structure(
            structure.to_str().unwrap(),
            output_path.to_str().unwrap(),
            true,
            None,
        )
        .unwrap();

        assert_eq!(
            result.total_files, 9,
            "repack should include the texture injected from the live numatb refs"
        );
        assert!(output_path.is_file());
    }

    #[test]
    fn repack_auto_sync_uses_temp_structure_without_mutating_original_json() {
        let tmp = tempfile::tempdir().unwrap();
        let (_model_root, structure) = write_sync_fixture(tmp.path(), "0xSYNC");
        let before = fs::read_to_string(&structure).unwrap();
        let output_path = tmp.path().join("0xSYNC.fhm2d");

        let result = repack_unit_model_from_structure(
            structure.to_str().unwrap(),
            output_path.to_str().unwrap(),
            true,
            None,
        )
        .unwrap();

        assert!(result.total_files > 0);
        let after = fs::read_to_string(&structure).unwrap();
        assert_eq!(after, before, "repack should not rewrite the source structure");
    }

    #[test]
    fn repack_sync_still_runs_when_numatb_file_type_is_stale_but_url_is_correct() {
        let tmp = tempfile::tempdir().unwrap();
        let (_model_root, structure) = write_sync_fixture(tmp.path(), "0xSYNC");
        let mut value: Value = serde_json::from_str(&fs::read_to_string(&structure).unwrap()).unwrap();
        if let Some(entries) = value.get_mut("SubFileData").and_then(Value::as_array_mut) {
            for entry in entries.iter_mut() {
                let is_numatb = entry
                    .get("fileUrl")
                    .and_then(Value::as_str)
                    .is_some_and(|file_url| file_url.to_ascii_lowercase().ends_with(".numatb"));
                if is_numatb {
                    entry["fileType"] = Value::String(".bin".to_string());
                }
            }
        }
        fs::write(&structure, serde_json::to_string_pretty(&value).unwrap()).unwrap();
        let output_path = tmp.path().join("0xSYNC.fhm2d");

        let result = repack_unit_model_from_structure(
            structure.to_str().unwrap(),
            output_path.to_str().unwrap(),
            true,
            None,
        )
        .unwrap();

        assert_eq!(result.total_files, 9);
        assert!(output_path.is_file());
    }
}
