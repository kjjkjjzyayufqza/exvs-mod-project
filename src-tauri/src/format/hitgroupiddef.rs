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

// Please keep comments for analysis.
// Data-verified: 432 files, 17677 entries. cmd_count={15}.
// CRITICAL: 0xD32D39ED was "is_enabled" but has 141 unique hash values — renamed to parent_bone_hash.
//           Same hash is "bone_hash" in vernier_table.rs, confirming it's a bone reference.
pub const HITGROUPIDDEF_COMMAND_POOL: ParamCommandPool = &[
    (0x11E501D5, 1, "hit_type"),         // [D:0~3] enum, 4 types
    (0x3284A82D, 5, "offset_x"),         // [D:always 0] unused
    (0x42EE5CA2, 5, "offset_y"),         // [D:always 0] unused
    (0x458398BB, 5, "offset_z"),         // [D:-5~6] 6 unique, mostly 0
    (0x6514C413, 5, "radius"),           // [D:-54~700] 146 unique
    (0x7395D184, 1, "enable_state"),     // [D:0~1] boolean
    (0x8B1AA53F, 5, "scale_x"),          // [D:-2000~2700] 306 unique
    (0xACE03D8E, 5, "scale_y"),          // [D:always 0] unused
    (0xC3656A99, 1, "bone_hash"),        // [D:HASH] 5856 unique
    (0xD32D39ED, 1, "parent_bone_hash"), // [D:HASH] 141 unique. was "is_enabled" — NOT boolean!
    (0xDBE70D18, 5, "scale_z"),          // [D:always 0] unused
    (0xDC8AC901, 5, "group_id"),         // [D:-12~150] float, 59 unique
    (0xEDD1C108, 1, "model_hash"),       // [D:HASH] 587 unique
    (0xF89A41E1, 1, "collision_flags"),  // [D:0~2] enum, 3 types
    (0xFC1D95A9, 5, "joint_offset"),     // [D:-40~85] 86 unique
];

pub fn hitgroupiddef_entry_to_json_value(entry: &HitGroupIdDefEntry) -> Value {
    entry_commands_to_named_json(entry.entry_id, &entry.commands, HITGROUPIDDEF_COMMAND_POOL)
}

pub fn hitgroupiddef_entry_from_json_value(v: &Value) -> Result<HitGroupIdDefEntry, String> {
    let (entry_id, commands) = entry_commands_from_named_json(v, HITGROUPIDDEF_COMMAND_POOL)?;
    Ok(HitGroupIdDefEntry { entry_id, commands })
}

#[derive(Debug, Clone, PartialEq)]
pub struct HitGroupIdDefEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
}

impl Serialize for HitGroupIdDefEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        hitgroupiddef_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for HitGroupIdDefEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        hitgroupiddef_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitGroupIdDefData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<HitGroupIdDefEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered_index_times_four(HITGROUPIDDEF_COMMAND_POOL)
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(HITGROUPIDDEF_COMMAND_POOL, field_specs)
}

fn parse_entry_from_raw(
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
    entry_id: u32,
) -> HitGroupIdDefEntry {
    let commands = parse_commands_map_from_entry_row(raw, field_specs);
    HitGroupIdDefEntry { entry_id, commands }
}

fn entry_matches_raw(
    entry: &HitGroupIdDefEntry,
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
) -> bool {
    entry_row_matches_command_map(&entry.commands, raw, field_specs)
}

pub fn parse_hitgroupiddef(data: &[u8]) -> Result<HitGroupIdDefData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(parse_entry_from_raw(raw, &file.field_specs, id));
    }

    Ok(HitGroupIdDefData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_hitgroupiddef(b: &HitGroupIdDefData) -> Result<Vec<u8>, String> {
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
        if entry_index < b.source_entries_raw.len()
            && b.source_entries_raw[entry_index].len() == entry_size
        {
            let r = &b.source_entries_raw[entry_index];
            if entry_matches_raw(entry, r, &field_specs) {
                entries_raw.push(b.source_entries_raw[entry_index].clone());
                continue;
            }
        }

        let mut raw = if entry_index < b.source_entries_raw.len()
            && b.source_entries_raw[entry_index].len() == entry_size
        {
            b.source_entries_raw[entry_index].clone()
        } else {
            vec![0u8; entry_size]
        };

        for spec in &field_specs {
            let o = spec.entry_offset as usize;
            if o + 4 > raw.len() {
                return Err(
                    "hitgroupiddef entry field offset out of range for entry_size".to_string(),
                );
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

    const SAMPLE_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\hitgroupiddef.bin";

    #[test]
    fn hitgroupiddef_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read hitgroupiddef sample file");

        let parsed =
            parse_hitgroupiddef(&source).expect("failed to parse hitgroupiddef sample file");
        let rebuilt =
            build_hitgroupiddef(&parsed).expect("failed to rebuild hitgroupiddef sample file");
        assert_eq!(rebuilt, source);

        assert!(
            !parsed.entries.is_empty(),
            "hitgroupiddef sample has no entries"
        );

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
            build_hitgroupiddef(&with_added).expect("failed to build hitgroupiddef after add");
        let added_parsed =
            parse_hitgroupiddef(&added_bytes).expect("failed to parse hitgroupiddef after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(
            added_parsed.entries.last().map(|entry| entry.entry_id),
            Some(next_id)
        );

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_hitgroupiddef(&with_updated).expect("failed to build hitgroupiddef after update");
        let updated_parsed = parse_hitgroupiddef(&updated_bytes)
            .expect("failed to parse hitgroupiddef after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_hitgroupiddef(&with_deleted).expect("failed to build hitgroupiddef after delete");
        let deleted_parsed = parse_hitgroupiddef(&deleted_bytes)
            .expect("failed to parse hitgroupiddef after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
