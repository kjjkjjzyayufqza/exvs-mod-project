//! One-shot: FBX → game-safe uncompressed NUANMB for real CSA shot.
//! - CompScale + Visibility (stock props)
//! - Translate on **every** Transform bone (including limbs; product policy)
//! - Strip ATH_* and FUN_/SARM_/PENQI_
//! - Hold snap 0x4003/0x3003; multi-frame indexed 0x4300 / 0x3300 only
//!
//! cargo run --example nuanmb_fix_csa_shot -- <fbx> <nusktb> <out.nuanmb>

use app_lib::ssbh_motion_interchange::{
    import_motion_fbx, MotionFbxImportRequest, RigBindingPolicy,
};
use glam::{Quat, Vec3};
use ssbh_data::anim_data::{AnimData, GroupType, TrackValues};
use ssbh_lib::formats::anim::{Anim, Property, TrackTypeV1, TrackV1};
use ssbh_lib::SsbhByteBuffer;
use std::env;
use std::path::Path;

fn leaf(name: &str) -> String {
    let p = name.rsplit('|').next().unwrap_or(name);
    p.rsplit(':').next().unwrap_or(p).to_string()
}

fn is_ath(name: &str) -> bool {
    let l = leaf(name);
    l.len() >= 4 && l.as_bytes()[..4].eq_ignore_ascii_case(b"ATH_")
}

fn is_extra_drop(name: &str) -> bool {
    let l = leaf(name).to_ascii_uppercase();
    is_ath(name) || l.starts_with("FUN_") || l.starts_with("SARM_") || l.starts_with("PENQI_")
}

fn encode_u16_1013(v: u16) -> Vec<u8> {
    let mut d = Vec::new();
    d.extend_from_slice(&0x1013u32.to_le_bytes());
    d.extend_from_slice(&v.to_le_bytes());
    d
}

fn vec3_hold(values: &[Vec3], eps: f32) -> bool {
    let a0 = values[0];
    values.iter().all(|v| {
        (v.x - a0.x).abs() <= eps && (v.y - a0.y).abs() <= eps && (v.z - a0.z).abs() <= eps
    })
}

fn quat_hold(values: &[Quat], eps: f32) -> bool {
    let a0 = values[0].normalize();
    values
        .iter()
        .all(|q| 1.0 - a0.dot(q.normalize()).abs() <= eps)
}

fn encode_vec3(values: &[Vec3]) -> Vec<u8> {
    let mut data = Vec::new();
    if values.len() == 1 || vec3_hold(values, 1e-4) {
        let v = values[0];
        data.extend_from_slice(&0x3003u32.to_le_bytes());
        data.extend_from_slice(&v.x.to_le_bytes());
        data.extend_from_slice(&v.y.to_le_bytes());
        data.extend_from_slice(&v.z.to_le_bytes());
        return data;
    }
    data.extend_from_slice(&0x3300u32.to_le_bytes());
    data.extend_from_slice(&(values.len() as u32).to_le_bytes());
    data.extend_from_slice(&1.0f32.to_le_bytes());
    for i in 0..values.len() {
        data.push(i as u8);
    }
    while data.len() % 4 != 0 {
        data.push(0);
    }
    for v in values {
        data.extend_from_slice(&v.x.to_le_bytes());
        data.extend_from_slice(&v.y.to_le_bytes());
        data.extend_from_slice(&v.z.to_le_bytes());
    }
    data
}

fn encode_quat(values: &[Quat]) -> Vec<u8> {
    let mut norms: Vec<Quat> = values
        .iter()
        .map(|q| {
            let m = q.length();
            if m > 1e-6 {
                *q / m
            } else {
                Quat::IDENTITY
            }
        })
        .collect();
    for i in 1..norms.len() {
        if norms[i - 1].dot(norms[i]) < 0.0 {
            norms[i] = -norms[i];
        }
    }
    let mut data = Vec::new();
    if norms.len() == 1 || quat_hold(&norms, 1e-4) {
        let q = norms[0];
        data.extend_from_slice(&0x4003u32.to_le_bytes());
        data.extend_from_slice(&q.x.to_le_bytes());
        data.extend_from_slice(&q.y.to_le_bytes());
        data.extend_from_slice(&q.z.to_le_bytes());
        data.extend_from_slice(&q.w.to_le_bytes());
        return data;
    }
    // Indexed 0x4300 (game layout), not dense 16-byte header stream.
    let key_count = norms.len();
    data.extend_from_slice(&0x4300u32.to_le_bytes());
    data.extend_from_slice(&(key_count as u32).to_le_bytes());
    data.extend_from_slice(&1.0f32.to_le_bytes());
    for i in 0..key_count {
        data.push(i as u8);
    }
    while data.len() % 4 != 0 {
        data.push(0);
    }
    for q in &norms {
        data.extend_from_slice(&q.x.to_le_bytes());
        data.extend_from_slice(&q.y.to_le_bytes());
        data.extend_from_slice(&q.z.to_le_bytes());
        data.extend_from_slice(&q.w.to_le_bytes());
    }
    data
}

