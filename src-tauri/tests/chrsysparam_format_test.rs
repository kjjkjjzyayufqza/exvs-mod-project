//! End-to-end checks for the `chrsysparam.csyspm` action table against real OB v27 unit data.

use std::path::Path;

use app_lib::exvs2_json_cli::{edit_bytes, inspect_bytes, EditBytesOptions, InspectOptions, InspectType};
use app_lib::format::chrsysparam::{build_chrsysparam, parse_chrsysparam};
use app_lib::format::chrsysparam_document::{from_document, to_document};
use app_lib::format::chrsysparam_msc_links::resolve_msc_links;
use app_lib::format::chrsysparam_validate::{validate_chrsysparam, ChrSysIssueLevel};
use serde_json::{json, Value};

const DEGENERATE_SAMPLE: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\chrsysparam.csyspm";
const FA_UNICORN_PARAM: &str = "E:\\XB\\mod\\041cpm\\015gndmuc_008faunig_001\\chrsysparam.csyspm";
const FA_UNICORN_MSC: &str = "E:\\XB\\mod\\040msc\\015gndmuc_008faunig_001";

fn read(path: &str) -> Vec<u8> {
    std::fs::read(path).unwrap_or_else(|e| panic!("failed to read {path}: {e}"))
}

#[test]
fn degenerate_classic_unit_file_round_trips_byte_exact() {
    let source = read(DEGENERATE_SAMPLE);
    let parsed = parse_chrsysparam(&source).expect("parse");
    assert_eq!(parsed.action_table.rows.len(), 1);
    assert_eq!(parsed.action_table.columns, 1);
    assert_eq!(build_chrsysparam(&parsed).expect("build"), source);
}

#[test]
fn full_armor_unicorn_round_trips_byte_exact_through_binary_and_document() {
    let source = read(FA_UNICORN_PARAM);
    let parsed = parse_chrsysparam(&source).expect("parse");
    assert_eq!(parsed.unit_id, 15_008_001);
    assert_eq!(parsed.action_table.rows.len(), 96);
    assert_eq!(parsed.action_table.columns, 128);
    assert_eq!(build_chrsysparam(&parsed).expect("build"), source);

    let document = to_document(&parsed);
    assert_eq!(document["actionTable"]["rows"][1]["fields"]["actionHash"], json!("0xDFD66752"));
    assert_eq!(document["actionTable"]["rows"][15]["fields"]["formIndex"], json!(1));
    assert_eq!(document["actionTable"]["rows"][1]["fields"]["transitionRangeFirst"], json!(-1));
    let text = serde_json::to_string_pretty(&document).expect("serialize");
    let reparsed: Value = serde_json::from_str(&text).expect("deserialize");
    let rebuilt = build_chrsysparam(&from_document(&reparsed).expect("import")).expect("build");
    assert_eq!(rebuilt, source);
}

#[test]
fn full_armor_unicorn_scripts_resolve_and_validate_without_errors() {
    let links = resolve_msc_links(Path::new(FA_UNICORN_MSC)).expect("links");
    assert_eq!(links.registration_function, "func_285");
    assert_eq!(links.group_resolver_function, "func_309");
    assert_eq!(links.phase_resolver_function, "func_437");
    assert_eq!(links.row_reader_function, "func_311");
    assert_eq!(links.group_callbacks.len(), 15);
    assert_eq!(links.phase_callbacks.len(), 275);
    assert!(links
        .field_globals
        .iter()
        .any(|entry| entry.field == 0x2E && entry.global == "global554"));
    assert!(links
        .input_bridge_readers
        .iter()
        .any(|reader| reader.fields.contains(&0x2E)));

    let file = parse_chrsysparam(&read(FA_UNICORN_PARAM)).expect("parse");
    let errors: Vec<_> = validate_chrsysparam(&file, Some(&links))
        .into_iter()
        .filter(|issue| issue.level == ChrSysIssueLevel::Error)
        .collect();
    assert!(errors.is_empty(), "unexpected errors: {errors:?}");
}

#[test]
fn cli_inspect_reports_rows_hooks_and_roundtrip() {
    let report = inspect_bytes(
        FA_UNICORN_PARAM,
        &read(FA_UNICORN_PARAM),
        InspectOptions {
            summary: true,
            roundtrip_check: true,
            msc_dir: Some(FA_UNICORN_MSC.to_string()),
            ..InspectOptions::default()
        },
    )
    .expect("inspect");
    assert_eq!(report["detectedType"], json!("chrsysparam"));
    let data = &report["data"];
    assert_eq!(data["roundtripCheck"]["byteIdentical"], json!(true));
    let row_one = &data["actions"][0];
    assert_eq!(row_one["actionHash"], json!("0xDFD66752"));
    assert_eq!(row_one["groupEnter"], json!("func_398"));
    assert_eq!(row_one["hooks"]["enter"]["function"], json!("func_1002"));
    assert_eq!(row_one["hooks"]["tick"]["function"], json!("func_1003"));
    assert_eq!(row_one["hooks"]["exit"]["function"], json!("func_1004"));
    let row_seven = &data["actions"][6];
    assert_eq!(row_seven["derived"][0]["row"], json!(8));
}

#[test]
fn cli_edit_clones_edits_and_deletes_rows() {
    let source = read(FA_UNICORN_PARAM);
    let options = || EditBytesOptions {
        inspect_type: Some(InspectType::ChrSysParam),
        output_path: None,
        dry_run: true,
    };
    let added = edit_bytes(
        FA_UNICORN_PARAM,
        &source,
        &json!({
            "type": "chrsysparam",
            "operations": [
                { "op": "appendChrSysRow", "table": "action", "cloneFromRow": 13, "fields": { "actionHash": "0x13570001", "leverMask": "0x10" } },
                { "op": "setChrSysField", "table": "action", "row": 96, "field": "armsSlot", "value": 4 }
            ]
        }),
        options(),
    )
    .expect("append");
    assert_eq!(added.report["operationsApplied"][0]["result"]["newRow"], json!(96));
    let parsed = parse_chrsysparam(&added.bytes).expect("reparse");
    assert_eq!(parsed.action_table.rows.len(), 97);
    assert_eq!(parsed.action_table.rows[96][0x2E], 0x1357_0001);
    assert_eq!(parsed.action_table.rows[96][0x02], parsed.action_table.rows[13][0x02]);

    let restored = edit_bytes(
        FA_UNICORN_PARAM,
        &added.bytes,
        &json!({ "operations": [ { "op": "deleteChrSysRow", "table": "action", "row": 96 } ] }),
        options(),
    )
    .expect("delete");
    assert_eq!(restored.bytes, source);

    let refused = edit_bytes(
        FA_UNICORN_PARAM,
        &source,
        &json!({ "operations": [ { "op": "deleteChrSysRow", "table": "action", "row": 8 } ] }),
        options(),
    )
    .err()
    .expect("row 8 is the derived target of row 7");
    assert!(refused.contains("derived target of row 7"), "unexpected: {refused}");
}
