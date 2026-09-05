//! Common-bundle camera parameter tables (`camera/parameters/*.vgsht2`).
//!
//! 220-byte rows. Named overlay is table-pinned on OB `02winlose.vgsht2`:
//! clip hash (word25 / `0x980ABFA6`), sort key (word43 / `0xE52F114D`),
//! FOV (word16 / `0x749B8F0E`), offset (word40 / `0xD20F0173`),
//! first-shot flag (word11 / `0x4AF79689`). Clip hash is what `sys_53(0x4, hash)`
//! looks up. Do not invent clip hashes; do not treat row ids as `sys_53` args.

use crate::format::param_bin_format::{
    build_param_binary, read_param_binary, ParamBinaryFile, PARAM_BIN_MAGIC,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

pub const PACK_HASH: &str = "0xCB665375";
pub const PACK_NAME: &str = "000common_000common_001";
pub const PARAMETERS_DIR: &str = "camera/parameters";
pub const DEFAULT_FAMILY: &str = "02winlose";
pub const ENTRY_SIZE: u32 = 220;

pub const CMD_FIRST_SHOT: u32 = 0x4AF7_9689;
pub const CMD_FOV: u32 = 0x749B_8F0E;
pub const CMD_CLIP_HASH: u32 = 0x980A_BFA6;
pub const CMD_OFFSET: u32 = 0xD20F_0173;
pub const CMD_SORT_KEY: u32 = 0xE52F_114D;

pub const OFF_FIRST_SHOT: usize = 0x2C;
pub const OFF_FOV: usize = 0x40;
pub const OFF_CLIP_HASH: usize = 0x64;
pub const OFF_OFFSET: usize = 0xA0;
pub const OFF_SORT_KEY: usize = 0xAC;

pub const FAMILIES: &[&str] = &["00system", "01waza", "02winlose", "03cpubattle"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraTableHeader {
    pub magic: u32,
    pub unk_04: u32,
    pub file_size: u32,
    pub unk_0c: u32,
    pub entry_count: u32,
    pub commands_count: u32,
    pub entry_size: u32,
    pub unk_1c: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraFieldSpec {
    pub hash: u32,
    pub entry_offset: u32,
    pub flags: u32,
    pub kind: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraTableEntry {
    pub entry_id: u32,
    pub entry_index: u32,
    pub clip_hash: u32,
    pub sort_key: u32,
    pub fov: Option<f32>,
    pub offset: f32,
    pub first_shot: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraTableFile {
    pub header: CameraTableHeader,
    pub field_specs: Vec<CameraFieldSpec>,
    pub entry_ids: Vec<u32>,
    pub entries_raw: Vec<Vec<u8>>,
    pub trailing_data: Vec<u8>,
    pub entries: Vec<CameraTableEntry>,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub family: Option<String>,
}

pub fn family_file_name(family: &str) -> Result<String, String> {
    let trimmed = family.trim();
    if !FAMILIES.iter().any(|id| *id == trimmed) {
        return Err(format!(
            "Unknown camera family '{trimmed}'. Use one of: {}",
            FAMILIES.join(", ")
        ));
    }
    Ok(format!("{trimmed}.vgsht2"))
}

pub fn discover_camera_table(folder_path: &Path, family: &str) -> Result<PathBuf, String> {
    let file_name = family_file_name(family)?;
    let path = folder_path.join(PARAMETERS_DIR).join(&file_name);
    if path.is_file() {
        return Ok(path);
    }
    Err(format!(
        "Camera table not found: {} (extract EXVS common pack {PACK_HASH})",
        path.display()
    ))
}

fn required_offset(file: &ParamBinaryFile, hash: u32, expected: usize) -> Result<usize, String> {
    let spec = file
        .field_specs
        .iter()
        .find(|spec| spec.hash == hash)
        .ok_or_else(|| format!("camera table missing command 0x{hash:08X}"))?;
    let offset = spec.entry_offset as usize;
    if offset != expected {
        return Err(format!(
            "camera table command 0x{hash:08X} offset 0x{offset:X} != 0x{expected:X}"
        ));
    }
    if offset + 4 > file.header.entry_size as usize {
        return Err(format!(
            "camera table command 0x{hash:08X} offset 0x{offset:X} out of entry"
        ));
    }
    Ok(offset)
}

fn read_u32_at(raw: &[u8], offset: usize) -> Result<u32, String> {
    let bytes = raw
        .get(offset..offset + 4)
        .ok_or_else(|| format!("u32 out of range at 0x{offset:X}"))?;
    Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn read_f32_at(raw: &[u8], offset: usize) -> Result<f32, String> {
    let bytes = raw
        .get(offset..offset + 4)
        .ok_or_else(|| format!("f32 out of range at 0x{offset:X}"))?;
    Ok(f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn write_u32_at(raw: &mut [u8], offset: usize, value: u32) -> Result<(), String> {
    if offset + 4 > raw.len() {
        return Err(format!("u32 write out of range at 0x{offset:X}"));
    }
    raw[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn write_f32_at(raw: &mut [u8], offset: usize, value: f32) -> Result<(), String> {
    if offset + 4 > raw.len() {
        return Err(format!("f32 write out of range at 0x{offset:X}"));
    }
    raw[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn finite_f32(value: f32) -> Option<f32> {
    if value.is_finite() {
        Some(value)
    } else {
        None
    }
}

pub fn parse_bytes(data: &[u8]) -> Result<ParamBinaryFile, String> {
    let parsed = read_param_binary(data)?;
    if parsed.header.magic != PARAM_BIN_MAGIC {
        return Err(format!(
            "Invalid magic: 0x{:08X}, expected 0x{PARAM_BIN_MAGIC:08X}",
            parsed.header.magic
        ));
    }
    if parsed.header.entry_size != ENTRY_SIZE {
        return Err(format!(
            "camera table entry_size 0x{:X} != 0x{ENTRY_SIZE:X}",
            parsed.header.entry_size
        ));
    }
    required_offset(&parsed, CMD_FIRST_SHOT, OFF_FIRST_SHOT)?;
    required_offset(&parsed, CMD_FOV, OFF_FOV)?;
    required_offset(&parsed, CMD_CLIP_HASH, OFF_CLIP_HASH)?;
    required_offset(&parsed, CMD_OFFSET, OFF_OFFSET)?;
    required_offset(&parsed, CMD_SORT_KEY, OFF_SORT_KEY)?;
    Ok(parsed)
}

fn overlay_entries(file: &ParamBinaryFile) -> Result<Vec<CameraTableEntry>, String> {
    let mut entries = Vec::with_capacity(file.entries_raw.len());
    for (entry_index, raw) in file.entries_raw.iter().enumerate() {
        if raw.len() < ENTRY_SIZE as usize {
            return Err(format!(
                "entry {entry_index} raw size {} < {ENTRY_SIZE}",
                raw.len()
            ));
        }
        let fov = read_f32_at(raw, OFF_FOV)?;
        entries.push(CameraTableEntry {
            entry_id: file.entry_ids.get(entry_index).copied().unwrap_or(0),
            entry_index: entry_index as u32,
            clip_hash: read_u32_at(raw, OFF_CLIP_HASH)?,
            sort_key: read_u32_at(raw, OFF_SORT_KEY)?,
            fov: finite_f32(fov),
            offset: read_f32_at(raw, OFF_OFFSET)?,
            first_shot: read_u32_at(raw, OFF_FIRST_SHOT)?,
        });
    }
    Ok(entries)
}

fn family_from_path(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_string_lossy();
    FAMILIES
        .iter()
        .find(|id| **id == stem.as_ref())
        .map(|id| (*id).to_string())
}

fn file_to_json(file: ParamBinaryFile, path: &Path) -> Result<Value, String> {
    let entries = overlay_entries(&file)?;
    let payload = CameraTableFile {
        header: CameraTableHeader {
            magic: file.header.magic,
            unk_04: file.header.unk_04,
            file_size: file.header.file_size,
            unk_0c: file.header.unk_0c,
            entry_count: file.header.entry_count,
            commands_count: file.header.commands_count,
            entry_size: file.header.entry_size,
            unk_1c: file.header.unk_1c,
        },
        field_specs: file
            .field_specs
            .into_iter()
            .map(|spec| CameraFieldSpec {
                hash: spec.hash,
                entry_offset: spec.entry_offset,
                flags: spec.flags,
                kind: spec.kind,
            })
            .collect(),
        entry_ids: file.entry_ids,
        entries_raw: file.entries_raw,
        trailing_data: file.trailing_data,
        entries,
        file_path: Some(path.to_string_lossy().to_string()),
        family: family_from_path(path),
    };
    serde_json::to_value(payload).map_err(|e| format!("Serialize failed: {e}"))
}

pub fn parse_file(path: &str) -> Result<Value, String> {
    let path = Path::new(path);
    let bytes = fs::read(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let parsed = parse_bytes(&bytes)?;
    file_to_json(parsed, path)
}

pub fn parse_pack(folder_path: &str, family: &str) -> Result<Value, String> {
    let path = discover_camera_table(Path::new(folder_path), family)?;
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let parsed = parse_bytes(&bytes)?;
    file_to_json(parsed, &path)
}

fn apply_named_overlay(file: &mut ParamBinaryFile, entries: &[CameraTableEntry]) -> Result<(), String> {
    if entries.len() != file.entries_raw.len() {
        return Err(format!(
            "camera table entry count {} != raw count {}",
            entries.len(),
            file.entries_raw.len()
        ));
    }
    for (index, entry) in entries.iter().enumerate() {
        let raw = file
            .entries_raw
            .get_mut(index)
            .ok_or_else(|| format!("missing raw entry {index}"))?;
        if raw.len() < ENTRY_SIZE as usize {
            raw.resize(ENTRY_SIZE as usize, 0);
        }
        let fov = entry.fov.unwrap_or(f32::NAN);
        write_u32_at(raw, OFF_FIRST_SHOT, entry.first_shot)?;
        write_f32_at(raw, OFF_FOV, fov)?;
        write_f32_at(raw, OFF_OFFSET, entry.offset)?;
    }
    Ok(())
}

pub fn write_pack(data_json: &Value, file_path: &str) -> Result<Value, String> {
    let mut payload: CameraTableFile =
        serde_json::from_value(data_json.clone()).map_err(|e| format!("Deserialize failed: {e}"))?;
    if payload.entries.len() != payload.entries_raw.len() {
        return Err("entries and entriesRaw length mismatch".to_string());
    }
    if payload.entry_ids.len() != payload.entries_raw.len() {
        return Err("entryIds and entriesRaw length mismatch".to_string());
    }
    if payload.header.entry_size != ENTRY_SIZE {
        return Err(format!(
            "camera table entry_size 0x{:X} != 0x{ENTRY_SIZE:X}",
            payload.header.entry_size
        ));
    }

    let mut file = ParamBinaryFile {
        header: crate::format::param_bin_format::ParamBinaryHeader {
            magic: if payload.header.magic == 0 {
                PARAM_BIN_MAGIC
            } else {
                payload.header.magic
            },
            unk_04: payload.header.unk_04,
            file_size: payload.header.file_size,
            unk_0c: payload.header.unk_0c,
            entry_count: payload.entry_ids.len() as u32,
            commands_count: payload.field_specs.len() as u32,
            entry_size: ENTRY_SIZE,
            unk_1c: payload.header.unk_1c,
        },
        field_specs: payload
            .field_specs
            .iter()
            .map(|spec| crate::format::param_bin_format::ParamFieldSpec {
                hash: spec.hash,
                entry_offset: spec.entry_offset,
                flags: spec.flags,
                kind: spec.kind,
            })
            .collect(),
        entry_ids: payload.entry_ids.clone(),
        entries_raw: payload.entries_raw.clone(),
        trailing_data: payload.trailing_data.clone(),
    };
    apply_named_overlay(&mut file, &payload.entries)?;
    let bytes = build_param_binary(&file)?;
    parse_bytes(&bytes)?;
    fs::write(file_path, &bytes).map_err(|e| format!("Write failed: {e}"))?;
    payload.file_path = Some(file_path.to_string());
    payload.entries = overlay_entries(&file)?;
    payload.entries_raw = file.entries_raw;
    payload.header.file_size = bytes.len() as u32;
    payload.header.entry_count = file.entry_ids.len() as u32;
    payload.header.commands_count = file.field_specs.len() as u32;
    serde_json::to_value(payload).map_err(|e| format!("Serialize failed: {e}"))
}

pub fn empty_synthetic_specs() -> Vec<CameraFieldSpec> {
    vec![
        CameraFieldSpec {
            hash: CMD_FIRST_SHOT,
            entry_offset: OFF_FIRST_SHOT as u32,
            flags: 0,
            kind: 1,
        },
        CameraFieldSpec {
            hash: CMD_FOV,
            entry_offset: OFF_FOV as u32,
            flags: 0,
            kind: 5,
        },
        CameraFieldSpec {
            hash: CMD_CLIP_HASH,
            entry_offset: OFF_CLIP_HASH as u32,
            flags: 0,
            kind: 1,
        },
        CameraFieldSpec {
            hash: CMD_OFFSET,
            entry_offset: OFF_OFFSET as u32,
            flags: 0,
            kind: 5,
        },
        CameraFieldSpec {
            hash: CMD_SORT_KEY,
            entry_offset: OFF_SORT_KEY as u32,
            flags: 0,
            kind: 1,
        },
    ]
}

pub fn build_synthetic_row(
    clip_hash: u32,
    sort_key: u32,
    fov: Option<f32>,
    offset: f32,
    first_shot: u32,
) -> Vec<u8> {
    let mut raw = vec![0u8; ENTRY_SIZE as usize];
    let _ = write_u32_at(&mut raw, OFF_FIRST_SHOT, first_shot);
    let _ = write_f32_at(&mut raw, OFF_FOV, fov.unwrap_or(f32::NAN));
    let _ = write_u32_at(&mut raw, OFF_CLIP_HASH, clip_hash);
    let _ = write_f32_at(&mut raw, OFF_OFFSET, offset);
    let _ = write_u32_at(&mut raw, OFF_SORT_KEY, sort_key);
    raw
}

/// Debug helper used by the format test; returns a JSON object for inspection.
pub fn synthetic_json_for_tests() -> Value {
    json!({
        "packHash": PACK_HASH,
        "defaultFamily": DEFAULT_FAMILY,
    })
}
