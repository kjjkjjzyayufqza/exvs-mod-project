use app_lib::format::fhm2d::{extract_fhm2d_to_memory_impl, Fhm2dFormat};
use app_lib::format::pilot_voice_bank::{
    apply_bank_file, parse_bank, read_audio_tracks, section_directory, set_n_samples, sync_bank,
    sync_bank_files, track_length, SampleEdit,
};
use std::path::PathBuf;

fn tone_cue(name: &str, samples: i32, loops: [i32; 3], with_clock: bool) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend(name.as_bytes());
    bytes.push(0);
    if with_clock {
        bytes.extend([0u8; 8]);
        bytes.extend([0x80, 0xBB, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00]);
        for value in [samples, loops[0], loops[1], loops[2]] {
            bytes.extend(value.to_le_bytes());
        }
    }
    bytes
}

fn bank_with(tone: &[u8], pack: &[u8]) -> Vec<u8> {
    let sections: [(&[u8; 4], &[u8]); 7] = [
        (b"PROP", b"Test\0"),
        (b"BINF", b"name\0"),
        (b"GRP ", b"grp\0"),
        (b"DTON", b"dton"),
        (b"TONE", tone),
        (b"JUNK", b"junk"),
        (b"PACK", pack),
    ];
    let mut toc = Vec::new();
    let mut body = Vec::new();
    for (magic, payload) in sections {
        toc.extend(magic);
        toc.extend((payload.len() as u32).to_le_bytes());
        body.extend(magic);
        body.extend((payload.len() as u32).to_le_bytes());
        body.extend(payload);
    }
    let toc_size = (4 + toc.len()) as u32;
    let mut file = Vec::new();
    file.extend(b"NUS3");
    file.extend(0u32.to_le_bytes());
    file.extend(b"BANK");
    file.extend(b"TOC ");
    file.extend(toc_size.to_le_bytes());
    file.extend(7u32.to_le_bytes());
    file.extend(&toc);
    file.extend(&body);
    let size = (file.len() - 8) as u32;
    file[4..8].copy_from_slice(&size.to_le_bytes());
    file
}

fn one_cue_bank() -> Vec<u8> {
    let tone = tone_cue("vo_01_p01_words_002_02", 47824, [0, 0, 0], true);
    bank_with(&tone, b"RIFFPACKSTUB!!!!")
}

fn pcm_wav(rate: u32, frames: u32) -> Vec<u8> {
    let data_size = frames * 2;
    let mut body = Vec::new();
    body.extend(b"fmt ");
    body.extend(16u32.to_le_bytes());
    body.extend(1u16.to_le_bytes());
    body.extend(1u16.to_le_bytes());
    body.extend(rate.to_le_bytes());
    body.extend((rate * 2).to_le_bytes());
    body.extend(2u16.to_le_bytes());
    body.extend(16u16.to_le_bytes());
    body.extend(b"data");
    body.extend(data_size.to_le_bytes());
    body.extend(vec![0u8; data_size as usize]);
    let mut file = Vec::new();
    file.extend(b"RIFF");
    file.extend(((body.len() + 4) as u32).to_le_bytes());
    file.extend(b"WAVE");
    file.extend(body);
    file
}

