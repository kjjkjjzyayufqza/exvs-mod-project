use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};

pub const CHARACTERPARAM_ENTRY_SIZE: u32 = 796;
pub const CHARACTERPARAM_CMD_COUNT: u32 = 197;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct CharacterParamEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub max_hp: i32,               // 0x00D7CEDB +0x000 kind=2 IDA:sub_1405F9010 case8
    pub hp_correction_rate: f32,   // 0x00EC483C +0x004 kind=5
    pub boost_gauge_pct: f32,      // 0x01F15731 +0x008 kind=5
    pub base_unit_cost: i32,       // 0x04371326 +0x00C kind=2 IDA:sub_1405F9180 case14,15,18
    pub ammo_count_main: i32,      // 0x07B8E157 +0x010 kind=2
    pub down_value_rate: f32,      // 0x0804605C +0x014 kind=5
    pub boost_gauge_max: i32,      // 0x080AF70C +0x018 kind=2
    pub front_tracking_angle: f32, // 0x08218288 +0x01C kind=5
    pub sub_shot_cost: i32,        // 0x0872029D +0x020 kind=2 IDA:sub_1405F9180 case3
    pub rear_tracking_angle: f32,  // 0x08A0ADE8 +0x024 kind=5
    pub red_lock_distance: f32,    // 0x08ECF0BE +0x028 kind=5
    pub boost_recovery_speed: i32, // 0x0911077E +0x02C kind=2
    pub dmg_multiplier_tier_a: f32, // 0x0ACCE031 +0x030 kind=5
    pub unit_id_composite: i32,    // 0x0B25CB7F +0x034 kind=2
    pub green_lock_distance: f32,  // 0x0F8134A7 +0x038 kind=5
    pub dmg_multiplier_tier_b: f32, // 0x104DFF9D +0x03C kind=5
    pub model_scale: f32,          // 0x1113F30E +0x040 kind=5
    pub movement_speed_base: f32,  // 0x14F89980 +0x044 kind=5
    pub boost_speed_pct: f32,      // 0x157CC9FE +0x048 kind=5
    pub gravity_offset: f32,       // 0x15B67A85 +0x04C kind=5
    pub body_collision_radius: f32, // 0x1698E3D8 +0x050 kind=5
    pub is_transformable: i32,     // 0x18415DC4 +0x054 kind=2
    pub unit_attribute_flags: u32, // 0x1B2228B5 +0x058 kind=1
    pub has_shield: i32,           // 0x1B8808F8 +0x05C kind=2
    pub dmg_multiplier_tier_c: f32, // 0x1BB18A48 +0x060 kind=5
    pub lock_on_fov_angle: f32,    // 0x1BFADFD3 +0x064 kind=5
    pub down_value_threshold: f32, // 0x1C936B77 +0x068 kind=5
    pub assist_damage: i32, // 0x1D6EA3F1 +0x06C kind=2 IDA:sub_1405F9010 case6,7 +0x06C kind=2
    pub assist_correction_rate: f32, // 0x1E61CF9F +0x070 kind=5
    pub burst_cost: i32,    // 0x1EA3FAE1 +0x074 kind=2 IDA:sub_1405F9180 case9 +0x074 kind=2
    pub step_tracking_angle_min: f32, // 0x21632B7A +0x078 kind=5
    pub step_tracking_angle_max: f32, // 0x21E2041A +0x07C kind=5
    pub boost_dash_speed_rate: f32, // 0x22169CCE +0x080 kind=5
    pub special_cost: i32,  // 0x22823596 +0x084 kind=2 IDA:sub_1405F9180 case2 +0x084 kind=2
    pub special_gauge_start_rate: f32, // 0x24FA2A04 +0x088 kind=5
    pub reserved_flag_08c: i32, // 0x25346DCD +0x08C kind=2
    pub landing_recovery_rate: f32, // 0x25384033 +0x090 kind=5
    pub damage_correction_base: f32, // 0x2698D841 +0x094 kind=5
    pub step_speed_rate: f32, // 0x26BC945D +0x098 kind=5
    pub camera_pitch_down_angle: f32, // 0x27F7E08A +0x09C kind=5
    pub dmg_multiplier_tier_d: f32, // 0x283634C3 +0x0A0 kind=5
    pub camera_pitch_up_angle: f32, // 0x28B3FEC3 +0x0A4 kind=5
    pub main_ammo_reload_frame: i32, // 0x2B99569A +0x0A8 kind=2
    pub aerial_damage_rate: f32, // 0x2C6DC778 +0x0AC kind=5
    pub reserved_flag_0b0: i32, // 0x2C8221E6 +0x0B0 kind=2
    pub melee_combo_limit: i32, // 0x2CF49283 +0x0B4 kind=2
    pub special_melee_damage: i32, // 0x2DA8874F +0x0B8 kind=2 IDA:sub_1405F9010 case11 +0x0B8 kind=2
    pub special_melee_correction_rate: f32, // 0x2DF82AD5 +0x0BC kind=5
    pub guard_damage_rate: f32,    // 0x30099C4D +0x0C0 kind=5
    pub barrier_damage_rate: f32,  // 0x324F2214 +0x0C4 kind=5
    pub reserved_flag_0c8: i32,    // 0x32F4D4BE +0x0C8 kind=2
    pub melee_damage: i32, // 0x333722B6 +0x0CC kind=2 IDA:sub_1405F9010 case2,14 +0x0CC kind=2
    pub melee_correction_offset: f32, // 0x338D4823 +0x0D0 kind=5
    pub melee_tracking_angle: f32, // 0x379D0C45 +0x0D4 kind=5
    pub melee_bonus_rate: f32, // 0x38FDFC10 +0x0D8 kind=5
    pub melee_reach_base: f32, // 0x3AA41969 +0x0DC kind=5
    pub score_value_base: i32, // 0x3C1E9E3B +0x0E0 kind=2
    pub charge_time_offset: f32, // 0x3C43A0D1 +0x0E4 kind=5
    pub camera_distance_near: f32, // 0x3C475420 +0x0E8 kind=5
    pub camera_fov_default: f32, // 0x3CBF4F6C +0x0EC kind=5
    pub dmg_multiplier_tier_e: f32, // 0x3D302D72 +0x0F0 kind=5
    pub reserved_flag_0f4: i32, // 0x3D501F3B +0x0F4 kind=2
    pub reserved_flag_0f8: i32, // 0x3F29DFF4 +0x0F8 kind=2
    pub camera_offset_x: f32, // 0x432ADAA1 +0x0FC kind=5
    pub dmg_multiplier_tier_f: f32, // 0x43DC9679 +0x100 kind=5
    pub respawn_invincibility_frame: i32, // 0x45C84958 +0x104 kind=2
    pub camera_fov_battle: f32, // 0x46E6927A +0x108 kind=5
    pub dmg_multiplier_tier_g: f32, // 0x4769F064 +0x10C kind=5
    pub movement_type: u32, // 0x4778AB75 +0x110 kind=1
    pub camera_distance_far: f32, // 0x4B4064B6 +0x114 kind=5
    pub camera_offset_y: f32, // 0x4B449047 +0x118 kind=5
    pub reserved_flag_11c: i32, // 0x4CF8985A +0x11C kind=2
    pub reserved_flag_120: i32, // 0x4D2405E0 +0x120 kind=2
    pub camera_offset_z: f32, // 0x4FFACC86 +0x124 kind=5
    pub camera_offset_partner_x: f32, // 0x5175F1DE +0x128 kind=5
    pub camera_offset_partner_y: f32, // 0x51BBA4CB +0x12C kind=5
    pub body_height: f32,  // 0x51DD39F0 +0x130 kind=5
    pub reserved_flag_134: i32, // 0x52335D5B +0x134 kind=2
    pub body_offset_y: f32, // 0x523F70A5 +0x138 kind=5
    pub partner_cost_penalty_frame: i32, // 0x5245EE3E +0x13C kind=2
    pub charge_shot_damage: i32, // 0x539BC76D +0x140 kind=2 IDA:sub_1405F9010 case10 +0x140 kind=2
    pub charge_shot_correction_offset: f32, // 0x53FD1A92 +0x144 kind=5
    pub yellow_lock_distance: f32, // 0x55E4FF75 +0x148 kind=5
    pub lock_on_range_min: f32, // 0x5AC06BD2 +0x14C kind=5
    pub lock_on_angle_main: f32, // 0x5B3AF66C +0x150 kind=5
    pub reserved_flag_154: i32, // 0x5B851170 +0x154 kind=2
    pub aim_assist_angle: f32, // 0x5BBBD90C +0x158 kind=5
    pub sub_ammo_reload_frame: i32, // 0x5BF3A215 +0x15C kind=2
    pub reserved_flag_160: i32, // 0x5CE8D569 +0x160 kind=2
    pub special_melee_cost: i32, // 0x5E0DDDD8 +0x164 kind=2 IDA:sub_1405F9180 case13 +0x164 kind=2
    pub special_reload_frame: i32, // 0x6133A20B +0x168 kind=2
    pub special_fov_pct: f32, // 0x6674EE31 +0x16C kind=5
    pub special_correction_base: f32, // 0x6A14228B +0x170 kind=5
    pub special_correction_rate: f32, // 0x6AF92610 +0x174 kind=5
    pub burst_correction_base: f32, // 0x6ED37B1F +0x178 kind=5
    pub burst_fov_pct: f32, // 0x6F2514E8 +0x17C kind=5
    pub burst_attribute_flags: u32, // 0x71D35821 +0x180 kind=1
    pub burst_speed_multiplier: f32, // 0x71D87C2C +0x184 kind=5
    pub burst_lock_on_angle: f32, // 0x72785F9E +0x188 kind=5
    pub burst_damage: i32, // 0x776BBBE9 +0x18C kind=2 IDA:sub_1405F9010 case9 +0x18C kind=2
    pub engagement_range_near: f32, // 0x78860431 +0x190 kind=5
    pub hitbox_height: f32, // 0x78C70D3F +0x194 kind=5
    pub reserved_flag_198: i32, // 0x7B9D7024 +0x198 kind=2
    pub auto_aim_angle_limit: f32, // 0x7BA88A27 +0x19C kind=5
    pub respawn_cost: i32, // 0x7D1A0ACF +0x1A0 kind=2
    pub main_shot_cost: i32, // 0x8199A311 +0x1A4 kind=2 IDA:sub_1405F9180 case0 +0x1A4 kind=2
    pub score_bonus_cap: i32, // 0x8248401F +0x1A8 kind=2
    pub walk_speed: f32,   // 0x82B967A9 +0x1AC kind=5
    pub team_cost_value: i32, // 0x8381BE8A +0x1B0 kind=2
    pub boost_consumption_rate: f32, // 0x85C483F0 +0x1B4 kind=5
    pub close_tracking_angle: f32, // 0x86579C72 +0x1B8 kind=5
    pub main_shot_correction_rate: f32, // 0x8A902D5F +0x1BC kind=5
    pub gravity_multiplier: f32, // 0x8CBF2B3F +0x1C0 kind=5
    pub ranged_tracking_angle_min: f32, // 0x8F0666AB +0x1C4 kind=5
    pub ranged_tracking_angle_max: f32, // 0x8F8749CB +0x1C8 kind=5
    pub special_damage: i32, // 0x904C7CF0 +0x1CC kind=2 IDA:sub_1405F9010 case3,15,18 +0x1CC kind=2
    pub dmg_multiplier_tier_h: f32, // 0x91CDEF2B +0x1D0 kind=5
    pub engagement_range_far: f32, // 0x91E5A104 +0x1D4 kind=5
    pub sub_shot_correction_base: f32, // 0x9B20A527 +0x1D8 kind=5
    pub sub_shot_fov_pct: f32, // 0x9B8BF864 +0x1DC kind=5
    pub sub_shot_correction_rate: f32, // 0x9BED4726 +0x1E0 kind=5
    pub reserved_flag_1e4: i32, // 0x9D8ADBDF +0x1E4 kind=2
    pub lock_on_distance_max: f32, // 0xA223C183 +0x1E8 kind=5
    pub weapon_attribute_flags: u32, // 0xA60B0684 +0x1EC kind=1
    pub wide_camera_angle: f32, // 0xA644CF59 +0x1F0 kind=5
    pub narrow_camera_angle: f32, // 0xA6C5E039 +0x1F4 kind=5
    pub burst_damage_multiplier: f32, // 0xA6DC5C53 +0x1F8 kind=5
    pub minimum_aim_angle: f32, // 0xA83A8232 +0x1FC kind=5
    pub aim_correction_offset_x: f32, // 0xA900CDF7 +0x200 kind=5
    pub aim_correction_offset_y: f32, // 0xAA841999 +0x204 kind=5
    pub aim_correction_offset_z: f32, // 0xAB4673AE +0x208 kind=5
    pub sub_shot_cost_scaled: i32, // 0xAE7FF94F +0x20C kind=2 IDA:sub_1405F9180 case4,5,12 +0x20C kind=2
    pub reserved_flag_210: i32,    // 0xAEAC01A7 +0x210 kind=2
    pub melee_camera_angle: f32,   // 0xAF153580 +0x214 kind=5
    pub assist_reload_frame: i32,  // 0xB2900720 +0x218 kind=2
    pub reserved_flag_21c: i32,    // 0xB2E6B445 +0x21C kind=2
    pub dmg_multiplier_tier_i: f32, // 0xB3373BD9 +0x220 kind=5
    pub melee_lunge_offset: f32,   // 0xB4F17B6F +0x224 kind=5
    pub reserved_flag_228: i32,    // 0xB58B705C +0x228 kind=2
    pub step_cancel_count: i32,    // 0xB5FDC339 +0x22C kind=2
    pub boost_gauge_initial: i32,  // 0xB7D5327E +0x230 kind=2
    pub fall_speed_base: f32,      // 0xB91793D4 +0x234 kind=5
    pub air_dash_speed_base: f32,  // 0xBA900811 +0x238 kind=5
    pub alert_range_distance: f32, // 0xBAE8C388 +0x23C kind=5
    pub alert_range_fov: f32,      // 0xBB19842F +0x240 kind=5
    pub radar_display_scale: f32,  // 0xBC427D55 +0x244 kind=5
    pub dash_speed_base: f32,      // 0xBE256E0C +0x248 kind=5
    pub reserved_flag_24c: i32,    // 0xBE8D97FB +0x24C kind=2
    pub radar_fov_pct: f32,        // 0xC1405939 +0x250 kind=5
    pub reserved_flag_254: i32,    // 0xC28C40CA +0x254 kind=2
    pub ammo_reserve_count: i32,   // 0xC2FAF3AF +0x258 kind=2
    pub ammo_correction_offset: f32, // 0xC3F64BF9 +0x25C kind=5
    pub reserved_flag_260: i32,    // 0xC4852F00 +0x260 kind=2
    pub charge_time_frame: i32,    // 0xC59737B6 +0x264 kind=2
    pub reserved_flag_268: i32,    // 0xC5E184D3 +0x268 kind=2
    pub charge_shot_cost: i32, // 0xC6A88D7F +0x26C kind=2 IDA:sub_1405F9180 case10 +0x26C kind=2
    pub charge_damage_multiplier: f32, // 0xC6E2AD28 +0x270 kind=5
    pub charge_correction_offset: f32, // 0xC8B2F571 +0x274 kind=5
    pub charge_bonus_offset: f32, // 0xCAF44B28 +0x278 kind=5
    pub charge_gauge_offset: f32, // 0xCB36211F +0x27C kind=5
    pub melee_lock_angle: f32, // 0xD01D00DF +0x280 kind=5
    pub target_range_distance: f32, // 0xD249350C +0x284 kind=5
    pub target_correction_offset: f32, // 0xD24DC1FD +0x288 kind=5
    pub target_fov_pct: f32,   // 0xD2D0C774 +0x28C kind=5
    pub radar_range_distance: f32, // 0xD524F115 +0x290 kind=5
    pub radar_sweep_angle: f32, // 0xD54CE896 +0x294 kind=5
    pub radar_correction_offset: f32, // 0xD6F39D3C +0x298 kind=5
    pub radar_display_offset: f32, // 0xD854F864 +0x29C kind=5
    pub melee_cost: i32,       // 0xD8F4FBD2 +0x2A0 kind=2 IDA:sub_1405F9180 case1 +0x2A0 kind=2
    pub melee_cost_correction_offset: f32, // 0xDC414338 +0x2A4 kind=5
    pub melee_aim_angle: f32,  // 0xDC9C3D2F +0x2A8 kind=5
    pub melee_aim_correction_offset: f32, // 0xDD83290F +0x2AC kind=5
    pub melee_range_offset: f32, // 0xDE07FD61 +0x2B0 kind=5
    pub rotation_speed_degrees: i32, // 0xDF888E8B +0x2B4 kind=2
    pub sub_shot_fov_alt: f32, // 0xE1D22572 +0x2B8 kind=5
    pub melee_reach_distance: f32, // 0xE1D56972 +0x2BC kind=5
    pub sub_shot_damage: i32, // 0xE2C6FD16 +0x2C0 kind=2 IDA:sub_1405F9010 case4,5,12,13 +0x2C0 kind=2
    pub down_value_per_hit: f32, // 0xE3E5D41D +0x2C4 kind=5
    pub action_label_offset: u32, // 0xE6213731 +0x2C8 kind=7
    pub action_label_size: u32,
    pub target_switch_distance: f32,       // 0xE6E29192 +0x2D0 kind=5
    pub target_switch_fov: f32,            // 0xE883DFAB +0x2D4 kind=5
    pub main_shot_speed_base: f32,         // 0xE90161F5 +0x2D8 kind=5
    pub damage_proration_rate: f32,        // 0xE9F462F6 +0x2DC kind=5
    pub main_shot_damage: i32, // 0xEB1219A4 +0x2E0 kind=2 IDA:sub_1405F9010 case0,1 +0x2E0 kind=2
    pub combo_proration_rate: f32, // 0xECBC202D +0x2E4 kind=5
    pub reserved_flag_2e8: i32, // 0xED170E69 +0x2E8 kind=2
    pub shot_velocity_base: f32, // 0xEDB407E8 +0x2EC kind=5
    pub main_shot_damage_multiplier: f32, // 0xEE92BCAB +0x2F0 kind=5
    pub melee_damage_correction_rate: f32, // 0xF15C6A7F +0x2F4 kind=5
    pub ranged_damage_correction_rate: f32, // 0xF25A5100 +0x2F8 kind=5
    pub resource_label_offset: u32, // 0xF3C4CAE9 +0x2FC kind=7
    pub resource_label_size: u32,
    pub projectile_tracking_angle_min: f32, // 0xF55FBBBD +0x304 kind=5
    pub projectile_tracking_angle_max: f32, // 0xF5DE94DD +0x308 kind=5
    pub max_render_distance: f32,           // 0xF73592C7 +0x30C kind=5
    pub render_correction_offset: f32,      // 0xFBB81BA9 +0x310 kind=5
    pub final_damage_multiplier: f32,       // 0xFEADD5BE +0x314 kind=5
    pub assist_cost: i32, // 0xFEE76495 +0x318 kind=2 IDA:sub_1405F9180 case6,7 +0x318 kind=2
}

