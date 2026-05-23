# Progressive Hydration IPC — Implementation Progress

> Design spec: [2026-05-23-progressive-hydration-ipc-design.md](./2026-05-23-progressive-hydration-ipc-design.md)

## Overview

Scene Editor opening a 3GB Stage folder took 30+ seconds (monolithic IPC). We implemented **Progressive Hydration IPC** — split into skeleton (instant UI) + Channel streaming (progressive models). Result: **1,199x faster time-to-first-UI** (3ms vs 3,597ms).

---

## Completed Work

### 1. Rust Backend — Skeleton + Stream Commands

**Files modified:**

| File | Changes |
|------|---------|
| `src-tauri/src/format/fhm2d_stage.rs` | Added `StageSkeleton`, `SubModelManifestEntry`, `StageStreamChunk` types; `load_stage_skeleton_impl()`, `load_model_in_subfolder_pub()` functions |
| `src-tauri/src/stage_commands.rs` | Added `stage_load_skeleton` and `stage_stream_bundles` Tauri commands |
| `src-tauri/src/lib.rs` | Registered new commands in `generate_handler!` macro |
| `src-tauri/src/scene_session_commands.rs` | Changed `scene_open_folder` to use `load_stage_skeleton_impl` instead of `load_stage_bundle_impl` (eliminates duplicate full-bundle parse) |

**Key types:**

```rust
// Lightweight metadata — CSV + dir listing only, no SSBH binary parsing
pub struct StageSkeleton {
    root_path, placement_header, placement_entries,
    graphic_params, sub_model_manifest, has_base_model, warnings
}

// Tagged enum streamed via Tauri Channel
pub enum StageStreamChunk {
    BaseModel { bundle },
    SubModel { folder_name, object_index, bundle },
    Progress { loaded, total },
    Complete { total_models, elapsed_ms },
    Error { message, folder_name },
}
```

**`stage_stream_bundles` flow:**
1. Loads skeleton to get manifest
2. Loads base model first (priority) → sends via Channel
3. Iterates sub-models sequentially → sends each via Channel with progress
4. Sends `Complete` chunk when done

### 2. Frontend — Types, Services, and Page Integration

**Files modified:**

| File | Changes |
|------|---------|
| `src/page/SceneEdit/utils/sceneSessionService.ts` | Added `StageSkeleton`, `StageStreamChunk`, `SubModelManifestEntry` types; `stageLoadSkeleton()`, `stageStreamBundles()` service functions using Tauri `Channel` API |
| `src/page/SceneEdit/page.tsx` | Rewrote `handleOpenFolder` with skeleton+stream pattern; added `modelLoadProgress` state; added `applySkeleton()` function |
| `src/page/SceneEdit/components/SceneViewportOverlay.tsx` | Added `modelLoadProgress` prop with streaming progress bar |

**`handleOpenFolder` new flow:**
```
1. stageLoadSkeleton(root) → applySkeleton() → UI renders immediately
2. stageStreamBundles(root, onChunk) → progressive model hydration
   - baseModel → setBaseModel (wrapped in startTransition)
   - subModel → setSubModels append (wrapped in startTransition)
   - progress → setModelLoadProgress
   - complete → clear progress
3. sceneOpenFolder(root) → runs in parallel for HKT/Havok data only
```

### 3. Duplicate Loading Eliminated

- **Before:** `scene_open_folder` internally called `load_stage_bundle_impl` (3,594ms wasted)
- **After:** `scene_open_folder` calls `load_stage_skeleton_impl` (3ms) — only creates session + converts HKT

### 4. Performance Benchmarks — Model Loading

**File:** `src-tauri/tests/stage_bundle_test.rs`

Added `bench_stage211_progressive_vs_monolithic` and `bench_stage211_detailed` (5-round benchmark with warmup).

**Stage 211 (0xBBC60B47) Results — debug build:**

| Phase | Median | Payload |
|-------|--------|---------|
| OLD: Monolithic `load_stage_bundle_impl` | 3,597ms | 252.81 MB JSON |
| NEW: Skeleton (Phase 1) | 3ms | 27.66 KB |
| NEW: First model visible | ~2,923ms | Base model alone: 220.04 MB |
| NEW: All models streamed (Phase 2) | ~3,580ms | Chunked delivery |

- **Time-to-first-UI speedup:** 1,199x (3ms vs 3,597ms)
- **Duplicate load elimination:** saves 3,594ms
- **Base model is the single biggest bottleneck:** 220.04 MB JSON, 2,923ms, 135 texture references

### 5. Performance Benchmarks — Texture Decode (nutexb)

**File:** `src-tauri/tests/stage_bundle_test.rs` — `bench_stage211_texture_decode`

Benchmarks the nutexb texture decode pipeline for Stage 211's 6 environment textures:

**Stage 211 Texture Results — debug build:**

