//! FHM2D extractor for OB files only.
//! This module keeps all logic in a single file.

use binrw::{BinRead, BinReaderExt};
use flate2::read::DeflateDecoder;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};

use crate::format::fhm2d_structure_metadata::{
    metadata_from_source, metadata_from_source_strict, sanitize_structure_name,
};

const MAGIC_OB: [u8; 4] = [0xB9, 0xB7, 0xB2, 0xCD];
const MAGIC_GVS: [u8; 4] = [0x99, 0x92, 0xCD, 0x90];
const PAGE_SIZE: usize = 0x10000;
const MOTION_INTERNAL_NAME_OFFSET: usize = 0x50;
const NUS3BANK_INTERNAL_NAME_OFFSET: usize = 0x7d; // Maybe 0x7c is size of the string?

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractFhm2dResult {
    pub naming_error: Option<String>,
}

#[derive(Clone)]
pub struct InMemoryFhm2dFile {
    pub file_index: i32,
    pub file_type: String,
    pub file_url: String,
    pub data: Vec<u8>,
}

#[derive(Clone)]
pub struct InMemoryFhm2dExtraction {
    pub source_name: String,
    pub format: Option<Fhm2dFormat>,
    pub naming_error: Option<String>,
    pub files: Vec<InMemoryFhm2dFile>,
    pub sub_file_structure: Vec<SubFileStructureEntry>,
    pub meta_header: u32,
    pub unk_count: u32,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Fhm2dFormat {
    Character,
    /// Model subset + nutexb (no character-package steps: nuhlpb 0\\3, folder 0 bins, 0\\1 magic).
    Effect,
    AllNutexb,
    StageList,
    CharacterParam,
    /// Out-of-game character balance data (cost, HP, etc.): `0xFF832E7F.fhm2d`.
    CharacterCost,
    Msc,
    Motion,
    Sound,
}

impl Fhm2dFormat {
    pub fn from_opt_str(value: Option<&str>) -> Result<Option<Self>, String> {
        match value {
            None => Ok(None),
            Some("fhm2d_character") => Ok(Some(Self::Character)),
            Some("fhm2d_effect") => Ok(Some(Self::Effect)),
            Some("fhm2d_all_nutexb") => Ok(Some(Self::AllNutexb)),
            Some("fhm2d_stage_list") => Ok(Some(Self::StageList)),
            Some("fhm2d_character_param") => Ok(Some(Self::CharacterParam)),
            Some("fhm2d_character_cost") => Ok(Some(Self::CharacterCost)),
            Some("fhm2d_msc") => Ok(Some(Self::Msc)),
            Some("fhm2d_motion") => Ok(Some(Self::Motion)),
            Some("fhm2d_sound") => Ok(Some(Self::Sound)),
            Some(other) => Err(format!("Unsupported fhm2d format: {other}")),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputSubFileData {
    index: usize,
    file_type: String,
    file_index: i32,
    file_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_base_name: Option<String>,
}

// Legacy `_structure.json` files produced by older unpackers may omit some
// SubFileStructure scalar fields (for example `unk2_1` or `unk5`). Repack
// defaults missing strings to empty and missing integers to 0 so packing
// can proceed without manual JSON repair.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum SubFileStructureEntry {
    Folder {
        #[serde(default)]
        unk1: String,
        #[serde(default)]
        folder_count: i32,
        #[serde(default)]
        unk2: String,
        #[serde(rename = "unk2_1", default)]
        unk2_1: i32,
        #[serde(default)]
        unk3: i32,
        #[serde(default)]
        unk4: i32,
        #[serde(default)]
        unk5: i32,
        #[serde(default)]
        unk6: i32,
    },
    Item {
        #[serde(default)]
        unk1: String,
        #[serde(default)]
        file_index: i32,
        #[serde(default)]
        unk2: String,
        #[serde(rename = "unk2_1", default)]
        unk2_1: i32,
        #[serde(default)]
        unk3: i32,
        #[serde(default)]
        unk4: i32,
        #[serde(default)]
        original_file_index: i32,
        #[serde(rename = "Name", skip_serializing_if = "Option::is_none")]
        display_name: Option<String>,
    },
    EndMark {
        #[serde(default)]
        end_mark_count: i32,
    },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParseNode {
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    node_type: Option<String>,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    link: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unk1: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unk2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    unk3: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<ParseNode>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputStructure {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "HashName")]
    hash_name: String,
    #[serde(rename = "Magic")]
    magic: u32,
    #[serde(rename = "Fhm2dTotalCount")]
    fhm2d_total_count: usize,
    #[serde(rename = "UnkCount")]
    unk_count: u32,
    #[serde(rename = "SubFileData")]
    sub_file_data: Vec<OutputSubFileData>,
    #[serde(rename = "SubFileStructure")]
    sub_file_structure: Vec<SubFileStructureEntry>,
    #[serde(rename = "SubFileParseStructure")]
    sub_file_parse_structure: ParseNode,
    #[serde(rename = "__namingError", skip_serializing_if = "Option::is_none")]
    naming_error: Option<String>,
}

#[derive(BinRead)]
#[br(little)]
struct FileTypeEntry {
    file_type: u32,
    #[br(pad_before = 0x18)]
    file_count: u32,
}

#[derive(BinRead)]
#[br(little)]
struct SubEntryHeader {
    #[br(pad_before = 0x08)]
    file_size: u32,
    #[br(pad_before = 0x10)]
    chunk_count: u32,
    start_offset: u32,
    #[br(pad_before = 0x04)]
    file_index: u32,
}

#[derive(BinRead)]
#[br(little)]
struct ChunkSizeEntry {
    size: i32,
    _padding: i32,
}

#[derive(Clone)]
struct DecodedSubFile {
    file_index: i32,
    data: Vec<u8>,
}

struct ParsedOb {
    meta_header: u32,
    unk_count: u32,
    type_list: Vec<String>,
    files: Vec<DecodedSubFile>,
    sub_file_structure: Vec<SubFileStructureEntry>,
    sub_file_parse_structure: ParseNode,
}

/// Class-like extractor facade for fhm2d workflow.
pub struct Fhm2dExtractor<'a> {
    source_path: &'a str,
    out_dir: &'a str,
    format: Option<Fhm2dFormat>,
    list_output_file_name: Option<String>,
    write_meta_bin: bool,
}

impl<'a> Fhm2dExtractor<'a> {
    pub fn new(
        source_path: &'a str,
        out_dir: &'a str,
        format: Option<Fhm2dFormat>,
        list_output_file_name: Option<String>,
        write_meta_bin: bool,
    ) -> Self {
        Self {
            source_path,
            out_dir,
            format,
            list_output_file_name,
            write_meta_bin,
        }
    }

