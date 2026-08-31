//! Clone 009gui packs by unpacking donor FHM2D and extracting inner files into
//! vs2-style folders under workspace `009gui/`, with a newly allocated HashName.
//!
//! Inner `.lm` / `.nutexb` payloads are not rewritten. Packed `0x{NEW}.fhm2d`
//! is a later Repack, not this clone step.

use crate::format::fhm2d::extract_fhm2d_gui_clone;
use crate::format::fhm2d_structure_metadata::sanitize_structure_name;
use crate::format::list_command_pool::ListEntry;
use crate::format::navilist::{build_navilist_data, parse_navilist_data};
use crate::format::raw_path_id::crc32_ieee;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub const DEFAULT_DONOR_ENTRY_ID: u32 = 16_001_001;
pub const ALT_MIXED_DONOR_ENTRY_ID: u32 = 28_001_001;
pub const DEFAULT_TARGET_ENTRY_ID: u32 = 900_000_004;
pub const NAVI_LIST_PACK_HASH: u32 = 0x6FCC_0FBA;
pub const NAVI_UNIQUE_ID_HASH: u32 = 0xA88E_762A;
pub const NAVI_SERIES_ID_HASH: u32 = 0xBF88_5105;
const NAVI_RESOURCE_COMMAND_HASHES: &[u32] = &[
    0x5F9E_BE2A,
    0x6D7C_5DBF,
    0x6E3E_AF61,
    0xA014_8380,
    0xABF1_C7FB,
    0xBC9F_AF15,
    0xBF3F_5380,
];

pub const PILOT_GUI_FIELDS: &[GuiCloneField] = &[
    GuiCloneField {
        camel_key: "lmbCutIn",
        command_hash: 0xAF17_0BA4,
        fallback_donor_hash: 0x88BD_4DC3,
        donor_name: "st_p_016_001_c01",
        package_path: "009gui/flash/pilot/p_016_001/st_p_016_001_c01/st_p_016_001_c01",
    },
    GuiCloneField {
        camel_key: "lmbPilotClothing",
        command_hash: 0x361E_5A1E,
        fallback_donor_hash: 0x11B4_1C79,
        donor_name: "st_p_016_001_c02",
        package_path: "009gui/flash/pilot/p_016_001/st_p_016_001_c02/st_p_016_001_c02",
    },
    GuiCloneField {
        camel_key: "lmbBoost",
        command_hash: 0xD263_597C,
        fallback_donor_hash: 0x8C77_83E2,
        donor_name: "ex_p_016_001_c01",
        package_path: "009gui/flash/pilot",
    },
    GuiCloneField {
        camel_key: "exPilotClothingLmbHash",
        command_hash: 0x4B6A_08C6,
        fallback_donor_hash: 0x157E_D258,
        donor_name: "ex_p_016_001_c02",
        package_path: "009gui/flash/pilot",
    },
    GuiCloneField {
        camel_key: "vsPL",
        command_hash: 0xE835_F60F,
        fallback_donor_hash: 0x9233_D6AC,
        donor_name: "vs_p_l_016_001_c01",
        package_path: "009gui/image/pilot/vs_p_l/vs_p_l_016_001_c01",
    },
    GuiCloneField {
        camel_key: "vsPLC02",
        command_hash: 0x713C_A7B5,
        fallback_donor_hash: 0,
        donor_name: "vs_p_l",
        package_path: "009gui/image/pilot/vs_p_l",
    },
    GuiCloneField {
        camel_key: "vsPLC03",
        command_hash: 0x063B_9723,
        fallback_donor_hash: 0,
        donor_name: "vs_p_l",
        package_path: "009gui/image/pilot/vs_p_l",
    },
    GuiCloneField {
        camel_key: "vsPLC04",
        command_hash: 0x985F_0280,
        fallback_donor_hash: 0,
        donor_name: "vs_p_l",
        package_path: "009gui/image/pilot/vs_p_l",
    },
    GuiCloneField {
        camel_key: "vsPR",
        command_hash: 0xCF29_CF0B,
        fallback_donor_hash: 0xDCD2_7CC6,
        donor_name: "vs_p_r_016_001_c01",
        package_path: "009gui/image/pilot/vs_p_r/vs_p_r_016_001_c01",
    },
    GuiCloneField {
        camel_key: "vsPRC02",
        command_hash: 0x5620_9EB1,
        fallback_donor_hash: 0,
        donor_name: "vs_p_r",
        package_path: "009gui/image/pilot/vs_p_r",
    },
    GuiCloneField {
        camel_key: "vsPRC03",
        command_hash: 0x2127_AE27,
        fallback_donor_hash: 0,
        donor_name: "vs_p_r",
        package_path: "009gui/image/pilot/vs_p_r",
    },
    GuiCloneField {
        camel_key: "vsPRC04",
        command_hash: 0xBF43_3B84,
        fallback_donor_hash: 0,
        donor_name: "vs_p_r",
        package_path: "009gui/image/pilot/vs_p_r",
    },
    GuiCloneField {
        camel_key: "scP",
        command_hash: 0xFC0C_AD0B,
        fallback_donor_hash: 0x41C9_ED41,
        donor_name: "sc_p_016_001_c01",
        package_path: "009gui/image/pilot/sc_p/sc_p_016_001_c01",
    },
];

pub const MS_GUI_FIELDS: &[GuiCloneField] = &[
    GuiCloneField {
        camel_key: "msIghR",
        command_hash: 0x086A_965D,
        fallback_donor_hash: 0x6CEF_3949,
        donor_name: "ms_igh_r_016_001_001",
        package_path: "009gui/image/ms/ms_igh_r/ms_igh_r_016_001_001",
    },
    GuiCloneField {
        camel_key: "msVsR",
        command_hash: 0x11A6_59D4,
        fallback_donor_hash: 0x465A_ECD8,
        donor_name: "ms_vs_r_016_001_001",
        package_path: "009gui/image/ms/ms_vs_r/ms_vs_r_016_001_001",
    },
    GuiCloneField {
        camel_key: "msVsL",
        command_hash: 0x1CFE_4C4F,
        fallback_donor_hash: 0xFF2F_74E6,
        donor_name: "ms_vs_l_016_001_001",
        package_path: "009gui/image/ms/ms_vs_l/ms_vs_l_016_001_001",
    },
    GuiCloneField {
        camel_key: "msTracker",
        command_hash: 0x8EF9_4283,
        fallback_donor_hash: 0x8239_C895,
        donor_name: "ms_tracker_016_001_001",
        package_path: "009gui/ms_tracker_016_001_001",
    },
    GuiCloneField {
        camel_key: "msMsL",
        command_hash: 0xC8CD_B696,
        fallback_donor_hash: 0xC87D_26E4,
        donor_name: "ms_ms_l_016_001_001",
        package_path: "009gui/image/ms/ms_ms_l/ms_ms_l_016_001_001",
    },
    GuiCloneField {
        camel_key: "msMsS",
        command_hash: 0xE4E3_753B,
        fallback_donor_hash: 0x120F_67FE,
        donor_name: "ms_ms_s_016_001_001",
        package_path: "009gui/image/ms/ms_ms_s/ms_ms_s_016_001_001",
    },
    GuiCloneField {
        camel_key: "msMn",
        command_hash: 0xF94C_F0EC,
        fallback_donor_hash: 0x9A2A_DE25,
        donor_name: "ms_mn_016_001_001",
        package_path: "009gui/image/ms/ms_mn/ms_mn_016_001_001",
    },
    GuiCloneField {
        camel_key: "msCrs",
        command_hash: 0xDBA3_6169,
        fallback_donor_hash: 0x4E32_E6CC,
        donor_name: "ms_crs_016_001_001",
        package_path: "009gui/image/ms/ms_crs/ms_crs_016_001_001",
    },
];

