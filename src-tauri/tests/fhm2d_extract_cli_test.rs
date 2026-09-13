//! Integration tests for the fhm2d_extract CLI parse/run surface.
//!
//! Parse failures and type/layout acceptance are covered here via the shipped
//! `run_cli_with_args` entry point. Optional on-disk extract smoke runs only when
//! `FHM2D_EXTRACT_FIXTURE` is set to a real OB `.fhm2d` path.

use app_lib::fhm2d_extract_cli::run_cli_with_args;
use app_lib::format::fhm2d::{extract_fhm2d_to_folder_with_layout, ExtractLayout, Fhm2dFormat};
use std::fs;
use std::path::{Path, PathBuf};

fn unit_model_regression_artifact_root() -> PathBuf {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../tmp/fhm2d-extract/unit-model-bugs-25002001");
    fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn unit_model_regression_legacy_texture_name_uses_checked_relative_pointer() {
    let dir = tempfile::tempdir_in(unit_model_regression_artifact_root()).unwrap();
    let path = dir.path().join("legacy.nutexb");
    let mut bytes = vec![0u8; 0xb0];
    bytes[..4].copy_from_slice(b"HBSS");
    bytes[0x10..0x14].copy_from_slice(b" XET");
    bytes[0x14..0x16].copy_from_slice(&1u16.to_le_bytes());
    // Relocate the name away from the real sample's 0x58 address.
    bytes[0x20..0x28].copy_from_slice(&0x70u64.to_le_bytes());
    bytes[0x90..0x9f].copy_from_slice(b"legacy_specular");
    fs::write(&path, &bytes).unwrap();
    assert_eq!(app_lib::nutexb_lib::read_nutexb_name(&path).unwrap(), "legacy_specular");
    for pointer in [0, u64::MAX, 0x1000] {
        let mut invalid = bytes.clone();
        invalid[0x20..0x28].copy_from_slice(&pointer.to_le_bytes());
        fs::write(&path, invalid).unwrap();
        assert!(app_lib::nutexb_lib::read_nutexb_name(&path).is_err());
    }
    let mut empty = bytes.clone();
    empty[0x90] = 0;
    fs::write(&path, empty).unwrap();
    assert!(app_lib::nutexb_lib::read_nutexb_name(&path).is_err());
    bytes[0x90..].fill(b'x');
    fs::write(&path, &bytes).unwrap();
    assert!(app_lib::nutexb_lib::read_nutexb_name(&path).is_err());
    fs::write(&path, &bytes[..0x20]).unwrap();
    assert!(app_lib::nutexb_lib::read_nutexb_name(&path).is_err());
}

#[test]
fn unit_model_regression_25002001_extracts_named_models_without_changing_payloads() {
    use app_lib::format::fhm2d::extract_fhm2d_to_memory_impl;
    use app_lib::format::unit_model_extract::extract_unit_model_fhm2d_to_folder_impl;

    let source = std::env::var_os("UNIT_MODEL_25002001_FIXTURE").map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(
            "E:/OBHK0.3_v27/data/x64/dplcache_release/0x4222d007.fhm2d"));
    if !source.is_file() {
        eprintln!("skip real OB sample: set UNIT_MODEL_25002001_FIXTURE");
        return;
    }
    let bytes = fs::read(&source).unwrap();
    let original_hash = crc32fast::hash(&bytes);
    let memory = extract_fhm2d_to_memory_impl(&bytes, "hildol", Some(Fhm2dFormat::Character)).unwrap();
    assert!(memory.naming_error.is_none(), "{:?}", memory.naming_error);
    let dir = tempfile::Builder::new().prefix("after-")
        .tempdir_in(unit_model_regression_artifact_root()).unwrap();
    let root = dir.path().join("hildol");
    let result = extract_unit_model_fhm2d_to_folder_impl(
        source.to_str().unwrap(), root.to_str().unwrap(), false,
    ).unwrap();
    assert_eq!(result.total_files, 119);
    assert_eq!(result.model_count, 11);
    let doc: serde_json::Value = serde_json::from_slice(
        &fs::read(&result.structure_json_path).unwrap()).unwrap();
    let files = doc["SubFileData"].as_array().unwrap();
    let mut legacy_count = 0;
    let mut model_count = 0;
    for record in files {
        let index = record["fileIndex"].as_i64().unwrap() as i32;
        let original = memory.files.iter().find(|f| f.file_index == index).unwrap();
        let relative = record["fileUrl"].as_str().unwrap().replace('\\', "/");
        let path = dir.path().join(relative.trim_start_matches("./"));
        assert_eq!(fs::read(&path).unwrap(), original.data, "fileIndex={index}");
        if original.file_type == ".nutexb" {
            let name = app_lib::nutexb_lib::read_nutexb_name(&path).unwrap();
            assert!(!name.is_empty());
            if original.data.starts_with(b"HBSS") { legacy_count += 1; }
        }
        if original.file_type == ".numdlb" {
            assert!(relative.contains("/models/025gigloo_002hildol_001"), "{relative}");
            app_lib::ssbh_preview::load_model_preview_bundle(path.to_str().unwrap())
                .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            model_count += 1;
        }
    }
    assert_eq!(legacy_count, 3);
    assert_eq!(model_count, 11);
    assert_eq!(crc32fast::hash(&fs::read(&source).unwrap()), original_hash);
    let kept = dir.keep();
    eprintln!("Named Unit Model Editor fixture retained at {}", kept.display());
}

