//! Standalone performance probe for the HKT collision preview pipeline.
//!
//! Measures each phase (read -> parse -> skin-bake/merge -> simplify) on a real
//! DAE/FBX so the "Preview HKT hangs" bottleneck can be attributed without the UI
//! or Havok Content Tools. Uses ONLY src-tauri (`app_lib`) code, mirroring what
//! `scene_preview_hkt_collision_mesh_path` runs.
//!
//! Usage:
//!   cargo run --release --bin perf_preview_hkt -- <model.fbx> [hull_faces]
//!
//! Defaults: path = d:\output\minecraft\test3_plane.fbx, hull_faces = 80
//! ("balanced" budget — the "外框 + 平均" strategy = ConvexHull + balanced).

use std::path::Path;
use std::time::Instant;

use app_lib::collision_mesh::{
    bake_and_merge_collision_mesh, parse_import_scene_from_bytes, parse_import_scene_from_path,
    simplify_collision_mesh, CollisionMeshOptions, CollisionSimplifyMode, CollisionSimplifyOptions,
};

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args
        .next()
        .unwrap_or_else(|| r"d:\output\minecraft\test3_plane.fbx".to_string());
    let hull_faces: usize = args.next().and_then(|s| s.parse().ok()).unwrap_or(80);

    let source_name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("input.fbx")
        .to_string();

    println!("=== HKT preview perf probe ===");
    println!("file        : {path}");
    println!("source_name : {source_name}");
    println!("strategy    : ConvexHull (外框) + hull_target_faces={hull_faces} (平均)");
    println!();

    // [1] Read bytes — the command does std::fs::read first.
    let t = Instant::now();
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("FAILED to read {path}: {e}");
            std::process::exit(1);
        }
    };
    let read_ms = t.elapsed().as_millis();
    println!(
        "[1] read file       : {read_ms:>8} ms  ({} bytes, {:.1} MB)",
        bytes.len(),
        bytes.len() as f64 / 1_048_576.0
    );

    // [2] Pure parser time (path-based, no temp-file write).
    let t = Instant::now();
    let scene_from_path = match parse_import_scene_from_path(Path::new(&path)) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("FAILED parse_import_scene_from_path: {e}");
            std::process::exit(1);
        }
    };
    let parse_path_ms = t.elapsed().as_millis();
    println!("[2] parse (path)    : {parse_path_ms:>8} ms  (pure FBX/DAE parse)");
    drop(scene_from_path);

    // [2b] App path: from_bytes writes the buffer to a temp file, then parses it.
    // The delta vs [2] is pure temp-file write+reread overhead the command pays.
    let t = Instant::now();
    let scene = match parse_import_scene_from_bytes(&source_name, &bytes) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("FAILED parse_import_scene_from_bytes: {e}");
            std::process::exit(1);
        }
    };
    let parse_bytes_ms = t.elapsed().as_millis();
    println!(
        "[2b] parse (bytes)  : {parse_bytes_ms:>8} ms  (app path = temp-write + parse; temp overhead ~{} ms)",
        parse_bytes_ms.saturating_sub(parse_path_ms)
    );

    // Options: ConvexHull + balanced budget; axis/scale = defaults (YUp, 1.0).
    let options = CollisionMeshOptions {
        simplify: CollisionSimplifyOptions {
            mode: CollisionSimplifyMode::ConvexHull,
            hull_target_faces: Some(hull_faces),
            ..CollisionSimplifyOptions::default()
        },
        ..CollisionMeshOptions::default()
    };

    // [3] Skin-bake + merge.
    let t = Instant::now();
    let merged = match bake_and_merge_collision_mesh(&scene, &options) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("FAILED bake_and_merge_collision_mesh: {e}");
            std::process::exit(1);
        }
    };
    let merge_ms = t.elapsed().as_millis();
    println!(
        "[3] bake + merge    : {merge_ms:>8} ms  (merged_tris={}, verts={})",
        merged.triangle_count(),
        merged.vertices.len()
    );

    // [4] ConvexHull simplify (外框 + 平均).
    let t = Instant::now();
    let hull = match simplify_collision_mesh(&merged, &options.simplify) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("FAILED convex-hull simplify: {e}");
            std::process::exit(1);
        }
    };
    let hull_ms = t.elapsed().as_millis();
    println!(
        "[4] convex hull     : {hull_ms:>8} ms  (hull_tris={}, verts={})",
        hull.triangle_count(),
        hull.vertices.len()
    );

    // [4b] Comparison: ShapePreserving (medium) on the same merged mesh.
    let t = Instant::now();
    let sp = simplify_collision_mesh(&merged, &CollisionSimplifyOptions::default());
    let sp_ms = t.elapsed().as_millis();
    match sp {
        Ok(m) => println!(
            "[4b] shape-preserve : {sp_ms:>8} ms  (tris={}, verts={}) [comparison]",
            m.triangle_count(),
            m.vertices.len()
        ),
        Err(e) => println!("[4b] shape-preserve : {sp_ms:>8} ms  [rejected: {e}] [comparison]"),
    }

    let total = read_ms + parse_bytes_ms + merge_ms + hull_ms;
    println!();
    println!("=== summary (外框 + 平均 path) ===");
    println!("read         : {read_ms:>8} ms");
    println!(
        "parse(bytes) : {parse_bytes_ms:>8} ms  (temp-write overhead ~{} ms)",
        parse_bytes_ms.saturating_sub(parse_path_ms)
    );
    println!("bake + merge : {merge_ms:>8} ms");
    println!("convex hull  : {hull_ms:>8} ms");
    println!("TOTAL        : {total:>8} ms");
}
