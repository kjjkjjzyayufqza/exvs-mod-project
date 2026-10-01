/*
    ------------------------------------------------
    Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
    Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Repozytorium
      https://github.com/kjjkjjzyayufqza/exvs-mod-project
    Licensed under PolyForm Shield 1.0.0; a competing product may not reuse this file.
    Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
    Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
    MBON knowledge source: descatal / BoostStudio (https://github.com/descatal/BoostStudio),
      reimplemented in Rust for EXVS Mod Project.
    ------------------------------------------------
*/

//! Readable names for MBON archives.
//!
//! The PS4 MBON port keeps descatal's BoostStudio `ExvsCommonAssets` hashes
//! for its shared FHM packs (list info, unit cost, projectiles, camera,
//! common effects, ...) and reuses the VS2-era path hashes for the global
//! tables it shares with VS2 / Over Boost (`012list/*`, `800etcetera/*`,
//! `051mission/*`). `data/mbon_names.tsv` holds both; rows with a group are
//! the data-init list.

use std::sync::OnceLock;

use exvs_ps4_common::names::NameBook;

const TABLE: &str = include_str!("../data/mbon_names.tsv");

/// The MBON name table.
pub fn book() -> &'static NameBook {
    static BOOK: OnceLock<NameBook> = OnceLock::new();
    BOOK.get_or_init(|| NameBook::parse_tsv(TABLE).expect("data/mbon_names.tsv is well formed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_names_the_boost_studio_assets_and_the_vs2_tables() {
        let book = book();
        let list_info = book.get(0xEB3A9691).expect("BoostStudio ExvsListInfo");
        assert_eq!(list_info.relative_dir(), "common/list_info");
        assert_eq!(list_info.source, "boost-studio");
        assert_eq!(book.get(0xDFD38C70).unwrap().relative_dir(), "012list/character_list");
        let groups: std::collections::HashSet<&str> =
            book.init_items().filter_map(|item| item.group.as_deref()).collect();
        assert!(groups.contains("boost_studio") && groups.contains("lists"));
        assert!(book.init_items().all(|item| item.title.is_some()));
    }
}
