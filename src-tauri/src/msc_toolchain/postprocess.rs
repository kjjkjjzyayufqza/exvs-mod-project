//! EXVS2 pointer postprocess matching `tools/mscdec.py`.

use std::collections::HashMap;

fn pointer_map(log: &str) -> HashMap<u32, String> {
    let mut map = HashMap::new();
    for line in log.lines() {
        let Some(rest) = line.strip_prefix("[func_name: ") else {
            continue;
        };
        let Some((name, ptr)) = rest.split_once(", pointer: ") else {
            continue;
        };
        let ptr = ptr.trim().trim_end_matches(']');
        if let Ok(p) = ptr.parse::<u32>() {
            map.insert(p, name.to_string());
        }
    }
    map
}

fn has_external_action_table(source: &str) -> bool {
    source.lines().any(|line| {
        let t = line.trim();
        t.contains("= sys_0(0x700000, 0,") && (t.contains(", 0xa)") || t.contains(", 0xa);"))
    })
}

fn has_action_dispatcher(source: &str) -> bool {
    source.contains("sys_1(0x10001, 0x10,")
}

fn to_lines(source: &str) -> Vec<String> {
    source
        .split_inclusive('\n')
        .map(|s| s.to_string())
        .collect()
}

fn join_lines(lines: &[String]) -> String {
    lines.concat()
}

fn parse_hex_after_0x(s: &str) -> Option<(u32, usize)> {
    let bytes = s.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() && bytes[i].is_ascii_hexdigit() {
        i += 1;
    }
    if i == 0 {
        return None;
    }
    u32::from_str_radix(&s[..i], 16).ok().map(|v| (v, i))
}

fn lookup_script(map: &HashMap<u32, String>, hex: u32) -> Option<&String> {
    map.get(&hex.wrapping_add(0x30))
}

fn replace_line_hex_ident(
    line: &str,
    needle_prefix: &str,
    map: &HashMap<u32, String>,
) -> Option<String> {
    let idx = line.find(needle_prefix)?;
    let after = &line[idx + needle_prefix.len()..];
    if !after.starts_with("0x") && !after.starts_with("0X") {
        return None;
    }
    let (val, hex_len) = parse_hex_after_0x(&after[2..])?;
    let rest = &after[2 + hex_len..];
    if !rest.starts_with(';') {
        return None;
    }
    let name = lookup_script(map, val)?;
    let mut out = String::with_capacity(line.len());
    out.push_str(&line[..idx]);
    out.push_str(needle_prefix);
    out.push_str(name);
    out.push_str(rest);
    Some(out)
}

fn find_function_range(lines: &[String], signature: &str) -> Option<(usize, usize)> {
    let start = lines.iter().position(|l| l.contains(signature))?;
    let mut brace = 0i32;
    let mut seen = false;
    for (i, line) in lines.iter().enumerate().skip(start) {
        brace += line.chars().filter(|c| *c == '{').count() as i32;
        brace -= line.chars().filter(|c| *c == '}').count() as i32;
        if line.contains('{') {
            seen = true;
        }
        if seen && brace == 0 {
            return Some((start, i));
        }
    }
    None
}

fn ident_at(s: &str) -> Option<(&str, &str)> {
    let s = s.trim_start();
    let bytes = s.as_bytes();
    if bytes.is_empty() || !(bytes[0].is_ascii_alphabetic() || bytes[0] == b'_') {
        return None;
    }
    let mut i = 1usize;
    while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
        i += 1;
    }
    Some((&s[..i], &s[i..]))
}

fn handle_func_241(lines: &mut [String], map: &HashMap<u32, String>) -> Result<(), String> {
    let mut unresolved = Vec::new();
    for line in lines.iter_mut() {
        let Some(call) = line.find("func_241(") else {
            continue;
        };
        let after = &line[call + 9..];
        let Some(comma) = after.find(',') else {
            continue;
        };
        let second = after[comma + 1..].trim_start();
        if !second.starts_with("0x") && !second.starts_with("0X") {
            continue;
        }
        let Some((val, hex_len)) = parse_hex_after_0x(&second[2..]) else {
            continue;
        };
        let rest = &second[2 + hex_len..];
        if !rest.trim_start().starts_with(')') {
            continue;
        }
        if let Some(name) = lookup_script(map, val) {
            let mut rebuilt = String::new();
            rebuilt.push_str(&line[..call + 9]);
            rebuilt.push_str(&after[..comma + 1]);
            let spaces = after[comma + 1..].len() - second.len();
            rebuilt.push_str(&" ".repeat(spaces));
            rebuilt.push_str(name);
            rebuilt.push_str(rest);
            *line = rebuilt;
        } else {
            unresolved.push(format!("0x{val:x}"));
        }
    }
    if !unresolved.is_empty() {
        unresolved.sort();
        return Err(format!(
            "Unable to resolve func_241 script pointers: {}",
            unresolved.join(", ")
        ));
    }
    Ok(())
}

