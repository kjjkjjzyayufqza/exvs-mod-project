use std::collections::HashMap;
use std::io::Cursor;

use app_lib::exvs2_json_cli::{
    edit_bytes, inspect_bytes, EditBytesOptions, InspectOptions, InspectType,
};
use app_lib::format::armsparam::{build_armsparam, parse_armsparam, ArmsParamData, ArmsParamEntry};
use app_lib::format::bulletparam::{
    build_bulletparam, bulletparam_entry_from_json_value, bulletparam_entry_to_json_value,
    parse_bulletparam, BulletParamData, BulletParamEntry,
};
use app_lib::format::grapparam::parse_grapparam;
use app_lib::format::hitgroupiddef::parse_hitgroupiddef;
use app_lib::format::interactionid::parse_interactionid;
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

fn armsparam_fixture_bytes() -> Vec<u8> {
    let ammo_count_hash = 0x4961_274c;
    let entries = [0x0d7f_cde2, 0x55b0_3548, 0xfa64_e4d0]
        .into_iter()
        .map(|entry_id| ArmsParamEntry {
            entry_id,
            commands: HashMap::from([(ammo_count_hash, 1)]),
            strings: HashMap::new(),
        })
        .collect::<Vec<_>>();

    build_armsparam(&ArmsParamData {
        header: ParamBinaryHeader {
            magic: PARAM_BIN_MAGIC,
            unk_04: 0,
            file_size: 0,
            unk_0c: 0,
            entry_count: entries.len() as u32,
            commands_count: 1,
            entry_size: 4,
            unk_1c: 0,
        },
        field_specs: vec![ParamFieldSpec {
            hash: ammo_count_hash,
            entry_offset: 0,
            flags: 0,
            kind: 2,
        }],
        entry_ids: entries.iter().map(|entry| entry.entry_id).collect(),
        entries,
        trailing_data: Vec::new(),
        source_entries_raw: Vec::new(),
    })
    .expect("build armsparam fixture")
}

#[test]
fn edit_armsparam_copy_inserts_entry_id_in_unsigned_order() {
    let bytes = armsparam_fixture_bytes();
    let outcome = edit_bytes(
        r"E:\fixture\armsparam.bin",
        &bytes,
        &json!({
            "type": "armsparam",
            "operations": [{
                "op": "copyParamEntry",
                "fromEntryId": 0x55b0_3548u32,
                "newEntryId": 0x233c_4626u32
            }]
        }),
        EditBytesOptions {
            inspect_type: Some(InspectType::ArmsParam),
            output_path: None,
            dry_run: true,
        },
    )
    .expect("copy armsparam entry");
    let edited = parse_armsparam(&outcome.bytes).expect("parse copied armsparam");

    assert_eq!(
        edited.entry_ids,
        vec![0x0d7f_cde2, 0x233c_4626, 0x55b0_3548, 0xfa64_e4d0]
    );
}

#[test]
fn edit_armsparam_upsert_inserts_entry_id_in_unsigned_order() {
    let bytes = armsparam_fixture_bytes();
    let outcome = edit_bytes(
        r"E:\fixture\armsparam.bin",
        &bytes,
        &json!({
            "type": "armsparam",
            "operations": [{
                "op": "upsertParamEntry",
                "entry": {
                    "entryId": 0x233c_4626u32,
                    "ammoCount": 1
                }
            }]
        }),
        EditBytesOptions {
            inspect_type: Some(InspectType::ArmsParam),
            output_path: None,
            dry_run: true,
        },
    )
    .expect("upsert armsparam entry");
    let edited = parse_armsparam(&outcome.bytes).expect("parse upserted armsparam");

    assert_eq!(
        edited.entry_ids,
        vec![0x0d7f_cde2, 0x233c_4626, 0x55b0_3548, 0xfa64_e4d0]
    );
}

// Real hitbox-table samples (docs/hitbox-research). Mod build of custom Gyan and the
// stock Gyan package 0x49544F2B under the unpacked com/file tree.
const HITBOX_MOD_DIR: &str = r"E:\XB\mod\041cpm\001gundam_005gyan00_001_N2_rocket_mod";
const HITBOX_STOCK_DIR: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\041cpm\\0x49544F2B";

fn read_hitbox_sample(dir: &str, file_name: &str) -> (String, Vec<u8>) {
    let path = format!("{dir}\\{file_name}");
    let bytes =
        std::fs::read(&path).unwrap_or_else(|e| panic!("failed to read hitbox sample {path}: {e}"));
    (path, bytes)
}

