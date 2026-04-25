use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};

use crate::format::typed_param::{
    build_typed_param_binary, parse_typed_param_binary, ParamEntryWithId, TypedParamBundle,
};

pub const BULLETPARAM_ENTRY_SIZE: u32 = 320;
pub const BULLETPARAM_CMD_COUNT: u32 = 80;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct BulletParamEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub initial_angle: f32,             // 0x0594D6D4 +0x000 kind=5 [-25,130]
    pub max_range: f32,                 // 0x05D5D30D +0x004 kind=5 [0,3600]
    pub move_type: u32,                 // 0x06E90346 +0x008 kind=1 {0..8}
    pub hit_effect_hash: u32,           // 0x0D6A5CD5 +0x00C kind=1 (105 unique)
    pub spread_angle: f32,              // 0x130D4C0B +0x010 kind=5 [-80,80]
    pub hitbox_width: f32,              // 0x13662C98 +0x014 kind=5 [0,20]
    pub hitbox_height: f32,             // 0x138B3675 +0x018 kind=5 [0,40]
    pub hitbox_depth: f32,              // 0x13C6C469 +0x01C kind=5 [0,28]
    pub aim_offset_vertical: f32,       // 0x14AB0070 +0x020 kind=5 [-120,60]
    pub homing_range: f32,              // 0x20FEDE31 +0x024 kind=5 [0,1000]
    pub visual_scale: f32,              // 0x28BA5665 +0x028 kind=5 [0,7.5]
    pub hit_effect_scale: f32,          // 0x2E1E75E5 +0x02C kind=5 [0,5]
    pub spawn_offset_forward: f32,      // 0x2F446A4F +0x030 kind=5 [-175,200]
    pub inherit_speed_flag: u32,        // 0x319126CE +0x034 kind=1 {0,1}
    pub lifetime: i32,                  // 0x32ACABFB +0x038 kind=2 [0,10000]
    pub child_bullet_hash: u32,         // 0x36FCE2D7 +0x03C kind=1 (26 unique)
    pub collision_type: u32,            // 0x397CE80D +0x040 kind=1 {0..2}
    pub rotation_angle: f32,            // 0x3B52DAAB +0x044 kind=5 [-180,360]
    pub elevation_angle: f32,           // 0x3C3F1EB2 +0x048 kind=5 [-60,120]
    pub homing_type: u32,               // 0x3CDF1516 +0x04C kind=1 {0..3}
    pub bullet_effect_hash: u32,        // 0x41435BE6 +0x050 kind=1 (126 unique)
    pub trail_effect_hash: u32,         // 0x41FBD241 +0x054 kind=1 (28 unique)
    pub muzzle_flash_hash: u32,         // 0x46961658 +0x058 kind=1 (12 unique)
    pub target_height_offset: f32,      // 0x4B382E24 +0x05C kind=5 [-100,200]
    pub pierce_count: i32,              // 0x4B492895 +0x060 kind=2 [0,29]
    pub acceleration_value: f32,        // 0x4C55EA3D +0x064 kind=5 [-180,1000]
    pub bullet_action_hash: u32,        // 0x4D6BF281 +0x068 kind=1 (162 unique)
    pub homing_start_distance: f32,     // 0x52CA3B01 +0x06C kind=5 [0,100]
    pub vertical_launch_angle: f32,     // 0x55C77696 +0x070 kind=5 [-85,75]
    pub horizontal_aim_angle: f32,      // 0x58435AD9 +0x074 kind=5 [-102,165]
    pub hit_interval_frame: i32,        // 0x59332F69 +0x078 kind=2 [0,60]
    pub max_altitude: f32,              // 0x63AC30E6 +0x07C kind=5 [0,150]
    pub spawn_offset_vertical: f32,     // 0x640A7C9D +0x080 kind=5 [-20,20]
    pub speed_internal: i32,            // 0x6481E0F7 +0x084 kind=2 [0,100000]
    pub collision_height: f32,          // 0x64C1F4FF +0x088 kind=5 [0,28]
    pub homing_duration: i32,           // 0x67921CDD +0x08C kind=2 [0,10000]
    pub on_expire_hash: u32,            // 0x68CD7942 +0x090 kind=1 (114 unique)
    pub delay_frame: i32,               // 0x6A62D65E +0x094 kind=2 [0,1000]
    pub gravity_rate: f32,              // 0x74F469FA +0x098 kind=5 [0,0.15]
    pub speed_scale: f32,               // 0x7696F452 +0x09C kind=5 [0,2.0]
    pub effective_range: f32,           // 0x7B4AA25E +0x0A0 kind=5 [0,200]
    pub bullet_shape: u32,              // 0x81A816EB +0x0A4 kind=1 {0..3}
    pub model_scale: f32,               // 0x8379D9F8 +0x0A8 kind=5 [0,8]
    pub max_distance: f32,              // 0x846DDC39 +0x0AC kind=5 [0,3000]
    pub bullet_resource_hash: u32,      // 0x89BE0F56 +0x0B0 kind=1 (381 unique)
    pub blast_radius: f32,              // 0x8ACF95D3 +0x0B4 kind=5 [0,150]
    pub offset_angle_vertical: f32,     // 0x8DA251CA +0x0B8 kind=5 [-20,80]
    pub homing_strength: f32,           // 0x8DBD5433 +0x0BC kind=5 [0,1]
    pub turn_rate: f32,                 // 0x90423264 +0x0C0 kind=5 [0,20]
    pub homing_angle: f32,              // 0x9375A247 +0x0C4 kind=5 [0,180]
    pub offset_angle_horizontal: f32,   // 0x9C9D876E +0x0C8 kind=5 [-20,110]
    pub is_beam: u32,                   // 0xA12E3B5F +0x0CC kind=1 {0,1}
    pub target_distance: f32,           // 0xA25B8B11 +0x0D0 kind=5 [-56,250]
    pub behavior_type: u32,             // 0xA36593AD +0x0D4 kind=1 (8 unique)
    pub aim_correction_angle: f32,      // 0xA5364F08 +0x0D8 kind=5 [-60,90]
    pub ammo_type_hash: u32,            // 0xA8987774 +0x0DC kind=1 (16 unique)
    pub initial_speed: f32,             // 0xAB606D9E +0x0E0 kind=5 [0,640]
    pub launch_angle_horizontal: f32,   // 0xABEDC73A +0x0E4 kind=5 [-90,120]
    pub tracking_angle: f32,            // 0xAF2B7098 +0x0E8 kind=5 [0,180]
    pub min_homing_distance: f32,       // 0xB306BEE8 +0x0EC kind=5 [0,200]
    pub turn_acceleration: f32,         // 0xBA9B8F5D +0x0F0 kind=5 [0,15]
    pub reserved_f4: f32,               // 0xD188329F +0x0F4 kind=5 always 0
    pub hitgroup_hash: u32,             // 0xD32D39ED +0x0F8 kind=1 (181 unique)
    pub spawn_pattern_hash: u32,        // 0xD462A33B +0x0FC kind=1 (14 unique)
    pub aim_limit_angle: f32,           // 0xD55CBB87 +0x100 kind=5 [-120,140]
    pub is_penetrating: u32,            // 0xD6290BC9 +0x104 kind=1 {0,1}
    pub secondary_effect_hash: u32,     // 0xD8F283FB +0x108 kind=1 (123 unique)
    pub homing_effective_distance: f32, // 0xDCEAF7AC +0x10C kind=5 [0,820]
    pub reserved_flag_110: u32,         // 0xDE6C0636 +0x110 kind=1 always same
    pub explosion_effect_hash: u32,     // 0xDF9F47E2 +0x114 kind=1 (13 unique)
    pub interaction_hash: u32,          // 0xEDD1C108 +0x118 kind=1 (158 unique)
    pub speed_acceleration: f32,        // 0xEF44FC6B +0x11C kind=5 [-1,5]
    pub duration_frame: i32,            // 0xF33F8630 +0x120 kind=2 [0,600]
    pub reserved_124: f32,              // 0xF47EE96E +0x124 kind=5 always 0
    pub sound_effect_hash: u32,         // 0xF647567F +0x128 kind=1 (9 unique)
    pub muzzle_offset_horizontal: f32,  // 0xFAA5615C +0x12C kind=5 [-70,70]
    pub muzzle_offset_vertical: f32,    // 0xFD032D27 +0x130 kind=5 [-25,35]
    pub induction_angle: f32,           // 0xFD855759 +0x134 kind=5 [0,90]
    pub spread_distance: f32,           // 0xFDC8A545 +0x138 kind=5 [0,120]
    pub tracking_start_distance: f32,   // 0xFF51E424 +0x13C kind=5 [0,100]
}

