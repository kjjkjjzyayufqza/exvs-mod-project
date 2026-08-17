use serde::{Deserialize, Serialize};

pub const CHRSYSPARAM_MAGIC: u32 = 0xB4ACACAF;

/// Real container layout, proven against the engine and two real files on 2026-07-26
/// (see `docs/agent-sessions/param-editor-rewrite/process.md`): the u32 at 0x10 is the
/// TABLE COUNT (always 2), not an entry count. 0x14 and 0x18 hold absolute offsets to
/// table 0 and table 1. Each table is
/// `{ marker u32, rows u32, cols u32, pad u32, cells u32[rows * cols] }`.
///
/// The flat `ChrSysParamEntry` model below predates that discovery and can only represent
/// the degenerate file where both tables are 1x1, because a 1x1 table occupies exactly one
/// 0x14-byte pseudo entry. Anything larger is rejected rather than silently truncated: a
/// real 17984-byte file has a 35x128 table 0, and round-tripping it through the flat model
/// would emit 68 bytes and destroy 17916 bytes of parameter data.
const HEADER_SIZE: usize = 0x1C;
const ENTRY_SIZE: usize = 0x14;
const TABLE_COUNT_OFFSET: usize = 0x10;
const TABLE_OFFSET_FIELDS: [usize; 2] = [0x14, 0x18];
const TABLE_HEADER_SIZE: usize = 0x10;
const EXPECTED_TABLE_COUNT: u32 = 2;

#[derive(Debug, Clone, Copy)]
struct ChrSysParamTableLayout {
    offset: usize,
    rows: u32,
    cols: u32,
}

fn read_u32_at(data: &[u8], offset: usize) -> Result<u32, String> {
    let end = offset
        .checked_add(4)
        .ok_or_else(|| format!("ChrSysParam offset overflow at 0x{:X}", offset))?;
    if end > data.len() {
        return Err(format!(
            "ChrSysParam truncated: needed 4 bytes at 0x{:X}, file is {} bytes",
            offset,
            data.len()
        ));
    }
    Ok(u32::from_le_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]))
}

/// Validates the real table container and returns each table's layout.
/// Errors instead of guessing whenever the declared structure does not describe the file.
fn read_table_layouts(data: &[u8]) -> Result<Vec<ChrSysParamTableLayout>, String> {
    let table_count = read_u32_at(data, TABLE_COUNT_OFFSET)?;
    if table_count != EXPECTED_TABLE_COUNT {
        return Err(format!(
            "ChrSysParam unsupported table count {} at 0x{:X} (expected {})",
            table_count, TABLE_COUNT_OFFSET, EXPECTED_TABLE_COUNT
        ));
    }

    let mut layouts = Vec::with_capacity(TABLE_OFFSET_FIELDS.len());
    for (index, field_offset) in TABLE_OFFSET_FIELDS.iter().enumerate() {
        let offset = read_u32_at(data, *field_offset)? as usize;
        if offset < HEADER_SIZE {
            return Err(format!(
                "ChrSysParam table {} offset 0x{:X} overlaps the 0x{:X}-byte header",
                index, offset, HEADER_SIZE
            ));
        }
        let rows = read_u32_at(data, offset + 4)?;
        let cols = read_u32_at(data, offset + 8)?;
        let cells = (rows as usize)
            .checked_mul(cols as usize)
            .ok_or_else(|| format!("ChrSysParam table {} cell count overflow", index))?;
        let size =
            TABLE_HEADER_SIZE
                .checked_add(cells.checked_mul(4).ok_or_else(|| {
                    format!("ChrSysParam table {} cell byte size overflow", index)
                })?)
                .ok_or_else(|| format!("ChrSysParam table {} size overflow", index))?;
        if offset + size > data.len() {
            return Err(format!(
                "ChrSysParam table {} declares {}x{} ({} bytes at 0x{:X}) but the file is {} bytes",
                index,
                rows,
                cols,
                size,
                offset,
                data.len()
            ));
        }
        layouts.push(ChrSysParamTableLayout { offset, rows, cols });
    }
    Ok(layouts)
}