/// Real nus3audio layout (`AUDIINDX`): NUS3, size, AUDIINDX, version 4, track
/// count, then TNID / NMOF / ADOF / TNNM / JUNK / PACK. NMOF entries are
/// absolute file offsets of NUL-terminated names. ADOF entries are
/// `(absolute offset, size)` pairs into PACK, in the same order.
fn nus3_audio(tracks: &[(&str, &[u8])]) -> Vec<u8> {
    let count = tracks.len();
    let header = 24usize;
    let tnid = 8 + count * 4;
    let nmof = 8 + count * 4;
    let adof = 8 + count * 8;
    let name_bytes: usize = tracks.iter().map(|(name, _)| name.len() + 1).sum();
    let tnnm = 8 + name_bytes;
    let junk = 8usize;
    let payload_bytes: usize = tracks.iter().map(|(_, payload)| payload.len()).sum();
    let pack_body = header + tnid + nmof + adof + tnnm + junk + 8;
    let total = pack_body + payload_bytes;
    let mut file = vec![0u8; total];
    file[0..4].copy_from_slice(b"NUS3");
    file[4..8].copy_from_slice(&((total - 8) as u32).to_le_bytes());
    file[8..16].copy_from_slice(b"AUDIINDX");
    file[16..20].copy_from_slice(&4u32.to_le_bytes());
    file[20..24].copy_from_slice(&(count as u32).to_le_bytes());

    let tnid_at = header;
    let nmof_at = tnid_at + tnid;
    let adof_at = nmof_at + nmof;
    let tnnm_at = adof_at + adof;
    let junk_at = tnnm_at + tnnm;
    let pack_at = junk_at + junk;
    file[tnid_at..tnid_at + 4].copy_from_slice(b"TNID");
    file[tnid_at + 4..tnid_at + 8].copy_from_slice(&((count * 4) as u32).to_le_bytes());
    file[nmof_at..nmof_at + 4].copy_from_slice(b"NMOF");
    file[nmof_at + 4..nmof_at + 8].copy_from_slice(&((count * 4) as u32).to_le_bytes());
    file[adof_at..adof_at + 4].copy_from_slice(b"ADOF");
    file[adof_at + 4..adof_at + 8].copy_from_slice(&((count * 8) as u32).to_le_bytes());
    file[tnnm_at..tnnm_at + 4].copy_from_slice(b"TNNM");
    file[tnnm_at + 4..tnnm_at + 8].copy_from_slice(&(name_bytes as u32).to_le_bytes());
    file[junk_at..junk_at + 4].copy_from_slice(b"JUNK");
    file[junk_at + 4..junk_at + 8].copy_from_slice(&0u32.to_le_bytes());
    file[pack_at..pack_at + 4].copy_from_slice(b"PACK");
    file[pack_at + 4..pack_at + 8].copy_from_slice(&(payload_bytes as u32).to_le_bytes());

    let mut name_cursor = tnnm_at + 8;
    let mut audio_cursor = pack_at + 8;
    for (index, (name, payload)) in tracks.iter().enumerate() {
        file[tnid_at + 8 + index * 4..tnid_at + 12 + index * 4]
            .copy_from_slice(&(index as u32).to_le_bytes());
        file[nmof_at + 8 + index * 4..nmof_at + 12 + index * 4]
            .copy_from_slice(&(name_cursor as u32).to_le_bytes());
        file[name_cursor..name_cursor + name.len()].copy_from_slice(name.as_bytes());
        name_cursor += name.len() + 1;
        file[adof_at + 8 + index * 8..adof_at + 12 + index * 8]
            .copy_from_slice(&(audio_cursor as u32).to_le_bytes());
        file[adof_at + 12 + index * 8..adof_at + 16 + index * 8]
            .copy_from_slice(&(payload.len() as u32).to_le_bytes());
        file[audio_cursor..audio_cursor + payload.len()].copy_from_slice(payload);
        audio_cursor += payload.len();
    }
    file
}

fn differing_offsets(left: &[u8], right: &[u8]) -> Vec<usize> {
    left.iter()
        .zip(right)
        .enumerate()
        .filter_map(|(index, (a, b))| if a != b { Some(index) } else { None })
        .collect()
}

#[test]
fn reads_n_samples_from_the_cue_clock() {
    let parsed = parse_bank(&one_cue_bank()).unwrap();
    assert_eq!(parsed.cues.len(), 1);
    let cue = &parsed.cues[0];
    assert_eq!(cue.name, "vo_01_p01_words_002_02");
    assert_eq!(cue.n_samples, 47824);
    assert_eq!(cue.loop_start, 0);
    assert_eq!(cue.loop_end, 0);
    assert_eq!(cue.loop_flag, 0);
    assert!(cue.has_clock);
}

