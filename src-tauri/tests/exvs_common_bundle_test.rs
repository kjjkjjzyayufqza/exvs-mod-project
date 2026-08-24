use app_lib::format::exvs_common::{
    add_common_shl_model_record, add_exvs_common_model, add_exvs_common_texture,
    classify_common_resource, extract_exvs_common_bundle_impl, install_repacked_mod_output,
    materialize_exvs_common_extraction, remove_common_shl_model_records, remove_exvs_common_model,
    remove_exvs_common_texture, repack_exvs_common_bundle_impl, resolve_exvs_common_bundle_paths,
    validate_exvs_common_bundle, CommonResourceKind, EXVS_COMMON_HASH_NAME,
    EXVS_COMMON_NEW_MODEL_TYPE, EXVS_COMMON_PACKAGE_NAME,
};
use app_lib::format::fhm2d::Fhm2dFormat;
use app_lib::format::fhm2d::{InMemoryFhm2dExtraction, InMemoryFhm2dFile};
use std::path::PathBuf;

#[test]
fn exvs_common_type_accepts_modern_cli_spellings() {
    for spelling in ["exvs_common", "exvs-common", "fhm2d_exvs_common"] {
        assert_eq!(
            Fhm2dFormat::parse_cli(spelling).expect("EXVS common spelling"),
            Fhm2dFormat::ExvsCommon,
            "spelling {spelling}"
        );
    }
    assert_eq!(Fhm2dFormat::ExvsCommon.as_cli_str(), "exvs_common");
    assert!(Fhm2dFormat::supported_type_list().contains("exvs_common"));
}

#[test]
fn common_paths_are_fixed_to_the_singleton_package() {
    let paths = resolve_exvs_common_bundle_paths(
        r"E:\workspace",
        r"E:\game\dplcache_release",
        r"E:\game\mod",
    )
    .expect("resolve common paths");

    assert_eq!(
        paths.source_fhm2d,
        PathBuf::from(r"E:\game\dplcache_release\0xCB665375.fhm2d")
    );
    assert_eq!(
        paths.model_root,
        PathBuf::from(r"E:\workspace\002chara\000common_000common_001")
    );
    assert_eq!(
        paths.structure_json,
        PathBuf::from(r"E:\workspace\002chara\000common_000common_001_structure.json")
    );
    assert_eq!(
        paths.mod_fhm2d,
        PathBuf::from(r"E:\game\mod\0xCB665375.fhm2d")
    );
    assert_eq!(EXVS_COMMON_HASH_NAME, "0xCB665375");
    assert_eq!(EXVS_COMMON_PACKAGE_NAME, "000common_000common_001");
}

#[test]
fn common_repack_overwrites_existing_mod_output_without_backup() {
    let temp = tempfile::tempdir().expect("temp dir");
    let output = temp.path().join("0xCB665375.fhm2d");
    std::fs::write(&output, b"old-common").expect("write existing mod output");
    let staging_dir = temp.path().join(".exvs-common-repack-stage");
    std::fs::create_dir(&staging_dir).expect("create staging dir");
    let staging = staging_dir.join("0xCB665375.fhm2d");
    std::fs::write(&staging, b"new-common").expect("write staging output");

    install_repacked_mod_output(&staging, &output).expect("overwrite existing mod output");

    assert_eq!(
        std::fs::read(&output).expect("read overwritten output"),
        b"new-common"
    );
    assert!(!staging.exists());
    let leftover: Vec<String> = std::fs::read_dir(temp.path())
        .expect("read mod parent")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.contains("_backup_"))
        .collect();
    assert!(
        leftover.is_empty(),
        "repack must not leave backup files: {leftover:?}"
    );
}

