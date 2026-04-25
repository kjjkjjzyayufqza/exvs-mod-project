use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};

use crate::format::typed_param::{
    build_typed_param_binary, parse_typed_param_binary, ParamEntryWithId, TypedParamBundle,
};

pub const PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE: u32 = 60;
pub const PROJECTILE_DEPICTION_TABLE_CMD_COUNT: u32 = 15;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct ProjectileDepictionTableEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub depiction_type: u32, // 0x049A712B +0x000 kind=1 CEfxProjectileDepiction* class selector
    pub main_effect_hash: u32, // 0x057E839D +0x004 kind=1 main visual effect resource
    pub sub_effect_hash: u32, // 0x08B05EA9 +0x008 kind=1 secondary/sub visual effect
    pub scale: f32,          // 0x1B12E734 +0x00C kind=5 projectile visual scale
    pub model_hash: u32,     // 0x49672094 +0x010 kind=1 3D model hash (shared with vernier_table)
    pub trail_effect_hash: u32, // 0x5896D450 +0x014 kind=1 trail/streak effect
    pub hit_effect_hash: u32, // 0x5EF964EC +0x018 kind=1 on-hit visual effect
    pub trail_length: f32,   // 0x8F49B2DA +0x01C kind=5 trail rendering length
    pub sound_effect_hash: u32, // 0x996BA1AC +0x020 kind=1 sound/SE resource
    pub render_mode: u32,    // 0xBA4BBA9D +0x024 kind=1 rendering mode enum
    pub material_hash: u32,  // 0xC19F85EA +0x028 kind=1 material/shader override
    pub z_offset: f32,       // 0xD1097B21 +0x02C kind=5 Z-axis spawn offset
    pub spawn_effect_hash: u32, // 0xD9EF5A79 +0x030 kind=1 spawn/muzzle flash effect
    pub behavior_flags: i32, // 0xDABB1A5C +0x034 kind=2 depiction behavior flags
    pub destroy_effect_hash: u32, // 0xE9DE0A15 +0x038 kind=1 destruction/expire effect
}

pub const PROJECTILE_DEPICTION_TABLE_FIELD_HASHES: [(u32, u32, u32); 15] = [
    (0x049A712B, 0x000, 1),
    (0x057E839D, 0x004, 1),
    (0x08B05EA9, 0x008, 1),
    (0x1B12E734, 0x00C, 5),
    (0x49672094, 0x010, 1),
    (0x5896D450, 0x014, 1),
    (0x5EF964EC, 0x018, 1),
    (0x8F49B2DA, 0x01C, 5),
    (0x996BA1AC, 0x020, 1),
    (0xBA4BBA9D, 0x024, 1),
    (0xC19F85EA, 0x028, 1),
    (0xD1097B21, 0x02C, 5),
    (0xD9EF5A79, 0x030, 1),
    (0xDABB1A5C, 0x034, 2),
    (0xE9DE0A15, 0x038, 1),
];

impl ParamEntryWithId for ProjectileDepictionTableEntry {
    fn set_row_id(&mut self, id: u32) {
        self.entry_id = id;
    }
    fn get_row_id(&self) -> u32 {
        self.entry_id
    }
}

pub type ProjectileDepictionTableData = TypedParamBundle<ProjectileDepictionTableEntry>;

pub fn parse_projectile_depiction_table(
    data: &[u8],
) -> Result<ProjectileDepictionTableData, String> {
    parse_typed_param_binary(
        data,
        PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE,
        PROJECTILE_DEPICTION_TABLE_CMD_COUNT,
    )
}

pub fn build_projectile_depiction_table(
    b: &ProjectileDepictionTableData,
) -> Result<Vec<u8>, String> {
    build_typed_param_binary(b)
}
