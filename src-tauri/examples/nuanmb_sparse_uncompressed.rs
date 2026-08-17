//! Property-sparse **uncompressed** NUANMB for EXVS2 in-game playback.
//!
//! Stock body clips always carry on each Transform track:
//!   CompensateScale (0x1013), Rotate, [Translate for roots], Visibility (0x1013)
//! and **omit** limb Translate/Scale so decoders set ovT/ovS = true.
//!
//! Dense homemade files (Scale+Rotate+Translate, no Vis/CompScale) preview fine
//! in-editor but misbehave in-game ("whole body wrong / inverted").
//!
//! This writer NEVER uses residual headers 0x3409 / 0x4409.
//!
//! cargo run --example nuanmb_sparse_uncompressed -- <in.nuanmb> <out.nuanmb> [skel.nusktb]

use glam::{Quat, Vec3};
use ssbh_data::anim_data::{AnimData, GroupType, TrackValues, Transform, TransformFlags};
use ssbh_lib::formats::anim::{Anim, Property, TrackTypeV1, TrackV1};
use ssbh_lib::SsbhByteBuffer;
use std::collections::HashSet;
use std::env;
use std::path::Path;

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

fn is_rootish(name: &str) -> bool {
    matches!(leaf(name).as_str(), "GBL_RT" | "CENTER_RT" | "BASE")
}

