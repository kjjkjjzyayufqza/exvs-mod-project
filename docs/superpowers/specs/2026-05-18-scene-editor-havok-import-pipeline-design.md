# Scene Editor: Havok Collision, DAE Import Pipeline, and Memory Session Design

**Date**: 2026-05-18
**Status**: Draft
**Scope**: Complete spec covering 5 subsystems

---

## 1. Overview

Enhance the SceneEdit page with:
1. **Havok collision volume visualization** in the 3D viewport
2. **DAE Import Config Modal** with checkbox-based options (load preview, SSBH conversion, HKT generation)
3. **Pure in-memory resource management** (Unreal-like: nothing hits disk until explicit Save/Repack)
4. **Scene save/repack** to fhm2d or folder
5. **Open Folder** entry for loading extracted stage directories

Architecture: **Centralized SceneMemorySession** in the Rust backend, holding all in-flight byte data. Frontend communicates via Tauri IPC commands.

---

## 2. Architecture

### Data Flow

```
Frontend (React/R3F)                  Backend (Rust)
+-------------------+                +---------------------------+
| SceneEdit Page    |<--- IPC ------>| SceneMemorySession        |
|  +- MapViewport   |                |  +- session_id            |
|  +- DaeImportModal|                |  +- source (fhm2d/folder) |
|  +- HavokOverlay  |                |  +- base_bundle bytes     |
|  +- SaveDialog    |                |  +- pending_imports[]      |
+-------------------+                |  |  +- dae_bytes           |
                                     |  |  +- ssbh_artifacts?     |
                                     |  |  +- hkt_bytes?          |
                                     |  +- placement_csv          |
                                     |  +- graphic_params         |
                                     |  +- havok_data[]           |
                                     +-----------+---------------+
                                                 |
                                     +-----------v---------------+
                                     | flush_to_folder()         |
                                     | flush_to_fhm2d()          |
                                     | repack_in_place()         |
                                     +---------------------------+
```

### State Ownership

| Data | Owner | Persistence |
|------|-------|-------------|
| Scene geometry (Three.js) | Frontend MapViewport | React state / R3F scene graph |
| SSBH binary artifacts | Rust SceneMemorySession | In-memory until Save |
| HKT collision bytes | Rust SceneMemorySession | In-memory until Save |
| Placement CSV | Rust SceneMemorySession | In-memory until Save |
| Havok collision mesh (Three.js) | Frontend HavokOverlay | Derived from session data |
| UI state (selection, view mode) | Frontend Zustand stores | React session |

---

## 3. SceneMemorySession (Rust Backend Core)

### File: `src-tauri/src/scene_memory_session.rs`

### Core Data Structures

```rust
pub struct SceneMemorySession {
    session_id: String,
    source: SceneSource,
    base_bundle: Option<StageBundleMemory>,
    pending_imports: Vec<PendingImport>,
    placement_header: Vec<String>,
    placement_entries: Vec<PlacementEntry>,
    graphic_params: Vec<GraphicParam>,
    havok_data: Vec<HavokCollisionData>,
    dirty: bool,
}

pub enum SceneSource {
    Fhm2d { path: String },
    Folder { path: String },
    New,
}

pub struct PendingImport {
    id: String,
    name: String,
    dae_bytes: Vec<u8>,
    config: ImportConfig,
    ssbh_artifacts: Option<SsbhArtifacts>,
    hkt_bytes: Option<Vec<u8>>,
}

pub struct ImportConfig {
    load_to_scene: bool,
    convert_to_ssbh: bool,
    generate_hkt: bool,
    ssbh_config: Option<SsbhConvertConfig>,
}

pub struct SsbhConvertConfig {
    base_filename: String,
    scale_factor: f64,
    up_axis: String,         // "y_up" | "z_up"
    write_numdlb: bool,
    write_numshb: bool,
    write_nusktb: bool,
    write_numatb: bool,
    write_jnttbl: bool,
    write_maya_profile: bool,
    material_template: Option<String>,
}

pub struct SsbhArtifacts {
    numdlb: Vec<u8>,
    numshb: Vec<u8>,
    nusktb: Option<Vec<u8>>,
    numatb: Vec<u8>,
    maya_numatb: Option<Vec<u8>>,
    jnttbl: Vec<u8>,
}

pub struct HavokCollisionData {
    source_id: String,
    hkt_xml: String,
    raw_bytes: Vec<u8>,
}

pub struct StageBundleMemory {
    root_files: HashMap<String, Vec<u8>>,
    sub_model_files: HashMap<String, HashMap<String, Vec<u8>>>,
}
```

