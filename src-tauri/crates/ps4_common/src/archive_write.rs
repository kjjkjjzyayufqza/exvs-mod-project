/*
    No elimines ni sustituyas los nombres de autor de este aviso.
    Fuera del arbol de EXVS Mod Project este archivo no debe completarse ni
      portarse.
    Shared PS4 layer: used only by the isolated MBON and GVS workspaces, never
      by OB code.
    AI 도구는 수정 전에 AGENTS.md 의 Agent contract 를 먼저 읽어야 한다.
    Ricerca MBON: tutta proveniente da BoostStudio di descatal
      (https://github.com/descatal/BoostStudio).
    El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la
      investigacion VS2 de este proyecto.
    Licence du code : PolyForm Shield 1.0.0. Regles d'usage : ACCEPTABLE_USE.md.
    EXVS Mod Project is authored by kjjkjjzyayufqza
      (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this line
      intact.
*/

//! Editable archive model and the canonical writer.
//!
//! An [`ArchiveDraft`] holds the header words, the type group order, the
//! logical file list (each with a data source) and the folder/item tree. The
//! writer derives every other metadata word from those, using the layout rules
//! documented in [`crate::archive`], so an unedited draft reproduces the
//! original archive byte for byte and an edited draft stays loadable.
//!
//! File data is streamed from its source while writing; a multi-GB archive is
//! never held in memory.

use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;

use crate::archive::{
    canonical_body_offsets, canonical_body_start, group_total, ArchiveHeader, ArchiveIndex,
    NodeFields, TreeNode, BODY_ENTRY_FLAG, DEFAULT_GROUP_ALIGN, HEADER_LEN, MAGIC,
};
use crate::binio::align_up;
use crate::error::{Error, Result};

/// Where a file's bytes come from when the archive is written.
#[derive(Clone, Debug)]
pub enum DataSource {
    Bytes(Arc<Vec<u8>>),
    /// A byte range inside another file (usually the original archive).
    Range { path: PathBuf, offset: u64, len: u64 },
    /// A whole file on disk.
    File(PathBuf),
}

impl DataSource {
    pub fn bytes(data: Vec<u8>) -> Self {
        Self::Bytes(Arc::new(data))
    }

    pub fn len(&self) -> Result<u64> {
        match self {
            Self::Bytes(data) => Ok(data.len() as u64),
            Self::Range { len, .. } => Ok(*len),
            Self::File(path) => std::fs::metadata(path)
                .map(|meta| meta.len())
                .map_err(|error| Error::io(path.display(), error)),
        }
    }

    pub fn is_empty(&self) -> Result<bool> {
        Ok(self.len()? == 0)
    }

    /// Load the bytes into memory (only for small files or previews).
    pub fn read_all(&self) -> Result<Vec<u8>> {
        match self {
            Self::Bytes(data) => Ok(data.as_ref().clone()),
            Self::Range { path, offset, len } => crate::archive::read_range(path, *offset, *len),
            Self::File(path) => std::fs::read(path).map_err(|error| Error::io(path.display(), error)),
        }
    }
}

#[derive(Clone, Debug)]
pub struct DraftFile {
    pub type_id: u32,
    pub source: DataSource,
}

/// Editable archive.
#[derive(Clone, Debug)]
pub struct ArchiveDraft {
    pub header: ArchiveHeader,
    pub type_order: Vec<u32>,
    pub files: Vec<DraftFile>,
    pub root: TreeNode,
}

/// Result of a write.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WriteReport {
    pub total_len: u64,
    pub body_offset: u64,
    pub meta_end: u64,
    pub file_count: usize,
}

/// Precomputed metadata and body layout.
struct Plan {
    meta: Vec<u8>,
    body_offset: u64,
    packed_order: Vec<u32>,
    offsets: Vec<u64>,
    sizes: Vec<u64>,
    body_len: u64,
}

impl ArchiveDraft {
    /// Empty archive with one root folder.
    pub fn empty(header: ArchiveHeader) -> Self {
        Self {
            header,
            type_order: Vec::new(),
            files: Vec::new(),
            root: TreeNode::folder(NodeFields::default()),
        }
    }

