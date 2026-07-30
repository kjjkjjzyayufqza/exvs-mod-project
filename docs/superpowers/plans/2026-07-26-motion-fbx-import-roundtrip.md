# MotionFbxImport + RoundTripMotion Implementation Plan

> **STATUS: SHIPPED.** Delivered via commits 427e2ed (manifest-free
> MotionFbxImport with world-rebase sampling), b54d867 (MotionJson compose +
> declared-axes import closing the Blender round trip), 9701406 (ClipOps trim
> and retime with NUANMB command), 86a9374 (MotionFbxImport panel with
> ImportPreview), 3746643 (batch CompleteMotionFbx export and clip
> trim/retime tools), 31c7f35 (panel design unification). Individual task
> checkboxes below are intentionally left as written; this banner is the
> completion record. Env-gated real-data/Blender tests live in
> `src-tauri/tests/ssbh_motion_fbx_import_test.rs` (`#[ignore]`, run green
> per b54d867).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the mod developer motion loop: manifest-free FBX→NUANMB import (DCC-tolerant), ImportPreview, batch CompleteMotionFbx export, and trim/retime clip operations.

**Architecture:** Rust owns all conversion: a new `dcc_fbx.rs` reader loads any DCC FBX via ufbx with space normalization (Y-up, `target_unit_meters = 0.01`) and rebases every reference-NUSKTB bone against its reference parent's world transform, then the existing `write_motion_clip_as_nuanmb` template-merge writer emits the NUANMB. Frontend adds Import/Batch/ClipOps sections to the existing Motion panel; batch iterates the existing single-export command.

**Tech Stack:** Rust (Tauri v2, ufbx 0.10, ssbh_data, glam, tempfile), React/TypeScript (Vitest, @tauri-apps/plugin-dialog, sonner), Blender 5.1 headless (integration test only).

**Spec:** `docs/superpowers/specs/2026-07-26-motion-fbx-import-roundtrip-design.md`
**ADR:** `docs/adr/0002-motion-fbx-import-direct-ufbx.md`
**Glossary:** `CONTEXT.md`

## Global Constraints

- SampleRate60 everywhere; clip length = real FBX stack range; `MAX_MOTION_FRAME_COUNT = 3_600` cap; never pad/truncate.
- Import needs no Blender and no bridge.json. Export keeps Blender 5.1 (ADR 0001).
- Missing reference bones are always fatal (both policies). No fallback logic anywhere — illegal input errors (global rule 7).
- Outputs must differ from every input path; inputs are never overwritten; failed import leaves no partial output.
- All tests write only under `tempfile::tempdir()` / Vitest mocks. Real-data tests are `#[ignore]` + env-gated (`SSBH_MOTION_REAL_NUANMB`, `SSBH_MOTION_REAL_NUSKTB`, `SSBH_MOTION_REAL_NUMDLB`); they copy sources to temp before any neighboring write and never write to unpacked game folders.
- English code/comments only. UI copy in English matching the existing Motion panel.
- Debug builds only: `cargo test` / `cargo build` without `--release`. Never start a dev server.
- Do not touch unrelated dirty hunks in `SsbhModelPreviewContext.tsx` / lighting-preset files; additive edits only where a task says so.
- TDD: every task writes its failing test first.
- Frontend work consults the `design-taste-frontend` skill but stays within the existing MayaSection inspector language (compact rows, lucide icons, sonner toasts).

## File Structure

| File | Responsibility |
|------|----------------|
| Create `src-tauri/src/ssbh_motion_interchange/dcc_fbx.rs` | DccFbxRead: canonical names, space-normalized load, inspect, candidate skeleton, world-rebase sampling |
| Create `src-tauri/src/ssbh_motion_interchange/motion_fbx_import.rs` | Import orchestrator: request validation → read → rig bind → template write → report |
| Create `src-tauri/src/ssbh_motion_interchange/clip_ops.rs` | Pure trim/retime MotionClip ops + NUANMB-level orchestration |
| Modify `src-tauri/src/ssbh_motion_interchange/mod.rs` | Module decls, re-exports, 3 new Tauri commands |
| Modify `src-tauri/src/lib.rs` | Register `ssbh_inspect_motion_fbx`, `ssbh_import_motion_fbx`, `ssbh_transform_nuanmb_clip` |
| Create `src-tauri/tests/ssbh_motion_fbx_import_test.rs` | Integration tests (validation, synthetic round trip, real-data + Blender gated) |
| Create `src-tauri/scripts/motion_fbx_roundtrip_blender.py` | Test-only Blender open+re-export (simulated modder edit) |
| Create `src/components/ssbh-model-preview/motionFbxImportService.ts` | Typed invoke wrappers for inspect/import/clip-ops |
| Create `src/components/ssbh-model-preview/components/MotionFbxImportPanel.tsx` + `.test.tsx` | Import UI |
| Create `src/components/ssbh-model-preview/components/MotionBatchExportPanel.tsx` + `.test.tsx` | BatchMotionExport UI |
| Create `src/components/ssbh-model-preview/components/MotionClipOpsPanel.tsx` + `.test.tsx` | Trim/retime UI |
| Modify `src/components/ssbh-model-preview/SsbhModelPreviewMotionPanel.tsx` | Mount the three new panels |
| Modify `src/components/ssbh-model-preview/SsbhModelPreviewContext.tsx` | Additive: `loadMotionNuanmbPath(path)` for ImportPreview |
| Modify `src/components/ssbh-model-preview/components/MotionFbxExportPanel.tsx` | Copy change: round-trip wording |
| Modify `src/utils/dialogLastPath.ts` | New keys: `ssbhMotionFbxImportOpen`, `ssbhMotionFbxImportSave`, `ssbhMotionBatchExportDir`, `ssbhMotionClipOpsSave` |

---

### Task 1: DccFbxRead — canonical names, normalized load, inspect

**Files:**
- Create: `src-tauri/src/ssbh_motion_interchange/dcc_fbx.rs`
- Modify: `src-tauri/src/ssbh_motion_interchange/mod.rs` (add `mod dcc_fbx;` + re-exports)
- Test: in-module `#[cfg(test)]` + `src-tauri/tests/ssbh_motion_fbx_import_test.rs`

**Interfaces:**
- Consumes: `MotionInterchangeError`, `MotionSkeleton`, `MotionBone`, `EXVS2_SAMPLE_RATE_HZ`, `MAX_MOTION_FRAME_COUNT` from `super`; `write_cascadeur_bridge` (test fixture producer).
- Produces (used by Tasks 2–3):
  - `pub(crate) fn canonical_bone_name(raw: &str) -> &str`
  - `pub(crate) fn load_dcc_fbx(path: &Path) -> Result<ufbx::SceneRoot, MotionInterchangeError>`
  - `pub(crate) fn candidate_skeleton_canonical(scene: &ufbx::Scene) -> Result<MotionSkeleton, MotionInterchangeError>`
  - `pub fn inspect_motion_fbx_file(path: &Path) -> Result<MotionFbxInspectReport, MotionInterchangeError>`
  - `pub struct MotionFbxInspectReport { pub stacks: Vec<MotionFbxStackSummary>, pub bone_count: usize, pub bone_names: Vec<String> }` (serde camelCase, Serialize)
  - `pub struct MotionFbxStackSummary { pub name: String, pub frame_count: usize, pub duration_seconds: f32 }` (serde camelCase, Serialize)

- [ ] **Step 1: Write failing in-module unit tests** at the bottom of the new `dcc_fbx.rs` (create the file with only the test module and `use super::*;` so it compiles red):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_bone_name_strips_namespace_and_path() {
        assert_eq!(canonical_bone_name("ROOT"), "ROOT");
        assert_eq!(canonical_bone_name("rig:ROOT"), "ROOT");
        assert_eq!(canonical_bone_name("scene|armature|rig:HAND"), "HAND");
        assert_eq!(canonical_bone_name(""), "");
    }
}
```

- [ ] **Step 2: Run to verify failure** — `cd src-tauri; cargo test canonical_bone_name` → FAIL (function not found).

- [ ] **Step 3: Implement `dcc_fbx.rs` top half** (canonical names + normalized load + inspect):

```rust
use std::path::Path;

use serde::Serialize;

use super::{
    MotionInterchangeError, MotionSkeleton, EXVS2_SAMPLE_RATE_HZ, MAX_MOTION_FRAME_COUNT,
};

/// Canonicalize a DCC node name: strip `a|b|c` path segments then `ns:` prefixes.
pub(crate) fn canonical_bone_name(raw: &str) -> &str {
    let path_trimmed = raw.rsplit('|').next().unwrap_or(raw);
    path_trimmed.rsplit(':').next().unwrap_or(path_trimmed)
}

/// FBX units when UnitScaleFactor is 1.0 are centimeters; our writer emits 1.0.
const TARGET_UNIT_METERS: f64 = 0.01;

