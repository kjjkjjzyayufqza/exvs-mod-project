//! What one stage model folder may hold, shared by the packer and the validator.
//!
//! `ModelDataSet::SetupNewFormat` (sub_1402EE420) walks every item of a model
//! folder and throws `LocalException` from its `default:` case on any type it
//! does not load; the stage load then dies on a null read. Survey of four
//! vanilla OB stage packs (127 model folders): every folder holds exactly one
//! skeleton (0x10), one mesh (0x30), one model (0x40) and one joint table
//! (0x50), optionally two material containers (folder 0x20 + numatb 0x21 each)
//! and up to one animation per role (0x60 / 0x61). 111 skeletons have no bones;
//! 16 animated props do. Every joint table is 0 bytes with fileType `.bin`, so
//! the extractor writes it as `<index>.bin`.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::format::fhm2d::SubFileStructureEntry;
use crate::format::fhm2d_stage::{collect_sorted_entries, ext_of, StageAnimRole};

const SKELETON_UNK2: &str = "10000000";
const MATERIAL_UNK2: &str = "21000000";
const MESH_UNK2: &str = "30000000";
const MODEL_UNK2: &str = "40000000";
const JOINT_TABLE_UNK2: &str = "50000000";

/// Item types `SetupNewFormat` loads; 0x20 is the material texture folder.
const SETUP_NEW_FORMAT_ITEM_TYPES: [u8; 7] = [0x10, 0x21, 0x30, 0x40, 0x50, 0x60, 0x61];
const TEXTURE_CONTAINER_FOLDER_TYPE: i32 = 0x20;

/// One file the game loads from a stage model folder.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum StageModelFile {
    Skeleton,
    Material,
    Mesh,
    Model,
    JointTable,
    Animation(StageAnimRole),
}

impl StageModelFile {
    pub(crate) fn unk2(self) -> &'static str {
        match self {
            Self::Skeleton => SKELETON_UNK2,
            Self::Material => MATERIAL_UNK2,
            Self::Mesh => MESH_UNK2,
            Self::Model => MODEL_UNK2,
            Self::JointTable => JOINT_TABLE_UNK2,
            Self::Animation(role) => role.unk2(),
        }
    }

    pub(crate) fn unk3(self) -> i32 {
        match self {
            Self::Animation(role) => role.unk3(),
            _ => 0,
        }
    }
}

/// A problem in one stage model folder that would crash the game on load.
#[derive(Clone, Debug)]
pub(crate) struct StageModelFolderIssue {
    pub path: PathBuf,
    pub message: String,
}

/// A folder is a stage model when it holds a skeleton or a model file.
pub(crate) fn is_stage_model_folder(packable_files: &[PathBuf]) -> bool {
    packable_files
        .iter()
        .any(|file| matches!(file_ext(file).as_str(), ".nusktb" | ".numdlb"))
}

/// Classify one packable file of a stage model folder; `None` means the game
/// cannot load it there.
pub(crate) fn classify_stage_model_file(
    path: &Path,
    anim_roles: &HashMap<PathBuf, StageAnimRole>,
) -> Result<Option<StageModelFile>, String> {
    if let Some(role) = anim_roles.get(path) {
        return Ok(Some(StageModelFile::Animation(*role)));
    }
    let kind = match file_ext(path).as_str() {
        ".nusktb" => Some(StageModelFile::Skeleton),
        ".numatb" => Some(StageModelFile::Material),
        ".numshb" => Some(StageModelFile::Mesh),
        ".numdlb" => Some(StageModelFile::Model),
        ".jnttbl" => Some(StageModelFile::JointTable),
        ".bin" if file_len(path)? == 0 => Some(StageModelFile::JointTable),
        _ => None,
    };
    Ok(kind)
}

/// Every problem in every stage model folder under `root`.
pub(crate) fn collect_stage_model_folder_issues(
    root: &Path,
    anim_roles: &HashMap<PathBuf, StageAnimRole>,
) -> Result<Vec<StageModelFolderIssue>, String> {
    let mut issues = Vec::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let (dirs, files) = collect_sorted_entries(&dir);
        pending.extend(dirs);
        if is_stage_model_folder(&files) {
            let folder = dir
                .strip_prefix(root)
                .unwrap_or(&dir)
                .to_string_lossy()
                .replace('\\', "/");
            check_model_folder(&dir, &folder, &files, anim_roles, &mut issues)?;
        }
    }
    issues.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(issues)
}

/// Fail with every model-folder problem under `root`, one per line.
pub(crate) fn ensure_stage_model_folders_packable(
    root: &Path,
    anim_roles: &HashMap<PathBuf, StageAnimRole>,
) -> Result<(), String> {
    let issues = collect_stage_model_folder_issues(root, anim_roles)?;
    if issues.is_empty() {
        return Ok(());
    }
    let lines: Vec<String> = issues
        .iter()
        .map(|issue| format!("- {} ({})", issue.message, issue.path.display()))
        .collect();
    Err(format!(
        "{} stage model folder problem(s) block packing:\n{}",
        issues.len(),
        lines.join("\n")
    ))
}

