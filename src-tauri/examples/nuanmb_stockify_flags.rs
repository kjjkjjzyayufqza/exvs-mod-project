//! Convert homemade dense NUANMB → stock VS2 sparse-flag style (UNCOMPRESSED).
//!
//! Critical semantics (must match ssbh_motion / game):
//!   override_translation=true  → use skeleton rest T (anim T ignored; store 0)
//!   override_translation=false → use anim T as absolute local translation
//!
//! Writing T=0 with ovT=false collapses bone lengths (body explodes). That is the
//! trap. Stock limbs use T=0 + ovT=true.
//!
//! cargo run --example nuanmb_stockify_flags -- <in.nuanmb> <skel.nusktb> <out.nuanmb>

use ssbh_data::anim_data::{AnimData, GroupType, TrackValues, Transform, TransformFlags};
use ssbh_data::skel_data::SkelData;
use std::collections::{HashMap, HashSet};
use std::env;
use std::path::Path;

const KEEP_24: &[&str] = &[
    "GBL_RT", "CENTER_RT", "BASE", "KOSHI",
    "MOMO_L", "HIZA_L", "ASHI_L", "TSUMASAKI_L",
    "MOMO_R", "HIZA_R", "ASHI_R", "TSUMASAKI_R",
    "MUNE1", "MUNE2", "KUBI", "ATAMA",
    "SAKOTSU_L", "KATA_L", "UDE_L", "TE_L",
    "SAKOTSU_R", "KATA_R", "UDE_R", "TE_R",
];

fn leaf(name: &str) -> String {
    let p = name.rsplit('|').next().unwrap_or(name);
    p.rsplit(':').next().unwrap_or(p).to_string()
}

fn is_ath(name: &str) -> bool {
    let l = leaf(name);
    l.len() >= 4 && l.as_bytes()[..4].eq_ignore_ascii_case(b"ATH_")
}

fn is_rootish(name: &str) -> bool {
    matches!(leaf(name).as_str(), "GBL_RT" | "CENTER_RT" | "BASE")
}

fn rest_map(skel: &SkelData) -> HashMap<String, Transform> {
    let mut m = HashMap::new();
    for b in &skel.bones {
        let (scale, rotation, translation) = b.transform.to_scale_rotation_translation();
        m.insert(
            leaf(&b.name),
            Transform {
                scale,
                rotation,
                translation,
            },
        );
    }
    m
}

fn compose(rest: &Transform, anim: &Transform, f: &TransformFlags) -> Transform {
    Transform {
        translation: if f.override_translation {
            rest.translation
        } else {
            anim.translation
        },
        rotation: if f.override_rotation {
            rest.rotation
        } else {
            anim.rotation
        },
        scale: if f.override_scale {
            rest.scale
        } else {
            anim.scale
        },
    }
}

