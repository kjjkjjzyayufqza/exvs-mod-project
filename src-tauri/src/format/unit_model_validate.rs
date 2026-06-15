use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::format::fhm2d::SubFileStructureEntry;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelValidationError {
    pub phase: String,
    pub model: Option<String>,
    pub message: String,
    pub path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelValidationSummary {
    pub model_count: usize,
    pub numatb_count: usize,
    pub nuhlpb_count: usize,
    pub shl_count: usize,
    pub shl_declared_model_count: Option<usize>,
    pub texture_reference_count: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelValidationResult {
    pub valid: bool,
    pub model_root: String,
    pub structure_json_path: String,
    pub summary: UnitModelValidationSummary,
    pub errors: Vec<UnitModelValidationError>,
    pub warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputSubFileData {
    #[allow(dead_code)]
    index: usize,
    file_type: String,
    file_index: i32,
    file_url: String,
    #[allow(dead_code)]
    file_base_name: Option<String>,
}

#[derive(Deserialize)]
struct InputStructure {
    #[serde(rename = "Fhm2dTotalCount")]
    fhm2d_total_count: Option<usize>,
    #[serde(rename = "SubFileData")]
    sub_file_data: Vec<InputSubFileData>,
    #[serde(rename = "SubFileStructure")]
    sub_file_structure: Vec<SubFileStructureEntry>,
}

#[derive(Debug)]
enum StructureNode {
    Folder {
        entry_index: usize,
        folder_count: i32,
        unk3: i32,
        unk5: i32,
        children: Vec<StructureNode>,
    },
    Item {
        entry_index: usize,
        file_index: i32,
        unk2: String,
        unk3: i32,
        display_name: Option<String>,
    },
}

impl StructureNode {
    fn children(&self) -> &[StructureNode] {
        match self {
            StructureNode::Folder { children, .. } => children,
            StructureNode::Item { .. } => &[],
        }
    }

    fn folder_attrs(&self) -> Option<(usize, i32, i32, i32)> {
        match self {
            StructureNode::Folder {
                entry_index,
                folder_count,
                unk3,
                unk5,
                ..
            } => Some((*entry_index, *folder_count, *unk3, *unk5)),
            StructureNode::Item { .. } => None,
        }
    }

    fn item_attrs(&self) -> Option<(usize, i32, &str, i32, Option<&str>)> {
        match self {
            StructureNode::Item {
                entry_index,
                file_index,
                unk2,
                unk3,
                display_name,
            } => Some((
                *entry_index,
                *file_index,
                unk2.as_str(),
                *unk3,
                display_name.as_deref(),
            )),
            StructureNode::Folder { .. } => None,
        }
    }
}

pub fn validate_unit_model_for_repack(
    model_root: &str,
    structure_json_path: Option<&str>,
) -> UnitModelValidationResult {
    let model_root_path = Path::new(model_root);
    let resolved_structure_path =
        resolve_structure_json_path(model_root_path, structure_json_path.unwrap_or_default());
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut summary = UnitModelValidationSummary {
        model_count: 0,
        numatb_count: 0,
        nuhlpb_count: 0,
        shl_count: 0,
        shl_declared_model_count: None,
        texture_reference_count: 0,
    };

    if !model_root_path.is_dir() {
        push_error(
            &mut errors,
            "input",
            None,
            format!(
                "Unit model root is not a directory: {}",
                model_root_path.display()
            ),
            Some(model_root_path),
        );
    }

    let Some(structure_path) = resolved_structure_path else {
        push_error(
            &mut errors,
            "input",
            None,
            "Cannot resolve sibling *_structure.json for the selected unit model folder.",
            Some(model_root_path),
        );
        return finish_result(model_root, "", summary, errors, warnings);
    };

    if !structure_path.is_file() {
        push_error(
            &mut errors,
            "structure",
            None,
            format!("Missing structure JSON: {}", structure_path.display()),
            Some(&structure_path),
        );
        return finish_result(
            model_root,
            &structure_path.to_string_lossy(),
            summary,
            errors,
            warnings,
        );
    }

    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));
    let input = match read_structure_json(&structure_path) {
        Ok(v) => v,
        Err(e) => {
            push_error(&mut errors, "structure", None, e, Some(&structure_path));
            return finish_result(
                model_root,
                &structure_path.to_string_lossy(),
                summary,
                errors,
                warnings,
            );
        }
    };

    if let Some(total) = input.fhm2d_total_count {
        if total != input.sub_file_data.len() {
            push_error(
                &mut errors,
                "structure",
                None,
                format!(
                    "Fhm2dTotalCount is {total}, but SubFileData has {} entries.",
                    input.sub_file_data.len()
                ),
                Some(&structure_path),
            );
        }
    }

    let data_by_index = build_file_index_map(&input.sub_file_data, &mut errors);
    let forest = parse_structure_forest(&input.sub_file_structure, &mut errors);
    let all_items = collect_all_items(&forest);

    summary.numatb_count = count_items_by_ext(&all_items, &data_by_index, ".numatb");
    summary.nuhlpb_count = count_items_by_ext(&all_items, &data_by_index, ".nuhlpb");
    summary.shl_count = count_items_by_ext(&all_items, &data_by_index, ".shl");

    validate_nuhlpb_files(&all_items, &data_by_index, json_dir, &mut errors);
    validate_legacy_root_files(&input.sub_file_data, json_dir, &mut summary, &mut warnings);

    let mut model_ord = 0usize;
    for node in forest.iter() {
        collect_and_validate_model_groups(
            node,
            &data_by_index,
            json_dir,
            &mut model_ord,
            &mut summary,
            &mut errors,
            &mut warnings,
        );
    }
    summary.model_count = model_ord;

    if summary.model_count == 0 {
        push_error(
            &mut errors,
            "models",
            None,
            "No unit SSBH model groups were found in SubFileStructure.",
            Some(&structure_path),
        );
    }

    if summary.nuhlpb_count != summary.model_count {
        push_error(
            &mut errors,
            "nuhlpb",
            None,
            format!(
                "nuhlpb/model count mismatch: expected {} .nuhlpb files, found {}.",
                summary.model_count, summary.nuhlpb_count
            ),
            Some(model_root_path),
        );
    }

    // The SHLL header count is NOT a per-model count: real packages declare one 0x20 entry per
    // shader/material slot, so the value legitimately exceeds the model-group count (e.g. 0xABE08869
    // declares 12 for 8 models). Surface a mismatch as an informational warning instead of blocking
    // repack. Model add/remove never rewrites shl shader bindings (see decision #6); the operator
    // edits shl manually when needed.
    if let Some(shl_model_count) = summary.shl_declared_model_count {
        if shl_model_count < summary.model_count {
            warnings.push(format!(
                "Legacy SHL declares only {shl_model_count} shader slots but the structure has {} model groups; the shell may be stale.",
                summary.model_count
            ));
        } else if shl_model_count != summary.model_count {
            warnings.push(format!(
                "SHL declares {shl_model_count} shader slots for {} model groups (shader slots are per-material, not per-model).",
                summary.model_count
            ));
        }
    }

    finish_result(
        model_root,
        &structure_path.to_string_lossy(),
        summary,
        errors,
        warnings,
    )
}

fn finish_result(
    model_root: &str,
    structure_json_path: &str,
    summary: UnitModelValidationSummary,
    errors: Vec<UnitModelValidationError>,
    warnings: Vec<String>,
) -> UnitModelValidationResult {
    UnitModelValidationResult {
        valid: errors.is_empty(),
        model_root: model_root.to_string(),
        structure_json_path: structure_json_path.to_string(),
        summary,
        errors,
        warnings,
    }
}

fn resolve_structure_json_path(model_root: &Path, explicit: &str) -> Option<PathBuf> {
    let trimmed = explicit.trim();
    if !trimmed.is_empty() {
        return Some(PathBuf::from(trimmed));
    }
    let parent = model_root.parent()?;
    let name = model_root.file_name()?.to_string_lossy();
    Some(parent.join(format!("{name}_structure.json")))
}

fn read_structure_json(path: &Path) -> Result<InputStructure, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read structure JSON {}: {e}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse structure JSON {}: {e}", path.display()))
}

