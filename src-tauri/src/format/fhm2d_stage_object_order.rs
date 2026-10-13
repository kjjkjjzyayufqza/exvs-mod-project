//! Pack order of a stage's content-level object folders.
//!
//! `VDK_OBJECTNUMBER` in placement.csv is an object's index in pack order
//! (base excluded, sky last). Vanilla pack order is not alphabetical by the
//! extracted folder names: Side7 puts `201stage201_obj_gutter` and
//! `201stage201_obj_steelfloor` after every `201stage201_object_*`, and 203
//! puts `house01a_after` before `house01_before`. Sorting folders by name
//! therefore points placements at the wrong models; a `*_break` model placed
//! as a plain object crashes the game in `hkndDestructionSystem`.
//!
//! The order lives in the stage's structure JSON (written in pack order by the
//! extractor and by every rebuild). Folders it does not list are new and go
//! after the recorded ones, alphabetically.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::format::fhm2d::SubFileStructureEntry;
use crate::format::fhm2d_stage::{
    build_file_index_disk_path_map, find_info_dir, find_structure_json_path,
    rebuild_structure_with_object_order, resolve_content_root, resolve_pack_root,
    stage_rename_in_memory_numatb_based, STAGE_BASE_NAME, STAGE_INFO_NAME, STAGE_SKY_NAME,
    STAGE_TEXTURES_NAME,
};

const MODEL_ITEM_UNK2_PREFIX: &str = "40";

