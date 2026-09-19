//! Human-readable JSON document for `chrsysparam.csyspm`.
//!
//! Every cell is written under its schema key (`actionHash`, `formIndex`, `param0x1C`, ...)
//! so a person can read and edit rows without counting columns. Hash and mask fields are
//! `0x`-prefixed hex strings, other fields are signed integers. On import every cell accepts
//! either a JSON integer (-2^31 ..= 2^32 - 1) or an `0x` hex string of at most eight digits;
//! the document must list every column of every row, and `row` must equal the row position.

use serde_json::{json, Map, Value};

use super::chrsysparam::{
    ChrSysParamFile, ChrSysParamTable, ACTION_TABLE_MARKER, TRANSITION_TABLE_MARKER,
};
use super::chrsysparam_schema::{field_specs, ChrSysFieldSpec, ChrSysTableKind, ChrSysValueFormat};

pub const CHRSYSPARAM_DOCUMENT_SCHEMA: &str = "exvs2.chrsysparam.document.v1";

fn format_cell(spec: &ChrSysFieldSpec, value: u32) -> Value {
    match spec.format {
        ChrSysValueFormat::Hash | ChrSysValueFormat::Mask => json!(format!("0x{:08X}", value)),
        ChrSysValueFormat::Signed => json!(value as i32),
    }
}

pub fn parse_cell_value(value: &Value, context: &str) -> Result<u32, String> {
    match value {
        Value::Number(number) => {
            let integer = number
                .as_i64()
                .ok_or_else(|| format!("{context}: {number} is not an integer"))?;
            if integer < i64::from(i32::MIN) || integer > i64::from(u32::MAX) {
                return Err(format!("{context}: {integer} does not fit in 32 bits"));
            }
            Ok(integer as u32)
        }
        Value::String(text) => {
            let hex = text
                .strip_prefix("0x")
                .or_else(|| text.strip_prefix("0X"))
                .ok_or_else(|| format!("{context}: string value '{text}' must start with 0x"))?;
            if hex.is_empty() || hex.len() > 8 {
                return Err(format!("{context}: '{text}' must have 1 to 8 hex digits"));
            }
            u32::from_str_radix(hex, 16).map_err(|_| format!("{context}: '{text}' is not valid hex"))
        }
        other => Err(format!("{context}: expected an integer or 0x hex string, found {other}")),
    }
}

fn table_to_document(table: &ChrSysParamTable, kind: ChrSysTableKind) -> Value {
    let specs = field_specs(kind, table.columns);
    let rows: Vec<Value> = table
        .rows
        .iter()
        .enumerate()
        .map(|(row_index, cells)| {
            let fields: Map<String, Value> = specs
                .iter()
                .zip(cells)
                .map(|(spec, cell)| (spec.key.clone(), format_cell(spec, *cell)))
                .collect();
            json!({ "row": row_index, "fields": fields })
        })
        .collect();
    json!({
        "reserved": table.reserved,
        "columns": table.columns,
        "rows": rows,
    })
}

pub fn to_document(file: &ChrSysParamFile) -> Value {
    json!({
        "schema": CHRSYSPARAM_DOCUMENT_SCHEMA,
        "unitId": file.unit_id,
        "headerReserved": file.header_reserved,
        "actionTable": table_to_document(&file.action_table, ChrSysTableKind::Action),
        "transitionTable": table_to_document(&file.transition_table, ChrSysTableKind::Transition),
    })
}

fn required<'a>(object: &'a Value, key: &str, context: &str) -> Result<&'a Value, String> {
    object
        .get(key)
        .ok_or_else(|| format!("{context}: missing '{key}'"))
}

fn required_u32(object: &Value, key: &str, context: &str) -> Result<u32, String> {
    parse_cell_value(required(object, key, context)?, &format!("{context}.{key}"))
}

