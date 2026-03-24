use serde::Serialize;
use serde_json::{json, Value};
use ssbh_data::prelude::*;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureRefResolve {
    pub reference: String,
    pub nutexb_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SsbhModelPreviewBundle {
    pub root_folder: String,
    pub modl_path: String,
    pub mesh_path: String,
    pub skel_path: Option<String>,
    pub matl_paths: Vec<String>,
    pub modl: Value,
    pub mesh: Value,
    pub skel: Option<Value>,
    pub matl: Option<Value>,
    pub texture_refs: Vec<String>,
    pub resolved_nutexb_paths: Vec<String>,
    pub texture_resolve: Vec<TextureRefResolve>,
    pub warnings: Vec<String>,
}

fn normalize_rel_path(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('/')
        .trim_start_matches('\\')
        .replace('\\', "/")
}

fn resolve_under_folder(folder: &Path, rel: &str) -> PathBuf {
    let normalized = normalize_rel_path(rel);
    folder.join(normalized)
}

fn find_numdlb_in_dir(dir: &Path) -> Result<PathBuf, String> {
    let preferred = dir.join("model.numdlb");
    if preferred.is_file() {
        return Ok(preferred);
    }
    let mut candidates: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|s| s.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case("numdlb"))
                    .unwrap_or(false)
        })
        .collect();
    candidates.sort();
    candidates
        .into_iter()
        .next()
        .ok_or_else(|| "No .numdlb file found in the selected folder".to_string())
}

pub fn resolve_modl_entry_path(input: &str) -> Result<PathBuf, String> {
    let path = Path::new(input);
    if path.is_file() {
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .ok_or_else(|| "File has no extension".to_string())?;
        if !ext.eq_ignore_ascii_case("numdlb") {
            return Err("Selected file is not a .numdlb model".to_string());
        }
        return Ok(path.to_path_buf());
    }
    if path.is_dir() {
        return find_numdlb_in_dir(path);
    }
    Err(format!(
        "Path does not exist or is not accessible: {}",
        input
    ))
}

fn collect_texture_refs(matl: &MatlData) -> Vec<String> {
    let mut set: HashSet<String> = HashSet::new();
    for entry in &matl.entries {
        for tex in &entry.textures {
            let s = tex.data.trim();
            if !s.is_empty() {
                set.insert(s.to_string());
            }
        }
    }
    let mut v: Vec<String> = set.into_iter().collect();
    v.sort();
    v
}

fn resolve_nutexb_path(folder: &Path, texture_ref: &str) -> Option<PathBuf> {
    let trimmed = texture_ref.trim();
    if trimmed.is_empty() {
        return None;
    }
    let rel = normalize_rel_path(trimmed);
    let base = folder.join(&rel);
    if base.is_file() {
        return Some(base);
    }
    let with_nutexb = if rel.to_lowercase().ends_with(".nutexb") {
        base
    } else {
        folder.join(format!("{rel}.nutexb"))
    };
    if with_nutexb.is_file() {
        return Some(with_nutexb);
    }
    None
}

