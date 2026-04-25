use serde::{Deserialize, Serialize};

pub const PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE: u32 = 60;
pub const PROJECTILE_DEPICTION_TABLE_CMD_COUNT: u32 = 15;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectileDepictionTableEntry {
    pub entry_id: u32,
    pub depiction_type: u32,          // 0x049A712B +0x000 kind=1 CEfxProjectileDepiction* class selector
    pub main_effect_hash: u32,        // 0x057E839D +0x004 kind=1 main visual effect resource
    pub sub_effect_hash: u32,         // 0x08B05EA9 +0x008 kind=1 secondary/sub visual effect
    pub scale: f32,                   // 0x1B12E734 +0x00C kind=5 projectile visual scale
    pub model_hash: u32,              // 0x49672094 +0x010 kind=1 3D model hash (shared with vernier_table)
    pub trail_effect_hash: u32,       // 0x5896D450 +0x014 kind=1 trail/streak effect
    pub hit_effect_hash: u32,         // 0x5EF964EC +0x018 kind=1 on-hit visual effect
    pub trail_length: f32,            // 0x8F49B2DA +0x01C kind=5 trail rendering length
    pub sound_effect_hash: u32,       // 0x996BA1AC +0x020 kind=1 sound/SE resource
    pub render_mode: u32,             // 0xBA4BBA9D +0x024 kind=1 rendering mode enum
    pub material_hash: u32,           // 0xC19F85EA +0x028 kind=1 material/shader override
    pub z_offset: f32,                // 0xD1097B21 +0x02C kind=5 Z-axis spawn offset
    pub spawn_effect_hash: u32,       // 0xD9EF5A79 +0x030 kind=1 spawn/muzzle flash effect
    pub behavior_flags: i32,          // 0xDABB1A5C +0x034 kind=2 depiction behavior flags
    pub destroy_effect_hash: u32,     // 0xE9DE0A15 +0x038 kind=1 destruction/expire effect
}

pub const PROJECTILE_DEPICTION_TABLE_FIELD_HASHES: [(u32, u32, u32); 15] = [
    (0x049A712B, 0x000, 1), (0x057E839D, 0x004, 1), (0x08B05EA9, 0x008, 1),
    (0x1B12E734, 0x00C, 5), (0x49672094, 0x010, 1), (0x5896D450, 0x014, 1),
    (0x5EF964EC, 0x018, 1), (0x8F49B2DA, 0x01C, 5), (0x996BA1AC, 0x020, 1),
    (0xBA4BBA9D, 0x024, 1), (0xC19F85EA, 0x028, 1), (0xD1097B21, 0x02C, 5),
    (0xD9EF5A79, 0x030, 1), (0xDABB1A5C, 0x034, 2), (0xE9DE0A15, 0x038, 1),
];

pub fn parse_projectile_depiction_table_entry(entry_id: u32, data: &[u8]) -> Result<ProjectileDepictionTableEntry, String> {
    if data.len() < PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE as usize {
        return Err(format!("ProjectileDepictionTable entry too small: {} < {}", data.len(), PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE));
    }
    Ok(ProjectileDepictionTableEntry {
        entry_id,
        depiction_type: read_u32(data, 0x00),
        main_effect_hash: read_u32(data, 0x04),
        sub_effect_hash: read_u32(data, 0x08),
        scale: read_f32(data, 0x0C),
        model_hash: read_u32(data, 0x10),
        trail_effect_hash: read_u32(data, 0x14),
        hit_effect_hash: read_u32(data, 0x18),
        trail_length: read_f32(data, 0x1C),
        sound_effect_hash: read_u32(data, 0x20),
        render_mode: read_u32(data, 0x24),
        material_hash: read_u32(data, 0x28),
        z_offset: read_f32(data, 0x2C),
        spawn_effect_hash: read_u32(data, 0x30),
        behavior_flags: read_i32(data, 0x34),
        destroy_effect_hash: read_u32(data, 0x38),
    })
}

pub fn write_projectile_depiction_table_entry(entry: &ProjectileDepictionTableEntry, buf: &mut [u8]) {
    write_u32(buf, 0x00, entry.depiction_type);
    write_u32(buf, 0x04, entry.main_effect_hash);
    write_u32(buf, 0x08, entry.sub_effect_hash);
    write_f32(buf, 0x0C, entry.scale);
    write_u32(buf, 0x10, entry.model_hash);
    write_u32(buf, 0x14, entry.trail_effect_hash);
    write_u32(buf, 0x18, entry.hit_effect_hash);
    write_f32(buf, 0x1C, entry.trail_length);
    write_u32(buf, 0x20, entry.sound_effect_hash);
    write_u32(buf, 0x24, entry.render_mode);
    write_u32(buf, 0x28, entry.material_hash);
    write_f32(buf, 0x2C, entry.z_offset);
    write_u32(buf, 0x30, entry.spawn_effect_hash);
    write_i32(buf, 0x34, entry.behavior_flags);
    write_u32(buf, 0x38, entry.destroy_effect_hash);
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