| Metric | Value |
|--------|-------|
| Total .nutexb files | 6 (environment textures only) |
| On-disk size | 2.21 MB |
| RGBA decoded size | 6.64 MB (3.01x inflation) |
| Compressed GPU size | 0.43 MB (0.19x ratio) |
| Sequential RGBA decode | 435.0ms |
| Sequential compressed extract | 4.5ms |
| Parallel (8 threads) RGBA | 420.0ms (1.04x — I/O bound on 6 files) |
| Parallel (8 threads) compressed | 4.1ms (1.93x) |

**Single biggest texture:**
- `211stage211_ibl_specular.nutexb` (BC6H, 512x3072): **418.6ms** to RGBA, 6.00 MB decoded

**IPC Strategy Comparison:**
- Strategy A (RGBA → ArrayBuffer): 6.64 MB, 435.0ms
- Strategy B (Compressed → GPU): 0.43 MB, 4.5ms
- **B saves 6.21 MB IPC payload and 430.5ms CPU time**

**Downsampled decode (maxDimension=512):**
- 6 textures: 1,146.8ms total (191.1ms avg) — **slower** due to Lanczos3 resize after decode

---

## Current Status

All core implementation is complete and compiling. The benchmark tests run successfully.

**Tasks completed:**
- [x] Rust: StageSkeleton types + load_stage_skeleton_impl
- [x] Rust: StageStreamChunk + stage_stream_bundles command
- [x] Rust: Register new commands in lib.rs
- [x] Frontend: TypeScript types + service functions
- [x] Frontend: Refactor page.tsx handleOpenFolder
- [x] Modify scene_open_folder to skip duplicate bundle reload
- [x] Model loading benchmark (bench_stage211_detailed)
- [x] Texture decode benchmark (bench_stage211_texture_decode)
- [x] A1: rayon parallel model parsing in stage_stream_bundles
- [x] B2: Compressed texture GPU upload via compressedTexImage2D
- [x] B3: Mip level selection replaces Lanczos3 resize
- [x] B4: Single-read CRC32 identity + compressed decode

---

## Planned / Remaining Work

### Phase A — Immediate (high impact, low effort)

#### A1. rayon Parallel Model Parsing ✅ DONE
`stage_stream_bundles` now uses `rayon::par_iter` for parallel SSBH parsing. All sub-models are parsed concurrently via rayon's work-stealing thread pool within a single `spawn_blocking` call, then results are sent to the Channel in manifest order (deterministic).

**Changes:**
- Added `rayon = "1.10"` to `Cargo.toml`
- Replaced manual batch concurrency (`spawn_blocking` per entry × fixed batch size) with one `spawn_blocking` wrapping `rayon::par_iter().map().collect()`
- Results are collected in parallel, then sent sequentially to preserve ordering guarantees

#### A2. Expanded Texture Benchmark with Model Textures
Current benchmark only covers 6 environment nutexb files (in `info/` directory). The actual texture load bottleneck in the scene editor comes from **model textures** referenced by `.numatb` material files. These paths are resolved during bundle loading (via `bundle.textureResolve`).

**Next step:** Extract `textureResolve` paths from loaded model bundles, then benchmark the full set of model-referenced nutexb files for a stage.

**Why it matters:** The frontend `useSceneTextureLoader` decodes these textures with 8-concurrent IPC calls. The total wall time depends on the slowest batch.

### Phase B — Optimization Opportunities (from benchmark data)

#### B1. Base Model JSON Payload Reduction
The base model alone is 220 MB of JSON. This is the largest single IPC payload and takes 2,923ms to parse. Options:
- **Binary IPC:** Use Tauri's `InvokeBody::Raw` with a custom binary format instead of JSON serialization for mesh/vertex data
- **Lazy field loading:** Stream mesh vertex data separately from metadata
- **Compression:** zstd compress the JSON before IPC transfer

#### B2. Compressed Texture GPU Upload Path ✅ DONE
Frontend now prefers compressed texture GPU upload via `compressedTexImage2D` (BC1-BC7).

**Changes:**
- `nutexbPreviewCache.ts`: Added `NutexbCompressedData`, `COMPRESSED_FORMAT_MAP`, `parseCompressedResponse`, `getOrDecodeNutexbCompressed`, `parseIdentityAndCompressedResponse`
- `useSceneTextureLoader.ts`: Added `NutexbTextureData` discriminated union (`rgba` | `compressed`), GPU extension detection at startup, prefers compressed path for disk source without downsampling
- `MapViewport.tsx`: `createDataTexture` handles both RGBA (`THREE.DataTexture`) and compressed (`THREE.CompressedTexture`), updated all result types from `THREE.DataTexture` to `THREE.Texture`
- `SceneTexturePool.ts`: Generalized from `THREE.DataTexture` to `THREE.Texture`
- Savings: **96x faster decode** (4.5ms vs 435ms), **15x smaller IPC** (0.43 MB vs 6.64 MB) for BC-format textures

#### B3. Texture Decode Downsampling Strategy ✅ DONE
Replaced Lanczos3 resize with mip level selection — decodes a lower mip directly from DDS data.

