use std::path::Path;

use glam::{Quat, Vec3};
use ssbh_data::{
    anim_data::{
        AnimData, GroupData, GroupType, NodeData, TrackData, TrackValues, Transform,
        TransformFlags, UvTransform,
    },
    skel_data::SkelData,
};
use ssbh_lib::formats::anim::{Anim, Property, TrackTypeV1, TrackV1};
use ssbh_lib::SsbhByteBuffer;

use super::{
    MotionBone, MotionClip, MotionFrame, MotionInterchangeError, MotionSkeleton,
    MAX_MOTION_FRAME_COUNT,
};

/// Near-constant threshold for hold snapping (rotation uses 1 - |dot|).
const HOLD_EPS_T: f32 = 1.0e-4;
const HOLD_EPS_R: f32 = 1.0e-4;
const HOLD_EPS_S: f32 = 1.0e-4;

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

/// Default NUANMB write: omit `ATH_*` helper Transform nodes (host Body/wing).
/// Extra / Part clips pass [`NuanmbWriteOptions::omit_ath_helper_bones`] =
/// `false`. See `docs/nuanmb-ath-helper-bone-policy.md`.
#[derive(Debug, Clone, Copy)]
pub struct NuanmbWriteOptions {
    pub omit_ath_helper_bones: bool,
}

impl Default for NuanmbWriteOptions {
    fn default() -> Self {
        Self {
            omit_ath_helper_bones: true,
        }
    }
}

/// Write a `MotionClip` as an EXVS2 Anim v1.2 NUANMB (**uncompressed only**).
///
/// **ATH policy (default):** host Body / host wing homemade clips **omit**
/// `ATH_*` Transform nodes. Extra / Part clips may keep them via
/// [`write_motion_clip_as_nuanmb_with_options`]. See
/// `docs/nuanmb-ath-helper-bone-policy.md` and [`is_ath_helper_bone`].
///
/// **In-game layout (Import FBX path):** stock body clips always carry
/// `CompensateScale` + `Visibility` on Transform tracks. `ssbh_data`'s
/// `to_anim_uncompressed` omits both, which previews fine but misbehaves in
/// EXVS2. This writer emits dense **Scale + Rotate + Translate on every
/// Transform bone** (including limbs — product policy does **not** omit limb
/// Translate) and adds CompScale/Visibility. Near-constant channels snap to
/// constant headers (`0x4003` / `0x3003`); multi-frame uses raw streams only
/// (indexed `0x4300` / `0x3300`) — never residual `0x3409` / `0x4409`.
pub fn write_motion_clip_as_nuanmb(
    clip: &MotionClip,
    template_path: Option<&Path>,
    output_path: &Path,
) -> Result<NuanmbWriteReport, MotionInterchangeError> {
    write_motion_clip_as_nuanmb_with_options(
        clip,
        template_path,
        output_path,
        NuanmbWriteOptions::default(),
    )
}

pub fn write_motion_clip_as_nuanmb_with_options(
    clip: &MotionClip,
    template_path: Option<&Path>,
    output_path: &Path,
    options: NuanmbWriteOptions,
) -> Result<NuanmbWriteReport, MotionInterchangeError> {
    clip.validate()?;
    ensure_extension(output_path, "nuanmb")?;
    // Template may equal output: load template fully into memory first, then
    // overwrite the file (re-import / overwrite selected motion).
    let transform_group = transform_group_from_clip(clip, options.omit_ath_helper_bones);
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
    // Header name (Anim::V12.name ≈ file offset 0x50 on EXVS2 assets) is optional
    // in ssbh_data. We always set it from the output disk file name so tools and
    // in-game lists match game originals (e.g. `主射CSA.nuanmb`).
    let animation = AnimData {
        major_version: 1,
        minor_version: 2,
        name: ssbh_data::anim_data::disk_anim_name_from_path(output_path),
        final_frame_index: (clip.frames.len() - 1) as f32,
        groups,
    };
    write_anim_data_exvs2_uncompressed(&animation, output_path)?;
    Ok(NuanmbWriteReport {
        output_path: output_path.to_path_buf(),
        frame_count: clip.frames.len(),
        preserved_non_transform_group_count,
    })
}

/// EXVS2 helper / attachment bones (`ATH_*`).
///
/// **Host Body / host wing (do not weaken):** omit the whole Transform node.
/// Extra / Part clips may keep ATH when the import checkbox is unchecked.
/// Canonical doc: `docs/nuanmb-ath-helper-bone-policy.md`.
///
/// Match is on the leaf name after `|` / `:` stripping; prefix `ATH_` is
/// case-insensitive.
pub(crate) fn is_ath_helper_bone(name: &str) -> bool {
    let path_trimmed = name.rsplit('|').next().unwrap_or(name);
    let leaf = path_trimmed.rsplit(':').next().unwrap_or(path_trimmed);
    leaf.len() >= 4 && leaf.as_bytes()[..4].eq_ignore_ascii_case(b"ATH_")
}

