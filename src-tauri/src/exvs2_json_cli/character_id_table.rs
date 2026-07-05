use std::collections::BTreeMap;

use serde_json::{json, Map, Value};

use super::types::InspectOptions;
use super::util::{format_hex_u32, format_hex_usize, insert_roundtrip, signed_resource_json};
use crate::jnttbl_format::bytes_to_hex_upper_spaced;

pub(crate) const CHARACTER_ID_TABLE_MAGIC: [u8; 4] = [0xA9, 0xB8, 0xAB, 0xCE];
const CHARACTER_ID_TABLE_HEADER_SIZE: usize = 0x20;
const CHARACTER_ID_TABLE_ENTRY_SIZE: usize = 0x18;

#[derive(Debug, Clone)]
pub(crate) struct CharacterIdTableParsed {
    pub(crate) file_size: i32,
    pub(crate) character_count: i32,
    pub(crate) entry_size: i32,
    pub(crate) data_start: usize,
    pub(crate) required_size: usize,
    pub(crate) rows: Vec<CharacterIdTableRow>,
}

#[derive(Debug, Clone)]
pub(crate) struct CharacterIdTableRow {
    pub(crate) character_id: i32,
    pub(crate) id_offset: usize,
    pub(crate) entry_offset: usize,
    pub(crate) model: i32,
    pub(crate) effect: i32,
    pub(crate) sound: i32,
    pub(crate) param: i32,
    pub(crate) msc: i32,
    pub(crate) motion: i32,
}

impl CharacterIdTableRow {
    pub(crate) fn empty(character_id: i32) -> Self {
        Self {
            character_id,
            id_offset: 0,
            entry_offset: 0,
            model: 0,
            effect: 0,
            sound: 0,
            param: 0,
            msc: 0,
            motion: 0,
        }
    }

    pub(crate) fn get_column(&self, column: CharacterResourceColumn) -> i32 {
        match column {
            CharacterResourceColumn::Model => self.model,
            CharacterResourceColumn::Effect => self.effect,
            CharacterResourceColumn::Sound => self.sound,
            CharacterResourceColumn::Param => self.param,
            CharacterResourceColumn::Msc => self.msc,
            CharacterResourceColumn::Motion => self.motion,
        }
    }