#[test]
fn inspect_hitbox_tables_auto_detect_and_summarize() {
    for (file_name, expected_type) in [
        ("hitgroupiddef.bin", "hitgroupiddef"),
        ("interactionid.bin", "interactionid"),
        ("grapparam.bin", "grapparam"),
    ] {
        let (path, bytes) = read_hitbox_sample(HITBOX_MOD_DIR, file_name);
        let report = inspect_bytes(
            &path,
            &bytes,
            InspectOptions {
                inspect_type: None,
                pretty: false,
                summary: true,
                raw_fields: false,
                roundtrip_check: false,
            },
        )
        .unwrap_or_else(|e| panic!("{file_name} should inspect: {e}"));

        assert_eq!(report["tool"], "exvs2-json");
        assert_eq!(report["detectedType"], expected_type);
        assert_eq!(report["data"]["fileType"], expected_type);
        assert!(
            report["data"]["entryCount"].as_u64().unwrap() > 0,
            "{file_name} summary should report entries"
        );
        assert!(
            report["data"]["fieldNotes"].is_object(),
            "{file_name} should carry schema guardrail field notes"
        );
    }
}

#[test]
fn inspect_hitbox_tables_roundtrip_is_byte_identical() {
    for dir in [HITBOX_MOD_DIR, HITBOX_STOCK_DIR] {
        for file_name in ["hitgroupiddef.bin", "interactionid.bin", "grapparam.bin"] {
            let (path, bytes) = read_hitbox_sample(dir, file_name);
            let report = inspect_bytes(
                &path,
                &bytes,
                InspectOptions {
                    inspect_type: None,
                    pretty: false,
                    summary: true,
                    raw_fields: false,
                    roundtrip_check: true,
                },
            )
            .unwrap_or_else(|e| panic!("{path} should inspect: {e}"));

            assert_eq!(
                report["data"]["roundtripCheck"]["byteIdentical"], true,
                "{path} rebuild must be byte-identical"
            );
        }
    }
}

#[test]
fn edit_hitgroupiddef_sets_sphere_radius_and_reinspects() {
    let (path, bytes) = read_hitbox_sample(HITBOX_MOD_DIR, "hitgroupiddef.bin");
    let parsed = parse_hitgroupiddef(&bytes).expect("hitgroupiddef sample should parse");
    let entry_id = parsed.entries[0].entry_id;

    let request = json!({
        "type": "hitgroupiddef",
        "operations": [
            {
                "op": "setParamField",
                "entryId": entry_id,
                "field": "sphereRadius",
                "value": 3.25
            }
        ]
    });

    let outcome = edit_bytes(
        &path,
        &bytes,
        &request,
        EditBytesOptions {
            inspect_type: None,
            output_path: None,
            dry_run: true,
        },
    )
    .expect("hitgroupiddef edit should apply");

    assert_eq!(outcome.report["reportType"], "edit");
    assert_eq!(outcome.report["detectedType"], "hitgroupiddef");
    assert_eq!(outcome.report["changed"], true);
    assert_eq!(outcome.report["operationsApplied"][0]["after"], 3.25);

    let edited = parse_hitgroupiddef(&outcome.bytes).expect("edited hitgroupiddef should parse");
    let raw = edited.entries[0]
        .commands
        .get(&0xDC8A_C901)
        .copied()
        .expect("sphere_radius command");
    assert!((f32::from_bits(raw) - 3.25).abs() < f32::EPSILON);

    let report = inspect_bytes(
        &path,
        &outcome.bytes,
        InspectOptions {
            inspect_type: Some(InspectType::HitGroupIdDef),
            pretty: false,
            summary: false,
            raw_fields: false,
            roundtrip_check: true,
        },
    )
    .expect("edited hitgroupiddef should re-inspect");
    assert_eq!(report["data"]["entries"][0]["sphereRadius"], 3.25);
    assert_eq!(report["data"]["roundtripCheck"]["byteIdentical"], true);
}