    pub fn extract(self) -> Result<ExtractFhm2dResult, String> {
        let file_bytes =
            fs::read(self.source_path).map_err(|e| format!("Failed to read fhm2d file: {e}"))?;
        let (parsed, meta_inflated) = parse_ob_fhm2d(file_bytes.as_slice())?;

        let out_name = Path::new(self.out_dir)
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| format!("Invalid output directory: {}", self.out_dir))?
            .to_string();
        let (structure_name, hash_name) =
            metadata_from_source_strict(self.source_path, out_name.as_str())?;
        fs::create_dir_all(self.out_dir)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;

        if self.write_meta_bin {
            let meta_path = Path::new(self.out_dir).join("meta.bin");
            fs::write(&meta_path, meta_inflated.as_slice())
                .map_err(|e| format!("Write meta.bin failed: {e}"))?;
            println!(
                "[fhm2d] wrote meta.bin: {} ({} bytes)",
                meta_path.display(),
                meta_inflated.len()
            );
        }

        let mut files = parsed.files;
        files.sort_by_key(|f| f.file_index);

        let mut output = build_output_structure(
            parsed.meta_header,
            parsed.unk_count,
            files.as_slice(),
            parsed.type_list.as_slice(),
            parsed.sub_file_structure,
            parsed.sub_file_parse_structure,
            out_name.as_str(),
            structure_name.as_str(),
            hash_name.as_str(),
            self.format,
        )?;

        let mut named_output = output.clone();
        let naming_error = match apply_naming(
            &mut named_output,
            files.as_slice(),
            self.format,
            self.list_output_file_name.as_deref(),
            out_name.as_str(),
        ) {
            Ok(()) => {
                output = named_output;
                None
            }
            Err(err) => Some(err),
        };
        output.naming_error = naming_error.clone();
        sync_structure_display_name(&mut output);

        write_files(
            self.out_dir,
            out_name.as_str(),
            files.as_slice(),
            output.sub_file_data.as_slice(),
            self.format,
        )?;

        if self.format == Some(Fhm2dFormat::Motion) {
            ensure_motion_empty_folders(self.out_dir, &output.sub_file_parse_structure)?;
        }

        let structure_path = format!("{}_structure.json", self.out_dir);
        let json = serde_json::to_string_pretty(&output)
            .map_err(|e| format!("Serialize structure json failed: {e}"))?;
        fs::write(structure_path, json).map_err(|e| format!("Write structure json failed: {e}"))?;

