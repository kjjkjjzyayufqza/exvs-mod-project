//! Generate a map_hit-style HKT from an FBX/DAE import file.
//!
//! Usage:
//!   cargo run --bin gen_hkt_from_import -- <input.fbx|input.dae> <output.hkt>

use std::path::PathBuf;
use std::time::Instant;

use app_lib::collision_mesh::{
    author_collision_shapes, bake_and_merge_collision_mesh, parse_import_scene_from_path,
    CollisionMeshOptions,
};
use app_lib::havok_cli::{run_filter_manager_with_hko, HavokCliConfig, HKO_WRITE_HKT};
use app_lib::havok_mesh_encode::build_authored_collision_set_xml_faithful_scaled;

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
    let scene = parse_import_scene_from_path(&input).expect("parse import scene");
    println!(
        "parse_ms={} meshes={} bones={}",
        t.elapsed().as_millis(),
        scene.meshes.len(),
        scene.bones.len()
    );

    let t = Instant::now();
    let merged = bake_and_merge_collision_mesh(&scene, &options).expect("bake and merge");
    println!(
        "merge_ms={} merged_vertices={} merged_tris={}",
        t.elapsed().as_millis(),
        merged.vertices.len(),
        merged.triangle_count()
    );

    let t = Instant::now();
    let authored = author_collision_shapes(&merged, &options.simplify).expect("author collision");
    println!(
        "author_ms={} shapes={} vertices={} primitives={} primitive_keys={} preview_tris={}",
        t.elapsed().as_millis(),
        authored.shape_count(),
        authored.vertex_count(),
        authored.primitive_count(),
        authored.primitive_key_count(),
        authored.triangle_count()
    );

    let t = Instant::now();
    let xml = build_authored_collision_set_xml_faithful_scaled(&authored, options.scale_factor)
        .expect("build HKT XML");
    let xml_path = output.with_extension("xml");
    std::fs::write(&xml_path, &xml).expect("write XML");
    println!(
        "xml_ms={} xml={} bytes={}",
        t.elapsed().as_millis(),
        xml_path.display(),
        xml.len()
    );

    let t = Instant::now();
    run_filter_manager_with_hko(
        &config.filter_manager_path,
        HKO_WRITE_HKT,
        &xml_path,
        &output,
    )
    .expect("Havok XML -> HKT conversion");
    let bytes = std::fs::metadata(&output).map(|m| m.len()).unwrap_or(0);
    println!(
        "hkt_ms={} written={} bytes={}",
        t.elapsed().as_millis(),
        output.display(),
        bytes
    );
}
