// stage_list.bin (resource 0xCE74091E). Same param_bin / command-pool format as
// character_list. Field names are IDA-derived from vsac27_Release.exe (OB); only
// hashes with no code reference at all are left as unk_*.
//
// This is the non-GVS stage list (magic 0xCDABB8A9). The GVS variant
// (StageListGVS, magic A9B8ABCE) has a different header and no command section
// and is intentionally NOT handled here.

use serde_json::Value;

use crate::format::list_command_pool::{build_list, list_data_from_json, list_data_to_json, parse_list};
use crate::format::param_entry_schema::ParamCommandPool;

// entrySize = 0x48, commandsCount = 17. Entry layout (offsets from field specs):
//   0x00 record_lookup_id              0x04 random_select_weight_default
//   0x08 random_select_weight_alt      0x0C unk_0x0c
//   0x10 series_alt_group_id           0x14 unk_0x14
//   0x18 vs_s_d                        0x1C file_name
//   0x20 select_order_alt              0x24 vs_s_l
//   0x28 series_default_group_id       0x2C name (string)
//   [0x30 gap, no spec]                0x34 unk_0x34
//   0x38 unk_0x38                      0x3C select_order_default
//   0x40 vs_sn                         0x44 icon_index
pub const STAGELIST_COMMAND_POOL: ParamCommandPool = &[
    // IDA: LookupRecordIdByFieldValue (0x1409A8EB0) match key (stage record lookup id).
    (0x1111D441, 1, "record_lookup_id"),
    // IDA: sub_1408F6D50 builds a weighted-random stage pool; this is the weight
    // for the default mode (selector arg == 0). Stages with weight 0 are excluded.
    (0x163BDAD5, 2, "random_select_weight_default"),
    // IDA: sub_1408F6D50 weight for the alternate mode (selector arg != 0).
    (0x21BF7216, 2, "random_select_weight_alt"),
    // IDA: no code reference to this hash -> meaning unknown.
    (0x2297748A, 1, "unk_0x0c"),
    // Shared with character_list. IDA: sub_1408F6890 uses it as the alt-mode group
    // / enable flag when ordering selectable stages.
    (0x275AC0EA, 2, "series_alt_group_id"),
    // IDA: no code reference to this hash -> meaning unknown.
    (0x4A0A639D, 1, "unk_0x14"),
    // Resource-hash field (legacy name); only read through a virtual getter.
    (0x509DC39F, 1, "vs_s_d"),
    // Resource-hash field for the stage file/scene (legacy name); virtual getter only.
    (0x56DF265C, 1, "file_name"),
    // IDA: sub_1408F6890 alt-mode ordering index (paired with series_alt_group_id).
    (0x59154D2B, 2, "select_order_alt"),
    // Resource-hash field (legacy name); virtual getter only.
    (0x5E464BAD, 1, "vs_s_l"),
    // Shared with character_list. IDA: sub_1408F6890 default-mode group / enable flag.
    (0x6CD5881F, 2, "series_default_group_id"),
    // String offset: the stage display name.
    (0x6DE44026, 7, "name"),
    // IDA: no code reference to this hash -> meaning unknown.
    (0x777FCAAC, 2, "unk_0x34"),
    // IDA: no code reference to this hash -> meaning unknown.
    (0x876536E4, 2, "unk_0x38"),
    // IDA: sub_1408F6890 default-mode ordering index (legacy name: uniqueIndex).
    (0xA8D01752, 2, "select_order_default"),
    // Resource-hash field (legacy name); virtual getter only.
    (0xAC448CB5, 1, "vs_sn"),
    // Stage select icon index (legacy name).
    (0xB88AD3D3, 1, "icon_index"),
];

pub fn parse_stagelist(data: &[u8]) -> Result<Value, String> {
    let parsed = parse_list(data, STAGELIST_COMMAND_POOL)?;
    list_data_to_json(&parsed, STAGELIST_COMMAND_POOL)
}

pub fn build_stagelist(data_json: &Value) -> Result<Vec<u8>, String> {
    let data = list_data_from_json(data_json, STAGELIST_COMMAND_POOL)?;
    build_list(&data, STAGELIST_COMMAND_POOL)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0xCE74091E\\stage_list.bin";

    #[test]
    fn stagelist_parse_basic() {
        let source = match std::fs::read(SAMPLE_PATH) {
            Ok(d) => d,
            Err(_) => return,
        };
        let parsed = parse_list(&source, STAGELIST_COMMAND_POOL).expect("parse stage_list");
        assert_eq!(parsed.header.commands_count, 17);
        assert_eq!(parsed.header.entry_size, 0x48);
        assert!(!parsed.entries.is_empty());
    }

    #[test]
    fn stagelist_roundtrip_no_edit() {
        let source = match std::fs::read(SAMPLE_PATH) {
            Ok(d) => d,
            Err(_) => return,
        };
        let parsed = parse_list(&source, STAGELIST_COMMAND_POOL).expect("parse stage_list");
        let rebuilt = build_list(&parsed, STAGELIST_COMMAND_POOL).expect("rebuild stage_list");
        assert_eq!(rebuilt, source, "byte-exact roundtrip failed");
    }

    // The real UI path: parse -> JSON -> build -> re-parse must preserve every
    // named field value and string (gap bytes may zero, which the game ignores).
    #[test]
    fn stagelist_json_roundtrip_preserves_fields() {
        let source = match std::fs::read(SAMPLE_PATH) {
            Ok(d) => d,
            Err(_) => return,
        };
        let json1 = parse_stagelist(&source).expect("parse to json");
        let rebuilt = build_stagelist(&json1).expect("build from json");
        let json2 = parse_stagelist(&rebuilt).expect("re-parse to json");
        assert_eq!(
            json1.get("entries"),
            json2.get("entries"),
            "named entry fields drifted across the IPC build path"
        );
    }
}
