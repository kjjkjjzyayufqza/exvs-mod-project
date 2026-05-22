use app_lib::format::fhm2d_stage::{load_stage_bundle_impl, PlacementEntry};
use std::collections::HashSet;
use std::path::Path;

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
