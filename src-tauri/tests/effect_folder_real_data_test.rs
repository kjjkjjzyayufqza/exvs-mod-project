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
const MISLABELED_ANIMATION_FILE: &str = "129.efxbn";
const ANIMATION_REFERENCER_FILE: &str = "201.efxbn";
const POSITIVE_SOURCE_ROOT: &str = r"E:\XB\mod\006effect\001gundam_005gyan00_001";
const POSITIVE_SOURCE_STRUCTURE: &str =
    r"E:\XB\mod\006effect\001gundam_005gyan00_001_structure.json";

fn create_empty_target(temp: &tempfile::TempDir) -> (std::path::PathBuf, std::path::PathBuf) {
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
    (target_root, target_structure)
}

#[test]
fn classifies_mislabeled_nuanmb_by_magic_for_animation_closure() {
    if !Path::new(SOURCE_ROOT).is_dir() || !Path::new(SOURCE_STRUCTURE).is_file() {
        eprintln!("SKIP: real effect fixture is unavailable: {SOURCE_ROOT}");
        return;
    }

    let source = inspect_effect_folder(SOURCE_ROOT, Some(SOURCE_STRUCTURE))
        .expect("inspect source effect pack");
    let animation = source
        .other_files
        .iter()
        .find(|item| {
            Path::new(&item.path)
                .file_name()
                .is_some_and(|name| name == MISLABELED_ANIMATION_FILE)
        })
        .expect("classify mislabeled file as an other file");
    let animation_hash = animation
        .hash
        .as_ref()
        .expect("mislabeled animation hash")
        .signed;

    assert_eq!(animation.file_type, ".efxbn");
    assert_eq!(animation.actual_ext, ".nuanmb");
    assert!(
        source
            .efxbns
            .iter()
            .all(|item| item.file_index != animation.file_index),
        "the NUANMB payload must not remain in the EFXBN inventory"
    );
    assert!(source.warnings.iter().all(|warning| {
        !warning.contains(&format!("fileIndex {}", animation.file_index))
            && !warning.contains(MISLABELED_ANIMATION_FILE)
    }));

    let selected = source
        .efxbns
        .iter()
        .find(|item| {
            Path::new(&item.path)
                .file_name()
                .is_some_and(|name| name == ANIMATION_REFERENCER_FILE)
        })
        .expect("find EFXBN referencing the mislabeled animation");
    assert!(selected
        .efxbn
        .as_ref()
        .expect("parse animation-referencing EFXBN")
        .animation_ids
        .iter()
        .any(|hash| hash.signed == animation_hash));

    let temp = tempfile::tempdir().expect("create temporary target");
    let (target_root, target_structure) = create_empty_target(&temp);
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
    .expect("copy EFXBN animation closure");
    let target = inspect_effect_folder(
        &target_root.to_string_lossy(),
        Some(&target_structure.to_string_lossy()),
    )
    .expect("inspect copied target");

    assert!(target.other_files.iter().any(|item| {
        item.actual_ext == ".nuanmb"
            && item
                .hash
                .as_ref()
                .is_some_and(|hash| hash.signed == animation_hash)
    }));
    assert!(result.copied_files.iter().any(|path| {
        Path::new(path)
            .file_name()
            .is_some_and(|name| name == MISLABELED_ANIMATION_FILE)
    }));
    assert!(target.warnings.iter().all(|warning| {
        !warning.contains("Invalid EFXBN magic") && !warning.contains(MISLABELED_ANIMATION_FILE)
    }));
}

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

    assert_eq!(summary.effect_count, 4);
    assert_eq!(summary.effects.len(), 4);
    assert_eq!(summary.effects[0].effect_type, 9);
    assert_eq!(summary.effects[0].referenced_effect_index, 1);
    assert_eq!(summary.effects[0].life_time_base, 1.0);
    assert_eq!(summary.effects[0].interval_base, 1.0);
    assert_eq!(summary.effects[0].num_emit, 3);
    assert_eq!(summary.effects[0].action_flags, 1);
    assert_eq!(summary.effects[0].spawn_form_type, 3);
    assert!((summary.effects[0].spawn_form_length[0] - 0.7).abs() < 0.0001);
    assert_eq!(summary.effects[1].effect_type, 1);
    assert_eq!(summary.effects[1].life_time_base, 16.0);
    assert_eq!(summary.effects[1].life_time_random, 0.5);
    assert_eq!(summary.effects[1].z_write_enable, 0);
    assert_eq!(summary.effects[1].z_test_enable, 1);
    assert_eq!(summary.effects[1].blend_state, 2);
    assert_eq!(summary.effects[2].effect_type, 9);
    assert_eq!(summary.effects[2].referenced_effect_index, 3);
    assert_eq!(summary.effects[2].num_emit, 2);
    assert_eq!(summary.effects[3].effect_type, 1);
    assert!(summary
        .effects
        .iter()
        .all(|effect| effect.model_hash.signed == 0));
    assert!(summary
        .effects
        .iter()
        .all(|effect| effect.animation_hash.signed == 0));
    let speed_y = summary.effects[1]
        .control_references
        .iter()
        .find(|reference| reference.name == "speedBaseY")
        .expect("speedBaseY control");
    assert_eq!(speed_y.selector, 1);
    assert!(
        (summary.control_lookup_entries[speed_y.lookup_index as usize].value - 0.02).abs()
            < 0.000001
    );
    let alpha = summary.effects[1]
        .control_references
        .iter()
        .find(|reference| reference.name == "colorA")
        .expect("colorA control");
    assert_eq!(alpha.selector, 11);

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
    assert!(source_models.is_empty());
    assert_eq!(expected_texture_count, 0);
    assert_eq!(expected_animation_count, 0);

    let temp = tempfile::tempdir().expect("create temporary target");
    let (target_root, target_structure) = create_empty_target(&temp);

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
    assert_eq!(result.copied_files.len(), 1);
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

