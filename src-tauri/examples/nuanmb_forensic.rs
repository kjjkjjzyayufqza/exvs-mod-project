//! Deep forensic: homemade vs stock nuanmb + skel + optional hlpb.
//! cargo run --example nuanmb_forensic -- <homemade.nuanmb> <stock.nuanmb> <skel.nusktb> [hlpb.nuhlpb]

use ssbh_data::anim_data::{AnimData, GroupType, TrackValues, Transform, TransformFlags};
use ssbh_data::skel_data::SkelData;
use std::collections::{HashMap, HashSet};
use std::env;
use std::path::Path;

fn leaf(name: &str) -> String {
    let p = name.rsplit('|').next().unwrap_or(name);
    p.rsplit(':').next().unwrap_or(p).to_string()
}

#[derive(Clone)]
struct TrackInfo {
    name: String,
    frames: usize,
    flags: TransformFlags,
    first: Transform,
    max_dt: f32,
    max_dr: f32,
    max_ds: f32,
}

fn collect_tracks(anim: &AnimData) -> HashMap<String, TrackInfo> {
    let mut m = HashMap::new();
    for g in &anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            for t in &n.tracks {
                let TrackValues::Transform(vals) = &t.values else {
                    continue;
                };
                if vals.is_empty() {
                    continue;
                }
                let first = vals[0];
                let mut max_dt = 0.0f32;
                let mut max_dr = 0.0f32;
                let mut max_ds = 0.0f32;
                for v in vals.iter().skip(1) {
                    max_dt = max_dt.max((v.translation - first.translation).length());
                    max_dr = max_dr.max(1.0 - v.rotation.dot(first.rotation).abs());
                    max_ds = max_ds.max((v.scale - first.scale).length());
                }
                m.insert(
                    leaf(&n.name),
                    TrackInfo {
                        name: leaf(&n.name),
                        frames: vals.len(),
                        flags: t.transform_flags,
                        first,
                        max_dt,
                        max_dr,
                        max_ds,
                    },
                );
            }
        }
    }
    m
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

fn print_anim_summary(label: &str, anim: &AnimData, tracks: &HashMap<String, TrackInfo>) {
    println!("\n======== {label} ========");
    println!(
        "version={}.{} final_frame={} groups={} transform_nodes={}",
        anim.major_version,
        anim.minor_version,
        anim.final_frame_index,
        anim.groups.len(),
        tracks.len()
    );
    let mut names: Vec<_> = tracks.keys().cloned().collect();
    names.sort();
    println!("bones: {}", names.join(", "));
    let ath: Vec<_> = names.iter().filter(|n| n.starts_with("ATH_")).cloned().collect();
    println!("ATH count={}", ath.len());
    if !ath.is_empty() {
        println!("ATH: {}", ath.join(", "));
    }
    let mut ovt_true = 0;
    let mut ovt_false = 0;
    let mut t_nonzero = 0;
    for t in tracks.values() {
        if t.flags.override_translation {
            ovt_true += 1;
        } else {
            ovt_false += 1;
        }
        if t.first.translation.length() > 1e-4 {
            t_nonzero += 1;
        }
    }
    println!("flags ovT true={ovt_true} false={ovt_false}; firstT nonzero count={t_nonzero}");
}

