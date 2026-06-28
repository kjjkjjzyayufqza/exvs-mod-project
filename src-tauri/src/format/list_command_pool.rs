// Generic command-pool list format shared by series_list / stage_list (and the
// same shape used by character_list). A "list" file is a param_bin file whose
// command section (field specs: hash + entry_offset + flags + kind) maps each
// entry-row field to a readable name via a `ParamCommandPool`. String fields
// (kind 7) store an absolute offset into the trailing string pool.
//
// character_list keeps its own copy of this logic (format/characterlist.rs) for
// historical reasons; series/stage route through this generic module so a single
// pool table is the only per-file difference.

use std::collections::HashMap;

use serde_json::{json, Map as JsonMap, Value};

use crate::format::obf_string::{
    obf_decode_to_string, obf_encode_from_string, read_null_terminated,
};
use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};
use crate::format::param_entry_schema::{
    entry_row_matches_command_map, hash_and_kind_for_camel_key, is_hash_in_pool,
    min_entry_data_size_for_specs, parse_commands_map_from_entry_row, raw_u32_to_json_for_kind,
    snake_to_camel, validate_file_specs_kind_match_pool, ParamCommandPool, KIND_U32,
};

const KIND_STRING: u32 = 7;

/// One decoded list entry: numeric fields keyed by hash, plus resolved strings.
#[derive(Debug, Clone, PartialEq)]
pub struct ListEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
    pub strings: HashMap<u32, String>,
}

/// Decoded list file. `source_entries_raw` is kept in-process (never serialized)
/// so an unedited round-trip can reproduce the original bytes exactly.
#[derive(Debug, Clone)]
pub struct ListData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<ListEntry>,
    pub trailing_data: Vec<u8>,
    pub source_entries_raw: Vec<Vec<u8>>,
}

pub fn pool_string_hashes(pool: ParamCommandPool) -> Vec<u32> {
    pool.iter()
        .filter(|(_, k, _)| *k == KIND_STRING)
        .map(|(h, _, _)| *h)
        .collect()
}

/// Encode one entry to a named JSON object using `pool`. Numeric fields are typed
/// by kind; string fields emit the resolved UTF-8 string. Unknown hashes (present
/// in the file but not in the pool) are collected under `extraCommands`.
pub fn list_entry_to_json_value(entry: &ListEntry, pool: ParamCommandPool) -> Value {
    let mut map = JsonMap::new();
    map.insert("entryId".to_string(), json!(entry.entry_id));

    for &(h, kind, name) in pool {
        let key = snake_to_camel(name);
        if kind == KIND_STRING {
            if let Some(s) = entry.strings.get(&h) {
                map.insert(key, json!(s));
            } else if let Some(&raw) = entry.commands.get(&h) {
                map.insert(key, json!(raw));
            }
        } else if let Some(&raw) = entry.commands.get(&h) {
            map.insert(key, raw_u32_to_json_for_kind(kind, raw));
        }
    }

    let mut extra = JsonMap::new();
    for (&h, &v) in &entry.commands {
        if !is_hash_in_pool(pool, h) {
            extra.insert(format!("{h}"), json!(v));
        }
    }
    if !extra.is_empty() {
        map.insert("extraCommands".to_string(), Value::Object(extra));
    }

    Value::Object(map)
}

