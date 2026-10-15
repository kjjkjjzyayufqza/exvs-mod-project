//! Readers for stage `plan_param.spbin` and `border_hit.hkt`.
//!
//! Synthetic cases stand alone. When `E:\XB\mod\001stage` (or
//! `EXVS_OB_STAGE_CORPUS`) is present, every unpacked map is checked too.

use std::path::{Path, PathBuf};

use app_lib::format::border_hit::{parse_border_hit, BorderHitFile};
use app_lib::format::plan_param::{parse_plan_param, write_plan_param, RespawnPoint, SpawnMarker};
use app_lib::mbon::stage_port::info::plan_param_bytes;
use exvs_mbon::stage::SpawnPlan;

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_u64(out: &mut Vec<u8>, value: u64) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_f32(out: &mut Vec<u8>, value: f32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_f32s(out: &mut Vec<u8>, values: &[f32]) {
    for value in values {
        push_f32(out, *value);
    }
}

/// Canonical layout: limit at `0x30`, then pairs, markers, respawn points.
fn encode_plan(
    limit: f32,
    pairs: &[[f32; 8]],
    markers: &[[f32; 4]],
    respawns: &[[f32; 4]],
) -> Vec<u8> {
    let pairs_at = 0x30 + 8;
    let markers_at = pairs_at + pairs.len() * 32;
    let respawn_at = markers_at + markers.len() * 16;
    let mut out = Vec::new();
    out.extend_from_slice(&[0xA9, 0xB8, 0xAC, 0xAF]);
    push_u32(&mut out, pairs.len() as u32);
    push_u32(&mut out, markers.len() as u32);
    push_u32(&mut out, respawns.len() as u32);
    for offset in [
        0x30_u64,
        pairs_at as u64,
        markers_at as u64,
        respawn_at as u64,
    ] {
        push_u64(&mut out, offset);
    }
    push_f32s(&mut out, &[limit, 0.0]);
    for pair in pairs {
        push_f32s(&mut out, pair);
    }
    for marker in markers {
        push_f32s(&mut out, marker);
    }
    for point in respawns {
        push_f32s(&mut out, point);
    }
    out
}

fn chunk(magic: &[u8; 4], body: &[u8]) -> Vec<u8> {
    let total = body.len() + 8;
    let mut out = Vec::new();
    out.extend_from_slice(&(total as u32).to_be_bytes());
    out.extend_from_slice(magic);
    out.extend_from_slice(body);
    out
}

fn sample_border() -> Vec<u8> {
    let tstr = b"hkRootLevelContainer\0hknpCompressedMeshShape\0";
    let data = b"Scene Data\0Physics Scene Data\0";
    let item = [0_u8; 12];
    let type_body = chunk(b"TSTR", tstr);
    let index_body = chunk(b"ITEM", &item);
    let mut tag = Vec::new();
    tag.extend(chunk(b"SDKV", b"20160200"));
    tag.extend(chunk(b"DATA", data));
    tag.extend(chunk(b"TYPE", &type_body));
    tag.extend(chunk(b"INDX", &index_body));
    chunk(b"TAG0", &tag)
}

#[test]
fn plan_param_reads_the_shipped_456_byte_shape() {
    let bytes = encode_plan(
        1000.0,
        &[[0.0, 400.0, 100.0, 1.0, 0.0, 400.0, -100.0, 1.0]],
        &[
            [200.0, 50.0, 0.0, 0.0],
            [-200.0, 50.0, 0.0, std::f32::consts::PI],
        ],
        &[[0.0, 400.0, 0.0, 0.0]; 21],
    );
    assert_eq!(bytes.len(), 456);
    assert_eq!(
        u64::from_le_bytes(bytes[0x28..0x30].try_into().unwrap()),
        0x78
    );
    let plan = parse_plan_param(&bytes).unwrap();
    assert_eq!(write_plan_param(&plan), bytes);
    assert_eq!(plan.limit, 1000.0);
    assert_eq!(plan.limit_padding, 0.0);
    assert_eq!(plan.spawn_pairs.len(), 1);
    assert_eq!(plan.spawn_pairs[0].first, [0.0, 400.0, 100.0, 1.0]);
    assert_eq!(plan.spawn_pairs[0].second, [0.0, 400.0, -100.0, 1.0]);
    assert_eq!(plan.markers[1].parameter, std::f32::consts::PI);
    assert_eq!(plan.respawn_points.len(), 21);
    assert_eq!(plan.respawn_points[0].padding, 0.0);
}

#[test]
fn plan_param_keeps_the_second_spawn_word_and_marker_angle() {
    let bytes = encode_plan(
        3000.0,
        &[[1.0, 2.0, 3.0, 1.0, 4.0, 5.0, 6.0, 3.5]],
        &[[0.0, 0.0, 0.0, 0.139_626_34]],
        &[[8.0, 9.0, 10.0, 0.0]],
    );
    let mut plan = parse_plan_param(&bytes).unwrap();
    plan.spawn_pairs[0].first[0] = 12.5;
    let rewritten = parse_plan_param(&write_plan_param(&plan)).unwrap();
    assert_eq!(rewritten.spawn_pairs[0].first[0], 12.5);
    assert_eq!(rewritten.spawn_pairs[0].second[3], 3.5);
    assert_eq!(rewritten.markers[0].parameter, plan.markers[0].parameter);
    assert_eq!(plan.limit, 3000.0);
    assert_eq!(plan.spawn_pairs[0].second[3], 3.5);
    assert!((plan.markers[0].parameter - 0.139_626_34).abs() < 1e-6);
    assert_eq!(
        plan.respawn_points,
        vec![RespawnPoint {
            position: [8.0, 9.0, 10.0],
            padding: 0.0,
        }]
    );
}

#[test]
fn plan_param_rejects_empty_bad_magic_truncated_and_non_finite() {
    assert!(parse_plan_param(&[]).unwrap_err().contains("header"));
    let mut bad_magic = encode_plan(1000.0, &[], &[], &[]);
    bad_magic[0] = 0;
    assert!(parse_plan_param(&bad_magic).unwrap_err().contains("magic"));

    let mut truncated = encode_plan(1000.0, &[[0.0; 8]], &[[0.0; 4]], &[[0.0; 4]]);
    truncated.pop();
    assert!(parse_plan_param(&truncated).unwrap_err().contains("end at"));

    let mut extra = encode_plan(1000.0, &[], &[], &[]);
    extra.push(0);
    assert!(parse_plan_param(&extra).unwrap_err().contains("end at"));

    let mut shifted = encode_plan(1000.0, &[], &[], &[]);
    shifted[16] = 0x40;
    assert!(parse_plan_param(&shifted)
        .unwrap_err()
        .contains("limit section"));

    let mut nan = encode_plan(1000.0, &[], &[], &[]);
    nan[0x30..0x34].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(parse_plan_param(&nan).unwrap_err().contains("non-finite"));

    let mut huge = encode_plan(1000.0, &[], &[], &[]);
    huge[4..8].copy_from_slice(&1_000_000_u32.to_le_bytes());
    assert!(parse_plan_param(&huge).is_err());
}

#[test]
fn plan_param_reader_accepts_the_mbon_port_writer() {
    let source = SpawnPlan {
        header: [0; 3],
        spawn_pairs: vec![[0.0, 400.0, 100.0, 1.0, 0.0, 400.0, -100.0, 1.0]],
        respawn_points: vec![[0.0, 400.0, 0.0]; 21],
        markers: vec![([200.0, 50.0, 0.0], 5), ([-200.0, 50.0, 0.0], 1)],
        limits: vec![1000.0_f32.to_bits()],
    };
    let bytes = plan_param_bytes(&source).unwrap();
    let plan = parse_plan_param(&bytes).unwrap();
    assert_eq!(plan.spawn_pairs.len(), 1);
    assert_eq!(plan.respawn_points.len(), 21);
    assert_eq!(
        plan.markers,
        vec![
            SpawnMarker {
                position: [200.0, 50.0, 0.0],
                parameter: 0.0,
            },
            SpawnMarker {
                position: [-200.0, 50.0, 0.0],
                parameter: 0.0,
            },
        ]
    );
}

#[test]
fn border_hit_reads_a_minimal_tagfile() {
    let file = parse_border_hit(&sample_border()).unwrap();
    assert_eq!(
        file,
        BorderHitFile {
            sdk_version: "20160200".to_string(),
            byte_len: sample_border().len(),
            data_len: b"Scene Data\0Physics Scene Data\0".len(),
            item_count: 1,
            type_chunks: vec!["TSTR".to_string()],
        }
    );
}

#[test]
fn border_hit_rejects_a_truncated_chunk_and_a_missing_mesh_type() {
    let mut bytes = sample_border();
    bytes.pop();
    assert!(parse_border_hit(&bytes).is_err());

    let tstr = b"hkRootLevelContainer\0";
    let data = b"Scene Data\0Physics Scene Data\0";
    let type_body = chunk(b"TSTR", tstr);
    let index_body = chunk(b"ITEM", &[0_u8; 12]);
    let mut tag = Vec::new();
    tag.extend(chunk(b"SDKV", b"20160200"));
    tag.extend(chunk(b"DATA", data));
    tag.extend(chunk(b"TYPE", &type_body));
    tag.extend(chunk(b"INDX", &index_body));
    assert!(parse_border_hit(&chunk(b"TAG0", &tag))
        .unwrap_err()
        .contains("hknpCompressedMeshShape"));
}

fn corpus_root() -> Option<PathBuf> {
    let configured = std::env::var("EXVS_OB_STAGE_CORPUS").ok();
    let path = configured
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"E:\XB\mod\001stage"));
    path.is_dir().then_some(path)
}

