use crate::format::fhm2d::{
    extract_fhm2d_to_memory_impl, Fhm2dFormat, InMemoryFhm2dExtraction,
};
use crate::nutexb_lib::{
    nutexb_file_crc32, nutexb_to_png_bytes_from_bytes, NutexbPreviewFileIdentity,
};
use crate::ssbh_preview::{SsbhModelPreviewBundle, TextureRefResolve};
use serde::Serialize;
use ssbh_data::prelude::{MatlData, MeshData, ModlData, SkelData};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::io::Cursor;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Response};
use tauri::State;

#[derive(Default)]
pub struct Fhm2dMemorySessionState {
    next_session_id: AtomicU64,
    sessions: Mutex<HashMap<String, Fhm2dMemorySession>>,
}

#[derive(Clone)]
struct Fhm2dMemorySession {
    session_id: String,
    source_name: String,
    format_label: Option<String>,
    virtual_root_name: String,
    naming_warning: Option<String>,
    files_by_id: HashMap<String, MemoryFileRecord>,
    relative_path_to_id: HashMap<String, String>,
    preview_candidates: Vec<Fhm2dPreviewCandidate>,
    selected_candidate_ids: Vec<String>,
    rename_revision: u64,
    derived_preview_bundles_cache: HashMap<String, SsbhModelPreviewBundle>,
}

#[derive(Clone)]
struct MemoryFileRecord {
    id: String,
    file_index: i32,
    file_type: String,
    relative_path: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fhm2dVirtualEntry {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub virtual_path: String,
    pub relative_path: String,
    pub parent_relative_path: Option<String>,
    pub file_index: Option<i32>,
    pub file_type: Option<String>,
    pub size: Option<usize>,
    pub child_count: usize,
    pub is_model_related: bool,
    pub has_reference_issue: bool,
    pub selected_candidate: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fhm2dVirtualTreeNode {
    #[serde(flatten)]
    pub entry: Fhm2dVirtualEntry,
    pub children: Vec<Fhm2dVirtualTreeNode>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fhm2dPreviewCandidate {
    pub id: String,
    pub display_label: String,
    pub folder_relative_path: String,
    pub folder_virtual_path: String,
    pub modl_entry_id: String,
    pub modl_virtual_path: String,
    pub mesh_virtual_path: Option<String>,
    pub skel_virtual_path: Option<String>,
    pub matl_virtual_paths: Vec<String>,
    pub nutexb_virtual_paths: Vec<String>,
    pub issues: Vec<String>,
    pub complete: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fhm2dMemorySessionSummary {
    pub session_id: String,
    pub source_name: String,
    pub format: Option<String>,
    pub virtual_root: String,
    pub naming_warning: Option<String>,
    pub virtual_tree: Vec<Fhm2dVirtualTreeNode>,
    pub preview_candidates: Vec<Fhm2dPreviewCandidate>,
    pub selected_candidate_ids: Vec<String>,
    pub rename_revision: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRenameImpact {
    pub session_id: String,
    pub entry_id: String,
    pub previous_virtual_path: String,
    pub next_virtual_path: String,
    pub affected_candidate_ids: Vec<String>,
    pub preview_candidates: Vec<Fhm2dPreviewCandidate>,
    pub virtual_tree: Vec<Fhm2dVirtualTreeNode>,
    pub rename_revision: u64,
}

fn normalize_virtual_rel_path(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Virtual path cannot be empty.".to_string());
    }
    let stripped = trimmed
        .strip_prefix(".\\")
        .or_else(|| trimmed.strip_prefix("./"))
        .unwrap_or(trimmed);
    let mut out: Vec<String> = Vec::new();
    for segment in stripped.replace('\\', "/").split('/') {
        let part = segment.trim();
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err(format!("Virtual path must not contain '..': {raw}"));
        }
        if part.contains(':') {
            return Err(format!("Virtual path contains an invalid ':' segment: {raw}"));
        }
        out.push(part.to_string());
    }
    if out.is_empty() {
        return Err("Virtual path cannot be empty after normalization.".to_string());
    }
    Ok(out.join("/"))
}

fn public_virtual_path(session_id: &str, relative_path: &str) -> String {
    format!("memory://{session_id}/{}", relative_path.replace('\\', "/"))
}

fn public_virtual_root(session_id: &str, root_name: &str) -> String {
    public_virtual_path(session_id, root_name)
}

fn parse_public_or_relative_path(session_id: &str, input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Virtual path cannot be empty.".to_string());
    }
    let prefix = format!("memory://{session_id}/");
    if let Some(relative) = trimmed.strip_prefix(prefix.as_str()) {
        return normalize_virtual_rel_path(relative);
    }
    normalize_virtual_rel_path(trimmed)
}

fn parent_relative_path(path: &str) -> Option<String> {
    let mut parts: Vec<&str> = path.split('/').collect();
    if parts.len() <= 1 {
        return None;
    }
    let _ = parts.pop();
    Some(parts.join("/"))
}

fn file_name_from_relative_path(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn file_stem_from_name(name: &str) -> String {
    match name.rsplit_once('.') {
        Some((stem, _)) if !stem.is_empty() => stem.to_string(),
        _ => name.to_string(),
    }
}

fn extension_from_relative_path(path: &str) -> Option<String> {
    let name = file_name_from_relative_path(path);
    let (_, ext) = name.rsplit_once('.')?;
    Some(format!(".{}", ext))
}

fn normalize_name_for_lookup(name: &str) -> String {
    name.trim().replace('\\', "/").to_ascii_lowercase()
}

fn basename_with_extension(path: &str) -> String {
    file_name_from_relative_path(path).to_ascii_lowercase()
}

fn basename_without_extension(path: &str) -> String {
    file_stem_from_name(file_name_from_relative_path(path)).to_ascii_lowercase()
}

fn is_model_related_extension(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        ".numdlb" | ".numshb" | ".nusktb" | ".numatb" | ".nutexb"
    )
}

fn safe_virtual_root_name(source_name: &str) -> String {
    let normalized = source_name.replace('\\', "/");
    let raw = normalized
        .split('/')
        .filter(|segment| !segment.trim().is_empty())
        .next_back()
        .unwrap_or("fhm2d_memory");
    let stem = match raw.rsplit_once('.') {
        Some((s, _)) if !s.trim().is_empty() => s,
        _ => raw,
    };
    let mut out = String::with_capacity(stem.len());
    for ch in stem.chars() {
        let safe = match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        };
        out.push(safe);
    }
    let trimmed = out.trim();
    if trimmed.is_empty() {
        "fhm2d_memory".to_string()
    } else {
        trimmed.to_string()
    }
}

fn load_modl_data(bytes: &[u8]) -> Result<ModlData, String> {
    let mut cursor = Cursor::new(bytes);
    ModlData::read(&mut cursor).map_err(|e| e.to_string())
}

fn load_mesh_data(bytes: &[u8]) -> Result<MeshData, String> {
    let mut cursor = Cursor::new(bytes);
    MeshData::read(&mut cursor).map_err(|e| e.to_string())
}

fn load_skel_data(bytes: &[u8]) -> Result<SkelData, String> {
    let mut cursor = Cursor::new(bytes);
    SkelData::read(&mut cursor).map_err(|e| e.to_string())
}

fn load_matl_data(bytes: &[u8]) -> Result<MatlData, String> {
    let mut cursor = Cursor::new(bytes);
    MatlData::read(&mut cursor).map_err(|e| e.to_string())
}

fn collect_texture_refs(matl: &MatlData) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = BTreeSet::new();
    for entry in &matl.entries {
        for tex in &entry.textures {
            let value = tex.data.trim();
            if !value.is_empty() && seen.insert(value.to_string()) {
                out.push(value.to_string());
            }
        }
        for tex in &entry.textures2 {
            let value = tex.data.trim();
            if !value.is_empty() && seen.insert(value.to_string()) {
                out.push(value.to_string());
            }
        }
    }
    out
}

