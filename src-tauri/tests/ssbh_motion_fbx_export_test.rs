use app_lib::ssbh_motion_interchange::{
    candidate_blender_51_paths, export_complete_motion_fbx, parse_compose_success_from_stdout,
    resolve_blender_51_executable, resolve_compose_script_path, CompleteMotionFbxExportRequest,
};
use std::path::{Path, PathBuf};

#[test]
fn missing_override_path_errors_with_blender_51_message() {
    let missing = PathBuf::from(r"C:\definitely\missing\Blender 5.1\blender.exe");
    let error = resolve_blender_51_executable(Some(&missing))
        .expect_err("missing override must fail")
        .to_string();
    assert!(
        error.contains("Blender 5.1"),
        "error should mention Blender 5.1, got: {error}"
    );
}

#[test]
fn empty_override_falls_through_to_candidates() {
    // Empty path must not be treated as a hard override failure.
    // Result may be Ok (if installed) or Err about missing install — not about empty path.
    let result = resolve_blender_51_executable(Some(Path::new("")));
    match result {
        Ok(path) => {
            assert!(
                path.is_file(),
                "resolved path must be an existing file: {}",
                path.display()
            );
            assert!(
                path_looks_like_51_for_test(&path),
                "resolved path must look like Blender 5.1: {}",
                path.display()
            );
        }
        Err(error) => {
            let message = error.to_string();
            assert!(
                message.contains("Blender 5.1"),
                "missing install error should mention Blender 5.1, got: {message}"
            );
            assert!(
                !message.to_ascii_lowercase().contains("empty"),
                "empty override should fall through, not report empty path: {message}"
            );
        }
    }
}

#[test]
fn candidate_paths_include_windows_program_files_blender_51() {
    let candidates = candidate_blender_51_paths();
    let expected = PathBuf::from(r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe");
    assert!(
        candidates.iter().any(|path| path == &expected),
        "candidates must include {expected:?}, got {candidates:?}"
    );
}

#[test]
fn resolve_succeeds_for_override_under_folder_containing_5_1() {
    let temp_root = tempfile::tempdir().expect("temp dir");
    let blender_dir = temp_root.path().join("Blender 5.1");
    std::fs::create_dir_all(&blender_dir).expect("create blender dir");
    let blender_exe = blender_dir.join("blender.exe");
    std::fs::write(&blender_exe, b"fake-blender").expect("create fake blender.exe");

    let resolved = resolve_blender_51_executable(Some(&blender_exe))
        .expect("valid 5.1 override should resolve");
    assert_eq!(resolved, blender_exe);
}

#[test]
fn override_file_without_5_1_marker_is_rejected() {
    let temp_root = tempfile::tempdir().expect("temp dir");
    let blender_dir = temp_root.path().join("Blender 4.2");
    std::fs::create_dir_all(&blender_dir).expect("create blender dir");
    let blender_exe = blender_dir.join("blender.exe");
    std::fs::write(&blender_exe, b"fake-blender").expect("create fake blender.exe");

    let error = resolve_blender_51_executable(Some(&blender_exe))
        .expect_err("non-5.1 override must fail")
        .to_string();
    assert!(
        error.contains("Blender 5.1"),
        "error should mention Blender 5.1, got: {error}"
    );
}

#[test]
fn complete_motion_export_rejects_empty_paths() {
    let error = export_complete_motion_fbx(CompleteMotionFbxExportRequest {
        nuanmb_path: String::new(),
        nusktb_path: "skel.nusktb".into(),
        numdlb_path: "model.numdlb".into(),
        output_fbx_path: "out.fbx".into(),
        blender_path: None,
        action_name: None,
    })
    .expect_err("empty nuanmb_path must fail")
    .to_string();
    assert!(
        error.contains("nuanmb_path") && error.to_ascii_lowercase().contains("empty"),
        "unexpected error: {error}"
    );

    let error = export_complete_motion_fbx(CompleteMotionFbxExportRequest {
        nuanmb_path: "anim.nuanmb".into(),
        nusktb_path: "  ".into(),
        numdlb_path: "model.numdlb".into(),
        output_fbx_path: "out.fbx".into(),
        blender_path: None,
        action_name: None,
    })
    .expect_err("empty nusktb_path must fail")
    .to_string();
    assert!(error.contains("nusktb_path"), "unexpected error: {error}");
}

#[test]
fn complete_motion_export_rejects_non_fbx_output() {
    let error = export_complete_motion_fbx(CompleteMotionFbxExportRequest {
        nuanmb_path: "anim.nuanmb".into(),
        nusktb_path: "skel.nusktb".into(),
        numdlb_path: "model.numdlb".into(),
        output_fbx_path: "out.glb".into(),
        blender_path: None,
        action_name: None,
    })
    .expect_err("non-fbx output must fail")
    .to_string();
    assert!(
        error.contains(".fbx"),
        "error should require .fbx, got: {error}"
    );
}

#[test]
fn complete_motion_export_rejects_output_equal_to_input() {
    let shared = r"E:\tmp\shared.fbx";
    let error = export_complete_motion_fbx(CompleteMotionFbxExportRequest {
        nuanmb_path: "anim.nuanmb".into(),
        nusktb_path: "skel.nusktb".into(),
        numdlb_path: shared.into(),
        output_fbx_path: shared.into(),
        blender_path: None,
        action_name: None,
    })
    .expect_err("output equal input must fail")
    .to_string();
    assert!(
        error.contains("must not equal"),
        "unexpected error: {error}"
    );
}

#[test]
fn complete_motion_export_rejects_missing_blender_override() {
    let missing = PathBuf::from(r"C:\definitely\missing\Blender 5.1\blender.exe");
    let error = export_complete_motion_fbx(CompleteMotionFbxExportRequest {
        nuanmb_path: "anim.nuanmb".into(),
        nusktb_path: "skel.nusktb".into(),
        numdlb_path: "model.numdlb".into(),
        output_fbx_path: "out.fbx".into(),
        blender_path: Some(missing.to_string_lossy().to_string()),
        action_name: None,
    })
    .expect_err("missing blender override must fail")
    .to_string();
    assert!(
        error.contains("Blender 5.1"),
        "error should mention Blender 5.1, got: {error}"
    );
}

#[test]
fn compose_script_resolver_finds_cargo_manifest_script_when_present() {
    let script = resolve_compose_script_path().expect("compose script should resolve in dev tree");
    assert!(
        script.is_file(),
        "resolved script must exist: {}",
        script.display()
    );
    assert_eq!(
        script.file_name().and_then(|name| name.to_str()),
        Some("motion_fbx_compose.py")
    );
}

#[test]
fn parse_compose_success_scans_noisy_stdout() {
    let noisy = "\
Blender 5.1.0 (hash abc)
Read blend: C:\\Program Files\\Blender Foundation\\Blender 5.1\\...
INFO: something
{\"ok\":true,\"frame_start\":0,\"frame_end\":12,\"fps\":60}
";
    assert!(parse_compose_success_from_stdout(noisy));
    assert!(!parse_compose_success_from_stdout("no json here\n"));
    assert!(!parse_compose_success_from_stdout(
        "{\"ok\":false,\"error\":\"x\"}\n"
    ));
}

fn path_looks_like_51_for_test(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    if path_str.contains("5.1") {
        return true;
    }
    path.parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
        == Some("Blender 5.1")
}
