use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::{MotionInterchangeError, MotionSkeleton};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RigBindingPolicy {
    ExactHierarchy,
    NameOnly,
}

impl Default for RigBindingPolicy {
    fn default() -> Self {
        Self::ExactHierarchy
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RigBindingReport {
    pub matched_bones: Vec<String>,
    pub ignored_bones: Vec<String>,
    pub warnings: Vec<String>,
}

pub fn validate_rig_binding(
    reference: &MotionSkeleton,
    candidate: &MotionSkeleton,
    policy: RigBindingPolicy,
) -> Result<RigBindingReport, MotionInterchangeError> {
    let mut candidate_indices = HashMap::with_capacity(candidate.bones.len());
    for (index, bone) in candidate.bones.iter().enumerate() {
        if candidate_indices
            .insert(bone.name.as_str(), index)
            .is_some()
        {
            return Err(MotionInterchangeError::RigMismatch(format!(
                "candidate skeleton has duplicate bone '{}'",
                bone.name
            )));
        }
    }

    let mut matched_bones = Vec::with_capacity(reference.bones.len());
    let mut warnings = Vec::new();
    for reference_bone in &reference.bones {
        let Some(&candidate_index) = candidate_indices.get(reference_bone.name.as_str()) else {
            return Err(MotionInterchangeError::RigMismatch(format!(
                "candidate skeleton is missing reference bone '{}'",
                reference_bone.name
            )));
        };
        let candidate_bone = &candidate.bones[candidate_index];
        let reference_parent = reference_bone
            .parent_index
            .map(|index| reference.bones[index].name.as_str());
        let candidate_parent = candidate_bone
            .parent_index
            .map(|index| candidate.bones[index].name.as_str());
        if reference_parent != candidate_parent {
            let message = format!(
                "bone '{}' parent mismatch: expected {:?}, found {:?}",
                reference_bone.name, reference_parent, candidate_parent
            );
            if policy == RigBindingPolicy::ExactHierarchy {
                return Err(MotionInterchangeError::RigMismatch(message));
            }
            warnings.push(message);
        }
        matched_bones.push(reference_bone.name.clone());
    }

    let ignored_bones = candidate
        .bones
        .iter()
        .filter(|bone| {
            !reference
                .bones
                .iter()
                .any(|reference_bone| reference_bone.name == bone.name)
        })
        .map(|bone| bone.name.clone())
        .collect();

    Ok(RigBindingReport {
        matched_bones,
        ignored_bones,
        warnings,
    })
}