fn handle_sys1_dispatcher(
    lines: &mut Vec<String>,
    map: &HashMap<u32, String>,
) -> Result<(), String> {
    let mut target = None;
    for line in lines.iter() {
        let Some(idx) = line.find("sys_1(0x10001, 0x10,") else {
            continue;
        };
        let after = &line[idx + "sys_1(0x10001, 0x10,".len()..];
        let after = after.trim_start();
        let Some((_, rest)) = ident_at(after) else {
            continue;
        };
        let rest = rest
            .trim_start()
            .strip_prefix(',')
            .unwrap_or(rest)
            .trim_start();
        if let Some((name, _)) = ident_at(rest) {
            target = Some(name.to_string());
            break;
        }
    }
    let Some(func) = target else {
        return Ok(());
    };
    let signature = format!("int {func}(int arg0)");
    let Some((start, end)) = find_function_range(lines, &signature) else {
        return Ok(());
    };
    let mut unresolved = Vec::new();
    let mut cases: Vec<(String, String)> = Vec::new();
    let mut i = start;
    while i <= end {
        let line = &lines[i];
        if line.contains("== arg0") {
            if let Some(hex_at) = line.find("0x") {
                if let Some((val, hex_len)) = parse_hex_after_0x(&line[hex_at + 2..]) {
                    let hex_text = line[hex_at + 2..hex_at + 2 + hex_len].to_string();
                    let _ = val;
                    let mut j = i + 1;
                    while j < lines.len() {
                        let al = &lines[j];
                        if al.contains("var1 = 0x") {
                            if let Some(idx) = al.find("var1 = 0x") {
                                if let Some((pval, _)) = parse_hex_after_0x(&al[idx + 9..]) {
                                    if let Some(name) = lookup_script(map, pval) {
                                        cases.push((hex_text, name.clone()));
                                    } else {
                                        unresolved.push(format!("0x{pval:x}"));
                                    }
                                }
                            }
                            break;
                        }
                        if al.contains('}') || al.contains("else") {
                            break;
                        }
                        j += 1;
                    }
                }
            }
        }
        if lines[i].contains("var1 = 0x") {
            if let Some(repl) = replace_line_hex_ident(&lines[i], "var1 = ", map) {
                lines[i] = repl;
            } else if let Some(idx) = lines[i].find("var1 = 0x") {
                if let Some((pval, _)) = parse_hex_after_0x(&lines[i][idx + 9..]) {
                    unresolved.push(format!("0x{pval:x}"));
                }
            }
        }
        i += 1;
    }
    if !unresolved.is_empty() {
        unresolved.sort();
        unresolved.dedup();
        return Err(format!(
            "Unable to resolve script pointers in {signature}: {}",
            unresolved.join(", ")
        ));
    }
    if cases.len() >= 5 {
        let generated = switch_function_lines(&func, &cases);
        lines.splice(start..=end, generated);
    }
    Ok(())
}

fn handle_table_returns(lines: &mut [String], map: &HashMap<u32, String>) -> Result<(), String> {
    let mut target = None;
    for (i, line) in lines.iter().enumerate() {
        if !(line.contains("sys_0(0x700000") && line.contains("0xa)")) {
            continue;
        }
        let Some(eq) = line.find('=') else {
            continue;
        };
        let lhs = line[..eq].trim();
        let Some(table_var) = lhs.split_whitespace().last() else {
            continue;
        };
        let next = lines.get(i + 1).map(|s| s.as_str()).unwrap_or("");
        if let Some(eq2) = next.find('=') {
            let rhs = next[eq2 + 1..].trim_start();
            if let Some((name, rest)) = ident_at(rhs) {
                let rest = rest.trim_start();
                if rest.starts_with('(') && rest.contains(table_var) {
                    target = Some(name.to_string());
                    break;
                }
            }
        }
    }
    let Some(func) = target else {
        return Ok(());
    };
    let signature = format!("int {func}(int arg0)");
    let Some((start, end)) = find_function_range(lines, &signature) else {
        return Ok(());
    };
    let mut unresolved = Vec::new();
    for line in &mut lines[start..=end] {
        if line.contains("return var1;") {
            break;
        }
        if line.contains("return 0x") {
            if let Some(repl) = replace_line_hex_ident(line, "return ", map) {
                *line = repl;
            } else if let Some(idx) = line.find("return 0x") {
                if let Some((pval, _)) = parse_hex_after_0x(&line[idx + 9..]) {
                    unresolved.push(format!("0x{pval:x}"));
                }
            }
        }
    }
    if !unresolved.is_empty() {
        unresolved.sort();
        unresolved.dedup();
        return Err(format!(
            "Unable to resolve script pointers in {signature}: {}",
            unresolved.join(", ")
        ));
    }
    Ok(())
}

