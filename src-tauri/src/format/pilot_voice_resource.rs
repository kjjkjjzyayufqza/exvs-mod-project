//! `pilotvoiceresourcetable.vrtbl` (090sound pack `0x8C428AF2`, subfile 3).
//!
//! Linear-scanned voiceKey table. New rows append; `dummyPackage` is the
//! global constant `0x147BC38E`. Spec: `docs/exvs2-audio-voice-bgm-indexing.md`.

use crate::format::param_entry_schema::read_u32_le;
use crate::format::raw_path_id::{backup_orig, crc32_ieee, parse_voice_stem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const PACK_HASH: &str = "0x8C428AF2";
pub const FILE_NAME: &str = "pilotvoiceresourcetable.vrtbl";
pub const DUMMY_PACKAGE: u32 = 0x147B_C38E;
pub const DEFAULT_DONOR_STEM: &str = "VO_0016_P01_0";
pub const VERSION: u32 = 3;
const HEADER_SIZE: usize = 0x14;
const RECORD_SIZE: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PilotVoiceResourceRecord {
    pub voice_key: u32,
    pub vot_package: u32,
    pub dummy_package: u32,
    pub bank_package: u32,
    pub stream_path_id: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice_stem: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PilotVoiceResourceTable {
    pub version: u32,
    pub records: Vec<PilotVoiceResourceRecord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PilotVoiceResourcePack {
    pub table: PilotVoiceResourceTable,
    pub file_path: String,
}

pub fn parse_bytes(data: &[u8]) -> Result<PilotVoiceResourceTable, String> {
    if data.len() < HEADER_SIZE {
        return Err("pilotvoiceresourcetable.vrtbl is too small".to_string());
    }
    let version = u32_at(data, 0)?;
    if version != VERSION {
        return Err(format!(
            "pilotvoiceresourcetable.vrtbl version {version} != {VERSION}"
        ));
    }
    let count = u32_at(data, 0x10)? as usize;
    let expect = HEADER_SIZE + count * RECORD_SIZE;
    if data.len() != expect {
        return Err(format!(
            "pilotvoiceresourcetable.vrtbl size {} != {expect} (count {count})",
            data.len()
        ));
    }
    let mut records = Vec::with_capacity(count);
    for i in 0..count {
        let off = HEADER_SIZE + i * RECORD_SIZE;
        let voice_key = u32_at(data, off)?;
        records.push(PilotVoiceResourceRecord {
            voice_key,
            vot_package: u32_at(data, off + 4)?,
            dummy_package: u32_at(data, off + 8)?,
            bank_package: u32_at(data, off + 12)?,
            stream_path_id: u32_at(data, off + 16)?,
            voice_stem: stem_for_voice_key(voice_key).map(str::to_string),
        });
    }
    Ok(PilotVoiceResourceTable { version, records })
}

pub fn build_bytes(table: &PilotVoiceResourceTable) -> Result<Vec<u8>, String> {
    let count = table.records.len();
    let mut out = vec![0u8; HEADER_SIZE + count * RECORD_SIZE];
    put_u32(&mut out, 0, VERSION);
    put_u32(&mut out, 0x10, count as u32);
    for (i, record) in table.records.iter().enumerate() {
        let off = HEADER_SIZE + i * RECORD_SIZE;
        put_u32(&mut out, off, record.voice_key);
        put_u32(&mut out, off + 4, record.vot_package);
        put_u32(&mut out, off + 8, record.dummy_package);
        put_u32(&mut out, off + 12, record.bank_package);
        put_u32(&mut out, off + 16, record.stream_path_id);
    }
    Ok(out)
}

pub fn parse_pack(folder_path: &str) -> Result<PilotVoiceResourcePack, String> {
    if folder_path.trim().is_empty() {
        return Err("Folder path is empty".to_string());
    }
    let file_path = discover_vrtbl(Path::new(folder_path))?;
    let bytes =
        fs::read(&file_path).map_err(|e| format!("Failed to read {}: {e}", file_path.display()))?;
    Ok(PilotVoiceResourcePack {
        table: parse_bytes(&bytes)?,
        file_path: file_path.to_string_lossy().into_owned(),
    })
}

pub fn empty_record() -> PilotVoiceResourceRecord {
    PilotVoiceResourceRecord {
        voice_key: 0,
        vot_package: 0,
        dummy_package: 0,
        bank_package: 0,
        stream_path_id: 0,
        voice_stem: Some(String::new()),
    }
}

pub fn empty_fields(record: &PilotVoiceResourceRecord) -> Vec<&'static str> {
    let mut fields = Vec::new();
    if record.voice_stem.as_deref().unwrap_or("").trim().is_empty() {
        fields.push("voice");
    }
    if record.voice_key == 0 {
        fields.push("voiceKey");
    }
    if record.stream_path_id == 0 {
        fields.push("streamPathId");
    }
    if record.vot_package == 0 {
        fields.push("votPackage");
    }
    if record.dummy_package == 0 {
        fields.push("dummyPackage");
    }
    if record.bank_package == 0 {
        fields.push("bankPackage");
    }
    fields
}

pub fn apply_stem_keys(
    record: &PilotVoiceResourceRecord,
) -> Result<PilotVoiceResourceRecord, String> {
    let raw = record.voice_stem.as_deref().unwrap_or("").trim();
    if raw.is_empty() {
        return Ok(PilotVoiceResourceRecord {
            voice_key: 0,
            stream_path_id: 0,
            voice_stem: Some(String::new()),
            ..record.clone()
        });
    }
    let stem = parse_voice_stem(raw)?;
    Ok(PilotVoiceResourceRecord {
        voice_key: crc32_ieee(stem.as_bytes()),
        stream_path_id: crc32_ieee(format!("STREAMPATH_ST_{stem}").as_bytes()),
        voice_stem: Some(stem),
        vot_package: record.vot_package,
        dummy_package: record.dummy_package,
        bank_package: record.bank_package,
    })
}

pub fn write_pack(
    table: &PilotVoiceResourceTable,
    file_path: &str,
) -> Result<PilotVoiceResourceTable, String> {
    let mut next = table.clone();
    for (index, record) in next.records.iter_mut().enumerate() {
        *record = apply_stem_keys(record)?;
        if let Some(stem) = stem_for_voice_key(record.voice_key) {
            record.voice_stem = Some(stem.to_string());
        }
        let missing = empty_fields(record);
        if !missing.is_empty() {
            return Err(format!(
                "Row {index} has empty fields: {}",
                missing.join(", ")
            ));
        }
    }
    let bytes = build_bytes(&next)?;
    let path = Path::new(file_path);
    backup_orig(path)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
        }
    }
    fs::write(path, bytes).map_err(|e| format!("Failed to write {}: {e}", path.display()))?;
    Ok(next)
}

