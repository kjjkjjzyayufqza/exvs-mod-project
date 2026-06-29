use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fhm2dStructureMigrationAnalysis {
    pub structure_json_path: String,
    pub needs_migration: bool,
    pub name: Option<String>,
    pub hash_name: Option<String>,
    pub suggested_name: String,
    pub suggested_hash_name: Option<String>,
    pub root_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fhm2dStructureMigrationResult {
    pub old_structure_json_path: String,
    pub structure_json_path: String,
    pub old_root_path: Option<String>,
    pub root_path: Option<String>,
    pub name: String,
    pub hash_name: String,
    pub updated_file_url_count: usize,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Fhm2dStructureMetadata {
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "HashName")]
    pub hash_name: Option<String>,
}

pub fn sanitize_structure_name(input: &str) -> String {
    let mut out = String::new();
    let mut last_was_sep = false;
    for ch in input.trim().chars() {
        let mapped = if ch.is_ascii_alphanumeric() {
            Some(ch)
        } else if ch == '-' || ch == '_' {
            Some(ch)
        } else if ch.is_whitespace() || matches!(ch, '.' | '(' | ')' | '[' | ']') {
            Some('_')
        } else {
            None
        };

        if let Some(next) = mapped {
            let is_sep = next == '_' || next == '-';
            if is_sep && last_was_sep {
                continue;
            }
            out.push(next);
            last_was_sep = is_sep;
        }
    }

    let trimmed = out.trim_matches(['_', '-']).to_string();
    if trimmed.is_empty() {
        "fhm2d_pack".to_string()
    } else {
        trimmed
    }
}

pub fn normalize_hash_name(input: &str) -> Option<String> {
    let stem = strip_known_suffixes(input.trim());
    let bytes = stem.as_bytes();
    for i in 0..bytes.len() {
        if i + 10 <= bytes.len()
            && bytes[i] == b'0'
            && (bytes[i + 1] == b'x' || bytes[i + 1] == b'X')
            && bytes[i + 2..i + 10].iter().all(|b| b.is_ascii_hexdigit())
        {
            return Some(format!("0x{}", stem[i + 2..i + 10].to_ascii_uppercase()));
        }
        if i + 8 <= bytes.len() && bytes[i..i + 8].iter().all(|b| b.is_ascii_hexdigit()) {
            return Some(format!("0x{}", stem[i..i + 8].to_ascii_uppercase()));
        }
    }
    None
}

pub fn structure_stem(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(strip_known_suffixes)
}

