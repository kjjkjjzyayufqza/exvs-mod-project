// pilot_list.vgsht2 / pilot_list.bin — mobile-suit pilot presentation table.
// Same param_bin / command-pool format as series_list / character_list.
//
// Game role (EXVS2):
//   - NOT the support navi (刷卡左边 / 战斗中说话) — that is navi_list.
//   - Pilot costume / VS-screen / score-screen pilot portrait keys and labels.
//   - Display Japanese names live on character_list (pilot_name_*) / localized text;
//     pilot_list rows use internal codes (PS001A01, S_PILOT_001, ...).
//
// Layout (entrySize 0x38, commandsCount 10):
//   0x00 unk_0x00
//   0x04 ms_pilot_label (string, e.g. S_MS_PILOT_001)
//   0x0C pilot_name_short (string, e.g. PS001A01)  [shared hash with character_list]
//   0x14 resource hash
//   0x18 pilot_name_full (string, e.g. P001A01)    [shared hash with character_list]
//   0x20 resource hash
//   0x24 pilot_label (string, e.g. S_PILOT_001)
//   0x2C series_list_entry_id
//   0x30 / 0x34 resource hashes
//
// entryIds are decimal-looking pilot codes (10101, 20101, ...) grouping by series.

use serde_json::Value;

use crate::format::list_command_pool::{
    build_list, list_data_from_json, list_data_to_json, parse_list, ListData,
};
use crate::format::param_entry_schema::ParamCommandPool;

pub const PILOTLIST_COMMAND_POOL: ParamCommandPool = &[
    // Always 0 in the current OB dump — reserved flag / unused.
    (0x0643B30A, 1, "unk_0x00"),
    // Localization / sound category key: "S_MS_PILOT_###" (empty for some unused rows).
    (0x321F8B3F, 7, "ms_pilot_label"),
    // Shared hash with character_list.pilot_name_short — internal code "PS001A01".
    (0x44359307, 7, "pilot_name_short"),
    // Portrait / presentation resource hash (varies per pilot row).
    (0x4B14A35F, 1, "presentation_resource_hash_a"),
    // Shared hash with character_list.pilot_name_full — internal code "P001A01".
    (0x4F03C86C, 7, "pilot_name_full"),
    (0x639EA8F5, 1, "presentation_resource_hash_b"),
    // Localization / voice key: "S_PILOT_###".
    (0xBA0F2DED, 7, "pilot_label"),
    // Foreign key into series_list.entryIds.
    (0xBF885105, 1, "series_list_entry_id"),
    (0xD24D8559, 1, "presentation_resource_hash_c"),
    (0xF9D080B5, 1, "presentation_resource_hash_d"),
];

pub fn parse_pilotlist_data(data: &[u8]) -> Result<ListData, String> {
    parse_list(data, PILOTLIST_COMMAND_POOL)
}

pub fn parse_pilotlist(data: &[u8]) -> Result<Value, String> {
    let parsed = parse_pilotlist_data(data)?;
    list_data_to_json(&parsed, PILOTLIST_COMMAND_POOL)
}

pub fn build_pilotlist_data(data: &ListData) -> Result<Vec<u8>, String> {
    build_list(data, PILOTLIST_COMMAND_POOL)
}

pub fn build_pilotlist(data_json: &Value) -> Result<Vec<u8>, String> {
    let data = list_data_from_json(data_json, PILOTLIST_COMMAND_POOL)?;
    build_pilotlist_data(&data)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_PATH: &str =
        "E:\\XB\\\u{89e3}\u{5305}\\vs2\\x64\\012list\\pilot_list\\pilot_list.vgsht2";

    #[test]
    fn pilotlist_parse_basic() {
        let source = match std::fs::read(SAMPLE_PATH) {
            Ok(d) => d,
            Err(_) => return,
        };
        let parsed = parse_pilotlist_data(&source).expect("parse pilot_list");
        assert_eq!(parsed.header.commands_count, 10);
        assert_eq!(parsed.header.entry_size, 0x38);
        assert_eq!(parsed.entries.len(), 180);
        let first = &parsed.entries[0];
        assert_eq!(first.entry_id, 10101);
        assert_eq!(
            first.strings.get(&0x44359307).map(String::as_str),
            Some("PS001A01")
        );
        assert_eq!(
            first.strings.get(&0x4F03C86C).map(String::as_str),
            Some("P001A01")
        );
    }

    #[test]
    fn pilotlist_roundtrip_no_edit() {
        let source = match std::fs::read(SAMPLE_PATH) {
            Ok(d) => d,
            Err(_) => return,
        };
        let parsed = parse_pilotlist_data(&source).expect("parse pilot_list");
        let rebuilt = build_pilotlist_data(&parsed).expect("rebuild pilot_list");
        assert_eq!(rebuilt, source, "byte-exact roundtrip failed");
    }

    #[test]
    fn pilotlist_json_roundtrip_preserves_fields() {
        let source = match std::fs::read(SAMPLE_PATH) {
            Ok(d) => d,
            Err(_) => return,
        };
        let json1 = parse_pilotlist(&source).expect("parse to json");
        let rebuilt = build_pilotlist(&json1).expect("build from json");
        let json2 = parse_pilotlist(&rebuilt).expect("re-parse to json");
        assert_eq!(
            json1.get("entries"),
            json2.get("entries"),
            "named entry fields drifted across the IPC build path"
        );
    }
}
