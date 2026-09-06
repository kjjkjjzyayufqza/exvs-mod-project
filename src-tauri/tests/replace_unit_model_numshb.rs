use std::fs;
use std::path::{Path, PathBuf};

use app_lib::format::fhm2d::SubFileStructureEntry;
use app_lib::format::unit_model_models::{
    preview_unit_model_numshb_replacement, replace_unit_model_numshb,
};
use serde_json::json;
use ssbh_data::hlpb_data::HlpbData;
use ssbh_data::modl_data::ModlEntryData;
use ssbh_data::matl_data::MatlEntryData;
use ssbh_data::prelude::{MatlData, MeshData, ModlData, SkelData};

fn write_min_source(dir: &Path, base: &str) {
    ModlData {
        major_version: 1,
        minor_version: 0,
        model_name: base.to_string(),
        skeleton_file_name: format!("{base}.nusktb"),
        material_file_names: vec![format!("{base}__nust__.numatb")],
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

fn write_mesh_with_parent(path: &Path, object_name: &str, parent_bone_name: &str) {
    use ssbh_data::mesh_data::{AttributeData, MeshObjectData, VectorData};
    MeshData {
        major_version: 1,
        minor_version: 10,
        objects: vec![MeshObjectData {
            name: object_name.to_string(),
            subindex: 0,
            parent_bone_name: parent_bone_name.to_string(),
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

fn write_mesh_material_source(dir: &Path, base: &str, object_name: &str, parent_bone: &str) {
    write_min_source(dir, base);
    write_mesh_with_parent(&dir.join(format!("{base}.numshb")), object_name, parent_bone);
    ModlData {
        major_version: 1,
        minor_version: 0,
        model_name: base.to_string(),
        skeleton_file_name: format!("{base}.nusktb"),
        material_file_names: vec![format!("{base}__nust__.numatb")],
        animation_file_name: None,
        mesh_file_name: format!("{base}.numshb"),
        entries: vec![ModlEntryData {
            mesh_object_name: object_name.to_string(),
            mesh_object_subindex: 0,
            material_label: "NewMtl".to_string(),
        }],
    }
    .write_to_file(dir.join(format!("{base}.numdlb")))
    .unwrap();
}

#[test]
fn replace_numshb_overwrites_mesh_materials_and_leaves_skeleton_untouched() {
    let parent = tempfile::tempdir().unwrap();
    let (root, structure_path, alpha_dir, nuhlpb_dir) = write_replace_fixture(parent.path());
    let source_dir = tempfile::tempdir().unwrap();
    write_mesh_material_source(source_dir.path(), "foreign", "Body", "");
    for (profile, label) in [("maya", "MayaSrc"), ("nust", "NustSrc")] {
        MatlData {
            major_version: 1,
            minor_version: 6,
            entries: vec![MatlEntryData {
                material_label: label.to_string(),
                shader_label: String::new(),
                blend_states: Vec::new(),
                floats: Vec::new(),
                float1s: Vec::new(),
                booleans: Vec::new(),
                vectors: Vec::new(),
                colors: Vec::new(),
                rasterizer_states: Vec::new(),
                samplers: Vec::new(),
                textures: Vec::new(),
                textures2: Vec::new(),
                type4_v16: Vec::new(),
                type4_v15: Vec::new(),
                uv_transforms: Vec::new(),
            }],
        }
        .write_to_file(source_dir.path().join(format!("foreign__{profile}__.numatb")))
        .unwrap();
    }

    let target_numshb = alpha_dir.join("alpha.numshb");
    let target_maya = alpha_dir.join("alpha__maya__.numatb");
    let target_nust = alpha_dir.join("alpha__nust__.numatb");
    let target_numdlb = alpha_dir.join("alpha.numdlb");
    let untouched = [
        alpha_dir.join("alpha.nusktb"),
        alpha_dir.join("alpha.jnttbl"),
        nuhlpb_dir.join("alpha.nuhlpb"),
    ];
    let before_structure = fs::read(&structure_path).unwrap();
    let before_untouched: Vec<_> = untouched
        .iter()
        .map(|path| fs::read(path).unwrap())
        .collect();
    let before_numdlb = fs::read(&target_numdlb).unwrap();
    let source_numshb = fs::read(source_dir.path().join("foreign.numshb")).unwrap();
    let source_maya = fs::read(source_dir.path().join("foreign__maya__.numatb")).unwrap();
    let source_nust = fs::read(source_dir.path().join("foreign__nust__.numatb")).unwrap();
    assert_ne!(fs::read(&target_numshb).unwrap(), source_numshb);
    assert_ne!(fs::read(&target_maya).unwrap(), source_maya);
    assert_ne!(fs::read(&target_nust).unwrap(), source_nust);

    let result = replace_unit_model_numshb(
        root.to_string_lossy().as_ref(),
        Some(structure_path.to_string_lossy().as_ref()),
        "alpha",
        source_dir.path().to_string_lossy().as_ref(),
    )
    .expect("mesh-and-material replace should succeed");

    assert_eq!(result.model_count, 1);
    assert_eq!(fs::read(&target_numshb).unwrap(), source_numshb);
    assert_eq!(fs::read(&target_maya).unwrap(), source_maya);
    assert_eq!(fs::read(&target_nust).unwrap(), source_nust);
    assert_ne!(fs::read(&target_numdlb).unwrap(), before_numdlb);
    assert!(
        !alpha_dir.join("foreign.numshb").exists(),
        "source filename must not be copied beside the target"
    );
    assert_eq!(
        fs::read(&structure_path).unwrap(),
        before_structure,
        "_structure.json must stay byte-identical"
    );
    for (path, before) in untouched.iter().zip(before_untouched) {
        assert_eq!(
            fs::read(path).unwrap(),
            before,
            "{} must stay byte-identical",
            path.display()
        );
    }
}

fn write_triangle_object(name: &str, subindex: u64) -> ssbh_data::mesh_data::MeshObjectData {
    use ssbh_data::mesh_data::{AttributeData, MeshObjectData, VectorData};
    MeshObjectData {
        name: name.to_string(),
        subindex,
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
    }
}

#[test]
fn replace_numshb_grafts_source_entries_onto_target_numdlb_envelope() {
    let parent = tempfile::tempdir().unwrap();
    let (root, structure_path, alpha_dir, _) = write_replace_fixture(parent.path());
    ModlData {
        major_version: 1,
        minor_version: 7,
        model_name: "alpha".to_string(),
        skeleton_file_name: "nusubf/alpha__maya__.nusktb".to_string(),
        material_file_names: vec![
            "nusubf/alpha__maya__.numatb".to_string(),
            "./nusubf/alpha__nust__.numatb".to_string(),
        ],
        animation_file_name: Some("nusubf/alpha__maya__.nuanmb".to_string()),
        mesh_file_name: "nusubf/alpha__maya__.numshb".to_string(),
        entries: vec![ModlEntryData {
            mesh_object_name: "SHAPE_ROOTShape".to_string(),
            mesh_object_subindex: 1,
            material_label: "oldMtl".to_string(),
        }],
    }
    .write_to_file(alpha_dir.join("alpha.numdlb"))
    .unwrap();

    let source_dir = tempfile::tempdir().unwrap();
    write_min_source(source_dir.path(), "body");
    MeshData {
        major_version: 1,
        minor_version: 8,
        objects: vec![
            write_triangle_object("SHAPE_ROOTShape", 0),
            write_triangle_object("SHAPE_ROOTShape__sub1", 0),
        ],
        is_vs2: true,
    }
    .write_to_file(source_dir.path().join("body.numshb"))
    .unwrap();
    ModlData {
        major_version: 1,
        minor_version: 0,
        model_name: "body".to_string(),
        skeleton_file_name: "body.nusktb".to_string(),
        material_file_names: vec!["body__nust__.numatb".to_string()],
        animation_file_name: None,
        mesh_file_name: "body.numshb".to_string(),
        entries: vec![
            ModlEntryData {
                mesh_object_name: "SHAPE_ROOTShape".to_string(),
                mesh_object_subindex: 0,
                material_label: "emiMtl".to_string(),
            },
            ModlEntryData {
                mesh_object_name: "SHAPE_ROOTShape__sub1".to_string(),
                mesh_object_subindex: 0,
                material_label: "pbr1Mtl".to_string(),
            },
        ],
    }
    .write_to_file(source_dir.path().join("body.numdlb"))
    .unwrap();

    let preview = preview_unit_model_numshb_replacement(
        root.to_string_lossy().as_ref(),
        Some(structure_path.to_string_lossy().as_ref()),
        "alpha",
        source_dir.path().to_string_lossy().as_ref(),
    )
    .expect("preview should succeed");
    assert!(preview.blockers.is_empty(), "{:?}", preview.blockers);
    assert_eq!(preview.mesh_objects.kept.len(), 1);

    replace_unit_model_numshb(
        root.to_string_lossy().as_ref(),
        Some(structure_path.to_string_lossy().as_ref()),
        "alpha",
        source_dir.path().to_string_lossy().as_ref(),
    )
    .expect("mesh-and-material replace should succeed");

    let modl = ModlData::from_file(alpha_dir.join("alpha.numdlb")).expect("read grafted numdlb");
    assert_eq!(modl.major_version, 1);
    assert_eq!(modl.minor_version, 7);
    assert_eq!(modl.model_name, "alpha");
    assert_eq!(modl.skeleton_file_name, "nusubf/alpha__maya__.nusktb");
    assert_eq!(modl.mesh_file_name, "nusubf/alpha__maya__.numshb");
    assert_eq!(
        modl.material_file_names,
        vec![
            "nusubf/alpha__maya__.numatb".to_string(),
            "./nusubf/alpha__nust__.numatb".to_string(),
        ]
    );
    assert_eq!(
        modl.animation_file_name.as_deref(),
        Some("nusubf/alpha__maya__.nuanmb")
    );
    assert_eq!(modl.entries[0].mesh_object_name, "SHAPE_ROOTShape");
    assert_eq!(modl.entries[0].mesh_object_subindex, 0);
    assert_eq!(modl.entries[0].material_label, "emiMtl");
    assert_eq!(modl.entries[1].mesh_object_name, "SHAPE_ROOTShape__sub1");
    assert_eq!(modl.entries[1].mesh_object_subindex, 0);
    assert_eq!(modl.entries[1].material_label, "pbr1Mtl");
}

#[test]
fn preview_missing_bone_names_are_warnings_not_blockers() {
    let parent = tempfile::tempdir().unwrap();
    let (root, structure_path, _, _) = write_replace_fixture(parent.path());
    let source_dir = tempfile::tempdir().unwrap();
    write_mesh_material_source(source_dir.path(), "foreign", "Body", "MissingBone");

    let preview = preview_unit_model_numshb_replacement(
        root.to_string_lossy().as_ref(),
        Some(structure_path.to_string_lossy().as_ref()),
        "alpha",
        source_dir.path().to_string_lossy().as_ref(),
    )
    .expect("preview should succeed");

    assert!(preview.blockers.is_empty(), "{:?}", preview.blockers);
    assert_eq!(preview.skeleton.missing_in_target_skeleton, ["MissingBone"]);
    assert!(
        preview
            .warnings
            .iter()
            .any(|warning| warning.contains("skin bone name")),
        "{:?}",
        preview.warnings
    );
}
