use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
}

impl Default for HktSimplifyConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            planarity_angle_deg: 8.0,
            min_triangle_area: 1e-8,
            weld_epsilon: 1e-5,
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
    pub write_numdlb: bool,
    pub write_numshb: bool,
    pub write_nusktb: bool,
    pub write_numatb: bool,
    pub write_jnttbl: bool,
    pub write_maya_profile: bool,
    pub material_template: Option<String>,
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
    pub dae_bytes: Vec<u8>,
    pub config: ImportConfig,
    pub ssbh_artifacts: Option<SsbhArtifacts>,
    pub hkt_bytes: Option<Vec<u8>>,
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
        let id = uuid::Uuid::new_v4().to_string();
        self.pending_imports.push(PendingImport {
            id: id.clone(),
            name,
            dae_bytes,
            config: ImportConfig {
                load_to_scene: true,
                convert_to_ssbh: false,
                generate_hkt: false,
                ssbh_config: None,
                hkt_simplify: HktSimplifyConfig::default(),
            },
            ssbh_artifacts: None,
            hkt_bytes: None,
        });
        self.dirty = true;
        id
    }

    pub fn add_import_from_path(&mut self, name: String, path: &std::path::Path) -> Result<String, String> {
        let dae_bytes = std::fs::read(path)
            .map_err(|e| format!("Failed to read '{}': {}", path.display(), e))?;
        Ok(self.add_import(name, dae_bytes))
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
        import.ssbh_artifacts = Some(artifacts);
        self.dirty = true;
        Ok(())
    }

    pub fn store_hkt_bytes(
        &mut self,
        import_id: &str,
        hkt_bytes: Vec<u8>,
    ) -> Result<(), String> {
        let import = self.find_import_mut(import_id)?;
        import.hkt_bytes = Some(hkt_bytes);
        self.dirty = true;
        Ok(())
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
            if let Some(ref ssbh) = import.ssbh_artifacts {
                let base = import
                    .config
                    .ssbh_config
                    .as_ref()
                    .map(|c| c.base_filename.as_str())
                    .unwrap_or(&import.name);
                // Model files go inside {base}/0/ subfolder
                let model_dir = format!("{base}/0");
                artifacts.push(SaveArtifact {
                    relative_path: format!("{model_dir}/model.numdlb"),
                    data: ssbh.numdlb.clone(),
                });
                artifacts.push(SaveArtifact {
                    relative_path: format!("{model_dir}/model.numshb"),
                    data: ssbh.numshb.clone(),
                });
                if let Some(ref nusktb) = ssbh.nusktb {
                    artifacts.push(SaveArtifact {
                        relative_path: format!("{model_dir}/model.nusktb"),
                        data: nusktb.clone(),
                    });
                }
                artifacts.push(SaveArtifact {
                    relative_path: format!("{model_dir}/model__nust__.numatb"),
                    data: ssbh.numatb.clone(),
                });
                if let Some(ref maya) = ssbh.maya_numatb {
                    artifacts.push(SaveArtifact {
                        relative_path: format!("{model_dir}/model__maya__.numatb"),
                        data: maya.clone(),
                    });
                }
                let write_jnttbl = import
                    .config
                    .ssbh_config
                    .as_ref()
                    .map(|c| c.write_jnttbl)
                    .unwrap_or(true);
                if write_jnttbl && !ssbh.jnttbl.is_empty() {
                    artifacts.push(SaveArtifact {
                        relative_path: format!("{model_dir}/model.jnttbl"),
                        data: ssbh.jnttbl.clone(),
                    });
                }
            }
            // HKT goes at {base}/{name}.hkt (model folder level, not inside /0)
            if let Some(ref hkt) = import.hkt_bytes {
                let base = import
                    .config
                    .ssbh_config
                    .as_ref()
                    .map(|c| c.base_filename.as_str())
                    .unwrap_or(&import.name);
                artifacts.push(SaveArtifact {
                    relative_path: format!("{base}/{}.hkt", import.name),
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
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: false,
                write_numatb: true,
                write_jnttbl: true,
                write_maya_profile: false,
                material_template: None,
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
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: true,
                write_numatb: true,
                write_jnttbl: true,
                write_maya_profile: false,
                material_template: None,
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
        assert!(paths.contains(&"mymodel/0/model.numdlb"));
        assert!(paths.contains(&"mymodel/0/model.numshb"));
        assert!(paths.contains(&"mymodel/0/model.nusktb"));
        assert!(paths.contains(&"mymodel/0/model__nust__.numatb"));
        assert!(paths.contains(&"mymodel/0/model.jnttbl"));
        assert!(paths.contains(&"mymodel/test_model.hkt"));
        assert!(!paths.contains(&"mymodel/0/model__maya__.numatb"));
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
        assert!(state.with_session(&id, |s| Ok(s.session_id().to_string())).is_ok());
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
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: false,
                write_numatb: true,
                write_jnttbl: false,
                write_maya_profile: true,
                material_template: None,
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
        assert!(paths.contains(&"obj_a/0/model.numdlb"));
        assert!(paths.contains(&"obj_a/0/model.numshb"));
        assert!(!paths.iter().any(|p| p.contains("nusktb")));
        assert!(paths.contains(&"obj_a/0/model__nust__.numatb"));
        assert!(paths.contains(&"obj_a/0/model__maya__.numatb"));
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
                write_numdlb: true,
                write_numshb: true,
                write_nusktb: false,
                write_numatb: false,
                write_jnttbl: false,
                write_maya_profile: false,
                material_template: None,
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
            paths.contains(&"wall/collision_obj.hkt"),
            "HKT should be at model folder root, not inside /0. Got: {:?}",
            paths
        );
        assert!(
            !paths.iter().any(|p| p.contains("/0/") && p.ends_with(".hkt")),
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
