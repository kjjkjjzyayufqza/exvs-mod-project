use std::collections::HashMap;

use serde_json::{json, Value};

use super::op_name;
use crate::exvs2_json_cli::util::{
    format_hex_u32, object_field, optional_bool, parse_raw_value_for_kind, parse_u32_value,
    pool_hash_by_field, raw_value_json,
};
use crate::format::armsparam::{ArmsParamData, ArmsParamEntry};
use crate::format::bulletparam::{BulletParamData, BulletParamEntry};
use crate::format::grapparam::{GrapParamData, GrapParamEntry};
use crate::format::hitgroupiddef::{HitGroupIdDefData, HitGroupIdDefEntry};
use crate::format::interactionid::{InteractionIdData, InteractionIdEntry};
use crate::format::list_command_pool::{ListData, ListEntry};
use crate::format::param_bin_format::ParamFieldSpec;
use crate::format::param_entry_schema::{entry_commands_from_named_json, ParamCommandPool};
use crate::format::projectile_depiction_table::{
    ProjectileDepictionTableData, ProjectileDepictionTableEntry,
};
use crate::format::speedparam::{SpeedParamData, SpeedParamEntry};
use crate::format::vernier_table::{VernierTableData, VernierTableEntry};

pub(super) trait ParamEntryAccess: Clone {
    fn entry_id(&self) -> u32;
    fn set_entry_id(&mut self, entry_id: u32);
    fn commands(&self) -> &HashMap<u32, u32>;
    fn commands_mut(&mut self) -> &mut HashMap<u32, u32>;
    fn from_parts(entry_id: u32, commands: HashMap<u32, u32>) -> Self;

    /// Optional kind-7 decoded string support (speedparam action/resource labels).
    fn string_field(&self, _hash: u32) -> Option<&str> {
        None
    }

    fn set_string_field(&mut self, _hash: u32, _value: String) -> Result<(), String> {
        Err("string fields are not supported on this param entry type".to_string())
    }
}

pub(super) trait ParamTableAccess {
    type Entry: ParamEntryAccess;

    fn entries(&self) -> &Vec<Self::Entry>;
    fn entries_mut(&mut self) -> &mut Vec<Self::Entry>;
    fn field_specs(&self) -> &[ParamFieldSpec];
}

macro_rules! impl_param_access {
    ($data:ty, $entry:ty) => {
        impl ParamEntryAccess for $entry {
            fn entry_id(&self) -> u32 {
                self.entry_id
            }

            fn set_entry_id(&mut self, entry_id: u32) {
                self.entry_id = entry_id;
            }

            fn commands(&self) -> &HashMap<u32, u32> {
                &self.commands
            }

            fn commands_mut(&mut self) -> &mut HashMap<u32, u32> {
                &mut self.commands
            }

            fn from_parts(entry_id: u32, commands: HashMap<u32, u32>) -> Self {
                Self { entry_id, commands }
            }
        }

        impl ParamTableAccess for $data {
            type Entry = $entry;

            fn entries(&self) -> &Vec<Self::Entry> {
                &self.entries
            }

            fn entries_mut(&mut self) -> &mut Vec<Self::Entry> {
                &mut self.entries
            }

            fn field_specs(&self) -> &[ParamFieldSpec] {
                &self.field_specs
            }
        }
    };
}

impl_param_access!(VernierTableData, VernierTableEntry);
impl_param_access!(ArmsParamData, ArmsParamEntry);
impl_param_access!(BulletParamData, BulletParamEntry);
impl_param_access!(ProjectileDepictionTableData, ProjectileDepictionTableEntry);
impl_param_access!(HitGroupIdDefData, HitGroupIdDefEntry);
impl_param_access!(InteractionIdData, InteractionIdEntry);
impl_param_access!(GrapParamData, GrapParamEntry);

impl ParamEntryAccess for SpeedParamEntry {
    fn entry_id(&self) -> u32 {
        self.entry_id
    }

    fn set_entry_id(&mut self, entry_id: u32) {
        self.entry_id = entry_id;
    }

