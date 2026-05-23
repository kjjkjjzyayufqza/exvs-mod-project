use app_lib::format::fhm2d_stage::{
    load_stage_bundle_impl, load_stage_skeleton_impl, load_model_in_subfolder_pub, PlacementEntry,
};
use app_lib::nutexb_lib;
use std::collections::HashSet;
use std::path::Path;
use std::time::Instant;

const TEST_DATA_ROOT: &str = r"E:\XB\解包\com\test";

fn stage_path(hash: &str) -> String {
    format!(r"{}\{}\0\0", TEST_DATA_ROOT, hash)
}

fn skip_if_no_test_data() -> bool {
    !Path::new(TEST_DATA_ROOT).is_dir()
}

// ─── Stage 001 (16F73C97) — primary test target ─────────────────────────

#[test]
#[ignore]
fn stage001_loads_successfully() {
    if skip_if_no_test_data() {
        return;
    }
    let path = stage_path("16F73C97");
    let bundle = load_stage_bundle_impl(&path).expect("load_stage_bundle_impl should succeed");
    assert_eq!(bundle.root_path, path);
}

#[test]
#[ignore]
fn stage001_has_base_model() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();
    assert!(
        bundle.base_model.is_some(),
        "Stage 001 must have a base model"
    );
}

#[test]
#[ignore]
fn stage001_has_two_sub_models() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();
    assert_eq!(
        bundle.sub_models.len(),
        2,
        "Stage 001 should have 2 sub models (object + sky)"
    );
    assert_eq!(bundle.sub_models[0].folder_name, "001stage001_object_box01");
    assert_eq!(bundle.sub_models[0].object_index, 0);
    assert_eq!(bundle.sub_models[1].folder_name, "sky");
    assert_eq!(bundle.sub_models[1].object_index, 1);
}

#[test]
#[ignore]
fn stage001_placement_entries() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();

    let sky_entries: Vec<&PlacementEntry> = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "SKY")
        .collect();
    let object_entries: Vec<&PlacementEntry> = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "OBJECT")
        .collect();

    assert_eq!(sky_entries.len(), 1, "Stage 001 should have 1 SKY entry");
    assert_eq!(
        object_entries.len(),
        4,
        "Stage 001 should have 4 OBJECT entries"
    );

    assert_eq!(
        sky_entries[0].object_number,
        Some(1),
        "SKY entry should have objectNumber=1"
    );

    for obj in &object_entries {
        assert_eq!(
            obj.object_number,
            Some(0),
            "All OBJECT entries in Stage 001 should have objectNumber=0"
        );
    }
}

#[test]
#[ignore]
fn stage001_placement_positions() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();

    let first_object = bundle
        .placement_entries
        .iter()
        .find(|e| e.vdk_type == "OBJECT")
        .expect("Should have at least one OBJECT");

    assert!((first_object.pos_x - 250.0).abs() < 0.01);
    assert!((first_object.pos_y - (-2.0)).abs() < 0.01);
    assert!((first_object.pos_z - (-250.0)).abs() < 0.01);
}

#[test]
#[ignore]
fn stage001_kv_format_placement_has_no_header() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();
    assert!(
        bundle.placement_header.is_empty(),
        "KV-pair format placement.csv should have no header row"
    );
}

#[test]
#[ignore]
fn stage001_placement_raw_fields_preserved() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();

    let sky = bundle
        .placement_entries
        .iter()
        .find(|e| e.vdk_type == "SKY")
        .unwrap();
    assert!(
        sky.raw_fields.len() >= 4,
        "raw_fields should preserve all CSV fields"
    );
    assert!(
        sky.raw_fields.contains(&"VDK_TYPE".to_string()),
        "raw_fields should contain VDK_TYPE key"
    );
    assert!(
        sky.raw_fields.contains(&"SKY".to_string()),
        "raw_fields should contain SKY value"
    );
}

#[test]
#[ignore]
fn stage001_graphic_params() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();

    assert!(
        bundle.graphic_params.len() >= 10,
        "Stage 001 should have many graphic params (found {})",
        bundle.graphic_params.len()
    );

    let rot_x = bundle
        .graphic_params
        .iter()
        .find(|p| p.key == "directional_lighting_rot_x")
        .expect("Should have directional_lighting_rot_x param");
    assert_eq!(rot_x.value, "-45");

    let rot_y = bundle
        .graphic_params
        .iter()
        .find(|p| p.key == "directional_lighting_rot_y")
        .expect("Should have directional_lighting_rot_y param");
    assert_eq!(rot_y.value, "45");
}

#[test]
#[ignore]
fn stage001_no_critical_warnings() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();
    for w in &bundle.warnings {
        assert!(
            !w.contains("Failed to read"),
            "Unexpected critical warning: {w}"
        );
    }
}

// ─── Stage 100 (84F085E5) — simplest (menu stage) ──────────────────────

#[test]
#[ignore]
fn stage100_loads_successfully() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("84F085E5")).unwrap();
    assert!(bundle.base_model.is_some(), "Stage 100 must have base");
    assert_eq!(
        bundle.sub_models.len(),
        2,
        "Stage 100 should have 2 sub models (obj_grid + sky)"
    );
    assert_eq!(bundle.sub_models[0].folder_name, "100menuroot_obj_grid");
    assert_eq!(bundle.sub_models[1].folder_name, "sky");
}

#[test]
#[ignore]
fn stage100_sky_only_placement() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("84F085E5")).unwrap();
    assert_eq!(
        bundle.placement_entries.len(),
        1,
        "Stage 100 should have only 1 placement entry (SKY)"
    );
    assert_eq!(bundle.placement_entries[0].vdk_type, "SKY");
}

// ─── Stage 018 (35516817) — large forest with EFFECT entries ────────────

#[test]
#[ignore]
fn stage018_loads_successfully() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("35516817")).unwrap();
    assert!(bundle.base_model.is_some(), "Stage 018 must have base");
}

#[test]
#[ignore]
fn stage018_has_22_sub_models() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("35516817")).unwrap();
    assert_eq!(
        bundle.sub_models.len(),
        22,
        "Stage 018 should have 22 sub models (21 objects + sky)"
    );
    let sky = bundle.sub_models.iter().find(|sm| sm.folder_name == "sky");
    assert!(sky.is_some(), "sky should be present as a sub model");
}

#[test]
#[ignore]
fn stage018_has_effect_entries() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("35516817")).unwrap();

    let effect_count = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "EFFECT")
        .count();
    let object_count = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "OBJECT")
        .count();
    let sky_count = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "SKY")
        .count();

    assert_eq!(effect_count, 21, "Stage 018 should have 21 EFFECT entries");
    assert_eq!(sky_count, 1, "Stage 018 should have 1 SKY entry");
    assert!(
        object_count > 100,
        "Stage 018 should have many OBJECT entries (found {object_count})"
    );
}

#[test]
#[ignore]
fn stage018_effect_entries_have_positions() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("35516817")).unwrap();

    let effects: Vec<&PlacementEntry> = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "EFFECT")
        .collect();

    for effect in &effects {
        assert!(
            effect.object_number.is_none() || effect.object_number == Some(0),
            "EFFECT entries typically don't have meaningful objectNumber"
        );
    }
}

#[test]
#[ignore]
fn stage018_sub_model_indices_sequential() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("35516817")).unwrap();
    for (i, sm) in bundle.sub_models.iter().enumerate() {
        assert_eq!(
            sm.object_index, i,
            "Sub model {} ({}) should have object_index={}, got {}",
            i, sm.folder_name, i, sm.object_index
        );
    }
}

