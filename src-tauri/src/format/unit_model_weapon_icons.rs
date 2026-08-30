//! Character-pack HUD weapon icons (`weapon_icon` Folder).
//!
//! The in-game bar draws `imcWeaponArt[N]` from the **Nth Item** under the dedicated
//! all-nutexb Folder at package root. Disk order and `textures/` are not this table.
//! Adding a `.nutexb` on disk is not enough: SubFileData + Folder Item + folderCount
//! must change, then the pack is repacked.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};

use crate::format::fhm2d::SubFileStructureEntry;

const TEXTURE_CONTAINER_UNK3: i32 = 32;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelWeaponIconEntry {
    pub hud_index: usize,
    pub file_index: i32,
    pub filename: String,
    pub path: String,
    pub file_url: String,
    pub exists: bool,
    pub size_bytes: u64,
    pub internal_name: Option<String>,
    pub format: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelWeaponIconInventory {
    pub model_root: String,
    pub structure_json_path: String,
    pub folder_present: bool,
    pub icons: Vec<UnitModelWeaponIconEntry>,
    pub warnings: Vec<String>,
}

enum Node {
    Folder {
        entry: SubFileStructureEntry,
        children: Vec<Node>,
    },
    Item {
        entry: SubFileStructureEntry,
        file_index: i32,
    },
}

enum Tok {
    Folder(SubFileStructureEntry),
    Item(SubFileStructureEntry, i32),
    End,
}

pub fn list_unit_model_weapon_icons(
    model_root: &str,
    structure_json_path: Option<&str>,
) -> Result<UnitModelWeaponIconInventory, String> {
    let model_root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&model_root_path, structure_json_path)?;
    let mut doc = read_document(&structure_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    Ok(build_inventory(
        &model_root_path,
        &structure_path,
        &json_dir,
        &mut doc,
    ))
}

pub fn add_unit_model_weapon_icon(
    model_root: &str,
    structure_json_path: Option<&str>,
    source_path: &str,
    target_filename: &str,
    insert_at: Option<i32>,
) -> Result<UnitModelWeaponIconInventory, String> {
    let model_root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&model_root_path, structure_json_path)?;
    let mut doc = read_document(&structure_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let filename = sanitize_nutexb_filename(target_filename)?;
    ensure_filename_available(&doc.sub_file_data, &filename)?;

    let source = PathBuf::from(source_path.trim());
    if !source.is_file() {
        return Err(format!(
            "Weapon icon source is not a file: {}",
            source.display()
        ));
    }

    let ext_by_index = build_ext_by_index(&doc.sub_file_data);
    let mut root = parse_root(&doc.structure)?;
    let current_len = find_weapon_icon_children(&root, &ext_by_index)
        .map(|children| children.len() as i32)
        .unwrap_or(0);
    let insert_index = match insert_at {
        None => current_len as usize,
        Some(value) if value >= 0 && value <= current_len => value as usize,
        Some(value) => {
            return Err(format!(
                "insert_at {value} is out of range for a weapon_icon table of length {current_len}."
            ));
        }
    };

    let icon_dir = model_root_path.join("weapon_icon");
    fs::create_dir_all(&icon_dir).map_err(|e| {
        format!(
            "Failed to create weapon_icon dir {}: {e}",
            icon_dir.display()
        )
    })?;
    let target = icon_dir.join(&filename);
    if target.exists() {
        let register_existing = fs::canonicalize(&source)
            .ok()
            .zip(fs::canonicalize(&target).ok())
            .map(|(left, right)| left == right)
            .unwrap_or(false);
        if !register_existing {
            return Err(format!(
                "Target weapon icon already exists on disk: {}",
                target.display()
            ));
        }
    } else {
        fs::copy(&source, &target).map_err(|e| {
            format!(
                "Failed to copy weapon icon {} -> {}: {e}",
                source.display(),
                target.display()
            )
        })?;
    }

    let next_file_index = doc
        .sub_file_data
        .iter()
        .filter_map(|entry| entry.get("fileIndex").and_then(Value::as_i64))
        .max()
        .unwrap_or(-1) as i32
        + 1;
    let file_url = file_url_for_target(&json_dir, &target);
    let stem = strip_nutexb_extension(&filename);
    doc.sub_file_data.push(json!({
        "index": doc.sub_file_data.len(),
        "fileType": ".nutexb",
        "fileIndex": next_file_index,
        "fileUrl": file_url,
        "fileBaseName": stem,
    }));

    {
        let folder_children = ensure_weapon_icon_children(&mut root, &ext_by_index)?;
        let template = folder_children.iter().find_map(|child| match child {
            Node::Item { entry, .. } => Some(entry.clone()),
            Node::Folder { .. } => None,
        });
        folder_children.insert(
            insert_index,
            Node::Item {
                entry: make_icon_item(next_file_index, stem, template.as_ref()),
                file_index: next_file_index,
            },
        );
    }

    write_document(&structure_path, &mut doc, &root)?;
    let mut doc = read_document(&structure_path)?;
    Ok(build_inventory(
        &model_root_path,
        &structure_path,
        &json_dir,
        &mut doc,
    ))
}

pub fn reorder_unit_model_weapon_icons(
    model_root: &str,
    structure_json_path: Option<&str>,
    file_indices: &[i32],
) -> Result<UnitModelWeaponIconInventory, String> {
    let model_root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&model_root_path, structure_json_path)?;
    let mut doc = read_document(&structure_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let ext_by_index = build_ext_by_index(&doc.sub_file_data);
    let mut root = parse_root(&doc.structure)?;
    {
        let folder_children = find_weapon_icon_children_mut(&mut root, &ext_by_index)
            .ok_or_else(|| "This package has no weapon_icon Folder to reorder.".to_string())?;

        let current: Vec<i32> = folder_children
            .iter()
            .filter_map(|child| match child {
                Node::Item { file_index, .. } => Some(*file_index),
                Node::Folder { .. } => None,
            })
            .collect();
        if current.len() != folder_children.len() {
            return Err("weapon_icon Folder must contain only icon Items.".to_string());
        }
        if file_indices.len() != current.len() {
            return Err(format!(
                "Reorder list length {} does not match weapon_icon table length {}.",
                file_indices.len(),
                current.len()
            ));
        }
        let current_set: HashSet<i32> = current.iter().copied().collect();
        let new_set: HashSet<i32> = file_indices.iter().copied().collect();
        if current_set != new_set || new_set.len() != file_indices.len() {
            return Err(
                "Reorder list must be a permutation of the current weapon_icon fileIndex values."
                    .to_string(),
            );
        }

        let mut by_index: HashMap<i32, Node> = HashMap::new();
        for child in folder_children.drain(..) {
            if let Node::Item { file_index, .. } = &child {
                by_index.insert(*file_index, child);
            }
        }
        for file_index in file_indices {
            let node = by_index.remove(file_index).ok_or_else(|| {
                format!("Missing weapon_icon fileIndex {file_index} during reorder.")
            })?;
            folder_children.push(node);
        }
    }

    write_document(&structure_path, &mut doc, &root)?;
    let mut doc = read_document(&structure_path)?;
    Ok(build_inventory(
        &model_root_path,
        &structure_path,
        &json_dir,
        &mut doc,
    ))
}

pub fn remove_unit_model_weapon_icon(
    model_root: &str,
    structure_json_path: Option<&str>,
    file_index: i32,
) -> Result<UnitModelWeaponIconInventory, String> {
    let model_root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&model_root_path, structure_json_path)?;
    let mut doc = read_document(&structure_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let ext_by_index = build_ext_by_index(&doc.sub_file_data);
    let mut root = parse_root(&doc.structure)?;
    let folder_index = find_weapon_icon_child_index(&root, &ext_by_index)
        .ok_or_else(|| "This package has no weapon_icon Folder to remove from.".to_string())?;
    let remaining_empty = {
        let folder_children = match &mut root {
            Node::Folder { children, .. } => match &mut children[folder_index] {
                Node::Folder { children, .. } => children,
                Node::Item { .. } => {
                    return Err("weapon_icon Folder index did not resolve to a folder.".to_string());
                }
            },
            Node::Item { .. } => {
                return Err("Root of SubFileStructure is not a folder".to_string());
            }
        };
        let position = folder_children.iter().position(|child| match child {
            Node::Item {
                file_index: child_index,
                ..
            } => *child_index == file_index,
            Node::Folder { .. } => false,
        });
        let Some(position) = position else {
            return Err(format!(
                "fileIndex {file_index} is not a weapon_icon HUD item."
            ));
        };
        folder_children.remove(position);
        folder_children.is_empty()
    };
    if remaining_empty {
        match &mut root {
            Node::Folder { children, .. } => {
                children.remove(folder_index);
            }
            Node::Item { .. } => {
                return Err("Root of SubFileStructure is not a folder".to_string());
            }
        }
    }

    let mut new_structure = Vec::new();
    serialize_node(&root, &mut new_structure);
    let still_referenced = collect_referenced_indices(&new_structure).contains(&file_index);

    let mut removed_path: Option<PathBuf> = None;
    if !still_referenced {
        if let Some(entry) = doc
            .sub_file_data
            .iter()
            .find(|entry| entry.get("fileIndex").and_then(Value::as_i64) == Some(file_index as i64))
        {
            let file_url = entry.get("fileUrl").and_then(Value::as_str).unwrap_or("");
            removed_path = Some(resolve_file_path(&json_dir, file_url));
        }
        doc.sub_file_data.retain(|entry| {
            entry.get("fileIndex").and_then(Value::as_i64) != Some(file_index as i64)
        });
    }

    write_document(&structure_path, &mut doc, &root)?;
    if let Some(path) = removed_path {
        remove_file_if_safe(&model_root_path, &path)?;
    }
    let mut doc = read_document(&structure_path)?;
    Ok(build_inventory(
        &model_root_path,
        &structure_path,
        &json_dir,
        &mut doc,
    ))
}

struct Document {
    value: Value,
    sub_file_data: Vec<Value>,
    structure: Vec<SubFileStructureEntry>,
}

fn read_document(structure_path: &Path) -> Result<Document, String> {
    let raw = fs::read_to_string(structure_path).map_err(|e| {
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
    let structure: Vec<SubFileStructureEntry> = serde_json::from_value(
        value
            .get("SubFileStructure")
            .cloned()
            .ok_or_else(|| "Structure JSON missing SubFileStructure".to_string())?,
    )
    .map_err(|e| format!("Failed to parse SubFileStructure: {e}"))?;
    Ok(Document {
        value,
        sub_file_data,
        structure,
    })
}

fn write_document(structure_path: &Path, doc: &mut Document, root: &Node) -> Result<(), String> {
    let mut new_structure = Vec::new();
    serialize_node(root, &mut new_structure);
    reindex_sub_file_data(&mut doc.sub_file_data);
    let sub_file_data_value = Value::Array(doc.sub_file_data.clone());
    let structure_value = serde_json::to_value(&new_structure)
        .map_err(|e| format!("Failed to serialize SubFileStructure: {e}"))?;
    let obj = doc
        .value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object".to_string())?;
    obj.insert(
        "Fhm2dTotalCount".to_string(),
        json!(doc.sub_file_data.len()),
    );
    obj.insert("SubFileData".to_string(), sub_file_data_value);
    obj.insert("SubFileStructure".to_string(), structure_value);
    let serialized = serde_json::to_string_pretty(&doc.value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    fs::write(structure_path, format!("{serialized}\n")).map_err(|e| {
        format!(
            "Failed to write structure JSON {}: {e}",
            structure_path.display()
        )
    })
}

fn build_inventory(
    model_root: &Path,
    structure_path: &Path,
    json_dir: &Path,
    doc: &mut Document,
) -> UnitModelWeaponIconInventory {
    let mut warnings = Vec::new();
    let ext_by_index = build_ext_by_index(&doc.sub_file_data);
    let url_by_index = build_url_by_index(&doc.sub_file_data);
    let root = match parse_root(&doc.structure) {
        Ok(root) => root,
        Err(error) => {
            warnings.push(error);
            return UnitModelWeaponIconInventory {
                model_root: model_root.to_string_lossy().to_string(),
                structure_json_path: structure_path.to_string_lossy().to_string(),
                folder_present: false,
                icons: Vec::new(),
                warnings,
            };
        }
    };
    let Some(children) = find_weapon_icon_children(&root, &ext_by_index) else {
        return UnitModelWeaponIconInventory {
            model_root: model_root.to_string_lossy().to_string(),
            structure_json_path: structure_path.to_string_lossy().to_string(),
            folder_present: false,
            icons: Vec::new(),
            warnings,
        };
    };

    let mut icons = Vec::new();
    for child in children {
        let Node::Item { file_index, .. } = child else {
            warnings.push(
                "weapon_icon Folder contains a nested folder; HUD order is Item-only.".to_string(),
            );
            continue;
        };
        let file_url = url_by_index.get(file_index).cloned().unwrap_or_default();
        let path = resolve_file_path(json_dir, &file_url);
        let filename = file_basename(&file_url);
        let metadata = fs::metadata(&path).ok();
        let exists = metadata.as_ref().is_some_and(|m| m.is_file());
        let size_bytes = metadata.map(|m| m.len()).unwrap_or(0);
        let info = if exists {
            match crate::nutexb_lib::read_nutexb_info(&path.to_string_lossy()) {
                Ok(info) => Some(info),
                Err(e) => {
                    warnings.push(format!(
                        "Failed to read nutexb info for {}: {e}",
                        path.display()
                    ));
                    None
                }
            }
        } else {
            warnings.push(format!("Weapon icon missing on disk: {}", path.display()));
            None
        };
        icons.push(UnitModelWeaponIconEntry {
            hud_index: icons.len(),
            file_index: *file_index,
            filename,
            path: path.to_string_lossy().to_string(),
            file_url,
            exists,
            size_bytes,
            internal_name: info.as_ref().map(|i| i.name.clone()),
            format: info
                .as_ref()
                .map(|i| i.image_format.clone())
                .unwrap_or_else(|| "unknown".to_string()),
            width: info.as_ref().map(|i| i.width).unwrap_or(0),
            height: info.as_ref().map(|i| i.height).unwrap_or(0),
        });
    }

    UnitModelWeaponIconInventory {
        model_root: model_root.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        folder_present: true,
        icons,
        warnings,
    }
}

fn ensure_weapon_icon_children<'a>(
    root: &'a mut Node,
    ext_by_index: &HashMap<i32, String>,
) -> Result<&'a mut Vec<Node>, String> {
    if find_weapon_icon_child_index(root, ext_by_index).is_some() {
        return find_weapon_icon_children_mut(root, ext_by_index)
            .ok_or_else(|| "weapon_icon Folder was found then lost.".to_string());
    }
    let Node::Folder { children, .. } = root else {
        return Err("Root of SubFileStructure is not a folder".to_string());
    };
    let insert_at = models_container_index(children, ext_by_index)
        .map(|index| index + 1)
        .unwrap_or(children.len());
    children.insert(
        insert_at,
        Node::Folder {
            entry: make_folder(),
            children: Vec::new(),
        },
    );
    match &mut children[insert_at] {
        Node::Folder { children, .. } => Ok(children),
        Node::Item { .. } => Err("Failed to create weapon_icon Folder.".to_string()),
    }
}

fn find_weapon_icon_children<'a>(
    root: &'a Node,
    ext_by_index: &HashMap<i32, String>,
) -> Option<&'a [Node]> {
    let Node::Folder { children, .. } = root else {
        return None;
    };
    for child in children {
        if is_weapon_icon_folder(child, ext_by_index) {
            if let Node::Folder {
                children: inner, ..
            } = child
            {
                return Some(inner);
            }
        }
    }
    None
}

