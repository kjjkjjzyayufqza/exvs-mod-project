# Which file owns a unit's third-person camera placement

**Date:** 2026-09-20
**Question:** the game is third person, and every suit sits at a different
distance/height in front of the camera. Where is that configured? It is not in
the unit's `2.c`.
**Scope:** OB (`vsac27_Release.exe`) and the OB data set only.

## Verdict

`041cpm/<unit>/characterparam.bin`.

The camera-behind-the-unit placement is **six float fields of
characterparam**, read per unit and per characterparam **row**. `2.c` does not
hold any of them; the only thing an MSC script can do to the follow camera is
switch which characterparam row is active (`sys_1(0x60008, <rowId>)`), which
swaps the whole set at once.

| Hash | Canonical key | Axis | Role |
|---|---|---|---|
| `0x78C70D3F` | `target_relative_camera_height_near` | Y | height at horizontal target distance 0 |
| `0x51DD39F0` | `target_relative_camera_height_far` | Y | height at and beyond horizontal distance 130 |
| `0x82B967A9` | `target_relative_camera_height_high_elevation` | Y | height endpoint as the elevation blend saturates |
| `0xE1D56972` | `target_relative_camera_back_distance_normal_elevation` | Z (behind) | backward distance at the normal-elevation endpoint |
| `0xBC427D55` | `target_relative_camera_back_distance_high_elevation` | Z (behind) | backward distance at the high-elevation endpoint |
| `0x432ADAA1` | `camera_vertical_height_correction` | Y | subtracted from the vertical baseline of the target-aware placement branch |

The five curve fields share one consumer, `sub_140640230`, which builds a local
`(0, height, -back_distance)` vector, rotates it by the target-relative angles
and adds it to the camera anchor. `0x432ADAA1` belongs to the neighbouring
placement branch `sub_14063FD80`. Both derivations are already written up in
`2026-08-01-characterparam-target-relative-camera-curve.md` and
`2026-08-01-characterparam-camera-vertical-height-correction.md`; this note
adds the ownership answer and the disk evidence.

There is **no per-unit lateral (X) camera offset** in OB. The field that used to
carry the label `camera_offset_partner_x` (`0x5175F1DE`) is `0.0` in every
sampled row and its hash is absent from the OB image; it is now
`reserved_128`. The local offset vector the consumer builds has X fixed at 0,
so the "sideways" part of the shot comes from the yaw the consumer applies,
not from a parameter.

## Disk evidence (new, 2026-09-20)

Scanned every `characterparam.bin` under `E:\XB\mod\041cpm`: **26 units,
44 rows**. Script: `tmp/camera-owner/camera_param_scan.py` (reads the file with
the layout in `src-tauri/src/format/param_bin_format.rs`; kind 5 is f32).

Representative rows, default row `0x1B12AE7D` unless noted:

| Unit | row | height near | height far | height high-elev | back normal | back high |
|---|---|---|---|---|---|---|
| `016gundmw_001wgzero_001` | default | 8.60 | 5.30 | 3.00 | 43.00 | 14.00 |
| `018ggundm_001godgnd_001` | default | 5.40 | 4.20 | 4.00 | 42.00 | 15.00 |
| `001gundam_004zeong0_001` | default | 16.00 | 9.00 | 5.00 | 63.00 | 18.00 |
| `001gundam_004zeong0_001` | `0x6C159EEB` | 14.00 | 8.00 | 5.00 | 58.00 | 18.00 |
| `002zgundm_006hambrb_001` | default | 10.40 | 6.20 | 4.00 | 49.00 | 15.00 |
| `002zgundm_006hambrb_001` | `0x6C159EEB` | 16.00 | 9.00 | 4.00 | 54.00 | 15.00 |
| `058vlprgs_001overon_001` | default | 11.00 | 8.00 | 20.00 | 48.00 | 30.00 |
| `654gexvs2_003glfunl_001` | default | 30.00 | 25.00 | 4.00 | 420.00 | 15.00 |

Distinct values across the 44 rows:

