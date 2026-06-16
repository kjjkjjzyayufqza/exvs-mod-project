//! FHM2D binary repacker.
//! Rebuilds `.fhm2d` files from an extracted `_structure.json` and its referenced sub-files.

use crate::format::fhm2d::SubFileStructureEntry;
use flate2::write::DeflateEncoder;
use flate2::Compression;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const PAGE_SIZE: usize = 0x10000;
const OUTER_HEADER_SIZE: usize = 0x30;
const MAGIC_OB: [u8; 4] = [0xB9, 0xB7, 0xB2, 0xCD];
const FIXED_HEADER_BYTES: [u8; 12] = [
    0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
];

// ── Public API ──────────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepackProgress {
    pub current_file: String,
    pub file_index: usize,
    pub total_files: usize,
    pub compressed_size: usize,
    pub original_size: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepackResult {
    pub output_path: String,
    pub total_files: usize,
    pub output_size: usize,
}

/// Rebuild a `.fhm2d` binary from a `_structure.json` and the extracted sub-files on disk.
pub fn repack_fhm2d_from_structure(
    structure_json_path: &str,
    output_path: &str,
    atomic_write: bool,
    progress_callback: Option<&dyn Fn(RepackProgress)>,
) -> Result<RepackResult, String> {
    let json_content = fs::read_to_string(structure_json_path)
        .map_err(|e| format!("Failed to read structure json: {e}"))?;
    let input = parse_input_structure(&json_content)?;

    let json_dir = Path::new(structure_json_path)
        .parent()
        .ok_or_else(|| "Cannot determine parent directory of structure json".to_string())?;

    let total_files = input.sub_file_data.len();

    let files = load_and_compress_files(&input.sub_file_data, json_dir, progress_callback)?;

    let type_groups = build_sorted_type_groups(&files);
    let sorted_order = flatten_sorted_order(&type_groups);

    let (body_data, start_offsets) = build_body_data(&files, &sorted_order);

    let old_to_new = build_file_index_remap(&files, &sorted_order);
    let remapped_structure = remap_structure_file_indices(&input.sub_file_structure, &old_to_new);
    let structure_bytes = serialize_structure_binary(&remapped_structure)?;
    let meta_uncompressed = build_meta_blob(
        input.magic,
        input.unk_count,
        &files,
        &type_groups,
        &sorted_order,
        &start_offsets,
        &structure_bytes,
    );
    let meta_compressed = deflate_raw_compress(&meta_uncompressed)?;

    let output_bytes = assemble_outer_container(&meta_uncompressed, &meta_compressed, &body_data);

    write_output(output_path, &output_bytes, atomic_write)?;

    Ok(RepackResult {
        output_path: output_path.to_string(),
        total_files,
        output_size: output_bytes.len(),
    })
}

// ── Input Deserialization ───────────────────────────────────────────────────

fn parse_input_structure(json_content: &str) -> Result<InputStructure, String> {
    let root: serde_json::Value = serde_json::from_str(json_content)
        .map_err(|e| format!("Failed to parse structure json: {e}"))?;

    if let Some(entries) = root.get("SubFileStructure").and_then(|v| v.as_array()) {
        warn_legacy_structure_defaults(entries);
    }

    serde_json::from_value(root).map_err(|e| format!("Failed to parse structure json: {e}"))
}

fn warn_legacy_structure_defaults(entries: &[serde_json::Value]) {
    for (idx, entry) in entries.iter().enumerate() {
        let entry_type = entry
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("<unknown>");
        let missing = collect_missing_legacy_structure_fields(entry_type, entry);
        if missing.is_empty() {
            continue;
        }
        crate::console_color::eprint_warn(
            "repack_fhm2d",
            &format!(
                "SubFileStructure[{idx}] ({entry_type}): missing legacy field(s) [{}]; defaulting to 0 / empty string",
                missing.join(", ")
            ),
        );
    }
}

fn collect_missing_legacy_structure_fields(
    entry_type: &str,
    entry: &serde_json::Value,
) -> Vec<&'static str> {
    let expected: &[&str] = match entry_type {
        "Folder" => &[
            "unk1",
            "folderCount",
            "unk2",
            "unk2_1",
            "unk3",
            "unk4",
            "unk5",
            "unk6",
        ],
        "Item" => &[
            "unk1",
            "fileIndex",
            "unk2",
            "unk2_1",
            "unk3",
            "unk4",
            "originalFileIndex",
        ],
        "EndMark" => &["endMarkCount"],
        _ => return Vec::new(),
    };

    expected
        .iter()
        .filter(|key| entry.get(**key).is_none())
        .copied()
        .collect()
}

fn deserialize_magic_u32<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct MagicVisitor;
    impl<'de> serde::de::Visitor<'de> for MagicVisitor {
        type Value = u32;
        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("an integer (signed or unsigned) representable as u32")
        }
        fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<u32, E> {
            u32::try_from(v).map_err(|_| E::custom(format!("u64 {} out of u32 range", v)))
        }
        fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<u32, E> {
            Ok(v as i32 as u32)
        }
    }
    deserializer.deserialize_any(MagicVisitor)
}

#[derive(Deserialize)]
struct InputStructure {
    #[serde(rename = "Magic", deserialize_with = "deserialize_magic_u32")]
    magic: u32,
    #[serde(rename = "UnkCount")]
    unk_count: u32,
    #[serde(rename = "SubFileData")]
    sub_file_data: Vec<InputSubFileData>,
    #[serde(rename = "SubFileStructure")]
    sub_file_structure: Vec<SubFileStructureEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputSubFileData {
    #[allow(dead_code)]
    index: usize,
    file_type: String,
    file_index: i32,
    file_url: String,
    #[allow(dead_code)]
    file_base_name: Option<String>,
}

// ── Internal Types ──────────────────────────────────────────────────────────

struct ProcessedFile {
    file_index: i32,
    type_id: u32,
    file_size: u32,
    body: CompressedBody,
    #[allow(dead_code)]
    name: String,
}

struct CompressedBody {
    body_bytes: Vec<u8>,
    bitmap: Vec<u8>,
    chunk_sizes: Vec<u32>,
    chunk_count: u32,
    is_need_decomp: u32,
}

struct TypeGroup {
    type_id: u32,
    file_indices: Vec<usize>,
}

// ── File Type Mapping ───────────────────────────────────────────────────────

fn get_file_type_id(ext: &str) -> u32 {
    match ext {
        ".nushdb" => 0x0A,
        ".nutexb" => 0x0B,
        ".nusktb" => 0x0C,
        ".numatb" => 0x0D,
        ".numshb" => 0x0E,
        ".numdlb" => 0x0F,
        ".nuanmb" => 0x11,
        ".nuhlpb" => 0x13,
        ".nus3bank" => 0x14,
        ".nudnbb" => 0x17,
        ".nufxlb" => 0x18,
        ".nurpdb" => 0x19,
        _ => 0,
    }
}

/// Sort key: ascending types first, then 0x11 (descending slot), then type 0 last.
fn file_type_sort_key(type_id: u32) -> (u8, i64) {
    match type_id {
        0 => (2, 0),
        0x11 => (1, -(type_id as i64)),
        _ => (0, type_id as i64),
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn align16(val: u32) -> u32 {
    (val + 0xF) & !0xF
}

fn push_u32_le(buf: &mut Vec<u8>, val: u32) {
    buf.extend_from_slice(&val.to_le_bytes());
}

fn deflate_raw_compress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(data)
        .map_err(|e| format!("deflate write failed: {e}"))?;
    encoder
        .finish()
        .map_err(|e| format!("deflate finish failed: {e}"))
}

fn resolve_file_path(json_dir: &Path, file_url: &str) -> PathBuf {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    json_dir.join(cleaned)
}

fn parse_hex_bytes(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err(format!("Invalid hex string length: {}", hex.len()));
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&hex[i..i + 2], 16)
                .map_err(|e| format!("Invalid hex at position {i}: {e}"))
        })
        .collect()
}

