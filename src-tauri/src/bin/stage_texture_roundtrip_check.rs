//! Verifies the two distinct texture layouts the app must produce (no
//! production code is modified — this only drives the same functions the
//! pipelines call):
//!
//!   Save changes to folder  -> ONE shared `textures/`, no per-model subdirs
//!     (restore_shared_textures + rebuild_structure_json_for_stage_with_shared_textures)
//!   Repack to .fhm2d         -> per-model `0/` (maya) + `1/` (nust) subdirs
//!     (redistribute_stage_textures + rebuild_structure_json_for_stage_forced)
//!
//! Audits the on-disk tree and the structure.json fileUrls after each path.
//!
//! Usage: cargo run --bin stage_texture_roundtrip_check -- <input.fhm2d> [workdir]

use std::fs;
use std::path::{Path, PathBuf};

use app_lib::format::fhm2d_stage::{
    extract_stage_fhm2d_to_folder_impl, rebuild_structure_json_for_stage_forced,
    rebuild_structure_json_for_stage_with_shared_textures, redistribute_stage_textures,
    restore_shared_textures,
};

fn main() {
    let input = std::env::args()
        .nth(1)
        .unwrap_or_else(|| r"e:\XB\解包\com\test\0x16F73C97.fhm2d".to_string());
    let workdir = std::env::args()
        .nth(2)
        .unwrap_or_else(|| r"e:\XB\解包\com\test\_roundtrip_check".to_string());

    if Path::new(&workdir).exists() {
        fs::remove_dir_all(&workdir).expect("failed to clear workdir");
    }
    fs::create_dir_all(&workdir).expect("failed to create workdir");

    println!("== Extract ==");
    let extract = extract_stage_fhm2d_to_folder_impl(&input, &workdir).expect("extract failed");
    restore_shared_textures(&extract.output_dir).expect("initial restore failed");
    let stage_root = PathBuf::from(&extract.output_dir);
    let pack_root = extract.output_dir.clone();
    println!("extracted {} files -> {}", extract.total_files, pack_root);

    let mut ok = true;

    // ── Path A: Save changes to folder (consolidated, shared textures/) ──
    println!("\n== Path A: Save-to-folder (consolidate) ==");
    let restore = restore_shared_textures(&pack_root).expect("restore_shared_textures failed");
    let structure_path = rebuild_structure_json_for_stage_with_shared_textures(&pack_root)
        .expect("rebuild (shared) failed");
    println!(
        "restore collected={}, subdirs_removed={}; structure -> {}",
        restore.textures_collected, restore.subdirs_removed, structure_path
    );

    let textures_a = find_dirs_named(&stage_root, "textures");
    let leftover_a = find_model_texture_subdirs(&stage_root);
    println!("  shared textures/ folders : {}", textures_a.len());
    println!("  per-model texture subdirs: {}", leftover_a.len());
    let urls_a = collect_nutexb_urls(Path::new(&structure_path));
    let shared_a = urls_a.iter().filter(|u| url_is_shared(u)).count();
    let dangling_a = urls_a.iter().filter(|u| !url_resolves(&workdir, u)).count();
    println!(
        "  structure.json: {} nutexb URLs, {} under \\textures\\, {} dangling",
        urls_a.len(),
        shared_a,
        dangling_a
    );
    if textures_a.len() != 1 {
        println!("  !! expected exactly 1 shared textures/ folder");
        ok = false;
    }
    if !leftover_a.is_empty() {
        println!("  !! per-model texture subdirs should NOT exist in folder layout");
        ok = false;
    }
    // Model textures must be consolidated under textures/; info/ environment
    // nutexb (fog/light/post_effect) legitimately stay outside the shared folder.
    if shared_a == 0 {
        println!("  !! no model nutexb URLs reference the shared \\textures\\ folder");
        ok = false;
    }
    if dangling_a != 0 {
        println!("  !! some nutexb URLs do not resolve on disk");
        ok = false;
    }

    // ── Path B: Repack to .fhm2d (redistribute to per-model subdirs) ──
    println!("\n== Path B: Repack-to-fhm2d (redistribute) ==");
    let redist = redistribute_stage_textures(&pack_root).expect("redistribute failed");
    let structure_path_b =
        rebuild_structure_json_for_stage_forced(&pack_root).expect("rebuild (forced) failed");
    println!(
        "models_processed={}, textures_copied={}, shared_removed={}; structure -> {}",
        redist.models_processed,
        redist.textures_copied,
        redist.textures_folder_removed,
        structure_path_b
    );

    let textures_b = find_dirs_named(&stage_root, "textures");
    let models = find_model_folders(&stage_root);
    println!("  leftover shared textures/ folders: {}", textures_b.len());
    println!("  model folders detected: {}", models.len());
    for mf in &models {
        let m0 = mf.join("0");
        let m1 = mf.join("1");
        let two = m0.is_dir() && m1.is_dir();
        println!(
            "    {}: 0/={} 1/={} {}",
            rel(&stage_root, mf),
            if m0.is_dir() { count_nutexb(&m0) } else { 0 },
            if m1.is_dir() { count_nutexb(&m1) } else { 0 },
            if two {
                ""
            } else {
                "  <-- MISSING a texture folder"
            }
        );
        if !two {
            ok = false;
        }
    }
    let urls_b = collect_nutexb_urls(Path::new(&structure_path_b));
    let shared_b = urls_b.iter().filter(|u| url_is_shared(u)).count();
    let dangling_b = urls_b.iter().filter(|u| !url_resolves(&workdir, u)).count();
    println!(
        "  structure.json: {} nutexb URLs, {} still under \\textures\\, {} dangling",
        urls_b.len(),
        shared_b,
        dangling_b
    );
    if !textures_b.is_empty() {
        println!("  !! shared textures/ should be removed after redistribution");
        ok = false;
    }
    if models.is_empty() {
        println!("  !! no model folders detected");
        ok = false;
    }
    if shared_b != 0 {
        println!("  !! no nutexb URL should remain under \\textures\\ after repack");
        ok = false;
    }
    if dangling_b != 0 {
        println!("  !! some nutexb URLs do not resolve on disk");
        ok = false;
    }

    // ── Path C: open/save a per-model folder -> re-consolidate ──
    // Simulates load_stage_bundle / Save-to-folder running restore_shared_textures
    // on a folder that currently has per-model texture subdirs (left by Path B),
    // passing the CONTENT root exactly like load_stage_bundle does.
    println!("\n== Path C: re-consolidate per-model folder (open/save) ==");
    let content_root = stage_root.join("0").join("0");
    let restore_c =
        restore_shared_textures(content_root.to_str().unwrap()).expect("restore (path C) failed");
    let structure_c = rebuild_structure_json_for_stage_with_shared_textures(&pack_root)
        .expect("rebuild (shared, path C) failed");
    println!(
        "input(content root)={}, restore collected={}, subdirs_removed={}",
        content_root.display(),
        restore_c.textures_collected,
        restore_c.subdirs_removed
    );
    let textures_c = find_dirs_named(&stage_root, "textures");
    let leftover_c = find_model_texture_subdirs(&stage_root);
    println!("  textures/ folders:");
    for d in &textures_c {
        println!("    {} ({} nutexb)", rel(&stage_root, d), count_nutexb(d));
    }
    println!("  per-model texture subdirs: {}", leftover_c.len());
    let urls_c = collect_nutexb_urls(Path::new(&structure_c));
    let shared_c = urls_c.iter().filter(|u| url_is_shared(u)).count();
    let dangling_c = urls_c.iter().filter(|u| !url_resolves(&workdir, u)).count();
    println!(
        "  structure.json: {} nutexb URLs, {} under \\textures\\, {} dangling",
        urls_c.len(),
        shared_c,
        dangling_c
    );
    if textures_c.len() != 1 {
        println!("  !! expected exactly 1 textures/ folder after re-consolidate");
        ok = false;
    }
    if !leftover_c.is_empty() {
        println!("  !! per-model texture subdirs should be gone after re-consolidate");
        ok = false;
    }
    if dangling_c != 0 {
        println!("  !! json has dangling nutexb URLs after re-consolidate");
        ok = false;
    }

    println!("\n== Verdict ==");
    if ok {
        println!("PASS: Save-to-folder = single shared textures/; Repack = per-model 0/ + 1/. structure.json correct for both.");
    } else {
        println!("FAIL: see !! lines above.");
        std::process::exit(1);
    }
}

