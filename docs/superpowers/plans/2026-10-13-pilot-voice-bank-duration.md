# Pilot Voice Bank Duration Editor

> **For agentic workers:** Implement in phase order. Every task is test-first: write the failing test, run it, then write the implementation that makes that test pass. Do not start the next task while the current test is still red. MSC fast-path rules do not apply; this is a format editor, not an `X.c` change.

**Goal:** In EXVS Mod Project's Test Editor, let the user set the playback length of an existing pilot-voice cue by editing `n_samples` on that cue's `.nus3bank` TONE clock. The user can type the number, or generate it from a same-named track inside a `.nus3audio` they already saved with EXVS2 Audio Editor.

**Research basis:** [sys58-pilot-voice-vs-se](../../msc-research/sys58-pilot-voice-vs-se.md) and [exvs2-audio-voice-bgm-indexing](../../exvs2-audio-voice-bgm-indexing.md).

The game reads the waveform using the bank clock `48000, channels = 1, n_samples, loopStart, loopEnd, loopFlag`. The speech bytes live in the sibling `.nus3audio`, not in the bank `PACK`. Amuro `VO_0001_P01_0_01_ST_01.nus3bank` is 319384 bytes: `TONE` is 254164 of that, `PACK` is 8936 and is a short RIFF stub. Replacing a longer or shorter waveform without updating `n_samples` is what walks off the buffer.

**Architecture:**

```text
Test Editor  Pilot Voice Table (already shipped)
  vrtbl row: voiceStem + bankPackage
        |
        v  Init (per stem, not one global pack)
  dplcache/0x{bankPackage}.fhm2d
        -> workspace/091waveform/voice/pilot/{stem}/
             VO_....nus3bank
        |
        v  this editor
  format/pilot_voice_bank.rs
    read cue clocks
    set n_samples inside that cue's own clock
    sync from nus3audio tracks with the same name
        |
        v  existing FHM2D repack
  data/x64/mod/0x{bankPackage}.fhm2d

EXVS2 Audio Editor stays outside this repo.
  It only replaces bytes inside the loose .nus3audio.
  This editor never writes that file.
```

**Tech stack:** Rust in `src-tauri` (debug `cargo test`, then `cargo check --lib --bins`), React + the existing Test Editor workbench, Vitest for the pure document helpers, i18n keys in the `test-lists` namespace.

**Status:** Not started.

---

## Decisions already made

- The bank editor lives in this repository. EXVS2 Audio Editor keeps waveform replace. Do not port its BNSF encoder, TONE rewriter, or Add+Save path into this repo. That path already corrupts TONE name slots on BGM banks (`docs/exvs2-audio-voice-bgm-indexing.md`).
- One `.nus3bank` per voice stem. The pack hash is `vrtbl.bankPackage` for that stem (Amuro `VO_0001_P01_0` is `0x87D4809B`). Do not add one content-catalog row per pilot.
- v1 writes `n_samples` only. `loopStart`, `loopEnd`, and `loopFlag` stay as they were on disk and are shown read-only.
- Generate matches track names. It does not add, remove, or rename cues.
- `.kpkp`, `.vot`, and cue-name CRC are out of this editor. Lipsync length is a separate later job.

## Non-goals

- No waveform preview, trim, or encode.
- No edits to `PROP`, `GRP`, `DTON`, `JUNK`, or `PACK` bytes.
- No new cue, no deleted cue, no renamed cue.
- No dependency on the `nus3audio` crate or on the Audio Editor tree.
- No game file, bank, or audio committed as a fixture. Tests build bytes.
- No `--release` build.

---

## UI

New Test Editor page **Pilot Voice Bank**, beside Pilot Voice Table. Same workbench chrome as that page: Save, Reload, loaded path, writable vs read-only, legacy-folder notice.

### Guide strip (always visible above the cue table)

Three steps, plain text, not a wizard that hides the table:

