use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};

pub const HITGROUPIDDEF_ENTRY_SIZE: u32 = 60;
pub const HITGROUPIDDEF_CMD_COUNT: u32 = 15;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct HitGroupIdDefEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub hit_type: u32,          // 0x11E501D5 +0x000 kind=1 collision shape type (0=sphere)
    pub offset_x: f32,          // 0x3284A82D +0x004 kind=5 sphere center offset X
    pub offset_y: f32,          // 0x42EE5CA2 +0x008 kind=5 sphere center offset Y
    pub offset_z: f32,          // 0x458398BB +0x00C kind=5 sphere center offset Z
    pub radius: f32,            // 0x6514C413 +0x010 kind=5 sphere radius [9..15]
    pub enable_state: u32,      // 0x7395D184 +0x014 kind=1 enable state flag
    pub scale_x: f32,           // 0x8B1AA53F +0x018 kind=5 scale X
    pub scale_y: f32,           // 0xACE03D8E +0x01C kind=5 scale Y
    pub bone_hash: u32,         // 0xC3656A99 +0x020 kind=1 attached bone name hash
    pub is_enabled: u32,        // 0xD32D39ED +0x024 kind=1 enable flag (shared hash)
    pub scale_z: f32,           // 0xDBE70D18 +0x028 kind=5 scale Z
    pub group_id: f32,          // 0xDC8AC901 +0x02C kind=5 collision group ID [6..7]
    pub model_hash: u32,        // 0xEDD1C108 +0x030 kind=1 model/resource hash (shared hash)
    pub collision_flags: u32,   // 0xF89A41E1 +0x034 kind=1 collision behavior flags
    pub joint_offset: f32,      // 0xFC1D95A9 +0x038 kind=5 joint offset value [-1..3]
}

pub const HITGROUPIDDEF_FIELD_HASHES: [(u32, u32, u32); 15] = [
    (0x11E501D5, 0x000, 1), (0x3284A82D, 0x004, 5), (0x42EE5CA2, 0x008, 5),
    (0x458398BB, 0x00C, 5), (0x6514C413, 0x010, 5), (0x7395D184, 0x014, 1),
    (0x8B1AA53F, 0x018, 5), (0xACE03D8E, 0x01C, 5), (0xC3656A99, 0x020, 1),
    (0xD32D39ED, 0x024, 1), (0xDBE70D18, 0x028, 5), (0xDC8AC901, 0x02C, 5),
    (0xEDD1C108, 0x030, 1), (0xF89A41E1, 0x034, 1), (0xFC1D95A9, 0x038, 5),
];
