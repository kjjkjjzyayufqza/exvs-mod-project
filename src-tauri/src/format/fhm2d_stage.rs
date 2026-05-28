//! Stage-specific FHM2D apply-rename and bundle loading.
//!
//! After standard fhm2d extraction produces numbered folders (0/, 1/, 2/, ...),
//! this module reads the `_structure.json` and renames them into a human-readable
//! stage directory:  base/ , info/ , <numdlb-inferred-name>/ , ... , textures/ (skipped).
//!
//! Info folder internals: sub-folders 0,1,2 → fog/ , light/ , post_effect/ ;
//! remaining files are renamed to fixed names by JSON array order.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use crate::fhm2d_memory_preview;
use crate::format::fhm2d::{InMemoryFhm2dFile, SubFileStructureEntry};
use crate::ssbh_preview::{self, SsbhModelPreviewBundle, TextureRefResolve};

const NUMDLB_MAGIC: &[u8; 4] = b"HBSS";
const NUMDLB_MODL_TAG: &[u8; 4] = b"LDOM";

// ── Stage directory role constants ──────────────────────────────────────────

pub(crate) const STAGE_BASE_NAME: &str = "base";
pub(crate) const STAGE_INFO_NAME: &str = "info";
const STAGE_TEXTURES_NAME: &str = "textures";

pub(crate) const INFO_SUBFOLDER_NAMES: &[&str] = &["fog", "light", "post_effect"];

pub(crate) const INFO_FILE_NAMES: &[&str] = &[
    "border_hit.hkt",
    "graphic_param.csv",
    "placement.csv",
    "plan_param.spbin",
    "stage_boundary.csv",
];

// ── Structure JSON deserialization ──────────────────────────────────────────

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct StructureJson {
    #[serde(rename = "SubFileData")]
    sub_file_data: Vec<SubFileDataEntry>,
    #[serde(rename = "SubFileStructure")]
    sub_file_structure: Vec<SubFileStructureEntry>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct SubFileDataEntry {
    index: usize,
    file_type: String,
    file_index: i32,
    file_url: String,
    file_base_name: Option<String>,
}

// ── Numdlb name extraction (minimal) ───────────────────────────────────────

fn read_numdlb_model_name(data: &[u8]) -> Option<String> {
    if data.len() < 0x30 {
        return None;
    }
    if data.get(0..4)? != NUMDLB_MAGIC || data.get(0x10..0x14)? != NUMDLB_MODL_TAG {
        return None;
    }
    let major = u16::from_le_bytes([*data.get(0x14)?, *data.get(0x15)?]);
    let minor = u16::from_le_bytes([*data.get(0x16)?, *data.get(0x17)?]);
    if major != 1 || minor != 7 {
        return None;
    }
    let base: usize = 0x18;
    let rel_off_bytes = data.get(base..base + 8)?;
    let rel_off = u64::from_le_bytes(rel_off_bytes.try_into().ok()?);
    if rel_off == 0 {
        return None;
    }
    let abs_off = base.checked_add(rel_off as usize)?;
    if abs_off >= data.len() {
        return None;
    }
    let mut end = abs_off;
    while end < data.len() && data[end] != 0 {
        end += 1;
    }
    let raw = String::from_utf8(data[abs_off..end].to_vec()).ok()?;
    let name = raw.trim().to_string();
    if name.is_empty() {
        None
    } else {
        Some(normalize_model_name(&name))
    }
}

fn normalize_model_name(raw: &str) -> String {
    let stripped = raw.trim_start_matches(['/', '\\']);
    let without_ext = match stripped.rfind('.') {
        Some(dot) if dot > 0 => &stripped[..dot],
        _ => stripped,
    };
    without_ext
        .replace(['/', '\\'], "_")
        .replace(' ', "_")
        .to_ascii_lowercase()
}

// ── Folder structure walking ────────────────────────────────────────────────

struct FolderGroup {
    folder_index: usize,
    item_file_indices: Vec<i32>,
}

fn collect_folder_groups(structure: &[SubFileStructureEntry]) -> Vec<FolderGroup> {
    let mut groups = Vec::new();
    let mut i = 0;
    let mut folder_idx = 0usize;
    while i < structure.len() {
        match &structure[i] {
            SubFileStructureEntry::Folder { folder_count, .. } => {
                let count = *folder_count as usize;
                let mut items = Vec::new();
                let mut j = i + 1;
                let mut collected = 0;
                while j < structure.len() && collected < count {
                    match &structure[j] {
                        SubFileStructureEntry::Item { file_index, .. } => {
                            items.push(*file_index);
                            collected += 1;
                        }
                        SubFileStructureEntry::Folder { .. } => break,
                        SubFileStructureEntry::EndMark { .. } => break,
                    }
                    j += 1;
                }
                groups.push(FolderGroup {
                    folder_index: folder_idx,
                    item_file_indices: items,
                });
                folder_idx += 1;
                i = j;
            }
            SubFileStructureEntry::Item { .. } => {
                i += 1;
            }
            SubFileStructureEntry::EndMark { .. } => {
                i += 1;
            }
        }
    }
    groups
}

// ── Recursive SubFileStructure tree parser ──────────────────────────────────
//
// SubFileStructure is a pre-order serialized tree using Folder/EndMark bracket
// pairing (same logic as build_parse_tree in fhm2d.rs). Each Folder pushes a
// level; each EndMark(count) pops `count` levels. Items are leaf nodes.

#[allow(dead_code)]
struct InternalTreeNode {
    name: String,
    children: Vec<InternalTreeNode>,
    item_file_indices: Vec<i32>,
}

enum StageToken {
    FolderOpen { name: String },
    Leaf { file_index: i32 },
    End,
}

fn tokenize_structure(entries: &[SubFileStructureEntry]) -> Vec<StageToken> {
    let mut folder_counter: Vec<i32> = vec![0];
    let mut tokens = Vec::new();
    for entry in entries {
        match entry {
            SubFileStructureEntry::Folder { unk3, .. } => {
                let idx = folder_counter.len() - 1;
                // unk3=64 marks the shared textures/ folder
                let name = if *unk3 == 64 {
                    STAGE_TEXTURES_NAME.to_string()
                } else {
                    folder_counter[idx].to_string()
                };
                folder_counter[idx] += 1;
                folder_counter.push(0);
                tokens.push(StageToken::FolderOpen { name });
            }
            SubFileStructureEntry::Item { file_index, .. } => {
                tokens.push(StageToken::Leaf {
                    file_index: *file_index,
                });
            }
            SubFileStructureEntry::EndMark { end_mark_count } => {
                let count = (*end_mark_count).max(0) as usize;
                for _ in 0..count {
                    if folder_counter.len() > 1 {
                        folder_counter.pop();
                    }
                    tokens.push(StageToken::End);
                }
            }
        }
    }
    tokens
}

fn parse_tree_children(tokens: &[StageToken], idx: &mut usize) -> Vec<InternalTreeNode> {
    let mut out = Vec::new();
    while *idx < tokens.len() {
        match &tokens[*idx] {
            StageToken::FolderOpen { name } => {
                let folder_name = name.clone();
                *idx += 1;
                let children = parse_tree_children(tokens, idx);
                out.push(InternalTreeNode {
                    name: folder_name,
                    children,
                    item_file_indices: Vec::new(),
                });
            }
            StageToken::Leaf { file_index } => {
                *idx += 1;
                out.push(InternalTreeNode {
                    name: file_index.to_string(),
                    children: Vec::new(),
                    item_file_indices: vec![*file_index],
                });
            }
            StageToken::End => {
                *idx += 1;
                return out;
            }
        }
    }
    out
}

fn build_stage_tree(entries: &[SubFileStructureEntry]) -> InternalTreeNode {
    let tokens = tokenize_structure(entries);
    let mut idx = 0;
    let children = parse_tree_children(&tokens, &mut idx);
    InternalTreeNode {
        name: "Root".to_string(),
        children,
        item_file_indices: Vec::new(),
    }
}

fn collect_all_file_indices(node: &InternalTreeNode) -> Vec<i32> {
    let mut result = Vec::new();
    result.extend(&node.item_file_indices);
    for child in &node.children {
        result.extend(collect_all_file_indices(child));
    }
    result
}

fn convert_to_virtual_tree(
    node: &InternalTreeNode,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
    nutexb_name_map: &HashMap<i32, String>,
) -> StageVirtualTreeFolder {
    let mut children = Vec::new();
    let mut files = Vec::new();

    for child in &node.children {
        if !child.children.is_empty() {
            children.push(convert_to_virtual_tree(
                child,
                file_index_map,
                nutexb_name_map,
            ));
        } else if !child.item_file_indices.is_empty() {
            for fi in &child.item_file_indices {
                if let Some(f) = file_index_map.get(fi) {
                    let file_name = if f.file_type.eq_ignore_ascii_case(".nutexb") {
                        nutexb_name_map
                            .get(fi)
                            .map(|name| format!("{name}.nutexb"))
                            .unwrap_or_else(|| {
                                f.file_url
                                    .replace('\\', "/")
                                    .split('/')
                                    .last()
                                    .unwrap_or("unknown")
                                    .to_string()
                            })
                    } else {
                        f.file_url
                            .replace('\\', "/")
                            .split('/')
                            .last()
                            .unwrap_or("unknown")
                            .to_string()
                    };
                    files.push(StageVirtualTreeFile {
                        file_name,
                        file_type: f.file_type.clone(),
                        size_bytes: f.data.len(),
                        file_index: *fi,
                    });
                }
            }
        }
    }

    StageVirtualTreeFolder {
        name: node.name.clone(),
        children,
        files,
    }
}

// ── In-memory semantic rename helpers ───────────────────────────────────────

const SDKV_MAGIC: &[u8; 4] = b"SDKV";
const SDKV_MAGIC_OFFSET: usize = 0x0C;
pub(crate) const STAGE_SKY_NAME: &str = "sky";
const NUST_NUMATB_SUFFIX: &str = "__nust__";

fn infer_numdlb_name_from_tree(
    node: &InternalTreeNode,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
) -> Option<String> {
    let all_indices = collect_all_file_indices(node);
    for fi in &all_indices {
        if let Some(f) = file_index_map.get(fi) {
            if f.file_type.eq_ignore_ascii_case(".numdlb") {
                if let Some(name) = read_numdlb_model_name(&f.data) {
                    return Some(name);
                }
            }
        }
    }
    None
}

fn identify_info_file(data: &[u8]) -> &'static str {
    fn contains_needle_ci(haystack: &[u8], needle_lower: &[u8]) -> bool {
        if needle_lower.is_empty() || haystack.len() < needle_lower.len() {
            return false;
        }
        haystack.windows(needle_lower.len()).any(|window| {
            window
                .iter()
                .zip(needle_lower.iter())
                .all(|(a, b)| a.to_ascii_lowercase() == *b)
        })
    }

    // Do not require valid UTF-8 for the whole file (BOM / invalid bytes broke classification).
    if contains_needle_ci(data, b"vdk_type") {
        return "placement.csv";
    }
    if contains_needle_ci(data, b"directional_lighting")
        || contains_needle_ci(data, b"pfx_bloom")
        || contains_needle_ci(data, b"curveedit_")
    {
        return "graphic_param.csv";
    }
    if data.len() >= SDKV_MAGIC_OFFSET + 4
        && &data[SDKV_MAGIC_OFFSET..SDKV_MAGIC_OFFSET + 4] == SDKV_MAGIC
    {
        return "border_hit.hkt";
    }
    "plan_param.spbin"
}

/// RFC4180-style record split (commas inside quoted fields).
fn split_csv_record(line: &str) -> Vec<String> {
    let mut fields: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut chars = line.chars().peekable();
    let mut in_quotes = false;
    while let Some(ch) = chars.next() {
        match ch {
            '"' => {
                if in_quotes {
                    if chars.peek() == Some(&'"') {
                        chars.next();
                        current.push('"');
                    } else {
                        in_quotes = false;
                    }
                } else {
                    in_quotes = true;
                }
            }
            ',' if !in_quotes => {
                fields.push(current);
                current = String::new();
            }
            c => current.push(c),
        }
    }
    fields.push(current);
    fields.into_iter().map(normalize_csv_cell).collect()
}

fn normalize_csv_cell(raw: String) -> String {
    let t = raw.trim();
    if t.len() >= 2 && t.starts_with('"') && t.ends_with('"') {
        t[1..t.len() - 1].replace("\"\"", "\"")
    } else {
        t.to_string()
    }
}

/// True when the row is EXVS \"flat\" layout: `VDK_TYPE,<category>,KEY,VALUE,...` (no separate header row).
fn placement_row_looks_kv_pairs(fields: &[String]) -> bool {
    if fields.len() < 4 {
        return false;
    }
    if !fields[0].eq_ignore_ascii_case("VDK_TYPE") {
        return false;
    }
    let cat = fields[1].to_ascii_uppercase();
    matches!(cat.as_str(), "OBJECT" | "EFFECT" | "SKY" | "PROP")
}

fn kv_pairs_upper_map(fields: &[String]) -> HashMap<String, String> {
    let mut m = HashMap::new();
    let mut i = 0usize;
    while i + 1 < fields.len() {
        let k = fields[i].trim().to_ascii_uppercase();
        let v = fields[i + 1].trim().to_string();
        m.insert(k, v);
        i += 2;
    }
    m
}

fn kv_get_f64(m: &HashMap<String, String>, keys: &[&str]) -> f64 {
    for k in keys {
        if let Some(v) = m.get(&k.to_ascii_uppercase()) {
            if let Ok(x) = v.parse::<f64>() {
                return x;
            }
        }
    }
    0.0
}

/// Scale in placement: missing or empty fields must not become 0 (Three.js would collapse the mesh).
/// Explicit 0 is treated as unset and defaults to 1.0 for preview parity with common CSV omissions.
fn kv_get_scale_f64(m: &HashMap<String, String>, keys: &[&str]) -> f64 {
    for k in keys {
        if let Some(v) = m.get(&k.to_ascii_uppercase()) {
            let t = v.trim();
            if t.is_empty() {
                continue;
            }
            if let Ok(x) = t.parse::<f64>() {
                if x == 0.0 {
                    return 1.0;
                }
                return x;
            }
        }
    }
    1.0
}

fn kv_get_i32(m: &HashMap<String, String>, key: &str) -> Option<i32> {
    m.get(&key.to_ascii_uppercase())
        .and_then(|v| v.parse::<i32>().ok())
}

fn kv_get_string(m: &HashMap<String, String>, key: &str) -> String {
    m.get(&key.to_ascii_uppercase())
        .cloned()
        .unwrap_or_default()
}

fn parse_placement_kv_record(fields: Vec<String>) -> PlacementEntry {
    let m = kv_pairs_upper_map(&fields);
    PlacementEntry {
        vdk_type: kv_get_string(&m, "VDK_TYPE"),
        object_number: kv_get_i32(&m, "VDK_OBJECTNUMBER"),
        pos_x: kv_get_f64(&m, &["VDK_POSITION_X", "VDK_POS_X"]),
        pos_y: kv_get_f64(&m, &["VDK_POSITION_Y", "VDK_POS_Y"]),
        pos_z: kv_get_f64(&m, &["VDK_POSITION_Z", "VDK_POS_Z"]),
        rot_x: kv_get_f64(&m, &["VDK_ROTATION_X", "VDK_ROT_X"]),
        rot_y: kv_get_f64(&m, &["VDK_ROTATION_Y", "VDK_ROT_Y"]),
        rot_z: kv_get_f64(&m, &["VDK_ROTATION_Z", "VDK_ROT_Z"]),
        scale_x: kv_get_scale_f64(&m, &["VDK_SCALE_X"]),
        scale_y: kv_get_scale_f64(&m, &["VDK_SCALE_Y"]),
        scale_z: kv_get_scale_f64(&m, &["VDK_SCALE_Z"]),
        raw_fields: fields,
    }
}

fn parse_placement_table(
    content: &str,
    warnings: &mut Vec<String>,
) -> (Vec<String>, Vec<PlacementEntry>) {
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let first_fields = split_csv_record(lines[0]);
    if placement_row_looks_kv_pairs(&first_fields) {
        let mut entries = Vec::new();
        for line in &lines {
            if line.trim().is_empty() {
                continue;
            }
            let fields = split_csv_record(line);
            if fields.is_empty() {
                continue;
            }
            entries.push(parse_placement_kv_record(fields));
        }
        return (Vec::new(), entries);
    }

    let header_strings = first_fields;
    let find_col_any = |names: &[&str]| -> Option<usize> {
        for &n in names {
            if let Some(i) = header_strings
                .iter()
                .position(|h| h.eq_ignore_ascii_case(n))
            {
                return Some(i);
            }
        }
        None
    };

    if find_col_any(&["VDK_TYPE"]).is_none() {
        warnings.push(
            "placement.csv header has no VDK_TYPE column (check encoding or delimiter)".to_string(),
        );
    }

    let col_type = find_col_any(&["VDK_TYPE"]);
    let col_objnum = find_col_any(&["VDK_OBJECTNUMBER"]);
    let col_px = find_col_any(&["VDK_POS_X", "VDK_POSITION_X"]);
    let col_py = find_col_any(&["VDK_POS_Y", "VDK_POSITION_Y"]);
    let col_pz = find_col_any(&["VDK_POS_Z", "VDK_POSITION_Z"]);
    let col_rx = find_col_any(&["VDK_ROT_X", "VDK_ROTATION_X"]);
    let col_ry = find_col_any(&["VDK_ROT_Y", "VDK_ROTATION_Y"]);
    let col_rz = find_col_any(&["VDK_ROT_Z", "VDK_ROTATION_Z"]);
    let col_sx = find_col_any(&["VDK_SCALE_X"]);
    let col_sy = find_col_any(&["VDK_SCALE_Y"]);
    let col_sz = find_col_any(&["VDK_SCALE_Z"]);

    let parse_f64 = |fields: &[String], col: Option<usize>| -> f64 {
        col.and_then(|c| fields.get(c))
            .and_then(|v| v.trim().parse::<f64>().ok())
            .unwrap_or(0.0)
    };

    let parse_scale_f64 = |fields: &[String], col: Option<usize>| -> f64 {
        match col.and_then(|c| fields.get(c)) {
            None => 1.0,
            Some(cell) => {
                let t = cell.trim();
                if t.is_empty() {
                    return 1.0;
                }
                match t.parse::<f64>() {
                    Ok(x) if x == 0.0 => 1.0,
                    Ok(x) => x,
                    Err(_) => 1.0,
                }
            }
        }
    };

    let parse_i32 = |fields: &[String], col: Option<usize>| -> Option<i32> {
        col.and_then(|c| fields.get(c))
            .and_then(|v| v.trim().parse::<i32>().ok())
    };

    let mut entries = Vec::new();
    for line in &lines[1..] {
        if line.trim().is_empty() {
            continue;
        }
        let fields = split_csv_record(line);
        let vdk_type = col_type
            .and_then(|c| fields.get(c))
            .map(|v| v.trim().to_string())
            .unwrap_or_default();

        entries.push(PlacementEntry {
            vdk_type,
            object_number: parse_i32(&fields, col_objnum),
            pos_x: parse_f64(&fields, col_px),
            pos_y: parse_f64(&fields, col_py),
            pos_z: parse_f64(&fields, col_pz),
            rot_x: parse_f64(&fields, col_rx),
            rot_y: parse_f64(&fields, col_ry),
            rot_z: parse_f64(&fields, col_rz),
            scale_x: parse_scale_f64(&fields, col_sx),
            scale_y: parse_scale_f64(&fields, col_sy),
            scale_z: parse_scale_f64(&fields, col_sz),
            raw_fields: fields,
        });
    }
    (header_strings, entries)
}

