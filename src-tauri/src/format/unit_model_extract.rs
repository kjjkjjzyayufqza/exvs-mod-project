//! Unit-model FHM2D extraction into a renamed, regrouped, deduped folder layout.
//!
//! Unlike the generic numeric extractor, this produces the editor-friendly layout agreed for the
//! Unit Model Editor: one folder per model, a shared `textures/` pool, a separate `weapon_icon/`
//! group, plus `ragdoll/`, `nudnbb/`, and the outermost control bins. The on-disk layout is
//! decoupled from the canonical `SubFileStructure` tree via each file's `fileUrl`; the tree is
//! carried through verbatim from the in-memory extraction, so the logical content (decoded payloads
//! + structure tree) round-trips through repack unchanged. Naming is already applied by
//! [`extract_fhm2d_to_memory_impl`] (numdlb-MODL driven + `.bin` reinterpretation); this module only
//! re-folders the physical files and rewrites their `fileUrl`.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::json;

use crate::format::fhm2d::{
    extract_fhm2d_to_memory_impl, Fhm2dFormat, InMemoryFhm2dExtraction, SubFileStructureEntry,
};

/// Result of a unit-model folder extraction.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelExtractResult {
    pub model_root: String,
    pub structure_json_path: String,
    pub total_files: usize,
    pub model_count: usize,
}

/// Parsed view of the flat `SubFileStructure` as a nested tree.
enum TreeNode {
    Folder {
        children: Vec<TreeNode>,
    },
    Item {
        file_index: i32,
        name: Option<String>,
    },
}

