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

// Please keep comments for analysis.
//
// Data-verified against 432 arms_param files (1431 entries) and traced through
// the OB v27 CArmsParamAccessor -> CArmsController native load/reset path.
// Kind-7 label names intentionally match speedparam JSON (`actionLabel` /
// `resourceLabel` decoded strings). Offsets remain on-disk; JSON prefers strings.
// AI decision (2026-08-01): retain semantic names only where a native consumer
// proves the role. The previous combat/action labels were correlations, not field
// identities. Old JSON keys remain accepted through ARMSPARAM_LEGACY_KEY_ALIASES.
pub const ARMSPARAM_COMMAND_POOL: ParamCommandPool = &[
    (0x020A35DD, 1, "field_020a35dd"),
    (0x02D35F32, 1, "field_02d35f32"),
    (0x0496C136, 1, "field_0496c136"),
    (0x04A2CFD6, 2, "reload_duration_group_b_mode_4"),
    (0x103171AE, 2, "reload_duration_group_a_mode_2"),
    (0x11DEE0C8, 1, "field_11dee0c8"),
    (0x1348893F, 1, "field_1348893f"),
    (0x1E8E41EF, 1, "field_1e8e41ef"),
    (0x31427CC3, 2, "charge_accumulate_duration_default_frame"),
    (0x3A1D6254, 5, "charge_decay_duration_mode_4_scale"),
    (0x3BC65821, 5, "charge_accumulate_duration_mode_1_scale"),
    (0x3CAB9C38, 5, "charge_accumulate_duration_mode_5_scale"),
    (0x4961274C, 2, "ammo_count"),
    (0x4A7796DB, 5, "charge_decay_duration_mode_1_scale"),
    (0x4BACACAE, 5, "charge_accumulate_duration_mode_4_scale"),
    (0x4C527468, 2, "charge_stage_count"),
    (0x4C84F7C0, 2, "reload_duration_group_b_default"),
    (0x4D1A52C2, 5, "charge_decay_duration_mode_5_scale"),
    (0x4E692ACD, 2, "initial_ammo_count"),
    (0x596FC1C3, 1, "charge_input_flags"),
    (0x5B072B6C, 1, "field_5b072b6c"),
    (0x67364138, 2, "reload_duration_group_a_mode_3"),
    (0x73A5FF40, 2, "reload_duration_group_b_mode_5"),
    (0x74C83B59, 2, "reload_duration_group_b_mode_1"),
    (0x89382014, 2, "reload_duration_group_a_mode_1"),
    (0x8E55E40D, 2, "reload_duration_group_a_mode_5"),
    (0x9AC65A75, 2, "reload_duration_group_b_mode_3"),
    (0xA06CAAD5, 2, "field_a06caad5"),
    (0xA2CF099B, 5, "charge_accumulate_duration_mode_2_scale"),
    (0xA353F222, 2, "reload_aux_group_b"),
    (0xA479F7F7, 5, "charge_decay_duration_mode_3_scale"),
    (0xA502BCF2, 2, "reload_duration_group_a_default"),
    (0xA635CFC2, 2, "charge_decay_duration_default_frame"),
    (0xAB9AEF6C, 2, "slot_index"),
    (0xABC33F14, 2, "reload_aux_group_a"),
    (0xAC243293, 1, "reload_behavior_type"),
    (0xB669A42A, 1, "behavior_flags"),
    (0xB686E88C, 1, "reload_group_b_enabled"),
    (0xBB93D195, 1, "field_bb93d195"),
    (0xD37EC761, 5, "charge_decay_duration_mode_2_scale"),
    (0xD5C8390D, 5, "charge_accumulate_duration_mode_3_scale"),
    // Decoded label strings under actionLabel / resourceLabel (same as speedparam).
    (0xE6213731, 7, "action_label"),
    (0xEDC16AE3, 2, "reload_duration_group_b_mode_2"),
    (0xEF3F41B3, 1, "field_ef3f41b3"),
    (0xF3C4CAE9, 7, "resource_label"),
    (0xF8AEEC77, 2, "charge_accumulate_duration_base_frame"),
    (0xF8E59F33, 2, "charge_decay_duration_base_frame"),
    (0xF952D49B, 2, "reload_duration_group_a_mode_4"),
];

