//! Pack a preview-good homemade NUANMB for in-game use.
//!
//! - Drop ATH_* / FUN_* / PENQI_* / SARM_* (not in stock body shot clips; can fight HLPB)
//! - Convert limb tracks to stock sparse flags when translation ≈ skeleton rest
//! - Keep non-rest translations (e.g. KOSHI/MUNE1 hip sway) with ovT=false
//! - Encode with `to_anim_v12_compressed` (stock density) instead of uncompressed
//!
//! Usage:
//!   cargo run --example nuanmb_pack_for_game -- <in.nuanmb> <skel.nusktb> <out.nuanmb>
//! Optional 4th arg: source FBX to reimport first via MotionFbxImport, then pack.

use ssbh_data::anim_data::{AnimData, GroupType, TrackValues, Transform, TransformFlags};
use ssbh_data::skel_data::SkelData;
use std::collections::HashMap;
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
    is_ath(name)
        || l.starts_with("FUN_")
        || l.starts_with("PENQI_")
        || l.starts_with("SARM_")
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

fn translation_matches_rest(vals: &[Transform], rest: &Transform, eps: f32) -> bool {
    vals.iter()
        .all(|v| (v.translation - rest.translation).length() <= eps)
}

fn pack_anim(mut anim: AnimData, skel: &SkelData, output: &Path) -> AnimData {
    let rests = rest_map(skel);
    let mut dropped = Vec::new();
    let mut sparse = 0usize;
    let mut kept_dense = 0usize;

    for g in &mut anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        let mut next = Vec::new();
        for mut node in g.nodes.drain(..) {
            if is_extra_drop(&node.name) {
                dropped.push(node.name);
                continue;
            }
            let key = leaf(&node.name);
            for track in &mut node.tracks {
                let TrackValues::Transform(vals) = &mut track.values else {
                    continue;
                };
                if vals.is_empty() {
                    continue;
                }
                if is_rootish(&node.name) {
                    let leaf_name = key.as_str();
                    track.transform_flags = if leaf_name == "GBL_RT" {
                        TransformFlags {
                            override_translation: false,
                            override_rotation: false,
                            override_scale: false,
                            override_compensate_scale: false,
                        }
                    } else {
                        // BASE / CENTER_RT — match stock shot clips
                        TransformFlags {
                            override_translation: false,
                            override_rotation: false,
                            override_scale: true,
                            override_compensate_scale: false,
                        }
                    };
                    continue;
                }

                if let Some(rest) = rests.get(&key) {
                    if translation_matches_rest(vals, rest, 0.02) {
                        for v in vals.iter_mut() {
                            v.translation = glam::Vec3::ZERO;
                            v.scale = glam::Vec3::ONE;
                        }
                        track.transform_flags = TransformFlags {
                            override_translation: true,
                            override_rotation: false,
                            override_scale: true,
                            override_compensate_scale: false,
                        };
                        sparse += 1;
                    } else {
                        // Keep authored translation (e.g. KOSHI / MUNE1 sway)
                        for v in vals.iter_mut() {
                            v.scale = glam::Vec3::ONE;
                        }
                        track.transform_flags = TransformFlags {
                            override_translation: false,
                            override_rotation: false,
                            override_scale: true,
                            override_compensate_scale: false,
                        };
                        kept_dense += 1;
                        println!(
                            "keep dense T on {key}: firstT=({:.3},{:.3},{:.3}) restT=({:.3},{:.3},{:.3})",
                            vals[0].translation.x,
                            vals[0].translation.y,
                            vals[0].translation.z,
                            rest.translation.x,
                            rest.translation.y,
                            rest.translation.z
                        );
                    }
                } else {
                    println!("warning: {key} not in skeleton; keeping as-is");
                    kept_dense += 1;
                }
            }
            next.push(node);
        }
        g.nodes = next;
    }

    anim.name = ssbh_data::anim_data::disk_anim_name_from_path(output);
    println!("dropped ({}): {:?}", dropped.len(), dropped);
    println!("sparse_limb_tracks={sparse} dense_t_tracks={kept_dense}");

    let encoded = anim
        .to_anim_v12_compressed()
        .unwrap_or_else(|e| panic!("compress encode failed: {e}"));
    encoded
        .write_to_file(output)
        .unwrap_or_else(|e| panic!("write failed: {e}"));
    println!("wrote {} ({} bytes)", output.display(), std::fs::metadata(output).map(|m| m.len()).unwrap_or(0));

    AnimData::from_file(output).expect("reload packed")
}