#[test]
fn classification_uses_internal_names_not_file_position() {
    let stage_intro = file(
        8123,
        ".nuanmb",
        b"HBSS\0MINA\0STGIntro017.nuanmx.scaled\0camera1\0".to_vec(),
    );
    let classified = classify_common_resource(&stage_intro);
    assert_eq!(classified.kind, CommonResourceKind::Camera);
    assert_eq!(
        classified.relative_path,
        PathBuf::from(r"camera\menu\stgintro017.nuanmb")
    );

    let texture = file(
        -91,
        ".nutexb",
        synthetic_nutexb("000common_000common_001_diffuse"),
    );
    let classified = classify_common_resource(&texture);
    assert_eq!(classified.kind, CommonResourceKind::Texture);
    assert_eq!(
        classified.relative_path,
        PathBuf::from(r"textures\000common_000common_001_diffuse.nutexb")
    );
}

#[test]
fn unknown_resources_get_a_stable_content_hash_name() {
    let first = file(1, ".bin", b"unrecognized common payload".to_vec());
    let shuffled = file(9000, ".bin", b"unrecognized common payload".to_vec());
    let first_result = classify_common_resource(&first);
    let shuffled_result = classify_common_resource(&shuffled);

    assert_eq!(first_result.kind, CommonResourceKind::Unknown);
    assert_eq!(first_result.relative_path, shuffled_result.relative_path);
    assert_eq!(
        first_result.relative_path,
        PathBuf::from(r"unknown\bin_ebad79f6bd41a539.bin")
    );
}

#[test]
fn common_shl_model_sync_uses_type_three_and_reindexes_after_remove() {
    let mut shl = app_lib::format::shl::ShlFile {
        version: 100,
        reserved08: 0,
        records: vec![
            app_lib::format::shl::ShlRecord {
                model_id: 0x100,
                model_type: 6,
                folder_index: 0,
                unk1: 0,
                slot_index: 0,
            },
            app_lib::format::shl::ShlRecord {
                model_id: 0x200,
                model_type: 3,
                folder_index: 2,
                unk1: 9,
                slot_index: 2,
            },
        ],
        trailing_data: Vec::new(),
        source_records_raw: Vec::new(),
    };

    add_common_shl_model_record(&mut shl, 0x300, 3).expect("add common SHL record");
    assert_eq!(shl.records[2].model_type, EXVS_COMMON_NEW_MODEL_TYPE);
    assert_eq!(EXVS_COMMON_NEW_MODEL_TYPE, 3);
    assert_eq!(shl.records[2].folder_index, 3);
    assert!(add_common_shl_model_record(&mut shl, 0x300, 4).is_err());

    remove_common_shl_model_records(&mut shl, 0);
    assert_eq!(shl.records.len(), 2);
    assert_eq!(shl.records[0].folder_index, 1);
    assert_eq!(shl.records[0].slot_index, 1);
    assert_eq!(shl.records[1].folder_index, 2);
    assert_eq!(shl.records[1].slot_index, 2);
}

#[test]
fn materialization_writes_one_physical_copy_and_an_explicit_manifest() {
    let temp = tempfile::tempdir().expect("temp dir");
    let root = temp.path().join(EXVS_COMMON_PACKAGE_NAME);
    let structure = temp
        .path()
        .join(format!("{EXVS_COMMON_PACKAGE_NAME}_structure.json"));
    let duplicate = synthetic_nutexb("000common_000common_001_diffuse");
    let extraction = InMemoryFhm2dExtraction {
        source_name: EXVS_COMMON_HASH_NAME.to_string(),
        format: Some(Fhm2dFormat::ExvsCommon),
        naming_error: None,
        files: vec![
            file(77, ".nutexb", duplicate.clone()),
            file(88, ".nutexb", duplicate),
            file(99, ".bin", b"unrecognized common payload".to_vec()),
        ],
        sub_file_structure: Vec::new(),
        meta_header: 0x1234,
        unk_count: 9,
    };

    let result = materialize_exvs_common_extraction(&extraction, &root, &structure)
        .expect("materialize common extraction");

    assert_eq!(result.total_files, 3);
    assert_eq!(result.unique_physical_files, 2);
    assert_eq!(result.unknown_resource_count, 1);
    assert!(root
        .join(r"textures\000common_000common_001_diffuse.nutexb")
        .is_file());
    assert!(root.join(r"unknown\bin_ebad79f6bd41a539.bin").is_file());

    let json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&structure).expect("read structure"))
            .expect("parse structure");
    assert_eq!(json["HashName"], EXVS_COMMON_HASH_NAME);
    assert_eq!(json["Fhm2dTotalCount"], 3);
    assert_eq!(json["ExvsCommonProfile"]["uniquePhysicalFiles"], 2);
    assert_eq!(
        json["ExvsCommonProfile"]["resources"]
            .as_array()
            .expect("resource manifest")
            .len(),
        3
    );
    let validation =
        validate_exvs_common_bundle(&root.to_string_lossy(), &structure.to_string_lossy());
    assert!(!validation.valid);
    assert_eq!(validation.summary.unknown_resource_count, 1);
    assert!(validation
        .errors
        .iter()
        .any(|error| error.phase == "unknown"));
}