fn merge_matl_files(files: &[&MemoryFileRecord]) -> Result<Option<MatlData>, String> {
    let mut combined: Option<MatlData> = None;
    for file in files {
        let parsed = load_matl_data(&file.data)?;
        match combined.as_mut() {
            None => combined = Some(parsed),
            Some(existing) => existing.entries.extend(parsed.entries),
        }
    }
    Ok(combined)
}

fn resolve_sidecar_by_reference(
    files_by_id: &HashMap<String, MemoryFileRecord>,
    folder_relative_path: &str,
    raw_reference: &str,
    expected_extension: &str,
) -> Result<Option<String>, String> {
    let trimmed = raw_reference.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let normalized = trimmed.replace('\\', "/");
    let normalized_lower = normalized.to_ascii_lowercase();
    let basename = normalized
        .split('/')
        .filter(|segment| !segment.is_empty())
        .next_back()
        .unwrap_or(trimmed)
        .to_string();
    let basename_lower = basename.to_ascii_lowercase();
    let basename_with_expected = if basename_lower.ends_with(expected_extension) {
        basename_lower.clone()
    } else {
        format!("{basename_lower}{expected_extension}")
    };

    let mut same_folder_matches: Vec<&MemoryFileRecord> = files_by_id
        .values()
        .filter(|file| {
            parent_relative_path(&file.relative_path).as_deref() == Some(folder_relative_path)
                && basename_with_extension(&file.relative_path) == basename_with_expected
        })
        .collect();
    if same_folder_matches.len() > 1 {
        same_folder_matches.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
        return Err(format!(
            "Ambiguous {expected_extension} sidecar reference \"{trimmed}\" in folder {folder_relative_path}"
        ));
    }
    if let Some(file) = same_folder_matches.pop() {
        return Ok(Some(file.id.clone()));
    }

    let mut global_matches: Vec<&MemoryFileRecord> = files_by_id
        .values()
        .filter(|file| {
            let path_lower = file.relative_path.to_ascii_lowercase();
            path_lower.ends_with(normalized_lower.as_str())
                || basename_with_extension(&file.relative_path) == basename_with_expected
        })
        .collect();
    global_matches.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    global_matches.dedup_by(|a, b| a.id == b.id);
    if global_matches.len() > 1 {
        return Err(format!(
            "Ambiguous {expected_extension} sidecar reference \"{trimmed}\" across the memory session"
        ));
    }
    Ok(global_matches.pop().map(|file| file.id.clone()))
}

