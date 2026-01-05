use serde::Serialize;
use std::{
    fs::File,
    io::{BufWriter, Write},
    path::Path,
};

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