#[test]
fn help_mentions_required_type_and_layout() {
    let help = run_cli_with_args(["--help"]).expect("help");
    assert!(help.contains("--type"));
    assert!(help.contains("--layout"));
    assert!(help.contains("folder"));
    assert!(help.contains("flat"));
    assert!(help.contains("character"));
    assert!(help.contains("motion"));
    assert!(help.contains("striker_table"));
}

#[test]
fn missing_type_is_hard_error() {
    let err = run_cli_with_args(["fixture.fhm2d", "--output", "out_dir", "--layout", "flat"])
        .expect_err("type required");
    let lower = err.to_ascii_lowercase();
    assert!(
        lower.contains("type") || lower.contains("required"),
        "{err}"
    );
}

#[test]
fn missing_layout_is_hard_error() {
    let err = run_cli_with_args([
        "fixture.fhm2d",
        "--output",
        "out_dir",
        "--type",
        "character",
    ])
    .expect_err("layout required");
    let lower = err.to_ascii_lowercase();
    assert!(
        lower.contains("layout") || lower.contains("required"),
        "{err}"
    );
}

#[test]
fn invalid_type_is_hard_error() {
    let err = run_cli_with_args([
        "fixture.fhm2d",
        "--output",
        "out_dir",
        "--type",
        "banana",
        "--layout",
        "flat",
    ])
    .expect_err("invalid type");
    assert!(
        err.contains("Unsupported fhm2d type") || err.contains("banana"),
        "{err}"
    );
}

#[test]
fn striker_table_type_is_accepted() {
    assert_eq!(
        Fhm2dFormat::parse_cli("striker_table").unwrap(),
        Fhm2dFormat::StrikerTable
    );
    assert_eq!(
        Fhm2dFormat::parse_cli("fhm2d_striker_table").unwrap(),
        Fhm2dFormat::StrikerTable
    );
    assert_eq!(Fhm2dFormat::StrikerTable.as_cli_str(), "striker_table");
    assert!(Fhm2dFormat::supported_type_list().contains("striker_table"));
}

#[test]
fn all_documented_types_parse_via_cli_flag() {
    let types = [
        "character",
        "effect",
        "motion",
        "msc",
        "sound",
        "character_param",
        "character_cost",
        "striker_table",
        "all_nutexb",
        "stage_list",
        "list",
        "bgm_list",
        "fhm2d_list",
        "fhm2d_motion",
        "fhm2d_effect",
        "fhm2d_striker_table",
    ];
    for ty in types {
        // Source file need not exist: parse succeeds, extract fails later.
        // We only assert parse of type/layout by checking the error is I/O, not type.
        let err = run_cli_with_args([
            "definitely_missing_fhm2d_extract_fixture.fhm2d",
            "--output",
            "tmp_out_should_not_matter",
            "--type",
            ty,
            "--layout",
            "flat",
        ])
        .expect_err("missing source should fail after parse");
        assert!(
            !err.contains("Unsupported fhm2d type"),
            "type {ty} rejected: {err}"
        );
        assert!(
            err.contains("Failed to read")
                || err.contains("os error")
                || err.contains("cannot find")
                || err.contains("The system cannot find"),
            "type {ty}: unexpected error after parse: {err}"
        );
    }
}

