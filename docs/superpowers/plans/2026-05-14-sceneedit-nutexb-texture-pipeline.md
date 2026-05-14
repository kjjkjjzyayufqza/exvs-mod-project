# 2026-05-14 SceneEdit Nutexb Texture Pipeline (Detailed Execution Plan)

## 1) Objective

Implement full `.nutexb` texture application in SceneEdit stage preview, with behavior **fully aligned** to TestEditor:

- same texture-slot mapping logic
- same decode and cache pipeline
- same memory/disk source handling
- same duplicate-texture dedupe behavior
- same failure tolerance behavior (partial texture failure does not block model display)

Target flow:

1. Import `.fhm2d` -> show `Stage Structure Preview`
2. User clicks `Load into Scene`
3. SceneEdit loads full model + CSV + texture pipeline
4. Repeated textures hit cache instead of re-decoding

## 2) Confirmed Product Decisions (Locked)

1. Reuse TestEditor model design directly.
2. Full material slot parity:
   - `map`, `normalMap`, `roughnessMap`, `metalnessMap`, `emissiveMap`, `aoMap`, `cubeMap`
3. Cache parity with TestEditor:
   - L1 memory LRU
   - L2 IndexedDB
   - inflight dedupe
   - versioned identity (`size + crc32`)
4. Eager decode after load (unique texture path basis).
5. Decode failure does not abort scene load.
6. Both memory-stage and disk-stage paths use the same texture pipeline.
7. Low-risk integration first (reuse before refactor).

## 3) Current State and Gaps

### 3.1 SceneEdit current state

- Scene mesh rendering is currently plain `meshStandardMaterial` color in `MapViewport`.
- No per-material texture path resolution.
- No decode progress for unique textures.
- No shared cache consumption.

### 3.2 Backend current state (after recent stage import changes)

- `preview_stage_fhm2d_rename` + `load_stage_from_preview` exist.
- In-memory stage load currently builds model bundles inside `fhm2d_stage.rs`.
- Current in-memory bundle metadata is not fully TestEditor-compatible:
  - `source_kind: "stage_memory"` (expected: `"memory"` for TestEditor pipeline)
  - missing valid `source_session_id` for memory texture IPC commands

### 3.3 TestEditor available reusable assets

- Texture-path and material binding logic in:
  - `meshFromSsbh.ts`
- Decode/cache logic in:
  - `nutexbPreviewCache.ts`
- Source-branch decode strategy in:
  - `SsbhModelPreviewContext.tsx`
    - disk: `nutexb_preview_file_identity` + `nutexb_png_bytes`
    - memory: `fhm2d_memory_nutexb_preview_identity` + `fhm2d_memory_nutexb_png_bytes`

## 4) Non-Goals

- No redesign of SceneEdit UI layout.
- No large-scale refactor moving TestEditor modules to a new shared package in this phase.
- No changes to texture art assets or matl authoring semantics.
- No automatic stage export changes beyond current scope.

## 5) Architecture Plan

### 5.1 Data flow (memory stage path)

1. `preview_stage_fhm2d_rename` parses and caches extraction.
2. `load_stage_from_preview` builds stage bundle.
3. Bundle(s) used by SceneEdit must carry TestEditor-compatible source fields:
   - `sourceKind = "memory"`
   - `sourceSessionId = <valid session>`
4. SceneEdit render pipeline resolves texture paths from `bundle.textureResolve`.
5. Unique texture paths decoded with shared cache logic.
6. Material maps are progressively applied to scene meshes.

### 5.2 Data flow (disk stage path)

1. `load_stage_bundle` returns disk-backed bundle.
2. SceneEdit uses same frontend texture pipeline.
3. Source branch automatically uses disk identity/decode commands.

### 5.3 Cache behavior

- Cache key generation reuses TestEditor implementation directly.
- Duplicate paths across different models must be decoded once per version identity.
- Memory and disk source types both participate using their respective identity commands.

## 6) File-Level Change Plan

## Backend (Rust)

1. `src-tauri/src/stage_commands.rs`
   - ensure stage memory load produces/retains valid memory session context for texture IPC
   - make `load_stage_from_preview` compatible with `sourceKind: "memory"` contract
   - preserve safe disposal behavior when replacing stage imports

2. `src-tauri/src/format/fhm2d_stage.rs`
   - adjust in-memory bundle building to align source metadata with TestEditor expectations
   - ensure `textureResolve`/`resolvedNutexbPaths` are valid for memory virtual paths
   - keep disk path behavior untouched

3. `src-tauri/src/fhm2d_memory_preview.rs` (if needed)
   - expose/reuse existing helper paths rather than duplicating decode logic
   - avoid introducing second texture identity strategy

## Frontend (TypeScript/React)

1. `src/page/SceneEdit/components/MapViewport.tsx`
   - replace plain color material-only path with material binding + texture slot application
   - reuse TestEditor-compatible draw/material texture mapping flow

2. `src/page/SceneEdit/page.tsx`
   - add texture decode progress state (`Decoding unique textures x/y`)
   - feed new material texture maps into viewport
   - keep existing stage import UX (`preview -> load`) intact

3. `src/page/SceneEdit/*` (new helper file(s), minimal)
   - add a thin SceneEdit texture pipeline hook/service that reuses TestEditor modules
   - explicitly avoid cloning large logic blocks when imports are possible

4. Reused modules (imported, not forked):
   - `src/page/TestEditor/components/ssbh-model-preview/meshFromSsbh.ts`
   - `src/page/TestEditor/components/ssbh-model-preview/nutexbPreviewCache.ts`

