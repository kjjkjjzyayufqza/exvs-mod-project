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

// Please keep comments for analysis.
// Data-verified: 432 files, 5487 entries. cmd_count={34,36}.
// CRITICAL: texture_hash/animation_hash/second_bone_hash were named "_hash" but are booleans (0/1).
// Many "*_type"/"*_mode"/"*_count" fields are also booleans — kept names to avoid mass rename breakage.
pub const VERNIER_TABLE_COMMAND_POOL: ParamCommandPool = &[
    (0x01311D05, 1, "effect_type"), // [D:0~1] boolean despite "_type" name
    (0x0887512E, 1, "color_index"), // [D:0~1] boolean despite "_index" name
    (0x0FDBD536, 1, "effect_model_hash"), // [D:HASH] 561 unique
    (0x0FEA9537, 1, "keep_active"), // [D:0~1] boolean
    (0x13EEB8F0, 5, "particle_size_1"), // [D:-3~3] 29 unique
    (0x21FFCD00, 1, "is_loop"),     // [D:0~1] boolean
    (0x2DB526FD, 1, "is_follow_bone"), // [D:0~1] boolean
    (0x35B5281F, 1, "bone_offset_type"), // [D:always 0] unused
    (0x3B6EA02D, 1, "rotation_type"), // [D:0~1] boolean despite "_type" name
    (0x3C036434, 1, "alignment_type"), // [D:0~1] boolean despite "_type" name
    (0x42B21889, 1, "blend_mode"),  // [D:always 0] unused
    (0x43298ECB, 5, "particle_size_2"), // [D:0~5] 31 unique
    // Offset 0x30 (hash 0x49672094). Previously named `model_hash` (serialized as modelHash;
    // sometimes described as modelId) from an incorrect assumption that this referenced a 3D model
    // resource hash. User analysis (2026-06-28) determined this field is the vernier slot effect id.
    (0x49672094, 1, "effect_id"), // [D:HASH] effect id ref at entry+0x30
    (0x4B0454A2, 1, "has_texture"), // [D:0~1] boolean. was "texture_hash" — NOT a hash
    (0x4C6990BB, 1, "has_animation"), // [D:0~1] boolean. was "animation_hash" — NOT a hash
    (0x618D354C, 1, "material_hash"), // [D:always 0] unused
    (0x634CF0E5, 1, "is_billboard"), // [D:0~1] boolean
    (0x64E98866, 5, "z_distance"), // [D:-3~5] 20 unique
    (0x6744C378, 1, "fade_type"), // [D:always 0] unused
    (0x72E23F39, 1, "is_world_space"), // [D:0~1] boolean
    (0x76362D93, 1, "cull_mode"), // [D:0~1] boolean despite "_mode" name
    (0x7F8061B8, 1, "depth_test_type"), // [D:0~1] boolean despite "_type" name
    (0x918E0094, 1, "emit_count"), // [D:0~1] boolean despite "_count" name
    (0x96E3C48D, 1, "lifetime_type"), // [D:0~1] boolean despite "_type" name
    (0xA267F197, 1, "velocity_type"), // [D:0~1] boolean despite "_type" name
    (0xA50A358E, 1, "inherit_parent_type"), // [D:0~1] boolean despite "_type" name, only 4 ones
    (0xB8F69CBA, 1, "render_order"), // [D:0~1] boolean despite "_order" name
    (0xD20D0518, 1, "sort_bias"), // [D:always 0] unused
    (0xD32D39ED, 1, "bone_hash"), // [D:HASH] 2864 unique
    (0xD560C101, 1, "has_second_bone"), // [D:0~1] boolean. was "second_bone_hash" — NOT a hash
    (0xE1E4F41B, 1, "effect_flag_a"), // [D:0~1] boolean
    (0xE6893002, 1, "effect_flag_b"), // [D:0~1] boolean
    (0xE694B5B6, 5, "effect_scale"), // [D:-0.5~2] 11 unique
    (0xEDD1C108, 1, "hitgroup_ref"), // [D:HASH] 738 unique
    (0xFA45A15F, 1, "is_enabled"), // [D:0~1] boolean
    (0xFDE0D9DC, 5, "spawn_offset_y"), // [D:-3~2.8] 13 unique
];