fn main() {
    let mut args = env::args().skip(1);
    let home_path = args.next().expect("homemade");
    let stock_path = args.next().expect("stock");
    let skel_path = args.next().expect("skel");
    let hlpb_path = args.next();

    let home = AnimData::from_file(Path::new(&home_path)).expect("home");
    let stock = AnimData::from_file(Path::new(&stock_path)).expect("stock");
    let skel = SkelData::from_file(Path::new(&skel_path)).expect("skel");
    let rests = rest_map(&skel);

    let ht = collect_tracks(&home);
    let st = collect_tracks(&stock);
    print_anim_summary("HOMEMADE", &home, &ht);
    print_anim_summary("STOCK", &stock, &st);

    // Bone set delta
    let hs: HashSet<_> = ht.keys().cloned().collect();
    let ss: HashSet<_> = st.keys().cloned().collect();
    let only_h: Vec<_> = hs.difference(&ss).cloned().collect();
    let only_s: Vec<_> = ss.difference(&hs).cloned().collect();
    println!("\n=== bone set delta ===");
    println!("only homemade: {:?}", only_h);
    println!("only stock: {:?}", only_s);

    // Per shared bone: flags + rest match + composed local
    println!("\n=== shared bones: flags / rest-T delta / stock vs home first composed ===");
    let mut shared: Vec<_> = hs.intersection(&ss).cloned().collect();
    shared.sort();
    for name in &shared {
        let h = &ht[name];
        let s = &st[name];
        let rest = rests.get(name);
        let h_dt_rest = rest
            .map(|r| (h.first.translation - r.translation).length())
            .unwrap_or(-1.0);
        let s_dt_rest = rest
            .map(|r| (s.first.translation - r.translation).length())
            .unwrap_or(-1.0);
        let (hc, sc) = if let Some(r) = rest {
            (compose(r, &h.first, &h.flags), compose(r, &s.first, &s.flags))
        } else {
            (h.first, s.first)
        };
        let d_comp_t = (hc.translation - sc.translation).length();
        let d_comp_r = 1.0 - hc.rotation.dot(sc.rotation).abs();
        println!(
            "{name}: home(ovT={},ovR={},ovS={}) stock(ovT={},ovR={},ovS={}) | homeT-rest={h_dt_rest:.4} stockT-rest={s_dt_rest:.4} | home firstT=({:.3},{:.3},{:.3}) stock firstT=({:.3},{:.3},{:.3}) | composed dT={d_comp_t:.4} dR={d_comp_r:.4} | home motion dT={:.3} dR={:.3} stock motion dT={:.3} dR={:.3}",
            h.flags.override_translation,
            h.flags.override_rotation,
            h.flags.override_scale,
            s.flags.override_translation,
            s.flags.override_rotation,
            s.flags.override_scale,
            h.first.translation.x,
            h.first.translation.y,
            h.first.translation.z,
            s.first.translation.x,
            s.first.translation.y,
            s.first.translation.z,
            h.max_dt,
            h.max_dr,
            s.max_dt,
            s.max_dr,
        );
    }

    // Critical: bones where homemade applies anim T but stock uses rest
    println!("\n=== RISK: homemade ovT=false with non-rest T while stock ovT=true ===");
    for name in &shared {
        let h = &ht[name];
        let s = &st[name];
        if let Some(r) = rests.get(name) {
            let h_off = (h.first.translation - r.translation).length();
            if !h.flags.override_translation && s.flags.override_translation && h_off > 0.05 {
                println!(
                    "  {name}: homemade bakes T offset {h_off:.4} from rest; stock ignores anim T"
                );
            }
        }
    }

    // KOSHI/MUNE1 special
    println!("\n=== KOSHI / MUNE1 special ===");
    for name in ["KOSHI", "MUNE1"] {
        if let (Some(h), Some(r)) = (ht.get(name), rests.get(name)) {
            println!(
                "{name}: restT=({:.4},{:.4},{:.4}) anim0T=({:.4},{:.4},{:.4}) d={:.4} max_dT_over_clip={:.4}",
                r.translation.x,
                r.translation.y,
                r.translation.z,
                h.first.translation.x,
                h.first.translation.y,
                h.first.translation.z,
                (h.first.translation - r.translation).length(),
                h.max_dt
            );
            // print a few frame translations
            for g in &home.groups {
                if !matches!(g.group_type, GroupType::Transform) {
                    continue;
                }
                for n in &g.nodes {
                    if leaf(&n.name) != name {
                        continue;
                    }
                    if let TrackValues::Transform(vals) = &n.tracks[0].values {
                        for i in [0usize, 15, 30, 45, 60] {
                            if i < vals.len() {
                                let v = vals[i];
                                println!(
                                    "  f{i}: T=({:.4},{:.4},{:.4}) R=({:.3},{:.3},{:.3},{:.3})",
                                    v.translation.x,
                                    v.translation.y,
                                    v.translation.z,
                                    v.rotation.x,
                                    v.rotation.y,
                                    v.rotation.z,
                                    v.rotation.w
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    // Rest rotation vs anim rotation: how far from bind pose
    println!("\n=== homemade pose distance from rest rotation (|dot|) frame0 ===");
    let mut pose_dist: Vec<(String, f32)> = Vec::new();
    for (name, h) in &ht {
        if let Some(r) = rests.get(name) {
            let d = h.first.rotation.dot(r.rotation).abs();
            pose_dist.push((name.clone(), d));
        }
    }
    pose_dist.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
    for (n, d) in pose_dist.iter().take(12) {
        println!("  {n}: |dot|={d:.4}  (1=rest, 0=90deg+)");
    }

    // Sample via app public smoke if possible
    if let Some(hlpb) = hlpb_path {
        println!("\n=== HLPB path provided: {hlpb} ===");
        println!("(constraint names extracted earlier: ATH_* driven by MOMO/HIZA/KATA/SAKOTSU/KOSHI)");
        let _ = hlpb;
    }

    // Hypothesis report
    println!("\n=== HYPOTHESIS SCORECARD ===");
    let home_sparse_like = ht.values().filter(|t| t.flags.override_translation).count();
    let stock_sparse_like = st.values().filter(|t| t.flags.override_translation).count();
    println!("1) Flag style: homemade ovT-true count={home_sparse_like}/{} stock={stock_sparse_like}/{}", ht.len(), st.len());
    println!("   -> if homemade is all ovT=false dense TRS, game HLPB + rest hangoffs can still work IF T matches rest.");
    let koshi_bad = ht
        .get("KOSHI")
        .and_then(|h| rests.get("KOSHI").map(|r| (h.first.translation - r.translation).length() > 0.05))
        .unwrap_or(false);
    println!("2) KOSHI non-rest translation: {koshi_bad}");
    let mune_bad = ht
        .get("MUNE1")
        .and_then(|h| rests.get("MUNE1").map(|r| (h.first.translation - r.translation).length() > 0.05))
        .unwrap_or(false);
    println!("3) MUNE1 non-rest translation: {mune_bad}");
    let missing_sakotsu = !hs.contains("SAKOTSU_L") && ss.contains("SAKOTSU_L");
    println!("4) Missing SAKOTSU (HLPB shoulder drivers): {missing_sakotsu}");
    let missing_head = !hs.contains("KUBI") || !hs.contains("ATAMA");
    println!("5) Missing KUBI/ATAMA: {missing_head}");
    println!("6) Editor OK + game weird often means HLPB/attachments or flag/sparse channel path differ from dense full TRS.");
}
