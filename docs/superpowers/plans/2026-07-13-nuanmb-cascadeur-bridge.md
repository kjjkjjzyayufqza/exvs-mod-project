# NUANMB CascadeurBridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global Rust service that converts EXVS2 NUANMB motion to and from an animation-only Cascadeur bridge, while treating `MotionClip` as the canonical project representation.

**Architecture:** `ssbh_motion_interchange` owns validated local-TRS `MotionClip`, NUANMB v1.2 encoding, and the manifest-backed Cascadeur bridge. `ssbh_fbx` writes the bridge's standard FBX skeleton/action; `ufbx` evaluates an action exported by Cascadeur at 60 Hz. Tauri commands are thin blocking-task wrappers and send no animation buffers across IPC.

**Tech Stack:** Rust 2021, Tauri v2, `ssbh_data`, `ssbh_lib`, `ufbx`, `fbxcel`, `glam`, `serde`, `tempfile`.

---

## Target File Structure

| File | Responsibility |
|---|---|
| `src-tauri/src/ssbh_motion_interchange/mod.rs` | Public service, bridge request/report types, Tauri commands |
| `src-tauri/src/ssbh_motion_interchange/motion_clip.rs` | Canonical local-TRS skeleton/frames and invariants |
| `src-tauri/src/ssbh_motion_interchange/validate.rs` | Skeleton fingerprint, exact/name-only matching, value validation |
| `src-tauri/src/ssbh_motion_interchange/nuanmb.rs` | NUANMB ↔ MotionClip, template preservation |
| `src-tauri/src/ssbh_motion_interchange/cascadeur.rs` | `bridge.json` read/write, filesystem/path safety |
| `src-tauri/src/ssbh_motion_interchange/fbx.rs` | FBX stack selection/evaluation and bridge transport delegation |
| `src-tauri/src/ssbh_motion.rs` | Expose existing local EXVS2 sampler as `pub(crate)` only |
| `src-tauri/src/ssbh_fbx.rs` | Add animation-only skeleton/action FBX writer without changing model export |
| `src-tauri/Cargo.toml` | Add `sha2` for stable bridge skeleton fingerprints |
| `src-tauri/src/lib.rs` | Declare public module and register the three bridge commands |
| `src-tauri/tests/ssbh_motion_interchange_test.rs` | Cross-module synthetic conversion regression tests |

No frontend file changes belong in this plan.

### Task 1: Canonical MotionClip and Rig Validation

**Files:**

- Create: `src-tauri/src/ssbh_motion_interchange/motion_clip.rs`
- Create: `src-tauri/src/ssbh_motion_interchange/validate.rs`
- Create: `src-tauri/src/ssbh_motion_interchange/mod.rs`

- [ ] **Step 1: Write failing MotionClip validation tests**

```rust
#[test]
fn rejects_frame_with_wrong_bone_count() {
    let clip = test_clip(vec![MotionFrame { local_transforms: vec![] }]);
    assert!(matches!(clip.validate(), Err(MotionInterchangeError::InvalidClip(_))));
}

#[test]
fn exact_binding_rejects_changed_parent() {
    let reference = test_skeleton(&[("ROOT", None), ("HAND", Some(0))]);
    let candidate = test_skeleton(&[("ROOT", None), ("HAND", None)]);
    assert!(validate_rig_binding(&reference, &candidate, RigBindingPolicy::ExactHierarchy).is_err());
}
```

- [ ] **Step 2: Run the new integration target and verify compilation fails**

Run: `cargo test --test ssbh_motion_interchange_test rejects_frame_with_wrong_bone_count --no-fail-fast`

Expected: FAIL because `ssbh_motion_interchange` and `MotionClip` do not exist.

- [ ] **Step 3: Implement data types and validation**