// ─── Old texture format detection ───────────────────────────────────────

#[test]
#[ignore]
fn stage001_has_old_texture_format() {
    if skip_if_no_test_data() {
        return;
    }
    let root = stage_path("16F73C97");
    let object_dir = Path::new(&root).join("001stage001_object_box01");
    assert!(object_dir.is_dir(), "Object folder should exist");

    let model_subdir = object_dir.join("0");
    assert!(model_subdir.is_dir(), "Model subdir 0/ should exist");

    let tex_variant_0 = model_subdir.join("0");
    let tex_variant_1 = model_subdir.join("1");
    assert!(
        tex_variant_0.is_dir(),
        "Texture variant 0/ should exist (old format)"
    );
    assert!(
        tex_variant_1.is_dir(),
        "Texture variant 1/ should exist (old format)"
    );

    let nutexb_in_0: Vec<_> = std::fs::read_dir(&tex_variant_0)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("nutexb"))
        })
        .collect();
    assert!(
        !nutexb_in_0.is_empty(),
        "Numbered subdir 0/ should contain .nutexb files"
    );
}

#[test]
#[ignore]
fn stage001_no_shared_textures_folder_yet() {
    if skip_if_no_test_data() {
        return;
    }
    let root = stage_path("16F73C97");
    let textures_dir = Path::new(&root).join("textures");
    assert!(
        !textures_dir.exists(),
        "textures/ folder should NOT exist before migration"
    );
}

// ─── Stage 211 (BBC60B47) — large stage, existence check only ───────────

#[test]
#[ignore]
fn stage211_loads_successfully() {
    if skip_if_no_test_data() {
        return;
    }
    let path = format!(r"{}\0xBBC60B47\0\0", TEST_DATA_ROOT);
    if !Path::new(&path).is_dir() {
        return;
    }
    let bundle = load_stage_bundle_impl(&path).expect("Stage 211 should load");
    assert!(bundle.base_model.is_some());
    assert!(
        bundle.sub_models.len() > 5,
        "Stage 211 should have many sub models"
    );
}

// ─── CSV roundtrip verification ─────────────────────────────────────────

#[test]
#[ignore]
fn stage001_graphic_param_csv_roundtrip() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();

    let reconstructed: String = bundle
        .graphic_params
        .iter()
        .map(|p| format!("{},{}", p.key, p.value))
        .collect::<Vec<_>>()
        .join("\n");

    let original =
        std::fs::read_to_string(format!(r"{}\info\graphic_param.csv", stage_path("16F73C97")))
            .unwrap();

    let orig_lines: Vec<&str> = original
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect();
    let recon_lines: Vec<&str> = reconstructed
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect();

    assert_eq!(
        orig_lines.len(),
        recon_lines.len(),
        "Line count should match"
    );
    for (i, (orig, recon)) in orig_lines.iter().zip(recon_lines.iter()).enumerate() {
        assert_eq!(
            orig.trim(),
            recon.trim(),
            "Line {i} should match"
        );
    }
}

#[test]
#[ignore]
fn stage001_placement_csv_roundtrip() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();

    let original =
        std::fs::read_to_string(format!(r"{}\info\placement.csv", stage_path("16F73C97")))
            .unwrap();
    let orig_lines: Vec<&str> = original
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect();

    assert_eq!(
        bundle.placement_entries.len(),
        orig_lines.len(),
        "Should parse all non-empty lines as entries"
    );

    for (i, entry) in bundle.placement_entries.iter().enumerate() {
        let reconstructed = entry.raw_fields.join(",");
        assert_eq!(
            orig_lines[i].trim(),
            reconstructed.trim(),
            "Placement line {i} roundtrip should match"
        );
    }
}

// ─── Texture file inventory in test data ────────────────────────────────

#[test]
#[ignore]
fn stage001_texture_file_count() {
    if skip_if_no_test_data() {
        return;
    }
    let root = stage_path("16F73C97");
    let mut nutexb_count = 0usize;
    count_nutexb_recursive(Path::new(&root), &mut nutexb_count);
    assert!(
        nutexb_count > 20,
        "Stage 001 should have many .nutexb files across model subdirs (found {nutexb_count})"
    );
}

fn count_nutexb_recursive(dir: &Path, count: &mut usize) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                count_nutexb_recursive(&path, count);
            } else if path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("nutexb"))
            {
                *count += 1;
            }
        }
    }
}

// ─── Stage 018 texture format confirmation ──────────────────────────────

#[test]
#[ignore]
fn stage018_all_models_have_old_texture_format() {
    if skip_if_no_test_data() {
        return;
    }
    let root = stage_path("35516817");
    let bundle = load_stage_bundle_impl(&root).unwrap();

    for sm in &bundle.sub_models {
        let model_dir = Path::new(&root).join(&sm.folder_name);
        let subdir_0 = model_dir.join("0");
        if !subdir_0.is_dir() {
            continue;
        }
        let has_numbered_tex_dir = std::fs::read_dir(&subdir_0)
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| {
                e.path().is_dir()
                    && e.file_name()
                        .to_string_lossy()
                        .chars()
                        .all(|c| c.is_ascii_digit())
            });
        assert!(
            has_numbered_tex_dir,
            "Model {} should have numbered texture subdirs (old format)",
            sm.folder_name
        );
    }
}

// ─── Bundle field cross-validation ──────────────────────────────────────

#[test]
#[ignore]
fn stage018_placement_object_count_matches_sub_model_references() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("35516817")).unwrap();

    let unique_object_numbers: std::collections::HashSet<i32> = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "OBJECT")
        .filter_map(|e| e.object_number)
        .collect();

    let max_object_index = bundle
        .sub_models
        .iter()
        .map(|sm| sm.object_index)
        .max()
        .unwrap_or(0);

    for obj_num in &unique_object_numbers {
        assert!(
            (*obj_num as usize) <= max_object_index,
            "Object number {} exceeds max sub_model index {}",
            obj_num,
            max_object_index
        );
    }
}

// ─── Test Suite 2: Texture migration readiness ────────────────────────

#[test]
#[ignore]
fn all_stages_have_old_texture_format() {
    if skip_if_no_test_data() {
        return;
    }
    for hash in &["16F73C97", "84F085E5", "35516817"] {
        let root = stage_path(hash);
        let bundle = load_stage_bundle_impl(&root).unwrap();
        let mut found_old = false;
        for sm in &bundle.sub_models {
            let model_dir = Path::new(&root).join(&sm.folder_name);
            let subdir_0 = model_dir.join("0");
            if !subdir_0.is_dir() {
                continue;
            }
            let has_numbered = std::fs::read_dir(&subdir_0)
                .unwrap()
                .filter_map(|e| e.ok())
                .any(|e| {
                    e.path().is_dir()
                        && e.file_name()
                            .to_string_lossy()
                            .chars()
                            .all(|c| c.is_ascii_digit())
                });
            if has_numbered {
                found_old = true;
                break;
            }
        }
        assert!(
            found_old,
            "Stage {hash} should have old texture format (numbered subdirs)"
        );
    }
}

#[test]
#[ignore]
fn no_stage_has_shared_textures_folder() {
    if skip_if_no_test_data() {
        return;
    }
    for hash in &["16F73C97", "84F085E5", "35516817"] {
        let root = stage_path(hash);
        let textures_dir = Path::new(&root).join("textures");
        assert!(
            !textures_dir.exists(),
            "Stage {hash} should not have textures/ folder before migration"
        );
    }
}

