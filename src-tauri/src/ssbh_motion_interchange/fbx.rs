use std::collections::HashMap;
use std::path::Path;

use glam::{Mat4, Quat, Vec3, Vec4};
use ssbh_data::anim_data::Transform;

use super::{
    validate_rig_binding, MotionBone, MotionClip, MotionFrame, MotionInterchangeError,
    MotionSkeleton, RigBindingPolicy, RigBindingReport, EXVS2_SAMPLE_RATE_HZ,
    MAX_MOTION_FRAME_COUNT,
};

pub(crate) fn read_motion_clip_fbx(
    fbx_path: &Path,
    reference: &MotionSkeleton,
    stack_name: Option<&str>,
    policy: RigBindingPolicy,
) -> Result<(MotionClip, RigBindingReport), MotionInterchangeError> {
    let path = fbx_path.to_str().ok_or_else(|| {
        MotionInterchangeError::Bridge(format!(
            "FBX path is not valid UTF-8: {}",
            fbx_path.display()
        ))
    })?;
    let source = ufbx::load_file(path, ufbx::LoadOpts::default()).map_err(|error| {
        MotionInterchangeError::Bridge(format!(
            "failed to load FBX {}: {} — {}",
            fbx_path.display(),
            error.description,
            error.info()
        ))
    })?;
    let stack = select_animation_stack(&source, stack_name)?;
    let candidate = skeleton_from_fbx(&source)?;
    let binding_report = validate_rig_binding(reference, &candidate, policy)?;
    let frame_count = sampled_frame_count(stack.time_begin, stack.time_end)?;
    let mut frames = Vec::with_capacity(frame_count);
    let mut previous_rotations: Vec<Option<Quat>> = vec![None; reference.bones.len()];
    for frame_index in 0..frame_count {
        let time = stack.time_begin + frame_index as f64 / EXVS2_SAMPLE_RATE_HZ as f64;
        let evaluated =
            ufbx::evaluate_scene(&source, &stack.anim, time, ufbx::EvaluateOpts::default())
                .map_err(|error| {
                    MotionInterchangeError::Bridge(format!(
                        "failed to evaluate FBX stack '{}' at frame {frame_index}: {} — {}",
                        stack.element.name,
                        error.description,
                        error.info()
                    ))
                })?;
        let mut local_transforms = Vec::with_capacity(reference.bones.len());
        for (bone_index, reference_bone) in reference.bones.iter().enumerate() {
            let node = evaluated
                .nodes
                .iter()
                .map(|node| node.as_ref())
                .find(|node| node.element.name == reference_bone.name.as_str())
                .ok_or_else(|| {
                    MotionInterchangeError::RigMismatch(format!(
                        "evaluated FBX is missing reference bone '{}'",
                        reference_bone.name
                    ))
                })?;
            let mut transform = transform_from_fbx_matrix(&node.node_to_parent)?;
            if let Some(previous) = previous_rotations[bone_index] {
                if previous.dot(transform.rotation) < 0.0 {
                    transform.rotation = -transform.rotation;
                }
            }
            previous_rotations[bone_index] = Some(transform.rotation);
            local_transforms.push(transform);
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

fn select_animation_stack<'a>(
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
                MotionInterchangeError::Bridge(format!(
                    "FBX animation stack '{requested_name}' was not found; available stacks: {available}"
                ))
            });
    }
    match scene.anim_stacks.len() {
        0 => Err(MotionInterchangeError::Bridge(
            "FBX contains no animation stacks".to_string(),
        )),
        1 => Ok(&scene.anim_stacks[0]),
        _ => Err(MotionInterchangeError::Bridge(format!(
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

fn sampled_frame_count(start_time: f64, end_time: f64) -> Result<usize, MotionInterchangeError> {
    if !start_time.is_finite() || !end_time.is_finite() || end_time < start_time {
        return Err(MotionInterchangeError::Bridge(format!(
            "invalid FBX animation range {start_time}..{end_time}"
        )));
    }
    let frame_count = ((end_time - start_time) * EXVS2_SAMPLE_RATE_HZ as f64).round() as usize + 1;
    if frame_count == 0 || frame_count > MAX_MOTION_FRAME_COUNT {
        return Err(MotionInterchangeError::Bridge(format!(
            "FBX animation has {frame_count} sampled frames; maximum is {MAX_MOTION_FRAME_COUNT}"
        )));
    }
    Ok(frame_count)
}

fn skeleton_from_fbx(scene: &ufbx::Scene) -> Result<MotionSkeleton, MotionInterchangeError> {
    let bone_nodes: Vec<&ufbx::Node> = scene
        .nodes
        .iter()
        .map(|node| node.as_ref())
        .filter(|node| node.bone.is_some())
        .collect();
    let mut indices = HashMap::with_capacity(bone_nodes.len());
    for (index, node) in bone_nodes.iter().enumerate() {
        if indices.insert(node.element.name.as_ref(), index).is_some() {
            return Err(MotionInterchangeError::RigMismatch(format!(
                "FBX contains duplicate bone '{}'",
                node.element.name
            )));
        }
    }
    let bones = bone_nodes
        .iter()
        .map(|node| {
            let parent_index = node.parent.as_ref().and_then(|parent| {
                parent
                    .bone
                    .is_some()
                    .then(|| indices.get(parent.element.name.as_ref()).copied())
                    .flatten()
            });
            Ok(MotionBone {
                name: node.element.name.to_string(),
                parent_index,
                rest_local: transform_from_fbx_matrix(&node.node_to_parent)?,
            })
        })
        .collect::<Result<Vec<_>, MotionInterchangeError>>()?;
    Ok(MotionSkeleton { bones })
}

fn transform_from_fbx_matrix(matrix: &ufbx::Matrix) -> Result<Transform, MotionInterchangeError> {
    let local = Mat4::from_cols(
        Vec4::new(matrix.m00 as f32, matrix.m10 as f32, matrix.m20 as f32, 0.0),
        Vec4::new(matrix.m01 as f32, matrix.m11 as f32, matrix.m21 as f32, 0.0),
        Vec4::new(matrix.m02 as f32, matrix.m12 as f32, matrix.m22 as f32, 0.0),
        Vec4::new(matrix.m03 as f32, matrix.m13 as f32, matrix.m23 as f32, 1.0),
    );
    let (scale, rotation, translation) = local.to_scale_rotation_translation();
    let rotation = Quat::from_xyzw(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
    if !scale.is_finite() || !translation.is_finite() || !rotation.is_finite() {
        return Err(MotionInterchangeError::Bridge(
            "FBX node transform contains a non-finite value".to_string(),
        ));
    }
    Ok(Transform {
        scale: Vec3::from_array(scale.to_array()),
        rotation,
        translation: Vec3::from_array(translation.to_array()),
    })
}