fn collect_placement_csv_from_virtual_tree(
    folder: &StageVirtualTreeFolder,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
    warnings: &mut Vec<String>,
) -> Option<(Vec<String>, Vec<PlacementEntry>)> {
    for f in &folder.files {
        if f.file_name.eq_ignore_ascii_case("placement.csv") {
            let Some(bin) = file_index_map.get(&f.file_index) else {
                continue;
            };
            let mut local = Vec::new();
            let parsed = parse_placement_csv_from_bytes(&bin.data, &mut local);
            warnings.extend(local);
            if !parsed.1.is_empty() {
                return Some(parsed);
            }
        }
    }
    for child in &folder.children {
        if let Some(hit) = collect_placement_csv_from_virtual_tree(child, file_index_map, warnings)
        {
            return Some(hit);
        }
    }
    None
}

// ── Nutexb internal name parsing ────────────────────────────────────────────

fn stage_read_i16_le(data: &[u8], offset: usize) -> Option<i16> {
    let b = data.get(offset..offset + 2)?;
    Some(i16::from_le_bytes([b[0], b[1]]))
}

fn stage_read_c_string(data: &[u8], offset: usize, max_len: usize) -> Option<String> {
    if offset >= data.len() {
        return None;
    }
    let end_limit = (offset + max_len).min(data.len());
    let mut end = offset;
    while end < end_limit && data[end] != 0 {
        end += 1;
    }
    String::from_utf8(data[offset..end].to_vec()).ok()
}

fn parse_nutexb_internal_name(bytes: &[u8]) -> Option<String> {
    let size = bytes.len();
    if size < 8 {
        return None;
    }
    if bytes.get(size - 8..size - 4) != Some(b" XET") {
        return None;
    }
    let major = stage_read_i16_le(bytes, size - 4)? as i32;
    let minor = stage_read_i16_le(bytes, size - 2)? as i32;
    let name_offset = if major == 1 && minor == 1 {
        size.checked_sub(0x86c)?
    } else if (major == 2 && minor == 0) || (major == 1 && minor == 2) {
        size.checked_sub(0x70)?
    } else {
        return None;
    };
    if bytes.get(name_offset..name_offset + 4) != Some(b"46XT") {
        return None;
    }
    let raw = stage_read_c_string(bytes, name_offset + 4, 4096)?;
    let cleaned = raw
        .replace(['/', '\\'], "_")
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_control() || "<>:\"|?*".contains(ch) {
                '_'
            } else {
                ch
            }
        })
        .collect::<String>();
    if cleaned.is_empty() {
        return None;
    }
    Some(cleaned)
}

// ── Precompute nutexb internal names (flat iteration, no folder walking) ─────

fn precompute_nutexb_names(
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
) -> (HashMap<i32, String>, Vec<String>) {
    let mut names = HashMap::new();
    let mut warnings = Vec::new();
    for (&fi, f) in file_index_map {
        if !f.file_type.eq_ignore_ascii_case(".nutexb") {
            continue;
        }
        match parse_nutexb_internal_name(&f.data) {
            Some(name) => {
                names.insert(fi, name);
            }
            None => {
                warnings.push(format!(
                    "Could not read internal name from nutexb fileIndex={}",
                    fi
                ));
            }
        }
    }
    (names, warnings)
}

// ── Numdlb MODL info parsing (for skeleton/mesh/material names) ─────────────

struct StageModlInfo {
    model_name: String,
    skeleton_file_name: String,
    mesh_file_name: String,
    material_file_names: Vec<String>,
}

fn stage_read_u64_le(data: &[u8], offset: usize) -> Option<u64> {
    let b = data.get(offset..offset + 8)?;
    Some(u64::from_le_bytes([
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
    ]))
}

fn stage_read_ssbh_string_at(data: &[u8], field_offset: usize) -> Option<String> {
    let rel = stage_read_u64_le(data, field_offset)?;
    if rel == 0 {
        return Some(String::new());
    }
    let abs_off = field_offset.checked_add(rel as usize)?;
    stage_read_c_string(data, abs_off, 4096)
}

fn parse_stage_numdlb_modl_info(data: &[u8]) -> Option<StageModlInfo> {
    if data.get(0..4)? != NUMDLB_MAGIC || data.get(0x10..0x14)? != NUMDLB_MODL_TAG {
        return None;
    }
    let major = u16::from_le_bytes([*data.get(0x14)?, *data.get(0x15)?]);
    let minor = u16::from_le_bytes([*data.get(0x16)?, *data.get(0x17)?]);
    if major != 1 || minor != 7 {
        return None;
    }
    const BASE: usize = 0x18;
    let model_raw = stage_read_ssbh_string_at(data, BASE)?;
    let model_name = normalize_model_name(model_raw.trim());
    if model_name.is_empty() {
        return None;
    }
    let skeleton_file_name = stage_read_ssbh_string_at(data, BASE + 0x08).unwrap_or_default();

    let mat_count_rel = stage_read_u64_le(data, BASE + 0x10)?;
    let mat_count_abs = (BASE + 0x10).checked_add(mat_count_rel as usize)?;
    let mat_count_raw = stage_read_u64_le(data, (BASE + 0x10) + 8)? as usize;
    let mut material_file_names = Vec::with_capacity(mat_count_raw);
    for i in 0..mat_count_raw {
        let elem_off = mat_count_abs.checked_add(i * 8)?;
        if let Some(name) = stage_read_ssbh_string_at(data, elem_off) {
            material_file_names.push(name);
        }
    }

    let mesh_file_name = stage_read_ssbh_string_at(data, BASE + 0x28).unwrap_or_default();

    Some(StageModlInfo {
        model_name,
        skeleton_file_name,
        mesh_file_name,
        material_file_names,
    })
}

fn basename_no_ext(path: &str) -> String {
    let name = path
        .replace('\\', "/")
        .split('/')
        .last()
        .unwrap_or(path)
        .to_string();
    match name.rfind('.') {
        Some(idx) if idx > 0 => name[..idx].to_string(),
        _ => name,
    }
}

// ── Folder-level bin rename (map_hit.hkt) ───────────────────────────────────

fn rename_folder_level_bins(folder: &mut StageVirtualTreeFolder, warnings: &mut Vec<String>) {
    let bin_indices: Vec<usize> = folder
        .files
        .iter()
        .enumerate()
        .filter(|(_, f)| f.file_type.eq_ignore_ascii_case(".bin"))
        .map(|(i, _)| i)
        .collect();

    match bin_indices.len() {
        1 => {
            folder.files[bin_indices[0]].file_name = "map_hit.hkt".to_string();
        }
        n if n > 1 => {
            warnings.push(format!(
                "Folder '{}' has {} bin files at top level, skipping map_hit.hkt rename",
                folder.name, n
            ));
        }
        _ => {}
    }
}

// ── Model subfolder file rename ─────────────────────────────────────────────

fn rename_model_subfolder_files(
    subfolder: &mut StageVirtualTreeFolder,
    subfolder_node: &InternalTreeNode,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
    warnings: &mut Vec<String>,
) {
    let all_indices = collect_all_file_indices(subfolder_node);
    let mut numdlb_data: Option<&[u8]> = None;
    for fi in &all_indices {
        if let Some(f) = file_index_map.get(fi) {
            if f.file_type.eq_ignore_ascii_case(".numdlb") {
                numdlb_data = Some(f.data.as_slice());
                break;
            }
        }
    }

    let modl = numdlb_data.and_then(parse_stage_numdlb_modl_info);
    let model_name = modl.as_ref().map(|m| m.model_name.clone());

    if let Some(ref modl) = modl {
        for file in &mut subfolder.files {
            let ft = file.file_type.to_ascii_lowercase();
            match ft.as_str() {
                ".numdlb" => {
                    file.file_name = format!("{}.numdlb", modl.model_name);
                }
                ".numshb" => {
                    if !modl.mesh_file_name.is_empty() {
                        let name = basename_no_ext(&modl.mesh_file_name);
                        file.file_name = format!("{name}.numshb");
                    } else {
                        file.file_name = format!("{}.numshb", modl.model_name);
                    }
                }
                ".nusktb" => {
                    if !modl.skeleton_file_name.is_empty() {
                        let name = basename_no_ext(&modl.skeleton_file_name);
                        file.file_name = format!("{name}.nusktb");
                    } else {
                        file.file_name = format!("{}.nusktb", modl.model_name);
                    }
                }
                _ => {}
            }
        }

        rename_numatb_with_maya_nust(subfolder, modl, warnings);
    }

    let bin_indices: Vec<usize> = subfolder
        .files
        .iter()
        .enumerate()
        .filter(|(_, f)| f.file_type.eq_ignore_ascii_case(".bin"))
        .map(|(i, _)| i)
        .collect();

    if bin_indices.len() == 1 {
        let jnttbl_name = model_name.as_deref().unwrap_or("unknown").to_string();
        subfolder.files[bin_indices[0]].file_name = format!("{jnttbl_name}.jnttbl");
    }
}

/// Rename numatb files using numdlb material_file_names (maya/nust pattern).
///
/// Sorted by file_index: first N match material_file_names[0..N] (maya first,
/// nust template second). Extra numatb beyond declared count get variant names
/// derived from the __nust__ template (material_file_names[1]).
///
/// NOTE: EXVS2 game runtime loads numatb files directly from the model's folder
/// structure (the 2 numatb files packed alongside the numdlb), NOT by reading
/// the material_file_names array in numdlb. It auto-detects maya vs nust by
/// their `__maya__` / `__nust__` filename suffix convention.
/// This rename logic is purely for human-friendly display in the editor.
fn rename_numatb_with_maya_nust(
    subfolder: &mut StageVirtualTreeFolder,
    modl: &StageModlInfo,
    warnings: &mut Vec<String>,
) {
    let mut numatb_indices: Vec<usize> = subfolder
        .files
        .iter()
        .enumerate()
        .filter(|(_, f)| f.file_type.eq_ignore_ascii_case(".numatb"))
        .map(|(i, _)| i)
        .collect();
    if numatb_indices.is_empty() {
        return;
    }
    numatb_indices.sort_by_key(|&i| subfolder.files[i].file_index);

    let material_names: Vec<String> = modl
        .material_file_names
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let declared_count = material_names.len();

    if declared_count == 0 {
        for &idx in &numatb_indices {
            subfolder.files[idx].file_name = format!("{}.numatb", modl.model_name);
        }
        return;
    }

    let main_rename_count = declared_count.min(numatb_indices.len());
    for i in 0..main_rename_count {
        let target = numatb_indices[i];
        let name = basename_no_ext(&material_names[i]);
        subfolder.files[target].file_name = format!("{name}.numatb");
    }

    let extra_count = numatb_indices.len().saturating_sub(declared_count);
    if extra_count == 0 {
        return;
    }

    if declared_count < 2 {
        // EXVS2 auto-detects numatb by __maya__/__nust__ suffix, independent of
        // numdlb material_file_names. When numdlb only declares 1 path (typically
        // nust), infer the other numatb name using the model_name + __maya__ convention.
        let first_is_nust = material_names
            .first()
            .map(|n| basename_no_ext(n).ends_with(NUST_NUMATB_SUFFIX))
            .unwrap_or(false);
        for e in 0..extra_count {
            let target = numatb_indices[declared_count + e];
            if first_is_nust && extra_count == 1 {
                subfolder.files[target].file_name =
                    format!("{}__maya__.numatb", modl.model_name);
            } else {
                subfolder.files[target].file_name =
                    format!("{}_{}.numatb", modl.model_name, declared_count + e);
            }
        }
        return;
    }

    let nust_template_stripped = basename_no_ext(&material_names[1]);
    if !nust_template_stripped.ends_with(NUST_NUMATB_SUFFIX) {
        warnings.push(format!(
            "Model '{}': material[1] '{}' does not end with '{}', \
             cannot derive nust variant names for {} extra numatb file(s)",
            modl.model_name, nust_template_stripped, NUST_NUMATB_SUFFIX, extra_count
        ));
        return;
    }

    let prefix = &nust_template_stripped[..nust_template_stripped.len() - NUST_NUMATB_SUFFIX.len()];
    for e in 0..extra_count {
        let target = numatb_indices[declared_count + e];
        let m_part = format!("_m{:03}", e + 1);
        subfolder.files[target].file_name = format!("{prefix}{m_part}{NUST_NUMATB_SUFFIX}.numatb");
    }
}

// ── Content-aware folder classification ─────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
enum FolderRole {
    Base,
    Info,
    Sky,
    Model(String),
    Textures,
}

fn classify_content_folders(
    nodes: &[&InternalTreeNode],
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
) -> Vec<FolderRole> {
    let mut roles: Vec<Option<FolderRole>> = vec![None; nodes.len()];

    for (i, node) in nodes.iter().enumerate() {
        if node.name.to_ascii_lowercase() == STAGE_TEXTURES_NAME {
            roles[i] = Some(FolderRole::Textures);
        }
    }

    for (i, node) in nodes.iter().enumerate() {
        if roles[i].is_some() {
            continue;
        }
        if infer_numdlb_name_from_tree(node, file_index_map).is_none() {
            roles[i] = Some(FolderRole::Info);
            break;
        }
    }

    let mut sky_found = false;
    for (i, node) in nodes.iter().enumerate() {
        if roles[i].is_some() {
            continue;
        }
        if let Some(name) = infer_numdlb_name_from_tree(node, file_index_map) {
            let lower = name.to_ascii_lowercase();
            if lower.contains("sky") {
                roles[i] = Some(FolderRole::Sky);
                sky_found = true;
                break;
            }
        }
    }

    if !sky_found {
        let model_indices: Vec<usize> = (0..nodes.len())
            .filter(|i| roles[*i].is_none())
            .collect();
        if let Some(&last) = model_indices.last() {
            roles[last] = Some(FolderRole::Sky);
        }
    }

    let mut base_assigned = false;
    for i in 0..nodes.len() {
        if roles[i].is_some() {
            continue;
        }
        if !base_assigned {
            roles[i] = Some(FolderRole::Base);
            base_assigned = true;
        } else if let Some(name) = infer_numdlb_name_from_tree(nodes[i], file_index_map) {
            roles[i] = Some(FolderRole::Model(name));
        } else {
            roles[i] = Some(FolderRole::Model(format!("sub_{i}")));
        }
    }

    roles.into_iter().map(|r| r.unwrap()).collect()
}

// ── Main rename dispatcher ──────────────────────────────────────────────────

fn rename_stage_content_folder(
    folder: &mut StageVirtualTreeFolder,
    role: &FolderRole,
    node: &InternalTreeNode,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
    warnings: &mut Vec<String>,
) {
    match role {
        FolderRole::Textures => {}
        FolderRole::Base => {
            folder.name = STAGE_BASE_NAME.to_string();
            rename_folder_level_bins(folder, warnings);
            for sub in &mut folder.children {
                if let Some(child_node) = find_child_node_by_name(node, &sub.name) {
                    if let Some(model_name) =
                        infer_numdlb_name_from_tree(child_node, file_index_map)
                    {
                        sub.name = model_name.clone();
                    }
                    rename_model_subfolder_files(sub, child_node, file_index_map, warnings);
                }
            }
        }
        FolderRole::Info => {
            folder.name = STAGE_INFO_NAME.to_string();
            for (i, sub) in folder.children.iter_mut().enumerate() {
                if i < INFO_SUBFOLDER_NAMES.len() {
                    sub.name = INFO_SUBFOLDER_NAMES[i].to_string();
                }
            }
            let resolved_names: Vec<String> = folder
                .files
                .iter()
                .map(|vf| {
                    file_index_map
                        .get(&vf.file_index)
                        .map(|f| identify_info_file(&f.data).to_string())
                        .unwrap_or_else(|| vf.file_name.clone())
                })
                .collect();
            for (i, name) in resolved_names.into_iter().enumerate() {
                folder.files[i].file_name = name;
            }
        }
        FolderRole::Sky => {
            folder.name = STAGE_SKY_NAME.to_string();
            rename_folder_level_bins(folder, warnings);
            for sub in &mut folder.children {
                if let Some(child_node) = find_child_node_by_name(node, &sub.name) {
                    rename_model_subfolder_files(sub, child_node, file_index_map, warnings);
                }
            }
        }
        FolderRole::Model(name) => {
            folder.name = name.clone();
            rename_folder_level_bins(folder, warnings);
            for sub in &mut folder.children {
                if let Some(child_node) = find_child_node_by_name(node, &sub.name) {
                    rename_model_subfolder_files(sub, child_node, file_index_map, warnings);
                }
            }
        }
    }
}

