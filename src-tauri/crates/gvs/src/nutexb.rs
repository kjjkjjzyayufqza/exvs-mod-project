// 作者 kjjkjjzyayufqza，产品 EXVS Mod Project，仓库 https://github.com/kjjkjjzyayufqza/exvs-mod-project。
// Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la recherche VS2 de ce
//   projet.
// Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Repozytorium
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso: ACCEPTABLE_USE.md.
// Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
// Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.

//! GVS `.nutexb` textures, footer v1.2 and v1.1 (`46XT` ... ` XET`).
//!
//! The layouts are the same family the project already handles for VS2 / OB:
//!
//! ```text
//! v1.2: pixel data | LayerMipmaps[layers] (16 x u32 each)
//!       footer 0x70: "46XT" | name[0x40] | width | height | depth | format u32 | unk2
//!                    | mip count | swizzle word | layer count | data size | " XET" | 1.2
//! v1.1: pixel data
//!       footer 0x86C: "46XT" | name[0x40] | width | height | depth | format u32 | unk2
//!                     | layer count | mip count | mip sizes @+0x60 ... | " XET" | 1.1
//! ```
//!
//! 595 GVS sample textures use v1.2 and 232 use v1.1. GVS stores pixels
//! linearly (swizzle word 0), so data decodes directly. Edited textures keep
//! the footer version they were read with.

use exvs_ps4_common::binio::{c_string, slice, u16_le, u32_le, ByteWriter};
use exvs_ps4_common::error::{Error, Result};
use exvs_ps4_common::texture::{self, PixelLayout};
use serde::{Deserialize, Serialize};

pub const FOOTER_LEN: usize = 0x70;
pub const FOOTER_V11_LEN: usize = 0x86C;
pub const LAYER_MIPMAPS_LEN: usize = 0x40;
const V11_TABLE_AT: usize = 0x60;
const V11_TABLE_LEN: usize = 0x864 - V11_TABLE_AT;

/// Known nutexb format words.
pub fn layout_of(format: u32) -> Option<(PixelLayout, &'static str)> {
    Some(match format {
        0x0400 => (PixelLayout::Rgba8, "R8G8B8A8 Unorm"),
        0x0405 => (PixelLayout::Rgba8, "R8G8B8A8 sRGB"),
        0x0450 => (PixelLayout::Bgra8, "B8G8R8A8 Unorm"),
        0x0455 => (PixelLayout::Bgra8, "B8G8R8A8 sRGB"),
        0x0480 => (PixelLayout::Bc1, "BC1 Unorm"),
        0x0485 => (PixelLayout::Bc1, "BC1 sRGB"),
        0x0490 => (PixelLayout::Bc2, "BC2 Unorm"),
        0x0495 => (PixelLayout::Bc2, "BC2 sRGB"),
        0x04A0 => (PixelLayout::Bc3, "BC3 Unorm"),
        0x04A5 => (PixelLayout::Bc3, "BC3 sRGB"),
        0x0180 => (PixelLayout::Bc4, "BC4 Unorm"),
        0x0280 => (PixelLayout::Bc5, "BC5 Unorm"),
        0x04D7 => (PixelLayout::Bc6h, "BC6H Ufloat"),
        0x04E0 => (PixelLayout::Bc7, "BC7 Unorm"),
        0x04E5 => (PixelLayout::Bc7, "BC7 sRGB"),
        _ => return None,
    })
}

