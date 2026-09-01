//! `bgm_list.vgsht2` / `bgm_list.bin` (pack `0xC91627E8`).
//!
//! HUD / jukebox titles. Runtime looks up `musicId` (`0x1111D441`) then reads
//! `cueHash` (`0xA84A15F4`) — the same 32-bit key stored on Character List
//! Primary/Secondary and on `bgm_table.record_id`. Spec:
//! `docs/exvs2-audio-voice-bgm-indexing.md` and HANDBOOK §4.2.

use crate::format::list_command_pool::{
    build_list, list_data_from_json, list_data_to_json, list_entry_to_json_value, parse_list,
    ListData, ListEntry,
};
use crate::format::param_bin_format::{ParamBinaryHeader, PARAM_BIN_MAGIC};
use crate::format::param_entry_schema::ParamCommandPool;
use crate::format::raw_path_id::backup_orig;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub const PACK_HASH: &str = "0xC91627E8";
pub const FILE_NAME: &str = "bgm_list.bin";
pub const FILE_NAME_VGSHT2: &str = "bgm_list.vgsht2";

pub const CMD_MUSIC_ID: u32 = 0x1111_D441;
pub const CMD_TITLE: u32 = 0x4FEB_D949;
pub const CMD_TITLE_WITH_NOTE: u32 = 0x5022_3A04;
pub const CMD_SOURCE_GROUP: u32 = 0x7D90_139B;
pub const CMD_CUE_HASH: u32 = 0xA84A_15F4;

pub const BGM_LIST_COMMAND_POOL: ParamCommandPool = &[
    (CMD_MUSIC_ID, 1, "music_id"),
    (CMD_TITLE, 7, "title"),
    (CMD_TITLE_WITH_NOTE, 7, "title_with_note_prefix"),
    (CMD_SOURCE_GROUP, 1, "source_group_hash"),
    (CMD_CUE_HASH, 1, "cue_hash"),
];

const ENTRY_SIZE: u32 = 0x1C;

pub fn parse_bytes(data: &[u8]) -> Result<ListData, String> {
    let parsed = parse_list(data, BGM_LIST_COMMAND_POOL)?;
    if parsed.header.commands_count != 5 {
        return Err(format!(
            "bgm_list commands_count {} != 5",
            parsed.header.commands_count
        ));
    }
    if parsed.header.entry_size != ENTRY_SIZE {
        return Err(format!(
            "bgm_list entry_size 0x{:X} != 0x{ENTRY_SIZE:X}",
            parsed.header.entry_size
        ));
    }
    Ok(parsed)
}

pub fn is_bgm_list_payload(bytes: &[u8]) -> bool {
    parse_bytes(bytes).is_ok()
}

pub fn parse_pack(folder_path: &str) -> Result<Value, String> {
    let path = discover_bgm_list(Path::new(folder_path))?;
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let parsed = parse_bytes(&bytes)?;
    let mut json = list_data_to_json(&parsed, BGM_LIST_COMMAND_POOL)?;
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

pub fn sort_by_record_id(data: &mut ListData) {
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

pub fn donor_source_group(entries: &[ListEntry], skip_entry_id: Option<u32>) -> u32 {
    for entry in entries {
        if skip_entry_id == Some(entry.entry_id) {
            continue;
        }
        if let Some(&hash) = entry.commands.get(&CMD_SOURCE_GROUP) {
            if hash != 0 {
                return hash;
            }
        }
    }
    0
}

fn next_unused(occupied: &HashSet<u32>) -> u32 {
    let mut candidate = occupied.iter().copied().max().unwrap_or(0).saturating_add(1);
    if candidate == 0 {
        candidate = 1;
    }
    while occupied.contains(&candidate) || candidate == 0 {
        candidate = candidate.wrapping_add(1);
        if candidate == 0 {
            candidate = 1;
        }
    }
    candidate
}

pub fn validate_entry(entry: &ListEntry) -> Result<(), String> {
    let music_id = *entry
        .commands
        .get(&CMD_MUSIC_ID)
        .ok_or("musicId is missing")?;
    if music_id == 0 {
        return Err("musicId is empty".to_string());
    }
    let cue_hash = *entry
        .commands
        .get(&CMD_CUE_HASH)
        .ok_or("cueHash is missing")?;
    if cue_hash == 0 {
        return Err("cueHash is empty".to_string());
    }
    if entry.entry_id == 0 {
        return Err("record_id / entryId is empty".to_string());
    }
    Ok(())
}

fn json_u32(value: &Value, key: &str) -> Option<u32> {
    value
        .get(key)
        .and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|i| i as u64)))
        .map(|n| n as u32)
}