### Tauri State Management

```rust
pub struct SceneSessionState {
    sessions: Mutex<HashMap<String, SceneMemorySession>>,
}
```

Registered as Tauri managed state in `lib.rs`:
```rust
.manage(SceneSessionState::default())
```

### Tauri Command Interface

```rust
// Session lifecycle
scene_session_create(source: SceneSource) -> String              // returns session_id
scene_session_destroy(session_id: String) -> ()
scene_session_is_dirty(session_id: String) -> bool

// Import pipeline
scene_import_dae(session_id: String, dae_bytes: Vec<u8>, name: String) -> String  // returns import_id
scene_configure_import(session_id: String, import_id: String, config: ImportConfig) -> ()
scene_execute_import(session_id: String, import_id: String) -> ImportResult
scene_remove_import(session_id: String, import_id: String) -> ()

// Havok
scene_load_hkt_from_session(session_id: String, object_id: String) -> HavokMeshDataPayload
scene_generate_hkt(session_id: String, import_id: String, config: HktConfig) -> HavokMeshDataPayload

// Save/Export
scene_save_as_folder(session_id: String, target_path: String) -> SaveResult
scene_save_as_fhm2d(session_id: String, target_path: String) -> SaveResult
scene_repack_in_place(session_id: String) -> SaveResult

// Open
scene_open_folder(path: String) -> SceneOpenResult        // uses existing load_stage_bundle_impl
scene_open_fhm2d(path: String) -> SceneOpenResult         // uses existing extract + load

// Havok SDK detection
detect_havok_installation() -> Option<HavokInstallInfo>
```

---

## 4. DAE Import Config Modal (Frontend)

### File Structure

```
src/page/SceneEdit/components/dae-import/
  DaeImportConfigModal.tsx          -- Main modal container
  DaeImportAnalysisPanel.tsx        -- DAE analysis result display
  DaeImportSsbhConfigPanel.tsx      -- SSBH conversion detail config
  DaeImportHktConfigPanel.tsx       -- HKT generation config
  daeImportTypes.ts                 -- Type definitions
  daeImportDefaults.ts              -- Default config values
```

### Interaction Flow

1. User clicks "Import DAE" button in MapToolbar
2. Tauri `open()` file dialog (supports multi-select, .dae filter)
3. For each selected file:
   a. Read bytes via `readFile()`
   b. Send bytes to Rust via `scene_import_dae()`
   c. Run `ssbh_analyze_dae` on the bytes for mesh stats
4. Modal opens showing analysis + config checkboxes
5. User configures options per file (or batch-apply)
6. User clicks "Import" -> calls `scene_configure_import()` + `scene_execute_import()`
7. Frontend receives result -> adds objects to Three.js scene graph

### Modal Layout

```
+----------------------------------------------+
| Import DAE: model_name.dae             [X]   |
+----------------------------------------------+
| DAE Analysis:                                |
|   Meshes: 3 | Vertices: 12,450 | Bones: 0   |
|                                              |
| [x] Load to scene (preview only)             |
| [x] Convert to SSBH                          |
|   +-- SSBH Configuration ------------------+ |
|   | Base filename: [model_name          ]   | |
|   | Scale factor:  [1.0                 ]   | |
|   | Up axis:       [Y-Up v]                | |
|   | [x] numdlb  [x] numshb  [x] nusktb    | |
|   | [x] numatb  [x] jnttbl  [x] Maya      | |
|   | Material template: [Default v]          | |
|   +-----------------------------------------+ |
| [ ] Generate HKT collision                   |
|   +-- HKT Configuration -------------------+ |
|   | Havok tool: [FileConvert.exe       ]    | |
|   | Config:     [physics export v]          | |
|   +-----------------------------------------+ |
|                                              |
|                   [Cancel]  [Import]          |
+----------------------------------------------+
```

