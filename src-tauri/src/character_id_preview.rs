use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const CHARACTER_ID_TABLE_PACK: &str = "0x036B9E67";
const CHARACTER_ID_TABLE_FILE: &str = "character_id_table.bin";
const CHARACTER_ID_TABLE_MAGIC: [u8; 4] = [0xA9, 0xB8, 0xAB, 0xCE];
const CHARACTER_ID_TABLE_HEADER_SIZE: usize = 0x20;
const CHARACTER_ID_TABLE_ENTRY_SIZE: usize = 0x18;

#[derive(Clone, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CharacterIdMemoryPreviewRow {
    pub character_id: i32,
    pub model_value: i32,
    pub model_hash_hex: String,
    pub source_path: String,
    pub source_exists: bool,
    pub disabled_reason: Option<String>,
}

#[derive(Clone, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CharacterIdMemoryPreviewResponse {
    pub file_path: String,
    pub available_count: usize,
    pub query: String,
    pub rows: Vec<CharacterIdMemoryPreviewRow>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct CharacterIdRow {
    character_id: i32,
    model_value: i32,
}

fn read_i32_le(bytes: &[u8], offset: usize, label: &str) -> Result<i32, String> {
    let end = offset
        .checked_add(4)
        .ok_or_else(|| format!("{label} offset overflow"))?;
    let slice = bytes
        .get(offset..end)
        .ok_or_else(|| format!("{label} is out of bounds"))?;
    let array: [u8; 4] = slice
        .try_into()
        .map_err(|_| format!("{label} must be exactly 4 bytes"))?;
    Ok(i32::from_le_bytes(array))
}

fn parse_character_id_table(bytes: &[u8]) -> Result<Vec<CharacterIdRow>, String> {
    if bytes.len() < CHARACTER_ID_TABLE_HEADER_SIZE {
        return Err("character_id_table.bin is too small".to_string());
    }
    if bytes[0..4] != CHARACTER_ID_TABLE_MAGIC {
        return Err("character_id_table.bin magic is invalid".to_string());
    }
    let character_count = read_i32_le(bytes, 0x10, "character count")?;
    if character_count < 0 {
        return Err("character_id_table.bin character count is negative".to_string());
    }
    let data_each_size = read_i32_le(bytes, 0x14, "entry size")?;
    if data_each_size as usize != CHARACTER_ID_TABLE_ENTRY_SIZE {
        return Err(format!(
            "character_id_table.bin entry size {data_each_size} is not supported"
        ));
    }
    let count = character_count as usize;
    let ids_bytes = count
        .checked_mul(0x04)
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
        let id_offset = CHARACTER_ID_TABLE_HEADER_SIZE + index * 0x04;
        let entry_offset = data_start + index * CHARACTER_ID_TABLE_ENTRY_SIZE;
        rows.push(CharacterIdRow {
            character_id: read_i32_le(bytes, id_offset, "character id")?,
            model_value: read_i32_le(bytes, entry_offset, "model value")?,
        });
    }
    Ok(rows)
}

fn int32_to_hash_hex(value: i32) -> String {
    format!("0x{:08X}", value as u32)
}

fn normalize_query(query: Option<String>) -> String {
    query.unwrap_or_default().trim().to_ascii_lowercase()
}

fn query_matches(query: &str, row: &CharacterIdMemoryPreviewRow) -> bool {
    query.is_empty()
        || row.character_id.to_string().contains(query)
        || row.model_hash_hex.to_ascii_lowercase().contains(query)
}

fn expected_upper_source_path(base_dir: &str, hash_hex: &str) -> String {
    PathBuf::from(base_dir)
        .join(format!("{hash_hex}.fhm2d"))
        .display()
        .to_string()
}

fn resolve_disabled_reason(
    model_value: i32,
    ob_dpl_cache_path: &str,
    source_exists: bool,
) -> Option<String> {
    if model_value == 0 {
        return Some("Model is 0, so this row cannot map to an FHM2D package.".to_string());
    }
    if ob_dpl_cache_path.trim().is_empty() {
        return Some("Configure obDplCachePath in Config first.".to_string());
    }
    if !source_exists {
        return Some("Missing source .fhm2d in obDplCachePath.".to_string());
    }
    None
}

pub fn build_character_id_preview_response_from_bytes<F>(
    bytes: &[u8],
    file_path: String,
    ob_dpl_cache_path: String,
    query: Option<String>,
    mut resolve_source_path: F,
) -> Result<CharacterIdMemoryPreviewResponse, String>
where
    F: FnMut(&str) -> Option<String>,
{
    let normalized_query = normalize_query(query);
    let normalized_cache_path = ob_dpl_cache_path.trim().to_string();
    let mut source_lookup_cache: HashMap<String, Option<String>> = HashMap::new();
    let mut rows = parse_character_id_table(bytes)?
        .into_iter()
        .map(|row| {
            let model_hash_hex = int32_to_hash_hex(row.model_value);
            let resolved_source = if row.model_value == 0 || normalized_cache_path.is_empty() {
                None
            } else {
                source_lookup_cache
                    .entry(model_hash_hex.clone())
                    .or_insert_with(|| resolve_source_path(model_hash_hex.as_str()))
                    .clone()
            };
            let source_exists = resolved_source.is_some();
            let source_path = if let Some(path) = resolved_source {
                path
            } else if normalized_cache_path.is_empty() || row.model_value == 0 {
                String::new()
            } else {
                expected_upper_source_path(normalized_cache_path.as_str(), model_hash_hex.as_str())
            };
            CharacterIdMemoryPreviewRow {
                character_id: row.character_id,
                model_value: row.model_value,
                model_hash_hex,
                source_path,
                source_exists,
                disabled_reason: resolve_disabled_reason(
                    row.model_value,
                    normalized_cache_path.as_str(),
                    source_exists,
                ),
            }
        })
        .collect::<Vec<_>>();
    rows.sort_by_key(|row| row.character_id);
    rows.retain(|row| query_matches(normalized_query.as_str(), row));
    let available_count = rows
        .iter()
        .filter(|row| row.disabled_reason.is_none())
        .count();

    Ok(CharacterIdMemoryPreviewResponse {
        file_path,
        available_count,
        query: normalized_query,
        rows,
    })
}