    /// Draft whose files stream from the original archive on disk.
    pub fn from_index(index: &ArchiveIndex, archive_path: &Path) -> Self {
        let files = index
            .files
            .iter()
            .map(|file| DraftFile {
                type_id: file.type_id,
                source: DataSource::Range {
                    path: archive_path.to_path_buf(),
                    offset: index.body_offset + file.body_offset,
                    len: file.size,
                },
            })
            .collect();
        Self {
            header: index.header.clone(),
            type_order: index.groups.iter().map(|group| group.type_id).collect(),
            files,
            root: index.root.clone(),
        }
    }

    /// Draft copied out of an in-memory archive.
    pub fn from_bytes(archive: &[u8]) -> Result<Self> {
        let index = ArchiveIndex::parse(archive)?;
        let mut files = Vec::with_capacity(index.files.len());
        for file in &index.files {
            files.push(DraftFile {
                type_id: file.type_id,
                source: DataSource::bytes(index.file_bytes(archive, file.index)?.to_vec()),
            });
        }
        Ok(Self {
            header: index.header.clone(),
            type_order: index.groups.iter().map(|group| group.type_id).collect(),
            files,
            root: index.root.clone(),
        })
    }

    /// One root folder holding one item: the shape of single-payload archives.
    pub fn single(header: ArchiveHeader, type_id: u32, source: DataSource) -> Self {
        let mut draft = Self::empty(header);
        draft.type_order.push(type_id);
        draft.files.push(DraftFile { type_id, source });
        if let TreeNode::Folder { children, .. } = &mut draft.root {
            children.push(TreeNode::Item {
                fields: NodeFields::default(),
                file: 0,
            });
        }
        draft
    }

    pub fn file_count(&self) -> usize {
        self.files.len()
    }

    /// Replace the bytes of a logical file (its type stays).
    pub fn replace(&mut self, index: u32, source: DataSource) -> Result<()> {
        let file = self
            .files
            .get_mut(index as usize)
            .ok_or_else(|| Error::invalid(format!("file {index} does not exist")))?;
        file.source = source;
        Ok(())
    }

    /// Add a new file of `type_id` and list it in the folder at `folder_path`.
    /// Returns the new logical index. Later indices shift by one.
    pub fn add_file(
        &mut self,
        folder_path: &[usize],
        type_id: u32,
        fields: NodeFields,
        source: DataSource,
    ) -> Result<u32> {
        match self.root.node_at(folder_path) {
            Some(TreeNode::Folder { .. }) => {}
            _ => return Err(Error::invalid(format!("{folder_path:?} is not a folder"))),
        }
        let types: Vec<u32> = self.files.iter().map(|file| file.type_id).collect();
        let inserted = logical_insert_position(&mut self.type_order, &types, type_id);
        let position = inserted as usize;
        self.root
            .remap_files(&|file| if file >= inserted { file + 1 } else { file });
        self.files.insert(position, DraftFile { type_id, source });
        if let Some(TreeNode::Folder { children, .. }) = self.root.node_at_mut(folder_path) {
            children.push(TreeNode::Item {
                fields,
                file: inserted,
            });
        }
        Ok(inserted)
    }

    /// Add an empty folder under `parent_path`; returns its child index.
    pub fn add_folder(&mut self, parent_path: &[usize], fields: NodeFields) -> Result<usize> {
        match self.root.node_at_mut(parent_path) {
            Some(TreeNode::Folder { children, .. }) => {
                children.push(TreeNode::folder(fields));
                Ok(children.len() - 1)
            }
            _ => Err(Error::invalid(format!("{parent_path:?} is not a folder"))),
        }
    }

    /// Remove the node at `node_path`. Files that are no longer listed by any
    /// item are dropped from the archive.
    pub fn remove_node(&mut self, node_path: &[usize]) -> Result<()> {
        let (last, parent_path) = node_path
            .split_last()
            .ok_or_else(|| Error::invalid("the root folder cannot be removed"))?;
        let removed = match self.root.node_at_mut(parent_path) {
            Some(TreeNode::Folder { children, .. }) if *last < children.len() => children.remove(*last),
            _ => return Err(Error::invalid(format!("{node_path:?} does not exist"))),
        };
        let mut candidates = Vec::new();
        match &removed {
            TreeNode::Item { file, .. } => candidates.push(*file),
            TreeNode::Folder { .. } => removed.walk_items(&mut |file, _| candidates.push(file)),
        }
        candidates.sort_unstable();
        candidates.dedup();
        for file in candidates.into_iter().rev() {
            if self.root.count_items_for_file(file) == 0 {
                self.drop_file(file);
            }
        }
        Ok(())
    }

