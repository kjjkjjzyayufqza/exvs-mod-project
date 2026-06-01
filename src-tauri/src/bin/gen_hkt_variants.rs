//! Generate HKT collision variants from a numshb for black-box testing in the
//! Havok preview tool. Each variant changes ONE factor so the hang cause can be
//! isolated (structure/template vs hand-encoded mesh-tree data vs triangle count).
//!
//! Usage: cargo run --bin gen_hkt_variants -- <numshb> [out_dir]

use std::fs;
use std::path::{Path, PathBuf};

use app_lib::collision_mesh::{
    cos_planarity_from_angle_deg, simplify_collision_mesh, CollisionSimplifyOptions,
    CollisionTriMesh,
};
use app_lib::havok_cli::{run_filter_manager_with_hko, HavokCliConfig, HKO_WRITE_HKT};
use app_lib::havok_mesh_encode::{
    build_mesh_collision_xml, build_mesh_collision_xml_with_template,
    build_mesh_collision_xml_with_template_mode, TemplateReplaceMode,
};
use app_lib::numshb_collision::numshb_bytes_to_collision_trimesh;

/// First `n` triangles of a mesh (vertices kept whole; sectioning only uses
/// referenced verts). Used to control how many Havok sections are produced.
fn take_first_tris(mesh: &CollisionTriMesh, n: usize) -> CollisionTriMesh {
    let end = (n * 3).min(mesh.indices.len());
    CollisionTriMesh {
        vertices: mesh.vertices.clone(),
        indices: mesh.indices[..end].to_vec(),
    }
}

/// Generate a flat grid mesh with exactly `cols * rows * 2` triangles.
/// Each quad cell = 2 tris. Useful for synthetic geometry tests.
fn flat_grid(cols: usize, rows: usize) -> CollisionTriMesh {
    let mut vertices = Vec::with_capacity((cols + 1) * (rows + 1));
    for r in 0..=rows {
        for c in 0..=cols {
            vertices.push([c as f64, 0.0, r as f64]);
        }
    }
    let mut indices = Vec::with_capacity(cols * rows * 6);
    let w = cols + 1;
    for r in 0..rows {
        for c in 0..cols {
            let tl = (r * w + c) as u32;
            let tr = tl + 1;
            let bl = tl + w as u32;
            let br = bl + 1;
            indices.extend_from_slice(&[tl, bl, tr, tr, bl, br]);
        }
    }
    CollisionTriMesh { vertices, indices }
}

/// Single huge triangle (tests AABB extremes with minimal structure).
fn huge_triangle() -> CollisionTriMesh {
    CollisionTriMesh {
        vertices: vec![
            [-100.0, -100.0, 0.0],
            [100.0, -100.0, 0.0],
            [0.0, 100.0, 0.0],
        ],
        indices: vec![0, 1, 2],
    }
}

/// Axis-aligned cube spanning [-1,1]^3 — 8 verts, 12 triangles.
fn unit_box() -> CollisionTriMesh {
    let vertices = vec![
        [-1.0, -1.0, -1.0],
        [1.0, -1.0, -1.0],
        [1.0, 1.0, -1.0],
        [-1.0, 1.0, -1.0],
        [-1.0, -1.0, 1.0],
        [1.0, -1.0, 1.0],
        [1.0, 1.0, 1.0],
        [-1.0, 1.0, 1.0],
    ];
    let indices = vec![
        0, 1, 2, 0, 2, 3, // -z
        4, 6, 5, 4, 7, 6, // +z
        0, 4, 5, 0, 5, 1, // -y
        3, 2, 6, 3, 6, 7, // +y
        0, 3, 7, 0, 7, 4, // -x
        1, 5, 6, 1, 6, 2, // +x
    ];
    CollisionTriMesh { vertices, indices }
}

