use serde::{Deserialize, Serialize};

pub const INTERACTIONID_ENTRY_SIZE: u32 = 124;
pub const INTERACTIONID_CMD_COUNT: u32 = 31;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionIdEntry {
    pub entry_id: u32,
    pub damage: i32,                   // 0x00C57BA3 +0x000 kind=2 base damage value
    pub correction_pct: i32,           // 0x06A06715 +0x004 kind=2 combo correction (usually 100)
    pub interact_target_hash: u32,     // 0x08A3B0DC +0x008 kind=1 target interaction hash ref
    pub receive_mode_hash: u32,         // 0x148C8D49 +0x00C kind=1 receive-side interaction hash
    pub interact_type: u32,            // 0x154EF1ED +0x010 kind=1 interaction type enum
    pub interact_range: f32,           // 0x161FBB4F +0x014 kind=5 interaction range [6..10]
    pub priority: u32,                 // 0x18DC6CD1 +0x018 kind=1 interaction priority
    pub stun_value: i32,               // 0x22C412CA +0x01C kind=2 stun inflicted
    pub hit_effect_id: u32,            // 0x270D2FD5 +0x020 kind=1 hit visual effect type
    pub down_value: i32,               // 0x2A6A7D8F +0x024 kind=2 down gauge contribution
    pub guard_interact_hash: u32,       // 0x2EBC0DC3 +0x028 kind=1 guard interaction hash (OB-only)
    pub stun_frame: i32,               // 0x3626F732 +0x02C kind=2 stun duration frames
    pub se_hash: u32,                  // 0x3D457926 +0x030 kind=1 sound effect hash
    pub knockback_force: i32,          // 0x477C2470 +0x034 kind=2 knockback force value
    pub unk_barrier_hash: u32,         // 0x50BC9332 +0x038 kind=1 barrier interaction hash
    pub guard_type: u32,               // 0x55815B3B +0x03C kind=1 guard type {0=none,1=normal,2=super}
    pub damage_rate: f32,              // 0x5E1DC3E4 +0x040 kind=5 damage multiplier [1.0..1.1]
    pub attack_property: u32,           // 0x66957C67 +0x044 kind=1 attack attribute/element type
    pub interact_id: u32,              // 0x6A0CCB8A +0x048 kind=1 unique interaction identifier
    pub is_blockable: u32,             // 0x720584BA +0x04C kind=1 can be blocked {0,1}
    pub wall_bounce_type: u32,          // 0x8029185D +0x050 kind=1 wall bounce behavior (OB-only)
    pub slide_type: u32,                // 0x90E41A78 +0x054 kind=1 ground slide behavior (OB-only)
    pub hitstop_frame: i32,            // 0xA1A98180 +0x058 kind=2 hit-freeze duration frames
    pub knockback_distance: i32,       // 0xAD173242 +0x05C kind=2 knockback travel distance
    pub ground_bounce: i32,            // 0xB69B7051 +0x060 kind=2 ground bounce behavior
    pub knockback_type: u32,           // 0xBB0F3D7F +0x064 kind=1 knockback direction type
    pub can_tech: i32,                 // 0xC1361D23 +0x068 kind=2 can recover/tech after hit
    pub hit_level: i32,               // 0xD5D4F8DB +0x06C kind=2 hit priority level
    pub guard_break_level: i32,        // 0xEFEA436F +0x070 kind=2 guard break strength
    pub untechable_frame: i32,          // 0xFA03CBDA +0x074 kind=2 forced untechable duration (OB-only)
    pub interact_category: u32,         // 0xFABCA946 +0x078 kind=1 interaction category enum
}

pub const INTERACTIONID_FIELD_HASHES: [(u32, u32, u32); 31] = [
    (0x00C57BA3, 0x000, 2), (0x06A06715, 0x004, 2), (0x08A3B0DC, 0x008, 1),
    (0x148C8D49, 0x00C, 1), (0x154EF1ED, 0x010, 1), (0x161FBB4F, 0x014, 5),
    (0x18DC6CD1, 0x018, 1), (0x22C412CA, 0x01C, 2), (0x270D2FD5, 0x020, 1),
    (0x2A6A7D8F, 0x024, 2), (0x2EBC0DC3, 0x028, 1), (0x3626F732, 0x02C, 2),
    (0x3D457926, 0x030, 1), (0x477C2470, 0x034, 2), (0x50BC9332, 0x038, 1),
    (0x55815B3B, 0x03C, 1), (0x5E1DC3E4, 0x040, 5), (0x66957C67, 0x044, 1),
    (0x6A0CCB8A, 0x048, 1), (0x720584BA, 0x04C, 1), (0x8029185D, 0x050, 1),
    (0x90E41A78, 0x054, 1), (0xA1A98180, 0x058, 2), (0xAD173242, 0x05C, 2),
    (0xB69B7051, 0x060, 2), (0xBB0F3D7F, 0x064, 1), (0xC1361D23, 0x068, 2),
    (0xD5D4F8DB, 0x06C, 2), (0xEFEA436F, 0x070, 2), (0xFA03CBDA, 0x074, 2),
    (0xFABCA946, 0x078, 1),
];