/// Load a DCC FBX normalized to the conventions our own writer produces
/// (right-handed Y-up, UnitScaleFactor 1.0). Axis/unit conversion is applied
/// at the root (SpaceConversion::TransformRoot, the ufbx default) so it folds
/// into root-bone locals during world rebase.
pub(crate) fn load_dcc_fbx(path: &Path) -> Result<ufbx::SceneRoot, MotionInterchangeError> {
    let utf8 = path.to_str().ok_or_else(|| {
        MotionInterchangeError::Import(format!("FBX path is not valid UTF-8: {}", path.display()))
    })?;
    let opts = ufbx::LoadOpts {
        target_axes: ufbx::CoordinateAxes::right_handed_y_up(),
        target_unit_meters: TARGET_UNIT_METERS as ufbx::Real,
        ..Default::default()
    };
    ufbx::load_file(utf8, opts).map_err(|error| {
        MotionInterchangeError::Import(format!(
            "failed to load FBX {}: {} — {}",
            path.display(),
            error.description,
            error.info()
        ))
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionFbxStackSummary {
    pub name: String,
    pub frame_count: usize,
    pub duration_seconds: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionFbxInspectReport {
    pub stacks: Vec<MotionFbxStackSummary>,
    pub bone_count: usize,
    pub bone_names: Vec<String>,
}

pub(crate) fn sampled_frame_count_60hz(
    start_time: f64,
    end_time: f64,
) -> Result<usize, MotionInterchangeError> {
    if !start_time.is_finite() || !end_time.is_finite() || end_time < start_time {
        return Err(MotionInterchangeError::Import(format!(
            "invalid FBX animation range {start_time}..{end_time}"
        )));
    }
    let frame_count = ((end_time - start_time) * EXVS2_SAMPLE_RATE_HZ as f64).round() as usize + 1;
    if frame_count == 0 || frame_count > MAX_MOTION_FRAME_COUNT {
        return Err(MotionInterchangeError::Import(format!(
            "FBX animation has {frame_count} sampled frames; maximum is {MAX_MOTION_FRAME_COUNT}"
        )));
    }
    Ok(frame_count)
}

/// List stacks and canonical bone names so the UI can offer choices upfront.
pub fn inspect_motion_fbx_file(
    path: &Path,
) -> Result<MotionFbxInspectReport, MotionInterchangeError> {
    let scene = load_dcc_fbx(path)?;
    let stacks = scene
        .anim_stacks
        .iter()
        .map(|stack| {
            let stack = stack.as_ref();
            let frame_count = sampled_frame_count_60hz(stack.time_begin, stack.time_end)?;
            Ok(MotionFbxStackSummary {
                name: stack.element.name.to_string(),
                frame_count,
                duration_seconds: (frame_count.saturating_sub(1)) as f32
                    / EXVS2_SAMPLE_RATE_HZ as f32,
            })
        })
        .collect::<Result<Vec<_>, MotionInterchangeError>>()?;
    let candidate = candidate_skeleton_canonical(&scene)?;
    Ok(MotionFbxInspectReport {
        bone_count: candidate.bones.len(),
        bone_names: candidate.bones.iter().map(|bone| bone.name.clone()).collect(),
        stacks,
    })
}
```

Also add to `MotionInterchangeError` in `mod.rs` a new variant and display arm:

```rust
    /// MotionFbxImport failures (FBX load, stack, sampling, output).
    Import(String),
```

```rust
            Self::Import(message) => write!(f, "Motion FBX import failed: {message}"),
```

- [ ] **Step 4: Implement `candidate_skeleton_canonical`** (bottom of same file, above tests). Mirrors bridge-era `skeleton_from_fbx` but canonicalizes names and reports collisions:

```rust
use super::MotionBone;
use glam::{Mat4, Quat, Vec3, Vec4};
use ssbh_data::anim_data::Transform;
use std::collections::HashMap;

pub(crate) fn mat4_from_ufbx(matrix: &ufbx::Matrix) -> Mat4 {
    Mat4::from_cols(
        Vec4::new(matrix.m00 as f32, matrix.m10 as f32, matrix.m20 as f32, 0.0),
        Vec4::new(matrix.m01 as f32, matrix.m11 as f32, matrix.m21 as f32, 0.0),
        Vec4::new(matrix.m02 as f32, matrix.m12 as f32, matrix.m22 as f32, 0.0),
        Vec4::new(matrix.m03 as f32, matrix.m13 as f32, matrix.m23 as f32, 1.0),
    )
}

pub(crate) fn transform_from_mat4(local: Mat4) -> Result<Transform, MotionInterchangeError> {
    let (scale, rotation, translation) = local.to_scale_rotation_translation();
    let rotation = Quat::from_xyzw(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
    if !scale.is_finite() || !translation.is_finite() || !rotation.is_finite() {
        return Err(MotionInterchangeError::Import(
            "FBX node transform contains a non-finite value".to_string(),
        ));
    }
    Ok(Transform {
        scale: Vec3::from_array(scale.to_array()),
        rotation,
        translation: Vec3::from_array(translation.to_array()),
    })
}

/// Candidate skeleton from FBX bone-attributed nodes with canonical names.
/// Parent chains skip non-bone helpers (e.g. the Blender Armature object).
pub(crate) fn candidate_skeleton_canonical(
    scene: &ufbx::Scene,
) -> Result<MotionSkeleton, MotionInterchangeError> {
    let bone_nodes: Vec<&ufbx::Node> = scene
        .nodes
        .iter()
        .map(|node| node.as_ref())
        .filter(|node| node.bone.is_some())
        .collect();
    let mut indices: HashMap<String, usize> = HashMap::with_capacity(bone_nodes.len());
    for (index, node) in bone_nodes.iter().enumerate() {
        let canonical = canonical_bone_name(node.element.name.as_ref()).to_string();
        if let Some(previous) = indices.insert(canonical.clone(), index) {
            return Err(MotionInterchangeError::Import(format!(
                "FBX bones '{}' and '{}' collide on canonical name '{canonical}'",
                bone_nodes[previous].element.name, node.element.name
            )));
        }
    }
    let bones = bone_nodes
        .iter()
        .map(|node| {
            // Walk up through non-bone helpers to the nearest bone ancestor.
            let mut ancestor = node.parent.as_ref();
            let parent_index = loop {
                match ancestor {
                    Some(parent) if parent.bone.is_some() => {
                        break indices
                            .get(canonical_bone_name(parent.element.name.as_ref()))
                            .copied();
                    }
                    Some(parent) => ancestor = parent.parent.as_ref(),
                    None => break None,
                }
            };
            Ok(MotionBone {
                name: canonical_bone_name(node.element.name.as_ref()).to_string(),
                parent_index,
                rest_local: transform_from_mat4(mat4_from_ufbx(&node.node_to_parent))?,
            })
        })
        .collect::<Result<Vec<_>, MotionInterchangeError>>()?;
    Ok(MotionSkeleton { bones })
}
```

- [ ] **Step 5: Wire module + run unit tests** — in `mod.rs` add `mod dcc_fbx;` and `pub use dcc_fbx::{inspect_motion_fbx_file, MotionFbxInspectReport, MotionFbxStackSummary};`. Run `cargo test canonical_bone_name` → PASS.

- [ ] **Step 6: Write failing integration test** — create `src-tauri/tests/ssbh_motion_fbx_import_test.rs`:

```rust
use app_lib::ssbh_motion_interchange::{
    inspect_motion_fbx_file, read_nuanmb_as_motion_clip, write_cascadeur_bridge,
};
use glam::{Mat4, Quat, Vec3};
use ssbh_data::{
    anim_data::{
        AnimData, GroupData, GroupType, NodeData, TrackData, TrackValues, Transform, TransformFlags,
    },
    skel_data::{BillboardType, BoneData, SkelData},
};

fn write_two_bone_fixture() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf) {
    let directory = tempfile::tempdir().unwrap();
    let skeleton_path = directory.path().join("fixture.nusktb");
    let animation_path = directory.path().join("fixture.nuanmb");
    let skeleton = SkelData {
        major_version: 1,
        minor_version: 0,
        bones: vec![
            BoneData {
                name: "ROOT".to_string(),
                transform: Mat4::IDENTITY,
                parent_index: None,
                billboard_type: BillboardType::Disabled,
            },
            BoneData {
                name: "HAND".to_string(),
                transform: Mat4::from_translation(Vec3::new(5.0, 0.0, 0.0)),
                parent_index: Some(0),
                billboard_type: BillboardType::Disabled,
            },
        ],
    };
    skeleton.write_to_file(&skeleton_path).unwrap();
    let frames = vec![
        Transform {
            scale: Vec3::ONE,
            rotation: Quat::IDENTITY,
            translation: Vec3::new(0.0, 1.0, 0.0),
        },
        Transform {
            scale: Vec3::ONE,
            rotation: Quat::from_rotation_y(0.5),
            translation: Vec3::new(0.0, 2.0, 0.5),
        },
        Transform {
            scale: Vec3::ONE,
            rotation: Quat::from_rotation_y(1.0),
            translation: Vec3::new(0.0, 3.0, 1.0),
        },
    ];
    let animation = AnimData {
        major_version: 1,
        minor_version: 2,
        final_frame_index: (frames.len() - 1) as f32,
        groups: vec![GroupData {
            group_type: GroupType::Transform,
            nodes: vec![NodeData {
                name: "ROOT".to_string(),
                tracks: vec![TrackData {
                    name: "Transform".to_string(),
                    compensate_scale: false,
                    transform_flags: TransformFlags::default(),
                    values: TrackValues::Transform(frames),
                }],
            }],
        }],
    };
    animation.write_to_file(&animation_path).unwrap();
    (directory, skeleton_path, animation_path)
}

/// Write a real animation-only FBX through the existing writer (bridge.json is
/// ignored by the manifest-free reader; only motion.fbx matters).
fn write_motion_fbx_fixture() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf) {
    let (directory, skeleton_path, animation_path) = write_two_bone_fixture();
    let clip = read_nuanmb_as_motion_clip(&animation_path, &skeleton_path, "fixture_action".to_string())
        .unwrap();
    let bridge_dir = directory.path().join("bridge");
    let bridge = write_cascadeur_bridge(&bridge_dir, &clip).unwrap();
    (directory, skeleton_path, bridge.motion_fbx_path)
}

#[test]
fn inspect_lists_single_stack_and_canonical_bones() {
    let (_directory, _skeleton_path, motion_fbx_path) = write_motion_fbx_fixture();
    let report = inspect_motion_fbx_file(&motion_fbx_path).unwrap();
    assert_eq!(report.stacks.len(), 1);
    assert_eq!(report.stacks[0].name, "fixture_action");
    assert_eq!(report.stacks[0].frame_count, 3);
    assert!(report.bone_names.contains(&"ROOT".to_string()));
    assert!(report.bone_names.contains(&"HAND".to_string()));
    assert_eq!(report.bone_count, 2);
}
```

- [ ] **Step 7: Run** — `cargo test --test ssbh_motion_fbx_import_test --no-fail-fast` → PASS (implementation from Steps 3–5 already satisfies it; if it fails, fix `dcc_fbx.rs`, not the test).

- [ ] **Step 8: Commit**

```powershell
git add src-tauri/src/ssbh_motion_interchange/dcc_fbx.rs src-tauri/src/ssbh_motion_interchange/mod.rs src-tauri/tests/ssbh_motion_fbx_import_test.rs
git commit -m "feat(motion): add DccFbxRead inspect with canonical bone names"
```

---

### Task 2: World-rebase sampling + import orchestrator + Tauri commands

**Files:**
- Modify: `src-tauri/src/ssbh_motion_interchange/dcc_fbx.rs` (sampling)
- Create: `src-tauri/src/ssbh_motion_interchange/motion_fbx_import.rs`
- Modify: `src-tauri/src/ssbh_motion_interchange/mod.rs` (commands + re-exports)
- Modify: `src-tauri/src/lib.rs` (register commands)
- Test: `src-tauri/tests/ssbh_motion_fbx_import_test.rs`

**Interfaces:**
- Consumes: Task 1 items; `read_motion_skeleton`, `write_motion_clip_as_nuanmb`, `validate_rig_binding`, `RigBindingPolicy`, `MotionConversionReport`, `MotionClip`, `MotionFrame`.
- Produces:
  - `pub(crate) fn rebase_reference_locals(reference: &MotionSkeleton, world_transforms: &[Mat4]) -> Result<Vec<Transform>, MotionInterchangeError>` (in `dcc_fbx.rs`)
  - `pub(crate) fn read_dcc_motion_clip(fbx_path: &Path, reference: &MotionSkeleton, stack_name: Option<&str>, policy: RigBindingPolicy) -> Result<(MotionClip, RigBindingReport), MotionInterchangeError>`
  - `pub struct MotionFbxImportRequest { pub fbx_path: String, pub nusktb_path: String, pub output_nuanmb_path: String, pub template_nuanmb_path: Option<String>, pub animation_stack_name: Option<String>, pub rig_binding_policy: RigBindingPolicy }` (serde camelCase, `#[serde(default)]` on policy)
  - `pub fn import_motion_fbx(request: MotionFbxImportRequest) -> Result<MotionConversionReport, MotionInterchangeError>`
  - Tauri commands `ssbh_inspect_motion_fbx(fbx_path: String)` and `ssbh_import_motion_fbx(request)` (async, `run_blocking`)

- [ ] **Step 1: Failing unit test for the rebase math** (append inside `dcc_fbx.rs` tests). A helper transform applied above the root must fold into the root local and leave children untouched:

```rust
    use super::super::{MotionBone, MotionSkeleton};
    use glam::{Mat4, Quat, Vec3};

    fn two_bone_reference() -> MotionSkeleton {
        MotionSkeleton {
            bones: vec![
                MotionBone {
                    name: "ROOT".to_string(),
                    parent_index: None,
                    rest_local: ssbh_data::anim_data::Transform {
                        scale: Vec3::ONE,
                        rotation: Quat::IDENTITY,
                        translation: Vec3::ZERO,
                    },
                },
                MotionBone {
                    name: "HAND".to_string(),
                    parent_index: Some(0),
                    rest_local: ssbh_data::anim_data::Transform {
                        scale: Vec3::ONE,
                        rotation: Quat::IDENTITY,
                        translation: Vec3::new(5.0, 0.0, 0.0),
                    },
                },
            ],
        }
    }

    #[test]
    fn rebase_folds_helper_transform_into_root_and_keeps_children_local() {
        let reference = two_bone_reference();
        let root_world = Mat4::from_translation(Vec3::new(0.0, 2.0, 0.0));
        let hand_local = Mat4::from_translation(Vec3::new(5.0, 0.0, 0.0));
        // Helper above the root: uniform scale + rotation (Blender Armature object).
        let helper = Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2)
            * Mat4::from_scale(Vec3::splat(0.5));
        let worlds = vec![helper * root_world, helper * root_world * hand_local];

        let locals = rebase_reference_locals(&reference, &worlds).unwrap();

        // Child local is exactly the bone-to-parent transform, helper cancelled.
        assert!(locals[1].translation.abs_diff_eq(Vec3::new(5.0, 0.0, 0.0), 1.0e-4));
        assert!(locals[1].scale.abs_diff_eq(Vec3::ONE, 1.0e-4));
        // Root local carries the helper (scale 0.5, rotated translation).
        assert!(locals[0].scale.abs_diff_eq(Vec3::splat(0.5), 1.0e-4));
        assert!(locals[0].translation.abs_diff_eq(Vec3::new(0.0, 0.0, 1.0), 1.0e-4));
    }
```

- [ ] **Step 2: Run** — `cargo test rebase_folds_helper` → FAIL (function missing).

- [ ] **Step 3: Implement `rebase_reference_locals` + `read_dcc_motion_clip`** in `dcc_fbx.rs`:

```rust
use super::{MotionClip, MotionFrame, RigBindingPolicy, RigBindingReport};

/// Convert per-reference-bone world matrices into reference-hierarchy locals.
/// Root bones keep their world transform (folding helper/axis/unit transforms
/// above them); children are rebased against their reference parent's world.
pub(crate) fn rebase_reference_locals(
    reference: &MotionSkeleton,
    world_transforms: &[Mat4],
) -> Result<Vec<Transform>, MotionInterchangeError> {
    if world_transforms.len() != reference.bones.len() {
        return Err(MotionInterchangeError::Import(format!(
            "world transform count {} does not match reference bone count {}",
            world_transforms.len(),
            reference.bones.len()
        )));
    }
    reference
        .bones
        .iter()
        .enumerate()
        .map(|(index, bone)| {
            let local = match bone.parent_index {
                None => world_transforms[index],
                Some(parent_index) => {
                    let parent_world = world_transforms[parent_index];
                    let inverse = parent_world.inverse();
                    if !inverse.is_finite() {
                        return Err(MotionInterchangeError::Import(format!(
                            "bone '{}' has a non-invertible parent world transform",
                            bone.name
                        )));
                    }
                    inverse * world_transforms[index]
                }
            };
            transform_from_mat4(local)
        })
        .collect()
}

/// Manifest-free DCC FBX → MotionClip at 60 Hz against a reference skeleton.
pub(crate) fn read_dcc_motion_clip(
    fbx_path: &Path,
    reference: &MotionSkeleton,
    stack_name: Option<&str>,
    policy: RigBindingPolicy,
) -> Result<(MotionClip, RigBindingReport), MotionInterchangeError> {
    let scene = load_dcc_fbx(fbx_path)?;
    let candidate = candidate_skeleton_canonical(&scene)?;
    let binding_report = super::validate_rig_binding(reference, &candidate, policy)?;
    let stack = select_stack(&scene, stack_name)?;

    // Map each reference bone to its scene node index once; evaluated scenes
    // keep the same node ordering as the source scene.
    let node_index_by_canonical: HashMap<&str, usize> = scene
        .nodes
        .iter()
        .enumerate()
        .filter(|(_, node)| node.bone.is_some())
        .map(|(index, node)| (canonical_bone_name(node.element.name.as_ref()), index))
        .collect();
    let reference_node_indices = reference
        .bones
        .iter()
        .map(|bone| {
            node_index_by_canonical.get(bone.name.as_str()).copied().ok_or_else(|| {
                MotionInterchangeError::RigMismatch(format!(
                    "FBX is missing reference bone '{}'",
                    bone.name
                ))
            })
        })
        .collect::<Result<Vec<usize>, MotionInterchangeError>>()?;

    let frame_count = sampled_frame_count_60hz(stack.time_begin, stack.time_end)?;
    let mut frames = Vec::with_capacity(frame_count);
    let mut previous_rotations: Vec<Option<Quat>> = vec![None; reference.bones.len()];
    for frame_index in 0..frame_count {
        let time = stack.time_begin + frame_index as f64 / EXVS2_SAMPLE_RATE_HZ as f64;
        let evaluated =
            ufbx::evaluate_scene(&scene, &stack.anim, time, ufbx::EvaluateOpts::default())
                .map_err(|error| {
                    MotionInterchangeError::Import(format!(
                        "failed to evaluate FBX stack '{}' at frame {frame_index}: {} — {}",
                        stack.element.name,
                        error.description,
                        error.info()
                    ))
                })?;
        let worlds = reference_node_indices
            .iter()
            .map(|&node_index| mat4_from_ufbx(&evaluated.nodes[node_index].node_to_world))
            .collect::<Vec<Mat4>>();
        let mut local_transforms = rebase_reference_locals(reference, &worlds)?;
        for (bone_index, transform) in local_transforms.iter_mut().enumerate() {
            if let Some(previous) = previous_rotations[bone_index] {
                if previous.dot(transform.rotation) < 0.0 {
                    transform.rotation = -transform.rotation;
                }
            }
            previous_rotations[bone_index] = Some(transform.rotation);
        }
        frames.push(MotionFrame { local_transforms });
    }

    let clip = MotionClip {
        name: stack.element.name.to_string(),
        sample_rate_hz: EXVS2_SAMPLE_RATE_HZ,
        skeleton: reference.clone(),
        frames,
    };
    clip.validate()?;
    Ok((clip, binding_report))
}

fn select_stack<'a>(
    scene: &'a ufbx::Scene,
    requested_name: Option<&str>,
) -> Result<&'a ufbx::AnimStack, MotionInterchangeError> {
    if let Some(requested_name) = requested_name {
        return scene
            .anim_stacks
            .iter()
            .map(|stack| stack.as_ref())
            .find(|stack| stack.element.name == requested_name)
            .ok_or_else(|| {
                let available = scene
                    .anim_stacks
                    .iter()
                    .map(|stack| stack.as_ref().element.name.as_ref())
                    .collect::<Vec<_>>()
                    .join(", ");
                MotionInterchangeError::Import(format!(
                    "FBX animation stack '{requested_name}' was not found; available stacks: {available}"
                ))
            });
    }
    match scene.anim_stacks.len() {
        0 => Err(MotionInterchangeError::Import(
            "FBX contains no animation stacks".to_string(),
        )),
        1 => Ok(&scene.anim_stacks[0]),
        _ => Err(MotionInterchangeError::Import(format!(
            "FBX contains multiple animation stacks; select one of: {}",
            scene
                .anim_stacks
                .iter()
                .map(|stack| stack.as_ref().element.name.as_ref())
                .collect::<Vec<_>>()
                .join(", ")
        ))),
    }
}
```

- [ ] **Step 4: Run** — `cargo test rebase_folds_helper` → PASS.

- [ ] **Step 5: Failing integration tests** (append to `ssbh_motion_fbx_import_test.rs`):

```rust
use app_lib::ssbh_motion_interchange::{import_motion_fbx, MotionFbxImportRequest, RigBindingPolicy};

#[test]
fn import_rejects_output_equal_to_input() {
    let error = import_motion_fbx(MotionFbxImportRequest {
        fbx_path: "same.nuanmb".to_string(),
        nusktb_path: "skeleton.nusktb".to_string(),
        output_nuanmb_path: "same.nuanmb".to_string(),
        template_nuanmb_path: None,
        animation_stack_name: None,
        rig_binding_policy: RigBindingPolicy::ExactHierarchy,
    })
    .unwrap_err()
    .to_string();
    assert!(error.contains("differ"), "unexpected error: {error}");
}

#[test]
fn import_rejects_non_nuanmb_output() {
    let error = import_motion_fbx(MotionFbxImportRequest {
        fbx_path: "motion.fbx".to_string(),
        nusktb_path: "skeleton.nusktb".to_string(),
        output_nuanmb_path: "out.fbx".to_string(),
        template_nuanmb_path: None,
        animation_stack_name: None,
        rig_binding_policy: RigBindingPolicy::ExactHierarchy,
    })
    .unwrap_err()
    .to_string();
    assert!(error.contains(".nuanmb"), "unexpected error: {error}");
}

#[test]
fn manifest_free_import_round_trips_synthetic_motion() {
    let (directory, skeleton_path, motion_fbx_path) = write_motion_fbx_fixture();
    let output_path = directory.path().join("imported.nuanmb");

    let report = import_motion_fbx(MotionFbxImportRequest {
        fbx_path: motion_fbx_path.to_string_lossy().to_string(),
        nusktb_path: skeleton_path.to_string_lossy().to_string(),
        output_nuanmb_path: output_path.to_string_lossy().to_string(),
        template_nuanmb_path: None,
        animation_stack_name: None,
        rig_binding_policy: RigBindingPolicy::ExactHierarchy,
    })
    .unwrap();

    assert_eq!(report.frame_count, 3);
    assert!(report
        .warnings
        .iter()
        .any(|warning| warning.contains("transform-only")));

    let rebuilt =
        read_nuanmb_as_motion_clip(&output_path, &skeleton_path, "rebuilt".to_string()).unwrap();
    let source_animation_path = directory.path().join("fixture.nuanmb");
    let source =
        read_nuanmb_as_motion_clip(&source_animation_path, &skeleton_path, "source".to_string())
            .unwrap();
    assert_eq!(rebuilt.frames.len(), source.frames.len());
    for (frame_index, (expected_frame, actual_frame)) in
        source.frames.iter().zip(&rebuilt.frames).enumerate()
    {
        for (bone_index, (expected, actual)) in expected_frame
            .local_transforms
            .iter()
            .zip(&actual_frame.local_transforms)
            .enumerate()
        {
            assert!(
                expected.translation.abs_diff_eq(actual.translation, 2.0e-3),
                "frame {frame_index} bone {bone_index} translation drifted"
            );
            assert!(
                expected.scale.abs_diff_eq(actual.scale, 2.0e-3),
                "frame {frame_index} bone {bone_index} scale drifted"
            );
            assert!(
                expected.rotation.dot(actual.rotation).abs() > 0.9999,
                "frame {frame_index} bone {bone_index} rotation drifted"
            );
        }
    }
}

#[test]
fn import_with_template_preserves_non_transform_groups() {
    let (directory, skeleton_path, motion_fbx_path) = write_motion_fbx_fixture();
    // Template: fixture animation + one visibility group.
    let template_path = directory.path().join("template.nuanmb");
    let source_animation_path = directory.path().join("fixture.nuanmb");
    let mut template = AnimData::from_file(&source_animation_path).unwrap();
    template.groups.push(GroupData {
        group_type: GroupType::Visibility,
        nodes: vec![NodeData {
            name: "MESH".to_string(),
            tracks: vec![TrackData {
                name: "Visibility".to_string(),
                compensate_scale: false,
                transform_flags: TransformFlags::default(),
                values: TrackValues::Boolean(vec![true, false, true]),
            }],
        }],
    });
    template.write_to_file(&template_path).unwrap();

    let output_path = directory.path().join("with_template.nuanmb");
    let report = import_motion_fbx(MotionFbxImportRequest {
        fbx_path: motion_fbx_path.to_string_lossy().to_string(),
        nusktb_path: skeleton_path.to_string_lossy().to_string(),
        output_nuanmb_path: output_path.to_string_lossy().to_string(),
        template_nuanmb_path: Some(template_path.to_string_lossy().to_string()),
        animation_stack_name: Some("fixture_action".to_string()),
        rig_binding_policy: RigBindingPolicy::ExactHierarchy,
    })
    .unwrap();
    assert_eq!(report.preserved_non_transform_group_count, 1);

    let written = AnimData::from_file(&output_path).unwrap();
    assert!(written
        .groups
        .iter()
        .any(|group| group.group_type == GroupType::Visibility));
}
```

- [ ] **Step 6: Run** — `cargo test --test ssbh_motion_fbx_import_test` → FAIL (missing `import_motion_fbx`).

- [ ] **Step 7: Implement `motion_fbx_import.rs`:**

```rust
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{
    dcc_fbx::read_dcc_motion_clip, read_motion_skeleton, write_motion_clip_as_nuanmb,
    MotionConversionReport, MotionInterchangeError, RigBindingPolicy,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionFbxImportRequest {
    pub fbx_path: String,
    pub nusktb_path: String,
    pub output_nuanmb_path: String,
    pub template_nuanmb_path: Option<String>,
    pub animation_stack_name: Option<String>,
    #[serde(default)]
    pub rig_binding_policy: RigBindingPolicy,
}

/// Manifest-free MotionFbxImport: DCC FBX + NUSKTB (+ template) → new NUANMB.
pub fn import_motion_fbx(
    request: MotionFbxImportRequest,
) -> Result<MotionConversionReport, MotionInterchangeError> {
    let fbx_path = required_import_path(&request.fbx_path, "fbx_path")?;
    let skeleton_path = required_import_path(&request.nusktb_path, "nusktb_path")?;
    let output_path = required_import_path(&request.output_nuanmb_path, "output_nuanmb_path")?;
    let template_path = request
        .template_nuanmb_path
        .as_deref()
        .map(|path| required_import_path(path, "template_nuanmb_path"))
        .transpose()?;

    if !path_has_extension(&output_path, "nuanmb") {
        return Err(MotionInterchangeError::Import(
            "output_nuanmb_path must end with .nuanmb".to_string(),
        ));
    }
    let inputs = [
        Some(&fbx_path),
        Some(&skeleton_path),
        template_path.as_ref(),
    ];
    if inputs.into_iter().flatten().any(|input| input == &output_path) {
        return Err(MotionInterchangeError::Import(
            "output_nuanmb_path must differ from every input path".to_string(),
        ));
    }

    let reference = read_motion_skeleton(&skeleton_path)?;
    let (clip, binding) = read_dcc_motion_clip(
        &fbx_path,
        &reference,
        request.animation_stack_name.as_deref(),
        request.rig_binding_policy,
    )?;
    let write_report = write_motion_clip_as_nuanmb(&clip, template_path.as_deref(), &output_path)?;

    let mut warnings = binding.warnings.clone();
    if template_path.is_none() {
        warnings.push(
            "no template NUANMB was provided; the output is transform-only (visibility/material groups absent)"
                .to_string(),
        );
    }
    if !binding.ignored_bones.is_empty() {
        warnings.push(format!(
            "ignored {} non-reference FBX nodes (helpers, leaf bones)",
            binding.ignored_bones.len()
        ));
    }

    Ok(MotionConversionReport {
        output_path: write_report.output_path.to_string_lossy().to_string(),
        action_name: clip.name.clone(),
        frame_count: write_report.frame_count,
        duration_seconds: (clip.frames.len().saturating_sub(1)) as f32
            / clip.sample_rate_hz as f32,
        matched_bones: binding.matched_bones,
        ignored_bones: binding.ignored_bones,
        preserved_non_transform_group_count: write_report.preserved_non_transform_group_count,
        warnings,
    })
}

fn required_import_path(value: &str, field_name: &str) -> Result<PathBuf, MotionInterchangeError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(MotionInterchangeError::Import(format!(
            "{field_name} must not be empty"
        )));
    }
    Ok(PathBuf::from(value))
}

fn path_has_extension(path: &Path, expected: &str) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case(expected))
}
```

In `mod.rs`: `mod motion_fbx_import;`, `pub use motion_fbx_import::{import_motion_fbx, MotionFbxImportRequest};`, plus commands:

```rust
#[tauri::command]
pub async fn ssbh_inspect_motion_fbx(fbx_path: String) -> Result<MotionFbxInspectReport, String> {
    run_blocking(move || inspect_motion_fbx_file(Path::new(fbx_path.trim()))).await
}

#[tauri::command]
pub async fn ssbh_import_motion_fbx(
    request: MotionFbxImportRequest,
) -> Result<MotionConversionReport, String> {
    run_blocking(move || import_motion_fbx(request)).await
}
```

Make `MotionConversionReport` also `Deserialize` if it is not already (frontend tests deserialize it): keep as `Serialize` only — frontend only consumes. Register both commands in `src-tauri/src/lib.rs` next to `ssbh_export_complete_motion_fbx` in the `invoke_handler` list.

- [ ] **Step 8: Run full motion tests** — `cargo test --test ssbh_motion_fbx_import_test --no-fail-fast` and `cargo test --test ssbh_motion_interchange_test --no-fail-fast` → PASS. Note: `manifest_free_import_round_trips_synthetic_motion` asserts the transform-only warning — ensure orchestrator emits it before running.

- [ ] **Step 9: Real-data gated test** (append; mirrors existing Gyan pattern; copies real files to temp first):

```rust
#[test]
#[ignore = "requires SSBH_MOTION_REAL_NUANMB and SSBH_MOTION_REAL_NUSKTB"]
fn real_nuanmb_round_trips_through_manifest_free_import() {
    let directory = tempfile::tempdir().unwrap();
    let nuanmb_path = directory.path().join("real.nuanmb");
    let nusktb_path = directory.path().join("real.nusktb");
    std::fs::copy(std::env::var("SSBH_MOTION_REAL_NUANMB").unwrap(), &nuanmb_path).unwrap();
    std::fs::copy(std::env::var("SSBH_MOTION_REAL_NUSKTB").unwrap(), &nusktb_path).unwrap();

    let source =
        read_nuanmb_as_motion_clip(&nuanmb_path, &nusktb_path, "real_source".to_string()).unwrap();
    let bridge = write_cascadeur_bridge(&directory.path().join("bridge"), &source).unwrap();

    let output_path = directory.path().join("reimported.nuanmb");
    let report = import_motion_fbx(MotionFbxImportRequest {
        fbx_path: bridge.motion_fbx_path.to_string_lossy().to_string(),
        nusktb_path: nusktb_path.to_string_lossy().to_string(),
        output_nuanmb_path: output_path.to_string_lossy().to_string(),
        template_nuanmb_path: Some(nuanmb_path.to_string_lossy().to_string()),
        animation_stack_name: Some("real_source".to_string()),
        rig_binding_policy: RigBindingPolicy::ExactHierarchy,
    })
    .unwrap();
    assert_eq!(report.frame_count, source.frames.len());

    let rebuilt =
        read_nuanmb_as_motion_clip(&output_path, &nusktb_path, "real_rebuilt".to_string()).unwrap();
    for (frame_index, (expected_frame, actual_frame)) in
        source.frames.iter().zip(&rebuilt.frames).enumerate()
    {
        for (bone_index, (expected, actual)) in expected_frame
            .local_transforms
            .iter()
            .zip(&actual_frame.local_transforms)
            .enumerate()
        {
            assert!(
                expected.translation.abs_diff_eq(actual.translation, 2.0e-3),
                "frame {frame_index} bone {bone_index} '{}' translation drifted",
                source.skeleton.bones[bone_index].name
            );
            assert!(
                expected.scale.abs_diff_eq(actual.scale, 2.0e-3),
                "frame {frame_index} bone {bone_index} scale drifted"
            );
            assert!(
                expected.rotation.dot(actual.rotation).abs() > 0.9999,
                "frame {frame_index} bone {bone_index} rotation drifted"
            );
        }
    }
}
```

Run once with real Hyaku-Shiki/Gyan data from the unpacked workspace (paths via env vars; read-only sources, copied to temp):

```powershell
cd src-tauri
$env:SSBH_MOTION_REAL_NUANMB = "<real nuanmb path>"
$env:SSBH_MOTION_REAL_NUSKTB = "<real nusktb path>"
cargo test --test ssbh_motion_fbx_import_test real_nuanmb_round_trips -- --ignored
```

- [ ] **Step 10: Commit**

```powershell
git add src-tauri/src/ssbh_motion_interchange src-tauri/src/lib.rs src-tauri/tests/ssbh_motion_fbx_import_test.rs
git commit -m "feat(motion): manifest-free MotionFbxImport with world-rebase sampling"
```

---

### Task 3: Blender 5.1 round-trip integration test (ground truth for DccSpaceNormalize)

**Files:**
- Create: `src-tauri/scripts/motion_fbx_roundtrip_blender.py`
- Test: `src-tauri/tests/ssbh_motion_fbx_import_test.rs`

**Interfaces:**
- Consumes: `export_complete_motion_fbx`, `CompleteMotionFbxExportRequest`, `import_motion_fbx`, `resolve_blender_51_executable` (all `pub` in `ssbh_motion_interchange`).
- Produces: env-gated test `blender_roundtrip_reimports_complete_motion_fbx` requiring `SSBH_MOTION_REAL_NUANMB`, `SSBH_MOTION_REAL_NUSKTB`, `SSBH_MOTION_REAL_NUMDLB`, and Blender 5.1 installed.

- [ ] **Step 1: Write the Blender script** `src-tauri/scripts/motion_fbx_roundtrip_blender.py` (test-only; simulates a modder opening and re-exporting with near-default settings, including Blender's default `add_leaf_bones=True`):

```python
"""Test-only helper: open an FBX and re-export it with Blender defaults.

Simulates a mod developer editing CompleteMotionFbx in Blender 5.1 and
exporting the result. Not shipped as a product feature.
"""
import argparse
import json
import sys

import bpy


def parse_args() -> argparse.Namespace:
    separator_index = sys.argv.index("--")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-fbx", required=True)
    parser.add_argument("--output-fbx", required=True)
    return parser.parse_args(sys.argv[separator_index + 1 :])


def main() -> None:
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=args.input_fbx)
    bpy.ops.export_scene.fbx(
        filepath=args.output_fbx,
        bake_anim=True,
        bake_anim_use_nla_strips=False,
        bake_anim_use_all_actions=False,
        add_leaf_bones=True,
    )
    print(json.dumps({"ok": True}))


main()
```

- [ ] **Step 2: Syntax check** — `python -m py_compile src-tauri/scripts/motion_fbx_roundtrip_blender.py` → exit 0.

- [ ] **Step 3: Write the gated round-trip test** (append to `ssbh_motion_fbx_import_test.rs`):

```rust
use app_lib::ssbh_motion_interchange::{
    export_complete_motion_fbx, resolve_blender_51_executable, CompleteMotionFbxExportRequest,
};

#[test]
#[ignore = "requires real data env vars and a local Blender 5.1 install"]
fn blender_roundtrip_reimports_complete_motion_fbx() {
    let directory = tempfile::tempdir().unwrap();
    let nuanmb_path = directory.path().join("real.nuanmb");
    let nusktb_path = directory.path().join("real.nusktb");
    std::fs::copy(std::env::var("SSBH_MOTION_REAL_NUANMB").unwrap(), &nuanmb_path).unwrap();
    std::fs::copy(std::env::var("SSBH_MOTION_REAL_NUSKTB").unwrap(), &nusktb_path).unwrap();
    // The model folder must stay intact (numdlb references neighbors), so the
    // numdlb is used in place but strictly read-only for the export step.
    let numdlb_path = std::env::var("SSBH_MOTION_REAL_NUMDLB").unwrap();

    let complete_fbx = directory.path().join("complete.fbx");
    export_complete_motion_fbx(CompleteMotionFbxExportRequest {
        nuanmb_path: nuanmb_path.to_string_lossy().to_string(),
        nusktb_path: nusktb_path.to_string_lossy().to_string(),
        numdlb_path: numdlb_path.clone(),
        output_fbx_path: complete_fbx.to_string_lossy().to_string(),
        blender_path: None,
        action_name: Some("roundtrip_action".to_string()),
    })
    .unwrap();

    // Simulated modder edit: open + default re-export in Blender.
    let blender = resolve_blender_51_executable(None).unwrap();
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("scripts")
        .join("motion_fbx_roundtrip_blender.py");
    let reexported_fbx = directory.path().join("reexported.fbx");
    let output = std::process::Command::new(&blender)
        .arg("-b")
        .arg("-P")
        .arg(&script)
        .arg("--")
        .arg("--input-fbx")
        .arg(&complete_fbx)
        .arg("--output-fbx")
        .arg(&reexported_fbx)
        .output()
        .unwrap();
    assert!(
        output.status.success() && reexported_fbx.is_file(),
        "blender re-export failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let source =
        read_nuanmb_as_motion_clip(&nuanmb_path, &nusktb_path, "roundtrip_source".to_string())
            .unwrap();
    let output_path = directory.path().join("roundtrip.nuanmb");
    let report = import_motion_fbx(MotionFbxImportRequest {
        fbx_path: reexported_fbx.to_string_lossy().to_string(),
        nusktb_path: nusktb_path.to_string_lossy().to_string(),
        output_nuanmb_path: output_path.to_string_lossy().to_string(),
        template_nuanmb_path: Some(nuanmb_path.to_string_lossy().to_string()),
        animation_stack_name: None,
        rig_binding_policy: RigBindingPolicy::ExactHierarchy,
    })
    .unwrap();
    assert_eq!(report.frame_count, source.frames.len());

    let rebuilt =
        read_nuanmb_as_motion_clip(&output_path, &nusktb_path, "roundtrip_rebuilt".to_string())
            .unwrap();
    let mut worst_translation = 0.0_f32;
    for (expected_frame, actual_frame) in source.frames.iter().zip(&rebuilt.frames) {
        for (expected, actual) in expected_frame
            .local_transforms
            .iter()
            .zip(&actual_frame.local_transforms)
        {
            worst_translation =
                worst_translation.max((expected.translation - actual.translation).length());
            assert!(
                expected.rotation.dot(actual.rotation).abs() > 0.999,
                "rotation drifted beyond Blender round-trip tolerance"
            );
        }
    }
    // Blender import/export applies its own float conversions; allow a looser
    // absolute translation tolerance than the pure-Rust round trip.
    assert!(
        worst_translation < 1.0e-2,
        "worst translation drift {worst_translation} exceeds tolerance"
    );
}
```

Note: if the Blender re-export produces multiple stacks, the import errors and
lists them — pass the listed name via `animation_stack_name` and record what
Blender 5.1 names re-exported stacks in a comment. Fix DccSpaceNormalize
constants (never the assertions' meaning) if drift exceeds tolerance.

- [ ] **Step 4: Run the gated test with real data** (all three env vars set) and iterate `dcc_fbx.rs` until green:

```powershell
cd src-tauri
cargo test --test ssbh_motion_fbx_import_test blender_roundtrip -- --ignored --nocapture
```

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/scripts/motion_fbx_roundtrip_blender.py src-tauri/tests/ssbh_motion_fbx_import_test.rs
git commit -m "test(motion): Blender 5.1 round-trip ground truth for MotionFbxImport"
```

---

### Task 4: ClipOps — trim + retime

**Files:**
- Create: `src-tauri/src/ssbh_motion_interchange/clip_ops.rs`
- Modify: `src-tauri/src/ssbh_motion_interchange/mod.rs` (module + re-exports + command)
- Modify: `src-tauri/src/lib.rs` (register `ssbh_transform_nuanmb_clip`)
- Test: in-module `#[cfg(test)]` + `src-tauri/tests/ssbh_motion_fbx_import_test.rs`

**Interfaces:**
- Consumes: `MotionClip`, `MotionFrame`, `read_nuanmb_as_motion_clip`, `write_motion_clip_as_nuanmb`, `MotionConversionReport`.
- Produces:
  - `pub fn trim_motion_clip(clip: &MotionClip, start_frame: usize, end_frame: usize) -> Result<MotionClip, MotionInterchangeError>`
  - `pub fn retime_motion_clip(clip: &MotionClip, speed_factor: f32) -> Result<MotionClip, MotionInterchangeError>`
  - `pub enum ClipOperation { Trim { start_frame: usize, end_frame: usize }, Retime { speed_factor: f32 } }` (serde camelCase, tag = "kind")
  - `pub struct NuanmbClipTransformRequest { pub nuanmb_path: String, pub nusktb_path: String, pub output_nuanmb_path: String, pub operation: ClipOperation }` (serde camelCase)
  - `pub fn transform_nuanmb_clip(request: NuanmbClipTransformRequest) -> Result<MotionConversionReport, MotionInterchangeError>`
  - Tauri command `ssbh_transform_nuanmb_clip(request)`

- [ ] **Step 1: Failing in-module tests** (`clip_ops.rs` created with tests + `use super::*;` only):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssbh_motion_interchange::{MotionBone, MotionFrame, MotionSkeleton};
    use glam::{Quat, Vec3};
    use ssbh_data::anim_data::Transform;

    fn clip_with_translations(values: &[f32]) -> MotionClip {
        MotionClip {
            name: "ops_fixture".to_string(),
            sample_rate_hz: 60,
            skeleton: MotionSkeleton {
                bones: vec![MotionBone {
                    name: "ROOT".to_string(),
                    parent_index: None,
                    rest_local: Transform {
                        scale: Vec3::ONE,
                        rotation: Quat::IDENTITY,
                        translation: Vec3::ZERO,
                    },
                }],
            },
            frames: values
                .iter()
                .map(|value| MotionFrame {
                    local_transforms: vec![Transform {
                        scale: Vec3::ONE,
                        rotation: Quat::IDENTITY,
                        translation: Vec3::new(*value, 0.0, 0.0),
                    }],
                })
                .collect(),
        }
    }

    #[test]
    fn trim_keeps_inclusive_frame_range() {
        let clip = clip_with_translations(&[0.0, 1.0, 2.0, 3.0, 4.0]);
        let trimmed = trim_motion_clip(&clip, 1, 3).unwrap();
        assert_eq!(trimmed.frames.len(), 3);
        assert_eq!(trimmed.frames[0].local_transforms[0].translation.x, 1.0);
        assert_eq!(trimmed.frames[2].local_transforms[0].translation.x, 3.0);
    }

    #[test]
    fn trim_rejects_reversed_or_out_of_range_bounds() {
        let clip = clip_with_translations(&[0.0, 1.0, 2.0]);
        assert!(trim_motion_clip(&clip, 2, 1).is_err());
        assert!(trim_motion_clip(&clip, 0, 3).is_err());
    }

    #[test]
    fn retime_half_speed_doubles_frame_count_and_interpolates() {
        let clip = clip_with_translations(&[0.0, 2.0, 4.0]);
        let slowed = retime_motion_clip(&clip, 0.5).unwrap();
        assert_eq!(slowed.frames.len(), 5);
        assert!((slowed.frames[1].local_transforms[0].translation.x - 1.0).abs() < 1.0e-4);
        assert!((slowed.frames[4].local_transforms[0].translation.x - 4.0).abs() < 1.0e-4);
    }

    #[test]
    fn retime_rejects_non_positive_or_non_finite_factor() {
        let clip = clip_with_translations(&[0.0, 1.0]);
        assert!(retime_motion_clip(&clip, 0.0).is_err());
        assert!(retime_motion_clip(&clip, f32::NAN).is_err());
    }
}
```

- [ ] **Step 2: Run** — `cargo test trim_keeps_inclusive` → FAIL.

- [ ] **Step 3: Implement `clip_ops.rs`:**

```rust
use std::path::PathBuf;

use glam::Quat;
use serde::{Deserialize, Serialize};
use ssbh_data::anim_data::Transform;

use super::{
    read_nuanmb_as_motion_clip, write_motion_clip_as_nuanmb, MotionClip, MotionConversionReport,
    MotionFrame, MotionInterchangeError, MAX_MOTION_FRAME_COUNT,
};

/// Keep frames `start_frame..=end_frame` (inclusive, 0-based).
pub fn trim_motion_clip(
    clip: &MotionClip,
    start_frame: usize,
    end_frame: usize,
) -> Result<MotionClip, MotionInterchangeError> {
    clip.validate()?;
    if start_frame > end_frame || end_frame >= clip.frames.len() {
        return Err(MotionInterchangeError::InvalidClip(format!(
            "trim range {start_frame}..={end_frame} is outside 0..={}",
            clip.frames.len() - 1
        )));
    }
    let trimmed = MotionClip {
        name: format!("{}_trim", clip.name),
        sample_rate_hz: clip.sample_rate_hz,
        skeleton: clip.skeleton.clone(),
        frames: clip.frames[start_frame..=end_frame].to_vec(),
    };
    trimmed.validate()?;
    Ok(trimmed)
}

/// Resample at 60 Hz with playback speed multiplied by `speed_factor`
/// (2.0 = twice as fast / half the frames; 0.5 = half speed / double frames).
pub fn retime_motion_clip(
    clip: &MotionClip,
    speed_factor: f32,
) -> Result<MotionClip, MotionInterchangeError> {
    clip.validate()?;
    if !speed_factor.is_finite() || speed_factor <= 0.0 {
        return Err(MotionInterchangeError::InvalidClip(format!(
            "speed factor must be a positive finite number, got {speed_factor}"
        )));
    }
    let source_last = (clip.frames.len() - 1) as f32;
    let new_last = (source_last / speed_factor).round() as usize;
    let new_count = new_last + 1;
    if new_count > MAX_MOTION_FRAME_COUNT {
        return Err(MotionInterchangeError::InvalidClip(format!(
            "retimed clip would have {new_count} frames; maximum is {MAX_MOTION_FRAME_COUNT}"
        )));
    }
    let frames = (0..new_count)
        .map(|frame_index| {
            let position = (frame_index as f32 * speed_factor).clamp(0.0, source_last);
            let lower = position.floor() as usize;
            let upper = position.ceil() as usize;
            let fraction = position.fract();
            MotionFrame {
                local_transforms: clip.frames[lower]
                    .local_transforms
                    .iter()
                    .zip(&clip.frames[upper].local_transforms)
                    .map(|(a, b)| lerp_transform(a, b, fraction))
                    .collect(),
            }
        })
        .collect();
    let retimed = MotionClip {
        name: format!("{}_retime", clip.name),
        sample_rate_hz: clip.sample_rate_hz,
        skeleton: clip.skeleton.clone(),
        frames,
    };
    retimed.validate()?;
    Ok(retimed)
}

fn lerp_transform(a: &Transform, b: &Transform, t: f32) -> Transform {
    let mut rotation_b = b.rotation;
    if a.rotation.dot(rotation_b) < 0.0 {
        rotation_b = -rotation_b;
    }
    Transform {
        scale: a.scale.lerp(b.scale, t),
        rotation: Quat::slerp(a.rotation, rotation_b, t).normalize(),
        translation: a.translation.lerp(b.translation, t),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ClipOperation {
    #[serde(rename_all = "camelCase")]
    Trim { start_frame: usize, end_frame: usize },
    #[serde(rename_all = "camelCase")]
    Retime { speed_factor: f32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NuanmbClipTransformRequest {
    pub nuanmb_path: String,
    pub nusktb_path: String,
    pub output_nuanmb_path: String,
    pub operation: ClipOperation,
}

/// NUANMB → transformed NUANMB. ClipOps v1 output is transform-only.
pub fn transform_nuanmb_clip(
    request: NuanmbClipTransformRequest,
) -> Result<MotionConversionReport, MotionInterchangeError> {
    let nuanmb_path = required_ops_path(&request.nuanmb_path, "nuanmb_path")?;
    let nusktb_path = required_ops_path(&request.nusktb_path, "nusktb_path")?;
    let output_path = required_ops_path(&request.output_nuanmb_path, "output_nuanmb_path")?;
    if output_path == nuanmb_path || output_path == nusktb_path {
        return Err(MotionInterchangeError::InvalidClip(
            "output_nuanmb_path must differ from every input path".to_string(),
        ));
    }
    let source_name = nuanmb_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("clip")
        .to_string();
    let clip = read_nuanmb_as_motion_clip(&nuanmb_path, &nusktb_path, source_name)?;
    let transformed = match request.operation {
        ClipOperation::Trim {
            start_frame,
            end_frame,
        } => trim_motion_clip(&clip, start_frame, end_frame)?,
        ClipOperation::Retime { speed_factor } => retime_motion_clip(&clip, speed_factor)?,
    };
    let write_report = write_motion_clip_as_nuanmb(&transformed, None, &output_path)?;
    Ok(MotionConversionReport {
        output_path: write_report.output_path.to_string_lossy().to_string(),
        action_name: transformed.name.clone(),
        frame_count: write_report.frame_count,
        duration_seconds: (transformed.frames.len().saturating_sub(1)) as f32
            / transformed.sample_rate_hz as f32,
        matched_bones: transformed
            .skeleton
            .bones
            .iter()
            .map(|bone| bone.name.clone())
            .collect(),
        ignored_bones: Vec::new(),
        preserved_non_transform_group_count: 0,
        warnings: vec![
            "clip operations write transform-only NUANMB; non-Transform groups are not carried over"
                .to_string(),
        ],
    })
}

fn required_ops_path(value: &str, field_name: &str) -> Result<PathBuf, MotionInterchangeError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(MotionInterchangeError::InvalidClip(format!(
            "{field_name} must not be empty"
        )));
    }
    Ok(PathBuf::from(value))
}
```

In `mod.rs`: `mod clip_ops;`, re-export `clip_ops::{retime_motion_clip, transform_nuanmb_clip, trim_motion_clip, ClipOperation, NuanmbClipTransformRequest}`, add command:

```rust
#[tauri::command]
pub async fn ssbh_transform_nuanmb_clip(
    request: NuanmbClipTransformRequest,
) -> Result<MotionConversionReport, String> {
    run_blocking(move || transform_nuanmb_clip(request)).await
}
```

Register in `lib.rs`.

- [ ] **Step 4: Run** — `cargo test --lib clip_ops` (or `cargo test trim_ retime_`) → PASS.

- [ ] **Step 5: End-to-end integration test** (append to `ssbh_motion_fbx_import_test.rs`):

```rust
use app_lib::ssbh_motion_interchange::{
    transform_nuanmb_clip, ClipOperation, NuanmbClipTransformRequest,
};

#[test]
fn transform_nuanmb_clip_trims_and_writes_parseable_output() {
    let (directory, skeleton_path, animation_path) = write_two_bone_fixture();
    let output_path = directory.path().join("trimmed.nuanmb");
    let report = transform_nuanmb_clip(NuanmbClipTransformRequest {
        nuanmb_path: animation_path.to_string_lossy().to_string(),
        nusktb_path: skeleton_path.to_string_lossy().to_string(),
        output_nuanmb_path: output_path.to_string_lossy().to_string(),
        operation: ClipOperation::Trim {
            start_frame: 0,
            end_frame: 1,
        },
    })
    .unwrap();
    assert_eq!(report.frame_count, 2);
    let parsed = AnimData::from_file(&output_path).unwrap();
    assert_eq!(parsed.final_frame_index, 1.0);
}
```

- [ ] **Step 6: Run** — `cargo test --test ssbh_motion_fbx_import_test --no-fail-fast` → PASS.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/ssbh_motion_interchange src-tauri/src/lib.rs src-tauri/tests/ssbh_motion_fbx_import_test.rs
git commit -m "feat(motion): add ClipOps trim and retime with NUANMB command"
```

---

### Task 5: Frontend service + MotionFbxImportPanel + ImportPreview

**Files:**
- Create: `src/components/ssbh-model-preview/motionFbxImportService.ts`
- Create: `src/components/ssbh-model-preview/components/MotionFbxImportPanel.tsx`
- Create: `src/components/ssbh-model-preview/components/MotionFbxImportPanel.test.tsx`
- Modify: `src/components/ssbh-model-preview/SsbhModelPreviewContext.tsx` (additive `loadMotionNuanmbPath`)
- Modify: `src/components/ssbh-model-preview/SsbhModelPreviewMotionPanel.tsx` (mount)
- Modify: `src/components/ssbh-model-preview/components/MotionFbxExportPanel.tsx` (copy)
- Modify: `src/utils/dialogLastPath.ts` (keys `ssbhMotionFbxImportOpen`, `ssbhMotionFbxImportSave`)

Consult the `design-taste-frontend` skill before writing JSX; stay within the MayaSection language.

**Interfaces:**
- Consumes: Tauri commands from Tasks 2; `MayaSection`, `DialogLastPathKey` utils, `Button`, `Input`, `Select`, sonner.
- Produces:

```ts
// motionFbxImportService.ts
export type MotionFbxStackSummary = { name: string; frameCount: number; durationSeconds: number };
export type MotionFbxInspectReport = {
  stacks: MotionFbxStackSummary[];
  boneCount: number;
  boneNames: string[];
};
export type RigBindingPolicyValue = "exactHierarchy" | "nameOnly";
export type MotionFbxImportRequest = {
  fbxPath: string;
  nusktbPath: string;
  outputNuanmbPath: string;
  templateNuanmbPath: string | null;
  animationStackName: string | null;
  rigBindingPolicy: RigBindingPolicyValue;
};
export type MotionConversionReport = {
  outputPath: string;
  actionName: string;
  frameCount: number;
  durationSeconds: number;
  matchedBones: string[];
  ignoredBones: string[];
  preservedNonTransformGroupCount: number;
  warnings: string[];
};
export function inspectMotionFbx(fbxPath: string): Promise<MotionFbxInspectReport>;
export function importMotionFbx(request: MotionFbxImportRequest): Promise<MotionConversionReport>;
```

- Context addition: `loadMotionNuanmbPath: (path: string) => void` — appends `path` to the active instance's `nuanmbPaths` (dedup) and selects it, resetting frame/playing like `pickMotionNuanmbFile` does, but WITHOUT replacing the existing list.
- Panel props: `{ skeletonPath: string | null; selectedNuanmbPath: string | null; workspaceRoot: string | null; disabled: boolean; onImported: (nuanmbPath: string) => void }`.

- [ ] **Step 1: Write failing Vitest** `MotionFbxImportPanel.test.tsx` following the export panel test's mock pattern (`vi.hoisted` invoke/open/save/toast mocks, MayaSection mock). Cover:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MotionFbxImportPanel } from "./MotionFbxImportPanel";

const { invokeMock, openMock, saveMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
  saveMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock, save: saveMock }));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock, success: toastSuccessMock } }));
