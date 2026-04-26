use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

use serde_json::Value;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};
use crate::format::param_entry_schema::{
    entry_commands_from_named_json, entry_commands_to_named_json, entry_row_matches_command_map,
    expected_field_specs_ordered_index_times_four, min_entry_data_size_for_specs,
    parse_commands_map_from_entry_row, validate_file_specs_kind_match_pool, ParamCommandPool,
};

pub const GRAPPARAM_COMMAND_POOL: ParamCommandPool = &[
    (0x17A9E2E1, 2, "down_value"),
    (0x2272E3D6, 2, "charge_frame"),
    (0x35857659, 2, "grap_total_frame"),
    (0x465D80C6, 2, "stun_value"),
    (0x534643A2, 2, "grap_priority"),
    (0x550BCFAD, 2, "startup_frame"),
    (0x55B8FC51, 2, "tracking_frame"),
    (0x6906F0F4, 2, "damage"),
    (0x7755981E, 2, "correction_pct"),
    (0x83E900CD, 2, "reach"),
    (0x976F9803, 2, "cancel_frame"),
    (0x99D42DBB, 2, "recovery_frame"),
    (0xA89F3A61, 2, "is_multi_hit"),
    (0xB084851E, 2, "damage_2nd"),
    (0xBEC81A41, 2, "damage_last"),
    (0xC21ED1D8, 2, "down_value_last"),
];

pub fn grapparam_entry_to_json_value(entry: &GrapParamEntry) -> Value {
    entry_commands_to_named_json(entry.entry_id, &entry.commands, GRAPPARAM_COMMAND_POOL)
}

pub fn grapparam_entry_from_json_value(v: &Value) -> Result<GrapParamEntry, String> {
    let (entry_id, commands) = entry_commands_from_named_json(v, GRAPPARAM_COMMAND_POOL)?;
    Ok(GrapParamEntry { entry_id, commands })
}

#[derive(Debug, Clone, PartialEq)]
pub struct GrapParamEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
}

impl Serialize for GrapParamEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        grapparam_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for GrapParamEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        grapparam_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrapParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<GrapParamEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered_index_times_four(GRAPPARAM_COMMAND_POOL)
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(GRAPPARAM_COMMAND_POOL, field_specs)
}

fn parse_entry_from_raw(raw: &[u8], field_specs: &[ParamFieldSpec], entry_id: u32) -> GrapParamEntry {
    let commands = parse_commands_map_from_entry_row(raw, field_specs);
    GrapParamEntry { entry_id, commands }
}

fn entry_matches_raw(entry: &GrapParamEntry, raw: &[u8], field_specs: &[ParamFieldSpec]) -> bool {
    entry_row_matches_command_map(&entry.commands, raw, field_specs)
}

pub fn parse_grapparam(data: &[u8]) -> Result<GrapParamData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(parse_entry_from_raw(raw, &file.field_specs, id));
    }

    Ok(GrapParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_grapparam(b: &GrapParamData) -> Result<Vec<u8>, String> {
    if !b.field_specs.is_empty() {
        validate_field_specs(&b.field_specs)?;
    }
    let field_specs = if b.field_specs.is_empty() {
        expected_field_specs()
    } else {
        b.field_specs.clone()
    };

    let min_size = min_entry_data_size_for_specs(&field_specs);
    let default_floor = b.header.entry_size.max(min_size);
    let entry_size = default_floor as usize;

    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for (entry_index, entry) in b.entries.iter().enumerate() {
        if entry_index < b.source_entries_raw.len() && b.source_entries_raw[entry_index].len() == entry_size {
            let r = &b.source_entries_raw[entry_index];
            if entry_matches_raw(entry, r, &field_specs) {
                entries_raw.push(b.source_entries_raw[entry_index].clone());
                continue;
            }
        }

        let mut raw = if entry_index < b.source_entries_raw.len() && b.source_entries_raw[entry_index].len() == entry_size {
            b.source_entries_raw[entry_index].clone()
        } else {
            vec![0u8; entry_size]
        };

        for spec in &field_specs {
            let o = spec.entry_offset as usize;
            if o + 4 > raw.len() {
                return Err("grapparam entry field offset out of range for entry_size".to_string());
            }
            if let Some(v) = entry.commands.get(&spec.hash) {
                raw[o..o + 4].copy_from_slice(&v.to_le_bytes());
            }
        }
        entries_raw.push(raw);
    }

    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = field_specs.len() as u32;
    header.entry_size = entry_size as u32;

    let file = ParamBinaryFile {
        header,
        field_specs,
        entry_ids: b.entries.iter().map(|entry| entry.entry_id).collect(),
        entries_raw,
        trailing_data: b.trailing_data.clone(),
    };
    build_param_binary(&file)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_PATH: &str =
        "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\grapparam.bin";

    #[test]
    fn grapparam_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read grapparam sample file");

        let parsed = parse_grapparam(&source).expect("failed to parse grapparam sample file");
        let rebuilt = build_grapparam(&parsed).expect("failed to rebuild grapparam sample file");
        assert_eq!(rebuilt, source);

        assert!(!parsed.entries.is_empty(), "grapparam sample has no entries");

        let mut with_added = parsed.clone();
        let mut added = with_added.entries[0].clone();
        let next_id = with_added
            .entries
            .iter()
            .map(|entry| entry.entry_id)
            .max()
            .unwrap_or(0)
            .wrapping_add(1);
        added.entry_id = next_id;
        with_added.entries.push(added);
        let added_bytes =
            build_grapparam(&with_added).expect("failed to build grapparam after add");
        let added_parsed =
            parse_grapparam(&added_bytes).expect("failed to parse grapparam after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(added_parsed.entries.last().map(|entry| entry.entry_id), Some(next_id));

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_grapparam(&with_updated).expect("failed to build grapparam after update");
        let updated_parsed =
            parse_grapparam(&updated_bytes).expect("failed to parse grapparam after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_grapparam(&with_deleted).expect("failed to build grapparam after delete");
        let deleted_parsed =
            parse_grapparam(&deleted_bytes).expect("failed to parse grapparam after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
