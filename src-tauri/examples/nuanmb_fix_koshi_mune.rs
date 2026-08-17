//! Minimal fix: zero KOSHI + MUNE1 translation only (keep R/S and all other bones).
//! cargo run --example nuanmb_fix_koshi_mune -- <in.nuanmb> <out.nuanmb>

use ssbh_data::anim_data::{AnimData, GroupType, TrackValues};
use std::env;
use std::path::Path;

fn leaf(name: &str) -> &str {
    let p = name.rsplit('|').next().unwrap_or(name);
    p.rsplit(':').next().unwrap_or(p)
}

fn main() {
    let mut args = env::args().skip(1);
    let input = args.next().expect("in");
    let output = args.next().expect("out");
    let mut anim = AnimData::from_file(Path::new(&input)).expect("parse");

    let mut fixed_nodes = Vec::new();
    for g in &mut anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &mut g.nodes {
            let l = leaf(&n.name);
            if l != "KOSHI" && l != "MUNE1" {
                continue;
            }
            for t in &mut n.tracks {
                if let TrackValues::Transform(vals) = &mut t.values {
                    let mut max_before = 0.0f32;
                    for v in vals.iter() {
                        max_before = max_before.max(v.translation.length());
                    }
                    for v in vals.iter_mut() {
                        v.translation = glam::Vec3::ZERO;
                    }
                    fixed_nodes.push(format!(
                        "{l} max|T|before={max_before:.4} frames={}",
                        vals.len()
                    ));
                }
            }
        }
    }

    anim.name = ssbh_data::anim_data::disk_anim_name_from_path(Path::new(&output));
    let encoded = anim.to_anim_uncompressed().expect("encode");
    encoded.write_to_file(Path::new(&output)).expect("write");
    println!("wrote {output}");
    for line in fixed_nodes {
        println!("fixed {line}");
    }
}
