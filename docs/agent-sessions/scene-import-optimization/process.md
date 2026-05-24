# Scene Editor Import Optimization — Process

## Context Gathered

### Current Architecture
- `MapToolbar.tsx`: Has dropdown with "Quick Import" and "Import with Config..." menu items
- `DaeImportConfigModal.tsx`: Full config modal with preview/ssbh mode toggle
- `daeImportTypes.ts`: `DaeImportConfig` has `generateHkt` field, only shown for preview mode
- `daeImportDefaults.ts`: `createDefaultDaeImportConfig` sets `generateHkt: false`, `defaultDdsFormat: "BC7_UNORM"`
- `DaeSsbhSessionStore` (zustand+persist): Manages full SSBH conversion session state
- `sceneTextureConvert.ts`: `convertPngToNutexb` calls Rust backend
- `TextureFormatSelect.tsx`: Existing DDS format picker (BC7_UNORM, BC7_UNORM_SRGB, BC5_UNORM, BC4_UNORM, BC1_UNORM, BC3_UNORM)
- `SCENE_TEXTURE_POOL.md`: Documents GPU texture sharing pool architecture
- Existing drag-drop in project uses HTML5 onDrop but CAN'T get local paths (falls back to file dialog)
- Tauri v2 `onDragDropEvent` from `@tauri-apps/api/webviewWindow` is the correct approach

### Key Files
- `src/page/SceneEdit/components/MapToolbar.tsx` — toolbar with import buttons
- `src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx` — config modal
- `src/page/SceneEdit/components/dae-import/daeImportTypes.ts` — type definitions
- `src/page/SceneEdit/components/dae-import/daeImportDefaults.ts` — default values
- `src/page/SceneEdit/components/dae-import/DaeImportSsbhFullPanel.tsx` — SSBH full panel
- `src/page/SceneEdit/page.tsx` — main page with handleImportDae, handleImportDaeWithConfig
- `src/page/TestEditor/components/ssbh-model-preview/store/daeSsbhSessionStore.ts` — session store
- `src/page/SceneEdit/utils/sceneTextureConvert.ts` — PNG→nutexb conversion
- `src/page/SceneEdit/components/TextureFormatSelect.tsx` — format select component
- `src/page/SceneEdit/components/ModelTextureSlotPanel.tsx` — texture slot panel
- `src/page/SceneEdit/components/SceneOutliner.tsx` — left panel outliner

### Design Decisions (from interview)
1. Single import entry point (no Quick Import)
2. generateHkt in both modes; SSBH does HKT in convert step
3. Persist-based prefill (don't reset on loadAnalysis)
4. TexturePathPicker: basename only, keep extension
5. All images → nutexb (EXVS requirement)
6. Immediate conversion with DDS format config
7. Auto-recommend format by slot type
8. Texture Manager in left Outliner as new tab
9. Rich display with thumbnails
10. Window-level Tauri drag-drop with smart routing
11. Save: full reassembly of stage_image_list

## Implementation Log

### Phase 1 (Complete)
- Removed Quick Import dropdown from MapToolbar; unified to single button calling config modal
- Removed `onImportDae` prop chain from MapToolbar → page.tsx → ViewportContextMenu
- generateHkt checkbox condition `primaryMode === "preview"` removed — now shows in both modes
- HktConfigPanel condition also simplified to just `config.generateHkt`
- processDirectSsbhConvert now calls `scene_generate_hkt_from_dae_path` when generateHkt=true
- New Rust command `scene_generate_hkt_from_dae_path` added to havok_cli.rs (uses auto hko profile)
- daeSsbhSessionStore.loadAnalysis: preserves existing mayaFile/nustFile if non-empty, removed hardcoded outputBaseName reset
- createRowsFromAnalysis accepts previousRows, uses getMostCommonLabel instead of "pbr1Mtl"

### Phase 2 (Complete)
- Created `TexturePathPicker.tsx`: file picker, drag-drop zone, basename extraction, DDS format auto-recommendation by paramId, immediate conversion
- Integrated into `NumatbMaterialEntryEditor.tsx`: added `paramId` prop to `AttributeValueEditor`, texture path params render TexturePathPicker
- Integrated into `ModelTextureSlotPanel.tsx`: optional `onTexturePathChange` prop, pencil edit button, inline TexturePathPicker

### Phase 3 (Complete)
- Created `sceneTextureManagerStore.ts`: Zustand store with TextureManagerEntry type, CRUD actions, search, selection
- Created `SceneTextureManager.tsx`: searchable list, add/replace/delete, context menu, format+dimensions display
- Integrated into page.tsx left panel as Tabs (Outliner + Textures)
- `collectExistingNutexbEntries` populates store on stage load; `clear()` on reset

### Phase 4 (Complete)
- Created `useSceneDragDrop.ts`: Tauri v2 `onDragDropEvent`, routes .dae/.png/.nutexb to callbacks
- Created `sceneTextureSaveCollector.ts`: `collectTextureSaveManifest()` for save pipeline integration

### Files Modified
- src/page/SceneEdit/components/MapToolbar.tsx
- src/page/SceneEdit/components/ViewportContextMenu.tsx
- src/page/SceneEdit/components/dae-import/DaeImportConfigModal.tsx
- src/page/SceneEdit/page.tsx
- src/page/TestEditor/components/ssbh-model-preview/store/daeSsbhSessionStore.ts
- src-tauri/src/havok_cli.rs
- src-tauri/src/lib.rs

### Files Created
- src/page/SceneEdit/components/TexturePathPicker.tsx
- src/page/SceneEdit/components/SceneTextureManager.tsx
- src/page/SceneEdit/store/sceneTextureManagerStore.ts
- src/page/SceneEdit/hooks/useSceneDragDrop.ts
- src/page/SceneEdit/utils/sceneTextureSaveCollector.ts
- src/page/SceneEdit/components/ModelTextureSlotPanel.tsx (modified)
- src/page/TestEditor/components/ssbh-model-preview/components/NumatbMaterialEntryEditor.tsx (modified)

### Verification
- TypeScript `tsc --noEmit`: PASS (exit 0)
- Rust `cargo check`: PASS (exit 0)
