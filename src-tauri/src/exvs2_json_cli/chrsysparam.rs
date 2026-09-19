//! `exvs2-json` support for `chrsysparam.csyspm` (new-generation MSC action table).

use std::path::Path;

use serde_json::{json, Value};

use super::edit::op_name;
use super::types::InspectOptions;
use super::util::{format_hex_u32, insert_object_field, insert_roundtrip};
use crate::format::chrsysparam::{build_chrsysparam, parse_chrsysparam, ChrSysParamFile, ChrSysParamTable};
use crate::format::chrsysparam_document::{from_document, parse_cell_value, to_document};
use crate::format::chrsysparam_msc_links::{resolve_msc_links, ChrSysMscLinks};
use crate::format::chrsysparam_schema::{field_specs, route_for_row, ChrSysTableKind};
use crate::format::chrsysparam_validate::{form_mask, is_input_selectable, validate_chrsysparam};

const ACTION_HASH: usize = 0x2E;
const DERIVED_FIELDS: std::ops::RangeInclusive<usize> = 0x30..=0x39;
const DERIVED_DELAY_BASE: usize = 0x59;
const TRANSITION_RANGE_FIRST: usize = 0x7E;
const TRANSITION_RANGE_LAST: usize = 0x7F;

fn cell(row: &[u32], field: usize) -> u32 {
    row.get(field).copied().unwrap_or(0)
}

fn function_for(entries: &[crate::format::chrsysparam_msc_links::ResolvedKey], key: u32) -> Value {
    entries
        .iter()
        .find(|entry| entry.key == key)
        .map(|entry| match (&entry.function, entry.raw_value) {
            (Some(function), _) => json!(function),
            (None, Some(raw)) => json!(format!("unresolved raw 0x{raw:X}")),
            (None, None) => Value::Null,
        })
        .unwrap_or(Value::Null)
}

fn action_summaries(file: &ChrSysParamFile, links: Option<&ChrSysMscLinks>) -> Vec<Value> {
    let rows = &file.action_table.rows;
    rows.iter()
        .enumerate()
        .skip(1)
        .map(|(index, row)| {
            let derived: Vec<Value> = DERIVED_FIELDS
                .filter(|field| cell(row, *field) != 0)
                .map(|field| {
                    let hash = cell(row, field);
                    json!({
                        "slot": field - DERIVED_FIELDS.start(),
                        "actionHash": format_hex_u32(hash),
                        "row": rows.iter().position(|candidate| cell(candidate, ACTION_HASH) == hash),
                        "delayFrames": cell(row, DERIVED_DELAY_BASE + field - DERIVED_FIELDS.start()) as i32,
                    })
                })
                .collect();
            let hook = |field: usize| {
                let key = cell(row, field);
                json!({
                    "key": format_hex_u32(key),
                    "function": links.filter(|_| key != 0).map_or(Value::Null, |links| function_for(&links.phase_callbacks, key)),
                })
            };
            let group = cell(row, 0x0A);
            let command_type = cell(row, 0x03) as i32;
            json!({
                "row": index,
                "actionHash": format_hex_u32(cell(row, ACTION_HASH)),
                "formMask": format_hex_u32(form_mask(row)),
                "commandType": command_type,
                "buttonBit": if command_type >= 0 && command_type % 100 < 32 { json!(format_hex_u32(1 << (command_type % 100))) } else { Value::Null },
                "leverMask": format_hex_u32(cell(row, 0x04)),
                "inputSelectable": is_input_selectable(row),
                "armsSlot": cell(row, 0x08) as i32,
                "emptyAmmoPolicy": cell(row, 0x09) as i32,
                "archetypeGroup": group,
                "groupEnter": links.map_or(Value::Null, |links| function_for(&links.group_callbacks, group)),
                "route": route_for_row(row).map(|(route, flags)| json!({ "route": route, "flags": format_hex_u32(flags) })),
                "hooks": { "enter": hook(0x7C), "tick": hook(0x02), "exit": hook(0x7D) },
                "derived": derived,
                "transitionRange": [cell(row, TRANSITION_RANGE_FIRST) as i32, cell(row, TRANSITION_RANGE_LAST) as i32],
            })
        })
        .collect()
}

pub(super) fn inspect_chrsysparam(bytes: &[u8], options: &InspectOptions) -> Result<Value, String> {
    let file = parse_chrsysparam(bytes)?;
    let links = options
        .msc_dir
        .as_deref()
        .map(|dir| resolve_msc_links(Path::new(dir)))
        .transpose()?;
    let issues = serde_json::to_value(validate_chrsysparam(&file, links.as_ref()))
        .map_err(|e| format!("Serialize issues failed: {e}"))?;
    let actions = action_summaries(&file, links.as_ref());

    let mut data = json!({
        "unitId": file.unit_id,
        "actionTable": { "rows": file.action_table.rows.len(), "columns": file.action_table.columns },
        "transitionTable": { "rows": file.transition_table.rows.len(), "columns": file.transition_table.columns },
        "actions": actions,
        "issues": issues,
    });
    if !options.summary {
        insert_object_field(&mut data, "document", to_document(&file))?;
    }
    if let Some(links) = links {
        insert_object_field(
            &mut data,
            "mscLinks",
            serde_json::to_value(&links).map_err(|e| format!("Serialize links failed: {e}"))?,
        )?;
    }
    if options.roundtrip_check {
        insert_roundtrip(&mut data, bytes, &build_chrsysparam(&file)?)?;
    }
    Ok(data)
}

fn table_kind(operation: &Value) -> Result<ChrSysTableKind, String> {
    match operation.get("table").and_then(Value::as_str) {
        Some("action") => Ok(ChrSysTableKind::Action),
        Some("transition") => Ok(ChrSysTableKind::Transition),
        other => Err(format!("chrsysparam operation needs table 'action' or 'transition', got {other:?}")),
    }
}

