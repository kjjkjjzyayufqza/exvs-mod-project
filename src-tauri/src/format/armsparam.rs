use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};

pub const ARMSPARAM_ENTRY_SIZE: u32 = 200;
pub const ARMSPARAM_CMD_COUNT: u32 = 48;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct ArmsParamEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub is_enabled: u32,             // 0x020A35DD +0x000 kind=1 {0,1}
    pub unk_04_reserved: u32,        // 0x02D35F32 +0x004 kind=1 always 0
    pub is_continuous_fire: u32,     // 0x0496C136 +0x008 kind=1 {0,1}
    pub reload_start_frame: i32,     // 0x04A2CFD6 +0x00C kind=2 [0,1020]
    pub reload_time_total: i32,      // 0x103171AE +0x010 kind=2 [0,1800]
    pub reload_type: u32,            // 0x11DEE0C8 +0x014 kind=1 {0..3}
    pub is_charge_weapon: u32,       // 0x1348893F +0x018 kind=1 {0,1}
    pub can_move_while_firing: u32,  // 0x1E8E41EF +0x01C kind=1 {0,1}
    pub homing_angle: i32,           // 0x31427CC3 +0x020 kind=2 [0,180]
    pub induction_rate: f32,         // 0x3A1D6254 +0x024 kind=5 [0,1]
    pub homing_start_rate: f32,      // 0x3BC65821 +0x028 kind=5 [0,1]
    pub homing_end_rate: f32,        // 0x3CAB9C38 +0x02C kind=5 [0,1]
    pub ammo_count: i32,             // 0x4961274C +0x030 kind=2 [1,120]
    pub damage_correction_rate: f32, // 0x4A7796DB +0x034 kind=5 [0,1]
    pub down_correction_rate: f32,   // 0x4BACACAE +0x038 kind=5 [0,1]
    pub shot_type: i32,              // 0x4C527468 +0x03C kind=2 [0,3]
    pub damage: i32,                 // 0x4C84F7C0 +0x040 kind=2 [0,1500]
    pub stun_correction_rate: f32,   // 0x4D1A52C2 +0x044 kind=5 [0,1]
    pub down_value: i32,             // 0x4E692ACD +0x048 kind=2 [0,120]
    pub cancel_route_type: u32,      // 0x596FC1C3 +0x04C kind=1 {0..2}
    pub is_vernier: u32,             // 0x5B072B6C +0x050 kind=1 {0,1}
    pub cooldown_frame: i32,         // 0x67364138 +0x054 kind=2 [0,1800]
    pub startup_frame: i32,          // 0x73A5FF40 +0x058 kind=2 [0,1020]
    pub active_frame: i32,           // 0x74C83B59 +0x05C kind=2 [0,1020]
    pub recovery_frame: i32,         // 0x89382014 +0x060 kind=2 [0,1800]
    pub total_duration_frame: i32,   // 0x8E55E40D +0x064 kind=2 [0,1800]
    pub landing_recovery_frame: i32, // 0x9AC65A75 +0x068 kind=2 [0,1020]
    pub stun_value: i32,             // 0xA06CAAD5 +0x06C kind=2 [0,60]
    pub boost_consumption_rate: f32, // 0xA2CF099B +0x070 kind=5 [0,1]
    pub range: i32,                  // 0xA353F222 +0x074 kind=2 [0,600]
    pub muzzle_correction_rate: f32, // 0xA479F7F7 +0x078 kind=5 [0,1]
    pub reload_per_shot_frame: i32,  // 0xA502BCF2 +0x07C kind=2 [0,1800]
    pub reload_lock_frame: i32,      // 0xA635CFC2 +0x080 kind=2 [0,120]
    pub overheat_frame: i32,         // 0xAB9AEF6C +0x084 kind=2 [0,1200]
    pub charge_frame: i32,           // 0xABC33F14 +0x088 kind=2 [0,600]
    pub guard_break_type: u32,       // 0xAC243293 +0x08C kind=1 {0..2}
    pub landing_behavior_type: u32,  // 0xB669A42A +0x090 kind=1 {0..2}
    pub is_super_armor: u32,         // 0xB686E88C +0x094 kind=1 {0,1}
    pub bullet_type: u32,            // 0xBB93D195 +0x098 kind=1 {0..7}
    pub tracking_speed_rate: f32,    // 0xD37EC761 +0x09C kind=5 [0,1]
    pub bullet_speed_rate: f32,      // 0xD5C8390D +0x0A0 kind=5 [0,1]
    pub action_label_offset: u32,    // 0xE6213731 +0x0A4 kind=7 string
    pub action_label_size: u32,      // +0x0A8 padding for 8-byte string slot
    pub ammo_reload_wait_frame: i32, // 0xEDC16AE3 +0x0AC kind=2 [0,900]
    pub hit_effect_type: u32,        // 0xEF3F41B3 +0x0B0 kind=1 {0..5}
    pub resource_label_offset: u32,  // 0xF3C4CAE9 +0x0B4 kind=7 string
    pub resource_label_size: u32,    // +0x0B8 padding for 8-byte string slot
    pub bullet_count_per_shot: i32,  // 0xF8AEEC77 +0x0BC kind=2 [0,150]
    pub firing_interval_frame: i32,  // 0xF8E59F33 +0x0C0 kind=2 [0,120]
    pub full_charge_frame: i32,      // 0xF952D49B +0x0C4 kind=2 [0,1800]
}