fn xml_to_hkt(fm: &str, xml: &str, dest: &Path) -> Result<u64, String> {
    let tmp = std::env::temp_dir().join(format!("hktvar_in_{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let input = tmp.join("collision.xml");
    fs::write(&input, xml).map_err(|e| e.to_string())?;
    let res = run_filter_manager_with_hko(fm, HKO_WRITE_HKT, &input, dest);
    let _ = fs::remove_dir_all(&tmp);
    res?;
    fs::metadata(dest)
        .map(|m| m.len())
        .map_err(|e| e.to_string())
}

fn sdkv(dest: &Path) -> String {
    fs::read(dest)
        .ok()
        .filter(|b| b.len() >= 24)
        .map(|b| {
            String::from_utf8_lossy(&b[12..24])
                .trim_end_matches('@')
                .to_string()
        })
        .unwrap_or_else(|| "?".to_string())
}

fn gen(fm: &str, label: &str, mesh: &CollisionTriMesh, out_dir: &Path, name_fix: Option<&str>) {
    let template_xml = std::env::var("HKT_TEMPLATE_XML")
        .ok()
        .and_then(|path| fs::read_to_string(path).ok());
    let replace_mode = match std::env::var("HKT_TEMPLATE_REPLACE_MODE")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "last" => TemplateReplaceMode::Last,
        _ => TemplateReplaceMode::All,
    };
    let xml_result = match template_xml.as_deref() {
        Some(template) if matches!(replace_mode, TemplateReplaceMode::Last) => {
            build_mesh_collision_xml_with_template_mode(mesh, template, replace_mode)
        }
        Some(template) => build_mesh_collision_xml_with_template(mesh, template),
        None => build_mesh_collision_xml(mesh),
    }
    .map_err(|e| {
        if template_xml.is_some() {
            format!("template XML build failed: {e}")
        } else {
            e
        }
    });
    let mut xml = match xml_result {
        Ok(x) => x,
        Err(e) => {
            println!(
                "  {label:<16} ({} tris): XML build FAILED: {e}",
                mesh.triangle_count()
            );
            return;
        }
    };
    if let Some(n) = name_fix {
        xml = xml.replace("object_box01_col01", n);
    }
    let dest = out_dir.join(format!("{label}.hkt"));
    match xml_to_hkt(fm, &xml, &dest) {
        Ok(sz) => println!(
            "  {label:<16} {} tris -> {} bytes  [{}]",
            mesh.triangle_count(),
            sz,
            sdkv(&dest)
        ),
        Err(e) => println!(
            "  {label:<16} ({} tris): convert FAILED: {e}",
            mesh.triangle_count()
        ),
    }
}

fn main() {
    let numshb = std::env::args().nth(1).unwrap_or_else(|| {
        r"e:\XB\解包\com\test\0x16F73C97\0\0\sssssccccc\0\sssssccccc.numshb".to_string()
    });
    let out_dir = PathBuf::from(
        std::env::args()
            .nth(2)
            .unwrap_or_else(|| r"e:\XB\解包\com\test\_hkt_variants".to_string()),
    );
    fs::create_dir_all(&out_dir).expect("create out dir");

    let fm = HavokCliConfig::detect()
        .map(|c| c.filter_manager_path)
        .expect("Havok FilterManager not found");
    println!("FilterManager: {fm}");
    println!("Output dir   : {}", out_dir.display());

    let bytes = fs::read(&numshb).expect("read numshb");
    let full = numshb_bytes_to_collision_trimesh(&bytes).expect("numshb -> mesh");
    println!(
        "Source numshb: {} verts, {} tris\n",
        full.vertices.len(),
        full.triangle_count()
    );

    // V1: trivial cube through the same encoder/template — tests structure alone.
    gen(&fm, "V1_box", &unit_box(), &out_dir, None);

    // V2: aggressive simplify (large planarity angle + area/weld) — fewest tris.
    let low = simplify_collision_mesh(
        &full,
        &CollisionSimplifyOptions {
            enabled: true,
            cos_planarity_threshold: cos_planarity_from_angle_deg(60.0),
            min_triangle_area: 1e-3,
            weld_epsilon: 1e-2,
            target_triangle_ratio: Some(0.05),
            max_target_triangles: Some(50_000),
        },
    );
    gen(&fm, "V2_low", &low, &out_dir, None);

    // V3: default simplify (8 deg) — the normal pipeline setting.
    let mid = simplify_collision_mesh(&full, &CollisionSimplifyOptions::default());
    gen(&fm, "V3_mid", &mid, &out_dir, None);

    // V4: full mesh, no simplify — baseline that currently hangs.
    gen(&fm, "V4_full", &full, &out_dir, None);

    // V5: full mesh, body name fixed (no leftover "object_box01_col01").
    gen(
        &fm,
        "V5_full_namefix",
        &full,
        &out_dir,
        Some("sssssccccc_col01"),
    );

    // Section-boundary confirmation: real geometry, 1 section vs 2 sections.
    // A section splits at >255 verts OR >=255 tris, so ~100 tris => 1 section,
    // ~300 tris => 2 sections. If 1sec loads but 2sec hangs, the top-level
    // section tree (hardcoded single node) is confirmed as the hang cause.
    gen(
        &fm,
        "V6_real_1section",
        &take_first_tris(&full, 100),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V7_real_2sections",
        &take_first_tris(&full, 300),
        &out_dir,
        None,
    );

    // V8: exact section boundary — 255 tris = max capacity of 1 section.
    gen(
        &fm,
        "V8_exact_255tris",
        &take_first_tris(&full, 255),
        &out_dir,
        None,
    );

    // V9: just over boundary — 256 tris forces 2 sections.
    gen(
        &fm,
        "V9_256tris_2sec",
        &take_first_tris(&full, 256),
        &out_dir,
        None,
    );

    // V10: ~5 sections (1000 tris) — incremental section-count test.
    gen(
        &fm,
        "V10_1000tris_5sec",
        &take_first_tris(&full, 1000),
        &out_dir,
        None,
    );

    // V11: ~10 sections (2000 tris) — larger section count.
    gen(
        &fm,
        "V11_2000tris_10sec",
        &take_first_tris(&full, 2000),
        &out_dir,
        None,
    );

    // V12: synthetic flat grid (~500 tris, ~3 sections) — rules out numshb geometry quirks.
    let grid = flat_grid(16, 16); // 16x16 = 512 tris
    gen(&fm, "V12_synth_grid", &grid, &out_dir, None);

    // V13: single huge triangle — minimal structure, large AABB.
    gen(&fm, "V13_huge_tri", &huge_triangle(), &out_dir, None);

    // V14: multi-section + body name fix — combined test.
    gen(
        &fm,
        "V14_2000tris_namefix",
        &take_first_tris(&full, 2000),
        &out_dir,
        Some("sssssccccc_col01"),
    );

    // --- Bisect threshold between 256 (works) and 512 (hangs) ---
    gen(
        &fm,
        "V15_300tris",
        &take_first_tris(&full, 300),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V16_350tris",
        &take_first_tris(&full, 350),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V17_400tris",
        &take_first_tris(&full, 400),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V18_450tris",
        &take_first_tris(&full, 450),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V19_500tris",
        &take_first_tris(&full, 500),
        &out_dir,
        None,
    );

    // Synthetic grid variants to bisect separately (rules out numshb geometry)
    let grid_small = flat_grid(12, 12); // 288 tris
    gen(&fm, "V20_grid_288", &grid_small, &out_dir, None);
    let grid_med = flat_grid(14, 14); // 392 tris
    gen(&fm, "V21_grid_392", &grid_med, &out_dir, None);

    // --- Bisect between 350 (works) and 400 (hangs) ---
    gen(
        &fm,
        "V22_360tris",
        &take_first_tris(&full, 360),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V23_370tris",
        &take_first_tris(&full, 370),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V24_380tris",
        &take_first_tris(&full, 380),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V25_390tris",
        &take_first_tris(&full, 390),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V26_395tris",
        &take_first_tris(&full, 395),
        &out_dir,
        None,
    );

    // --- Bisect between 350 (works) and 360 (hangs) ---
    gen(
        &fm,
        "V27_351tris",
        &take_first_tris(&full, 351),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V28_352tris",
        &take_first_tris(&full, 352),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V29_353tris",
        &take_first_tris(&full, 353),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V30_354tris",
        &take_first_tris(&full, 354),
        &out_dir,
        None,
    );
    gen(
        &fm,
        "V31_355tris",
        &take_first_tris(&full, 355),
        &out_dir,
        None,
    );

    println!("\nDone. Test each .hkt in the Havok preview tool and note which load vs hang.");
}