/// The flat entry model is only faithful when every table is 1x1.
fn ensure_flat_entry_model_is_lossless(
    layouts: &[ChrSysParamTableLayout],
    data_len: usize,
) -> Result<(), String> {
    for (index, layout) in layouts.iter().enumerate() {
        if layout.rows != 1 || layout.cols != 1 {
            return Err(format!(
                "ChrSysParam table {} is {}x{} at 0x{:X}; this parser models only 1x1 tables, \
                 so editing a {}-byte file through it would destroy {} bytes of table data. \
                 Table-aware read/write is a separate change (see \
                 docs/agent-sessions/param-editor-rewrite/process.md)",
                index,
                layout.rows,
                layout.cols,
                layout.offset,
                data_len,
                data_len.saturating_sub(HEADER_SIZE + layouts.len() * ENTRY_SIZE)
            ));
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChrSysParamEntry {
    pub hash: u32,
    pub value_a: u32,
    pub value_b: u32,
    pub value_c: u32,
    pub value_d: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChrSysParamFile {
    pub magic: u32,
    pub header_bytes: Vec<u8>,
    pub entries: Vec<ChrSysParamEntry>,
}

pub fn parse_chrsysparam(data: &[u8]) -> Result<ChrSysParamFile, String> {
    if data.len() < 0x1C {
        return Err("ChrSysParam file too small for header".to_string());
    }

    let magic = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    if magic != CHRSYSPARAM_MAGIC {
        return Err(format!(
            "ChrSysParam invalid magic: 0x{:08X}, expected 0x{:08X}",
            magic, CHRSYSPARAM_MAGIC
        ));
    }

    let layouts = read_table_layouts(data)?;
    ensure_flat_entry_model_is_lossless(&layouts, data.len())?;

    // Each surviving table is 1x1, i.e. exactly one 0x14-byte pseudo entry.
    let entry_count = layouts.len();
    let header_bytes = data[..HEADER_SIZE].to_vec();

    let entry_size = ENTRY_SIZE;
    let entries_start = HEADER_SIZE;

    let mut entries = Vec::with_capacity(entry_count);
    for i in 0..entry_count {
        let base = entries_start + i * entry_size;
        if base + entry_size > data.len() {
            break;
        }
        entries.push(ChrSysParamEntry {
            hash: u32::from_le_bytes([data[base], data[base + 1], data[base + 2], data[base + 3]]),
            value_a: u32::from_le_bytes([
                data[base + 4],
                data[base + 5],
                data[base + 6],
                data[base + 7],
            ]),
            value_b: u32::from_le_bytes([
                data[base + 8],
                data[base + 9],
                data[base + 10],
                data[base + 11],
            ]),
            value_c: u32::from_le_bytes([
                data[base + 12],
                data[base + 13],
                data[base + 14],
                data[base + 15],
            ]),
            value_d: u32::from_le_bytes([
                data[base + 16],
                data[base + 17],
                data[base + 18],
                data[base + 19],
            ]),
        });
    }

    Ok(ChrSysParamFile {
        magic,
        header_bytes,
        entries,
    })
}

pub fn build_chrsysparam(file: &ChrSysParamFile) -> Result<Vec<u8>, String> {
    if file.header_bytes.len() != HEADER_SIZE {
        return Err(format!(
            "ChrSysParam header must be {} bytes, got {}",
            HEADER_SIZE,
            file.header_bytes.len()
        ));
    }

    let entry_size = ENTRY_SIZE;
    let total = HEADER_SIZE + file.entries.len() * entry_size;
    let mut out = vec![0u8; total];

    out[..HEADER_SIZE].copy_from_slice(&file.header_bytes);

    let count = file.entries.len() as u32;
    out[TABLE_COUNT_OFFSET..TABLE_COUNT_OFFSET + 4].copy_from_slice(&count.to_le_bytes());

    for (i, entry) in file.entries.iter().enumerate() {
        let base = HEADER_SIZE + i * entry_size;
        out[base..base + 4].copy_from_slice(&entry.hash.to_le_bytes());
        out[base + 4..base + 8].copy_from_slice(&entry.value_a.to_le_bytes());
        out[base + 8..base + 12].copy_from_slice(&entry.value_b.to_le_bytes());
        out[base + 12..base + 16].copy_from_slice(&entry.value_c.to_le_bytes());
        out[base + 16..base + 20].copy_from_slice(&entry.value_d.to_le_bytes());
    }

    // Self-check: never hand back bytes the parser would refuse or that describe a table
    // container inconsistent with the payload. Adding or removing pseudo entries shifts the
    // table offsets recorded in the header, so such a file must not reach disk.
    let layouts = read_table_layouts(&out)
        .map_err(|err| format!("ChrSysParam build produced an invalid container: {}", err))?;
    ensure_flat_entry_model_is_lossless(&layouts, out.len())
        .map_err(|err| format!("ChrSysParam build produced an invalid container: {}", err))?;

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_PATH: &str = "E:\\XB\\\u{89e3}\u{5305}\\com\\file\\0x08248A8D\\chrsysparam.csyspm";

    const TABLE0_MARKER: u32 = 0xA8BBBAB9;
    const TABLE1_MARKER: u32 = 0xA8BAA9BA;

    /// Builds a container with the real layout: two tables whose dimensions are caller chosen.
    fn synth_container(table0_rows: u32, table0_cols: u32) -> Vec<u8> {
        let table0_cells = (table0_rows as usize) * (table0_cols as usize);
        let table0_size = TABLE_HEADER_SIZE + table0_cells * 4;
        let table0_offset = HEADER_SIZE;
        let table1_offset = table0_offset + table0_size;
        let table1_size = TABLE_HEADER_SIZE + 4;

        let mut out = vec![0u8; table1_offset + table1_size];
        out[0..4].copy_from_slice(&CHRSYSPARAM_MAGIC.to_le_bytes());
        out[TABLE_COUNT_OFFSET..TABLE_COUNT_OFFSET + 4]
            .copy_from_slice(&EXPECTED_TABLE_COUNT.to_le_bytes());
        out[TABLE_OFFSET_FIELDS[0]..TABLE_OFFSET_FIELDS[0] + 4]
            .copy_from_slice(&(table0_offset as u32).to_le_bytes());
        out[TABLE_OFFSET_FIELDS[1]..TABLE_OFFSET_FIELDS[1] + 4]
            .copy_from_slice(&(table1_offset as u32).to_le_bytes());

        out[table0_offset..table0_offset + 4].copy_from_slice(&TABLE0_MARKER.to_le_bytes());
        out[table0_offset + 4..table0_offset + 8].copy_from_slice(&table0_rows.to_le_bytes());
        out[table0_offset + 8..table0_offset + 12].copy_from_slice(&table0_cols.to_le_bytes());

        out[table1_offset..table1_offset + 4].copy_from_slice(&TABLE1_MARKER.to_le_bytes());
        out[table1_offset + 4..table1_offset + 8].copy_from_slice(&1u32.to_le_bytes());
        out[table1_offset + 8..table1_offset + 12].copy_from_slice(&1u32.to_le_bytes());
        out
    }

    #[test]
    fn degenerate_sample_round_trips_byte_exact() {
        let source = std::fs::read(SAMPLE_PATH).expect("failed to read chrsysparam sample file");

        let parsed = parse_chrsysparam(&source).expect("failed to parse chrsysparam sample file");
        let rebuilt =
            build_chrsysparam(&parsed).expect("failed to rebuild chrsysparam sample file");

        assert_eq!(rebuilt, source);
        assert_eq!(parsed.entries.len(), EXPECTED_TABLE_COUNT as usize);
    }

    #[test]
    fn synthetic_one_by_one_container_round_trips() {
        let source = synth_container(1, 1);

        let parsed = parse_chrsysparam(&source).expect("1x1 container must parse");
        let rebuilt = build_chrsysparam(&parsed).expect("1x1 container must rebuild");

        assert_eq!(rebuilt, source);
    }

    #[test]
    fn multi_cell_table_is_rejected_instead_of_truncated() {
        // Shape of a real 17984-byte file: table 0 is 35x128.
        let source = synth_container(35, 128);
        assert_eq!(source.len(), 17984);

        let err = parse_chrsysparam(&source)
            .expect_err("a 35x128 table must be rejected, not silently truncated");

        assert!(err.contains("35x128"), "unexpected error text: {}", err);
        assert!(err.contains("destroy"), "unexpected error text: {}", err);
    }

    #[test]
    fn build_rejects_entry_count_change_that_would_break_the_container() {
        let source = synth_container(1, 1);
        let parsed = parse_chrsysparam(&source).expect("1x1 container must parse");

        let mut with_added = parsed.clone();
        with_added.entries.push(parsed.entries[0].clone());

        let err = build_chrsysparam(&with_added)
            .expect_err("adding a pseudo entry must not produce a writable file");
        assert!(
            err.contains("invalid container"),
            "unexpected error text: {}",
            err
        );
    }

    #[test]
    fn table_offset_overlapping_header_is_rejected() {
        let mut source = synth_container(1, 1);
        source[TABLE_OFFSET_FIELDS[0]..TABLE_OFFSET_FIELDS[0] + 4]
            .copy_from_slice(&4u32.to_le_bytes());

        let err =
            parse_chrsysparam(&source).expect_err("an in-header table offset must be rejected");
        assert!(err.contains("overlaps"), "unexpected error text: {}", err);
    }
}
