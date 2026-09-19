use serde::{Deserialize, Serialize};

/// `chrsysparam.csyspm` container, proven against OB v27 `vsac27_Release.exe`
/// (see `docs/msc-research/chrsysparam-new-script-generation-research.md`).
///
/// ```text
/// 0x00 u32 magic 0xB4ACACAF        checked by the unit loader (sub_14066C890)
/// 0x04 u32 version 0x00010000      checked by the unit loader (sub_14066C880)
/// 0x08 u32 unit id (Character ID)  not read by the engine
/// 0x0C u32 reserved
/// 0x10 u32 table count (always 2)  not read by the engine
/// 0x14 u32 offset -> table 0 (action table, marker 0xA8BBBAB9)
/// 0x18 u32 offset -> table 1 (transition table, marker 0xA8BAA9BA)
/// table = { marker u32, rows u32, columns u32, reserved u32, cells u32[rows * columns] }
/// ```
///
/// The engine addresses a cell as `table + 0x10 + 4 * (row * columns + field)`
/// (sub_14066C8B0 / sub_14066C900), so the MSC field index is the column index.
/// Every real file observed so far stores the two tables back to back directly after the
/// header with no trailing bytes; the parser requires that canonical layout instead of
/// silently discarding anything it cannot place.
pub const CHRSYSPARAM_MAGIC: u32 = 0xB4AC_ACAF;
pub const CHRSYSPARAM_VERSION: u32 = 0x0001_0000;
pub const ACTION_TABLE_MARKER: u32 = 0xA8BB_BAB9;
pub const TRANSITION_TABLE_MARKER: u32 = 0xA8BA_A9BA;