// ── File Loading & Compression ──────────────────────────────────────────────

fn load_and_compress_files(
    entries: &[InputSubFileData],
    json_dir: &Path,
    progress_callback: Option<&dyn Fn(RepackProgress)>,
) -> Result<Vec<ProcessedFile>, String> {
    let total_files = entries.len();
    let mut files = Vec::with_capacity(total_files);

    for (idx, entry) in entries.iter().enumerate() {
        let file_path = resolve_file_path(json_dir, &entry.file_url);
        if !file_path.exists() {
            return Err(format!(
                "Missing file: {} (resolved: {})",
                entry.file_url,
                file_path.display()
            ));
        }
        let data = fs::read(&file_path)
            .map_err(|e| format!("Failed to read {}: {e}", file_path.display()))?;
        let file_size = data.len() as u32;
        let name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let type_id = get_file_type_id(&entry.file_type);
        let body = compress_file_body(&data)?;

        if let Some(cb) = &progress_callback {
            cb(RepackProgress {
                current_file: name.clone(),
                file_index: idx,
                total_files,
                compressed_size: body.body_bytes.len(),
                original_size: file_size as usize,
            });
        }

        files.push(ProcessedFile {
            file_index: entry.file_index,
            type_id,
            file_size,
            body,
            name,
        });
    }
    Ok(files)
}

fn compress_file_body(data: &[u8]) -> Result<CompressedBody, String> {
    let file_size = data.len();

    if file_size <= 4 {
        return Ok(CompressedBody {
            body_bytes: data.to_vec(),
            bitmap: Vec::new(),
            chunk_sizes: Vec::new(),
            chunk_count: 0,
            is_need_decomp: 1,
        });
    }

    let page_count = (file_size + PAGE_SIZE - 1) / PAGE_SIZE;
    let bitmap_len = (page_count + 7) / 8;
    let mut bitmap = vec![0u8; bitmap_len];

    // Deflate every 64 KiB page in parallel; keep each page's compressed bytes so the
    // raw-vs-compressed decision (and the all-incompressible fallback below) can reuse them.
    let deflated: Vec<Vec<u8>> = (0..page_count)
        .into_par_iter()
        .map(|page_idx| {
            let start = page_idx * PAGE_SIZE;
            let end = (start + PAGE_SIZE).min(file_size);
            deflate_raw_compress(&data[start..end])
        })
        .collect::<Result<_, _>>()?;

    // Per page: store the compressed bytes when they shrink the page, otherwise store it raw.
    let mut body_bytes = Vec::new();
    let mut chunk_sizes = Vec::new();
    for page_idx in 0..page_count {
        let start = page_idx * PAGE_SIZE;
        let end = (start + PAGE_SIZE).min(file_size);
        let page = &data[start..end];
        if deflated[page_idx].len() < page.len() {
            bitmap[page_idx >> 3] |= 1 << (page_idx & 7);
            chunk_sizes.push(deflated[page_idx].len() as u32);
            body_bytes.extend_from_slice(&deflated[page_idx]);
        } else {
            body_bytes.extend_from_slice(page);
        }
    }

    // Compatibility fallback chosen on 2026-06-17 while diagnosing the user-reported
    // 0xA258A522 Unit Model Editor repack failure. The old OK package and the Node
    // `compression.js` packer stored the small JNTT control files 149.bin/150.bin
    // as compressed chunks, because Node zlib shrank them. miniz_oxide did not
    // shrink the same bytes, so the previous Rust logic emitted
    // chunk_count == 0 / is_need_decomp == 0 for those files, matching the bad
    // package layout. This is a defensive compatibility strategy, not a proven
    // universal format rule; replace it if native-loader evidence proves plain
    // zero-chunk payloads are valid for all affected file classes.
    if chunk_sizes.is_empty() {
        body_bytes.clear();
        for byte in bitmap.iter_mut() {
            *byte = 0;
        }
        for page_idx in 0..page_count {
            bitmap[page_idx >> 3] |= 1 << (page_idx & 7);
            chunk_sizes.push(deflated[page_idx].len() as u32);
            body_bytes.extend_from_slice(&deflated[page_idx]);
        }
    }

    let chunk_count = chunk_sizes.len() as u32;

    Ok(CompressedBody {
        body_bytes,
        bitmap,
        chunk_sizes,
        chunk_count,
        is_need_decomp: 1,
    })
}

// ── Type Grouping & Sorting ─────────────────────────────────────────────────

fn build_sorted_type_groups(files: &[ProcessedFile]) -> Vec<TypeGroup> {
    let mut groups: BTreeMap<u32, Vec<usize>> = BTreeMap::new();
    for (idx, file) in files.iter().enumerate() {
        groups.entry(file.type_id).or_default().push(idx);
    }
    let mut result: Vec<TypeGroup> = groups
        .into_iter()
        .map(|(type_id, file_indices)| TypeGroup {
            type_id,
            file_indices,
        })
        .collect();
    result.sort_by_key(|g| file_type_sort_key(g.type_id));
    result
}

fn flatten_sorted_order(type_groups: &[TypeGroup]) -> Vec<usize> {
    type_groups
        .iter()
        .flat_map(|g| g.file_indices.iter().copied())
        .collect()
}

