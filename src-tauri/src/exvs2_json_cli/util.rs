use serde_json::{json, Value};

use crate::format::param_entry_schema::{
    snake_to_camel, ParamCommandPool, KIND_F32, KIND_I32, KIND_U32,
};
use crate::jnttbl_format::bytes_to_hex_upper_spaced;

pub(crate) fn normalize_type_name(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .replace('-', "_")
        .replace(' ', "_")
}

pub(crate) fn supported_type_list() -> &'static str {
    "jnttbl, character-id-table, vernier-table, armsparam, bulletparam, speedparam, projectile-depiction-table, navi-list, pilot-list, nusktb, numshb, numdlb"
}

pub(crate) fn supported_edit_type_list() -> &'static str {
    "jnttbl, character-id-table, vernier-table, armsparam, bulletparam, speedparam, projectile-depiction-table, navi-list, pilot-list"
}

pub(crate) fn format_json(value: &Value, pretty: bool) -> Result<String, String> {
    if pretty {
        serde_json::to_string_pretty(value).map_err(|e| format!("JSON formatting failed: {e}"))
    } else {
        serde_json::to_string(value).map_err(|e| format!("JSON formatting failed: {e}"))
    }
}

pub(crate) fn usage() -> String {
    [
        "Usage:",
        r#"  exvs2-json inspect "<known-exvs2-file-path>" [--type <type>] [--pretty] [--summary] [--raw-fields] [--roundtrip-check]"#,
        r#"  exvs2-json edit "<known-exvs2-file-path>" --request <edit.json> --output <new-file> [--type <type>] [--pretty] [--dry-run]"#,
        r#"  exvs2-json edit "<known-exvs2-file-path>" --request-json <json> --output <new-file> [--type <type>] [--pretty] [--dry-run]"#,
        r#"  exvs2-json correlate --unit <bucket> --weapon <task-name> --id <dispatcher-id> [--pretty]"#,
        "",
        "Supported inspect types:",
        "  jnttbl, character-id-table, vernier-table, armsparam, bulletparam, speedparam, projectile-depiction-table,",
        "  navi-list, pilot-list, nusktb, numshb, numdlb",
        "",
        "Supported edit types:",
        "  jnttbl, character-id-table, vernier-table, armsparam, bulletparam, speedparam, projectile-depiction-table,",
        "  navi-list, pilot-list",
    ]
    .join("\n")
}

pub(crate) fn insert_roundtrip(
    target: &mut Value,
    source: &[u8],
    rebuilt: &[u8],
) -> Result<(), String> {
    insert_object_field(
        target,
        "roundtripCheck",
        json!({
            "byteIdentical": source == rebuilt,
            "sourceByteLength": source.len(),
            "rebuiltByteLength": rebuilt.len()
        }),
    )
}

pub(crate) fn insert_object_field(
    target: &mut Value,
    key: &str,
    value: Value,
) -> Result<(), String> {
    match target {
        Value::Object(map) => {
            map.insert(key.to_string(), value);
            Ok(())
        }
        _ => Err(format!(
            "Cannot insert '{key}' into a non-object JSON value"
        )),
    }
}

pub(crate) fn hash_json(value: u32) -> Value {
    json!({
        "value": value,
        "hex": format_hex_u32(value),
        "rawLeBytes": le_bytes4(value)
    })
}

pub(crate) fn signed_resource_json(value: i32) -> Value {
    json!({
        "value": value,
        "hex": format_hex_u32(value as u32),
        "rawLeBytes": le_bytes4(value as u32)
    })
}

pub(crate) fn optional_hash_hex(value: Option<u32>) -> Value {
    value
        .map(|v| Value::String(format_hex_u32(v)))
        .unwrap_or(Value::Null)
}

pub(crate) fn format_hex_u32(value: u32) -> String {
    format!("0x{value:08X}")
}

pub(crate) fn format_hex_usize(value: usize) -> String {
    format!("0x{value:X}")
}

pub(crate) fn le_bytes4(value: u32) -> String {
    bytes_to_hex_upper_spaced(&value.to_le_bytes())
}

pub(crate) fn pool_name(pool: ParamCommandPool, hash: u32) -> Option<&'static str> {
    pool.iter()
        .find(|(candidate, _, _)| *candidate == hash)
        .map(|(_, _, name)| *name)
}