1. **Edit the wave in EXVS2 Audio Editor.** Open the loose file shown in the path line (`091waveform/voice/pilot/vo_XXXX/VO_...._01_ST_01.nus3audio`). Replace the track. Keep the track name. Save there. This page does not edit that file.
2. **Bring the length back.** Type `n_samples`, or press **Generate from nus3audio** and pick that saved file.
3. **Save this bank**, then repack the pack with the existing FHM2D repack so `mod/0x{bankPackage}.fhm2d` is what the game loads.

A short second line states the failure the user is avoiding: if the wave length changes and `n_samples` stays at the old value, the game reads off the end of the wave.

Buttons:

| Control | Behavior |
|---|---|
| Stem list | Rows from the workspace `vrtbl`: stem, `bankPackage`, "not initialized" / file name. Selecting a stem loads its bank if the workspace folder exists. |
| Init | Extracts `dplcache/0x{bankPackage}.fhm2d` into the workspace folder for that stem. Disabled when `bankPackage` is 0. |
| Cue table | Name (read-only), seconds (read-only, `n_samples / 48000`), `n_samples` (number input), loop start / end / flag (read-only). |
| Generate from nus3audio | File picker. Default directory is the derived audio path's folder. Applies the report below. |
| Save | Writes the `.nus3bank` in the workspace folder. Does not repack by itself. |

Generate report, shown under the strip after a run:

- updated: cue name, old `n_samples`, new `n_samples`
- unchanged: names already equal
- bank cue with no audio track
- audio track with no bank cue
- skipped: track present but not 48000 Hz PCM WAV

Nothing is written until the user presses Save. Generate only updates the in-memory table. Rows whose `n_samples` differ from the loaded file are marked dirty.

Seconds display uses one decimal. The stored value is the integer `n_samples`.

### Empty and error states

- No Pilot Voice Table in the workspace: the stem list is empty and the strip says to init Pilot Voice Table first.
- Stem selected, bank not initialized: cue table hidden, Init is the only action.
- Cue whose TONE block has no `48000 / 1` clock: that row is read-only and listed as "no clock".
- Save is disabled while the document is clean or the folder is not writable.

---

## Init

Pilot Voice Table is the index. This page does not invent pack hashes.

```text
workspace vrtbl row
  voiceStem     VO_0001_P01_0
  bankPackage   0x87D4809B
        |
        v
source  {dplCacheDir}\0x87D4809B.fhm2d
        |
        v  existing ExtractFHMData, sound pack type
workspace  {workspace}/091waveform/voice/pilot/VO_0001_P01_0/
             VO_0001_P01_0_01_ST_01.nus3bank
             *_structure.json
```

The audio path shown in the guide is the path `derive_pilot_voice_source` already builds:

```text
091waveform/voice/pilot/vo_0001/VO_0001_P01_0_01_ST_01.nus3audio
```

That file stays where the game streams it (loose under `data/x64`, or wherever the user edited a copy). Init does not copy it into the workspace.

Repack uses the existing pack action on `091waveform/voice/pilot/VO_0001_P01_0` and writes `mod/0x87D4809B.fhm2d`. The hash folder name is the `bankPackage`, not a new id.

Add a workspace route `unit.waveform` with prefix `091waveform` if no current route has that prefix. Do not drop these packs under `090sound`.

---

## Sync rules

Name match is ASCII case-insensitive exact equality after trim. `vo_01_p01_words_002_02` matches `VO_01_P01_WORDS_002_02`. A different suffix does not match.

For each matched pair:

1. Read the nus3audio track payload.
2. Require a RIFF/WAVE payload, PCM (`format` tag 1), 16-bit, **48000 Hz**.
3. `n_samples = dataChunkBytes / blockAlign`. For 16-bit mono that is `dataChunkBytes / 2`.
4. Write that integer into the clock that belongs to **that cue's TONE block**, not the first `48000` in the file.

Refuse, and leave the bank cue untouched, when:

- the payload is not PCM WAV
- the sample rate is not 48000
- `blockAlign` is 0 or does not divide the data size
- the cue has no clock marker inside its own TONE span
- the computed count does not fit in `i32`

Unmatched names are reported and not created. Generate never changes cue count, cue order, names, or loop fields.

Manual edit accepts a base-10 integer `1..=i32::MAX` and writes the same four bytes. `0` and negative values are rejected. Empty input does not commit.

