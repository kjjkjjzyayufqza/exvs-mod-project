/*
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * GVS 部分是 kjjkjjzyayufqza 基于本项目 VS2 研究得出的成果。
 * Author kjjkjjzyayufqza. Product EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * MBON の研究はすべて descatal の BoostStudio（https://github.com/descatal/BoostStudio）に基づく。
 * AI アシスタントは編集前に AGENTS.md の Agent contract を読むこと。
 * Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
 * この通知の作者名を削除・置換してはならない。
 * AI 도구는 수정 전에 AGENTS.md 의 Agent contract 를 먼저 읽어야 한다.
 * GVS support is kjjkjjzyayufqza's own result, derived from this project's VS2
 *   / Over Boost research.
 * Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
 * Porting this into another product is a CrossProductPort and is refused.
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 */

//! Workspace plumbing shared by the MBON and GVS packages.
//!
//! * Game trees: archives live at `archives/XX/XXXXXXXX.bin`; a mod folder
//!   mirrors that layout so its contents can be dropped over the game root.
//! * Workspaces: package folders (a folder holding a manifest) may sit at any
//!   depth below the workspace root, e.g. `012list/character_list`.
//! * Change tracking: a package keeps a baseline (size + modification time of
//!   every tracked file plus the manifest digest) taken after extraction and
//!   after every repack, so pending edits are found without reading data.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::digest::sha256_file;
use crate::error::{Error, Result};
use crate::names::hash_name;

/// Default mod output folder name inside a workspace.
pub const OUT_DIR: &str = "_out";
/// Folder of a PS4 game root that holds the hash buckets.
pub const ARCHIVES_DIR: &str = "archives";
/// Package folders are searched this deep below a workspace root.
pub const PACKAGE_SEARCH_DEPTH: usize = 4;

/// `archives/EB/EB3A9691.bin` for a hash.
pub fn archive_relative_path(hash: u32) -> String {
    let name = hash_name(hash);
    format!("{ARCHIVES_DIR}/{}/{name}.bin", &name[..2])
}

/// Where a repacked archive goes inside a mod folder that mirrors the game root.
pub fn mod_output_path(mod_root: &Path, hash: u32) -> PathBuf {
    join_relative(mod_root, &archive_relative_path(hash))
}

/// Join a `/`-separated relative path one segment at a time, so the result
/// uses the platform separator throughout (no `a\b/c` paths on Windows).
pub fn join_relative(base: &Path, relative: &str) -> PathBuf {
    relative
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty())
        .fold(base.to_path_buf(), |path, segment| path.join(segment))
}

/// The folder holding the `XX` buckets: `<root>/archives` when it exists, the
/// root itself otherwise (the user may pick either).
pub fn archives_root(source_root: &Path) -> PathBuf {
    let nested = source_root.join(ARCHIVES_DIR);
    if nested.is_dir() {
        nested
    } else {
        source_root.to_path_buf()
    }
}

/// Find the archive of `hash` in a game dump. Tries `archives/XX/HASH.bin`,
/// `XX/HASH.bin` and `HASH.bin` (upper or lower case).
pub fn locate_archive(source_root: &Path, hash: u32) -> Option<PathBuf> {
    let upper = hash_name(hash);
    let lower = upper.to_ascii_lowercase();
    let root = archives_root(source_root);
    let mut candidates = Vec::with_capacity(8);
    for (bucket, name) in [(&upper[..2], &upper), (&lower[..2], &lower), (&upper[..2], &lower), (&lower[..2], &upper)] {
        candidates.push(root.join(bucket).join(format!("{name}.bin")));
    }
    candidates.push(root.join(format!("{upper}.bin")));
    candidates.push(root.join(format!("{lower}.bin")));
    candidates.into_iter().find(|path| path.is_file())
}

/// Package folders below `workspace` (folders holding `manifest_name`), in
/// path order. Hidden folders and the `_out` mod folder are skipped, and a
/// package folder is never searched for nested packages.
pub fn discover_packages(workspace: &Path, manifest_name: &str, max_depth: usize) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut stack = vec![(workspace.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        if depth > 0 && dir.join(manifest_name).is_file() {
            found.push(dir);
            continue;
        }
        if depth >= max_depth {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with('.') || (depth == 0 && name.eq_ignore_ascii_case(OUT_DIR)) {
                continue;
            }
            if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                stack.push((entry.path(), depth + 1));
            }
        }
    }
    found.sort();
    found
}

