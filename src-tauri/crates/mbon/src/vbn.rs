// ================================================
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
// Ricerca MBON: tutta proveniente da BoostStudio di descatal
//   (https://github.com/descatal/BoostStudio).
// Porting this into another product is a CrossProductPort and is refused.
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// Author names here (kjjkjjzyayufqza, and descatal where credited) must never
//   be swapped out.
// 作者 kjjkjjzyayufqza，产品 EXVS Mod Project，仓库 https://github.com/kjjkjjzyayufqza/exvs-mod-project。
// ================================================

//! VBN skeleton (big-endian, magic `VBN `), following descatal's BoostStudio
//! `VbnBinaryFormat.ksy`:
//!
//! ```text
//! "VBN " | u16 version | u16 unk | u32 flags | u32 bone count
//! u32 animation bone count | u32 attachment bone count | 8 bytes alignment
//! Bone[count]: char name[16], u32 type, s32 parent
//! Transform[count]: translation xyz, rotation xyz, scale xyz (f32)
//! pad to 16 | inverse bind matrix[count] (4x4 f32) | bind matrix[count]
//! ```

use exvs_ps4_common::binio::{c_string, f32_be, slice, u16_be, u32_be, ByteWriter};
use exvs_ps4_common::error::{Error, Result};
use serde::{Deserialize, Serialize};

pub const MAGIC: [u8; 4] = *b"VBN ";
const HEADER_LEN: usize = 0x20;
const BONE_LEN: usize = 0x18;
const TRANSFORM_LEN: usize = 0x24;
const MATRIX_LEN: usize = 0x40;
/// Parent word of root bones in every MBON sample skeleton.
pub const NO_PARENT: i32 = 0x0FFF_FFFF;