fn build_file_index_remap(files: &[ProcessedFile], sorted_order: &[usize]) -> HashMap<i32, i32> {
    let mut map = HashMap::new();
    for (packed_idx, &array_idx) in sorted_order.iter().enumerate() {
        map.insert(files[array_idx].file_index, packed_idx as i32);
    }
    map
}

fn remap_structure_file_indices(
    entries: &[SubFileStructureEntry],
    old_to_new: &HashMap<i32, i32>,
) -> Vec<SubFileStructureEntry> {
    entries
        .iter()
        .map(|entry| match entry {
            SubFileStructureEntry::Item {
                unk1,
                file_index,
                unk2,
                unk2_1,
                unk3,
                unk4,
                original_file_index,
                display_name,
            } => {
                let new_index = old_to_new.get(file_index).copied().unwrap_or(*file_index);
                SubFileStructureEntry::Item {
                    unk1: unk1.clone(),
                    file_index: new_index,
                    unk2: unk2.clone(),
                    unk2_1: *unk2_1,
                    unk3: *unk3,
                    unk4: *unk4,
                    original_file_index: *original_file_index,
                    display_name: display_name.clone(),
                }
            }
            other => other.clone(),
        })
        .collect()
}

// ── Body Data ───────────────────────────────────────────────────────────────

fn build_body_data(files: &[ProcessedFile], sorted_order: &[usize]) -> (Vec<u8>, Vec<u32>) {
    let mut body = Vec::new();
    let mut offsets = vec![0u32; files.len()];
    for &idx in sorted_order {
        offsets[idx] = body.len() as u32;
        body.extend_from_slice(&files[idx].body.body_bytes);
    }
    (body, offsets)
}

// ── Meta Blob ───────────────────────────────────────────────────────────────

fn build_meta_blob(
    magic: u32,
    unk_count: u32,
    files: &[ProcessedFile],
    type_groups: &[TypeGroup],
    sorted_order: &[usize],
    start_offsets: &[u32],
    structure_bytes: &[u8],
) -> Vec<u8> {
    let file_type_count = type_groups.len() as u32;
    let file_count = files.len() as u32;
    let global_last = sorted_order.last().copied();

    let mut meta = Vec::new();

    // ── Meta Header (0x24 bytes) ──
    // Offset 0x00: magic
    // Offset 0x04-0x0F: reserved zeros
    // Offset 0x10: SubFileStructure offset (patched below)
    // Offset 0x14: reserved zero
    // Offset 0x18: file_type_count
    // Offset 0x1C: file_count
    // Offset 0x20: unk_count
    push_u32_le(&mut meta, magic);
    meta.extend_from_slice(&[0u8; 12]); // offset 0x04..0x0F
    push_u32_le(&mut meta, 0);          // offset 0x10: placeholder for structure offset
    push_u32_le(&mut meta, 0);          // offset 0x14
    push_u32_le(&mut meta, file_type_count);
    push_u32_le(&mut meta, file_count);
    push_u32_le(&mut meta, unk_count);

    // ── FileTypeEntry[] (each 0x20 bytes) ──
    for group in type_groups {
        let total_origin_size = calc_type_group_total_size(group, files, global_last);
        write_file_type_entry(
            &mut meta,
            group.type_id,
            total_origin_size,
            group.file_indices.len() as u32,
        );
    }

    // ── PerFileIndexEntry[] (each 0x0C bytes) ──
    for (group_idx, group) in type_groups.iter().enumerate() {
        write_per_file_index_entries(&mut meta, group, group_idx as u32, files, global_last);
    }

    // ── SubEntryHeader[] ──
    for (packed_idx, &file_idx) in sorted_order.iter().enumerate() {
        write_sub_entry_header(
            &mut meta,
            &files[file_idx],
            start_offsets[file_idx],
            packed_idx as u32,
        );
    }

    // ── Patch SubFileStructure offset at meta[0x10] ──
    let structure_offset = meta.len() as u32;
    meta[0x10..0x14].copy_from_slice(&structure_offset.to_le_bytes());

    // ── SubFileStructure binary ──
    meta.extend_from_slice(structure_bytes);

    meta
}

fn calc_type_group_total_size(
    group: &TypeGroup,
    files: &[ProcessedFile],
    global_last: Option<usize>,
) -> u32 {
    let count = group.file_indices.len();
    let mut cum: u32 = 0;
    for (pos, &file_idx) in group.file_indices.iter().enumerate() {
        let size = files[file_idx].file_size;
        let is_last_in_group = pos == count - 1;
        let is_global_last = Some(file_idx) == global_last;
        if is_last_in_group || is_global_last {
            cum += size;
        } else {
            cum += align16(size);
        }
    }
    if cum == 0x49 {
        0x48
    } else {
        cum
    }
}

fn write_file_type_entry(
    meta: &mut Vec<u8>,
    type_id: u32,
    total_origin_size: u32,
    file_count: u32,
) {
    push_u32_le(meta, type_id);
    meta.extend_from_slice(&[0u8; 12]);
    push_u32_le(meta, total_origin_size);
    push_u32_le(meta, 0);
    push_u32_le(meta, 0x10);
    push_u32_le(meta, file_count);
}

fn write_per_file_index_entries(
    meta: &mut Vec<u8>,
    group: &TypeGroup,
    group_idx: u32,
    files: &[ProcessedFile],
    global_last: Option<usize>,
) {
    let count = group.file_indices.len();
    let mut cum: u32 = 0;
    for (pos, &file_idx) in group.file_indices.iter().enumerate() {
        let size = files[file_idx].file_size;

        push_u32_le(meta, group_idx);
        push_u32_le(meta, cum);
        push_u32_le(meta, 0);

        let is_last_in_group = pos == count - 1;
        let is_global_last = Some(file_idx) == global_last;
        if is_last_in_group || is_global_last {
            cum += size;
        } else {
            cum += align16(size);
        }
    }
}

fn write_sub_entry_header(
    meta: &mut Vec<u8>,
    file: &ProcessedFile,
    start_offset: u32,
    packed_index: u32,
) {
    let body = &file.body;

    push_u32_le(meta, 0);
    push_u32_le(meta, 0);
    push_u32_le(meta, file.file_size);
    push_u32_le(meta, 0);
    push_u32_le(meta, 0);
    push_u32_le(meta, 0);
    push_u32_le(meta, body.is_need_decomp);
    push_u32_le(meta, body.chunk_count);
    push_u32_le(meta, start_offset);
    push_u32_le(meta, 0);
    push_u32_le(meta, packed_index);

    if body.chunk_count > 0 {
        meta.extend_from_slice(&body.bitmap);
        for &size in &body.chunk_sizes {
            push_u32_le(meta, size);
            push_u32_le(meta, 0);
        }
    }
}