    /// Remove a logical file and every item that lists it.
    pub fn remove_file(&mut self, index: u32) -> Result<()> {
        if index as usize >= self.files.len() {
            return Err(Error::invalid(format!("file {index} does not exist")));
        }
        self.root.remove_items_for_file(index);
        self.drop_file(index);
        Ok(())
    }

    fn drop_file(&mut self, index: u32) {
        let removed = self.files.remove(index as usize);
        self.root
            .remap_files(&|file| if file > index { file - 1 } else { file });
        if !self.files.iter().any(|file| file.type_id == removed.type_id) {
            self.type_order.retain(|type_id| *type_id != removed.type_id);
        }
    }

    /// Check the invariants the writer relies on.
    pub fn validate(&self) -> Result<()> {
        let mut position = 0usize;
        for type_id in &self.type_order {
            while position < self.files.len() && self.files[position].type_id == *type_id {
                position += 1;
            }
        }
        if position != self.files.len() {
            return Err(Error::invalid(format!(
                "file {position} (type 0x{:X}) is not grouped in type order",
                self.files[position].type_id
            )));
        }
        let mut out_of_range = None;
        self.root.walk_items(&mut |file, _| {
            if file as usize >= self.files.len() && out_of_range.is_none() {
                out_of_range = Some(file);
            }
        });
        if let Some(file) = out_of_range {
            return Err(Error::invalid(format!("an item points at missing file {file}")));
        }
        if !self.root.is_folder() {
            return Err(Error::invalid("the structure root must be a folder"));
        }
        Ok(())
    }

    fn plan(&self) -> Result<Plan> {
        self.validate()?;
        let sizes: Vec<u64> = self
            .files
            .iter()
            .map(|file| file.source.len())
            .collect::<Result<_>>()?;

        let mut packed_order = self.root.first_occurrence_files();
        let listed: std::collections::HashSet<u32> = packed_order.iter().copied().collect();
        packed_order.extend((0..self.files.len() as u32).filter(|index| !listed.contains(index)));
        let offsets = canonical_body_offsets(&packed_order, &sizes);
        let body_len = packed_order
            .iter()
            .map(|index| offsets[*index as usize] + sizes[*index as usize])
            .max()
            .unwrap_or(0);

        let mut meta = Vec::new();
        meta.extend_from_slice(&(self.type_order.len() as u32).to_le_bytes());
        meta.extend_from_slice(&(self.files.len() as u32).to_le_bytes());
        meta.extend_from_slice(&self.root.folder_depth().to_le_bytes());
        meta.extend_from_slice(&(self.files.len() as u32).to_le_bytes());

        let mut ranges = Vec::with_capacity(self.type_order.len());
        let mut start = 0usize;
        for type_id in &self.type_order {
            let count = self.files[start..]
                .iter()
                .take_while(|file| file.type_id == *type_id)
                .count();
            ranges.push(start..start + count);
            meta.extend_from_slice(&type_id.to_le_bytes());
            meta.extend_from_slice(&[0u8; 12]);
            meta.extend_from_slice(&group_total(&sizes[start..start + count]).to_le_bytes());
            meta.extend_from_slice(&DEFAULT_GROUP_ALIGN.to_le_bytes());
            meta.extend_from_slice(&(count as u32).to_le_bytes());
            start += count;
        }
        for (group_index, range) in ranges.iter().enumerate() {
            let mut running = 0u64;
            for index in range.clone() {
                meta.extend_from_slice(&(group_index as u32).to_le_bytes());
                meta.extend_from_slice(&(running as u32).to_le_bytes());
                meta.extend_from_slice(&0u32.to_le_bytes());
                running += align_up(sizes[index], 16);
            }
        }
        for index in &packed_order {
            meta.extend_from_slice(&offsets[*index as usize].to_le_bytes());
            meta.extend_from_slice(&sizes[*index as usize].to_le_bytes());
            meta.extend_from_slice(&0u64.to_le_bytes());
            meta.extend_from_slice(&BODY_ENTRY_FLAG.to_le_bytes());
            meta.extend_from_slice(&index.to_le_bytes());
        }
        self.root.serialize_into(&mut meta);

        let meta_end = (HEADER_LEN + meta.len()) as u64;
        Ok(Plan {
            meta,
            body_offset: canonical_body_start(meta_end),
            packed_order,
            offsets,
            sizes,
            body_len,
        })
    }

