use std::collections::HashMap;
use std::io::Cursor;

use app_lib::exvs2_json_cli::{
    edit_bytes, inspect_bytes, EditBytesOptions, InspectOptions, InspectType,
};
use app_lib::format::bulletparam::{
    build_bulletparam, parse_bulletparam, BulletParamData, BulletParamEntry,
};
use app_lib::format::param_bin_format::{ParamBinaryHeader, ParamFieldSpec, PARAM_BIN_MAGIC};
use glam::{Mat4, Vec3};
use serde_json::json;
use ssbh_data::mesh_data::{AttributeData, MeshData, MeshObjectData, VectorData};
use ssbh_data::modl_data::{ModlData, ModlEntryData};
use ssbh_data::prelude::SsbhData;
use ssbh_data::skel_data::{BillboardType, BoneData, SkelData};

fn write_ssbh_fixture<T: SsbhData>(value: &T) -> Vec<u8> {
    let mut cursor = Cursor::new(Vec::new());
    value.write(&mut cursor).expect("write ssbh fixture");
    cursor.into_inner()
}

fn identity_transform() -> Mat4 {
    Mat4::IDENTITY
}

fn sample_nusktb_bytes() -> Vec<u8> {
    write_ssbh_fixture(&SkelData {
        major_version: 1,
        minor_version: 0,
        bones: vec![
            BoneData {
                name: "Root".to_string(),
                transform: identity_transform(),
                parent_index: None,
                billboard_type: BillboardType::Disabled,
            },
            BoneData {
                name: "Child".to_string(),
                transform: identity_transform(),
                parent_index: Some(0),
                billboard_type: BillboardType::Disabled,
            },
        ],
    })
}

fn sample_numdlb_bytes() -> Vec<u8> {
    write_ssbh_fixture(&ModlData {
        major_version: 1,
        minor_version: 7,
        model_name: "test_model".to_string(),
        skeleton_file_name: "test.nusktb".to_string(),
        material_file_names: vec!["test.numatb".to_string()],
        animation_file_name: None,
        mesh_file_name: "test.numshb".to_string(),
        entries: vec![ModlEntryData {
            mesh_object_name: "body".to_string(),
            mesh_object_subindex: 0,
            material_label: "Mat1".to_string(),
        }],
    })
}

fn sample_numshb_bytes() -> Vec<u8> {
    write_ssbh_fixture(&MeshData {
        major_version: 1,
        minor_version: 8,
        is_vs2: true,
        objects: vec![MeshObjectData {
            name: "body".to_string(),
            subindex: 0,
            positions: vec![AttributeData {
                name: "Position0".to_string(),
                data: VectorData::Vector3(vec![
                    Vec3::new(0.0, 0.0, 0.0),
                    Vec3::new(1.0, 0.0, 0.0),
                    Vec3::new(0.0, 1.0, 0.0),
                ]),
            }],
            vertex_indices: vec![0, 1, 2],
            ..Default::default()
        }],
    })
}

fn jnttbl_fixture_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"JNTT");
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&2u32.to_le_bytes());
    bytes.extend_from_slice(&0x19Di32.to_le_bytes());
    bytes.extend_from_slice(&0x3796_12F3u32.to_le_bytes());
    bytes.extend_from_slice(&2u32.to_le_bytes());
    bytes.extend_from_slice(&0x3796_12F3u32.to_le_bytes());
    bytes.extend_from_slice(&7u32.to_le_bytes());
    bytes
}

