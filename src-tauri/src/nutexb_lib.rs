use serde::Serialize;
use std::{
    fs::File,
    fs,
    io::{BufWriter, Write},
    path::Path,
    path::{PathBuf},
};
use std::collections::HashSet;

use image_dds::image::RgbaImage;
use nutexb::NutexbFile;

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
    image.save(output_path).map_err(|e| e.to_string())?;
    Ok(())
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

        // Resolve output name collisions inside the same directory:
        // - If the file already exists in the output folder, or
        // - If another file in this batch already used the same output name,
        // then rename to `{fileName}_{i}.png` (i starts from 1).
        let out_path = resolve_unique_output_path(&out_path, &mut used_output_paths)?;

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

        match export_nutexb_to_png(file_path.to_string_lossy().as_ref(), out_path.to_string_lossy().as_ref()) {
            Ok(_) => converted += 1,
            Err(_) => failed += 1,
        }
    }

    Ok(BatchExportSummary { converted, skipped, failed })
}

fn resolve_unique_output_path(base: &Path, used: &mut HashSet<PathBuf>) -> Result<PathBuf, String> {
    let parent = base.parent().ok_or_else(|| "Invalid output path".to_string())?;
    let stem = base
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid output file name".to_string())?
        .to_string();

    let ext = base.extension().and_then(|e| e.to_str()).unwrap_or("png");

    let mut candidate = base.to_path_buf();
    if !candidate.exists() && !used.contains(&candidate) {
        used.insert(candidate.clone());
        return Ok(candidate);
    }

    for i in 1..=10000u32 {
        candidate = parent.join(format!("{stem}_{i}.{ext}"));
        if candidate.exists() || used.contains(&candidate) {
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
    let parent = nutexb_path.parent().ok_or_else(|| "Invalid nutexb path".to_string())?;
    let rel_dir = parent.strip_prefix(root).unwrap_or(parent);
    let convert_dir = root.join("__convert").join(rel_dir);

    let nutexb = NutexbFile::read_from_file(nutexb_path).map_err(|e| e.to_string())?;
    let name = sanitize_file_name(nutexb.footer.string.to_string().as_str());
    Ok(convert_dir.join(format!("{name}.png")))
}

fn make_per_file_convert_output_path(nutexb_path: &Path) -> Result<PathBuf, String> {
    let parent = nutexb_path.parent().ok_or_else(|| "Invalid nutexb path".to_string())?;
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
