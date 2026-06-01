use serde::{Deserialize, Serialize};

use crate::ssbh_dae::ModlEntryConfig;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SceneSource {
    Fhm2d { path: String },
    Folder { path: String },
    New,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HktSimplifyConfig {
    pub enabled: bool,
    /// Maximum angle (degrees) between mergeable face normals.
    pub planarity_angle_deg: f64,
    pub min_triangle_area: f64,
    pub weld_epsilon: f64,
    #[serde(default)]
    pub target_triangle_ratio: Option<f64>,
    #[serde(default)]
    pub max_target_triangles: Option<usize>,
}

impl Default for HktSimplifyConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            planarity_angle_deg: 15.0,
            min_triangle_area: 1e-6,
            weld_epsilon: 1e-3,
            target_triangle_ratio: None,
            max_target_triangles: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConfig {
    pub load_to_scene: bool,
    pub convert_to_ssbh: bool,
    pub generate_hkt: bool,
    pub ssbh_config: Option<SsbhConvertConfig>,
    #[serde(default)]
    pub hkt_simplify: HktSimplifyConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SsbhConvertConfig {
    pub base_filename: String,
    pub scale_factor: f64,
    pub up_axis: String,
    #[serde(default)]
    pub flip_uv: bool,
    pub write_numdlb: bool,
    pub write_numshb: bool,
    pub write_nusktb: bool,
    pub write_numatb: bool,
    pub write_jnttbl: bool,
    pub write_maya_profile: bool,
    pub material_template: Option<String>,
    #[serde(default)]
    pub maya_file: Option<serde_json::Value>,
    #[serde(default)]
    pub nust_file: Option<serde_json::Value>,
    #[serde(default)]
    pub numdlb_entries: Vec<ModlEntryConfig>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SsbhArtifacts {
    pub numdlb: Vec<u8>,
    pub numshb: Vec<u8>,
    pub nusktb: Option<Vec<u8>>,
    pub numatb: Vec<u8>,
    pub maya_numatb: Option<Vec<u8>>,
    pub jnttbl: Vec<u8>,
}

#[derive(Debug)]
pub struct SsbhArtifactPaths {
    pub root_dir: PathBuf,
    pub numdlb: Option<PathBuf>,
    pub numshb: Option<PathBuf>,
    pub nusktb: Option<PathBuf>,
    pub numatb: Option<PathBuf>,
    pub maya_numatb: Option<PathBuf>,
    pub jnttbl: Option<PathBuf>,
}

impl SsbhArtifactPaths {
    pub fn payload_bytes(&self) -> u64 {
        [
            self.numdlb.as_ref(),
            self.numshb.as_ref(),
            self.nusktb.as_ref(),
            self.numatb.as_ref(),
            self.maya_numatb.as_ref(),
            self.jnttbl.as_ref(),
        ]
        .into_iter()
        .flatten()
        .filter_map(|path| std::fs::metadata(path).ok())
        .map(|meta| meta.len())
        .sum()
    }

    pub fn file_count(&self) -> usize {
        [
            self.numdlb.as_ref(),
            self.numshb.as_ref(),
            self.nusktb.as_ref(),
            self.numatb.as_ref(),
            self.maya_numatb.as_ref(),
            self.jnttbl.as_ref(),
        ]
        .into_iter()
        .flatten()
        .filter(|path| path.is_file())
        .count()
    }

    pub fn read_artifacts(&self) -> Result<SsbhArtifacts, String> {
        let read_optional =
            |label: &str, path: &Option<PathBuf>| -> Result<Option<Vec<u8>>, String> {
                path.as_ref()
                    .map(|path| {
                        std::fs::read(path).map_err(|e| {
                            format!("Failed to read generated {label} {}: {e}", path.display())
                        })
                    })
                    .transpose()
            };
        Ok(SsbhArtifacts {
            numdlb: read_optional("numdlb", &self.numdlb)?.unwrap_or_default(),
            numshb: read_optional("numshb", &self.numshb)?.unwrap_or_default(),
            nusktb: read_optional("nusktb", &self.nusktb)?,
            numatb: read_optional("nust numatb", &self.numatb)?.unwrap_or_default(),
            maya_numatb: read_optional("maya numatb", &self.maya_numatb)?,
            jnttbl: read_optional("jnttbl", &self.jnttbl)?.unwrap_or_default(),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HavokCollisionData {
    pub source_id: String,
    pub display_name: String,
    pub object_node_id: Option<String>,
    pub hkt_xml: String,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug)]
pub struct PendingImport {
    pub id: String,
    pub name: String,
    pub source_name: String,
    pub source_path: Option<PathBuf>,
    pub dae_bytes: Vec<u8>,
    pub config: ImportConfig,
    pub ssbh_artifacts: Option<SsbhArtifacts>,
    pub ssbh_artifact_paths: Option<SsbhArtifactPaths>,
    pub hkt_bytes: Option<Vec<u8>>,
}

impl Drop for PendingImport {
    fn drop(&mut self) {
        cleanup_ssbh_artifact_paths(self.ssbh_artifact_paths.take());
    }
}

fn cleanup_ssbh_artifact_paths(paths: Option<SsbhArtifactPaths>) {
    let Some(paths) = paths else {
        return;
    };
    if paths.root_dir.is_dir() {
        let _ = std::fs::remove_dir_all(paths.root_dir);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphicParam {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacementEntry {
    pub vdk_type: String,
    pub object_number: Option<i32>,
    pub pos_x: f64,
    pub pos_y: f64,
    pub pos_z: f64,
    pub rot_x: f64,
    pub rot_y: f64,
    pub rot_z: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub scale_z: f64,
    pub raw_fields: Vec<String>,
}

#[derive(Debug)]
pub struct StageBundleMemory {
    pub root_files: HashMap<String, Vec<u8>>,
    pub sub_model_files: HashMap<String, HashMap<String, Vec<u8>>>,
}

#[derive(Debug)]
pub struct SceneMemorySession {
    pub session_id: String,
    pub source: SceneSource,
    pub base_bundle: Option<StageBundleMemory>,
    pub pending_imports: Vec<PendingImport>,
    pub placement_header: Vec<String>,
    pub placement_entries: Vec<PlacementEntry>,
    pub graphic_params: Vec<GraphicParam>,
    pub havok_data: Vec<HavokCollisionData>,
    pub dirty: bool,
}

impl SceneMemorySession {
    pub fn new(session_id: String, source: SceneSource) -> Self {
        Self {
            session_id,
            source,
            base_bundle: None,
            pending_imports: Vec::new(),
            placement_header: Vec::new(),
            placement_entries: Vec::new(),
            graphic_params: Vec::new(),
            havok_data: Vec::new(),
            dirty: false,
        }
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    pub fn add_import(&mut self, name: String, dae_bytes: Vec<u8>) -> String {
        let source_name = if name.ends_with(".dae") || name.ends_with(".fbx") {
            name.clone()
        } else {
            format!("{name}.dae")
        };
        self.add_import_with_source_name(name, source_name, dae_bytes)
    }

    pub fn add_import_with_source_name(
        &mut self,
        name: String,
        source_name: String,
        dae_bytes: Vec<u8>,
    ) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        self.pending_imports.push(PendingImport {
            id: id.clone(),
            name,
            source_name,
            source_path: None,
            dae_bytes,
            config: ImportConfig {
                load_to_scene: true,
                convert_to_ssbh: false,
                generate_hkt: false,
                ssbh_config: None,
                hkt_simplify: HktSimplifyConfig::default(),
            },
            ssbh_artifacts: None,
            ssbh_artifact_paths: None,
            hkt_bytes: None,
        });
        self.dirty = true;
        id
    }

    pub fn add_import_from_path(&mut self, name: String, path: &Path) -> Result<String, String> {
        if !path.is_file() {
            return Err(format!("Static mesh file not found: {}", path.display()));
        }
        let source_name = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| {
                if name.ends_with(".dae") || name.ends_with(".fbx") {
                    name.clone()
                } else {
                    format!("{name}.dae")
                }
            });
        let id = uuid::Uuid::new_v4().to_string();
        self.pending_imports.push(PendingImport {
            id: id.clone(),
            name,
            source_name,
            source_path: Some(path.to_path_buf()),
            dae_bytes: Vec::new(),
            config: ImportConfig {
                load_to_scene: true,
                convert_to_ssbh: false,
                generate_hkt: false,
                ssbh_config: None,
                hkt_simplify: HktSimplifyConfig::default(),
            },
            ssbh_artifacts: None,
            ssbh_artifact_paths: None,
            hkt_bytes: None,
        });
        self.dirty = true;
        Ok(id)
    }

    pub fn find_import_mut(&mut self, import_id: &str) -> Result<&mut PendingImport, String> {
        self.pending_imports
            .iter_mut()
            .find(|i| i.id == import_id)
            .ok_or_else(|| format!("Import '{import_id}' not found in session"))
    }

    pub fn remove_import(&mut self, import_id: &str) -> Result<(), String> {
        let idx = self
            .pending_imports
            .iter()
            .position(|i| i.id == import_id)
            .ok_or_else(|| format!("Import '{import_id}' not found in session"))?;
        self.pending_imports.remove(idx);
        self.dirty = true;
        Ok(())
    }

    pub fn find_import(&self, import_id: &str) -> Result<&PendingImport, String> {
        self.pending_imports
            .iter()
            .find(|i| i.id == import_id)
            .ok_or_else(|| format!("Import '{import_id}' not found in session"))
    }

    pub fn store_ssbh_artifacts(
        &mut self,
        import_id: &str,
        artifacts: SsbhArtifacts,
    ) -> Result<(), String> {
        let import = self.find_import_mut(import_id)?;
        cleanup_ssbh_artifact_paths(import.ssbh_artifact_paths.take());
        import.ssbh_artifacts = Some(artifacts);
        self.dirty = true;
        Ok(())
    }

    pub fn store_ssbh_artifact_paths(
        &mut self,
        import_id: &str,
        artifacts: SsbhArtifactPaths,
    ) -> Result<(), String> {
        let import = self.find_import_mut(import_id)?;
        cleanup_ssbh_artifact_paths(import.ssbh_artifact_paths.take());
        import.ssbh_artifacts = None;
        import.ssbh_artifact_paths = Some(artifacts);
        self.dirty = true;
        Ok(())
    }

    pub fn store_hkt_bytes(&mut self, import_id: &str, hkt_bytes: Vec<u8>) -> Result<(), String> {
        let import = self.find_import_mut(import_id)?;
        import.hkt_bytes = Some(hkt_bytes);
        self.dirty = true;
        Ok(())
    }

    pub fn import_has_ssbh_artifacts(import: &PendingImport) -> bool {
        import.ssbh_artifacts.is_some() || import.ssbh_artifact_paths.is_some()
    }

    pub fn read_import_ssbh_artifacts(import: &PendingImport) -> Result<SsbhArtifacts, String> {
        if let Some(artifacts) = import.ssbh_artifacts.as_ref() {
            return Ok(artifacts.clone());
        }
        if let Some(paths) = import.ssbh_artifact_paths.as_ref() {
            return paths.read_artifacts();
        }
        Err(format!("Import '{}' has no SSBH artifacts", import.id))
    }

    pub fn import_ssbh_artifact_payload_bytes(import: &PendingImport) -> u64 {
        if let Some(artifacts) = import.ssbh_artifacts.as_ref() {
            return artifacts.numdlb.len() as u64
                + artifacts.numshb.len() as u64
                + artifacts.nusktb.as_ref().map_or(0, |v| v.len() as u64)
                + artifacts.numatb.len() as u64
                + artifacts.maya_numatb.as_ref().map_or(0, |v| v.len() as u64)
                + artifacts.jnttbl.len() as u64;
        }
        import
            .ssbh_artifact_paths
            .as_ref()
            .map_or(0, SsbhArtifactPaths::payload_bytes)
    }

    pub fn upsert_havok_data(&mut self, data: HavokCollisionData) {
        if let Some(existing) = self
            .havok_data
            .iter_mut()
            .find(|d| d.source_id == data.source_id)
        {
            *existing = data;
        } else {
            self.havok_data.push(data);
        }
        self.dirty = true;
    }

    pub fn get_havok_data(&self, source_id: &str) -> Option<&HavokCollisionData> {
        self.havok_data.iter().find(|d| d.source_id == source_id)
    }

    pub fn remove_havok_data(&mut self, source_id: &str) -> Result<(), String> {
        let idx = self
            .havok_data
            .iter()
            .position(|d| d.source_id == source_id)
            .ok_or_else(|| format!("HavokData '{source_id}' not found in session"))?;
        self.havok_data.remove(idx);
        self.dirty = true;
        Ok(())
    }

    /// Forget an in-memory model identified by its on-disk folder name.
    ///
    /// A model imported as DAE and converted to SSBH stays in `pending_imports`
    /// (so it can be re-edited before disk parity exists). `collect_save_artifacts`
    /// re-emits it on every save, which means a folder deleted on disk during a
    /// save is immediately re-materialized from the lingering import. Forgetting
    /// the model drops both its pending import and any base-bundle sub-model files
    /// so the next save commits the deletion. Memory-only — disk is untouched.
    /// Returns true when something was removed.
    pub fn forget_model(&mut self, folder_name: &str) -> bool {
        let before = self.pending_imports.len();
        self.pending_imports.retain(|import| {
            let import_folder = import
                .config
                .ssbh_config
                .as_ref()
                .map(|c| c.base_filename.as_str())
                .unwrap_or(import.name.as_str());
            import_folder != folder_name
        });
        let mut removed = before != self.pending_imports.len();

        if let Some(bundle) = self.base_bundle.as_mut() {
            if bundle.sub_model_files.remove(folder_name).is_some() {
                removed = true;
            }
        }

        if removed {
            self.dirty = true;
        }
        removed
    }

    /// Forget the in-memory base model (root SSBH files) so a save commits its
    /// deletion instead of re-writing the cached root files. Memory-only.
    /// Returns true when base-bundle root files were present and cleared.
    pub fn forget_base_model(&mut self) -> bool {
        if let Some(bundle) = self.base_bundle.as_mut() {
            if !bundle.root_files.is_empty() {
                bundle.root_files.clear();
                self.dirty = true;
                return true;
            }
        }
        false
    }

    pub fn collect_save_artifacts(&self) -> Vec<SaveArtifact> {
        let mut artifacts = Vec::new();

        if let Some(bundle) = &self.base_bundle {
            for (name, bytes) in &bundle.root_files {
                artifacts.push(SaveArtifact {
                    relative_path: name.clone(),
                    data: bytes.clone(),
                });
            }
            for (folder, files) in &bundle.sub_model_files {
                for (name, bytes) in files {
                    artifacts.push(SaveArtifact {
                        relative_path: format!("{folder}/{name}"),
                        data: bytes.clone(),
                    });
                }
            }
        }

        for import in &self.pending_imports {
            if Self::import_has_ssbh_artifacts(import) {
                let Ok(ssbh) = Self::read_import_ssbh_artifacts(import) else {
                    continue;
                };
                let base = import
                    .config
                    .ssbh_config
                    .as_ref()
                    .map(|c| c.base_filename.as_str())
                    .unwrap_or(&import.name);
                // Model files go inside {base}/0/ subfolder and must match numdlb references.
                let model_dir = format!("{base}/0");
                artifacts.push(SaveArtifact {
                    relative_path: format!("{model_dir}/{base}.numdlb"),
                    data: ssbh.numdlb.clone(),
                });
                artifacts.push(SaveArtifact {
                    relative_path: format!("{model_dir}/{base}.numshb"),
                    data: ssbh.numshb.clone(),
                });
                if let Some(ref nusktb) = ssbh.nusktb {
                    artifacts.push(SaveArtifact {
                        relative_path: format!("{model_dir}/{base}.nusktb"),
                        data: nusktb.clone(),
                    });
                }
                if !ssbh.numatb.is_empty() {
                    artifacts.push(SaveArtifact {
                        relative_path: format!("{model_dir}/{base}__nust__.numatb"),
                        data: ssbh.numatb.clone(),
                    });
                }
                if let Some(ref maya) = ssbh.maya_numatb {
                    artifacts.push(SaveArtifact {
                        relative_path: format!("{model_dir}/{base}__maya__.numatb"),
                        data: maya.clone(),
                    });
                }
                let write_jnttbl = import
                    .config
                    .ssbh_config
                    .as_ref()
                    .map(|c| c.write_jnttbl)
                    .unwrap_or(true);
                if write_jnttbl {
                    artifacts.push(SaveArtifact {
                        relative_path: format!("{model_dir}/{base}.jnttbl"),
                        data: ssbh.jnttbl,
                    });
                }
            }
            // EXVS stage model collision is stored at the model folder root.
            if let Some(ref hkt) = import.hkt_bytes {
                let base = import
                    .config
                    .ssbh_config
                    .as_ref()
                    .map(|c| c.base_filename.as_str())
                    .unwrap_or(&import.name);
                artifacts.push(SaveArtifact {
                    relative_path: format!("{base}/map_hit.hkt"),
                    data: hkt.clone(),
                });
            }
        }

        artifacts
    }

    pub fn mark_clean(&mut self) {
        self.dirty = false;
    }
}

#[derive(Debug, Clone)]
pub struct SaveArtifact {
    pub relative_path: String,
    pub data: Vec<u8>,
}

#[derive(Default)]
pub struct SceneSessionState {
    pub sessions: Mutex<HashMap<String, SceneMemorySession>>,
}

impl SceneSessionState {
    pub fn create_session(&self, source: SceneSource) -> String {
        let session_id = uuid::Uuid::new_v4().to_string();
        let session = SceneMemorySession::new(session_id.clone(), source);
        self.sessions
            .lock()
            .unwrap()
            .insert(session_id.clone(), session);
        session_id
    }

    pub fn destroy_session(&self, session_id: &str) -> Result<(), String> {
        self.sessions
            .lock()
            .unwrap()
            .remove(session_id)
            .map(|_| ())
            .ok_or_else(|| format!("Session '{session_id}' not found"))
    }

    pub fn with_session<F, R>(&self, session_id: &str, f: F) -> Result<R, String>
    where
        F: FnOnce(&SceneMemorySession) -> Result<R, String>,
    {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session '{session_id}' not found"))?;
        if session.session_id() != session_id {
            return Err(format!("Session id mismatch for '{session_id}'"));
        }
        f(session)
    }

    pub fn with_session_mut<F, R>(&self, session_id: &str, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut SceneMemorySession) -> Result<R, String>,
    {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session '{session_id}' not found"))?;
        if session.session_id() != session_id {
            return Err(format!("Session id mismatch for '{session_id}'"));
        }
        f(session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_session() -> SceneMemorySession {
        SceneMemorySession::new("test-session".into(), SceneSource::New)
    }

    #[test]
    fn session_starts_clean() {
        let s = new_session();
        assert!(!s.dirty);
        assert!(s.pending_imports.is_empty());
        assert!(s.havok_data.is_empty());
        assert!(s.placement_entries.is_empty());
    }

    #[test]
    fn add_import_sets_dirty_and_returns_id() {
        let mut s = new_session();
        let id = s.add_import("model.dae".into(), vec![1, 2, 3]);
        assert!(!id.is_empty());
        assert!(s.dirty);
        assert_eq!(s.pending_imports.len(), 1);
        assert_eq!(s.pending_imports[0].name, "model.dae");
        assert_eq!(s.pending_imports[0].dae_bytes, vec![1, 2, 3]);
        assert!(s.pending_imports[0].config.load_to_scene);
        assert!(!s.pending_imports[0].config.convert_to_ssbh);
    }

    #[test]
    fn find_import_returns_ref() {
        let mut s = new_session();
        let id = s.add_import("test.dae".into(), vec![]);
        let import = s.find_import(&id).unwrap();
        assert_eq!(import.name, "test.dae");
    }

    #[test]
    fn find_import_missing_returns_error() {
        let s = new_session();
        let result = s.find_import("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn remove_import_works() {
        let mut s = new_session();
        let id = s.add_import("model.dae".into(), vec![]);
        assert_eq!(s.pending_imports.len(), 1);
        s.remove_import(&id).unwrap();
        assert!(s.pending_imports.is_empty());
    }

    #[test]
    fn remove_import_missing_returns_error() {
        let mut s = new_session();
        let result = s.remove_import("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn configure_import_updates_config() {
        let mut s = new_session();
        let id = s.add_import("model.dae".into(), vec![]);
        let config = ImportConfig {
            load_to_scene: false,
            convert_to_ssbh: true,
            generate_hkt: true,
            ssbh_config: Some(SsbhConvertConfig {
                base_filename: "custom_name".into(),
                scale_factor: 2.0,
                up_axis: "z_up".into(),
                flip_uv: false,
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: false,
                write_numatb: true,
                write_jnttbl: true,
                write_maya_profile: false,
                material_template: None,
                maya_file: None,
                nust_file: None,
                numdlb_entries: Vec::new(),
            }),
            hkt_simplify: HktSimplifyConfig::default(),
        };
        let import = s.find_import_mut(&id).unwrap();
        import.config = config;
        let import = s.find_import(&id).unwrap();
        assert!(import.config.convert_to_ssbh);
        assert!(import.config.generate_hkt);
        assert_eq!(
            import.config.ssbh_config.as_ref().unwrap().base_filename,
            "custom_name"
        );
    }

    #[test]
    fn store_ssbh_artifacts_attaches_to_import() {
        let mut s = new_session();
        let id = s.add_import("model.dae".into(), vec![]);
        let artifacts = SsbhArtifacts {
            numdlb: vec![10],
            numshb: vec![20],
            nusktb: Some(vec![30]),
            numatb: vec![40],
            maya_numatb: None,
            jnttbl: vec![50],
        };
        s.store_ssbh_artifacts(&id, artifacts).unwrap();
        let import = s.find_import(&id).unwrap();
        assert!(import.ssbh_artifacts.is_some());
        assert_eq!(import.ssbh_artifacts.as_ref().unwrap().numdlb, vec![10]);
    }

    #[test]
    fn add_import_from_path_keeps_source_path_without_reading_bytes() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("large.fbx");
        std::fs::write(&source, [1u8, 2, 3, 4]).unwrap();
        let mut s = new_session();

        let id = s.add_import_from_path("large".into(), &source).unwrap();
        let import = s.find_import(&id).unwrap();

        assert_eq!(import.source_name, "large.fbx");
        assert_eq!(import.source_path.as_deref(), Some(source.as_path()));
        assert!(import.dae_bytes.is_empty());
    }

    #[test]
    fn collect_save_artifacts_reads_path_backed_ssbh_artifacts() {
        let temp = tempfile::tempdir().unwrap();
        let numdlb = temp.path().join("model.numdlb");
        let numshb = temp.path().join("model.numshb");
        let numatb = temp.path().join("model__nust__.numatb");
        std::fs::write(&numdlb, [1u8]).unwrap();
        std::fs::write(&numshb, [2u8]).unwrap();
        std::fs::write(&numatb, [3u8]).unwrap();

        let mut s = new_session();
        let id = s.add_import("test_model".into(), vec![]);
        {
            let import = s.find_import_mut(&id).unwrap();
            import.config.convert_to_ssbh = true;
            import.config.ssbh_config = Some(SsbhConvertConfig {
                base_filename: "mymodel".into(),
                scale_factor: 1.0,
                up_axis: "y_up".into(),
                flip_uv: false,
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: true,
                write_numatb: true,
                write_jnttbl: false,
                write_maya_profile: false,
                material_template: None,
                maya_file: None,
                nust_file: None,
                numdlb_entries: Vec::new(),
            });
        }

        s.store_ssbh_artifact_paths(
            &id,
            SsbhArtifactPaths {
                root_dir: temp.path().to_path_buf(),
                numdlb: Some(numdlb),
                numshb: Some(numshb),
                nusktb: None,
                numatb: Some(numatb),
                maya_numatb: None,
                jnttbl: None,
            },
        )
        .unwrap();

        let artifacts = s.collect_save_artifacts();
        assert!(artifacts
            .iter()
            .any(|a| a.relative_path == "mymodel/0/mymodel.numshb" && a.data == vec![2]));
        assert!(artifacts
            .iter()
            .any(|a| a.relative_path == "mymodel/0/mymodel__nust__.numatb" && a.data == vec![3]));
    }

    #[test]
    fn store_hkt_bytes_attaches_to_import() {
        let mut s = new_session();
        let id = s.add_import("model.dae".into(), vec![]);
        s.store_hkt_bytes(&id, vec![0x48, 0x4B]).unwrap();
        let import = s.find_import(&id).unwrap();
        assert!(import.hkt_bytes.is_some());
    }

    #[test]
    fn add_and_get_havok_data() {
        let mut s = new_session();
        s.upsert_havok_data(HavokCollisionData {
            source_id: "col_1".into(),
            display_name: "col_1".into(),
            object_node_id: None,
            hkt_xml: "<hkt/>".into(),
            raw_bytes: vec![1, 2],
        });
        assert_eq!(s.havok_data.len(), 1);
        let data = s.get_havok_data("col_1").unwrap();
        assert_eq!(data.hkt_xml, "<hkt/>");
        assert!(s.get_havok_data("nonexistent").is_none());
    }

    #[test]
    fn collect_save_artifacts_from_ssbh_imports() {
        let mut s = new_session();
        let id = s.add_import("test_model".into(), vec![]);
        {
            let import = s.find_import_mut(&id).unwrap();
            import.config.convert_to_ssbh = true;
            import.config.ssbh_config = Some(SsbhConvertConfig {
                base_filename: "mymodel".into(),
                scale_factor: 1.0,
                up_axis: "y_up".into(),
                flip_uv: false,
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: true,
                write_numatb: true,
                write_jnttbl: true,
                write_maya_profile: false,
                material_template: None,
                maya_file: None,
                nust_file: None,
                numdlb_entries: Vec::new(),
            });
        }
        s.store_ssbh_artifacts(
            &id,
            SsbhArtifacts {
                numdlb: vec![1],
                numshb: vec![2],
                nusktb: Some(vec![3]),
                numatb: vec![4],
                maya_numatb: None,
                jnttbl: vec![5],
            },
        )
        .unwrap();
        s.store_hkt_bytes(&id, vec![6, 7]).unwrap();

        let artifacts = s.collect_save_artifacts();
        let paths: Vec<&str> = artifacts.iter().map(|a| a.relative_path.as_str()).collect();
        assert!(paths.contains(&"mymodel/0/mymodel.numdlb"));
        assert!(paths.contains(&"mymodel/0/mymodel.numshb"));
        assert!(paths.contains(&"mymodel/0/mymodel.nusktb"));
        assert!(paths.contains(&"mymodel/0/mymodel__nust__.numatb"));
        assert!(paths.contains(&"mymodel/0/mymodel.jnttbl"));
        assert!(paths.contains(&"mymodel/map_hit.hkt"));
        assert!(!paths.contains(&"mymodel/test_model.hkt"));
        assert!(!paths.contains(&"mymodel/0/model__maya__.numatb"));
    }

    #[test]
    fn forget_model_drops_converted_import_so_save_commits_deletion() {
        let mut s = new_session();
        let id = s.add_import("test_model".into(), vec![]);
        {
            let import = s.find_import_mut(&id).unwrap();
            import.config.convert_to_ssbh = true;
            import.config.ssbh_config = Some(SsbhConvertConfig {
                base_filename: "mymodel".into(),
                scale_factor: 1.0,
                up_axis: "y_up".into(),
                flip_uv: false,
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: true,
                write_numatb: true,
                write_jnttbl: true,
                write_maya_profile: false,
                material_template: None,
                maya_file: None,
                nust_file: None,
                numdlb_entries: Vec::new(),
            });
        }
        s.store_ssbh_artifacts(
            &id,
            SsbhArtifacts {
                numdlb: vec![1],
                numshb: vec![2],
                nusktb: Some(vec![3]),
                numatb: vec![4],
                maya_numatb: None,
                jnttbl: vec![5],
            },
        )
        .unwrap();

        // Before: the converted import is re-emitted on every save.
        assert!(s
            .collect_save_artifacts()
            .iter()
            .any(|a| a.relative_path.starts_with("mymodel/")));

        // Forgetting it by its on-disk folder name removes it from the session.
        assert!(s.forget_model("mymodel"));
        assert!(s.pending_imports.is_empty());
        assert!(s
            .collect_save_artifacts()
            .iter()
            .all(|a| !a.relative_path.starts_with("mymodel/")));

        // Forgetting an unknown folder is a no-op.
        assert!(!s.forget_model("mymodel"));
    }

    #[test]
    fn forget_model_drops_base_bundle_sub_model_files() {
        let mut s = new_session();
        let mut sub_files = HashMap::new();
        let mut sky_files = HashMap::new();
        sky_files.insert("0/sky.numdlb".into(), vec![1, 2]);
        sub_files.insert("sky".to_string(), sky_files);
        s.base_bundle = Some(StageBundleMemory {
            root_files: HashMap::new(),
            sub_model_files: sub_files,
        });

        assert!(s.forget_model("sky"));
        assert!(s
            .collect_save_artifacts()
            .iter()
            .all(|a| !a.relative_path.starts_with("sky/")));
        assert!(!s.forget_model("sky"));
    }

    #[test]
    fn forget_base_model_clears_root_files() {
        let mut s = new_session();
        let mut root_files = HashMap::new();
        root_files.insert("stage.numdlb".into(), vec![1, 2]);
        s.base_bundle = Some(StageBundleMemory {
            root_files,
            sub_model_files: HashMap::new(),
        });

        assert!(s.forget_base_model());
        assert!(s.collect_save_artifacts().is_empty());
        assert!(!s.forget_base_model());
    }

    #[test]
    fn collect_save_artifacts_includes_base_bundle() {
        let mut s = new_session();
        let mut root_files = HashMap::new();
        root_files.insert("placement.csv".into(), vec![10, 20]);
        s.base_bundle = Some(StageBundleMemory {
            root_files,
            sub_model_files: HashMap::new(),
        });
        let artifacts = s.collect_save_artifacts();
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0].relative_path, "placement.csv");
    }

    #[test]
    fn mark_clean_clears_dirty() {
        let mut s = new_session();
        s.add_import("x".into(), vec![]);
        assert!(s.dirty);
        s.mark_clean();
        assert!(!s.dirty);
    }

    #[test]
    fn session_state_create_and_destroy() {
        let state = SceneSessionState::default();
        let id = state.create_session(SceneSource::New);
        assert!(state
            .with_session(&id, |s| Ok(s.session_id().to_string()))
            .is_ok());
        state.destroy_session(&id).unwrap();
        assert!(state.with_session(&id, |_| Ok(())).is_err());
    }

    #[test]
    fn session_state_destroy_missing_returns_error() {
        let state = SceneSessionState::default();
        assert!(state.destroy_session("nonexistent").is_err());
    }

    #[test]
    fn session_state_with_session_mut_modifies() {
        let state = SceneSessionState::default();
        let id = state.create_session(SceneSource::Folder {
            path: "/test".into(),
        });
        state
            .with_session_mut(&id, |s| {
                s.add_import("file.dae".into(), vec![42]);
                Ok(())
            })
            .unwrap();
        let count = state
            .with_session(&id, |s| Ok(s.pending_imports.len()))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn collect_save_artifacts_with_maya_profile() {
        let mut s = new_session();
        let id = s.add_import("test_model".into(), vec![]);
        {
            let import = s.find_import_mut(&id).unwrap();
            import.config.convert_to_ssbh = true;
            import.config.ssbh_config = Some(SsbhConvertConfig {
                base_filename: "obj_a".into(),
                scale_factor: 1.0,
                up_axis: "y_up".into(),
                flip_uv: false,
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: false,
                write_numatb: true,
                write_jnttbl: false,
                write_maya_profile: true,
                material_template: None,
                maya_file: None,
                nust_file: None,
                numdlb_entries: Vec::new(),
            });
        }
        s.store_ssbh_artifacts(
            &id,
            SsbhArtifacts {
                numdlb: vec![1],
                numshb: vec![2],
                nusktb: None,
                numatb: vec![4],
                maya_numatb: Some(vec![99]),
                jnttbl: vec![],
            },
        )
        .unwrap();

        let artifacts = s.collect_save_artifacts();
        let paths: Vec<&str> = artifacts.iter().map(|a| a.relative_path.as_str()).collect();
        assert!(paths.contains(&"obj_a/0/obj_a.numdlb"));
        assert!(paths.contains(&"obj_a/0/obj_a.numshb"));
        assert!(!paths.iter().any(|p| p.contains("nusktb")));
        assert!(paths.contains(&"obj_a/0/obj_a__nust__.numatb"));
        assert!(paths.contains(&"obj_a/0/obj_a__maya__.numatb"));
        assert!(!paths.iter().any(|p| p.contains("jnttbl")));
    }

    #[test]
    fn hkt_placed_at_model_root_not_inside_zero() {
        let mut s = new_session();
        let id = s.add_import("collision_obj".into(), vec![]);
        {
            let import = s.find_import_mut(&id).unwrap();
            import.config.convert_to_ssbh = true;
            import.config.ssbh_config = Some(SsbhConvertConfig {
                base_filename: "wall".into(),
                scale_factor: 1.0,
                up_axis: "y_up".into(),
                flip_uv: false,
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: false,
                write_numatb: false,
                write_jnttbl: false,
                write_maya_profile: false,
                material_template: None,
                maya_file: None,
                nust_file: None,
                numdlb_entries: Vec::new(),
            });
        }
        s.store_ssbh_artifacts(
            &id,
            SsbhArtifacts {
                numdlb: vec![1],
                numshb: vec![2],
                nusktb: None,
                numatb: vec![],
                maya_numatb: None,
                jnttbl: vec![],
            },
        )
        .unwrap();
        s.store_hkt_bytes(&id, vec![0xAA, 0xBB]).unwrap();

        let artifacts = s.collect_save_artifacts();
        let paths: Vec<&str> = artifacts.iter().map(|a| a.relative_path.as_str()).collect();
        assert!(
            paths.contains(&"wall/map_hit.hkt"),
            "HKT should be saved as map_hit.hkt at model folder root. Got: {:?}",
            paths
        );
        assert!(
            !paths.contains(&"wall/collision_obj.hkt"),
            "HKT must not use the imported object name as the filename"
        );
        assert!(
            !paths
                .iter()
                .any(|p| p.contains("/0/") && p.ends_with(".hkt")),
            "HKT must NOT be inside /0 subfolder"
        );
    }

    #[test]
    fn multiple_sessions_are_isolated() {
        let state = SceneSessionState::default();
        let id1 = state.create_session(SceneSource::New);
        let id2 = state.create_session(SceneSource::New);
        state
            .with_session_mut(&id1, |s| {
                s.add_import("a.dae".into(), vec![]);
                Ok(())
            })
            .unwrap();
        let count1 = state
            .with_session(&id1, |s| Ok(s.pending_imports.len()))
            .unwrap();
        let count2 = state
            .with_session(&id2, |s| Ok(s.pending_imports.len()))
            .unwrap();
        assert_eq!(count1, 1);
        assert_eq!(count2, 0);
    }
}
