use binrw::{BinRead, BinWrite};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, ParamBinaryHeader, ParamFieldSpec,
};

pub const HITGROUPIDDEF_ENTRY_SIZE: u32 = 60;
pub const HITGROUPIDDEF_CMD_COUNT: u32 = 15;

#[derive(Debug, Clone, PartialEq, BinRead, BinWrite, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[brw(little)]
pub struct HitGroupIdDefEntry {
    #[brw(ignore)]
    #[serde(default)]
    pub entry_id: u32,
    pub hit_type: u32, // 0x11E501D5 +0x000 kind=1 collision shape type (0=sphere)
    pub offset_x: f32, // 0x3284A82D +0x004 kind=5 sphere center offset X
    pub offset_y: f32, // 0x42EE5CA2 +0x008 kind=5 sphere center offset Y
    pub offset_z: f32, // 0x458398BB +0x00C kind=5 sphere center offset Z
    pub radius: f32,   // 0x6514C413 +0x010 kind=5 sphere radius [9..15]
    pub enable_state: u32, // 0x7395D184 +0x014 kind=1 enable state flag
    pub scale_x: f32,  // 0x8B1AA53F +0x018 kind=5 scale X
    pub scale_y: f32,  // 0xACE03D8E +0x01C kind=5 scale Y
    pub bone_hash: u32, // 0xC3656A99 +0x020 kind=1 attached bone name hash
    pub is_enabled: u32, // 0xD32D39ED +0x024 kind=1 enable flag (shared hash)
    pub scale_z: f32,  // 0xDBE70D18 +0x028 kind=5 scale Z
    pub group_id: f32, // 0xDC8AC901 +0x02C kind=5 collision group ID [6..7]
    pub model_hash: u32, // 0xEDD1C108 +0x030 kind=1 model/resource hash (shared hash)
    pub collision_flags: u32, // 0xF89A41E1 +0x034 kind=1 collision behavior flags
    pub joint_offset: f32, // 0xFC1D95A9 +0x038 kind=5 joint offset value [-1..3]
}

