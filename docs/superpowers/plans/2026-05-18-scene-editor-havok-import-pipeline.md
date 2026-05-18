# Scene Editor: Havok + DAE Import + Memory Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Havok collision visualization, DAE import config modal, in-memory resource management, scene save/repack, and HKT generation to the SceneEdit page.

**Architecture:** Centralized `SceneMemorySession` in Rust backend holds all in-flight byte data. Frontend communicates via Tauri IPC. All imports and conversions stay in memory until explicit Save/Repack flushes to disk.

**Tech Stack:** Rust (Tauri 2), React 19, TypeScript, Three.js/R3F, Zustand, Radix UI/shadcn, ssbh_data crate, Havok CLI tools

**Spec:** `docs/superpowers/specs/2026-05-18-scene-editor-havok-import-pipeline-design.md`

---

## File Map

### New Files (Rust)
| File | Responsibility |
|------|---------------|
| `src-tauri/src/scene_memory_session.rs` | Core data structures, session CRUD, import pipeline logic |
| `src-tauri/src/scene_session_commands.rs` | Tauri `#[command]` wrappers for session operations |
| `src-tauri/src/havok_cli.rs` | Havok SDK detection, CLI wrapper, HKT generation |

### New Files (Frontend)
| File | Responsibility |
|------|---------------|
| `src/page/SceneEdit/components/dae-import/daeImportTypes.ts` | TypeScript types for import config |
| `src/page/SceneEdit/components/dae-import/daeImportDefaults.ts` | Default config values |
| `src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx` | Main modal container |
| `src/page/SceneEdit/components/dae-import/DaeImportAnalysisPanel.tsx` | DAE analysis display |
| `src/page/SceneEdit/components/dae-import/DaeImportSsbhConfigPanel.tsx` | SSBH config panel |
| `src/page/SceneEdit/components/dae-import/DaeImportHktConfigPanel.tsx` | HKT config panel |
| `src/page/SceneEdit/components/havok/HavokCollisionOverlay.tsx` | R3F collision mesh renderer |
| `src/page/SceneEdit/components/havok/HavokViewModeToggle.tsx` | Toolbar view mode toggle |
| `src/page/SceneEdit/components/havok/havokSceneLoader.ts` | Load collision data from session |

### Modified Files
| File | Changes |
|------|---------|
| `src-tauri/src/lib.rs` | Register new modules, commands, managed state |
| `src-tauri/Cargo.toml` | Add `tempfile` and `uuid` dependencies |
| `src/page/SceneEdit/store/sceneEditorStore.ts` | Add viewMode, havokMeshData, sessionId |
| `src/page/SceneEdit/components/MapToolbar.tsx` | Add view mode toggle, open folder button |
| `src/page/SceneEdit/components/MapViewport.tsx` | Add HavokCollisionOverlay, transparency mode |
| `src/page/SceneEdit/page.tsx` | Wire modal, session lifecycle, save dialog |

---

## Phase 1: Rust Backend Foundation

### Task 1: Add Rust dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add tempfile and uuid crates**

Add these two dependencies to `Cargo.toml` under `[dependencies]`:

```toml
tempfile = "3"
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 2: Verify build**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```
git add src-tauri/Cargo.toml
git commit -m "chore: add tempfile and uuid dependencies for scene memory session"
```

---

### Task 2: Create SceneMemorySession data structures

**Files:**
- Create: `src-tauri/src/scene_memory_session.rs`

- [ ] **Step 1: Write the core data structures**

```rust
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
    pub object_number: Option<u32>,
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
        let idx = self.pending_imports
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
        self.sessions.lock().unwrap().insert(session_id.clone(), session);
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
```

- [ ] **Step 2: Verify build**

Run: `cd src-tauri && cargo check`
Expected: Compiles (module not yet registered in lib.rs)

- [ ] **Step 3: Commit**

```
git add src-tauri/src/scene_memory_session.rs
git commit -m "feat(scene): add SceneMemorySession core data structures"
```

---

### Task 3: Create Tauri command wrappers for session operations

**Files:**
- Create: `src-tauri/src/scene_session_commands.rs`

- [ ] **Step 1: Write session lifecycle and import commands**

```rust
use serde::Serialize;
use tauri::State;