pub(crate) fn pool_hash_by_field(pool: ParamCommandPool, field: &str) -> Option<u32> {
    let normalized = normalize_type_name(field);
    // Accept legacy "*LabelOffset" names for kind-7 string fields renamed to "*Label".
    let without_offset = field.strip_suffix("Offset").unwrap_or(field);
    let normalized_no_offset = normalize_type_name(without_offset);
    pool.iter()
        .find(|(_, _, name)| {
            *name == normalized
                || *name == normalized_no_offset
                || snake_to_camel(name) == field
                || snake_to_camel(name) == without_offset
                || name.eq_ignore_ascii_case(field)
                || name.eq_ignore_ascii_case(without_offset)
        })
        .map(|(hash, _, _)| *hash)
}

pub(crate) fn parse_u32_arg(value: &str) -> Result<u32, String> {
    if let Some(hex) = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
    {
        u32::from_str_radix(hex, 16).map_err(|e| format!("Invalid hex u32 '{value}': {e}"))
    } else {
        value
            .parse::<u32>()
            .map_err(|e| format!("Invalid decimal u32 '{value}': {e}"))
    }
}

pub(crate) fn parse_u32_value(value: &Value, label: &str) -> Result<u32, String> {
    match value {
        Value::Number(number) => {
            if let Some(unsigned) = number.as_u64() {
                return u32::try_from(unsigned).map_err(|_| format!("{label} is out of u32 range"));
            }
            if let Some(signed) = number.as_i64() {
                return Ok(signed as u32);
            }
            Err(format!("{label} must be an integer"))
        }
        Value::String(text) => parse_u32_arg(text),
        Value::Object(map) => {
            if let Some(hex) = map.get("hex").and_then(Value::as_str) {
                return parse_u32_arg(hex);
            }
            if let Some(raw) = map.get("value") {
                return parse_u32_value(raw, label);
            }
            Err(format!("{label} object must contain 'hex' or 'value'"))
        }
        _ => Err(format!("{label} must be a number, string, or hash object")),
    }
}

pub(crate) fn parse_usize_value(value: &Value, label: &str) -> Result<usize, String> {
    let raw = parse_u32_value(value, label)?;
    usize::try_from(raw).map_err(|_| format!("{label} is out of usize range"))
}

pub(crate) fn parse_i32_bits_value(value: &Value, label: &str) -> Result<i32, String> {
    match value {
        Value::Number(number) => {
            if let Some(signed) = number.as_i64() {
                return i32::try_from(signed).map_err(|_| format!("{label} is out of i32 range"));
            }
            if let Some(unsigned) = number.as_u64() {
                let raw = u32::try_from(unsigned)
                    .map_err(|_| format!("{label} is out of u32 bit-pattern range"))?;
                return Ok(raw as i32);
            }
            Err(format!("{label} must be an integer"))
        }
        Value::String(_) | Value::Object(_) => Ok(parse_u32_value(value, label)? as i32),
        _ => Err(format!("{label} must be a number, string, or hash object")),
    }
}

pub(crate) fn parse_raw_value_for_kind(
    kind: u32,
    value: &Value,
    label: &str,
) -> Result<u32, String> {
    match kind {
        KIND_U32 => parse_u32_value(value, label),
        KIND_I32 => Ok(parse_i32_bits_value(value, label)? as u32),
        KIND_F32 => {
            let number = value
                .as_f64()
                .ok_or_else(|| format!("{label} must be a number for f32 field"))?;
            Ok(f32::to_bits(number as f32))
        }
        _ => parse_u32_value(value, label),
    }
}

pub(crate) fn raw_value_json(kind: u32, raw: u32) -> Value {
    match kind {
        KIND_U32 => json!(raw),
        KIND_I32 => json!(i32::from_le_bytes(raw.to_le_bytes())),
        KIND_F32 => json!(f32::from_bits(raw)),
        _ => json!(raw),
    }
}

pub(crate) fn object_field<'a>(
    object: &'a Value,
    key: &str,
    label: &str,
) -> Result<&'a Value, String> {
    object
        .as_object()
        .and_then(|map| map.get(key))
        .ok_or_else(|| format!("{label} requires '{key}'"))
}

pub(crate) fn optional_bool(object: &Value, key: &str) -> bool {
    object
        .as_object()
        .and_then(|map| map.get(key))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}