pub const HITGROUPIDDEF_FIELD_HASHES: [(u32, u32, u32); 15] = [
    (0x11E501D5, 0x000, 1),
    (0x3284A82D, 0x004, 5),
    (0x42EE5CA2, 0x008, 5),
    (0x458398BB, 0x00C, 5),
    (0x6514C413, 0x010, 5),
    (0x7395D184, 0x014, 1),
    (0x8B1AA53F, 0x018, 5),
    (0xACE03D8E, 0x01C, 5),
    (0xC3656A99, 0x020, 1),
    (0xD32D39ED, 0x024, 1),
    (0xDBE70D18, 0x028, 5),
    (0xDC8AC901, 0x02C, 5),
    (0xEDD1C108, 0x030, 1),
    (0xF89A41E1, 0x034, 1),
    (0xFC1D95A9, 0x038, 5),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitGroupIdDefData {
    pub header: ParamBinaryHeader,
    pub field_specs: Vec<ParamFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries: Vec<HitGroupIdDefEntry>,
    pub trailing_data: Vec<u8>,
}

fn expected_field_specs() -> Vec<ParamFieldSpec> {
    HITGROUPIDDEF_FIELD_HASHES
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
    if field_specs.len() != HITGROUPIDDEF_FIELD_HASHES.len() {
        return Err(format!(
            "hitgroupiddef command count mismatch: file has {}, expected {}",
            field_specs.len(),
            HITGROUPIDDEF_FIELD_HASHES.len()
        ));
    }
    for (index, spec) in field_specs.iter().enumerate() {
        let (expected_hash, expected_offset, expected_kind) = HITGROUPIDDEF_FIELD_HASHES[index];
        if spec.hash != expected_hash
            || spec.entry_offset != expected_offset
            || spec.kind != expected_kind
        {
            return Err(format!(
                "hitgroupiddef command mismatch at index {}: got (hash=0x{:08X}, offset=0x{:X}, kind={}), expected (hash=0x{:08X}, offset=0x{:X}, kind={})",
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

pub fn parse_hitgroupiddef(data: &[u8]) -> Result<HitGroupIdDefData, String> {
    let file = read_param_binary(data)?;
    if file.header.entry_size != HITGROUPIDDEF_ENTRY_SIZE {
        return Err(format!(
            "hitgroupiddef entry_size mismatch: file has {}, expected {}",
            file.header.entry_size, HITGROUPIDDEF_ENTRY_SIZE
        ));
    }
    if file.header.commands_count != HITGROUPIDDEF_CMD_COUNT {
        return Err(format!(
            "hitgroupiddef command count mismatch: file has {}, expected {}",
            file.header.commands_count, HITGROUPIDDEF_CMD_COUNT
        ));
    }
    validate_field_specs(&file.field_specs)?;

    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (i, raw) in file.entries_raw.iter().enumerate() {
        if raw.len() != HITGROUPIDDEF_ENTRY_SIZE as usize {
            return Err(format!(
                "hitgroupiddef row {} size {} != expected {}",
                i,
                raw.len(),
                HITGROUPIDDEF_ENTRY_SIZE
            ));
        }
        let mut cursor = Cursor::new(raw.as_slice());
        let mut entry = HitGroupIdDefEntry::read(&mut cursor).map_err(|e| e.to_string())?;
        entry.entry_id = file.entry_ids.get(i).copied().unwrap_or(0);
        entries.push(entry);
    }

    Ok(HitGroupIdDefData {
        header: file.header,
        field_specs: file.field_specs,
        entry_ids: file.entry_ids,
        entries,
        trailing_data: file.trailing_data,
    })
}

pub fn build_hitgroupiddef(b: &HitGroupIdDefData) -> Result<Vec<u8>, String> {
    if !b.field_specs.is_empty() {
        validate_field_specs(&b.field_specs)?;
    }
    let field_specs = if b.field_specs.is_empty() {
        expected_field_specs()
    } else {
        b.field_specs.clone()
    };

    let entry_size = HITGROUPIDDEF_ENTRY_SIZE as usize;
    let mut entries_raw: Vec<Vec<u8>> = Vec::with_capacity(b.entries.len());
    for entry in &b.entries {
        let mut raw = vec![0u8; entry_size];
        let mut cursor = Cursor::new(&mut raw[..]);
        entry
            .write(&mut cursor)
            .map_err(|err| format!("hitgroupiddef write entry: {}", err))?;
        if cursor.position() as usize > entry_size {
            return Err("hitgroupiddef encoded entry larger than entry_size".to_string());
        }
        entries_raw.push(raw);
    }

    let mut header = b.header.clone();
    header.entry_count = b.entries.len() as u32;
    header.commands_count = HITGROUPIDDEF_CMD_COUNT;
    header.entry_size = HITGROUPIDDEF_ENTRY_SIZE;

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
        "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\hitgroupiddef.bin";

    #[test]
    fn hitgroupiddef_read_write_crud() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read hitgroupiddef sample file");

        let parsed =
            parse_hitgroupiddef(&source).expect("failed to parse hitgroupiddef sample file");
        let rebuilt =
            build_hitgroupiddef(&parsed).expect("failed to rebuild hitgroupiddef sample file");
        assert_eq!(rebuilt, source);

        assert!(!parsed.entries.is_empty(), "hitgroupiddef sample has no entries");

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
            build_hitgroupiddef(&with_added).expect("failed to build hitgroupiddef after add");
        let added_parsed =
            parse_hitgroupiddef(&added_bytes).expect("failed to parse hitgroupiddef after add");
        assert_eq!(added_parsed.entries.len(), parsed.entries.len() + 1);
        assert_eq!(added_parsed.entries.last().map(|entry| entry.entry_id), Some(next_id));

        let mut with_updated = added_parsed.clone();
        let updated_id = with_updated.entries[0].entry_id.wrapping_add(99);
        with_updated.entries[0].entry_id = updated_id;
        let updated_bytes = build_hitgroupiddef(&with_updated)
            .expect("failed to build hitgroupiddef after update");
        let updated_parsed = parse_hitgroupiddef(&updated_bytes)
            .expect("failed to parse hitgroupiddef after update");
        assert_eq!(updated_parsed.entries[0].entry_id, updated_id);

        let mut with_deleted = updated_parsed.clone();
        with_deleted.entries.pop();
        let deleted_bytes = build_hitgroupiddef(&with_deleted)
            .expect("failed to build hitgroupiddef after delete");
        let deleted_parsed = parse_hitgroupiddef(&deleted_bytes)
            .expect("failed to parse hitgroupiddef after delete");
        assert_eq!(deleted_parsed.entries.len(), parsed.entries.len());
    }
}