---

## TDD

From `src-tauri/`, debug only:

```text
cargo test --test pilot_voice_bank_format_test
cargo check --lib --bins
```

Frontend, after the Rust API is green:

```text
pnpm exec vitest run src/page/TestEditor/components/pilot-voice-bank
```

Each task below starts by adding the named test and watching it fail for the missing behavior, then implements only that behavior.

Fixtures are built in the test. Do not read `E:\OBHK0.3_v27` or `E:\XB` from a test.

### Phase 1 — clock read and write

**Files:** Create `src-tauri/src/format/pilot_voice_bank.rs`, `src-tauri/tests/pilot_voice_bank_format_test.rs`. Register the module in `src-tauri/src/format/mod.rs`.

- [ ] **Red** `reads_n_samples_from_the_cue_clock`: a hand-built NUS3 with one TONE cue named `vo_01_p01_words_002_02`, clock bytes `48000, 1, 47824, 0, 0, 0`, and a 16-byte PACK stub. Parse returns that name and `n_samples == 47824`. Loop fields are 0.
- [ ] **Red** `set_n_samples_changes_only_those_four_bytes`: set `60000`. The file length is unchanged. The only differing bytes are the `n_samples` i32. Name, loop triple, and PACK bytes match.
- [ ] **Red** `second_cue_clock_is_not_the_first_marker`: two cues, clocks 1000 and 2000. Setting the second cue does not change the first.
- [ ] **Red** `cue_without_a_clock_is_reported_and_not_patched`: a cue block with no `48000, 1` marker returns a structured error and the buffer is unchanged.
- [ ] **Red** `round_trip_keeps_section_order_and_sizes`: PROP, BINF, GRP, DTON, TONE, JUNK, PACK magics and sizes are unchanged after a sample write. (The fixture may use short dummy payloads for the sections other than TONE and PACK.)

Implementation notes for the green step:

- Locate the cue by the ASCII name inside its TONE block.
- The clock marker is the 8 bytes `80 BB 00 00 01 00 00 00` followed by four little-endian i32s: `n_samples`, `loopStart`, `loopEnd`, `loopFlag`.
- Search for that marker only between this cue's name and the next cue's name (or the end of TONE for the last cue).
- Do not reserialize the bank. Patch in place.

### Phase 2 — WAV sample count

**Files:** same Rust module.

- [ ] **Red** `wav_frame_count_16bit_mono_48k`: a hand-built PCM WAV, 48000 Hz, 1 channel, 16-bit, 48000 frames. Result is `48000`.
- [ ] **Red** `wav_frame_count_rejects_44100`: same WAV at 44100 Hz returns an error that names the rate. No number is returned.
- [ ] **Red** `wav_frame_count_rejects_non_pcm`: a payload that starts with `BNSF` returns an error.

`n_samples` is frames, not bytes and not interleaved samples. `frames = data_chunk_size / block_align`.

### Phase 3 — nus3audio name pairing

**Files:** same Rust module. A test helper writes a minimal NUS3 audio container with two named tracks. The reader only has to recover `(name, payload)` pairs from that layout: `NUS3`, a name section whose strings are the track names in order, and a `PACK` section whose blobs are the WAV bytes in the same order. Document the helper's layout in a comment above the helper so the production reader targets that layout and a real Audio Editor save. If a real save uses different padding, adjust the reader against one extra test that encodes that padding; do not relax the name match.

- [ ] **Red** `reads_two_named_wav_tracks`.
- [ ] **Red** `sync_updates_matching_name_only`: bank cues `Alpha` (100) and `Beta` (200). Audio has `alpha` with 300 frames and `gamma` with 400. After sync, Alpha is 300, Beta is 200. The report lists Alpha as updated, Beta as bank-only, gamma as audio-only.
- [ ] **Red** `sync_skips_44100_track`: the matched track is 44100. The bank cue stays at its old `n_samples`. The report lists it as skipped.
- [ ] **Red** `sync_does_not_change_cue_count`.

`sync` returns a report struct and a new bank buffer. It does not touch the filesystem.

### Phase 4 — manual value

