# Process Log - SceneEdit Nutexb Texture Pipeline

## Context

- User requested SceneEdit to apply `.nutexb` textures onto stage models.
- User required the implementation to directly follow TestEditor model design.
- User explicitly confirmed:
  - Full TestEditor-compatible texture pipeline.
  - Full slot support.
  - Shared cache strategy.
  - Eager decode behavior.
  - Reuse over rewrite.

## Initial Findings

- SceneEdit currently renders meshes with plain `meshStandardMaterial` and no texture decode pipeline.
- TestEditor already has:
  - Texture-path resolution from `bundle.textureResolve`.
  - Disk/memory decode branching.
  - Versioned cache (`nutexbPreviewCache`) with L1/L2 + inflight dedupe.
  - Progress reporting for unique texture decode.
- Current SceneEdit memory import backend builds bundles with `source_kind: "stage_memory"` and no `source_session_id`, which is incompatible with direct reuse of TestEditor memory decode path.

## Execution Plan

1. Make SceneEdit bundle metadata compatible with TestEditor texture source handling.
2. Reuse TestEditor material+texture resolution and decode utilities in SceneEdit viewport path.
3. Add decode progress UI in SceneEdit page/viewport.
4. Verify build/lint and runtime behavior.