fn resolve_texture_reference_to_path(
    files_by_id: &HashMap<String, MemoryFileRecord>,
    raw_reference: &str,
) -> Result<Option<String>, String> {
    let trimmed = raw_reference.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let normalized = trimmed.replace('\\', "/");
    let normalized_lower = normalized.to_ascii_lowercase();
    let basename = normalized
        .split('/')
        .filter(|segment| !segment.is_empty())
        .next_back()
        .unwrap_or(trimmed)
        .to_string();
    let basename_stem = file_stem_from_name(&basename).to_ascii_lowercase();
    let basename_with_ext = if basename.to_ascii_lowercase().ends_with(".nutexb") {
        basename.to_ascii_lowercase()
    } else {
        format!("{basename_stem}.nutexb")
    };
    let mut matches: Vec<&MemoryFileRecord> = files_by_id
        .values()
        .filter(|file| {
            if !file.file_type.eq_ignore_ascii_case(".nutexb") {
                return false;
            }
            let path_lower = file.relative_path.to_ascii_lowercase();
            let name_lower = basename_with_extension(&file.relative_path);
            let stem_lower = basename_without_extension(&file.relative_path);
            path_lower.ends_with(normalized_lower.as_str())
                || name_lower == basename_with_ext
                || stem_lower == basename_stem
        })
        .collect();
    matches.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    matches.dedup_by(|a, b| a.id == b.id);
    if matches.len() > 1 {
        return Err(format!(
            "Ambiguous texture reference \"{trimmed}\" across the memory session"
        ));
    }
    Ok(matches.pop().map(|file| file.relative_path.clone()))
}

fn build_preview_candidates_for_files(
    session_id: &str,
    files_by_id: &HashMap<String, MemoryFileRecord>,
) -> Vec<Fhm2dPreviewCandidate> {
    let mut candidates = Vec::new();
    let mut numdlb_files: Vec<&MemoryFileRecord> = files_by_id
        .values()
        .filter(|file| file.file_type.eq_ignore_ascii_case(".numdlb"))
        .collect();
    numdlb_files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    for file in numdlb_files {
        let folder_relative_path = parent_relative_path(&file.relative_path).unwrap_or_default();
        let folder_virtual_path = public_virtual_path(session_id, folder_relative_path.as_str());
        let modl_virtual_path = public_virtual_path(session_id, &file.relative_path);
        let display_label = file_stem_from_name(file_name_from_relative_path(&file.relative_path));
        let candidate_id = format!("candidate:{}", file.relative_path.to_ascii_lowercase());
        let mut issues = Vec::new();
        let mut mesh_virtual_path = None;
        let mut skel_virtual_path = None;
        let mut matl_virtual_paths = Vec::new();
        let mut nutexb_virtual_paths = Vec::new();
        let mut complete = true;

        match load_modl_data(&file.data) {
            Ok(modl) => {
                match resolve_sidecar_by_reference(
                    files_by_id,
                    folder_relative_path.as_str(),
                    modl.mesh_file_name.as_str(),
                    ".numshb",
                ) {
                    Ok(Some(mesh_id)) => {
                        if let Some(mesh) = files_by_id.get(mesh_id.as_str()) {
                            mesh_virtual_path = Some(public_virtual_path(session_id, &mesh.relative_path));
                        } else {
                            complete = false;
                            issues.push("Mesh file id resolved but record missing.".to_string());
                        }
                    }
                    Ok(None) => {
                        complete = false;
                        issues.push("Missing .numshb sidecar for this .numdlb.".to_string());
                    }
                    Err(err) => {
                        complete = false;
                        issues.push(err);
                    }
                }

                match resolve_sidecar_by_reference(
                    files_by_id,
                    folder_relative_path.as_str(),
                    modl.skeleton_file_name.as_str(),
                    ".nusktb",
                ) {
                    Ok(Some(skel_id)) => {
                        if let Some(skel) = files_by_id.get(skel_id.as_str()) {
                            skel_virtual_path = Some(public_virtual_path(session_id, &skel.relative_path));
                        }
                    }
                    Ok(None) => {}
                    Err(err) => issues.push(err),
                }

                let mut matl_ids: Vec<String> = Vec::new();
                for raw in &modl.material_file_names {
                    match resolve_sidecar_by_reference(
                        files_by_id,
                        folder_relative_path.as_str(),
                        raw.as_str(),
                        ".numatb",
                    ) {
                        Ok(Some(matl_id)) => {
                            if !matl_ids.iter().any(|id| id == &matl_id) {
                                matl_ids.push(matl_id);
                            }
                        }
                        Ok(None) => {}
                        Err(err) => issues.push(err),
                    }
                }
                if matl_ids.is_empty() {
                    let mut fallback: Vec<&MemoryFileRecord> = files_by_id
                        .values()
                        .filter(|candidate| {
                            candidate.file_type.eq_ignore_ascii_case(".numatb")
                                && parent_relative_path(&candidate.relative_path).as_deref()
                                    == Some(folder_relative_path.as_str())
                        })
                        .collect();
                    fallback.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
                    for matl in fallback {
                        matl_ids.push(matl.id.clone());
                    }
                }

                let preferred_matl_ids: Vec<String> = {
                    let nust_ids: Vec<String> = matl_ids
                        .iter()
                        .filter_map(|id| {
                            let record = files_by_id.get(id.as_str())?;
                            if basename_with_extension(&record.relative_path).contains("__nust__") {
                                Some(id.clone())
                            } else {
                                None
                            }
                        })
                        .collect();
                    if nust_ids.is_empty() {
                        matl_ids.clone()
                    } else {
                        nust_ids
                    }
                };

                let mut parsed_matl_files: Vec<&MemoryFileRecord> = Vec::new();
                for matl_id in &preferred_matl_ids {
                    if let Some(record) = files_by_id.get(matl_id.as_str()) {
                        matl_virtual_paths.push(public_virtual_path(session_id, &record.relative_path));
                        parsed_matl_files.push(record);
                    }
                }

                if let Ok(Some(matl)) = merge_matl_files(&parsed_matl_files) {
                    let mut texture_paths: Vec<String> = Vec::new();
                    for reference in collect_texture_refs(&matl) {
                        match resolve_texture_reference_to_path(files_by_id, reference.as_str()) {
                            Ok(Some(path)) => {
                                if !texture_paths.iter().any(|existing| existing == &path) {
                                    texture_paths.push(path);
                                }
                            }
                            Ok(None) => {}
                            Err(err) => issues.push(err),
                        }
                    }
                    texture_paths.sort();
                    nutexb_virtual_paths = texture_paths
                        .into_iter()
                        .map(|path| public_virtual_path(session_id, path.as_str()))
                        .collect();
                }
            }
            Err(err) => {
                complete = false;
                issues.push(format!("Failed to parse .numdlb in memory: {err}"));
            }
        }

        candidates.push(Fhm2dPreviewCandidate {
            id: candidate_id,
            display_label,
            folder_relative_path: folder_relative_path.clone(),
            folder_virtual_path,
            modl_entry_id: file.id.clone(),
            modl_virtual_path,
            mesh_virtual_path,
            skel_virtual_path,
            matl_virtual_paths,
            nutexb_virtual_paths,
            issues,
            complete,
        });
    }
    candidates
}