fn build_file_index_map<'a>(
    data: &'a [InputSubFileData],
    errors: &mut Vec<UnitModelValidationError>,
) -> HashMap<i32, &'a InputSubFileData> {
    let mut out = HashMap::new();
    for item in data {
        if let Some(prev) = out.insert(item.file_index, item) {
            push_error(
                errors,
                "structure",
                None,
                format!(
                    "Duplicate SubFileData fileIndex {}: '{}' and '{}'.",
                    item.file_index, prev.file_url, item.file_url
                ),
                None::<&Path>,
            );
        }
    }
    out
}

fn parse_structure_forest(
    entries: &[SubFileStructureEntry],
    errors: &mut Vec<UnitModelValidationError>,
) -> Vec<StructureNode> {
    let entries = expand_endmarks(entries, errors);
    let mut cursor = 0usize;
    let mut out = Vec::new();
    while cursor < entries.len() {
        if matches!(entries[cursor], SubFileStructureEntry::EndMark { .. }) {
            cursor += 1;
            continue;
        }
        if let Some(node) = parse_structure_node(&entries, &mut cursor, errors) {
            out.push(node);
        } else {
            cursor += 1;
        }
    }
    out
}

fn expand_endmarks(
    entries: &[SubFileStructureEntry],
    errors: &mut Vec<UnitModelValidationError>,
) -> Vec<SubFileStructureEntry> {
    let mut out = Vec::with_capacity(entries.len());
    for (idx, entry) in entries.iter().enumerate() {
        match entry {
            SubFileStructureEntry::EndMark { end_mark_count } => {
                if *end_mark_count <= 0 {
                    push_error(
                        errors,
                        "structure",
                        None,
                        format!("EndMark entry {idx} has invalid endMarkCount {end_mark_count}."),
                        None::<&Path>,
                    );
                    continue;
                }
                for _ in 0..*end_mark_count {
                    out.push(SubFileStructureEntry::EndMark { end_mark_count: 1 });
                }
            }
            other => out.push(other.clone()),
        }
    }
    out
}

