// Legacy SHL ("SHLL") unit-model shell control bin.
//
// One `shell_*.shl` per unit-model package, at the package root next to
// characterid_/effect_project_/vernier_table_ bins. It declares the package's model
// slots: which model (by name-hash), its role (main body / assist / part), and its
// position in the structure-JSON model folder order.
//
// Full reverse-engineering record: docs/agent-sessions/unit-model-editor/shl-format-analysis.md
//
// Layout:
//   Header (0x10)
//     0x00 u32  magic "SHLL"
//     0x04 u32  version (0x64 in all samples)
//     0x08 u32  reserved (0 in all samples)
//     0x0C u32  record_count
//   Record (0x20) * record_count, starting at 0x10
//     0x00 u32  model_id     (proprietary name-hash of the model folder name)
//     0x04 u32  model_type   (0 main body, 1 ?, 2 assist, 3 part)
//     0x08 u32  folder_index (index into the structure-JSON model folder order)
//     0x0C u32  unk1
//     0x10 u32  slot_index
//     0x14 u8[12] reserved   (0 in all samples)
//
// Byte fidelity: build_shl re-emits the original 0x20 bytes for any record whose logical
// fields are unchanged (mirrors build_vernier_table's source-raw preservation), and
// preserves any trailing bytes, so untouched files round-trip exactly.

use serde::{Deserialize, Serialize};

const SHL_MAGIC: &[u8; 4] = b"SHLL";
const SHL_HEADER_SIZE: usize = 0x10;
const SHL_RECORD_SIZE: usize = 0x20;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShlRecord {
    pub model_id: u32,
    pub model_type: u32,
    pub folder_index: u32,
    pub unk1: u32,
    pub slot_index: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShlFile {
    pub version: u32,
    pub reserved08: u32,
    pub records: Vec<ShlRecord>,
    /// Trailing bytes after the last record (empty in all samples), preserved verbatim.
    #[serde(default)]
    pub trailing_data: Vec<u8>,
    /// Original 0x20-byte record blobs, kept for byte-faithful rebuild. Not serialized.
    #[serde(skip)]
    pub source_records_raw: Vec<[u8; SHL_RECORD_SIZE]>,
}

fn read_u32_le(data: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ])
}

fn record_from_raw(raw: &[u8; SHL_RECORD_SIZE]) -> ShlRecord {
    ShlRecord {
        model_id: read_u32_le(raw, 0x00),
        model_type: read_u32_le(raw, 0x04),
        folder_index: read_u32_le(raw, 0x08),
        unk1: read_u32_le(raw, 0x0C),
        slot_index: read_u32_le(raw, 0x10),
    }
}

fn record_to_raw(record: &ShlRecord) -> [u8; SHL_RECORD_SIZE] {
    let mut raw = [0u8; SHL_RECORD_SIZE];
    raw[0x00..0x04].copy_from_slice(&record.model_id.to_le_bytes());
    raw[0x04..0x08].copy_from_slice(&record.model_type.to_le_bytes());
    raw[0x08..0x0C].copy_from_slice(&record.folder_index.to_le_bytes());
    raw[0x0C..0x10].copy_from_slice(&record.unk1.to_le_bytes());
    raw[0x10..0x14].copy_from_slice(&record.slot_index.to_le_bytes());
    // 0x14..0x20 stays zero.
    raw
}

pub fn parse_shl(data: &[u8]) -> Result<ShlFile, String> {
    if data.len() < SHL_HEADER_SIZE {
        return Err(format!(
            "Invalid SHL: file is too small ({} bytes, need at least {SHL_HEADER_SIZE}).",
            data.len()
        ));
    }
    if &data[0..4] != SHL_MAGIC {
        return Err("Invalid SHL: missing SHLL magic.".to_string());
    }

    let version = read_u32_le(data, 0x04);
    let reserved08 = read_u32_le(data, 0x08);
    let count = read_u32_le(data, 0x0C) as usize;

    let body_end = SHL_HEADER_SIZE + count.saturating_mul(SHL_RECORD_SIZE);
    if data.len() < body_end {
        return Err(format!(
            "Invalid SHL: declares {count} records but file has only {} bytes; expected at least {body_end}.",
            data.len()
        ));
    }

    let mut records = Vec::with_capacity(count);
    let mut source_records_raw = Vec::with_capacity(count);
    for i in 0..count {
        let base = SHL_HEADER_SIZE + i * SHL_RECORD_SIZE;
        let mut raw = [0u8; SHL_RECORD_SIZE];
        raw.copy_from_slice(&data[base..base + SHL_RECORD_SIZE]);
        records.push(record_from_raw(&raw));
        source_records_raw.push(raw);
    }

    let trailing_data = data[body_end..].to_vec();

    Ok(ShlFile {
        version,
        reserved08,
        records,
        trailing_data,
        source_records_raw,
    })
}

