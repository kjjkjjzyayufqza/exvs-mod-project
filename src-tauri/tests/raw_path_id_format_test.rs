use app_lib::format::raw_path_id::{
    build_vgsht1, crc32_ieee, derive_pilot_voice_entry, derive_pilot_voice_source, finalize_entry,
    hashed_stream_file_name, merge_files, parse_json, parse_pack, parse_vgsht1, serialize_json,
    sha1_hex, write_pack, FinalizeRawPathIdInput, RawPathIdDocument, RawPathIdKind, JSON_FILE_NAME,
    VGSHT1_FILE_NAME,
};

#[test]
fn crc32_and_sha1_match_ob_vectors() {
    assert_eq!(crc32_ieee(b""), 0x0000_0000);
    assert_eq!(crc32_ieee(b"test"), 0xD87F_7E0C);
    assert_eq!(
        crc32_ieee(b"STREAMPATH_ST_VO_1000_P01_0"),
        0x6862_87AC
    );
    let source = "091waveform/se/stage/SE_STAGE_AMB_01.nus3audio";
    assert_eq!(
        sha1_hex(source.as_bytes()),
        "a81cd594034b50b7e473593946f3306d36b5106b"
    );
    assert_eq!(
        hashed_stream_file_name(source),
        "a81cd594034b50b7e473593946f3306d36b5106b.nus3audio"
    );
}

#[test]
fn derives_vo_1000_stream_key_and_source() {
    let (key, source) = derive_pilot_voice_source("VO_1000_P01_0").expect("stem");
    assert_eq!(key, "STREAMPATH_ST_VO_1000_P01_0");
    assert_eq!(
        source,
        "091waveform/voice/pilot/vo_1000/VO_1000_P01_0_01_ST_01.nus3audio"
    );
    let entry = derive_pilot_voice_entry("vo_1000_p01_0").expect("case-insensitive stem");
    assert_eq!(entry.hash, 0x6862_87AC);
    assert_eq!(entry.kind, RawPathIdKind::Stream);
}

#[test]
fn json_and_vgsht1_round_trip_two_streams() {
    let first = finalize_entry(FinalizeRawPathIdInput {
        key: "STREAMPATH_SE_STAGE_AMB_01".to_string(),
        source: "091waveform/se/stage/SE_STAGE_AMB_01.nus3audio".to_string(),
        kind: None,
        param01_low: None,
        param01_high: None,
        param02_low: None,
        param02_high: None,
    })
    .unwrap();
    let second = derive_pilot_voice_entry("VO_1000_P01_0").unwrap();
    assert_eq!(
        first.path,
        "a81cd594034b50b7e473593946f3306d36b5106b.nus3audio"
    );

    let document = RawPathIdDocument {
        entries: vec![second.clone(), first.clone()],
    };
    let json_text = serialize_json(&document).unwrap();
    let vgsht1 = build_vgsht1(&document).unwrap();
    let table = parse_vgsht1(&vgsht1).unwrap();
    assert_eq!(table.ids.len(), 2);
    let mut sorted = table.ids.clone();
    sorted.sort_unstable();
    assert_eq!(table.ids, sorted);

    let (merged, issues) = merge_files(&json_text, Some(&vgsht1)).unwrap();
    assert!(issues.is_empty(), "{issues:?}");
    let mut keys: Vec<_> = merged.entries.iter().map(|e| e.key.as_str()).collect();
    keys.sort_unstable();
    assert_eq!(
        keys,
        vec![first.key.as_str(), second.key.as_str()]
    );
    let parsed = parse_json(&json_text).unwrap();
    assert_eq!(parsed.0.entries[0].key, second.key);
}

#[test]
fn write_pack_discovers_canonical_names() {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path();
    let json_path = folder.join(JSON_FILE_NAME);
    let vgsht1_path = folder.join(VGSHT1_FILE_NAME);
    let entry = derive_pilot_voice_entry("VO_1000_P01_0").unwrap();
    let written = write_pack(
        &RawPathIdDocument {
            entries: vec![entry.clone()],
        },
        json_path.to_str().unwrap(),
        vgsht1_path.to_str().unwrap(),
    )
    .unwrap();
    assert_eq!(written.entries[0].hash, entry.hash);
    assert!(json_path.is_file());
    assert!(vgsht1_path.is_file());

    let parsed = parse_pack(folder.to_str().unwrap()).unwrap();
    assert_eq!(parsed.document.entries.len(), 1);
    assert_eq!(parsed.document.entries[0].key, entry.key);
    assert_eq!(parsed.document.entries[0].source, entry.source);
    assert!(parsed.issues.is_empty(), "{:?}", parsed.issues);
}