pub const NAVI_GUI_PACKS: &[GuiCloneField] = &[
    GuiCloneField {
        camel_key: "naviBt",
        command_hash: 0,
        fallback_donor_hash: 0x3D87_7AB4,
        donor_name: "navi_bt_016_o01",
        package_path: "009gui/flash/navi/battle",
    },
    GuiCloneField {
        camel_key: "naviBtS",
        command_hash: 0,
        fallback_donor_hash: 0xF988_28B4,
        donor_name: "navi_bt_s_016_o01",
        package_path: "009gui/image/navi/navi_bt_s/navi_bt_s_016_o01",
    },
    GuiCloneField {
        camel_key: "naviPlC01",
        command_hash: 0,
        fallback_donor_hash: 0x707A_36C4,
        donor_name: "navi_pl_016_o01_c01_a2",
        package_path: "009gui/flash/navi/player",
    },
    GuiCloneField {
        camel_key: "naviPlC02",
        command_hash: 0,
        fallback_donor_hash: 0xE973_677E,
        donor_name: "navi_pl_016_o01_c02_a2",
        package_path: "009gui/flash/navi/player",
    },
    GuiCloneField {
        camel_key: "naviPlSC01",
        command_hash: 0,
        fallback_donor_hash: 0xBDCC_44A9,
        donor_name: "navi_pl_s_016_o01_c01",
        package_path: "009gui/image/navi/navi_pl_s/navi_pl_s_016_o01_c01",
    },
    GuiCloneField {
        camel_key: "naviPlSC02",
        command_hash: 0,
        fallback_donor_hash: 0x24C5_1513,
        donor_name: "navi_pl_s_016_o01_c02",
        package_path: "009gui/image/navi/navi_pl_s/navi_pl_s_016_o01_c02",
    },
];

