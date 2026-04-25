use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};

pub const VERNIER_TABLE_ENTRY_SIZE: u32 = 144;
pub const VERNIER_TABLE_CMD_COUNT: u32 = 36;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct VernierTableEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub effect_type: u32,         // 0x01311D05 +0x000 kind=1 IDA:flag_idx=0x0F
    pub color_index: u32,         // 0x0887512E +0x004 kind=1 IDA:flag_idx=0x0B
    pub effect_model_hash: u32,   // 0x0FDBD536 +0x008 kind=1 IDA:core_field[3]
    pub keep_active: u32,         // 0x0FEA9537 +0x00C kind=1 IDA:flag_idx=0x07 {0,1}
    pub particle_size_1: f32,     // 0x13EEB8F0 +0x010 kind=5 IDA:core_field[6]
    pub is_loop: u32,             // 0x21FFCD00 +0x014 kind=1 IDA:flag_idx=0x04 {0,1}
    pub is_follow_bone: u32,      // 0x2DB526FD +0x018 kind=1 IDA:flag_idx=0x03 {0,1}
    pub bone_offset_type: u32,    // 0x35B5281F +0x01C kind=1 IDA:flag_idx=0x19
    pub rotation_type: u32,       // 0x3B6EA02D +0x020 kind=1 IDA:flag_idx=0x11
    pub alignment_type: u32,      // 0x3C036434 +0x024 kind=1 IDA:flag_idx=0x15
    pub blend_mode: u32,          // 0x42B21889 +0x028 kind=1 IDA:flag_idx=0x18
    pub particle_size_2: f32,     // 0x43298ECB +0x02C kind=5 IDA:core_field[4]
    pub model_hash: u32,          // 0x49672094 +0x030 kind=1 IDA:core_field[2] shared
    pub texture_hash: u32,        // 0x4B0454A2 +0x034 kind=1 IDA:flag_idx=0x14
    pub animation_hash: u32,      // 0x4C6990BB +0x038 kind=1 IDA:flag_idx=0x10
    pub material_hash: u32,       // 0x618D354C +0x03C kind=1 IDA:flag_idx=0x06
    pub is_billboard: u32,        // 0x634CF0E5 +0x040 kind=1 IDA:flag_idx=0x02 {0,1}
    pub z_distance: f32,          // 0x64E98866 +0x044 kind=5 IDA:core_field[7] optional
    pub fade_type: u32,           // 0x6744C378 +0x048 kind=1 IDA:flag_idx=0x1A
    pub is_world_space: u32,      // 0x72E23F39 +0x04C kind=1 IDA:flag_idx=0x00 {0,1}
    pub cull_mode: u32,           // 0x76362D93 +0x050 kind=1 IDA:flag_idx=0x0E
    pub depth_test_type: u32,     // 0x7F8061B8 +0x054 kind=1 IDA:flag_idx=0x0A
    pub emit_count: u32,          // 0x918E0094 +0x058 kind=1 IDA:flag_idx=0x0C
    pub lifetime_type: u32,       // 0x96E3C48D +0x05C kind=1 IDA:flag_idx=0x08
    pub velocity_type: u32,       // 0xA267F197 +0x060 kind=1 IDA:flag_idx=0x12
    pub inherit_parent_type: u32, // 0xA50A358E +0x064 kind=1 IDA:flag_idx=0x16
    pub render_order: u32,        // 0xB8F69CBA +0x068 kind=1 IDA:flag_idx=0x05 {0,1}
    pub sort_bias: u32,           // 0xD20D0518 +0x06C kind=1 IDA:flag_idx=0x17
    pub bone_hash: u32,           // 0xD32D39ED +0x070 kind=1 IDA:core_field[1] shared
    pub second_bone_hash: u32,    // 0xD560C101 +0x074 kind=1 IDA:flag_idx=0x13
    pub effect_flag_a: u32,       // 0xE1E4F41B +0x078 kind=1 IDA:flag_idx=0x09
    pub effect_flag_b: u32,       // 0xE6893002 +0x07C kind=1 IDA:flag_idx=0x0D
    pub effect_scale: f32,        // 0xE694B5B6 +0x080 kind=5 IDA:core_field[5]
    pub hitgroup_ref: u32, // 0xEDD1C108 +0x084 kind=1 IDA:core_field[0] shared; binary-searched first
    pub is_enabled: u32,   // 0xFA45A15F +0x088 kind=1 IDA:flag_idx=0x01 {0,1}
    pub spawn_offset_y: f32, // 0xFDE0D9DC +0x08C kind=5 IDA:core_field[8] optional
}

