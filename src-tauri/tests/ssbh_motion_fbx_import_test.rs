use app_lib::ssbh_motion_interchange::{
    import_motion_fbx, inspect_motion_fbx_file, read_nuanmb_as_motion_clip, write_cascadeur_bridge,
    MotionFbxImportRequest, RigBindingPolicy,
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
        name: None,
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
    let clip = read_nuanmb_as_motion_clip(
        &animation_path,
        &skeleton_path,
        "fixture_action".to_string(),
    )
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

#[test]
fn transform_nuanmb_clip_trims_and_writes_parseable_output() {
    use app_lib::ssbh_motion_interchange::{
        transform_nuanmb_clip, ClipOperation, NuanmbClipTransformRequest,
    };

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
    assert!(report
        .warnings
        .iter()
        .any(|warning| warning.contains("transform-only")));

    let parsed = AnimData::from_file(&output_path).unwrap();
    assert_eq!(parsed.final_frame_index, 1.0);
}

#[test]
#[ignore = "requires SSBH_MOTION_REAL_NUANMB and SSBH_MOTION_REAL_NUSKTB"]
fn real_nuanmb_round_trips_through_manifest_free_import() {
    let directory = tempfile::tempdir().unwrap();
    let nuanmb_path = directory.path().join("real.nuanmb");
    let nusktb_path = directory.path().join("real.nusktb");
    std::fs::copy(
        std::env::var("SSBH_MOTION_REAL_NUANMB").unwrap(),
        &nuanmb_path,
    )
    .unwrap();
    std::fs::copy(
        std::env::var("SSBH_MOTION_REAL_NUSKTB").unwrap(),
        &nusktb_path,
    )
    .unwrap();

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

#[test]
#[ignore = "requires real data env vars and a local Blender 5.1 install"]
fn blender_roundtrip_reimports_complete_motion_fbx() {
    use app_lib::ssbh_motion_interchange::{
        export_complete_motion_fbx, resolve_blender_51_executable, CompleteMotionFbxExportRequest,
    };

    let directory = tempfile::tempdir().unwrap();
    let nuanmb_path = directory.path().join("real.nuanmb");
    let nusktb_path = directory.path().join("real.nusktb");
    std::fs::copy(
        std::env::var("SSBH_MOTION_REAL_NUANMB").unwrap(),
        &nuanmb_path,
    )
    .unwrap();
    std::fs::copy(
        std::env::var("SSBH_MOTION_REAL_NUSKTB").unwrap(),
        &nusktb_path,
    )
    .unwrap();
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
    // Collect the worst drift per bone so a failure names the offenders
    // instead of stopping at the first bad sample.
    let bone_count = source.skeleton.bones.len();
    let mut worst_rotation_dot = vec![1.0_f32; bone_count];
    let mut worst_translation = vec![0.0_f32; bone_count];
    for (expected_frame, actual_frame) in source.frames.iter().zip(&rebuilt.frames) {
        for (bone_index, (expected, actual)) in expected_frame
            .local_transforms
            .iter()
            .zip(&actual_frame.local_transforms)
            .enumerate()
        {
            let dot = expected.rotation.dot(actual.rotation).abs();
            if dot < worst_rotation_dot[bone_index] {
                worst_rotation_dot[bone_index] = dot;
            }
            let drift = (expected.translation - actual.translation).length();
            if drift > worst_translation[bone_index] {
                worst_translation[bone_index] = drift;
            }
        }
    }
    let mut offenders: Vec<String> = Vec::new();
    for bone_index in 0..bone_count {
        // Blender import/export applies its own float conversions; allow a
        // looser tolerance than the pure-Rust round trip.
        if worst_rotation_dot[bone_index] <= 0.999 || worst_translation[bone_index] >= 1.0e-2 {
            offenders.push(format!(
                "bone {bone_index} '{}': worst rotation dot {:.6}, worst translation drift {:.6} (frame0 src rot {:?} tr {:?} vs rebuilt rot {:?} tr {:?})",
                source.skeleton.bones[bone_index].name,
                worst_rotation_dot[bone_index],
                worst_translation[bone_index],
                source.frames[0].local_transforms[bone_index].rotation,
                source.frames[0].local_transforms[bone_index].translation,
                rebuilt.frames[0].local_transforms[bone_index].rotation,
                rebuilt.frames[0].local_transforms[bone_index].translation,
            ));
        }
    }
    assert!(
        offenders.is_empty(),
        "Blender round-trip drift on {} of {bone_count} bones:\n{}",
        offenders.len(),
        offenders.join("\n")
    );
}
