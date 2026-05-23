use base64::{engine::general_purpose::STANDARD, Engine};
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ExtendedColorType, ImageEncoder};
use serde::Serialize;
use std::collections::HashSet;
use std::io::Cursor;
use std::{
    fs,
    fs::File,
    io::{BufWriter, Write},
    path::Path,
    path::PathBuf,
};

use std::str::FromStr;

use image_dds::image::RgbaImage;
use image_dds::{dds_from_image, ImageFormat as DdsImageFormat, Mipmaps, Quality};
use crc32fast::Hasher as Crc32Hasher;
use nutexb::NutexbFile;
use nutexb::NutexbFormat;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NutexbInfo {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub depth: u32,
    pub image_format: String,
    pub mipmap_count: u32,
    pub layer_count: u32,
    pub data_size: u32,
    pub is_swizzled: bool,
}

/// Full-file CRC32 (IEEE) over raw .nutexb bytes; used as part of the preview cache version key.
pub fn nutexb_file_crc32(bytes: &[u8]) -> u32 {
    let mut h = Crc32Hasher::new();
    h.update(bytes);
    h.finalize()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NutexbPreviewFileIdentity {
    pub nutexb_size: u64,
    pub crc32: u32,
}

/// Reads the file once and returns size + CRC32 over the raw nutexb bytes (no decode).
pub fn nutexb_preview_file_identity(path: &str) -> Result<NutexbPreviewFileIdentity, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let nutexb_size = bytes.len() as u64;
    let crc32 = nutexb_file_crc32(&bytes);
    Ok(NutexbPreviewFileIdentity { nutexb_size, crc32 })
}

pub fn read_nutexb_info(input_path: &str) -> Result<NutexbInfo, String> {
    let nutexb = NutexbFile::read_from_file(input_path).map_err(|e| e.to_string())?;
    Ok(NutexbInfo {
        name: nutexb.footer.string.to_string(),
        width: nutexb.footer.width,
        height: nutexb.footer.height,
        depth: nutexb.footer.depth,
        image_format: format!("{:?}", nutexb.footer.image_format),
        mipmap_count: nutexb.footer.mipmap_count,
        layer_count: nutexb.footer.layer_count,
        data_size: nutexb.footer.data_size,
        is_swizzled: nutexb.footer.unk3 == 0x1000,
    })
}

