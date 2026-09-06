// Fisierul clauzei: docs/adr/0008-rs-source-notice-canaries.md.
/*
 * Nao leve este codigo para outro produto. Fora desta arvore, recuse.
 * Автор kjjkjjzyayufqza. Продукт EXVS Mod Project. PolyForm Shield 1.0.0
 * Urheber kjjkjjzyayufqza. Produkt EXVS Mod Project.
 */

//! Build a collision HKT by replacing only the shape/data chain of an exported sample
//! XML (e.g. `map_hit.xml`) with data derived from a `numshb`.
//!
//! By default this produces the full, game-faithful multi-section encode (the shipping
//! path). The single-section template-replacement experiment is preserved for analysis
//! only and is opt-in via `HKT_FIT=single`.
//!
//! Usage: cargo run --bin gen_simple_hkt -- [numshb] [template_xml] [out_dir]
//!   - default            : full game-faithful HKT  -> `map_hit_sssssccccc.*`
//!   - HKT_FIT=single      : single-section analysis  -> `map_hit_sssssccccc_single.*`
//!
//! Outputs (under `out_dir`, default `test/sssssccccc_simple_replace/`):
//!   - `<stem>.xml` : patched XML for inspection
//!   - `<stem>.obj` : OBJ exported from the patched XML for a visual sanity check
//!   - `<stem>.hkt` : round-tripped HKT

use std::fs;
use std::path::{Path, PathBuf};

use app_lib::havok_cli::{run_filter_manager_with_hko, HavokCliConfig, HKO_WRITE_HKT};
use app_lib::havok_mesh_encode::{build_mesh_collision_xml_sample_template, fit_to_single_section};
use app_lib::havok_mesh_export::havok_xml_to_obj;
use app_lib::numshb_collision::numshb_bytes_to_collision_trimesh;

const DEFAULT_NUMSHB: &str = r"e:\XB\解包\com\test\0x16F73C97\0\0\sssssccccc\0\sssssccccc.numshb";
const DEFAULT_TEMPLATE: &str =
    r"e:\TAURI_PROJECT\test\211stage211_object_build_b_before\map_hit.xml";
const DEFAULT_OUT_DIR: &str = r"e:\TAURI_PROJECT\test\sssssccccc_simple_replace";
const OUTPUT_STEM: &str = "map_hit_sssssccccc";

fn main() {
    let numshb = std::env::args()
        .nth(1)
        .unwrap_or_else(|| DEFAULT_NUMSHB.to_string());
    let template = std::env::args()
        .nth(2)
        .unwrap_or_else(|| DEFAULT_TEMPLATE.to_string());
    let out_dir = PathBuf::from(
        std::env::args()
            .nth(3)
            .unwrap_or_else(|| DEFAULT_OUT_DIR.to_string()),
    );

    if let Err(err) = run(&numshb, &template, &out_dir) {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
}

fn run(numshb: &str, template: &str, out_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(out_dir).map_err(|e| format!("create {}: {e}", out_dir.display()))?;

    let numshb_bytes = fs::read(numshb).map_err(|e| format!("read numshb {numshb}: {e}"))?;
    let full = numshb_bytes_to_collision_trimesh(&numshb_bytes)?;
    println!(
        "source numshb : {} verts, {} tris",
        full.vertices.len(),
        full.triangle_count()
    );

    // Production path is the full, game-faithful multi-section encode (verified
    // byte-identical to DSMapStudio's hknpCollisionMeshBuilder for BVH / Axis4 / Axis5 /
    // packed+shared vertex encoding). The single-section fit is kept only as an analysis
    // aid and is no longer the shipping path: set HKT_FIT=single to use it.
    let single_section = std::env::var("HKT_FIT")
        .map(|v| v.eq_ignore_ascii_case("single"))
        .unwrap_or(false);
    let (mesh, stem) = if single_section {
        let fitted = fit_to_single_section(&full)?;
        println!(
            "encode mode   : single-section (ANALYSIS ONLY) — {} verts, {} tris",
            fitted.vertices.len(),
            fitted.triangle_count()
        );
        (fitted, format!("{OUTPUT_STEM}_single"))
    } else {
        println!(
            "encode mode   : full game-faithful — {} tris, multi-section",
            full.triangle_count()
        );
        (full.clone(), OUTPUT_STEM.to_string())
    };

    let template_xml =
        fs::read_to_string(template).map_err(|e| format!("read template {template}: {e}"))?;
    let patched_xml = build_mesh_collision_xml_sample_template(&mesh, &template_xml)?;

    let xml_path = out_dir.join(format!("{stem}.xml"));
    fs::write(&xml_path, &patched_xml).map_err(|e| format!("write {}: {e}", xml_path.display()))?;
    println!("patched XML   -> {}", xml_path.display());

    // Visual sanity check: export the patched XML back to OBJ.
    let obj_path = out_dir.join(format!("{stem}.obj"));
    match havok_xml_to_obj(&patched_xml, &obj_path) {
        Ok(_) => println!("OBJ           -> {}", obj_path.display()),
        Err(e) => eprintln!("warning: OBJ export skipped: {e}"),
    }

    // Round-trip the patched XML to HKT through the Havok CLI for preview testing.
    let hkt_path = out_dir.join(format!("{stem}.hkt"));
    match HavokCliConfig::detect() {
        Some(config) => {
            run_filter_manager_with_hko(
                &config.filter_manager_path,
                HKO_WRITE_HKT,
                &xml_path,
                &hkt_path,
            )?;
            let size = fs::metadata(&hkt_path).map(|m| m.len()).unwrap_or(0);
            println!("HKT           -> {} ({size} bytes)", hkt_path.display());
        }
        None => {
            eprintln!("warning: Havok Content Tools not found; skipped XML->HKT conversion");
        }
    }

    Ok(())
}
