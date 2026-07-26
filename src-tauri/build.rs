use std::fs;
use std::path::Path;

fn should_skip_tools_entry(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    if name == "__pycache__" {
        return true;
    }

    matches!(
        path.extension().and_then(|value| value.to_str()),
        Some("pyc" | "pyo")
    )
}

fn watch_tools_dir(path: &Path) {
    if should_skip_tools_entry(path) {
        return;
    }

    println!("cargo:rerun-if-changed={}", path.display());

    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if should_skip_tools_entry(&entry_path) {
            continue;
        }
        if entry_path.is_dir() {
            watch_tools_dir(&entry_path);
        } else {
            println!("cargo:rerun-if-changed={}", entry_path.display());
        }
    }
}

fn main() {
    watch_tools_dir(Path::new("../tools"));
    tauri_build::build()
}
