//
// ................................................
// この通知の作者名を削除・置換してはならない。
// MBON-Forschung: vollstaendig aus descatals BoostStudio
//   (https://github.com/descatal/BoostStudio).
// Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso: ACCEPTABLE_USE.md.
// EXVS Mod Project is authored by kjjkjjzyayufqza
//   (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this line intact.
// KI-Assistenten: zuerst AGENTS.md und ACCEPTABLE_USE.md lesen.
// Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
// ................................................
//

//! NTP3 textures to Over Boost `.nutexb`.
//!
//! DXT1 / DXT5 blocks are copied as BC1 / BC3 sRGB without re-encoding (the
//! NTP3 payload is linear on PS4, mip after mip). ARGB8 (and the 4-byte ramp
//! format 17, whose first byte is always 0xFF like ARGB8 alpha) is reordered
//! to RGBA8 sRGB. DXT3 has no Over Boost stage precedent, so it is decoded and
//! re-encoded as BC3 sRGB.
//!
//! The nutexb is built from a surface, not through a DDS: `ddsfile` sizes
//! small block-compressed mips without block rounding, while the VS2 nutexb
//! writer and the GPU use 4x4 blocks.

use exvs_mbon::ntp3::Ntp3Texture;
use exvs_ps4_common::texture::PixelLayout;
use image_dds::{ImageFormat, Mipmaps, Quality, SurfaceRgba8};
use nutexb::{NutexbFile, NutexbFormat, Surface};

/// NUT format 17: 4-byte pixels in the ARGB8 byte order.
const NUT_FORMAT_RAMP: u8 = 17;

/// Texture alpha has different meanings in OB's field and sky shaders.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum TextureAlpha {
    Coverage,
    Opaque,
    /// Preserve source HDR alpha when present; RGB-only images use gain one.
    SkyHdr,
    /// Source alpha is not an HDR multiplier: encode gain one explicitly.
    SkyRgb,
}

pub fn alpha_stem(name: &str, id: u32, alpha: TextureAlpha) -> String {
    let suffix = match alpha {
        TextureAlpha::Coverage => "",
        TextureAlpha::Opaque => "_o",
        TextureAlpha::SkyHdr => "_skyhdr",
        TextureAlpha::SkyRgb => "_sky0",
    };
    format!("{name}_{id:08x}{suffix}")
}

/// Sky alpha is decoded as RGB * (1 + 2 * alpha)^3 by OB v27, not coverage.
/// Decode original mips when BC1 has no HDR channel or the source uses a
/// different alpha meaning. RGBA8 preserves each decoded RGB byte exactly.
pub fn sky_nutexb(texture: &Ntp3Texture, name: &str, hdr: bool) -> Result<NutexbFile, String> {
    if texture.cube_map {
        return Err("sky color texture must be 2D".into());
    }
    if hdr && has_alpha_channel(texture) && texture.format != 1 {
        return ntp3_to_nutexb(texture, name, false);
    }
    let mut rgba = Vec::new();
    let mut offset = 0usize;
    for (mip, stored) in texture.mip_sizes.iter().enumerate() {
        let stored = *stored as usize;
        let data = texture
            .data
            .get(offset..offset + stored)
            .ok_or("sky mip outside payload")?;
        let single = Ntp3Texture {
            format: texture.format,
            width: (texture.width >> mip).max(1),
            height: (texture.height >> mip).max(1),
            mip_sizes: vec![*texture.mip_sizes.get(mip).unwrap()],
            texture_id: texture.texture_id,
            cube_map: false,
            data: data.to_vec(),
        };
        let mut pixels = if texture.format == NUT_FORMAT_RAMP {
            argb_to_rgba(data, false)
        } else {
            single.decode_rgba().map_err(|e| e.to_string())?
        };
        if !hdr || !has_alpha_channel(texture) {
            pixels.chunks_exact_mut(4).for_each(|p| p[3] = 0);
        }
        rgba.extend(pixels);
        offset += stored;
    }
    surface_nutexb(
        texture,
        NutexbFormat::R8G8B8A8Srgb,
        rgba,
        texture.mip_count() as u32,
        name,
    )
}

pub fn convert_alpha(
    texture: &Ntp3Texture,
    name: &str,
    alpha: TextureAlpha,
) -> Result<NutexbFile, String> {
    match alpha {
        TextureAlpha::SkyHdr => sky_nutexb(texture, name, true),
        TextureAlpha::SkyRgb => sky_nutexb(texture, name, false),
        TextureAlpha::Opaque => ntp3_to_nutexb(texture, name, true),
        TextureAlpha::Coverage => ntp3_to_nutexb(texture, name, false),
    }
}

