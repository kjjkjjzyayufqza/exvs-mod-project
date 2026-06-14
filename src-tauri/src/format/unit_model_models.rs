//! Unit-model model-level mutations (add / remove) on the canonical `_structure.json`.
//!
//! Structure surgery works on a nested view of `SubFileStructure` (Folder / Item, with EndMark
//! delimiting) and re-serializes a fresh flat list with recomputed `folderCount`s and one EndMark per
//! folder close. The packer expands EndMarks and remaps `fileIndex` values itself
//! (`build_file_index_remap`), so we keep original `fileIndex` values stable (gaps are fine) and only
//! need the tree's Item references to point at entries that still exist in `SubFileData`.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};
use ssbh_data::hlpb_data::HlpbData;
use ssbh_data::prelude::MatlData;
use ssbh_data::prelude::{MeshData, ModlData, SkelData};

use crate::format::fhm2d::SubFileStructureEntry;
use crate::jnttbl_format::parse_jnttbl_bytes;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelMutationResult {
    pub model_root: String,
    pub structure_json_path: String,
    pub model_count: usize,
    pub total_files: usize,
    pub removed_files: Vec<String>,
}

enum Node {
    Folder {
        entry: SubFileStructureEntry,
        children: Vec<Node>,
    },
    Item {
        entry: SubFileStructureEntry,
        file_index: i32,
        name: Option<String>,
    },
}

enum Tok {
    Folder(SubFileStructureEntry),
    Item(SubFileStructureEntry, i32, Option<String>),
    End,
}

/// Remove a whole model (its folder of model files plus its paired nuhlpb), dropping any pool
/// entries that become unreferenced (model files and now-orphaned textures), and rewrite the
/// structure JSON. Returns the updated counts and the deleted file URLs.
pub fn remove_unit_model_model(
    model_root: &str,
    structure_json_path: Option<&str>,
    model_name: &str,
) -> Result<UnitModelMutationResult, String> {
    let root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let json_dir = structure_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();

    let raw = fs::read_to_string(&structure_path).map_err(|e| {
        format!(
            "Failed to read structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let mut value: Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "Failed to parse structure JSON {}: {e}",
            structure_path.display()
        )
    })?;

    let sub_file_data = value
        .get("SubFileData")
        .and_then(Value::as_array)
        .ok_or_else(|| "Structure JSON missing SubFileData array".to_string())?
        .clone();
    let sub_file_structure: Vec<SubFileStructureEntry> = serde_json::from_value(
        value
            .get("SubFileStructure")
            .cloned()
            .ok_or_else(|| "Structure JSON missing SubFileStructure".to_string())?,
    )
    .map_err(|e| format!("Failed to parse SubFileStructure: {e}"))?;

    let ext_by_index = build_ext_by_index(&sub_file_data);

    let mut root = parse_root(&sub_file_structure)?;
    let removed = remove_model_from_tree(&mut root, model_name, &ext_by_index)?;
    if !removed {
        return Err(format!(
            "Model '{model_name}' was not found in the structure."
        ));
    }

    let mut new_structure = Vec::new();
    serialize_node(&root, &mut new_structure);

    let referenced: HashSet<i32> = collect_referenced_indices(&new_structure);

    let mut removed_files = Vec::new();
    let mut new_sub_file_data = Vec::with_capacity(sub_file_data.len());
    for entry in &sub_file_data {
        let file_index = entry
            .get("fileIndex")
            .and_then(Value::as_i64)
            .map(|v| v as i32);
        match file_index {
            Some(idx) if referenced.contains(&idx) => {
                let mut kept = entry.clone();
                if let Some(obj) = kept.as_object_mut() {
                    obj.insert("index".to_string(), json!(new_sub_file_data.len()));
                }
                new_sub_file_data.push(kept);
            }
            _ => {
                if let Some(url) = entry.get("fileUrl").and_then(Value::as_str) {
                    removed_files.push(url.to_string());
                }
            }
        }
    }

    let model_count = count_model_groups(&root, &ext_by_index);

    let structure_value = serde_json::to_value(&new_structure)
        .map_err(|e| format!("Failed to serialize SubFileStructure: {e}"))?;
    let obj = value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object".to_string())?;
    obj.insert(
        "Fhm2dTotalCount".to_string(),
        json!(new_sub_file_data.len()),
    );
    obj.insert(
        "SubFileData".to_string(),
        Value::Array(new_sub_file_data.clone()),
    );
    obj.insert("SubFileStructure".to_string(), structure_value);

    let serialized = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    fs::write(&structure_path, format!("{serialized}\n"))
        .map_err(|e| format!("Failed to write {}: {e}", structure_path.display()))?;

    for url in &removed_files {
        delete_pool_file_if_safe(&root_path, &json_dir, url);
    }

    Ok(UnitModelMutationResult {
        model_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        model_count,
        total_files: new_sub_file_data.len(),
        removed_files,
    })
}

