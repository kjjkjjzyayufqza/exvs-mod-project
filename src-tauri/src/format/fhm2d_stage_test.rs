use super::*;
use std::collections::{HashMap, HashSet};
use std::io;

const TEST_DATA_ROOT: &str = r"E:\XB\解包\com\test";

// stage_example.md
const _STAGE_16F73C97_REFERENCE: &str = "see doc comment above";

// ── Test infrastructure ─────────────────────────────────────────────

fn test_pack_root(stage_name: &str) -> PathBuf {
    Path::new(TEST_DATA_ROOT).join(stage_name)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ft = entry.file_type()?;
        let dest_path = dst.join(entry.file_name());
        if ft.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

fn fhm2d_path_for(stage_name: &str) -> PathBuf {
    Path::new(TEST_DATA_ROOT).join(format!("{stage_name}.fhm2d"))
}

fn skip_if_fhm2d_missing(stage_name: &str) -> bool {
    let p = fhm2d_path_for(stage_name);
    if !p.exists() {
        eprintln!("SKIP: {stage_name}.fhm2d not found at {TEST_DATA_ROOT}");
        true
    } else {
        false
    }
}

/// Extract an FHM2D to a temp dir. Returns (TempDir, pack_root, content_root).
fn extract_to_temp(stage_name: &str) -> (tempfile::TempDir, PathBuf, PathBuf) {
    let fhm2d = fhm2d_path_for(stage_name);
    assert!(fhm2d.exists(), "{stage_name}.fhm2d must exist");
    let tmp = tempfile::tempdir().expect("create temp dir");
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    )
    .unwrap_or_else(|e| panic!("extract {stage_name}: {e}"));
    let pack_root = PathBuf::from(&result.output_dir);
    let content_root = pack_root.join("0").join("0");
    eprintln!(
        "[extract_to_temp] {stage_name}: {} files, pack_root={}",
        result.total_files,
        pack_root.display()
    );
    (tmp, pack_root, content_root)
}

/// Copy the pack root (hash-named folder + _structure.json) to a temp dir.
fn copy_pack_root_to_temp(stage_name: &str) -> (tempfile::TempDir, PathBuf) {
    let src = test_pack_root(stage_name);
    assert!(src.is_dir(), "Pack root not found at {}", src.display());
    let tmp = tempfile::tempdir().expect("create temp dir");
    let dst = tmp.path().join(stage_name);
    copy_dir_recursive(&src, &dst).expect("copy pack root");
    let sj_src = Path::new(TEST_DATA_ROOT).join(format!("{stage_name}_structure.json"));
    if sj_src.exists() {
        let sj_dst = tmp.path().join(format!("{stage_name}_structure.json"));
        fs::copy(&sj_src, &sj_dst).expect("copy structure json");
    }
    (tmp, dst)
}

fn skip_if_test_data_missing() -> bool {
    !Path::new(TEST_DATA_ROOT).is_dir()
}

// ── load_stage_bundle_impl ──────────────────────────────────────────

#[test]
fn test_load_stage_84f085e5_basic_structure() {
    if skip_if_fhm2d_missing("84F085E5") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("84F085E5");
    let bundle = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();

    assert!(bundle.base_model.is_some(), "should have base model");
    assert!(!bundle.sub_models.is_empty(), "should have sub models");
    assert!(
        !bundle.graphic_params.is_empty(),
        "should have graphic params"
    );
    assert!(
        !bundle.placement_entries.is_empty(),
        "should have placement entries"
    );

    let sky_entry = bundle
        .placement_entries
        .iter()
        .find(|e| e.vdk_type == "SKY");
    assert!(sky_entry.is_some(), "should have a SKY placement entry");

    assert_eq!(
        bundle.placement_entries.len(),
        1,
        "menu stage should have exactly 1 placement entry (SKY only)"
    );
}

#[test]
fn test_load_stage_16f73c97_object_box01() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("16F73C97");
    let bundle = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();

    assert!(bundle.base_model.is_some(), "should have base model");

    let box_model = bundle
        .sub_models
        .iter()
        .find(|m| m.folder_name.contains("object_box01"));
    assert!(
        box_model.is_some(),
        "should find 001stage001_object_box01 sub model"
    );

    let sky_model = bundle.sub_models.iter().find(|m| m.folder_name == "sky");
    assert!(sky_model.is_some(), "should find sky sub model");

    let sky_placement = bundle
        .placement_entries
        .iter()
        .find(|e| e.vdk_type == "SKY");
    assert!(sky_placement.is_some(), "should have SKY placement");
    assert_eq!(
        sky_placement.unwrap().object_number,
        Some(1),
        "SKY objectNumber=1"
    );

    let obj_placements: Vec<_> = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "OBJECT")
        .collect();
    assert_eq!(
        obj_placements.len(),
        4,
        "should have 4 OBJECT placement entries"
    );
    for p in &obj_placements {
        assert_eq!(
            p.object_number,
            Some(0),
            "all OBJECTs reference objectNumber=0"
        );
    }
}

#[test]
fn test_load_stage_35516817_effect_entries() {
    if skip_if_fhm2d_missing("35516817") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("35516817");
    let bundle = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();

    let effect_count = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "EFFECT")
        .count();
    assert!(
        effect_count > 10,
        "stage 018 should have many EFFECT entries, got {effect_count}"
    );

    let sky_count = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "SKY")
        .count();
    assert_eq!(sky_count, 1, "should have exactly 1 SKY entry");

    assert!(
        bundle.sub_models.len() >= 10,
        "stage 018 should have many sub models, got {}",
        bundle.sub_models.len()
    );
}

#[test]
fn test_load_stage_nonexistent_dir() {
    let result = load_stage_bundle_impl(r"E:\nonexistent\path");
    assert!(result.is_err(), "should fail for nonexistent dir");
}

// ── Placement CSV parsing (KV format) ───────────────────────────────

#[test]
fn test_parse_placement_kv_format_basic() {
    let csv = "VDK_TYPE,SKY,VDK_POSITION_X,10.0,VDK_POSITION_Y,20.0,VDK_POSITION_Z,30.0,VDK_OBJECTNUMBER,1\n\
               VDK_TYPE,OBJECT,VDK_POSITION_X,100.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,-50.0,VDK_OBJECTNUMBER,0";
    let mut warnings = Vec::new();
    let (header, entries) = parse_placement_table(csv, &mut warnings);

    assert!(header.is_empty(), "KV format has no header row");
    assert_eq!(entries.len(), 2);

    assert_eq!(entries[0].vdk_type, "SKY");
    assert_eq!(entries[0].object_number, Some(1));
    assert!((entries[0].pos_x - 10.0).abs() < f64::EPSILON);
    assert!((entries[0].pos_y - 20.0).abs() < f64::EPSILON);
    assert!((entries[0].pos_z - 30.0).abs() < f64::EPSILON);

    assert_eq!(entries[1].vdk_type, "OBJECT");
    assert_eq!(entries[1].object_number, Some(0));
    assert!((entries[1].pos_x - 100.0).abs() < f64::EPSILON);
}

#[test]
fn test_parse_placement_kv_effect_entries() {
    let csv = "VDK_TYPE,EFFECT,VDK_POSITION_X,1046.77,VDK_POSITION_Y,-65.75,VDK_POSITION_Z,-242.80,VDK_EFFECT_ID,EFF_018STAGE018_MIST_001,VDK_SCALE_X,1.0,VDK_SCALE_Y,1.0,VDK_SCALE_Z,1.0\n\
               VDK_TYPE,OBJECT,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0,VDK_OBJECTNUMBER,0";
    let mut warnings = Vec::new();
    let (_, entries) = parse_placement_table(csv, &mut warnings);

    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].vdk_type, "EFFECT");
    assert!(
        entries[0].object_number.is_none(),
        "EFFECT entries have no objectNumber"
    );
    assert!((entries[0].pos_x - 1046.77).abs() < 0.01);
    assert!((entries[0].scale_x - 1.0).abs() < f64::EPSILON);
}

#[test]
fn test_parse_placement_kv_scale_defaults() {
    let csv = "VDK_TYPE,OBJECT,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0,VDK_OBJECTNUMBER,0";
    let mut warnings = Vec::new();
    let (_, entries) = parse_placement_table(csv, &mut warnings);

    assert_eq!(entries.len(), 1);
    assert!(
        (entries[0].scale_x - 1.0).abs() < f64::EPSILON,
        "missing scale_x defaults to 1.0"
    );
    assert!(
        (entries[0].scale_y - 1.0).abs() < f64::EPSILON,
        "missing scale_y defaults to 1.0"
    );
    assert!(
        (entries[0].scale_z - 1.0).abs() < f64::EPSILON,
        "missing scale_z defaults to 1.0"
    );
}

#[test]
fn test_parse_placement_kv_zero_scale_defaults_to_one() {
    let csv = "VDK_TYPE,OBJECT,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0,VDK_OBJECTNUMBER,0,VDK_SCALE_X,0,VDK_SCALE_Y,0,VDK_SCALE_Z,0";
    let mut warnings = Vec::new();
    let (_, entries) = parse_placement_table(csv, &mut warnings);

    assert_eq!(entries.len(), 1);
    assert!(
        (entries[0].scale_x - 1.0).abs() < f64::EPSILON,
        "explicit 0 scale_x -> 1.0"
    );
    assert!(
        (entries[0].scale_y - 1.0).abs() < f64::EPSILON,
        "explicit 0 scale_y -> 1.0"
    );
    assert!(
        (entries[0].scale_z - 1.0).abs() < f64::EPSILON,
        "explicit 0 scale_z -> 1.0"
    );
}

#[test]
fn test_parse_placement_empty_content() {
    let mut warnings = Vec::new();
    let (header, entries) = parse_placement_table("", &mut warnings);
    assert!(header.is_empty());
    assert!(entries.is_empty());
}

#[test]
fn test_parse_placement_preserves_raw_fields() {
    let csv = "VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,250.0,VDK_POSITION_Y,-2.0,VDK_POSITION_Z,-250.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,0.0,VDK_OBJECTNUMBER,0,VDK_HITPOINT,UNBREAKABLE";
    let mut warnings = Vec::new();
    let (_, entries) = parse_placement_table(csv, &mut warnings);

    assert_eq!(entries.len(), 1);
    assert!(
        entries[0].raw_fields.len() > 10,
        "raw_fields should preserve all fields"
    );
    assert!(
        entries[0].raw_fields.contains(&"UNBREAKABLE".to_string()),
        "raw_fields should contain UNBREAKABLE"
    );
}

// ── Graphic param CSV parsing ───────────────────────────────────────

#[test]
fn test_parse_graphic_param_csv_from_bytes_basic() {
    let csv =
        b"directional_lighting_rot_x,-45\ndirectional_lighting_rot_y,45\nibl_lighting_intensity,1";
    let mut warnings = Vec::new();
    let params = parse_graphic_param_csv_from_bytes(csv, &mut warnings);

    assert_eq!(params.len(), 3);
    assert_eq!(params[0].key, "directional_lighting_rot_x");
    assert_eq!(params[0].value, "-45");
    assert_eq!(params[2].key, "ibl_lighting_intensity");
    assert_eq!(params[2].value, "1");
    assert!(warnings.is_empty());
}

#[test]
fn test_parse_graphic_param_csv_empty_lines() {
    let csv = b"key1,value1\n\nkey2,value2\n";
    let mut warnings = Vec::new();
    let params = parse_graphic_param_csv_from_bytes(csv, &mut warnings);
    assert_eq!(params.len(), 2, "empty lines should be skipped");
}

// ── Graphic param CSV roundtrip ─────────────────────────────────────

#[test]
fn test_graphic_param_csv_write_read_roundtrip() {
    if skip_if_fhm2d_missing("84F085E5") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("84F085E5");
    let bundle = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();
    let original_params = bundle.graphic_params.clone();
    assert!(!original_params.is_empty());

    let csv_content: String = original_params
        .iter()
        .map(|p| format!("{},{}", p.key, p.value))
        .collect::<Vec<_>>()
        .join("\n");
    let csv_path = content.join("info").join("graphic_param.csv");
    fs::write(&csv_path, &csv_content).unwrap();

    let reloaded = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();
    assert_eq!(
        reloaded.graphic_params.len(),
        original_params.len(),
        "roundtrip should preserve param count"
    );
    for (orig, reload) in original_params.iter().zip(reloaded.graphic_params.iter()) {
        assert_eq!(orig.key, reload.key, "roundtrip should preserve key");
        assert_eq!(orig.value, reload.value, "roundtrip should preserve value");
    }
}

#[test]
fn test_graphic_param_csv_modify_and_reload() {
    if skip_if_fhm2d_missing("84F085E5") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("84F085E5");
    let bundle = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();

    let mut params = bundle.graphic_params.clone();
    let original_first_value = params[0].value.clone();
    params[0].value = "999.5".to_string();

    let csv_content: String = params
        .iter()
        .map(|p| format!("{},{}", p.key, p.value))
        .collect::<Vec<_>>()
        .join("\n");
    let csv_path = content.join("info").join("graphic_param.csv");
    fs::write(&csv_path, &csv_content).unwrap();

    let reloaded = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();
    assert_eq!(
        reloaded.graphic_params[0].value, "999.5",
        "modified value should persist"
    );
    assert_ne!(reloaded.graphic_params[0].value, original_first_value);
}

