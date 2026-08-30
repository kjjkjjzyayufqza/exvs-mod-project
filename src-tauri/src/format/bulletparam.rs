use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

use serde_json::Value;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};
use crate::format::param_entry_schema::{
    entry_commands_from_named_json, entry_commands_to_named_json, entry_row_matches_command_map,
    expected_field_specs_ordered, min_entry_data_size_for_specs, parse_commands_map_from_entry_row,
    snake_to_camel, validate_file_specs_kind_match_pool, ParamCommandPool,
};

// Please keep comments for analysis.
//
// Data-verified against 432 bullet_param files (10681 entries, cmd_count=80 or 73).
// No hashes appear as hardcoded immediates in the exe.
// Tags: [D:range] = data range, HASH = u32 hash reference (many unique values, max near u32::MAX)
//       PHANTOM = hash not present in any of the 432 files
//
// Naming corrections applied:
//   is_beam           -> beam_type_hash       (19 unique, max ~4B, not boolean)
//   is_penetrating    -> penetrate_type_hash  (17 unique, max ~4B, not boolean)
//   inherit_speed_flag -> inherit_speed_hash  (34 unique, max ~4B, not a flag)
//   initial_speed     -> bullet_size          (was mislabelled as launch speed)
pub const BULLETPARAM_COMMAND_POOL: ParamCommandPool = &[
    (0x0594D6D4, 5, "initial_angle"), // [V:sub_1405C4400] angular offset, 143 unique
    (0x05D5D30D, 5, "max_range"),     // [D:0~10000] distance, 112 unique
    (0x06E90346, 1, "move_type"),     // [D:0~255] enum, 9 unique
    (0x0D6A5CD5, 1, "hit_effect_hash"), // [V:sub_140606BB0] 815 unique hash refs
    (0x130D4C0B, 5, "spread_angle"),  // [D:-320~320] degrees, 151 unique
    (0x13662C98, 5, "hitbox_width"),  // [D:0~25]
    (0x138B3675, 5, "hitbox_height"), // [D:0~360]
    (0x13C6C469, 5, "hitbox_depth"),  // [D:-40~80]
    (0x14AB0070, 5, "aim_offset_vertical"), // [D:-135~400]
    (0x20FEDE31, 5, "homing_range"),  // [D:0~10000] distance
    (0x28BA5665, 5, "visual_scale"),  // [D:0~1000]
    (0x2E1E75E5, 5, "hit_effect_scale"), // [D:0~50]
    (0x2F446A4F, 5, "spawn_offset_forward"), // [V:sub_1405C4400] converted deg->rad; angular, not distance. [D:-175~210]
    (0x319126CE, 1, "inherit_speed_hash"),   // [D:HASH] 34 unique. was "inherit_speed_flag"
    (0x32ACABFB, 2, "lifetime"),             // [D:0~100000] frames
    (0x36FCE2D7, 1, "child_bullet_hash"),    // [D:HASH] 204 unique
    (0x397CE80D, 1, "collision_type"),       // [D:0~2] enum, 3 types
    (0x3B52DAAB, 5, "rotation_angle"),       // [D:-180~360] degrees
    (0x3C3F1EB2, 5, "elevation_angle"),      // [D:-135~1200] degrees
    (0x3CDF1516, 1, "homing_type"),          // [D:0~3] enum, 4 types
    (0x3F8653B3, 5, "reserved_050"),         // PHANTOM — not in any file
    (0x41435BE6, 1, "bullet_effect_hash"),   // [D:HASH] 832 unique
    (0x41FBD241, 1, "trail_effect_hash"),    // [D:HASH] 260 unique
    (0x46961658, 1, "muzzle_flash_hash"),    // [D:HASH] 59 unique
    (0x48816325, 5, "reserved_060"),         // PHANTOM — not in any file
    (0x4B382E24, 5, "target_height_offset"), // [D:-300~1000]
    (0x4B492895, 2, "pierce_count"),         // [D:0~30] 27 unique
    (0x4C55EA3D, 5, "acceleration_value"),   // [D:-360~3000]
    (0x4D6BF281, 1, "bullet_action_hash"),   // [D:HASH] 1474 unique — most diverse action ref
    (0x52CA3B01, 5, "homing_start_distance"), // [D:0~5000]
    (0x55C77696, 5, "vertical_launch_angle"), // [V:sub_1405C4400] used as positional offset along source axes
    (0x58435AD9, 5, "horizontal_aim_angle"), // [V:sub_1405C4400] converted deg->rad for spawn rotation
    (0x59332F69, 2, "hit_interval_frame"),   // [D:0~130] frames
    (0x63AC30E6, 5, "max_altitude"),         // [D:-700~250]
    (0x640A7C9D, 5, "spawn_offset_vertical"), // [D:-350~300]
    (0x6481E0F7, 2, "speed_internal"), // [D:0~2147483646] 18 unique — possibly hash/special encoding
    (0x64C1F4FF, 5, "collision_height"), // [D:-10~90]
    (0x67921CDD, 2, "homing_duration"), // [D:0~10000] frames
    (0x68CD7942, 1, "on_expire_hash"), // [D:HASH] 985 unique
    (0x6A62D65E, 2, "delay_frame"),    // [D:0~1000] frames, 9 unique
    (0x74F469FA, 5, "gravity_rate"), // [V:sub_140606BB0,sub_1405B5040] ballistic trajectory param. [D:0~0.5]
    (0x7696F452, 5, "speed_scale"),  // [D:0~2.0] multiplier
    (0x7B4AA25E, 5, "effective_range"), // [D:0~360]
    (0x81A816EB, 1, "bullet_shape"), // [D:0~8] enum, 9 shapes
    (0x8379D9F8, 5, "model_scale"),  // [D:0~17]
    (0x846DDC39, 5, "max_distance"), // [D:0~9000]
    (0x89BE0F56, 1, "bullet_resource_hash"), // [D:HASH] 3547 unique — most diverse resource ref
    (0x8ACF95D3, 5, "blast_radius"), // [D:-110~150]
    (0x8DA251CA, 5, "offset_angle_vertical"), // [D:-150~300]
    (0x8DBD5433, 5, "homing_strength"), // [D:0~1.0] multiplier
    (0x90423264, 5, "turn_rate"), // [V:sub_140606BB0,sub_1405B5040] projectile turning speed. [D:0~1000]
    (0x9375A247, 5, "homing_angle"), // [D:0~180] degrees
    (0x9C9D876E, 5, "offset_angle_horizontal"), // [V:sub_1405C4400] used as positional offset along source axes
    (0xA12E3B5F, 1, "beam_type_hash"),          // [D:HASH] 19 unique, max ~4B. was "is_beam"
    (0xA1E2C610, 5, "reserved_0d8"),            // PHANTOM — not in any file
    (0xA25B8B11, 5, "target_distance"),         // [D:-180~1200]
    (0xA36593AD, 1, "behavior_type"), // [D:HASH-like] 69 unique, max ~4B — behavior definition ref
    (0xA5364F08, 5, "aim_correction_angle"), // [D:-300~440]
    (0xA68F0209, 5, "reserved_0e8"),  // PHANTOM — not in any file
    (0xA8987774, 1, "ammo_type_hash"), // [D:HASH] 153 unique
    (0xAB606D9E, 5, "bullet_size"),   // [D:0~640] was "initial_speed"
    (0xABEDC73A, 5, "launch_angle_horizontal"), // [D:-140~500]
    (0xAF2B7098, 5, "tracking_angle"), // [D:0~180] degrees
    (0xB306BEE8, 5, "min_homing_distance"), // [D:0~360]
    (0xBA9B8F5D, 5, "turn_acceleration"), // [D:0~15]
    (0xD188329F, 5, "reserved_f4"),   // [D:0~500] 5 unique, mostly 0
    (0xD32D39ED, 1, "hitgroup_hash"), // [D:HASH] 2371 unique
    (0xD462A33B, 1, "spawn_pattern_hash"), // [D:HASH] 107 unique
    (0xD55CBB87, 5, "aim_limit_angle"), // [D:-160~240]
    (0xD6290BC9, 1, "penetrate_type_hash"), // [D:HASH] 17 unique. was "is_penetrating"
    (0xD6E5F686, 5, "reserved_118"),  // PHANTOM — not in any file
    (0xD8F283FB, 1, "secondary_effect_hash"), // [D:HASH] 1091 unique
    (0xDCEAF7AC, 5, "homing_effective_distance"), // [D:-360~820]
    (0xDE6C0636, 1, "reserved_flag_110"), // [D:0~0xFFFFFFF6] 3 unique, 10652 zeros
    (0xDF9F47E2, 1, "explosion_effect_hash"), // [D:HASH] 106 unique
    (0xEDD1C108, 1, "interaction_hash"), // [D:HASH] 1670 unique
    (0xEF44FC6B, 5, "speed_acceleration"), // [D:-2~30]
    (0xF33F8630, 2, "duration_frame"), // [D:0~1000] frames
    (0xF47EE96E, 5, "reserved_124"),  // [D:-5~1200] 13 unique, mostly 0
    (0xF647567F, 1, "sound_effect_hash"), // [D:HASH] 341 unique
    (0xFAA5615C, 5, "muzzle_offset_horizontal"), // [D:-360~87011]
    (0xFD032D27, 5, "muzzle_offset_vertical"), // [D:-100~300]
    (0xFD855759, 5, "induction_angle"), // [D:0~360]
    (0xFDC8A545, 5, "spread_distance"), // [D:-140~250]
    (0xFF51E424, 5, "tracking_start_distance"), // [D:0~1000]
];

