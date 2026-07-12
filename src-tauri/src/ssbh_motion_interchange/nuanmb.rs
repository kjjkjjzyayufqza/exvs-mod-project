use std::path::Path;

use glam::{Quat, Vec3};
use ssbh_data::{
    anim_data::{
        AnimData, GroupData, GroupType, NodeData, TrackData, TrackValues, Transform, TransformFlags,
    },
    skel_data::SkelData,
};

use super::{
    MotionBone, MotionClip, MotionFrame, MotionInterchangeError, MotionSkeleton,
    MAX_MOTION_FRAME_COUNT,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NuanmbWriteReport {
    pub output_path: std::path::PathBuf,
    pub frame_count: usize,
    pub preserved_non_transform_group_count: usize,
}

pub fn read_nuanmb_as_motion_clip(
    animation_path: &Path,
    skeleton_path: &Path,
    name: String,
) -> Result<MotionClip, MotionInterchangeError> {
    ensure_extension(animation_path, "nuanmb")?;
    ensure_extension(skeleton_path, "nusktb")?;
    let animation = AnimData::from_file(animation_path).map_err(|error| {
        MotionInterchangeError::Nuanmb(format!(
            "failed to read {}: {error}",
            animation_path.display()
        ))
    })?;
    let skeleton = SkelData::from_file(skeleton_path).map_err(|error| {
        MotionInterchangeError::Nuanmb(format!(
            "failed to read {}: {error}",
            skeleton_path.display()
        ))
    })?;
    let frame_count = animation.final_frame_index.floor() as usize + 1;
    if frame_count == 0 || frame_count > MAX_MOTION_FRAME_COUNT {
        return Err(MotionInterchangeError::InvalidClip(format!(
            "NUANMB frame count must be between 1 and {MAX_MOTION_FRAME_COUNT}, found {frame_count}"
        )));
    }

    let motion_skeleton = motion_skeleton_from_ssbh(&skeleton);
    let mut frames = Vec::with_capacity(frame_count);
    for frame in 0..frame_count {
        let sampled =
            crate::ssbh_motion::sample_motion_frame_data(&skeleton, &animation, None, frame as f32);
        frames.push(MotionFrame {
            local_transforms: sampled
                .bone_locals
                .into_iter()
                .map(|sample| Transform {
                    scale: Vec3::from_array(sample.scale),
                    rotation: Quat::from_array(sample.rotation),
                    translation: Vec3::from_array(sample.translation),
                })
                .collect(),
        });
    }

    let clip = MotionClip {
        name,
        sample_rate_hz: super::EXVS2_SAMPLE_RATE_HZ,
        skeleton: motion_skeleton,
        frames,
    };
    clip.validate()?;
    Ok(clip)
}

pub fn read_motion_skeleton(
    skeleton_path: &Path,
) -> Result<MotionSkeleton, MotionInterchangeError> {
    ensure_extension(skeleton_path, "nusktb")?;
    let skeleton = SkelData::from_file(skeleton_path).map_err(|error| {
        MotionInterchangeError::Nuanmb(format!(
            "failed to read {}: {error}",
            skeleton_path.display()
        ))
    })?;
    let motion_skeleton = motion_skeleton_from_ssbh(&skeleton);
    let clip = MotionClip {
        name: "skeleton_validation".to_string(),
        sample_rate_hz: super::EXVS2_SAMPLE_RATE_HZ,
        skeleton: motion_skeleton.clone(),
        frames: vec![MotionFrame {
            local_transforms: motion_skeleton
                .bones
                .iter()
                .map(|bone| bone.rest_local)
                .collect(),
        }],
    };
    clip.validate()?;
    Ok(motion_skeleton)
}

fn motion_skeleton_from_ssbh(skeleton: &SkelData) -> MotionSkeleton {
    MotionSkeleton {
        bones: skeleton
            .bones
            .iter()
            .map(|bone| {
                let (scale, rotation, translation) = bone.transform.to_scale_rotation_translation();
                MotionBone {
                    name: bone.name.clone(),
                    parent_index: bone.parent_index,
                    rest_local: Transform {
                        scale,
                        rotation,
                        translation,
                    },
                }
            })
            .collect(),
    }
}

pub fn write_motion_clip_as_nuanmb(
    clip: &MotionClip,
    template_path: Option<&Path>,
    output_path: &Path,
) -> Result<NuanmbWriteReport, MotionInterchangeError> {
    clip.validate()?;
    ensure_extension(output_path, "nuanmb")?;
    if template_path.is_some_and(|template| template == output_path) {
        return Err(MotionInterchangeError::Nuanmb(
            "output path must differ from the template path".to_string(),
        ));
    }
    let transform_group = transform_group_from_clip(clip);
    let (groups, preserved_non_transform_group_count) = if let Some(template_path) = template_path {
        ensure_extension(template_path, "nuanmb")?;
        let template = AnimData::from_file(template_path).map_err(|error| {
            MotionInterchangeError::Nuanmb(format!(
                "failed to read template {}: {error}",
                template_path.display()
            ))
        })?;
        merge_transform_group(template.groups, transform_group)
    } else {
        (vec![transform_group], 0)
    };
    let animation = AnimData {
        major_version: 1,
        minor_version: 2,
        final_frame_index: (clip.frames.len() - 1) as f32,
        groups,
    };
    // The residual v1.2 path is not semantically safe for every real sparse rig:
    // property sparsification/compression can make a sampled channel fall back
    // to skeleton rest on readback. The default v1.2 writer emits explicit
    // constant/raw streams for every MotionClip channel.
    let encoded = animation.to_anim_uncompressed().map_err(|error| {
        MotionInterchangeError::Nuanmb(format!("failed to encode EXVS2 Anim v1.2: {error}"))
    })?;
    encoded.write_to_file(output_path).map_err(|error| {
        MotionInterchangeError::Nuanmb(format!(
            "failed to write {}: {error}",
            output_path.display()
        ))
    })?;
    Ok(NuanmbWriteReport {
        output_path: output_path.to_path_buf(),
        frame_count: clip.frames.len(),
        preserved_non_transform_group_count,
    })
}

fn transform_group_from_clip(clip: &MotionClip) -> GroupData {
    GroupData {
        group_type: GroupType::Transform,
        nodes: clip
            .skeleton
            .bones
            .iter()
            .enumerate()
            .map(|(bone_index, bone)| NodeData {
                name: bone.name.clone(),
                tracks: vec![TrackData {
                    name: "Transform".to_string(),
                    compensate_scale: false,
                    transform_flags: TransformFlags::default(),
                    values: TrackValues::Transform(
                        clip.frames
                            .iter()
                            .map(|frame| frame.local_transforms[bone_index])
                            .collect(),
                    ),
                }],
            })
            .collect(),
    }
}

fn merge_transform_group(
    template_groups: Vec<GroupData>,
    transform_group: GroupData,
) -> (Vec<GroupData>, usize) {
    let mut groups = Vec::with_capacity(template_groups.len().max(1));
    let mut inserted_transform_group = false;
    let mut preserved_non_transform_group_count = 0;
    for group in template_groups {
        if group.group_type == GroupType::Transform {
            if !inserted_transform_group {
                groups.push(transform_group.clone());
                inserted_transform_group = true;
            }
            continue;
        }
        preserved_non_transform_group_count += 1;
        groups.push(group);
    }
    if !inserted_transform_group {
        groups.push(transform_group);
    }
    (groups, preserved_non_transform_group_count)
}

fn ensure_extension(path: &Path, expected: &str) -> Result<(), MotionInterchangeError> {
    let actual = path.extension().and_then(|extension| extension.to_str());
    if actual.is_some_and(|extension| extension.eq_ignore_ascii_case(expected)) {
        return Ok(());
    }
    Err(MotionInterchangeError::Nuanmb(format!(
        "expected a .{expected} file, found {}",
        path.display()
    )))
}