fn find_child_node_by_name<'a>(
    parent: &'a InternalTreeNode,
    name: &str,
) -> Option<&'a InternalTreeNode> {
    parent.children.iter().find(|c| c.name == name)
}

fn find_stage_content_level(root: &StageVirtualTreeFolder) -> Vec<usize> {
    let mut path = Vec::new();
    find_content_level_recursive(root, &mut path)
}

fn find_content_level_recursive(
    folder: &StageVirtualTreeFolder,
    path: &mut Vec<usize>,
) -> Vec<usize> {
    if folder.children.len() >= 3 {
        let has_deep_children = folder.children.iter().any(|c| !c.children.is_empty());
        if has_deep_children {
            return path.clone();
        }
    }
    for (i, child) in folder.children.iter().enumerate() {
        path.push(i);
        let result = find_content_level_recursive(child, path);
        if !result.is_empty() || (child.children.len() >= 3) {
            path.pop();
            if child.children.len() >= 3 {
                return path.iter().copied().chain(std::iter::once(i)).collect();
            }
            return result;
        }
        path.pop();
    }
    Vec::new()
}

fn apply_semantic_rename(
    virtual_tree: &mut StageVirtualTreeFolder,
    tree: &InternalTreeNode,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
    warnings: &mut Vec<String>,
) {
    let path = find_stage_content_level(virtual_tree);
    if path.is_empty() {
        warnings.push("Could not locate stage content level for renaming".to_string());
        return;
    }

    let content_node = navigate_internal_tree(tree, &path);
    let content_folder = navigate_virtual_tree_mut(virtual_tree, &path);

    if content_node.is_none() || content_folder.is_none() {
        warnings.push("Failed to navigate to stage content level".to_string());
        return;
    }
    let content_node = content_node.unwrap();
    let content_folder = content_folder.unwrap();

    let child_count = content_folder.children.len();
    let node_children: Vec<&InternalTreeNode> = content_node.children.iter().collect();

    let roles = classify_content_folders(&node_children, file_index_map);

    for i in 0..child_count {
        let node_ref = if i < node_children.len() {
            node_children[i]
        } else {
            continue;
        };

        rename_stage_content_folder(
            &mut content_folder.children[i],
            &roles[i],
            node_ref,
            file_index_map,
            warnings,
        );
    }
}

fn navigate_internal_tree<'a>(
    root: &'a InternalTreeNode,
    path: &[usize],
) -> Option<&'a InternalTreeNode> {
    let mut current = root;
    for &idx in path {
        current = current.children.get(idx)?;
    }
    Some(current)
}

fn navigate_virtual_tree_mut<'a>(
    root: &'a mut StageVirtualTreeFolder,
    path: &[usize],
) -> Option<&'a mut StageVirtualTreeFolder> {
    let mut current = root;
    for &idx in path {
        current = current.children.get_mut(idx)?;
    }
    Some(current)
}

/// After semantic rename, consolidate nutexb files from per-model numbered
/// subdirs (0/, 1/) into a shared `textures/` virtual folder at the content level.
/// This matches what `restore_shared_textures` does on disk after extraction.
fn consolidate_virtual_textures(root: &mut StageVirtualTreeFolder) {
    let path = find_stage_content_level(root);
    let Some(content) = navigate_virtual_tree_mut(root, &path) else {
        return;
    };

    // Already has a textures/ folder — skip
    if content
        .children
        .iter()
        .any(|c| c.name.eq_ignore_ascii_case(STAGE_TEXTURES_NAME))
    {
        return;
    }

    let mut collected: Vec<StageVirtualTreeFile> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for model_folder in &mut content.children {
        collect_nutexb_from_children(&mut model_folder.children, &mut collected, &mut seen);
    }

    if collected.is_empty() {
        return;
    }

    content.children.push(StageVirtualTreeFolder {
        name: STAGE_TEXTURES_NAME.to_string(),
        children: Vec::new(),
        files: collected,
    });
}

/// Recursively collect nutexb files from numbered subdirs and remove those subdirs.
fn collect_nutexb_from_children(
    children: &mut Vec<StageVirtualTreeFolder>,
    collected: &mut Vec<StageVirtualTreeFile>,
    seen: &mut HashSet<String>,
) {
    // Recurse into all children that are NOT pure-nutexb numbered dirs
    for child in children.iter_mut() {
        let is_numeric = child.name.chars().all(|c| c.is_ascii_digit());
        let is_pure_nutexb = is_numeric
            && !child.files.is_empty()
            && child.children.is_empty()
            && child.files.iter().all(|f| f.file_type.eq_ignore_ascii_case(".nutexb"));
        if !is_pure_nutexb {
            collect_nutexb_from_children(&mut child.children, collected, seen);
        }
    }

    // Extract nutexb from pure-nutexb numeric subdirs
    let mut to_remove = Vec::new();
    for (i, child) in children.iter().enumerate() {
        let is_numeric = child.name.chars().all(|c| c.is_ascii_digit());
        let is_pure_nutexb = is_numeric
            && !child.files.is_empty()
            && child.children.is_empty()
            && child.files.iter().all(|f| f.file_type.eq_ignore_ascii_case(".nutexb"));
        if is_pure_nutexb {
            for f in &child.files {
                let key = f.file_name.to_ascii_lowercase();
                if seen.insert(key) {
                    collected.push(f.clone());
                }
            }
            to_remove.push(i);
        }
    }

    for i in to_remove.into_iter().rev() {
        children.remove(i);
    }
}

pub fn stage_rename_in_memory(
    files: &[InMemoryFhm2dFile],
    sub_file_structure: &[SubFileStructureEntry],
) -> Result<(StageVirtualTreeFolder, Vec<String>), String> {
    let file_index_map: HashMap<i32, &InMemoryFhm2dFile> =
        files.iter().map(|f| (f.file_index, f)).collect();

    let tree = build_stage_tree(sub_file_structure);
    let mut warnings = Vec::new();

    let (nutexb_name_map, nutexb_warnings) = precompute_nutexb_names(&file_index_map);
    warnings.extend(nutexb_warnings);

    let mut virtual_tree = convert_to_virtual_tree(&tree, &file_index_map, &nutexb_name_map);

    apply_semantic_rename(&mut virtual_tree, &tree, &file_index_map, &mut warnings);
    consolidate_virtual_textures(&mut virtual_tree);

    Ok((virtual_tree, warnings))
}

/// Like `stage_rename_in_memory` but collects textures into `textures/` based on
/// numatb material references (reads texture paths from numatb entries, strips
/// leading path components, finds matching nutexb by internal name).
/// Does NOT do `consolidate_virtual_textures` (numbered-subdir based collection).
pub fn stage_rename_in_memory_numatb_based(
    files: &[InMemoryFhm2dFile],
    sub_file_structure: &[SubFileStructureEntry],
) -> Result<(StageVirtualTreeFolder, Vec<String>), String> {
    let file_index_map: HashMap<i32, &InMemoryFhm2dFile> =
        files.iter().map(|f| (f.file_index, f)).collect();

    let tree = build_stage_tree(sub_file_structure);
    let mut warnings = Vec::new();

    let (nutexb_name_map, nutexb_warnings) = precompute_nutexb_names(&file_index_map);
    warnings.extend(nutexb_warnings);

    let mut virtual_tree = convert_to_virtual_tree(&tree, &file_index_map, &nutexb_name_map);

    apply_semantic_rename(&mut virtual_tree, &tree, &file_index_map, &mut warnings);
    consolidate_textures_by_numatb_refs(&mut virtual_tree, &file_index_map, &mut warnings);

    Ok((virtual_tree, warnings))
}

/// Collect nutexb files into a shared `textures/` folder based on numatb material
/// texture references. The textures/ folder is placed at the pack root level (Root/0/),
/// NOT at the content level (Root/0/0/).
/// Steps:
/// 1. Find all numatb files in the virtual tree
/// 2. Parse each numatb to extract texture reference paths
/// 3. Strip path prefixes, keep only the texture stem name
/// 4. Find matching nutexb files (by internal name) from numbered subdirs
/// 5. Move them into a new `textures/` folder at pack root level
fn consolidate_textures_by_numatb_refs(
    root: &mut StageVirtualTreeFolder,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
    warnings: &mut Vec<String>,
) {
    let content_path = find_stage_content_level(root);
    let Some(content) = navigate_virtual_tree_ref(root, &content_path) else {
        return;
    };

    // Step 1: Collect all texture references from numatb files
    let mut referenced_names: HashSet<String> = HashSet::new();
    collect_numatb_texture_refs_from_tree(content, file_index_map, &mut referenced_names, warnings);

    if referenced_names.is_empty() {
        return;
    }

    // Step 2: Find matching nutexb files in numbered subdirs at the content level
    let Some(content_mut) = navigate_virtual_tree_mut(root, &content_path) else {
        return;
    };

    let mut collected: Vec<StageVirtualTreeFile> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for model_folder in &mut content_mut.children {
        collect_nutexb_matching_refs(
            &mut model_folder.children,
            &referenced_names,
            &mut collected,
            &mut seen,
        );
    }

    if collected.is_empty() {
        return;
    }

    // Step 3: Place textures/ at content level (same level as base/, info/, sky/)
    let Some(content_folder) = navigate_virtual_tree_mut(root, &content_path) else {
        return;
    };

    if !content_folder
        .children
        .iter()
        .any(|c| c.name.eq_ignore_ascii_case(STAGE_TEXTURES_NAME))
    {
        content_folder.children.push(StageVirtualTreeFolder {
            name: STAGE_TEXTURES_NAME.to_string(),
            children: Vec::new(),
            files: collected,
        });
    }
}

/// Recursively find all numatb files in the tree and extract their texture references.
fn collect_numatb_texture_refs_from_tree(
    folder: &StageVirtualTreeFolder,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
    refs: &mut HashSet<String>,
    warnings: &mut Vec<String>,
) {
    for f in &folder.files {
        if !f.file_type.eq_ignore_ascii_case(".numatb") {
            continue;
        }
        let Some(mem_file) = file_index_map.get(&f.file_index) else {
            continue;
        };
        let mut cursor = Cursor::new(&mem_file.data);
        match ssbh_data::prelude::MatlData::read(&mut cursor) {
            Ok(matl) => {
                for entry in &matl.entries {
                    for tex in &entry.textures {
                        let stem = extract_texture_stem(&tex.data);
                        if !stem.is_empty() {
                            refs.insert(stem.to_ascii_lowercase());
                        }
                    }
                    for tex in &entry.textures2 {
                        let stem = extract_texture_stem(&tex.data);
                        if !stem.is_empty() {
                            refs.insert(stem.to_ascii_lowercase());
                        }
                    }
                }
            }
            Err(e) => {
                warnings.push(format!(
                    "Failed to parse numatb '{}' for texture refs: {e}",
                    f.file_name
                ));
            }
        }
    }
    for child in &folder.children {
        collect_numatb_texture_refs_from_tree(child, file_index_map, refs, warnings);
    }
}

/// Extract texture stem from a numatb texture path like `../../textures/stage001_skydome_sky`.
/// Returns just the final component without extension (e.g. `stage001_skydome_sky`).
fn extract_texture_stem(raw_path: &str) -> String {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let normalized = trimmed.replace('\\', "/");
    let stem = normalized.split('/').last().unwrap_or("");
    // Strip .nutexb extension if present
    let stem = stem
        .strip_suffix(".nutexb")
        .or_else(|| stem.strip_suffix(".NUTEXB"))
        .unwrap_or(stem);
    stem.to_string()
}

/// Collect nutexb files from numbered subdirs that match the referenced texture names.
/// Removes those subdirs after collection.
fn collect_nutexb_matching_refs(
    children: &mut Vec<StageVirtualTreeFolder>,
    referenced_names: &HashSet<String>,
    collected: &mut Vec<StageVirtualTreeFile>,
    seen: &mut HashSet<String>,
) {
    // Recurse into non-nutexb children
    for child in children.iter_mut() {
        let is_numeric = child.name.chars().all(|c| c.is_ascii_digit());
        let is_pure_nutexb = is_numeric
            && !child.files.is_empty()
            && child.children.is_empty()
            && child.files.iter().all(|f| f.file_type.eq_ignore_ascii_case(".nutexb"));
        if !is_pure_nutexb {
            collect_nutexb_matching_refs(&mut child.children, referenced_names, collected, seen);
        }
    }

    // Extract matching nutexb from pure-nutexb numeric subdirs
    let mut to_remove = Vec::new();
    for (i, child) in children.iter().enumerate() {
        let is_numeric = child.name.chars().all(|c| c.is_ascii_digit());
        let is_pure_nutexb = is_numeric
            && !child.files.is_empty()
            && child.children.is_empty()
            && child.files.iter().all(|f| f.file_type.eq_ignore_ascii_case(".nutexb"));
        if is_pure_nutexb {
            for f in &child.files {
                // Match by stripping .nutexb from file_name
                let stem = f
                    .file_name
                    .strip_suffix(".nutexb")
                    .unwrap_or(&f.file_name)
                    .to_ascii_lowercase();
                if referenced_names.contains(&stem) {
                    let key = f.file_name.to_ascii_lowercase();
                    if seen.insert(key) {
                        collected.push(f.clone());
                    }
                }
            }
            to_remove.push(i);
        }
    }

    for i in to_remove.into_iter().rev() {
        children.remove(i);
    }
}

// ── Extract stage FHM2D to folder (in-memory rename → disk) ────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageExtractResult {
    pub output_dir: String,
    pub total_files: usize,
    pub total_bytes: u64,
    pub warnings: Vec<String>,
}

fn write_virtual_tree_to_disk(
    tree: &StageVirtualTreeFolder,
    files: &[InMemoryFhm2dFile],
    dest: &Path,
) -> Result<(usize, u64), String> {
    let file_map: HashMap<i32, &InMemoryFhm2dFile> =
        files.iter().map(|f| (f.file_index, f)).collect();

    let mut count = 0usize;
    let mut bytes = 0u64;

    fn recurse(
        node: &StageVirtualTreeFolder,
        parent: &Path,
        file_map: &HashMap<i32, &InMemoryFhm2dFile>,
        count: &mut usize,
        bytes: &mut u64,
    ) -> Result<(), String> {
        let dir = parent.join(&node.name);
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create dir {}: {e}", dir.display()))?;

        for vf in &node.files {
            if let Some(mem_file) = file_map.get(&vf.file_index) {
                let dest_path = dir.join(&vf.file_name);
                fs::write(&dest_path, &mem_file.data)
                    .map_err(|e| format!("Failed to write {}: {e}", dest_path.display()))?;
                *count += 1;
                *bytes += mem_file.data.len() as u64;
            }
        }

        for child in &node.children {
            recurse(child, &dir, file_map, count, bytes)?;
        }
        Ok(())
    }

    for child in &tree.children {
        recurse(child, dest, &file_map, &mut count, &mut bytes)?;
    }

    for vf in &tree.files {
        if let Some(mem_file) = file_map.get(&vf.file_index) {
            let dest_path = dest.join(&vf.file_name);
            fs::write(&dest_path, &mem_file.data)
                .map_err(|e| format!("Failed to write {}: {e}", dest_path.display()))?;
            count += 1;
            bytes += mem_file.data.len() as u64;
        }
    }

    Ok((count, bytes))
}

pub fn extract_stage_fhm2d_to_folder_impl(
    source_path: &str,
    output_dir: &str,
) -> Result<StageExtractResult, String> {
    let bytes = fs::read(source_path).map_err(|e| format!("Failed to read FHM2D file: {e}"))?;

    let source_name = Path::new(source_path)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("stage")
        .to_string();

    let extraction =
        crate::format::fhm2d::extract_fhm2d_to_memory_impl(&bytes, &source_name, None)?;

    let (tree, warnings) =
        stage_rename_in_memory_numatb_based(&extraction.files, &extraction.sub_file_structure)?;

    let dest = Path::new(output_dir).join(&source_name);
    if dest.exists() {
        fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to clean existing output dir: {e}"))?;
    }
    fs::create_dir_all(&dest).map_err(|e| format!("Failed to create output dir: {e}"))?;

    let (total_files, total_bytes) = write_virtual_tree_to_disk(&tree, &extraction.files, &dest)?;

    let disk_path_map = build_file_index_disk_path_map(&tree);
    write_stage_structure_json(&dest, &extraction, &disk_path_map)?;

    Ok(StageExtractResult {
        output_dir: dest.to_string_lossy().replace('\\', "/"),
        total_files,
        total_bytes,
        warnings,
    })
}

fn build_file_index_disk_path_map(tree: &StageVirtualTreeFolder) -> HashMap<i32, String> {
    let mut map = HashMap::new();
    fn recurse(node: &StageVirtualTreeFolder, prefix: &str, map: &mut HashMap<i32, String>) {
        let current = if prefix.is_empty() {
            node.name.clone()
        } else {
            format!("{}/{}", prefix, node.name)
        };
        for vf in &node.files {
            let path = format!("{}/{}", current, vf.file_name);
            map.insert(vf.file_index, path);
        }
        for child in &node.children {
            recurse(child, &current, map);
        }
    }
    for child in &tree.children {
        recurse(child, "", &mut map);
    }
    for vf in &tree.files {
        let path = format!("{}/{}", tree.name, vf.file_name);
        map.insert(vf.file_index, path);
    }
    map
}