#[test]
fn set_n_samples_changes_only_those_four_bytes() {
    let original = one_cue_bank();
    let mut patched = original.clone();
    set_n_samples(&mut patched, "vo_01_p01_words_002_02", 0x1122_3344).unwrap();
    assert_eq!(patched.len(), original.len());
    let diffs = differing_offsets(&original, &patched);
    assert_eq!(diffs.len(), 4);
    let parsed = parse_bank(&patched).unwrap();
    assert_eq!(parsed.cues[0].n_samples, 0x1122_3344);
    assert_eq!(parsed.cues[0].name, "vo_01_p01_words_002_02");
    assert_eq!(parsed.cues[0].loop_start, 0);
    assert_eq!(parsed.cues[0].loop_end, 0);
    assert_eq!(parsed.cues[0].loop_flag, 0);
}

#[test]
fn second_cue_clock_is_not_the_first_marker() {
    let tone = {
        let mut tone = tone_cue("Alpha", 1000, [1, 2, 3], true);
        tone.extend(tone_cue("Beta", 2000, [4, 5, 6], true));
        tone
    };
    let original = bank_with(&tone, b"RIFFPACKSTUB!!!!");
    let mut patched = original.clone();
    set_n_samples(&mut patched, "Beta", 3000).unwrap();
    let parsed = parse_bank(&patched).unwrap();
    assert_eq!(parsed.cues[0].n_samples, 1000);
    assert_eq!(parsed.cues[0].loop_start, 1);
    assert_eq!(parsed.cues[1].n_samples, 3000);
    assert_eq!(parsed.cues[1].loop_flag, 6);
}

#[test]
fn cue_without_a_clock_is_reported_and_not_patched() {
    let tone = tone_cue("Alpha", 0, [0, 0, 0], false);
    let original = bank_with(&tone, b"RIFFPACKSTUB!!!!");
    let parsed = parse_bank(&original).unwrap();
    assert!(!parsed.cues[0].has_clock);
    let mut patched = original.clone();
    let error = set_n_samples(&mut patched, "Alpha", 10).unwrap_err();
    assert!(error.contains("no_clock"), "{error}");
    assert_eq!(patched, original);
}

#[test]
fn round_trip_keeps_section_order_and_sizes() {
    let original = one_cue_bank();
    let before = section_directory(&original).unwrap();
    let mut patched = original.clone();
    set_n_samples(&mut patched, "vo_01_p01_words_002_02", 0x1122_3344).unwrap();
    let after = section_directory(&patched).unwrap();
    assert_eq!(before, after);
    let magics: Vec<&str> = before.iter().map(|section| section.magic.as_str()).collect();
    assert_eq!(
        magics,
        ["PROP", "BINF", "GRP ", "DTON", "TONE", "JUNK", "PACK"]
    );
}

#[test]
fn track_length_16bit_mono_48k() {
    let length = track_length(&pcm_wav(48000, 48000)).unwrap();
    assert_eq!(length.clock_samples().unwrap(), 48000);
}

#[test]
fn track_length_converts_44100_to_48000_clock() {
    let length = track_length(&pcm_wav(44100, 44100)).unwrap();
    assert_eq!(length.sample_rate, 44100);
    assert_eq!(length.clock_samples().unwrap(), 48000);
}

#[test]
fn track_length_rejects_bnsf_without_sfmt() {
    let error = track_length(b"BNSFrest").unwrap_err();
    assert!(error.contains("BNSF"), "{error}");
}

#[test]
fn reads_two_named_wav_tracks() {
    let alpha = pcm_wav(48000, 300);
    let beta = pcm_wav(48000, 400);
    let file = nus3_audio(&[("Alpha", &alpha), ("Beta", &beta)]);
    let tracks = read_audio_tracks(&file).unwrap();
    assert_eq!(tracks.len(), 2);
    assert_eq!(tracks[0].name, "Alpha");
    assert_eq!(tracks[1].name, "Beta");
    assert_eq!(track_length(&tracks[0].payload).unwrap().frames, 300);
    assert_eq!(track_length(&tracks[1].payload).unwrap().frames, 400);
}

