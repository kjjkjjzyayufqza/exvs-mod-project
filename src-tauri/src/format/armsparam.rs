use serde::{Deserialize, Serialize};

pub const ARMSPARAM_ENTRY_SIZE: u32 = 200;
pub const ARMSPARAM_CMD_COUNT: u32 = 48;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArmsParamEntry {
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

pub fn parse_armsparam_entry(entry_id: u32, data: &[u8]) -> Result<ArmsParamEntry, String> {
    if data.len() < ARMSPARAM_ENTRY_SIZE as usize {
        return Err(format!("ArmsParam entry too small: {} < {}", data.len(), ARMSPARAM_ENTRY_SIZE));
    }
    Ok(ArmsParamEntry {
        entry_id,
        is_enabled: read_u32(data, 0x000),
        unk_04_reserved: read_u32(data, 0x004),
        is_continuous_fire: read_u32(data, 0x008),
        reload_start_frame: read_i32(data, 0x00C),
        reload_time_total: read_i32(data, 0x010),
        reload_type: read_u32(data, 0x014),
        is_charge_weapon: read_u32(data, 0x018),
        can_move_while_firing: read_u32(data, 0x01C),
        homing_angle: read_i32(data, 0x020),
        induction_rate: read_f32(data, 0x024),
        homing_start_rate: read_f32(data, 0x028),
        homing_end_rate: read_f32(data, 0x02C),
        ammo_count: read_i32(data, 0x030),
        damage_correction_rate: read_f32(data, 0x034),
        down_correction_rate: read_f32(data, 0x038),
        shot_type: read_i32(data, 0x03C),
        damage: read_i32(data, 0x040),
        stun_correction_rate: read_f32(data, 0x044),
        down_value: read_i32(data, 0x048),
        cancel_route_type: read_u32(data, 0x04C),
        is_vernier: read_u32(data, 0x050),
        cooldown_frame: read_i32(data, 0x054),
        startup_frame: read_i32(data, 0x058),
        active_frame: read_i32(data, 0x05C),
        recovery_frame: read_i32(data, 0x060),
        total_duration_frame: read_i32(data, 0x064),
        landing_recovery_frame: read_i32(data, 0x068),
        stun_value: read_i32(data, 0x06C),
        boost_consumption_rate: read_f32(data, 0x070),
        range: read_i32(data, 0x074),
        muzzle_correction_rate: read_f32(data, 0x078),
        reload_per_shot_frame: read_i32(data, 0x07C),
        reload_lock_frame: read_i32(data, 0x080),
        overheat_frame: read_i32(data, 0x084),
        charge_frame: read_i32(data, 0x088),
        guard_break_type: read_u32(data, 0x08C),
        landing_behavior_type: read_u32(data, 0x090),
        is_super_armor: read_u32(data, 0x094),
        bullet_type: read_u32(data, 0x098),
        tracking_speed_rate: read_f32(data, 0x09C),
        bullet_speed_rate: read_f32(data, 0x0A0),
        action_label_offset: read_u32(data, 0x0A4),
        action_label_size: read_u32(data, 0x0A8),
        ammo_reload_wait_frame: read_i32(data, 0x0AC),
        hit_effect_type: read_u32(data, 0x0B0),
        resource_label_offset: read_u32(data, 0x0B4),
        resource_label_size: read_u32(data, 0x0B8),
        bullet_count_per_shot: read_i32(data, 0x0BC),
        firing_interval_frame: read_i32(data, 0x0C0),
        full_charge_frame: read_i32(data, 0x0C4),
    })
}

pub fn write_armsparam_entry(entry: &ArmsParamEntry, buf: &mut [u8]) {
    write_u32(buf, 0x000, entry.is_enabled);
    write_u32(buf, 0x004, entry.unk_04_reserved);
    write_u32(buf, 0x008, entry.is_continuous_fire);
    write_i32(buf, 0x00C, entry.reload_start_frame);
    write_i32(buf, 0x010, entry.reload_time_total);
    write_u32(buf, 0x014, entry.reload_type);
    write_u32(buf, 0x018, entry.is_charge_weapon);
    write_u32(buf, 0x01C, entry.can_move_while_firing);
    write_i32(buf, 0x020, entry.homing_angle);
    write_f32(buf, 0x024, entry.induction_rate);
    write_f32(buf, 0x028, entry.homing_start_rate);
    write_f32(buf, 0x02C, entry.homing_end_rate);
    write_i32(buf, 0x030, entry.ammo_count);
    write_f32(buf, 0x034, entry.damage_correction_rate);
    write_f32(buf, 0x038, entry.down_correction_rate);
    write_i32(buf, 0x03C, entry.shot_type);
    write_i32(buf, 0x040, entry.damage);
    write_f32(buf, 0x044, entry.stun_correction_rate);
    write_i32(buf, 0x048, entry.down_value);
    write_u32(buf, 0x04C, entry.cancel_route_type);
    write_u32(buf, 0x050, entry.is_vernier);
    write_i32(buf, 0x054, entry.cooldown_frame);
    write_i32(buf, 0x058, entry.startup_frame);
    write_i32(buf, 0x05C, entry.active_frame);
    write_i32(buf, 0x060, entry.recovery_frame);
    write_i32(buf, 0x064, entry.total_duration_frame);
    write_i32(buf, 0x068, entry.landing_recovery_frame);
    write_i32(buf, 0x06C, entry.stun_value);
    write_f32(buf, 0x070, entry.boost_consumption_rate);
    write_i32(buf, 0x074, entry.range);
    write_f32(buf, 0x078, entry.muzzle_correction_rate);
    write_i32(buf, 0x07C, entry.reload_per_shot_frame);
    write_i32(buf, 0x080, entry.reload_lock_frame);
    write_i32(buf, 0x084, entry.overheat_frame);
    write_i32(buf, 0x088, entry.charge_frame);
    write_u32(buf, 0x08C, entry.guard_break_type);
    write_u32(buf, 0x090, entry.landing_behavior_type);
    write_u32(buf, 0x094, entry.is_super_armor);
    write_u32(buf, 0x098, entry.bullet_type);
    write_f32(buf, 0x09C, entry.tracking_speed_rate);
    write_f32(buf, 0x0A0, entry.bullet_speed_rate);
    write_u32(buf, 0x0A4, entry.action_label_offset);
    write_u32(buf, 0x0A8, entry.action_label_size);
    write_i32(buf, 0x0AC, entry.ammo_reload_wait_frame);
    write_u32(buf, 0x0B0, entry.hit_effect_type);
    write_u32(buf, 0x0B4, entry.resource_label_offset);
    write_u32(buf, 0x0B8, entry.resource_label_size);
    write_i32(buf, 0x0BC, entry.bullet_count_per_shot);
    write_i32(buf, 0x0C0, entry.firing_interval_frame);
    write_i32(buf, 0x0C4, entry.full_charge_frame);
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