        Ok(ExtractFhm2dResult { naming_error })
    }
}

pub fn extract_fhm2d_to_folder_impl(
    source_path: &str,
    out_dir: &str,
    format: Option<Fhm2dFormat>,
    list_output_file_name: Option<String>,
    write_meta_bin: bool,
) -> Result<ExtractFhm2dResult, String> {
    Fhm2dExtractor::new(
        source_path,
        out_dir,
        format,
        list_output_file_name,
        write_meta_bin,
    )
    .extract()
}

/// Write decompressed OB meta section to `<out_dir>/meta.bin`.
pub fn write_ob_meta_bin_from_bytes(bytes: &[u8], out_dir: &Path) -> Result<(), String> {
    let (_, meta_inflated) = parse_ob_fhm2d(bytes)?;
    fs::create_dir_all(out_dir)
        .map_err(|e| format!("Failed to create {}: {e}", out_dir.display()))?;
    let meta_path = out_dir.join("meta.bin");
    fs::write(&meta_path, meta_inflated.as_slice())
        .map_err(|e| format!("Write meta.bin failed: {e}"))?;
    Ok(())
}

pub fn extract_fhm2d_to_memory_impl(
    file_bytes: &[u8],
    source_name: &str,
    format: Option<Fhm2dFormat>,
) -> Result<InMemoryFhm2dExtraction, String> {
    let (parsed, _meta_inflated) = parse_ob_fhm2d(file_bytes)?;

    let mut files = parsed.files;
    files.sort_by_key(|f| f.file_index);

    let mut output = build_output_structure(
        parsed.meta_header,
        parsed.unk_count,
        files.as_slice(),
        parsed.type_list.as_slice(),
        parsed.sub_file_structure,
        parsed.sub_file_parse_structure,
        source_name,
        sanitize_structure_name(source_name).as_str(),
        metadata_from_source(source_name, source_name).1.as_str(),
        format,
    )?;

    let mut named_output = output.clone();
    let naming_error = match apply_naming(
        &mut named_output,
        files.as_slice(),
        format,
        None,
        source_name,
    ) {
        Ok(()) => {
            output = named_output;
            None
        }
        Err(err) => Some(err),
    };
    output.naming_error = naming_error.clone();
    sync_structure_display_name(&mut output);

    if output.sub_file_data.len() != files.len() {
        return Err("In-memory extraction metadata length mismatch".to_string());
    }

    let mut memory_files = Vec::with_capacity(files.len());
    for (idx, decoded) in files.into_iter().enumerate() {
        let meta = output
            .sub_file_data
            .get(idx)
            .ok_or_else(|| format!("Missing output metadata for in-memory file at index {idx}"))?;
        memory_files.push(InMemoryFhm2dFile {
            file_index: decoded.file_index,
            file_type: meta.file_type.clone(),
            file_url: meta.file_url.clone(),
            data: decoded.data,
        });
    }

    Ok(InMemoryFhm2dExtraction {
        source_name: source_name.to_string(),
        format,
        naming_error,
        files: memory_files,
        sub_file_structure: output.sub_file_structure,
        meta_header: output.magic,
        unk_count: output.unk_count,
    })
}

fn parse_ob_fhm2d(bytes: &[u8]) -> Result<(ParsedOb, Vec<u8>), String> {
    let magic = bytes
        .get(0..4)
        .ok_or_else(|| "Invalid fhm2d file: missing magic".to_string())?;
    if magic == MAGIC_GVS {
        return Err("GVS/PS4 fhm2d is not supported. Keep OB only.".to_string());
    }
    if magic != MAGIC_OB {
        return Err("Unsupported fhm2d magic. Only OB is supported.".to_string());
    }

    let meta_comp_size = read_u32_le(bytes, 0x20)? as usize;
    let meta_start = 0x30usize;
    let meta_end = meta_start
        .checked_add(meta_comp_size)
        .ok_or_else(|| "Meta compressed range overflow".to_string())?;
    let meta_comp = bytes
        .get(meta_start..meta_end)
        .ok_or_else(|| "Meta compressed range out of bounds".to_string())?;
    let body_comp = bytes
        .get(meta_end..)
        .ok_or_else(|| "Body compressed range out of bounds".to_string())?;
    let meta = inflate_raw(meta_comp)?;

    let meta_header = read_u32_le(meta.as_slice(), 0x00)?;
    let file_type_count = read_u32_le(meta.as_slice(), 0x18)? as usize;
    let file_count = read_u32_le(meta.as_slice(), 0x1c)? as usize;
    let unk_count = read_u32_le(meta.as_slice(), 0x20)?;

    let file_type_entries = parse_file_type_entries(meta.as_slice(), file_type_count)?;
    let type_list = build_type_list(file_type_entries.as_slice());

    let mut sub_cursor = 0x24usize
        .checked_add(file_type_count.saturating_mul(0x20))
        .and_then(|v| v.checked_add(file_count.saturating_mul(0x0c)))
        .ok_or_else(|| "Sub entry cursor overflow".to_string())?;
    if sub_cursor > meta.len() {
        return Err("Sub entry cursor out of meta range".to_string());
    }

    let mut files = Vec::with_capacity(file_count);
    for _ in 0..file_count {
        let (file, used_len) = parse_sub_entry(meta.as_slice(), body_comp, sub_cursor)?;
        files.push(file);
        sub_cursor = sub_cursor
            .checked_add(used_len)
            .ok_or_else(|| "Sub cursor overflow while parsing".to_string())?;
    }

    let structure_bytes = meta
        .get(sub_cursor..)
        .ok_or_else(|| "SubFileStructure range out of bounds".to_string())?;
    let sub_file_structure = parse_sub_file_structure(structure_bytes)?;
    let sub_file_parse_structure = build_parse_tree(sub_file_structure.as_slice());

    Ok((
        ParsedOb {
            meta_header,
            unk_count,
            type_list,
            files,
            sub_file_structure,
            sub_file_parse_structure,
        },
        meta,
    ))
}

fn build_output_structure(
    meta_header: u32,
    unk_count: u32,
    files: &[DecodedSubFile],
    type_list: &[String],
    sub_file_structure: Vec<SubFileStructureEntry>,
    sub_file_parse_structure: ParseNode,
    out_name: &str,
    structure_name: &str,
    hash_name: &str,
    format: Option<Fhm2dFormat>,
) -> Result<OutputStructure, String> {
    if type_list.len() != files.len() {
        return Err(format!(
            "Type list length mismatch: types={}, files={}",
            type_list.len(),
            files.len()
        ));
    }
    let folder_map = if format == Some(Fhm2dFormat::Effect) {
        Some(build_folder_map(&sub_file_parse_structure)?)
    } else {
        None
    };
    let mut sub_file_data = Vec::with_capacity(files.len());
    for (idx, f) in files.iter().enumerate() {
        let file_type = type_list[idx].clone();
        let file_url = if let Some(ref map) = folder_map {
            let folder_segments = map.get(&f.file_index).cloned().unwrap_or_default();
            let mut prefix = vec![out_name.to_string()];
            prefix.extend(folder_segments);
            let file_name = format!("{}{}", idx, file_type);
            build_file_url(prefix.as_slice(), file_name.as_str())
        } else {
            format!(".\\{}\\{}{}", out_name, idx, file_type)
        };
        sub_file_data.push(OutputSubFileData {
            index: idx,
            file_type: file_type.clone(),
            file_index: f.file_index,
            file_url,
            file_base_name: None,
        });
    }
    Ok(OutputStructure {
        name: structure_name.to_string(),
        hash_name: hash_name.to_string(),
        magic: meta_header,
        fhm2d_total_count: files.len(),
        unk_count,
        sub_file_data,
        sub_file_structure,
        sub_file_parse_structure,
        naming_error: None,
    })
}

fn parse_file_type_entries(meta: &[u8], count: usize) -> Result<Vec<FileTypeEntry>, String> {
    let mut cursor = Cursor::new(
        meta.get(0x24..)
            .ok_or_else(|| "FileTypeData range out of bounds".to_string())?,
    );
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        let entry: FileTypeEntry = cursor
            .read_le()
            .map_err(|e| format!("Read FileTypeEntry failed: {e}"))?;
        out.push(entry);
    }
    Ok(out)
}

fn build_type_list(entries: &[FileTypeEntry]) -> Vec<String> {
    let mut out = Vec::new();
    for entry in entries {
        let ext = get_file_type(entry.file_type).to_string();
        for _ in 0..entry.file_count {
            out.push(ext.clone());
        }
    }
    out
}

