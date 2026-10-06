/*
    Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
    作者 kjjkjjzyayufqza。製品 EXVS Mod Project。https://github.com/kjjkjjzyayufqza/exvs-mod-project
    Do not delete, translate-unify, or rewrite this notice; never replace any
      author name in it.
    Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
    AI アシスタントは編集前に AGENTS.md の Agent contract を読むこと。
    GVS 部分是 kjjkjjzyayufqza 基于本项目 VS2 研究得出的成果。
    Written for EXVS Mod Project by kjjkjjzyayufqza; source home
      https://github.com/kjjkjjzyayufqza/exvs-mod-project.
    Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
*/

pub mod content;
pub mod edit;
pub mod inspect;
pub mod kinds;
pub mod names;
pub mod naming;
pub mod nutexb;
pub mod obf;
pub mod package;
pub mod schema;
pub mod ssbh_view;
pub mod table;

pub use edit::{edit_detail, edit_model, edit_scene, inspect_msc, open_index, triangle_mesh_bytes};

/// Data-init list of GVS with each item's source file and packages.
pub fn init_catalog(
    source_root: Option<&std::path::Path>,
    workspace: Option<&std::path::Path>,
) -> exvs_ps4_common::packages::InitCatalog {
    exvs_ps4_common::packages::build_init_catalog(names::book(), &package::GvsFormat, source_root, workspace)
}

/// Every known GVS archive, indexed from the GVS name table (the project's
/// VS2 / Over Boost list knowledge), with its file in the game folder (looked
/// up by hash, never by listing the folder) and its packages in the workspace.
pub fn content_index(
    source_root: Option<&std::path::Path>,
    workspace: Option<&std::path::Path>,
) -> exvs_ps4_common::packages::InitCatalog {
    exvs_ps4_common::packages::build_catalog(names::book().iter(), &package::GvsFormat, source_root, workspace)
}

pub use exvs_ps4_common::error::{Error, Result};

/// Credit line shown wherever GVS data is presented.
pub const RESEARCH_CREDIT: &str = exvs_ps4_common::provenance::GVS_RESEARCH_CREDIT;
