use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};

pub const GRAPPARAM_ENTRY_SIZE: u32 = 64;
pub const GRAPPARAM_CMD_COUNT: u32 = 16;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct GrapParamEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub down_value: i32,           // 0x17A9E2E1 +0x000 range=[-6,60]
    pub charge_frame: i32,         // 0x2272E3D6 +0x004 range=[0,300] usually 0
    pub grap_total_frame: i32,     // 0x35857659 +0x008 range=[0,400]
    pub stun_value: i32,           // 0x465D80C6 +0x00C range=[0,80]
    pub grap_priority: i32,        // 0x534643A2 +0x010 range=[0,60] often=10
    pub startup_frame: i32,        // 0x550BCFAD +0x014 range=[0,350]
    pub tracking_frame: i32,       // 0x55B8FC51 +0x018 range=[0,300]
    pub damage: i32,               // 0x6906F0F4 +0x01C range=[0,600]
    pub correction_pct: i32,       // 0x7755981E +0x020 range=[0,100] often=98
    pub reach: i32,                // 0x83E900CD +0x024 range=[0,40]
    pub cancel_frame: i32,         // 0x976F9803 +0x028 range=[0,40]
    pub recovery_frame: i32,       // 0x99D42DBB +0x02C range=[0,60]
    pub is_multi_hit: i32,         // 0xA89F3A61 +0x030 range=[0,1]
    pub damage_2nd: i32,           // 0xB084851E +0x034 range=[0,550]
    pub damage_last: i32,          // 0xBEC81A41 +0x038 range=[0,550]
    pub down_value_last: i32,      // 0xC21ED1D8 +0x03C range=[0,100]
}

pub const GRAPPARAM_FIELD_HASHES: [(u32, u32, u32); 16] = [
    (0x17A9E2E1, 0x000, 2),
    (0x2272E3D6, 0x004, 2),
    (0x35857659, 0x008, 2),
    (0x465D80C6, 0x00C, 2),
    (0x534643A2, 0x010, 2),
    (0x550BCFAD, 0x014, 2),
    (0x55B8FC51, 0x018, 2),
    (0x6906F0F4, 0x01C, 2),
    (0x7755981E, 0x020, 2),
    (0x83E900CD, 0x024, 2),
    (0x976F9803, 0x028, 2),
    (0x99D42DBB, 0x02C, 2),
    (0xA89F3A61, 0x030, 2),
    (0xB084851E, 0x034, 2),
    (0xBEC81A41, 0x038, 2),
    (0xC21ED1D8, 0x03C, 2),
];
