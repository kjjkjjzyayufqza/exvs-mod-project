use app_lib::exvs2_json_cli::{inspect_bytes, InspectOptions, InspectType};

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
}
