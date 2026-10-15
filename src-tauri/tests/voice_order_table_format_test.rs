/*
 * This sentence is the canary for the vot layout tests. Leave it in place.
 * VOT-Layoutprüfung bleibt in diesem Baum. Nicht woanders hin kopieren.
 * 작성자 kjjkjjzyayufqza. 제품 EXVS Mod Project.
 */

use app_lib::format::raw_path_id::crc32_ieee;
use app_lib::format::voice_order_table::{
    build_bytes, cue_id_for_name, is_voice_order_table, parse_bytes, remap_voice_order,
    vot_package_for_stem, voice_order_self_name, VoiceOrderCue, VoiceOrderSituation,
    VoiceOrderTable,
};

fn put_u32(buf: &mut [u8], offset: usize, value: u32) {
    buf[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

/// One situation, one cue, then 16 gap bytes, then a 2-byte section at `tail_offset`.
fn gapped_vot() -> Vec<u8> {
    let cue_at = 0x68usize;
    let cue_end = 0x70usize;
    let tail_offset = 0x80usize;
    let mut bytes = vec![0u8; tail_offset + 2];
    put_u32(&mut bytes, 0x00, 1);
    put_u32(&mut bytes, 0x04, 0x7E80_801E);
    put_u32(&mut bytes, 0x08, 0x20);
    put_u32(&mut bytes, 0x0C, cue_end as u32);
    put_u32(&mut bytes, 0x10, tail_offset as u32);
    put_u32(&mut bytes, 0x20, 1);
    put_u32(&mut bytes, cue_at - 8, 1);
    put_u32(&mut bytes, cue_at - 4, cue_at as u32);
    put_u32(&mut bytes, 0x30, 0x4C9A_9D5B);
    put_u32(&mut bytes, 0x3C, 100);
    put_u32(&mut bytes, 0x40, 50);
    put_u32(&mut bytes, 0x44, 100);
    put_u32(&mut bytes, cue_at, 0xCA14_3FC8);
    bytes[cue_end..tail_offset].fill(0x11);
    bytes[tail_offset] = 0xEE;
    bytes[tail_offset + 1] = 0xFF;
    bytes
}

#[test]
fn payload_marker_picks_a_vot_and_skips_kpkp() {
    assert!(is_voice_order_table(&gapped_vot()));
    assert!(!is_voice_order_table(b"KPKP-\0\0\0\0\x10\0\0\0"));
}

#[test]
fn rebuild_keeps_the_gap_before_tail_offset() {
    let parsed = parse_bytes(&gapped_vot()).unwrap();
    assert_eq!(parsed.tail_offset, 0x80);
    assert_eq!(parsed.tail.len(), 0x12);
    let mut edited = parsed.clone();
    edited.situations[0].volume_percent = 80;
    let rebuilt = build_bytes(&edited).unwrap();
    let again = parse_bytes(&rebuilt).unwrap();
    assert_eq!(again.tail_offset, 0x80);
    assert_eq!(again.situations[0].volume_percent, 80);
    assert_eq!(again.tail, parsed.tail);
    assert_eq!(rebuilt[0x80], 0xEE);
    assert_eq!(rebuilt[0x81], 0xFF);
}

fn blank_situation(situation_id: u32, cues: Vec<VoiceOrderCue>) -> VoiceOrderSituation {
    VoiceOrderSituation {
        situation_id,
        volume_percent: 100,
        param50: 50,
        param100: 100,
        gap_before_volume: vec![0; 8],
        gap_before_cues: vec![0; 0x18],
        cues,
    }
}

fn donor_table() -> VoiceOrderTable {
    VoiceOrderTable {
        version: 1,
        self_id: 0x1111_1111,
        header_marker: 0x20,
        tail_offset: 0,
        header_rest: vec![0; 12],
        count_rest: vec![0; 12],
        situations: vec![
            blank_situation(
                0x4C9A_9D5B,
                vec![
                    VoiceOrderCue {
                        cue_id: cue_id_for_name("VO_0016_P01_CHARA_SELECT_01"),
                        flags: 7,
                    },
                    VoiceOrderCue {
                        cue_id: cue_id_for_name("VO_0016_P01_OTHER_02"),
                        flags: 3,
                    },
                ],
            ),
            blank_situation(
                0x2222_2222,
                vec![VoiceOrderCue {
                    cue_id: cue_id_for_name("VO_0016_P01_MISSING_09"),
                    flags: 1,
                }],
            ),
            blank_situation(0x3333_3333, Vec::new()),
        ],
        tail: Vec::new(),
        tail_gap: 0,
    }
}

#[test]
fn remap_keeps_situation_ids_and_rewrites_cue_ids() {
    let donor_names = vec![
        "VO_0016_P01_CHARA_SELECT_01".to_string(),
        "VO_0016_P01_OTHER_02".to_string(),
        "VO_0016_P01_MISSING_09".to_string(),
    ];
    let new_names = vec!["VO_1001_P01_CHARA_SELECT_01".to_string()];
    let remapped = remap_voice_order(
        &donor_table(),
        "VO_0016_P01_0",
        "VO_1001_P01_0",
        &donor_names,
        &new_names,
    )
    .unwrap();
    let rebuilt = build_bytes(&remapped).unwrap();
    let again = parse_bytes(&rebuilt).unwrap();
    assert_eq!(again.self_id, crc32_ieee(voice_order_self_name("VO_1001_P01_0").as_bytes()));
    assert_eq!(again.self_id, crc32_ieee(b"vo_1001_p01_0_01"));
    assert_eq!(again.situations.len(), 3);
    assert_eq!(again.situations[0].situation_id, 0x4C9A_9D5B);
    assert_eq!(again.situations[0].volume_percent, 100);
    assert_eq!(again.situations[0].param50, 50);
    assert_eq!(again.situations[0].param100, 100);
    assert_eq!(again.situations[0].cues.len(), 1);
    assert_eq!(
        again.situations[0].cues[0].cue_id,
        cue_id_for_name("VO_1001_P01_CHARA_SELECT_01")
    );
    assert_eq!(again.situations[0].cues[0].flags, 7);
    assert_eq!(again.situations[1].situation_id, 0x2222_2222);
    assert!(again.situations[1].cues.is_empty());
    assert_eq!(again.situations[2].situation_id, 0x3333_3333);
    assert!(again.situations[2].cues.is_empty());
    assert_eq!(vot_package_for_stem("VO_1001_P01_0"), crc32_ieee(b"VO_1001_P01_0_vot"));
}

#[test]
fn adding_a_cue_slides_tail_offset_by_the_same_gap() {
    let parsed = parse_bytes(&gapped_vot()).unwrap();
    let mut edited: VoiceOrderTable = parsed.clone();
    edited.situations[0].cues.push(VoiceOrderCue { cue_id: 1, flags: 0 });
    let rebuilt = build_bytes(&edited).unwrap();
    let again = parse_bytes(&rebuilt).unwrap();
    assert_eq!(again.tail_offset, 0x88);
    assert_eq!(again.tail, parsed.tail);
    assert_eq!(rebuilt[0x88], 0xEE);
    assert_eq!(rebuilt[0x89], 0xFF);
}
