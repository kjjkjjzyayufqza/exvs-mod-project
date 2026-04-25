use serde::{Deserialize, Serialize};

pub const EFFECT_PROJECT_ENTRY_SIZE: u32 = 960;
pub const EFFECT_PROJECT_CMD_COUNT: u32 = 240;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectProjectEntry {
    pub entry_id: u32,
    pub field_00_param: f32,
    pub field_04_flag: u32,
    pub field_08_param: f32,
    pub field_0c_param: f32,
    pub field_10_param: f32,
    pub field_14_param: f32,
    pub field_18_param: f32,
    pub field_1c_param: f32,
    pub field_20_flag: u32,
    pub field_24_param: f32,
    pub field_28_flag: u32,
    pub field_2c_param: f32,
    pub field_30_param: f32,
    pub field_34_flag: u32,
    pub field_38_param: f32,
    pub field_3c_param: f32,
    pub field_40_flag: u32,
    pub field_44_param: f32,
    pub field_48_param: f32,
    pub field_4c_param: f32,
    pub field_50_param: f32,
    pub field_54_flag: u32,
    pub field_58_flag: u32,
    pub field_5c_param: f32,
    pub field_60_flag: u32,
    pub field_64_param: f32,
    pub field_68_param: f32,
    pub field_6c_param: f32,
    pub field_70_flag: u32,
    pub field_74_param: f32,
    pub field_78_flag: u32,
    pub field_7c_param: f32,
    pub field_80_flag: u32,
    pub field_84_param: f32,
    pub field_88_param: f32,
    pub field_8c_param: f32,
    pub field_90_param: f32,
    pub field_94_flag: u32,
    pub field_98_param: f32,
    pub field_9c_param: f32,
    pub field_a0_param: f32,
    pub field_a4_param: f32,
    pub field_a8_param: f32,
    pub field_ac_param: f32,
    pub field_b0_param: f32,
    pub field_b4_flag: u32,
    pub field_b8_param: f32,
    pub field_bc_flag: u32,
    pub field_c0_param: f32,
    pub field_c4_param: f32,
    pub field_c8_flag: u32,
    pub field_cc_param: f32,
    pub field_d0_param: f32,
    pub field_d4_flag: u32,
    pub field_d8_param: f32,
    pub field_dc_flag: u32,
    pub field_e0_param: f32,
    pub field_e4_flag: u32,
    pub field_e8_param: f32,
    pub field_ec_param: f32,
    pub field_f0_param: f32,
    pub field_f4_param: f32,
    pub field_f8_param: f32,
    pub field_fc_param: f32,
    pub field_100_param: f32,
    pub field_104_param: f32,
    pub field_108_param: f32,
    pub field_10c_flag: u32,
    pub field_110_param: f32,
    pub field_114_param: f32,
    pub field_118_flag: u32,
    pub field_11c_param: f32,
    pub field_120_flag: u32,
    pub field_124_param: f32,
    pub field_128_param: f32,
    pub field_12c_flag: u32,
    pub field_130_param: f32,
    pub field_134_flag: u32,
    pub field_138_param: f32,
    pub field_13c_flag: u32,
    pub field_140_param: f32,
    pub field_144_param: f32,
    pub field_148_flag: u32,
    pub field_14c_param: f32,
    pub field_150_flag: u32,
    pub field_154_param: f32,
    pub field_158_param: f32,
    pub field_15c_param: f32,
    pub field_160_flag: u32,
    pub field_164_param: f32,
    pub field_168_flag: u32,
    pub field_16c_param: f32,
    pub field_170_param: f32,
    pub field_174_flag: u32,
    pub field_178_param: f32,
    pub field_17c_param: f32,
    pub field_180_flag: u32,
    pub field_184_param: f32,
    pub field_188_param: f32,
    pub field_18c_flag: u32,
    pub field_190_flag: u32,
    pub field_194_flag: u32,
    pub field_198_param: f32,
    pub field_19c_param: f32,
    pub field_1a0_param: f32,
    pub field_1a4_param: f32,
    pub field_1a8_param: f32,
    pub field_1ac_param: f32,
    pub field_1b0_param: f32,
    pub field_1b4_flag: u32,
    pub field_1b8_param: f32,
    pub field_1bc_param: f32,
    pub field_1c0_param: f32,
    pub field_1c4_flag: u32,
    pub field_1c8_param: f32,
    pub field_1cc_param: f32,
    pub field_1d0_param: f32,
    pub field_1d4_flag: u32,
    pub field_1d8_param: f32,
    pub field_1dc_param: f32,
    pub field_1e0_param: f32,
    pub field_1e4_param: f32,
    pub field_1e8_flag: u32,
    pub field_1ec_param: f32,
    pub field_1f0_param: f32,
    pub field_1f4_param: f32,
    pub field_1f8_flag: u32,
    pub field_1fc_param: f32,
    pub field_200_flag: u32,
    pub field_204_param: f32,
    pub field_208_flag: u32,
    pub field_20c_param: f32,
    pub field_210_flag: u32,
    pub field_214_param: f32,
    pub field_218_flag: u32,
    pub field_21c_param: f32,
    pub field_220_param: f32,
    pub field_224_flag: u32,
    pub field_228_param: f32,
    pub field_22c_flag: u32,
    pub field_230_param: f32,
    pub field_234_param: f32,
    pub field_238_param: f32,
    pub field_23c_param: f32,
    pub field_240_param: f32,
    pub field_244_param: f32,
    pub field_248_flag: u32,
    pub field_24c_param: f32,
    pub field_250_param: f32,
    pub field_254_param: f32,
    pub field_258_flag: u32,
    pub field_25c_param: f32,
    pub field_260_param: f32,
    pub field_264_param: f32,
    pub field_268_param: f32,
    pub field_26c_flag: u32,
    pub field_270_param: f32,
    pub field_274_param: f32,
    pub field_278_flag: u32,
    pub field_27c_param: f32,
    pub field_280_param: f32,
    pub field_284_flag: u32,
    pub field_288_param: f32,
    pub field_28c_param: f32,
    pub field_290_param: f32,
    pub field_294_flag: u32,
    pub field_298_param: f32,
    pub field_29c_param: f32,
    pub field_2a0_param: f32,
    pub field_2a4_flag: u32,
    pub field_2a8_param: f32,
    pub field_2ac_flag: u32,
    pub field_2b0_flag: u32,
    pub field_2b4_param: f32,
    pub field_2b8_param: f32,
    pub field_2bc_flag: u32,
    pub field_2c0_flag: u32,
    pub field_2c4_param: f32,
    pub field_2c8_param: f32,
    pub field_2cc_param: f32,
    pub field_2d0_param: f32,
    pub field_2d4_flag: u32,
    pub field_2d8_flag: u32,
    pub field_2dc_param: f32,
    pub field_2e0_flag: u32,
    pub field_2e4_param: f32,
    pub field_2e8_flag: u32,
    pub field_2ec_param: f32,
    pub field_2f0_param: f32,
    pub field_2f4_flag: u32,
    pub field_2f8_param: f32,
    pub field_2fc_param: f32,
    pub field_300_param: f32,
    pub field_304_flag: u32,
    pub field_308_param: f32,
    pub field_30c_param: f32,
    pub field_310_param: f32,
    pub field_314_param: f32,
    pub field_318_param: f32,
    pub field_31c_flag: u32,
    pub field_320_param: f32,
    pub field_324_flag: u32,
    pub field_328_param: f32,
    pub field_32c_param: f32,
    pub field_330_flag: u32,
    pub field_334_param: f32,
    pub field_338_param: f32,
    pub field_33c_param: f32,
    pub field_340_param: f32,
    pub field_344_param: f32,
    pub field_348_param: f32,
    pub field_34c_param: f32,
    pub field_350_param: f32,
    pub field_354_param: f32,
    pub field_358_flag: u32,
    pub field_35c_param: f32,
    pub field_360_param: f32,
    pub field_364_flag: u32,
    pub field_368_param: f32,
    pub field_36c_param: f32,
    pub field_370_flag: u32,
    pub field_374_param: f32,
    pub field_378_flag: u32,
    pub field_37c_param: f32,
    pub field_380_param: f32,
    pub field_384_param: f32,
    pub field_388_param: f32,
    pub field_38c_param: f32,
    pub field_390_param: f32,
    pub field_394_param: f32,
    pub field_398_param: f32,
    pub field_39c_param: f32,
    pub field_3a0_flag: u32,
    pub field_3a4_flag: u32,
    pub field_3a8_param: f32,
    pub field_3ac_flag: u32,
    pub field_3b0_param: f32,
    pub field_3b4_flag: u32,
    pub field_3b8_param: f32,
    pub field_3bc_param: f32,
}

