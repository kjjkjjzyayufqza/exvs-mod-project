//! Insert a HUD row for cueHash 0x6D53718D (COLORS_Flow).
//!
//! Missing this row makes `BgmList_GetTitleWithNoteByCueHash` return NULL and
//! the battle jingle AVs at `sub_1401CA440` (`rva=0x1CA4A1`).
//!
//!   cargo run --manifest-path src-tauri/Cargo.toml --example add_bgm_list_colors_flow

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use app_lib::format::bgm_list::{
    build_sorted_bytes, derive_entry, donor_source_group, parse_bytes, CMD_CUE_HASH, CMD_MUSIC_ID,
    BGM_LIST_COMMAND_POOL,
};
use app_lib::format::list_command_pool::list_data_to_json;

const CUE_HASH: u32 = 0x6D53_718D;
const TITLE: &str = "COLORS Flow";
const TITLE_WITH_NOTE: &str = "\u{266A}COLORS Flow";
const LIST_PATH: &str = r"E:\XB\mod\012list\bgm_list\bgm_list.bin";

fn main() {
    let path = Path::new(LIST_PATH);
    let bytes = fs::read(path).expect("read bgm_list.bin");
    let mut data = parse_bytes(&bytes).expect("parse bgm_list");
    if data
        .entries
        .iter()
        .any(|e| e.commands.get(&CMD_CUE_HASH) == Some(&CUE_HASH))
    {
        println!("cueHash 0x{CUE_HASH:08X} already in {}", path.display());
        return;
    }

    let occupied_ids: HashSet<u32> = data.entries.iter().map(|e| e.entry_id).collect();
    let occupied_music: HashSet<u32> = data
        .entries
        .iter()
        .filter_map(|e| e.commands.get(&CMD_MUSIC_ID).copied())
        .collect();
    let source = donor_source_group(&data.entries, None);
    let entry = derive_entry(
        None,
        None,
        CUE_HASH,
        source,
        TITLE,
        TITLE_WITH_NOTE,
        &occupied_ids,
        &occupied_music,
    )
    .expect("derive COLORS_Flow HUD row");
    println!(
        "add record_id=0x{:08X} musicId={} sourceGroup=0x{source:08X}",
        entry.entry_id,
        entry.commands.get(&CMD_MUSIC_ID).copied().unwrap_or(0)
    );
    data.entries.push(entry);
    let json = list_data_to_json(&data, BGM_LIST_COMMAND_POOL).expect("json");
    let out = build_sorted_bytes(&json).expect("build");
    let backup = path.with_extension("bin.bak_before_colors_flow");
    if !backup.exists() {
        fs::copy(path, &backup).expect("backup");
        println!("backup {}", backup.display());
    }
    fs::write(path, &out).expect("write");
    let re = parse_bytes(&out).expect("reparse");
    let found = re
        .entries
        .iter()
        .any(|e| e.commands.get(&CMD_CUE_HASH) == Some(&CUE_HASH));
    println!(
        "wrote {} bytes={} rows={} has_cueHash={}",
        path.display(),
        out.len(),
        re.entries.len(),
        found
    );
}