fn write_stage_structure_json(
    dest: &Path,
    extraction: &crate::format::fhm2d::InMemoryFhm2dExtraction,
    disk_path_map: &HashMap<i32, String>,
) -> Result<(), String> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct StageStructureOutput {
        #[serde(rename = "Magic")]
        magic: i32,
        #[serde(rename = "Fhm2dTotalCount")]
        fhm2d_total_count: usize,
        #[serde(rename = "UnkCount")]
        unk_count: u32,
        #[serde(rename = "SubFileData")]
        sub_file_data: Vec<StageSubFileDataOutput>,
        #[serde(rename = "SubFileStructure")]
        sub_file_structure: Vec<crate::format::fhm2d::SubFileStructureEntry>,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct StageSubFileDataOutput {
        index: usize,
        file_type: String,
        file_index: i32,
        file_url: String,
        file_base_name: String,
    }

    let dest_name = dest.file_name().and_then(|n| n.to_str()).unwrap_or("stage");

    let sub_file_data: Vec<StageSubFileDataOutput> = extraction
        .files
        .iter()
        .enumerate()
        .map(|(i, f)| {
            let disk_url = disk_path_map
                .get(&f.file_index)
                .map(|p| format!(".\\{}\\{}", dest_name, p.replace('/', "\\")))
                .unwrap_or_else(|| f.file_url.clone());
            let base_name = disk_url
                .replace('\\', "/")
                .split('/')
                .last()
                .unwrap_or("")
                .to_string();
            let base_name_no_ext = match base_name.rfind('.') {
                Some(idx) if idx > 0 => base_name[..idx].to_string(),
                _ => base_name.clone(),
            };
            StageSubFileDataOutput {
                index: i,
                file_type: f.file_type.clone(),
                file_index: f.file_index,
                file_url: disk_url,
                file_base_name: base_name_no_ext,
            }
        })
        .collect();

    let output = StageStructureOutput {
        magic: extraction.meta_header as i32,
        fhm2d_total_count: extraction.files.len(),
        unk_count: extraction.unk_count,
        sub_file_data,
        sub_file_structure: extraction.sub_file_structure.clone(),
    };

    let structure_path = dest
        .parent()
        .unwrap_or(dest)
        .join(format!("{dest_name}_structure.json"));

    let json = serde_json::to_string_pretty(&output)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    fs::write(&structure_path, json).map_err(|e| {
        format!(
            "Failed to write structure JSON at {}: {e}",
            structure_path.display()
        )
    })?;

    Ok(())
}

// ── Apply rename result ─────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageApplyRenameResult {
    pub renamed_root: String,
    pub folder_map: Vec<StageFolderMapping>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageFolderMapping {
    pub original_index: usize,
    pub name: String,
    pub role: String,
    pub numdlb_path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageVirtualTreeFile {
    pub file_name: String,
    pub file_type: String,
    pub size_bytes: usize,
    pub file_index: i32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageVirtualTreeFolder {
    pub name: String,
    pub children: Vec<StageVirtualTreeFolder>,
    pub files: Vec<StageVirtualTreeFile>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageInMemoryImportResult {
    pub bundle: StageBundle,
    pub tree: StageVirtualTreeFolder,
    pub warnings: Vec<String>,
    pub session_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageRenamePreviewResult {
    pub tree: StageVirtualTreeFolder,
    pub warnings: Vec<String>,
    pub source_name: String,
    pub total_files: usize,
    pub total_size_bytes: usize,
}

// ── Core: stage_apply_rename_impl ───────────────────────────────────────────

pub fn stage_apply_rename_impl(extracted_dir: &str) -> Result<StageApplyRenameResult, String> {
    let base_dir = Path::new(extracted_dir);
    if !base_dir.is_dir() {
        return Err(format!("Extracted directory not found: {extracted_dir}"));
    }

    let structure_path = format!(
        "{}_structure.json",
        extracted_dir.trim_end_matches(['/', '\\'])
    );
    let structure_json = fs::read_to_string(&structure_path)
        .map_err(|e| format!("Failed to read structure JSON at {structure_path}: {e}"))?;
    let structure: StructureJson = serde_json::from_str(&structure_json)
        .map_err(|e| format!("Failed to parse structure JSON: {e}"))?;

    let file_index_to_data: HashMap<i32, &SubFileDataEntry> = structure
        .sub_file_data
        .iter()
        .map(|e| (e.file_index, e))
        .collect();

    let folder_groups = collect_folder_groups(&structure.sub_file_structure);
    if folder_groups.len() < 3 {
        return Err(format!(
            "Stage structure has too few folders ({}), expected at least 3 (base, info, ...)",
            folder_groups.len()
        ));
    }

    let mut warnings = Vec::new();
    let mut folder_map = Vec::new();
    let total_folders = folder_groups.len();

    let renamed_root = base_dir.parent().unwrap_or(base_dir).join(format!(
        "{}_renamed",
        base_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("stage")
    ));

    if renamed_root.exists() {
        fs::remove_dir_all(&renamed_root)
            .map_err(|e| format!("Failed to clean existing renamed dir: {e}"))?;
    }
    fs::create_dir_all(&renamed_root).map_err(|e| format!("Failed to create renamed root: {e}"))?;

    for (group_pos, group) in folder_groups.iter().enumerate() {
        let (folder_name, role) = determine_folder_name(
            group_pos,
            total_folders,
            &group.item_file_indices,
            &file_index_to_data,
            base_dir,
            &mut warnings,
        );

        let dest = renamed_root.join(&folder_name);
        fs::create_dir_all(&dest)
            .map_err(|e| format!("Failed to create folder {}: {e}", dest.display()))?;

        let mut numdlb_path_out: Option<String> = None;

        if role == "info" {
            rename_info_contents(
                &group.item_file_indices,
                &file_index_to_data,
                base_dir,
                &dest,
                &mut warnings,
            )?;
        } else if role != "textures" {
            for &fi in &group.item_file_indices {
                if let Some(entry) = file_index_to_data.get(&fi) {
                    let src_name = url_to_filename(&entry.file_url);
                    let src_path = base_dir.join(&src_name);
                    if src_path.exists() {
                        let dest_file = dest.join(&src_name);
                        if let Some(parent) = dest_file.parent() {
                            fs::create_dir_all(parent).ok();
                        }
                        fs::copy(&src_path, &dest_file).map_err(|e| {
                            format!(
                                "Failed to copy {} -> {}: {e}",
                                src_path.display(),
                                dest_file.display()
                            )
                        })?;
                        if entry.file_type.eq_ignore_ascii_case(".numdlb") {
                            numdlb_path_out = Some(dest_file.to_string_lossy().replace('\\', "/"));
                        }
                    } else {
                        warnings.push(format!(
                            "Source file not found for file_index {fi}: {}",
                            src_path.display()
                        ));
                    }
                }
            }
        }

        folder_map.push(StageFolderMapping {
            original_index: group.folder_index,
            name: folder_name,
            role: role.to_string(),
            numdlb_path: numdlb_path_out,
        });
    }

    Ok(StageApplyRenameResult {
        renamed_root: renamed_root.to_string_lossy().replace('\\', "/"),
        folder_map,
        warnings,
    })
}

fn determine_folder_name(
    position: usize,
    total: usize,
    item_file_indices: &[i32],
    file_index_to_data: &HashMap<i32, &SubFileDataEntry>,
    base_dir: &Path,
    warnings: &mut Vec<String>,
) -> (String, &'static str) {
    let mut has_numdlb = false;
    let mut has_info_file = false;
    let mut nutexb_count = 0usize;

    for &fi in item_file_indices {
        if let Some(entry) = file_index_to_data.get(&fi) {
            if entry.file_type.eq_ignore_ascii_case(".numdlb") {
                has_numdlb = true;
            }
            if entry.file_type.eq_ignore_ascii_case(".nutexb") {
                nutexb_count += 1;
            }
            let src_name = url_to_filename(&entry.file_url);
            if matches!(
                src_name.to_ascii_lowercase().as_str(),
                "placement.csv"
                    | "graphic_param.csv"
                    | "plan_param.spbin"
                    | "border_hit.hkt"
                    | "stage_boundary.csv"
            ) {
                has_info_file = true;
            }
        }
    }

    if position == 0 {
        return (STAGE_BASE_NAME.to_string(), "base");
    }
    if has_info_file || position == 1 {
        return (STAGE_INFO_NAME.to_string(), "info");
    }
    if nutexb_count > 0 && !has_numdlb && position == total - 1 {
        return (STAGE_TEXTURES_NAME.to_string(), "textures");
    }

    if has_numdlb {
        for &fi in item_file_indices {
            if let Some(entry) = file_index_to_data.get(&fi) {
                if entry.file_type.eq_ignore_ascii_case(".numdlb") {
                    let src_name = url_to_filename(&entry.file_url);
                    let src_path = base_dir.join(&src_name);
                    if let Ok(data) = fs::read(&src_path) {
                        if let Some(name) = read_numdlb_model_name(&data) {
                            return (name, "sub_model");
                        }
                    }
                }
            }
        }
    }

    if position == total - 1 {
        return (STAGE_TEXTURES_NAME.to_string(), "textures");
    }

    let fallback = format!("sub_{position}");
    warnings.push(format!(
        "Could not infer name for folder at position {position}, using '{fallback}'"
    ));
    (fallback, "sub_model")
}

fn rename_info_contents(
    item_file_indices: &[i32],
    file_index_to_data: &HashMap<i32, &SubFileDataEntry>,
    base_dir: &Path,
    dest: &Path,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    let mut subfolder_idx = 0usize;
    let mut file_idx = 0usize;

    for &fi in item_file_indices {
        let entry = match file_index_to_data.get(&fi) {
            Some(e) => *e,
            None => continue,
        };
        let src_name = url_to_filename(&entry.file_url);
        let src_path = base_dir.join(&src_name);

        if !src_path.exists() {
            warnings.push(format!(
                "Info source not found for file_index {fi}: {}",
                src_path.display()
            ));
            continue;
        }

        let is_dir_like = entry.file_type.eq_ignore_ascii_case(".nutexb");

        if is_dir_like && subfolder_idx < INFO_SUBFOLDER_NAMES.len() {
            let subfolder_name = INFO_SUBFOLDER_NAMES[subfolder_idx];
            let subfolder_dest = dest.join(subfolder_name);
            fs::create_dir_all(&subfolder_dest)
                .map_err(|e| format!("Create info subfolder failed: {e}"))?;
            let dest_file = subfolder_dest.join(&src_name);
            fs::copy(&src_path, &dest_file).map_err(|e| {
                format!(
                    "Copy info nutexb failed {} -> {}: {e}",
                    src_path.display(),
                    dest_file.display()
                )
            })?;
            subfolder_idx += 1;
        } else {
            let target_name = if file_idx < INFO_FILE_NAMES.len() {
                INFO_FILE_NAMES[file_idx].to_string()
            } else {
                src_name.clone()
            };
            let dest_file = dest.join(&target_name);
            fs::copy(&src_path, &dest_file).map_err(|e| {
                format!(
                    "Copy info file failed {} -> {}: {e}",
                    src_path.display(),
                    dest_file.display()
                )
            })?;
            file_idx += 1;
        }
    }

    Ok(())
}

fn url_to_filename(file_url: &str) -> String {
    let normalized = file_url.replace('/', "\\");
    let trimmed = normalized.trim_start_matches(".\\");
    let parts: Vec<&str> = trimmed.split('\\').filter(|s| !s.is_empty()).collect();
    parts.last().unwrap_or(&"unknown").to_string()
}

// ── Stage skeleton (lightweight metadata for instant UI) ───────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSkeleton {
    pub root_path: String,
    pub placement_header: Vec<String>,
    pub placement_entries: Vec<PlacementEntry>,
    pub graphic_params: Vec<GraphicParamEntry>,
    pub sub_model_manifest: Vec<SubModelManifestEntry>,
    pub has_base_model: bool,
    pub warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubModelManifestEntry {
    pub folder_name: String,
    pub object_index: usize,
}

pub fn load_stage_skeleton_impl(stage_root: &str) -> Result<StageSkeleton, String> {
    let root = Path::new(stage_root);
    if !root.is_dir() {
        return Err(format!("Stage root directory not found: {stage_root}"));
    }

    let mut warnings = Vec::new();

    let has_base_model = {
        let base_dir = root.join(STAGE_BASE_NAME);
        base_dir.is_dir() && find_numdlb_in_dir(&base_dir).is_some()
    };

    let mut entries: Vec<_> = fs::read_dir(root)
        .map_err(|e| format!("Failed to read stage root: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .collect();
    entries.sort_by_key(|e| e.file_name());

    let mut sub_model_manifest = Vec::new();
    let mut object_index = 0usize;

    // Count non-special, non-sky model folders to determine sky's forced index.
    let skel_model_folder_count = entries.iter().filter(|e| {
        let n = e.file_name().to_string_lossy().to_string();
        n != STAGE_BASE_NAME && n != STAGE_INFO_NAME && n != STAGE_TEXTURES_NAME && n != STAGE_SKY_NAME
    }).count();

    for entry in &entries {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == STAGE_BASE_NAME || name == STAGE_INFO_NAME || name == STAGE_TEXTURES_NAME {
            continue;
        }
        let current_index = if name == STAGE_SKY_NAME {
            skel_model_folder_count
        } else {
            let idx = object_index;
            object_index += 1;
            idx
        };
        let folder = root.join(&name);
        if folder.is_dir() && find_numdlb_in_dir(&folder).is_some() {
            sub_model_manifest.push(SubModelManifestEntry {
                folder_name: name,
                object_index: current_index,
            });
        }
    }

    let graphic_params = parse_graphic_param_csv(root, &mut warnings);
    let (placement_header, placement_entries) = parse_placement_csv(root, &mut warnings);

    Ok(StageSkeleton {
        root_path: stage_root.to_string(),
        placement_header,
        placement_entries,
        graphic_params,
        sub_model_manifest,
        has_base_model,
        warnings,
    })
}

// ── Stage stream chunks (progressive model delivery) ──────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum StageStreamChunk {
    #[serde(rename = "baseModel")]
    BaseModel {
        bundle: SsbhModelPreviewBundle,
    },
    #[serde(rename = "subModel")]
    SubModel {
        folder_name: String,
        object_index: usize,
        bundle: SsbhModelPreviewBundle,
    },
    #[serde(rename = "progress")]
    Progress {
        loaded: usize,
        total: usize,
    },
    #[serde(rename = "complete")]
    Complete {
        total_models: usize,
        elapsed_ms: u64,
    },
    #[serde(rename = "error")]
    Error {
        message: String,
        folder_name: Option<String>,
    },
}

// ── Stage bundle loading ────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageBundle {
    pub root_path: String,
    pub base_model: Option<SsbhModelPreviewBundle>,
    pub sub_models: Vec<StageSubModelEntry>,
    pub graphic_params: Vec<GraphicParamEntry>,
    pub placement_header: Vec<String>,
    pub placement_entries: Vec<PlacementEntry>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSubModelEntry {
    pub folder_name: String,
    pub object_index: usize,
    pub bundle: SsbhModelPreviewBundle,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphicParamEntry {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacementEntry {
    pub vdk_type: String,
    pub object_number: Option<i32>,
    pub pos_x: f64,
    pub pos_y: f64,
    pub pos_z: f64,
    pub rot_x: f64,
    pub rot_y: f64,
    pub rot_z: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub scale_z: f64,
    pub raw_fields: Vec<String>,
}

pub fn load_stage_bundle_impl(stage_root: &str) -> Result<StageBundle, String> {
    let root = Path::new(stage_root);
    if !root.is_dir() {
        return Err(format!("Stage root directory not found: {stage_root}"));
    }

    let mut warnings = Vec::new();

    let base_model = load_model_in_subfolder(root, STAGE_BASE_NAME, &mut warnings);
    if base_model.is_none() {
        let base_dir = root.join(STAGE_BASE_NAME);
        if base_dir.is_dir() {
            warnings.push(format!(
                "base/ directory exists but no .numdlb found (searched subdirectories too): {}",
                base_dir.display()
            ));
        }
    }

    // Resolve the info folder dynamically so we can skip it from sub_models.
    let info_dir_name = find_info_dir(root)
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()));

    let mut sub_models = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(root)
        .map_err(|e| format!("Failed to read stage root: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .collect();
    entries.sort_by_key(|e| e.file_name());

    // Count non-special model folders to determine sky's forced index.
    let model_folder_count = entries.iter().filter(|e| {
        let n = e.file_name().to_string_lossy().to_string();
        n != STAGE_BASE_NAME
            && n != STAGE_TEXTURES_NAME
            && Some(n.as_str()) != info_dir_name.as_deref()
            && n != STAGE_SKY_NAME
    }).count();

    let mut object_index = 0usize;
    for entry in &entries {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == STAGE_BASE_NAME || name == STAGE_TEXTURES_NAME {
            continue;
        }
        if let Some(ref info_name) = info_dir_name {
            if name == *info_name {
                continue;
            }
        }
        // Sky is forced to the last objectIndex (= model_folder_count),
        // matching the FHM2D in-memory loader and repack ordering (R8).
        let current_index = if name == STAGE_SKY_NAME {
            model_folder_count
        } else {
            let idx = object_index;
            object_index += 1;
            idx
        };
        if let Some(bundle) = load_model_in_subfolder(root, &name, &mut warnings) {
            sub_models.push(StageSubModelEntry {
                folder_name: name,
                object_index: current_index,
                bundle,
            });
        }
    }

    let graphic_params = parse_graphic_param_csv(root, &mut warnings);
    let (placement_header, placement_entries) = parse_placement_csv(root, &mut warnings);

    Ok(StageBundle {
        root_path: stage_root.to_string(),
        base_model,
        sub_models,
        graphic_params,
        placement_header,
        placement_entries,
        warnings,
    })
}

pub fn load_model_in_subfolder_pub(
    root: &Path,
    subfolder: &str,
    warnings: &mut Vec<String>,
) -> Option<SsbhModelPreviewBundle> {
    load_model_in_subfolder(root, subfolder, warnings)
}

fn load_model_in_subfolder(
    root: &Path,
    subfolder: &str,
    warnings: &mut Vec<String>,
) -> Option<SsbhModelPreviewBundle> {
    let folder = root.join(subfolder);
    if !folder.is_dir() {
        return None;
    }
    let numdlb = find_numdlb_in_dir(&folder)?;
    let input = numdlb.to_string_lossy().to_string();
    match ssbh_preview::load_model_preview_bundle(&input) {
        Ok(bundle) => Some(bundle),
        Err(e) => {
            warnings.push(format!("Failed to load model in {subfolder}: {e}"));
            None
        }
    }
}

fn find_numdlb_in_dir(dir: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    let mut subdirs = Vec::new();
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext.eq_ignore_ascii_case("numdlb") {
                    return Some(path);
                }
            }
        } else if path.is_dir() {
            subdirs.push(path);
        }
    }
    for sub in subdirs {
        if let Ok(sub_entries) = fs::read_dir(&sub) {
            for entry in sub_entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext.eq_ignore_ascii_case("numdlb") {
                        return Some(path);
                    }
                }
            }
        }
    }
    None
}

/// Dynamically find the info directory under `root` by content detection.
///
/// A folder is considered the "info" folder if it contains any of the known
/// info files (graphic_param.csv, placement.csv, border_hit.hkt, plan_param.spbin).
/// This avoids hardcoding the folder name "info" since FHM2D does not record
/// folder names and the extracted name may differ.
fn find_info_dir(root: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name == STAGE_BASE_NAME || name == STAGE_TEXTURES_NAME {
            continue;
        }
        for known in INFO_FILE_NAMES {
            if path.join(known).exists() {
                return Some(path);
            }
        }
    }
    None
}

fn parse_graphic_param_csv(root: &Path, warnings: &mut Vec<String>) -> Vec<GraphicParamEntry> {
    let info_dir = match find_info_dir(root) {
        Some(d) => d,
        None => return Vec::new(),
    };
    let csv_path = info_dir.join("graphic_param.csv");
    if !csv_path.exists() {
        warnings.push("graphic_param.csv not found".to_string());
        return Vec::new();
    }
    match fs::read_to_string(&csv_path) {
        Ok(content) => content
            .lines()
            .filter_map(|line| {
                if line.trim().is_empty() {
                    // Preserve empty lines — EXVS uses them as section separators
                    Some(GraphicParamEntry {
                        key: String::new(),
                        value: String::new(),
                    })
                } else {
                    let parts: Vec<&str> = line.splitn(2, ',').collect();
                    if parts.len() == 2 {
                        Some(GraphicParamEntry {
                            key: parts[0].trim().to_string(),
                            value: parts[1].trim().to_string(),
                        })
                    } else {
                        None
                    }
                }
            })
            .collect(),
        Err(e) => {
            warnings.push(format!("Failed to read graphic_param.csv: {e}"));
            Vec::new()
        }
    }
}

fn parse_placement_csv(
    root: &Path,
    warnings: &mut Vec<String>,
) -> (Vec<String>, Vec<PlacementEntry>) {
    let info_dir = match find_info_dir(root) {
        Some(d) => d,
        None => return (Vec::new(), Vec::new()),
    };
    let csv_path = info_dir.join("placement.csv");
    if !csv_path.exists() {
        warnings.push("placement.csv not found".to_string());
        return (Vec::new(), Vec::new());
    }
    let mut content = match fs::read_to_string(&csv_path) {
        Ok(c) => c,
        Err(e) => {
            warnings.push(format!("Failed to read placement.csv: {e}"));
            return (Vec::new(), Vec::new());
        }
    };
    if content.starts_with('\u{feff}') {
        content.remove(0);
    }
    parse_placement_table(content.as_str(), warnings)
}

// ── In-memory CSV parsing helpers ──────────────────────────────────────────

pub fn parse_graphic_param_csv_from_bytes(
    data: &[u8],
    warnings: &mut Vec<String>,
) -> Vec<GraphicParamEntry> {
    let content = match std::str::from_utf8(data) {
        Ok(s) => s,
        Err(e) => {
            warnings.push(format!("graphic_param.csv is not valid UTF-8: {e}"));
            return Vec::new();
        }
    };
    content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(2, ',').collect();
            if parts.len() == 2 {
                Some(GraphicParamEntry {
                    key: parts[0].trim().to_string(),
                    value: parts[1].trim().to_string(),
                })
            } else {
                None
            }
        })
        .collect()
}