#[test]
fn sync_updates_matching_name_only() {
    let tone = {
        let mut tone = tone_cue("Alpha", 100, [0, 0, 0], true);
        tone.extend(tone_cue("Beta", 200, [0, 0, 0], true));
        tone
    };
    let bank = bank_with(&tone, b"RIFFPACKSTUB!!!!");
    let alpha = pcm_wav(48000, 300);
    let gamma = pcm_wav(48000, 400);
    let audio = nus3_audio(&[("alpha", &alpha), ("gamma", &gamma)]);
    let (patched, report) = sync_bank(&bank, &audio).unwrap();
    let parsed = parse_bank(&patched).unwrap();
    assert_eq!(parsed.cues[0].n_samples, 300);
    assert_eq!(parsed.cues[1].n_samples, 200);
    assert_eq!(report.updated.len(), 1);
    assert_eq!(report.updated[0].name, "Alpha");
    assert_eq!(report.updated[0].old_n_samples, 100);
    assert_eq!(report.updated[0].new_n_samples, 300);
    assert_eq!(report.bank_only, ["Beta"]);
    assert_eq!(report.audio_only, ["gamma"]);
}

#[test]
fn sync_converts_44100_track_length_and_notes_it() {
    let tone = tone_cue("Alpha", 100, [0, 0, 0], true);
    let bank = bank_with(&tone, b"RIFFPACKSTUB!!!!");
    let wav = pcm_wav(44100, 44100);
    let audio = nus3_audio(&[("alpha", &wav)]);
    let (patched, report) = sync_bank(&bank, &audio).unwrap();
    assert_eq!(parse_bank(&patched).unwrap().cues[0].n_samples, 48000);
    assert!(report.skipped.is_empty());
    let note = report.updated[0].note.as_deref().unwrap();
    assert!(note.contains("44100"), "{note}");
}

#[test]
fn sync_does_not_change_cue_count() {
    let tone = {
        let mut tone = tone_cue("Alpha", 100, [0, 0, 0], true);
        tone.extend(tone_cue("Beta", 200, [0, 0, 0], true));
        tone
    };
    let bank = bank_with(&tone, b"RIFFPACKSTUB!!!!");
    let wav = pcm_wav(48000, 300);
    let audio = nus3_audio(&[("alpha", &wav), ("extra", &wav)]);
    let (patched, _) = sync_bank(&bank, &audio).unwrap();
    let before = parse_bank(&bank).unwrap();
    let after = parse_bank(&patched).unwrap();
    assert_eq!(after.cues.len(), before.cues.len());
    assert_eq!(after.cues[0].name, "Alpha");
    assert_eq!(after.cues[1].name, "Beta");
}

#[test]
fn set_n_samples_rejects_zero_and_negative() {
    let original = one_cue_bank();
    for value in [0, -1] {
        let mut patched = original.clone();
        assert!(set_n_samples(&mut patched, "vo_01_p01_words_002_02", value).is_err());
        assert_eq!(patched, original);
    }
}

#[test]
fn set_n_samples_accepts_one() {
    let mut patched = one_cue_bank();
    set_n_samples(&mut patched, "vo_01_p01_words_002_02", 1).unwrap();
    assert_eq!(parse_bank(&patched).unwrap().cues[0].n_samples, 1);
}

