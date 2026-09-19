//! Links a `chrsysparam.csyspm` action table to the decompiled MSC scripts that consume it.
//!
//! New-generation units (external action table) share one script shape across function
//! numbering changes (NEXA-N `func_849/873/975`, FA Unicorn `func_285/309/437`):
//!
//! ```text
//! 2.c registration:  rows = sys_0(0x700001, 0)
//!                    func_241(actionHash(row), GROUP_RESOLVER(field 0x0A))
//!                    sys_1(0x10002, 0x1f, actionHash, row)
//!                    sys_1(0x10001, 0x10/0x11/0x12, row, PHASE_RESOLVER(ROW_READER(row, 0x02/0x7c/0x7d)))
//! 2.c row loader:    globalN = ROW_READER(currentRow, field)
//! 0.c bridge:        sys_41(1, ...) -> row, sys_0(0x700000, 0, row, field)
//! ```
//!
//! Resolvers either name the target (`return func_398;`) or hold a raw bytecode offset that
//! the sibling `2.txt` table resolves as `pointer = raw + 0x30`.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

const RAW_FUNCTION_POINTER_BIAS: u32 = 0x30;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedKey {
    pub key: u32,
    pub function: Option<String>,
    pub raw_value: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldReader {
    pub function: String,
    pub table: u32,
    pub fields: Vec<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldGlobal {
    pub field: u32,
    pub global: String,
    pub loader_function: String,
    pub reader_functions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChrSysMscLinks {
    pub script_dir: String,
    pub registration_function: String,
    pub group_resolver_function: String,
    pub phase_resolver_function: String,
    pub row_reader_function: String,
    pub group_callbacks: Vec<ResolvedKey>,
    pub phase_callbacks: Vec<ResolvedKey>,
    pub field_globals: Vec<FieldGlobal>,
    pub script_field_readers: Vec<FieldReader>,
    pub input_bridge_readers: Vec<FieldReader>,
    pub pointer_table_available: bool,
}

struct ScriptFunction {
    name: String,
    body: Vec<String>,
}

fn strip_line_comment(line: &str) -> &str {
    line.find("//").map_or(line, |index| &line[..index])
}

fn function_header_name(line: &str) -> Option<&str> {
    let rest = line
        .strip_prefix("int ")
        .or_else(|| line.strip_prefix("void "))?;
    let name = rest.split('(').next()?;
    (name.starts_with("func_") && rest.contains('(')).then_some(name)
}

fn split_functions(source: &str) -> Result<Vec<ScriptFunction>, String> {
    let mut functions = Vec::new();
    let mut lines = source.lines().peekable();
    while let Some(line) = lines.next() {
        let Some(name) = function_header_name(line.trim_end()) else {
            continue;
        };
        let name = name.to_string();
        let mut depth = 0i32;
        let mut body = Vec::new();
        let mut opened = false;
        for body_line in lines.by_ref() {
            let code = strip_line_comment(body_line);
            depth += code.matches('{').count() as i32;
            depth -= code.matches('}').count() as i32;
            if !opened {
                if depth > 0 {
                    opened = true;
                }
                continue;
            }
            if depth <= 0 {
                break;
            }
            body.push(body_line.trim().to_string());
        }
        if !opened || depth != 0 {
            return Err(format!("Unbalanced braces while reading {}", name));
        }
        functions.push(ScriptFunction { name, body });
    }
    Ok(functions)
}

fn parse_int_token(token: &str) -> Option<u32> {
    let token = token.trim().trim_end_matches([';', ')', ',', ':']);
    if let Some(hex) = token.strip_prefix("0x") {
        return u32::from_str_radix(hex, 16).ok();
    }
    if let Some(negative) = token.strip_prefix('-') {
        return negative.parse::<i64>().ok().and_then(|value| {
            (value <= i64::from(i32::MAX) + 1).then(|| (-value) as i32 as u32)
        });
    }
    token.parse::<u32>().ok()
}

fn function_token_after(text: &str, marker: &str) -> Option<String> {
    let start = text.find(marker)? + marker.len();
    let rest = &text[start..];
    let end = rest
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .unwrap_or(rest.len());
    let token = &rest[..end];
    token.starts_with("func_").then(|| token.to_string())
}

fn find_registration(functions: &[ScriptFunction]) -> Result<(&ScriptFunction, String, String, String), String> {
    let registration = functions
        .iter()
        .find(|function| {
            let joined = function.body.join("\n");
            joined.contains("sys_0(0x700001, 0)")
                && joined.contains("func_241(")
                && joined.contains("sys_1(0x10001, 0x10,")
        })
        .ok_or_else(|| {
            "2.c has no chrsysparam registration loop (sys_0(0x700001, 0) + func_241 + sys_1(0x10001, 0x10, ...)); this script is not an external action-table generation MSC".to_string()
        })?;

    let group_resolver = registration
        .body
        .windows(2)
        .find(|pair| pair[1].starts_with("func_241(") && pair[0].contains(" = func_"))
        .and_then(|pair| function_token_after(&pair[0], " = "))
        .ok_or_else(|| format!("{}: cannot find the group resolver call before func_241", registration.name))?;

    let phase_line = registration
        .body
        .iter()
        .find(|line| line.starts_with("sys_1(0x10001, 0x10,"))
        .ok_or_else(|| format!("{}: cannot find the phase slot 0x10 registration", registration.name))?;
    let after_row = phase_line
        .splitn(4, ',')
        .nth(3)
        .ok_or_else(|| format!("{}: malformed phase registration line", registration.name))?;
    let phase_resolver = function_token_after(after_row, " ")
        .ok_or_else(|| format!("{}: cannot read the phase resolver name", registration.name))?;
    let row_reader = function_token_after(after_row, &format!("{}(", phase_resolver))
        .ok_or_else(|| format!("{}: cannot read the row reader name", registration.name))?;

    Ok((registration, group_resolver, phase_resolver, row_reader))
}

fn resolver_key_on_line(line: &str) -> Option<u32> {
    if let Some(rest) = line.strip_prefix("case ") {
        return parse_int_token(rest.trim_end_matches(':'));
    }
    if let Some(index) = line.find("arg0 == ") {
        let rest = &line[index + "arg0 == ".len()..];
        return parse_int_token(rest.split(')').next()?);
    }
    if let Some(index) = line.find(" == arg0") {
        let head = &line[..index];
        return parse_int_token(head.rsplit(['(', ' ']).next()?);
    }
    None
}

fn resolver_value_on_line(line: &str) -> Option<&str> {
    let value = if let Some(rest) = line.strip_prefix("return ") {
        rest
    } else {
        let (lhs, rhs) = line.split_once(" = ")?;
        if !lhs.starts_with("var") {
            return None;
        }
        rhs
    };
    Some(value.trim_end_matches(';').trim())
}

fn parse_resolver(
    function: &ScriptFunction,
    pointer_table: &BTreeMap<u32, String>,
) -> Vec<ResolvedKey> {
    let mut entries = BTreeMap::new();
    let mut pending: Option<u32> = None;
    for line in &function.body {
        if let Some(key) = resolver_key_on_line(line) {
            pending = Some(key);
            continue;
        }
        let Some(key) = pending else { continue };
        let Some(value) = resolver_value_on_line(line) else {
            continue;
        };
        pending = None;
        let resolved = if value.starts_with("func_") {
            ResolvedKey {
                key,
                function: Some(value.to_string()),
                raw_value: None,
            }
        } else if let Some(raw) = parse_int_token(value) {
            ResolvedKey {
                key,
                function: raw
                    .checked_add(RAW_FUNCTION_POINTER_BIAS)
                    .and_then(|pointer| pointer_table.get(&pointer).cloned()),
                raw_value: Some(raw),
            }
        } else {
            continue;
        };
        entries.entry(key).or_insert(resolved);
    }
    entries.into_values().collect()
}

fn parse_pointer_table(text: &str) -> BTreeMap<u32, String> {
    text.lines()
        .filter_map(|line| {
            let rest = line.trim().strip_prefix("[func_name: ")?;
            let (name, pointer) = rest.split_once(", pointer: ")?;
            let pointer = pointer.trim_end_matches(']').trim().parse::<u32>().ok()?;
            Some((pointer, name.to_string()))
        })
        .collect()
}

fn direct_field_readers(functions: &[ScriptFunction]) -> Vec<FieldReader> {
    let mut readers = Vec::new();
    for function in functions {
        let mut by_table: BTreeMap<u32, BTreeSet<u32>> = BTreeMap::new();
        for line in &function.body {
            let mut rest = line.as_str();
            while let Some(index) = rest.find("sys_0(0x700000, ") {
                let call = &rest[index + "sys_0(0x700000, ".len()..];
                let args: Vec<&str> = call.split(')').next().unwrap_or("").split(',').collect();
                if let (Some(table), Some(field)) = (
                    args.first().and_then(|arg| parse_int_token(arg)),
                    args.get(2).and_then(|arg| parse_int_token(arg)),
                ) {
                    by_table.entry(table).or_default().insert(field);
                }
                rest = call;
            }
        }
        for (table, fields) in by_table {
            readers.push(FieldReader {
                function: function.name.clone(),
                table,
                fields: fields.into_iter().collect(),
            });
        }
    }
    readers
}

fn global_tokens(line: &str) -> Vec<&str> {
    let bytes = line.as_bytes();
    let mut tokens = Vec::new();
    let mut search = 0;
    while let Some(offset) = line[search..].find("global") {
        let start = search + offset;
        let preceded_by_word = start > 0 && {
            let previous = bytes[start - 1];
            previous.is_ascii_alphanumeric() || previous == b'_'
        };
        let digits_end = line[start + 6..]
            .find(|c: char| !c.is_ascii_digit())
            .map_or(line.len(), |index| start + 6 + index);
        if !preceded_by_word && digits_end > start + 6 {
            tokens.push(&line[start..digits_end]);
        }
        search = digits_end.max(start + 6);
    }
    tokens
}

fn field_globals(functions: &[ScriptFunction], row_reader: &str) -> Vec<FieldGlobal> {
    let marker = format!(" = {}(", row_reader);
    let mut loaded: BTreeMap<u32, (String, String)> = BTreeMap::new();
    for function in functions {
        for line in &function.body {
            let Some(index) = line.find(&marker) else { continue };
            let global = &line[..index];
            if !global.starts_with("global") || global.contains(' ') {
                continue;
            }
            let args = &line[index + marker.len()..];
            let Some(field) = args
                .split(')')
                .next()
                .and_then(|inner| inner.rsplit(',').next())
                .and_then(parse_int_token)
            else {
                continue;
            };
            loaded
                .entry(field)
                .or_insert_with(|| (global.to_string(), function.name.clone()));
        }
    }

    let wanted: BTreeSet<&str> = loaded.values().map(|(global, _)| global.as_str()).collect();
    let mut readers: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
    for function in functions {
        for line in &function.body {
            if line.contains(&marker) {
                continue;
            }
            for token in global_tokens(line) {
                if wanted.contains(token) {
                    readers.entry(token).or_default().insert(function.name.as_str());
                }
            }
        }
    }

    loaded
        .iter()
        .map(|(field, (global, loader))| FieldGlobal {
            field: *field,
            global: global.clone(),
            loader_function: loader.clone(),
            reader_functions: readers
                .get(global.as_str())
                .map(|names| names.iter().map(|name| name.to_string()).collect())
                .unwrap_or_default(),
        })
        .collect()
}

pub fn resolve_msc_links(script_dir: &Path) -> Result<ChrSysMscLinks, String> {
    let two_c_path = script_dir.join("2.c");
    let two_c = fs::read_to_string(&two_c_path)
        .map_err(|e| format!("Failed to read {}: {}", two_c_path.display(), e))?;
    let functions = split_functions(&two_c)?;
    let (registration, group_resolver, phase_resolver, row_reader) = find_registration(&functions)?;

    let two_txt_path = script_dir.join("2.txt");
    let pointer_table = if two_txt_path.is_file() {
        parse_pointer_table(
            &fs::read_to_string(&two_txt_path)
                .map_err(|e| format!("Failed to read {}: {}", two_txt_path.display(), e))?,
        )
    } else {
        BTreeMap::new()
    };

    let find_function = |name: &str| {
        functions
            .iter()
            .find(|function| function.name == name)
            .ok_or_else(|| format!("2.c references {} but does not define it", name))
    };
    let group_callbacks = parse_resolver(find_function(&group_resolver)?, &pointer_table);
    let phase_callbacks = parse_resolver(find_function(&phase_resolver)?, &pointer_table);

    let zero_c_path = script_dir.join("0.c");
    let input_bridge_readers = if zero_c_path.is_file() {
        let zero_c = fs::read_to_string(&zero_c_path)
            .map_err(|e| format!("Failed to read {}: {}", zero_c_path.display(), e))?;
        direct_field_readers(&split_functions(&zero_c)?)
    } else {
        Vec::new()
    };

    Ok(ChrSysMscLinks {
        script_dir: script_dir.display().to_string(),
        registration_function: registration.name.clone(),
        group_resolver_function: group_resolver,
        phase_resolver_function: phase_resolver,
        field_globals: field_globals(&functions, &row_reader),
        row_reader_function: row_reader,
        group_callbacks,
        phase_callbacks,
        script_field_readers: direct_field_readers(&functions),
        input_bridge_readers,
        pointer_table_available: !pointer_table.is_empty(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
void func_10()
{
    int var0;
    int var1;
    int var2;
    int var3;
    int var4;
    var0 = sys_0(0x700001, 0);
    var1 = 0x1;
    while (var1 < var0)
    {
        var2 = sys_0(0x700000, 0, var1, 0x2e);
        var3 = sys_0(0x700000, 0, var1, 0xa);
        var4 = func_11(var3);
        func_241(var2, var4);
        var1++;
    }
    var1 = 0x1;
    while (var1 < var0)
    {
        sys_1(0x10001, 0x10, var1, func_12(func_13(var1, 0x2)));
        var1++;
    }
}

int func_11(int arg0)
{
    if (arg0 < 0)
    {

    }
    else if (arg0 == 0x3)
    {
        return func_20;
    }
    else if (arg0 == 0xc)
    {
        return 0x100;
    }
    return 0;
}

int func_12(int arg0)
{
    int var1;
    if (0x7f00 < arg0)
    {
        if (0x7f9e131d == arg0)
        {
            var1 = func_21;
        }
    }
    switch(arg0) {
        case 0x81e0f737:
            var1 = func_22;
            break;
    }
    return var1;
}

int func_13(int arg0, int arg1)
{
    int var2;
    var2 = sys_0(0x700000, 0, arg0, arg1);
    return var2;
}

void func_14()
{
    global501 = func_13(global496, 0x2e);
    global502 = func_13(global496, 0x8);
}

void func_15()
{
    if (global501 != 0)
    {
        sys_4F(0, global502, 0x1234);
    }
}
"#;

    #[test]
    fn resolves_registration_resolvers_and_row_loader() {
        let functions = split_functions(SAMPLE).expect("split");
        let (registration, group, phase, reader) = find_registration(&functions).expect("registration");
        assert_eq!(registration.name, "func_10");
        assert_eq!((group.as_str(), phase.as_str(), reader.as_str()), ("func_11", "func_12", "func_13"));

        let pointers = BTreeMap::from([(0x130, "func_30".to_string())]);
        let groups = parse_resolver(&functions[1], &pointers);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].function.as_deref(), Some("func_20"));
        assert_eq!(groups[1].function.as_deref(), Some("func_30"));
        assert_eq!(groups[1].raw_value, Some(0x100));

        let phases = parse_resolver(&functions[2], &pointers);
        assert_eq!(phases.iter().map(|entry| entry.key).collect::<Vec<_>>(), vec![0x7f9e131d, 0x81e0f737]);

        let globals = field_globals(&functions, "func_13");
        assert_eq!(globals.len(), 2);
        assert_eq!(globals[0].field, 0x8);
        assert_eq!(globals[0].reader_functions, vec!["func_15".to_string()]);
    }

    #[test]
    fn classic_scripts_are_rejected_explicitly() {
        let functions = split_functions("void func_0()\n{\n    func_241(0x1, func_2);\n}\n").expect("split");
        let err = find_registration(&functions).err().expect("classic script must be rejected");
        assert!(err.contains("not an external action-table generation"), "unexpected: {}", err);
    }
}
