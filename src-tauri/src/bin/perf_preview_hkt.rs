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

use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Instant;

use app_lib::collision_mesh::{
    bake_and_merge_collision_mesh, cos_planarity_from_angle_deg, parse_import_scene_from_bytes,
    parse_import_scene_from_path, simplify_collision_mesh, CollisionMeshOptions,
    CollisionSimplifyMode, CollisionSimplifyOptions,
};

fn main() {
    let mut args = std::env::args().skip(1);
    let path = args
        .next()
        .unwrap_or_else(|| r"d:\output\minecraft\test3_plane.fbx".to_string());
    let hull_faces: usize = args.next().and_then(|s| s.parse().ok()).unwrap_or(80);
    let review_target_tris = std::env::var("HKT_REVIEW_TARGET_TRIS")
        .ok()
        .and_then(|s| s.parse::<usize>().ok());

    let source_name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("input.fbx")
        .to_string();

    println!("=== HKT preview perf probe ===");
    println!("file        : {path}");
    println!("source_name : {source_name}");
    println!("strategy    : ConvexHull (外框) + hull_target_faces={hull_faces} (平均)");
    if let Some(target) = review_target_tris {
        println!("review obj  : high-precision shape-preserving target={target} tris");
    }
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
    print_aabb("merged", &merged);

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
    print_aabb("convex hull", &hull);
    if std::env::var_os("HKT_PROBE_WRITE_OBJ").is_some() {
        let obj_path = probe_obj_path(Path::new(&path), hull_faces);
        match write_obj(&obj_path, &hull) {
            Ok(()) => println!("[4c] hull OBJ       : {}", obj_path.display()),
            Err(e) => println!("[4c] hull OBJ       : failed: {e}"),
        }
    }

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

    if let Some(target) = review_target_tris {
        let review_opts = CollisionSimplifyOptions {
            enabled: true,
            cos_planarity_threshold: cos_planarity_from_angle_deg(15.0),
            min_triangle_area: 1e-6,
            weld_epsilon: 0.001,
            target_triangle_ratio: None,
            max_target_triangles: Some(target),
            mode: CollisionSimplifyMode::ShapePreserving,
            hull_target_faces: None,
            quad_merge_enabled: false,
        };
        let t = Instant::now();
        match simplify_collision_mesh(&merged, &review_opts) {
            Ok(review_mesh) => {
                let review_ms = t.elapsed().as_millis();
                println!(
                    "[5] review mesh    : {review_ms:>8} ms  (tris={}, verts={})",
                    review_mesh.triangle_count(),
                    review_mesh.vertices.len()
                );
                print_aabb("review mesh", &review_mesh);
                let obj_path = review_obj_path(Path::new(&path), review_mesh.triangle_count());
                match write_obj(&obj_path, &review_mesh) {
                    Ok(()) => println!("[5b] review OBJ    : {}", obj_path.display()),
                    Err(e) => println!("[5b] review OBJ    : failed: {e}"),
                }
            }
            Err(e) => println!("[5] review mesh    : rejected: {e}"),
        }
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

fn print_aabb(label: &str, mesh: &app_lib::collision_mesh::CollisionTriMesh) {
    match mesh.compute_aabb() {
        Ok((min, max)) => {
            let span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
            println!(
                "    {label:<12} AABB min=[{:.4}, {:.4}, {:.4}] max=[{:.4}, {:.4}, {:.4}] span=[{:.4}, {:.4}, {:.4}]",
                min[0], min[1], min[2], max[0], max[1], max[2], span[0], span[1], span[2]
            );
        }
        Err(e) => println!("    {label:<12} AABB unavailable: {e}"),
    }
}

fn probe_obj_path(input: &Path, hull_faces: usize) -> PathBuf {
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("input");
    let file_name = format!("{stem}_convex_hull_{hull_faces}_probe.obj");
    input
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(file_name)
}

fn review_obj_path(input: &Path, triangle_count: usize) -> PathBuf {
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("input");
    let file_name = format!("{stem}_collision_high_precision_{triangle_count}_review.obj");
    input
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(file_name)
}

fn write_obj(path: &Path, mesh: &app_lib::collision_mesh::CollisionTriMesh) -> Result<(), String> {
    let mut f = std::fs::File::create(path)
        .map_err(|e| format!("Cannot create {}: {e}", path.display()))?;
    writeln!(
        f,
        "# perf_preview_hkt hull probe: {} vertices, {} triangles",
        mesh.vertices.len(),
        mesh.triangle_count()
    )
    .map_err(|e| format!("Write error: {e}"))?;

    for v in &mesh.vertices {
        writeln!(f, "v {:.8} {:.8} {:.8}", v[0], v[1], v[2])
            .map_err(|e| format!("Write error: {e}"))?;
    }

    for tri in mesh.indices.chunks(3) {
        if tri.len() == 3 {
            writeln!(f, "f {} {} {}", tri[0] + 1, tri[1] + 1, tri[2] + 1)
                .map_err(|e| format!("Write error: {e}"))?;
        }
    }

    Ok(())
}