vi.mock("../MayaInspectorSection", () => ({
  MayaSection: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}));

const inspectReport = {
  stacks: [{ name: "attack_edit", frameCount: 40, durationSeconds: 0.65 }],
  boneCount: 30,
  boneNames: ["ROOT"],
};

const importReport = {
  outputPath: "E:\\out\\attack_edit.nuanmb",
  actionName: "attack_edit",
  frameCount: 40,
  durationSeconds: 0.65,
  matchedBones: ["ROOT"],
  ignoredBones: ["ROOT_end"],
  preservedNonTransformGroupCount: 2,
  warnings: [],
};

const onImportedMock = vi.fn();

function renderPanel() {
  return render(
    <MotionFbxImportPanel
      skeletonPath={"E:\\unit\\body.nusktb"}
      selectedNuanmbPath={"E:\\unit\\attack.nuanmb"}
      workspaceRoot={"E:\\unit"}
      disabled={false}
      onImported={onImportedMock}
    />,
  );
}

describe("MotionFbxImportPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openMock.mockReset();
    saveMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    onImportedMock.mockReset();
    localStorage.clear();
  });

  it("imports through inspect + save with the selected NUANMB as template", async () => {
    openMock.mockResolvedValueOnce("E:\\edit\\attack_edit.fbx");
    invokeMock.mockImplementation((command: string) => {
      if (command === "ssbh_inspect_motion_fbx") return Promise.resolve(inspectReport);
      if (command === "ssbh_import_motion_fbx") return Promise.resolve(importReport);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    saveMock.mockResolvedValueOnce("E:\\out\\attack_edit.nuanmb");
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_import_motion_fbx", {
        request: {
          fbxPath: "E:\\edit\\attack_edit.fbx",
          nusktbPath: "E:\\unit\\body.nusktb",
          outputNuanmbPath: "E:\\out\\attack_edit.nuanmb",
          templateNuanmbPath: "E:\\unit\\attack.nuanmb",
          animationStackName: "attack_edit",
          rigBindingPolicy: "exactHierarchy",
        },
      }),
    );
    expect(onImportedMock).toHaveBeenCalledWith("E:\\out\\attack_edit.nuanmb");
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(screen.getByText(/40 frames/)).toBeInTheDocument();
  });

  it("is a no-op when the FBX open dialog is cancelled", async () => {
    openMock.mockResolvedValueOnce(null);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));
    await waitFor(() => expect(openMock).toHaveBeenCalled());
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("surfaces backend errors inline and via toast", async () => {
    openMock.mockResolvedValueOnce("E:\\edit\\bad.fbx");
    invokeMock.mockImplementation((command: string) => {
      if (command === "ssbh_inspect_motion_fbx") return Promise.resolve(inspectReport);
      return Promise.reject("Motion FBX import failed: candidate skeleton is missing reference bone 'HAND'");
    });
    saveMock.mockResolvedValueOnce("E:\\out\\bad.nuanmb");
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/missing reference bone/);
    expect(toastErrorMock).toHaveBeenCalled();
    expect(onImportedMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/components/ssbh-model-preview/components/MotionFbxImportPanel.test.tsx` → FAIL (component missing).

- [ ] **Step 3: Implement service + panel.** Service is a thin `invoke` wrapper (types above). Panel flow inside one `importFlow` callback:
  1. `open` dialog (FBX filter, key `ssbhMotionFbxImportOpen`); cancel → return.
  2. `inspectMotionFbx(fbxPath)`; if `stacks.length > 1` and no stack chosen yet, store report + show inline `Select` and stop (user re-clicks the primary button after choosing; the button label switches to "Import '{stack}'").
  3. Single stack → use its name as `animationStackName` (also the default output stem).
  4. `save` dialog (default `{stack || fbx stem}.nuanmb`, key `ssbhMotionFbxImportSave`); cancel → return.
  5. `importMotionFbx` with `templateNuanmbPath: templateEnabled ? selectedNuanmbPath : null` (checkbox "Preserve groups from selected NUANMB", default ON, disabled with tooltip-text when no `selectedNuanmbPath`), `rigBindingPolicy` from a two-option select (default `exactHierarchy`).
  6. Success: report card (frames/duration, matched/ignored counts, preserved groups, warnings, output path), `toast.success`, call `onImported(report.outputPath)`.
  7. Failure: inline `role="alert"` + `toast.error` with the exact backend string.

  Context addition in `SsbhModelPreviewContext.tsx` (additive only — do not touch other hunks): implement `loadMotionNuanmbPath` next to `pickMotionNuanmbFile`, add to the context type, the `value` object, and the deps arrays:

```ts
const loadMotionNuanmbPath = useCallback(
  (path: string) => {
    const activeId = resolvedActivePreviewInstanceId;
    if (!activeId) {
      throw new Error("No active preview instance.");
    }
    setMotionByInstanceId((prev) => {
      const current = prev[activeId] ?? createDefaultMotionState();
      const nuanmbPaths = current.nuanmbPaths.includes(path)
        ? current.nuanmbPaths
        : [...current.nuanmbPaths, path];
      return {
        ...prev,
        [activeId]: {
          ...current,
          nuanmbPaths,
          selectedNuanmbPath: path,
          poseEnabled: false,
          frame: 0,
          playing: false,
          clip: null,
          sample: null,
          sampleError: null,
          attemptedManifestPath: null,
          attemptedClipKey: null,
        },
      };
    });
  },
  [resolvedActivePreviewInstanceId],
);
```

  Mount in `SsbhModelPreviewMotionPanel.tsx` under the export panel:

```tsx
<MotionFbxImportPanel
  skeletonPath={activeInstance?.bundle.skelPath ?? null}
  selectedNuanmbPath={p.motionSelectedNuanmbPath}
  workspaceRoot={p.workspaceRoot}
  disabled={p.previewBusy}
  onImported={p.loadMotionNuanmbPath}
/>
```

  Update the export panel copy: replace "One-way only; no NUANMB import." with "Edit it in a DCC, then bring it back below via Import FBX."

- [ ] **Step 4: Run** — `npx vitest run src/components/ssbh-model-preview/components/MotionFbxImportPanel.test.tsx` → PASS; also `npx vitest run src/components/ssbh-model-preview/components/MotionFbxExportPanel.test.tsx` (copy change must not break it).

- [ ] **Step 5: Commit**

```powershell
git add src/components/ssbh-model-preview src/utils/dialogLastPath.ts
git commit -m "feat(motion): MotionFbxImport panel with ImportPreview"
```

---

### Task 6: BatchMotionExport panel

**Files:**
- Create: `src/components/ssbh-model-preview/components/MotionBatchExportPanel.tsx`
- Create: `src/components/ssbh-model-preview/components/MotionBatchExportPanel.test.tsx`
- Modify: `src/components/ssbh-model-preview/SsbhModelPreviewMotionPanel.tsx` (mount when `p.motionNuanmbPaths.length > 1`)
- Modify: `src/utils/dialogLastPath.ts` (key `ssbhMotionBatchExportDir`)

**Interfaces:**
- Consumes: `exportCompleteMotionFbx`, `getBlender51PathOverride` from `../motionFbxExportService`.
- Produces: `MotionBatchExportPanel` with props `{ nuanmbPaths: string[]; skeletonPath: string | null; numdlbPath: string | null; workspaceRoot: string | null; disabled: boolean }`.

- [ ] **Step 1: Failing Vitest** (same mock pattern; mock `../motionFbxExportService` directly):

```tsx
vi.mock("../motionFbxExportService", () => ({
  exportCompleteMotionFbx: exportMock,
  getBlender51PathOverride: () => null,
}));
```

Tests:
1. "exports every selected clip sequentially into the chosen directory" — `openMock` (directory picker) resolves `"E:\\batch"`; `exportMock` resolves per call; click "Export all to folder"; assert `exportMock` called once per path with `outputFbxPath` = `E:\batch\{stem}.fbx` and success summary rendered (`2 exported, 0 failed`).
2. "collects per-clip failures and continues" — first `exportMock` call rejects with `new Error("staging write failed")`, second resolves; assert both were attempted and summary shows `1 exported, 1 failed` with the failing stem listed.
3. "aborts remaining clips when Blender resolve fails" — first call rejects with `new Error("Blender 5.1 was not found")`; assert `exportMock` called exactly once and an alert mentions Blender.

- [ ] **Step 2: Run** — FAIL (component missing).

- [ ] **Step 3: Implement panel.** State: `selected: Set<string>` initialized to all paths (checkbox list, compact, max-height scroll), `running`, `progress: { done: number; total: number; current: string | null }`, `results: { path: string; error: string | null }[]`. Run loop:

```ts
const runBatch = useCallback(async () => {
  if (!skeletonPath || !numdlbPath || selected.size === 0) return;
  const outputDir = await open({
    directory: true,
    multiple: false,
    defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhMotionBatchExportDir, workspaceRoot),
  });
  if (typeof outputDir !== "string" || !outputDir.trim()) return;
  rememberDialogSelection(DialogLastPathKey.ssbhMotionBatchExportDir, outputDir, "directory");
  const targets = nuanmbPaths.filter((path) => selected.has(path));
  const sep = outputDir.includes("\\") ? "\\" : "/";
  const collected: { path: string; error: string | null }[] = [];
  setRunning(true);
  setResults([]);
  try {
    for (const [index, nuanmbPath] of targets.entries()) {
      setProgress({ done: index, total: targets.length, current: nuanmbPath });
      try {
        await exportCompleteMotionFbx({
          nuanmbPath,
          nusktbPath: skeletonPath,
          numdlbPath,
          outputFbxPath: `${outputDir.replace(/[/\\]+$/, "")}${sep}${nuanmbStem(nuanmbPath)}.fbx`,
          blenderPath: getBlender51PathOverride(),
          actionName: null,
        });
        collected.push({ path: nuanmbPath, error: null });
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
        collected.push({ path: nuanmbPath, error: message });
        if (/blender/i.test(message)) {
          // Same executable for every clip: a resolve failure would fail all.
          break;
        }
      }
    }
  } finally {
    setResults(collected);
    setProgress(null);
    setRunning(false);
  }
}, [nuanmbPaths, numdlbPath, selected, skeletonPath, workspaceRoot]);
```

Summary line: `{ok} exported, {failed} failed` + per-failure rows; alert row when aborted on a Blender error.

- [ ] **Step 4: Run** — `npx vitest run src/components/ssbh-model-preview/components/MotionBatchExportPanel.test.tsx` → PASS.

- [ ] **Step 5: Mount + commit**

```powershell
git add src/components/ssbh-model-preview src/utils/dialogLastPath.ts
git commit -m "feat(motion): batch CompleteMotionFbx export over motion folder clips"
```

---

### Task 7: MotionClipOpsPanel + verification sweep

**Files:**
- Create: `src/components/ssbh-model-preview/components/MotionClipOpsPanel.tsx` + `.test.tsx`
- Modify: `src/components/ssbh-model-preview/SsbhModelPreviewMotionPanel.tsx` (mount when a clip is selected)
- Modify: `src/components/ssbh-model-preview/motionFbxImportService.ts` (add `transformNuanmbClip` wrapper + `ClipOperationPayload` type)
- Modify: `src/utils/dialogLastPath.ts` (key `ssbhMotionClipOpsSave`)

**Interfaces:**
- Consumes: command `ssbh_transform_nuanmb_clip`; `MotionConversionReport` type from Task 5's service; context `loadMotionNuanmbPath`; the selected clip's frame count via `p.motionManifest?.finalFrameIndex`.
- Produces:

```ts
export type ClipOperationPayload =
  | { kind: "trim"; startFrame: number; endFrame: number }
  | { kind: "retime"; speedFactor: number };
export function transformNuanmbClip(request: {
  nuanmbPath: string;
  nusktbPath: string;
  outputNuanmbPath: string;
  operation: ClipOperationPayload;
}): Promise<MotionConversionReport>;
```

Panel props: `{ selectedNuanmbPath: string | null; skeletonPath: string | null; finalFrameIndex: number | null; workspaceRoot: string | null; disabled: boolean; onTransformed: (nuanmbPath: string) => void }`.

- [ ] **Step 1: Failing Vitest** — two tests:
1. "trims the selected clip through the transform command" — trim inputs prefilled `0` and `finalFrameIndex`; set end to `10`; save dialog resolves `E:\out\attack_trim.nuanmb`; assert invoke `ssbh_transform_nuanmb_clip` with `operation: { kind: "trim", startFrame: 0, endFrame: 10 }` and `onTransformed` called with the output path.
2. "rejects retime before invoking when the factor input is not positive" — set speed input to `0`; click Retime; assert `invokeMock` not called and an alert is shown.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement.** Small MayaSection "Clip tools": one row `Trim` (two number inputs + button, default `0`..`Math.floor(finalFrameIndex)`), one row `Speed` (number input default `1.0`, step `0.1`, button "Retime"). Both: client-side validation (trim `0 <= start <= end`, retime `factor > 0` and finite) with inline `role="alert"` on violation (backend still re-validates); save dialog default `{stem}_trim.nuanmb` / `{stem}_x{factor}.nuanmb` (key `ssbhMotionClipOpsSave`); success → toast + report line + `onTransformed(outputPath)` (wired to `p.loadMotionNuanmbPath`).

- [ ] **Step 4: Run** — `npx vitest run src/components/ssbh-model-preview/components/MotionClipOpsPanel.test.tsx` → PASS.

- [ ] **Step 5: Full verification sweep**

```powershell
cd src-tauri
cargo test --test ssbh_motion_fbx_import_test --no-fail-fast
cargo test --test ssbh_motion_interchange_test --no-fail-fast
cargo test --test ssbh_motion_fbx_export_test --no-fail-fast
cargo clippy --all-targets 2>&1 | Select-String "ssbh_motion" ; cargo fmt
cd ..
npx vitest run src/components/ssbh-model-preview/components/MotionFbxImportPanel.test.tsx src/components/ssbh-model-preview/components/MotionBatchExportPanel.test.tsx src/components/ssbh-model-preview/components/MotionClipOpsPanel.test.tsx src/components/ssbh-model-preview/components/MotionFbxExportPanel.test.tsx
npx tsc --noEmit
git diff --check
```

`tsc` has known pre-existing failures in `src/page/SceneEdit` — only new errors in touched motion files block; record any pre-existing noise in the commit body.

- [ ] **Step 6: Commit**

```powershell
git add src/components/ssbh-model-preview src/utils/dialogLastPath.ts
git commit -m "feat(motion): clip trim/retime tools in Motion panel"
```

## Progress Ledger

Controller maintains `.superpowers/sdd/progress.md` during SDD execution.
