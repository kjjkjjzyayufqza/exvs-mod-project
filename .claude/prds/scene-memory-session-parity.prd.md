# Scene Editor — In-Memory Session Parity (Unsaved SSBH Models as First-Class)

## Problem
After importing a DAE and converting it to SSBH, the new model lives **only in the in-memory scene session** until "Save changes" writes it to disk. The editor is inconsistent about whether it reads from memory or from disk, and model-derived entities (HKT collision, placement instances, cloned placements) are not lifecycle-linked to the model. As a result, core editing operations behave incorrectly on unsaved models: Properties loses data, the viewport shows black/untextured meshes, and deleting a model leaves orphaned collision/placements while the on-disk commit silently no-ops. The cost of leaving this unsolved is that users cannot trust the editor before saving — they must save to disk just to inspect, texture, or cleanly remove a model, which corrupts the intended "edit in memory, commit on Save" workflow.

The desired mental model is Unreal Engine 5: the stage is a **World/Level**, models are **Assets**, placements are **Actor instances**, and the in-memory session is a set of **unsaved (dirty) packages**. Every editor surface should treat an unsaved imported model identically to a disk-loaded one; disk is read/written **only** on Save changes (the "Save All" commit).

## Evidence
- Observed (reporter, direct use): Right-click → Properties on a freshly imported SSBH appears to lose data because the panel reads the actual disk file, which does not exist yet for a memory-only model.
- Observed: An imported DAE with fully-configured numatb still renders with **black textures** in the viewport; textures only appear after pressing "Save changes", which writes to disk and triggers an asset reload.
- Observed: Right-click → Delete → confirm removes the SSBH from the viewport, **but its HKT collision remains**, and placements (possibly including cloned placements) appear to remain.
- Observed: After a delete, pressing "Save changes" raises a **second** delete-confirm dialog; confirming it results in **no effect** — the on-disk files are still present.

## Users
- **Primary**: The EXVS stage author using this desktop Scene Editor to import meshes (DAE→SSBH), texture them, place/clone them, attach collision, and save a stage folder. They expect Unreal/Unity-style "author in memory, commit on save" behavior.
- **Not for**: End players / runtime consumers of the stage; non-SSBH asset workflows (effects, raw placement-only edits without imported models) except where they share the same delete/save lifecycle.

## Hypothesis
We believe making **the in-memory scene session a fully self-consistent, first-class representation of imported SSBH models and their derived entities (collision, placements, clones)** will **eliminate the memory-vs-disk inconsistencies (lost Properties data, black textures, orphaned-on-delete, no-op disk commit)** for **EXVS stage authors**.
We'll know we're right when **every model operation (inspect, texture, transform, delete) produces the same result before and after Save, disk is untouched until Save, and Save deterministically commits the exact in-memory state**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Properties data completeness on unsaved model | 100% of fields populated (numdlb/numatb/numshb/skeleton/textures), edits retained | Manual/QA: open Properties on a just-imported model, verify all tabs render data and edits persist without saving |
| Viewport texture parity (pre-save vs post-reload) | Visually identical; 0 black/untextured imported models when numatb is valid | Screenshot comparison of imported model before Save vs after Save+reload |
| Delete cascade completeness | 0 orphaned collision / placement / cloned-placement entries remaining in memory after a model delete | Inspect in-memory scene state immediately after delete |
| Confirm-dialog count per delete | Exactly 1 (at delete time); 0 additional prompts at Save | Observe delete + Save flow |
| Disk parity after Save | Disk contents exactly match committed in-memory state (deleted files removed, kept files present) | Folder listing diff before/after Save |
| Pre-save disk immutability | 0 disk writes or deletions occur before "Save changes" | File-system audit during an edit/delete session |

