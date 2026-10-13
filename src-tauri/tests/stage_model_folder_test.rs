//! Stage model folders must pack the way `ModelDataSet::SetupNewFormat` loads
//! them: an extracted `<index>.bin` joint table is item type 0x50, files the
//! game cannot load block packing, and a structure JSON holding a type-0 model
//! item is rebuilt instead of preserved.

use std::fs;
use std::path::{Path, PathBuf};

use app_lib::format::fhm2d::SubFileStructureEntry;
use app_lib::format::fhm2d_stage::{
    rebuild_structure_json_for_stage, rebuild_structure_json_for_stage_forced,
};
use app_lib::format::fhm2d_stage_validate::exvs_stage_validate_preflight;

const PACK_NAME: &str = "0x0000ABCD";
const MATERIAL_MODEL_SHAPE: [&str; 8] = ["10", "F32", "21", "F32", "21", "30", "40", "50"];
const SIMPLE_MODEL_SHAPE: [&str; 4] = ["10", "30", "40", "50"];

fn write_files(dir: &Path, files: &[(&str, &[u8])]) {
    fs::create_dir_all(dir).unwrap();
    for (name, data) in files {
        fs::write(dir.join(name), data).unwrap();
    }
}

/// A material model laid out like a vanilla extraction: the joint table is `812.bin`.
fn write_extracted_prop(pack_root: &Path) -> PathBuf {
    let dir = pack_root.join("0").join("0").join("prop").join("0");
    write_files(
        &dir,
        &[
            ("prop__maya__.nusktb", b"skel"),
            ("prop__maya__.numatb", b"matl"),
            ("prop__nust__.numatb", b"matl"),
            ("prop__maya__.numshb", b"mesh"),
            ("prop.numdlb", b"modl"),
            ("812.bin", b""),
        ],
    );
    dir
}

/// A material-less model like vanilla `0/1/*`: skeleton, mesh, model, joint table.
fn write_extracted_simple_model(pack_root: &Path) -> PathBuf {
    let dir = pack_root.join("0").join("1").join("0");
    write_files(
        &dir,
        &[
            ("493.nusktb", b"skel"),
            ("695.numshb", b"mesh"),
            ("765.numdlb", b"modl"),
            ("860.bin", b""),
        ],
    );
    dir
}

fn read_structure(path: &str) -> (Vec<String>, Vec<SubFileStructureEntry>) {
    let value: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    let urls = value["SubFileData"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["fileUrl"].as_str().unwrap().replace('\\', "/"))
        .collect();
    let entries = serde_json::from_value(value["SubFileStructure"].clone()).unwrap();
    (urls, entries)
}

/// Direct child types of every model folder, as `10`/`F32`/... with the item file names.
fn model_folder_shapes(
    entries: &[SubFileStructureEntry],
    urls: &[String],
) -> Vec<Vec<(String, String)>> {
    let mut frames: Vec<Vec<(String, String)>> = vec![Vec::new()];
    let mut shapes = Vec::new();
    for entry in entries {
        match entry {
            SubFileStructureEntry::Folder { unk3, .. } => {
                frames
                    .last_mut()
                    .unwrap()
                    .push((format!("F{unk3}"), String::new()));
                frames.push(Vec::new());
            }
            SubFileStructureEntry::Item {
                file_index, unk2, ..
            } => {
                let name = urls[*file_index as usize]
                    .rsplit('/')
                    .next()
                    .unwrap()
                    .to_string();
                frames
                    .last_mut()
                    .unwrap()
                    .push((unk2[..2].to_string(), name));
            }
            SubFileStructureEntry::EndMark { end_mark_count } => {
                for _ in 0..*end_mark_count {
                    let frame = frames.pop().unwrap();
                    if frame.iter().any(|(kind, _)| kind == "40") {
                        shapes.push(frame);
                    }
                }
            }
        }
    }
    shapes
}

fn kinds(shape: &[(String, String)]) -> Vec<&str> {
    shape.iter().map(|(kind, _)| kind.as_str()).collect()
}

fn model_folder_errors(pack_root: &Path) -> Vec<String> {
    exvs_stage_validate_preflight(&pack_root.to_string_lossy())
        .errors
        .into_iter()
        .filter(|error| error.phase == "model_folder")
        .map(|error| error.message)
        .collect()
}