    fn commands(&self) -> &HashMap<u32, u32> {
        &self.commands
    }

    fn commands_mut(&mut self) -> &mut HashMap<u32, u32> {
        &mut self.commands
    }

    fn from_parts(entry_id: u32, commands: HashMap<u32, u32>) -> Self {
        Self {
            entry_id,
            commands,
            strings: HashMap::new(),
        }
    }

    fn string_field(&self, hash: u32) -> Option<&str> {
        self.strings.get(&hash).map(String::as_str)
    }

    fn set_string_field(&mut self, hash: u32, value: String) -> Result<(), String> {
        self.strings.insert(hash, value);
        Ok(())
    }
}

impl ParamTableAccess for SpeedParamData {
    type Entry = SpeedParamEntry;

    fn entries(&self) -> &Vec<Self::Entry> {
        &self.entries
    }

    fn entries_mut(&mut self) -> &mut Vec<Self::Entry> {
        &mut self.entries
    }

    fn field_specs(&self) -> &[ParamFieldSpec] {
        &self.field_specs
    }
}

impl ParamEntryAccess for ListEntry {
    fn entry_id(&self) -> u32 {
        self.entry_id
    }

    fn set_entry_id(&mut self, entry_id: u32) {
        self.entry_id = entry_id;
    }

    fn commands(&self) -> &HashMap<u32, u32> {
        &self.commands
    }

    fn commands_mut(&mut self) -> &mut HashMap<u32, u32> {
        &mut self.commands
    }

    fn from_parts(entry_id: u32, commands: HashMap<u32, u32>) -> Self {
        Self {
            entry_id,
            commands,
            strings: HashMap::new(),
        }
    }

    fn string_field(&self, hash: u32) -> Option<&str> {
        self.strings.get(&hash).map(String::as_str)
    }

    fn set_string_field(&mut self, hash: u32, value: String) -> Result<(), String> {
        self.strings.insert(hash, value);
        Ok(())
    }
}

impl ParamTableAccess for ListData {
    type Entry = ListEntry;

    fn entries(&self) -> &Vec<Self::Entry> {
        &self.entries
    }

    fn entries_mut(&mut self) -> &mut Vec<Self::Entry> {
        &mut self.entries
    }

    fn field_specs(&self) -> &[ParamFieldSpec] {
        &self.field_specs
    }
}

pub(super) fn edit_param_table<T>(
    bytes: &[u8],
    operations: &[Value],
    pool: ParamCommandPool,
    parse: impl Fn(&[u8]) -> Result<T, String>,
    build: impl Fn(&T) -> Result<Vec<u8>, String>,
) -> Result<(Vec<u8>, Vec<Value>), String>
where
    T: ParamTableAccess,
{
    let mut table = parse(bytes)?;
    let mut applied = Vec::with_capacity(operations.len());

    for operation in operations {
        apply_param_operation(&mut table, pool, operation, &mut applied)?;
    }

    Ok((build(&table)?, applied))
}

fn apply_param_operation<T>(
    table: &mut T,
    pool: ParamCommandPool,
    operation: &Value,
    applied: &mut Vec<Value>,
) -> Result<(), String>
where
    T: ParamTableAccess,
{
    match op_name(operation)? {
        "setParamField" => set_param_field(table, pool, operation, applied),
        "copyParamEntry" => copy_param_entry(table, operation, applied),
        "upsertParamEntry" | "addParamEntry" => upsert_param_entry(table, pool, operation, applied),
        "deleteParamEntry" => delete_param_entry(table, operation, applied),
        other => Err(format!(
            "Operation '{other}' is not valid for typed param tables. Use setParamField, copyParamEntry, upsertParamEntry, or deleteParamEntry"
        )),
    }
}