pub fn load_model_preview_bundle(root_input: &str) -> Result<SsbhModelPreviewBundle, String> {
    let modl_path = resolve_modl_entry_path(root_input)?;
    let folder = modl_path
        .parent()
        .ok_or_else(|| "Could not determine model folder from .numdlb path".to_string())?
        .to_path_buf();

    let modl: ModlData =
        ModlData::from_file(&modl_path).map_err(|e| format!("Failed to read Modl: {e}"))?;

    let mesh_path = resolve_under_folder(&folder, &modl.mesh_file_name);
    if !mesh_path.is_file() {
        return Err(format!(
            "Mesh file not found: {}",
            mesh_path.display()
        ));
    }

    let mesh: MeshData =
        MeshData::from_file(&mesh_path).map_err(|e| format!("Failed to read Mesh: {e}"))?;

    let skel_path = resolve_under_folder(&folder, &modl.skeleton_file_name);
    let (skel, skel_path_opt) = if skel_path.is_file() {
        let s: SkelData =
            SkelData::from_file(&skel_path).map_err(|e| format!("Failed to read Skel: {e}"))?;
        (
            Some(
                serde_json::to_value(&s)
                    .map_err(|e| format!("Failed to serialize Skel to JSON: {e}"))?,
            ),
            Some(skel_path.to_string_lossy().to_string()),
        )
    } else {
        (None, None)
    };

    let mut warnings: Vec<String> = Vec::new();
    if skel_path_opt.is_none() {
        warnings.push(format!(
            "Skeleton file not found (expected at {}), bone view disabled.",
            skel_path.display()
        ));
    }

    let mut matl_paths: Vec<String> = Vec::new();
    let mut matl_combined: Option<MatlData> = None;

    for name in &modl.material_file_names {
        let p = resolve_under_folder(&folder, name);
        if !p.is_file() {
            warnings.push(format!(
                "Material file listed in model but missing: {}",
                p.display()
            ));
            continue;
        }
        let data: MatlData =
            MatlData::from_file(&p).map_err(|e| format!("Failed to read Matl {}: {e}", p.display()))?;
        matl_paths.push(p.to_string_lossy().to_string());
        match matl_combined.as_mut() {
            None => matl_combined = Some(data),
            Some(existing) => {
                existing.entries.extend(data.entries);
            }
        }
    }

    let (texture_refs, resolved_nutexb_paths, texture_resolve, matl_value) =
        if let Some(ref m) = matl_combined {
            let refs = collect_texture_refs(m);
            let mut resolved: Vec<String> = Vec::new();
            let mut resolve_rows: Vec<TextureRefResolve> = Vec::new();
            for r in &refs {
                let nutexb_path = resolve_nutexb_path(&folder, r).map(|p| p.to_string_lossy().to_string());
                if let Some(ref s) = nutexb_path {
                    if !resolved.contains(s) {
                        resolved.push(s.clone());
                    }
                } else {
                    warnings.push(format!(
                        "Texture reference could not be resolved to a .nutexb on disk: {r}"
                    ));
                }
                resolve_rows.push(TextureRefResolve {
                    reference: r.clone(),
                    nutexb_path,
                });
            }
            let v =
                serde_json::to_value(m).map_err(|e| format!("Failed to serialize Matl: {e}"))?;
            (refs, resolved, resolve_rows, Some(v))
        } else {
            if !modl.material_file_names.is_empty() {
                warnings.push(
                    "No material files could be loaded; meshes render with a neutral material.".into(),
                );
            }
            (Vec::new(), Vec::new(), Vec::new(), None)
        };

    let modl_json = serde_json::to_value(&modl).map_err(|e| format!("Failed to serialize Modl: {e}"))?;
    let mesh_json = serde_json::to_value(&mesh).map_err(|e| format!("Failed to serialize Mesh: {e}"))?;

    Ok(SsbhModelPreviewBundle {
        root_folder: folder.to_string_lossy().to_string(),
        modl_path: modl_path.to_string_lossy().to_string(),
        mesh_path: mesh_path.to_string_lossy().to_string(),
        skel_path: skel_path_opt,
        matl_paths,
        modl: modl_json,
        mesh: mesh_json,
        skel,
        matl: matl_value,
        texture_refs,
        resolved_nutexb_paths,
        texture_resolve,
        warnings,
    })
}

#[tauri::command]
pub fn ssbh_load_model_preview(root_path: String) -> Result<SsbhModelPreviewBundle, String> {
    load_model_preview_bundle(&root_path)
}

#[tauri::command]
pub fn ssbh_load_ssbh_file_as_json(path: String) -> Result<Value, String> {
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "File has no extension".to_string())?;
    let ext_lc = ext.to_ascii_lowercase();
    let v = match ext_lc.as_str() {
        "numshb" => {
            let d: MeshData =
                MeshData::from_file(p).map_err(|e| format!("Failed to read Mesh: {e}"))?;
            serde_json::to_value(&d).map_err(|e| e.to_string())?
        }
        "numdlb" => {
            let d: ModlData =
                ModlData::from_file(p).map_err(|e| format!("Failed to read Modl: {e}"))?;
            serde_json::to_value(&d).map_err(|e| e.to_string())?
        }
        "nusktb" => {
            let d: SkelData =
                SkelData::from_file(p).map_err(|e| format!("Failed to read Skel: {e}"))?;
            serde_json::to_value(&d).map_err(|e| e.to_string())?
        }
        "numatb" => {
            let d: MatlData =
                MatlData::from_file(p).map_err(|e| format!("Failed to read Matl: {e}"))?;
            serde_json::to_value(&d).map_err(|e| e.to_string())?
        }
        other => {
            return Err(format!(
                "Unsupported extension for JSON preview: {other}"
            ));
        }
    };
    Ok(json!({
        "filePath": path,
        "format": ext_lc,
        "data": v,
    }))
}
