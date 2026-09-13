//! Unit-model model-level mutations (add / remove) on the canonical `_structure.json`.
//!
//! Structure surgery works on a nested view of `SubFileStructure` (Folder / Item, with EndMark
//! delimiting) and re-serializes a fresh flat list with recomputed `folderCount`s and one EndMark per
//! folder close. The packer expands EndMarks and remaps `fileIndex` values itself
//! (`build_file_index_remap`), so we keep original `fileIndex` values stable (gaps are fine) and only
//! need the tree's Item references to point at entries that still exist in `SubFileData`.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};
use ssbh_data::hlpb_data::HlpbData;
use ssbh_data::prelude::MatlData;
use ssbh_data::prelude::{MeshData, ModlData, SkelData};

use crate::format::fhm2d::SubFileStructureEntry;
use crate::jnttbl_format::parse_jnttbl_bytes;
use crate::ssbh_dae::decode_exported_mesh_object_identity;

const UNIT_MODEL_BASE_MATERIAL_VARIANT: i32 = 1;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelMutationResult {
    pub model_root: String,
    pub structure_json_path: String,
    pub model_count: usize,
    pub total_files: usize,
    pub removed_files: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelTextureContainerSyncResult {
    pub model_root: String,
    pub structure_json_path: String,
    pub changed: bool,
}

enum Node {
    Folder {
        entry: SubFileStructureEntry,
        children: Vec<Node>,
    },
    Item {
        entry: SubFileStructureEntry,
        file_index: i32,
        name: Option<String>,
    },
}

enum Tok {
    Folder(SubFileStructureEntry),
    Item(SubFileStructureEntry, i32, Option<String>),
    End,
}

/// Synchronize every model group's paired texture container folders from the live
/// numatb texture references and persist the updated `_structure.json`.
pub fn sync_unit_model_texture_containers(
    model_root: &str,
    structure_json_path: Option<&str>,
) -> Result<bool, String> {
    let root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    sync_unit_model_texture_containers_at_paths(&root_path, &structure_path)
}

pub fn sync_unit_model_texture_containers_result(
    model_root: &str,
    structure_json_path: Option<&str>,
) -> Result<UnitModelTextureContainerSyncResult, String> {
    let root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let changed = sync_unit_model_texture_containers_at_paths(&root_path, &structure_path)?;
    Ok(UnitModelTextureContainerSyncResult {
        model_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        changed,
    })
}

/// Same as `sync_unit_model_texture_containers`, but infers the package root from
/// a sibling `*_structure.json` path. Useful for repack flows that only know the
/// structure file.
pub fn sync_unit_model_texture_containers_for_structure(
    structure_json_path: &str,
) -> Result<bool, String> {
    let structure_path = PathBuf::from(structure_json_path.trim());
    if structure_path.as_os_str().is_empty() {
        return Err("structure_json_path cannot be empty.".to_string());
    }
    let root_path = infer_model_root_from_structure_path(&structure_path)?;
    sync_unit_model_texture_containers_at_paths(&root_path, &structure_path)
}

fn sync_unit_model_texture_containers_at_paths(
    model_root: &Path,
    structure_path: &Path,
) -> Result<bool, String> {
    // Resolve fileUrl against the package asset base (parent of model root), not the
    // structure file's parent. Working structure copies may live under the system temp dir.
    let json_dir = model_root
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| {
            format!(
                "Cannot determine asset base directory for model root {}",
                model_root.display()
            )
        })?;
    let raw = fs::read_to_string(structure_path).map_err(|e| {
        format!(
            "Failed to read structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let mut value: Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "Failed to parse structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let mut sub_file_data = value
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
    let ext_by_index = build_ext_by_index(&sub_file_data);
    let mut root = parse_root(&sub_file_structure)?;
    let mut texture_pool = build_texture_pool_index(&sub_file_data);
    let mut next_file_index = sub_file_data
        .iter()
        .filter_map(|entry| entry.get("fileIndex").and_then(Value::as_i64))
        .max()
        .unwrap_or(-1) as i32
        + 1;

    let tree_changed = sync_texture_containers_in_tree(
        &mut root,
        &ext_by_index,
        &mut sub_file_data,
        json_dir,
        model_root,
        &mut texture_pool,
        &mut next_file_index,
    )?;
    let mut new_structure = Vec::new();
    serialize_node(&root, &mut new_structure);
    let pool_changed = prune_unreferenced_nutexb_entries(&mut sub_file_data, &new_structure);
    let changed = tree_changed || pool_changed;
    if !changed {
        return Ok(false);
    }

    reindex_sub_file_data_values(&mut sub_file_data);

    let sub_file_data_value = Value::Array(sub_file_data);
    let structure_value = serde_json::to_value(&new_structure)
        .map_err(|e| format!("Failed to serialize SubFileStructure: {e}"))?;
    let obj = value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object".to_string())?;
    let file_count = sub_file_data_value
        .as_array()
        .map(Vec::len)
        .unwrap_or_default();
    obj.insert("Fhm2dTotalCount".to_string(), json!(file_count));
    obj.insert("SubFileData".to_string(), sub_file_data_value);
    obj.insert("SubFileStructure".to_string(), structure_value);

    let serialized = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    replace_structure_json(structure_path, &format!("{serialized}\n"))?;
    Ok(true)
}

fn prune_unreferenced_nutexb_entries(
    sub_file_data: &mut Vec<Value>,
    structure: &[SubFileStructureEntry],
) -> bool {
    let referenced = collect_referenced_indices(structure);
    let original_len = sub_file_data.len();
    sub_file_data.retain(|entry| {
        let file_index = entry
            .get("fileIndex")
            .and_then(Value::as_i64)
            .map(|value| value as i32);
        match file_index {
            Some(idx) if referenced.contains(&idx) => true,
            Some(_) => {
                let file_type = entry.get("fileType").and_then(Value::as_str).unwrap_or("");
                let file_url = entry.get("fileUrl").and_then(Value::as_str).unwrap_or("");
                extension_of(file_type, file_url) != ".nutexb"
            }
            None => true,
        }
    });
    sub_file_data.len() != original_len
}

fn sync_texture_containers_in_tree(
    node: &mut Node,
    ext_by_index: &HashMap<i32, String>,
    sub_file_data: &mut Vec<Value>,
    json_dir: &Path,
    model_root: &Path,
    texture_pool: &mut HashMap<String, i32>,
    next_file_index: &mut i32,
) -> Result<bool, String> {
    let self_is_model_group = folder_has_direct_ext(node, ".numdlb", ext_by_index);
    match node {
        Node::Item { .. } => Ok(false),
        Node::Folder { children, .. } => {
            if self_is_model_group {
                sync_model_group_texture_containers(
                    children,
                    ext_by_index,
                    sub_file_data,
                    json_dir,
                    model_root,
                    texture_pool,
                    next_file_index,
                )
            } else {
                let mut changed = false;
                for child in children.iter_mut() {
                    changed |= sync_texture_containers_in_tree(
                        child,
                        ext_by_index,
                        sub_file_data,
                        json_dir,
                        model_root,
                        texture_pool,
                        next_file_index,
                    )?;
                }
                Ok(changed)
            }
        }
    }
}

fn sync_model_group_texture_containers(
    children: &mut Vec<Node>,
    ext_by_index: &HashMap<i32, String>,
    sub_file_data: &mut Vec<Value>,
    json_dir: &Path,
    model_root: &Path,
    texture_pool: &mut HashMap<String, i32>,
    next_file_index: &mut i32,
) -> Result<bool, String> {
    let old_children = std::mem::take(children);
    let mut iter = old_children.into_iter().peekable();
    let mut next_children = Vec::new();
    let mut changed = false;
    let mut pending_container: Option<Node> = None;

    while let Some(child) = iter.next() {
        if texture_container_entry(&child, ext_by_index).is_some() {
            if pending_container.is_some() {
                changed = true;
            }
            pending_container = Some(child);
            continue;
        }

        if let Some((numatb_file_index, variant_unk3)) = numatb_item_info(&child, ext_by_index) {
            let existing_container_entry = pending_container
                .as_ref()
                .and_then(|container| texture_container_entry(container, ext_by_index));
            let (synced_container, pool_changed) = build_synced_container_node(
                existing_container_entry,
                variant_unk3,
                numatb_file_index,
                sub_file_data,
                json_dir,
                model_root,
                texture_pool,
                next_file_index,
            )?;
            match pending_container.take() {
                Some(existing_container) => {
                    changed |= pool_changed || !nodes_equal(&existing_container, &synced_container);
                }
                None => {
                    changed = true | pool_changed;
                }
            }
            next_children.push(synced_container);
            next_children.push(child);
            continue;
        }

        next_children.push(child);
    }

    if pending_container.is_some() {
        changed = true;
    }
    *children = next_children;
    Ok(changed)
}

fn build_synced_container_node(
    existing_container: Option<&SubFileStructureEntry>,
    numatb_variant: i32,
    numatb_file_index: i32,
    sub_file_data: &mut Vec<Value>,
    json_dir: &Path,
    model_root: &Path,
    texture_pool: &mut HashMap<String, i32>,
    next_file_index: &mut i32,
) -> Result<(Node, bool), String> {
    let numatb_path = file_path_for_index(sub_file_data, json_dir, numatb_file_index)?;
    let refs = numatb_texture_refs(&numatb_path)?;
    let variant = resolved_container_variant(existing_container, numatb_variant);
    let mut pool_changed = false;
    let children = refs
        .into_iter()
        .map(|reference| {
            let (file_index, changed) = ensure_texture_pool_entry(
                sub_file_data,
                json_dir,
                model_root,
                texture_pool,
                next_file_index,
                &reference,
            )?;
            pool_changed |= changed;
            let display_name = stem(&reference);
            Ok(Node::Item {
                entry: make_item(file_index, "00000000", 0, &display_name),
                file_index,
                name: Some(display_name),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok((
        Node::Folder {
            entry: synced_container_entry(existing_container, variant),
            children,
        },
        pool_changed,
    ))
}

fn texture_container_entry<'a>(
    node: &'a Node,
    ext_by_index: &HashMap<i32, String>,
) -> Option<&'a SubFileStructureEntry> {
    match node {
        Node::Folder { entry, children } => match entry {
            SubFileStructureEntry::Folder { unk3, .. } if *unk3 == 32 => Some(entry),
            SubFileStructureEntry::Folder { .. }
                if !children.is_empty()
                    && children.iter().all(|child| {
                        matches!(child, Node::Item { file_index, .. }
                        if ext_by_index.get(file_index).map(String::as_str) == Some(".nutexb"))
                    }) =>
            {
                Some(entry)
            }
            _ => None,
        },
        Node::Item { .. } => None,
    }
}

fn numatb_item_info(node: &Node, ext_by_index: &HashMap<i32, String>) -> Option<(i32, i32)> {
    match node {
        Node::Item {
            entry, file_index, ..
        } if ext_by_index.get(file_index).map(String::as_str) == Some(".numatb") => match entry {
            SubFileStructureEntry::Item { unk3, .. } => Some((*file_index, *unk3)),
            _ => None,
        },
        _ => None,
    }
}

fn resolved_container_variant(
    existing_container: Option<&SubFileStructureEntry>,
    numatb_unk3: i32,
) -> i32 {
    if numatb_unk3 >= 1 {
        return numatb_unk3;
    }
    match existing_container {
        Some(SubFileStructureEntry::Folder { unk5, .. }) if *unk5 >= 1 => *unk5,
        _ => UNIT_MODEL_BASE_MATERIAL_VARIANT,
    }
}

fn synced_container_entry(
    existing_container: Option<&SubFileStructureEntry>,
    variant: i32,
) -> SubFileStructureEntry {
    match existing_container {
        Some(SubFileStructureEntry::Folder {
            unk1,
            unk2,
            unk2_1,
            unk4,
            unk6,
            ..
        }) => SubFileStructureEntry::Folder {
            unk1: unk1.clone(),
            folder_count: 0,
            unk2: unk2.clone(),
            unk2_1: *unk2_1,
            unk3: 32,
            unk4: *unk4,
            unk5: variant,
            unk6: *unk6,
        },
        _ => make_folder(32, variant),
    }
}

fn build_texture_pool_index(sub_file_data: &[Value]) -> HashMap<String, i32> {
    let mut out = HashMap::new();
    for entry in sub_file_data {
        let Some(file_index) = entry.get("fileIndex").and_then(Value::as_i64) else {
            continue;
        };
        if extension_of(
            entry.get("fileType").and_then(Value::as_str).unwrap_or(""),
            entry.get("fileUrl").and_then(Value::as_str).unwrap_or(""),
        ) != ".nutexb"
        {
            continue;
        }
        let key =
            normalize_texture_filename(entry.get("fileUrl").and_then(Value::as_str).unwrap_or(""));
        if !key.is_empty() {
            out.insert(key, file_index as i32);
        }
    }
    out
}

fn ensure_texture_pool_entry(
    sub_file_data: &mut Vec<Value>,
    json_dir: &Path,
    model_root: &Path,
    texture_pool: &mut HashMap<String, i32>,
    next_file_index: &mut i32,
    reference: &str,
) -> Result<(i32, bool), String> {
    let key = normalize_texture_filename(reference);
    if key.is_empty() || key == ".nutexb" {
        return Err(format!("Invalid empty texture reference: '{reference}'"));
    }

    if let Some(file_index) = texture_pool.get(&key).copied() {
        let changed =
            maybe_repair_texture_pool_path(sub_file_data, json_dir, model_root, file_index, &key);
        return Ok((file_index, changed));
    }

    let target_path =
        find_texture_source_path(model_root, &key).ok_or_else(|| {
            match texture_pool
                .keys()
                .find(|name| name.eq_ignore_ascii_case(&key))
            {
                Some(actual) => format!(
                    "Referenced texture '{key}' does not match the packaged texture '{actual}'. \
The game matches texture names byte for byte, so the two spellings must be identical."
                ),
                None => format!(
                    "Referenced texture '{}' was not found in SubFileData or on disk under {}",
                    key,
                    model_root.display()
                ),
            }
        })?;
    *next_file_index += 1;
    let file_index = *next_file_index;
    sub_file_data.push(json!({
        "index": sub_file_data.len(),
        "fileType": ".nutexb",
        "fileIndex": file_index,
        "fileUrl": file_url_for_target(json_dir, &target_path),
        "fileBaseName": stem(&key),
    }));
    texture_pool.insert(key, file_index);
    Ok((file_index, true))
}

fn maybe_repair_texture_pool_path(
    sub_file_data: &mut [Value],
    json_dir: &Path,
    model_root: &Path,
    file_index: i32,
    filename: &str,
) -> bool {
    let Some(entry) = sub_file_data
        .iter_mut()
        .find(|entry| entry.get("fileIndex").and_then(Value::as_i64) == Some(file_index as i64))
    else {
        return false;
    };
    let Some(file_url) = entry.get("fileUrl").and_then(Value::as_str) else {
        return false;
    };
    if resolve_file_path(json_dir, file_url).is_file() {
        return false;
    }
    let Some(target_path) = find_texture_source_path(model_root, filename) else {
        return false;
    };
    if let Some(obj) = entry.as_object_mut() {
        obj.insert("fileType".to_string(), json!(".nutexb"));
        obj.insert(
            "fileUrl".to_string(),
            json!(file_url_for_target(json_dir, &target_path)),
        );
        obj.insert("fileBaseName".to_string(), json!(stem(filename)));
        return true;
    }
    false
}

fn find_texture_source_path(model_root: &Path, filename: &str) -> Option<PathBuf> {
    for candidate in [
        model_root.join("textures").join(filename),
        model_root.join(filename),
    ] {
        if candidate.is_file() && on_disk_name_matches(&candidate) {
            return Some(candidate);
        }
    }
    None
}

/// Whether the file really is spelled the way it was asked for.
///
/// Windows resolves paths case-insensitively, so `is_file()` alone accepts
/// `wep_2004_aomap.nutexb` for a file named `Wep_2004_AOMap.nutexb` and the caller would
/// then register the texture under a spelling the game cannot resolve.
fn on_disk_name_matches(candidate: &Path) -> bool {
    let Some(requested) = candidate.file_name() else {
        return false;
    };
    match fs::canonicalize(candidate) {
        Ok(real) => real.file_name() == Some(requested),
        // With no canonical path there is nothing to compare against; do not reject a
        // texture that is demonstrably on disk.
        Err(_) => true,
    }
}

fn import_texture_into_pool(
    tex_name: &str,
    source_dir: &Path,
    model_root: &Path,
    json_dir: &Path,
    texture_pool: &mut HashMap<String, i32>,
    sub_file_data: &mut Vec<Value>,
    copies: &mut Vec<(PathBuf, PathBuf)>,
    next_file_index: &mut i32,
    make_url: &impl Fn(&str) -> String,
) -> Result<i32, String> {
    let key = normalize_texture_filename(tex_name);
    if let Some(&existing) = texture_pool.get(&key) {
        return Ok(existing);
    }
    if find_texture_source_path(model_root, &key).is_some() {
        let (file_index, _) = ensure_texture_pool_entry(
            sub_file_data,
            json_dir,
            model_root,
            texture_pool,
            next_file_index,
            tex_name,
        )?;
        return Ok(file_index);
    }

    let src_tex = source_dir.join(tex_name);
    if !src_tex.is_file() {
        return Err(format!(
            "Texture '{key}' was not found in SubFileData, under {}, or in the source folder.",
            model_root.join("textures").display()
        ));
    }

    let filename = src_tex
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid source texture: {}", src_tex.display()))?
        .to_string();
    *next_file_index += 1;
    let file_index = *next_file_index;
    let url = make_url(&format!("textures/{filename}"));
    let dst = model_root.join("textures").join(&filename);
    copies.push((src_tex, dst));
    sub_file_data.push(json!({
        "index": sub_file_data.len(),
        "fileType": ".nutexb",
        "fileIndex": file_index,
        "fileUrl": url,
        "fileBaseName": stem(&filename),
    }));
    texture_pool.insert(key, file_index);
    Ok(file_index)
}

fn file_path_for_index(
    sub_file_data: &[Value],
    json_dir: &Path,
    file_index: i32,
) -> Result<PathBuf, String> {
    let file_url = sub_file_data
        .iter()
        .find(|entry| entry.get("fileIndex").and_then(Value::as_i64) == Some(file_index as i64))
        .and_then(|entry| entry.get("fileUrl").and_then(Value::as_str))
        .ok_or_else(|| format!("Missing SubFileData entry for fileIndex {file_index}"))?;
    Ok(resolve_file_path(json_dir, file_url))
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

/// Basename with a canonical lowercase `.nutexb` extension, stem case preserved.
///
/// This doubles as the texture pool key and as the name a numatb reference is resolved
/// against, so the stem has to keep its exact case. The game compares texture names byte
/// for byte, and folding case here would bind a reference to a texture the game can never
/// find, producing an archive that looks consistent and crashes on load.
pub(crate) fn normalize_texture_filename(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let cleaned = trimmed.replace('/', "\\");
    let filename = cleaned
        .split('\\')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .last()
        .unwrap_or(trimmed);
    match filename.rfind('.') {
        Some(idx) if idx > 0 && filename[idx..].eq_ignore_ascii_case(".nutexb") => {
            format!("{}.nutexb", &filename[..idx])
        }
        _ => format!("{filename}.nutexb"),
    }
}

fn reindex_sub_file_data_values(entries: &mut [Value]) {
    for (index, entry) in entries.iter_mut().enumerate() {
        if let Some(obj) = entry.as_object_mut() {
            obj.insert("index".to_string(), json!(index));
        }
    }
}

fn nodes_equal(left: &Node, right: &Node) -> bool {
    let mut left_entries = Vec::new();
    let mut right_entries = Vec::new();
    serialize_node(left, &mut left_entries);
    serialize_node(right, &mut right_entries);
    serde_json::to_value(&left_entries).ok() == serde_json::to_value(&right_entries).ok()
}

pub(crate) fn infer_model_root_from_structure_path(
    structure_path: &Path,
) -> Result<PathBuf, String> {
    let parent = structure_path.parent().ok_or_else(|| {
        format!(
            "Cannot infer unit model root from structure JSON {}",
            structure_path.display()
        )
    })?;
    let file_name = structure_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            format!(
                "Cannot infer unit model root from structure JSON {}",
                structure_path.display()
            )
        })?;
    let stem = file_name
        .strip_suffix("_structure.json")
        .or_else(|| file_name.strip_suffix(".json"))
        .ok_or_else(|| {
            format!(
                "Structure JSON name must end with _structure.json or .json: {}",
                structure_path.display()
            )
        })?;
    let model_root = parent.join(stem);
    if !model_root.is_dir() {
        return Err(format!(
            "Expected unit model root sibling directory '{}' for structure JSON {}",
            model_root.display(),
            structure_path.display()
        ));
    }
    Ok(model_root)
}

/// Return model-group names in the depth-first order used by SHL
/// `folder_index` values.
pub(crate) fn list_unit_model_model_names(
    model_root: &str,
    structure_json_path: Option<&str>,
) -> Result<Vec<String>, String> {
    let root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let raw = fs::read_to_string(&structure_path).map_err(|error| {
        format!(
            "Failed to read structure JSON {}: {error}",
            structure_path.display()
        )
    })?;
    let value: Value = serde_json::from_str(&raw).map_err(|error| {
        format!(
            "Failed to parse structure JSON {}: {error}",
            structure_path.display()
        )
    })?;
    let sub_file_data = value
        .get("SubFileData")
        .and_then(Value::as_array)
        .ok_or_else(|| "Structure JSON missing SubFileData array".to_string())?;
    let structure: Vec<SubFileStructureEntry> = serde_json::from_value(
        value
            .get("SubFileStructure")
            .cloned()
            .ok_or_else(|| "Structure JSON missing SubFileStructure".to_string())?,
    )
    .map_err(|error| format!("Failed to parse SubFileStructure: {error}"))?;
    let ext_by_index = build_ext_by_index(sub_file_data);
    let root = parse_root(&structure)?;
    let mut names = Vec::new();
    collect_model_group_names(&root, &ext_by_index, &mut names);
    Ok(names)
}

/// Remove a whole model (its folder of model files plus its paired nuhlpb), dropping any pool
/// entries that become unreferenced (model files and now-orphaned textures), and rewrite the
/// structure JSON. Returns the updated counts and the deleted file URLs.
pub fn remove_unit_model_model(
    model_root: &str,
    structure_json_path: Option<&str>,
    model_name: &str,
) -> Result<UnitModelMutationResult, String> {
    let root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();

    let raw = fs::read_to_string(&structure_path).map_err(|e| {
        format!(
            "Failed to read structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let mut value: Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "Failed to parse structure JSON {}: {e}",
            structure_path.display()
        )
    })?;

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

    let ext_by_index = build_ext_by_index(&sub_file_data);

    let mut root = parse_root(&sub_file_structure)?;
    let removed = remove_model_from_tree(&mut root, model_name, &ext_by_index)?;
    if !removed {
        return Err(format!(
            "Model '{model_name}' was not found in the structure."
        ));
    }

    let mut new_structure = Vec::new();
    serialize_node(&root, &mut new_structure);

    let referenced: HashSet<i32> = collect_referenced_indices(&new_structure);

    let mut removed_files = Vec::new();
    let mut new_sub_file_data = Vec::with_capacity(sub_file_data.len());
    for entry in &sub_file_data {
        let file_index = entry
            .get("fileIndex")
            .and_then(Value::as_i64)
            .map(|v| v as i32);
        match file_index {
            Some(idx) if referenced.contains(&idx) => {
                let mut kept = entry.clone();
                if let Some(obj) = kept.as_object_mut() {
                    obj.insert("index".to_string(), json!(new_sub_file_data.len()));
                }
                new_sub_file_data.push(kept);
            }
            _ => {
                if let Some(url) = entry.get("fileUrl").and_then(Value::as_str) {
                    removed_files.push(url.to_string());
                }
            }
        }
    }

    let model_count = count_model_groups(&root, &ext_by_index);

    let structure_value = serde_json::to_value(&new_structure)
        .map_err(|e| format!("Failed to serialize SubFileStructure: {e}"))?;
    let obj = value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object".to_string())?;
    obj.insert(
        "Fhm2dTotalCount".to_string(),
        json!(new_sub_file_data.len()),
    );
    obj.insert(
        "SubFileData".to_string(),
        Value::Array(new_sub_file_data.clone()),
    );
    obj.insert("SubFileStructure".to_string(), structure_value);

    let serialized = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    fs::write(&structure_path, format!("{serialized}\n"))
        .map_err(|e| format!("Failed to write {}: {e}", structure_path.display()))?;

    for url in &removed_files {
        // Never physically delete pooled `.nutexb` textures when removing a model. Textures live
        // in the shared deduped pool; an orphaned texture should stay on disk so it remains
        // reusable (it is dropped from the structure, but the asset itself is preserved). Only
        // model-specific files (numdlb/numshb/nusktb/jnttbl/numatb/nuhlpb) are deleted.
        if url.to_ascii_lowercase().ends_with(".nutexb") {
            continue;
        }
        delete_pool_file_if_safe(&root_path, &json_dir, url);
    }

    Ok(UnitModelMutationResult {
        model_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        model_count,
        total_files: new_sub_file_data.len(),
        removed_files,
    })
}

#[derive(Clone)]
struct SourceModel {
    model_name: String,
    numdlb: PathBuf,
    numshb: PathBuf,
    nusktb: PathBuf,
    jnttbl: PathBuf,
    numatbs: Vec<PathBuf>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelSourceValidation {
    pub source_dir: String,
    pub model_name: String,
    pub required_files: Vec<String>,
    pub texture_references: Vec<String>,
    pub source_textures_found: Vec<String>,
    pub texture_references_not_in_source: Vec<String>,
    pub ignored_source_nuhlpb: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelReplacePreview {
    pub source: UnitModelSourceValidation,
    pub target: UnitModelReplaceTargetPreview,
    pub compatibility: UnitModelReplaceCompatibility,
    pub textures: UnitModelReplaceTexturePlan,
    pub warnings: Vec<String>,
    pub blockers: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelReplaceTargetPreview {
    pub model_name: String,
    pub model_index: usize,
    pub numdlb_path: Option<String>,
    pub numshb_path: Option<String>,
    pub nusktb_path: Option<String>,
    pub jnttbl_path: Option<String>,
    pub numatb_paths: Vec<String>,
    pub nuhlpb_path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelReplaceCompatibility {
    pub skeleton: UnitModelSkeletonCompatibility,
    pub jnttbl: UnitModelJnttblCompatibility,
    pub materials: UnitModelMaterialCompatibility,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelSkeletonCompatibility {
    pub source_bone_count: usize,
    pub target_bone_count: usize,
    pub matching_bone_names: usize,
    pub missing_in_source: Vec<String>,
    pub new_in_source: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelJnttblCompatibility {
    pub source_bone_count: u32,
    pub target_bone_count: Option<u32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelMaterialCompatibility {
    pub kept_labels: Vec<String>,
    pub removed_labels: Vec<String>,
    pub added_labels: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelReplaceTexturePlan {
    pub referenced: Vec<String>,
    pub copied_from_source: Vec<String>,
    pub reused_from_pool: Vec<String>,
    pub missing: Vec<String>,
    pub orphaned_after_replace: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelMeshObjectRef {
    pub name: String,
    pub subindex: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelNumdlbEntryRef {
    pub name: String,
    pub subindex: u64,
    pub material_label: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelNumshbObjectCompatibility {
    pub source: Vec<UnitModelMeshObjectRef>,
    pub target_numdlb_entries: Vec<UnitModelNumdlbEntryRef>,
    pub kept: Vec<UnitModelMeshObjectRef>,
    pub missing_in_source: Vec<UnitModelMeshObjectRef>,
    pub new_in_source: Vec<UnitModelMeshObjectRef>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelNumshbSkeletonCompatibility {
    pub source_influence_bones: Vec<String>,
    pub target_bone_names: Vec<String>,
    pub matching_bone_names: usize,
    pub missing_in_target_skeleton: Vec<String>,
    pub source_skel_bone_count: Option<usize>,
    pub matching_skel_bone_names: Option<usize>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelNumshbStats {
    pub source_object_count: usize,
    pub source_vertex_count: usize,
    pub source_triangle_count: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelNumshbReplacePreview {
    pub target: UnitModelReplaceTargetPreview,
    pub source_dir: String,
    pub source_numshb_path: String,
    pub source_numdlb_path: String,
    pub source_maya_numatb_path: String,
    pub source_nust_numatb_path: String,
    pub target_numshb_path: String,
    pub target_numdlb_path: String,
    pub target_maya_numatb_path: String,
    pub target_nust_numatb_path: String,
    pub mesh_objects: UnitModelNumshbObjectCompatibility,
    pub skeleton: UnitModelNumshbSkeletonCompatibility,
    pub stats: UnitModelNumshbStats,
    pub warnings: Vec<String>,
    pub blockers: Vec<String>,
}

fn ext_lower(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_ascii_lowercase()))
        .unwrap_or_default()
}

fn scan_source_model(source_dir: &Path) -> Result<SourceModel, String> {
    if !source_dir.is_dir() {
        return Err(format!(
            "Source model folder is not a directory: {}",
            source_dir.display()
        ));
    }
    let mut by_extension: HashMap<String, Vec<PathBuf>> = HashMap::new();
    for entry in fs::read_dir(source_dir)
        .map_err(|e| format!("Failed to read source dir {}: {e}", source_dir.display()))?
    {
        let path = entry
            .map_err(|e| format!("Failed to read source entry: {e}"))?
            .path();
        if !path.is_file() {
            continue;
        }
        let extension = ext_lower(&path);
        if matches!(
            extension.as_str(),
            ".numdlb" | ".numshb" | ".nusktb" | ".jnttbl" | ".numatb" | ".nuhlpb"
        ) {
            by_extension.entry(extension).or_default().push(path);
        }
    }

    let exactly_one = |extension: &str| -> Result<PathBuf, String> {
        let files = by_extension
            .get(extension)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        match files {
            [file] => Ok(file.clone()),
            [] => Err(format!(
                "Source model folder is missing the required {extension} file."
            )),
            _ => Err(format!(
                "Source model folder must contain exactly one {extension} file, found {}.",
                files.len()
            )),
        }
    };

    let numdlb = exactly_one(".numdlb")?;
    let model_name = numdlb
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Cannot derive model name from numdlb filename.".to_string())?
        .to_string();
    let numshb = exactly_one(".numshb")?;
    let nusktb = exactly_one(".nusktb")?;
    let jnttbl = exactly_one(".jnttbl")?;

    let expected_named_file = |path: &Path, expected: &[String]| -> Result<(), String> {
        let actual = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");
        if expected
            .iter()
            .any(|candidate| actual.eq_ignore_ascii_case(candidate))
        {
            Ok(())
        } else {
            Err(format!(
                "Source model files must share the numdlb base name '{model_name}': expected one of [{}], found '{actual}'.",
                expected.join(", ")
            ))
        }
    };
    expected_named_file(
        &numshb,
        &[
            format!("{model_name}.numshb"),
            format!("{model_name}__maya__.numshb"),
        ],
    )?;
    expected_named_file(
        &nusktb,
        &[
            format!("{model_name}.nusktb"),
            format!("{model_name}__maya__.nusktb"),
        ],
    )?;
    expected_named_file(&jnttbl, &[format!("{model_name}.jnttbl")])?;

    let numatbs = by_extension.get(".numatb").cloned().unwrap_or_default();
    if numatbs.len() != 2 {
        return Err(format!(
            "Source model folder must contain exactly 2 .numatb files (__maya__ + __nust__), found {}.",
            numatbs.len()
        ));
    }
    let find_profile = |profile: &str| -> Result<PathBuf, String> {
        let expected = format!("{model_name}__{profile}__.numatb");
        numatbs
            .iter()
            .find(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.eq_ignore_ascii_case(&expected))
                    .unwrap_or(false)
            })
            .cloned()
            .ok_or_else(|| format!("Source model folder is missing '{expected}'."))
    };
    let maya_numatb = find_profile("maya")?;
    let nust_numatb = find_profile("nust")?;

    Ok(SourceModel {
        model_name,
        numdlb,
        numshb,
        nusktb,
        jnttbl,
        numatbs: vec![maya_numatb, nust_numatb],
    })
}

fn validate_source_model_contents(source: &SourceModel) -> Result<(), String> {
    let modl = ModlData::from_file(&source.numdlb)
        .map_err(|e| format!("Failed to parse numdlb {}: {e}", source.numdlb.display()))?;
    if !modl.model_name.trim().is_empty()
        && !modl.model_name.eq_ignore_ascii_case(&source.model_name)
    {
        return Err(format!(
            "numdlb model_name '{}' does not match filename base '{}'.",
            modl.model_name, source.model_name
        ));
    }
    MeshData::from_file(&source.numshb)
        .map_err(|e| format!("Failed to parse numshb {}: {e}", source.numshb.display()))?;
    let skel = SkelData::from_file(&source.nusktb)
        .map_err(|e| format!("Failed to parse nusktb {}: {e}", source.nusktb.display()))?;
    for numatb in &source.numatbs {
        MatlData::from_file(numatb)
            .map_err(|e| format!("Failed to parse numatb {}: {e}", numatb.display()))?;
    }
    let jnttbl_bytes = fs::read(&source.jnttbl)
        .map_err(|e| format!("Failed to read jnttbl {}: {e}", source.jnttbl.display()))?;
    let jnttbl = parse_jnttbl_bytes(&jnttbl_bytes)
        .map_err(|e| format!("Failed to parse jnttbl {}: {e}", source.jnttbl.display()))?;
    if jnttbl.bone_count as usize != skel.bones.len() {
        return Err(format!(
            "jnttbl bone_count {} does not match nusktb bone count {}.",
            jnttbl.bone_count,
            skel.bones.len()
        ));
    }
    Ok(())
}

pub fn validate_unit_model_source_folder(
    source_dir: &str,
) -> Result<UnitModelSourceValidation, String> {
    let source_path = PathBuf::from(source_dir.trim());
    let source = scan_source_model(&source_path)?;
    validate_source_model_contents(&source)?;
    build_source_validation_report(&source_path, &source)
}

pub fn preview_unit_model_model_replacement(
    model_root: &str,
    structure_json_path: Option<&str>,
    target_model_name: &str,
    source_dir: &str,
) -> Result<UnitModelReplacePreview, String> {
    let root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let target_name = target_model_name.trim().to_string();
    if target_name.is_empty() {
        return Err("Target model name cannot be empty.".to_string());
    }

    let source_path = PathBuf::from(source_dir.trim());
    let source = scan_source_model(&source_path)?;
    validate_source_model_contents(&source)?;
    let source_report = build_source_validation_report(&source_path, &source)?;

    let raw = fs::read_to_string(&structure_path).map_err(|e| {
        format!(
            "Failed to read structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let value: Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "Failed to parse structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
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
    let ext_by_index = build_ext_by_index(&sub_file_data);
    let mut root = parse_root(&sub_file_structure)?;

    let (model_index, target_files, target_texture_refs) = {
        let models = find_models_container(&mut root, &ext_by_index)
            .ok_or_else(|| "Could not locate the models container in the structure.".to_string())?;
        let index = models
            .iter()
            .position(|mg| {
                folder_has_direct_ext(mg, ".numdlb", &ext_by_index)
                    && model_group_name(mg, &ext_by_index).as_deref() == Some(target_name.as_str())
            })
            .ok_or_else(|| format!("Model '{target_name}' was not found in the structure."))?;
        let group = &models[index];
        (
            index,
            direct_file_indices_by_ext(group, &ext_by_index),
            count_texture_references_in_node(group, &ext_by_index),
        )
    };

    let target_numdlb = first_path_for_ext(&target_files, ".numdlb", &sub_file_data, &json_dir);
    let target_numshb = first_path_for_ext(&target_files, ".numshb", &sub_file_data, &json_dir);
    let target_nusktb = first_path_for_ext(&target_files, ".nusktb", &sub_file_data, &json_dir);
    let target_jnttbl = first_path_for_ext(&target_files, ".jnttbl", &sub_file_data, &json_dir);
    let target_numatbs = paths_for_ext(&target_files, ".numatb", &sub_file_data, &json_dir);
    let target_nuhlpb = find_named_nuhlpb_path(
        &root,
        &ext_by_index,
        &sub_file_data,
        &json_dir,
        &target_name,
    );

    let source_bone_names = read_skel_bone_names(&source.nusktb)?;
    let target_nusktb_path = target_nusktb
        .as_ref()
        .ok_or_else(|| format!("Target model '{target_name}' is missing a .nusktb item."))?;
    let target_bone_names = read_skel_bone_names(target_nusktb_path)?;
    let skeleton = compare_bone_names(&source_bone_names, &target_bone_names);

    let source_jnttbl_count = read_jnttbl_bone_count(&source.jnttbl)?;
    let target_jnttbl_count = match target_jnttbl.as_ref() {
        Some(path) => Some(read_jnttbl_bone_count(path)?),
        None => None,
    };

    let source_materials = material_labels_from_numatbs(&source.numatbs)?;
    let target_materials = material_labels_from_numatbs(&target_numatbs)?;
    let (kept_labels, removed_labels, added_labels) =
        diff_ordered_labels(&target_materials, &source_materials);

    let texture_index = texture_index_by_name(&sub_file_data);
    let textures = build_replace_texture_plan(
        &source_path,
        &source_report.texture_references,
        &texture_index,
    );
    let referenced_counts = count_references_by_index(&root);
    let incoming_reused_indices: HashSet<i32> = textures
        .reused_from_pool
        .iter()
        .filter_map(|name| {
            texture_index
                .get(&normalize_texture_filename(name))
                .copied()
        })
        .collect();
    let orphaned_after_replace = target_texture_refs
        .iter()
        .filter_map(|(file_index, target_count)| {
            if incoming_reused_indices.contains(file_index) {
                return None;
            }
            let total_count = referenced_counts.get(file_index).copied().unwrap_or(0);
            if total_count != *target_count {
                return None;
            }
            file_url_for_index(&sub_file_data, *file_index).map(|file_url| file_basename(&file_url))
        })
        .collect::<Vec<_>>();
    let textures = UnitModelReplaceTexturePlan {
        orphaned_after_replace,
        ..textures
    };

    let mut warnings = Vec::new();
    if !source.model_name.eq_ignore_ascii_case(&target_name) {
        warnings.push(format!(
            "Source model '{}' will be imported as target model '{}'.",
            source.model_name, target_name
        ));
    }
    if !skeleton.missing_in_source.is_empty() || !skeleton.new_in_source.is_empty() {
        warnings.push(format!(
            "Skeleton differs: target has {} bones, source has {} bones.",
            skeleton.target_bone_count, skeleton.source_bone_count
        ));
    }
    if target_jnttbl_count != Some(source_jnttbl_count) {
        warnings.push(format!(
            "JNTT bone count differs: target {:?}, source {}.",
            target_jnttbl_count, source_jnttbl_count
        ));
    }
    if !removed_labels.is_empty() || !added_labels.is_empty() {
        warnings.push(format!(
            "Material labels differ: {} removed, {} added.",
            removed_labels.len(),
            added_labels.len()
        ));
    }
    if source_report.ignored_source_nuhlpb {
        warnings.push("Source NUHLPB is ignored; the target NUHLPB will be kept.".to_string());
    }
    if !textures.orphaned_after_replace.is_empty() {
        warnings.push(format!(
            "{} old texture(s) may be removed because no remaining model references them.",
            textures.orphaned_after_replace.len()
        ));
    }

    let blockers = textures
        .missing
        .iter()
        .map(|name| {
            format!(
                "Texture '{name}' is referenced by the source NUMATB files but is missing from both the source folder and package texture pool."
            )
        })
        .collect();

    Ok(UnitModelReplacePreview {
        source: source_report,
        target: UnitModelReplaceTargetPreview {
            model_name: target_name,
            model_index,
            numdlb_path: target_numdlb.map(path_to_string),
            numshb_path: target_numshb.map(path_to_string),
            nusktb_path: target_nusktb.map(path_to_string),
            jnttbl_path: target_jnttbl.map(path_to_string),
            numatb_paths: target_numatbs.into_iter().map(path_to_string).collect(),
            nuhlpb_path: target_nuhlpb.map(path_to_string),
        },
        compatibility: UnitModelReplaceCompatibility {
            skeleton,
            jnttbl: UnitModelJnttblCompatibility {
                source_bone_count: source_jnttbl_count,
                target_bone_count: target_jnttbl_count,
            },
            materials: UnitModelMaterialCompatibility {
                kept_labels,
                removed_labels,
                added_labels,
            },
        },
        textures,
        warnings,
        blockers,
    })
}

fn build_source_validation_report(
    source_path: &Path,
    source: &SourceModel,
) -> Result<UnitModelSourceValidation, String> {
    let mut texture_references = Vec::new();
    let mut seen = HashSet::new();
    for numatb in &source.numatbs {
        for reference in numatb_texture_refs(numatb)? {
            if seen.insert(reference.clone()) {
                texture_references.push(reference);
            }
        }
    }
    let (source_textures_found, texture_references_not_in_source): (Vec<_>, Vec<_>) =
        texture_references
            .iter()
            .cloned()
            .partition(|reference| source_path.join(reference).is_file());

    Ok(UnitModelSourceValidation {
        source_dir: source_path.to_string_lossy().to_string(),
        model_name: source.model_name.clone(),
        required_files: [
            source.numdlb.clone(),
            source.numshb.clone(),
            source.nusktb.clone(),
            source.jnttbl.clone(),
            source.numatbs[0].clone(),
            source.numatbs[1].clone(),
        ]
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect(),
        texture_references,
        source_textures_found,
        texture_references_not_in_source,
        ignored_source_nuhlpb: by_extension_exists(&source_path, ".nuhlpb")?,
    })
}

fn by_extension_exists(source_dir: &Path, extension: &str) -> Result<bool, String> {
    for entry in fs::read_dir(source_dir)
        .map_err(|e| format!("Failed to read source dir {}: {e}", source_dir.display()))?
    {
        let path = entry
            .map_err(|e| format!("Failed to read source entry: {e}"))?
            .path();
        if path.is_file() && ext_lower(&path) == extension {
            return Ok(true);
        }
    }
    Ok(false)
}

fn numatb_texture_refs(path: &Path) -> Result<Vec<String>, String> {
    let bytes =
        fs::read(path).map_err(|e| format!("Failed to read numatb {}: {e}", path.display()))?;
    let matl = MatlData::read(&mut Cursor::new(bytes))
        .map_err(|e| format!("Failed to parse numatb {}: {e}", path.display()))?;
    let mut refs = Vec::new();
    let mut seen = HashSet::new();
    for entry in &matl.entries {
        for tex in entry
            .textures
            .iter()
            .map(|t| t.data.as_str())
            .chain(entry.textures2.iter().map(|t| t.data.as_str()))
        {
            let name = normalize_texture_filename(tex);
            if name.is_empty() || name == ".nutexb" {
                continue;
            }
            // Deduplicate on the exact name: references that differ only in case are two
            // distinct names to the game, so collapsing them would drop one of them.
            if seen.insert(name.clone()) {
                refs.push(name);
            }
        }
    }
    Ok(refs)
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

fn find_models_container<'a>(
    root: &'a mut Node,
    ext_by_index: &HashMap<i32, String>,
) -> Option<&'a mut Vec<Node>> {
    let Node::Folder { children, .. } = root else {
        return None;
    };
    for child in children.iter_mut() {
        if let Node::Folder {
            children: inner, ..
        } = child
        {
            if inner
                .iter()
                .any(|c| folder_has_direct_ext(c, ".numdlb", ext_by_index))
            {
                if let Node::Folder {
                    children: inner_mut,
                    ..
                } = child
                {
                    return Some(inner_mut);
                }
            }
        }
    }
    None
}

fn find_nuhlpb_folder<'a>(
    root: &'a mut Node,
    ext_by_index: &HashMap<i32, String>,
) -> Option<&'a mut Vec<Node>> {
    let Node::Folder { children, .. } = root else {
        return None;
    };
    for child in children.iter_mut() {
        if let Node::Folder {
            children: inner, ..
        } = child
        {
            let all_nuhlpb = !inner.is_empty()
                && inner.iter().all(|c| {
                    matches!(c, Node::Item { file_index, .. }
                    if ext_by_index.get(file_index).map(String::as_str) == Some(".nuhlpb"))
                });
            if all_nuhlpb {
                if let Node::Folder {
                    children: inner_mut,
                    ..
                } = child
                {
                    return Some(inner_mut);
                }
            }
        }
    }
    None
}

fn stem(filename: &str) -> String {
    match filename.rfind('.') {
        Some(idx) if idx > 0 => filename[..idx].to_string(),
        _ => filename.to_string(),
    }
}

/// Add a whole model from a source folder (numdlb/numshb/nusktb/two numatbs/jnttbl + referenced
/// nutexb files) into the package: copies files into the layout, dedups textures into the shared
/// pool, synthesizes a texture container per numatb, appends the model group with a fresh empty
/// nuhlpb entry, and rewrites the structure JSON.
pub fn add_unit_model_model(
    model_root: &str,
    structure_json_path: Option<&str>,
    source_dir: &str,
) -> Result<UnitModelMutationResult, String> {
    add_unit_model_model_with_options(model_root, structure_json_path, source_dir, true)
}

/// Add a model without synthesizing a NUHLPB. The EXVS common bundle has no
/// NUHLPB branch and owns shell records separately.
pub(crate) fn add_unit_model_model_without_nuhlpb(
    model_root: &str,
    structure_json_path: Option<&str>,
    source_dir: &str,
) -> Result<UnitModelMutationResult, String> {
    add_unit_model_model_with_options(model_root, structure_json_path, source_dir, false)
}

fn add_unit_model_model_with_options(
    model_root: &str,
    structure_json_path: Option<&str>,
    source_dir: &str,
    create_nuhlpb: bool,
) -> Result<UnitModelMutationResult, String> {
    let root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let out_name = root_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid model root: {}", root_path.display()))?
        .to_string();
    let source = scan_source_model(Path::new(source_dir.trim()))?;
    validate_source_model_contents(&source)?;

    let raw = fs::read_to_string(&structure_path).map_err(|e| {
        format!(
            "Failed to read structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let mut value: Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "Failed to parse structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let mut sub_file_data = value
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

    let ext_by_index = build_ext_by_index(&sub_file_data);
    let mut root = parse_root(&sub_file_structure)?;

    // Reject duplicate model name.
    if count_model_named(&root, &source.model_name, &ext_by_index) {
        return Err(format!(
            "A model named '{}' already exists in the package.",
            source.model_name
        ));
    }

    let mut next_file_index = sub_file_data
        .iter()
        .filter_map(|e| e.get("fileIndex").and_then(Value::as_i64))
        .max()
        .unwrap_or(-1) as i32;
    let mut copies: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut tex_index = build_texture_pool_index(&sub_file_data);
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();

    let make_url = |rel: &str| format!(".\\{out_name}\\{}", rel.replace('/', "\\"));
    let model_rel_dir = format!("models\\{}", source.model_name);

    // Helper that copies a model file and registers a fresh pool entry.
    let add_pool_file = |src: &Path,
                         rel_dir: &str,
                         file_type: &str,
                         sub_file_data: &mut Vec<Value>,
                         copies: &mut Vec<(PathBuf, PathBuf)>,
                         next_file_index: &mut i32|
     -> Result<i32, String> {
        let filename = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("Invalid source file: {}", src.display()))?
            .to_string();
        *next_file_index += 1;
        let fi = *next_file_index;
        let url = make_url(&format!("{rel_dir}/{filename}"));
        let dst = root_path.join(rel_dir.replace('\\', "/")).join(&filename);
        copies.push((src.to_path_buf(), dst));
        sub_file_data.push(json!({
            "index": sub_file_data.len(),
            "fileType": file_type,
            "fileIndex": fi,
            "fileUrl": url,
            "fileBaseName": stem(&filename),
        }));
        Ok(fi)
    };

    let nusktb_fi = add_pool_file(
        &source.nusktb,
        &model_rel_dir,
        ".nusktb",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;
    let numshb_fi = add_pool_file(
        &source.numshb,
        &model_rel_dir,
        ".numshb",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;
    let numdlb_fi = add_pool_file(
        &source.numdlb,
        &model_rel_dir,
        ".numdlb",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;
    let jnttbl_fi = add_pool_file(
        &source.jnttbl,
        &model_rel_dir,
        ".jnttbl",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;

    let mut group_children: Vec<Node> = Vec::new();
    group_children.push(Node::Item {
        entry: make_item(nusktb_fi, "10000000", 0, &source.model_name),
        file_index: nusktb_fi,
        name: Some(source.model_name.clone()),
    });

    for numatb_path in &source.numatbs {
        let variant = UNIT_MODEL_BASE_MATERIAL_VARIANT;
        let refs = numatb_texture_refs(numatb_path)?;
        let mut container_children = Vec::new();
        for tex_name in &refs {
            let fi = import_texture_into_pool(
                tex_name,
                Path::new(source_dir.trim()),
                &root_path,
                &json_dir,
                &mut tex_index,
                &mut sub_file_data,
                &mut copies,
                &mut next_file_index,
                &make_url,
            )?;
            container_children.push(Node::Item {
                entry: make_item(fi, "00000000", 0, &stem(tex_name)),
                file_index: fi,
                name: Some(stem(tex_name)),
            });
        }
        group_children.push(Node::Folder {
            entry: make_folder(32, variant),
            children: container_children,
        });
        let numatb_filename = numatb_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("model.numatb");
        let numatb_fi = add_pool_file(
            numatb_path,
            &model_rel_dir,
            ".numatb",
            &mut sub_file_data,
            &mut copies,
            &mut next_file_index,
        )?;
        group_children.push(Node::Item {
            entry: make_item(numatb_fi, "21000000", variant, &stem(numatb_filename)),
            file_index: numatb_fi,
            name: Some(stem(numatb_filename)),
        });
    }

    group_children.push(Node::Item {
        entry: make_item(numshb_fi, "30000000", 0, &source.model_name),
        file_index: numshb_fi,
        name: Some(source.model_name.clone()),
    });
    group_children.push(Node::Item {
        entry: make_item(numdlb_fi, "40000000", 0, &source.model_name),
        file_index: numdlb_fi,
        name: Some(source.model_name.clone()),
    });
    group_children.push(Node::Item {
        entry: make_item(jnttbl_fi, "50000000", 0, &source.model_name),
        file_index: jnttbl_fi,
        name: Some(source.model_name.clone()),
    });

    let model_group = Node::Folder {
        entry: make_folder(0, 0),
        children: group_children,
    };

    // Legacy unit packages receive a fresh empty NUHLPB. The common profile
    // deliberately skips this because its native structure has no NUHLPB branch.
    let mut nuhlpb_node = None;
    let _empty_nuhlpb_dir = if create_nuhlpb {
        let nuhlpb_filename = format!("{}.nuhlpb", source.model_name);
        let nuhlpb_dst = root_path.join("nuhlpb").join(&nuhlpb_filename);
        let temp_dir = tempfile::tempdir()
            .map_err(|e| format!("Failed to create empty NUHLPB temp dir: {e}"))?;
        let nuhlpb_src = temp_dir.path().join(&nuhlpb_filename);
        write_empty_nuhlpb(&nuhlpb_src)?;
        next_file_index += 1;
        let nuhlpb_fi = next_file_index;
        copies.push((nuhlpb_src, nuhlpb_dst));
        sub_file_data.push(json!({
            "index": sub_file_data.len(),
            "fileType": ".nuhlpb",
            "fileIndex": nuhlpb_fi,
            "fileUrl": make_url(&format!("nuhlpb/{nuhlpb_filename}")),
            "fileBaseName": source.model_name,
        }));
        nuhlpb_node = Some(Node::Item {
            entry: make_item(nuhlpb_fi, "00000000", 0, &source.model_name),
            file_index: nuhlpb_fi,
            name: Some(source.model_name.clone()),
        });
        Some(temp_dir)
    } else {
        None
    };

    // Insert into the tree.
    {
        let models = find_models_container(&mut root, &ext_by_index)
            .ok_or_else(|| "Could not locate the models container in the structure.".to_string())?;
        models.push(model_group);
    }
    if let Some(nuhlpb_node) = nuhlpb_node {
        let nuhlpb_folder = find_nuhlpb_folder(&mut root, &ext_by_index)
            .ok_or_else(|| "Could not locate the nuhlpb folder in the structure.".to_string())?;
        nuhlpb_folder.push(nuhlpb_node);
    }

    let mut new_structure = Vec::new();
    serialize_node(&root, &mut new_structure);
    let structure_value = serde_json::to_value(&new_structure)
        .map_err(|e| format!("Failed to serialize SubFileStructure: {e}"))?;

    // Reindex the positional `index` field.
    for (i, entry) in sub_file_data.iter_mut().enumerate() {
        if let Some(obj) = entry.as_object_mut() {
            obj.insert("index".to_string(), json!(i));
        }
    }

    // Count using an ext map that includes the freshly added pool entries.
    let final_ext = build_ext_by_index(&sub_file_data);
    let model_count = count_model_groups(&root, &final_ext);
    let total_files = sub_file_data.len();
    let obj = value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object".to_string())?;
    obj.insert("Fhm2dTotalCount".to_string(), json!(total_files));
    obj.insert("SubFileData".to_string(), Value::Array(sub_file_data));
    obj.insert("SubFileStructure".to_string(), structure_value);

    let serialized = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    let created_files = copy_files_with_rollback(&copies)?;
    if let Err(error) = replace_structure_json(&structure_path, &format!("{serialized}\n")) {
        cleanup_created_files(&created_files);
        return Err(error);
    }

    Ok(UnitModelMutationResult {
        model_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        model_count,
        total_files,
        removed_files: Vec::new(),
    })
}

/// Replace an existing model's geometry/material/skeleton in place from a prepared SSBH folder.
///
/// Reference-safe: the target model's NAME and POSITION (folder_index) are preserved, so every
/// shl/vernier/effect_project reference (by folder_index + name-hash model_id) stays valid. The new
/// numdlb is written as `<oldName>.numdlb` with `model_name = oldName`; the other new files keep
/// their own names (the new numdlb's internal references already point at them). The model's existing
/// NUHLPB is left untouched. Textures are re-deduped into the shared pool and the target's now
/// orphaned textures are dropped. Rollback-safe (old model files are staged aside, new files copied,
/// structure committed atomically; any failure restores the originals).
pub fn replace_unit_model_model(
    model_root: &str,
    structure_json_path: Option<&str>,
    target_model_name: &str,
    source_dir: &str,
) -> Result<UnitModelMutationResult, String> {
    let root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let out_name = root_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid model root: {}", root_path.display()))?
        .to_string();

    let old_name = target_model_name.trim().to_string();
    if old_name.is_empty() {
        return Err("Target model name cannot be empty.".to_string());
    }

    let source = scan_source_model(Path::new(source_dir.trim()))?;
    validate_source_model_contents(&source)?;

    let raw = fs::read_to_string(&structure_path).map_err(|e| {
        format!(
            "Failed to read structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let mut value: Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "Failed to parse structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let mut sub_file_data = value
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

    let ext_by_index = build_ext_by_index(&sub_file_data);
    let mut root = parse_root(&sub_file_structure)?;

    // Locate the target model group's position inside the models container.
    let target_idx = {
        let models = find_models_container(&mut root, &ext_by_index)
            .ok_or_else(|| "Could not locate the models container in the structure.".to_string())?;
        models
            .iter()
            .position(|mg| {
                folder_has_direct_ext(mg, ".numdlb", &ext_by_index)
                    && model_group_name(mg, &ext_by_index).as_deref() == Some(old_name.as_str())
            })
            .ok_or_else(|| format!("Model '{old_name}' was not found in the structure."))?
    };

    // The target group's direct model files (nusktb/numshb/numdlb/jnttbl/numatb) — staged aside on
    // commit so they no longer collide (the new numdlb reuses `<oldName>.numdlb`) and stale files go.
    let old_model_file_urls: Vec<String> = {
        let models = find_models_container(&mut root, &ext_by_index)
            .ok_or_else(|| "Could not locate the models container in the structure.".to_string())?;
        let mut urls = Vec::new();
        if let Node::Folder { children, .. } = &models[target_idx] {
            for child in children {
                if let Node::Item { file_index, .. } = child {
                    if let Some(url) = sub_file_data
                        .iter()
                        .find(|e| {
                            e.get("fileIndex").and_then(Value::as_i64) == Some(*file_index as i64)
                        })
                        .and_then(|e| e.get("fileUrl"))
                        .and_then(Value::as_str)
                    {
                        urls.push(url.to_string());
                    }
                }
            }
        }
        urls
    };

    // Rewrite the new numdlb's identity to the old name (kept as `<oldName>.numdlb`).
    let numdlb_temp = tempfile::tempdir()
        .map_err(|e| format!("Failed to create temp dir for numdlb rewrite: {e}"))?;
    let rewritten_numdlb = numdlb_temp.path().join(format!("{old_name}.numdlb"));
    {
        let mut modl = ModlData::from_file(&source.numdlb)
            .map_err(|e| format!("Failed to read numdlb {}: {e}", source.numdlb.display()))?;
        modl.model_name = old_name.clone();
        modl.write_to_file(&rewritten_numdlb)
            .map_err(|e| format!("Failed to write rewritten numdlb: {e}"))?;
    }

    // Append fresh pool entries + plan copies (under models\<oldName>\), deduping textures.
    let mut next_file_index = sub_file_data
        .iter()
        .filter_map(|e| e.get("fileIndex").and_then(Value::as_i64))
        .max()
        .unwrap_or(-1) as i32;
    let mut copies: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut tex_index = build_texture_pool_index(&sub_file_data);

    let make_url = |rel: &str| format!(".\\{out_name}\\{}", rel.replace('/', "\\"));
    let model_rel_dir = format!("models\\{old_name}");

    let add_pool_file = |src: &Path,
                         rel_dir: &str,
                         file_type: &str,
                         sub_file_data: &mut Vec<Value>,
                         copies: &mut Vec<(PathBuf, PathBuf)>,
                         next_file_index: &mut i32|
     -> Result<i32, String> {
        let filename = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("Invalid source file: {}", src.display()))?
            .to_string();
        *next_file_index += 1;
        let fi = *next_file_index;
        let url = make_url(&format!("{rel_dir}/{filename}"));
        let dst = root_path.join(rel_dir.replace('\\', "/")).join(&filename);
        copies.push((src.to_path_buf(), dst));
        sub_file_data.push(json!({
            "index": sub_file_data.len(),
            "fileType": file_type,
            "fileIndex": fi,
            "fileUrl": url,
            "fileBaseName": stem(&filename),
        }));
        Ok(fi)
    };

    let nusktb_fi = add_pool_file(
        &source.nusktb,
        &model_rel_dir,
        ".nusktb",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;
    let numshb_fi = add_pool_file(
        &source.numshb,
        &model_rel_dir,
        ".numshb",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;
    let numdlb_fi = add_pool_file(
        &rewritten_numdlb,
        &model_rel_dir,
        ".numdlb",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;
    let jnttbl_fi = add_pool_file(
        &source.jnttbl,
        &model_rel_dir,
        ".jnttbl",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;

    let mut group_children: Vec<Node> = Vec::new();
    group_children.push(Node::Item {
        entry: make_item(nusktb_fi, "10000000", 0, &source.model_name),
        file_index: nusktb_fi,
        name: Some(source.model_name.clone()),
    });
    for numatb_path in &source.numatbs {
        let variant = UNIT_MODEL_BASE_MATERIAL_VARIANT;
        let refs = numatb_texture_refs(numatb_path)?;
        let mut container_children = Vec::new();
        for tex_name in &refs {
            let fi = import_texture_into_pool(
                tex_name,
                Path::new(source_dir.trim()),
                &root_path,
                &json_dir,
                &mut tex_index,
                &mut sub_file_data,
                &mut copies,
                &mut next_file_index,
                &make_url,
            )?;
            container_children.push(Node::Item {
                entry: make_item(fi, "00000000", 0, &stem(tex_name)),
                file_index: fi,
                name: Some(stem(tex_name)),
            });
        }
        group_children.push(Node::Folder {
            entry: make_folder(32, variant),
            children: container_children,
        });
        let numatb_filename = numatb_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("model.numatb");
        let numatb_fi = add_pool_file(
            numatb_path,
            &model_rel_dir,
            ".numatb",
            &mut sub_file_data,
            &mut copies,
            &mut next_file_index,
        )?;
        group_children.push(Node::Item {
            entry: make_item(numatb_fi, "21000000", variant, &stem(numatb_filename)),
            file_index: numatb_fi,
            name: Some(stem(numatb_filename)),
        });
    }
    group_children.push(Node::Item {
        entry: make_item(numshb_fi, "30000000", 0, &source.model_name),
        file_index: numshb_fi,
        name: Some(source.model_name.clone()),
    });
    // The numdlb item name carries the model identity (model_group_name + the shl name-hash), so it
    // MUST stay the old name even though the file came from a differently named source folder.
    group_children.push(Node::Item {
        entry: make_item(numdlb_fi, "40000000", 0, &old_name),
        file_index: numdlb_fi,
        name: Some(old_name.clone()),
    });
    group_children.push(Node::Item {
        entry: make_item(jnttbl_fi, "50000000", 0, &source.model_name),
        file_index: jnttbl_fi,
        name: Some(source.model_name.clone()),
    });

    // Swap the target group's children in place, keeping its folder entry + position (folder_index).
    {
        let models = find_models_container(&mut root, &ext_by_index)
            .ok_or_else(|| "Could not locate the models container in the structure.".to_string())?;
        if let Node::Folder { children, .. } = &mut models[target_idx] {
            *children = group_children;
        }
    }

    // Re-serialize and filter SubFileData to referenced indices (drops the old model files and any
    // now-orphaned textures); reindex the positional `index`.
    let mut new_structure = Vec::new();
    serialize_node(&root, &mut new_structure);
    let referenced = collect_referenced_indices(&new_structure);
    let mut removed_files = Vec::new();
    let mut new_sub_file_data: Vec<Value> = Vec::with_capacity(sub_file_data.len());
    for entry in &sub_file_data {
        let file_index = entry
            .get("fileIndex")
            .and_then(Value::as_i64)
            .map(|v| v as i32);
        match file_index {
            Some(idx) if referenced.contains(&idx) => {
                let mut kept = entry.clone();
                if let Some(obj) = kept.as_object_mut() {
                    obj.insert("index".to_string(), json!(new_sub_file_data.len()));
                }
                new_sub_file_data.push(kept);
            }
            _ => {
                if let Some(url) = entry.get("fileUrl").and_then(Value::as_str) {
                    removed_files.push(url.to_string());
                }
            }
        }
    }
    // URLs still referenced after the swap (e.g. the new `<oldName>.numdlb`, which shares the old
    // numdlb URL) must never be deleted even though the OLD entry contributes the same URL.
    let kept_urls: HashSet<String> = new_sub_file_data
        .iter()
        .filter_map(|e| e.get("fileUrl").and_then(Value::as_str))
        .map(|s| s.to_ascii_lowercase())
        .collect();

    let final_ext = build_ext_by_index(&new_sub_file_data);
    let model_count = count_model_groups(&root, &final_ext);

    let structure_value = serde_json::to_value(&new_structure)
        .map_err(|e| format!("Failed to serialize SubFileStructure: {e}"))?;
    {
        let obj = value
            .as_object_mut()
            .ok_or_else(|| "Structure JSON root must be an object".to_string())?;
        obj.insert(
            "Fhm2dTotalCount".to_string(),
            json!(new_sub_file_data.len()),
        );
        obj.insert(
            "SubFileData".to_string(),
            Value::Array(new_sub_file_data.clone()),
        );
        obj.insert("SubFileStructure".to_string(), structure_value);
    }
    let serialized = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;

    // ---- atomic commit (rollback-safe) ----
    let backup_dir =
        tempfile::tempdir().map_err(|e| format!("Failed to create backup temp dir: {e}"))?;
    let mut backups: Vec<(PathBuf, PathBuf)> = Vec::new();
    for url in &old_model_file_urls {
        let cleaned = url.replace('\\', "/");
        let cleaned = cleaned.trim_start_matches("./");
        let orig = json_dir.join(cleaned);
        if orig.is_file() {
            let fname = orig
                .file_name()
                .ok_or_else(|| format!("Invalid old model file path: {}", orig.display()))?
                .to_os_string();
            let bak = backup_dir.path().join(&fname);
            if let Err(e) = fs::rename(&orig, &bak) {
                restore_backups(&backups);
                return Err(format!(
                    "Failed to stage old model file {}: {e}",
                    orig.display()
                ));
            }
            backups.push((orig, bak));
        }
    }
    let created = match copy_files_with_rollback(&copies) {
        Ok(c) => c,
        Err(e) => {
            restore_backups(&backups);
            return Err(e);
        }
    };
    if let Err(error) = replace_structure_json(&structure_path, &format!("{serialized}\n")) {
        cleanup_created_files(&created);
        restore_backups(&backups);
        return Err(error);
    }
    for url in &removed_files {
        if kept_urls.contains(&url.to_ascii_lowercase()) {
            continue;
        }
        delete_pool_file_if_safe(&root_path, &json_dir, url);
    }

    Ok(UnitModelMutationResult {
        model_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        model_count,
        total_files: new_sub_file_data.len(),
        removed_files,
    })
}

fn mesh_object_canonical_identity(name: &str, subindex: u64) -> (String, u64) {
    decode_exported_mesh_object_identity(name, subindex)
}

fn graft_modl_path_envelope(mut source: ModlData, target: &ModlData) -> ModlData {
    source.major_version = target.major_version;
    source.minor_version = target.minor_version;
    source.model_name = target.model_name.clone();
    source.skeleton_file_name = target.skeleton_file_name.clone();
    source.mesh_file_name = target.mesh_file_name.clone();
    source.material_file_names = target.material_file_names.clone();
    source.animation_file_name = target.animation_file_name.clone();
    source
}

/// Replace the target model's `.numshb`, `.numdlb`, and both NUMATB profiles in place.
/// NUSKTB, JNTTBL, NUHLPB, textures, and `_structure.json` stay untouched. NUMDLB keeps the
/// target path envelope (`nusubf/` names, version, animation) and takes mesh/material entries
/// from the source file.
pub fn replace_unit_model_numshb(
    model_root: &str,
    structure_json_path: Option<&str>,
    target_model_name: &str,
    source_dir: &str,
) -> Result<UnitModelMutationResult, String> {
    let located = resolve_target_model_files(model_root, structure_json_path, target_model_name)?;
    let source = scan_mesh_material_source(Path::new(source_dir.trim()))?;
    let target_numdlb = located.numdlb_path.as_ref().ok_or_else(|| {
        format!(
            "Target model '{}' is missing a .numdlb item.",
            located.target.model_name
        )
    })?;
    let (target_maya, target_nust) = split_maya_nust_numatbs(&located.numatb_paths)?;
    let source_modl = ModlData::from_file(&source.numdlb).map_err(|e| {
        format!(
            "Source is not a readable .numdlb ({}): {e}",
            source.numdlb.display()
        )
    })?;
    let target_modl = ModlData::from_file(target_numdlb).map_err(|e| {
        format!(
            "Failed to read target numdlb {}: {e}",
            target_numdlb.display()
        )
    })?;
    MeshData::from_file(&source.numshb).map_err(|e| {
        format!(
            "Source is not a readable .numshb ({}): {e}",
            source.numshb.display()
        )
    })?;
    MatlData::from_file(&source.maya_numatb).map_err(|e| {
        format!(
            "Source is not a readable Maya NUMATB ({}): {e}",
            source.maya_numatb.display()
        )
    })?;
    MatlData::from_file(&source.nust_numatb).map_err(|e| {
        format!(
            "Source is not a readable Nust NUMATB ({}): {e}",
            source.nust_numatb.display()
        )
    })?;

    for dest in [
        &located.numshb_path,
        target_numdlb,
        &target_maya,
        &target_nust,
    ] {
        ensure_path_inside_root(&located.root_path, dest)?;
    }

    let grafted = graft_modl_path_envelope(source_modl, &target_modl);
    let grafted_dir =
        tempfile::tempdir().map_err(|e| format!("Failed to create temp dir for numdlb: {e}"))?;
    let grafted_numdlb = grafted_dir.path().join("grafted.numdlb");
    grafted
        .write_to_file(&grafted_numdlb)
        .map_err(|e| format!("Failed to write grafted numdlb: {e}"))?;

    overwrite_existing_files(&[
        (&source.numshb, &located.numshb_path),
        (&source.maya_numatb, &target_maya),
        (&source.nust_numatb, &target_nust),
        (&grafted_numdlb, target_numdlb),
    ])?;

    Ok(UnitModelMutationResult {
        model_root: located.root_path.to_string_lossy().to_string(),
        structure_json_path: located.structure_path.to_string_lossy().to_string(),
        model_count: located.model_count,
        total_files: located.total_files,
        removed_files: Vec::new(),
    })
}

pub fn preview_unit_model_numshb_replacement(
    model_root: &str,
    structure_json_path: Option<&str>,
    target_model_name: &str,
    source_dir: &str,
) -> Result<UnitModelNumshbReplacePreview, String> {
    let located = resolve_target_model_files(model_root, structure_json_path, target_model_name)?;
    let source = scan_mesh_material_source(Path::new(source_dir.trim()))?;
    let source_mesh = MeshData::from_file(&source.numshb).map_err(|e| {
        format!(
            "Source is not a readable .numshb ({}): {e}",
            source.numshb.display()
        )
    })?;
    let source_modl = ModlData::from_file(&source.numdlb).map_err(|e| {
        format!(
            "Source is not a readable .numdlb ({}): {e}",
            source.numdlb.display()
        )
    })?;
    MatlData::from_file(&source.maya_numatb).map_err(|e| {
        format!(
            "Source is not a readable Maya NUMATB ({}): {e}",
            source.maya_numatb.display()
        )
    })?;
    MatlData::from_file(&source.nust_numatb).map_err(|e| {
        format!(
            "Source is not a readable Nust NUMATB ({}): {e}",
            source.nust_numatb.display()
        )
    })?;

    let mut blockers = Vec::new();
    let target_numdlb = match located.numdlb_path.as_ref() {
        Some(path) => path,
        None => {
            blockers.push(format!(
                "Target model '{}' is missing a .numdlb item.",
                located.target.model_name
            ));
            return Ok(empty_mesh_material_preview(
                &located,
                &source,
                source_mesh,
                Vec::new(),
                blockers,
            ));
        }
    };
    let (target_maya, target_nust) = match split_maya_nust_numatbs(&located.numatb_paths) {
        Ok(pair) => pair,
        Err(error) => {
            blockers.push(error);
            return Ok(empty_mesh_material_preview(
                &located,
                &source,
                source_mesh,
                Vec::new(),
                blockers,
            ));
        }
    };

    let source_objects: Vec<UnitModelMeshObjectRef> = source_mesh
        .objects
        .iter()
        .map(|object| UnitModelMeshObjectRef {
            name: object.name.clone(),
            subindex: object.subindex,
        })
        .collect();
    let target_numdlb_entries = {
        let modl = ModlData::from_file(target_numdlb)
            .map_err(|e| format!("Failed to read target numdlb {}: {e}", target_numdlb.display()))?;
        modl.entries
            .into_iter()
            .map(|entry| UnitModelNumdlbEntryRef {
                name: entry.mesh_object_name,
                subindex: entry.mesh_object_subindex,
                material_label: entry.material_label,
            })
            .collect::<Vec<_>>()
    };
    let source_keys: HashSet<(String, u64)> = source_objects
        .iter()
        .map(|object| mesh_object_canonical_identity(&object.name, object.subindex))
        .collect();
    let target_keys: HashSet<(String, u64)> = target_numdlb_entries
        .iter()
        .map(|entry| mesh_object_canonical_identity(&entry.name, entry.subindex))
        .collect();
    let source_modl_keys: HashSet<(String, u64)> = source_modl
        .entries
        .iter()
        .map(|entry| {
            mesh_object_canonical_identity(&entry.mesh_object_name, entry.mesh_object_subindex)
        })
        .collect();
    let kept: Vec<UnitModelMeshObjectRef> = source_objects
        .iter()
        .filter(|object| {
            target_keys.contains(&mesh_object_canonical_identity(&object.name, object.subindex))
        })
        .cloned()
        .collect();
    let new_in_source: Vec<UnitModelMeshObjectRef> = source_objects
        .iter()
        .filter(|object| {
            !target_keys.contains(&mesh_object_canonical_identity(&object.name, object.subindex))
        })
        .cloned()
        .collect();
    let missing_in_source: Vec<UnitModelMeshObjectRef> = target_numdlb_entries
        .iter()
        .filter(|entry| {
            !source_keys.contains(&mesh_object_canonical_identity(&entry.name, entry.subindex))
        })
        .map(|entry| UnitModelMeshObjectRef {
            name: entry.name.clone(),
            subindex: entry.subindex,
        })
        .collect();

    let source_influence_bones = collect_mesh_influence_bones(&source_mesh);
    let mut warnings = Vec::new();
    let target_bone_names = match located.nusktb_path.as_ref() {
        Some(path) => read_skel_bone_names(path)?,
        None => {
            blockers.push(
                "Target model is missing a .nusktb; mesh-and-material replace keeps the existing skeleton.".to_string(),
            );
            Vec::new()
        }
    };
    let target_bone_keys: HashSet<String> = target_bone_names
        .iter()
        .map(|name| name.to_ascii_lowercase())
        .collect();
    let missing_in_target_skeleton: Vec<String> = source_influence_bones
        .iter()
        .filter(|name| !target_bone_keys.contains(&name.to_ascii_lowercase()))
        .cloned()
        .collect();
    let matching_bone_names = source_influence_bones.len() - missing_in_target_skeleton.len();
    let (source_skel_bone_count, matching_skel_bone_names) = match source.nusktb.as_ref() {
        Some(path) => {
            let names = read_skel_bone_names(path)?;
            let source_keys: HashSet<String> = names
                .iter()
                .map(|name| name.to_ascii_lowercase())
                .collect();
            let matching = source_keys.intersection(&target_bone_keys).count();
            (Some(names.len()), Some(matching))
        }
        None => (None, None),
    };

    for dest in [
        &located.numshb_path,
        target_numdlb,
        &target_maya,
        &target_nust,
    ] {
        if let Err(error) = ensure_path_inside_root(&located.root_path, dest) {
            blockers.push(error);
        }
    }
    if source_objects.is_empty() {
        warnings.push("Source NUMSHB contains no mesh objects.".to_string());
    }
    if source_modl_keys != source_keys {
        warnings.push(
            "Source NUMDLB entries do not match source NUMSHB mesh objects.".to_string(),
        );
    }
    if !missing_in_source.is_empty() || !new_in_source.is_empty() {
        warnings.push(format!(
            "Mesh objects differ from the current NUMDLB entries: {} missing in source, {} new in source.",
            missing_in_source.len(),
            new_in_source.len()
        ));
    }
    if !missing_in_target_skeleton.is_empty() {
        warnings.push(format!(
            "{} skin bone name(s) in the source NUMSHB are not in the target NUSKTB.",
            missing_in_target_skeleton.len()
        ));
    }
    let mut texture_refs = numatb_texture_refs(&source.maya_numatb)?;
    for reference in numatb_texture_refs(&source.nust_numatb)? {
        if !texture_refs
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(&reference))
        {
            texture_refs.push(reference);
        }
    }
    let missing_textures: Vec<&String> = texture_refs
        .iter()
        .filter(|reference| !located.texture_pool.contains_key(*reference))
        .collect();
    if !missing_textures.is_empty() {
        warnings.push(format!(
            "{} texture reference(s) in the source NUMATB files are not in the package pool.",
            missing_textures.len()
        ));
    }

    Ok(UnitModelNumshbReplacePreview {
        target: located.target.clone(),
        source_dir: path_to_string(source.dir.clone()),
        source_numshb_path: path_to_string(source.numshb.clone()),
        source_numdlb_path: path_to_string(source.numdlb.clone()),
        source_maya_numatb_path: path_to_string(source.maya_numatb.clone()),
        source_nust_numatb_path: path_to_string(source.nust_numatb.clone()),
        target_numshb_path: path_to_string(located.numshb_path.clone()),
        target_numdlb_path: path_to_string(target_numdlb.clone()),
        target_maya_numatb_path: path_to_string(target_maya),
        target_nust_numatb_path: path_to_string(target_nust),
        mesh_objects: UnitModelNumshbObjectCompatibility {
            source: source_objects,
            target_numdlb_entries,
            kept,
            missing_in_source,
            new_in_source,
        },
        skeleton: UnitModelNumshbSkeletonCompatibility {
            source_influence_bones,
            target_bone_names,
            matching_bone_names,
            missing_in_target_skeleton,
            source_skel_bone_count,
            matching_skel_bone_names,
        },
        stats: collect_numshb_stats(&source_mesh),
        warnings,
        blockers,
    })
}

fn empty_mesh_material_preview(
    located: &LocatedTargetModel,
    source: &MeshMaterialSource,
    source_mesh: MeshData,
    extra_warnings: Vec<String>,
    blockers: Vec<String>,
) -> UnitModelNumshbReplacePreview {
    let source_objects: Vec<UnitModelMeshObjectRef> = source_mesh
        .objects
        .iter()
        .map(|object| UnitModelMeshObjectRef {
            name: object.name.clone(),
            subindex: object.subindex,
        })
        .collect();
    UnitModelNumshbReplacePreview {
        target: located.target.clone(),
        source_dir: path_to_string(source.dir.clone()),
        source_numshb_path: path_to_string(source.numshb.clone()),
        source_numdlb_path: path_to_string(source.numdlb.clone()),
        source_maya_numatb_path: path_to_string(source.maya_numatb.clone()),
        source_nust_numatb_path: path_to_string(source.nust_numatb.clone()),
        target_numshb_path: path_to_string(located.numshb_path.clone()),
        target_numdlb_path: located
            .numdlb_path
            .as_ref()
            .map(|path| path_to_string(path.clone()))
            .unwrap_or_default(),
        target_maya_numatb_path: String::new(),
        target_nust_numatb_path: String::new(),
        mesh_objects: UnitModelNumshbObjectCompatibility {
            source: source_objects,
            target_numdlb_entries: Vec::new(),
            kept: Vec::new(),
            missing_in_source: Vec::new(),
            new_in_source: Vec::new(),
        },
        skeleton: UnitModelNumshbSkeletonCompatibility {
            source_influence_bones: collect_mesh_influence_bones(&source_mesh),
            target_bone_names: Vec::new(),
            matching_bone_names: 0,
            missing_in_target_skeleton: Vec::new(),
            source_skel_bone_count: None,
            matching_skel_bone_names: None,
        },
        stats: collect_numshb_stats(&source_mesh),
        warnings: extra_warnings,
        blockers,
    }
}

struct LocatedTargetModel {
    root_path: PathBuf,
    structure_path: PathBuf,
    model_count: usize,
    total_files: usize,
    numshb_path: PathBuf,
    numdlb_path: Option<PathBuf>,
    nusktb_path: Option<PathBuf>,
    numatb_paths: Vec<PathBuf>,
    texture_pool: HashMap<String, i32>,
    target: UnitModelReplaceTargetPreview,
}

struct MeshMaterialSource {
    dir: PathBuf,
    numdlb: PathBuf,
    numshb: PathBuf,
    maya_numatb: PathBuf,
    nust_numatb: PathBuf,
    nusktb: Option<PathBuf>,
}

fn resolve_target_model_files(
    model_root: &str,
    structure_json_path: Option<&str>,
    target_model_name: &str,
) -> Result<LocatedTargetModel, String> {
    let root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let target_name = target_model_name.trim().to_string();
    if target_name.is_empty() {
        return Err("Target model name cannot be empty.".to_string());
    }

    let raw = fs::read_to_string(&structure_path).map_err(|e| {
        format!(
            "Failed to read structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let value: Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "Failed to parse structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
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
    let ext_by_index = build_ext_by_index(&sub_file_data);
    let mut root = parse_root(&sub_file_structure)?;
    let model_count = count_model_groups(&root, &ext_by_index);
    let (model_index, target_files) = {
        let models = find_models_container(&mut root, &ext_by_index)
            .ok_or_else(|| "Could not locate the models container in the structure.".to_string())?;
        let index = models
            .iter()
            .position(|mg| {
                folder_has_direct_ext(mg, ".numdlb", &ext_by_index)
                    && model_group_name(mg, &ext_by_index).as_deref() == Some(target_name.as_str())
            })
            .ok_or_else(|| format!("Model '{target_name}' was not found in the structure."))?;
        let group = &models[index];
        (index, direct_file_indices_by_ext(group, &ext_by_index))
    };

    let numdlb_path = first_path_for_ext(&target_files, ".numdlb", &sub_file_data, &json_dir);
    let numshb_path = first_path_for_ext(&target_files, ".numshb", &sub_file_data, &json_dir)
        .ok_or_else(|| format!("Target model '{target_name}' is missing a .numshb item."))?;
    let nusktb_path = first_path_for_ext(&target_files, ".nusktb", &sub_file_data, &json_dir);
    let jnttbl_path = first_path_for_ext(&target_files, ".jnttbl", &sub_file_data, &json_dir);
    let numatb_paths = paths_for_ext(&target_files, ".numatb", &sub_file_data, &json_dir);
    let nuhlpb_path = find_named_nuhlpb_path(
        &root,
        &ext_by_index,
        &sub_file_data,
        &json_dir,
        &target_name,
    );
    if !numshb_path.is_file() {
        return Err(format!(
            "Target .numshb does not exist on disk: {}",
            numshb_path.display()
        ));
    }
    let texture_pool = texture_index_by_name(&sub_file_data);

    Ok(LocatedTargetModel {
        root_path,
        structure_path,
        model_count,
        total_files: sub_file_data.len(),
        numshb_path: numshb_path.clone(),
        numdlb_path: numdlb_path.clone(),
        nusktb_path: nusktb_path.clone(),
        numatb_paths: numatb_paths.clone(),
        texture_pool,
        target: UnitModelReplaceTargetPreview {
            model_name: target_name,
            model_index,
            numdlb_path: numdlb_path.map(path_to_string),
            numshb_path: Some(path_to_string(numshb_path)),
            nusktb_path: nusktb_path.map(path_to_string),
            jnttbl_path: jnttbl_path.map(path_to_string),
            numatb_paths: numatb_paths.into_iter().map(path_to_string).collect(),
            nuhlpb_path: nuhlpb_path.map(path_to_string),
        },
    })
}

fn scan_mesh_material_source(source_dir: &Path) -> Result<MeshMaterialSource, String> {
    if !source_dir.is_dir() {
        return Err(format!(
            "Source folder is not a directory: {}",
            source_dir.display()
        ));
    }
    let mut by_extension: HashMap<String, Vec<PathBuf>> = HashMap::new();
    for entry in fs::read_dir(source_dir).map_err(|e| {
        format!(
            "Failed to read source dir {}: {e}",
            source_dir.display()
        )
    })? {
        let path = entry
            .map_err(|e| format!("Failed to read source entry: {e}"))?
            .path();
        if !path.is_file() {
            continue;
        }
        let extension = ext_lower(&path);
        if matches!(extension.as_str(), ".numdlb" | ".numshb" | ".nusktb" | ".numatb") {
            by_extension.entry(extension).or_default().push(path);
        }
    }
    let exactly_one = |extension: &str| -> Result<PathBuf, String> {
        let files = by_extension
            .get(extension)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        match files {
            [file] => Ok(file.clone()),
            [] => Err(format!(
                "Source folder is missing the required {extension} file."
            )),
            _ => Err(format!(
                "Source folder must contain exactly one {extension} file, found {}.",
                files.len()
            )),
        }
    };
    let numdlb = exactly_one(".numdlb")?;
    let numshb = exactly_one(".numshb")?;
    let numatbs = by_extension.get(".numatb").cloned().unwrap_or_default();
    let (maya_numatb, nust_numatb) = split_maya_nust_numatbs(&numatbs)?;
    let nusktb = match by_extension.get(".nusktb").map(Vec::as_slice).unwrap_or(&[]) {
        [file] => Some(file.clone()),
        _ => None,
    };
    Ok(MeshMaterialSource {
        dir: source_dir.to_path_buf(),
        numdlb,
        numshb,
        maya_numatb,
        nust_numatb,
        nusktb,
    })
}

fn numatb_profile_tag(path: &Path) -> Option<&'static str> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if name.contains("__maya__") {
        Some("maya")
    } else if name.contains("__nust__") {
        Some("nust")
    } else {
        None
    }
}

fn split_maya_nust_numatbs(paths: &[PathBuf]) -> Result<(PathBuf, PathBuf), String> {
    let mut maya = None;
    let mut nust = None;
    for path in paths {
        match numatb_profile_tag(path) {
            Some("maya") => {
                if maya.is_some() {
                    return Err(
                        "Expected exactly one __maya__.numatb, found more than one.".to_string()
                    );
                }
                maya = Some(path.clone());
            }
            Some("nust") => {
                // Numbered NUST variants belong to special material states. Mesh replacement
                // only changes the base pair, preserving every target variant in place.
                let stem = path.file_stem().and_then(|name| name.to_str())
                    .unwrap_or("").to_ascii_lowercase();
                if stem.strip_suffix("__nust__")
                    .and_then(|base| base.rsplit_once("_m"))
                    .is_some_and(|(_, index)| index.len() >= 3 && index.bytes().all(|b| b.is_ascii_digit()))
                {
                    continue;
                }
                if nust.is_some() {
                    return Err(
                        "Expected exactly one __nust__.numatb, found more than one.".to_string()
                    );
                }
                nust = Some(path.clone());
            }
            Some(_) => {}
            None => {
                return Err(format!(
                    "Cannot classify NUMATB profile from filename: {}",
                    path.display()
                ));
            }
        }
    }
    match (maya, nust) {
        (Some(maya), Some(nust)) => Ok((maya, nust)),
        _ => Err(
            "Need exactly one __maya__.numatb and one __nust__.numatb.".to_string(),
        ),
    }
}

fn ensure_path_inside_root(root: &Path, candidate: &Path) -> Result<(), String> {
    let root_canon = fs::canonicalize(root)
        .map_err(|e| format!("Failed to resolve unit model root {}: {e}", root.display()))?;
    let candidate_canon = fs::canonicalize(candidate)
        .map_err(|e| format!("Failed to resolve target path {}: {e}", candidate.display()))?;
    if !candidate_canon.starts_with(&root_canon) {
        return Err(format!(
            "Target file {} is outside the unit model root.",
            candidate.display()
        ));
    }
    Ok(())
}

fn overwrite_existing_files(pairs: &[(&Path, &Path)]) -> Result<(), String> {
    let mut backups: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (source, dest) in pairs {
        if paths_are_same_file(source, dest) {
            continue;
        }
        if !dest.is_file() {
            restore_overwrite_backups(&backups);
            return Err(format!(
                "Target file does not exist and cannot be overwritten: {}",
                dest.display()
            ));
        }
        let dest_name = dest
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| format!("Invalid target path: {}", dest.display()))?;
        let backup = dest.with_file_name(format!("{dest_name}.replace-bak"));
        if backup.exists() {
            if let Err(error) = fs::remove_file(&backup) {
                restore_overwrite_backups(&backups);
                return Err(format!(
                    "Failed to remove leftover backup {}: {error}",
                    backup.display()
                ));
            }
        }
        if let Err(error) = fs::rename(dest, &backup) {
            restore_overwrite_backups(&backups);
            return Err(format!(
                "Failed to stage existing file {}: {error}",
                dest.display()
            ));
        }
        backups.push((dest.to_path_buf(), backup.clone()));
        if let Err(error) = fs::copy(source, dest) {
            restore_overwrite_backups(&backups);
            return Err(format!(
                "Failed to copy {} -> {}: {error}",
                source.display(),
                dest.display()
            ));
        }
    }
    for (_, backup) in &backups {
        if let Err(error) = fs::remove_file(backup) {
            return Err(format!(
                "Files replaced but failed to delete backup {}: {error}",
                backup.display()
            ));
        }
    }
    Ok(())
}

fn restore_overwrite_backups(backups: &[(PathBuf, PathBuf)]) {
    for (dest, backup) in backups.iter().rev() {
        if dest.exists() {
            let _ = fs::remove_file(dest);
        }
        let _ = fs::rename(backup, dest);
    }
}

fn paths_are_same_file(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(a), Ok(b)) => a == b,
        _ => left == right,
    }
}

fn collect_mesh_influence_bones(mesh: &MeshData) -> Vec<String> {
    let mut names = Vec::new();
    let mut seen = HashSet::new();
    for object in &mesh.objects {
        for influence in &object.bone_influences {
            if seen.insert(influence.bone_name.clone()) {
                names.push(influence.bone_name.clone());
            }
        }
        if !object.parent_bone_name.is_empty() && seen.insert(object.parent_bone_name.clone()) {
            names.push(object.parent_bone_name.clone());
        }
    }
    names
}

fn collect_numshb_stats(mesh: &MeshData) -> UnitModelNumshbStats {
    use ssbh_data::mesh_data::VectorData;
    let mut source_vertex_count = 0usize;
    let mut source_triangle_count = 0usize;
    for object in &mesh.objects {
        source_vertex_count += object
            .positions
            .first()
            .map(|attribute| match &attribute.data {
                VectorData::Vector2(values) => values.len(),
                VectorData::Vector3(values) => values.len(),
                VectorData::Vector4(values) => values.len(),
            })
            .unwrap_or(0);
        source_triangle_count += object.vertex_indices.len() / 3;
    }
    UnitModelNumshbStats {
        source_object_count: mesh.objects.len(),
        source_vertex_count,
        source_triangle_count,
    }
}

fn restore_backups(backups: &[(PathBuf, PathBuf)]) {
    for (orig, bak) in backups {
        let _ = fs::rename(bak, orig);
    }
}

fn write_empty_nuhlpb(path: &Path) -> Result<(), String> {
    let hlpb = HlpbData {
        major_version: 1,
        minor_version: 1,
        aim_constraints: Vec::new(),
        orient_constraints: Vec::new(),
    };
    hlpb.write_to_file(path)
        .map_err(|e| format!("Failed to write empty NUHLPB {}: {e}", path.display()))
}

fn copy_files_with_rollback(copies: &[(PathBuf, PathBuf)]) -> Result<Vec<PathBuf>, String> {
    let mut destinations = HashSet::new();
    for (source, destination) in copies {
        if !source.is_file() {
            return Err(format!("Source file does not exist: {}", source.display()));
        }
        let key = destination.to_string_lossy().to_ascii_lowercase();
        if !destinations.insert(key) {
            return Err(format!(
                "Multiple imported files resolve to the same destination: {}",
                destination.display()
            ));
        }
        if destination.exists() {
            return Err(format!(
                "Import destination already exists and will not be overwritten: {}",
                destination.display()
            ));
        }
    }

    let mut created_files = Vec::new();
    for (source, destination) in copies {
        if let Some(parent) = destination.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                cleanup_created_files(&created_files);
                return Err(format!("Failed to create {}: {error}", parent.display()));
            }
        }
        if let Err(error) = fs::copy(source, destination) {
            cleanup_created_files(&created_files);
            return Err(format!(
                "Failed to copy {} -> {}: {error}",
                source.display(),
                destination.display()
            ));
        }
        created_files.push(destination.clone());
    }
    Ok(created_files)
}

fn replace_structure_json(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Structure JSON has no parent directory: {}", path.display()))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|e| format!("Failed to create structure JSON temp file: {e}"))?;
    temp.write_all(contents.as_bytes())
        .map_err(|e| format!("Failed to write structure JSON temp file: {e}"))?;
    temp.flush()
        .map_err(|e| format!("Failed to flush structure JSON temp file: {e}"))?;
    let (_, temp_path) = temp
        .keep()
        .map_err(|e| format!("Failed to preserve structure JSON temp file: {e}"))?;
    let backup_path = parent.join(format!(
        ".{}.unit-model-import-backup",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("structure.json")
    ));
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

fn cleanup_created_files(files: &[PathBuf]) {
    for path in files.iter().rev() {
        let _ = fs::remove_file(path);
    }
}

fn count_model_named(root: &Node, model_name: &str, ext_by_index: &HashMap<i32, String>) -> bool {
    fn walk(node: &Node, name: &str, ext: &HashMap<i32, String>) -> bool {
        match node {
            Node::Item { .. } => false,
            Node::Folder { children, .. } => {
                if folder_has_direct_ext(node, ".numdlb", ext)
                    && model_group_name(node, ext).as_deref() == Some(name)
                {
                    return true;
                }
                children.iter().any(|c| walk(c, name, ext))
            }
        }
    }
    walk(root, model_name, ext_by_index)
}

fn build_ext_by_index(sub_file_data: &[Value]) -> std::collections::HashMap<i32, String> {
    let mut map = std::collections::HashMap::new();
    for entry in sub_file_data {
        let Some(idx) = entry.get("fileIndex").and_then(Value::as_i64) else {
            continue;
        };
        let url = entry.get("fileUrl").and_then(Value::as_str).unwrap_or("");
        let ft = entry.get("fileType").and_then(Value::as_str).unwrap_or("");
        map.insert(idx as i32, extension_of(ft, url));
    }
    map
}

fn extension_of(file_type: &str, file_url: &str) -> String {
    let name = file_basename(file_url);
    if let Some(idx) = name.rfind('.') {
        return name[idx..].to_ascii_lowercase();
    }
    let ft = file_type.trim().to_ascii_lowercase();
    if ft.starts_with('.') {
        return ft;
    }
    String::new()
}

fn file_basename(file_url: &str) -> String {
    file_url
        .replace('/', "\\")
        .split('\\')
        .filter(|s| !s.is_empty() && *s != ".")
        .last()
        .unwrap_or(file_url)
        .to_string()
}

fn direct_file_indices_by_ext(
    node: &Node,
    ext_by_index: &HashMap<i32, String>,
) -> HashMap<String, Vec<i32>> {
    let mut out: HashMap<String, Vec<i32>> = HashMap::new();
    let Node::Folder { children, .. } = node else {
        return out;
    };
    for child in children {
        let Node::Item { file_index, .. } = child else {
            continue;
        };
        if let Some(ext) = ext_by_index.get(file_index) {
            out.entry(ext.clone()).or_default().push(*file_index);
        }
    }
    out
}

fn count_texture_references_in_node(
    node: &Node,
    ext_by_index: &HashMap<i32, String>,
) -> HashMap<i32, usize> {
    fn walk(node: &Node, ext_by_index: &HashMap<i32, String>, out: &mut HashMap<i32, usize>) {
        match node {
            Node::Item { file_index, .. } => {
                if ext_by_index.get(file_index).map(String::as_str) == Some(".nutexb") {
                    *out.entry(*file_index).or_insert(0) += 1;
                }
            }
            Node::Folder { children, .. } => {
                for child in children {
                    walk(child, ext_by_index, out);
                }
            }
        }
    }
    let mut out = HashMap::new();
    walk(node, ext_by_index, &mut out);
    out
}

fn count_references_by_index(root: &Node) -> HashMap<i32, usize> {
    fn walk(node: &Node, out: &mut HashMap<i32, usize>) {
        match node {
            Node::Item { file_index, .. } => {
                *out.entry(*file_index).or_insert(0) += 1;
            }
            Node::Folder { children, .. } => {
                for child in children {
                    walk(child, out);
                }
            }
        }
    }
    let mut out = HashMap::new();
    walk(root, &mut out);
    out
}

fn first_path_for_ext(
    direct_files: &HashMap<String, Vec<i32>>,
    ext: &str,
    sub_file_data: &[Value],
    json_dir: &Path,
) -> Option<PathBuf> {
    direct_files
        .get(ext)
        .and_then(|indices| indices.first())
        .and_then(|file_index| path_for_index(sub_file_data, *file_index, json_dir))
}

fn paths_for_ext(
    direct_files: &HashMap<String, Vec<i32>>,
    ext: &str,
    sub_file_data: &[Value],
    json_dir: &Path,
) -> Vec<PathBuf> {
    direct_files
        .get(ext)
        .into_iter()
        .flat_map(|indices| indices.iter())
        .filter_map(|file_index| path_for_index(sub_file_data, *file_index, json_dir))
        .collect()
}

fn path_for_index(sub_file_data: &[Value], file_index: i32, json_dir: &Path) -> Option<PathBuf> {
    file_url_for_index(sub_file_data, file_index)
        .map(|file_url| resolve_pool_file_path(json_dir, &file_url))
}

fn file_url_for_index(sub_file_data: &[Value], file_index: i32) -> Option<String> {
    sub_file_data
        .iter()
        .find(|entry| entry.get("fileIndex").and_then(Value::as_i64) == Some(file_index as i64))
        .and_then(|entry| entry.get("fileUrl"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn resolve_pool_file_path(json_dir: &Path, file_url: &str) -> PathBuf {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    json_dir.join(cleaned)
}

fn find_named_nuhlpb_path(
    root: &Node,
    ext_by_index: &HashMap<i32, String>,
    sub_file_data: &[Value],
    json_dir: &Path,
    target_name: &str,
) -> Option<PathBuf> {
    fn walk(
        node: &Node,
        ext_by_index: &HashMap<i32, String>,
        sub_file_data: &[Value],
        json_dir: &Path,
        target_name: &str,
    ) -> Option<PathBuf> {
        match node {
            Node::Item {
                file_index, name, ..
            } => {
                let is_nuhlpb = ext_by_index.get(file_index).map(String::as_str) == Some(".nuhlpb");
                if is_nuhlpb && name.as_deref() == Some(target_name) {
                    path_for_index(sub_file_data, *file_index, json_dir)
                } else {
                    None
                }
            }
            Node::Folder { children, .. } => children
                .iter()
                .find_map(|child| walk(child, ext_by_index, sub_file_data, json_dir, target_name)),
        }
    }
    walk(root, ext_by_index, sub_file_data, json_dir, target_name)
}

fn read_skel_bone_names(path: &Path) -> Result<Vec<String>, String> {
    let skel = SkelData::from_file(path)
        .map_err(|e| format!("Failed to parse nusktb {}: {e}", path.display()))?;
    Ok(skel.bones.into_iter().map(|bone| bone.name).collect())
}

fn read_jnttbl_bone_count(path: &Path) -> Result<u32, String> {
    let bytes =
        fs::read(path).map_err(|e| format!("Failed to read jnttbl {}: {e}", path.display()))?;
    Ok(parse_jnttbl_bytes(&bytes)
        .map_err(|e| format!("Failed to parse jnttbl {}: {e}", path.display()))?
        .bone_count)
}

fn material_labels_from_numatbs(paths: &[PathBuf]) -> Result<Vec<String>, String> {
    let mut labels = Vec::new();
    let mut seen = HashSet::new();
    for path in paths {
        let matl = MatlData::from_file(path)
            .map_err(|e| format!("Failed to parse numatb {}: {e}", path.display()))?;
        for entry in matl.entries {
            let label = entry.material_label.trim().to_string();
            if !label.is_empty() && seen.insert(label.to_ascii_lowercase()) {
                labels.push(label);
            }
        }
    }
    Ok(labels)
}

fn compare_bone_names(
    source_bone_names: &[String],
    target_bone_names: &[String],
) -> UnitModelSkeletonCompatibility {
    let source_keys: HashSet<String> = source_bone_names
        .iter()
        .map(|name| name.to_ascii_lowercase())
        .collect();
    let target_keys: HashSet<String> = target_bone_names
        .iter()
        .map(|name| name.to_ascii_lowercase())
        .collect();
    let missing_in_source = target_bone_names
        .iter()
        .filter(|name| !source_keys.contains(&name.to_ascii_lowercase()))
        .cloned()
        .collect::<Vec<_>>();
    let new_in_source = source_bone_names
        .iter()
        .filter(|name| !target_keys.contains(&name.to_ascii_lowercase()))
        .cloned()
        .collect::<Vec<_>>();
    UnitModelSkeletonCompatibility {
        source_bone_count: source_bone_names.len(),
        target_bone_count: target_bone_names.len(),
        matching_bone_names: target_bone_names
            .len()
            .saturating_sub(missing_in_source.len()),
        missing_in_source,
        new_in_source,
    }
}

fn diff_ordered_labels(
    target: &[String],
    source: &[String],
) -> (Vec<String>, Vec<String>, Vec<String>) {
    let target_keys: HashSet<String> = target
        .iter()
        .map(|label| label.to_ascii_lowercase())
        .collect();
    let source_keys: HashSet<String> = source
        .iter()
        .map(|label| label.to_ascii_lowercase())
        .collect();
    let kept = target
        .iter()
        .filter(|label| source_keys.contains(&label.to_ascii_lowercase()))
        .cloned()
        .collect();
    let removed = target
        .iter()
        .filter(|label| !source_keys.contains(&label.to_ascii_lowercase()))
        .cloned()
        .collect();
    let added = source
        .iter()
        .filter(|label| !target_keys.contains(&label.to_ascii_lowercase()))
        .cloned()
        .collect();
    (kept, removed, added)
}

fn texture_index_by_name(sub_file_data: &[Value]) -> HashMap<String, i32> {
    sub_file_data
        .iter()
        .filter(|entry| {
            entry
                .get("fileUrl")
                .and_then(Value::as_str)
                .map(|url| file_basename(url).to_ascii_lowercase().ends_with(".nutexb"))
                .unwrap_or(false)
        })
        .filter_map(|entry| {
            let idx = entry.get("fileIndex").and_then(Value::as_i64)? as i32;
            let url = entry.get("fileUrl").and_then(Value::as_str)?;
            Some((normalize_texture_filename(url), idx))
        })
        .collect()
}

fn build_replace_texture_plan(
    source_path: &Path,
    references: &[String],
    texture_index: &HashMap<String, i32>,
) -> UnitModelReplaceTexturePlan {
    let mut copied_from_source = Vec::new();
    let mut reused_from_pool = Vec::new();
    let mut missing = Vec::new();
    for reference in references {
        let key = normalize_texture_filename(reference);
        if texture_index.contains_key(&key) {
            reused_from_pool.push(reference.clone());
        } else if source_path.join(reference).is_file() {
            copied_from_source.push(reference.clone());
        } else {
            missing.push(reference.clone());
        }
    }
    UnitModelReplaceTexturePlan {
        referenced: references.to_vec(),
        copied_from_source,
        reused_from_pool,
        missing,
        orphaned_after_replace: Vec::new(),
    }
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}

fn tokenize(entries: &[SubFileStructureEntry]) -> Vec<Tok> {
    let mut out = Vec::with_capacity(entries.len());
    for entry in entries {
        match entry {
            SubFileStructureEntry::Folder { .. } => out.push(Tok::Folder(entry.clone())),
            SubFileStructureEntry::Item {
                file_index,
                display_name,
                ..
            } => out.push(Tok::Item(entry.clone(), *file_index, display_name.clone())),
            SubFileStructureEntry::EndMark { end_mark_count } => {
                for _ in 0..(*end_mark_count).max(0) {
                    out.push(Tok::End);
                }
            }
        }
    }
    out
}

fn parse_root(entries: &[SubFileStructureEntry]) -> Result<Node, String> {
    let toks = tokenize(entries);
    let mut cursor = 0usize;
    let mut top = parse_level(&toks, &mut cursor);
    if top.len() != 1 {
        return Err(format!(
            "Expected a single root folder in SubFileStructure, found {}",
            top.len()
        ));
    }
    match top.pop().unwrap() {
        node @ Node::Folder { .. } => Ok(node),
        Node::Item { .. } => Err("Root of SubFileStructure is not a folder".to_string()),
    }
}

fn parse_level(toks: &[Tok], cursor: &mut usize) -> Vec<Node> {
    let mut out = Vec::new();
    while *cursor < toks.len() {
        match &toks[*cursor] {
            Tok::Folder(entry) => {
                let entry = entry.clone();
                *cursor += 1;
                let children = parse_level(toks, cursor);
                out.push(Node::Folder { entry, children });
            }
            Tok::Item(entry, file_index, name) => {
                out.push(Node::Item {
                    entry: entry.clone(),
                    file_index: *file_index,
                    name: name.clone(),
                });
                *cursor += 1;
            }
            Tok::End => {
                *cursor += 1;
                return out;
            }
        }
    }
    out
}

fn serialize_node(node: &Node, out: &mut Vec<SubFileStructureEntry>) {
    match node {
        Node::Item { entry, .. } => out.push(entry.clone()),
        Node::Folder { entry, children } => {
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

fn collect_referenced_indices(entries: &[SubFileStructureEntry]) -> HashSet<i32> {
    entries
        .iter()
        .filter_map(|e| match e {
            SubFileStructureEntry::Item { file_index, .. } => Some(*file_index),
            _ => None,
        })
        .collect()
}

fn folder_has_direct_ext(
    node: &Node,
    ext: &str,
    ext_by_index: &std::collections::HashMap<i32, String>,
) -> bool {
    let Node::Folder { children, .. } = node else {
        return false;
    };
    children.iter().any(|c| match c {
        Node::Item { file_index, .. } => {
            ext_by_index.get(file_index).map(String::as_str) == Some(ext)
        }
        Node::Folder { .. } => false,
    })
}

fn model_group_name(
    node: &Node,
    ext_by_index: &std::collections::HashMap<i32, String>,
) -> Option<String> {
    let Node::Folder { children, .. } = node else {
        return None;
    };
    for c in children {
        if let Node::Item {
            file_index, name, ..
        } = c
        {
            if ext_by_index.get(file_index).map(String::as_str) == Some(".numdlb") {
                return name.clone();
            }
        }
    }
    None
}

fn count_model_groups(root: &Node, ext_by_index: &std::collections::HashMap<i32, String>) -> usize {
    fn walk(node: &Node, ext: &std::collections::HashMap<i32, String>) -> usize {
        match node {
            Node::Item { .. } => 0,
            Node::Folder { children, .. } => {
                let self_is_model = folder_has_direct_ext(node, ".numdlb", ext);
                let nested: usize = children.iter().map(|c| walk(c, ext)).sum();
                (if self_is_model { 1 } else { 0 }) + nested
            }
        }
    }
    walk(root, ext_by_index)
}

fn collect_model_group_names(
    node: &Node,
    ext_by_index: &std::collections::HashMap<i32, String>,
    names: &mut Vec<String>,
) {
    let Node::Folder { children, .. } = node else {
        return;
    };
    if folder_has_direct_ext(node, ".numdlb", ext_by_index) {
        if let Some(name) = model_group_name(node, ext_by_index) {
            names.push(name);
        }
    }
    for child in children {
        collect_model_group_names(child, ext_by_index, names);
    }
}

/// Remove the named model group (and its paired nuhlpb item) from the tree in place.
fn remove_model_from_tree(
    root: &mut Node,
    model_name: &str,
    ext_by_index: &std::collections::HashMap<i32, String>,
) -> Result<bool, String> {
    let Node::Folder { children, .. } = root else {
        return Ok(false);
    };

    let mut removed_model = false;
    for child in children.iter_mut() {
        if let Node::Folder {
            children: group_children,
            ..
        } = child
        {
            let before = group_children.len();
            group_children.retain(|mg| {
                let is_target = folder_has_direct_ext(mg, ".numdlb", ext_by_index)
                    && model_group_name(mg, ext_by_index).as_deref() == Some(model_name);
                !is_target
            });
            if group_children.len() != before {
                removed_model = true;
            }
        }
    }

    if removed_model {
        for child in children.iter_mut() {
            if let Node::Folder {
                children: folder_children,
                ..
            } = child
            {
                folder_children.retain(|item| match item {
                    Node::Item {
                        file_index, name, ..
                    } => {
                        let is_nuhlpb =
                            ext_by_index.get(file_index).map(String::as_str) == Some(".nuhlpb");
                        !(is_nuhlpb && name.as_deref() == Some(model_name))
                    }
                    Node::Folder { .. } => true,
                });
            }
        }
    }

    Ok(removed_model)
}

fn validate_dir(model_root: &str) -> Result<PathBuf, String> {
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

fn resolve_structure_path(model_root: &Path, explicit: Option<&str>) -> Result<PathBuf, String> {
    if let Some(p) = explicit {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
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

fn delete_pool_file_if_safe(model_root: &Path, json_dir: &Path, file_url: &str) {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    let target = json_dir.join(cleaned);
    let (Ok(root), Ok(resolved)) = (fs::canonicalize(model_root), fs::canonicalize(&target)) else {
        return;
    };
    if resolved.starts_with(&root) {
        let _ = fs::remove_file(&resolved);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_required_layout(root: &Path, base: &str) {
        for name in [
            format!("{base}.numdlb"),
            format!("{base}.numshb"),
            format!("{base}.nusktb"),
            format!("{base}.jnttbl"),
            format!("{base}__maya__.numatb"),
            format!("{base}__nust__.numatb"),
        ] {
            fs::write(root.join(name), b"stub").unwrap();
        }
    }

    #[test]
    fn source_layout_requires_exact_maya_and_nust_profiles() {
        let temp = tempfile::tempdir().unwrap();
        write_required_layout(temp.path(), "model");
        fs::rename(
            temp.path().join("model__nust__.numatb"),
            temp.path().join("model__other__.numatb"),
        )
        .unwrap();

        let error = scan_source_model(temp.path()).err().unwrap();

        assert!(error.contains("model__nust__.numatb"), "{error}");
    }

    #[test]
    fn source_layout_rejects_duplicate_core_files() {
        let temp = tempfile::tempdir().unwrap();
        write_required_layout(temp.path(), "model");
        fs::write(temp.path().join("duplicate.numshb"), b"stub").unwrap();

        let error = scan_source_model(temp.path()).err().unwrap();

        assert!(error.contains("exactly one .numshb"), "{error}");
    }

    #[test]
    fn source_layout_requires_matching_core_basenames() {
        let temp = tempfile::tempdir().unwrap();
        write_required_layout(temp.path(), "model");
        fs::rename(
            temp.path().join("model.jnttbl"),
            temp.path().join("other.jnttbl"),
        )
        .unwrap();

        let error = scan_source_model(temp.path()).err().unwrap();

        assert!(error.contains("model.jnttbl"), "{error}");
    }

    #[test]
    fn source_layout_accepts_original_maya_mesh_and_skeleton_names() {
        let temp = tempfile::tempdir().unwrap();
        write_required_layout(temp.path(), "model");
        fs::rename(
            temp.path().join("model.numshb"),
            temp.path().join("model__maya__.numshb"),
        )
        .unwrap();
        fs::rename(
            temp.path().join("model.nusktb"),
            temp.path().join("model__maya__.nusktb"),
        )
        .unwrap();

        let source = scan_source_model(temp.path()).unwrap();

        assert_eq!(source.model_name, "model");
    }

    #[test]
    fn generated_empty_nuhlpb_has_no_constraints() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("model.nuhlpb");

        write_empty_nuhlpb(&path).unwrap();
        let parsed = HlpbData::from_file(&path).unwrap();

        assert_eq!(parsed.major_version, 1);
        assert_eq!(parsed.minor_version, 1);
        assert!(parsed.aim_constraints.is_empty());
        assert!(parsed.orient_constraints.is_empty());
        assert_eq!(fs::metadata(path).unwrap().len(), 88);
    }

    #[test]
    fn copy_plan_does_not_overwrite_existing_destination() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.bin");
        let destination = temp.path().join("destination.bin");
        fs::write(&source, b"new").unwrap();
        fs::write(&destination, b"existing").unwrap();

        let error = copy_files_with_rollback(&[(source, destination.clone())])
            .err()
            .unwrap();

        assert!(error.contains("will not be overwritten"), "{error}");
        assert_eq!(fs::read(destination).unwrap(), b"existing");
    }

    #[test]
    fn real_original_unit_model_folder_validates_when_sample_is_present() {
        let root = Path::new(r"E:\XB\解包\com\file\0xAF73362C");
        let base = "026gnbelt_002nitngl_001_body_normal";
        let names = [
            format!("{base}.numdlb"),
            format!("{base}__maya__.numshb"),
            format!("{base}__maya__.nusktb"),
            format!("{base}.jnttbl"),
            format!("{base}__maya__.numatb"),
            format!("{base}__nust__.numatb"),
        ];
        if names.iter().any(|name| !root.join(name).is_file()) {
            eprintln!("SKIP: real original Unit model files are not present.");
            return;
        }
        let temp = tempfile::tempdir().unwrap();
        for name in names {
            fs::copy(root.join(&name), temp.path().join(name)).unwrap();
        }

        let validation =
            validate_unit_model_source_folder(temp.path().to_string_lossy().as_ref()).unwrap();

        assert_eq!(validation.model_name, base);
        assert_eq!(validation.required_files.len(), 6);
    }

    fn write_min_source(dir: &Path, base: &str) {
        use crate::jnttbl_format::{serialize_jnttbl, JnttblDocument};
        ModlData {
            major_version: 1,
            minor_version: 0,
            model_name: base.to_string(),
            skeleton_file_name: format!("{base}.nusktb"),
            material_file_names: vec![format!("{base}__maya__.numatb")],
            animation_file_name: None,
            mesh_file_name: format!("{base}.numshb"),
            entries: Vec::new(),
        }
        .write_to_file(dir.join(format!("{base}.numdlb")))
        .unwrap();
        MeshData {
            major_version: 1,
            minor_version: 10,
            objects: Vec::new(),
            is_vs2: false,
        }
        .write_to_file(dir.join(format!("{base}.numshb")))
        .unwrap();
        SkelData {
            major_version: 1,
            minor_version: 0,
            bones: Vec::new(),
        }
        .write_to_file(dir.join(format!("{base}.nusktb")))
        .unwrap();
        for profile in ["maya", "nust"] {
            MatlData {
                major_version: 1,
                minor_version: 6,
                entries: Vec::new(),
            }
            .write_to_file(dir.join(format!("{base}__{profile}__.numatb")))
            .unwrap();
        }
        let jnttbl = serialize_jnttbl(&JnttblDocument {
            version: 1,
            bone_count: 0,
            flag: 0,
            entries: Vec::new(),
        })
        .unwrap();
        fs::write(dir.join(format!("{base}.jnttbl")), jnttbl).unwrap();
    }

    fn write_min_source_with_texture(dir: &Path, base: &str, texture_name: &str) {
        use ssbh_data::matl_data::{MatlEntryData, ParamId, TextureParam};
        write_min_source(dir, base);
        for profile in ["maya", "nust"] {
            let matl = MatlData {
                major_version: 1,
                minor_version: 6,
                entries: vec![MatlEntryData {
                    material_label: "m1".to_string(),
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
                        ParamId::Texture1,
                        texture_name.to_string(),
                    )],
                    textures2: Vec::new(),
                    type4_v16: Vec::new(),
                    type4_v15: Vec::new(),
                    uv_transforms: Vec::new(),
                }],
            };
            matl.write_to_file(dir.join(format!("{base}__{profile}__.numatb")))
                .unwrap();
        }
        fs::write(dir.join(texture_name), b"pool-texture").unwrap();
    }

    struct ReplaceFixture {
        root: PathBuf,
        structure_path: PathBuf,
        alpha_dir: PathBuf,
        nuhlpb_dir: PathBuf,
    }

    fn write_replace_fixture(parent: &Path) -> ReplaceFixture {
        let out_name = "PKG";
        let root = parent.join(out_name);
        let alpha_dir = root.join("models").join("alpha");
        let nuhlpb_dir = root.join("nuhlpb");
        fs::create_dir_all(&alpha_dir).unwrap();
        fs::create_dir_all(&nuhlpb_dir).unwrap();
        write_min_source(&alpha_dir, "alpha");
        write_empty_nuhlpb(&nuhlpb_dir.join("alpha.nuhlpb")).unwrap();

        let url = |rel: &str| format!(".\\{out_name}\\{}", rel.replace('/', "\\"));
        let sub_file_data = json!([
            { "index": 0, "fileType": ".nusktb", "fileIndex": 0, "fileUrl": url("models/alpha/alpha.nusktb"), "fileBaseName": "alpha" },
            { "index": 1, "fileType": ".numshb", "fileIndex": 1, "fileUrl": url("models/alpha/alpha.numshb"), "fileBaseName": "alpha" },
            { "index": 2, "fileType": ".numdlb", "fileIndex": 2, "fileUrl": url("models/alpha/alpha.numdlb"), "fileBaseName": "alpha" },
            { "index": 3, "fileType": ".jnttbl", "fileIndex": 3, "fileUrl": url("models/alpha/alpha.jnttbl"), "fileBaseName": "alpha" },
            { "index": 4, "fileType": ".numatb", "fileIndex": 4, "fileUrl": url("models/alpha/alpha__maya__.numatb"), "fileBaseName": "alpha__maya__" },
            { "index": 5, "fileType": ".numatb", "fileIndex": 5, "fileUrl": url("models/alpha/alpha__nust__.numatb"), "fileBaseName": "alpha__nust__" },
            { "index": 6, "fileType": ".nuhlpb", "fileIndex": 6, "fileUrl": url("nuhlpb/alpha.nuhlpb"), "fileBaseName": "alpha" },
        ]);

        let group = Node::Folder {
            entry: make_folder(0, 0),
            children: vec![
                Node::Item {
                    entry: make_item(0, "10000000", 0, "alpha"),
                    file_index: 0,
                    name: Some("alpha".into()),
                },
                Node::Folder {
                    entry: make_folder(32, 1),
                    children: vec![],
                },
                Node::Item {
                    entry: make_item(4, "21000000", 1, "alpha__maya__"),
                    file_index: 4,
                    name: Some("alpha__maya__".into()),
                },
                Node::Folder {
                    entry: make_folder(32, 1),
                    children: vec![],
                },
                Node::Item {
                    entry: make_item(5, "21000000", 1, "alpha__nust__"),
                    file_index: 5,
                    name: Some("alpha__nust__".into()),
                },
                Node::Item {
                    entry: make_item(1, "30000000", 0, "alpha"),
                    file_index: 1,
                    name: Some("alpha".into()),
                },
                Node::Item {
                    entry: make_item(2, "40000000", 0, "alpha"),
                    file_index: 2,
                    name: Some("alpha".into()),
                },
                Node::Item {
                    entry: make_item(3, "50000000", 0, "alpha"),
                    file_index: 3,
                    name: Some("alpha".into()),
                },
            ],
        };
        let models = Node::Folder {
            entry: make_folder(0, 0),
            children: vec![group],
        };
        let nuhlpb = Node::Folder {
            entry: make_folder(0, 0),
            children: vec![Node::Item {
                entry: make_item(6, "00000000", 0, "alpha"),
                file_index: 6,
                name: Some("alpha".into()),
            }],
        };
        let root_node = Node::Folder {
            entry: make_folder(0, 0),
            children: vec![models, nuhlpb],
        };
        let mut structure = Vec::new();
        serialize_node(&root_node, &mut structure);
        let structure_value = serde_json::to_value(&structure).unwrap();

        let value = json!({
            "Magic": 10,
            "Fhm2dTotalCount": 7,
            "SubFileData": sub_file_data,
            "SubFileStructure": structure_value,
        });
        let structure_path = parent.join(format!("{out_name}_structure.json"));
        fs::write(
            &structure_path,
            serde_json::to_string_pretty(&value).unwrap(),
        )
        .unwrap();

        ReplaceFixture {
            root,
            structure_path,
            alpha_dir,
            nuhlpb_dir,
        }
    }

    fn read_structure_tree(structure_path: &Path) -> (Node, HashMap<i32, String>) {
        let raw = fs::read_to_string(structure_path).unwrap();
        let value: Value = serde_json::from_str(&raw).unwrap();
        let sub_file_data = value.get("SubFileData").and_then(Value::as_array).unwrap();
        let ext_by_index = build_ext_by_index(sub_file_data);
        let structure: Vec<SubFileStructureEntry> =
            serde_json::from_value(value.get("SubFileStructure").cloned().unwrap()).unwrap();
        let root = parse_root(&structure).unwrap();
        (root, ext_by_index)
    }

    fn find_model_group_by_name<'a>(
        node: &'a Node,
        model_name: &str,
        ext_by_index: &HashMap<i32, String>,
    ) -> Option<&'a Node> {
        match node {
            Node::Item { .. } => None,
            Node::Folder { children, .. } => {
                if folder_has_direct_ext(node, ".numdlb", ext_by_index)
                    && model_group_name(node, ext_by_index).as_deref() == Some(model_name)
                {
                    return Some(node);
                }
                children
                    .iter()
                    .find_map(|child| find_model_group_by_name(child, model_name, ext_by_index))
            }
        }
    }

    fn material_structure_variants_for_model(
        root: &Node,
        model_name: &str,
        ext_by_index: &HashMap<i32, String>,
    ) -> Vec<(i32, i32)> {
        let group = find_model_group_by_name(root, model_name, ext_by_index)
            .unwrap_or_else(|| panic!("missing model group {model_name}"));
        let Node::Folder { children, .. } = group else {
            panic!("model group must be a folder");
        };
        let mut variants = Vec::new();
        for (index, child) in children.iter().enumerate() {
            let Node::Folder { entry, .. } = child else {
                continue;
            };
            let folder_variant = match entry {
                SubFileStructureEntry::Folder { unk3, unk5, .. } if *unk3 == 32 => *unk5,
                _ => continue,
            };
            let mut item_variant = None;
            for next in children.iter().skip(index + 1) {
                match next {
                    Node::Item {
                        entry, file_index, ..
                    } if ext_by_index.get(file_index).map(String::as_str) == Some(".numatb") => {
                        if let SubFileStructureEntry::Item { unk3, .. } = entry {
                            item_variant = Some(*unk3);
                        }
                        break;
                    }
                    Node::Folder { entry, .. } => {
                        if matches!(entry, SubFileStructureEntry::Folder { unk3: 32, .. }) {
                            break;
                        }
                    }
                    _ => {}
                }
            }
            variants.push((
                folder_variant,
                item_variant.unwrap_or_else(|| {
                    panic!("texture container in {model_name} has no paired numatb")
                }),
            ));
        }
        variants
    }

    #[test]
    fn add_writes_base_material_variants_for_maya_and_nust() {
        let parent = tempfile::tempdir().unwrap();
        let fixture = write_replace_fixture(parent.path());
        let beta = tempfile::tempdir().unwrap();
        write_min_source(beta.path(), "beta");

        let result = add_unit_model_model(
            fixture.root.to_string_lossy().as_ref(),
            Some(fixture.structure_path.to_string_lossy().as_ref()),
            beta.path().to_string_lossy().as_ref(),
        )
        .expect("add should succeed");

        assert_eq!(result.model_count, 2, "new model appended");
        let (root, ext_by_index) = read_structure_tree(&fixture.structure_path);
        assert_eq!(
            material_structure_variants_for_model(&root, "beta", &ext_by_index),
            vec![(1, 1), (1, 1)],
            "maya and base nust material pairs both use base profile variant"
        );
    }

    #[test]
    fn add_reuses_orphan_pool_texture_on_disk_without_overwriting() {
        let parent = tempfile::tempdir().unwrap();
        let fixture = write_replace_fixture(parent.path());
        let textures_dir = fixture.root.join("textures");
        fs::create_dir_all(&textures_dir).unwrap();
        let orphan_path = textures_dir.join("n1_back.nutexb");
        fs::write(&orphan_path, b"orphan-pool-texture").unwrap();

        let gamma = tempfile::tempdir().unwrap();
        write_min_source_with_texture(gamma.path(), "gamma", "n1_back.nutexb");

        add_unit_model_model(
            fixture.root.to_string_lossy().as_ref(),
            Some(fixture.structure_path.to_string_lossy().as_ref()),
            gamma.path().to_string_lossy().as_ref(),
        )
        .expect("add should reuse orphan pool texture");

        assert_eq!(
            fs::read(&orphan_path).unwrap(),
            b"orphan-pool-texture",
            "existing pool texture must not be overwritten"
        );
        let raw = fs::read_to_string(&fixture.structure_path).unwrap();
        let value: Value = serde_json::from_str(&raw).unwrap();
        let pool_index =
            build_texture_pool_index(value.get("SubFileData").and_then(Value::as_array).unwrap());
        assert!(
            pool_index.contains_key("n1_back.nutexb"),
            "orphan pool texture should be registered in SubFileData"
        );
        let sub_file_data = value.get("SubFileData").and_then(Value::as_array).unwrap();
        let mut seen = HashSet::new();
        for entry in sub_file_data {
            let file_index = entry
                .get("fileIndex")
                .and_then(Value::as_i64)
                .expect("fileIndex");
            assert!(
                seen.insert(file_index),
                "duplicate fileIndex {file_index} in SubFileData"
            );
        }
    }

    #[test]
    fn replace_preserves_name_position_and_swaps_files() {
        let parent = tempfile::tempdir().unwrap();
        let fixture = write_replace_fixture(parent.path());
        let beta = tempfile::tempdir().unwrap();
        write_min_source(beta.path(), "beta");

        let result = replace_unit_model_model(
            fixture.root.to_string_lossy().as_ref(),
            Some(fixture.structure_path.to_string_lossy().as_ref()),
            "alpha",
            beta.path().to_string_lossy().as_ref(),
        )
        .expect("replace should succeed");

        assert_eq!(result.model_count, 1, "model count unchanged");

        // Identity preserved: numdlb keeps the old name + old internal model_name.
        assert!(
            fixture.alpha_dir.join("alpha.numdlb").is_file(),
            "numdlb keeps old name"
        );
        let modl = ModlData::from_file(fixture.alpha_dir.join("alpha.numdlb")).unwrap();
        assert_eq!(
            modl.model_name, "alpha",
            "numdlb model_name forced to old name"
        );

        // New files placed under the same model folder; old non-numdlb files removed.
        assert!(
            fixture.alpha_dir.join("beta.numshb").is_file(),
            "new numshb copied in"
        );
        assert!(
            fixture.alpha_dir.join("beta.nusktb").is_file(),
            "new nusktb copied in"
        );
        assert!(
            !fixture.alpha_dir.join("alpha.numshb").is_file(),
            "old numshb removed"
        );
        assert!(
            !fixture.alpha_dir.join("alpha.nusktb").is_file(),
            "old nusktb removed"
        );

        // NUHLPB untouched.
        assert!(
            fixture.nuhlpb_dir.join("alpha.nuhlpb").is_file(),
            "nuhlpb preserved"
        );

        // Structure still names the model "alpha" at one model group.
        let raw = fs::read_to_string(&fixture.structure_path).unwrap();
        let v: Value = serde_json::from_str(&raw).unwrap();
        let sfd = v.get("SubFileData").and_then(Value::as_array).unwrap();
        let ext = build_ext_by_index(sfd);
        let sfs: Vec<SubFileStructureEntry> =
            serde_json::from_value(v.get("SubFileStructure").cloned().unwrap()).unwrap();
        let reparsed = parse_root(&sfs).unwrap();
        assert!(
            count_model_named(&reparsed, "alpha", &ext),
            "model still named alpha"
        );
        assert_eq!(
            count_model_groups(&reparsed, &ext),
            1,
            "still one model group"
        );
        assert_eq!(
            material_structure_variants_for_model(&reparsed, "alpha", &ext),
            vec![(1, 1), (1, 1)],
            "replace must not write the second base material pair as variant 2"
        );
    }

    #[test]
    fn preview_replacement_preserves_target_identity_and_reports_compatibility() {
        let parent = tempfile::tempdir().unwrap();
        let fixture = write_replace_fixture(parent.path());
        let beta = tempfile::tempdir().unwrap();
        write_min_source(beta.path(), "beta");

        let preview = preview_unit_model_model_replacement(
            fixture.root.to_string_lossy().as_ref(),
            Some(fixture.structure_path.to_string_lossy().as_ref()),
            "alpha",
            beta.path().to_string_lossy().as_ref(),
        )
        .expect("preview should succeed");

        assert_eq!(preview.target.model_name, "alpha");
        assert_eq!(preview.target.model_index, 0);
        assert_eq!(preview.source.model_name, "beta");
        assert!(preview.target.nuhlpb_path.is_some(), "target nuhlpb found");
        assert_eq!(preview.compatibility.skeleton.source_bone_count, 0);
        assert_eq!(preview.compatibility.skeleton.target_bone_count, 0);
        assert!(preview.blockers.is_empty(), "no missing textures expected");
        assert!(
            preview
                .warnings
                .iter()
                .any(|warning| warning.contains("Source model 'beta'")),
            "source/target identity warning expected"
        );
    }

    fn write_distinct_numshb(path: &Path, object_name: &str) {
        use ssbh_data::mesh_data::{AttributeData, MeshObjectData, VectorData};
        MeshData {
            major_version: 1,
            minor_version: 10,
            objects: vec![MeshObjectData {
                name: object_name.to_string(),
                subindex: 0,
                positions: vec![AttributeData {
                    name: "Position0".to_string(),
                    data: VectorData::Vector3(vec![
                        glam::Vec3::new(1.0, 0.0, 0.0),
                        glam::Vec3::new(0.0, 1.0, 0.0),
                        glam::Vec3::new(0.0, 0.0, 1.0),
                    ]),
                }],
                vertex_indices: vec![0, 1, 2],
                ..Default::default()
            }],
            is_vs2: false,
        }
        .write_to_file(path)
        .unwrap();
    }

    #[test]
    fn replace_numshb_overwrites_mesh_and_materials_and_leaves_skeleton_untouched() {
        let parent = tempfile::tempdir().unwrap();
        let fixture = write_replace_fixture(parent.path());
        let source_dir = tempfile::tempdir().unwrap();
        write_min_source(source_dir.path(), "foreign");
        write_distinct_numshb(&source_dir.path().join("foreign.numshb"), "Body");
        for profile in ["maya", "nust"] {
            MatlData {
                major_version: 1,
                minor_version: 6,
                entries: Vec::new(),
            }
            .write_to_file(source_dir.path().join(format!("foreign__{profile}__.numatb")))
            .unwrap();
        }

        let target_numshb = fixture.alpha_dir.join("alpha.numshb");
        let untouched = [
            fixture.alpha_dir.join("alpha.nusktb"),
            fixture.alpha_dir.join("alpha.jnttbl"),
            fixture.nuhlpb_dir.join("alpha.nuhlpb"),
        ];
        let before_structure = fs::read(&fixture.structure_path).unwrap();
        let before_untouched: Vec<_> = untouched
            .iter()
            .map(|path| fs::read(path).unwrap())
            .collect();
        let before_target = fs::read(&target_numshb).unwrap();
        let source_bytes = fs::read(source_dir.path().join("foreign.numshb")).unwrap();
        assert_ne!(before_target, source_bytes);

        let result = replace_unit_model_numshb(
            fixture.root.to_string_lossy().as_ref(),
            Some(fixture.structure_path.to_string_lossy().as_ref()),
            "alpha",
            source_dir.path().to_string_lossy().as_ref(),
        )
        .expect("mesh-and-material replace should succeed");

        assert_eq!(result.model_count, 1);
        assert_eq!(fs::read(&target_numshb).unwrap(), source_bytes);
        assert!(
            !fixture.alpha_dir.join("foreign.numshb").exists(),
            "source filename must not be copied beside the target"
        );
        assert_eq!(
            fs::read(&fixture.structure_path).unwrap(),
            before_structure,
            "_structure.json must stay byte-identical"
        );
        for (path, before) in untouched.iter().zip(before_untouched) {
            assert_eq!(
                fs::read(path).unwrap(),
                before,
                "{} must stay byte-identical",
                path.display()
            );
        }
        let modl = ModlData::from_file(fixture.alpha_dir.join("alpha.numdlb")).unwrap();
        assert_eq!(modl.model_name, "alpha");
        assert_eq!(modl.skeleton_file_name, "alpha.nusktb");
        assert_eq!(modl.mesh_file_name, "alpha.numshb");
    }

    #[test]
    fn replace_texture_plan_reuses_pool_before_source_folder() {
        let source = tempfile::tempdir().unwrap();
        fs::write(source.path().join("source_only.nutexb"), b"stub").unwrap();
        fs::write(source.path().join("shared.nutexb"), b"stub").unwrap();
        let mut texture_index = HashMap::new();
        texture_index.insert("shared.nutexb".to_string(), 42);

        let plan = build_replace_texture_plan(
            source.path(),
            &[
                "shared.nutexb".to_string(),
                "source_only.nutexb".to_string(),
                "missing.nutexb".to_string(),
            ],
            &texture_index,
        );

        assert_eq!(plan.reused_from_pool, vec!["shared.nutexb"]);
        assert_eq!(plan.copied_from_source, vec!["source_only.nutexb"]);
        assert_eq!(plan.missing, vec!["missing.nutexb"]);
    }
}