fn table_mut(file: &mut ChrSysParamFile, kind: ChrSysTableKind) -> &mut ChrSysParamTable {
    match kind {
        ChrSysTableKind::Action => &mut file.action_table,
        ChrSysTableKind::Transition => &mut file.transition_table,
    }
}

fn row_index(operation: &Value, key: &str, table: &ChrSysParamTable) -> Result<usize, String> {
    let row = operation
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("chrsysparam operation needs non-negative integer '{key}'"))? as usize;
    if row >= table.rows.len() {
        return Err(format!("{key} {row} is out of range (table has {} rows)", table.rows.len()));
    }
    Ok(row)
}

fn field_index(kind: ChrSysTableKind, columns: u32, field: &Value) -> Result<usize, String> {
    let index = match field {
        Value::String(key) => field_specs(kind, columns)
            .into_iter()
            .find(|spec| &spec.key == key)
            .map(|spec| spec.field)
            .ok_or_else(|| format!("unknown chrsysparam field key '{key}'"))?,
        other => parse_cell_value(other, "field")?,
    };
    if index >= columns {
        return Err(format!("field 0x{index:X} is outside the {columns} table columns"));
    }
    Ok(index as usize)
}

fn apply_overrides(kind: ChrSysTableKind, columns: u32, row: &mut [u32], overrides: Option<&Value>) -> Result<(), String> {
    let Some(overrides) = overrides else { return Ok(()) };
    let overrides = overrides
        .as_object()
        .ok_or_else(|| "'fields' must be an object of field key -> value".to_string())?;
    for (key, value) in overrides {
        let index = field_index(kind, columns, &json!(key))?;
        row[index] = parse_cell_value(value, &format!("fields.{key}"))?;
    }
    Ok(())
}

fn delete_row(file: &mut ChrSysParamFile, kind: ChrSysTableKind, row: usize) -> Result<Value, String> {
    if row == 0 {
        return Err("row 0 is reserved and cannot be deleted".to_string());
    }
    match kind {
        ChrSysTableKind::Action => {
            let hash = cell(&file.action_table.rows[row], ACTION_HASH);
            if hash != 0 {
                if let Some(source) = file.action_table.rows.iter().position(|candidate| {
                    DERIVED_FIELDS.clone().any(|field| cell(candidate, field) == hash)
                }) {
                    return Err(format!(
                        "action row {row} (0x{hash:08X}) is a derived target of row {source}; clear that link first"
                    ));
                }
            }
            file.action_table.rows.remove(row);
            Ok(json!({ "deletedRow": row, "actionHash": format_hex_u32(hash) }))
        }
        ChrSysTableKind::Transition => {
            let deleted = row as i32;
            let mut shifted = Vec::new();
            for (index, action) in file.action_table.rows.iter_mut().enumerate() {
                let first = cell(action, TRANSITION_RANGE_FIRST) as i32;
                let last = cell(action, TRANSITION_RANGE_LAST) as i32;
                if first < 0 {
                    continue;
                }
                if first <= deleted && deleted <= last {
                    return Err(format!("transition row {row} is inside the range of action row {index}; edit that range first"));
                }
                if first > deleted {
                    action[TRANSITION_RANGE_FIRST] = (first - 1) as u32;
                    action[TRANSITION_RANGE_LAST] = (last - 1) as u32;
                    shifted.push(index);
                }
            }
            file.transition_table.rows.remove(row);
            Ok(json!({ "deletedRow": row, "shiftedActionRanges": shifted }))
        }
    }
}

pub(super) fn edit_chrsysparam(bytes: &[u8], operations: &[Value]) -> Result<(Vec<u8>, Vec<Value>), String> {
    let mut file = parse_chrsysparam(bytes)?;
    let mut applied = Vec::with_capacity(operations.len());
    for operation in operations {
        let name = op_name(operation)?;
        let result = match name {
            "replaceChrSysDocument" => {
                let document = operation
                    .get("document")
                    .ok_or_else(|| "replaceChrSysDocument needs 'document'".to_string())?;
                file = from_document(document)?;
                json!({ "replaced": true })
            }
            "setChrSysField" => {
                let kind = table_kind(operation)?;
                let table = table_mut(&mut file, kind);
                let row = row_index(operation, "row", table)?;
                let field = field_index(kind, table.columns, operation.get("field").ok_or("setChrSysField needs 'field'")?)?;
                let value = parse_cell_value(operation.get("value").ok_or("setChrSysField needs 'value'")?, "value")?;
                let before = table.rows[row][field];
                table.rows[row][field] = value;
                json!({ "row": row, "field": field, "before": format_hex_u32(before), "after": format_hex_u32(value) })
            }
            "appendChrSysRow" => {
                let kind = table_kind(operation)?;
                let table = table_mut(&mut file, kind);
                let source = row_index(operation, "cloneFromRow", table)?;
                let mut row = table.rows[source].clone();
                apply_overrides(kind, table.columns, &mut row, operation.get("fields"))?;
                table.rows.push(row);
                json!({ "newRow": table.rows.len() - 1, "clonedFrom": source })
            }
            "deleteChrSysRow" => {
                let kind = table_kind(operation)?;
                let row = row_index(operation, "row", table_mut(&mut file, kind))?;
                delete_row(&mut file, kind, row)?
            }
            other => {
                return Err(format!(
                    "unsupported chrsysparam op '{other}'. Use replaceChrSysDocument, setChrSysField, appendChrSysRow or deleteChrSysRow"
                ))
            }
        };
        applied.push(json!({ "op": name, "result": result }));
    }
    let rebuilt = build_chrsysparam(&file)?;
    Ok((rebuilt, applied))
}