#[derive(Debug, Clone, Copy)]
pub struct GuiCloneField {
    pub camel_key: &'static str,
    pub command_hash: u32,
    pub fallback_donor_hash: u32,
    pub donor_name: &'static str,
    pub package_path: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClonedPack {
    pub field_key: String,
    pub donor_name: String,
    pub donor_hash: u32,
    pub new_hash: u32,
    pub donor_file_name: String,
    pub new_file_name: String,
    pub bind_target: String,
    pub source_path: String,
    pub output_path: String,
    pub workspace_relative: String,
    pub structure_json_path: String,
    pub structure_name: String,
    pub inner_file_count: u32,
    pub ob_mod_output_path: Option<String>,
    pub byte_len: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneGuiSetRequest {
    pub dpl_cache_path: String,
    pub workspace_root: String,
    pub ob_mod_path: Option<String>,
    pub copy_to_ob_mod: bool,
    pub target_entry_id: u32,
    pub donor_entry_id: u32,
    #[serde(default)]
    pub donor_navi_unique_id: Option<u32>,
    pub clone_pilot: bool,
    pub clone_navi: bool,
    pub preview: bool,
    #[serde(default)]
    pub selected_field_keys: Option<Vec<String>>,
    #[serde(default)]
    pub structure_names: Option<HashMap<String, String>>,
    pub character_list: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NaviCloneResult {
    pub navi_list_path: String,
    pub new_character_unique_id: u32,
    pub appended_entry_ids: Vec<u32>,
    pub remapped_pack_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneGuiSetResult {
    pub preview: bool,
    pub packs: Vec<ClonedPack>,
    pub character_field_updates: HashMap<String, u32>,
    pub navi: Option<NaviCloneResult>,
    pub warnings: Vec<String>,
}

pub fn pack_file_name(hash: u32) -> String {
    format!("0x{hash:08X}.fhm2d")
}

pub fn parse_pack_hash_from_name(name: &str) -> Option<u32> {
    parse_hash_name_token(name)
}

pub fn parse_hash_name_token(value: &str) -> Option<u32> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let stem = trimmed
        .strip_suffix(".fhm2d")
        .or_else(|| trimmed.strip_suffix(".FHM2D"))
        .unwrap_or(trimmed);
    let hex = stem
        .strip_prefix("0x")
        .or_else(|| stem.strip_prefix("0X"))?;
    if hex.len() != 8 {
        return None;
    }
    u32::from_str_radix(hex, 16).ok()
}

/// Map a name-map `packagePath` plus donor stem onto a unique folder under `009gui/`.
/// Shared vs2 parents (`flash/navi/battle`) append the donor name so extracts do not collide.
/// Duplicated leaf (`.../st_p_016_001_c01/st_p_016_001_c01`) is collapsed to one segment.
pub fn vs2_gui_extract_relative(package_path: &str, donor_name: &str) -> String {
    let normalized = package_path.replace('\\', "/");
    let without_root = normalized
        .trim()
        .trim_start_matches('/')
        .strip_prefix("009gui/")
        .unwrap_or(normalized.trim().trim_start_matches('/'));
    let mut segments: Vec<&str> = without_root
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    if segments.is_empty() {
        return donor_name.to_string();
    }
    if segments.len() >= 2
        && segments[segments.len() - 1] == donor_name
        && segments[segments.len() - 2] == donor_name
    {
        segments.pop();
    } else if segments[segments.len() - 1] != donor_name {
        return format!("{}/{}", segments.join("/"), donor_name);
    }
    segments.join("/")
}

pub fn gui_extract_folder(workspace_root: &Path, package_path: &str, donor_name: &str) -> PathBuf {
    gui_clone_extract_folder(workspace_root, package_path, donor_name, donor_name)
}

/// Same vs2 parent as the donor extract, but the leaf folder is `leaf_name`.
/// Custom clone names therefore sit beside the original instead of replacing it.
pub fn gui_clone_extract_relative(package_path: &str, donor_name: &str, leaf_name: &str) -> String {
    let relative = vs2_gui_extract_relative(package_path, donor_name);
    let leaf = if leaf_name.is_empty() {
        donor_name
    } else {
        leaf_name
    };
    if leaf == donor_name {
        return relative;
    }
    match relative.rsplit_once('/') {
        Some((parent, _)) => format!("{parent}/{leaf}"),
        None => leaf.to_string(),
    }
}

pub fn gui_clone_extract_folder(
    workspace_root: &Path,
    package_path: &str,
    donor_name: &str,
    leaf_name: &str,
) -> PathBuf {
    let relative = gui_clone_extract_relative(package_path, donor_name, leaf_name);
    let mut path = workspace_root.join("009gui");
    for segment in relative.split('/') {
        path.push(segment);
    }
    path
}

pub fn gui_clone_hash_key(
    target_entry_id: u32,
    structure_name: &str,
    field_key: &str,
    n: u32,
) -> String {
    if n == 0 {
        format!("GUI_CLONE|{target_entry_id}|{structure_name}|{field_key}")
    } else {
        format!("GUI_CLONE|{target_entry_id}|{structure_name}|{field_key}#{n}")
    }
}

pub fn allocate_gui_clone_hash(
    target_entry_id: u32,
    structure_name: &str,
    field_key: &str,
    occupied: &HashSet<u32>,
) -> Result<u32, String> {
    for n in 0u32..1_000_000 {
        let key = gui_clone_hash_key(target_entry_id, structure_name, field_key, n);
        let hash = crc32_ieee(key.as_bytes());
        if hash != 0 && !occupied.contains(&hash) {
            return Ok(hash);
        }
    }
    Err(format!(
        "exhausted GUI clone hash allocation for {structure_name}/{field_key}"
    ))
}

pub fn resolve_dplcache_pack(dpl_cache_path: &Path, hash: u32) -> Result<PathBuf, String> {
    let upper = dpl_cache_path.join(pack_file_name(hash));
    if upper.is_file() {
        return Ok(upper);
    }
    let lower = dpl_cache_path.join(format!("0x{:08x}.fhm2d", hash));
    if lower.is_file() {
        return Ok(lower);
    }
    Err(format!("Donor pack not found: {}", upper.display()))
}

pub fn dplcache_has_pack(dpl_cache_path: &Path, hash: u32) -> bool {
    resolve_dplcache_pack(dpl_cache_path, hash).is_ok()
}

enum GuiCloneSource {
    Packed(PathBuf),
    Extract {
        folder: PathBuf,
        structure_json: PathBuf,
    },
}

impl GuiCloneSource {
    fn display_path(&self) -> String {
        match self {
            Self::Packed(path) => path.display().to_string(),
            Self::Extract { folder, .. } => folder.display().to_string(),
        }
    }

    fn byte_len(&self) -> Result<u64, String> {
        match self {
            Self::Packed(path) => fs::metadata(path)
                .map(|meta| meta.len())
                .map_err(|e| format!("Stat donor failed: {e}")),
            Self::Extract { folder, .. } => extracted_payload_stats(folder).map(|(bytes, _)| bytes),
        }
    }
}

fn packed_gui_path(dir: &Path, hash: u32) -> Option<PathBuf> {
    resolve_dplcache_pack(dir, hash).ok()
}

fn resolve_gui_clone_source(
    dpl_cache_path: &Path,
    ob_mod_path: Option<&Path>,
    workspace_root: &Path,
    workspace_packs: &[WorkspaceGuiPack],
    hash: u32,
) -> Result<GuiCloneSource, String> {
    if let Some(path) = packed_gui_path(dpl_cache_path, hash) {
        return Ok(GuiCloneSource::Packed(path));
    }
    if let Some(mod_dir) = ob_mod_path {
        if let Some(path) = packed_gui_path(mod_dir, hash) {
            return Ok(GuiCloneSource::Packed(path));
        }
    }
    let workspace_packed = workspace_root.join("009gui").join(pack_file_name(hash));
    if workspace_packed.is_file() {
        return Ok(GuiCloneSource::Packed(workspace_packed));
    }
    if let Some(pack) = workspace_packs.iter().find(|pack| pack.hash == hash) {
        let folder = PathBuf::from(&pack.folder_path);
        let structure_json = PathBuf::from(&pack.structure_json_path);
        if folder.is_dir() && structure_json.is_file() {
            return Ok(GuiCloneSource::Extract {
                folder,
                structure_json,
            });
        }
    }
    Err(format!(
        "Donor pack not found for {}: not in dplcache, OB mod, or workspace 009gui extract",
        pack_file_name(hash)
    ))
}

const MS_GUI_NAME_PREFIXES: &[(&str, &str, &str)] = &[
    ("msIghR", "ms_igh_r_", "009gui/image/ms/ms_igh_r"),
    ("msVsR", "ms_vs_r_", "009gui/image/ms/ms_vs_r"),
    ("msVsL", "ms_vs_l_", "009gui/image/ms/ms_vs_l"),
    ("msTracker", "ms_tracker_", "009gui"),
    ("msMsL", "ms_ms_l_", "009gui/image/ms/ms_ms_l"),
    ("msMsS", "ms_ms_s_", "009gui/image/ms/ms_ms_s"),
    ("msMn", "ms_mn_", "009gui/image/ms/ms_mn"),
    ("msCrs", "ms_crs_", "009gui/image/ms/ms_crs"),
];

fn ms_gui_prefix_for_field(field_key: &str) -> Option<&'static str> {
    MS_GUI_NAME_PREFIXES
        .iter()
        .find(|(key, _, _)| *key == field_key)
        .map(|(_, prefix, _)| *prefix)
}

fn ms_gui_package_base(field_key: &str, name: &str) -> Option<&'static str> {
    if let Some((_, _, base)) = MS_GUI_NAME_PREFIXES
        .iter()
        .find(|(key, _, _)| *key == field_key)
    {
        return Some(*base);
    }
    MS_GUI_NAME_PREFIXES
        .iter()
        .find(|(_, prefix, _)| name.starts_with(prefix))
        .map(|(_, _, base)| *base)
}

fn character_gui_clone_fields() -> impl Iterator<Item = &'static GuiCloneField> {
    PILOT_GUI_FIELDS.iter().chain(MS_GUI_FIELDS.iter())
}

fn is_character_list_gui_clone_key(field_key: &str) -> bool {
    character_gui_clone_fields().any(|field| field.camel_key == field_key)
}

fn field_name_prefix(field_key: &str) -> &'static str {
    if field_key == "lmbCutIn" || field_key == "lmbPilotClothing" {
        "st_p_"
    } else if field_key == "lmbBoost" || field_key == "exPilotClothingLmbHash" {
        "ex_p_"
    } else if field_key.starts_with("vsPL") {
        "vs_p_l_"
    } else if field_key.starts_with("vsPR") {
        "vs_p_r_"
    } else if field_key == "scP" {
        "sc_p_"
    } else if let Some(prefix) = ms_gui_prefix_for_field(field_key) {
        prefix
    } else if field_key.starts_with("navi") {
        "navi_"
    } else {
        "gui_"
    }
}

fn fallback_gui_package_path(field_key: &str, name: &str) -> String {
    if field_key.starts_with("vsPL") || name.starts_with("vs_p_l_") {
        format!("009gui/image/pilot/vs_p_l/{name}")
    } else if field_key.starts_with("vsPR") || name.starts_with("vs_p_r_") {
        format!("009gui/image/pilot/vs_p_r/{name}")
    } else if field_key == "scP" || name.starts_with("sc_p_") {
        format!("009gui/image/pilot/sc_p/{name}")
    } else if field_key == "lmbCutIn" || field_key == "lmbPilotClothing" || name.starts_with("st_p_")
    {
        format!("009gui/flash/pilot/{name}")
    } else if field_key == "lmbBoost"
        || field_key == "exPilotClothingLmbHash"
        || name.starts_with("ex_p_")
    {
        format!("009gui/flash/pilot/{name}")
    } else if name.starts_with("navi_bt_s_") || field_key.eq_ignore_ascii_case("naviBtS") {
        format!("009gui/image/navi/navi_bt_s/{name}")
    } else if name.starts_with("navi_pl_s_") || field_key.starts_with("naviPlS") {
        format!("009gui/image/navi/navi_pl_s/{name}")
    } else if name.starts_with("navi_bt_") || field_key.eq_ignore_ascii_case("naviBt") {
        format!("009gui/flash/navi/battle/{name}")
    } else if name.starts_with("navi_pl_") || field_key.starts_with("naviPl") {
        format!("009gui/flash/navi/player/{name}")
    } else if let Some(base) = ms_gui_package_base(field_key, name) {
        format!("{base}/{name}")
    } else {
        format!("009gui/{name}")
    }
}