fn parse_sub_entry(
    meta: &[u8],
    body_comp: &[u8],
    offset: usize,
) -> Result<(DecodedSubFile, usize), String> {
    let mut cursor = Cursor::new(
        meta.get(offset..)
            .ok_or_else(|| "Sub entry meta offset out of range".to_string())?,
    );
    let header: SubEntryHeader = cursor
        .read_le()
        .map_err(|e| format!("Read SubEntryHeader failed: {e}"))?;

    let file_size = header.file_size as usize;
    let chunk_count = header.chunk_count as usize;
    let start_offset = header.start_offset as usize;
    let file_index = header.file_index as i32;

    let page_count = if file_size == 0 {
        0
    } else {
        (file_size + PAGE_SIZE - 1) / PAGE_SIZE
    };
    let bitmap_len = if page_count == 0 {
        0
    } else {
        (page_count + 7) / 8
    };
    let bitmap_start = offset + 0x2c;
    let bitmap_end = bitmap_start
        .checked_add(bitmap_len)
        .ok_or_else(|| "Bitmap end overflow".to_string())?;
    let bitmap = meta
        .get(bitmap_start..bitmap_end)
        .ok_or_else(|| "Bitmap range out of bounds".to_string())?;

    let mut used_len = 0x2cusize;
    let mut output = Vec::with_capacity(file_size);

    if chunk_count == 0 {
        let raw_end = start_offset
            .checked_add(file_size)
            .ok_or_else(|| "Raw file end overflow".to_string())?;
        let raw = body_comp
            .get(start_offset..raw_end)
            .ok_or_else(|| "Raw file range out of body".to_string())?;
        output.extend_from_slice(raw);
    } else {
        let table_start = bitmap_end;
        let table_end = table_start
            .checked_add(chunk_count.saturating_mul(0x8))
            .ok_or_else(|| "Chunk size table end overflow".to_string())?;
        let table_bytes = meta
            .get(table_start..table_end)
            .ok_or_else(|| "Chunk size table out of bounds".to_string())?;

        let mut table_cursor = Cursor::new(table_bytes);
        let mut comp_sizes = Vec::with_capacity(chunk_count);
        for _ in 0..chunk_count {
            let s: ChunkSizeEntry = table_cursor
                .read_le()
                .map_err(|e| format!("Read chunk size failed: {e}"))?;
            if s.size <= 0 {
                return Err(format!("Invalid compressed chunk size: {}", s.size));
            }
            comp_sizes.push(s.size as usize);
        }
        used_len = 0x2c + bitmap_len + chunk_count * 0x8;

        let mut data_cursor = start_offset;
        let mut comp_idx = 0usize;
        for page_idx in 0..page_count {
            let flag = bitmap[page_idx >> 3];
            let is_compressed = ((flag >> (page_idx & 7)) & 1) == 1;
            if is_compressed {
                let comp_size = *comp_sizes
                    .get(comp_idx)
                    .ok_or_else(|| "Compressed chunk index out of range".to_string())?;
                let comp_end = data_cursor
                    .checked_add(comp_size)
                    .ok_or_else(|| "Compressed chunk end overflow".to_string())?;
                let comp_data = body_comp
                    .get(data_cursor..comp_end)
                    .ok_or_else(|| "Compressed chunk range out of body".to_string())?;
                output.extend_from_slice(inflate_raw(comp_data)?.as_slice());
                data_cursor = comp_end;
                comp_idx += 1;
            } else {
                let remain = file_size.saturating_sub(page_idx * PAGE_SIZE);
                let raw_size = remain.min(PAGE_SIZE);
                let raw_end = data_cursor
                    .checked_add(raw_size)
                    .ok_or_else(|| "Raw chunk end overflow".to_string())?;
                let raw_data = body_comp
                    .get(data_cursor..raw_end)
                    .ok_or_else(|| "Raw chunk range out of body".to_string())?;
                output.extend_from_slice(raw_data);
                data_cursor = raw_end;
            }
        }
    }

    if output.len() != file_size {
        return Err(format!(
            "Decompressed file size mismatch for fileIndex {}: expected {}, got {}",
            file_index,
            file_size,
            output.len()
        ));
    }

    Ok((
        DecodedSubFile {
            file_index,
            data: output,
        },
        used_len,
    ))
}

fn parse_sub_file_structure(data: &[u8]) -> Result<Vec<SubFileStructureEntry>, String> {
    let mut out = Vec::new();
    let mut cursor = 0usize;
    while cursor < data.len() {
        let ty = data[cursor];
        match ty {
            0x0a => {
                if cursor + 0x21 > data.len() {
                    return Err("Folder entry out of range".to_string());
                }
                out.push(SubFileStructureEntry::Folder {
                    unk1: hex_string(&data[cursor + 1..cursor + 5]),
                    folder_count: read_i32_le(data, cursor + 0x5)?,
                    unk2: hex_string(&data[cursor + 0x9..cursor + 0xd]),
                    unk2_1: read_i32_le(data, cursor + 0xd)?,
                    unk3: read_i32_le(data, cursor + 0x11)?,
                    unk4: read_i32_le(data, cursor + 0x15)?,
                    unk5: read_i32_le(data, cursor + 0x19)?,
                    unk6: read_i32_le(data, cursor + 0x1d)?,
                });
                cursor += 0x21;
            }
            0x00 => {
                if cursor + 0x19 > data.len() {
                    return Err("Item entry out of range".to_string());
                }
                let file_index = read_i32_le(data, cursor + 0x5)?;
                out.push(SubFileStructureEntry::Item {
                    unk1: hex_string(&data[cursor + 1..cursor + 5]),
                    file_index,
                    unk2: hex_string(&data[cursor + 0x9..cursor + 0xd]),
                    unk2_1: read_i32_le(data, cursor + 0xd)?,
                    unk3: read_i32_le(data, cursor + 0x11)?,
                    unk4: read_i32_le(data, cursor + 0x15)?,
                    original_file_index: file_index,
                    display_name: None,
                });
                cursor += 0x19;
            }
            0x0b => {
                let mut count = 0i32;
                while cursor < data.len() && data[cursor] == 0x0b {
                    count += 1;
                    cursor += 1;
                }
                out.push(SubFileStructureEntry::EndMark {
                    end_mark_count: count,
                });
            }
            other => return Err(format!("Unsupported SubFileStructure type: 0x{other:02X}")),
        }
    }
    Ok(out)
}

enum ParseToken {
    Folder {
        name: String,
        link: bool,
        unk1: Option<String>,
        unk2: Option<String>,
        unk3: Option<i32>,
    },
    Item {
        name: String,
        link: bool,
        unk1: Option<String>,
        unk2: Option<String>,
        unk3: Option<i32>,
    },
    End,
}

fn build_parse_tree(entries: &[SubFileStructureEntry]) -> ParseNode {
    let mut folder_counter: Vec<i32> = vec![0];
    let mut tokens = Vec::new();
    for entry in entries {
        match entry {
            SubFileStructureEntry::Folder {
                unk1, unk2, unk3, ..
            } => {
                let idx = folder_counter.len() - 1;
                let name = folder_counter[idx].to_string();
                folder_counter[idx] += 1;
                folder_counter.push(0);
                tokens.push(ParseToken::Folder {
                    name,
                    link: *unk3 == 1,
                    unk1: Some(unk1.clone()),
                    unk2: Some(unk2.clone()),
                    unk3: Some(*unk3),
                });
            }
            SubFileStructureEntry::Item {
                file_index,
                unk1,
                unk2,
                unk3,
                ..
            } => tokens.push(ParseToken::Item {
                name: file_index.to_string(),
                link: *unk3 == 1,
                unk1: Some(unk1.clone()),
                unk2: Some(unk2.clone()),
                unk3: Some(*unk3),
            }),
            SubFileStructureEntry::EndMark { end_mark_count } => {
                let count = (*end_mark_count).max(0) as usize;
                for _ in 0..count {
                    if folder_counter.len() > 1 {
                        folder_counter.pop();
                    }
                    tokens.push(ParseToken::End);
                }
            }
        }
    }
    let mut idx = 0usize;
    let children = parse_children(tokens.as_slice(), &mut idx);
    ParseNode {
        node_type: None,
        name: "Root".to_string(),
        link: None,
        unk1: None,
        unk2: None,
        unk3: None,
        children: Some(children),
    }
}

