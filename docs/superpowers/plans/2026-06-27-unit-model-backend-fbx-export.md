# Unit Model Backend FBX Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Unit Model Editor's viewport/Three.js FBX export with direct Rust SSBH-to-FBX batch export.

**Architecture:** A new Rust exporter builds binary FBX 7.5 data with `fbxcel` from disk-backed SSBH mesh, skeleton, model, and material data. Unit Model Editor sends only model paths and options through one Tauri command; Scene Editor retains its existing frontend exporter.

**Tech Stack:** Rust, Tauri v2, `ssbh_data`, `fbxcel`, React, TypeScript.

---

### Task 1: Add The Rust FBX Writer

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/ssbh_fbx.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] Add `fbxcel = { version = "0.9.0", features = ["writer"] }`.
- [ ] Define export scene records for meshes, bones, vertex weights, materials,
  and optional external textures.
- [ ] Convert `MeshData` and optional `SkelData` to bind-pose records, including
  the rigid `parent_bone_name` fallback used by the existing backend DAE path.
- [ ] Write binary FBX 7.5 header, settings, definitions, geometry, materials,
  texture/video records, skeleton models, skin deformers, clusters, bind pose,
  and connections with `fbxcel::writer::v7400::binary::Writer`.
- [ ] Apply export scale to positions and bone translations; declare either
  Y-up/Z-forward or Z-up/X-forward in GlobalSettings.
- [ ] Register the module in `lib.rs`.

### Task 2: Add Batch Tauri Export

**Files:**
- Modify: `src-tauri/src/ssbh_fbx.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] Define camelCase request/result DTOs:

```rust
pub struct BatchFbxExportEntry {
    pub root_path: String,
    pub output_name: String,
}

pub struct BatchFbxExportResult {
    pub exported: Vec<BatchFbxExportedFile>,
    pub errors: Vec<String>,
    pub total_exported: usize,
    pub total_failed: usize,
}
```

- [ ] Add `unit_model_batch_export_fbx` using `spawn_blocking` and sequential
  per-entry processing.
- [ ] Resolve NUMSHB/NUSKTB/NUMATB references directly from NUMDLB, export
  optional base-color PNGs, and call the FBX writer without creating a preview
  bundle.
- [ ] Return per-model mesh/vertex/texture counts and collect per-model errors.
- [ ] Register `unit_model_batch_export_fbx` in Tauri's invoke handler.

### Task 3: Replace Unit Frontend Export Data Flow

**Files:**
- Modify: `src/page/UnitModelEdit/utils/unitModelExport.ts`
- Modify: `src/page/UnitModelEdit/page.tsx`

- [ ] Change Unit export capabilities to count disk-backed SSBH instances,
  independent of viewport object IDs.
- [ ] Build dialog targets from each disk instance's `modlPath`, label, and
  collision-safe output name. Record memory instances as skipped.
- [ ] Add TypeScript DTOs and an `invoke("unit_model_batch_export_fbx", ...)`
  service function.
- [ ] Remove Unit Model Editor's viewport export ref/ID tracking and
  `SceneExportObject`/`exportObjectsAsFBXToDirectory` dependency.
- [ ] Forward dialog scale, axis, texture, and directory options to Rust and
  report the returned successes/errors through the existing toast flow.
- [ ] Keep `SsbhModelPreviewViewport` itself unchanged because Scene Editor and
  other consumers may still use its imperative export handle.

### Task 4: Static Completion Audit

**Files:**
- Inspect: all modified files

- [ ] Format changed Rust and TypeScript files with existing formatters where
  available.
- [ ] Inspect the diff for accidental Scene Editor changes, DAE additions,
  viewport-object dependencies in Unit export, and unresolved command names.
- [ ] Do not run automated tests, per the user's explicit request.