### Key TypeScript Types

```typescript
interface DaeImportConfig {
  loadToScene: boolean;
  convertToSsbh: boolean;
  generateHkt: boolean;
  ssbhConfig: SsbhImportConfig;
  hktConfig: HktImportConfig;
}

interface SsbhImportConfig {
  baseFilename: string;
  scaleFactor: number;
  upAxis: 'y_up' | 'z_up';
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
  writeNumatb: boolean;
  writeJnttbl: boolean;
  writeMayaProfile: boolean;
  materialTemplate: string;
}

interface HktImportConfig {
  havokToolPath: string;
  configProfile: string;
}

interface DaeAnalysisResult {
  meshCount: number;
  vertexCount: number;
  boneCount: number;
  geometryNames: string[];
  canConvert: boolean;
  warnings: string[];
  blockingErrors: string[];
}
```

### Design Conventions

- Draggable modal using `useDraggableModal` hook (same as NumdlbEditorModalWindow)
- Card + CardContent container (shadcn/ui)
- lucide-react icons
- Conditional expansion: SSBH config area appears when "Convert to SSBH" is checked
- HKT config area appears when "Generate HKT" is checked
- Form validation via Zod schema

---

## 5. Havok Collision Visualization

### Viewport Mode Toggle

Add to `MapToolbar`:
- Three toggle states: `normal` | `collision` | `both`
- Icon: Shield/Box icon from lucide-react

### View Modes

| Mode | Model Rendering | Collision Rendering |
|------|-----------------|---------------------|
| normal | Full fidelity | Hidden |
| collision | Hidden | Green wireframe |
| both | Semi-transparent (opacity 0.15) | Green wireframe overlay |

### Collision Data Sources

1. **Existing HKT**: Loaded from stage folder/fhm2d during `scene_open_*`, stored in `SceneMemorySession.havok_data`
2. **Generated HKT**: Created during import via Havok CLI, stored in `PendingImport.hkt_bytes`

Both paths produce `HavokMeshData` (parsed XML) that the frontend converts to Three.js geometry.

### Component Structure

```
src/page/SceneEdit/components/havok/
  HavokCollisionOverlay.tsx         -- R3F component rendering collision meshes
  HavokViewModeToggle.tsx           -- Toolbar toggle button group
  havokSceneLoader.ts               -- Load + cache collision data from session
```

### R3F Integration

`HavokCollisionOverlay` is a React Three Fiber component rendered inside `MapViewport`:

```tsx
function HavokCollisionOverlay({ meshDataMap, viewMode }: Props) {
  if (viewMode === 'normal') return null;
  return (
    <>
      {Array.from(meshDataMap.entries()).map(([id, data]) => (
        <HavokCollisionMesh key={id} data={data} />
      ))}
    </>
  );
}
```

### Store Extension

Extend `sceneEditorStore`:
```typescript
viewMode: 'normal' | 'collision' | 'both';
setViewMode: (mode: 'normal' | 'collision' | 'both') => void;
havokMeshData: Map<string, HavokMeshData>;
setHavokMeshData: (id: string, data: HavokMeshData) => void;
clearHavokMeshData: () => void;
```

### Existing Code Reuse

- `havokXmlParser.ts`: `parseHavokXML()` for XML -> HavokMeshData
- `havokMeshGenerator.ts`: `generateHavokMesh()` for HavokMeshData -> BufferGeometry
- `createHavokMaterial()` for green wireframe material

---

## 6. Scene Save and Repack System

### Save Operations

#### Save as Folder
1. Rust reads `SceneMemorySession`
2. Writes `base_bundle` files to target directory
3. For each `pending_import` with `ssbh_artifacts`: writes numdlb/numshb/nusktb/numatb/jnttbl to sub-folder
4. For each `pending_import` with `hkt_bytes`: writes .hkt file
5. Writes placement CSV and graphic params
6. Clears dirty flag

