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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportConfig {
    pub load_to_scene: bool,
    pub convert_to_ssbh: bool,
    pub generate_hkt: bool,
    pub ssbh_config: Option<SsbhConvertConfig>,
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
            },
            ssbh_artifacts: None,
            hkt_bytes: None,
        });
        self.dirty = true;
        id
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
        f(session)
    }
}