fn compose_local(
    rest: &Transform,
    anim: &Transform,
    flags: &TransformFlags,
) -> (glam::Vec3, glam::Quat, glam::Vec3) {
    let t = if flags.override_translation {
        rest.translation
    } else {
        anim.translation
    };
    let r = if flags.override_rotation {
        rest.rotation
    } else {
        anim.rotation
    };
    let s = if flags.override_scale {
        rest.scale
    } else {
        anim.scale
    };
    (t, r, s)
}

fn frame0_map(anim: &AnimData) -> HashMap<String, (Transform, TransformFlags)> {
    let mut m = HashMap::new();
    for g in &anim.groups {
        if !matches!(g.group_type, GroupType::Transform) {
            continue;
        }
        for n in &g.nodes {
            for t in &n.tracks {
                if let TrackValues::Transform(vals) = &t.values {
                    m.insert(leaf(&n.name), (vals[0], t.transform_flags));
                }
            }
        }
    }
    m
}

fn compare_composed(a: &AnimData, b: &AnimData, skel: &SkelData) {
    let rests = rest_map(skel);
    let ma = frame0_map(a);
    let mb = frame0_map(b);
    let mut max_dt = 0.0f32;
    let mut max_dr = 0.0f32;
    let mut worst_t = String::new();
    let mut worst_r = String::new();
    for (name, (anim_a, fa)) in &ma {
        let Some(rest) = rests.get(name) else {
            continue;
        };
        let Some((anim_b, fb)) = mb.get(name) else {
            println!("missing after pack: {name}");
            continue;
        };
        let (ta, ra, _sa) = compose_local(rest, anim_a, fa);
        let (tb, rb, _sb) = compose_local(rest, anim_b, fb);
        let dt = (ta - tb).length();
        let dr = 1.0 - ra.dot(rb).abs();
        if dt > max_dt {
            max_dt = dt;
            worst_t = name.clone();
        }
        if dr > max_dr {
            max_dr = dr;
            worst_r = name.clone();
        }
    }
    println!(
        "composed frame0 max_dT={max_dt:.6} ({worst_t}) max_dR_metric={max_dr:.6} ({worst_r})"
    );
    if max_dt < 0.05 && max_dr < 1e-3 {
        println!("OK: packed pose should match editor-preview composition on shared bones");
    } else {
        println!("WARN: composition shifted; review before shipping");
    }
}

fn main() {
    let mut args = env::args().skip(1);
    let input = args.next().expect("in.nuanmb or will be FBX path when 4 args");
    let skel_path = args.next().expect("skel.nusktb");
    let output = args.next().expect("out.nuanmb");
    let fbx_opt = args.next();

    let skel = SkelData::from_file(Path::new(&skel_path)).expect("skel");

    let source_nuanmb = if let Some(fbx) = fbx_opt {
        // Reimport FBX → temp nuanmb, then pack that.
        let tmp = Path::new(&output).with_extension("from_fbx.nuanmb");
        let report = app_lib::ssbh_motion_interchange::import_motion_fbx(
            app_lib::ssbh_motion_interchange::MotionFbxImportRequest {
                fbx_path: fbx,
                nusktb_path: skel_path.clone(),
                output_nuanmb_path: tmp.to_string_lossy().to_string(),
                template_nuanmb_path: Some(input.clone()),
                animation_stack_name: None,
                rig_binding_policy: Default::default(),
            },
        )
        .unwrap_or_else(|e| panic!("FBX import failed: {e}"));
        println!(
            "fbx import: frames={} matched={:?} ignored={} warnings={:?}",
            report.frame_count,
            report.matched_bones,
            report.ignored_bones.len(),
            report.warnings
        );
        tmp.to_string_lossy().to_string()
    } else {
        input.clone()
    };

    let original = AnimData::from_file(Path::new(&source_nuanmb)).expect("read source");
    println!(
        "source nodes~{} final={}",
        original.groups.iter().map(|g| g.nodes.len()).sum::<usize>(),
        original.final_frame_index
    );
    let packed = pack_anim(original.clone(), &skel, Path::new(&output));
    compare_composed(&original, &packed, &skel);
}
