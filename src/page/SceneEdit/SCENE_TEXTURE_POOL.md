# Scene Editor — GPU Texture Sharing Pool

## Problem

When loading a complete stage map in the Scene Editor, GPU memory (WebView2 GPU process)
consumed ~10 GB at rest and spiked to ~20 GB on camera movement, causing the system to
freeze and Tauri v2 to trigger OOM crashes.

### Root Cause

Every `TexturedMesh` component independently created its own `THREE.DataTexture` objects
via `createDataTexture()`. Even though the CPU-side RGBA data was shared (same reference
from `nutexbPreviewCache`), each mesh uploaded a **separate copy** to VRAM.

A typical stage has 20 sub-models × 10 placement entries × 3 draw calls × 4 texture
slots (map, normal, roughness, metalness) at 2048×2048 RGBA8 = 16 MB each:

| Layer                        | Before (no sharing) | After (pooled)  |
|------------------------------|---------------------|-----------------|
| Unique GPU textures          | 20×10×3×4 = 2400    | 20×3×4 = 240    |
| VRAM for textures            | 2400 × 16 MB ≈ 38 GB (theoretical, ~10 GB observed due to partial slot fill) | 240 × 16 MB ≈ 3.8 GB (theoretical, ~1–1.5 GB observed) |
| Camera-move spike (2× peak)  | ~20 GB              | eliminated      |

The camera-movement spike happened because React re-renders created **new** DataTexture
objects before the old ones were disposed in `useEffect` cleanup — doubling VRAM
momentarily.

## Solution: `SceneTexturePool`

A single `SceneTexturePool` instance is created per `MapViewport` mount and passed
through the component tree:

```
MapViewport (owns pool)
  └─ StageModelGroup (receives pool)
       └─ TexturedMesh (acquires textures from pool)
```

### Pool key

Each GPU texture is keyed by its **texture file path + PBR slot + sampling parameters**:

```
<path_lowercase> | <slot> | <wrapS> | <wrapT> | <scale_u> | <scale_v> | <translate_u> | <translate_v> | <rotation>
```

All placements of the same sub-model share identical material bindings and UV transforms,
so they produce the same key and share the same `THREE.DataTexture` on the GPU.

Different sub-models that reference the same texture file but with different UV transforms
correctly get separate pool entries.

### Lifecycle

- **Acquire**: `texturePool.acquire(key, factory)` — returns cached texture or creates
  one via factory.
- **Dispose**: `texturePool.disposeAll()` — called once when `MapViewport` unmounts (or
  when the user triggers "Clear Cache"). No per-component disposal needed.
- Individual `TexturedMesh` components **no longer** call `texture.dispose()`. The pool
  owns all GPU textures for the lifetime of the scene.

### Why per-component disposal was removed

Previously each `TexturedMesh` disposed its textures in a `useEffect` cleanup:

```tsx
useEffect(() => {
  return () => {
    for (const tex of Object.values(textures)) {
      tex.dispose();
    }
  };
}, [textures]);
```

With pooling, multiple components reference the **same** `THREE.DataTexture`. If one
component unmounts and disposes the shared texture, other components referencing it would
render with a destroyed GPU texture (black/missing). Centralised pool disposal avoids
this.

### Why camera movement no longer spikes memory

Before: `dataKey` change → new `useMemo` run → new DataTexture objects uploaded to GPU →
old textures freed in cleanup → transient 2× VRAM.

After: `dataKey` change → `useMemo` re-runs → `pool.acquire()` returns **existing** GPU
texture (no upload, no allocation) → no VRAM spike.

## Files Changed

| File | Change |
|------|--------|
| `utils/SceneTexturePool.ts` | New shared GPU texture pool class |
| `components/MapViewport.tsx` | Pool creation, prop threading, pooled texture acquisition, disposal removal |
| `components/TextureQualityPanel.tsx` | Texture quality preset UI (Draft / Standard / High / Original) |
| `hooks/useSceneTextureLoader.ts` | `maxDimension` parameterised (was hardcoded 2048), resolution-tagged cache keys |
| `page.tsx` | `textureQuality` state, new "Texture" tab, auto-reload on quality change |

---

## Texture Quality Presets

Users can switch texture resolution at runtime via the **Texture** tab in the right-side
panel. Changing a preset clears the RGBA CPU cache and re-decodes all textures from the
backend at the new resolution. The existing `SceneViewportOverlay` progress bar shows
decode progress.

| Preset    | `maxDimension` | Per-texture VRAM (2048 original) | Use case |
|-----------|----------------|----------------------------------|----------|
| Draft     | 512            | ~1 MB                            | Fast layout preview |
| Standard  | 1024           | ~4 MB                            | Daily editing |
| High      | 2048           | ~16 MB                           | Detail inspection (default) |
| Original  | `null`         | Depends on source                | Full native resolution |

### Cache key differentiation

The RGBA LRU cache key (versionId) now includes a `@{maxDimension}` suffix, so entries
decoded at different resolutions are cached independently. Switching back to a
previously-used resolution may partially hit the cache (if entries haven't been evicted
by the 256 MB byte limit).

### Pool key includes data dimensions

`buildTexturePoolKey()` encodes `{width}x{height}` so that when the same texture file is
re-decoded at a different resolution, the pool creates a new GPU texture rather than
returning the stale one.

## Shared Texture Folder Resolution (PBR Fix)

### Problem

Stage maps have a top-level `textures` folder that holds shared PBR textures (normal maps,
roughness, metalness, emissive, AO). Individual sub-model folders typically only contain
their albedo (base color) textures locally.

When building model bundles from memory (fhm2d), `build_model_bundle_from_virtual_folder`
only searched for nutexb files within each sub-model's own virtual folder tree. Texture
references pointing to shared textures (e.g. `../../textures/some_normal.nutexb`) failed to
resolve, leaving `textureResolve` entries with `nutexb_path: None`.

Result: normal maps, roughness maps, metalness maps, and other PBR textures were completely
missing in SceneEdit's 3D viewport, while TestEditor's per-model preview worked correctly
(its disk-based `resolve_nutexb_path` walks ancestor directories and finds shared textures).

### Fix

`build_stage_bundle_from_memory` now:

1. Collects nutexb entries from the stage-level `textures` folder before iterating sub-models
2. Passes these shared entries (`shared_nutexb_entries`) to `build_model_bundle_from_virtual_folder`
3. When a texture reference isn't found in the sub-model's local folder, the resolver falls
   back to the shared entries

| File | Change |
|------|--------|
| `src-tauri/src/format/fhm2d_stage.rs` | Collect shared nutexb entries from `textures` folder; pass to bundle builder; fallback lookup |

## Future Improvements

1. **GPU-compressed textures (BC7/BC1)**: nutexb files are already GPU-compressed.
   Currently decoded to RGBA8 in Rust before upload. Direct BC7 upload via
   `renderer.extensions.get('WEBGL_compressed_texture_s3tc')` would reduce per-texture
   VRAM from 16 MB to ~5.3 MB (67% reduction on top of pooling).

2. **InstancedMesh**: Placements of the same sub-model share identical geometry. Using
   `THREE.InstancedMesh` would reduce draw calls from N (one per placement) to 1 per
   unique sub-model.

3. **Virtual texturing / mip streaming**: Load only visible mip levels. Requires
   significant infrastructure but enables full-resolution textures for arbitrarily
   large scenes.

4. **wgpu migration**: Moving 3D rendering to Rust-side wgpu would combine all three
   improvements natively, with direct VRAM management and zero WebView2 IPC overhead.