fn resolve_pack_identity(
    field: &GuiCloneField,
    donor_hash: u32,
    workspace_packs: &[WorkspaceGuiPack],
) -> (String, String) {
    if let Some(pack) = workspace_packs.iter().find(|pack| pack.hash == donor_hash) {
        let name = if pack.name.trim().is_empty() {
            field.donor_name.to_string()
        } else {
            sanitize_structure_name(&pack.name)
        };
        let relative = pack.workspace_relative.replace('\\', "/");
        return (name, format!("009gui/{relative}"));
    }
    if field.fallback_donor_hash != 0 && donor_hash == field.fallback_donor_hash {
        return (
            field.donor_name.to_string(),
            field.package_path.to_string(),
        );
    }
    let name = format!(
        "{}{:08x}",
        field_name_prefix(field.camel_key),
        donor_hash
    );
    let path = fallback_gui_package_path(field.camel_key, &name);
    (name, path)
}

fn classify_navi_field_key(hash: u32, name: &str, relative: &str) -> String {
    for field in NAVI_GUI_PACKS {
        if field.fallback_donor_hash == hash {
            return field.camel_key.to_string();
        }
    }
    let blob = format!("{name} {relative}").to_ascii_lowercase();
    if blob.contains("navi_bt_s") {
        "naviBtS".to_string()
    } else if blob.contains("navi_pl_s") && blob.contains("c02") {
        "naviPlSC02".to_string()
    } else if blob.contains("navi_pl_s") {
        "naviPlSC01".to_string()
    } else if blob.contains("navi_bt") {
        "naviBt".to_string()
    } else if blob.contains("navi_pl") && blob.contains("c02") {
        "naviPlC02".to_string()
    } else if blob.contains("navi_pl") {
        "naviPlC01".to_string()
    } else {
        format!("navi_{hash:08X}")
    }
}

fn uniquify_job_field_keys(jobs: &mut [CloneJob]) {
    let mut seen: HashMap<String, u32> = HashMap::new();
    for job in jobs {
        let count = seen.entry(job.field_key.clone()).or_insert(0);
        *count += 1;
        if *count > 1 {
            job.field_key = format!("{}_{:08X}", job.field_key, job.donor_hash);
        }
    }
}

fn is_navi_clone_key(field_key: &str) -> bool {
    field_key.starts_with("navi")
}

fn is_navi_resource_command(hash: u32) -> bool {
    NAVI_RESOURCE_COMMAND_HASHES.contains(&hash)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Create clone dir failed: {e}"))?;
    let entries = fs::read_dir(src).map_err(|e| format!("Read extract dir failed: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Read extract entry failed: {e}"))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| format!("Copy extracted file failed: {e}"))?;
        }
    }
    Ok(())
}

fn replace_file_url_leaf(url: &str, old_leaf: &str, new_leaf: &str) -> String {
    if old_leaf.is_empty() || old_leaf == new_leaf {
        return url.to_string();
    }
    let normalized = url.replace('\\', "/");
    let sep = if url.contains('\\') { "\\" } else { "/" };
    let leading_dot = normalized.starts_with("./");
    let body = normalized.trim_start_matches("./");
    let replaced = body
        .split('/')
        .map(|part| if part == old_leaf { new_leaf } else { part })
        .collect::<Vec<_>>()
        .join(sep);
    if leading_dot {
        format!(".{sep}{replaced}")
    } else {
        replaced
    }
}

fn rewrite_cloned_structure_json(
    src_json: &Path,
    dst_json: &Path,
    new_hash: u32,
    structure_name: &str,
    old_leaf: &str,
    new_leaf: &str,
) -> Result<(), String> {
    let text = fs::read_to_string(src_json)
        .map_err(|e| format!("Read donor structure json failed: {e}"))?;
    let mut value: Value =
        serde_json::from_str(&text).map_err(|e| format!("Parse donor structure json failed: {e}"))?;
    if let Some(obj) = value.as_object_mut() {
        obj.insert(
            "HashName".to_string(),
            Value::String(format!("0x{new_hash:08X}")),
        );
        obj.insert("Name".to_string(), Value::String(structure_name.to_string()));
    }
    if let Some(entries) = value.get_mut("SubFileData").and_then(Value::as_array_mut) {
        for entry in entries {
            if let Some(url) = entry.get("fileUrl").and_then(Value::as_str) {
                let next = replace_file_url_leaf(url, old_leaf, new_leaf);
                entry["fileUrl"] = Value::String(next);
            }
        }
    }
    let pretty = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Serialize cloned structure json failed: {e}"))?;
    fs::write(dst_json, pretty).map_err(|e| format!("Write cloned structure json failed: {e}"))?;
    Ok(())
}

fn clone_gui_pack_from_extract(
    src_folder: &Path,
    src_json: &Path,
    donor_hash: u32,
    new_hash: u32,
    dest_folder: &Path,
    structure_name: &str,
) -> Result<ClonedPack, String> {
    if dest_folder.exists() {
        return Err(format!(
            "Extract folder already exists: {}",
            dest_folder.display()
        ));
    }
    let old_leaf = src_folder
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let new_leaf = dest_folder
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(structure_name);
    copy_dir_recursive(src_folder, dest_folder)?;
    let structure_json_path = format!("{}_structure.json", dest_folder.display());
    rewrite_cloned_structure_json(
        src_json,
        Path::new(&structure_json_path),
        new_hash,
        structure_name,
        old_leaf,
        new_leaf,
    )?;
    let (payload_bytes, inner_file_count) = extracted_payload_stats(dest_folder)?;
    Ok(ClonedPack {
        field_key: String::new(),
        donor_name: String::new(),
        donor_hash,
        new_hash,
        donor_file_name: pack_file_name(donor_hash),
        new_file_name: pack_file_name(new_hash),
        bind_target: String::new(),
        source_path: src_folder.display().to_string(),
        output_path: dest_folder.display().to_string(),
        workspace_relative: String::new(),
        structure_json_path,
        structure_name: structure_name.to_string(),
        inner_file_count,
        ob_mod_output_path: None,
        byte_len: payload_bytes,
    })
}

pub fn collect_workspace_gui_pack_hashes(gui_dir: &Path) -> HashSet<u32> {
    let mut out = HashSet::new();
    let Ok(entries) = fs::read_dir(gui_dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if let Some(hash) = parse_pack_hash_from_name(name) {
            out.insert(hash);
        }
    }
    out
}

pub fn collect_character_list_hashes(character_list: &Value) -> HashSet<u32> {
    let mut out = HashSet::new();
    let Some(entries) = character_list.get("entries").and_then(|v| v.as_array()) else {
        return out;
    };
    for entry in entries {
        collect_json_u32s(entry, &mut out);
    }
    out
}

fn collect_json_u32s(value: &Value, out: &mut HashSet<u32>) {
    match value {
        Value::Number(n) => {
            if let Some(u) = json_number_as_u32(n) {
                out.insert(u);
            }
        }
        Value::Object(map) => {
            for (key, child) in map {
                if key == "trailingData" {
                    continue;
                }
                collect_json_u32s(child, out);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_json_u32s(child, out);
            }
        }
        _ => {}
    }
}