fn character_id_table_fixture_bytes() -> Vec<u8> {
    let rows: [(i32, [i32; 6]); 1] = [(
        100501,
        [
            0x46DE_9B9Cu32 as i32,
            0x1111_2222,
            0x3333_4444,
            0x5555_6666,
            0x7777_8888u32 as i32,
            0,
        ],
    )];
    let mut bytes = vec![0u8; 0x20 + rows.len() * 4 + rows.len() * 0x18];
    let file_size = bytes.len() as u32;
    bytes[0..4].copy_from_slice(&[0xA9, 0xB8, 0xAB, 0xCE]);
    bytes[0x8..0xC].copy_from_slice(&file_size.to_le_bytes());
    bytes[0x10..0x14].copy_from_slice(&(rows.len() as u32).to_le_bytes());
    bytes[0x14..0x18].copy_from_slice(&0x18u32.to_le_bytes());

    let ids_start = 0x20;
    let data_start = ids_start + rows.len() * 4;
    for (index, (character_id, values)) in rows.iter().enumerate() {
        bytes[ids_start + index * 4..ids_start + index * 4 + 4]
            .copy_from_slice(&character_id.to_le_bytes());
        let entry_offset = data_start + index * 0x18;
        for (field_index, value) in values.iter().enumerate() {
            let offset = entry_offset + field_index * 4;
            bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
    }
    bytes
}

fn bulletparam_fixture_bytes() -> Vec<u8> {
    let initial_angle_hash = 0x0594_D6D4;
    let mut commands = HashMap::new();
    commands.insert(initial_angle_hash, f32::to_bits(1.0));
    build_bulletparam(&BulletParamData {
        header: ParamBinaryHeader {
            magic: PARAM_BIN_MAGIC,
            unk_04: 0,
            file_size: 0,
            unk_0c: 0,
            entry_count: 1,
            commands_count: 1,
            entry_size: 4,
            unk_1c: 0,
        },
        field_specs: vec![ParamFieldSpec {
            hash: initial_angle_hash,
            entry_offset: 0,
            flags: 0,
            kind: 5,
        }],
        entry_ids: vec![10],
        entries: vec![BulletParamEntry {
            entry_id: 10,
            commands,
        }],
        trailing_data: Vec::new(),
        source_entries_raw: Vec::new(),
    })
    .expect("build bulletparam fixture")
}

#[test]
fn inspect_jnttbl_emits_hash_metadata_and_duplicate_warnings() {
    let report = inspect_bytes(
        r"E:\fixture\test.jnttbl",
        &jnttbl_fixture_bytes(),
        InspectOptions {
            inspect_type: Some(InspectType::Jnttbl),
            pretty: false,
            summary: false,
            raw_fields: false,
            roundtrip_check: true,
        },
    )
    .expect("JNTT fixture should parse");

    assert_eq!(report["tool"], "exvs2-json");
    assert_eq!(report["schemaVersion"], 1);
    assert_eq!(report["detectedType"], "jnttbl");
    assert_eq!(report["endianness"]["hashMatching"], "little-endian");
    assert_eq!(report["data"]["bones"][0]["boneHash"]["hex"], "0x379612F3");
    assert_eq!(
        report["data"]["bones"][0]["boneHash"]["rawLeBytes"],
        "F3 12 96 37"
    );
    assert_eq!(report["data"]["bones"][0]["idaBytePattern"], "F3 12 96 37");
    assert_eq!(
        report["data"]["bones"][0]["rawLeBytes"],
        "F3 12 96 37 02 00 00 00"
    );
    assert_eq!(report["data"]["roundtripCheck"]["byteIdentical"], true);

    let warnings = report["warnings"]
        .as_array()
        .expect("warnings should be an array");
    assert!(
        warnings.iter().any(|warning| warning
            .as_str()
            .unwrap_or_default()
            .contains("duplicate bone hash 0x379612F3")),
        "duplicate bone hashes should be surfaced for AI analysis"
    );
}

#[test]
fn inspect_character_id_table_emits_all_resource_columns() {
    let report = inspect_bytes(
        r"E:\fixture\character_id_table.bin",
        &character_id_table_fixture_bytes(),
        InspectOptions {
            inspect_type: None,
            pretty: false,
            summary: false,
            raw_fields: false,
            roundtrip_check: false,
        },
    )
    .expect("character_id_table fixture should parse");

    assert_eq!(report["detectedType"], "character_id_table");
    assert_eq!(report["data"]["header"]["entrySize"], 24);
    assert_eq!(report["data"]["rows"][0]["characterId"], 100501);
    assert_eq!(report["data"]["rows"][0]["model"]["hex"], "0x46DE9B9C");
    assert_eq!(
        report["data"]["rows"][0]["model"]["rawLeBytes"],
        "9C 9B DE 46"
    );
    assert_eq!(report["data"]["rows"][0]["effect"]["hex"], "0x11112222");
    assert_eq!(report["data"]["rows"][0]["motion"]["value"], 0);
}

#[test]
fn inspect_unknown_file_type_returns_actionable_error() {
    let err = inspect_bytes(
        r"E:\fixture\unknown.bin",
        &[0, 1, 2, 3],
        InspectOptions::default(),
    )
    .expect_err("unknown binary should require an explicit type");

    assert!(err.contains("--type"));
    assert!(err.contains("jnttbl"));
    assert!(err.contains("vernier-table"));
    assert!(err.contains("nusktb"));
}

#[test]
fn inspect_nusktb_auto_detects_and_summarizes_bones() {
    let report = inspect_bytes(
        r"E:\fixture\test.nusktb",
        &sample_nusktb_bytes(),
        InspectOptions {
            inspect_type: None,
            pretty: false,
            summary: true,
            raw_fields: false,
            roundtrip_check: true,
        },
    )
    .expect("nusktb fixture should parse");

    assert_eq!(report["detectedType"], "nusktb");
    assert_eq!(report["data"]["boneCount"], 2);
    assert_eq!(report["data"]["boneNames"][0], "Root");
    assert_eq!(report["data"]["bones"][1]["parentIndex"], 0);
    assert!(
        report["data"]["roundtripCheck"]["rebuiltByteLength"]
            .as_u64()
            .unwrap()
            > 0
    );
}

#[test]
fn inspect_numdlb_emits_model_links() {
    let report = inspect_bytes(
        r"E:\fixture\test.numdlb",
        &sample_numdlb_bytes(),
        InspectOptions {
            inspect_type: None,
            pretty: false,
            summary: true,
            raw_fields: false,
            roundtrip_check: false,
        },
    )
    .expect("numdlb fixture should parse");

    assert_eq!(report["detectedType"], "numdlb");
    assert_eq!(report["data"]["modelName"], "test_model");
    assert_eq!(report["data"]["skeletonFileName"], "test.nusktb");
    assert_eq!(report["data"]["entries"][0]["materialLabel"], "Mat1");
}

#[test]
fn inspect_numshb_emits_object_stats_without_raw_fields() {
    let report = inspect_bytes(
        r"E:\fixture\test.numshb",
        &sample_numshb_bytes(),
        InspectOptions {
            inspect_type: None,
            pretty: false,
            summary: false,
            raw_fields: false,
            roundtrip_check: false,
        },
    )
    .expect("numshb fixture should parse");

    assert_eq!(report["detectedType"], "numshb");
    assert_eq!(report["data"]["objectCount"], 1);
    assert_eq!(report["data"]["objects"][0]["vertexCount"], 3);
    assert_eq!(report["data"]["objects"][0]["indexCount"], 3);
    assert!(report["data"]["objects"][0]["attributeNames"]
        .as_array()
        .unwrap()
        .iter()
        .any(|name| name == "Position0"));
}

#[test]
fn edit_jnttbl_adds_entry_from_json_request() {
    let request = json!({
        "type": "jnttbl",
        "operations": [
            {
                "op": "addJnttblEntry",
                "boneHash": "0x11112222",
                "boneIndex": 9
            }
        ]
    });

    let outcome = edit_bytes(
        r"E:\fixture\test.jnttbl",
        &jnttbl_fixture_bytes(),
        &request,
        EditBytesOptions {
            inspect_type: Some(InspectType::Jnttbl),
            output_path: Some(r"E:\fixture\test.edited.jnttbl".to_string()),
            dry_run: true,
        },
    )
    .expect("JNTT edit should apply");

    assert_eq!(outcome.report["reportType"], "edit");
    assert_eq!(outcome.report["detectedType"], "jnttbl");
    assert_eq!(outcome.report["operationCount"], 1);

    let report = inspect_bytes(
        r"E:\fixture\test.edited.jnttbl",
        &outcome.bytes,
        InspectOptions {
            inspect_type: Some(InspectType::Jnttbl),
            pretty: false,
            summary: false,
            raw_fields: false,
            roundtrip_check: false,
        },
    )
    .expect("edited JNTT should parse");
    assert_eq!(report["data"]["bones"][2]["boneHash"]["hex"], "0x11112222");
    assert_eq!(report["data"]["bones"][2]["boneIndex"], 9);
}

#[test]
fn edit_character_id_table_sets_resource_column() {
    let request = json!({
        "type": "character-id-table",
        "operations": [
            {
                "op": "setCharacterResource",
                "characterId": 100501,
                "column": "model",
                "value": "0x01020304"
            }
        ]
    });

    let outcome = edit_bytes(
        r"E:\fixture\character_id_table.bin",
        &character_id_table_fixture_bytes(),
        &request,
        EditBytesOptions {
            inspect_type: Some(InspectType::CharacterIdTable),
            output_path: None,
            dry_run: true,
        },
    )
    .expect("character table edit should apply");

    let report = inspect_bytes(
        r"E:\fixture\character_id_table.edited.bin",
        &outcome.bytes,
        InspectOptions {
            inspect_type: Some(InspectType::CharacterIdTable),
            pretty: false,
            summary: false,
            raw_fields: false,
            roundtrip_check: false,
        },
    )
    .expect("edited character table should parse");
    assert_eq!(report["data"]["rows"][0]["model"]["hex"], "0x01020304");
}

#[test]
fn edit_bulletparam_sets_named_f32_field() {
    let request = json!({
        "type": "bulletparam",
        "operations": [
            {
                "op": "setParamField",
                "entryId": 10,
                "field": "initialAngle",
                "value": 2.5
            }
        ]
    });

    let outcome = edit_bytes(
        r"E:\fixture\bulletparam.bin",
        &bulletparam_fixture_bytes(),
        &request,
        EditBytesOptions {
            inspect_type: Some(InspectType::BulletParam),
            output_path: None,
            dry_run: true,
        },
    )
    .expect("bulletparam edit should apply");

    let parsed = parse_bulletparam(&outcome.bytes).expect("edited bulletparam should parse");
    let raw = parsed.entries[0]
        .commands
        .get(&0x0594_D6D4)
        .copied()
        .expect("initialAngle command");
    assert!((f32::from_bits(raw) - 2.5).abs() < f32::EPSILON);
    assert_eq!(outcome.report["operationsApplied"][0]["after"], 2.5);
}
