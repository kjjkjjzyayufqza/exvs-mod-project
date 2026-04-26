use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

use serde_json::Value;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};
use crate::format::param_entry_schema::{
    entry_commands_from_named_json, entry_commands_to_named_json, entry_row_matches_command_map,
    expected_field_specs_ordered_index_times_four, min_entry_data_size_for_specs,
    parse_commands_map_from_entry_row, validate_file_specs_kind_match_pool, ParamCommandPool,
};

pub const CHARACTERPARAM_COMMAND_POOL: ParamCommandPool = &[
    (0x00D7CEDB, 2, "max_hp"),
    (0x00EC483C, 5, "hp_correction_rate"),
    (0x01F15731, 5, "boost_gauge_pct"),
    (0x04371326, 2, "base_unit_cost"),
    (0x07B8E157, 2, "ammo_count_main"),
    (0x0804605C, 5, "down_value_rate"),
    (0x080AF70C, 2, "boost_gauge_max"),
    (0x08218288, 5, "front_tracking_angle"),
    (0x0872029D, 2, "sub_shot_cost"),
    (0x08A0ADE8, 5, "rear_tracking_angle"),
    (0x08ECF0BE, 5, "red_lock_distance"),
    (0x0911077E, 2, "boost_recovery_speed"),
    (0x0ACCE031, 5, "dmg_multiplier_tier_a"),
    (0x0B25CB7F, 2, "unit_id_composite"),
    (0x0F8134A7, 5, "green_lock_distance"),
    (0x104DFF9D, 5, "dmg_multiplier_tier_b"),
    (0x1113F30E, 5, "model_scale"),
    (0x14F89980, 5, "movement_speed_base"),
    (0x157CC9FE, 5, "boost_speed_pct"),
    (0x15B67A85, 5, "gravity_offset"),
    (0x1698E3D8, 5, "body_collision_radius"),
    (0x18415DC4, 2, "is_transformable"),
    (0x1B2228B5, 1, "unit_attribute_flags"),
    (0x1B8808F8, 2, "has_shield"),
    (0x1BB18A48, 5, "dmg_multiplier_tier_c"),
    (0x1BFADFD3, 5, "lock_on_fov_angle"),
    (0x1C936B77, 5, "down_value_threshold"),
    (0x1D6EA3F1, 2, "assist_damage"),
    (0x1E61CF9F, 5, "assist_correction_rate"),
    (0x1EA3FAE1, 2, "burst_cost"),
    (0x21632B7A, 5, "step_tracking_angle_min"),
    (0x21E2041A, 5, "step_tracking_angle_max"),
    (0x22169CCE, 5, "boost_dash_speed_rate"),
    (0x22823596, 2, "special_cost"),
    (0x24FA2A04, 5, "special_gauge_start_rate"),
    (0x25346DCD, 2, "reserved_flag_08c"),
    (0x25384033, 5, "landing_recovery_rate"),
    (0x2698D841, 5, "damage_correction_base"),
    (0x26BC945D, 5, "step_speed_rate"),
    (0x27F7E08A, 5, "camera_pitch_down_angle"),
    (0x283634C3, 5, "dmg_multiplier_tier_d"),
    (0x28B3FEC3, 5, "camera_pitch_up_angle"),
    (0x2B99569A, 2, "main_ammo_reload_frame"),
    (0x2C6DC778, 5, "aerial_damage_rate"),
    (0x2C8221E6, 2, "reserved_flag_0b0"),
    (0x2CF49283, 2, "melee_combo_limit"),
    (0x2DA8874F, 2, "special_melee_damage"),
    (0x2DF82AD5, 5, "special_melee_correction_rate"),
    (0x30099C4D, 5, "guard_damage_rate"),
    (0x324F2214, 5, "barrier_damage_rate"),
    (0x32F4D4BE, 2, "reserved_flag_0c8"),
    (0x333722B6, 2, "melee_damage"),
    (0x338D4823, 5, "melee_correction_offset"),
    (0x379D0C45, 5, "melee_tracking_angle"),
    (0x38FDFC10, 5, "melee_bonus_rate"),
    (0x3AA41969, 5, "melee_reach_base"),
    (0x3C1E9E3B, 2, "score_value_base"),
    (0x3C43A0D1, 5, "charge_time_offset"),
    (0x3C475420, 5, "camera_distance_near"),
    (0x3CBF4F6C, 5, "camera_fov_default"),
    (0x3D302D72, 5, "dmg_multiplier_tier_e"),
    (0x3D501F3B, 2, "reserved_flag_0f4"),
    (0x3F29DFF4, 2, "reserved_flag_0f8"),
    (0x432ADAA1, 5, "camera_offset_x"),
    (0x43DC9679, 5, "dmg_multiplier_tier_f"),
    (0x45C84958, 2, "respawn_invincibility_frame"),
    (0x46E6927A, 5, "camera_fov_battle"),
    (0x4769F064, 5, "dmg_multiplier_tier_g"),
    (0x4778AB75, 1, "movement_type"),
    (0x4B4064B6, 5, "camera_distance_far"),
    (0x4B449047, 5, "camera_offset_y"),
    (0x4CF8985A, 2, "reserved_flag_11c"),
    (0x4D2405E0, 2, "reserved_flag_120"),
    (0x4FFACC86, 5, "camera_offset_z"),
    (0x5175F1DE, 5, "camera_offset_partner_x"),
    (0x51BBA4CB, 5, "camera_offset_partner_y"),
    (0x51DD39F0, 5, "body_height"),
    (0x52335D5B, 2, "reserved_flag_134"),
    (0x523F70A5, 5, "body_offset_y"),
    (0x5245EE3E, 2, "partner_cost_penalty_frame"),
    (0x539BC76D, 2, "charge_shot_damage"),
    (0x53FD1A92, 5, "charge_shot_correction_offset"),
    (0x55E4FF75, 5, "yellow_lock_distance"),
    (0x5AC06BD2, 5, "lock_on_range_min"),
    (0x5B3AF66C, 5, "lock_on_angle_main"),
    (0x5B851170, 2, "reserved_flag_154"),
    (0x5BBBD90C, 5, "aim_assist_angle"),
    (0x5BF3A215, 2, "sub_ammo_reload_frame"),
    (0x5CE8D569, 2, "reserved_flag_160"),
    (0x5E0DDDD8, 2, "special_melee_cost"),
    (0x6133A20B, 2, "special_reload_frame"),
    (0x6674EE31, 5, "special_fov_pct"),
    (0x6A14228B, 5, "special_correction_base"),
    (0x6AF92610, 5, "special_correction_rate"),
    (0x6ED37B1F, 5, "burst_correction_base"),
    (0x6F2514E8, 5, "burst_fov_pct"),
    (0x71D35821, 1, "burst_attribute_flags"),
    (0x71D87C2C, 5, "burst_speed_multiplier"),
    (0x72785F9E, 5, "burst_lock_on_angle"),
    (0x776BBBE9, 2, "burst_damage"),
    (0x78860431, 5, "engagement_range_near"),
    (0x78C70D3F, 5, "hitbox_height"),
    (0x7B9D7024, 2, "reserved_flag_198"),
    (0x7BA88A27, 5, "auto_aim_angle_limit"),
    (0x7D1A0ACF, 2, "respawn_cost"),
    (0x8199A311, 2, "main_shot_cost"),
    (0x8248401F, 2, "score_bonus_cap"),
    (0x82B967A9, 5, "walk_speed"),
    (0x8381BE8A, 2, "team_cost_value"),
    (0x85C483F0, 5, "boost_consumption_rate"),
    (0x86579C72, 5, "close_tracking_angle"),
    (0x8A902D5F, 5, "main_shot_correction_rate"),
    (0x8CBF2B3F, 5, "gravity_multiplier"),
    (0x8F0666AB, 5, "ranged_tracking_angle_min"),
    (0x8F8749CB, 5, "ranged_tracking_angle_max"),
    (0x904C7CF0, 2, "special_damage"),
    (0x91CDEF2B, 5, "dmg_multiplier_tier_h"),
    (0x91E5A104, 5, "engagement_range_far"),
    (0x9B20A527, 5, "sub_shot_correction_base"),
    (0x9B8BF864, 5, "sub_shot_fov_pct"),
    (0x9BED4726, 5, "sub_shot_correction_rate"),
    (0x9D8ADBDF, 2, "reserved_flag_1e4"),
    (0xA223C183, 5, "lock_on_distance_max"),
    (0xA60B0684, 1, "weapon_attribute_flags"),
    (0xA644CF59, 5, "wide_camera_angle"),
    (0xA6C5E039, 5, "narrow_camera_angle"),
    (0xA6DC5C53, 5, "burst_damage_multiplier"),
    (0xA83A8232, 5, "minimum_aim_angle"),
    (0xA900CDF7, 5, "aim_correction_offset_x"),
    (0xAA841999, 5, "aim_correction_offset_y"),
    (0xAB4673AE, 5, "aim_correction_offset_z"),
    (0xAE7FF94F, 2, "sub_shot_cost_scaled"),
    (0xAEAC01A7, 2, "reserved_flag_210"),
    (0xAF153580, 5, "melee_camera_angle"),
    (0xB2900720, 2, "assist_reload_frame"),
    (0xB2E6B445, 2, "reserved_flag_21c"),
    (0xB3373BD9, 5, "dmg_multiplier_tier_i"),
    (0xB4F17B6F, 5, "melee_lunge_offset"),
    (0xB58B705C, 2, "reserved_flag_228"),
    (0xB5FDC339, 2, "step_cancel_count"),
    (0xB7D5327E, 2, "boost_gauge_initial"),
    (0xB91793D4, 5, "fall_speed_base"),
    (0xBA900811, 5, "air_dash_speed_base"),
    (0xBAE8C388, 5, "alert_range_distance"),
    (0xBB19842F, 5, "alert_range_fov"),
    (0xBC427D55, 5, "radar_display_scale"),
    (0xBE256E0C, 5, "dash_speed_base"),
    (0xBE8D97FB, 2, "reserved_flag_24c"),
    (0xC1405939, 5, "radar_fov_pct"),
    (0xC28C40CA, 2, "reserved_flag_254"),
    (0xC2FAF3AF, 2, "ammo_reserve_count"),
    (0xC3F64BF9, 5, "ammo_correction_offset"),
    (0xC4852F00, 2, "reserved_flag_260"),
    (0xC59737B6, 2, "charge_time_frame"),
    (0xC5E184D3, 2, "reserved_flag_268"),
    (0xC6A88D7F, 2, "charge_shot_cost"),
    (0xC6E2AD28, 5, "charge_damage_multiplier"),
    (0xC8B2F571, 5, "charge_correction_offset"),
    (0xCAF44B28, 5, "charge_bonus_offset"),
    (0xCB36211F, 5, "charge_gauge_offset"),
    (0xD01D00DF, 5, "melee_lock_angle"),
    (0xD249350C, 5, "target_range_distance"),
    (0xD24DC1FD, 5, "target_correction_offset"),
    (0xD2D0C774, 5, "target_fov_pct"),
    (0xD524F115, 5, "radar_range_distance"),
    (0xD54CE896, 5, "radar_sweep_angle"),
    (0xD6F39D3C, 5, "radar_correction_offset"),
    (0xD854F864, 5, "radar_display_offset"),
    (0xD8F4FBD2, 2, "melee_cost"),
    (0xDC414338, 5, "melee_cost_correction_offset"),
    (0xDC9C3D2F, 5, "melee_aim_angle"),
    (0xDD83290F, 5, "melee_aim_correction_offset"),
    (0xDE07FD61, 5, "melee_range_offset"),
    (0xDF888E8B, 2, "rotation_speed_degrees"),
    (0xE1D22572, 5, "sub_shot_fov_alt"),
    (0xE1D56972, 5, "melee_reach_distance"),
    (0xE2C6FD16, 2, "sub_shot_damage"),
    (0xE3E5D41D, 5, "down_value_per_hit"),
    (0xE6213731, 7, "action_label_offset"),
    (0xE6E29192, 5, "target_switch_distance"),
    (0xE883DFAB, 5, "target_switch_fov"),
    (0xE90161F5, 5, "main_shot_speed_base"),
    (0xE9F462F6, 5, "damage_proration_rate"),
    (0xEB1219A4, 2, "main_shot_damage"),
    (0xECBC202D, 5, "combo_proration_rate"),
    (0xED170E69, 2, "reserved_flag_2e8"),
    (0xEDB407E8, 5, "shot_velocity_base"),
    (0xEE92BCAB, 5, "main_shot_damage_multiplier"),
    (0xF15C6A7F, 5, "melee_damage_correction_rate"),
    (0xF25A5100, 5, "ranged_damage_correction_rate"),
    (0xF3C4CAE9, 7, "resource_label_offset"),
    (0xF55FBBBD, 5, "projectile_tracking_angle_min"),
    (0xF5DE94DD, 5, "projectile_tracking_angle_max"),
    (0xF73592C7, 5, "max_render_distance"),
    (0xFBB81BA9, 5, "render_correction_offset"),
    (0xFEADD5BE, 5, "final_damage_multiplier"),
    (0xFEE76495, 2, "assist_cost"),
];