/// Optional: `STAGE_MODEL_FOLDER_VANILLA` names an extracted vanilla OB stage
/// pack root (`fhm2d_extract --layout folder` output); vanilla must pass.
#[test]
fn extracted_vanilla_stage_has_no_model_folder_problems() {
    let Ok(pack_root) = std::env::var("STAGE_MODEL_FOLDER_VANILLA") else {
        return;
    };
    let errors = model_folder_errors(Path::new(&pack_root));
    assert!(errors.is_empty(), "{}", errors.join("\n"));
}

#[test]
fn extracted_joint_table_bin_packs_as_type_0x50_like_vanilla() {
    let temp = tempfile::tempdir().unwrap();
    let pack_root = temp.path().join(PACK_NAME);
    let prop = write_extracted_prop(&pack_root);
    write_extracted_simple_model(&pack_root);

    assert!(model_folder_errors(&pack_root).is_empty());
    let structure = rebuild_structure_json_for_stage_forced(&pack_root.to_string_lossy()).unwrap();

    let (urls, entries) = read_structure(&structure);
    let shapes = model_folder_shapes(&entries, &urls);
    assert_eq!(shapes.len(), 2);
    assert_eq!(kinds(&shapes[0]), MATERIAL_MODEL_SHAPE);
    assert_eq!(shapes[0][7].1, "812.bin");
    assert_eq!(kinds(&shapes[1]), SIMPLE_MODEL_SHAPE);
    assert_eq!(shapes[1][3].1, "860.bin");
    assert!(
        !prop.join("prop.jnttbl").exists(),
        "an extracted joint table must not get a duplicate .jnttbl"
    );
}

#[test]
fn duplicate_joint_tables_block_packing_with_a_clear_message() {
    let temp = tempfile::tempdir().unwrap();
    let pack_root = temp.path().join(PACK_NAME);
    let prop = write_extracted_prop(&pack_root);
    fs::write(prop.join("prop.jnttbl"), b"").unwrap();

    let errors = model_folder_errors(&pack_root);
    assert_eq!(errors.len(), 1, "{errors:?}");
    assert!(
        errors[0].contains("2 joint tables: 812.bin, prop.jnttbl"),
        "{}",
        errors[0]
    );

    let err = rebuild_structure_json_for_stage_forced(&pack_root.to_string_lossy()).unwrap_err();
    assert!(err.contains("2 joint tables"), "{err}");
}

#[test]
fn files_the_game_cannot_load_in_a_model_folder_are_reported() {
    let temp = tempfile::tempdir().unwrap();
    let pack_root = temp.path().join(PACK_NAME);
    let prop = write_extracted_prop(&pack_root);
    fs::write(prop.join("border_hit.hkt"), b"hkt").unwrap();
    fs::write(prop.join("900.bin"), b"not an animation").unwrap();

    let errors = model_folder_errors(&pack_root);
    assert_eq!(errors.len(), 2, "{errors:?}");
    assert!(errors
        .iter()
        .any(|e| e.contains("'900.bin'") && e.contains("item type 0")));
    assert!(errors.iter().any(|e| e.contains("'border_hit.hkt'")));
    assert!(rebuild_structure_json_for_stage_forced(&pack_root.to_string_lossy()).is_err());
}

#[test]
fn joint_table_with_data_is_reported() {
    let temp = tempfile::tempdir().unwrap();
    let pack_root = temp.path().join(PACK_NAME);
    let prop = write_extracted_prop(&pack_root);
    fs::remove_file(prop.join("812.bin")).unwrap();
    fs::write(prop.join("prop.jnttbl"), b"joint data").unwrap();

    let errors = model_folder_errors(&pack_root);
    assert_eq!(errors.len(), 1, "{errors:?}");
    assert!(
        errors[0].contains("'prop.jnttbl' is 10 bytes"),
        "{}",
        errors[0]
    );
}

#[test]
fn model_without_skeleton_is_reported() {
    let temp = tempfile::tempdir().unwrap();
    let pack_root = temp.path().join(PACK_NAME);
    let prop = write_extracted_prop(&pack_root);
    fs::remove_file(prop.join("prop__maya__.nusktb")).unwrap();

    let errors = model_folder_errors(&pack_root);
    assert_eq!(errors.len(), 1, "{errors:?}");
    assert!(
        errors[0].contains("exactly one skeleton (.nusktb), found 0"),
        "{}",
        errors[0]
    );
}