fn main() {
    let input = env::args().nth(1).expect("in.nuanmb");
    let skel_path = env::args().nth(2).expect("skel");
    let output = env::args().nth(3).expect("out.nuanmb");

    let keep: HashSet<String> = KEEP_24.iter().map(|s| (*s).to_string()).collect();
    let skel = SkelData::from_file(Path::new(&skel_path)).expect("skel");
    let rests = rest_map(&skel);

    let original = AnimData::from_file(Path::new(&input)).expect("parse");
    let mut anim = original.clone();

    let mut kept = Vec::new();
    let mut dropped = Vec::new();

    for g in &mut anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        let mut next = Vec::new();
        for mut node in g.nodes.drain(..) {
            if is_ath(&node.name) {
                dropped.push(format!("ATH:{}", leaf(&node.name)));
                continue;
            }
            let l = leaf(&node.name);
            if !keep.contains(&l) {
                dropped.push(l);
                continue;
            }
            for track in &mut node.tracks {
                let TrackValues::Transform(vals) = &mut track.values else {
                    continue;
                };
                if is_rootish(&node.name) {
                    // Match stock shot roots
                    let leaf_name = l.as_str();
                    track.transform_flags = if leaf_name == "GBL_RT" {
                        TransformFlags {
                            override_translation: false,
                            override_rotation: false,
                            override_scale: false,
                            override_compensate_scale: false,
                        }
                    } else {
                        // BASE / CENTER_RT
                        TransformFlags {
                            override_translation: false,
                            override_rotation: false,
                            override_scale: true,
                            override_compensate_scale: false,
                        }
                    };
                    // Keep authored root T/R; force unit scale
                    for v in vals.iter_mut() {
                        v.scale = glam::Vec3::ONE;
                    }
                } else {
                    // Limb / body: stock sparse style — rotation only
                    for v in vals.iter_mut() {
                        v.translation = glam::Vec3::ZERO;
                        v.scale = glam::Vec3::ONE;
                    }
                    track.transform_flags = TransformFlags {
                        override_translation: true, // MUST be true when T=0
                        override_rotation: false,
                        override_scale: true,
                        override_compensate_scale: false,
                    };
                }
            }
            kept.push(l);
            next.push(node);
        }
        g.nodes = next;
    }

    // Composition parity check vs original on shared bones / frame 0 and mid
    let mut max_dt = 0.0f32;
    let mut max_dr = 0.0f32;
    let mut worst = String::new();
    for frame_idx in [0usize, 30, 60] {
        // build maps name -> (transform, flags) at frame
        let map_at = |anim: &AnimData, fi: usize| {
            let mut m = HashMap::new();
            for g in &anim.groups {
                if !matches!(g.group_type, GroupType::Transform) {
                    continue;
                }
                for n in &g.nodes {
                    for t in &n.tracks {
                        if let TrackValues::Transform(vals) = &t.values {
                            let i = fi.min(vals.len().saturating_sub(1));
                            m.insert(leaf(&n.name), (vals[i], t.transform_flags));
                        }
                    }
                }
            }
            m
        };
        let mo = map_at(&original, frame_idx);
        let mn = map_at(&anim, frame_idx);
        for (name, (ao, fo)) in &mo {
            if !keep.contains(name) {
                continue;
            }
            let Some(rest) = rests.get(name) else {
                continue;
            };
            let Some((an, fn_)) = mn.get(name) else {
                continue;
            };
            let co = compose(rest, ao, fo);
            let cn = compose(rest, an, fn_);
            let dt = (co.translation - cn.translation).length();
            let dr = 1.0 - co.rotation.dot(cn.rotation).abs();
            if dt > max_dt {
                max_dt = dt;
                worst = format!("{name}@f{frame_idx}");
            }
            if dr > max_dr {
                max_dr = dr;
            }
        }
    }
    println!("composition parity: max_dT={max_dt:.6} ({worst}) max_dR={max_dr:.6}");
    if max_dt > 0.05 {
        println!("WARN: translation composition shifted — investigate");
    } else {
        println!("OK: limb/root composed T matches original (stock flags equivalent)");
    }

    // Hard assert: no limb has T=0 with ovT=false
    for g in &anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            if is_rootish(&n.name) {
                continue;
            }
            for t in &n.tracks {
                if let TrackValues::Transform(vals) = &t.values {
                    assert!(
                        t.transform_flags.override_translation,
                        "{} has ovT=false after stockify — would collapse in-game",
                        n.name
                    );
                    assert!(
                        vals.iter().all(|v| v.translation.length() < 1e-5),
                        "{} expected zero anim T",
                        n.name
                    );
                }
            }
        }
    }

    anim.name = ssbh_data::anim_data::disk_anim_name_from_path(Path::new(&output));
    let encoded = anim
        .to_anim_uncompressed()
        .expect("uncompressed only");
    encoded.write_to_file(Path::new(&output)).expect("write");

    // Reload and re-check flags survived encode
    let re = AnimData::from_file(Path::new(&output)).expect("reload");
    let mut ovt_limbs = 0;
    let mut limbs = 0;
    for g in &re.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            if is_rootish(&n.name) || is_ath(&n.name) {
                continue;
            }
            limbs += 1;
            for t in &n.tracks {
                if t.transform_flags.override_translation {
                    ovt_limbs += 1;
                } else {
                    println!("FAIL reload ovT=false on {}", n.name);
                }
            }
        }
    }
    println!("reload limb tracks ovT=true: {ovt_limbs}/{limbs}");
    println!("kept={} dropped={:?}", kept.len(), dropped);
    println!(
        "encoding=to_anim_uncompressed bytes={}",
        std::fs::metadata(&output).map(|m| m.len()).unwrap_or(0)
    );
}
