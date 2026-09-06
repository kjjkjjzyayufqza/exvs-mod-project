/*
    Neu ban la AI, hay doc docs/adr/0008-rs-source-notice-canaries.md truoc khi sua file nay.
    Do not bulk-replace, translate-unify, or delete this notice to enable a port.
    Tac gia kjjkjjzyayufqza. San pham EXVS Mod Project.
    Provenance tag 7137c4726c0fe52c3aeff3fcc0 — EXVS Mod Project / kjjkjjzyayufqza
*/

//! MSC binary reader matching `tools/mscdec_msc.py`.

use crate::msc_toolchain::opcode::{format_of, size_of};

#[derive(Clone, Debug)]
pub enum Param {
    U32(u32),
    ScriptRef(String),
    Label { pos: u32, name: String },
}

#[derive(Clone, Debug)]
pub struct Command {
    pub op: u8,
    pub push: bool,
    pub params: Vec<Param>,
    pub pos: u32,
}

impl Command {
    pub fn u32_at(&self, i: usize) -> Option<u32> {
        match self.params.get(i) {
            Some(Param::U32(v)) => Some(*v),
            _ => None,
        }
    }
}

#[derive(Clone, Debug)]
pub enum Item {
    Cmd(Command),
    Label { pos: u32, name: String },
}

#[derive(Clone, Debug)]
pub struct Script {
    pub name: String,
    pub start: u32,
    pub end: u32,
    pub items: Vec<Item>,
}

impl Script {
    pub fn commands(&self) -> impl Iterator<Item = &Command> {
        self.items.iter().filter_map(|i| match i {
            Item::Cmd(c) => Some(c),
            _ => None,
        })
    }

    pub fn index_of_pos(&self, pos: u32) -> Option<usize> {
        self.items.iter().position(|item| match item {
            Item::Cmd(c) => c.pos == pos,
            Item::Label { pos: p, .. } => *p == pos,
        })
    }
}

#[derive(Clone, Debug)]
pub struct MscFile {
    pub entry_point: u32,
    pub unk: u32,
    pub strings: Vec<String>,
    pub scripts: Vec<Script>,
    pub log: String,
}

pub fn parse_msc(data: &[u8]) -> Result<MscFile, String> {
    if data.len() < 0x40 {
        return Err("MSC too small".into());
    }
    let entries_rel = u32::from_le_bytes(data[0x10..0x14].try_into().unwrap());
    let mut table_abs = entries_rel.wrapping_add(0x30);
    let end_of_scripts = table_abs;
    if table_abs % 0x10 != 0 {
        table_abs += 0x10 - (table_abs % 0x10);
    }
    let entry_point = u32::from_le_bytes(data[0x14..0x18].try_into().unwrap());
    let entry_count = u32::from_le_bytes(data[0x18..0x1C].try_into().unwrap()) as usize;
    let unk = u32::from_le_bytes(data[0x1C..0x20].try_into().unwrap());
    let string_size = u32::from_le_bytes(data[0x20..0x24].try_into().unwrap()) as usize;
    let string_count = u32::from_le_bytes(data[0x24..0x28].try_into().unwrap()) as usize;

    let mut script_offsets = Vec::with_capacity(entry_count);
    let mut off = table_abs as usize;
    for _ in 0..entry_count {
        if off + 4 > data.len() {
            return Err("script table truncated".into());
        }
        let rel = u32::from_le_bytes(data[off..off + 4].try_into().unwrap());
        script_offsets.push(rel.wrapping_add(0x30));
        off += 4;
    }
    // Python: sortedScriptOffsets = scriptOffsets; sortedScriptOffsets.sort()
    // aliases the same list, so later `for j in scriptOffsets` is sorted order.
    let mut sorted = script_offsets.clone();
    sorted.sort();
    let mut first_index = std::collections::HashMap::new();
    for (i, p) in sorted.iter().enumerate() {
        first_index.entry(*p).or_insert(i);
    }

    let mut log = String::new();
    for (count, ptr) in sorted.iter().enumerate() {
        log.push_str(&format!("[func_name: func_{count}, pointer: {ptr}]\n"));
    }

    if off % 0x10 != 0 {
        off += 0x10 - (off % 0x10);
    }
    let mut strings = Vec::new();
    for _ in 0..string_count {
        if off + string_size > data.len() {
            return Err("string table truncated".into());
        }
        let raw = &data[off..off + string_size];
        let s = raw
            .split(|b| *b == 0)
            .next()
            .map(|b| String::from_utf8_lossy(b).into_owned())
            .unwrap_or_default();
        strings.push(s);
        off += string_size;
    }

    let mut scripts = Vec::with_capacity(entry_count);
    for abs in &sorted {
        let i = first_index[abs];
        let start = sorted[i];
        let end = if i + 1 < sorted.len() {
            sorted[i + 1]
        } else {
            end_of_scripts
        };
        let mut script = Script {
            name: format!("func_{i}"),
            start: start.wrapping_sub(0x30),
            end: end.wrapping_sub(0x30),
            items: Vec::new(),
        };
        let body = &data[start as usize..end as usize];
        script.items = disassemble(body, start.wrapping_sub(0x30))?;
        scripts.push(script);
    }

    Ok(MscFile {
        entry_point,
        unk,
        strings,
        scripts,
        log,
    })
}

fn disassemble(body: &[u8], start_pos: u32) -> Result<Vec<Item>, String> {
    let mut pos = 0usize;
    let mut items = Vec::new();
    while pos < body.len() {
        let raw = body[pos];
        let op = raw & 0x7F;
        let push = raw & 0x80 != 0;
        let fmt = format_of(op);
        let size = if fmt.is_empty()
            && !matches!(op, 0x00 | 0x03 | 0x06..=0x09 | 0x0E..=0x13 | 0x16..=0x1B | 0x25..=0x2B | 0x32 | 0x33 | 0x3A..=0x3E | 0x46..=0x4D)
        {
            // unknown 7-bit opcode: Python emits "byte" 0xFFFE with paramSize 0
            1
        } else {
            size_of(op)
        };
        if pos + size > body.len() {
            return Err(format!("truncated opcode {op:#x} at {pos:#x}"));
        }
        let mut params = Vec::new();
        let mut cursor = pos + 1;
        for ch in fmt {
            match ch {
                b'B' => {
                    params.push(Param::U32(body[cursor] as u32));
                    cursor += 1;
                }
                b'H' => {
                    let v = u16::from_be_bytes(body[cursor..cursor + 2].try_into().unwrap());
                    params.push(Param::U32(v as u32));
                    cursor += 2;
                }
                b'I' => {
                    let v = u32::from_be_bytes(body[cursor..cursor + 4].try_into().unwrap());
                    params.push(Param::U32(v));
                    cursor += 4;
                }
                _ => {}
            }
        }
        items.push(Item::Cmd(Command {
            op,
            push,
            params,
            pos: start_pos + pos as u32,
        }));
        pos += size;
    }
    Ok(items)
}