    /// Stream the archive into `out`.
    pub fn write_to(&self, out: &mut dyn Write) -> Result<WriteReport> {
        let plan = self.plan()?;
        let meta_end = (HEADER_LEN + plan.meta.len()) as u64;
        let mut header = Vec::with_capacity(HEADER_LEN);
        header.extend_from_slice(&MAGIC);
        header.extend_from_slice(&self.header.version.to_le_bytes());
        header.extend_from_slice(&self.header.flags.to_le_bytes());
        header.extend_from_slice(&self.header.reserved_0c.to_le_bytes());
        header.extend_from_slice(&plan.body_offset.to_le_bytes());
        header.extend_from_slice(&meta_end.to_le_bytes());
        header.extend_from_slice(&self.header.kind.to_le_bytes());
        header.extend_from_slice(&self.header.reserved_28.to_le_bytes());
        out.write_all(&header)?;
        out.write_all(&plan.meta)?;
        write_zeros(out, plan.body_offset - meta_end)?;

        let mut handles: HashMap<PathBuf, File> = HashMap::new();
        let mut cursor = 0u64;
        for index in &plan.packed_order {
            let offset = plan.offsets[*index as usize];
            let size = plan.sizes[*index as usize];
            write_zeros(out, offset - cursor)?;
            let written = copy_source(&self.files[*index as usize].source, out, &mut handles)?;
            if written != size {
                return Err(Error::io(
                    format!("file {index}"),
                    io::Error::new(
                        io::ErrorKind::UnexpectedEof,
                        format!("expected {size} bytes, copied {written}; the source changed while writing"),
                    ),
                ));
            }
            cursor = offset + size;
        }
        out.flush()?;
        Ok(WriteReport {
            total_len: plan.body_offset + plan.body_len,
            body_offset: plan.body_offset,
            meta_end,
            file_count: self.files.len(),
        })
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut out = Vec::new();
        self.write_to(&mut out)?;
        Ok(out)
    }

    /// Write to `path` through a temporary sibling, then rename into place.
    pub fn write_path(&self, path: &Path) -> Result<WriteReport> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| Error::io(parent.display(), error))?;
        }
        let temp = path.with_extension("ps4tmp");
        let report = {
            let file = File::create(&temp).map_err(|error| Error::io(temp.display(), error))?;
            let mut writer = io::BufWriter::with_capacity(1 << 20, file);
            let report = self.write_to(&mut writer);
            if report.is_err() {
                drop(writer);
                let _ = std::fs::remove_file(&temp);
            }
            report?
        };
        std::fs::rename(&temp, path).map_err(|error| Error::io(path.display(), error))?;
        Ok(report)
    }
}

/// Logical index for a new file of `type_id`: right after the last file of
/// that type, or at the end with the type appended to `type_order`. Callers
/// that keep their own tree must shift item indices `>=` the result by one.
pub fn logical_insert_position(type_order: &mut Vec<u32>, type_ids: &[u32], type_id: u32) -> u32 {
    if let Some(last) = type_ids.iter().rposition(|candidate| *candidate == type_id) {
        return (last + 1) as u32;
    }
    match type_order.iter().position(|candidate| *candidate == type_id) {
        Some(order) => {
            let preceding = &type_order[..order];
            type_ids
                .iter()
                .rposition(|candidate| preceding.contains(candidate))
                .map(|last| last + 1)
                .unwrap_or(0) as u32
        }
        None => {
            type_order.push(type_id);
            type_ids.len() as u32
        }
    }
}

fn write_zeros(out: &mut dyn Write, mut count: u64) -> Result<()> {
    const ZEROS: [u8; 4096] = [0u8; 4096];
    while count > 0 {
        let chunk = count.min(ZEROS.len() as u64) as usize;
        out.write_all(&ZEROS[..chunk])?;
        count -= chunk as u64;
    }
    Ok(())
}

