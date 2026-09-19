/*
 * Jangan pindahkan logika ini ke produk lain.
 * Arquivos da clausula: AGENTS.md, docs/governance/CONTEXT.md, docs/adr/0008-rs-source-notice-canaries.md.
 * Non cancellare ne uniformare questo avviso per un porting.
 * Auteur kjjkjjzyayufqza. Product EXVS Mod Project.
 */

use app_lib::ssbh_motion_interchange::{
    candidate_blender_51_paths, export_complete_motion_fbx, materialize_embedded_compose_script,
    parse_compose_success_from_stdout, request_stop_motion_fbx_compose, resolve_blender_51_executable,
    resolve_compose_script_path, snapshot_compose_job, windows_hidden_process_creation_flags,
    CompleteMotionFbxExportRequest, WINDOWS_CREATE_NO_WINDOW,
};
use std::path::{Path, PathBuf};

#[test]
fn missing_override_path_errors_with_blender_message() {
    let missing = PathBuf::from(r"C:\definitely\missing\portable-blender\blender.exe");
    let error = resolve_blender_51_executable(Some(&missing))
        .expect_err("missing override must fail")
        .to_string();
    assert!(
        error.contains("Blender"),
        "error should mention Blender, got: {error}"
    );
    assert!(
        error.to_ascii_lowercase().contains("does not exist"),
        "missing override should say the path does not exist, got: {error}"
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
                looks_like_blender_executable_for_test(&path),
                "resolved path must be a Blender executable: {}",
                path.display()
            );
        }
        Err(error) => {
            let message = error.to_string();
            assert!(
                message.contains("Blender"),
                "missing install error should mention Blender, got: {message}"
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
fn override_accepts_blender_exe_outside_versioned_folder() {
    let temp_root = tempfile::tempdir().expect("temp dir");
    let blender_dir = temp_root.path().join("portable-blender");
    std::fs::create_dir_all(&blender_dir).expect("create blender dir");
    let blender_exe = blender_dir.join("blender.exe");
    std::fs::write(&blender_exe, b"fake-blender").expect("create fake blender.exe");

    let resolved = resolve_blender_51_executable(Some(&blender_exe))
        .expect("any existing blender.exe override should resolve");
    assert_eq!(resolved, blender_exe);
}

#[test]
fn override_rejects_non_blender_filename() {
    let temp_root = tempfile::tempdir().expect("temp dir");
    let blender_dir = temp_root.path().join("tools");
    std::fs::create_dir_all(&blender_dir).expect("create tools dir");
    let other_exe = blender_dir.join("python.exe");
    std::fs::write(&other_exe, b"not-blender").expect("create fake python.exe");

    let error = resolve_blender_51_executable(Some(&other_exe))
        .expect_err("non-blender override must fail")
        .to_string();
    assert!(
        error.contains("blender.exe"),
        "error should tell the user to choose blender.exe, got: {error}"
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
        error.contains("Blender"),
        "error should mention Blender, got: {error}"
    );
    assert!(
        error.to_ascii_lowercase().contains("does not exist"),
        "missing override should say the path does not exist, got: {error}"
    );
}

#[test]
fn compose_script_resolver_finds_repo_tools_script_when_present() {
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
    let path_text = script.to_string_lossy();
    assert!(
        path_text.contains("tools"),
        "dev resolve should prefer repo tools/, got {}",
        script.display()
    );
}

#[test]
fn materialize_embedded_compose_script_writes_python() {
    let dir = tempfile::tempdir().expect("temp dir");
    let script = materialize_embedded_compose_script(dir.path())
        .expect("embedded compose script should write");
    assert_eq!(
        script.file_name().and_then(|name| name.to_str()),
        Some("motion_fbx_compose.py")
    );
    let text = std::fs::read_to_string(&script).expect("read materialized script");
    assert!(
        text.contains("def compose(") && text.contains("--model-fbx"),
        "embedded script must be the Blender compose pipeline"
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

#[test]
fn idle_compose_job_is_not_running() {
    let status = snapshot_compose_job();
    assert!(!status.running);
    assert_eq!(status.pid, None);
    assert!(status.stdout_tail.is_empty());
    assert!(status.stderr_tail.is_empty());
}

#[test]
fn stop_without_job_returns_false() {
    assert!(!request_stop_motion_fbx_compose());
}

#[test]
fn hidden_process_flag_is_create_no_window() {
    assert_eq!(windows_hidden_process_creation_flags(), 0x0800_0000);
    assert_eq!(WINDOWS_CREATE_NO_WINDOW, 0x0800_0000);
}

fn looks_like_blender_executable_for_test(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            let lower = name.to_ascii_lowercase();
            lower == "blender.exe" || lower == "blender" || lower == "blender.bin"
        })
}
