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
    json_to_raw_u32_for_kind, min_entry_data_size_for_specs, parse_commands_map_from_entry_row,
    raw_u32_to_json_for_kind, snake_to_camel, validate_file_specs_kind_match_pool,
    ParamCommandPool, KIND_U32,
};

const KIND_STRING: u32 = 7;

pub const CHARACTERLIST_COMMAND_POOL: ParamCommandPool = &[
    (0x01838DBF, 2, "index_in_series"),
    (0x02E33A57, 1, "legacy_removed_u32_0004"),
    (0x03DE01EE, 1, "charge_label_weapon_fight"),
    (0x063B9723, 1, "vs_p_l_c03"),
    (0x086A965D, 1, "ms_igh_r"),
    (0x11A659D4, 1, "ms_vs_r"),
    (0x127AE618, 1, "unk_hash_0x18"),
    (0x12C74AEC, 7, "character_name"),
    (0x18262F43, 1, "threshold_300_score_code"),
    (0x19E44574, 1, "threshold_200_rule_code"),
    (0x1BA2FB2D, 1, "threshold_100_rule_code"),
    (0x1BAE6116, 1, "unk_hash_0x30"),
    (0x1CFE4C4F, 1, "ms_vs_l"),
    (0x1D6939C6, 1, "threshold_400_rule_code"),
    (0x1DF70684, 1, "profile_set_a_primary_default"),
    (0x1E4A901F, 1, "profile_set_b_primary_slot2"),
    (0x2127AE27, 1, "vs_p_r_c03"),
    (0x22077406, 1, "profile_set_a_shared_special"),
    (0x23265E2A, 1, "profile_set_b_primary_default"),
    (0x232AB9AF, 1, "profile_set_b_primary_slot1"),
    (0x275AC0EA, 1, "series_alt_group_id"),
    (0x2AFE3EA1, 1, "profile_set_b_secondary_slot3"),
    (0x2B8290C1, 1, "sticker1"),
    (0x2CEF54D8, 1, "unk_0x060"),
    (0x2F1ACFA8, 1, "profile_set_a_primary_slot2"),
    (0x30746284, 7, "variant_display_name_default"),
    (0x33BEFC54, 1, "unk_0x070"),
    (0x3573AED2, 1, "pilot_presentation_hash"),
    (0x361E5A1E, 1, "lmb_pilot_clothing"),
    (0x3719A69D, 7, "variant_display_name_slot4"),
    (0x395E1DAD, 7, "weapon_text_sfight"),
    (0x3C6D3850, 1, "optional_sidecar_hash_slot2"),
    (0x3E33D9B4, 7, "weapon_text_main"),
    (0x401E960B, 7, "variant_display_name_slot3"),
    (0x41196A88, 1, "optional_pilot_presentation_hash_slot2"),
    (0x44359307, 7, "pilot_name_short"),
    (0x47157FE4, 1, "secondary_selector_state"),
    (0x4B6A08C6, 1, "ex_pilot_clothing_lmb_hash"),
    (0x4E2E5EC9, 1, "series_id"),
    (0x4E592D3B, 7, "weapon_text_sp"),
    (0x4F03C86C, 7, "pilot_name_full"),
    (0x4F0C5930, 1, "legacy_sparse_weapon_info_flag"),
    (0x55DA9CC8, 1, "profile_set_a_primary_slot0"),
    (0x56209EB1, 1, "vs_p_r_c02"),
    (0x5A14C92D, 1, "ms_card_icon_index"),
    (0x5A577C54, 1, "profile_set_a_secondary_default"),
    (0x5BE8644E, 1, "unk_0x0dc"),
    (0x5C85A057, 1, "sticker_t01"),
    (0x648624FA, 1, "profile_set_b_secondary_default"),
    (0x648AC37F, 1, "profile_set_b_primary_slot0"),
    (0x6B455DBB, 1, "selector_state"),
    (0x6CD5881F, 1, "series_default_group_id"),
    (0x713CA7B5, 1, "vs_p_l_c02"),
    (0x7257314C, 1, "profile_set_b_shared_special"),
    (0x7289CED8, 1, "unk_0x0fc"),
    (0x72CCF60D, 1, "legacy_removed_u32_0100"),
    (0x7C009F91, 1, "suppress_optional_lmb_sidecar"),
    (0x8157B2C0, 1, "variant_flag"),
    (0x87B5733D, 1, "threshold_1_rule_code"),
    (0x8D0D0A5A, 1, "unk_0x110"),
    (0x8EF94283, 1, "ms_tracker"),
    (0x94EE94B6, 1, "profile_set_a_secondary_slot1"),
    (0x985F0280, 1, "vs_p_l_c04"),
    (0x98DEE2B1, 1, "profile_set_b_secondary_slot2"),
    (0x9C87AFF4, 1, "unk_0x124"),
    (0x9D3A13B8, 1, "profile_set_a_primary_slot3"),
    (0xA209ADF3, 1, "optional_sidecar_hash_slot3"),
    (0xA5BECB01, 1, "profile_set_b_secondary_slot1"),
    (0xA73A880E, 7, "weapon_text_fight"),
    (0xA84A15F4, 1, "paired_bgm_music_id_primary"),
    (0xA88E762A, 1, "character_unique_id"),
    (0xA97D333E, 7, "variant_display_name_slot1"),
    (0xA98EBD06, 1, "profile_set_a_secondary_slot2"),
    (0xABDE191C, 1, "charge_label_weapon_main"),
    (0xAC6A4C0F, 1, "profile_set_b_primary_slot3"),
    (0xAE10F727, 7, "variant_display_name_slot5"),
    (0xAF170BA4, 1, "lmb_cut_in"),
    (0xB28BC17B, 1, "sticker_t05"),
    (0xB318FC33, 2, "series_alt_order_index"),
    (0xB5E60562, 1, "tracker_sticker_hash_slot4"),
    (0xB93FBD0C, 1, "paired_bgm_music_id_secondary"),
    (0xBC504949, 1, "unk_0x174"),
    (0xBF433B84, 1, "vs_p_r_c04"),
    (0xC2E135F4, 1, "tracker_sticker_hash_slot3"),
    (0xC8CDB696, 1, "ms_ms_l"),
    (0xCB5779DF, 1, "unk_0x184"),
    (0xCF29CF0B, 1, "vs_p_r"),
    (0xD03DB898, 7, "weapon_text_sub"),
    (0xD263597C, 1, "lmb_boost"),
    (0xD34EEE66, 1, "profile_set_a_secondary_slot0"),
    (0xD917C7B1, 7, "variant_display_name_slot6"),
    (0xD95E0242, 1, "rnk_m_l"),
    (0xDA0F857B, 1, "optional_presentation_variant_flag"),
    (0xDBA36169, 1, "ms_crs"),
    (0xDE7A03A8, 7, "variant_display_name_slot2"),
    (0xDF7DFF2B, 1, "optional_pilot_presentation_hash_slot3"),
    (0xE21EB1D1, 1, "profile_set_b_secondary_slot0"),
    (0xE4E3753B, 1, "ms_ms_s"),
    (0xE835F60F, 1, "vs_p_l"),
    (0xEB809F62, 1, "unk_0x1c8"),
    (0xF94CF0EC, 1, "ms_mn"),
    (0xFC0CAD0B, 1, "sc_p"),
    (0xFE2E83D0, 1, "partner_comm_entry_enabled_code"),
];