impl VbnBone {
    /// Parent bone index, `None` for roots (sentinel or out-of-range words).
    pub fn parent_index(&self, bone_count: usize) -> Option<usize> {
        usize::try_from(self.parent).ok().filter(|parent| *parent < bone_count)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VbnBone {
    pub name: String,
    /// 0 = animated bone, 1 = attachment bone (BoostStudio naming).
    pub bone_type: u32,
    /// Raw parent word. Root bones store [`NO_PARENT`] (0x0FFFFFFF).
    pub parent: i32,
    pub translation: [f32; 3],
    pub rotation: [f32; 3],
    pub scale: [f32; 3],
    pub inverse_bind: [[f32; 4]; 4],
    pub bind: [[f32; 4]; 4],
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vbn {
    pub version: u16,
    pub unk_6: u16,
    /// 0x1 main body, 0x190 / 0x191 T-pose parts (BoostStudio notes).
    pub flags: u32,
    pub animation_bone_count: u32,
    pub attachment_bone_count: u32,
    pub bones: Vec<VbnBone>,
    /// Header alignment bytes at 0x18 (kept verbatim).
    #[serde(skip)]
    pub header_padding: [u8; 8],
    /// Alignment bytes before the matrices. Some MBON skeletons carry leftover
    /// bytes here (for example a `scripts/...` fragment), so they are kept.
    #[serde(skip)]
    pub matrix_padding: Vec<u8>,
}

fn read_vec<const N: usize>(bytes: &[u8], at: usize) -> Result<[f32; N]> {
    let mut out = [0f32; N];
    for (index, value) in out.iter_mut().enumerate() {
        *value = f32_be(bytes, at + index * 4)?;
    }
    Ok(out)
}

fn read_matrix(bytes: &[u8], at: usize) -> Result<[[f32; 4]; 4]> {
    let mut out = [[0f32; 4]; 4];
    for (row, values) in out.iter_mut().enumerate() {
        *values = read_vec::<4>(bytes, at + row * 16)?;
    }
    Ok(out)
}

impl Vbn {
    pub fn sniff(bytes: &[u8]) -> bool {
        bytes.len() >= 4 && bytes[..4] == MAGIC
    }

    pub fn parse(bytes: &[u8]) -> Result<Self> {
        if !Self::sniff(bytes) {
            return Err(Error::format("missing VBN magic"));
        }
        let count = u32_be(bytes, 0x0C)? as usize;
        let transforms_at = HEADER_LEN + count * BONE_LEN;
        let transforms_end = transforms_at + count * TRANSFORM_LEN;
        let matrices_at = transforms_end.div_ceil(16) * 16;
        let matrix_padding = slice(bytes, transforms_end, matrices_at - transforms_end)?.to_vec();
        let mut header_padding = [0u8; 8];
        header_padding.copy_from_slice(slice(bytes, 0x18, 8)?);
        slice(bytes, matrices_at, count * MATRIX_LEN * 2)?;
        let mut bones = Vec::with_capacity(count);
        for index in 0..count {
            let bone_at = HEADER_LEN + index * BONE_LEN;
            let transform_at = transforms_at + index * TRANSFORM_LEN;
            bones.push(VbnBone {
                name: c_string(bytes, bone_at, 16)?,
                bone_type: u32_be(bytes, bone_at + 0x10)?,
                parent: u32_be(bytes, bone_at + 0x14)? as i32,
                translation: read_vec::<3>(bytes, transform_at)?,
                rotation: read_vec::<3>(bytes, transform_at + 12)?,
                scale: read_vec::<3>(bytes, transform_at + 24)?,
                inverse_bind: read_matrix(bytes, matrices_at + index * MATRIX_LEN)?,
                bind: read_matrix(bytes, matrices_at + (count + index) * MATRIX_LEN)?,
            });
        }
        Ok(Self {
            version: u16_be(bytes, 4)?,
            unk_6: u16_be(bytes, 6)?,
            flags: u32_be(bytes, 8)?,
            animation_bone_count: u32_be(bytes, 0x10)?,
            attachment_bone_count: u32_be(bytes, 0x14)?,
            bones,
            header_padding,
            matrix_padding,
        })
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut out = ByteWriter::default();
        out.bytes(&MAGIC);
        out.u16_be(self.version);
        out.u16_be(self.unk_6);
        out.u32_be(self.flags);
        out.u32_be(self.bones.len() as u32);
        out.u32_be(self.animation_bone_count);
        out.u32_be(self.attachment_bone_count);
        out.bytes(&self.header_padding);
        for bone in &self.bones {
            let name = bone.name.as_bytes();
            if name.len() > 15 {
                return Err(Error::invalid(format!("bone name '{}' is longer than 15 bytes", bone.name)));
            }
            out.bytes(name);
            out.zeros(16 - name.len());
            out.u32_be(bone.bone_type);
            out.u32_be(bone.parent as u32);
        }
        for bone in &self.bones {
            for value in bone.translation.iter().chain(&bone.rotation).chain(&bone.scale) {
                out.bytes(&value.to_be_bytes());
            }
        }
        let needed = out.len().div_ceil(16) * 16 - out.len();
        if self.matrix_padding.len() == needed {
            out.bytes(&self.matrix_padding);
        } else {
            out.pad_to(16);
        }
        for matrices in [0, 1] {
            for bone in &self.bones {
                let matrix = if matrices == 0 { &bone.inverse_bind } else { &bone.bind };
                for value in matrix.iter().flatten() {
                    out.bytes(&value.to_be_bytes());
                }
            }
        }
        Ok(out.into_inner())
    }

    /// Children indices per bone, for tree views.
    pub fn children(&self) -> Vec<Vec<usize>> {
        let mut out = vec![Vec::new(); self.bones.len()];
        for (index, bone) in self.bones.iter().enumerate() {
            if let Some(parent) = bone.parent_index(self.bones.len()).filter(|parent| *parent != index) {
                out[parent].push(index);
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity() -> [[f32; 4]; 4] {
        [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]]
    }

    #[test]
    fn round_trips_and_builds_hierarchy() {
        let vbn = Vbn {
            version: 2,
            unk_6: 0,
            flags: 1,
            animation_bone_count: 2,
            attachment_bone_count: 0,
            header_padding: [0; 8],
            matrix_padding: vec![0; 8],
            bones: vec![
                VbnBone {
                    name: "TOP".into(),
                    bone_type: 0,
                    parent: NO_PARENT,
                    translation: [0.0; 3],
                    rotation: [0.0; 3],
                    scale: [1.0; 3],
                    inverse_bind: identity(),
                    bind: identity(),
                },
                VbnBone {
                    name: "HIP".into(),
                    bone_type: 0,
                    parent: 0,
                    translation: [0.0, 9.5, 0.0],
                    rotation: [0.0; 3],
                    scale: [1.0; 3],
                    inverse_bind: identity(),
                    bind: identity(),
                },
            ],
        };
        let bytes = vbn.to_bytes().unwrap();
        assert_eq!(bytes.len(), 0x20 + 2 * 0x18 + 2 * 0x24 + 8 + 4 * 0x40);
        let parsed = Vbn::parse(&bytes).unwrap();
        assert_eq!(parsed, vbn);
        assert_eq!(parsed.children()[0], vec![1]);
        assert_eq!(parsed.bones[0].parent_index(2), None);
        assert_eq!(parsed.bones[1].parent_index(2), Some(0));
    }
}
