use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};

pub const SPEEDPARAM_ENTRY_SIZE: u32 = 304;
pub const SPEEDPARAM_CMD_COUNT: u32 = 74;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct SpeedParamEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub walk_speed_forward: i32,             // 0x06D1922D +0x000 kind=2 [0,100]
    pub walk_speed_base: i32,                // 0x086B475D +0x004 kind=2 [40,60]
    pub walk_speed_backward: i32,            // 0x0B6480D5 +0x008 kind=2 [50,100]
    pub boost_gauge_capacity: i32,           // 0x0B9EBECE +0x00C kind=2 [0,500]
    pub boost_recovery_delay_frame: i32,     // 0x0CF37AD7 +0x010 kind=2 [0,320]
    pub boost_recovery_speed: i32,           // 0x0D5BB2EF +0x014 kind=2 [198,303]
    pub ground_run_speed: i32,               // 0x0E682BA8 +0x018 kind=2 [100,180]
    pub boost_dash_initial_speed: i32,       // 0x11FFDDB4 +0x01C kind=2 [60,220]
    pub step_distance: i32,                  // 0x17A9D82D +0x020 kind=2 [4,31]
    pub jump_initial_velocity: i32,          // 0x18895A55 +0x024 kind=2 [0,93]
    pub gravity_modifier: i32,               // 0x29AA8A04 +0x028 kind=2 always -2
    pub movement_class: i32,                 // 0x2C76D0A7 +0x02C kind=2 always 7
    pub air_dash_startup_frame: i32,         // 0x2D28CC4B +0x030 kind=2 [0,200]
    pub step_startup_frame: i32,             // 0x2DF7AF95 +0x034 kind=2 [20,25]
    pub boost_dash_sustained_speed: i32,     // 0x2EAE942B +0x038 kind=2 [220,312]
    pub dash_cancel_type: i32,               // 0x32FD1EDC +0x03C kind=2 [1,10]
    pub fall_gravity: i32,                   // 0x37D1D056 +0x040 kind=2 [-20,-10]
    pub max_ground_speed: i32,               // 0x3BF9E21E +0x044 kind=2 always 100
    pub boost_dash_startup_frame: i32,       // 0x4031CB84 +0x048 kind=2 OB-only
    pub boost_dash_recovery_frame: i32,      // 0x41DABEC5 +0x04C kind=2 OB-only
    pub landing_recovery_frame: i32,         // 0x459455EA +0x050 kind=2 [0,300]
    pub air_brake_speed: i32,                // 0x4D4B65EA +0x054 kind=2 [0,30]
    pub step_speed: i32,                     // 0x4D601E55 +0x058 kind=2 [25,35]
    pub step_recovery_frame: i32,            // 0x4F705BAD +0x05C kind=2 [20,30]
    pub boost_dash_distance: i32,            // 0x5481CCF4 +0x060 kind=2 [140,330]
    pub air_dash_end_speed: i32,             // 0x56C51E87 +0x064 kind=2 [92,98]
    pub step_type: i32,                      // 0x58313EF7 +0x068 kind=2 [3,8]
    pub air_dash_duration_frame: i32,        // 0x5E8CAF43 +0x06C kind=2 [0,500]
    pub boost_dash_type: i32,                // 0x5EF705B7 +0x070 kind=2 [6,9]
    pub air_speed_base: i32,                 // 0x607C25BC +0x074 kind=2 [130,310]
    pub fall_speed: i32,                     // 0x6C640897 +0x078 kind=2 [-10,-2]
    pub guard_move_speed: i32,               // 0x6F6F1BF6 +0x07C kind=2 [0,40]
    pub air_dash_distance: i32,              // 0x7242066A +0x080 kind=2 [0,240]
    pub air_speed_max: i32,                  // 0x737D64F4 +0x084 kind=2 [50,70]
    pub speed_decay_base: i32,               // 0x77749DD2 +0x088 kind=2 always 92
    pub air_steer_limit: i32,                // 0x7BF44A41 +0x08C kind=2 [0,30]
    pub rotation_speed: i32,                 // 0x7C2572A1 +0x090 kind=2 [12,80]
    pub gauge_recovery_rate: i32,            // 0x7C3CF4DD +0x094 kind=2 OB-only
    pub boost_consumption_base: i32,         // 0x7CD3A712 +0x098 kind=2 [50,60]
    pub boost_dash_max_speed: i32,           // 0x7D79F6FA +0x09C kind=2 [280,380]
    pub turning_speed: i32,                  // 0x7E5878A3 +0x0A0 kind=2 [20,80]
    pub jump_type: i32,                      // 0x8173DA19 +0x0A4 kind=2 [3,4]
    pub fall_type: i32,                      // 0x84043A2D +0x0A8 kind=2 [3,6]
    pub aerial_correction: i32,              // 0x8D0A9843 +0x0AC kind=2 OB-only
    pub air_efficiency: i32,                 // 0x8EDC8D6E +0x0B0 kind=2 [85,99]
    pub air_gravity: i32,                    // 0x9297EF74 +0x0B4 kind=2 [-5,0]
    pub air_dash_max_distance: i32,          // 0x95FA2B6D +0x0B8 kind=2 [0,350]
    pub step_cancel_frame: i32,              // 0x97BE8DFC +0x0BC kind=2 [10,12]
    pub guard_recovery_frame: i32,           // 0x9A378388 +0x0C0 kind=2 [0,60]
    pub vertical_move_speed: i32,            // 0x9EAA4E96 +0x0C4 kind=2 [20,80]
    pub boost_startup_frame: i32,            // 0x9FD06227 +0x0C8 kind=2 [0,35]
    pub boost_dash_duration_frame: i32,      // 0xA49287B9 +0x0CC kind=2 [240,588]
    pub dash_end_speed: i32,                 // 0xA55D6C5E +0x0D0 kind=2 [90,95]
    pub fixed_step_distance: i32,            // 0xA7CBBC07 +0x0D4 kind=2 always 35
    pub air_boost_efficiency: i32,           // 0xB20B67C9 +0x0D8 kind=2 [50,100]
    pub guard_speed_rate: i32,               // 0xBC0127E1 +0x0DC kind=2 [70,80]
    pub air_dash_speed: i32,                 // 0xC6157381 +0x0E0 kind=2 [200,360]
    pub fall_speed_rate: i32,                // 0xC6BBC347 +0x0E4 kind=2 [12,16]
    pub air_dash_type: i32,                  // 0xCD5DF17C +0x0E8 kind=2 [6,16]
    pub guard_step_type: i32,                // 0xCF452D59 +0x0EC kind=2 [4,14]
    pub dash_range: i32,                     // 0xD68023A4 +0x0F0 kind=2 [15,51]
    pub speed_decay_rate: i32,               // 0xDD7720EB +0x0F4 kind=2 always 92
    pub boost_consumption_type: i32,         // 0xDE1EF15A +0x0F8 kind=2 [2,5]
    pub air_deceleration: i32,               // 0xE2FD1BFB +0x0FC kind=2 [-5,0]
    pub boost_dash_count: i32,               // 0xE590DFE2 +0x100 kind=2 [0,8]
    pub action_label_offset: u32,            // 0xE6213731 +0x104 kind=7
    pub action_label_size: u32,
    pub turn_rate: i32,                      // 0xEC580BCC +0x10C kind=2 [15,25]
    pub air_steer_speed: i32,                // 0xF3B9AD85 +0x110 kind=2 [0,40]
    pub resource_label_offset: u32,          // 0xF3C4CAE9 +0x114 kind=7
    pub resource_label_size: u32,
    pub boost_efficiency_air: i32,           // 0xF44C9D4E +0x11C kind=2 [59,92]
    pub boost_extension_rate: i32,           // 0xF559DCF1 +0x120 kind=2 OB-only
    pub boost_cap_rate: i32,                 // 0xF8B9B46E +0x124 kind=2 [0,95]
    pub boost_dash_distance_max: i32,        // 0xFEC6069F +0x128 kind=2 [40,145]
    pub gravity_air_modifier: i32,           // 0xFF7A9C8B +0x12C kind=2 [-10,17]
}