/// Legacy JSON keys still accepted on load. These names are compatibility-only
/// and must not be treated as semantic evidence.
const ARMSPARAM_LEGACY_KEY_ALIASES: &[(&str, u32)] = &[
    ("isEnabled", 0x020A35DD),
    ("unk04Reserved", 0x02D35F32),
    ("isContinuousFire", 0x0496C136),
    ("reloadStartFrame", 0x04A2CFD6),
    ("reloadTimeTotal", 0x103171AE),
    ("reloadType", 0x11DEE0C8),
    ("chargeWeaponType", 0x1348893F),
    ("canMoveWhileFiring", 0x1E8E41EF),
    ("homingAngle", 0x31427CC3),
    ("inductionRate", 0x3A1D6254),
    ("homingStartRate", 0x3BC65821),
    ("homingEndRate", 0x3CAB9C38),
    ("damageCorrectionRate", 0x4A7796DB),
    ("downCorrectionRate", 0x4BACACAE),
    ("shotType", 0x4C527468),
    ("damage", 0x4C84F7C0),
    ("stunCorrectionRate", 0x4D1A52C2),
    ("downValue", 0x4E692ACD),
    ("cancelRouteType", 0x596FC1C3),
    ("isVernier", 0x5B072B6C),
    ("cooldownFrame", 0x67364138),
    ("startupFrame", 0x73A5FF40),
    ("activeFrame", 0x74C83B59),
    ("recoveryFrame", 0x89382014),
    ("totalDurationFrame", 0x8E55E40D),
    ("landingRecoveryFrame", 0x9AC65A75),
    ("stunValue", 0xA06CAAD5),
    ("boostConsumptionRate", 0xA2CF099B),
    ("range", 0xA353F222),
    ("muzzleCorrectionRate", 0xA479F7F7),
    ("reloadPerShotFrame", 0xA502BCF2),
    ("reloadLockFrame", 0xA635CFC2),
    ("overheatFrame", 0xAB9AEF6C),
    ("chargeFrame", 0xABC33F14),
    ("guardBreakType", 0xAC243293),
    ("landingBehaviorType", 0xB669A42A),
    ("isSuperArmor", 0xB686E88C),
    ("bulletType", 0xBB93D195),
    ("trackingSpeedRate", 0xD37EC761),
    ("bulletSpeedRate", 0xD5C8390D),
    ("ammoReloadWaitFrame", 0xEDC16AE3),
    ("hitEffectType", 0xEF3F41B3),
    ("bulletCountPerShot", 0xF8AEEC77),
    ("firingIntervalFrame", 0xF8E59F33),
    ("fullChargeFrame", 0xF952D49B),
    ("actionLabelOffset", 0xE6213731),
    ("resourceLabelOffset", 0xF3C4CAE9),
    // Superseded neutral names from the first native-consumer audit.
    ("selectorValueADefault", 0x31427CC3),
    ("selectorValueAScale1", 0x3BC65821),
    ("selectorValueAScale2", 0xA2CF099B),
    ("selectorValueAScale3", 0xD5C8390D),
    ("selectorValueAScale4", 0x4BACACAE),
    ("selectorValueAScale5", 0x3CAB9C38),
    ("selectorValueABase", 0xF8AEEC77),
    ("selectorValueBDefault", 0xA635CFC2),
    ("selectorValueBScale1", 0x4A7796DB),
    ("selectorValueBScale2", 0xD37EC761),
    ("selectorValueBScale3", 0xA479F7F7),
    ("selectorValueBScale4", 0x3A1D6254),
    ("selectorValueBScale5", 0x4D1A52C2),
    ("selectorValueBBase", 0xF8E59F33),
    ("reloadType4IntervalFrame", 0x4C527468),
    ("field596fc1c3", 0x596FC1C3),
];