// ─── Test Suite 3: Placement edit simulation ──────────────────────────

#[test]
#[ignore]
fn stage001_placement_position_fields_are_numeric() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();
    for entry in &bundle.placement_entries {
        assert!(
            entry.pos_x.is_finite(),
            "pos_x should be finite for {} entry",
            entry.vdk_type
        );
        assert!(
            entry.pos_y.is_finite(),
            "pos_y should be finite for {} entry",
            entry.vdk_type
        );
        assert!(
            entry.pos_z.is_finite(),
            "pos_z should be finite for {} entry",
            entry.vdk_type
        );
    }
}

#[test]
#[ignore]
fn stage001_object_number_maps_to_valid_sub_model() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("16F73C97")).unwrap();
    let valid_indices: HashSet<usize> = bundle
        .sub_models
        .iter()
        .map(|sm| sm.object_index)
        .collect();

    for entry in bundle.placement_entries.iter().filter(|e| e.vdk_type == "OBJECT") {
        let obj_num = entry
            .object_number
            .expect("OBJECT entry must have objectNumber");
        assert!(
            valid_indices.contains(&(obj_num as usize)),
            "OBJECT objectNumber={obj_num} must map to a valid sub_model index"
        );
    }
}

// ─── Test Suite 5: EFFECT entry preservation ──────────────────────────

#[test]
#[ignore]
fn stage018_effect_entries_preserved_after_reload() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("35516817")).unwrap();

    let effects: Vec<&PlacementEntry> = bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "EFFECT")
        .collect();

    assert_eq!(effects.len(), 21, "Must have exactly 21 EFFECT entries");

    for effect in &effects {
        assert!(
            !effect.raw_fields.is_empty(),
            "EFFECT entry raw_fields should not be empty"
        );
        assert!(
            effect.raw_fields.contains(&"VDK_TYPE".to_string()),
            "EFFECT raw_fields must contain VDK_TYPE key"
        );
        assert!(
            effect.raw_fields.contains(&"EFFECT".to_string()),
            "EFFECT raw_fields must contain EFFECT value"
        );
    }
}

#[test]
#[ignore]
fn stage018_effect_entries_have_no_object_number() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("35516817")).unwrap();

    for effect in bundle
        .placement_entries
        .iter()
        .filter(|e| e.vdk_type == "EFFECT")
    {
        let has_obj_num_key = effect.raw_fields.iter().any(|f| f == "VDK_OBJECTNUMBER");
        assert!(
            !has_obj_num_key,
            "EFFECT entries should not have VDK_OBJECTNUMBER field (entry at pos {},{},{})",
            effect.pos_x, effect.pos_y, effect.pos_z
        );
    }
}

#[test]
#[ignore]
fn stage018_placement_csv_roundtrip() {
    if skip_if_no_test_data() {
        return;
    }
    let bundle = load_stage_bundle_impl(&stage_path("35516817")).unwrap();

    let original =
        std::fs::read_to_string(format!(r"{}\info\placement.csv", stage_path("35516817")))
            .unwrap();
    let orig_lines: Vec<&str> = original
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect();

    assert_eq!(
        bundle.placement_entries.len(),
        orig_lines.len(),
        "Should parse all non-empty lines"
    );

    for (i, entry) in bundle.placement_entries.iter().enumerate() {
        let reconstructed = entry.raw_fields.join(",");
        assert_eq!(
            orig_lines[i].trim(),
            reconstructed.trim(),
            "Placement line {i} roundtrip mismatch"
        );
    }
}

// ─── Structure JSON validation ────────────────────────────────────────

#[test]
#[ignore]
fn stage001_structure_json_exists_and_valid() {
    if skip_if_no_test_data() {
        return;
    }
    let structure_path = format!(r"{}\16F73C97_structure.json", TEST_DATA_ROOT);
    assert!(
        Path::new(&structure_path).exists(),
        "Structure JSON should exist"
    );
    let content = std::fs::read_to_string(&structure_path).unwrap();
    let json: serde_json::Value = serde_json::from_str(&content)
        .expect("Structure JSON should be valid JSON");
    assert!(
        json.is_object(),
        "Structure JSON root should be an object"
    );
}

#[test]
#[ignore]
fn stage018_structure_json_exists_and_valid() {
    if skip_if_no_test_data() {
        return;
    }
    let structure_path = format!(r"{}\35516817_structure.json", TEST_DATA_ROOT);
    assert!(
        Path::new(&structure_path).exists(),
        "Structure JSON should exist for stage 018"
    );
    let content = std::fs::read_to_string(&structure_path).unwrap();
    let json: serde_json::Value = serde_json::from_str(&content)
        .expect("Structure JSON should be valid JSON");
    assert!(json.is_object());
}

// ─── FHM2D packed file verification ───────────────────────────────────

#[test]
#[ignore]
fn stage001_fhm2d_file_exists() {
    if skip_if_no_test_data() {
        return;
    }
    let fhm2d_path = format!(r"{}\16F73C97.fhm2d", TEST_DATA_ROOT);
    let path = Path::new(&fhm2d_path);
    assert!(path.exists(), "Stage 001 .fhm2d should exist");
    let meta = std::fs::metadata(path).unwrap();
    assert!(
        meta.len() > 1_000_000,
        "Stage 001 .fhm2d should be >1MB (got {} bytes)",
        meta.len()
    );
}

#[test]
#[ignore]
fn stage018_fhm2d_file_exists() {
    if skip_if_no_test_data() {
        return;
    }
    let fhm2d_path = format!(r"{}\35516817.fhm2d", TEST_DATA_ROOT);
    let path = Path::new(&fhm2d_path);
    assert!(path.exists(), "Stage 018 .fhm2d should exist");
    let meta = std::fs::metadata(path).unwrap();
    assert!(
        meta.len() > 100_000_000,
        "Stage 018 .fhm2d should be >100MB (got {} bytes)",
        meta.len()
    );
}

// ─── Multiple stage cross-validation ──────────────────────────────────

#[test]
#[ignore]
fn all_stages_have_base_model() {
    if skip_if_no_test_data() {
        return;
    }
    for hash in &["16F73C97", "84F085E5", "35516817"] {
        let bundle = load_stage_bundle_impl(&stage_path(hash)).unwrap();
        assert!(
            bundle.base_model.is_some(),
            "Stage {hash} must have a base model"
        );
    }
}

#[test]
#[ignore]
fn all_stages_have_sky_sub_model() {
    if skip_if_no_test_data() {
        return;
    }
    for hash in &["16F73C97", "84F085E5", "35516817"] {
        let bundle = load_stage_bundle_impl(&stage_path(hash)).unwrap();
        let has_sky = bundle.sub_models.iter().any(|sm| sm.folder_name == "sky");
        assert!(has_sky, "Stage {hash} must have a sky sub model");
    }
}

#[test]
#[ignore]
fn all_stages_have_graphic_params() {
    if skip_if_no_test_data() {
        return;
    }
    for hash in &["16F73C97", "84F085E5", "35516817"] {
        let bundle = load_stage_bundle_impl(&stage_path(hash)).unwrap();
        assert!(
            !bundle.graphic_params.is_empty(),
            "Stage {hash} should have graphic params"
        );
    }
}

