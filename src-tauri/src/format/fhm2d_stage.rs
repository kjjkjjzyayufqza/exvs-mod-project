//! Stage-specific FHM2D apply-rename and bundle loading.
//!
//! After standard fhm2d extraction produces numbered folders (0/, 1/, 2/, ...),
//! this module reads the `_structure.json` and renames them into a human-readable
//! stage directory:  base/ , info/ , <numdlb-inferred-name>/ , ... , textures/ (skipped).
//!
//! Info folder internals: sub-folders 0,1,2 → fog/ , light/ , post_effect/ ;
//! remaining files are renamed to fixed names by JSON array order.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::fhm2d_memory_preview;
use crate::format::fhm2d::{InMemoryFhm2dFile, SubFileStructureEntry};
use crate::ssbh_preview::{self, SsbhModelPreviewBundle, TextureRefResolve};

const NUMDLB_MAGIC: &[u8; 4] = b"HBSS";
const NUMDLB_MODL_TAG: &[u8; 4] = b"LDOM";

// ── Stage directory role constants ──────────────────────────────────────────

const STAGE_BASE_NAME: &str = "base";
const STAGE_INFO_NAME: &str = "info";
const STAGE_TEXTURES_NAME: &str = "textures";

const INFO_SUBFOLDER_NAMES: &[&str] = &["fog", "light", "post_effect"];

