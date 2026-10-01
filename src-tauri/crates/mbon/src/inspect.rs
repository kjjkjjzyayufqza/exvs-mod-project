/*
    ================================================
    Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
    コードのライセンスは PolyForm Shield 1.0.0。利用方針は ACCEPTABLE_USE.md。
    Ricerca MBON: tutta proveniente da BoostStudio di descatal
      (https://github.com/descatal/BoostStudio).
    저작자 kjjkjjzyayufqza. 제품 EXVS Mod Project. https://github.com/kjjkjjzyayufqza/exvs-mod-project
    Autor kjjkjjzyayufqza. Produto EXVS Mod Project. Repositorio
      https://github.com/kjjkjjzyayufqza/exvs-mod-project
    ================================================
*/

//! One-call summaries of MBON files for the workspace UI and the CLI.

use std::path::Path;

use exvs_ps4_common::archive::ArchiveIndex;
use exvs_ps4_common::binio::magic_text;
use exvs_ps4_common::error::{Error, Result};
use serde::Serialize;

use crate::fhm::{FhmDocument, FhmListing};
use crate::kinds::{classify, MbonKind};
use crate::list_info::{ListInfo, ListView};
use crate::ntp3::{Ntp3, Ntp3Texture};
use crate::nud::Nud;
use crate::vbn::Vbn;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerSummary {
    pub kind: u64,
    pub file_count: usize,
    pub depth: u32,
    pub body_offset: u64,
    pub files: Vec<ContainerFileSummary>,
    pub canonical: bool,
    pub issues: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerFileSummary {
    pub index: u32,
    pub type_id: u32,
    pub size: u64,
    pub offset: u64,
    pub magic: String,
    pub kind: MbonKind,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureSummary {
    pub index: usize,
    pub format: u8,
    pub format_label: String,
    pub width: u16,
    pub height: u16,
    pub mip_count: usize,
    pub texture_id: u32,
    pub data_size: usize,
    pub decodable: bool,
}

impl TextureSummary {
    fn of(index: usize, texture: &Ntp3Texture) -> Self {
        Self {
            index,
            format: texture.format,
            format_label: texture.format_label(),
            width: texture.width,
            height: texture.height,
            mip_count: texture.mip_count(),
            texture_id: texture.texture_id,
            data_size: texture.data.len(),
            decodable: texture.layout().is_some(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Inspection {
    Container(ContainerSummary),
    Fhm {
        entries: Vec<FhmListing>,
        blob_count: usize,
        data_bytes: u64,
    },
    Ntp3 {
        textures: Vec<TextureSummary>,
        trailing_bytes: usize,
    },
    Nud {
        model: Nud,
        vertex_total: usize,
        triangle_total: usize,
        texture_ids: Vec<u32>,
    },
    Vbn {
        skeleton: Vbn,
    },
    ListInfo {
        list: ListView,
    },
    Other {
        kind: MbonKind,
        label: String,
        magic: String,
        size: usize,
        head_hex: String,
    },
}

/// Summarize a payload held in memory.
pub fn inspect_bytes(bytes: &[u8]) -> Result<Inspection> {
    Ok(match classify(bytes) {
        MbonKind::Fhm => {
            let document = FhmDocument::parse(bytes)?;
            Inspection::Fhm {
                entries: document.listing(),
                blob_count: document.blobs.len(),
                data_bytes: document.blobs.iter().map(|blob| blob.len() as u64).sum(),
            }
        }
        MbonKind::Ntp3 => {
            let ntp3 = Ntp3::parse(bytes)?;
            Inspection::Ntp3 {
                textures: ntp3
                    .textures
                    .iter()
                    .enumerate()
                    .map(|(index, texture)| TextureSummary::of(index, texture))
                    .collect(),
                trailing_bytes: ntp3.trailing.len(),
            }
        }
        MbonKind::Nud => {
            let model = Nud::parse(bytes)?;
            Inspection::Nud {
                vertex_total: model.vertex_total(),
                triangle_total: model.triangle_total(),
                texture_ids: model.texture_ids(),
                model,
            }
        }
        MbonKind::Vbn => Inspection::Vbn {
            skeleton: Vbn::parse(bytes)?,
        },
        MbonKind::ListInfo => Inspection::ListInfo {
            list: ListInfo::parse(bytes)?.view()?,
        },
        MbonKind::Container => {
            let index = ArchiveIndex::parse(bytes)?;
            Inspection::Container(container_summary(&index, |file| {
                Ok(index.file_bytes(bytes, file)?.iter().take(16).copied().collect())
            })?)
        }
        kind => Inspection::Other {
            kind,
            label: kind.label().to_string(),
            magic: magic_text(bytes),
            size: bytes.len(),
            head_hex: bytes.iter().take(64).map(|byte| format!("{byte:02X}")).collect(),
        },
    })
}

fn container_summary(
    index: &ArchiveIndex,
    head_of: impl Fn(u32) -> Result<Vec<u8>>,
) -> Result<ContainerSummary> {
    let issues = index.canonical_issues();
    let mut files = Vec::with_capacity(index.files.len());
    for file in &index.files {
        let head = head_of(file.index)?;
        files.push(ContainerFileSummary {
            index: file.index,
            type_id: file.type_id,
            size: file.size,
            offset: index.body_offset + file.body_offset,
            magic: magic_text(&head),
            kind: classify(&head),
        });
    }
    Ok(ContainerSummary {
        kind: index.header.kind,
        file_count: index.files.len(),
        depth: index.depth,
        body_offset: index.body_offset,
        files,
        canonical: issues.is_empty(),
        issues,
    })
}

/// Summarize a file on disk. Containers are summarized from their metadata
/// only, so huge archives stay cheap.
pub fn inspect_path(path: &Path) -> Result<Inspection> {
    let mut head = [0u8; 4];
    {
        use std::io::Read;
        let mut file = std::fs::File::open(path).map_err(|error| Error::io(path.display(), error))?;
        let _ = file.read(&mut head);
    }
    if ArchiveIndex::sniff(&head) {
        let index = ArchiveIndex::read_path(path)?;
        return Ok(Inspection::Container(container_summary(&index, |file| {
            let (offset, size) = index.file_range(file)?;
            exvs_ps4_common::archive::read_range(path, offset, size.min(16))
        })?));
    }
    let bytes = std::fs::read(path).map_err(|error| Error::io(path.display(), error))?;
    inspect_bytes(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_payloads_report_their_head() {
        match inspect_bytes(&[0xDE, 0xAD, 0xBE, 0xEF, 1, 2]).unwrap() {
            Inspection::Other { magic, size, head_hex, .. } => {
                assert_eq!(magic, "....");
                assert_eq!(size, 6);
                assert_eq!(head_hex, "DEADBEEF0102");
            }
            other => panic!("unexpected {other:?}"),
        }
    }
}