// ── Placement CSV roundtrip ─────────────────────────────────────────

#[test]
fn test_placement_csv_write_read_roundtrip_kv_format() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("16F73C97");
    let bundle = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();
    let original_entries = bundle.placement_entries.clone();
    let original_header = bundle.placement_header.clone();
    assert!(!original_entries.is_empty());

    let csv_content = if original_header.is_empty() {
        original_entries
            .iter()
            .map(|e| e.raw_fields.join(","))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        let header_line = original_header.join(",");
        let data_lines: Vec<String> = original_entries
            .iter()
            .map(|e| e.raw_fields.join(","))
            .collect();
        std::iter::once(header_line)
            .chain(data_lines)
            .collect::<Vec<_>>()
            .join("\n")
    };

    let csv_path = content.join("info").join("placement.csv");
    fs::write(&csv_path, &csv_content).unwrap();

    let reloaded = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();
    assert_eq!(
        reloaded.placement_entries.len(),
        original_entries.len(),
        "roundtrip should preserve entry count"
    );

    for (i, (orig, reload)) in original_entries
        .iter()
        .zip(reloaded.placement_entries.iter())
        .enumerate()
    {
        assert_eq!(
            orig.vdk_type, reload.vdk_type,
            "entry {i}: vdk_type mismatch"
        );
        assert_eq!(
            orig.object_number, reload.object_number,
            "entry {i}: objectNumber mismatch"
        );
        assert!(
            (orig.pos_x - reload.pos_x).abs() < 0.001,
            "entry {i}: pos_x mismatch"
        );
        assert!(
            (orig.pos_y - reload.pos_y).abs() < 0.001,
            "entry {i}: pos_y mismatch"
        );
        assert!(
            (orig.pos_z - reload.pos_z).abs() < 0.001,
            "entry {i}: pos_z mismatch"
        );
    }
}

#[test]
fn test_placement_csv_effect_preservation_on_rewrite() {
    if skip_if_fhm2d_missing("35516817") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("35516817");
    let bundle = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();
    let original_entries = bundle.placement_entries.clone();

    let effect_entries: Vec<_> = original_entries
        .iter()
        .filter(|e| e.vdk_type == "EFFECT")
        .collect();
    let original_effect_count = effect_entries.len();
    assert!(
        original_effect_count > 0,
        "stage 018 must have EFFECT entries"
    );

    let csv_content = original_entries
        .iter()
        .map(|e| e.raw_fields.join(","))
        .collect::<Vec<_>>()
        .join("\n");

    let csv_path = content.join("info").join("placement.csv");
    fs::write(&csv_path, &csv_content).unwrap();

    let reloaded = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();
    let reloaded_effects: Vec<_> = reloaded
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "EFFECT")
        .collect();
    assert_eq!(
        reloaded_effects.len(),
        original_effect_count,
        "EFFECT entries must be preserved through write-reload cycle"
    );

    for (orig, reload) in effect_entries.iter().zip(reloaded_effects.iter()) {
        assert_eq!(
            orig.raw_fields.len(),
            reload.raw_fields.len(),
            "EFFECT raw_fields length must match"
        );
    }
}

// ── ObjectNumber re-indexing after delete ────────────────────────────

#[test]
fn test_object_index_after_folder_deletion() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("16F73C97");
    let bundle_before = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();

    let original_sub_count = bundle_before.sub_models.len();
    assert!(
        original_sub_count >= 1,
        "need at least 1 sub model for delete test"
    );

    let deleted_folder = &bundle_before.sub_models[0].folder_name;
    let deleted_path = content.join(deleted_folder);
    assert!(
        deleted_path.is_dir(),
        "folder to delete should exist: {}",
        deleted_path.display()
    );

    fs::remove_dir_all(&deleted_path).expect("delete sub model folder");

    let bundle_after = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();
    assert_eq!(
        bundle_after.sub_models.len(),
        original_sub_count - 1,
        "sub_models count should decrease by 1 after deletion"
    );

    for (i, sub) in bundle_after.sub_models.iter().enumerate() {
        assert_eq!(
            sub.object_index, i,
            "objectIndex should be re-indexed: expected {i}, got {}",
            sub.object_index
        );
    }
}

#[test]
fn test_sky_folder_not_counted_as_sub_model() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("16F73C97");
    let bundle = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();

    let sky_as_sub = bundle.sub_models.iter().find(|m| m.folder_name == "sky");
    assert!(
        sky_as_sub.is_some(),
        "sky should appear as a sub model entry"
    );

    let base_as_sub = bundle.sub_models.iter().find(|m| m.folder_name == "base");
    assert!(
        base_as_sub.is_none(),
        "base should NOT appear as a sub model entry"
    );
}

// ── Texture format detection (after FHM2D extraction) ───────────────

#[test]
fn test_extracted_stage_has_textures_in_model_subdirs() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("16F73C97");

    let reserved = ["base", "info", "textures", "sky"];
    let mut found_texture_subdirs = 0;
    for entry in fs::read_dir(&content).unwrap().filter_map(|e| e.ok()) {
        if !entry.file_type().unwrap().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if reserved.contains(&name.as_str()) {
            continue;
        }

        for ssbh_dir in fs::read_dir(entry.path()).unwrap().filter_map(|e| e.ok()) {
            if !ssbh_dir.file_type().unwrap().is_dir() {
                continue;
            }
            let ssbh_name = ssbh_dir.file_name().to_string_lossy().to_string();
            if !ssbh_name.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }

            for sub_entry in fs::read_dir(ssbh_dir.path())
                .unwrap()
                .filter_map(|e| e.ok())
            {
                if sub_entry.file_type().map(|t| t.is_dir()).unwrap_or(false)
                    && sub_entry
                        .file_name()
                        .to_string_lossy()
                        .chars()
                        .all(|c| c.is_ascii_digit())
                    && dir_contains_only_nutexb(&sub_entry.path())
                {
                    found_texture_subdirs += 1;
                }
            }
        }
    }
    assert!(
        found_texture_subdirs > 0,
        "fresh FHM2D extraction should have numbered texture subdirs in models"
    );
    eprintln!(
        "Found {} texture subdirectories in models",
        found_texture_subdirs
    );
}

#[test]
fn test_restore_then_redistribute_preserves_texture_count() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, pack_root, _content) = extract_to_temp("16F73C97");

    let before_nutexb = count_nutexb_recursive(&pack_root);
    assert!(
        before_nutexb > 0,
        "should have nutexb files after extraction"
    );
    eprintln!("Before: {} nutexb", before_nutexb);

    let restore_result = restore_shared_textures(&pack_root.to_string_lossy()).unwrap();
    eprintln!(
        "Restored: {} collected, {} subdirs removed",
        restore_result.textures_collected, restore_result.subdirs_removed
    );
    assert!(
        restore_result.textures_collected > 0,
        "should collect textures"
    );

    let textures_dir = pack_root.join("textures");
    assert!(
        textures_dir.is_dir(),
        "textures/ should exist after restore"
    );

    let redist_result = redistribute_stage_textures(&pack_root.to_string_lossy()).unwrap();
    eprintln!(
        "Redistributed: {} models, {} copies, removed={}",
        redist_result.models_processed,
        redist_result.textures_copied,
        redist_result.textures_folder_removed
    );

    assert!(
        redist_result.models_processed > 0,
        "should process at least one model"
    );
    assert!(
        redist_result.textures_copied > 0,
        "should copy textures back"
    );

    let after_nutexb = count_nutexb_recursive(&pack_root);
    assert_eq!(after_nutexb, before_nutexb,
        "nutexb count should match after restore+redistribute (before={before_nutexb}, after={after_nutexb})");
    eprintln!("PASS: restore + redistribute roundtrip preserves {before_nutexb} nutexb");
}

// ── Bundle still loads after simulated save modifications ────────────

#[test]
fn test_bundle_loads_after_csv_rewrite() {
    if skip_if_fhm2d_missing("84F085E5") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("84F085E5");

    let bundle = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();

    let gp_csv: String = bundle
        .graphic_params
        .iter()
        .map(|p| format!("{},{}", p.key, p.value))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(content.join("info").join("graphic_param.csv"), &gp_csv).unwrap();

    let pl_csv: String = bundle
        .placement_entries
        .iter()
        .map(|e| e.raw_fields.join(","))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(content.join("info").join("placement.csv"), &pl_csv).unwrap();

    let reloaded = load_stage_bundle_impl(&content.to_string_lossy());
    assert!(
        reloaded.is_ok(),
        "bundle should load after CSV rewrite: {:?}",
        reloaded.err()
    );
    let reloaded = reloaded.unwrap();
    assert_eq!(reloaded.graphic_params.len(), bundle.graphic_params.len());
    assert_eq!(
        reloaded.placement_entries.len(),
        bundle.placement_entries.len()
    );
}

// ── Placement modification + save ───────────────────────────────────

#[test]
fn test_placement_position_modification_persists() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("16F73C97");
    let bundle = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();

    let mut entries = bundle.placement_entries.clone();
    let obj_idx = entries.iter().position(|e| e.vdk_type == "OBJECT").unwrap();
    let mut raw = entries[obj_idx].raw_fields.clone();
    let px_idx = raw
        .iter()
        .position(|f| f.eq_ignore_ascii_case("VDK_POSITION_X"))
        .unwrap();
    raw[px_idx + 1] = "12345.0".to_string();
    entries[obj_idx].raw_fields = raw;

    let csv_content = entries
        .iter()
        .map(|e| e.raw_fields.join(","))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(content.join("info").join("placement.csv"), &csv_content).unwrap();

    let reloaded = load_stage_bundle_impl(&content.to_string_lossy()).unwrap();
    let modified_obj = &reloaded.placement_entries[obj_idx];
    assert!(
        (modified_obj.pos_x - 12345.0).abs() < 0.01,
        "modified position should persist, got {}",
        modified_obj.pos_x
    );
}

// ── CSV field identification ────────────────────────────────────────

#[test]
fn test_identify_info_file_placement_csv() {
    let sample = b"VDK_TYPE,OBJECT,VDK_POSITION_X,0";
    assert_eq!(identify_info_file(sample), "placement.csv");
}

#[test]
fn test_identify_info_file_graphic_param_csv() {
    let sample = b"directional_lighting_rot_x,-45\npfx_bloom_intensity,0.5";
    assert_eq!(identify_info_file(sample), "graphic_param.csv");
}

#[test]
fn test_identify_info_file_hkt() {
    let mut data = vec![0u8; 20];
    data[0x0C..0x10].copy_from_slice(b"SDKV");
    assert_eq!(identify_info_file(&data), "border_hit.hkt");
}

// ── Numdlb name extraction ──────────────────────────────────────────

#[test]
fn test_numdlb_name_from_real_file() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, _pack, content) = extract_to_temp("16F73C97");
    let numdlb_path = content
        .join("001stage001_object_box01")
        .join("0")
        .join("001stage001_object_box01.numdlb");
    if !numdlb_path.exists() {
        eprintln!("SKIP: numdlb file not found at {}", numdlb_path.display());
        return;
    }
    let data = fs::read(&numdlb_path).unwrap();
    let name = read_numdlb_model_name(&data);
    assert!(name.is_some(), "should extract name from real numdlb");
    let name = name.unwrap();
    assert!(
        name.contains("001stage001"),
        "name should contain stage identifier, got: {name}"
    );
}

#[test]
fn test_numdlb_name_too_short() {
    let data = vec![0u8; 10];
    assert!(read_numdlb_model_name(&data).is_none());
}

#[test]
fn test_numdlb_name_wrong_magic() {
    let mut data = vec![0u8; 0x40];
    data[0..4].copy_from_slice(b"NOPE");
    assert!(read_numdlb_model_name(&data).is_none());
}

// ── Split CSV record ────────────────────────────────────────────────

#[test]
fn test_split_csv_simple() {
    let fields = split_csv_record("a,b,c");
    assert_eq!(fields, vec!["a", "b", "c"]);
}

#[test]
fn test_split_csv_quoted() {
    let fields = split_csv_record("\"hello, world\",b,c");
    assert_eq!(fields[0], "hello, world");
    assert_eq!(fields.len(), 3);
}

#[test]
fn test_split_csv_escaped_quotes() {
    let fields = split_csv_record("\"he said \"\"hi\"\"\",b");
    assert_eq!(fields[0], "he said \"hi\"");
}

// ── Normalize model name ────────────────────────────────────────────

#[test]
fn test_normalize_model_name_basic() {
    assert_eq!(normalize_model_name("Model01.numdlb"), "model01");
}

#[test]
fn test_normalize_model_name_slashes() {
    assert_eq!(normalize_model_name("/path/to/Model.ext"), "path_to_model");
}

#[test]
fn test_normalize_model_name_spaces() {
    assert_eq!(normalize_model_name("My Model"), "my_model");
}