fn session_summary(session: &Fhm2dMemorySession) -> Fhm2dMemorySessionSummary {
    let (virtual_tree, _) = build_virtual_tree(session);
    Fhm2dMemorySessionSummary {
        session_id: session.session_id.clone(),
        source_name: session.source_name.clone(),
        format: session.format_label.clone(),
        virtual_root: public_virtual_root(&session.session_id, &session.virtual_root_name),
        naming_warning: session.naming_warning.clone(),
        virtual_tree,
        preview_candidates: session.preview_candidates.clone(),
        selected_candidate_ids: session.selected_candidate_ids.clone(),
        rename_revision: session.rename_revision,
    }
}

fn build_virtual_tree(
    session: &Fhm2dMemorySession,
) -> (
    Vec<Fhm2dVirtualTreeNode>,
    HashMap<String, Fhm2dVirtualEntry>,
) {
    let mut folder_children: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut folder_names: HashMap<String, String> = HashMap::new();
    let mut model_related_folders = BTreeSet::new();
    for file in session.files_by_id.values() {
        let ext_model_related = is_model_related_extension(file.file_type.as_str());
        if ext_model_related {
            let mut current = parent_relative_path(&file.relative_path);
            while let Some(folder) = current {
                model_related_folders.insert(folder.clone());
                current = parent_relative_path(folder.as_str());
            }
        }
        let segments: Vec<&str> = file.relative_path.split('/').collect();
        let mut current_parts: Vec<&str> = Vec::new();
        for segment in segments.iter().take(segments.len().saturating_sub(1)) {
            let parent = if current_parts.is_empty() {
                String::new()
            } else {
                current_parts.join("/")
            };
            current_parts.push(segment);
            let folder_path = current_parts.join("/");
            folder_names
                .entry(folder_path.clone())
                .or_insert_with(|| (*segment).to_string());
            let folder_id = format!("folder:{folder_path}");
            let children = folder_children.entry(parent.clone()).or_default();
            if !children.iter().any(|child| child == &folder_id) {
                children.push(folder_id);
            }
        }
        let parent = parent_relative_path(&file.relative_path).unwrap_or_default();
        let children = folder_children.entry(parent).or_default();
        if !children.iter().any(|child| child == &file.id) {
            children.push(file.id.clone());
        }
    }

    let problematic_modl_paths: BTreeSet<String> = session
        .preview_candidates
        .iter()
        .filter(|candidate| !candidate.complete || !candidate.issues.is_empty())
        .map(|candidate| parse_public_or_relative_path(&session.session_id, &candidate.modl_virtual_path).unwrap_or_default())
        .collect();
    let selected_candidates: BTreeSet<String> =
        session.selected_candidate_ids.iter().cloned().collect();

    let mut entries_by_id = HashMap::new();
    for (folder_path, name) in &folder_names {
        let folder_id = format!("folder:{folder_path}");
        let parent = parent_relative_path(folder_path);
        let child_count = folder_children.get(folder_path).map(|items| items.len()).unwrap_or(0);
        entries_by_id.insert(
            folder_id.clone(),
            Fhm2dVirtualEntry {
                id: folder_id.clone(),
                kind: "folder".to_string(),
                name: name.clone(),
                virtual_path: public_virtual_path(&session.session_id, folder_path),
                relative_path: folder_path.clone(),
                parent_relative_path: parent,
                file_index: None,
                file_type: None,
                size: None,
                child_count,
                is_model_related: model_related_folders.contains(folder_path),
                has_reference_issue: false,
                selected_candidate: false,
            },
        );
    }

    for file in session.files_by_id.values() {
        let child_count = 0usize;
        let is_problematic = problematic_modl_paths.contains(&file.relative_path);
        entries_by_id.insert(
            file.id.clone(),
            Fhm2dVirtualEntry {
                id: file.id.clone(),
                kind: "file".to_string(),
                name: file_name_from_relative_path(&file.relative_path).to_string(),
                virtual_path: public_virtual_path(&session.session_id, &file.relative_path),
                relative_path: file.relative_path.clone(),
                parent_relative_path: parent_relative_path(&file.relative_path),
                file_index: Some(file.file_index),
                file_type: Some(file.file_type.clone()),
                size: Some(file.data.len()),
                child_count,
                is_model_related: is_model_related_extension(file.file_type.as_str()),
                has_reference_issue: is_problematic,
                selected_candidate: selected_candidates.contains(&file.id),
            },
        );
    }

    fn build_nodes(
        parent_relative: &str,
        folder_children: &BTreeMap<String, Vec<String>>,
        entries_by_id: &HashMap<String, Fhm2dVirtualEntry>,
    ) -> Vec<Fhm2dVirtualTreeNode> {
        let mut nodes = Vec::new();
        let mut child_ids = folder_children
            .get(parent_relative)
            .cloned()
            .unwrap_or_default();
        child_ids.sort();
        for child_id in child_ids {
            let Some(entry) = entries_by_id.get(child_id.as_str()).cloned() else {
                continue;
            };
            let children = if entry.kind == "folder" {
                build_nodes(entry.relative_path.as_str(), folder_children, entries_by_id)
            } else {
                Vec::new()
            };
            nodes.push(Fhm2dVirtualTreeNode { entry, children });
        }
        nodes
    }

    let virtual_tree = build_nodes("", &folder_children, &entries_by_id);
    (virtual_tree, entries_by_id)
}