/// Decode one entry from a named JSON object using `pool`.
pub fn list_entry_from_json_value(v: &Value, pool: ParamCommandPool) -> Result<ListEntry, String> {
    let obj = v.as_object().ok_or("expected JSON object")?;
    let entry_id: u32 = obj
        .get("entryId")
        .and_then(|e| e.as_u64().or_else(|| e.as_i64().map(|i| i as u64)))
        .map(|n| n as u32)
        .unwrap_or(0);

    let mut commands: HashMap<u32, u32> = HashMap::new();
    let mut strings: HashMap<u32, String> = HashMap::new();

    for (k, val) in obj {
        if k == "entryId" {
            continue;
        }
        if k == "extraCommands" {
            if let Some(ex) = val.as_object() {
                for (hash_str, v_ex) in ex {
                    let h = parse_hash_key(hash_str)?;
                    let raw = v_ex
                        .as_u64()
                        .map(|u| u as u32)
                        .ok_or_else(|| format!("extraCommands.{hash_str}: expected u32"))?;
                    commands.insert(h, raw);
                }
            }
            continue;
        }
        if let Some((h, knd)) = hash_and_kind_for_camel_key(pool, k) {
            if knd == KIND_STRING {
                if let Some(s) = val.as_str() {
                    strings.insert(h, s.to_string());
                } else if let Some(n) = val.as_u64() {
                    commands.insert(h, n as u32);
                }
            } else {
                let raw = match knd {
                    KIND_U32 => val.as_u64().map(|u| u as u32).ok_or("expected u32")?,
                    2 => {
                        let x = val.as_i64().ok_or("expected i32")?;
                        i32::try_from(x).map_err(|_| "i32 out of range")? as u32
                    }
                    5 => {
                        let f = val.as_f64().ok_or("expected f32")? as f32;
                        f32::to_bits(f)
                    }
                    _ => val.as_u64().map(|u| u as u32).ok_or("expected number")?,
                };
                commands.insert(h, raw);
            }
        }
    }

    Ok(ListEntry {
        entry_id,
        commands,
        strings,
    })
}

fn parse_hash_key(hash_str: &str) -> Result<u32, String> {
    if let Some(rest) = hash_str
        .strip_prefix("0x")
        .or_else(|| hash_str.strip_prefix("0X"))
    {
        u32::from_str_radix(rest, 16)
    } else {
        hash_str.parse()
    }
    .map_err(|e: std::num::ParseIntError| e.to_string())
}

fn resolve_entry_strings(
    commands: &HashMap<u32, u32>,
    full_file_data: &[u8],
    string_hashes: &[u32],
) -> HashMap<u32, String> {
    let mut strings = HashMap::new();
    for &h in string_hashes {
        if let Some(&offset) = commands.get(&h) {
            let raw = read_null_terminated(full_file_data, offset as usize);
            if !raw.is_empty() {
                strings.insert(h, obf_decode_to_string(raw));
            }
        }
    }
    strings
}