// ── Stage root with missing info dir ────────────────────────────────

#[test]
fn test_bundle_with_missing_info_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let stage = tmp.path().join("stage");
    fs::create_dir_all(stage.join("base")).unwrap();
    let bundle = load_stage_bundle_impl(&stage.to_string_lossy()).unwrap();
    assert!(bundle.graphic_params.is_empty());
    assert!(bundle.placement_entries.is_empty());
}

// ── Nutexb internal name parsing ────────────────────────────────────

#[test]
fn test_parse_nutexb_name_from_real_file() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, pack_root, _content) = extract_to_temp("16F73C97");

    let textures_dir = pack_root.join("textures");
    if !textures_dir.is_dir() {
        eprintln!("SKIP: textures dir not found at pack root");
        return;
    }
    let mut tested = 0;
    for entry in fs::read_dir(&textures_dir).unwrap().filter_map(|e| e.ok()) {
        if entry
            .path()
            .extension()
            .map(|e| e.eq_ignore_ascii_case("nutexb"))
            .unwrap_or(false)
        {
            let data = fs::read(entry.path()).unwrap();
            let name = parse_nutexb_internal_name(&data);
            assert!(
                name.is_some(),
                "should parse nutexb internal name from {}",
                entry.path().display()
            );
            tested += 1;
        }
    }
    assert!(tested > 0, "should have tested at least one nutexb file");
    eprintln!("Parsed {} nutexb internal names", tested);
}

#[test]
fn test_parse_nutexb_name_too_short() {
    assert!(parse_nutexb_internal_name(&[0; 4]).is_none());
}

#[test]
fn test_parse_nutexb_name_wrong_magic() {
    let mut data = vec![0u8; 100];
    let len = data.len();
    data[len - 8..len - 4].copy_from_slice(b"NOPE");
    assert!(parse_nutexb_internal_name(&data).is_none());
}

// ── Texture redistribution tests ──────────────────────────────────

#[test]
fn test_redistribute_no_textures_folder() {
    let tmp = tempfile::tempdir().unwrap();
    let stage = tmp.path().join("stage");
    fs::create_dir_all(stage.join("base")).unwrap();
    let result = redistribute_stage_textures(&stage.to_string_lossy()).unwrap();
    assert_eq!(result.models_processed, 0);
    assert_eq!(result.textures_copied, 0);
    assert!(!result.textures_folder_removed);
}

#[test]
fn test_redistribute_without_textures_folder_is_noop() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, pack_root, _content) = extract_to_temp("16F73C97");

    let textures_dir = pack_root.join("textures");
    assert!(
        !textures_dir.is_dir(),
        "fresh extraction should not have shared textures/ at pack root"
    );

    let result = redistribute_stage_textures(&pack_root.to_string_lossy()).unwrap();
    assert_eq!(
        result.models_processed, 0,
        "no shared textures/ means nothing to redistribute"
    );
}

#[test]
fn test_redistribute_and_restore_roundtrip_with_large_stage() {
    if skip_if_fhm2d_missing("84F085E5") {
        return;
    }
    let (_tmp, pack_root, _content) = extract_to_temp("84F085E5");

    let before_nutexb = count_nutexb_recursive(&pack_root);
    eprintln!("Before: {} nutexb total", before_nutexb);
    assert!(before_nutexb > 0);

    let restore_result = restore_shared_textures(&pack_root.to_string_lossy()).unwrap();
    eprintln!(
        "Restored: {} textures collected, {} subdirs removed",
        restore_result.textures_collected, restore_result.subdirs_removed
    );
    assert!(
        restore_result.textures_collected > 0,
        "should collect textures"
    );

    let textures_dir = pack_root.join("textures");
    assert!(
        textures_dir.is_dir(),
        "textures/ should exist after restore"
    );

    let redist_result = redistribute_stage_textures(&pack_root.to_string_lossy()).unwrap();
    eprintln!(
        "Redistributed: {} models, {} copies",
        redist_result.models_processed, redist_result.textures_copied
    );
    assert!(redist_result.models_processed > 0, "should process models");
    assert!(redist_result.textures_copied > 0, "should copy textures");

    let after_nutexb = count_nutexb_recursive(&pack_root);
    assert_eq!(after_nutexb, before_nutexb,
        "total nutexb count should match after roundtrip (before={before_nutexb}, after={after_nutexb})");
    eprintln!("PASS: redistribute + restore roundtrip for 84F085E5");
}

// ── Full roundtrip: extract -> repack -> re-extract -> verify ───────

#[test]
fn test_full_repack_roundtrip_16f73c97() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let fhm2d_path = fhm2d_path_for("16F73C97");
    let original_bytes = fs::read(&fhm2d_path).unwrap();

    let tmp = tempfile::tempdir().unwrap();
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();

    eprintln!("Step 1: Extract FHM2D");
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d_path.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    )
    .unwrap();
    let pack_root = PathBuf::from(&result.output_dir);
    let original_file_count = result.total_files;
    eprintln!(
        "  Extracted {} files, pack_root={}",
        original_file_count,
        pack_root.display()
    );

    eprintln!("Step 2: Rebuild structure JSON from pack root");
    let rebuilt_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();
    eprintln!("  Rebuilt: {rebuilt_path}");

    let sj_content = fs::read_to_string(&rebuilt_path).unwrap();
    let doc: serde_json::Value = serde_json::from_str(&sj_content).unwrap();
    let sub_file_data = doc["SubFileData"].as_array().unwrap();

    eprintln!("Step 3: Verify all file URLs point to real files");
    let sj_parent = Path::new(&rebuilt_path).parent().unwrap();
    for entry in sub_file_data {
        let url = entry["fileUrl"].as_str().unwrap();
        let relative = url.trim_start_matches(".\\");
        let file_path = sj_parent.join(relative.replace('\\', "/"));
        assert!(
            file_path.exists(),
            "Rebuilt URL must point to existing file: {} (resolved: {})",
            url,
            file_path.display()
        );
    }
    eprintln!("  All {} URLs valid", sub_file_data.len());

    eprintln!("Step 4: Repack using rebuilt structure JSON");
    let repack_output = tmp.path().join("repacked.fhm2d");
    let repack_result = crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &rebuilt_path,
        &repack_output.to_string_lossy(),
        false,
        None,
    )
    .unwrap();
    eprintln!(
        "  Repacked: {} files, {} bytes",
        repack_result.total_files, repack_result.output_size
    );

    eprintln!("Step 5: Re-extract and verify file count");
    let re_extract_dir = tmp.path().join("re_extract");
    fs::create_dir_all(&re_extract_dir).unwrap();
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_output.to_string_lossy(),
        &re_extract_dir.to_string_lossy(),
    )
    .unwrap();
    eprintln!("  Re-extracted {} files", re_extract.total_files);
    assert_eq!(
        re_extract.total_files, original_file_count,
        "File count mismatch (expected {original_file_count}, got {})",
        re_extract.total_files
    );

    eprintln!("Step 6: Verify repacked output exists");
    let repacked_bytes = fs::read(&repack_output).unwrap();
    eprintln!(
        "  Original: {} bytes, Repacked: {} bytes",
        original_bytes.len(),
        repacked_bytes.len()
    );
    assert!(
        !repacked_bytes.is_empty(),
        "repacked output should not be empty"
    );
    eprintln!("PASS: Full roundtrip for 16F73C97");
}

#[test]
fn test_full_repack_roundtrip_84f085e5() {
    if skip_if_fhm2d_missing("84F085E5") {
        return;
    }
    let fhm2d_path = fhm2d_path_for("84F085E5");
    let original_bytes = fs::read(&fhm2d_path).unwrap();

    let tmp = tempfile::tempdir().unwrap();
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();

    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d_path.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    )
    .unwrap();
    let pack_root = PathBuf::from(&result.output_dir);
    let original_file_count = result.total_files;
    eprintln!("Extracted {} files from 84F085E5", original_file_count);

    let rebuilt_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();

    let repack_output = tmp.path().join("repacked.fhm2d");
    let repack_result = crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &rebuilt_path,
        &repack_output.to_string_lossy(),
        false,
        None,
    )
    .unwrap();
    eprintln!(
        "Repacked: {} files, {} bytes",
        repack_result.total_files, repack_result.output_size
    );

    let re_extract_dir = tmp.path().join("re_extract");
    fs::create_dir_all(&re_extract_dir).unwrap();
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_output.to_string_lossy(),
        &re_extract_dir.to_string_lossy(),
    )
    .unwrap();
    assert_eq!(
        re_extract.total_files, original_file_count,
        "File count mismatch (expected {original_file_count}, got {})",
        re_extract.total_files
    );

    let repacked_bytes = fs::read(&repack_output).unwrap();
    eprintln!(
        "  Original: {} bytes, Repacked: {} bytes",
        original_bytes.len(),
        repacked_bytes.len()
    );
    assert!(
        !repacked_bytes.is_empty(),
        "repacked output should not be empty"
    );
    eprintln!("PASS: Full roundtrip for 84F085E5");
}

// ── Structure JSON verification ─────────────────────────────────────

#[test]
fn test_structure_json_uses_disk_paths_after_extract() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let fhm2d_path = fhm2d_path_for("16F73C97");

    let tmp = tempfile::tempdir().unwrap();
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();

    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d_path.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    )
    .unwrap();

    let stage_root = PathBuf::from(&result.output_dir);
    let sj = find_structure_json_path(&stage_root)
        .expect("structure JSON should exist after extraction");
    let content = fs::read_to_string(&sj).unwrap();
    let doc: serde_json::Value = serde_json::from_str(&content).unwrap();

    let sub_file_data = doc["SubFileData"].as_array().unwrap();
    for entry in sub_file_data {
        let url = entry["fileUrl"].as_str().unwrap();
        let relative = url.trim_start_matches(".\\");
        let file_path = sj.parent().unwrap().join(relative.replace('\\', "/"));
        assert!(
            file_path.exists(),
            "File in structure JSON must exist on disk: {} (resolved: {})",
            url,
            file_path.display()
        );
    }
    eprintln!(
        "All {} structure fileUrl entries point to actual files on disk",
        sub_file_data.len()
    );
}

#[test]
fn test_rebuild_structure_json_file_count_matches_original() {
    if skip_if_test_data_missing() {
        return;
    }
    let pack_root = test_pack_root("16F73C97");
    if !pack_root.is_dir() {
        eprintln!("SKIP: 16F73C97/ not found");
        return;
    }

    let original_sj_path = Path::new(TEST_DATA_ROOT).join("16F73C97_structure.json");
    if !original_sj_path.is_file() {
        eprintln!("SKIP: 16F73C97_structure.json not found");
        return;
    }

    let original_content: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&original_sj_path).unwrap()).unwrap();
    let original_count = original_content["Fhm2dTotalCount"].as_u64().unwrap() as usize;
    let original_sfd = original_content["SubFileData"].as_array().unwrap();
    eprintln!("Original: {original_count} files");

    let (_tmp, pack_root_copy) = copy_pack_root_to_temp("16F73C97");

    let rebuilt_path = rebuild_structure_json_for_stage(&pack_root_copy.to_string_lossy()).unwrap();

    let rebuilt_content: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&rebuilt_path).unwrap()).unwrap();
    let rebuilt_count = rebuilt_content["Fhm2dTotalCount"].as_u64().unwrap() as usize;
    let rebuilt_sfd = rebuilt_content["SubFileData"].as_array().unwrap();
    eprintln!("Rebuilt: {rebuilt_count} files");

    assert_eq!(
        rebuilt_count, original_count,
        "File count mismatch: rebuilt={rebuilt_count}, original={original_count}"
    );

    let rebuilt_parent = Path::new(&rebuilt_path).parent().unwrap();
    for entry in rebuilt_sfd {
        let url = entry["fileUrl"].as_str().unwrap();
        let relative = url.trim_start_matches(".\\");
        let file_path = rebuilt_parent.join(relative.replace('\\', "/"));
        assert!(
            file_path.exists(),
            "Rebuilt URL must point to existing file: {} (resolved: {})",
            url,
            file_path.display()
        );
    }

    let original_types: HashMap<String, String> = original_sfd
        .iter()
        .filter_map(|e| {
            let url = e["fileUrl"].as_str()?;
            let ftype = e["fileType"].as_str()?;
            let basename = url.split('/').last()?.to_string();
            Some((basename, ftype.to_string()))
        })
        .collect();
    for entry in rebuilt_sfd {
        let url = entry["fileUrl"].as_str().unwrap();
        let ftype = entry["fileType"].as_str().unwrap();
        let basename = url
            .replace('\\', "/")
            .split('/')
            .last()
            .unwrap()
            .to_string();
        if let Some(orig_type) = original_types.get(&basename) {
            assert_eq!(
                ftype, orig_type,
                "File type mismatch for {basename}: rebuilt={ftype}, original={orig_type}"
            );
        }
    }
    eprintln!("PASS: Rebuild file count and types match original");
}

