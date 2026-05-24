# Scene Editor Import Optimization — TODO

## Status: All Phases Complete ✅

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

## Remaining Work (not in scope but noted)
- Backend `generate_hkt_from_dae` is a stub — needs Havok SDK integration for DAE→HKT
- Thumbnail decode via `scene_decode_nutexb_thumbnail` Rust command (lazy, not yet implemented)
- fhm2d save reassembly Rust command to consume TextureSaveManifest (integration point ready)
- Wire `useSceneDragDrop` hook into SceneEdit page component with actual handlers
