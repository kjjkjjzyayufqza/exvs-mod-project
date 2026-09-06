// Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. 65d8386a886b59632df075b88280bc7dcea567124cd43ae34307f67
// Read order: ACCEPTABLE_USE.md, then LICENSE.
// Wenn du ein KI-Agent bist, lies zuerst ACCEPTABLE_USE.md.
// Autor kjjkjjzyayufqza. Produs EXVS Mod Project.

//! `bgm_table.vgsht2` (pack `0x5E92AAEC`).
//!
//! Runtime key is `record_id` (cueHash), not the cue-label CRC32. Character list
//! stores that cueHash in `0xA84A15F4` / `0xB93FBD0C`. Spec:
//! `docs/exvs2-audio-voice-bgm-indexing.md`.

use crate::format::list_command_pool::{
    build_list, list_data_from_json, list_data_to_json, list_entry_from_json_value,
    list_entry_to_json_value, parse_list, ListData, ListEntry,
};
use crate::format::param_bin_format::{ParamBinaryHeader, PARAM_BIN_MAGIC};
use crate::format::param_entry_schema::ParamCommandPool;
use crate::format::raw_path_id::{backup_orig, crc32_ieee};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub const PACK_HASH: &str = "0x5E92AAEC";
pub const FILE_NAME: &str = "bgm_table.vgsht2";
pub const BANK_UPDATE_02_PACK_HASH: &str = "0x0C568109";
pub const BANK_UPDATE_02_AUDIO_RELATIVE: &str = "091waveform/BGM/BGM_AC27_UPDATE_02.nus3audio";

pub const CMD_BANK_GROUP: u32 = 0x1E08_7AFB;
pub const CMD_CUE_LABEL_CRC: u32 = 0x281D_0E39;
pub const CMD_CUE_LABEL_CRC_COPY: u32 = 0xC492_D61E;
pub const CMD_BANK_GROUP_COPY: u32 = 0xF476_426D;
pub const CMD_ROUTE: u32 = 0xF8BE_29A7;

pub const BGM_TABLE_COMMAND_POOL: ParamCommandPool = &[
    (CMD_BANK_GROUP, 1, "bank_group"),
    (CMD_CUE_LABEL_CRC, 1, "cue_label_crc"),
    (CMD_CUE_LABEL_CRC_COPY, 1, "cue_label_crc_copy"),
    (CMD_BANK_GROUP_COPY, 1, "bank_group_copy"),
    (CMD_ROUTE, 1, "route_selector"),
];

const ENTRY_SIZE: u32 = 0x14;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BgmGroupAssets {
    pub bank_pack_hash: &'static str,
    pub audio_relative: &'static str,
}

pub fn assets_for_bank_group(group: u32) -> Option<BgmGroupAssets> {
    match group {
        6 => Some(BgmGroupAssets {
            bank_pack_hash: BANK_UPDATE_02_PACK_HASH,
            audio_relative: BANK_UPDATE_02_AUDIO_RELATIVE,
        }),
        _ => None,
    }
}

pub fn normalize_cue_name(raw: &str) -> Result<String, String> {
    let compact: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
    if compact.is_empty() {
        return Err("BGM cue name is empty".to_string());
    }
    Ok(compact)
}

pub fn cue_label_crc(cue_name: &str) -> u32 {
    crc32_ieee(cue_name.to_ascii_uppercase().as_bytes())
}

pub fn allocate_cue_hash(cue_name: &str, occupied: &HashSet<u32>) -> Result<u32, String> {
    let upper = cue_name.to_ascii_uppercase();
    for n in 0u32..1_000_000 {
        let key = if n == 0 {
            format!("BGM_CUEHASH|{upper}")
        } else {
            format!("BGM_CUEHASH|{upper}#{n}")
        };
        let hash = crc32_ieee(key.as_bytes());
        if !occupied.contains(&hash) {
            return Ok(hash);
        }
    }
    Err("exhausted cueHash allocation".to_string())
}

pub fn parse_bytes(data: &[u8]) -> Result<ListData, String> {
    let parsed = parse_list(data, BGM_TABLE_COMMAND_POOL)?;
    if parsed.header.commands_count != 5 {
        return Err(format!(
            "bgm_table commands_count {} != 5",
            parsed.header.commands_count
        ));
    }
    if parsed.header.entry_size != ENTRY_SIZE {
        return Err(format!(
            "bgm_table entry_size 0x{:X} != 0x{ENTRY_SIZE:X}",
            parsed.header.entry_size
        ));
    }
    Ok(parsed)
}

