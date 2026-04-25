use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};

pub const VERNIER_TABLE_ENTRY_SIZE: u32 = 144;
pub const VERNIER_TABLE_CMD_COUNT: u32 = 36;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct VernierTableEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub effect_type: u32,             // 0x01311D05 +0x000 kind=1 IDA:flag_idx=0x0F
    pub color_index: u32,             // 0x0887512E +0x004 kind=1 IDA:flag_idx=0x0B
    pub effect_model_hash: u32,       // 0x0FDBD536 +0x008 kind=1 IDA:core_field[3]
    pub keep_active: u32,             // 0x0FEA9537 +0x00C kind=1 IDA:flag_idx=0x07 {0,1}
    pub particle_size_1: f32,         // 0x13EEB8F0 +0x010 kind=5 IDA:core_field[6]
    pub is_loop: u32,                 // 0x21FFCD00 +0x014 kind=1 IDA:flag_idx=0x04 {0,1}
    pub is_follow_bone: u32,          // 0x2DB526FD +0x018 kind=1 IDA:flag_idx=0x03 {0,1}
    pub bone_offset_type: u32,        // 0x35B5281F +0x01C kind=1 IDA:flag_idx=0x19
    pub rotation_type: u32,           // 0x3B6EA02D +0x020 kind=1 IDA:flag_idx=0x11
    pub alignment_type: u32,          // 0x3C036434 +0x024 kind=1 IDA:flag_idx=0x15
    pub blend_mode: u32,              // 0x42B21889 +0x028 kind=1 IDA:flag_idx=0x18
    pub particle_size_2: f32,         // 0x43298ECB +0x02C kind=5 IDA:core_field[4]
    pub model_hash: u32,              // 0x49672094 +0x030 kind=1 IDA:core_field[2] shared
    pub texture_hash: u32,            // 0x4B0454A2 +0x034 kind=1 IDA:flag_idx=0x14
    pub animation_hash: u32,          // 0x4C6990BB +0x038 kind=1 IDA:flag_idx=0x10
    pub material_hash: u32,           // 0x618D354C +0x03C kind=1 IDA:flag_idx=0x06
    pub is_billboard: u32,            // 0x634CF0E5 +0x040 kind=1 IDA:flag_idx=0x02 {0,1}
    pub z_distance: f32,              // 0x64E98866 +0x044 kind=5 IDA:core_field[7] optional
    pub fade_type: u32,               // 0x6744C378 +0x048 kind=1 IDA:flag_idx=0x1A
    pub is_world_space: u32,          // 0x72E23F39 +0x04C kind=1 IDA:flag_idx=0x00 {0,1}
    pub cull_mode: u32,               // 0x76362D93 +0x050 kind=1 IDA:flag_idx=0x0E
    pub depth_test_type: u32,         // 0x7F8061B8 +0x054 kind=1 IDA:flag_idx=0x0A
    pub emit_count: u32,              // 0x918E0094 +0x058 kind=1 IDA:flag_idx=0x0C
    pub lifetime_type: u32,           // 0x96E3C48D +0x05C kind=1 IDA:flag_idx=0x08
    pub velocity_type: u32,           // 0xA267F197 +0x060 kind=1 IDA:flag_idx=0x12
    pub inherit_parent_type: u32,     // 0xA50A358E +0x064 kind=1 IDA:flag_idx=0x16
    pub render_order: u32,            // 0xB8F69CBA +0x068 kind=1 IDA:flag_idx=0x05 {0,1}
    pub sort_bias: u32,               // 0xD20D0518 +0x06C kind=1 IDA:flag_idx=0x17
    pub bone_hash: u32,               // 0xD32D39ED +0x070 kind=1 IDA:core_field[1] shared
    pub second_bone_hash: u32,        // 0xD560C101 +0x074 kind=1 IDA:flag_idx=0x13
    pub effect_flag_a: u32,           // 0xE1E4F41B +0x078 kind=1 IDA:flag_idx=0x09
    pub effect_flag_b: u32,           // 0xE6893002 +0x07C kind=1 IDA:flag_idx=0x0D
    pub effect_scale: f32,            // 0xE694B5B6 +0x080 kind=5 IDA:core_field[5]
    pub hitgroup_ref: u32,            // 0xEDD1C108 +0x084 kind=1 IDA:core_field[0] shared; binary-searched first
    pub is_enabled: u32,              // 0xFA45A15F +0x088 kind=1 IDA:flag_idx=0x01 {0,1}
    pub spawn_offset_y: f32,          // 0xFDE0D9DC +0x08C kind=5 IDA:core_field[8] optional
}

pub const VERNIER_TABLE_FIELD_HASHES: [(u32, u32, u32); 36] = [
    (0x01311D05, 0x000, 1), (0x0887512E, 0x004, 1), (0x0FDBD536, 0x008, 1),
    (0x0FEA9537, 0x00C, 1), (0x13EEB8F0, 0x010, 5), (0x21FFCD00, 0x014, 1),
    (0x2DB526FD, 0x018, 1), (0x35B5281F, 0x01C, 1), (0x3B6EA02D, 0x020, 1),
    (0x3C036434, 0x024, 1), (0x42B21889, 0x028, 1), (0x43298ECB, 0x02C, 5),
    (0x49672094, 0x030, 1), (0x4B0454A2, 0x034, 1), (0x4C6990BB, 0x038, 1),
    (0x618D354C, 0x03C, 1), (0x634CF0E5, 0x040, 1), (0x64E98866, 0x044, 5),
    (0x6744C378, 0x048, 1), (0x72E23F39, 0x04C, 1), (0x76362D93, 0x050, 1),
    (0x7F8061B8, 0x054, 1), (0x918E0094, 0x058, 1), (0x96E3C48D, 0x05C, 1),
    (0xA267F197, 0x060, 1), (0xA50A358E, 0x064, 1), (0xB8F69CBA, 0x068, 1),
    (0xD20D0518, 0x06C, 1), (0xD32D39ED, 0x070, 1), (0xD560C101, 0x074, 1),
    (0xE1E4F41B, 0x078, 1), (0xE6893002, 0x07C, 1), (0xE694B5B6, 0x080, 5),
    (0xEDD1C108, 0x084, 1), (0xFA45A15F, 0x088, 1), (0xFDE0D9DC, 0x08C, 5),
];
