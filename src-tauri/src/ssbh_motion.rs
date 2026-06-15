//! NUANMB motion sampling for the web preview (logic derived from `ssbh_wgpu::animation`).

use glam::Vec4Swizzles;
use indexmap::IndexSet;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use ssbh_data::{
    anim_data::{
        AnimData, GroupType, TrackValues, Transform, TransformFlags, UvTransform,
    },
    hlpb_data::{AimConstraintData, HlpbData, OrientConstraintData},
    prelude::*,
    skel_data::BoneData,
    Vector3, Vector4,
};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Instant, UNIX_EPOCH};
use topological_sort::TopologicalSort;
use tauri::State;

use crate::ssbh_preview::{
    collect_paths_recursive, dir_name_should_skip, normalize_preview_path_for_frontend,
    preview_log, preview_path_to_frontend,
};

const MAX_BONE_COUNT: usize = 512;
const MAX_CLIP_SAMPLED_FRAMES: usize = 1200;

const NUANMB_RECURSE_MAX_DEPTH: usize = 16;
const NUANMB_RECURSE_MAX_FILES: usize = 256;

/// Parsed skel + anim kept in memory so playback does not re-read disk every frame.
pub(crate) struct MotionSampleCache {
    skel_path: String,
    nuanmb_path: String,
    matl_path: Option<String>,
    hlpb_path: Option<String>,
    skel: Arc<SkelData>,
    anim: Arc<AnimData>,
    hlpb: Option<Arc<HlpbData>>,
    skel_stamp: FileStamp,
    nuanmb_stamp: FileStamp,
    matl_stamp: Option<FileStamp>,
    hlpb_stamp: Option<FileStamp>,
}

#[derive(Default)]
pub struct MotionSampleCacheState(pub Mutex<Option<MotionSampleCache>>);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FileStamp {
    len: u64,
    modified_ms: u128,
}

fn file_stamp(path: &str) -> Result<FileStamp, String> {
    let meta = fs::metadata(path).map_err(|e| format!("Failed to read metadata for {path}: {e}"))?;
    let modified = meta
        .modified()
        .map_err(|e| format!("Failed to read modified time for {path}: {e}"))?;
    let modified_ms = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Modified time is before UNIX_EPOCH for {path}: {e}"))?
        .as_millis();
    Ok(FileStamp {
        len: meta.len(),
        modified_ms,
    })
}

fn motion_cache_get_or_load(
    state: &MotionSampleCacheState,
    request: &MotionSampleRequest,
) -> Result<(Arc<SkelData>, Arc<AnimData>, Option<Arc<HlpbData>>), String> {
    let skel_path = request.skel_path.trim().to_string();
    let nuanmb_path = request.nuanmb_path.trim().to_string();
    let matl_path = request.matl_path.as_ref().map(|s| s.trim().to_string());
    let hlpb_path = find_default_hlpb_path_for_skel(&skel_path)?;
    let skel_stamp = file_stamp(&skel_path)?;
    let nuanmb_stamp = file_stamp(&nuanmb_path)?;
    let matl_stamp = if let Some(ref mp) = matl_path {
        Some(file_stamp(mp)?)
    } else {
        None
    };
    let hlpb_stamp = if let Some(ref hp) = hlpb_path {
        Some(file_stamp(hp)?)
    } else {
        None
    };

    let mut guard = state
        .0
        .lock()
        .map_err(|_| "Motion sample cache lock poisoned".to_string())?;

    let reload = match &*guard {
        None => true,
        Some(c) => {
            c.skel_path != skel_path
                || c.nuanmb_path != nuanmb_path
                || c.matl_path != matl_path
                || c.hlpb_path != hlpb_path
                || c.skel_stamp != skel_stamp
                || c.nuanmb_stamp != nuanmb_stamp
                || c.matl_stamp != matl_stamp
                || c.hlpb_stamp != hlpb_stamp
        }
    };

    if reload {
        let t0 = Instant::now();
        preview_log(&format!(
            "motion sample cache: loading skel={} anim={}",
            skel_path, nuanmb_path
        ));
        let skel_p = Path::new(&skel_path);
        let anim_p = Path::new(&nuanmb_path);
        let skel: SkelData =
            SkelData::from_file(skel_p).map_err(|e| format!("Failed to read Skel: {e}"))?;
        let anim: AnimData =
            AnimData::from_file(anim_p).map_err(|e| format!("Failed to read Anim: {e}"))?;
        let hlpb = if let Some(ref hp) = hlpb_path {
            Some(Arc::new(
                HlpbData::from_file(Path::new(hp))
                    .map_err(|e| format!("Failed to read Hlpb: {e}"))?,
            ))
        } else {
            None
        };

        if let Some(ref mp) = matl_path {
            let _matl: MatlData = MatlData::from_file(Path::new(mp))
                .map_err(|e| format!("Failed to read Matl: {e}"))?;
        }

        *guard = Some(MotionSampleCache {
            skel_path: skel_path.clone(),
            nuanmb_path: nuanmb_path.clone(),
            matl_path: matl_path.clone(),
            hlpb_path: hlpb_path.clone(),
            skel: Arc::new(skel),
            anim: Arc::new(anim),
            hlpb,
            skel_stamp,
            nuanmb_stamp,
            matl_stamp,
            hlpb_stamp,
        });
        preview_log(&format!(
            "motion sample cache: load done elapsed_ms={}",
            t0.elapsed().as_millis()
        ));
    }

    let c = guard
        .as_ref()
        .ok_or_else(|| "Motion sample cache is empty after load".to_string())?;
    Ok((c.skel.clone(), c.anim.clone(), c.hlpb.clone()))
}