#[test]
#[ignore]
fn all_stages_have_placement_entries() {
    if skip_if_no_test_data() {
        return;
    }
    for hash in &["16F73C97", "84F085E5", "35516817"] {
        let bundle = load_stage_bundle_impl(&stage_path(hash)).unwrap();
        assert!(
            !bundle.placement_entries.is_empty(),
            "Stage {hash} should have placement entries"
        );
        let has_sky = bundle
            .placement_entries
            .iter()
            .any(|e| e.vdk_type == "SKY");
        assert!(has_sky, "Stage {hash} should have at least one SKY entry");
    }
}

// ─── Performance Benchmark: Progressive Hydration vs Monolithic ────────

fn run_benchmark(hash: &str, label: &str) {
    let path = stage_path(hash);
    if !Path::new(&path).is_dir() {
        eprintln!("[BENCH] {label}: SKIPPED (path not found: {path})");
        return;
    }

    eprintln!("\n{}", "=".repeat(70));
    eprintln!("[BENCH] {label} — {path}");
    eprintln!("{}", "=".repeat(70));

    // --- Monolithic: load_stage_bundle_impl ---
    let t0 = Instant::now();
    let bundle = load_stage_bundle_impl(&path).expect("monolithic load failed");
    let monolithic_ms = t0.elapsed().as_millis();
    let model_count = bundle.sub_models.len() + if bundle.base_model.is_some() { 1 } else { 0 };
    eprintln!(
        "[BENCH] MONOLITHIC  load_stage_bundle_impl: {monolithic_ms}ms  ({model_count} models, {} placements, {} graphic_params)",
        bundle.placement_entries.len(),
        bundle.graphic_params.len(),
    );

    // --- Phase 1: load_stage_skeleton_impl ---
    let t1 = Instant::now();
    let skeleton = load_stage_skeleton_impl(&path).expect("skeleton load failed");
    let skeleton_ms = t1.elapsed().as_millis();
    eprintln!(
        "[BENCH] SKELETON    load_stage_skeleton_impl: {skeleton_ms}ms  ({} manifest entries, has_base={}, {} placements)",
        skeleton.sub_model_manifest.len(),
        skeleton.has_base_model,
        skeleton.placement_entries.len(),
    );

    // --- Phase 2: Sequential model loading (simulating stream) ---
    let t2 = Instant::now();
    let root = Path::new(&path);
    let mut stream_loaded = 0usize;
    let mut per_model_times: Vec<(String, u128)> = Vec::new();

    if skeleton.has_base_model {
        let tm = Instant::now();
        let mut warnings = Vec::new();
        let base = load_model_in_subfolder_pub(root, "base", &mut warnings);
        let base_ms = tm.elapsed().as_millis();
        if base.is_some() {
            stream_loaded += 1;
        }
        per_model_times.push(("base".to_string(), base_ms));
    }

    for entry in &skeleton.sub_model_manifest {
        let tm = Instant::now();
        let mut warnings = Vec::new();
        let _model = load_model_in_subfolder_pub(root, &entry.folder_name, &mut warnings);
        let model_ms = tm.elapsed().as_millis();
        if _model.is_some() {
            stream_loaded += 1;
        }
        per_model_times.push((entry.folder_name.clone(), model_ms));
    }

    let stream_total_ms = t2.elapsed().as_millis();
    let progressive_total_ms = skeleton_ms + stream_total_ms;

    eprintln!(
        "[BENCH] STREAM      models sequential: {stream_total_ms}ms  ({stream_loaded} loaded)"
    );
    eprintln!(
        "[BENCH] PROGRESSIVE total (skeleton + stream): {progressive_total_ms}ms"
    );

    // --- Summary ---
    eprintln!("\n[BENCH] ─── SUMMARY ───");
    eprintln!("[BENCH]   Monolithic (old):   {monolithic_ms}ms");
    eprintln!("[BENCH]   Skeleton (new P1):  {skeleton_ms}ms  ← time-to-first-UI");
    eprintln!("[BENCH]   Stream (new P2):    {stream_total_ms}ms");
    eprintln!("[BENCH]   Progressive total:  {progressive_total_ms}ms");
    let speedup = if progressive_total_ms > 0 {
        monolithic_ms as f64 / progressive_total_ms as f64
    } else {
        f64::INFINITY
    };
    let first_ui_speedup = if skeleton_ms > 0 {
        monolithic_ms as f64 / skeleton_ms as f64
    } else {
        f64::INFINITY
    };
    eprintln!("[BENCH]   First-UI speedup:   {first_ui_speedup:.1}x faster");
    eprintln!("[BENCH]   Total speedup:      {speedup:.2}x");

    if per_model_times.len() <= 30 {
        eprintln!("\n[BENCH] ─── Per-model breakdown ───");
        for (name, ms) in &per_model_times {
            eprintln!("[BENCH]   {name}: {ms}ms");
        }
    } else {
        eprintln!("\n[BENCH] ─── Top 10 slowest models ───");
        let mut sorted = per_model_times.clone();
        sorted.sort_by(|a, b| b.1.cmp(&a.1));
        for (name, ms) in sorted.iter().take(10) {
            eprintln!("[BENCH]   {name}: {ms}ms");
        }
    }

    eprintln!();

    // Verify data consistency
    assert_eq!(
        skeleton.placement_entries.len(),
        bundle.placement_entries.len(),
        "Skeleton and bundle should produce same placement count"
    );
    assert_eq!(
        skeleton.graphic_params.len(),
        bundle.graphic_params.len(),
        "Skeleton and bundle should produce same graphic_param count"
    );
    assert_eq!(
        skeleton.sub_model_manifest.len(),
        bundle.sub_models.len(),
        "Skeleton manifest and bundle sub_models should have same count"
    );
}

#[test]
#[ignore]
fn bench_stage001_progressive_vs_monolithic() {
    if skip_if_no_test_data() {
        return;
    }
    run_benchmark("16F73C97", "Stage 001 (small)");
}

#[test]
#[ignore]
fn bench_stage100_progressive_vs_monolithic() {
    if skip_if_no_test_data() {
        return;
    }
    run_benchmark("84F085E5", "Stage 100 (menu)");
}

#[test]
#[ignore]
fn bench_stage018_progressive_vs_monolithic() {
    if skip_if_no_test_data() {
        return;
    }
    run_benchmark("35516817", "Stage 018 (large forest, 22 sub-models)");
}

#[test]
#[ignore]
fn bench_stage211_progressive_vs_monolithic() {
    if skip_if_no_test_data() {
        return;
    }
    let path = format!(r"{}\0xBBC60B47\0\0", TEST_DATA_ROOT);
    if !Path::new(&path).is_dir() {
        eprintln!("[BENCH] Stage 211: SKIPPED (path not found)");
        return;
    }
    run_benchmark_path(&path, "Stage 211 (large)");
}