fn pool_string_hashes() -> Vec<u32> {
    CHARACTERLIST_COMMAND_POOL
        .iter()
        .filter(|(_, k, _)| *k == KIND_STRING)
        .map(|(h, _, _)| *h)
        .collect()
}

#[derive(Debug, Clone, PartialEq)]
pub struct CharacterListEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
    pub strings: HashMap<u32, String>,
}

impl Serialize for CharacterListEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        characterlist_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for CharacterListEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        characterlist_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

pub fn characterlist_entry_to_json_value(entry: &CharacterListEntry) -> Value {
    let mut map = JsonMap::new();
    map.insert("entryId".to_string(), json!(entry.entry_id));

    for &(h, kind, name) in CHARACTERLIST_COMMAND_POOL {
        let key = snake_to_camel(name);
        if kind == KIND_STRING {
            if let Some(s) = entry.strings.get(&h) {
                map.insert(key, json!(s));
            } else if let Some(&raw) = entry.commands.get(&h) {
                map.insert(key, json!(raw));
            }
        } else if let Some(&raw) = entry.commands.get(&h) {
            map.insert(key, raw_u32_to_json_for_kind(kind, raw));
        }
    }

    let mut extra = JsonMap::new();
    for (&h, &v) in &entry.commands {
        if !is_hash_in_pool(CHARACTERLIST_COMMAND_POOL, h) {
            extra.insert(format!("{h}"), json!(v));
        }
    }
    if !extra.is_empty() {
        map.insert("extraCommands".to_string(), Value::Object(extra));
    }

    Value::Object(map)
}