fn parse_structure_node(
    entries: &[SubFileStructureEntry],
    cursor: &mut usize,
    errors: &mut Vec<UnitModelValidationError>,
) -> Option<StructureNode> {
    let entry_index = *cursor;
    match entries.get(*cursor)? {
        SubFileStructureEntry::Folder {
            folder_count,
            unk3,
            unk5,
            ..
        } => {
            if *folder_count < 0 {
                push_error(
                    errors,
                    "structure",
                    None,
                    format!("Folder entry {entry_index} has negative folderCount {folder_count}."),
                    None::<&Path>,
                );
                *cursor += 1;
                return Some(StructureNode::Folder {
                    entry_index,
                    folder_count: *folder_count,
                    unk3: *unk3,
                    unk5: *unk5,
                    children: Vec::new(),
                });
            }
            *cursor += 1;
            let mut children = Vec::new();
            for _ in 0..(*folder_count as usize) {
                if *cursor >= entries.len() {
                    push_error(
                        errors,
                        "structure",
                        None,
                        format!(
                            "Folder entry {entry_index} ended before all children were parsed."
                        ),
                        None::<&Path>,
                    );
                    break;
                }
                if matches!(entries[*cursor], SubFileStructureEntry::EndMark { .. }) {
                    push_error(
                        errors,
                        "structure",
                        None,
                        format!(
                            "Folder entry {entry_index} hit EndMark before folderCount children."
                        ),
                        None::<&Path>,
                    );
                    break;
                }
                if let Some(child) = parse_structure_node(entries, cursor, errors) {
                    children.push(child);
                }
            }
            if matches!(
                entries.get(*cursor),
                Some(SubFileStructureEntry::EndMark { .. })
            ) {
                *cursor += 1;
            } else {
                push_error(
                    errors,
                    "structure",
                    None,
                    format!("Folder entry {entry_index} is missing a closing EndMark."),
                    None::<&Path>,
                );
            }
            Some(StructureNode::Folder {
                entry_index,
                folder_count: *folder_count,
                unk3: *unk3,
                unk5: *unk5,
                children,
            })
        }
        SubFileStructureEntry::Item {
            file_index,
            unk2,
            unk3,
            display_name,
            ..
        } => {
            *cursor += 1;
            Some(StructureNode::Item {
                entry_index,
                file_index: *file_index,
                unk2: unk2.clone(),
                unk3: *unk3,
                display_name: display_name.clone(),
            })
        }
        SubFileStructureEntry::EndMark { .. } => None,
    }
}

fn collect_all_items<'a>(nodes: &'a [StructureNode]) -> Vec<&'a StructureNode> {
    let mut out = Vec::new();
    for node in nodes {
        collect_all_items_inner(node, &mut out);
    }
    out
}

fn collect_all_items_inner<'a>(node: &'a StructureNode, out: &mut Vec<&'a StructureNode>) {
    if node.item_attrs().is_some() {
        out.push(node);
        return;
    }
    for child in node.children() {
        collect_all_items_inner(child, out);
    }
}

fn collect_and_validate_model_groups(
    node: &StructureNode,
    data_by_index: &HashMap<i32, &InputSubFileData>,
    json_dir: &Path,
    model_ord: &mut usize,
    summary: &mut UnitModelValidationSummary,
    errors: &mut Vec<UnitModelValidationError>,
    warnings: &mut Vec<String>,
) {
    if is_potential_model_group(node, data_by_index) {
        *model_ord += 1;
        validate_model_group(
            node,
            *model_ord,
            data_by_index,
            json_dir,
            summary,
            errors,
            warnings,
        );
        return;
    }

    for child in node.children() {
        collect_and_validate_model_groups(
            child,
            data_by_index,
            json_dir,
            model_ord,
            summary,
            errors,
            warnings,
        );
    }
}

fn is_potential_model_group(
    node: &StructureNode,
    data_by_index: &HashMap<i32, &InputSubFileData>,
) -> bool {
    let children = node.children();
    if children.is_empty() {
        return false;
    }

    let mut ssbh_item_count = 0usize;
    let mut has_texture_container = false;
    for child in children {
        if let Some((_, file_index, _, _, _)) = child.item_attrs() {
            if let Some(file) = data_by_index.get(&file_index) {
                match actual_ext(file).as_str() {
                    ".nusktb" | ".numatb" | ".numshb" | ".numdlb" | ".jnttbl" => {
                        ssbh_item_count += 1;
                    }
                    _ => {}
                }
            }
        } else if is_texture_container_node(child, data_by_index) {
            has_texture_container = true;
        }
    }
    (ssbh_item_count > 0 && has_texture_container) || ssbh_item_count >= 3
}

fn validate_model_group(
    node: &StructureNode,
    ordinal: usize,
    data_by_index: &HashMap<i32, &InputSubFileData>,
    json_dir: &Path,
    summary: &mut UnitModelValidationSummary,
    errors: &mut Vec<UnitModelValidationError>,
    warnings: &mut Vec<String>,
) {
    let direct_items = direct_item_nodes(node);
    let model_name = model_group_name(&direct_items, data_by_index)
        .unwrap_or_else(|| format!("model#{ordinal}"));

    if let Some((entry_index, folder_count, unk3, unk5)) = node.folder_attrs() {
        if folder_count as usize != node.children().len() {
            push_model_error(
                errors,
                "structure",
                &model_name,
                format!(
                    "Model folder entry {entry_index} folderCount is {folder_count}, but parsed {} direct children.",
                    node.children().len()
                ),
                None::<&Path>,
            );
        }
        if unk3 != 0 || unk5 != 0 {
            push_model_error(
                errors,
                "unk",
                &model_name,
                format!("Model folder must use unk3=0 and unk5=0, got unk3={unk3}, unk5={unk5}."),
                None::<&Path>,
            );
        }
    }

    validate_required_model_files(&model_name, &direct_items, data_by_index, json_dir, errors);

    let texture_containers: Vec<&StructureNode> = node
        .children()
        .iter()
        .filter(|child| is_texture_container_node(child, data_by_index))
        .collect();
    // Real unit packages carry one texture container per numatb variant (commonly 2-3 per model:
    // __maya__, optional m001__nust__, __nust__). Each container is paired with the numatb that
    // follows it (validated in validate_numatb_container_pairing), so require at least one rather
    // than a fixed count.
    if texture_containers.is_empty() {
        push_model_error(
            errors,
            "textures",
            &model_name,
            "Expected at least one texture container folder, found none.".to_string(),
            None::<&Path>,
        );
    }

    for container in &texture_containers {
        validate_texture_container(&model_name, container, data_by_index, json_dir, errors);
    }

    validate_numatb_container_pairing(
        &model_name,
        node,
        data_by_index,
        json_dir,
        summary,
        errors,
        warnings,
    );
}