fn parse_children(tokens: &[ParseToken], idx: &mut usize) -> Vec<ParseNode> {
    let mut out = Vec::new();
    while *idx < tokens.len() {
        match &tokens[*idx] {
            ParseToken::Folder {
                name,
                link,
                unk1,
                unk2,
                unk3,
            } => {
                *idx += 1;
                out.push(ParseNode {
                    node_type: Some("Folder".to_string()),
                    name: name.clone(),
                    link: Some(*link),
                    unk1: unk1.clone(),
                    unk2: unk2.clone(),
                    unk3: *unk3,
                    children: Some(parse_children(tokens, idx)),
                });
            }
            ParseToken::Item {
                name,
                link,
                unk1,
                unk2,
                unk3,
            } => {
                *idx += 1;
                out.push(ParseNode {
                    node_type: Some("Item".to_string()),
                    name: name.clone(),
                    link: Some(*link),
                    unk1: unk1.clone(),
                    unk2: unk2.clone(),
                    unk3: *unk3,
                    children: None,
                });
            }
            ParseToken::End => {
                *idx += 1;
                return out;
            }
        }
    }
    out
}

fn apply_naming(
    output: &mut OutputStructure,
    files: &[DecodedSubFile],
    format: Option<Fhm2dFormat>,
    list_output_file_name: Option<&str>,
    out_name: &str,
) -> Result<(), String> {
    match format {
        Some(Fhm2dFormat::StageList) => {
            apply_stage_list_name(output, list_output_file_name, out_name)
        }
        Some(Fhm2dFormat::CharacterParam) => apply_param_names(&mut output.sub_file_data),
        Some(Fhm2dFormat::CharacterCost) => apply_character_cost_names(&mut output.sub_file_data),
        Some(Fhm2dFormat::Msc) => apply_msc_names(&mut output.sub_file_data),
        Some(Fhm2dFormat::Motion) => apply_motion_names(
            &mut output.sub_file_data,
            files,
            &output.sub_file_parse_structure,
            out_name,
        ),
        Some(Fhm2dFormat::AllNutexb) => apply_nutexb_names(&mut output.sub_file_data, files),
        Some(Fhm2dFormat::Character) => {
            numdlb_character_enrich::apply_numdlb_base_name_to_structure(
                &mut output.sub_file_data,
                &output.sub_file_parse_structure,
                files,
                numdlb_character_enrich::NumdlbCharacterNamingMode::Character,
            )?;
            apply_nutexb_names(&mut output.sub_file_data, files)
        }
        Some(Fhm2dFormat::Effect) => {
            numdlb_character_enrich::apply_numdlb_base_name_to_structure(
                &mut output.sub_file_data,
                &output.sub_file_parse_structure,
                files,
                numdlb_character_enrich::NumdlbCharacterNamingMode::Effect,
            )?;
            apply_nutexb_names(&mut output.sub_file_data, files)?;
            apply_effect_shallow_parent_bins_to_efxbn(
                &mut output.sub_file_data,
                out_name,
                &output.sub_file_parse_structure,
            )
        }
        Some(Fhm2dFormat::Sound) => apply_sound_names(&mut output.sub_file_data, files),
        None => Ok(()),
    }?;
    ensure_unique_file_urls(output.sub_file_data.as_slice())
}

fn sync_structure_display_name(output: &mut OutputStructure) {
    let mut by_file_index = HashMap::new();
    for item in &output.sub_file_data {
        if let Some(base) = &item.file_base_name {
            by_file_index.insert(item.file_index, base.clone());
        }
    }
    for entry in &mut output.sub_file_structure {
        if let SubFileStructureEntry::Item {
            file_index,
            display_name,
            ..
        } = entry
        {
            if let Some(base) = by_file_index.get(file_index) {
                *display_name = Some(base.clone());
            }
        }
    }
}

fn apply_stage_list_name(
    output: &mut OutputStructure,
    list_output_file_name: Option<&str>,
    out_name: &str,
) -> Result<(), String> {
    if let Some(name) = list_output_file_name {
        let first = output
            .sub_file_data
            .first_mut()
            .ok_or_else(|| "Stage list extract has empty SubFileData".to_string())?;
        first.file_url = format!(".\\{}\\{}", out_name, name);
    }
    Ok(())
}

fn apply_param_names(sub: &mut [OutputSubFileData]) -> Result<(), String> {
    const PARAM_NAMES: [&str; 9] = [
        "grapparam.bin",
        "projectile_depiction_table.bin",
        "chrsysparam.csyspm",
        "characterparam.bin",
        "interactionid.bin",
        "hitgroupiddef.bin",
        "bulletparam.bin",
        "speedparam.bin",
        "armsparam.bin",
    ];
    for item in sub {
        let name = PARAM_NAMES
            .get(item.index)
            .map(|v| (*v).to_string())
            .unwrap_or_else(|| format!("unknown_{}.bin", item.index));
        let prefix = parent_segments(item.file_url.as_str())?;
        item.file_base_name = Some(strip_extension(name.as_str()));
        item.file_url = build_file_url(prefix.as_slice(), name.as_str());
    }
    Ok(())
}

/// Names subfiles by sorted slot index (same order as `SubFileData[].index` after `file_index` sort).
/// First three slots: playable / boss / grunt out-of-game param tables; additional slots use `{index}{extension}`.
fn apply_character_cost_names(sub: &mut [OutputSubFileData]) -> Result<(), String> {
    const COST_NAMES: [&str; 3] = [
        "foroutgamecharacterparam_playable.bin",
        "foroutgamecharacterparam_boss.bin",
        "foroutgamecharacterparam_zako.bin",
    ];
    for item in sub {
        let name = if item.index < COST_NAMES.len() {
            COST_NAMES[item.index].to_string()
        } else {
            format!("{}{}", item.index, item.file_type)
        };
        let prefix = parent_segments(item.file_url.as_str())?;
        item.file_base_name = Some(strip_extension(name.as_str()));
        item.file_url = build_file_url(prefix.as_slice(), name.as_str());
    }
    Ok(())
}