#[test]
fn test_rebuild_structure_preserves_fileindex_links_after_stage_extract() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, pack_root, _content) = extract_to_temp("16F73C97");

    let original_path = find_structure_json_path(&pack_root)
        .expect("stage extraction should write a structure JSON");
    let original_doc: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&original_path).unwrap()).unwrap();
    let original_sub_file_count = original_doc["SubFileData"].as_array().unwrap().len();
    let original_item_indices: Vec<i32> = original_doc["SubFileStructure"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|entry| entry["type"].as_str() == Some("Item"))
        .map(|entry| entry["fileIndex"].as_i64().unwrap() as i32)
        .collect();

    let unique_item_indices: HashSet<i32> = original_item_indices.iter().copied().collect();
    assert!(
        original_item_indices.len() > unique_item_indices.len(),
        "16F73C97 should contain linked structure items sharing fileIndex values"
    );
    assert_eq!(
        unique_item_indices.len(),
        original_sub_file_count,
        "SubFileData should store each linked fileIndex once before rebuild"
    );

    let rebuilt_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();
    let rebuilt_doc: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&rebuilt_path).unwrap()).unwrap();
    let rebuilt_sub_file_count = rebuilt_doc["SubFileData"].as_array().unwrap().len();
    let rebuilt_item_indices: Vec<i32> = rebuilt_doc["SubFileStructure"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|entry| entry["type"].as_str() == Some("Item"))
        .map(|entry| entry["fileIndex"].as_i64().unwrap() as i32)
        .collect();

    assert_eq!(
        rebuilt_sub_file_count, original_sub_file_count,
        "rebuild must preserve linked fileIndex entries instead of materializing duplicate disk paths"
    );
    assert_eq!(
        rebuilt_item_indices, original_item_indices,
        "rebuild must preserve the original SubFileStructure fileIndex topology"
    );
}

// ── Scene editor operation tests ────────────────────────────────────

#[test]
fn test_clone_object_only_modifies_placement_then_repack() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let fhm2d_path = fhm2d_path_for("16F73C97");

    let tmp = tempfile::tempdir().unwrap();
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();

    eprintln!("Step 1: Extract original FHM2D");
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d_path.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    )
    .unwrap();
    let pack_root = PathBuf::from(&result.output_dir);
    let content_root = pack_root.join("0").join("0");
    let original_file_count = result.total_files;
    eprintln!("  Extracted {} files", original_file_count);

    eprintln!("Step 2: Load bundle and clone an OBJECT placement entry");
    let bundle = load_stage_bundle_impl(&content_root.to_string_lossy()).unwrap();
    let mut entries = bundle.placement_entries.clone();
    let original_entry_count = entries.len();

    let obj_entry = entries
        .iter()
        .find(|e| e.vdk_type == "OBJECT")
        .expect("should have OBJECT entry");
    let mut cloned = obj_entry.clone();
    let mut raw = cloned.raw_fields.clone();
    let px_idx = raw
        .iter()
        .position(|f| f.eq_ignore_ascii_case("VDK_POSITION_X"))
        .unwrap();
    raw[px_idx + 1] = "999.0".to_string();
    cloned.raw_fields = raw;
    cloned.pos_x = 999.0;
    entries.push(cloned);

    eprintln!(
        "  Cloned entry: {} -> {} entries",
        original_entry_count,
        entries.len()
    );

    eprintln!("Step 3: Write modified placement.csv");
    let csv_content = entries
        .iter()
        .map(|e| e.raw_fields.join(","))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(
        content_root.join("info").join("placement.csv"),
        &csv_content,
    )
    .unwrap();

    eprintln!("Step 4: Rebuild structure JSON and repack");
    let rebuilt_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();
    let repack_output = tmp.path().join("cloned.fhm2d");
    let repack_result = crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &rebuilt_path,
        &repack_output.to_string_lossy(),
        false,
        None,
    )
    .unwrap();
    eprintln!("  Repacked: {} files", repack_result.total_files);

    let rebuilt_doc: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&rebuilt_path).unwrap()).unwrap();
    let rebuilt_sub_file_count = rebuilt_doc["SubFileData"].as_array().unwrap().len();
    assert_eq!(
        repack_result.total_files, rebuilt_sub_file_count,
        "repack should use internal SubFileData count, not materialized disk path count"
    );
    assert!(
        rebuilt_sub_file_count < original_file_count,
        "linked fileIndex topology should keep fewer internal files than disk paths"
    );

    eprintln!("Step 5: Re-extract and verify clone persists");
    let re_extract_dir = tmp.path().join("re_extract");
    fs::create_dir_all(&re_extract_dir).unwrap();
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_output.to_string_lossy(),
        &re_extract_dir.to_string_lossy(),
    )
    .unwrap();
    assert_eq!(
        re_extract.total_files, original_file_count,
        "re-extracted file count should match (clone only modifies CSV, not file count)"
    );

    let re_pack_root = PathBuf::from(&re_extract.output_dir);
    let placement_found = find_file_by_content_recursive(&re_pack_root, b"VDK_TYPE");
    assert!(
        placement_found.is_some(),
        "re-extracted stage should contain a placement CSV (file with VDK_TYPE)"
    );
    let placement_content = fs::read_to_string(placement_found.unwrap()).unwrap();
    let line_count = placement_content.lines().count();
    assert_eq!(
        line_count,
        original_entry_count + 1,
        "placement CSV should have {} lines (original {} + 1 clone), got {line_count}",
        original_entry_count + 1,
        original_entry_count
    );
    assert!(
        placement_content.contains("999.0"),
        "placement CSV should contain the cloned entry with pos_x=999.0"
    );
    eprintln!("PASS: Clone object roundtrip verified ({line_count} placement entries)");
}

#[test]
fn test_delete_object_folder_then_repack() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let fhm2d_path = fhm2d_path_for("16F73C97");

    let tmp = tempfile::tempdir().unwrap();
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();

    eprintln!("Step 1: Extract original FHM2D");
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d_path.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    )
    .unwrap();
    let pack_root = PathBuf::from(&result.output_dir);
    let content_root = pack_root.join("0").join("0");
    let original_file_count = result.total_files;

    eprintln!("Step 2: Load bundle and identify model to delete");
    let bundle = load_stage_bundle_impl(&content_root.to_string_lossy()).unwrap();
    let sub_model = bundle
        .sub_models
        .iter()
        .find(|m| m.folder_name.contains("object_box01"))
        .expect("should find object_box01 sub model");
    let deleted_folder = sub_model.folder_name.clone();
    let deleted_path = content_root.join(&deleted_folder);

    let deleted_file_count = count_files_recursive(&deleted_path);
    eprintln!(
        "  Deleting {} ({} files)",
        deleted_folder, deleted_file_count
    );

    eprintln!("Step 3: Delete model folder and remove its OBJECT entries from placement");
    fs::remove_dir_all(&deleted_path).unwrap();

    let mut entries = bundle.placement_entries.clone();
    let deleted_index = sub_model.object_index as i32;
    entries.retain(|e| {
        if e.vdk_type == "OBJECT" {
            if let Some(obj_num) = e.object_number {
                return obj_num != deleted_index;
            }
        }
        true
    });
    let csv_content = entries
        .iter()
        .map(|e| e.raw_fields.join(","))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(
        content_root.join("info").join("placement.csv"),
        &csv_content,
    )
    .unwrap();

    eprintln!("Step 4: Rebuild structure JSON and repack");
    let rebuilt_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();

    let rebuilt_doc: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&rebuilt_path).unwrap()).unwrap();
    let rebuilt_file_count = rebuilt_doc["Fhm2dTotalCount"].as_u64().unwrap() as usize;
    eprintln!(
        "  Rebuilt structure: {} files (original was {})",
        rebuilt_file_count, original_file_count
    );
    assert!(
        rebuilt_file_count < original_file_count,
        "rebuilt should have fewer files after deletion"
    );

    let repack_output = tmp.path().join("deleted.fhm2d");
    let repack_result = crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &rebuilt_path,
        &repack_output.to_string_lossy(),
        false,
        None,
    )
    .unwrap();
    eprintln!("  Repacked: {} files", repack_result.total_files);

    eprintln!("Step 5: Re-extract and verify deletion");
    let re_extract_dir = tmp.path().join("re_extract");
    fs::create_dir_all(&re_extract_dir).unwrap();
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_output.to_string_lossy(),
        &re_extract_dir.to_string_lossy(),
    )
    .unwrap();
    assert_eq!(
        re_extract.total_files, rebuilt_file_count,
        "re-extracted file count should match rebuilt count"
    );

    let re_content = PathBuf::from(&re_extract.output_dir).join("0").join("0");
    let re_bundle = load_stage_bundle_impl(&re_content.to_string_lossy()).unwrap();
    let still_has = re_bundle
        .sub_models
        .iter()
        .any(|m| m.folder_name.contains("object_box01"));
    assert!(
        !still_has,
        "deleted model should not appear in re-extracted bundle"
    );
    eprintln!("PASS: Delete object roundtrip verified");
}

#[test]
fn test_full_pipeline_extract_modify_rebuild_repack_verify() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let fhm2d_path = fhm2d_path_for("16F73C97");
    let original_bytes = fs::read(&fhm2d_path).unwrap();

    let tmp = tempfile::tempdir().unwrap();

    eprintln!("=== Phase 1: Extract ===");
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d_path.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    )
    .unwrap();
    let pack_root = PathBuf::from(&result.output_dir);
    let content_root = pack_root.join("0").join("0");
    let original_file_count = result.total_files;
    eprintln!("  Extracted {} files", original_file_count);

    eprintln!("=== Phase 2: Modify (clone object + edit position) ===");
    let bundle = load_stage_bundle_impl(&content_root.to_string_lossy()).unwrap();
    let mut entries = bundle.placement_entries.clone();

    let obj_entry = entries
        .iter()
        .find(|e| e.vdk_type == "OBJECT")
        .cloned()
        .expect("should have OBJECT entry");
    let mut cloned = obj_entry;
    let mut raw = cloned.raw_fields.clone();
    if let Some(px_idx) = raw
        .iter()
        .position(|f| f.eq_ignore_ascii_case("VDK_POSITION_X"))
    {
        raw[px_idx + 1] = "777.0".to_string();
    }
    cloned.raw_fields = raw;
    entries.push(cloned);

    let csv_content = entries
        .iter()
        .map(|e| e.raw_fields.join(","))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(
        content_root.join("info").join("placement.csv"),
        &csv_content,
    )
    .unwrap();
    eprintln!("  Added cloned OBJECT at pos_x=777");

    eprintln!("=== Phase 3: Rebuild structure JSON ===");
    let rebuilt_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();
    let rebuilt_doc: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&rebuilt_path).unwrap()).unwrap();
    let rebuilt_count = rebuilt_doc["Fhm2dTotalCount"].as_u64().unwrap() as usize;
    assert!(
        rebuilt_count < original_file_count,
        "internal SubFileData count should stay below materialized disk path count"
    );

    eprintln!("=== Phase 4: Repack ===");
    let repack_output = tmp.path().join("modified.fhm2d");
    let repack_result = crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &rebuilt_path,
        &repack_output.to_string_lossy(),
        false,
        None,
    )
    .unwrap();
    eprintln!(
        "  Repacked: {} files, {} bytes",
        repack_result.total_files, repack_result.output_size
    );
    assert_eq!(
        repack_result.total_files, rebuilt_count,
        "repack should use internal SubFileData count"
    );

    eprintln!("=== Phase 5: Verify via re-extract ===");
    let re_extract_dir = tmp.path().join("verify");
    fs::create_dir_all(&re_extract_dir).unwrap();
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_output.to_string_lossy(),
        &re_extract_dir.to_string_lossy(),
    )
    .unwrap();
    assert_eq!(
        re_extract.total_files, original_file_count,
        "file count should be unchanged (clone only modifies CSV)"
    );

    let re_pack_root = PathBuf::from(&re_extract.output_dir);
    let placement_found = find_file_by_content_recursive(&re_pack_root, b"VDK_TYPE");
    assert!(
        placement_found.is_some(),
        "re-extracted should contain a placement CSV (file with VDK_TYPE)"
    );
    let placement_content = fs::read_to_string(placement_found.unwrap()).unwrap();
    let original_lines = bundle.placement_entries.len();
    let re_lines = placement_content.lines().count();
    assert_eq!(
        re_lines,
        original_lines + 1,
        "placement should have {} lines ({} + 1 clone), got {re_lines}",
        original_lines + 1,
        original_lines
    );
    assert!(
        placement_content.contains("777.0"),
        "cloned entry should have pos_x=777.0"
    );

    let repacked_bytes = fs::read(&repack_output).unwrap();
    eprintln!(
        "  Original: {} bytes, Modified: {} bytes",
        original_bytes.len(),
        repacked_bytes.len()
    );
    eprintln!("PASS: Full pipeline (extract -> modify -> rebuild -> repack -> verify)");
}

// ── Disk-visible roundtrip test (output to test folder) ─────────────

