use crate::msc_toolchain::ir::{Arg, Item};
use crate::msc_toolchain::opcode::{format_of, size_of};
use crate::msc_toolchain::profile::ScriptProfile;

/// Bytes 0x00..0x08: the container magic, identical for every script kind.
const MAGIC_PREFIX: &[u8] = b"\xB2\xAC\xBC\xBA\xE6\x90\x32\x01";

fn cmd_size(op: u8) -> usize {
    size_of(op)
}

/// Emit a compiled script.
///
/// `global_count` is the number of file-scope global declarations. The mission
/// header records it at `0x1C`; unit scripts keep the historical heuristic
/// that predates this parameter.
pub fn emit_file(
    scripts: &[Vec<Item>],
    function_names: &[String],
    strings: &[String],
    profile: ScriptProfile,
    global_count: u32,
    table_order: &[usize],
) -> Vec<u8> {
    let mut positions = Vec::with_capacity(scripts.len());
    let mut current: u32 = 0x10;
    let mut name_to_pos = std::collections::HashMap::new();
    for (i, script) in scripts.iter().enumerate() {
        positions.push(current);
        if let Some(name) = function_names.get(i) {
            name_to_pos.insert(name.clone(), current);
        }
        for item in script {
            if let Item::Cmd(cmd) = item {
                current += cmd_size(cmd.op) as u32;
            }
        }
    }
    let entries_offset = current;
    let entry_point = name_to_pos.get("main").copied().unwrap_or(0x10);
    let unk: u32 = match profile {
        ScriptProfile::Mission => global_count,
        ScriptProfile::Unit => {
            if !strings.is_empty() || scripts.len() > 10 {
                0x16
            } else {
                0
            }
        }
    };
    let mut max_str = strings.iter().map(|s| s.len()).max().unwrap_or(0);
    if max_str % 0x10 != 0 {
        max_str += 0x10 - (max_str % 0x10);
    }

    let mut out = Vec::with_capacity(entries_offset as usize + 0x80);
    out.extend_from_slice(MAGIC_PREFIX);
    out.extend_from_slice(&profile.version_word().to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&entries_offset.to_le_bytes());
    out.extend_from_slice(&entry_point.to_le_bytes());
    out.extend_from_slice(&(scripts.len() as u32).to_le_bytes());
    out.extend_from_slice(&unk.to_le_bytes());
    out.extend_from_slice(&(max_str as u32).to_le_bytes());
    out.extend_from_slice(&(strings.len() as u32).to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&[0u8; 16]);

    for (si, script) in scripts.iter().enumerate() {
        let mut pos = positions[si];
        let mut label_pos = std::collections::HashMap::new();
        for item in script {
            match item {
                Item::Label(id) => {
                    label_pos.insert(*id, pos);
                }
                Item::Cmd(cmd) => {
                    pos += cmd_size(cmd.op) as u32;
                }
            }
        }
        for item in script {
            let Item::Cmd(cmd) = item else { continue };
            let mut byte = cmd.op;
            if cmd.push {
                byte |= 0x80;
            }
            out.push(byte);
            let fmt = format_of(cmd.op);
            for (i, ch) in fmt.iter().enumerate() {
                let v = match cmd.args.get(i) {
                    Some(Arg::U32(v)) => *v,
                    Some(Arg::Func(name)) => name_to_pos.get(name).copied().unwrap_or(0),
                    Some(Arg::Label(id)) => label_pos.get(id).copied().unwrap_or(0),
                    Some(Arg::LabelBefore(id, back)) => label_pos
                        .get(id)
                        .copied()
                        .unwrap_or(0)
                        .saturating_sub(*back),
                    None => 0,
                };
                match ch {
                    b'B' => out.push(v as u8),
                    b'H' => out.extend_from_slice(&(v as u16).to_be_bytes()),
                    b'I' => out.extend_from_slice(&v.to_be_bytes()),
                    _ => {}
                }
            }
        }
    }

    while out.len() % 0x10 != 0 {
        out.push(0);
    }
    // `table_order[i]` is the slot the i-th laid-out script occupies in the
    // offset table. Scripts are laid out in source order; the table is not.
    let mut table = vec![0u32; positions.len()];
    for (index, position) in positions.iter().enumerate() {
        let slot = table_order.get(index).copied().unwrap_or(index);
        table[slot.min(positions.len().saturating_sub(1))] = *position;
    }
    for entry in &table {
        out.extend_from_slice(&entry.to_le_bytes());
    }
    while out.len() % 0x10 != 0 {
        out.push(0);
    }
    for s in strings {
        out.extend_from_slice(s.as_bytes());
        out.extend(std::iter::repeat(0).take(max_str.saturating_sub(s.len())));
    }
    out
}