pub fn characterparam_entry_to_json_value(entry: &CharacterParamEntry) -> Value {
    entry_commands_to_named_json(entry.entry_id, &entry.commands, CHARACTERPARAM_COMMAND_POOL)
}

pub fn characterparam_entry_from_json_value(v: &Value) -> Result<CharacterParamEntry, String> {
    let (entry_id, commands) = entry_commands_from_named_json(v, CHARACTERPARAM_COMMAND_POOL)?;
    Ok(CharacterParamEntry { entry_id, commands })
}

#[derive(Debug, Clone, PartialEq)]
pub struct CharacterParamEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
}

impl Serialize for CharacterParamEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        characterparam_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for CharacterParamEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        characterparam_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<CharacterParamEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered_index_times_four(CHARACTERPARAM_COMMAND_POOL)
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(CHARACTERPARAM_COMMAND_POOL, field_specs)
}

fn parse_entry_from_raw(raw: &[u8], field_specs: &[ParamFieldSpec], entry_id: u32) -> CharacterParamEntry {
    let commands = parse_commands_map_from_entry_row(raw, field_specs);
    CharacterParamEntry { entry_id, commands }
}

fn entry_matches_raw(entry: &CharacterParamEntry, raw: &[u8], field_specs: &[ParamFieldSpec]) -> bool {
    entry_row_matches_command_map(&entry.commands, raw, field_specs)
}