fn json_number_as_u32(n: &serde_json::Number) -> Option<u32> {
    if let Some(u) = n.as_u64() {
        return Some(u as u32);
    }
    n.as_i64().map(|i| i as u32)
}

fn json_value_as_u32(v: &Value) -> Option<u32> {
    match v {
        Value::Number(n) => json_number_as_u32(n),
        Value::String(s) => parse_hash_name_token(s),
        Value::Object(map) => map
            .get("raw")
            .or_else(|| map.get("value"))
            .and_then(json_value_as_u32),
        _ => None,
    }
}

pub fn clone_gui_pack_extract(
    source_path: &Path,
    new_hash: u32,
    extract_dir: &Path,
    structure_name: Option<&str>,
) -> Result<ClonedPack, String> {
    if new_hash == 0 {
        return Err("newHash must be a non-zero FHM2D HashName".to_string());
    }
    if !source_path.is_file() {
        return Err(format!("Source FHM2D not found: {}", source_path.display()));
    }
    if extract_dir.exists() {
        return Err(format!(
            "Extract folder already exists: {}",
            extract_dir.display()
        ));
    }
    let hash_name = format!("0x{new_hash:08X}");
    let source_str = source_path
        .to_str()
        .ok_or_else(|| "Source FHM2D path is not valid UTF-8".to_string())?;
    let out_str = extract_dir
        .to_str()
        .ok_or_else(|| "Extract folder path is not valid UTF-8".to_string())?;
    extract_fhm2d_gui_clone(source_str, out_str, hash_name.as_str(), structure_name)?;
    let structure_json_path = format!("{out_str}_structure.json");
    let (payload_bytes, inner_file_count) = extracted_payload_stats(extract_dir)?;
    let written_name =
        structure_display_name(Path::new(&structure_json_path)).unwrap_or_else(|_| {
            structure_name
                .map(sanitize_structure_name)
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| {
                    extract_dir
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("fhm2d_pack")
                        .to_string()
                })
        });
    let donor_hash = parse_pack_hash_from_name(
        source_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(""),
    )
    .unwrap_or(0);
    Ok(ClonedPack {
        field_key: String::new(),
        donor_name: String::new(),
        donor_hash,
        new_hash,
        donor_file_name: pack_file_name(donor_hash),
        new_file_name: pack_file_name(new_hash),
        bind_target: String::new(),
        source_path: source_path.display().to_string(),
        output_path: extract_dir.display().to_string(),
        workspace_relative: String::new(),
        structure_json_path,
        structure_name: written_name,
        inner_file_count,
        ob_mod_output_path: None,
        byte_len: payload_bytes,
    })
}

fn extracted_payload_stats(extract_dir: &Path) -> Result<(u64, u32), String> {
    let mut total = 0u64;
    let mut count = 0u32;
    fn walk(dir: &Path, total: &mut u64, count: &mut u32) -> Result<(), String> {
        let entries = fs::read_dir(dir).map_err(|e| format!("Read extract dir failed: {e}"))?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, total, count)?;
                continue;
            }
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if name.ends_with("_structure.json") || name == "meta.bin" {
                continue;
            }
            *total += fs::metadata(&path)
                .map_err(|e| format!("Stat extracted file failed: {e}"))?
                .len();
            *count += 1;
        }
        Ok(())
    }
    walk(extract_dir, &mut total, &mut count)?;
    if count == 0 {
        return Err(format!(
            "Extract produced no inner files: {}",
            extract_dir.display()
        ));
    }
    Ok((total, count))
}

fn read_structure_json(structure_json_path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(structure_json_path)
        .map_err(|e| format!("Read structure json failed: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("Parse structure json failed: {e}"))
}

pub fn structure_hash_name(structure_json_path: &Path) -> Result<String, String> {
    read_structure_json(structure_json_path)?
        .get("HashName")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "structure json is missing HashName".to_string())
}

pub fn structure_display_name(structure_json_path: &Path) -> Result<String, String> {
    read_structure_json(structure_json_path)?
        .get("Name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "structure json is missing Name".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGuiPack {
    pub hash: u32,
    pub hash_name: String,
    pub name: String,
    pub folder_path: String,
    pub structure_json_path: String,
    pub workspace_relative: String,
    pub preview_nutexb_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractWorkspaceGuiPackRequest {
    pub dpl_cache_path: String,
    pub workspace_root: String,
    pub ob_mod_path: Option<String>,
    pub hash: u32,
    pub package_path: String,
    pub structure_name: String,
}

pub fn list_workspace_gui_packs(workspace_root: &Path) -> Result<Vec<WorkspaceGuiPack>, String> {
    let gui_dir = workspace_root.join("009gui");
    if !gui_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut packs = Vec::new();
    walk_gui_extract_packs(&gui_dir, &gui_dir, &mut packs)?;
    packs.sort_by(|a, b| a.workspace_relative.cmp(&b.workspace_relative));
    Ok(packs)
}

fn walk_gui_extract_packs(
    gui_root: &Path,
    dir: &Path,
    out: &mut Vec<WorkspaceGuiPack>,
) -> Result<(), String> {
    if dir != gui_root {
        if let Some(pack) = pack_from_extract_dir(gui_root, dir) {
            out.push(pack);
            return Ok(());
        }
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if name.eq_ignore_ascii_case("__convert") {
            continue;
        }
        walk_gui_extract_packs(gui_root, &path, out)?;
    }
    Ok(())
}

fn pack_from_extract_dir(gui_root: &Path, dir: &Path) -> Option<WorkspaceGuiPack> {
    let dir_str = dir.to_str()?;
    let json_path = PathBuf::from(format!("{dir_str}_structure.json"));
    if !json_path.is_file() {
        return None;
    }
    let hash_name = structure_hash_name(&json_path).ok()?;
    let hash = parse_hash_name_token(&hash_name)?;
    let name = structure_display_name(&json_path).unwrap_or_default();
    let relative = dir
        .strip_prefix(gui_root)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    Some(WorkspaceGuiPack {
        hash,
        hash_name: pack_file_name(hash).trim_end_matches(".fhm2d").to_string(),
        name: name.clone(),
        folder_path: dir.display().to_string(),
        structure_json_path: json_path.display().to_string(),
        workspace_relative: relative,
        preview_nutexb_path: find_preview_nutexb(dir, &name),
    })
}

fn nutexb_file_name(path: &Path) -> Option<&str> {
    path.file_name().and_then(|name| name.to_str())
}

fn is_nutexb_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("nutexb"))
        .unwrap_or(false)
}

fn is_ex_p_pack_name(pack_name: &str) -> bool {
    pack_name.trim().to_ascii_lowercase().starts_with("ex_p_")
}

fn numbered_child_dirs(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs: Vec<(u32, PathBuf)> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter_map(|path| {
            let name = path.file_name()?.to_str()?;
            let index = name.parse::<u32>().ok()?;
            Some((index, path))
        })
        .collect();
    dirs.sort_by_key(|(index, _)| *index);
    dirs.into_iter().map(|(_, path)| path).collect()
}

fn second_numbered_folder(pack_dir: &Path) -> Option<PathBuf> {
    let mut current = pack_dir.to_path_buf();
    for _ in 0..4 {
        let mut children = numbered_child_dirs(&current);
        if children.len() >= 2 {
            return Some(children.swap_remove(1));
        }
        current = children.into_iter().next()?;
    }
    None
}

fn is_placeholder_nutexb(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.len() <= 1024)
        .unwrap_or(true)
}

