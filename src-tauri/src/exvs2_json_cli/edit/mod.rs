mod character_id;
mod jnttbl;
mod param_table;

use std::fs;

use serde_json::{json, Value};

use super::inspect::{detect_type, inspect_bytes};
use super::types::{InspectOptions, InspectType};
use super::util::supported_edit_type_list;
use super::{SCHEMA_VERSION, TOOL_NAME};
use crate::format::armsparam::{build_armsparam, parse_armsparam, ARMSPARAM_COMMAND_POOL};
use crate::format::bulletparam::{build_bulletparam, parse_bulletparam, BULLETPARAM_COMMAND_POOL};
use crate::format::projectile_depiction_table::{
    build_projectile_depiction_table, parse_projectile_depiction_table,
    PROJECTILE_DEPICTION_TABLE_COMMAND_POOL,
};
use crate::format::speedparam::{build_speedparam, parse_speedparam, SPEEDPARAM_COMMAND_POOL};
use crate::format::vernier_table::{
    build_vernier_table, parse_vernier_table, VERNIER_TABLE_COMMAND_POOL,
};

#[derive(Clone, Debug)]
pub(crate) enum EditRequestSource {
    Path(String),
    Inline(String),
}

#[derive(Clone, Debug, Default)]
pub(crate) struct EditOptions {
    pub(crate) inspect_type: Option<InspectType>,
    pub(crate) request_source: Option<EditRequestSource>,
    pub(crate) output_path: Option<String>,
    pub(crate) pretty: bool,
    pub(crate) dry_run: bool,
}

#[derive(Clone, Debug, Default)]
pub struct EditBytesOptions {
    pub inspect_type: Option<InspectType>,
    pub output_path: Option<String>,
    pub dry_run: bool,
}

#[derive(Debug)]
pub struct EditOutcome {
    pub report: Value,
    pub bytes: Vec<u8>,
}

pub(crate) fn edit_path(source_path: &str, options: EditOptions) -> Result<Value, String> {
    let bytes = fs::read(source_path).map_err(|e| format!("Failed to read {source_path}: {e}"))?;
    let request = load_request_json(
        options
            .request_source
            .as_ref()
            .ok_or_else(|| "edit requires a request source".to_string())?,
    )?;
    let output_path = options.output_path.clone().or_else(|| {
        request
            .get("outputPath")
            .and_then(Value::as_str)
            .map(str::to_string)
    });

    if !options.dry_run && output_path.is_none() {
        return Err("edit requires --output <new-file> unless --dry-run is set".to_string());
    }

    let outcome = edit_bytes(
        source_path,
        &bytes,
        &request,
        EditBytesOptions {
            inspect_type: options.inspect_type,
            output_path: output_path.clone(),
            dry_run: options.dry_run,
        },
    )?;

    if !options.dry_run {
        let destination = output_path.expect("validated output path");
        fs::write(&destination, &outcome.bytes)
            .map_err(|e| format!("Failed to write edit output {destination}: {e}"))?;
    }

    Ok(outcome.report)
}

