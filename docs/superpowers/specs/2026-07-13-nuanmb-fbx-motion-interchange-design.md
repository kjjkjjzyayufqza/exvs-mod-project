# NUANMB ↔ CascadeurBridge Motion Interchange Design

## Status

Approved by direct user delegation on 2026-07-13. Revised after separating the
Blender model workflow from the Cascadeur animation workflow. `MotionClip` is
the project format. FBX is only a disposable Cascadeur transport file, not a
format the project binds its internal design to. The Rust backend owns every
conversion; the frontend may only invoke commands and render results.

## Goal

Provide a reusable, application-wide EXVS2 skeletal motion service.

```text
.nuanmb + .nusktb <-> MotionClip <-> CascadeurBridge <-> Cascadeur
                                      (animation-only FBX + manifest)
```

The service never produces or consumes Maya `.anim`. Models remain in Blender
and are outside this feature. The bridge gives Cascadeur only the matching
skeleton and an Action; it contains no model meshes, materials, or textures.

## Approaches

### A. MotionClip core with a Cascadeur bridge (chosen)

`MotionClip` is a Rust-only neutral model. NUANMB and `CascadeurBridge` are
adapters around it. The initial bridge carries an animated skeleton FBX plus a
manifest. ufbx evaluates the animation stack returned by Cascadeur.

This separates Blender models from Cascadeur actions, avoids Maya, uses the
existing fbxcel/ufbx dependencies, and keeps all game-format rules in Rust. A
future bridge format can be added without changing NUANMB code or consumers of
`MotionClip`.

FBX curves are baked to EXVS2's 60 FPS timeline on import. This is intentional:
DCC Euler order, constraints, and layered curves are evaluated before EXVS2
encoding.

### B. Direct NUANMB-to-FBX and FBX-to-NUANMB functions

Rejected. Two independent paths would duplicate skeleton matching, sampling,
transform validation, and reporting. Future adapters would be unsafe and
inconsistent.

### C. BVH bridge

Rejected. Cascadeur officially supports FBX, DAE, and USD, not BVH. BVH also
stores Euler rotation plus a root translation and cannot faithfully carry the
per-bone scale channels used by EXVS2 transform tracks. BVH would destroy valid
motion data before it reached Cascadeur.

### D. Direct Cascadeur Python control

Rejected for the core. Cascadeur's Python API exists but its documented coverage
is uneven and focuses on rigging. A desktop-to-Cascadeur RPC dependency would
make the converter version-sensitive. The bridge is deterministic file handoff
through Cascadeur's supported Animation import/export presets.

## Module Boundary

```text
src-tauri/src/ssbh_motion_interchange/
  mod.rs          # public service surface and shared errors
  motion_clip.rs  # format-neutral skeleton and sampled local transforms
  nuanmb.rs       # EXVS2 Anim v1.2 read/write adapter
  cascadeur.rs    # bridge manifest and FBX adapter delegation
  fbx.rs          # private FBX 7.4 reader/writer adapter
  validate.rs     # rig matching, finite-value checks, reports
```

`ssbh_motion.rs` remains the preview sampler. It exposes only the shared
local-transform sampling helper required by interchange and does not own output.
`ssbh_fbx.rs` gains narrowly scoped helpers for the existing binary FBX skeleton
representation; model/mesh export stays unchanged.

All other components use public `ssbh_motion_interchange` APIs rather than
parsing NUANMB or transport FBX directly.

## Canonical MotionClip

`MotionClip` stores evaluated local skeletal TRS values, not world matrices or
DCC-specific curves.

```rust
pub struct MotionClip {
    pub name: String,
    pub sample_rate_hz: u32,
    pub frames: Vec<MotionFrame>,
    pub skeleton: MotionSkeleton,
}

pub struct MotionSkeleton {
    pub bones: Vec<MotionBone>,
}

pub struct MotionBone {
    pub name: String,
    pub parent_index: Option<usize>,
    pub rest_local: Transform,
}

pub struct MotionFrame {
    pub local_transforms: Vec<Transform>,
}
```

Invariants:

- At least one frame; every frame has exactly one transform per bone.
- Values are finite; rotations are normalized quaternions.
- Bone names are nonempty and unique; parents are valid and acyclic.
- Coordinates are reference NUSKTB local space. Frontend display-endian and
  viewport-axis conventions never affect conversion.

## NUANMB Adapter

### Export: NUANMB to MotionClip

Inputs: `nuanmb_path`, `nusktb_path`, optional clip name.

1. Read `AnimData` and `SkelData` using `ssbh_data`.
2. Validate transform nodes against the reference skeleton.
3. Sample `0..=final_frame_index` at 60 FPS with EXVS2 `TransformFlags`:
   missing translation/rotation/scale channels use skeleton rest values.
4. Preserve local TRS only. HLPB constraints remain an external game asset and
   are not baked into the bridge.
5. Report non-skeletal groups (material, visibility, camera, lighting) that an
   Action bridge cannot represent.

### Import: MotionClip to NUANMB

1. Require a nonempty 60 Hz clip.
2. Generate Anim v1.2 `GroupType::Transform` tracks for all reference bones.
3. Set high-level `final_frame_index = frames.len() - 1`; `ssbh_data` writes the
   EXVS2 60 FPS header convention.
4. Encode through `AnimData::to_anim_uncompressed()`: explicit v1.2
   constant/raw streams preserve every sampled local channel. Residual
   compression is intentionally not used because real sparse EXVS2 rigs can
   fall back to a skeleton-rest channel after compressed re-encoding.
