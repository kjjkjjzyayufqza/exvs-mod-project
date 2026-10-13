# `sys_58`: character SE vs pilot voice, and the `.kpkp` lipsync track

**Date:** 2026-10-13
**Status:** E2 script-to-table join for the `sys_58` split (five unit `2.c` files, every `0x9` immediate is a pilot `.vot` situation id, no other subcommand's immediate is). KPKP layout and the ~20 Hz viseme ratio are E1 (plaintext vs2 files plus the matching nus3bank sample clock). The crash site for a too-long or too-short replacement is E1 structural; it was not re-probed in game this session. `sub_140685A90` was not decompiled here.
**Kind:** MSC depiction syscall / pilot voice resource
**Primary trees:**

- MSC corpus: `E:\XB\mod\040msc` (613 unit `2.c` files). Historical XB decompiles. The syscall id itself is anchored on OB by [exvs-msc-syscall-handler-table](../exvs-msc-syscall-handler-table.md): `sys_58` is `CDepictionScript` slot 92, handler `sub_140685A90`.
- Plaintext names and tables: `E:\XB\解包\vs2\x64` (`090sound`, `091waveform`, `060navi`). Comparison only.
- OB waveforms: `E:\OBHK0.3_v27\data\x64\091waveform\voice\pilot`.

**Related:**

- Voice pack routing (character list, vrtbl, vot, nus3): [exvs2-audio-voice-bgm-indexing](../exvs2-audio-voice-bgm-indexing.md)
- In-game bind of `VO_1000` onto `900000004`: [2026-08-23-custom-pilot-voice-vo-1000](../agent-sessions/2026-08-23-custom-pilot-voice-vo-1000.md)
- NUS3 key-on / TONE sample clock (OB exe): `E:\research\EXVS2-Audio-Editor\docs\NUS3BANK_OB_EXE_Runtime_Analysis.md`
- Empty-click SE latch, a different `sys_58` bug: [wing-zero-rebellion-empty-front-back-sub-se](./wing-zero-rebellion-empty-front-back-sub-se.md)

---

## Result

Character sound effects and pilot speech are both `sys_58` in `2.c`. They are different subcommands.

| Call | Second argument | Role |
|---|---|---|
| `sys_58(0, hash)`, also `0x1`, `0x3`, `0x4`, `0x6` | character SE cue hash | weapon and action sound effects |
| `sys_58(0x9, situationId)` | global pilot-voice situation id | pilot speech for the current unit's voice pack |
| `sys_58(0x2)` | none | clear the sound started on enter. Seen on Hyaku Shiki release (`func_465`, `func_876`) with no hash |

MSC never passes a cue-name CRC such as `CRC32("VO_01_P01_CHARA_SELECT_01")`. It requests a situation. The unit's `.vot` maps that situation onto one or more cues in that pilot's bank.

`.kpkp` is real. It is the lipsync track beside the `.vot`, not a whitelist of how long a line may play. Playback length is the waveform's sample count. A line that is longer or shorter than the lengths stored next to it crashes because the decoder still reads the old span.

---

## How a pilot line is selected

This chain was already specified in the audio index. Restated here so the MSC call has a destination.

```text
character_list field 0x3573AED2
  = CRC32("VO_%04d_P%02d_%d")          pilotVoiceResourceKey
  -> pilotvoiceresourcetable.vrtbl     090sound pack 0x8C428AF2, child 3
       votPackage / bankPackage / streamPathId
  -> 090sound/voicetable/<stem>.vot    situationId -> cueId
  -> 091waveform/voice/pilot/<stem>_st .nus3bank cue metadata
  -> 091waveform/voice/pilot/<stem>/..._ST_01.nus3audio
```

`cueId == CRC32(uppercase cue name)`. Bank strings are lowercase. Example, Amuro: `0xCA143FC8 == CRC32("VO_01_P01_CHARA_SELECT_01")`, bank string `vo_01_p01_chara_select_01`. That cue id is present in `vo_0001_p01_0_01.vot` and is absent from Gundam's `2.c`.

`situationId` is one global enum shared by every pilot `.vot`. Counted on the vs2 plaintext set (199 `.vot` files): **292 distinct situation ids**. Amuro `vo_0001_p01_0_01.vot` has 103. All 103 also appear in `vo_0016_p01_0_01.vot` (176). The same `sys_58(0x9, id)` in two units plays each unit's own cue for that situation. Editors must copy situation ids from a donor `.vot`. Inventing one does not name a line.

Which pilot pack a unit uses is `character_list`, not MSC. `VO_1000` bound to `900000004` played in game on 2026-08-23. That confirms the pack chain. It does not by itself prove the `sys_58(0x9)` subcommand.

Navi is a third pack: `060navi/voicetable` plus `060navi/lipsync` (43 `.kpkp` files on vs2, names like `vo_0001_n02_0_01.kpkp`). This note does not trace the navi syscall.

---

## Evidence that `0x9` is the voice situation

Across `E:\XB\mod\040msc`, 613 `2.c` files contain about 70513 `sys_58` calls. First-argument tallies: `0` 29181, `0x9` 23970, `0x2` 9327, `0x1` 4157, `0x6` 2066, `0x4` 840, `0x5` 614, `0x3` 358. Those tallies mix one-argument and two-argument forms. The split below uses only two-argument calls whose second immediate was joined to the 292 situation ids.

| Unit `2.c` | `0` | `0x1` | `0x3` | `0x4` | `0x6` | `0x9` |
|---|---:|---:|---:|---:|---:|---:|
| `001gundam_001gundam_001` | 0/64 | 0/1 |  |  | 0/2 | **59/59** |
| `002zgundm_002hyaksk_001` | 0/55 | 0/5 |  |  | 0/7 | **68/68** |
| `016gundmw_001wgzero_001` | 0/69 | 0/5 | 0/1 |  | 0/7 | **71/71** |
| `015gndmuc_008faunig_001` | 0/30 | 0/6 | 0/3 | 0/1 | 0/11 | **31/31** |
| `wing_gundam_zero_rebellion_msc` | 0/72 | 0/10 | 0/5 |  | 0/8 | **79/79** |

Each cell is `situation hits / two-arg calls`. Subcommand `0x9` is 308/308. Every other subcommand in the table is 0.

Gundam main shot, when the weapon still has ammo, requests the situation and then fires the bullet. `0x4C9A9D5B` is an Amuro `.vot` situation id, not an SE cue name.

```c
void func_918()
{
    if (sys_0(0x90000, 0, 0) != 0)
    {
        func_123(0x3a4);
        sys_58(0x9, 0x4c9a9d5b);
    }
    func_123(0xc00000);
    sys_4F(0, 0, 0x93459d29);
    global29 = global29 | 0x10000;
}
```

`sys_58(0x2)` on Hyaku Shiki is the hashless form, on the transform-release path (`func_465` after the pose returns, and `func_876` on the exit slot) before a later `sys_58(0, 0x497D765D)`. Treat `0x2` as "clear", not as another voice channel. The native handler was not opened this session, so the clear behaviour is the call pattern (E1), not a decompiled subcommand name.

Older unit notes that gloss `sys_58(0x1/0x6/0x9, hash)` as one "sound / SE" bucket are mixing the two. `0x9` is the situation. `0`, `0x1`, `0x3`, `0x4`, and `0x6` are SE channels. This note does not assign a separate English name to each SE channel.

---

## `.vot` does not store duration

`090sound/voicetable/<stem>.vot`, version 1. Amuro `vo_0001_p01_0_01.vot` is 19400 bytes, `selfId = 0x7E80801E`, 103 situations, 242 cue refs, 238 unique cue ids.

```text
0x00  u32 version = 1
0x04  u32 selfId = CRC32(filename without extension, lowercase)
0x08  u32 0x20
0x0C  u32 cueRegionEnd
0x10  u32 tailOffset
0x20  u32 situationCount
0x30  situation[situationCount] x 0x38:
        +0x00 u32 situationId
        +0x0C u32 volumePercent     constant 100 in the sampled file
        +0x10 u32 param50           constant 50
        +0x14 u32 param100          constant 100
        +0x30 u32 cueCount
        +0x34 u32 cueListOffset
      cueEntry x 8: { u32 cueId, u32 flags }
```

Invariant: `0x30 + situationCount * 0x38` equals the first `cueListOffset`, and that offset plus `totalCues * 8` equals `cueRegionEnd`.

There is no sample count, no milliseconds, and no frame count in the cue entry. The list chooses the cue. It does not cap playback.

---

## `.kpkp` lipsync layout

vs2 path: `090sound/lipsync/<same stem as the vot>.kpkp`. 199 files, one per pilot voice stem. Magic is ASCII `KPKP` (`u32` `0x504B504B`). This is not the NUS3 key-on fourcc `kyon`, and it is not the GVS sprite-frame kind that this repository also labels `kpkp`.

Amuro `vo_0001_p01_0_01.kpkp` is 5088 bytes.

```text
0x00  u32 magic = 0x504B504B     "KPKP"
0x04  u32 count                  53
0x08  u32 stride = 0x10
0x0C  u32 0
0x10  entry[count]:
        +0x00 u32 id             CRC32(uppercase cue name) for 46 of 53
        +0x04 u32 payloadOffset  first payload at 0x360 = 16 + 53*16
        +0x08 u32 payloadSize
        +0x0C u32 0
payload:
        u32 0x004B504B           bytes 4B 50 4B 00, "KPK\0"
        u32 visemeCount
        u8  viseme[visemeCount]  each byte is 0, 1, or 2
        pad to 4 bytes
```

Checked against payload sizes: count `0x44` (68) sits in a 76-byte payload (`8 + 68`). Count `0x25` (37) sits in a 48-byte payload (`8 + 37`, padded to 48). Count `0x14` (20) sits in a 28-byte payload with no spare bytes.

The bank `vo_0001_p01_0_01_st_01.nus3bank` is 319384 bytes and contains 753 `vo_01_p01_*` cue names and 753 TONE sample clocks (`48000, channels = 1, n_samples, ...`). Only 53 cues have a lipsync entry. The matched names are battle lines (`words_*`, `start_*`, `ta_words_*`, `ta_respawn_*`), not menu lines. `VO_01_P01_CHARA_SELECT_01` has a `.vot` cue and no `.kpkp` row.

Viseme count tracks the cue duration at about 20 shapes per second (`48000 / 20 = 2400` samples per shape). The grid is approximate, not an exact sample lock. `words_002_02` is 20 visemes and 47824 samples (1.00 s, 2400*20 would be 48000).

| Cue | Visemes | `n_samples` | Seconds | Visemes / second |
|---|---:|---:|---:|---:|
| `vo_01_p01_words_002_02` | 20 | 47824 | 1.00 | 20.0 |
| `vo_01_p01_targe_a_s_01` | 19 | 44080 | 0.92 | 20.7 |
| `vo_01_p01_start_03` | 52 | 124341 | 2.59 | 20.1 |
| `vo_01_p01_words_001_02` | 58 | 138011 | 2.88 | 20.1 |
| `vo_01_p01_words_001_03` | 60 | 143470 | 2.99 | 20.1 |
| `vo_01_p01_words_003_01` | 68 | 162183 | 3.38 | 20.1 |
| `vo_01_p01_ta_words_s_03` | 72 | 172224 | 3.59 | 20.1 |
| `vo_01_p01_ta_respawn_01` | 86 | 204208 | 4.25 | 20.2 |
| `vo_01_p01_words_s_01` | 96 | 228798 | 4.77 | 20.1 |
| `vo_01_p01_ta_words_s_17` | 100 | 239872 | 5.00 | 20.0 |
| `vo_01_p01_ta_words_s_13` | 119 | 284928 | 5.94 | 20.0 |

Cue-to-clock pairing was "the first `48000, 1` clock after that cue's name in the bank". The ratio staying on 20 across this set is why that pairing is treated as real. It is not an IDA field map of the TONE descriptor.

---

## Why a longer or shorter waveform crashes

Three stored lengths have to describe the same line. MSC does not hold any of them.

1. **`.nus3audio` offset table** (`ADOF` / `PACK`). One cue getting longer or shorter moves every later cue. Reading with the old offsets walks off this cue's bytes or into the next cue.
2. **`.nus3bank` TONE sample clock**: `48000, channels, n_samples, loopStart, loopEnd, loopFlag`. The engine seeks with `n_samples`. A clock left at the donor length seeks past a shorter replacement, or stops early and still disagrees with the container size. The audio editor already records that a cloned looping clock on a one-shot cue seeks past the real BNSF and plays silence; a broken TONE descriptor crashes in `nus3_decode_tone_descriptor` / `CSndBankData_FinalizeLoad` instead. Those notes are for bank saves, not a pilot-stream crash dump.
3. **`.kpkp` viseme count**, only for the cues that have a row. About `seconds * 20` mouth shapes. A mouth player that indexes that array without a clamp reads off the end when the line is longer than the viseme buffer. A line with no `.kpkp` row cannot crash in this file.

Replacing bytes inside `PACK` while keeping the cue name and the cue count is the safe case only when the byte length stays the same. A new length has to rebuild the audio offsets, rewrite `n_samples` (and the loop window), and rewrite the viseme count when that cue has a `.kpkp` entry.

The "too long and too short both crash" report matches a decoder that trusts the declared span. This session did not catch the faulting instruction. Do not treat `.kpkp` as the only cause: menu cues have no lipsync row and still live in the same `nus3audio`.

OB on-disk Amuro stream (the bank in this install is packed, the stream is loose):

```text
E:\OBHK0.3_v27\data\x64\091waveform\voice\pilot\vo_0001\VO_0001_P01_0_01_ST_01.nus3audio
```

---

## What is not claimed

- `sub_140685A90` was not decompiled in this session. IDA had no open database. Subcommand names inside that function are still unread.
- Individual SE channels `0`, `0x1`, `0x3`, `0x4`, `0x6` are distinguished from voice only by "their hash is not a situation id". No per-channel English name.
- Navi playback was not joined to a syscall.
- No in-game probe this session swapped one situation id, or shipped a one-variable longer and shorter waveform, to confirm the crash address.
- Situation ids still have no recovered source strings. `0x4C9A9D5B` is "the id Gundam `func_918` passes when main shot has ammo", not a printed enum name.

```text
H  hypothesis: sys_58(0x9, situationId) plays the current pilot pack's cue for that .vot situation, and a waveform whose byte length disagrees with ADOF, TONE n_samples, and (when present) the .kpkp viseme count faults the voice decoder
P  prediction: changing only the 0x9 immediate changes which shout plays and does not move the weapon SE; a longer or shorter replacement that also rewrites those three lengths plays without a fault
F  falsifier: the shout is unchanged while the SE changes; OR a length-consistent replacement still faults; OR a length-mismatched replacement plays to the end with no fault
```