pub fn parse_placement_csv_from_bytes(
    data: &[u8],
    warnings: &mut Vec<String>,
) -> (Vec<String>, Vec<PlacementEntry>) {
    if std::str::from_utf8(data).is_err() {
        warnings.push(
            "placement.csv contains invalid UTF-8; decoding with replacement characters"
                .to_string(),
        );
    }
    let text = String::from_utf8_lossy(data);
    let content = text.strip_prefix('\u{feff}').unwrap_or(text.as_ref());
    parse_placement_table(content, warnings)
}

// ── In-memory stage bundle building ──────────────────────────────────────────

fn navigate_virtual_tree_ref<'a>(
    root: &'a StageVirtualTreeFolder,
    path: &[usize],
) -> Option<&'a StageVirtualTreeFolder> {
    let mut current = root;
    for &idx in path {
        current = current.children.get(idx)?;
    }
    Some(current)
}

pub fn build_stage_bundle_from_memory(
    files: &[InMemoryFhm2dFile],
    tree: &StageVirtualTreeFolder,
    session_id: Option<&str>,
    mut on_model_progress: impl FnMut(usize, usize, &str),
) -> Result<StageBundle, String> {
    let file_index_map: HashMap<i32, &InMemoryFhm2dFile> =
        files.iter().map(|f| (f.file_index, f)).collect();

    let path = find_stage_content_level(tree);
    let content = if path.is_empty() {
        tree
    } else {
        navigate_virtual_tree_ref(tree, &path)
            .ok_or_else(|| "Failed to navigate to stage content level".to_string())?
    };

    let mut bundle_warnings = Vec::new();
    let mut base_model: Option<SsbhModelPreviewBundle> = None;
    let mut sub_models: Vec<StageSubModelEntry> = Vec::new();
    let mut graphic_params = Vec::new();
    let mut placement_header = Vec::new();
    let mut placement_entries = Vec::new();

    let sub_folder_count = content
        .children
        .iter()
        .filter(|c| {
            let n = c.name.as_str();
            n != STAGE_BASE_NAME && n != STAGE_INFO_NAME && n != STAGE_TEXTURES_NAME
        })
        .count();
    let model_children: Vec<_> = content
        .children
        .iter()
        .enumerate()
        .filter(|(_, c)| c.name != STAGE_INFO_NAME)
        .collect();
    let model_total = model_children.len();
    let shared_nutexb_entries: Vec<(String, String)> = content
        .children
        .iter()
        .find(|c| c.name.to_lowercase() == STAGE_TEXTURES_NAME)
        .map(|tex_folder| collect_nutexb_entries_with_virtual_paths(tex_folder, &file_index_map))
        .unwrap_or_default();

    let mut model_done = 0usize;
    let mut object_index = 0usize;

    for child in content.children.iter() {
        let is_base = child.name == STAGE_BASE_NAME;
        let is_info = child.name == STAGE_INFO_NAME;
        let is_textures = child.name.to_lowercase() == STAGE_TEXTURES_NAME;
        let is_sky = child.name == STAGE_SKY_NAME;

        if is_info {
            for file in &child.files {
                if file.file_name == "graphic_param.csv" {
                    if let Some(f) = file_index_map.get(&file.file_index) {
                        graphic_params =
                            parse_graphic_param_csv_from_bytes(&f.data, &mut bundle_warnings);
                    }
                } else if file.file_name == "placement.csv" {
                    if let Some(f) = file_index_map.get(&file.file_index) {
                        let (h, e) = parse_placement_csv_from_bytes(&f.data, &mut bundle_warnings);
                        placement_header = h;
                        placement_entries = e;
                    }
                }
            }
            continue;
        }

        if is_textures {
            continue;
        }

        on_model_progress(model_done, model_total, &child.name);

        if is_base {
            for sub_folder in &child.children {
                if let Some(bundle) = build_model_bundle_from_virtual_folder(
                    sub_folder,
                    &file_index_map,
                    &mut bundle_warnings,
                    session_id,
                    &shared_nutexb_entries,
                ) {
                    base_model = Some(bundle);
                    break;
                }
            }
            model_done += 1;
            continue;
        }

        let current_index = if is_sky {
            sub_folder_count.saturating_sub(1)
        } else {
            let idx = object_index;
            object_index += 1;
            idx
        };

        for sub_folder in &child.children {
            if let Some(bundle) = build_model_bundle_from_virtual_folder(
                sub_folder,
                &file_index_map,
                &mut bundle_warnings,
                session_id,
                &shared_nutexb_entries,
            ) {
                sub_models.push(StageSubModelEntry {
                    folder_name: child.name.clone(),
                    object_index: current_index,
                    bundle,
                });
                break;
            }
        }

        if !sub_models.iter().any(|s| s.folder_name == child.name) {
            if let Some(bundle) = build_model_bundle_from_virtual_folder(
                child,
                &file_index_map,
                &mut bundle_warnings,
                session_id,
                &shared_nutexb_entries,
            ) {
                sub_models.push(StageSubModelEntry {
                    folder_name: child.name.clone(),
                    object_index: current_index,
                    bundle,
                });
            }
        }

        model_done += 1;
    }

    if placement_entries.is_empty() {
        if let Some((h, e)) =
            collect_placement_csv_from_virtual_tree(tree, &file_index_map, &mut bundle_warnings)
        {
            if !e.is_empty() {
                placement_header = h;
                placement_entries = e;
                bundle_warnings.push(
                    "placement.csv loaded via tree scan (info slot did not attach rows)"
                        .to_string(),
                );
            }
        }
    }

    Ok(StageBundle {
        root_path: "memory://stage".to_string(),
        base_model,
        sub_models,
        graphic_params,
        placement_header,
        placement_entries,
        warnings: bundle_warnings,
    })
}

/// Collects nutexb entries with (filename, virtual_path) pairs.
/// The virtual_path comes from the extraction's file_url, suitable for session-based IPC lookup.
fn collect_nutexb_entries_with_virtual_paths(
    folder: &StageVirtualTreeFolder,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = folder
        .files
        .iter()
        .filter(|f| f.file_type.eq_ignore_ascii_case(".nutexb"))
        .filter_map(|f| {
            let extraction_file = file_index_map.get(&f.file_index)?;
            let virtual_path = extraction_file
                .file_url
                .trim()
                .replace('\\', "/")
                .trim_start_matches("./")
                .to_string();
            Some((f.file_name.clone(), virtual_path))
        })
        .collect();
    for child in &folder.children {
        out.extend(collect_nutexb_entries_with_virtual_paths(
            child,
            file_index_map,
        ));
    }
    out
}

fn build_model_bundle_from_virtual_folder(
    folder: &StageVirtualTreeFolder,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
    warnings: &mut Vec<String>,
    session_id: Option<&str>,
    shared_nutexb_entries: &[(String, String)],
) -> Option<SsbhModelPreviewBundle> {
    let numdlb_vf = folder
        .files
        .iter()
        .find(|f| f.file_type.eq_ignore_ascii_case(".numdlb"))?;

    let numdlb_data = file_index_map.get(&numdlb_vf.file_index)?;
    let modl = match fhm2d_memory_preview::load_modl_data(&numdlb_data.data) {
        Ok(m) => m,
        Err(e) => {
            warnings.push(format!("Failed to parse numdlb in '{}': {e}", folder.name));
            return None;
        }
    };

    let numshb_vf = folder
        .files
        .iter()
        .find(|f| f.file_type.eq_ignore_ascii_case(".numshb"));

    let mesh = numshb_vf
        .and_then(|vf| file_index_map.get(&vf.file_index))
        .and_then(|f| match fhm2d_memory_preview::load_mesh_data(&f.data) {
            Ok(m) => Some(m),
            Err(e) => {
                warnings.push(format!("Failed to parse numshb in '{}': {e}", folder.name));
                None
            }
        });

    let mesh = match mesh {
        Some(m) => m,
        None => {
            warnings.push(format!(
                "No valid numshb in '{}', skipping model",
                folder.name
            ));
            return None;
        }
    };

    let skel = folder
        .files
        .iter()
        .find(|f| f.file_type.eq_ignore_ascii_case(".nusktb"))
        .and_then(|vf| file_index_map.get(&vf.file_index))
        .and_then(|f| fhm2d_memory_preview::load_skel_data(&f.data).ok());

    let matl_files: Vec<&[u8]> = folder
        .files
        .iter()
        .filter(|f| f.file_type.eq_ignore_ascii_case(".numatb"))
        .filter_map(|vf| file_index_map.get(&vf.file_index))
        .map(|f| f.data.as_slice())
        .collect();

    let mut matl_combined: Option<ssbh_data::prelude::MatlData> = None;
    for bytes in &matl_files {
        match fhm2d_memory_preview::load_matl_data(bytes) {
            Ok(parsed) => match matl_combined.as_mut() {
                None => matl_combined = Some(parsed),
                Some(existing) => existing.entries.extend(parsed.entries),
            },
            Err(e) => {
                warnings.push(format!("Failed to parse numatb in '{}': {e}", folder.name));
            }
        }
    }

    let texture_refs = matl_combined
        .as_ref()
        .map(fhm2d_memory_preview::collect_texture_refs)
        .unwrap_or_default();

    let nutexb_entries = collect_nutexb_entries_with_virtual_paths(folder, file_index_map);

    let mut texture_resolve = Vec::new();
    let mut resolved_nutexb_paths = Vec::new();
    for reference in &texture_refs {
        let ref_stem = reference
            .trim()
            .replace('\\', "/")
            .split('/')
            .next_back()
            .unwrap_or(reference.trim())
            .to_string();
        let ref_stem_lower = ref_stem.to_ascii_lowercase();
        let ref_nutexb = if ref_stem_lower.ends_with(".nutexb") {
            ref_stem_lower.clone()
        } else {
            let stem = ref_stem_lower
                .strip_suffix(".nutexb")
                .unwrap_or(&ref_stem_lower);
            format!("{stem}.nutexb")
        };

        let matched = nutexb_entries
            .iter()
            .find(|(name, _)| name.to_ascii_lowercase() == ref_nutexb)
            .or_else(|| {
                shared_nutexb_entries
                    .iter()
                    .find(|(name, _)| name.to_ascii_lowercase() == ref_nutexb)
            });
        if let Some((_, virtual_path)) = matched {
            resolved_nutexb_paths.push(virtual_path.clone());
            texture_resolve.push(TextureRefResolve {
                reference: reference.clone(),
                nutexb_path: Some(virtual_path.clone()),
            });
        } else {
            texture_resolve.push(TextureRefResolve {
                reference: reference.clone(),
                nutexb_path: None,
            });
        }
    }

    let modl_json = serde_json::to_value(&modl).ok()?;
    let mesh_json = serde_json::to_value(&mesh).ok()?;
    let skel_json = skel.as_ref().and_then(|s| serde_json::to_value(s).ok());
    let matl_json = matl_combined
        .as_ref()
        .and_then(|m| serde_json::to_value(m).ok());

    let matl_paths: Vec<String> = folder
        .files
        .iter()
        .filter(|f| f.file_type.eq_ignore_ascii_case(".numatb"))
        .map(|f| f.file_name.clone())
        .collect();

    let (source_kind, source_session_id) = if let Some(sid) = session_id {
        ("memory".to_string(), Some(sid.to_string()))
    } else {
        ("stage_memory".to_string(), None)
    };

    Some(SsbhModelPreviewBundle {
        root_folder: format!("memory://stage/{}", folder.name),
        modl_path: numdlb_vf.file_name.clone(),
        mesh_path: numshb_vf.map(|v| v.file_name.clone()).unwrap_or_default(),
        skel_path: None,
        matl_paths,
        modl: modl_json,
        mesh: mesh_json,
        skel: skel_json,
        matl: matl_json,
        texture_refs,
        resolved_nutexb_paths,
        texture_resolve,
        warnings: Vec::new(),
        source_kind,
        source_session_id,
        virtual_modl_path: None,
    })
}

// ── Texture Redistribution (shared textures/ → per-model numbered subdirs) ─

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedistributeResult {
    pub models_processed: usize,
    pub textures_copied: usize,
    pub textures_folder_removed: bool,
    pub warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreSharedResult {
    pub textures_collected: usize,
    pub subdirs_removed: usize,
    pub warnings: Vec<String>,
}

// ── Structure JSON path helper ────────────────────────────────────────────

fn find_structure_json_path(stage_root: &Path) -> Option<PathBuf> {
    let folder_name = stage_root.file_name()?.to_str()?;
    let parent = stage_root.parent()?;
    let candidate = parent.join(format!("{folder_name}_structure.json"));
    if candidate.is_file() {
        Some(candidate)
    } else {
        let hex = format!("0x{}", folder_name.to_uppercase());
        let alt = parent.join(format!("{hex}_structure.json"));
        if alt.is_file() {
            Some(alt)
        } else {
            None
        }
    }
}

/// Batch-replace `fileUrl` values in an existing `_structure.json`.
/// `url_map` maps `old_relative_suffix` → `new_relative_suffix` (backslash-separated).
fn patch_structure_json_urls(
    structure_path: &Path,
    url_map: &HashMap<String, String>,
) -> Result<(), String> {
    if url_map.is_empty() {
        return Ok(());
    }
    let content = fs::read_to_string(structure_path)
        .map_err(|e| format!("Failed to read structure JSON for patching: {e}"))?;
    let mut doc: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse structure JSON for patching: {e}"))?;

    if let Some(arr) = doc.get_mut("SubFileData").and_then(|v| v.as_array_mut()) {
        for entry in arr.iter_mut() {
            if let Some(url_val) = entry.get_mut("fileUrl") {
                if let Some(url_str) = url_val.as_str() {
                    let normalized = url_str.replace('/', "\\");
                    if let Some(new_url) = url_map.get(&normalized) {
                        *url_val = serde_json::Value::String(new_url.clone());
                    }
                }
            }
        }
    }

    let json = serde_json::to_string_pretty(&doc)
        .map_err(|e| format!("Failed to serialize patched structure JSON: {e}"))?;
    fs::write(structure_path, json)
        .map_err(|e| format!("Failed to write patched structure JSON: {e}"))?;
    Ok(())
}

// ── Rebuild structure JSON from disk ──────────────────────────────────────

const STAGE_PACK_EXTENSIONS: &[&str] = &[
    ".bin",
    ".csv",
    ".hkt",
    ".jnttbl",
    ".numatb",
    ".numdlb",
    ".numshb",
    ".nuanmb",
    ".nudnbb",
    ".nufxlb",
    ".nuhlpb",
    ".nurpdb",
    ".nushdb",
    ".nus3bank",
    ".nusktb",
    ".nutexb",
    ".spbin",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RebuildStructureOutput {
    #[serde(rename = "Magic")]
    magic: i32,
    #[serde(rename = "Fhm2dTotalCount")]
    fhm2d_total_count: usize,
    #[serde(rename = "UnkCount")]
    unk_count: u32,
    #[serde(rename = "SubFileData")]
    sub_file_data: Vec<RebuildSubFileData>,
    #[serde(rename = "SubFileStructure")]
    sub_file_structure: Vec<SubFileStructureEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RebuildSubFileData {
    index: usize,
    file_type: String,
    file_index: i32,
    file_url: String,
    file_base_name: String,
}

fn is_packable_extension(ext: &str) -> bool {
    let lower = ext.to_ascii_lowercase();
    STAGE_PACK_EXTENSIONS.iter().any(|e| *e == lower)
}

fn ext_of(name: &str) -> String {
    match name.rfind('.') {
        Some(idx) if idx > 0 => name[idx..].to_ascii_lowercase(),
        _ => String::new(),
    }
}

fn dir_is_empty_recursive(dir: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            let path = e.path();
            if path.is_file() {
                let name = e.file_name().to_string_lossy().to_string();
                if !name.starts_with('_') && !name.starts_with('.') {
                    let ext = ext_of(&name);
                    if is_packable_extension(&ext) {
                        return false;
                    }
                }
            } else if path.is_dir() {
                let name = e.file_name().to_string_lossy().to_string();
                if !name.starts_with('_')
                    && !name.starts_with('.')
                    && !dir_is_empty_recursive(&path)
                {
                    return false;
                }
            }
        }
    }
    true
}

fn is_texture_container_dir(dir: &Path) -> bool {
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if !name.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                return false;
            }
            let n = e.file_name().to_string_lossy().to_ascii_lowercase();
            if !n.ends_with(".nutexb") {
                return false;
            }
        }
        // EXVS allows empty texture containers (e.g. sky __nust__ with 0 textures)
        true
    } else {
        false
    }
}

