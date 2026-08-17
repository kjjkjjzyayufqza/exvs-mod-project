use std::fs;
use std::path::{Path, PathBuf};

use app_lib::format::fhm2d::SubFileStructureEntry;
use app_lib::format::unit_model_models::replace_unit_model_numshb;
use serde_json::json;
use ssbh_data::hlpb_data::HlpbData;
use ssbh_data::prelude::MatlData;
use ssbh_data::prelude::{MeshData, ModlData, SkelData};

fn write_min_source(dir: &Path, base: &str) {
    ModlData {
        major_version: 1,
        minor_version: 0,
        model_name: base.to_string(),
        skeleton_file_name: format!("{base}.nusktb"),
        material_file_names: vec![format!("{base}__maya__.numatb")],
        animation_file_name: None,
        mesh_file_name: format!("{base}.numshb"),
        entries: Vec::new(),
    }
    .write_to_file(dir.join(format!("{base}.numdlb")))
    .unwrap();
    MeshData {
        major_version: 1,
        minor_version: 10,
        objects: Vec::new(),
        is_vs2: false,
    }
    .write_to_file(dir.join(format!("{base}.numshb")))
    .unwrap();
    SkelData {
        major_version: 1,
        minor_version: 0,
        bones: Vec::new(),
    }
    .write_to_file(dir.join(format!("{base}.nusktb")))
    .unwrap();
    for profile in ["maya", "nust"] {
        MatlData {
            major_version: 1,
            minor_version: 6,
            entries: Vec::new(),
        }
        .write_to_file(dir.join(format!("{base}__{profile}__.numatb")))
        .unwrap();
    }
    fs::write(dir.join(format!("{base}.jnttbl")), b"jnttbl-stub").unwrap();
}

fn write_empty_nuhlpb(path: &Path) {
    HlpbData {
        major_version: 1,
        minor_version: 1,
        aim_constraints: Vec::new(),
        orient_constraints: Vec::new(),
    }
    .write_to_file(path)
    .unwrap();
}

fn write_distinct_numshb(path: &Path, object_name: &str) {
    use ssbh_data::mesh_data::{AttributeData, MeshObjectData, VectorData};
    MeshData {
        major_version: 1,
        minor_version: 10,
        objects: vec![MeshObjectData {
            name: object_name.to_string(),
            subindex: 0,
            positions: vec![AttributeData {
                name: "Position0".to_string(),
                data: VectorData::Vector3(vec![
                    glam::Vec3::new(1.0, 0.0, 0.0),
                    glam::Vec3::new(0.0, 1.0, 0.0),
                    glam::Vec3::new(0.0, 0.0, 1.0),
                ]),
            }],
            vertex_indices: vec![0, 1, 2],
            ..Default::default()
        }],
        is_vs2: false,
    }
    .write_to_file(path)
    .unwrap();
}

fn make_item(file_index: i32, unk2: &str, unk3: i32, name: &str) -> SubFileStructureEntry {
    SubFileStructureEntry::Item {
        unk1: "00000000".to_string(),
        file_index,
        unk2: unk2.to_string(),
        unk2_1: 0,
        unk3,
        unk4: 0,
        original_file_index: file_index,
        display_name: Some(name.to_string()),
    }
}

fn make_folder(unk3: i32, unk5: i32, folder_count: i32) -> SubFileStructureEntry {
    SubFileStructureEntry::Folder {
        unk1: "00000000".to_string(),
        folder_count,
        unk2: "00000000".to_string(),
        unk2_1: 0,
        unk3,
        unk4: 0,
        unk5,
        unk6: 0,
    }
}