pub const ARMSPARAM_FIELD_HASHES: [(u32, u32, u32); 48] = [
    (0x020A35DD, 0x000, 1),
    (0x02D35F32, 0x004, 1),
    (0x0496C136, 0x008, 1),
    (0x04A2CFD6, 0x00C, 2),
    (0x103171AE, 0x010, 2),
    (0x11DEE0C8, 0x014, 1),
    (0x1348893F, 0x018, 1),
    (0x1E8E41EF, 0x01C, 1),
    (0x31427CC3, 0x020, 2),
    (0x3A1D6254, 0x024, 5),
    (0x3BC65821, 0x028, 5),
    (0x3CAB9C38, 0x02C, 5),
    (0x4961274C, 0x030, 2),
    (0x4A7796DB, 0x034, 5),
    (0x4BACACAE, 0x038, 5),
    (0x4C527468, 0x03C, 2),
    (0x4C84F7C0, 0x040, 2),
    (0x4D1A52C2, 0x044, 5),
    (0x4E692ACD, 0x048, 2),
    (0x596FC1C3, 0x04C, 1),
    (0x5B072B6C, 0x050, 1),
    (0x67364138, 0x054, 2),
    (0x73A5FF40, 0x058, 2),
    (0x74C83B59, 0x05C, 2),
    (0x89382014, 0x060, 2),
    (0x8E55E40D, 0x064, 2),
    (0x9AC65A75, 0x068, 2),
    (0xA06CAAD5, 0x06C, 2),
    (0xA2CF099B, 0x070, 5),
    (0xA353F222, 0x074, 2),
    (0xA479F7F7, 0x078, 5),
    (0xA502BCF2, 0x07C, 2),
    (0xA635CFC2, 0x080, 2),
    (0xAB9AEF6C, 0x084, 2),
    (0xABC33F14, 0x088, 2),
    (0xAC243293, 0x08C, 1),
    (0xB669A42A, 0x090, 1),
    (0xB686E88C, 0x094, 1),
    (0xBB93D195, 0x098, 1),
    (0xD37EC761, 0x09C, 5),
    (0xD5C8390D, 0x0A0, 5),
    (0xE6213731, 0x0A4, 7),
    (0xEDC16AE3, 0x0AC, 2),
    (0xEF3F41B3, 0x0B0, 1),
    (0xF3C4CAE9, 0x0B4, 7),
    (0xF8AEEC77, 0x0BC, 2),
    (0xF8E59F33, 0x0C0, 2),
    (0xF952D49B, 0x0C4, 2),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArmsParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<ArmsParamEntry>,
    pub trailing_data: Vec<u8>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    ARMSPARAM_FIELD_HASHES
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
    if field_specs.len() != ARMSPARAM_FIELD_HASHES.len() {
        return Err(format!(
            "armsparam command count mismatch: file has {}, expected {}",
            field_specs.len(),
            ARMSPARAM_FIELD_HASHES.len()
        ));
    }
    for (index, spec) in field_specs.iter().enumerate() {
        let (expected_hash, expected_offset, expected_kind) = ARMSPARAM_FIELD_HASHES[index];
        if spec.hash != expected_hash
            || spec.entry_offset != expected_offset
            || spec.kind != expected_kind
        {
            return Err(format!(
                "armsparam command mismatch at index {}: got (hash=0x{:08X}, offset=0x{:X}, kind={}), expected (hash=0x{:08X}, offset=0x{:X}, kind={})",
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

pub fn parse_armsparam(data: &[u8]) -> Result<ArmsParamData, String> {
    let file = read_param_binary(data)?;
    if file.header.entry_size != ARMSPARAM_ENTRY_SIZE {
        return Err(format!(
            "armsparam entry_size mismatch: file has {}, expected {}",
            file.header.entry_size, ARMSPARAM_ENTRY_SIZE
        ));
    }
    if file.header.commands_count != ARMSPARAM_CMD_COUNT {
        return Err(format!(
            "armsparam command count mismatch: file has {}, expected {}",
            file.header.commands_count, ARMSPARAM_CMD_COUNT
        ));
    }
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        if raw.len() != ARMSPARAM_ENTRY_SIZE as usize {
            return Err(format!(
                "armsparam row {} size {} != expected {}",
                i,
                raw.len(),
                ARMSPARAM_ENTRY_SIZE
            ));
        }
        let mut cursor = Cursor::new(raw.as_slice());
        let mut entry = ArmsParamEntry::read(&mut cursor).map_err(|e| e.to_string())?;
        entry.entry_id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(entry);
    }

    Ok(ArmsParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
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

    let entry_size = ARMSPARAM_ENTRY_SIZE as usize;
    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for entry in &b.entries {
        let mut raw = vec![0u8; entry_size];
        let mut cursor = Cursor::new(&mut raw[..]);
        entry
            .write(&mut cursor)
            .map_err(|err| format!("armsparam write entry: {}", err))?;
        if cursor.position() as usize > entry_size {
            return Err("armsparam encoded entry larger than entry_size".to_string());
        }
        entries_raw.push(raw);
    }

    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = ARMSPARAM_CMD_COUNT;
    header.entry_size = ARMSPARAM_ENTRY_SIZE;

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