pub fn is_vrtbl_payload(bytes: &[u8]) -> bool {
    parse_bytes(bytes).is_ok()
}

fn discover_vrtbl(folder: &Path) -> Result<PathBuf, String> {
    let known = folder.join(FILE_NAME);
    if known.is_file() {
        return Ok(known);
    }
    let mut found = None;
    let entries = fs::read_dir(folder).map_err(|_| {
        format!(
            "No {FILE_NAME} found in {}. Extract pack {PACK_HASH} with type sound.",
            folder.display()
        )
    })?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if name.ends_with("_structure.json") || name == "meta.bin" {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        if !is_vrtbl_payload(&bytes) {
            continue;
        }
        if found.is_some() {
            return Err(format!("Multiple vrtbl files under {}", folder.display()));
        }
        found = Some(path);
    }
    found.ok_or_else(|| {
        format!(
            "No {FILE_NAME} found in {}. Extract pack {PACK_HASH} with type sound.",
            folder.display()
        )
    })
}

fn stem_for_voice_key(voice_key: u32) -> Option<&'static str> {
    static MAP: OnceLock<HashMap<u32, String>> = OnceLock::new();
    MAP.get_or_init(build_voice_stem_map)
        .get(&voice_key)
        .map(String::as_str)
}

fn build_voice_stem_map() -> HashMap<u32, String> {
    let mut map = HashMap::with_capacity(324_000);
    let mut works: Vec<u32> = (0..200).collect();
    for extra in [900u32, 1000] {
        if !works.contains(&extra) {
            works.push(extra);
        }
    }
    for work in works {
        for kind in ['P', 'N'] {
            for slot in 0..80u32 {
                for variant in 0..10u32 {
                    let stem = format!("VO_{work:04}_{kind}{slot:02}_{variant}");
                    map.insert(crc32_ieee(stem.as_bytes()), stem);
                }
            }
        }
    }
    map
}

fn u32_at(data: &[u8], offset: usize) -> Result<u32, String> {
    read_u32_le(data, offset).ok_or_else(|| format!("vrtbl offset {offset} out of range"))
}

fn put_u32(buf: &mut [u8], offset: usize, value: u32) {
    buf[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}
