use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelTextureEntry {
    pub id: String,
    pub index: usize,
    pub file_type: String,
    pub file_index: i32,
    pub file_url: String,
    pub filename: String,
    pub path: String,
    pub exists: bool,
    pub size_bytes: u64,
    pub internal_name: Option<String>,
    pub format: String,
    pub width: u32,
    pub height: u32,
    pub structure_ref_count: usize,
    pub numatb_reference_count: usize,
    pub referenced_by: Vec<String>,
    pub can_remove: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitModelTextureInventory {
    pub model_root: String,
    pub structure_json_path: String,
    pub textures: Vec<UnitModelTextureEntry>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct InputSubFileData {
    index: usize,
    file_type: String,
    file_index: i32,
    file_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_base_name: Option<String>,
}

struct StructureDocument {
    path: PathBuf,
    json_dir: PathBuf,
    value: Value,
    sub_file_data: Vec<InputSubFileData>,
}

pub fn list_unit_model_textures(
    model_root: &str,
    structure_json_path: Option<&str>,
) -> Result<UnitModelTextureInventory, String> {
    let model_root_path = validate_model_root(model_root)?;
    let doc = read_structure_document(&model_root_path, structure_json_path)?;
    Ok(build_inventory(&model_root_path, doc))
}

pub fn add_unit_model_nutexb(
    model_root: &str,
    structure_json_path: Option<&str>,
    source_path: &str,
    target_filename: &str,
) -> Result<UnitModelTextureInventory, String> {
    let model_root_path = validate_model_root(model_root)?;
    let mut doc = read_structure_document(&model_root_path, structure_json_path)?;
    let source = PathBuf::from(source_path.trim());
    if !source.is_file() {
        return Err(format!("Texture source is not a file: {}", source.display()));
    }
    let filename = sanitize_nutexb_filename(target_filename)?;
    ensure_texture_filename_available(&doc.sub_file_data, &filename)?;

    let target = model_root_path.join(&filename);
    if target.exists() {
        return Err(format!("Target texture already exists on disk: {}", target.display()));
    }
    fs::copy(&source, &target).map_err(|e| {
        format!(
            "Failed to copy texture {} -> {}: {e}",
            source.display(),
            target.display()
        )
    })?;

    let next_index = doc.sub_file_data.len();
    let next_file_index = doc
        .sub_file_data
        .iter()
        .map(|entry| entry.file_index)
        .max()
        .unwrap_or(-1)
        + 1;
    let file_url = file_url_for_target(&doc.json_dir, &target);
    doc.sub_file_data.push(InputSubFileData {
        index: next_index,
        file_type: ".nutexb".to_string(),
        file_index: next_file_index,
        file_url,
        file_base_name: Some(strip_nutexb_extension(&filename).to_string()),
    });
    reindex_sub_file_data(&mut doc.sub_file_data);
    write_sub_file_data(&mut doc)?;
    Ok(build_inventory(&model_root_path, doc))
}

pub fn remove_unit_model_nutexb(
    model_root: &str,
    structure_json_path: Option<&str>,
    file_index: i32,
) -> Result<UnitModelTextureInventory, String> {
    let model_root_path = validate_model_root(model_root)?;
    let mut doc = read_structure_document(&model_root_path, structure_json_path)?;
    let inventory = build_inventory(&model_root_path, doc.clone_for_inventory());
    let Some(texture) = inventory
        .textures
        .iter()
        .find(|entry| entry.file_index == file_index)
    else {
        return Err(format!("Texture fileIndex {file_index} was not found in SubFileData."));
    };
    if !texture.can_remove {
        return Err(format!(
            "Cannot remove '{}': it is still referenced by structure or numatb.",
            texture.filename
        ));
    }

    let remove_path = PathBuf::from(&texture.path);
    remove_texture_file_if_safe(&model_root_path, &remove_path)?;
    doc.sub_file_data.retain(|entry| entry.file_index != file_index);
    reindex_sub_file_data(&mut doc.sub_file_data);
    write_sub_file_data(&mut doc)?;
    Ok(build_inventory(&model_root_path, doc))
}

impl StructureDocument {
    fn clone_for_inventory(&self) -> Self {
        Self {
            path: self.path.clone(),
            json_dir: self.json_dir.clone(),
            value: self.value.clone(),
            sub_file_data: self.sub_file_data.clone(),
        }
    }
}

fn validate_model_root(model_root: &str) -> Result<PathBuf, String> {
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

fn resolve_structure_json_path(model_root: &Path, explicit: Option<&str>) -> Result<PathBuf, String> {
    let trimmed = explicit.unwrap_or_default().trim();
    if !trimmed.is_empty() {
        return Ok(PathBuf::from(trimmed));
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

fn read_structure_document(
    model_root: &Path,
    structure_json_path: Option<&str>,
) -> Result<StructureDocument, String> {
    let path = resolve_structure_json_path(model_root, structure_json_path)?;
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read structure JSON {}: {e}", path.display()))?;
    let value: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse structure JSON {}: {e}", path.display()))?;
    let sub_value = value
        .get("SubFileData")
        .cloned()
        .ok_or_else(|| format!("Structure JSON is missing SubFileData: {}", path.display()))?;
    let sub_file_data: Vec<InputSubFileData> = serde_json::from_value(sub_value)
        .map_err(|e| format!("Failed to parse SubFileData from {}: {e}", path.display()))?;
    let json_dir = path.parent().unwrap_or_else(|| Path::new(".")).to_path_buf();
    Ok(StructureDocument {
        path,
        json_dir,
        value,
        sub_file_data,
    })
}

fn write_sub_file_data(doc: &mut StructureDocument) -> Result<(), String> {
    let sub_value = serde_json::to_value(&doc.sub_file_data)
        .map_err(|e| format!("Failed to serialize SubFileData: {e}"))?;
    let obj = doc
        .value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object.".to_string())?;
    obj.insert(
        "Fhm2dTotalCount".to_string(),
        json!(doc.sub_file_data.len()),
    );
    obj.insert("SubFileData".to_string(), sub_value);
    let raw = serde_json::to_string_pretty(&doc.value)
        .map_err(|e| format!("Failed to serialize structure JSON: {e}"))?;
    fs::write(&doc.path, format!("{raw}\n"))
        .map_err(|e| format!("Failed to write structure JSON {}: {e}", doc.path.display()))
}

fn build_inventory(model_root: &Path, doc: StructureDocument) -> UnitModelTextureInventory {
    let mut warnings = Vec::new();
    let structure_refs = collect_structure_ref_counts(&doc.value);
    let numatb_refs = collect_numatb_references(&doc, &mut warnings);

    let mut textures: Vec<UnitModelTextureEntry> = doc
        .sub_file_data
        .iter()
        .filter(|entry| entry_is_nutexb(entry))
        .map(|entry| {
            let path = resolve_file_path(&doc.json_dir, &entry.file_url);
            let filename = file_basename(&entry.file_url);
            let metadata = fs::metadata(&path).ok();
            let exists = metadata.as_ref().is_some_and(|m| m.is_file());
            let size_bytes = metadata.map(|m| m.len()).unwrap_or(0);
            let info = if exists {
                match crate::nutexb_lib::read_nutexb_info(&path.to_string_lossy()) {
                    Ok(info) => Some(info),
                    Err(e) => {
                        warnings.push(format!("Failed to read nutexb info for {}: {e}", path.display()));
                        None
                    }
                }
            } else {
                None
            };
            let file_key = normalize_filename_key(&filename);
            let referenced_by = numatb_refs.get(&file_key).cloned().unwrap_or_default();
            let structure_ref_count = *structure_refs.get(&entry.file_index).unwrap_or(&0);
            let numatb_reference_count = referenced_by.len();
            UnitModelTextureEntry {
                id: format!("unit_tex_{}", entry.file_index),
                index: entry.index,
                file_type: entry.file_type.clone(),
                file_index: entry.file_index,
                file_url: entry.file_url.clone(),
                filename,
                path: path.to_string_lossy().to_string(),
                exists,
                size_bytes,
                internal_name: info.as_ref().map(|i| i.name.clone()),
                format: info
                    .as_ref()
                    .map(|i| i.image_format.clone())
                    .unwrap_or_else(|| "unknown".to_string()),
                width: info.as_ref().map(|i| i.width).unwrap_or(0),
                height: info.as_ref().map(|i| i.height).unwrap_or(0),
                structure_ref_count,
                numatb_reference_count,
                referenced_by,
                can_remove: structure_ref_count == 0 && numatb_reference_count == 0,
            }
        })
        .collect();

    textures.sort_by(|a, b| {
        a.filename
            .to_ascii_lowercase()
            .cmp(&b.filename.to_ascii_lowercase())
            .then(a.file_index.cmp(&b.file_index))
    });

    UnitModelTextureInventory {
        model_root: model_root.to_string_lossy().to_string(),
        structure_json_path: doc.path.to_string_lossy().to_string(),
        textures,
        warnings,
    }
}

fn collect_structure_ref_counts(value: &Value) -> HashMap<i32, usize> {
    let mut counts = HashMap::new();
    if let Some(entries) = value.get("SubFileStructure").and_then(Value::as_array) {
        for entry in entries {
            if entry.get("type").and_then(Value::as_str) != Some("Item") {
                continue;
            }
            if let Some(file_index) = entry.get("fileIndex").and_then(Value::as_i64) {
                *counts.entry(file_index as i32).or_insert(0) += 1;
            }
        }
    }
    counts
}

fn collect_numatb_references(
    doc: &StructureDocument,
    warnings: &mut Vec<String>,
) -> HashMap<String, Vec<String>> {
    let mut out: HashMap<String, Vec<String>> = HashMap::new();
    for entry in doc.sub_file_data.iter().filter(|entry| entry_is_ext(entry, ".numatb")) {
        let path = resolve_file_path(&doc.json_dir, &entry.file_url);
        let label = file_basename(&entry.file_url);
        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(e) => {
                warnings.push(format!("Failed to read numatb {}: {e}", path.display()));
                continue;
            }
        };
        let mut cursor = Cursor::new(bytes);
        let matl = match ssbh_data::prelude::MatlData::read(&mut cursor) {
            Ok(matl) => matl,
            Err(e) => {
                warnings.push(format!("Failed to parse numatb {}: {e}", path.display()));
                continue;
            }
        };
        let mut seen_for_file = HashSet::new();
        for mat in &matl.entries {
            for tex in &mat.textures {
                push_numatb_ref(tex.data.as_str(), &label, &mut seen_for_file, &mut out);
            }
            for tex in &mat.textures2 {
                push_numatb_ref(tex.data.as_str(), &label, &mut seen_for_file, &mut out);
            }
        }
    }
    for refs in out.values_mut() {
        refs.sort();
        refs.dedup();
    }
    out
}

fn push_numatb_ref(
    raw: &str,
    numatb_label: &str,
    seen_for_file: &mut HashSet<String>,
    out: &mut HashMap<String, Vec<String>>,
) {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return;
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
    let key = normalize_filename_key(&name);
    if key.is_empty() || key == ".nutexb" {
        return;
    }
    let scoped = format!("{numatb_label}:{key}");
    if seen_for_file.insert(scoped) {
        out.entry(key).or_default().push(numatb_label.to_string());
    }
}

fn entry_is_nutexb(entry: &InputSubFileData) -> bool {
    entry_is_ext(entry, ".nutexb")
}

fn entry_is_ext(entry: &InputSubFileData, ext: &str) -> bool {
    let filename = file_basename(&entry.file_url);
    filename.to_ascii_lowercase().ends_with(ext)
        || entry.file_type.eq_ignore_ascii_case(ext)
}

fn resolve_file_path(json_dir: &Path, file_url: &str) -> PathBuf {
    let cleaned = file_url.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches("./");
    json_dir.join(cleaned)
}

fn file_url_for_target(json_dir: &Path, target: &Path) -> String {
    let rel = target
        .strip_prefix(json_dir)
        .map(Path::to_path_buf)
        .unwrap_or_else(|_| target.to_path_buf());
    format!(".\\{}", rel.to_string_lossy().replace('/', "\\"))
}

fn file_basename(file_url: &str) -> String {
    file_url
        .replace('\\', "/")
        .split('/')
        .filter(|s| !s.is_empty() && *s != ".")
        .last()
        .unwrap_or(file_url)
        .to_string()
}

fn strip_nutexb_extension(filename: &str) -> &str {
    filename
        .strip_suffix(".nutexb")
        .or_else(|| filename.strip_suffix(".NUTEXB"))
        .unwrap_or(filename)
}

fn normalize_filename_key(filename: &str) -> String {
    file_basename(filename).to_ascii_lowercase()
}

fn sanitize_nutexb_filename(filename: &str) -> Result<String, String> {
    let raw = filename.trim();
    if raw.is_empty() {
        return Err("Texture filename cannot be empty.".to_string());
    }
    if raw.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        return Err(format!("Invalid texture filename: {raw}"));
    }
    let trimmed = file_basename(raw);
    if !trimmed.to_ascii_lowercase().ends_with(".nutexb") {
        return Err(format!("Texture filename must end with .nutexb: {trimmed}"));
    }
    Ok(trimmed)
}

fn ensure_texture_filename_available(
    sub_file_data: &[InputSubFileData],
    filename: &str,
) -> Result<(), String> {
    let key = normalize_filename_key(filename);
    if sub_file_data
        .iter()
        .filter(|entry| entry_is_nutexb(entry))
        .any(|entry| normalize_filename_key(&entry.file_url) == key)
    {
        return Err(format!("A texture named {filename} already exists in SubFileData."));
    }
    Ok(())
}

fn reindex_sub_file_data(entries: &mut [InputSubFileData]) {
    for (index, entry) in entries.iter_mut().enumerate() {
        entry.index = index;
    }
}

fn remove_texture_file_if_safe(model_root: &Path, path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let root = fs::canonicalize(model_root)
        .map_err(|e| format!("Failed to canonicalize model root {}: {e}", model_root.display()))?;
    let target = fs::canonicalize(path)
        .map_err(|e| format!("Failed to canonicalize texture {}: {e}", path.display()))?;
    if !target.starts_with(&root) {
        return Err(format!(
            "Refusing to delete texture outside unit root: {}",
            target.display()
        ));
    }
    fs::remove_file(&target)
        .map_err(|e| format!("Failed to delete texture {}: {e}", target.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_requires_plain_nutexb_filename() {
        assert_eq!(sanitize_nutexb_filename("foo.nutexb").unwrap(), "foo.nutexb");
        assert!(sanitize_nutexb_filename("folder\\foo.nutexb").is_err());
        assert!(sanitize_nutexb_filename("foo.png").is_err());
        assert!(sanitize_nutexb_filename("").is_err());
    }

    #[test]
    fn file_url_for_target_prefers_structure_relative_path() {
        let json_dir = Path::new(r"E:\XB\解包\com\file");
        let target = Path::new(r"E:\XB\解包\com\file\0xAF73362C\foo.nutexb");
        assert_eq!(
            file_url_for_target(json_dir, target),
            r".\0xAF73362C\foo.nutexb"
        );
    }
}
