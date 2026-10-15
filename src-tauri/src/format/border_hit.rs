//! Over Boost stage `info/border_hit.hkt`.
//!
//! The file is a Havok binary tagfile (`TAG0`). Scene Editor can show it as a
//! collision wireframe when Havok Content Tools is installed, and it does not
//! edit the border mesh. This reader checks the container the shipped and
//! re-encoded border files actually use: SDK version, type-name table,
//! compressed-mesh type, scene labels, and the object index. Triangle decode
//! is a separate tagfile deserializer and is not part of this read.

use serde::Serialize;

const TAG0: [u8; 4] = *b"TAG0";
const SDKV: [u8; 4] = *b"SDKV";
const DATA: [u8; 4] = *b"DATA";
const TYPE: [u8; 4] = *b"TYPE";
const TSTR: [u8; 4] = *b"TSTR";
const INDX: [u8; 4] = *b"INDX";
const ITEM: [u8; 4] = *b"ITEM";

/// Container facts for one `border_hit.hkt`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BorderHitFile {
    pub sdk_version: String,
    pub byte_len: usize,
    pub data_len: usize,
    pub item_count: usize,
    /// Child chunk names inside `TYPE`, in file order.
    pub type_chunks: Vec<String>,
}

struct RawChunk<'a> {
    magic: [u8; 4],
    body: &'a [u8],
}

/// Read a stage border tagfile far enough to identify it.
///
/// A `map_hit.hkt` that uses the same scene template also satisfies these
/// checks. Callers that want the border pass `info/border_hit.hkt`.
pub fn parse_border_hit(bytes: &[u8]) -> Result<BorderHitFile, String> {
    let root = parse_chunk_list(bytes, "border tagfile")?;
    if root.len() != 1 || root[0].magic != TAG0 {
        return Err("border tagfile root is not a single TAG0 chunk".to_string());
    }
    let children = parse_chunk_list(root[0].body, "TAG0")?;
    let sdk = require_chunk(&children, SDKV, "TAG0")?;
    let data = require_chunk(&children, DATA, "TAG0")?;
    let type_body = require_chunk(&children, TYPE, "TAG0")?;
    let index = require_chunk(&children, INDX, "TAG0")?;

    let sdk_version = parse_sdk_version(sdk)?;
    let type_chunks_raw = parse_chunk_list(type_body, "TYPE")?;
    let type_names = require_chunk(&type_chunks_raw, TSTR, "TYPE")?;
    require_c_string(type_names, "hkRootLevelContainer")?;
    require_c_string(type_names, "hknpCompressedMeshShape")?;
    if !data
        .windows(b"Scene Data\0".len())
        .any(|window| window == b"Scene Data\0")
    {
        return Err("border tagfile DATA has no Scene Data label".to_string());
    }
    if !data
        .windows(b"Physics Scene Data\0".len())
        .any(|window| window == b"Physics Scene Data\0")
    {
        return Err("border tagfile DATA has no Physics Scene Data label".to_string());
    }

    let index_chunks = parse_chunk_list(index, "INDX")?;
    let items = require_chunk(&index_chunks, ITEM, "INDX")?;
    if items.len() % 12 != 0 || items.is_empty() {
        return Err(format!(
            "border ITEM table is {} bytes, expected a positive multiple of 12",
            items.len()
        ));
    }
    if items[..12] != [0; 12] {
        return Err("border ITEM[0] is not the null sentinel".to_string());
    }

    let type_chunks = type_chunks_raw
        .iter()
        .map(|chunk| String::from_utf8_lossy(&chunk.magic).into_owned())
        .collect();
    Ok(BorderHitFile {
        sdk_version,
        byte_len: bytes.len(),
        data_len: data.len(),
        item_count: items.len() / 12,
        type_chunks,
    })
}

fn parse_sdk_version(body: &[u8]) -> Result<String, String> {
    let text = std::str::from_utf8(body).map_err(|_| "border SDKV is not UTF-8".to_string())?;
    let version = text.trim_end_matches('\0').to_string();
    if version.len() != 8 || !version.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(format!("border SDK version '{version}' is not 8 digits"));
    }
    Ok(version)
}

fn require_c_string(pool: &[u8], name: &str) -> Result<(), String> {
    let mut needle = name.as_bytes().to_vec();
    needle.push(0);
    if pool.windows(needle.len()).any(|window| window == needle) {
        Ok(())
    } else {
        Err(format!("border type table has no {name}"))
    }
}

fn require_chunk<'a>(
    chunks: &[RawChunk<'a>],
    magic: [u8; 4],
    parent: &str,
) -> Result<&'a [u8], String> {
    let mut found = None;
    for chunk in chunks {
        if chunk.magic == magic {
            if found.is_some() {
                return Err(format!(
                    "border {parent} has two {} chunks",
                    std::str::from_utf8(&magic).unwrap_or("????")
                ));
            }
            found = Some(chunk.body);
        }
    }
    found.ok_or_else(|| {
        format!(
            "border {parent} has no {} chunk",
            std::str::from_utf8(&magic).unwrap_or("????")
        )
    })
}

fn parse_chunk_list<'a>(buf: &'a [u8], where_: &str) -> Result<Vec<RawChunk<'a>>, String> {
    let mut out = Vec::new();
    let mut offset = 0;
    while offset < buf.len() {
        if buf.len() - offset < 8 {
            return Err(format!("border {where_} truncated at {offset:#X}"));
        }
        let word = u32::from_be_bytes(buf[offset..offset + 4].try_into().expect("4 bytes"));
        let magic = buf[offset + 4..offset + 8].try_into().expect("4 bytes");
        let total = (word & 0x00FF_FFFF) as usize;
        if total < 8 {
            return Err(format!(
                "border {where_} chunk at {offset:#X} is shorter than its header"
            ));
        }
        let end = offset
            .checked_add(total)
            .ok_or_else(|| format!("border {where_} chunk size overflows at {offset:#X}"))?;
        if end > buf.len() {
            return Err(format!(
                "border {where_} chunk at {offset:#X} ends at {end:#X}, buffer is {:#X}",
                buf.len()
            ));
        }
        out.push(RawChunk {
            magic,
            body: &buf[offset + 8..end],
        });
        offset = end;
    }
    Ok(out)
}