fn validate_required_model_files(
    model_name: &str,
    direct_items: &[&StructureNode],
    data_by_index: &HashMap<i32, &InputSubFileData>,
    json_dir: &Path,
    errors: &mut Vec<UnitModelValidationError>,
) {
    let required_exact = [".nusktb", ".numshb", ".numdlb", ".jnttbl"];
    for ext in required_exact {
        let matches = direct_items_by_ext(direct_items, data_by_index, ext);
        if matches.is_empty() {
            push_model_error(
                errors,
                "models",
                model_name,
                format!("Missing required {ext} file."),
                None::<&Path>,
            );
        } else if matches.len() > 1 {
            push_model_error(
                errors,
                "models",
                model_name,
                format!("Expected exactly 1 {ext} file, found {}.", matches.len()),
                None::<&Path>,
            );
        }
        for item in matches {
            validate_item_file(model_name, item, data_by_index, json_dir, errors);
        }
    }

    let numatb_items = direct_items_by_ext(direct_items, data_by_index, ".numatb");
    if numatb_items.len() < 2 {
        push_model_error(
            errors,
            "models",
            model_name,
            format!(
                "Expected at least 2 .numatb files (__maya__ + __nust__), found {}.",
                numatb_items.len()
            ),
            None::<&Path>,
        );
    }

    let mut has_maya = false;
    let mut has_nust = false;
    for item in &numatb_items {
        if let Some((_, file_index, _, _, _)) = item.item_attrs() {
            if let Some(file) = data_by_index.get(&file_index) {
                let lower = file_basename(&file.file_url).to_ascii_lowercase();
                has_maya |= lower.contains("__maya__") && lower.ends_with(".numatb");
                has_nust |= lower.contains("__nust__") && lower.ends_with(".numatb");
            }
        }
        validate_item_file(model_name, item, data_by_index, json_dir, errors);
    }
    if !has_maya {
        push_model_error(
            errors,
            "models",
            model_name,
            "Missing __maya__.numatb material file.",
            None::<&Path>,
        );
    }
    if !has_nust {
        push_model_error(
            errors,
            "models",
            model_name,
            "Missing __nust__.numatb material file.",
            None::<&Path>,
        );
    }
}

fn validate_item_file(
    model_name: &str,
    item: &StructureNode,
    data_by_index: &HashMap<i32, &InputSubFileData>,
    json_dir: &Path,
    errors: &mut Vec<UnitModelValidationError>,
) {
    let Some((entry_index, file_index, unk2, unk3, display_name)) = item.item_attrs() else {
        return;
    };
    let Some(file) = data_by_index.get(&file_index) else {
        push_model_error(
            errors,
            "structure",
            model_name,
            format!(
                "Item entry {entry_index} references missing SubFileData fileIndex {file_index}."
            ),
            None::<&Path>,
        );
        return;
    };
    let ext = actual_ext(file);
    if let Some(expected) = expected_item_unk2(ext.as_str()) {
        if unk2 != expected {
            let item_label = display_name
                .map(str::to_string)
                .unwrap_or_else(|| file_basename(&file.file_url));
            push_model_error(
                errors,
                "unk",
                model_name,
                format!(
                    "Item '{}' must use unk2={expected}, got {unk2}.",
                    item_label
                ),
                Some(resolve_file_path(json_dir, &file.file_url)),
            );
        }
    }
    if ext != ".numatb" && unk3 != 0 {
        push_model_error(
            errors,
            "unk",
            model_name,
            format!(
                "Item '{}' must use unk3=0, got {unk3}.",
                file_basename(&file.file_url)
            ),
            Some(resolve_file_path(json_dir, &file.file_url)),
        );
    }
    validate_referenced_file_exists(model_name, file, json_dir, errors);
}

fn validate_texture_container(
    model_name: &str,
    container: &StructureNode,
    data_by_index: &HashMap<i32, &InputSubFileData>,
    json_dir: &Path,
    errors: &mut Vec<UnitModelValidationError>,
) {
    let Some((entry_index, folder_count, unk3, unk5)) = container.folder_attrs() else {
        return;
    };
    if folder_count as usize != container.children().len() {
        push_model_error(
            errors,
            "structure",
            model_name,
            format!(
                "Texture container entry {entry_index} folderCount is {folder_count}, but parsed {} direct children.",
                container.children().len()
            ),
            None::<&Path>,
        );
    }
    // unk3 marks a texture container (always 32). unk5 is the material-variant index that mirrors
    // the paired numatb's unk3 (observed values 1 and 2 in real packages), so accept any unk5 >= 1.
    if unk3 != 32 || unk5 < 1 {
        push_model_error(
            errors,
            "unk",
            model_name,
            format!(
                "Texture container must use unk3=32 and unk5>=1, got unk3={unk3}, unk5={unk5}."
            ),
            None::<&Path>,
        );
    }
    for item in direct_item_nodes(container) {
        let Some((_, file_index, _, _, _)) = item.item_attrs() else {
            continue;
        };
        let Some(file) = data_by_index.get(&file_index) else {
            continue;
        };
        if actual_ext(file) != ".nutexb" {
            push_model_error(
                errors,
                "textures",
                model_name,
                format!(
                    "Texture container contains non-.nutexb item '{}'.",
                    file_basename(&file.file_url)
                ),
                Some(resolve_file_path(json_dir, &file.file_url)),
            );
            continue;
        }
        validate_item_file(model_name, item, data_by_index, json_dir, errors);
    }
}