    pub(crate) fn set_column(&mut self, column: CharacterResourceColumn, value: i32) {
        match column {
            CharacterResourceColumn::Model => self.model = value,
            CharacterResourceColumn::Effect => self.effect = value,
            CharacterResourceColumn::Sound => self.sound = value,
            CharacterResourceColumn::Param => self.param = value,
            CharacterResourceColumn::Msc => self.msc = value,
            CharacterResourceColumn::Motion => self.motion = value,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum CharacterResourceColumn {
    Model,
    Effect,
    Sound,
    Param,
    Msc,
    Motion,
}

impl CharacterResourceColumn {
    pub(crate) fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "model" => Ok(Self::Model),
            "effect" => Ok(Self::Effect),
            "sound" => Ok(Self::Sound),
            "param" => Ok(Self::Param),
            "msc" => Ok(Self::Msc),
            "motion" => Ok(Self::Motion),
            other => Err(format!(
                "Unsupported character_id_table column '{other}'. Supported columns: model, effect, sound, param, msc, motion"
            )),
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Model => "model",
            Self::Effect => "effect",
            Self::Sound => "sound",
            Self::Param => "param",
            Self::Msc => "msc",
            Self::Motion => "motion",
        }
    }
}

pub(crate) fn inspect_character_id_table(
    bytes: &[u8],
    options: &InspectOptions,
    warnings: &mut Vec<String>,
) -> Result<Value, String> {
    let parsed = parse_character_id_table(bytes)?;
    let mut seen = BTreeMap::<i32, usize>::new();
    let mut duplicate_ids = Vec::new();
    let rows = parsed
        .rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            if seen.insert(row.character_id, index).is_some() {
                duplicate_ids.push(row.character_id);
            }
            json!({
                "index": index,
                "characterId": row.character_id,
                "characterIdHex": format_hex_u32(row.character_id as u32),
                "idOffset": format_hex_usize(row.id_offset),
                "entryOffset": format_hex_usize(row.entry_offset),
                "model": signed_resource_json(row.model),
                "effect": signed_resource_json(row.effect),
                "sound": signed_resource_json(row.sound),
                "param": signed_resource_json(row.param),
                "msc": signed_resource_json(row.msc),
                "motion": signed_resource_json(row.motion),
                "rawLeBytes": bytes_to_hex_upper_spaced(
                    bytes.get(row.entry_offset..row.entry_offset + CHARACTER_ID_TABLE_ENTRY_SIZE)
                        .unwrap_or_default()
                )
            })
        })
        .collect::<Vec<_>>();

    duplicate_ids.sort_unstable();
    duplicate_ids.dedup();
    for id in &duplicate_ids {
        warnings.push(format!(
            "duplicate character id {id} appears in character_id_table"
        ));
    }

    let lookup_by_character_id = parsed
        .rows
        .iter()
        .map(|row| {
            (
                row.character_id.to_string(),
                json!({
                    "model": format_hex_u32(row.model as u32),
                    "effect": format_hex_u32(row.effect as u32),
                    "sound": format_hex_u32(row.sound as u32),
                    "param": format_hex_u32(row.param as u32),
                    "msc": format_hex_u32(row.msc as u32),
                    "motion": format_hex_u32(row.motion as u32)
                }),
            )
        })
        .collect::<Map<String, Value>>();

    let header = json!({
        "magic": "A9 B8 AB CE",
        "fileSize": parsed.file_size,
        "declaredCharacterCount": parsed.character_count,
        "entrySize": parsed.entry_size,
        "entrySizeHex": format_hex_u32(parsed.entry_size as u32),
        "idArrayOffset": format_hex_usize(CHARACTER_ID_TABLE_HEADER_SIZE),
        "dataArrayOffset": format_hex_usize(parsed.data_start),
        "requiredByteLength": parsed.required_size
    });

    let mut data = if options.summary {
        json!({
            "header": header,
            "rowCount": parsed.rows.len(),
            "duplicateCharacterIds": duplicate_ids,
            "resourceColumns": ["model", "effect", "sound", "param", "msc", "motion"]
        })
    } else {
        json!({
            "header": header,
            "rows": rows,
            "lookupByCharacterId": lookup_by_character_id
        })
    };

    if options.roundtrip_check {
        let rebuilt = build_character_id_table(&parsed)?;
        insert_roundtrip(&mut data, bytes, &rebuilt)?;
    }

    Ok(data)
}

