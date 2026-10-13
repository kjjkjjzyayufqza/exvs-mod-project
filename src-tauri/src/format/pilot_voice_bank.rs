//! In-place `n_samples` editor for a pilot-voice `.nus3bank` TONE clock.
//!
//! The waveform bytes stay in the sibling `.nus3audio`. This module never
//! reserializes the bank: it patches the four little-endian bytes that belong
//! to one cue's own `48000, channels = 1` clock.

use crate::format::raw_path_id::backup_orig;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const CLOCK_MARKER: &[u8] = &[0x80, 0xBB, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00];
const SAMPLE_RATE: i32 = 48_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PilotVoiceCue {
    pub name: String,
    pub n_samples: i32,
    pub loop_start: i32,
    pub loop_end: i32,
    pub loop_flag: i32,
    pub has_clock: bool,
    pub seconds: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PilotVoiceBankDocument {
    pub cues: Vec<PilotVoiceCue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleEdit {
    pub name: String,
    pub n_samples: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncUpdate {
    pub name: String,
    pub old_n_samples: i32,
    pub new_n_samples: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSkip {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub updated: Vec<SyncUpdate>,
    pub unchanged: Vec<String>,
    pub bank_only: Vec<String>,
    pub audio_only: Vec<String>,
    pub skipped: Vec<SyncSkip>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome {
    pub document: PilotVoiceBankDocument,
    pub report: SyncReport,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NusSection {
    pub magic: String,
    pub size: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CueSite {
    name: String,
    /// Absolute file offset of the `n_samples` i32. `None` when this cue's
    /// TONE span has no `48000 / 1` clock.
    samples_at: Option<usize>,
    n_samples: i32,
    loop_start: i32,
    loop_end: i32,
    loop_flag: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AudioTrack {
    pub name: String,
    pub payload: Vec<u8>,
}

pub fn section_directory(bytes: &[u8]) -> Result<Vec<NusSection>, String> {
    Ok(walk_bank_sections(bytes)?
        .into_iter()
        .map(|(magic, size, _, _)| NusSection {
            magic: String::from_utf8_lossy(&magic).into_owned(),
            size,
        })
        .collect())
}

pub fn parse_bank(bytes: &[u8]) -> Result<PilotVoiceBankDocument, String> {
    let sites = cue_sites(bytes)?;
    Ok(PilotVoiceBankDocument {
        cues: sites.into_iter().map(site_to_cue).collect(),
    })
}

pub fn set_n_samples(bytes: &mut [u8], name: &str, n_samples: i32) -> Result<(), String> {
    if n_samples <= 0 {
        return Err(format!(
            "n_samples {n_samples} is outside 1..={}",
            i32::MAX
        ));
    }
    let sites = cue_sites(bytes)?;
    let matches: Vec<&CueSite> = sites.iter().filter(|site| site.name == name).collect();
    let site = match matches.as_slice() {
        [site] => *site,
        [] => return Err(format!("cue not found: {name}")),
        _ => return Err(format!("duplicate cue name: {name}")),
    };
    let Some(at) = site.samples_at else {
        return Err(format!("no_clock: {name}"));
    };
    if at + 4 > bytes.len() {
        return Err(format!("no_clock: {name}"));
    }
    bytes[at..at + 4].copy_from_slice(&n_samples.to_le_bytes());
    Ok(())
}

pub fn wav_frame_count(payload: &[u8]) -> Result<i32, String> {
    if payload.starts_with(b"BNSF") {
        return Err("payload is BNSF, not PCM WAV".to_string());
    }
    if payload.len() < 12 || &payload[0..4] != b"RIFF" || &payload[8..12] != b"WAVE" {
        return Err("payload is not PCM WAV".to_string());
    }
    let mut fmt: Option<(u16, u32, u16, u16)> = None;
    let mut data_size: Option<u32> = None;
    let mut pos = 12usize;
    while pos + 8 <= payload.len() {
        let id = &payload[pos..pos + 4];
        let size = u32::from_le_bytes(payload[pos + 4..pos + 8].try_into().unwrap()) as usize;
        let body = pos + 8;
        if body + size > payload.len() {
            return Err("payload is not PCM WAV".to_string());
        }
        if id == b"fmt " && size >= 16 {
            let format = u16::from_le_bytes(payload[body..body + 2].try_into().unwrap());
            let rate = u32::from_le_bytes(payload[body + 4..body + 8].try_into().unwrap());
            let block_align = u16::from_le_bytes(payload[body + 12..body + 14].try_into().unwrap());
            let bits = u16::from_le_bytes(payload[body + 14..body + 16].try_into().unwrap());
            fmt = Some((format, rate, block_align, bits));
        } else if id == b"data" {
            data_size = Some(size as u32);
        }
        pos = body + size;
    }
    let Some((format, rate, block_align, bits)) = fmt else {
        return Err("payload is not PCM WAV".to_string());
    };
    if format != 1 || bits != 16 {
        return Err("payload is not PCM WAV".to_string());
    }
    if rate != SAMPLE_RATE as u32 {
        return Err(format!("sample rate {rate} is not 48000"));
    }
    let Some(data_size) = data_size else {
        return Err("payload is not PCM WAV".to_string());
    };
    if block_align == 0 || data_size % u32::from(block_align) != 0 {
        return Err("blockAlign is 0 or does not divide the data size".to_string());
    }
    let frames = data_size / u32::from(block_align);
    i32::try_from(frames).map_err(|_| format!("frame count {frames} does not fit in i32"))
}

/// OB `.nus3audio` (`AUDIINDX`) track reader.
///
/// Layout, matching a game file and an Audio Editor save that keeps it:
/// `NUS3`, u32 size, `AUDIINDX`, u32 version, u32 track count, then sections
/// `TNID`, `NMOF`, `ADOF`, `TNNM`, `JUNK`, `PACK`. `NMOF` entries are absolute
/// file offsets of NUL-terminated track names. `ADOF` entries are
/// `(absolute file offset, byte size)` pairs, in the same order as the names.
/// The bytes those pairs point at live in `PACK`.
pub fn read_audio_tracks(bytes: &[u8]) -> Result<Vec<AudioTrack>, String> {
    if bytes.len() < 24 || &bytes[0..4] != b"NUS3" || &bytes[8..16] != b"AUDIINDX" {
        return Err("not an AUDIINDX nus3audio".to_string());
    }
    let count = u32::from_le_bytes(bytes[0x14..0x18].try_into().unwrap()) as usize;
    let mut sections = Vec::new();
    let mut pos = 0x18usize;
    while pos + 8 <= bytes.len() {
        let magic = bytes[pos..pos + 4].to_vec();
        let size = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap()) as usize;
        let body = pos + 8;
        if body + size > bytes.len() {
            return Err("nus3audio section exceeds the file".to_string());
        }
        sections.push((magic, body, size));
        pos = body + size;
        if magic_is(&sections.last().unwrap().0, b"PACK") {
            break;
        }
    }
    let nmof = audio_section(bytes, &sections, b"NMOF")?;
    let adof = audio_section(bytes, &sections, b"ADOF")?;
    if nmof.len() != count * 4 {
        return Err(format!(
            "NMOF size {} does not match track count {count}",
            nmof.len()
        ));
    }
    if adof.len() != count * 8 {
        return Err(format!(
            "ADOF size {} does not match track count {count}",
            adof.len()
        ));
    }
    let mut tracks = Vec::with_capacity(count);
    for index in 0..count {
        let name_at = u32::from_le_bytes(nmof[index * 4..index * 4 + 4].try_into().unwrap()) as usize;
        if name_at >= bytes.len() {
            return Err(format!("track {index} name offset is outside the file"));
        }
        let end = bytes[name_at..]
            .iter()
            .position(|byte| *byte == 0)
            .map(|rel| name_at + rel)
            .unwrap_or(bytes.len());
        let name = String::from_utf8_lossy(&bytes[name_at..end])
            .trim()
            .to_string();
        let audio_at =
            u32::from_le_bytes(adof[index * 8..index * 8 + 4].try_into().unwrap()) as usize;
        let audio_size =
            u32::from_le_bytes(adof[index * 8 + 4..index * 8 + 8].try_into().unwrap()) as usize;
        if audio_at.checked_add(audio_size).map(|end| end > bytes.len()).unwrap_or(true) {
            return Err(format!("track {index} audio span is outside the file"));
        }
        tracks.push(AudioTrack {
            name,
            payload: bytes[audio_at..audio_at + audio_size].to_vec(),
        });
    }
    Ok(tracks)
}

pub fn sync_bank(bank: &[u8], audio: &[u8]) -> Result<(Vec<u8>, SyncReport), String> {
    let sites = cue_sites(bank)?;
    let tracks = read_audio_tracks(audio)?;
    let mut used = vec![false; tracks.len()];
    let mut out = bank.to_vec();
    let mut report = SyncReport {
        updated: Vec::new(),
        unchanged: Vec::new(),
        bank_only: Vec::new(),
        audio_only: Vec::new(),
        skipped: Vec::new(),
    };
    for site in &sites {
        let track_index = tracks.iter().enumerate().position(|(index, track)| {
            !used[index] && names_match(&site.name, &track.name)
        });
        let Some(track_index) = track_index else {
            report.bank_only.push(site.name.clone());
            continue;
        };
        used[track_index] = true;
        if site.samples_at.is_none() {
            report.skipped.push(SyncSkip {
                name: site.name.clone(),
                reason: format!("no_clock: {}", site.name),
            });
            continue;
        }
        let frames = match wav_frame_count(&tracks[track_index].payload) {
            Ok(frames) => frames,
            Err(reason) => {
                report.skipped.push(SyncSkip {
                    name: site.name.clone(),
                    reason,
                });
                continue;
            }
        };
        if frames == site.n_samples {
            report.unchanged.push(site.name.clone());
            continue;
        }
        set_n_samples(&mut out, &site.name, frames)?;
        report.updated.push(SyncUpdate {
            name: site.name.clone(),
            old_n_samples: site.n_samples,
            new_n_samples: frames,
        });
    }
    for (index, track) in tracks.iter().enumerate() {
        if !used[index] {
            report.audio_only.push(track.name.clone());
        }
    }
    let after = cue_sites(&out)?;
    if after.len() != sites.len()
        || after
            .iter()
            .zip(&sites)
            .any(|(next, prev)| next.name != prev.name)
    {
        return Err("sync changed the cue list".to_string());
    }
    Ok((out, report))
}

pub fn parse_bank_file(path: &Path) -> Result<PilotVoiceBankDocument, String> {
    let bytes = fs::read(path).map_err(|err| format!("Failed to read {}: {err}", path.display()))?;
    parse_bank(&bytes)
}

pub fn apply_bank_file(path: &Path, edits: &[SampleEdit]) -> Result<PilotVoiceBankDocument, String> {
    let original =
        fs::read(path).map_err(|err| format!("Failed to read {}: {err}", path.display()))?;
    let mut bytes = original.clone();
    for edit in edits {
        set_n_samples(&mut bytes, &edit.name, edit.n_samples)?;
    }
    if bytes != original {
        backup_orig(path)?;
        fs::write(path, &bytes)
            .map_err(|err| format!("Failed to write {}: {err}", path.display()))?;
    }
    parse_bank(&bytes)
}

pub fn sync_bank_files(bank_path: &Path, audio_path: &Path) -> Result<SyncOutcome, String> {
    let bank = fs::read(bank_path)
        .map_err(|err| format!("Failed to read {}: {err}", bank_path.display()))?;
    let audio = fs::read(audio_path)
        .map_err(|err| format!("Failed to read {}: {err}", audio_path.display()))?;
    let before = fs::read(bank_path)
        .map_err(|err| format!("Failed to read {}: {err}", bank_path.display()))?;
    let (bytes, report) = sync_bank(&bank, &audio)?;
    let after = fs::read(bank_path)
        .map_err(|err| format!("Failed to read {}: {err}", bank_path.display()))?;
    if before != after {
        return Err("sync wrote the bank file".to_string());
    }
    Ok(SyncOutcome {
        document: parse_bank(&bytes)?,
        report,
    })
}

fn site_to_cue(site: CueSite) -> PilotVoiceCue {
    PilotVoiceCue {
        seconds: if site.samples_at.is_some() {
            f64::from(site.n_samples) / f64::from(SAMPLE_RATE)
        } else {
            0.0
        },
        name: site.name,
        n_samples: site.n_samples,
        loop_start: site.loop_start,
        loop_end: site.loop_end,
        loop_flag: site.loop_flag,
        has_clock: site.samples_at.is_some(),
    }
}

fn names_match(bank_name: &str, audio_name: &str) -> bool {
    bank_name.trim().eq_ignore_ascii_case(audio_name.trim())
}

fn cue_sites(bytes: &[u8]) -> Result<Vec<CueSite>, String> {
    let sections = walk_bank_sections(bytes)?;
    let (payload_at, tone) = sections
        .iter()
        .find(|(magic, _, _, _)| magic_is(magic, b"TONE"))
        .map(|(_, _, at, tone)| (*at, tone.as_slice()))
        .ok_or_else(|| "nus3bank has no TONE section".to_string())?;
    let names = cue_names(tone);
    let mut sites = Vec::with_capacity(names.len());
    for (index, (name_at, name)) in names.iter().enumerate() {
        let span_end = names
            .get(index + 1)
            .map(|(next, _)| *next)
            .unwrap_or(tone.len());
        let search_from = *name_at + name.len();
        let clock_rel = find_subslice(&tone[search_from..span_end], CLOCK_MARKER)
            .map(|rel| search_from + rel);
        let (samples_at, n_samples, loop_start, loop_end, loop_flag) = match clock_rel {
            Some(rel) if rel + 24 <= span_end => {
                let base = rel + CLOCK_MARKER.len();
                (
                    Some(payload_at + base),
                    read_i32(&tone[base..base + 4]),
                    read_i32(&tone[base + 4..base + 8]),
                    read_i32(&tone[base + 8..base + 12]),
                    read_i32(&tone[base + 12..base + 16]),
                )
            }
            _ => (None, 0, 0, 0, 0),
        };
        sites.push(CueSite {
            name: name.clone(),
            samples_at,
            n_samples,
            loop_start,
            loop_end,
            loop_flag,
        });
    }
    Ok(sites)
}

fn cue_names(tone: &[u8]) -> Vec<(usize, String)> {
    let mut names = Vec::new();
    let mut index = 0usize;
    while index < tone.len() {
        if tone[index].is_ascii_alphabetic() {
            let mut end = index + 1;
            while end < tone.len()
                && (tone[end].is_ascii_alphanumeric() || tone[end] == b'_')
            {
                end += 1;
            }
            if end < tone.len() && tone[end] == 0 && end - index >= 4 {
                let name = String::from_utf8_lossy(&tone[index..end]).into_owned();
                names.push((index, name));
                index = end + 1;
                continue;
            }
        }
        index += 1;
    }
    names
}

fn walk_bank_sections(bytes: &[u8]) -> Result<Vec<(Vec<u8>, u32, usize, Vec<u8>)>, String> {
    if bytes.len() < 0x18 || &bytes[0..4] != b"NUS3" || &bytes[8..12] != b"BANK" {
        return Err("not a NUS3 BANK".to_string());
    }
    let toc_size = u32::from_le_bytes(bytes[0x10..0x14].try_into().unwrap()) as usize;
    let count = u32::from_le_bytes(bytes[0x14..0x18].try_into().unwrap()) as usize;
    let toc_bytes = toc_size.checked_sub(4).ok_or_else(|| "BANK TOC is too small".to_string())?;
    if toc_bytes != count * 8 {
        return Err(format!(
            "BANK TOC size {toc_size} does not match {count} sections"
        ));
    }
    let sections_at = 0x14 + toc_size;
    if 0x18 + toc_bytes > bytes.len() || sections_at > bytes.len() {
        return Err("BANK TOC exceeds the file".to_string());
    }
    let mut described = Vec::with_capacity(count);
    for index in 0..count {
        let at = 0x18 + index * 8;
        let magic = bytes[at..at + 4].to_vec();
        let size = u32::from_le_bytes(bytes[at + 4..at + 8].try_into().unwrap());
        described.push((magic, size));
    }
    let mut cursor = sections_at;
    let mut sections = Vec::with_capacity(count);
    for (magic, size) in described {
        if cursor + 8 + size as usize > bytes.len() {
            return Err(format!(
                "section {} exceeds the file",
                String::from_utf8_lossy(&magic)
            ));
        }
        let on_disk_magic = bytes[cursor..cursor + 4].to_vec();
        if on_disk_magic != magic {
            return Err(format!(
                "section magic {} does not match the TOC entry {}",
                String::from_utf8_lossy(&on_disk_magic),
                String::from_utf8_lossy(&magic)
            ));
        }
        let payload_at = cursor + 8;
        let payload = bytes[payload_at..payload_at + size as usize].to_vec();
        sections.push((magic, size, payload_at, payload));
        cursor = payload_at + size as usize;
    }
    Ok(sections)
}

fn audio_section<'a>(
    bytes: &'a [u8],
    sections: &[(Vec<u8>, usize, usize)],
    magic: &[u8; 4],
) -> Result<&'a [u8], String> {
    let (_, body, size) = sections
        .iter()
        .find(|(found, _, _)| magic_is(found, magic))
        .ok_or_else(|| format!("nus3audio is missing {}", String::from_utf8_lossy(magic)))?;
    Ok(&bytes[*body..*body + *size])
}

fn magic_is(magic: &[u8], expected: &[u8; 4]) -> bool {
    magic == expected
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}

fn read_i32(bytes: &[u8]) -> i32 {
    i32::from_le_bytes(bytes.try_into().unwrap())
}
