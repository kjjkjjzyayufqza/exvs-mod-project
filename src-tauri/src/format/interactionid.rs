use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};

pub const INTERACTIONID_ENTRY_SIZE: u32 = 124;
pub const INTERACTIONID_CMD_COUNT: u32 = 31;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct InteractionIdEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub damage: i32,               // 0x00C57BA3 +0x000 kind=2 base damage value
    pub correction_pct: i32,       // 0x06A06715 +0x004 kind=2 combo correction (usually 100)
    pub interact_target_hash: u32, // 0x08A3B0DC +0x008 kind=1 target interaction hash ref
    pub receive_mode_hash: u32,    // 0x148C8D49 +0x00C kind=1 receive-side interaction hash
    pub interact_type: u32,        // 0x154EF1ED +0x010 kind=1 interaction type enum
    pub interact_range: f32,       // 0x161FBB4F +0x014 kind=5 interaction range [6..10]
    pub priority: u32,             // 0x18DC6CD1 +0x018 kind=1 interaction priority
    pub stun_value: i32,           // 0x22C412CA +0x01C kind=2 stun inflicted
    pub hit_effect_id: u32,        // 0x270D2FD5 +0x020 kind=1 hit visual effect type
    pub down_value: i32,           // 0x2A6A7D8F +0x024 kind=2 down gauge contribution
    pub guard_interact_hash: u32,  // 0x2EBC0DC3 +0x028 kind=1 guard interaction hash (OB-only)
    pub stun_frame: i32,           // 0x3626F732 +0x02C kind=2 stun duration frames
    pub se_hash: u32,              // 0x3D457926 +0x030 kind=1 sound effect hash
    pub knockback_force: i32,      // 0x477C2470 +0x034 kind=2 knockback force value
    pub unk_barrier_hash: u32,     // 0x50BC9332 +0x038 kind=1 barrier interaction hash
    pub guard_type: u32,           // 0x55815B3B +0x03C kind=1 guard type {0=none,1=normal,2=super}
    pub damage_rate: f32,          // 0x5E1DC3E4 +0x040 kind=5 damage multiplier [1.0..1.1]
    pub attack_property: u32,      // 0x66957C67 +0x044 kind=1 attack attribute/element type
    pub interact_id: u32,          // 0x6A0CCB8A +0x048 kind=1 unique interaction identifier
    pub is_blockable: u32,         // 0x720584BA +0x04C kind=1 can be blocked {0,1}
    pub wall_bounce_type: u32,     // 0x8029185D +0x050 kind=1 wall bounce behavior (OB-only)
    pub slide_type: u32,           // 0x90E41A78 +0x054 kind=1 ground slide behavior (OB-only)
    pub hitstop_frame: i32,        // 0xA1A98180 +0x058 kind=2 hit-freeze duration frames
    pub knockback_distance: i32,   // 0xAD173242 +0x05C kind=2 knockback travel distance
    pub ground_bounce: i32,        // 0xB69B7051 +0x060 kind=2 ground bounce behavior
    pub knockback_type: u32,       // 0xBB0F3D7F +0x064 kind=1 knockback direction type
    pub can_tech: i32,             // 0xC1361D23 +0x068 kind=2 can recover/tech after hit
    pub hit_level: i32,            // 0xD5D4F8DB +0x06C kind=2 hit priority level
    pub guard_break_level: i32,    // 0xEFEA436F +0x070 kind=2 guard break strength
    pub untechable_frame: i32,     // 0xFA03CBDA +0x074 kind=2 forced untechable duration (OB-only)
    pub interact_category: u32,    // 0xFABCA946 +0x078 kind=1 interaction category enum
}