#[derive(Clone)]
struct SourceModel {
    model_name: String,
    numdlb: PathBuf,
    numshb: PathBuf,
    nusktb: PathBuf,
    jnttbl: PathBuf,
    numatbs: Vec<PathBuf>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelSourceValidation {
    pub source_dir: String,
    pub model_name: String,
    pub required_files: Vec<String>,
    pub texture_references: Vec<String>,
    pub source_textures_found: Vec<String>,
    pub texture_references_not_in_source: Vec<String>,
    pub ignored_source_nuhlpb: bool,
}

fn ext_lower(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_ascii_lowercase()))
        .unwrap_or_default()
}

fn scan_source_model(source_dir: &Path) -> Result<SourceModel, String> {
    if !source_dir.is_dir() {
        return Err(format!(
            "Source model folder is not a directory: {}",
            source_dir.display()
        ));
    }
    let mut by_extension: HashMap<String, Vec<PathBuf>> = HashMap::new();
    for entry in fs::read_dir(source_dir)
        .map_err(|e| format!("Failed to read source dir {}: {e}", source_dir.display()))?
    {
        let path = entry
            .map_err(|e| format!("Failed to read source entry: {e}"))?
            .path();
        if !path.is_file() {
            continue;
        }
        let extension = ext_lower(&path);
        if matches!(
            extension.as_str(),
            ".numdlb" | ".numshb" | ".nusktb" | ".jnttbl" | ".numatb" | ".nuhlpb"
        ) {
            by_extension.entry(extension).or_default().push(path);
        }
    }

    let exactly_one = |extension: &str| -> Result<PathBuf, String> {
        let files = by_extension
            .get(extension)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        match files {
            [file] => Ok(file.clone()),
            [] => Err(format!(
                "Source model folder is missing the required {extension} file."
            )),
            _ => Err(format!(
                "Source model folder must contain exactly one {extension} file, found {}.",
                files.len()
            )),
    }
    };

    let numdlb = exactly_one(".numdlb")?;
    let model_name = numdlb
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Cannot derive model name from numdlb filename.".to_string())?
        .to_string();
    let numshb = exactly_one(".numshb")?;
    let nusktb = exactly_one(".nusktb")?;
    let jnttbl = exactly_one(".jnttbl")?;

    let expected_named_file = |path: &Path, expected: &[String]| -> Result<(), String> {
        let actual = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");
        if expected
            .iter()
            .any(|candidate| actual.eq_ignore_ascii_case(candidate))
        {
            Ok(())
        } else {
            Err(format!(
                "Source model files must share the numdlb base name '{model_name}': expected one of [{}], found '{actual}'.",
                expected.join(", ")
            ))
        }
    };
    expected_named_file(
        &numshb,
        &[
            format!("{model_name}.numshb"),
            format!("{model_name}__maya__.numshb"),
        ],
    )?;
    expected_named_file(
        &nusktb,
        &[
            format!("{model_name}.nusktb"),
            format!("{model_name}__maya__.nusktb"),
        ],
    )?;
    expected_named_file(&jnttbl, &[format!("{model_name}.jnttbl")])?;

    let numatbs = by_extension.get(".numatb").cloned().unwrap_or_default();
    if numatbs.len() != 2 {
        return Err(format!(
            "Source model folder must contain exactly 2 .numatb files (__maya__ + __nust__), found {}.",
            numatbs.len()
        ));
    }
    let find_profile = |profile: &str| -> Result<PathBuf, String> {
        let expected = format!("{model_name}__{profile}__.numatb");
        numatbs
            .iter()
            .find(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.eq_ignore_ascii_case(&expected))
                    .unwrap_or(false)
            })
            .cloned()
            .ok_or_else(|| format!("Source model folder is missing '{expected}'."))
    };
    let maya_numatb = find_profile("maya")?;
    let nust_numatb = find_profile("nust")?;

    Ok(SourceModel {
        model_name,
        numdlb,
        numshb,
        nusktb,
        jnttbl,
        numatbs: vec![maya_numatb, nust_numatb],
    })
}

fn validate_source_model_contents(source: &SourceModel) -> Result<(), String> {
    let modl = ModlData::from_file(&source.numdlb)
        .map_err(|e| format!("Failed to parse numdlb {}: {e}", source.numdlb.display()))?;
    if !modl.model_name.trim().is_empty()
        && !modl.model_name.eq_ignore_ascii_case(&source.model_name)
    {
        return Err(format!(
            "numdlb model_name '{}' does not match filename base '{}'.",
            modl.model_name, source.model_name
        ));
    }
    MeshData::from_file(&source.numshb)
        .map_err(|e| format!("Failed to parse numshb {}: {e}", source.numshb.display()))?;
    let skel = SkelData::from_file(&source.nusktb)
        .map_err(|e| format!("Failed to parse nusktb {}: {e}", source.nusktb.display()))?;
    for numatb in &source.numatbs {
        MatlData::from_file(numatb)
            .map_err(|e| format!("Failed to parse numatb {}: {e}", numatb.display()))?;
    }
    let jnttbl_bytes = fs::read(&source.jnttbl)
        .map_err(|e| format!("Failed to read jnttbl {}: {e}", source.jnttbl.display()))?;
    let jnttbl = parse_jnttbl_bytes(&jnttbl_bytes)
        .map_err(|e| format!("Failed to parse jnttbl {}: {e}", source.jnttbl.display()))?;
    if jnttbl.bone_count as usize != skel.bones.len() {
        return Err(format!(
            "jnttbl bone_count {} does not match nusktb bone count {}.",
            jnttbl.bone_count,
            skel.bones.len()
        ));
    }
    Ok(())
}

