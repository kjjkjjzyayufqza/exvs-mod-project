use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

use serde_json::{json, Map as JsonMap, Value};

use crate::format::obf_string::{
    obf_decode_to_string, obf_encode_from_string, read_null_terminated,
};
use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};
use crate::format::param_entry_schema::{
    entry_row_matches_command_map, hash_and_kind_for_camel_key, is_hash_in_pool,
    min_entry_data_size_for_specs, parse_commands_map_from_entry_row, raw_u32_to_json_for_kind,
    snake_to_camel, validate_file_specs_kind_match_pool, ParamCommandPool, KIND_I32, KIND_U32,
};

/// Kind 7 = absolute file offset to obfuscated null-terminated string in trailing pool.
const KIND_STRING: u32 = 7;

pub const SPEEDPARAM_COMMAND_POOL: ParamCommandPool = &[
    (0x06D1922D, 2, "walk_speed_forward"),
    (0x086B475D, 2, "step_turn_mid_speed_threshold"),
    (0x0B6480D5, 2, "reserved_008"), // [D:50] constant; no MSC reader in the 1827-file corpus
    (0x0B9EBECE, 2, "decaying_move_magnitude_initial"), // [V:func_471] seeds global507; decays by 0x9297EF74, clamped at 0
    (0x0CF37AD7, 2, "alternate_free_flight_speed_delta"),
    (0x0D5BB2EF, 2, "reserved_014"), // [D:250,303] no MSC reader in the corpus
    (0x0E682BA8, 2, "air_step_speed_terminal"),
    (0x11FFDDB4, 2, "boost_ascent_vertical_speed_initial"),
    (0x17A9D82D, 2, "boost_ascent_horizontal_speed_delta"),
    (0x18895A55, 2, "transform_roll_neutral_retention"),
    (0x29AA8A04, 2, "reserved_028"), // [D:-2] constant; no MSC reader
    (0x2C76D0A7, 2, "reserved_02c"), // [D:7] constant; no MSC reader
    (0x2D28CC4B, 2, "transform_roll_response"),
    (0x2DF7AF95, 2, "boost_dash_loop_timer"),
    (0x2EAE942B, 2, "reserved_038"), // [D:260,312] no MSC reader in the corpus
    (0x32FD1EDC, 2, "boost_dash_yaw_response"),
    (0x37D1D056, 2, "air_step_speed_delta"),
    (0x3BF9E21E, 2, "max_ground_speed"),
    (0x4031CB84, 2, "ground_step_secondary_timer"),
    (0x41DABEC5, 2, "ground_step_speed_terminal"),
    (0x459455EA, 2, "transform_forward_speed_terminal"),
    (0x4D4B65EA, 2, "transform_roll_target_magnitude"),
    (0x4D601E55, 2, "step_turn_high_speed_adjustment"),
    (0x4F705BAD, 2, "air_step_primary_timer"),
    (0x5481CCF4, 2, "boost_dash_speed_terminal"),
    (0x56C51E87, 2, "reserved_064"), // [D:92] constant; no MSC reader
    (0x58313EF7, 2, "ground_walk_speed_delta"),
    (0x5E8CAF43, 2, "transform_forward_speed_initial"),
    (0x5EF705B7, 2, "boost_ascent_yaw_response"),
    (0x607C25BC, 2, "boost_ascent_vertical_speed_terminal"),
    (0x6C640897, 2, "boost_dash_speed_delta"),
    (0x6F6F1BF6, 2, "transform_yaw_response"),
    (0x7242066A, 2, "free_flight_magnitude_floor"), // [V:func_467,func_469] global509 floor and re-seed threshold
    (0x737D64F4, 2, "air_step_secondary_timer"),
    (0x77749DD2, 2, "uniform_axis_motion_retention_ramp_end"), // [V:func_300 -> sys_46(3,4,V,V,V)] percent ramp end; larger value = less damping, so the former decay name had inverted polarity
    (0x7BF44A41, 2, "alternate_free_flight_speed_initial"),
    (0x7C2572A1, 2, "ground_walk_entry_turn_time_base"),
    (0x7C3CF4DD, 2, "ground_step_primary_timer"),
    (0x7CD3A712, 2, "boost_consumption_base"),
    (0x7D79F6FA, 2, "step_turn_high_speed_threshold"),
    (0x7E5878A3, 2, "ground_walk_speed_initial"),
    (0x8173DA19, 2, "reserved_0a4"), // [D:4] constant; no MSC reader
    (0x84043A2D, 2, "boost_dash_entry_turn_timer"),
    (0x8D0A9843, 2, "ground_step_speed_delta"),
    (0x8EDC8D6E, 2, "walk_stop_motion_retention"),
    (0x9297EF74, 2, "decaying_move_magnitude_delta"), // [V:func_471] per-update addend to the 0x0B9EBECE seed
    (0x95FA2B6D, 2, "free_flight_magnitude_bound"), // [V:func_469,func_1074] dual role: re-seed value in one handler, floor in another
    (0x97BE8DFC, 2, "ground_walk_entry_turn_time_angle_scale"),
    (0x9A378388, 2, "guard_recovery_frame"),
    (0x9EAA4E96, 2, "ground_walk_entry_speed"),
    (0x9FD06227, 2, "transform_pitch_pose_scale"),
    (0xA49287B9, 2, "boost_dash_speed_initial"),
    (0xA55D6C5E, 2, "vertical_axis_motion_retention"), // [V:func_302] sys_46(3,4,0x64,V,0x64) percent ramp end
    (0xA7CBBC07, 2, "reserved_0d4"), // [D:35] constant; no MSC reader
    (0xB20B67C9, 2, "air_boost_efficiency"),
    (0xBC0127E1, 2, "vertical_axis_motion_retention_base"), // [V:sys_46(0x3,0x4,...)] y-axis movement-scale percent; no gauge or guard arithmetic anywhere
    (0xC6157381, 2, "air_step_speed_initial"),
    (0xC6BBC347, 2, "boost_ascent_turn_time_angle_scale"),
    (0xCD5DF17C, 2, "boost_ascent_horizontal_speed_initial"),
    (0xCF452D59, 2, "ground_walk_yaw_response"),
    (0xD68023A4, 2, "residual_air_drift_speed_cap"),
    (0xDD7720EB, 2, "uniform_axis_motion_retention"), // [V:func_300] sys_46(3,4,V,V,V); [D:92] is the retained percent, so the former decay-rate name had inverted polarity
    (0xDE1EF15A, 2, "residual_air_drift_speed_delta"),
    (0xE2FD1BFB, 2, "air_deceleration"),
    (0xE590DFE2, 2, "free_flight_vertical_magnitude"), // [V:sys_46 magnitude argument and summand] never equality-tested, so the former count name is unsupported
    // Kind 7: entry stores absolute file offset into trailing obfuscated C-string pool.
    // Key spelling deliberately differs from characterparam.rs: speedparam JSON
    // publishes the DECODED string under this key, while characterparam publishes
    // the raw offset under `action_label_offset`. The names describe what each pool
    // emits, so harmonising them would make one of the two misleading. The guard in
    // tools/check_param_name_evidence.py accepts either spelling for these hashes.
    (0xE6213731, 7, "action_label"),
    (0xEC580BCC, 2, "step_turn_mid_speed_adjustment"),
    (0xF3B9AD85, 2, "transform_pitch_response"),
    (0xF3C4CAE9, 7, "resource_label"),
    (0xF44C9D4E, 2, "boost_ascent_horizontal_speed_terminal"),
    (0xF559DCF1, 2, "ground_step_speed_initial"),
    (0xF8B9B46E, 2, "transform_pitch_neutral_retention"),
    (0xFEC6069F, 2, "ground_walk_speed_terminal"),
    (0xFF7A9C8B, 2, "transform_forward_speed_delta"),
];

