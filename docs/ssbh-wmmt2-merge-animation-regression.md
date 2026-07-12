# ssbh_lib wmmt2-merge animation regression

Date: 2026-07-12

## User-visible failure

Loading a Gyan NUANMB in the Unit Model Editor succeeded without parse errors, but the
rendered model separated into disconnected rigid parts. The same workflow appeared
correct when TAURI_PROJECT used the `wmmt2` branch of `ssbh_lib`.

Real assets used during investigation:

- motions: `E:\XB\解包\vs2\x64\003motion\001hito\001gundam\001gundam_005gyan00_001`
- skeleton: `E:\XB\mod\002chara\0x96C4D222\001gundam_005gyan00_001_body_normal__maya__.nusktb`

## What was ruled out

Decoded animation floats were compared before changing the renderer:

- 104 NUANMB files parsed by both branches were semantically identical;
- 97,320 transform frames and 973,512 scalar TRS components were compared;
- maximum absolute numeric difference was `0`;
- `wmmt2-merge` parsed all 106 Gyan clips, including two clips rejected by `wmmt2`.

IDA analysis also confirmed the EXVS2 Anim v1.2 timebase, sparse-property override bits,
and 33-key residual block behavior. The final viewport failure was therefore outside
the curve decoder.

## Root cause across the Rust/TypeScript boundary

The master merge changed `ssbh_data::skel_data::BoneData::transform` from a nested
matrix to `glam::Mat4`. Its derived serde JSON changed from `number[][]` to a flat
16-number array.

The preview path was:

```text
SkelData (Rust)
  -> serde_json::to_value in ssbh_preview.rs
  -> BoneJson.transform in TypeScript
  -> mat4FromSsbhColumns
  -> Three.js Skeleton.calculateInverses
```

`BoneJson.transform` still declared `number[][]`, and `mat4FromSsbhColumns` indexed the
flat numbers as `transform[column][row]`. Every lookup fell through to zero, producing
invalid rest and inverse-bind matrices. Activating motion made the bad bind pose visible
as an exploded model.

The earlier TransformFlags correction was necessary for sparse VS2 tracks, but it could
not repair this independent skeleton serialization failure.

## Fix

The fix is applied at both sides of the compatibility boundary:

1. `ssbh_lib` restores nested 4-by-4 serialization for `BoneData.transform` while
   accepting nested and flat forms during deserialization.
2. TAURI_PROJECT defines `SsbhMat4Json = number[] | number[][]` and
   `mat4FromSsbhColumns` accepts either representation.
3. Motion composition honors `TransformFlags`: an overridden channel uses the skeleton
   rest channel; a non-overridden channel uses the animation value.
4. TAURI_PROJECT depends on the Git `wmmt2-merge` branch for both `ssbh_data` and
   `ssbh_lib`.

## Verification

The real Gyan skeleton was exported by old `wmmt2` and fixed `wmmt2-merge`:

```text
bone count:        44 / 44
transform shape:   4x4 / 4x4
normalized bones:  exactly equal
```

Additional verification completed during the investigation:

- `ssbh_lib`: 403 passed, 2 ignored across 20 suites;
- TAURI Rust motion tests: 19 passed;
- `exvs2_json_cli_test`: 9 passed;
- Tauri debug `cargo build`: succeeded;
- Vite production bundle: succeeded;
- real Gyan limb translations remained at skeleton rest offsets while animation
  rotations changed;
- final visual confirmation by the user: Unit Model Editor playback no longer explodes.

## Operational note

Changes to the Rust dependency require fully stopping and restarting `tauri dev`; a
frontend hot reload alone does not rebuild or reload the backend library.

