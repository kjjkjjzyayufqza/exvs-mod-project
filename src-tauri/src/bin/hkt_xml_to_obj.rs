//! Convert Havok XML tagfile collision meshTree data to OBJ.
//!
//! Usage:
//!   cargo run --bin hkt_xml_to_obj -- <input.xml> <output.obj>

use std::path::PathBuf;

use app_lib::havok_mesh_export::havok_xml_to_obj;

fn main() {
    let mut args = std::env::args().skip(1);
    let input = args.next().map(PathBuf::from).expect("missing input XML");
    let output = args.next().map(PathBuf::from).expect("missing output OBJ");

    let xml = std::fs::read_to_string(&input).expect("read XML");
    let summary = havok_xml_to_obj(&xml, &output).expect("XML -> OBJ failed");
    println!("{summary}");
}