/// Input-only compatibility aliases for names published before the MSC consumer audit.
/// Serialization always emits the evidence-based canonical key from the command pool.
const SPEEDPARAM_LEGACY_KEY_ALIASES: &[(&str, u32)] = &[
    ("boostRecoveryDelayFrame", 0x0CF37AD7),
    ("airSteerLimit", 0x7BF44A41),
    ("walkSpeedBase", 0x086B475D),
    ("groundRunSpeed", 0x0E682BA8),
    ("boostDashInitialSpeed", 0x11FFDDB4),
    ("stepDistance", 0x17A9D82D),
    ("jumpInitialVelocity", 0x18895A55),
    ("airDashStartupFrame", 0x2D28CC4B),
    ("stepStartupFrame", 0x2DF7AF95),
    ("dashCancelType", 0x32FD1EDC),
    ("fallGravity", 0x37D1D056),
    ("boostDashStartupFrame", 0x4031CB84),
    ("boostDashRecoveryFrame", 0x41DABEC5),
    ("landingRecoveryFrame", 0x459455EA),
    ("airBrakeSpeed", 0x4D4B65EA),
    ("stepSpeed", 0x4D601E55),
    ("stepRecoveryFrame", 0x4F705BAD),
    ("boostDashDistance", 0x5481CCF4),
    ("stepType", 0x58313EF7),
    ("airDashDurationFrame", 0x5E8CAF43),
    ("boostDashType", 0x5EF705B7),
    ("airSpeedBase", 0x607C25BC),
    ("fallSpeed", 0x6C640897),
    ("guardMoveSpeed", 0x6F6F1BF6),
    ("airSpeedMax", 0x737D64F4),
    ("rotationSpeed", 0x7C2572A1),
    ("gaugeRecoveryRate", 0x7C3CF4DD),
    ("boostDashMaxSpeed", 0x7D79F6FA),
    ("turningSpeed", 0x7E5878A3),
    ("fallType", 0x84043A2D),
    ("aerialCorrection", 0x8D0A9843),
    ("airEfficiency", 0x8EDC8D6E),
    ("stepCancelFrame", 0x97BE8DFC),
    ("verticalMoveSpeed", 0x9EAA4E96),
    ("boostStartupFrame", 0x9FD06227),
    ("boostDashDurationFrame", 0xA49287B9),
    ("airDashSpeed", 0xC6157381),
    ("fallSpeedRate", 0xC6BBC347),
    ("airDashType", 0xCD5DF17C),
    ("guardStepType", 0xCF452D59),
    ("dashRange", 0xD68023A4),
    ("boostConsumptionType", 0xDE1EF15A),
    ("turnRate", 0xEC580BCC),
    ("airSteerSpeed", 0xF3B9AD85),
    ("boostEfficiencyAir", 0xF44C9D4E),
    ("boostExtensionRate", 0xF559DCF1),
    ("boostCapRate", 0xF8B9B46E),
    ("boostDashDistanceMax", 0xFEC6069F),
    ("gravityAirModifier", 0xFF7A9C8B),
    // Added by the 2026-07-25 mechanical corpus audit. Each of these canonical
    // names was contradicted by the arithmetic at its own call sites, or had no
    // call site anywhere in the 1827-file MSC corpus. Evidence:
    // docs/speedparam-msc-consumer-evidence.md and docs/param-research/.
    ("walkSpeedBackward", 0x0B6480D5),
    ("boostGaugeCapacity", 0x0B9EBECE),
    ("boostRecoverySpeed", 0x0D5BB2EF),
    ("gravityModifier", 0x29AA8A04),
    ("movementClass", 0x2C76D0A7),
    ("boostDashSustainedSpeed", 0x2EAE942B),
    ("airDashEndSpeed", 0x56C51E87),
    ("airDashDistance", 0x7242066A),
    ("jumpType", 0x8173DA19),
    ("airGravity", 0x9297EF74),
    ("airDashMaxDistance", 0x95FA2B6D),
    ("dashEndSpeed", 0xA55D6C5E),
    ("fixedStepDistance", 0xA7CBBC07),
    ("speedDecayRate", 0xDD7720EB),
    // characterparam spells these two `*_label_offset`; accept both so a JSON file
    // written against either pool loads here.
    ("actionLabelOffset", 0xE6213731),
    ("resourceLabelOffset", 0xF3C4CAE9),
    // Added by the 2026-07-25 WP6 re-grade against the regenerated cross-function
    // evidence. See docs/param-research/2026-07-25-speedparam-regrade-open14-*.md.
    ("speedDecayBase", 0x77749DD2),
    ("guardSpeedRate", 0xBC0127E1),
    ("boostDashCount", 0xE590DFE2),
];

