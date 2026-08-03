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
    Trim {
        start_frame: usize,
        end_frame: usize,
    },
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
///
/// Write-back uses `write_motion_clip_as_nuanmb`, which **never** re-emits
/// `ATH_*` helper Transform nodes (homemade motions must not convert ATH).
/// See `docs/nuanmb-ath-helper-bone-policy.md`.
pub fn transform_nuanmb_clip(
    request: NuanmbClipTransformRequest,
) -> Result<MotionConversionReport, MotionInterchangeError> {
    let nuanmb_path = required_ops_path(&request.nuanmb_path, "nuanmb_path")?;
    let skeleton_path = required_ops_path(&request.nusktb_path, "nusktb_path")?;
    let output_path = required_ops_path(&request.output_nuanmb_path, "output_nuanmb_path")?;
    if output_path == nuanmb_path || output_path == skeleton_path {
        return Err(MotionInterchangeError::InvalidClip(
            "output_nuanmb_path must differ from every input path".to_string(),
        ));
    }
    let source_name = nuanmb_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("clip")
        .to_string();
    // ATH_* tracks are never re-emitted on write (nuanmb ATH policy).
    let clip = read_nuanmb_as_motion_clip(&nuanmb_path, &skeleton_path, source_name)?;
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