impl Fhm2dMemorySessionState {
    fn next_session_id(&self) -> String {
        let id = self.next_session_id.fetch_add(1, Ordering::Relaxed) + 1;
        format!("fhm_mem_{id:08x}")
    }
}

impl Fhm2dMemorySession {
    fn from_extraction(
        session_id: String,
        source_name: String,
        extraction: InMemoryFhm2dExtraction,
    ) -> Result<Self, String> {
        let mut files_by_id = HashMap::new();
        let mut relative_path_to_id = HashMap::new();
        for file in extraction.files {
            let relative_path = normalize_virtual_rel_path(file.file_url.as_str())?;
            let key = relative_path.to_ascii_lowercase();
            if relative_path_to_id.contains_key(&key) {
                return Err(format!("Duplicate virtual path in memory session: {relative_path}"));
            }
            let file_id = format!("file:{}", file.file_index);
            relative_path_to_id.insert(key, file_id.clone());
            files_by_id.insert(
                file_id.clone(),
                MemoryFileRecord {
                    id: file_id,
                    file_index: file.file_index,
                    file_type: file.file_type,
                    relative_path,
                    data: file.data,
                },
            );
        }
        let preview_candidates = build_preview_candidates_for_files(session_id.as_str(), &files_by_id);
        Ok(Self {
            session_id,
            source_name,
            format_label: extraction.format.map(|fmt| match fmt {
                Fhm2dFormat::Character => "fhm2d_character".to_string(),
                Fhm2dFormat::Effect => "fhm2d_effect".to_string(),
                Fhm2dFormat::AllNutexb => "fhm2d_all_nutexb".to_string(),
                Fhm2dFormat::StageList => "fhm2d_stage_list".to_string(),
                Fhm2dFormat::CharacterParam => "fhm2d_character_param".to_string(),
                Fhm2dFormat::CharacterCost => "fhm2d_character_cost".to_string(),
                Fhm2dFormat::Msc => "fhm2d_msc".to_string(),
                Fhm2dFormat::Motion => "fhm2d_motion".to_string(),
                Fhm2dFormat::Sound => "fhm2d_sound".to_string(),
            }),
            virtual_root_name: extraction.source_name,
            naming_warning: extraction.naming_error,
            files_by_id,
            relative_path_to_id,
            preview_candidates,
            selected_candidate_ids: Vec::new(),
            rename_revision: 0,
            derived_preview_bundles_cache: HashMap::new(),
        })
    }

    fn file_by_relative_path(&self, relative_path: &str) -> Option<&MemoryFileRecord> {
        let key = normalize_name_for_lookup(relative_path);
        let id = self.relative_path_to_id.get(key.as_str())?;
        self.files_by_id.get(id.as_str())
    }
}