#[test]
fn both_layouts_parse_via_cli_flag() {
    for layout in ["folder", "flat"] {
        let err = run_cli_with_args([
            "definitely_missing_fhm2d_extract_fixture.fhm2d",
            "-o",
            "tmp_out",
            "-t",
            "character",
            "-l",
            layout,
        ])
        .expect_err("missing source");
        assert!(
            !err.to_ascii_lowercase().contains("unsupported layout"),
            "layout {layout} rejected: {err}"
        );
    }
}

/// When a real fixture is available, extract twice (flat + folder) through the
/// public extract API that the CLI ships.
#[test]
fn extract_flat_and_folder_when_fixture_present() {
    let Some(source) = resolve_fixture() else {
        eprintln!(
            "skip extract smoke: set FHM2D_EXTRACT_FIXTURE or place a .fhm2d under E:\\XB\\extract_tools"
        );
        return;
    };

    let root = std::env::temp_dir().join(format!("fhm2d_extract_cli_test_{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("temp root");

    let flat_out = root.join("out_flat");
    let folder_out = root.join("out_folder");
    fs::create_dir_all(&flat_out).unwrap();
    fs::create_dir_all(&folder_out).unwrap();

    // character naming works on most packs; layout is independent of type.
    let format = Fhm2dFormat::Character;

    extract_fhm2d_to_folder_with_layout(
        source.to_str().unwrap(),
        flat_out.to_str().unwrap(),
        Some(format),
        None,
        false,
        ExtractLayout::Flat,
    )
    .expect("flat extract");

    extract_fhm2d_to_folder_with_layout(
        source.to_str().unwrap(),
        folder_out.to_str().unwrap(),
        Some(format),
        None,
        false,
        ExtractLayout::Folder,
    )
    .expect("folder extract");

    assert!(
        flat_out
            .join("..")
            .join(format!(
                "{}_structure.json",
                flat_out.file_name().unwrap().to_string_lossy()
            ))
            .exists()
            || PathBuf::from(format!("{}_structure.json", flat_out.display())).exists(),
        "structure json missing for flat out"
    );
    assert!(
        PathBuf::from(format!("{}_structure.json", flat_out.display())).exists(),
        "expected {}_structure.json",
        flat_out.display()
    );
    assert!(
        PathBuf::from(format!("{}_structure.json", folder_out.display())).exists(),
        "expected {}_structure.json",
        folder_out.display()
    );

    let flat_files = collect_files(&flat_out);
    let folder_files = collect_files(&folder_out);
    assert!(!flat_files.is_empty(), "flat extract wrote no files");
    assert!(!folder_files.is_empty(), "folder extract wrote no files");

    // Flat layout: every relative path is a single segment (basename only).
    for rel in &flat_files {
        assert_eq!(
            rel.components().count(),
            1,
            "flat layout must not nest archive folders: {}",
            rel.display()
        );
    }

    // Folder layout may be multi-segment when the archive has folders; at minimum
    // it must write the same file count as flat (same payload).
    assert_eq!(
        flat_files.len(),
        folder_files.len(),
        "flat/folder file counts differ"
    );

    let _ = fs::remove_dir_all(&root);
}

fn resolve_fixture() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("FHM2D_EXTRACT_FIXTURE") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Some(path);
        }
    }
    let candidates = [
        r"E:\XB\extract_tools\0x18AF7533.fhm2d",
        r"E:\XB\extract_tools\0x2E7A7C3A.fhm2d",
    ];
    for c in candidates {
        let path = PathBuf::from(c);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn collect_files(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    fn walk(dir: &Path, base: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, base, out);
            } else if path.is_file() {
                if let Ok(rel) = path.strip_prefix(base) {
                    out.push(rel.to_path_buf());
                }
            }
        }
    }
    walk(root, root, &mut out);
    out.sort();
    out
}
