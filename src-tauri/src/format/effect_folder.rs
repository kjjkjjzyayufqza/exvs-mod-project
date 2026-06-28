//! EXVS2 effect-folder domain helpers.
//!
//! This module is intentionally UI-free. It reads and mutates an extracted
//! effect FHM2D folder plus its sibling `_structure.json`, and exposes small
//! command-friendly structs for Test Editor tooling.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::format::fhm2d::SubFileStructureEntry;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderSelection {
    pub kind: String,
    pub file_index: Option<i32>,
    pub hash_id: Option<i32>,
    pub name: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderHash {
    pub signed: i32,
    pub unsigned: u32,
    pub hex: String,
}

impl EffectFolderHash {
    fn from_i32(value: i32) -> Self {
        let unsigned = value as u32;
        Self {
            signed: value,
            unsigned,
            hex: format!("0x{unsigned:08X}"),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderFileItem {
    pub file_index: i32,
    pub file_type: String,
    pub actual_ext: String,
    pub file_url: String,
    pub file_base_name: String,
    pub name: String,
    pub path: String,
    pub hash: Option<EffectFolderHash>,
    pub unk2: Option<String>,
    pub missing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub efxbn: Option<EfxbnSummary>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderModel {
    pub name: String,
    pub hash: EffectFolderHash,
    pub entry_index: usize,
    pub folder_unk3: i32,
    pub files: Vec<EffectFolderFileItem>,
    pub missing_required_exts: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderInventorySummary {
    pub total_files: usize,
    pub efxbn_count: usize,
    pub model_count: usize,
    pub texture_count: usize,
    pub unresolved_model_ids: Vec<EffectFolderHash>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderInventory {
    pub effect_root: String,
    pub structure_json_path: String,
    pub summary: EffectFolderInventorySummary,
    pub efxbns: Vec<EffectFolderFileItem>,
    pub models: Vec<EffectFolderModel>,
    pub textures: Vec<EffectFolderFileItem>,
    pub other_files: Vec<EffectFolderFileItem>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnIdPair {
    pub flag: i32,
    pub id: i32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnEffectSummary {
    pub index: usize,
    pub model_id: i32,
    pub model_hash: EffectFolderHash,
    pub id_table: Vec<EfxbnIdPair>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EfxbnSummary {
    pub path: String,
    pub magic: String,
    pub version_or_flags: u32,
    pub file_size: u32,
    pub actual_size: usize,
    pub effect_count: u32,
    pub control_config_region_param: u32,
    pub control_block_size: Option<u32>,
    pub model_control_config_count: u32,
    pub model_control_region_offset: u32,
    pub model_control_region_size: u32,
    pub trailing_offset: u32,
    pub unknown18: u32,
    pub unknown1c: u32,
    pub model_ids: Vec<EffectFolderHash>,
    pub effects: Vec<EfxbnEffectSummary>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderValidationError {
    pub phase: String,
    pub item: Option<String>,
    pub message: String,
    pub path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderValidationSummary {
    pub total_files: usize,
    pub efxbn_count: usize,
    pub model_count: usize,
    pub texture_count: usize,
    pub unresolved_model_id_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderValidationResult {
    pub valid: bool,
    pub effect_root: String,
    pub structure_json_path: String,
    pub summary: EffectFolderValidationSummary,
    pub errors: Vec<EffectFolderValidationError>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderMutationResult {
    pub effect_root: String,
    pub structure_json_path: String,
    pub total_files: usize,
    pub added_files: Vec<String>,
    pub removed_files: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectFolderCopyResult {
    pub source_effect_root: String,
    pub destination_effect_root: String,
    pub destination_structure_json_path: String,
    pub total_files: usize,
    pub copied_files: Vec<String>,
    pub skipped: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug)]
struct StructureFile {
    value: Value,
    sub_file_data: Vec<Value>,
    sub_file_structure: Vec<SubFileStructureEntry>,
}

#[derive(Clone, Debug)]
enum Node {
    Folder {
        entry_index: usize,
        entry: SubFileStructureEntry,
        children: Vec<Node>,
    },
    Item {
        entry_index: usize,
        entry: SubFileStructureEntry,
        file_index: i32,
    },
}

#[derive(Clone, Debug)]
struct FileRecord {
    file_index: i32,
    file_type: String,
    actual_ext: String,
    file_url: String,
    file_base_name: String,
    path: PathBuf,
}

pub fn inspect_effect_folder(
    effect_root: &str,
    structure_json_path: Option<&str>,
) -> Result<EffectFolderInventory, String> {
    let root_path = validate_dir(effect_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let structure = read_structure_file(&structure_path)?;
    let data_by_index = build_file_record_map(&structure.sub_file_data, &json_dir)?;
    let forest = parse_forest(&structure.sub_file_structure)?;
    let mut warnings = Vec::new();

    let mut efxbns = Vec::new();
    let mut textures = Vec::new();
    let mut others = Vec::new();
    let mut models = Vec::new();
    collect_models(&forest, &data_by_index, &mut models);
    let model_hashes: HashSet<i32> = models.iter().map(|m| m.hash.signed).collect();

    for item in collect_items(&forest) {
        let Some(file_index) = item.file_index() else {
            continue;
        };
        let Some(record) = data_by_index.get(&file_index) else {
            warnings.push(format!(
                "SubFileStructure item references missing fileIndex {}.",
                file_index
            ));
            continue;
        };
        let mut file_item = file_item_from_node(record, item.item_entry());
        match record.actual_ext.as_str() {
            ".efxbn" => {
                match parse_efxbn_file(record.path.to_string_lossy().as_ref()) {
                    Ok(summary) => file_item.efxbn = Some(summary),
                    Err(error) => warnings.push(format!(
                        "Failed to parse efxbn fileIndex {} ({}): {error}",
                        record.file_index, record.file_url
                    )),
                }
                efxbns.push(file_item);
            }
            ".nutexb" => textures.push(file_item),
            _ if !is_inside_model(&models, record.file_index) => others.push(file_item),
            _ => {}
        }
    }

    let mut unresolved = BTreeSet::new();
    for item in &efxbns {
        if let Some(summary) = &item.efxbn {
            for hash in &summary.model_ids {
                if hash.signed != 0 && !model_hashes.contains(&hash.signed) {
                    unresolved.insert(hash.signed);
                }
            }
        }
    }
    let unresolved_model_ids = unresolved
        .into_iter()
        .map(EffectFolderHash::from_i32)
        .collect::<Vec<_>>();

    Ok(EffectFolderInventory {
        effect_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        summary: EffectFolderInventorySummary {
            total_files: structure.sub_file_data.len(),
            efxbn_count: efxbns.len(),
            model_count: models.len(),
            texture_count: textures.len(),
            unresolved_model_ids: unresolved_model_ids.clone(),
        },
        efxbns,
        models,
        textures,
        other_files: others,
        warnings,
    })
}

pub fn parse_efxbn_file(path: &str) -> Result<EfxbnSummary, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read efxbn {path}: {e}"))?;
    parse_efxbn_bytes(&bytes, path)
}

pub fn validate_effect_folder_for_repack(
    effect_root: &str,
    structure_json_path: Option<&str>,
) -> EffectFolderValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let root_path = PathBuf::from(effect_root);
    let structure_path =
        resolve_structure_path(&root_path, structure_json_path).unwrap_or_else(|_| {
            root_path
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join("_structure.json")
        });

    if !root_path.is_dir() {
        push_error(
            &mut errors,
            "input",
            None,
            format!("Effect root is not a directory: {}", root_path.display()),
            Some(&root_path),
        );
        return validation_result(effect_root, &structure_path, errors, warnings, None);
    }

    let structure = match read_structure_file(&structure_path) {
        Ok(value) => value,
        Err(error) => {
            push_error(&mut errors, "structure", None, error, Some(&structure_path));
            return validation_result(effect_root, &structure_path, errors, warnings, None);
        }
    };
    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));

    if let Some(expected) = structure
        .value
        .get("Fhm2dTotalCount")
        .and_then(Value::as_u64)
        .map(|v| v as usize)
    {
        if expected != structure.sub_file_data.len() {
            push_error(
                &mut errors,
                "structure",
                None,
                format!(
                    "Fhm2dTotalCount is {expected}, but SubFileData has {} entries.",
                    structure.sub_file_data.len()
                ),
                Some(&structure_path),
            );
        }
    }

    let data_by_index = match build_file_record_map(&structure.sub_file_data, json_dir) {
        Ok(map) => map,
        Err(error) => {
            push_error(&mut errors, "structure", None, error, Some(&structure_path));
            HashMap::new()
        }
    };

    let forest = match parse_forest(&structure.sub_file_structure) {
        Ok(nodes) => nodes,
        Err(error) => {
            push_error(&mut errors, "structure", None, error, Some(&structure_path));
            Vec::new()
        }
    };

    for record in data_by_index.values() {
        if !record.path.is_file() {
            push_error(
                &mut errors,
                "files",
                Some(&record.file_url),
                format!("Missing file: {}", record.file_url),
                Some(&record.path),
            );
        } else if is_nonempty_required_model_ext(&record.actual_ext) {
            match fs::metadata(&record.path) {
                Ok(meta) if meta.len() == 0 => push_error(
                    &mut errors,
                    "models",
                    Some(&record.file_url),
                    "Required model file is empty placeholder.",
                    Some(&record.path),
                ),
                Ok(_) => {}
                Err(error) => push_error(
                    &mut errors,
                    "files",
                    Some(&record.file_url),
                    format!("Failed to stat file: {error}"),
                    Some(&record.path),
                ),
            }
        }
    }

    let mut models = Vec::new();
    collect_models(&forest, &data_by_index, &mut models);
    for model in &models {
        if !model.missing_required_exts.is_empty() {
            push_error(
                &mut errors,
                "models",
                Some(&model.name),
                format!(
                    "Model folder is missing required file type(s): {}.",
                    model.missing_required_exts.join(", ")
                ),
                None::<&Path>,
            );
        }
    }

    let model_hashes: HashSet<i32> = models.iter().map(|m| m.hash.signed).collect();
    let mut efxbn_count = 0usize;
    let mut texture_count = 0usize;
    let mut unresolved = BTreeSet::new();
    let mut seen_hash_by_kind: HashSet<(String, i32)> = HashSet::new();
    for item in collect_items(&forest) {
        let Some(file_index) = item.file_index() else {
            continue;
        };
        let Some(record) = data_by_index.get(&file_index) else {
            push_error(
                &mut errors,
                "structure",
                None,
                format!(
                    "SubFileStructure item references missing fileIndex {}.",
                    file_index
                ),
                Some(&structure_path),
            );
            continue;
        };
        if record.actual_ext == ".efxbn" {
            efxbn_count += 1;
            if let Some(hash) = item.item_entry().and_then(item_hash) {
                if !seen_hash_by_kind.insert(("efxbn".into(), hash)) {
                    warnings.push(format!(
                        "Duplicate efxbn hash {}.",
                        EffectFolderHash::from_i32(hash).hex
                    ));
                }
            }
            match parse_efxbn_file(record.path.to_string_lossy().as_ref()) {
                Ok(summary) => {
                    for hash in summary.model_ids {
                        if hash.signed != 0 && !model_hashes.contains(&hash.signed) {
                            unresolved.insert(hash.signed);
                        }
                    }
                }
                Err(error) => push_error(
                    &mut errors,
                    "efxbn",
                    Some(&record.file_url),
                    error,
                    Some(&record.path),
                ),
            }
        } else if record.actual_ext == ".nutexb" {
            texture_count += 1;
            if let Some(hash) = item.item_entry().and_then(item_hash) {
                if !seen_hash_by_kind.insert(("nutexb".into(), hash)) {
                    warnings.push(format!(
                        "Duplicate texture hash {}.",
                        EffectFolderHash::from_i32(hash).hex
                    ));
                }
            }
        }
    }
    for hash in &unresolved {
        warnings.push(format!(
            "EFXBN references missing modelId {}.",
            EffectFolderHash::from_i32(*hash).hex
        ));
    }

    validation_result(
        effect_root,
        &structure_path,
        errors,
        warnings,
        Some(EffectFolderValidationSummary {
            total_files: structure.sub_file_data.len(),
            efxbn_count,
            model_count: models.len(),
            texture_count,
            unresolved_model_id_count: unresolved.len(),
        }),
    )
}

pub fn import_effect_file(
    effect_root: &str,
    structure_json_path: Option<&str>,
    source_path: Option<&str>,
    kind: &str,
    hash_id: i32,
    target_filename: Option<&str>,
) -> Result<EffectFolderMutationResult, String> {
    let root_path = validate_dir(effect_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));
    let mut structure = read_structure_file(&structure_path)?;
    let mut forest = parse_forest(&structure.sub_file_structure)?;
    let data_by_index = build_file_record_map(&structure.sub_file_data, json_dir)?;
    let ext = effect_file_kind_ext(kind)?;
    let unk2 = if ext == ".nutexb" {
        "01000000"
    } else {
        "00000000"
    };
    let source = source_path.map(PathBuf::from);
    if let Some(path) = &source {
        if !path.is_file() {
            return Err(format!("Source file does not exist: {}", path.display()));
        }
    }

    let base_name = target_filename
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            source.as_ref().and_then(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(str::to_string)
            })
        })
        .unwrap_or_else(|| format!("{}_{}", kind, EffectFolderHash::from_i32(hash_id).hex));
    let filename = ensure_extension(&base_name, ext);
    let target_dir = primary_file_dir(&root_path, &data_by_index);
    let target = unique_child_path(&target_dir, &filename);
    if let Some(path) = &source {
        copy_one_file(path, &target)?;
    } else {
        write_placeholder_file(&target, ext)?;
    }

    let file_index = next_file_index(&structure.sub_file_data);
    let file_url = file_url_for_target(json_dir, &target);
    let display_name = stem(&filename);
    structure.sub_file_data.push(json!({
        "index": structure.sub_file_data.len(),
        "fileType": ext,
        "fileIndex": file_index,
        "fileUrl": file_url,
        "fileBaseName": display_name,
    }));
    append_to_primary_container(
        &mut forest,
        &data_by_index,
        Node::Item {
            entry_index: 0,
            entry: make_item(file_index, unk2, hash_id, &display_name),
            file_index,
        },
    );
    write_structure_file(&structure_path, &mut structure, &forest)?;

    Ok(EffectFolderMutationResult {
        effect_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        total_files: structure.sub_file_data.len(),
        added_files: vec![target.to_string_lossy().to_string()],
        removed_files: vec![],
        warnings: vec![],
    })
}

pub fn import_effect_model_folder(
    effect_root: &str,
    structure_json_path: Option<&str>,
    source_dir: Option<&str>,
    model_hash_id: i32,
    target_folder_name: Option<&str>,
) -> Result<EffectFolderMutationResult, String> {
    let root_path = validate_dir(effect_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));
    let mut structure = read_structure_file(&structure_path)?;
    let mut forest = parse_forest(&structure.sub_file_structure)?;
    let data_by_index = build_file_record_map(&structure.sub_file_data, json_dir)?;
    let base_folder_name = target_folder_name
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            source_dir.and_then(|dir| {
                Path::new(dir)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(str::to_string)
            })
        })
        .unwrap_or_else(|| EffectFolderHash::from_i32(model_hash_id).hex);
    let model_dir = unique_child_path(
        &primary_file_dir(&root_path, &data_by_index),
        &base_folder_name,
    );
    let source_files = if let Some(dir) = source_dir {
        scan_source_model_files(Path::new(dir))?
    } else {
        Vec::new()
    };
    let model_name =
        model_name_from_files(&source_files).unwrap_or_else(|| sanitize_stem(&base_folder_name));
    let files_to_create = if source_files.is_empty() {
        vec![
            (None, format!("{model_name}.nusktb"), ".nusktb".to_string()),
            (None, format!("{model_name}.numshb"), ".numshb".to_string()),
            (None, format!("{model_name}.numdlb"), ".numdlb".to_string()),
            (None, format!("{model_name}.jnttbl"), ".jnttbl".to_string()),
        ]
    } else {
        source_files
            .iter()
            .map(|path| {
                let filename = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("file.bin")
                    .to_string();
                let ext = extension_from_name(&filename);
                (Some(path.clone()), filename, ext)
            })
            .collect()
    };
    validate_model_ext_set(&files_to_create)?;

    fs::create_dir_all(&model_dir)
        .map_err(|e| format!("Failed to create model dir {}: {e}", model_dir.display()))?;
    let mut children = Vec::new();
    let mut added = Vec::new();
    for (source, filename, ext) in files_to_create {
        let target = model_dir.join(&filename);
        if let Some(source_path) = source {
            copy_one_file(&source_path, &target)?;
        } else {
            fs::write(&target, [])
                .map_err(|e| format!("Failed to create placeholder {}: {e}", target.display()))?;
        }
        added.push(target.to_string_lossy().to_string());
        let file_index = next_file_index(&structure.sub_file_data);
        let file_type = file_type_for_ext(&ext);
        let file_url = file_url_for_target(json_dir, &target);
        let display_name = stem(&filename);
        structure.sub_file_data.push(json!({
            "index": structure.sub_file_data.len(),
            "fileType": file_type,
            "fileIndex": file_index,
            "fileUrl": file_url,
            "fileBaseName": display_name,
        }));
        children.push(Node::Item {
            entry_index: 0,
            entry: make_item(
                file_index,
                item_unk2_for_ext(&ext),
                item_unk3_for_ext(&ext),
                &display_name,
            ),
            file_index,
        });
    }
    append_to_primary_container(
        &mut forest,
        &data_by_index,
        Node::Folder {
            entry_index: 0,
            entry: make_folder(2, model_hash_id),
            children,
        },
    );
    write_structure_file(&structure_path, &mut structure, &forest)?;

    Ok(EffectFolderMutationResult {
        effect_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        total_files: structure.sub_file_data.len(),
        added_files: added,
        removed_files: vec![],
        warnings: vec![],
    })
}

pub fn delete_effect_folder_entries(
    effect_root: &str,
    structure_json_path: Option<&str>,
    selections: &[EffectFolderSelection],
    delete_files: bool,
) -> Result<EffectFolderMutationResult, String> {
    let root_path = validate_dir(effect_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));
    let mut structure = read_structure_file(&structure_path)?;
    let mut forest = parse_forest(&structure.sub_file_structure)?;
    let data_by_index = build_file_record_map(&structure.sub_file_data, json_dir)?;
    let mut removed_indices = HashSet::new();
    remove_matching_nodes(
        &mut forest,
        selections,
        &data_by_index,
        &mut removed_indices,
    );
    if removed_indices.is_empty() {
        return Err("No matching effect-folder entries were found.".to_string());
    }

    let mut removed_files = Vec::new();
    let mut next_data = Vec::new();
    for entry in &structure.sub_file_data {
        let file_index = value_file_index(entry);
        if file_index.is_some_and(|idx| removed_indices.contains(&idx)) {
            if let Some(url) = entry.get("fileUrl").and_then(Value::as_str) {
                removed_files.push(url.to_string());
                if delete_files {
                    let path = resolve_file_path(json_dir, url);
                    delete_file_if_under(&root_path, &path);
                }
            }
        } else {
            next_data.push(entry.clone());
        }
    }
    structure.sub_file_data = next_data;
    reindex_sub_file_data(&mut structure.sub_file_data);
    write_structure_file(&structure_path, &mut structure, &forest)?;

    Ok(EffectFolderMutationResult {
        effect_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        total_files: structure.sub_file_data.len(),
        added_files: vec![],
        removed_files,
        warnings: vec![],
    })
}

pub fn copy_effect_folder_selection(
    source_effect_root: &str,
    source_structure_json_path: Option<&str>,
    destination_effect_root: &str,
    destination_structure_json_path: Option<&str>,
    selections: &[EffectFolderSelection],
) -> Result<EffectFolderCopyResult, String> {
    let source_root = validate_dir(source_effect_root)?;
    let source_structure_path = resolve_structure_path(&source_root, source_structure_json_path)?;
    let source_json_dir = source_structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."));
    let source_structure = read_structure_file(&source_structure_path)?;
    let source_data = build_file_record_map(&source_structure.sub_file_data, source_json_dir)?;
    let source_forest = parse_forest(&source_structure.sub_file_structure)?;

    let dest_root = validate_dir(destination_effect_root)?;
    let dest_structure_path = resolve_structure_path(&dest_root, destination_structure_json_path)?;
    let dest_json_dir = dest_structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."));
    let mut dest_structure = read_structure_file(&dest_structure_path)?;
    let mut dest_forest = parse_forest(&dest_structure.sub_file_structure)?;
    let mut dest_data = build_file_record_map(&dest_structure.sub_file_data, dest_json_dir)?;
    let mut copied = Vec::new();
    let mut skipped = Vec::new();
    let mut warnings = Vec::new();
    let mut copied_keys = HashSet::new();

    let closure = build_copy_closure(&source_forest, &source_data, selections, &mut warnings);
    for texture in closure.texture_items {
        append_source_item_to_destination(
            &source_root,
            &dest_root,
            dest_json_dir,
            &mut dest_structure,
            &mut dest_forest,
            &mut dest_data,
            &texture,
            &mut copied,
            &mut skipped,
            &mut copied_keys,
        )?;
    }
    for model in closure.model_nodes {
        append_source_model_to_destination(
            &source_root,
            &dest_root,
            dest_json_dir,
            &mut dest_structure,
            &mut dest_forest,
            &mut dest_data,
            &model,
            &mut copied,
            &mut skipped,
            &mut copied_keys,
        )?;
    }
    for efxbn in closure.efxbn_items {
        append_source_item_to_destination(
            &source_root,
            &dest_root,
            dest_json_dir,
            &mut dest_structure,
            &mut dest_forest,
            &mut dest_data,
            &efxbn,
            &mut copied,
            &mut skipped,
            &mut copied_keys,
        )?;
    }

    write_structure_file(&dest_structure_path, &mut dest_structure, &dest_forest)?;
    Ok(EffectFolderCopyResult {
        source_effect_root: source_root.to_string_lossy().to_string(),
        destination_effect_root: dest_root.to_string_lossy().to_string(),
        destination_structure_json_path: dest_structure_path.to_string_lossy().to_string(),
        total_files: dest_structure.sub_file_data.len(),
        copied_files: copied,
        skipped,
        warnings,
    })
}

pub fn repack_effect_folder_from_structure(
    structure_json_path: &str,
    output_path: &str,
    atomic_write: bool,
    progress_callback: Option<&dyn Fn(crate::format::fhm2d_pack::RepackProgress)>,
) -> Result<crate::format::fhm2d_pack::RepackResult, String> {
    let structure = PathBuf::from(structure_json_path);
    let effect_root = infer_root_from_structure_path(&structure)?;
    let validation = validate_effect_folder_for_repack(
        &effect_root.to_string_lossy(),
        Some(structure_json_path),
    );
    if !validation.valid {
        let messages = validation
            .errors
            .iter()
            .map(|e| e.message.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!("Effect folder validation failed: {messages}"));
    }
    crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        structure_json_path,
        output_path,
        atomic_write,
        progress_callback,
    )
}

#[derive(Default)]
struct CopyClosure {
    efxbn_items: Vec<Node>,
    model_nodes: Vec<Node>,
    texture_items: Vec<Node>,
}

fn build_copy_closure(
    forest: &[Node],
    data_by_index: &HashMap<i32, FileRecord>,
    selections: &[EffectFolderSelection],
    warnings: &mut Vec<String>,
) -> CopyClosure {
    let mut closure = CopyClosure::default();
    let all_items = collect_items(forest);
    let all_models = collect_model_nodes(forest, data_by_index);
    let mut wanted_model_hashes = BTreeSet::new();
    let mut wanted_texture_hashes = BTreeSet::new();

    for item in &all_items {
        let Some(file_index) = item.file_index() else {
            continue;
        };
        let Some(record) = data_by_index.get(&file_index) else {
            continue;
        };
        if selections
            .iter()
            .any(|selection| selection_matches_item(selection, item, record))
        {
            match record.actual_ext.as_str() {
                ".efxbn" => {
                    closure.efxbn_items.push((*item).clone());
                    if let Some(hash) = item.item_entry().and_then(item_hash) {
                        wanted_texture_hashes.insert(hash);
                    }
                    match parse_efxbn_file(record.path.to_string_lossy().as_ref()) {
                        Ok(summary) => {
                            for hash in summary.model_ids {
                                if hash.signed != 0 {
                                    wanted_model_hashes.insert(hash.signed);
                                    wanted_texture_hashes.insert(hash.signed);
                                }
                            }
                        }
                        Err(error) => warnings.push(format!(
                            "Failed to parse selected efxbn {}: {error}",
                            record.file_url
                        )),
                    }
                }
                ".nutexb" => closure.texture_items.push((*item).clone()),
                _ => {}
            }
        }
    }

    for model in &all_models {
        let model_hash = folder_hash(model);
        if selections
            .iter()
            .any(|selection| selection_matches_model(selection, model, data_by_index))
            || model_hash.is_some_and(|hash| wanted_model_hashes.contains(&hash))
        {
            closure.model_nodes.push((*model).clone());
        }
    }

    let copied_model_hashes: HashSet<i32> =
        closure.model_nodes.iter().filter_map(folder_hash).collect();
    for hash in wanted_model_hashes {
        if !copied_model_hashes.contains(&hash) {
            warnings.push(format!(
                "Selected efxbn references missing modelId {}.",
                EffectFolderHash::from_i32(hash).hex
            ));
        }
    }

    for item in &all_items {
        let Some(file_index) = item.file_index() else {
            continue;
        };
        let Some(record) = data_by_index.get(&file_index) else {
            continue;
        };
        if record.actual_ext == ".nutexb"
            && item
                .item_entry()
                .and_then(item_hash)
                .is_some_and(|hash| wanted_texture_hashes.contains(&hash))
            && !closure
                .texture_items
                .iter()
                .any(|existing| existing.file_index() == Some(file_index))
        {
            closure.texture_items.push((*item).clone());
        }
    }
    closure
}

fn append_source_item_to_destination(
    source_root: &Path,
    dest_root: &Path,
    dest_json_dir: &Path,
    dest_structure: &mut StructureFile,
    dest_forest: &mut Vec<Node>,
    dest_data: &mut HashMap<i32, FileRecord>,
    source_item: &Node,
    copied: &mut Vec<String>,
    skipped: &mut Vec<String>,
    copied_keys: &mut HashSet<String>,
) -> Result<(), String> {
    let Node::Item {
        entry, file_index, ..
    } = source_item
    else {
        return Ok(());
    };
    let source_map = build_file_record_map_for_node(source_root, source_item)?;
    let Some(source_record) = source_map.get(file_index) else {
        return Ok(());
    };
    let hash = item_hash(entry).unwrap_or(0);
    let key = format!("{}:{hash}", source_record.actual_ext);
    if !copied_keys.insert(key.clone()) {
        return Ok(());
    }
    if destination_has_item_hash(dest_forest, dest_data, &source_record.actual_ext, hash) {
        skipped.push(format!(
            "Destination already has {} hash {}.",
            source_record.actual_ext,
            EffectFolderHash::from_i32(hash).hex
        ));
        return Ok(());
    }

    let target_dir = primary_file_dir(dest_root, dest_data);
    let filename = source_record
        .path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("effect_file.bin");
    let target = unique_child_path(&target_dir, filename);
    copy_one_file(&source_record.path, &target)?;
    let new_file_index = next_file_index(&dest_structure.sub_file_data);
    let file_url = file_url_for_target(dest_json_dir, &target);
    let display_name = source_record.file_base_name.clone();
    dest_structure.sub_file_data.push(json!({
        "index": dest_structure.sub_file_data.len(),
        "fileType": source_record.file_type,
        "fileIndex": new_file_index,
        "fileUrl": file_url,
        "fileBaseName": display_name,
    }));
    let mut new_entry = entry.clone();
    if let SubFileStructureEntry::Item {
        file_index,
        original_file_index,
        ..
    } = &mut new_entry
    {
        *file_index = new_file_index;
        *original_file_index = new_file_index;
    }
    let node = Node::Item {
        entry_index: 0,
        entry: new_entry,
        file_index: new_file_index,
    };
    append_to_primary_container(dest_forest, dest_data, node);
    let record =
        file_record_from_value(dest_structure.sub_file_data.last().unwrap(), dest_json_dir)?;
    dest_data.insert(new_file_index, record);
    copied.push(target.to_string_lossy().to_string());
    Ok(())
}

fn append_source_model_to_destination(
    source_root: &Path,
    dest_root: &Path,
    dest_json_dir: &Path,
    dest_structure: &mut StructureFile,
    dest_forest: &mut Vec<Node>,
    dest_data: &mut HashMap<i32, FileRecord>,
    source_model: &Node,
    copied: &mut Vec<String>,
    skipped: &mut Vec<String>,
    copied_keys: &mut HashSet<String>,
) -> Result<(), String> {
    let Some(model_hash) = folder_hash(source_model) else {
        return Ok(());
    };
    let key = format!("model:{model_hash}");
    if !copied_keys.insert(key) {
        return Ok(());
    }
    if destination_has_model_hash(dest_forest, model_hash) {
        skipped.push(format!(
            "Destination already has model hash {}.",
            EffectFolderHash::from_i32(model_hash).hex
        ));
        return Ok(());
    }
    let source_map = build_file_record_map_for_node(source_root, source_model)?;
    let source_items = collect_items(std::slice::from_ref(source_model));
    let first_record = source_items
        .iter()
        .find_map(|item| item.file_index().and_then(|idx| source_map.get(&idx)))
        .ok_or_else(|| "Source model has no copyable files.".to_string())?;
    let source_model_dir = first_record.path.parent().ok_or_else(|| {
        format!(
            "Cannot infer model dir from {}",
            first_record.path.display()
        )
    })?;
    let folder_name = source_model_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("model");
    let dest_model_dir = unique_child_path(&primary_file_dir(dest_root, dest_data), folder_name);
    fs::create_dir_all(&dest_model_dir).map_err(|e| {
        format!(
            "Failed to create model dir {}: {e}",
            dest_model_dir.display()
        )
    })?;

    let mut file_index_map = HashMap::new();
    for item in &source_items {
        let Some(old_file_index) = item.file_index() else {
            continue;
        };
        let Some(record) = source_map.get(&old_file_index) else {
            continue;
        };
        let filename = record
            .path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("model_file.bin");
        let target = unique_child_path(&dest_model_dir, filename);
        copy_one_file(&record.path, &target)?;
        let new_file_index = next_file_index(&dest_structure.sub_file_data);
        let file_url = file_url_for_target(dest_json_dir, &target);
        dest_structure.sub_file_data.push(json!({
            "index": dest_structure.sub_file_data.len(),
            "fileType": record.file_type,
            "fileIndex": new_file_index,
            "fileUrl": file_url,
            "fileBaseName": record.file_base_name,
        }));
        let new_record =
            file_record_from_value(dest_structure.sub_file_data.last().unwrap(), dest_json_dir)?;
        dest_data.insert(new_file_index, new_record);
        file_index_map.insert(old_file_index, new_file_index);
        copied.push(target.to_string_lossy().to_string());
    }
    let cloned = remap_node_file_indices(source_model, &file_index_map);
    append_to_primary_container(dest_forest, dest_data, cloned);
    Ok(())
}

fn build_file_record_map_for_node(
    root: &Path,
    node: &Node,
) -> Result<HashMap<i32, FileRecord>, String> {
    let structure = resolve_structure_path(root, None)?;
    let json_dir = structure.parent().unwrap_or_else(|| Path::new("."));
    let loaded = read_structure_file(&structure)?;
    let map = build_file_record_map(&loaded.sub_file_data, json_dir)?;
    let needed: HashSet<i32> = collect_items(std::slice::from_ref(node))
        .into_iter()
        .filter_map(Node::file_index)
        .collect();
    Ok(map
        .into_iter()
        .filter(|(idx, _)| needed.contains(idx))
        .collect())
}

fn remap_node_file_indices(node: &Node, map: &HashMap<i32, i32>) -> Node {
    match node {
        Node::Item {
            entry_index,
            entry,
            file_index,
        } => {
            let new_index = map.get(file_index).copied().unwrap_or(*file_index);
            let mut new_entry = entry.clone();
            if let SubFileStructureEntry::Item {
                file_index,
                original_file_index,
                ..
            } = &mut new_entry
            {
                *file_index = new_index;
                *original_file_index = new_index;
            }
            Node::Item {
                entry_index: *entry_index,
                entry: new_entry,
                file_index: new_index,
            }
        }
        Node::Folder {
            entry_index,
            entry,
            children,
        } => Node::Folder {
            entry_index: *entry_index,
            entry: entry.clone(),
            children: children
                .iter()
                .map(|child| remap_node_file_indices(child, map))
                .collect(),
        },
    }
}

fn validate_dir(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("effect_root cannot be empty.".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_dir() {
        return Err(format!("Effect folder does not exist: {}", path.display()));
    }
    Ok(path)
}

fn resolve_structure_path(root: &Path, explicit: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    let parent = root.parent().ok_or_else(|| {
        format!(
            "Cannot resolve sibling structure JSON for {}",
            root.display()
        )
    })?;
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid effect root name: {}", root.display()))?;
    Ok(parent.join(format!("{name}_structure.json")))
}

fn infer_root_from_structure_path(structure_path: &Path) -> Result<PathBuf, String> {
    let parent = structure_path.parent().ok_or_else(|| {
        format!(
            "Cannot infer effect root from structure JSON {}",
            structure_path.display()
        )
    })?;
    let stem = structure_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Invalid structure JSON path: {}", structure_path.display()))?
        .trim_end_matches("_structure.json")
        .trim_end_matches(".json")
        .to_string();
    Ok(parent.join(stem))
}

fn read_structure_file(path: &Path) -> Result<StructureFile, String> {
    if !path.is_file() {
        return Err(format!("Missing structure JSON: {}", path.display()));
    }
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read structure JSON {}: {e}", path.display()))?;
    let value: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse structure JSON {}: {e}", path.display()))?;
    let sub_file_data = value
        .get("SubFileData")
        .and_then(Value::as_array)
        .ok_or_else(|| "Structure JSON missing SubFileData array".to_string())?
        .clone();
    let sub_file_structure: Vec<SubFileStructureEntry> = serde_json::from_value(
        value
            .get("SubFileStructure")
            .cloned()
            .ok_or_else(|| "Structure JSON missing SubFileStructure".to_string())?,
    )
    .map_err(|e| format!("Failed to parse SubFileStructure: {e}"))?;
    Ok(StructureFile {
        value,
        sub_file_data,
        sub_file_structure,
    })
}

fn write_structure_file(
    path: &Path,
    structure: &mut StructureFile,
    forest: &[Node],
) -> Result<(), String> {
    let mut flat = Vec::new();
    for node in forest {
        serialize_node(node, &mut flat);
    }
    reindex_sub_file_data(&mut structure.sub_file_data);
    let obj = structure
        .value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object".to_string())?;
    obj.insert(
        "Fhm2dTotalCount".to_string(),
        json!(structure.sub_file_data.len()),
    );
    obj.insert(
        "SubFileData".to_string(),
        Value::Array(structure.sub_file_data.clone()),
    );
    obj.insert(
        "SubFileStructure".to_string(),
        serde_json::to_value(&flat)
            .map_err(|e| format!("Failed to serialize SubFileStructure: {e}"))?,
    );
    let serialized = serde_json::to_string_pretty(&structure.value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    atomic_write_text(path, &format!("{serialized}\n"))
}

fn atomic_write_text(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Structure JSON has no parent: {}", path.display()))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("structure.json");
    let temp_path = parent.join(format!(".{file_name}.effect-folder.tmp"));
    fs::write(&temp_path, contents).map_err(|e| {
        format!(
            "Failed to write temp structure JSON {}: {e}",
            temp_path.display()
        )
    })?;
    if !path.exists() {
        return fs::rename(&temp_path, path)
            .map_err(|e| format!("Failed to replace structure JSON {}: {e}", path.display()));
    }

    let backup_path = parent.join(format!(".{file_name}.effect-folder-backup"));
    if backup_path.exists() {
        fs::remove_file(&backup_path)
            .map_err(|e| format!("Failed to remove stale structure backup: {e}"))?;
    }
    fs::rename(path, &backup_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to prepare structure JSON replacement: {e}")
    })?;
    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::rename(&backup_path, path);
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed to replace structure JSON: {error}"));
    }
    let _ = fs::remove_file(&backup_path);
    Ok(())
}

fn parse_forest(entries: &[SubFileStructureEntry]) -> Result<Vec<Node>, String> {
    let entries = expand_endmarks(entries);
    let mut cursor = 0usize;
    let mut out = Vec::new();
    while cursor < entries.len() {
        if matches!(entries[cursor], SubFileStructureEntry::EndMark { .. }) {
            cursor += 1;
            continue;
        }
        out.push(parse_node(&entries, &mut cursor)?);
    }
    Ok(out)
}

fn expand_endmarks(entries: &[SubFileStructureEntry]) -> Vec<SubFileStructureEntry> {
    let mut out = Vec::new();
    for entry in entries {
        match entry {
            SubFileStructureEntry::EndMark { end_mark_count } => {
                for _ in 0..(*end_mark_count).max(1) {
                    out.push(SubFileStructureEntry::EndMark { end_mark_count: 1 });
                }
            }
            other => out.push(other.clone()),
        }
    }
    out
}

fn parse_node(entries: &[SubFileStructureEntry], cursor: &mut usize) -> Result<Node, String> {
    let entry_index = *cursor;
    match entries
        .get(*cursor)
        .ok_or_else(|| "SubFileStructure cursor out of range.".to_string())?
        .clone()
    {
        SubFileStructureEntry::Folder { folder_count, .. } => {
            let entry = entries[entry_index].clone();
            *cursor += 1;
            let mut children = Vec::new();
            for _ in 0..folder_count.max(0) {
                if *cursor >= entries.len() {
                    return Err(format!(
                        "Folder entry {entry_index} ended before folderCount children."
                    ));
                }
                if matches!(entries[*cursor], SubFileStructureEntry::EndMark { .. }) {
                    return Err(format!(
                        "Folder entry {entry_index} hit EndMark before folderCount children."
                    ));
                }
                children.push(parse_node(entries, cursor)?);
            }
            if matches!(
                entries.get(*cursor),
                Some(SubFileStructureEntry::EndMark { .. })
            ) {
                *cursor += 1;
            } else {
                return Err(format!("Folder entry {entry_index} is missing EndMark."));
            }
            Ok(Node::Folder {
                entry_index,
                entry,
                children,
            })
        }
        SubFileStructureEntry::Item { file_index, .. } => {
            let entry = entries[entry_index].clone();
            *cursor += 1;
            Ok(Node::Item {
                entry_index,
                entry,
                file_index,
            })
        }
        SubFileStructureEntry::EndMark { .. } => {
            Err(format!("Unexpected EndMark at entry {entry_index}."))
        }
    }
}

fn serialize_node(node: &Node, out: &mut Vec<SubFileStructureEntry>) {
    match node {
        Node::Item { entry, .. } => out.push(entry.clone()),
        Node::Folder {
            entry, children, ..
        } => {
            let mut folder = entry.clone();
            if let SubFileStructureEntry::Folder { folder_count, .. } = &mut folder {
                *folder_count = children.len() as i32;
            }
            out.push(folder);
            for child in children {
                serialize_node(child, out);
            }
            out.push(SubFileStructureEntry::EndMark { end_mark_count: 1 });
        }
    }
}

fn build_file_record_map(
    entries: &[Value],
    json_dir: &Path,
) -> Result<HashMap<i32, FileRecord>, String> {
    let mut out = HashMap::new();
    for entry in entries {
        let record = file_record_from_value(entry, json_dir)?;
        if out.insert(record.file_index, record).is_some() {
            return Err("Duplicate SubFileData fileIndex found.".to_string());
        }
    }
    Ok(out)
}

fn file_record_from_value(entry: &Value, json_dir: &Path) -> Result<FileRecord, String> {
    let file_index = value_file_index(entry)
        .ok_or_else(|| "SubFileData entry missing fileIndex.".to_string())?;
    let file_type = entry
        .get("fileType")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    let file_url = entry
        .get("fileUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("SubFileData[{file_index}] missing fileUrl."))?
        .to_string();
    let file_base_name = entry
        .get("fileBaseName")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| stem(&file_basename(&file_url)));
    let actual_ext = actual_ext(&file_type, &file_url);
    Ok(FileRecord {
        file_index,
        file_type,
        actual_ext,
        path: resolve_file_path(json_dir, &file_url),
        file_url,
        file_base_name,
    })
}

fn value_file_index(entry: &Value) -> Option<i32> {
    entry
        .get("fileIndex")
        .and_then(Value::as_i64)
        .map(|v| v as i32)
}

fn collect_items(nodes: &[Node]) -> Vec<&Node> {
    let mut out = Vec::new();
    for node in nodes {
        collect_items_inner(node, &mut out);
    }
    out
}

fn collect_items_inner<'a>(node: &'a Node, out: &mut Vec<&'a Node>) {
    match node {
        Node::Item { .. } => out.push(node),
        Node::Folder { children, .. } => {
            for child in children {
                collect_items_inner(child, out);
            }
        }
    }
}

