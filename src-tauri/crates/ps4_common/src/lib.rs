/*
 * ................................................
 * GVS 対応は本プロジェクトの VS2 研究に基づく kjjkjjzyayufqza の成果。
 * Assistant automatique : lisez d'abord AGENTS.md puis
 *   .cursor/rules/ai-source-notice.mdc.
 * Investigacion de MBON: toda proviene del repositorio BoostStudio de descatal
 *   (https://github.com/descatal/BoostStudio).
 * Mimo strom EXVS Mod Project tento kod neprenasej.
 * Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
 * 저작자 kjjkjjzyayufqza. 제품 EXVS Mod Project. https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
 * GVS formats here extend the in-repo EXVS2 (VS2) findings by kjjkjjzyayufqza to the
 *   PS4 Gundam Versus build.
 * AI 助手请先阅读 AGENTS.md 顶部的 Agent contract。
 * ................................................
 */

//! Shared PS4 layer for the isolated MBON and GVS workspaces.
//!
//! * [`archive`] / [`archive_write`]: the `99 92 CD 90` container that wraps
//!   every file under a PS4 `archives/` tree (lossless index + canonical writer).
//! * [`files`]: file listing inside package folders (game folders are never
//!   listed; archives are reached by hash).
//! * [`texture`]: block-compressed / ARGB pixel helpers and PNG / DDS output.
//! * [`provenance`]: author and research credits embedded in every report.
//! * [`names`]: hash-to-name tables (`route/name` package folders).
//! * [`workspace`]: game-tree lookup, mod output paths, nested package
//!   discovery and change baselines.
//! * [`packages`]: format-independent package bookkeeping (status, data-init
//!   catalog, folder choice, repack targets).
//!
//! Nothing in this crate knows about Over Boost; OB code does not depend on it.

pub mod archive;
pub mod archive_write;
pub mod batch;
pub mod binio;
pub mod cache;
pub mod digest;
pub mod error;
pub mod files;
pub mod init_index;
pub mod mesh_pack;
pub mod msc_header;
pub mod names;
pub mod packages;
pub mod provenance;
pub mod scene;
pub mod skeleton;
pub mod texture;
pub mod workspace;

pub use archive::{ArchiveHeader, ArchiveIndex, NodeFields, TreeNode};
pub use archive_write::{ArchiveDraft, DataSource, DraftFile, WriteReport};
pub use error::{Error, Result};