fn file_type_for_ext(ext: &str) -> String {
    match ext.to_ascii_lowercase().as_str() {
        ".nutexb" | ".nusktb" | ".numatb" | ".numshb" | ".numdlb" | ".nuanmb" | ".nurpdb"
        | ".nushdb" | ".nufxlb" | ".nuhlpb" | ".nudnbb" | ".nus3bank" => ext.to_ascii_lowercase(),
        _ => ".bin".to_string(),
    }
}

fn unk2_for_ext(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        ".nusktb" => "10000000",
        ".numatb" => "21000000",
        ".numshb" => "30000000",
        ".numdlb" => "40000000",
        ".jnttbl" => "50000000",
        _ => "00000000",
    }
}

fn collect_packable_files_recursive(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            let path = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('_') || name.starts_with('.') {
                continue;
            }
            if path.is_dir() {
                collect_packable_files_recursive(&path, out);
            } else {
                let ext = ext_of(&name);
                if is_packable_extension(&ext) {
                    out.push(path);
                }
            }
        }
    }
}

fn normalized_path_key(path: &Path) -> String {
    fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn file_content_signature(path: &Path) -> Result<(String, u64, u32), String> {
    let data = fs::read(path)
        .map_err(|e| format!("Failed to read {} for link detection: {e}", path.display()))?;
    let ext = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(ext_of)
        .unwrap_or_default();
    Ok((ext, data.len() as u64, crc32fast::hash(&data)))
}

fn extra_files_are_link_materializations(
    extra_files: &[PathBuf],
    referenced_paths: &[PathBuf],
) -> Result<bool, String> {
    if extra_files.is_empty() {
        return Ok(true);
    }

    let mut referenced_signatures = HashSet::new();
    for path in referenced_paths {
        referenced_signatures.insert(file_content_signature(path)?);
    }

    for path in extra_files {
        let signature = file_content_signature(path)?;
        if !referenced_signatures.contains(&signature) {
            return Ok(false);
        }
    }

    Ok(true)
}

fn resolve_structure_file_url(json_dir: &Path, file_url: &str) -> PathBuf {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    json_dir.join(cleaned)
}

fn try_preserve_original_structure(
    root: &Path,
    original_path: &Path,
    output_path: &Path,
) -> Result<String, String> {
    let content = fs::read_to_string(original_path)
        .map_err(|e| format!("Cannot read original structure: {e}"))?;
    let original: StructureJson = serde_json::from_str(&content)
        .map_err(|e| format!("Cannot parse original structure: {e}"))?;

    let json_dir = original_path
        .parent()
        .ok_or_else(|| "Cannot determine JSON parent directory".to_string())?;

    let ref_count = original.sub_file_data.len();
    let mut referenced_paths = Vec::with_capacity(ref_count);
    for entry in &original.sub_file_data {
        let resolved = resolve_structure_file_url(json_dir, &entry.file_url);
        if !resolved.is_file() {
            return Err(format!(
                "Referenced file missing: {} (resolved: {})",
                entry.file_url,
                resolved.display()
            ));
        }
        referenced_paths.push(resolved);
    }

    let mut disk_files = Vec::new();
    collect_packable_files_recursive(root, &mut disk_files);
    let disk_count = disk_files.len();
    if disk_count != ref_count {
        if disk_count < ref_count {
            return Err(format!(
                "File count mismatch: {} referenced vs {} on disk",
                ref_count, disk_count
            ));
        }

        let referenced_keys: HashSet<String> = referenced_paths
            .iter()
            .map(|p| normalized_path_key(p))
            .collect();
        let extra_files: Vec<PathBuf> = disk_files
            .iter()
            .filter(|p| !referenced_keys.contains(&normalized_path_key(p)))
            .cloned()
            .collect();

        if !extra_files_are_link_materializations(&extra_files, &referenced_paths)? {
            return Err(format!(
                "File count mismatch: {} referenced vs {} on disk ({} extra non-linked file(s))",
                ref_count,
                disk_count,
                extra_files.len()
            ));
        }

        eprintln!(
            "[rebuild_structure] Preserving original structure with {} materialized linked file path(s)",
            extra_files.len()
        );
    }

    if original_path == output_path {
        eprintln!(
            "[rebuild_structure] Preserved original structure in-place ({ref_count} files) at {}",
            output_path.display()
        );
    } else {
        fs::write(output_path, &content)
            .map_err(|e| format!("Failed to write preserved structure: {e}"))?;
        eprintln!(
            "[rebuild_structure] Preserved original structure ({ref_count} files) -> {}",
            output_path.display()
        );
    }

    Ok(output_path.to_string_lossy().to_string())
}

struct RebuildCollector {
    files: Vec<(String, String)>,
    structure: Vec<SubFileStructureEntry>,
    /// Deduplication map for nutexb files in texture container dirs.
    /// Key: lowercase filename (e.g. "stage001_panel_01_diffuse.nutexb")
    /// Value: the first fileIndex assigned to this texture.
    /// Same-named nutexb across different model folders share one SubFileData entry.
    nutexb_dedup: HashMap<String, i32>,
}

impl RebuildCollector {
    fn new() -> Self {
        Self {
            files: Vec::new(),
            structure: Vec::new(),
            nutexb_dedup: HashMap::new(),
        }
    }

    fn add_file(&mut self, rel_path: String, ext: String) -> i32 {
        let idx = self.files.len() as i32;
        self.files.push((rel_path, ext));
        idx
    }

    /// Add a nutexb file with deduplication by lowercase filename.
    /// If the same filename was already added, returns the existing fileIndex
    /// and `is_link=true`. Otherwise creates a new SubFileData entry.
    fn add_nutexb_dedup(&mut self, rel_path: String, filename_lower: &str) -> (i32, bool) {
        if let Some(&existing_idx) = self.nutexb_dedup.get(filename_lower) {
            return (existing_idx, true);
        }
        let idx = self.files.len() as i32;
        self.files.push((rel_path, ".nutexb".to_string()));
        self.nutexb_dedup.insert(filename_lower.to_string(), idx);
        (idx, false)
    }

    fn push_item(&mut self, file_index: i32, unk2: &str) {
        self.push_item_ex(file_index, unk2, 0);
    }

    fn push_item_ex(&mut self, file_index: i32, unk2: &str, unk3: i32) {
        self.structure.push(SubFileStructureEntry::Item {
            unk1: "00000000".to_string(),
            file_index,
            unk2: unk2.to_string(),
            unk2_1: 0,
            unk3,
            unk4: 0,
            original_file_index: file_index,
            display_name: None,
        });
    }

    fn push_folder(&mut self, child_count: i32, unk3: i32) {
        let unk5 = if unk3 == 32 { 1 } else { 0 };
        self.structure.push(SubFileStructureEntry::Folder {
            unk1: "00000000".to_string(),
            folder_count: child_count,
            unk2: "00000000".to_string(),
            unk2_1: 0,
            unk3,
            unk4: 0,
            unk5,
            unk6: 0,
        });
    }

    fn push_end(&mut self, count: i32) {
        self.structure.push(SubFileStructureEntry::EndMark {
            end_mark_count: count,
        });
    }
}

fn collect_sorted_entries(dir: &Path) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            let path = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('_') || name.starts_with('.') {
                continue;
            }
            if path.is_dir() {
                dirs.push(path);
            } else {
                let ext = ext_of(&name);
                if is_packable_extension(&ext) {
                    files.push(path);
                }
            }
        }
    }
    dirs.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    (dirs, files)
}

/// Recursively walk a directory and emit SubFileStructure entries.
/// Texture container dirs (all-digit name, only nutexb children) get unk3=32.
/// All other dirs get unk3=0.
/// Returns a sort key for loose files inside info/ directory.
/// EXVS fixed order: border_hit.hkt(0), placement.csv(1), graphic_param.csv(2), plan_param.spbin(3).
/// Files not in the known list sort alphabetically after the known ones.
fn info_file_order(name: &str) -> (u8, String) {
    let lower = name.to_ascii_lowercase();
    match lower.as_str() {
        n if n.contains("border_hit") => (0, String::new()),
        n if n.contains("placement") => (1, String::new()),
        n if n.contains("graphic_param") => (2, String::new()),
        n if n.contains("plan_param") => (3, String::new()),
        _ => (4, lower),
    }
}

/// Returns a sort key for content-level directories.
/// Order: base=0, info=1, sky=3, textures=4 (excluded), everything else=2 (models, alphabetical).
fn stage_content_dir_order(name: &str) -> (u8, String) {
    match name {
        n if n == STAGE_BASE_NAME => (0, String::new()),
        n if n == STAGE_INFO_NAME => (1, String::new()),
        n if n == STAGE_SKY_NAME => (3, String::new()),
        n if n == STAGE_TEXTURES_NAME => (4, String::new()),
        other => (2, other.to_string()),
    }
}

// ── EXVS Structure Tree Builder ──────────────────────────────────────────────

struct ExvsBuildOpts {
    include_shared_textures: bool,
}

fn unk2_for_file(file: &Path, ext: &str) -> &'static str {
    if ext == ".nutexb" {
        if let Some(parent) = file.parent() {
            let parent_name = parent
                .file_name()
                .map(|n| n.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            if parent_name == "post_effect" {
                return "01010000";
            }
        }
    }
    unk2_for_ext(ext)
}

/// Entry point: build the full EXVS SubFileStructure tree from a stage root directory.
fn build_exvs_structure_tree(
    c: &mut RebuildCollector,
    root: &Path,
    folder_name: &str,
    opts: &ExvsBuildOpts,
) {
    build_exvs_directory(c, root, root, folder_name, &[], 0, opts);

    // EXVS game-original archives have a trailing empty Folder(count=0) INSIDE
    // the first wrapper Folder (the "0/" level). In origin data the structure is:
    //   Folder(count=2) -> [content Folder, empty Folder(0)]
    // The empty Folder must be inserted before the wrapper's closing EndMark,
    // not appended after it.
    // Find the last EndMark (which closes the depth=1 wrapper Folder) and insert before it.
    let insert_pos = c.structure.len().saturating_sub(1);
    c.structure.insert(
        insert_pos,
        SubFileStructureEntry::Folder {
            unk1: "00000000".to_string(),
            folder_count: 0,
            unk2: "00000000".to_string(),
            unk2_1: 0,
            unk3: 0,
            unk4: 0,
            unk5: 0,
            unk6: 0,
        },
    );
    // Insert EndMark(1) to close the empty Folder, right after it
    c.structure.insert(
        insert_pos + 1,
        SubFileStructureEntry::EndMark { end_mark_count: 1 },
    );
    // Patch the first Folder to reflect the added child.
    if let Some(SubFileStructureEntry::Folder { folder_count, .. }) = c.structure.first_mut() {
        *folder_count += 1;
    }
}

/// Push a single file as an Item node with the correct EXVS unk2 type tag.
fn push_exvs_file_item(
    c: &mut RebuildCollector,
    file: &Path,
    root: &Path,
    folder_name: &str,
) {
    let ext = ext_of(&file.file_name().unwrap().to_string_lossy());
    let rel = file
        .strip_prefix(root)
        .unwrap()
        .to_string_lossy()
        .replace('\\', "/");
    let idx = c.add_file(
        format!(".\\{}\\{}", folder_name, rel.replace('/', "\\")),
        ext.clone(),
    );
    c.push_item(idx, unk2_for_file(file, &ext));
}

/// Build a texture container folder (unk3=32, unk5=1) with deduplicated nutexb items.
fn build_exvs_texture_container(
    c: &mut RebuildCollector,
    tex_dir: &Path,
    root: &Path,
    folder_name: &str,
) {
    let tex_files = collect_sorted_entries(tex_dir).1;
    c.push_folder(tex_files.len() as i32, 32);
    for tf in &tex_files {
        let rel = tf
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let filename_lower = tf
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_ascii_lowercase();
        let (idx, _) = c.add_nutexb_dedup(
            format!(".\\{}\\{}", folder_name, rel.replace('/', "\\")),
            &filename_lower,
        );
        c.push_item_ex(idx, "00000000", 0);
    }
    c.push_end(1);
}

/// Build an SSBH model folder with canonical EXVS item ordering:
/// nusktb → (texture_container + numatb) pairs → numshb → numdlb → jnttbl
fn build_exvs_model_folder(
    c: &mut RebuildCollector,
    files: &[PathBuf],
    tex_container_dirs: &[&PathBuf],
    relevant_dirs: &[&PathBuf],
    root: &Path,
    folder_name: &str,
    depth: usize,
    opts: &ExvsBuildOpts,
) {
    let mut nusktb_files: Vec<&PathBuf> = Vec::new();
    let mut numatb_files: Vec<&PathBuf> = Vec::new();
    let mut numshb_files: Vec<&PathBuf> = Vec::new();
    let mut numdlb_files: Vec<&PathBuf> = Vec::new();
    let mut jnttbl_files: Vec<&PathBuf> = Vec::new();
    let mut other_files: Vec<&PathBuf> = Vec::new();

    for f in files {
        match ext_of(&f.file_name().unwrap().to_string_lossy()).as_str() {
            ".nusktb" => nusktb_files.push(f),
            ".numatb" => numatb_files.push(f),
            ".numshb" => numshb_files.push(f),
            ".numdlb" => numdlb_files.push(f),
            ".jnttbl" => jnttbl_files.push(f),
            _ => other_files.push(f),
        }
    }

    // ① Skeleton — always first
    for f in &nusktb_files {
        push_exvs_file_item(c, f, root, folder_name);
    }

    // ② + ③ Texture containers interleaved with paired numatb.
    // EXVS requires exactly 2 material texture folders per model:
    //   container 0 (__maya__) and container 1 (__nust__).
    // Even if __nust__ has 0 textures, an empty Folder(0, unk3=32, unk5=1)
    // MUST be emitted followed by its paired numatb. Without this, the game
    // fails to locate materials correctly.
    let mut sorted_containers: Vec<&&PathBuf> = tex_container_dirs.iter().collect();
    sorted_containers.sort_by_key(|d| d.file_name().unwrap().to_string_lossy().to_string());

    let numatb_maya: Vec<&PathBuf> = numatb_files
        .iter()
        .filter(|f| f.file_name().unwrap().to_string_lossy().to_ascii_lowercase().contains("__maya__"))
        .copied()
        .collect();
    let numatb_nust: Vec<&PathBuf> = numatb_files
        .iter()
        .filter(|f| f.file_name().unwrap().to_string_lossy().to_ascii_lowercase().contains("__nust__"))
        .copied()
        .collect();
    let numatb_other: Vec<&PathBuf> = numatb_files
        .iter()
        .filter(|f| {
            let n = f.file_name().unwrap().to_string_lossy().to_ascii_lowercase();
            !n.contains("__maya__") && !n.contains("__nust__")
        })
        .copied()
        .collect();

    // Emit container 0 (__maya__)
    if let Some(tc0) = sorted_containers.first() {
        build_exvs_texture_container(c, tc0, root, folder_name);
    } else {
        c.push_folder(0, 32);
        c.push_end(1);
    }
    for f in &numatb_maya {
        push_exvs_file_item(c, f, root, folder_name);
    }

    // Emit container 1 (__nust__) - EXVS mandates this even when empty (0 textures)
    if let Some(tc1) = sorted_containers.get(1) {
        build_exvs_texture_container(c, tc1, root, folder_name);
    } else {
        c.push_folder(0, 32);
        c.push_end(1);
    }
    for f in &numatb_nust {
        push_exvs_file_item(c, f, root, folder_name);
    }

    // Additional containers beyond 0/1 (rare)
    for tc in sorted_containers.iter().skip(2) {
        build_exvs_texture_container(c, tc, root, folder_name);
        for f in &numatb_other {
            push_exvs_file_item(c, f, root, folder_name);
        }
    }

    // ⑥ ⑦ ⑧ Mesh → Model → Joint table
    for f in &numshb_files {
        push_exvs_file_item(c, f, root, folder_name);
    }
    for f in &numdlb_files {
        push_exvs_file_item(c, f, root, folder_name);
    }
    if !jnttbl_files.is_empty() {
        for f in &jnttbl_files {
            push_exvs_file_item(c, f, root, folder_name);
        }
    } else if !numdlb_files.is_empty() {
        // R6/R7: EXVS requires a jnttbl for every SSBH model. Auto-create 0-byte file.
        let numdlb_stem = numdlb_files[0]
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");
        let jnttbl_path = numdlb_files[0].with_file_name(format!("{numdlb_stem}.jnttbl"));
        if !jnttbl_path.exists() {
            if let Err(e) = fs::write(&jnttbl_path, b"") {
                eprintln!("[build_exvs_model_folder] Failed to auto-create jnttbl {}: {e}", jnttbl_path.display());
            }
        }
        push_exvs_file_item(c, &jnttbl_path, root, folder_name);
    }

    // Other files (e.g., .hkt at model dir level)
    for f in &other_files {
        push_exvs_file_item(c, f, root, folder_name);
    }

    // Non-texture subdirs (recurse)
    let other_subdirs: Vec<&PathBuf> = relevant_dirs
        .iter()
        .filter(|d| !is_texture_container_dir(d))
        .copied()
        .collect();
    for d in &other_subdirs {
        build_exvs_directory(c, d, root, folder_name, &[], depth + 1, opts);
    }
}