fn hash_and_kind_for_arms_key(key: &str) -> Option<(u32, u32)> {
    hash_and_kind_for_camel_key(ARMSPARAM_COMMAND_POOL, key).or_else(|| {
        let hash = ARMSPARAM_LEGACY_KEY_ALIASES
            .iter()
            .find_map(|(legacy_key, h)| (*legacy_key == key).then_some(*h))?;
        ARMSPARAM_COMMAND_POOL
            .iter()
            .find_map(|(pool_hash, kind, _)| (*pool_hash == hash).then_some((hash, *kind)))
    })
}

fn pool_string_hashes() -> Vec<u32> {
    ARMSPARAM_COMMAND_POOL
        .iter()
        .filter(|(_, k, _)| *k == KIND_STRING)
        .map(|(h, _, _)| *h)
        .collect()
}

pub fn armsparam_entry_to_json_value(entry: &ArmsParamEntry) -> Value {
    let mut map = JsonMap::new();
    map.insert("entryId".to_string(), json!(entry.entry_id));

    for &(h, kind, name) in ARMSPARAM_COMMAND_POOL {
        let key = snake_to_camel(name);
        if kind == KIND_STRING {
            if let Some(s) = entry.strings.get(&h) {
                map.insert(key, json!(s));
            } else if let Some(&raw) = entry.commands.get(&h) {
                // Fallback: still expose absolute offset if decode failed.
                map.insert(key, json!(raw));
            }
        } else if let Some(&raw) = entry.commands.get(&h) {
            map.insert(key, raw_u32_to_json_for_kind(kind, raw));
        }
    }

    let mut extra = JsonMap::new();
    for (&h, &v) in &entry.commands {
        if !is_hash_in_pool(ARMSPARAM_COMMAND_POOL, h) {
            extra.insert(format!("{h}"), json!(v));
        }
    }
    if !extra.is_empty() {
        map.insert("extraCommands".to_string(), Value::Object(extra));
    }

    Value::Object(map)
}