fn build_preview_bundle_from_candidate(
    session: &Fhm2dMemorySession,
    candidate: &Fhm2dPreviewCandidate,
) -> Result<SsbhModelPreviewBundle, String> {
    let Some(modl_file) = session.files_by_id.get(candidate.modl_entry_id.as_str()) else {
        return Err("Selected memory .numdlb entry no longer exists.".to_string());
    };
    let modl = load_modl_data(&modl_file.data)?;
    let mesh_file = candidate
        .mesh_virtual_path
        .as_ref()
        .and_then(|path| parse_public_or_relative_path(&session.session_id, path).ok())
        .and_then(|path| session.file_by_relative_path(path.as_str()))
        .ok_or_else(|| "Selected memory candidate is missing a .numshb sidecar.".to_string())?;
    let mesh = load_mesh_data(&mesh_file.data)?;

    let skel_value = match candidate
        .skel_virtual_path
        .as_ref()
        .and_then(|path| parse_public_or_relative_path(&session.session_id, path).ok())
        .and_then(|path| session.file_by_relative_path(path.as_str()))
    {
        Some(file) => Some(
            serde_json::to_value(load_skel_data(&file.data)?)
                .map_err(|e| format!("Failed to serialize in-memory Skel: {e}"))?,
        ),
        None => None,
    };

    let mut matl_files: Vec<&MemoryFileRecord> = Vec::new();
    for path in &candidate.matl_virtual_paths {
        let relative = parse_public_or_relative_path(&session.session_id, path)?;
        if let Some(file) = session.file_by_relative_path(relative.as_str()) {
            matl_files.push(file);
        }
    }
    let matl_combined = merge_matl_files(&matl_files)?;
    let texture_refs = matl_combined
        .as_ref()
        .map(collect_texture_refs)
        .unwrap_or_default();
    let mut resolved_nutexb_paths = Vec::new();
    let mut texture_resolve = Vec::new();
    let mut warnings = Vec::new();
    for reference in &texture_refs {
        match resolve_texture_reference_to_path(&session.files_by_id, reference.as_str()) {
            Ok(Some(relative_path)) => {
                let public_path = public_virtual_path(&session.session_id, relative_path.as_str());
                if !resolved_nutexb_paths.iter().any(|path| path == &public_path) {
                    resolved_nutexb_paths.push(public_path.clone());
                }
                texture_resolve.push(TextureRefResolve {
                    reference: reference.clone(),
                    nutexb_path: Some(public_path),
                });
            }
            Ok(None) => {
                warnings.push(format!(
                    "Texture reference could not be resolved in memory: {reference}"
                ));
                texture_resolve.push(TextureRefResolve {
                    reference: reference.clone(),
                    nutexb_path: None,
                });
            }
            Err(err) => {
                warnings.push(err);
                texture_resolve.push(TextureRefResolve {
                    reference: reference.clone(),
                    nutexb_path: None,
                });
            }
        }
    }
    warnings.extend(candidate.issues.clone());

    Ok(SsbhModelPreviewBundle {
        root_folder: candidate.folder_virtual_path.clone(),
        modl_path: candidate.modl_virtual_path.clone(),
        mesh_path: public_virtual_path(&session.session_id, &mesh_file.relative_path),
        skel_path: None,
        matl_paths: candidate.matl_virtual_paths.clone(),
        modl: serde_json::to_value(&modl)
            .map_err(|e| format!("Failed to serialize in-memory Modl: {e}"))?,
        mesh: serde_json::to_value(&mesh)
            .map_err(|e| format!("Failed to serialize in-memory Mesh: {e}"))?,
        skel: skel_value,
        matl: matl_combined
            .map(|matl| serde_json::to_value(&matl).map_err(|e| format!("Failed to serialize in-memory Matl: {e}")))
            .transpose()?,
        texture_refs,
        resolved_nutexb_paths,
        texture_resolve,
        warnings,
        source_kind: "memory".to_string(),
        source_session_id: Some(session.session_id.clone()),
        virtual_modl_path: Some(candidate.modl_virtual_path.clone()),
    })
}

#[tauri::command]
pub async fn create_fhm2d_memory_session(
    state: State<'_, Fhm2dMemorySessionState>,
    source_bytes: Vec<u8>,
    format: Option<String>,
    source_name: String,
) -> Result<Fhm2dMemorySessionSummary, String> {
    let parsed_format = Fhm2dFormat::from_opt_str(format.as_deref())?;
    let safe_source_name = source_name.trim().to_string();
    let virtual_root_name = safe_virtual_root_name(safe_source_name.as_str());
    let extraction = tauri::async_runtime::spawn_blocking(move || {
        extract_fhm2d_to_memory_impl(source_bytes.as_slice(), virtual_root_name.as_str(), parsed_format)
    })
    .await
    .map_err(|e| e.to_string())??;

    let session_id = state.next_session_id();
    let session = Fhm2dMemorySession::from_extraction(
        session_id.clone(),
        safe_source_name,
        extraction,
    )?;
    let summary = session_summary(&session);
    state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock FHM2D memory sessions.".to_string())?
        .insert(session_id, session);
    Ok(summary)
}