fn validate_numatb_container_pairing(
    model_name: &str,
    model_node: &StructureNode,
    data_by_index: &HashMap<i32, &InputSubFileData>,
    json_dir: &Path,
    summary: &mut UnitModelValidationSummary,
    errors: &mut Vec<UnitModelValidationError>,
    warnings: &mut Vec<String>,
) {
    let children = model_node.children();
    let mut paired_numatb_indices = HashSet::new();

    for i in 0..children.len() {
        let container = &children[i];
        if !is_texture_container_node(container, data_by_index) {
            continue;
        }
        let Some(next) = children.get(i + 1) else {
            push_model_error(
                errors,
                "textures",
                model_name,
                "Texture container is not followed by a paired .numatb item.",
                None::<&Path>,
            );
            continue;
        };
        let Some((_, numatb_file_index, _, _, _)) = next.item_attrs() else {
            push_model_error(
                errors,
                "textures",
                model_name,
                "Texture container is not followed by a paired .numatb item.",
                None::<&Path>,
            );
            continue;
        };
        let Some(numatb_file) = data_by_index.get(&numatb_file_index) else {
            continue;
        };
        if actual_ext(numatb_file) != ".numatb" {
            push_model_error(
                errors,
                "textures",
                model_name,
                format!(
                    "Texture container is followed by '{}', not a .numatb item.",
                    file_basename(&numatb_file.file_url)
                ),
                Some(resolve_file_path(json_dir, &numatb_file.file_url)),
            );
            continue;
        }

        paired_numatb_indices.insert(numatb_file_index);
        let texture_names = texture_names_in_container(container, data_by_index);
        let numatb_path = resolve_file_path(json_dir, &numatb_file.file_url);
        let refs = collect_numatb_texture_refs(&numatb_path, warnings, errors, model_name);
        summary.texture_reference_count += refs.len();
        for ref_name in refs {
            let key = ref_name.to_ascii_lowercase();
            if key.is_empty() || key == ".nutexb" {
                continue;
            }
            if !texture_names.contains(&key) {
                push_model_error(
                    errors,
                    "textures",
                    model_name,
                    format!(
                        "Paired numatb '{}' references '{}' but it is not in its texture container.",
                        file_basename(&numatb_file.file_url),
                        ref_name
                    ),
                    Some(numatb_path.clone()),
                );
            }
        }
    }

    for item in direct_items_by_ext(&direct_item_nodes(model_node), data_by_index, ".numatb") {
        let Some((_, file_index, _, _, _)) = item.item_attrs() else {
            continue;
        };
        if paired_numatb_indices.contains(&file_index) {
            continue;
        }
        if let Some(file) = data_by_index.get(&file_index) {
            warnings.push(format!(
                "Model '{}': extra numatb '{}' is not paired with a texture container; only file and unk fields were validated.",
                model_name,
                file_basename(&file.file_url)
            ));
        }
    }
}

fn collect_numatb_texture_refs(
    path: &Path,
    warnings: &mut Vec<String>,
    errors: &mut Vec<UnitModelValidationError>,
    model_name: &str,
) -> Vec<String> {
    let data = match fs::read(path) {
        Ok(v) => v,
        Err(e) => {
            push_model_error(
                errors,
                "numatb",
                model_name,
                format!("Failed to read numatb {}: {e}", path.display()),
                Some(path),
            );
            return Vec::new();
        }
    };
    let mut cursor = Cursor::new(&data);
    let matl = match ssbh_data::prelude::MatlData::read(&mut cursor) {
        Ok(v) => v,
        Err(e) => {
            push_model_error(
                errors,
                "numatb",
                model_name,
                format!("Failed to parse numatb {}: {e}", path.display()),
                Some(path),
            );
            return Vec::new();
        }
    };

    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for entry in &matl.entries {
        for tex in &entry.textures {
            push_texture_ref(tex.data.as_str(), &mut seen, &mut out);
        }
        for tex in &entry.textures2 {
            push_texture_ref(tex.data.as_str(), &mut seen, &mut out);
        }
    }
    if out.is_empty() {
        warnings.push(format!(
            "Model '{}': numatb '{}' has no non-empty texture references.",
            model_name,
            path.display()
        ));
    }
    out
}

fn push_texture_ref(raw: &str, seen: &mut HashSet<String>, out: &mut Vec<String>) {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return;
    }
    let base = trimmed
        .replace('\\', "/")
        .split('/')
        .last()
        .unwrap_or(trimmed)
        .to_string();
    let nutexb = if base.to_ascii_lowercase().ends_with(".nutexb") {
        base
    } else {
        format!("{base}.nutexb")
    };
    if seen.insert(nutexb.to_ascii_lowercase()) {
        out.push(nutexb);
    }
}

