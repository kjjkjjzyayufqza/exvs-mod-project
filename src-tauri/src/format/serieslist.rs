// series_list.bin (resource 0xB7367090). Same param_bin / command-pool format as
// character_list. Field names are IDA-derived from vsac27_Release.exe (OB); only
// hashes with no code reference at all are left as unk_*.
//
// Field-key hashes are the proprietary VDK hash (not CRC32), so they cannot be
// reversed from strings; meaning is established from binary consumers.

use serde_json::Value;

use crate::format::list_command_pool::{build_list, list_data_from_json, list_data_to_json, parse_list};
use crate::format::param_entry_schema::ParamCommandPool;

// entrySize = 0x1C, commandsCount = 6. Entry layout (offsets from field specs):
//   0x00 record_lookup_id          0x04 icon_file_index    0x08 unk_0x08
//   0x0C name (string)             [0x10 gap, no spec]     0x14 display_name_ref
//   0x18 character_list_position
pub const SERIESLIST_COMMAND_POOL: ParamCommandPool = &[
    // IDA: used as the match key in LookupRecordIdByFieldValue (0x1409A8EB0),
    // the same record-lookup column BgmList keys on (BgmList_GetCueHashByMusicId).
    (0x1111D441, 1, "record_lookup_id"),
    // IDA: getter sub_140900F00 returns this for a series id; drives the series icon.
    (0x6CA1A996, 1, "icon_file_index"),
    // IDA: no code reference to this hash -> meaning unknown.
    (0x869F08CE, 2, "unk_0x08"),
    // String offset: the series display name.
    (0x8C18E794, 7, "name"),
    // IDA: getter sub_140900F60; consumer sub_1409F8EA0 (Jukurendo proficiency
    // popup) maps it through sub_1408F2F20 to a displayed name string.
    (0xAF69BF4B, 1, "display_name_ref"),
    // IDA: referenced from the series-list consumer; orders entries in the
    // character list (legacy name preserved).
    (0xC0922304, 2, "character_list_position"),
];

pub fn parse_serieslist(data: &[u8]) -> Result<Value, String> {
    let parsed = parse_list(data, SERIESLIST_COMMAND_POOL)?;
    list_data_to_json(&parsed, SERIESLIST_COMMAND_POOL)
}

pub fn build_serieslist(data_json: &Value) -> Result<Vec<u8>, String> {
    let data = list_data_from_json(data_json, SERIESLIST_COMMAND_POOL)?;
    build_list(&data, SERIESLIST_COMMAND_POOL)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0xB7367090\\series_list.bin";

    #[test]
    fn serieslist_parse_basic() {
        let source = match std::fs::read(SAMPLE_PATH) {
            Ok(d) => d,
            Err(_) => return,
        };
        let parsed = parse_list(&source, SERIESLIST_COMMAND_POOL).expect("parse series_list");
        assert_eq!(parsed.header.commands_count, 6);
        assert_eq!(parsed.header.entry_size, 0x1C);
        assert!(!parsed.entries.is_empty());
        // Every field spec kind in the file must match the pool.
        let json = parse_serieslist(&source).expect("to json");
        assert!(json.get("entries").is_some());
    }

    #[test]
    fn serieslist_roundtrip_no_edit() {
        let source = match std::fs::read(SAMPLE_PATH) {
            Ok(d) => d,
            Err(_) => return,
        };
        let parsed = parse_list(&source, SERIESLIST_COMMAND_POOL).expect("parse series_list");
        let rebuilt = build_list(&parsed, SERIESLIST_COMMAND_POOL).expect("rebuild series_list");
        assert_eq!(rebuilt, source, "byte-exact roundtrip failed");
    }

    // The real UI path: parse -> JSON -> build -> re-parse must preserve every
    // named field value and string.
    #[test]
    fn serieslist_json_roundtrip_preserves_fields() {
        let source = match std::fs::read(SAMPLE_PATH) {
            Ok(d) => d,
            Err(_) => return,
        };
        let json1 = parse_serieslist(&source).expect("parse to json");
        let rebuilt = build_serieslist(&json1).expect("build from json");
        let json2 = parse_serieslist(&rebuilt).expect("re-parse to json");
        assert_eq!(
            json1.get("entries"),
            json2.get("entries"),
            "named entry fields drifted across the IPC build path"
        );
    }
}
