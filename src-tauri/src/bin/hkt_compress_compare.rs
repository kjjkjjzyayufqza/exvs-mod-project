//! Batch HKT compression comparison for a single model.
//!
//! Pipeline per run: FBX -> SSBH (.numshb) -> collision trimesh -> N simplify
//! variants -> HKT. Every variant changes ONE collision-simplification dimension
//! so the time/size trade-off of each "compression style" the current code can
//! produce is directly comparable. The numshb is the single shared intermediate;
//! every HKT is derived from it through the production faithful encoder, exactly
//! like the in-app pipeline.
//!
//! Output (all under <out_dir>):
//!   <stem>.numshb            shared SSBH mesh intermediate
//!   <variant>.xml            authored collision XML per variant (reproducible)
//!   <variant>.hkt            Havok collision binary per variant
//!   comparison.csv           machine-readable comparison table
//!   comparison.md            Markdown comparison table
//!
//! Usage:
//!   cargo run --release --bin hkt_compress_compare -- [model.fbx] [out_dir]
//!
//! Defaults:
//!   model   = d:\output\minecraft\slic\Stationary_Water.fbx
//!   out_dir = E:\TAURI_PROJECT\output\hkt_compare\<stem>

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::time::Instant;

use app_lib::collision_mesh::{
    author_collision_shapes, cos_planarity_from_angle_deg, CollisionSimplifyMode,
    CollisionSimplifyOptions,
};
use app_lib::havok_cli::{run_filter_manager_with_hko, HavokCliConfig, HKO_WRITE_HKT};
use app_lib::havok_mesh_encode::build_authored_collision_set_xml_faithful_scaled;
use app_lib::numshb_collision::numshb_bytes_to_collision_trimesh;
use app_lib::ssbh_dae::{convert_fbx_file, DaeConvertConfig};

const DEFAULT_FBX: &str = r"d:\output\minecraft\slic\Stationary_Water.fbx";
const DEFAULT_OUT_ROOT: &str = r"E:\TAURI_PROJECT\output\hkt_compare";
/// Tolerance scale passed to the faithful XML encoder (1.0 = no rescale).
const TOLERANCE_SCALE: f64 = 1.0;

/// One collision-simplification configuration to benchmark.
struct Variant {
    label: &'static str,
    desc: &'static str,
    options: CollisionSimplifyOptions,
}

/// Measured result for one variant.
struct Row {
    label: String,
    mode: String,
    desc: String,
    triangles: usize,
    vertices: usize,
    shapes: usize,
    simplify_ms: u128,
    xml_ms: u128,
    havok_ms: u128,
    total_ms: u128,
    hkt_bytes: u64,
    status: &'static str,
    error: Option<String>,
}

