use app_lib::ssbh_motion_interchange::{
    export_nuanmb_to_cascadeur_bridge, import_cascadeur_bridge_to_nuanmb, read_cascadeur_bridge,
    read_nuanmb_as_motion_clip, validate_rig_binding, write_cascadeur_bridge,
    write_motion_clip_as_nuanmb, CascadeurBridgeManifest, CascadeurToNuanmbRequest, MotionBone,
    MotionClip, MotionFrame, MotionSkeleton, NuanmbToCascadeurRequest, RigBindingPolicy,
};
use glam::{Mat4, Quat, Vec3};
use ssbh_data::{
    anim_data::{
        AnimData, GroupData, GroupType, NodeData, TrackData, TrackValues, Transform, TransformFlags,
    },
    skel_data::{BillboardType, BoneData, SkelData},
};

fn identity_transform() -> Transform {
    Transform {
        scale: Vec3::ONE,
        rotation: Quat::IDENTITY,
        translation: Vec3::ZERO,
    }
}

#[test]
fn motion_clip_rejects_frame_with_wrong_bone_count() {
    let clip = MotionClip {
        name: "invalid".to_string(),
        sample_rate_hz: 60,
        skeleton: MotionSkeleton {
            bones: vec![MotionBone {
                name: "ROOT".to_string(),
                parent_index: None,
                rest_local: identity_transform(),
            }],
        },
        frames: vec![MotionFrame {
            local_transforms: Vec::new(),
        }],
    };

    let error = clip.validate().unwrap_err().to_string();
    assert!(error.contains("bone count"), "unexpected error: {error}");
}

#[test]
fn exact_rig_binding_rejects_changed_parent() {
    let reference = MotionSkeleton {
        bones: vec![
            MotionBone {
                name: "ROOT".to_string(),
                parent_index: None,
                rest_local: identity_transform(),
            },
            MotionBone {
                name: "HAND".to_string(),
                parent_index: Some(0),
                rest_local: identity_transform(),
            },
        ],
    };
    let candidate = MotionSkeleton {
        bones: vec![
            MotionBone {
                name: "ROOT".to_string(),
                parent_index: None,
                rest_local: identity_transform(),
            },
            MotionBone {
                name: "HAND".to_string(),
                parent_index: None,
                rest_local: identity_transform(),
            },
        ],
    };

    let error = validate_rig_binding(&reference, &candidate, RigBindingPolicy::ExactHierarchy)
        .unwrap_err()
        .to_string();
    assert!(error.contains("parent"), "unexpected error: {error}");
}

#[test]
fn cascadeur_import_request_defaults_to_exact_hierarchy_binding() {
    let request: CascadeurToNuanmbRequest = serde_json::from_str(
        r#"{
            "fbxPath": "action.fbx",
            "bridgeManifestPath": "bridge.json",
            "nusktbPath": "skeleton.nusktb",
            "outputNuanmbPath": "output.nuanmb"
        }"#,
    )
    .unwrap();

    assert_eq!(request.rig_binding_policy, RigBindingPolicy::ExactHierarchy);
}

fn write_sparse_transform_fixture() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf) {
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
    let animation = AnimData {
        major_version: 1,
        minor_version: 2,
        final_frame_index: 0.0,
        groups: vec![GroupData {
            group_type: GroupType::Transform,
            nodes: vec![
                NodeData {
                    name: "ROOT".to_string(),
                    tracks: vec![TrackData {
                        name: "Transform".to_string(),
                        compensate_scale: false,
                        transform_flags: TransformFlags::default(),
                        values: TrackValues::Transform(vec![identity_transform()]),
                    }],
                },
                NodeData {
                    name: "HAND".to_string(),
                    tracks: vec![TrackData {
                        name: "Transform".to_string(),
                        compensate_scale: false,
                        transform_flags: TransformFlags {
                            override_translation: true,
                            override_rotation: false,
                            override_scale: true,
                            override_compensate_scale: false,
                        },
                        values: TrackValues::Transform(vec![Transform {
                            scale: Vec3::ONE,
                            rotation: Quat::from_rotation_z(std::f32::consts::FRAC_PI_2),
                            translation: Vec3::ZERO,
                        }]),
                    }],
                },
            ],
        }],
    };
    animation
        .to_anim_v12_compressed()
        .unwrap()
        .write_to_file(&animation_path)
        .unwrap();
    (directory, skeleton_path, animation_path)
}

