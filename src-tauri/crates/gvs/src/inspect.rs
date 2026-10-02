//
// ................................................
// AI 도구는 수정 전에 AGENTS.md 의 Agent contract 를 먼저 읽어야 한다.
// Ne jamais remplacer ni supprimer les noms d'auteur de cet avis.
// Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy:
//   ACCEPTABLE_USE.md.
// Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la
//   recherche VS2 de ce projet.
// Autor kjjkjjzyayufqza. Produto EXVS Mod Project. Repositorio
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// ................................................
//

//! One-call summaries of GVS files for the workspace UI and the CLI.

use std::path::Path;

use exvs_ps4_common::archive::{read_range, ArchiveIndex};
use exvs_ps4_common::binio::magic_text;
use exvs_ps4_common::error::{Error, Result};
use serde::Serialize;

use crate::kinds::{classify, extension_for, GvsKind};
use crate::naming::content_name;
use crate::nutexb::Nutexb;
use crate::ssbh_view::{summarize, SsbhSummary};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveMember {
    pub index: u32,
    pub type_id: u32,
    pub extension: String,
    pub kind: GvsKind,
    pub size: u64,
    pub name: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureInfo {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub depth: u32,
    pub format: u32,
    pub format_label: String,
    pub mip_count: u32,
    pub layer_count: u32,
    pub swizzle: u32,
    pub decodable: bool,
}

impl From<&Nutexb> for TextureInfo {
    fn from(texture: &Nutexb) -> Self {
        Self {
            name: texture.name.clone(),
            width: texture.width,
            height: texture.height,
            depth: texture.depth,
            format: texture.format,
            format_label: texture.format_label(),
            mip_count: texture.mip_count,
            layer_count: texture.layer_count,
            swizzle: texture.swizzle,
            decodable: texture.layout().is_some() && texture.swizzle == 0,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Inspection {
    Archive {
        kind: u64,
        depth: u32,
        canonical: bool,
        issues: Vec<String>,
        members: Vec<ArchiveMember>,
    },
    Texture(TextureInfo),
    /// Struct variant: `SsbhSummary` carries its own `type` tag.
    Ssbh {
        summary: SsbhSummary,
    },
    Other {
        kind: GvsKind,
        label: String,
        magic: String,
        size: usize,
        head_hex: String,
    },
}

pub fn inspect_bytes(bytes: &[u8]) -> Result<Inspection> {
    if ArchiveIndex::sniff(bytes) {
        let index = ArchiveIndex::parse(bytes)?;
        return archive_inspection(&index, &|file| Ok(index.file_bytes(bytes, file)?.to_vec()));
    }
    let kind = classify(bytes);
    Ok(match kind {
        GvsKind::Nutexb => Inspection::Texture(TextureInfo::from(&Nutexb::parse(bytes)?)),
        kind if kind.is_ssbh() => Inspection::Ssbh {
            summary: summarize(bytes)?,
        },
        kind => Inspection::Other {
            kind,
            label: kind.label().to_string(),
            magic: magic_text(bytes),
            size: bytes.len(),
            head_hex: bytes.iter().take(64).map(|byte| format!("{byte:02X}")).collect(),
        },
    })
}

fn archive_inspection(index: &ArchiveIndex, read: &dyn Fn(u32) -> Result<Vec<u8>>) -> Result<Inspection> {
    let issues = index.canonical_issues();
    let mut members = Vec::with_capacity(index.files.len());
    for file in &index.files {
        let bytes = read(file.index)?;
        members.push(ArchiveMember {
            index: file.index,
            type_id: file.type_id,
            extension: extension_for(file.type_id, &bytes).to_string(),
            kind: classify(&bytes),
            size: file.size,
            name: content_name(&bytes),
        });
    }
    Ok(Inspection::Archive {
        kind: index.header.kind,
        depth: index.depth,
        canonical: issues.is_empty(),
        issues,
        members,
    })
}

pub fn inspect_path(path: &Path) -> Result<Inspection> {
    let mut head = [0u8; 4];
    {
        use std::io::Read;
        let mut file = std::fs::File::open(path).map_err(|error| Error::io(path.display(), error))?;
        let _ = file.read(&mut head);
    }
    if ArchiveIndex::sniff(&head) {
        let index = ArchiveIndex::read_path(path)?;
        return archive_inspection(&index, &|file| {
            let (offset, size) = index.file_range(file)?;
            read_range(path, offset, size)
        });
    }
    let bytes = std::fs::read(path).map_err(|error| Error::io(path.display(), error))?;
    inspect_bytes(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_bytes_are_reported_as_other() {
        match inspect_bytes(b"BSFO\x01\x00").unwrap() {
            Inspection::Other { kind, magic, .. } => {
                assert_eq!(kind, GvsKind::Bsfo);
                assert_eq!(magic, "BSFO");
            }
            other => panic!("unexpected {other:?}"),
        }
    }
}