fn derive_hash_name(source_name_or_path: &str, output_name: &str) -> Option<String> {
    normalize_hash_name(
        Path::new(source_name_or_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(source_name_or_path),
    )
    .or_else(|| normalize_hash_name(output_name))
}

pub fn metadata_from_source(source_name_or_path: &str, output_name: &str) -> (String, String) {
    let name = sanitize_structure_name(output_name);
    let hash_name = derive_hash_name(source_name_or_path, output_name)
        .unwrap_or_else(|| sanitize_structure_name(source_name_or_path));
    (name, hash_name)
}

pub fn metadata_from_source_strict(
    source_name_or_path: &str,
    output_name: &str,
) -> Result<(String, String), String> {
    let name = sanitize_structure_name(output_name);
    let hash_name = derive_hash_name(source_name_or_path, output_name).ok_or_else(|| {
        format!(
            "Cannot derive HashName from source \"{}\" or output \"{}\"; expected an 8-digit game hash",
            source_name_or_path, output_name
        )
    })?;
    Ok((name, hash_name))
}

pub fn analyze_structure_json(path: &Path) -> Result<Fhm2dStructureMigrationAnalysis, String> {
    let value = read_structure_value(path)?;
    let metadata = read_metadata(&value);
    let stem = structure_stem(path).unwrap_or_else(|| "fhm2d_pack".to_string());
    let suggested_name = metadata
        .name
        .as_deref()
        .map(sanitize_structure_name)
        .unwrap_or_else(|| sanitize_structure_name(&stem));
    let suggested_hash_name = metadata
        .hash_name
        .as_deref()
        .and_then(normalize_hash_name)
        .or_else(|| normalize_hash_name(&stem))
        .or_else(|| first_file_url_root(&value).and_then(|root| normalize_hash_name(&root)));
    let root_path = infer_existing_root_path(path, &value, &stem).map(display_path);

    Ok(Fhm2dStructureMigrationAnalysis {
        structure_json_path: display_path(path.to_path_buf()),
        needs_migration: metadata.name.is_none() || metadata.hash_name.is_none(),
        name: metadata.name,
        hash_name: metadata.hash_name,
        suggested_name,
        suggested_hash_name,
        root_path,
    })
}

pub fn migrate_structure_json(
    path: &Path,
    requested_name: &str,
) -> Result<Fhm2dStructureMigrationResult, String> {
    let mut value = read_structure_value(path)?;
    let metadata = read_metadata(&value);
    let old_stem = structure_stem(path).unwrap_or_else(|| "fhm2d_pack".to_string());
    let name = sanitize_structure_name(if requested_name.trim().is_empty() {
        metadata.name.as_deref().unwrap_or(&old_stem)
    } else {
        requested_name
    });
    let hash_name = metadata
        .hash_name
        .as_deref()
        .and_then(normalize_hash_name)
        .or_else(|| normalize_hash_name(&old_stem))
        .or_else(|| first_file_url_root(&value).and_then(|root| normalize_hash_name(&root)))
        .ok_or_else(|| {
            format!(
                "Cannot derive HashName from structure JSON path or fileUrl roots: {}",
                path.display()
            )
        })?;

    let parent = path
        .parent()
        .ok_or_else(|| format!("Structure JSON has no parent: {}", path.display()))?;
    let old_root = infer_existing_root_path(path, &value, &old_stem);
    let old_root_display = old_root.as_ref().map(|p| display_path(p.clone()));
    let new_root = parent.join(&name);

    if let Some(ref old_root_path) = old_root {
        if normalize_path_key(old_root_path) != normalize_path_key(&new_root) {
            if new_root.exists() {
                return Err(format!(
                    "Cannot migrate: target folder already exists: {}",
                    new_root.display()
                ));
            }
            fs::rename(old_root_path, &new_root).map_err(|e| {
                format!(
                    "Failed to rename folder {} -> {}: {e}",
                    old_root_path.display(),
                    new_root.display()
                )
            })?;
        }
    }

    let old_roots = old_root_candidates(&value, &old_stem, &hash_name);
    let updated_file_url_count = update_sub_file_data_roots(&mut value, &old_roots, &name);
    value = with_top_metadata(value, &name, &hash_name)?;

    let target_path = parent.join(format!("{name}_structure.json"));
    let serialized = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to serialize migrated structure JSON: {e}"))?;
    fs::write(&target_path, format!("{serialized}\n")).map_err(|e| {
        format!(
            "Failed to write migrated structure JSON {}: {e}",
            target_path.display()
        )
    })?;
    if normalize_path_key(path) != normalize_path_key(&target_path) {
        fs::remove_file(path).map_err(|e| {
            format!(
                "Failed to remove old structure JSON {}: {e}",
                path.display()
            )
        })?;
    }

    Ok(Fhm2dStructureMigrationResult {
        old_structure_json_path: display_path(path.to_path_buf()),
        structure_json_path: display_path(target_path),
        old_root_path: old_root_display,
        root_path: if new_root.is_dir() {
            Some(display_path(new_root))
        } else {
            None
        },
        name,
        hash_name,
        updated_file_url_count,
    })
}

pub fn read_metadata(value: &Value) -> Fhm2dStructureMetadata {
    Fhm2dStructureMetadata {
        name: value
            .get("Name")
            .and_then(Value::as_str)
            .map(|s| s.to_string()),
        hash_name: value
            .get("HashName")
            .and_then(Value::as_str)
            .and_then(normalize_hash_name),
    }
}

pub fn effective_repack_output_path(
    structure_json_path: &str,
    requested_output_path: &str,
) -> String {
    let structure_path = Path::new(structure_json_path);
    let output_path = Path::new(requested_output_path);
    let Ok(value) = read_structure_value(structure_path) else {
        return requested_output_path.to_string();
    };
    let Some(hash_name) = read_metadata(&value).hash_name else {
        return requested_output_path.to_string();
    };
    let parent = output_path.parent().unwrap_or_else(|| Path::new(""));
    parent
        .join(format!("{hash_name}.fhm2d"))
        .to_string_lossy()
        .to_string()
}

fn read_structure_value(path: &Path) -> Result<Value, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read structure JSON {}: {e}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse structure JSON {}: {e}", path.display()))
}