fn collect_model_nodes<'a>(
    nodes: &'a [Node],
    data_by_index: &HashMap<i32, FileRecord>,
) -> Vec<&'a Node> {
    let mut out = Vec::new();
    for node in nodes {
        collect_model_nodes_inner(node, data_by_index, &mut out);
    }
    out
}

fn collect_model_nodes_inner<'a>(
    node: &'a Node,
    data_by_index: &HashMap<i32, FileRecord>,
    out: &mut Vec<&'a Node>,
) {
    if is_model_group(node, data_by_index) {
        out.push(node);
        return;
    }
    if let Node::Folder { children, .. } = node {
        for child in children {
            collect_model_nodes_inner(child, data_by_index, out);
        }
    }
}

fn collect_models(
    nodes: &[Node],
    data_by_index: &HashMap<i32, FileRecord>,
    out: &mut Vec<EffectFolderModel>,
) {
    for node in nodes {
        if is_model_group(node, data_by_index) {
            out.push(model_from_node(node, data_by_index));
            continue;
        }
        if let Node::Folder { children, .. } = node {
            collect_models(children, data_by_index, out);
        }
    }
}

fn is_model_group(node: &Node, data_by_index: &HashMap<i32, FileRecord>) -> bool {
    let Node::Folder {
        entry, children, ..
    } = node
    else {
        return false;
    };
    if matches!(entry, SubFileStructureEntry::Folder { unk3: 2, .. }) {
        return true;
    }
    children.iter().any(|child| match child {
        Node::Item { file_index, .. } => data_by_index
            .get(file_index)
            .is_some_and(|record| record.actual_ext == ".numdlb"),
        Node::Folder { .. } => false,
    })
}

