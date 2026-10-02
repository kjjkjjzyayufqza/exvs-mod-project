// ================================================
// Mimo strom EXVS Mod Project tento kod neprenasej.
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// MBON の研究はすべて descatal の BoostStudio（https://github.com/descatal/BoostStudio）に基づく。
// Autor kjjkjjzyayufqza. Produs EXVS Mod Project. Sursa
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// 作者 kjjkjjzyayufqza。製品 EXVS Mod Project。https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
// Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
// ================================================

//! Known MBON content, indexed from lists only: the MBON name table plus the
//! units of the game's own `SCharacterList`, read from the list pack
//! (`EB3A9691`, BoostStudio `ExvsListInfo`) once data init has extracted it.
//! Every archive is then reached by its hash (`archives/XX/HASH.bin`); the
//! game folder is never listed.

use std::collections::HashSet;
use std::path::Path;

use exvs_ps4_common::names::{hash_name, sanitize_segment, ArchiveName};
use exvs_ps4_common::packages::{self as kit, InitCatalog};
use exvs_ps4_common::workspace::join_relative;

use crate::list_info::{CellKind, ListInfo};
use crate::names;
use crate::package::{load_manifest, tracked_files, MbonFormat};

/// The list pack that carries `SCharacterList` and the other list-info tables.
pub const LIST_PACK_HASH: u32 = 0xEB3A_9691;
/// Workspace route folder of the per-unit archives named from the list.
pub const UNIT_ROUTE: &str = "unit";
/// `name_source` of names that come from `SCharacterList`.
pub const UNIT_NAME_SOURCE: &str = "scharacterlist";

const CHARACTER_LIST: &str = "SCharacterList";
/// Unit code string (`F1011`) in a 164-byte `SCharacterList` record.
const UNIT_CODE_COLUMN: usize = 0x08;
/// Archive hash of the unit in the same record (a small FHM per unit).
const UNIT_ARCHIVE_COLUMN: usize = 124;

/// Units listed by the `SCharacterList` of the list pack extracted into
/// `workspace`: one archive per unit, named by its unit code. Empty until data
/// init has extracted the list pack.
pub fn character_list_units(workspace: &Path) -> Vec<ArchiveName> {
    let packages = kit::packages_by_hash(&MbonFormat, workspace);
    let Some(dir) = packages.get(&LIST_PACK_HASH).and_then(|dirs| dirs.first()) else {
        return Vec::new();
    };
    let Ok(manifest) = load_manifest(dir) else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let mut units = Vec::new();
    for relative in tracked_files(&manifest).iter().filter(|path| path.ends_with(".list")) {
        let Ok(bytes) = std::fs::read(join_relative(dir, relative)) else {
            continue;
        };
        if ListInfo::sniff(&bytes).as_deref() != Some(CHARACTER_LIST) {
            continue;
        }
        let Ok(list) = ListInfo::parse(&bytes) else {
            continue;
        };
        for row in 0..list.count() {
            let code = list.get(row, UNIT_CODE_COLUMN, CellKind::String);
            let hash = list.get(row, UNIT_ARCHIVE_COLUMN, CellKind::U32);
            let (Ok(code), Some(hash)) = (code, hash.ok().and_then(|text| text.parse::<u32>().ok())) else {
                continue;
            };
            // Later rows repeat earlier units (alternate entries share the archive).
            if hash == 0 || !seen.insert(hash) {
                continue;
            }
            let folder = sanitize_segment(&code);
            units.push(ArchiveName {
                hash,
                route: UNIT_ROUTE.to_string(),
                name: if folder.is_empty() { hash_name(hash) } else { folder },
                group: None,
                source: UNIT_NAME_SOURCE.to_string(),
                title: Some(code),
            });
        }
    }
    units
}

/// Every known MBON archive: the name table, then the units of the extracted
/// `SCharacterList` that the table does not name.
pub fn content_names(workspace: Option<&Path>) -> Vec<ArchiveName> {
    let book = names::book();
    let mut known: Vec<ArchiveName> = book.iter().cloned().collect();
    if let Some(workspace) = workspace.filter(|path| path.is_dir()) {
        known.extend(
            character_list_units(workspace)
                .into_iter()
                .filter(|unit| book.get(unit.hash).is_none()),
        );
    }
    known
}

/// The content index: every known archive with its file in the game folder
/// (looked up by hash) and its packages in the workspace.
pub fn content_index(source_root: Option<&Path>, workspace: Option<&Path>) -> InitCatalog {
    let names = content_names(workspace);
    kit::build_catalog(&names, &MbonFormat, source_root, workspace)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fhm::{FhmDocument, LOAD_NORMAL};
    use crate::package::{extract_into_workspace, ExtractOptions};

    /// A minimal `SCharacterList`: 164-byte records with the unit code at 0x08
    /// and the unit archive hash at 124, the string pool after the records.
    fn character_list(rows: &[(&str, u32)]) -> Vec<u8> {
        const RECORD: usize = 164;
        let name_offset = 8 + rows.len() * RECORD;
        let mut pool = format!("{CHARACTER_LIST}\0").into_bytes();
        let mut body = Vec::new();
        for (code, hash) in rows {
            let mut record = vec![0u8; RECORD];
            let pointer = (name_offset + pool.len()) as u32;
            pool.extend_from_slice(code.as_bytes());
            pool.push(0);
            record[UNIT_CODE_COLUMN..UNIT_CODE_COLUMN + 4].copy_from_slice(&pointer.to_be_bytes());
            record[UNIT_ARCHIVE_COLUMN..UNIT_ARCHIVE_COLUMN + 4].copy_from_slice(&hash.to_be_bytes());
            body.extend_from_slice(&record);
        }
        let mut out = (name_offset as u32).to_be_bytes().to_vec();
        out.extend_from_slice(&(rows.len() as u16).to_be_bytes());
        out.extend_from_slice(&0u16.to_be_bytes());
        out.extend(body);
        out.extend(pool);
        out
    }

    #[test]
    fn units_come_from_the_extracted_character_list() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = dir.path().join("ws");
        assert!(content_names(Some(&workspace)).iter().all(|name| name.source != UNIT_NAME_SOURCE));

        let mut document = FhmDocument::default();
        let rows = [("F1011", 0xC454_40B9), ("F1021", 0x4D48_23D2), ("F1011", 0xC454_40B9)];
        document.add_entry(&[], LOAD_NORMAL, character_list(&rows)).unwrap();
        let source = dir.path().join("EB3A9691.fhm");
        std::fs::write(&source, document.to_bytes().unwrap()).unwrap();
        let report = extract_into_workspace(&source, &workspace, None, &ExtractOptions::default()).unwrap();
        assert!(report.package_dir.replace('\\', "/").ends_with("common/list_info"));

        let units = character_list_units(&workspace);
        let found: Vec<(String, u32)> = units.iter().map(|unit| (unit.relative_dir(), unit.hash)).collect();
        assert_eq!(found, [("unit/F1011".to_string(), 0xC454_40B9), ("unit/F1021".to_string(), 0x4D48_23D2)]);

        let index = content_index(None, Some(&workspace));
        let names = names::book().len();
        assert_eq!(index.items.len(), names + 2);
        let list_pack = index.items.iter().find(|item| item.hash == "EB3A9691").unwrap();
        assert_eq!(list_pack.packages.len(), 1, "the extracted list pack is linked to its package");
        assert!(index.items.iter().all(|item| item.source_path.is_none()), "no game folder given");
    }
}