```rust
pub const EXVS2_SAMPLE_RATE_HZ: u32 = 60;
pub const MAX_MOTION_FRAME_COUNT: usize = 3_600;

#[derive(Debug, Clone, PartialEq)]
pub struct MotionClip { pub name: String, pub sample_rate_hz: u32, pub skeleton: MotionSkeleton, pub frames: Vec<MotionFrame> }
#[derive(Debug, Clone, PartialEq)]
pub struct MotionSkeleton { pub bones: Vec<MotionBone> }
#[derive(Debug, Clone, PartialEq)]
pub struct MotionBone { pub name: String, pub parent_index: Option<usize>, pub rest_local: Transform }
#[derive(Debug, Clone, PartialEq)]
pub struct MotionFrame { pub local_transforms: Vec<Transform> }

impl MotionClip {
    pub fn validate(&self) -> Result<(), MotionInterchangeError> {
        validate_sample_rate(self.sample_rate_hz)?;
        validate_skeleton(&self.skeleton)?;
        if self.frames.is_empty() || self.frames.len() > MAX_MOTION_FRAME_COUNT {
            return Err(MotionInterchangeError::InvalidClip("frame count out of bounds".into()));
        }
        for frame in &self.frames {
            if frame.local_transforms.len() != self.skeleton.bones.len() {
                return Err(MotionInterchangeError::InvalidClip("frame bone count mismatch".into()));
            }
            validate_local_transforms(&frame.local_transforms)?;
        }
        Ok(())
    }
}
```

Implement `RigBindingPolicy::{ExactHierarchy, NameOnly}` and return a
`RigBindingReport` containing `matched_bones`, `ignored_nodes`, and warnings.
`ExactHierarchy` checks matching name, count, and matched-parent name; it does
not compare float rest transforms because Cascadeur can serialize them with
small FBX precision changes.

- [ ] **Step 4: Run validation tests**

Run: `cargo test --test ssbh_motion_interchange_test motion_clip --no-fail-fast`

Expected: PASS for valid clip, wrong frame count, duplicate name, invalid parent,
and exact/name-only hierarchy tests.

- [ ] **Step 5: Review only scoped changes**

Run: `git diff --check -- src-tauri/src/ssbh_motion_interchange`

Expected: no whitespace errors. Do not commit shared-worktree changes.

### Task 2: NUANMB ↔ MotionClip Adapter

**Files:**

- Modify: `src-tauri/src/ssbh_motion.rs`
- Create: `src-tauri/src/ssbh_motion_interchange/nuanmb.rs`
- Modify: `src-tauri/src/ssbh_motion_interchange/mod.rs`
- Test: `src-tauri/tests/ssbh_motion_interchange_test.rs`

- [ ] **Step 1: Write failing NUANMB round-trip tests**

```rust
#[test]
fn nuanmb_sampling_uses_rest_translation_for_sparse_transform_tracks() {
    let (skel_path, anim_path) = write_sparse_transform_fixture();
    let clip = read_nuanmb_as_motion_clip(&anim_path, &skel_path, "sparse").unwrap();
    assert_eq!(clip.frames[0].local_transforms[1].translation, Vec3::new(5.0, 0.0, 0.0));
}

#[test]
fn encoder_preserves_template_non_transform_groups() {
    let template = fixture_with_material_group();
    let output = write_motion_clip_as_nuanmb(&test_clip_with_two_frames(), Some(&template)).unwrap();
    assert!(output.groups.iter().any(|group| group.group_type == GroupType::Material));
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cargo test --test ssbh_motion_interchange_test nuanmb_ --no-fail-fast`

Expected: FAIL because neither adapter function exists.

- [ ] **Step 3: Expose the existing preview sampler at crate scope**

In `ssbh_motion.rs`, change only the visibility of the existing sampler:

```rust
pub(crate) fn sample_motion_frame_data(
    skel: &SkelData,
    anim: &AnimData,
    hlpb: Option<&HlpbData>,
    frame: f32,
) -> MotionFrameSample
```

Do not change preview semantics. The NUANMB adapter calls it with `None` for
HLPB so the bridge carries raw local transform tracks and leaves game HLPB
constraints external.

- [ ] **Step 4: Implement read and write adapters**

```rust
pub fn read_nuanmb_as_motion_clip(anim_path: &Path, skel_path: &Path, name: String) -> Result<MotionClip, MotionInterchangeError>;
pub fn write_motion_clip_as_nuanmb(
    clip: &MotionClip,
    template_path: Option<&Path>,
    output_path: &Path,
) -> Result<NuanmbWriteReport, MotionInterchangeError>;
```

`read_nuanmb_as_motion_clip` reads `AnimData` and `SkelData`, samples every
integer frame through `sample_motion_frame_data`, copies ordered skeleton rest
TRS, and validates the resulting clip. `write_motion_clip_as_nuanmb` creates a
single `GroupData { group_type: GroupType::Transform }`; every bone gets one
`TrackData { name: "Transform", values: TrackValues::Transform(...) }` with
default `TransformFlags` and `compensate_scale = false`. If a template exists,
replace all template transform groups with this one and clone every other group.
Encode using `to_anim_uncompressed()` then `write_to_file`. Explicit constant/raw
v1.2 streams preserve the complete sampled local TRS; do not opt into residual
compression for the bridge output.

