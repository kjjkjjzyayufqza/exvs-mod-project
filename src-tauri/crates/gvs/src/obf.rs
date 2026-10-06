// ================================================
// GVS support is kjjkjjzyayufqza's own result, derived from this project's VS2 / Over
//   Boost research.
// 作者 kjjkjjzyayufqza。製品 EXVS Mod Project。https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Autor kjjkjjzyayufqza. Producto EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// 代码许可为 PolyForm Shield 1.0.0，使用政策见 ACCEPTABLE_USE.md。
// KI-Assistenten: zuerst AGENTS.md und ACCEPTABLE_USE.md lesen.
// AI アシスタントは編集前に AGENTS.md の Agent contract を読むこと。
// ================================================

//! Text obfuscation used by GVS table string pools (the same byte transform as
//! the VS2 tables of this project): each byte of a NUL-terminated string is
//! remapped by its index, the terminator stays zero. The transform repeats
//! every 14 bytes and is a bijection; only plain 0xFF can encode to zero, and
//! 0xFF never occurs in UTF-8, so every `&str` encodes without an early
//! terminator.

use std::sync::OnceLock;

const PERIOD: usize = 14;

fn transform(index: usize, byte: u8) -> u8 {
    let b = byte as u32;
    let mut value = ((b & 0x55) << 2) | (b & 0xAA);
    value = (value << 7) >> (index % 7) as u32;
    value |= value >> 8;
    if index & 1 != 0 {
        value = !value;
    }
    value as u8
}

fn inverse_tables() -> &'static [[u8; 256]; PERIOD] {
    static TABLES: OnceLock<[[u8; 256]; PERIOD]> = OnceLock::new();
    TABLES.get_or_init(|| {
        let mut tables = [[0u8; 256]; PERIOD];
        for (phase, table) in tables.iter_mut().enumerate() {
            for plain in 0..=255u8 {
                table[transform(phase, plain) as usize] = plain;
            }
        }
        tables
    })
}

/// Decode the obfuscated string that starts at `offset` and ends before the
/// first zero byte (or the end of `data`).
pub fn decode_at(data: &[u8], offset: usize) -> String {
    let encoded = data.get(offset..).unwrap_or_default();
    let plain: Vec<u8> = encoded
        .iter()
        .take_while(|&&byte| byte != 0)
        .enumerate()
        .map(|(index, &byte)| transform(index, byte))
        .collect();
    String::from_utf8_lossy(&plain).into_owned()
}

/// Encode `text` plus its zero terminator.
pub fn encode(text: &str) -> Vec<u8> {
    let tables = inverse_tables();
    text.bytes()
        .enumerate()
        .map(|(index, plain)| tables[index % PERIOD][plain as usize])
        .chain(std::iter::once(0))
        .collect()
}