#[test]
fn nuanmb_sampling_uses_rest_translation_for_sparse_transform_tracks() {
    let (_directory, skeleton_path, animation_path) = write_sparse_transform_fixture();

    let clip =
        read_nuanmb_as_motion_clip(&animation_path, &skeleton_path, "sparse".to_string()).unwrap();

    assert_eq!(
        clip.frames[0].local_transforms[1].translation,
        Vec3::new(5.0, 0.0, 0.0)
    );
    assert!(clip.frames[0].local_transforms[1]
        .scale
        .abs_diff_eq(Vec3::ONE, 1.0e-5));
}

fn test_motion_clip() -> MotionClip {
    MotionClip {
        name: "edited_action".to_string(),
        sample_rate_hz: 60,
        skeleton: MotionSkeleton {
            bones: vec![MotionBone {
                name: "ROOT".to_string(),
                parent_index: None,
                rest_local: identity_transform(),
            }],
        },
        frames: vec![
            MotionFrame {
                local_transforms: vec![identity_transform()],
            },
            MotionFrame {
                local_transforms: vec![Transform {
                    scale: Vec3::ONE,
                    rotation: Quat::from_rotation_y(std::f32::consts::FRAC_PI_2),
                    translation: Vec3::new(1.0, 0.0, 0.0),
                }],
            },
        ],
    }
}

#[test]
fn nuanmb_encoder_preserves_template_non_transform_groups() {
    let directory = tempfile::tempdir().unwrap();
    let template_path = directory.path().join("template.nuanmb");
    let output_path = directory.path().join("output.nuanmb");
    let template = AnimData {
        major_version: 1,
        minor_version: 2,
        final_frame_index: 0.0,
        groups: vec![GroupData {
            group_type: GroupType::Visibility,
            nodes: vec![NodeData {
                name: "body_mesh".to_string(),
                tracks: vec![TrackData {
                    name: "Visibility".to_string(),
                    compensate_scale: false,
                    transform_flags: TransformFlags::default(),
                    values: TrackValues::Boolean(vec![true]),
                }],
            }],
        }],
    };
    template
        .to_anim_v12_compressed()
        .unwrap()
        .write_to_file(&template_path)
        .unwrap();

    write_motion_clip_as_nuanmb(&test_motion_clip(), Some(&template_path), &output_path).unwrap();

    let output = AnimData::from_file(&output_path).unwrap();
    assert!(output
        .groups
        .iter()
        .any(|group| group.group_type == GroupType::Visibility));
    let transform = output
        .groups
        .iter()
        .find(|group| group.group_type == GroupType::Transform)
        .unwrap();
    assert_eq!(transform.nodes.len(), 1);
    let track = &transform.nodes[0].tracks[0];
    assert_eq!(
        track.transform_flags,
        TransformFlags::default(),
        "bridge output must retain explicit scale, rotation, and translation channels"
    );
    assert_eq!(output.final_frame_index, 1.0);
}

#[test]
fn bridge_manifest_rejects_reference_skeleton_fingerprint_mismatch() {
    let manifest = CascadeurBridgeManifest::from_motion_clip(&test_motion_clip()).unwrap();
    let mismatched_skeleton = MotionSkeleton {
        bones: vec![
            MotionBone {
                name: "ROOT".to_string(),
                parent_index: None,
                rest_local: identity_transform(),
            },
            MotionBone {
                name: "EXTRA".to_string(),
                parent_index: Some(0),
                rest_local: identity_transform(),
            },
        ],
    };

    let error = manifest
        .validate_reference_skeleton(&mismatched_skeleton)
        .unwrap_err()
        .to_string();
    assert!(error.contains("fingerprint"), "unexpected error: {error}");
}