pub fn validate_unit_model_source_folder(
    source_dir: &str,
) -> Result<UnitModelSourceValidation, String> {
    let source_path = PathBuf::from(source_dir.trim());
    let source = scan_source_model(&source_path)?;
    validate_source_model_contents(&source)?;

    let mut texture_references = Vec::new();
    let mut seen = HashSet::new();
    for numatb in &source.numatbs {
        for reference in numatb_texture_refs(numatb)? {
            if seen.insert(reference.to_ascii_lowercase()) {
                texture_references.push(reference);
            }
        }
    }
    let (source_textures_found, texture_references_not_in_source): (Vec<_>, Vec<_>) =
        texture_references
            .iter()
            .cloned()
            .partition(|reference| source_path.join(reference).is_file());

    Ok(UnitModelSourceValidation {
        source_dir: source_path.to_string_lossy().to_string(),
        model_name: source.model_name,
        required_files: [
            source.numdlb,
            source.numshb,
            source.nusktb,
            source.jnttbl,
            source.numatbs[0].clone(),
            source.numatbs[1].clone(),
        ]
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect(),
        texture_references,
        source_textures_found,
        texture_references_not_in_source,
        ignored_source_nuhlpb: by_extension_exists(&source_path, ".nuhlpb")?,
    })
}

fn by_extension_exists(source_dir: &Path, extension: &str) -> Result<bool, String> {
    for entry in fs::read_dir(source_dir)
        .map_err(|e| format!("Failed to read source dir {}: {e}", source_dir.display()))?
    {
        let path = entry
            .map_err(|e| format!("Failed to read source entry: {e}"))?
            .path();
        if path.is_file() && ext_lower(&path) == extension {
            return Ok(true);
        }
    }
    Ok(false)
}

fn numatb_texture_refs(path: &Path) -> Result<Vec<String>, String> {
    let bytes =
        fs::read(path).map_err(|e| format!("Failed to read numatb {}: {e}", path.display()))?;
    let matl = MatlData::read(&mut Cursor::new(bytes))
        .map_err(|e| format!("Failed to parse numatb {}: {e}", path.display()))?;
    let mut refs = Vec::new();
    let mut seen = HashSet::new();
    for entry in &matl.entries {
        for tex in entry
            .textures
            .iter()
            .map(|t| t.data.as_str())
            .chain(entry.textures2.iter().map(|t| t.data.as_str()))
        {
            let trimmed = tex.trim();
            if trimmed.is_empty() {
                continue;
            }
            let mut name = trimmed
                .replace('\\', "/")
                .split('/')
                .last()
                .unwrap_or(trimmed)
                .to_string();
            if !name.to_ascii_lowercase().ends_with(".nutexb") {
                name.push_str(".nutexb");
            }
            let key = name.to_ascii_lowercase();
            if key == ".nutexb" {
                continue;
            }
            if seen.insert(key) {
                refs.push(name);
            }
        }
    }
    Ok(refs)
}

fn make_item(file_index: i32, unk2: &str, unk3: i32, name: &str) -> SubFileStructureEntry {
    SubFileStructureEntry::Item {
        unk1: "00000000".to_string(),
        file_index,
        unk2: unk2.to_string(),
        unk2_1: 0,
        unk3,
        unk4: 0,
        original_file_index: file_index,
        display_name: Some(name.to_string()),
    }
}

fn make_folder(unk3: i32, unk5: i32) -> SubFileStructureEntry {
    SubFileStructureEntry::Folder {
        unk1: "00000000".to_string(),
        folder_count: 0,
        unk2: "00000000".to_string(),
        unk2_1: 0,
        unk3,
        unk4: 0,
        unk5,
        unk6: 0,
    }
}

fn find_models_container<'a>(
    root: &'a mut Node,
    ext_by_index: &HashMap<i32, String>,
) -> Option<&'a mut Vec<Node>> {
    let Node::Folder { children, .. } = root else {
        return None;
    };
    for child in children.iter_mut() {
        if let Node::Folder {
            children: inner, ..
        } = child
        {
            if inner
                .iter()
                .any(|c| folder_has_direct_ext(c, ".numdlb", ext_by_index))
            {
                if let Node::Folder {
                    children: inner_mut,
                    ..
                } = child
                {
                    return Some(inner_mut);
                }
            }
        }
    }
    None
}

fn find_nuhlpb_folder<'a>(
    root: &'a mut Node,
    ext_by_index: &HashMap<i32, String>,
) -> Option<&'a mut Vec<Node>> {
    let Node::Folder { children, .. } = root else {
        return None;
    };
    for child in children.iter_mut() {
        if let Node::Folder {
            children: inner, ..
        } = child
        {
            let all_nuhlpb = !inner.is_empty()
                && inner.iter().all(|c| {
                    matches!(c, Node::Item { file_index, .. }
                    if ext_by_index.get(file_index).map(String::as_str) == Some(".nuhlpb"))
                });
            if all_nuhlpb {
                if let Node::Folder {
                    children: inner_mut,
                    ..
                } = child
                {
                    return Some(inner_mut);
                }
            }
        }
    }
    None
}