#[tauri::command]
pub async fn create_fhm2d_memory_session_from_path(
    state: State<'_, Fhm2dMemorySessionState>,
    source_path: String,
    format: Option<String>,
) -> Result<Fhm2dMemorySessionSummary, String> {
    let path = source_path.trim();
    if path.is_empty() {
        return Err("source_path cannot be empty.".to_string());
    }
    let parsed_format = Fhm2dFormat::from_opt_str(format.as_deref())?;
    let path_owned = path.to_string();
    let safe_source_name = Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "fhm2d_memory".to_string());
    let virtual_root_name = safe_virtual_root_name(safe_source_name.as_str());
    let extraction = tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(path_owned.as_str())
            .map_err(|e| format!("Failed to read FHM2D file: {e}"))?;
        extract_fhm2d_to_memory_impl(bytes.as_slice(), virtual_root_name.as_str(), parsed_format)
    })
    .await
    .map_err(|e| e.to_string())??;

    let session_id = state.next_session_id();
    let session = Fhm2dMemorySession::from_extraction(
        session_id.clone(),
        safe_source_name,
        extraction,
    )?;
    let summary = session_summary(&session);
    state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock FHM2D memory sessions.".to_string())?
        .insert(session_id, session);
    Ok(summary)
}

#[tauri::command]
pub fn list_fhm2d_memory_preview_candidates(
    state: State<'_, Fhm2dMemorySessionState>,
    session_id: String,
) -> Result<Vec<Fhm2dPreviewCandidate>, String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock FHM2D memory sessions.".to_string())?;
    let session = sessions
        .get(session_id.as_str())
        .ok_or_else(|| format!("FHM2D memory session not found: {session_id}"))?;
    Ok(session.preview_candidates.clone())
}

#[tauri::command]
pub fn rename_fhm2d_memory_entry(
    state: State<'_, Fhm2dMemorySessionState>,
    session_id: String,
    entry_id: String,
    next_name: Option<String>,
    next_virtual_path: Option<String>,
) -> Result<MemoryRenameImpact, String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock FHM2D memory sessions.".to_string())?;
    let session = sessions
        .get_mut(session_id.as_str())
        .ok_or_else(|| format!("FHM2D memory session not found: {session_id}"))?;
    let current = session
        .files_by_id
        .get(entry_id.as_str())
        .cloned()
        .ok_or_else(|| format!("Virtual entry is not a file in this session: {entry_id}"))?;
    let current_ext = extension_from_relative_path(current.relative_path.as_str())
        .ok_or_else(|| "Only file entries with an extension can be renamed.".to_string())?;

    let resolved_relative_path = match next_virtual_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(path) => parse_public_or_relative_path(&session.session_id, path)?,
        None => {
            let name = next_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "Provide nextName or nextVirtualPath for rename.".to_string())?;
            let current_parent = parent_relative_path(current.relative_path.as_str());
            let next_file_name = if name.contains('/') || name.contains('\\') {
                return Err("nextName must not contain path separators.".to_string());
            } else if name.to_ascii_lowercase().ends_with(current_ext.as_str()) {
                name.to_string()
            } else {
                format!("{name}{current_ext}")
            };
            match current_parent {
                Some(parent) => normalize_virtual_rel_path(format!("{parent}/{next_file_name}").as_str())?,
                None => normalize_virtual_rel_path(next_file_name.as_str())?,
            }
        }
    };

    let next_ext = extension_from_relative_path(resolved_relative_path.as_str())
        .ok_or_else(|| "Target virtual path must include a file extension.".to_string())?;
    if !current_ext.eq_ignore_ascii_case(next_ext.as_str()) {
        return Err(format!(
            "Rename must preserve the file extension {current_ext}, got {next_ext}."
        ));
    }

    let lookup_key = resolved_relative_path.to_ascii_lowercase();
    if let Some(existing_id) = session.relative_path_to_id.get(lookup_key.as_str()) {
        if existing_id != &entry_id {
            return Err(format!(
                "A virtual entry already exists at {resolved_relative_path}."
            ));
        }
    }

    let previous_virtual_path = public_virtual_path(&session.session_id, &current.relative_path);
    session.relative_path_to_id.remove(current.relative_path.to_ascii_lowercase().as_str());
    let target = session
        .files_by_id
        .get_mut(entry_id.as_str())
        .ok_or_else(|| format!("Virtual entry is not a file in this session: {entry_id}"))?;
    target.relative_path = resolved_relative_path.clone();
    session
        .relative_path_to_id
        .insert(lookup_key, entry_id.clone());
    session.rename_revision += 1;
    session.preview_candidates = build_preview_candidates_for_files(&session.session_id, &session.files_by_id);
    session.derived_preview_bundles_cache.clear();

    let old_folder = parent_relative_path(current.relative_path.as_str()).unwrap_or_default();
    let new_folder = parent_relative_path(resolved_relative_path.as_str()).unwrap_or_default();
    let affected_candidate_ids = session
        .preview_candidates
        .iter()
        .filter(|candidate| candidate.folder_relative_path == old_folder || candidate.folder_relative_path == new_folder)
        .map(|candidate| candidate.id.clone())
        .collect::<Vec<_>>();
    let (virtual_tree, _) = build_virtual_tree(session);

    Ok(MemoryRenameImpact {
        session_id: session.session_id.clone(),
        entry_id,
        previous_virtual_path,
        next_virtual_path: public_virtual_path(&session.session_id, &resolved_relative_path),
        affected_candidate_ids,
        preview_candidates: session.preview_candidates.clone(),
        virtual_tree,
        rename_revision: session.rename_revision,
    })
}