#### Save to FHM2D
1. Same write logic as Save as Folder, targeting a temp directory
2. Generates stage structure JSON via `buildStageStructureJsonFromFiles`
3. Calls repack via `repackFolderUsingStructure` to produce .fhm2d
4. Writes the .fhm2d to target path
5. Cleans up temp directory

#### Repack In-Place
- Source is FHM2D: write to temp -> repack -> overwrite original file
- Source is Folder: write back to source folder + update structure.json

### Open Folder Entry

New "Open Folder" button in SceneEdit toolbar alongside existing "Open FHM2D":
- Uses Tauri `open({ directory: true })` dialog
- Calls existing `load_stage_bundle` Tauri command
- Sets `SceneSource::Folder { path }`
- Loads scene data into `SceneMemorySession`

### Progress Events

Reuse Tauri event pattern:
```rust
emit("scene-save-progress", SceneSaveProgress {
    phase: String,   // "writing" | "repacking" | "compressing"
    current: u32,
    total: u32,
    label: String,
})
```

Frontend listens via `listen("scene-save-progress")` and displays progress in `StageImportProgressDialog`.

### Rust Backend Commands

```rust
scene_save_as_folder(session_id: String, target_path: String) -> SaveResult
scene_save_as_fhm2d(session_id: String, target_path: String) -> SaveResult
scene_repack_in_place(session_id: String) -> SaveResult
scene_open_folder(path: String) -> SceneOpenResult
scene_open_fhm2d(path: String) -> SceneOpenResult
```

---

## 7. HKT Generation Pipeline (Havok SDK CLI)

### File: `src-tauri/src/havok_cli.rs`

### Havok Installation Detection

```rust
pub struct HavokCliConfig {
    file_convert_path: String,
    filter_manager_path: String,
    config_dir: String,
}

impl HavokCliConfig {
    pub fn detect() -> Option<Self> {
        let base = "C:\\Program Files\\Havok\\HavokContentTools";
        if std::path::Path::new(base).exists() {
            Some(Self {
                file_convert_path: format!("{base}\\FileConvert\\bin\\windows\\FileConvert.exe"),
                filter_manager_path: format!("{base}\\hctStandAloneFilterManager.exe"),
                config_dir: format!("{base}\\configurations"),
            })
        } else {
            None
        }
    }
}
```

### Generation Flow

```
DAE bytes (from PendingImport)
    |-- Write to temp file
    v
FileConvert.exe -i temp.dae -o temp.hkt -c <config_dir>/<profile>.hko
    |-- Read output
    v
HKT bytes -> stored in PendingImport.hkt_bytes
    |-- Clean temp files (automatic via tempfile crate)
```

### Tauri Commands

```rust
#[tauri::command]
pub fn detect_havok_installation() -> Option<HavokInstallInfo> {
    HavokCliConfig::detect().map(|config| HavokInstallInfo {
        version: "2018-1-0".to_string(),
        file_convert_available: Path::new(&config.file_convert_path).exists(),
        configs: list_hko_configs(&config.config_dir),
    })
}

#[tauri::command]
pub async fn scene_generate_hkt(
    session_state: State<'_, SceneSessionState>,
    session_id: String,
    import_id: String,
    config_profile: String,
) -> Result<HavokMeshDataPayload, String> {
    // 1. Get dae_bytes from session
    // 2. Call generate_hkt_from_dae()
    // 3. Store hkt_bytes back into PendingImport
    // 4. Parse HKT XML and return mesh data for frontend visualization
}
```

### Frontend Config UI

`DaeImportHktConfigPanel.tsx`:
- Havok install path (auto-detected, manually overridable)
- Config profile dropdown (scanned from configurations/ directory)
- Preview button (generates + visualizes collision in viewport)

---

## 8. Implementation Phases

### Phase 1: Foundation (Rust Backend)
1. `scene_memory_session.rs` - Core data structures and session state
2. `havok_cli.rs` - Havok SDK detection and CLI wrapper
3. Session lifecycle commands (create, destroy, dirty check)
4. Import pipeline commands (import_dae, configure, execute)
5. Save commands (save_as_folder, save_as_fhm2d, repack_in_place)
6. Register all commands in `lib.rs`