## Scope
**MVP** — Bring unsaved imported SSBH models to parity with disk-loaded models across the three observed failure surfaces, under one coherent in-memory lifecycle:
1. **Properties parity** — Opening Properties on an unsaved imported model shows complete, editable data with no loss, sourced from the in-memory session rather than a non-existent disk file.
2. **Texture rendering parity** — An imported model renders with its numatb-defined textures in the viewport immediately after import, without requiring a Save/reload, matching the post-save appearance.
3. **Unified delete & commit lifecycle** — Deleting a model (whether unsaved-in-memory or already saved) is a single in-memory operation that cascades to its collision, its placements, and any cloned placements; it asks for confirmation once; it touches disk only at Save; Save commits the deletion deterministically (one confirm already given, no second prompt) and the disk reflects the result.

**Affected surfaces (in scope for parity/lifecycle, identified during grounding)**
- Right-click **Properties / detail view** (model, material, skeleton, mesh, helper, textures tabs).
- **Viewport rendering** of imported models (texture/material resolution).
- **Delete** action across its branches (imported-in-memory model vs saved sub-model) — unify behavior.
- **HKT collision** overlay + backend collision data — lifecycle-linked to its model.
- **Placement instances and cloned placements** — lifecycle-linked to their model.
- **"Save changes" commit pipeline** and the unsaved/dirty-state tracking that drives it.

**Out of scope**
- Import configuration UI (DAE→SSBH options, scale, up-axis) — unchanged; parity work consumes whatever the import produces.
- HKT generation / collision simplification algorithms — unchanged; only the collision entity's *lifecycle and rendering parity* are in scope.
- The numatb material editor's editing capabilities themselves — unchanged; only its data-sourcing for unsaved models.
- New non-SSBH asset types (effects) beyond the shared delete/save lifecycle.
- Undo/redo semantics for the new cascade — desired but flagged as an open question, not committed for MVP.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | In-memory Properties parity | Properties/detail view on an unsaved imported model shows and edits full data with no loss | in-progress | inline (this branch) |
| 2 | In-memory texture rendering parity | Imported model displays correct numatb textures in the viewport without a Save/reload | in-progress | inline (this branch) |
| 3 | Unified delete + commit lifecycle | Model delete cascades to collision + placements + clones in memory with one confirm; Save commits to disk with no second prompt and no pre-save disk mutation | complete | inline (this branch) |