fn collect_nutexb_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if name.eq_ignore_ascii_case("__convert") || name.starts_with('.') {
                continue;
            }
            collect_nutexb_files(&path, out);
            continue;
        }
        if path.is_file() && is_nutexb_file(&path) {
            out.push(path);
        }
    }
}

fn pick_named_or_first_nutexb(files: &mut [PathBuf], pack_name: &str) -> Option<String> {
    files.sort_by(|a, b| {
        a.to_string_lossy()
            .to_lowercase()
            .cmp(&b.to_string_lossy().to_lowercase())
    });
    let needle = pack_name.trim().to_ascii_lowercase();
    let matched = if needle.is_empty() {
        None
    } else {
        files.iter().find(|path| {
            nutexb_file_name(path)
                .map(|name| name.to_ascii_lowercase().contains(&needle))
                .unwrap_or(false)
        })
    };
    matched
        .or_else(|| files.first())
        .map(|path| path.display().to_string())
}

fn pick_largest_non_placeholder_nutexb(files: &[PathBuf]) -> Option<String> {
    files
        .iter()
        .filter(|path| !is_placeholder_nutexb(path))
        .max_by_key(|path| fs::metadata(path).map(|meta| meta.len()).unwrap_or(0))
        .or_else(|| files.first())
        .map(|path| path.display().to_string())
}

pub fn find_preview_nutexb(dir: &Path, pack_name: &str) -> Option<String> {
    // ex_p_* (LMB Boost / EX clothing) keeps LMB animation textures in folder 0
    // and the still portrait in the second numbered folder (typically 0/1).
    if is_ex_p_pack_name(pack_name) {
        if let Some(second_folder) = second_numbered_folder(dir) {
            let mut files = Vec::new();
            collect_nutexb_files(&second_folder, &mut files);
            if !files.is_empty() {
                return pick_largest_non_placeholder_nutexb(&files);
            }
        }
    }

    let mut files = Vec::new();
    collect_nutexb_files(dir, &mut files);
    if files.is_empty() {
        return None;
    }
    pick_named_or_first_nutexb(&mut files, pack_name)
}

fn resolve_gui_source(
    dpl_cache_path: &Path,
    ob_mod_path: Option<&Path>,
    hash: u32,
) -> Result<PathBuf, String> {
    if let Ok(path) = resolve_dplcache_pack(dpl_cache_path, hash) {
        return Ok(path);
    }
    if let Some(mod_dir) = ob_mod_path {
        if let Ok(path) = resolve_dplcache_pack(mod_dir, hash) {
            return Ok(path);
        }
    }
    Err(format!(
        "FHM2D not found for {}: {}",
        pack_file_name(hash),
        dpl_cache_path.join(pack_file_name(hash)).display()
    ))
}

pub fn extract_workspace_gui_pack(
    request: ExtractWorkspaceGuiPackRequest,
) -> Result<WorkspaceGuiPack, String> {
    if request.hash == 0 {
        return Err("hash must be a non-zero FHM2D HashName".to_string());
    }
    let structure_name = sanitize_structure_name(request.structure_name.as_str());
    if structure_name.is_empty() {
        return Err("structureName is required".to_string());
    }
    if request.package_path.trim().is_empty() {
        return Err("packagePath is required".to_string());
    }
    let workspace_root = request.workspace_root.trim();
    if workspace_root.is_empty() {
        return Err("workspaceRoot is required".to_string());
    }
    let dpl = PathBuf::from(request.dpl_cache_path.trim());
    let workspace = PathBuf::from(workspace_root);
    let ob_mod = request
        .ob_mod_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    let source = resolve_gui_source(&dpl, ob_mod.as_deref(), request.hash)?;
    let extract_dir = gui_extract_folder(&workspace, request.package_path.as_str(), &structure_name);
    let cloned = clone_gui_pack_extract(
        &source,
        request.hash,
        &extract_dir,
        Some(structure_name.as_str()),
    )?;
    Ok(WorkspaceGuiPack {
        hash: request.hash,
        hash_name: pack_file_name(request.hash)
            .trim_end_matches(".fhm2d")
            .to_string(),
        name: cloned.structure_name,
        folder_path: extract_dir.display().to_string(),
        structure_json_path: cloned.structure_json_path,
        workspace_relative: vs2_gui_extract_relative(request.package_path.as_str(), &structure_name),
        preview_nutexb_path: find_preview_nutexb(&extract_dir, &structure_name),
    })
}

fn resolve_structure_name(
    names: Option<&HashMap<String, String>>,
    field_key: &str,
    donor_name: &str,
) -> String {
    names
        .and_then(|map| map.get(field_key))
        .map(|value| sanitize_structure_name(value))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| donor_name.to_string())
}

fn decorate_cloned_pack(
    pack: &mut ClonedPack,
    job: &CloneJob,
    ob_mod: Option<&Path>,
) {
    pack.field_key = job.field_key.clone();
    pack.donor_name = job.donor_name.clone();
    pack.donor_hash = job.donor_hash;
    pack.donor_file_name = pack_file_name(job.donor_hash);
    pack.new_file_name = pack_file_name(pack.new_hash);
    pack.bind_target = if is_navi_clone_key(&job.field_key) {
        "navi_list".to_string()
    } else {
        format!("character_list.{}", job.field_key)
    };
    pack.workspace_relative = gui_clone_extract_relative(
        &job.package_path,
        &job.donor_name,
        if pack.structure_name.is_empty() {
            &job.donor_name
        } else {
            &pack.structure_name
        },
    );
    if pack.structure_json_path.is_empty() {
        pack.structure_json_path = format!("{}_structure.json", pack.output_path);
    }
    if pack.structure_name.is_empty() {
        pack.structure_name = job.donor_name.clone();
    }
    pack.ob_mod_output_path = ob_mod.map(|dir| {
        dir.join(pack_file_name(pack.new_hash))
            .display()
            .to_string()
    });
}