#[test]
fn copies_a_real_source_local_dependency_closure_without_copying_the_pack() {
    if !Path::new(POSITIVE_SOURCE_ROOT).is_dir() || !Path::new(POSITIVE_SOURCE_STRUCTURE).is_file()
    {
        eprintln!("SKIP: positive real effect fixture is unavailable: {POSITIVE_SOURCE_ROOT}");
        return;
    }

    let source = inspect_effect_folder(POSITIVE_SOURCE_ROOT, Some(POSITIVE_SOURCE_STRUCTURE))
        .expect("inspect positive source effect pack");
    let selected = source
        .efxbns
        .iter()
        .find(|item| {
            let Some(summary) = item.efxbn.as_ref() else {
                return false;
            };
            let model_ids = summary
                .model_ids
                .iter()
                .map(|hash| hash.signed)
                .collect::<HashSet<_>>();
            let texture_ids = summary
                .model_control_texture_ids
                .iter()
                .map(|hash| hash.signed)
                .collect::<HashSet<_>>();
            let animation_ids = summary
                .animation_ids
                .iter()
                .map(|hash| hash.signed)
                .collect::<HashSet<_>>();
            source
                .models
                .iter()
                .any(|model| model_ids.contains(&model.hash.signed))
                || source.textures.iter().any(|texture| {
                    texture
                        .hash
                        .as_ref()
                        .is_some_and(|hash| texture_ids.contains(&hash.signed))
                })
                || source.other_files.iter().any(|file| {
                    file.actual_ext == ".nuanmb"
                        && file
                            .hash
                            .as_ref()
                            .is_some_and(|hash| animation_ids.contains(&hash.signed))
                })
        })
        .expect("find an EFXBN with source-local dependencies");
    let summary = selected.efxbn.as_ref().expect("parse selected EFXBN");
    let model_ids = summary
        .model_ids
        .iter()
        .map(|hash| hash.signed)
        .collect::<HashSet<_>>();
    let expected_models = source
        .models
        .iter()
        .filter(|model| model_ids.contains(&model.hash.signed))
        .collect::<Vec<_>>();
    let mut texture_ids = summary
        .model_control_texture_ids
        .iter()
        .map(|hash| hash.signed)
        .collect::<HashSet<_>>();
    for model in &expected_models {
        texture_ids.extend(model.material_texture_ids.iter().map(|hash| hash.signed));
    }
    let expected_texture_count = source
        .textures
        .iter()
        .filter(|texture| {
            texture
                .hash
                .as_ref()
                .is_some_and(|hash| texture_ids.contains(&hash.signed))
        })
        .count();
    let animation_ids = summary
        .animation_ids
        .iter()
        .map(|hash| hash.signed)
        .collect::<HashSet<_>>();
    let expected_animation_count = source
        .other_files
        .iter()
        .filter(|file| {
            file.actual_ext == ".nuanmb"
                && file
                    .hash
                    .as_ref()
                    .is_some_and(|hash| animation_ids.contains(&hash.signed))
        })
        .count();
    assert!(
        !expected_models.is_empty() || expected_texture_count > 0 || expected_animation_count > 0,
        "the positive fixture must exercise at least one local dependency"
    );

    let temp = tempfile::tempdir().expect("create temporary target");
    let (target_root, target_structure) = create_empty_target(&temp);
    let result = copy_effect_folder_selection(
        POSITIVE_SOURCE_ROOT,
        Some(POSITIVE_SOURCE_STRUCTURE),
        &target_root.to_string_lossy(),
        Some(&target_structure.to_string_lossy()),
        &[EffectFolderSelection {
            kind: "efxbn".to_string(),
            file_index: Some(selected.file_index),
            hash_id: None,
            name: None,
        }],
    )
    .expect("copy positive source-local closure");
    let target = inspect_effect_folder(
        &target_root.to_string_lossy(),
        Some(&target_structure.to_string_lossy()),
    )
    .expect("inspect positive copied target");
    let copied_animation_count = target
        .other_files
        .iter()
        .filter(|file| file.actual_ext == ".nuanmb")
        .count();

    assert_eq!(target.efxbns.len(), 1);
    assert_eq!(target.models.len(), expected_models.len());
    assert_eq!(target.textures.len(), expected_texture_count);
    assert_eq!(copied_animation_count, expected_animation_count);
    assert!(result.copied_files.len() > 1);
    assert!(result.copied_files.len() < source.summary.total_files);

    println!(
        "positive {}: source_files={}, source-local(model/texture/animation)={}/{}/{}, copied_files={}, warnings={}",
        Path::new(&selected.path)
            .file_name()
            .expect("selected file name")
            .to_string_lossy(),
        source.summary.total_files,
        expected_models.len(),
        expected_texture_count,
        expected_animation_count,
        result.copied_files.len(),
        result.warnings.len(),
    );
}

