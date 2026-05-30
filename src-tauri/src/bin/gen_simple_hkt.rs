//! Build a single-section collision HKT by replacing only the shape/data chain of an
//! exported sample XML (e.g. `map_hit.xml`) with data derived from a `numshb`.
//!
//! This is the purpose-built entrypoint for the simple single-section template
//! replacement experiment (see `simple-hkt-template` plan): it forces a one-section /
//! no-shared-vertex mesh, patches only the shape/data fields of the sample shell, and
//! neutralizes the stale acceleration payload so the result is fully regenerated.
//!
//! Usage: cargo run --bin gen_simple_hkt -- [numshb] [template_xml] [out_dir]
//!
//! Outputs (under `out_dir`, default `test/sssssccccc_simple_replace/`):
//!   - `map_hit_sssssccccc.xml` : patched single-section XML for inspection
//!   - `map_hit_sssssccccc.obj` : OBJ exported from the patched XML for a visual sanity check
//!   - `map_hit_sssssccccc.hkt` : round-tripped HKT for Havok preview testing

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
    let numshb = std::env::args().nth(1).unwrap_or_else(|| DEFAULT_NUMSHB.to_string());
    let template = std::env::args().nth(2).unwrap_or_else(|| DEFAULT_TEMPLATE.to_string());
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

    // Default path is the single-section isolation experiment. Set HKT_FIT=full to keep
    // the whole mesh and let the encoder emit as many sections as it needs — used to test
    // whether the full mesh loads now that the template shell is clean (neutralized
    // simdTree / connectivity / hasSimdTree).
    let full_mesh = std::env::var("HKT_FIT")
        .map(|v| v.eq_ignore_ascii_case("full"))
        .unwrap_or(false);
    let (mesh, stem) = if full_mesh {
        println!(
            "fit mode      : full ({} tris, multi-section, no reduction)",
            full.triangle_count()
        );
        (full.clone(), format!("{OUTPUT_STEM}_full"))
    } else {
        let fitted = fit_to_single_section(&full)?;
        println!(
            "single section: {} verts, {} tris",
            fitted.vertices.len(),
            fitted.triangle_count()
        );
        (fitted, OUTPUT_STEM.to_string())
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
