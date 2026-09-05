use app_lib::format::camera_table::{
    build_synthetic_row, empty_synthetic_specs, parse_bytes, write_pack, CameraTableEntry,
    CameraTableFile, CameraTableHeader, CMD_CLIP_HASH, CMD_FIRST_SHOT, CMD_FOV, CMD_OFFSET,
    CMD_SORT_KEY, ENTRY_SIZE, FAMILIES, OFF_CLIP_HASH, OFF_FIRST_SHOT, OFF_FOV, OFF_OFFSET,
    OFF_SORT_KEY,
};
use std::path::Path;
use app_lib::format::param_bin_format::{build_param_binary, ParamBinaryFile, PARAM_BIN_MAGIC};

fn synthetic_file(rows: Vec<(u32, u32, u32, Option<f32>, f32, u32)>) -> ParamBinaryFile {
    let specs = empty_synthetic_specs();
    let mut entry_ids = Vec::new();
    let mut entries_raw = Vec::new();
    for (entry_id, clip_hash, sort_key, fov, offset, first_shot) in rows {
        entry_ids.push(entry_id);
        entries_raw.push(build_synthetic_row(clip_hash, sort_key, fov, offset, first_shot));
    }
    ParamBinaryFile {
        header: app_lib::format::param_bin_format::ParamBinaryHeader {
            magic: PARAM_BIN_MAGIC,
            unk_04: 0,
            file_size: 0,
            unk_0c: 0,
            entry_count: entry_ids.len() as u32,
            commands_count: specs.len() as u32,
            entry_size: ENTRY_SIZE,
            unk_1c: 0,
        },
        field_specs: specs
            .into_iter()
            .map(|spec| app_lib::format::param_bin_format::ParamFieldSpec {
                hash: spec.hash,
                entry_offset: spec.entry_offset,
                flags: spec.flags,
                kind: spec.kind,
            })
            .collect(),
        entry_ids,
        entries_raw,
        trailing_data: Vec::new(),
    }
}

#[test]
fn parse_rejects_wrong_entry_size() {
    let mut file = synthetic_file(vec![(1, 0x8CA6_CC45, 2, Some(65.0), 0.0, 3)]);
    file.header.entry_size = 16;
    file.entries_raw[0].truncate(16);
    let bytes = build_param_binary(&file).unwrap();
    let err = parse_bytes(&bytes).unwrap_err();
    assert!(err.contains("entry_size"), "{err}");
}