#[test]
fn missing_joint_table_is_created_empty() {
    let temp = tempfile::tempdir().unwrap();
    let pack_root = temp.path().join(PACK_NAME);
    let prop = write_extracted_prop(&pack_root);
    fs::remove_file(prop.join("812.bin")).unwrap();

    assert!(model_folder_errors(&pack_root).is_empty());
    let structure = rebuild_structure_json_for_stage_forced(&pack_root.to_string_lossy()).unwrap();

    let (urls, entries) = read_structure(&structure);
    let shapes = model_folder_shapes(&entries, &urls);
    assert_eq!(kinds(&shapes[0]), MATERIAL_MODEL_SHAPE);
    assert_eq!(shapes[0][7].1, "prop.jnttbl");
    assert_eq!(fs::metadata(prop.join("prop.jnttbl")).unwrap().len(), 0);
}

/// Write `<pack>_structure.json` for the extracted prop, tagging `812.bin` with
/// `joint_table_unk2`. The model folder sits in a wrapper folder and both close
/// with one EndMark(2), like `info/` + `post_effect/` in vanilla packs.
fn write_prop_structure(temp: &Path, joint_table_unk2: &str) -> PathBuf {
    let names = [
        ("prop__maya__.nusktb", "10000000"),
        ("prop__maya__.numatb", "21000000"),
        ("prop__nust__.numatb", "21000000"),
        ("prop__maya__.numshb", "30000000"),
        ("prop.numdlb", "40000000"),
        ("812.bin", joint_table_unk2),
    ];
    let sub_file_data: Vec<serde_json::Value> = names
        .iter()
        .enumerate()
        .map(|(i, (name, _))| {
            serde_json::json!({
                "index": i,
                "fileType": ".bin",
                "fileIndex": i,
                "fileUrl": format!(".\\{PACK_NAME}\\0\\0\\prop\\0\\{name}"),
                "fileBaseName": name,
            })
        })
        .collect();
    let mut structure = vec![
        serde_json::json!({"type": "Folder", "folderCount": 1, "unk2": "00000000", "unk3": 0}),
        serde_json::json!({"type": "Folder", "folderCount": 6, "unk2": "00000000", "unk3": 0}),
    ];
    for (i, (_, unk2)) in names.iter().enumerate() {
        structure.push(serde_json::json!({"type": "Item", "fileIndex": i, "unk2": unk2}));
    }
    structure.push(serde_json::json!({"type": "EndMark", "endMarkCount": 2}));
    let original = serde_json::json!({
        "Name": PACK_NAME,
        "HashName": PACK_NAME,
        "Magic": 0,
        "Fhm2dTotalCount": names.len(),
        "UnkCount": 0,
        "SubFileData": sub_file_data,
        "SubFileStructure": structure,
    });
    let path = temp.join(format!("{PACK_NAME}_structure.json"));
    fs::write(&path, serde_json::to_string_pretty(&original).unwrap()).unwrap();
    path
}

#[test]
fn structure_with_a_type_zero_model_item_is_rebuilt_not_preserved() {
    let temp = tempfile::tempdir().unwrap();
    let pack_root = temp.path().join(PACK_NAME);
    write_extracted_prop(&pack_root);
    // The broken layout the old packer wrote: the joint table tagged as type 0.
    write_prop_structure(temp.path(), "00000000");

    let rebuilt = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();

    let (urls, entries) = read_structure(&rebuilt);
    let shapes = model_folder_shapes(&entries, &urls);
    assert_eq!(kinds(&shapes[0]), MATERIAL_MODEL_SHAPE);
    assert_eq!(shapes[0][7].1, "812.bin");
}

#[test]
fn loadable_structure_is_preserved_verbatim() {
    let temp = tempfile::tempdir().unwrap();
    let pack_root = temp.path().join(PACK_NAME);
    write_extracted_prop(&pack_root);
    let path = write_prop_structure(temp.path(), "50000000");
    let before = fs::read_to_string(&path).unwrap();

    let preserved = rebuild_structure_json_for_stage(&pack_root.to_string_lossy()).unwrap();

    assert_eq!(Path::new(&preserved), path.as_path());
    assert_eq!(fs::read_to_string(&path).unwrap(), before);
}