fn validate_nuhlpb_files(
    all_items: &[&StructureNode],
    data_by_index: &HashMap<i32, &InputSubFileData>,
    json_dir: &Path,
    errors: &mut Vec<UnitModelValidationError>,
) {
    for item in all_items.iter().copied() {
        let Some((_, file_index, _, _, _)) = item.item_attrs() else {
            continue;
        };
        let Some(file) = data_by_index.get(&file_index) else {
            continue;
        };
        if actual_ext(file) == ".nuhlpb" {
            validate_referenced_file_exists("unit", file, json_dir, errors);
        }
    }
}

fn validate_legacy_root_files(
    sub_file_data: &[InputSubFileData],
    json_dir: &Path,
    summary: &mut UnitModelValidationSummary,
    warnings: &mut Vec<String>,
) {
    let shl_files: Vec<&InputSubFileData> = sub_file_data
        .iter()
        .filter(|file| is_legacy_root_control_file(file) && actual_ext(file) == ".shl")
        .collect();

    if shl_files.len() != 1 {
        warnings.push(format!(
            "Legacy SHL check: expected exactly 1 shell_*.shl file, found {}.",
            shl_files.len()
        ));
    }

    for file in sub_file_data
        .iter()
        .filter(|file| is_legacy_root_control_file(file))
    {
        let path = resolve_file_path(json_dir, &file.file_url);
        if !path.is_file() {
            if actual_ext(file) == ".shl" {
                warnings.push(format!(
                    "Legacy SHL referenced but missing on disk: {} (resolved: {})",
                    file.file_url,
                    path.display()
                ));
            } else {
                warnings.push(format!(
                    "Legacy root file referenced but missing on disk: {} (resolved: {})",
                    file.file_url,
                    path.display()
                ));
            }
            continue;
        }
        if actual_ext(file) != ".shl" {
            continue;
        }
        match read_shl_model_count(&path) {
            Ok(count) => summary.shl_declared_model_count = Some(count),
            Err(e) => warnings.push(format!("Legacy SHL read warning: {e}")),
        }
    }
}

fn read_shl_model_count(path: &Path) -> Result<usize, String> {
    let bytes =
        fs::read(path).map_err(|e| format!("Failed to read SHL {}: {e}", path.display()))?;
    if bytes.len() < 0x10 {
        return Err(format!(
            "Invalid SHL {}: file is too small ({} bytes).",
            path.display(),
            bytes.len()
        ));
    }
    if bytes.get(0..4) != Some(b"SHLL") {
        return Err(format!(
            "Invalid SHL {}: missing SHLL magic.",
            path.display()
        ));
    }
    let count = u32::from_le_bytes([bytes[0x0c], bytes[0x0d], bytes[0x0e], bytes[0x0f]]) as usize;
    let min_len = 0x10 + count.saturating_mul(0x20);
    if bytes.len() < min_len {
        return Err(format!(
            "Invalid SHL {}: declares {count} models but file has only {} bytes; expected at least {min_len}.",
            path.display(),
            bytes.len()
        ));
    }
    Ok(count)
}

fn direct_item_nodes(node: &StructureNode) -> Vec<&StructureNode> {
    node.children()
        .iter()
        .filter(|child| child.item_attrs().is_some())
        .collect()
}

fn direct_items_by_ext<'a>(
    items: &'a [&'a StructureNode],
    data_by_index: &HashMap<i32, &InputSubFileData>,
    ext: &str,
) -> Vec<&'a StructureNode> {
    items
        .iter()
        .copied()
        .filter(|item| {
            let Some((_, file_index, _, _, _)) = item.item_attrs() else {
                return false;
            };
            data_by_index
                .get(&file_index)
                .map(|file| actual_ext(file) == ext)
                .unwrap_or(false)
        })
        .collect()
}

fn count_items_by_ext(
    items: &[&StructureNode],
    data_by_index: &HashMap<i32, &InputSubFileData>,
    ext: &str,
) -> usize {
    items
        .iter()
        .filter(|item| {
            let Some((_, file_index, _, _, _)) = item.item_attrs() else {
                return false;
            };
            data_by_index
                .get(&file_index)
                .map(|file| actual_ext(file) == ext)
                .unwrap_or(false)
        })
        .count()
}

fn is_texture_container_node(
    node: &StructureNode,
    data_by_index: &HashMap<i32, &InputSubFileData>,
) -> bool {
    let Some((_, _, unk3, _)) = node.folder_attrs() else {
        return false;
    };
    if unk3 == 32 {
        return true;
    }
    let children = node.children();
    !children.is_empty()
        && children.iter().all(|child| {
            let Some((_, file_index, _, _, _)) = child.item_attrs() else {
                return false;
            };
            data_by_index
                .get(&file_index)
                .map(|file| actual_ext(file) == ".nutexb")
                .unwrap_or(false)
        })
}

fn texture_names_in_container(
    container: &StructureNode,
    data_by_index: &HashMap<i32, &InputSubFileData>,
) -> HashSet<String> {
    let mut out = HashSet::new();
    for item in direct_item_nodes(container) {
        let Some((_, file_index, _, _, _)) = item.item_attrs() else {
            continue;
        };
        let Some(file) = data_by_index.get(&file_index) else {
            continue;
        };
        if actual_ext(file) == ".nutexb" {
            out.insert(file_basename(&file.file_url).to_ascii_lowercase());
        }
    }
    out
}

fn model_group_name(
    direct_items: &[&StructureNode],
    data_by_index: &HashMap<i32, &InputSubFileData>,
) -> Option<String> {
    direct_items.iter().find_map(|item| {
        let (_, file_index, _, _, _) = item.item_attrs()?;
        let file = data_by_index.get(&file_index)?;
        if actual_ext(file) == ".numdlb" {
            Some(file_stem(&file.file_url))
        } else {
            None
        }
    })
}