fn model_from_node(node: &Node, data_by_index: &HashMap<i32, FileRecord>) -> EffectFolderModel {
    let (entry_index, folder_unk3, hash) = match node {
        Node::Folder {
            entry_index,
            entry: SubFileStructureEntry::Folder { unk3, unk5, .. },
            ..
        } => (*entry_index, *unk3, *unk5),
        _ => (0, 0, 0),
    };
    let mut files = Vec::new();
    let mut exts = HashSet::new();
    for item in collect_items(std::slice::from_ref(node)) {
        if let Some(record) = item.file_index().and_then(|idx| data_by_index.get(&idx)) {
            exts.insert(record.actual_ext.clone());
            files.push(file_item_from_node(record, item.item_entry()));
        }
    }
    let missing_required_exts = [".nusktb", ".numshb", ".numdlb", ".jnttbl"]
        .into_iter()
        .filter(|ext| !exts.contains(*ext))
        .map(str::to_string)
        .collect::<Vec<_>>();
    let name = files
        .iter()
        .find(|file| file.actual_ext == ".numdlb")
        .map(|file| file.file_base_name.clone())
        .or_else(|| files.first().map(|file| file.file_base_name.clone()))
        .unwrap_or_else(|| EffectFolderHash::from_i32(hash).hex.clone());
    EffectFolderModel {
        name,
        hash: EffectFolderHash::from_i32(hash),
        entry_index,
        folder_unk3,
        files,
        missing_required_exts,
    }
}

