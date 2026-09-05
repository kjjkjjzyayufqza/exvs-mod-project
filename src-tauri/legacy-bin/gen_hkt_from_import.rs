//! Generate a map_hit-style HKT from an FBX/DAE import file.
//!
//! Usage:
//!   cargo run --bin gen_hkt_from_import -- <input.fbx|input.dae> <output.hkt>

use std::path::PathBuf;
use std::time::Instant;

use app_lib::collision_mesh::CollisionMeshOptions;
use app_lib::havok_cli::{convert_hkt_bytes_to_xml, generate_hkt_from_import_path, HavokCliConfig};

fn main() {
    let mut args = std::env::args().skip(1);
    let input = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"D:\output\minecraft\test3_plane_clear2.fbx"));
    let output = args.next().map(PathBuf::from).unwrap_or_else(|| {
        input.with_file_name(format!(
            "{}_authored_collision.hkt",
            input
                .file_stem()
                .and_then(|name| name.to_str())
                .unwrap_or("collision")
        ))
    });

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).expect("create output directory");
    }

    let config = HavokCliConfig::detect().expect("Havok Content Tools not found");
    let mut options = CollisionMeshOptions::default();
    if let Some(scale) = std::env::var("HKT_SCALE_FACTOR")
        .ok()
        .and_then(|value| value.parse::<f64>().ok())
    {
        options.scale_factor = scale;
    }
    options.simplify.max_target_triangles = std::env::var("HKT_MAX_TARGET_TRIANGLES")
        .ok()
        .and_then(|value| value.parse::<usize>().ok());
    if let Ok(value) = std::env::var("HKT_QUAD_MERGE") {
        options.simplify.quad_merge_enabled = !matches!(
            value.to_ascii_lowercase().as_str(),
            "0" | "false" | "off" | "no"
        );
    }

    let t = Instant::now();
    let generated =
        generate_hkt_from_import_path(&input, &config, options).expect("generate HKT from model");
    std::fs::write(&output, &generated.bytes).expect("write HKT");
    println!(
        "hkt_ms={} written={} bytes={} triangles={}",
        t.elapsed().as_millis(),
        output.display(),
        generated.bytes.len(),
        generated.triangle_count
    );

    let t = Instant::now();
    let xml = convert_hkt_bytes_to_xml(&config.filter_manager_path, &generated.bytes)
        .expect("decode generated HKT XML");
    let xml_path = output.with_extension("xml");
    std::fs::write(&xml_path, &xml).expect("write XML");
    println!(
        "xml_ms={} xml={} bytes={}",
        t.elapsed().as_millis(),
        xml_path.display(),
        xml.len()
    );
}