fn table_from_document(
    value: &Value,
    kind: ChrSysTableKind,
    marker: u32,
    context: &str,
) -> Result<ChrSysParamTable, String> {
    let columns = required_u32(value, "columns", context)?;
    let reserved = required_u32(value, "reserved", context)?;
    let specs = field_specs(kind, columns);
    let rows = required(value, "rows", context)?
        .as_array()
        .ok_or_else(|| format!("{context}.rows must be an array"))?;

    let cells = rows
        .iter()
        .enumerate()
        .map(|(row_index, row)| {
            let row_context = format!("{context}.rows[{row_index}]");
            let declared = required(row, "row", &row_context)?
                .as_u64()
                .ok_or_else(|| format!("{row_context}.row must be a non-negative integer"))?;
            if declared != row_index as u64 {
                return Err(format!(
                    "{row_context}.row is {declared} but the entry is at position {row_index}; renumber rows after inserting or deleting"
                ));
            }
            let fields = required(row, "fields", &row_context)?
                .as_object()
                .ok_or_else(|| format!("{row_context}.fields must be an object"))?;
            if let Some(unknown) = fields.keys().find(|key| !specs.iter().any(|spec| &spec.key == *key)) {
                return Err(format!("{row_context}.fields has unknown key '{unknown}'"));
            }
            specs
                .iter()
                .map(|spec| {
                    let field_context = format!("{row_context}.fields.{}", spec.key);
                    let value = fields
                        .get(&spec.key)
                        .ok_or_else(|| format!("{field_context} is missing (every column must be listed)"))?;
                    parse_cell_value(value, &field_context)
                })
                .collect::<Result<Vec<u32>, String>>()
        })
        .collect::<Result<Vec<Vec<u32>>, String>>()?;

    Ok(ChrSysParamTable {
        marker,
        reserved,
        columns,
        rows: cells,
    })
}

pub fn from_document(document: &Value) -> Result<ChrSysParamFile, String> {
    let schema = required(document, "schema", "document")?
        .as_str()
        .ok_or_else(|| "document.schema must be a string".to_string())?;
    if schema != CHRSYSPARAM_DOCUMENT_SCHEMA {
        return Err(format!(
            "document.schema is '{schema}', expected '{CHRSYSPARAM_DOCUMENT_SCHEMA}'"
        ));
    }
    Ok(ChrSysParamFile {
        unit_id: required_u32(document, "unitId", "document")?,
        header_reserved: required_u32(document, "headerReserved", "document")?,
        action_table: table_from_document(
            required(document, "actionTable", "document")?,
            ChrSysTableKind::Action,
            ACTION_TABLE_MARKER,
            "actionTable",
        )?,
        transition_table: table_from_document(
            required(document, "transitionTable", "document")?,
            ChrSysTableKind::Transition,
            TRANSITION_TABLE_MARKER,
            "transitionTable",
        )?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cells_accept_decimal_and_hex_but_reject_other_shapes() {
        assert_eq!(parse_cell_value(&json!(-1), "t").unwrap(), u32::MAX);
        assert_eq!(parse_cell_value(&json!(4294967295u64), "t").unwrap(), u32::MAX);
        assert_eq!(parse_cell_value(&json!("0xdfd66752"), "t").unwrap(), 0xDFD6_6752);
        assert!(parse_cell_value(&json!("123"), "t").is_err());
        assert!(parse_cell_value(&json!("0x123456789"), "t").is_err());
        assert!(parse_cell_value(&json!(1.5), "t").is_err());
        assert!(parse_cell_value(&json!(4294967296u64), "t").is_err());
    }

    #[test]
    fn import_rejects_missing_unknown_and_misnumbered_cells() {
        let file = ChrSysParamFile {
            unit_id: 1,
            header_reserved: 0,
            action_table: ChrSysParamTable {
                marker: ACTION_TABLE_MARKER,
                reserved: 0,
                columns: 3,
                rows: vec![vec![0, 0, 0], vec![0, 1, 2]],
            },
            transition_table: ChrSysParamTable {
                marker: TRANSITION_TABLE_MARKER,
                reserved: 0,
                columns: 1,
                rows: vec![vec![0]],
            },
        };
        let document = to_document(&file);
        assert_eq!(from_document(&document).unwrap(), file);

        let mut missing = document.clone();
        missing["actionTable"]["rows"][1]["fields"]
            .as_object_mut()
            .unwrap()
            .remove("formIndex");
        assert!(from_document(&missing).unwrap_err().contains("formIndex is missing"));

        let mut unknown = document.clone();
        unknown["actionTable"]["rows"][1]["fields"]["bogus"] = json!(1);
        assert!(from_document(&unknown).unwrap_err().contains("unknown key 'bogus'"));

        let mut misnumbered = document;
        misnumbered["actionTable"]["rows"][1]["row"] = json!(5);
        assert!(from_document(&misnumbered).unwrap_err().contains("renumber"));
    }
}