#[test]
fn edit_interactionid_sets_damage_and_grapparam_sets_startup_frame() {
    let (interaction_path, interaction_bytes) =
        read_hitbox_sample(HITBOX_MOD_DIR, "interactionid.bin");
    let interaction = parse_interactionid(&interaction_bytes).expect("interactionid parse");
    let interaction_entry_id = interaction.entries[0].entry_id;

    let outcome = edit_bytes(
        &interaction_path,
        &interaction_bytes,
        &json!({
            "type": "interactionid",
            "operations": [
                { "op": "setParamField", "entryId": interaction_entry_id, "field": "damage", "value": 123 }
            ]
        }),
        EditBytesOptions {
            inspect_type: None,
            output_path: None,
            dry_run: true,
        },
    )
    .expect("interactionid edit should apply");
    assert_eq!(outcome.report["detectedType"], "interactionid");
    let edited = parse_interactionid(&outcome.bytes).expect("edited interactionid parse");
    assert_eq!(edited.entries[0].commands.get(&0x00C5_7BA3), Some(&123u32));

    let (grap_path, grap_bytes) = read_hitbox_sample(HITBOX_MOD_DIR, "grapparam.bin");
    let grap = parse_grapparam(&grap_bytes).expect("grapparam parse");
    let grap_entry_id = grap.entries[0].entry_id;

    let outcome = edit_bytes(
        &grap_path,
        &grap_bytes,
        &json!({
            "type": "grapparam",
            "operations": [
                { "op": "setParamField", "entryId": grap_entry_id, "field": "startupFrame", "value": 12 }
            ]
        }),
        EditBytesOptions {
            inspect_type: None,
            output_path: None,
            dry_run: true,
        },
    )
    .expect("grapparam edit should apply");
    assert_eq!(outcome.report["detectedType"], "grapparam");
    let edited = parse_grapparam(&outcome.bytes).expect("edited grapparam parse");
    assert_eq!(edited.entries[0].commands.get(&0x550B_CFAD), Some(&12u32));
}

#[test]
fn edit_hitgroupiddef_rejects_legacy_field_name_and_unknown_entry() {
    let (path, bytes) = read_hitbox_sample(HITBOX_MOD_DIR, "hitgroupiddef.bin");
    let parsed = parse_hitgroupiddef(&bytes).expect("hitgroupiddef sample should parse");
    let entry_id = parsed.entries[0].entry_id;

    // Legacy pre-correction name "groupId" (was the radius field) must not silently resolve.
    let err = edit_bytes(
        &path,
        &bytes,
        &json!({
            "type": "hitgroupiddef",
            "operations": [
                { "op": "setParamField", "entryId": entry_id, "field": "groupId", "value": 1.0 }
            ]
        }),
        EditBytesOptions {
            inspect_type: None,
            output_path: None,
            dry_run: true,
        },
    )
    .expect_err("legacy field name should be rejected");
    assert!(err.contains("Unknown typed-param field 'groupId'"));

    let missing_entry_id = parsed
        .entries
        .iter()
        .map(|entry| entry.entry_id)
        .max()
        .unwrap()
        .wrapping_add(1000);
    let err = edit_bytes(
        &path,
        &bytes,
        &json!({
            "type": "hitgroupiddef",
            "operations": [
                { "op": "setParamField", "entryId": missing_entry_id, "field": "sphereRadius", "value": 1.0 }
            ]
        }),
        EditBytesOptions {
            inspect_type: None,
            output_path: None,
            dry_run: true,
        },
    )
    .expect_err("missing entryId should be rejected");
    assert!(err.contains("was not found"));
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

#[test]
fn bulletparam_serializes_bullet_size_and_accepts_initial_speed_alias() {
    let legacy = json!({
        "entryId": 1,
        "initialSpeed": 12.5
    });
    let entry = bulletparam_entry_from_json_value(&legacy).expect("parse legacy alias");
    let raw = *entry.commands.get(&0xAB606D9E).expect("bullet_size hash");
    assert!((f32::from_bits(raw) - 12.5).abs() < 1e-5);

    let canonical = bulletparam_entry_to_json_value(&entry);
    assert!(canonical.get("initialSpeed").is_none());
    let size = canonical
        .get("bulletSize")
        .and_then(|v| v.as_f64())
        .expect("canonical bulletSize");
    assert!((size - 12.5).abs() < 1e-5);

    let both = json!({
        "entryId": 1,
        "initialSpeed": 1.0,
        "bulletSize": 3.0
    });
    let prefer_canonical =
        bulletparam_entry_from_json_value(&both).expect("canonical key wins over alias");
    let preferred = *prefer_canonical
        .commands
        .get(&0xAB606D9E)
        .expect("bullet_size hash");
    assert!((f32::from_bits(preferred) - 3.0).abs() < 1e-5);
}