## 7) Detailed Work Packages

### WP-0: Safety prep and baseline

- [ ] Record baseline behavior screenshots:
  - memory stage load (no textures)
  - disk stage load (no textures)
- [ ] Confirm currently returned bundle fields for memory path:
  - `sourceKind`
  - `sourceSessionId`
  - `textureResolve`

### WP-1: Backend source metadata alignment

- [ ] Make memory stage bundles emit `sourceKind: "memory"`.
- [ ] Guarantee valid `sourceSessionId` for all memory bundles loaded by SceneEdit.
- [ ] Ensure each bundle has valid `textureResolve` entries usable by `resolveMaterialTexturePaths`.
- [ ] Verify memory texture IPC commands work with emitted virtual paths.

Acceptance:

- SceneEdit receives memory bundles with same source contract as TestEditor.

### WP-2: SceneEdit texture pipeline wiring

- [ ] Build per-draw material contexts:
  - matl lookup
  - texture ref -> path map
- [ ] Reuse `resolveMaterialTexturePaths` for all draws.
- [ ] Build unique texture path set by enabled slots.
- [ ] Implement source-aware identity calls:
  - memory: `fhm2d_memory_nutexb_preview_identity`
  - disk: `nutexb_preview_file_identity`
- [ ] Implement source-aware decode calls:
  - memory: `fhm2d_memory_nutexb_png_bytes`
  - disk: `nutexb_png_bytes`
- [ ] Route all decode through shared `getOrDecodeNutexbPngBlobUrl`.

Acceptance:

- SceneEdit draw materials receive actual texture URLs by slot.

### WP-3: Material slot application parity

- [ ] Apply full slot map in SceneEdit material layer:
  - `map`, `normalMap`, `roughnessMap`, `metalnessMap`, `emissiveMap`, `aoMap`, `cubeMap`
- [ ] Keep current wireframe/selection behavior intact.
- [ ] Preserve transform and picking behavior.

Acceptance:

- SceneEdit visual output matches TestEditor material slot behavior for same bundle.

### WP-4: Progress and warning UX

- [ ] Add `Decoding unique textures x/y` UI state in SceneEdit.
- [ ] Show current decoding label (basename) when available.
- [ ] Aggregate decode failures into warning toast, but do not abort scene render.

Acceptance:

- User can see decode progress and partial-failure warnings.

### WP-5: Lifecycle and cleanup

- [ ] Ensure memory session lifetime is stable during active SceneEdit preview.
- [ ] Dispose previous memory session on new stage import replacement.
- [ ] Dispose session on route/page cleanup where appropriate.

Acceptance:

- No stale memory-session errors after repeated import cycles.

### WP-6: Regression checks

- [ ] Memory stage import still supports:
  - stage tree preview
  - load into scene
  - object placement transforms
  - CSV panels
- [ ] Disk stage open still works.
- [ ] Existing non-texture SceneEdit features remain unchanged.

## 8) Data Contract Checklist

For each `SsbhModelPreviewBundle` consumed by SceneEdit:

- [ ] `modl`, `mesh` valid
- [ ] `matl` available when present
- [ ] `textureResolve` populated
- [ ] `sourceKind` in `{ "disk", "memory" }`
- [ ] `sourceSessionId` required when `sourceKind = "memory"`
- [ ] `resolvedNutexbPaths` consistent with path resolution output

## 9) Verification Matrix

### Functional

1. Memory import path:
   - [ ] Base model textures appear
   - [ ] All sub-model textures appear
   - [ ] Sky/extra model textures appear
2. Disk path:
   - [ ] Open folder stage renders textures with same slot behavior
3. Duplicate texture reuse:
   - [ ] same path referenced in multiple models decodes once

### Fault tolerance

1. Missing texture reference:
   - [ ] model still renders
   - [ ] warning shown
2. Broken nutexb decode:
   - [ ] stage remains interactive
   - [ ] warning shown

### Performance

1. First load:
   - [ ] decode progress visible
2. Reload same stage:
   - [ ] cache hit improves perceived load time

### Build/quality

1. Backend:
   - [ ] `cargo check --manifest-path src-tauri/Cargo.toml`
2. Frontend:
   - [ ] lint/type diagnostics clean on changed files

## 10) Risks and Mitigation

1. **Risk**: eager decode spike on very large stages.
   - **Mitigation**: keep TestEditor concurrency and cache; retain progress feedback.

2. **Risk**: memory session mismatch causes texture IPC failure.
   - **Mitigation**: enforce source contract and explicit lifecycle cleanup.

3. **Risk**: SceneEdit diverges from TestEditor implementation over time.
   - **Mitigation**: import existing modules directly; avoid logic forks in this phase.

4. **Risk**: partial backend metadata mismatch (sourceKind/sessionId) silently breaks texture load.
   - **Mitigation**: add explicit runtime assertions/logging for source contract in SceneEdit path.

## 11) Rollout and Rollback

### Rollout

1. Merge backend source-contract alignment.
2. Merge frontend texture pipeline wiring.
3. Run matrix validation (memory + disk + duplicate cache).
4. Ship with warning-based fault tolerance.

### Rollback

If critical regressions occur:

1. Disable SceneEdit texture application path behind a single guard flag.
2. Fall back to current non-textured mesh material rendering.
3. Keep import pipeline intact.

## 12) Deliverables

1. SceneEdit textured stage rendering with full TestEditor slot parity.
2. Shared duplicate-texture cache behavior across SceneEdit/TestEditor.
3. Decode progress and failure warnings in SceneEdit.
4. Verified memory and disk stage path consistency.