- [ ] **Step 5: Run adapter tests**

Run: `cargo test --test ssbh_motion_interchange_test nuanmb_ --no-fail-fast`

Expected: PASS; written fixture parses as v1.2, has expected last frame, and
keeps the template material group.

### Task 3: Manifest-backed CascadeurBridge

**Files:**

- Create: `src-tauri/src/ssbh_motion_interchange/cascadeur.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/ssbh_motion_interchange/mod.rs`
- Test: `src-tauri/tests/ssbh_motion_interchange_test.rs`

- [ ] **Step 1: Write failing manifest tests**

```rust
#[test]
fn manifest_rejects_reference_skeleton_fingerprint_mismatch() {
    let manifest = CascadeurBridgeManifest::from_clip(&test_clip());
    let mismatched = test_skeleton(&[("ROOT", None), ("EXTRA", Some(0))]);
    assert!(manifest.validate_reference_skeleton(&mismatched).is_err());
}

#[test]
fn bridge_paths_reject_input_output_aliases() {
    assert!(validate_distinct_output(Path::new("a.fbx"), &[Path::new("a.fbx")]).is_err());
}
```

- [ ] **Step 2: Verify manifest tests fail**

Run: `cargo test --test ssbh_motion_interchange_test manifest_ --no-fail-fast`

Expected: FAIL because `CascadeurBridgeManifest` does not exist.

- [ ] **Step 3: Implement bridge files and integrity checks**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CascadeurBridgeManifest {
    pub schema_version: u32,
    pub action_name: String,
    pub sample_rate_hz: u32,
    pub expected_frame_count: usize,
    pub skeleton: Vec<BridgeBone>,
    pub rest_pose_fingerprint: String,
}

