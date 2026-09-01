use app_lib::format::fhm2d::{list_payload_extract_name, Fhm2dFormat};
use app_lib::format::bgm_list::{
    derive_entry, empty_table, parse_bytes, sort_by_record_id, validate_entry, write_pack,
    BGM_LIST_COMMAND_POOL, CMD_CUE_HASH, CMD_MUSIC_ID, CMD_TITLE, CMD_TITLE_WITH_NOTE,
};
use app_lib::format::list_command_pool::{
    build_list, list_data_to_json, list_entry_from_json_value,
};
use serde_json::json;
use std::collections::HashSet;

const TITLE_A: &str = "OVER BOOST Ver.2";
const TITLE_A_NOTE: &str = "\u{266A}OVER BOOST Ver.2";
const TITLE_EDIT: &str = "Unit theme";
const TITLE_EDIT_NOTE: &str = "\u{266A}Unit theme";
const CUE_HASH_A: u32 = 0xBBF2_FFFB;
const CUE_HASH_B: u32 = 0xCA1B_47DB;

fn occupied_from(table: &app_lib::format::list_command_pool::ListData) -> (HashSet<u32>, HashSet<u32>) {
    let records = table.entries.iter().map(|e| e.entry_id).collect();
    let music = table
        .entries
        .iter()
        .filter_map(|e| e.commands.get(&CMD_MUSIC_ID).copied())
        .collect();
    (records, music)
}

#[test]
fn list_extract_type_renames_payload_to_catalog_filename() {
    assert_eq!(Fhm2dFormat::parse_cli("list").unwrap(), Fhm2dFormat::List);
    assert_eq!(Fhm2dFormat::parse_cli("bgm_list").unwrap(), Fhm2dFormat::List);
    assert_eq!(Fhm2dFormat::parse_cli("fhm2d_list").unwrap(), Fhm2dFormat::List);
    assert_eq!(Fhm2dFormat::List.as_cli_str(), "list");
    let (url, ext, base) = list_payload_extract_name("bgm_list", "bgm_list.bin");
    assert_eq!(url, ".\\bgm_list\\bgm_list.bin");
    assert_eq!(ext, ".bin");
    assert_eq!(base, "bgm_list");
    assert_ne!(url, ".\\bgm_list\\0.bin");
}

#[test]
fn parse_mutate_insert_roundtrip_keeps_kind7_titles_and_sorted_ids() {
    let mut table = empty_table();
    let empty_ids = HashSet::new();
    let first = derive_entry(
        Some(120),
        Some(120),
        CUE_HASH_A,
        0x1111_0001,
        TITLE_A,
        TITLE_A_NOTE,
        &empty_ids,
        &empty_ids,
    )
    .unwrap();
    table.entries.push(first);
    let (records, music) = occupied_from(&table);
    let second = derive_entry(
        Some(50),
        Some(50),
        CUE_HASH_B,
        0x1111_0001,
        "Battle 0500",
        "\u{266A}Battle 0500",
        &records,
        &music,
    )
    .unwrap();
    table.entries.push(second);
    sort_by_record_id(&mut table);

    let built = build_list(&table, BGM_LIST_COMMAND_POOL).expect("build seed");
    let mut parsed = parse_bytes(&built).expect("parse seed");
    assert_eq!(parsed.header.commands_count, 5);
    assert_eq!(parsed.header.entry_size, 0x1C);
    assert_eq!(parsed.entries.len(), 2);
    assert!(parsed.entry_ids.windows(2).all(|w| w[0] <= w[1]));
    assert_eq!(
        parsed.entries[1].strings.get(&CMD_TITLE).map(String::as_str),
        Some(TITLE_A)
    );
    assert_eq!(
        parsed.entries[1]
            .strings
            .get(&CMD_TITLE_WITH_NOTE)
            .map(String::as_str),
        Some(TITLE_A_NOTE)
    );

    parsed.entries[1]
        .strings
        .insert(CMD_TITLE, TITLE_EDIT.to_string());
    parsed.entries[1]
        .strings
        .insert(CMD_TITLE_WITH_NOTE, TITLE_EDIT_NOTE.to_string());

    let (records, music) = occupied_from(&parsed);
    let inserted = derive_entry(
        None,
        None,
        CUE_HASH_B,
        0x1111_0001,
        "New HUD row",
        "\u{266A}New HUD row",
        &records,
        &music,
    )
    .unwrap();
    assert_eq!(
        inserted.commands.get(&CMD_CUE_HASH).copied(),
        Some(CUE_HASH_B)
    );
    parsed.entries.push(inserted);
    sort_by_record_id(&mut parsed);

    for entry in &parsed.entries {
        validate_entry(entry).unwrap();
    }
    let rebuilt = build_list(&parsed, BGM_LIST_COMMAND_POOL).expect("rebuild");
    let reparsed = parse_bytes(&rebuilt).expect("reparse");
    assert_eq!(reparsed.header.commands_count, 5);
    assert_eq!(reparsed.header.entry_size, 0x1C);
    assert_eq!(reparsed.entries.len(), 3);
    assert!(reparsed.entry_ids.windows(2).all(|w| w[0] <= w[1]));
    let edited = reparsed
        .entries
        .iter()
        .find(|e| e.commands.get(&CMD_MUSIC_ID) == Some(&120))
        .expect("edited musicId 120");
    assert_eq!(
        edited.strings.get(&CMD_TITLE).map(String::as_str),
        Some(TITLE_EDIT)
    );
    assert_eq!(
        edited
            .strings
            .get(&CMD_TITLE_WITH_NOTE)
            .map(String::as_str),
        Some(TITLE_EDIT_NOTE)
    );
    let new_row = reparsed
        .entries
        .iter()
        .find(|e| e.commands.get(&CMD_CUE_HASH) == Some(&CUE_HASH_B) && e.commands.get(&CMD_MUSIC_ID) != Some(&50))
        .expect("inserted cueHash row");
    assert_eq!(
        new_row.strings.get(&CMD_TITLE).map(String::as_str),
        Some("New HUD row")
    );
}

