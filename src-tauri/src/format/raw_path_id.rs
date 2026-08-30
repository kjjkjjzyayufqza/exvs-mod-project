//! `raw_path_id` stream table (`raw_path_id_release.json` + `.vgsht1`).
//!
//! JSON owns `source` / `kind` / key order. The vgsht1 is a sorted CRC32-id
//! index of obfuscated `SHA1(source)+ext` strings, rebuilt wholesale on save.
//! Spec: `docs/exvs2-audio-voice-bgm-indexing.md`.

use crate::format::obf_string::{obf_decode_to_string, obf_encode_from_string};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const VGSHT1_MAGIC: u32 = 0xCEAB_B8A9;
pub const RECORD_STRIDE: u32 = 0x18;
pub const JSON_FILE_NAME: &str = "raw_path_id_release.json";
pub const VGSHT1_FILE_NAME: &str = "raw_path_id_release.vgsht1";
pub const PACK_HASH: &str = "0x264D1CA7";

const HEX: &[u8; 16] = b"0123456789abcdef";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RawPathIdKind {
    Stream,
    Movie,
    Net,
}

impl RawPathIdKind {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "stream" => Some(Self::Stream),
            "movie" => Some(Self::Movie),
            "net" => Some(Self::Net),
            _ => None,
        }
    }
}