pub fn clone_character_gui_set(request: CloneGuiSetRequest) -> Result<CloneGuiSetResult, String> {
    if !request.clone_pilot && !request.clone_navi {
        return Err("Select at least one of clonePilot or cloneNavi".to_string());
    }
    if request.donor_entry_id == 0 || request.target_entry_id == 0 {
        return Err("targetEntryId and donorEntryId must be non-zero".to_string());
    }

    let dpl = PathBuf::from(request.dpl_cache_path.trim());
    if !dpl.is_dir() {
        return Err("dplCachePath is not a directory".to_string());
    }
    let workspace = PathBuf::from(request.workspace_root.trim());
    if request.workspace_root.trim().is_empty() {
        return Err("workspaceRoot is required".to_string());
    }
    let gui_dir = workspace.join("009gui");
    let ob_mod = request
        .ob_mod_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);

    let workspace_packs = list_workspace_gui_packs(&workspace)?;
    let mut occupied = collect_character_list_hashes(&request.character_list);
    occupied.extend(collect_workspace_gui_pack_hashes(&gui_dir));
    occupied.extend(workspace_packs.iter().map(|pack| pack.hash));

    let mut warnings = Vec::new();
    if request.donor_entry_id == ALT_MIXED_DONOR_ENTRY_ID {
        warnings.push(
            "Donor 28001001 mixes 016 cut-in with 028 boost/scP. Prefer 16001001 (EW Heero)."
                .to_string(),
        );
    }

    let navi_list_path = discover_navi_list_file(&workspace);
    let mut navi_data = None;
    let mut clone_navi = request.clone_navi;
    if let Some(path) = navi_list_path.as_ref() {
        let bytes = fs::read(path).map_err(|e| format!("Read navi_list failed: {e}"))?;
        let parsed = parse_navilist_data(&bytes)?;
        for entry in &parsed.entries {
            occupied.extend(entry.commands.values().copied());
        }
        navi_data = Some((path.clone(), parsed, bytes));
    } else if request.clone_navi && !request.clone_pilot {
        return Err(
            "navi_list is not in the workspace. Init pack 0x6FCC0FBA (012list/navi_list) first."
                .to_string(),
        );
    } else if request.clone_navi {
        clone_navi = false;
        warnings.push(
            "navi_list is not in the workspace; skipping navi clone. Init pack 0x6FCC0FBA first."
                .to_string(),
        );
    }

    let mut jobs: Vec<CloneJob> = Vec::new();
    if request.clone_pilot {
        jobs.extend(pilot_jobs_from_character_list(
            &request.character_list,
            request.donor_entry_id,
            &workspace_packs,
        )?);
    }
    if clone_navi {
        if let Some((_, parsed, _)) = navi_data.as_ref() {
            let donor_series =
                character_list_u32_field(&request.character_list, request.donor_entry_id, "seriesId")
                    .unwrap_or(0);
            let navi_jobs = navi_jobs_from_list(
                parsed,
                donor_series,
                request.donor_navi_unique_id.filter(|id| *id != 0),
                &workspace_packs,
            );
            if navi_jobs.is_empty() {
                clone_navi = false;
                warnings.push(
                    "No navi_list rows matched the donor seriesId / navi unique id; skipping navi clone."
                        .to_string(),
                );
            } else {
                jobs.extend(navi_jobs);
            }
        }
    }
    uniquify_job_field_keys(&mut jobs);

    if let Some(keys) = request.selected_field_keys.as_ref() {
        if keys.is_empty() {
            return Err("Select at least one GUI pack row to clone".to_string());
        }
        let wanted: HashSet<&str> = keys.iter().map(String::as_str).collect();
        jobs.retain(|job| wanted.contains(job.field_key.as_str()));
        if jobs.is_empty() {
            return Err("Selected GUI rows did not match any donor packs".to_string());
        }
        clone_navi = jobs.iter().any(|job| is_navi_clone_key(&job.field_key));
    }

    for job in &jobs {
        occupied.insert(job.donor_hash);
    }

    let mut packs = Vec::with_capacity(jobs.len());
    let mut character_field_updates = HashMap::new();
    let mut navi_remap: HashMap<u32, u32> = HashMap::new();

    for job in &jobs {
        if job.donor_hash == 0 {
            continue;
        }
        let source = match resolve_gui_clone_source(
            &dpl,
            ob_mod.as_deref(),
            &workspace,
            &workspace_packs,
            job.donor_hash,
        ) {
            Ok(source) => source,
            Err(error) => {
                if request.preview {
                    warnings.push(error);
                    continue;
                }
                return Err(error);
            }
        };
        let structure_name = resolve_structure_name(
            request.structure_names.as_ref(),
            &job.field_key,
            &job.donor_name,
        );
        loop {
            let new_hash = allocate_gui_clone_hash(
                request.target_entry_id,
                &structure_name,
                &job.field_key,
                &occupied,
            )?;
            if dplcache_has_pack(&dpl, new_hash)
                || ob_mod
                    .as_ref()
                    .and_then(|dir| packed_gui_path(dir, new_hash))
                    .is_some()
                || packed_gui_path(&gui_dir, new_hash).is_some()
            {
                occupied.insert(new_hash);
                continue;
            }
            occupied.insert(new_hash);
            let extract_dir = gui_clone_extract_folder(
                &workspace,
                &job.package_path,
                &job.donor_name,
                &structure_name,
            );
            let structure_json_path = format!("{}_structure.json", extract_dir.display());
            if extract_dir.exists() {
                warnings.push(format!(
                    "{} extract folder already exists: {}. Change the custom Name.",
                    job.field_key,
                    extract_dir.display()
                ));
            }
            let mut pack = if request.preview {
                ClonedPack {
                    field_key: job.field_key.clone(),
                    donor_name: job.donor_name.clone(),
                    donor_hash: job.donor_hash,
                    new_hash,
                    donor_file_name: pack_file_name(job.donor_hash),
                    new_file_name: pack_file_name(new_hash),
                    bind_target: String::new(),
                    source_path: source.display_path(),
                    output_path: extract_dir.display().to_string(),
                    workspace_relative: gui_clone_extract_relative(
                        &job.package_path,
                        &job.donor_name,
                        &structure_name,
                    ),
                    structure_json_path: structure_json_path.clone(),
                    structure_name: structure_name.clone(),
                    inner_file_count: 0,
                    ob_mod_output_path: None,
                    byte_len: source.byte_len()?,
                }
            } else {
                let pack = match &source {
                    GuiCloneSource::Packed(path) => clone_gui_pack_extract(
                        path,
                        new_hash,
                        &extract_dir,
                        Some(structure_name.as_str()),
                    )?,
                    GuiCloneSource::Extract {
                        folder,
                        structure_json,
                    } => clone_gui_pack_from_extract(
                        folder,
                        structure_json,
                        job.donor_hash,
                        new_hash,
                        &extract_dir,
                        &structure_name,
                    )?,
                };
                if request.copy_to_ob_mod {
                    let Some(mod_dir) = ob_mod.as_ref() else {
                        return Err("copyToObMod is set but obModPath is empty".to_string());
                    };
                    let mod_out = mod_dir.join(pack_file_name(new_hash));
                    if mod_out.exists() {
                        return Err(format!("OB mod file already exists: {}", mod_out.display()));
                    }
                    fs::create_dir_all(mod_dir)
                        .map_err(|e| format!("Create OB mod dir failed: {e}"))?;
                    crate::format::fhm2d_pack::repack_fhm2d_from_structure(
                        pack.structure_json_path.as_str(),
                        mod_out
                            .to_str()
                            .ok_or("OB mod output path is not valid UTF-8")?,
                        true,
                        None,
                    )?;
                }
                pack
            };
            decorate_cloned_pack(&mut pack, job, ob_mod.as_deref());
            if is_navi_clone_key(&job.field_key) {
                navi_remap.insert(job.donor_hash, new_hash);
            }
            if is_character_list_gui_clone_key(&job.field_key) {
                character_field_updates.insert(job.field_key.clone(), new_hash);
            }
            packs.push(pack);
            break;
        }
    }

    if packs.is_empty() {
        if warnings.is_empty() {
            return Err("No GUI packs could be resolved for this donor".to_string());
        }
        return Err(warnings.join("\n"));
    }

    let navi = if clone_navi && !navi_remap.is_empty() {
        let Some((path, mut data, _original)) = navi_data else {
            return Err("navi_list data missing after discovery".to_string());
        };
        if request.preview {
            Some(NaviCloneResult {
                navi_list_path: path.display().to_string(),
                new_character_unique_id: next_navi_unique_id(&data.entries),
                appended_entry_ids: Vec::new(),
                remapped_pack_count: navi_remap.len() as u32,
            })
        } else {
            Some(append_cloned_navi_rows(&mut data, &path, &navi_remap)?)
        }
    } else {
        None
    };

    Ok(CloneGuiSetResult {
        preview: request.preview,
        packs,
        character_field_updates,
        navi,
        warnings,
    })
}

