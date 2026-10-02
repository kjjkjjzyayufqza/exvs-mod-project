//
// ------------------------------------------------
// Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
// AI アシスタントは編集前に AGENTS.md の Agent contract を読むこと。
// Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
// MBON knowledge source: descatal / BoostStudio (https://github.com/descatal/BoostStudio),
//   reimplemented in Rust for EXVS Mod Project.
// 代码许可为 PolyForm Shield 1.0.0，使用政策见 ACCEPTABLE_USE.md。
// Author kjjkjjzyayufqza. Product EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// GVS 部分是 kjjkjjzyayufqza 基于本项目 VS2 研究得出的成果。
// Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.
// ------------------------------------------------
//

//! Listing the files of a known folder: a package folder in the workspace, or
//! a sample folder in tests. Game folders are never listed; their archives are
//! reached by hash (`archives/XX/HASH.bin`) from the name tables and the game's
//! own lists.

use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

/// Recursively list regular files below `root` (hidden entries skipped),
/// optionally only those with one of `extensions`.
pub fn list_files(root: &Path, extensions: &[&str]) -> Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = std::fs::read_dir(&dir).map_err(|error| Error::io(dir.display(), error))?;
        for entry in entries.flatten() {
            let path = entry.path();
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_dir() {
                stack.push(path);
            } else if kind.is_file() {
                let matches = extensions.is_empty()
                    || path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .map(|ext| extensions.iter().any(|want| want.eq_ignore_ascii_case(ext)))
                        .unwrap_or(false);
                if matches {
                    out.push(path);
                }
            }
        }
    }
    out.sort();
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_nested_files_and_filters_extensions() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("0000.fhm/002")).unwrap();
        std::fs::write(dir.path().join("0000.fhm/001.bin"), b"a").unwrap();
        std::fs::write(dir.path().join("0000.fhm/002/001.nut"), b"b").unwrap();
        std::fs::write(dir.path().join(".hidden.nut"), b"c").unwrap();
        let all = list_files(dir.path(), &[]).unwrap();
        assert_eq!(all.len(), 2);
        let nuts = list_files(dir.path(), &["NUT"]).unwrap();
        assert_eq!(nuts, [dir.path().join("0000.fhm/002/001.nut")]);
    }
}