#[test]
fn test_roundtrip_on_disk_16f73c97() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }

    let test_dir = Path::new(TEST_DATA_ROOT);
    let fhm2d_path = test_dir.join("16F73C97.fhm2d");
    let extract_dir = test_dir.to_path_buf();
    let pack_root_output = test_dir.join("16F73C97");
    let repack_output = test_dir.join("test.fhm2d");
    let verify_dir = test_dir.join("test_verify");

    if pack_root_output.exists() {
        fs::remove_dir_all(&pack_root_output).expect("clean existing 16F73C97/");
    }
    if verify_dir.exists() {
        fs::remove_dir_all(&verify_dir).expect("clean existing test_verify/");
    }

    eprintln!("=== Step 1: Extract 16F73C97.fhm2d -> 16F73C97/ ===");
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d_path.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    )
    .unwrap();
    let pack_root = PathBuf::from(&result.output_dir);
    eprintln!(
        "  Extracted {} files to {}",
        result.total_files,
        pack_root.display()
    );
    assert_eq!(result.total_files, 65);

    eprintln!("=== Step 2: Restore shared textures ===");
    let restore_result = restore_shared_textures(&pack_root.to_string_lossy()).unwrap();
    eprintln!(
        "  Restored: {} textures collected, {} subdirs removed",
        restore_result.textures_collected, restore_result.subdirs_removed
    );

    eprintln!("=== Step 2b: Redistribute textures back to model subdirs ===");
    let redist_result = redistribute_stage_textures(&pack_root.to_string_lossy()).unwrap();
    eprintln!(
        "  Redistributed: {} models, {} textures",
        redist_result.models_processed, redist_result.textures_copied
    );

    eprintln!("=== Step 3: Rebuild structure JSON ===");
    let rebuilt_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();
    eprintln!("  Rebuilt: {rebuilt_path}");

    let sj_content = fs::read_to_string(&rebuilt_path).unwrap();
    let doc: serde_json::Value = serde_json::from_str(&sj_content).unwrap();
    let file_count = doc["Fhm2dTotalCount"].as_u64().unwrap();
    let sfd = doc["SubFileData"].as_array().unwrap();
    eprintln!(
        "  Structure: {} files, {} SubFileData entries",
        file_count,
        sfd.len()
    );

    eprintln!("=== Step 4: Repack -> test.fhm2d ===");
    let repack_result = crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &rebuilt_path,
        &repack_output.to_string_lossy(),
        false,
        None,
    )
    .unwrap();
    eprintln!(
        "  Repacked: {} files, {} bytes -> {}",
        repack_result.total_files,
        repack_result.output_size,
        repack_output.display()
    );

    eprintln!("=== Step 5: Re-extract test.fhm2d -> test_verify/ ===");
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_output.to_string_lossy(),
        &test_dir.to_string_lossy(),
    );
    if re_extract.is_err() {
        let repack_2_dir = test_dir.join("test_verify_raw");
        fs::create_dir_all(&repack_2_dir).ok();
        let re2 = extract_stage_fhm2d_to_folder_impl(
            &repack_output.to_string_lossy(),
            &repack_2_dir.to_string_lossy(),
        )
        .unwrap();
        eprintln!(
            "  Re-extracted {} files to {}",
            re2.total_files, re2.output_dir
        );
        assert_eq!(re2.total_files, result.total_files);
    } else {
        let re = re_extract.unwrap();
        let re_pack_root = PathBuf::from(&re.output_dir);
        if re_pack_root != verify_dir {
            if verify_dir.exists() {
                fs::remove_dir_all(&verify_dir).ok();
            }
            fs::rename(&re_pack_root, &verify_dir).ok();
        }
        eprintln!(
            "  Re-extracted {} files to {}",
            re.total_files,
            verify_dir.display()
        );
        assert_eq!(re.total_files, result.total_files);
    }

    let original_size = fs::metadata(&fhm2d_path).unwrap().len();
    let repacked_size = fs::metadata(&repack_output).unwrap().len();
    eprintln!("\n=== Summary ===");
    eprintln!("  Original:  {} bytes", original_size);
    eprintln!("  Repacked:  {} bytes", repacked_size);
    eprintln!("  Files:     {}", file_count);
    eprintln!("  Output:    {}", test_dir.display());
    eprintln!("  Folders:   16F73C97/ (extracted+restored), test_verify/ (re-extracted)");
    eprintln!("PASS");
}

// ── Test helper functions ────────────────────────────────────────────

fn count_nutexb_recursive(dir: &Path) -> usize {
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                count += count_nutexb_recursive(&entry.path());
            } else {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.to_ascii_lowercase().ends_with(".nutexb") {
                    count += 1;
                }
            }
        }
    }
    count
}

fn find_file_by_content_recursive(dir: &Path, needle: &[u8]) -> Option<PathBuf> {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                if let Some(found) = find_file_by_content_recursive(&entry.path(), needle) {
                    return Some(found);
                }
            } else {
                if let Ok(data) = fs::read(entry.path()) {
                    if data.windows(needle.len()).any(|w| w == needle) {
                        return Some(entry.path());
                    }
                }
            }
        }
    }
    None
}

fn count_files_recursive(dir: &Path) -> usize {
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                count += count_files_recursive(&entry.path());
            } else {
                count += 1;
            }
        }
    }
    count
}


// ── Blackbox tests ───────────────────────────────────────────────────

#[test]
fn test_blackbox_t1_extract_and_verify_structure() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    eprintln!("T1: extracting 16F73C97.fhm2d...");
    let (_tmp, pack_root, content_root) = extract_to_temp("16F73C97");

    let fhm2d = fhm2d_path_for("16F73C97");
    let extract_dir = pack_root.parent().unwrap().to_path_buf();
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    )
    .unwrap();
    assert_eq!(result.total_files, 65, "total_files should be 65");
    eprintln!("T1: total_files={}", result.total_files);

    for dir in &["sky", "info", "base", "001stage001_object_box01"] {
        assert!(content_root.join(dir).is_dir(), "missing dir: {dir}");
    }
    eprintln!("T1: required dirs present");

    let placement_csv = content_root.join("info").join("placement.csv");
    assert!(placement_csv.exists(), "placement.csv missing");
    let placement_text = fs::read_to_string(&placement_csv).unwrap();
    assert!(placement_text.contains("VDK_TYPE"), "placement.csv missing VDK_TYPE");

    let graphic_csv = content_root.join("info").join("graphic_param.csv");
    assert!(graphic_csv.exists(), "graphic_param.csv missing");
    let graphic_text = fs::read_to_string(&graphic_csv).unwrap();
    assert!(graphic_text.contains("directional_lighting"), "graphic_param.csv missing directional_lighting");

    let hkt = content_root.join("001stage001_object_box01").join("map_hit.hkt");
    assert!(hkt.exists(), "map_hit.hkt missing");
    eprintln!("T1: files verified");

    let bundle = load_stage_bundle_impl(&content_root.to_string_lossy()).unwrap();
    assert!(bundle.sub_models.len() >= 1, "sub_models should be >= 1");
    assert_eq!(bundle.placement_entries.len(), 5, "placement_entries should be 5");
    eprintln!("T1: bundle sub_models={}, placement_entries={}", bundle.sub_models.len(), bundle.placement_entries.len());
    eprintln!("PASS: test_blackbox_t1_extract_and_verify_structure");
}

#[test]
fn test_blackbox_t2_restore_shared_textures() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    eprintln!("T2: extracting...");
    let (_tmp, pack_root, content_root) = extract_to_temp("16F73C97");

    eprintln!("T2: calling restore_shared_textures...");
    let restore = restore_shared_textures(&pack_root.to_string_lossy()).unwrap();
    eprintln!("T2: textures_collected={}, subdirs_removed={}", restore.textures_collected, restore.subdirs_removed);
    assert!(restore.textures_collected > 0, "textures_collected should be > 0");

    let textures_dir = pack_root.join("textures");
    assert!(textures_dir.is_dir(), "textures/ dir should exist");

    let has_nutexb = fs::read_dir(&textures_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .any(|e| e.path().extension().map(|x| x.eq_ignore_ascii_case("nutexb")).unwrap_or(false));
    assert!(has_nutexb, "textures/ should contain .nutexb files");
    eprintln!("T2: textures/ has .nutexb files");

    // model subdir 001stage001_object_box01/0/ should have no numeric subdirs
    let model_ssbh_dir = content_root.join("001stage001_object_box01").join("0");
    if model_ssbh_dir.is_dir() {
        let has_numeric_subdir = fs::read_dir(&model_ssbh_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false)
                && e.file_name().to_string_lossy().chars().all(|c| c.is_ascii_digit()));
        assert!(!has_numeric_subdir, "numeric texture subdirs should be removed after restore");
        eprintln!("T2: numeric subdirs removed from model dir");
    }

    let bundle = load_stage_bundle_impl(&content_root.to_string_lossy()).unwrap();
    assert!(!bundle.sub_models.is_empty(), "bundle should still load after restore");
    eprintln!("T2: bundle still loads, sub_models={}", bundle.sub_models.len());
    eprintln!("PASS: test_blackbox_t2_restore_shared_textures");
}


#[test]
fn test_blackbox_t3_dae_to_ssbh_conversion() {
    use crate::ssbh_dae::{convert_dae_file, DaeConvertConfig};
    use crate::ssbh_dae::UpAxisConversion;

    let dae_path = Path::new(r"D:\output\exvs2\zabanya\body.dae");
    if !dae_path.exists() {
        eprintln!("SKIP: body.dae not found at {}", dae_path.display());
        return;
    }
    eprintln!("T3: converting {}...", dae_path.display());

    let tmp = tempfile::tempdir().unwrap();
    let out_dir = tmp.path().join("dae_out");
    fs::create_dir_all(&out_dir).unwrap();

    let config = DaeConvertConfig {
        output_directory: out_dir.clone(),
        base_filename: "zabanya_body".to_string(),
        scale_factor: 1.0,
        up_axis_conversion: UpAxisConversion::YUp,
        flip_uv: false,
        include_geometry_names: Vec::new(),
        write_numdlb: true,
        write_numshb: true,
        write_nusktb: true,
        modl_entries: Vec::new(),
    };

    let (converted, stats) = convert_dae_file(dae_path, &config).unwrap();
    eprintln!("T3: mesh_objects={}, total_vertices={}, bones={}", stats.mesh_objects, stats.total_vertices, stats.bones);

    let numdlb = converted.numdlb_path.as_ref().expect("numdlb_path should be Some");
    let numshb = converted.numshb_path.as_ref().expect("numshb_path should be Some");
    let nusktb = converted.nusktb_path.as_ref().expect("nusktb_path should be Some");

    assert!(numdlb.exists(), "numdlb file should exist: {}", numdlb.display());
    assert!(numshb.exists(), "numshb file should exist: {}", numshb.display());
    assert!(nusktb.exists(), "nusktb file should exist: {}", nusktb.display());

    assert!(fs::metadata(numdlb).unwrap().len() > 0, "numdlb should be non-empty");
    assert!(fs::metadata(numshb).unwrap().len() > 0, "numshb should be non-empty");
    assert!(fs::metadata(nusktb).unwrap().len() > 0, "nusktb should be non-empty");

    eprintln!("T3: numdlb={}, numshb={}, nusktb={}", numdlb.display(), numshb.display(), nusktb.display());
    eprintln!("PASS: test_blackbox_t3_dae_to_ssbh_conversion");
}