### Milestone 3 — implementation notes
- **Collision cascade**: `removeHavokOverlayForFolders` tears down the in-memory HKT overlay (`havokMeshDataMap` / `havokMetaMap` + backend `havok_data`) for deleted sub-models (Branch 2) and the base model (Branch 3), mirroring the imported-DAE path (Branch 1). Keyed via `resolveHavokFolderName` (`mesh-hkt-<folder>` / `<folder>/map_hit.hkt`). Covered by `havokOverlayCleanup.test.ts`.
- **Placements + clones**: Branch 2 already removes every placement row whose `objectNumber` matches the deleted model's `objectIndex` — clones share that object number, so they are removed by the same rule (resolves the clone-identity open question).
- **No-op root cause (open question #4, resolved)**: a DAE imported and converted to SSBH stays in the backend session's `pending_imports`; `collect_save_artifacts` re-emits it under `<base>/0/...` on every save, so a folder deleted on disk in save Phase 1 (`executeDelete`) is re-materialized by save Phase 7 (`scene_save_as_folder`). Fix: `SceneMemorySession::forget_model` / `forget_base_model` (Tauri `scene_forget_model` / `scene_forget_base_model`) drop the lingering import (and any base-bundle files) at delete time — memory-only, disk untouched until save. Covered by Rust `forget_*` tests.
- **Single confirm**: the save pipeline's `onDeleteConfirm` is auto-approved (`autoApproveSaveDelete`); the delete-time dialog (with disk-file preview) is the single delete confirmation, and the save-change summary remains the general save gate.

### Milestones 1–2 — implementation notes
- **In-memory SSBH preview bundle**: `scene_build_import_preview_bundle` builds an `SsbhModelPreviewBundle` from `SceneMemorySession` SSBH artifacts after DAE conversion, without writing those artifacts to disk.
- **Properties data source**: imported DAE outliner nodes now resolve their attached in-memory SSBH bundle. Detail-view model/material tabs load from bundle JSON for `sourceKind === "memory"` instead of reading a non-existent disk path.
- **Material profile parity**: memory import preview bundles preserve separate Maya/Nust material profile JSON (`matlProfiles`) when both artifacts exist; the detail view uses those profile payloads before falling back to the merged material payload.
- **Viewport render source**: imported objects with an attached SSBH bundle render through the same `StageModelGroup` path as disk-loaded SSBH models; unconverted imports keep the DAE scene fallback.
- **Texture resolution**: numatb texture refs for in-memory imports are resolved against absolute paths, the source DAE folder, `stageRoot`, and `stageRoot/textures`; texture decoding is per-path, so disk-resolved nutexb paths do not require an FHM2D memory-session texture lookup.
- **Verification so far**: targeted Vitest, Rust `scene_memory_session` tests, new texture-ref resolution and real-DAE memory preview bundle tests, `cargo check`, and `npm run build` pass. Local `backpack_up.dae` converts into a memory preview bundle with populated modl/mesh/matl JSON, separate Maya/Nust profile JSON, and `memory://` virtual paths. Hook-level tests prove imported memory bundles populate model/material Properties from bundle JSON without disk `.numdlb/.numatb` reads, and that disk-resolved `.nutexb` paths from memory import bundles use disk texture IPC (`nutexb_preview_file_identity` / `nutexb_rgba_bytes`) rather than FHM2D memory texture IPC. A Rust temp-directory test verifies preview bundle construction resolves a disk `.nutexb` while leaving source/stage file lists unchanged, proving no SSBH files are materialized before Save in that path. Status remains `in-progress` until manual QA with real DAE + valid numatb/nutexb confirms pre-save vs post-save visual/property parity; this machine currently has the Zabanya DAE files but no `.nutexb` files under `D:\output\exvs2`, and the configured stage root path is missing.

## Open Questions
- [x] Do cloned placements share the origin model's object index/identity, or are they independent instances? — **Resolved**: clones share the origin model's `objectNumber`, so deleting the model removes all rows with that object number (clones included) via the existing Branch 2 placement-removal rule.
- [ ] For full parity, should an unsaved model also be openable in the collision editor and DAE export before Save, or is parity limited to Properties + viewport + delete for MVP? — needs reporter decision.
- [ ] Should deleting a model be undoable, and if so must undo restore the model **and** its collision + placements + clones? — desired; confirm for MVP vs later.
- [x] What is the precise cause of the "Save changes does nothing / files remain" no-op deletion, and is it the same defect as the duplicate confirm dialog? — **Resolved**: converted imports linger in `pending_imports` and are re-emitted by `collect_save_artifacts`, so save Phase 7 (`scene_save_as_folder`) re-writes the folder that save Phase 1 (`executeDelete`) just removed. It is a *separate* defect from the duplicate confirm dialog; both are now fixed (forget-at-delete + auto-approved save delete gate).
- [ ] Should there be an explicit UE5-style "unsaved/dirty" indicator per model and a "discard changes" path, or is the existing dirty tracking sufficient? — scope clarification.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Texture parity requires resolving nutexb/material from numatb fully in-memory, which may be heavy or duplicate the disk-load path | Medium | Medium | Reuse the existing SSBH bundle/material resolution so memory and disk render through one code path; avoid a second renderer |
| Two divergent delete paths (memory import vs saved sub-model) cause regressions when unified | High | High | Converge on a single staged-in-memory lifecycle; cover both entry points with tests before refactor |
| Changing the save/commit lifecycle risks data loss or accidental disk deletion | Medium | High | Enforce the invariant "no disk mutation before Save"; test-first; validate disk state after Save against in-memory state |
| "First-class in-memory model" expands into a large refactor touching many surfaces | High | Medium | Bound MVP to the three observed surfaces; defer collision-editor/export parity and undo to open questions |
| Cascade rule for clones is wrong (deletes too much or too little) | Medium | Medium | Resolve the clone-identity open question before implementing the cascade; add explicit tests for clone deletion |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
