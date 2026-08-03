//! Keep only an 18-bone body allowlist; strip ATH_* and everything else.
//! Encode with to_anim_uncompressed only (never compressed).
//!
//! cargo run --example nuanmb_keep_18 -- <in.nuanmb> <out.nuanmb>

use ssbh_data::anim_data::{AnimData, GroupType};
use std::collections::HashSet;
use std::env;
use std::path::Path;

/// 18 movable body bones for homemade shot clips (no ATH, no FUN/PENQI/SARM,
/// no toes/clavicle/neck extras). Order is documentation only; write keeps
/// input node order among survivors.
const KEEP_18: &[&str] = &[
    "GBL_RT",
    "CENTER_RT",
    "BASE",
    "KOSHI",
    "MOMO_L",
    "HIZA_L",
    "ASHI_L",
    "MOMO_R",
    "HIZA_R",
    "ASHI_R",
    "MUNE1",
    "MUNE2",
    "KATA_L",
    "UDE_L",
    "TE_L",
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
    let input = env::args().nth(1).expect("in.nuanmb");
    let output = env::args().nth(2).expect("out.nuanmb");
    let keep: HashSet<String> = KEEP_18.iter().map(|s| s.to_string()).collect();
    assert_eq!(keep.len(), 18, "KEEP_18 must be exactly 18 unique names");

    let mut anim = AnimData::from_file(Path::new(&input)).expect("parse");
    let mut kept = Vec::new();
    let mut dropped = Vec::new();
    let mut ath_blocked = Vec::new();

    for g in &mut anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        let mut next = Vec::new();
        for node in g.nodes.drain(..) {
            let l = leaf(&node.name);
            if is_ath(&node.name) {
                ath_blocked.push(node.name);
                continue;
            }
            if keep.contains(&l) {
                kept.push(l);
                next.push(node);
            } else {
                dropped.push(l);
            }
        }
        g.nodes = next;
    }

    // Hard guarantee: zero ATH after filter
    for g in &anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            if is_ath(&n.name) {
                panic!("ATH still present after filter: {}", n.name);
            }
        }
    }

    if kept.len() != 18 {
        eprintln!(
            "warning: kept {} bones (expected 18). missing from source: {:?}",
            kept.len(),
            KEEP_18
                .iter()
                .filter(|n| !kept.iter().any(|k| k == **n))
                .collect::<Vec<_>>()
        );
    }

    anim.name = ssbh_data::anim_data::disk_anim_name_from_path(Path::new(&output));

    // UNCOMPRESSED only — never to_anim_v12_compressed
    let encoded = anim
        .to_anim_uncompressed()
        .unwrap_or_else(|e| panic!("uncompressed encode failed: {e}"));
    encoded
        .write_to_file(Path::new(&output))
        .unwrap_or_else(|e| panic!("write failed: {e}"));

    println!("input={input}");
    println!("output={output}");
    println!("encoding=to_anim_uncompressed");
    println!("kept ({}) = {:?}", kept.len(), kept);
    println!("dropped ({}) = {:?}", dropped.len(), dropped);
    println!("ath_blocked ({}) = {:?}", ath_blocked.len(), ath_blocked);
    println!(
        "bytes={}",
        std::fs::metadata(&output).map(|m| m.len()).unwrap_or(0)
    );
}