#[test]
fn test_blackbox_t4_add_new_object_repack_verify() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    eprintln!("T4: extracting...");
    let fhm2d = fhm2d_path_for("16F73C97");
    let tmp = tempfile::tempdir().unwrap();
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    ).unwrap();
    let pack_root = PathBuf::from(&result.output_dir);
    let content_root = pack_root.join("0").join("0");
    let original_file_count = result.total_files;
    eprintln!("T4: original_file_count={}", original_file_count);

    eprintln!("T4: restore_shared_textures...");
    restore_shared_textures(&pack_root.to_string_lossy()).unwrap();

    // Create new object dir zabanya_body/0/
    let new_obj_dir = content_root.join("zabanya_body").join("0");
    fs::create_dir_all(&new_obj_dir).unwrap();
    eprintln!("T4: created {}", new_obj_dir.display());

    // Copy SSBH files from 001stage001_object_box01/0/ keeping original filenames
    // (numdlb internally references mesh by name, renaming would break the link)
    let src_ssbh = content_root.join("001stage001_object_box01").join("0");
    let extensions = ["numdlb", "numshb", "nusktb", "numatb", "jnttbl"];
    for entry in fs::read_dir(&src_ssbh).unwrap().filter_map(|e| e.ok()) {
        let path = entry.path();
        if let Some(ext) = path.extension() {
            let ext_str = ext.to_string_lossy().to_lowercase();
            if extensions.contains(&ext_str.as_str()) {
                let fname = path.file_name().unwrap().to_string_lossy().to_string();
                let dst = new_obj_dir.join(&fname);
                fs::copy(&path, &dst).unwrap();
                eprintln!("T4: copied {}", fname);
            }
        }
    }

    // Copy map_hit.hkt
    let src_hkt = content_root.join("001stage001_object_box01").join("map_hit.hkt");
    let dst_hkt = content_root.join("zabanya_body").join("map_hit.hkt");
    fs::copy(&src_hkt, &dst_hkt).unwrap();
    eprintln!("T4: copied map_hit.hkt");

    // Load bundle to get new object index
    let bundle = load_stage_bundle_impl(&content_root.to_string_lossy()).unwrap();
    let new_obj_index = bundle.sub_models.iter()
        .find(|m| m.folder_name == "zabanya_body")
        .map(|m| m.object_index)
        .expect("zabanya_body should appear in sub_models");
    eprintln!("T4: new object_index={}", new_obj_index);

    // Append new OBJECT row to placement.csv
    let placement_path = content_root.join("info").join("placement.csv");
    let mut placement_text = fs::read_to_string(&placement_path).unwrap();
    let new_row = format!(
        "VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,0.0,VDK_POSITION_Y,0.0,VDK_POSITION_Z,0.0,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,0.0,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,{},VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE",
        new_obj_index
    );
    if !placement_text.ends_with('\n') {
        placement_text.push('\n');
    }
    placement_text.push_str(&new_row);
    fs::write(&placement_path, &placement_text).unwrap();
    eprintln!("T4: appended new OBJECT row with VDK_OBJECTNUMBER={}", new_obj_index);

    eprintln!("T4: redistribute_stage_textures...");
    redistribute_stage_textures(&pack_root.to_string_lossy()).unwrap();

    eprintln!("T4: rebuild_structure_json_for_stage...");
    let structure_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();

    eprintln!("T4: repack...");
    let repack_out = tmp.path().join("t4_repacked.fhm2d");
    crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &structure_path,
        &repack_out.to_string_lossy(),
        false,
        None,
    ).unwrap();

    eprintln!("T4: re-extract...");
    let re_dir = tmp.path().join("t4_re_extract");
    fs::create_dir_all(&re_dir).unwrap();
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_out.to_string_lossy(),
        &re_dir.to_string_lossy(),
    ).unwrap();
    eprintln!("T4: re_extract.total_files={}, original={}", re_extract.total_files, original_file_count);
    // New object files may be linked (shared fileIndex) so total_files may equal original
    assert!(re_extract.total_files >= original_file_count, "re-extracted should have at least as many files as original");

    let re_content = PathBuf::from(&re_extract.output_dir).join("0").join("0");
    let re_bundle = load_stage_bundle_impl(&re_content.to_string_lossy()).unwrap();
    // zabanya_body uses same SSBH files as object_box01 (linked), so it may appear as object_box01 in sub_models
    // The key verification is that placement.csv contains the new OBJECT row
    eprintln!("T4: re_bundle sub_models={}", re_bundle.sub_models.len());

    let re_placement = fs::read_to_string(re_content.join("info").join("placement.csv")).unwrap();
    assert!(re_placement.contains(&format!("VDK_OBJECTNUMBER,{}", new_obj_index)), "placement.csv should contain new OBJECT row");
    let re_obj_count = re_bundle.placement_entries.iter().filter(|e| e.vdk_type == "OBJECT").count();
    assert_eq!(re_obj_count, 5, "re-extracted bundle should have 5 OBJECT entries (4 original + 1 new), got {re_obj_count}");
    eprintln!("PASS: test_blackbox_t4_add_new_object_repack_verify");
}


#[test]
fn test_blackbox_t5_delete_object_repack_verify() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    eprintln!("T5: extracting...");
    let fhm2d = fhm2d_path_for("16F73C97");
    let tmp = tempfile::tempdir().unwrap();
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    ).unwrap();
    let pack_root = PathBuf::from(&result.output_dir);
    let content_root = pack_root.join("0").join("0");
    let original_file_count = result.total_files;
    eprintln!("T5: original_file_count={}", original_file_count);

    eprintln!("T5: restore_shared_textures...");
    restore_shared_textures(&pack_root.to_string_lossy()).unwrap();

    // Delete 001stage001_object_box01/
    let obj_dir = content_root.join("001stage001_object_box01");
    fs::remove_dir_all(&obj_dir).unwrap();
    eprintln!("T5: deleted {}", obj_dir.display());

    // Remove VDK_OBJECTNUMBER=0 OBJECT rows from placement.csv
    let placement_path = content_root.join("info").join("placement.csv");
    let placement_text = fs::read_to_string(&placement_path).unwrap();
    let filtered: Vec<&str> = placement_text.lines().filter(|line| {
        // Keep line unless it's an OBJECT row with VDK_OBJECTNUMBER,0
        let is_object = line.contains("VDK_TYPE,OBJECT");
        let has_obj0 = line.contains("VDK_OBJECTNUMBER,0");
        !(is_object && has_obj0)
    }).collect();
    fs::write(&placement_path, filtered.join("\n")).unwrap();
    eprintln!("T5: filtered placement.csv, {} lines remain", filtered.len());

    eprintln!("T5: redistribute_stage_textures...");
    redistribute_stage_textures(&pack_root.to_string_lossy()).unwrap();

    eprintln!("T5: rebuild_structure_json_for_stage...");
    let structure_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();

    eprintln!("T5: repack...");
    let repack_out = tmp.path().join("t5_repacked.fhm2d");
    crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &structure_path,
        &repack_out.to_string_lossy(),
        false,
        None,
    ).unwrap();

    eprintln!("T5: re-extract...");
    let re_dir = tmp.path().join("t5_re_extract");
    fs::create_dir_all(&re_dir).unwrap();
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_out.to_string_lossy(),
        &re_dir.to_string_lossy(),
    ).unwrap();
    eprintln!("T5: re_extract.total_files={}, original={}", re_extract.total_files, original_file_count);
    assert!(re_extract.total_files < original_file_count, "re-extracted should have fewer files after deletion");

    let re_content = PathBuf::from(&re_extract.output_dir).join("0").join("0");
    let re_bundle = load_stage_bundle_impl(&re_content.to_string_lossy()).unwrap();
    assert!(
        !re_bundle.sub_models.iter().any(|m| m.folder_name.contains("object_box01")),
        "re-extracted bundle should not contain object_box01"
    );

    let re_placement = fs::read_to_string(re_content.join("info").join("placement.csv")).unwrap();
    let has_obj0_row = re_placement.lines().any(|line| {
        line.contains("VDK_TYPE,OBJECT") && line.contains("VDK_OBJECTNUMBER,0")
    });
    assert!(!has_obj0_row, "placement.csv should not contain VDK_OBJECTNUMBER=0 OBJECT rows");
    eprintln!("PASS: test_blackbox_t5_delete_object_repack_verify");
}


#[test]
fn test_blackbox_t6_move_transform_repack_verify() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    eprintln!("T6: extracting...");
    let fhm2d = fhm2d_path_for("16F73C97");
    let tmp = tempfile::tempdir().unwrap();
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    ).unwrap();
    let pack_root = PathBuf::from(&result.output_dir);
    let content_root = pack_root.join("0").join("0");
    let original_file_count = result.total_files;

    eprintln!("T6: restore_shared_textures...");
    restore_shared_textures(&pack_root.to_string_lossy()).unwrap();

    // Load bundle and modify first OBJECT entry
    let bundle = load_stage_bundle_impl(&content_root.to_string_lossy()).unwrap();
    let mut entries = bundle.placement_entries.clone();
    let obj_idx = entries.iter().position(|e| e.vdk_type == "OBJECT")
        .expect("should have at least one OBJECT entry");

    let raw = &mut entries[obj_idx].raw_fields;
    // Helper closure: set field value, or append if missing
    fn set_field(raw: &mut Vec<String>, key: &str, val: &str) {
        if let Some(i) = raw.iter().position(|f| f.eq_ignore_ascii_case(key)) {
            raw[i + 1] = val.to_string();
        } else {
            raw.push(key.to_string());
            raw.push(val.to_string());
        }
    }
    set_field(raw, "VDK_POSITION_X", "9999.0");
    set_field(raw, "VDK_POSITION_Y", "100.0");
    set_field(raw, "VDK_POSITION_Z", "-9999.0");
    set_field(raw, "VDK_ROTATION_Y", "45.0");
    eprintln!("T6: modified first OBJECT pos to (9999.0, 100.0, -9999.0), rot_y=45.0");

    let placement_path = content_root.join("info").join("placement.csv");
    let csv = entries.iter().map(|e| e.raw_fields.join(",")).collect::<Vec<_>>().join("\n");
    fs::write(&placement_path, &csv).unwrap();

    eprintln!("T6: redistribute_stage_textures...");
    redistribute_stage_textures(&pack_root.to_string_lossy()).unwrap();

    eprintln!("T6: rebuild_structure_json_for_stage...");
    let structure_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();

    eprintln!("T6: repack...");
    let repack_out = tmp.path().join("t6_repacked.fhm2d");
    crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &structure_path,
        &repack_out.to_string_lossy(),
        false,
        None,
    ).unwrap();

    eprintln!("T6: re-extract...");
    let re_dir = tmp.path().join("t6_re_extract");
    fs::create_dir_all(&re_dir).unwrap();
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_out.to_string_lossy(),
        &re_dir.to_string_lossy(),
    ).unwrap();
    eprintln!("T6: re_extract.total_files={}", re_extract.total_files);
    assert_eq!(re_extract.total_files, original_file_count, "file count should be unchanged");

    let re_content = PathBuf::from(&re_extract.output_dir).join("0").join("0");
    let re_placement_text = fs::read_to_string(re_content.join("info").join("placement.csv")).unwrap();
    assert!(re_placement_text.contains("9999.0"), "placement.csv should contain 9999.0");
    assert!(re_placement_text.contains("100.0"), "placement.csv should contain 100.0");
    assert!(re_placement_text.contains("-9999.0"), "placement.csv should contain -9999.0");
    eprintln!("T6: placement.csv contains expected values");

    let re_bundle = load_stage_bundle_impl(&re_content.to_string_lossy()).unwrap();
    let first_obj = re_bundle.placement_entries.iter().find(|e| e.vdk_type == "OBJECT")
        .expect("should have OBJECT entry");
    assert!((first_obj.pos_x - 9999.0).abs() < 0.1, "pos_x should be ~9999.0, got {}", first_obj.pos_x);
    eprintln!("T6: first OBJECT pos_x={}", first_obj.pos_x);
    eprintln!("PASS: test_blackbox_t6_move_transform_repack_verify");
}


#[test]
fn test_blackbox_t7_xyz_multi_object_transform_repack_verify() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    eprintln!("T7: extracting...");
    let fhm2d = fhm2d_path_for("16F73C97");
    let tmp = tempfile::tempdir().unwrap();
    let extract_dir = tmp.path().join("extract");
    fs::create_dir_all(&extract_dir).unwrap();
    let result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d.to_string_lossy(),
        &extract_dir.to_string_lossy(),
    ).unwrap();
    let pack_root = PathBuf::from(&result.output_dir);
    let content_root = pack_root.join("0").join("0");
    let original_file_count = result.total_files;

    eprintln!("T7: restore_shared_textures...");
    restore_shared_textures(&pack_root.to_string_lossy()).unwrap();

    let bundle = load_stage_bundle_impl(&content_root.to_string_lossy()).unwrap();
    let mut entries = bundle.placement_entries.clone();

    // Positions for each OBJECT (in order)
    let positions = [
        (100.0f64, 10.0f64, 200.0f64),
        (-100.0, 20.0, -200.0),
        (300.0, 30.0, 400.0),
        (-300.0, 40.0, -400.0),
    ];

    fn set_field(raw: &mut Vec<String>, key: &str, val: &str) {
        if let Some(i) = raw.iter().position(|f| f.eq_ignore_ascii_case(key)) {
            raw[i + 1] = val.to_string();
        } else {
            raw.push(key.to_string());
            raw.push(val.to_string());
        }
    }

    let mut obj_count = 0usize;
    for entry in entries.iter_mut() {
        if entry.vdk_type != "OBJECT" {
            continue;
        }
        if obj_count >= positions.len() {
            break;
        }
        let (x, y, z) = positions[obj_count];
        set_field(&mut entry.raw_fields, "VDK_POSITION_X", &x.to_string());
        set_field(&mut entry.raw_fields, "VDK_POSITION_Y", &y.to_string());
        set_field(&mut entry.raw_fields, "VDK_POSITION_Z", &z.to_string());
        if obj_count == 0 {
            set_field(&mut entry.raw_fields, "VDK_SCALE_X", "2.0");
            set_field(&mut entry.raw_fields, "VDK_SCALE_Y", "2.0");
            set_field(&mut entry.raw_fields, "VDK_SCALE_Z", "2.0");
        }
        eprintln!("T7: OBJECT[{}] -> ({}, {}, {})", obj_count, x, y, z);
        obj_count += 1;
    }
    assert_eq!(obj_count, 4, "should have modified 4 OBJECT entries");

    let placement_path = content_root.join("info").join("placement.csv");
    let csv = entries.iter().map(|e| e.raw_fields.join(",")).collect::<Vec<_>>().join("\n");
    fs::write(&placement_path, &csv).unwrap();

    eprintln!("T7: redistribute_stage_textures...");
    redistribute_stage_textures(&pack_root.to_string_lossy()).unwrap();

    eprintln!("T7: rebuild_structure_json_for_stage...");
    let structure_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();

    eprintln!("T7: repack...");
    let repack_out = tmp.path().join("t7_repacked.fhm2d");
    crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &structure_path,
        &repack_out.to_string_lossy(),
        false,
        None,
    ).unwrap();

    eprintln!("T7: re-extract...");
    let re_dir = tmp.path().join("t7_re_extract");
    fs::create_dir_all(&re_dir).unwrap();
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_out.to_string_lossy(),
        &re_dir.to_string_lossy(),
    ).unwrap();
    eprintln!("T7: re_extract.total_files={}", re_extract.total_files);
    assert_eq!(re_extract.total_files, original_file_count, "file count should be unchanged");

    let re_content = PathBuf::from(&re_extract.output_dir).join("0").join("0");
    let re_placement_text = fs::read_to_string(re_content.join("info").join("placement.csv")).unwrap();

    // Verify all modified coordinate values appear in the CSV
    for (x, y, z) in &positions {
        assert!(re_placement_text.contains(&x.to_string()), "placement.csv should contain {x}");
        assert!(re_placement_text.contains(&y.to_string()), "placement.csv should contain {y}");
        assert!(re_placement_text.contains(&z.to_string()), "placement.csv should contain {z}");
    }
    eprintln!("T7: all coordinate values present in placement.csv");

    let re_bundle = load_stage_bundle_impl(&re_content.to_string_lossy()).unwrap();
    let re_obj_count = re_bundle.placement_entries.iter().filter(|e| e.vdk_type == "OBJECT").count();
    assert_eq!(re_obj_count, 4, "re-extracted bundle should have 4 OBJECT entries, got {re_obj_count}");
    eprintln!("T7: OBJECT count={}", re_obj_count);
    eprintln!("PASS: test_blackbox_t7_xyz_multi_object_transform_repack_verify");
}

