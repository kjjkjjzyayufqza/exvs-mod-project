use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};

pub const ARMSPARAM_ENTRY_SIZE: u32 = 200;
pub const ARMSPARAM_CMD_COUNT: u32 = 48;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct ArmsParamEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub is_enabled: u32,                // 0x020A35DD +0x000 kind=1 {0,1}
    pub unk_04_reserved: u32,           // 0x02D35F32 +0x004 kind=1 always 0
    pub is_continuous_fire: u32,        // 0x0496C136 +0x008 kind=1 {0,1}
    pub reload_start_frame: i32,        // 0x04A2CFD6 +0x00C kind=2 [0,1020]
    pub reload_time_total: i32,         // 0x103171AE +0x010 kind=2 [0,1800]
    pub reload_type: u32,               // 0x11DEE0C8 +0x014 kind=1 {0..3}
    pub is_charge_weapon: u32,          // 0x1348893F +0x018 kind=1 {0,1}
    pub can_move_while_firing: u32,     // 0x1E8E41EF +0x01C kind=1 {0,1}
    pub homing_angle: i32,              // 0x31427CC3 +0x020 kind=2 [0,180]
    pub induction_rate: f32,            // 0x3A1D6254 +0x024 kind=5 [0,1]
    pub homing_start_rate: f32,         // 0x3BC65821 +0x028 kind=5 [0,1]
    pub homing_end_rate: f32,           // 0x3CAB9C38 +0x02C kind=5 [0,1]
    pub ammo_count: i32,                // 0x4961274C +0x030 kind=2 [1,120]
    pub damage_correction_rate: f32,    // 0x4A7796DB +0x034 kind=5 [0,1]
    pub down_correction_rate: f32,      // 0x4BACACAE +0x038 kind=5 [0,1]
    pub shot_type: i32,                 // 0x4C527468 +0x03C kind=2 [0,3]
    pub damage: i32,                    // 0x4C84F7C0 +0x040 kind=2 [0,1500]
    pub stun_correction_rate: f32,      // 0x4D1A52C2 +0x044 kind=5 [0,1]
    pub down_value: i32,                // 0x4E692ACD +0x048 kind=2 [0,120]
    pub cancel_route_type: u32,         // 0x596FC1C3 +0x04C kind=1 {0..2}
    pub is_vernier: u32,                // 0x5B072B6C +0x050 kind=1 {0,1}
    pub cooldown_frame: i32,            // 0x67364138 +0x054 kind=2 [0,1800]
    pub startup_frame: i32,             // 0x73A5FF40 +0x058 kind=2 [0,1020]
    pub active_frame: i32,              // 0x74C83B59 +0x05C kind=2 [0,1020]
    pub recovery_frame: i32,            // 0x89382014 +0x060 kind=2 [0,1800]
    pub total_duration_frame: i32,      // 0x8E55E40D +0x064 kind=2 [0,1800]
    pub landing_recovery_frame: i32,    // 0x9AC65A75 +0x068 kind=2 [0,1020]
    pub stun_value: i32,                // 0xA06CAAD5 +0x06C kind=2 [0,60]
    pub boost_consumption_rate: f32,    // 0xA2CF099B +0x070 kind=5 [0,1]
    pub range: i32,                     // 0xA353F222 +0x074 kind=2 [0,600]
    pub muzzle_correction_rate: f32,    // 0xA479F7F7 +0x078 kind=5 [0,1]
    pub reload_per_shot_frame: i32,     // 0xA502BCF2 +0x07C kind=2 [0,1800]
    pub reload_lock_frame: i32,         // 0xA635CFC2 +0x080 kind=2 [0,120]
    pub overheat_frame: i32,            // 0xAB9AEF6C +0x084 kind=2 [0,1200]
    pub charge_frame: i32,              // 0xABC33F14 +0x088 kind=2 [0,600]
    pub guard_break_type: u32,          // 0xAC243293 +0x08C kind=1 {0..2}
    pub landing_behavior_type: u32,     // 0xB669A42A +0x090 kind=1 {0..2}
    pub is_super_armor: u32,            // 0xB686E88C +0x094 kind=1 {0,1}
    pub bullet_type: u32,               // 0xBB93D195 +0x098 kind=1 {0..7}
    pub tracking_speed_rate: f32,       // 0xD37EC761 +0x09C kind=5 [0,1]
    pub bullet_speed_rate: f32,         // 0xD5C8390D +0x0A0 kind=5 [0,1]
    pub action_label_offset: u32,       // 0xE6213731 +0x0A4 kind=7 string
    pub action_label_size: u32,         // +0x0A8 padding for 8-byte string slot
    pub ammo_reload_wait_frame: i32,    // 0xEDC16AE3 +0x0AC kind=2 [0,900]
    pub hit_effect_type: u32,           // 0xEF3F41B3 +0x0B0 kind=1 {0..5}
    pub resource_label_offset: u32,     // 0xF3C4CAE9 +0x0B4 kind=7 string
    pub resource_label_size: u32,       // +0x0B8 padding for 8-byte string slot
    pub bullet_count_per_shot: i32,     // 0xF8AEEC77 +0x0BC kind=2 [0,150]
    pub firing_interval_frame: i32,     // 0xF8E59F33 +0x0C0 kind=2 [0,120]
    pub full_charge_frame: i32,         // 0xF952D49B +0x0C4 kind=2 [0,1800]
}