pub fn parse_interactionid_entry(entry_id: u32, data: &[u8]) -> Result<InteractionIdEntry, String> {
    if data.len() < INTERACTIONID_ENTRY_SIZE as usize {
        return Err(format!("InteractionId entry too small: {} < {}", data.len(), INTERACTIONID_ENTRY_SIZE));
    }
    Ok(InteractionIdEntry {
        entry_id,
        damage: read_i32(data, 0x000),
        correction_pct: read_i32(data, 0x004),
        interact_target_hash: read_u32(data, 0x008),
        receive_mode_hash: read_u32(data, 0x00C),
        interact_type: read_u32(data, 0x010),
        interact_range: read_f32(data, 0x014),
        priority: read_u32(data, 0x018),
        stun_value: read_i32(data, 0x01C),
        hit_effect_id: read_u32(data, 0x020),
        down_value: read_i32(data, 0x024),
        guard_interact_hash: read_u32(data, 0x028),
        stun_frame: read_i32(data, 0x02C),
        se_hash: read_u32(data, 0x030),
        knockback_force: read_i32(data, 0x034),
        unk_barrier_hash: read_u32(data, 0x038),
        guard_type: read_u32(data, 0x03C),
        damage_rate: read_f32(data, 0x040),
        attack_property: read_u32(data, 0x044),
        interact_id: read_u32(data, 0x048),
        is_blockable: read_u32(data, 0x04C),
        wall_bounce_type: read_u32(data, 0x050),
        slide_type: read_u32(data, 0x054),
        hitstop_frame: read_i32(data, 0x058),
        knockback_distance: read_i32(data, 0x05C),
        ground_bounce: read_i32(data, 0x060),
        knockback_type: read_u32(data, 0x064),
        can_tech: read_i32(data, 0x068),
        hit_level: read_i32(data, 0x06C),
        guard_break_level: read_i32(data, 0x070),
        untechable_frame: read_i32(data, 0x074),
        interact_category: read_u32(data, 0x078),
    })
}

pub fn write_interactionid_entry(entry: &InteractionIdEntry, buf: &mut [u8]) {
    write_i32(buf, 0x000, entry.damage);
    write_i32(buf, 0x004, entry.correction_pct);
    write_u32(buf, 0x008, entry.interact_target_hash);
    write_u32(buf, 0x00C, entry.receive_mode_hash);
    write_u32(buf, 0x010, entry.interact_type);
    write_f32(buf, 0x014, entry.interact_range);
    write_u32(buf, 0x018, entry.priority);
    write_i32(buf, 0x01C, entry.stun_value);
    write_u32(buf, 0x020, entry.hit_effect_id);
    write_i32(buf, 0x024, entry.down_value);
    write_u32(buf, 0x028, entry.guard_interact_hash);
    write_i32(buf, 0x02C, entry.stun_frame);
    write_u32(buf, 0x030, entry.se_hash);
    write_i32(buf, 0x034, entry.knockback_force);
    write_u32(buf, 0x038, entry.unk_barrier_hash);
    write_u32(buf, 0x03C, entry.guard_type);
    write_f32(buf, 0x040, entry.damage_rate);
    write_u32(buf, 0x044, entry.attack_property);
    write_u32(buf, 0x048, entry.interact_id);
    write_u32(buf, 0x04C, entry.is_blockable);
    write_u32(buf, 0x050, entry.wall_bounce_type);
    write_u32(buf, 0x054, entry.slide_type);
    write_i32(buf, 0x058, entry.hitstop_frame);
    write_i32(buf, 0x05C, entry.knockback_distance);
    write_i32(buf, 0x060, entry.ground_bounce);
    write_u32(buf, 0x064, entry.knockback_type);
    write_i32(buf, 0x068, entry.can_tech);
    write_i32(buf, 0x06C, entry.hit_level);
    write_i32(buf, 0x070, entry.guard_break_level);
    write_i32(buf, 0x074, entry.untechable_frame);
    write_u32(buf, 0x078, entry.interact_category);
}

fn read_u32(data: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]])
}
fn write_u32(buf: &mut [u8], offset: usize, val: u32) {
    buf[offset..offset+4].copy_from_slice(&val.to_le_bytes());
}
fn read_i32(data: &[u8], offset: usize) -> i32 {
    i32::from_le_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]])
}
fn write_i32(buf: &mut [u8], offset: usize, val: i32) {
    buf[offset..offset+4].copy_from_slice(&val.to_le_bytes());
}
fn read_f32(data: &[u8], offset: usize) -> f32 {
    f32::from_le_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]])
}
fn write_f32(buf: &mut [u8], offset: usize, val: f32) {
    buf[offset..offset+4].copy_from_slice(&val.to_le_bytes());
}
