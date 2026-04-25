use serde::{Deserialize, Serialize};

pub const COMMAND_TABLE_MAGIC: u32 = 0xCDABB8A9;
pub const HEADER_SIZE: usize = 0x20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandTableHeader {
    pub magic: u32,
    pub unk_04: u32,
    pub file_size: u32,
    pub unk_0c: u32,
    pub entry_count: u32,
    pub commands_count: u32,
    pub entry_size: u32,
    pub unk_1c: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandDefinition {
    pub hash: u32,
    pub entry_offset: u32,
    pub flags: u32,
    pub kind: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandTableFile {
    pub header: CommandTableHeader,
    pub commands: Vec<CommandDefinition>,
    pub entry_ids: Vec<u32>,
    pub entries_raw: Vec<Vec<u8>>,
    pub trailing_data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandFieldValue {
    pub hash: u32,
    pub kind: u32,
    pub offset: u32,
    pub value_int: Option<i32>,
    pub value_uint: Option<u32>,
    pub value_float: Option<f32>,
    pub value_string: Option<String>,
    pub value_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedEntry {
    pub entry_id: u32,
    pub entry_index: usize,
    pub fields: Vec<CommandFieldValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedCommandTable {
    pub header: CommandTableHeader,
    pub commands: Vec<CommandDefinition>,
    pub entries: Vec<ParsedEntry>,
    pub file_type: String,
}

pub fn parse_command_table(data: &[u8]) -> Result<CommandTableFile, String> {
    if data.len() < HEADER_SIZE {
        return Err("File too small for command table header".to_string());
    }

    let header = read_header(data)?;
    if header.magic != COMMAND_TABLE_MAGIC {
        return Err(format!(
            "Invalid magic: 0x{:08X}, expected 0x{:08X}",
            header.magic, COMMAND_TABLE_MAGIC
        ));
    }

    let cmd_count = header.commands_count as usize;
    let entry_count = header.entry_count as usize;
    let entry_size = header.entry_size as usize;

    let hash_base = HEADER_SIZE;
    let desc_base = hash_base + cmd_count * 4;
    let ids_base = desc_base + cmd_count * 12;
    let entries_base = ids_base + entry_count * 4;
    let entries_end = entries_base + entry_count * entry_size;

    if entries_end > data.len() {
        return Err(format!(
            "File too small: need {} bytes, have {}",
            entries_end,
            data.len()
        ));
    }

    let mut commands = Vec::with_capacity(cmd_count);
    for i in 0..cmd_count {
        let hash = read_u32_le(data, hash_base + i * 4)?;
        let off = desc_base + i * 12;
        let entry_offset = read_u32_le(data, off)?;
        let flags = read_u32_le(data, off + 4)?;
        let kind = read_u32_le(data, off + 8)?;
        commands.push(CommandDefinition {
            hash,
            entry_offset,
            flags,
            kind,
        });
    }

    let mut entry_ids = Vec::with_capacity(entry_count);
    for i in 0..entry_count {
        entry_ids.push(read_u32_le(data, ids_base + i * 4)?);
    }

    let mut entries_raw = Vec::with_capacity(entry_count);
    for i in 0..entry_count {
        let start = entries_base + i * entry_size;
        let end = start + entry_size;
        entries_raw.push(data[start..end].to_vec());
    }

    let trailing_data = if entries_end < data.len() {
        data[entries_end..].to_vec()
    } else {
        Vec::new()
    };

    Ok(CommandTableFile {
        header,
        commands,
        entry_ids,
        entries_raw,
        trailing_data,
    })
}

pub fn parse_command_table_with_fields(
    data: &[u8],
    file_type: &str,
) -> Result<ParsedCommandTable, String> {
    let table = parse_command_table(data)?;

    let mut entries = Vec::with_capacity(table.entry_ids.len());
    for (idx, raw) in table.entries_raw.iter().enumerate() {
        let entry_id = table.entry_ids.get(idx).copied().unwrap_or(0);
        let mut fields = Vec::with_capacity(table.commands.len());

        for cmd in &table.commands {
            let offset = cmd.entry_offset as usize;
            if offset + 4 > raw.len() {
                continue;
            }

            let raw_bytes = &raw[offset..offset + 4];
            let value_hex = format!(
                "{:02X}{:02X}{:02X}{:02X}",
                raw_bytes[0], raw_bytes[1], raw_bytes[2], raw_bytes[3]
            );

            let (value_int, value_uint, value_float, value_string) = match cmd.kind {
                1 => {
                    let v = u32::from_le_bytes([raw_bytes[0], raw_bytes[1], raw_bytes[2], raw_bytes[3]]);
                    (None, Some(v), None, None)
                }
                2 => {
                    let v = i32::from_le_bytes([raw_bytes[0], raw_bytes[1], raw_bytes[2], raw_bytes[3]]);
                    (Some(v), None, None, None)
                }
                5 => {
                    let v = f32::from_le_bytes([raw_bytes[0], raw_bytes[1], raw_bytes[2], raw_bytes[3]]);
                    (None, None, Some(v), None)
                }
                7 => {
                    let str_offset = u32::from_le_bytes([raw_bytes[0], raw_bytes[1], raw_bytes[2], raw_bytes[3]]) as usize;
                    let s = read_c_string(data, str_offset);
                    (None, None, None, Some(s))
                }
                _ => {
                    let v = u32::from_le_bytes([raw_bytes[0], raw_bytes[1], raw_bytes[2], raw_bytes[3]]);
                    (None, Some(v), None, None)
                }
            };

            fields.push(CommandFieldValue {
                hash: cmd.hash,
                kind: cmd.kind,
                offset: cmd.entry_offset,
                value_int,
                value_uint,
                value_float,
                value_string,
                value_hex,
            });
        }

        entries.push(ParsedEntry {
            entry_id,
            entry_index: idx,
            fields,
        });
    }

    Ok(ParsedCommandTable {
        header: table.header,
        commands: table.commands,
        entries,
        file_type: file_type.to_string(),
    })
}

pub fn build_command_table(table: &CommandTableFile) -> Result<Vec<u8>, String> {
    let cmd_count = table.commands.len();
    let entry_count = table.entry_ids.len();
    let entry_size = table.header.entry_size as usize;

    if entry_count != table.entries_raw.len() {
        return Err("entry_ids and entries_raw length mismatch".to_string());
    }

    let total_size = HEADER_SIZE
        + cmd_count * 4
        + cmd_count * 12
        + entry_count * 4
        + entry_count * entry_size
        + table.trailing_data.len();

    let mut out = vec![0u8; total_size];

    write_u32_le(&mut out, 0x00, table.header.magic);
    write_u32_le(&mut out, 0x04, table.header.unk_04);
    write_u32_le(&mut out, 0x08, total_size as u32);
    write_u32_le(&mut out, 0x0C, table.header.unk_0c);
    write_u32_le(&mut out, 0x10, entry_count as u32);
    write_u32_le(&mut out, 0x14, cmd_count as u32);
    write_u32_le(&mut out, 0x18, table.header.entry_size);
    write_u32_le(&mut out, 0x1C, table.header.unk_1c);

    let hash_base = HEADER_SIZE;
    for (i, cmd) in table.commands.iter().enumerate() {
        write_u32_le(&mut out, hash_base + i * 4, cmd.hash);
    }

    let desc_base = hash_base + cmd_count * 4;
    for (i, cmd) in table.commands.iter().enumerate() {
        let off = desc_base + i * 12;
        write_u32_le(&mut out, off, cmd.entry_offset);
        write_u32_le(&mut out, off + 4, cmd.flags);
        write_u32_le(&mut out, off + 8, cmd.kind);
    }

    let ids_base = desc_base + cmd_count * 12;
    for (i, &id) in table.entry_ids.iter().enumerate() {
        write_u32_le(&mut out, ids_base + i * 4, id);
    }

    let entries_base = ids_base + entry_count * 4;
    for (i, raw) in table.entries_raw.iter().enumerate() {
        let start = entries_base + i * entry_size;
        let copy_len = raw.len().min(entry_size);
        out[start..start + copy_len].copy_from_slice(&raw[..copy_len]);
    }

    let trailing_base = entries_base + entry_count * entry_size;
    if !table.trailing_data.is_empty() {
        out[trailing_base..trailing_base + table.trailing_data.len()]
            .copy_from_slice(&table.trailing_data);
    }

    Ok(out)
}

pub fn update_entry_field(
    table: &mut CommandTableFile,
    entry_index: usize,
    cmd_hash: u32,
    value_bytes: [u8; 4],
) -> Result<(), String> {
    let cmd = table
        .commands
        .iter()
        .find(|c| c.hash == cmd_hash)
        .ok_or_else(|| format!("Command hash 0x{:08X} not found", cmd_hash))?;

    let offset = cmd.entry_offset as usize;
    let raw = table
        .entries_raw
        .get_mut(entry_index)
        .ok_or_else(|| format!("Entry index {} out of range", entry_index))?;

    if offset + 4 > raw.len() {
        return Err(format!("Field offset {} exceeds entry size {}", offset, raw.len()));
    }

    raw[offset..offset + 4].copy_from_slice(&value_bytes);
    Ok(())
}

fn read_header(data: &[u8]) -> Result<CommandTableHeader, String> {
    Ok(CommandTableHeader {
        magic: read_u32_le(data, 0x00)?,
        unk_04: read_u32_le(data, 0x04)?,
        file_size: read_u32_le(data, 0x08)?,
        unk_0c: read_u32_le(data, 0x0C)?,
        entry_count: read_u32_le(data, 0x10)?,
        commands_count: read_u32_le(data, 0x14)?,
        entry_size: read_u32_le(data, 0x18)?,
        unk_1c: read_u32_le(data, 0x1C)?,
    })
}

fn read_u32_le(data: &[u8], offset: usize) -> Result<u32, String> {
    let b = data
        .get(offset..offset + 4)
        .ok_or_else(|| format!("read_u32 out of range at 0x{:X}", offset))?;
    Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

fn write_u32_le(data: &mut [u8], offset: usize, value: u32) {
    let bytes = value.to_le_bytes();
    data[offset..offset + 4].copy_from_slice(&bytes);
}

fn read_c_string(data: &[u8], offset: usize) -> String {
    if offset >= data.len() {
        return String::new();
    }
    let mut end = offset;
    while end < data.len() && data[end] != 0 {
        end += 1;
    }
    String::from_utf8_lossy(&data[offset..end]).to_string()
}