pub fn armsparam_entry_from_json_value(v: &Value) -> Result<ArmsParamEntry, String> {
    let obj = v
        .as_object()
        .ok_or("armsparam entry: expected JSON object")?;
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
        // Accept actionLabel / actionLabelOffset style keys for kind-7 fields.
        let lookup_key = k
            .strip_suffix("Offset")
            .filter(|base| {
                hash_and_kind_for_arms_key(base).is_some_and(|(_, kind)| kind == KIND_STRING)
            })
            .unwrap_or(k.as_str());

        if let Some((h, knd)) = hash_and_kind_for_arms_key(lookup_key) {
            if knd == KIND_STRING {
                if let Some(s) = val.as_str() {
                    strings.insert(h, s.to_string());
                } else if let Some(n) = val.as_u64().or_else(|| val.as_i64().map(|i| i as u64)) {
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

    Ok(ArmsParamEntry {
        entry_id,
        commands,
        strings,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct ArmsParamEntry {
    pub entry_id: u32,
    /// Non-string fields and (optionally) absolute offsets for kind-7 fields.
    pub commands: HashMap<u32, u32>,
    /// Decoded kind-7 label strings (action_label / resource_label).
    pub strings: HashMap<u32, String>,
}

impl Serialize for ArmsParamEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        armsparam_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for ArmsParamEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        armsparam_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArmsParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<ArmsParamEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered(ARMSPARAM_COMMAND_POOL)
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
    validate_file_specs_kind_match_pool(ARMSPARAM_COMMAND_POOL, field_specs)
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
fn strings_match_existing_pool(b: &ArmsParamData, field_specs: &[ParamFieldSpec]) -> bool {
    let entry_size = b.header.entry_size as usize;
    let pool_start = string_pool_start(field_specs.len(), b.entries.len(), entry_size);
    let string_hashes = pool_string_hashes();

    let mut full = vec![0u8; pool_start];
    full.extend_from_slice(&b.trailing_data);

    for entry in &b.entries {
        for &h in &string_hashes {
            let Some(want) = entry.strings.get(&h) else {
                continue;
            };
            let Some(&off) = entry.commands.get(&h) else {
                return false;
            };
            let raw = read_null_terminated(&full, off as usize);
            let got = obf_decode_to_string(raw);
            if got != *want {
                return false;
            }
        }
    }
    true
}

pub fn parse_armsparam(data: &[u8]) -> Result<ArmsParamData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let string_hashes = pool_string_hashes();
    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        let commands = parse_commands_map_from_entry_row(raw, &file.field_specs);
        let strings = resolve_entry_strings(&commands, data, &string_hashes);
        entries.push(ArmsParamEntry {
            entry_id: id,
            commands,
            strings,
        });
    }

    Ok(ArmsParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

fn build_without_string_rewrite(
    b: &ArmsParamData,
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
                return Err("armsparam entry field offset out of range for entry_size".to_string());
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
    b: &ArmsParamData,
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
                let old_pool_start = string_pool_start(
                    field_specs.len(),
                    b.source_entries_raw.len().max(1),
                    entry_size,
                );
                if (raw_offset as usize) >= old_pool_start
                    && !b.trailing_data.is_empty()
                    && (raw_offset as usize) < old_pool_start + b.trailing_data.len()
                {
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
                return Err("armsparam entry field offset out of range for entry_size".to_string());
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

pub fn build_armsparam(b: &ArmsParamData) -> Result<Vec<u8>, String> {
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

    const SAMPLE_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\armsparam.bin";

    #[test]
    fn armsparam_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read armsparam sample file");

        let parsed = parse_armsparam(&source).expect("failed to parse armsparam sample file");
        let rebuilt = build_armsparam(&parsed).expect("failed to rebuild armsparam sample file");
        assert_eq!(rebuilt, source);

        assert!(
            !parsed.entries.is_empty(),
            "armsparam sample has no entries"
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
            build_armsparam(&with_added).expect("failed to build armsparam after add");
        let added_parsed =
            parse_armsparam(&added_bytes).expect("failed to parse armsparam after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(
            added_parsed.entries.last().map(|entry| entry.entry_id),
            Some(next_id)
        );

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_armsparam(&with_updated).expect("failed to build armsparam after update");
        let updated_parsed =
            parse_armsparam(&updated_bytes).expect("failed to parse armsparam after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_armsparam(&with_deleted).expect("failed to build armsparam after delete");
        let deleted_parsed =
            parse_armsparam(&deleted_bytes).expect("failed to parse armsparam after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }

    #[test]
    fn armsparam_serializes_native_names_and_accepts_legacy_aliases() {
        let legacy = json!({
            "entryId": 0x12345678u32,
            "ammoCount": 8,
            "downValue": 0,
            "overheatFrame": 2,
            "guardBreakType": 2,
            "reloadType": 1,
            "damage": 180,
            "cancelRouteType": 1,
            "shotType": 2,
            "homingAngle": 180,
            "reloadLockFrame": 60
        });
        let entry = armsparam_entry_from_json_value(&legacy).expect("parse legacy aliases");

        assert_eq!(entry.commands.get(&0x4961274C), Some(&8));
        assert_eq!(entry.commands.get(&0x4E692ACD), Some(&0));
        assert_eq!(entry.commands.get(&0xAB9AEF6C), Some(&2));
        assert_eq!(entry.commands.get(&0xAC243293), Some(&2));
        assert_eq!(entry.commands.get(&0x11DEE0C8), Some(&1));
        assert_eq!(entry.commands.get(&0x4C84F7C0), Some(&180));
        assert_eq!(entry.commands.get(&0x596FC1C3), Some(&1));
        assert_eq!(entry.commands.get(&0x4C527468), Some(&2));
        assert_eq!(entry.commands.get(&0x31427CC3), Some(&180));
        assert_eq!(entry.commands.get(&0xA635CFC2), Some(&60));

        let canonical = armsparam_entry_to_json_value(&entry);
        assert_eq!(canonical.get("ammoCount"), Some(&json!(8)));
        assert_eq!(canonical.get("initialAmmoCount"), Some(&json!(0)));
        assert_eq!(canonical.get("slotIndex"), Some(&json!(2)));
        assert_eq!(canonical.get("reloadBehaviorType"), Some(&json!(2)));
        assert_eq!(canonical.get("field11dee0c8"), Some(&json!(1)));
        assert_eq!(canonical.get("chargeInputFlags"), Some(&json!(1)));
        assert_eq!(canonical.get("chargeStageCount"), Some(&json!(2)));
        assert_eq!(
            canonical.get("chargeAccumulateDurationDefaultFrame"),
            Some(&json!(180))
        );
        assert_eq!(
            canonical.get("chargeDecayDurationDefaultFrame"),
            Some(&json!(60))
        );
        assert_eq!(
            canonical.get("reloadDurationGroupBDefault"),
            Some(&json!(180))
        );
        assert!(canonical.get("downValue").is_none());
        assert!(canonical.get("overheatFrame").is_none());
        assert!(canonical.get("guardBreakType").is_none());
        assert!(canonical.get("damage").is_none());

        let interim = json!({
            "entryId": 1,
            "selectorValueABase": 90,
            "selectorValueAScale2": 1.5,
            "selectorValueBBase": 45,
            "selectorValueBScale2": 0.5,
            "reloadType4IntervalFrame": 3,
            "field596fc1c3": 2
        });
        let interim_entry =
            armsparam_entry_from_json_value(&interim).expect("parse interim aliases");
        let interim_canonical = armsparam_entry_to_json_value(&interim_entry);
        assert_eq!(
            interim_canonical.get("chargeAccumulateDurationBaseFrame"),
            Some(&json!(90))
        );
        assert_eq!(
            interim_canonical.get("chargeDecayDurationBaseFrame"),
            Some(&json!(45))
        );
        assert_eq!(interim_canonical.get("chargeStageCount"), Some(&json!(3)));
        assert_eq!(interim_canonical.get("chargeInputFlags"), Some(&json!(2)));
    }

    #[test]
    fn armsparam_decodes_and_edits_kind7_labels_when_sample_present() {
        let Ok(source) = std::fs::read(SAMPLE_PATH) else {
            return;
        };
        let parsed = parse_armsparam(&source).expect("parse armsparam");
        assert!(!parsed.entries.is_empty());

        let with_strings = parsed
            .entries
            .iter()
            .find(|e| !e.strings.is_empty())
            .expect("sample should decode at least one kind-7 label");
        let j = armsparam_entry_to_json_value(with_strings);
        assert!(
            j.get("actionLabel").and_then(|v| v.as_str()).is_some()
                || j.get("resourceLabel").and_then(|v| v.as_str()).is_some(),
            "JSON should expose decoded actionLabel/resourceLabel strings"
        );

        let mut edited = parsed.clone();
        edited.entries[0]
            .strings
            .insert(0xE6213731, "ACTION_LABEL_EDIT_TEST".to_string());
        let bytes = build_armsparam(&edited).expect("rebuild after label edit");
        let reparsed = parse_armsparam(&bytes).expect("reparse after label edit");
        assert_eq!(
            reparsed.entries[0]
                .strings
                .get(&0xE6213731)
                .map(String::as_str),
            Some("ACTION_LABEL_EDIT_TEST")
        );
    }
}