pub const ARMSPARAM_FIELD_HASHES: [(u32, u32, u32); 48] = [
    (0x020A35DD, 0x000, 1), (0x02D35F32, 0x004, 1), (0x0496C136, 0x008, 1),
    (0x04A2CFD6, 0x00C, 2), (0x103171AE, 0x010, 2), (0x11DEE0C8, 0x014, 1),
    (0x1348893F, 0x018, 1), (0x1E8E41EF, 0x01C, 1), (0x31427CC3, 0x020, 2),
    (0x3A1D6254, 0x024, 5), (0x3BC65821, 0x028, 5), (0x3CAB9C38, 0x02C, 5),
    (0x4961274C, 0x030, 2), (0x4A7796DB, 0x034, 5), (0x4BACACAE, 0x038, 5),
    (0x4C527468, 0x03C, 2), (0x4C84F7C0, 0x040, 2), (0x4D1A52C2, 0x044, 5),
    (0x4E692ACD, 0x048, 2), (0x596FC1C3, 0x04C, 1), (0x5B072B6C, 0x050, 1),
    (0x67364138, 0x054, 2), (0x73A5FF40, 0x058, 2), (0x74C83B59, 0x05C, 2),
    (0x89382014, 0x060, 2), (0x8E55E40D, 0x064, 2), (0x9AC65A75, 0x068, 2),
    (0xA06CAAD5, 0x06C, 2), (0xA2CF099B, 0x070, 5), (0xA353F222, 0x074, 2),
    (0xA479F7F7, 0x078, 5), (0xA502BCF2, 0x07C, 2), (0xA635CFC2, 0x080, 2),
    (0xAB9AEF6C, 0x084, 2), (0xABC33F14, 0x088, 2), (0xAC243293, 0x08C, 1),
    (0xB669A42A, 0x090, 1), (0xB686E88C, 0x094, 1), (0xBB93D195, 0x098, 1),
    (0xD37EC761, 0x09C, 5), (0xD5C8390D, 0x0A0, 5), (0xE6213731, 0x0A4, 7),
    (0xEDC16AE3, 0x0AC, 2), (0xEF3F41B3, 0x0B0, 1), (0xF3C4CAE9, 0x0B4, 7),
    (0xF8AEEC77, 0x0BC, 2), (0xF8E59F33, 0x0C0, 2), (0xF952D49B, 0x0C4, 2),
];