fn run_benchmark_path(path: &str, label: &str) {
    if !Path::new(path).is_dir() {
        eprintln!("[BENCH] {label}: SKIPPED (path not found: {path})");
        return;
    }

    eprintln!("\n======================================================================");
    eprintln!("[BENCH] {label} — {path}");
    eprintln!("======================================================================");

    let t0 = Instant::now();
    let bundle = load_stage_bundle_impl(path).expect("monolithic load failed");
    let monolithic_ms = t0.elapsed().as_millis();
    let model_count = bundle.sub_models.len() + if bundle.base_model.is_some() { 1 } else { 0 };
    eprintln!(
        "[BENCH] MONOLITHIC  load_stage_bundle_impl: {monolithic_ms}ms  ({model_count} models)",
    );

    let t1 = Instant::now();
    let skeleton = load_stage_skeleton_impl(path).expect("skeleton load failed");
    let skeleton_ms = t1.elapsed().as_millis();
    eprintln!(
        "[BENCH] SKELETON    load_stage_skeleton_impl: {skeleton_ms}ms",
    );

    let t2 = Instant::now();
    let root = Path::new(path);
    let mut stream_loaded = 0usize;
    if skeleton.has_base_model {
        let mut w = Vec::new();
        if load_model_in_subfolder_pub(root, "base", &mut w).is_some() {
            stream_loaded += 1;
        }
    }
    for entry in &skeleton.sub_model_manifest {
        let mut w = Vec::new();
        if load_model_in_subfolder_pub(root, &entry.folder_name, &mut w).is_some() {
            stream_loaded += 1;
        }
    }
    let stream_total_ms = t2.elapsed().as_millis();
    let progressive_total_ms = skeleton_ms + stream_total_ms;

    eprintln!("[BENCH] STREAM      models: {stream_total_ms}ms  ({stream_loaded} loaded)");
    eprintln!("[BENCH] ─── SUMMARY ───");
    eprintln!("[BENCH]   Monolithic:  {monolithic_ms}ms");
    eprintln!("[BENCH]   Skeleton:    {skeleton_ms}ms  ← time-to-first-UI");
    eprintln!("[BENCH]   Progressive: {progressive_total_ms}ms");
    let first_ui_speedup = if skeleton_ms > 0 {
        monolithic_ms as f64 / skeleton_ms as f64
    } else {
        f64::INFINITY
    };
    eprintln!("[BENCH]   First-UI speedup: {first_ui_speedup:.1}x faster");
    eprintln!();
}

// ─── Detailed Multi-Iteration Benchmark ──────────────────────────────

#[test]
#[ignore]
fn bench_stage211_detailed() {
    let path = r"E:\XB\解包\com\test\0xBBC60B47\0\0";
    if !Path::new(path).is_dir() {
        eprintln!("[BENCH] SKIPPED — path not found: {path}");
        return;
    }

    const ROUNDS: usize = 5;
    let root = Path::new(path);

    eprintln!("\n{}", "=".repeat(76));
    eprintln!("[BENCH]  Stage 211 (0xBBC60B47) — {ROUNDS}-round detailed benchmark");
    eprintln!("[BENCH]  Path: {path}");
    eprintln!("{}", "=".repeat(76));

    // ── Warmup (1 round, discarded) ──
    eprintln!("\n[BENCH] Warmup round...");
    let _ = load_stage_bundle_impl(path);
    let _ = load_stage_skeleton_impl(path);

    // ── Collect timings ──
    let mut monolithic_times = Vec::with_capacity(ROUNDS);
    let mut skeleton_times = Vec::with_capacity(ROUNDS);
    let mut stream_times = Vec::with_capacity(ROUNDS);
    let mut first_model_times = Vec::with_capacity(ROUNDS);
    let mut per_model_all: Vec<Vec<(String, u128)>> = Vec::with_capacity(ROUNDS);

    let mut monolithic_json_size: usize = 0;
    let mut skeleton_json_size: usize = 0;
    let mut per_model_json_sizes: Vec<(String, usize)> = Vec::new();

    for round in 0..ROUNDS {
        eprintln!("\n[BENCH] ── Round {}/{ROUNDS} ──", round + 1);

        // Monolithic
        let t = Instant::now();
        let bundle = load_stage_bundle_impl(path).expect("monolithic failed");
        let ms = t.elapsed().as_millis();
        monolithic_times.push(ms);
        eprintln!("[BENCH]   monolithic: {ms}ms");

        if round == 0 {
            monolithic_json_size = serde_json::to_vec(&bundle)
                .map(|v| v.len())
                .unwrap_or(0);
        }
        drop(bundle);

        // Skeleton
        let t = Instant::now();
        let skeleton = load_stage_skeleton_impl(path).expect("skeleton failed");
        let ms = t.elapsed().as_millis();
        skeleton_times.push(ms);
        eprintln!("[BENCH]   skeleton: {ms}ms");

        if round == 0 {
            skeleton_json_size = serde_json::to_vec(&skeleton)
                .map(|v| v.len())
                .unwrap_or(0);
        }

        // Stream (sequential, simulating Channel delivery)
        let t_stream = Instant::now();
        let mut per_model: Vec<(String, u128)> = Vec::new();
        let mut first_model_ms: Option<u128> = None;

        if skeleton.has_base_model {
            let t = Instant::now();
            let mut w = Vec::new();
            let result = load_model_in_subfolder_pub(root, "base", &mut w);
            let ms = t.elapsed().as_millis();
            per_model.push(("base".to_string(), ms));
            if first_model_ms.is_none() {
                first_model_ms = Some(t_stream.elapsed().as_millis());
            }
            if round == 0 {
                if let Some(ref b) = result {
                    let sz = serde_json::to_vec(b).map(|v| v.len()).unwrap_or(0);
                    per_model_json_sizes.push(("base".to_string(), sz));
                }
            }
        }

        for entry in &skeleton.sub_model_manifest {
            let t = Instant::now();
            let mut w = Vec::new();
            let result = load_model_in_subfolder_pub(root, &entry.folder_name, &mut w);
            let ms = t.elapsed().as_millis();
            per_model.push((entry.folder_name.clone(), ms));
            if first_model_ms.is_none() {
                first_model_ms = Some(t_stream.elapsed().as_millis());
            }
            if round == 0 {
                if let Some(ref b) = result {
                    let sz = serde_json::to_vec(b).map(|v| v.len()).unwrap_or(0);
                    per_model_json_sizes.push((entry.folder_name.clone(), sz));
                }
            }
        }

        let stream_ms = t_stream.elapsed().as_millis();
        stream_times.push(stream_ms);
        first_model_times.push(first_model_ms.unwrap_or(0));
        per_model_all.push(per_model);
        eprintln!("[BENCH]   stream: {stream_ms}ms  (first model at {}ms)", first_model_ms.unwrap_or(0));
    }

    // ── Statistics ──
    fn median(v: &mut Vec<u128>) -> u128 {
        v.sort();
        v[v.len() / 2]
    }
    fn mean(v: &[u128]) -> f64 {
        v.iter().sum::<u128>() as f64 / v.len() as f64
    }

    let mono_median = median(&mut monolithic_times.clone());
    let skel_median = median(&mut skeleton_times.clone());
    let stream_median = median(&mut stream_times.clone());
    let first_model_median = median(&mut first_model_times.clone());

    eprintln!("\n{}", "=".repeat(76));
    eprintln!("[BENCH]  RESULTS (median of {ROUNDS} rounds, 1 warmup discarded)");
    eprintln!("{}", "=".repeat(76));

    eprintln!("\n[BENCH]  ┌─────────────────────────┬──────────┬──────────┬──────────┐");
    eprintln!("[BENCH]  │ Phase                   │ Median   │ Mean     │ All runs │");
    eprintln!("[BENCH]  ├─────────────────────────┼──────────┼──────────┼──────────┤");
    eprintln!(
        "[BENCH]  │ OLD: Monolithic          │ {:>5}ms  │ {:>5.0}ms  │ {:?} │",
        mono_median, mean(&monolithic_times), monolithic_times
    );
    eprintln!(
        "[BENCH]  │ NEW: Skeleton (P1)       │ {:>5}ms  │ {:>5.1}ms  │ {:?} │",
        skel_median, mean(&skeleton_times), skeleton_times
    );
    eprintln!(
        "[BENCH]  │ NEW: First model visible │ {:>5}ms  │ {:>5.0}ms  │ {:?} │",
        first_model_median, mean(&first_model_times), first_model_times
    );
    eprintln!(
        "[BENCH]  │ NEW: All models (P2)     │ {:>5}ms  │ {:>5.0}ms  │ {:?} │",
        stream_median, mean(&stream_times), stream_times
    );
    eprintln!("[BENCH]  └─────────────────────────┴──────────┴──────────┴──────────┘");

    // Speedups
    let first_ui_speedup = mono_median as f64 / (skel_median.max(1)) as f64;
    let first_model_speedup = mono_median as f64 / ((skel_median + first_model_median).max(1)) as f64;
    eprintln!("\n[BENCH]  Speedups vs Monolithic ({mono_median}ms):");
    eprintln!("[BENCH]    Time-to-first-UI (skeleton):  {skel_median}ms → {first_ui_speedup:.0}x faster");
    eprintln!(
        "[BENCH]    Time-to-first-model:           {}ms → {first_model_speedup:.1}x faster",
        skel_median + first_model_median
    );
    eprintln!(
        "[BENCH]    Total progressive:              {}ms → {:.2}x",
        skel_median + stream_median,
        mono_median as f64 / ((skel_median + stream_median).max(1)) as f64
    );

    // IPC payload sizes
    eprintln!("\n[BENCH]  IPC Payload Sizes (JSON serialized):");
    eprintln!("[BENCH]    OLD monolithic bundle:  {:.2} MB", monolithic_json_size as f64 / 1_048_576.0);
    eprintln!("[BENCH]    NEW skeleton:           {:.2} KB", skeleton_json_size as f64 / 1024.0);
    let total_chunk_size: usize = per_model_json_sizes.iter().map(|(_, s)| *s).sum();
    eprintln!("[BENCH]    NEW total chunks:       {:.2} MB ({} chunks)", total_chunk_size as f64 / 1_048_576.0, per_model_json_sizes.len());
    eprintln!("[BENCH]    Largest single chunk:   {:.2} MB",
        per_model_json_sizes.iter().map(|(_, s)| *s).max().unwrap_or(0) as f64 / 1_048_576.0
    );

    eprintln!("\n[BENCH]  Per-model breakdown (Round 1):");
    if let Some(models) = per_model_all.first() {
        for (i, ((name, ms), (_name2, json_sz))) in models.iter().zip(per_model_json_sizes.iter()).enumerate() {
            eprintln!(
                "[BENCH]    [{:>2}] {:<50} {:>5}ms  {:.2} MB",
                i, name, ms, *json_sz as f64 / 1_048_576.0
            );
        }
    }

    // Duplicate load elimination
    eprintln!("\n[BENCH]  Duplicate Load Elimination:");
    eprintln!("[BENCH]    OLD scene_open_folder called load_stage_bundle_impl AGAIN: +{mono_median}ms wasted");
    eprintln!("[BENCH]    NEW scene_open_folder uses skeleton: +{skel_median}ms (saved {}ms)", mono_median.saturating_sub(skel_median));

    eprintln!("\n{}", "=".repeat(76));
    eprintln!("[BENCH]  END");
    eprintln!("{}", "=".repeat(76));
}

