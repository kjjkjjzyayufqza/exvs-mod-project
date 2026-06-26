use std::collections::HashMap;
use std::str::FromStr;

use serde_json::{json, Map as JsonMap, Value};

use crate::format::param_bin_format::ParamFieldSpec;

pub const KIND_U32: u32 = 1;
pub const KIND_I32: u32 = 2;
pub const KIND_F32: u32 = 5;

pub type ParamCommandPool = &'static [(u32, u32, &'static str)];

pub fn snake_to_camel(name: &str) -> String {
    let parts: Vec<&str> = name.split('_').collect();
    if parts.is_empty() {
        return String::new();
    }
    let mut s = String::new();
    s.push_str(parts[0]);
    for p in parts.iter().skip(1) {
        if p.is_empty() {
            continue;
        }
        let mut c = p.chars();
        if let Some(f) = c.next() {
            s.extend(f.to_uppercase());
            s.push_str(c.as_str());
        }
    }
    s
}

pub fn pool_kind_by_hash(pool: ParamCommandPool, hash: u32) -> Option<u32> {
    pool.iter()
        .find(|(h, _, _)| *h == hash)
        .map(|(_, k, _)| *k)
}

pub fn is_hash_in_pool(pool: ParamCommandPool, hash: u32) -> bool {
    pool.iter().any(|(h, _, _)| *h == hash)
}

pub fn hash_and_kind_for_camel_key(pool: ParamCommandPool, key: &str) -> Option<(u32, u32)> {
    for &(h, k, n) in pool {
        if snake_to_camel(n) == key {
            return Some((h, k));
        }
    }
    None
}

pub fn expected_field_specs_ordered_index_times_four(
    pool: ParamCommandPool,
) -> Vec<ParamFieldSpec> {
    pool.iter()
        .enumerate()
        .map(|(index, (hash, kind, _))| ParamFieldSpec {
            hash: *hash,
            entry_offset: (index * 4) as u32,
            flags: 0,
            kind: *kind,
        })
        .collect()
}

pub fn validate_file_specs_kind_match_pool(
    pool: ParamCommandPool,
    field_specs: &[ParamFieldSpec],
) -> Result<(), String> {
    for (index, spec) in field_specs.iter().enumerate() {
        if let Some(expected_kind) = pool_kind_by_hash(pool, spec.hash) {
            if spec.kind != expected_kind {
                return Err(format!(
                    "param command kind mismatch at index {}: hash=0x{:08X}, kind={}, expected_kind={}",
                    index, spec.hash, spec.kind, expected_kind
                ));
            }
        }
    }
    Ok(())
}

pub fn min_entry_data_size_for_specs(field_specs: &[ParamFieldSpec]) -> u32 {
    field_specs
        .iter()
        .map(|s| s.entry_offset.saturating_add(4))
        .max()
        .unwrap_or(0)
}

pub fn read_u32_le(raw: &[u8], offset: usize) -> Option<u32> {
    raw.get(offset..offset + 4)
        .and_then(|b| b.try_into().ok())
        .map(u32::from_le_bytes)
}

pub fn parse_commands_map_from_entry_row(
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
) -> HashMap<u32, u32> {
    let mut commands = HashMap::with_capacity(field_specs.len());
    for spec in field_specs {
        let off = spec.entry_offset as usize;
        if let Some(v) = read_u32_le(raw, off) {
            commands.insert(spec.hash, v);
        }
    }
    commands
}

pub fn entry_row_matches_command_map(
    commands: &HashMap<u32, u32>,
    raw: &[u8],
    field_specs: &[ParamFieldSpec],
) -> bool {
    field_specs.iter().all(|spec| {
        let o = spec.entry_offset as usize;
        read_u32_le(raw, o) == commands.get(&spec.hash).copied()
    })
}

pub fn raw_u32_to_json_for_kind(kind: u32, raw: u32) -> Value {
    match kind {
        KIND_U32 => json!(raw),
        KIND_I32 => json!(i32::from_le_bytes(raw.to_le_bytes())),
        KIND_F32 => json!(f32::from_bits(raw)),
        _ => json!(raw),
    }
}