pub fn parse_characterparam(data: &[u8]) -> Result<CharacterParamData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(parse_entry_from_raw(raw, &file.field_specs, id));
    }

    Ok(CharacterParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_characterparam(b: &CharacterParamData) -> Result<Vec<u8>, String> {
    if !b.field_specs.is_empty() {
        validate_field_specs(&b.field_specs)?;
    }
    let field_specs = if b.field_specs.is_empty() {
        expected_field_specs()
    } else {
        b.field_specs.clone()
    };

    let min_size = min_entry_data_size_for_specs(&field_specs);
    let default_floor = b.header.entry_size.max(min_size);
    let entry_size = default_floor as usize;

    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for (entry_index, entry) in b.entries.iter().enumerate() {
        if entry_index < b.source_entries_raw.len() && b.source_entries_raw[entry_index].len() == entry_size {
            let r = &b.source_entries_raw[entry_index];
            if entry_matches_raw(entry, r, &field_specs) {
                entries_raw.push(b.source_entries_raw[entry_index].clone());
                continue;
            }
        }

        let mut raw = if entry_index < b.source_entries_raw.len() && b.source_entries_raw[entry_index].len() == entry_size {
            b.source_entries_raw[entry_index].clone()
        } else {
            vec![0u8; entry_size]
        };

        for spec in &field_specs {
            let o = spec.entry_offset as usize;
            if o + 4 > raw.len() {
                return Err("characterparam entry field offset out of range for entry_size".to_string());
            }
            if let Some(v) = entry.commands.get(&spec.hash) {
                raw[o..o + 4].copy_from_slice(&v.to_le_bytes());
            }
        }
        entries_raw.push(raw);
    }

    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = field_specs.len() as u32;
    header.entry_size = entry_size as u32;

    let file = ParamBinaryFile {
        header,
        field_specs,
        entry_ids: b.entries.iter().map(|entry| entry.entry_id).collect(),
        entries_raw,
        trailing_data: b.trailing_data.clone(),
    };
    build_param_binary(&file)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_PATH: &str =
        "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\characterparam.bin";

    #[test]
    fn characterparam_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read characterparam sample file");

        let parsed =
            parse_characterparam(&source).expect("failed to parse characterparam sample file");
        let rebuilt =
            build_characterparam(&parsed).expect("failed to rebuild characterparam sample file");
        assert_eq!(rebuilt, source);

        assert!(!parsed.entries.is_empty(), "characterparam sample has no entries");

        let mut with_added = parsed.clone();
        let mut added = with_added.entries[0].clone();
        let next_id = with_added
            .entries
            .iter()
            .map(|entry| entry.entry_id)
            .max()
            .unwrap_or(0)
            .wrapping_add(1);
        added.entry_id = next_id;
        with_added.entries.push(added);
        let added_bytes =
            build_characterparam(&with_added).expect("failed to build characterparam after add");
        let added_parsed =
            parse_characterparam(&added_bytes).expect("failed to parse characterparam after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(added_parsed.entries.last().map(|entry| entry.entry_id), Some(next_id));

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes = build_characterparam(&with_updated)
            .expect("failed to build characterparam after update");
        let updated_parsed = parse_characterparam(&updated_bytes)
            .expect("failed to parse characterparam after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes = build_characterparam(&with_deleted)
            .expect("failed to build characterparam after delete");
        let deleted_parsed = parse_characterparam(&deleted_bytes)
            .expect("failed to parse characterparam after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