fn find_weapon_icon_children_mut<'a>(
    root: &'a mut Node,
    ext_by_index: &HashMap<i32, String>,
) -> Option<&'a mut Vec<Node>> {
    let index = find_weapon_icon_child_index(root, ext_by_index)?;
    let Node::Folder { children, .. } = root else {
        return None;
    };
    match &mut children[index] {
        Node::Folder { children, .. } => Some(children),
        Node::Item { .. } => None,
    }
}

fn find_weapon_icon_child_index(root: &Node, ext_by_index: &HashMap<i32, String>) -> Option<usize> {
    let Node::Folder { children, .. } = root else {
        return None;
    };
    children
        .iter()
        .position(|child| is_weapon_icon_folder(child, ext_by_index))
}

fn is_weapon_icon_folder(node: &Node, ext_by_index: &HashMap<i32, String>) -> bool {
    let Node::Folder { entry, children } = node else {
        return false;
    };
    if let SubFileStructureEntry::Folder { unk3, .. } = entry {
        if *unk3 == TEXTURE_CONTAINER_UNK3 {
            return false;
        }
    }
    if children.is_empty() {
        return false;
    }
    if children
        .iter()
        .any(|child| matches!(child, Node::Folder { .. }))
    {
        return false;
    }
    children.iter().all(|child| match child {
        Node::Item { file_index, .. } => {
            ext_by_index.get(file_index).map(String::as_str) == Some(".nutexb")
        }
        Node::Folder { .. } => false,
    })
}