pub const EFFECT_PROJECT_FIELD_HASHES: [(u32, u32, u32); 240] = [
    (0x08592D05, 0x000, 5), (0x0859BF71, 0x004, 1), (0x0A215564, 0x008, 5),
    (0x0D4C917D, 0x00C, 5), (0x0F34E91C, 0x010, 5), (0x101A124D, 0x014, 5),
    (0x11C6760B, 0x018, 5), (0x125CAC14, 0x01C, 5), (0x12E5377C, 0x020, 1),
    (0x133A6425, 0x024, 5), (0x138E23E7, 0x028, 1), (0x139EC623, 0x02C, 5),
    (0x1457A03C, 0x030, 5), (0x14E3E7FE, 0x034, 1), (0x14F3023A, 0x038, 5),
    (0x1531680D, 0x03C, 5), (0x1588F365, 0x040, 1), (0x1777D654, 0x044, 5),
    (0x18703A20, 0x048, 5), (0x19E548AE, 0x04C, 5), (0x1A619CC0, 0x050, 5),
    (0x1B537B57, 0x054, 1), (0x1B8325BD, 0x058, 1), (0x1BA3F6F7, 0x05C, 5),
    (0x1CEEE1A4, 0x060, 1), (0x1F1DFE39, 0x064, 5), (0x210C06A7, 0x068, 5),
    (0x23747EC6, 0x06C, 5), (0x2374ECB2, 0x070, 1), (0x23F01489, 0x074, 5),
    (0x241928AB, 0x078, 1), (0x2419BADF, 0x07C, 5), (0x2468E4EF, 0x080, 1),
    (0x2661C2BE, 0x084, 5), (0x2A4658A2, 0x088, 5), (0x2AC232ED, 0x08C, 5),
    (0x2D2B9CBB, 0x090, 5), (0x2DDEA8C4, 0x094, 1), (0x308EA534, 0x098, 5),
    (0x314CCF03, 0x09C, 5), (0x32C81B6D, 0x0A0, 5), (0x335D69E3, 0x0A4, 5),
    (0x3430ADFA, 0x0A8, 5), (0x35A5DF74, 0x0AC, 5), (0x36210B1A, 0x0B0, 5),
    (0x37C3B267, 0x0B4, 1), (0x37E3612D, 0x0B8, 5), (0x39C864BF, 0x0BC, 1),
    (0x3AEB25C8, 0x0C0, 5), (0x3B7A585F, 0x0C4, 5), (0x3BE82C58, 0x0C8, 1),
    (0x3C179C46, 0x0CC, 5), (0x3C5A8597, 0x0D0, 5), (0x3C85E841, 0x0D4, 1),
    (0x3E1C3BCE, 0x0D8, 5), (0x3EA5A0A6, 0x0DC, 1), (0x3FDE51F9, 0x0E0, 5),
    (0x40C482F1, 0x0E4, 1), (0x40E451BB, 0x0E8, 5), (0x41263B8C, 0x0EC, 5),
    (0x42A2EFE2, 0x0F0, 5), (0x445A5975, 0x0F4, 5), (0x45CF2BFB, 0x0F8, 5),
    (0x464BFF95, 0x0FC, 5), (0x478995A2, 0x100, 5), (0x48D9616F, 0x104, 5),
    (0x491B0B58, 0x108, 5), (0x49A29030, 0x10C, 1), (0x4B10ACD0, 0x110, 5),
    (0x4B5DB501, 0x114, 5), (0x4B82D8D7, 0x118, 1), (0x4C7D68C9, 0x11C, 5),
    (0x4CEF1CCE, 0x120, 1), (0x4DEC155E, 0x124, 5), (0x5166F228, 0x128, 5),
    (0x531E183D, 0x12C, 1), (0x531E8A49, 0x130, 5), (0x536FD479, 0x134, 1),
    (0x54734E50, 0x138, 5), (0x5473DC24, 0x13C, 1), (0x54F7241F, 0x140, 5),
    (0x560B3631, 0x144, 5), (0x5AD99852, 0x148, 1), (0x5D416834, 0x14C, 5),
    (0x5DB45C4B, 0x150, 1), (0x5DC5027B, 0x154, 5), (0x6070E6C2, 0x158, 5),
    (0x6236589B, 0x15C, 5), (0x628FC3F3, 0x160, 1), (0x635090AA, 0x164, 5),
    (0x63E4D768, 0x168, 1), (0x63F432AC, 0x16C, 5), (0x643D54B3, 0x170, 5),
    (0x64891371, 0x174, 1), (0x6499F6B5, 0x178, 5), (0x655B9C82, 0x17C, 5),
    (0x65E207EA, 0x180, 1), (0x66C1469D, 0x184, 5), (0x671D22DB, 0x188, 5),
    (0x6BE9D132, 0x18C, 1), (0x6C544BC1, 0x190, 1), (0x6C84152B, 0x194, 1),
    (0x6CA4C661, 0x198, 5), (0x6D66AC56, 0x19C, 5), (0x6EE27838, 0x1A0, 5),
    (0x6F770AB6, 0x1A4, 5), (0x7833D98A, 0x1A8, 5), (0x7A4BA1EB, 0x1AC, 5),
    (0x7D2665F2, 0x1B0, 5), (0x7F5E8FE7, 0x1B4, 1), (0x80A50FDC, 0x1B8, 5),
    (0x80EC1914, 0x1BC, 5), (0x81796B9A, 0x1C0, 5), (0x828A7407, 0x1C4, 1),
    (0x82AAA74D, 0x1C8, 5), (0x82E3B185, 0x1CC, 5), (0x8321DBB2, 0x1D0, 5),
    (0x83313E76, 0x1D4, 1), (0x8368CD7A, 0x1D8, 5), (0x84050963, 0x1DC, 5),
    (0x84E8BDAD, 0x1E0, 5), (0x85C76354, 0x1E4, 5), (0x85E7B01E, 0x1E8, 1),
    (0x8614AF83, 0x1EC, 5), (0x8781DD0D, 0x1F0, 5), (0x891343F7, 0x1F4, 5),
    (0x8A87725D, 0x1F8, 1), (0x8A979799, 0x1FC, 5), (0x8B3C382C, 0x200, 1),
    (0x8B55FDAE, 0x204, 5), (0x8BEC66C6, 0x208, 1), (0x8C3839B7, 0x20C, 5),
    (0x8C81A2DF, 0x210, 1), (0x8D5EF186, 0x214, 5), (0x8DEAB644, 0x218, 1),
    (0x8DFA5380, 0x21C, 5), (0x8E7E87EE, 0x220, 5), (0x9150EECB, 0x224, 1),
    (0x9445C0C7, 0x228, 5), (0x963D2AD2, 0x22C, 1), (0x963DB8A6, 0x230, 5),
    (0x9DF38CEC, 0x234, 5), (0xA078AE6D, 0x238, 5), (0xA1BAC45A, 0x23C, 5),
    (0xA23E1034, 0x240, 5), (0xA27309E5, 0x244, 5), (0xA2E17DE2, 0x248, 1),
    (0xA51AC2E5, 0x24C, 5), (0xA51ECDFC, 0x250, 5), (0xA553D42D, 0x254, 5),
    (0xA58CB9FB, 0x258, 1), (0xA69E168B, 0x25C, 5), (0xA6D70043, 0x260, 5),
    (0xA7156A74, 0x264, 5), (0xA75C7CBC, 0x268, 5), (0xA7ACF11C, 0x26C, 1),
    (0xA8459EB9, 0x270, 5), (0xA987F48E, 0x274, 5), (0xA9A727C4, 0x278, 1),
    (0xAA543859, 0x27C, 5), (0xABC14AD7, 0x280, 5), (0xAC3AF5D0, 0x284, 1),
    (0xACA881D7, 0x288, 5), (0xACAC8ECE, 0x28C, 5), (0xAD39FC40, 0x290, 5),
    (0xAECAE3DD, 0x294, 1), (0xAEEA3097, 0x298, 5), (0xAF285AA0, 0x29C, 5),
    (0xB34F0918, 0x2A0, 5), (0xB3BA3D67, 0x2A4, 1), (0xB422CD01, 0x2A8, 5),
    (0xB4A6353A, 0x2AC, 1), (0xB4D7F97E, 0x2B0, 1), (0xB6DEDF2F, 0x2B4, 5),
    (0xBA7D2F7C, 0x2B8, 5), (0xBA7DBD08, 0x2BC, 1), (0xBD107911, 0x2C0, 1),
    (0xBD10EB65, 0x2C4, 5), (0xBF689304, 0x2C8, 5), (0xC1D9EFB9, 0x2CC, 5),
    (0xC325FD97, 0x2D0, 5), (0xC3A105AC, 0x2D4, 1), (0xC3D0C9E8, 0x2D8, 1),
    (0xC448398E, 0x2DC, 5), (0xC4BD0DF1, 0x2E0, 1), (0xC86FA392, 0x2E4, 5),
    (0xCA174987, 0x2E8, 1), (0xCA17DBF3, 0x2EC, 5), (0xCD7A1FEA, 0x2F0, 5),
    (0xCD7A8D9E, 0x2F4, 1), (0xCF02678B, 0x2F8, 5), (0xD0125AE2, 0x2FC, 5),
    (0xD05B4C2A, 0x300, 5), (0xD0ABC18A, 0x304, 1), (0xD199261D, 0x308, 5),
    (0xD1D030D5, 0x30C, 5), (0xD219FD6A, 0x310, 5), (0xD21DF273, 0x314, 5),
    (0xD254E4BB, 0x318, 5), (0xD28B896D, 0x31C, 1), (0xD82F6A36, 0x320, 5),
    (0xD9CDD34B, 0x324, 1), (0xD9ED0001, 0x328, 5), (0xDA3ECCD6, 0x32C, 5),
    (0xDB3DC546, 0x330, 1), (0xDBABBE58, 0x334, 5), (0xDBAFB141, 0x338, 5),
    (0xDCC67A41, 0x33C, 5), (0xDD5308CF, 0x340, 5), (0xDE80C418, 0x344, 5),
    (0xDF42AE2F, 0x348, 5), (0xE13A8830, 0x34C, 5), (0xE342F051, 0x350, 5),
    (0xE42F3448, 0x354, 5), (0xE657DE5D, 0x358, 1), (0xEAF4BC7A, 0x35C, 5),
    (0xF1139F15, 0x360, 5), (0xF2E08088, 0x364, 1), (0xF3EF8D3B, 0x368, 5),
    (0xF426EB24, 0x36C, 5), (0xF4360EE0, 0x370, 1), (0xF46FFDEC, 0x374, 5),
    (0xF58D4491, 0x378, 1), (0xF5AD97DB, 0x37C, 5), (0xF5E48113, 0x380, 5),
    (0xF67E5B0C, 0x384, 5), (0xF7A23F4A, 0x388, 5), (0xF7EB2982, 0x38C, 5),
    (0xF979B778, 0x390, 5), (0xFA59C110, 0x394, 5), (0xFAFD6316, 0x398, 5),
    (0xFB3F0921, 0x39C, 5), (0xFB869249, 0x3A0, 1), (0xFC3B08BA, 0x3A4, 1),
    (0xFC52CD38, 0x3A8, 5), (0xFCEB5650, 0x3AC, 1), (0xFD340509, 0x3B0, 5),
    (0xFD8042CB, 0x3B4, 1), (0xFD90A70F, 0x3B8, 5), (0xFE147361, 0x3BC, 5),
];

