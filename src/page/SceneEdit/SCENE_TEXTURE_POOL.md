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
