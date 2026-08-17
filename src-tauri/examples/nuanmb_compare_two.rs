//! Compare two NUANMB files frame-0 transforms.
//! cargo run --example nuanmb_compare_two -- a.nuanmb b.nuanmb

use ssbh_data::anim_data::{AnimData, GroupType, TrackValues};
use std::collections::HashMap;
use std::env;
use std::path::Path;

fn map(anim: &AnimData) -> HashMap<String, (glam::Vec3, glam::Quat, glam::Vec3)> {
    let mut m = HashMap::new();
    for g in &anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            for t in &n.tracks {
                if let TrackValues::Transform(v) = &t.values {
                    m.insert(
                        n.name.clone(),
                        (v[0].translation, v[0].rotation, v[0].scale),
                    );
                }
            }
        }
    }
    m
}

fn main() {
    let a_path = env::args().nth(1).expect("a");
    let b_path = env::args().nth(2).expect("b");
    let a = AnimData::from_file(Path::new(&a_path)).expect("a");
    let b = AnimData::from_file(Path::new(&b_path)).expect("b");
    println!(
        "A final={} nodes~{}",
        a.final_frame_index,
        a.groups.iter().map(|g| g.nodes.len()).sum::<usize>()
    );
    println!(
        "B final={} nodes~{}",
        b.final_frame_index,
        b.groups.iter().map(|g| g.nodes.len()).sum::<usize>()
    );
    let ma = map(&a);
    let mb = map(&b);
    let mut max_dt = 0.0f32;
    let mut max_dr = 0.0f32;
    let mut diffs = 0usize;
    for (k, va) in &ma {
        match mb.get(k) {
            None => println!("missing in B: {k}"),
            Some(vb) => {
                let dt = (va.0 - vb.0).length();
                let dr = 1.0 - va.1.dot(vb.1).abs();
                max_dt = max_dt.max(dt);
                max_dr = max_dr.max(dr);
                if dt > 1e-4 || dr > 1e-4 {
                    diffs += 1;
                    println!("diff {k}: dT={dt:.6} dR={dr:.6}");
                }
            }
        }
    }
    for k in mb.keys() {
        if !ma.contains_key(k) {
            println!("missing in A: {k}");
        }
    }
    println!("diff_count={diffs} max_dT={max_dt:.6} max_dR_metric={max_dr:.6}");
}