pub fn with_top_metadata(mut value: Value, name: &str, hash_name: &str) -> Result<Value, String> {
    let obj = value
        .as_object_mut()
        .ok_or_else(|| "Structure JSON root must be an object".to_string())?;
    let mut next = Map::new();
    next.insert("Name".to_string(), Value::String(name.to_string()));
    next.insert("HashName".to_string(), Value::String(hash_name.to_string()));
    for (key, val) in std::mem::take(obj) {
        if key != "Name" && key != "HashName" {
            next.insert(key, val);
        }
    }
    Ok(Value::Object(next))
}

fn first_file_url_root(value: &Value) -> Option<String> {
    value
        .get("SubFileData")
        .and_then(Value::as_array)?
        .iter()
        .filter_map(|entry| entry.get("fileUrl").and_then(Value::as_str))
        .filter_map(first_file_url_segment)
        .next()
}

fn first_file_url_segment(file_url: &str) -> Option<String> {
    file_url
        .replace('\\', "/")
        .trim_start_matches("./")
        .split('/')
        .find(|seg| !seg.is_empty() && *seg != ".")
        .map(|seg| seg.to_string())
}

fn update_sub_file_data_roots(
    value: &mut Value,
    old_roots: &HashSet<String>,
    new_root: &str,
) -> usize {
    let Some(entries) = value.get_mut("SubFileData").and_then(Value::as_array_mut) else {
        return 0;
    };
    let mut changed = 0usize;
    for entry in entries {
        let Some(url_value) = entry.get_mut("fileUrl") else {
            continue;
        };
        let Some(url) = url_value.as_str() else {
            continue;
        };
        if let Some(next) = replace_file_url_root(url, old_roots, new_root) {
            *url_value = Value::String(next);
            changed += 1;
        }
    }
    changed
}

fn replace_file_url_root(
    file_url: &str,
    old_roots: &HashSet<String>,
    new_root: &str,
) -> Option<String> {
    let separator = if file_url.contains('\\') { "\\" } else { "/" };
    let has_dot =
        file_url.trim_start().starts_with(".\\") || file_url.trim_start().starts_with("./");
    let normalized = file_url.replace('\\', "/");
    let mut parts: Vec<String> = normalized
        .trim_start_matches("./")
        .split('/')
        .filter(|part| !part.is_empty())
        .map(|part| part.to_string())
        .collect();
    let first = parts.first_mut()?;
    if !old_roots.contains(&first.to_ascii_lowercase()) {
        return None;
    }
    *first = new_root.to_string();
    let joined = parts.join(separator);
    if has_dot {
        Some(format!(".{separator}{joined}"))
    } else {
        Some(joined)
    }
}

fn infer_existing_root_path(path: &Path, value: &Value, stem: &str) -> Option<PathBuf> {
    let parent = path.parent()?;
    let candidates = old_root_candidates(
        value,
        stem,
        &normalize_hash_name(stem).unwrap_or_else(|| stem.to_string()),
    );
    for candidate in candidates {
        let dir = parent.join(candidate);
        if dir.is_dir() {
            return Some(dir);
        }
    }
    None
}

fn old_root_candidates(value: &Value, stem: &str, hash_name: &str) -> HashSet<String> {
    let mut candidates = HashSet::new();
    candidates.insert(stem.to_string());
    candidates.insert(stem.trim_start_matches("0x").to_string());
    candidates.insert(hash_name.to_string());
    candidates.insert(hash_name.trim_start_matches("0x").to_string());
    if let Some(root) = first_file_url_root(value) {
        candidates.insert(root);
    }
    candidates
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_ascii_lowercase())
        .collect()
}

fn strip_known_suffixes(input: &str) -> String {
    let file_name = input
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or(input)
        .trim()
        .to_string();
    for suffix in ["_structure.json", ".fhm2d", ".json"] {
        if file_name.to_ascii_lowercase().ends_with(suffix) {
            let end = file_name.len() - suffix.len();
            return file_name[..end].to_string();
        }
    }
    file_name
}