fn stem(filename: &str) -> String {
    match filename.rfind('.') {
        Some(idx) if idx > 0 => filename[..idx].to_string(),
        _ => filename.to_string(),
    }
}

/// Add a whole model from a source folder (numdlb/numshb/nusktb/two numatbs/jnttbl + referenced
/// nutexb files) into the package: copies files into the layout, dedups textures into the shared
/// pool, synthesizes a texture container per numatb, appends the model group with a fresh empty
/// nuhlpb entry, and rewrites the structure JSON.
pub fn add_unit_model_model(
    model_root: &str,
    structure_json_path: Option<&str>,
    source_dir: &str,
) -> Result<UnitModelMutationResult, String> {
    let root_path = validate_dir(model_root)?;
    let structure_path = resolve_structure_path(&root_path, structure_json_path)?;
    let out_name = root_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid model root: {}", root_path.display()))?
        .to_string();
    let source = scan_source_model(Path::new(source_dir.trim()))?;
    validate_source_model_contents(&source)?;

    let raw = fs::read_to_string(&structure_path).map_err(|e| {
        format!(
            "Failed to read structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let mut value: Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "Failed to parse structure JSON {}: {e}",
            structure_path.display()
        )
    })?;
    let mut sub_file_data = value
        .get("SubFileData")
        .and_then(Value::as_array)
        .ok_or_else(|| "Structure JSON missing SubFileData array".to_string())?
        .clone();
    let sub_file_structure: Vec<SubFileStructureEntry> = serde_json::from_value(
        value
            .get("SubFileStructure")
            .cloned()
            .ok_or_else(|| "Structure JSON missing SubFileStructure".to_string())?,
    )
    .map_err(|e| format!("Failed to parse SubFileStructure: {e}"))?;

    let ext_by_index = build_ext_by_index(&sub_file_data);
    let mut root = parse_root(&sub_file_structure)?;

    // Reject duplicate model name.
    if count_model_named(&root, &source.model_name, &ext_by_index) {
        return Err(format!(
            "A model named '{}' already exists in the package.",
            source.model_name
        ));
    }

    let mut next_file_index = sub_file_data
        .iter()
        .filter_map(|e| e.get("fileIndex").and_then(Value::as_i64))
        .max()
        .unwrap_or(-1) as i32;
    let mut copies: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut tex_index: HashMap<String, i32> = sub_file_data
        .iter()
        .filter(|e| {
            e.get("fileUrl")
                .and_then(Value::as_str)
                .map(|u| file_basename(u).to_ascii_lowercase().ends_with(".nutexb"))
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let idx = e.get("fileIndex").and_then(Value::as_i64)? as i32;
            let url = e.get("fileUrl").and_then(Value::as_str)?;
            Some((file_basename(url).to_ascii_lowercase(), idx))
        })
        .collect();

    let make_url = |rel: &str| format!(".\\{out_name}\\{}", rel.replace('/', "\\"));
    let model_rel_dir = format!("models\\{}", source.model_name);

    // Helper that copies a model file and registers a fresh pool entry.
    let add_pool_file = |src: &Path,
                             rel_dir: &str,
                             file_type: &str,
                             sub_file_data: &mut Vec<Value>,
                             copies: &mut Vec<(PathBuf, PathBuf)>,
                             next_file_index: &mut i32|
     -> Result<i32, String> {
        let filename = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("Invalid source file: {}", src.display()))?
            .to_string();
        *next_file_index += 1;
        let fi = *next_file_index;
        let url = make_url(&format!("{rel_dir}/{filename}"));
        let dst = root_path.join(rel_dir.replace('\\', "/")).join(&filename);
        copies.push((src.to_path_buf(), dst));
        sub_file_data.push(json!({
            "index": sub_file_data.len(),
            "fileType": file_type,
            "fileIndex": fi,
            "fileUrl": url,
            "fileBaseName": stem(&filename),
        }));
        Ok(fi)
    };

    let nusktb_fi = add_pool_file(
        &source.nusktb,
        &model_rel_dir,
        ".nusktb",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;
    let numshb_fi = add_pool_file(
        &source.numshb,
        &model_rel_dir,
        ".numshb",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;
    let numdlb_fi = add_pool_file(
        &source.numdlb,
        &model_rel_dir,
        ".numdlb",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;
    let jnttbl_fi = add_pool_file(
        &source.jnttbl,
        &model_rel_dir,
        ".jnttbl",
        &mut sub_file_data,
        &mut copies,
        &mut next_file_index,
    )?;

    let mut group_children: Vec<Node> = Vec::new();
    group_children.push(Node::Item {
        entry: make_item(nusktb_fi, "10000000", 0, &source.model_name),
        file_index: nusktb_fi,
        name: Some(source.model_name.clone()),
    });

    for (i, numatb_path) in source.numatbs.iter().enumerate() {
        let variant = (i + 1) as i32;
        let refs = numatb_texture_refs(numatb_path)?;
        let mut container_children = Vec::new();
        for tex_name in &refs {
            let key = tex_name.to_ascii_lowercase();
            let fi = if let Some(existing) = tex_index.get(&key) {
                *existing
            } else {
                let src_tex = Path::new(source_dir.trim()).join(tex_name);
                if !src_tex.is_file() {
                    return Err(format!(
                        "numatb '{}' references texture '{}' which is not in the pool or source folder.",
                        numatb_path.display(),
                        tex_name
                    ));
                }
                let fi = add_pool_file(
                    &src_tex,
                    "textures",
                    ".nutexb",
                    &mut sub_file_data,
                    &mut copies,
                    &mut next_file_index,
                )?;
                tex_index.insert(key, fi);
                fi
            };
            container_children.push(Node::Item {
                entry: make_item(fi, "00000000", 0, &stem(tex_name)),
                file_index: fi,
                name: Some(stem(tex_name)),
            });
        }
        group_children.push(Node::Folder {
            entry: make_folder(32, variant),
            children: container_children,
        });
        let numatb_filename = numatb_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("model.numatb");
        let numatb_fi = add_pool_file(
            numatb_path,
            &model_rel_dir,
            ".numatb",
            &mut sub_file_data,
            &mut copies,
            &mut next_file_index,
        )?;
        group_children.push(Node::Item {
            entry: make_item(numatb_fi, "21000000", variant, &stem(numatb_filename)),
            file_index: numatb_fi,
            name: Some(stem(numatb_filename)),
        });
    }

    group_children.push(Node::Item {
        entry: make_item(numshb_fi, "30000000", 0, &source.model_name),
        file_index: numshb_fi,
        name: Some(source.model_name.clone()),
    });
    group_children.push(Node::Item {
        entry: make_item(numdlb_fi, "40000000", 0, &source.model_name),
        file_index: numdlb_fi,
        name: Some(source.model_name.clone()),
    });
    group_children.push(Node::Item {
        entry: make_item(jnttbl_fi, "50000000", 0, &source.model_name),
        file_index: jnttbl_fi,
        name: Some(source.model_name.clone()),
    });

    let model_group = Node::Folder {
        entry: make_folder(0, 0),
        children: group_children,
    };

    // Every imported model receives a fresh empty NUHLPB. Model-specific source
    // constraints are intentionally not carried into a different package.
    let nuhlpb_filename = format!("{}.nuhlpb", source.model_name);
    let nuhlpb_dst = root_path.join("nuhlpb").join(&nuhlpb_filename);
    let empty_nuhlpb_dir =
        tempfile::tempdir().map_err(|e| format!("Failed to create empty NUHLPB temp dir: {e}"))?;
    let nuhlpb_src = empty_nuhlpb_dir.path().join(&nuhlpb_filename);
    write_empty_nuhlpb(&nuhlpb_src)?;
    next_file_index += 1;
    let nuhlpb_fi = next_file_index;
    copies.push((nuhlpb_src, nuhlpb_dst));
    sub_file_data.push(json!({
        "index": sub_file_data.len(),
        "fileType": ".nuhlpb",
        "fileIndex": nuhlpb_fi,
        "fileUrl": make_url(&format!("nuhlpb/{nuhlpb_filename}")),
        "fileBaseName": source.model_name,
    }));

    // Insert into the tree.
    {
        let models = find_models_container(&mut root, &ext_by_index)
            .ok_or_else(|| "Could not locate the models container in the structure.".to_string())?;
        models.push(model_group);
    }
    {
        let nuhlpb_folder = find_nuhlpb_folder(&mut root, &ext_by_index)
            .ok_or_else(|| "Could not locate the nuhlpb folder in the structure.".to_string())?;
        nuhlpb_folder.push(Node::Item {
            entry: make_item(nuhlpb_fi, "00000000", 0, &source.model_name),
            file_index: nuhlpb_fi,
            name: Some(source.model_name.clone()),
        });
    }

    let mut new_structure = Vec::new();
    serialize_node(&root, &mut new_structure);
    let structure_value = serde_json::to_value(&new_structure)
        .map_err(|e| format!("Failed to serialize SubFileStructure: {e}"))?;

    // Reindex the positional `index` field.
    for (i, entry) in sub_file_data.iter_mut().enumerate() {
        if let Some(obj) = entry.as_object_mut() {
            obj.insert("index".to_string(), json!(i));
        }
    }

    // Count using an ext map that includes the freshly added pool entries.
    let final_ext = build_ext_by_index(&sub_file_data);
    let model_count = count_model_groups(&root, &final_ext);
    let total_files = sub_file_data.len();
    let obj = value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object".to_string())?;
    obj.insert("Fhm2dTotalCount".to_string(), json!(total_files));
    obj.insert("SubFileData".to_string(), Value::Array(sub_file_data));
    obj.insert("SubFileStructure".to_string(), structure_value);

    let serialized = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    let created_files = copy_files_with_rollback(&copies)?;
    if let Err(error) = replace_structure_json(&structure_path, &format!("{serialized}\n")) {
        cleanup_created_files(&created_files);
        return Err(error);
    }

    Ok(UnitModelMutationResult {
        model_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        model_count,
        total_files,
        removed_files: Vec::new(),
    })
}

fn write_empty_nuhlpb(path: &Path) -> Result<(), String> {
    let hlpb = HlpbData {
        major_version: 1,
        minor_version: 1,
        aim_constraints: Vec::new(),
        orient_constraints: Vec::new(),
    };
    hlpb.write_to_file(path)
        .map_err(|e| format!("Failed to write empty NUHLPB {}: {e}", path.display()))
}

fn copy_files_with_rollback(copies: &[(PathBuf, PathBuf)]) -> Result<Vec<PathBuf>, String> {
    let mut destinations = HashSet::new();
    for (source, destination) in copies {
        if !source.is_file() {
            return Err(format!("Source file does not exist: {}", source.display()));
        }
        let key = destination.to_string_lossy().to_ascii_lowercase();
        if !destinations.insert(key) {
            return Err(format!(
                "Multiple imported files resolve to the same destination: {}",
                destination.display()
            ));
        }
        if destination.exists() {
            return Err(format!(
                "Import destination already exists and will not be overwritten: {}",
                destination.display()
            ));
        }
    }

    let mut created_files = Vec::new();
    for (source, destination) in copies {
        if let Some(parent) = destination.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                cleanup_created_files(&created_files);
                return Err(format!("Failed to create {}: {error}", parent.display()));
            }
        }
        if let Err(error) = fs::copy(source, destination) {
            cleanup_created_files(&created_files);
            return Err(format!(
                "Failed to copy {} -> {}: {error}",
                source.display(),
                destination.display()
            ));
        }
        created_files.push(destination.clone());
    }
    Ok(created_files)
}