fn file_item_from_node(
    record: &FileRecord,
    entry: Option<&SubFileStructureEntry>,
) -> EffectFolderFileItem {
    let (hash, unk2, name) = match entry {
        Some(SubFileStructureEntry::Item {
            unk2,
            unk3,
            display_name,
            ..
        }) => (
            Some(EffectFolderHash::from_i32(*unk3)),
            Some(unk2.clone()),
            display_name
                .clone()
                .unwrap_or_else(|| record.file_base_name.clone()),
        ),
        _ => (None, None, record.file_base_name.clone()),
    };
    EffectFolderFileItem {
        file_index: record.file_index,
        file_type: record.file_type.clone(),
        actual_ext: record.actual_ext.clone(),
        file_url: record.file_url.clone(),
        file_base_name: record.file_base_name.clone(),
        name,
        path: record.path.to_string_lossy().to_string(),
        hash,
        unk2,
        missing: !record.path.is_file(),
        efxbn: None,
    }
}

fn is_inside_model(models: &[EffectFolderModel], file_index: i32) -> bool {
    models
        .iter()
        .any(|model| model.files.iter().any(|file| file.file_index == file_index))
}

fn parse_efxbn_bytes(bytes: &[u8], path: &str) -> Result<EfxbnSummary, String> {
    if bytes.len() < 0x20 {
        return Err(format!("EFXBN file too small: {} bytes", bytes.len()));
    }
    if &bytes[0..4] != b"EFXB" {
        return Err("Invalid EFXBN magic; expected EFXB.".to_string());
    }
    let version_or_flags = read_u32_le(bytes, 0x04)?;
    let file_size = read_u32_le(bytes, 0x08)?;
    let effect_count = read_u32_le(bytes, 0x0c)?;
    let control_config_region_param = read_u32_le(bytes, 0x10)?;
    let model_control_config_count = read_u32_le(bytes, 0x14)?;
    let unknown18 = read_u32_le(bytes, 0x18)?;
    let unknown1c = read_u32_le(bytes, 0x1c)?;
    if file_size as usize != bytes.len() {
        return Err(format!(
            "EFXBN header fileSize is {file_size}, actual size is {}.",
            bytes.len()
        ));
    }
    let meta_size = effect_count as usize * 0x370;
    if bytes.len() < 0x20 + meta_size {
        return Err("EFXBN meta region extends past file size.".to_string());
    }
    let control_block_size = if effect_count == 0 {
        None
    } else {
        let total = control_config_region_param
            .checked_mul(8)
            .and_then(|v| v.checked_sub(8))
            .ok_or_else(|| "Invalid controlConfigRegionParam.".to_string())?;
        Some(total / effect_count)
    };
    let control_region_offset = 0x20 + meta_size;
    let model_control_region_offset =
        control_region_offset + control_block_size.unwrap_or(0) as usize * effect_count as usize;
    let model_control_region_size = model_control_config_count as usize * 0xb8;
    let trailing_offset = model_control_region_offset + model_control_region_size;
    if trailing_offset > bytes.len() {
        return Err("EFXBN model-control region extends past file size.".to_string());
    }

    let mut effects = Vec::new();
    let mut model_ids = BTreeSet::new();
    for i in 0..effect_count as usize {
        let base = 0x20 + i * 0x370;
        let model_id = read_i32_le(bytes, base + 0x138)?;
        model_ids.insert(model_id);
        let mut id_table = Vec::new();
        for slot in 0..16 {
            let off = base + 0x50 + slot * 8;
            id_table.push(EfxbnIdPair {
                flag: read_i32_le(bytes, off)?,
                id: read_i32_le(bytes, off + 4)?,
            });
        }
        effects.push(EfxbnEffectSummary {
            index: i,
            model_id,
            model_hash: EffectFolderHash::from_i32(model_id),
            id_table,
        });
    }

    Ok(EfxbnSummary {
        path: path.to_string(),
        magic: "EFXB".to_string(),
        version_or_flags,
        file_size,
        actual_size: bytes.len(),
        effect_count,
        control_config_region_param,
        control_block_size,
        model_control_config_count,
        model_control_region_offset: model_control_region_offset as u32,
        model_control_region_size: model_control_region_size as u32,
        trailing_offset: trailing_offset as u32,
        unknown18,
        unknown1c,
        model_ids: model_ids
            .into_iter()
            .map(EffectFolderHash::from_i32)
            .collect(),
        effects,
    })
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| format!("Read u32 out of range at 0x{offset:X}"))?;
    Ok(u32::from_le_bytes(
        slice.try_into().map_err(|_| "slice".to_string())?,
    ))
}