pub const BULLETPARAM_FIELD_HASHES: [(u32, u32, u32); 80] = [
    (0x0594D6D4, 0x000, 5),
    (0x05D5D30D, 0x004, 5),
    (0x06E90346, 0x008, 1),
    (0x0D6A5CD5, 0x00C, 1),
    (0x130D4C0B, 0x010, 5),
    (0x13662C98, 0x014, 5),
    (0x138B3675, 0x018, 5),
    (0x13C6C469, 0x01C, 5),
    (0x14AB0070, 0x020, 5),
    (0x20FEDE31, 0x024, 5),
    (0x28BA5665, 0x028, 5),
    (0x2E1E75E5, 0x02C, 5),
    (0x2F446A4F, 0x030, 5),
    (0x319126CE, 0x034, 1),
    (0x32ACABFB, 0x038, 2),
    (0x36FCE2D7, 0x03C, 1),
    (0x397CE80D, 0x040, 1),
    (0x3B52DAAB, 0x044, 5),
    (0x3C3F1EB2, 0x048, 5),
    (0x3CDF1516, 0x04C, 1),
    (0x41435BE6, 0x050, 1),
    (0x41FBD241, 0x054, 1),
    (0x46961658, 0x058, 1),
    (0x4B382E24, 0x05C, 5),
    (0x4B492895, 0x060, 2),
    (0x4C55EA3D, 0x064, 5),
    (0x4D6BF281, 0x068, 1),
    (0x52CA3B01, 0x06C, 5),
    (0x55C77696, 0x070, 5),
    (0x58435AD9, 0x074, 5),
    (0x59332F69, 0x078, 2),
    (0x63AC30E6, 0x07C, 5),
    (0x640A7C9D, 0x080, 5),
    (0x6481E0F7, 0x084, 2),
    (0x64C1F4FF, 0x088, 5),
    (0x67921CDD, 0x08C, 2),
    (0x68CD7942, 0x090, 1),
    (0x6A62D65E, 0x094, 2),
    (0x74F469FA, 0x098, 5),
    (0x7696F452, 0x09C, 5),
    (0x7B4AA25E, 0x0A0, 5),
    (0x81A816EB, 0x0A4, 1),
    (0x8379D9F8, 0x0A8, 5),
    (0x846DDC39, 0x0AC, 5),
    (0x89BE0F56, 0x0B0, 1),
    (0x8ACF95D3, 0x0B4, 5),
    (0x8DA251CA, 0x0B8, 5),
    (0x8DBD5433, 0x0BC, 5),
    (0x90423264, 0x0C0, 5),
    (0x9375A247, 0x0C4, 5),
    (0x9C9D876E, 0x0C8, 5),
    (0xA12E3B5F, 0x0CC, 1),
    (0xA25B8B11, 0x0D0, 5),
    (0xA36593AD, 0x0D4, 1),
    (0xA5364F08, 0x0D8, 5),
    (0xA8987774, 0x0DC, 1),
    (0xAB606D9E, 0x0E0, 5),
    (0xABEDC73A, 0x0E4, 5),
    (0xAF2B7098, 0x0E8, 5),
    (0xB306BEE8, 0x0EC, 5),
    (0xBA9B8F5D, 0x0F0, 5),
    (0xD188329F, 0x0F4, 5),
    (0xD32D39ED, 0x0F8, 1),
    (0xD462A33B, 0x0FC, 1),
    (0xD55CBB87, 0x100, 5),
    (0xD6290BC9, 0x104, 1),
    (0xD8F283FB, 0x108, 1),
    (0xDCEAF7AC, 0x10C, 5),
    (0xDE6C0636, 0x110, 1),
    (0xDF9F47E2, 0x114, 1),
    (0xEDD1C108, 0x118, 1),
    (0xEF44FC6B, 0x11C, 5),
    (0xF33F8630, 0x120, 2),
    (0xF47EE96E, 0x124, 5),
    (0xF647567F, 0x128, 1),
    (0xFAA5615C, 0x12C, 5),
    (0xFD032D27, 0x130, 5),
    (0xFD855759, 0x134, 5),
    (0xFDC8A545, 0x138, 5),
    (0xFF51E424, 0x13C, 5),
];

impl ParamEntryWithId for BulletParamEntry {
    fn set_row_id(&mut self, id: u32) {
        self.entry_id = id;
    }
    fn get_row_id(&self) -> u32 {
        self.entry_id
    }
}

pub type BulletParamData = TypedParamBundle<BulletParamEntry>;

pub fn parse_bulletparam(data: &[u8]) -> Result<BulletParamData, String> {
    parse_typed_param_binary(data, BULLETPARAM_ENTRY_SIZE, BULLETPARAM_CMD_COUNT)
}

pub fn build_bulletparam(b: &BulletParamData) -> Result<Vec<u8>, String> {
    build_typed_param_binary(b)
}
