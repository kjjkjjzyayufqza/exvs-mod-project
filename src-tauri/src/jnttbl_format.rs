//! JNTT / `.jnttbl` binary layout (project-defined).
//!
//! Header (16 bytes, little-endian):
//! - `JNTT` magic
//! - `version` u32
//! - `bone_count` u32
//! - `flag` i32 (game-specific; not file size)
//!
//! Payload: each record is 8 bytes: `(hash_id u32, bone_index u32)` until end of file.

use binrw::io::Cursor;
use binrw::{BinRead, BinWrite};

pub const JNTT_MAGIC: &[u8; 4] = b"JNTT";

#[derive(Debug, Clone, PartialEq, Eq, BinRead, BinWrite)]
#[br(little)]
#[bw(little)]
pub struct JnttblHeader {
    pub magic: [u8; 4],
    pub version: u32,
    pub bone_count: u32,
    pub flag: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JnttblEntry {
    pub hash_id: u32,
    pub bone_index: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JnttblDocument {
    pub version: u32,
    pub bone_count: u32,
    pub flag: i32,
    pub entries: Vec<JnttblEntry>,
}

pub fn parse_jnttbl_bytes(data: &[u8]) -> Result<JnttblDocument, String> {
    if data.len() < 16 {
        return Err("JNTT file is too small (expected at least 16 bytes)".to_string());
    }
    let mut cursor = Cursor::new(data);
    let header = JnttblHeader::read_le(&mut cursor)
        .map_err(|e| format!("Failed to read JNTT header with binrw: {e}"))?;
    if &header.magic != JNTT_MAGIC {
        return Err(format!(
            "Invalid JNTT magic (expected {:?}, got {:?})",
            JNTT_MAGIC,
            header.magic
        ));
    }
    let payload = &data[16..];
    if payload.len() % 8 != 0 {
        return Err(format!(
            "Invalid JNTT payload length {} (expected a multiple of 8)",
            payload.len()
        ));
    }
    let mut entries = Vec::with_capacity(payload.len() / 8);
    for chunk in payload.chunks_exact(8) {
        let hash_id = u32::from_le_bytes(chunk[0..4].try_into().unwrap());
        let bone_index = u32::from_le_bytes(chunk[4..8].try_into().unwrap());
        entries.push(JnttblEntry {
            hash_id,
            bone_index,
        });
    }
    Ok(JnttblDocument {
        version: header.version,
        bone_count: header.bone_count,
        flag: header.flag,
        entries,
    })
}

pub fn serialize_jnttbl(doc: &JnttblDocument) -> Result<Vec<u8>, String> {
    let pairs_bytes = doc.entries.len().checked_mul(8).ok_or_else(|| {
        "JNTT entry list is too large".to_string()
    })?;
    let total = 16usize
        .checked_add(pairs_bytes)
        .ok_or_else(|| "JNTT output size overflow".to_string())?;
    let header = JnttblHeader {
        magic: *JNTT_MAGIC,
        version: doc.version,
        bone_count: doc.bone_count,
        flag: doc.flag,
    };
    let mut buf = Vec::with_capacity(total);
    let mut cursor = Cursor::new(&mut buf);
    header
        .write_le(&mut cursor)
        .map_err(|e| format!("Failed to write JNTT header with binrw: {e}"))?;
    for e in &doc.entries {
        e.hash_id
            .write_le(&mut cursor)
            .map_err(|e| format!("Failed to write JNTT entry: {e}"))?;
        e.bone_index
            .write_le(&mut cursor)
            .map_err(|e| format!("Failed to write JNTT entry: {e}"))?;
    }
    if buf.len() != total {
        return Err("JNTT serialization length mismatch".to_string());
    }
    Ok(buf)
}

pub fn bytes_to_hex_upper_spaced(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len().saturating_mul(3));
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 {
            s.push(' ');
        }
        use std::fmt::Write as _;
        let _ = write!(s, "{:02X}", b);
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_header_via_binrw() {
        let h = JnttblHeader {
            magic: *b"JNTT",
            version: 1,
            bone_count: 36,
            flag: 0x0000_019D,
        };
        let mut v = Vec::new();
        let mut c = Cursor::new(&mut v);
        h.write_le(&mut c).unwrap();
        let mut r = Cursor::new(&v);
        let h2 = JnttblHeader::read_le(&mut r).unwrap();
        assert_eq!(h, h2);
    }
}