pub const VERNIER_TABLE_FIELD_HASHES: [(u32, u32, u32); 36] = [
    (0x01311D05, 0x000, 1),
    (0x0887512E, 0x004, 1),
    (0x0FDBD536, 0x008, 1),
    (0x0FEA9537, 0x00C, 1),
    (0x13EEB8F0, 0x010, 5),
    (0x21FFCD00, 0x014, 1),
    (0x2DB526FD, 0x018, 1),
    (0x35B5281F, 0x01C, 1),
    (0x3B6EA02D, 0x020, 1),
    (0x3C036434, 0x024, 1),
    (0x42B21889, 0x028, 1),
    (0x43298ECB, 0x02C, 5),
    (0x49672094, 0x030, 1),
    (0x4B0454A2, 0x034, 1),
    (0x4C6990BB, 0x038, 1),
    (0x618D354C, 0x03C, 1),
    (0x634CF0E5, 0x040, 1),
    (0x64E98866, 0x044, 5),
    (0x6744C378, 0x048, 1),
    (0x72E23F39, 0x04C, 1),
    (0x76362D93, 0x050, 1),
    (0x7F8061B8, 0x054, 1),
    (0x918E0094, 0x058, 1),
    (0x96E3C48D, 0x05C, 1),
    (0xA267F197, 0x060, 1),
    (0xA50A358E, 0x064, 1),
    (0xB8F69CBA, 0x068, 1),
    (0xD20D0518, 0x06C, 1),
    (0xD32D39ED, 0x070, 1),
    (0xD560C101, 0x074, 1),
    (0xE1E4F41B, 0x078, 1),
    (0xE6893002, 0x07C, 1),
    (0xE694B5B6, 0x080, 5),
    (0xEDD1C108, 0x084, 1),
    (0xFA45A15F, 0x088, 1),
    (0xFDE0D9DC, 0x08C, 5),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VernierTableData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<VernierTableEntry>,
    pub trailing_data: Vec<u8>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    VERNIER_TABLE_FIELD_HASHES
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
    if field_specs.len() != VERNIER_TABLE_FIELD_HASHES.len() {
        return Err(format!(
            "vernier_table command count mismatch: file has {}, expected {}",
            field_specs.len(),
            VERNIER_TABLE_FIELD_HASHES.len()
        ));
    }
    for (index, spec) in field_specs.iter().enumerate() {
        let (expected_hash, expected_offset, expected_kind) = VERNIER_TABLE_FIELD_HASHES[index];
        if spec.hash != expected_hash
            || spec.entry_offset != expected_offset
            || spec.kind != expected_kind
        {
            return Err(format!(
                "vernier_table command mismatch at index {}: got (hash=0x{:08X}, offset=0x{:X}, kind={}), expected (hash=0x{:08X}, offset=0x{:X}, kind={})",
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

pub fn parse_vernier_table(data: &[u8]) -> Result<VernierTableData, String> {
    let file = read_param_binary(data)?;
    if file.header.entry_size != VERNIER_TABLE_ENTRY_SIZE {
        return Err(format!(
            "vernier_table entry_size mismatch: file has {}, expected {}",
            file.header.entry_size, VERNIER_TABLE_ENTRY_SIZE
        ));
    }
    if file.header.commands_count != VERNIER_TABLE_CMD_COUNT {
        return Err(format!(
            "vernier_table command count mismatch: file has {}, expected {}",
            file.header.commands_count, VERNIER_TABLE_CMD_COUNT
        ));
    }
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        if raw.len() != VERNIER_TABLE_ENTRY_SIZE as usize {
            return Err(format!(
                "vernier_table row {} size {} != expected {}",
                i,
                raw.len(),
                VERNIER_TABLE_ENTRY_SIZE
            ));
        }
        let mut cursor = Cursor::new(raw.as_slice());
        let mut entry = VernierTableEntry::read(&mut cursor).map_err(|e| e.to_string())?;
        entry.entry_id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(entry);
    }

    Ok(VernierTableData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
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

    let entry_size = VERNIER_TABLE_ENTRY_SIZE as usize;
    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for entry in &b.entries {
        let mut raw = vec![0u8; entry_size];
        let mut cursor = Cursor::new(&mut raw[..]);
        entry
            .write(&mut cursor)
            .map_err(|err| format!("vernier_table write entry: {}", err))?;
        if cursor.position() as usize > entry_size {
            return Err("vernier_table encoded entry larger than entry_size".to_string());
        }
        entries_raw.push(raw);
    }

    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = VERNIER_TABLE_CMD_COUNT;
    header.entry_size = VERNIER_TABLE_ENTRY_SIZE;

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

    const SAMPLE_DIR: &str =
        "E:\\XB\\\u{89e3}\u{5305}\\vs2\\x64\\006effect\\vernier_table";

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

        let parsed = parse_vernier_table(&source).expect("failed to parse vernier_table sample file");
        let rebuilt =
            build_vernier_table(&parsed).expect("failed to rebuild vernier_table sample file");
        assert_eq!(rebuilt, source);

        assert!(!parsed.entries.is_empty(), "vernier_table sample has no entries");

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
        assert_eq!(added_parsed.entries.last().map(|entry| entry.entry_id), Some(next_id));

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_vernier_table(&with_updated).expect("failed to build vernier_table after update");
        let updated_parsed =
            parse_vernier_table(&updated_bytes).expect("failed to parse vernier_table after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_vernier_table(&with_deleted).expect("failed to build vernier_table after delete");
        let deleted_parsed =
            parse_vernier_table(&deleted_bytes).expect("failed to parse vernier_table after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