const HEADER_SIZE: usize = 0x1C;
const TABLE_HEADER_SIZE: usize = 0x10;
const TABLE_COUNT: u32 = 2;
const VERSION_OFFSET: usize = 0x04;
const UNIT_ID_OFFSET: usize = 0x08;
const HEADER_RESERVED_OFFSET: usize = 0x0C;
const TABLE_COUNT_OFFSET: usize = 0x10;
const ACTION_TABLE_OFFSET_FIELD: usize = 0x14;
const TRANSITION_TABLE_OFFSET_FIELD: usize = 0x18;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChrSysParamTable {
    pub marker: u32,
    pub reserved: u32,
    pub columns: u32,
    pub rows: Vec<Vec<u32>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChrSysParamFile {
    pub unit_id: u32,
    pub header_reserved: u32,
    pub action_table: ChrSysParamTable,
    pub transition_table: ChrSysParamTable,
}

fn read_u32_at(data: &[u8], offset: usize) -> Result<u32, String> {
    let bytes = offset
        .checked_add(4)
        .and_then(|end| data.get(offset..end))
        .ok_or_else(|| {
            format!(
                "ChrSysParam truncated: needed 4 bytes at 0x{:X}, file is {} bytes",
                offset,
                data.len()
            )
        })?;
    Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn table_byte_size(rows: usize, columns: usize, name: &str) -> Result<usize, String> {
    rows.checked_mul(columns)
        .and_then(|cells| cells.checked_mul(4))
        .and_then(|cell_bytes| cell_bytes.checked_add(TABLE_HEADER_SIZE))
        .ok_or_else(|| format!("ChrSysParam {} table size overflows ({}x{})", name, rows, columns))
}

fn read_table(
    data: &[u8],
    offset: usize,
    expected_marker: u32,
    name: &str,
) -> Result<(ChrSysParamTable, usize), String> {
    let marker = read_u32_at(data, offset)?;
    if marker != expected_marker {
        return Err(format!(
            "ChrSysParam {} table at 0x{:X} has marker 0x{:08X}, expected 0x{:08X}",
            name, offset, marker, expected_marker
        ));
    }
    let row_count = read_u32_at(data, offset + 4)?;
    let columns = read_u32_at(data, offset + 8)?;
    let reserved = read_u32_at(data, offset + 12)?;
    let size = table_byte_size(row_count as usize, columns as usize, name)?;
    let end = offset
        .checked_add(size)
        .filter(|end| *end <= data.len())
        .ok_or_else(|| {
            format!(
                "ChrSysParam {} table declares {}x{} ({} bytes at 0x{:X}) but the file is {} bytes",
                name,
                row_count,
                columns,
                size,
                offset,
                data.len()
            )
        })?;

    let cells_start = offset + TABLE_HEADER_SIZE;
    let rows = (0..row_count as usize)
        .map(|row| {
            let row_start = cells_start + row * columns as usize * 4;
            (0..columns as usize)
                .map(|column| read_u32_at(data, row_start + column * 4))
                .collect::<Result<Vec<u32>, String>>()
        })
        .collect::<Result<Vec<Vec<u32>>, String>>()?;

    Ok((
        ChrSysParamTable {
            marker,
            reserved,
            columns,
            rows,
        },
        end,
    ))
}

pub fn parse_chrsysparam(data: &[u8]) -> Result<ChrSysParamFile, String> {
    if data.len() < HEADER_SIZE {
        return Err(format!(
            "ChrSysParam file is {} bytes, smaller than the 0x{:X}-byte header",
            data.len(),
            HEADER_SIZE
        ));
    }
    let magic = read_u32_at(data, 0)?;
    if magic != CHRSYSPARAM_MAGIC {
        return Err(format!(
            "ChrSysParam invalid magic: 0x{:08X}, expected 0x{:08X}",
            magic, CHRSYSPARAM_MAGIC
        ));
    }
    let version = read_u32_at(data, VERSION_OFFSET)?;
    if version != CHRSYSPARAM_VERSION {
        return Err(format!(
            "ChrSysParam version 0x{:08X} is rejected by the unit loader (expected 0x{:08X})",
            version, CHRSYSPARAM_VERSION
        ));
    }
    let table_count = read_u32_at(data, TABLE_COUNT_OFFSET)?;
    if table_count != TABLE_COUNT {
        return Err(format!(
            "ChrSysParam table count {} at 0x{:X}, expected {}",
            table_count, TABLE_COUNT_OFFSET, TABLE_COUNT
        ));
    }

    let action_offset = read_u32_at(data, ACTION_TABLE_OFFSET_FIELD)? as usize;
    if action_offset != HEADER_SIZE {
        return Err(format!(
            "ChrSysParam action table offset 0x{:X} is not the canonical 0x{:X}",
            action_offset, HEADER_SIZE
        ));
    }
    let (action_table, action_end) = read_table(data, action_offset, ACTION_TABLE_MARKER, "action")?;

    let transition_offset = read_u32_at(data, TRANSITION_TABLE_OFFSET_FIELD)? as usize;
    if transition_offset != action_end {
        return Err(format!(
            "ChrSysParam transition table offset 0x{:X} does not follow the action table end 0x{:X}",
            transition_offset, action_end
        ));
    }
    let (transition_table, transition_end) =
        read_table(data, transition_offset, TRANSITION_TABLE_MARKER, "transition")?;
    if transition_end != data.len() {
        return Err(format!(
            "ChrSysParam has {} trailing bytes after the transition table end 0x{:X}",
            data.len() - transition_end,
            transition_end
        ));
    }

    Ok(ChrSysParamFile {
        unit_id: read_u32_at(data, UNIT_ID_OFFSET)?,
        header_reserved: read_u32_at(data, HEADER_RESERVED_OFFSET)?,
        action_table,
        transition_table,
    })
}

fn validate_table_shape(
    table: &ChrSysParamTable,
    expected_marker: u32,
    name: &str,
) -> Result<usize, String> {
    if table.marker != expected_marker {
        return Err(format!(
            "ChrSysParam {} table marker 0x{:08X} must be 0x{:08X}",
            name, table.marker, expected_marker
        ));
    }
    if let Some((row, cells)) = table
        .rows
        .iter()
        .enumerate()
        .find(|(_, cells)| cells.len() != table.columns as usize)
    {
        return Err(format!(
            "ChrSysParam {} table row {} has {} cells, expected {} columns",
            name,
            row,
            cells.len(),
            table.columns
        ));
    }
    u32::try_from(table.rows.len())
        .map_err(|_| format!("ChrSysParam {} table has too many rows", name))?;
    table_byte_size(table.rows.len(), table.columns as usize, name)
}

fn write_table(out: &mut Vec<u8>, table: &ChrSysParamTable) {
    out.extend_from_slice(&table.marker.to_le_bytes());
    out.extend_from_slice(&(table.rows.len() as u32).to_le_bytes());
    out.extend_from_slice(&table.columns.to_le_bytes());
    out.extend_from_slice(&table.reserved.to_le_bytes());
    for cell in table.rows.iter().flatten() {
        out.extend_from_slice(&cell.to_le_bytes());
    }
}

pub fn build_chrsysparam(file: &ChrSysParamFile) -> Result<Vec<u8>, String> {
    let action_size = validate_table_shape(&file.action_table, ACTION_TABLE_MARKER, "action")?;
    let transition_size =
        validate_table_shape(&file.transition_table, TRANSITION_TABLE_MARKER, "transition")?;
    let transition_offset = HEADER_SIZE + action_size;
    let total = transition_offset
        .checked_add(transition_size)
        .filter(|total| u32::try_from(*total).is_ok())
        .ok_or_else(|| "ChrSysParam file would exceed the 32-bit offset range".to_string())?;

    let mut out = Vec::with_capacity(total);
    out.extend_from_slice(&CHRSYSPARAM_MAGIC.to_le_bytes());
    out.extend_from_slice(&CHRSYSPARAM_VERSION.to_le_bytes());
    out.extend_from_slice(&file.unit_id.to_le_bytes());
    out.extend_from_slice(&file.header_reserved.to_le_bytes());
    out.extend_from_slice(&TABLE_COUNT.to_le_bytes());
    out.extend_from_slice(&(HEADER_SIZE as u32).to_le_bytes());
    out.extend_from_slice(&(transition_offset as u32).to_le_bytes());
    write_table(&mut out, &file.action_table);
    write_table(&mut out, &file.transition_table);
    debug_assert_eq!(out.len(), total);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn synth_container(action_rows: u32, action_columns: u32) -> Vec<u8> {
        let action_cells = (0..action_rows)
            .map(|row| (0..action_columns).map(|column| row * 1000 + column).collect())
            .collect();
        build_chrsysparam(&ChrSysParamFile {
            unit_id: 15_008_001,
            header_reserved: 0,
            action_table: ChrSysParamTable {
                marker: ACTION_TABLE_MARKER,
                reserved: 0,
                columns: action_columns,
                rows: action_cells,
            },
            transition_table: ChrSysParamTable {
                marker: TRANSITION_TABLE_MARKER,
                reserved: 0,
                columns: 1,
                rows: vec![vec![0]],
            },
        })
        .expect("synthetic container must build")
    }

    #[test]
    fn synthetic_large_table_round_trips_and_keeps_cell_addressing() {
        let source = synth_container(35, 128);
        assert_eq!(source.len(), 17_984);
        let parsed = parse_chrsysparam(&source).expect("35x128 container must parse");
        assert_eq!(parsed.action_table.rows[34][127], 34 * 1000 + 127);
        assert_eq!(build_chrsysparam(&parsed).expect("rebuild"), source);
    }

    #[test]
    fn adding_a_row_moves_the_transition_table_offset() {
        let mut parsed = parse_chrsysparam(&synth_container(2, 4)).expect("parse");
        parsed.action_table.rows.push(vec![7, 8, 9, 10]);
        let rebuilt = build_chrsysparam(&parsed).expect("rebuild");
        let reparsed = parse_chrsysparam(&rebuilt).expect("reparse");
        assert_eq!(reparsed.action_table.rows.len(), 3);
        assert_eq!(read_u32_at(&rebuilt, TRANSITION_TABLE_OFFSET_FIELD).unwrap(), 0x1C + 0x10 + 3 * 4 * 4);
        assert_eq!(reparsed, parsed);
    }

    #[test]
    fn trailing_bytes_are_rejected() {
        let mut source = synth_container(1, 1);
        source.extend_from_slice(&[0, 0, 0, 0]);
        let err = parse_chrsysparam(&source).expect_err("trailing bytes must be rejected");
        assert!(err.contains("trailing"), "unexpected error text: {}", err);
    }

    #[test]
    fn non_adjacent_transition_table_is_rejected() {
        let mut source = synth_container(1, 1);
        source[TRANSITION_TABLE_OFFSET_FIELD..TRANSITION_TABLE_OFFSET_FIELD + 4]
            .copy_from_slice(&0x40u32.to_le_bytes());
        let err = parse_chrsysparam(&source).expect_err("gap must be rejected");
        assert!(err.contains("does not follow"), "unexpected error text: {}", err);
    }

    #[test]
    fn unsupported_version_is_rejected() {
        let mut source = synth_container(1, 1);
        source[VERSION_OFFSET..VERSION_OFFSET + 4].copy_from_slice(&0x0002_0000u32.to_le_bytes());
        let err = parse_chrsysparam(&source).expect_err("version must be checked");
        assert!(err.contains("version"), "unexpected error text: {}", err);
    }

    #[test]
    fn build_rejects_ragged_rows() {
        let mut parsed = parse_chrsysparam(&synth_container(2, 4)).expect("parse");
        parsed.action_table.rows[1].pop();
        let err = build_chrsysparam(&parsed).expect_err("ragged row must be rejected");
        assert!(err.contains("row 1 has 3 cells"), "unexpected error text: {}", err);
    }

    #[test]
    fn build_rejects_swapped_markers() {
        let mut parsed = parse_chrsysparam(&synth_container(1, 1)).expect("parse");
        parsed.action_table.marker = TRANSITION_TABLE_MARKER;
        let err = build_chrsysparam(&parsed).expect_err("marker must be checked");
        assert!(err.contains("marker"), "unexpected error text: {}", err);
    }
}
