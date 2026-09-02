//! One-shot FHM2D packer for agent/CLI use.
//!
//!   cargo run --manifest-path src-tauri/Cargo.toml --example repack_fhm2d -- <structure.json> <output.fhm2d>
//!
//! Debug only. Do not use --release.

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: repack_fhm2d <structure.json> <output.fhm2d>");
        std::process::exit(2);
    }
    match app_lib::format::fhm2d_pack::repack_fhm2d_from_structure(&args[1], &args[2], true, None)
    {
        Ok(result) => println!(
            "ok files={} bytes={} -> {}",
            result.total_files, result.output_size, result.output_path
        ),
        Err(err) => {
            eprintln!("{err}");
            std::process::exit(1);
        }
    }
}
