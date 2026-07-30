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
// Data-verified: 433 files, 10214 entries. cmd_count={27} (4 pool entries are PHANTOM).
// Note: hitstop_frame/knockback_distance/ground_bounce have max near u32::MAX → likely signed i32.
// Field semantics per docs/hitbox-research/03-hit-effect-taxonomy.md §1 (binary-proven consumers).
// Fields marked UNVERIFIED have no proven read site; their names are legacy guesses.
pub const INTERACTIONID_COMMAND_POOL: ParamCommandPool = &[
    (0x00C57BA3, 2, "damage"), // PROVEN: displayed damage 1:1, subtracted from victim HP with truncation (03 §2)
    (0x06A06715, 2, "correction_pct"), // PROVEN consumer: decrements victim damage-correction budget at slot+44, clamped >= 0 (03 §1). Constant 100 on melee rows; per-hit correction lives elsewhere
    (0x08A3B0DC, 1, "interact_target_hash"), // UNVERIFIED name: subsystem selector (melee vs other), NOT a bone reference (01 §3.5)
    (0x148C8D49, 1, "damage_mult_gate"), // PROVEN: gates a global damage multiplier (system param entry 0x58427419 field 0xE50C0C6F); NOT an attack/receive side flag (03 §1). was "receive_mode"
    (0x154EF1ED, 1, "visual_effect_class"), // PROVEN: visual hit-effect class only, indexes the 28-byte-stride effect resource table at 0x141349F60; no gameplay effect (03 §1). was "interact_type"
    (0x161FBB4F, 5, "victim_gauge_add"), // PROVEN: NOT a distance; added to a 0-100 clamped gauge at victim slot+56 (03 §1). was "interact_range"
    (0x18DC6CD1, 1, "knockback_dir_mode_b"), // PROVEN: knockback direction mode (enum 0-5), second of two (03 §1). was "priority"
    (0x22C412CA, 2, "stun_value"), // UNVERIFIED: no read site in the whole binary; cannot be the stun switch (03 §4.1)
    (0x270D2FD5, 1, "hit_effect_id"), // UNVERIFIED: [D:1~9] enum, never 0
    (0x2A6A7D8F, 2, "down_value"), // PROVEN: decrements victim knockdown budget at slot+24; value = wiki down value x100; exceeding the remaining budget forces knockdown (03 §3)
    (0x2EBC0DC3, 1, "down_accum_quarter"), // PROVEN: engine reads it; scales knockdown accumulation to 1/4 (03 §1). PHANTOM in data files. was "guard_interact_hash"
    (0x3626F732, 2, "stun_frame"),         // UNVERIFIED: no read site in the whole binary (03 §4.1)
    (0x3D457926, 1, "se_hash"),            // UNVERIFIED: [D:HASH] 184 unique
    (0x477C2470, 2, "rehit_interval"), // PROVEN: re-hit interval / hit-record lifetime, floor 600 (03 §1). was "knockback_force"
    (0x50BC9332, 1, "unk_barrier_hash"), // UNVERIFIED: no read site found (03 §4.2)
    (0x55815B3B, 1, "knockback_dir_mode_a"), // PROVEN: knockback direction mode (enum 0-5), first of two (03 §1). was "guard_type"
    (0x5E1DC3E4, 5, "damage_rate"),          // UNVERIFIED: [D:0~4.0] 28 unique
    (0x66957C67, 1, "target_filter"), // PROVEN: target-relation filter (enum 0-7); decides which entities the interaction can affect and gates reflection; NOT an attack property (03 §1). was "attack_property"
    (0x6A0CCB8A, 1, "interact_id"),   // UNVERIFIED: no read site found (03 §4.2)
    (0x720584BA, 1, "interaction_class"), // PROVEN: classification enum, not a magnitude; all 5 read sites only test value in {0,2}; outside the set enables barrier/IF interactions (03 §1). was "block_level"
    (0x8029185D, 1, "wall_bounce_type"), // UNVERIFIED: PHANTOM — not in any data file, no read site found (03 §4.2)
    (0x90E41A78, 1, "damage_mult_gate_2"), // PROVEN: engine reads it; gates a second damage multiplier (03 §1). PHANTOM in data files. was "slide_type"
    (0xA1A98180, 2, "hitstop_frame"), // UNVERIFIED: no read site found (03 §4.2). [D:signed] max=0xFFFFFFFE
    (0xAD173242, 2, "knockback_distance"), // UNVERIFIED: no read site found (03 §4.2). [D:signed]
    (0xB69B7051, 2, "ground_bounce"), // UNVERIFIED: no read site found (03 §4.2). [D:signed]
    (0xBB0F3D7F, 1, "knockback_type"), // Mechanism PROVEN: switch-mapped to weights {0->0, 1->25, 2->125, 3->1000, 4->10, else->100} stored in hit event +64; "hit-reaction severity" reading is UNVERIFIED (03 §1, §4.3)
    (0xC1361D23, 2, "can_tech"),       // UNVERIFIED: [D:0~48] 32 unique
    (0xD5D4F8DB, 2, "hit_level"),      // UNVERIFIED: no read site found (03 §4.2)
    (0xEFEA436F, 2, "max_hit_count"), // PROVEN: max hits of one interaction against the same target (03 §1). was "guard_break_level"
    (0xFA03CBDA, 2, "untechable_frame"), // UNVERIFIED: PHANTOM — not in any data file, no read site found (03 §4.2)
    (0xFABCA946, 1, "interact_category"), // UNVERIFIED: no read site found (03 §4.2)
];