fn replace_structure_json(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Structure JSON has no parent directory: {}", path.display()))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|e| format!("Failed to create structure JSON temp file: {e}"))?;
    temp.write_all(contents.as_bytes())
        .map_err(|e| format!("Failed to write structure JSON temp file: {e}"))?;
    temp.flush()
        .map_err(|e| format!("Failed to flush structure JSON temp file: {e}"))?;
    let (_, temp_path) = temp
        .keep()
        .map_err(|e| format!("Failed to preserve structure JSON temp file: {e}"))?;
    let backup_path = parent.join(format!(
        ".{}.unit-model-import-backup",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("structure.json")
    ));
    if backup_path.exists() {
        fs::remove_file(&backup_path)
            .map_err(|e| format!("Failed to remove stale structure backup: {e}"))?;
    }
    fs::rename(path, &backup_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed to prepare structure JSON replacement: {e}")
    })?;
    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::rename(&backup_path, path);
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed to replace structure JSON: {error}"));
    }
    let _ = fs::remove_file(&backup_path);
    Ok(())
}

fn cleanup_created_files(files: &[PathBuf]) {
    for path in files.iter().rev() {
        let _ = fs::remove_file(path);
    }
}

fn count_model_named(root: &Node, model_name: &str, ext_by_index: &HashMap<i32, String>) -> bool {
    fn walk(node: &Node, name: &str, ext: &HashMap<i32, String>) -> bool {
        match node {
            Node::Item { .. } => false,
            Node::Folder { children, .. } => {
                if folder_has_direct_ext(node, ".numdlb", ext)
                    && model_group_name(node, ext).as_deref() == Some(name)
                {
                    return true;
                }
                children.iter().any(|c| walk(c, name, ext))
            }
        }
    }
    walk(root, model_name, ext_by_index)
}