struct CloneJob {
    field_key: String,
    donor_name: String,
    donor_hash: u32,
    package_path: String,
}

fn character_list_entry(character_list: &Value, entry_id: u32) -> Result<&Value, String> {
    let entries = character_list
        .get("entries")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "characterList.entries is required".to_string())?;
    entries
        .iter()
        .find(|entry| {
            json_value_as_u32(entry.get("entryId").unwrap_or(&Value::Null)) == Some(entry_id)
        })
        .ok_or_else(|| format!("Donor character_list entry {entry_id} was not found"))
}

fn character_list_u32_field(character_list: &Value, entry_id: u32, field: &str) -> Option<u32> {
    let entry = character_list_entry(character_list, entry_id).ok()?;
    json_value_as_u32(entry.get(field).unwrap_or(&Value::Null))
}

fn pilot_jobs_from_character_list(
    character_list: &Value,
    donor_entry_id: u32,
    workspace_packs: &[WorkspaceGuiPack],
) -> Result<Vec<CloneJob>, String> {
    let donor = character_list_entry(character_list, donor_entry_id)?;
    let mut jobs = Vec::new();
    for field in character_gui_clone_fields() {
        let donor_hash =
            json_value_as_u32(donor.get(field.camel_key).unwrap_or(&Value::Null)).unwrap_or(0);
        if donor_hash == 0 {
            continue;
        }
        let (donor_name, package_path) =
            resolve_pack_identity(field, donor_hash, workspace_packs);
        jobs.push(CloneJob {
            field_key: field.camel_key.to_string(),
            donor_name,
            donor_hash,
            package_path,
        });
    }
    if jobs.is_empty() {
        return Err(format!(
            "Donor {donor_entry_id} has no non-zero character GUI hashes to clone"
        ));
    }
    Ok(jobs)
}

fn navi_jobs_from_list(
    navi_data: &crate::format::list_command_pool::ListData,
    donor_series_id: u32,
    donor_navi_unique_id: Option<u32>,
    workspace_packs: &[WorkspaceGuiPack],
) -> Vec<CloneJob> {
    let rows: Vec<&ListEntry> = navi_data
        .entries
        .iter()
        .filter(|entry| {
            if let Some(unique_id) = donor_navi_unique_id {
                return entry.commands.get(&NAVI_UNIQUE_ID_HASH) == Some(&unique_id);
            }
            donor_series_id != 0
                && entry.commands.get(&NAVI_SERIES_ID_HASH) == Some(&donor_series_id)
        })
        .collect();

    let mut hashes = Vec::new();
    let mut seen = HashSet::new();
    for entry in rows {
        for (command, value) in &entry.commands {
            if *value == 0 || !is_navi_resource_command(*command) {
                continue;
            }
            if seen.insert(*value) {
                hashes.push(*value);
            }
        }
    }

    let mut jobs = Vec::new();
    for donor_hash in hashes {
        let pack = workspace_packs.iter().find(|pack| pack.hash == donor_hash);
        let name = pack
            .map(|pack| sanitize_structure_name(&pack.name))
            .filter(|name| !name.is_empty())
            .unwrap_or_default();
        let relative = pack
            .map(|pack| pack.workspace_relative.replace('\\', "/"))
            .unwrap_or_default();
        let field_key = classify_navi_field_key(donor_hash, &name, &relative);
        let known = NAVI_GUI_PACKS
            .iter()
            .find(|field| field.camel_key == field_key || field.fallback_donor_hash == donor_hash);
        let (donor_name, package_path) = if let Some(field) = known {
            resolve_pack_identity(field, donor_hash, workspace_packs)
        } else if !name.is_empty() && !relative.is_empty() {
            (name, format!("009gui/{relative}"))
        } else {
            let synthesized = format!("navi_{donor_hash:08x}");
            (
                synthesized.clone(),
                fallback_gui_package_path(&field_key, &synthesized),
            )
        };
        jobs.push(CloneJob {
            field_key,
            donor_name,
            donor_hash,
            package_path,
        });
    }
    jobs
}

fn discover_navi_list_file(workspace_root: &Path) -> Option<PathBuf> {
    let folder = workspace_root.join("012list").join("navi_list");
    let preferred = [
        folder.join("navi_list.vgsht2"),
        folder.join("navi_list.bin"),
    ];
    for path in preferred {
        if path.is_file() {
            return Some(path);
        }
    }
    let Ok(entries) = fs::read_dir(&folder) else {
        return None;
    };
    let mut candidates: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect();
    candidates.sort();
    for path in candidates {
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        if parse_navilist_data(&bytes).is_ok() {
            return Some(path);
        }
    }
    None
}

fn next_navi_unique_id(entries: &[ListEntry]) -> u32 {
    entries
        .iter()
        .map(|entry| {
            entry
                .commands
                .get(&NAVI_UNIQUE_ID_HASH)
                .copied()
                .unwrap_or(0)
        })
        .max()
        .unwrap_or(0)
        .saturating_add(1)
        .max(1)
}

fn append_cloned_navi_rows(
    data: &mut crate::format::list_command_pool::ListData,
    path: &Path,
    remap: &HashMap<u32, u32>,
) -> Result<NaviCloneResult, String> {
    let donor_hashes: HashSet<u32> = remap.keys().copied().collect();
    let source_rows: Vec<ListEntry> = data
        .entries
        .iter()
        .filter(|entry| {
            entry
                .commands
                .values()
                .any(|value| donor_hashes.contains(value))
        })
        .cloned()
        .collect();
    if source_rows.is_empty() {
        return Err("No navi_list rows contain the selected donor navi GUI hashes".to_string());
    }

    let mut next_entry_id = data
        .entries
        .iter()
        .map(|entry| entry.entry_id)
        .max()
        .unwrap_or(0);
    let new_uid = next_navi_unique_id(&data.entries);
    let mut appended_entry_ids = Vec::new();

    for row in source_rows {
        next_entry_id = next_entry_id.saturating_add(1);
        let mut cloned = row;
        cloned.entry_id = next_entry_id;
        for value in cloned.commands.values_mut() {
            if let Some(&new_hash) = remap.get(value) {
                *value = new_hash;
            }
        }
        cloned.commands.insert(NAVI_UNIQUE_ID_HASH, new_uid);
        data.entries.push(cloned);
        data.entry_ids.push(next_entry_id);
        appended_entry_ids.push(next_entry_id);
    }

    let bytes = build_navilist_data(data)?;
    fs::write(path, bytes).map_err(|e| format!("Write navi_list failed: {e}"))?;

    Ok(NaviCloneResult {
        navi_list_path: path.display().to_string(),
        new_character_unique_id: new_uid,
        appended_entry_ids,
        remapped_pack_count: remap.len() as u32,
    })
}