/// Describe the first model folder of a structure JSON whose items the game
/// cannot load, so an earlier broken pack layout is never preserved.
pub(crate) fn structure_model_folder_type_error(
    entries: &[SubFileStructureEntry],
) -> Result<Option<String>, String> {
    // One frame per open folder: (direct item types, direct child folder types).
    let mut frames: Vec<(Vec<(i32, u8)>, Vec<i32>)> = vec![(Vec::new(), Vec::new())];
    for entry in entries {
        match entry {
            SubFileStructureEntry::Folder { unk3, .. } => {
                if let Some(frame) = frames.last_mut() {
                    frame.1.push(*unk3);
                }
                frames.push((Vec::new(), Vec::new()));
            }
            SubFileStructureEntry::Item {
                file_index, unk2, ..
            } => {
                let item_type = item_type_of(unk2)?;
                if let Some(frame) = frames.last_mut() {
                    frame.0.push((*file_index, item_type));
                }
            }
            SubFileStructureEntry::EndMark { end_mark_count } => {
                for _ in 0..*end_mark_count {
                    let Some((items, folders)) = frames.pop() else {
                        return Err("Structure JSON closes more folders than it opens".into());
                    };
                    if let Some(message) = model_folder_type_error(&items, &folders) {
                        return Ok(Some(message));
                    }
                }
            }
        }
    }
    Ok(None)
}

fn model_folder_type_error(items: &[(i32, u8)], folders: &[i32]) -> Option<String> {
    let is_model_folder = items.iter().any(|(_, t)| *t == 0x10 || *t == 0x40);
    if !is_model_folder {
        return None;
    }
    if let Some((file_index, item_type)) = items
        .iter()
        .find(|(_, t)| !SETUP_NEW_FORMAT_ITEM_TYPES.contains(t))
    {
        return Some(format!(
            "model folder item fileIndex {file_index} has type 0x{item_type:02X}, which the \
             game's ModelDataSet::SetupNewFormat rejects"
        ));
    }
    folders
        .iter()
        .find(|t| **t != TEXTURE_CONTAINER_FOLDER_TYPE)
        .map(|t| {
            format!(
                "model folder holds a sub-folder of type 0x{t:02X}; only material texture \
                 folders (0x20) load there"
            )
        })
}

fn item_type_of(unk2: &str) -> Result<u8, String> {
    unk2.get(..2)
        .and_then(|hex| u8::from_str_radix(hex, 16).ok())
        .ok_or_else(|| format!("Structure item unk2 '{unk2}' is not a hex type tag"))
}

/// `folder` is the model folder path relative to the pack root, for messages.
fn check_model_folder(
    dir: &Path,
    folder: &str,
    files: &[PathBuf],
    anim_roles: &HashMap<PathBuf, StageAnimRole>,
    issues: &mut Vec<StageModelFolderIssue>,
) -> Result<(), String> {
    let mut by_kind: Vec<(StageModelFile, &PathBuf)> = Vec::new();
    for file in files {
        match classify_stage_model_file(file, anim_roles)? {
            Some(kind) => by_kind.push((kind, file)),
            None => issues.push(StageModelFolderIssue {
                path: file.clone(),
                message: format!(
                    "Model '{folder}': '{}' cannot live in a stage model folder. The game only \
                     loads .nusktb, .numatb, .numshb, .numdlb, one empty joint table (.jnttbl, or \
                     the extractor's 0-byte <index>.bin) and SSBH animations there; this file \
                     would be packed as item type 0 and crash the stage load. Delete it or move \
                     it out of the folder.",
                    file_label(file)
                ),
            }),
        }
    }

    let of_kind = |kind: StageModelFile| -> Vec<&PathBuf> {
        by_kind
            .iter()
            .filter(|(k, _)| *k == kind)
            .map(|(_, f)| *f)
            .collect()
    };
    for (kind, label) in [
        (StageModelFile::Skeleton, "skeleton (.nusktb)"),
        (StageModelFile::Mesh, "mesh (.numshb)"),
        (StageModelFile::Model, "model (.numdlb)"),
    ] {
        let found = of_kind(kind);
        if found.len() != 1 {
            issues.push(StageModelFolderIssue {
                path: dir.to_path_buf(),
                message: format!(
                    "Model '{folder}': needs exactly one {label}, found {}{}. Every vanilla stage \
                     model has one, even a static prop whose skeleton has no bones.",
                    found.len(),
                    list_suffix(&found)
                ),
            });
        }
    }

    let joint_tables = of_kind(StageModelFile::JointTable);
    if joint_tables.len() > 1 {
        issues.push(StageModelFolderIssue {
            path: dir.to_path_buf(),
            message: format!(
                "Model '{folder}': has {} joint tables{}. A stage model holds one empty joint \
                 table; an extracted pack names it '<index>.bin'. Keep one and delete the rest.",
                joint_tables.len(),
                list_suffix(&joint_tables)
            ),
        });
    }
    for table in &joint_tables {
        let len = file_len(table)?;
        if len != 0 {
            issues.push(StageModelFolderIssue {
                path: (*table).clone(),
                message: format!(
                    "Model '{folder}': joint table '{}' is {len} bytes. Stage models carry no \
                     joint data; every vanilla stage joint table is empty (0 bytes).",
                    file_label(table)
                ),
            });
        }
    }
    Ok(())
}

fn list_suffix(files: &[&PathBuf]) -> String {
    if files.is_empty() {
        return String::new();
    }
    let names: Vec<String> = files.iter().map(|f| file_label(f)).collect();
    format!(": {}", names.join(", "))
}

fn file_ext(path: &Path) -> String {
    path.file_name()
        .map(|name| ext_of(&name.to_string_lossy()))
        .unwrap_or_default()
}

fn file_label(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

fn file_len(path: &Path) -> Result<u64, String> {
    fs::metadata(path)
        .map(|meta| meta.len())
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))
}