### Phase 2: DAE Import Modal (Frontend)
1. Type definitions (`daeImportTypes.ts`)
2. Default configs (`daeImportDefaults.ts`)
3. Modal container (`DaeImportConfigModal.tsx`)
4. Analysis panel (`DaeImportAnalysisPanel.tsx`)
5. SSBH config panel (`DaeImportSsbhConfigPanel.tsx`)
6. HKT config panel (`DaeImportHktConfigPanel.tsx`)
7. Wire into SceneEdit page.tsx import flow

### Phase 3: Havok Visualization
1. Store extension (viewMode, havokMeshData)
2. View mode toggle (`HavokViewModeToggle.tsx`)
3. Collision overlay component (`HavokCollisionOverlay.tsx`)
4. Scene data loader (`havokSceneLoader.ts`)
5. Wire into MapViewport

### Phase 4: Save/Repack System
1. Open Folder button in toolbar
2. Save dialog with folder/fhm2d/repack options
3. Progress event handling
4. Integration with existing repack infrastructure

### Phase 5: HKT Generation
1. Frontend HKT config panel
2. Havok CLI integration testing
3. Generated HKT preview in viewport
4. End-to-end: import DAE -> generate HKT -> visualize -> save

---

## 9. Files Changed / Created

### New Files (Rust Backend)
- `src-tauri/src/scene_memory_session.rs`
- `src-tauri/src/scene_session_commands.rs`
- `src-tauri/src/havok_cli.rs`

### Modified Files (Rust Backend)
- `src-tauri/src/lib.rs` (register new commands + managed state)

### New Files (Frontend)
- `src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx`
- `src/page/SceneEdit/components/dae-import/DaeImportAnalysisPanel.tsx`
- `src/page/SceneEdit/components/dae-import/DaeImportSsbhConfigPanel.tsx`
- `src/page/SceneEdit/components/dae-import/DaeImportHktConfigPanel.tsx`
- `src/page/SceneEdit/components/dae-import/daeImportTypes.ts`
- `src/page/SceneEdit/components/dae-import/daeImportDefaults.ts`
- `src/page/SceneEdit/components/havok/HavokCollisionOverlay.tsx`
- `src/page/SceneEdit/components/havok/HavokViewModeToggle.tsx`
- `src/page/SceneEdit/components/havok/havokSceneLoader.ts`

### Modified Files (Frontend)
- `src/page/SceneEdit/page.tsx` (import modal integration, open folder, save dialog)
- `src/page/SceneEdit/store/sceneEditorStore.ts` (viewMode, havokMeshData)
- `src/page/SceneEdit/components/MapToolbar.tsx` (view mode toggle, open folder button)
- `src/page/SceneEdit/components/MapViewport.tsx` (collision overlay, transparency mode)
- `src/page/SceneEdit/utils/sceneSavePipeline.ts` (refactor to use memory session)

---

## 10. Testing Strategy

### Unit Tests (Rust)
- SceneMemorySession CRUD operations
- SsbhArtifacts serialization/deserialization
- HavokCliConfig detection logic
- Save pipeline (folder + fhm2d) with mock data

### Integration Tests
- Full import pipeline: DAE bytes -> configure -> execute -> verify artifacts in session
- Save pipeline: session with imports -> save as folder -> verify file structure
- Havok CLI: mock CLI execution and verify output handling

### E2E Tests (Playwright)
- Open folder -> verify scene loads
- Import DAE -> configure modal -> verify objects in scene
- Toggle collision view mode -> verify viewport changes
- Save as folder -> verify output directory structure

---

## 11. Risk Assessment

| Risk | Mitigation |
|------|------------|
| High memory usage with large scenes | Implement session memory budget warning; future: LRU eviction |
| Havok CLI not installed | Graceful degradation: disable HKT features with clear message |
| FileConvert.exe CLI args unknown | Test with sample HKT files from Samples/ directory first |
| SSBH conversion in-memory vs on-disk | Refactor existing ssbh_dae module to accept byte streams |
| Concurrent session access | Mutex-guarded session state (consistent with existing patterns) |