fn models_container_index(children: &[Node], ext_by_index: &HashMap<i32, String>) -> Option<usize> {
    children.iter().position(|child| {
        let Node::Folder {
            children: inner, ..
        } = child
        else {
            return false;
        };
        inner
            .iter()
            .any(|grand| folder_has_direct_ext(grand, ".numdlb", ext_by_index))
    })
}

fn folder_has_direct_ext(node: &Node, ext: &str, ext_by_index: &HashMap<i32, String>) -> bool {
    let Node::Folder { children, .. } = node else {
        return false;
    };
    children.iter().any(|child| match child {
        Node::Item { file_index, .. } => {
            ext_by_index.get(file_index).map(String::as_str) == Some(ext)
        }
        Node::Folder { .. } => false,
    })
}

fn tokenize(entries: &[SubFileStructureEntry]) -> Vec<Tok> {
    let mut out = Vec::with_capacity(entries.len());
    for entry in entries {
        match entry {
            SubFileStructureEntry::Folder { .. } => out.push(Tok::Folder(entry.clone())),
            SubFileStructureEntry::Item { file_index, .. } => {
                out.push(Tok::Item(entry.clone(), *file_index))
            }
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
            Tok::Item(entry, file_index) => {
                out.push(Node::Item {
                    entry: entry.clone(),
                    file_index: *file_index,
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
        .filter_map(|entry| match entry {
            SubFileStructureEntry::Item { file_index, .. } => Some(*file_index),
            _ => None,
        })
        .collect()
}

fn make_folder() -> SubFileStructureEntry {
    SubFileStructureEntry::Folder {
        unk1: "00000000".to_string(),
        folder_count: 0,
        unk2: "00000000".to_string(),
        unk2_1: 0,
        unk3: 0,
        unk4: 0,
        unk5: 0,
        unk6: 0,
    }
}

fn make_icon_item(
    file_index: i32,
    name: &str,
    template: Option<&SubFileStructureEntry>,
) -> SubFileStructureEntry {
    match template {
        Some(SubFileStructureEntry::Item {
            unk1,
            unk2,
            unk2_1,
            unk3,
            unk4,
            ..
        }) => SubFileStructureEntry::Item {
            unk1: unk1.clone(),
            file_index,
            unk2: unk2.clone(),
            unk2_1: *unk2_1,
            unk3: *unk3,
            unk4: *unk4,
            original_file_index: file_index,
            display_name: Some(name.to_string()),
        },
        _ => SubFileStructureEntry::Item {
            unk1: "00000000".to_string(),
            file_index,
            unk2: "00000000".to_string(),
            unk2_1: 0,
            unk3: 0,
            unk4: 0,
            original_file_index: file_index,
            display_name: Some(name.to_string()),
        },
    }
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
    if let Some(path) = explicit {
        let trimmed = path.trim();
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

fn build_ext_by_index(sub_file_data: &[Value]) -> HashMap<i32, String> {
    let mut map = HashMap::new();
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

fn build_url_by_index(sub_file_data: &[Value]) -> HashMap<i32, String> {
    let mut map = HashMap::new();
    for entry in sub_file_data {
        let Some(idx) = entry.get("fileIndex").and_then(Value::as_i64) else {
            continue;
        };
        let url = entry.get("fileUrl").and_then(Value::as_str).unwrap_or("");
        map.insert(idx as i32, url.to_string());
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

fn strip_nutexb_extension(filename: &str) -> &str {
    filename
        .strip_suffix(".nutexb")
        .or_else(|| filename.strip_suffix(".NUTEXB"))
        .unwrap_or(filename)
}

fn file_url_for_target(json_dir: &Path, target: &Path) -> String {
    let rel = target
        .strip_prefix(json_dir)
        .map(Path::to_path_buf)
        .unwrap_or_else(|_| target.to_path_buf());
    format!(".\\{}", rel.to_string_lossy().replace('/', "\\"))
}

fn resolve_file_path(json_dir: &Path, file_url: &str) -> PathBuf {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    json_dir.join(cleaned)
}

fn sanitize_nutexb_filename(filename: &str) -> Result<String, String> {
    let raw = filename.trim();
    if raw.is_empty() {
        return Err("Weapon icon filename cannot be empty.".to_string());
    }
    if raw.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        return Err(format!("Invalid weapon icon filename: {raw}"));
    }
    let trimmed = file_basename(raw);
    if !trimmed.to_ascii_lowercase().ends_with(".nutexb") {
        return Err(format!(
            "Weapon icon filename must end with .nutexb: {trimmed}"
        ));
    }
    Ok(trimmed)
}

fn ensure_filename_available(sub_file_data: &[Value], filename: &str) -> Result<(), String> {
    let key = file_basename(filename).to_ascii_lowercase();
    for entry in sub_file_data {
        let url = entry.get("fileUrl").and_then(Value::as_str).unwrap_or("");
        if file_basename(url).to_ascii_lowercase() == key {
            return Err(format!(
                "A file named {filename} already exists in SubFileData."
            ));
        }
    }
    Ok(())
}

fn reindex_sub_file_data(entries: &mut [Value]) {
    for (index, entry) in entries.iter_mut().enumerate() {
        if let Some(obj) = entry.as_object_mut() {
            obj.insert("index".to_string(), json!(index));
        }
    }
}

fn remove_file_if_safe(model_root: &Path, path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let root = fs::canonicalize(model_root).map_err(|e| {
        format!(
            "Failed to canonicalize model root {}: {e}",
            model_root.display()
        )
    })?;
    let target = fs::canonicalize(path)
        .map_err(|e| format!("Failed to canonicalize weapon icon {}: {e}", path.display()))?;
    if !target.starts_with(&root) {
        return Err(format!(
            "Refusing to delete weapon icon outside unit root: {}",
            target.display()
        ));
    }
    fs::remove_file(&target)
        .map_err(|e| format!("Failed to delete weapon icon {}: {e}", target.display()))
}
