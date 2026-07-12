use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

use super::{MotionClip, MotionInterchangeError, MotionSkeleton, EXVS2_SAMPLE_RATE_HZ};

pub const CASCADEUR_BRIDGE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CascadeurBridgeManifest {
    pub schema_version: u32,
    pub action_name: String,
    pub sample_rate_hz: u32,
    pub expected_frame_count: usize,
    pub skeleton: Vec<BridgeBone>,
    pub rest_pose_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeBone {
    pub name: String,
    pub parent_index: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CascadeurBridgePaths {
    pub motion_fbx_path: PathBuf,
    pub manifest_path: PathBuf,
}

impl CascadeurBridgeManifest {
    pub fn from_motion_clip(clip: &MotionClip) -> Result<Self, MotionInterchangeError> {
        clip.validate()?;
        Ok(Self {
            schema_version: CASCADEUR_BRIDGE_SCHEMA_VERSION,
            action_name: clip.name.clone(),
            sample_rate_hz: clip.sample_rate_hz,
            expected_frame_count: clip.frames.len(),
            skeleton: clip
                .skeleton
                .bones
                .iter()
                .map(|bone| BridgeBone {
                    name: bone.name.clone(),
                    parent_index: bone.parent_index,
                })
                .collect(),
            rest_pose_fingerprint: skeleton_fingerprint(&clip.skeleton),
        })
    }

    pub fn validate_reference_skeleton(
        &self,
        reference: &MotionSkeleton,
    ) -> Result<(), MotionInterchangeError> {
        if self.schema_version != CASCADEUR_BRIDGE_SCHEMA_VERSION {
            return Err(MotionInterchangeError::Bridge(format!(
                "unsupported bridge schema version {}",
                self.schema_version
            )));
        }
        if self.sample_rate_hz != EXVS2_SAMPLE_RATE_HZ {
            return Err(MotionInterchangeError::Bridge(format!(
                "bridge sample rate must be {EXVS2_SAMPLE_RATE_HZ} Hz"
            )));
        }
        let actual = skeleton_fingerprint(reference);
        if actual != self.rest_pose_fingerprint {
            return Err(MotionInterchangeError::Bridge(format!(
                "reference skeleton fingerprint mismatch: expected {}, found {actual}",
                self.rest_pose_fingerprint
            )));
        }
        Ok(())
    }
}

pub fn write_cascadeur_bridge(
    output_dir: &Path,
    clip: &MotionClip,
) -> Result<CascadeurBridgePaths, MotionInterchangeError> {
    clip.validate()?;
    std::fs::create_dir_all(output_dir).map_err(|error| {
        MotionInterchangeError::Bridge(format!(
            "failed to create bridge directory {}: {error}",
            output_dir.display()
        ))
    })?;
    let motion_fbx_path = output_dir.join("motion.fbx");
    let manifest_path = output_dir.join("bridge.json");
    for path in [&motion_fbx_path, &manifest_path] {
        if path.exists() {
            return Err(MotionInterchangeError::Bridge(format!(
                "bridge output already exists: {}",
                path.display()
            )));
        }
    }
    let manifest = CascadeurBridgeManifest::from_motion_clip(clip)?;
    crate::ssbh_fbx::write_animation_only_fbx(&motion_fbx_path, clip).map_err(|error| {
        MotionInterchangeError::Bridge(format!(
            "failed to write animation-only FBX {}: {error:#}",
            motion_fbx_path.display()
        ))
    })?;
    let json = serde_json::to_vec_pretty(&manifest).map_err(|error| {
        MotionInterchangeError::Bridge(format!("failed to serialize bridge manifest: {error}"))
    })?;
    std::fs::write(&manifest_path, json).map_err(|error| {
        MotionInterchangeError::Bridge(format!(
            "failed to write bridge manifest {}: {error}",
            manifest_path.display()
        ))
    })?;
    Ok(CascadeurBridgePaths {
        motion_fbx_path,
        manifest_path,
    })
}

pub fn read_cascadeur_bridge(
    fbx_path: &Path,
    manifest_path: &Path,
    reference: &MotionSkeleton,
    stack_name: Option<&str>,
    policy: super::RigBindingPolicy,
) -> Result<(MotionClip, super::RigBindingReport), MotionInterchangeError> {
    let manifest = read_cascadeur_bridge_manifest(manifest_path)?;
    manifest.validate_reference_skeleton(reference)?;
    super::fbx::read_motion_clip_fbx(fbx_path, reference, stack_name, policy)
}

pub fn read_cascadeur_bridge_manifest(
    path: &Path,
) -> Result<CascadeurBridgeManifest, MotionInterchangeError> {
    let bytes = std::fs::read(path).map_err(|error| {
        MotionInterchangeError::Bridge(format!(
            "failed to read bridge manifest {}: {error}",
            path.display()
        ))
    })?;
    serde_json::from_slice(&bytes).map_err(|error| {
        MotionInterchangeError::Bridge(format!(
            "failed to parse bridge manifest {}: {error}",
            path.display()
        ))
    })
}

pub(crate) fn skeleton_fingerprint(skeleton: &MotionSkeleton) -> String {
    let mut hasher = Sha256::new();
    hasher.update((skeleton.bones.len() as u64).to_le_bytes());
    for bone in &skeleton.bones {
        let name = bone.name.as_bytes();
        hasher.update((name.len() as u64).to_le_bytes());
        hasher.update(name);
        let parent = bone.parent_index.map(|index| index as i64).unwrap_or(-1);
        hasher.update(parent.to_le_bytes());
        for value in bone
            .rest_local
            .scale
            .to_array()
            .into_iter()
            .chain(bone.rest_local.rotation.to_array())
            .chain(bone.rest_local.translation.to_array())
        {
            hasher.update(value.to_bits().to_le_bytes());
        }
    }
    format!("{:x}", hasher.finalize())
}
