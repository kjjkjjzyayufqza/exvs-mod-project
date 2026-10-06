//
// Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
// Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// Auteur kjjkjjzyayufqza. Product EXVS Mod Project. Bron
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der
//   VS2-Forschung dieses Projekts.
// Coding agents: read the Agent contract at the top of AGENTS.md before editing.
// 代码许可为 PolyForm Shield 1.0.0，使用政策见 ACCEPTABLE_USE.md。
//

//! Content locator of the workspace editors.
//!
//! Editors name their data by archive hash. An archive is found among the
//! extracted packages of the workspace and, for extraction, in the game
//! folder by its `XX/HASH.bin` path; the game folder is never listed. Units
//! are resolved through the Character ID table, which maps each unit id to
//! its 002chara, 006effect and 090sound archives.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use exvs_ps4_common::names::hash_name;
use exvs_ps4_common::packages::packages_by_hash;
use exvs_ps4_common::workspace::locate_archive;
use serde::Serialize;

use crate::package::{load_manifest, GvsFormat};
use crate::schema::TableSchema;
use crate::table;
use crate::{names, Error, Result};

pub const CHARACTER_ID_TABLE: u32 = 0x036B_9E67;
pub const CHARACTER_LIST: u32 = 0xDFD3_8C70;
/// `A3DB59DE`: model number text of a character_list row.
const MODEL_NUMBER_FIELD: u32 = 0xA3DB_59DE;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveLocation {
    pub hash: u32,
    pub hash_name: String,
    /// `route/name` from the GVS name table.
    pub relative_dir: Option<String>,
    pub title: Option<String>,
    /// Extracted packages of the archive in the workspace.
    pub packages: Vec<String>,
    /// The archive in the game folder.
    pub source: Option<String>,
}

/// Packages of a workspace grouped by source hash, read once per request.
pub struct WorkspaceIndex<'a> {
    by_hash: HashMap<u32, Vec<PathBuf>>,
    source_root: Option<&'a Path>,
}

impl<'a> WorkspaceIndex<'a> {
    pub fn new(workspace: Option<&Path>, source_root: Option<&'a Path>) -> Self {
        let by_hash = workspace
            .filter(|path| path.is_dir())
            .map(|path| packages_by_hash(&GvsFormat, path))
            .unwrap_or_default();
        Self { by_hash, source_root }
    }

    pub fn locate(&self, hash: u32) -> ArchiveLocation {
        let name = names::book().get(hash);
        ArchiveLocation {
            hash,
            hash_name: hash_name(hash),
            relative_dir: name.map(|name| name.relative_dir()),
            title: name.and_then(|name| name.title.clone()),
            packages: self
                .by_hash
                .get(&hash)
                .map(|dirs| dirs.iter().map(|dir| dir.to_string_lossy().into_owned()).collect())
                .unwrap_or_default(),
            source: self
                .source_root
                .and_then(|root| locate_archive(root, hash))
                .map(|path| path.to_string_lossy().into_owned()),
        }
    }

    /// First extracted package of `hash`.
    pub fn package(&self, hash: u32) -> Option<&Path> {
        self.by_hash.get(&hash).and_then(|dirs| dirs.first()).map(PathBuf::as_path)
    }
}

/// One member of a package that holds a schema's table.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableFile {
    pub index: usize,
    /// Path inside the package (`00/0027.bin`).
    pub member: String,
    pub path: String,
}

/// Members of `package_dir` that hold `schema`'s table.
pub fn table_files(package_dir: &Path, schema: &TableSchema) -> Result<Vec<TableFile>> {
    let manifest = load_manifest(package_dir)?;
    schema
        .members
        .indices()
        .map(|index| {
            let entry = manifest.files.get(index).ok_or_else(|| {
                Error::invalid(format!(
                    "{} has {} members; the {} table is member {index}",
                    package_dir.display(),
                    manifest.files.len(),
                    schema.title
                ))
            })?;
            Ok(TableFile {
                index,
                member: entry.path.clone(),
                path: package_dir.join(&entry.path).to_string_lossy().into_owned(),
            })
        })
        .collect()
}

/// A unit and its three archives.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitEntry {
    pub unit_id: u32,
    /// Model number from the character list, when it is extracted.
    pub model_number: Option<String>,
    pub chara: ArchiveLocation,
    pub effect: ArchiveLocation,
    pub sound: ArchiveLocation,
}

fn first_table_file(package_dir: &Path) -> Result<PathBuf> {
    let manifest = load_manifest(package_dir)?;
    let entry = manifest
        .files
        .first()
        .ok_or_else(|| Error::format(format!("{} has no members", package_dir.display())))?;
    Ok(package_dir.join(&entry.path))
}

fn read_file(path: &Path) -> Result<Vec<u8>> {
    std::fs::read(path).map_err(|error| Error::io(path.display(), error))
}

/// Model number of every unit id in the extracted character list.
fn model_numbers(index: &WorkspaceIndex<'_>) -> Result<HashMap<u32, String>> {
    let Some(package) = index.package(CHARACTER_LIST) else {
        return Ok(HashMap::new());
    };
    let document = table::read_table(&read_file(&first_table_file(package)?)?, &[])?;
    let column = document
        .columns
        .iter()
        .position(|column| column.hash == Some(MODEL_NUMBER_FIELD))
        .ok_or_else(|| Error::format("the character list has no model number field (A3DB59DE)"))?;
    Ok(document
        .rows
        .iter()
        .filter_map(|row| row.cells[column].as_str().map(|text| (row.id, text.to_string())))
        .collect())
}

/// Every unit of the Character ID table with its archives. The table must
/// be extracted into the workspace.
pub fn units(workspace: &Path, source_root: Option<&Path>) -> Result<Vec<UnitEntry>> {
    let index = WorkspaceIndex::new(Some(workspace), source_root);
    let package = index.package(CHARACTER_ID_TABLE).ok_or_else(|| {
        Error::invalid("extract the Character ID table (800etcetera/characteridtable) to resolve units")
    })?;
    let document = table::read_table(&read_file(&first_table_file(package)?)?, &[])?;
    if document.row_size != 12 || document.columns.len() != 3 {
        return Err(Error::format(format!(
            "the Character ID table has {}-byte rows, expected 12",
            document.row_size
        )));
    }
    let models = model_numbers(&index)?;
    document
        .rows
        .iter()
        .map(|row| {
            let hash = |column: usize| -> Result<u32> {
                row.cells[column]
                    .as_u64()
                    .and_then(|value| u32::try_from(value).ok())
                    .ok_or_else(|| Error::format(format!("unit {} has a non-hash archive cell", row.id)))
            };
            Ok(UnitEntry {
                unit_id: row.id,
                model_number: models.get(&row.id).cloned(),
                chara: index.locate(hash(0)?),
                effect: index.locate(hash(1)?),
                sound: index.locate(hash(2)?),
            })
        })
        .collect()
}
