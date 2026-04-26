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

pub const SPEEDPARAM_COMMAND_POOL: ParamCommandPool = &[
    (0x06D1922D, 2, "walk_speed_forward"),
    (0x086B475D, 2, "walk_speed_base"),
    (0x0B6480D5, 2, "walk_speed_backward"),
    (0x0B9EBECE, 2, "boost_gauge_capacity"),
    (0x0CF37AD7, 2, "boost_recovery_delay_frame"),
    (0x0D5BB2EF, 2, "boost_recovery_speed"),
    (0x0E682BA8, 2, "ground_run_speed"),
    (0x11FFDDB4, 2, "boost_dash_initial_speed"),
    (0x17A9D82D, 2, "step_distance"),
    (0x18895A55, 2, "jump_initial_velocity"),
    (0x29AA8A04, 2, "gravity_modifier"),
    (0x2C76D0A7, 2, "movement_class"),
    (0x2D28CC4B, 2, "air_dash_startup_frame"),
    (0x2DF7AF95, 2, "step_startup_frame"),
    (0x2EAE942B, 2, "boost_dash_sustained_speed"),
    (0x32FD1EDC, 2, "dash_cancel_type"),
    (0x37D1D056, 2, "fall_gravity"),
    (0x3BF9E21E, 2, "max_ground_speed"),
    (0x4031CB84, 2, "boost_dash_startup_frame"),
    (0x41DABEC5, 2, "boost_dash_recovery_frame"),
    (0x459455EA, 2, "landing_recovery_frame"),
    (0x4D4B65EA, 2, "air_brake_speed"),
    (0x4D601E55, 2, "step_speed"),
    (0x4F705BAD, 2, "step_recovery_frame"),
    (0x5481CCF4, 2, "boost_dash_distance"),
    (0x56C51E87, 2, "air_dash_end_speed"),
    (0x58313EF7, 2, "step_type"),
    (0x5E8CAF43, 2, "air_dash_duration_frame"),
    (0x5EF705B7, 2, "boost_dash_type"),
    (0x607C25BC, 2, "air_speed_base"),
    (0x6C640897, 2, "fall_speed"),
    (0x6F6F1BF6, 2, "guard_move_speed"),
    (0x7242066A, 2, "air_dash_distance"),
    (0x737D64F4, 2, "air_speed_max"),
    (0x77749DD2, 2, "speed_decay_base"),
    (0x7BF44A41, 2, "air_steer_limit"),
    (0x7C2572A1, 2, "rotation_speed"),
    (0x7C3CF4DD, 2, "gauge_recovery_rate"),
    (0x7CD3A712, 2, "boost_consumption_base"),
    (0x7D79F6FA, 2, "boost_dash_max_speed"),
    (0x7E5878A3, 2, "turning_speed"),
    (0x8173DA19, 2, "jump_type"),
    (0x84043A2D, 2, "fall_type"),
    (0x8D0A9843, 2, "aerial_correction"),
    (0x8EDC8D6E, 2, "air_efficiency"),
    (0x9297EF74, 2, "air_gravity"),
    (0x95FA2B6D, 2, "air_dash_max_distance"),
    (0x97BE8DFC, 2, "step_cancel_frame"),
    (0x9A378388, 2, "guard_recovery_frame"),
    (0x9EAA4E96, 2, "vertical_move_speed"),
    (0x9FD06227, 2, "boost_startup_frame"),
    (0xA49287B9, 2, "boost_dash_duration_frame"),
    (0xA55D6C5E, 2, "dash_end_speed"),
    (0xA7CBBC07, 2, "fixed_step_distance"),
    (0xB20B67C9, 2, "air_boost_efficiency"),
    (0xBC0127E1, 2, "guard_speed_rate"),
    (0xC6157381, 2, "air_dash_speed"),
    (0xC6BBC347, 2, "fall_speed_rate"),
    (0xCD5DF17C, 2, "air_dash_type"),
    (0xCF452D59, 2, "guard_step_type"),
    (0xD68023A4, 2, "dash_range"),
    (0xDD7720EB, 2, "speed_decay_rate"),
    (0xDE1EF15A, 2, "boost_consumption_type"),
    (0xE2FD1BFB, 2, "air_deceleration"),
    (0xE590DFE2, 2, "boost_dash_count"),
    (0xE6213731, 7, "action_label_offset"),
    (0xEC580BCC, 2, "turn_rate"),
    (0xF3B9AD85, 2, "air_steer_speed"),
    (0xF3C4CAE9, 7, "resource_label_offset"),
    (0xF44C9D4E, 2, "boost_efficiency_air"),
    (0xF559DCF1, 2, "boost_extension_rate"),
    (0xF8B9B46E, 2, "boost_cap_rate"),
    (0xFEC6069F, 2, "boost_dash_distance_max"),
    (0xFF7A9C8B, 2, "gravity_air_modifier"),
];

pub fn speedparam_entry_to_json_value(entry: &SpeedParamEntry) -> Value {
    entry_commands_to_named_json(entry.entry_id, &entry.commands, SPEEDPARAM_COMMAND_POOL)
}

pub fn speedparam_entry_from_json_value(v: &Value) -> Result<SpeedParamEntry, String> {
    let (entry_id, commands) = entry_commands_from_named_json(v, SPEEDPARAM_COMMAND_POOL)?;
    Ok(SpeedParamEntry { entry_id, commands })
}

#[derive(Debug, Clone, PartialEq)]
pub struct SpeedParamEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
}

impl Serialize for SpeedParamEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        speedparam_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for SpeedParamEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        speedparam_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<SpeedParamEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered_index_times_four(SPEEDPARAM_COMMAND_POOL)
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(SPEEDPARAM_COMMAND_POOL, field_specs)
}

fn parse_entry_from_raw(raw: &[u8], field_specs: &[ParamFieldSpec], entry_id: u32) -> SpeedParamEntry {
    let commands = parse_commands_map_from_entry_row(raw, field_specs);
    SpeedParamEntry { entry_id, commands }
}

fn entry_matches_raw(entry: &SpeedParamEntry, raw: &[u8], field_specs: &[ParamFieldSpec]) -> bool {
    entry_row_matches_command_map(&entry.commands, raw, field_specs)
}

pub fn parse_speedparam(data: &[u8]) -> Result<SpeedParamData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(parse_entry_from_raw(raw, &file.field_specs, id));
    }

    Ok(SpeedParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_speedparam(b: &SpeedParamData) -> Result<Vec<u8>, String> {
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
                return Err("speedparam entry field offset out of range for entry_size".to_string());
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
        "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\speedparam.bin";

    #[test]
    fn speedparam_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read speedparam sample file");

        let parsed = parse_speedparam(&source).expect("failed to parse speedparam sample file");
        let rebuilt = build_speedparam(&parsed).expect("failed to rebuild speedparam sample file");
        assert_eq!(rebuilt, source);

        assert!(!parsed.entries.is_empty(), "speedparam sample has no entries");

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
            build_speedparam(&with_added).expect("failed to build speedparam after add");
        let added_parsed =
            parse_speedparam(&added_bytes).expect("failed to parse speedparam after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(added_parsed.entries.last().map(|entry| entry.entry_id), Some(next_id));

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_speedparam(&with_updated).expect("failed to build speedparam after update");
        let updated_parsed =
            parse_speedparam(&updated_bytes).expect("failed to parse speedparam after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_speedparam(&with_deleted).expect("failed to build speedparam after delete");
        let deleted_parsed =
            parse_speedparam(&deleted_bytes).expect("failed to parse speedparam after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