pub fn vernier_table_entry_to_json_value(entry: &VernierTableEntry) -> Value {
    entry_commands_to_named_json(entry.entry_id, &entry.commands, VERNIER_TABLE_COMMAND_POOL)
}

pub fn vernier_table_entry_from_json_value(v: &Value) -> Result<VernierTableEntry, String> {
    let (entry_id, commands) = entry_commands_from_named_json(v, VERNIER_TABLE_COMMAND_POOL)?;
    Ok(VernierTableEntry { entry_id, commands })
}

#[derive(Debug, Clone, PartialEq)]
pub struct VernierTableEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
}

impl Serialize for VernierTableEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        vernier_table_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for VernierTableEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        vernier_table_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VernierTableData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<VernierTableEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered_index_times_four(VERNIER_TABLE_COMMAND_POOL)
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(VERNIER_TABLE_COMMAND_POOL, field_specs)
}

fn parse_entry_from_raw(
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
    entry_id: u32,
) -> VernierTableEntry {
    let commands = parse_commands_map_from_entry_row(raw, field_specs);
    VernierTableEntry { entry_id, commands }
}

fn entry_matches_raw(
    entry: &VernierTableEntry,
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
) -> bool {
    entry_row_matches_command_map(&entry.commands, raw, field_specs)
}

pub fn parse_vernier_table(data: &[u8]) -> Result<VernierTableData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(parse_entry_from_raw(raw, &file.field_specs, id));
    }

    Ok(VernierTableData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_vernier_table(b: &VernierTableData) -> Result<Vec<u8>, String> {
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
                    "vernier_table entry field offset out of range for entry_size".to_string(),
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
        entry_ids: b.entries.iter().map(|entry| entry.entry_id).collect(),
        entries_raw,
        trailing_data: b.trailing_data.clone(),
    };
    build_param_binary(&file)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_DIR: &str = "E:\\XB\\\u{89e3}\u{5305}\\vs2\\x64\\006effect\\vernier_table";

    fn collect_candidates(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    collect_candidates(&path, out);
                } else {
                    let lower = path.to_string_lossy().to_ascii_lowercase();
                    if lower.ends_with(".bin") || lower.ends_with(".vgsht2") {
                        out.push(path);
                    }
                }
            }
        }
    }

    fn resolve_sample_path() -> std::path::PathBuf {
        let mut candidates = Vec::new();
        collect_candidates(std::path::Path::new(SAMPLE_DIR), &mut candidates);
        candidates.sort();
        candidates
            .into_iter()
            .next()
            .unwrap_or_else(|| panic!("no vernier_table sample file found in {}", SAMPLE_DIR))
    }

    #[test]
    fn vernier_table_read_write_crud() {
        let sample_path = resolve_sample_path();
        let source = std::fs::read(&sample_path).expect("failed to read vernier_table sample file");

        let parsed =
            parse_vernier_table(&source).expect("failed to parse vernier_table sample file");
        let rebuilt =
            build_vernier_table(&parsed).expect("failed to rebuild vernier_table sample file");
        assert_eq!(rebuilt, source);

        assert!(
            !parsed.entries.is_empty(),
            "vernier_table sample has no entries"
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
            build_vernier_table(&with_added).expect("failed to build vernier_table after add");
        let added_parsed =
            parse_vernier_table(&added_bytes).expect("failed to parse vernier_table after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(
            added_parsed.entries.last().map(|entry| entry.entry_id),
            Some(next_id)
        );

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_vernier_table(&with_updated).expect("failed to build vernier_table after update");
        let updated_parsed = parse_vernier_table(&updated_bytes)
            .expect("failed to parse vernier_table after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_vernier_table(&with_deleted).expect("failed to build vernier_table after delete");
        let deleted_parsed = parse_vernier_table(&deleted_bytes)
            .expect("failed to parse vernier_table after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