/// Build the Transform group for a clip.
///
/// When `omit_ath_helper_bones` is true (host Body default), `ATH_*` nodes are
/// skipped (see [`is_ath_helper_bone`]). Skeleton bone indices stay aligned
/// with `frame.local_transforms` so filtered helpers do not shift sampling of
/// remaining bones.
fn transform_group_from_clip(clip: &MotionClip, omit_ath_helper_bones: bool) -> GroupData {
    GroupData {
        group_type: GroupType::Transform,
        nodes: clip
            .skeleton
            .bones
            .iter()
            .enumerate()
            // Keep original bone_index so frame samples stay aligned with the
            // full skeleton even when ATH_* helpers are omitted from the group.
            .filter(|(_, bone)| !omit_ath_helper_bones || !is_ath_helper_bone(&bone.name))
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

/// EXVS2 Anim v1.2 writer: uncompressed property streams + stock CompScale/Visibility.
fn write_anim_data_exvs2_uncompressed(
    data: &AnimData,
    output_path: &Path,
) -> Result<(), MotionInterchangeError> {
    let mut tracks = Vec::new();
    let mut buffers = Vec::new();

    for group in &data.groups {
        for node in &group.nodes {
            for track in &node.tracks {
                let mut properties = Vec::new();
                match (&track.values, group.group_type) {
                    (TrackValues::Transform(vals), GroupType::Transform) if !vals.is_empty() => {
                        encode_transform_track_exvs2(vals, &mut properties, &mut buffers)?;
                    }
                    (TrackValues::Boolean(vals), GroupType::Visibility) if !vals.is_empty() => {
                        let data = encode_bool_uncompressed(vals)?;
                        push_property(&mut properties, &mut buffers, "Visibility", data);
                    }
                    (TrackValues::UvTransform(vals), GroupType::Material) if !vals.is_empty() => {
                        let data = encode_uv_uncompressed(vals)?;
                        push_property(&mut properties, &mut buffers, "UvTransform", data);
                    }
                    _ => {
                        // Skip empty / unsupported combinations (no 0x0000 placeholders).
                        continue;
                    }
                }
                if properties.is_empty() {
                    continue;
                }
                let track_type = match group.group_type {
                    GroupType::Transform => TrackTypeV1::Transform,
                    GroupType::Visibility => TrackTypeV1::Visibility,
                    GroupType::Material => TrackTypeV1::UvTransform,
                    _ => {
                        return Err(MotionInterchangeError::Nuanmb(format!(
                            "unsupported Anim v1.2 group type for track '{}'",
                            track.name
                        )));
                    }
                };
                tracks.push(TrackV1 {
                    name: node.name.as_str().into(),
                    track_type,
                    properties: properties.into(),
                });
            }
        }
    }

    let end_frame = data.final_frame_index.max(0.0);
    let name = ssbh_data::anim_data::disk_anim_name_from_path(output_path)
        .unwrap_or_else(|| "animation".to_string());
    let anim = Anim::V12 {
        name: name.as_str().into(),
        // EXVS2 dual-field header: unk1 = duration seconds, final_frame_index = 60 FPS
        // timebase, unk2 = end frame index.
        unk1: end_frame / 60.0,
        final_frame_index: 60.0,
        unk2: end_frame,
        unk3: 0.0,
        tracks: tracks.into(),
        buffers: buffers.into(),
    };
    anim.write_to_file(output_path).map_err(|error| {
        MotionInterchangeError::Nuanmb(format!(
            "failed to write {}: {error}",
            output_path.display()
        ))
    })
}

fn encode_transform_track_exvs2(
    vals: &[Transform],
    properties: &mut Vec<Property>,
    buffers: &mut Vec<SsbhByteBuffer>,
) -> Result<(), MotionInterchangeError> {
    let scales: Vec<Vec3> = vals.iter().map(|t| t.scale).collect();
    let rotations: Vec<Quat> = vals.iter().map(|t| t.rotation).collect();
    let translations: Vec<Vec3> = vals.iter().map(|t| t.translation).collect();

    // Property order: CompensateScale → Scale → Rotate → Translate → Visibility.
    // Product policy: **always** write Translate (every bone, including limbs).
    // Do not gate Translate on GBL_RT / CENTER_RT / BASE — full dense T is required.
    push_property(
        properties,
        buffers,
        "CompensateScale",
        encode_u16_1013(0x0000),
    );
    push_property(
        properties,
        buffers,
        "Scale",
        encode_vec3_uncompressed(&scales)?,
    );
    push_property(
        properties,
        buffers,
        "Rotate",
        encode_quat_uncompressed(&rotations)?,
    );
    push_property(
        properties,
        buffers,
        "Translate",
        encode_vec3_uncompressed(&translations)?,
    );
    push_property(properties, buffers, "Visibility", encode_u16_1013(0x7FFF));
    Ok(())
}

fn push_property(
    properties: &mut Vec<Property>,
    buffers: &mut Vec<SsbhByteBuffer>,
    name: &str,
    data: Vec<u8>,
) {
    buffers.push(SsbhByteBuffer { elements: data });
    properties.push(Property {
        name: name.into(),
        buffer_index: (buffers.len() - 1) as u64,
    });
}

fn encode_u16_1013(value: u16) -> Vec<u8> {
    let mut data = Vec::with_capacity(6);
    data.extend_from_slice(&0x1013u32.to_le_bytes());
    data.extend_from_slice(&value.to_le_bytes());
    data
}

fn vec3_is_hold(values: &[Vec3], eps: f32) -> bool {
    if values.is_empty() {
        return true;
    }
    let a0 = values[0];
    values.iter().all(|v| {
        (v.x - a0.x).abs() <= eps && (v.y - a0.y).abs() <= eps && (v.z - a0.z).abs() <= eps
    })
}

fn quat_is_hold(values: &[Quat], eps_one_minus_abs_dot: f32) -> bool {
    if values.is_empty() {
        return true;
    }
    let a0 = values[0].normalize();
    values.iter().all(|q| {
        let q = q.normalize();
        let d = 1.0 - a0.dot(q).abs();
        d <= eps_one_minus_abs_dot
    })
}

fn encode_vec3_uncompressed(values: &[Vec3]) -> Result<Vec<u8>, MotionInterchangeError> {
    if values.is_empty() {
        return Err(MotionInterchangeError::Nuanmb(
            "empty Vector3 track".to_string(),
        ));
    }
    let mut data = Vec::new();
    if values.len() == 1 || vec3_is_hold(values, HOLD_EPS_T.max(HOLD_EPS_S)) {
        let v = values[0];
        data.extend_from_slice(&0x3003u32.to_le_bytes());
        data.extend_from_slice(&v.x.to_le_bytes());
        data.extend_from_slice(&v.y.to_le_bytes());
        data.extend_from_slice(&v.z.to_le_bytes());
        return Ok(data);
    }
    // Multi-frame raw indexed stream (uncompressed). Never residual 0x3409.
    let key_count = values.len();
    if key_count > u8::MAX as usize + 1 {
        return Err(MotionInterchangeError::Nuanmb(format!(
            "Vector3 track has {key_count} keys; max for 0x3300 is {}",
            u8::MAX as usize + 1
        )));
    }
    data.extend_from_slice(&0x3300u32.to_le_bytes());
    data.extend_from_slice(&(key_count as u32).to_le_bytes());
    data.extend_from_slice(&1.0f32.to_le_bytes());
    for i in 0..key_count {
        data.push(i as u8);
    }
    while data.len() % 4 != 0 {
        data.push(0);
    }
    for v in values {
        data.extend_from_slice(&v.x.to_le_bytes());
        data.extend_from_slice(&v.y.to_le_bytes());
        data.extend_from_slice(&v.z.to_le_bytes());
    }
    Ok(data)
}

fn encode_quat_uncompressed(values: &[Quat]) -> Result<Vec<u8>, MotionInterchangeError> {
    if values.is_empty() {
        return Err(MotionInterchangeError::Nuanmb(
            "empty Rotate track".to_string(),
        ));
    }
    let mut norms: Vec<Quat> = values
        .iter()
        .map(|q| {
            let m = q.length();
            if m > 1e-6 {
                *q / m
            } else {
                Quat::IDENTITY
            }
        })
        .collect();
    for i in 1..norms.len() {
        if norms[i - 1].dot(norms[i]) < 0.0 {
            norms[i] = -norms[i];
        }
    }

    let mut data = Vec::new();
    if norms.len() == 1 || quat_is_hold(&norms, HOLD_EPS_R) {
        // Hold pose: stock kamae-style constant 0x4003 (not multi-frame noise).
        let q = norms[0];
        data.extend_from_slice(&0x4003u32.to_le_bytes());
        data.extend_from_slice(&q.x.to_le_bytes());
        data.extend_from_slice(&q.y.to_le_bytes());
        data.extend_from_slice(&q.z.to_le_bytes());
        data.extend_from_slice(&q.w.to_le_bytes());
        return Ok(data);
    }

    // Multi-frame **indexed** 0x4300 (game-observed layout), never residual 0x4409.
    // Layout: u32 magic | u32 key_count | f32 unk1 | u8 indices[key_count] | align4 | key_count * vec4
    // (Dense 16-byte-header streams decode in ssbh_data but EXVS2 stock almost never uses them;
    //  mis-parsed multi-frame rotate is a strong match for "editor OK / in-game pose trash".)
    let key_count = norms.len();
    if key_count > u8::MAX as usize + 1 {
        return Err(MotionInterchangeError::Nuanmb(format!(
            "Rotate track has {key_count} keys; max for indexed 0x4300 is {}",
            u8::MAX as usize + 1
        )));
    }
    data.extend_from_slice(&0x4300u32.to_le_bytes());
    data.extend_from_slice(&(key_count as u32).to_le_bytes());
    data.extend_from_slice(&1.0f32.to_le_bytes()); // unk1
    for i in 0..key_count {
        data.push(i as u8);
    }
    while data.len() % 4 != 0 {
        data.push(0);
    }
    for q in &norms {
        data.extend_from_slice(&q.x.to_le_bytes());
        data.extend_from_slice(&q.y.to_le_bytes());
        data.extend_from_slice(&q.z.to_le_bytes());
        data.extend_from_slice(&q.w.to_le_bytes());
    }
    Ok(data)
}

fn encode_bool_uncompressed(values: &[bool]) -> Result<Vec<u8>, MotionInterchangeError> {
    if values.is_empty() {
        return Err(MotionInterchangeError::Nuanmb(
            "empty boolean track".to_string(),
        ));
    }
    let all_same = values.iter().all(|&v| v == values[0]);
    let mut data = Vec::new();
    if all_same || values.len() == 1 {
        data.extend_from_slice(&0x1013u32.to_le_bytes());
        let v: u16 = if values[0] { 0x7FFF } else { 0x0000 };
        data.extend_from_slice(&v.to_le_bytes());
        return Ok(data);
    }
    // Multi-frame: 0x1019 stream (same layout as ssbh_data uncompressed path).
    data.extend_from_slice(&0x1019u32.to_le_bytes());
    data.extend_from_slice(&(values.len() as u32).to_le_bytes());
    for &v in values {
        data.push(if v { 1 } else { 0 });
    }
    while data.len() % 4 != 0 {
        data.push(0);
    }
    Ok(data)
}

fn encode_uv_uncompressed(values: &[UvTransform]) -> Result<Vec<u8>, MotionInterchangeError> {
    if values.is_empty() {
        return Err(MotionInterchangeError::Nuanmb(
            "empty UvTransform track".to_string(),
        ));
    }
    // Constant-first: if all equal, 0x7003-style not standardized — use multi-frame raw 0x7000
    // layout matching ssbh_data uncompressed UV (header + count + floats).
    // Prefer single-frame constant when hold.
    let a0 = &values[0];
    let hold = values.iter().all(|v| {
        (v.scale_u - a0.scale_u).abs() < 1e-6
            && (v.scale_v - a0.scale_v).abs() < 1e-6
            && (v.rotation - a0.rotation).abs() < 1e-6
            && (v.translate_u - a0.translate_u).abs() < 1e-6
            && (v.translate_v - a0.translate_v).abs() < 1e-6
    });
    let mut data = Vec::new();
    if hold || values.len() == 1 {
        data.extend_from_slice(&0x7003u32.to_le_bytes());
        data.extend_from_slice(&a0.scale_u.to_le_bytes());
        data.extend_from_slice(&a0.scale_v.to_le_bytes());
        data.extend_from_slice(&a0.rotation.to_le_bytes());
        data.extend_from_slice(&a0.translate_u.to_le_bytes());
        data.extend_from_slice(&a0.translate_v.to_le_bytes());
        return Ok(data);
    }
    data.extend_from_slice(&0x7000u32.to_le_bytes());
    data.extend_from_slice(&(values.len() as u32).to_le_bytes());
    data.extend_from_slice(&1.0f32.to_le_bytes());
    for v in values {
        data.extend_from_slice(&v.scale_u.to_le_bytes());
        data.extend_from_slice(&v.scale_v.to_le_bytes());
        data.extend_from_slice(&v.rotation.to_le_bytes());
        data.extend_from_slice(&v.translate_u.to_le_bytes());
        data.extend_from_slice(&v.translate_v.to_le_bytes());
    }
    Ok(data)
}