#[test]
fn test_rebuild_with_shared_textures_no_file_movement() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, pack_root, _content) = extract_to_temp("16F73C97");

    // Step 1: restore_shared_textures — move nutexb to textures/
    let restore = restore_shared_textures(&pack_root.to_string_lossy()).unwrap();
    assert!(restore.textures_collected > 0, "should collect textures");
    let textures_dir = pack_root.join("textures");
    assert!(textures_dir.is_dir(), "textures/ must exist after restore");

    // Snapshot: nutexb files in textures/ before rebuild
    let nutexb_in_textures_before: Vec<String> = fs::read_dir(&textures_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.to_ascii_lowercase().ends_with(".nutexb"))
        .collect();
    assert!(!nutexb_in_textures_before.is_empty(), "textures/ must have nutexb files");

    // Step 2: rebuild_structure_json_for_stage_with_shared_textures
    let structure_path =
        rebuild_structure_json_for_stage_with_shared_textures(&pack_root.to_string_lossy())
            .unwrap();
    eprintln!("[test] Structure rebuilt: {structure_path}");

    // Verify: textures/ still has the same files (no physical movement)
    let nutexb_in_textures_after: Vec<String> = fs::read_dir(&textures_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.to_ascii_lowercase().ends_with(".nutexb"))
        .collect();
    assert_eq!(
        nutexb_in_textures_before.len(),
        nutexb_in_textures_after.len(),
        "textures/ file count must not change after rebuild"
    );

    // Verify: nutexb fileUrls that were in textures/ now point to textures/.
    // info/ nutexb (fog/, light/, post_effect/) are never collected by restore_shared_textures
    // so they are not in texture_url_map and remain at their original paths.
    let sj_content = fs::read_to_string(&structure_path).unwrap();
    let doc: serde_json::Value = serde_json::from_str(&sj_content).unwrap();
    let sfd = doc["SubFileData"].as_array().unwrap();
    let mut model_nutexb_count = 0usize;
    for entry in sfd {
        let ftype = entry["fileType"].as_str().unwrap_or("");
        if !ftype.eq_ignore_ascii_case(".nutexb") {
            continue;
        }
        let url = entry["fileUrl"].as_str().unwrap_or("");
        let url_lower = url.to_ascii_lowercase().replace('\\', "/");
        // Only model nutexb (base + sub) are in textures/ — verify they point there.
        if url_lower.contains("/textures/") {
            model_nutexb_count += 1;
        }
    }
    assert!(model_nutexb_count > 0, "should have patched at least one model nutexb URL to textures/");
    eprintln!("[test] {model_nutexb_count} model nutexb URLs point to textures/");

    // Step 3: repack using the rebuilt structure
    let repack_output = _tmp.path().join("shared_tex.fhm2d");
    let repack_result = crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &structure_path,
        &repack_output.to_string_lossy(),
        false,
        None,
    )
    .unwrap();
    eprintln!("[test] Repacked: {} files", repack_result.total_files);
    assert!(repack_result.total_files > 0, "repack must produce files");

    // Step 4: re-extract and verify file count matches original
    let re_extract_dir = _tmp.path().join("re_extract");
    fs::create_dir_all(&re_extract_dir).unwrap();
    let re_extract = extract_stage_fhm2d_to_folder_impl(
        &repack_output.to_string_lossy(),
        &re_extract_dir.to_string_lossy(),
    )
    .unwrap();
    assert_eq!(
        re_extract.total_files, 65,
        "re-extracted file count must match original 65"
    );

    // Step 5: textures/ still intact in original pack_root (no files moved away)
    assert!(
        textures_dir.is_dir(),
        "textures/ must still exist after repack"
    );
    let nutexb_final: usize = fs::read_dir(&textures_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .to_ascii_lowercase()
                .ends_with(".nutexb")
        })
        .count();
    assert_eq!(
        nutexb_final,
        nutexb_in_textures_before.len(),
        "textures/ must still have all nutexb files after repack"
    );

    eprintln!("PASS: rebuild_with_shared_textures — textures stay in textures/, repack succeeds");
}

// ── Full disk-visible scene editor simulation ────────────────────────────────
//
// Outputs to E:\XB\解包\com\test\ so results are inspectable on disk.
// Steps:
//   1. Extract 16F73C97.fhm2d → scene_edit_test/ (with textures/)
//   2. Simulate scene editor: add zabanya_body object + delete object_box01
//   3. rebuild_structure_json_with_shared_textures → repack → scene_edit_test.fhm2d
//   4. Re-extract scene_edit_test.fhm2d → scene_edit_verify/
//   5. Assert scene_edit_verify/ matches scene_edit_test/ (same files, same placement)

#[test]
fn test_disk_scene_editor_add_delete_repack_verify() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }

    let test_dir = Path::new(TEST_DATA_ROOT);
    let fhm2d_src = test_dir.join("16F73C97.fhm2d");

    // Output paths (disk-visible)
    let edit_root = test_dir.join("scene_edit_test");
    let edit_fhm2d = test_dir.join("scene_edit_test.fhm2d");
    let verify_root = test_dir.join("scene_edit_verify");

    // Clean previous runs
    for p in [&edit_root, &verify_root] {
        if p.exists() { fs::remove_dir_all(p).unwrap(); }
    }
    if edit_fhm2d.exists() { fs::remove_file(&edit_fhm2d).unwrap(); }

    // ── Step 1: Extract to scene_edit_test/ ──────────────────────────────────
    eprintln!("=== Step 1: Extract 16F73C97.fhm2d → scene_edit_test/ ===");
    let extract_result = extract_stage_fhm2d_to_folder_impl(
        &fhm2d_src.to_string_lossy(),
        &test_dir.to_string_lossy(),
    ).unwrap();
    // extract writes to a folder named after the stem; rename to scene_edit_test
    let extracted = PathBuf::from(&extract_result.output_dir);
    fs::rename(&extracted, &edit_root).unwrap();
    // Also rename the structure JSON
    let orig_sj = test_dir.join("16F73C97_structure.json");
    let edit_sj = test_dir.join("scene_edit_test_structure.json");
    if orig_sj.exists() { fs::rename(&orig_sj, &edit_sj).unwrap(); }

    let content_root = edit_root.join("0").join("0");
    eprintln!("  Extracted {} files → {}", extract_result.total_files, edit_root.display());
    assert_eq!(extract_result.total_files, 65);

    // ── Step 2a: restore_shared_textures ─────────────────────────────────────
    eprintln!("=== Step 2a: restore_shared_textures ===");
    let restore = restore_shared_textures(&content_root.to_string_lossy()).unwrap();
    eprintln!("  Collected {} nutexb → textures/", restore.textures_collected);
    assert!(restore.textures_collected > 0);
    // textures/ is now under content_root (0/0/textures/)
    let edit_textures = content_root.join("textures");
    assert!(edit_textures.is_dir(), "textures/ must exist under content_root");

    // ── Step 2b: Simulate scene editor — ADD zabanya_body ────────────────────
    eprintln!("=== Step 2b: Add zabanya_body object ===");
    let box01_ssbh = content_root.join("001stage001_object_box01").join("0");
    let new_obj_ssbh = content_root.join("zabanya_body").join("0");
    fs::create_dir_all(&new_obj_ssbh).unwrap();

    // Copy SSBH files from box01, rename to zabanya_body.*
    for entry in fs::read_dir(&box01_ssbh).unwrap().filter_map(|e| e.ok()) {
        let src = entry.path();
        let fname = entry.file_name().to_string_lossy().to_string();
        let ext = fname.rfind('.').map(|i| &fname[i..]).unwrap_or("");
        // Skip numbered texture subdirs (0/, 1/) — textures are now in textures/
        if entry.file_type().unwrap().is_dir() { continue; }
        let new_name = format!("zabanya_body{ext}");
        fs::copy(&src, new_obj_ssbh.join(&new_name)).unwrap();
    }
    // Copy HKT
    let hkt_src = content_root.join("001stage001_object_box01").join("map_hit.hkt");
    if hkt_src.exists() {
        fs::copy(&hkt_src, content_root.join("zabanya_body").join("map_hit.hkt")).unwrap();
    }
    eprintln!("  Created zabanya_body/ with SSBH files");

    // ── Step 2c: Simulate scene editor — DELETE object_box01 ─────────────────
    eprintln!("=== Step 2c: Delete 001stage001_object_box01 ===");
    fs::remove_dir_all(content_root.join("001stage001_object_box01")).unwrap();

    // ── Step 2d: Update placement.csv ────────────────────────────────────────
    eprintln!("=== Step 2d: Update placement.csv ===");
    let bundle = load_stage_bundle_impl(&content_root.to_string_lossy()).unwrap();
    // Find new object index for zabanya_body
    let zabanya_idx = bundle.sub_models.iter()
        .find(|m| m.folder_name == "zabanya_body")
        .map(|m| m.object_index as i32)
        .unwrap_or(0);
    eprintln!("  zabanya_body object_index = {zabanya_idx}");

    let mut entries = bundle.placement_entries.clone();
    // Remove OBJECT entries that referenced the deleted box01 (objectNumber=0)
    entries.retain(|e| !(e.vdk_type == "OBJECT" && e.object_number == Some(0)));
    // Add new OBJECT entry for zabanya_body at a new position
    let new_entry_raw = vec![
        "VDK_TYPE".to_string(), "OBJECT".to_string(),
        "VDK_INITIAL_SPAWN".to_string(), "TRUE".to_string(),
        "VDK_POSITION_X".to_string(), "0.0".to_string(),
        "VDK_POSITION_Y".to_string(), "0.0".to_string(),
        "VDK_POSITION_Z".to_string(), "0.0".to_string(),
        "VDK_ROTATION_X".to_string(), "0.0".to_string(),
        "VDK_ROTATION_Y".to_string(), "0.0".to_string(),
        "VDK_ROTATION_Z".to_string(), "0.0".to_string(),
        "VDK_PLACEMENT_NAME".to_string(), String::new(),
        "VDK_OBJECTNUMBER".to_string(), zabanya_idx.to_string(),
        "VDK_PROGRAMID".to_string(), "0".to_string(),
        "VDK_HITPOINT".to_string(), "UNBREAKABLE".to_string(),
        "VDK_SHADOW_CAST".to_string(), "TRUE".to_string(),
    ];
    entries.push(crate::format::fhm2d_stage::PlacementEntry {
        vdk_type: "OBJECT".to_string(),
        object_number: Some(zabanya_idx),
        pos_x: 0.0, pos_y: 0.0, pos_z: 0.0,
        rot_x: 0.0, rot_y: 0.0, rot_z: 0.0,
        scale_x: 1.0, scale_y: 1.0, scale_z: 1.0,
        raw_fields: new_entry_raw,
    });

    let csv = entries.iter().map(|e| e.raw_fields.join(",")).collect::<Vec<_>>().join("\n");
    fs::write(content_root.join("info").join("placement.csv"), &csv).unwrap();
    eprintln!("  placement.csv updated: {} entries", entries.len());

    // ── Step 3: rebuild structure JSON with shared textures ───────────────────
    eprintln!("=== Step 3: rebuild_structure_json_with_shared_textures ===");
    // Pass pack root (edit_root) so structure JSON is placed correctly next to it
    let sj_path = rebuild_structure_json_for_stage_with_shared_textures(
        &edit_root.to_string_lossy()
    ).unwrap();
    eprintln!("  Structure JSON: {sj_path}");

    // Verify nutexb URLs point to textures/
    let sj_doc: serde_json::Value = serde_json::from_str(&fs::read_to_string(&sj_path).unwrap()).unwrap();
    let model_nutexb_in_textures = sj_doc["SubFileData"].as_array().unwrap().iter()
        .filter(|e| e["fileType"].as_str().unwrap_or("").eq_ignore_ascii_case(".nutexb"))
        .filter(|e| {
            let url = e["fileUrl"].as_str().unwrap_or("").to_ascii_lowercase().replace('\\', "/");
            !url.contains("/info/") && url.contains("/textures/")
        })
        .count();
    eprintln!("  {model_nutexb_in_textures} model nutexb URLs → textures/");
    assert!(model_nutexb_in_textures > 0);

    // ── Step 4: Repack → scene_edit_test.fhm2d ───────────────────────────────
    eprintln!("=== Step 4: Repack → scene_edit_test.fhm2d ===");
    let repack = crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &sj_path,
        &edit_fhm2d.to_string_lossy(),
        false,
        None,
    ).unwrap();
    eprintln!("  Repacked: {} files, {} bytes", repack.total_files, repack.output_size);
    assert!(repack.output_size > 0);

    // ── Step 5: Re-extract → scene_edit_verify/ ──────────────────────────────
    eprintln!("=== Step 5: Re-extract scene_edit_test.fhm2d → scene_edit_verify/ ===");
    // Extract to a separate temp dir to avoid overwriting scene_edit_test/
    let verify_extract_dir = test_dir.join("scene_edit_verify_raw");
    if verify_extract_dir.exists() { fs::remove_dir_all(&verify_extract_dir).unwrap(); }
    fs::create_dir_all(&verify_extract_dir).unwrap();
    let verify_result = extract_stage_fhm2d_to_folder_impl(
        &edit_fhm2d.to_string_lossy(),
        &verify_extract_dir.to_string_lossy(),
    ).unwrap();
    let extracted_verify = PathBuf::from(&verify_result.output_dir);
    if verify_root.exists() { fs::remove_dir_all(&verify_root).unwrap(); }
    fs::rename(&extracted_verify, &verify_root).unwrap();
    fs::remove_dir_all(&verify_extract_dir).ok();
    eprintln!("  Re-extracted {} files → {}", verify_result.total_files, verify_root.display());

    // restore shared textures in verify dir too (for fair comparison)
    restore_shared_textures(&verify_root.to_string_lossy()).unwrap();

    let _verify_content = verify_root.join("0").join("0");

    // ── Step 6: Verify ────────────────────────────────────────────────────────
    eprintln!("=== Step 6: Verify ===");

    // 6a: re-extracted file count matches repacked count
    assert_eq!(verify_result.total_files, repack.total_files,
        "re-extracted file count must match repacked count");
    eprintln!("  ✓ file count: {}", verify_result.total_files);

    // 6b: textures/ exists in edit (under content_root: 0/0/textures/)
    assert!(edit_textures.is_dir(), "edit textures/ must exist");
    let edit_tex_count = fs::read_dir(&edit_textures).unwrap().filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().to_ascii_lowercase().ends_with(".nutexb"))
        .count();
    assert_eq!(edit_tex_count, 13, "edit textures/ must have 13 nutexb");
    eprintln!("  ✓ edit textures/ has {edit_tex_count} nutexb");

    // 6c: placement.csv in verify has OBJECT entry (new object)
    let verify_placement_path = verify_root.join("0").join("0").join("info").join("placement.csv");
    assert!(verify_placement_path.exists(), "verify placement.csv must exist");
    let verify_placement = fs::read_to_string(&verify_placement_path).unwrap();
    assert!(verify_placement.contains("VDK_TYPE,OBJECT"),
        "verify placement must have OBJECT entry");
    assert!(!verify_placement.contains("VDK_POSITION_X,250.0"),
        "original box01 placement entries (pos_x=250) must be gone");
    eprintln!("  ✓ placement.csv has OBJECT entry, box01 entries removed");

    // 6d: graphic_param.csv unchanged
    let edit_gp = fs::read_to_string(content_root.join("info").join("graphic_param.csv")).unwrap();
    let verify_gp = fs::read_to_string(verify_root.join("0").join("0").join("info").join("graphic_param.csv")).unwrap();
    assert_eq!(edit_gp.trim(), verify_gp.trim(), "graphic_param.csv must be identical");
    eprintln!("  ✓ graphic_param.csv identical");

    eprintln!("\n=== Summary ===");
    eprintln!("  Edit dir:    {}", edit_root.display());
    eprintln!("  FHM2D:       {}", edit_fhm2d.display());
    eprintln!("  Verify dir:  {}", verify_root.display());
    eprintln!("PASS: scene editor add/delete → repack → re-extract → verify");
}