/// Extract a unit-model `.fhm2d` into the renamed/regrouped/deduped folder layout at `out_root`.
///
/// Writes `<out_root>/...` plus the sibling `<out_root>_structure.json`. The structure JSON repacks
/// to a logically identical archive (same decoded payloads + same tree).
pub fn extract_unit_model_fhm2d_to_folder_impl(
    source_path: &str,
    out_root: &str,
) -> Result<UnitModelExtractResult, String> {
    let bytes =
        fs::read(source_path).map_err(|e| format!("Failed to read fhm2d {source_path}: {e}"))?;
    let out_root_path = PathBuf::from(out_root.trim());
    let out_name = out_root_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid output root: {out_root}"))?
        .to_string();
    let json_dir = out_root_path
        .parent()
        .ok_or_else(|| format!("Output root has no parent dir: {out_root}"))?
        .to_path_buf();

    let ext = extract_fhm2d_to_memory_impl(&bytes, &out_name, Some(Fhm2dFormat::Character))?;

    let file_ext_by_index: HashMap<i32, String> = ext
        .files
        .iter()
        .map(|f| (f.file_index, file_extension(&f.file_url)))
        .collect();
    let file_name_by_index: HashMap<i32, String> = ext
        .files
        .iter()
        .map(|f| (f.file_index, file_basename(&f.file_url)))
        .collect();

    let root = parse_tree(&ext.sub_file_structure)?;
    let mut warnings: Vec<String> = Vec::new();
    let placements = classify_placements(&root, &file_ext_by_index, &mut warnings)?;
    let model_count = count_models(&placements);

    // Write each pool file once into its semantic folder, building the new SubFileData.
    let mut sub_file_data = Vec::with_capacity(ext.files.len());
    for (index, file) in ext.files.iter().enumerate() {
        let filename = file_name_by_index
            .get(&file.file_index)
            .cloned()
            .ok_or_else(|| format!("Missing filename for fileIndex {}", file.file_index))?;
        let folder = placements
            .get(&file.file_index)
            .cloned()
            .unwrap_or_default();

        let mut dest_dir = out_root_path.clone();
        if !folder.is_empty() {
            dest_dir = dest_dir.join(&folder);
        }
        fs::create_dir_all(&dest_dir)
            .map_err(|e| format!("Failed to create {}: {e}", dest_dir.display()))?;
        let dest = dest_dir.join(&filename);
        fs::write(&dest, &file.data)
            .map_err(|e| format!("Failed to write {}: {e}", dest.display()))?;

        let file_url = build_unit_file_url(&out_name, &folder, &filename);
        sub_file_data.push(json!({
            "index": index,
            "fileType": file.file_type,
            "fileIndex": file.file_index,
            "fileUrl": file_url,
            "fileBaseName": strip_ext(&filename),
        }));
    }

    let structure_value = json!({
        "Magic": ext.meta_header,
        "Fhm2dTotalCount": ext.files.len(),
        "UnkCount": ext.unk_count,
        "SubFileData": sub_file_data,
        "SubFileStructure": ext.sub_file_structure,
    });

    let structure_path = json_dir.join(format!("{out_name}_structure.json"));
    let raw = serde_json::to_string_pretty(&structure_value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    fs::write(&structure_path, format!("{raw}\n"))
        .map_err(|e| format!("Failed to write {}: {e}", structure_path.display()))?;

    Ok(UnitModelExtractResult {
        model_root: out_root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        total_files: ext.files.len(),
        model_count,
    })
}

/// For testing/reuse: classify pool files without touching disk.
pub fn classify_unit_model_placements(
    ext: &InMemoryFhm2dExtraction,
) -> Result<(HashMap<i32, String>, Vec<String>), String> {
    let file_ext_by_index: HashMap<i32, String> = ext
        .files
        .iter()
        .map(|f| (f.file_index, file_extension(&f.file_url)))
        .collect();
    let root = parse_tree(&ext.sub_file_structure)?;
    let mut warnings = Vec::new();
    let placements = classify_placements(&root, &file_ext_by_index, &mut warnings)?;
    Ok((placements, warnings))
}

fn count_models(placements: &HashMap<i32, String>) -> usize {
    placements
        .values()
        .filter(|folder| folder.starts_with("models\\"))
        .map(|folder| folder.as_str())
        .collect::<std::collections::HashSet<_>>()
        .len()
}

/// Token form of `SubFileStructure`: each `EndMark{count}` is expanded into `count` `End` tokens,
/// because one EndMark entry can close multiple nested folders at once (mirrors `build_parse_tree`).
enum Token {
    Folder,
    Item {
        file_index: i32,
        name: Option<String>,
    },
    End,
}

/// Parse the flat pre-order `SubFileStructure` into a nested tree. Returns the single root folder.
fn parse_tree(entries: &[SubFileStructureEntry]) -> Result<TreeNode, String> {
    let tokens = expand_tokens(entries);
    let mut cursor = 0usize;
    let mut top = parse_level(&tokens, &mut cursor);
    if top.len() != 1 {
        return Err(format!(
            "Expected exactly one root folder in SubFileStructure, found {}",
            top.len()
        ));
    }
    match top.pop().unwrap() {
        node @ TreeNode::Folder { .. } => Ok(node),
        TreeNode::Item { .. } => Err("Root of SubFileStructure is not a folder".to_string()),
    }
}

fn expand_tokens(entries: &[SubFileStructureEntry]) -> Vec<Token> {
    let mut tokens = Vec::with_capacity(entries.len());
    for entry in entries {
        match entry {
            SubFileStructureEntry::Folder { .. } => tokens.push(Token::Folder),
            SubFileStructureEntry::Item {
                file_index,
                display_name,
                ..
            } => tokens.push(Token::Item {
                file_index: *file_index,
                name: display_name.clone(),
            }),
            SubFileStructureEntry::EndMark { end_mark_count } => {
                for _ in 0..(*end_mark_count).max(0) {
                    tokens.push(Token::End);
                }
            }
        }
    }
    tokens
}

fn parse_level(tokens: &[Token], cursor: &mut usize) -> Vec<TreeNode> {
    let mut out = Vec::new();
    while *cursor < tokens.len() {
        match &tokens[*cursor] {
            Token::Folder => {
                *cursor += 1;
                let children = parse_level(tokens, cursor);
                out.push(TreeNode::Folder { children });
            }
            Token::Item { file_index, name } => {
                out.push(TreeNode::Item {
                    file_index: *file_index,
                    name: name.clone(),
                });
                *cursor += 1;
            }
            Token::End => {
                *cursor += 1;
                return out;
            }
        }
    }
    out
}

const MODEL_DIRECT_EXTS: &[&str] = &[".nusktb", ".numatb", ".numshb", ".numdlb", ".jnttbl"];

/// Map every pool `fileIndex` to its semantic on-disk folder (relative, backslash-joined).
/// Empty string => place at the layout root (control bins).
fn classify_placements(
    root: &TreeNode,
    file_ext_by_index: &HashMap<i32, String>,
    warnings: &mut Vec<String>,
) -> Result<HashMap<i32, String>, String> {
    let mut out: HashMap<i32, String> = HashMap::new();
    let TreeNode::Folder { children, .. } = root else {
        return Err("Root is not a folder".to_string());
    };

    let mut weapon_icon: Vec<i32> = Vec::new();

    for child in children {
        match child {
            TreeNode::Item { file_index, .. } => {
                // Outermost control bins (characterid / shell / vernier_table / effect_project).
                out.entry(*file_index).or_insert_with(String::new);
            }
            TreeNode::Folder {
                children: group_children,
                ..
            } => {
                let role = classify_group(child, file_ext_by_index);
                match role {
                    GroupRole::Models => {
                        for mg in group_children {
                            if let TreeNode::Folder { .. } = mg {
                                place_model_group(mg, file_ext_by_index, &mut out, warnings);
                            }
                        }
                    }
                    GroupRole::WeaponIcon => {
                        collect_direct_items(child, &mut weapon_icon);
                    }
                    GroupRole::Nuhlpb => {
                        assign_direct_items(child, "nuhlpb", &mut out);
                    }
                    GroupRole::Ragdoll => {
                        assign_all_items(child, "ragdoll", &mut out);
                    }
                    GroupRole::Nudnbb => {
                        assign_all_items(child, "nudnbb", &mut out);
                    }
                    GroupRole::Unknown => {
                        warnings
                            .push("Unclassified root folder placed at layout root.".to_string());
                        assign_all_items(child, "", &mut out);
                    }
                }
            }
        }
    }

    // Every nutexb not in weapon_icon and not already placed belongs to the shared pool.
    for (file_index, ext) in file_ext_by_index {
        if ext == ".nutexb" && !weapon_icon.contains(file_index) && !out.contains_key(file_index) {
            out.insert(*file_index, "textures".to_string());
        }
    }
    for fi in &weapon_icon {
        out.insert(*fi, "weapon_icon".to_string());
    }

    // Any remaining pool file is surfaced (not silently dropped) and parked at root.
    for file_index in file_ext_by_index.keys() {
        if !out.contains_key(file_index) {
            warnings.push(format!(
                "fileIndex {file_index} ({}) could not be classified; placed at root.",
                file_ext_by_index
                    .get(file_index)
                    .cloned()
                    .unwrap_or_default()
            ));
            out.insert(*file_index, String::new());
        }
    }

    Ok(out)
}

enum GroupRole {
    Models,
    WeaponIcon,
    Nuhlpb,
    Ragdoll,
    Nudnbb,
    Unknown,
}

fn classify_group(folder: &TreeNode, file_ext_by_index: &HashMap<i32, String>) -> GroupRole {
    let TreeNode::Folder { children, .. } = folder else {
        return GroupRole::Unknown;
    };

    // Models container: direct children are folders each containing a direct .numdlb item.
    let looks_like_models = children.iter().any(|c| match c {
        TreeNode::Folder { .. } => folder_has_direct_ext(c, ".numdlb", file_ext_by_index),
        TreeNode::Item { .. } => false,
    });
    if looks_like_models {
        return GroupRole::Models;
    }

    let mut all_exts: Vec<String> = Vec::new();
    collect_all_exts(folder, file_ext_by_index, &mut all_exts);
    if all_exts.is_empty() {
        return GroupRole::Unknown;
    }
    if all_exts.iter().all(|e| e == ".nutexb") {
        return GroupRole::WeaponIcon;
    }
    if all_exts.iter().all(|e| e == ".nuhlpb") {
        return GroupRole::Nuhlpb;
    }
    if all_exts.iter().any(|e| e == ".hkt" || e == ".rgdprm") {
        return GroupRole::Ragdoll;
    }
    if all_exts.iter().all(|e| e == ".nudnbb") {
        return GroupRole::Nudnbb;
    }
    GroupRole::Unknown
}

fn place_model_group(
    model_group: &TreeNode,
    file_ext_by_index: &HashMap<i32, String>,
    out: &mut HashMap<i32, String>,
    warnings: &mut Vec<String>,
) {
    let TreeNode::Folder { children, .. } = model_group else {
        return;
    };
    let model_name = children
        .iter()
        .find_map(|c| match c {
            TreeNode::Item { file_index, name } => {
                let ext = file_ext_by_index.get(file_index).map(String::as_str);
                if ext == Some(".numdlb") {
                    name.clone()
                } else {
                    None
                }
            }
            TreeNode::Folder { .. } => None,
        })
        .unwrap_or_else(|| {
            warnings.push("Model group missing a named .numdlb; using 'model'.".to_string());
            "model".to_string()
        });
    let folder = format!("models\\{model_name}");

    // Direct model files (nusktb / numatb / numshb / numdlb / jnttbl) live in the model folder.
    for c in children {
        if let TreeNode::Item { file_index, .. } = c {
            if let Some(ext) = file_ext_by_index.get(file_index) {
                if MODEL_DIRECT_EXTS.contains(&ext.as_str()) {
                    out.insert(*file_index, folder.clone());
                }
            }
        }
    }
}

fn folder_has_direct_ext(
    folder: &TreeNode,
    ext: &str,
    file_ext_by_index: &HashMap<i32, String>,
) -> bool {
    let TreeNode::Folder { children, .. } = folder else {
        return false;
    };
    children.iter().any(|c| match c {
        TreeNode::Item { file_index, .. } => {
            file_ext_by_index.get(file_index).map(String::as_str) == Some(ext)
        }
        TreeNode::Folder { .. } => false,
    })
}

fn collect_direct_items(folder: &TreeNode, out: &mut Vec<i32>) {
    if let TreeNode::Folder { children, .. } = folder {
        for c in children {
            if let TreeNode::Item { file_index, .. } = c {
                if !out.contains(file_index) {
                    out.push(*file_index);
                }
            }
        }
    }
}

fn assign_direct_items(folder: &TreeNode, dest: &str, out: &mut HashMap<i32, String>) {
    if let TreeNode::Folder { children, .. } = folder {
        for c in children {
            if let TreeNode::Item { file_index, .. } = c {
                out.entry(*file_index).or_insert_with(|| dest.to_string());
            }
        }
    }
}

fn assign_all_items(folder: &TreeNode, dest: &str, out: &mut HashMap<i32, String>) {
    match folder {
        TreeNode::Item { file_index, .. } => {
            out.entry(*file_index).or_insert_with(|| dest.to_string());
        }
        TreeNode::Folder { children, .. } => {
            for c in children {
                assign_all_items(c, dest, out);
            }
        }
    }
}

fn collect_all_exts(
    folder: &TreeNode,
    file_ext_by_index: &HashMap<i32, String>,
    out: &mut Vec<String>,
) {
    match folder {
        TreeNode::Item { file_index, .. } => {
            if let Some(ext) = file_ext_by_index.get(file_index) {
                out.push(ext.clone());
            }
        }
        TreeNode::Folder { children, .. } => {
            for c in children {
                collect_all_exts(c, file_ext_by_index, out);
            }
        }
    }
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

fn file_extension(file_url: &str) -> String {
    let name = file_basename(file_url);
    match name.rfind('.') {
        Some(idx) => name[idx..].to_ascii_lowercase(),
        None => String::new(),
    }
}

fn strip_ext(filename: &str) -> String {
    match filename.rfind('.') {
        Some(idx) if idx > 0 => filename[..idx].to_string(),
        _ => filename.to_string(),
    }
}

fn build_unit_file_url(out_name: &str, folder: &str, filename: &str) -> String {
    let mut parts = vec![".".to_string(), out_name.to_string()];
    if !folder.is_empty() {
        for seg in folder.split('\\').filter(|s| !s.is_empty()) {
            parts.push(seg.to_string());
        }
    }
    parts.push(filename.to_string());
    parts.join("\\")
}

#[allow(dead_code)]
fn ensure_within_root(root: &Path, candidate: &Path) -> Result<(), String> {
    if candidate.starts_with(root) {
        Ok(())
    } else {
        Err(format!(
            "Refusing to write outside model root: {}",
            candidate.display()
        ))
    }
}