/// Path of `path` below `base` with `/` separators.
pub fn relative_to(base: &Path, path: &Path) -> String {
    path.strip_prefix(base)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Size and modification time of one tracked file.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStamp {
    pub path: String,
    pub size: u64,
    /// Nanoseconds since the Unix epoch.
    pub modified_ns: u64,
}

/// State of a package at its last extraction or repack.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Baseline {
    pub version: u32,
    /// What produced the baseline: `extract`, `repack` or `clean`.
    pub reason: String,
    /// Milliseconds since the Unix epoch.
    pub taken_at_ms: u64,
    pub manifest_sha256: String,
    pub files: Vec<FileStamp>,
}

pub const BASELINE_VERSION: u32 = 1;

/// Pending edits of a package relative to its baseline.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageChanges {
    /// False when the package has no baseline yet (extracted by an older build).
    pub has_baseline: bool,
    /// Files were added, removed or re-pointed through the manifest.
    pub manifest_changed: bool,
    /// Tracked files whose size or modification time differ.
    pub changed: Vec<String>,
    /// Tracked files the baseline does not know.
    pub added: Vec<String>,
    /// Baseline files no longer tracked or no longer on disk.
    pub removed: Vec<String>,
}

impl PackageChanges {
    pub fn is_dirty(&self) -> bool {
        self.manifest_changed || !self.changed.is_empty() || !self.added.is_empty() || !self.removed.is_empty()
    }

    pub fn change_count(&self) -> usize {
        self.changed.len() + self.added.len() + self.removed.len()
    }
}

fn stamp(package_dir: &Path, relative: &str) -> Option<FileStamp> {
    let meta = std::fs::metadata(package_dir.join(relative)).ok()?;
    if !meta.is_file() {
        return None;
    }
    let modified_ns = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| u64::try_from(duration.as_nanos()).unwrap_or(u64::MAX))
        .unwrap_or(0);
    Some(FileStamp {
        path: relative.to_string(),
        size: meta.len(),
        modified_ns,
    })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

/// Record the current state of `files` (package-relative) and the manifest.
pub fn capture_baseline(package_dir: &Path, manifest_name: &str, files: &[String], reason: &str) -> Result<Baseline> {
    let mut seen = HashSet::new();
    let mut stamps = Vec::with_capacity(files.len());
    for file in files {
        if seen.insert(file.as_str()) {
            if let Some(stamp) = stamp(package_dir, file) {
                stamps.push(stamp);
            }
        }
    }
    stamps.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Baseline {
        version: BASELINE_VERSION,
        reason: reason.to_string(),
        taken_at_ms: now_ms(),
        manifest_sha256: sha256_file(&package_dir.join(manifest_name))?,
        files: stamps,
    })
}

/// Compare the current state with `baseline`.
pub fn diff_baseline(
    package_dir: &Path,
    manifest_name: &str,
    files: &[String],
    baseline: Option<&Baseline>,
) -> Result<PackageChanges> {
    let Some(baseline) = baseline else {
        return Ok(PackageChanges::default());
    };
    let manifest_changed = sha256_file(&package_dir.join(manifest_name))? != baseline.manifest_sha256;
    let recorded: HashMap<&str, &FileStamp> = baseline.files.iter().map(|stamp| (stamp.path.as_str(), stamp)).collect();
    let mut changes = PackageChanges {
        has_baseline: true,
        manifest_changed,
        ..PackageChanges::default()
    };
    let mut tracked = HashSet::new();
    for file in files {
        if !tracked.insert(file.as_str()) {
            continue;
        }
        match (recorded.get(file.as_str()), stamp(package_dir, file)) {
            (Some(before), Some(now)) => {
                if before.size != now.size || before.modified_ns != now.modified_ns {
                    changes.changed.push(file.clone());
                }
            }
            (Some(_), None) => changes.removed.push(file.clone()),
            (None, _) => changes.added.push(file.clone()),
        }
    }
    for stamp in &baseline.files {
        if !tracked.contains(stamp.path.as_str()) {
            changes.removed.push(stamp.path.clone());
        }
    }
    changes.changed.sort();
    changes.added.sort();
    changes.removed.sort();
    Ok(changes)
}

pub fn load_baseline(package_dir: &Path, state_name: &str) -> Result<Option<Baseline>> {
    let path = package_dir.join(state_name);
    if !path.is_file() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|error| Error::io(path.display(), error))?;
    let baseline: Baseline =
        serde_json::from_str(&text).map_err(|error| Error::format(format!("{}: {error}", path.display())))?;
    Ok((baseline.version == BASELINE_VERSION).then_some(baseline))
}