pub(crate) fn write_bridge_manifest(path: &Path, manifest: &CascadeurBridgeManifest) -> Result<(), MotionInterchangeError>;
pub(crate) fn read_bridge_manifest(path: &Path) -> Result<CascadeurBridgeManifest, MotionInterchangeError>;
```

Use deterministic JSON, ordered bones, lowercase SHA-256 of serialized names,
parents, and `rest_local` float bit patterns. Create the bridge directory only
after all input/output collision checks pass. Reject a non-60 Hz manifest and a
manifest whose frame count exceeds `MAX_MOTION_FRAME_COUNT`.

Add the direct dependency before importing it:

```toml
sha2 = "0.10"
```

- [ ] **Step 4: Run manifest tests**

Run: `cargo test --test ssbh_motion_interchange_test manifest_ --no-fail-fast`

Expected: PASS for JSON round trip, fingerprint mismatch, and path collision.

### Task 4: Write Animation-only FBX Transport

**Files:**

- Modify: `src-tauri/src/ssbh_fbx.rs`
- Create: `src-tauri/src/ssbh_motion_interchange/fbx.rs`
- Test: `src-tauri/tests/ssbh_motion_interchange_test.rs`

- [ ] **Step 1: Write failing FBX writer test**

```rust
#[test]
fn motion_fbx_contains_one_named_stack_and_evaluates_local_trs() {
    let clip = test_clip_with_two_frames();
    let root = tempfile::tempdir().unwrap();
    let bridge = write_cascadeur_bridge(root.path(), &clip).unwrap();
    let scene = ufbx::load_file(bridge.motion_fbx_path.to_str().unwrap(), ufbx::LoadOpts::default()).unwrap();
    assert_eq!(scene.anim_stacks.len(), 1);
    assert_eq!(scene.anim_stacks[0].element.name, clip.name);
}
```

- [ ] **Step 2: Verify the writer test fails**

Run: `cargo test --test ssbh_motion_interchange_test motion_fbx_contains --no-fail-fast`

Expected: FAIL because `write_motion_clip_fbx` does not exist.

- [ ] **Step 3: Add the narrowly scoped writer in `ssbh_fbx.rs`**

```rust
pub(crate) fn write_animation_only_fbx(
    output_path: &Path,
    clip: &crate::ssbh_motion_interchange::motion_clip::MotionClip,
) -> Result<()>;
```

Reuse existing `FbxUpAxis`, stable local-rest decomposition, `write_header`,
`write_bone`, and low-level array/property writer helpers. Add object IDs and
definitions for one `AnimationStack`, one `AnimationLayer`, three curve nodes
per bone, and three scalar curves per curve node. Write FBX linear key arrays:

```text
KeyTime          = frame_index * 46_186_158_000 / 60
KeyValueFloat    = local TRS component
KeyAttrFlags     = 24836 for linear keys
```

For rotations, derive Euler values with the exact per-bone rotation order used
for rest transform output, then unwrap each component by adding/subtracting 360
to minimize distance from prior frame. Connect curve → curve-node `d|X/Y/Z`,
curve-node → layer, layer → stack, and curve-node → bone `Lcl Translation`,
`Lcl Rotation`, or `Lcl Scaling`.

- [ ] **Step 4: Implement the adapter delegation**

```rust
pub(crate) fn write_motion_clip_fbx(path: &Path, clip: &MotionClip) -> Result<(), MotionInterchangeError> {
    clip.validate()?;
    crate::ssbh_fbx::write_animation_only_fbx(path, clip).map_err(MotionInterchangeError::fbx)
}
```

Expose the bridge-level, globally reusable function instead of exposing the
transport implementation:

```rust
pub fn write_cascadeur_bridge(output_dir: &Path, clip: &MotionClip) -> Result<CascadeurBridgePaths, MotionInterchangeError>;
```

- [ ] **Step 5: Run FBX writer tests**

Run: `cargo test --test ssbh_motion_interchange_test motion_fbx_ --no-fail-fast`

Expected: PASS; ufbx reads stack/action and evaluated frame 0/end local TRS
matches source clip within `1e-4` translation/scale and `1e-4` radians rotation.

### Task 5: Import Cascadeur FBX to MotionClip

**Files:**

- Modify: `src-tauri/src/ssbh_motion_interchange/fbx.rs`
- Test: `src-tauri/tests/ssbh_motion_interchange_test.rs`

- [ ] **Step 1: Write failing FBX evaluator tests**

```rust
#[test]
fn bridge_importer_requires_stack_name_when_fbx_has_multiple_stacks() {
    let fbx = write_fbx_with_two_stacks();
    let bridge = write_matching_manifest_for(&fbx, &test_skeleton());
    assert!(matches!(read_cascadeur_bridge(&fbx, &bridge, &test_skeleton(), None, RigBindingPolicy::ExactHierarchy),
        Err(MotionInterchangeError::AmbiguousAnimationStack { .. })));
}