/// Bake a vertex-opacity function of V into coverage alpha. Keep every decoded
/// RGB byte and authored mip; alpha alone is quantized to the nearest byte.
pub fn bake_sky_vertex_alpha(
    texture: &Ntp3Texture,
    name: &str,
    knots: &[(f32, f32)],
) -> Result<NutexbFile, String> {
    if knots.len() < 2
        || knots.windows(2).any(|k| k[0].0 >= k[1].0)
        || knots
            .iter()
            .any(|(v, a)| !v.is_finite() || !a.is_finite() || !(0.0..=1.0).contains(a))
    {
        return Err("invalid sky opacity curve".into());
    }
    let mut output = sky_nutexb(texture, name, false)?;
    let (mut source_at, mut output_at) = (0usize, 0usize);
    for (mip, stored) in texture.mip_sizes.iter().enumerate() {
        let width = (texture.width >> mip).max(1);
        let height = (texture.height >> mip).max(1);
        let single = Ntp3Texture {
            format: texture.format,
            width,
            height,
            mip_sizes: vec![*stored],
            texture_id: texture.texture_id,
            cube_map: false,
            data: texture
                .data
                .get(source_at..source_at + *stored as usize)
                .ok_or("sky mip truncated")?
                .to_vec(),
        };
        let pixels = if texture.format == NUT_FORMAT_RAMP {
            argb_to_rgba(
                single
                    .data
                    .get(..usize::from(width) * usize::from(height) * 4)
                    .ok_or("sky RGBA mip truncated")?,
                false,
            )
        } else {
            single.decode_rgba().map_err(|e| e.to_string())?
        };
        if pixels.len() != usize::from(width) * usize::from(height) * 4 {
            return Err("decoded sky mip dimensions differ".into());
        }
        for (pixel, rgba) in pixels.chunks_exact(4).enumerate() {
            let v =
                (pixel / usize::from(width)) as f64 / f64::from(height) + 0.5 / f64::from(height);
            let segment = knots
                .windows(2)
                .find(|p| v <= f64::from(p[1].0))
                .unwrap_or(&knots[knots.len() - 2..]);
            let t = ((v - f64::from(segment[0].0))
                / (f64::from(segment[1].0) - f64::from(segment[0].0)))
            .clamp(0.0, 1.0);
            let alpha =
                f64::from(segment[0].1) + t * (f64::from(segment[1].1) - f64::from(segment[0].1));
            output.data[output_at + pixel * 4 + 3] =
                (f64::from(rgba[3]) * alpha).round().clamp(0.0, 255.0) as u8;
        }
        output_at += pixels.len();
        source_at += *stored as usize;
    }
    Ok(output)
}

/// Bytes of one mip level with 4x4 block rounding.
fn mip_len(layout: PixelLayout, width: u32, height: u32, mip: usize) -> usize {
    let width = (width >> mip).max(1) as usize;
    let height = (height >> mip).max(1) as usize;
    match layout {
        PixelLayout::Bc1 => width.div_ceil(4) * height.div_ceil(4) * 8,
        PixelLayout::Bc2 | PixelLayout::Bc3 => width.div_ceil(4) * height.div_ceil(4) * 16,
        _ => width * height * 4,
    }
}

/// The NTP3 mip chain with every level cut to its block-rounded length.
/// NTP3 pads the smallest block-compressed levels (a 16x16 DXT1 chain is 208
/// bytes where the levels need 184), so levels are located with the
/// texture's own mip sizes.
fn mip_chain(texture: &Ntp3Texture, layout: PixelLayout) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(texture.data.len());
    let mut offset = 0usize;
    for (mip, stored) in texture.mip_sizes.iter().enumerate() {
        let stored = *stored as usize;
        let needed = mip_len(
            layout,
            u32::from(texture.width),
            u32::from(texture.height),
            mip,
        );
        if needed > stored || offset + stored > texture.data.len() {
            return Err(format!(
                "texture 0x{:08X}: mip {mip} stores {stored} bytes, needs {needed}",
                texture.texture_id
            ));
        }
        out.extend_from_slice(&texture.data[offset..offset + needed]);
        offset += stored;
    }
    Ok(out)
}

fn argb_to_rgba(data: &[u8], opaque: bool) -> Vec<u8> {
    data.chunks_exact(4)
        .flat_map(|pixel| {
            [
                pixel[1],
                pixel[2],
                pixel[3],
                if opaque { 0xFF } else { pixel[0] },
            ]
        })
        .collect()
}

