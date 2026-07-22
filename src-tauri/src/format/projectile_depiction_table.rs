use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

use serde_json::Value;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};
use crate::format::param_entry_schema::{
    entry_commands_from_named_json, entry_commands_to_named_json, entry_row_matches_command_map,
    expected_field_specs_ordered, min_entry_data_size_for_specs, parse_commands_map_from_entry_row,
    validate_file_specs_kind_match_pool, ParamCommandPool,
};

// Please keep comments for analysis.
// Data-verified: 344 files, 1086 entries. cmd_count={14,15}.
pub const PROJECTILE_DEPICTION_TABLE_COMMAND_POOL: ParamCommandPool = &[
    (0x049A712B, 1, "depiction_type"), // [D:HASH-like] 7 unique, mostly 0 (1076/1086)
    (0x057E839D, 1, "main_effect_hash"), // [D:HASH] 262 unique
    (0x08B05EA9, 1, "sub_effect_hash"), // [D:HASH] 17 unique, mostly 0
    (0x1B12E734, 5, "scale"),          // [D:-1~3] 21 unique, never 0
    (0x49672094, 1, "model_hash"),     // [D:HASH] 640 unique
    (0x5896D450, 1, "trail_effect_hash"), // [D:HASH] 4 unique, mostly 0
    (0x5EF964EC, 1, "has_hit_effect"), // [D:0~1] boolean. was "hit_effect_hash" — NOT a hash
    (0x8F49B2DA, 5, "trail_length"),   // [D:0~600] 29 unique
    (0x996BA1AC, 1, "sound_effect_hash"), // [D:HASH] 23 unique
    (0xBA4BBA9D, 1, "render_mode"),    // [D:1~18] enum, 15 types, never 0
    (0xC19F85EA, 1, "material_hash"),  // [D:HASH] 138 unique
    (0xD1097B21, 5, "z_offset"),       // [D:-13~200] 58 unique
    (0xD9EF5A79, 1, "spawn_effect_hash"), // [D:HASH] 63 unique
    (0xDABB1A5C, 2, "behavior_flags"), // [D:always 0] unused
    (0xE9DE0A15, 1, "destroy_effect_hash"), // [D:HASH] 53 unique
];

pub fn projectile_depiction_table_entry_to_json_value(
    entry: &ProjectileDepictionTableEntry,
) -> Value {
    entry_commands_to_named_json(
        entry.entry_id,
        &entry.commands,
        PROJECTILE_DEPICTION_TABLE_COMMAND_POOL,
    )
}

pub fn projectile_depiction_table_entry_from_json_value(
    v: &Value,
) -> Result<ProjectileDepictionTableEntry, String> {
    let (entry_id, commands) =
        entry_commands_from_named_json(v, PROJECTILE_DEPICTION_TABLE_COMMAND_POOL)?;
    Ok(ProjectileDepictionTableEntry { entry_id, commands })
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProjectileDepictionTableEntry {
    pub entry_id: u32,
    pub commands: HashMap<u32, u32>,
}

impl Serialize for ProjectileDepictionTableEntry {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        projectile_depiction_table_entry_to_json_value(self).serialize(s)
    }
}

impl<'de> Deserialize<'de> for ProjectileDepictionTableEntry {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = Value::deserialize(d)?;
        projectile_depiction_table_entry_from_json_value(&v).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectileDepictionTableData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<ProjectileDepictionTableEntry>,
    pub trailing_data: Vec<u8>,
    #[serde(skip)]
    pub source_entries_raw: Vec<Vec<u8>>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    expected_field_specs_ordered(PROJECTILE_DEPICTION_TABLE_COMMAND_POOL)
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    validate_file_specs_kind_match_pool(PROJECTILE_DEPICTION_TABLE_COMMAND_POOL, field_specs)
}

fn parse_entry_from_raw(
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
    entry_id: u32,
) -> ProjectileDepictionTableEntry {
    let commands = parse_commands_map_from_entry_row(raw, field_specs);
    ProjectileDepictionTableEntry { entry_id, commands }
}

fn entry_matches_raw(
    entry: &ProjectileDepictionTableEntry,
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
) -> bool {
    entry_row_matches_command_map(&entry.commands, raw, field_specs)
}

pub fn parse_projectile_depiction_table(
    data: &[u8],
) -> Result<ProjectileDepictionTableData, String> {
    let file = read_param_binary(data)?;
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        let id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(parse_entry_from_raw(raw, &file.field_specs, id));
    }

    Ok(ProjectileDepictionTableData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
        source_entries_raw: file.entries_raw,
    })
}

pub fn build_projectile_depiction_table(
    b: &ProjectileDepictionTableData,
) -> Result<Vec<u8>, String> {
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
                    "projectile_depiction_table entry field offset out of range for entry_size"
                        .to_string(),
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

    const SAMPLE_PATH_COM: &str =
        "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\projectile_depiction_table.bin";
    const SAMPLE_DIR_EFFECT: &str =
        "E:\\XB\\\u{89e3}\u{5305}\\vs2\\x64\\006effect\\projectile_depiction";

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

    fn resolve_effect_sample_path() -> std::path::PathBuf {
        let mut candidates = Vec::new();
        collect_candidates(std::path::Path::new(SAMPLE_DIR_EFFECT), &mut candidates);
        candidates.sort();
        candidates.into_iter().next().unwrap_or_else(|| {
            panic!(
                "no projectile_depiction sample file found in {}",
                SAMPLE_DIR_EFFECT
            )
        })
    }

    fn assert_crud(path: &str) {
        let source =
            std::fs::read(path).expect("failed to read projectile_depiction_table sample file");

        let parsed = parse_projectile_depiction_table(&source)
            .expect("failed to parse projectile_depiction_table sample file");
        let rebuilt = build_projectile_depiction_table(&parsed)
            .expect("failed to rebuild projectile_depiction_table sample file");
        assert_eq!(rebuilt, source);

        assert!(
            !parsed.entries.is_empty(),
            "projectile_depiction_table sample has no entries"
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
        let added_bytes = build_projectile_depiction_table(&with_added)
            .expect("failed to build projectile_depiction_table after add");
        let added_parsed = parse_projectile_depiction_table(&added_bytes)
            .expect("failed to parse projectile_depiction_table after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(
            added_parsed.entries.last().map(|entry| entry.entry_id),
            Some(next_id)
        );

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes = build_projectile_depiction_table(&with_updated)
            .expect("failed to build projectile_depiction_table after update");
        let updated_parsed = parse_projectile_depiction_table(&updated_bytes)
            .expect("failed to parse projectile_depiction_table after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes = build_projectile_depiction_table(&with_deleted)
            .expect("failed to build projectile_depiction_table after delete");
        let deleted_parsed = parse_projectile_depiction_table(&deleted_bytes)
            .expect("failed to parse projectile_depiction_table after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }

    #[test]
    fn projectile_depiction_table_read_write_crud_com_sample() {
        assert_crud(SAMPLE_PATH_COM);
    }

    #[test]
    fn projectile_depiction_table_read_write_crud_effect_sample() {
        let sample_path = resolve_effect_sample_path();
        assert_crud(sample_path.to_string_lossy().as_ref());
    }
}