- [ ] **Red** `set_n_samples_rejects_zero_and_negative`.
- [ ] **Red** `set_n_samples_accepts_one`.

The command boundary uses this function. The UI does not invent a second range check.

### Phase 5 — Tauri commands

**Files:** `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`.

- [ ] `parse_pilot_voice_bank(filePath) -> { cues: [{ name, nSamples, loopStart, loopEnd, loopFlag, seconds }] }`
- [ ] `apply_pilot_voice_bank_samples(filePath, edits: [{ name, nSamples }])` writes the workspace file and returns the parsed document. Creates the same sibling backup pattern `pilot_voice_resource` uses (`backup_orig`), once.
- [ ] `sync_pilot_voice_bank_from_audio(bankPath, audioPath) -> { document, report }` reads both files, applies the Phase 3 report onto the in-memory document, and does **not** write until `apply_...` is called. The command used by Generate returns the report plus the unsaved document. Save is a separate call.

Tests for the commands can call the format functions directly. A thin command test is enough to prove Generate does not write: run sync against temp copies and compare the bank bytes.

### Phase 6 — workspace init

**Files:** `src/services/testEditorWorkspace/defaults.ts` (route `unit.waveform`, prefix `091waveform`), `src/page/TestEditor/components/pilot-voice-bank/initPilotVoiceBank.ts`.

- [ ] **Red** Vitest: given stem `VO_0001_P01_0` and `bankPackage` `0x87D4809B`, the source path is `{dplCache}\0x87D4809B.fhm2d` and the workspace folder is `{workspace}/091waveform/voice/pilot/VO_0001_P01_0`.
- [ ] **Red** Vitest: `bankPackage` 0 throws before any extract call.
- [ ] Init calls the existing `ExtractFHMData` with the sound pack type. Do not add a second unpacker. If that type refuses a waveform pack, stop and report the extractor error; do not silently switch types inside the UI.

### Phase 7 — page

**Files:**

- `src/page/TestEditor/components/pilot-voice-bank/PilotVoiceBankView.tsx`
- `src/page/TestEditor/components/pilot-voice-bank/pilotVoiceBankDocument.ts`
- `src/page/TestEditor/components/pilot-voice-bank/pilotVoiceBankDocument.test.ts`
- i18n strings in the existing `test-lists` locale files (English and Chinese). Code and comments stay English. The guide strip is translated.

- [ ] **Red** `secondsFromSamples(47824)` is `1.0` when rounded to one decimal (`47824/48000 = 0.996`).
- [ ] **Red** `applySyncReport` replaces `n_samples` only for `updated` rows and leaves the others.
- [ ] **Red** a dirty row is one whose `n_samples` differs from the last loaded document.
- [ ] Mount the page on the Test Editor catalog entry **Pilot Voice Bank**. Stem list reads the already-parsed Pilot Voice Table; it does not parse `vrtbl` again in the browser.
- [ ] Guide strip copy matches the three steps in the UI section. Include the Audio Editor instruction and the crash sentence.
- [ ] Generate uses the Tauri dialog to pick a `.nus3audio`, then `sync_pilot_voice_bank_from_audio`. Save uses `apply_pilot_voice_bank_samples`.

### Phase 8 — check

- [ ] `cargo test --test pilot_voice_bank_format_test`
- [ ] `cargo check --lib --bins` with no warning from this crate
- [ ] `pnpm exec vitest run src/page/TestEditor/components/pilot-voice-bank`
- [ ] Open the page only if the user asks to run the app. Otherwise state that the click-path was not exercised.

In-game check, when the user runs it: one cue, one changed length, bank `n_samples` updated, audio saved from Audio Editor, pack repacked. The line plays to its new end and the process stays up. A mismatch (new wave, old `n_samples`) is the falsifier that still faults. Do not mix that check with a `.kpkp` edit.

---

## What the first green slice is

Phase 1 test `set_n_samples_changes_only_those_four_bytes`, then the manual number field wired to it. Generate (Phases 2–3) comes after manual edit works. Init (Phase 6) can proceed in parallel only after Phase 1 parse is green, because the page needs real cues to show.