pub const CHARACTERPARAM_FIELD_HASHES: [(u32, u32, u32); 197] = [
    (0x00D7CEDB, 0x000, 2),
    (0x00EC483C, 0x004, 5),
    (0x01F15731, 0x008, 5),
    (0x04371326, 0x00C, 2),
    (0x07B8E157, 0x010, 2),
    (0x0804605C, 0x014, 5),
    (0x080AF70C, 0x018, 2),
    (0x08218288, 0x01C, 5),
    (0x0872029D, 0x020, 2),
    (0x08A0ADE8, 0x024, 5),
    (0x08ECF0BE, 0x028, 5),
    (0x0911077E, 0x02C, 2),
    (0x0ACCE031, 0x030, 5),
    (0x0B25CB7F, 0x034, 2),
    (0x0F8134A7, 0x038, 5),
    (0x104DFF9D, 0x03C, 5),
    (0x1113F30E, 0x040, 5),
    (0x14F89980, 0x044, 5),
    (0x157CC9FE, 0x048, 5),
    (0x15B67A85, 0x04C, 5),
    (0x1698E3D8, 0x050, 5),
    (0x18415DC4, 0x054, 2),
    (0x1B2228B5, 0x058, 1),
    (0x1B8808F8, 0x05C, 2),
    (0x1BB18A48, 0x060, 5),
    (0x1BFADFD3, 0x064, 5),
    (0x1C936B77, 0x068, 5),
    (0x1D6EA3F1, 0x06C, 2),
    (0x1E61CF9F, 0x070, 5),
    (0x1EA3FAE1, 0x074, 2),
    (0x21632B7A, 0x078, 5),
    (0x21E2041A, 0x07C, 5),
    (0x22169CCE, 0x080, 5),
    (0x22823596, 0x084, 2),
    (0x24FA2A04, 0x088, 5),
    (0x25346DCD, 0x08C, 2),
    (0x25384033, 0x090, 5),
    (0x2698D841, 0x094, 5),
    (0x26BC945D, 0x098, 5),
    (0x27F7E08A, 0x09C, 5),
    (0x283634C3, 0x0A0, 5),
    (0x28B3FEC3, 0x0A4, 5),
    (0x2B99569A, 0x0A8, 2),
    (0x2C6DC778, 0x0AC, 5),
    (0x2C8221E6, 0x0B0, 2),
    (0x2CF49283, 0x0B4, 2),
    (0x2DA8874F, 0x0B8, 2),
    (0x2DF82AD5, 0x0BC, 5),
    (0x30099C4D, 0x0C0, 5),
    (0x324F2214, 0x0C4, 5),
    (0x32F4D4BE, 0x0C8, 2),
    (0x333722B6, 0x0CC, 2),
    (0x338D4823, 0x0D0, 5),
    (0x379D0C45, 0x0D4, 5),
    (0x38FDFC10, 0x0D8, 5),
    (0x3AA41969, 0x0DC, 5),
    (0x3C1E9E3B, 0x0E0, 2),
    (0x3C43A0D1, 0x0E4, 5),
    (0x3C475420, 0x0E8, 5),
    (0x3CBF4F6C, 0x0EC, 5),
    (0x3D302D72, 0x0F0, 5),
    (0x3D501F3B, 0x0F4, 2),
    (0x3F29DFF4, 0x0F8, 2),
    (0x432ADAA1, 0x0FC, 5),
    (0x43DC9679, 0x100, 5),
    (0x45C84958, 0x104, 2),
    (0x46E6927A, 0x108, 5),
    (0x4769F064, 0x10C, 5),
    (0x4778AB75, 0x110, 1),
    (0x4B4064B6, 0x114, 5),
    (0x4B449047, 0x118, 5),
    (0x4CF8985A, 0x11C, 2),
    (0x4D2405E0, 0x120, 2),
    (0x4FFACC86, 0x124, 5),
    (0x5175F1DE, 0x128, 5),
    (0x51BBA4CB, 0x12C, 5),
    (0x51DD39F0, 0x130, 5),
    (0x52335D5B, 0x134, 2),
    (0x523F70A5, 0x138, 5),
    (0x5245EE3E, 0x13C, 2),
    (0x539BC76D, 0x140, 2),
    (0x53FD1A92, 0x144, 5),
    (0x55E4FF75, 0x148, 5),
    (0x5AC06BD2, 0x14C, 5),
    (0x5B3AF66C, 0x150, 5),
    (0x5B851170, 0x154, 2),
    (0x5BBBD90C, 0x158, 5),
    (0x5BF3A215, 0x15C, 2),
    (0x5CE8D569, 0x160, 2),
    (0x5E0DDDD8, 0x164, 2),
    (0x6133A20B, 0x168, 2),
    (0x6674EE31, 0x16C, 5),
    (0x6A14228B, 0x170, 5),
    (0x6AF92610, 0x174, 5),
    (0x6ED37B1F, 0x178, 5),
    (0x6F2514E8, 0x17C, 5),
    (0x71D35821, 0x180, 1),
    (0x71D87C2C, 0x184, 5),
    (0x72785F9E, 0x188, 5),
    (0x776BBBE9, 0x18C, 2),
    (0x78860431, 0x190, 5),
    (0x78C70D3F, 0x194, 5),
    (0x7B9D7024, 0x198, 2),
    (0x7BA88A27, 0x19C, 5),
    (0x7D1A0ACF, 0x1A0, 2),
    (0x8199A311, 0x1A4, 2),
    (0x8248401F, 0x1A8, 2),
    (0x82B967A9, 0x1AC, 5),
    (0x8381BE8A, 0x1B0, 2),
    (0x85C483F0, 0x1B4, 5),
    (0x86579C72, 0x1B8, 5),
    (0x8A902D5F, 0x1BC, 5),
    (0x8CBF2B3F, 0x1C0, 5),
    (0x8F0666AB, 0x1C4, 5),
    (0x8F8749CB, 0x1C8, 5),
    (0x904C7CF0, 0x1CC, 2),
    (0x91CDEF2B, 0x1D0, 5),
    (0x91E5A104, 0x1D4, 5),
    (0x9B20A527, 0x1D8, 5),
    (0x9B8BF864, 0x1DC, 5),
    (0x9BED4726, 0x1E0, 5),
    (0x9D8ADBDF, 0x1E4, 2),
    (0xA223C183, 0x1E8, 5),
    (0xA60B0684, 0x1EC, 1),
    (0xA644CF59, 0x1F0, 5),
    (0xA6C5E039, 0x1F4, 5),
    (0xA6DC5C53, 0x1F8, 5),
    (0xA83A8232, 0x1FC, 5),
    (0xA900CDF7, 0x200, 5),
    (0xAA841999, 0x204, 5),
    (0xAB4673AE, 0x208, 5),
    (0xAE7FF94F, 0x20C, 2),
    (0xAEAC01A7, 0x210, 2),
    (0xAF153580, 0x214, 5),
    (0xB2900720, 0x218, 2),
    (0xB2E6B445, 0x21C, 2),
    (0xB3373BD9, 0x220, 5),
    (0xB4F17B6F, 0x224, 5),
    (0xB58B705C, 0x228, 2),
    (0xB5FDC339, 0x22C, 2),
    (0xB7D5327E, 0x230, 2),
    (0xB91793D4, 0x234, 5),
    (0xBA900811, 0x238, 5),
    (0xBAE8C388, 0x23C, 5),
    (0xBB19842F, 0x240, 5),
    (0xBC427D55, 0x244, 5),
    (0xBE256E0C, 0x248, 5),
    (0xBE8D97FB, 0x24C, 2),
    (0xC1405939, 0x250, 5),
    (0xC28C40CA, 0x254, 2),
    (0xC2FAF3AF, 0x258, 2),
    (0xC3F64BF9, 0x25C, 5),
    (0xC4852F00, 0x260, 2),
    (0xC59737B6, 0x264, 2),
    (0xC5E184D3, 0x268, 2),
    (0xC6A88D7F, 0x26C, 2),
    (0xC6E2AD28, 0x270, 5),
    (0xC8B2F571, 0x274, 5),
    (0xCAF44B28, 0x278, 5),
    (0xCB36211F, 0x27C, 5),
    (0xD01D00DF, 0x280, 5),
    (0xD249350C, 0x284, 5),
    (0xD24DC1FD, 0x288, 5),
    (0xD2D0C774, 0x28C, 5),
    (0xD524F115, 0x290, 5),
    (0xD54CE896, 0x294, 5),
    (0xD6F39D3C, 0x298, 5),
    (0xD854F864, 0x29C, 5),
    (0xD8F4FBD2, 0x2A0, 2),
    (0xDC414338, 0x2A4, 5),
    (0xDC9C3D2F, 0x2A8, 5),
    (0xDD83290F, 0x2AC, 5),
    (0xDE07FD61, 0x2B0, 5),
    (0xDF888E8B, 0x2B4, 2),
    (0xE1D22572, 0x2B8, 5),
    (0xE1D56972, 0x2BC, 5),
    (0xE2C6FD16, 0x2C0, 2),
    (0xE3E5D41D, 0x2C4, 5),
    (0xE6213731, 0x2C8, 7),
    (0xE6E29192, 0x2D0, 5),
    (0xE883DFAB, 0x2D4, 5),
    (0xE90161F5, 0x2D8, 5),
    (0xE9F462F6, 0x2DC, 5),
    (0xEB1219A4, 0x2E0, 2),
    (0xECBC202D, 0x2E4, 5),
    (0xED170E69, 0x2E8, 2),
    (0xEDB407E8, 0x2EC, 5),
    (0xEE92BCAB, 0x2F0, 5),
    (0xF15C6A7F, 0x2F4, 5),
    (0xF25A5100, 0x2F8, 5),
    (0xF3C4CAE9, 0x2FC, 7),
    (0xF55FBBBD, 0x304, 5),
    (0xF5DE94DD, 0x308, 5),
    (0xF73592C7, 0x30C, 5),
    (0xFBB81BA9, 0x310, 5),
    (0xFEADD5BE, 0x314, 5),
    (0xFEE76495, 0x318, 2),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<CharacterParamEntry>,
    pub trailing_data: Vec<u8>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    CHARACTERPARAM_FIELD_HASHES
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
    if field_specs.len() != CHARACTERPARAM_FIELD_HASHES.len() {
        return Err(format!(
            "characterparam command count mismatch: file has {}, expected {}",
            field_specs.len(),
            CHARACTERPARAM_FIELD_HASHES.len()
        ));
    }
    for (index, spec) in field_specs.iter().enumerate() {
        let (expected_hash, expected_offset, expected_kind) = CHARACTERPARAM_FIELD_HASHES[index];
        if spec.hash != expected_hash
            || spec.entry_offset != expected_offset
            || spec.kind != expected_kind
        {
            return Err(format!(
                "characterparam command mismatch at index {}: got (hash=0x{:08X}, offset=0x{:X}, kind={}), expected (hash=0x{:08X}, offset=0x{:X}, kind={})",
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

pub fn parse_characterparam(data: &[u8]) -> Result<CharacterParamData, String> {
    let file = read_param_binary(data)?;
    if file.header.entry_size != CHARACTERPARAM_ENTRY_SIZE {
        return Err(format!(
            "characterparam entry_size mismatch: file has {}, expected {}",
            file.header.entry_size, CHARACTERPARAM_ENTRY_SIZE
        ));
    }
    if file.header.commands_count != CHARACTERPARAM_CMD_COUNT {
        return Err(format!(
            "characterparam command count mismatch: file has {}, expected {}",
            file.header.commands_count, CHARACTERPARAM_CMD_COUNT
        ));
    }
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        if raw.len() != CHARACTERPARAM_ENTRY_SIZE as usize {
            return Err(format!(
                "characterparam row {} size {} != expected {}",
                i,
                raw.len(),
                CHARACTERPARAM_ENTRY_SIZE
            ));
        }
        let mut cursor = Cursor::new(raw.as_slice());
        let mut entry = CharacterParamEntry::read(&mut cursor).map_err(|e| e.to_string())?;
        entry.entry_id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(entry);
    }

    Ok(CharacterParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
    })
}

pub fn build_characterparam(b: &CharacterParamData) -> Result<Vec<u8>, String> {
    if !b.field_specs.is_empty() {
        validate_field_specs(&b.field_specs)?;
    }
    let field_specs = if b.field_specs.is_empty() {
        expected_field_specs()
    } else {
        b.field_specs.clone()
    };

    let entry_size = CHARACTERPARAM_ENTRY_SIZE as usize;
    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for entry in &b.entries {
        let mut raw = vec![0u8; entry_size];
        let mut cursor = Cursor::new(&mut raw[..]);
        entry
            .write(&mut cursor)
            .map_err(|err| format!("characterparam write entry: {}", err))?;
        if cursor.position() as usize > entry_size {
            return Err("characterparam encoded entry larger than entry_size".to_string());
        }
        entries_raw.push(raw);
    }

    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = CHARACTERPARAM_CMD_COUNT;
    header.entry_size = CHARACTERPARAM_ENTRY_SIZE;

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
        "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\characterparam.bin";

    #[test]
    fn characterparam_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read characterparam sample file");

        let parsed =
            parse_characterparam(&source).expect("failed to parse characterparam sample file");
        let rebuilt =
            build_characterparam(&parsed).expect("failed to rebuild characterparam sample file");
        assert_eq!(rebuilt, source);

        assert!(!parsed.entries.is_empty(), "characterparam sample has no entries");

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
            build_characterparam(&with_added).expect("failed to build characterparam after add");
        let added_parsed =
            parse_characterparam(&added_bytes).expect("failed to parse characterparam after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(added_parsed.entries.last().map(|entry| entry.entry_id), Some(next_id));

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes = build_characterparam(&with_updated)
            .expect("failed to build characterparam after update");
        let updated_parsed = parse_characterparam(&updated_bytes)
            .expect("failed to parse characterparam after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes = build_characterparam(&with_deleted)
            .expect("failed to build characterparam after delete");
        let deleted_parsed = parse_characterparam(&deleted_bytes)
            .expect("failed to parse characterparam after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