const INFO_FILE_NAMES: &[&str] = &[
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
            SubFileStructureEntry::Folder { .. } => {
                let idx = folder_counter.len() - 1;
                let name = folder_counter[idx].to_string();
                folder_counter[idx] += 1;
                folder_counter.push(0);
                tokens.push(StageToken::FolderOpen { name });
            }
            SubFileStructureEntry::Item { file_index, .. } => {
                tokens.push(StageToken::Leaf { file_index: *file_index });
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
            children.push(convert_to_virtual_tree(child, file_index_map, nutexb_name_map));
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
const STAGE_SKY_NAME: &str = "sky";
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
    matches!(
        cat.as_str(),
        "OBJECT" | "EFFECT" | "SKY" | "PROP"
    )
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

fn parse_placement_table(content: &str, warnings: &mut Vec<String>) -> (Vec<String>, Vec<PlacementEntry>) {
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
            if let Some(i) = header_strings.iter().position(|h| h.eq_ignore_ascii_case(n)) {
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
        if let Some(hit) =
            collect_placement_csv_from_virtual_tree(child, file_index_map, warnings)
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
        .map(|ch| if ch.is_control() || "<>:\"|?*".contains(ch) { '_' } else { ch })
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

fn rename_folder_level_bins(
    folder: &mut StageVirtualTreeFolder,
    warnings: &mut Vec<String>,
) {
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
        let jnttbl_name = model_name
            .as_deref()
            .unwrap_or("unknown")
            .to_string();
        subfolder.files[bin_indices[0]].file_name = format!("{jnttbl_name}.jnttbl");
    }
}

/// Rename numatb files using numdlb material_file_names (maya/nust pattern).
///
/// Sorted by file_index: first N match material_file_names[0..N] (maya first,
/// nust template second). Extra numatb beyond declared count get variant names
/// derived from the __nust__ template (material_file_names[1]).
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
        warnings.push(format!(
            "Model '{}': {} extra numatb file(s) but only {} material path(s) in numdlb, \
             cannot derive nust variant names",
            modl.model_name, extra_count, declared_count
        ));
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

    let prefix =
        &nust_template_stripped[..nust_template_stripped.len() - NUST_NUMATB_SUFFIX.len()];
    for e in 0..extra_count {
        let target = numatb_indices[declared_count + e];
        let m_part = format!("_m{:03}", e + 1);
        subfolder.files[target].file_name =
            format!("{prefix}{m_part}{NUST_NUMATB_SUFFIX}.numatb");
    }
}


// ── Main rename dispatcher ──────────────────────────────────────────────────

fn rename_stage_content_folder(
    folder: &mut StageVirtualTreeFolder,
    position: usize,
    total_children: usize,
    node: &InternalTreeNode,
    file_index_map: &HashMap<i32, &InMemoryFhm2dFile>,
    warnings: &mut Vec<String>,
) {
    let is_last = position == total_children - 1;

    match position {
        0 => {
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
        1 => {
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
        _ if is_last => {
            folder.name = STAGE_SKY_NAME.to_string();
            rename_folder_level_bins(folder, warnings);
            for sub in &mut folder.children {
                if let Some(child_node) = find_child_node_by_name(node, &sub.name) {
                    rename_model_subfolder_files(sub, child_node, file_index_map, warnings);
                }
            }
        }
        _ => {
            if let Some(model_name) = infer_numdlb_name_from_tree(node, file_index_map) {
                folder.name = model_name;
            } else {
                let fallback = format!("sub_{position}");
                warnings.push(format!(
                    "Could not infer name for folder at position {position}, using '{fallback}'"
                ));
                folder.name = fallback;
            }
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

    for i in 0..child_count {
        let node_ref = if i < node_children.len() {
            node_children[i]
        } else {
            continue;
        };

        rename_stage_content_folder(
            &mut content_folder.children[i],
            i,
            child_count,
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

pub fn stage_rename_in_memory(
    files: &[InMemoryFhm2dFile],
    sub_file_structure: &[SubFileStructureEntry],
) -> Result<(StageVirtualTreeFolder, Vec<String>), String> {
    let file_index_map: HashMap<i32, &InMemoryFhm2dFile> = files
        .iter()
        .map(|f| (f.file_index, f))
        .collect();

    let tree = build_stage_tree(sub_file_structure);
    let mut warnings = Vec::new();

    let (nutexb_name_map, nutexb_warnings) = precompute_nutexb_names(&file_index_map);
    warnings.extend(nutexb_warnings);

    let mut virtual_tree = convert_to_virtual_tree(&tree, &file_index_map, &nutexb_name_map);

    apply_semantic_rename(&mut virtual_tree, &tree, &file_index_map, &mut warnings);

    Ok((virtual_tree, warnings))
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
    let file_map: HashMap<i32, &InMemoryFhm2dFile> = files
        .iter()
        .map(|f| (f.file_index, f))
        .collect();

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
    let bytes = fs::read(source_path)
        .map_err(|e| format!("Failed to read FHM2D file: {e}"))?;

    let source_name = Path::new(source_path)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("stage")
        .to_string();

    let extraction = crate::format::fhm2d::extract_fhm2d_to_memory_impl(&bytes, &source_name, None)?;

    let (tree, warnings) = stage_rename_in_memory(
        &extraction.files,
        &extraction.sub_file_structure,
    )?;

    let dest = Path::new(output_dir).join(&source_name);
    if dest.exists() {
        fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to clean existing output dir: {e}"))?;
    }
    fs::create_dir_all(&dest)
        .map_err(|e| format!("Failed to create output dir: {e}"))?;

    let (total_files, total_bytes) = write_virtual_tree_to_disk(&tree, &extraction.files, &dest)?;

    write_stage_structure_json(&dest, &extraction)?;

    Ok(StageExtractResult {
        output_dir: dest.to_string_lossy().replace('\\', "/"),
        total_files,
        total_bytes,
        warnings,
    })
}

fn write_stage_structure_json(
    dest: &Path,
    extraction: &crate::format::fhm2d::InMemoryFhm2dExtraction,
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

    let dest_name = dest
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("stage");

    let sub_file_data: Vec<StageSubFileDataOutput> = extraction
        .files
        .iter()
        .enumerate()
        .map(|(i, f)| {
            let base_name = f
                .file_url
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
                file_url: f.file_url.clone(),
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
    fs::write(&structure_path, json)
        .map_err(|e| format!("Failed to write structure JSON at {}: {e}", structure_path.display()))?;

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

pub fn stage_apply_rename_impl(
    extracted_dir: &str,
) -> Result<StageApplyRenameResult, String> {
    let base_dir = Path::new(extracted_dir);
    if !base_dir.is_dir() {
        return Err(format!("Extracted directory not found: {extracted_dir}"));
    }

    let structure_path = format!("{}_structure.json", extracted_dir.trim_end_matches(['/', '\\']));
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

    let renamed_root = base_dir
        .parent()
        .unwrap_or(base_dir)
        .join(format!(
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
    fs::create_dir_all(&renamed_root)
        .map_err(|e| format!("Failed to create renamed root: {e}"))?;

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
                            numdlb_path_out =
                                Some(dest_file.to_string_lossy().replace('\\', "/"));
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
    if position == 0 {
        return (STAGE_BASE_NAME.to_string(), "base");
    }
    if position == 1 {
        return (STAGE_INFO_NAME.to_string(), "info");
    }
    if position == total - 1 {
        return (STAGE_TEXTURES_NAME.to_string(), "textures");
    }

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

    let mut sub_models = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(root)
        .map_err(|e| format!("Failed to read stage root: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .collect();
    entries.sort_by_key(|e| e.file_name());

    let mut object_index = 0usize;
    for entry in &entries {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == STAGE_BASE_NAME
            || name == STAGE_INFO_NAME
            || name == STAGE_TEXTURES_NAME
        {
            continue;
        }
        if let Some(bundle) = load_model_in_subfolder(root, &name, &mut warnings) {
            sub_models.push(StageSubModelEntry {
                folder_name: name,
                object_index,
                bundle,
            });
        }
        object_index += 1;
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

fn parse_graphic_param_csv(root: &Path, warnings: &mut Vec<String>) -> Vec<GraphicParamEntry> {
    let info_dir = root.join(STAGE_INFO_NAME);
    if !info_dir.is_dir() {
        return Vec::new();
    }
    let csv_path = info_dir.join("graphic_param.csv");
    if !csv_path.exists() {
        warnings.push("graphic_param.csv not found".to_string());
        return Vec::new();
    }
    match fs::read_to_string(&csv_path) {
        Ok(content) => content
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
    let info_dir = root.join(STAGE_INFO_NAME);
    if !info_dir.is_dir() {
        return (Vec::new(), Vec::new());
    }
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
            "placement.csv contains invalid UTF-8; decoding with replacement characters".to_string(),
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
    let file_index_map: HashMap<i32, &InMemoryFhm2dFile> = files
        .iter()
        .map(|f| (f.file_index, f))
        .collect();

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
                        let (h, e) =
                            parse_placement_csv_from_bytes(&f.data, &mut bundle_warnings);
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
                    "placement.csv loaded via tree scan (info slot did not attach rows)".to_string(),
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
        out.extend(collect_nutexb_entries_with_virtual_paths(child, file_index_map));
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
            warnings.push(format!("No valid numshb in '{}', skipping model", folder.name));
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
    let skel_json = skel
        .as_ref()
        .and_then(|s| serde_json::to_value(s).ok());
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

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    const TEST_DATA_ROOT: &str = r"E:\XB\解包\com\test";

    fn test_stage_root(stage_name: &str) -> PathBuf {
        Path::new(TEST_DATA_ROOT).join(stage_name).join("0").join("0")
    }

    fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let ft = entry.file_type()?;
            let dest_path = dst.join(entry.file_name());
            if ft.is_dir() {
                copy_dir_recursive(&entry.path(), &dest_path)?;
            } else {
                fs::copy(entry.path(), &dest_path)?;
            }
        }
        Ok(())
    }

    fn copy_stage_to_temp(stage_name: &str) -> (tempfile::TempDir, PathBuf) {
        let src = test_stage_root(stage_name);
        assert!(src.is_dir(), "Test data not found at {}", src.display());
        let tmp = tempfile::tempdir().expect("create temp dir");
        let dst = tmp.path().join("0").join("0");
        copy_dir_recursive(&src, &dst).expect("copy stage data");
        (tmp, dst)
    }

    fn skip_if_test_data_missing() -> bool {
        !Path::new(TEST_DATA_ROOT).is_dir()
    }

    // ── load_stage_bundle_impl ──────────────────────────────────────────

    #[test]
    fn test_load_stage_84f085e5_basic_structure() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let root = test_stage_root("84F085E5");
        let bundle = load_stage_bundle_impl(&root.to_string_lossy()).unwrap();

        assert!(bundle.base_model.is_some(), "should have base model");
        assert!(!bundle.sub_models.is_empty(), "should have sub models");
        assert!(!bundle.graphic_params.is_empty(), "should have graphic params");
        assert!(!bundle.placement_entries.is_empty(), "should have placement entries");

        let sky_entry = bundle.placement_entries.iter().find(|e| e.vdk_type == "SKY");
        assert!(sky_entry.is_some(), "should have a SKY placement entry");

        // Stage 84F085E5 is a menu stage — it has only SKY in placement, no OBJECT rows
        assert_eq!(bundle.placement_entries.len(), 1,
            "menu stage should have exactly 1 placement entry (SKY only)");
    }

    #[test]
    fn test_load_stage_16f73c97_object_box01() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let root = test_stage_root("16F73C97");
        let bundle = load_stage_bundle_impl(&root.to_string_lossy()).unwrap();

        assert!(bundle.base_model.is_some(), "should have base model");

        let box_model = bundle.sub_models.iter()
            .find(|m| m.folder_name.contains("object_box01"));
        assert!(box_model.is_some(), "should find 001stage001_object_box01 sub model");

        let sky_model = bundle.sub_models.iter()
            .find(|m| m.folder_name == "sky");
        assert!(sky_model.is_some(), "should find sky sub model");

        let sky_placement = bundle.placement_entries.iter()
            .find(|e| e.vdk_type == "SKY");
        assert!(sky_placement.is_some(), "should have SKY placement");
        assert_eq!(sky_placement.unwrap().object_number, Some(1), "SKY objectNumber=1");

        let obj_placements: Vec<_> = bundle.placement_entries.iter()
            .filter(|e| e.vdk_type == "OBJECT")
            .collect();
        assert_eq!(obj_placements.len(), 4, "should have 4 OBJECT placement entries");
        for p in &obj_placements {
            assert_eq!(p.object_number, Some(0), "all OBJECTs reference objectNumber=0");
        }
    }

    #[test]
    fn test_load_stage_35516817_effect_entries() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let root = test_stage_root("35516817");
        let bundle = load_stage_bundle_impl(&root.to_string_lossy()).unwrap();

        let effect_count = bundle.placement_entries.iter()
            .filter(|e| e.vdk_type == "EFFECT")
            .count();
        assert!(effect_count > 10, "stage 018 should have many EFFECT entries, got {effect_count}");

        let sky_count = bundle.placement_entries.iter()
            .filter(|e| e.vdk_type == "SKY")
            .count();
        assert_eq!(sky_count, 1, "should have exactly 1 SKY entry");

        assert!(bundle.sub_models.len() >= 10, "stage 018 should have many sub models, got {}", bundle.sub_models.len());
    }

    #[test]
    fn test_load_stage_nonexistent_dir() {
        let result = load_stage_bundle_impl(r"E:\nonexistent\path");
        assert!(result.is_err(), "should fail for nonexistent dir");
    }

    // ── Placement CSV parsing (KV format) ───────────────────────────────

    #[test]
    fn test_parse_placement_kv_format_basic() {
        let csv = "VDK_TYPE,SKY,VDK_POSITION_X,10.0,VDK_POSITION_Y,20.0,VDK_POSITION_Z,30.0,VDK_OBJECTNUMBER,1\n\
                   VDK_TYPE,OBJECT,VDK_POSITION_X,100.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,-50.0,VDK_OBJECTNUMBER,0";
        let mut warnings = Vec::new();
        let (header, entries) = parse_placement_table(csv, &mut warnings);

        assert!(header.is_empty(), "KV format has no header row");
        assert_eq!(entries.len(), 2);

        assert_eq!(entries[0].vdk_type, "SKY");
        assert_eq!(entries[0].object_number, Some(1));
        assert!((entries[0].pos_x - 10.0).abs() < f64::EPSILON);
        assert!((entries[0].pos_y - 20.0).abs() < f64::EPSILON);
        assert!((entries[0].pos_z - 30.0).abs() < f64::EPSILON);

        assert_eq!(entries[1].vdk_type, "OBJECT");
        assert_eq!(entries[1].object_number, Some(0));
        assert!((entries[1].pos_x - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_parse_placement_kv_effect_entries() {
        let csv = "VDK_TYPE,EFFECT,VDK_POSITION_X,1046.77,VDK_POSITION_Y,-65.75,VDK_POSITION_Z,-242.80,VDK_EFFECT_ID,EFF_018STAGE018_MIST_001,VDK_SCALE_X,1.0,VDK_SCALE_Y,1.0,VDK_SCALE_Z,1.0\n\
                   VDK_TYPE,OBJECT,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0,VDK_OBJECTNUMBER,0";
        let mut warnings = Vec::new();
        let (_, entries) = parse_placement_table(csv, &mut warnings);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].vdk_type, "EFFECT");
        assert!(entries[0].object_number.is_none(), "EFFECT entries have no objectNumber");
        assert!((entries[0].pos_x - 1046.77).abs() < 0.01);
        assert!((entries[0].scale_x - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_parse_placement_kv_scale_defaults() {
        let csv = "VDK_TYPE,OBJECT,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0,VDK_OBJECTNUMBER,0";
        let mut warnings = Vec::new();
        let (_, entries) = parse_placement_table(csv, &mut warnings);

        assert_eq!(entries.len(), 1);
        assert!((entries[0].scale_x - 1.0).abs() < f64::EPSILON, "missing scale_x defaults to 1.0");
        assert!((entries[0].scale_y - 1.0).abs() < f64::EPSILON, "missing scale_y defaults to 1.0");
        assert!((entries[0].scale_z - 1.0).abs() < f64::EPSILON, "missing scale_z defaults to 1.0");
    }

    #[test]
    fn test_parse_placement_kv_zero_scale_defaults_to_one() {
        let csv = "VDK_TYPE,OBJECT,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0,VDK_OBJECTNUMBER,0,VDK_SCALE_X,0,VDK_SCALE_Y,0,VDK_SCALE_Z,0";
        let mut warnings = Vec::new();
        let (_, entries) = parse_placement_table(csv, &mut warnings);

        assert_eq!(entries.len(), 1);
        assert!((entries[0].scale_x - 1.0).abs() < f64::EPSILON, "explicit 0 scale_x -> 1.0");
        assert!((entries[0].scale_y - 1.0).abs() < f64::EPSILON, "explicit 0 scale_y -> 1.0");
        assert!((entries[0].scale_z - 1.0).abs() < f64::EPSILON, "explicit 0 scale_z -> 1.0");
    }

    #[test]
    fn test_parse_placement_empty_content() {
        let mut warnings = Vec::new();
        let (header, entries) = parse_placement_table("", &mut warnings);
        assert!(header.is_empty());
        assert!(entries.is_empty());
    }

    #[test]
    fn test_parse_placement_preserves_raw_fields() {
        let csv = "VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,250.0,VDK_POSITION_Y,-2.0,VDK_POSITION_Z,-250.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,0.0,VDK_OBJECTNUMBER,0,VDK_HITPOINT,UNBREAKABLE";
        let mut warnings = Vec::new();
        let (_, entries) = parse_placement_table(csv, &mut warnings);

        assert_eq!(entries.len(), 1);
        assert!(entries[0].raw_fields.len() > 10, "raw_fields should preserve all fields");
        assert!(entries[0].raw_fields.contains(&"UNBREAKABLE".to_string()),
            "raw_fields should contain UNBREAKABLE");
    }

    // ── Graphic param CSV parsing ───────────────────────────────────────

    #[test]
    fn test_parse_graphic_param_csv_from_bytes_basic() {
        let csv = b"directional_lighting_rot_x,-45\ndirectional_lighting_rot_y,45\nibl_lighting_intensity,1";
        let mut warnings = Vec::new();
        let params = parse_graphic_param_csv_from_bytes(csv, &mut warnings);

        assert_eq!(params.len(), 3);
        assert_eq!(params[0].key, "directional_lighting_rot_x");
        assert_eq!(params[0].value, "-45");
        assert_eq!(params[2].key, "ibl_lighting_intensity");
        assert_eq!(params[2].value, "1");
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_parse_graphic_param_csv_empty_lines() {
        let csv = b"key1,value1\n\nkey2,value2\n";
        let mut warnings = Vec::new();
        let params = parse_graphic_param_csv_from_bytes(csv, &mut warnings);
        assert_eq!(params.len(), 2, "empty lines should be skipped");
    }

    // ── Graphic param CSV roundtrip ─────────────────────────────────────

    #[test]
    fn test_graphic_param_csv_write_read_roundtrip() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let (_tmp, stage_copy) = copy_stage_to_temp("84F085E5");
        let bundle = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();
        let original_params = bundle.graphic_params.clone();
        assert!(!original_params.is_empty());

        let csv_content: String = original_params.iter()
            .map(|p| format!("{},{}", p.key, p.value))
            .collect::<Vec<_>>()
            .join("\n");
        let csv_path = stage_copy.join("info").join("graphic_param.csv");
        fs::write(&csv_path, &csv_content).unwrap();

        let reloaded = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();
        assert_eq!(reloaded.graphic_params.len(), original_params.len(),
            "roundtrip should preserve param count");
        for (orig, reload) in original_params.iter().zip(reloaded.graphic_params.iter()) {
            assert_eq!(orig.key, reload.key, "roundtrip should preserve key");
            assert_eq!(orig.value, reload.value, "roundtrip should preserve value");
        }
    }

    #[test]
    fn test_graphic_param_csv_modify_and_reload() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let (_tmp, stage_copy) = copy_stage_to_temp("84F085E5");
        let bundle = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();

        let mut params = bundle.graphic_params.clone();
        let original_first_value = params[0].value.clone();
        params[0].value = "999.5".to_string();

        let csv_content: String = params.iter()
            .map(|p| format!("{},{}", p.key, p.value))
            .collect::<Vec<_>>()
            .join("\n");
        let csv_path = stage_copy.join("info").join("graphic_param.csv");
        fs::write(&csv_path, &csv_content).unwrap();

        let reloaded = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();
        assert_eq!(reloaded.graphic_params[0].value, "999.5", "modified value should persist");
        assert_ne!(reloaded.graphic_params[0].value, original_first_value);
    }

    // ── Placement CSV roundtrip ─────────────────────────────────────────

    #[test]
    fn test_placement_csv_write_read_roundtrip_kv_format() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let (_tmp, stage_copy) = copy_stage_to_temp("16F73C97");
        let bundle = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();
        let original_entries = bundle.placement_entries.clone();
        let original_header = bundle.placement_header.clone();
        assert!(!original_entries.is_empty());

        let csv_content = if original_header.is_empty() {
            original_entries.iter()
                .map(|e| e.raw_fields.join(","))
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            let header_line = original_header.join(",");
            let data_lines: Vec<String> = original_entries.iter()
                .map(|e| e.raw_fields.join(","))
                .collect();
            std::iter::once(header_line).chain(data_lines).collect::<Vec<_>>().join("\n")
        };

        let csv_path = stage_copy.join("info").join("placement.csv");
        fs::write(&csv_path, &csv_content).unwrap();

        let reloaded = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();
        assert_eq!(reloaded.placement_entries.len(), original_entries.len(),
            "roundtrip should preserve entry count");

        for (i, (orig, reload)) in original_entries.iter().zip(reloaded.placement_entries.iter()).enumerate() {
            assert_eq!(orig.vdk_type, reload.vdk_type, "entry {i}: vdk_type mismatch");
            assert_eq!(orig.object_number, reload.object_number, "entry {i}: objectNumber mismatch");
            assert!((orig.pos_x - reload.pos_x).abs() < 0.001, "entry {i}: pos_x mismatch");
            assert!((orig.pos_y - reload.pos_y).abs() < 0.001, "entry {i}: pos_y mismatch");
            assert!((orig.pos_z - reload.pos_z).abs() < 0.001, "entry {i}: pos_z mismatch");
        }
    }

    #[test]
    fn test_placement_csv_effect_preservation_on_rewrite() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let (_tmp, stage_copy) = copy_stage_to_temp("35516817");
        let bundle = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();
        let original_entries = bundle.placement_entries.clone();

        let effect_entries: Vec<_> = original_entries.iter()
            .filter(|e| e.vdk_type == "EFFECT")
            .collect();
        let original_effect_count = effect_entries.len();
        assert!(original_effect_count > 0, "stage 018 must have EFFECT entries");

        let csv_content = original_entries.iter()
            .map(|e| e.raw_fields.join(","))
            .collect::<Vec<_>>()
            .join("\n");

        let csv_path = stage_copy.join("info").join("placement.csv");
        fs::write(&csv_path, &csv_content).unwrap();

        let reloaded = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();
        let reloaded_effects: Vec<_> = reloaded.placement_entries.iter()
            .filter(|e| e.vdk_type == "EFFECT")
            .collect();
        assert_eq!(reloaded_effects.len(), original_effect_count,
            "EFFECT entries must be preserved through write-reload cycle");

        for (orig, reload) in effect_entries.iter().zip(reloaded_effects.iter()) {
            assert_eq!(orig.raw_fields.len(), reload.raw_fields.len(),
                "EFFECT raw_fields length must match");
        }
    }

    // ── ObjectNumber re-indexing after delete ────────────────────────────

    #[test]
    fn test_object_index_after_folder_deletion() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let (_tmp, stage_copy) = copy_stage_to_temp("16F73C97");
        let bundle_before = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();

        let original_sub_count = bundle_before.sub_models.len();
        assert!(original_sub_count >= 1, "need at least 1 sub model for delete test");

        let deleted_folder = &bundle_before.sub_models[0].folder_name;
        let deleted_path = stage_copy.join(deleted_folder);
        assert!(deleted_path.is_dir(), "folder to delete should exist: {}", deleted_path.display());

        fs::remove_dir_all(&deleted_path).expect("delete sub model folder");

        let bundle_after = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();
        assert_eq!(bundle_after.sub_models.len(), original_sub_count - 1,
            "sub_models count should decrease by 1 after deletion");

        for (i, sub) in bundle_after.sub_models.iter().enumerate() {
            assert_eq!(sub.object_index, i,
                "objectIndex should be re-indexed: expected {i}, got {}", sub.object_index);
        }
    }

    #[test]
    fn test_sky_folder_not_counted_as_sub_model() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let root = test_stage_root("16F73C97");
        let bundle = load_stage_bundle_impl(&root.to_string_lossy()).unwrap();

        let sky_as_sub = bundle.sub_models.iter().find(|m| m.folder_name == "sky");
        assert!(sky_as_sub.is_some(), "sky should appear as a sub model entry");

        let base_as_sub = bundle.sub_models.iter().find(|m| m.folder_name == "base");
        assert!(base_as_sub.is_none(), "base should NOT appear as a sub model entry");
    }

    // ── Old texture format detection ────────────────────────────────────

    #[test]
    fn test_old_texture_format_has_numbered_subdirs_with_nutexb() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let root = test_stage_root("16F73C97");

        let object_dir = root.join("001stage001_object_box01").join("0");
        assert!(object_dir.is_dir(), "model SSBH dir should exist");

        let subdir_0 = object_dir.join("0");
        let subdir_1 = object_dir.join("1");
        assert!(subdir_0.is_dir(), "numbered subdir 0/ should exist (old format)");
        assert!(subdir_1.is_dir(), "numbered subdir 1/ should exist (old format)");

        let has_nutexb_in_0 = fs::read_dir(&subdir_0).unwrap()
            .filter_map(|e| e.ok())
            .any(|e| {
                e.path().extension()
                    .map(|ext| ext.eq_ignore_ascii_case("nutexb"))
                    .unwrap_or(false)
            });
        assert!(has_nutexb_in_0, "subdir 0/ should contain .nutexb files");
    }

    #[test]
    fn test_detect_old_texture_format_in_stage() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let root = test_stage_root("16F73C97");
        let reserved = ["base", "info", "textures", "sky"];

        // Old texture format: model_folder/SSBH_NUM/TEX_NUM/*.nutexb
        // e.g., 001stage001_object_box01/0/0/*.nutexb, .../0/1/*.nutexb
        let mut found_old_format = false;
        for entry in fs::read_dir(&root).unwrap().filter_map(|e| e.ok()) {
            if !entry.file_type().unwrap().is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if reserved.contains(&name.as_str()) {
                continue;
            }
            // Walk into model_folder looking for numbered SSBH subdirs
            for ssbh_dir in fs::read_dir(entry.path()).unwrap().filter_map(|e| e.ok()) {
                if !ssbh_dir.file_type().unwrap().is_dir() {
                    continue;
                }
                let ssbh_name = ssbh_dir.file_name().to_string_lossy().to_string();
                if !ssbh_name.chars().all(|c| c.is_ascii_digit()) {
                    continue;
                }
                // Inside SSBH dir (e.g. 0/), look for numbered texture variant dirs
                for tex_dir in fs::read_dir(ssbh_dir.path()).unwrap().filter_map(|e| e.ok()) {
                    if !tex_dir.file_type().unwrap().is_dir() {
                        continue;
                    }
                    let tex_name = tex_dir.file_name().to_string_lossy().to_string();
                    if !tex_name.chars().all(|c| c.is_ascii_digit()) {
                        continue;
                    }
                    // Check if this numbered dir contains .nutexb files
                    for file in fs::read_dir(tex_dir.path()).unwrap().filter_map(|e| e.ok()) {
                        if let Some(ext) = file.path().extension() {
                            if ext.eq_ignore_ascii_case("nutexb") {
                                found_old_format = true;
                            }
                        }
                    }
                }
            }
        }
        assert!(found_old_format, "stage 16F73C97 should have old texture format");
    }

    #[test]
    fn test_no_shared_textures_folder_in_stage_16f73c97() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let root = test_stage_root("16F73C97");
        let textures_dir = root.join("textures");
        assert!(!textures_dir.exists(),
            "stage 16F73C97 should NOT have a textures/ folder (old format, pre-migration)");
    }

    // ── Texture migration simulation (copy to temp, create textures/) ───

    #[test]
    fn test_texture_migration_creates_textures_folder() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let (_tmp, stage_copy) = copy_stage_to_temp("16F73C97");

        let reserved = ["base", "info", "textures", "sky"];
        let textures_dir = stage_copy.join("textures");
        fs::create_dir_all(&textures_dir).unwrap();

        // Migrate: model_folder/SSBH_NUM/TEX_NUM/*.nutexb → textures/
        let mut migrated_count = 0usize;
        for entry in fs::read_dir(&stage_copy).unwrap().filter_map(|e| e.ok()) {
            if !entry.file_type().unwrap().is_dir() { continue; }
            let name = entry.file_name().to_string_lossy().to_string();
            if reserved.contains(&name.as_str()) { continue; }

            for ssbh_dir in fs::read_dir(entry.path()).unwrap().filter_map(|e| e.ok()) {
                if !ssbh_dir.file_type().unwrap().is_dir() { continue; }
                let ssbh_name = ssbh_dir.file_name().to_string_lossy().to_string();
                if !ssbh_name.chars().all(|c| c.is_ascii_digit()) { continue; }

                for tex_dir in fs::read_dir(ssbh_dir.path()).unwrap().filter_map(|e| e.ok()) {
                    if !tex_dir.file_type().unwrap().is_dir() { continue; }
                    let tex_name = tex_dir.file_name().to_string_lossy().to_string();
                    if !tex_name.chars().all(|c| c.is_ascii_digit()) { continue; }

                    for file in fs::read_dir(tex_dir.path()).unwrap().filter_map(|e| e.ok()) {
                        let path = file.path();
                        if let Some(ext) = path.extension() {
                            if ext.eq_ignore_ascii_case("nutexb") {
                                let dest = textures_dir.join(path.file_name().unwrap());
                                if !dest.exists() {
                                    fs::copy(&path, &dest).unwrap();
                                    migrated_count += 1;
                                }
                            }
                        }
                    }
                }
            }
        }

        assert!(migrated_count > 0, "should have migrated some nutexb files");
        assert!(textures_dir.is_dir(), "textures/ should exist after migration");

        let tex_files: Vec<_> = fs::read_dir(&textures_dir).unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|ext| ext.eq_ignore_ascii_case("nutexb")).unwrap_or(false))
            .collect();
        assert!(!tex_files.is_empty(), "textures/ should contain nutexb files after migration");
    }

    // ── Bundle still loads after simulated save modifications ────────────

    #[test]
    fn test_bundle_loads_after_csv_rewrite() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let (_tmp, stage_copy) = copy_stage_to_temp("84F085E5");

        let bundle = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();

        let gp_csv: String = bundle.graphic_params.iter()
            .map(|p| format!("{},{}", p.key, p.value))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(stage_copy.join("info").join("graphic_param.csv"), &gp_csv).unwrap();

        let pl_csv: String = bundle.placement_entries.iter()
            .map(|e| e.raw_fields.join(","))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(stage_copy.join("info").join("placement.csv"), &pl_csv).unwrap();

        let reloaded = load_stage_bundle_impl(&stage_copy.to_string_lossy());
        assert!(reloaded.is_ok(), "bundle should load after CSV rewrite: {:?}", reloaded.err());
        let reloaded = reloaded.unwrap();
        assert_eq!(reloaded.graphic_params.len(), bundle.graphic_params.len());
        assert_eq!(reloaded.placement_entries.len(), bundle.placement_entries.len());
    }

    // ── Placement modification + save ───────────────────────────────────

    #[test]
    fn test_placement_position_modification_persists() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let (_tmp, stage_copy) = copy_stage_to_temp("16F73C97");
        let bundle = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();

        let mut entries = bundle.placement_entries.clone();
        let obj_idx = entries.iter().position(|e| e.vdk_type == "OBJECT").unwrap();
        let mut raw = entries[obj_idx].raw_fields.clone();
        let px_idx = raw.iter().position(|f| f.eq_ignore_ascii_case("VDK_POSITION_X")).unwrap();
        raw[px_idx + 1] = "12345.0".to_string();
        entries[obj_idx].raw_fields = raw;

        let csv_content = entries.iter()
            .map(|e| e.raw_fields.join(","))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(stage_copy.join("info").join("placement.csv"), &csv_content).unwrap();

        let reloaded = load_stage_bundle_impl(&stage_copy.to_string_lossy()).unwrap();
        let modified_obj = &reloaded.placement_entries[obj_idx];
        assert!((modified_obj.pos_x - 12345.0).abs() < 0.01,
            "modified position should persist, got {}", modified_obj.pos_x);
    }

    // ── CSV field identification ────────────────────────────────────────

    #[test]
    fn test_identify_info_file_placement_csv() {
        let sample = b"VDK_TYPE,OBJECT,VDK_POSITION_X,0";
        assert_eq!(identify_info_file(sample), "placement.csv");
    }

    #[test]
    fn test_identify_info_file_graphic_param_csv() {
        let sample = b"directional_lighting_rot_x,-45\npfx_bloom_intensity,0.5";
        assert_eq!(identify_info_file(sample), "graphic_param.csv");
    }

    #[test]
    fn test_identify_info_file_hkt() {
        let mut data = vec![0u8; 20];
        data[0x0C..0x10].copy_from_slice(b"SDKV");
        assert_eq!(identify_info_file(&data), "border_hit.hkt");
    }

    // ── Numdlb name extraction ──────────────────────────────────────────

    #[test]
    fn test_numdlb_name_from_real_file() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let numdlb_path = test_stage_root("16F73C97")
            .join("001stage001_object_box01")
            .join("0")
            .join("001stage001_object_box01.numdlb");
        if !numdlb_path.exists() {
            eprintln!("SKIP: numdlb file not found");
            return;
        }
        let data = fs::read(&numdlb_path).unwrap();
        let name = read_numdlb_model_name(&data);
        assert!(name.is_some(), "should extract name from real numdlb");
        let name = name.unwrap();
        assert!(name.contains("001stage001"), "name should contain stage identifier, got: {name}");
    }

    #[test]
    fn test_numdlb_name_too_short() {
        let data = vec![0u8; 10];
        assert!(read_numdlb_model_name(&data).is_none());
    }

    #[test]
    fn test_numdlb_name_wrong_magic() {
        let mut data = vec![0u8; 0x40];
        data[0..4].copy_from_slice(b"NOPE");
        assert!(read_numdlb_model_name(&data).is_none());
    }

    // ── Split CSV record ────────────────────────────────────────────────

    #[test]
    fn test_split_csv_simple() {
        let fields = split_csv_record("a,b,c");
        assert_eq!(fields, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_split_csv_quoted() {
        let fields = split_csv_record("\"hello, world\",b,c");
        assert_eq!(fields[0], "hello, world");
        assert_eq!(fields.len(), 3);
    }

    #[test]
    fn test_split_csv_escaped_quotes() {
        let fields = split_csv_record("\"he said \"\"hi\"\"\",b");
        assert_eq!(fields[0], "he said \"hi\"");
    }

    // ── Normalize model name ────────────────────────────────────────────

    #[test]
    fn test_normalize_model_name_basic() {
        assert_eq!(normalize_model_name("Model01.numdlb"), "model01");
    }

    #[test]
    fn test_normalize_model_name_slashes() {
        assert_eq!(normalize_model_name("/path/to/Model.ext"), "path_to_model");
    }

    #[test]
    fn test_normalize_model_name_spaces() {
        assert_eq!(normalize_model_name("My Model"), "my_model");
    }

    // ── Stage root with missing info dir ────────────────────────────────

    #[test]
    fn test_bundle_with_missing_info_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let stage = tmp.path().join("stage");
        fs::create_dir_all(stage.join("base")).unwrap();
        let bundle = load_stage_bundle_impl(&stage.to_string_lossy()).unwrap();
        assert!(bundle.graphic_params.is_empty());
        assert!(bundle.placement_entries.is_empty());
    }

    // ── Nutexb internal name parsing ────────────────────────────────────

    #[test]
    fn test_parse_nutexb_name_from_real_file() {
        if skip_if_test_data_missing() {
            eprintln!("SKIP: test data not found at {TEST_DATA_ROOT}");
            return;
        }
        let root = test_stage_root("16F73C97");
        let nutexb_dir = root.join("001stage001_object_box01").join("0").join("0");
        if !nutexb_dir.is_dir() {
            eprintln!("SKIP: nutexb dir not found");
            return;
        }
        let mut tested = 0;
        for entry in fs::read_dir(&nutexb_dir).unwrap().filter_map(|e| e.ok()) {
            if entry.path().extension().map(|e| e.eq_ignore_ascii_case("nutexb")).unwrap_or(false) {
                let data = fs::read(entry.path()).unwrap();
                let name = parse_nutexb_internal_name(&data);
                assert!(name.is_some(), "should parse nutexb internal name from {}", entry.path().display());
                tested += 1;
            }
        }
        assert!(tested > 0, "should have tested at least one nutexb file");
    }

    #[test]
    fn test_parse_nutexb_name_too_short() {
        assert!(parse_nutexb_internal_name(&[0; 4]).is_none());
    }

    #[test]
    fn test_parse_nutexb_name_wrong_magic() {
        let mut data = vec![0u8; 100];
        let len = data.len();
        data[len - 8..len - 4].copy_from_slice(b"NOPE");
        assert!(parse_nutexb_internal_name(&data).is_none());
    }
}
