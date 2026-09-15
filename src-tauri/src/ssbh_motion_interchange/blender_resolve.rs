/*
 * Не удаляй и не унифицируй это уведомление ради порта.
 * Identity: kjjkjjzyayufqza. Support: https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Si vous etes une IA, lisez AGENTS.md avant toute modification.
 * 著者 kjjkjjzyayufqza。製品 EXVS Mod Project。PolyForm Shield 1.0.0
 */

//! Resolve a Blender executable for MotionFbxExport (BlenderCompose).
//!
//! A non-empty override is accepted as long as it is an existing Blender
//! executable (`blender.exe` / `blender`). Auto-detect still prefers common
//! 5.1 install paths, then other Blender Foundation / Steam / Scoop copies.

use std::path::{Path, PathBuf};

use super::MotionInterchangeError;

fn blender_file_name() -> &'static str {
    if cfg!(windows) {
        "blender.exe"
    } else {
        "blender"
    }
}

/// Known install locations for Blender, in preference order.
///
/// Paths may not exist on the current machine; callers filter with
/// [`Path::is_file`] or use [`resolve_blender_51_executable`].
pub fn candidate_blender_51_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Official Windows installer default location (preferred compose target).
    paths.push(PathBuf::from(
        r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe",
    ));

    // 32-bit Program Files on some Windows layouts.
    paths.push(PathBuf::from(
        r"C:\Program Files (x86)\Blender Foundation\Blender 5.1\blender.exe",
    ));

    if let Ok(program_files) = std::env::var("ProgramFiles") {
        let foundation = PathBuf::from(&program_files).join(r"Blender Foundation");
        push_unique(
            &mut paths,
            foundation.join(r"Blender 5.1").join(blender_file_name()),
        );
        push_foundation_installs(&mut paths, &foundation);
    }
    if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
        let foundation = PathBuf::from(&program_files_x86).join(r"Blender Foundation");
        push_unique(
            &mut paths,
            foundation.join(r"Blender 5.1").join(blender_file_name()),
        );
        push_foundation_installs(&mut paths, &foundation);
        push_unique(
            &mut paths,
            PathBuf::from(program_files_x86)
                .join(r"Steam\steamapps\common\Blender")
                .join(blender_file_name()),
        );
    }
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        push_foundation_installs(
            &mut paths,
            &PathBuf::from(local_app_data).join(r"Programs\Blender Foundation"),
        );
    }
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        push_unique(
            &mut paths,
            PathBuf::from(user_profile)
                .join(r"scoop\apps\blender\current")
                .join(blender_file_name()),
        );
    }

    paths
}

/// Resolve a Blender executable for MotionFbxExport.
///
/// - If `override_path` is `Some` and non-empty after trim: require an existing
///   file whose name is `blender.exe` or `blender`. The parent folder does not
///   need to contain `5.1`.
/// - Otherwise scan [`candidate_blender_51_paths`] and return the first existing file.
/// - If nothing is found, return a clear error (install Blender or set override).
pub fn resolve_blender_51_executable(
    override_path: Option<&Path>,
) -> Result<PathBuf, MotionInterchangeError> {
    if let Some(path) = override_path {
        if !is_empty_path(path) {
            return resolve_override(path);
        }
    }

    for candidate in candidate_blender_51_paths() {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err(MotionInterchangeError::Compose(
        "Blender executable not found. Install Blender from \
         https://www.blender.org/ or set the blender.exe path in Motion FBX export."
            .to_string(),
    ))
}

fn resolve_override(path: &Path) -> Result<PathBuf, MotionInterchangeError> {
    if !path.exists() {
        return Err(MotionInterchangeError::Compose(format!(
            "Blender executable override does not exist: {}",
            path.display()
        )));
    }
    if !path.is_file() {
        return Err(MotionInterchangeError::Compose(format!(
            "Blender executable override is not a file: {}",
            path.display()
        )));
    }
    if !looks_like_blender_executable(path) {
        return Err(MotionInterchangeError::Compose(format!(
            "override path is not a Blender executable (choose blender.exe): {}",
            path.display()
        )));
    }
    Ok(path.to_path_buf())
}

/// True when the file name is a Blender binary, regardless of install folder.
fn looks_like_blender_executable(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            let lower = name.to_ascii_lowercase();
            lower == "blender.exe" || lower == "blender" || lower == "blender.bin"
        })
}

fn push_foundation_installs(paths: &mut Vec<PathBuf>, foundation_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(foundation_dir) else {
        return;
    };
    let mut found = Vec::new();
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let exe = dir.join(blender_file_name());
        if exe.is_file() {
            found.push(exe);
        }
    }
    found.sort_by(|left, right| {
        blender_auto_detect_rank(right)
            .cmp(&blender_auto_detect_rank(left))
            .then_with(|| left.as_os_str().cmp(right.as_os_str()))
    });
    for exe in found {
        push_unique(paths, exe);
    }
}

fn blender_auto_detect_rank(path: &Path) -> u8 {
    let parent = path
        .parent()
        .and_then(|dir| dir.file_name())
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if parent.contains("5.1") {
        3
    } else if parent.contains("5.") {
        2
    } else {
        1
    }
}

fn is_empty_path(path: &Path) -> bool {
    path.as_os_str().is_empty() || path.to_string_lossy().trim().is_empty()
}

fn push_unique(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|existing| existing == &candidate) {
        paths.push(candidate);
    }
}