/// Format word to write for a layout (sRGB variants keep their family).
pub fn format_for(layout: PixelLayout, srgb: bool) -> Option<u32> {
    Some(match (layout, srgb) {
        (PixelLayout::Rgba8, false) => 0x0400,
        (PixelLayout::Rgba8, true) => 0x0405,
        (PixelLayout::Bgra8, false) => 0x0450,
        (PixelLayout::Bgra8, true) => 0x0455,
        (PixelLayout::Bc1, false) => 0x0480,
        (PixelLayout::Bc1, true) => 0x0485,
        (PixelLayout::Bc2, false) => 0x0490,
        (PixelLayout::Bc2, true) => 0x0495,
        (PixelLayout::Bc3, false) => 0x04A0,
        (PixelLayout::Bc3, true) => 0x04A5,
        (PixelLayout::Bc4, _) => 0x0180,
        (PixelLayout::Bc5, _) => 0x0280,
        (PixelLayout::Bc6h, _) => 0x04D7,
        (PixelLayout::Bc7, false) => 0x04E0,
        (PixelLayout::Bc7, true) => 0x04E5,
        _ => return None,
    })
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Nutexb {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub depth: u32,
    pub format: u32,
    pub unk2: u32,
    pub mip_count: u32,
    pub swizzle: u32,
    pub layer_count: u32,
    /// Footer data-size word (pixel bytes before the mip tables).
    pub data_size: u32,
    pub version: (u16, u16),
    /// Mip sizes per layer.
    pub mip_sizes: Vec<Vec<u32>>,
    /// Raw name field bytes (kept so unedited names round-trip exactly).
    #[serde(skip)]
    pub name_field: Vec<u8>,
    /// v1.1 only: raw mip-size table bytes (`None` regenerates it after edits).
    #[serde(skip)]
    pub v11_table: Option<Vec<u8>>,
    #[serde(skip)]
    pub data: Vec<u8>,
}

impl Nutexb {
    /// Footer length of the nutexb version stored at the end of `bytes`.
    fn footer_len_of(bytes: &[u8]) -> Option<usize> {
        if bytes.len() < 8 || bytes[bytes.len() - 8..bytes.len() - 4] != *b" XET" {
            return None;
        }
        let minor = u16::from_le_bytes([bytes[bytes.len() - 2], bytes[bytes.len() - 1]]);
        let length = if minor == 1 { FOOTER_V11_LEN } else { FOOTER_LEN };
        (bytes.len() >= length && bytes[bytes.len() - length..bytes.len() - length + 4] == *b"46XT").then_some(length)
    }

    /// True when the buffer ends with a v1.2 or v1.1 nutexb footer.
    pub fn sniff(bytes: &[u8]) -> bool {
        Self::footer_len_of(bytes).is_some()
    }

    /// Footer name without parsing the whole file.
    pub fn footer_name(bytes: &[u8]) -> Option<String> {
        let length = Self::footer_len_of(bytes)?;
        c_string(bytes, bytes.len() - length + 4, 0x40).ok()
    }

    pub fn parse(bytes: &[u8]) -> Result<Self> {
        match Self::footer_len_of(bytes) {
            Some(FOOTER_V11_LEN) => Self::parse_v11(bytes),
            Some(_) => Self::parse_v12(bytes),
            None => Err(Error::format("missing nutexb 46XT / XET footer")),
        }
    }

    fn parse_v11(bytes: &[u8]) -> Result<Self> {
        let footer = bytes.len() - FOOTER_V11_LEN;
        let layer_count = u32_le(bytes, footer + 0x58)?;
        let mip_count = u32_le(bytes, footer + 0x5C)?;
        if layer_count == 0 || layer_count > 64 || mip_count == 0 || mip_count > 16 {
            return Err(Error::unsupported(format!(
                "nutexb v1.1 with {layer_count} layers and {mip_count} mips"
            )));
        }
        let table = slice(bytes, footer + V11_TABLE_AT, V11_TABLE_LEN)?.to_vec();
        let mips = (0..mip_count as usize)
            .map(|mip| u32_le(&table, mip * 4))
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            name: c_string(bytes, footer + 4, 0x40)?,
            name_field: slice(bytes, footer + 4, 0x40)?.to_vec(),
            width: u32_le(bytes, footer + 0x44)?,
            height: u32_le(bytes, footer + 0x48)?,
            depth: u32_le(bytes, footer + 0x4C)?,
            format: u32_le(bytes, footer + 0x50)?,
            unk2: u32_le(bytes, footer + 0x54)?,
            mip_count,
            swizzle: 0,
            layer_count,
            data_size: footer as u32,
            version: (1, 1),
            mip_sizes: vec![mips],
            v11_table: Some(table),
            data: bytes[..footer].to_vec(),
        })
    }

    fn parse_v12(bytes: &[u8]) -> Result<Self> {
        let footer = bytes.len() - FOOTER_LEN;
        let layer_count = u32_le(bytes, footer + 0x60)?;
        let mip_count = u32_le(bytes, footer + 0x58)?;
        if layer_count == 0 || layer_count > 64 || mip_count == 0 || mip_count > 16 {
            return Err(Error::unsupported(format!(
                "nutexb with {layer_count} layers and {mip_count} mips"
            )));
        }
        let table = footer
            .checked_sub(layer_count as usize * LAYER_MIPMAPS_LEN)
            .ok_or_else(|| Error::format("nutexb mip tables overlap the start of the file"))?;
        let data_size = u32_le(bytes, footer + 0x64)? as usize;
        if data_size > table {
            return Err(Error::format(format!(
                "nutexb data size 0x{data_size:X} exceeds the 0x{table:X} bytes before its mip tables"
            )));
        }
        let mut mip_sizes = Vec::with_capacity(layer_count as usize);
        for layer in 0..layer_count as usize {
            let at = table + layer * LAYER_MIPMAPS_LEN;
            mip_sizes.push(
                (0..mip_count as usize)
                    .map(|mip| u32_le(bytes, at + mip * 4))
                    .collect::<Result<Vec<_>>>()?,
            );
        }
        Ok(Self {
            name: c_string(bytes, footer + 4, 0x40)?,
            name_field: slice(bytes, footer + 4, 0x40)?.to_vec(),
            width: u32_le(bytes, footer + 0x44)?,
            height: u32_le(bytes, footer + 0x48)?,
            depth: u32_le(bytes, footer + 0x4C)?,
            format: u32_le(bytes, footer + 0x50)?,
            unk2: u32_le(bytes, footer + 0x54)?,
            mip_count,
            swizzle: u32_le(bytes, footer + 0x5C)?,
            layer_count,
            data_size: data_size as u32,
            version: (u16_le(bytes, footer + 0x6C)?, u16_le(bytes, footer + 0x6E)?),
            mip_sizes,
            v11_table: None,
            data: bytes[..table].to_vec(),
        })
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        if self.version == (1, 1) {
            return self.to_bytes_v11();
        }
        let mut out = ByteWriter::with_capacity(self.data.len() + 0x200);
        out.bytes(&self.data);
        for layer in &self.mip_sizes {
            if layer.len() > 16 {
                return Err(Error::invalid("a nutexb layer lists more than 16 mips"));
            }
            for size in layer {
                out.u32_le(*size);
            }
            out.zeros((16 - layer.len()) * 4);
        }
        out.bytes(b"46XT");
        out.bytes(&self.name_bytes()?);
        for value in [
            self.width,
            self.height,
            self.depth,
            self.format,
            self.unk2,
            self.mip_count,
            self.swizzle,
            self.layer_count,
            self.data_size,
        ] {
            out.u32_le(value);
        }
        out.bytes(b" XET");
        out.u16_le(self.version.0);
        out.u16_le(self.version.1);
        Ok(out.into_inner())
    }

    fn to_bytes_v11(&self) -> Result<Vec<u8>> {
        let mut out = ByteWriter::with_capacity(self.data.len() + FOOTER_V11_LEN);
        out.bytes(&self.data);
        out.bytes(b"46XT");
        out.bytes(&self.name_bytes()?);
        for value in [
            self.width,
            self.height,
            self.depth,
            self.format,
            self.unk2,
            self.layer_count,
            self.mip_count,
        ] {
            out.u32_le(value);
        }
        match &self.v11_table {
            Some(table) if table.len() == V11_TABLE_LEN => out.bytes(table),
            _ => {
                let sizes = self.mip_sizes.first().cloned().unwrap_or_default();
                if sizes.len() * 4 > V11_TABLE_LEN {
                    return Err(Error::invalid("too many mips for a v1.1 nutexb"));
                }
                for size in &sizes {
                    out.u32_le(*size);
                }
                out.zeros(V11_TABLE_LEN - sizes.len() * 4);
            }
        }
        out.bytes(b" XET");
        out.u16_le(1);
        out.u16_le(1);
        Ok(out.into_inner())
    }

    fn name_bytes(&self) -> Result<[u8; 0x40]> {
        let mut field = [0u8; 0x40];
        let stored = c_string(&self.name_field, 0, 0x40).unwrap_or_default();
        if self.name_field.len() == 0x40 && stored == self.name {
            field.copy_from_slice(&self.name_field);
            return Ok(field);
        }
        let name = self.name.as_bytes();
        if name.len() >= 0x40 {
            return Err(Error::invalid(format!("texture name '{}' is longer than 63 bytes", self.name)));
        }
        field[..name.len()].copy_from_slice(name);
        Ok(field)
    }

    pub fn layout(&self) -> Option<PixelLayout> {
        layout_of(self.format).map(|(layout, _)| layout)
    }

    pub fn format_label(&self) -> String {
        layout_of(self.format)
            .map(|(_, label)| label.to_string())
            .unwrap_or_else(|| format!("format 0x{:04X}", self.format))
    }

    pub fn is_srgb(&self) -> bool {
        matches!(self.format & 0xF, 0x5)
    }

    /// Decode layer 0, mip 0 to RGBA8.
    pub fn decode_rgba(&self) -> Result<Vec<u8>> {
        if self.swizzle != 0 {
            return Err(Error::unsupported("swizzled nutexb data is not used by GVS"));
        }
        let layout = self
            .layout()
            .ok_or_else(|| Error::unsupported(format!("nutexb {} has no decoder", self.format_label())))?;
        texture::decode_base_rgba_lenient(layout, self.width, self.height, &self.data)
    }

    pub fn to_png(&self) -> Result<Vec<u8>> {
        texture::encode_png(self.width, self.height, &self.decode_rgba()?)
    }

    pub fn to_dds(&self) -> Result<Vec<u8>> {
        let layout = self
            .layout()
            .ok_or_else(|| Error::unsupported(format!("nutexb {} cannot be exported", self.format_label())))?;
        if self.layer_count != 1 || self.depth > 1 {
            return Err(Error::unsupported("only single-layer 2D nutexb files export to DDS"));
        }
        let size = texture::surface_byte_len(layout, self.width, self.height, self.mip_count);
        let data = self
            .data
            .get(..size)
            .ok_or_else(|| Error::format("nutexb data is shorter than its mip chain"))?;
        texture::to_dds(layout, self.width, self.height, self.mip_count, data)
    }

    /// Replace pixels from RGBA8 (single layer), keeping name and format family.
    pub fn replace_from_rgba(
        &mut self,
        width: u32,
        height: u32,
        rgba: &[u8],
        layout: Option<PixelLayout>,
        mip_count: Option<u32>,
    ) -> Result<()> {
        let layout = match layout {
            Some(layout) => layout,
            None => self
                .layout()
                .ok_or_else(|| Error::unsupported(format!("keep {}: no encoder", self.format_label())))?,
        };
        let format = format_for(layout, self.is_srgb())
            .ok_or_else(|| Error::unsupported(format!("{} is not a nutexb format", layout.label())))?;
        let max_mips = 32 - width.max(height).max(1).leading_zeros();
        let mips = mip_count.unwrap_or(self.mip_count).clamp(1, max_mips.min(16));
        let data = texture::encode_rgba(layout, width, height, rgba, mips)?;
        self.apply_surface(layout, format, width, height, mips, data);
        Ok(())
    }

    /// Replace pixels from a DDS (format, size and mips come from the DDS).
    pub fn replace_from_dds(&mut self, dds: &[u8]) -> Result<()> {
        let decoded = texture::from_dds(dds)?;
        let format = format_for(decoded.layout, self.is_srgb())
            .ok_or_else(|| Error::unsupported(format!("{} is not a nutexb format", decoded.layout.label())))?;
        if decoded.mip_count > 16 {
            return Err(Error::unsupported("nutexb files hold at most 16 mips"));
        }
        self.apply_surface(decoded.layout, format, decoded.width, decoded.height, decoded.mip_count, decoded.data);
        Ok(())
    }

    fn apply_surface(&mut self, layout: PixelLayout, format: u32, width: u32, height: u32, mips: u32, data: Vec<u8>) {
        self.format = format;
        self.width = width;
        self.height = height;
        self.depth = 1;
        self.mip_count = mips;
        self.layer_count = 1;
        self.swizzle = 0;
        self.data_size = data.len() as u32;
        self.v11_table = None;
        self.mip_sizes = vec![(0..mips)
            .map(|mip| texture::mip_byte_len(layout, width, height, mip) as u32)
            .collect()];
        self.data = data;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Nutexb {
        let mut texture = Nutexb {
            name: "ser_intro_001".into(),
            width: 4,
            height: 4,
            depth: 1,
            format: 0x0400,
            unk2: 4,
            mip_count: 1,
            swizzle: 0,
            layer_count: 1,
            data_size: 64,
            version: (1, 2),
            mip_sizes: vec![vec![64]],
            name_field: Vec::new(),
            v11_table: None,
            data: vec![0x7F; 64],
        };
        let rgba: Vec<u8> = (0..16u8).flat_map(|value| [value * 16, 0, 255 - value * 16, 255]).collect();
        texture.replace_from_rgba(4, 4, &rgba, None, None).unwrap();
        texture
    }

    #[test]
    fn footer_layout_matches_gvs_samples() {
        let bytes = sample().to_bytes().unwrap();
        assert_eq!(bytes.len(), 64 + 0x40 + 0x70);
        assert!(Nutexb::sniff(&bytes));
        assert_eq!(Nutexb::footer_name(&bytes).as_deref(), Some("ser_intro_001"));
        let parsed = Nutexb::parse(&bytes).unwrap();
        assert_eq!(parsed.to_bytes().unwrap(), bytes);
        assert_eq!(parsed.decode_rgba().unwrap()[..4], [0, 0, 255, 255]);
    }

    #[test]
    fn v11_footer_round_trips_and_survives_edits() {
        let mut texture = sample();
        texture.version = (1, 1);
        let bytes = texture.to_bytes().unwrap();
        assert_eq!(bytes.len(), 64 + FOOTER_V11_LEN);
        assert_eq!(&bytes[bytes.len() - 4..], &[1, 0, 1, 0]);
        let parsed = Nutexb::parse(&bytes).unwrap();
        assert_eq!(parsed.version, (1, 1));
        assert_eq!(parsed.to_bytes().unwrap(), bytes);
        let mut edited = parsed;
        edited
            .replace_from_rgba(8, 8, &vec![10u8; 256], Some(PixelLayout::Bc1), Some(2))
            .unwrap();
        let again = Nutexb::parse(&edited.to_bytes().unwrap()).unwrap();
        assert_eq!(again.version, (1, 1));
        assert_eq!((again.width, again.mip_count), (8, 2));
        assert_eq!(again.mip_sizes, vec![vec![32, 8]]);
        assert_eq!(again.decode_rgba().unwrap().len(), 8 * 8 * 4);
    }

    #[test]
    fn bc_conversion_keeps_srgb_family() {
        let mut texture = sample();
        texture.format = 0x0405;
        let rgba = vec![200u8; 8 * 8 * 4];
        texture.replace_from_rgba(8, 8, &rgba, Some(PixelLayout::Bc3), Some(2)).unwrap();
        assert_eq!(texture.format, 0x04A5);
        assert_eq!(texture.mip_sizes, vec![vec![64, 16]]);
        let dds = texture.to_dds().unwrap();
        let mut back = texture.clone();
        back.replace_from_dds(&dds).unwrap();
        assert_eq!(back.data, texture.data);
        assert_eq!(back.format, 0x04A5);
    }
}