fn encode_vec3_uncompressed(values: &[Vec3]) -> Vec<u8> {
    assert!(!values.is_empty());
    let all_same = values.iter().all(|v| {
        (v.x - values[0].x).abs() < 1e-6
            && (v.y - values[0].y).abs() < 1e-6
            && (v.z - values[0].z).abs() < 1e-6
    });
    let mut data = Vec::new();
    if all_same || values.len() == 1 {
        data.extend_from_slice(&0x3003u32.to_le_bytes());
        data.extend_from_slice(&values[0].x.to_le_bytes());
        data.extend_from_slice(&values[0].y.to_le_bytes());
        data.extend_from_slice(&values[0].z.to_le_bytes());
    } else {
        let key_count = values.len();
        data.extend_from_slice(&0x3300u32.to_le_bytes());
        data.extend_from_slice(&(key_count as u32).to_le_bytes());
        data.extend_from_slice(&1.0f32.to_le_bytes());
        for i in 0..key_count {
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
    }
    data
}

fn encode_quat_uncompressed(values: &[Quat]) -> Vec<u8> {
    assert!(!values.is_empty());
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
    let all_same = norms.iter().all(|q| {
        (q.x - norms[0].x).abs() < 1e-6
            && (q.y - norms[0].y).abs() < 1e-6
            && (q.z - norms[0].z).abs() < 1e-6
            && (q.w - norms[0].w).abs() < 1e-6
    });
    let mut data = Vec::new();
    if all_same || norms.len() == 1 {
        data.extend_from_slice(&0x4003u32.to_le_bytes());
        data.extend_from_slice(&norms[0].x.to_le_bytes());
        data.extend_from_slice(&norms[0].y.to_le_bytes());
        data.extend_from_slice(&norms[0].z.to_le_bytes());
        data.extend_from_slice(&norms[0].w.to_le_bytes());
    } else {
        // Raw multi-frame stream — NOT residual 0x4409
        data.extend_from_slice(&0x4300u32.to_le_bytes());
        data.extend_from_slice(&(norms.len() as u32).to_le_bytes());
        data.extend_from_slice(&1.0f32.to_le_bytes());
        data.extend_from_slice(&0.0f32.to_le_bytes());
        for q in &norms {
            data.extend_from_slice(&q.x.to_le_bytes());
            data.extend_from_slice(&q.y.to_le_bytes());
            data.extend_from_slice(&q.z.to_le_bytes());
            data.extend_from_slice(&q.w.to_le_bytes());
        }
    }
    data
}

/// Stock layout: u32 header 0x1013 + u16 value (LE).
fn encode_u16_1013(value: u16) -> Vec<u8> {
    let mut data = Vec::with_capacity(6);
    data.extend_from_slice(&0x1013u32.to_le_bytes());
    data.extend_from_slice(&value.to_le_bytes());
    data
}

fn push_prop(
    properties: &mut Vec<Property>,
    buffers: &mut Vec<SsbhByteBuffer>,
    name: &str,
    data: Vec<u8>,
) {
    buffers.push(SsbhByteBuffer { elements: data });
    properties.push(Property {
        name: name.into(),
        buffer_index: (buffers.len() - 1) as u64,
    });
}

fn write_sparse_uncompressed(data: &AnimData, output: &Path) -> Result<(), String> {
    let keep: HashSet<String> = KEEP_24.iter().map(|s| (*s).to_string()).collect();
    let mut tracks = Vec::new();
    let mut buffers = Vec::new();
    let mut kept = Vec::new();
    let mut dropped = Vec::new();

    // Collect transform nodes first so we can emit stock-like alphabetical order.
    let mut nodes: Vec<(&str, &[ssbh_data::anim_data::Transform])> = Vec::new();
    for g in &data.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for node in &g.nodes {
            if is_ath(&node.name) {
                dropped.push(format!("ATH:{}", leaf(&node.name)));
                continue;
            }
            let l = leaf(&node.name);
            if !keep.contains(&l) {
                dropped.push(l);
                continue;
            }
            for track in &node.tracks {
                if let TrackValues::Transform(vals) = &track.values {
                    if !vals.is_empty() {
                        nodes.push((node.name.as_str(), vals.as_slice()));
                    }
                }
            }
        }
    }
    nodes.sort_by(|a, b| leaf(a.0).cmp(&leaf(b.0)));

    for (node_name, vals) in nodes {
        let l = leaf(node_name);
        let rotations: Vec<Quat> = vals.iter().map(|t| t.rotation).collect();
        let translations: Vec<Vec3> = vals.iter().map(|t| t.translation).collect();
        let scales: Vec<Vec3> = vals.iter().map(|t| t.scale).collect();
        let root = is_rootish(node_name);

        let mut properties = Vec::new();

        // Stock order: CompensateScale → Rotate → [Scale] → [Translate] → Visibility
        push_prop(
            &mut properties,
            &mut buffers,
            "CompensateScale",
            encode_u16_1013(0x0000),
        );

        // Always write Rotate (stock always has it, even constant).
        push_prop(
            &mut properties,
            &mut buffers,
            "Rotate",
            encode_quat_uncompressed(&rotations),
        );

        // Scale only for roots when non-identity (stock GBL_RT often has Scale=1 constant).
        if root {
            let needs_scale = scales.iter().any(|s| {
                (s.x - 1.0).abs() > 1e-6 || (s.y - 1.0).abs() > 1e-6 || (s.z - 1.0).abs() > 1e-6
            });
            // Stock GBL_RT writes Scale even when identity — match that for roots.
            if l == "GBL_RT" || needs_scale {
                let s = if needs_scale {
                    scales
                } else {
                    vec![Vec3::ONE; vals.len().max(1)]
                };
                push_prop(
                    &mut properties,
                    &mut buffers,
                    "Scale",
                    encode_vec3_uncompressed(&s),
                );
            }
        }

        // Translate: roots only (stock limbs omit → ovT=true).
        // Also omit bad KOSHI/MUNE1 shared T bake.
        if root {
            let needs_t = translations
                .iter()
                .any(|t| t.x.abs() > 1e-6 || t.y.abs() > 1e-6 || t.z.abs() > 1e-6);
            if needs_t || l == "GBL_RT" {
                let tvals = if needs_t {
                    translations
                } else {
                    vec![Vec3::ZERO; vals.len().max(1)]
                };
                push_prop(
                    &mut properties,
                    &mut buffers,
                    "Translate",
                    encode_vec3_uncompressed(&tvals),
                );
            }
        }

        push_prop(
            &mut properties,
            &mut buffers,
            "Visibility",
            encode_u16_1013(0x7FFF),
        );

        tracks.push(TrackV1 {
            name: node_name.into(),
            track_type: TrackTypeV1::Transform,
            properties: properties.into(),
        });
        kept.push(l);
    }

    let end_frame = data.final_frame_index.max(0.0);
    let name = ssbh_data::anim_data::disk_anim_name_from_path(output)
        .unwrap_or_else(|| "animation".to_string());

    let anim = Anim::V12 {
        name: name.as_str().into(),
        unk1: end_frame / 60.0,
        final_frame_index: 60.0,
        unk2: end_frame,
        unk3: 0.0,
        tracks: tracks.into(),
        buffers: buffers.into(),
    };

    anim.write_to_file(output)
        .map_err(|e| format!("write failed: {e}"))?;

    println!("encoding=sparse-uncompressed + CompensateScale/Visibility (stock layout)");
    println!("kept ({}) = {:?}", kept.len(), kept);
    println!("dropped ({}) = {:?}", dropped.len(), dropped);
    println!(
        "bytes={}",
        std::fs::metadata(output).map(|m| m.len()).unwrap_or(0)
    );
    Ok(())
}

