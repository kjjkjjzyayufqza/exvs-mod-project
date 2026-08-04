//! Measure per-bone frame variance; emit stock-layout constant pose (0x4003 holds).
use ssbh_data::anim_data::{AnimData, GroupType, TrackValues};
use std::env;
use std::path::Path;

fn leaf(name: &str) -> String {
    let p = name.rsplit('|').next().unwrap_or(name);
    p.rsplit(':').next().unwrap_or(p).to_string()
}

fn main() {
    let path = env::args().nth(1).expect("nuanmb");
    let anim = AnimData::from_file(Path::new(&path)).expect("parse");
    println!(
        "final_frame={} groups={}",
        anim.final_frame_index,
        anim.groups.len()
    );
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
                let mut max_dt = 0.0f32;
                let mut max_dr = 0.0f32;
                let a0 = vals[0];
                for v in vals.iter().skip(1) {
                    max_dt = max_dt.max((v.translation - a0.translation).length());
                    max_dr = max_dr.max(1.0 - v.rotation.dot(a0.rotation).abs());
                }
                let flag = if max_dt < 1e-4 && max_dr < 1e-4 {
                    "STATIC"
                } else {
                    "MOVING"
                };
                println!(
                    "{flag} {} frames={} max_dT={:.6} max_dR={:.6} T0=({:.3},{:.3},{:.3})",
                    leaf(&n.name),
                    vals.len(),
                    max_dt,
                    max_dr,
                    a0.translation.x,
                    a0.translation.y,
                    a0.translation.z
                );
            }
        }
    }
}