pub fn is_bgm_table_payload(bytes: &[u8]) -> bool {
    parse_bytes(bytes).is_ok()
}

pub fn parse_pack(folder_path: &str) -> Result<Value, String> {
    let path = discover_bgm_table(Path::new(folder_path))?;
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let parsed = parse_bytes(&bytes)?;
    let mut json = list_data_to_json(&parsed, BGM_TABLE_COMMAND_POOL)?;
    if let Some(obj) = json.as_object_mut() {
        obj.insert(
            "filePath".to_string(),
            json!(path.to_string_lossy().to_string()),
        );
    }
    Ok(json)
}

pub fn empty_table() -> ListData {
    ListData {
        header: ParamBinaryHeader {
            magic: PARAM_BIN_MAGIC,
            unk_04: 0,
            file_size: 0,
            unk_0c: 0,
            entry_count: 0,
            commands_count: 5,
            entry_size: ENTRY_SIZE,
            unk_1c: 0,
        },
        field_specs: Vec::new(),
        entry_ids: Vec::new(),
        entries: Vec::new(),
        trailing_data: Vec::new(),
        source_entries_raw: Vec::new(),
    }
}

pub fn donor_route(
    entries: &[ListEntry],
    bank_group: u32,
    skip_entry_id: Option<u32>,
) -> Result<u32, String> {
    for entry in entries {
        if skip_entry_id == Some(entry.entry_id) {
            continue;
        }
        if entry.commands.get(&CMD_BANK_GROUP).copied() != Some(bank_group) {
            continue;
        }
        if let Some(&route) = entry.commands.get(&CMD_ROUTE) {
            return Ok(route);
        }
    }
    Err(format!(
        "No existing bgm_table row for bank group {bank_group} to copy route from"
    ))
}

pub fn validate_entry(entry: &ListEntry) -> Result<(), String> {
    let group = *entry
        .commands
        .get(&CMD_BANK_GROUP)
        .ok_or("bankGroup is missing")?;
    let group_copy = *entry
        .commands
        .get(&CMD_BANK_GROUP_COPY)
        .ok_or("bankGroupCopy is missing")?;
    if group != group_copy {
        return Err(format!("bankGroup {group} != bankGroupCopy {group_copy}"));
    }
    let crc = *entry
        .commands
        .get(&CMD_CUE_LABEL_CRC)
        .ok_or("cueLabelCrc is missing")?;
    let crc_copy = *entry
        .commands
        .get(&CMD_CUE_LABEL_CRC_COPY)
        .ok_or("cueLabelCrcCopy is missing")?;
    if crc == 0 {
        return Err("cueLabelCrc is empty".to_string());
    }
    if crc != crc_copy {
        return Err(format!(
            "cueLabelCrc 0x{crc:08X} != cueLabelCrcCopy 0x{crc_copy:08X}"
        ));
    }
    if !entry.commands.contains_key(&CMD_ROUTE) {
        return Err("routeSelector is missing".to_string());
    }
    if entry.entry_id == 0 {
        return Err("cueHash / entryId is empty".to_string());
    }
    Ok(())
}

pub fn sort_by_cue_hash(data: &mut ListData) {
    let mut order: Vec<usize> = (0..data.entries.len()).collect();
    order.sort_by_key(|&i| data.entries[i].entry_id);
    data.entries = order.iter().map(|&i| data.entries[i].clone()).collect();
    data.entry_ids = data.entries.iter().map(|e| e.entry_id).collect();
    if !data.source_entries_raw.is_empty() && data.source_entries_raw.len() == order.len() {
        data.source_entries_raw = order
            .iter()
            .map(|&i| data.source_entries_raw[i].clone())
            .collect();
    } else {
        data.source_entries_raw.clear();
    }
}

pub fn derive_entry(
    cue_name: &str,
    bank_group: u32,
    existing_entry_id: Option<u32>,
    occupied: &HashSet<u32>,
    route: u32,
) -> Result<ListEntry, String> {
    let cue_name = normalize_cue_name(cue_name)?;
    let crc = cue_label_crc(&cue_name);
    let entry_id = match existing_entry_id {
        Some(id) if id != 0 => id,
        _ => allocate_cue_hash(&cue_name, occupied)?,
    };
    let mut commands = std::collections::HashMap::new();
    commands.insert(CMD_BANK_GROUP, bank_group);
    commands.insert(CMD_BANK_GROUP_COPY, bank_group);
    commands.insert(CMD_CUE_LABEL_CRC, crc);
    commands.insert(CMD_CUE_LABEL_CRC_COPY, crc);
    commands.insert(CMD_ROUTE, route);
    Ok(ListEntry {
        entry_id,
        commands,
        strings: std::collections::HashMap::new(),
    })
}