/// Recursively build the EXVS structure for a directory.
/// Detects directory type and dispatches to the appropriate handler.
fn build_exvs_directory(
    c: &mut RebuildCollector,
    dir: &Path,
    root: &Path,
    folder_name: &str,
    skip_names: &[&str],
    depth: usize,
    opts: &ExvsBuildOpts,
) {
    if depth > 20 {
        return;
    }

    let (subdirs, files) = collect_sorted_entries(dir);
    let relevant_dirs: Vec<&PathBuf> = subdirs
        .iter()
        .filter(|d| {
            let n = d.file_name().unwrap().to_string_lossy().to_string();
            !skip_names.contains(&n.as_str())
        })
        .filter(|d| {
            // Keep digit-named dirs (potential texture containers) even if empty.
            // EXVS requires empty __nust__ containers to be preserved.
            let name = d.file_name().unwrap().to_string_lossy().to_string();
            if name.chars().all(|c| c.is_ascii_digit()) {
                return true;
            }
            !dir_is_empty_recursive(d)
        })
        .collect();

    // At the content level (where base/, info/, sky/ exist), enforce
    // the canonical FHM2D ordering: base → info → {models sorted} → sky → textures.
    let has_base = relevant_dirs
        .iter()
        .any(|d| d.file_name().unwrap().to_string_lossy().eq_ignore_ascii_case(STAGE_BASE_NAME));
    let relevant_dirs = if has_base {
        let mut sorted: Vec<&PathBuf> = relevant_dirs
            .into_iter()
            .filter(|d| {
                let name = d.file_name().unwrap().to_string_lossy().to_ascii_lowercase();
                if name == STAGE_TEXTURES_NAME {
                    return opts.include_shared_textures;
                }
                true
            })
            .collect();
        sorted.sort_by(|a, b| {
            let an = a.file_name().unwrap().to_string_lossy().to_ascii_lowercase();
            let bn = b.file_name().unwrap().to_string_lossy().to_ascii_lowercase();
            stage_content_dir_order(&an).cmp(&stage_content_dir_order(&bn))
        });
        sorted
    } else {
        relevant_dirs
    };

    let child_count = relevant_dirs.len() + files.len();
    if child_count == 0 && depth > 0 {
        return;
    }

    if depth > 0 {
        let dir_name = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let unk3 = if dir_name.to_ascii_lowercase() == STAGE_TEXTURES_NAME { 64 } else { 0 };
        c.push_folder(child_count as i32, unk3);
    }

    // Detect directory type
    let tex_container_dirs: Vec<&PathBuf> = relevant_dirs
        .iter()
        .filter(|d| is_texture_container_dir(d))
        .copied()
        .collect();
    let has_nusktb = files
        .iter()
        .any(|f| ext_of(&f.file_name().unwrap().to_string_lossy()) == ".nusktb");
    // EXVS SSBH model detection: has nusktb AND (has texture containers OR has numatb).
    // Sky models may have no texture container dirs on disk (textures are in shared folder)
    // but still have numatb files and need SSBH canonical ordering.
    let has_numatb = files
        .iter()
        .any(|f| ext_of(&f.file_name().unwrap().to_string_lossy()) == ".numatb");
    let is_ssbh_folder = has_nusktb && (!tex_container_dirs.is_empty() || has_numatb);

    if is_ssbh_folder {
        // SSBH model folder — use canonical EXVS ordering
        build_exvs_model_folder(c, &files, &tex_container_dirs, &relevant_dirs, root, folder_name, depth, opts);
    } else {
        // Generic directory.
        // EXVS info/ has a special layout: sub-folders (fog, light) first,
        // then loose files (hkt, csv, spbin), then post_effect/ LAST.
        // The game runtime loads post_effect at the end and uses EndMark(2)
        // to close both post_effect/ and info/ simultaneously.
        let dir_name_lower = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        let is_info_dir = dir_name_lower == STAGE_INFO_NAME
            || INFO_SUBFOLDER_NAMES.contains(&dir_name_lower.as_str());

        // Separate post_effect from other subdirs (only matters for info/)
        let (normal_dirs, post_effect_dirs): (Vec<&PathBuf>, Vec<&PathBuf>) = relevant_dirs
            .iter()
            .partition(|d| {
                let n = d.file_name().unwrap().to_string_lossy().to_ascii_lowercase();
                !(is_info_dir && n == "post_effect")
            });

        // Emit normal sub-dirs first
        for d in &normal_dirs {
            if is_texture_container_dir(d) {
                build_exvs_texture_container(c, d, root, folder_name);
            } else {
                build_exvs_directory(c, d, root, folder_name, &[], depth + 1, opts);
            }
        }
        // Emit loose files.
        // EXVS info/ has a fixed file order: border_hit.hkt, placement.csv,
        // graphic_param.csv, plan_param.spbin (NOT alphabetical).
        let sorted_files: Vec<&PathBuf> = if is_info_dir {
            let mut f: Vec<&PathBuf> = files.iter().collect();
            f.sort_by_key(|p| info_file_order(&p.file_name().unwrap().to_string_lossy()));
            f
        } else {
            files.iter().collect()
        };
        for f in &sorted_files {
            push_exvs_file_item(c, f, root, folder_name);
        }
        // Emit post_effect/ LAST (EXVS info/ layout requirement)
        for d in &post_effect_dirs {
            build_exvs_directory(c, d, root, folder_name, &[], depth + 1, opts);
        }
    }

    if depth > 0 {
        c.push_end(1);
    }
}

/// Rebuild `_structure.json` from disk, producing correct SubFileStructure.
///
/// Strategy:
/// 1. If the original `_structure.json` exists AND all referenced files exist
///    on disk AND no extra packable files are present, **preserve the original**
///    structure verbatim (keeping fileIndex ordering, unk2 values, and tree
///    topology intact).
/// 2. Otherwise, fall back to a full rebuild from disk (alphabetical ordering).
///
/// This must be called AFTER `redistribute_stage_textures` so that textures
/// are in their per-model numbered subdirs (the format FHM2D expects).
pub fn rebuild_structure_json_for_stage(stage_root: &str) -> Result<String, String> {
    let root = Path::new(stage_root);
    let folder_name = root.file_name().and_then(|n| n.to_str()).unwrap_or("stage");

    let output_path = root
        .parent()
        .unwrap_or(root)
        .join(format!("{folder_name}_structure.json"));

    if let Some(original_path) = find_structure_json_path(root) {
        match try_preserve_original_structure(root, &original_path, &output_path) {
            Ok(result) => return Ok(result),
            Err(reason) => {
                eprintln!(
                    "[rebuild_structure] Cannot preserve original ({}). Falling back to full rebuild.",
                    reason
                );
            }
        }
    }

    rebuild_structure_from_scratch(root, folder_name, &output_path)
}

/// Like `rebuild_structure_json_for_stage` but always performs a full rebuild
/// from disk, never preserving the original structure JSON. Use this when the
/// structure must reflect the current canonical layout (base/info/models/sky
/// with per-model texture subdirs, no shared textures/ folder).
pub fn rebuild_structure_json_for_stage_forced(stage_root: &str) -> Result<String, String> {
    let root = Path::new(stage_root);
    let folder_name = root.file_name().and_then(|n| n.to_str()).unwrap_or("stage");

    let output_path = root
        .parent()
        .unwrap_or(root)
        .join(format!("{folder_name}_structure.json"));

    rebuild_structure_from_scratch(root, folder_name, &output_path)
}

fn rebuild_structure_from_scratch(
    root: &Path,
    folder_name: &str,
    output_path: &Path,
) -> Result<String, String> {
    let existing_magic = find_structure_json_path(root)
        .and_then(|p| fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("Magic").and_then(|m| m.as_i64()))
        .map(|m| m as i32)
        .unwrap_or(-843925575i32);

    let existing_unk_count = find_structure_json_path(root)
        .and_then(|p| fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("UnkCount").and_then(|m| m.as_u64()))
        .map(|u| u as u32)
        .unwrap_or(0);

    let mut collector = RebuildCollector::new();

    build_exvs_structure_tree(&mut collector, root, folder_name, &ExvsBuildOpts { include_shared_textures: false });

    let sub_file_data: Vec<RebuildSubFileData> = collector
        .files
        .iter()
        .enumerate()
        .map(|(i, (url, ext))| {
            let base = url
                .replace('\\', "/")
                .split('/')
                .last()
                .unwrap_or("")
                .to_string();
            RebuildSubFileData {
                index: i,
                file_type: file_type_for_ext(&ext),
                file_index: i as i32,
                file_url: url.clone(),
                file_base_name: basename_no_ext(&base),
            }
        })
        .collect();

    let dedup_count = collector.nutexb_dedup.len();
    let item_refs = collector
        .structure
        .iter()
        .filter(|e| matches!(e, SubFileStructureEntry::Item { .. }))
        .count();

    let output = RebuildStructureOutput {
        magic: existing_magic,
        fhm2d_total_count: sub_file_data.len(),
        unk_count: existing_unk_count,
        sub_file_data,
        sub_file_structure: collector.structure,
    };

    let json = serde_json::to_string_pretty(&output)
        .map_err(|e| format!("Failed to serialize rebuilt structure JSON: {e}"))?;
    fs::write(output_path, &json)
        .map_err(|e| format!("Failed to write rebuilt structure JSON: {e}"))?;

    eprintln!(
        "[rebuild_structure] Full rebuild: {} unique files ({} nutexb deduped), {} structure entries ({} item refs) -> {}",
        output.fhm2d_total_count,
        dedup_count,
        output.sub_file_structure.len(),
        item_refs,
        output_path.display()
    );

    Ok(output_path.to_string_lossy().to_string())
}

fn rebuild_structure_from_scratch_with_shared_textures(
    root: &Path,
    folder_name: &str,
    output_path: &Path,
) -> Result<String, String> {
    let existing_magic = find_structure_json_path(root)
        .and_then(|p| fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("Magic").and_then(|m| m.as_i64()))
        .map(|m| m as i32)
        .unwrap_or(-843925575i32);

    let existing_unk_count = find_structure_json_path(root)
        .and_then(|p| fs::read_to_string(&p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("UnkCount").and_then(|m| m.as_u64()))
        .map(|u| u as u32)
        .unwrap_or(0);

    let mut collector = RebuildCollector::new();

    build_exvs_structure_tree(&mut collector, root, folder_name, &ExvsBuildOpts { include_shared_textures: true });

    let sub_file_data: Vec<RebuildSubFileData> = collector
        .files
        .iter()
        .enumerate()
        .map(|(i, (url, ext))| {
            let base = url
                .replace('\\', "/")
                .split('/')
                .last()
                .unwrap_or("")
                .to_string();
            RebuildSubFileData {
                index: i,
                file_type: file_type_for_ext(&ext),
                file_index: i as i32,
                file_url: url.clone(),
                file_base_name: basename_no_ext(&base),
            }
        })
        .collect();

    let dedup_count = collector.nutexb_dedup.len();
    let item_refs = collector
        .structure
        .iter()
        .filter(|e| matches!(e, SubFileStructureEntry::Item { .. }))
        .count();

    let output = RebuildStructureOutput {
        magic: existing_magic,
        fhm2d_total_count: sub_file_data.len(),
        unk_count: existing_unk_count,
        sub_file_data,
        sub_file_structure: collector.structure,
    };

    let json = serde_json::to_string_pretty(&output)
        .map_err(|e| format!("Failed to serialize rebuilt structure JSON: {e}"))?;
    fs::write(output_path, &json)
        .map_err(|e| format!("Failed to write rebuilt structure JSON: {e}"))?;

    eprintln!(
        "[rebuild_structure_shared] Full rebuild with textures/: {} unique files ({} nutexb deduped), {} structure entries ({} item refs) -> {}",
        output.fhm2d_total_count,
        dedup_count,
        output.sub_file_structure.len(),
        item_refs,
        output_path.display()
    );

    Ok(output_path.to_string_lossy().to_string())
}

fn patch_nutexb_urls_in_structure(
    structure_path: &Path,
    texture_url_map: &HashMap<String, String>,
) -> Result<(), String> {
    let content = fs::read_to_string(structure_path)
        .map_err(|e| format!("Failed to read structure for URL patching: {e}"))?;
    let mut doc: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse structure JSON for URL patching: {e}"))?;

    let mut patched = 0usize;
    if let Some(arr) = doc.get_mut("SubFileData").and_then(|v| v.as_array_mut()) {
        for entry in arr.iter_mut() {
            let is_nutexb = entry
                .get("fileType")
                .and_then(|v| v.as_str())
                .map(|s| s.eq_ignore_ascii_case(".nutexb"))
                .unwrap_or(false);
            if !is_nutexb {
                continue;
            }
            let current_url = entry
                .get("fileUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let filename_lower = current_url
                .replace('\\', "/")
                .split('/')
                .last()
                .unwrap_or("")
                .to_ascii_lowercase();
            if let Some(new_url) = texture_url_map.get(&filename_lower) {
                entry["fileUrl"] = serde_json::Value::String(new_url.clone());
                patched += 1;
            }
        }
    }

    if patched > 0 {
        let json = serde_json::to_string_pretty(&doc)
            .map_err(|e| format!("Failed to serialize patched structure: {e}"))?;
        fs::write(structure_path, &json)
            .map_err(|e| format!("Failed to write patched structure: {e}"))?;
        eprintln!(
            "[patch_nutexb_urls] Patched {} nutexb URL(s) to textures/ paths in {}",
            patched,
            structure_path.display()
        );
    }

    Ok(())
}

/// Rebuild `_structure.json` while keeping nutexb files in the shared `textures/` folder.
///
/// Unlike `rebuild_structure_json_for_stage` (which requires textures to be in per-model
/// numbered subdirs), this variant includes the `textures/` folder in the structure tree
/// (marked with `unk3=64`) and rewrites `.nutexb` `fileUrl` entries to point there.
///
/// Workflow: extract → restore_shared_textures → **this function** → repack
/// No redistribute/restore cycle needed.
pub fn rebuild_structure_json_for_stage_with_shared_textures(
    stage_root: &str,
) -> Result<String, String> {
    let root = Path::new(stage_root);
    let content_root = resolve_content_root(root);
    let textures_dir = content_root.join(STAGE_TEXTURES_NAME);
    let folder_name = root.file_name().and_then(|n| n.to_str()).unwrap_or("stage");

    if !textures_dir.is_dir() {
        return rebuild_structure_json_for_stage(stage_root);
    }

    let textures_rel = if content_root != *root {
        format!("0\\0\\{}", STAGE_TEXTURES_NAME)
    } else {
        STAGE_TEXTURES_NAME.to_string()
    };
    let mut texture_url_map: HashMap<String, String> = HashMap::new();
    if let Ok(entries) = fs::read_dir(&textures_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let fname = entry.file_name().to_string_lossy().to_string();
            if fname.to_ascii_lowercase().ends_with(".nutexb")
                && !entry.file_type().map(|t| t.is_dir()).unwrap_or(true)
            {
                let url = format!(".\\{}\\{}\\{}", folder_name, textures_rel, fname);
                texture_url_map.insert(fname.to_ascii_lowercase(), url);
            }
        }
    }

    if texture_url_map.is_empty() {
        return rebuild_structure_json_for_stage(stage_root);
    }

    let output_path = root
        .parent()
        .unwrap_or(root)
        .join(format!("{folder_name}_structure.json"));

    // Try to preserve the original structure first.
    if let Some(original_path) = find_structure_json_path(root) {
        match try_preserve_original_structure(root, &original_path, &output_path) {
            Ok(result) => {
                patch_nutexb_urls_in_structure(&output_path, &texture_url_map)?;
                return Ok(result);
            }
            Err(reason) => {
                eprintln!(
                    "[rebuild_structure_shared] Cannot preserve original ({}). Falling back to rebuild with shared textures.",
                    reason
                );
            }
        }
    }

    // Rebuild from scratch, but INCLUDE the textures/ folder (unk3=64).
    let structure_path =
        rebuild_structure_from_scratch_with_shared_textures(root, folder_name, &output_path)?;

    patch_nutexb_urls_in_structure(Path::new(&structure_path), &texture_url_map)?;

    eprintln!(
        "[rebuild_structure_shared] Rebuilt with shared textures/ -> {}",
        structure_path
    );

    Ok(structure_path)
}

/// Redistribute nutexb files from a shared `textures/` folder back into
/// per-numatb numbered subdirectories under each model's SSBH folder.
/// Then, cross-populate: for any model whose numatb references a texture
/// that is missing from its 0/ or 1/ subdir, copy it from other model folders.
pub fn redistribute_stage_textures(stage_root: &str) -> Result<RedistributeResult, String> {
    let root = Path::new(stage_root);
    let content_root = resolve_content_root(root);
    let textures_dir = content_root.join(STAGE_TEXTURES_NAME);

    let mut warnings = Vec::new();
    let mut models_processed = 0usize;
    let mut textures_copied = 0usize;
    let mut textures_folder_removed = false;
    let mut url_remap: HashMap<String, String> = HashMap::new();

    let folder_name = root.file_name().and_then(|n| n.to_str()).unwrap_or("stage");
    let ssbh_folders = find_ssbh_folders(&content_root, &mut warnings)?;

    // Phase 1: Shared textures/ folder redistribution (original behavior)
    if textures_dir.is_dir() {
        let available_textures = index_nutexb_folder(&textures_dir)?;
        if !available_textures.is_empty() {
            for ssbh_folder in &ssbh_folders {
                let numatb_refs = parse_numatb_texture_refs_by_role(ssbh_folder, &mut warnings);
                if numatb_refs.is_empty() {
                    continue;
                }
                models_processed += 1;

                for (subdir_index, refs) in numatb_refs.iter().enumerate() {
                    let subdir = ssbh_folder.join(subdir_index.to_string());
                    fs::create_dir_all(&subdir).map_err(|e| {
                        format!("Failed to create texture subdir {}: {e}", subdir.display())
                    })?;

                    for ref_name in refs {
                        let ref_lower = ref_name.to_ascii_lowercase();
                        if let Some(src_path) = available_textures.get(&ref_lower) {
                            let fname = src_path.file_name().unwrap();
                            let dest_path = subdir.join(fname);
                            if !dest_path.exists() {
                                fs::copy(src_path, &dest_path).map_err(|e| {
                                    format!(
                                        "Failed to copy {} → {}: {e}",
                                        src_path.display(),
                                        dest_path.display()
                                    )
                                })?;
                                textures_copied += 1;
                            }
                            if let (Ok(old_rel), Ok(new_rel)) =
                                (src_path.strip_prefix(root), dest_path.strip_prefix(root))
                            {
                                let old_url = format!(
                                    ".\\{}\\{}",
                                    folder_name,
                                    old_rel.to_string_lossy().replace('/', "\\")
                                );
                                let new_url = format!(
                                    ".\\{}\\{}",
                                    folder_name,
                                    new_rel.to_string_lossy().replace('/', "\\")
                                );
                                url_remap.insert(old_url, new_url);
                            }
                        }
                    }
                }
            }

            if textures_copied > 0 {
                fs::remove_dir_all(&textures_dir)
                    .map_err(|e| format!("Failed to remove textures/ after redistribution: {e}"))?;
                textures_folder_removed = true;
            }
        }
    }

    // Phase 2: Cross-populate — build global nutexb index from all model subdirs,
    // then fill any missing textures referenced by numatb.
    let global_nutexb = index_all_nutexb_in_model_folders(&ssbh_folders);

    for ssbh_folder in &ssbh_folders {
        let numatb_refs = parse_numatb_texture_refs_by_role(ssbh_folder, &mut warnings);
        if numatb_refs.is_empty() {
            continue;
        }

        let mut model_had_copy = false;

        for (subdir_index, refs) in numatb_refs.iter().enumerate() {
            let subdir = ssbh_folder.join(subdir_index.to_string());
            fs::create_dir_all(&subdir).map_err(|e| {
                format!("Failed to create texture subdir {}: {e}", subdir.display())
            })?;

            for ref_name in refs {
                let ref_lower = ref_name.to_ascii_lowercase();
                let dest_path = subdir.join(ref_name);
                let dest_lower = subdir.join(&ref_lower);
                // Skip if already present (case-insensitive check)
                if dest_path.exists() || dest_lower.exists() {
                    continue;
                }
                // Also check with original casing from disk
                let already_has = fs::read_dir(&subdir)
                    .into_iter()
                    .flatten()
                    .filter_map(|e| e.ok())
                    .any(|e| e.file_name().to_string_lossy().to_ascii_lowercase() == ref_lower);
                if already_has {
                    continue;
                }

                if let Some(src_path) = global_nutexb.get(&ref_lower) {
                    // Don't copy from self
                    if src_path.parent() == Some(&subdir) {
                        continue;
                    }
                    let fname = src_path.file_name().unwrap();
                    let final_dest = subdir.join(fname);
                    if !final_dest.exists() {
                        fs::copy(src_path, &final_dest).map_err(|e| {
                            format!(
                                "Failed to copy {} → {}: {e}",
                                src_path.display(),
                                final_dest.display()
                            )
                        })?;
                        textures_copied += 1;
                        model_had_copy = true;
                    }
                } else {
                    warnings.push(format!(
                        "Texture '{}' referenced by numatb in {} not found anywhere in stage",
                        ref_name,
                        ssbh_folder.display()
                    ));
                }
            }
        }

        if model_had_copy {
            models_processed += 1;
        }
    }

    if !url_remap.is_empty() {
        if let Some(sj_path) = find_structure_json_path(root) {
            if let Err(e) = patch_structure_json_urls(&sj_path, &url_remap) {
                warnings.push(format!(
                    "Failed to patch structure JSON after redistribution: {e}"
                ));
            }
        }
    }

    Ok(RedistributeResult {
        models_processed,
        textures_copied,
        textures_folder_removed,
        warnings,
    })
}

/// Build a global index of all .nutexb files found in numbered subdirs (0/, 1/, etc.)
/// of all SSBH model folders. Returns lowercase filename → path.
fn index_all_nutexb_in_model_folders(ssbh_folders: &[PathBuf]) -> BTreeMap<String, PathBuf> {
    let mut map = BTreeMap::new();
    for folder in ssbh_folders {
        let entries = match fs::read_dir(folder) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.filter_map(|e| e.ok()) {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            let subdir = entry.path();
            if let Ok(sub_entries) = fs::read_dir(&subdir) {
                for sub_entry in sub_entries.filter_map(|e| e.ok()) {
                    let fname = sub_entry.file_name().to_string_lossy().to_string();
                    if fname.to_ascii_lowercase().ends_with(".nutexb")
                        && !sub_entry.file_type().map(|t| t.is_dir()).unwrap_or(true)
                    {
                        map.entry(fname.to_ascii_lowercase())
                            .or_insert_with(|| sub_entry.path());
                    }
                }
            }
        }
    }
    map
}

/// Resolve the content root from a stage root.
/// If `stage_root/0/0/` exists (pack root layout), returns `stage_root/0/0/`.
/// Otherwise returns `stage_root` itself (already at content root).
pub(crate) fn resolve_content_root(stage_root: &Path) -> PathBuf {
    let candidate = stage_root.join("0").join("0");
    if candidate.is_dir() {
        candidate
    } else {
        stage_root.to_path_buf()
    }
}

fn is_zero_zero_content_root(path: &Path) -> bool {
    path.file_name().map(|n| n == "0").unwrap_or(false)
        && path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n == "0")
            .unwrap_or(false)
}

