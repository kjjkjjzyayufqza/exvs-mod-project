//
// ================================================
// MBON-Forschung: vollstaendig aus descatals BoostStudio (https://github.com/descatal/BoostStudio).
// Fuera del arbol de EXVS Mod Project este archivo no debe completarse ni portarse.
// Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy: ACCEPTABLE_USE.md.
// Autor kjjkjjzyayufqza. Producto EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Mimo strom EXVS Mod Project tento kod neprenasej.
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// ================================================
//

//! Tauri commands of the isolated MBON workspace.
//!
//! Thin adapters over `exvs_mbon`: every command runs its work on the blocking
//! pool, returns small JSON DTOs, and ships pixels / meshes as raw bytes
//! (`tauri::ipc::Response`) so the webview never parses bulk JSON.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use exvs_mbon::fhm::FhmDocument;
use exvs_mbon::inspect::{inspect_path, Inspection, TextureSummary};
use exvs_mbon::kinds::{classify, MbonKind};
use exvs_mbon::list_info::{CellKind, ListInfo, ListView};
use exvs_mbon::ntp3::Ntp3;
use exvs_mbon::nud::Nud;
use exvs_mbon::package::{
    self, ExtractOptions, ExtractReport, FhmManifestNode, PackageManifest, RepackReport, MANIFEST_NAME,
};
use exvs_ps4_common::cache::{file_key, ByteCache};
use exvs_ps4_common::mesh_pack::{self, MeshInput};
use exvs_ps4_common::provenance::{self, Provenance};
use exvs_ps4_common::scan;
use exvs_ps4_common::texture::{self, PixelLayout};
use serde::Serialize;
use tauri::ipc::{InvokeBody, Response};

const MAX_READ_BYTES: u32 = 1 << 20;

fn previews() -> &'static ByteCache {
    static CACHE: OnceLock<ByteCache> = OnceLock::new();
    CACHE.get_or_init(|| ByteCache::new(96 * 1024 * 1024))
}

async fn blocking<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("MBON task failed: {error}"))?
}