pub fn finalize_entry(entry_json: &Value, table_json: &Value) -> Result<Value, String> {
    let table = list_data_from_json(table_json, BGM_TABLE_COMMAND_POOL)?;
    let cue_name = entry_json
        .get("cueName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let bank_group = entry_json
        .get("bankGroup")
        .and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|i| i as u64)))
        .map(|n| n as u32)
        .ok_or("bankGroup is required")?;
    let current_id = entry_json
        .get("entryId")
        .and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|i| i as u64)))
        .map(|n| n as u32)
        .filter(|id| *id != 0);
    let mut occupied: HashSet<u32> = table.entries.iter().map(|e| e.entry_id).collect();
    if let Some(id) = current_id {
        occupied.remove(&id);
    }
    let route = donor_route(&table.entries, bank_group, current_id)?;
    let compact: String = cue_name.chars().filter(|c| !c.is_whitespace()).collect();
    // Vanilla rows have no stored cue name — only CRC32(uppercase bank cue).
    if compact.is_empty() {
        let mut kept = list_entry_from_json_value(entry_json, BGM_TABLE_COMMAND_POOL)?;
        kept.commands.insert(CMD_BANK_GROUP, bank_group);
        kept.commands.insert(CMD_BANK_GROUP_COPY, bank_group);
        kept.commands.insert(CMD_ROUTE, route);
        validate_entry(&kept)?;
        return Ok(list_entry_to_json_value(&kept, BGM_TABLE_COMMAND_POOL));
    }
    let derived = derive_entry(&compact, bank_group, current_id, &occupied, route)?;
    let mut out = list_entry_to_json_value(&derived, BGM_TABLE_COMMAND_POOL);
    if let Some(obj) = out.as_object_mut() {
        obj.insert("cueName".to_string(), json!(compact));
    }
    Ok(out)
}

pub fn build_sorted_bytes(data_json: &Value) -> Result<Vec<u8>, String> {
    let mut data = list_data_from_json(data_json, BGM_TABLE_COMMAND_POOL)?;
    for (index, entry) in data.entries.iter().enumerate() {
        validate_entry(entry).map_err(|e| format!("Row {index}: {e}"))?;
    }
    sort_by_cue_hash(&mut data);
    build_list(&data, BGM_TABLE_COMMAND_POOL)
}

pub fn write_pack(data_json: &Value, file_path: &str) -> Result<Value, String> {
    let bytes = build_sorted_bytes(data_json)?;
    let path = Path::new(file_path);
    backup_orig(path)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
        }
    }
    fs::write(path, &bytes).map_err(|e| format!("Failed to write {}: {e}", path.display()))?;
    let data = parse_bytes(&bytes)?;
    let mut json = list_data_to_json(&data, BGM_TABLE_COMMAND_POOL)?;
    if let Some(obj) = json.as_object_mut() {
        obj.insert("filePath".to_string(), json!(file_path));
    }
    Ok(json)
}

fn is_ignored_discover_name(name: &str) -> bool {
    name.ends_with("_structure.json")
        || name == "meta.bin"
        || name.ends_with(".orig")
        || name.ends_with(".bak")
}

fn discover_bgm_table(folder: &Path) -> Result<PathBuf, String> {
    for name in [FILE_NAME, "bgm_table", "0.bin"] {
        let known = folder.join(name);
        if known.is_file() {
            return Ok(known);
        }
    }
    let mut found = None;
    let entries = fs::read_dir(folder).map_err(|_| {
        format!(
            "No {FILE_NAME} found in {}. Extract pack {PACK_HASH} with type sound.",
            folder.display()
        )
    })?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if is_ignored_discover_name(&name) {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        if !is_bgm_table_payload(&bytes) {
            continue;
        }
        if found.is_some() {
            return Err(format!(
                "Multiple bgm_table files under {}",
                folder.display()
            ));
        }
        found = Some(path);
    }
    found.ok_or_else(|| {
        format!(
            "No {FILE_NAME} found in {}. Extract pack {PACK_HASH} with type sound.",
            folder.display()
        )
    })
}