pub fn export_nutexb_to_dds(input_path: &str, output_path: &str) -> Result<(), String> {
    let nutexb = NutexbFile::read_from_file(input_path).map_err(|e| e.to_string())?;
    let dds = nutexb.to_dds().map_err(|e| e.to_string())?;

    let out = File::create(output_path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(out);
    dds.write(&mut writer).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn export_nutexb_to_png(input_path: &str, output_path: &str) -> Result<(), String> {
    let nutexb = NutexbFile::read_from_file(input_path).map_err(|e| e.to_string())?;

    // ultimate_tex approach: DDS as an intermediate handles swizzling and compressed formats (BC1/BC7/etc).
    let dds = nutexb.to_dds().map_err(|e| e.to_string())?;
    let image: RgbaImage = image_dds::image_from_dds(&dds, 0).map_err(|e| e.to_string())?;

    ensure_parent_dir(output_path)?;
    let out = File::create(output_path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(out);
    let encoder = PngEncoder::new_with_quality(
        &mut writer,
        CompressionType::Fast,
        FilterType::NoFilter,
    );
    encoder
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Decodes nutexb bytes to raw RGBA pixels, optionally downsampling to fit within `max_dimension`.
/// Returns (width, height, rgba_bytes).
pub fn nutexb_to_rgba_from_bytes(
    nutexb_bytes: &[u8],
    max_dimension: Option<u32>,
) -> Result<(u32, u32, Vec<u8>), String> {
    let mut cursor = Cursor::new(nutexb_bytes.to_vec());
    let nutexb = NutexbFile::read(&mut cursor).map_err(|e| e.to_string())?;
    let dds = nutexb.to_dds().map_err(|e| e.to_string())?;

    let base_w = nutexb.footer.width;
    let base_h = nutexb.footer.height;
    let mip_count = nutexb.footer.mipmap_count;

    // B3: Select appropriate mip level directly instead of decode+resize
    let mip_level = if let Some(max_dim) = max_dimension {
        if base_w > max_dim || base_h > max_dim {
            select_mip_level(base_w, base_h, max_dim, mip_count)
        } else {
            0
        }
    } else {
        0
    };

    let image: RgbaImage = image_dds::image_from_dds(&dds, mip_level).map_err(|e| e.to_string())?;
    let (w, h) = (image.width(), image.height());
    Ok((w, h, image.into_raw()))
}

/// Select the lowest mip level whose dimensions still meet the max_dimension target.
fn select_mip_level(base_w: u32, base_h: u32, max_dim: u32, mip_count: u32) -> u32 {
    for mip in 0..mip_count {
        let mip_w = (base_w >> mip).max(1);
        let mip_h = (base_h >> mip).max(1);
        if mip_w <= max_dim && mip_h <= max_dim {
            return mip;
        }
    }
    // All mips still exceed max_dim — use the smallest available
    mip_count.saturating_sub(1)
}

/// Decodes nutexb file to raw RGBA pixels, optionally downsampling.
pub fn nutexb_to_rgba_from_path(
    input_path: &str,
    max_dimension: Option<u32>,
) -> Result<(u32, u32, Vec<u8>), String> {
    let bytes = fs::read(input_path).map_err(|e| e.to_string())?;
    nutexb_to_rgba_from_bytes(&bytes, max_dimension)
}

/// Packs (width, height, rgba) into a single byte buffer: [u32_LE width][u32_LE height][rgba...].
pub fn pack_rgba_response(width: u32, height: u32, rgba: Vec<u8>) -> Vec<u8> {
    let mut result = Vec::with_capacity(8 + rgba.len());
    result.extend_from_slice(&width.to_le_bytes());
    result.extend_from_slice(&height.to_le_bytes());
    result.extend_from_slice(&rgba);
    result
}

/// Encodes nutexb bytes to PNG (same pipeline as path-based decode; avoids a second disk read when bytes are already in memory).
pub fn nutexb_to_png_bytes_from_bytes(nutexb_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(nutexb_bytes.to_vec());
    let nutexb = NutexbFile::read(&mut cursor).map_err(|e| e.to_string())?;
    let dds = nutexb.to_dds().map_err(|e| e.to_string())?;
    let image: RgbaImage = image_dds::image_from_dds(&dds, 0).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    {
        let mut out = Cursor::new(&mut buf);
        let encoder = PngEncoder::new_with_quality(
            &mut out,
            CompressionType::Fast,
            FilterType::NoFilter,
        );
        encoder
            .write_image(
                image.as_raw(),
                image.width(),
                image.height(),
                ExtendedColorType::Rgba8,
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(buf)
}

/// Encodes the nutexb as PNG bytes (same pipeline as `nutexb_to_png_base64` without base64 encoding).
/// Uses fast PNG compression to reduce preview IPC latency vs default `write_to` PNG settings.
pub fn nutexb_to_png_bytes(input_path: &str) -> Result<Vec<u8>, String> {
    let bytes = fs::read(input_path).map_err(|e| e.to_string())?;
    nutexb_to_png_bytes_from_bytes(&bytes)
}

pub fn nutexb_to_png_base64(input_path: &str) -> Result<String, String> {
    let bytes = nutexb_to_png_bytes(input_path)?;
    Ok(STANDARD.encode(bytes))
}

pub fn ensure_parent_dir(output_path: &str) -> Result<(), String> {
    let path = Path::new(output_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchExportSummary {
    pub converted: u32,
    pub skipped: u32,
    pub failed: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesImageReplaceSummary {
    pub output_nutexb_path: String,
    pub preview_png_path: String,
    pub nutexb_name: String,
}

#[derive(Debug, Clone, Copy)]
pub enum OutputMode {
    RootConvert,
    PerFileConvert,
}

impl OutputMode {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "root_convert" => Ok(Self::RootConvert),
            "per_file_convert" => Ok(Self::PerFileConvert),
            _ => Err(format!("Invalid outputMode: {value}")),
        }
    }
}

pub fn batch_export_folder_to_png(
    root_dir: &str,
    output_mode: OutputMode,
    overwrite: bool,
) -> Result<BatchExportSummary, String> {
    let root = PathBuf::from(root_dir);
    let root = fs::canonicalize(&root).map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("rootDir is not a directory".to_string());
    }

    let mut files: Vec<PathBuf> = Vec::new();
    collect_nutexb_files(&root, &mut files)?;

    let mut converted = 0u32;
    let mut skipped = 0u32;
    let mut failed = 0u32;
    let mut used_output_paths: HashSet<PathBuf> = HashSet::new();

    for file_path in files {
        let out_path = match output_mode {
            OutputMode::RootConvert => make_root_convert_output_path(&root, &file_path)?,
            OutputMode::PerFileConvert => make_per_file_convert_output_path(&file_path)?,
        };

        // Resolve output name collisions inside the same directory.
        //
        // Important behavior:
        // - Always avoid collisions within this batch (in-memory): if another input would produce the same output path,
        //   rename to `{fileName}_{i}.png` (i starts from 1).
        // - When overwrite=false, also avoid overwriting existing files on disk by applying the same suffix strategy.
        // - When overwrite=true, do NOT rename just because a file already exists on disk; it will be overwritten.
        let out_path = resolve_unique_output_path(&out_path, &mut used_output_paths, overwrite)?;

        // Keep legacy behavior: when overwrite=false, treat existing file as skipped.
        // Note: with unique-path resolution above, this will only happen if the output name
        // already exists and cannot be resolved to a unique path (unlikely).
        if !overwrite && out_path.exists() {
            skipped += 1;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        match export_nutexb_to_png(
            file_path.to_string_lossy().as_ref(),
            out_path.to_string_lossy().as_ref(),
        ) {
            Ok(_) => converted += 1,
            Err(_) => failed += 1,
        }
    }

    Ok(BatchExportSummary {
        converted,
        skipped,
        failed,
    })
}

fn resolve_unique_output_path(
    base: &Path,
    used: &mut HashSet<PathBuf>,
    overwrite: bool,
) -> Result<PathBuf, String> {
    let parent = base
        .parent()
        .ok_or_else(|| "Invalid output path".to_string())?;
    let stem = base
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid output file name".to_string())?
        .to_string();

    let ext = base.extension().and_then(|e| e.to_str()).unwrap_or("png");

    let mut candidate = base.to_path_buf();
    let disk_collision = !overwrite && candidate.exists();
    if !disk_collision && !used.contains(&candidate) {
        used.insert(candidate.clone());
        return Ok(candidate);
    }

    for i in 1..=10000u32 {
        candidate = parent.join(format!("{stem}_{i}.{ext}"));
        let disk_collision = !overwrite && candidate.exists();
        if disk_collision || used.contains(&candidate) {
            continue;
        }
        used.insert(candidate.clone());
        return Ok(candidate);
    }

    Err(format!(
        "Failed to assign a unique output name in directory: {}",
        parent.to_string_lossy()
    ))
}

fn collect_nutexb_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            if path.file_name().and_then(|s| s.to_str()) == Some("__convert") {
                continue;
            }
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let is_nutexb = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("nutexb"))
            .unwrap_or(false);

        if is_nutexb {
            out.push(path);
        }
    }
    Ok(())
}

fn make_root_convert_output_path(root: &Path, nutexb_path: &Path) -> Result<PathBuf, String> {
    let parent = nutexb_path
        .parent()
        .ok_or_else(|| "Invalid nutexb path".to_string())?;
    let rel_dir = parent.strip_prefix(root).unwrap_or(parent);
    let convert_dir = root.join("__convert").join(rel_dir);

    let nutexb = NutexbFile::read_from_file(nutexb_path).map_err(|e| e.to_string())?;
    let name = sanitize_file_name(nutexb.footer.string.to_string().as_str());
    Ok(convert_dir.join(format!("{name}.png")))
}

fn make_per_file_convert_output_path(nutexb_path: &Path) -> Result<PathBuf, String> {
    let parent = nutexb_path
        .parent()
        .ok_or_else(|| "Invalid nutexb path".to_string())?;
    let convert_dir = parent.join("__convert");

    let nutexb = NutexbFile::read_from_file(nutexb_path).map_err(|e| e.to_string())?;
    let name = sanitize_file_name(nutexb.footer.string.to_string().as_str());
    Ok(convert_dir.join(format!("{name}.png")))
}

fn sanitize_file_name(input: &str) -> String {
    let trimmed = input.trim();
    let mut out = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        let safe = match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        };
        out.push(safe);
    }
    if out.is_empty() {
        "texture".to_string()
    } else {
        out
    }
}

fn format_series_ms_index(icon_file_index: i32) -> Result<String, String> {
    if icon_file_index < 1 || icon_file_index > 999 {
        return Err("iconFileIndex must be between 1 and 999".to_string());
    }
    Ok(format!("{:03}", icon_file_index))
}

/// Returns raw GPU-compressed texture data from a nutexb file without CPU decode.
/// Response format: [u32 width][u32 height][u8 format_id][compressed_data...]
/// format_id: 1=BC1, 2=BC2, 3=BC3, 4=BC4, 5=BC5, 6=BC6H, 7=BC7, 0=uncompressed RGBA
pub fn nutexb_compressed_data_from_path(input_path: &str) -> Result<(u32, u32, u8, Vec<u8>), String> {
    let bytes = fs::read(input_path).map_err(|e| e.to_string())?;
    nutexb_compressed_data_from_bytes(&bytes)
}

/// Single-read: computes CRC32 identity AND extracts compressed texture data from one file read.
/// Returns (nutexb_size, crc32, width, height, format_id, data).
pub fn nutexb_identity_and_compressed_from_path(input_path: &str) -> Result<(u64, u32, u32, u32, u8, Vec<u8>), String> {
    let bytes = fs::read(input_path).map_err(|e| e.to_string())?;
    let nutexb_size = bytes.len() as u64;
    let crc32 = nutexb_file_crc32(&bytes);
    let (w, h, fmt, data) = nutexb_compressed_data_from_bytes(&bytes)?;
    Ok((nutexb_size, crc32, w, h, fmt, data))
}

pub fn nutexb_compressed_data_from_bytes(nutexb_bytes: &[u8]) -> Result<(u32, u32, u8, Vec<u8>), String> {
    let mut cursor = Cursor::new(nutexb_bytes.to_vec());
    let nutexb = NutexbFile::read(&mut cursor).map_err(|e| e.to_string())?;
    let w = nutexb.footer.width;
    let h = nutexb.footer.height;
    let fmt = nutexb.footer.image_format;

    let format_id = match fmt {
        NutexbFormat::BC1Unorm | NutexbFormat::BC1Srgb => 1u8,
        NutexbFormat::BC2Unorm | NutexbFormat::BC2Srgb => 2,
        NutexbFormat::BC3Unorm | NutexbFormat::BC3Srgb => 3,
        NutexbFormat::BC4Unorm | NutexbFormat::BC4Snorm => 4,
        NutexbFormat::BC5Unorm | NutexbFormat::BC5Snorm => 5,
        NutexbFormat::BC6Ufloat | NutexbFormat::BC6Sfloat => 6,
        NutexbFormat::BC7Unorm | NutexbFormat::BC7Srgb => 7,
        _ => 0, // uncompressed — fallback to RGBA path
    };

    if format_id == 0 {
        // Uncompressed format — decode to RGBA
        let dds = nutexb.to_dds().map_err(|e| e.to_string())?;
        let image: RgbaImage = image_dds::image_from_dds(&dds, 0).map_err(|e| e.to_string())?;
        return Ok((w, h, 0, image.into_raw()));
    }

    // Compressed format — extract raw DDS data (mip 0 only)
    let dds = nutexb.to_dds().map_err(|e| e.to_string())?;

    // DDS data contains all mip levels; we only need mip 0
    let block_size: usize = match format_id {
        1 | 4 => 8,  // BC1, BC4: 8 bytes per 4x4 block
        _ => 16,     // BC2, BC3, BC5, BC6H, BC7: 16 bytes per 4x4 block
    };
    let blocks_x = ((w as usize) + 3) / 4;
    let blocks_y = ((h as usize) + 3) / 4;
    let mip0_size = blocks_x * blocks_y * block_size;

    let data = if dds.data.len() >= mip0_size {
        dds.data[..mip0_size].to_vec()
    } else {
        dds.data
    };

    Ok((w, h, format_id, data))
}

/// Pack compressed response: [u32_LE width][u32_LE height][u8 format_id][data...]
pub fn pack_compressed_response(width: u32, height: u32, format_id: u8, data: Vec<u8>) -> Vec<u8> {
    let mut result = Vec::with_capacity(9 + data.len());
    result.extend_from_slice(&width.to_le_bytes());
    result.extend_from_slice(&height.to_le_bytes());
    result.push(format_id);
    result.extend_from_slice(&data);
    result
}

fn nutexb_format_to_dds_image_format(fmt: NutexbFormat) -> DdsImageFormat {
    match fmt {
        NutexbFormat::R8Unorm => DdsImageFormat::R8Unorm,
        NutexbFormat::R8G8B8A8Unorm => DdsImageFormat::Rgba8Unorm,
        NutexbFormat::R8G8B8A8Srgb => DdsImageFormat::Rgba8UnormSrgb,
        NutexbFormat::B8G8R8A8Unorm => DdsImageFormat::Bgra8Unorm,
        NutexbFormat::B8G8R8A8Srgb => DdsImageFormat::Bgra8UnormSrgb,
        NutexbFormat::BC1Unorm => DdsImageFormat::BC1RgbaUnorm,
        NutexbFormat::BC1Srgb => DdsImageFormat::BC1RgbaUnormSrgb,
        NutexbFormat::BC2Unorm => DdsImageFormat::BC2RgbaUnorm,
        NutexbFormat::BC2Srgb => DdsImageFormat::BC2RgbaUnormSrgb,
        NutexbFormat::BC3Unorm => DdsImageFormat::BC3RgbaUnorm,
        NutexbFormat::BC3Srgb => DdsImageFormat::BC3RgbaUnormSrgb,
        NutexbFormat::BC4Unorm => DdsImageFormat::BC4RUnorm,
        NutexbFormat::BC4Snorm => DdsImageFormat::BC4RSnorm,
        NutexbFormat::BC5Unorm => DdsImageFormat::BC5RgUnorm,
        NutexbFormat::BC5Snorm => DdsImageFormat::BC5RgSnorm,
        NutexbFormat::BC6Ufloat => DdsImageFormat::BC6hRgbUfloat,
        NutexbFormat::BC6Sfloat => DdsImageFormat::BC6hRgbSfloat,
        NutexbFormat::BC7Unorm => DdsImageFormat::BC7RgbaUnorm,
        NutexbFormat::BC7Srgb => DdsImageFormat::BC7RgbaUnormSrgb,
        _ => DdsImageFormat::BC7RgbaUnorm,
    }
}

fn validate_series_nutexb_file_name(file_name: &str, icon_file_index: i32) -> Result<(), String> {
    let idx = format_series_ms_index(icon_file_index)?;
    let expected = format!("ser_ms_{idx}.nutexb");
    if file_name != expected {
        return Err(format!(
            "Invalid fileName: expected \"{expected}\" for iconFileIndex={icon_file_index}"
        ));
    }
    Ok(())
}

pub fn series_image_replace_from_png(
    series_image_dir: &str,
    series_image_convert_dir: &str,
    icon_file_index: i32,
    file_name: &str,
    png_path: &str,
) -> Result<SeriesImageReplaceSummary, String> {
    validate_series_nutexb_file_name(file_name, icon_file_index)?;
    let idx = format_series_ms_index(icon_file_index)?;
    let base_name = format!("ser_ms_{idx}");

    let series_dir = PathBuf::from(series_image_dir);
    let convert_dir = PathBuf::from(series_image_convert_dir);

    let out_nutexb_path = series_dir.join(format!("{base_name}.nutexb"));
    let preview_png_path = convert_dir.join(format!("{base_name}.png"));

    if let Some(parent) = out_nutexb_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if let Some(parent) = preview_png_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Load PNG -> DDS -> Nutexb (pure Rust; no external tools).
    let dyn_img = image::open(png_path).map_err(|e| e.to_string())?;
    let rgba: RgbaImage = dyn_img.to_rgba8();

    fn max_mipmap_count_for_size(width: u32, height: u32) -> u32 {
        let max_dim = width.max(height).max(1);
        32 - max_dim.leading_zeros()
    }

    let (nutexb_name, dds_format, mipmaps) = if out_nutexb_path.exists() {
        let existing = NutexbFile::read_from_file(&out_nutexb_path).map_err(|e| e.to_string())?;
        let name = existing.footer.string.to_string();
        let format = nutexb_format_to_dds_image_format(existing.footer.image_format);
        // Use the source PNG dimensions as the new target size.
        // Note: changing dimensions may affect downstream consumers expecting fixed sizes.
        let max_mips = max_mipmap_count_for_size(rgba.width().max(1), rgba.height().max(1));
        let requested_mips = existing.footer.mipmap_count.min(max_mips);
        let mipmaps = if requested_mips <= 1 {
            Mipmaps::Disabled
        } else {
            Mipmaps::GeneratedExact(requested_mips)
        };
        (name, format, mipmaps)
    } else {
        // For a new series, set the internal nutexb name to the base name.
        let name = sanitize_file_name(&base_name);
        (
            name,
            DdsImageFormat::BC7RgbaUnorm,
            Mipmaps::GeneratedAutomatic,
        )
    };

    let dds =
        dds_from_image(&rgba, dds_format, Quality::Normal, mipmaps).map_err(|e| e.to_string())?;
    let nutexb = NutexbFile::from_dds(&dds, nutexb_name.clone()).map_err(|e| e.to_string())?;
    nutexb
        .write_to_file(&out_nutexb_path)
        .map_err(|e| e.to_string())?;

    // Refresh preview PNG at the fixed series mapping path (ser_ms_###.png).
    export_nutexb_to_png(
        out_nutexb_path.to_string_lossy().as_ref(),
        preview_png_path.to_string_lossy().as_ref(),
    )?;

    Ok(SeriesImageReplaceSummary {
        output_nutexb_path: out_nutexb_path.to_string_lossy().to_string(),
        preview_png_path: preview_png_path.to_string_lossy().to_string(),
        nutexb_name,
    })
}

pub fn card_icon_replace_from_png(
    nutexb_path: &str,
    convert_dir: &str,
    png_path: &str,
) -> Result<SeriesImageReplaceSummary, String> {
    let out_nutexb_path = PathBuf::from(nutexb_path);
    let convert_dir = PathBuf::from(convert_dir);

    if let Some(parent) = out_nutexb_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&convert_dir).map_err(|e| e.to_string())?;

    let dyn_img = image::open(png_path).map_err(|e| e.to_string())?;
    let rgba: RgbaImage = dyn_img.to_rgba8();

    fn max_mipmap_count_for_size(width: u32, height: u32) -> u32 {
        let max_dim = width.max(height).max(1);
        32 - max_dim.leading_zeros()
    }

    let (nutexb_name, dds_format, mipmaps) = if out_nutexb_path.exists() {
        let existing = NutexbFile::read_from_file(&out_nutexb_path).map_err(|e| e.to_string())?;
        let name = existing.footer.string.to_string();
        let format = nutexb_format_to_dds_image_format(existing.footer.image_format);
        let max_mips = max_mipmap_count_for_size(rgba.width().max(1), rgba.height().max(1));
        let requested_mips = existing.footer.mipmap_count.min(max_mips);
        let mipmaps = if requested_mips <= 1 {
            Mipmaps::Disabled
        } else {
            Mipmaps::GeneratedExact(requested_mips)
        };
        (name, format, mipmaps)
    } else {
        let base_name = out_nutexb_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("texture");
        let name = sanitize_file_name(base_name);
        (
            name,
            DdsImageFormat::BC7RgbaUnorm,
            Mipmaps::GeneratedAutomatic,
        )
    };

    let dds =
        dds_from_image(&rgba, dds_format, Quality::Normal, mipmaps).map_err(|e| e.to_string())?;
    let nutexb = NutexbFile::from_dds(&dds, nutexb_name.clone()).map_err(|e| e.to_string())?;
    nutexb
        .write_to_file(&out_nutexb_path)
        .map_err(|e| e.to_string())?;

    let preview_name = sanitize_file_name(nutexb_name.as_str());
    let preview_png_path = convert_dir.join(format!("{preview_name}.png"));
    if let Some(parent) = preview_png_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    export_nutexb_to_png(
        out_nutexb_path.to_string_lossy().as_ref(),
        preview_png_path.to_string_lossy().as_ref(),
    )?;

    Ok(SeriesImageReplaceSummary {
        output_nutexb_path: out_nutexb_path.to_string_lossy().to_string(),
        preview_png_path: preview_png_path.to_string_lossy().to_string(),
        nutexb_name,
    })
}

/// Same as `card_icon_replace_from_png` but uses the provided DDS format instead of inferring from existing nutexb.
pub fn card_icon_replace_from_png_with_dds_format(
    nutexb_path: &str,
    convert_dir: &str,
    png_path: &str,
    dds_format_str: &str,
) -> Result<SeriesImageReplaceSummary, String> {
    let dds_format = DdsImageFormat::from_str(dds_format_str)
        .map_err(|_| format!("Invalid DDS format: {dds_format_str}"))?;

    let out_nutexb_path = PathBuf::from(nutexb_path);
    let convert_dir = PathBuf::from(convert_dir);

    if let Some(parent) = out_nutexb_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&convert_dir).map_err(|e| e.to_string())?;

    let dyn_img = image::open(png_path).map_err(|e| e.to_string())?;
    let rgba: RgbaImage = dyn_img.to_rgba8();

    fn max_mipmap_count_for_size(width: u32, height: u32) -> u32 {
        let max_dim = width.max(height).max(1);
        32 - max_dim.leading_zeros()
    }

    let (nutexb_name, mipmaps) = if out_nutexb_path.exists() {
        let existing = NutexbFile::read_from_file(&out_nutexb_path).map_err(|e| e.to_string())?;
        let name = existing.footer.string.to_string();
        let max_mips = max_mipmap_count_for_size(rgba.width().max(1), rgba.height().max(1));
        let requested_mips = existing.footer.mipmap_count.min(max_mips);
        let mipmaps = if requested_mips <= 1 {
            Mipmaps::Disabled
        } else {
            Mipmaps::GeneratedExact(requested_mips)
        };
        (name, mipmaps)
    } else {
        let base_name = out_nutexb_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("texture");
        let name = sanitize_file_name(base_name);
        (name, Mipmaps::GeneratedAutomatic)
    };

    let dds =
        dds_from_image(&rgba, dds_format, Quality::Normal, mipmaps).map_err(|e| e.to_string())?;
    let nutexb = NutexbFile::from_dds(&dds, nutexb_name.clone()).map_err(|e| e.to_string())?;
    nutexb
        .write_to_file(&out_nutexb_path)
        .map_err(|e| e.to_string())?;

    let preview_name = sanitize_file_name(nutexb_name.as_str());
    let preview_png_path = convert_dir.join(format!("{preview_name}.png"));
    if let Some(parent) = preview_png_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    export_nutexb_to_png(
        out_nutexb_path.to_string_lossy().as_ref(),
        preview_png_path.to_string_lossy().as_ref(),
    )?;

    Ok(SeriesImageReplaceSummary {
        output_nutexb_path: out_nutexb_path.to_string_lossy().to_string(),
        preview_png_path: preview_png_path.to_string_lossy().to_string(),
        nutexb_name,
    })
}