pub const SPEEDPARAM_FIELD_HASHES: [(u32, u32, u32); 74] = [
    (0x06D1922D, 0x000, 2),
    (0x086B475D, 0x004, 2),
    (0x0B6480D5, 0x008, 2),
    (0x0B9EBECE, 0x00C, 2),
    (0x0CF37AD7, 0x010, 2),
    (0x0D5BB2EF, 0x014, 2),
    (0x0E682BA8, 0x018, 2),
    (0x11FFDDB4, 0x01C, 2),
    (0x17A9D82D, 0x020, 2),
    (0x18895A55, 0x024, 2),
    (0x29AA8A04, 0x028, 2),
    (0x2C76D0A7, 0x02C, 2),
    (0x2D28CC4B, 0x030, 2),
    (0x2DF7AF95, 0x034, 2),
    (0x2EAE942B, 0x038, 2),
    (0x32FD1EDC, 0x03C, 2),
    (0x37D1D056, 0x040, 2),
    (0x3BF9E21E, 0x044, 2),
    (0x4031CB84, 0x048, 2),
    (0x41DABEC5, 0x04C, 2),
    (0x459455EA, 0x050, 2),
    (0x4D4B65EA, 0x054, 2),
    (0x4D601E55, 0x058, 2),
    (0x4F705BAD, 0x05C, 2),
    (0x5481CCF4, 0x060, 2),
    (0x56C51E87, 0x064, 2),
    (0x58313EF7, 0x068, 2),
    (0x5E8CAF43, 0x06C, 2),
    (0x5EF705B7, 0x070, 2),
    (0x607C25BC, 0x074, 2),
    (0x6C640897, 0x078, 2),
    (0x6F6F1BF6, 0x07C, 2),
    (0x7242066A, 0x080, 2),
    (0x737D64F4, 0x084, 2),
    (0x77749DD2, 0x088, 2),
    (0x7BF44A41, 0x08C, 2),
    (0x7C2572A1, 0x090, 2),
    (0x7C3CF4DD, 0x094, 2),
    (0x7CD3A712, 0x098, 2),
    (0x7D79F6FA, 0x09C, 2),
    (0x7E5878A3, 0x0A0, 2),
    (0x8173DA19, 0x0A4, 2),
    (0x84043A2D, 0x0A8, 2),
    (0x8D0A9843, 0x0AC, 2),
    (0x8EDC8D6E, 0x0B0, 2),
    (0x9297EF74, 0x0B4, 2),
    (0x95FA2B6D, 0x0B8, 2),
    (0x97BE8DFC, 0x0BC, 2),
    (0x9A378388, 0x0C0, 2),
    (0x9EAA4E96, 0x0C4, 2),
    (0x9FD06227, 0x0C8, 2),
    (0xA49287B9, 0x0CC, 2),
    (0xA55D6C5E, 0x0D0, 2),
    (0xA7CBBC07, 0x0D4, 2),
    (0xB20B67C9, 0x0D8, 2),
    (0xBC0127E1, 0x0DC, 2),
    (0xC6157381, 0x0E0, 2),
    (0xC6BBC347, 0x0E4, 2),
    (0xCD5DF17C, 0x0E8, 2),
    (0xCF452D59, 0x0EC, 2),
    (0xD68023A4, 0x0F0, 2),
    (0xDD7720EB, 0x0F4, 2),
    (0xDE1EF15A, 0x0F8, 2),
    (0xE2FD1BFB, 0x0FC, 2),
    (0xE590DFE2, 0x100, 2),
    (0xE6213731, 0x104, 7),
    (0xEC580BCC, 0x10C, 2),
    (0xF3B9AD85, 0x110, 2),
    (0xF3C4CAE9, 0x114, 7),
    (0xF44C9D4E, 0x11C, 2),
    (0xF559DCF1, 0x120, 2),
    (0xF8B9B46E, 0x124, 2),
    (0xFEC6069F, 0x128, 2),
    (0xFF7A9C8B, 0x12C, 2),
];