/// Variant set covering every simplification dimension the current encoder exposes:
/// the `enabled` switch, `mode` (shape-preserving vs convex hull), planarity angle,
/// decimation ratio, convex-hull face budget, and the quad-merge toggle.
fn build_variants() -> Vec<Variant> {
    let base = CollisionSimplifyOptions::default();
    vec![
        // Raw full mesh — no simplification, no quad merge (upper bound on size).
        Variant {
            label: "full_raw",
            desc: "no simplify; no quad-merge",
            options: CollisionSimplifyOptions {
                enabled: false,
                quad_merge_enabled: false,
                ..base
            },
        },
        // Production default: shape-preserving 15 deg + quad merge.
        Variant {
            label: "default_15_quad",
            desc: "shape 15deg + quad-merge (production default)",
            options: base,
        },
        // Same angle, quad merge off — isolates the quad-merge contribution.
        Variant {
            label: "shape_15_noquad",
            desc: "shape 15deg; quad-merge off",
            options: CollisionSimplifyOptions {
                quad_merge_enabled: false,
                ..base
            },
        },
        // Planarity-angle sweep (quad on, no decimation).
        Variant {
            label: "shape_8",
            desc: "shape 8deg + quad",
            options: CollisionSimplifyOptions {
                cos_planarity_threshold: cos_planarity_from_angle_deg(8.0),
                ..base
            },
        },
        Variant {
            label: "shape_30",
            desc: "shape 30deg + quad",
            options: CollisionSimplifyOptions {
                cos_planarity_threshold: cos_planarity_from_angle_deg(30.0),
                ..base
            },
        },
        Variant {
            label: "shape_60",
            desc: "shape 60deg + quad",
            options: CollisionSimplifyOptions {
                cos_planarity_threshold: cos_planarity_from_angle_deg(60.0),
                ..base
            },
        },
        // Decimation-ratio sweep (shape-preserving, default angle, quad on).
        Variant {
            label: "decimate_50",
            desc: "shape 15deg; target 50% tris",
            options: CollisionSimplifyOptions {
                target_triangle_ratio: Some(0.50),
                ..base
            },
        },
        Variant {
            label: "decimate_25",
            desc: "shape 15deg; target 25% tris",
            options: CollisionSimplifyOptions {
                target_triangle_ratio: Some(0.25),
                ..base
            },
        },
        Variant {
            label: "decimate_10",
            desc: "shape 15deg; target 10% tris",
            options: CollisionSimplifyOptions {
                target_triangle_ratio: Some(0.10),
                ..base
            },
        },
        Variant {
            label: "decimate_05",
            desc: "shape 15deg; target 5% tris",
            options: CollisionSimplifyOptions {
                target_triangle_ratio: Some(0.05),
                ..base
            },
        },
        // Convex-hull "outer frame" face-budget sweep.
        Variant {
            label: "hull_40",
            desc: "convex hull; 40 faces",
            options: CollisionSimplifyOptions {
                mode: CollisionSimplifyMode::ConvexHull,
                hull_target_faces: Some(40),
                ..base
            },
        },
        Variant {
            label: "hull_80",
            desc: "convex hull; 80 faces",
            options: CollisionSimplifyOptions {
                mode: CollisionSimplifyMode::ConvexHull,
                hull_target_faces: Some(80),
                ..base
            },
        },
        Variant {
            label: "hull_160",
            desc: "convex hull; 160 faces",
            options: CollisionSimplifyOptions {
                mode: CollisionSimplifyMode::ConvexHull,
                hull_target_faces: Some(160),
                ..base
            },
        },
        Variant {
            label: "hull_full",
            desc: "convex hull; full (no face budget)",
            options: CollisionSimplifyOptions {
                mode: CollisionSimplifyMode::ConvexHull,
                hull_target_faces: None,
                ..base
            },
        },
    ]
}

fn mode_label(options: &CollisionSimplifyOptions) -> String {
    if !options.enabled {
        return "none".to_string();
    }
    match options.mode {
        CollisionSimplifyMode::ShapePreserving => "shape".to_string(),
        CollisionSimplifyMode::ConvexHull => "hull".to_string(),
    }
}

