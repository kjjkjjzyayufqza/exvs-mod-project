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

pub const ARMSPARAM_COMMAND_POOL: ParamCommandPool = &[
    (0x020A35DD, 1, "is_enabled"),
    (0x02D35F32, 1, "unk_04_reserved"),
    (0x0496C136, 1, "is_continuous_fire"),
    (0x04A2CFD6, 2, "reload_start_frame"),
    (0x103171AE, 2, "reload_time_total"),
    (0x11DEE0C8, 1, "reload_type"),
    (0x1348893F, 1, "is_charge_weapon"),
    (0x1E8E41EF, 1, "can_move_while_firing"),
    (0x31427CC3, 2, "homing_angle"),
    (0x3A1D6254, 5, "induction_rate"),
    (0x3BC65821, 5, "homing_start_rate"),
    (0x3CAB9C38, 5, "homing_end_rate"),
    (0x4961274C, 2, "ammo_count"),
    (0x4A7796DB, 5, "damage_correction_rate"),
    (0x4BACACAE, 5, "down_correction_rate"),
    (0x4C527468, 2, "shot_type"),
    (0x4C84F7C0, 2, "damage"),
    (0x4D1A52C2, 5, "stun_correction_rate"),
    (0x4E692ACD, 2, "down_value"),
    (0x596FC1C3, 1, "cancel_route_type"),
    (0x5B072B6C, 1, "is_vernier"),
    (0x67364138, 2, "cooldown_frame"),
    (0x73A5FF40, 2, "startup_frame"),
    (0x74C83B59, 2, "active_frame"),
    (0x89382014, 2, "recovery_frame"),
    (0x8E55E40D, 2, "total_duration_frame"),
    (0x9AC65A75, 2, "landing_recovery_frame"),
    (0xA06CAAD5, 2, "stun_value"),
    (0xA2CF099B, 5, "boost_consumption_rate"),
    (0xA353F222, 2, "range"),
    (0xA479F7F7, 5, "muzzle_correction_rate"),
    (0xA502BCF2, 2, "reload_per_shot_frame"),
    (0xA635CFC2, 2, "reload_lock_frame"),
    (0xAB9AEF6C, 2, "overheat_frame"),
    (0xABC33F14, 2, "charge_frame"),
    (0xAC243293, 1, "guard_break_type"),
    (0xB669A42A, 1, "landing_behavior_type"),
    (0xB686E88C, 1, "is_super_armor"),
    (0xBB93D195, 1, "bullet_type"),
    (0xD37EC761, 5, "tracking_speed_rate"),
    (0xD5C8390D, 5, "bullet_speed_rate"),
    (0xE6213731, 7, "action_label_offset"),
    (0xEDC16AE3, 2, "ammo_reload_wait_frame"),
    (0xEF3F41B3, 1, "hit_effect_type"),
    (0xF3C4CAE9, 7, "resource_label_offset"),
    (0xF8AEEC77, 2, "bullet_count_per_shot"),
    (0xF8E59F33, 2, "firing_interval_frame"),
    (0xF952D49B, 2, "full_charge_frame"),
];

pub fn armsparam_entry_to_json_value(entry: &ArmsParamEntry) -> Value {
    entry_commands_to_named_json(entry.entry_id, &entry.commands, ARMSPARAM_COMMAND_POOL)
}

pub fn armsparam_entry_from_json_value(v: &Value) -> Result<ArmsParamEntry, String> {
    let (entry_id, commands) = entry_commands_from_named_json(v, ARMSPARAM_COMMAND_POOL)?;
    Ok(ArmsParamEntry { entry_id, commands })
}

#[derive(Debug, Clone, PartialEq)]
pub struct ArmsParamEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
}

impl Serialize for ArmsParamEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        armsparam_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for ArmsParamEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        armsparam_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArmsParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<ArmsParamEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered_index_times_four(ARMSPARAM_COMMAND_POOL)
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(ARMSPARAM_COMMAND_POOL, field_specs)
}

fn parse_entry_from_raw(raw: &[u8], field_specs: &[ParamFieldSpec], entry_id: u32) -> ArmsParamEntry {
    let commands = parse_commands_map_from_entry_row(raw, field_specs);
    ArmsParamEntry { entry_id, commands }
}

fn entry_matches_raw(entry: &ArmsParamEntry, raw: &[u8], field_specs: &[ParamFieldSpec]) -> bool {
    entry_row_matches_command_map(&entry.commands, raw, field_specs)
}

pub fn parse_armsparam(data: &[u8]) -> Result<ArmsParamData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(parse_entry_from_raw(raw, &file.field_specs, id));
    }

    Ok(ArmsParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_armsparam(b: &ArmsParamData) -> Result<Vec<u8>, String> {
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
                return Err("armsparam entry field offset out of range for entry_size".to_string());
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
        "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\armsparam.bin";

    #[test]
    fn armsparam_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read armsparam sample file");

        let parsed = parse_armsparam(&source).expect("failed to parse armsparam sample file");
        let rebuilt = build_armsparam(&parsed).expect("failed to rebuild armsparam sample file");
        assert_eq!(rebuilt, source);

        assert!(!parsed.entries.is_empty(), "armsparam sample has no entries");

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
        let added_bytes = build_armsparam(&with_added).expect("failed to build armsparam after add");
        let added_parsed = parse_armsparam(&added_bytes).expect("failed to parse armsparam after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(added_parsed.entries.last().map(|entry| entry.entry_id), Some(next_id));

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_armsparam(&with_updated).expect("failed to build armsparam after update");
        let updated_parsed =
            parse_armsparam(&updated_bytes).expect("failed to parse armsparam after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_armsparam(&with_deleted).expect("failed to build armsparam after delete");
        let deleted_parsed =
            parse_armsparam(&deleted_bytes).expect("failed to parse armsparam after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