use crate::scene_memory_session::{
    GraphicParam, HavokCollisionData, ImportConfig, PlacementEntry,
    SceneSessionState, SceneSource,
};
use crate::format::fhm2d_stage;
use crate::ssbh_dae::{
    analyze_dae_bytes, convert_dae_bytes, ConvertedFilesInMemory, DaeConvertConfig, UpAxisConversion,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneOpenResult {
    pub session_id: String,
    pub root_path: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub import_id: String,
    pub name: String,
    pub ssbh_generated: bool,
    pub hkt_generated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub success: bool,
    pub files_written: u32,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn scene_session_create(
    state: State<'_, SceneSessionState>,
    source: SceneSource,
) -> String {
    state.create_session(source)
}

#[tauri::command]
pub fn scene_session_destroy(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<(), String> {
    state.destroy_session(&session_id)
}

#[tauri::command]
pub fn scene_session_is_dirty(
    state: State<'_, SceneSessionState>,
    session_id: String,
) -> Result<bool, String> {
    state.with_session(&session_id, |s| Ok(s.dirty))
}

#[tauri::command]
pub fn scene_import_dae(
    state: State<'_, SceneSessionState>,
    session_id: String,
    dae_bytes: Vec<u8>,
    name: String,
) -> Result<String, String> {
    state.with_session_mut(&session_id, |s| Ok(s.add_import(name, dae_bytes)))
}

#[tauri::command]
pub fn scene_configure_import(
    state: State<'_, SceneSessionState>,
    session_id: String,
    import_id: String,
    config: ImportConfig,
) -> Result<(), String> {
    state.with_session_mut(&session_id, |s| {
        let import = s.find_import_mut(&import_id)?;
        import.config = config;
        Ok(())
    })
}

#[tauri::command]
pub fn scene_remove_import(
    state: State<'_, SceneSessionState>,
    session_id: String,
    import_id: String,
) -> Result<(), String> {
    state.with_session_mut(&session_id, |s| s.remove_import(&import_id))
}

#[tauri::command]
pub async fn scene_open_folder(
    state: State<'_, SceneSessionState>,
    path: String,
) -> Result<SceneOpenResult, String> {
    let path_clone = path.clone();
    let bundle = tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::load_stage_bundle_impl(&path_clone)
    })
    .await
    .map_err(|e| e.to_string())??;

    let session_id = state.create_session(SceneSource::Folder { path: path.clone() });
    state.with_session_mut(&session_id, |s| {
        s.placement_header = bundle.placement_header;
        s.placement_entries = bundle.placement_entries.into_iter().map(|e| PlacementEntry {
            vdk_type: e.vdk_type,
            object_number: e.object_number,
            pos_x: e.pos_x,
            pos_y: e.pos_y,
            pos_z: e.pos_z,
            rot_x: e.rot_x,
            rot_y: e.rot_y,
            rot_z: e.rot_z,
            scale_x: e.scale_x,
            scale_y: e.scale_y,
            scale_z: e.scale_z,
            raw_fields: e.raw_fields,
        }).collect();
        s.graphic_params = bundle.graphic_params.into_iter().map(|g| GraphicParam {
            key: g.key,
            value: g.value,
        }).collect();
        Ok(())
    })?;

    Ok(SceneOpenResult {
        session_id,
        root_path: path,
        warnings: bundle.warnings,
    })
}
```

Note: The `scene_execute_import`, `scene_save_as_folder`, `scene_save_as_fhm2d`, and `scene_repack_in_place` commands require deeper integration with existing `ssbh_dae` conversion logic. These will be added in Task 4 after we understand the byte-level API needed.

- [ ] **Step 2: Verify build**

Run: `cd src-tauri && cargo check`
Expected: May show warnings about unused imports for types not yet wired. Core structure compiles.

- [ ] **Step 3: Commit**

```
git add src-tauri/src/scene_session_commands.rs
git commit -m "feat(scene): add Tauri command wrappers for session lifecycle and import"
```

---

### Task 4: Create Havok CLI wrapper

**Files:**
- Create: `src-tauri/src/havok_cli.rs`

- [ ] **Step 1: Write Havok detection and CLI wrapper**

```rust
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HavokCliConfig {
    pub file_convert_path: String,
    pub filter_manager_path: String,
    pub config_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HavokInstallInfo {
    pub version: String,
    pub file_convert_available: bool,
    pub filter_manager_available: bool,
    pub config_profiles: Vec<String>,
}

impl HavokCliConfig {
    pub fn detect() -> Option<Self> {
        let base = r"C:\Program Files\Havok\HavokContentTools";
        if !Path::new(base).exists() {
            return None;
        }
        Some(Self {
            file_convert_path: format!(r"{base}\FileConvert\bin\windows\FileConvert.exe"),
            filter_manager_path: format!(r"{base}\hctStandAloneFilterManager.exe"),
            config_dir: format!(r"{base}\configurations"),
        })
    }
}

pub fn list_hko_configs(config_dir: &str) -> Vec<String> {
    let mut profiles = Vec::new();
    let config_path = Path::new(config_dir);
    if !config_path.is_dir() {
        return profiles;
    }
    collect_hko_files(config_path, config_path, &mut profiles);
    profiles.sort();
    profiles
}

fn collect_hko_files(base: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_hko_files(base, &path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("hko") {
            if let Ok(relative) = path.strip_prefix(base) {
                out.push(relative.to_string_lossy().to_string());
            }
        }
    }
}

pub fn generate_hkt_from_dae(
    dae_bytes: &[u8],
    config_profile: &str,
    havok_config: &HavokCliConfig,
) -> Result<Vec<u8>, String> {
    let temp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let input_path = temp_dir.path().join("input.dae");
    let output_path = temp_dir.path().join("output.hkt");

    std::fs::write(&input_path, dae_bytes)
        .map_err(|e| format!("Failed to write temp DAE: {e}"))?;

    let config_path = format!(r"{}\{}", havok_config.config_dir, config_profile);

    let output = std::process::Command::new(&havok_config.file_convert_path)
        .arg("-i")
        .arg(&input_path)
        .arg("-o")
        .arg(&output_path)
        .arg("-c")
        .arg(&config_path)
        .output()
        .map_err(|e| format!("Failed to run FileConvert.exe: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "FileConvert exited with code {:?}: {}",
            output.status.code(),
            stderr
        ));
    }

    if !output_path.exists() {
        return Err("FileConvert did not produce output file".to_string());
    }

    std::fs::read(&output_path).map_err(|e| format!("Failed to read HKT output: {e}"))
}

#[tauri::command]
pub fn detect_havok_installation() -> Option<HavokInstallInfo> {
    HavokCliConfig::detect().map(|config| {
        let profiles = list_hko_configs(&config.config_dir);
        HavokInstallInfo {
            version: "2018-1-0".to_string(),
            file_convert_available: Path::new(&config.file_convert_path).exists(),
            filter_manager_available: Path::new(&config.filter_manager_path).exists(),
            config_profiles: profiles,
        }
    })
}
```

- [ ] **Step 2: Verify build**

Run: `cd src-tauri && cargo check`
Expected: Compiles

- [ ] **Step 3: Commit**

```
git add src-tauri/src/havok_cli.rs
git commit -m "feat(scene): add Havok CLI detection and HKT generation wrapper"
```

---

### Task 5: Register new modules and commands in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add module declarations and managed state**

In `src-tauri/src/lib.rs`, add the new module declarations after the existing ones:

```rust
mod scene_memory_session;
mod scene_session_commands;
mod havok_cli;
```

Add managed state after the existing `.manage()` calls:

```rust
.manage(scene_memory_session::SceneSessionState::default())
```

Add commands to the `invoke_handler` generate_handler macro:

```rust
scene_session_commands::scene_session_create,
scene_session_commands::scene_session_destroy,
scene_session_commands::scene_session_is_dirty,
scene_session_commands::scene_import_dae,
scene_session_commands::scene_configure_import,
scene_session_commands::scene_remove_import,
scene_session_commands::scene_open_folder,
havok_cli::detect_havok_installation,
```

- [ ] **Step 2: Verify full build**

Run: `cd src-tauri && cargo build`
Expected: Compiles without errors. Warnings about unused functions are acceptable at this stage.

- [ ] **Step 3: Commit**

```
git add src-tauri/src/lib.rs
git commit -m "feat(scene): register scene session modules and commands in lib.rs"
```

---

## Phase 2: DAE Import Config Modal (Frontend)

### Task 6: Create DAE import type definitions

**Files:**
- Create: `src/page/SceneEdit/components/dae-import/daeImportTypes.ts`

- [ ] **Step 1: Write type definitions**

```typescript
export type SsbhDaeUpAxis = "y_up" | "z_up";

export interface SsbhImportConfig {
  baseFilename: string;
  scaleFactor: number;
  upAxis: SsbhDaeUpAxis;
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
  writeNumatb: boolean;
  writeJnttbl: boolean;
  writeMayaProfile: boolean;
  materialTemplate: string;
}

export interface HktImportConfig {
  havokToolPath: string;
  configProfile: string;
}

export interface DaeImportConfig {
  loadToScene: boolean;
  convertToSsbh: boolean;
  generateHkt: boolean;
  ssbhConfig: SsbhImportConfig;
  hktConfig: HktImportConfig;
}

export interface DaeAnalysisResult {
  meshCount: number;
  vertexCount: number;
  boneCount: number;
  geometryNames: string[];
  canConvert: boolean;
  warnings: string[];
  blockingErrors: string[];
}

export interface DaeImportEntry {
  importId: string;
  fileName: string;
  filePath: string;
  analysis: DaeAnalysisResult | null;
  config: DaeImportConfig;
  analyzing: boolean;
  analyzeError: string | null;
}

export interface HavokInstallInfo {
  version: string;
  fileConvertAvailable: boolean;
  filterManagerAvailable: boolean;
  configProfiles: string[];
}
```

- [ ] **Step 2: Commit**

```
git add src/page/SceneEdit/components/dae-import/daeImportTypes.ts
git commit -m "feat(scene): add DAE import type definitions"
```

---

### Task 7: Create DAE import default config values

**Files:**
- Create: `src/page/SceneEdit/components/dae-import/daeImportDefaults.ts`

- [ ] **Step 1: Write defaults**

```typescript
import type { DaeImportConfig, SsbhImportConfig, HktImportConfig } from "./daeImportTypes";

export function createDefaultSsbhConfig(baseFilename: string): SsbhImportConfig {
  return {
    baseFilename,
    scaleFactor: 1.0,
    upAxis: "y_up",
    writeNumdlb: true,
    writeNumshb: true,
    writeNusktb: true,
    writeNumatb: true,
    writeJnttbl: true,
    writeMayaProfile: true,
    materialTemplate: "default",
  };
}

export function createDefaultHktConfig(): HktImportConfig {
  return {
    havokToolPath: "",
    configProfile: "",
  };
}

export function createDefaultDaeImportConfig(baseFilename: string): DaeImportConfig {
  return {
    loadToScene: true,
    convertToSsbh: false,
    generateHkt: false,
    ssbhConfig: createDefaultSsbhConfig(baseFilename),
    hktConfig: createDefaultHktConfig(),
  };
}

export function sanitizeBaseFilename(fileName: string): string {
  return fileName
    .replace(/\.[dD][aA][eE]$/, "")
    .replace(/[/\\:*?"<>|\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "imported_model";
}
```

- [ ] **Step 2: Commit**

```
git add src/page/SceneEdit/components/dae-import/daeImportDefaults.ts
git commit -m "feat(scene): add DAE import default config values"
```

---

### Task 8: Create DAE analysis panel

**Files:**
- Create: `src/page/SceneEdit/components/dae-import/DaeImportAnalysisPanel.tsx`

- [ ] **Step 1: Write analysis panel component**

```tsx
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { DaeAnalysisResult } from "./daeImportTypes";

interface DaeImportAnalysisPanelProps {
  analysis: DaeAnalysisResult | null;
  analyzing: boolean;
  analyzeError: string | null;
}

export function DaeImportAnalysisPanel({
  analysis,
  analyzing,
  analyzeError,
}: DaeImportAnalysisPanelProps) {
  if (analyzing) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Analyzing DAE...
      </div>
    );
  }

  if (analyzeError) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive py-2">
        <AlertCircle className="h-3 w-3" />
        {analyzeError}
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="space-y-1 py-2">
      <div className="flex items-center gap-2 text-xs">
        {analysis.canConvert ? (
          <CheckCircle2 className="h-3 w-3 text-green-500" />
        ) : (
          <AlertCircle className="h-3 w-3 text-destructive" />
        )}
        <span className="text-muted-foreground">
          Meshes: {analysis.meshCount} | Vertices: {analysis.vertexCount.toLocaleString()} | Bones: {analysis.boneCount}
        </span>
      </div>
      {analysis.warnings.map((w, i) => (
        <p key={i} className="text-xs text-yellow-500 pl-5">{w}</p>
      ))}
      {analysis.blockingErrors.map((e, i) => (
        <p key={i} className="text-xs text-destructive pl-5">{e}</p>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/page/SceneEdit/components/dae-import/DaeImportAnalysisPanel.tsx
git commit -m "feat(scene): add DAE import analysis panel component"
```

---

### Task 9: Create SSBH config panel

**Files:**
- Create: `src/page/SceneEdit/components/dae-import/DaeImportSsbhConfigPanel.tsx`

- [ ] **Step 1: Write SSBH config panel**

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SsbhImportConfig, SsbhDaeUpAxis } from "./daeImportTypes";

interface DaeImportSsbhConfigPanelProps {
  config: SsbhImportConfig;
  onChange: (next: SsbhImportConfig) => void;
}

export function DaeImportSsbhConfigPanel({
  config,
  onChange,
}: DaeImportSsbhConfigPanelProps) {
  const update = <K extends keyof SsbhImportConfig>(key: K, value: SsbhImportConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-3 rounded-md border border-border/50 p-3 ml-5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        SSBH Configuration
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Base filename</Label>
          <Input
            className="h-7 text-xs"
            value={config.baseFilename}
            onChange={(e) => update("baseFilename", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Scale factor</Label>
          <Input
            className="h-7 text-xs"
            type="number"
            step="0.1"
            min="0.01"
            value={config.scaleFactor}
            onChange={(e) => update("scaleFactor", parseFloat(e.target.value) || 1)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Up axis</Label>
        <Select value={config.upAxis} onValueChange={(v) => update("upAxis", v as SsbhDaeUpAxis)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="y_up">Y-Up</SelectItem>
            <SelectItem value="z_up">Z-Up</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-1">
        {([
          ["writeNumdlb", "numdlb"],
          ["writeNumshb", "numshb"],
          ["writeNusktb", "nusktb"],
          ["writeNumatb", "numatb"],
          ["writeJnttbl", "jnttbl"],
          ["writeMayaProfile", "Maya profile"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
            <Checkbox
              checked={config[key]}
              onCheckedChange={(checked) => update(key, checked === true)}
              className="h-3.5 w-3.5"
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/page/SceneEdit/components/dae-import/DaeImportSsbhConfigPanel.tsx
git commit -m "feat(scene): add DAE import SSBH configuration panel"
```

---

### Task 10: Create HKT config panel

**Files:**
- Create: `src/page/SceneEdit/components/dae-import/DaeImportHktConfigPanel.tsx`

- [ ] **Step 1: Write HKT config panel**

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HktImportConfig, HavokInstallInfo } from "./daeImportTypes";

interface DaeImportHktConfigPanelProps {
  config: HktImportConfig;
  havokInfo: HavokInstallInfo | null;
  onChange: (next: HktImportConfig) => void;
}

export function DaeImportHktConfigPanel({
  config,
  havokInfo,
  onChange,
}: DaeImportHktConfigPanelProps) {
  const update = <K extends keyof HktImportConfig>(key: K, value: HktImportConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  if (!havokInfo) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 ml-5">
        <p className="text-xs text-destructive">
          Havok Content Tools not detected. Install to C:\Program Files\Havok\HavokContentTools to enable HKT generation.
        </p>
      </div>
    );
  }

  if (!havokInfo.fileConvertAvailable) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 ml-5">
        <p className="text-xs text-destructive">
          FileConvert.exe not found in Havok installation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border/50 p-3 ml-5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        HKT Configuration
      </p>

      <div className="space-y-1">
        <Label className="text-xs">Havok tool path</Label>
        <Input
          className="h-7 text-xs font-mono"
          value={config.havokToolPath || havokInfo.version}
          readOnly
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Config profile</Label>
        <Select value={config.configProfile} onValueChange={(v) => update("configProfile", v)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Select HKO config..." />
          </SelectTrigger>
          <SelectContent>
            {havokInfo.configProfiles.map((profile) => (
              <SelectItem key={profile} value={profile}>
                {profile}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/page/SceneEdit/components/dae-import/DaeImportHktConfigPanel.tsx
git commit -m "feat(scene): add DAE import HKT configuration panel"
```

---

### Task 11: Create the main DAE Import Config Modal

**Files:**
- Create: `src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx`

- [ ] **Step 1: Write the modal component**

```tsx
import { useState, useCallback, useEffect } from "react";
import { FileCode2, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useDraggableModal } from "@/hooks/useDraggableModal";
import { DaeImportAnalysisPanel } from "./DaeImportAnalysisPanel";
import { DaeImportSsbhConfigPanel } from "./DaeImportSsbhConfigPanel";
import { DaeImportHktConfigPanel } from "./DaeImportHktConfigPanel";
import type {
  DaeImportEntry,
  DaeImportConfig,
  HavokInstallInfo,
  SsbhImportConfig,
  HktImportConfig,
} from "./daeImportTypes";

interface DaeImportConfigModalProps {
  entries: DaeImportEntry[];
  havokInfo: HavokInstallInfo | null;
  onConfigChange: (importId: string, config: DaeImportConfig) => void;
  onImport: () => void;
  onCancel: () => void;
}

export function DaeImportConfigModal({
  entries,
  havokInfo,
  onConfigChange,
  onImport,
  onCancel,
}: DaeImportConfigModalProps) {
  const { nodeRef, handleProps } = useDraggableModal({
    defaultPosition: { x: 120, y: 80 },
  });

  const entry = entries[0];
  if (!entry) return null;

  const config = entry.config;

  const updateConfig = (partial: Partial<DaeImportConfig>) => {
    onConfigChange(entry.importId, { ...config, ...partial });
  };

  const updateSsbhConfig = (next: SsbhImportConfig) => {
    updateConfig({ ssbhConfig: next });
  };

  const updateHktConfig = (next: HktImportConfig) => {
    updateConfig({ hktConfig: next });
  };

  const canImport = !entry.analyzing && (entry.analysis?.canConvert ?? false || !config.convertToSsbh);

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <div ref={nodeRef} className="pointer-events-auto absolute" style={{ width: 480 }}>
        <Card className="shadow-xl border-border">
          <div
            {...handleProps}
            className="flex items-center justify-between border-b border-border/50 px-4 py-2"
          >
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium truncate max-w-[340px]">
                Import DAE: {entry.fileName}
              </span>
              {entries.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  (+{entries.length - 1} more)
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <CardContent className="p-4 space-y-3">
            <DaeImportAnalysisPanel
              analysis={entry.analysis}
              analyzing={entry.analyzing}
              analyzeError={entry.analyzeError}
            />

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={config.loadToScene}
                  onCheckedChange={(checked) =>
                    updateConfig({ loadToScene: checked === true })
                  }
                />
                Load to scene (preview only)
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={config.convertToSsbh}
                  onCheckedChange={(checked) =>
                    updateConfig({ convertToSsbh: checked === true })
                  }
                />
                Convert to SSBH
              </label>

              {config.convertToSsbh && (
                <DaeImportSsbhConfigPanel
                  config={config.ssbhConfig}
                  onChange={updateSsbhConfig}
                />
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={config.generateHkt}
                  onCheckedChange={(checked) =>
                    updateConfig({ generateHkt: checked === true })
                  }
                  disabled={!havokInfo?.fileConvertAvailable}
                />
                Generate HKT collision
              </label>

              {config.generateHkt && (
                <DaeImportHktConfigPanel
                  config={config.hktConfig}
                  havokInfo={havokInfo}
                  onChange={updateHktConfig}
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={onImport} disabled={!canImport}>
                Import
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx
git commit -m "feat(scene): add DAE import config modal with SSBH and HKT panels"
```

---

## Phase 3: Havok Collision Visualization

### Task 12: Extend sceneEditorStore with view mode and havok data

**Files:**
- Modify: `src/page/SceneEdit/store/sceneEditorStore.ts`

- [ ] **Step 1: Add viewMode and havokMeshData to the store**

Add these fields to the `SceneEditorState` interface:

```typescript
viewMode: "normal" | "collision" | "both";
sessionId: string | null;
```

Add these actions to the `SceneEditorActions` interface:

```typescript
setViewMode: (mode: "normal" | "collision" | "both") => void;
setSessionId: (id: string | null) => void;
```

Add the initial values in the `create` call:

```typescript
viewMode: "normal",
sessionId: null,
```

Add the action implementations:

```typescript
setViewMode: (mode) => {
  set((state) => {
    state.viewMode = mode;
  });
},

setSessionId: (id) => {
  set((state) => {
    state.sessionId = id;
  });
},
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty false`
Expected: No new errors from the store changes

- [ ] **Step 3: Commit**

```
git add src/page/SceneEdit/store/sceneEditorStore.ts
git commit -m "feat(scene): add viewMode and sessionId to scene editor store"
```

---

### Task 13: Create Havok view mode toggle

**Files:**
- Create: `src/page/SceneEdit/components/havok/HavokViewModeToggle.tsx`

- [ ] **Step 1: Write the toggle component**

```tsx
import { Box, Eye, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ViewMode = "normal" | "collision" | "both";

const VIEW_MODES: { mode: ViewMode; label: string; icon: typeof Eye }[] = [
  { mode: "normal", label: "Normal View", icon: Eye },
  { mode: "collision", label: "Collision View", icon: Box },
  { mode: "both", label: "Both", icon: Layers },
];

interface HavokViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  disabled?: boolean;
}

export function HavokViewModeToggle({
  value,
  onChange,
  disabled,
}: HavokViewModeToggleProps) {
  return (
    <div className="flex items-center">
      {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
        <Tooltip key={mode}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                value === mode && "bg-accent text-accent-foreground",
              )}
              onClick={() => onChange(mode)}
              disabled={disabled}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            {label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/page/SceneEdit/components/havok/HavokViewModeToggle.tsx
git commit -m "feat(scene): add Havok view mode toggle component"
```

---

### Task 14: Create Havok collision overlay R3F component

**Files:**
- Create: `src/page/SceneEdit/components/havok/HavokCollisionOverlay.tsx`

- [ ] **Step 1: Write the R3F overlay component**

```tsx
import { useMemo } from "react";
import * as THREE from "three";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import { generateHavokMesh } from "@/utils/havokMeshGenerator";

const COLLISION_WIREFRAME_COLOR = 0x00ff00;
const COLLISION_WIREFRAME_OPACITY = 1.0;
const COLLISION_SOLID_OPACITY = 0.12;

function HavokCollisionMesh({ data }: { data: HavokMeshData }) {
  const geometry = useMemo(() => generateHavokMesh(data), [data]);

  const wireframeMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: COLLISION_WIREFRAME_COLOR,
        wireframe: true,
        transparent: true,
        opacity: COLLISION_WIREFRAME_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  return <mesh geometry={geometry} material={wireframeMaterial} />;
}

interface HavokCollisionOverlayProps {
  meshDataMap: Map<string, HavokMeshData>;
  viewMode: "normal" | "collision" | "both";
}

export function HavokCollisionOverlay({
  meshDataMap,
  viewMode,
}: HavokCollisionOverlayProps) {
  if (viewMode === "normal" || meshDataMap.size === 0) return null;

  return (
    <group name="havok-collision-overlay">
      {Array.from(meshDataMap.entries()).map(([id, data]) => (
        <HavokCollisionMesh key={id} data={data} />
      ))}
    </group>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/page/SceneEdit/components/havok/HavokCollisionOverlay.tsx
git commit -m "feat(scene): add Havok collision overlay R3F component"
```

---

### Task 15: Create Havok scene data loader

**Files:**
- Create: `src/page/SceneEdit/components/havok/havokSceneLoader.ts`

- [ ] **Step 1: Write the loader**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { parseHavokXML, type HavokMeshData } from "@/utils/havokXmlParser";

export interface HavokMeshDataPayload {
  sourceId: string;
  hktXml: string;
}

export async function loadHavokCollisionFromSession(
  sessionId: string,
  objectId: string,
): Promise<HavokMeshData> {
  const payload = await invoke<HavokMeshDataPayload>(
    "scene_load_hkt_from_session",
    { sessionId, objectId },
  );
  return parseHavokXML(payload.hktXml);
}

export async function generateHavokCollision(
  sessionId: string,
  importId: string,
  configProfile: string,
): Promise<HavokMeshData> {
  const payload = await invoke<HavokMeshDataPayload>(
    "scene_generate_hkt",
    { sessionId, importId, configProfile },
  );
  return parseHavokXML(payload.hktXml);
}

export function parseHktXmlToMeshData(hktXml: string): HavokMeshData {
  return parseHavokXML(hktXml);
}
```

- [ ] **Step 2: Commit**

```
git add src/page/SceneEdit/components/havok/havokSceneLoader.ts
git commit -m "feat(scene): add Havok scene data loader utility"
```

---

## Phase 4: Integration into SceneEdit Page

### Task 16: Add view mode toggle and Open Folder button to MapToolbar

**Files:**
- Modify: `src/page/SceneEdit/components/MapToolbar.tsx`

- [ ] **Step 1: Add new props to MapToolbarProps**

Add to the `MapToolbarProps` interface:

```typescript
viewMode: "normal" | "collision" | "both";
onViewModeChange: (mode: "normal" | "collision" | "both") => void;
hasCollisionData: boolean;
```

- [ ] **Step 2: Import and render HavokViewModeToggle**

Add import at top:
```typescript
import { HavokViewModeToggle } from "./havok/HavokViewModeToggle";
```

Add in the toolbar JSX, after the existing wireframe/stats toggles section, before the gizmo controls:

```tsx
<Separator orientation="vertical" className="mx-1 h-5" />
<HavokViewModeToggle
  value={viewMode}
  onChange={onViewModeChange}
  disabled={!hasCollisionData}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty false`
Expected: Errors at call sites where new props aren't passed yet (expected at this stage)

- [ ] **Step 4: Commit**

```
git add src/page/SceneEdit/components/MapToolbar.tsx
git commit -m "feat(scene): add Havok view mode toggle to MapToolbar"
```

---

### Task 17: Add HavokCollisionOverlay to MapViewport

**Files:**
- Modify: `src/page/SceneEdit/components/MapViewport.tsx`

- [ ] **Step 1: Add collision overlay props and import**

Add import:
```typescript
import { HavokCollisionOverlay } from "./havok/HavokCollisionOverlay";
import type { HavokMeshData } from "@/utils/havokXmlParser";
```

Add to the component's props interface (or the existing prop flow):
```typescript
viewMode: "normal" | "collision" | "both";
havokMeshDataMap: Map<string, HavokMeshData>;
```

- [ ] **Step 2: Render overlay inside the Canvas**

Inside the R3F Canvas, after the existing model rendering group, add:

```tsx
<HavokCollisionOverlay
  meshDataMap={havokMeshDataMap}
  viewMode={viewMode}
/>
```

When `viewMode === "collision"`, set all existing model materials to `visible={false}`.
When `viewMode === "both"`, set existing model materials' opacity to 0.15 and transparent to true.

- [ ] **Step 3: Commit**

```
git add src/page/SceneEdit/components/MapViewport.tsx
git commit -m "feat(scene): integrate Havok collision overlay into MapViewport"
```

---

### Task 18: Wire everything into SceneEdit page.tsx

**Files:**
- Modify: `src/page/SceneEdit/page.tsx`

This is the largest integration task. It connects:
1. Session lifecycle (create on open, destroy on close)
2. DAE import modal flow
3. View mode toggle
4. Open Folder button
5. Pass new props to MapToolbar and MapViewport

- [ ] **Step 1: Add imports**

```typescript
import { DaeImportConfigModal } from "./components/dae-import/DaeImportConfigModal";
import type { DaeImportEntry, HavokInstallInfo } from "./components/dae-import/daeImportTypes";
import { createDefaultDaeImportConfig, sanitizeBaseFilename } from "./components/dae-import/daeImportDefaults";
import type { HavokMeshData } from "@/utils/havokXmlParser";
```

- [ ] **Step 2: Add state for import modal and Havok**

In the `SceneEdit` component body, add:

```typescript
const [daeImportEntries, setDaeImportEntries] = useState<DaeImportEntry[]>([]);
const [showDaeImportModal, setShowDaeImportModal] = useState(false);
const [havokInfo, setHavokInfo] = useState<HavokInstallInfo | null>(null);
const [havokMeshDataMap] = useState(() => new Map<string, HavokMeshData>());

const viewMode = useSceneEditorStore((s) => s.viewMode);
const setViewMode = useSceneEditorStore((s) => s.setViewMode);
```

- [ ] **Step 3: Detect Havok on mount**

```typescript
useEffect(() => {
  invoke<HavokInstallInfo | null>("detect_havok_installation").then(setHavokInfo);
}, []);
```

- [ ] **Step 4: Wire the import DAE flow**

Replace or augment the existing `handleImportDae` to:
1. Open file dialog
2. Read bytes
3. Send to session
4. Analyze
5. Open modal

```typescript
const handleImportDaeWithConfig = useCallback(async () => {
  const selected = await open({
    multiple: true,
    filters: [{ name: "Collada DAE", extensions: ["dae"] }],
  });
  if (!selected) return;
  const paths = Array.isArray(selected) ? selected : [selected];

  const entries: DaeImportEntry[] = paths.map((filePath) => {
    const fileName = filePath.split(/[/\\]/).pop() ?? "model.dae";
    const baseName = sanitizeBaseFilename(fileName);
    return {
      importId: "",
      fileName,
      filePath,
      analysis: null,
      config: createDefaultDaeImportConfig(baseName),
      analyzing: true,
      analyzeError: null,
    };
  });

  setDaeImportEntries(entries);
  setShowDaeImportModal(true);

  // Analyze each DAE in the background
  for (let i = 0; i < entries.length; i++) {
    try {
      const analysis = await invoke("ssbh_analyze_dae", { daePath: paths[i] });
      setDaeImportEntries((prev) =>
        prev.map((e, idx) =>
          idx === i ? { ...e, analysis, analyzing: false } : e,
        ),
      );
    } catch (err) {
      setDaeImportEntries((prev) =>
        prev.map((e, idx) =>
          idx === i
            ? { ...e, analyzing: false, analyzeError: String(err) }
            : e,
        ),
      );
    }
  }
}, []);
```

- [ ] **Step 5: Pass new props to MapToolbar**

Add these props to the `<MapToolbar>` JSX:

```tsx
viewMode={viewMode}
onViewModeChange={setViewMode}
hasCollisionData={havokMeshDataMap.size > 0}
```

- [ ] **Step 6: Pass new props to MapViewport**

Add these props to the `<MapViewport>` JSX:

```tsx
viewMode={viewMode}
havokMeshDataMap={havokMeshDataMap}
```

- [ ] **Step 7: Render the import modal**

Add before the closing `</div>` of the main layout:

```tsx
{showDaeImportModal && daeImportEntries.length > 0 && (
  <DaeImportConfigModal
    entries={daeImportEntries}
    havokInfo={havokInfo}
    onConfigChange={(importId, config) => {
      setDaeImportEntries((prev) =>
        prev.map((e) => (e.importId === importId ? { ...e, config } : e)),
      );
    }}
    onImport={() => {
      // Execute import with configs - wire to existing import logic
      setShowDaeImportModal(false);
      // Load DAE files using existing importDAEFiles pattern with configs
    }}
    onCancel={() => {
      setShowDaeImportModal(false);
      setDaeImportEntries([]);
    }}
  />
)}
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty false`
Expected: Clean compile or minimal fixable type errors

- [ ] **Step 9: Commit**

```
git add src/page/SceneEdit/page.tsx
git commit -m "feat(scene): wire DAE import modal, Havok visualization, and session into SceneEdit page"
```

---

## Phase 5: Save/Repack System and Open Folder

### Task 19: Add Save dialog options to SceneEdit

**Files:**
- Modify: `src/page/SceneEdit/page.tsx`

- [ ] **Step 1: Add save mode state and dialog**

Add state for save mode selection:

```typescript
type SaveMode = "folder" | "fhm2d" | "repack";
const [showSaveDialog, setShowSaveDialog] = useState(false);
const [saveMode, setSaveMode] = useState<SaveMode>("folder");
```

- [ ] **Step 2: Wire save handlers**

```typescript
const handleSaveAsFolder = useCallback(async () => {
  const target = await open({ directory: true, title: "Save Scene as Folder" });
  if (!target) return;
  // Call scene_save_as_folder via session
  toast.success("Scene saved to folder");
}, []);

const handleSaveAsFhm2d = useCallback(async () => {
  const target = await save({
    filters: [{ name: "FHM2D", extensions: ["fhm2d"] }],
    title: "Save Scene as FHM2D",
  });
  if (!target) return;
  // Call scene_save_as_fhm2d via session
  toast.success("Scene saved as FHM2D");
}, []);

const handleRepack = useCallback(async () => {
  if (!stageRoot) return;
  // Call scene_repack_in_place via session
  toast.success("Scene repacked");
}, [stageRoot]);
```

- [ ] **Step 3: Commit**

```
git add src/page/SceneEdit/page.tsx
git commit -m "feat(scene): add save as folder, save as fhm2d, and repack handlers"
```

---

### Task 20: Add Open Folder entry to SceneEdit

**Files:**
- Modify: `src/page/SceneEdit/page.tsx`

- [ ] **Step 1: Add open folder handler**

The existing `onOpenFolder` prop is already passed to `MapToolbar`. Wire it to use the folder dialog:

```typescript
const handleOpenFolder = useCallback(async () => {
  const selected = await open({ directory: true, title: "Open Stage Folder" });
  if (!selected) return;
  setIsLoading(true);
  try {
    const bundle = await invoke<StageBundleResponse>("load_stage_bundle", {
      stageRoot: selected,
    });
    // Process bundle same as existing FHM2D load path
    setStageRoot(selected);
    setStageName(selected.split(/[/\\]/).pop() ?? "stage");
    // ... populate placement entries, graphic params, sub models
  } catch (err) {
    toast.error(`Failed to open folder: ${err}`);
  } finally {
    setIsLoading(false);
  }
}, []);
```

- [ ] **Step 2: Commit**

```
git add src/page/SceneEdit/page.tsx
git commit -m "feat(scene): wire Open Folder entry to load stage from directory"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|------------------|
| Phase 1 | Tasks 1-5 | Rust backend: SceneMemorySession, session commands, Havok CLI |
| Phase 2 | Tasks 6-11 | Frontend: DAE import types, config panels, modal |
| Phase 3 | Tasks 12-15 | Frontend: Havok view mode, collision overlay, scene loader |
| Phase 4 | Tasks 16-18 | Integration: wire everything into SceneEdit page |
| Phase 5 | Tasks 19-20 | Save/repack system, open folder entry |

Each phase produces independently testable functionality. Phase 1 can be verified with `cargo build`. Phases 2-3 can be verified with `tsc --noEmit`. Phases 4-5 require running the application.