fn write_replace_fixture(parent: &Path) -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    let out_name = "PKG";
    let root = parent.join(out_name);
    let alpha_dir = root.join("models").join("alpha");
    let nuhlpb_dir = root.join("nuhlpb");
    fs::create_dir_all(&alpha_dir).unwrap();
    fs::create_dir_all(&nuhlpb_dir).unwrap();
    write_min_source(&alpha_dir, "alpha");
    write_empty_nuhlpb(&nuhlpb_dir.join("alpha.nuhlpb"));

    let url = |rel: &str| format!(".\\{out_name}\\{}", rel.replace('/', "\\"));
    let sub_file_data = json!([
        { "index": 0, "fileType": ".nusktb", "fileIndex": 0, "fileUrl": url("models/alpha/alpha.nusktb"), "fileBaseName": "alpha" },
        { "index": 1, "fileType": ".numshb", "fileIndex": 1, "fileUrl": url("models/alpha/alpha.numshb"), "fileBaseName": "alpha" },
        { "index": 2, "fileType": ".numdlb", "fileIndex": 2, "fileUrl": url("models/alpha/alpha.numdlb"), "fileBaseName": "alpha" },
        { "index": 3, "fileType": ".jnttbl", "fileIndex": 3, "fileUrl": url("models/alpha/alpha.jnttbl"), "fileBaseName": "alpha" },
        { "index": 4, "fileType": ".numatb", "fileIndex": 4, "fileUrl": url("models/alpha/alpha__maya__.numatb"), "fileBaseName": "alpha__maya__" },
        { "index": 5, "fileType": ".numatb", "fileIndex": 5, "fileUrl": url("models/alpha/alpha__nust__.numatb"), "fileBaseName": "alpha__nust__" },
        { "index": 6, "fileType": ".nuhlpb", "fileIndex": 6, "fileUrl": url("nuhlpb/alpha.nuhlpb"), "fileBaseName": "alpha" },
    ]);

    let structure = vec![
        make_folder(0, 0, 2),
        make_folder(0, 0, 1),
        make_folder(0, 0, 8),
        make_item(0, "10000000", 0, "alpha"),
        make_folder(32, 1, 0),
        SubFileStructureEntry::EndMark { end_mark_count: 1 },
        make_item(4, "21000000", 1, "alpha__maya__"),
        make_folder(32, 1, 0),
        SubFileStructureEntry::EndMark { end_mark_count: 1 },
        make_item(5, "21000000", 1, "alpha__nust__"),
        make_item(1, "30000000", 0, "alpha"),
        make_item(2, "40000000", 0, "alpha"),
        make_item(3, "50000000", 0, "alpha"),
        SubFileStructureEntry::EndMark { end_mark_count: 1 },
        SubFileStructureEntry::EndMark { end_mark_count: 1 },
        make_folder(0, 0, 1),
        make_item(6, "00000000", 0, "alpha"),
        SubFileStructureEntry::EndMark { end_mark_count: 1 },
        SubFileStructureEntry::EndMark { end_mark_count: 1 },
    ];

    let value = json!({
        "Magic": 10,
        "Fhm2dTotalCount": 7,
        "SubFileData": sub_file_data,
        "SubFileStructure": structure,
    });
    let structure_path = parent.join(format!("{out_name}_structure.json"));
    fs::write(
        &structure_path,
        serde_json::to_string_pretty(&value).unwrap(),
    )
    .unwrap();
    (root, structure_path, alpha_dir, nuhlpb_dir)
}

#[test]
fn replace_numshb_overwrites_target_path_and_leaves_siblings_untouched() {
    let parent = tempfile::tempdir().unwrap();
    let (root, structure_path, alpha_dir, nuhlpb_dir) = write_replace_fixture(parent.path());
    let source_dir = tempfile::tempdir().unwrap();
    let source_numshb = source_dir.path().join("foreign__maya__.numshb");
    write_distinct_numshb(&source_numshb, "Body");

    let target_numshb = alpha_dir.join("alpha.numshb");
    let sibling_paths = [
        alpha_dir.join("alpha.numdlb"),
        alpha_dir.join("alpha.nusktb"),
        alpha_dir.join("alpha.jnttbl"),
        alpha_dir.join("alpha__maya__.numatb"),
        alpha_dir.join("alpha__nust__.numatb"),
        nuhlpb_dir.join("alpha.nuhlpb"),
    ];
    let before_structure = fs::read(&structure_path).unwrap();
    let before_siblings: Vec<_> = sibling_paths
        .iter()
        .map(|path| fs::read(path).unwrap())
        .collect();
    let before_target = fs::read(&target_numshb).unwrap();
    let source_bytes = fs::read(&source_numshb).unwrap();
    assert_ne!(before_target, source_bytes);

    let result = replace_unit_model_numshb(
        root.to_string_lossy().as_ref(),
        Some(structure_path.to_string_lossy().as_ref()),
        "alpha",
        source_numshb.to_string_lossy().as_ref(),
    )
    .expect("numshb-only replace should succeed");

    assert_eq!(result.model_count, 1);
    assert_eq!(fs::read(&target_numshb).unwrap(), source_bytes);
    assert!(
        !alpha_dir.join("foreign__maya__.numshb").exists(),
        "source filename must not be copied beside the target"
    );
    assert_eq!(
        fs::read(&structure_path).unwrap(),
        before_structure,
        "_structure.json must stay byte-identical"
    );
    for (path, before) in sibling_paths.iter().zip(before_siblings) {
        assert_eq!(
            fs::read(path).unwrap(),
            before,
            "{} must stay byte-identical",
            path.display()
        );
    }
}