fn build_ext_by_index(sub_file_data: &[Value]) -> std::collections::HashMap<i32, String> {
    let mut map = std::collections::HashMap::new();
    for entry in sub_file_data {
        let Some(idx) = entry.get("fileIndex").and_then(Value::as_i64) else {
            continue;
        };
        let url = entry.get("fileUrl").and_then(Value::as_str).unwrap_or("");
        let ft = entry.get("fileType").and_then(Value::as_str).unwrap_or("");
        map.insert(idx as i32, extension_of(ft, url));
    }
    map
}

fn extension_of(file_type: &str, file_url: &str) -> String {
    let ft = file_type.trim().to_ascii_lowercase();
    if ft.starts_with('.') {
        return ft;
    }
    let name = file_basename(file_url);
    match name.rfind('.') {
        Some(idx) => name[idx..].to_ascii_lowercase(),
        None => String::new(),
    }
}

fn file_basename(file_url: &str) -> String {
    file_url
        .replace('/', "\\")
        .split('\\')
        .filter(|s| !s.is_empty() && *s != ".")
        .last()
        .unwrap_or(file_url)
        .to_string()
}

fn tokenize(entries: &[SubFileStructureEntry]) -> Vec<Tok> {
    let mut out = Vec::with_capacity(entries.len());
    for entry in entries {
        match entry {
            SubFileStructureEntry::Folder { .. } => out.push(Tok::Folder(entry.clone())),
            SubFileStructureEntry::Item {
                file_index,
                display_name,
                ..
            } => out.push(Tok::Item(entry.clone(), *file_index, display_name.clone())),
            SubFileStructureEntry::EndMark { end_mark_count } => {
                for _ in 0..(*end_mark_count).max(0) {
                    out.push(Tok::End);
                }
            }
        }
    }
    out
}