fn json_to_raw_u32_for_kind(kind: u32, v: &Value) -> Result<u32, String> {
    match kind {
        KIND_U32 => match v {
            Value::Number(n) => {
                if let Some(u) = n.as_u64() {
                    return Ok(u as u32);
                }
                if let Some(i) = n.as_i64() {
                    // Editor/hash fields often round-trip as signed int32 in JSON while the
                    // on-disk format stores the same 32-bit pattern as u32.
                    return Ok(i as u32);
                }
                Err("expected u32 (kind 1)".to_string())
            }
            Value::String(s) => u32::from_str(s.as_str()).map_err(|e| e.to_string()),
            _ => Err("expected u32 (kind 1)".to_string()),
        },
        KIND_I32 => match v {
            Value::Number(n) => {
                let x = n
                    .as_i64()
                    .ok_or_else(|| "expected i32 (kind 2)".to_string())?;
                let i = i32::try_from(x)
                    .map_err(|_| "i32 out of range (kind 2)".to_string())?;
                Ok(i as u32)
            }
            _ => Err("expected i32 (kind 2)".to_string()),
        },
        KIND_F32 => {
            let f = match v {
                Value::Number(n) => n
                    .as_f64()
                    .ok_or_else(|| "expected f32 (kind 5)".to_string())? as f32,
                _ => return Err("expected f32 (kind 5)".to_string()),
            };
            Ok(f32::to_bits(f))
        }
        _ => match v {
            Value::Number(n) => n
                .as_u64()
                .map(|u| u as u32)
                .ok_or_else(|| "expected u32 (unknown kind)".to_string()),
            _ => Err("expected number (unknown kind)".to_string()),
        },
    }
}

pub fn entry_commands_to_named_json(
    entry_id: u32,
    commands: &HashMap<u32, u32>,
    pool: ParamCommandPool,
) -> Value {
    let mut map = JsonMap::new();
    map.insert("entryId".to_string(), json!(entry_id));
    for &(h, kind, name) in pool {
        if let Some(&raw) = commands.get(&h) {
            let key = snake_to_camel(name);
            map.insert(key, raw_u32_to_json_for_kind(kind, raw));
        }
    }
    let mut extra = JsonMap::new();
    for (&h, &v) in commands {
        if !is_hash_in_pool(pool, h) {
            extra.insert(format!("{h}"), json!(v));
        }
    }
    if !extra.is_empty() {
        map.insert("extraCommands".to_string(), Value::Object(extra));
    }
    Value::Object(map)
}

pub fn entry_commands_from_named_json(
    v: &Value,
    pool: ParamCommandPool,
) -> Result<(u32, HashMap<u32, u32>), String> {
    let obj = v
        .as_object()
        .ok_or("param entry: expected JSON object")?;
    let entry_id: u32 = if let Some(e) = obj.get("entryId") {
        if let Some(n) = e.as_u64() {
            n as u32
        } else if let Some(n) = e.as_i64() {
            n as u32
        } else {
            return Err("entryId: invalid".to_string());
        }
    } else {
        0
    };
    let mut commands: HashMap<u32, u32> = HashMap::new();
    for (k, val) in obj {
        if k == "entryId" {
            continue;
        }
        if k == "extraCommands" {
            if let Some(ex) = val.as_object() {
                for (hash_str, v_ex) in ex {
                    let h: u32 = if let Some(rest) = hash_str
                        .strip_prefix("0x")
                        .or_else(|| hash_str.strip_prefix("0X"))
                    {
                        u32::from_str_radix(rest, 16)
                    } else {
                        u32::from_str(hash_str)
                    }
                    .map_err(|e| e.to_string())?;
                    let raw = v_ex
                        .as_u64()
                        .map(|u| u as u32)
                        .or_else(|| v_ex.as_str().and_then(|s| u32::from_str(s).ok()))
                        .ok_or_else(|| format!("extraCommands.{hash_str}: expected u32"))?;
                    commands.insert(h, raw);
                }
            }
            continue;
        }
        if let Some((h, knd)) = hash_and_kind_for_camel_key(pool, k) {
            let raw = json_to_raw_u32_for_kind(knd, val)?;
            commands.insert(h, raw);
        }
    }
    Ok((entry_id, commands))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::format::bulletparam::BULLETPARAM_COMMAND_POOL;

    #[test]
    fn kind_u32_accepts_signed_json_for_hash_bit_pattern() {
        let expected: u32 = 0xD8F283FB;
        let signed = expected as i32;
        let raw = json_to_raw_u32_for_kind(KIND_U32, &json!(signed)).expect("signed hash should save");
        assert_eq!(raw, expected);
    }

    #[test]
    fn secondary_effect_hash_roundtrips_from_signed_editor_json() {
        let expected: u32 = 0xD8F283FB;
        let entry = json!({
            "entryId": 1,
            "secondaryEffectHash": expected as i32,
        });
        let (_, commands) =
            entry_commands_from_named_json(&entry, BULLETPARAM_COMMAND_POOL).expect("entry json");
        assert_eq!(commands.get(&0xD8F283FB).copied(), Some(expected));
    }
}
