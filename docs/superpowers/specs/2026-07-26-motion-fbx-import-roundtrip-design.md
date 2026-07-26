# MotionFbxImport + RoundTripMotion Toolchain Design

## Status

Drafted 2026-07-26 under a delegated autonomous goal ("design and build the
full EXVS2 motion conversion feature set for mod developers"). Decisions below
follow recommended defaults; every branch is recorded so the user can revise
any single row without re-opening the whole design.

Relationship to earlier documents:

- Extends `docs/superpowers/specs/2026-07-25-motion-fbx-export-blender-compose-design.md`.
  That spec's "no FBX→NUANMB import" boundary applied to the **export**
  surface only; this spec adds import as a separate product surface.
- Reuses the internal concepts of
  `docs/superpowers/specs/2026-07-13-nuanmb-fbx-motion-interchange-design.md`
  (MotionClip, NUANMB adapter, rig validation) while keeping CascadeurBridge
  (bridge.json) retired as a user product.
- Architecture ADR: `docs/adr/0002-motion-fbx-import-direct-ufbx.md`.
- Domain terms: root `CONTEXT.md`.

## Goal

Close the mod developer's motion loop:

```text
NUANMB + model  --MotionFbxExport-->  CompleteMotionFbx
                                          |
                                 edit in any DCC (Blender 5.1
                                 recommended; Cascadeur, Maya OK)
                                          |
edited FBX + NUSKTB + template NUANMB  --MotionFbxImport-->  new NUANMB
                                          |
                              auto-loaded into motion preview
                              (ImportPreview) for verification
```

Success criteria:

1. A default-settings Blender 5.1 open/export cycle of our own
   CompleteMotionFbx re-imports to a NUANMB whose 60 Hz local TRS matches the
   source clip within round-trip tolerance (translation/scale 2e-3, rotation
   angular tolerance as in existing round-trip tests).
2. Import requires no bridge.json and no Blender install.
3. Template preservation keeps every non-Transform group (visibility,
   material, camera) byte-equivalent from the template NUANMB.
4. All conversions are SampleRate60; clip length is the real FBX stack range
   (max 3,600 frames), never padded or truncated to a fixed count.
5. No test or feature ever mutates a source asset; outputs always go to new
   user-chosen paths, tests only under temp directories.

## Non-goals (this iteration)

- In-place replacement of a NUANMB inside a motion folder or fhm2d repack
  integration (roadmap: SafeReplace).
- Retargeting between different unit skeletons (roadmap: MotionRetarget).
- Editing non-Transform groups (visibility/material tracks) in-app.
- Pure-Rust merged mesh+animation FBX writer (unchanged from ADR 0001).
- Camera NUANMB import.

## Approaches considered

### A. Direct ufbx import, manifest-free (chosen)

Rust reads the modder's FBX with ufbx, validates bones directly against the
active model's NUSKTB, samples at 60 Hz, writes NUANMB through the existing
template-merge writer. No Blender dependency on import; fully testable
offline; reuses the proven `read_motion_clip_fbx` machinery with
generalizations for DCC-authored files.

### B. Blender headless "decompose" on import

Symmetric with BlenderCompose: run Blender to normalize the FBX first.
Rejected: adds a hard Blender dependency to import, doubles latency, makes
unit tests require Blender, and ufbx already handles DCC FBX quirks (units,
axes, helper nodes) deterministically.

### C. Manifest-carrying package (bridge.json revival)

Rejected: bridge.json is retired; the reference NUSKTB is always available
from the active model, making a fingerprint manifest redundant, and a manifest
file is exactly the mod-developer friction this toolchain removes.

## Decision table

| # | Topic | Choice | Term |
|---|-------|--------|------|
| 1 | Import engine | Direct ufbx in Rust; no Blender needed | DccFbxRead |
| 2 | Inputs | FBX + active model NUSKTB + optional template NUANMB | MotionFbxImport |
| 3 | Reference rig | Always the active model's NUSKTB; FBX extras ignored + reported | RigBind |
| 4 | Bone matching | Canonical names (strip `path\|` and `namespace:`), default ExactHierarchy, NameOnly opt-in | CanonicalBoneName |
| 5 | Space handling | ufbx normalize to Y-up right-handed, `target_unit_meters = 0.01` (matches writer's UnitScaleFactor 1.0); rebase each reference bone against its reference parent's world transform | DccSpaceNormalize |
| 6 | Time base | Sample stack range at 60 Hz; length = real range; cap 3,600 frames | SampleRate60 |
| 7 | Stack choice | Single stack auto-selected; multiple stacks require explicit name (UI lists them) | StackSelect |
| 8 | Template | Default = currently selected NUANMB; merge preserves non-Transform groups; no template → transform-only NUANMB + warning | TemplatePreserve |
| 9 | Output | Native save dialog; default `{fbx_stem}.nuanmb`; must differ from every input; never overwrite inputs | SaveAsNuanmb |
| 10 | Post-import | Written NUANMB auto-loaded and selected in motion preview | ImportPreview |
| 11 | UI entry | Motion panel, Import section under the Export section | MotionPanelImport |
| 12 | Encoding | `to_anim_uncompressed` v1.2 (existing writer; semantic safety over size) | — |
| 13 | Batch export | Frontend iterates the existing single-export command over selected clips with progress + per-item errors; no new Rust surface | BatchMotionExport |
| 14 | Clip utilities | Trim + retime as pure MotionClip ops with own command + small UI | ClipOps |

## Component architecture (split by responsibility)

Each unit has one purpose, a typed interface, and independent tests.

```text
Rust (src-tauri/src/ssbh_motion_interchange/)
  dcc_fbx.rs          DccFbxRead: load FBX (space-normalized), list stacks,
                      extract candidate skeleton (canonical names), sample
                      reference-hierarchy local TRS at 60 Hz
  motion_fbx_import.rs Import orchestrator: validate request paths → DccFbxRead
                      → RigBind → clip validate → TemplatePreserve write →
                      MotionFbxImportReport
  clip_ops.rs         ClipOps: trim(frame range), retime(factor) as pure
                      MotionClip → MotionClip functions + NUANMB-level command
  fbx.rs              Internal bridge-era reader stays for its round-trip
                      tests until dcc_fbx.rs subsumes it (then folded/removed)
  mod.rs              Commands: ssbh_import_motion_fbx,
                      ssbh_inspect_motion_fbx (stack/bone listing for UI),
                      ssbh_transform_nuanmb_clip (ClipOps)

Frontend (src/components/ssbh-model-preview/)
  motionFbxImportService.ts   Typed invoke wrappers + report types
  components/MotionFbxImportPanel.tsx  Import UI (pick FBX → inspect →
                              options → save-as → report → ImportPreview)
  components/MotionBatchExportPanel.tsx  BatchMotionExport UI over the
                              loaded motion folder clip list
  components/MotionClipOpsPanel.tsx      Trim/retime UI (small)
```

Data flow (import): frontend sends only paths and options over IPC; Rust owns
parsing, sampling, validation, and writes inside `spawn_blocking`. Reports
(bones matched/ignored, warnings, frame count, preserved group count) come
back as plain serializable structs; no binary payload crosses IPC.

## Import pipeline stages (each independently testable)

1. **RequestValidate** — non-empty paths; fbx/template/output extension
   checks; output differs from every input.
2. **FbxLoad (DccSpaceNormalize)** — ufbx `LoadOpts` with right-handed Y-up
   target axes, `target_unit_meters = 0.01`, space conversion at root.
   Errors surface the ufbx description verbatim.
3. **StackSelect** — 0 stacks → error; 1 → auto; >1 → require explicit name,
   error lists available names (UI pre-lists via `ssbh_inspect_motion_fbx`).
4. **RigBind** — candidate skeleton = FBX nodes with bone attributes,
   canonicalized names; duplicate canonical names → error naming offenders;
   `validate_rig_binding` against NUSKTB reference (ExactHierarchy default,
   parent chains compared on reference bones only, so DCC helper bones,
   `_end` leaf bones, IK chains and the Armature object are ignored and
   reported, never fatal).
5. **Sample60** — for each frame time `t = begin + i/60`: evaluate scene once,
   compute each reference bone's local TRS as
   `world(reference_parent)⁻¹ × world(bone)` (root bones rebase against scene
   world, folding the Armature object / axis-conversion / unit transforms and
   any object-level animation into the root bone track). Quaternion sign
   continuity enforced per bone.
6. **ClipValidate** — existing `MotionClip::validate` (finite, normalized,
   1..=3600 frames).
7. **TemplatePreserve write** — existing `write_motion_clip_as_nuanmb`
   (template merge; uncompressed v1.2; never overwrites inputs).
8. **Report** — output path, action name, frame count, duration, matched /
   ignored bones, preserved non-Transform group count, warnings (no template,
   NameOnly parent mismatches, ignored helper nodes).

## Failure modes (explicit)

| Case | Behavior |
|------|----------|
| FBX unreadable / not FBX | Error with ufbx description |
| No animation stack | Error: "FBX contains no animation stacks" |
| Multiple stacks, none chosen | Error listing stack names; UI offers picker |
| Reference bone missing in FBX | Hard reject naming the bone (ExactHierarchy and NameOnly both — missing bones are never silently rest-posed) |
| Parent mismatch | ExactHierarchy: reject; NameOnly: warning |
| Duplicate canonical bone names | Reject listing collisions |
| Range > 3,600 frames @60 Hz | Reject with actual count |
| Output equals any input | Reject |
| Template unreadable | Reject (no silent transform-only fallback) |
| Non-finite sampled values | Reject via ClipValidate |

Per global rule 7: no fallback logic anywhere — every illegal input errors.

## UI / UX (MotionPanelImport)

The Motion panel gains an "Motion FBX import" MayaSection directly under the
existing export section, completing a visible export → edit → import loop:

1. Primary action: "Import FBX as NUANMB" (disabled without an active model
   NUSKTB).
2. Click → open dialog (FBX filter, remembers last dir) → backend
   `ssbh_inspect_motion_fbx` returns stacks + bone summary → if multiple
   stacks, inline select appears.
3. Options row (collapsed by default): template toggle (default ON, template =
   currently selected NUANMB with its name shown; user may pick another
   .nuanmb), binding policy (Exact / NameOnly with one-line explanation).
4. Save dialog: default `{fbx_stem}.nuanmb`, remembers last dir.
5. Busy → success report card (frames, duration, matched/ignored counts,
   preserved groups, output path) or inline error with the exact backend
   message; toast mirrors the outcome.
6. On success, ImportPreview: the new NUANMB path is appended to the clip
   list and selected, so the existing sampling/compatibility banner and
   playback verify the result immediately.
7. The export section's "One-way only; no NUANMB import" copy is replaced by
   round-trip wording.

Visual language follows the existing Maya-style inspector (MayaSection,
compact 10px rows, lucide icons, sonner toasts); the design-taste-frontend
pass applies at implementation time within those constraints.

### BatchMotionExport UI

Section in the Motion panel visible when a motion folder is loaded: clip
multi-select (all by default), output directory picker, sequential run of the
existing export command with per-clip progress (`n / total`, current stem),
per-clip error collection, and a final summary (exported / failed). Blender
resolve failure aborts the batch immediately (same executable for every clip).

### ClipOps UI

Small "Clip tools" row: trim (start/end frame inputs prefilled 0..last) and
retime (factor input, 0.1–10) against the selected NUANMB, writing to a new
NUANMB via save dialog, then ImportPreview-style reload. Backed by
`ssbh_transform_nuanmb_clip`.

## Testing strategy (all IO in temp dirs)

- Unit (Rust, tempfile): request validation, canonical name rules, stack
  selection, sampled frame count math, rebase math with synthetic hierarchies
  (helper node above root with scale/rotation folds into root), ClipOps
  trim/retime invariants, template merge already covered.
- Synthetic round trip (no Blender): write animation-only FBX with the
  existing writer → import through the new manifest-free path → TRS equality
  within tolerance. Extra synthetic case: same FBX with an injected non-bone
  root node carrying rotation/scale to prove DccSpaceNormalize.
- Real-data round trip (env-gated `SSBH_MOTION_REAL_NUANMB` /
  `SSBH_MOTION_REAL_NUSKTB`, `#[ignore]`): source NUANMB → export staging
  writer → import → compare all 60 Hz local TRS; inputs copied to temp first,
  sources never written.
- Blender round trip (env-gated, `#[ignore]`, requires Blender 5.1): real
  NUANMB + model → CompleteMotionFbx → Blender headless open + default FBX
  re-export (simulating the modder) → MotionFbxImport → compare to source
  clip. This test is the ground truth for DccSpaceNormalize constants.
- Frontend (Vitest): import panel dialog/invoke payloads, multi-stack picker,
  template defaulting, report render, ImportPreview wiring; batch panel
  sequencing and error accumulation; clip-ops payloads.
- Nothing under `E:\XB\解包\...` or any unpacked workspace is ever written;
  debug fixtures are copied into `tempfile::tempdir()` when a test needs a
  mutable neighbor.

## Acceptance

1. Motion panel shows export + import + (with folder loaded) batch + clip
   tools; no bridge.json anywhere.
2. Synthetic and real-data round trips pass; Blender round trip passes on the
   dev machine with Blender 5.1.
3. Importing an FBX with helper objects, `_end` leaf bones, or namespaced
   bone names succeeds with those nodes listed as ignored.
4. Template import preserves non-Transform groups byte-equivalent; no
   template yields the explicit transform-only warning.
5. A failed import leaves no partial output file.
6. `cargo test` (motion tests), `vitest` (motion panels), and `tsc` are green.

## Iceberg roadmap (mod-developer motion needs beyond this iteration)

Priority-ordered; each is a future spec, listed here so the platform choices
above don't foreclose them:

1. **SafeReplace** — guarded in-place replacement of a clip inside a motion
   folder (backup + validate + swap), then fhm2d repack via the proven
   compression.js path.
2. **MotionRetarget** — NameOnly binding plus rest-pose delta compensation to
   move motions between units sharing bone conventions.
3. **MotionLibrary** — motion-key aware browser for motion packs (structure
   JSON `unk1` keys → human-readable action names), search, tagging, and
   cross-unit comparison.
4. **ClipOps v2** — reverse, loop-seam check, blend/crossfade between two
   clips, root-motion extraction/flattening.
5. **GhostCompare** — side-by-side / onion-skin preview of source vs imported
   clip to spot drift visually.
6. **TrackInspector** — read-only (later editable) view of non-Transform
   groups (visibility, material) with per-track timelines.
7. **CameraMotion** — camera NUANMB import/export once transform import is
   proven.
8. **HlpbAware** — surface helper-bone (nuhlpb) constraints in preview so
   modders see final in-game deformation, not just skeletal TRS.
