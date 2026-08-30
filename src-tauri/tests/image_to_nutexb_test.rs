use app_lib::nutexb_lib::{image_to_nutexb, list_nutexb_folder, read_nutexb_info};
use std::fs;
use std::path::Path;
use tempfile::tempdir;

fn write_solid_png(path: &Path, width: u32, height: u32) {
    let img = image::RgbaImage::from_pixel(width, height, image::Rgba([32, 64, 128, 255]));
    img.save(path).expect("write test png");
}

#[test]
fn image_to_nutexb_writes_named_file_without_cli() {
    let tmp = tempdir().unwrap();
    let png_path = tmp.path().join("VS_P_L.PNG");
    let out_path = tmp.path().join("VS_P_L.nutexb");
    write_solid_png(&png_path, 16, 16);
    let result = image_to_nutexb(
        png_path.to_str().unwrap(),
        out_path.to_str().unwrap(),
        "VS_P_L",
        "BC7RgbaUnorm",
        false,
    )
    .expect("image_to_nutexb");
    assert!(Path::new(&result.output_nutexb_path).exists());
    assert_eq!(result.nutexb_name, "VS_P_L");
    let info = read_nutexb_info(&result.output_nutexb_path).expect("read info");
    assert_eq!(info.name, "VS_P_L");
    assert_eq!(info.width, 16);
    assert_eq!(info.height, 16);
}

#[test]
fn image_to_nutexb_pads_odd_bc_sizes() {
    let tmp = tempdir().unwrap();
    let png_path = tmp.path().join("odd.png");
    let out_path = tmp.path().join("odd.nutexb");
    write_solid_png(&png_path, 15, 17);
    let result = image_to_nutexb(
        png_path.to_str().unwrap(),
        out_path.to_str().unwrap(),
        "odd",
        "BC7RgbaUnorm",
        true,
    )
    .expect("padded bc7");
    let info = read_nutexb_info(&result.output_nutexb_path).expect("read info");
    assert_eq!(info.width, 16);
    assert_eq!(info.height, 20);
}

#[test]
fn list_nutexb_folder_walks_nested_and_skips_convert() {
    let tmp = tempdir().unwrap();
    fs::create_dir_all(tmp.path().join("gui/p_l")).unwrap();
    fs::create_dir_all(tmp.path().join("__convert")).unwrap();
    fs::create_dir_all(tmp.path().join(".hidden")).unwrap();
    fs::write(tmp.path().join("a.nutexb"), b"x").unwrap();
    fs::write(tmp.path().join("gui/p_l/vs.nutexb"), b"x").unwrap();
    fs::write(tmp.path().join("gui/p_l/skip.png"), b"x").unwrap();
    fs::write(tmp.path().join("__convert/hidden.nutexb"), b"x").unwrap();
    fs::write(tmp.path().join(".hidden/dot.nutexb"), b"x").unwrap();
    let scan = list_nutexb_folder(tmp.path().to_str().unwrap()).expect("scan");
    let rel: Vec<_> = scan
        .files
        .iter()
        .map(|file| file.relative_path.as_str())
        .collect();
    assert_eq!(rel, vec!["a.nutexb", "gui/p_l/vs.nutexb"]);
}
