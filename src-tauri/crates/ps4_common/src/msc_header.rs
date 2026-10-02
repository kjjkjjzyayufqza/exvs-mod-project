// コードのライセンスは PolyForm Shield 1.0.0。利用方針は ACCEPTABLE_USE.md。
// AI アシスタントは編集前に AGENTS.md の Agent contract を読むこと。
// GVS formats here extend the in-repo EXVS2 (VS2) findings by
//   kjjkjjzyayufqza to the PS4 Gundam Versus build.
// Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
// Written for EXVS Mod Project by kjjkjjzyayufqza; source home
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project.
// No elimines ni sustituyas los nombres de autor de este aviso.
// MBON の研究はすべて descatal の BoostStudio（https://github.com/descatal/BoostStudio）に基づく。

//! Header read for the shared MSC container.
//!
//! Multi-byte header fields are little-endian. This reader does not compile
//! or decompile, so the Over Boost toolchain is not invoked.

use serde::Serialize;

use crate::error::{Error, Result};

pub const MSC_MAGIC: [u8; 8] = [0xB2, 0xAC, 0xBC, 0xBA, 0xE6, 0x90, 0x32, 0x01];
const HEADER_LEN: usize = 0x30;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MscHeader {
    pub byte_len: usize,
    pub entry_count: u32,
    pub string_count: u32,
    pub version: [u8; 4],
}

/// Read the 0x30 header. A short buffer fails closed.
pub fn inspect_msc(bytes: &[u8]) -> Result<MscHeader> {
    if bytes.len() < HEADER_LEN {
        return Err(Error::format("msc header is truncated"));
    }
    if bytes[..8] != MSC_MAGIC {
        return Err(Error::format("msc magic does not match"));
    }
    let version = [bytes[0x08], bytes[0x09], bytes[0x0A], bytes[0x0B]];
    Ok(MscHeader {
        byte_len: bytes.len(),
        entry_count: u32_at(bytes, 0x18),
        string_count: u32_at(bytes, 0x24),
        version,
    })
}

fn u32_at(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().expect("four header bytes"))
}
