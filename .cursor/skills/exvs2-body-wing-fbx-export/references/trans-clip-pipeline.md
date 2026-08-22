# trans_start / trans_end / trans_loop

Three composed scenes. Each still split-exports body + wing.

## Proven directory

```text
D:\output\exvs2\wing_gundam_zero_rebellion\motion\
  trans_start.blend
  trans_end.blend
  trans_loop.blend
```

If those files exist, **open the matching blend** then export. Do not rebuild from a dirty live scene.

## trans_start

User-authored enter clip. Body and wing each have their own Action.

Export:

```text
001hito_016gundmw_001wgzero_001_body_<clip>_out.fbx
410wzerowing_016gundmw_001wgzero_001_wing00_<clip>_out.fbx
```

Proven from_gwtv body was 1–24. Wing guardbgn was 1–20. Mismatched lengths are allowed.

## trans_end

Reverse of `trans_start` in time. Same bones, same values, reversed frames.

Script helper: `make_reversed_action(arm, "ZeroEW_Body_trans_end")` then the wing equivalent.

Procedure:

1. Open `trans_start.blend` (or the live start scene).
2. For body and wing, reverse the current Action into a new Action. Do not edit keys by hand.
3. Save as `trans_end.blend`.
4. `export_pair` with `..._trans_end_out.fbx` names.

Proven: body 1–24, wing 1–20, sizes matched the corresponding start/from_gwtv files (same skeleton, similar channel count).

## trans_loop

Hold the **last pose** of `trans_start` for 60 frames at 60 fps. Every frame is that last pose (constant interpolation).

Script helper: `make_hold_last_frame_action(arm, "ZeroEW_Body_60fps_lastframe", frame_end=60, fps=60)`.

Procedure:

1. Open `trans_start.blend`.
2. Set scene fps to 60.
3. Build hold actions on body and wing from the last key of start.
4. Save as `trans_loop.blend` (objects may become `ZeroEW_Body.001` — marker bones still work).
5. `export_pair` with `..._trans_loop_out.fbx` names.

Proven: both 1–60. Body 942732 bytes, wing 632220 bytes (larger than 24-frame files because of 60 keys).

## Export after generation

```python
export_blend(
    blend_path=r"D:\output\exvs2\wing_gundam_zero_rebellion\motion\trans_end.blend",
    out_dir=r"D:\output\exvs2\wing_gundam_zero_rebellion\motion",
    body_filename="001hito_016gundmw_001wgzero_001_body_trans_end_out.fbx",
    wing_filename="410wzerowing_016gundmw_001wgzero_001_wing00_trans_end_out.fbx",
)
```

Same for `trans_loop.blend` / `..._trans_loop_out.fbx`.
