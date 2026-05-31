# Scene Editor Import Optimization — TODO

## Status: Resumed for FBX, Direct-to-Disk Import, and Export Scope

## Phase 1: Import Flow Refactoring ✅
- [x] Remove Quick Import dropdown, unify to single Import button → DaeImportConfigModal
- [x] Show generateHkt checkbox in both preview AND ssbh modes
- [x] SSBH mode: generate HKT during Convert step (one-step)
- [x] Prefill optimization: persist preserves last session settings, loadAnalysis doesn't reset
- [x] New mesh materialLabel uses last-used value instead of hardcoded "pbr1Mtl"

## Phase 2: TexturePathPicker Component + Drag-and-Drop ✅
- [x] Create reusable TexturePathPicker component
- [x] Integrate into numatb profile editor (NumatbMaterialEntryEditor)
- [x] Integrate into ModelTextureSlotPanel

## Phase 3: Texture Manager ✅
- [x] New "Textures" tab in left Outliner panel
- [x] Load existing nutexb from stage bundle on open
- [x] CRUD operations + context menu + thumbnails

## Phase 4: Global Drag-Drop Routing + Pack Integration ✅
- [x] Tauri v2 window-level drag-drop hook with smart routing
- [x] Save pipeline texture manifest collector

## Phase 5: Static Mesh Import Scope
- [x] Extend Scene Editor import modal from DAE-only to DAE/FBX static mesh input
- [x] Add out-of-scene direct-to-disk checkbox and output directory selection
- [x] Route direct-to-disk conversion through Rust path-based conversion, not IPC byte payloads
- [x] Preserve in-scene preview/import for normal-sized DAE/FBX files

## Phase 6: Static Mesh Export Scope
- [x] Add right-click model export target for DAE/FBX plus referenced textures
- [x] Keep DAE export using existing Rust SSBH export path
- [x] Implement or explicitly gate FBX export based on available writer support

## Remaining Work
- FBX export is a basic Three.js scene export (geometry, normals, UVs, material color, diffuse texture when traceable); no official Rust FBX writer is available yet.
- Thumbnail decode via `scene_decode_nutexb_thumbnail` Rust command (lazy, not yet implemented)
- fhm2d save reassembly Rust command to consume TextureSaveManifest (integration point ready)
- Wire `useSceneDragDrop` hook into SceneEdit page component with actual handlers