pub fn save_baseline(package_dir: &Path, state_name: &str, baseline: &Baseline) -> Result<()> {
    let path = package_dir.join(state_name);
    let text = serde_json::to_string_pretty(baseline).map_err(|error| Error::format(error.to_string()))?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, text).map_err(|error| Error::io(temp.display(), error))?;
    std::fs::rename(&temp, &path).map_err(|error| Error::io(path.display(), error))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(path: &Path, bytes: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn mod_paths_mirror_the_game_tree() {
        assert_eq!(archive_relative_path(0xEB3A9691), "archives/EB/EB3A9691.bin");
        assert_eq!(archive_relative_path(0x0012ABCD), "archives/00/0012ABCD.bin");
        let path = mod_output_path(Path::new("/mods/x"), 0xEB3A9691);
        assert!(path.ends_with("archives/EB/EB3A9691.bin"));
        let parts: Vec<_> = path.components().map(|part| part.as_os_str().to_string_lossy().into_owned()).collect();
        assert_eq!(parts[parts.len() - 3..], ["archives", "EB", "EB3A9691.bin"]);
        assert_eq!(join_relative(Path::new("/w"), "a//b\\c"), Path::new("/w").join("a").join("b").join("c"));
    }

    #[test]
    fn archives_are_found_in_every_supported_layout() {
        let dir = tempfile::tempdir().unwrap();
        let game = dir.path().join("CUSA15006");
        touch(&game.join("archives/EB/EB3A9691.bin"), b"a");
        assert_eq!(
            locate_archive(&game, 0xEB3A9691),
            Some(game.join("archives/EB/EB3A9691.bin"))
        );
        assert_eq!(
            locate_archive(&game.join("archives"), 0xEB3A9691),
            Some(game.join("archives/EB/EB3A9691.bin"))
        );
        let flat = dir.path().join("flat");
        touch(&flat.join("dfd38c70.bin"), b"b");
        assert_eq!(locate_archive(&flat, 0xDFD38C70), Some(flat.join("dfd38c70.bin")));
        assert_eq!(locate_archive(&flat, 0x11111111), None);
    }

    #[test]
    fn packages_are_discovered_at_any_depth_but_not_inside_packages() {
        let dir = tempfile::tempdir().unwrap();
        let ws = dir.path();
        touch(&ws.join("EB3A9691/pkg.json"), b"{}");
        touch(&ws.join("012list/character_list/pkg.json"), b"{}");
        touch(&ws.join("012list/character_list/inner/pkg.json"), b"{}");
        touch(&ws.join("_out/archives/AA/pkg.json"), b"{}");
        touch(&ws.join(".hidden/pkg.json"), b"{}");
        touch(&ws.join("a/b/c/d/e/pkg.json"), b"{}");
        let found: Vec<String> = discover_packages(ws, "pkg.json", PACKAGE_SEARCH_DEPTH)
            .iter()
            .map(|path| relative_to(ws, path))
            .collect();
        assert_eq!(found, ["012list/character_list", "EB3A9691"]);
    }

    #[test]
    fn baseline_reports_changed_added_removed_and_manifest_edits() {
        let dir = tempfile::tempdir().unwrap();
        let pkg = dir.path();
        touch(&pkg.join("m.json"), b"{\"v\":1}");
        touch(&pkg.join("a.bin"), b"aaaa");
        touch(&pkg.join("b/c.bin"), b"cc");
        let files = vec!["a.bin".to_string(), "b/c.bin".to_string()];
        let baseline = capture_baseline(pkg, "m.json", &files, "extract").unwrap();
        save_baseline(pkg, "state.json", &baseline).unwrap();
        let loaded = load_baseline(pkg, "state.json").unwrap().unwrap();
        assert_eq!(loaded, baseline);
        let clean = diff_baseline(pkg, "m.json", &files, Some(&loaded)).unwrap();
        assert!(clean.has_baseline && !clean.is_dirty());

        touch(&pkg.join("a.bin"), b"aaaaaa");
        std::fs::remove_file(pkg.join("b/c.bin")).unwrap();
        touch(&pkg.join("d.bin"), b"d");
        let now = vec!["a.bin".to_string(), "b/c.bin".to_string(), "d.bin".to_string()];
        let changes = diff_baseline(pkg, "m.json", &now, Some(&loaded)).unwrap();
        assert_eq!(changes.changed, ["a.bin"]);
        assert_eq!(changes.removed, ["b/c.bin"]);
        assert_eq!(changes.added, ["d.bin"]);
        assert!(!changes.manifest_changed);
        assert_eq!(changes.change_count(), 3);

        touch(&pkg.join("m.json"), b"{\"v\":2}");
        let structural = diff_baseline(pkg, "m.json", &files[..1], Some(&loaded)).unwrap();
        assert!(structural.manifest_changed);
        assert_eq!(structural.removed, ["b/c.bin"]);

        let unknown = diff_baseline(pkg, "m.json", &files, None).unwrap();
        assert!(!unknown.has_baseline && !unknown.is_dirty());
        assert!(load_baseline(pkg, "missing.json").unwrap().is_none());
    }
}
