use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};

pub const PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE: u32 = 60;
pub const PROJECTILE_DEPICTION_TABLE_CMD_COUNT: u32 = 15;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct ProjectileDepictionTableEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub depiction_type: u32, // 0x049A712B +0x000 kind=1 CEfxProjectileDepiction* class selector
    pub main_effect_hash: u32, // 0x057E839D +0x004 kind=1 main visual effect resource
    pub sub_effect_hash: u32, // 0x08B05EA9 +0x008 kind=1 secondary/sub visual effect
    pub scale: f32,          // 0x1B12E734 +0x00C kind=5 projectile visual scale
    pub model_hash: u32,     // 0x49672094 +0x010 kind=1 3D model hash (shared with vernier_table)
    pub trail_effect_hash: u32, // 0x5896D450 +0x014 kind=1 trail/streak effect
    pub hit_effect_hash: u32, // 0x5EF964EC +0x018 kind=1 on-hit visual effect
    pub trail_length: f32,   // 0x8F49B2DA +0x01C kind=5 trail rendering length
    pub sound_effect_hash: u32, // 0x996BA1AC +0x020 kind=1 sound/SE resource
    pub render_mode: u32,    // 0xBA4BBA9D +0x024 kind=1 rendering mode enum
    pub material_hash: u32,  // 0xC19F85EA +0x028 kind=1 material/shader override
    pub z_offset: f32,       // 0xD1097B21 +0x02C kind=5 Z-axis spawn offset
    pub spawn_effect_hash: u32, // 0xD9EF5A79 +0x030 kind=1 spawn/muzzle flash effect
    pub behavior_flags: i32, // 0xDABB1A5C +0x034 kind=2 depiction behavior flags
    pub destroy_effect_hash: u32, // 0xE9DE0A15 +0x038 kind=1 destruction/expire effect
}

pub const PROJECTILE_DEPICTION_TABLE_FIELD_HASHES: [(u32, u32, u32); 15] = [
    (0x049A712B, 0x000, 1),
    (0x057E839D, 0x004, 1),
    (0x08B05EA9, 0x008, 1),
    (0x1B12E734, 0x00C, 5),
    (0x49672094, 0x010, 1),
    (0x5896D450, 0x014, 1),
    (0x5EF964EC, 0x018, 1),
    (0x8F49B2DA, 0x01C, 5),
    (0x996BA1AC, 0x020, 1),
    (0xBA4BBA9D, 0x024, 1),
    (0xC19F85EA, 0x028, 1),
    (0xD1097B21, 0x02C, 5),
    (0xD9EF5A79, 0x030, 1),
    (0xDABB1A5C, 0x034, 2),
    (0xE9DE0A15, 0x038, 1),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectileDepictionTableData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<ProjectileDepictionTableEntry>,
    pub trailing_data: Vec<u8>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    PROJECTILE_DEPICTION_TABLE_FIELD_HASHES
        .iter()
        .map(|(hash, entry_offset, kind)| ParamFieldSpec {
            hash: *hash,
            entry_offset: *entry_offset,
            flags: 0,
            kind: *kind,
        })
        .collect()
}

fn validate_field_specs(field_specs: &[ParamFieldSpec]) -> Result<(), String> {
    if field_specs.len() != PROJECTILE_DEPICTION_TABLE_FIELD_HASHES.len() {
        return Err(format!(
            "projectile_depiction_table command count mismatch: file has {}, expected {}",
            field_specs.len(),
            PROJECTILE_DEPICTION_TABLE_FIELD_HASHES.len()
        ));
    }
    for (index, spec) in field_specs.iter().enumerate() {
        let (expected_hash, expected_offset, expected_kind) =
            PROJECTILE_DEPICTION_TABLE_FIELD_HASHES[index];
        if spec.hash != expected_hash
            || spec.entry_offset != expected_offset
            || spec.kind != expected_kind
        {
            return Err(format!(
                "projectile_depiction_table command mismatch at index {}: got (hash=0x{:08X}, offset=0x{:X}, kind={}), expected (hash=0x{:08X}, offset=0x{:X}, kind={})",
                index,
                spec.hash,
                spec.entry_offset,
                spec.kind,
                expected_hash,
                expected_offset,
                expected_kind
            ));
        }
    }
    Ok(())
}

pub fn parse_projectile_depiction_table(
    data: &[u8],
) -> Result<ProjectileDepictionTableData, String> {
    let file = read_param_binary(data)?;
    if file.header.entry_size != PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE {
        return Err(format!(
            "projectile_depiction_table entry_size mismatch: file has {}, expected {}",
            file.header.entry_size, PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE
        ));
    }
    if file.header.commands_count != PROJECTILE_DEPICTION_TABLE_CMD_COUNT {
        return Err(format!(
            "projectile_depiction_table command count mismatch: file has {}, expected {}",
            file.header.commands_count, PROJECTILE_DEPICTION_TABLE_CMD_COUNT
        ));
    }
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        if raw.len() != PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE as usize {
            return Err(format!(
                "projectile_depiction_table row {} size {} != expected {}",
                i,
                raw.len(),
                PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE
            ));
        }
        let mut cursor = Cursor::new(raw.as_slice());
        let mut entry =
            ProjectileDepictionTableEntry::read(&mut cursor).map_err(|e| e.to_string())?;
        entry.entry_id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(entry);
    }

    Ok(ProjectileDepictionTableData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
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

    let entry_size = PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE as usize;
    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for entry in &b.entries {
        let mut raw = vec![0u8; entry_size];
        let mut cursor = Cursor::new(&mut raw[..]);
        entry
            .write(&mut cursor)
            .map_err(|err| format!("projectile_depiction_table write entry: {}", err))?;
        if cursor.position() as usize > entry_size {
            return Err("projectile_depiction_table encoded entry larger than entry_size".to_string());
        }
        entries_raw.push(raw);
    }

    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = PROJECTILE_DEPICTION_TABLE_CMD_COUNT;
    header.entry_size = PROJECTILE_DEPICTION_TABLE_ENTRY_SIZE;

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
        let source = std::fs::read(path).expect("failed to read projectile_depiction_table sample file");

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
        assert_eq!(added_parsed.entries.last().map(|entry| entry.entry_id), Some(next_id));

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