/// Input-only compatibility aliases. Serialization always emits the command-pool key.
const BULLETPARAM_LEGACY_KEY_ALIASES: &[(&str, u32)] = &[("initialSpeed", 0xAB606D9E)];

fn apply_bulletparam_legacy_aliases(v: &Value) -> Value {
    let Some(obj) = v.as_object() else {
        return v.clone();
    };
    let mut map = obj.clone();
    for &(legacy_key, hash) in BULLETPARAM_LEGACY_KEY_ALIASES {
        let Some(canonical) = BULLETPARAM_COMMAND_POOL
            .iter()
            .find_map(|(pool_hash, _, name)| (*pool_hash == hash).then(|| snake_to_camel(name)))
        else {
            continue;
        };
        if map.contains_key(&canonical) {
            continue;
        }
        if let Some(value) = map.remove(legacy_key) {
            map.insert(canonical, value);
        }
    }
    Value::Object(map)
}

#[cfg(test)]
pub const BULLETPARAM_ENTRY_SIZE: u32 = (BULLETPARAM_COMMAND_POOL.len() as u32) * 4;

pub fn bulletparam_entry_to_json_value(entry: &BulletParamEntry) -> Value {
    entry_commands_to_named_json(entry.entry_id, &entry.commands, BULLETPARAM_COMMAND_POOL)
}