#[test]
fn named_overlay_roundtrips_fov_offset_and_keeps_clip_hash() {
    let file = synthetic_file(vec![
        (0x1111_1111, 0x8CA6_CC45, 2, Some(65.0), 0.0, 3),
        (0x2222_2222, 0x8CA6_CC45, 3, None, 1.5, 0),
    ]);
    let bytes = build_param_binary(&file).unwrap();
    let parsed = parse_bytes(&bytes).expect("parse");
    assert_eq!(parsed.header.entry_size, ENTRY_SIZE);
    assert_eq!(parsed.entries_raw.len(), 2);

    let specs = empty_synthetic_specs();
    let mut payload = CameraTableFile {
        header: CameraTableHeader {
            magic: parsed.header.magic,
            unk_04: parsed.header.unk_04,
            file_size: parsed.header.file_size,
            unk_0c: parsed.header.unk_0c,
            entry_count: parsed.header.entry_count,
            commands_count: parsed.header.commands_count,
            entry_size: parsed.header.entry_size,
            unk_1c: parsed.header.unk_1c,
        },
        field_specs: specs,
        entry_ids: parsed.entry_ids.clone(),
        entries_raw: parsed.entries_raw.clone(),
        trailing_data: parsed.trailing_data.clone(),
        entries: vec![
            CameraTableEntry {
                entry_id: 0x1111_1111,
                entry_index: 0,
                clip_hash: 0x8CA6_CC45,
                sort_key: 2,
                fov: Some(100.0),
                offset: -5.5,
                first_shot: 3,
            },
            CameraTableEntry {
                entry_id: 0x2222_2222,
                entry_index: 1,
                clip_hash: 0xDEAD_BEEF,
                sort_key: 99,
                fov: None,
                offset: 4.0,
                first_shot: 0,
            },
        ],
        file_path: None,
        family: Some("02winlose".to_string()),
    };

    let dir = tempfile::tempdir().unwrap();
    let out = dir.path().join("02winlose.vgsht2");
    let json = serde_json::to_value(&payload).unwrap();
    let written = write_pack(&json, out.to_str().unwrap()).expect("write");
    let reparsed = parse_bytes(&std::fs::read(&out).unwrap()).expect("reparse");

    assert_eq!(
        u32::from_le_bytes(reparsed.entries_raw[0][OFF_CLIP_HASH..OFF_CLIP_HASH + 4].try_into().unwrap()),
        0x8CA6_CC45,
        "clip hash must stay read-only on save"
    );
    assert_eq!(
        u32::from_le_bytes(reparsed.entries_raw[0][OFF_SORT_KEY..OFF_SORT_KEY + 4].try_into().unwrap()),
        2,
        "sort key must stay read-only on save"
    );
    assert_eq!(
        f32::from_le_bytes(reparsed.entries_raw[0][OFF_FOV..OFF_FOV + 4].try_into().unwrap()),
        100.0
    );
    assert_eq!(
        f32::from_le_bytes(reparsed.entries_raw[0][OFF_OFFSET..OFF_OFFSET + 4].try_into().unwrap()),
        -5.5
    );
    assert_eq!(
        u32::from_le_bytes(reparsed.entries_raw[0][OFF_FIRST_SHOT..OFF_FIRST_SHOT + 4].try_into().unwrap()),
        3
    );
    assert!(
        f32::from_le_bytes(reparsed.entries_raw[1][OFF_FOV..OFF_FOV + 4].try_into().unwrap()).is_nan()
    );
    assert_eq!(
        u32::from_le_bytes(reparsed.entries_raw[1][OFF_CLIP_HASH..OFF_CLIP_HASH + 4].try_into().unwrap()),
        0x8CA6_CC45,
        "attempted clip-hash edit must not write"
    );
    assert_eq!(written["entries"][0]["clipHash"], 0x8CA6_CC45u64);

    payload.entries.clear();
    let bad = serde_json::to_value(&payload).unwrap();
    let err = write_pack(&bad, out.to_str().unwrap()).unwrap_err();
    assert!(err.contains("length mismatch"), "{err}");

    let _ = (CMD_CLIP_HASH, CMD_FIRST_SHOT, CMD_FOV, CMD_OFFSET, CMD_SORT_KEY);
}

#[test]
fn parse_ob_common_camera_families_if_present() {
    let dir = Path::new(r"E:\XB\mod\002chara\000common_000common_001\camera\parameters");
    if !dir.is_dir() {
        return;
    }
    let mut parsed_winlose = false;
    for family in FAMILIES {
        let path = dir.join(format!("{family}.vgsht2"));
        if !path.is_file() {
            continue;
        }
        let bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
        let parsed = parse_bytes(&bytes).unwrap_or_else(|e| panic!("{family}: {e}"));
        assert_eq!(parsed.header.entry_size, ENTRY_SIZE, "{family}");
        assert!(!parsed.entries_raw.is_empty(), "{family} empty");
        if *family == "02winlose" {
            parsed_winlose = true;
            assert_eq!(parsed.entries_raw.len(), 4046, "OB 02winlose row count");
            let found_enter = parsed.entries_raw.iter().any(|raw| {
                raw.len() >= OFF_CLIP_HASH + 4
                    && u32::from_le_bytes(raw[OFF_CLIP_HASH..OFF_CLIP_HASH + 4].try_into().unwrap())
                        == 0x8CA6_CC45
            });
            assert!(found_enter, "Rebellion ENTER clip 0x8CA6CC45 missing");
        }
    }
    assert!(parsed_winlose, "02winlose.vgsht2 should exist in this workspace");
}
