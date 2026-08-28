//! Byte-level round-trip verification for MSC scripts.
//!
//! Backend callers compile C in-process through `crate::msc_toolchain`
//! (`compile_in_process`) and compare the packed bytes against the
//! original script. The compare is a plain byte comparison: any divergence
//! (content or size) is reported with the first divergent offset plus a
//! small hex context window from both files. This module never spawns
//! `msclang.exe` / `mscdec.exe`.

use serde::Serialize;
use std::fs;
use std::path::Path;

/// Bytes of context captured on each side of the first divergence offset.
const HEX_CONTEXT_RADIUS: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MscRoundtripCompareReport {
    pub is_match: bool,
    pub original_size: u64,
    pub recompiled_size: u64,
    /// First byte offset where the files differ. `None` when the files match.
    /// A pure size mismatch diverges at the shorter file's length.
    pub first_divergence_offset: Option<u64>,
    /// Start offset of both hex context windows below.
    pub context_start_offset: Option<u64>,
    pub original_context_hex: Option<String>,
    pub recompiled_context_hex: Option<String>,
}

fn to_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn context_window(bytes: &[u8], divergence: usize) -> String {
    let start = divergence.saturating_sub(HEX_CONTEXT_RADIUS);
    let end = divergence
        .saturating_add(HEX_CONTEXT_RADIUS)
        .min(bytes.len());
    if start >= end {
        return String::new();
    }
    to_hex(&bytes[start..end])
}

/// Compare two byte buffers and build the divergence report.
pub fn compare_msc_roundtrip_bytes(
    original: &[u8],
    recompiled: &[u8],
) -> MscRoundtripCompareReport {
    let shared_len = original.len().min(recompiled.len());
    let content_divergence = (0..shared_len).find(|&i| original[i] != recompiled[i]);
    let divergence = content_divergence.or_else(|| {
        if original.len() != recompiled.len() {
            Some(shared_len)
        } else {
            None
        }
    });

    match divergence {
        None => MscRoundtripCompareReport {
            is_match: true,
            original_size: original.len() as u64,
            recompiled_size: recompiled.len() as u64,
            first_divergence_offset: None,
            context_start_offset: None,
            original_context_hex: None,
            recompiled_context_hex: None,
        },
        Some(offset) => MscRoundtripCompareReport {
            is_match: false,
            original_size: original.len() as u64,
            recompiled_size: recompiled.len() as u64,
            first_divergence_offset: Some(offset as u64),
            context_start_offset: Some(offset.saturating_sub(HEX_CONTEXT_RADIUS) as u64),
            original_context_hex: Some(context_window(original, offset)),
            recompiled_context_hex: Some(context_window(recompiled, offset)),
        },
    }
}

fn read_existing_file(path: &str, role: &str) -> Result<Vec<u8>, String> {
    let file_path = Path::new(path);
    if !file_path.is_file() {
        return Err(format!(
            "MSC round-trip verify: {role} file not found: {path}"
        ));
    }
    fs::read(file_path).map_err(|error| {
        format!("MSC round-trip verify: failed to read {role} file {path}: {error}")
    })
}

#[tauri::command]
pub fn compare_msc_roundtrip(
    original_path: String,
    recompiled_path: String,
) -> Result<MscRoundtripCompareReport, String> {
    let original = read_existing_file(&original_path, "original")?;
    let recompiled = read_existing_file(&recompiled_path, "recompiled")?;
    Ok(compare_msc_roundtrip_bytes(&original, &recompiled))
}

/// Compile `c_source` in-process and compare packed bytes to `original_msc`.
pub fn verify_c_source_against_original(
    c_source: &str,
    original_msc: &[u8],
) -> Result<MscRoundtripCompareReport, String> {
    let recompiled = crate::msc_toolchain::compile_in_process(c_source)?;
    Ok(compare_msc_roundtrip_bytes(original_msc, &recompiled))
}