pub(crate) fn parse_character_id_table(bytes: &[u8]) -> Result<CharacterIdTableParsed, String> {
    if bytes.len() < CHARACTER_ID_TABLE_HEADER_SIZE {
        return Err("character_id_table.bin is too small".to_string());
    }
    if bytes[0..4] != CHARACTER_ID_TABLE_MAGIC {
        return Err("character_id_table.bin magic is invalid".to_string());
    }

    let file_size = read_i32_le(bytes, 0x08, "file size")?;
    let character_count = read_i32_le(bytes, 0x10, "character count")?;
    if character_count < 0 {
        return Err("character_id_table.bin character count is negative".to_string());
    }
    let entry_size = read_i32_le(bytes, 0x14, "entry size")?;
    if entry_size as usize != CHARACTER_ID_TABLE_ENTRY_SIZE {
        return Err(format!(
            "character_id_table.bin entry size {entry_size} is not supported"
        ));
    }

    let count = character_count as usize;
    let ids_bytes = count
        .checked_mul(4)
        .ok_or_else(|| "character_id_table.bin id array size overflow".to_string())?;
    let data_bytes = count
        .checked_mul(CHARACTER_ID_TABLE_ENTRY_SIZE)
        .ok_or_else(|| "character_id_table.bin data array size overflow".to_string())?;
    let data_start = CHARACTER_ID_TABLE_HEADER_SIZE
        .checked_add(ids_bytes)
        .ok_or_else(|| "character_id_table.bin data offset overflow".to_string())?;
    let required_size = data_start
        .checked_add(data_bytes)
        .ok_or_else(|| "character_id_table.bin required size overflow".to_string())?;
    if bytes.len() < required_size {
        return Err("character_id_table.bin is truncated".to_string());
    }

    let mut rows = Vec::with_capacity(count);
    for index in 0..count {
        let id_offset = CHARACTER_ID_TABLE_HEADER_SIZE + index * 4;
        let entry_offset = data_start + index * CHARACTER_ID_TABLE_ENTRY_SIZE;
        rows.push(CharacterIdTableRow {
            character_id: read_i32_le(bytes, id_offset, "character id")?,
            id_offset,
            entry_offset,
            model: read_i32_le(bytes, entry_offset, "model")?,
            effect: read_i32_le(bytes, entry_offset + 0x04, "effect")?,
            sound: read_i32_le(bytes, entry_offset + 0x08, "sound")?,
            param: read_i32_le(bytes, entry_offset + 0x0C, "param")?,
            msc: read_i32_le(bytes, entry_offset + 0x10, "msc")?,
            motion: read_i32_le(bytes, entry_offset + 0x14, "motion")?,
        });
    }

    Ok(CharacterIdTableParsed {
        file_size,
        character_count,
        entry_size,
        data_start,
        required_size,
        rows,
    })
}

pub(crate) fn build_character_id_table(parsed: &CharacterIdTableParsed) -> Result<Vec<u8>, String> {
    let count = parsed.rows.len();
    let mut out =
        vec![
            0u8;
            CHARACTER_ID_TABLE_HEADER_SIZE + count * 4 + count * CHARACTER_ID_TABLE_ENTRY_SIZE
        ];
    let output_len = out.len() as i32;
    out[0..4].copy_from_slice(&CHARACTER_ID_TABLE_MAGIC);
    write_i32_le(&mut out, 0x08, output_len)?;
    write_i32_le(&mut out, 0x10, count as i32)?;
    write_i32_le(&mut out, 0x14, CHARACTER_ID_TABLE_ENTRY_SIZE as i32)?;

    let data_start = CHARACTER_ID_TABLE_HEADER_SIZE + count * 4;
    for (index, row) in parsed.rows.iter().enumerate() {
        write_i32_le(
            &mut out,
            CHARACTER_ID_TABLE_HEADER_SIZE + index * 4,
            row.character_id,
        )?;
        let entry_offset = data_start + index * CHARACTER_ID_TABLE_ENTRY_SIZE;
        write_i32_le(&mut out, entry_offset, row.model)?;
        write_i32_le(&mut out, entry_offset + 0x04, row.effect)?;
        write_i32_le(&mut out, entry_offset + 0x08, row.sound)?;
        write_i32_le(&mut out, entry_offset + 0x0C, row.param)?;
        write_i32_le(&mut out, entry_offset + 0x10, row.msc)?;
        write_i32_le(&mut out, entry_offset + 0x14, row.motion)?;
    }
    Ok(out)
}

fn read_i32_le(bytes: &[u8], offset: usize, label: &str) -> Result<i32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| format!("{label} is out of bounds"))?;
    Ok(i32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn write_i32_le(bytes: &mut [u8], offset: usize, value: i32) -> Result<(), String> {
    let slice = bytes
        .get_mut(offset..offset + 4)
        .ok_or_else(|| format!("write_i32 is out of bounds at {}", format_hex_usize(offset)))?;
    slice.copy_from_slice(&value.to_le_bytes());
    Ok(())
}