fn apply_msc_names(sub: &mut [OutputSubFileData]) -> Result<(), String> {
    const MSC_NAMES: [&str; 3] = ["0.bscex", "1.cscex", "2.dscex"];
    if sub.len() != 3 {
        return Err(format!("MSC naming requires 3 files, got {}", sub.len()));
    }
    for (idx, item) in sub.iter_mut().enumerate() {
        let name = MSC_NAMES[idx].to_string();
        let prefix = parent_segments(item.file_url.as_str())?;
        item.file_base_name = Some(strip_extension(name.as_str()));
        item.file_url = build_file_url(prefix.as_slice(), name.as_str());
    }
    Ok(())
}

fn apply_motion_names(
    sub: &mut [OutputSubFileData],
    files: &[DecodedSubFile],
    parse_root: &ParseNode,
    out_name: &str,
) -> Result<(), String> {
    if sub.len() != files.len() {
        return Err("Motion naming: file list and buffer list length mismatch".to_string());
    }
    let folder_map = build_folder_map(parse_root)?;
    for (idx, item) in sub.iter_mut().enumerate() {
        let folder_segments = folder_map.get(&item.file_index).ok_or_else(|| {
            format!(
                "Motion naming missing parse path for fileIndex {}",
                item.file_index
            )
        })?;
        let raw = read_c_string_utf8(
            files[idx].data.as_slice(),
            MOTION_INTERNAL_NAME_OFFSET,
            4096,
        )?;
        let name = normalize_motion_file_name(raw.as_str())?;
        let mut prefix = Vec::with_capacity(1 + folder_segments.len());
        prefix.push(out_name.to_string());
        prefix.extend(folder_segments.iter().cloned());
        item.file_base_name = Some(strip_extension(name.as_str()));
        item.file_url = build_file_url(prefix.as_slice(), name.as_str());
    }
    Ok(())
}

fn apply_sound_names(
    sub: &mut [OutputSubFileData],
    files: &[DecodedSubFile],
) -> Result<(), String> {
    let by_file_index = build_file_index_map(sub)?;
    let mut used: HashSet<String> = sub
        .iter()
        .map(|s| normalize_path_key(s.file_url.as_str()))
        .collect();
    for item in sub {
        if !item.file_type.eq_ignore_ascii_case(".nus3bank") {
            continue;
        }
        let source_idx = *by_file_index
            .get(&item.file_index)
            .ok_or_else(|| format!("Sound naming missing fileIndex {}", item.file_index))?;
        let base = parse_nus3bank_display_name(files[source_idx].data.as_slice())?;
        let prefix = parent_segments(item.file_url.as_str())?;
        used.remove(&normalize_path_key(item.file_url.as_str()));
        let mut suffix = 0usize;
        loop {
            let candidate = if suffix == 0 {
                base.clone()
            } else {
                format!("{}_{}", base, suffix)
            };
            let url = build_file_url(prefix.as_slice(), format!("{candidate}.nus3bank").as_str());
            let key = normalize_path_key(url.as_str());
            if !used.contains(&key) {
                used.insert(key);
                item.file_base_name = Some(candidate);
                item.file_url = url;
                break;
            }
            suffix += 1;
            if suffix > 9999 {
                return Err(format!(
                    "Sound naming overflow for fileIndex {}",
                    item.file_index
                ));
            }
        }
    }
    Ok(())
}

fn parse_nus3bank_display_name(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() < NUS3BANK_INTERNAL_NAME_OFFSET + 1 {
        return Err("nus3bank buffer too small for name at 0x7C".to_string());
    }
    let raw = read_c_string_utf8(bytes, NUS3BANK_INTERNAL_NAME_OFFSET, 4096)?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("nus3bank internal name at 0x7C is empty".to_string());
    }
    let cleaned = sanitize_file_name(trimmed.replace(['/', '\\'], "_").trim());
    if cleaned.is_empty() {
        return Err("nus3bank internal name is empty after sanitize".to_string());
    }
    let mut base = strip_extension(cleaned.as_str());
    if base.to_ascii_lowercase().ends_with(".nus3bank") {
        base = strip_extension(base.as_str());
    }
    if base.is_empty() || has_windows_invalid_chars(base.as_str()) {
        return Err(format!("nus3bank base name invalid: {cleaned}"));
    }
    Ok(base)
}

fn apply_nutexb_names(
    sub: &mut [OutputSubFileData],
    files: &[DecodedSubFile],
) -> Result<(), String> {
    let by_file_index = build_file_index_map(sub)?;
    let mut used: HashSet<String> = sub
        .iter()
        .map(|s| normalize_path_key(s.file_url.as_str()))
        .collect();
    for item in sub {
        if !item.file_type.eq_ignore_ascii_case(".nutexb") {
            continue;
        }
        let source_idx = *by_file_index
            .get(&item.file_index)
            .ok_or_else(|| format!("Nutexb naming missing fileIndex {}", item.file_index))?;
        let base = parse_nutexb_name(files[source_idx].data.as_slice())?;
        let prefix = parent_segments(item.file_url.as_str())?;
        used.remove(&normalize_path_key(item.file_url.as_str()));
        let mut suffix = 0usize;
        loop {
            let candidate = if suffix == 0 {
                base.clone()
            } else {
                format!("{}_{}", base, suffix)
            };
            let url = build_file_url(prefix.as_slice(), format!("{candidate}.nutexb").as_str());
            let key = normalize_path_key(url.as_str());
            if !used.contains(&key) {
                used.insert(key);
                item.file_base_name = Some(candidate);
                item.file_url = url;
                break;
            }
            suffix += 1;
            if suffix > 9999 {
                return Err(format!(
                    "Nutexb naming overflow for fileIndex {}",
                    item.file_index
                ));
            }
        }
    }
    Ok(())
}