// ─── Texture Decode Benchmark ───────────────────────────────────────────

fn collect_nutexb_paths(dir: &Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    collect_nutexb_paths_inner(dir, &mut out);
    out
}

fn collect_nutexb_paths_inner(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_dir() {
            collect_nutexb_paths_inner(&path, out);
        } else if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("nutexb")) {
            out.push(path);
        }
    }
}

#[derive(Debug)]
struct TextureDecodeResult {
    path: String,
    file_size: u64,
    width: u32,
    height: u32,
    format: String,
    read_ms: f64,
    decode_rgba_ms: f64,
    rgba_size: usize,
    decode_compressed_ms: f64,
    compressed_size: usize,
    compressed_format_id: u8,
}

#[test]
#[ignore]
fn bench_stage211_texture_decode() {
    let hash_root = r"E:\XB\解包\com\test\0xBBC60B47";
    if !Path::new(hash_root).is_dir() {
        eprintln!("[BENCH-TEX] SKIPPED — path not found: {hash_root}");
        return;
    }

    let all_nutexb = collect_nutexb_paths(Path::new(hash_root));
    if all_nutexb.is_empty() {
        eprintln!("[BENCH-TEX] SKIPPED — no .nutexb files found");
        return;
    }

    eprintln!("\n{}", "=".repeat(80));
    eprintln!("[BENCH-TEX]  Stage 211 FULL Texture Decode Benchmark");
    eprintln!("[BENCH-TEX]  Root: {hash_root}");
    eprintln!("[BENCH-TEX]  Total .nutexb files: {}", all_nutexb.len());
    eprintln!("{}", "=".repeat(80));

    // Warmup: decode first texture
    if let Some(first) = all_nutexb.first() {
        let bytes = std::fs::read(first).unwrap_or_default();
        let _ = nutexb_lib::nutexb_to_rgba_from_bytes(&bytes, None);
        let _ = nutexb_lib::nutexb_compressed_data_from_bytes(&bytes);
    }

    let mut results: Vec<TextureDecodeResult> = Vec::with_capacity(all_nutexb.len());
    let mut total_read_ms = 0.0f64;
    let mut total_rgba_ms = 0.0f64;
    let mut total_compressed_ms = 0.0f64;
    let mut total_file_bytes: u64 = 0;
    let mut total_rgba_bytes: usize = 0;
    let mut total_compressed_bytes: usize = 0;
    let mut decode_errors = 0usize;

    for nutexb_path in &all_nutexb {
        let path_str = nutexb_path.to_string_lossy().to_string();
        let rel = nutexb_path
            .strip_prefix(hash_root)
            .unwrap_or(nutexb_path)
            .to_string_lossy()
            .to_string();

        // Phase 1: File read
        let t = Instant::now();
        let bytes = match std::fs::read(nutexb_path) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("[BENCH-TEX] ERROR reading {rel}: {e}");
                decode_errors += 1;
                continue;
            }
        };
        let read_ms = t.elapsed().as_secs_f64() * 1000.0;
        let file_size = bytes.len() as u64;

        // Phase 2: Read info (format, dimensions)
        let info = match nutexb_lib::read_nutexb_info(&path_str) {
            Ok(i) => i,
            Err(e) => {
                eprintln!("[BENCH-TEX] ERROR reading info {rel}: {e}");
                decode_errors += 1;
                continue;
            }
        };

        // Phase 3: RGBA decode (full CPU decompress)
        let t = Instant::now();
        let rgba_result = nutexb_lib::nutexb_to_rgba_from_bytes(&bytes, None);
        let decode_rgba_ms = t.elapsed().as_secs_f64() * 1000.0;

        let (rgba_size, width, height) = match &rgba_result {
            Ok((w, h, data)) => (data.len(), *w, *h),
            Err(e) => {
                eprintln!("[BENCH-TEX] RGBA decode failed {rel}: {e}");
                decode_errors += 1;
                continue;
            }
        };

        // Phase 4: Compressed data extract (GPU-ready, no CPU decompress)
        let t = Instant::now();
        let comp_result = nutexb_lib::nutexb_compressed_data_from_bytes(&bytes);
        let decode_compressed_ms = t.elapsed().as_secs_f64() * 1000.0;

        let (compressed_size, compressed_format_id) = match &comp_result {
            Ok((_, _, fmt, data)) => (data.len(), *fmt),
            Err(e) => {
                eprintln!("[BENCH-TEX] Compressed extract failed {rel}: {e}");
                (0, 0)
            }
        };

        total_read_ms += read_ms;
        total_rgba_ms += decode_rgba_ms;
        total_compressed_ms += decode_compressed_ms;
        total_file_bytes += file_size;
        total_rgba_bytes += rgba_size;
        total_compressed_bytes += compressed_size;

        results.push(TextureDecodeResult {
            path: rel,
            file_size,
            width,
            height,
            format: info.image_format.clone(),
            read_ms,
            decode_rgba_ms,
            rgba_size,
            decode_compressed_ms,
            compressed_size,
            compressed_format_id,
        });
    }

    // ── Summary ──
    let count = results.len();
    eprintln!("\n{}", "-".repeat(80));
    eprintln!("[BENCH-TEX]  RESULTS — {} textures decoded ({} errors)", count, decode_errors);
    eprintln!("{}", "-".repeat(80));

    eprintln!("\n[BENCH-TEX]  Sequential Totals:");
    eprintln!("[BENCH-TEX]    File I/O:              {:.1}ms", total_read_ms);
    eprintln!("[BENCH-TEX]    RGBA decode (CPU):     {:.1}ms", total_rgba_ms);
    eprintln!("[BENCH-TEX]    Compressed extract:    {:.1}ms", total_compressed_ms);
    eprintln!("[BENCH-TEX]    Total RGBA pipeline:   {:.1}ms", total_read_ms + total_rgba_ms);
    eprintln!("[BENCH-TEX]    Total Compressed pipe: {:.1}ms", total_read_ms + total_compressed_ms);

    eprintln!("\n[BENCH-TEX]  Data Sizes:");
    eprintln!("[BENCH-TEX]    .nutexb on disk:  {:.2} MB ({} files)",
        total_file_bytes as f64 / 1_048_576.0, count);
    eprintln!("[BENCH-TEX]    RGBA decoded:     {:.2} MB (IPC payload if sent raw)",
        total_rgba_bytes as f64 / 1_048_576.0);
    eprintln!("[BENCH-TEX]    Compressed GPU:   {:.2} MB (IPC payload if sent compressed)",
        total_compressed_bytes as f64 / 1_048_576.0);

    let rgba_inflation = if total_file_bytes > 0 {
        total_rgba_bytes as f64 / total_file_bytes as f64
    } else {
        0.0
    };
    let compressed_ratio = if total_file_bytes > 0 {
        total_compressed_bytes as f64 / total_file_bytes as f64
    } else {
        0.0
    };
    eprintln!("[BENCH-TEX]    RGBA vs disk:     {:.2}x inflation", rgba_inflation);
    eprintln!("[BENCH-TEX]    Compressed vs disk: {:.2}x ratio", compressed_ratio);

    // Format distribution
    let mut format_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut format_sizes: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    for r in &results {
        *format_counts.entry(r.format.clone()).or_default() += 1;
        *format_sizes.entry(r.format.clone()).or_default() += r.file_size;
    }
    eprintln!("\n[BENCH-TEX]  Format Distribution:");
    let mut fmts: Vec<_> = format_counts.iter().collect();
    fmts.sort_by(|a, b| b.1.cmp(a.1));
    for (fmt, count) in &fmts {
        let sz = format_sizes.get(*fmt).copied().unwrap_or(0);
        eprintln!("[BENCH-TEX]    {:<20} {:>4} files  {:.2} MB",
            fmt, count, sz as f64 / 1_048_576.0);
    }

    // Top 10 slowest RGBA decodes
    let mut by_rgba_time: Vec<&TextureDecodeResult> = results.iter().collect();
    by_rgba_time.sort_by(|a, b| b.decode_rgba_ms.partial_cmp(&a.decode_rgba_ms).unwrap());
    eprintln!("\n[BENCH-TEX]  Top 10 Slowest RGBA Decodes:");
    eprintln!("[BENCH-TEX]  {:>6} {:>6} {:>12} {:>8} {:>10}  {}",
        "RGBA", "Read", "Dimensions", "Format", "FileSize", "Path");
    for r in by_rgba_time.iter().take(10) {
        eprintln!("[BENCH-TEX]  {:>5.1}ms {:>5.1}ms {:>5}x{:<5}  {:>8} {:>9.1}KB  {}",
            r.decode_rgba_ms, r.read_ms, r.width, r.height,
            &r.format[..r.format.len().min(8)],
            r.file_size as f64 / 1024.0, r.path);
    }

    // Top 10 largest textures by RGBA size
    let mut by_rgba_size: Vec<&TextureDecodeResult> = results.iter().collect();
    by_rgba_size.sort_by(|a, b| b.rgba_size.cmp(&a.rgba_size));
    eprintln!("\n[BENCH-TEX]  Top 10 Largest Textures (RGBA decoded):");
    eprintln!("[BENCH-TEX]  {:>10} {:>10} {:>12} {:>8}  {}",
        "RGBA MB", "Disk KB", "Dimensions", "Format", "Path");
    for r in by_rgba_size.iter().take(10) {
        eprintln!("[BENCH-TEX]  {:>9.2}MB {:>9.1}KB {:>5}x{:<5}  {:>8}  {}",
            r.rgba_size as f64 / 1_048_576.0,
            r.file_size as f64 / 1024.0,
            r.width, r.height,
            &r.format[..r.format.len().min(8)],
            r.path);
    }

    // RGBA vs Compressed comparison for IPC
    eprintln!("\n[BENCH-TEX]  IPC Strategy Comparison:");
    eprintln!("[BENCH-TEX]    Strategy A (RGBA → ArrayBuffer):    {:.2} MB, {:.1}ms decode",
        total_rgba_bytes as f64 / 1_048_576.0, total_rgba_ms);
    eprintln!("[BENCH-TEX]    Strategy B (Compressed → GPU):      {:.2} MB, {:.1}ms extract",
        total_compressed_bytes as f64 / 1_048_576.0, total_compressed_ms);
    let rgba_saved = total_rgba_bytes as f64 - total_compressed_bytes as f64;
    let time_saved = total_rgba_ms - total_compressed_ms;
    eprintln!("[BENCH-TEX]    B saves: {:.2} MB IPC payload, {:.1}ms CPU time",
        rgba_saved / 1_048_576.0, time_saved);

    // Downsampled decode comparison (simulates maxDimension=512)
    eprintln!("\n[BENCH-TEX]  Downsampled Decode (maxDimension=512):");
    let max_dim = 512u32;
    let mut total_ds_ms = 0.0f64;
    let mut total_ds_bytes: usize = 0;
    let mut ds_count = 0usize;
    for nutexb_path in all_nutexb.iter().take(50) {
        if let Ok(bytes) = std::fs::read(nutexb_path) {
            let t = Instant::now();
            if let Ok((_, _, data)) = nutexb_lib::nutexb_to_rgba_from_bytes(&bytes, Some(max_dim)) {
                let ms = t.elapsed().as_secs_f64() * 1000.0;
                total_ds_ms += ms;
                total_ds_bytes += data.len();
                ds_count += 1;
            }
        }
    }
    if ds_count > 0 {
        eprintln!("[BENCH-TEX]    Decoded {} textures at max {}px", ds_count, max_dim);
        eprintln!("[BENCH-TEX]    Total decode time:  {:.1}ms (avg {:.1}ms/tex)",
            total_ds_ms, total_ds_ms / ds_count as f64);
        eprintln!("[BENCH-TEX]    Total RGBA size:    {:.2} MB (avg {:.1}KB/tex)",
            total_ds_bytes as f64 / 1_048_576.0,
            total_ds_bytes as f64 / ds_count as f64 / 1024.0);
    }

    // Parallel decode simulation using std::thread
    eprintln!("\n[BENCH-TEX]  Parallel Decode Simulation (std::thread, 8 workers):");
    let paths_for_par: Vec<_> = all_nutexb.iter().cloned().collect();
    let num_workers = 8usize;

    let t_par = Instant::now();
    let chunk_size = (paths_for_par.len() + num_workers - 1) / num_workers;
    let handles: Vec<_> = paths_for_par
        .chunks(chunk_size)
        .map(|chunk| {
            let chunk = chunk.to_vec();
            std::thread::spawn(move || {
                let mut decoded = 0usize;
                let mut total_bytes = 0usize;
                for p in &chunk {
                    if let Ok(bytes) = std::fs::read(p) {
                        if let Ok((_, _, data)) = nutexb_lib::nutexb_to_rgba_from_bytes(&bytes, None) {
                            decoded += 1;
                            total_bytes += data.len();
                        }
                    }
                }
                (decoded, total_bytes)
            })
        })
        .collect();
    let mut par_decoded = 0usize;
    for h in handles {
        let (d, _) = h.join().unwrap();
        par_decoded += d;
    }
    let par_rgba_ms = t_par.elapsed().as_secs_f64() * 1000.0;
    eprintln!("[BENCH-TEX]    Parallel RGBA ({} textures):  {:.1}ms (vs {:.1}ms sequential)",
        par_decoded, par_rgba_ms, total_read_ms + total_rgba_ms);
    eprintln!("[BENCH-TEX]    Parallel speedup: {:.2}x",
        (total_read_ms + total_rgba_ms) / par_rgba_ms.max(0.001));

    let t_par_comp = Instant::now();
    let paths_for_comp: Vec<_> = all_nutexb.iter().cloned().collect();
    let handles_comp: Vec<_> = paths_for_comp
        .chunks(chunk_size)
        .map(|chunk| {
            let chunk = chunk.to_vec();
            std::thread::spawn(move || {
                let mut decoded = 0usize;
                for p in &chunk {
                    if let Ok(bytes) = std::fs::read(p) {
                        if nutexb_lib::nutexb_compressed_data_from_bytes(&bytes).is_ok() {
                            decoded += 1;
                        }
                    }
                }
                decoded
            })
        })
        .collect();
    let mut par_comp_decoded = 0usize;
    for h in handles_comp {
        par_comp_decoded += h.join().unwrap();
    }
    let par_comp_ms = t_par_comp.elapsed().as_secs_f64() * 1000.0;
    eprintln!("[BENCH-TEX]    Parallel Compressed ({} textures):  {:.1}ms (vs {:.1}ms sequential)",
        par_comp_decoded, par_comp_ms, total_read_ms + total_compressed_ms);
    eprintln!("[BENCH-TEX]    Parallel speedup: {:.2}x",
        (total_read_ms + total_compressed_ms) / par_comp_ms.max(0.001));

    // Frontend decode concurrency simulation (8 concurrent IPC calls)
    eprintln!("\n[BENCH-TEX]  Frontend IPC Simulation (DECODE_CONCURRENCY=8):");
    eprintln!("[BENCH-TEX]    Total textures:        {}", count);
    let avg_rgba_ms = if count > 0 { (total_read_ms + total_rgba_ms) / count as f64 } else { 0.0 };
    let avg_comp_ms = if count > 0 { (total_read_ms + total_compressed_ms) / count as f64 } else { 0.0 };
    let batches = (count + 7) / 8;
    eprintln!("[BENCH-TEX]    Avg RGBA per texture:  {:.1}ms", avg_rgba_ms);
    eprintln!("[BENCH-TEX]    Avg Compressed per tex: {:.1}ms", avg_comp_ms);
    eprintln!("[BENCH-TEX]    Est. wall time (8x RGBA):       {:.0}ms ({} batches)",
        avg_rgba_ms * batches as f64, batches);
    eprintln!("[BENCH-TEX]    Est. wall time (8x Compressed): {:.0}ms ({} batches)",
        avg_comp_ms * batches as f64, batches);

    eprintln!("\n{}", "=".repeat(80));
    eprintln!("[BENCH-TEX]  END");
    eprintln!("{}", "=".repeat(80));
}