pub fn parse_effect_project_entry(entry_id: u32, data: &[u8]) -> Result<EffectProjectEntry, String> {
    if data.len() < EFFECT_PROJECT_ENTRY_SIZE as usize {
        return Err(format!("EffectProject entry too small: {} < {}", data.len(), EFFECT_PROJECT_ENTRY_SIZE));
    }
    Ok(EffectProjectEntry {
        entry_id,
        field_00_param: rf32(data, 0x000), field_04_flag: ru32(data, 0x004),
        field_08_param: rf32(data, 0x008), field_0c_param: rf32(data, 0x00C),
        field_10_param: rf32(data, 0x010), field_14_param: rf32(data, 0x014),
        field_18_param: rf32(data, 0x018), field_1c_param: rf32(data, 0x01C),
        field_20_flag: ru32(data, 0x020), field_24_param: rf32(data, 0x024),
        field_28_flag: ru32(data, 0x028), field_2c_param: rf32(data, 0x02C),
        field_30_param: rf32(data, 0x030), field_34_flag: ru32(data, 0x034),
        field_38_param: rf32(data, 0x038), field_3c_param: rf32(data, 0x03C),
        field_40_flag: ru32(data, 0x040), field_44_param: rf32(data, 0x044),
        field_48_param: rf32(data, 0x048), field_4c_param: rf32(data, 0x04C),
        field_50_param: rf32(data, 0x050), field_54_flag: ru32(data, 0x054),
        field_58_flag: ru32(data, 0x058), field_5c_param: rf32(data, 0x05C),
        field_60_flag: ru32(data, 0x060), field_64_param: rf32(data, 0x064),
        field_68_param: rf32(data, 0x068), field_6c_param: rf32(data, 0x06C),
        field_70_flag: ru32(data, 0x070), field_74_param: rf32(data, 0x074),
        field_78_flag: ru32(data, 0x078), field_7c_param: rf32(data, 0x07C),
        field_80_flag: ru32(data, 0x080), field_84_param: rf32(data, 0x084),
        field_88_param: rf32(data, 0x088), field_8c_param: rf32(data, 0x08C),
        field_90_param: rf32(data, 0x090), field_94_flag: ru32(data, 0x094),
        field_98_param: rf32(data, 0x098), field_9c_param: rf32(data, 0x09C),
        field_a0_param: rf32(data, 0x0A0), field_a4_param: rf32(data, 0x0A4),
        field_a8_param: rf32(data, 0x0A8), field_ac_param: rf32(data, 0x0AC),
        field_b0_param: rf32(data, 0x0B0), field_b4_flag: ru32(data, 0x0B4),
        field_b8_param: rf32(data, 0x0B8), field_bc_flag: ru32(data, 0x0BC),
        field_c0_param: rf32(data, 0x0C0), field_c4_param: rf32(data, 0x0C4),
        field_c8_flag: ru32(data, 0x0C8), field_cc_param: rf32(data, 0x0CC),
        field_d0_param: rf32(data, 0x0D0), field_d4_flag: ru32(data, 0x0D4),
        field_d8_param: rf32(data, 0x0D8), field_dc_flag: ru32(data, 0x0DC),
        field_e0_param: rf32(data, 0x0E0), field_e4_flag: ru32(data, 0x0E4),
        field_e8_param: rf32(data, 0x0E8), field_ec_param: rf32(data, 0x0EC),
        field_f0_param: rf32(data, 0x0F0), field_f4_param: rf32(data, 0x0F4),
        field_f8_param: rf32(data, 0x0F8), field_fc_param: rf32(data, 0x0FC),
        field_100_param: rf32(data, 0x100), field_104_param: rf32(data, 0x104),
        field_108_param: rf32(data, 0x108), field_10c_flag: ru32(data, 0x10C),
        field_110_param: rf32(data, 0x110), field_114_param: rf32(data, 0x114),
        field_118_flag: ru32(data, 0x118), field_11c_param: rf32(data, 0x11C),
        field_120_flag: ru32(data, 0x120), field_124_param: rf32(data, 0x124),
        field_128_param: rf32(data, 0x128), field_12c_flag: ru32(data, 0x12C),
        field_130_param: rf32(data, 0x130), field_134_flag: ru32(data, 0x134),
        field_138_param: rf32(data, 0x138), field_13c_flag: ru32(data, 0x13C),
        field_140_param: rf32(data, 0x140), field_144_param: rf32(data, 0x144),
        field_148_flag: ru32(data, 0x148), field_14c_param: rf32(data, 0x14C),
        field_150_flag: ru32(data, 0x150), field_154_param: rf32(data, 0x154),
        field_158_param: rf32(data, 0x158), field_15c_param: rf32(data, 0x15C),
        field_160_flag: ru32(data, 0x160), field_164_param: rf32(data, 0x164),
        field_168_flag: ru32(data, 0x168), field_16c_param: rf32(data, 0x16C),
        field_170_param: rf32(data, 0x170), field_174_flag: ru32(data, 0x174),
        field_178_param: rf32(data, 0x178), field_17c_param: rf32(data, 0x17C),
        field_180_flag: ru32(data, 0x180), field_184_param: rf32(data, 0x184),
        field_188_param: rf32(data, 0x188), field_18c_flag: ru32(data, 0x18C),
        field_190_flag: ru32(data, 0x190), field_194_flag: ru32(data, 0x194),
        field_198_param: rf32(data, 0x198), field_19c_param: rf32(data, 0x19C),
        field_1a0_param: rf32(data, 0x1A0), field_1a4_param: rf32(data, 0x1A4),
        field_1a8_param: rf32(data, 0x1A8), field_1ac_param: rf32(data, 0x1AC),
        field_1b0_param: rf32(data, 0x1B0), field_1b4_flag: ru32(data, 0x1B4),
        field_1b8_param: rf32(data, 0x1B8), field_1bc_param: rf32(data, 0x1BC),
        field_1c0_param: rf32(data, 0x1C0), field_1c4_flag: ru32(data, 0x1C4),
        field_1c8_param: rf32(data, 0x1C8), field_1cc_param: rf32(data, 0x1CC),
        field_1d0_param: rf32(data, 0x1D0), field_1d4_flag: ru32(data, 0x1D4),
        field_1d8_param: rf32(data, 0x1D8), field_1dc_param: rf32(data, 0x1DC),
        field_1e0_param: rf32(data, 0x1E0), field_1e4_param: rf32(data, 0x1E4),
        field_1e8_flag: ru32(data, 0x1E8), field_1ec_param: rf32(data, 0x1EC),
        field_1f0_param: rf32(data, 0x1F0), field_1f4_param: rf32(data, 0x1F4),
        field_1f8_flag: ru32(data, 0x1F8), field_1fc_param: rf32(data, 0x1FC),
        field_200_flag: ru32(data, 0x200), field_204_param: rf32(data, 0x204),
        field_208_flag: ru32(data, 0x208), field_20c_param: rf32(data, 0x20C),
        field_210_flag: ru32(data, 0x210), field_214_param: rf32(data, 0x214),
        field_218_flag: ru32(data, 0x218), field_21c_param: rf32(data, 0x21C),
        field_220_param: rf32(data, 0x220), field_224_flag: ru32(data, 0x224),
        field_228_param: rf32(data, 0x228), field_22c_flag: ru32(data, 0x22C),
        field_230_param: rf32(data, 0x230), field_234_param: rf32(data, 0x234),
        field_238_param: rf32(data, 0x238), field_23c_param: rf32(data, 0x23C),
        field_240_param: rf32(data, 0x240), field_244_param: rf32(data, 0x244),
        field_248_flag: ru32(data, 0x248), field_24c_param: rf32(data, 0x24C),
        field_250_param: rf32(data, 0x250), field_254_param: rf32(data, 0x254),
        field_258_flag: ru32(data, 0x258), field_25c_param: rf32(data, 0x25C),
        field_260_param: rf32(data, 0x260), field_264_param: rf32(data, 0x264),
        field_268_param: rf32(data, 0x268), field_26c_flag: ru32(data, 0x26C),
        field_270_param: rf32(data, 0x270), field_274_param: rf32(data, 0x274),
        field_278_flag: ru32(data, 0x278), field_27c_param: rf32(data, 0x27C),
        field_280_param: rf32(data, 0x280), field_284_flag: ru32(data, 0x284),
        field_288_param: rf32(data, 0x288), field_28c_param: rf32(data, 0x28C),
        field_290_param: rf32(data, 0x290), field_294_flag: ru32(data, 0x294),
        field_298_param: rf32(data, 0x298), field_29c_param: rf32(data, 0x29C),
        field_2a0_param: rf32(data, 0x2A0), field_2a4_flag: ru32(data, 0x2A4),
        field_2a8_param: rf32(data, 0x2A8), field_2ac_flag: ru32(data, 0x2AC),
        field_2b0_flag: ru32(data, 0x2B0), field_2b4_param: rf32(data, 0x2B4),
        field_2b8_param: rf32(data, 0x2B8), field_2bc_flag: ru32(data, 0x2BC),
        field_2c0_flag: ru32(data, 0x2C0), field_2c4_param: rf32(data, 0x2C4),
        field_2c8_param: rf32(data, 0x2C8), field_2cc_param: rf32(data, 0x2CC),
        field_2d0_param: rf32(data, 0x2D0), field_2d4_flag: ru32(data, 0x2D4),
        field_2d8_flag: ru32(data, 0x2D8), field_2dc_param: rf32(data, 0x2DC),
        field_2e0_flag: ru32(data, 0x2E0), field_2e4_param: rf32(data, 0x2E4),
        field_2e8_flag: ru32(data, 0x2E8), field_2ec_param: rf32(data, 0x2EC),
        field_2f0_param: rf32(data, 0x2F0), field_2f4_flag: ru32(data, 0x2F4),
        field_2f8_param: rf32(data, 0x2F8), field_2fc_param: rf32(data, 0x2FC),
        field_300_param: rf32(data, 0x300), field_304_flag: ru32(data, 0x304),
        field_308_param: rf32(data, 0x308), field_30c_param: rf32(data, 0x30C),
        field_310_param: rf32(data, 0x310), field_314_param: rf32(data, 0x314),
        field_318_param: rf32(data, 0x318), field_31c_flag: ru32(data, 0x31C),
        field_320_param: rf32(data, 0x320), field_324_flag: ru32(data, 0x324),
        field_328_param: rf32(data, 0x328), field_32c_param: rf32(data, 0x32C),
        field_330_flag: ru32(data, 0x330), field_334_param: rf32(data, 0x334),
        field_338_param: rf32(data, 0x338), field_33c_param: rf32(data, 0x33C),
        field_340_param: rf32(data, 0x340), field_344_param: rf32(data, 0x344),
        field_348_param: rf32(data, 0x348), field_34c_param: rf32(data, 0x34C),
        field_350_param: rf32(data, 0x350), field_354_param: rf32(data, 0x354),
        field_358_flag: ru32(data, 0x358), field_35c_param: rf32(data, 0x35C),
        field_360_param: rf32(data, 0x360), field_364_flag: ru32(data, 0x364),
        field_368_param: rf32(data, 0x368), field_36c_param: rf32(data, 0x36C),
        field_370_flag: ru32(data, 0x370), field_374_param: rf32(data, 0x374),
        field_378_flag: ru32(data, 0x378), field_37c_param: rf32(data, 0x37C),
        field_380_param: rf32(data, 0x380), field_384_param: rf32(data, 0x384),
        field_388_param: rf32(data, 0x388), field_38c_param: rf32(data, 0x38C),
        field_390_param: rf32(data, 0x390), field_394_param: rf32(data, 0x394),
        field_398_param: rf32(data, 0x398), field_39c_param: rf32(data, 0x39C),
        field_3a0_flag: ru32(data, 0x3A0), field_3a4_flag: ru32(data, 0x3A4),
        field_3a8_param: rf32(data, 0x3A8), field_3ac_flag: ru32(data, 0x3AC),
        field_3b0_param: rf32(data, 0x3B0), field_3b4_flag: ru32(data, 0x3B4),
        field_3b8_param: rf32(data, 0x3B8), field_3bc_param: rf32(data, 0x3BC),
    })
}