/// Loose `.bin` files next to numbered effect group folders are renamed to `.efxbn`.
/// Parent paths from `build_folder_map` include both `["0"]` (from items whose folder path is `0\0\`)
/// and `["0","0"]` (from items under `0\0\0\`); using **max** depth keeps `["0","0"]` so loose bins match.
fn apply_effect_shallow_parent_bins_to_efxbn(
    sub: &mut [OutputSubFileData],
    out_name: &str,
    parse_root: &ParseNode,
) -> Result<(), String> {
    let folder_map = build_folder_map(parse_root)?;
    let mut parent_dirs: HashSet<Vec<String>> = HashSet::new();
    for path in folder_map.values() {
        if path.len() >= 1 {
            parent_dirs.insert(path[..path.len() - 1].to_vec());
        }
    }
    // Items with path `["0","0"]` contribute parent `["0"]`; group items with `["0","0","0"]` contribute
    // `["0","0"]`. Using min depth keeps only `["0"]`, while loose bins sit at rel `["0","0"]` and never
    // match. Use max depth so the deepest shared directory (sibling to numbered group folders) wins.
    let non_empty_parents: Vec<Vec<String>> =
        parent_dirs.into_iter().filter(|p| !p.is_empty()).collect();
    if non_empty_parents.is_empty() {
        return Ok(());
    }
    let max_depth = non_empty_parents.iter().map(|p| p.len()).max().unwrap_or(0);
    let shallow_parents: HashSet<Vec<String>> = non_empty_parents
        .into_iter()
        .filter(|p| p.len() == max_depth)
        .collect();

    for item in sub.iter_mut() {
        if !item.file_type.eq_ignore_ascii_case(".bin") {
            continue;
        }
        let parents = parent_segments(item.file_url.as_str())?;
        if !parents
            .first()
            .map_or(false, |s| s.eq_ignore_ascii_case(out_name))
        {
            continue;
        }
        let rel: Vec<String> = parents[1..].to_vec();
        if !shallow_parents.contains(&rel) {
            continue;
        }
        let segments = split_path_segments(item.file_url.as_str());
        let old_name = segments
            .last()
            .ok_or_else(|| format!("Invalid fileUrl: {}", item.file_url))?;
        let base = strip_extension(old_name.as_str());
        let new_name = format!("{base}.efxbn");
        let prefix = parent_segments(item.file_url.as_str())?;
        item.file_type = ".efxbn".to_string();
        item.file_base_name = Some(base);
        item.file_url = build_file_url(prefix.as_slice(), new_name.as_str());
    }
    Ok(())
}

fn build_file_index_map(sub: &[OutputSubFileData]) -> Result<HashMap<i32, usize>, String> {
    let mut map = HashMap::new();
    for (idx, item) in sub.iter().enumerate() {
        if map.insert(item.file_index, idx).is_some() {
            return Err(format!(
                "Duplicate fileIndex in SubFileData: {}",
                item.file_index
            ));
        }
    }
    Ok(map)
}

fn parse_nutexb_name(bytes: &[u8]) -> Result<String, String> {
    let size = bytes.len();
    if size < 8 {
        return Err("Invalid nutexb size".to_string());
    }
    if bytes.get(size - 8..size - 4) != Some(b" XET") {
        return Err("Invalid nutexb footer magic".to_string());
    }
    let major = read_i16_le(bytes, size - 4)? as i32;
    let minor = read_i16_le(bytes, size - 2)? as i32;
    let name_offset = if major == 1 && minor == 1 {
        size.checked_sub(0x86c)
            .ok_or_else(|| "nutexb v1.1 name offset underflow".to_string())?
    } else if (major == 2 && minor == 0) || (major == 1 && minor == 2) {
        size.checked_sub(0x70)
            .ok_or_else(|| "nutexb v2.0/v1.2 name offset underflow".to_string())?
    } else {
        return Err(format!("Unsupported nutexb version: {major}.{minor}"));
    };
    if bytes.get(name_offset..name_offset + 4) != Some(b"46XT") {
        return Err("Invalid nutexb 46XT marker".to_string());
    }
    let raw = read_c_string_utf8(bytes, name_offset + 4, 4096)?;
    let cleaned = sanitize_file_name(raw.replace(['/', '\\'], "_").trim());
    if cleaned.is_empty() {
        return Err("Empty nutexb internal name".to_string());
    }
    Ok(cleaned)
}

fn normalize_motion_file_name(raw: &str) -> Result<String, String> {
    let replaced = if raw.to_ascii_lowercase().ends_with(".nuanmx.scaled") {
        format!("{}.nuanmb", &raw[..raw.len() - ".nuanmx.scaled".len()])
    } else {
        raw.to_string()
    };
    if !replaced.to_ascii_lowercase().ends_with(".nuanmb") {
        return Err(format!("Motion name suffix invalid: {raw}"));
    }
    let base = strip_extension(replaced.as_str());
    if base.is_empty() || has_windows_invalid_chars(base.as_str()) {
        return Err(format!("Motion name invalid: {replaced}"));
    }
    Ok(replaced)
}

fn ensure_unique_file_urls(sub: &[OutputSubFileData]) -> Result<(), String> {
    let mut set = HashSet::new();
    for item in sub {
        let key = normalize_path_key(item.file_url.as_str());
        if !set.insert(key) {
            return Err(format!("Duplicate fileUrl: {}", item.file_url));
        }
    }
    Ok(())
}