pub fn build_shl(file: &ShlFile) -> Result<Vec<u8>, String> {
    let count = file.records.len();
    let mut out = Vec::with_capacity(SHL_HEADER_SIZE + count * SHL_RECORD_SIZE);
    out.extend_from_slice(SHL_MAGIC);
    out.extend_from_slice(&file.version.to_le_bytes());
    out.extend_from_slice(&file.reserved08.to_le_bytes());
    out.extend_from_slice(&(count as u32).to_le_bytes());

    for (i, record) in file.records.iter().enumerate() {
        // Re-emit the original bytes when this record's logical fields are unchanged,
        // preserving any non-field bytes exactly.
        if let Some(raw) = file.source_records_raw.get(i) {
            if &record_from_raw(raw) == record {
                out.extend_from_slice(raw);
                continue;
            }
        }
        out.extend_from_slice(&record_to_raw(record));
    }

    out.extend_from_slice(&file.trailing_data);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_ROOT: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file";

    fn collect_samples(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    collect_samples(&path, out);
                } else if path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.to_ascii_lowercase().ends_with(".shl"))
                    .unwrap_or(false)
                {
                    out.push(path);
                }
            }
        }
    }

    fn sample_paths() -> Vec<std::path::PathBuf> {
        let mut out = Vec::new();
        collect_samples(std::path::Path::new(SAMPLE_ROOT), &mut out);
        out.sort();
        out
    }

    #[test]
    fn parse_build_is_byte_identical_for_all_samples() {
        let samples = sample_paths();
        if samples.is_empty() {
            eprintln!("no .shl samples under {SAMPLE_ROOT}; skipping byte-fidelity test");
            return;
        }
        for path in &samples {
            let source = std::fs::read(path).expect("failed to read SHL sample");
            let parsed = parse_shl(&source)
                .unwrap_or_else(|e| panic!("failed to parse {}: {e}", path.display()));

            // Format invariant: header + count*0x20, no trailing data.
            assert_eq!(
                source.len(),
                SHL_HEADER_SIZE + parsed.records.len() * SHL_RECORD_SIZE,
                "unexpected size for {}",
                path.display()
            );
            assert!(
                parsed.trailing_data.is_empty(),
                "unexpected trailing data in {}",
                path.display()
            );
            // Field-only invariant: reserved tail of every record is zero, so a
            // field-only rebuild (frontend path, source raw dropped) is byte-exact.
            for raw in &parsed.source_records_raw {
                assert_eq!(
                    &raw[0x14..0x20],
                    &[0u8; 12],
                    "non-zero reserved in {}",
                    path.display()
                );
            }

            let rebuilt = build_shl(&parsed)
                .unwrap_or_else(|e| panic!("failed to build {}: {e}", path.display()));
            assert_eq!(rebuilt, source, "byte mismatch for {}", path.display());

            // Field-only rebuild (drop source raw) must also be byte-identical.
            let field_only = ShlFile {
                source_records_raw: Vec::new(),
                ..parsed.clone()
            };
            let rebuilt_fields = build_shl(&field_only).expect("field-only build failed");
            assert_eq!(
                rebuilt_fields,
                source,
                "field-only byte mismatch for {}",
                path.display()
            );
        }
    }

    #[test]
    fn json_roundtrip_preserves_records() {
        let samples = sample_paths();
        let Some(path) = samples.first() else {
            eprintln!("no .shl samples under {SAMPLE_ROOT}; skipping json roundtrip test");
            return;
        };
        let source = std::fs::read(path).expect("failed to read SHL sample");
        let parsed = parse_shl(&source).expect("parse failed");

        let json = serde_json::to_value(&parsed).expect("serialize failed");
        let back: ShlFile = serde_json::from_value(json).expect("deserialize failed");
        assert_eq!(back.records, parsed.records);
        assert_eq!(back.version, parsed.version);

        // After a JSON round-trip the source raw is dropped; build must still match bytes.
        let rebuilt = build_shl(&back).expect("build failed");
        assert_eq!(
            rebuilt,
            source,
            "json-roundtrip byte mismatch for {}",
            path.display()
        );
    }

    #[test]
    fn crud_add_update_remove_records() {
        let samples = sample_paths();
        let Some(path) = samples.first() else {
            eprintln!("no .shl samples under {SAMPLE_ROOT}; skipping crud test");
            return;
        };
        let source = std::fs::read(path).expect("failed to read SHL sample");
        let parsed = parse_shl(&source).expect("parse failed");
        assert!(!parsed.records.is_empty(), "sample has no records");
        let original_len = parsed.records.len();

        // Add: append a part slot referencing the last folder.
        let mut added = parsed.clone();
        let template = added.records.last().cloned().unwrap();
        added.records.push(ShlRecord {
            model_type: 3,
            slot_index: original_len as u32,
            ..template
        });
        let added_bytes = build_shl(&added).expect("build after add failed");
        let added_parsed = parse_shl(&added_bytes).expect("parse after add failed");
        assert_eq!(added_parsed.records.len(), original_len + 1);
        assert_eq!(
            read_u32_le(&added_bytes, 0x0C) as usize,
            original_len + 1,
            "header count not updated after add"
        );

        // Update: change a record's type and re-read.
        let mut updated = added_parsed.clone();
        updated.records[0].model_type = 2;
        let updated_bytes = build_shl(&updated).expect("build after update failed");
        let updated_parsed = parse_shl(&updated_bytes).expect("parse after update failed");
        assert_eq!(updated_parsed.records[0].model_type, 2);

        // Remove: drop the appended record, back to the original count and bytes.
        let mut removed = updated_parsed.clone();
        removed.records.pop();
        removed.records[0].model_type = parsed.records[0].model_type;
        let removed_bytes = build_shl(&removed).expect("build after remove failed");
        let removed_parsed = parse_shl(&removed_bytes).expect("parse after remove failed");
        assert_eq!(removed_parsed.records.len(), original_len);
        assert_eq!(
            removed_bytes, source,
            "remove did not restore original bytes"
        );
    }
}
