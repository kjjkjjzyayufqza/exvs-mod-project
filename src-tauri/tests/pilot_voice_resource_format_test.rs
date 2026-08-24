use app_lib::format::pilot_voice_resource::{
    apply_stem_keys, build_bytes, empty_fields, empty_record, parse_bytes, parse_pack, write_pack,
    PilotVoiceResourceRecord, PilotVoiceResourceTable, DUMMY_PACKAGE, FILE_NAME,
};
use app_lib::format::raw_path_id::{crc32_ieee, parse_voice_stem};

fn filled_record() -> PilotVoiceResourceRecord {
    let stem = "VO_0016_P01_0";
    PilotVoiceResourceRecord {
        voice_key: crc32_ieee(stem.as_bytes()),
        vot_package: 0xA8C5_7029,
        dummy_package: DUMMY_PACKAGE,
        bank_package: 0xA486_4422,
        stream_path_id: crc32_ieee(b"STREAMPATH_ST_VO_0016_P01_0"),
        voice_stem: Some(stem.to_string()),
    }
}

#[test]
fn voice_stem_ignores_spaces() {
    assert_eq!(parse_voice_stem("VO_1000_P01 _0").unwrap(), "VO_1000_P01_0");
    assert_eq!(parse_voice_stem(" vo_1000_p01_0 ").unwrap(), "VO_1000_P01_0");
}

#[test]
fn empty_record_lists_every_required_field() {
    let missing = empty_fields(&empty_record());
    assert_eq!(
        missing,
        [
            "voice",
            "voiceKey",
            "streamPathId",
            "votPackage",
            "dummyPackage",
            "bankPackage"
        ]
    );
}

#[test]
fn stem_keys_do_not_fill_packages() {
    let mut record = empty_record();
    record.voice_stem = Some("VO_1000_P01_0".to_string());
    let next = apply_stem_keys(&record).unwrap();
    assert_eq!(next.voice_key, 0x80B7_036E);
    assert_eq!(next.stream_path_id, 0x6862_87AC);
    assert_eq!(next.vot_package, 0);
    assert_eq!(next.bank_package, 0);
    assert_eq!(next.dummy_package, 0);
    assert_eq!(
        empty_fields(&next),
        ["votPackage", "dummyPackage", "bankPackage"]
    );
}

#[test]
fn write_pack_rejects_empty_fields() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(FILE_NAME);
    let err = write_pack(
        &PilotVoiceResourceTable {
            version: 3,
            records: vec![empty_record()],
        },
        path.to_str().unwrap(),
    )
    .unwrap_err();
    assert!(err.contains("empty fields"), "{err}");
}

#[test]
fn write_pack_round_trip_filled_row() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(FILE_NAME);
    let record = filled_record();
    write_pack(
        &PilotVoiceResourceTable {
            version: 3,
            records: vec![record.clone()],
        },
        path.to_str().unwrap(),
    )
    .unwrap();
    let parsed = parse_pack(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(parsed.table.records.len(), 1);
    assert_eq!(parsed.table.records[0].vot_package, record.vot_package);
    assert!(empty_fields(&parsed.table.records[0]).is_empty());
}

#[test]
fn vrtbl_bytes_round_trip() {
    let record = filled_record();
    let bytes = build_bytes(&PilotVoiceResourceTable {
        version: 3,
        records: vec![record.clone()],
    })
    .unwrap();
    let parsed = parse_bytes(&bytes).unwrap();
    assert_eq!(parsed.records[0].voice_key, record.voice_key);
    assert_eq!(parsed.records[0].voice_stem.as_deref(), Some("VO_0016_P01_0"));
}