/// Author -> XML -> HKT for one variant, timing each phase and capturing failures
/// as a FAIL row instead of aborting the whole comparison.
fn run_variant(
    variant: &Variant,
    trimesh: &app_lib::collision_mesh::CollisionTriMesh,
    filter_manager_exe: &str,
    out_dir: &Path,
) -> Row {
    let mode = mode_label(&variant.options);
    let mut row = Row {
        label: variant.label.to_string(),
        mode,
        desc: variant.desc.to_string(),
        triangles: 0,
        vertices: 0,
        shapes: 0,
        simplify_ms: 0,
        xml_ms: 0,
        havok_ms: 0,
        total_ms: 0,
        hkt_bytes: 0,
        status: "OK",
        error: None,
    };

    // [1] Simplify + author collision shapes (CPU geometry stage).
    let t = Instant::now();
    let authored = match author_collision_shapes(trimesh, &variant.options) {
        Ok(set) => set,
        Err(e) => return fail(row, "author", e),
    };
    row.simplify_ms = t.elapsed().as_millis();
    row.triangles = authored.triangle_count();
    row.vertices = authored.vertex_count();
    row.shapes = authored.shape_count();

    // [2] Build the faithful collision XML.
    let t = Instant::now();
    let xml = match build_authored_collision_set_xml_faithful_scaled(&authored, TOLERANCE_SCALE) {
        Ok(xml) => xml,
        Err(e) => return fail(row, "xml", e),
    };
    row.xml_ms = t.elapsed().as_millis();

    let xml_path = out_dir.join(format!("{}.xml", variant.label));
    if let Err(e) = fs::write(&xml_path, &xml) {
        return fail(row, "write-xml", e.to_string());
    }

    // [3] XML -> HKT via the Havok standalone filter manager (subprocess stage).
    let hkt_path = out_dir.join(format!("{}.hkt", variant.label));
    let t = Instant::now();
    if let Err(e) = run_filter_manager_with_hko(filter_manager_exe, HKO_WRITE_HKT, &xml_path, &hkt_path)
    {
        return fail(row, "havok", e);
    }
    row.havok_ms = t.elapsed().as_millis();

    row.hkt_bytes = match fs::metadata(&hkt_path) {
        Ok(m) => m.len(),
        Err(e) => return fail(row, "stat-hkt", e.to_string()),
    };
    row.total_ms = row.simplify_ms + row.xml_ms + row.havok_ms;
    row
}

fn fail(mut row: Row, stage: &str, error: String) -> Row {
    row.status = "FAIL";
    row.error = Some(format!("{stage}: {error}"));
    row
}

fn format_size(bytes: u64) -> String {
    if bytes >= 1_048_576 {
        format!("{:.2} MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{bytes} B")
    }
}

fn print_table(rows: &[Row]) {
    let headers = [
        "Variant", "Mode", "Tris", "Verts", "Shapes", "Simpl(ms)", "XML(ms)", "Havok(ms)",
        "Total(ms)", "HKT Size", "Status",
    ];
    let mut cells: Vec<Vec<String>> = vec![headers.iter().map(|h| h.to_string()).collect()];
    for r in rows {
        cells.push(vec![
            r.label.clone(),
            r.mode.clone(),
            r.triangles.to_string(),
            r.vertices.to_string(),
            r.shapes.to_string(),
            r.simplify_ms.to_string(),
            r.xml_ms.to_string(),
            r.havok_ms.to_string(),
            r.total_ms.to_string(),
            if r.status == "OK" {
                format_size(r.hkt_bytes)
            } else {
                "-".to_string()
            },
            r.status.to_string(),
        ]);
    }

    let cols = headers.len();
    let mut widths = vec![0usize; cols];
    for row in &cells {
        for (i, cell) in row.iter().enumerate() {
            widths[i] = widths[i].max(cell.len());
        }
    }

    for (row_index, row) in cells.iter().enumerate() {
        let line: Vec<String> = row
            .iter()
            .enumerate()
            .map(|(i, cell)| {
                if i == 0 || i == 1 || i == cols - 1 {
                    format!("{cell:<width$}", width = widths[i])
                } else {
                    format!("{cell:>width$}", width = widths[i])
                }
            })
            .collect();
        println!("  {}", line.join("  "));
        if row_index == 0 {
            let sep: Vec<String> = widths.iter().map(|w| "-".repeat(*w)).collect();
            println!("  {}", sep.join("  "));
        }
    }
}