/// Locks the EFXBN block layout to the values proven from the native loader and the
/// shader-reflected `SEfxElementData`:
///
/// * `sub_140145DF0` reads block `i` from `payload + 0x18 + i * 0x370`.
/// * Block offsets equal reflected offsets, so `elementType` is at 40 and
///   `numEmitCountRandom` is at 696.
/// * The curve key array follows the blocks and holds `(time, value)` pairs whose
///   times run from 0 to 100.
#[test]
fn parses_167_efxbn_block_layout_and_curve_table() {
    let source_path = Path::new(SOURCE_ROOT)
        .join("0")
        .join("0")
        .join(SELECTED_FILE);
    if !source_path.is_file() {
        eprintln!("SKIP: real effect fixture is unavailable: {SOURCE_ROOT}");
        return;
    }

    let summary =
        app_lib::format::effect_folder::parse_efxbn_file(source_path.to_string_lossy().as_ref())
            .expect("parse 167.efxbn");

    // Header is six dwords; the regions tile the file exactly.
    assert_eq!(summary.effect_count, 4);
    assert_eq!(summary.curve_key_count, 99);
    assert_eq!(summary.model_control_config_count, 4);
    assert_eq!(summary.control_lookup_region_offset, 0x18 + 4 * 0x370);
    assert_eq!(summary.trailing_offset as usize, summary.actual_size);

    // Wrapper/target topology comes from level and childIndexArray, not from a guess
    // based on elementType.
    let levels: Vec<u32> = summary.effects.iter().map(|effect| effect.level).collect();
    assert_eq!(levels, vec![0, 1, 0, 1]);
    assert_eq!(summary.effects[0].child_index_size, 1);
    assert_eq!(summary.effects[0].child_index_array[0], 1);
    assert_eq!(summary.effects[0].child_index_array[1], -1);
    assert_eq!(summary.effects[2].child_index_array[0], 3);
    assert_eq!(summary.effects[1].child_index_size, 0);

    assert_eq!(summary.effects[0].effect_type, 9);
    assert_eq!(summary.effects[1].effect_type, 1);
    assert_eq!(summary.effects[0].num_emit, 3);
    assert_eq!(summary.effects[2].num_emit, 2);
    assert_eq!(summary.effects[1].life_time_base, 16.0);
    assert_eq!(summary.effects[1].extra_flags, 0x100);

    // This pack binds textures through parameter slots, not through the block handle.
    assert_eq!(summary.effects[1].nud_handle, 0);
    assert_eq!(summary.effects[1].texture_handle, 0);
    assert_eq!(summary.effects[1].color_texture_parameter_index, [0, -1]);
    assert_eq!(summary.effects[1].uv_texture_parameter_index, [1, -1]);
    assert_eq!(summary.effects[3].color_texture_parameter_index, [2, -1]);
    assert_eq!(summary.effects[3].uv_texture_parameter_index, [3, -1]);

    // Curve references are packed consecutively, which is what proves `selector` is a
    // key count and `lookup_index` is the first key.
    let alpha = summary.effects[1]
        .control_references
        .iter()
        .find(|reference| reference.name == "colorA")
        .expect("colorA curve reference");
    assert_eq!(alpha.selector, 11);
    assert_eq!(alpha.lookup_index, 36);

    let keys = &summary.control_lookup_entries;
    assert_eq!(keys.len(), 99);
    assert_eq!(keys[36].key, 0.0);
    assert_eq!(keys[36].value, 1.5);
    assert_eq!(keys[46].key, 100.0);
    assert_eq!(keys[46].value, 0.0);

    // block 3 colorA is a quadratic fade, so the key table is being read as floats.
    let fade = summary.effects[3]
        .control_references
        .iter()
        .find(|reference| reference.name == "colorA")
        .expect("colorA curve reference");
    assert_eq!(fade.lookup_index, 85);
    assert_eq!(keys[85].value, 1.0);
    assert!((keys[90].value - 0.25).abs() < 1e-6);
    assert_eq!(keys[95].value, 0.0);
}

