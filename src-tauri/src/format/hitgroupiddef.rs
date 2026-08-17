use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

use serde_json::Value;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};
use crate::format::param_entry_schema::{
    entry_commands_from_named_json, entry_commands_to_named_json, entry_row_matches_command_map,
    expected_field_specs_ordered, min_entry_data_size_for_specs, parse_commands_map_from_entry_row,
    validate_file_specs_kind_match_pool, ParamCommandPool,
};

// Please keep comments for analysis.
// Data-verified: 432 files, 17677 entries. cmd_count={15}.
// Binary-proven schema (docs/hitbox-research/02-hitbox-volume-engine.md):
// a row defines ONE SPHERE in bone space. Center = (0x8B1AA53F, 0xFC1D95A9, 0x6514C413),
// radius = 0xDC8AC901, attached to bone 0xD32D39ED on the skeleton selected by 0xEDD1C108.
// 0xC3656A99 is a foreign key to interactionid.entry_id (armed via MSC func_148), NOT a bone hash.
// The five "unused_*" fields are DEAD: the engine never reads them (02 §7); they are kept
// only for byte-faithful round-trips.
pub const HITGROUPIDDEF_COMMAND_POOL: ParamCommandPool = &[
    (0x11E501D5, 1, "hit_type"), // [D:0~3] enum. Not part of volume construction; read once per active group from the LAST row, stored for hit resolution (02 §7)
    (0x3284A82D, 5, "unused_3284a82d"), // DEAD: engine never reads (02 §7). [D:always 0]. was "offset_x"
    (0x42EE5CA2, 5, "unused_42ee5ca2"), // DEAD: hash appears 0 times in the binary (02 §7). [D:always 0]. was "offset_y"
    (0x458398BB, 5, "unused_458398bb"), // DEAD: engine never reads (02 §7). was "offset_z"
    (0x6514C413, 5, "center_z"), // Sphere center Z, forward offset in bone space (02 §2). was "radius"
    (0x7395D184, 1, "shape_mode"), // 0 = static sphere, 1 = frame-swept capsule between prev/current frame centers (02 §4). was "enable_state"
    (0x8B1AA53F, 5, "center_x"),   // Sphere center X in bone space (02 §2). was "scale_x"
    (0xACE03D8E, 5, "unused_ace03d8e"), // DEAD: engine never reads (02 §7). [D:always 0]. was "scale_y"
    (0xC3656A99, 1, "interaction_id"), // FK to interactionid.entry_id; class-0 rows are selected by this key when MSC func_148 arms it (01 §2, 02 §6). was "bone_hash"
    (0xD32D39ED, 1, "bone_id"), // Attachment bone id, looked up in the skeleton bone-id->index map (02 §3). was "parent_bone_hash"
    (0xDBE70D18, 5, "unused_dbe70d18"), // DEAD: engine never reads (02 §7). [D:always 0]. was "scale_z"
    (0xDC8AC901, 5, "sphere_radius"), // Sphere radius (f32); untransformed by the bone matrix (02 §2-3). was "group_id"
    (0xEDD1C108, 1, "model_hash"), // Actor/model selector: decides which skeleton the sphere attaches to; class-1 hurtbox index key (02 §3, §6)
    (0xF89A41E1, 1, "collision_flags"), // Row class: 0 = attack, 1 = hurtbox, 2 = third class (02 §6)
    (0xFC1D95A9, 5, "center_y"),        // Sphere center Y in bone space (02 §2). was "joint_offset"
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
    expected_field_specs_ordered(HITGROUPIDDEF_COMMAND_POOL)
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