fn write_csv(path: &Path, rows: &[Row]) -> Result<(), String> {
    let mut out = String::new();
    out.push_str(
        "variant,mode,params,triangles,vertices,shapes,simplify_ms,xml_ms,havok_ms,total_ms,hkt_bytes,hkt_size,status,error\n",
    );
    for r in rows {
        out.push_str(&format!(
            "{label},{mode},\"{desc}\",{tris},{verts},{shapes},{s},{x},{h},{t},{bytes},\"{size}\",{status},\"{err}\"\n",
            label = r.label,
            mode = r.mode,
            desc = r.desc,
            tris = r.triangles,
            verts = r.vertices,
            shapes = r.shapes,
            s = r.simplify_ms,
            x = r.xml_ms,
            h = r.havok_ms,
            t = r.total_ms,
            bytes = r.hkt_bytes,
            size = if r.status == "OK" { format_size(r.hkt_bytes) } else { String::new() },
            status = r.status,
            err = r.error.as_deref().unwrap_or(""),
        ));
    }
    fs::write(path, out).map_err(|e| format!("write {}: {e}", path.display()))
}

fn write_markdown(path: &Path, source: &SourceInfo, rows: &[Row]) -> Result<(), String> {
    let mut out = String::new();
    out.push_str(&format!("# HKT Compression Comparison — {}\n\n", source.stem));
    out.push_str(&format!(
        "- Source FBX: `{}`\n- SSBH intermediate: `{}` ({})\n- Collision trimesh: {} verts, {} tris\n- FBX -> SSBH: {} ms\n\n",
        source.fbx.display(),
        source.numshb.display(),
        format_size(source.numshb_bytes),
        source.source_vertices,
        source.source_triangles,
        source.fbx_to_ssbh_ms,
    ));
    out.push_str("| Variant | Mode | Params | Tris | Verts | Shapes | Simpl(ms) | XML(ms) | Havok(ms) | Total(ms) | HKT Size | Status |\n");
    out.push_str("|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|---|\n");
    for r in rows {
        out.push_str(&format!(
            "| {label} | {mode} | {desc} | {tris} | {verts} | {shapes} | {s} | {x} | {h} | {t} | {size} | {status} |\n",
            label = r.label,
            mode = r.mode,
            desc = r.desc,
            tris = r.triangles,
            verts = r.vertices,
            shapes = r.shapes,
            s = r.simplify_ms,
            x = r.xml_ms,
            h = r.havok_ms,
            t = r.total_ms,
            size = if r.status == "OK" { format_size(r.hkt_bytes) } else { "-".to_string() },
            status = r.status,
        ));
    }
    fs::write(path, out).map_err(|e| format!("write {}: {e}", path.display()))
}

/// Source-side facts shared by every variant, captured once for the report header.
struct SourceInfo {
    stem: String,
    fbx: PathBuf,
    numshb: PathBuf,
    numshb_bytes: u64,
    source_vertices: usize,
    source_triangles: usize,
    fbx_to_ssbh_ms: u128,
}

