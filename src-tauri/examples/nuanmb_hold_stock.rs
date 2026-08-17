//! Build stock-layout constant hold pose from frame 0 only (uncompressed).
//! cargo run --example nuanmb_hold_stock -- <in.nuanmb> <out.nuanmb>

use glam::{Quat, Vec3};
use ssbh_data::anim_data::{AnimData, GroupType, TrackValues};
use ssbh_lib::formats::anim::{Anim, Property, TrackTypeV1, TrackV1};
use ssbh_lib::SsbhByteBuffer;
use std::collections::HashSet;
use std::env;
use std::path::Path;

const KEEP_24: &[&str] = &[
    "ASHI_L",
    "ASHI_R",
    "ATAMA",
    "BASE",
    "CENTER_RT",
    "GBL_RT",
    "HIZA_L",
    "HIZA_R",
    "KATA_L",
    "KATA_R",
    "KOSHI",
    "KUBI",
    "MOMO_L",
    "MOMO_R",
    "MUNE1",
    "MUNE2",
    "SAKOTSU_L",
    "SAKOTSU_R",
    "TE_L",
    "TE_R",
    "TSUMASAKI_L",
    "TSUMASAKI_R",
    "UDE_L",
    "UDE_R",
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

fn encode_const_vec3(v: Vec3) -> Vec<u8> {
    let mut d = Vec::new();
    d.extend_from_slice(&0x3003u32.to_le_bytes());
    d.extend_from_slice(&v.x.to_le_bytes());
    d.extend_from_slice(&v.y.to_le_bytes());
    d.extend_from_slice(&v.z.to_le_bytes());
    d
}

fn encode_const_quat(q: Quat) -> Vec<u8> {
    let q = q.normalize();
    let mut d = Vec::new();
    d.extend_from_slice(&0x4003u32.to_le_bytes());
    d.extend_from_slice(&q.x.to_le_bytes());
    d.extend_from_slice(&q.y.to_le_bytes());
    d.extend_from_slice(&q.z.to_le_bytes());
    d.extend_from_slice(&q.w.to_le_bytes());
    d
}

fn encode_u16_1013(v: u16) -> Vec<u8> {
    let mut d = Vec::new();
    d.extend_from_slice(&0x1013u32.to_le_bytes());
    d.extend_from_slice(&v.to_le_bytes());
    d
}

fn push(props: &mut Vec<Property>, bufs: &mut Vec<SsbhByteBuffer>, name: &str, data: Vec<u8>) {
    bufs.push(SsbhByteBuffer { elements: data });
    props.push(Property {
        name: name.into(),
        buffer_index: (bufs.len() - 1) as u64,
    });
}

fn main() {
    let input = env::args().nth(1).expect("in");
    let output = env::args().nth(2).expect("out");
    let keep: HashSet<_> = KEEP_24.iter().map(|s| s.to_string()).collect();
    let anim = AnimData::from_file(Path::new(&input)).expect("parse");

    // frame 0 pose only
    let mut pose = Vec::new();
    for g in &anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            if is_ath(&n.name) {
                continue;
            }
            let l = leaf(&n.name);
            if !keep.contains(&l) {
                continue;
            }
            for t in &n.tracks {
                if let TrackValues::Transform(v) = &t.values {
                    if !v.is_empty() {
                        pose.push((n.name.clone(), v[0]));
                    }
                }
            }
        }
    }
    pose.sort_by(|a, b| leaf(&a.0).cmp(&leaf(&b.0)));

    let mut tracks = Vec::new();
    let mut buffers = Vec::new();
    for (name, tr) in &pose {
        let l = leaf(name);
        let mut props = Vec::new();
        // Stock hold layout: CompensateScale, Rotate, [Scale], [Translate], Visibility
        push(
            &mut props,
            &mut buffers,
            "CompensateScale",
            encode_u16_1013(0),
        );
        push(
            &mut props,
            &mut buffers,
            "Rotate",
            encode_const_quat(tr.rotation),
        );
        if is_rootish(name) {
            if l == "GBL_RT" {
                push(
                    &mut props,
                    &mut buffers,
                    "Scale",
                    encode_const_vec3(Vec3::ONE),
                );
            }
            // Roots keep authored translation (BASE height etc.)
            push(
                &mut props,
                &mut buffers,
                "Translate",
                encode_const_vec3(tr.translation),
            );
        }
        // limbs: no Translate → game uses skeleton rest bone length
        push(
            &mut props,
            &mut buffers,
            "Visibility",
            encode_u16_1013(0x7FFF),
        );

        tracks.push(TrackV1 {
            name: name.as_str().into(),
            track_type: TrackTypeV1::Transform,
            properties: props.into(),
        });
        println!(
            "hold {} R=({:.4},{:.4},{:.4},{:.4}) T=({:.3},{:.3},{:.3}) root_T={}",
            l,
            tr.rotation.x,
            tr.rotation.y,
            tr.rotation.z,
            tr.rotation.w,
            tr.translation.x,
            tr.translation.y,
            tr.translation.z,
            is_rootish(name)
        );
    }

    // Hold for 60 frames @ 60fps → 1 second (end_frame=60)
    let end_frame = 60.0f32;
    let disk_name = ssbh_data::anim_data::disk_anim_name_from_path(Path::new(&output))
        .unwrap_or_else(|| "animation".into());
    let out = Anim::V12 {
        name: disk_name.as_str().into(),
        unk1: end_frame / 60.0,
        final_frame_index: 60.0,
        unk2: end_frame,
        unk3: 0.0,
        tracks: tracks.into(),
        buffers: buffers.into(),
    };
    out.write_to_file(Path::new(&output)).expect("write");
    println!(
        "wrote {} bones={} bytes={} (constant 0x4003 holds, no residual)",
        output,
        pose.len(),
        std::fs::metadata(&output).map(|m| m.len()).unwrap_or(0)
    );
}