#[test]
fn cascadeur_bridge_writes_one_named_fbx_animation_stack() {
    let directory = tempfile::tempdir().unwrap();

    let bridge = write_cascadeur_bridge(directory.path(), &test_motion_clip()).unwrap();
    let scene = ufbx::load_file(
        bridge.motion_fbx_path.to_str().unwrap(),
        ufbx::LoadOpts::default(),
    )
    .unwrap_or_else(|error| {
        panic!(
            "failed to load {}: {} — {}",
            bridge.motion_fbx_path.display(),
            error.description,
            error.info()
        )
    });

    assert_eq!(scene.anim_stacks.len(), 1);
    assert_eq!(scene.anim_stacks[0].element.name, "edited_action");
}

#[test]
fn cascadeur_bridge_writes_complete_fbx_scene_metadata() {
    let directory = tempfile::tempdir().unwrap();
    let bridge = write_cascadeur_bridge(directory.path(), &test_motion_clip()).unwrap();
    let bytes = std::fs::read(&bridge.motion_fbx_path).unwrap();

    for required_node in [
        b"CreationTimeStamp".as_slice(),
        b"SceneInfo".as_slice(),
        b"TimeMode".as_slice(),
        b"TimeSpanStart".as_slice(),
        b"Takes".as_slice(),
        b"edited_action".as_slice(),
    ] {
        assert!(
            bytes.windows(required_node.len()).any(|window| window == required_node),
            "missing required FBX scene metadata node {:?}",
            String::from_utf8_lossy(required_node),
        );
    }
}

#[test]
fn cascadeur_bridge_reader_recovers_sampled_local_transforms() {
    let directory = tempfile::tempdir().unwrap();
    let source = test_motion_clip();
    let bridge = write_cascadeur_bridge(directory.path(), &source).unwrap();

    let (imported, report) = read_cascadeur_bridge(
        &bridge.motion_fbx_path,
        &bridge.manifest_path,
        &source.skeleton,
        Some("edited_action"),
        RigBindingPolicy::ExactHierarchy,
    )
    .unwrap();

    assert_eq!(report.matched_bones, vec!["ROOT"]);
    assert_eq!(imported.frames.len(), source.frames.len());
    assert!(imported.frames[1].local_transforms[0]
        .translation
        .abs_diff_eq(Vec3::new(1.0, 0.0, 0.0), 1.0e-4));
    let dot = imported.frames[1].local_transforms[0]
        .rotation
        .dot(source.frames[1].local_transforms[0].rotation)
        .abs();
    assert!(dot > 0.9999, "rotation dot product was {dot}");
}

#[test]
fn cascadeur_bridge_preserves_namespace_bone_names() {
    let directory = tempfile::tempdir().unwrap();
    let mut source = test_motion_clip();
    source.skeleton.bones[0].name = "rig:ROOT".to_string();

    let bridge = write_cascadeur_bridge(directory.path(), &source).unwrap();
    let (imported, report) = read_cascadeur_bridge(
        &bridge.motion_fbx_path,
        &bridge.manifest_path,
        &source.skeleton,
        Some("edited_action"),
        RigBindingPolicy::ExactHierarchy,
    )
    .unwrap();

    assert_eq!(report.matched_bones, vec!["rig:ROOT"]);
    assert_eq!(imported.skeleton.bones[0].name, "rig:ROOT");
}