fn set_param_field<T>(
    table: &mut T,
    pool: ParamCommandPool,
    operation: &Value,
    applied: &mut Vec<Value>,
) -> Result<(), String>
where
    T: ParamTableAccess,
{
    let entry_id = parse_u32_value(
        object_field(operation, "entryId", "setParamField")?,
        "entryId",
    )?;
    let (hash, kind, field_label) = resolve_param_field(table.field_specs(), pool, operation)?;
    let value = object_field(operation, "value", "setParamField")?;
    let index = find_param_entry_index(table.entries(), entry_id)?;

    // Kind 7 = trailing obfuscated C-string (speedparam actionLabel / resourceLabel).
    const KIND_STRING: u32 = 7;
    if kind == KIND_STRING {
        if let Some(s) = value.as_str() {
            let entry = &mut table.entries_mut()[index];
            let before = entry
                .string_field(hash)
                .map(|v| v.to_string())
                .unwrap_or_default();
            entry.set_string_field(hash, s.to_string())?;
            applied.push(json!({
                "op": "setParamField",
                "entryId": entry_id,
                "field": field_label,
                "commandHash": format_hex_u32(hash),
                "before": before,
                "after": s,
                "valueType": "string"
            }));
            return Ok(());
        }
        // Numeric value still allowed: keeps absolute offset without string rewrite.
    }

    let raw = parse_raw_value_for_kind(kind, value, "value")?;
    let entry = &mut table.entries_mut()[index];
    let before = entry.commands().get(&hash).copied();
    entry.commands_mut().insert(hash, raw);
    applied.push(json!({
        "op": "setParamField",
        "entryId": entry_id,
        "field": field_label,
        "commandHash": format_hex_u32(hash),
        "before": before.map(|value| raw_value_json(kind, value)).unwrap_or(Value::Null),
        "after": raw_value_json(kind, raw),
        "rawBefore": before.map(format_hex_u32).unwrap_or_else(|| "null".to_string()),
        "rawAfter": format_hex_u32(raw)
    }));
    Ok(())
}

fn copy_param_entry<T>(
    table: &mut T,
    operation: &Value,
    applied: &mut Vec<Value>,
) -> Result<(), String>
where
    T: ParamTableAccess,
{
    let from_entry_id = parse_u32_value(
        object_field(operation, "fromEntryId", "copyParamEntry")?,
        "fromEntryId",
    )?;
    let new_entry_id = parse_u32_value(
        object_field(operation, "newEntryId", "copyParamEntry")?,
        "newEntryId",
    )?;
    let source_index = find_param_entry_index(table.entries(), from_entry_id)?;
    let replace = optional_bool(operation, "replace");
    if !replace
        && table
            .entries()
            .iter()
            .any(|entry| entry.entry_id() == new_entry_id)
    {
        return Err(format!(
            "copyParamEntry target entryId {new_entry_id} already exists; set replace=true to overwrite"
        ));
    }
    let mut new_entry = table.entries()[source_index].clone();
    new_entry.set_entry_id(new_entry_id);
    if replace {
        if let Some(index) = table
            .entries()
            .iter()
            .position(|entry| entry.entry_id() == new_entry_id)
        {
            table.entries_mut()[index] = new_entry;
        } else {
            table.entries_mut().push(new_entry);
        }
    } else {
        table.entries_mut().push(new_entry);
    }
    applied.push(json!({
        "op": "copyParamEntry",
        "fromEntryId": from_entry_id,
        "newEntryId": new_entry_id,
        "replace": replace
    }));
    Ok(())
}

