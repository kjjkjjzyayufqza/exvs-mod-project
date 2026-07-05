use serde_json::{json, Value};

use super::op_name;
use crate::exvs2_json_cli::util::{format_hex_u32, parse_u32_value, parse_usize_value};
use crate::jnttbl_format::{parse_jnttbl_bytes, serialize_jnttbl, JnttblEntry};

pub(super) fn edit_jnttbl(
    bytes: &[u8],
    operations: &[Value],
    warnings: &mut Vec<String>,
) -> Result<(Vec<u8>, Vec<Value>), String> {
    let mut doc = parse_jnttbl_bytes(bytes)?;
    let mut applied = Vec::with_capacity(operations.len());
    let original_declared_count = doc.bone_count;

    for operation in operations {
        match op_name(operation)? {
            "addJnttblEntry" | "addBoneHash" => {
                let hash = parse_u32_value(
                    operation
                        .get("boneHash")
                        .or_else(|| operation.get("hash"))
                        .ok_or_else(|| "addJnttblEntry requires 'boneHash'".to_string())?,
                    "boneHash",
                )?;
                let bone_index = parse_u32_value(
                    operation
                        .get("boneIndex")
                        .ok_or_else(|| "addJnttblEntry requires 'boneIndex'".to_string())?,
                    "boneIndex",
                )?;
                doc.entries.push(JnttblEntry {
                    hash_id: hash,
                    bone_index,
                });
                applied.push(json!({
                    "op": "addJnttblEntry",
                    "boneHash": format_hex_u32(hash),
                    "boneIndex": bone_index
                }));
            }
            "setJnttblEntry" => {
                let index = find_jnttbl_index(&doc.entries, operation, "setJnttblEntry")?;
                let before = doc.entries[index].clone();
                if let Some(value) = operation.get("newBoneHash").or_else(|| {
                    operation
                        .get("boneHash")
                        .filter(|_| operation.get("index").is_some())
                }) {
                    doc.entries[index].hash_id = parse_u32_value(value, "boneHash")?;
                }
                if let Some(value) = operation.get("newBoneIndex").or_else(|| {
                    operation
                        .get("boneIndex")
                        .filter(|_| operation.get("index").is_some())
                }) {
                    doc.entries[index].bone_index = parse_u32_value(value, "boneIndex")?;
                }
                applied.push(json!({
                    "op": "setJnttblEntry",
                    "index": index,
                    "before": {
                        "boneHash": format_hex_u32(before.hash_id),
                        "boneIndex": before.bone_index
                    },
                    "after": {
                        "boneHash": format_hex_u32(doc.entries[index].hash_id),
                        "boneIndex": doc.entries[index].bone_index
                    }
                }));
            }
            "deleteJnttblEntry" | "deleteBoneHash" => {
                let index = find_jnttbl_index(&doc.entries, operation, "deleteJnttblEntry")?;
                let removed = doc.entries.remove(index);
                applied.push(json!({
                    "op": "deleteJnttblEntry",
                    "index": index,
                    "boneHash": format_hex_u32(removed.hash_id),
                    "boneIndex": removed.bone_index
                }));
            }
            other => {
                return Err(format!(
                    "Operation '{other}' is not valid for jnttbl. Use addJnttblEntry, setJnttblEntry, or deleteJnttblEntry"
                ));
            }
        }
    }

    doc.bone_count = doc.entries.len() as u32;
    if original_declared_count != doc.bone_count {
        warnings.push(format!(
            "jnttbl declared bone count was updated from {original_declared_count} to {}",
            doc.bone_count
        ));
    }

    Ok((serialize_jnttbl(&doc)?, applied))
}

fn find_jnttbl_index(
    entries: &[JnttblEntry],
    operation: &Value,
    label: &str,
) -> Result<usize, String> {
    if let Some(index) = operation.get("index") {
        let index = parse_usize_value(index, "index")?;
        if index >= entries.len() {
            return Err(format!("{label} index {index} is out of range"));
        }
        return Ok(index);
    }

    let hash_value = operation
        .get("matchBoneHash")
        .or_else(|| operation.get("boneHash"))
        .or_else(|| operation.get("hash"))
        .ok_or_else(|| format!("{label} requires 'index' or 'matchBoneHash'"))?;
    let hash = parse_u32_value(hash_value, "matchBoneHash")?;
    let match_bone_index = operation
        .get("matchBoneIndex")
        .map(|value| parse_u32_value(value, "matchBoneIndex"))
        .transpose()?;
    let matches = entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| {
            entry.hash_id == hash
                && match_bone_index
                    .map(|bone_index| bone_index == entry.bone_index)
                    .unwrap_or(true)
        })
        .map(|(index, _)| index)
        .collect::<Vec<_>>();

    match matches.as_slice() {
        [index] => Ok(*index),
        [] => Err(format!("{label} did not match any JNTT entry")),
        _ => Err(format!(
            "{label} matched multiple JNTT entries; include index or matchBoneIndex"
        )),
    }
}