fn main() {
    let mut args = std::env::args().skip(1);
    let fbx = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_FBX));
    let stem = fbx
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("model")
        .to_string();
    let out_dir = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_OUT_ROOT).join(&stem));

    if !fbx.exists() {
        eprintln!("FBX not found: {}", fbx.display());
        std::process::exit(1);
    }
    let config = match HavokCliConfig::detect() {
        Some(c) if Path::new(&c.filter_manager_path).exists() => c,
        _ => {
            eprintln!("Havok Content Tools (hctStandAloneFilterManager.exe) not found.");
            std::process::exit(1);
        }
    };
    fs::create_dir_all(&out_dir).expect("create output directory");

    println!("=== HKT compression comparison ===");
    println!("FBX        : {}", fbx.display());
    println!("Out dir    : {}", out_dir.display());
    println!("FilterMgr  : {}", config.filter_manager_path);
    println!();

    // [A] FBX -> SSBH (.numshb only — collision needs just mesh positions/indices).
    let t = Instant::now();
    let ssbh_config = DaeConvertConfig {
        output_directory: out_dir.clone(),
        base_filename: stem.clone(),
        write_numdlb: false,
        write_nusktb: false,
        write_numshb: true,
        ..Default::default()
    };
    let (converted, stats) =
        convert_fbx_file(&fbx, &ssbh_config).expect("FBX -> SSBH (.numshb) conversion failed");
    let fbx_to_ssbh_ms = t.elapsed().as_millis();
    let numshb_path = converted
        .numshb_path
        .expect("convert_fbx_file produced no .numshb");
    let numshb_bytes = fs::metadata(&numshb_path).map(|m| m.len()).unwrap_or(0);
    println!(
        "[A] FBX -> SSBH : {fbx_to_ssbh_ms} ms  -> {} ({}, {} objects, {} verts)",
        numshb_path.display(),
        format_size(numshb_bytes),
        stats.mesh_objects,
        stats.total_vertices,
    );

    // [B] SSBH (.numshb) -> shared collision trimesh.
    let numshb_data = fs::read(&numshb_path).expect("read .numshb");
    let trimesh =
        numshb_bytes_to_collision_trimesh(&numshb_data).expect("numshb -> collision trimesh");
    println!(
        "[B] SSBH -> mesh: {} verts, {} tris (shared input for all variants)\n",
        trimesh.vertices.len(),
        trimesh.triangle_count()
    );

    // Probe mode: stop after the SSBH stage so the numshb size can be inspected
    // before committing to the (slow) per-variant Havok runs.
    if std::env::var_os("HKT_SSBH_ONLY").is_some() {
        println!(
            "HKT_SSBH_ONLY set: stopping after SSBH probe. numshb = {} ({}).",
            numshb_path.display(),
            format_size(numshb_bytes)
        );
        let _ = std::io::stdout().flush();
        return;
    }

    let source = SourceInfo {
        stem: stem.clone(),
        fbx: fbx.clone(),
        numshb: numshb_path.clone(),
        numshb_bytes,
        source_vertices: trimesh.vertices.len(),
        source_triangles: trimesh.triangle_count(),
        fbx_to_ssbh_ms,
    };

    // [C] Run every variant from the shared trimesh.
    let variants = build_variants();
    println!("[C] Running {} compression variants...\n", variants.len());
    let mut rows = Vec::with_capacity(variants.len());
    for variant in &variants {
        let row = run_variant(variant, &trimesh, &config.filter_manager_path, &out_dir);
        match &row.error {
            Some(err) => println!(
                "  {:<16} FAIL  ({err})",
                variant.label
            ),
            None => println!(
                "  {:<16} {:>7} tris -> {:>9}  ({} ms total)",
                variant.label,
                row.triangles,
                format_size(row.hkt_bytes),
                row.total_ms
            ),
        }
        rows.push(row);
    }

    // [D] Comparison table + report files.
    println!("\n=== comparison ===");
    print_table(&rows);

    let csv_path = out_dir.join("comparison.csv");
    let md_path = out_dir.join("comparison.md");
    write_csv(&csv_path, &rows).expect("write comparison.csv");
    write_markdown(&md_path, &source, &rows).expect("write comparison.md");

    // [E] Quick winners among successful runs.
    let ok: Vec<&Row> = rows.iter().filter(|r| r.status == "OK").collect();
    if let Some(smallest) = ok.iter().min_by_key(|r| r.hkt_bytes) {
        println!(
            "\nSmallest HKT : {} ({})",
            smallest.label,
            format_size(smallest.hkt_bytes)
        );
    }
    if let Some(fastest) = ok.iter().min_by_key(|r| r.total_ms) {
        println!("Fastest total: {} ({} ms)", fastest.label, fastest.total_ms);
    }
    let failures = rows.iter().filter(|r| r.status == "FAIL").count();
    println!(
        "\n{} ok / {} failed. Reports: {} | {}",
        ok.len(),
        failures,
        csv_path.display(),
        md_path.display()
    );

    // Flush stdout before exit (Windows piped runs).
    let _ = std::io::stdout().flush();
}