/// The loader normalizes each block before use (`sub_140146590`): type-9 wrappers adopt a
/// type derived from their first child, and several fields are defaulted. Authored values
/// must stay untouched so packs still round-trip.
#[test]
fn normalizes_167_efxbn_blocks_without_touching_authored_values() {
    let source_path = Path::new(SOURCE_ROOT)
        .join("0")
        .join("0")
        .join(SELECTED_FILE);
    if !source_path.is_file() {
        eprintln!("SKIP: real effect fixture is unavailable: {SOURCE_ROOT}");
        return;
    }

    let summary =
        app_lib::format::effect_folder::parse_efxbn_file(source_path.to_string_lossy().as_ref())
            .expect("parse 167.efxbn");

    let runtime: Vec<_> = summary
        .effects
        .iter()
        .map(|effect| effect.runtime.as_ref().expect("runtime normalization"))
        .collect();

    // Both wrappers spawn billboards, so type 9 resolves to 0 and neither is drawable.
    assert_eq!(summary.effects[0].effect_type, 9);
    assert_eq!(runtime[0].element_type, 0);
    assert_eq!(summary.effects[2].effect_type, 9);
    assert_eq!(runtime[2].element_type, 0);

    // Billboards keep their authored type.
    assert_eq!(runtime[1].element_type, 1);
    assert_eq!(runtime[3].element_type, 1);

    // blendState is non-zero and soft particles are off, so zWriteEnable stays authored.
    assert_eq!(runtime[1].z_write_enable, summary.effects[1].z_write_enable);

    // softParticleRange is authored non-zero here, so the 8.0 default does not apply.
    assert_eq!(runtime[1].soft_particle_range, 1.0);

    // internalElementDataIndex is assigned from the block index.
    for (index, entry) in runtime.iter().enumerate() {
        assert_eq!(entry.internal_element_data_index, index as u32);
    }

    // The authored record is untouched.
    assert_eq!(summary.effects[1].effect_type, 1);
    assert_eq!(summary.effects[0].action_flags, 1);
}