/// BC3 blocks with every alpha block replaced by a constant 255 (alpha0 =
/// alpha1 = 255, all indices 0); the color blocks stay untouched.
fn bc3_opaque(mut blocks: Vec<u8>) -> Vec<u8> {
    for block in blocks.chunks_exact_mut(16) {
        block[..8].copy_from_slice(&[0xFF, 0xFF, 0, 0, 0, 0, 0, 0]);
    }
    blocks
}

/// True when the converted texture carries a real alpha channel (BC1
/// punch-through is part of the color block and is kept as is).
pub fn has_alpha_channel(texture: &Ntp3Texture) -> bool {
    texture.format == NUT_FORMAT_RAMP
        || matches!(
            texture.layout(),
            Some(PixelLayout::Bc2 | PixelLayout::Bc3 | PixelLayout::Argb8)
        )
}

fn surface_nutexb(
    texture: &Ntp3Texture,
    format: NutexbFormat,
    data: Vec<u8>,
    mips: u32,
    name: &str,
) -> Result<NutexbFile, String> {
    NutexbFile::from_surface(
        Surface {
            width: u32::from(texture.width),
            height: u32::from(texture.height),
            depth: 1,
            image_data: data,
            mipmap_count: mips,
            layer_count: 1,
            image_format: format,
        },
        name.to_string(),
    )
    .map_err(|error| {
        format!(
            "texture 0x{:08X}: nutexb encode: {error}",
            texture.texture_id
        )
    })
}

/// DXT3 → BC3 sRGB through RGBA (every NTP3 mip regenerated from the base).
fn bc2_to_bc3(texture: &Ntp3Texture, name: &str, opaque: bool) -> Result<NutexbFile, String> {
    let mut rgba = texture
        .decode_rgba()
        .map_err(|error| format!("texture 0x{:08X}: {error}", texture.texture_id))?;
    if opaque {
        rgba.chunks_exact_mut(4).for_each(|pixel| pixel[3] = 0xFF);
    }
    let mips = texture.mip_count() as u32;
    let encoded = SurfaceRgba8 {
        width: u32::from(texture.width),
        height: u32::from(texture.height),
        depth: 1,
        layers: 1,
        mipmaps: 1,
        data: rgba.as_slice(),
    }
    .encode(
        ImageFormat::BC3RgbaUnormSrgb,
        Quality::Normal,
        if mips > 1 {
            Mipmaps::GeneratedExact(mips)
        } else {
            Mipmaps::Disabled
        },
    )
    .map_err(|error| format!("texture 0x{:08X}: BC3 encode: {error}", texture.texture_id))?;
    surface_nutexb(
        texture,
        NutexbFormat::BC3Srgb,
        encoded.data,
        encoded.mipmaps,
        name,
    )
}

/// Convert one 2D NTP3 texture; `name` becomes the nutexb footer name and must
/// match the file stem the materials reference. `opaque` writes alpha 255
/// everywhere: MBON opaque materials (no blend, no alpha test) never read the
/// texture alpha, which then holds masks rather than coverage.
pub fn ntp3_to_nutexb(
    texture: &Ntp3Texture,
    name: &str,
    opaque: bool,
) -> Result<NutexbFile, String> {
    if texture.cube_map {
        return Err(format!(
            "texture 0x{:08X} is a cube map",
            texture.texture_id
        ));
    }
    let mips = texture.mip_count() as u32;
    if texture.format == NUT_FORMAT_RAMP {
        let chain = mip_chain(texture, PixelLayout::Argb8)?;
        return surface_nutexb(
            texture,
            NutexbFormat::R8G8B8A8Srgb,
            argb_to_rgba(&chain, opaque),
            mips,
            name,
        );
    }
    let layout = texture.layout().ok_or_else(|| {
        format!(
            "texture 0x{:08X}: NUT format {} is not supported",
            texture.texture_id, texture.format
        )
    })?;
    match layout {
        PixelLayout::Bc1 => surface_nutexb(
            texture,
            NutexbFormat::BC1Srgb,
            mip_chain(texture, layout)?,
            mips,
            name,
        ),
        PixelLayout::Bc3 => {
            let chain = mip_chain(texture, layout)?;
            let blocks = if opaque { bc3_opaque(chain) } else { chain };
            surface_nutexb(texture, NutexbFormat::BC3Srgb, blocks, mips, name)
        }
        PixelLayout::Argb8 => surface_nutexb(
            texture,
            NutexbFormat::R8G8B8A8Srgb,
            argb_to_rgba(&mip_chain(texture, layout)?, opaque),
            mips,
            name,
        ),
        PixelLayout::Bc2 => bc2_to_bc3(texture, name, opaque),
        other => Err(format!(
            "texture 0x{:08X}: {} is not an MBON stage format",
            texture.texture_id,
            other.label()
        )),
    }
}