fn find_default_hlpb_path_for_skel(skel_path: &str) -> Result<Option<String>, String> {
    let folder = Path::new(skel_path)
        .parent()
        .ok_or_else(|| format!("Could not determine model folder from skel path: {skel_path}"))?;
    let rd = std::fs::read_dir(folder)
        .map_err(|e| format!("Failed to read model folder {}: {e}", folder.display()))?;
    let mut files = Vec::new();
    for entry in rd {
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_hlpb = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("nuhlpb"))
            .unwrap_or(false);
        if is_hlpb {
            files.push(path);
        }
    }
    files.sort();
    if let Some(path) = files
        .iter()
        .find(|p| p.file_name().and_then(|s| s.to_str()) == Some("model.nuhlpb"))
        .or_else(|| files.first())
    {
        return Ok(Some(preview_path_to_frontend(path)));
    }
    Ok(None)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NuanmbManifest {
    pub file_path: String,
    pub major_version: u16,
    pub minor_version: u16,
    pub final_frame_index: f32,
    pub group_summaries: Vec<GroupSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupSummary {
    pub group_type: String,
    pub node_count: usize,
    pub nodes: Vec<NodeSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeSummary {
    pub name: String,
    pub track_names: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionSampleRequest {
    pub skel_path: String,
    pub nuanmb_path: String,
    /// Optional combined matl used to validate material labels (material animation still sampled from anim).
    pub matl_path: Option<String>,
    pub frame: f32,
    pub loop_animation: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionClipRequest {
    pub skel_path: String,
    pub nuanmb_path: String,
    /// Optional combined matl used to validate material labels.
    pub matl_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoneLocalSample {
    pub translation: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisibilitySample {
    pub mesh_name_prefix: String,
    pub visible: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialTrackSample {
    pub material_label: String,
    pub track_name: String,
    pub kind: String,
    pub value: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionCameraSample {
    pub translation: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
    pub fov_y_radians: f32,
    pub near_clip: f32,
    pub far_clip: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LightSample {
    pub color: [f32; 4],
    pub direction: [f32; 4],
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionLightingSample {
    pub light_chr: Option<LightSample>,
    pub light_stage: Vec<LightSample>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionSample {
    pub frame: f32,
    pub final_frame_index: f32,
    pub bone_locals: Vec<BoneLocalSample>,
    pub visibility: Vec<VisibilitySample>,
    pub material_tracks: Vec<MaterialTrackSample>,
    pub camera: Option<MotionCameraSample>,
    pub lighting: Option<MotionLightingSample>,
    pub elapsed_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionFrameSample {
    pub bone_locals: Vec<BoneLocalSample>,
    pub visibility: Vec<VisibilitySample>,
    pub material_tracks: Vec<MaterialTrackSample>,
    pub camera: Option<MotionCameraSample>,
    pub lighting: Option<MotionLightingSample>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionClip {
    pub final_frame_index: f32,
    pub sampled_frame_count: usize,
    pub frames: Vec<MotionFrameSample>,
}

// --- Interpolation (matches ssbh_wgpu::animation) ---

trait Interpolate {
    fn interpolate(&self, other: &Self, factor: f32) -> Self;
}

impl Interpolate for bool {
    fn interpolate(&self, _other: &Self, _factor: f32) -> Self {
        *self
    }
}

impl Interpolate for f32 {
    fn interpolate(&self, other: &Self, factor: f32) -> Self {
        self * (1.0 - factor) + other * factor
    }
}

impl Interpolate for Vector3 {
    fn interpolate(&self, other: &Self, factor: f32) -> Self {
        glam::Vec3::from(self.to_array())
            .lerp(glam::Vec3::from(other.to_array()), factor)
            .to_array()
            .into()
    }
}

impl Interpolate for Vector4 {
    fn interpolate(&self, other: &Self, factor: f32) -> Self {
        glam::Vec4::from(self.to_array())
            .lerp(glam::Vec4::from(other.to_array()), factor)
            .to_array()
            .into()
    }
}

fn interpolate_quat(a: &Vector4, b: &Vector4, factor: f32) -> Vector4 {
    glam::quat(a.x, a.y, a.z, a.w)
        .lerp(glam::quat(b.x, b.y, b.z, b.w), factor)
        .to_array()
        .into()
}

impl Interpolate for Transform {
    fn interpolate(&self, other: &Self, factor: f32) -> Self {
        Self {
            translation: self.translation.interpolate(&other.translation, factor),
            rotation: interpolate_quat(&self.rotation, &other.rotation, factor),
            scale: self.scale.interpolate(&other.scale, factor),
        }
    }
}

fn frame_value<T>(values: &[T], frame: f32) -> T
where
    T: Interpolate + Clone,
{
    if values.is_empty() {
        panic!("frame_value: empty track values");
    }
    let current_frame = (frame.floor() as usize).clamp(0, values.len() - 1);
    let next_frame = (frame.ceil() as usize).clamp(0, values.len() - 1);
    let factor = frame.fract();
    values[current_frame].interpolate(&values[next_frame], factor)
}

fn frame_value_uv(values: &[UvTransform], frame: f32) -> UvTransform {
    if values.is_empty() {
        panic!("frame_value_uv: empty track values");
    }
    let a = (frame.floor() as usize).clamp(0, values.len() - 1);
    let b = (frame.ceil() as usize).clamp(0, values.len() - 1);
    let t = frame.fract();
    let u0 = values[a];
    let u1 = values[b];
    let l = |x: f32, y: f32| x * (1.0 - t) + y * t;
    UvTransform {
        scale_u: l(u0.scale_u, u1.scale_u),
        scale_v: l(u0.scale_v, u1.scale_v),
        rotation: l(u0.rotation, u1.rotation),
        translate_u: l(u0.translate_u, u1.translate_u),
        translate_v: l(u0.translate_v, u1.translate_v),
    }
}

#[derive(Debug, Clone, Copy)]
struct AnimTransform {
    translation: glam::Vec3,
    rotation: glam::Quat,
    scale: glam::Vec3,
}

impl From<ssbh_data::anim_data::Transform> for AnimTransform {
    fn from(value: ssbh_data::anim_data::Transform) -> Self {
        Self {
            translation: value.translation.to_array().into(),
            rotation: glam::Quat::from_array(value.rotation.to_array()),
            scale: value.scale.to_array().into(),
        }
    }
}

impl AnimTransform {
    fn to_mat4(self, scale_compensation: glam::Vec3) -> glam::Mat4 {
        let translation = glam::Mat4::from_translation(self.translation);
        let rotation = glam::Mat4::from_quat(self.rotation);
        let scale = glam::Mat4::from_scale(self.scale);
        translation * glam::Mat4::from_scale(scale_compensation) * rotation * scale
    }
}

#[derive(Debug, Clone)]
struct AnimatedBone<'a> {
    bone: &'a BoneData,
    anim_transform: Option<AnimTransform>,
    compensate_scale: bool,
    flags: TransformFlags,
}

impl<'a> AnimatedBone<'a> {
    fn animated_transform(&self, scale_compensation: glam::Vec3) -> glam::Mat4 {
        self.anim_transform
            .as_ref()
            .map(|t| {
                let (skel_scale, skel_rot, scale_trans) =
                    glam::Mat4::from_cols_array_2d(&self.bone.transform)
                        .to_scale_rotation_translation();
                // Important pitfall:
                // `override_* = false` means "keep skeleton/rest channel", not "use animated channel".
                // Many NUANMB clips drive only rotation while leaving translation near zero.
                // If translation always reads from the animation track, limb/head offsets collapse
                // and parent-child chains appear disconnected in the viewport.
                let adjusted_transform = AnimTransform {
                    translation: if self.flags.override_translation {
                        t.translation
                    } else {
                        scale_trans
                    },
                    rotation: if self.flags.override_rotation {
                        skel_rot
                    } else {
                        t.rotation
                    },
                    scale: if self.flags.override_scale {
                        skel_scale
                    } else {
                        t.scale
                    },
                };
                adjusted_transform.to_mat4(scale_compensation)
            })
            .unwrap_or_else(|| glam::Mat4::from_cols_array_2d(&self.bone.transform))
    }

}

struct AnimationTransforms {
    world_transforms: [glam::Mat4; MAX_BONE_COUNT],
}

impl AnimationTransforms {
    fn identity() -> Self {
        Self {
            world_transforms: [glam::Mat4::IDENTITY; MAX_BONE_COUNT],
        }
    }
}

fn apply_transforms<'a>(
    bones: &mut [(usize, AnimatedBone)],
    anim: &AnimData,
    frame: f32,
) {
    // NUANMB node names can be namespaced (e.g. "rig:Bone" or "path|Bone"),
    // while skeleton names are often plain. Canonical fallback keeps mapping stable.
    fn canonical_bone_name(name: &str) -> &str {
        let path_trimmed = name.rsplit('|').next().unwrap_or(name);
        path_trimmed.rsplit(':').next().unwrap_or(path_trimmed)
    }

    let mut exact_bones_by_name: HashMap<String, Vec<usize>> = HashMap::new();
    let mut canonical_bones_by_name: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, (_, animated)) in bones.iter().enumerate() {
        exact_bones_by_name
            .entry(animated.bone.name.clone())
            .or_default()
            .push(i);
        canonical_bones_by_name
            .entry(canonical_bone_name(&animated.bone.name).to_string())
            .or_default()
            .push(i);
    }
    let mut exact_use_counts: HashMap<String, usize> = HashMap::new();
    let mut canonical_use_counts: HashMap<String, usize> = HashMap::new();

    for group in &anim.groups {
        if group.group_type == GroupType::Transform {
            for node in &group.nodes {
                let track = node
                    .tracks
                    .iter()
                    .find(|t| t.name == "Transform")
                    .or_else(|| {
                        node.tracks
                            .iter()
                            .find(|t| matches!(t.values, TrackValues::Transform(_)))
                    });
                let Some(track) = track else {
                    continue;
                };
                let TrackValues::Transform(values) = &track.values else {
                    continue;
                };

                let mapped_index = if let Some(indices) = exact_bones_by_name.get(&node.name) {
                    let use_count = exact_use_counts.entry(node.name.clone()).or_insert(0);
                    let idx = indices.get(*use_count).copied();
                    if idx.is_some() {
                        *use_count += 1;
                    }
                    idx
                } else {
                    let canonical = canonical_bone_name(&node.name).to_string();
                    if let Some(indices) = canonical_bones_by_name.get(&canonical) {
                        let use_count = canonical_use_counts.entry(canonical).or_insert(0);
                        let idx = indices.get(*use_count).copied();
                        if idx.is_some() {
                            *use_count += 1;
                        }
                        idx
                    } else {
                        None
                    }
                };

                if let Some(i) = mapped_index {
                    let (_, bone) = &mut bones[i];
                    *bone = create_animated_bone(frame, bone.bone, track, values);
                }
            }
        }
    }
}

fn create_animated_bone<'a>(
    frame: f32,
    bone: &'a BoneData,
    track: &ssbh_data::anim_data::TrackData,
    values: &[ssbh_data::anim_data::Transform],
) -> AnimatedBone<'a> {
    if values.is_empty() {
        return AnimatedBone {
            bone,
            compensate_scale: track.compensate_scale,
            anim_transform: None,
            flags: track.transform_flags,
        };
    }
    let anim_transform = frame_value(values, frame).into();
    AnimatedBone {
        bone,
        anim_transform: Some(anim_transform),
        compensate_scale: track.compensate_scale,
        flags: track.transform_flags,
    }
}

fn evaluation_order(bones: &[(usize, AnimatedBone)]) -> IndexSet<usize> {
    let mut topo_sort = TopologicalSort::<usize>::new();
    let mut evaluation_order = IndexSet::new();
    for (i, bone) in bones.iter() {
        if let Some(p) = bone.bone.parent_index {
            topo_sort.add_dependency(p, *i);
        } else {
            evaluation_order.insert(*i);
        }
    }
    loop {
        let parts = topo_sort.pop_all();
        if parts.is_empty() {
            break;
        }
        evaluation_order.extend(parts);
    }
    evaluation_order
}

fn calculate_world_transform(
    bones: &[(usize, AnimatedBone)],
    bone: &AnimatedBone,
    result: &AnimationTransforms,
) -> (glam::Mat4, glam::Mat4) {
    if let Some(parent_index) = bone.bone.parent_index {
        let parent_transform = result.world_transforms[parent_index];
        let scale_compensation = if bone.compensate_scale {
            let parent_scale = bones[parent_index]
                .1
                .anim_transform
                .map(|t| t.scale)
                .unwrap_or(glam::Vec3::ONE);
            1.0 / parent_scale
        } else {
            glam::Vec3::ONE
        };
        let current_transform = bone.animated_transform(scale_compensation);
        (parent_transform, current_transform)
    } else {
        (
            glam::Mat4::IDENTITY,
            bone.animated_transform(glam::Vec3::ONE),
        )
    }
}

fn interp(a: f32, b: f32, f: f32) -> f32 {
    (1.0 - f) * a + f * b
}

fn apply_aim_constraint(
    world_transforms: &[glam::Mat4],
    bones: &[BoneData],
    constraint: &AimConstraintData,
    target_transform: glam::Mat4,
) -> Option<glam::Mat4> {
    let source = bones
        .iter()
        .position(|b| b.name == constraint.aim_bone_name1)?;
    let source_world = *world_transforms
        .get(source)
        .unwrap_or(&glam::Mat4::IDENTITY);
    let target = bones
        .iter()
        .position(|b| b.name == constraint.target_bone_name1)?;
    let target_world = *world_transforms
        .get(target)
        .unwrap_or(&glam::Mat4::IDENTITY);
    let src_pos = source_world.col(3);
    let target_pos = target_world.col(3);
    let aim = (target_world
        * glam::vec4(constraint.aim.x, constraint.aim.y, constraint.aim.z, 0.0))
    .xyz();
    let v = src_pos.xyz() - target_pos.xyz();
    let (target_s, mut target_r, target_t) = target_transform.to_scale_rotation_translation();
    target_r *= glam::Quat::from_rotation_arc(aim.normalize(), v.normalize());
    Some(glam::Mat4::from_scale_rotation_translation(
        target_s, target_r, target_t,
    ))
}

fn apply_orient_constraint(
    world_transforms: &[glam::Mat4],
    bones: &[BoneData],
    constraint: &OrientConstraintData,
    target_transform: glam::Mat4,
) -> Option<glam::Mat4> {
    let source = bones
        .iter()
        .position(|b| b.name == constraint.source_bone_name)?;
    let target = bones
        .iter()
        .position(|b| b.name == constraint.target_bone_name)?;
    let source_world = *world_transforms
        .get(source)
        .unwrap_or(&glam::Mat4::IDENTITY);
    let target_parent_world = bones[target]
        .parent_index
        .map(|p| world_transforms.get(p).unwrap_or(&glam::Mat4::IDENTITY))
        .unwrap_or(&glam::Mat4::IDENTITY);
    let source_transform = target_parent_world.inverse() * source_world;
    let (_, source_r, _) = source_transform.to_scale_rotation_translation();
    let (source_rot_z, source_rot_y, source_rot_x) = source_r.to_euler(glam::EulerRot::ZYX);
    let (target_s, target_r, target_t) = target_transform.to_scale_rotation_translation();
    let (target_rot_z, target_rot_y, target_rot_x) = target_r.to_euler(glam::EulerRot::ZYX);
    let interp_rotation = glam::Quat::from_euler(
        glam::EulerRot::ZYX,
        interp(target_rot_z, source_rot_z, constraint.constraint_axes.z),
        interp(target_rot_y, source_rot_y, constraint.constraint_axes.y),
        interp(target_rot_x, source_rot_x, constraint.constraint_axes.x),
    );
    Some(glam::Mat4::from_scale_rotation_translation(
        target_s,
        interp_rotation,
        target_t,
    ))
}

fn apply_constraints(
    current: &mut glam::Mat4,
    hlpb: &HlpbData,
    bone: &(usize, AnimatedBone),
    result: &AnimationTransforms,
    bones: &[BoneData],
) {
    if let Some(constraint) = hlpb
        .orient_constraints
        .iter()
        .find(|o| o.target_bone_name == bone.1.bone.name)
    {
        if let Some(new_current) =
            apply_orient_constraint(&result.world_transforms, bones, constraint, *current)
        {
            *current = new_current;
        }
    }
    if let Some(constraint) = hlpb
        .aim_constraints
        .iter()
        .find(|a| a.target_bone_name1 == bone.1.bone.name)
    {
        if let Some(new_current) =
            apply_aim_constraint(&result.world_transforms, bones, constraint, *current)
        {
            *current = new_current;
        }
    }
}

fn animate_skel_cpu(
    skel: &SkelData,
    anim: &AnimData,
    hlpb: Option<&HlpbData>,
    frame: f32,
) -> Vec<BoneLocalSample> {
    let mut bones: Vec<_> = skel
        .bones
        .iter()
        .enumerate()
        .take(MAX_BONE_COUNT)
        .map(|(i, b)| {
            (
                i,
                AnimatedBone {
                    bone: b,
                    compensate_scale: false,
                    anim_transform: None,
                    flags: TransformFlags::default(),
                },
            )
        })
        .collect();

    apply_transforms(&mut bones, anim, frame);

    let mut result = AnimationTransforms::identity();
    let evaluation_order = evaluation_order(&bones);

    for i in &evaluation_order {
        let bone = &bones[*i];
        let (parent_world, current) = calculate_world_transform(&bones, &bone.1, &result);
        result.world_transforms[bone.0] = parent_world * current;
    }
    for i in &evaluation_order {
        let bone = &bones[*i];
        let (parent_world, mut current) = calculate_world_transform(&bones, &bone.1, &result);
        if let Some(hlpb) = hlpb {
            apply_constraints(&mut current, hlpb, bone, &result, &skel.bones);
        }
        result.world_transforms[bone.0] = parent_world * current;
    }

    let n = skel.bones.len().min(MAX_BONE_COUNT);
    let mut locals = Vec::with_capacity(n);
    for i in 0..n {
        let world_i = result.world_transforms[i];
        let local = if let Some(pi) = skel.bones[i].parent_index {
            result.world_transforms[pi].inverse() * world_i
        } else {
            world_i
        };
        let (s, r, t) = local.to_scale_rotation_translation();
        locals.push(BoneLocalSample {
            translation: t.to_array(),
            rotation: r.to_array(),
            scale: s.to_array(),
        });
    }
    locals
}

fn collect_visibility(anim: &AnimData, frame: f32) -> Vec<VisibilitySample> {
    let mut out = Vec::new();
    for group in &anim.groups {
        if group.group_type == GroupType::Visibility {
            for node in &group.nodes {
                if let Some(track) = node.tracks.first() {
                    if let TrackValues::Boolean(values) = &track.values {
                        if values.is_empty() {
                            continue;
                        }
                        let visible = frame_value(values, frame);
                        out.push(VisibilitySample {
                            mesh_name_prefix: node.name.clone(),
                            visible,
                        });
                    }
                }
            }
        }
    }
    out
}

fn collect_material_tracks(anim: &AnimData, frame: f32) -> Vec<MaterialTrackSample> {
    let mut out = Vec::new();
    for group in &anim.groups {
        if group.group_type == GroupType::Material {
            for node in &group.nodes {
                for track in &node.tracks {
                    match &track.values {
                        TrackValues::Float(v) => {
                            if !v.is_empty() {
                                out.push(MaterialTrackSample {
                                    material_label: node.name.clone(),
                                    track_name: track.name.clone(),
                                    kind: "float".to_string(),
                                    value: json!(frame_value(v, frame)),
                                });
                            }
                        }
                        TrackValues::Boolean(v) => {
                            if !v.is_empty() {
                                out.push(MaterialTrackSample {
                                    material_label: node.name.clone(),
                                    track_name: track.name.clone(),
                                    kind: "boolean".to_string(),
                                    value: json!(frame_value(v, frame)),
                                });
                            }
                        }
                        TrackValues::Vector4(v) => {
                            if !v.is_empty() {
                                let t = frame_value(v, frame);
                                out.push(MaterialTrackSample {
                                    material_label: node.name.clone(),
                                    track_name: track.name.clone(),
                                    kind: "vector4".to_string(),
                                    value: json!([
                                        t.x, t.y, t.z, t.w
                                    ]),
                                });
                            }
                        }
                        TrackValues::UvTransform(v) => {
                            if !v.is_empty() {
                                let u = frame_value_uv(v, frame);
                                out.push(MaterialTrackSample {
                                    material_label: node.name.clone(),
                                    track_name: track.name.clone(),
                                    kind: "uvTransform".to_string(),
                                    value: json!({
                                        "scaleU": u.scale_u,
                                        "scaleV": u.scale_v,
                                        "rotation": u.rotation,
                                        "translateU": u.translate_u,
                                        "translateV": u.translate_v,
                                    }),
                                });
                            }
                        }
                        TrackValues::Transform(_) | TrackValues::PatternIndex(_) => {}
                    }
                }
            }
        }
    }
    out
}

fn sample_camera(anim: &AnimData, frame: f32) -> Option<MotionCameraSample> {
    let transform_node = anim
        .groups
        .iter()
        .find(|g| g.group_type == GroupType::Transform)?
        .nodes
        .iter()
        .find(|n| n.name == "gya_camera" || n.name == "camera_stage")?;

    let transform_track = transform_node.tracks.first()?;
    let transform = match &transform_track.values {
        TrackValues::Transform(values) => {
            if values.is_empty() {
                return None;
            }
            AnimTransform::from(frame_value(values, frame))
        }
        _ => return None,
    };

    let camera_node = anim
        .groups
        .iter()
        .find(|g| g.group_type == GroupType::Camera)
        .and_then(|group| {
            group
                .nodes
                .iter()
                .find(|n| n.name == "gya_cameraShape" || n.name == "camera_stageShape")
        });

    let default_near = 1.0_f32;
    let default_far = 400000.0_f32;
    let default_fov = 30f32.to_radians();

    let near_clip = camera_node
        .and_then(|node| node.tracks.iter().find(|t| t.name == "NearClip"))
        .and_then(|track| match &track.values {
            TrackValues::Float(values) if !values.is_empty() => Some(frame_value(values, frame)),
            _ => None,
        })
        .unwrap_or(default_near);

    let far_clip = camera_node
        .and_then(|node| node.tracks.iter().find(|t| t.name == "FarClip"))
        .and_then(|track| match &track.values {
            TrackValues::Float(values) if !values.is_empty() => Some(frame_value(values, frame)),
            _ => None,
        })
        .unwrap_or(default_far);

    let fov_y_radians = camera_node
        .and_then(|node| node.tracks.iter().find(|t| t.name == "FieldOfView"))
        .and_then(|track| match &track.values {
            TrackValues::Float(values) if !values.is_empty() => Some(frame_value(values, frame)),
            _ => None,
        })
        .unwrap_or(default_fov);

    let scale = transform.scale;
    let rotation = transform.rotation.conjugate();
    let translation = -transform.translation;

    Some(MotionCameraSample {
        translation: translation.to_array(),
        rotation: rotation.to_array(),
        scale: scale.to_array(),
        fov_y_radians,
        near_clip,
        far_clip,
    })
}

fn light_direction(rotation: glam::Quat) -> glam::Vec4 {
    glam::Mat4::from_quat(rotation) * glam::Vec4::Z
}

fn light_from_node(node: &ssbh_data::anim_data::NodeData, frame: f32) -> LightSample {
    let float0 = node
        .tracks
        .iter()
        .find(|t| t.name == "CustomFloat0")
        .and_then(|t| match &t.values {
            TrackValues::Float(values) if !values.is_empty() => Some(frame_value(values, frame)),
            _ => None,
        })
        .unwrap_or_default();

    let vector0 = node
        .tracks
        .iter()
        .find(|t| t.name == "CustomVector0")
        .and_then(|t| match &t.values {
            TrackValues::Vector4(values) if !values.is_empty() => Some(frame_value(values, frame)),
            _ => None,
        })
        .unwrap_or_default();

    let transform = node
        .tracks
        .iter()
        .find(|t| t.name == "Transform")
        .and_then(|t| match &t.values {
            TrackValues::Transform(values) if !values.is_empty() => Some(frame_value(values, frame)),
            _ => None,
        });

    let rotation = transform
        .map(|t| glam::Quat::from_array(t.rotation.to_array()))
        .unwrap_or(glam::Quat::IDENTITY);

    let color = glam::Vec4::from_array(vector0.to_array()) * float0;
    let dir = light_direction(rotation);
    LightSample {
        color: color.to_array(),
        direction: dir.to_array(),
    }
}

fn sample_lighting(anim: &AnimData, frame: f32) -> Option<MotionLightingSample> {
    let transform_group = anim
        .groups
        .iter()
        .find(|g| g.group_type == GroupType::Transform)?;

    let light_chr = transform_group
        .nodes
        .iter()
        .find(|n| n.name == "LightChr")
        .map(|n| light_from_node(n, frame));

    let mut light_stage = Vec::new();
    for node in transform_group
        .nodes
        .iter()
        .filter(|n| n.name.starts_with("LightStg"))
    {
        light_stage.push(light_from_node(node, frame));
        if light_stage.len() >= 8 {
            break;
        }
    }

    if light_chr.is_none() && light_stage.is_empty() {
        None
    } else {
        Some(MotionLightingSample {
            light_chr,
            light_stage,
        })
    }
}

fn normalize_frame(frame: f32, max_frame: f32, loop_anim: bool) -> f32 {
    if max_frame <= 0.0 {
        return frame.max(0.0);
    }
    if loop_anim {
        let span = max_frame + 1.0;
        let mut f = frame % span;
        if f < 0.0 {
            f += span;
        }
        f
    } else {
        frame.clamp(0.0, max_frame)
    }
}

fn sampled_frame_count_for_clip(max_frame: f32) -> usize {
    (max_frame.ceil() as usize).saturating_add(1)
}

fn sample_motion_frame_data(
    skel: &SkelData,
    anim: &AnimData,
    hlpb: Option<&HlpbData>,
    frame: f32,
) -> MotionFrameSample {
    MotionFrameSample {
        bone_locals: animate_skel_cpu(skel, anim, hlpb, frame),
        visibility: collect_visibility(anim, frame),
        material_tracks: collect_material_tracks(anim, frame),
        camera: sample_camera(anim, frame),
        lighting: sample_lighting(anim, frame),
    }
}

fn group_type_label(g: GroupType) -> &'static str {
    match g {
        GroupType::Transform => "Transform",
        GroupType::Visibility => "Visibility",
        GroupType::Material => "Material",
        GroupType::Camera => "Camera",
    }
}

/// Decodes a `.nuanmb` with `ssbh_data`, builds the preview manifest, and runs the same
/// non-skeleton sampling as `ssbh_sample_motion_frame` (visibility, materials, camera, lighting)
/// at `frame`. Use for batch validation without a `.nuanmb` skeleton on disk.
pub fn smoke_decode_and_sample_nuanmb(path: &Path, frame: f32) -> Result<NuanmbManifest, String> {
    if !path.is_file() {
        return Err(format!("Not a file: {}", path.display()));
    }
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    if !ext.eq_ignore_ascii_case("nuanmb") {
        return Err("Expected a .nuanmb file".to_string());
    }
    let anim: AnimData =
        AnimData::from_file(path).map_err(|e| format!("Failed to read Anim: {e}"))?;
    let manifest = build_manifest(path, &anim);
    let max_f = anim.final_frame_index.max(0.0);
    let f = normalize_frame(frame, max_f, false);
    let _ = collect_visibility(&anim, f);
    let _ = collect_material_tracks(&anim, f);
    let _ = sample_camera(&anim, f);
    let _ = sample_lighting(&anim, f);
    Ok(manifest)
}

fn build_manifest(path: &Path, anim: &AnimData) -> NuanmbManifest {
    let mut group_summaries = Vec::new();
    for g in &anim.groups {
        let mut nodes = Vec::new();
        for n in &g.nodes {
            let track_names: Vec<String> = n.tracks.iter().map(|t| t.name.clone()).collect();
            nodes.push(NodeSummary {
                name: n.name.clone(),
                track_names,
            });
        }
        group_summaries.push(GroupSummary {
            group_type: group_type_label(g.group_type).to_string(),
            node_count: g.nodes.len(),
            nodes,
        });
    }
    NuanmbManifest {
        file_path: preview_path_to_frontend(path),
        major_version: anim.major_version,
        minor_version: anim.minor_version,
        final_frame_index: anim.final_frame_index,
        group_summaries,
    }
}

/// Lists `.nuanmb` files under a directory (recursive, capped).
#[tauri::command]
pub fn ssbh_list_nuanmb_under_tree(root_path: String) -> Result<Vec<String>, String> {
    let t0 = Instant::now();
    preview_log(&format!("nuanmb list: root={}", root_path));
    let paths = collect_paths_recursive(
        Path::new(&root_path.trim()),
        "nuanmb",
        NUANMB_RECURSE_MAX_DEPTH,
        NUANMB_RECURSE_MAX_FILES,
        dir_name_should_skip,
    )?;
    preview_log(&format!(
        "nuanmb list done: count={} elapsed_ms={}",
        paths.len(),
        t0.elapsed().as_millis()
    ));
    Ok(paths
        .into_iter()
        .map(|p| normalize_preview_path_for_frontend(&p.to_string_lossy()))
        .collect())
}

#[tauri::command]
pub fn ssbh_nuanmb_manifest(path: String) -> Result<NuanmbManifest, String> {
    let t0 = Instant::now();
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("Not a file: {}", p.display()));
    }
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    if !ext.eq_ignore_ascii_case("nuanmb") {
        return Err("Expected a .nuanmb file".to_string());
    }
    preview_log(&format!("nuanmb manifest: {}", p.display()));
    let anim: AnimData =
        AnimData::from_file(p).map_err(|e| format!("Failed to read Anim: {e}"))?;
    let manifest = build_manifest(p, &anim);
    preview_log(&format!(
        "nuanmb manifest done: {} elapsed_ms={}",
        p.display(),
        t0.elapsed().as_millis()
    ));
    Ok(manifest)
}

#[tauri::command]
pub fn ssbh_sample_motion_frame(
    state: State<'_, MotionSampleCacheState>,
    request: MotionSampleRequest,
) -> Result<MotionSample, String> {
    let t0 = Instant::now();
    let (skel, anim, hlpb) = motion_cache_get_or_load(&state, &request)?;

    let max_f = anim.final_frame_index.max(0.0);
    let frame = normalize_frame(request.frame, max_f, request.loop_animation);
    let sampled = sample_motion_frame_data(skel.as_ref(), anim.as_ref(), hlpb.as_deref(), frame);

    let elapsed_ms = t0.elapsed().as_millis();

    Ok(MotionSample {
        frame,
        final_frame_index: anim.final_frame_index,
        bone_locals: sampled.bone_locals,
        visibility: sampled.visibility,
        material_tracks: sampled.material_tracks,
        camera: sampled.camera,
        lighting: sampled.lighting,
        elapsed_ms,
    })
}

#[tauri::command]
pub fn ssbh_load_motion_clip(
    state: State<'_, MotionSampleCacheState>,
    request: MotionClipRequest,
) -> Result<MotionClip, String> {
    let t0 = Instant::now();
    let (skel, anim, hlpb) = motion_cache_get_or_load(
        &state,
        &MotionSampleRequest {
            skel_path: request.skel_path,
            nuanmb_path: request.nuanmb_path,
            matl_path: request.matl_path,
            frame: 0.0,
            loop_animation: false,
        },
    )?;

    let max_f = anim.final_frame_index.max(0.0);
    let sampled_frame_count = sampled_frame_count_for_clip(max_f);
    if sampled_frame_count == 0 {
        return Err("Motion clip produced no frames".to_string());
    }
    if sampled_frame_count > MAX_CLIP_SAMPLED_FRAMES {
        return Err(format!(
            "Motion clip has too many sampled frames: {} > {}",
            sampled_frame_count, MAX_CLIP_SAMPLED_FRAMES
        ));
    }

    let mut frames = Vec::with_capacity(sampled_frame_count);
    for i in 0..sampled_frame_count {
        let frame = i as f32;
        frames.push(sample_motion_frame_data(
            skel.as_ref(),
            anim.as_ref(),
            hlpb.as_deref(),
            frame,
        ));
    }

    preview_log(&format!(
        "motion clip load done: sampled_frames={} elapsed_ms={}",
        sampled_frame_count,
        t0.elapsed().as_millis()
    ));

    Ok(MotionClip {
        final_frame_index: anim.final_frame_index,
        sampled_frame_count,
        frames,
    })
}

#[cfg(test)]
mod normalize_frame_tests {
    use super::{animate_skel_cpu, normalize_frame, sampled_frame_count_for_clip};
    use ssbh_data::{
        anim_data::{AnimData, GroupData, GroupType, NodeData, TrackData, TrackValues, Transform, TransformFlags},
        hlpb_data::{HlpbData, OrientConstraintData},
        skel_data::{BillboardType, BoneData, SkelData},
        Vector3, Vector4,
    };

    fn identity_bone(name: &str, parent_index: Option<usize>) -> BoneData {
        BoneData {
            name: name.to_string(),
            transform: [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
            parent_index,
            billboard_type: BillboardType::Disabled,
        }
    }

    #[test]
    fn clamps_to_range_when_not_looping() {
        assert!((normalize_frame(5.0, 10.0, false) - 5.0).abs() < 1e-6);
        assert!((normalize_frame(15.0, 10.0, false) - 10.0).abs() < 1e-6);
        assert!((normalize_frame(-2.0, 10.0, false) - 0.0).abs() < 1e-6);
    }

    #[test]
    fn wraps_mod_span_when_looping() {
        assert!((normalize_frame(11.0, 10.0, true) - 0.0).abs() < 1e-5);
        assert!((normalize_frame(5.5, 10.0, true) - 5.5).abs() < 1e-5);
    }

    #[test]
    fn non_positive_max_frame_only_clamps_to_non_negative() {
        assert!((normalize_frame(-3.0, 0.0, false) - 0.0).abs() < 1e-6);
    }

    #[test]
    fn clip_sampling_includes_fractional_tail_frame() {
        assert_eq!(1, sampled_frame_count_for_clip(0.0));
        assert_eq!(2, sampled_frame_count_for_clip(1.0));
        assert_eq!(3, sampled_frame_count_for_clip(1.5));
    }

    #[test]
    fn animate_skel_cpu_applies_orient_constraints_from_hlpb() {
        let skel = SkelData {
            major_version: 1,
            minor_version: 0,
            bones: vec![identity_bone("A", None), identity_bone("B", None)],
        };
        let anim = AnimData {
            major_version: 2,
            minor_version: 0,
            final_frame_index: 0.0,
            groups: vec![GroupData {
                group_type: GroupType::Transform,
                nodes: vec![
                    NodeData {
                        name: "A".to_string(),
                        tracks: vec![TrackData {
                            name: "Transform".to_string(),
                            compensate_scale: false,
                            values: TrackValues::Transform(vec![Transform {
                                translation: Vector3::new(0.0, 0.0, 0.0),
                                rotation: Vector4::new(0.0, 0.0, 0.70710677, 0.70710677),
                                scale: Vector3::new(1.0, 1.0, 1.0),
                            }]),
                            transform_flags: TransformFlags::default(),
                        }],
                    },
                    NodeData {
                        name: "B".to_string(),
                        tracks: vec![TrackData {
                            name: "Transform".to_string(),
                            compensate_scale: false,
                            values: TrackValues::Transform(vec![Transform {
                                translation: Vector3::new(0.0, 0.0, 0.0),
                                rotation: Vector4::new(0.0, 0.0, 0.0, 1.0),
                                scale: Vector3::new(1.0, 1.0, 1.0),
                            }]),
                            transform_flags: TransformFlags::default(),
                        }],
                    },
                ],
            }],
        };
        let hlpb = HlpbData {
            major_version: 1,
            minor_version: 0,
            aim_constraints: Vec::new(),
            orient_constraints: vec![OrientConstraintData {
                name: "copy_a_to_b".to_string(),
                parent_bone_name1: "A".to_string(),
                parent_bone_name2: "A".to_string(),
                source_bone_name: "A".to_string(),
                target_bone_name: "B".to_string(),
                unk_type: 2,
                constraint_axes: Vector3::new(1.0, 1.0, 1.0),
                quat1: Vector4::new(0.0, 0.0, 0.0, 1.0),
                quat2: Vector4::new(0.0, 0.0, 0.0, 1.0),
                range_min: Vector3::new(-180.0, -180.0, -180.0),
                range_max: Vector3::new(180.0, 180.0, 180.0),
            }],
        };

        let locals = animate_skel_cpu(&skel, &anim, Some(&hlpb), 0.0);
        let b = locals.get(1).expect("expected constrained bone sample");
        assert!(b.rotation[2].abs() > 0.7, "expected constrained rotation on B");
        assert!(b.rotation[3].abs() > 0.7, "expected constrained rotation on B");
    }

    #[test]
    fn animate_skel_cpu_maps_transform_track_by_name_not_first_track() {
        let skel = SkelData {
            major_version: 1,
            minor_version: 0,
            bones: vec![identity_bone("Hip", None)],
        };
        let anim = AnimData {
            major_version: 2,
            minor_version: 0,
            final_frame_index: 0.0,
            groups: vec![GroupData {
                group_type: GroupType::Transform,
                nodes: vec![NodeData {
                    name: "Hip".to_string(),
                    tracks: vec![
                        TrackData {
                            name: "Unused".to_string(),
                            compensate_scale: false,
                            values: TrackValues::Float(vec![0.0]),
                            transform_flags: TransformFlags::default(),
                        },
                        TrackData {
                            name: "Transform".to_string(),
                            compensate_scale: false,
                            values: TrackValues::Transform(vec![Transform {
                                translation: Vector3::new(5.0, 0.0, 0.0),
                                rotation: Vector4::new(0.0, 0.0, 0.0, 1.0),
                                scale: Vector3::new(1.0, 1.0, 1.0),
                            }]),
                            transform_flags: TransformFlags {
                                override_translation: true,
                                ..TransformFlags::default()
                            },
                        },
                    ],
                }],
            }],
        };
        let locals = animate_skel_cpu(&skel, &anim, None, 0.0);
        assert!((locals[0].translation[0] - 5.0).abs() < 1e-6);
    }

    #[test]
    fn animate_skel_cpu_maps_namespaced_node_names_to_skeleton_names() {
        let skel = SkelData {
            major_version: 1,
            minor_version: 0,
            bones: vec![identity_bone("Hip", None)],
        };
        let anim = AnimData {
            major_version: 2,
            minor_version: 0,
            final_frame_index: 0.0,
            groups: vec![GroupData {
                group_type: GroupType::Transform,
                nodes: vec![NodeData {
                    name: "rigA:Hip".to_string(),
                    tracks: vec![TrackData {
                        name: "Transform".to_string(),
                        compensate_scale: false,
                        values: TrackValues::Transform(vec![Transform {
                            translation: Vector3::new(3.0, 1.0, -2.0),
                            rotation: Vector4::new(0.0, 0.0, 0.0, 1.0),
                            scale: Vector3::new(1.0, 1.0, 1.0),
                        }]),
                        transform_flags: TransformFlags {
                            override_translation: true,
                            ..TransformFlags::default()
                        },
                    }],
                }],
            }],
        };
        let locals = animate_skel_cpu(&skel, &anim, None, 0.0);
        assert!((locals[0].translation[0] - 3.0).abs() < 1e-6);
        assert!((locals[0].translation[1] - 1.0).abs() < 1e-6);
        assert!((locals[0].translation[2] + 2.0).abs() < 1e-6);
    }

    #[test]
    fn animate_skel_cpu_respects_override_flags_semantics() {
        let mut hip = identity_bone("Hip", None);
        hip.transform[3][0] = 5.0;
        let skel = SkelData {
            major_version: 1,
            minor_version: 0,
            bones: vec![hip],
        };
        let anim_keep_rest = AnimData {
            major_version: 2,
            minor_version: 0,
            final_frame_index: 0.0,
            groups: vec![GroupData {
                group_type: GroupType::Transform,
                nodes: vec![NodeData {
                    name: "Hip".to_string(),
                    tracks: vec![TrackData {
                        name: "Transform".to_string(),
                        compensate_scale: false,
                        values: TrackValues::Transform(vec![Transform {
                            translation: Vector3::new(0.0, 0.0, 0.0),
                            rotation: Vector4::new(0.0, 0.0, 0.0, 1.0),
                            scale: Vector3::new(1.0, 1.0, 1.0),
                        }]),
                        transform_flags: TransformFlags {
                            override_translation: false,
                            override_rotation: false,
                            override_scale: false,
                            override_compensate_scale: false,
                        },
                    }],
                }],
            }],
        };
        let locals_keep = animate_skel_cpu(&skel, &anim_keep_rest, None, 0.0);
        assert!((locals_keep[0].translation[0] - 5.0).abs() < 1e-6);
        assert!((locals_keep[0].translation[1] - 0.0).abs() < 1e-6);
        assert!((locals_keep[0].translation[2] - 0.0).abs() < 1e-6);

        let anim_override = AnimData {
            major_version: 2,
            minor_version: 0,
            final_frame_index: 0.0,
            groups: vec![GroupData {
                group_type: GroupType::Transform,
                nodes: vec![NodeData {
                    name: "Hip".to_string(),
                    tracks: vec![TrackData {
                        name: "Transform".to_string(),
                        compensate_scale: false,
                        values: TrackValues::Transform(vec![Transform {
                            translation: Vector3::new(3.0, 1.0, -2.0),
                            rotation: Vector4::new(0.0, 0.0, 0.0, 1.0),
                            scale: Vector3::new(1.0, 1.0, 1.0),
                        }]),
                        transform_flags: TransformFlags {
                            override_translation: true,
                            override_rotation: true,
                            override_scale: true,
                            override_compensate_scale: true,
                        },
                    }],
                }],
            }],
        };
        let locals_override = animate_skel_cpu(&skel, &anim_override, None, 0.0);
        assert!((locals_override[0].translation[0] - 3.0).abs() < 1e-6);
        assert!((locals_override[0].translation[1] - 1.0).abs() < 1e-6);
        assert!((locals_override[0].translation[2] + 2.0).abs() < 1e-6);
    }
}