pub const INTERACTIONID_FIELD_HASHES: [(u32, u32, u32); 31] = [
    (0x00C57BA3, 0x000, 2),
    (0x06A06715, 0x004, 2),
    (0x08A3B0DC, 0x008, 1),
    (0x148C8D49, 0x00C, 1),
    (0x154EF1ED, 0x010, 1),
    (0x161FBB4F, 0x014, 5),
    (0x18DC6CD1, 0x018, 1),
    (0x22C412CA, 0x01C, 2),
    (0x270D2FD5, 0x020, 1),
    (0x2A6A7D8F, 0x024, 2),
    (0x2EBC0DC3, 0x028, 1),
    (0x3626F732, 0x02C, 2),
    (0x3D457926, 0x030, 1),
    (0x477C2470, 0x034, 2),
    (0x50BC9332, 0x038, 1),
    (0x55815B3B, 0x03C, 1),
    (0x5E1DC3E4, 0x040, 5),
    (0x66957C67, 0x044, 1),
    (0x6A0CCB8A, 0x048, 1),
    (0x720584BA, 0x04C, 1),
    (0x8029185D, 0x050, 1),
    (0x90E41A78, 0x054, 1),
    (0xA1A98180, 0x058, 2),
    (0xAD173242, 0x05C, 2),
    (0xB69B7051, 0x060, 2),
    (0xBB0F3D7F, 0x064, 1),
    (0xC1361D23, 0x068, 2),
    (0xD5D4F8DB, 0x06C, 2),
    (0xEFEA436F, 0x070, 2),
    (0xFA03CBDA, 0x074, 2),
    (0xFABCA946, 0x078, 1),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionIdData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<InteractionIdEntry>,
    pub trailing_data: Vec<u8>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    INTERACTIONID_FIELD_HASHES
        .iter()
        .map(|(hash, entry_offset, kind)| ParamFieldSpec {
            hash: *hash,
            entry_offset: *entry_offset,
            flags: 0,
            kind: *kind,
        })
        .collect()
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    if field_specs.len() != INTERACTIONID_FIELD_HASHES.len() {
        return Err(format!(
            "interactionid command count mismatch: file has {}, expected {}",
            field_specs.len(),
            INTERACTIONID_FIELD_HASHES.len()
        ));
    }
    for (index, spec) in field_specs.iter().enumerate() {
        let (expected_hash, expected_offset, expected_kind) = INTERACTIONID_FIELD_HASHES[index];
        if spec.hash != expected_hash
            || spec.entry_offset != expected_offset
            || spec.kind != expected_kind
        {
            return Err(format!(
                "interactionid command mismatch at index {}: got (hash=0x{:08X}, offset=0x{:X}, kind={}), expected (hash=0x{:08X}, offset=0x{:X}, kind={})",
                index,
                spec.hash,
                spec.entry_offset,
                spec.kind,
                expected_hash,
                expected_offset,
                expected_kind
            ));
        }
    }
    Ok(())
}

pub fn parse_interactionid(data: &[u8]) -> Result<InteractionIdData, String> {
    let file = read_param_binary(data)?;
    if file.header.entry_size != INTERACTIONID_ENTRY_SIZE {
        return Err(format!(
            "interactionid entry_size mismatch: file has {}, expected {}",
            file.header.entry_size, INTERACTIONID_ENTRY_SIZE
        ));
    }
    if file.header.commands_count != INTERACTIONID_CMD_COUNT {
        return Err(format!(
            "interactionid command count mismatch: file has {}, expected {}",
            file.header.commands_count, INTERACTIONID_CMD_COUNT
        ));
    }
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        if raw.len() != INTERACTIONID_ENTRY_SIZE as usize {
            return Err(format!(
                "interactionid row {} size {} != expected {}",
                i,
                raw.len(),
                INTERACTIONID_ENTRY_SIZE
            ));
        }
        let mut cursor = Cursor::new(raw.as_slice());
        let mut entry = InteractionIdEntry::read(&mut cursor).map_err(|e| e.to_string())?;
        entry.entry_id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(entry);
    }

    Ok(InteractionIdData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
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

    let entry_size = INTERACTIONID_ENTRY_SIZE as usize;
    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for entry in &b.entries {
        let mut raw = vec![0u8; entry_size];
        let mut cursor = Cursor::new(&mut raw[..]);
        entry
            .write(&mut cursor)
            .map_err(|err| format!("interactionid write entry: {}", err))?;
        if cursor.position() as usize > entry_size {
            return Err("interactionid encoded entry larger than entry_size".to_string());
        }
        entries_raw.push(raw);
    }

    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = INTERACTIONID_CMD_COUNT;
    header.entry_size = INTERACTIONID_ENTRY_SIZE;

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
        "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\interactionid.bin";

    #[test]
    fn interactionid_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read interactionid sample file");

        let parsed = parse_interactionid(&source).expect("failed to parse interactionid sample file");
        let rebuilt =
            build_interactionid(&parsed).expect("failed to rebuild interactionid sample file");
        assert_eq!(rebuilt, source);

        assert!(!parsed.entries.is_empty(), "interactionid sample has no entries");

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
        assert_eq!(added_parsed.entries.last().map(|entry| entry.entry_id), Some(next_id));

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_interactionid(&with_updated).expect("failed to build interactionid after update");
        let updated_parsed =
            parse_interactionid(&updated_bytes).expect("failed to parse interactionid after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_interactionid(&with_deleted).expect("failed to build interactionid after delete");
        let deleted_parsed =
            parse_interactionid(&deleted_bytes).expect("failed to parse interactionid after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
