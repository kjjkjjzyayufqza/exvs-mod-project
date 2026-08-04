use std::collections::HashSet;
use std::fs;
use std::path::Path;

use app_lib::format::effect_folder::{
    copy_effect_folder_selection, inspect_effect_folder, EffectFolderSelection,
};
use serde_json::json;

const SOURCE_ROOT: &str = r"E:\XB\mod\006effect\053gbftry_005tsient_001";
const SOURCE_STRUCTURE: &str = r"E:\XB\mod\006effect\053gbftry_005tsient_001_structure.json";
const SELECTED_FILE: &str = "167.efxbn";

#[test]
fn copies_167_efxbn_source_local_dependencies_only() {
    if !Path::new(SOURCE_ROOT).is_dir() || !Path::new(SOURCE_STRUCTURE).is_file() {
        eprintln!("SKIP: real effect fixture is unavailable: {SOURCE_ROOT}");
        return;
    }

    let source_path = Path::new(SOURCE_ROOT)
        .join("0")
        .join("0")
        .join(SELECTED_FILE);
    let source_before = fs::read(&source_path).expect("read source EFXBN");
    let source = inspect_effect_folder(SOURCE_ROOT, Some(SOURCE_STRUCTURE))
        .expect("inspect source effect pack");
    let selected = source
        .efxbns
        .iter()
        .find(|item| {
            Path::new(&item.path)
                .file_name()
                .is_some_and(|name| name == SELECTED_FILE)
        })
        .expect("find 167.efxbn in source inventory");
    let summary = selected.efxbn.as_ref().expect("parse 167.efxbn");

    let model_ids: HashSet<i32> = summary.model_ids.iter().map(|hash| hash.signed).collect();
    let animation_ids: HashSet<i32> = summary
        .animation_ids
        .iter()
        .map(|hash| hash.signed)
        .collect();
    let source_models = source
        .models
        .iter()
        .filter(|model| model_ids.contains(&model.hash.signed))
        .collect::<Vec<_>>();
    let mut texture_ids: HashSet<i32> = summary
        .model_control_texture_ids
        .iter()
        .map(|hash| hash.signed)
        .collect();
    for model in &source_models {
        texture_ids.extend(model.material_texture_ids.iter().map(|hash| hash.signed));
    }
    let expected_texture_count = source
        .textures
        .iter()
        .filter(|item| {
            item.hash
                .as_ref()
                .is_some_and(|hash| texture_ids.contains(&hash.signed))
        })
        .count();
    let expected_animation_count = source
        .other_files
        .iter()
        .filter(|item| {
            item.actual_ext == ".nuanmb"
                && item
                    .hash
                    .as_ref()
                    .is_some_and(|hash| animation_ids.contains(&hash.signed))
        })
        .count();

    let temp = tempfile::tempdir().expect("create temporary target");
    let target_root = temp.path().join("0xTARGET");
    let target_structure = temp.path().join("0xTARGET_structure.json");
    fs::create_dir_all(&target_root).expect("create target root");
    fs::write(
        &target_structure,
        serde_json::to_vec_pretty(&json!({
            "Name": "test_target",
            "HashName": "0xTARGET",
            "Magic": -843925575_i32,
            "Fhm2dTotalCount": 0,
            "UnkCount": 0,
            "SubFileData": [],
            "SubFileStructure": [],
        }))
        .expect("serialize target structure"),
    )
    .expect("write target structure");

    let result = copy_effect_folder_selection(
        SOURCE_ROOT,
        Some(SOURCE_STRUCTURE),
        &target_root.to_string_lossy(),
        Some(&target_structure.to_string_lossy()),
        &[EffectFolderSelection {
            kind: "efxbn".to_string(),
            file_index: Some(selected.file_index),
            hash_id: None,
            name: None,
        }],
    )
    .expect("copy selected EFXBN");
    let target = inspect_effect_folder(
        &target_root.to_string_lossy(),
        Some(&target_structure.to_string_lossy()),
    )
    .expect("inspect copied target");

    let copied_animation_count = target
        .other_files
        .iter()
        .filter(|item| item.actual_ext == ".nuanmb")
        .count();
    assert_eq!(target.efxbns.len(), 1);
    assert_eq!(target.models.len(), source_models.len());
    assert_eq!(target.textures.len(), expected_texture_count);
    assert_eq!(copied_animation_count, expected_animation_count);
    assert_eq!(
        fs::read(&source_path).expect("re-read source EFXBN"),
        source_before,
        "source EFXBN must remain unchanged"
    );

    println!(
        "167.efxbn: effects={}, ids(model/texture/animation)={}/{}/{}, source-local={}/{}/{}, copied_files={}, warnings={}",
        summary.effect_count,
        summary.model_ids.len(),
        summary.model_control_texture_ids.len(),
        summary.animation_ids.len(),
        source_models.len(),
        expected_texture_count,
        expected_animation_count,
        result.copied_files.len(),
        result.warnings.len(),
    );
}