fn validate_referenced_file_exists(
    model_name: &str,
    file: &InputSubFileData,
    json_dir: &Path,
    errors: &mut Vec<UnitModelValidationError>,
) {
    let path = resolve_file_path(json_dir, &file.file_url);
    if !path.is_file() {
        push_model_error(
            errors,
            "files",
            model_name,
            format!("Referenced file is missing on disk: {}", file.file_url),
            Some(path),
        );
    }
}

fn expected_item_unk2(ext: &str) -> Option<&'static str> {
    match ext {
        ".nusktb" => Some("10000000"),
        ".numatb" => Some("21000000"),
        ".numshb" => Some("30000000"),
        ".numdlb" => Some("40000000"),
        ".jnttbl" => Some("50000000"),
        ".nutexb" => Some("00000000"),
        _ => None,
    }
}

fn actual_ext(file: &InputSubFileData) -> String {
    let name = file_basename(&file.file_url);
    let ext = extension_from_name(&name);
    if !ext.is_empty() {
        return ext;
    }
    file.file_type.to_ascii_lowercase()
}

fn is_legacy_root_control_file(file: &InputSubFileData) -> bool {
    let cleaned = file.file_url.replace('\\', "/");
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

fn file_stem(file_url: &str) -> String {
    let name = file_basename(file_url);
    match name.rfind('.') {
        Some(idx) if idx > 0 => name[..idx].to_string(),
        _ => name,
    }
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

fn push_model_error(
    errors: &mut Vec<UnitModelValidationError>,
    phase: &str,
    model: &str,
    message: impl Into<String>,
    path: Option<impl AsRef<Path>>,
) {
    errors.push(UnitModelValidationError {
        phase: phase.to_string(),
        model: Some(model.to_string()),
        message: message.into(),
        path: path.map(|p| p.as_ref().to_string_lossy().into()),
    });
}

fn push_error(
    errors: &mut Vec<UnitModelValidationError>,
    phase: &str,
    model: Option<&str>,
    message: impl Into<String>,
    path: Option<impl AsRef<Path>>,
) {
    errors.push(UnitModelValidationError {
        phase: phase.to_string(),
        model: model.map(str::to_string),
        message: message.into(),
        path: path.map(|p| p.as_ref().to_string_lossy().into()),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn shl_count_is_read_from_offset_0x0c() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("shell_test.shl");
        let mut bytes = vec![0u8; 0x10 + 3 * 0x20];
        bytes[0..4].copy_from_slice(b"SHLL");
        bytes[0x0c..0x10].copy_from_slice(&3u32.to_le_bytes());
        fs::write(&path, bytes).unwrap();

        assert_eq!(read_shl_model_count(&path).unwrap(), 3);
    }

    #[test]
    fn actual_ext_prefers_file_url_for_jnttbl_and_shl() {
        let jnttbl = InputSubFileData {
            index: 0,
            file_type: ".bin".into(),
            file_index: 0,
            file_url: r".\pkg\model.jnttbl".into(),
            file_base_name: None,
        };
        let shl = InputSubFileData {
            index: 1,
            file_type: ".bin".into(),
            file_index: 1,
            file_url: r".\pkg\shell_model.shl".into(),
            file_base_name: None,
        };

        assert_eq!(actual_ext(&jnttbl), ".jnttbl");
        assert_eq!(actual_ext(&shl), ".shl");
    }

    #[test]
    fn real_sample_0xa258a522_reports_missing_legacy_root_files_as_warnings_when_present() {
        let model_root = Path::new(r"E:\XB\解包\com\file\0xA258a522");
        let structure = Path::new(r"E:\XB\解包\com\file\0xA258a522_structure.json");
        if !model_root.exists() || !structure.exists() {
            eprintln!("SKIP: real unit model sample 0xA258a522 is not present.");
            return;
        }

        let result = validate_unit_model_for_repack(
            model_root.to_str().unwrap(),
            Some(structure.to_str().unwrap()),
        );
        let expected_missing = [
            "characterid_015gndmuc_004deltpl_001.bin",
            "shell_015gndmuc_004deltpl_001.shl",
            "vernier_table_015gndmuc_004deltpl_001.bin",
            "effect_project_015gndmuc_004deltpl_001.bin",
        ];

        for name in expected_missing {
            assert!(
                !result
                    .errors
                    .iter()
                    .any(|error| error.message.contains(name)),
                "missing legacy root file should not block validation ({name}): errors={}",
                serde_json::to_string_pretty(&result.errors).unwrap()
            );
            assert!(
                result.warnings.iter().any(|warning| warning.contains(name)),
                "missing legacy root file should surface as warning ({name}): warnings={}",
                serde_json::to_string_pretty(&result.warnings).unwrap()
            );
        }
    }

    #[test]
    fn real_sample_0xaf73362c_validates_when_present() {
        let model_root = Path::new(r"E:\XB\解包\com\file\0xAF73362C");
        let structure = Path::new(r"E:\XB\解包\com\file\0xAF73362C_structure.json");
        if !model_root.exists() || !structure.exists() {
            eprintln!("SKIP: real unit model sample is not present.");
            return;
        }

        let result = validate_unit_model_for_repack(
            model_root.to_str().unwrap(),
            Some(structure.to_str().unwrap()),
        );

        assert!(
            result.valid,
            "expected real sample to validate, errors={}",
            serde_json::to_string_pretty(&result.errors).unwrap()
        );
        assert_eq!(result.summary.model_count, 14);
        assert_eq!(result.summary.nuhlpb_count, 14);
        assert_eq!(result.summary.shl_declared_model_count, Some(14));
    }

    #[test]
    fn real_sample_0xaf73362c_repack_smoke_when_present() {
        let model_root = Path::new(r"E:\XB\解包\com\file\0xAF73362C");
        let structure = Path::new(r"E:\XB\解包\com\file\0xAF73362C_structure.json");
        if !model_root.exists() || !structure.exists() {
            eprintln!("SKIP: real unit model sample is not present.");
            return;
        }

        let validation = validate_unit_model_for_repack(
            model_root.to_str().unwrap(),
            Some(structure.to_str().unwrap()),
        );
        assert!(
            validation.valid,
            "expected real sample to validate before repack, errors={}",
            serde_json::to_string_pretty(&validation.errors).unwrap()
        );

        let tmp = tempfile::tempdir().unwrap();
        let output = tmp.path().join("0xAF73362C.fhm2d");
        let repack = crate::format::fhm2d_pack::repack_fhm2d_from_structure(
            structure.to_str().unwrap(),
            output.to_str().unwrap(),
            true,
            None,
        )
        .unwrap();

        assert_eq!(repack.total_files, 141);
        assert!(repack.output_size > 0);
        assert!(output.is_file());
    }

    #[test]
    fn missing_structure_json_is_reported() {
        let tmp = tempfile::tempdir().unwrap();
        let model_root = tmp.path().join("0xTEST");
        fs::create_dir_all(&model_root).unwrap();

        let result = validate_unit_model_for_repack(model_root.to_str().unwrap(), None);

        assert!(!result.valid);
        assert!(result
            .errors
            .iter()
            .any(|e| e.phase == "structure" && e.message.contains("Missing structure JSON")));
    }

    #[test]
    fn fhm2d_total_count_mismatch_is_reported() {
        let tmp = tempfile::tempdir().unwrap();
        let model_root = tmp.path().join("0xTEST");
        fs::create_dir_all(&model_root).unwrap();
        let structure = tmp.path().join("0xTEST_structure.json");
        let value = json!({
            "Magic": 10,
            "Fhm2dTotalCount": 2,
            "UnkCount": 0,
            "SubFileData": [],
            "SubFileStructure": []
        });
        fs::write(&structure, serde_json::to_string_pretty(&value).unwrap()).unwrap();

        let result = validate_unit_model_for_repack(
            model_root.to_str().unwrap(),
            Some(structure.to_str().unwrap()),
        );

        assert!(!result.valid);
        assert!(result
            .errors
            .iter()
            .any(|e| e.phase == "structure" && e.message.contains("Fhm2dTotalCount")));
    }

    #[test]
    fn model_group_without_texture_containers_is_still_validated() {
        let tmp = tempfile::tempdir().unwrap();
        let model_root = tmp.path().join("0xTEST");
        fs::create_dir_all(&model_root).unwrap();
        let files = [
            ("model.nusktb", ".nusktb", "10000000"),
            ("model__maya__.numatb", ".numatb", "21000000"),
            ("model__nust__.numatb", ".numatb", "21000000"),
            ("model.numshb", ".numshb", "30000000"),
            ("model.numdlb", ".numdlb", "40000000"),
            ("model.jnttbl", ".bin", "50000000"),
        ];
        for (name, _, _) in files {
            fs::write(model_root.join(name), b"stub").unwrap();
        }

        let sub_file_data: Vec<_> = files
            .iter()
            .enumerate()
            .map(|(index, (name, file_type, _))| {
                json!({
                    "index": index,
                    "fileType": file_type,
                    "fileIndex": index as i32,
                    "fileUrl": format!(".\\0xTEST\\{name}"),
                    "fileBaseName": null
                })
            })
            .collect();
        let mut sub_file_structure = vec![json!({
            "type": "Folder",
            "unk1": "00000000",
            "folderCount": files.len() as i32,
            "unk2": "00000000",
            "unk2_1": 0,
            "unk3": 0,
            "unk4": 0,
            "unk5": 0,
            "unk6": 0
        })];
        for (index, (_, _, unk2)) in files.iter().enumerate() {
            sub_file_structure.push(json!({
                "type": "Item",
                "unk1": "00000000",
                "fileIndex": index as i32,
                "unk2": unk2,
                "unk2_1": 0,
                "unk3": if *unk2 == "21000000" { 1 } else { 0 },
                "unk4": 0,
                "originalFileIndex": index as i32,
                "Name": null
            }));
        }
        sub_file_structure.push(json!({
            "type": "EndMark",
            "endMarkCount": 1
        }));

        let structure = tmp.path().join("0xTEST_structure.json");
        let value = json!({
            "Magic": 10,
            "Fhm2dTotalCount": files.len(),
            "UnkCount": 0,
            "SubFileData": sub_file_data,
            "SubFileStructure": sub_file_structure
        });
        fs::write(&structure, serde_json::to_string_pretty(&value).unwrap()).unwrap();

        let result = validate_unit_model_for_repack(
            model_root.to_str().unwrap(),
            Some(structure.to_str().unwrap()),
        );

        assert_eq!(result.summary.model_count, 1);
        assert!(result
            .errors
            .iter()
            .any(|e| { e.phase == "textures" && e.message.contains("found none") }));
    }
}
