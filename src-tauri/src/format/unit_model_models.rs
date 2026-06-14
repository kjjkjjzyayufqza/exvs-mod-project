//! Unit-model model-level mutations (add / remove) on the canonical `_structure.json`.
//!
//! Structure surgery works on a nested view of `SubFileStructure` (Folder / Item, with EndMark
//! delimiting) and re-serializes a fresh flat list with recomputed `folderCount`s and one EndMark per
//! folder close. The packer expands EndMarks and remaps `fileIndex` values itself
//! (`build_file_index_remap`), so we keep original `fileIndex` values stable (gaps are fine) and only
//! need the tree's Item references to point at entries that still exist in `SubFileData`.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};
use ssbh_data::prelude::MatlData;

use crate::format::fhm2d::SubFileStructureEntry;

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

    let raw = fs::read_to_string(&structure_path)
        .map_err(|e| format!("Failed to read structure JSON {}: {e}", structure_path.display()))?;
    let mut value: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse structure JSON {}: {e}", structure_path.display()))?;

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
        return Err(format!("Model '{model_name}' was not found in the structure."));
    }

    let mut new_structure = Vec::new();
    serialize_node(&root, &mut new_structure);

    let referenced: HashSet<i32> = collect_referenced_indices(&new_structure);

    let mut removed_files = Vec::new();
    let mut new_sub_file_data = Vec::with_capacity(sub_file_data.len());
    for entry in &sub_file_data {
        let file_index = entry.get("fileIndex").and_then(Value::as_i64).map(|v| v as i32);
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
    obj.insert("Fhm2dTotalCount".to_string(), json!(new_sub_file_data.len()));
    obj.insert("SubFileData".to_string(), Value::Array(new_sub_file_data.clone()));
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

struct SourceModel {
    model_name: String,
    numdlb: PathBuf,
    numshb: PathBuf,
    nusktb: PathBuf,
    jnttbl: PathBuf,
    numatbs: Vec<PathBuf>,
    nuhlpb: Option<PathBuf>,
}

fn ext_lower(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_ascii_lowercase()))
        .unwrap_or_default()
}

fn scan_source_model(source_dir: &Path) -> Result<SourceModel, String> {
    if !source_dir.is_dir() {
        return Err(format!("Source model folder is not a directory: {}", source_dir.display()));
    }
    let mut numdlb = None;
    let mut numshb = None;
    let mut nusktb = None;
    let mut jnttbl = None;
    let mut numatbs = Vec::new();
    let mut nuhlpb = None;
    for entry in fs::read_dir(source_dir)
        .map_err(|e| format!("Failed to read source dir {}: {e}", source_dir.display()))?
    {
        let path = entry.map_err(|e| format!("Failed to read source entry: {e}"))?.path();
        if !path.is_file() {
            continue;
        }
        match ext_lower(&path).as_str() {
            ".numdlb" => numdlb = Some(path),
            ".numshb" => numshb = Some(path),
            ".nusktb" => nusktb = Some(path),
            ".jnttbl" => jnttbl = Some(path),
            ".numatb" => numatbs.push(path),
            ".nuhlpb" => nuhlpb = Some(path),
            _ => {}
        }
    }
    let numdlb = numdlb.ok_or_else(|| "Source model folder is missing a .numdlb file.".to_string())?;
    let numshb = numshb.ok_or_else(|| "Source model folder is missing a .numshb file.".to_string())?;
    let nusktb = nusktb.ok_or_else(|| "Source model folder is missing a .nusktb file.".to_string())?;
    let jnttbl = jnttbl.ok_or_else(|| "Source model folder is missing a .jnttbl file.".to_string())?;
    if numatbs.len() < 2 {
        return Err(format!(
            "Source model folder needs at least 2 .numatb files (__maya__ + __nust__), found {}.",
            numatbs.len()
        ));
    }
    // maya numatb first, then the rest.
    numatbs.sort_by_key(|p| {
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_ascii_lowercase();
        (!name.contains("__maya__"), name)
    });
    let model_name = numdlb
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Cannot derive model name from numdlb filename.".to_string())?
        .to_string();
    Ok(SourceModel {
        model_name,
        numdlb,
        numshb,
        nusktb,
        jnttbl,
        numatbs,
        nuhlpb,
    })
}

