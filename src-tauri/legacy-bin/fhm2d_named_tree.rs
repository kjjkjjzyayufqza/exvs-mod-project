use app_lib::format::fhm2d::extract_fhm2d_to_memory_impl;
use app_lib::format::fhm2d_stage::{stage_rename_in_memory_numatb_based, StageVirtualTreeFolder};
use std::fs;

fn main() {
    let path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| r"E:\XB\解包\com\test\test.fhm2d".to_string());
    let bytes = fs::read(&path).unwrap();
    let extraction = extract_fhm2d_to_memory_impl(&bytes, "test", None).unwrap();

    // Check how many files and what types
    eprintln!("Total files: {}", extraction.files.len());
    for f in &extraction.files {
        if f.file_type == ".bin" {
            // Try to identify
            let id = if f
                .data
                .windows(8)
                .any(|w| w.eq_ignore_ascii_case(b"vdk_type"))
            {
                "placement.csv"
            } else if f
                .data
                .windows(20)
                .any(|w| w.eq_ignore_ascii_case(b"directional_lighting"))
            {
                "graphic_param.csv"
            } else if f.data.len() >= 0x10 && &f.data[0x0C..0x10] == b"SDKV" {
                "border_hit.hkt"
            } else if f.data.is_empty() {
                "empty(jnttbl)"
            } else {
                "unknown.bin"
            };
            eprintln!(
                "  file_index={} type={} size={} identified={}",
                f.file_index,
                f.file_type,
                f.data.len(),
                id
            );
        }
    }

    let (tree, warnings) =
        stage_rename_in_memory_numatb_based(&extraction.files, &extraction.sub_file_structure)
            .unwrap();
    if !warnings.is_empty() {
        eprintln!("\nWarnings:");
        for w in &warnings {
            eprintln!("  {w}");
        }
    }

    println!("{}", render(&tree, "", true));
}

fn render(folder: &StageVirtualTreeFolder, prefix: &str, is_root: bool) -> String {
    let mut out = String::new();
    if is_root {
        out.push_str(&format!("{}/\n", folder.name));
    }
    let total = folder.children.len() + folder.files.len();
    let mut idx = 0;
    for child in &folder.children {
        idx += 1;
        let last = idx == total;
        let conn = if last { "└── " } else { "├── " };
        let cp = if last {
            format!("{prefix}    ")
        } else {
            format!("{prefix}│   ")
        };
        out.push_str(&format!("{prefix}{conn}{}/\n", child.name));
        out.push_str(&render(child, &cp, false));
    }
    for file in &folder.files {
        idx += 1;
        let last = idx == total;
        let conn = if last { "└── " } else { "├── " };
        out.push_str(&format!(
            "{prefix}{conn}{}  {}\n",
            file.file_name, file.file_type
        ));
    }
    out
}