fn read_i32_le(bytes: &[u8], offset: usize) -> Result<i32, String> {
    Ok(read_u32_le(bytes, offset)? as i32)
}

fn validation_result(
    effect_root: &str,
    structure_path: &Path,
    errors: Vec<EffectFolderValidationError>,
    warnings: Vec<String>,
    summary: Option<EffectFolderValidationSummary>,
) -> EffectFolderValidationResult {
    let summary = summary.unwrap_or(EffectFolderValidationSummary {
        total_files: 0,
        efxbn_count: 0,
        model_count: 0,
        texture_count: 0,
        unresolved_model_id_count: 0,
    });
    EffectFolderValidationResult {
        valid: errors.is_empty(),
        effect_root: effect_root.to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        summary,
        errors,
        warnings,
    }
}

fn push_error(
    errors: &mut Vec<EffectFolderValidationError>,
    phase: &str,
    item: Option<&str>,
    message: impl Into<String>,
    path: Option<impl AsRef<Path>>,
) {
    errors.push(EffectFolderValidationError {
        phase: phase.to_string(),
        item: item.map(str::to_string),
        message: message.into(),
        path: path.map(|p| p.as_ref().to_string_lossy().to_string()),
    });
}

fn effect_file_kind_ext(kind: &str) -> Result<&'static str, String> {
    match kind.trim().to_ascii_lowercase().as_str() {
        "efxbn" | ".efxbn" => Ok(".efxbn"),
        "texture" | "nutexb" | ".nutexb" => Ok(".nutexb"),
        other => Err(format!("Unsupported effect file kind: {other}")),
    }
}