fn hash_and_kind_for_speed_key(key: &str) -> Option<(u32, u32)> {
    hash_and_kind_for_camel_key(SPEEDPARAM_COMMAND_POOL, key).or_else(|| {
        let hash = SPEEDPARAM_LEGACY_KEY_ALIASES
            .iter()
            .find_map(|(legacy_key, hash)| (*legacy_key == key).then_some(*hash))?;
        SPEEDPARAM_COMMAND_POOL
            .iter()
            .find_map(|(pool_hash, kind, _)| (*pool_hash == hash).then_some((hash, *kind)))
    })
}

fn pool_string_hashes() -> Vec<u32> {
    SPEEDPARAM_COMMAND_POOL
        .iter()
        .filter(|(_, k, _)| *k == KIND_STRING)
        .map(|(h, _, _)| *h)
        .collect()
}

pub fn speedparam_entry_to_json_value(entry: &SpeedParamEntry) -> Value {
    let mut map = JsonMap::new();
    map.insert("entryId".to_string(), json!(entry.entry_id));

    for &(h, kind, name) in SPEEDPARAM_COMMAND_POOL {
        let key = snake_to_camel(name);
        if kind == KIND_STRING {
            if let Some(s) = entry.strings.get(&h) {
                map.insert(key, json!(s));
            } else if let Some(&raw) = entry.commands.get(&h) {
                // Fallback: still expose absolute offset if decode failed.
                map.insert(key.clone(), json!(raw));
                map.insert(format!("{key}Offset"), json!(raw));
            }
        } else if let Some(&raw) = entry.commands.get(&h) {
            map.insert(key, raw_u32_to_json_for_kind(kind, raw));
        }
    }

    let mut extra = JsonMap::new();
    for (&h, &v) in &entry.commands {
        if !is_hash_in_pool(SPEEDPARAM_COMMAND_POOL, h) {
            extra.insert(format!("{h}"), json!(v));
        }
    }
    if !extra.is_empty() {
        map.insert("extraCommands".to_string(), Value::Object(extra));
    }

    Value::Object(map)
}

