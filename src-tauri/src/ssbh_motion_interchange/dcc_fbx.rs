use std::collections::HashMap;
use std::path::Path;

use glam::{Mat4, Quat, Vec3, Vec4};
use serde::Serialize;
use ssbh_data::anim_data::Transform;

use super::{
    MotionBone, MotionClip, MotionFrame, MotionInterchangeError, MotionSkeleton, RigBindingPolicy,
    RigBindingReport, EXVS2_SAMPLE_RATE_HZ, MAX_MOTION_FRAME_COUNT,
};

/// Canonicalize a DCC node name: strip `a|b|c` path segments then `ns:` prefixes.
pub(crate) fn canonical_bone_name(raw: &str) -> &str {
    let path_trimmed = raw.rsplit('|').next().unwrap_or(raw);
    path_trimmed.rsplit(':').next().unwrap_or(path_trimmed)
}

/// Load a DCC FBX in raw file space (no ufbx axis/unit retargeting).
///
/// NUANMB bone locals are game space by definition, and our own FBX writer
/// stores exactly those values while declaring non-standard GlobalSettings
/// axis signs; asking ufbx for target axes would inject a spurious root
/// conversion. DccSpaceNormalize is therefore implemented purely by
/// `rebase_reference_locals`, which folds any helper-object transform chain
/// (Blender Armature object, DCC unit/axis carriers) into root-bone locals.
/// The gated Blender 5.1 round-trip test is the empirical ground truth.
pub(crate) fn load_dcc_fbx(path: &Path) -> Result<ufbx::SceneRoot, MotionInterchangeError> {
    let utf8 = path.to_str().ok_or_else(|| {
        MotionInterchangeError::Import(format!("FBX path is not valid UTF-8: {}", path.display()))
    })?;
    ufbx::load_file(utf8, ufbx::LoadOpts::default()).map_err(|error| {
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
        bone_names: candidate
            .bones
            .iter()
            .map(|bone| bone.name.clone())
            .collect(),
        stacks,
    })
}

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
            let mut ancestor: Option<&ufbx::Node> = node.parent.as_deref();
            let parent_index = loop {
                match ancestor {
                    Some(parent) if parent.bone.is_some() => {
                        break indices
                            .get(canonical_bone_name(parent.element.name.as_ref()))
                            .copied();
                    }
                    Some(parent) => ancestor = parent.parent.as_deref(),
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
            node_index_by_canonical
                .get(bone.name.as_str())
                .copied()
                .ok_or_else(|| {
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

    fn identity_transform() -> Transform {
        Transform {
            scale: Vec3::ONE,
            rotation: Quat::IDENTITY,
            translation: Vec3::ZERO,
        }
    }

    fn two_bone_reference() -> MotionSkeleton {
        MotionSkeleton {
            bones: vec![
                MotionBone {
                    name: "ROOT".to_string(),
                    parent_index: None,
                    rest_local: identity_transform(),
                },
                MotionBone {
                    name: "HAND".to_string(),
                    parent_index: Some(0),
                    rest_local: Transform {
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
        let helper =
            Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2) * Mat4::from_scale(Vec3::splat(0.5));
        let worlds = vec![helper * root_world, helper * root_world * hand_local];

        let locals = rebase_reference_locals(&reference, &worlds).unwrap();

        // Child local is exactly the bone-to-parent transform, helper cancelled.
        assert!(locals[1]
            .translation
            .abs_diff_eq(Vec3::new(5.0, 0.0, 0.0), 1.0e-4));
        assert!(locals[1].scale.abs_diff_eq(Vec3::ONE, 1.0e-4));
        // Root local carries the helper (scale 0.5, rotated translation).
        assert!(locals[0].scale.abs_diff_eq(Vec3::splat(0.5), 1.0e-4));
        assert!(locals[0]
            .translation
            .abs_diff_eq(Vec3::new(0.0, 0.0, 1.0), 1.0e-4));
    }

    #[test]
    fn rebase_rejects_mismatched_world_count() {
        let reference = two_bone_reference();
        let error = rebase_reference_locals(&reference, &[Mat4::IDENTITY])
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("does not match"),
            "unexpected error: {error}"
        );
    }
}
