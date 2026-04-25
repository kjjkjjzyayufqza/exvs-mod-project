use serde::{Deserialize, Serialize};

pub const CHARACTERPARAM_ENTRY_SIZE: u32 = 796;
pub const CHARACTERPARAM_CMD_COUNT: u32 = 197;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterParamEntry {
    pub entry_id: u32,
    pub max_hp: i32, // 0x00D7CEDB +0x000 kind=2 IDA:sub_1405F9010 case8
    pub hp_correction_rate: f32, // 0x00EC483C +0x004 kind=5
    pub boost_gauge_pct: f32, // 0x01F15731 +0x008 kind=5
    pub base_unit_cost: i32, // 0x04371326 +0x00C kind=2 IDA:sub_1405F9180 case14,15,18
    pub ammo_count_main: i32, // 0x07B8E157 +0x010 kind=2
    pub down_value_rate: f32, // 0x0804605C +0x014 kind=5
    pub boost_gauge_max: i32, // 0x080AF70C +0x018 kind=2
    pub front_tracking_angle: f32, // 0x08218288 +0x01C kind=5
    pub sub_shot_cost: i32, // 0x0872029D +0x020 kind=2 IDA:sub_1405F9180 case3
    pub rear_tracking_angle: f32, // 0x08A0ADE8 +0x024 kind=5
    pub red_lock_distance: f32, // 0x08ECF0BE +0x028 kind=5
    pub boost_recovery_speed: i32, // 0x0911077E +0x02C kind=2
    pub dmg_multiplier_tier_a: f32, // 0x0ACCE031 +0x030 kind=5
    pub unit_id_composite: i32, // 0x0B25CB7F +0x034 kind=2
    pub green_lock_distance: f32, // 0x0F8134A7 +0x038 kind=5
    pub dmg_multiplier_tier_b: f32, // 0x104DFF9D +0x03C kind=5
    pub model_scale: f32, // 0x1113F30E +0x040 kind=5
    pub movement_speed_base: f32, // 0x14F89980 +0x044 kind=5
    pub boost_speed_pct: f32, // 0x157CC9FE +0x048 kind=5
    pub gravity_offset: f32, // 0x15B67A85 +0x04C kind=5
    pub body_collision_radius: f32, // 0x1698E3D8 +0x050 kind=5
    pub is_transformable: i32, // 0x18415DC4 +0x054 kind=2
    pub unit_attribute_flags: u32, // 0x1B2228B5 +0x058 kind=1
    pub has_shield: i32, // 0x1B8808F8 +0x05C kind=2
    pub dmg_multiplier_tier_c: f32, // 0x1BB18A48 +0x060 kind=5
    pub lock_on_fov_angle: f32, // 0x1BFADFD3 +0x064 kind=5
    pub down_value_threshold: f32, // 0x1C936B77 +0x068 kind=5
    pub assist_damage: i32, // 0x1D6EA3F1 +0x06C kind=2 IDA:sub_1405F9010 case6,7 +0x06C kind=2
    pub assist_correction_rate: f32, // 0x1E61CF9F +0x070 kind=5
    pub burst_cost: i32, // 0x1EA3FAE1 +0x074 kind=2 IDA:sub_1405F9180 case9 +0x074 kind=2
    pub step_tracking_angle_min: f32, // 0x21632B7A +0x078 kind=5
    pub step_tracking_angle_max: f32, // 0x21E2041A +0x07C kind=5
    pub boost_dash_speed_rate: f32, // 0x22169CCE +0x080 kind=5
    pub special_cost: i32, // 0x22823596 +0x084 kind=2 IDA:sub_1405F9180 case2 +0x084 kind=2
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
    pub guard_damage_rate: f32, // 0x30099C4D +0x0C0 kind=5
    pub barrier_damage_rate: f32, // 0x324F2214 +0x0C4 kind=5
    pub reserved_flag_0c8: i32, // 0x32F4D4BE +0x0C8 kind=2
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
    pub body_height: f32, // 0x51DD39F0 +0x130 kind=5
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
    pub walk_speed: f32, // 0x82B967A9 +0x1AC kind=5
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
    pub reserved_flag_210: i32, // 0xAEAC01A7 +0x210 kind=2
    pub melee_camera_angle: f32, // 0xAF153580 +0x214 kind=5
    pub assist_reload_frame: i32, // 0xB2900720 +0x218 kind=2
    pub reserved_flag_21c: i32, // 0xB2E6B445 +0x21C kind=2
    pub dmg_multiplier_tier_i: f32, // 0xB3373BD9 +0x220 kind=5
    pub melee_lunge_offset: f32, // 0xB4F17B6F +0x224 kind=5
    pub reserved_flag_228: i32, // 0xB58B705C +0x228 kind=2
    pub step_cancel_count: i32, // 0xB5FDC339 +0x22C kind=2
    pub boost_gauge_initial: i32, // 0xB7D5327E +0x230 kind=2
    pub fall_speed_base: f32, // 0xB91793D4 +0x234 kind=5
    pub air_dash_speed_base: f32, // 0xBA900811 +0x238 kind=5
    pub alert_range_distance: f32, // 0xBAE8C388 +0x23C kind=5
    pub alert_range_fov: f32, // 0xBB19842F +0x240 kind=5
    pub radar_display_scale: f32, // 0xBC427D55 +0x244 kind=5
    pub dash_speed_base: f32, // 0xBE256E0C +0x248 kind=5
    pub reserved_flag_24c: i32, // 0xBE8D97FB +0x24C kind=2
    pub radar_fov_pct: f32, // 0xC1405939 +0x250 kind=5
    pub reserved_flag_254: i32, // 0xC28C40CA +0x254 kind=2
    pub ammo_reserve_count: i32, // 0xC2FAF3AF +0x258 kind=2
    pub ammo_correction_offset: f32, // 0xC3F64BF9 +0x25C kind=5
    pub reserved_flag_260: i32, // 0xC4852F00 +0x260 kind=2
    pub charge_time_frame: i32, // 0xC59737B6 +0x264 kind=2
    pub reserved_flag_268: i32, // 0xC5E184D3 +0x268 kind=2
    pub charge_shot_cost: i32, // 0xC6A88D7F +0x26C kind=2 IDA:sub_1405F9180 case10 +0x26C kind=2
    pub charge_damage_multiplier: f32, // 0xC6E2AD28 +0x270 kind=5
    pub charge_correction_offset: f32, // 0xC8B2F571 +0x274 kind=5
    pub charge_bonus_offset: f32, // 0xCAF44B28 +0x278 kind=5
    pub charge_gauge_offset: f32, // 0xCB36211F +0x27C kind=5
    pub melee_lock_angle: f32, // 0xD01D00DF +0x280 kind=5
    pub target_range_distance: f32, // 0xD249350C +0x284 kind=5
    pub target_correction_offset: f32, // 0xD24DC1FD +0x288 kind=5
    pub target_fov_pct: f32, // 0xD2D0C774 +0x28C kind=5
    pub radar_range_distance: f32, // 0xD524F115 +0x290 kind=5
    pub radar_sweep_angle: f32, // 0xD54CE896 +0x294 kind=5
    pub radar_correction_offset: f32, // 0xD6F39D3C +0x298 kind=5
    pub radar_display_offset: f32, // 0xD854F864 +0x29C kind=5
    pub melee_cost: i32, // 0xD8F4FBD2 +0x2A0 kind=2 IDA:sub_1405F9180 case1 +0x2A0 kind=2
    pub melee_cost_correction_offset: f32, // 0xDC414338 +0x2A4 kind=5
    pub melee_aim_angle: f32, // 0xDC9C3D2F +0x2A8 kind=5
    pub melee_aim_correction_offset: f32, // 0xDD83290F +0x2AC kind=5
    pub melee_range_offset: f32, // 0xDE07FD61 +0x2B0 kind=5
    pub rotation_speed_degrees: i32, // 0xDF888E8B +0x2B4 kind=2
    pub sub_shot_fov_alt: f32, // 0xE1D22572 +0x2B8 kind=5
    pub melee_reach_distance: f32, // 0xE1D56972 +0x2BC kind=5
    pub sub_shot_damage: i32, // 0xE2C6FD16 +0x2C0 kind=2 IDA:sub_1405F9010 case4,5,12,13 +0x2C0 kind=2
    pub down_value_per_hit: f32, // 0xE3E5D41D +0x2C4 kind=5
    pub action_label_offset: u32, // 0xE6213731 +0x2C8 kind=7
    pub action_label_size: u32,
    pub target_switch_distance: f32, // 0xE6E29192 +0x2D0 kind=5
    pub target_switch_fov: f32, // 0xE883DFAB +0x2D4 kind=5
    pub main_shot_speed_base: f32, // 0xE90161F5 +0x2D8 kind=5
    pub damage_proration_rate: f32, // 0xE9F462F6 +0x2DC kind=5
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
    pub max_render_distance: f32, // 0xF73592C7 +0x30C kind=5
    pub render_correction_offset: f32, // 0xFBB81BA9 +0x310 kind=5
    pub final_damage_multiplier: f32, // 0xFEADD5BE +0x314 kind=5
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

pub fn parse_characterparam_entry(entry_id: u32, data: &[u8]) -> Result<CharacterParamEntry, String> {
    if data.len() < CHARACTERPARAM_ENTRY_SIZE as usize {
        return Err(format!("CharacterParamEntry entry too small: {} < {}", data.len(), CHARACTERPARAM_ENTRY_SIZE));
    }
    Ok(CharacterParamEntry {
        entry_id,
        max_hp: read_i32(data, 0x00),
        hp_correction_rate: read_f32(data, 0x04),
        boost_gauge_pct: read_f32(data, 0x08),
        base_unit_cost: read_i32(data, 0x0C),
        ammo_count_main: read_i32(data, 0x10),
        down_value_rate: read_f32(data, 0x14),
        boost_gauge_max: read_i32(data, 0x18),
        front_tracking_angle: read_f32(data, 0x1C),
        sub_shot_cost: read_i32(data, 0x20),
        rear_tracking_angle: read_f32(data, 0x24),
        red_lock_distance: read_f32(data, 0x28),
        boost_recovery_speed: read_i32(data, 0x2C),
        dmg_multiplier_tier_a: read_f32(data, 0x30),
        unit_id_composite: read_i32(data, 0x34),
        green_lock_distance: read_f32(data, 0x38),
        dmg_multiplier_tier_b: read_f32(data, 0x3C),
        model_scale: read_f32(data, 0x40),
        movement_speed_base: read_f32(data, 0x44),
        boost_speed_pct: read_f32(data, 0x48),
        gravity_offset: read_f32(data, 0x4C),
        body_collision_radius: read_f32(data, 0x50),
        is_transformable: read_i32(data, 0x54),
        unit_attribute_flags: read_u32(data, 0x58),
        has_shield: read_i32(data, 0x5C),
        dmg_multiplier_tier_c: read_f32(data, 0x60),
        lock_on_fov_angle: read_f32(data, 0x64),
        down_value_threshold: read_f32(data, 0x68),
        assist_damage: read_i32(data, 0x6C),
        assist_correction_rate: read_f32(data, 0x70),
        burst_cost: read_i32(data, 0x74),
        step_tracking_angle_min: read_f32(data, 0x78),
        step_tracking_angle_max: read_f32(data, 0x7C),
        boost_dash_speed_rate: read_f32(data, 0x80),
        special_cost: read_i32(data, 0x84),
        special_gauge_start_rate: read_f32(data, 0x88),
        reserved_flag_08c: read_i32(data, 0x8C),
        landing_recovery_rate: read_f32(data, 0x90),
        damage_correction_base: read_f32(data, 0x94),
        step_speed_rate: read_f32(data, 0x98),
        camera_pitch_down_angle: read_f32(data, 0x9C),
        dmg_multiplier_tier_d: read_f32(data, 0xA0),
        camera_pitch_up_angle: read_f32(data, 0xA4),
        main_ammo_reload_frame: read_i32(data, 0xA8),
        aerial_damage_rate: read_f32(data, 0xAC),
        reserved_flag_0b0: read_i32(data, 0xB0),
        melee_combo_limit: read_i32(data, 0xB4),
        special_melee_damage: read_i32(data, 0xB8),
        special_melee_correction_rate: read_f32(data, 0xBC),
        guard_damage_rate: read_f32(data, 0xC0),
        barrier_damage_rate: read_f32(data, 0xC4),
        reserved_flag_0c8: read_i32(data, 0xC8),
        melee_damage: read_i32(data, 0xCC),
        melee_correction_offset: read_f32(data, 0xD0),
        melee_tracking_angle: read_f32(data, 0xD4),
        melee_bonus_rate: read_f32(data, 0xD8),
        melee_reach_base: read_f32(data, 0xDC),
        score_value_base: read_i32(data, 0xE0),
        charge_time_offset: read_f32(data, 0xE4),
        camera_distance_near: read_f32(data, 0xE8),
        camera_fov_default: read_f32(data, 0xEC),
        dmg_multiplier_tier_e: read_f32(data, 0xF0),
        reserved_flag_0f4: read_i32(data, 0xF4),
        reserved_flag_0f8: read_i32(data, 0xF8),
        camera_offset_x: read_f32(data, 0xFC),
        dmg_multiplier_tier_f: read_f32(data, 0x100),
        respawn_invincibility_frame: read_i32(data, 0x104),
        camera_fov_battle: read_f32(data, 0x108),
        dmg_multiplier_tier_g: read_f32(data, 0x10C),
        movement_type: read_u32(data, 0x110),
        camera_distance_far: read_f32(data, 0x114),
        camera_offset_y: read_f32(data, 0x118),
        reserved_flag_11c: read_i32(data, 0x11C),
        reserved_flag_120: read_i32(data, 0x120),
        camera_offset_z: read_f32(data, 0x124),
        camera_offset_partner_x: read_f32(data, 0x128),
        camera_offset_partner_y: read_f32(data, 0x12C),
        body_height: read_f32(data, 0x130),
        reserved_flag_134: read_i32(data, 0x134),
        body_offset_y: read_f32(data, 0x138),
        partner_cost_penalty_frame: read_i32(data, 0x13C),
        charge_shot_damage: read_i32(data, 0x140),
        charge_shot_correction_offset: read_f32(data, 0x144),
        yellow_lock_distance: read_f32(data, 0x148),
        lock_on_range_min: read_f32(data, 0x14C),
        lock_on_angle_main: read_f32(data, 0x150),
        reserved_flag_154: read_i32(data, 0x154),
        aim_assist_angle: read_f32(data, 0x158),
        sub_ammo_reload_frame: read_i32(data, 0x15C),
        reserved_flag_160: read_i32(data, 0x160),
        special_melee_cost: read_i32(data, 0x164),
        special_reload_frame: read_i32(data, 0x168),
        special_fov_pct: read_f32(data, 0x16C),
        special_correction_base: read_f32(data, 0x170),
        special_correction_rate: read_f32(data, 0x174),
        burst_correction_base: read_f32(data, 0x178),
        burst_fov_pct: read_f32(data, 0x17C),
        burst_attribute_flags: read_u32(data, 0x180),
        burst_speed_multiplier: read_f32(data, 0x184),
        burst_lock_on_angle: read_f32(data, 0x188),
        burst_damage: read_i32(data, 0x18C),
        engagement_range_near: read_f32(data, 0x190),
        hitbox_height: read_f32(data, 0x194),
        reserved_flag_198: read_i32(data, 0x198),
        auto_aim_angle_limit: read_f32(data, 0x19C),
        respawn_cost: read_i32(data, 0x1A0),
        main_shot_cost: read_i32(data, 0x1A4),
        score_bonus_cap: read_i32(data, 0x1A8),
        walk_speed: read_f32(data, 0x1AC),
        team_cost_value: read_i32(data, 0x1B0),
        boost_consumption_rate: read_f32(data, 0x1B4),
        close_tracking_angle: read_f32(data, 0x1B8),
        main_shot_correction_rate: read_f32(data, 0x1BC),
        gravity_multiplier: read_f32(data, 0x1C0),
        ranged_tracking_angle_min: read_f32(data, 0x1C4),
        ranged_tracking_angle_max: read_f32(data, 0x1C8),
        special_damage: read_i32(data, 0x1CC),
        dmg_multiplier_tier_h: read_f32(data, 0x1D0),
        engagement_range_far: read_f32(data, 0x1D4),
        sub_shot_correction_base: read_f32(data, 0x1D8),
        sub_shot_fov_pct: read_f32(data, 0x1DC),
        sub_shot_correction_rate: read_f32(data, 0x1E0),
        reserved_flag_1e4: read_i32(data, 0x1E4),
        lock_on_distance_max: read_f32(data, 0x1E8),
        weapon_attribute_flags: read_u32(data, 0x1EC),
        wide_camera_angle: read_f32(data, 0x1F0),
        narrow_camera_angle: read_f32(data, 0x1F4),
        burst_damage_multiplier: read_f32(data, 0x1F8),
        minimum_aim_angle: read_f32(data, 0x1FC),
        aim_correction_offset_x: read_f32(data, 0x200),
        aim_correction_offset_y: read_f32(data, 0x204),
        aim_correction_offset_z: read_f32(data, 0x208),
        sub_shot_cost_scaled: read_i32(data, 0x20C),
        reserved_flag_210: read_i32(data, 0x210),
        melee_camera_angle: read_f32(data, 0x214),
        assist_reload_frame: read_i32(data, 0x218),
        reserved_flag_21c: read_i32(data, 0x21C),
        dmg_multiplier_tier_i: read_f32(data, 0x220),
        melee_lunge_offset: read_f32(data, 0x224),
        reserved_flag_228: read_i32(data, 0x228),
        step_cancel_count: read_i32(data, 0x22C),
        boost_gauge_initial: read_i32(data, 0x230),
        fall_speed_base: read_f32(data, 0x234),
        air_dash_speed_base: read_f32(data, 0x238),
        alert_range_distance: read_f32(data, 0x23C),
        alert_range_fov: read_f32(data, 0x240),
        radar_display_scale: read_f32(data, 0x244),
        dash_speed_base: read_f32(data, 0x248),
        reserved_flag_24c: read_i32(data, 0x24C),
        radar_fov_pct: read_f32(data, 0x250),
        reserved_flag_254: read_i32(data, 0x254),
        ammo_reserve_count: read_i32(data, 0x258),
        ammo_correction_offset: read_f32(data, 0x25C),
        reserved_flag_260: read_i32(data, 0x260),
        charge_time_frame: read_i32(data, 0x264),
        reserved_flag_268: read_i32(data, 0x268),
        charge_shot_cost: read_i32(data, 0x26C),
        charge_damage_multiplier: read_f32(data, 0x270),
        charge_correction_offset: read_f32(data, 0x274),
        charge_bonus_offset: read_f32(data, 0x278),
        charge_gauge_offset: read_f32(data, 0x27C),
        melee_lock_angle: read_f32(data, 0x280),
        target_range_distance: read_f32(data, 0x284),
        target_correction_offset: read_f32(data, 0x288),
        target_fov_pct: read_f32(data, 0x28C),
        radar_range_distance: read_f32(data, 0x290),
        radar_sweep_angle: read_f32(data, 0x294),
        radar_correction_offset: read_f32(data, 0x298),
        radar_display_offset: read_f32(data, 0x29C),
        melee_cost: read_i32(data, 0x2A0),
        melee_cost_correction_offset: read_f32(data, 0x2A4),
        melee_aim_angle: read_f32(data, 0x2A8),
        melee_aim_correction_offset: read_f32(data, 0x2AC),
        melee_range_offset: read_f32(data, 0x2B0),
        rotation_speed_degrees: read_i32(data, 0x2B4),
        sub_shot_fov_alt: read_f32(data, 0x2B8),
        melee_reach_distance: read_f32(data, 0x2BC),
        sub_shot_damage: read_i32(data, 0x2C0),
        down_value_per_hit: read_f32(data, 0x2C4),
        action_label_offset: read_u32(data, 0x2C8),
        action_label_size: read_u32(data, 0x2CC),
        target_switch_distance: read_f32(data, 0x2D0),
        target_switch_fov: read_f32(data, 0x2D4),
        main_shot_speed_base: read_f32(data, 0x2D8),
        damage_proration_rate: read_f32(data, 0x2DC),
        main_shot_damage: read_i32(data, 0x2E0),
        combo_proration_rate: read_f32(data, 0x2E4),
        reserved_flag_2e8: read_i32(data, 0x2E8),
        shot_velocity_base: read_f32(data, 0x2EC),
        main_shot_damage_multiplier: read_f32(data, 0x2F0),
        melee_damage_correction_rate: read_f32(data, 0x2F4),
        ranged_damage_correction_rate: read_f32(data, 0x2F8),
        resource_label_offset: read_u32(data, 0x2FC),
        resource_label_size: read_u32(data, 0x300),
        projectile_tracking_angle_min: read_f32(data, 0x304),
        projectile_tracking_angle_max: read_f32(data, 0x308),
        max_render_distance: read_f32(data, 0x30C),
        render_correction_offset: read_f32(data, 0x310),
        final_damage_multiplier: read_f32(data, 0x314),
        assist_cost: read_i32(data, 0x318),
    })
}

pub fn write_characterparam_entry(entry: &CharacterParamEntry, buf: &mut [u8]) {
    write_i32(buf, 0x00, entry.max_hp);
    write_f32(buf, 0x04, entry.hp_correction_rate);
    write_f32(buf, 0x08, entry.boost_gauge_pct);
    write_i32(buf, 0x0C, entry.base_unit_cost);
    write_i32(buf, 0x10, entry.ammo_count_main);
    write_f32(buf, 0x14, entry.down_value_rate);
    write_i32(buf, 0x18, entry.boost_gauge_max);
    write_f32(buf, 0x1C, entry.front_tracking_angle);
    write_i32(buf, 0x20, entry.sub_shot_cost);
    write_f32(buf, 0x24, entry.rear_tracking_angle);
    write_f32(buf, 0x28, entry.red_lock_distance);
    write_i32(buf, 0x2C, entry.boost_recovery_speed);
    write_f32(buf, 0x30, entry.dmg_multiplier_tier_a);
    write_i32(buf, 0x34, entry.unit_id_composite);
    write_f32(buf, 0x38, entry.green_lock_distance);
    write_f32(buf, 0x3C, entry.dmg_multiplier_tier_b);
    write_f32(buf, 0x40, entry.model_scale);
    write_f32(buf, 0x44, entry.movement_speed_base);
    write_f32(buf, 0x48, entry.boost_speed_pct);
    write_f32(buf, 0x4C, entry.gravity_offset);
    write_f32(buf, 0x50, entry.body_collision_radius);
    write_i32(buf, 0x54, entry.is_transformable);
    write_u32(buf, 0x58, entry.unit_attribute_flags);
    write_i32(buf, 0x5C, entry.has_shield);
    write_f32(buf, 0x60, entry.dmg_multiplier_tier_c);
    write_f32(buf, 0x64, entry.lock_on_fov_angle);
    write_f32(buf, 0x68, entry.down_value_threshold);
    write_i32(buf, 0x6C, entry.assist_damage);
    write_f32(buf, 0x70, entry.assist_correction_rate);
    write_i32(buf, 0x74, entry.burst_cost);
    write_f32(buf, 0x78, entry.step_tracking_angle_min);
    write_f32(buf, 0x7C, entry.step_tracking_angle_max);
    write_f32(buf, 0x80, entry.boost_dash_speed_rate);
    write_i32(buf, 0x84, entry.special_cost);
    write_f32(buf, 0x88, entry.special_gauge_start_rate);
    write_i32(buf, 0x8C, entry.reserved_flag_08c);
    write_f32(buf, 0x90, entry.landing_recovery_rate);
    write_f32(buf, 0x94, entry.damage_correction_base);
    write_f32(buf, 0x98, entry.step_speed_rate);
    write_f32(buf, 0x9C, entry.camera_pitch_down_angle);
    write_f32(buf, 0xA0, entry.dmg_multiplier_tier_d);
    write_f32(buf, 0xA4, entry.camera_pitch_up_angle);
    write_i32(buf, 0xA8, entry.main_ammo_reload_frame);
    write_f32(buf, 0xAC, entry.aerial_damage_rate);
    write_i32(buf, 0xB0, entry.reserved_flag_0b0);
    write_i32(buf, 0xB4, entry.melee_combo_limit);
    write_i32(buf, 0xB8, entry.special_melee_damage);
    write_f32(buf, 0xBC, entry.special_melee_correction_rate);
    write_f32(buf, 0xC0, entry.guard_damage_rate);
    write_f32(buf, 0xC4, entry.barrier_damage_rate);
    write_i32(buf, 0xC8, entry.reserved_flag_0c8);
    write_i32(buf, 0xCC, entry.melee_damage);
    write_f32(buf, 0xD0, entry.melee_correction_offset);
    write_f32(buf, 0xD4, entry.melee_tracking_angle);
    write_f32(buf, 0xD8, entry.melee_bonus_rate);
    write_f32(buf, 0xDC, entry.melee_reach_base);
    write_i32(buf, 0xE0, entry.score_value_base);
    write_f32(buf, 0xE4, entry.charge_time_offset);
    write_f32(buf, 0xE8, entry.camera_distance_near);
    write_f32(buf, 0xEC, entry.camera_fov_default);
    write_f32(buf, 0xF0, entry.dmg_multiplier_tier_e);
    write_i32(buf, 0xF4, entry.reserved_flag_0f4);
    write_i32(buf, 0xF8, entry.reserved_flag_0f8);
    write_f32(buf, 0xFC, entry.camera_offset_x);
    write_f32(buf, 0x100, entry.dmg_multiplier_tier_f);
    write_i32(buf, 0x104, entry.respawn_invincibility_frame);
    write_f32(buf, 0x108, entry.camera_fov_battle);
    write_f32(buf, 0x10C, entry.dmg_multiplier_tier_g);
    write_u32(buf, 0x110, entry.movement_type);
    write_f32(buf, 0x114, entry.camera_distance_far);
    write_f32(buf, 0x118, entry.camera_offset_y);
    write_i32(buf, 0x11C, entry.reserved_flag_11c);
    write_i32(buf, 0x120, entry.reserved_flag_120);
    write_f32(buf, 0x124, entry.camera_offset_z);
    write_f32(buf, 0x128, entry.camera_offset_partner_x);
    write_f32(buf, 0x12C, entry.camera_offset_partner_y);
    write_f32(buf, 0x130, entry.body_height);
    write_i32(buf, 0x134, entry.reserved_flag_134);
    write_f32(buf, 0x138, entry.body_offset_y);
    write_i32(buf, 0x13C, entry.partner_cost_penalty_frame);
    write_i32(buf, 0x140, entry.charge_shot_damage);
    write_f32(buf, 0x144, entry.charge_shot_correction_offset);
    write_f32(buf, 0x148, entry.yellow_lock_distance);
    write_f32(buf, 0x14C, entry.lock_on_range_min);
    write_f32(buf, 0x150, entry.lock_on_angle_main);
    write_i32(buf, 0x154, entry.reserved_flag_154);
    write_f32(buf, 0x158, entry.aim_assist_angle);
    write_i32(buf, 0x15C, entry.sub_ammo_reload_frame);
    write_i32(buf, 0x160, entry.reserved_flag_160);
    write_i32(buf, 0x164, entry.special_melee_cost);
    write_i32(buf, 0x168, entry.special_reload_frame);
    write_f32(buf, 0x16C, entry.special_fov_pct);
    write_f32(buf, 0x170, entry.special_correction_base);
    write_f32(buf, 0x174, entry.special_correction_rate);
    write_f32(buf, 0x178, entry.burst_correction_base);
    write_f32(buf, 0x17C, entry.burst_fov_pct);
    write_u32(buf, 0x180, entry.burst_attribute_flags);
    write_f32(buf, 0x184, entry.burst_speed_multiplier);
    write_f32(buf, 0x188, entry.burst_lock_on_angle);
    write_i32(buf, 0x18C, entry.burst_damage);
    write_f32(buf, 0x190, entry.engagement_range_near);
    write_f32(buf, 0x194, entry.hitbox_height);
    write_i32(buf, 0x198, entry.reserved_flag_198);
    write_f32(buf, 0x19C, entry.auto_aim_angle_limit);
    write_i32(buf, 0x1A0, entry.respawn_cost);
    write_i32(buf, 0x1A4, entry.main_shot_cost);
    write_i32(buf, 0x1A8, entry.score_bonus_cap);
    write_f32(buf, 0x1AC, entry.walk_speed);
    write_i32(buf, 0x1B0, entry.team_cost_value);
    write_f32(buf, 0x1B4, entry.boost_consumption_rate);
    write_f32(buf, 0x1B8, entry.close_tracking_angle);
    write_f32(buf, 0x1BC, entry.main_shot_correction_rate);
    write_f32(buf, 0x1C0, entry.gravity_multiplier);
    write_f32(buf, 0x1C4, entry.ranged_tracking_angle_min);
    write_f32(buf, 0x1C8, entry.ranged_tracking_angle_max);
    write_i32(buf, 0x1CC, entry.special_damage);
    write_f32(buf, 0x1D0, entry.dmg_multiplier_tier_h);
    write_f32(buf, 0x1D4, entry.engagement_range_far);
    write_f32(buf, 0x1D8, entry.sub_shot_correction_base);
    write_f32(buf, 0x1DC, entry.sub_shot_fov_pct);
    write_f32(buf, 0x1E0, entry.sub_shot_correction_rate);
    write_i32(buf, 0x1E4, entry.reserved_flag_1e4);
    write_f32(buf, 0x1E8, entry.lock_on_distance_max);
    write_u32(buf, 0x1EC, entry.weapon_attribute_flags);
    write_f32(buf, 0x1F0, entry.wide_camera_angle);
    write_f32(buf, 0x1F4, entry.narrow_camera_angle);
    write_f32(buf, 0x1F8, entry.burst_damage_multiplier);
    write_f32(buf, 0x1FC, entry.minimum_aim_angle);
    write_f32(buf, 0x200, entry.aim_correction_offset_x);
    write_f32(buf, 0x204, entry.aim_correction_offset_y);
    write_f32(buf, 0x208, entry.aim_correction_offset_z);
    write_i32(buf, 0x20C, entry.sub_shot_cost_scaled);
    write_i32(buf, 0x210, entry.reserved_flag_210);
    write_f32(buf, 0x214, entry.melee_camera_angle);
    write_i32(buf, 0x218, entry.assist_reload_frame);
    write_i32(buf, 0x21C, entry.reserved_flag_21c);
    write_f32(buf, 0x220, entry.dmg_multiplier_tier_i);
    write_f32(buf, 0x224, entry.melee_lunge_offset);
    write_i32(buf, 0x228, entry.reserved_flag_228);
    write_i32(buf, 0x22C, entry.step_cancel_count);
    write_i32(buf, 0x230, entry.boost_gauge_initial);
    write_f32(buf, 0x234, entry.fall_speed_base);
    write_f32(buf, 0x238, entry.air_dash_speed_base);
    write_f32(buf, 0x23C, entry.alert_range_distance);
    write_f32(buf, 0x240, entry.alert_range_fov);
    write_f32(buf, 0x244, entry.radar_display_scale);
    write_f32(buf, 0x248, entry.dash_speed_base);
    write_i32(buf, 0x24C, entry.reserved_flag_24c);
    write_f32(buf, 0x250, entry.radar_fov_pct);
    write_i32(buf, 0x254, entry.reserved_flag_254);
    write_i32(buf, 0x258, entry.ammo_reserve_count);
    write_f32(buf, 0x25C, entry.ammo_correction_offset);
    write_i32(buf, 0x260, entry.reserved_flag_260);
    write_i32(buf, 0x264, entry.charge_time_frame);
    write_i32(buf, 0x268, entry.reserved_flag_268);
    write_i32(buf, 0x26C, entry.charge_shot_cost);
    write_f32(buf, 0x270, entry.charge_damage_multiplier);
    write_f32(buf, 0x274, entry.charge_correction_offset);
    write_f32(buf, 0x278, entry.charge_bonus_offset);
    write_f32(buf, 0x27C, entry.charge_gauge_offset);
    write_f32(buf, 0x280, entry.melee_lock_angle);
    write_f32(buf, 0x284, entry.target_range_distance);
    write_f32(buf, 0x288, entry.target_correction_offset);
    write_f32(buf, 0x28C, entry.target_fov_pct);
    write_f32(buf, 0x290, entry.radar_range_distance);
    write_f32(buf, 0x294, entry.radar_sweep_angle);
    write_f32(buf, 0x298, entry.radar_correction_offset);
    write_f32(buf, 0x29C, entry.radar_display_offset);
    write_i32(buf, 0x2A0, entry.melee_cost);
    write_f32(buf, 0x2A4, entry.melee_cost_correction_offset);
    write_f32(buf, 0x2A8, entry.melee_aim_angle);
    write_f32(buf, 0x2AC, entry.melee_aim_correction_offset);
    write_f32(buf, 0x2B0, entry.melee_range_offset);
    write_i32(buf, 0x2B4, entry.rotation_speed_degrees);
    write_f32(buf, 0x2B8, entry.sub_shot_fov_alt);
    write_f32(buf, 0x2BC, entry.melee_reach_distance);
    write_i32(buf, 0x2C0, entry.sub_shot_damage);
    write_f32(buf, 0x2C4, entry.down_value_per_hit);
    write_u32(buf, 0x2C8, entry.action_label_offset);
    write_u32(buf, 0x2CC, entry.action_label_size);
    write_f32(buf, 0x2D0, entry.target_switch_distance);
    write_f32(buf, 0x2D4, entry.target_switch_fov);
    write_f32(buf, 0x2D8, entry.main_shot_speed_base);
    write_f32(buf, 0x2DC, entry.damage_proration_rate);
    write_i32(buf, 0x2E0, entry.main_shot_damage);
    write_f32(buf, 0x2E4, entry.combo_proration_rate);
    write_i32(buf, 0x2E8, entry.reserved_flag_2e8);
    write_f32(buf, 0x2EC, entry.shot_velocity_base);
    write_f32(buf, 0x2F0, entry.main_shot_damage_multiplier);
    write_f32(buf, 0x2F4, entry.melee_damage_correction_rate);
    write_f32(buf, 0x2F8, entry.ranged_damage_correction_rate);
    write_u32(buf, 0x2FC, entry.resource_label_offset);
    write_u32(buf, 0x300, entry.resource_label_size);
    write_f32(buf, 0x304, entry.projectile_tracking_angle_min);
    write_f32(buf, 0x308, entry.projectile_tracking_angle_max);
    write_f32(buf, 0x30C, entry.max_render_distance);
    write_f32(buf, 0x310, entry.render_correction_offset);
    write_f32(buf, 0x314, entry.final_damage_multiplier);
    write_i32(buf, 0x318, entry.assist_cost);
}

fn read_u32(data: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]])
}

fn write_u32(buf: &mut [u8], offset: usize, val: u32) {
    let bytes = val.to_le_bytes();
    buf[offset..offset+4].copy_from_slice(&bytes);
}

fn read_i32(data: &[u8], offset: usize) -> i32 {
    i32::from_le_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]])
}

fn write_i32(buf: &mut [u8], offset: usize, val: i32) {
    let bytes = val.to_le_bytes();
    buf[offset..offset+4].copy_from_slice(&bytes);
}

fn read_f32(data: &[u8], offset: usize) -> f32 {
    f32::from_le_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]])
}

fn write_f32(buf: &mut [u8], offset: usize, val: f32) {
    let bytes = val.to_le_bytes();
    buf[offset..offset+4].copy_from_slice(&bytes);
}