pub fn bulletparam_entry_from_json_value(v: &Value) -> Result<BulletParamEntry, String> {
    let remapped = apply_bulletparam_legacy_aliases(v);
    let (entry_id, commands) = entry_commands_from_named_json(&remapped, BULLETPARAM_COMMAND_POOL)?;
    Ok(BulletParamEntry { entry_id, commands })
}

#[derive(Debug, Clone, PartialEq)]
pub struct BulletParamEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
}

impl Serialize for BulletParamEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        bulletparam_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for BulletParamEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        bulletparam_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulletParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<BulletParamEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered(BULLETPARAM_COMMAND_POOL)
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(BULLETPARAM_COMMAND_POOL, field_specs)
}

fn parse_entry_from_raw(
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
    entry_id: u32,
) -> BulletParamEntry {
    let commands = parse_commands_map_from_entry_row(raw, field_specs);
    BulletParamEntry { entry_id, commands }
}

fn entry_matches_raw(entry: &BulletParamEntry, raw: &[u8], field_specs: &[ParamFieldSpec]) -> bool {
    entry_row_matches_command_map(&entry.commands, raw, field_specs)
}

pub fn parse_bulletparam(data: &[u8]) -> Result<BulletParamData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(parse_entry_from_raw(raw, &file.field_specs, id));
    }

    Ok(BulletParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_bulletparam(b: &BulletParamData) -> Result<Vec<u8>, String> {
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
        if entry_index < b.source_entries_raw.len()
            && b.source_entries_raw[entry_index].len() == entry_size
        {
            let r = &b.source_entries_raw[entry_index];
            if entry_matches_raw(entry, r, &field_specs) {
                entries_raw.push(b.source_entries_raw[entry_index].clone());
                continue;
            }
        }
        let mut raw = if entry_index < b.source_entries_raw.len()
            && b.source_entries_raw[entry_index].len() == entry_size
        {
            b.source_entries_raw[entry_index].clone()
        } else {
            vec![0u8; entry_size]
        };
        for spec in &field_specs {
            let o = spec.entry_offset as usize;
            if o + 4 > raw.len() {
                return Err(
                    "bulletparam entry field offset out of range for entry_size".to_string()
                );
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
        entry_ids: b.entries.iter().map(|e| e.entry_id).collect(),
        entries_raw,
        trailing_data: b.trailing_data.clone(),
    };
    build_param_binary(&file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::format::param_entry_schema::snake_to_camel;
    use std::collections::HashSet;

    const SAMPLE_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\bulletparam.bin";
    const SHIFTED_SAMPLE_PATH: &str = "E:/XB/解包/com/file/0xA3D57845/bulletparam.bin";
    const SAMPLE_OUT_PATH: &str = "E:/XB/解包/com/file/0x08248A8D/bulletparam_1.bin";
    const SHIFTED_OUT_PATH: &str = "E:/XB/解包/com/file/0xA3D57845/bulletparam_1.bin";
    const H_INITIAL_ANGLE: u32 = 0x0594D6D4;

    fn assert_specs_equal(a: &[ParamFieldSpec], b: &[ParamFieldSpec]) {
        assert_eq!(a.len(), b.len());
        for (left, right) in a.iter().zip(b.iter()) {
            assert_eq!(left.hash, right.hash);
            assert_eq!(left.entry_offset, right.entry_offset);
            assert_eq!(left.flags, right.flags);
            assert_eq!(left.kind, right.kind);
        }
    }

    fn run_data_level_crud_checks(sample_path: &str, output_path: &str) {
        let source = std::fs::read(sample_path).expect("failed to read bulletparam sample file");
        let parsed = parse_bulletparam(&source).expect("failed to parse bulletparam sample file");
        let original_bin = read_param_binary(&source).expect("failed to parse original binary");
        assert!(
            !parsed.entries.is_empty(),
            "bulletparam sample has no entries"
        );

        let rebuilt =
            build_bulletparam(&parsed).expect("failed to rebuild bulletparam sample file");
        std::fs::write(output_path, &rebuilt).expect("failed to write rebuilt bulletparam file");
        let rebuilt_bin = read_param_binary(&rebuilt).expect("failed to parse rebuilt binary");
        assert_specs_equal(&original_bin.field_specs, &rebuilt_bin.field_specs);
        assert_eq!(
            original_bin.header.commands_count,
            rebuilt_bin.header.commands_count
        );
        assert_eq!(
            original_bin.header.entry_size,
            rebuilt_bin.header.entry_size
        );
        assert_eq!(original_bin.entries_raw, rebuilt_bin.entries_raw);

        let mut known_hashes = HashSet::with_capacity(BULLETPARAM_COMMAND_POOL.len());
        for (hash, _, _) in BULLETPARAM_COMMAND_POOL {
            known_hashes.insert(*hash);
        }

        let mut with_added = parsed.clone();
        let next_id = with_added
            .entries
            .iter()
            .map(|e| e.entry_id)
            .max()
            .unwrap_or(0)
            .wrapping_add(1);
        let mut new_commands = std::collections::HashMap::new();
        let template = &with_added.entries[0];
        for (hash, _, _) in BULLETPARAM_COMMAND_POOL {
            if let Some(value) = template.commands.get(hash) {
                new_commands.insert(*hash, *value);
            } else {
                new_commands.insert(*hash, 0);
            }
        }
        with_added.entries.push(BulletParamEntry {
            entry_id: next_id,
            commands: new_commands,
        });
        let added_bytes =
            build_bulletparam(&with_added).expect("failed to build bulletparam after add");
        let added_bin = read_param_binary(&added_bytes).expect("failed to parse added binary");
        assert_specs_equal(&original_bin.field_specs, &added_bin.field_specs);
        assert_eq!(
            original_bin.header.commands_count,
            added_bin.header.commands_count
        );
        assert_eq!(original_bin.header.entry_size, added_bin.header.entry_size);
        assert_eq!(
            added_bin.entries_raw.len(),
            original_bin.entries_raw.len() + 1
        );
        for i in 0..original_bin.entries_raw.len() {
            assert_eq!(original_bin.entries_raw[i], added_bin.entries_raw[i]);
        }
        let new_row = added_bin
            .entries_raw
            .last()
            .expect("missing newly added entry row");
        for spec in &added_bin.field_specs {
            if !known_hashes.contains(&spec.hash) {
                let o = spec.entry_offset as usize;
                assert_eq!(&new_row[o..o + 4], &[0, 0, 0, 0]);
            }
        }

        let mut with_deleted = parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_bulletparam(&with_deleted).expect("failed to build bulletparam after delete");
        let deleted_bin =
            read_param_binary(&deleted_bytes).expect("failed to parse deleted binary");
        assert_specs_equal(&original_bin.field_specs, &deleted_bin.field_specs);
        assert_eq!(
            original_bin.header.commands_count,
            deleted_bin.header.commands_count
        );
        assert_eq!(
            original_bin.header.entry_size,
            deleted_bin.header.entry_size
        );
        assert_eq!(
            deleted_bin.entries_raw.len(),
            original_bin.entries_raw.len() - 1
        );
        for i in 0..deleted_bin.entries_raw.len() {
            assert_eq!(deleted_bin.entries_raw[i], original_bin.entries_raw[i]);
        }

        let mut with_updated = parsed.clone();
        let before_value = *with_updated.entries[0]
            .commands
            .get(&H_INITIAL_ANGLE)
            .expect("initial_angle");
        with_updated.entries[0]
            .commands
            .insert(H_INITIAL_ANGLE, before_value.wrapping_add(1));
        let updated_bytes =
            build_bulletparam(&with_updated).expect("failed to build bulletparam after update");
        let updated_bin =
            read_param_binary(&updated_bytes).expect("failed to parse updated binary");
        assert_specs_equal(&original_bin.field_specs, &updated_bin.field_specs);
        assert_eq!(
            original_bin.header.commands_count,
            updated_bin.header.commands_count
        );
        assert_eq!(
            original_bin.header.entry_size,
            updated_bin.header.entry_size
        );
        assert_eq!(
            original_bin.entries_raw.len(),
            updated_bin.entries_raw.len()
        );
        for i in 1..original_bin.entries_raw.len() {
            assert_eq!(original_bin.entries_raw[i], updated_bin.entries_raw[i]);
        }
        for spec in &original_bin.field_specs {
            if spec.hash == H_INITIAL_ANGLE {
                continue;
            }
            let o = spec.entry_offset as usize;
            assert_eq!(
                &original_bin.entries_raw[0][o..o + 4],
                &updated_bin.entries_raw[0][o..o + 4]
            );
        }
    }

    #[test]
    fn bulletparam_serializes_bullet_size_and_accepts_initial_speed_alias() {
        let legacy = serde_json::json!({
            "entryId": 1,
            "initialSpeed": 12.5
        });
        let entry = bulletparam_entry_from_json_value(&legacy).expect("parse legacy alias");
        let raw = *entry.commands.get(&0xAB606D9E).expect("bullet_size hash");
        assert!((f32::from_bits(raw) - 12.5).abs() < 1e-5);

        let canonical = bulletparam_entry_to_json_value(&entry);
        assert!(canonical.get("initialSpeed").is_none());
        let size = canonical
            .get("bulletSize")
            .and_then(|v| v.as_f64())
            .expect("canonical bulletSize");
        assert!((size - 12.5).abs() < 1e-5);

        let both = serde_json::json!({
            "entryId": 1,
            "initialSpeed": 1.0,
            "bulletSize": 3.0
        });
        let prefer_canonical =
            bulletparam_entry_from_json_value(&both).expect("canonical key wins over alias");
        let preferred = *prefer_canonical
            .commands
            .get(&0xAB606D9E)
            .expect("bullet_size hash");
        assert!((f32::from_bits(preferred) - 3.0).abs() < 1e-5);
    }

    #[test]
    fn entry_json_roundtrip_preserves_f32() {
        let e = parse_entry_from_raw(&[0u8; 64], &expected_field_specs(), 1);
        let mut c = e.commands.clone();
        c.insert(0x0594D6D4, f32::to_bits(1.5));
        let e2 = BulletParamEntry {
            entry_id: 1,
            commands: c,
        };
        let v = bulletparam_entry_to_json_value(&e2);
        let e3 = bulletparam_entry_from_json_value(&v).expect("from json");
        assert!((f32::from_bits(*e3.commands.get(&0x0594D6D4).unwrap()) - 1.5).abs() < 1e-5);
    }

    #[test]
    fn snek_to_camel() {
        assert_eq!(snake_to_camel("initial_angle"), "initialAngle");
        assert_eq!(snake_to_camel("reserved_0d8"), "reserved0d8");
    }

    #[test]
    fn bulletparam_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read bulletparam sample file");

        let parsed = parse_bulletparam(&source).expect("failed to parse bulletparam sample file");
        let rebuilt =
            build_bulletparam(&parsed).expect("failed to rebuild bulletparam sample file");
        assert_eq!(rebuilt, source);

        assert!(
            !parsed.entries.is_empty(),
            "bulletparam sample has no entries"
        );
        let j = serde_json::to_string(&parsed.entries[0]).expect("to json");
        assert!(j.contains("entryId") && (j.contains("initialAngle") || j.contains("entryId")));

        let mut with_added = parsed.clone();
        let mut added = with_added.entries[0].clone();
        let next_id = with_added
            .entries
            .iter()
            .map(|e| e.entry_id)
            .max()
            .unwrap_or(0)
            .wrapping_add(1);
        added.entry_id = next_id;
        with_added.entries.push(added);
        let added_bytes =
            build_bulletparam(&with_added).expect("failed to build bulletparam after add");
        let added_parsed =
            parse_bulletparam(&added_bytes).expect("failed to parse bulletparam after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(
            added_parsed.entries.last().map(|e| e.entry_id),
            Some(next_id)
        );

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_bulletparam(&with_updated).expect("failed to build bulletparam after update");
        let updated_parsed =
            parse_bulletparam(&updated_bytes).expect("failed to parse bulletparam after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_bulletparam(&with_deleted).expect("failed to build bulletparam after delete");
        let deleted_parsed =
            parse_bulletparam(&deleted_bytes).expect("failed to parse bulletparam after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }

    #[test]
    fn bulletparam_parse_accepts_variable_commands_and_entry_size() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read bulletparam sample file");

        let mut with_extra_commands =
            read_param_binary(&source).expect("failed to read bulletparam binary");
        with_extra_commands.field_specs.push(ParamFieldSpec {
            hash: 0x11223344,
            entry_offset: BULLETPARAM_ENTRY_SIZE,
            flags: 0,
            kind: 1,
        });
        for row in &mut with_extra_commands.entries_raw {
            if row.len() < (BULLETPARAM_ENTRY_SIZE + 4) as usize {
                row.resize((BULLETPARAM_ENTRY_SIZE + 4) as usize, 0);
            }
        }
        with_extra_commands.header.entry_size = BULLETPARAM_ENTRY_SIZE + 4;
        let extra_bytes =
            build_param_binary(&with_extra_commands).expect("failed to build extra command binary");
        let parsed_extra = parse_bulletparam(&extra_bytes)
            .expect("failed to parse bulletparam with extra commands");
        assert_eq!(
            parsed_extra.field_specs.len(),
            with_extra_commands.field_specs.len()
        );
        assert!(parsed_extra.entries[0].commands.contains_key(&0x11223344));
        let j = bulletparam_entry_to_json_value(&parsed_extra.entries[0]);
        assert!(j.get("extraCommands").is_some());

        let mut with_fewer_commands =
            read_param_binary(&source).expect("failed to read bulletparam binary");
        with_fewer_commands
            .field_specs
            .truncate(BULLETPARAM_COMMAND_POOL.len() - 3);
        let fewer_bytes =
            build_param_binary(&with_fewer_commands).expect("failed to build fewer command binary");
        let parsed_fewer = parse_bulletparam(&fewer_bytes)
            .expect("failed to parse bulletparam with fewer commands");
        assert_eq!(
            parsed_fewer.field_specs.len(),
            with_fewer_commands.field_specs.len()
        );

        let mut with_larger_entry =
            read_param_binary(&source).expect("failed to read bulletparam binary");
        with_larger_entry.header.entry_size = BULLETPARAM_ENTRY_SIZE + 16;
        for row in &mut with_larger_entry.entries_raw {
            row.resize((BULLETPARAM_ENTRY_SIZE + 16) as usize, 0);
        }
        let larger_entry_bytes =
            build_param_binary(&with_larger_entry).expect("failed to build larger entry binary");
        let parsed_larger = parse_bulletparam(&larger_entry_bytes)
            .expect("failed to parse bulletparam with larger entry size");
        assert_eq!(parsed_larger.header.entry_size, BULLETPARAM_ENTRY_SIZE + 16);
    }

    #[test]
    fn bulletparam_parse_supports_shifted_layout_variant() {
        let source = std::fs::read(SHIFTED_SAMPLE_PATH)
            .expect("failed to read shifted bulletparam sample file");
        let parsed =
            parse_bulletparam(&source).expect("failed to parse shifted bulletparam sample file");
        assert!(
            !parsed.entries.is_empty(),
            "shifted bulletparam has no entries"
        );
        assert_eq!(parsed.header.commands_count, 85);
    }

    #[test]
    fn bulletparam_shifted_sample_roundtrip_exact() {
        let source = std::fs::read(SHIFTED_SAMPLE_PATH)
            .expect("failed to read shifted bulletparam sample file");
        let parsed =
            parse_bulletparam(&source).expect("failed to parse shifted bulletparam sample file");
        let rebuilt =
            build_bulletparam(&parsed).expect("failed to rebuild shifted bulletparam sample file");
        assert_eq!(rebuilt, source);
    }

    #[test]
    fn bulletparam_shifted_sample_keeps_unknown_commands_on_update() {
        let source = std::fs::read(SHIFTED_SAMPLE_PATH)
            .expect("failed to read shifted bulletparam sample file");
        let mut parsed =
            parse_bulletparam(&source).expect("failed to parse shifted bulletparam sample file");
        let b = *parsed.entries[0]
            .commands
            .get(&H_INITIAL_ANGLE)
            .expect("initial_angle");
        let f = f32::from_bits(b) + 1.0;
        parsed.entries[0]
            .commands
            .insert(H_INITIAL_ANGLE, f32::to_bits(f));

        let rebuilt =
            build_bulletparam(&parsed).expect("failed to rebuild shifted bulletparam sample file");
        let original_bin = read_param_binary(&source).expect("failed to parse original binary");
        let rebuilt_bin = read_param_binary(&rebuilt).expect("failed to parse rebuilt binary");

        assert_eq!(
            original_bin.field_specs.len(),
            rebuilt_bin.field_specs.len()
        );
        for (before_spec, after_spec) in original_bin
            .field_specs
            .iter()
            .zip(rebuilt_bin.field_specs.iter())
        {
            assert_eq!(before_spec.hash, after_spec.hash);
            assert_eq!(before_spec.entry_offset, after_spec.entry_offset);
            assert_eq!(before_spec.flags, after_spec.flags);
            assert_eq!(before_spec.kind, after_spec.kind);
        }
        assert_eq!(
            original_bin.entries_raw.len(),
            rebuilt_bin.entries_raw.len()
        );
        for (before_row, after_row) in original_bin
            .entries_raw
            .iter()
            .zip(rebuilt_bin.entries_raw.iter())
        {
            for spec in original_bin
                .field_specs
                .iter()
                .filter(|spec| spec.hash != H_INITIAL_ANGLE)
            {
                let offset = spec.entry_offset as usize;
                assert_eq!(
                    &before_row[offset..offset + 4],
                    &after_row[offset..offset + 4]
                );
            }
        }
    }

    #[test]
    fn bulletparam_data_level_crud_keeps_command_layout_for_both_samples() {
        run_data_level_crud_checks(SAMPLE_PATH, SAMPLE_OUT_PATH);
        run_data_level_crud_checks(SHIFTED_SAMPLE_PATH, SHIFTED_OUT_PATH);
    }
}