fn parse_root(entries: &[SubFileStructureEntry]) -> Result<Node, String> {
    let toks = tokenize(entries);
    let mut cursor = 0usize;
    let mut top = parse_level(&toks, &mut cursor);
    if top.len() != 1 {
        return Err(format!(
            "Expected a single root folder in SubFileStructure, found {}",
            top.len()
        ));
    }
    match top.pop().unwrap() {
        node @ Node::Folder { .. } => Ok(node),
        Node::Item { .. } => Err("Root of SubFileStructure is not a folder".to_string()),
    }
}

fn parse_level(toks: &[Tok], cursor: &mut usize) -> Vec<Node> {
    let mut out = Vec::new();
    while *cursor < toks.len() {
        match &toks[*cursor] {
            Tok::Folder(entry) => {
                let entry = entry.clone();
                *cursor += 1;
                let children = parse_level(toks, cursor);
                out.push(Node::Folder { entry, children });
            }
            Tok::Item(entry, file_index, name) => {
                out.push(Node::Item {
                    entry: entry.clone(),
                    file_index: *file_index,
                    name: name.clone(),
                });
                *cursor += 1;
            }
            Tok::End => {
                *cursor += 1;
                return out;
            }
        }
    }
    out
}

fn serialize_node(node: &Node, out: &mut Vec<SubFileStructureEntry>) {
    match node {
        Node::Item { entry, .. } => out.push(entry.clone()),
        Node::Folder { entry, children } => {
            let mut folder = entry.clone();
            if let SubFileStructureEntry::Folder { folder_count, .. } = &mut folder {
                *folder_count = children.len() as i32;
            }
            out.push(folder);
            for child in children {
                serialize_node(child, out);
            }
            out.push(SubFileStructureEntry::EndMark { end_mark_count: 1 });
        }
    }
}

fn collect_referenced_indices(entries: &[SubFileStructureEntry]) -> HashSet<i32> {
    entries
        .iter()
        .filter_map(|e| match e {
            SubFileStructureEntry::Item { file_index, .. } => Some(*file_index),
            _ => None,
        })
        .collect()
}

fn folder_has_direct_ext(
    node: &Node,
    ext: &str,
    ext_by_index: &std::collections::HashMap<i32, String>,
) -> bool {
    let Node::Folder { children, .. } = node else {
        return false;
    };
    children.iter().any(|c| match c {
        Node::Item { file_index, .. } => {
            ext_by_index.get(file_index).map(String::as_str) == Some(ext)
        }
        Node::Folder { .. } => false,
    })
}

fn model_group_name(
    node: &Node,
    ext_by_index: &std::collections::HashMap<i32, String>,
) -> Option<String> {
    let Node::Folder { children, .. } = node else {
        return None;
    };
    for c in children {
        if let Node::Item {
            file_index, name, ..
        } = c
        {
            if ext_by_index.get(file_index).map(String::as_str) == Some(".numdlb") {
                return name.clone();
            }
        }
    }
    None
}

fn count_model_groups(root: &Node, ext_by_index: &std::collections::HashMap<i32, String>) -> usize {
    fn walk(node: &Node, ext: &std::collections::HashMap<i32, String>) -> usize {
        match node {
            Node::Item { .. } => 0,
            Node::Folder { children, .. } => {
                let self_is_model = folder_has_direct_ext(node, ".numdlb", ext);
                let nested: usize = children.iter().map(|c| walk(c, ext)).sum();
                (if self_is_model { 1 } else { 0 }) + nested
            }
        }
    }
    walk(root, ext_by_index)
}

/// Remove the named model group (and its paired nuhlpb item) from the tree in place.
fn remove_model_from_tree(
    root: &mut Node,
    model_name: &str,
    ext_by_index: &std::collections::HashMap<i32, String>,
) -> Result<bool, String> {
    let Node::Folder { children, .. } = root else {
        return Ok(false);
    };

    let mut removed_model = false;
    for child in children.iter_mut() {
        if let Node::Folder {
            children: group_children,
            ..
        } = child
        {
            let before = group_children.len();
            group_children.retain(|mg| {
                let is_target = folder_has_direct_ext(mg, ".numdlb", ext_by_index)
                    && model_group_name(mg, ext_by_index).as_deref() == Some(model_name);
                !is_target
            });
            if group_children.len() != before {
                removed_model = true;
            }
        }
    }

    if removed_model {
        for child in children.iter_mut() {
            if let Node::Folder {
                children: folder_children,
                ..
            } = child
            {
                folder_children.retain(|item| match item {
                    Node::Item {
                        file_index, name, ..
                    } => {
                        let is_nuhlpb =
                            ext_by_index.get(file_index).map(String::as_str) == Some(".nuhlpb");
                        !(is_nuhlpb && name.as_deref() == Some(model_name))
                    }
                    Node::Folder { .. } => true,
                });
            }
        }
    }

    Ok(removed_model)
}