#[test]
fn importer_keeps_quaternion_sign_continuous() {
    let fbx = write_rotation_wrap_fixture();
    let bridge = write_matching_manifest_for(&fbx, &test_skeleton());
    let clip = read_cascadeur_bridge(&fbx, &bridge, &test_skeleton(), Some("Walk"), RigBindingPolicy::ExactHierarchy).unwrap();
    assert!(clip.frames.windows(2).all(|pair| pair[0].local_transforms[0].rotation.dot(pair[1].local_transforms[0].rotation) >= 0.0));
}
```

- [ ] **Step 2: Verify evaluator tests fail**

Run: `cargo test --test ssbh_motion_interchange_test importer_ --no-fail-fast`

Expected: FAIL because `read_motion_clip_fbx` does not exist.

- [ ] **Step 3: Implement stack selection and 60 Hz evaluation**

```rust
pub(crate) fn read_motion_clip_fbx(
    fbx_path: &Path,
    reference: &MotionSkeleton,
    stack_name: Option<&str>,
    policy: RigBindingPolicy,
) -> Result<(MotionClip, RigBindingReport), MotionInterchangeError>;
```

The public global function supplies manifest validation before this private
transport function:

```rust
pub fn read_cascadeur_bridge(
    fbx_path: &Path,
    manifest_path: &Path,
    reference: &MotionSkeleton,
    stack_name: Option<&str>,
    policy: RigBindingPolicy,
) -> Result<(MotionClip, RigBindingReport), MotionInterchangeError>;
```

Load `ufbx::SceneRoot`, inspect `anim_stacks`, select exactly one stack, and
call `ufbx::evaluate_scene(&scene, &stack.anim, time, EvaluateOpts::default())`
for each `frame as f64 / 60.0`. Resolve `LimbNode` names from the evaluated
scene, use each node's evaluated `node_to_parent` transform, and convert it to
`Transform { scale, rotation, translation }`. Apply `RigBindingPolicy` before
sampling, ignore non-reference helper nodes, normalize every quaternion, and
flip sign when dot product with prior frame is negative.

- [ ] **Step 4: Run evaluator tests**

Run: `cargo test --test ssbh_motion_interchange_test importer_ --no-fail-fast`

Expected: PASS for named selection, ambiguity error, hierarchy validation, and
quaternion sign continuity.

### Task 6: Compose Service and Tauri Commands

**Files:**

- Modify: `src-tauri/src/ssbh_motion_interchange/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/tests/ssbh_motion_interchange_test.rs`

- [ ] **Step 1: Write failing service workflow test**

```rust
#[test]
fn bridge_export_then_import_writes_parseable_nuanmb() {
    let fixture = write_source_nuanmb_and_skeleton();
    let bridge = export_nuanmb_to_cascadeur_bridge(NuanmbToCascadeurRequest::fixture(&fixture)).unwrap();
    let result = import_cascadeur_bridge_to_nuanmb(CascadeurToNuanmbRequest::fixture(&bridge, &fixture)).unwrap();
    let parsed = AnimData::from_file(&result.output_path).unwrap();
    assert_eq!(parsed.major_version, 1);
    assert_eq!(parsed.minor_version, 2);
}
```

- [ ] **Step 2: Verify service test fails**

Run: `cargo test --test ssbh_motion_interchange_test bridge_export_then_import --no-fail-fast`

Expected: FAIL because public request types and service methods do not exist.

- [ ] **Step 3: Implement request, report, and commands**

```rust
#[tauri::command]
pub async fn ssbh_export_nuanmb_to_cascadeur_bridge(
    request: NuanmbToCascadeurRequest,
) -> Result<MotionConversionReport, String>;

#[tauri::command]
pub async fn ssbh_import_cascadeur_bridge_to_nuanmb(
    request: CascadeurToNuanmbRequest,
) -> Result<MotionConversionReport, String>;

#[tauri::command]
pub async fn ssbh_inspect_cascadeur_bridge(
    request: CascadeurBridgeInspectRequest,
) -> Result<CascadeurBridgeManifest, String>;
```

Each command validates paths before `tauri::async_runtime::spawn_blocking`, maps
only typed `MotionInterchangeError` to user-facing strings, then returns a
report containing output path, action name, duration, frame count, matched
bones, ignored nodes, preserved groups, and warnings. Add all three handlers to
`tauri::generate_handler!` and `pub mod ssbh_motion_interchange;` to `lib.rs`.

- [ ] **Step 4: Run service workflow tests**

Run: `cargo test --test ssbh_motion_interchange_test bridge_ --no-fail-fast`

Expected: PASS; bridge directory has only `motion.fbx`/`bridge.json`, output
NUANMB parses, and unsafe same-path requests fail before writes.

### Task 7: Regression Evidence and Build

**Files:**

- Modify: `docs/superpowers/specs/2026-07-13-nuanmb-fbx-motion-interchange-design.md` only if the implementation proves a design correction.

- [ ] **Step 1: Run all new tests**

Run: `cargo test --test ssbh_motion_interchange_test --no-fail-fast`

Expected: PASS.

- [ ] **Step 2: Run focused existing motion tests**

Run: `cargo test --test exvs2_json_cli_test --no-fail-fast`

Expected: PASS; existing CLI behavior remains intact.

- [ ] **Step 3: Build Rust backend in debug mode**

Run: `cargo build`

Expected: finished `dev` profile without errors. Do not use `--release`.

- [ ] **Step 4: Run optional real Gyan round trip only when both paths exist**

Run: `$env:SSBH_MOTION_REAL_NUANMB='<nuanmb>'; $env:SSBH_MOTION_REAL_NUSKTB='<nusktb>'; cargo test --test ssbh_motion_interchange_test real_gyan -- --ignored --nocapture`

Expected: skip when variables are absent; otherwise PASS after sampling every
frame and comparing local TRS within declared tolerance.

- [ ] **Step 5: Review handoff diff**

Run: `git diff --check; git diff --stat`

Expected: no whitespace errors; final response reports modified files and exact
verification results. Do not commit shared-worktree changes.