/// Tauri adapter: read C + original from disk, compile in-process, compare.
#[tauri::command]
pub fn verify_msc_roundtrip_from_c(
    c_path: String,
    original_path: String,
) -> Result<MscRoundtripCompareReport, String> {
    let c_file = Path::new(&c_path);
    if !c_file.is_file() {
        return Err(format!("MSC round-trip verify: C file not found: {c_path}"));
    }
    let c_source = fs::read_to_string(c_file).map_err(|error| {
        format!("MSC round-trip verify: failed to read C file {c_path}: {error}")
    })?;
    let original = read_existing_file(&original_path, "original")?;
    verify_c_source_against_original(&c_source, &original)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_files_report_match_without_divergence() {
        let bytes = vec![0xB2u8, 0xAC, 0xBC, 0xBA, 0x00, 0x01, 0x02, 0x03];
        let report = compare_msc_roundtrip_bytes(&bytes, &bytes);
        assert!(report.is_match);
        assert_eq!(report.original_size, 8);
        assert_eq!(report.recompiled_size, 8);
        assert_eq!(report.first_divergence_offset, None);
        assert_eq!(report.original_context_hex, None);
        assert_eq!(report.recompiled_context_hex, None);
    }

    #[test]
    fn divergent_files_report_first_offset_and_hex_context() {
        let mut original = vec![0u8; 64];
        let mut recompiled = original.clone();
        original[40] = 0xAA;
        recompiled[40] = 0xBB;

        let report = compare_msc_roundtrip_bytes(&original, &recompiled);
        assert!(!report.is_match);
        assert_eq!(report.first_divergence_offset, Some(40));
        assert_eq!(report.context_start_offset, Some(24));

        let original_hex = report.original_context_hex.expect("original context");
        let recompiled_hex = report.recompiled_context_hex.expect("recompiled context");
        // Window covers offsets 24..56: 32 bytes with the divergent byte at index 16.
        assert_eq!(original_hex.split(' ').count(), 32);
        assert_eq!(original_hex.split(' ').nth(16), Some("aa"));
        assert_eq!(recompiled_hex.split(' ').nth(16), Some("bb"));
    }

    #[test]
    fn size_mismatch_with_shared_prefix_diverges_at_shorter_length() {
        let original = vec![7u8; 20];
        let recompiled = vec![7u8; 12];

        let report = compare_msc_roundtrip_bytes(&original, &recompiled);
        assert!(!report.is_match);
        assert_eq!(report.original_size, 20);
        assert_eq!(report.recompiled_size, 12);
        assert_eq!(report.first_divergence_offset, Some(12));
        assert_eq!(report.context_start_offset, Some(0));
        // Original still has bytes past the divergence; recompiled context ends there.
        assert_eq!(
            report
                .original_context_hex
                .as_deref()
                .map(|hex| hex.split(' ').count()),
            Some(20)
        );
        assert_eq!(
            report
                .recompiled_context_hex
                .as_deref()
                .map(|hex| hex.split(' ').count()),
            Some(12)
        );
    }

    #[test]
    fn divergence_at_offset_zero_produces_forward_only_context() {
        let original = vec![1u8, 2, 3, 4];
        let recompiled = vec![9u8, 2, 3, 4];

        let report = compare_msc_roundtrip_bytes(&original, &recompiled);
        assert!(!report.is_match);
        assert_eq!(report.first_divergence_offset, Some(0));
        assert_eq!(report.context_start_offset, Some(0));
        assert_eq!(report.original_context_hex.as_deref(), Some("01 02 03 04"));
        assert_eq!(
            report.recompiled_context_hex.as_deref(),
            Some("09 02 03 04")
        );
    }

    #[test]
    fn missing_original_file_is_an_explicit_error() {
        let dir = tempfile::tempdir().expect("temp dir");
        let recompiled_path = dir.path().join("recompiled.bscex");
        fs::write(&recompiled_path, [1u8, 2, 3]).expect("write recompiled");
        let missing_path = dir.path().join("missing.bscex");

        let error = compare_msc_roundtrip(
            missing_path.to_string_lossy().into_owned(),
            recompiled_path.to_string_lossy().into_owned(),
        )
        .expect_err("missing original must fail");
        assert!(error.contains("original file not found"), "{error}");
    }

    #[test]
    fn missing_recompiled_file_is_an_explicit_error() {
        let dir = tempfile::tempdir().expect("temp dir");
        let original_path = dir.path().join("original.bscex");
        fs::write(&original_path, [1u8, 2, 3]).expect("write original");
        let missing_path = dir.path().join("missing.tmp");

        let error = compare_msc_roundtrip(
            original_path.to_string_lossy().into_owned(),
            missing_path.to_string_lossy().into_owned(),
        )
        .expect_err("missing recompiled must fail");
        assert!(error.contains("recompiled file not found"), "{error}");
    }

    #[test]
    fn command_compares_real_files_end_to_end() {
        let dir = tempfile::tempdir().expect("temp dir");
        let original_path = dir.path().join("0.bscex");
        let recompiled_path = dir.path().join("0.roundtrip.tmp");
        fs::write(&original_path, [0u8, 1, 2, 3]).expect("write original");
        fs::write(&recompiled_path, [0u8, 1, 2, 3]).expect("write recompiled");

        let report = compare_msc_roundtrip(
            original_path.to_string_lossy().into_owned(),
            recompiled_path.to_string_lossy().into_owned(),
        )
        .expect("compare succeeds");
        assert!(report.is_match);
        assert_eq!(report.original_size, 4);
    }
}