impl Default for RawPathIdKind {
    fn default() -> Self {
        Self::Stream
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawPathIdEntry {
    pub key: String,
    pub hash: u32,
    pub kind: RawPathIdKind,
    pub source: String,
    pub path: String,
    pub param01_low: u32,
    pub param01_high: u32,
    pub param02_low: u32,
    pub param02_high: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawPathIdDocument {
    pub entries: Vec<RawPathIdEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawPathIdParseIssue {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawPathIdPack {
    pub document: RawPathIdDocument,
    pub issues: Vec<RawPathIdParseIssue>,
    pub json_path: String,
    pub vgsht1_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeRawPathIdInput {
    pub key: String,
    pub source: String,
    pub kind: Option<RawPathIdKind>,
    pub param01_low: Option<u32>,
    pub param01_high: Option<u32>,
    pub param02_low: Option<u32>,
    pub param02_high: Option<u32>,
}

pub fn crc32_ieee(bytes: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &b in bytes {
        crc ^= u32::from(b);
        for _ in 0..8 {
            if crc & 1 != 0 {
                crc = (crc >> 1) ^ 0xEDB8_8320;
            } else {
                crc >>= 1;
            }
        }
    }
    !crc
}

pub fn sha1_hex(bytes: &[u8]) -> String {
    to_hex(&Sha1::digest(bytes))
}

pub fn hashed_stream_file_name(source: &str) -> String {
    let trimmed = normalize_source(source);
    let base = trimmed.rsplit('/').next().unwrap_or(trimmed.as_str());
    let ext = match base.rfind('.') {
        Some(dot) if dot > 0 => &base[dot..],
        _ => "",
    };
    format!("{}{}", sha1_hex(trimmed.as_bytes()), ext)
}

pub fn finalize_entry(input: FinalizeRawPathIdInput) -> Result<RawPathIdEntry, String> {
    let key = input.key.trim().to_string();
    let source = normalize_source(&input.source);
    if key.is_empty() {
        return Err("Stream key is required".to_string());
    }
    if source.is_empty() {
        return Err("Stream source path is required".to_string());
    }
    Ok(RawPathIdEntry {
        hash: crc32_ieee(key.as_bytes()),
        path: hashed_stream_file_name(&source),
        key,
        source,
        kind: input.kind.unwrap_or_default(),
        param01_low: input.param01_low.unwrap_or(0),
        param01_high: input.param01_high.unwrap_or(0),
        param02_low: input.param02_low.unwrap_or(0),
        param02_high: input.param02_high.unwrap_or(0),
    })
}

pub fn derive_pilot_voice_entry(voice_stem: &str) -> Result<RawPathIdEntry, String> {
    let (key, source) = derive_pilot_voice_source(voice_stem)?;
    finalize_entry(FinalizeRawPathIdInput {
        key,
        source,
        kind: Some(RawPathIdKind::Stream),
        param01_low: None,
        param01_high: None,
        param02_low: None,
        param02_high: None,
    })
}

pub fn derive_pilot_voice_source(voice_stem: &str) -> Result<(String, String), String> {
    let stem = parse_voice_stem(voice_stem)?;
    let digits = &stem[3..7];
    Ok((
        format!("STREAMPATH_ST_{stem}"),
        format!("091waveform/voice/pilot/vo_{digits}/{stem}_01_ST_01.nus3audio"),
    ))
}

pub fn parse_json(text: &str) -> Result<(RawPathIdDocument, Vec<RawPathIdParseIssue>), String> {
    let value: Value =
        serde_json::from_str(text).map_err(|e| format!("raw_path_id JSON parse failed: {e}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "raw_path_id JSON must be an object of stream keys".to_string())?;
    let mut entries = Vec::with_capacity(object.len());
    let mut issues = Vec::new();
    for (key, raw) in object {
        let rec = raw
            .as_object()
            .ok_or_else(|| format!("{key}: entry must be an object"))?;
        let kind_raw = rec.get("kind").and_then(Value::as_str).unwrap_or("stream");
        let kind = match RawPathIdKind::parse(kind_raw) {
            Some(kind) => kind,
            None => {
                issues.push(RawPathIdParseIssue {
                    code: "unknown_kind".to_string(),
                    message: format!("{key}: unknown kind {kind_raw}"),
                    key: Some(key.clone()),
                });
                RawPathIdKind::Stream
            }
        };
        let hash = json_u32(rec.get("hash"), &format!("{key}: hash"))?;
        let source = rec
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .replace('\\', "/");
        let path = rec
            .get("path")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let expected_hash = crc32_ieee(key.as_bytes());
        if hash != expected_hash {
            issues.push(RawPathIdParseIssue {
                code: "hash_mismatch".to_string(),
                message: format!("{key}: hash {hash} != crc32(key) {expected_hash}"),
                key: Some(key.clone()),
            });
        }
        let param01 = parse_param_pair(rec.get("param01"), &format!("{key}.param01"))?;
        let param02 = parse_param_pair(rec.get("param02"), &format!("{key}.param02"))?;
        entries.push(RawPathIdEntry {
            key: key.clone(),
            hash,
            kind,
            source,
            path,
            param01_low: param01.0,
            param01_high: param01.1,
            param02_low: param02.0,
            param02_high: param02.1,
        });
    }
    Ok((RawPathIdDocument { entries }, issues))
}

pub fn serialize_json(document: &RawPathIdDocument) -> Result<String, String> {
    let mut lines = Vec::with_capacity(document.entries.len());
    for entry in &document.entries {
        let mut body = Map::new();
        body.insert(
            "kind".to_string(),
            Value::String(kind_as_str(&entry.kind).to_string()),
        );
        body.insert("hash".to_string(), Value::from(entry.hash));
        body.insert("path".to_string(), Value::String(entry.path.clone()));
        body.insert("source".to_string(), Value::String(entry.source.clone()));
        body.insert(
            "param01".to_string(),
            param_pair_json(entry.param01_low, entry.param01_high),
        );
        body.insert(
            "param02".to_string(),
            param_pair_json(entry.param02_low, entry.param02_high),
        );
        let key = serde_json::to_string(&entry.key).map_err(|e| e.to_string())?;
        let value = serde_json::to_string(&Value::Object(body)).map_err(|e| e.to_string())?;
        lines.push(format!("{key} : {value}"));
    }
    Ok(format!("{{\n{}\n}}", lines.join(",\n")))
}

pub fn parse_vgsht1(buf: &[u8]) -> Result<Vgsht1Table, String> {
    if buf.len() < 0x20 {
        return Err("raw_path_id vgsht1 is too small".to_string());
    }
    let magic = read_u32(buf, 0)?;
    if magic != VGSHT1_MAGIC {
        return Err(format!(
            "raw_path_id vgsht1 magic {magic:x} != {VGSHT1_MAGIC:x}"
        ));
    }
    let file_size = read_u32(buf, 0x08)? as usize;
    if file_size != buf.len() {
        return Err(format!(
            "raw_path_id vgsht1 size {file_size} != {}",
            buf.len()
        ));
    }
    let count = read_u32(buf, 0x10)? as usize;
    let stride = read_u32(buf, 0x14)?;
    if stride != RECORD_STRIDE {
        return Err(format!(
            "raw_path_id vgsht1 stride {stride} != {RECORD_STRIDE}"
        ));
    }
    let mut ids = Vec::with_capacity(count);
    for i in 0..count {
        ids.push(read_u32(buf, 0x20 + i * 4)?);
    }
    let mut sorted = ids.clone();
    sorted.sort_unstable();
    if ids != sorted {
        return Err("raw_path_id vgsht1 id array is not ascending".to_string());
    }
    let records_at = 0x20 + count * 4;
    let lower_bound = count * (RECORD_STRIDE as usize + 4) + 32;
    let mut params_by_id = HashMap::with_capacity(count);
    let mut path_by_id = HashMap::with_capacity(count);
    for i in 0..count {
        let rec = records_at + i * RECORD_STRIDE as usize;
        let string_offset = read_u32(buf, rec)? as usize;
        if string_offset < lower_bound || string_offset >= buf.len() {
            return Err(format!(
                "raw_path_id vgsht1 record {i} stringOffset {string_offset} out of range"
            ));
        }
        params_by_id.insert(
            ids[i],
            (
                read_u32(buf, rec + 0x08)?,
                read_u32(buf, rec + 0x0c)?,
                read_u32(buf, rec + 0x10)?,
                read_u32(buf, rec + 0x14)?,
            ),
        );
        path_by_id.insert(ids[i], obf_decode_to_string(&buf[string_offset..]));
    }
    Ok(Vgsht1Table {
        ids,
        params_by_id,
        path_by_id,
    })
}

pub fn build_vgsht1(document: &RawPathIdDocument) -> Result<Vec<u8>, String> {
    let mut sorted = document.entries.clone();
    sorted.sort_by_key(|entry| entry.hash);
    let count = sorted.len();
    let encoded: Vec<Vec<u8>> = sorted
        .iter()
        .map(|entry| obf_encode_from_string(&entry.path))
        .collect();
    let records_at = 0x20 + count * 4;
    let strings_at = records_at + count * RECORD_STRIDE as usize;
    let strings_size: usize = encoded.iter().map(Vec::len).sum();
    let file_size = strings_at + strings_size;
    let mut buf = vec![0u8; file_size];
    write_u32(&mut buf, 0x00, VGSHT1_MAGIC);
    write_u32(&mut buf, 0x08, file_size as u32);
    write_u32(&mut buf, 0x10, count as u32);
    write_u32(&mut buf, 0x14, RECORD_STRIDE);
    let mut string_offset = strings_at;
    for (i, entry) in sorted.iter().enumerate() {
        write_u32(&mut buf, 0x20 + i * 4, entry.hash);
        let rec = records_at + i * RECORD_STRIDE as usize;
        write_u32(&mut buf, rec, string_offset as u32);
        write_u32(&mut buf, rec + 0x08, entry.param01_low);
        write_u32(&mut buf, rec + 0x0c, entry.param01_high);
        write_u32(&mut buf, rec + 0x10, entry.param02_low);
        write_u32(&mut buf, rec + 0x14, entry.param02_high);
        let bytes = &encoded[i];
        buf[string_offset..string_offset + bytes.len()].copy_from_slice(bytes);
        string_offset += bytes.len();
    }
    Ok(buf)
}

pub fn merge_files(
    json_text: &str,
    vgsht1: Option<&[u8]>,
) -> Result<(RawPathIdDocument, Vec<RawPathIdParseIssue>), String> {
    let (mut document, mut issues) = parse_json(json_text)?;
    let Some(bytes) = vgsht1 else {
        return Ok((document, issues));
    };
    let table = parse_vgsht1(bytes)?;
    let json_hashes: std::collections::HashSet<u32> =
        document.entries.iter().map(|entry| entry.hash).collect();
    for id in &table.ids {
        if !json_hashes.contains(id) {
            issues.push(RawPathIdParseIssue {
                code: "missing_vgsht1_id".to_string(),
                message: format!("vgsht1 id 0x{id:x} has no JSON row"),
                key: None,
            });
        }
    }
    for entry in &mut document.entries {
        if let Some(params) = table.params_by_id.get(&entry.hash) {
            entry.param01_low = params.0;
            entry.param01_high = params.1;
            entry.param02_low = params.2;
            entry.param02_high = params.3;
        }
        if let Some(path) = table.path_by_id.get(&entry.hash) {
            if !entry.path.is_empty() && path != &entry.path {
                issues.push(RawPathIdParseIssue {
                    code: "path_mismatch".to_string(),
                    message: format!(
                        "{}: vgsht1 path {path} != JSON path {}",
                        entry.key, entry.path
                    ),
                    key: Some(entry.key.clone()),
                });
            }
        }
    }
    Ok((document, issues))
}

pub fn parse_pack(folder_path: &str) -> Result<RawPathIdPack, String> {
    let folder = Path::new(folder_path);
    if folder_path.trim().is_empty() {
        return Err("Folder path is empty".to_string());
    }
    let discovered = discover_files(folder)?;
    let json_bytes = fs::read(&discovered.json_path)
        .map_err(|e| format!("Failed to read {}: {e}", discovered.json_path.display()))?;
    let json_text = decode_json_text(&json_bytes)?;
    let vgsht1_bytes = match discovered.vgsht1_path.as_ref() {
        Some(path) if path.is_file() => {
            Some(fs::read(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?)
        }
        _ => None,
    };
    let (document, issues) = merge_files(json_text.as_str(), vgsht1_bytes.as_deref())?;
    let vgsht1_path = discovered
        .vgsht1_path
        .unwrap_or_else(|| sibling_vgsht1_path(&discovered.json_path));
    Ok(RawPathIdPack {
        document,
        issues,
        json_path: discovered.json_path.to_string_lossy().into_owned(),
        vgsht1_path: vgsht1_path.to_string_lossy().into_owned(),
    })
}

pub fn write_pack(
    document: &RawPathIdDocument,
    json_path: &str,
    vgsht1_path: &str,
) -> Result<RawPathIdDocument, String> {
    let mut finalized = Vec::with_capacity(document.entries.len());
    for entry in &document.entries {
        finalized.push(finalize_entry(FinalizeRawPathIdInput {
            key: entry.key.clone(),
            source: entry.source.clone(),
            kind: Some(entry.kind),
            param01_low: Some(entry.param01_low),
            param01_high: Some(entry.param01_high),
            param02_low: Some(entry.param02_low),
            param02_high: Some(entry.param02_high),
        })?);
    }
    let next = RawPathIdDocument { entries: finalized };
    let json_text = serialize_json(&next)?;
    let vgsht1 = build_vgsht1(&next)?;
    let json_path = Path::new(json_path);
    let vgsht1_path = Path::new(vgsht1_path);
    backup_orig(json_path)?;
    backup_orig(vgsht1_path)?;
    if let Some(parent) = vgsht1_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
        }
    }
    fs::write(json_path, json_text.as_bytes())
        .map_err(|e| format!("Failed to write {}: {e}", json_path.display()))?;
    fs::write(vgsht1_path, vgsht1)
        .map_err(|e| format!("Failed to write {}: {e}", vgsht1_path.display()))?;
    Ok(next)
}

pub struct Vgsht1Table {
    pub ids: Vec<u32>,
    pub params_by_id: HashMap<u32, (u32, u32, u32, u32)>,
    pub path_by_id: HashMap<u32, String>,
}

struct DiscoveredFiles {
    json_path: PathBuf,
    vgsht1_path: Option<PathBuf>,
}

fn discover_files(folder: &Path) -> Result<DiscoveredFiles, String> {
    let known_json = folder.join(JSON_FILE_NAME);
    let known_vgsht1 = folder.join(VGSHT1_FILE_NAME);
    if known_json.is_file() && known_vgsht1.is_file() {
        return Ok(DiscoveredFiles {
            json_path: known_json,
            vgsht1_path: Some(known_vgsht1),
        });
    }

    let mut files = Vec::new();
    list_files_recursive(folder, 3, &mut files);
    let mut json_path = None;
    let mut vgsht1_path = None;
    for path in files {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if name.ends_with("_structure.json") || name == "meta.bin" {
            continue;
        }
        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        if json_path.is_none() && is_json_object_payload(&bytes) {
            json_path = Some(path);
            continue;
        }
        if vgsht1_path.is_none() && is_vgsht1_payload(&bytes) {
            vgsht1_path = Some(path);
        }
    }
    let json_path = json_path.ok_or_else(|| {
        format!(
            "No raw_path_id JSON found in {}. Extract pack {PACK_HASH} with type sound.",
            folder.display()
        )
    })?;
    Ok(DiscoveredFiles {
        json_path,
        vgsht1_path,
    })
}

fn list_files_recursive(root: &Path, depth: i32, out: &mut Vec<PathBuf>) {
    if depth < 0 {
        return;
    }
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            list_files_recursive(&path, depth - 1, out);
        } else {
            out.push(path);
        }
    }
}

fn sibling_vgsht1_path(json_path: &Path) -> PathBuf {
    let file_name = json_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if file_name.to_ascii_lowercase().ends_with(".json") {
        json_path.with_extension("vgsht1")
    } else {
        json_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(VGSHT1_FILE_NAME)
    }
}

pub fn backup_orig(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Ok(());
    }
    let orig = PathBuf::from(format!("{}.orig", path.display()));
    if orig.exists() {
        return Ok(());
    }
    fs::copy(path, &orig).map_err(|e| format!("Failed to backup {}: {e}", orig.display()))?;
    Ok(())
}

pub fn parse_voice_stem(voice_stem: &str) -> Result<String, String> {
    let compact: String = voice_stem.chars().filter(|c| !c.is_whitespace()).collect();
    let upper = compact.to_ascii_uppercase();
    let bytes = upper.as_bytes();
    let kind = bytes.get(8).copied();
    let kind_ok = kind == Some(b'P') || kind == Some(b'N');
    let valid = bytes.len() == 13
        && bytes.starts_with(b"VO_")
        && bytes[3..7].iter().all(u8::is_ascii_digit)
        && bytes[7] == b'_'
        && kind_ok
        && bytes[9..11].iter().all(u8::is_ascii_digit)
        && bytes[11] == b'_'
        && bytes[12].is_ascii_digit();
    if !valid {
        return Err(format!(
            "Voice stem must look like VO_1000_P01_0, got {voice_stem}"
        ));
    }
    Ok(upper)
}

fn normalize_source(source: &str) -> String {
    source.trim().replace('\\', "/")
}

fn kind_as_str(kind: &RawPathIdKind) -> &'static str {
    match kind {
        RawPathIdKind::Stream => "stream",
        RawPathIdKind::Movie => "movie",
        RawPathIdKind::Net => "net",
    }
}

fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

fn is_vgsht1_payload(bytes: &[u8]) -> bool {
    bytes.len() >= 4 && u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) == VGSHT1_MAGIC
}

fn is_json_object_payload(bytes: &[u8]) -> bool {
    let text = match std::str::from_utf8(bytes) {
        Ok(text) => text,
        Err(_) => return false,
    };
    text.trim_start_matches('\u{feff}')
        .trim_start()
        .starts_with('{')
}

fn decode_json_text(bytes: &[u8]) -> Result<String, String> {
    let text =
        std::str::from_utf8(bytes).map_err(|e| format!("raw_path_id JSON is not UTF-8: {e}"))?;
    Ok(text.trim_start_matches('\u{feff}').to_string())
}

fn json_u32(value: Option<&Value>, field: &str) -> Result<u32, String> {
    parse_json_u32(value, field, false)
}

fn json_u32_or_zero(value: Option<&Value>, field: &str) -> Result<u32, String> {
    parse_json_u32(value, field, true)
}

fn parse_json_u32(value: Option<&Value>, field: &str, default_zero: bool) -> Result<u32, String> {
    match value {
        None | Some(Value::Null) if default_zero => Ok(0),
        None | Some(Value::Null) => Err(format!("{field} must be an integer")),
        Some(value) => {
            if let Some(u) = value.as_u64() {
                if u > u64::from(u32::MAX) {
                    return Err(format!("{field} must be an integer"));
                }
                return Ok(u as u32);
            }
            if let Some(i) = value.as_i64() {
                return Ok(i as u32);
            }
            Err(format!("{field} must be an integer"))
        }
    }
}

fn parse_param_pair(value: Option<&Value>, field: &str) -> Result<(u32, u32), String> {
    let object = value
        .and_then(Value::as_object)
        .ok_or_else(|| format!("{field} must be {{ low32, high32 }}"))?;
    Ok((
        json_u32_or_zero(object.get("low32"), &format!("{field} low32"))?,
        json_u32_or_zero(object.get("high32"), &format!("{field} high32"))?,
    ))
}

fn param_pair_json(low: u32, high: u32) -> Value {
    let mut pair = Map::new();
    pair.insert("low32".to_string(), Value::from(low));
    pair.insert("high32".to_string(), Value::from(high));
    Value::Object(pair)
}

fn read_u32(buf: &[u8], offset: usize) -> Result<u32, String> {
    let slice = buf
        .get(offset..offset + 4)
        .ok_or_else(|| format!("raw_path_id vgsht1 offset {offset} out of range"))?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn write_u32(buf: &mut [u8], offset: usize, value: u32) {
    buf[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}