#[test]
fn real_common_package_extracts_with_43_physical_and_48_logical_resources() {
    let fixture = PathBuf::from(r"E:\XB\extract_tools\0xCB665375.fhm2d");
    if !fixture.is_file() {
        eprintln!("skipping local real-package check: {}", fixture.display());
        return;
    }
    let temp = tempfile::tempdir().expect("temp dir");
    let dplcache = fixture.parent().expect("fixture parent");
    let result = extract_exvs_common_bundle_impl(
        &temp.path().to_string_lossy(),
        &dplcache.to_string_lossy(),
        false,
    )
    .expect("extract real common package");

    assert_eq!(result.total_files, 43);
    assert_eq!(result.unique_physical_files, 43);
    assert_eq!(result.logical_reference_count, 48);
    assert_eq!(result.structure_reference_count, 53);
    assert_eq!(result.unknown_resource_count, 0);
    assert!(PathBuf::from(&result.model_root)
        .join(r"control\shell_000common_000common_001.shl")
        .is_file());
    assert!(PathBuf::from(&result.model_root)
        .join(r"camera\parameters\02winlose.vgsht2")
        .is_file());

    let marker = PathBuf::from(&result.model_root).join("old-marker.txt");
    std::fs::write(&marker, b"old workspace").expect("write old marker");
    let replaced = extract_exvs_common_bundle_impl(
        &temp.path().to_string_lossy(),
        &dplcache.to_string_lossy(),
        true,
    )
    .expect("overwrite common package");
    let backup_root = PathBuf::from(
        replaced
            .backup_model_root
            .as_deref()
            .expect("backup model root"),
    );
    assert!(backup_root.join("old-marker.txt").is_file());
    assert!(replaced.backup_structure_json.is_some());
    assert!(!PathBuf::from(&replaced.model_root)
        .join("old-marker.txt")
        .exists());

    let baseline = validate_exvs_common_bundle(&replaced.model_root, &replaced.structure_json_path);
    assert!(baseline.valid, "baseline errors: {:?}", baseline.errors);
    assert_eq!(baseline.summary.model_count, 1);
    assert_eq!(baseline.summary.shl_record_count, 4);
    assert_eq!(baseline.summary.unknown_resource_count, 0);
    let texture_inventory = app_lib::format::unit_model_textures::list_unit_model_textures(
        &replaced.model_root,
        Some(&replaced.structure_json_path),
    )
    .expect("list common textures");
    assert_eq!(texture_inventory.textures.len(), 5);

    let source_hash_before = std::fs::read(&fixture).expect("read source before repack");
    let mod_dir = temp.path().join("mod");
    let repacked = repack_exvs_common_bundle_impl(
        &replaced.model_root,
        &replaced.structure_json_path,
        &mod_dir.to_string_lossy(),
        false,
    )
    .expect("repack common bundle");
    assert_eq!(
        PathBuf::from(&repacked.output_path),
        mod_dir.join("0xCB665375.fhm2d")
    );
    assert!(PathBuf::from(&repacked.output_path).is_file());
    assert_eq!(
        source_hash_before,
        std::fs::read(&fixture).expect("read source after repack")
    );
    let verify_root = temp.path().join("roundtrip-verify");
    let roundtrip = extract_exvs_common_bundle_impl(
        &verify_root.to_string_lossy(),
        &mod_dir.to_string_lossy(),
        false,
    )
    .expect("re-extract repacked common bundle");
    let roundtrip_validation =
        validate_exvs_common_bundle(&roundtrip.model_root, &roundtrip.structure_json_path);
    assert!(
        roundtrip_validation.valid,
        "roundtrip errors: {:?}",
        roundtrip_validation.errors
    );
    assert_eq!(roundtrip.total_files, 43);
    assert_eq!(roundtrip.logical_reference_count, 48);

    let source_model = temp.path().join("prepared-hat-model");
    prepare_common_model_copy(
        &PathBuf::from(&replaced.model_root),
        &source_model,
        "hat_test",
    );
    let added = add_exvs_common_model(
        &replaced.model_root,
        &replaced.structure_json_path,
        &source_model.to_string_lossy(),
        0x4841_5431,
    )
    .expect("add common model");
    assert_eq!(added.model_count, 2);
    assert!(added.validation.valid);
    assert!(!PathBuf::from(&added.model_root).join("nuhlpb").exists());
    let added_shl = app_lib::format::shl::parse_shl(
        &std::fs::read(
            PathBuf::from(&added.model_root).join(r"control\shell_000common_000common_001.shl"),
        )
        .expect("read added SHL"),
    )
    .expect("parse added SHL");
    assert_eq!(added_shl.records.len(), 5);
    assert_eq!(added_shl.records.last().unwrap().model_id, 0x4841_5431);
    assert_eq!(
        added_shl.records.last().unwrap().model_type,
        EXVS_COMMON_NEW_MODEL_TYPE
    );

    let removed =
        remove_exvs_common_model(&added.model_root, &added.structure_json_path, "hat_test")
            .expect("remove common model");
    assert_eq!(removed.model_count, 1);
    assert!(removed.validation.valid);
    let removed_shl = app_lib::format::shl::parse_shl(
        &std::fs::read(
            PathBuf::from(&removed.model_root).join(r"control\shell_000common_000common_001.shl"),
        )
        .expect("read removed SHL"),
    )
    .expect("parse removed SHL");
    assert_eq!(removed_shl.records.len(), 4);

    let extra_texture = temp.path().join("hat_test_unreferenced.nutexb");
    std::fs::write(&extra_texture, synthetic_nutexb("hat_test_unreferenced"))
        .expect("write extra texture");
    let texture_added = add_exvs_common_texture(
        &removed.model_root,
        &removed.structure_json_path,
        &extra_texture.to_string_lossy(),
        "hat_test_unreferenced.nutexb",
    )
    .expect("add common texture");
    assert!(texture_added.validation.valid);
    let texture_inventory = app_lib::format::unit_model_textures::list_unit_model_textures(
        &texture_added.model_root,
        Some(&texture_added.structure_json_path),
    )
    .expect("list added common texture");
    let added_texture = texture_inventory
        .textures
        .iter()
        .find(|texture| {
            texture
                .filename
                .eq_ignore_ascii_case("hat_test_unreferenced.nutexb")
        })
        .expect("added common texture entry");
    assert!(added_texture.can_remove);
    let texture_removed = remove_exvs_common_texture(
        &texture_added.model_root,
        &texture_added.structure_json_path,
        added_texture.file_index,
    )
    .expect("remove common texture");
    assert!(texture_removed.validation.valid);

    let camera_table =
        PathBuf::from(&replaced.model_root).join(r"camera\parameters\00system.vgsht2");
    let mut camera_bytes = std::fs::read(&camera_table).expect("read camera table");
    camera_bytes.push(0);
    std::fs::write(&camera_table, camera_bytes).expect("modify camera table");
    let read_only_modified =
        validate_exvs_common_bundle(&replaced.model_root, &replaced.structure_json_path);
    assert!(read_only_modified.valid);
    assert!(read_only_modified
        .warnings
        .iter()
        .any(|warning| warning.contains("read-only")));
    let unconfirmed = repack_exvs_common_bundle_impl(
        &replaced.model_root,
        &replaced.structure_json_path,
        &mod_dir.to_string_lossy(),
        false,
    )
    .expect_err("high-risk changes require confirmation");
    assert!(unconfirmed.contains("confirmation"));

    let shl_path =
        PathBuf::from(&replaced.model_root).join(r"control\shell_000common_000common_001.shl");
    let mut shl =
        app_lib::format::shl::parse_shl(&std::fs::read(&shl_path).expect("read common shl"))
            .expect("parse common shl");
    shl.records[1].model_id = shl.records[0].model_id;
    std::fs::write(
        &shl_path,
        app_lib::format::shl::build_shl(&shl).expect("build common shl"),
    )
    .expect("write duplicate common shl");
    let duplicate =
        validate_exvs_common_bundle(&replaced.model_root, &replaced.structure_json_path);
    assert!(!duplicate.valid);
    assert!(duplicate
        .errors
        .iter()
        .any(|error| error.message.contains("duplicate model ID")));
}