#[test]
fn signed_json_cue_hash_roundtrips() {
    let expected: u32 = 0xBBF2_FFFB;
    let json_val = json!({
        "entryId": 120,
        "musicId": 120,
        "title": TITLE_A,
        "titleWithNotePrefix": TITLE_A_NOTE,
        "sourceGroupHash": 1,
        "cueHash": expected as i32,
    });
    let entry = list_entry_from_json_value(&json_val, BGM_LIST_COMMAND_POOL).expect("json");
    assert_eq!(entry.entry_id, 120);
    assert_eq!(entry.commands.get(&CMD_CUE_HASH).copied(), Some(expected));
    assert_eq!(entry.strings.get(&CMD_TITLE).map(String::as_str), Some(TITLE_A));
}

#[test]
fn write_pack_rejects_empty_cue_hash() {
    let mut table = empty_table();
    let empty_ids = HashSet::new();
    let mut entry = derive_entry(
        Some(1),
        Some(1),
        CUE_HASH_A,
        0,
        "t",
        "\u{266A}t",
        &empty_ids,
        &empty_ids,
    )
    .unwrap();
    entry.commands.insert(CMD_CUE_HASH, 0);
    table.entries.push(entry);
    let json = list_data_to_json(&table, BGM_LIST_COMMAND_POOL).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bgm_list.bin");
    let err = write_pack(&json, path.to_str().unwrap()).unwrap_err();
    assert!(err.contains("cueHash"), "{err}");
}

#[test]
fn optional_ob_sample_parses_when_present() {
    let candidates = [
        r"E:\XB\mod\012list\bgm_list\bgm_list.bin",
        r"E:\XB\mod\012list\bgm_list\bgm_list.vgsht2",
        r"E:\XB\解包\com\file\0xC91627E8\bgm_list.bin",
    ];
    let source = candidates.iter().find_map(|path| std::fs::read(path).ok());
    let Some(bytes) = source else {
        return;
    };
    let parsed = parse_bytes(&bytes).expect("parse on-disk bgm_list");
    assert_eq!(parsed.header.commands_count, 5);
    assert_eq!(parsed.header.entry_size, 0x1C);
    assert!(!parsed.entries.is_empty());
    assert!(parsed.entry_ids.windows(2).all(|w| w[0] <= w[1]));
}
