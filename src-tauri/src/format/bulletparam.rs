use serde::{Deserialize, Serialize};

pub const BULLETPARAM_ENTRY_SIZE: u32 = 320;
pub const BULLETPARAM_CMD_COUNT: u32 = 80;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulletParamEntry {
    pub entry_id: u32,
    pub initial_angle: f32,               // 0x0594D6D4 +0x000 kind=5 [-25,130]
    pub max_range: f32,                    // 0x05D5D30D +0x004 kind=5 [0,3600]
    pub move_type: u32,                    // 0x06E90346 +0x008 kind=1 {0..8}
    pub hit_effect_hash: u32,             // 0x0D6A5CD5 +0x00C kind=1 (105 unique)
    pub spread_angle: f32,                 // 0x130D4C0B +0x010 kind=5 [-80,80]
    pub hitbox_width: f32,                 // 0x13662C98 +0x014 kind=5 [0,20]
    pub hitbox_height: f32,                // 0x138B3675 +0x018 kind=5 [0,40]
    pub hitbox_depth: f32,                 // 0x13C6C469 +0x01C kind=5 [0,28]
    pub aim_offset_vertical: f32,          // 0x14AB0070 +0x020 kind=5 [-120,60]
    pub homing_range: f32,                 // 0x20FEDE31 +0x024 kind=5 [0,1000]
    pub visual_scale: f32,                 // 0x28BA5665 +0x028 kind=5 [0,7.5]
    pub hit_effect_scale: f32,             // 0x2E1E75E5 +0x02C kind=5 [0,5]
    pub spawn_offset_forward: f32,         // 0x2F446A4F +0x030 kind=5 [-175,200]
    pub inherit_speed_flag: u32,           // 0x319126CE +0x034 kind=1 {0,1}
    pub lifetime: i32,                     // 0x32ACABFB +0x038 kind=2 [0,10000]
    pub child_bullet_hash: u32,            // 0x36FCE2D7 +0x03C kind=1 (26 unique)
    pub collision_type: u32,               // 0x397CE80D +0x040 kind=1 {0..2}
    pub rotation_angle: f32,               // 0x3B52DAAB +0x044 kind=5 [-180,360]
    pub elevation_angle: f32,              // 0x3C3F1EB2 +0x048 kind=5 [-60,120]
    pub homing_type: u32,                  // 0x3CDF1516 +0x04C kind=1 {0..3}
    pub bullet_effect_hash: u32,           // 0x41435BE6 +0x050 kind=1 (126 unique)
    pub trail_effect_hash: u32,            // 0x41FBD241 +0x054 kind=1 (28 unique)
    pub muzzle_flash_hash: u32,            // 0x46961658 +0x058 kind=1 (12 unique)
    pub target_height_offset: f32,         // 0x4B382E24 +0x05C kind=5 [-100,200]
    pub pierce_count: i32,                 // 0x4B492895 +0x060 kind=2 [0,29]
    pub acceleration_value: f32,           // 0x4C55EA3D +0x064 kind=5 [-180,1000]
    pub bullet_action_hash: u32,           // 0x4D6BF281 +0x068 kind=1 (162 unique)
    pub homing_start_distance: f32,        // 0x52CA3B01 +0x06C kind=5 [0,100]
    pub vertical_launch_angle: f32,        // 0x55C77696 +0x070 kind=5 [-85,75]
    pub horizontal_aim_angle: f32,         // 0x58435AD9 +0x074 kind=5 [-102,165]
    pub hit_interval_frame: i32,           // 0x59332F69 +0x078 kind=2 [0,60]
    pub max_altitude: f32,                 // 0x63AC30E6 +0x07C kind=5 [0,150]
    pub spawn_offset_vertical: f32,        // 0x640A7C9D +0x080 kind=5 [-20,20]
    pub speed_internal: i32,               // 0x6481E0F7 +0x084 kind=2 [0,100000]
    pub collision_height: f32,             // 0x64C1F4FF +0x088 kind=5 [0,28]
    pub homing_duration: i32,              // 0x67921CDD +0x08C kind=2 [0,10000]
    pub on_expire_hash: u32,               // 0x68CD7942 +0x090 kind=1 (114 unique)
    pub delay_frame: i32,                  // 0x6A62D65E +0x094 kind=2 [0,1000]
    pub gravity_rate: f32,                 // 0x74F469FA +0x098 kind=5 [0,0.15]
    pub speed_scale: f32,                  // 0x7696F452 +0x09C kind=5 [0,2.0]
    pub effective_range: f32,              // 0x7B4AA25E +0x0A0 kind=5 [0,200]
    pub bullet_shape: u32,                 // 0x81A816EB +0x0A4 kind=1 {0..3}
    pub model_scale: f32,                  // 0x8379D9F8 +0x0A8 kind=5 [0,8]
    pub max_distance: f32,                 // 0x846DDC39 +0x0AC kind=5 [0,3000]
    pub bullet_resource_hash: u32,         // 0x89BE0F56 +0x0B0 kind=1 (381 unique)
    pub blast_radius: f32,                 // 0x8ACF95D3 +0x0B4 kind=5 [0,150]
    pub offset_angle_vertical: f32,        // 0x8DA251CA +0x0B8 kind=5 [-20,80]
    pub homing_strength: f32,              // 0x8DBD5433 +0x0BC kind=5 [0,1]
    pub turn_rate: f32,                    // 0x90423264 +0x0C0 kind=5 [0,20]
    pub homing_angle: f32,                 // 0x9375A247 +0x0C4 kind=5 [0,180]
    pub offset_angle_horizontal: f32,      // 0x9C9D876E +0x0C8 kind=5 [-20,110]
    pub is_beam: u32,                      // 0xA12E3B5F +0x0CC kind=1 {0,1}
    pub target_distance: f32,              // 0xA25B8B11 +0x0D0 kind=5 [-56,250]
    pub behavior_type: u32,                // 0xA36593AD +0x0D4 kind=1 (8 unique)
    pub aim_correction_angle: f32,         // 0xA5364F08 +0x0D8 kind=5 [-60,90]
    pub ammo_type_hash: u32,               // 0xA8987774 +0x0DC kind=1 (16 unique)
    pub initial_speed: f32,                // 0xAB606D9E +0x0E0 kind=5 [0,640]
    pub launch_angle_horizontal: f32,      // 0xABEDC73A +0x0E4 kind=5 [-90,120]
    pub tracking_angle: f32,               // 0xAF2B7098 +0x0E8 kind=5 [0,180]
    pub min_homing_distance: f32,          // 0xB306BEE8 +0x0EC kind=5 [0,200]
    pub turn_acceleration: f32,            // 0xBA9B8F5D +0x0F0 kind=5 [0,15]
    pub reserved_f4: f32,                  // 0xD188329F +0x0F4 kind=5 always 0
    pub hitgroup_hash: u32,                // 0xD32D39ED +0x0F8 kind=1 (181 unique)
    pub spawn_pattern_hash: u32,           // 0xD462A33B +0x0FC kind=1 (14 unique)
    pub aim_limit_angle: f32,              // 0xD55CBB87 +0x100 kind=5 [-120,140]
    pub is_penetrating: u32,               // 0xD6290BC9 +0x104 kind=1 {0,1}
    pub secondary_effect_hash: u32,        // 0xD8F283FB +0x108 kind=1 (123 unique)
    pub homing_effective_distance: f32,    // 0xDCEAF7AC +0x10C kind=5 [0,820]
    pub reserved_flag_110: u32,            // 0xDE6C0636 +0x110 kind=1 always same
    pub explosion_effect_hash: u32,        // 0xDF9F47E2 +0x114 kind=1 (13 unique)
    pub interaction_hash: u32,             // 0xEDD1C108 +0x118 kind=1 (158 unique)
    pub speed_acceleration: f32,           // 0xEF44FC6B +0x11C kind=5 [-1,5]
    pub duration_frame: i32,               // 0xF33F8630 +0x120 kind=2 [0,600]
    pub reserved_124: f32,                 // 0xF47EE96E +0x124 kind=5 always 0
    pub sound_effect_hash: u32,            // 0xF647567F +0x128 kind=1 (9 unique)
    pub muzzle_offset_horizontal: f32,     // 0xFAA5615C +0x12C kind=5 [-70,70]
    pub muzzle_offset_vertical: f32,       // 0xFD032D27 +0x130 kind=5 [-25,35]
    pub induction_angle: f32,              // 0xFD855759 +0x134 kind=5 [0,90]
    pub spread_distance: f32,              // 0xFDC8A545 +0x138 kind=5 [0,120]
    pub tracking_start_distance: f32,      // 0xFF51E424 +0x13C kind=5 [0,100]
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

pub fn parse_bulletparam_entry(entry_id: u32, data: &[u8]) -> Result<BulletParamEntry, String> {
    if data.len() < BULLETPARAM_ENTRY_SIZE as usize {
        return Err(format!("BulletParamEntry entry too small: {} < {}", data.len(), BULLETPARAM_ENTRY_SIZE));
    }
    Ok(BulletParamEntry {
        entry_id,
        initial_angle: read_f32(data, 0x00),
        max_range: read_f32(data, 0x04),
        move_type: read_u32(data, 0x08),
        hit_effect_hash: read_u32(data, 0x0C),
        spread_angle: read_f32(data, 0x10),
        hitbox_width: read_f32(data, 0x14),
        hitbox_height: read_f32(data, 0x18),
        hitbox_depth: read_f32(data, 0x1C),
        aim_offset_vertical: read_f32(data, 0x20),
        homing_range: read_f32(data, 0x24),
        visual_scale: read_f32(data, 0x28),
        hit_effect_scale: read_f32(data, 0x2C),
        spawn_offset_forward: read_f32(data, 0x30),
        inherit_speed_flag: read_u32(data, 0x34),
        lifetime: read_i32(data, 0x38),
        child_bullet_hash: read_u32(data, 0x3C),
        collision_type: read_u32(data, 0x40),
        rotation_angle: read_f32(data, 0x44),
        elevation_angle: read_f32(data, 0x48),
        homing_type: read_u32(data, 0x4C),
        bullet_effect_hash: read_u32(data, 0x50),
        trail_effect_hash: read_u32(data, 0x54),
        muzzle_flash_hash: read_u32(data, 0x58),
        target_height_offset: read_f32(data, 0x5C),
        pierce_count: read_i32(data, 0x60),
        acceleration_value: read_f32(data, 0x64),
        bullet_action_hash: read_u32(data, 0x68),
        homing_start_distance: read_f32(data, 0x6C),
        vertical_launch_angle: read_f32(data, 0x70),
        horizontal_aim_angle: read_f32(data, 0x74),
        hit_interval_frame: read_i32(data, 0x78),
        max_altitude: read_f32(data, 0x7C),
        spawn_offset_vertical: read_f32(data, 0x80),
        speed_internal: read_i32(data, 0x84),
        collision_height: read_f32(data, 0x88),
        homing_duration: read_i32(data, 0x8C),
        on_expire_hash: read_u32(data, 0x90),
        delay_frame: read_i32(data, 0x94),
        gravity_rate: read_f32(data, 0x98),
        speed_scale: read_f32(data, 0x9C),
        effective_range: read_f32(data, 0xA0),
        bullet_shape: read_u32(data, 0xA4),
        model_scale: read_f32(data, 0xA8),
        max_distance: read_f32(data, 0xAC),
        bullet_resource_hash: read_u32(data, 0xB0),
        blast_radius: read_f32(data, 0xB4),
        offset_angle_vertical: read_f32(data, 0xB8),
        homing_strength: read_f32(data, 0xBC),
        turn_rate: read_f32(data, 0xC0),
        homing_angle: read_f32(data, 0xC4),
        offset_angle_horizontal: read_f32(data, 0xC8),
        is_beam: read_u32(data, 0xCC),
        target_distance: read_f32(data, 0xD0),
        behavior_type: read_u32(data, 0xD4),
        aim_correction_angle: read_f32(data, 0xD8),
        ammo_type_hash: read_u32(data, 0xDC),
        initial_speed: read_f32(data, 0xE0),
        launch_angle_horizontal: read_f32(data, 0xE4),
        tracking_angle: read_f32(data, 0xE8),
        min_homing_distance: read_f32(data, 0xEC),
        turn_acceleration: read_f32(data, 0xF0),
        reserved_f4: read_f32(data, 0xF4),
        hitgroup_hash: read_u32(data, 0xF8),
        spawn_pattern_hash: read_u32(data, 0xFC),
        aim_limit_angle: read_f32(data, 0x100),
        is_penetrating: read_u32(data, 0x104),
        secondary_effect_hash: read_u32(data, 0x108),
        homing_effective_distance: read_f32(data, 0x10C),
        reserved_flag_110: read_u32(data, 0x110),
        explosion_effect_hash: read_u32(data, 0x114),
        interaction_hash: read_u32(data, 0x118),
        speed_acceleration: read_f32(data, 0x11C),
        duration_frame: read_i32(data, 0x120),
        reserved_124: read_f32(data, 0x124),
        sound_effect_hash: read_u32(data, 0x128),
        muzzle_offset_horizontal: read_f32(data, 0x12C),
        muzzle_offset_vertical: read_f32(data, 0x130),
        induction_angle: read_f32(data, 0x134),
        spread_distance: read_f32(data, 0x138),
        tracking_start_distance: read_f32(data, 0x13C),
    })
}

pub fn write_bulletparam_entry(entry: &BulletParamEntry, buf: &mut [u8]) {
    write_f32(buf, 0x00, entry.initial_angle);
    write_f32(buf, 0x04, entry.max_range);
    write_u32(buf, 0x08, entry.move_type);
    write_u32(buf, 0x0C, entry.hit_effect_hash);
    write_f32(buf, 0x10, entry.spread_angle);
    write_f32(buf, 0x14, entry.hitbox_width);
    write_f32(buf, 0x18, entry.hitbox_height);
    write_f32(buf, 0x1C, entry.hitbox_depth);
    write_f32(buf, 0x20, entry.aim_offset_vertical);
    write_f32(buf, 0x24, entry.homing_range);
    write_f32(buf, 0x28, entry.visual_scale);
    write_f32(buf, 0x2C, entry.hit_effect_scale);
    write_f32(buf, 0x30, entry.spawn_offset_forward);
    write_u32(buf, 0x34, entry.inherit_speed_flag);
    write_i32(buf, 0x38, entry.lifetime);
    write_u32(buf, 0x3C, entry.child_bullet_hash);
    write_u32(buf, 0x40, entry.collision_type);
    write_f32(buf, 0x44, entry.rotation_angle);
    write_f32(buf, 0x48, entry.elevation_angle);
    write_u32(buf, 0x4C, entry.homing_type);
    write_u32(buf, 0x50, entry.bullet_effect_hash);
    write_u32(buf, 0x54, entry.trail_effect_hash);
    write_u32(buf, 0x58, entry.muzzle_flash_hash);
    write_f32(buf, 0x5C, entry.target_height_offset);
    write_i32(buf, 0x60, entry.pierce_count);
    write_f32(buf, 0x64, entry.acceleration_value);
    write_u32(buf, 0x68, entry.bullet_action_hash);
    write_f32(buf, 0x6C, entry.homing_start_distance);
    write_f32(buf, 0x70, entry.vertical_launch_angle);
    write_f32(buf, 0x74, entry.horizontal_aim_angle);
    write_i32(buf, 0x78, entry.hit_interval_frame);
    write_f32(buf, 0x7C, entry.max_altitude);
    write_f32(buf, 0x80, entry.spawn_offset_vertical);
    write_i32(buf, 0x84, entry.speed_internal);
    write_f32(buf, 0x88, entry.collision_height);
    write_i32(buf, 0x8C, entry.homing_duration);
    write_u32(buf, 0x90, entry.on_expire_hash);
    write_i32(buf, 0x94, entry.delay_frame);
    write_f32(buf, 0x98, entry.gravity_rate);
    write_f32(buf, 0x9C, entry.speed_scale);
    write_f32(buf, 0xA0, entry.effective_range);
    write_u32(buf, 0xA4, entry.bullet_shape);
    write_f32(buf, 0xA8, entry.model_scale);
    write_f32(buf, 0xAC, entry.max_distance);
    write_u32(buf, 0xB0, entry.bullet_resource_hash);
    write_f32(buf, 0xB4, entry.blast_radius);
    write_f32(buf, 0xB8, entry.offset_angle_vertical);
    write_f32(buf, 0xBC, entry.homing_strength);
    write_f32(buf, 0xC0, entry.turn_rate);
    write_f32(buf, 0xC4, entry.homing_angle);
    write_f32(buf, 0xC8, entry.offset_angle_horizontal);
    write_u32(buf, 0xCC, entry.is_beam);
    write_f32(buf, 0xD0, entry.target_distance);
    write_u32(buf, 0xD4, entry.behavior_type);
    write_f32(buf, 0xD8, entry.aim_correction_angle);
    write_u32(buf, 0xDC, entry.ammo_type_hash);
    write_f32(buf, 0xE0, entry.initial_speed);
    write_f32(buf, 0xE4, entry.launch_angle_horizontal);
    write_f32(buf, 0xE8, entry.tracking_angle);
    write_f32(buf, 0xEC, entry.min_homing_distance);
    write_f32(buf, 0xF0, entry.turn_acceleration);
    write_f32(buf, 0xF4, entry.reserved_f4);
    write_u32(buf, 0xF8, entry.hitgroup_hash);
    write_u32(buf, 0xFC, entry.spawn_pattern_hash);
    write_f32(buf, 0x100, entry.aim_limit_angle);
    write_u32(buf, 0x104, entry.is_penetrating);
    write_u32(buf, 0x108, entry.secondary_effect_hash);
    write_f32(buf, 0x10C, entry.homing_effective_distance);
    write_u32(buf, 0x110, entry.reserved_flag_110);
    write_u32(buf, 0x114, entry.explosion_effect_hash);
    write_u32(buf, 0x118, entry.interaction_hash);
    write_f32(buf, 0x11C, entry.speed_acceleration);
    write_i32(buf, 0x120, entry.duration_frame);
    write_f32(buf, 0x124, entry.reserved_124);
    write_u32(buf, 0x128, entry.sound_effect_hash);
    write_f32(buf, 0x12C, entry.muzzle_offset_horizontal);
    write_f32(buf, 0x130, entry.muzzle_offset_vertical);
    write_f32(buf, 0x134, entry.induction_angle);
    write_f32(buf, 0x138, entry.spread_distance);
    write_f32(buf, 0x13C, entry.tracking_start_distance);
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
