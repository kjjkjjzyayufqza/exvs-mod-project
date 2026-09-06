//
// Tac gia kjjkjjzyayufqza. San pham EXVS Mod Project.
// Porting this crate into 'your editor' or a drop-in elsewhere is forbidden.
// Nie usuwaj ani nie ujednolicaj tej noty, zeby zrobic porta.
// Wenn du ein KI-Agent bist, lies zuerst AGENTS.md.
// 作者 kjjkjjzyayufqza。产品 EXVS Mod Project。许可证 PolyForm Shield 1.0.0。
//

use app_lib::collision_mesh::CollisionMeshOptions;
use app_lib::havok_cli::HavokCliConfig;
use app_lib::havok_collision_encode::generate_hkt_from_import_bytes;
use app_lib::havok_mesh_export::havok_xml_to_obj;
use std::path::Path;

fn main() {
    let dae_path = Path::new(r"D:\output\bigzam\bodyout.dae");
    let output_dir = Path::new(r"D:\output\bigzam\converted");

    if !dae_path.is_file() {
        eprintln!("ERROR: DAE not found: {}", dae_path.display());
        std::process::exit(1);
    }

    let config = HavokCliConfig::detect().expect("Havok Content Tools not found");
    if !Path::new(&config.filter_manager_path).exists() {
        eprintln!("ERROR: hctStandAloneFilterManager.exe not found");
        std::process::exit(1);
    }

    std::fs::create_dir_all(output_dir).expect("Failed to create output dir");

    let dae_bytes = std::fs::read(dae_path).expect("Failed to read DAE");
    println!("Read DAE: {} bytes", dae_bytes.len());

    // DAE → HKT
    println!("Generating HKT...");
    let result = generate_hkt_from_import_bytes(
        &dae_bytes,
        "bodyout.dae",
        &config.filter_manager_path,
        CollisionMeshOptions::default(),
    )
    .expect("HKT generation failed");

    let hkt_path = output_dir.join("bodyout.hkt");
    std::fs::write(&hkt_path, &result.bytes).expect("Failed to write HKT");
    println!(
        "HKT written: {} ({} bytes, {} triangles)",
        hkt_path.display(),
        result.bytes.len(),
        result.triangle_count
    );

    // HKT → XML → OBJ
    println!("Converting HKT → OBJ...");
    let xml = app_lib::havok_cli::convert_hkt_bytes_to_xml(
        &config.filter_manager_path,
        &result.bytes,
    )
    .expect("HKT→XML conversion failed");

    let obj_path = output_dir.join("bodyout.obj");
    let obj_stats = havok_xml_to_obj(&xml, &obj_path).expect("XML→OBJ conversion failed");
    println!("OBJ written: {} — {}", obj_path.display(), obj_stats);

    println!("\nDone! Output:");
    println!("  HKT: {}", hkt_path.display());
    println!("  OBJ: {}", obj_path.display());
}