fn build_folder_map(root: &ParseNode) -> Result<HashMap<i32, Vec<String>>, String> {
    let mut out = HashMap::new();
    fn walk(
        node: &ParseNode,
        path: &mut Vec<String>,
        out: &mut HashMap<i32, Vec<String>>,
    ) -> Result<(), String> {
        let children = match &node.children {
            Some(v) => v,
            None => return Ok(()),
        };
        for child in children {
            match child.node_type.as_deref() {
                Some("Folder") => {
                    path.push(child.name.clone());
                    walk(child, path, out)?;
                    let _ = path.pop();
                }
                Some("Item") => {
                    let idx = child
                        .name
                        .parse::<i32>()
                        .map_err(|_| format!("Invalid parse-tree file index: {}", child.name))?;
                    if out.insert(idx, path.clone()).is_some() {
                        return Err(format!("Duplicate file index in parse tree: {idx}"));
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }
    let mut path = Vec::new();
    walk(root, &mut path, &mut out)?;
    Ok(out)
}

fn write_files(
    out_dir: &str,
    out_name: &str,
    files: &[DecodedSubFile],
    sub_file_data: &[OutputSubFileData],
    format: Option<Fhm2dFormat>,
) -> Result<(), String> {
    if files.len() != sub_file_data.len() {
        return Err("Write files: file list and metadata list length mismatch".to_string());
    }
    let base = PathBuf::from(out_dir);
    fs::create_dir_all(&base).map_err(|e| format!("Create output dir failed: {e}"))?;
    for (idx, item) in sub_file_data.iter().enumerate() {
        let rel = if matches!(
            format,
            Some(Fhm2dFormat::Motion) | Some(Fhm2dFormat::Effect)
        ) {
            motion_relative_path(item.file_url.as_str(), out_name)?
        } else {
            let parts = split_path_segments(item.file_url.as_str());
            parts
                .last()
                .cloned()
                .ok_or_else(|| format!("Invalid fileUrl for write: {}", item.file_url))?
        };
        validate_relative_path(rel.as_str())?;
        let full = base.join(rel.as_str());
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Create parent dir failed: {e}"))?;
        }
        let bytes = files[idx].data.len();
        fs::write(&full, files[idx].data.as_slice())
            .map_err(|e| format!("Write file failed {}: {e}", full.display()))?;
        println!("[fhm2d] wrote file: {} ({} bytes)", full.display(), bytes);
    }
    Ok(())
}

fn ensure_motion_empty_folders(out_dir: &str, root: &ParseNode) -> Result<(), String> {
    fn walk(out_dir: &str, node: &ParseNode, prefix: &mut Vec<String>) -> Result<(), String> {
        let children = match &node.children {
            Some(v) => v,
            None => return Ok(()),
        };
        for child in children {
            if child.node_type.as_deref() != Some("Folder") {
                continue;
            }
            prefix.push(child.name.clone());
            let is_empty = child
                .children
                .as_ref()
                .map(|v| v.is_empty())
                .unwrap_or(true);
            if is_empty {
                let mut path = PathBuf::from(out_dir);
                for seg in prefix.iter() {
                    path.push(seg);
                }
                fs::create_dir_all(path).map_err(|e| format!("Create empty folder failed: {e}"))?;
            } else {
                walk(out_dir, child, prefix)?;
            }
            let _ = prefix.pop();
        }
        Ok(())
    }

    let mut prefix = Vec::new();
    walk(out_dir, root, &mut prefix)
}

/// Relative path under the output folder name (`out_name` first segment), preserving subfolders in `fileUrl`.
/// Used for `fhm2d_motion` and `fhm2d_effect` writes.
fn motion_relative_path(file_url: &str, out_name: &str) -> Result<String, String> {
    let segments = split_path_segments(file_url);
    if segments.len() < 2 {
        return Err(format!(
            "Invalid fileUrl (need output root + path): {file_url}"
        ));
    }
    if segments[0] != out_name {
        return Err(format!(
            "fileUrl root mismatch: expected {}, got {}",
            out_name, segments[0]
        ));
    }
    Ok(segments[1..].join("/"))
}

fn get_file_type(file_type: u32) -> &'static str {
    match file_type {
        0x0A => ".nushdb",
        0x0B => ".nutexb",
        0x0C => ".nusktb",
        0x0D => ".numatb",
        0x0E => ".numshb",
        0x0F => ".numdlb",
        0x13 => ".nuhlpb",
        0x14 => ".nus3bank",
        0x17 => ".nudnbb",
        0x18 => ".nufxlb",
        0x19 => ".nurpdb",
        _ => ".bin",
    }
}

fn read_u32_le(data: &[u8], offset: usize) -> Result<u32, String> {
    let b = data
        .get(offset..offset + 4)
        .ok_or_else(|| format!("read_u32 out of range at 0x{offset:X}"))?;
    Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

fn read_i32_le(data: &[u8], offset: usize) -> Result<i32, String> {
    let b = data
        .get(offset..offset + 4)
        .ok_or_else(|| format!("read_i32 out of range at 0x{offset:X}"))?;
    Ok(i32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

fn read_u64_le(data: &[u8], offset: usize) -> Result<u64, String> {
    let b = data
        .get(offset..offset + 8)
        .ok_or_else(|| format!("read_u64 out of range at 0x{offset:X}"))?;
    Ok(u64::from_le_bytes([
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
    ]))
}

fn read_i16_le(data: &[u8], offset: usize) -> Result<i16, String> {
    let b = data
        .get(offset..offset + 2)
        .ok_or_else(|| format!("read_i16 out of range at 0x{offset:X}"))?;
    Ok(i16::from_le_bytes([b[0], b[1]]))
}

fn read_c_string_utf8(data: &[u8], offset: usize, max_len: usize) -> Result<String, String> {
    if offset >= data.len() {
        return Err(format!("CString offset out of range: 0x{offset:X}"));
    }
    let end_limit = (offset + max_len).min(data.len());
    let mut end = offset;
    while end < end_limit && data[end] != 0 {
        end += 1;
    }
    String::from_utf8(data[offset..end].to_vec()).map_err(|e| format!("UTF-8 decode failed: {e}"))
}

fn inflate_raw(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = DeflateDecoder::new(data);
    let mut out = Vec::new();
    decoder
        .read_to_end(&mut out)
        .map_err(|e| format!("inflateRaw failed: {e}"))?;
    Ok(out)
}

fn split_path_segments(path: &str) -> Vec<String> {
    path.replace('/', "\\")
        .trim_start_matches(".\\")
        .split('\\')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

fn parent_segments(file_url: &str) -> Result<Vec<String>, String> {
    let mut parts = split_path_segments(file_url);
    if parts.len() < 2 {
        return Err(format!("Invalid fileUrl: {file_url}"));
    }
    parts.pop();
    Ok(parts)
}

fn build_file_url(prefix: &[String], file_name: &str) -> String {
    let mut parts = vec![".".to_string()];
    parts.extend(prefix.iter().cloned());
    parts.push(file_name.to_string());
    parts.join("\\")
}

fn strip_extension(file_name: &str) -> String {
    match file_name.rfind('.') {
        Some(idx) if idx > 0 => file_name[..idx].to_string(),
        _ => file_name.to_string(),
    }
}

fn normalize_path_key(path: &str) -> String {
    path.replace('/', "\\").to_ascii_lowercase()
}

fn sanitize_file_name(input: &str) -> String {
    input
        .chars()
        .map(|ch| {
            if is_windows_invalid_char(ch) || ch.is_control() {
                '_'
            } else {
                ch
            }
        })
        .collect::<String>()
}

fn has_windows_invalid_chars(input: &str) -> bool {
    input
        .chars()
        .any(|ch| is_windows_invalid_char(ch) || ch.is_control())
}

fn validate_relative_path(rel: &str) -> Result<(), String> {
    if rel.is_empty() {
        return Err("relative path must not be empty".to_string());
    }
    let path = Path::new(rel);
    if path.is_absolute() {
        return Err(format!("relative path must be relative: {rel}"));
    }
    for c in path.components() {
        match c {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("relative path contains invalid component: {rel}"))
            }
        }
    }
    Ok(())
}

fn hex_string(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn is_windows_invalid_char(ch: char) -> bool {
    matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
}

#[path = "fhm2d_numdlb_character.rs"]
mod numdlb_character_enrich;