fn make_item(file_index: i32, unk2: &str, unk3: i32, name: &str) -> SubFileStructureEntry {
    SubFileStructureEntry::Item {
        unk1: "00000000".to_string(),
        file_index,
        unk2: unk2.to_string(),
        unk2_1: 0,
        unk3,
        unk4: 0,
        original_file_index: file_index,
        display_name: Some(name.to_string()),
    }
}

fn make_folder(unk3: i32, unk5: i32) -> SubFileStructureEntry {
    SubFileStructureEntry::Folder {
        unk1: "00000000".to_string(),
        folder_count: 0,
        unk2: "00000000".to_string(),
        unk2_1: 0,
        unk3,
        unk4: 0,
        unk5,
        unk6: 0,
    }
}

fn append_to_primary_container(
    forest: &mut Vec<Node>,
    data_by_index: &HashMap<i32, FileRecord>,
    node: Node,
) {
    if let Some(container) = find_primary_container_mut(forest, data_by_index) {
        container.push(node);
    } else {
        forest.push(node);
    }
}

fn find_primary_container_mut<'a>(
    nodes: &'a mut [Node],
    data_by_index: &HashMap<i32, FileRecord>,
) -> Option<&'a mut Vec<Node>> {
    for node in nodes {
        if let Node::Folder { children, .. } = node {
            if children.iter().any(|child| match child {
                Node::Item { file_index, .. } => {
                    data_by_index.get(file_index).is_some_and(|record| {
                        record.actual_ext == ".efxbn" || record.actual_ext == ".nutexb"
                    })
                }
                Node::Folder { .. } => is_model_group(child, data_by_index),
            }) {
                return Some(children);
            }
            if let Some(found) = find_primary_container_mut(children, data_by_index) {
                return Some(found);
            }
        }
    }
    None
}