// ── Outer Container ─────────────────────────────────────────────────────────

fn assemble_outer_container(
    meta_uncompressed: &[u8],
    meta_compressed: &[u8],
    body_data: &[u8],
) -> Vec<u8> {
    let total_size = OUTER_HEADER_SIZE + meta_compressed.len() + body_data.len();
    let mut out = Vec::with_capacity(total_size);

    out.extend_from_slice(&MAGIC_OB);
    out.extend_from_slice(&FIXED_HEADER_BYTES);
    push_u32_le(&mut out, 0); // placeholder at 0x10
    push_u32_le(&mut out, 0);
    push_u32_le(&mut out, meta_uncompressed.len() as u32);
    push_u32_le(&mut out, 0);
    push_u32_le(&mut out, meta_compressed.len() as u32);
    out.extend_from_slice(&[0u8; 12]);

    out.extend_from_slice(meta_compressed);
    out.extend_from_slice(body_data);

    let size_bytes = (out.len() as u32).to_le_bytes();
    out[0x10..0x14].copy_from_slice(&size_bytes);

    out
}

// ── SubFileStructure Serialization ──────────────────────────────────────────

fn serialize_structure_binary(entries: &[SubFileStructureEntry]) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    for entry in entries {
        match entry {
            SubFileStructureEntry::Folder {
                unk1,
                folder_count,
                unk2,
                unk2_1,
                unk3,
                unk4,
                unk5,
                unk6,
            } => {
                buf.push(0x0A);
                buf.extend_from_slice(&parse_hex_bytes(unk1)?);
                buf.extend_from_slice(&folder_count.to_le_bytes());
                buf.extend_from_slice(&parse_hex_bytes(unk2)?);
                buf.extend_from_slice(&unk2_1.to_le_bytes());
                buf.extend_from_slice(&unk3.to_le_bytes());
                buf.extend_from_slice(&unk4.to_le_bytes());
                buf.extend_from_slice(&unk5.to_le_bytes());
                buf.extend_from_slice(&unk6.to_le_bytes());
            }
            SubFileStructureEntry::Item {
                unk1,
                file_index,
                unk2,
                unk2_1,
                unk3,
                unk4,
                ..
            } => {
                buf.push(0x00);
                buf.extend_from_slice(&parse_hex_bytes(unk1)?);
                buf.extend_from_slice(&file_index.to_le_bytes());
                buf.extend_from_slice(&parse_hex_bytes(unk2)?);
                buf.extend_from_slice(&unk2_1.to_le_bytes());
                buf.extend_from_slice(&unk3.to_le_bytes());
                buf.extend_from_slice(&unk4.to_le_bytes());
            }
            SubFileStructureEntry::EndMark { end_mark_count } => {
                for _ in 0..(*end_mark_count).max(0) {
                    buf.push(0x0B);
                }
            }
        }
    }
    Ok(buf)
}

// ── Output Writing ──────────────────────────────────────────────────────────