fn rel(root: &Path, p: &Path) -> String {
    p.strip_prefix(root).unwrap_or(p).display().to_string()
}

fn count_nutexb(dir: &Path) -> usize {
    fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .to_ascii_lowercase()
                .ends_with(".nutexb")
        })
        .count()
}

fn find_dirs_named(root: &Path, target: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    walk_dirs(root, &mut |d| {
        if d.file_name()
            .map(|n| n.to_string_lossy().eq_ignore_ascii_case(target))
            .unwrap_or(false)
        {
            out.push(d.to_path_buf());
        }
    });
    out
}

/// A model folder directly contains a `*__maya__.numatb` file.
fn find_model_folders(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    walk_dirs(root, &mut |d| {
        if dir_has_suffix_file(d, "__maya__.numatb") {
            out.push(d.to_path_buf());
        }
    });
    out
}

/// Numbered nutexb-only subdirs that live directly under a model folder.
fn find_model_texture_subdirs(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for model in find_model_folders(root) {
        let Ok(entries) = fs::read_dir(&model) else {
            continue;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.is_empty() && name.chars().all(|c| c.is_ascii_digit()) {
                out.push(entry.path());
            }
        }
    }
    out
}

fn dir_has_suffix_file(dir: &Path, suffix: &str) -> bool {
    fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .any(|e| {
            e.file_name()
                .to_string_lossy()
                .to_ascii_lowercase()
                .ends_with(suffix)
        })
}

fn walk_dirs(dir: &Path, f: &mut impl FnMut(&Path)) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(|e| e.ok()) {
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            let p = entry.path();
            f(&p);
            walk_dirs(&p, f);
        }
    }
}

/// Recursively gather every JSON string value that names a `.nutexb` *path*
/// (has a separator), ignoring bare `.nutexb` fileType values and filenames.
fn collect_nutexb_urls(json_path: &Path) -> Vec<String> {
    let Ok(text) = fs::read_to_string(json_path) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    collect_strings(&value, &mut out);
    out.retain(|s| {
        s.to_ascii_lowercase().ends_with(".nutexb") && (s.contains('\\') || s.contains('/'))
    });
    out
}

fn collect_strings(v: &serde_json::Value, out: &mut Vec<String>) {
    match v {
        serde_json::Value::String(s) => out.push(s.clone()),
        serde_json::Value::Array(a) => a.iter().for_each(|x| collect_strings(x, out)),
        serde_json::Value::Object(o) => o.values().for_each(|x| collect_strings(x, out)),
        _ => {}
    }
}

fn url_is_shared(url: &str) -> bool {
    url.to_ascii_lowercase()
        .replace('\\', "/")
        .contains("/textures/")
}

fn url_resolves(workdir: &str, url: &str) -> bool {
    let rel = url
        .trim_start_matches(".\\")
        .trim_start_matches("./")
        .replace('\\', "/");
    Path::new(workdir).join(rel).is_file()
}