fn copy_source(
    source: &DataSource,
    out: &mut dyn Write,
    handles: &mut HashMap<PathBuf, File>,
) -> Result<u64> {
    match source {
        DataSource::Bytes(data) => {
            out.write_all(data)?;
            Ok(data.len() as u64)
        }
        DataSource::Range { path, offset, len } => {
            if !handles.contains_key(path) {
                let file = File::open(path).map_err(|error| Error::io(path.display(), error))?;
                handles.insert(path.clone(), file);
            }
            let file = handles.get_mut(path).expect("handle inserted above");
            file.seek(SeekFrom::Start(*offset))
                .map_err(|error| Error::io(path.display(), error))?;
            let copied = io::copy(&mut file.take(*len), out)
                .map_err(|error| Error::io(path.display(), error))?;
            Ok(copied)
        }
        DataSource::File(path) => {
            let mut file = File::open(path).map_err(|error| Error::io(path.display(), error))?;
            io::copy(&mut file, out).map_err(|error| Error::io(path.display(), error))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_draft() -> ArchiveDraft {
        let mut draft = ArchiveDraft::empty(ArchiveHeader {
            kind: 30,
            ..ArchiveHeader::default()
        });
        let textures = draft.add_folder(&[], NodeFields::default()).unwrap();
        draft
            .add_file(&[textures], 0x0B, NodeFields::default(), DataSource::bytes(vec![1; 0x30]))
            .unwrap();
        draft
            .add_file(&[], 0x00, NodeFields::default(), DataSource::bytes(vec![2; 0x11]))
            .unwrap();
        draft
            .add_file(&[textures], 0x0B, NodeFields::default(), DataSource::bytes(vec![3; 0x20000]))
            .unwrap();
        draft
    }

    #[test]
    fn written_archive_parses_back_with_canonical_layout() {
        let draft = sample_draft();
        assert_eq!(draft.type_order, vec![0x0B, 0x00]);
        let bytes = draft.to_bytes().unwrap();
        let index = ArchiveIndex::parse(&bytes).unwrap();
        assert!(index.canonical_issues().is_empty(), "{:?}", index.canonical_issues());
        assert_eq!(index.header.kind, 30);
        assert_eq!(index.files.len(), 3);
        assert_eq!(index.files[0].type_id, 0x0B);
        assert_eq!(index.files[1].type_id, 0x0B);
        assert_eq!(index.files[2].type_id, 0x00);
        assert_eq!(index.file_bytes(&bytes, 1).unwrap(), &vec![3u8; 0x20000][..]);
        assert_eq!(index.file_bytes(&bytes, 2).unwrap(), &vec![2u8; 0x11][..]);
        assert_eq!(index.depth, 2);
        assert_eq!(bytes.len() as u64, index.expected_len());
    }

    #[test]
    fn rewrite_of_parsed_archive_is_byte_identical() {
        let bytes = sample_draft().to_bytes().unwrap();
        let again = ArchiveDraft::from_bytes(&bytes).unwrap().to_bytes().unwrap();
        assert_eq!(bytes, again);
    }

    #[test]
    fn removing_last_reference_drops_the_file_and_its_type() {
        let mut draft = sample_draft();
        draft.remove_node(&[1]).unwrap();
        assert_eq!(draft.files.len(), 2);
        assert_eq!(draft.type_order, vec![0x0B]);
        draft.remove_node(&[0]).unwrap();
        assert!(draft.files.is_empty());
        assert!(draft.type_order.is_empty());
        let bytes = draft.to_bytes().unwrap();
        let index = ArchiveIndex::parse(&bytes).unwrap();
        assert_eq!(index.files.len(), 0);
        assert_eq!(bytes.len(), 0x10000);
    }

    #[test]
    fn shared_items_keep_files_alive() {
        let mut draft = sample_draft();
        if let TreeNode::Folder { children, .. } = &mut draft.root {
            children.push(TreeNode::Item {
                fields: NodeFields::default(),
                file: 0,
            });
        }
        draft.remove_node(&[0]).unwrap();
        assert_eq!(draft.files.len(), 2, "file 0 is still listed by the new item");
        assert_eq!(draft.root.count_items_for_file(0), 1);
    }

    #[test]
    fn insert_position_respects_declared_but_empty_types() {
        let mut order = vec![0x0B, 0x11, 0x00];
        let types = [0x0B, 0x0B, 0x00];
        assert_eq!(logical_insert_position(&mut order, &types, 0x11), 2);
        assert_eq!(logical_insert_position(&mut order, &types, 0x0B), 2);
        assert_eq!(logical_insert_position(&mut order, &types, 0x0F), 3);
        assert_eq!(order, vec![0x0B, 0x11, 0x00, 0x0F]);
    }

    #[test]
    fn validate_rejects_ungrouped_files() {
        let mut draft = sample_draft();
        draft.files.swap(0, 2);
        assert!(draft.validate().is_err());
    }
}