/// `drawSchemeFlag` is the runtime word at element `+0x390` that `sub_140188E30` uses to pick
/// the pixel-shader variant. It never appears in the file, so the parser has to synthesize it.
///
/// Both drawable blocks in `167.efxbn` bind a UV-offset parameter and enable the depth test,
/// which is `0x80 | 0x10`. `0x80` alone puts them on the ColorEx variant (mask `0x280`).
#[test]
fn computes_draw_scheme_flag_for_real_167_blocks() {
    let source_path = Path::new(SOURCE_ROOT)
        .join("0")
        .join("0")
        .join(SELECTED_FILE);
    if !source_path.is_file() {
        eprintln!("SKIP: real effect fixture is unavailable: {SOURCE_ROOT}");
        return;
    }

    let summary =
        app_lib::format::effect_folder::parse_efxbn_file(source_path.to_string_lossy().as_ref())
            .expect("parse 167.efxbn");
    let schemes: Vec<_> = summary
        .effects
        .iter()
        .map(|effect| effect.runtime.as_ref().expect("runtime").draw_scheme)
        .collect();

    // The loader only writes the enable byte for authored types 1/3/5, so the two type-9
    // wrappers never get a draw scheme at all.
    assert_eq!(
        schemes.iter().map(|s| s.flag).collect::<Vec<_>>(),
        vec![0x0, 0x90, 0x0, 0x90]
    );
    // Neither block is a model, so no bit depends on the mesh.
    assert!(schemes.iter().all(|s| s.mesh_multi_uv_flag == 0));
}

/// A pack with real model blocks pins the gate and the mesh-dependent group.
#[test]
fn draw_scheme_flag_gates_on_drawable_types_and_reports_the_mesh_multi_uv_group() {
    let source_path = Path::new(r"E:\XB\mod\006effect\001gundam_002chrgel_001\0\0\14.efxbn");
    if !source_path.is_file() {
        eprintln!(
            "SKIP: real effect fixture is unavailable: {}",
            source_path.display()
        );
        return;
    }

    let summary =
        app_lib::format::effect_folder::parse_efxbn_file(source_path.to_string_lossy().as_ref())
            .expect("parse 14.efxbn");
    let scheme = |index: usize| {
        summary.effects[index]
            .runtime
            .as_ref()
            .expect("runtime")
            .draw_scheme
    };

    // Container types 6 and 9 are never enabled.
    assert_eq!(summary.effects[0].effect_type, 6);
    assert_eq!(scheme(0).flag, 0);
    assert_eq!(summary.effects[1].effect_type, 9);
    assert_eq!(scheme(1).flag, 0);

    // Model blocks always carry the multi-UV candidate bit; whether it applies depends on the
    // mesh, which the parser does not read.
    assert_eq!(summary.effects[2].effect_type, 3);
    assert_eq!(scheme(2).flag, 0x411);
    assert_eq!(scheme(2).mesh_multi_uv_flag, 0x1000);

    // A billboard with only the depth test set.
    assert_eq!(summary.effects[6].effect_type, 1);
    assert_eq!(scheme(6).flag, 0x10);
    assert_eq!(scheme(6).mesh_multi_uv_flag, 0);

    // A model block that also binds a UV-offset parameter.
    assert_eq!(scheme(8).flag, 0x491);
    assert_eq!(scheme(8).mesh_multi_uv_flag, 0x1000);
}

/// Every EFXBN under a root, in a stable order, for corpus-wide sweeps.
fn collect_efxbn_paths(root: &Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    let mut children: Vec<std::path::PathBuf> = entries
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .collect();
    children.sort();
    for child in children {
        if child.is_dir() {
            collect_efxbn_paths(&child, out);
        } else if child
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("efxbn"))
        {
            out.push(child);
        }
    }
}