#[test]
fn global_service_exports_and_imports_a_parseable_nuanmb() {
    let (directory, skeleton_path, animation_path) = write_sparse_transform_fixture();
    let bridge_dir = directory.path().join("bridge");
    let output_path = directory.path().join("imported.nuanmb");

    let exported = export_nuanmb_to_cascadeur_bridge(NuanmbToCascadeurRequest {
        nuanmb_path: animation_path.to_string_lossy().to_string(),
        nusktb_path: skeleton_path.to_string_lossy().to_string(),
        output_directory: bridge_dir.to_string_lossy().to_string(),
        action_name: Some("cascadeur_action".to_string()),
    })
    .unwrap();
    assert_eq!(exported.action_name, "cascadeur_action");

    let imported = import_cascadeur_bridge_to_nuanmb(CascadeurToNuanmbRequest {
        fbx_path: bridge_dir.join("motion.fbx").to_string_lossy().to_string(),
        bridge_manifest_path: bridge_dir.join("bridge.json").to_string_lossy().to_string(),
        nusktb_path: skeleton_path.to_string_lossy().to_string(),
        output_nuanmb_path: output_path.to_string_lossy().to_string(),
        animation_stack_name: Some("cascadeur_action".to_string()),
        template_nuanmb_path: Some(animation_path.to_string_lossy().to_string()),
        rig_binding_policy: RigBindingPolicy::ExactHierarchy,
    })
    .unwrap();
    assert_eq!(imported.frame_count, 1);

    let parsed = AnimData::from_file(output_path).unwrap();
    assert_eq!((parsed.major_version, parsed.minor_version), (1, 2));
}

#[test]
#[ignore = "requires SSBH_MOTION_REAL_NUANMB and SSBH_MOTION_REAL_NUSKTB"]
fn real_gyan_nuanmb_roundtrips_through_cascadeur_bridge() {
    let nuanmb_path = std::env::var("SSBH_MOTION_REAL_NUANMB").unwrap();
    let nusktb_path = std::env::var("SSBH_MOTION_REAL_NUSKTB").unwrap();
    let source = read_nuanmb_as_motion_clip(
        std::path::Path::new(&nuanmb_path),
        std::path::Path::new(&nusktb_path),
        "gyan_real".to_string(),
    )
    .unwrap();
    let directory = tempfile::tempdir().unwrap();
    let bridge = write_cascadeur_bridge(directory.path(), &source).unwrap();
    let (from_fbx, _) = read_cascadeur_bridge(
        &bridge.motion_fbx_path,
        &bridge.manifest_path,
        &source.skeleton,
        Some("gyan_real"),
        RigBindingPolicy::ExactHierarchy,
    )
    .unwrap();
    let output_path = directory.path().join("roundtrip.nuanmb");
    write_motion_clip_as_nuanmb(&from_fbx, None, &output_path).unwrap();
    let rebuilt = read_nuanmb_as_motion_clip(
        &output_path,
        std::path::Path::new(&nusktb_path),
        "gyan_rebuilt".to_string(),
    )
    .unwrap();

    assert_eq!(rebuilt.frames.len(), source.frames.len());
    assert_eq!(rebuilt.skeleton.bones.len(), source.skeleton.bones.len());
    for (frame_index, ((expected_frame, fbx_frame), actual_frame)) in source
        .frames
        .iter()
        .zip(&from_fbx.frames)
        .zip(&rebuilt.frames)
        .enumerate()
    {
        for (bone_index, ((expected, from_fbx), actual)) in expected_frame
            .local_transforms
            .iter()
            .zip(&fbx_frame.local_transforms)
            .zip(&actual_frame.local_transforms)
            .enumerate()
        {
            assert!(
                expected.translation.abs_diff_eq(actual.translation, 2.0e-3),
                "frame {frame_index} bone {bone_index} '{}' translation changed: source={:?}, fbx={:?}, rebuilt={:?}",
                source.skeleton.bones[bone_index].name,
                expected.translation,
                from_fbx.translation,
                actual.translation,
            );
            assert!(
                expected.scale.abs_diff_eq(actual.scale, 2.0e-3),
                "frame {frame_index} bone {bone_index} scale changed"
            );
            assert!(
                expected.rotation.dot(actual.rotation).abs() > 0.9999,
                "frame {frame_index} bone {bone_index} rotation changed"
            );
        }
    }
}
