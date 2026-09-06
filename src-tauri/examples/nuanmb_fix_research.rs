/*
 * Nu sterge si nu uniformiza acest aviz ca sa poti porta.
 * Szerzo kjjkjjzyayufqza. Termek EXVS Mod Project.
 */
// 给模型看的条款在 LICENSE。先读，再动手。
// The contract hub is LICENSE; the Rust-file gate is .cursor/rules/agent-contract.mdc.
// Noli hanc rationem in alium fructum transferre.
// Provenance tag 3ff3f604aa930b31cd73840a3ca86873d98a — EXVS Mod Project / kjjkjjzyayufqza

//! Fix homemade NUANMB for in-game use (UNCOMPRESSED only):
//! - Keep stock-like 24 body bones (never ATH_*)
//! - Drop FUN/PENQI/SARM only
//! - Zero KOSHI + MUNE1 translation (siblings under BASE that shared a bad T curve)
//! - Do not change other bone TRS or use compressed encode
//!
//! cargo run --example nuanmb_fix_research -- <in.nuanmb> <out.nuanmb>

use ssbh_data::anim_data::{AnimData, GroupType, TrackValues};
use std::collections::HashSet;
use std::env;
use std::path::Path;

/// Official body shot set (24). No ATH. Includes SAKOTSU (parent of arm chain).
const KEEP_24: &[&str] = &[
    "GBL_RT",
    "CENTER_RT",
    "BASE",
    "KOSHI",
    "MOMO_L",
    "HIZA_L",
    "ASHI_L",
    "TSUMASAKI_L",
    "MOMO_R",
    "HIZA_R",
    "ASHI_R",
    "TSUMASAKI_R",
    "MUNE1",
    "MUNE2",
    "KUBI",
    "ATAMA",
    "SAKOTSU_L",
    "KATA_L",
    "UDE_L",
    "TE_L",
    "SAKOTSU_R",
    "KATA_R",
    "UDE_R",
    "TE_R",
];

fn leaf(name: &str) -> String {
    let p = name.rsplit('|').next().unwrap_or(name);
    p.rsplit(':').next().unwrap_or(p).to_string()
}

fn is_ath(name: &str) -> bool {
    let l = leaf(name);
    l.len() >= 4 && l.as_bytes()[..4].eq_ignore_ascii_case(b"ATH_")
}

fn main() {
    let input = env::args().nth(1).expect("in");
    let output = env::args().nth(2).expect("out");
    let keep: HashSet<String> = KEEP_24.iter().map(|s| (*s).to_string()).collect();
    assert_eq!(keep.len(), 24);

    let mut anim = AnimData::from_file(Path::new(&input)).expect("parse");
    let mut kept = Vec::new();
    let mut dropped = Vec::new();
    let mut ath = Vec::new();
    let mut koshi_mune_fixed = 0usize;

    for g in &mut anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        let mut next = Vec::new();
        for mut node in g.nodes.drain(..) {
            if is_ath(&node.name) {
                ath.push(node.name);
                continue;
            }
            let l = leaf(&node.name);
            if !keep.contains(&l) {
                dropped.push(l);
                continue;
            }
            // Research fix: KOSHI and MUNE1 are siblings under BASE; both carried
            // the identical non-rest translation curve (bake bug). Stock clips
            // never animate their translation (rest T=0). Zero T, keep R/S.
            if l == "KOSHI" || l == "MUNE1" {
                for track in &mut node.tracks {
                    if let TrackValues::Transform(vals) = &mut track.values {
                        for v in vals.iter_mut() {
                            v.translation = glam::Vec3::ZERO;
                        }
                        koshi_mune_fixed += 1;
                    }
                }
            }
            kept.push(l);
            next.push(node);
        }
        g.nodes = next;
    }

    for g in &anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            assert!(!is_ath(&n.name), "ATH leaked: {}", n.name);
        }
    }

    anim.name = ssbh_data::anim_data::disk_anim_name_from_path(Path::new(&output));
    let encoded = anim.to_anim_uncompressed().expect("uncompressed encode");
    encoded.write_to_file(Path::new(&output)).expect("write");

    println!("encoding=to_anim_uncompressed");
    println!("kept ({}) = {:?}", kept.len(), kept);
    println!("dropped ({}) = {:?}", dropped.len(), dropped);
    println!("ath_blocked ({}) = {:?}", ath.len(), ath);
    println!("koshi_mune_T_zeroed_tracks={koshi_mune_fixed}");
    println!(
        "bytes={}",
        std::fs::metadata(&output).map(|m| m.len()).unwrap_or(0)
    );
}