fn switch_function_lines(func_name: &str, cases: &[(String, String)]) -> Vec<String> {
    let mut sorted = cases.to_vec();
    sorted.sort_by_key(|(h, _)| u32::from_str_radix(h, 16).unwrap_or(0));
    let mut lines = Vec::new();
    lines.push(format!("int {func_name}(int arg0)\n"));
    lines.push("{\n".into());
    lines.push("    int var1;\n".into());
    lines.push("    switch(arg0) {\n".into());
    for (hex_value, func_ref) in &sorted {
        lines.push(format!("        case 0x{hex_value}:\n"));
        lines.push(format!("            var1 = {func_ref};\n"));
        lines.push("            break;\n".into());
    }
    lines.push("        default:\n".into());
    lines.push("            var1 = 0; // Default case - no function found\n".into());
    lines.push("            break;\n".into());
    lines.push("    }\n".into());
    lines.push("    return var1;\n".into());
    lines.push("}\n".into());
    lines
}

fn extract_switch_cases(func_body: &str) -> Vec<(String, String)> {
    let mut cases = Vec::new();
    let mut rest = func_body;
    while let Some(if_at) = rest.find("if") {
        let slice = &rest[if_at..];
        let Some(paren) = slice.find('(') else {
            rest = &rest[if_at + 2..];
            continue;
        };
        let inner = &slice[paren + 1..];
        let hex_pos = match inner.find("0x") {
            Some(p) => p,
            None => {
                rest = &rest[if_at + 2..];
                continue;
            }
        };
        let Some((.., hex_len)) = parse_hex_after_0x(&inner[hex_pos + 2..]) else {
            rest = &rest[if_at + 2..];
            continue;
        };
        let hex_text = inner[hex_pos + 2..hex_pos + 2 + hex_len].to_string();
        let after_hex = &inner[hex_pos + 2 + hex_len..];
        if !after_hex.trim_start().starts_with("==") || !after_hex.contains("arg0") {
            rest = &rest[if_at + 2..];
            continue;
        }
        let Some(assign) = slice.find("var1 = ") else {
            rest = &rest[if_at + 2..];
            continue;
        };
        let rhs = slice[assign + 7..].trim_start();
        if let Some((name, _)) = ident_at(rhs) {
            if name.starts_with("func_") {
                let pair = (hex_text, name.to_string());
                if !cases.contains(&pair) {
                    cases.push(pair);
                }
            }
        }
        rest = &rest[if_at + 2..];
    }
    cases
}

fn convert_nested_if_else(lines: &mut Vec<String>) {
    let mut functions = Vec::new();
    let mut i = 0usize;
    while i < lines.len() {
        let stripped = lines[i].trim();
        let Some(rest) = stripped.strip_prefix("int ") else {
            i += 1;
            continue;
        };
        let Some((name, after)) = ident_at(rest) else {
            i += 1;
            continue;
        };
        if !after.trim_start().starts_with("(int arg0)") {
            i += 1;
            continue;
        }
        let start = i;
        let mut j = i;
        while j < lines.len() && !lines[j].contains('{') {
            j += 1;
        }
        if j >= lines.len() {
            i += 1;
            continue;
        }
        let mut brace = 0i32;
        let mut end = j;
        let mut found = false;
        for k in j..lines.len() {
            brace += lines[k].chars().filter(|c| *c == '{').count() as i32;
            brace -= lines[k].chars().filter(|c| *c == '}').count() as i32;
            if brace == 0 {
                end = k;
                found = true;
                break;
            }
        }
        if !found {
            i += 1;
            continue;
        }
        let body: String = lines[j..=end].concat();
        if body.contains("int var1;") && body.contains("return var1;") {
            let hex_n = body.matches("== arg0").count();
            let assign_n = body.matches("var1 = func_").count();
            if hex_n >= 5 && assign_n >= 5 {
                let cases = extract_switch_cases(&body);
                if cases.len() >= 5 {
                    functions.push((start, end, name.to_string(), cases));
                }
            }
        }
        i = end + 1;
    }
    for (start, end, name, cases) in functions.into_iter().rev() {
        let generated = switch_function_lines(&name, &cases);
        lines.splice(start..=end, generated);
    }
}

pub fn postprocess_c(source: &str, log: &str) -> Result<String, String> {
    if !has_external_action_table(source) || !has_action_dispatcher(source) {
        return Ok(source.to_string());
    }
    let map = pointer_map(log);
    let mut lines = to_lines(source);
    handle_func_241(&mut lines, &map)?;
    handle_sys1_dispatcher(&mut lines, &map)?;
    handle_table_returns(&mut lines, &map)?;
    convert_nested_if_else(&mut lines);
    Ok(join_lines(&lines))
}