fn upsert_param_entry<T>(
    table: &mut T,
    pool: ParamCommandPool,
    operation: &Value,
    applied: &mut Vec<Value>,
) -> Result<(), String>
where
    T: ParamTableAccess,
{
    let entry_value = object_field(operation, "entry", "upsertParamEntry")?;
    let (entry_id_from_json, patch_commands) = entry_commands_from_named_json(entry_value, pool)?;
    let entry_id = operation
        .get("entryId")
        .map(|value| parse_u32_value(value, "entryId"))
        .transpose()?
        .unwrap_or(entry_id_from_json);
    let template_entry_id = operation
        .get("templateEntryId")
        .map(|value| parse_u32_value(value, "templateEntryId"))
        .transpose()?;
    let replace_commands = optional_bool(operation, "replaceCommands");
    let existing_index = table
        .entries()
        .iter()
        .position(|entry| entry.entry_id() == entry_id);

    let mut commands = if replace_commands {
        zero_commands_for_specs(table.field_specs())
    } else if let Some(index) = existing_index {
        table.entries()[index].commands().clone()
    } else if let Some(template_entry_id) = template_entry_id {
        let index = find_param_entry_index(table.entries(), template_entry_id)?;
        table.entries()[index].commands().clone()
    } else {
        zero_commands_for_specs(table.field_specs())
    };
    commands.extend(patch_commands);

    // Merge kind-7 decoded labels when the entry JSON carries string fields
    // (speedparam actionLabel / resourceLabel). Non-speed tables ignore these.
    let label_strings = crate::format::speedparam::speedparam_entry_from_json_value(entry_value)
        .map(|e| e.strings)
        .unwrap_or_default();

    if let Some(index) = existing_index {
        *table.entries_mut()[index].commands_mut() = commands;
        for (hash, value) in label_strings {
            let _ = table.entries_mut()[index].set_string_field(hash, value);
        }
        applied.push(json!({
            "op": "upsertParamEntry",
            "entryId": entry_id,
            "mode": "update",
            "replaceCommands": replace_commands
        }));
    } else {
        table
            .entries_mut()
            .push(T::Entry::from_parts(entry_id, commands));
        if let Some(last) = table.entries_mut().last_mut() {
            for (hash, value) in label_strings {
                let _ = last.set_string_field(hash, value);
            }
        }
        applied.push(json!({
            "op": "upsertParamEntry",
            "entryId": entry_id,
            "mode": "insert",
            "templateEntryId": template_entry_id
        }));
    }
    Ok(())
}

fn delete_param_entry<T>(
    table: &mut T,
    operation: &Value,
    applied: &mut Vec<Value>,
) -> Result<(), String>
where
    T: ParamTableAccess,
{
    let entry_id = parse_u32_value(
        object_field(operation, "entryId", "deleteParamEntry")?,
        "entryId",
    )?;
    let index = find_param_entry_index(table.entries(), entry_id)?;
    table.entries_mut().remove(index);
    applied.push(json!({
        "op": "deleteParamEntry",
        "entryId": entry_id
    }));
    Ok(())
}

fn find_param_entry_index<E: ParamEntryAccess>(
    entries: &[E],
    entry_id: u32,
) -> Result<usize, String> {
    let matches = entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| entry.entry_id() == entry_id)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [index] => Ok(*index),
        [] => Err(format!("entryId {entry_id} was not found")),
        _ => Err(format!(
            "entryId {entry_id} appears multiple times; edit would be ambiguous"
        )),
    }
}

fn resolve_param_field(
    field_specs: &[ParamFieldSpec],
    pool: ParamCommandPool,
    operation: &Value,
) -> Result<(u32, u32, String), String> {
    let (hash, label) = if let Some(hash_value) = operation.get("commandHash") {
        let hash = parse_u32_value(hash_value, "commandHash")?;
        (hash, format_hex_u32(hash))
    } else {
        let field = object_field(operation, "field", "setParamField")?
            .as_str()
            .ok_or_else(|| "setParamField field must be a string".to_string())?;
        let hash = pool_hash_by_field(pool, field)
            .ok_or_else(|| format!("Unknown typed-param field '{field}'"))?;
        (hash, field.to_string())
    };

    let spec = field_specs.iter().find(|spec| spec.hash == hash).ok_or_else(|| {
        format!(
            "Command hash {} is not present in this file's fieldSpecs; edit cannot add command descriptors",
            format_hex_u32(hash)
        )
    })?;
    Ok((hash, spec.kind, label))
}

fn zero_commands_for_specs(field_specs: &[ParamFieldSpec]) -> HashMap<u32, u32> {
    field_specs
        .iter()
        .map(|spec| (spec.hash, 0u32))
        .collect::<HashMap<_, _>>()
}
