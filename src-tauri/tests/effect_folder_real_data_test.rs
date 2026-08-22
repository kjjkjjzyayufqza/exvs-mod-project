use std::collections::HashSet;
use std::fs;
use std::path::Path;

use app_lib::format::effect_folder::{
    copy_effect_folder_selection, inspect_effect_folder, sanitize_effect_copy_dest_file_name,
    EffectFolderSelection,
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

/// `33.efxbn` in this pack draws six Model blocks and binds no resource of its own: its models
/// and colour maps all live in `000common_001`. It is the smallest proof that indexing only the
/// opened pack leaves an effect with nothing to draw.
const COMMON_REF_ROOT: &str = r"E:\XB\mod\006effect\wing_gundam_zero_rebellion_effect";
const COMMON_REF_STRUCTURE: &str =
    r"E:\XB\mod\006effect\wing_gundam_zero_rebellion_effect_structure.json";
const COMMON_PACK_ROOT: &str = r"E:\XB\mod\006effect\000common_001";
const COMMON_PACK_STRUCTURE: &str = r"E:\XB\mod\006effect\000common_001_structure.json";
/// `0x328D9438` = crc32("eff_000common_000common_001_sphere_001").
const COMMON_SPHERE_MODEL_ID: i32 = 848_139_320;
/// `0xAD0769F6` = crc32("eff_000common_000common_001_color_001").
const COMMON_COLOR_TEXTURE_ID: i32 = -1_392_023_050;

#[test]
fn resolves_efxbn_references_that_live_in_the_shared_common_pack() {
    if !Path::new(COMMON_REF_ROOT).is_dir() || !Path::new(COMMON_PACK_ROOT).is_dir() {
        eprintln!("SKIP: real effect fixture is unavailable: {COMMON_REF_ROOT}");
        return;
    }

    let inventory = inspect_effect_folder(COMMON_REF_ROOT, Some(COMMON_REF_STRUCTURE))
        .expect("inspect effect pack that references the shared pack");

    let common = inventory
        .common_pack
        .as_ref()
        .expect("the shared pack sits next to the opened pack and must be indexed");
    assert!(
        common.effect_root.ends_with("000common_001"),
        "unexpected shared pack root: {}",
        common.effect_root
    );
    assert!(
        common
            .models
            .iter()
            .any(|model| model.hash.signed == COMMON_SPHERE_MODEL_ID),
        "the shared pack must expose the sphere model referenced by 33.efxbn"
    );
    assert!(
        common.textures.iter().any(|texture| texture
            .hash
            .as_ref()
            .is_some_and(|hash| hash.signed == COMMON_COLOR_TEXTURE_ID)),
        "the shared pack must expose the colour map referenced by 33.efxbn"
    );

    assert!(
        inventory
            .summary
            .common_model_ids
            .iter()
            .any(|hash| hash.signed == COMMON_SPHERE_MODEL_ID),
        "a model that only exists in the shared pack must be reported as shared, not unresolved"
    );
    assert!(
        inventory
            .summary
            .common_texture_ids
            .iter()
            .any(|hash| hash.signed == COMMON_COLOR_TEXTURE_ID),
        "a texture that only exists in the shared pack must be reported as shared, not unresolved"
    );
    assert!(
        inventory
            .summary
            .unresolved_model_ids
            .iter()
            .all(|hash| hash.signed != COMMON_SPHERE_MODEL_ID),
        "shared-pack models must not be counted as unresolved"
    );
    assert!(
        inventory
            .summary
            .unresolved_texture_ids
            .iter()
            .all(|hash| hash.signed != COMMON_COLOR_TEXTURE_ID),
        "shared-pack textures must not be counted as unresolved"
    );

    assert!(
        inventory
            .warnings
            .iter()
            .any(|warning| warning.contains("000common_001")),
        "the shared-pack resolution must be stated in the warnings, not only in the summary"
    );
}

/// Indexing the shared model is not enough — the preview only draws it if the model group
/// carries a `.numdlb` that exists on disk. `33.efxbn` renders proxy geometry otherwise, which is
/// the flat disc that made a sphere-shaped effect look like a circle.
#[test]
fn the_shared_sphere_model_exposes_a_loadable_numdlb() {
    if !Path::new(COMMON_REF_ROOT).is_dir() || !Path::new(COMMON_PACK_ROOT).is_dir() {
        eprintln!("SKIP: real effect fixture is unavailable: {COMMON_REF_ROOT}");
        return;
    }

    let inventory = inspect_effect_folder(COMMON_REF_ROOT, Some(COMMON_REF_STRUCTURE))
        .expect("inspect effect pack that references the shared pack");
    let common = inventory.common_pack.as_ref().expect("shared pack indexed");
    let sphere = common
        .models
        .iter()
        .find(|model| model.hash.signed == COMMON_SPHERE_MODEL_ID)
        .expect("shared pack exposes the sphere model");

    let numdlb = sphere
        .files
        .iter()
        .find(|file| file.actual_ext == ".numdlb")
        .expect("the sphere model group carries a numdlb");
    assert!(
        !numdlb.missing && Path::new(&numdlb.path).is_file(),
        "sphere numdlb must exist on disk: {} (missing={})",
        numdlb.path,
        numdlb.missing
    );
    assert!(
        sphere
            .files
            .iter()
            .any(|file| file.actual_ext == ".numshb" && !file.missing),
        "the sphere model group must carry the mesh the preview draws"
    );

    let block_zero_model = inventory
        .efxbns
        .iter()
        .find(|item| item.path.ends_with("33.efxbn"))
        .and_then(|item| item.efxbn.as_ref())
        .map(|summary| summary.effects[0].model_id)
        .expect("33.efxbn parses and declares a model on its first block");
    assert_eq!(block_zero_model, COMMON_SPHERE_MODEL_ID);
}

/// Which face of a shipped effect mesh the winding calls "front".
///
/// The EFXBN preview is the only place in the app that culls faces — every other SSBH surface
/// draws DoubleSide — and it does so from `cullingType`, which 31.4% of model blocks set to a
/// non-zero value. If the winding convention is the opposite of WebGL's, that mapping hides
/// nearly a third of all model blocks completely, so the convention has to be measured rather
/// than assumed. A sphere is the one shape where "outward" is unambiguous.
#[test]
fn shipped_effect_meshes_wind_counter_clockwise_when_seen_from_outside() {
    const SPHERE_NUMSHB: &str = r"E:\XB\mod\006effect\000common_001\0\0\101\eff_000common_000common_001_sphere_001__maya__.numshb";
    if !Path::new(SPHERE_NUMSHB).is_file() {
        eprintln!("SKIP: real effect fixture is unavailable: {SPHERE_NUMSHB}");
        return;
    }

    let bytes = fs::read(SPHERE_NUMSHB).expect("read sphere numshb");
    let mesh = app_lib::numshb_collision::numshb_bytes_to_collision_trimesh(&bytes)
        .expect("parse sphere numshb");
    assert!(mesh.indices.len() >= 3, "sphere mesh must have triangles");

    let count = mesh.vertices.len() as f64;
    let center = mesh.vertices.iter().fold([0.0f64; 3], |mut acc, vertex| {
        acc[0] += vertex[0] / count;
        acc[1] += vertex[1] / count;
        acc[2] += vertex[2] / count;
        acc
    });

    let mut outward = 0usize;
    let mut inward = 0usize;
    for triangle in mesh.indices.chunks_exact(3) {
        let [a, b, c] = [
            mesh.vertices[triangle[0] as usize],
            mesh.vertices[triangle[1] as usize],
            mesh.vertices[triangle[2] as usize],
        ];
        let edge0 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        let edge1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let normal = [
            edge0[1] * edge1[2] - edge0[2] * edge1[1],
            edge0[2] * edge1[0] - edge0[0] * edge1[2],
            edge0[0] * edge1[1] - edge0[1] * edge1[0],
        ];
        let radial = [
            (a[0] + b[0] + c[0]) / 3.0 - center[0],
            (a[1] + b[1] + c[1]) / 3.0 - center[1],
            (a[2] + b[2] + c[2]) / 3.0 - center[2],
        ];
        let facing = normal[0] * radial[0] + normal[1] * radial[1] + normal[2] * radial[2];
        if facing > 0.0 {
            outward += 1;
        } else if facing < 0.0 {
            inward += 1;
        }
    }

    let total = outward + inward;
    assert!(total > 0, "sphere mesh produced no oriented triangles");
    // WebGL treats counter-clockwise as front-facing, and a CCW-from-outside triangle has its
    // winding normal pointing away from the centre.
    assert!(
        outward * 10 > total * 9,
        "expected the shipped sphere to wind CCW from outside so FrontSide shows its exterior, \
         got {outward} outward / {inward} inward of {total}"
    );
}

#[test]
fn inspecting_the_shared_pack_itself_indexes_no_second_copy() {
    if !Path::new(COMMON_PACK_ROOT).is_dir() {
        eprintln!("SKIP: real effect fixture is unavailable: {COMMON_PACK_ROOT}");
        return;
    }

    let inventory = inspect_effect_folder(COMMON_PACK_ROOT, Some(COMMON_PACK_STRUCTURE))
        .expect("inspect the shared pack");

    assert!(
        inventory.common_pack.is_none(),
        "the shared pack must not index itself a second time"
    );
    assert!(
        inventory
            .models
            .iter()
            .any(|model| model.hash.signed == COMMON_SPHERE_MODEL_ID),
        "the sphere model must resolve inside the shared pack's own inventory"
    );
    assert!(
        !inventory
            .warnings
            .iter()
            .any(|warning| warning.contains("is not next to")),
        "the shared pack must not warn about a missing sibling of itself"
    );
}

#[test]
fn sanitize_effect_copy_dest_file_name_rejects_path_escapes() {
    assert!(sanitize_effect_copy_dest_file_name("107.efxbn").is_ok());
    assert!(sanitize_effect_copy_dest_file_name("copied")
        .unwrap()
        .ends_with(".efxbn"));
    assert!(sanitize_effect_copy_dest_file_name("..\\evil.efxbn").is_err());
    assert!(sanitize_effect_copy_dest_file_name("../evil.efxbn").is_err());
    assert!(sanitize_effect_copy_dest_file_name("sub/107.efxbn").is_err());
}

/// The first real corpus `.efxbn` this machine can reach, or `None` when the game tree is absent.
fn first_real_efxbn() -> Option<std::path::PathBuf> {
    let mut paths = Vec::new();
    for root in [r"E:\XB\mod\006effect", r"E:\XB\解包"] {
        collect_efxbn_paths(Path::new(root), &mut paths);
    }
    paths.sort();
    paths.into_iter().next()
}

/// A real file with at least one animated control. Prefer the task fixture so the test avoids a
/// broad corpus walk on machines that have the Wing Zero Rebellion workspace.
fn first_real_multikey_efxbn() -> Option<std::path::PathBuf> {
    let preferred = Path::new(
        r"E:\XB\mod\006effect\wing_gundam_zero_rebellion_effect\0\0\30.efxbn",
    );
    if preferred.is_file() {
        let path_text = preferred.to_string_lossy();
        if app_lib::format::effect_folder::parse_efxbn_file(&path_text)
            .map(|summary| {
                summary.effects.iter().any(|effect| {
                    effect
                        .control_references
                        .iter()
                        .any(|reference| reference.selector > 1)
                })
            })
            .unwrap_or(false)
        {
            return Some(preferred.to_path_buf());
        }
    }

    let mut paths = Vec::new();
    for root in [r"E:\XB\mod\006effect", r"E:\XB\解包"] {
        collect_efxbn_paths(Path::new(root), &mut paths);
    }
    paths.sort();
    paths.into_iter().find(|path| {
        let path_text = path.to_string_lossy();
        app_lib::format::effect_folder::parse_efxbn_file(&path_text)
            .map(|summary| {
                summary.effects.iter().any(|effect| {
                    effect
                        .control_references
                        .iter()
                        .any(|reference| reference.selector > 1)
                })
            })
            .unwrap_or(false)
    })
}

/// E1: a whole-file write of an unmodified document must not change a single byte.
///
/// This is the guard that stands between "the parser missed a field" and "the first save silently
/// zeroed it". It runs against a copy in a tempdir; the game tree is asserted untouched.
#[test]
fn write_efxbn_file_round_trips_an_unmodified_document() {
    let Some(source) = first_real_efxbn() else {
        eprintln!("SKIP: no real .efxbn fixture is available");
        return;
    };
    let original = fs::read(&source).expect("read the corpus sample");
    let source_len = original.len();

    let temp = tempfile::tempdir().expect("create temporary target");
    let root = temp.path().join("effect_root");
    fs::create_dir_all(&root).expect("create effect root");
    let target = root.join("107.efxbn");
    fs::write(&target, &original).expect("stage the sample");

    let target_text = target.to_string_lossy().to_string();
    let summary = app_lib::format::effect_folder::parse_efxbn_file(&target_text)
        .expect("parse the staged sample");
    let result = app_lib::format::effect_folder::write_efxbn_file(
        &root.to_string_lossy(),
        &target_text,
        &summary,
    )
    .expect("write the unmodified document");

    assert_eq!(result.byte_len, original.len());
    assert_eq!(
        fs::read(&target).expect("read back"),
        original,
        "an unmodified document must rebuild byte for byte"
    );
    assert_eq!(result.summary.effect_count, summary.effect_count);
    assert!(
        !root.join("107.efxbn.efxbn-write-tmp").exists(),
        "the staging file must be renamed away, not left behind"
    );
    assert_eq!(
        fs::read(&source).expect("re-read the corpus sample").len(),
        source_len,
        "the read-only game tree must be untouched"
    );
}

/// E1: an edited document must change exactly the lanes the edit targeted.
///
/// Comparing bytes rather than structs is the point: a struct comparison cannot see a field the
/// parser drops, which is precisely the failure mode a whole-file writer introduces.
#[test]
fn write_efxbn_file_changes_only_the_edited_bytes() {
    let Some(source) = first_real_efxbn() else {
        eprintln!("SKIP: no real .efxbn fixture is available");
        return;
    };
    let original = fs::read(&source).expect("read the corpus sample");

    let temp = tempfile::tempdir().expect("create temporary target");
    let root = temp.path().join("effect_root");
    fs::create_dir_all(&root).expect("create effect root");
    let target = root.join("107.efxbn");
    fs::write(&target, &original).expect("stage the sample");

    let target_text = target.to_string_lossy().to_string();
    let mut summary = app_lib::format::effect_folder::parse_efxbn_file(&target_text)
        .expect("parse the staged sample");
    // `lifeTimeBase` sits at block offset 0x2C; blocks start at 0x18 with a 0x370 stride.
    summary.effects[0].life_time_base = 123.5;

    app_lib::format::effect_folder::write_efxbn_file(
        &root.to_string_lossy(),
        &target_text,
        &summary,
    )
    .expect("write the edited document");

    let rewritten = fs::read(&target).expect("read back");
    assert_eq!(rewritten.len(), original.len());
    let differing: Vec<usize> = rewritten
        .iter()
        .zip(original.iter())
        .enumerate()
        .filter(|(_, (a, b))| a != b)
        .map(|(offset, _)| offset)
        .collect();
    let expected = 0x18 + 0x2C;
    assert!(
        differing
            .iter()
            .all(|offset| (expected..expected + 4).contains(offset)),
        "only lifeTimeBase should differ, but these offsets changed: {differing:?}"
    );
    let reparsed = app_lib::format::effect_folder::parse_efxbn_file(&target_text)
        .expect("re-parse the edited file");
    assert_eq!(reparsed.effects[0].life_time_base, 123.5);
}

/// E4: selector values above one remain editable through the whole-file writer.
#[test]
fn write_efxbn_file_round_trips_a_multikey_curve_edit() {
    let Some(source) = first_real_multikey_efxbn() else {
        eprintln!("SKIP: no real multi-key .efxbn fixture is available");
        return;
    };
    let original = fs::read(&source).expect("read the corpus sample");

    let temp = tempfile::tempdir().expect("create temporary target");
    let root = temp.path().join("effect_root");
    fs::create_dir_all(&root).expect("create effect root");
    let target = root.join("multikey.efxbn");
    fs::write(&target, &original).expect("stage the sample");

    let target_text = target.to_string_lossy().to_string();
    let mut summary = app_lib::format::effect_folder::parse_efxbn_file(&target_text)
        .expect("parse the staged sample");
    let before = summary.clone();
    let (effect_index, reference_index, selector, lookup_index) = summary
        .effects
        .iter()
        .enumerate()
        .find_map(|(effect_index, effect)| {
            effect
                .control_references
                .iter()
                .enumerate()
                .find(|(_, reference)| reference.selector > 1)
                .map(|(reference_index, reference)| {
                    (
                        effect_index,
                        reference_index,
                        reference.selector,
                        reference.lookup_index,
                    )
                })
        })
        .expect("fixture contains a multi-key control");
    let edited_index = lookup_index as usize + 1;
    let original_key = summary.control_lookup_entries[edited_index].key;
    let original_value = summary.control_lookup_entries[edited_index].value;
    let edited_value: f32 = if original_value == 37.25 { 38.25 } else { 37.25 };
    summary.control_lookup_entries[edited_index].value = edited_value;
    summary.control_lookup_entries[edited_index].value_f32_bits = edited_value.to_bits();

    app_lib::format::effect_folder::write_efxbn_file(
        &root.to_string_lossy(),
        &target_text,
        &summary,
    )
    .expect("write the multi-key edit");

    let reparsed = app_lib::format::effect_folder::parse_efxbn_file(&target_text)
        .expect("re-parse the multi-key edit");
    let reference = &reparsed.effects[effect_index].control_references[reference_index];
    assert_eq!(reference.selector, selector);
    assert_eq!(reference.lookup_index, lookup_index);
    assert_eq!(reparsed.control_lookup_entries[edited_index].key, original_key);
    assert_eq!(reparsed.control_lookup_entries[edited_index].value, edited_value);
    assert_eq!(
        reparsed.control_lookup_entries[edited_index].value_f32_bits,
        edited_value.to_bits()
    );
    for (index, entry) in reparsed.control_lookup_entries.iter().enumerate() {
        if index == edited_index {
            continue;
        }
        assert_eq!(
            entry.key_f32_bits, before.control_lookup_entries[index].key_f32_bits,
            "key bits changed at lookup entry {index}"
        );
        assert_eq!(
            entry.value_f32_bits, before.control_lookup_entries[index].value_f32_bits,
            "value bits changed at lookup entry {index}"
        );
    }
    assert_eq!(
        fs::read(&source).expect("re-read the corpus sample"),
        original,
        "the source game or mod tree must remain untouched"
    );
}

/// E1: the writer refuses a target outside the inspected effect root.
#[test]
fn write_efxbn_file_refuses_a_target_outside_the_effect_root() {
    let Some(source) = first_real_efxbn() else {
        eprintln!("SKIP: no real .efxbn fixture is available");
        return;
    };
    let original = fs::read(&source).expect("read the corpus sample");

    let temp = tempfile::tempdir().expect("create temporary target");
    let root = temp.path().join("effect_root");
    let outside = temp.path().join("elsewhere");
    fs::create_dir_all(&root).expect("create effect root");
    fs::create_dir_all(&outside).expect("create the sibling directory");
    let target = outside.join("107.efxbn");
    fs::write(&target, &original).expect("stage the sample");

    let target_text = target.to_string_lossy().to_string();
    let summary = app_lib::format::effect_folder::parse_efxbn_file(&target_text)
        .expect("parse the staged sample");
    let error = app_lib::format::effect_folder::write_efxbn_file(
        &root.to_string_lossy(),
        &target_text,
        &summary,
    )
    .expect_err("a target outside the effect root must be refused");
    assert!(
        error.contains("outside the effect root"),
        "unexpected error: {error}"
    );
    assert_eq!(
        fs::read(&target).expect("read back"),
        original,
        "a refused write must not touch the file"
    );
}

/// E1: the writer edits, it does not create.
#[test]
fn write_efxbn_file_refuses_a_target_that_does_not_exist() {
    let Some(source) = first_real_efxbn() else {
        eprintln!("SKIP: no real .efxbn fixture is available");
        return;
    };
    let original = fs::read(&source).expect("read the corpus sample");

    let temp = tempfile::tempdir().expect("create temporary target");
    let root = temp.path().join("effect_root");
    fs::create_dir_all(&root).expect("create effect root");
    let existing = root.join("107.efxbn");
    fs::write(&existing, &original).expect("stage the sample");
    let summary = app_lib::format::effect_folder::parse_efxbn_file(&existing.to_string_lossy())
        .expect("parse the staged sample");

    let missing = root.join("does_not_exist.efxbn");
    let error = app_lib::format::effect_folder::write_efxbn_file(
        &root.to_string_lossy(),
        &missing.to_string_lossy(),
        &summary,
    )
    .expect_err("a missing target must be refused");
    assert!(
        error.contains("not an existing file"),
        "unexpected error: {error}"
    );
    assert!(
        !missing.exists(),
        "a refused write must not create the file"
    );
}