#[derive(Deserialize)]
struct StructureOrderJson {
    #[serde(rename = "SubFileData")]
    sub_file_data: Vec<StructureOrderFile>,
    #[serde(rename = "SubFileStructure")]
    sub_file_structure: Vec<SubFileStructureEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StructureOrderFile {
    file_index: i32,
    file_url: String,
}

/// One content-level object folder and its `VDK_OBJECTNUMBER`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct StageObjectFolder {
    pub name: String,
    pub object_number: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageObjectOrderRestore {
    pub structure_path: String,
    /// Object folders whose number changed, as `name: old -> new`.
    pub moved: Vec<String>,
    /// Folders on disk the vanilla pack does not have; kept after vanilla objects.
    pub added: Vec<String>,
    /// Vanilla objects with no folder on disk.
    pub missing: Vec<String>,
}

/// Content-level object folders in pack order, sky last, with their object numbers.
pub(crate) fn stage_object_folders(stage_root: &Path) -> Result<Vec<StageObjectFolder>, String> {
    let content_root = resolve_content_root(stage_root);
    let recorded = recorded_object_folder_order(&resolve_pack_root(stage_root))?;
    let ordered = order_object_folders(&content_root, &recorded)?;
    let has_sky = content_root.join(STAGE_SKY_NAME).is_dir();
    let mut folders: Vec<StageObjectFolder> = ordered
        .into_iter()
        .enumerate()
        .map(|(object_number, name)| StageObjectFolder {
            name,
            object_number,
        })
        .collect();
    if has_sky {
        folders.push(StageObjectFolder {
            name: STAGE_SKY_NAME.to_string(),
            object_number: folders.len(),
        });
    }
    Ok(folders)
}

/// Rank of each content-level object folder (lowercase name) for the packer.
pub(crate) fn object_folder_ranks(stage_root: &Path) -> Result<HashMap<String, usize>, String> {
    Ok(stage_object_folders(stage_root)?
        .into_iter()
        .map(|folder| (folder.name.to_ascii_lowercase(), folder.object_number))
        .collect())
}

/// Object folders the structure JSON lists, in pack order. Empty without a JSON.
pub(crate) fn recorded_object_folder_order(pack_root: &Path) -> Result<Vec<String>, String> {
    let Some(path) = find_structure_json_path(pack_root) else {
        return Ok(Vec::new());
    };
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    let json: StructureOrderJson = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse {}: {e}", path.display()))?;
    let urls: HashMap<i32, String> = json
        .sub_file_data
        .into_iter()
        .map(|file| (file.file_index, file.file_url))
        .collect();
    let paths = model_item_indices(&json.sub_file_structure)
        .filter_map(|index| urls.get(&index))
        .map(|url| {
            // `.\<pack>\0\0\<folder>\...` -> `0/0/<folder>/...`
            url.replace('\\', "/")
                .trim_start_matches("./")
                .splitn(2, '/')
                .nth(1)
                .unwrap_or_default()
                .to_string()
        });
    Ok(object_folders_from_paths(paths))
}

/// Object folder order of a packed stage, named the way the stage extractor names them.
pub(crate) fn object_folder_order_from_fhm2d(fhm2d_path: &Path) -> Result<Vec<String>, String> {
    let bytes = fs::read(fhm2d_path)
        .map_err(|e| format!("Failed to read {}: {e}", fhm2d_path.display()))?;
    let source_name = fhm2d_path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_default();
    let extraction = crate::format::fhm2d::extract_fhm2d_to_memory_impl(&bytes, &source_name, None)?;
    let (tree, _) =
        stage_rename_in_memory_numatb_based(&extraction.files, &extraction.sub_file_structure)?;
    let disk_paths = build_file_index_disk_path_map(&tree);
    let paths = model_item_indices(&extraction.sub_file_structure)
        .filter_map(|index| disk_paths.get(&index).cloned());
    Ok(object_folders_from_paths(paths))
}

/// Rewrite the stage's structure JSON in the vanilla pack's object order.
pub fn restore_stage_object_order(
    stage_root: &str,
    vanilla_fhm2d: &str,
) -> Result<StageObjectOrderRestore, String> {
    let stage_root = Path::new(stage_root);
    let before = stage_object_folders(stage_root)?;
    let vanilla = object_folder_order_from_fhm2d(Path::new(vanilla_fhm2d))?;
    if vanilla.is_empty() {
        return Err(format!("{vanilla_fhm2d} holds no stage object folders"));
    }

    let content_root = resolve_content_root(stage_root);
    let on_disk = object_folders_on_disk(&content_root)?;
    let lower_on_disk: Vec<String> = on_disk.iter().map(|n| n.to_ascii_lowercase()).collect();
    let missing: Vec<String> = vanilla
        .iter()
        .filter(|name| !lower_on_disk.contains(&name.to_ascii_lowercase()))
        .cloned()
        .collect();
    if missing.len() == vanilla.len() {
        return Err(format!(
            "None of the {} vanilla object folders of {vanilla_fhm2d} exist under {}; this \
             stage folder was not extracted from that pack",
            vanilla.len(),
            content_root.display()
        ));
    }
    let ordered = order_object_folders(&content_root, &vanilla)?;
    let added: Vec<String> = ordered
        .iter()
        .filter(|name| {
            !vanilla
                .iter()
                .any(|v| v.eq_ignore_ascii_case(name.as_str()))
        })
        .cloned()
        .collect();

    let structure_path =
        rebuild_structure_with_object_order(&resolve_pack_root(stage_root), &ordered)?;

    let after = stage_object_folders(stage_root)?;
    let old_numbers: HashMap<&str, usize> = before
        .iter()
        .map(|f| (f.name.as_str(), f.object_number))
        .collect();
    let moved = after
        .iter()
        .filter_map(|f| {
            let old = *old_numbers.get(f.name.as_str())?;
            (old != f.object_number).then(|| format!("{}: {old} -> {}", f.name, f.object_number))
        })
        .collect();

    Ok(StageObjectOrderRestore {
        structure_path,
        moved,
        added,
        missing,
    })
}

/// `recorded` folders present on disk first, then the rest alphabetically.
fn order_object_folders(content_root: &Path, recorded: &[String]) -> Result<Vec<String>, String> {
    let mut remaining = object_folders_on_disk(content_root)?;
    let mut ordered = Vec::with_capacity(remaining.len());
    for name in recorded {
        if let Some(pos) = remaining
            .iter()
            .position(|disk| disk.eq_ignore_ascii_case(name))
        {
            ordered.push(remaining.remove(pos));
        }
    }
    ordered.extend(remaining);
    Ok(ordered)
}

/// Content-level object folders on disk (not base/info/textures/sky), sorted by name.
fn object_folders_on_disk(content_root: &Path) -> Result<Vec<String>, String> {
    let info_name = find_info_dir(content_root)
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()));
    let mut names: Vec<String> = fs::read_dir(content_root)
        .map_err(|e| format!("Failed to read {}: {e}", content_root.display()))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|name| {
            !is_reserved_folder(name) && Some(name.as_str()) != info_name.as_deref()
        })
        .collect();
    names.sort();
    Ok(names)
}

fn is_reserved_folder(name: &str) -> bool {
    [STAGE_BASE_NAME, STAGE_INFO_NAME, STAGE_TEXTURES_NAME, STAGE_SKY_NAME].contains(&name)
}

fn model_item_indices(entries: &[SubFileStructureEntry]) -> impl Iterator<Item = i32> + '_ {
    entries.iter().filter_map(|entry| match entry {
        SubFileStructureEntry::Item {
            file_index, unk2, ..
        } if unk2.starts_with(MODEL_ITEM_UNK2_PREFIX) => Some(*file_index),
        _ => None,
    })
}

/// First-seen content-level folder of each `0/0/<folder>/...` path.
fn object_folders_from_paths(paths: impl Iterator<Item = String>) -> Vec<String> {
    let mut order: Vec<String> = Vec::new();
    for path in paths {
        let parts: Vec<&str> = path.split('/').collect();
        let [first, second, folder, ..] = parts.as_slice() else {
            continue;
        };
        if *first != "0" || *second != "0" || is_reserved_folder(folder) {
            continue;
        }
        if !order.iter().any(|known| known == folder) {
            order.push((*folder).to_string());
        }
    }
    order
}