fn read(path: &Path) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|error| format!("{}: {error}", path.display()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MbonScanEntry {
    pub relative_path: String,
    pub path: String,
    pub stem: String,
    pub size: u64,
    pub container: bool,
    pub archive_kind: Option<u64>,
    pub file_count: u32,
    pub payload_magic: String,
    pub payload_kind: MbonKind,
    pub payload_label: &'static str,
    pub payload_size: u64,
    pub error: Option<String>,
}

/// Classify every file below `root` (a PS4 `archives/` tree or a sample folder).
#[tauri::command]
pub async fn mbon_scan_folder(root: String) -> Result<Vec<MbonScanEntry>, String> {
    blocking(move || {
        let root_path = PathBuf::from(&root);
        let entries = scan::scan_folder(&root_path, &[]).map_err(String::from)?;
        Ok(entries
            .into_iter()
            .map(|entry| {
                let head = hex_to_bytes(&entry.payload_head);
                let kind = classify(&head);
                MbonScanEntry {
                    path: root_path.join(&entry.relative_path).to_string_lossy().into_owned(),
                    relative_path: entry.relative_path,
                    stem: entry.stem,
                    size: entry.size,
                    container: entry.container,
                    archive_kind: entry.archive_kind,
                    file_count: entry.file_count,
                    payload_magic: entry.payload_magic,
                    payload_kind: kind,
                    payload_label: kind.label(),
                    payload_size: entry.payload_size,
                    error: entry.error,
                }
            })
            .collect())
    })
    .await
}

fn hex_to_bytes(text: &str) -> Vec<u8> {
    (0..text.len() / 2)
        .filter_map(|index| u8::from_str_radix(&text[index * 2..index * 2 + 2], 16).ok())
        .collect()
}

#[tauri::command]
pub async fn mbon_inspect(path: String) -> Result<Inspection, String> {
    blocking(move || inspect_path(Path::new(&path)).map_err(String::from)).await
}

/// Extract `source` into `<workspace>/<stem>`.
#[tauri::command]
pub async fn mbon_extract(source: String, workspace: String, overwrite: bool) -> Result<ExtractReport, String> {
    blocking(move || {
        let source = PathBuf::from(source);
        let stem = source
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned())
            .ok_or_else(|| "source has no file name".to_string())?;
        let package_dir = PathBuf::from(workspace).join(stem);
        package::extract_package(&source, &package_dir, &ExtractOptions { overwrite }).map_err(String::from)
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MbonPackageItem {
    pub dir: String,
    pub name: String,
    pub source_name: String,
    pub source_path: Option<String>,
    pub payload_count: usize,
    pub container: bool,
}

#[tauri::command]
pub async fn mbon_list_packages(workspace: String) -> Result<Vec<MbonPackageItem>, String> {
    blocking(move || {
        let workspace = PathBuf::from(workspace);
        if !workspace.is_dir() {
            return Ok(Vec::new());
        }
        Ok(package::list_packages(&workspace)
            .map_err(String::from)?
            .into_iter()
            .map(|(dir, manifest)| MbonPackageItem {
                name: dir
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                dir: dir.to_string_lossy().into_owned(),
                source_name: manifest.source_name,
                source_path: manifest.source_path,
                payload_count: manifest.payloads.len(),
                container: manifest.container.is_some(),
            })
            .collect())
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MbonEntryView {
    /// FHM folder holding the entry (relative to the package).
    pub folder: String,
    /// Index inside that folder.
    pub index: usize,
    pub path: String,
    pub depth: usize,
    pub load_type: u32,
    pub unk_type: u32,
    pub nested: bool,
    pub kind: MbonKind,
    pub label: &'static str,
    pub size: u64,
    pub exists: bool,
    /// How many entries share this file (aliases).
    pub users: usize,
    pub payload: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MbonPackageView {
    pub dir: String,
    pub manifest: PackageManifest,
    pub entries: Vec<MbonEntryView>,
    /// Files on disk that the manifest does not list.
    pub untracked: Vec<String>,
}

fn collect_entries(
    package_dir: &Path,
    node: &FhmManifestNode,
    folder: &str,
    depth: usize,
    payload: usize,
    out: &mut Vec<MbonEntryView>,
) {
    for (index, entry) in node.entries.iter().enumerate() {
        let disk = package_dir.join(&entry.path);
        let (kind, size, exists) = if entry.nested.is_some() {
            (MbonKind::Fhm, 0, disk.is_dir())
        } else {
            let head = std::fs::File::open(&disk)
                .ok()
                .map(|mut file| {
                    use std::io::Read;
                    let mut head = vec![0u8; 64];
                    let read = file.read(&mut head).unwrap_or(0);
                    head.truncate(read);
                    head
                })
                .unwrap_or_default();
            let size = std::fs::metadata(&disk).map(|meta| meta.len()).unwrap_or(0);
            let kind = if entry.path.ends_with(".list") {
                MbonKind::ListInfo
            } else {
                classify(&head)
            };
            (kind, size, disk.is_file())
        };
        out.push(MbonEntryView {
            folder: folder.to_string(),
            index,
            path: entry.path.clone(),
            depth,
            load_type: entry.load_type,
            unk_type: entry.unk_type,
            nested: entry.nested.is_some(),
            kind,
            label: kind.label(),
            size,
            exists,
            users: 0,
            payload,
        });
        if let Some(nested) = &entry.nested {
            collect_entries(package_dir, &nested.node, &entry.path, depth + 1, payload, out);
        }
    }
}

fn untracked_files(package_dir: &Path, listed: &std::collections::HashSet<String>) -> Vec<String> {
    let Ok(files) = scan::list_files(package_dir, &[]) else {
        return Vec::new();
    };
    files
        .into_iter()
        .filter_map(|path| {
            let relative = path.strip_prefix(package_dir).ok()?.to_string_lossy().replace('\\', "/");
            (relative != MANIFEST_NAME && !relative.ends_with(".tmp") && !listed.contains(&relative)).then_some(relative)
        })
        .collect()
}

#[tauri::command]
pub async fn mbon_package_view(package: String) -> Result<MbonPackageView, String> {
    blocking(move || {
        let dir = PathBuf::from(&package);
        let manifest = package::load_manifest(&dir).map_err(String::from)?;
        let mut entries = Vec::new();
        for (payload_index, payload) in manifest.payloads.iter().enumerate() {
            match &payload.fhm {
                Some(node) => collect_entries(&dir, node, &payload.path, 0, payload_index, &mut entries),
                None => {
                    let disk = dir.join(&payload.path);
                    let bytes = std::fs::read(&disk).unwrap_or_default();
                    let kind = classify(&bytes);
                    entries.push(MbonEntryView {
                        folder: String::new(),
                        index: payload_index,
                        path: payload.path.clone(),
                        depth: 0,
                        load_type: 0,
                        unk_type: 0,
                        nested: false,
                        kind,
                        label: kind.label(),
                        size: bytes.len() as u64,
                        exists: disk.is_file(),
                        users: 1,
                        payload: payload_index,
                    });
                }
            }
        }
        let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        for entry in entries.iter().filter(|entry| !entry.nested) {
            *counts.entry(entry.path.clone()).or_default() += 1;
        }
        for entry in &mut entries {
            entry.users = counts.get(&entry.path).copied().unwrap_or(1);
        }
        let listed: std::collections::HashSet<String> = entries.iter().map(|entry| entry.path.clone()).collect();
        let untracked = untracked_files(&dir, &listed);
        Ok(MbonPackageView {
            dir: package,
            manifest,
            entries,
            untracked,
        })
    })
    .await
}

fn default_output(package_dir: &Path, manifest: &PackageManifest) -> PathBuf {
    let workspace = package_dir.parent().unwrap_or(package_dir);
    if manifest.container.is_some() {
        package::default_output_path(workspace, &manifest.source_name)
    } else {
        let extension = manifest
            .payloads
            .first()
            .map(|payload| if payload.fhm.is_some() { "fhm" } else { "bin" })
            .unwrap_or("bin");
        workspace
            .join("_out")
            .join("payloads")
            .join(format!("{}.{extension}", manifest.source_name))
    }
}

#[tauri::command]
pub async fn mbon_repack(package: String, output: Option<String>) -> Result<RepackReport, String> {
    blocking(move || {
        let dir = PathBuf::from(package);
        let manifest = package::load_manifest(&dir).map_err(String::from)?;
        let output = output.map(PathBuf::from).unwrap_or_else(|| default_output(&dir, &manifest));
        package::repack_package(&dir, &output).map_err(String::from)
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MbonVerifyReport {
    pub rebuilt_len: usize,
    pub rebuilt_sha256: String,
    pub source_sha256: Option<String>,
    pub identical: bool,
    pub default_output: String,
}

#[tauri::command]
pub async fn mbon_verify(package: String) -> Result<MbonVerifyReport, String> {
    blocking(move || {
        let dir = PathBuf::from(package);
        let manifest = package::load_manifest(&dir).map_err(String::from)?;
        let (bytes, _) = package::build_package_bytes(&dir).map_err(String::from)?;
        let digest = exvs_ps4_common::digest::sha256_hex(&bytes);
        Ok(MbonVerifyReport {
            rebuilt_len: bytes.len(),
            identical: manifest.source_sha256.as_deref() == Some(digest.as_str()),
            rebuilt_sha256: digest,
            source_sha256: manifest.source_sha256.clone(),
            default_output: default_output(&dir, &manifest).to_string_lossy().into_owned(),
        })
    })
    .await
}

#[tauri::command]
pub async fn mbon_add_entry(
    package: String,
    folder: String,
    file: String,
    load_type: Option<u32>,
) -> Result<String, String> {
    blocking(move || package::add_entry(Path::new(&package), &folder, Path::new(&file), load_type).map_err(String::from))
        .await
}

#[tauri::command]
pub async fn mbon_remove_entry(package: String, folder: String, index: usize) -> Result<(), String> {
    blocking(move || package::remove_entry(Path::new(&package), &folder, index).map_err(String::from)).await
}

#[tauri::command]
pub async fn mbon_replace_entry(
    package: String,
    folder: String,
    index: usize,
    file: String,
    detach: bool,
) -> Result<String, String> {
    blocking(move || {
        let result = package::replace_entry(Path::new(&package), &folder, index, Path::new(&file), detach)
            .map_err(String::from)?;
        previews().invalidate_prefix(&Path::new(&package).join(&result).display().to_string());
        Ok(result)
    })
    .await
}

fn load_ntp3(path: &Path) -> Result<Ntp3, String> {
    Ntp3::parse(&read(path)?).map_err(String::from)
}

fn summaries(ntp3: &Ntp3) -> Vec<TextureSummary> {
    match exvs_mbon::inspect::inspect_bytes(&ntp3.to_bytes().unwrap_or_default()) {
        Ok(Inspection::Ntp3 { textures, .. }) => textures,
        _ => Vec::new(),
    }
}

#[tauri::command]
pub async fn mbon_nut_textures(path: String) -> Result<Vec<TextureSummary>, String> {
    blocking(move || Ok(summaries(&load_ntp3(Path::new(&path))?))).await
}

/// PNG preview of one texture, downscaled to `max_side` (cached).
#[tauri::command]
pub async fn mbon_nut_preview(path: String, texture: usize, max_side: Option<u32>) -> Result<Response, String> {
    let bytes = blocking(move || {
        let path = PathBuf::from(path);
        let side = max_side.unwrap_or(0);
        let key = file_key(&path, &format!("nut:{texture}:{side}"));
        if let Some(hit) = previews().get(&key) {
            return Ok(hit.as_ref().clone());
        }
        let ntp3 = load_ntp3(&path)?;
        let entry = ntp3
            .textures
            .get(texture)
            .ok_or_else(|| format!("texture {texture} does not exist"))?;
        let rgba = entry.decode_rgba().map_err(String::from)?;
        let (width, height, pixels) =
            texture::downscale_rgba(entry.width.into(), entry.height.into(), &rgba, side);
        let png = texture::encode_png(width, height, &pixels).map_err(String::from)?;
        Ok(previews().insert(key, png).as_ref().clone())
    })
    .await?;
    Ok(Response::new(InvokeBody::Raw(bytes)))
}

/// Export one texture as `png` or `dds` to `output`.
#[tauri::command]
pub async fn mbon_nut_export(path: String, texture: usize, output: String, format: String) -> Result<String, String> {
    blocking(move || {
        let ntp3 = load_ntp3(Path::new(&path))?;
        let entry = ntp3
            .textures
            .get(texture)
            .ok_or_else(|| format!("texture {texture} does not exist"))?;
        let bytes = match format.as_str() {
            "dds" => entry.to_dds(),
            _ => entry.to_png(),
        }
        .map_err(String::from)?;
        std::fs::write(&output, bytes).map_err(|error| format!("{output}: {error}"))?;
        Ok(output)
    })
    .await
}

fn parse_layout(text: &str) -> Result<PixelLayout, String> {
    match text.to_ascii_lowercase().as_str() {
        "bc1" => Ok(PixelLayout::Bc1),
        "bc2" => Ok(PixelLayout::Bc2),
        "bc3" => Ok(PixelLayout::Bc3),
        "argb8" | "rgba8" => Ok(PixelLayout::Argb8),
        other => Err(format!("unsupported NUT format '{other}'")),
    }
}

/// Replace one texture from a PNG or DDS file; returns the updated summaries.
#[tauri::command]
pub async fn mbon_nut_import(
    path: String,
    texture: usize,
    image: String,
    format: Option<String>,
    mips: Option<u32>,
) -> Result<Vec<TextureSummary>, String> {
    blocking(move || {
        let path = PathBuf::from(path);
        let mut ntp3 = load_ntp3(&path)?;
        let entry = ntp3
            .textures
            .get_mut(texture)
            .ok_or_else(|| format!("texture {texture} does not exist"))?;
        let input = read(Path::new(&image))?;
        if input.starts_with(b"DDS ") {
            entry.replace_from_dds(&input).map_err(String::from)?;
        } else {
            let (width, height, rgba) = texture::decode_png(&input).map_err(String::from)?;
            let layout = format.as_deref().map(parse_layout).transpose()?;
            entry
                .replace_from_rgba(width, height, &rgba, layout, mips)
                .map_err(String::from)?;
        }
        std::fs::write(&path, ntp3.to_bytes().map_err(String::from)?)
            .map_err(|error| format!("{}: {error}", path.display()))?;
        previews().invalidate_prefix(&path.display().to_string());
        Ok(summaries(&ntp3))
    })
    .await
}

/// Change the GIDX id that NUD materials use to find a texture.
#[tauri::command]
pub async fn mbon_nut_set_texture_id(path: String, texture: usize, texture_id: u32) -> Result<Vec<TextureSummary>, String> {
    blocking(move || {
        let path = PathBuf::from(path);
        let mut ntp3 = load_ntp3(&path)?;
        ntp3.textures
            .get_mut(texture)
            .ok_or_else(|| format!("texture {texture} does not exist"))?
            .texture_id = texture_id;
        std::fs::write(&path, ntp3.to_bytes().map_err(String::from)?)
            .map_err(|error| format!("{}: {error}", path.display()))?;
        Ok(summaries(&ntp3))
    })
    .await
}

/// Viewer meshes of a NUD file as a `PSM1` binary payload.
#[tauri::command]
pub async fn mbon_nud_mesh(path: String) -> Result<Response, String> {
    let bytes = blocking(move || {
        let bytes = read(Path::new(&path))?;
        let model = Nud::parse(&bytes).map_err(String::from)?;
        let meshes = model.mesh_buffers(&bytes).map_err(String::from)?;
        let texture_names: Vec<Option<String>> = meshes
            .iter()
            .map(|mesh| mesh.texture_ids.first().map(|id| format!("{id:08X}")))
            .collect();
        let inputs: Vec<MeshInput<'_>> = meshes
            .iter()
            .zip(&texture_names)
            .map(|(mesh, texture)| MeshInput {
                name: &mesh.name,
                material: None,
                texture: texture.as_deref(),
                positions: &mesh.positions,
                normals: &mesh.normals,
                uvs: &mesh.uvs,
                indices: &mesh.indices,
            })
            .collect();
        Ok(mesh_pack::pack(&inputs))
    })
    .await?;
    Ok(Response::new(InvokeBody::Raw(bytes)))
}

#[tauri::command]
pub async fn mbon_nud_export_obj(path: String, output: String) -> Result<String, String> {
    blocking(move || {
        let bytes = read(Path::new(&path))?;
        let model = Nud::parse(&bytes).map_err(String::from)?;
        std::fs::write(&output, model.to_obj(&bytes).map_err(String::from)?)
            .map_err(|error| format!("{output}: {error}"))?;
        Ok(output)
    })
    .await
}

/// Locate a texture by GIDX id among the NUT files of a package folder tree.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MbonTextureRef {
    pub path: String,
    pub texture: usize,
}

#[tauri::command]
pub async fn mbon_find_textures(package: String) -> Result<std::collections::HashMap<String, MbonTextureRef>, String> {
    blocking(move || {
        let dir = PathBuf::from(package);
        let mut out = std::collections::HashMap::new();
        for path in scan::list_files(&dir, &["nut"]).map_err(String::from)? {
            let Ok(bytes) = std::fs::read(&path) else { continue };
            let Ok(ntp3) = Ntp3::parse(&bytes) else { continue };
            for (index, texture) in ntp3.textures.iter().enumerate() {
                out.entry(format!("{:08X}", texture.texture_id)).or_insert(MbonTextureRef {
                    path: path.to_string_lossy().into_owned(),
                    texture: index,
                });
            }
        }
        Ok(out)
    })
    .await
}

fn parse_kind(text: &str) -> Result<CellKind, String> {
    Ok(match text {
        "u8" => CellKind::U8,
        "u16" => CellKind::U16,
        "u32" => CellKind::U32,
        "i32" => CellKind::I32,
        "f32" => CellKind::F32,
        "string" => CellKind::String,
        other => return Err(format!("unknown cell kind '{other}'")),
    })
}

fn edit_list(path: &str, edit: impl FnOnce(&mut ListInfo) -> Result<(), String>) -> Result<ListView, String> {
    let path = PathBuf::from(path);
    let mut list = ListInfo::parse(&read(&path)?).map_err(String::from)?;
    edit(&mut list)?;
    std::fs::write(&path, list.to_bytes()).map_err(|error| format!("{}: {error}", path.display()))?;
    list.view().map_err(String::from)
}

#[tauri::command]
pub async fn mbon_list_view(path: String) -> Result<ListView, String> {
    blocking(move || {
        ListInfo::parse(&read(Path::new(&path))?)
            .and_then(|list| list.view())
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub async fn mbon_list_set(path: String, row: usize, offset: usize, kind: String, value: String) -> Result<ListView, String> {
    blocking(move || {
        let kind = parse_kind(&kind)?;
        edit_list(&path, |list| list.set(row, offset, kind, &value).map_err(String::from))
    })
    .await
}

#[tauri::command]
pub async fn mbon_list_add_row(path: String, template: Option<usize>) -> Result<ListView, String> {
    blocking(move || edit_list(&path, |list| list.add_row(template).map(|_| ()).map_err(String::from))).await
}

#[tauri::command]
pub async fn mbon_list_remove_row(path: String, row: usize) -> Result<ListView, String> {
    blocking(move || edit_list(&path, |list| list.remove_row(row).map_err(String::from))).await
}

/// Raw bytes for the hex viewer (at most 1 MiB per call).
#[tauri::command]
pub async fn mbon_read_bytes(path: String, offset: u64, length: u32) -> Result<Response, String> {
    let bytes = blocking(move || {
        let path = PathBuf::from(path);
        let size = std::fs::metadata(&path)
            .map_err(|error| format!("{}: {error}", path.display()))?
            .len();
        let start = offset.min(size);
        let length = u64::from(length.min(MAX_READ_BYTES)).min(size - start);
        exvs_ps4_common::archive::read_range(&path, start, length).map_err(String::from)
    })
    .await?;
    Ok(Response::new(InvokeBody::Raw(bytes)))
}

/// Summary of an FHM file on disk (entry listing) without extracting it.
#[tauri::command]
pub async fn mbon_fhm_listing(path: String) -> Result<Vec<exvs_mbon::fhm::FhmListing>, String> {
    blocking(move || {
        FhmDocument::parse(&read(Path::new(&path))?)
            .map(|document| document.listing())
            .map_err(String::from)
    })
    .await
}

#[tauri::command]
pub fn mbon_credits() -> Provenance {
    provenance::mbon()
}

#[tauri::command]
pub async fn mbon_open_index(root: String) -> Result<exvs_ps4_common::init_index::OpenIndex, String> {
    blocking(move || exvs_mbon::open_index(Path::new(&root)).map_err(String::from)).await
}

#[tauri::command]
pub async fn mbon_edit_model(path: String) -> Result<exvs_mbon::edit::ModelEdit, String> {
    blocking(move || {
        let bytes = read(Path::new(&path))?;
        exvs_mbon::edit_model(&bytes).map_err(String::from)
    })
    .await
}

#[tauri::command]
pub async fn mbon_edit_scene(
    document: String,
    name: String,
    x: f32,
    y: f32,
    z: f32,
) -> Result<String, String> {
    blocking(move || exvs_mbon::edit_scene(&document, &name, x, y, z).map_err(String::from)).await
}

#[tauri::command]
pub async fn mbon_edit_detail(
    path: String,
    row: usize,
    column: usize,
    kind: String,
    value: String,
) -> Result<exvs_mbon::edit::DetailEdit, String> {
    blocking(move || {
        let cell = match kind.as_str() {
            "u8" => exvs_mbon::list_info::CellKind::U8,
            "u16" => exvs_mbon::list_info::CellKind::U16,
            "u32" => exvs_mbon::list_info::CellKind::U32,
            "i32" => exvs_mbon::list_info::CellKind::I32,
            "f32" => exvs_mbon::list_info::CellKind::F32,
            "string" => exvs_mbon::list_info::CellKind::String,
            other => return Err(format!("unknown cell kind {other}")),
        };
        let bytes = read(Path::new(&path))?;
        exvs_mbon::edit_detail(&bytes, row, column, cell, &value).map_err(String::from)
    })
    .await
}

#[tauri::command]
pub async fn mbon_inspect_msc(path: String) -> Result<exvs_ps4_common::msc_header::MscHeader, String> {
    blocking(move || {
        let bytes = read(Path::new(&path))?;
        exvs_mbon::inspect_msc(&bytes).map_err(String::from)
    })
    .await
}