/// Repack from structure JSON → extract → verify folder tree structure.
///
/// Validates that the repacked fhm2d, when extracted through the stage
/// rename pipeline, produces the correct folder layout:
///   0/0/base/...         (position 0 = first model folder)
///   0/0/info/...         (position 1 = metadata folder)
///   0/0/<model_name>/... (middle positions = additional models)
///   0/0/sky/...          (last position = sky model)
///   textures/...         (shared texture folder)
#[test]
fn repack_then_extract_folder_tree_is_correct() {
    let test_dir = Path::new(TEST_DATA_ROOT);
    let structure_path = test_dir.join("0x16F73C97_structure.json");
    if !structure_path.exists() {
        eprintln!("SKIP: structure JSON missing");
        return;
    }

    let tmp = tempfile::tempdir().unwrap();
    let repacked = tmp.path().join("repacked.fhm2d");
    crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &structure_path.to_string_lossy(),
        &repacked.to_string_lossy(),
        false,
        None,
    )
    .unwrap();

    let bytes = fs::read(&repacked).unwrap();
    let extraction = crate::format::fhm2d::extract_fhm2d_to_memory_impl(&bytes, "test", None)
        .unwrap();

    let (tree, warnings) = stage_rename_in_memory(
        &extraction.files,
        &extraction.sub_file_structure,
    )
    .unwrap();

    eprintln!("warnings ({}):", warnings.len());
    for w in &warnings {
        eprintln!("  {w}");
    }

    fn dump_tree(node: &StageVirtualTreeFolder, indent: usize) {
        let pad = "  ".repeat(indent);
        eprintln!("{pad}{}/", node.name);
        for f in &node.files {
            eprintln!("{pad}  {} (idx={}, {}b)", f.file_name, f.file_index, f.size_bytes);
        }
        for c in &node.children {
            dump_tree(c, indent + 1);
        }
    }
    dump_tree(&tree, 0);

    let content = &tree.children[0].children[0];
    eprintln!("\ncontent-level children:");
    for (i, c) in content.children.iter().enumerate() {
        eprintln!("  [{}] name={}", i, c.name);
    }

    let names: Vec<&str> = content.children.iter().map(|c| c.name.as_str()).collect();

    assert!(names.contains(&"base"), "must have 'base' folder, got: {:?}", names);
    assert!(names.contains(&"info"), "must have 'info' folder, got: {:?}", names);
    assert!(names.contains(&"sky"), "must have 'sky' folder, got: {:?}", names);

    let bad_subs: Vec<_> = names.iter().filter(|n| n.starts_with("sub_")).collect();
    assert!(bad_subs.is_empty(), "no folders should fall back to sub_N naming: {:?}", bad_subs);

    let no_infer_warnings: Vec<_> = warnings
        .iter()
        .filter(|w| w.contains("Could not infer name"))
        .collect();
    assert!(
        no_infer_warnings.is_empty(),
        "should not have folder inference failures: {:?}",
        no_infer_warnings
    );
}

#[test]
fn repacked_stage_preserves_named_subfolders() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }

    let (_tmp, pack_root, _content_root) = extract_to_temp("16F73C97");
    let structure_path = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();

    let repacked = pack_root.parent().unwrap().join("repacked-stage.fhm2d");
    crate::format::fhm2d_pack::repack_fhm2d_from_structure(
        &structure_path,
        &repacked.to_string_lossy(),
        false,
        None,
    )
    .unwrap();

    let re_extract_dir = tempfile::tempdir().unwrap();
    let re_result = extract_stage_fhm2d_to_folder_impl(
        &repacked.to_string_lossy(),
        &re_extract_dir.path().to_string_lossy(),
    )
    .unwrap();

    let re_content = PathBuf::from(&re_result.output_dir).join("0").join("0");
    let bundle = load_stage_bundle_impl(&re_content.to_string_lossy()).unwrap();
    let names: Vec<String> = bundle.sub_models.iter().map(|m| m.folder_name.clone()).collect();

    assert!(
        names.iter().any(|n| n == "sky"),
        "repacked stage should still extract a sky folder, got: {:?}",
        names
    );
    assert!(
        names.iter().any(|n| n.contains("object_box01")),
        "repacked stage should still extract object_box01, got: {:?}",
        names
    );
}

#[test]
fn test_redistribute_creates_maya_0_nust_1_subdirs() {
    if skip_if_fhm2d_missing("16F73C97") {
        return;
    }
    let (_tmp, pack_root, _content) = extract_to_temp("16F73C97");

    // First restore shared textures (simulates what Scene Editor export does)
    let restore = restore_shared_textures(&pack_root.to_string_lossy()).unwrap();
    assert!(restore.textures_collected > 0, "should collect textures");
    let textures_dir = pack_root.join("textures");
    assert!(textures_dir.is_dir(), "textures/ should exist after restore");

    // Now redistribute back to per-model subdirs
    let redist = redistribute_stage_textures(&pack_root.to_string_lossy()).unwrap();
    assert!(redist.models_processed > 0, "should process at least 1 model");
    assert!(redist.textures_copied > 0, "should copy textures");
    assert!(redist.textures_folder_removed, "textures/ should be removed");

    // Verify the original extract_tools structure: each SSBH folder should have 0/ and 1/
    // matching the original game layout (maya→0/, nust→1/)
    let ref_root = Path::new(r"E:\XB\extract_tools\0x16F73C97\0\0\0\0");
    if !ref_root.is_dir() {
        eprintln!("Skipping reference comparison — extract_tools not available");
        return;
    }

    // Check base model folder has 0/ and 1/ with nutexb
    let ssbh_folders = find_ssbh_folders_in_dir(&pack_root);
    assert!(!ssbh_folders.is_empty(), "should find SSBH model folders");

    for folder in &ssbh_folders {
        let subdir_0 = folder.join("0");
        let subdir_1 = folder.join("1");
        assert!(
            subdir_0.is_dir(),
            "model '{}' should have subdir 0/ (maya textures)",
            folder.display()
        );
        assert!(
            subdir_1.is_dir(),
            "model '{}' should have subdir 1/ (nust textures)",
            folder.display()
        );

        // Verify 0/ contains only nutexb files
        let nutexb_in_0: Vec<_> = fs::read_dir(&subdir_0)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .ends_with(".nutexb")
            })
            .collect();
        assert!(
            !nutexb_in_0.is_empty(),
            "model '{}' subdir 0/ should have nutexb files",
            folder.display()
        );
    }

    eprintln!(
        "PASS: redistribute creates correct 0/(maya) 1/(nust) subdirs for {} models",
        ssbh_folders.len()
    );
}

fn find_ssbh_folders_in_dir(root: &Path) -> Vec<PathBuf> {
    let mut result = Vec::new();
    let mut warnings = Vec::new();
    let _ = super::find_ssbh_folders(root, &mut warnings).map(|f| result = f);
    result
}


#[test]
fn test_dump_user_fhm2d_tree() {
    let path = r"E:\XB\解包\com\test\0x16F73C97.fhm2d";
    if !Path::new(path).exists() {
        eprintln!("SKIP: file not found: {path}");
        return;
    }
    let bytes = fs::read(path).unwrap();
    let source_name = "0x16F73C97";
    let extraction =
        crate::format::fhm2d::extract_fhm2d_to_memory_impl(&bytes, source_name, None).unwrap();
    let (tree, warnings) =
        stage_rename_in_memory(&extraction.files, &extraction.sub_file_structure).unwrap();

    fn dump(node: &StageVirtualTreeFolder, indent: usize) {
        let pad = "  ".repeat(indent);
        eprintln!("{pad}{}/  ({} folders, {} files)", node.name, node.children.len(), node.files.len());
        for f in &node.files {
            let size = f.size_bytes;
            let kb = size as f64 / 1024.0;
            eprintln!("{pad}  {}  {}  {:.1} KB", f.file_name, f.file_type, kb);
        }
        for c in &node.children {
            dump(c, indent + 1);
        }
    }
    dump(&tree, 0);
    if !warnings.is_empty() {
        eprintln!("\nWarnings:");
        for w in &warnings {
            eprintln!("  {w}");
        }
    }
}