fn resolve_source_path_on_disk(ob_dpl_cache_path: &str, hash_hex: &str) -> Option<String> {
    let upper = Path::new(ob_dpl_cache_path).join(format!("{hash_hex}.fhm2d"));
    if upper.is_file() {
        return Some(upper.display().to_string());
    }
    let lower =
        Path::new(ob_dpl_cache_path).join(format!("{}.fhm2d", hash_hex.to_ascii_lowercase()));
    if lower.is_file() {
        return Some(lower.display().to_string());
    }
    None
}

#[tauri::command]
pub async fn character_id_memory_preview_rows(
    workspace_root: String,
    ob_dpl_cache_path: String,
    query: Option<String>,
) -> Result<CharacterIdMemoryPreviewResponse, String> {
    let normalized_root = workspace_root.trim().to_string();
    if normalized_root.is_empty() {
        return Err("workspaceRoot is required.".to_string());
    }
    let file_path = Path::new(normalized_root.as_str())
        .join(CHARACTER_ID_TABLE_PACK)
        .join(CHARACTER_ID_TABLE_FILE);
    let file_path_string = file_path.display().to_string();
    let ob_dpl_cache_path_owned = ob_dpl_cache_path.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(file_path.as_path()).map_err(|e| {
            format!(
                "Could not load character_id_table.bin at {}: {e}",
                file_path_string
            )
        })?;
        build_character_id_preview_response_from_bytes(
            bytes.as_slice(),
            file_path_string,
            ob_dpl_cache_path_owned.clone(),
            query,
            |hash_hex| resolve_source_path_on_disk(ob_dpl_cache_path_owned.as_str(), hash_hex),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_character_id_table_bytes(rows: &[(i32, i32)]) -> Vec<u8> {
        let character_count = rows.len() as u32;
        let mut out = vec![0u8; 0x20 + rows.len() * 0x04 + rows.len() * 0x18];
        let file_size = out.len() as u32;
        out[0..4].copy_from_slice(&[0xA9, 0xB8, 0xAB, 0xCE]);
        out[0x8..0xC].copy_from_slice(&file_size.to_le_bytes());
        out[0x10..0x14].copy_from_slice(&character_count.to_le_bytes());
        out[0x14..0x18].copy_from_slice(&(0x18u32).to_le_bytes());
        let ids_start = 0x20;
        let data_start = ids_start + rows.len() * 0x04;
        for (index, (character_id, model)) in rows.iter().enumerate() {
            let id_offset = ids_start + index * 0x04;
            out[id_offset..id_offset + 4].copy_from_slice(&character_id.to_le_bytes());
            let entry_offset = data_start + index * 0x18;
            out[entry_offset..entry_offset + 4].copy_from_slice(&model.to_le_bytes());
        }
        out
    }

    #[test]
    fn character_id_rows_sort_and_filter_in_backend() {
        let bytes = build_character_id_table_bytes(&[(300, 0x20), (100, 0x10), (200, 0x10)]);
        let result = build_character_id_preview_response_from_bytes(
            bytes.as_slice(),
            String::from("E:\\workspace\\0x036B9E67\\character_id_table.bin"),
            String::from("C:\\cache"),
            Some(String::from("10")),
            |hash_hex| match hash_hex {
                "0x00000010" => Some(String::from("C:\\cache\\0x00000010.fhm2d")),
                "0x00000020" => Some(String::from("C:\\cache\\0x00000020.fhm2d")),
                _ => None,
            },
        )
        .expect("backend rows should build");

        assert_eq!(result.available_count, 2);
        assert_eq!(
            result
                .rows
                .iter()
                .map(|row| row.character_id)
                .collect::<Vec<_>>(),
            vec![100, 200]
        );
    }

    #[test]
    fn character_id_rows_deduplicate_hash_resolution_for_duplicate_models() {
        let bytes = build_character_id_table_bytes(&[(1, 0x88), (2, 0x88), (3, 0x88)]);
        let mut lookup_calls = 0usize;
        let result = build_character_id_preview_response_from_bytes(
            bytes.as_slice(),
            String::from("E:\\workspace\\0x036B9E67\\character_id_table.bin"),
            String::from("C:\\cache"),
            None,
            |_hash_hex| {
                lookup_calls += 1;
                Some(String::from("C:\\cache\\0x00000088.fhm2d"))
            },
        )
        .expect("backend rows should build");

        assert_eq!(result.available_count, 3);
        assert_eq!(lookup_calls, 1);
    }

    #[test]
    fn character_id_rows_mark_model_zero_without_fs_lookup() {
        let bytes = build_character_id_table_bytes(&[(12, 0)]);
        let mut lookup_calls = 0usize;
        let result = build_character_id_preview_response_from_bytes(
            bytes.as_slice(),
            String::from("E:\\workspace\\0x036B9E67\\character_id_table.bin"),
            String::from("C:\\cache"),
            None,
            |_hash_hex| {
                lookup_calls += 1;
                None
            },
        )
        .expect("backend rows should build");

        assert_eq!(lookup_calls, 0);
        assert_eq!(
            result.rows[0].disabled_reason.as_deref(),
            Some("Model is 0, so this row cannot map to an FHM2D package.")
        );
    }
}