| Field | distinct | observed range |
|---|---|---|
| `target_relative_camera_height_near` | 13 | 5.0 … 30.0 |
| `target_relative_camera_height_far` | 13 | 4.2 … 25.0 |
| `target_relative_camera_height_high_elevation` | 5 | 3.0 … 20.0 |
| `target_relative_camera_back_distance_normal_elevation` | 16 | 40.0 … 420.0 |
| `target_relative_camera_back_distance_high_elevation` | 6 | 9.0 … 30.0 |
| `camera_vertical_height_correction` | 1 | 0.0 in every sampled row |

Two facts fall out of the table:

1. **Per unit.** God Gundam sits at `5.40 / 42.00`; Zeong at `16.00 / 63.00`;
   the Gundam Legilis-class boss row at `30.00 / 420.00`. The spread tracks
   model size, which is exactly the "each suit is framed differently" the
   question describes.
2. **Per row, not per unit file.** Zeong and Hambrabi ship different camera
   values on their second row, and Hambrabi's second row is the MA form. The
   camera therefore follows a **transform**, because the transform is a
   characterparam row switch.

`camera_vertical_height_correction` is `0.0` in the whole OB sample. It is a
real consumer (proven in `sub_14063FD80`), but no shipped unit uses it, so it
is a free knob rather than something to copy from another suit.

## What an MSC script can and cannot do

`2.c` never writes a camera field. What it can do is select the row:

```
sys_1(0x60008, 0x1B12AE7D)   // default row
sys_1(0x60008, 0xF51CCF51)   // alternate row (transform / buff state)
```

Row ids seen in the OB sample: `0x1B12AE7D` (default, 25 of 26 units),
`0x6C159EEB`, `0xF51CCF51`, `0x0ADC2880`. The two Wing Zero Rebellion packs use
`0x0ADC2880` as their only row. Existing MSC write-ups that swap
`0x1B12AE7D ↔ 0xF51CCF51` for a transform (Sinanju, Delta Kai, Gyan) are
therefore also swapping the camera framing, whether or not that was intended.

So the initial camera at battle start is the camera block of **whichever row is
active on the first frame**, which for every shipped unit is the default row.

## Adjacent files that are NOT the answer

| File | What it really is |
|---|---|
| `002chara/000common_000common_001/camera/parameters/{00system,01waza,02winlose,03cpubattle}.vgsht2` | 220-byte **clip** rows keyed by a clip hash that `sys_53(0x4, hash)` looks up — win/lose, waza and cut-in cameras, not the follow camera. See `docs/msc-research/camera-clip-bst-loader.md`. |
| `002chara/000common_000common_001/camera/battle/big.nuanmb`, `camera_motion.nusktb` | The menu / god-camera skeleton and its animation. Menu path, not battle. |
| `002chara/000common_000common_001/camera/stage_intro/stage_intro_camera_group.bin` | 362 bytes, magic `89 8C 96 9C`. Two ascending hash-key groups (18 and 19 keys, matching the `0x12` / `0x13` counts in the header) plus an 18-entry id table stepping by 3 from `0x134`. It is a stage-intro grouping table; it holds no camera geometry and no unit ids. Structure measured on disk; the meaning of the id table is **not** proven. |
| `012list/stage_list` | Per-stage rows. Carries no camera fields. |
| `051mission/*/*.c` | Mission scripts. `sys_0(0x400, ...)` carries a spawn position and a facing angle, which decide where the camera *starts looking from* on the first frame, but not the offset itself. |

## Confidence boundary

* E1 (disk, this session): the six fields exist per unit and per row, their
  values vary as tabulated, and `camera_vertical_height_correction` is `0.0`
  across the whole OB sample.
* E2 (prior OB IDA sessions, recorded in this repo): the getters, the single
  shared consumer `sub_140640230`, the blend thresholds (elevation 15°…80°,
  horizontal distance 0…130) and the local `(0, height, -back)` vector.
* Not proven: the name of the runtime state that selects this camera routine
  over the others, and whether any game mode reads a different block. The keys
  stay `target_relative_camera_*` for that reason, and this note does not claim
  they are the only camera the battle can run.
* Not tested in game: no value was edited and re-run. Changing
  `target_relative_camera_back_distance_normal_elevation` on one unit is the
  cheapest single-variable confirmation if an in-game check is wanted.