fn synthetic_nutexb(name: &str) -> Vec<u8> {
    let mut data = vec![0u8; 0x70];
    data[0..4].copy_from_slice(b"46XT");
    data[4..4 + name.len()].copy_from_slice(name.as_bytes());
    let footer = data.len() - 8;
    data[footer..footer + 4].copy_from_slice(b" XET");
    data[footer + 4..footer + 6].copy_from_slice(&2i16.to_le_bytes());
    data[footer + 6..footer + 8].copy_from_slice(&0i16.to_le_bytes());
    data
}

fn prepare_common_model_copy(common_root: &std::path::Path, output: &std::path::Path, name: &str) {
    use ssbh_data::prelude::ModlData;

    std::fs::create_dir_all(output).expect("create prepared model");
    let source_model = common_root.join(r"models\wep_coop00");
    let old = "000common_000common_001_wep_coop00";
    for (source_name, target_name) in [
        (format!("{old}.numdlb"), format!("{name}.numdlb")),
        (
            format!("{old}__maya__.numshb"),
            format!("{name}__maya__.numshb"),
        ),
        (
            format!("{old}__maya__.nusktb"),
            format!("{name}__maya__.nusktb"),
        ),
        (format!("{old}.jnttbl"), format!("{name}.jnttbl")),
        (
            format!("{old}__maya__.numatb"),
            format!("{name}__maya__.numatb"),
        ),
        (
            format!("{old}__nust__.numatb"),
            format!("{name}__nust__.numatb"),
        ),
    ] {
        std::fs::copy(source_model.join(source_name), output.join(target_name))
            .expect("copy model resource");
    }
    for texture in std::fs::read_dir(common_root.join("textures")).expect("read textures") {
        let texture = texture.expect("texture entry");
        std::fs::copy(texture.path(), output.join(texture.file_name())).expect("copy texture");
    }

    let numdlb_path = output.join(format!("{name}.numdlb"));
    let mut modl = ModlData::from_file(&numdlb_path).expect("read copied numdlb");
    modl.model_name = name.to_string();
    modl.skeleton_file_name = format!("{name}__maya__.nusktb");
    modl.material_file_names = vec![
        format!("{name}__maya__.numatb"),
        format!("{name}__nust__.numatb"),
    ];
    modl.mesh_file_name = format!("{name}__maya__.numshb");
    modl.write_to_file(&numdlb_path)
        .expect("write copied numdlb");
}

fn file(file_index: i32, file_type: &str, data: Vec<u8>) -> InMemoryFhm2dFile {
    InMemoryFhm2dFile {
        file_index,
        file_type: file_type.to_string(),
        file_url: format!(r".\ignored\{file_index}{file_type}"),
        data,
    }
}