fn primary_file_dir(root: &Path, data_by_index: &HashMap<i32, FileRecord>) -> PathBuf {
    let mut counts: HashMap<PathBuf, usize> = HashMap::new();
    for record in data_by_index.values() {
        if matches!(record.actual_ext.as_str(), ".efxbn" | ".nutexb") {
            if let Some(parent) = record.path.parent() {
                *counts.entry(parent.to_path_buf()).or_default() += 1;
            }
        }
    }
    counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(path, _)| path)
        .unwrap_or_else(|| root.to_path_buf())
}

fn remove_matching_nodes(
    nodes: &mut Vec<Node>,
    selections: &[EffectFolderSelection],
    data_by_index: &HashMap<i32, FileRecord>,
    removed_indices: &mut HashSet<i32>,
) {
    let old = std::mem::take(nodes);
    for mut node in old {
        if node_matches_any(&node, selections, data_by_index) {
            for item in collect_items(std::slice::from_ref(&node)) {
                if let Some(file_index) = item.file_index() {
                    removed_indices.insert(file_index);
                }
            }
            continue;
        }
        if let Node::Folder { children, .. } = &mut node {
            remove_matching_nodes(children, selections, data_by_index, removed_indices);
        }
        nodes.push(node);
    }
}

fn node_matches_any(
    node: &Node,
    selections: &[EffectFolderSelection],
    data_by_index: &HashMap<i32, FileRecord>,
) -> bool {
    selections.iter().any(|selection| match node {
        Node::Item { .. } => {
            let Node::Item { file_index, .. } = node else {
                return false;
            };
            data_by_index
                .get(file_index)
                .is_some_and(|record| selection_matches_item(selection, node, record))
        }
        Node::Folder { .. } => selection_matches_model(selection, node, data_by_index),
    })
}

fn selection_matches_item(
    selection: &EffectFolderSelection,
    node: &Node,
    record: &FileRecord,
) -> bool {
    let Node::Item {
        entry, file_index, ..
    } = node
    else {
        return false;
    };
    let kind = selection.kind.to_ascii_lowercase();
    let kind_match = match record.actual_ext.as_str() {
        ".efxbn" => kind == "efxbn" || kind == ".efxbn" || kind == "file",
        ".nutexb" => kind == "texture" || kind == "nutexb" || kind == ".nutexb" || kind == "file",
        _ => kind == "file",
    };
    kind_match
        && selection
            .file_index
            .map_or(true, |wanted| wanted == *file_index)
        && selection
            .hash_id
            .map_or(true, |wanted| item_hash(entry) == Some(wanted))
        && selection.name.as_ref().map_or(true, |wanted| {
            wanted.eq_ignore_ascii_case(&record.file_base_name)
                || wanted.eq_ignore_ascii_case(&file_basename(&record.file_url))
        })
}

fn selection_matches_model(
    selection: &EffectFolderSelection,
    node: &Node,
    data_by_index: &HashMap<i32, FileRecord>,
) -> bool {
    if selection.kind.to_ascii_lowercase() != "model" || !is_model_group(node, data_by_index) {
        return false;
    }
    let hash_match = selection
        .hash_id
        .map_or(true, |wanted| folder_hash(node) == Some(wanted));
    let name_match = selection.name.as_ref().map_or(true, |wanted| {
        let model = model_from_node(node, data_by_index);
        wanted.eq_ignore_ascii_case(&model.name)
    });
    hash_match && name_match
}

fn destination_has_item_hash(
    forest: &[Node],
    data_by_index: &HashMap<i32, FileRecord>,
    ext: &str,
    hash: i32,
) -> bool {
    collect_items(forest).into_iter().any(|item| {
        item.file_index()
            .and_then(|idx| data_by_index.get(&idx))
            .is_some_and(|record| record.actual_ext == ext)
            && item.item_entry().and_then(item_hash) == Some(hash)
    })
}

fn destination_has_model_hash(forest: &[Node], hash: i32) -> bool {
    forest.iter().any(|node| node_has_model_hash(node, hash))
}

fn node_has_model_hash(node: &Node, hash: i32) -> bool {
    if folder_hash(node) == Some(hash) {
        return true;
    }
    match node {
        Node::Folder { children, .. } => children
            .iter()
            .any(|child| node_has_model_hash(child, hash)),
        Node::Item { .. } => false,
    }
}

fn item_hash(entry: &SubFileStructureEntry) -> Option<i32> {
    match entry {
        SubFileStructureEntry::Item { unk3, .. } => Some(*unk3),
        _ => None,
    }
}

fn folder_hash(node: &Node) -> Option<i32> {
    match node {
        Node::Folder {
            entry: SubFileStructureEntry::Folder { unk5, .. },
            ..
        } => Some(*unk5),
        _ => None,
    }
}

impl Node {
    fn file_index(&self) -> Option<i32> {
        match self {
            Node::Item { file_index, .. } => Some(*file_index),
            Node::Folder { .. } => None,
        }
    }

    fn item_entry(&self) -> Option<&SubFileStructureEntry> {
        match self {
            Node::Item { entry, .. } => Some(entry),
            Node::Folder { .. } => None,
        }
    }
}

fn next_file_index(entries: &[Value]) -> i32 {
    entries
        .iter()
        .filter_map(value_file_index)
        .max()
        .unwrap_or(-1)
        + 1
}

fn reindex_sub_file_data(entries: &mut [Value]) {
    for (index, entry) in entries.iter_mut().enumerate() {
        if let Some(obj) = entry.as_object_mut() {
            obj.insert("index".to_string(), json!(index));
        }
    }
}

fn scan_source_model_files(source_dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !source_dir.is_dir() {
        return Err(format!(
            "Source model folder does not exist: {}",
            source_dir.display()
        ));
    }
    let mut files = Vec::new();
    for entry in fs::read_dir(source_dir).map_err(|e| {
        format!(
            "Failed to read source model folder {}: {e}",
            source_dir.display()
        )
    })? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let ext = extension_from_name(name);
            if is_model_file_ext(&ext) {
                files.push(path);
            }
        }
    }
    files.sort();
    Ok(files)
}

fn validate_model_ext_set(files: &[(Option<PathBuf>, String, String)]) -> Result<(), String> {
    for required in [".nusktb", ".numshb", ".numdlb", ".jnttbl"] {
        let count = files.iter().filter(|(_, _, ext)| ext == required).count();
        if count != 1 {
            return Err(format!(
                "Effect model folder must contain exactly one {required}; found {count}."
            ));
        }
    }
    Ok(())
}