pub fn interactionid_entry_to_json_value(entry: &InteractionIdEntry) -> Value {
    entry_commands_to_named_json(entry.entry_id, &entry.commands, INTERACTIONID_COMMAND_POOL)
}

pub fn interactionid_entry_from_json_value(v: &Value) -> Result<InteractionIdEntry, String> {
    let (entry_id, commands) = entry_commands_from_named_json(v, INTERACTIONID_COMMAND_POOL)?;
    Ok(InteractionIdEntry { entry_id, commands })
}

#[derive(Debug, Clone, PartialEq)]
pub struct InteractionIdEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
}

impl Serialize for InteractionIdEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        interactionid_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for InteractionIdEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        interactionid_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionIdData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<InteractionIdEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered(INTERACTIONID_COMMAND_POOL)
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(INTERACTIONID_COMMAND_POOL, field_specs)
}

fn parse_entry_from_raw(
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
    entry_id: u32,
) -> InteractionIdEntry {
    let commands = parse_commands_map_from_entry_row(raw, field_specs);
    InteractionIdEntry { entry_id, commands }
}

fn entry_matches_raw(
    entry: &InteractionIdEntry,
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
) -> bool {
    entry_row_matches_command_map(&entry.commands, raw, field_specs)
}

pub fn parse_interactionid(data: &[u8]) -> Result<InteractionIdData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(parse_entry_from_raw(raw, &file.field_specs, id));
    }

    Ok(InteractionIdData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_interactionid(b: &InteractionIdData) -> Result<Vec<u8>, String> {
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
                    "interactionid entry field offset out of range for entry_size".to_string(),
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

    const SAMPLE_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\interactionid.bin";

    #[test]
    fn interactionid_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read interactionid sample file");

        let parsed =
            parse_interactionid(&source).expect("failed to parse interactionid sample file");
        let rebuilt =
            build_interactionid(&parsed).expect("failed to rebuild interactionid sample file");
        assert_eq!(rebuilt, source);

        assert!(
            !parsed.entries.is_empty(),
            "interactionid sample has no entries"
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
            build_interactionid(&with_added).expect("failed to build interactionid after add");
        let added_parsed =
            parse_interactionid(&added_bytes).expect("failed to parse interactionid after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(
            added_parsed.entries.last().map(|entry| entry.entry_id),
            Some(next_id)
        );

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_interactionid(&with_updated).expect("failed to build interactionid after update");
        let updated_parsed = parse_interactionid(&updated_bytes)
            .expect("failed to parse interactionid after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_interactionid(&with_deleted).expect("failed to build interactionid after delete");
        let deleted_parsed = parse_interactionid(&deleted_bytes)
            .expect("failed to parse interactionid after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