pub fn speedparam_entry_from_json_value(v: &Value) -> Result<SpeedParamEntry, String> {
    let obj = v
        .as_object()
        .ok_or("speedparam entry: expected JSON object")?;
    let entry_id: u32 = obj
        .get("entryId")
        .and_then(|e| e.as_u64().or_else(|| e.as_i64().map(|i| i as u64)))
        .map(|n| n as u32)
        .unwrap_or(0);

    let mut commands: HashMap<u32, u32> = HashMap::new();
    let mut strings: HashMap<u32, String> = HashMap::new();

    for (k, val) in obj {
        if k == "entryId" {
            continue;
        }
        if k == "extraCommands" {
            if let Some(ex) = val.as_object() {
                for (hash_str, v_ex) in ex {
                    let h: u32 = if let Some(rest) = hash_str
                        .strip_prefix("0x")
                        .or_else(|| hash_str.strip_prefix("0X"))
                    {
                        u32::from_str_radix(rest, 16)
                    } else {
                        hash_str.parse()
                    }
                    .map_err(|e| e.to_string())?;
                    let raw = v_ex
                        .as_u64()
                        .or_else(|| v_ex.as_i64().map(|i| i as u64))
                        .map(|u| u as u32)
                        .ok_or_else(|| format!("extraCommands.{hash_str}: expected u32"))?;
                    commands.insert(h, raw);
                }
            }
            continue;
        }
        // Accept both actionLabel / actionLabelOffset style keys for kind-7 fields.
        let lookup_key = k
            .strip_suffix("Offset")
            .filter(|base| {
                hash_and_kind_for_speed_key(base).is_some_and(|(_, kind)| kind == KIND_STRING)
            })
            .unwrap_or(k.as_str());

        if let Some((h, knd)) = hash_and_kind_for_speed_key(lookup_key) {
            if knd == KIND_STRING {
                if let Some(s) = val.as_str() {
                    strings.insert(h, s.to_string());
                } else if let Some(n) = val.as_u64().or_else(|| val.as_i64().map(|i| i as u64)) {
                    // Numeric value keeps absolute offset only (no string rewrite).
                    commands.insert(h, n as u32);
                }
            } else {
                let raw = match knd {
                    KIND_U32 => val
                        .as_u64()
                        .or_else(|| val.as_i64().map(|i| i as u64))
                        .map(|u| u as u32)
                        .ok_or_else(|| format!("{k}: expected u32"))?,
                    KIND_I32 => {
                        let x = val.as_i64().ok_or_else(|| format!("{k}: expected i32"))?;
                        i32::try_from(x).map_err(|_| format!("{k}: i32 out of range"))? as u32
                    }
                    5 => {
                        let f = val.as_f64().ok_or_else(|| format!("{k}: expected f32"))? as f32;
                        f32::to_bits(f)
                    }
                    _ => val
                        .as_u64()
                        .or_else(|| val.as_i64().map(|i| i as u64))
                        .map(|u| u as u32)
                        .ok_or_else(|| format!("{k}: expected number"))?,
                };
                commands.insert(h, raw);
            }
        }
    }

    Ok(SpeedParamEntry {
        entry_id,
        commands,
        strings,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct SpeedParamEntry {
    pub entry_id: u32,
    /// Non-string fields and (optionally) absolute offsets for kind-7 fields.
    pub commands: HashMap<u32, u32>,
    /// Decoded kind-7 label strings (action_label / resource_label).
    pub strings: HashMap<u32, String>,
}

impl Serialize for SpeedParamEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        speedparam_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for SpeedParamEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        speedparam_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<SpeedParamEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered(SPEEDPARAM_COMMAND_POOL)
}

fn expected_field_specs_ordered(pool: ParamCommandPool) -> Vec<ParamFieldSpec> {
    let mut entry_offset = 0u32;
    pool.iter()
        .map(|(hash, kind, _)| {
            let spec = ParamFieldSpec {
                hash: *hash,
                entry_offset,
                flags: 0,
                kind: *kind,
            };
            entry_offset += if *kind == KIND_STRING { 8 } else { 4 };
            spec
        })
        .collect()
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(SPEEDPARAM_COMMAND_POOL, field_specs)
}

fn resolve_entry_strings(
    commands: &HashMap<u32, u32>,
    full_file_data: &[u8],
    string_hashes: &[u32],
) -> HashMap<u32, String> {
    let mut strings = HashMap::new();
    for &h in string_hashes {
        if let Some(&offset) = commands.get(&h) {
            let raw = read_null_terminated(full_file_data, offset as usize);
            if !raw.is_empty() {
                let decoded = obf_decode_to_string(raw);
                if !decoded.is_empty() {
                    strings.insert(h, decoded);
                }
            }
        }
    }
    strings
}

fn entries_base_offset(field_specs_len: usize, entry_count: usize) -> usize {
    0x20 + field_specs_len * 4 + field_specs_len * 12 + entry_count * 4
}

fn string_pool_start(field_specs_len: usize, entry_count: usize, entry_size: usize) -> usize {
    entries_base_offset(field_specs_len, entry_count) + entry_count * entry_size
}

/// True when decoded strings already match trailing pool at stored offsets (no rewrite needed).
fn strings_match_existing_pool(b: &SpeedParamData, field_specs: &[ParamFieldSpec]) -> bool {
    let entry_size = b.header.entry_size as usize;
    let pool_start = string_pool_start(field_specs.len(), b.entries.len(), entry_size);
    let string_hashes = pool_string_hashes();

    // Rebuild a temporary full view only for string reads: zeros + trailing at pool_start.
    let mut full = vec![0u8; pool_start];
    full.extend_from_slice(&b.trailing_data);

    for entry in &b.entries {
        for &h in &string_hashes {
            let Some(want) = entry.strings.get(&h) else {
                continue;
            };
            let Some(&off) = entry.commands.get(&h) else {
                // String without offset cannot keep old trailing.
                return false;
            };
            if (off as usize) >= full.len() {
                return false;
            }
            let raw = read_null_terminated(&full, off as usize);
            let got = obf_decode_to_string(raw);
            if got != *want {
                return false;
            }
        }
    }
    true
}

pub fn parse_speedparam(data: &[u8]) -> Result<SpeedParamData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let string_hashes = pool_string_hashes();
    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        let commands = parse_commands_map_from_entry_row(raw, &file.field_specs);
        let strings = resolve_entry_strings(&commands, data, &string_hashes);
        entries.push(SpeedParamEntry {
            entry_id: id,
            commands,
            strings,
        });
    }

    Ok(SpeedParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

fn build_without_string_rewrite(
    b: &SpeedParamData,
    field_specs: &[ParamFieldSpec],
    entry_size: usize,
) -> Result<Vec<u8>, String> {
    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for (entry_index, entry) in b.entries.iter().enumerate() {
        if entry_index < b.source_entries_raw.len()
            && b.source_entries_raw[entry_index].len() == entry_size
        {
            let r = &b.source_entries_raw[entry_index];
            if entry_row_matches_command_map(&entry.commands, r, field_specs) {
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

        for spec in field_specs {
            let o = spec.entry_offset as usize;
            if o + 4 > raw.len() {
                return Err("speedparam entry field offset out of range for entry_size".to_string());
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
        field_specs: field_specs.to_vec(),
        entry_ids: b.entries.iter().map(|entry| entry.entry_id).collect(),
        entries_raw,
        trailing_data: b.trailing_data.clone(),
    };
    build_param_binary(&file)
}

fn build_with_string_rewrite(
    b: &SpeedParamData,
    field_specs: &[ParamFieldSpec],
    entry_size: usize,
) -> Result<Vec<u8>, String> {
    let string_hashes = pool_string_hashes();
    let pool_start = string_pool_start(field_specs.len(), b.entries.len(), entry_size);

    let mut string_pool: Vec<u8> = Vec::new();
    let mut entry_string_offsets: Vec<HashMap<u32, u32>> = Vec::with_capacity(b.entries.len());

    for entry in &b.entries {
        let mut offsets = HashMap::new();
        for &h in &string_hashes {
            if let Some(s) = entry.strings.get(&h) {
                let abs_offset = (pool_start + string_pool.len()) as u32;
                offsets.insert(h, abs_offset);
                string_pool.extend_from_slice(&obf_encode_from_string(s));
            } else if let Some(&raw_offset) = entry.commands.get(&h) {
                // Keep prior absolute offset only when it still points into old trailing;
                // otherwise write empty string.
                let old_pool_start = string_pool_start(
                    field_specs.len(),
                    b.source_entries_raw.len().max(1),
                    entry_size,
                );
                if (raw_offset as usize) >= old_pool_start
                    && !b.trailing_data.is_empty()
                    && (raw_offset as usize) < old_pool_start + b.trailing_data.len()
                {
                    // Copy original encoded bytes into new pool to preserve exact encoding.
                    let rel = (raw_offset as usize) - old_pool_start;
                    let slice = read_null_terminated(&b.trailing_data, rel);
                    let abs_offset = (pool_start + string_pool.len()) as u32;
                    offsets.insert(h, abs_offset);
                    string_pool.extend_from_slice(slice);
                    if slice.last().copied() != Some(0) {
                        string_pool.push(0);
                    }
                } else {
                    let abs_offset = (pool_start + string_pool.len()) as u32;
                    offsets.insert(h, abs_offset);
                    string_pool.push(0);
                }
            }
        }
        entry_string_offsets.push(offsets);
    }

    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for (entry_index, entry) in b.entries.iter().enumerate() {
        let mut raw = if entry_index < b.source_entries_raw.len()
            && b.source_entries_raw[entry_index].len() == entry_size
        {
            b.source_entries_raw[entry_index].clone()
        } else {
            vec![0u8; entry_size]
        };

        for spec in field_specs {
            let o = spec.entry_offset as usize;
            if o + 4 > raw.len() {
                return Err("speedparam entry field offset out of range for entry_size".to_string());
            }
            if spec.kind == KIND_STRING {
                if let Some(&abs_off) = entry_string_offsets[entry_index].get(&spec.hash) {
                    raw[o..o + 4].copy_from_slice(&abs_off.to_le_bytes());
                }
            } else if let Some(v) = entry.commands.get(&spec.hash) {
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
        field_specs: field_specs.to_vec(),
        entry_ids: b.entries.iter().map(|entry| entry.entry_id).collect(),
        entries_raw,
        trailing_data: string_pool,
    };
    build_param_binary(&file)
}

pub fn build_speedparam(b: &SpeedParamData) -> Result<Vec<u8>, String> {
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

    let any_strings = b.entries.iter().any(|e| !e.strings.is_empty());
    if any_strings && !strings_match_existing_pool(b, &field_specs) {
        build_with_string_rewrite(b, &field_specs, entry_size)
    } else {
        build_without_string_rewrite(b, &field_specs, entry_size)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\speedparam.bin";
    const GYAN_PATH: &str =
        "e:\\XB\\mod\\041cpm\\001gundam_005gyan00_001_N2_rocket_mod\\speedparam.bin";
    const ALTERNATE_FREE_FLIGHT_PATHS: [&str; 3] = [
        "E:\\XB\\解包\\com\\file\\041cpm\\0x37F04F98\\speedparam.bin",
        "E:\\XB\\解包\\com\\file\\041cpm\\0x62419441\\speedparam.bin",
        "E:\\XB\\解包\\com\\file\\041cpm\\0x682678AF\\speedparam.bin",
    ];

    #[test]
    fn speedparam_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read speedparam sample file");

        let parsed = parse_speedparam(&source).expect("failed to parse speedparam sample file");
        let rebuilt = build_speedparam(&parsed).expect("failed to rebuild speedparam sample file");
        assert_eq!(rebuilt, source);

        assert!(
            !parsed.entries.is_empty(),
            "speedparam sample has no entries"
        );

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
            build_speedparam(&with_added).expect("failed to build speedparam after add");
        let added_parsed =
            parse_speedparam(&added_bytes).expect("failed to parse speedparam after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(
            added_parsed.entries.last().map(|entry| entry.entry_id),
            Some(next_id)
        );

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_speedparam(&with_updated).expect("failed to build speedparam after update");
        let updated_parsed =
            parse_speedparam(&updated_bytes).expect("failed to parse speedparam after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_speedparam(&with_deleted).expect("failed to build speedparam after delete");
        let deleted_parsed =
            parse_speedparam(&deleted_bytes).expect("failed to parse speedparam after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }

    #[test]
    fn speedparam_decodes_resource_and_action_labels() {
        let source = std::fs::read(GYAN_PATH).expect("failed to read gyan speedparam");
        let parsed = parse_speedparam(&source).expect("parse gyan speedparam");
        assert_eq!(parsed.entries.len(), 2);

        let normal = parsed
            .entries
            .iter()
            .find(|e| e.entry_id == 0xC2B19D12)
            .expect("normal speed row");
        assert_eq!(
            normal.strings.get(&0xE6213731).map(String::as_str),
            Some("SKL_MOVE")
        );
        assert_eq!(
            normal.strings.get(&0xF3C4CAE9).map(String::as_str),
            Some("CHR_001GUNDAM_005GYAN00_001")
        );

        let special = parsed
            .entries
            .iter()
            .find(|e| e.entry_id == 0xB7027DBE)
            .expect("special speed row");
        assert_eq!(
            special.strings.get(&0xE6213731).map(String::as_str),
            Some("SKL_MOVE_SHIELD")
        );
        assert_eq!(
            special.strings.get(&0xF3C4CAE9).map(String::as_str),
            Some("CHR_001GUNDAM_005GYAN00_001")
        );

        // JSON exposes decoded strings (not bare offsets).
        let j = speedparam_entry_to_json_value(normal);
        assert_eq!(j["actionLabel"], json!("SKL_MOVE"));
        assert_eq!(j["resourceLabel"], json!("CHR_001GUNDAM_005GYAN00_001"));

        // Edit string and rebuild remains parseable.
        let mut edited = parsed.clone();
        edited.entries[0]
            .strings
            .insert(0xF3C4CAE9, "CHR_TEST_EDIT".to_string());
        let bytes = build_speedparam(&edited).expect("rebuild after label edit");
        let reparsed = parse_speedparam(&bytes).expect("reparse after label edit");
        assert_eq!(
            reparsed.entries[0]
                .strings
                .get(&0xF3C4CAE9)
                .map(String::as_str),
            Some("CHR_TEST_EDIT")
        );
    }

    #[test]
    fn default_speedparam_specs_preserve_kind_7_padding() {
        let specs = expected_field_specs();
        let offset_for = |hash| {
            specs
                .iter()
                .find(|spec| spec.hash == hash)
                .map(|spec| spec.entry_offset)
                .expect("field spec")
        };

        assert_eq!(offset_for(0xE6213731), 0x104);
        assert_eq!(offset_for(0xEC580BCC), 0x10C);
        assert_eq!(offset_for(0xF3B9AD85), 0x110);
        assert_eq!(offset_for(0xF3C4CAE9), 0x114);
        assert_eq!(offset_for(0xF44C9D4E), 0x11C);
        assert_eq!(offset_for(0xFF7A9C8B), 0x12C);
        assert_eq!(min_entry_data_size_for_specs(&specs), 0x130);
    }

    #[test]
    fn speedparam_uses_evidence_based_key_and_accepts_legacy_alias() {
        let canonical = speedparam_entry_from_json_value(&json!({
            "entryId": 1,
            "boostAscentVerticalSpeedInitial": 42
        }))
        .expect("canonical speed key");
        assert_eq!(canonical.commands.get(&0x11FFDDB4), Some(&42));

        let legacy = speedparam_entry_from_json_value(&json!({
            "entryId": 1,
            "boostDashInitialSpeed": 42
        }))
        .expect("legacy speed key");
        assert_eq!(legacy.commands.get(&0x11FFDDB4), Some(&42));

        let output = speedparam_entry_to_json_value(&canonical);
        assert_eq!(output["boostAscentVerticalSpeedInitial"], json!(42));
        assert!(output.get("boostDashInitialSpeed").is_none());
    }

    #[test]
    fn alternate_free_flight_curve_matches_real_ob_rows_and_legacy_aliases() {
        for path in ALTERNATE_FREE_FLIGHT_PATHS {
            let source = std::fs::read(path).expect("read alternate free-flight speedparam");
            let parsed = parse_speedparam(&source).expect("parse alternate free-flight speedparam");
            let rebuilt =
                build_speedparam(&parsed).expect("rebuild alternate free-flight speedparam");
            assert_eq!(rebuilt, source, "byte-exact rebuild for {path}");

            let row = parsed
                .entries
                .iter()
                .find(|entry| {
                    entry.strings.get(&0xE6213731).map(String::as_str) == Some("SKL_MOVE")
                })
                .expect("SKL_MOVE row");
            assert_eq!(
                row.commands.get(&0x7BF44A41),
                Some(&30),
                "initial for {path}"
            );
            assert_eq!(
                row.commands.get(&0x0CF37AD7),
                Some(&320),
                "delta for {path}"
            );
            assert_eq!(
                row.commands.get(&0x95FA2B6D),
                Some(&350),
                "terminal for {path}"
            );
            assert_eq!(
                row.commands[&0x7BF44A41] + row.commands[&0x0CF37AD7],
                row.commands[&0x95FA2B6D],
                "one-step curve closure for {path}"
            );

            let json = speedparam_entry_to_json_value(row);
            assert_eq!(json["alternateFreeFlightSpeedInitial"], json!(30));
            assert_eq!(json["alternateFreeFlightSpeedDelta"], json!(320));
            assert!(json.get("airSteerLimit").is_none());
            assert!(json.get("boostRecoveryDelayFrame").is_none());
        }

        let legacy = speedparam_entry_from_json_value(&json!({
            "entryId": 1,
            "airSteerLimit": 30,
            "boostRecoveryDelayFrame": 320
        }))
        .expect("legacy alternate free-flight aliases");
        assert_eq!(legacy.commands.get(&0x7BF44A41), Some(&30));
        assert_eq!(legacy.commands.get(&0x0CF37AD7), Some(&320));
    }

    #[test]
    fn every_speedparam_legacy_key_alias_remains_readable() {
        for &(legacy_key, hash) in SPEEDPARAM_LEGACY_KEY_ALIASES {
            let mut obj = JsonMap::new();
            obj.insert("entryId".to_string(), json!(1));
            obj.insert(legacy_key.to_string(), json!(42));

            let parsed = speedparam_entry_from_json_value(&Value::Object(obj))
                .unwrap_or_else(|error| panic!("legacy key {legacy_key}: {error}"));
            assert_eq!(
                parsed.commands.get(&hash),
                Some(&42),
                "legacy key {legacy_key}"
            );
        }
    }
}
