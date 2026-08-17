# MotionFbxExport (BlenderCompose) Design

## Status

Accepted via grill-with-docs on 2026-07-25. User confirmed early decisions
explicitly (A on each asked branch), then directed remaining open branches to
use recommended defaults and record everything without further questions.

Domain terms: root `CONTEXT.md`. Architecture ADR:
`docs/adr/0001-motion-fbx-export-via-blender-compose.md`.

Supersedes product intent of:

- `docs/superpowers/specs/2026-07-13-unit-model-cascadeur-bridge-ui-design.md`
- CascadeurBridge portions of
  `docs/superpowers/plans/2026-07-13-nuanmb-cascadeur-bridge.md` and
  `docs/superpowers/plans/2026-07-13-unit-model-cascadeur-bridge-ui.md`

## Goal

Replace CascadeurBridge with a one-way **MotionFbxExport**:

```text
active preview model (GeometryOnlyModel) + selected NUANMB
  -> StagingFbxPair (internal)
  -> Blender 5.1 HeadlessComposeScript
  -> single CompleteMotionFbx (SaveAsCompleteFbx)
```

Success criteria:

1. One user-visible output file: CompleteMotionFbx
2. SampleRate60 (60 FPS); frame count = real clip length
3. Armature + skinned meshes + bound action
4. No bridge.json, no user-facing animation-only package, no FBX→NUANMB import

## Non-goals (v1)

- FBX or Cascadeur round-trip back to NUANMB
- Pure-Rust merged mesh+animation FBX writer
- Required texture / full material package
- Depending on EXVS2-Easy-Blender-Tools being installed
- Supporting Blender versions other than 5.1
- Fixed 60-frame clip length (pad/truncate)

## Decision table (all locked)

| Topic | Choice | Term |
|-------|--------|------|
| Product boundary | One-way export only | MotionFbxExport |
| Deliverable | Single FBX: model + motion | CompleteMotionFbx |
| Time base | 60 FPS; natural clip length | SampleRate60 |
| Compose engine | Blender 5.1 only | BlenderCompose |
| Model content | Armature + skinned meshes (+ action); textures optional/not required | GeometryOnlyModel |
| UI entry | Unit Model Editor Motion panel; one export action | MotionPanelExport |
| Output path | Native save dialog every time; cancel = no-op | SaveAsCompleteFbx |
| Default filename | `{nuanmb_stem}.fbx` | SaveAsCompleteFbx |
| Blender location | Auto-detect common 5.1 paths + settings override; hard fail if missing | Blender51Executable |
| Compose script | App-shipped self-contained headless Python | HeadlessComposeScript |
| Old bridge | Remove UI + public Tauri commands; no user bridge package | BridgeRemoval |
| Internals | Temp model-only + anim-only FBX for Blender inputs, then cleanup | StagingFbxPair |

## User flow

1. User has an active unit model preview and a selected NUANMB in Motion.
2. User clicks the single export control (replaces Bridge export/import UI).
3. Save dialog opens; suggested name is NUANMB stem + `.fbx`.
4. If cancelled → stop, no files left for the user.
5. App resolves Blender 5.1 (override if set, else auto-detect).
6. On failure → clear error (need Blender 5.1); no partial success.
7. App builds StagingFbxPair from current model + NUANMB/NUSKTB.
8. App runs HeadlessComposeScript with Blender 5.1 in background.
9. Script imports both staging FBXs, binds motion to model armature, sets
   scene FPS to 60, frame range to real clip length, exports one FBX to the
   chosen path with safe options (selected objects / no leaf bones /
   bake only the bound action).
10. Staging files cleaned up; UI shows success path + frame count / duration
    summary (same spirit as old conversion report, without bridge fields).

## Technical ownership (high level)

| Layer | Owns |
|-------|------|
| Frontend | Motion panel button, save dialog, busy/error, optional Blender path setting UI |
| Rust / Tauri | Blender 5.1 resolve, staging FBX generation, process spawn, path safety, report |
| Headless Python | Import, bind, SampleRate60 scene, single-file FBX export |
| Manual addon | Unrelated human workflow; not required for export |

Reuse existing writers where possible:

- Model half: existing unit/model FBX export path (textures off for this flow)
- Motion half: existing animation-only FBX writer (as staging only, not product)

Do **not** re-expose CascadeurBridge commands to the frontend.

## Headless script invariants

- Scene render/FPS: 60
- Action frame range: clip length at 60 Hz (not forced to 60 frames)
- One armature on export; motion armature deleted or never exported after bind
- No Blender-generated `_end` leaf bones
- Export object set: model armature + its meshes only
- No requirement to load EXVS2-Easy-Blender-Tools

## Failure modes (explicit)

| Case | Behavior |
|------|----------|
| No selected NUANMB or no active model | Export disabled / hard reject |
| Save dialog cancelled | No-op |
| Blender 5.1 not found / invalid override | Error; do not try other versions |
| Staging write fails | Error; no CompleteMotionFbx |
| Blender non-zero exit / missing output | Error with stderr/log snippet; cleanup staging |
| Output path equals a staging path | Reject |

## Acceptance

1. Motion panel has one export action; Bridge import/export UI is gone.
2. Successful run produces exactly one CompleteMotionFbx at the chosen path.
3. Re-import into Blender 5.1 shows one armature, meshes skinned to it, one
   action, 60 FPS, frame count matching source NUANMB sample length.
4. Missing Blender 5.1 fails with an actionable message.
5. Public CascadeurBridge Tauri commands are removed or no longer registered.
6. No `bridge.json` is written for the user.

## Out-of-scope follow-ups (not v1)

- FBX → NUANMB import product
- Texture-rich CompleteMotionFbx option
- Pure-Rust complete FBX writer
- Cascadeur-specific import validation

## Implementation note

This document is the product/design source of truth for the replacement.
Implementation should use the project TDD and verification rules; no code
changes are implied by this grill session alone.
