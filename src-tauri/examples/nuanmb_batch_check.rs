//! Batch-check `.nuanmb` files under a directory using the same decode + non-bone sampling
//! path as the Tauri preview (`smoke_decode_and_sample_nuanmb`).
//!
//! Usage:
//!   cargo run --example nuanmb_batch_check -- "E:\\path\\to\\folder"
//! Or:
//!   set NUANMB_BATCH_DIR=E:\\path\\to\\folder
//!   cargo run --example nuanmb_batch_check

use app_lib::smoke_decode_and_sample_nuanmb;
use std::path::{Path, PathBuf};

fn collect_nuanmb_recursive(root: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    let read = match std::fs::read_dir(root) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("skip unreadable dir {}: {e}", root.display());
            return Ok(());
        }
    };
    for ent in read.flatten() {
        let p = ent.path();
        let meta = match ent.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            collect_nuanmb_recursive(&p, out)?;
        } else if meta.is_file() {
            let ok = p
                .extension()
                .and_then(|s| s.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("nuanmb"))
                .unwrap_or(false);
            if ok {
                out.push(p);
            }
        }
    }
    Ok(())
}

fn main() -> Result<(), String> {
    let root: PathBuf = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .or_else(|| std::env::var("NUANMB_BATCH_DIR").ok().map(PathBuf::from))
        .ok_or_else(|| {
            "Pass directory as first argument or set NUANMB_BATCH_DIR".to_string()
        })?;
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", root.display()));
    }

    let mut paths = Vec::new();
    collect_nuanmb_recursive(&root, &mut paths).map_err(|e| e.to_string())?;
    paths.sort();
    let total = paths.len();
    if total == 0 {
        println!("No .nuanmb files under {}", root.display());
        return Ok(());
    }

    println!("Found {} .nuanmb file(s) under {}", total, root.display());
    let mut failed: Vec<(PathBuf, String)> = Vec::new();
    for (i, p) in paths.iter().enumerate() {
        if (i + 1) % 50 == 0 || i == 0 {
            eprintln!("Progress {}/{} …", i + 1, total);
        }
        if let Err(e) = smoke_decode_and_sample_nuanmb(p, 0.0) {
            failed.push((p.clone(), e));
        }
    }

    if failed.is_empty() {
        println!("OK: all {} file(s) decoded and sampled (frame 0).", total);
        return Ok(());
    }

    eprintln!("\nFAILED {} of {}:", failed.len(), total);
    for (p, e) in &failed {
        eprintln!("  {}\n    {}", p.display(), e);
    }
    Err(format!(
        "{} of {} .nuanmb file(s) failed decode/sample",
        failed.len(),
        total
    ))
}
