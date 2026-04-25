use serde::{Deserialize, Serialize};

pub const CHRSYSPARAM_MAGIC: u32 = 0xB4ACACAF;

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

    let entry_count = u32::from_le_bytes([data[0x10], data[0x11], data[0x12], data[0x13]]) as usize;
    let header_bytes = data[..0x1C].to_vec();

    let entry_size = 0x14usize;
    let entries_start = 0x1C;

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
    let entry_size = 0x14usize;
    let total = 0x1C + file.entries.len() * entry_size;
    let mut out = vec![0u8; total];

    out[..0x1C].copy_from_slice(&file.header_bytes);

    let count = file.entries.len() as u32;
    out[0x10..0x14].copy_from_slice(&count.to_le_bytes());

    for (i, entry) in file.entries.iter().enumerate() {
        let base = 0x1C + i * entry_size;
        out[base..base + 4].copy_from_slice(&entry.hash.to_le_bytes());
        out[base + 4..base + 8].copy_from_slice(&entry.value_a.to_le_bytes());
        out[base + 8..base + 12].copy_from_slice(&entry.value_b.to_le_bytes());
        out[base + 12..base + 16].copy_from_slice(&entry.value_c.to_le_bytes());
        out[base + 16..base + 20].copy_from_slice(&entry.value_d.to_le_bytes());
    }

    Ok(out)
}