fn compose(
    rest_t: Vec3,
    rest_r: Quat,
    rest_s: Vec3,
    anim: &Transform,
    f: &TransformFlags,
) -> (Vec3, Quat, Vec3) {
    (
        if f.override_translation {
            rest_t
        } else {
            anim.translation
        },
        if f.override_rotation {
            rest_r
        } else {
            anim.rotation
        },
        if f.override_scale { rest_s } else { anim.scale },
    )
}

fn main() {
    let input = env::args().nth(1).expect("in.nuanmb");
    let output = env::args().nth(2).expect("out.nuanmb");
    let skel_path = env::args().nth(3);

    let original = AnimData::from_file(Path::new(&input)).expect("parse input");
    write_sparse_uncompressed(&original, Path::new(&output)).expect("write");

    let re = AnimData::from_file(Path::new(&output)).expect("reload");
    let mut ovt_true = 0;
    let mut ovt_false = 0;
    for g in &re.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            for t in &n.tracks {
                if t.transform_flags.override_translation {
                    ovt_true += 1;
                } else {
                    ovt_false += 1;
                }
                println!(
                    "  {} ovT={} ovR={} ovS={}",
                    leaf(&n.name),
                    t.transform_flags.override_translation,
                    t.transform_flags.override_rotation,
                    t.transform_flags.override_scale,
                );
            }
        }
    }
    println!("reload flags: ovT true={ovt_true} false={ovt_false}");

    if let Some(skel_path) = skel_path {
        use ssbh_data::skel_data::SkelData;
        let skel = SkelData::from_file(Path::new(&skel_path)).expect("skel");
        let mut rest = std::collections::HashMap::new();
        for b in &skel.bones {
            let (s, r, t) = b.transform.to_scale_rotation_translation();
            rest.insert(leaf(&b.name), (t, r, s));
        }
        let map = |anim: &AnimData| {
            let mut m = std::collections::HashMap::new();
            for g in &anim.groups {
                if !matches!(g.group_type, GroupType::Transform) {
                    continue;
                }
                for n in &g.nodes {
                    for t in &n.tracks {
                        if let TrackValues::Transform(v) = &t.values {
                            if !v.is_empty() {
                                m.insert(leaf(&n.name), (v[0], t.transform_flags));
                            }
                        }
                    }
                }
            }
            m
        };
        let mo = map(&original);
        let mn = map(&re);
        let mut max_dr = 0.0f32;
        let mut max_dt = 0.0f32;
        for (name, (ao, fo)) in &mo {
            let Some((an, fn_)) = mn.get(name) else {
                continue;
            };
            let Some(&(rt, rr, rs)) = rest.get(name) else {
                continue;
            };
            let (to, ro, _) = compose(rt, rr, rs, ao, fo);
            let (tn, rn, _) = compose(rt, rr, rs, an, fn_);
            max_dt = max_dt.max((to - tn).length());
            max_dr = max_dr.max(1.0 - ro.dot(rn).abs());
        }
        println!("composed parity: max_dT={max_dt:.6} max_dR={max_dr:.6}");
    }

    // Sanity: no residual headers
    let bytes = std::fs::read(output).expect("read out");
    let mut c3409 = 0usize;
    let mut c4409 = 0usize;
    for i in 0..bytes.len().saturating_sub(3) {
        if bytes[i] == 0x09 && bytes[i + 1] == 0x34 && bytes[i + 2] == 0 && bytes[i + 3] == 0 {
            c3409 += 1;
        }
        if bytes[i] == 0x09 && bytes[i + 1] == 0x44 && bytes[i + 2] == 0 && bytes[i + 3] == 0 {
            c4409 += 1;
        }
    }
    println!("residual headers 0x3409={c3409} 0x4409={c4409} (must be 0)");
}