pub fn card_icon_detect_dds_format(nutexb_path: &str) -> Result<String, String> {
    let path = PathBuf::from(nutexb_path);
    if !path.exists() {
        return Err(format!("Target nutexb does not exist: {}", path.display()));
    }
    let existing = NutexbFile::read_from_file(&path).map_err(|e| e.to_string())?;
    let dds_format = nutexb_format_to_dds_image_format(existing.footer.image_format);
    Ok(format!("{dds_format:?}"))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardIconBatchReplaceSummary {
    pub converted: u32,
    pub failed: u32,
}

/// Where batch DDS replace reads RGBA pixels from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CardIconBatchReplaceSource {
    /// Decode the on-disk `.nutexb` file.
    Nutexb,
    /// Use `{convert_dir}/{sanitized_nutexb_footer_name}.png` from `__convert`.
    ConvertPng,
}

impl FromStr for CardIconBatchReplaceSource {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim() {
            "nutexb" => Ok(Self::Nutexb),
            "convertPng" => Ok(Self::ConvertPng),
            other => Err(format!(
                "Invalid replace source \"{other}\" (use \"nutexb\" or \"convertPng\")"
            )),
        }
    }
}

pub fn card_icon_batch_replace_with_dds_format(
    items: Vec<(String, String)>, // (nutexb_path, convert_dir)
    dds_format_str: &str,
    source: CardIconBatchReplaceSource,
) -> Result<CardIconBatchReplaceSummary, String> {
    let dds_format = DdsImageFormat::from_str(dds_format_str)
        .map_err(|_| format!("Invalid DDS format: {dds_format_str}"))?;

    let mut converted = 0u32;
    let mut failed = 0u32;

    match source {
        CardIconBatchReplaceSource::Nutexb => {
            for (nutexb_path, convert_dir) in items {
                let nutexb_path = PathBuf::from(&nutexb_path);
                let convert_dir = PathBuf::from(&convert_dir);
                if !nutexb_path.exists() {
                    failed += 1;
                    continue;
                }

                let nutexb = match NutexbFile::read_from_file(&nutexb_path) {
                    Ok(n) => n,
                    Err(_) => {
                        failed += 1;
                        continue;
                    }
                };
                let nutexb_name = nutexb.footer.string.to_string();
                let dds = match nutexb.to_dds() {
                    Ok(d) => d,
                    Err(_) => {
                        failed += 1;
                        continue;
                    }
                };
                let rgba: RgbaImage = match image_dds::image_from_dds(&dds, 0) {
                    Ok(img) => img,
                    Err(_) => {
                        failed += 1;
                        continue;
                    }
                };

                fn max_mipmap_count_for_size(width: u32, height: u32) -> u32 {
                    let max_dim = width.max(height).max(1);
                    32 - max_dim.leading_zeros()
                }

                let mipmaps = if nutexb.footer.mipmap_count <= 1 {
                    Mipmaps::Disabled
                } else {
                    let max_mips = max_mipmap_count_for_size(rgba.width().max(1), rgba.height().max(1));
                    let requested = nutexb.footer.mipmap_count.min(max_mips);
                    Mipmaps::GeneratedExact(requested)
                };

                let out_dds = match dds_from_image(&rgba, dds_format, Quality::Normal, mipmaps) {
                    Ok(d) => d,
                    Err(_) => {
                        failed += 1;
                        continue;
                    }
                };
                let out_nutexb = match NutexbFile::from_dds(&out_dds, nutexb_name.clone()) {
                    Ok(n) => n,
                    Err(_) => {
                        failed += 1;
                        continue;
                    }
                };

                if out_nutexb.write_to_file(&nutexb_path).is_err() {
                    failed += 1;
                    continue;
                }

                let preview_name = sanitize_file_name(nutexb_name.as_str());
                let preview_png_path = convert_dir.join(format!("{preview_name}.png"));
                if let Some(parent) = preview_png_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = export_nutexb_to_png(
                    nutexb_path.to_string_lossy().as_ref(),
                    preview_png_path.to_string_lossy().as_ref(),
                );

                converted += 1;
            }
        }
        CardIconBatchReplaceSource::ConvertPng => {
            for (nutexb_path, convert_dir) in items {
                let nutexb_path = PathBuf::from(&nutexb_path);
                let convert_dir = PathBuf::from(&convert_dir);
                if !nutexb_path.exists() {
                    failed += 1;
                    continue;
                }

                let nutexb = match NutexbFile::read_from_file(&nutexb_path) {
                    Ok(n) => n,
                    Err(_) => {
                        failed += 1;
                        continue;
                    }
                };
                let nutexb_name = nutexb.footer.string.to_string();
                let preview_name = sanitize_file_name(nutexb_name.as_str());
                let png_path = convert_dir.join(format!("{preview_name}.png"));
                if !png_path.exists() {
                    failed += 1;
                    continue;
                }

                match card_icon_replace_from_png_with_dds_format(
                    nutexb_path.to_string_lossy().as_ref(),
                    convert_dir.to_string_lossy().as_ref(),
                    png_path.to_string_lossy().as_ref(),
                    dds_format_str,
                ) {
                    Ok(_) => converted += 1,
                    Err(_) => failed += 1,
                }
            }
        }
    }

    Ok(CardIconBatchReplaceSummary { converted, failed })
}