fn normalize_path_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn display_path(path: PathBuf) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalizes_hash_names_from_common_pack_paths() {
        assert_eq!(
            normalize_hash_name("0xF6954689_structure.json").as_deref(),
            Some("0xF6954689")
        );
        assert_eq!(
            normalize_hash_name("16f73c97.fhm2d").as_deref(),
            Some("0x16F73C97")
        );
    }

    #[test]
    fn derives_hash_name_from_output_name_when_source_name_is_custom() {
        let (name, hash_name) = metadata_from_source("custom_stage.fhm2d", "0xF6954689_Gyan");

        assert_eq!(name, "0xF6954689_Gyan");
        assert_eq!(hash_name, "0xF6954689");
    }

    #[test]
    fn strict_metadata_rejects_missing_hash_name() {
        let err = metadata_from_source_strict("custom_stage.fhm2d", "Gyan_model").unwrap_err();

        assert!(err.contains("Cannot derive HashName"));
    }

    #[test]
    fn migrates_legacy_structure_metadata_and_file_url_root() {
        let temp = tempfile::tempdir().unwrap();
        let old_root = temp.path().join("0xF6954689");
        fs::create_dir_all(&old_root).unwrap();
        fs::write(old_root.join("asset.bin"), b"asset").unwrap();
        let structure_path = temp.path().join("0xF6954689_structure.json");
        let structure = json!({
            "Magic": -843925575,
            "Fhm2dTotalCount": 1,
            "UnkCount": 0,
            "SubFileData": [
                {
                    "index": 0,
                    "fileType": ".bin",
                    "fileIndex": 0,
                    "fileUrl": ".\\0xF6954689\\asset.bin",
                    "fileBaseName": "asset"
                }
            ],
            "SubFileStructure": [
                {
                    "type": "Item",
                    "unk1": "00000000",
                    "fileIndex": 0,
                    "unk2": "00000000",
                    "unk2_1": 0,
                    "unk3": 0,
                    "unk4": 0,
                    "originalFileIndex": 0,
                    "Name": "asset"
                }
            ]
        });
        fs::write(
            &structure_path,
            serde_json::to_string_pretty(&structure).unwrap(),
        )
        .unwrap();

        let result = migrate_structure_json(&structure_path, "Gyan model").unwrap();

        assert_eq!(result.name, "Gyan_model");
        assert_eq!(result.hash_name, "0xF6954689");
        assert_eq!(result.updated_file_url_count, 1);
        assert!(!old_root.exists());
        assert!(temp.path().join("Gyan_model").is_dir());
        assert!(!structure_path.exists());

        let migrated_path = temp.path().join("Gyan_model_structure.json");
        let raw = fs::read_to_string(&migrated_path).unwrap();
        let first_name = raw.find("\"Name\"").unwrap();
        let first_hash = raw.find("\"HashName\"").unwrap();
        let first_magic = raw.find("\"Magic\"").unwrap();
        assert!(first_name < first_hash);
        assert!(first_hash < first_magic);

        let migrated: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(migrated["Name"], "Gyan_model");
        assert_eq!(migrated["HashName"], "0xF6954689");
        assert_eq!(
            migrated["SubFileData"][0]["fileUrl"],
            ".\\Gyan_model\\asset.bin"
        );
    }

    #[test]
    fn hash_name_controls_effective_repack_output_path() {
        let temp = tempfile::tempdir().unwrap();
        let structure_path = temp.path().join("Gyan_model_structure.json");
        fs::write(
            &structure_path,
            serde_json::to_string_pretty(&json!({
                "Name": "Gyan_model",
                "HashName": "0xF6954689",
                "Magic": -843925575,
                "UnkCount": 0,
                "SubFileData": [],
                "SubFileStructure": []
            }))
            .unwrap(),
        )
        .unwrap();

        let requested = temp.path().join("Gyan_model.fhm2d");
        let resolved = effective_repack_output_path(
            &structure_path.to_string_lossy(),
            &requested.to_string_lossy(),
        );

        assert!(resolved.replace('\\', "/").ends_with("/0xF6954689.fhm2d"));
    }
}
