//! Source-only compilation and literal coroutine-address protection.

use app_lib::msc_toolchain::mission_authoring::compile_authoring_source;

fn file_fixture() -> tempfile::TempDir {
    std::fs::create_dir_all("../tmp/mission-source-tests").unwrap();
    tempfile::tempdir_in("../tmp/mission-source-tests").unwrap()
}

#[test]
fn source_file_save_updates_only_the_selected_copy_and_preserves_exact_text() {
    use app_lib::msc_toolchain::mission_authoring::{read_source_file, save_source_file};
    let directory = file_fixture();
    let original = directory.path().join("original.c");
    let working = directory.path().join("working.c");
    let source = format!(
        "\u{feff}// Author notes\r\n{}",
        embedded_source().replace('\n', "\r\n")
    );
    std::fs::write(&original, &source).unwrap();
    std::fs::copy(&original, &working).unwrap();
    let loaded = read_source_file(&working).unwrap();
    assert_eq!(loaded, source);
    save_source_file(&working, Some(&loaded), &loaded).unwrap();
    assert_eq!(std::fs::read(&working).unwrap(), source.as_bytes());
    let edited = loaded.replace("global2 = 0x1d4c;", "global2 = 0x2328;");
    save_source_file(&working, Some(&loaded), &edited).unwrap();
    assert_eq!(read_source_file(&working).unwrap(), edited);
    assert_eq!(std::fs::read(&original).unwrap(), source.as_bytes());
    let exported = directory.path().join("export.c");
    save_source_file(&exported, None, &edited).unwrap();
    assert_eq!(read_source_file(&exported).unwrap(), edited);
}

#[test]
fn source_file_save_refuses_conflicts_invalid_code_and_unexpected_overwrites() {
    use app_lib::msc_toolchain::mission_authoring::save_source_file;
    let directory = file_fixture();
    let path = directory.path().join("working.c");
    let source = embedded_source();
    std::fs::write(&path, source).unwrap();
    assert!(save_source_file(&path, None, source)
        .unwrap_err()
        .contains("already exists"));
    assert!(save_source_file(&path, Some("stale snapshot"), source)
        .unwrap_err()
        .contains("changed"));
    assert!(save_source_file(&path, Some(source), "void broken() {").is_err());
    let drift = source.replace("global1 = 0x3e8;", "global1 = 0x3e8; global2 = 0;");
    assert!(save_source_file(&path, Some(source), &drift)
        .unwrap_err()
        .contains("address drift"));
    assert_eq!(std::fs::read_to_string(&path).unwrap(), source);
    std::fs::remove_file(&path).unwrap();
    assert!(save_source_file(&path, Some(source), source)
        .unwrap_err()
        .contains("changed"));
    assert!(!path.exists());
    assert!(save_source_file(&directory.path().join("missing/mission.c"), None, source).is_err());
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 0);
}

#[test]
fn source_file_io_enforces_size_extension_and_utf8_limits() {
    use app_lib::msc_toolchain::mission_authoring::{read_source_file, save_source_file};
    let directory = file_fixture();
    let path = directory.path().join("large.c");
    std::fs::write(&path, vec![b' '; 512 * 1024 + 1]).unwrap();
    assert!(read_source_file(&path).unwrap_err().contains("512 KiB"));
    assert!(save_source_file(&path, None, &" ".repeat(512 * 1024 + 1)).is_err());
    assert!(save_source_file(
        &directory.path().join("mission.json"),
        None,
        embedded_source()
    )
    .unwrap_err()
    .contains(".c"));
    let invalid = directory.path().join("invalid.c");
    std::fs::write(&invalid, [0xff, 0xfe]).unwrap();
    assert!(read_source_file(&invalid).unwrap_err().contains("UTF-8"));
}

#[test]
fn source_file_concurrent_saves_cannot_overwrite_a_newer_snapshot() {
    use app_lib::msc_toolchain::mission_authoring::save_source_file;
    let directory = file_fixture();
    let path = directory.path().join("concurrent.c");
    let source = embedded_source();
    std::fs::write(&path, source).unwrap();
    let results = std::thread::scope(|scope| {
        let first = scope.spawn(|| {
            save_source_file(
                &path,
                Some(source),
                &source.replace("global2 = 0x1d4c;", "global2 = 0x2328;"),
            )
        });
        let second = scope.spawn(|| {
            save_source_file(
                &path,
                Some(source),
                &source.replace("global2 = 0x1d4c;", "global2 = 0x1f40;"),
            )
        });
        [first.join().unwrap(), second.join().unwrap()]
    });
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert!(results.iter().any(|result| result
        .as_ref()
        .is_err_and(|error| error.contains("changed"))));
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
}

#[test]
fn source_file_failed_replace_keeps_read_only_destination_and_cleans_staging_file() {
    use app_lib::msc_toolchain::mission_authoring::save_source_file;
    let directory = file_fixture();
    let path = directory.path().join("readonly.c");
    let source = embedded_source();
    std::fs::write(&path, source).unwrap();
    let original_permissions = std::fs::metadata(&path).unwrap().permissions();
    let mut readonly = original_permissions.clone();
    readonly.set_readonly(true);
    std::fs::set_permissions(&path, readonly).unwrap();
    let result = save_source_file(
        &path,
        Some(source),
        &source.replace("global2 = 0x1d4c;", "global2 = 0x2328;"),
    );
    std::fs::set_permissions(&path, original_permissions).unwrap();
    assert!(result.unwrap_err().contains("read-only"));
    assert_eq!(std::fs::read_to_string(&path).unwrap(), source);
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
}

#[test]
fn source_file_reference_copy_survives_native_save_compile_and_round_trip() {
    use app_lib::msc_toolchain::mission_authoring::{read_source_file, save_source_file};
    let Ok(reference) = std::env::var("EXVS_MISSION_SOURCE") else {
        return;
    };
    let original = std::fs::read(&reference).unwrap();
    let directory = file_fixture();
    let path = directory.path().join("reference-copy.c");
    std::fs::write(&path, &original).unwrap();
    let loaded = read_source_file(&path).unwrap();
    let edited = std::fs::read_to_string("../tmp/mission-source-tests/reference-edited.c").unwrap();
    save_source_file(&path, Some(&loaded), &edited).unwrap();
    assert_eq!(read_source_file(&path).unwrap(), edited);
    assert!(!compile_authoring_source(&edited).unwrap().is_empty());
    assert_eq!(std::fs::read(&reference).unwrap(), original);
}

fn embedded_source() -> &'static str {
    let module = include_str!("../../src/services/missionTranspiler/template.ts");
    module
        .split("export const MISSION_C_TEMPLATE = String.raw`")
        .nth(1)
        .unwrap()
        .split("`;")
        .next()
        .unwrap()
}

#[test]
fn embedded_mission_compiles_without_any_original_file() {
    let bytes = compile_authoring_source(embedded_source()).unwrap();
    assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), 0x2fd);
    // A larger authored tail must not shift either fixed coroutine entry.
    let grown = embedded_source().replace(
        "global19 = 0xba15df91;",
        "global19 = 0xba15df91;\n    global4 = 0x1234;",
    );
    assert!(compile_authoring_source(&grown).unwrap().len() > bytes.len());
    let shifted = embedded_source().replace("global1 = 0x3e8;", "global1 = 0x3e8; global2 = 0;");
    assert!(compile_authoring_source(&shifted)
        .unwrap_err()
        .contains("address drift"));
}

