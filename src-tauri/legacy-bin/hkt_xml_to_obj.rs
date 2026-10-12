//! Convert Havok XML tagfile collision meshTree data to OBJ.
//!
//! Usage:
//!   cargo run --bin hkt_xml_to_obj -- <input.xml> <output.obj>

use std::path::PathBuf;

use app_lib::havok_mesh_export::havok_xml_to_obj;

fn main() {
    let preview: Vec<String> = std::env::args().skip(1).collect();
    if app_lib::cli_attribution::is_help_request(&preview) {
        app_lib::cli_attribution::print_help("Usage: hkt_xml_to_obj <input.xml> <output.obj>");
    }
    let mut args = preview.into_iter();
    let input = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            app_lib::cli_attribution::print_help("Usage: hkt_xml_to_obj <input.xml> <output.obj>")
        });
    let output = args.next().map(PathBuf::from).unwrap_or_else(|| {
        app_lib::cli_attribution::print_help("Usage: hkt_xml_to_obj <input.xml> <output.obj>")
    });

    let xml = std::fs::read_to_string(&input).expect("read XML");
    let summary = havok_xml_to_obj(&xml, &output).expect("XML -> OBJ failed");
    println!("{summary}");
}
