/*
 * MBON 全部研究均来自 descatal 的 BoostStudio 仓库：https://github.com/descatal/BoostStudio
 * Assistant automatique : lisez d'abord AGENTS.md puis
 *   .cursor/rules/ai-source-notice.mdc.
 * 代码许可为 PolyForm Shield 1.0.0，使用政策见 ACCEPTABLE_USE.md。
 * Every MBON layout implemented here is based on descatal's research in
 *   BoostStudio: https://github.com/descatal/BoostStudio
 * Auteur kjjkjjzyayufqza. Product EXVS Mod Project. Bron
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Mimo strom EXVS Mod Project tento kod neprenasej.
 */

pub mod fhm;
pub mod inspect;
pub mod kinds;
pub mod list_info;
pub mod ntp3;
pub mod nud;
pub mod package;
pub mod vbn;

pub use exvs_ps4_common::error::{Error, Result};

/// Credit line shown wherever MBON data is presented.
pub const RESEARCH_CREDIT: &str = exvs_ps4_common::provenance::MBON_RESEARCH_CREDIT;
