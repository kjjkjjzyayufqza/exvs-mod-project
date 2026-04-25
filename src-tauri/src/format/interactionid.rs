use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};

pub const INTERACTIONID_ENTRY_SIZE: u32 = 124;
pub const INTERACTIONID_CMD_COUNT: u32 = 31;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct InteractionIdEntry {
    #[brw(ignore)]
    #[serde(default)]
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
