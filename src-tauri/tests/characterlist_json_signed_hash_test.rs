use app_lib::format::characterlist::characterlist_entry_from_json_value;
use serde_json::json;

#[test]
fn signed_dual_value_pilot_presentation_hash_deserializes() {
    // DualValueProperty commits hashes via int32, so 0x80B7036E arrives as a
    // negative JSON number. KIND_U32 must keep the same 32-bit pattern.
    let expected: u32 = 0x80B7036E;
    let json_val = json!({
        "entryId": 900000004u32,
        "pilotPresentationHash": expected as i32,
    });
    let entry = characterlist_entry_from_json_value(&json_val)
        .expect("signed DualValueProperty hash should deserialize");
    assert_eq!(entry.entry_id, 900000004);
    assert_eq!(entry.commands.get(&0x3573AED2).copied(), Some(expected));
}
