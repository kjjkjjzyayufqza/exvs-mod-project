# Progressive Hydration IPC — Scene Editor Stage Loading Optimization

## Problem

Opening a 3GB Stage folder takes 30+ seconds before any UI appears. The bottleneck is a four-layer stack:

1. **Rust**: `load_stage_bundle_impl` sequentially parses ALL SSBH sub-models (base + N sub-models)
2. **Serialization**: `StageBundle` with nested `serde_json::Value` fields serialized to a single massive JSON payload
3. **IPC**: Entire JSON transmitted atomically through WebView fetch (~200ms per 10MB on Windows)
4. **Duplication**: `handleLoadStageFolder` calls both `load_stage_bundle` AND `sceneOpenFolder`, which internally calls `load_stage_bundle_impl` again

## Solution: Progressive Hydration IPC

Split the monolithic `load_stage_bundle` into a two-phase streaming pipeline:

```
Phase 1: Skeleton (instant, < 100ms)
  Rust reads CSV + scans dirs → small JSON → Frontend renders UI immediately

Phase 2: Model Stream (progressive, parallel)
  Rust parses models with rayon → Channel<StageStreamChunk> → Frontend hydrates viewport one model at a time
```

## Architecture

### Phase 1 — `stage_load_skeleton`

New Tauri command returning lightweight metadata only:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSkeleton {
    pub root_path: String,
    pub placement_header: Vec<String>,
    pub placement_entries: Vec<PlacementEntry>,
    pub graphic_params: Vec<GraphicParamEntry>,
    pub sub_model_manifest: Vec<SubModelManifestEntry>,
    pub has_base_model: bool,
    pub warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubModelManifestEntry {
    pub folder_name: String,
    pub object_index: usize,
}
```

This only reads:
- `info/placement.csv` and `info/graphic_param.csv` (small text files)
- Directory listing to build `sub_model_manifest` (no file I/O)
- Checks if `base/` has a `.numdlb` file (stat only, no read)

Expected latency: < 50ms for any stage size.

### Phase 2 — `stage_stream_bundles`

New Tauri command using `Channel` for progressive model streaming:

```rust
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum StageStreamChunk {
    #[serde(rename = "baseModel")]
    BaseModel {
        bundle: SsbhModelPreviewBundle,
    },
    #[serde(rename = "subModel")]
    SubModel {
        folder_name: String,
        object_index: usize,
        bundle: SsbhModelPreviewBundle,
    },
    #[serde(rename = "progress")]
    Progress {
        loaded: usize,
        total: usize,
    },
    #[serde(rename = "complete")]
    Complete {
        total_models: usize,
        elapsed_ms: u64,
    },
    #[serde(rename = "error")]
    Error {
        message: String,
        folder_name: Option<String>,
    },
}
```

Rust implementation uses `rayon` for parallel SSBH parsing:
1. Collect all model folder paths
2. Parse base model first (priority) → send immediately via channel
3. Use `rayon::par_iter` for sub-models → send each as ready
4. Send `Complete` when all done

### Phase 3 — Eliminate Duplicate Loading

Current flow:
```
handleLoadStageFolder:
  invoke("load_stage_bundle")     ← loads everything
  sceneOpenFolder(stageRoot)      ← loads everything AGAIN + HKT conversion
    → load_stage_bundle_impl()    ← duplicate
    → collect_hkt_as_xml()
```

New flow:
```
handleLoadStageFolder:
  invoke("stage_load_skeleton")   ← instant metadata
  invoke("stage_stream_bundles")  ← progressive models via Channel
  sceneOpenFolder(stageRoot)      ← only creates session + loads HKT (no bundle reload)
```

Modify `scene_open_folder` to skip re-loading the stage bundle. It only needs to:
- Create a `SceneMemorySession`
- Convert HKT files (already async)
- Store placement/graphic data from the skeleton (passed as params or cached)

## Frontend Changes

### New State Management

```typescript
// Skeleton applied immediately
const [skeletonLoaded, setSkeletonLoaded] = useState(false);
const [modelLoadProgress, setModelLoadProgress] = useState({ loaded: 0, total: 0 });

// Models accumulated progressively
const handleLoadStageFolder = async () => {
  // Phase 1: Skeleton (instant)
  const skeleton = await invoke<StageSkeleton>("stage_load_skeleton", { stageRoot });
  applySkeleton(stageRoot, skeleton);  // UI renders immediately

  // Phase 2: Stream models
  const channel = new Channel<StageStreamChunk>();
  channel.onmessage = (chunk) => {
    switch (chunk.kind) {
      case "baseModel":
        setBaseModel(chunk.bundle);
        break;
      case "subModel":
        setSubModels(prev => [...prev, { folderName: chunk.folderName, objectIndex: chunk.objectIndex, bundle: chunk.bundle }]);
        break;
      case "progress":
        setModelLoadProgress({ loaded: chunk.loaded, total: chunk.total });
        break;
      case "complete":
        // finalize
        break;
    }
  };
  await invoke("stage_stream_bundles", { stageRoot, onChunk: channel });
};
```

### `applySkeleton` Function

Sets all non-model state immediately:
- `setStageName`, `setStageRoot`
- `setPlacementHeader`, `setPlacementEntries`
- `setGraphicParams`
- `setTreeRoot` (skeleton tree with placeholder nodes for models)

### Progressive Tree Building

The hierarchy tree initially shows folder names from the manifest. As each model arrives, the tree node gets updated with full model metadata.

## Performance Targets

| Metric | Before | After |
|--------|--------|-------|
| Time to first UI | 30s+ | < 200ms |
| Time to first model in viewport | 30s+ | < 2s |
| Time to all models loaded | 30s+ | 15-20s (parallel parsing) |
| IPC payload size (peak) | 100MB+ single JSON | 5-20MB per chunk |
| Memory peak | 2x (Rust + JSON + WebView) | 1.2x (streaming) |

## Files to Modify

### Rust (src-tauri/src/)
- `format/fhm2d_stage.rs` — Add `load_stage_skeleton_impl`, `StageStreamChunk`, `SubModelManifestEntry`
- `stage_commands.rs` — Add `stage_load_skeleton`, `stage_stream_bundles` commands
- `scene_session_commands.rs` — Modify `scene_open_folder` to skip bundle reload
- `lib.rs` — Register new commands

### Frontend (src/page/SceneEdit/)
- `page.tsx` — New `handleLoadStageFolder` with skeleton+stream pattern
- `utils/sceneSessionService.ts` — Add `stageLoadSkeleton`, `stageStreamBundles` service functions
- `types/` — Add `StageSkeleton`, `StageStreamChunk` types

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Channel message ordering | Tauri Channel guarantees ordered delivery |
| Frontend re-render thrashing | Use `startTransition` + batch state updates |
| Rayon thread contention with Tokio | Use `spawn_blocking` to bridge sync rayon into async |
| Error in one sub-model blocks all | Each model wrapped in try/catch, errors reported via channel |
