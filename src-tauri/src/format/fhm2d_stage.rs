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

use crate::format::fhm2d::InMemoryFhm2dFile;
use crate::ssbh_preview::{self, SsbhModelPreviewBundle};

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

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
#[allow(dead_code)]
enum SubFileStructureEntry {
    Folder {
        unk1: String,
        folder_count: i32,
        #[allow(dead_code)]
        unk2: String,
        #[allow(dead_code)]
        unk3: i32,
        #[allow(dead_code)]
        unk4: i32,
        #[allow(dead_code)]
        unk5: i32,
        #[allow(dead_code)]
        unk6: i32,
    },
    Item {
        unk1: String,
        file_index: i32,
        #[allow(dead_code)]
        unk2: String,
        #[allow(dead_code)]
        unk3: i32,
        #[allow(dead_code)]
        unk4: i32,
        #[allow(dead_code)]
        original_file_index: i32,
        #[serde(rename = "Name")]
        display_name: Option<String>,
    },
    EndMark {
        end_mark_count: i32,
    },
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
    raw.replace(['/', '\\'], "_")
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

// ── In-memory rename helpers ───────────────────────────────────────────────

struct InMemoryFolderGroup {
    folder_index: usize,
    #[allow(dead_code)]
    folder_prefix: String,
    files: Vec<InMemoryFolderFile>,
}

struct InMemoryFolderFile {
    file_name: String,
    file_type: String,
    data: Vec<u8>,
}

fn collect_memory_folder_groups(files: &[InMemoryFhm2dFile]) -> Vec<InMemoryFolderGroup> {
    let mut groups_map: HashMap<String, Vec<InMemoryFolderFile>> = HashMap::new();
    let mut folder_order: Vec<String> = Vec::new();

    for file in files {
        let normalized = file.file_url.replace('\\', "/");
        let trimmed = normalized.trim_start_matches("./").to_string();
        let parts: Vec<&str> = trimmed.split('/').collect();
        let folder_prefix = if parts.len() > 1 {
            parts[0].to_string()
        } else {
            "0".to_string()
        };
        let file_name = parts.last().unwrap_or(&"unknown").to_string();

        if !folder_order.contains(&folder_prefix) {
            folder_order.push(folder_prefix.clone());
        }

        groups_map.entry(folder_prefix).or_default().push(InMemoryFolderFile {
            file_name,
            file_type: file.file_type.clone(),
            data: file.data.clone(),
        });
    }

    folder_order
        .into_iter()
        .enumerate()
        .map(|(idx, prefix)| InMemoryFolderGroup {
            folder_index: idx,
            folder_prefix: prefix.clone(),
            files: groups_map.remove(&prefix).unwrap_or_default(),
        })
        .collect()
}

fn determine_memory_folder_name(
    position: usize,
    total: usize,
    files: &[InMemoryFolderFile],
    warnings: &mut Vec<String>,
) -> (String, &'static str) {
    if total >= 3 {
        if position == 0 {
            return (STAGE_BASE_NAME.to_string(), "base");
        }
        if position == 1 {
            return (STAGE_INFO_NAME.to_string(), "info");
        }
        if position == total - 1 {
            return (STAGE_TEXTURES_NAME.to_string(), "textures");
        }
    }

    if total < 3 && position == 0 {
        return (STAGE_BASE_NAME.to_string(), "base");
    }

    for file in files {
        if file.file_type.eq_ignore_ascii_case(".numdlb") {
            if let Some(name) = read_numdlb_model_name(&file.data) {
                return (name, "sub_model");
            }
        }
    }

    let fallback = format!("unknown_{position}");
    warnings.push(format!(
        "Could not infer name for folder at position {position}, using '{fallback}'"
    ));
    (fallback, "unknown")
}

pub fn stage_rename_in_memory(
    files: &[InMemoryFhm2dFile],
) -> Result<(Vec<StageVirtualTreeFolder>, Vec<String>), String> {
    let groups = collect_memory_folder_groups(files);

    let mut warnings = Vec::new();

    if groups.len() < 3 {
        warnings.push(format!(
            "[ERROR] Stage structure has only {} folder(s), expected at least 3 (base, info, textures). \
             Rename mapping may be incorrect — review the tree below for debugging.",
            groups.len()
        ));
    }
    let total = groups.len();
    let mut virtual_tree = Vec::new();

    for (pos, group) in groups.iter().enumerate() {
        let (folder_name, role) = determine_memory_folder_name(pos, total, &group.files, &mut warnings);

        let tree_files: Vec<StageVirtualTreeFile> = group
            .files
            .iter()
            .map(|f| StageVirtualTreeFile {
                file_name: f.file_name.clone(),
                file_type: f.file_type.clone(),
                size_bytes: f.data.len(),
            })
            .collect();

        virtual_tree.push(StageVirtualTreeFolder {
            original_index: group.folder_index,
            renamed_name: folder_name,
            role: role.to_string(),
            files: tree_files,
        });
    }

    Ok((virtual_tree, warnings))
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
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageVirtualTreeFolder {
    pub original_index: usize,
    pub renamed_name: String,
    pub role: String,
    pub files: Vec<StageVirtualTreeFile>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageInMemoryImportResult {
    pub bundle: StageBundle,
    pub virtual_tree: Vec<StageVirtualTreeFolder>,
    pub warnings: Vec<String>,
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
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if ext.eq_ignore_ascii_case("numdlb") {
                return Some(path);
            }
        }
    }
    None
}

fn parse_graphic_param_csv(root: &Path, warnings: &mut Vec<String>) -> Vec<GraphicParamEntry> {
    let csv_path = root.join(STAGE_INFO_NAME).join("graphic_param.csv");
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
    let csv_path = root.join(STAGE_INFO_NAME).join("placement.csv");
    if !csv_path.exists() {
        warnings.push("placement.csv not found".to_string());
        return (Vec::new(), Vec::new());
    }
    let content = match fs::read_to_string(&csv_path) {
        Ok(c) => c,
        Err(e) => {
            warnings.push(format!("Failed to read placement.csv: {e}"));
            return (Vec::new(), Vec::new());
        }
    };

    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let header: Vec<&str> = lines[0].split(',').map(|s| s.trim()).collect();
    let header_strings: Vec<String> = header.iter().map(|s| s.to_string()).collect();
    let find_col = |name: &str| -> Option<usize> {
        header.iter().position(|h| h.eq_ignore_ascii_case(name))
    };

    let col_type = find_col("VDK_TYPE");
    let col_objnum = find_col("VDK_OBJECTNUMBER");
    let col_px = find_col("VDK_POS_X");
    let col_py = find_col("VDK_POS_Y");
    let col_pz = find_col("VDK_POS_Z");
    let col_rx = find_col("VDK_ROT_X");
    let col_ry = find_col("VDK_ROT_Y");
    let col_rz = find_col("VDK_ROT_Z");
    let col_sx = find_col("VDK_SCALE_X");
    let col_sy = find_col("VDK_SCALE_Y");
    let col_sz = find_col("VDK_SCALE_Z");

    let parse_f64 = |fields: &[&str], col: Option<usize>| -> f64 {
        col.and_then(|c| fields.get(c))
            .and_then(|v| v.trim().parse::<f64>().ok())
            .unwrap_or(0.0)
    };

    let parse_i32 = |fields: &[&str], col: Option<usize>| -> Option<i32> {
        col.and_then(|c| fields.get(c))
            .and_then(|v| v.trim().parse::<i32>().ok())
    };

    let mut entries = Vec::new();
    for line in &lines[1..] {
        if line.trim().is_empty() {
            continue;
        }
        let fields: Vec<&str> = line.split(',').collect();
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
            scale_x: parse_f64(&fields, col_sx),
            scale_y: parse_f64(&fields, col_sy),
            scale_z: parse_f64(&fields, col_sz),
            raw_fields: fields.iter().map(|f| f.trim().to_string()).collect(),
        });
    }
    (header_strings, entries)
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
    let content = match std::str::from_utf8(data) {
        Ok(s) => s,
        Err(e) => {
            warnings.push(format!("placement.csv is not valid UTF-8: {e}"));
            return (Vec::new(), Vec::new());
        }
    };

    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let header: Vec<&str> = lines[0].split(',').map(|s| s.trim()).collect();
    let header_strings: Vec<String> = header.iter().map(|s| s.to_string()).collect();
    let find_col = |name: &str| -> Option<usize> {
        header.iter().position(|h| h.eq_ignore_ascii_case(name))
    };

    let col_type = find_col("VDK_TYPE");
    let col_objnum = find_col("VDK_OBJECTNUMBER");
    let col_px = find_col("VDK_POS_X");
    let col_py = find_col("VDK_POS_Y");
    let col_pz = find_col("VDK_POS_Z");
    let col_rx = find_col("VDK_ROT_X");
    let col_ry = find_col("VDK_ROT_Y");
    let col_rz = find_col("VDK_ROT_Z");
    let col_sx = find_col("VDK_SCALE_X");
    let col_sy = find_col("VDK_SCALE_Y");
    let col_sz = find_col("VDK_SCALE_Z");

    let parse_f64 = |fields: &[&str], col: Option<usize>| -> f64 {
        col.and_then(|c| fields.get(c))
            .and_then(|v| v.trim().parse::<f64>().ok())
            .unwrap_or(0.0)
    };

    let parse_i32 = |fields: &[&str], col: Option<usize>| -> Option<i32> {
        col.and_then(|c| fields.get(c))
            .and_then(|v| v.trim().parse::<i32>().ok())
    };

    let mut entries = Vec::new();
    for line in &lines[1..] {
        if line.trim().is_empty() {
            continue;
        }
        let fields: Vec<&str> = line.split(',').collect();
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
            scale_x: parse_f64(&fields, col_sx),
            scale_y: parse_f64(&fields, col_sy),
            scale_z: parse_f64(&fields, col_sz),
            raw_fields: fields.iter().map(|f| f.trim().to_string()).collect(),
        });
    }
    (header_strings, entries)
}

pub fn find_info_file_data<'a>(
    files: &'a [InMemoryFhm2dFile],
    virtual_tree: &[StageVirtualTreeFolder],
    target_file_name: &str,
) -> Option<&'a [u8]> {
    let info_folder = virtual_tree.iter().find(|f| f.role == "info")?;
    let info_prefix = info_folder.original_index.to_string();

    let mut non_nutexb_index = 0usize;
    for file in files {
        let normalized = file.file_url.replace('\\', "/");
        let trimmed = normalized.trim_start_matches("./");
        let parts: Vec<&str> = trimmed.split('/').collect();
        if parts.len() < 2 {
            continue;
        }
        if parts[0] != info_prefix {
            continue;
        }
        if file.file_type.eq_ignore_ascii_case(".nutexb") {
            continue;
        }
        if non_nutexb_index < INFO_FILE_NAMES.len() && INFO_FILE_NAMES[non_nutexb_index] == target_file_name {
            return Some(&file.data);
        }
        non_nutexb_index += 1;
    }
    None
}