fn push(props: &mut Vec<Property>, bufs: &mut Vec<SsbhByteBuffer>, name: &str, data: Vec<u8>) {
    bufs.push(SsbhByteBuffer { elements: data });
    props.push(Property {
        name: name.into(),
        buffer_index: (bufs.len() - 1) as u64,
    });
}

fn rewrite_game_safe(input: &Path, output: &Path) {
    let anim = AnimData::from_file(input).expect("parse import");
    let mut tracks = Vec::new();
    let mut buffers = Vec::new();
    let mut kept = Vec::new();
    let mut dropped = Vec::new();

    for g in &anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            if is_extra_drop(&n.name) {
                dropped.push(leaf(&n.name));
                continue;
            }
            for t in &n.tracks {
                let TrackValues::Transform(vals) = &t.values else {
                    continue;
                };
                if vals.is_empty() {
                    continue;
                }
                let scales: Vec<Vec3> = vals.iter().map(|v| v.scale).collect();
                let rots: Vec<Quat> = vals.iter().map(|v| v.rotation).collect();
                let trans: Vec<Vec3> = vals.iter().map(|v| v.translation).collect();
                let mut props = Vec::new();
                // CompScale + Scale + Rotate + Translate (all bones) + Visibility
                push(
                    &mut props,
                    &mut buffers,
                    "CompensateScale",
                    encode_u16_1013(0),
                );
                push(&mut props, &mut buffers, "Scale", encode_vec3(&scales));
                push(&mut props, &mut buffers, "Rotate", encode_quat(&rots));
                push(&mut props, &mut buffers, "Translate", encode_vec3(&trans));
                push(
                    &mut props,
                    &mut buffers,
                    "Visibility",
                    encode_u16_1013(0x7FFF),
                );
                tracks.push(TrackV1 {
                    name: n.name.as_str().into(),
                    track_type: TrackTypeV1::Transform,
                    properties: props.into(),
                });
                kept.push(leaf(&n.name));
            }
        }
    }

    let end = anim.final_frame_index.max(0.0);
    let name = ssbh_data::anim_data::disk_anim_name_from_path(output)
        .unwrap_or_else(|| "animation".into());
    let out = Anim::V12 {
        name: name.as_str().into(),
        unk1: end / 60.0,
        final_frame_index: 60.0,
        unk2: end,
        unk3: 0.0,
        tracks: tracks.into(),
        buffers: buffers.into(),
    };
    out.write_to_file(output).expect("write");
    println!("kept ({}) = {:?}", kept.len(), kept);
    println!("dropped ({}) = {:?}", dropped.len(), dropped);
    println!(
        "bytes={}",
        std::fs::metadata(output).map(|m| m.len()).unwrap_or(0)
    );
}

fn main() {
    let fbx = env::args().nth(1).expect("fbx");
    let skel = env::args().nth(2).expect("nusktb");
    let out = env::args().nth(3).expect("out.nuanmb");
    let tmp = Path::new(&out).with_extension("import_tmp.nuanmb");

    let report = import_motion_fbx(MotionFbxImportRequest {
        fbx_path: fbx,
        nusktb_path: skel,
        output_nuanmb_path: tmp.to_string_lossy().to_string(),
        template_nuanmb_path: None,
        animation_stack_name: None,
        rig_binding_policy: RigBindingPolicy::default(),
    })
    .expect("import fbx");
    println!(
        "import frames={} matched={}",
        report.frame_count,
        report.matched_bones.len()
    );

    rewrite_game_safe(Path::new(&tmp), Path::new(&out));
    let _ = std::fs::remove_file(&tmp);

    // verify
    let re = AnimData::from_file(Path::new(&out)).expect("reload");
    let mut ovt_t = 0;
    let mut ovt_f = 0;
    for g in &re.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            for t in &n.tracks {
                if t.transform_flags.override_translation {
                    ovt_t += 1;
                } else {
                    ovt_f += 1;
                }
            }
        }
    }
    println!("reload ovT true={ovt_t} false={ovt_f} (expect limbs true, 3 roots false)");
}