5. If `template_nuanmb_path` exists, replace only its transform group and copy
   every non-transform group. Without a template, create transform-only NUANMB
   and report it explicitly.

The encoder always writes a new output path and never overwrites an input.

## CascadeurBridge

`CascadeurBridge` is a small directory:

```text
<bridge-name>/
  motion.fbx       # animation-only transport imported by Cascadeur
  bridge.json      # schema, skeleton fingerprint, action name, 60 Hz metadata
```

`bridge.json` stores ordered bone names/parent indices, a rest-pose fingerprint,
sample rate, selected action name, and expected frame count. A returned FBX must
be supplied with this manifest. The backend rejects a different skeleton or
altered hierarchy before generating NUANMB.

The application never treats `motion.fbx` as a model asset. It only creates,
validates, and consumes it through `CascadeurBridge`.

## FBX Transport Adapter

### Export: MotionClip to FBX

Write binary FBX 7.4 with:

- `LimbNode` for every skeleton bone; parent order and source local rest
  transforms preserved.
- Stable `RotationOrder`, `Lcl Translation`, `Lcl Rotation`, and `Lcl Scaling`
  from the existing model FBX exporter.
- One `AnimationStack` and `AnimationLayer` named after `MotionClip.name`.
- Translation, rotation, and scale `AnimationCurveNode`s per bone; scalar keys
  at each 60 Hz frame.
- Euler curves derived from normalized local quaternions using the bone rotation
  order; nearest-angle unwrapping avoids 360° discontinuities.
- Standard FBX ticks (`46,186,158,000` per second) and linear key attributes.

The transport file includes no game meshes, textures, or private EXVS2
properties. It matches Cascadeur's Animation preset and avoids making the
Blender model a required export artifact.

### Import: FBX to MotionClip

Inputs: exported `fbx_path`, `bridge.json`, `reference_nusktb_path`, optional
`animation_stack_name`, and binding policy.

1. Load FBX through ufbx and select the requested `AnimStack`. Multiple stacks
   without an explicit name are rejected with the available names.
2. Compare with `bridge.json`, then match `LimbNode`s to NUSKTB names. Default
   `ExactHierarchy` requires every bone once with the same parent. `NameOnly` is
   only for controlled retargeting and reports every mismatch.
3. Evaluate selected stack at 60 Hz from start through end using
   `ufbx::evaluate_scene`; DCC Euler order, layers, and baked constraints are
   resolved before conversion.
4. Convert each evaluated local node transform to local SSBH TRS. Ignore and
   report unknown helpers; reject missing reference bones under `ExactHierarchy`.
5. Normalize quaternions with sign continuity (`dot(previous, current) >= 0`).
6. Construct validated `MotionClip`, then invoke the NUANMB adapter.

## Tauri API

Thin command wrappers only. Rust owns parsing, validation, conversion, and
filesystem writes inside `spawn_blocking`.

```rust
ssbh_export_nuanmb_to_cascadeur_bridge(request: NuanmbToCascadeurRequest) -> MotionConversionReport
ssbh_import_cascadeur_bridge_to_nuanmb(request: CascadeurToNuanmbRequest) -> MotionConversionReport
ssbh_inspect_cascadeur_bridge(request: CascadeurBridgeInspectRequest) -> CascadeurBridgeManifest
```

Requests contain paths, output destination, action/stack name, optional
template, and binding policy. Reports contain paths, frame count, duration,
matched/missing/ignored bones, preserved/dropped groups, and warnings. No binary
animation payload crosses Tauri IPC.

## Safety, Compatibility, and Performance

- Validate nonempty paths/extensions; output differs from all inputs.
- Cap clips at 3,600 frames (60 seconds at 60 FPS) before allocation. Typical
  EXVS2 motions fit; large files return a clear error instead of consuming
  hundreds of MB.
- Conversion runs off the UI thread. Frontend only shows state/results.
- Default exact hierarchy rejects a wrong rig rather than producing corrupt
  motion.
- Animation remains local bone space. Rest pose uses current proven FBX
  round-trip tolerance; root/world transforms cannot leak into child tracks.
- No byte-identity claim. Contract is semantic equivalence at 60 Hz samples.

## Tests and Acceptance Evidence

1. Unit tests: clip invariants, quaternion sign continuity, Euler unwrap, FBX
   ticks, exact/name-only binding.
2. Synthetic round trip: NUANMB -> bridge -> MotionClip retains bones, parents,
   frames, translations/scales, and quaternion angular tolerance.
3. Bridge output loads through ufbx, exposes one named stack, manifest matches,
   and evaluates expected transforms at frame 0/middle/end.
4. Generated v1.2 NUANMB parses with `AnimData`, has EXVS2 effective frame
   count, and contains all transform tracks.
5. Template preserves non-transform groups exactly while transform group changes.
6. With local Gyan real data: bridge round trip, compare all 60 Hz local TRS,
   then run existing motion smoke decoder.
7. Run focused Rust tests and debug `cargo build`; never a release build.

## User Workflow

1. Original `.nuanmb` + matching `.nusktb` -> export Cascadeur bridge.
2. In Cascadeur, import `motion.fbx` with **Animation** preset onto matching
   prepared skeleton; Blender model is not involved.
3. Edit motion. Export Cascadeur **Animation** preset as FBX with same skeleton
   and baked 60 FPS animation.
4. Exported FBX + original `bridge.json` + `.nusktb` -> new `.nuanmb`.
5. Optionally use original NUANMB as template to preserve non-skeletal groups.
6. Open result in existing preview/game workflow.