pub fn write_effect_project_entry(entry: &EffectProjectEntry, buf: &mut [u8]) {
    wf32(buf, 0x000, entry.field_00_param); wu32(buf, 0x004, entry.field_04_flag);
    wf32(buf, 0x008, entry.field_08_param); wf32(buf, 0x00C, entry.field_0c_param);
    wf32(buf, 0x010, entry.field_10_param); wf32(buf, 0x014, entry.field_14_param);
    wf32(buf, 0x018, entry.field_18_param); wf32(buf, 0x01C, entry.field_1c_param);
    wu32(buf, 0x020, entry.field_20_flag); wf32(buf, 0x024, entry.field_24_param);
    wu32(buf, 0x028, entry.field_28_flag); wf32(buf, 0x02C, entry.field_2c_param);
    wf32(buf, 0x030, entry.field_30_param); wu32(buf, 0x034, entry.field_34_flag);
    wf32(buf, 0x038, entry.field_38_param); wf32(buf, 0x03C, entry.field_3c_param);
    wu32(buf, 0x040, entry.field_40_flag); wf32(buf, 0x044, entry.field_44_param);
    wf32(buf, 0x048, entry.field_48_param); wf32(buf, 0x04C, entry.field_4c_param);
    wf32(buf, 0x050, entry.field_50_param); wu32(buf, 0x054, entry.field_54_flag);
    wu32(buf, 0x058, entry.field_58_flag); wf32(buf, 0x05C, entry.field_5c_param);
    wu32(buf, 0x060, entry.field_60_flag); wf32(buf, 0x064, entry.field_64_param);
    wf32(buf, 0x068, entry.field_68_param); wf32(buf, 0x06C, entry.field_6c_param);
    wu32(buf, 0x070, entry.field_70_flag); wf32(buf, 0x074, entry.field_74_param);
    wu32(buf, 0x078, entry.field_78_flag); wf32(buf, 0x07C, entry.field_7c_param);
    wu32(buf, 0x080, entry.field_80_flag); wf32(buf, 0x084, entry.field_84_param);
    wf32(buf, 0x088, entry.field_88_param); wf32(buf, 0x08C, entry.field_8c_param);
    wf32(buf, 0x090, entry.field_90_param); wu32(buf, 0x094, entry.field_94_flag);
    wf32(buf, 0x098, entry.field_98_param); wf32(buf, 0x09C, entry.field_9c_param);
    wf32(buf, 0x0A0, entry.field_a0_param); wf32(buf, 0x0A4, entry.field_a4_param);
    wf32(buf, 0x0A8, entry.field_a8_param); wf32(buf, 0x0AC, entry.field_ac_param);
    wf32(buf, 0x0B0, entry.field_b0_param); wu32(buf, 0x0B4, entry.field_b4_flag);
    wf32(buf, 0x0B8, entry.field_b8_param); wu32(buf, 0x0BC, entry.field_bc_flag);
    wf32(buf, 0x0C0, entry.field_c0_param); wf32(buf, 0x0C4, entry.field_c4_param);
    wu32(buf, 0x0C8, entry.field_c8_flag); wf32(buf, 0x0CC, entry.field_cc_param);
    wf32(buf, 0x0D0, entry.field_d0_param); wu32(buf, 0x0D4, entry.field_d4_flag);
    wf32(buf, 0x0D8, entry.field_d8_param); wu32(buf, 0x0DC, entry.field_dc_flag);
    wf32(buf, 0x0E0, entry.field_e0_param); wu32(buf, 0x0E4, entry.field_e4_flag);
    wf32(buf, 0x0E8, entry.field_e8_param); wf32(buf, 0x0EC, entry.field_ec_param);
    wf32(buf, 0x0F0, entry.field_f0_param); wf32(buf, 0x0F4, entry.field_f4_param);
    wf32(buf, 0x0F8, entry.field_f8_param); wf32(buf, 0x0FC, entry.field_fc_param);
    wf32(buf, 0x100, entry.field_100_param); wf32(buf, 0x104, entry.field_104_param);
    wf32(buf, 0x108, entry.field_108_param); wu32(buf, 0x10C, entry.field_10c_flag);
    wf32(buf, 0x110, entry.field_110_param); wf32(buf, 0x114, entry.field_114_param);
    wu32(buf, 0x118, entry.field_118_flag); wf32(buf, 0x11C, entry.field_11c_param);
    wu32(buf, 0x120, entry.field_120_flag); wf32(buf, 0x124, entry.field_124_param);
    wf32(buf, 0x128, entry.field_128_param); wu32(buf, 0x12C, entry.field_12c_flag);
    wf32(buf, 0x130, entry.field_130_param); wu32(buf, 0x134, entry.field_134_flag);
    wf32(buf, 0x138, entry.field_138_param); wu32(buf, 0x13C, entry.field_13c_flag);
    wf32(buf, 0x140, entry.field_140_param); wf32(buf, 0x144, entry.field_144_param);
    wu32(buf, 0x148, entry.field_148_flag); wf32(buf, 0x14C, entry.field_14c_param);
    wu32(buf, 0x150, entry.field_150_flag); wf32(buf, 0x154, entry.field_154_param);
    wf32(buf, 0x158, entry.field_158_param); wf32(buf, 0x15C, entry.field_15c_param);
    wu32(buf, 0x160, entry.field_160_flag); wf32(buf, 0x164, entry.field_164_param);
    wu32(buf, 0x168, entry.field_168_flag); wf32(buf, 0x16C, entry.field_16c_param);
    wf32(buf, 0x170, entry.field_170_param); wu32(buf, 0x174, entry.field_174_flag);
    wf32(buf, 0x178, entry.field_178_param); wf32(buf, 0x17C, entry.field_17c_param);
    wu32(buf, 0x180, entry.field_180_flag); wf32(buf, 0x184, entry.field_184_param);
    wf32(buf, 0x188, entry.field_188_param); wu32(buf, 0x18C, entry.field_18c_flag);
    wu32(buf, 0x190, entry.field_190_flag); wu32(buf, 0x194, entry.field_194_flag);
    wf32(buf, 0x198, entry.field_198_param); wf32(buf, 0x19C, entry.field_19c_param);
    wf32(buf, 0x1A0, entry.field_1a0_param); wf32(buf, 0x1A4, entry.field_1a4_param);
    wf32(buf, 0x1A8, entry.field_1a8_param); wf32(buf, 0x1AC, entry.field_1ac_param);
    wf32(buf, 0x1B0, entry.field_1b0_param); wu32(buf, 0x1B4, entry.field_1b4_flag);
    wf32(buf, 0x1B8, entry.field_1b8_param); wf32(buf, 0x1BC, entry.field_1bc_param);
    wf32(buf, 0x1C0, entry.field_1c0_param); wu32(buf, 0x1C4, entry.field_1c4_flag);
    wf32(buf, 0x1C8, entry.field_1c8_param); wf32(buf, 0x1CC, entry.field_1cc_param);
    wf32(buf, 0x1D0, entry.field_1d0_param); wu32(buf, 0x1D4, entry.field_1d4_flag);
    wf32(buf, 0x1D8, entry.field_1d8_param); wf32(buf, 0x1DC, entry.field_1dc_param);
    wf32(buf, 0x1E0, entry.field_1e0_param); wf32(buf, 0x1E4, entry.field_1e4_param);
    wu32(buf, 0x1E8, entry.field_1e8_flag); wf32(buf, 0x1EC, entry.field_1ec_param);
    wf32(buf, 0x1F0, entry.field_1f0_param); wf32(buf, 0x1F4, entry.field_1f4_param);
    wu32(buf, 0x1F8, entry.field_1f8_flag); wf32(buf, 0x1FC, entry.field_1fc_param);
    wu32(buf, 0x200, entry.field_200_flag); wf32(buf, 0x204, entry.field_204_param);
    wu32(buf, 0x208, entry.field_208_flag); wf32(buf, 0x20C, entry.field_20c_param);
    wu32(buf, 0x210, entry.field_210_flag); wf32(buf, 0x214, entry.field_214_param);
    wu32(buf, 0x218, entry.field_218_flag); wf32(buf, 0x21C, entry.field_21c_param);
    wf32(buf, 0x220, entry.field_220_param); wu32(buf, 0x224, entry.field_224_flag);
    wf32(buf, 0x228, entry.field_228_param); wu32(buf, 0x22C, entry.field_22c_flag);
    wf32(buf, 0x230, entry.field_230_param); wf32(buf, 0x234, entry.field_234_param);
    wf32(buf, 0x238, entry.field_238_param); wf32(buf, 0x23C, entry.field_23c_param);
    wf32(buf, 0x240, entry.field_240_param); wf32(buf, 0x244, entry.field_244_param);
    wu32(buf, 0x248, entry.field_248_flag); wf32(buf, 0x24C, entry.field_24c_param);
    wf32(buf, 0x250, entry.field_250_param); wf32(buf, 0x254, entry.field_254_param);
    wu32(buf, 0x258, entry.field_258_flag); wf32(buf, 0x25C, entry.field_25c_param);
    wf32(buf, 0x260, entry.field_260_param); wf32(buf, 0x264, entry.field_264_param);
    wf32(buf, 0x268, entry.field_268_param); wu32(buf, 0x26C, entry.field_26c_flag);
    wf32(buf, 0x270, entry.field_270_param); wf32(buf, 0x274, entry.field_274_param);
    wu32(buf, 0x278, entry.field_278_flag); wf32(buf, 0x27C, entry.field_27c_param);
    wf32(buf, 0x280, entry.field_280_param); wu32(buf, 0x284, entry.field_284_flag);
    wf32(buf, 0x288, entry.field_288_param); wf32(buf, 0x28C, entry.field_28c_param);
    wf32(buf, 0x290, entry.field_290_param); wu32(buf, 0x294, entry.field_294_flag);
    wf32(buf, 0x298, entry.field_298_param); wf32(buf, 0x29C, entry.field_29c_param);
    wf32(buf, 0x2A0, entry.field_2a0_param); wu32(buf, 0x2A4, entry.field_2a4_flag);
    wf32(buf, 0x2A8, entry.field_2a8_param); wu32(buf, 0x2AC, entry.field_2ac_flag);
    wu32(buf, 0x2B0, entry.field_2b0_flag); wf32(buf, 0x2B4, entry.field_2b4_param);
    wf32(buf, 0x2B8, entry.field_2b8_param); wu32(buf, 0x2BC, entry.field_2bc_flag);
    wu32(buf, 0x2C0, entry.field_2c0_flag); wf32(buf, 0x2C4, entry.field_2c4_param);
    wf32(buf, 0x2C8, entry.field_2c8_param); wf32(buf, 0x2CC, entry.field_2cc_param);
    wf32(buf, 0x2D0, entry.field_2d0_param); wu32(buf, 0x2D4, entry.field_2d4_flag);
    wu32(buf, 0x2D8, entry.field_2d8_flag); wf32(buf, 0x2DC, entry.field_2dc_param);
    wu32(buf, 0x2E0, entry.field_2e0_flag); wf32(buf, 0x2E4, entry.field_2e4_param);
    wu32(buf, 0x2E8, entry.field_2e8_flag); wf32(buf, 0x2EC, entry.field_2ec_param);
    wf32(buf, 0x2F0, entry.field_2f0_param); wu32(buf, 0x2F4, entry.field_2f4_flag);
    wf32(buf, 0x2F8, entry.field_2f8_param); wf32(buf, 0x2FC, entry.field_2fc_param);
    wf32(buf, 0x300, entry.field_300_param); wu32(buf, 0x304, entry.field_304_flag);
    wf32(buf, 0x308, entry.field_308_param); wf32(buf, 0x30C, entry.field_30c_param);
    wf32(buf, 0x310, entry.field_310_param); wf32(buf, 0x314, entry.field_314_param);
    wf32(buf, 0x318, entry.field_318_param); wu32(buf, 0x31C, entry.field_31c_flag);
    wf32(buf, 0x320, entry.field_320_param); wu32(buf, 0x324, entry.field_324_flag);
    wf32(buf, 0x328, entry.field_328_param); wf32(buf, 0x32C, entry.field_32c_param);
    wu32(buf, 0x330, entry.field_330_flag); wf32(buf, 0x334, entry.field_334_param);
    wf32(buf, 0x338, entry.field_338_param); wf32(buf, 0x33C, entry.field_33c_param);
    wf32(buf, 0x340, entry.field_340_param); wf32(buf, 0x344, entry.field_344_param);
    wf32(buf, 0x348, entry.field_348_param); wf32(buf, 0x34C, entry.field_34c_param);
    wf32(buf, 0x350, entry.field_350_param); wf32(buf, 0x354, entry.field_354_param);
    wu32(buf, 0x358, entry.field_358_flag); wf32(buf, 0x35C, entry.field_35c_param);
    wf32(buf, 0x360, entry.field_360_param); wu32(buf, 0x364, entry.field_364_flag);
    wf32(buf, 0x368, entry.field_368_param); wf32(buf, 0x36C, entry.field_36c_param);
    wu32(buf, 0x370, entry.field_370_flag); wf32(buf, 0x374, entry.field_374_param);
    wu32(buf, 0x378, entry.field_378_flag); wf32(buf, 0x37C, entry.field_37c_param);
    wf32(buf, 0x380, entry.field_380_param); wf32(buf, 0x384, entry.field_384_param);
    wf32(buf, 0x388, entry.field_388_param); wf32(buf, 0x38C, entry.field_38c_param);
    wf32(buf, 0x390, entry.field_390_param); wf32(buf, 0x394, entry.field_394_param);
    wf32(buf, 0x398, entry.field_398_param); wf32(buf, 0x39C, entry.field_39c_param);
    wu32(buf, 0x3A0, entry.field_3a0_flag); wu32(buf, 0x3A4, entry.field_3a4_flag);
    wf32(buf, 0x3A8, entry.field_3a8_param); wu32(buf, 0x3AC, entry.field_3ac_flag);
    wf32(buf, 0x3B0, entry.field_3b0_param); wu32(buf, 0x3B4, entry.field_3b4_flag);
    wf32(buf, 0x3B8, entry.field_3b8_param); wf32(buf, 0x3BC, entry.field_3bc_param);
}

fn ru32(data: &[u8], o: usize) -> u32 { u32::from_le_bytes([data[o], data[o+1], data[o+2], data[o+3]]) }
fn wu32(buf: &mut [u8], o: usize, v: u32) { buf[o..o+4].copy_from_slice(&v.to_le_bytes()); }
fn rf32(data: &[u8], o: usize) -> f32 { f32::from_le_bytes([data[o], data[o+1], data[o+2], data[o+3]]) }
fn wf32(buf: &mut [u8], o: usize, v: f32) { buf[o..o+4].copy_from_slice(&v.to_le_bytes()); }