pub fn edit_bytes(
    source_path: &str,
    bytes: &[u8],
    request: &Value,
    options: EditBytesOptions,
) -> Result<EditOutcome, String> {
    let mut warnings = Vec::new();
    let inspect_type = detect_type(source_path, bytes, options.inspect_type, &mut warnings)?;
    if !inspect_type.supports_lossless_edit() {
        return Err(format!(
            "edit does not support {} yet. Supported edit types: {}",
            inspect_type.as_str(),
            supported_edit_type_list()
        ));
    }
    validate_request_type(request, inspect_type)?;
    let operations = request_operations(request)?;

    let (rebuilt, operations_applied) = match inspect_type {
        InspectType::Jnttbl => jnttbl::edit_jnttbl(bytes, operations, &mut warnings)?,
        InspectType::CharacterIdTable => character_id::edit_character_id_table(bytes, operations)?,
        InspectType::VernierTable => param_table::edit_param_table(
            bytes,
            operations,
            VERNIER_TABLE_COMMAND_POOL,
            parse_vernier_table,
            build_vernier_table,
        )?,
        InspectType::ArmsParam => param_table::edit_param_table(
            bytes,
            operations,
            ARMSPARAM_COMMAND_POOL,
            parse_armsparam,
            build_armsparam,
        )?,
        InspectType::BulletParam => param_table::edit_param_table(
            bytes,
            operations,
            BULLETPARAM_COMMAND_POOL,
            parse_bulletparam,
            build_bulletparam,
        )?,
        InspectType::SpeedParam => param_table::edit_param_table(
            bytes,
            operations,
            SPEEDPARAM_COMMAND_POOL,
            parse_speedparam,
            build_speedparam,
        )?,
        InspectType::ProjectileDepictionTable => param_table::edit_param_table(
            bytes,
            operations,
            PROJECTILE_DEPICTION_TABLE_COMMAND_POOL,
            parse_projectile_depiction_table,
            build_projectile_depiction_table,
        )?,
        InspectType::Nusktb | InspectType::Numshb | InspectType::Numdlb => unreachable!(),
    };

    let preview = inspect_bytes(
        source_path,
        &rebuilt,
        InspectOptions {
            inspect_type: Some(inspect_type),
            summary: true,
            ..InspectOptions::default()
        },
    )?;
    if let Some(preview_warnings) = preview.get("warnings").and_then(Value::as_array) {
        for warning in preview_warnings {
            if let Some(warning) = warning.as_str() {
                warnings.push(format!("post-edit inspect: {warning}"));
            }
        }
    }

    let report = json!({
        "tool": TOOL_NAME,
        "schemaVersion": SCHEMA_VERSION,
        "reportType": "edit",
        "sourcePath": source_path,
        "outputPath": options.output_path,
        "detectedType": inspect_type.as_str(),
        "dryRun": options.dry_run,
        "changed": bytes != rebuilt.as_slice(),
        "byteLengthBefore": bytes.len(),
        "byteLengthAfter": rebuilt.len(),
        "operationCount": operations_applied.len(),
        "operationsApplied": operations_applied,
        "warnings": warnings,
        "data": {
            "preview": preview.get("data").cloned().unwrap_or(Value::Null)
        }
    });

    Ok(EditOutcome {
        report,
        bytes: rebuilt,
    })
}

fn load_request_json(source: &EditRequestSource) -> Result<Value, String> {
    let text = match source {
        EditRequestSource::Path(path) => {
            fs::read_to_string(path).map_err(|e| format!("Failed to read request {path}: {e}"))?
        }
        EditRequestSource::Inline(text) => text.clone(),
    };
    serde_json::from_str(&text).map_err(|e| format!("Failed to parse edit request JSON: {e}"))
}

fn validate_request_type(request: &Value, actual: InspectType) -> Result<(), String> {
    let Some(expected) = request
        .get("type")
        .or_else(|| request.get("detectedType"))
        .and_then(Value::as_str)
    else {
        return Ok(());
    };
    let expected = InspectType::parse(expected)?;
    if expected != actual {
        return Err(format!(
            "edit request type {} does not match detected type {}",
            expected.as_str(),
            actual.as_str()
        ));
    }
    Ok(())
}

fn request_operations(request: &Value) -> Result<&[Value], String> {
    request
        .get("operations")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or_else(|| "edit request requires an 'operations' array".to_string())
        .and_then(|operations| {
            if operations.is_empty() {
                Err("edit request operations array is empty".to_string())
            } else {
                Ok(operations)
            }
        })
}

pub(super) fn op_name(operation: &Value) -> Result<&str, String> {
    operation
        .get("op")
        .and_then(Value::as_str)
        .ok_or_else(|| "edit operation requires string field 'op'".to_string())
}