fn model_name_from_files(files: &[PathBuf]) -> Option<String> {
    files.iter().find_map(|path| {
        let name = path.file_name()?.to_str()?;
        if extension_from_name(name) == ".numdlb" {
            Some(stem(name))
        } else {
            None
        }
    })
}

fn is_model_file_ext(ext: &str) -> bool {
    matches!(
        ext,
        ".nusktb" | ".numshb" | ".numdlb" | ".jnttbl" | ".numatb" | ".nuhlpb"
    )
}

fn is_nonempty_required_model_ext(ext: &str) -> bool {
    matches!(ext, ".nusktb" | ".numshb" | ".numdlb")
}

fn item_unk2_for_ext(ext: &str) -> &'static str {
    match ext {
        ".nusktb" => "10000000",
        ".numatb" => "21000000",
        ".numshb" => "30000000",
        ".numdlb" => "40000000",
        ".jnttbl" => "50000000",
        _ => "00000000",
    }
}

fn item_unk3_for_ext(ext: &str) -> i32 {
    match ext {
        ".numatb" => 1,
        _ => 0,
    }
}

fn file_type_for_ext(ext: &str) -> String {
    if ext == ".jnttbl" {
        ".bin".to_string()
    } else {
        ext.to_string()
    }
}

fn actual_ext(file_type: &str, file_url: &str) -> String {
    let name = file_basename(file_url);
    let ext = extension_from_name(&name);
    if !ext.is_empty() {
        ext
    } else {
        file_type.to_ascii_lowercase()
    }
}

fn resolve_file_path(json_dir: &Path, file_url: &str) -> PathBuf {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    json_dir.join(cleaned)
}

fn file_url_for_target(json_dir: &Path, target: &Path) -> String {
    let rel = target
        .strip_prefix(json_dir)
        .map(Path::to_path_buf)
        .unwrap_or_else(|_| target.to_path_buf());
    format!(".\\{}", rel.to_string_lossy().replace('/', "\\"))
}

fn copy_one_file(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_file() {
        return Err(format!("Source file does not exist: {}", source.display()));
    }
    if destination.exists() {
        return Err(format!(
            "Import destination already exists and will not be overwritten: {}",
            destination.display()
        ));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    fs::copy(source, destination).map_err(|e| {
        format!(
            "Failed to copy {} -> {}: {e}",
            source.display(),
            destination.display()
        )
    })?;
    Ok(())
}

fn write_placeholder_file(path: &Path, ext: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }
    let bytes = if ext == ".efxbn" {
        let mut out = vec![0u8; 0x20];
        out[0..4].copy_from_slice(b"EFXB");
        out[0x04..0x08].copy_from_slice(&2u32.to_le_bytes());
        out[0x08..0x0c].copy_from_slice(&(0x20u32).to_le_bytes());
        out
    } else {
        Vec::new()
    };
    fs::write(path, bytes)
        .map_err(|e| format!("Failed to write placeholder {}: {e}", path.display()))
}

fn unique_child_path(parent: &Path, desired_name: &str) -> PathBuf {
    let candidate = parent.join(desired_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = stem(desired_name);
    let ext = extension_from_name(desired_name);
    for n in 1..10_000 {
        let name = if ext.is_empty() {
            format!("{stem}_{n}")
        } else {
            format!("{stem}_{n}{ext}")
        };
        let candidate = parent.join(name);
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{stem}_overflow{ext}"))
}

fn delete_file_if_under(root: &Path, path: &Path) {
    let Ok(root) = fs::canonicalize(root) else {
        return;
    };
    let Ok(path) = fs::canonicalize(path) else {
        return;
    };
    if path.starts_with(root) {
        let _ = fs::remove_file(path);
    }
}

fn ensure_extension(name: &str, ext: &str) -> String {
    if name.to_ascii_lowercase().ends_with(ext) {
        name.to_string()
    } else {
        format!("{name}{ext}")
    }
}

fn file_basename(file_url: &str) -> String {
    file_url
        .replace('\\', "/")
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
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

fn stem(name: &str) -> String {
    match name.rfind('.') {
        Some(idx) if idx > 0 => name[..idx].to_string(),
        _ => name.to_string(),
    }
}

fn sanitize_stem(name: &str) -> String {
    stem(name)
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_zero_effect_efxbn() {
        let mut bytes = vec![0u8; 0x20];
        bytes[0..4].copy_from_slice(b"EFXB");
        bytes[0x04..0x08].copy_from_slice(&2u32.to_le_bytes());
        bytes[0x08..0x0c].copy_from_slice(&(0x20u32).to_le_bytes());

        let parsed = parse_efxbn_bytes(&bytes, "memory").unwrap();

        assert_eq!(parsed.magic, "EFXB");
        assert_eq!(parsed.effect_count, 0);
        assert!(parsed.control_block_size.is_none());
    }

    #[test]
    fn parses_model_id_from_effect_meta() {
        let mut bytes = vec![0u8; 0x20 + 0x370 + 160];
        bytes[0..4].copy_from_slice(b"EFXB");
        bytes[0x04..0x08].copy_from_slice(&2u32.to_le_bytes());
        let len = bytes.len() as u32;
        bytes[0x08..0x0c].copy_from_slice(&len.to_le_bytes());
        bytes[0x0c..0x10].copy_from_slice(&1u32.to_le_bytes());
        bytes[0x10..0x14].copy_from_slice(&21u32.to_le_bytes());
        let model_id = -1085699015i32;
        let off = 0x20 + 0x138;
        bytes[off..off + 4].copy_from_slice(&model_id.to_le_bytes());

        let parsed = parse_efxbn_bytes(&bytes, "memory").unwrap();

        assert_eq!(parsed.effect_count, 1);
        assert_eq!(parsed.model_ids[0].signed, model_id);
        assert_eq!(parsed.effects[0].model_id, model_id);
        assert_eq!(parsed.control_block_size, Some(160));
    }

    #[test]
    fn real_effect_sample_inspects_when_present() {
        let root = Path::new(r"E:\XB\解包\com\file\006effect\0x6D9F47E5");
        let structure = Path::new(r"E:\XB\解包\com\file\006effect\0x6D9F47E5_structure.json");
        if !root.is_dir() || !structure.is_file() {
            eprintln!("SKIP: real 006effect sample is not present.");
            return;
        }

        let inventory =
            inspect_effect_folder(&root.to_string_lossy(), Some(&structure.to_string_lossy()))
                .unwrap();

        assert!(inventory.summary.efxbn_count > 0);
        assert!(inventory.summary.model_count > 0);
        assert!(inventory.summary.texture_count > 0);
    }

    #[test]
    fn real_effect_sample_validates_when_present() {
        let root = Path::new(r"E:\XB\解包\com\file\006effect\0x6D9F47E5");
        let structure = Path::new(r"E:\XB\解包\com\file\006effect\0x6D9F47E5_structure.json");
        if !root.is_dir() || !structure.is_file() {
            eprintln!("SKIP: real 006effect sample is not present.");
            return;
        }

        let result = validate_effect_folder_for_repack(
            &root.to_string_lossy(),
            Some(&structure.to_string_lossy()),
        );

        assert!(
            result.valid,
            "expected real effect sample to validate, errors={}",
            serde_json::to_string_pretty(&result.errors).unwrap()
        );
    }

    #[test]
    fn import_placeholder_efxbn_updates_structure() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("0xTEST");
        fs::create_dir_all(&root).unwrap();
        let structure = tmp.path().join("0xTEST_structure.json");
        fs::write(
            &structure,
            serde_json::to_string_pretty(&json!({
                "Magic": -843925575_i32,
                "Fhm2dTotalCount": 0,
                "UnkCount": 0,
                "SubFileData": [],
                "SubFileStructure": [],
            }))
            .unwrap(),
        )
        .unwrap();

        let result = import_effect_file(
            &root.to_string_lossy(),
            Some(&structure.to_string_lossy()),
            None,
            "efxbn",
            123,
            Some("effect_a"),
        )
        .unwrap();
        let inventory =
            inspect_effect_folder(&root.to_string_lossy(), Some(&structure.to_string_lossy()))
                .unwrap();

        assert_eq!(result.total_files, 1);
        assert_eq!(inventory.summary.efxbn_count, 1);
        assert!(root.join("effect_a.efxbn").is_file());
    }
}