/// Parse a list file into named entries using `pool`. The file's field-spec kinds
/// are validated against the pool (mismatch is an error, not silently ignored).
pub fn parse_list(data: &[u8], pool: ParamCommandPool) -> Result<ListData, String> {
    let file = read_param_binary(data)?;
    validate_file_specs_kind_match_pool(pool, &file.field_specs)?;

    let string_hashes = pool_string_hashes(pool);

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        let commands = parse_commands_map_from_entry_row(raw, &file.field_specs);
        let strings = resolve_entry_strings(&commands, data, &string_hashes);
        entries.push(ListEntry {
            entry_id: id,
            commands,
            strings,
        });
    }

    Ok(ListData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

/// Rebuild a list file from named entries using `pool`. Re-encodes the string pool
/// only when any entry carries an edited string; otherwise preserves original rows
/// for unedited entries (byte-exact round-trip in-process).
pub fn build_list(b: &ListData, pool: ParamCommandPool) -> Result<Vec<u8>, String> {
    if !b.field_specs.is_empty() {
        validate_file_specs_kind_match_pool(pool, &b.field_specs)?;
    }
    let field_specs = if b.field_specs.is_empty() {
        pool.iter()
            .enumerate()
            .map(|(index, (hash, kind, _))| ParamFieldSpec {
                hash: *hash,
                entry_offset: (index * 4) as u32,
                flags: 0,
                kind: *kind,
            })
            .collect()
    } else {
        b.field_specs.clone()
    };

    let min_size = min_entry_data_size_for_specs(&field_specs);
    let entry_size = b.header.entry_size.max(min_size) as usize;

    let string_hashes = pool_string_hashes(pool);
    let has_new_strings = b.entries.iter().any(|e| !e.strings.is_empty());

    if !has_new_strings {
        return build_without_string_rewrite(b, &field_specs, entry_size);
    }

    let entries_base_offset =
        0x20 + field_specs.len() * 4 + field_specs.len() * 12 + b.entries.len() * 4;
    let string_pool_start = entries_base_offset + b.entries.len() * entry_size;

    let mut string_pool: Vec<u8> = Vec::new();
    let mut entry_string_offsets: Vec<HashMap<u32, u32>> = Vec::with_capacity(b.entries.len());

    for (entry_index, entry) in b.entries.iter().enumerate() {
        let mut offsets = HashMap::new();
        for &h in &string_hashes {
            if let Some(s) = entry.strings.get(&h) {
                let abs_offset = (string_pool_start + string_pool.len()) as u32;
                offsets.insert(h, abs_offset);
                string_pool.extend_from_slice(&obf_encode_from_string(s));
            } else if let Some(&raw_offset) = entry.commands.get(&h) {
                if entry_index < b.source_entries_raw.len() {
                    offsets.insert(h, raw_offset);
                } else {
                    let abs_offset = (string_pool_start + string_pool.len()) as u32;
                    offsets.insert(h, abs_offset);
                    string_pool.push(0);
                }
            }
        }
        entry_string_offsets.push(offsets);
    }

    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for (entry_index, entry) in b.entries.iter().enumerate() {
        let mut raw = source_row_or_zeroed(b, entry_index, entry_size);
        for spec in &field_specs {
            let o = spec.entry_offset as usize;
            if o + 4 > raw.len() {
                return Err("list entry field offset out of range for entry_size".to_string());
            }
            if spec.kind == KIND_STRING {
                if let Some(&abs_off) = entry_string_offsets[entry_index].get(&spec.hash) {
                    raw[o..o + 4].copy_from_slice(&abs_off.to_le_bytes());
                }
            } else if let Some(v) = entry.commands.get(&spec.hash) {
                raw[o..o + 4].copy_from_slice(&v.to_le_bytes());
            }
        }
        entries_raw.push(raw);
    }

    let file = ParamBinaryFile {
        header: rebuilt_header(b, &field_specs, entry_size),
        field_specs,
        entry_ids: b.entries.iter().map(|e| e.entry_id).collect(),
        entries_raw,
        trailing_data: string_pool,
    };
    build_param_binary(&file)
}

fn build_without_string_rewrite(
    b: &ListData,
    field_specs: &[ParamFieldSpec],
    entry_size: usize,
) -> Result<Vec<u8>, String> {
    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for (entry_index, entry) in b.entries.iter().enumerate() {
        if entry_index < b.source_entries_raw.len()
            && b.source_entries_raw[entry_index].len() == entry_size
            && entry_row_matches_command_map(
                &entry.commands,
                &b.source_entries_raw[entry_index],
                field_specs,
            )
        {
            entries_raw.push(b.source_entries_raw[entry_index].clone());
            continue;
        }

        let mut raw = source_row_or_zeroed(b, entry_index, entry_size);
        for spec in field_specs {
            let o = spec.entry_offset as usize;
            if o + 4 > raw.len() {
                return Err("list entry field offset out of range for entry_size".to_string());
            }
            if let Some(v) = entry.commands.get(&spec.hash) {
                raw[o..o + 4].copy_from_slice(&v.to_le_bytes());
            }
        }
        entries_raw.push(raw);
    }

    let file = ParamBinaryFile {
        header: rebuilt_header(b, field_specs, entry_size),
        field_specs: field_specs.to_vec(),
        entry_ids: b.entries.iter().map(|e| e.entry_id).collect(),
        entries_raw,
        trailing_data: b.trailing_data.clone(),
    };
    build_param_binary(&file)
}

fn source_row_or_zeroed(b: &ListData, entry_index: usize, entry_size: usize) -> Vec<u8> {
    if entry_index < b.source_entries_raw.len()
        && b.source_entries_raw[entry_index].len() == entry_size
    {
        b.source_entries_raw[entry_index].clone()
    } else {
        vec![0u8; entry_size]
    }
}

fn rebuilt_header(
    b: &ListData,
    field_specs: &[ParamFieldSpec],
    entry_size: usize,
) -> ParamBinaryHeader {
    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = field_specs.len() as u32;
    header.entry_size = entry_size as u32;
    header
}

/// Convert a parsed `ListData` to the JSON shape the frontend consumes (mirrors
/// `CharacterListData`: header/fieldSpecs/entryIds/entries/trailingData).
pub fn list_data_to_json(b: &ListData, pool: ParamCommandPool) -> Result<Value, String> {
    let entries: Vec<Value> = b
        .entries
        .iter()
        .map(|e| list_entry_to_json_value(e, pool))
        .collect();
    let field_specs: Vec<Value> = b
        .field_specs
        .iter()
        .map(|s| {
            json!({
                "hash": s.hash,
                "entryOffset": s.entry_offset,
                "flags": s.flags,
                "kind": s.kind,
            })
        })
        .collect();
    Ok(json!({
        "header": {
            "magic": b.header.magic,
            "unk04": b.header.unk_04,
            "fileSize": b.header.file_size,
            "unk0c": b.header.unk_0c,
            "entryCount": b.header.entry_count,
            "commandsCount": b.header.commands_count,
            "entrySize": b.header.entry_size,
            "unk1c": b.header.unk_1c,
        },
        "fieldSpecs": field_specs,
        "entryIds": b.entry_ids,
        "entries": entries,
        "trailingData": b.trailing_data,
    }))
}

/// Parse the frontend JSON shape back into `ListData` for rebuilding. Edited files
/// arrive without `source_entries_raw` (it is in-process only), so rows are rebuilt
/// purely from the named fields + field specs.
pub fn list_data_from_json(v: &Value, pool: ParamCommandPool) -> Result<ListData, String> {
    let obj = v.as_object().ok_or("expected list JSON object")?;
    let header = parse_header(obj.get("header"))?;

    let field_specs = match obj.get("fieldSpecs").and_then(|f| f.as_array()) {
        Some(arr) => arr
            .iter()
            .map(parse_field_spec)
            .collect::<Result<Vec<_>, _>>()?,
        None => Vec::new(),
    };

    let entries = match obj.get("entries").and_then(|e| e.as_array()) {
        Some(arr) => arr
            .iter()
            .map(|e| list_entry_from_json_value(e, pool))
            .collect::<Result<Vec<_>, _>>()?,
        None => Vec::new(),
    };

    let entry_ids = entries.iter().map(|e| e.entry_id).collect();

    let trailing_data = match obj.get("trailingData").and_then(|t| t.as_array()) {
        Some(arr) => arr
            .iter()
            .map(|b| {
                b.as_u64()
                    .map(|u| u as u8)
                    .ok_or("trailingData: expected u8")
            })
            .collect::<Result<Vec<_>, _>>()?,
        None => Vec::new(),
    };

    Ok(ListData {
        header,
        field_specs,
        entry_ids,
        entries,
        trailing_data,
        source_entries_raw: Vec::new(),
    })
}

fn parse_header(v: Option<&Value>) -> Result<ParamBinaryHeader, String> {
    let obj = v
        .and_then(|h| h.as_object())
        .ok_or("list JSON: missing header object")?;
    let get = |k: &str| obj.get(k).and_then(|n| n.as_u64()).map(|n| n as u32);
    Ok(ParamBinaryHeader {
        magic: get("magic").unwrap_or(0),
        unk_04: get("unk04").unwrap_or(0),
        file_size: get("fileSize").unwrap_or(0),
        unk_0c: get("unk0c").unwrap_or(0),
        entry_count: get("entryCount").unwrap_or(0),
        commands_count: get("commandsCount").unwrap_or(0),
        entry_size: get("entrySize").unwrap_or(0),
        unk_1c: get("unk1c").unwrap_or(0),
    })
}

fn parse_field_spec(v: &Value) -> Result<ParamFieldSpec, String> {
    let obj = v.as_object().ok_or("fieldSpecs: expected object")?;
    let get = |k: &str| obj.get(k).and_then(|n| n.as_u64()).map(|n| n as u32);
    Ok(ParamFieldSpec {
        hash: get("hash").ok_or("fieldSpec: missing hash")?,
        entry_offset: get("entryOffset").ok_or("fieldSpec: missing entryOffset")?,
        flags: get("flags").unwrap_or(0),
        kind: get("kind").ok_or("fieldSpec: missing kind")?,
    })
}
