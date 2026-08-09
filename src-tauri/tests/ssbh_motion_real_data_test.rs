//! Real-data guards for EXVS2 `.nuanmb` decoding.
//!
//! The Anim v1.2 residual codecs used to infer their buffer layout by scanning
//! candidate offsets. A misaligned guess still yields finite, unit-length
//! quaternions, so the decoder reported success while a bone swung through a
//! completely wrong trajectory.
//!
//! Note on what these tests can and cannot check. A global "no bone may rotate
//! more than N degrees per frame" sweep looks appealing and does not work: real
//! melee clips in this set legitimately reach 178 deg/frame, while the broken
//! clavicles peaked at 168 and were otherwise smooth (their path-length to
//! net-span ratio was 2.0, identical to the correct decode). Nothing about the
//! sampled curve separates the two. The assertion that does discriminate is
//! structural and lives in the decoder: `block_count` must agree with
//! `key_count` and the residual stream must end exactly at the end of the
//! buffer. So these tests cover the two things this layer can actually prove —
//! every clip still decodes, and specific bones whose real-world range is known
//! stay inside it.

use std::path::{Path, PathBuf};

use app_lib::ssbh_motion_interchange::read_nuanmb_as_motion_clip;

const MOTION_ROOT: &str = r"E:\XB\mod\003motion\001hito_028gunwtv_001gunwtv_001";

const BODY_SKELETON: &str = r"E:\XB\mod\002chara\028gunwtv_001gunwtv_001\models\028gunwtv_001gunwtv_001_body_normal\028gunwtv_001gunwtv_001_body_normal__maya__.nusktb";

fn skip_unless_fixtures_present() -> bool {
    if Path::new(BODY_SKELETON).is_file() && Path::new(MOTION_ROOT).is_dir() {
        return false;
    }
    eprintln!("skipping: EXVS2 motion fixtures are not available on this machine");
    true
}

fn animation_path(relative: &str) -> PathBuf {
    Path::new(MOTION_ROOT).join(relative)
}

/// Largest rotation change between adjacent frames, per bone, in degrees.
fn per_frame_steps(animation: &Path) -> Vec<(String, f32)> {
    let clip = read_nuanmb_as_motion_clip(
        animation,
        Path::new(BODY_SKELETON),
        animation.file_stem().unwrap().to_string_lossy().to_string(),
    )
    .unwrap_or_else(|error| panic!("{} must decode: {error:?}", animation.display()));

    let mut worst = vec![0.0f32; clip.skeleton.bones.len()];
    for pair in clip.frames.windows(2) {
        for (bone, slot) in worst.iter_mut().enumerate() {
            let previous = pair[0].local_transforms[bone].rotation;
            let current = pair[1].local_transforms[bone].rotation;
            let degrees = 2.0 * previous.dot(current).abs().min(1.0).acos().to_degrees();
            *slot = slot.max(degrees);
        }
    }

    clip.skeleton
        .bones
        .iter()
        .map(|bone| bone.name.clone())
        .zip(worst)
        .collect()
}

/// A clavicle carries the shoulder; during a sidestep it barely moves. Assert
/// the bones whose codec path was broken, in the clips where it was observed.
fn assert_clavicles_are_near_still(relative: &str) {
    let steps = per_frame_steps(&animation_path(relative));
    let clavicles: Vec<_> = steps
        .iter()
        .filter(|(bone, _)| bone.starts_with("SAKOTSU"))
        .collect();
    assert!(!clavicles.is_empty(), "{relative}: no clavicle bones found");

    for (bone, degrees) in clavicles {
        assert!(
            *degrees < 5.0,
            "{relative}: {bone} rotates {degrees:.2} deg between adjacent frames \
             (a misread residual layout put this at 124-168)"
        );
    }
}

/// SAKOTSU_L/R use `0x4309`, the keyframed blocked-residual codec whose endpoint
/// table offset used to be hardcoded to the `block_count == 3` layout.
#[test]
fn keyframed_residual_clavicles_decode_correctly() {
    if skip_unless_fixtures_present() {
        return;
    }
    assert_clavicles_are_near_still(
        r"0\0\51\001hito_028gunwtv_001gunwtv_001_stepbgn_stk_air_fr.nuanmb",
    );
    assert_clavicles_are_near_still(
        r"0\0\001hito_028gunwtv_001gunwtv_001_stepbgn_sht_gnd_rt.nuanmb",
    );
}

/// Every rotation in this clip uses `0x4408`, the single-block codec whose
/// residual scale used to be read from the first endpoint instead of the header.
#[test]
fn single_block_residual_clavicles_decode_correctly() {
    if skip_unless_fixtures_present() {
        return;
    }
    assert_clavicles_are_near_still(
        r"0\0\55\001hito_028gunwtv_001gunwtv_001_stepend_stk_air_bk.nuanmb",
    );
}

/// The decoder rejects a residual header it cannot explain rather than guessing
/// an offset, so "every clip still loads" is a real statement about layout
/// coverage across every codec variant the character ships.
#[test]
fn every_clip_in_the_character_motion_set_decodes() {
    if skip_unless_fixtures_present() {
        return;
    }

    let mut clips = Vec::new();
    collect_body_clips(Path::new(MOTION_ROOT), &mut clips);
    assert!(
        clips.len() > 100,
        "expected a full motion set, found {}",
        clips.len()
    );

    let mut failures = Vec::new();
    for path in &clips {
        if let Err(error) = read_nuanmb_as_motion_clip(
            path,
            Path::new(BODY_SKELETON),
            path.file_stem().unwrap().to_string_lossy().to_string(),
        ) {
            failures.push(format!(
                "{}: {error:?}",
                path.file_name().unwrap().to_string_lossy()
            ));
        }
    }
    assert!(failures.is_empty(), "clips failed to decode: {failures:#?}");
}

/// Collect the clips rigged to the body skeleton. Weapon and effect clips in the
/// same tree bind to their own skeletons and are named after them.
fn collect_body_clips(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            collect_body_clips(&path, out);
            continue;
        }
        if path.extension().and_then(|extension| extension.to_str()) != Some("nuanmb") {
            continue;
        }
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("001hito_"))
        {
            out.push(path);
        }
    }
}