fn json_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

pub fn derive_entry(
    existing_entry_id: Option<u32>,
    music_id: Option<u32>,
    cue_hash: u32,
    source_group_hash: u32,
    title: &str,
    title_with_note: &str,
    occupied_record_ids: &HashSet<u32>,
    occupied_music_ids: &HashSet<u32>,
) -> Result<ListEntry, String> {
    let entry_id = match existing_entry_id {
        Some(id) if id != 0 => id,
        _ => next_unused(occupied_record_ids),
    };
    let music_id = match music_id {
        Some(id) if id != 0 => id,
        _ => next_unused(occupied_music_ids),
    };
    let mut commands = HashMap::new();
    commands.insert(CMD_MUSIC_ID, music_id);
    commands.insert(CMD_SOURCE_GROUP, source_group_hash);
    commands.insert(CMD_CUE_HASH, cue_hash);
    let mut strings = HashMap::new();
    strings.insert(CMD_TITLE, title.to_string());
    strings.insert(CMD_TITLE_WITH_NOTE, title_with_note.to_string());
    Ok(ListEntry {
        entry_id,
        commands,
        strings,
    })
}

pub fn finalize_entry(entry_json: &Value, table_json: &Value) -> Result<Value, String> {
    let table = list_data_from_json(table_json, BGM_LIST_COMMAND_POOL)?;
    let current_id = json_u32(entry_json, "entryId").filter(|id| *id != 0);
    let mut occupied_record_ids: HashSet<u32> = table.entries.iter().map(|e| e.entry_id).collect();
    if let Some(id) = current_id {
        occupied_record_ids.remove(&id);
    }
    let current_music = json_u32(entry_json, "musicId").filter(|id| *id != 0);
    let mut occupied_music_ids: HashSet<u32> = table
        .entries
        .iter()
        .filter_map(|e| e.commands.get(&CMD_MUSIC_ID).copied())
        .collect();
    if let Some(id) = current_music {
        occupied_music_ids.remove(&id);
    }
    let cue_hash = json_u32(entry_json, "cueHash").unwrap_or(0);
    let source_group = match json_u32(entry_json, "sourceGroupHash").filter(|h| *h != 0) {
        Some(hash) => hash,
        None => donor_source_group(&table.entries, current_id),
    };
    let derived = derive_entry(
        current_id,
        current_music,
        cue_hash,
        source_group,
        &json_string(entry_json, "title"),
        &json_string(entry_json, "titleWithNotePrefix"),
        &occupied_record_ids,
        &occupied_music_ids,
    )?;
    Ok(list_entry_to_json_value(&derived, BGM_LIST_COMMAND_POOL))
}

pub fn build_sorted_bytes(data_json: &Value) -> Result<Vec<u8>, String> {
    let mut data = list_data_from_json(data_json, BGM_LIST_COMMAND_POOL)?;
    for (index, entry) in data.entries.iter().enumerate() {
        validate_entry(entry).map_err(|e| format!("Row {index}: {e}"))?;
    }
    sort_by_record_id(&mut data);
    build_list(&data, BGM_LIST_COMMAND_POOL)
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
    let mut json = list_data_to_json(&data, BGM_LIST_COMMAND_POOL)?;
    if let Some(obj) = json.as_object_mut() {
        obj.insert("filePath".to_string(), json!(file_path));
    }
    Ok(json)
}

fn discover_bgm_list(folder: &Path) -> Result<PathBuf, String> {
    for name in [FILE_NAME, FILE_NAME_VGSHT2, "bgm_list", "0.bin"] {
        let known = folder.join(name);
        if known.is_file() {
            return Ok(known);
        }
    }
    let mut found = None;
    let entries = fs::read_dir(folder).map_err(|_| {
        format!(
            "No {FILE_NAME} found in {}. Extract pack {PACK_HASH} with type list.",
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
        if name.ends_with("_structure.json")
            || name == "meta.bin"
            || name.ends_with(".orig")
            || name.ends_with(".bak")
        {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        if !is_bgm_list_payload(&bytes) {
            continue;
        }
        if found.is_some() {
            return Err(format!("Multiple bgm_list files under {}", folder.display()));
        }
        found = Some(path);
    }
    found.ok_or_else(|| {
        format!(
            "No {FILE_NAME} found in {}. Extract pack {PACK_HASH} with type list.",
            folder.display()
        )
    })
}