#[test]
fn sync_files_does_not_write_the_bank() {
    let dir = std::env::temp_dir().join(format!("pilot-voice-bank-sync-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let bank_path = dir.join("cue.nus3bank");
    let audio_path = dir.join("cue.nus3audio");
    let tone = tone_cue("Alpha", 100, [0, 0, 0], true);
    let bank = bank_with(&tone, b"RIFFPACKSTUB!!!!");
    let wav = pcm_wav(48000, 300);
    let audio = nus3_audio(&[("alpha", &wav)]);
    std::fs::write(&bank_path, &bank).unwrap();
    std::fs::write(&audio_path, &audio).unwrap();
    let outcome = sync_bank_files(&bank_path, &audio_path).unwrap();
    assert_eq!(std::fs::read(&bank_path).unwrap(), bank);
    assert_eq!(outcome.document.cues[0].n_samples, 300);
    assert_eq!(outcome.report.updated[0].new_n_samples, 300);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn apply_bank_file_writes_workspace_copy_and_backs_up_once() {
    let dir = std::env::temp_dir().join(format!("pilot-voice-bank-apply-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let bank_path = dir.join("cue.nus3bank");
    let original = one_cue_bank();
    std::fs::write(&bank_path, &original).unwrap();
    let written = apply_bank_file(
        &bank_path,
        &[SampleEdit {
            name: "vo_01_p01_words_002_02".to_string(),
            n_samples: 60000,
        }],
    )
    .unwrap();
    assert_eq!(written.cues[0].n_samples, 60000);
    let orig_path = PathBuf::from(format!("{}.orig", bank_path.display()));
    assert_eq!(std::fs::read(&orig_path).unwrap(), original);
    apply_bank_file(
        &bank_path,
        &[SampleEdit {
            name: "vo_01_p01_words_002_02".to_string(),
            n_samples: 12,
        }],
    )
    .unwrap();
    assert_eq!(std::fs::read(&orig_path).unwrap(), original);
    assert_eq!(parse_bank(&std::fs::read(&bank_path).unwrap()).unwrap().cues[0].n_samples, 12);
    let _ = std::fs::remove_dir_all(&dir);
}

fn assert_amuro_bank_round_trip(bank_before: &[u8], audio_before: &[u8]) {
    let parsed = parse_bank(bank_before).unwrap();
    assert_eq!(parsed.cues.len(), 753);
    let cue = parsed
        .cues
        .iter()
        .find(|cue| cue.name == "vo_01_p01_words_002_02")
        .unwrap();
    assert_eq!(cue.n_samples, 47824);
    assert!(cue.has_clock);
    let mut patched = bank_before.to_vec();
    set_n_samples(&mut patched, &cue.name, cue.n_samples + 1).unwrap();
    let diffs = differing_offsets(bank_before, &patched);
    assert!(diffs.len() >= 1 && diffs.len() <= 4, "{diffs:?}");
    assert_eq!(
        section_directory(bank_before).unwrap(),
        section_directory(&patched).unwrap()
    );
    // Vanilla BNSF sfmt total samples equal the bank clock, so nothing changes.
    let (synced, report) = sync_bank(bank_before, audio_before).unwrap();
    assert_eq!(synced, bank_before);
    assert!(report.updated.is_empty());
    assert!(report.skipped.is_empty(), "{:?}", report.skipped);
    assert!(report.unchanged.iter().any(|name| name == "vo_01_p01_words_002_02"));
}

#[test]
fn real_copy_round_trip_leaves_source_copies_unchanged() {
    let Ok(audio_copy) = std::env::var("PILOT_VOICE_AUDIO_COPY") else {
        return;
    };
    let audio_before = std::fs::read(&audio_copy).unwrap();
    if let Ok(bank_copy) = std::env::var("PILOT_VOICE_BANK_COPY") {
        let bank_before = std::fs::read(&bank_copy).unwrap();
        assert_amuro_bank_round_trip(&bank_before, &audio_before);
        assert_eq!(std::fs::read(&bank_copy).unwrap(), bank_before);
    }
    if let Ok(pack_copy) = std::env::var("PILOT_VOICE_PACK_COPY") {
        let pack_before = std::fs::read(&pack_copy).unwrap();
        let extracted = extract_fhm2d_to_memory_impl(
            &pack_before,
            "0x87D4809B.fhm2d",
            Some(Fhm2dFormat::Sound),
        )
        .unwrap();
        let bank = extracted
            .files
            .iter()
            .find(|file| file.data.starts_with(b"NUS3"))
            .expect("sound extract produced no nus3bank");
        assert_amuro_bank_round_trip(&bank.data, &audio_before);
        assert_eq!(std::fs::read(&pack_copy).unwrap(), pack_before);
    }
    assert_eq!(std::fs::read(&audio_copy).unwrap(), audio_before);
}