/// Pack root is the hash-named folder that owns `0/0/` content and `textures/`.
fn resolve_pack_root(stage_root: &Path) -> PathBuf {
    if is_zero_zero_content_root(stage_root) {
        return stage_root
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| stage_root.to_path_buf());
    }
    if stage_root.join("0").join("0").is_dir() {
        return stage_root.to_path_buf();
    }
    stage_root.to_path_buf()
}

fn resolve_stage_roots(stage_root: &Path) -> (PathBuf, PathBuf) {
    let pack_root = resolve_pack_root(stage_root);
    let content_root = resolve_content_root(&pack_root);
    (pack_root, content_root)
}

fn remove_empty_dir_if_exists(path: &Path) {
    if !path.is_dir() {
        return;
    }
    let is_empty = fs::read_dir(path)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(false);
    if is_empty {
        let _ = fs::remove_dir(path);
    }
}

/// Reverse operation: collect nutexb files from per-model numbered subdirs
/// back into a shared `textures/` folder, deduplicating by filename.
pub fn restore_shared_textures(stage_root: &str) -> Result<RestoreSharedResult, String> {
    let stage_root_path = Path::new(stage_root);
    let (pack_root, content_root) = resolve_stage_roots(stage_root_path);
    let textures_dir = pack_root.join(STAGE_TEXTURES_NAME);

    remove_empty_dir_if_exists(&content_root.join(STAGE_TEXTURES_NAME));

    let folder_name = pack_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("stage");

    let mut warnings = Vec::new();
    let mut collected = 0usize;
    let mut subdirs_removed = 0usize;
    let mut seen_names: HashSet<String> = HashSet::new();
    let mut url_remap: HashMap<String, String> = HashMap::new();

    let ssbh_folders = find_ssbh_folders(&content_root, &mut warnings)?;

    let mut all_texture_subdirs: Vec<PathBuf> = Vec::new();

    for ssbh_folder in &ssbh_folders {
        let entries = fs::read_dir(ssbh_folder)
            .map_err(|e| format!("Failed to read {}: {e}", ssbh_folder.display()))?;
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            if !name.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }

            let subdir_path = entry.path();
            let has_only_nutexb = dir_contains_only_nutexb(&subdir_path);
            if !has_only_nutexb {
                continue;
            }

            for nutexb_entry in fs::read_dir(&subdir_path)
                .into_iter()
                .flatten()
                .filter_map(|e| e.ok())
            {
                let fname = nutexb_entry.file_name().to_string_lossy().to_string();
                if fname.to_ascii_lowercase().ends_with(".nutexb")
                    && !nutexb_entry.file_type().map(|t| t.is_dir()).unwrap_or(true)
                {
                    let lower = fname.to_ascii_lowercase();
                    let src = nutexb_entry.path();
                    let dest = textures_dir.join(&fname);
                    if seen_names.insert(lower) {
                        if !textures_dir.is_dir() {
                            fs::create_dir_all(&textures_dir).map_err(|e| {
                                format!("Failed to create textures/ folder: {e}")
                            })?;
                        }
                        fs::copy(&src, &dest).map_err(|e| {
                            format!("Failed to copy {} → {}: {e}", src.display(), dest.display())
                        })?;
                        collected += 1;
                    }
                    if let (Ok(old_rel), Ok(new_rel)) =
                        (src.strip_prefix(&pack_root), dest.strip_prefix(&pack_root))
                    {
                        let old_url = format!(
                            ".\\{}\\{}",
                            folder_name,
                            old_rel.to_string_lossy().replace('/', "\\")
                        );
                        let new_url = format!(
                            ".\\{}\\{}",
                            folder_name,
                            new_rel.to_string_lossy().replace('/', "\\")
                        );
                        url_remap.insert(old_url, new_url);
                    }
                }
            }
            all_texture_subdirs.push(subdir_path);
        }
    }

    for subdir in &all_texture_subdirs {
        if subdir.is_dir() {
            fs::remove_dir_all(subdir).map_err(|e| {
                format!("Failed to remove texture subdir {}: {e}", subdir.display())
            })?;
            subdirs_removed += 1;
        }
    }

    if !url_remap.is_empty() {
        if let Some(sj_path) = find_structure_json_path(&pack_root) {
            if let Err(e) = patch_structure_json_urls(&sj_path, &url_remap) {
                warnings.push(format!("Failed to patch structure JSON after restore: {e}"));
            }
        }
    }

    Ok(RestoreSharedResult {
        textures_collected: collected,
        subdirs_removed,
        warnings,
    })
}

fn index_nutexb_folder(textures_dir: &Path) -> Result<BTreeMap<String, PathBuf>, String> {
    let mut map = BTreeMap::new();
    let entries =
        fs::read_dir(textures_dir).map_err(|e| format!("Failed to read textures dir: {e}"))?;
    for entry in entries.filter_map(|e| e.ok()) {
        let fname = entry.file_name().to_string_lossy().to_string();
        if fname.to_ascii_lowercase().ends_with(".nutexb")
            && !entry.file_type().map(|t| t.is_dir()).unwrap_or(true)
        {
            map.insert(fname.to_ascii_lowercase(), entry.path());
        }
    }
    Ok(map)
}

/// Find all directories that contain `.numatb` files — these are SSBH folders.
/// Skips `info/`, `textures/`, and hidden directories.
pub(crate) fn find_ssbh_folders(root: &Path, warnings: &mut Vec<String>) -> Result<Vec<PathBuf>, String> {
    let skip_names: HashSet<&str> = [STAGE_INFO_NAME, STAGE_TEXTURES_NAME].into_iter().collect();
    let mut result = Vec::new();
    find_ssbh_folders_recurse(root, root, &skip_names, &mut result, warnings, 0)?;
    Ok(result)
}

fn find_ssbh_folders_recurse(
    dir: &Path,
    root: &Path,
    skip_names: &HashSet<&str>,
    result: &mut Vec<PathBuf>,
    warnings: &mut Vec<String>,
    depth: usize,
) -> Result<(), String> {
    if depth > 8 {
        return Ok(());
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => {
            warnings.push(format!("Cannot read {}: {e}", dir.display()));
            return Ok(());
        }
    };

    let mut has_numatb = false;
    let mut subdirs = Vec::new();

    for entry in entries.filter_map(|e| e.ok()) {
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let name = entry.file_name().to_string_lossy().to_string();

        if is_dir {
            if dir == root && skip_names.contains(name.as_str()) {
                continue;
            }
            if name.starts_with('.') || name.starts_with('_') {
                continue;
            }
            subdirs.push(entry.path());
        } else if name.to_ascii_lowercase().ends_with(".numatb") {
            has_numatb = true;
        }
    }

    if has_numatb {
        result.push(dir.to_path_buf());
    }

    for subdir in subdirs {
        find_ssbh_folders_recurse(&subdir, root, skip_names, result, warnings, depth + 1)?;
    }

    Ok(())
}

/// Parse all `.numatb` files in a directory, sorted by filename.
/// Returns a Vec of texture reference lists, one per numatb file.
fn parse_numatb_texture_refs(ssbh_folder: &Path, warnings: &mut Vec<String>) -> Vec<Vec<String>> {
    let mut numatb_files: Vec<(String, PathBuf)> = Vec::new();

    if let Ok(entries) = fs::read_dir(ssbh_folder) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.to_ascii_lowercase().ends_with(".numatb")
                && !entry.file_type().map(|t| t.is_dir()).unwrap_or(true)
            {
                numatb_files.push((name.clone(), entry.path()));
            }
        }
    }

    numatb_files.sort_by(|a, b| a.0.cmp(&b.0));

    let mut all_refs = Vec::new();
    for (name, path) in &numatb_files {
        match fs::read(path) {
            Ok(data) => {
                let mut cursor = Cursor::new(&data);
                match ssbh_data::prelude::MatlData::read(&mut cursor) {
                    Ok(matl) => {
                        let refs = extract_nutexb_names_from_matl(&matl);
                        all_refs.push(refs);
                    }
                    Err(e) => {
                        warnings.push(format!("Failed to parse numatb '{}': {e}", name));
                        all_refs.push(Vec::new());
                    }
                }
            }
            Err(e) => {
                warnings.push(format!("Failed to read numatb '{}': {e}", name));
                all_refs.push(Vec::new());
            }
        }
    }
    all_refs
}

/// Extract deduplicated texture filenames (with .nutexb extension) from a MatlData.
fn extract_nutexb_names_from_matl(matl: &ssbh_data::prelude::MatlData) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for entry in &matl.entries {
        for tex in &entry.textures {
            let raw = tex.data.trim();
            if raw.is_empty() {
                continue;
            }
            let base = raw
                .replace('\\', "/")
                .split('/')
                .last()
                .unwrap_or(raw)
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
        for tex in &entry.textures2 {
            let raw = tex.data.trim();
            if raw.is_empty() {
                continue;
            }
            let base = raw
                .replace('\\', "/")
                .split('/')
                .last()
                .unwrap_or(raw)
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
    }
    out
}

/// Parse numatb texture refs ordered by role: [0] = maya refs, [1] = nust refs.
///
/// Identifies maya/nust by `__maya__` / `__nust__` filename suffix.
/// Returns exactly 2 entries (maya first, nust second) matching EXVS2 game
/// folder structure: subdir 0/ = maya textures, subdir 1/ = nust textures.
pub(crate) fn parse_numatb_texture_refs_by_role(
    ssbh_folder: &Path,
    warnings: &mut Vec<String>,
) -> Vec<Vec<String>> {
    let mut maya_path: Option<PathBuf> = None;
    let mut nust_path: Option<PathBuf> = None;

    if let Ok(entries) = fs::read_dir(ssbh_folder) {
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(true) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let lower = name.to_ascii_lowercase();
            if !lower.ends_with(".numatb") {
                continue;
            }
            if lower.contains("__nust__") {
                nust_path = Some(entry.path());
            } else if lower.contains("__maya__") {
                maya_path = Some(entry.path());
            }
        }
    }

    if maya_path.is_none() && nust_path.is_none() {
        return Vec::new();
    }

    let mut maya_refs = Vec::new();
    let mut nust_refs = Vec::new();

    for (path, refs) in [(&maya_path, &mut maya_refs), (&nust_path, &mut nust_refs)] {
        if let Some(p) = path {
            match fs::read(p) {
                Ok(data) => {
                    let mut cursor = Cursor::new(&data);
                    match ssbh_data::prelude::MatlData::read(&mut cursor) {
                        Ok(matl) => *refs = extract_nutexb_names_from_matl(&matl),
                        Err(e) => warnings.push(format!(
                            "Failed to parse numatb '{}': {e}", p.display()
                        )),
                    }
                }
                Err(e) => warnings.push(format!("Failed to read numatb '{}': {e}", p.display())),
            }
        }
    }

    vec![maya_refs, nust_refs]
}

fn dir_contains_only_nutexb(dir: &Path) -> bool {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return false,
    };
    let mut has_any = false;
    for entry in entries.filter_map(|e| e.ok()) {
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            return false;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_ascii_lowercase().ends_with(".nutexb") {
            return false;
        }
        has_any = true;
    }
    has_any
}

#[cfg(test)]
#[path = "fhm2d_stage_test.rs"]
mod tests;
