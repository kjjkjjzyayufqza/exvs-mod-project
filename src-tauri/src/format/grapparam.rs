use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};

pub const GRAPPARAM_ENTRY_SIZE: u32 = 64;
pub const GRAPPARAM_CMD_COUNT: u32 = 16;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct GrapParamEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub down_value: i32,       // 0x17A9E2E1 +0x000 range=[-6,60]
    pub charge_frame: i32,     // 0x2272E3D6 +0x004 range=[0,300] usually 0
    pub grap_total_frame: i32, // 0x35857659 +0x008 range=[0,400]
    pub stun_value: i32,       // 0x465D80C6 +0x00C range=[0,80]
    pub grap_priority: i32,    // 0x534643A2 +0x010 range=[0,60] often=10
    pub startup_frame: i32,    // 0x550BCFAD +0x014 range=[0,350]
    pub tracking_frame: i32,   // 0x55B8FC51 +0x018 range=[0,300]
    pub damage: i32,           // 0x6906F0F4 +0x01C range=[0,600]
    pub correction_pct: i32,   // 0x7755981E +0x020 range=[0,100] often=98
    pub reach: i32,            // 0x83E900CD +0x024 range=[0,40]
    pub cancel_frame: i32,     // 0x976F9803 +0x028 range=[0,40]
    pub recovery_frame: i32,   // 0x99D42DBB +0x02C range=[0,60]
    pub is_multi_hit: i32,     // 0xA89F3A61 +0x030 range=[0,1]
    pub damage_2nd: i32,       // 0xB084851E +0x034 range=[0,550]
    pub damage_last: i32,      // 0xBEC81A41 +0x038 range=[0,550]
    pub down_value_last: i32,  // 0xC21ED1D8 +0x03C range=[0,100]
}

pub const GRAPPARAM_FIELD_HASHES: [(u32, u32, u32); 16] = [
    (0x17A9E2E1, 0x000, 2),
    (0x2272E3D6, 0x004, 2),
    (0x35857659, 0x008, 2),
    (0x465D80C6, 0x00C, 2),
    (0x534643A2, 0x010, 2),
    (0x550BCFAD, 0x014, 2),
    (0x55B8FC51, 0x018, 2),
    (0x6906F0F4, 0x01C, 2),
    (0x7755981E, 0x020, 2),
    (0x83E900CD, 0x024, 2),
    (0x976F9803, 0x028, 2),
    (0x99D42DBB, 0x02C, 2),
    (0xA89F3A61, 0x030, 2),
    (0xB084851E, 0x034, 2),
    (0xBEC81A41, 0x038, 2),
    (0xC21ED1D8, 0x03C, 2),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrapParamData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<GrapParamEntry>,
    pub trailing_data: Vec<u8>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    GRAPPARAM_FIELD_HASHES
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
    if field_specs.len() != GRAPPARAM_FIELD_HASHES.len() {
        return Err(format!(
            "grapparam command count mismatch: file has {}, expected {}",
            field_specs.len(),
            GRAPPARAM_FIELD_HASHES.len()
        ));
    }
    for (index, spec) in field_specs.iter().enumerate() {
        let (expected_hash, expected_offset, expected_kind) = GRAPPARAM_FIELD_HASHES[index];
        if spec.hash != expected_hash
            || spec.entry_offset != expected_offset
            || spec.kind != expected_kind
        {
            return Err(format!(
                "grapparam command mismatch at index {}: got (hash=0x{:08X}, offset=0x{:X}, kind={}), expected (hash=0x{:08X}, offset=0x{:X}, kind={})",
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

pub fn parse_grapparam(data: &[u8]) -> Result<GrapParamData, String> {
    let file = read_param_binary(data)?;
    if file.header.entry_size != GRAPPARAM_ENTRY_SIZE {
        return Err(format!(
            "grapparam entry_size mismatch: file has {}, expected {}",
            file.header.entry_size, GRAPPARAM_ENTRY_SIZE
        ));
    }
    if file.header.commands_count != GRAPPARAM_CMD_COUNT {
        return Err(format!(
            "grapparam command count mismatch: file has {}, expected {}",
            file.header.commands_count, GRAPPARAM_CMD_COUNT
        ));
    }
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        if raw.len() != GRAPPARAM_ENTRY_SIZE as usize {
            return Err(format!(
                "grapparam row {} size {} != expected {}",
                i,
                raw.len(),
                GRAPPARAM_ENTRY_SIZE
            ));
        }
        let mut cursor = Cursor::new(raw.as_slice());
        let mut entry = GrapParamEntry::read(&mut cursor).map_err(|e| e.to_string())?;
        entry.entry_id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(entry);
    }

    Ok(GrapParamData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
    })
}

pub fn build_grapparam(b: &GrapParamData) -> Result<Vec<u8>, String> {
    if !b.field_specs.is_empty() {
        validate_field_specs(&b.field_specs)?;
    }
    let field_specs = if b.field_specs.is_empty() {
        expected_field_specs()
    } else {
        b.field_specs.clone()
    };

    let entry_size = GRAPPARAM_ENTRY_SIZE as usize;
    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for entry in &b.entries {
        let mut raw = vec![0u8; entry_size];
        let mut cursor = Cursor::new(&mut raw[..]);
        entry
            .write(&mut cursor)
            .map_err(|err| format!("grapparam write entry: {}", err))?;
        if cursor.position() as usize > entry_size {
            return Err("grapparam encoded entry larger than entry_size".to_string());
        }
        entries_raw.push(raw);
    }

    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = GRAPPARAM_CMD_COUNT;
    header.entry_size = GRAPPARAM_ENTRY_SIZE;

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
        "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\grapparam.bin";

    #[test]
    fn grapparam_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read grapparam sample file");

        let parsed = parse_grapparam(&source).expect("failed to parse grapparam sample file");
        let rebuilt = build_grapparam(&parsed).expect("failed to rebuild grapparam sample file");
        assert_eq!(rebuilt, source);

        assert!(!parsed.entries.is_empty(), "grapparam sample has no entries");

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
            build_grapparam(&with_added).expect("failed to build grapparam after add");
        let added_parsed =
            parse_grapparam(&added_bytes).expect("failed to parse grapparam after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(added_parsed.entries.last().map(|entry| entry.entry_id), Some(next_id));

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes =
            build_grapparam(&with_updated).expect("failed to build grapparam after update");
        let updated_parsed =
            parse_grapparam(&updated_bytes).expect("failed to parse grapparam after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes =
            build_grapparam(&with_deleted).expect("failed to build grapparam after delete");
        let deleted_parsed =
            parse_grapparam(&deleted_bytes).expect("failed to parse grapparam after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