pub fn characterlist_entry_from_json_value(v: &Value) -> Result<CharacterListEntry, String> {
    let obj = v.as_object().ok_or("expected JSON object")?;
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
                    let raw = json_to_raw_u32_for_kind(KIND_U32, v_ex)
                        .map_err(|e| format!("extraCommands.{hash_str}: {e}"))?;
                    commands.insert(h, raw);
                }
            }
            continue;
        }
        if let Some((h, knd)) = hash_and_kind_for_camel_key(CHARACTERLIST_COMMAND_POOL, k) {
            if knd == KIND_STRING {
                if let Some(s) = val.as_str() {
                    strings.insert(h, s.to_string());
                } else if let Some(n) = val.as_u64() {
                    commands.insert(h, n as u32);
                }
            } else {
                let raw = json_to_raw_u32_for_kind(knd, val).map_err(|e| format!("{k}: {e}"))?;
                commands.insert(h, raw);
            }
        }
    }

    Ok(CharacterListEntry {
        entry_id,
        commands,
        strings,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterListData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<CharacterListEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(CHARACTERLIST_COMMAND_POOL, field_specs)
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
                strings.insert(h, obf_decode_to_string(raw));
            }
        }
    }
    strings
}

pub fn parse_characterlist(data: &[u8]) -> Result<CharacterListData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let string_hashes = pool_string_hashes();

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        let commands = parse_commands_map_from_entry_row(raw, &file.field_specs);
        let strings = resolve_entry_strings(&commands, data, &string_hashes);
        entries.push(CharacterListEntry {
            entry_id: id,
            commands,
            strings,
        });
    }

    Ok(CharacterListData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_characterlist(b: &CharacterListData) -> Result<Vec<u8>, String> {
    if !b.field_specs.is_empty() {
        validate_field_specs(&b.field_specs)?;
    }
    let field_specs = if b.field_specs.is_empty() {
        CHARACTERLIST_COMMAND_POOL
            .iter()
            .enumerate()
            .map(|(index, (hash, kind, _))| ParamFieldSpec {
                hash: *hash,
                entry_offset: (index * 4) as u32,
                flags: 0,
                kind: *kind,
            })
            .collect()
    } else {
        b.field_specs.clone()
    };

    let min_size = min_entry_data_size_for_specs(&field_specs);
    let default_floor = b.header.entry_size.max(min_size);
    let entry_size = default_floor as usize;

    let string_hashes = pool_string_hashes();
    let has_new_strings = b.entries.iter().any(|e| !e.strings.is_empty());

    if !has_new_strings {
        return build_without_string_rewrite(b, &field_specs, entry_size);
    }

    let entries_base_offset =
        0x20 + field_specs.len() * 4 + field_specs.len() * 12 + b.entries.len() * 4;
    let string_pool_start = entries_base_offset + b.entries.len() * entry_size;

    let mut string_pool: Vec<u8> = Vec::new();
    let mut entry_string_offsets: Vec<HashMap<u32, u32>> = Vec::with_capacity(b.entries.len());

    for (entry_index, entry) in b.entries.iter().enumerate() {
        let mut offsets = HashMap::new();
        for &h in &string_hashes {
            if let Some(s) = entry.strings.get(&h) {
                let abs_offset = (string_pool_start + string_pool.len()) as u32;
                offsets.insert(h, abs_offset);
                let encoded = obf_encode_from_string(s);
                string_pool.extend_from_slice(&encoded);
            } else if let Some(&raw_offset) = entry.commands.get(&h) {
                if entry_index < b.source_entries_raw.len() {
                    offsets.insert(h, raw_offset);
                } else {
                    let abs_offset = (string_pool_start + string_pool.len()) as u32;
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

        for spec in &field_specs {
            let o = spec.entry_offset as usize;
            if o + 4 > raw.len() {
                return Err(
                    "characterlist entry field offset out of range for entry_size".to_string(),
                );
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
        field_specs,
        entry_ids: b.entries.iter().map(|e| e.entry_id).collect(),
        entries_raw,
        trailing_data: string_pool,
    };
    build_param_binary(&file)
}

fn build_without_string_rewrite(
    b: &CharacterListData,
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
                return Err(
                    "characterlist entry field offset out of range for entry_size".to_string(),
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
        field_specs: field_specs.to_vec(),
        entry_ids: b.entries.iter().map(|e| e.entry_id).collect(),
        entries_raw,
        trailing_data: b.trailing_data.clone(),
    };
    build_param_binary(&file)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0xDFD38C70\\character_list.bin";

    #[test]
    fn characterlist_parse_basic() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read character_list sample");
        let parsed = parse_characterlist(&source).expect("failed to parse character_list");
        assert_eq!(parsed.entries.len(), 687);
        assert_eq!(parsed.header.commands_count, 103);
        assert_eq!(parsed.header.entry_size, 0x1D8);
        assert_eq!(parsed.entries[0].entry_id, 1001001);

        let first = &parsed.entries[0];
        assert!(first.strings.contains_key(&0x12C74AEC));
        let name = first.strings.get(&0x12C74AEC).unwrap();
        assert!(!name.is_empty(), "character_name should not be empty");
    }

    #[test]
    fn characterlist_roundtrip_no_edit() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read character_list sample");
        let parsed = parse_characterlist(&source).expect("failed to parse character_list");
        let rebuilt = build_characterlist(&parsed).expect("failed to rebuild character_list");
        assert_eq!(rebuilt, source, "byte-exact roundtrip failed");
    }

    #[test]
    fn characterlist_json_accepts_signed_pilot_presentation_hash() {
        // DualValueProperty commits hashes via int32, so 0x80B7036E arrives as a
        // negative JSON number. KIND_U32 must keep the same 32-bit pattern.
        let expected: u32 = 0x80B7036E;
        let json_val = json!({
            "entryId": 900000004u32,
            "pilotPresentationHash": expected as i32,
        });
        let entry = characterlist_entry_from_json_value(&json_val)
            .expect("signed DualValueProperty hash should deserialize");
        assert_eq!(entry.entry_id, 900000004);
        assert_eq!(entry.commands.get(&0x3573AED2).copied(), Some(expected));
    }

    #[test]
    fn characterlist_json_roundtrip() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read character_list sample");
        let parsed = parse_characterlist(&source).expect("failed to parse character_list");

        let first = &parsed.entries[0];
        let json_val = characterlist_entry_to_json_value(first);
        let roundtripped = characterlist_entry_from_json_value(&json_val)
            .expect("failed to deserialize from JSON");

        assert_eq!(first.entry_id, roundtripped.entry_id);
        for &(h, k, _) in CHARACTERLIST_COMMAND_POOL {
            if k != KIND_STRING {
                assert_eq!(
                    first.commands.get(&h),
                    roundtripped.commands.get(&h),
                    "mismatch for hash 0x{h:08X}"
                );
            }
        }
        for &(h, k, _) in CHARACTERLIST_COMMAND_POOL {
            if k == KIND_STRING {
                assert_eq!(
                    first.strings.get(&h),
                    roundtripped.strings.get(&h),
                    "string mismatch for hash 0x{h:08X}"
                );
            }
        }
    }

    #[test]
    fn characterlist_string_edit_roundtrip() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read character_list sample");
        let mut parsed = parse_characterlist(&source).expect("failed to parse character_list");

        let original_name = parsed.entries[0]
            .strings
            .get(&0x12C74AEC)
            .cloned()
            .unwrap_or_default();

        let test_name = format!("{}_TEST", original_name);
        parsed.entries[0]
            .strings
            .insert(0x12C74AEC, test_name.clone());

        let rebuilt = build_characterlist(&parsed).expect("failed to rebuild after string edit");
        let re_parsed = parse_characterlist(&rebuilt).expect("failed to re-parse after edit");

        assert_eq!(re_parsed.entries.len(), parsed.entries.len());
        let re_name = re_parsed.entries[0]
            .strings
            .get(&0x12C74AEC)
            .expect("missing character_name after rebuild");
        assert_eq!(re_name, &test_name);

        for i in 1..parsed.entries.len() {
            for &(h, k, _) in CHARACTERLIST_COMMAND_POOL {
                if k != KIND_STRING {
                    assert_eq!(
                        parsed.entries[i].commands.get(&h),
                        re_parsed.entries[i].commands.get(&h),
                        "entry[{i}] command 0x{h:08X} mismatch"
                    );
                }
            }
        }
    }
}