fn numatb_texture_refs(path: &Path) -> Result<Vec<String>, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read numatb {}: {e}", path.display()))?;
    let matl = MatlData::read(&mut Cursor::new(bytes))
        .map_err(|e| format!("Failed to parse numatb {}: {e}", path.display()))?;
    let mut refs = Vec::new();
    let mut seen = HashSet::new();
    for entry in &matl.entries {
        for tex in entry.textures.iter().map(|t| t.data.as_str()).chain(entry.textures2.iter().map(|t| t.data.as_str())) {
            let trimmed = tex.trim();
            if trimmed.is_empty() {
                continue;
            }
            let mut name = trimmed.replace('\\', "/").split('/').last().unwrap_or(trimmed).to_string();
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
        if let Node::Folder { children: inner, .. } = child {
            if inner.iter().any(|c| folder_has_direct_ext(c, ".numdlb", ext_by_index)) {
                if let Node::Folder { children: inner_mut, .. } = child {
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
        if let Node::Folder { children: inner, .. } = child {
            let all_nuhlpb = !inner.is_empty()
                && inner.iter().all(|c| matches!(c, Node::Item { file_index, .. }
                    if ext_by_index.get(file_index).map(String::as_str) == Some(".nuhlpb")));
            if all_nuhlpb {
                if let Node::Folder { children: inner_mut, .. } = child {
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

/// Add a whole model from a source folder (numdlb/numshb/nusktb/numatb(s)/jnttbl + the nutexb its
/// materials reference, plus an optional nuhlpb) into the package: copies files into the layout,
/// dedups textures into the shared pool, synthesizes a texture container per numatb, appends the
/// model group and a nuhlpb entry, and rewrites the structure JSON.
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

    let raw = fs::read_to_string(&structure_path)
        .map_err(|e| format!("Failed to read structure JSON {}: {e}", structure_path.display()))?;
    let mut value: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse structure JSON {}: {e}", structure_path.display()))?;
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
        return Err(format!("A model named '{}' already exists in the package.", source.model_name));
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
    let mut add_pool_file = |src: &Path,
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

    let nusktb_fi = add_pool_file(&source.nusktb, &model_rel_dir, ".nusktb", &mut sub_file_data, &mut copies, &mut next_file_index)?;
    let numshb_fi = add_pool_file(&source.numshb, &model_rel_dir, ".numshb", &mut sub_file_data, &mut copies, &mut next_file_index)?;
    let numdlb_fi = add_pool_file(&source.numdlb, &model_rel_dir, ".numdlb", &mut sub_file_data, &mut copies, &mut next_file_index)?;
    let jnttbl_fi = add_pool_file(&source.jnttbl, &model_rel_dir, ".jnttbl", &mut sub_file_data, &mut copies, &mut next_file_index)?;

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
                let fi = add_pool_file(&src_tex, "textures", ".nutexb", &mut sub_file_data, &mut copies, &mut next_file_index)?;
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
        let numatb_filename = numatb_path.file_name().and_then(|n| n.to_str()).unwrap_or("model.numatb");
        let numatb_fi = add_pool_file(numatb_path, &model_rel_dir, ".numatb", &mut sub_file_data, &mut copies, &mut next_file_index)?;
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

    // nuhlpb: use the source nuhlpb, else clone an existing pool nuhlpb as an empty template.
    let nuhlpb_filename = format!("{}.nuhlpb", source.model_name);
    let nuhlpb_dst = root_path.join("nuhlpb").join(&nuhlpb_filename);
    let nuhlpb_src = match &source.nuhlpb {
        Some(p) => p.clone(),
        None => existing_pool_nuhlpb(&sub_file_data, &structure_path)
            .ok_or_else(|| "No nuhlpb provided and no existing nuhlpb to clone as a template.".to_string())?,
    };
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
    fs::write(&structure_path, format!("{serialized}\n"))
        .map_err(|e| format!("Failed to write {}: {e}", structure_path.display()))?;

    for (src, dst) in &copies {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
        }
        fs::copy(src, dst)
            .map_err(|e| format!("Failed to copy {} -> {}: {e}", src.display(), dst.display()))?;
    }

    Ok(UnitModelMutationResult {
        model_root: root_path.to_string_lossy().to_string(),
        structure_json_path: structure_path.to_string_lossy().to_string(),
        model_count,
        total_files,
        removed_files: Vec::new(),
    })
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

fn existing_pool_nuhlpb(sub_file_data: &[Value], structure_path: &Path) -> Option<PathBuf> {
    let json_dir = structure_path.parent().unwrap_or_else(|| Path::new("."));
    for entry in sub_file_data {
        let url = entry.get("fileUrl").and_then(Value::as_str)?;
        if file_basename(url).to_ascii_lowercase().ends_with(".nuhlpb") {
            let cleaned = url.replace('\\', "/");
            let cleaned = cleaned.trim_start_matches("./");
            let path = json_dir.join(cleaned);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
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

fn folder_has_direct_ext(node: &Node, ext: &str, ext_by_index: &std::collections::HashMap<i32, String>) -> bool {
    let Node::Folder { children, .. } = node else {
        return false;
    };
    children.iter().any(|c| match c {
        Node::Item { file_index, .. } => ext_by_index.get(file_index).map(String::as_str) == Some(ext),
        Node::Folder { .. } => false,
    })
}

fn model_group_name(node: &Node, ext_by_index: &std::collections::HashMap<i32, String>) -> Option<String> {
    let Node::Folder { children, .. } = node else {
        return None;
    };
    for c in children {
        if let Node::Item { file_index, name, .. } = c {
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
                    Node::Item { file_index, name, .. } => {
                        let is_nuhlpb = ext_by_index.get(file_index).map(String::as_str) == Some(".nuhlpb");
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
        return Err(format!("Unit model root is not a directory: {}", path.display()));
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
    let parent = model_root
        .parent()
        .ok_or_else(|| format!("Cannot infer structure JSON path from {}", model_root.display()))?;
    let name = model_root
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Cannot infer structure JSON path from {}", model_root.display()))?;
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