#[tauri::command]
pub fn build_ssbh_preview_bundle_from_memory(
    state: State<'_, Fhm2dMemorySessionState>,
    session_id: String,
    modl_virtual_path: String,
) -> Result<SsbhModelPreviewBundle, String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock FHM2D memory sessions.".to_string())?;
    let session = sessions
        .get_mut(session_id.as_str())
        .ok_or_else(|| format!("FHM2D memory session not found: {session_id}"))?;
    let relative_modl_path = parse_public_or_relative_path(&session.session_id, modl_virtual_path.as_str())?;
    let cache_key = format!("{relative_modl_path}|{}", session.rename_revision);
    if let Some(bundle) = session.derived_preview_bundles_cache.get(cache_key.as_str()) {
        return Ok(bundle.clone());
    }
    let candidate = session
        .preview_candidates
        .iter()
        .find(|candidate| {
            parse_public_or_relative_path(&session.session_id, candidate.modl_virtual_path.as_str())
                .ok()
                .as_deref()
                == Some(relative_modl_path.as_str())
        })
        .cloned()
        .ok_or_else(|| format!("No memory preview candidate found for {relative_modl_path}"))?;
    if !candidate.complete {
        let reason = if candidate.issues.is_empty() {
            "Selected memory candidate is incomplete.".to_string()
        } else {
            candidate.issues.join(" ")
        };
        return Err(reason);
    }
    let bundle = build_preview_bundle_from_candidate(session, &candidate)?;
    session
        .derived_preview_bundles_cache
        .insert(cache_key, bundle.clone());
    Ok(bundle)
}

#[tauri::command]
pub fn fhm2d_memory_nutexb_preview_identity(
    state: State<'_, Fhm2dMemorySessionState>,
    session_id: String,
    virtual_path: String,
) -> Result<NutexbPreviewFileIdentity, String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock FHM2D memory sessions.".to_string())?;
    let session = sessions
        .get(session_id.as_str())
        .ok_or_else(|| format!("FHM2D memory session not found: {session_id}"))?;
    let relative_path = parse_public_or_relative_path(&session.session_id, virtual_path.as_str())?;
    let file = session
        .file_by_relative_path(relative_path.as_str())
        .ok_or_else(|| format!("Memory texture not found at {relative_path}"))?;
    if !file.file_type.eq_ignore_ascii_case(".nutexb") {
        return Err(format!("Virtual entry is not a .nutexb file: {relative_path}"));
    }
    Ok(NutexbPreviewFileIdentity {
        nutexb_size: file.data.len() as u64,
        crc32: nutexb_file_crc32(&file.data),
    })
}

#[tauri::command]
pub fn fhm2d_memory_nutexb_png_bytes(
    state: State<'_, Fhm2dMemorySessionState>,
    session_id: String,
    virtual_path: String,
) -> Result<Response, String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock FHM2D memory sessions.".to_string())?;
    let session = sessions
        .get(session_id.as_str())
        .ok_or_else(|| format!("FHM2D memory session not found: {session_id}"))?;
    let relative_path = parse_public_or_relative_path(&session.session_id, virtual_path.as_str())?;
    let file = session
        .file_by_relative_path(relative_path.as_str())
        .ok_or_else(|| format!("Memory texture not found at {relative_path}"))?;
    if !file.file_type.eq_ignore_ascii_case(".nutexb") {
        return Err(format!("Virtual entry is not a .nutexb file: {relative_path}"));
    }
    let png = nutexb_to_png_bytes_from_bytes(&file.data)?;
    Ok(Response::new(InvokeBody::Raw(png)))
}

#[tauri::command]
pub fn dispose_fhm2d_memory_session(
    state: State<'_, Fhm2dMemorySessionState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock FHM2D memory sessions.".to_string())?;
    sessions
        .remove(session_id.as_str())
        .ok_or_else(|| format!("FHM2D memory session not found: {session_id}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_virtual_rel_path_rejects_parent_segments() {
        let err = normalize_virtual_rel_path("../bad/file.numdlb").expect_err(".. must be rejected");
        assert!(err.contains("must not contain '..'"));
    }

    #[test]
    fn normalize_virtual_rel_path_strips_leading_dot_segments() {
        let normalized = normalize_virtual_rel_path(".\\pkg\\body_model.numdlb").expect("path should normalize");
        assert_eq!(normalized, "pkg/body_model.numdlb");
    }

    #[test]
    fn safe_virtual_root_name_uses_file_stem() {
        assert_eq!(safe_virtual_root_name("E:/tmp/0x12345678.fhm2d"), "0x12345678");
    }
}