fn write_output(output_path: &str, data: &[u8], atomic: bool) -> Result<(), String> {
    let out = Path::new(output_path);
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;
    }

    if atomic {
        let temp_path = format!("{}.tmp", output_path);
        fs::write(&temp_path, data).map_err(|e| format!("Failed to write temp file: {e}"))?;
        fs::rename(&temp_path, output_path)
            .map_err(|e| format!("Failed to rename temp to output: {e}"))?;
    } else {
        fs::write(output_path, data).map_err(|e| format!("Failed to write output: {e}"))?;
    }
    Ok(())
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_legacy_structure_json_missing_unk_fields() {
        let json = r#"{
            "Magic": -843925575,
            "UnkCount": 0,
            "SubFileData": [],
            "SubFileStructure": [
                {
                    "type": "Folder",
                    "unk1": "00000000",
                    "folderCount": 1,
                    "unk2": "00000000",
                    "unk3": 0,
                    "unk4": 0,
                    "unk6": 0
                },
                { "type": "EndMark", "endMarkCount": 1 }
            ]
        }"#;

        let parsed = parse_input_structure(json).expect("legacy structure json should parse");
        assert_eq!(parsed.sub_file_structure.len(), 2);
        match &parsed.sub_file_structure[0] {
            SubFileStructureEntry::Folder { unk2_1, unk5, .. } => {
                assert_eq!(*unk2_1, 0);
                assert_eq!(*unk5, 0);
            }
            other => panic!("expected Folder entry, got {other:?}"),
        }
    }

    #[test]
    fn test_get_file_type_id() {
        assert_eq!(get_file_type_id(".nutexb"), 0x0B);
        assert_eq!(get_file_type_id(".nuanmb"), 0x11);
        assert_eq!(get_file_type_id(".nushdb"), 0x0A);
        assert_eq!(get_file_type_id(".nusktb"), 0x0C);
        assert_eq!(get_file_type_id(".numatb"), 0x0D);
        assert_eq!(get_file_type_id(".numshb"), 0x0E);
        assert_eq!(get_file_type_id(".numdlb"), 0x0F);
        assert_eq!(get_file_type_id(".nuhlpb"), 0x13);
        assert_eq!(get_file_type_id(".nus3bank"), 0x14);
        assert_eq!(get_file_type_id(".nudnbb"), 0x17);
        assert_eq!(get_file_type_id(".nufxlb"), 0x18);
        assert_eq!(get_file_type_id(".nurpdb"), 0x19);
        assert_eq!(get_file_type_id(".bin"), 0);
        assert_eq!(get_file_type_id(".unknown"), 0);
        assert_eq!(get_file_type_id(""), 0);
    }

    #[test]
    fn test_file_type_sort_order() {
        let mut types = vec![0u32, 0x0B, 0x11, 0x0A, 0x0F, 0x13, 0x17];
        types.sort_by_key(|&t| file_type_sort_key(t));
        assert_eq!(types, vec![0x0A, 0x0B, 0x0F, 0x13, 0x17, 0x11, 0]);
    }

    #[test]
    fn test_align16() {
        assert_eq!(align16(0), 0);
        assert_eq!(align16(1), 0x10);
        assert_eq!(align16(0x10), 0x10);
        assert_eq!(align16(0x11), 0x20);
        assert_eq!(align16(0x20), 0x20);
        assert_eq!(align16(100), 112);
        assert_eq!(align16(0xFF), 0x100);
        assert_eq!(align16(0x100), 0x100);
    }

    #[test]
    fn test_parse_hex_bytes() {
        assert_eq!(parse_hex_bytes("00000000").unwrap(), vec![0, 0, 0, 0]);
        assert_eq!(parse_hex_bytes("ff01ab").unwrap(), vec![0xFF, 0x01, 0xAB]);
        assert!(parse_hex_bytes("0").is_err());
        assert!(parse_hex_bytes("zz").is_err());
    }

    #[test]
    fn test_structure_binary_roundtrip() {
        let entries = vec![
            SubFileStructureEntry::Folder {
                unk1: "00000000".to_string(),
                folder_count: 3,
                unk2: "00000000".to_string(),
                unk2_1: 0,
                unk3: 0,
                unk4: 0,
                unk5: 0,
                unk6: 0,
            },
            SubFileStructureEntry::Item {
                unk1: "00000000".to_string(),
                file_index: 5,
                unk2: "00000000".to_string(),
                unk2_1: 0,
                unk3: 0,
                unk4: 0,
                original_file_index: 5,
                display_name: None,
            },
            SubFileStructureEntry::EndMark { end_mark_count: 2 },
        ];

        let binary = serialize_structure_binary(&entries).unwrap();

        // Folder: 0x0A + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 = 1 + 32 = 0x21
        // Item:   0x00 + 4 + 4 + 4 + 4 + 4 + 4 = 1 + 24 = 0x19
        // EndMark: 2 bytes of 0x0B
        assert_eq!(binary.len(), 0x21 + 0x19 + 2);
        assert_eq!(binary[0], 0x0A);
        assert_eq!(binary[0x21], 0x00);
        // file_index = 5 at offset 0x21 + 5 = 0x26
        let fi = i32::from_le_bytes([binary[0x26], binary[0x27], binary[0x28], binary[0x29]]);
        assert_eq!(fi, 5);
        assert_eq!(binary[binary.len() - 2], 0x0B);
        assert_eq!(binary[binary.len() - 1], 0x0B);
    }

    #[test]
    fn test_compress_tiny_file() {
        let data = vec![0xAA, 0xBB];
        let body = compress_file_body(&data).unwrap();
        assert_eq!(body.is_need_decomp, 1);
        assert_eq!(body.chunk_count, 0);
        assert!(body.bitmap.is_empty());
        assert!(body.chunk_sizes.is_empty());
        assert_eq!(body.body_bytes, data);
    }

    #[test]
    fn test_compress_empty_file() {
        let data: Vec<u8> = Vec::new();
        let body = compress_file_body(&data).unwrap();
        assert_eq!(body.is_need_decomp, 1);
        assert_eq!(body.chunk_count, 0);
        assert!(body.body_bytes.is_empty());
    }

    #[test]
    fn test_compress_single_page() {
        let data = vec![0u8; 1024];
        let body = compress_file_body(&data).unwrap();
        assert!(body.body_bytes.len() < data.len());
        assert_eq!(body.chunk_count, 1);
        assert_eq!(body.is_need_decomp, 1);
        assert_eq!(body.bitmap.len(), 1);
        assert_eq!(body.bitmap[0] & 1, 1);
        assert_eq!(body.chunk_sizes.len(), 1);
    }

    #[test]
    fn test_incompressible_small_payload_forces_compressed_chunk() {
        let data = [
            0x4A, 0x4E, 0x54, 0x54, 0x01, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x90,
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
            0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x57, 0xD8, 0xA3, 0x43, 0x02, 0x00, 0x00,
            0x00, 0x90, 0x27, 0xFB, 0x6C, 0x03, 0x00, 0x00, 0x00, 0x55, 0x0D, 0xDB, 0xD7,
            0x04, 0x00, 0x00, 0x00, 0x7B, 0xC0, 0x03, 0x01, 0x05, 0x00, 0x00, 0x00, 0x36,
            0x30, 0xD4, 0x2D, 0x06, 0x00, 0x00, 0x00, 0xA4, 0xFF, 0x42, 0xD5, 0x07, 0x00,
            0x00, 0x00,
        ];
        let body = compress_file_body(&data).unwrap();
        assert_eq!(body.is_need_decomp, 1);
        assert_eq!(body.chunk_count, 1);
        assert_eq!(body.bitmap, vec![1]);
        assert_eq!(body.chunk_sizes.len(), 1);
        assert_eq!(body.body_bytes.len(), body.chunk_sizes[0] as usize);
        assert!(body.body_bytes.len() > data.len());
    }

    #[test]
    fn test_type_group_total_size_with_alignment() {
        let files = vec![
            ProcessedFile {
                file_index: 0,
                type_id: 0x0B,
                file_size: 100,
                body: empty_body(),
                name: "a".into(),
            },
            ProcessedFile {
                file_index: 1,
                type_id: 0x0B,
                file_size: 200,
                body: empty_body(),
                name: "b".into(),
            },
        ];
        let group = TypeGroup {
            type_id: 0x0B,
            file_indices: vec![0, 1],
        };
        let total = calc_type_group_total_size(&group, &files, Some(1));
        // file 0: not last in group, not global last → align16(100) = 112
        // file 1: last in group AND global last → 200 (no align)
        assert_eq!(total, 112 + 200);
    }

    #[test]
    fn test_total_size_special_case_0x49() {
        let files = vec![ProcessedFile {
            file_index: 0,
            type_id: 0x0B,
            file_size: 0x49,
            body: empty_body(),
            name: "a".into(),
        }];
        let group = TypeGroup {
            type_id: 0x0B,
            file_indices: vec![0],
        };
        let total = calc_type_group_total_size(&group, &files, Some(0));
        assert_eq!(total, 0x48);
    }

    fn empty_body() -> CompressedBody {
        CompressedBody {
            body_bytes: Vec::new(),
            bitmap: Vec::new(),
            chunk_sizes: Vec::new(),
            chunk_count: 0,
            is_need_decomp: 0,
        }
    }

    #[test]
    #[ignore]
    fn test_stage_map_content_modification_roundtrip() {
        let test_stages_dir = Path::new(r"E:\XB\解包\com\test");
        let fhm2d_path = test_stages_dir.join("16F73C97.fhm2d");
        if !fhm2d_path.exists() {
            eprintln!("SKIP: test stage file not found");
            return;
        }

        let tmp = tempfile::tempdir().unwrap();
        let work = tmp.path().to_path_buf();

        // Phase 1: Extract original FHM2D to folder
        eprintln!("Phase 1: Extracting original FHM2D...");
        let extract_dir = work.join("extracted");
        fs::create_dir_all(&extract_dir).unwrap();
        crate::format::fhm2d::extract_fhm2d_to_folder_impl(
            fhm2d_path.to_str().unwrap(),
            extract_dir.to_str().unwrap(),
            None,
            None,
            false,
        )
        .unwrap();

        let structure_json_path = format!("{}_structure.json", extract_dir.to_str().unwrap());
        assert!(
            Path::new(&structure_json_path).exists(),
            "structure.json must exist"
        );
        eprintln!(
            "  Extracted to {} with structure at {}",
            extract_dir.display(),
            structure_json_path
        );

        // Phase 2: Read original structure and verify stage layout
        eprintln!("Phase 2: Verifying stage structure...");
        let structure_content = fs::read_to_string(&structure_json_path).unwrap();
        let structure: serde_json::Value = serde_json::from_str(&structure_content).unwrap();
        let sub_file_data = structure["SubFileData"].as_array().unwrap();
        let orig_file_count = sub_file_data.len();
        eprintln!("  SubFileData entries: {}", orig_file_count);

        let file_types: std::collections::HashSet<String> = sub_file_data
            .iter()
            .filter_map(|e| e["fileType"].as_str().map(|s| s.to_string()))
            .collect();
        eprintln!("  File types found: {:?}", file_types);
        assert!(
            file_types.contains(".nutexb"),
            "stage should contain .nutexb textures"
        );

        // Phase 3: Modify a .bin file (CSV files are packed as .bin in FHM2D)
        eprintln!("Phase 3: Simulating content modification...");
        let bin_entry = sub_file_data.iter().find(|e| {
            let ft = e["fileType"].as_str().unwrap_or("");
            let url = e["fileUrl"].as_str().unwrap_or("");
            ft == ".bin" && !url.is_empty()
        });

        let modification_marker = b"RUST_TEST_MARKER_12345\n";
        let target_entry = bin_entry.unwrap_or_else(|| &sub_file_data[0]);
        let modified_file_url = target_entry["fileUrl"].as_str().unwrap().to_string();
        let target_full_path = Path::new(&structure_json_path)
            .parent()
            .unwrap()
            .join(&modified_file_url);
        eprintln!(
            "  Modifying: {} (type: {})",
            modified_file_url,
            target_entry["fileType"].as_str().unwrap_or("?")
        );
        let original_content = fs::read(&target_full_path).unwrap();
        let mut new_content = modification_marker.to_vec();
        new_content.extend_from_slice(&original_content);
        fs::write(&target_full_path, &new_content).unwrap();
        eprintln!(
            "  Added {} bytes prefix (original: {} bytes, new: {} bytes)",
            modification_marker.len(),
            original_content.len(),
            new_content.len()
        );

        // Phase 4: Repack the modified folder
        eprintln!("Phase 4: Repacking modified folder...");
        let repacked_path = work.join("repacked.fhm2d");
        let repack_result = repack_fhm2d_from_structure(
            &structure_json_path,
            repacked_path.to_str().unwrap(),
            false,
            None,
        )
        .unwrap();
        eprintln!(
            "  Repacked: {} files, {} bytes",
            repack_result.total_files, repack_result.output_size
        );

        // Phase 5: Extract the repacked FHM2D and verify modification persisted
        eprintln!("Phase 5: Extracting repacked FHM2D...");
        let repacked_bytes = fs::read(&repacked_path).unwrap();
        let re_extract =
            crate::format::fhm2d::extract_fhm2d_to_memory_impl(&repacked_bytes, "repacked", None)
                .unwrap();

        assert_eq!(
            re_extract.files.len(),
            orig_file_count,
            "repacked file count must match original"
        );

        // Find the modified CSV in the re-extraction
        let csv_file_index = sub_file_data
            .iter()
            .find(|e| {
                e["fileUrl"]
                    .as_str()
                    .map_or(false, |u| u == modified_file_url)
            })
            .and_then(|e| e["fileIndex"].as_i64())
            .unwrap() as i32;

        let re_extracted_csv = re_extract
            .files
            .iter()
            .find(|f| f.file_index == csv_file_index)
            .expect("modified CSV should exist in re-extracted files");

        assert!(
            re_extracted_csv.data.starts_with(modification_marker),
            "Modified CSV should start with our marker. First 30 bytes: {:?}",
            &re_extracted_csv.data[..re_extracted_csv.data.len().min(30)]
        );
        eprintln!(
            "  Modification verified in re-extracted file (index {})",
            csv_file_index
        );

        // Phase 6: Verify all other files are byte-exact with original extraction
        eprintln!("Phase 6: Verifying all other files unchanged...");
        let orig_bytes = fs::read(&fhm2d_path).unwrap();
        let orig_extract =
            crate::format::fhm2d::extract_fhm2d_to_memory_impl(&orig_bytes, "original", None)
                .unwrap();

        let mut unchanged_count = 0;
        let mut changed_count = 0;
        for orig_file in &orig_extract.files {
            let re_file = re_extract
                .files
                .iter()
                .find(|f| f.file_index == orig_file.file_index)
                .expect("every original file should exist in repacked");

            if orig_file.file_index == csv_file_index {
                assert_ne!(
                    orig_file.data, re_file.data,
                    "modified CSV should differ from original"
                );
                changed_count += 1;
            } else {
                assert_eq!(
                    orig_file.data, re_file.data,
                    "file index {} should be byte-exact",
                    orig_file.file_index
                );
                unchanged_count += 1;
            }
        }
        eprintln!(
            "  {} files unchanged (byte-exact), {} files modified (expected)",
            unchanged_count, changed_count
        );

        eprintln!("\n=== Stage map content modification roundtrip: PASS ===");
        eprintln!(
            "  Original: {} files, {} bytes",
            orig_file_count,
            orig_bytes.len()
        );
        eprintln!(
            "  Repacked: {} files, {} bytes",
            repack_result.total_files, repack_result.output_size
        );
        eprintln!(
            "  Modification: {} persisted correctly through repack cycle",
            modified_file_url
        );
    }

    #[test]
    #[ignore]
    fn test_stage_frontend_structure_json_repack() {
        let stage_root = Path::new(r"E:\XB\解包\com\test\16F73C97\0\0");
        if !stage_root.exists() {
            eprintln!("SKIP: test stage folder not found");
            return;
        }

        let game_exts: std::collections::HashSet<&str> = [
            ".bin",
            ".csv",
            ".hkt",
            ".jnttbl",
            ".numatb",
            ".numdlb",
            ".numshb",
            ".nuanmb",
            ".nudnbb",
            ".nufxlb",
            ".nuhlpb",
            ".nurpdb",
            ".nushdb",
            ".nus3bank",
            ".nusktb",
            ".nutexb",
            ".spbin",
        ]
        .into_iter()
        .collect();

        eprintln!("Phase 1: Scanning stage folder and building TS-style structure JSON...");
        let pack_root = Path::new(r"E:\XB\解包\com\test\16F73C97");
        let pack_folder_name = "16F73C97";

        fn scan_files(
            dir: &Path,
            root: &Path,
            exts: &std::collections::HashSet<&str>,
        ) -> Vec<(String, String)> {
            let mut result = Vec::new();
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        result.extend(scan_files(&path, root, exts));
                    } else if path.is_file() {
                        let ext = path
                            .extension()
                            .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
                            .unwrap_or_default();
                        if exts.contains(ext.as_str()) {
                            let rel = path
                                .strip_prefix(root)
                                .unwrap()
                                .to_string_lossy()
                                .replace('\\', "/");
                            result.push((rel, ext));
                        }
                    }
                }
            }
            result
        }

        let mut files = scan_files(pack_root, pack_root, &game_exts);
        files.sort_by(|a, b| a.0.cmp(&b.0));
        eprintln!("  Found {} game-ready files", files.len());

        let sub_file_data: Vec<serde_json::Value> = files
            .iter()
            .enumerate()
            .map(|(i, (rel, ext))| {
            let file_url = format!("{}/{}", pack_folder_name, rel);
                let base_name = Path::new(rel)
                    .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            serde_json::json!({
                "index": i,
                "fileType": ext,
                "fileIndex": i,
                "fileUrl": file_url,
                "fileBaseName": base_name,
            })
            })
            .collect();

        fn build_tree(files: &[(usize, Vec<String>)]) -> Vec<serde_json::Value> {
            use std::collections::BTreeMap;
            struct TreeNode {
                folders: BTreeMap<String, TreeNode>,
                files: Vec<(usize, String)>,
            }

            let mut root = TreeNode {
                folders: BTreeMap::new(),
                files: Vec::new(),
            };
            for (idx, parts) in files {
                let file_name = parts.last().unwrap().clone();
                let dirs = &parts[..parts.len()-1];
                let mut cursor = &mut root;
                for d in dirs {
                    cursor = cursor.folders.entry(d.clone()).or_insert_with(|| TreeNode {
                        folders: BTreeMap::new(),
                        files: Vec::new(),
                    });
                }
                cursor.files.push((*idx, file_name));
            }

            fn emit(node: &TreeNode, out: &mut Vec<serde_json::Value>) {
                let child_count = node.folders.len() + node.files.len();
                out.push(serde_json::json!({
                    "type": "Folder",
                    "unk1": "00000000",
                    "folderCount": child_count,
                    "unk2": "00000000",
                    "unk2_1": 0,
                    "unk3": 0, "unk4": 0, "unk5": 0, "unk6": 0,
                }));
                let mut sorted_files = node.files.clone();
                sorted_files.sort_by(|a, b| a.1.cmp(&b.1));
                for (idx, name) in &sorted_files {
                    out.push(serde_json::json!({
                        "type": "Item",
                        "unk1": "00000000",
                        "fileIndex": idx,
                        "unk2": "00000000",
                        "unk2_1": 0,
                        "unk3": 0, "unk4": 0,
                        "originalFileIndex": idx,
                        "Name": name,
                    }));
                }
                for (_, child) in &node.folders {
                    emit(child, out);
                }
                out.push(serde_json::json!({ "type": "EndMark", "endMarkCount": 1 }));
            }

            let mut result = Vec::new();
            for (_, child) in &root.folders {
                emit(child, &mut result);
            }
            for (idx, name) in &root.files {
                result.push(serde_json::json!({
                    "type": "Item", "unk1": "00000000", "fileIndex": idx,
                    "unk2": "00000000", "unk2_1": 0, "unk3": 0, "unk4": 0,
                    "originalFileIndex": idx, "Name": name,
                }));
            }
            result
        }

        let indexed_parts: Vec<(usize, Vec<String>)> = files
            .iter()
            .enumerate()
            .map(|(i, (rel, _))| (i, rel.split('/').map(String::from).collect()))
            .collect();
        let sub_file_structure = build_tree(&indexed_parts);

        let structure = serde_json::json!({
            "Magic": -843925575_i32,
            "Fhm2dTotalCount": files.len(),
            "UnkCount": 0,
            "SubFileData": sub_file_data,
            "SubFileStructure": sub_file_structure,
        });

        let tmp = tempfile::tempdir().unwrap();
        let work = tmp.path().to_path_buf();
        let struct_path = work.join("0x16F73C97_structure.json");
        fs::write(
            &struct_path,
            serde_json::to_string_pretty(&structure).unwrap(),
        )
        .unwrap();

        let symlink_target = work.join(pack_folder_name);
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(pack_root, &symlink_target)
            .or_else(|_| {
                fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
                    fs::create_dir_all(dst)?;
                    for entry in fs::read_dir(src)? {
                        let entry = entry?;
                        let ty = entry.file_type()?;
                        if ty.is_dir() {
                            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
                        } else {
                            fs::copy(entry.path(), dst.join(entry.file_name()))?;
                        }
                    }
                    Ok(())
                }
                copy_dir_all(pack_root, &symlink_target)
            })
            .unwrap();

        eprintln!("Phase 2: Repacking with TS-style structure JSON...");
        let repacked_path = work.join("frontend_repacked.fhm2d");
        let repack_result = repack_fhm2d_from_structure(
            struct_path.to_str().unwrap(),
            repacked_path.to_str().unwrap(),
            false,
            None,
        )
        .unwrap();
        eprintln!(
            "  Repacked: {} files, {} bytes",
            repack_result.total_files, repack_result.output_size
        );

        eprintln!("Phase 3: Extracting repacked FHM2D and verifying...");
        let repacked_bytes = fs::read(&repacked_path).unwrap();
        let re_extract = crate::format::fhm2d::extract_fhm2d_to_memory_impl(
            &repacked_bytes,
            "frontend_repacked",
            None,
        )
        .unwrap();
        assert_eq!(
            re_extract.files.len(),
            files.len(),
            "repacked file count must match scanned files"
        );

        let mut size_sum = 0u64;
        let mut empty_files = Vec::new();
        for file in &re_extract.files {
            if file.data.is_empty() {
                empty_files.push((
                    file.file_index,
                    file.file_type.clone(),
                    file.file_url.clone(),
                ));
            }
            size_sum += file.data.len() as u64;
        }
        if !empty_files.is_empty() {
            eprintln!("  Empty files ({}):", empty_files.len());
            for (idx, ft, url) in &empty_files {
                let is_expected = ft == ".bin" || ft == ".csv";
                eprintln!(
                    "    index={}, type={}, url={} {}",
                    idx,
                    ft,
                    url,
                    if is_expected {
                        "(expected)"
                    } else {
                        "(UNEXPECTED)"
            }
                );
        }
        }
        eprintln!(
            "  Verified: {} files extracted, total decompressed data: {} bytes",
            re_extract.files.len(),
            size_sum
        );

        let file_types: std::collections::HashSet<String> = re_extract
            .files
            .iter()
            .map(|f| f.file_type.clone())
            .collect();
        eprintln!("  File types in repacked: {:?}", file_types);
        assert!(file_types.contains(".nutexb"), "must contain .nutexb");
        assert!(file_types.contains(".numatb"), "must contain .numatb");
        assert!(file_types.contains(".numshb"), "must contain .numshb");

        eprintln!("\n=== Frontend structure JSON → Rust repack → extract: PASS ===");
        eprintln!(
            "  {} files from named-folder stage successfully packed and verified",
            files.len()
        );
    }

    #[test]
    #[ignore]
    fn test_stage_map_multiple_type_roundtrip() {
        let test_stages: Vec<(&str, &str)> = vec![
            ("16F73C97", r"E:\XB\解包\com\test\16F73C97.fhm2d"),
            ("84F085E5", r"E:\XB\解包\com\test\84F085E5.fhm2d"),
        ];

        for (name, fhm2d_path) in &test_stages {
            let path = Path::new(fhm2d_path);
            if !path.exists() {
                eprintln!("[{name}] SKIP: file not found");
                continue;
            }

            eprintln!("\n=== Testing stage: {name} ===");
            let tmp = tempfile::tempdir().unwrap();
            let work = tmp.path().to_path_buf();

            let extract_dir = work.join("extracted");
            fs::create_dir_all(&extract_dir).unwrap();
            let _ext_result = crate::format::fhm2d::extract_fhm2d_to_folder_impl(
                fhm2d_path,
                extract_dir.to_str().unwrap(),
                None,
                None,
                false,
            )
            .unwrap();

            let structure_json_path = format!("{}_structure.json", extract_dir.to_str().unwrap());

            let repacked_path = work.join("repacked.fhm2d");
            let repack_result = repack_fhm2d_from_structure(
                &structure_json_path,
                repacked_path.to_str().unwrap(),
                false,
                None,
            )
            .unwrap();

            let orig_bytes = fs::read(path).unwrap();
            let repacked_bytes = fs::read(&repacked_path).unwrap();

            let orig_extract = crate::format::fhm2d::extract_fhm2d_to_memory_impl(
                &orig_bytes,
                &format!("{name}_orig"),
                None,
            )
            .unwrap();
            let re_extract = crate::format::fhm2d::extract_fhm2d_to_memory_impl(
                &repacked_bytes,
                &format!("{name}_repacked"),
                None,
            )
            .unwrap();

            assert_eq!(
                orig_extract.files.len(),
                re_extract.files.len(),
                "{name}: file count mismatch"
            );

            let mut all_match = true;
            for orig in &orig_extract.files {
                let repacked = re_extract
                    .files
                    .iter()
                    .find(|f| f.file_index == orig.file_index)
                    .unwrap_or_else(|| panic!("{name}: missing file index {}", orig.file_index));
                if orig.data != repacked.data {
                    eprintln!(
                        "  DIFF at index {}: orig {} bytes vs repacked {} bytes",
                        orig.file_index,
                        orig.data.len(),
                        repacked.data.len()
                    );
                    all_match = false;
                }
            }

            assert!(all_match, "{name}: some files differ after roundtrip");
            eprintln!(
                "  [{name}] PASS: {} files, orig {} bytes → repacked {} bytes",
                repack_result.total_files,
                orig_bytes.len(),
                repacked_bytes.len()
            );
        }
    }

    #[test]
    fn test_16f73c97_repack_meta_matches_original() {
        let structure_path = r"E:\XB\解包\com\test\16F73C97_structure.json";
        if !Path::new(structure_path).exists() {
            eprintln!("SKIP: test file not present");
            return;
        }
        let output_path = r"E:\XB\解包\com\test\16F73C97_repacked_test.fhm2d";
        let original_path = r"E:\XB\解包\com\test\16F73C97.fhm2d";

        let result = repack_fhm2d_from_structure(structure_path, output_path, false, None);
        assert!(result.is_ok(), "Repack failed: {:?}", result.err());
        let info = result.unwrap();
        eprintln!("Repacked: {} bytes", info.output_size);

        let orig_bytes = fs::read(original_path).unwrap();
        let repack_bytes = fs::read(output_path).unwrap();

        fn read_u32(b: &[u8], off: usize) -> u32 {
            u32::from_le_bytes(b[off..off+4].try_into().unwrap())
        }

        let orig_meta_comp_size = read_u32(&orig_bytes, 0x20) as usize;
        let repack_meta_comp_size = read_u32(&repack_bytes, 0x20) as usize;

        use flate2::read::DeflateDecoder;
        use std::io::Read;
        fn decompress(data: &[u8]) -> Vec<u8> {
            let mut decoder = DeflateDecoder::new(data);
            let mut out = Vec::new();
            decoder.read_to_end(&mut out).unwrap();
            out
        }

        let orig_meta = decompress(&orig_bytes[0x30..0x30+orig_meta_comp_size]);
        let repack_meta = decompress(&repack_bytes[0x30..0x30+repack_meta_comp_size]);

        assert_eq!(
            orig_meta.len(),
            repack_meta.len(),
            "Meta sizes differ: orig={} repack={}",
            orig_meta.len(),
            repack_meta.len()
        );

        let mut diffs = Vec::new();
        for i in 0..orig_meta.len() {
            if orig_meta[i] != repack_meta[i] {
                diffs.push((i, orig_meta[i], repack_meta[i]));
            }
        }
        if !diffs.is_empty() {
            eprintln!("Found {} byte differences in meta:", diffs.len());
            for (off, o, r) in diffs.iter().take(30) {
                eprintln!(
                    "  offset 0x{:04X}: orig=0x{:02X} repack=0x{:02X}",
                    off, o, r
                );
            }
        }
        assert_eq!(
            diffs.len(),
            0,
            "Meta blobs differ at {} positions",
            diffs.len()
        );

        let _ = fs::remove_file(output_path);
    }
}
