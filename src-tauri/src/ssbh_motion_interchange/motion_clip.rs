use std::collections::HashSet;

use ssbh_data::anim_data::Transform;

use super::MotionInterchangeError;

pub const EXVS2_SAMPLE_RATE_HZ: u32 = 60;
pub const MAX_MOTION_FRAME_COUNT: usize = 3_600;

#[derive(Debug, Clone, PartialEq)]
pub struct MotionClip {
    pub name: String,
    pub sample_rate_hz: u32,
    pub skeleton: MotionSkeleton,
    pub frames: Vec<MotionFrame>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MotionSkeleton {
    pub bones: Vec<MotionBone>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MotionBone {
    pub name: String,
    pub parent_index: Option<usize>,
    pub rest_local: Transform,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MotionFrame {
    pub local_transforms: Vec<Transform>,
}

impl MotionClip {
    pub fn validate(&self) -> Result<(), MotionInterchangeError> {
        if self.name.trim().is_empty() {
            return Err(MotionInterchangeError::InvalidClip(
                "name must not be empty".to_string(),
            ));
        }
        if self.sample_rate_hz != EXVS2_SAMPLE_RATE_HZ {
            return Err(MotionInterchangeError::InvalidClip(format!(
                "sample rate must be {EXVS2_SAMPLE_RATE_HZ} Hz"
            )));
        }
        if self.frames.is_empty() || self.frames.len() > MAX_MOTION_FRAME_COUNT {
            return Err(MotionInterchangeError::InvalidClip(format!(
                "frame count must be between 1 and {MAX_MOTION_FRAME_COUNT}"
            )));
        }
        validate_skeleton(&self.skeleton)?;
        for frame in &self.frames {
            if frame.local_transforms.len() != self.skeleton.bones.len() {
                return Err(MotionInterchangeError::InvalidClip(format!(
                    "frame bone count {} does not match skeleton bone count {}",
                    frame.local_transforms.len(),
                    self.skeleton.bones.len()
                )));
            }
            for transform in &frame.local_transforms {
                validate_transform(transform)?;
            }
        }
        Ok(())
    }
}

fn validate_skeleton(skeleton: &MotionSkeleton) -> Result<(), MotionInterchangeError> {
    if skeleton.bones.is_empty() {
        return Err(MotionInterchangeError::InvalidClip(
            "skeleton must contain at least one bone".to_string(),
        ));
    }
    let mut names = HashSet::with_capacity(skeleton.bones.len());
    for (index, bone) in skeleton.bones.iter().enumerate() {
        let name = bone.name.trim();
        if name.is_empty() {
            return Err(MotionInterchangeError::InvalidClip(format!(
                "bone {index} has an empty name"
            )));
        }
        if !names.insert(name) {
            return Err(MotionInterchangeError::InvalidClip(format!(
                "duplicate bone name '{name}'"
            )));
        }
        if let Some(parent_index) = bone.parent_index {
            if parent_index >= skeleton.bones.len() || parent_index == index {
                return Err(MotionInterchangeError::InvalidClip(format!(
                    "bone '{name}' has invalid parent index {parent_index}"
                )));
            }
        }
        validate_transform(&bone.rest_local)?;
    }
    ensure_acyclic_parents(skeleton)
}

fn ensure_acyclic_parents(skeleton: &MotionSkeleton) -> Result<(), MotionInterchangeError> {
    for start in 0..skeleton.bones.len() {
        let mut visited = HashSet::new();
        let mut current = Some(start);
        while let Some(index) = current {
            if !visited.insert(index) {
                return Err(MotionInterchangeError::InvalidClip(format!(
                    "bone hierarchy contains a cycle at '{}'",
                    skeleton.bones[index].name
                )));
            }
            current = skeleton.bones[index].parent_index;
        }
    }
    Ok(())
}

fn validate_transform(transform: &Transform) -> Result<(), MotionInterchangeError> {
    if !transform.scale.is_finite()
        || !transform.translation.is_finite()
        || !transform.rotation.is_finite()
    {
        return Err(MotionInterchangeError::InvalidClip(
            "transform contains a non-finite value".to_string(),
        ));
    }
    let length_squared = transform.rotation.length_squared();
    if (length_squared - 1.0).abs() > 1.0e-3 {
        return Err(MotionInterchangeError::InvalidClip(format!(
            "rotation quaternion must be normalized, got length squared {length_squared}"
        )));
    }
    Ok(())
}