#[test]
#[ignore]
fn debug_sky_texture_resolve() {
    use ssbh_data::matl_data::MatlData;

    let path = r"E:\XB\解包\com\test\0xBBC60B47\0\0";
    if !Path::new(path).is_dir() { return; }
    let root = Path::new(path);
    let mut warnings = Vec::new();
    let bundle = load_model_in_subfolder_pub(root, "sky", &mut warnings).expect("sky model should load");

    eprintln!("\n[SKY] texture_refs ({}):", bundle.texture_refs.len());
    for r in &bundle.texture_refs {
        eprintln!("  ref: {r}");
    }
    eprintln!("\n[SKY] texture_resolve ({}):", bundle.texture_resolve.len());
    for tr in &bundle.texture_resolve {
        let status = if tr.nutexb_path.is_some() { "OK" } else { "MISSING" };
        eprintln!("  [{status}] ref={} -> {:?}", tr.reference, tr.nutexb_path);
    }

    // Parse both matl files independently to compare material labels
    let sky_dir = Path::new(path).join("sky").join("0");
    let nust = sky_dir.join("211stage211_sky__nust__.numatb");
    let maya = sky_dir.join("211stage211_sky__maya__.numatb");

    if nust.exists() {
        match MatlData::from_file(&nust) {
            Ok(data) => {
                eprintln!("\n[SKY] __nust__.numatb entries ({}):", data.entries.len());
                for e in &data.entries {
                    let tex_params: Vec<String> = e.textures.iter()
                        .map(|t| format!("{:?}={}", t.param_id, t.data))
                        .collect();
                    eprintln!("  label={} textures=[{}]", e.material_label, tex_params.join(", "));
                }
            }
            Err(e) => eprintln!("[SKY] __nust__ parse error: {e}"),
        }
    }
    if maya.exists() {
        match MatlData::from_file(&maya) {
            Ok(data) => {
                eprintln!("\n[SKY] __maya__.numatb entries ({}):", data.entries.len());
                for e in &data.entries {
                    eprintln!("  label={}", e.material_label);
                }
            }
            Err(e) => eprintln!("[SKY] __maya__ parse error: {e}"),
        }
    }

    // Show modl entries (mesh → material mapping)
    let modl: serde_json::Value = serde_json::from_value(bundle.modl.clone()).unwrap();
    if let Some(entries) = modl.get("entries").and_then(|e| e.as_array()) {
        eprintln!("\n[SKY] modl entries ({}):", entries.len());
        for e in entries {
            let mesh = e.get("mesh_object_name").and_then(|v| v.as_str()).unwrap_or("?");
            let sub = e.get("mesh_object_subindex").and_then(|v| v.as_u64()).unwrap_or(0);
            let mat = e.get("material_label").and_then(|v| v.as_str()).unwrap_or("?");
            eprintln!("  mesh={mesh}[{sub}] -> material={mat}");
        }
    }
}