**Changes:**
- `nutexb_lib.rs`: `nutexb_to_rgba_from_bytes` now calls `select_mip_level()` to pick the appropriate pre-generated mip level when `maxDimension` is set, then passes that mip index to `image_from_dds`. No more full-resolution decode + expensive CPU resize.
- For a 2048x2048 texture with maxDim=512, this decodes mip 2 (512x512) directly instead of decoding 2048x2048 + Lanczos resize.

#### B4. Texture Identity CRC32 Optimization ✅ DONE
Merged CRC32 identity + compressed decode into a single file read — eliminates double I/O.

**Changes:**
- `nutexb_lib.rs`: Added `nutexb_identity_and_compressed_from_path()` — reads file once, computes CRC32, extracts compressed data
- `commands.rs`: Added `nutexb_identity_and_compressed` Tauri command — returns `[u64 size][u32 crc32][u32 w][u32 h][u8 fmt][data...]`
- `nutexbPreviewCache.ts`: Added `parseIdentityAndCompressedResponse()` parser
- `useSceneTextureLoader.ts`: When `useCompressed`, Phase 1 calls the combined command (one read per file), stores both identity for dedup AND compressed data for the decode phase — zero additional I/O in Phase 3

### Phase C — Future Architecture Improvements

#### C1. Shared Memory / Memory-Mapped Files
For binary data (vertex buffers, texture pixels), use shared memory regions instead of IPC serialization. Tauri v2 doesn't natively support this, but it can be achieved via:
- Memory-mapped files (mmap) with file path passed via IPC
- WebAssembly SharedArrayBuffer (requires COOP/COEP headers)

#### C2. WebGPU Texture Upload
When WebGPU becomes stable in WebView2, compressed textures can be uploaded directly without WebGL extension checks. This also enables compute shader decode for formats not supported by hardware.

#### C3. Incremental Model Updates
For save/reload workflows, diff the stage state instead of full reload. Only re-parse models whose files changed on disk.

---

## File Inventory

### Modified Files (in this feature branch)

```
src-tauri/
  Cargo.toml                    (+1 line)      — rayon dependency
  src/format/fhm2d_stage.rs    (+112 lines)  — skeleton types, skeleton loader, model loader pub wrapper
  src/stage_commands.rs         (+118 lines)  — stage_load_skeleton, stage_stream_bundles (rayon parallel)
  src/scene_session_commands.rs (+15/-1 lines) — eliminated duplicate bundle load
  src/nutexb_lib.rs             (+30/-12 lines) — mip level selection, combined identity+compressed
  src/commands.rs               (+20 lines)    — nutexb_identity_and_compressed command
  src/lib.rs                    (+3 lines)     — command registration
  tests/stage_bundle_test.rs    (+776 lines)   — comprehensive benchmark suite

src/page/SceneEdit/
  utils/sceneSessionService.ts  (+51/-1 lines)  — skeleton/stream types and service functions
  page.tsx                      (+131 lines)     — handleOpenFolder rewrite with progressive hydration
  components/SceneViewportOverlay.tsx (+16/-1 lines) — streaming progress bar UI
  hooks/useSceneTextureLoader.ts (+60/-30 lines) — compressed+identity combined path, GPU ext detection
  components/MapViewport.tsx    (+50/-10 lines)  — CompressedTexture support, type generalization
  utils/SceneTexturePool.ts     (type change)    — THREE.DataTexture → THREE.Texture
  components/TextureQualityPanel.tsx (+1/-1 line) — discriminated union check

src/page/TestEditor/
  components/ssbh-model-preview/nutexbPreviewCache.ts (+90 lines) — compressed types, cache, parsers
```

### New Files (untracked)

```
docs/superpowers/specs/2026-05-23-progressive-hydration-ipc-design.md   — design spec
docs/superpowers/specs/2026-05-23-progressive-hydration-ipc-progress.md — this file
```

### Unchanged (intentional)

- `sceneSaveFolderPipeline.ts` / `sceneSavePipeline.ts` — save pipelines still use monolithic `load_stage_bundle` for post-save verification (correct behavior — save needs full consistency check)
- `nutexb_lib.rs` — no changes needed; existing decode functions are sufficient
- `useSceneTextureLoader.ts` — no changes yet; texture streaming optimization is Phase B

---

## Benchmark Commands

```bash
# Model loading benchmark (5 rounds, warmup)
cargo test --test stage_bundle_test bench_stage211_detailed -- --ignored --nocapture

# Texture decode benchmark
cargo test --test stage_bundle_test bench_stage211_texture_decode -- --ignored --nocapture

# Quick progressive vs monolithic comparison
cargo test --test stage_bundle_test bench_stage211_progressive -- --ignored --nocapture

# All benchmarks
cargo test --test stage_bundle_test bench_ -- --ignored --nocapture
```

**Test data:** `E:\XB\解包\com\test\0xBBC60B47\0\0` (Stage 211)