fn validate_dir(model_root: &str) -> Result<PathBuf, String> {
    let trimmed = model_root.trim();
    if trimmed.is_empty() {
        return Err("model_root cannot be empty.".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_dir() {
        return Err(format!(
            "Unit model root is not a directory: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn resolve_structure_path(model_root: &Path, explicit: Option<&str>) -> Result<PathBuf, String> {
    if let Some(p) = explicit {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    let parent = model_root.parent().ok_or_else(|| {
        format!(
            "Cannot infer structure JSON path from {}",
            model_root.display()
        )
    })?;
    let name = model_root
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| {
            format!(
                "Cannot infer structure JSON path from {}",
                model_root.display()
            )
        })?;
    Ok(parent.join(format!("{name}_structure.json")))
}

fn delete_pool_file_if_safe(model_root: &Path, json_dir: &Path, file_url: &str) {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    let target = json_dir.join(cleaned);
    let (Ok(root), Ok(resolved)) = (fs::canonicalize(model_root), fs::canonicalize(&target)) else {
        return;
    };
    if resolved.starts_with(&root) {
        let _ = fs::remove_file(&resolved);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_required_layout(root: &Path, base: &str) {
        for name in [
            format!("{base}.numdlb"),
            format!("{base}.numshb"),
            format!("{base}.nusktb"),
            format!("{base}.jnttbl"),
            format!("{base}__maya__.numatb"),
            format!("{base}__nust__.numatb"),
        ] {
            fs::write(root.join(name), b"stub").unwrap();
        }
    }

    #[test]
    fn source_layout_requires_exact_maya_and_nust_profiles() {
        let temp = tempfile::tempdir().unwrap();
        write_required_layout(temp.path(), "model");
        fs::rename(
            temp.path().join("model__nust__.numatb"),
            temp.path().join("model__other__.numatb"),
        )
        .unwrap();

        let error = scan_source_model(temp.path()).err().unwrap();

        assert!(error.contains("model__nust__.numatb"), "{error}");
    }

    #[test]
    fn source_layout_rejects_duplicate_core_files() {
        let temp = tempfile::tempdir().unwrap();
        write_required_layout(temp.path(), "model");
        fs::write(temp.path().join("duplicate.numshb"), b"stub").unwrap();

        let error = scan_source_model(temp.path()).err().unwrap();

        assert!(error.contains("exactly one .numshb"), "{error}");
    }

    #[test]
    fn source_layout_requires_matching_core_basenames() {
        let temp = tempfile::tempdir().unwrap();
        write_required_layout(temp.path(), "model");
        fs::rename(
            temp.path().join("model.jnttbl"),
            temp.path().join("other.jnttbl"),
        )
        .unwrap();

        let error = scan_source_model(temp.path()).err().unwrap();

        assert!(error.contains("model.jnttbl"), "{error}");
    }

    #[test]
    fn source_layout_accepts_original_maya_mesh_and_skeleton_names() {
        let temp = tempfile::tempdir().unwrap();
        write_required_layout(temp.path(), "model");
        fs::rename(
            temp.path().join("model.numshb"),
            temp.path().join("model__maya__.numshb"),
        )
        .unwrap();
        fs::rename(
            temp.path().join("model.nusktb"),
            temp.path().join("model__maya__.nusktb"),
        )
        .unwrap();

        let source = scan_source_model(temp.path()).unwrap();

        assert_eq!(source.model_name, "model");
    }

    #[test]
    fn generated_empty_nuhlpb_has_no_constraints() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("model.nuhlpb");

        write_empty_nuhlpb(&path).unwrap();
        let parsed = HlpbData::from_file(&path).unwrap();

        assert_eq!(parsed.major_version, 1);
        assert_eq!(parsed.minor_version, 1);
        assert!(parsed.aim_constraints.is_empty());
        assert!(parsed.orient_constraints.is_empty());
        assert_eq!(fs::metadata(path).unwrap().len(), 88);
    }

    #[test]
    fn copy_plan_does_not_overwrite_existing_destination() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.bin");
        let destination = temp.path().join("destination.bin");
        fs::write(&source, b"new").unwrap();
        fs::write(&destination, b"existing").unwrap();

        let error = copy_files_with_rollback(&[(source, destination.clone())])
            .err()
            .unwrap();

        assert!(error.contains("will not be overwritten"), "{error}");
        assert_eq!(fs::read(destination).unwrap(), b"existing");
    }

    #[test]
    fn real_original_unit_model_folder_validates_when_sample_is_present() {
        let root = Path::new(r"E:\XB\解包\com\file\0xAF73362C");
        let base = "026gnbelt_002nitngl_001_body_normal";
        let names = [
            format!("{base}.numdlb"),
            format!("{base}__maya__.numshb"),
            format!("{base}__maya__.nusktb"),
            format!("{base}.jnttbl"),
            format!("{base}__maya__.numatb"),
            format!("{base}__nust__.numatb"),
        ];
        if names.iter().any(|name| !root.join(name).is_file()) {
            eprintln!("SKIP: real original Unit model files are not present.");
            return;
        }
        let temp = tempfile::tempdir().unwrap();
        for name in names {
            fs::copy(root.join(&name), temp.path().join(name)).unwrap();
        }

        let validation =
            validate_unit_model_source_folder(temp.path().to_string_lossy().as_ref()).unwrap();

        assert_eq!(validation.model_name, base);
        assert_eq!(validation.required_files.len(), 6);
    }
}