/// F1a: `build_efxbn_bytes` must reproduce an unmodified file byte for byte.
///
/// Every one of the 880 bytes in a block and the 184 bytes in a model control is covered by a
/// typed field, so the builder reconstructs rather than copying a raw image. A mismatch here
/// means a field is unparsed, which would silently drop authored data on the first real edit.
#[test]
fn build_efxbn_bytes_round_trips_a_real_corpus_sample() {
    const SAMPLE_TARGET: usize = 240;
    let mut paths = Vec::new();
    for root in [r"E:\XB\mod\006effect", r"E:\XB\解包"] {
        collect_efxbn_paths(Path::new(root), &mut paths);
    }
    if paths.len() < SAMPLE_TARGET {
        eprintln!(
            "SKIP: only {} real .efxbn available, need {SAMPLE_TARGET}",
            paths.len()
        );
        return;
    }

    // Spread the sample across the whole tree instead of taking one pack's worth.
    let stride = paths.len() / SAMPLE_TARGET;
    let sample: Vec<&std::path::PathBuf> = paths.iter().step_by(stride.max(1)).collect();
    let mut checked = 0usize;
    let mut mismatches = Vec::new();
    for path in &sample {
        let text = path.to_string_lossy().to_string();
        let Ok(original) = fs::read(path.as_path()) else {
            continue;
        };
        let Ok(summary) = app_lib::format::effect_folder::parse_efxbn_file(&text) else {
            continue;
        };
        let rebuilt = app_lib::format::effect_folder::build_efxbn_bytes(&summary)
            .unwrap_or_else(|error| panic!("build {text}: {error}"));
        checked += 1;
        if rebuilt != original {
            let first = rebuilt
                .iter()
                .zip(original.iter())
                .position(|(a, b)| a != b)
                .map(|offset| format!("0x{offset:X}"))
                .unwrap_or_else(|| "length".to_string());
            mismatches.push(format!(
                "{text}: first difference at {first} (built {} bytes, original {} bytes)",
                rebuilt.len(),
                original.len()
            ));
        }
    }

    assert!(
        checked >= SAMPLE_TARGET,
        "expected at least {SAMPLE_TARGET} parsed samples, got {checked}"
    );
    assert!(
        mismatches.is_empty(),
        "{} of {checked} files did not round-trip:\n{}",
        mismatches.len(),
        mismatches
            .iter()
            .take(5)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}

/// K3: corpus-wide claims this project reasons from, promoted to a test so they cannot rot.
///
/// Each one is load-bearing somewhere in the preview: no type 2 (the strip test used to key on
/// it), no `blendState == 3` (its descriptor preset was never resolved, so the renderer rejects
/// it), `cullingType` inside the engine's three-entry cull table, and no structural dangling
/// reference in any shipped file.
#[test]
fn shipped_corpus_holds_the_invariants_the_preview_relies_on() {
    let mut paths = Vec::new();
    for root in [r"E:\XB\mod\006effect", r"E:\XB\解包"] {
        collect_efxbn_paths(Path::new(root), &mut paths);
    }
    if paths.is_empty() {
        eprintln!("SKIP: no real .efxbn tree is available");
        return;
    }

    let mut files = 0usize;
    let mut blocks = 0usize;
    let mut violations: Vec<String> = Vec::new();
    for path in &paths {
        let text = path.to_string_lossy().to_string();
        let Ok(summary) = app_lib::format::effect_folder::parse_efxbn_file(&text) else {
            continue;
        };
        files += 1;
        blocks += summary.effects.len();
        for effect in &summary.effects {
            if effect.effect_type == 2 {
                violations.push(format!("{text} block {} is element type 2", effect.index));
            }
            if effect.blend_state == 3 {
                violations.push(format!("{text} block {} has blendState 3", effect.index));
            }
            if effect.culling_type > 2 {
                violations.push(format!(
                    "{text} block {} has cullingType {}",
                    effect.index, effect.culling_type
                ));
            }
        }
        for problem in app_lib::format::effect_folder::validate_efxbn_summary(&summary) {
            violations.push(format!("{text}: {problem}"));
        }
        if violations.len() > 20 {
            break;
        }
    }

    assert!(
        files > 1_000,
        "expected a real corpus, parsed only {files} files"
    );
    assert!(
        violations.is_empty(),
        "{} invariant violations across {files} files / {blocks} blocks:\n{}",
        violations.len(),
        violations
            .iter()
            .take(10)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}