fn collect(dir: &Path, file_name: &str, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect(&path, file_name, out);
        } else if path.file_name().and_then(|name| name.to_str()) == Some(file_name) {
            out.push(path);
        }
    }
}

fn is_stage_file(path: &Path, stage: &str, file: &str) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    normalized.ends_with(&format!("{stage}/0/0/info/{file}"))
}

fn find_one<'a>(files: &'a [PathBuf], stage: &str, file: &str) -> &'a Path {
    let hits: Vec<_> = files
        .iter()
        .filter(|path| is_stage_file(path, stage, file))
        .collect();
    assert_eq!(
        hits.len(),
        1,
        "expected one {stage}/{file} in the stage corpus, found {}",
        hits.len()
    );
    hits[0]
}

fn near(actual: f32, expected: f32) -> bool {
    (actual - expected).abs() < 1e-5
}

#[test]
fn unpacked_maps_cross_check_plan_param_and_border_hit() {
    let Some(root) = corpus_root() else {
        eprintln!("stage corpus is not on this machine; disk cross-check skipped");
        return;
    };

    let mut plans = Vec::new();
    let mut borders = Vec::new();
    collect(&root, "plan_param.spbin", &mut plans);
    collect(&root, "border_hit.hkt", &mut borders);
    assert!(plans.len() >= 6, "corpus has too few plan_param files");
    assert!(borders.len() >= 6, "corpus has too few border_hit files");

    let practice = find_one(&plans, "0x16F73C97", "plan_param.spbin");
    let practice_plan = parse_plan_param(&std::fs::read(practice).unwrap()).unwrap();
    assert_eq!(practice_plan.spawn_pairs.len(), 1);
    assert_eq!(practice_plan.markers.len(), 2);
    assert_eq!(practice_plan.respawn_points.len(), 21);
    assert_eq!(practice_plan.limit, 1000.0);
    assert!(near(practice_plan.markers[0].parameter, 0.0));
    assert!(near(
        practice_plan.markers[1].parameter,
        std::f32::consts::PI
    ));

    let side7 = parse_plan_param(
        &std::fs::read(find_one(&plans, "201stage201", "plan_param.spbin")).unwrap(),
    )
    .unwrap();
    assert_eq!(
        (
            side7.spawn_pairs.len(),
            side7.markers.len(),
            side7.respawn_points.len()
        ),
        (4, 2, 18)
    );

    let stage203 = parse_plan_param(
        &std::fs::read(find_one(&plans, "203stage203", "plan_param.spbin")).unwrap(),
    )
    .unwrap();
    assert!(near(
        stage203.markers[0].parameter,
        8.0 * std::f32::consts::PI / 180.0
    ));

    let stage210 = parse_plan_param(
        &std::fs::read(find_one(&plans, "210stage210", "plan_param.spbin")).unwrap(),
    )
    .unwrap();
    assert_eq!(stage210.respawn_points.len(), 18);

    let stage252 =
        parse_plan_param(&std::fs::read(find_one(&plans, "stage252", "plan_param.spbin")).unwrap())
            .unwrap();
    assert!(near(
        stage252.markers[0].parameter,
        std::f32::consts::FRAC_PI_2
    ));

    let la_gramis = parse_plan_param(
        &std::fs::read(find_one(&plans, "mbon_la_gramis", "plan_param.spbin")).unwrap(),
    )
    .unwrap();
    assert_eq!(la_gramis.limit, 3000.0);

    let mbon_practice = parse_plan_param(
        &std::fs::read(find_one(&plans, "mbon_practice", "plan_param.spbin")).unwrap(),
    )
    .unwrap();
    assert_eq!(
        (
            mbon_practice.spawn_pairs.len(),
            mbon_practice.respawn_points.len()
        ),
        (2, 9)
    );

    let empty = std::fs::read(find_one(&plans, "pairs_map", "plan_param.spbin")).unwrap();
    assert!(empty.is_empty());
    assert!(parse_plan_param(&empty).is_err());

    for path in &plans {
        let bytes = std::fs::read(path).unwrap();
        if bytes.is_empty() {
            assert!(parse_plan_param(&bytes).is_err(), "{}", path.display());
            continue;
        }
        let plan =
            parse_plan_param(&bytes).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
        assert_eq!(write_plan_param(&plan), bytes, "{}", path.display());
        assert_eq!(plan.markers.len(), 2, "{}", path.display());
        assert!(
            matches!(plan.spawn_pairs.len(), 1..=4),
            "{}",
            path.display()
        );
        assert!(
            matches!(plan.respawn_points.len(), 9 | 16 | 18 | 21),
            "{} respawns {}",
            path.display(),
            plan.respawn_points.len()
        );
        assert!(
            plan.limit == 1000.0 || plan.limit == 3000.0,
            "{}",
            path.display()
        );
        assert_eq!(plan.limit_padding, 0.0, "{}", path.display());
        for pair in &plan.spawn_pairs {
            assert_eq!(pair.first[3], 1.0, "{}", path.display());
            assert!(
                pair.second[3] == 1.0 || pair.second[3] == 3.5,
                "{}",
                path.display()
            );
            for value in pair.first.into_iter().chain(pair.second) {
                assert!(value.abs() <= 3000.0, "{}", path.display());
            }
        }
        for marker in &plan.markers {
            for value in marker.position {
                assert!(value.abs() <= 3000.0, "{}", path.display());
            }
        }
        for point in &plan.respawn_points {
            assert_eq!(point.padding, 0.0, "{}", path.display());
            for value in point.position {
                assert!(value.abs() <= 3000.0, "{}", path.display());
            }
        }
    }

    let shipped_sdks = [
        (
            "0x16F73C97",
            "20160100",
            vec!["TSTR", "TNAM", "FSTR", "TBOD", "TPAD"],
        ),
        (
            "201stage201",
            "20160200",
            vec!["TSTR", "TNA1", "FSTR", "TBDY", "TPAD"],
        ),
        (
            "203stage203",
            "20160200",
            vec!["TSTR", "TNA1", "FSTR", "TBDY", "TPAD"],
        ),
        (
            "210stage210",
            "20160200",
            vec!["TSTR", "TNA1", "FSTR", "TBDY", "TPAD"],
        ),
        (
            "stage252",
            "20160200",
            vec!["TSTR", "TNA1", "FSTR", "TBDY", "TPAD"],
        ),
    ];
    for (stage, sdk, chunks) in shipped_sdks {
        let parsed =
            parse_border_hit(&std::fs::read(find_one(&borders, stage, "border_hit.hkt")).unwrap())
                .unwrap_or_else(|error| panic!("{stage}: {error}"));
        assert_eq!(parsed.sdk_version, sdk, "{stage}");
        assert_eq!(parsed.type_chunks, chunks, "{stage}");
    }

    for path in &borders {
        let bytes = std::fs::read(path).unwrap();
        let parsed =
            parse_border_hit(&bytes).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
        assert_eq!(parsed.byte_len, bytes.len(), "{}", path.display());
        assert!(
            matches!(
                parsed.sdk_version.as_str(),
                "20160100" | "20160200" | "20180100"
            ),
            "{} sdk {}",
            path.display(),
            parsed.sdk_version
        );
        assert!(
            parsed.type_chunks == ["TSTR", "TNA1", "FSTR", "TBDY", "TPAD"]
                || parsed.type_chunks == ["TSTR", "TNAM", "FSTR", "TBOD", "TPAD"],
            "{} type chunks {:?}",
            path.display(),
            parsed.type_chunks
        );
        assert!(parsed.item_count >= 2, "{}", path.display());
        assert!(parsed.data_len > 0, "{}", path.display());
    }
}
